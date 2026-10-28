/* 卡冈图雅 — GLSL 着色器源码（GLSL ES 1.00，兼容 WebGL1 / WebGL2）
 *
 * 核心思路：从相机沿每个像素发出光线，在施瓦西时空中按零测地线方程
 *   d²x/dλ² = -(3/2) · rs · h² · x / r⁵      (h = |x × v| 为守恒角动量)
 * 数值积分（半隐式欧拉），得到引力透镜弯曲后的光线路径：
 *   - 光线落入事件视界 → 黑洞阴影
 * - 穿越赤道面 → 命中薄吸积盘（温度梯度 + 湍流条纹 + 多普勒集束）
 *   - 逃逸 → 用弯曲后的方向采样程序化星空/星云
 * 吸积盘的引力透镜像（黑洞上方/下方的弧）由积分自然产生。
 */
"use strict";

const BHShaders = (function () {

  /* 全屏三角形顶点着色器（aPos 在裁剪空间） */
  const vertex = [
    "attribute vec2 aPos;",
    "varying vec2 vUv;",
    "void main() {",
    "  vUv = (aPos + 1.0) * 0.5;",
    "  gl_Position = vec4(aPos, 0.0, 1.0);",
    "}"
  ].join("\n");

  /* ============ 黑洞主着色器（HDR 输出） ============ */
  const bh = `
precision highp float;

varying vec2 vUv;

uniform float uTime;
uniform vec3  uCamPos;
uniform vec3  uCamRight;
uniform vec3  uCamUp;
uniform vec3  uCamFwd;
uniform float uTanFov;
uniform float uAspect;

uniform float uRs;          /* 施瓦西半径（场景单位） */
uniform float uLens;        /* 透镜强度（艺术系数，1 = 物理） */
uniform float uDiskIn;      /* 吸积盘内半径 */
uniform float uDiskOut;     /* 吸积盘外半径 */
uniform float uDiskBright;  /* 盘亮度 */
uniform float uDiskTemp;    /* 盘色温 */
uniform float uDiskOpacity; /* 盘不透明度 */
uniform float uDiskSpeed;   /* 盘旋转速度 */
uniform float uDoppler;     /* 多普勒集束强度（0 = 电影式对称） */
uniform float uStarDensity; /* 星星密度 */
uniform float uStarBright;  /* 星星亮度 */
uniform float uNebula;      /* 星云强度 */
uniform float uEsc;         /* 逃逸半径 */
uniform int   uSteps;       /* 积分步数 */

const int MAX_STEPS = 384;

/* ---------- 哈希与噪声 ---------- */
float hash12(vec2 p) {
  vec3 p3 = fract(vec3(p.xyx) * 0.1031);
  p3 += dot(p3, p3.yzx + 33.33);
  return fract((p3.x + p3.y) * p3.z);
}
float hash13(vec3 p3) {
  p3 = fract(p3 * 0.1031);
  p3 += dot(p3, p3.zyx + 31.32);
  return fract((p3.x + p3.y) * p3.z);
}
vec3 hash33(vec3 p3) {
  p3 = fract(p3 * vec3(0.1031, 0.1030, 0.0973));
  p3 += dot(p3, p3.yxz + 33.33);
  return fract((p3.xxy + p3.yxx) * p3.zyx);
}
float noise2(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  return mix(
    mix(hash12(i), hash12(i + vec2(1.0, 0.0)), f.x),
    mix(hash12(i + vec2(0.0, 1.0)), hash12(i + vec2(1.0, 1.0)), f.x),
    f.y);
}
float noise3(vec3 p) {
  vec3 i = floor(p);
  vec3 f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  float n000 = hash13(i);
  float n100 = hash13(i + vec3(1.0, 0.0, 0.0));
  float n010 = hash13(i + vec3(0.0, 1.0, 0.0));
  float n110 = hash13(i + vec3(1.0, 1.0, 0.0));
  float n001 = hash13(i + vec3(0.0, 0.0, 1.0));
  float n101 = hash13(i + vec3(1.0, 0.0, 1.0));
  float n011 = hash13(i + vec3(0.0, 1.0, 1.0));
  float n111 = hash13(i + vec3(1.0, 1.0, 1.0));
  return mix(
    mix(mix(n000, n100, f.x), mix(n010, n110, f.x), f.y),
    mix(mix(n001, n101, f.x), mix(n011, n111, f.x), f.y),
    f.z);
}
float fbm3(vec3 p) {
  float s = 0.0;
  float a = 0.5;
  for (int i = 0; i < 4; i++) {
    s += a * noise3(p);
    p = p * 2.03 + vec3(11.31, 7.77, 5.31);
    a *= 0.5;
  }
  return s;
}

/* ---------- 吸积盘 ---------- */
/* 艺术化黑体色带：t 由温度决定，0 深红 → 1 白热 → 1.5 偏蓝 */
vec3 blackbodyRamp(float t) {
  vec3 c = mix(vec3(0.55, 0.08, 0.01), vec3(1.0, 0.32, 0.05), smoothstep(0.0, 0.3, t));
  c = mix(c, vec3(1.0, 0.62, 0.25), smoothstep(0.3, 0.6, t));
  c = mix(c, vec3(1.0, 0.90, 0.70), smoothstep(0.6, 0.9, t));
  c = mix(c, vec3(1.0, 0.98, 0.95), smoothstep(0.9, 1.15, t));
  c = mix(c, vec3(0.78, 0.88, 1.0), smoothstep(1.15, 1.5, t));
  return c;
}

/* hp: 光线与赤道面交点; vel: 当前光线速度; 返回 (发光颜色, 不透明度) */
vec4 diskShade(vec3 hp, vec3 vel) {
  float din  = max(uDiskIn, uRs * 1.15);
  float dout = max(uDiskOut, din + 1.0);
  float r = length(hp.xz);
  if (r < din || r > dout) return vec4(0.0);

  float phi = atan(hp.z, hp.x);
  /* 开普勒较差自转：图样随物质共同旋转，随时间被剪切拉成条纹 */
  float w = 0.55 * uDiskSpeed * pow(din / r, 1.5);
  float phiS = phi + uTime * w;
  float cs = cos(phiS);
  float sn = sin(phiS);

  /* 沿方位角拉长的湍流（用 cos/sin 保证 φ 环绕无缝） */
  float turb = fbm3(vec3(cs * 1.35, sn * 1.35, r * 2.4));
  float rings = noise2(vec2(r * 15.0 + turb * 2.5, 2.7));
  float density = 0.42 + 0.62 * (turb - 0.5) + 0.5 * (rings - 0.5);
  density = clamp(density, 0.0, 1.6);

  float wSpan = dout - din;
  float edgeIn  = smoothstep(din, din + 0.05 * wSpan + 0.12, r);
  float edgeOut = 1.0 - smoothstep(dout - 0.45 * wSpan, dout, r);
  float rad = pow(din / r, 2.0);          /* 薄盘径向亮度轮廓 */

  /* 引力红移（内缘更暗更红） */
  float grav = sqrt(clamp(1.0 - uRs / max(r, uRs * 1.02), 0.0, 1.0));

  /* 相对论多普勒集束（电影为观感对称，默认关闭） */
  float beta = clamp(sqrt(uRs / (2.0 * max(r, uRs))), 0.0, 0.72);
  vec3 tang = normalize(vec3(hp.z, 0.0, -hp.x));   /* 圆轨道切向 */
  float mu = dot(tang, -normalize(vel));           /* 与射向观测者光子的夹角 */
  float gam = inversesqrt(max(1.0 - beta * beta, 1e-4));
  float dop = 1.0 / (gam * (1.0 - beta * mu));     /* >1 蓝移增亮 */
  float beam = mix(1.0, pow(dop, 3.5), uDoppler);

  float T = uDiskTemp * pow(din / r, 0.75) * (0.55 + 0.45 * grav);
  T *= mix(1.0, dop, uDoppler);                    /* 多普勒色偏 */

  vec3 col = blackbodyRamp(clamp(T, 0.0, 1.6));
  vec3 emit = col * (density * rad * edgeIn * edgeOut * beam *
                     (0.35 + 0.65 * grav) * uDiskBright * 4.0);
  float alpha = clamp(density * uDiskOpacity * edgeIn * (0.25 + 0.75 * edgeOut) * 1.5, 0.0, 1.0);
  return vec4(emit, alpha);
}

/* ---------- 星空 ---------- */
vec3 starfield(vec3 d) {
  vec3 col = vec3(0.0);

  /* 银河带 + 暗星云 */
  vec3 bandN = normalize(vec3(0.32, 0.9, 0.28));
  float bd = dot(d, bandN);
  float band = exp(-bd * bd * 5.5);
  float neb = fbm3(d * 3.2);
  float neb2 = fbm3(d * 8.5 + 17.3);
  vec3 nebCol = mix(vec3(0.10, 0.14, 0.26), vec3(0.30, 0.18, 0.12), neb2);
  col += nebCol * band * (neb * 1.1 + 0.15) * uNebula * 0.6;
  col += vec3(0.010, 0.013, 0.020) * (0.35 + 0.65 * neb) * uNebula;

  /* 两层程序化星场（单元格哈希点星） */
  float dens = clamp(uStarDensity, 0.0, 2.0);
  for (int L = 0; L < 2; L++) {
    float S = (L == 0) ? 85.0 : 240.0;
    vec3 p = d * S;
    vec3 id = floor(p);
    vec3 h = hash33(id);
    vec3 sp = id + 0.5 + (h - 0.5) * 0.82;
    vec3 dd = p - sp;
    float d2 = dot(dd, dd);

    float gate = step(0.88 - 0.55 * dens, h.y);
    float b = pow(hash13(id + 19.19), 10.0) * 16.0 + 0.05;
    float sharp = (L == 0) ? 60.0 : 16.0;
    float star = exp(-d2 * sharp) * b * gate;
    float tw = 0.82 + 0.18 * sin(uTime * (1.5 + 3.0 * h.x) + h.z * 6.2831);
    vec3 tint = mix(vec3(1.0, 0.82, 0.62), vec3(0.72, 0.82, 1.0), h.z);
    col += tint * (star * tw * uStarBright);
  }
  return col;
}

/* ---------- 主函数：测地线积分 ---------- */
void main() {
  vec2 ndc = vUv * 2.0 - 1.0;
  vec3 rd = normalize(uCamFwd + uTanFov * (ndc.x * uAspect * uCamRight + ndc.y * uCamUp));

  vec3 pos = uCamPos;
  vec3 vel = rd;
  vec3 hv = cross(pos, vel);
  float h2 = dot(hv, hv);          /* 守恒角动量平方 */

  vec3 col = vec3(0.0);
  float atten = 1.0;               /* 透过率（吸积盘半透明累积） */
  float captured = 0.0;
  float escaped = 0.0;
  float rs = max(uRs, 0.05);
  float horizon2 = rs * rs;
  float escR2 = uEsc * uEsc;

  for (int i = 0; i < MAX_STEPS; i++) {
    if (i >= uSteps) break;
    float r2 = dot(pos, pos);
    if (r2 < horizon2) { captured = 1.0; break; }
    if (r2 > escR2 && dot(pos, vel) > 0.0) { escaped = 1.0; break; }

    float r = sqrt(r2);
    float dt = max(0.045, (r - 0.9 * rs) * 0.1);   /* 自适应步长 */

    vec3 acc = (-1.5 * h2 * uLens * rs / (r2 * r2 * r)) * pos;
    vel += acc * dt;
    vec3 npos = pos + vel * dt;

    /* 薄吸积盘：检测赤道面穿越 */
    if (pos.y * npos.y < 0.0) {
      float t = pos.y / (pos.y - npos.y);
      vec3 hp = mix(pos, npos, t);
      vec4 dc = diskShade(hp, vel);
      if (dc.w > 0.0) {
        col += dc.rgb * dc.w * atten;
        atten *= (1.0 - dc.w);
        if (atten < 0.015) { captured = 1.0; break; }
      }
    }
    pos = npos;
  }

  if (captured < 0.5) {
    if (escaped > 0.5 || dot(pos, pos) >= 6.25 * horizon2) {
      col += starfield(normalize(vel)) * atten;
    }
    /* 步数耗尽且仍缠绕在视界附近 → 视为被捕获（阴影） */
  }

  gl_FragColor = vec4(col, 1.0);
}
`;

  /* ============ 泛光：亮部提取 ============ */
  const bright = `
precision highp float;
varying vec2 vUv;
uniform sampler2D tSrc;
uniform float uThresh;
void main() {
  vec3 c = texture2D(tSrc, vUv).rgb;
  float l = max(c.r, max(c.g, c.b));
  float k = max(l - uThresh, 0.0) / max(l, 1e-4);
  gl_FragColor = vec4(c * k, 1.0);
}
`;

  /* ============ 泛光：可分离高斯模糊 ============ */
  const blur = `
precision highp float;
varying vec2 vUv;
uniform sampler2D tSrc;
uniform vec2 uDir;
void main() {
  vec3 s = texture2D(tSrc, vUv).rgb * 0.227027;
  s += (texture2D(tSrc, vUv + uDir * 1.3846).rgb +
        texture2D(tSrc, vUv - uDir * 1.3846).rgb) * 0.3162162;
  s += (texture2D(tSrc, vUv + uDir * 3.2308).rgb +
        texture2D(tSrc, vUv - uDir * 3.2308).rgb) * 0.0702703;
  gl_FragColor = vec4(s, 1.0);
}
`;

  /* ============ 合成：泛光叠加 + ACES 色调映射 + 暗角 + 抖动 ============ */
  const composite = `
precision highp float;
varying vec2 vUv;
uniform sampler2D tScene;
uniform sampler2D tBloom;
uniform float uBloomStr;
uniform float uExposure;
uniform float uTime;
uniform vec2 uRes;

float hash12(vec2 p) {
  vec3 p3 = fract(vec3(p.xyx) * 0.1031);
  p3 += dot(p3, p3.yzx + 33.33);
  return fract((p3.x + p3.y) * p3.z);
}
vec3 aces(vec3 x) {
  return clamp((x * (2.51 * x + 0.03)) / (x * (2.43 * x + 0.59) + 0.14), 0.0, 1.0);
}
void main() {
  vec3 c = texture2D(tScene, vUv).rgb;
  vec3 b = texture2D(tBloom, vUv).rgb;
  /* 轻微水平辉光：模拟电影的变形宽银幕镜头 */
  vec3 streak = texture2D(tBloom, vUv + vec2(0.012, 0.0)).rgb
              + texture2D(tBloom, vUv - vec2(0.012, 0.0)).rgb;
  c += (b + 0.35 * streak) * uBloomStr;

  c *= uExposure;
  c = aces(c);

  vec2 q = vUv - 0.5;
  c *= 1.0 - 0.30 * dot(q, q);            /* 暗角 */
  c = pow(c, vec3(1.0 / 2.2));            /* 伽马 */
  c += (hash12(vUv * uRes + fract(uTime * 13.7)) - 0.5) / 255.0;  /* 去色带抖动 */
  gl_FragColor = vec4(c, 1.0);
}
`;

  return { vertex, bh, bright, blur, composite };
})();

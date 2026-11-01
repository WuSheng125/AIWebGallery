/* =============================================================================
 *  GARGANTUA — 《星际穿越》风格黑洞实时渲染
 *  js/shaders.js  ·  全部 GLSL 着色器源码（WebGL2 / GLSL ES 3.00）
 *
 *  物理约定（几何单位 G = c = 1）：
 *      史瓦西半径  rs = 1      ⇒  M = 0.5
 *      视界        r  = 1 rs
 *      光子球      r  = 1.5 rs
 *      最内稳定圆轨道 ISCO = 3 rs（史瓦西）
 *  零测地线的笛卡尔形式（由 Binet 方程 u'' + u = 3M u² 推出，精确解）：
 *      d²r⃗/dλ² = −(3/2)·rs·h²·r⃗ / r⁵ ,   h = |r⃗ × dr⃗/dλ| 守恒
 * ========================================================================== */
(function (global) {
  'use strict';

  var BH = global.BH || (global.BH = {});

  /* ---------------------------------------------------------------- 顶点着色器 */
  // 全屏三角形，无 varying，片元阶段直接用 gl_FragCoord
  var QUAD_VS = `#version 300 es
precision highp float;
in vec2 aPos;
void main() {
  gl_Position = vec4(aPos, 0.0, 1.0);
}
`;

  /* ------------------------------------------------------------ 黑洞主渲染通道 */
  var BLACKHOLE_FS = `#version 300 es
precision highp float;
precision highp int;

out vec4 outColor;

uniform vec2  uRes;        // 渲染分辨率（像素）
uniform vec2  uJitter;     // 亚像素抖动 [-0.5,0.5]，用于渐进式抗锯齿
uniform float uTime;       // 秒
uniform vec3  uCamPos;     // 相机位置（rs 单位）
uniform mat3  uCamMat;     // 列 = (right, up, forward)
uniform float uTanHalf;    // tan(fov/2)
uniform float uAspect;
uniform int   uSteps;      // 每条光线的最大积分步数
uniform float uEscape;     // 逃逸半径：越过且向外 ⇒ 采样星空

// —— 时空 ——
uniform float uLens;       // 引力透镜强度（1 = 真实广义相对论，0 = 平直时空）
uniform float uDrag;       // 近似参考系拖曳（艺术近似，非严格克尔）

// —— 吸积盘 ——
uniform float uDiskOn;
uniform float uDiskIn;
uniform float uDiskOut;
uniform float uDiskBright;
uniform float uDiskTemp;
uniform float uDiskTurb;
uniform float uDiskRot;
uniform float uDiskOpacity;
uniform float uDiskThick;

// —— 相对论效应 ——
uniform float uDoppler;    // 多普勒集束强度（电影中诺兰刻意关掉了它）
uniform float uRedshift;   // 引力红移强度
uniform float uRing;       // 高阶像（光子环）艺术增强

// —— 天空 ——
uniform float uStars;
uniform float uStarBright;
uniform float uNebula;

// ============================================================ 噪声 / 哈希
float hash13(vec3 p) {
  p = fract(p * 0.3183099 + vec3(0.1, 0.2, 0.3));
  p *= 17.0;
  return fract(p.x * p.y * p.z * (p.x + p.y + p.z));
}

vec3 hash33(vec3 p) {
  p = fract(p * vec3(0.1031, 0.1030, 0.0973));
  p += dot(p, p.yxz + 33.33);
  return fract((p.xxy + p.yxx) * p.zyx);
}

float vnoise(vec3 p) {
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
  return mix(mix(mix(n000, n100, f.x), mix(n010, n110, f.x), f.y),
             mix(mix(n001, n101, f.x), mix(n011, n111, f.x), f.y), f.z);
}

float fbm3(vec3 p) {
  return 0.55 * vnoise(p) + 0.28 * vnoise(p * 2.03 + 11.7) + 0.17 * vnoise(p * 4.07 + 3.1);
}

// ============================================================ 黑体色温 → RGB
// 经典 Tanner Helland / Mitchell Charity 数据拟合
vec3 kelvin2rgb(float k) {
  k = clamp(k, 1000.0, 40000.0) * 0.01;      // t = K/100
  float r, g, b;
  if (k <= 66.0) {
    r = 255.0;
  } else {
    r = 329.698727446 * pow(k - 60.0, -0.1332047592);
  }
  if (k <= 66.0) {
    g = 99.4708025861 * log(k) - 161.1195681661;
  } else {
    g = 288.1221695283 * pow(k - 60.0, -0.0755148492);
  }
  if (k >= 66.0) {
    b = 255.0;
  } else if (k <= 19.0) {
    b = 0.0;
  } else {
    b = 138.5177312231 * log(k - 10.0) - 305.0447927307;
  }
  return clamp(vec3(r, g, b) * (1.0 / 255.0), 0.0, 1.0);
}

// ============================================================ 星空
// 单位球面上的“每格一颗候选星”，星心被限制在格心附近，避免跨格被裁切
float starLayer(vec3 dir, float scale, float keep, float seed) {
  vec3 p = dir * scale + seed;
  vec3 id = floor(p);
  vec3 f = p - id;
  float m = hash13(id + seed);
  if (m > keep) return 0.0;
  vec3  c    = 0.18 + 0.64 * hash33(id + 5.7 + seed);   // 星心（远离格边界）
  float mag  = hash13(id + 13.1 + seed);
  float size = mix(0.035, 0.13, mag * mag);
  float d    = length(f - c);
  if (d > size * 4.0) return 0.0;
  float core = pow(max(0.0, 1.0 - d / size), 6.0);
  float halo = 0.16 * pow(max(0.0, 1.0 - d / (size * 4.0)), 3.0);
  return (core + halo) * mix(0.12, 1.0, mag * mag * mag);
}

vec3 skyColor(vec3 d) {
  vec3 col = vec3(0.0);

  // —— 恒星 ——
  if (uStarBright > 0.001) {
    float k1 = clamp(0.085 * uStars, 0.0, 0.60);
    float k2 = clamp(0.050 * uStars, 0.0, 0.45);
    float s1 = starLayer(d,  52.0, k1, 0.0);
    float s2 = starLayer(d, 121.0, k2, 37.0);
    float s3 = starLayer(d, 233.0, k2 * 0.8, 91.0);
    // 恒星色温：多数偏白蓝，少量暖橙
    float tint = hash13(floor(d * 52.0));
    vec3  sc   = mix(vec3(0.72, 0.83, 1.0), vec3(1.0, 0.82, 0.58), tint * tint);
    col += sc * (s1 + 0.75 * s2 + 0.45 * s3) * uStarBright * 1.6;
  }

  // —— 星云 / 尘埃带 ——
  if (uNebula > 0.001) {
    float n  = fbm3(d * 2.1 + 4.0);
    float n2 = fbm3(d * 5.3 - 2.0);
    float band = exp(-pow(abs(dot(d, normalize(vec3(0.35, 0.86, -0.37)))) * 2.6, 2.0));
    float amt = smoothstep(0.32, 0.95, n) * (0.35 + 0.9 * band);
    vec3  cool = mix(vec3(0.020, 0.032, 0.075), vec3(0.10, 0.075, 0.20), n2);
    vec3  warm = vec3(0.075, 0.055, 0.040) * band;
    col += (cool * amt + warm * (0.4 + 0.6 * n2)) * uNebula * 0.9;
    col += vec3(0.006, 0.008, 0.016) * uNebula;   // 极暗底噪，避免纯黑死板
  }
  return col;
}

// ============================================================ 吸积盘辐射
// 返回该次穿越的自发光（HDR，可 > 1），并给出不透明度
vec3 diskEmission(vec3 p, float rr, vec3 marchDir, float crossIdx) {
  // ---- Shakura–Sunyaev 薄盘温度剖面  T ∝ r^{-3/4} (1 - sqrt(r_in/r))^{1/4}
  float x     = clamp(uDiskIn / max(rr, 1e-3), 0.0, 1.0);
  float tprof = pow(x, 0.75) * pow(max(0.0, 1.0 - sqrt(x)), 0.25) * (1.0 / 0.4881);

  // ---- 湍流：随开普勒角速度 Ω ∝ r^{-3/2} 剪切演化
  float turb = 1.0;
  if (uDiskTurb > 0.001) {
    float phi   = atan(p.z, p.x);
    float omega = pow(max(rr, 1.0), -1.5);
    float a     = phi - omega * uTime * uDiskRot * 5.0;
    vec3  q     = vec3(cos(a), sin(a), 0.0) * 6.0 + vec3(0.0, 0.0, rr * 1.15);
    float t1    = fbm3(q * 1.35);
    float t2    = vnoise(q * 4.5 + 9.0);
    turb        = mix(1.0, (0.30 + 1.75 * t1) * (0.72 + 0.55 * t2), clamp(uDiskTurb, 0.0, 2.0) * 0.5);
    turb        = max(turb, 0.0);
  }

  float temp = 7000.0 * uDiskTemp * max(tprof, 0.02);

  // ---- 相对论修正因子 g = ν_obs / ν_em ----
  //  多普勒：静态观者测得圆轨道速度 v = sqrt(M/r)/sqrt(1-2M/r)   (M = 0.5 rs)
  vec3  orbitDir = normalize(cross(vec3(0.0, 1.0, 0.0), p) + vec3(1e-6));
  float v    = min(sqrt(0.5 / max(rr, 1.05)) / sqrt(max(1.0 - 1.0 / max(rr, 1.05), 1e-3)), 0.95);
  vec3  nObs = -marchDir;                        // 由发光点指向观测者（反向光线追迹）
  float bcos = dot(orbitDir, nObs);
  float dopp = sqrt(max(1.0 - v * v, 1e-6)) / max(1.0 - v * bcos, 1e-3);
  //  引力红移
  float grav = sqrt(max(0.0, 1.0 - 1.0 / max(rr, 1.02)));

  float g = mix(1.0, clamp(dopp, 0.05, 6.0), clamp(uDoppler, 0.0, 1.0))
          * mix(1.0, grav, clamp(uRedshift, 0.0, 1.0));

  // ---- 颜色（被 g 平移的色温）与亮度（I ∝ g⁴ 且 ∝ T⁴）----
  float Tobs = temp * g;
  vec3  col  = kelvin2rgb(Tobs);
  float sb   = pow(Tobs / 7000.0, 3.0);          // 略softened的斯特凡–玻尔兹曼

  // ---- 几何边缘柔化 ----
  float edge = smoothstep(uDiskIn, uDiskIn * 1.08, rr)
             * (1.0 - smoothstep(uDiskOut * 0.80, uDiskOut, rr));

  // ---- 掠射增厚：视线越贴盘面，穿过的发光层越厚 ----
  float incidence = max(abs(nObs.y), 0.02);
  float graze     = mix(1.0, clamp(0.55 / incidence, 1.0, 4.5), clamp(uDiskThick, 0.0, 3.0) * 0.5);

  // ---- 高阶像（光子环）艺术增强 ----
  float ring = 1.0 + uRing * (crossIdx - 1.0) * 0.35;

  return col * (sb * 2.6 * uDiskBright * turb * edge * graze * ring);
}

// ============================================================ 加速度（测地线右端）
vec3 geodesicAccel(vec3 pos, float r2, float h2) {
  float r5 = r2 * r2 * sqrt(r2);                 // r⁵
  vec3  a  = -1.5 * uLens * h2 * pos / max(r5, 1e-6);
  if (uDrag > 0.0001) {                          // 近似 Lense–Thirring 拖曳
    a += uDrag * 1.5 * h2 * cross(vec3(0.0, 1.0, 0.0), pos) / max(r5, 1e-6);
  }
  return a;
}

// ============================================================ 主函数
void main() {
  vec2 frag = gl_FragCoord.xy + uJitter;
  vec2 ndc  = (frag / uRes) * 2.0 - 1.0;

  vec3 dirCam = uCamMat * vec3(ndc.x * uAspect * uTanHalf, ndc.y * uTanHalf, 1.0);
  vec3 dir    = normalize(dirCam);
  vec3 pos    = uCamPos;

  // 守恒角动量平方（我们沿反方向追迹，取模即可）
  vec3  L  = cross(pos, dir);
  float h2 = dot(L, L);

  vec3  color       = vec3(0.0);
  float transmit    = 1.0;     // 剩余透射率（前→后合成）
  bool  captured    = false;
  bool  escaped     = false;
  float crossIdx    = 0.0;

  for (int i = 0; i < uSteps; i++) {
    float r2 = dot(pos, pos);
    float r  = sqrt(r2);

    // 视界 / 光子球内且向内 ⇒ 必然被吞
    if (r < 1.5 && dot(pos, dir) < 0.0) { captured = true; break; }
    if (r < 1.0) { captured = true; break; }
    if (r > uEscape && dot(pos, dir) > 0.0) { escaped = true; break; }

    // 自适应步长：远场/向外时放大，靠近视界时收紧
    float dt;
    if (dot(pos, dir) > 0.0 && r > 2.0) dt = min(0.30 * r, 8.0);
    else                                dt = min(0.075 * r, 1.5);
    dt = max(dt, 0.01);

    // 中点法（RK2）
    vec3 a1   = geodesicAccel(pos, r2, h2);
    vec3 posM = pos + dir * (dt * 0.5);
    vec3 dirM = dir + a1 * (dt * 0.5);
    float r2m = dot(posM, posM);
    vec3 a2   = geodesicAccel(posM, r2m, h2);

    vec3 prevPos = pos;
    vec3 prevDir = dir;
    pos = pos + dirM * dt;
    dir = dir + a2 * dt;

    // ---- 赤道面（y = 0）穿越检测 → 吸积盘 ----
    if (uDiskOn > 0.5 && prevPos.y * pos.y < 0.0) {
      float t   = prevPos.y / (prevPos.y - pos.y);          // 线性插值参数
      vec3  hit = mix(prevPos, pos, t);
      float rr  = length(hit);
      if (rr > uDiskIn && rr < uDiskOut) {
        crossIdx += 1.0;
        vec3 hitDir = normalize(mix(prevDir, dir, t));
        vec3 em     = diskEmission(hit, rr, hitDir, crossIdx);
        float alpha = clamp(uDiskOpacity, 0.0, 1.0);
        color    += transmit * em;
        transmit *= (1.0 - alpha);
        if (transmit < 0.004) break;
      }
    }
  }

  if (!captured && (escaped || transmit > 0.004)) {
    // 逃逸方向即背景天球方向 —— 星空因此自动被引力透镜拉伸/成环
    color += transmit * skyColor(normalize(dir));
  }

  outColor = vec4(color, 1.0);
}
`;

  /* ------------------------------------------------------------ 亮度提取 / 降采样 */
  var BRIGHT_FS = `#version 300 es
precision highp float;
out vec4 outColor;
uniform sampler2D uTex;
uniform vec2  uRes;        // 目标分辨率
uniform float uSamples;    // 累积样本数
uniform float uThreshold;
uniform float uKnee;
void main() {
  vec2 uv = gl_FragCoord.xy / uRes;
  // 4 抽头盒式下采样（同时完成 1/2 降采样）
  vec3 c = texture(uTex, uv).rgb * 0.25;
  c += texture(uTex, uv + vec2( 1.0,  1.0) / uRes * 0.5).rgb * 0.25;
  c += texture(uTex, uv + vec2(-1.0,  1.0) / uRes * 0.5).rgb * 0.25;
  c += texture(uTex, uv + vec2( 1.0, -1.0) / uRes * 0.5).rgb * 0.25;
  c /= max(uSamples, 1.0);
  float lum = dot(c, vec3(0.2126, 0.7152, 0.0722));
  float w   = smoothstep(uThreshold, uThreshold + uKnee, lum);
  outColor  = vec4(c * w, 1.0);
}
`;

  /* ------------------------------------------------------------ 可分离高斯模糊 */
  var BLUR_FS = `#version 300 es
precision highp float;
out vec4 outColor;
uniform sampler2D uTex;
uniform vec2 uRes;
uniform vec2 uDir;        // 像素步长方向
void main() {
  vec2 uv = gl_FragCoord.xy / uRes;
  vec2 st = uDir / uRes;
  // 9 抽头高斯（利用线性采样等效 17 抽头）
  vec3 c = texture(uTex, uv).rgb * 0.2270270270;
  c += (texture(uTex, uv + st * 1.3846153846).rgb + texture(uTex, uv - st * 1.3846153846).rgb) * 0.3162162162;
  c += (texture(uTex, uv + st * 3.2307692308).rgb + texture(uTex, uv - st * 3.2307692308).rgb) * 0.0702702703;
  outColor = vec4(c, 1.0);
}
`;

  /* ------------------------------------------------------------ 合成 / 色调映射 */
  var COMPOSITE_FS = `#version 300 es
precision highp float;
out vec4 outColor;
uniform sampler2D uScene;
uniform sampler2D uBloomTex;
uniform vec2  uRes;
uniform float uSamples;
uniform float uExposure;
uniform float uBloom;
uniform float uTime;

// ACES filmic 近似（Narkowicz）
vec3 aces(vec3 x) {
  const float a = 2.51, b = 0.03, c = 2.43, d = 0.59, e = 0.14;
  return clamp((x * (a * x + b)) / (x * (c * x + d) + e), 0.0, 1.0);
}

void main() {
  vec2 uv = gl_FragCoord.xy / uRes;
  vec3 c  = texture(uScene, uv).rgb / max(uSamples, 1.0);
  c += texture(uBloomTex, uv).rgb * uBloom;
  c *= uExposure;

  c = aces(c);

  // 轻微暗角
  vec2 q = uv - 0.5;
  float vig = 1.0 - 0.28 * dot(q, q);
  c *= vig;

  // gamma + 有序抖动，消除暗部色带
  c = pow(max(c, 0.0), vec3(1.0 / 2.2));
  float dither = fract(sin(dot(gl_FragCoord.xy + uTime, vec2(12.9898, 78.233))) * 43758.5453);
  c += (dither - 0.5) / 255.0;

  outColor = vec4(c, 1.0);
}
`;

  BH.SHADERS = {
    QUAD_VS: QUAD_VS,
    BLACKHOLE_FS: BLACKHOLE_FS,
    BRIGHT_FS: BRIGHT_FS,
    BLUR_FS: BLUR_FS,
    COMPOSITE_FS: COMPOSITE_FS
  };
})(window);

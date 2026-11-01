/* =========================================================================
 * shaders.js — 卡冈图雅黑洞可视化 · GLSL 着色器源码
 *
 * 技术要点：
 *  - 主渲染：全屏三角形 + 光线弯曲积分（史瓦西零测地线近似）
 *    d²x/dλ² = -(3/2) · rs · h² · x / r⁵   （h = |x × v| 为守恒角动量）
 *    由此自然产生爱因斯坦环、光子环、吸积盘翻越黑洞上下方的"光环"。
 *  - 吸积盘：薄盘平面多次穿越采样，黑体辐射色温 + 开普勒差速剪切湍流
 *    + 多普勒集束 + 引力红移 + 体积辉光。
 *  - 星空：八面体映射 + 多层哈希星场 + 银河带/暗尘埃。
 *  - 后期：亮部提取 + 可分离高斯泛光 + ACES 色调映射。
 * ========================================================================= */
(function (global) {
  'use strict';

  /* ---------------- 顶点着色器（全屏三角形，无顶点属性） ---------------- */
  var VS_QUAD = [
    '#version 300 es',
    'out vec2 vUv;',
    'void main() {',
    '  vec2 p = vec2(float((gl_VertexID << 1) & 2), float(gl_VertexID & 2));',
    '  vUv = p;',
    '  gl_Position = vec4(p * 2.0 - 1.0, 0.0, 1.0);',
    '}'
  ].join('\n');

  /* ---------------- 场景主着色器：黑洞 + 吸积盘 + 星空 ---------------- */
  var FS_SCENE = `#version 300 es
precision highp float;

in vec2 vUv;
out vec4 fragColor;

uniform vec2  uRes;
uniform float uTime;
uniform vec3  uCamPos;
uniform vec3  uCamRight;
uniform vec3  uCamUp;
uniform vec3  uCamFwd;
uniform float uTanFov;

uniform float uRs;           // 史瓦西半径（世界单位）
uniform float uLensing;      // 引力透镜强度倍率，0 = 直线传播
uniform float uSpin;         // 自旋（视觉近似：ISCO + 参考系拖拽）
uniform float uDiskIn;       // 吸积盘内缘（世界单位）
uniform float uDiskOut;      // 吸积盘外缘（世界单位）
uniform float uDiskTemp;     // 内缘温度（K）
uniform float uDiskBright;   // 盘亮度
uniform float uDiskOpacity;  // 盘不透明度
uniform float uDiskSpeed;    // 盘自转速度
uniform float uBeaming;      // 多普勒集束强度 0..1
uniform float uDiskThick;    // 盘厚度（辉光高度）
uniform float uGlow;         // 体积辉光强度
uniform float uTurb;         // 湍流强度
uniform float uStarBright;   // 星空亮度
uniform float uStarDensity;  // 星密度
uniform int   uSteps;        // 测地线积分步数
uniform float uDiskOn;       // 1 = 显示吸积盘
uniform float uStarsOn;      // 1 = 显示星空

const int   MAX_STEPS = 512;
const float ESCAPE_R  = 150.0;

/* ---------- 哈希与噪声 ---------- */
float hash11(float p) {
  p = fract(p * 0.1031);
  p *= p + 33.33;
  p *= p + p;
  return fract(p);
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

float vnoise(vec3 p) {
  vec3 i = floor(p);
  vec3 f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  float n000 = hash13(i + vec3(0.0, 0.0, 0.0));
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

float fbm(vec3 p) {
  float s = 0.0;
  float a = 0.5;
  for (int i = 0; i < 4; i++) {
    s += a * vnoise(p);
    p = p * 2.03 + vec3(11.7, 5.3, 7.1);
    a *= 0.5;
  }
  return s;
}

/* ---------- 黑体辐射色温（Tanner Helland 近似，返回线性空间） ---------- */
vec3 blackbody(float T) {
  T = clamp(T, 1000.0, 40000.0) / 100.0;
  vec3 c;
  if (T <= 66.0) {
    c.r = 1.0;
    c.g = clamp(0.39008157 * log(T) - 0.63184144, 0.0, 1.0);
  } else {
    c.r = clamp(1.29293618 * pow(T - 60.0, -0.1332047592), 0.0, 1.0);
    c.g = clamp(1.12989086 * pow(T - 60.0, -0.0755148492), 0.0, 1.0);
  }
  if (T >= 66.0) {
    c.b = 1.0;
  } else if (T <= 19.0) {
    c.b = 0.0;
  } else {
    c.b = clamp(0.54320679 * log(T - 10.0) - 1.19625408, 0.0, 1.0);
  }
  return pow(max(c, vec3(0.0)), vec3(2.2));   // sRGB -> 线性
}

/* ---------- 八面体方向映射（球面 -> [0,1]²，无极点拉伸） ---------- */
vec2 octEncode(vec3 n) {
  n /= (abs(n.x) + abs(n.y) + abs(n.z));
  vec2 uv = (n.z >= 0.0) ? n.xy : (1.0 - abs(n.yx)) * sign(n.xy);
  return uv * 0.5 + 0.5;
}

/* ---------- 单层星场（2D 网格 + 3x3 邻域搜索，避免星点被裁切） ---------- */
vec3 starLayer(vec2 uv, float scale, float density, float bright) {
  vec2 p = uv * scale;
  vec2 id0 = floor(p);
  vec3 acc = vec3(0.0);
  for (int y = -1; y <= 1; y++) {
    for (int x = -1; x <= 1; x++) {
      vec2 id = id0 + vec2(float(x), float(y));
      vec2 wid = mod(id, vec2(scale));        // 环绕，消除接缝
      float h = hash13(vec3(wid, 3.7));
      if (h > density) continue;
      vec3 h3 = hash33(vec3(wid, 17.3));
      vec2 sp = id + h3.xy;
      float d = length(p - sp);
      float mag = pow(hash11(h * 91.7 + h3.z * 37.1), 3.5);  // 亮度分布：多暗少亮
      float core = exp(-d * d * 60.0) + 0.22 * exp(-d * d * 8.0);
      float temp = hash11(h3.z * 57.3 + h * 13.1);
      vec3 tint = mix(vec3(1.0, 0.74, 0.55), vec3(0.62, 0.75, 1.0), temp * temp);
      acc += tint * core * (0.06 + 1.30 * mag) * bright;
    }
  }
  return acc;
}

/* ---------- 星空背景（含银河带与暗尘埃） ---------- */
vec3 starField(vec3 dir) {
  vec2 uv = octEncode(dir);
  vec3 col = vec3(0.0);
  col += starLayer(uv, 190.0, uStarDensity, 1.00);
  col += starLayer(uv + vec2(0.37, 0.71), 95.0, uStarDensity * 0.70, 0.55);
  col += starLayer(uv + vec2(0.11, 0.53), 46.0, uStarDensity * 0.45, 0.32);

  // 银河带
  float b = dot(dir, normalize(vec3(0.36, 0.80, 0.48))) * 3.0;
  float band = exp(-b * b);
  float neb = fbm(dir * 2.6 + vec3(3.1, 7.7, 1.3));
  float dust = smoothstep(0.38, 0.78, fbm(dir * 5.4 + vec3(11.0, 2.0, 5.0)));
  vec3 nebCol = mix(vec3(0.050, 0.070, 0.125), vec3(0.150, 0.115, 0.085), neb);
  col += nebCol * band * (0.10 + 0.62 * neb) * (1.0 - 0.78 * dust);

  return col * uStarBright;
}

/* ---------- 引力加速度（零测地线） + 自旋参考系拖拽视觉近似 ---------- */
vec3 gravAccel(vec3 p, float h2) {
  float r2 = dot(p, p);
  float r = sqrt(r2);
  vec3 a = -1.5 * uRs * uLensing * h2 * p / (r2 * r2 * r);
  if (uSpin > 0.001) {
    vec3 drag = cross(vec3(0.0, 1.0, 0.0), p) * (uSpin * 0.5 * uRs * uRs) / (r2 * r2);
    float am = length(a);
    float dm = length(drag);
    if (dm > 0.35 * am) drag *= 0.35 * am / max(dm, 1e-8);
    a += drag;
  }
  return a;
}

/* ---------- 吸积盘着色（薄盘平面穿越采样） ---------- */
vec3 diskEmission(vec3 hit, vec3 photonDir, out float alpha) {
  float r = length(hit.xz);
  float rn = r / uRs;
  float phi = atan(hit.z, hit.x);

  // 开普勒差速旋转：噪声在共转坐标系中被剪切成条带
  float omega = uDiskSpeed * 1.45 / pow(max(rn, 0.22), 1.5);
  float ang = phi - omega * uTime;

  vec2 nc = vec2(log(max(rn, 0.05)) * 6.5, ang * 1.6);
  float n1 = fbm(vec3(nc * vec2(1.0, 0.30), uTime * 0.012));
  float n2 = fbm(vec3(nc * vec2(2.7, 0.85) + 5.0, uTime * 0.02));
  float turb = mix(1.0, 0.55 + 0.90 * n1 * (0.60 + 0.60 * n2), uTurb);

  // 径向分布（Novikov-Thorne 形状）：内缘为零、约 1.5 倍内缘处最亮、外缘衰减
  float x = uDiskIn / max(r, 1e-3);
  float prof = pow(max(x, 0.0), 1.3) * max(0.0, 1.0 - sqrt(min(1.0, x))) * 9.0;
  float outerFade = 1.0 - smoothstep(uDiskOut * 0.62, uDiskOut * 1.02, r);
  float innerFade = smoothstep(uDiskIn * 0.985, uDiskIn * 1.10, r);
  prof *= outerFade * innerFade;

  // 局部温度：T ∝ r^-3/4
  float T = uDiskTemp * pow(max(x, 1e-3), 0.75) * 1.30;

  // 多普勒集束 + 引力红移
  vec3 betaDir = normalize(cross(vec3(0.0, 1.0, 0.0), hit + vec3(1e-4, 0.0, 1e-4)));
  float vK = min(sqrt(0.5 * uRs / max(r, 0.02)), 0.72);
  float gam = 1.0 / sqrt(max(1e-3, 1.0 - vK * vK));
  float mu = dot(betaDir, -photonDir);
  float g = 1.0 / (gam * max(0.12, 1.0 - vK * mu));
  float grav = sqrt(max(0.02, 1.0 - uRs / max(r, uRs * 1.001)));
  float shift = g * grav;

  vec3 col = blackbody(T * shift);
  float beaming = pow(clamp(shift, 0.25, 3.2), 3.0 * uBeaming);

  float em = prof * uDiskBright * turb * beaming;
  float shape = outerFade * innerFade * min(1.0, 0.42 + prof * 1.1);
  alpha = clamp(uDiskOpacity * shape * (0.72 + 0.28 * turb), 0.0, 1.0);

  return col * em;
}

/* ---------- 主渲染 ---------- */
void main() {
  vec2 uv = (2.0 * gl_FragCoord.xy - uRes) / uRes.y;   // uv ∈ [-1,1]（y 方向）
  vec3 rd = normalize(uCamFwd + uTanFov * (uv.x * uCamRight + uv.y * uCamUp));

  vec3 pos = uCamPos;
  vec3 vel = rd;
  vec3 hvec = cross(pos, vel);
  float h2 = dot(hvec, hvec);

  vec3 col = vec3(0.0);
  vec3 glow = vec3(0.0);
  float transmit = 1.0;
  bool captured = false;

  for (int i = 0; i < MAX_STEPS; i++) {
    if (i >= uSteps) break;
    float r = length(pos);
    if (r < uRs * 1.015) { captured = true; break; }   // 落入视界 -> 黑影
    if (r > ESCAPE_R && dot(pos, vel) > 0.0) break;    // 逃逸 -> 采样星空

    float rn = r / uRs;
    float dt = uRs * (0.028 + 0.055 * rn);
    dt *= mix(1.0, 0.5, exp(-abs(pos.y) / (uRs * 0.6)));   // 近盘面细化步长

    vec3 a = gravAccel(pos, h2);
    vec3 newPos = pos + vel * dt + 0.5 * a * dt * dt;
    vec3 newA = gravAccel(newPos, h2);
    vec3 newVel = vel + 0.5 * (a + newA) * dt;

    // 吸积盘平面（y = 0）穿越检测
    if (uDiskOn > 0.5 && pos.y * newPos.y < 0.0) {
      float t = pos.y / (pos.y - newPos.y);
      vec3 hit = mix(pos, newPos, t);
      float hr = length(hit.xz);
      if (hr > uDiskIn * 0.97 && hr < uDiskOut * 1.05) {
        vec3 pv = normalize(mix(vel, newVel, t));
        float da;
        vec3 de = diskEmission(hit, pv, da);
        col += transmit * de * da;
        transmit *= (1.0 - da);
      }
    }

    // 盘上方/下方体积辉光（柔化边缘、掩盖走样）
    if (uGlow > 0.001 && uDiskOn > 0.5) {
      float hr = length(pos.xz);
      float band = (1.0 - smoothstep(uDiskOut * 0.55, uDiskOut * 1.35, hr))
                 * smoothstep(uDiskIn * 0.72, uDiskIn * 1.28, hr);
      if (band > 0.002) {
        float vert = exp(-abs(pos.y) / max(0.02, uRs * uDiskThick * (0.18 + 0.06 * hr / uRs)));
        if (vert > 0.003) {
          float gT = uDiskTemp * pow(max(uDiskIn / max(hr, uDiskIn * 0.5), 0.02), 0.75) * 0.85;
          glow += blackbody(gT) * band * vert * dt * uGlow * 0.006;
        }
      }
    }

    pos = newPos;
    vel = newVel;
  }

  if (!captured && uStarsOn > 0.5) {
    col += transmit * starField(normalize(vel));
  }

  col += glow;

  fragColor = vec4(col, 1.0);
}`;

  /* ---------------- 亮部提取 + 降采样 ---------------- */
  var FS_BRIGHT = `#version 300 es
precision highp float;
in vec2 vUv;
out vec4 fragColor;
uniform sampler2D uTex;
uniform vec2  uTexel;
uniform float uThreshold;
uniform float uKnee;
void main() {
  vec3 c = texture(uTex, vUv).rgb;
  c += texture(uTex, vUv + uTexel * vec2( 1.0,  1.0)).rgb;
  c += texture(uTex, vUv + uTexel * vec2(-1.0,  1.0)).rgb;
  c += texture(uTex, vUv + uTexel * vec2( 1.0, -1.0)).rgb;
  c += texture(uTex, vUv + uTexel * vec2(-1.0, -1.0)).rgb;
  c *= 0.2;
  float l = max(max(c.r, c.g), c.b);
  float soft = clamp(l - uThreshold + uKnee, 0.0, 2.0 * uKnee);
  soft = soft * soft / (4.0 * uKnee + 1e-4);
  float w = max(soft, l - uThreshold) / max(l, 1e-4);
  fragColor = vec4(max(c * w, vec3(0.0)), 1.0);
}`;

  /* ---------------- 可分离高斯模糊 ---------------- */
  var FS_BLUR = `#version 300 es
precision highp float;
in vec2 vUv;
out vec4 fragColor;
uniform sampler2D uTex;
uniform vec2 uDir;
void main() {
  vec3 s = texture(uTex, vUv).rgb * 0.227027;
  s += (texture(uTex, vUv + uDir * 1.3846).rgb + texture(uTex, vUv - uDir * 1.3846).rgb) * 0.316216;
  s += (texture(uTex, vUv + uDir * 3.2308).rgb + texture(uTex, vUv - uDir * 3.2308).rgb) * 0.070270;
  fragColor = vec4(s, 1.0);
}`;

  /* ---------------- 合成 + ACES 色调映射 ---------------- */
  var FS_COMPOSITE = `#version 300 es
precision highp float;
in vec2 vUv;
out vec4 fragColor;
uniform sampler2D uScene;
uniform sampler2D uBloom;
uniform float uBloomStrength;
uniform float uExposure;
vec3 aces(vec3 x) {
  return clamp((x * (2.51 * x + 0.03)) / (x * (2.43 * x + 0.59) + 0.14), 0.0, 1.0);
}
void main() {
  vec3 c = texture(uScene, vUv).rgb + texture(uBloom, vUv).rgb * uBloomStrength;
  c *= uExposure;
  c = aces(c);
  c = pow(max(c, vec3(0.0)), vec3(1.0 / 2.2));
  fragColor = vec4(c, 1.0);
}`;

  global.BH_SHADERS = {
    VS_QUAD: VS_QUAD,
    FS_SCENE: FS_SCENE,
    FS_BRIGHT: FS_BRIGHT,
    FS_BLUR: FS_BLUR,
    FS_COMPOSITE: FS_COMPOSITE
  };
})(window);

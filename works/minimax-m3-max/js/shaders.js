/* ============================================================
   shaders.js — 全部 GLSL 源码
   ------------------------------------------------------------
   核心：史瓦西时空中的零测地线（null geodesic）数值积分。

   轨道方程（在光子轨道平面内，用极角 φ 为自变量，u = 1/r）：

        d²u/dφ² = (3/2)·rs·u² − u

   第一积分：

        (du/dφ)² = rs·u³ − u² + E²/L² = rs·u³ − u² + 1/b²

   其中 b = L/E 为瞄准距离（impact parameter）。相机处初值由
   静态观测者局域标架中的出射角 ψ 给出：

        b  = r₀·sinψ / √(1 − rs/r₀)
        u'₀ = −cosψ / b

   这套方程可以精确再现：光子球 (r = 1.5 rs)、临界瞄准距离
   b_c = 3√3 M、以及著名的"吸积盘顶/底面绕过黑洞"的强透镜图像。
   ============================================================ */
(function (global) {
  'use strict';

  const VS_QUAD = `#version 300 es
in vec2 aPos;
out vec2 vUv;
void main(){
  vUv = aPos * 0.5 + 0.5;
  gl_Position = vec4(aPos, 0.0, 1.0);
}`;

  /* ─────────────────────────────────────────────────────────
     主渲染：测地线积分 + 吸积盘 + 星场
     ───────────────────────────────────────────────────────── */
  const FS_BLACKHOLE = `#version 300 es
precision highp float;
precision highp int;

out vec4 outColor;

uniform vec2  uRes;
uniform vec3  uCamPos;       // 相机位置（黑洞坐标系，单位 rs）
uniform mat3  uCamBasis;     // 列向量 = (right, up, forward)
uniform float uTanHalfFov;
uniform float uAspect;
uniform float uProjShift;    // 投影偏移（面板遮挡时把黑洞居中到可视区）
uniform float uTime;

uniform float uDiskIn;       // 内缘半径 (rs)
uniform float uDiskOut;      // 外缘半径 (rs)
uniform float uDiskBright;   // 整体亮度
uniform float uDiskTempK;    // 内缘温度 (K)
uniform float uDiskTurb;     // 湍流强度 0..1
uniform float uDiskDir;      // 旋向 +1 / -1
uniform vec3  uDiskNormal;   // 吸积盘法线 (= 自转轴)
uniform vec3  uDiskU;        // 盘平面基向量
uniform vec3  uDiskV;

uniform float uLensing;      // 透镜强度（0 = 关闭透镜做对照）
uniform float uDoppler;      // 多普勒增亮
uniform float uRedshift;     // 引力红移
uniform float uSpinDrag;     // 参考系拖曳（近似）
uniform float uSpinSign;

uniform float uStarDensity;
uniform float uStarBright;
uniform float uGalaxy;
uniform float uPixUV;        // 一个渲染像素在立方体面 uv 中的角尺寸
uniform float uDiskFall;     // 吸积盘亮度径向梯度指数

uniform int   uSteps;        // 最大积分步数
uniform float uStepH;        // φ 步长
uniform float uOmega;        // 吸积盘角速度系数

#define RS 1.0
#define PI 3.141592653589793
#define MAX_STEPS 2048

/* ---------- 噪声 ---------- */
float hash21(vec2 p){
  p = fract(p * vec2(127.1, 311.7));
  p += dot(p, p + 34.23);
  return fract(p.x * p.y);
}
vec2 hash22(vec2 p){
  vec3 p3 = fract(vec3(p.xyx) * vec3(0.1031, 0.1030, 0.0973));
  p3 += dot(p3, p3.yzx + 33.33);
  return fract((p3.xx + p3.yz) * p3.zy);
}
float hash11(float n){ return fract(sin(n) * 43758.5453123); }

float vnoise(vec2 p){
  vec2 i = floor(p), f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  float a = hash21(i);
  float b = hash21(i + vec2(1.0, 0.0));
  float c = hash21(i + vec2(0.0, 1.0));
  float d = hash21(i + vec2(1.0, 1.0));
  return mix(mix(a, b, u.x), mix(c, d, u.x), u.y);
}
float fbm(vec2 p){
  float s = 0.0, a = 0.5;
  for(int i = 0; i < 4; i++){
    s += a * vnoise(p);
    p = p * 2.07 + vec2(1.7, 9.2);
    a *= 0.5;
  }
  return s;
}

/* ---------- 黑体辐射 → RGB (Tanner Helland 近似) ---------- */
vec3 blackbody(float kelvin){
  float t = clamp(kelvin, 800.0, 42000.0) / 100.0;
  vec3 c;
  if(t <= 66.0){
    c.r = 1.0;
    c.g = clamp((99.4708025861 * log(t) - 161.1195681661) / 255.0, 0.0, 1.0);
    c.b = (t <= 19.0) ? 0.0 : clamp((138.5177312231 * log(t - 10.0) - 305.0447927307) / 255.0, 0.0, 1.0);
  } else {
    c.r = clamp(329.698727446 * pow(t - 60.0, -0.1332047592) / 255.0, 0.0, 1.0);
    c.g = clamp(288.1221695283 * pow(t - 60.0, -0.0755148492) / 255.0, 0.0, 1.0);
    c.b = 1.0;
  }
  return c;
}

/* ---------- 程序化星场（立方体映射 + 单元哈希） ---------- */
vec3 starfield(vec3 d){
  vec3 total = vec3(0.0);
  vec3 a = abs(d);
  vec2 uv; float face;
  if(a.x >= a.y && a.x >= a.z){ uv = d.zy / a.x; face = d.x > 0.0 ? 0.0 : 1.0; }
  else if(a.y >= a.z)          { uv = d.xz / a.y; face = d.y > 0.0 ? 2.0 : 3.0; }
  else                          { uv = d.xy / a.z; face = d.z > 0.0 ? 4.0 : 5.0; }

  float N = max(uStarDensity, 8.0);
  vec2 p = uv * N;
  vec2 ip = floor(p), fp = fract(p);
  float cellUV = 2.0 / N;                                  // 单元尺寸 (uv 单位)
  float sigUV  = max(cellUV * 0.055, uPixUV * 0.85);        // 星点半径：至少约 1 像素
  float pxScale = sigUV / max(uPixUV, 1e-6);

  for(int j = -1; j <= 1; j++){
    for(int i = -1; i <= 1; i++){
      vec2 cell = ip + vec2(float(i), float(j));
      vec2 h = hash22(cell + face * 91.7);
      if(h.x > 0.58) continue;                              // 约 42% 的单元里有星
      vec2 sp = vec2(h.y, fract(h.x * 37.13 + 0.31));
      float dd = length((fp - vec2(float(i), float(j)) - sp) * cellUV);
      float g = exp(-(dd * dd) / (sigUV * sigUV));
      if(g < 0.004) continue;
      float mag = hash11(dot(cell, vec2(12.9898, 78.233)) + face * 13.37);
      float bright = pow(mag, 6.0) * 12.0 + 0.12;           // 少量亮星 + 大量暗星
      float tp = hash11(dot(cell, vec2(3.17, 7.71)) + face * 5.53);
      float temp = mix(3000.0, 13000.0, pow(tp, 1.7));
      /* 保持总通量不变：星点越大，峰值越低 */
      float peak = bright * 0.5 / (pxScale * pxScale);
      total += blackbody(temp) * (peak * g);
    }
  }

  /* 银河带：一条倾斜大圆 + 尘埃暗带 */
  if(uGalaxy > 0.001){
    float band = dot(d, normalize(vec3(0.36, 0.26, 0.89)));
    float gb = exp(-band * band * 7.5);
    vec2 q = vec2(dot(d, normalize(vec3(0.90, -0.31, 0.10))),
                  dot(d, normalize(vec3(0.12, 0.90, 0.20)))) * 5.5;
    float n = fbm(q * 1.6);
    float dust = smoothstep(0.30, 0.78, fbm(q * 3.3 + 11.0));
    total += vec3(0.40, 0.46, 0.72) * gb * (0.30 + 0.70 * n) * (1.0 - 0.6 * dust) * uGalaxy * 1.6;
  }
  return total * uStarBright;
}

/* ---------- 测地线加速度 ---------- */
float accel(float u){
  return 1.5 * uLensing * RS * u * u - u;
}

/* ---------- 吸积盘温度 / 亮度剖面 ---------- */
float diskTemp(float r, float rin){
  float x = max(r / rin, 1.0);
  return uDiskTempK * pow(x, -0.42);          // 内缘最热，向外迅速降温
}
float diskEmis(float r, float rin){
  float x = max(r / rin, 1.0);
  return pow(x, -uDiskFall);                 // Stefan–Boltzmann 型亮度衰减
}

void main(){
  vec2 ndc = (gl_FragCoord.xy / uRes) * 2.0 - 1.0;
  ndc.x = ndc.x * uAspect + uProjShift * uAspect;
  vec3 dir = normalize(uCamBasis * vec3(ndc * uTanHalfFov, 1.0));

  float r0 = length(uCamPos);
  vec3  er  = uCamPos / r0;                 // 径向单位向量（相机）
  float f0  = max(1.0 - RS / r0, 1e-4);
  float sqf0 = sqrt(f0);

  float Dr  = dot(dir, er);
  vec3  perp = dir - Dr * er;
  float Dt  = length(perp);

  /* 纯径向光线：朝内 → 被捕获；朝外 → 直通星空 */
  if(Dt < 1e-4){
    if(Dr < 0.0){ outColor = vec4(0.0, 0.0, 0.0, 1.0); return; }
    outColor = vec4(starfield(dir), 1.0);
    return;
  }

  vec3  e2 = perp / Dt;                     // 光子轨道平面内的第二基向量
  float ln = sqrt(max(f0 * Dr * Dr + Dt * Dt, 1e-9));
  float cospsi = sqf0 * Dr / ln;            // 局域标架中与外向径向的夹角
  float sinpsi = Dt / ln;

  float b  = r0 * sinpsi / sqf0;            // 瞄准距离
  float u  = 1.0 / r0;
  float du = clamp(-cospsi / b, -1.0e4, 1.0e4);

  float phi = 0.0;
  float A = dot(er, uDiskNormal);           // 盘平面法线 · 相机径向
  float B = dot(e2, uDiskNormal);
  float phiCross = atan(-A, B);             // 满足 A cosφ + B sinφ = 0 的角

  vec3 col = vec3(0.0);
  bool hit = false;
  bool captured = false;

  for(int i = 0; i < MAX_STEPS; i++){
    if(i >= uSteps) break;
    float h = uStepH;

    /* ---- RK4 积分 u(φ) ---- */
    float k1u = du,                 k1d = accel(u);
    float k2u = du + 0.5 * h * k1d, k2d = accel(u + 0.5 * h * k1u);
    float k3u = du + 0.5 * h * k2d, k3d = accel(u + 0.5 * h * k2u);
    float k4u = du + h * k3d,       k4d = accel(u + h * k3u);
    float uN  = u  + h / 6.0 * (k1u + 2.0 * k2u + 2.0 * k3u + k4u);
    float duN = du + h / 6.0 * (k1d + 2.0 * k2d + 2.0 * k3d + k4d);
    float phiN = phi + h;

    /* ---- 是否穿过吸积盘平面？ ---- */
    float kk = floor((phi - phiCross) / PI) + 1.0;
    float phiC = phiCross + kk * PI;
    if(phiC <= phiN + 1e-5 && phiC >= phi - 1e-5){
      float t = clamp((phiC - phi) / h, 0.0, 1.0);
      float t2 = t * t, t3 = t2 * t;
      float h00 =  2.0 * t3 - 3.0 * t2 + 1.0;
      float h10 =        t3 - 2.0 * t2 + t;
      float h01 = -2.0 * t3 + 3.0 * t2;
      float h11 =        t3 -       t2;
      float uC  = h00 * u  + h10 * h * du  + h01 * uN + h11 * h * duN;
      float duC = ((6.0 * t2 - 6.0 * t) * u + (3.0 * t2 - 4.0 * t + 1.0) * h * du
                 + (-6.0 * t2 + 6.0 * t) * uN + (3.0 * t2 - 2.0 * t) * h * duN) / h;

      if(uC > 1e-5){
        float rC = 1.0 / uC;
        if(rC > uDiskIn && rC < uDiskOut){
          /* ---- 命中吸积盘：着色 ---- */
          vec3 rcHat  = cos(phiC) * er + sin(phiC) * e2;      // 径向单位向量
          vec3 phiHat = -sin(phiC) * er + cos(phiC) * e2;

          float sinA = clamp(b * sqrt(max(1.0 - RS / rC, 0.0)) / rC, 0.0, 1.0);
          float cosA = (duC > 0.0 ? -1.0 : 1.0) * sqrt(max(0.0, 1.0 - sinA * sinA));
          vec3  vHat = cosA * rcHat + sinA * phiHat;           // 光子传播方向（相机 → 盘）

          vec3  Pd   = rC * rcHat;                            // 发射点（位于盘平面内）
          vec3  radDir = normalize(Pd);
          vec3  aziDir = normalize(cross(uDiskNormal, radDir)) * uDiskDir;

          /* 开普勒速度 + 相对论多普勒 */
          float beta = sqrt(0.5 / rC) / sqrt(max(1.0 - RS / rC, 1e-3));
          float gam  = 1.0 / sqrt(max(1.0 - beta * beta, 1e-4));
          vec3  bVec = beta * aziDir;
          /* 发射点处指向相机的光子方向 = −vHat */
          float gDop = 1.0 / max(gam * (1.0 + dot(bVec, vHat)), 1e-3);
          float gGrv = sqrt(max(1.0 - RS / rC, 1e-4));

          /* 温度与辐射 */
          float T   = diskTemp(rC, uDiskIn);
          float emis = diskEmis(rC, uDiskIn);

          /* 湍流条纹：随局部开普勒角速度平流 */
          float ang = atan(dot(Pd, uDiskV), dot(Pd, uDiskU));
          float rot = uDiskDir * uTime * uOmega * pow(rC, -1.5);
          vec2  q   = vec2(cos(ang - rot), sin(ang - rot)) * rC * 2.7;
          float n1  = fbm(q);
          float n2  = fbm(q * 3.7 + 17.3);
          float band = 0.5 + 0.5 * sin(ang * 3.0 - rot * 1.6 + n1 * 6.0);
          float turb = mix(1.0, (0.22 + 1.6 * n1) * (0.5 + 1.0 * n2) * (0.68 + 0.64 * band), uDiskTurb);

          float shift = mix(1.0, gDop, uDoppler) * mix(1.0, gGrv, uRedshift);
          float boost = mix(1.0, pow(gDop, 4.0), uDoppler) * mix(1.0, pow(gGrv, 4.0), uRedshift);

          col = blackbody(T * shift) * (emis * turb * boost * uDiskBright);
          hit = true;
          break;
        }
      }
    }

    /* ---- 推进到新步 ---- */
    float uPrev = u, phiPrev = phi;
    u = uN; du = duN; phi = phiN;

    if(u > 1.0 / RS){ captured = true; break; }   // 越过视界 → 被吞噬
    if(u <= 0.0){
      /* 细化逃逸角：解出 u = 0 的精确位置。
         否则逃逸角会被量化到步长网格上，使背景天空出现"切片"状条纹。 */
      float t = clamp(uPrev / max(uPrev - u, 1e-8), 0.0, 1.0);
      phi = phiPrev + t * h;
      break;
    }
  }

  if(hit){ outColor = vec4(col, 1.0); return; }
  if(captured){ outColor = vec4(0.0, 0.0, 0.0, 1.0); return; }

  /* ---- 逃逸：取渐近径向方向去采样星场 ---- */
  vec3 bgDir = normalize(cos(phi) * er + sin(phi) * e2);
  /* 参考系拖曳（近似）：按绕转角度轻微旋转观测方向 */
  float excess = max(phi - 1.5707963, 0.0);
  float drag = -uSpinDrag * uSpinSign * excess * 0.045;
  float cd = cos(drag), sd = sin(drag);
  vec3 axis = uDiskNormal;
  bgDir = bgDir * cd + cross(axis, bgDir) * sd + axis * dot(axis, bgDir) * (1.0 - cd);

  outColor = vec4(starfield(bgDir), 1.0);
}`;

  /* ---------- 亮部提取 ---------- */
  const FS_BRIGHT = `#version 300 es
precision highp float;
in vec2 vUv;
out vec4 outColor;
uniform sampler2D uTex;
uniform float uThreshold;
uniform float uKnee;
void main(){
  vec3 c = texture(uTex, vUv).rgb;
  float br = max(c.r, max(c.g, c.b));
  float soft = clamp(br - uThreshold + uKnee, 0.0, 2.0 * uKnee);
  soft = soft * soft / (4.0 * uKnee + 1e-5);
  float w = max(soft, br - uThreshold) / max(br, 1e-5);
  outColor = vec4(c * w, 1.0);
}`;

  /* ---------- 可分离高斯模糊 ---------- */
  const FS_BLUR = `#version 300 es
precision highp float;
in vec2 vUv;
out vec4 outColor;
uniform sampler2D uTex;
uniform vec2 uDir;       // 像素步长方向
void main(){
  vec3 s = texture(uTex, vUv).rgb * 0.2270270270;
  s += texture(uTex, vUv + uDir * 1.3846153846).rgb * 0.3162162162;
  s += texture(uTex, vUv - uDir * 1.3846153846).rgb * 0.3162162162;
  s += texture(uTex, vUv + uDir * 3.2307692308).rgb * 0.0702702703;
  s += texture(uTex, vUv - uDir * 3.2307692308).rgb * 0.0702702703;
  outColor = vec4(s, 1.0);
}`;

  /* ---------- 合成 + 色调映射 ---------- */
  const FS_COMPOSITE = `#version 300 es
precision highp float;
in vec2 vUv;
out vec4 outColor;
uniform sampler2D uScene;
uniform sampler2D uBloom1;
uniform sampler2D uBloom2;
uniform vec2  uRes;
uniform float uExposure;
uniform float uBloom;
uniform float uVignette;
uniform float uGrain;
uniform float uTime;
uniform float uAberration;

vec3 aces(vec3 x){
  const float a = 2.51, b = 0.03, c = 2.43, d = 0.59, e = 0.14;
  return clamp((x * (a * x + b)) / (x * (c * x + d) + e), 0.0, 1.0);
}
float hash(vec2 p){ return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }

void main(){
  vec2 uv = vUv;
  vec2 d = uv - 0.5;
  float r2 = dot(d, d);

  /* 色散：边缘轻微 RGB 分离 */
  float ab = uAberration * r2 * 0.05;
  vec3 scene;
  scene.r = texture(uScene, uv + d * ab).r;
  scene.g = texture(uScene, uv).g;
  scene.b = texture(uScene, uv - d * ab).b;

  vec3 bloom = texture(uBloom1, uv).rgb * 0.62 + texture(uBloom2, uv).rgb * 0.38;
  vec3 col = scene + bloom * uBloom;

  col *= exp2(uExposure);
  col = aces(col);

  /* 暗角 */
  col *= 1.0 - uVignette * smoothstep(0.16, 0.78, r2);

  /* 胶片颗粒 + 抖动（消除暗部色带） */
  float g = hash(gl_FragCoord.xy + fract(uTime) * 137.0) - 0.5;
  col += g * uGrain * 0.055;
  col += (hash(gl_FragCoord.xy * 1.37 + 9.1) - 0.5) / 255.0;

  outColor = vec4(max(col, 0.0), 1.0);
}`;

  global.SHADERS = { VS_QUAD, FS_BLACKHOLE, FS_BRIGHT, FS_BLUR, FS_COMPOSITE };
})(window);

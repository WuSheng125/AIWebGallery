#version 300 es
// =============================================================================
//  卡冈图雅 (Gargantua) 风格黑洞 —— 全屏测地线光线步进着色器
//
//  物理模型
//  --------
//  1. 史瓦西度规下的光子轨道。在轨道平面内令 u = 1/r，光子满足 Binet 方程
//
//        d²u/dφ² + u = (3/2)·rs·u²
//
//     本着色器对该方程做 RK2（中点法）数值积分，初始条件由相机位置与视线
//     方向解析给出：
//        L   = |r × v|                        （角动量，即瞄准距离 b）
//        u₀  = 1/r₀
//        u₀' = −(r·v₀) / (r₀·L)               （由 du/dφ = −ṙ/L, ṙ = (r·v)/r₀）
//
//     真实积分光线轨迹会自动产生：
//       · 视界阴影（b < b_crit ≈ 2.598·rs 的光子被俘获）
//       · 光子环（近临界光线绕转多圈）
//       · 吸积盘远侧被透镜"抬升"到黑洞上方（电影中最标志性的画面）
//       · 吸积盘的次级（多重）成像
//       · 背景星空扭曲与爱因斯坦环
//
//  2. 吸积盘
//       · 内边界 r_in（≈ ISCO，最内稳定圆轨道）
//       · 开普勒速度 β = sqrt(rs/2r)（差速旋转，越靠内越快）
//       · 相对论性多普勒集束 D³（接近侧显著增亮）
//       · 引力红移 sqrt(1 − rs/r)（靠近视界变暗变红）
//       · 光深依赖入射角（侧视时盘变厚不透明，正视时半透明）
//       · 湍流纹理随流体差速旋转
// =============================================================================

precision highp float;

uniform vec2  uResolution;
uniform float uTime;
uniform vec3  uCamPos;
uniform mat3  uCamBasis;   // 列 0=right, 列 1=up, 列 2=forward
uniform float uFov;

uniform float uRs;            // 史瓦西半径
uniform float uSpin;          // 自旋 a ∈ [0, 0.998]

uniform float uDiskInner;     // 盘内半径（rs 倍数）
uniform float uDiskOuter;     // 盘外半径（rs 倍数）
uniform float uDiskThickness; // 盘半厚度（rs 倍数）
uniform float uDiskTemp;      // 温度标度
uniform float uDiskOpacity;   // 不透明度
uniform float uDiskTilt;      // 盘倾角（弧度）

uniform float uDopplerBeam;   // 多普勒集束强度
uniform float uGravRedshift;  // 引力红移强度
uniform float uLensing;       // 透镜强度（0 = 关闭，退化为直线光线）
uniform float uEinsteinRing;  // 爱因斯坦环强度
uniform float uVolumetric;    // 体积雾 / 湍流

uniform float uExposure;
uniform float uStarDensity;
uniform float uStarBrightness;
uniform float uSteps;         // 步进质量 1..3
uniform int   uDebug;         // 0=正常  1=仅盘  2=仅星空  3=b 可视化  4=rh 可视化  5=透射率

out vec4 fragColor;

const float PI     = 3.14159265359;
const float TAU    = 6.28318530718;
const float B_CRIT = 2.598076211;   // (3√3)/2

// ---------------------------------------------------------------------------
//  哈希 / 噪声
// ---------------------------------------------------------------------------
float hash11(float p) {
  p = fract(p * 0.1031);
  p *= p + 33.33;
  p *= p + p;
  return fract(p);
}

float hash13(vec3 p) {
  p = fract(p * 0.1031);
  p += dot(p, p.yzx + 33.33);
  return fract((p.x + p.y) * p.z);
}

vec3 hash33(vec3 p) {
  p = fract(p * vec3(0.1031, 0.1030, 0.0973));
  p += dot(p, p.yxz + 33.33);
  return fract((p.xxy + p.yxx) * p.zyx);
}

float vnoise(vec3 x) {
  vec3 i = floor(x);
  vec3 f = fract(x);
  f = f * f * (3.0 - 2.0 * f);
  return mix(
    mix(mix(hash13(i + vec3(0, 0, 0)), hash13(i + vec3(1, 0, 0)), f.x),
        mix(hash13(i + vec3(0, 1, 0)), hash13(i + vec3(1, 1, 0)), f.x), f.y),
    mix(mix(hash13(i + vec3(0, 0, 1)), hash13(i + vec3(1, 0, 1)), f.x),
        mix(hash13(i + vec3(0, 1, 1)), hash13(i + vec3(1, 1, 1)), f.x), f.y),
    f.z);
}

float fbm(vec3 p, int octaves) {
  float a = 0.5, s = 0.0, norm = 0.0;
  for (int i = 0; i < 6; i++) {
    if (i >= octaves) break;
    s += a * vnoise(p);
    norm += a;
    p = p * 2.03 + vec3(11.3, 7.7, 3.1);
    a *= 0.5;
  }
  return s / max(norm, 1e-4);
}

// ---------------------------------------------------------------------------
//  程序化星空
// ---------------------------------------------------------------------------
vec3 starField(vec3 dir) {
  if (uStarDensity <= 0.001) return vec3(0.0);

  vec3 color = vec3(0.0);

  // 三层不同尺度的星点网格（越远越密越暗）
  for (int L = 0; L < 3; L++) {
    float scale = 24.0 + float(L) * 31.0;
    vec3 p = dir * scale;
    vec3 cell = floor(p);
    vec3 rnd = hash33(cell + float(L) * 17.0);

    if (rnd.x < uStarDensity * 0.40) {
      vec3 center = cell + 0.5 + (rnd - 0.5) * 0.5;
      float d = length(p - center);
      float radius = 0.040 + hash11(rnd.y * 91.7) * 0.055;
      float star = exp(-pow(d / radius, 1.7) * 3.2);

      // 色温：蓝白 → 橙红
      vec3 tint = mix(vec3(0.60, 0.73, 1.0), vec3(1.0, 0.70, 0.40),
                      pow(hash11(rnd.z * 47.3), 2.0));
      float mag = 0.30 + pow(hash11(rnd.z * 13.1), 3.0) * 2.4;
      color += tint * star * mag;
    }
  }

  // 银河带：必须又窄又暗。过宽过亮时经 ACES + gamma 会糊成一片灰底，
  // 把黑洞与吸积盘的对比度全部吃掉。
  float band = exp(-pow((dir.y + 0.05) * 7.0, 2.0));
  float dust = fbm(dir * 6.0, 3);
  color += vec3(0.040, 0.052, 0.090) * band * (0.30 + dust * 0.70) * 0.50;

  // 深空底噪（极弱：经 ACES + gamma 2.2 后约 12/255）
  color += vec3(0.00055, 0.00062, 0.00110) * (0.5 + vnoise(dir * 3.0));

  return color * uStarBrightness;
}

// ---------------------------------------------------------------------------
//  温度 → 颜色（0 = 冷红，1 = 暖白，>1 = 蓝白）
// ---------------------------------------------------------------------------
vec3 tempRamp(float t) {
  t = clamp(t, 0.0, 2.2);
  vec3 c = mix(vec3(0.42, 0.09, 0.02), vec3(1.00, 0.32, 0.05),
               smoothstep(0.00, 0.28, t));
  c = mix(c, vec3(1.00, 0.72, 0.30), smoothstep(0.22, 0.55, t));
  c = mix(c, vec3(1.00, 0.95, 0.82), smoothstep(0.50, 0.85, t));
  c = mix(c, vec3(0.78, 0.86, 1.00), smoothstep(0.95, 1.60, t));
  return c;
}

// ---------------------------------------------------------------------------
//  吸积盘单点发射（供穿越点与相机内发射共用）
// ---------------------------------------------------------------------------
vec3 diskSample(float rh, float ph, vec3 viewDir, float rs) {
  // 开普勒速度方向（局部坐标系内绕 y 轴逆时针）
  vec3 vloc = vec3(-sin(ph), 0.0, cos(ph));
  // 转回世界坐标（绕 x 轴倾斜 uDiskTilt）
  float ct = cos(uDiskTilt), st = sin(uDiskTilt);
  vec3 vel = vec3(vloc.x, vloc.y * ct + vloc.z * st,
                  -vloc.y * st + vloc.z * ct);

  // 相对论性多普勒因子
  float beta = min(0.82, sqrt(0.5 * rs / max(rh, rs * 1.02)));
  float gam  = 1.0 / sqrt(max(1.0 - beta * beta, 1e-3));
  float mu   = dot(vel, -viewDir);                 // >0：朝向观测者运动
  float dop  = clamp(1.0 / (gam * (1.0 - beta * mu)), 0.05, 14.0);

  // 引力红移
  float grav = sqrt(max(1.0 - rs / rh, 0.0));

  float boost = pow(dop, uDopplerBeam * 2.4) * pow(grav, uGravRedshift * 1.6);
  float freq  = dop * grav;                        // 频率偏移

  // 湍流纹理（随流体差速旋转：Ω ∝ r^(-3/2)）
  float omega = pow(rs * 3.0 / rh, 1.5);
  float twist = uTime * 0.85 * omega;
  float ang = ph - twist;
  vec3 q = vec3(cos(ang), sin(ang), 0.0) * rh * 0.40;
  float n1 = fbm(q + vec3(0.0, 0.0, rh * 0.20), 4);
  float n2 = fbm(q * 2.9 + vec3(rh * 0.12, 0.0, uTime * 0.04), 3);
  float turb = clamp(0.28 + n1 * 1.20 + n2 * 0.45, 0.0, 2.2);

  // 径向剖面（内缘最亮，粘性耗散 ∝ r^(-2)）
  // 外缘用 0.78 起衰：衰减太陡会让盘的外环"消失"，侧视时看起来
  // 像一个只挡光不发光的暗椭圆。
  float radial = pow(rs * 3.0 / rh, 2.1);
  radial *= smoothstep(uDiskInner * rs, uDiskInner * rs * 1.22, rh);
  radial *= 1.0 - smoothstep(uDiskOuter * rs * 0.78, uDiskOuter * rs, rh);

  // 温度与颜色
  float tn = clamp(pow(rs * 3.0 / rh, 0.75), 0.0, 2.4) * uDiskTemp;
  vec3 base = tempRamp(tn);
  vec3 tint = freq > 1.0
    ? mix(vec3(1.0, 0.93, 0.78), vec3(0.78, 0.86, 1.0),
          clamp((freq - 1.0) * 1.5, 0.0, 1.0))
    : mix(vec3(1.0, 0.93, 0.78), vec3(1.0, 0.48, 0.16),
          clamp((1.0 - freq) * 1.7, 0.0, 1.0));

  return base * tint * boost * radial * (0.45 + 0.95 * turb) * 5.5;
}

// ---------------------------------------------------------------------------
//  主渲染
// ---------------------------------------------------------------------------
void main() {
  vec2 uv = (gl_FragCoord.xy - 0.5 * uResolution) / uResolution.y;

  vec3 f   = normalize(uCamBasis[2]);
  vec3 rt  = normalize(uCamBasis[0]);
  vec3 cup = normalize(uCamBasis[1]);
  // uv.y ∈ [-0.5, 0.5]（已按画面高度归一化），因此要让垂直半视角等于
  // uFov/2，焦距必须是 (0.5)/tan(uFov/2)。若误用 1/tan(uFov/2)，
  // 实际视场角会缩小近一半，整个画面像被长焦镜头拉近了一样。
  float focal = 0.5 / tan(uFov * 0.5);
  vec3 rd = normalize(rt * uv.x + cup * uv.y + f * focal);

  float rs  = uRs;
  float rsB = rs * clamp(uLensing, 0.0, 1.0);   // 用于弯曲的有效半径
  // 克尔黑洞外视界半径（自旋使其收缩）
  float rsH = rs * (1.0 + sqrt(max(1.0 - uSpin * uSpin, 0.0))) * 0.5;

  // 吸积盘局部坐标架（绕 x 轴倾斜 uDiskTilt）
  float ct = cos(uDiskTilt), st = sin(uDiskTilt);
  vec3 dn  = vec3(0.0, ct, st);      // 盘面法向
  vec3 de1 = vec3(1.0, 0.0, 0.0);    // 盘面内方向 1
  vec3 de2 = vec3(0.0, st, -ct);     // 盘面内方向 2

  vec3 ro = uCamPos;
  float rCam = length(ro);
  float b = length(cross(ro, rd));      // 瞄准距离

  vec3 col = vec3(0.0);
  vec3 fogCol = vec3(0.0);
  float trans = 1.0;
  float lastRh = -1.0;
  bool captured = false;
  vec3 escapeDir = rd;

  // 若相机本身位于吸积盘内，先叠加自发光（允许近距离观察）
  if (rCam > uDiskInner * rs && rCam < uDiskOuter * rs) {
    float camPh = atan(ro.z * st - ro.y * ct, ro.x);
    if (abs(dot(ro, dn)) < uDiskThickness * rs) {
      col += diskSample(rCam, camPh, rd, rs) * 0.55;
      trans *= 0.35;
    }
  }

  // ==========================================================================
  //  测地线积分
  //
  //  注意：不能用"瞄准距离 b 大于某值就跳过积分"的做法。引力透镜会把
  //  b 远大于吸积盘外半径的光线也弯进盘面（相机距黑洞越远，视场边缘的
  //  b 越大，这个错误越明显——曾导致远景下吸积盘整体消失）。
  //  正确的提前退出只有一种：光线已经逃逸到作用范围之外。
  // ==========================================================================
  {
    float L = max(b, 1e-6);
    vec3 er = ro / rCam;                                // 初始径向单位向量
    vec3 et = normalize(rd - dot(rd, er) * er);         // 初始切向（运动方向）

    float u   = 1.0 / rCam;
    // Binet 方程的第一积分：(du/dφ)² = 1/b² − u² + rs·u³
    // 注意必须带上 rs·u³ 这一相对论修正项；只用平直的 −ṙ/b 会在
    // 强场区积累误差，使透镜偏折角偏大。
    float uprMag = sqrt(max(1.0 / (L * L) - u * u + rsB * u * u * u, 0.0));
    // ṙ < 0（朝向黑洞运动）时 du/dφ > 0
    float upr = (dot(ro, rd) < 0.0) ? uprMag : -uprMag;
    float phi = 0.0;

    int NS = int(mix(220.0, 760.0, clamp((uSteps - 1.0) * 0.5, 0.0, 1.0)));
    float maxWind = 1.30 * TAU;
    // 逃逸判据：已经比出发点更远、并且在继续向外运动
    float rEscape = max(uDiskOuter * rs * 1.05, rCam * 1.02);

    vec3 prevPos = ro;
    float prevSide = dot(ro, dn);
    if (abs(prevSide) < 1e-5) prevSide = 1e-5;

    for (int i = 0; i < 900; i++) {
      if (i >= NS) break;

      float r = 1.0 / max(u, 1e-9);
      if (u <= 0.0) break;                        // 已逃逸到无穷远
      if (phi >= maxWind) break;                  // 绕转圈数上限

      // ---- 自适应步长 ----
      float h = clamp(0.030 * pow(r / rs, 1.05), 0.0075, 0.075);
      if (phi + h > maxWind) h = maxWind - phi;

      // ---- RK2（中点法）积分 u'' = 1.5·rsB·u² − u ----
      float k1u = upr;
      float k1p = 1.5 * rsB * u * u - u;
      float um  = u  + 0.5 * h * k1u;
      float upm = upr + 0.5 * h * k1p;
      float k2u = upm;
      float k2p = 1.5 * rsB * um * um - um;
      u   += h * k2u;
      upr += h * k2p;
      phi += h;

      if (u <= 0.0) break;                        // 逃逸
      float rn = 1.0 / u;
      if (rn < rsH * 1.0004) { captured = true; break; }
      if (rn > rEscape && upr < 0.0) break;       // 已飞出作用范围

      vec3 rhat = cos(phi) * er + sin(phi) * et;
      vec3 phat = -sin(phi) * er + cos(phi) * et;
      vec3 pos = rn * rhat;

      // ---- 吸积盘穿越检测 ----
      float side = dot(pos, dn);
      if (prevSide * side < 0.0 && trans > 0.004) {
        float tt = prevSide / (prevSide - side);
        vec3 hit = mix(prevPos, pos, tt);
        float X = hit.x;
        float Y = hit.y * st - hit.z * ct;
        float rh = sqrt(X * X + Y * Y);

        if (rh > uDiskInner * rs && rh < uDiskOuter * rs) {
          lastRh = rh;
          float ph = atan(Y, X);
          // 光深依赖入射角：侧视更厚更不透明
          float cosI = max(abs(dot(rd, dn)), 0.055);
          // 不透明度必须比"发光"衰减得更快。若只让发光衰减而保持不透明，
          // 盘的外缘就会变成一圈只吸收不发光的暗环（侧视时非常明显）。
          // 与 radial 的外缘起衰点保持一致，保证盘面优雅地淡出。
          float edgeFade = mix(0.05, 1.0,
                               smoothstep(uDiskOuter * rs,
                                          uDiskOuter * rs * 0.78, rh));
          vec3 emis = diskSample(rh, ph, rd, rs);
          float alpha = (1.0 - exp(-uDiskOpacity * 3.0 / cosI)) *
                        clamp(uDiskOpacity, 0.0, 1.0) * edgeFade;
          alpha = clamp(alpha, 0.0, 1.0);
          col += emis * alpha * trans;
          trans *= (1.0 - alpha);
        }
      }

      // ---- 体积雾（盘的弥散辉光）----
      // 必须是沿路径的积分 ∫ρ·ds，ds = r·dφ。若忽略 ds 只做逐步累加，
      // 结果会随步数暴涨（曾经整个画面被雾霭淹成灰白）。
      if (uVolumetric > 0.001 && trans > 0.01) {
        float hgt = dot(pos, dn) / max(uDiskOuter * rs * 0.18, 1e-3);
        float band2 = exp(-hgt * hgt);
        if (band2 > 0.03) {
          float fg = fbm(pos * 0.20 + vec3(0.0, 0.0, uTime * 0.03), 2);
          float ds = rn * h;                     // 本步走过的弧长（rs 单位）
          float radialFog = smoothstep(uDiskOuter * rs * 1.5, rs * 3.0, rn) *
                            (1.0 - smoothstep(uDiskOuter * rs * 0.4,
                                              uDiskOuter * rs, rn));
          fogCol += vec3(1.0, 0.56, 0.24) * uVolumetric * 0.00040 * fg * band2 *
                    ds * radialFog * trans;
        }
      }

      prevPos = pos;
      prevSide = side;
    }

    // ---- 逃逸方向 ----
    if (!captured) {
      float uu = max(u, 1e-7);
      float rr = 1.0 / uu;
      vec3 rhat = cos(phi) * er + sin(phi) * et;
      vec3 phat = -sin(phi) * er + cos(phi) * et;
      float drdphi = -upr / (uu * uu);
      escapeDir = normalize(drdphi * rhat + rr * phat);
    }
  }

  // ==========================================================================
  //  背景星空（使用偏折后的视线方向 → 引力透镜成像）
  // ==========================================================================
  if (!captured) {
    col += starField(escapeDir) * trans;
  }

  // ==========================================================================
  //  光子环 + 爱因斯坦环（视界边缘的亮环）
  // ==========================================================================
  if (!captured) {
    float bcrit = B_CRIT * rsH;
    float ring = exp(-pow((b - bcrit) / (bcrit * 0.052), 2.0));
    col += vec3(1.0, 0.90, 0.76) * ring * 0.55;

    if (uEinsteinRing > 0.001) {
      float er2 = exp(-pow((b - bcrit) / (bcrit * 0.11), 2.0));
      col += starField(escapeDir) * er2 * uEinsteinRing * 0.55;
    }
  }

  col *= uExposure;

  // -------------------------------------------------------------------------
  //  调试可视化（仅用于开发期定位问题，正式渲染时 uDebug = 0）
  // -------------------------------------------------------------------------
  if (uDebug == 1) {                       // 仅吸积盘（压掉背景与环）
    fragColor = vec4(max(col, 0.0) * 0.25, 1.0);
    return;
  }
  if (uDebug == 2) {                       // 仅星空
    fragColor = vec4(max(starField(escapeDir) * (captured ? 0.0 : 1.0), 0.0)
                     * 6.0, 1.0);
    return;
  }
  if (uDebug == 3) {                       // 瞄准距离 b（蓝→红 = 0→30 rs）
    float t = clamp(b / 30.0, 0.0, 1.0);
    fragColor = vec4(t, t * 0.35, 1.0 - t, 1.0);
    return;
  }
  if (uDebug == 4) {                       // 首次命中盘的半径 rh
    float shown = (lastRh > 0.0) ? clamp(lastRh / uDiskOuter * rs, 0.0, 1.0) : 0.0;
    fragColor = vec4(shown, shown * 0.6, 1.0 - shown, 1.0);
    return;
  }
  if (uDebug == 5) {                       // 透射率（白=全透射，黑=全吸收）
    fragColor = vec4(vec3(trans), 1.0);
    return;
  }
  if (uDebug == 6) {                       // 仅体积雾
    fragColor = vec4(max(fogCol, 0.0) * 12.0, 1.0);
    return;
  }
  if (uDebug == 7) {                       // 仅吸积盘发射（剔除雾）
    vec3 diskOnly = col - fogCol;
    fragColor = vec4(max(diskOnly, 0.0) * 0.25, 1.0);
    return;
  }
  if (uDebug == 8) {                       // 视界俘获掩码（白=被俘获）
    fragColor = vec4(vec3(captured ? 1.0 : 0.0), 1.0);
    return;
  }

  fragColor = vec4(max(col, 0.0), 1.0);
}

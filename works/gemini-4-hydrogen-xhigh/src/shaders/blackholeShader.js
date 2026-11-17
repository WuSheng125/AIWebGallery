export const vertexShader = /* glsl */ `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = vec4(position.xy, 0.0, 1.0);
  }
`;

export const fragmentShader = /* glsl */ `
  precision highp float;

  varying vec2 vUv;

  uniform vec2 uResolution;
  uniform float uTime;

  uniform vec3 uCamPos;
  uniform vec3 uCamTarget;
  uniform float uFov;

  // 物理与视觉参数
  uniform float uMass;          // 黑洞质量 / 事件视界尺度
  uniform float uSpin;          // Kerr 自旋参数 a/M (0..0.99)
  uniform float uLensing;       // 引力透镜偏折倍率
  uniform float uPhotonRing;    // 光子环亮度
  uniform float uDiskOuter;     // 吸积盘外径 (以 r_s 为基准)
  uniform float uDiskThickness; // 吸积盘厚度
  uniform float uDiskSpeed;     // 开普勒旋转速度倍率
  uniform float uDoppler;       // 相对论多普勒聚束强度
  uniform float uTurbulence;    // 等离子体湍流细节
  uniform float uTemperature;   // 黑体色温倍率
  uniform float uStarDensity;   // 背景星辰密度
  uniform float uNebula;        // 深空星云亮度
  uniform int uMaxSteps;        // 步进上限 (画质档位)

  #define PI 3.14159265359

  // ---------- 哈希与 3D FBM 噪声 ----------
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

  float noise3(vec3 x) {
    vec3 i = floor(x);
    vec3 f = fract(x);
    f = f * f * (3.0 - 2.0 * f);

    return mix(
      mix(
        mix(hash13(i + vec3(0.0, 0.0, 0.0)), hash13(i + vec3(1.0, 0.0, 0.0)), f.x),
        mix(hash13(i + vec3(0.0, 1.0, 0.0)), hash13(i + vec3(1.0, 1.0, 0.0)), f.x),
        f.y
      ),
      mix(
        mix(hash13(i + vec3(0.0, 0.0, 1.0)), hash13(i + vec3(1.0, 0.0, 1.0)), f.x),
        mix(hash13(i + vec3(0.0, 1.0, 1.0)), hash13(i + vec3(1.0, 1.0, 1.0)), f.x),
        f.y
      ),
      f.z
    );
  }

  float fbm3(vec3 p) {
    float v = 0.0;
    float a = 0.5;
    mat3 rot = mat3(
      0.00, 0.80, 0.60,
     -0.80, 0.36,-0.48,
     -0.60,-0.48, 0.64
    );
    for (int i = 0; i < 4; i++) {
      v += a * noise3(p);
      p = rot * p * 2.03;
      a *= 0.5;
    }
    return v;
  }

  // ---------- 普朗克黑体辐射近似色谱 ----------
  vec3 blackbodyColor(float tempNorm) {
    float t = clamp(tempNorm, 0.04, 3.0);
    vec3 cEdge = vec3(0.55, 0.08, 0.015);
    vec3 cWarm = vec3(0.95, 0.38, 0.08);
    vec3 cGold = vec3(1.00, 0.72, 0.36);
    vec3 cHot  = vec3(1.02, 0.92, 0.80);
    vec3 cBlue = vec3(0.74, 0.88, 1.18);

    vec3 col = mix(cEdge, cWarm, smoothstep(0.06, 0.50, t));
    col = mix(col, cGold, smoothstep(0.42, 0.96, t));
    col = mix(col, cHot,  smoothstep(0.92, 1.48, t));
    col = mix(col, cBlue, smoothstep(1.45, 2.45, t));
    return col;
  }

  // ---------- 3D 球面星场与银河尘埃 ----------
  vec3 starLayer(vec3 dir, float scale, float density, float glowPow) {
    vec3 p = dir * scale;
    vec3 id = floor(p);
    vec3 f = fract(p) - 0.5;

    vec3 rnd = hash33(id);
    if (rnd.x > clamp(density, 0.0, 0.94)) {
      return vec3(0.0);
    }

    vec3 offset = (rnd - 0.5) * 0.50;
    float d = length(f - offset);
    float radius = mix(0.055, 0.145, rnd.y * rnd.y);
    float core = smoothstep(radius, 0.0, d);
    float halo = pow(clamp(1.0 - d / (radius * 1.65), 0.0, 1.0), glowPow);

    vec3 starTint = mix(vec3(1.0, 0.72, 0.46), vec3(0.72, 0.86, 1.0), rnd.z);
    starTint = mix(starTint, vec3(1.0, 0.96, 0.92), smoothstep(0.32, 0.72, rnd.z));

    float mag = mix(0.32, 2.5, pow(rnd.y, 2.1));
    return starTint * (core * 1.55 + halo * 0.55) * mag;
  }

  vec3 sampleCosmos(vec3 dir) {
    dir = normalize(dir);
    vec3 col = vec3(0.0012, 0.0018, 0.0038);

    vec3 galDir = normalize(vec3(
      dir.x * 0.86 - dir.z * 0.51,
      dir.y * 0.78 + dir.z * 0.62,
      dir.x * 0.51 + dir.z * 0.86
    ));
    float band = exp(-abs(galDir.y) * 4.6);

    if (uNebula > 0.001) {
      float n1 = fbm3(galDir * 3.1 + vec3(1.7, 0.4, 2.1));
      float n2 = fbm3(galDir * 7.6 - vec3(n1 * 1.25));
      float dustRift = smoothstep(0.36, 0.68, n2);

      vec3 nebWarm = vec3(0.14, 0.07, 0.035);
      vec3 nebCool = vec3(0.035, 0.07, 0.14);
      vec3 neb = mix(nebCool, nebWarm, n1) * band * (0.35 + 0.85 * n1);
      neb *= (1.0 - 0.64 * dustRift);
      col += neb * uNebula * 1.1;
    }

    if (uStarDensity > 0.001) {
      float dScale = uStarDensity;
      col += starLayer(dir, 46.0,  0.14 * dScale, 2.8) * 1.05;
      col += starLayer(dir, 102.0, 0.19 * dScale * (0.65 + 0.85 * band), 3.2) * 1.15;
      col += starLayer(dir, 192.0, 0.23 * dScale * (0.50 + 1.05 * band), 3.6) * 0.82;
    }

    return col;
  }

  // 计算线段 AB 到原点(黑洞中心)的最短距离平方，用于精确平滑光环
  float segmentMinDistSq(vec3 a, vec3 b) {
    vec3 ab = b - a;
    float denom = dot(ab, ab);
    float t = denom > 1e-8 ? clamp(-dot(a, ab) / denom, 0.0, 1.0) : 0.0;
    vec3 closest = a + ab * t;
    return dot(closest, closest);
  }

  // ---------- 吸积盘体积密度与相对论辐射采样 ----------
  // 返回: rgb = 局部发射率 (已乘密度), a = 局部不透明度系数 (sigma_t * density)
  vec4 sampleAccretionDisk(vec3 pos, vec3 rayDir, float rs, float rMin, float rMax, float spin) {
    float rXZ = length(pos.xz);
    if (rXZ < rMin * 0.82 || rXZ > rMax * 1.04) {
      return vec4(0.0);
    }

    float radialNorm = clamp((rXZ - rMin) / max(rMax - rMin, 0.001), 0.0, 1.0);
    // 盘体厚度随半径缓慢变化，保持薄盘犀利轮廓
    float halfH = max(uDiskThickness * rs * (0.28 + 0.72 * pow(radialNorm, 0.65)), 0.035 * rs);
    float vertFade = exp(-(pos.y * pos.y) / (halfH * halfH));
    if (vertFade < 0.02) {
      return vec4(0.0);
    }

    float innerEdge = smoothstep(rMin * 0.88, rMin * 1.24, rXZ);
    float outerEdge = 1.0 - smoothstep(rMax * 0.50, rMax, rXZ);
    float baseProfile = innerEdge * outerEdge * vertFade;
    if (baseProfile < 0.005) {
      return vec4(0.0);
    }

    // 顺时针旋转角速度 (+Y 俯视)，内区转速更快形成螺旋剪切纹理
    float omega = uDiskSpeed * (1.15 / (pow(rXZ / rs, 1.35) + 0.25)) * (1.0 + 0.35 * spin);
    float theta = atan(pos.z, pos.x);
    float shearedAngle = theta + uTime * omega * 0.62 - 3.6 * log(max(rXZ / rs, 0.5));

    vec3 noiseCoord = vec3(
      cos(shearedAngle) * rXZ * 0.55,
      pos.y * 3.0,
      sin(shearedAngle) * rXZ * 0.55
    );
    float swirl = fbm3(noiseCoord * (0.95 + 0.65 * uTurbulence));

    // 卡冈图雅标志性细密同心弧线流纹（高对比度明暗环带）
    float rings = 0.45 + 0.55 * sin(rXZ * (6.2 / rs) + swirl * 4.8 - uTime * 0.5 * uDiskSpeed);
    float filaments = smoothstep(0.18, 0.90, swirl * 0.72 + rings * 0.46);
    float fineStreaks = 0.58 + 0.42 * noise3(vec3(rXZ * 7.8 / rs, shearedAngle * 3.5, pos.y * 4.5));

    float density = baseProfile * mix(0.62, filaments * fineStreaks * 1.55, clamp(uTurbulence, 0.0, 1.5));
    // 随半径自然衰减，避免外围铺满画面
    density *= mix(1.05, 0.28, pow(radialNorm, 0.78));

    // 黑体温度分布：内圈高热金白，外圈深琥珀红
    float temp = uTemperature * (1.28 * pow(rMin / max(rXZ, rMin * 0.92), 0.62) + 0.18 * filaments);

    // 相对论切向速度与多普勒聚束
    vec3 tangent = normalize(vec3(pos.z, 0.0, -pos.x));
    float beta = clamp(sqrt(0.44 * rs / max(rXZ, rs * 0.75)) * (0.65 + 0.35 * spin), 0.0, 0.76);
    float cosAngle = dot(tangent, -rayDir);
    float gamma = inversesqrt(max(1.0 - beta * beta, 0.08));
    float dopplerFactor = 1.0 / (gamma * (1.0 - beta * cosAngle));

    float beaming = mix(1.0, clamp(pow(dopplerFactor, 2.2), 0.28, 2.75), uDoppler);
    float freqShift = mix(1.0, clamp(pow(dopplerFactor, 0.50), 0.75, 1.42), uDoppler);

    vec3 emissionCol = blackbodyColor(temp * freqShift);
    float iscoGlow = exp(-pow((rXZ - rMin * 1.12) / (0.38 * rs), 2.0)) * 0.45;
    vec3 emission = emissionCol * density * beaming * (0.72 + iscoGlow);

    return vec4(emission, density * 1.15);
  }

  void main() {
    vec2 ndc = (gl_FragCoord.xy / uResolution) * 2.0 - 1.0;
    float aspect = uResolution.x / max(uResolution.y, 1.0);
    float tanHalfFov = tan(radians(uFov) * 0.5);

    vec3 forward = normalize(uCamTarget - uCamPos);
    vec3 worldUp = vec3(0.0, 1.0, 0.0);
    vec3 right = normalize(cross(forward, worldUp));
    vec3 up = cross(right, forward);

    vec3 rayDir = normalize(forward + right * (ndc.x * aspect * tanHalfFov) + up * (ndc.y * tanHalfFov));
    vec3 pos = uCamPos;

    float rs = 1.65 * uMass;
    float spin = clamp(uSpin, 0.0, 0.99);
    float rHorizon = rs * (0.5 + 0.5 * sqrt(max(1.0 - spin * spin, 0.01)));
    float rInner = mix(rs * 2.38, rs * 1.24, spin * 0.78);
    float rOuter = rs * uDiskOuter;

    vec3 accumColor = vec3(0.0);
    float transmittance = 1.0;
    bool absorbed = false;

    float minDist = 1e6;
    float prevY = pos.y;
    float photonRingAccum = 0.0;
    float escapeRadius = max(length(uCamPos) * 1.65, rOuter * 2.4);

    for (int i = 0; i < 240; i++) {
      if (i >= uMaxSteps) break;

      float r = length(pos);
      minDist = min(minDist, r);

      if (r < rHorizon * 1.002) {
        absorbed = true;
        break;
      }

      if (r > escapeRadius && dot(pos, rayDir) > 0.0) {
        break;
      }

      float distToHorizon = max(r - rHorizon, 0.012 * rs);
      float diskPlaneDist = abs(pos.y);
      float stepSize = clamp(distToHorizon * 0.105, 0.016 * rs, 0.78 * rs);
      if (r < rOuter * 1.15) {
        stepSize = min(stepSize, max(0.020 * rs, diskPlaneDist * 0.28));
      }

      // 二阶 Runge-Kutta (中点法) 求解广义相对论零测地线
      vec3 hVec = cross(pos, rayDir);
      float h2 = dot(hVec, hVec);
      float r2 = r * r;
      float r5 = r2 * r2 * r;
      vec3 accel1 = -1.5 * rs * uLensing * h2 / max(r5, 1e-5) * pos
                  + vec3(pos.z, 0.0, -pos.x) * (spin * uLensing * 0.44 * rs * rs / max(r2 * r2, 1e-4));

      vec3 midPos = pos + rayDir * (0.5 * stepSize);
      vec3 midDir = normalize(rayDir + accel1 * (0.5 * stepSize));
      float rm = length(midPos);
      float rm2 = rm * rm;
      float rm5 = rm2 * rm2 * rm;
      vec3 hmVec = cross(midPos, midDir);
      float hm2 = dot(hmVec, hmVec);
      vec3 accel2 = -1.5 * rs * uLensing * hm2 / max(rm5, 1e-5) * midPos
                  + vec3(midPos.z, 0.0, -midPos.x) * (spin * uLensing * 0.44 * rs * rs / max(rm2 * rm2, 1e-4));

      vec3 nextDir = normalize(rayDir + accel2 * stepSize);
      vec3 nextPos = pos + midDir * stepSize;

      // 基于线段连续最近距离累积光子球光晕，彻底消除离散步进锯齿/点状噪点
      float segR = sqrt(segmentMinDistSq(pos, nextPos));
      minDist = min(minDist, segR);
      float photonSphereR = rs * mix(1.52, 1.24, spin * 0.5);
      float ringBand = exp(-pow((segR - photonSphereR) / (0.11 * rs), 2.0));
      photonRingAccum += ringBand * stepSize / max(rs, 0.1);

      if ((prevY * nextPos.y <= 0.0 || abs(pos.y) < uDiskThickness * rs * 1.9) && r < rOuter * 1.08) {
        vec3 samplePos = (prevY * nextPos.y <= 0.0)
          ? mix(pos, nextPos, abs(pos.y) / max(abs(pos.y) + abs(nextPos.y), 1e-5))
          : 0.5 * (pos + nextPos);

        if (length(samplePos) > rHorizon * 1.015) {
          vec4 diskSample = sampleAccretionDisk(samplePos, nextDir, rs, rInner, rOuter, spin);
          if (diskSample.a > 0.001) {
            float ds = stepSize / max(rs, 0.1);
            float alpha = 1.0 - exp(-diskSample.a * ds * 2.2);
            accumColor += transmittance * diskSample.rgb * ds * 1.48;
            transmittance *= (1.0 - alpha);
            if (transmittance < 0.015) {
              break;
            }
          }
        }
      }

      pos = nextPos;
      rayDir = nextDir;
      prevY = pos.y;
    }

    // 连续平滑的光子环辉光
    if (uPhotonRing > 0.001) {
      float ringBoost = pow(clamp(photonRingAccum * 0.36, 0.0, 2.0), 1.55) * uPhotonRing;
      vec3 ringColor = blackbodyColor(1.24 * uTemperature) * ringBoost * 0.36;
      accumColor += transmittance * ringColor;
    }

    if (!absorbed && transmittance > 0.01) {
      vec3 bg = sampleCosmos(rayDir);
      float lensBoost = 1.0 + 0.45 * exp(-pow((minDist - rs * 1.65) / (0.45 * rs), 2.0)) * uLensing;
      accumColor += transmittance * bg * lensBoost;
    }

    gl_FragColor = vec4(accumColor, 1.0);
  }
`;

/**
 * GARGANTUA — General Relativistic Geodesic Raymarching & Post-Processing Shaders
 * Implements null geodesic integration in Kerr/Schwarzschild spacetime,
 * analytical equatorial crossing + volumetric accretion slab, flow-advected MHD filaments,
 * relativistic Doppler beaming, gravitational lensing of 3D starfield, and IMAX anamorphic bloom.
 */
(function (global) {
  'use strict';

  const VERTEX_SHADER = /* glsl */ `
    varying vec2 vUv;
    void main() {
      vUv = uv;
      gl_Position = vec4(position.xy, 0.0, 1.0);
    }
  `;

  // ============================================================================
  // PASS 1: General Relativistic Geodesic Raymarcher (HDR Output)
  // ============================================================================
  const BLACKHOLE_FRAG = /* glsl */ `
    precision highp float;

    varying vec2 vUv;

    uniform vec2 uResolution;
    uniform float uTime;

    // Camera basis
    uniform vec3 uCamPos;
    uniform vec3 uCamRight;
    uniform vec3 uCamUp;
    uniform vec3 uCamForward;
    uniform float uTanHalfFov;

    // Black Hole & Spacetime Metric Uniforms
    uniform float uHorizonRadius;
    uniform float uSpin;
    uniform float uLensingStrength;
    uniform float uPhotonRingIntensity;
    uniform float uShadowAsymmetry;
    uniform float uIscoRadius;
    uniform float uPhotonSphereRadius;

    // Accretion Disk Uniforms
    uniform float uDiskEnabled;
    uniform float uDiskInnerRadius;
    uniform float uDiskOuterRadius;
    uniform float uDiskThickness;
    uniform float uDiskDensity;
    uniform float uDiskSpeed;
    uniform float uDopplerBeaming;
    uniform float uDiskTemp;
    uniform int uColorMode;
    uniform float uDiskTurbulence;
    uniform float uJetIntensity;

    // Environment & Overlays
    uniform float uStarDensity;
    uniform float uNebulaIntensity;
    uniform float uEinsteinRingBoost;
    uniform float uSpacetimeGrid;
    uniform int uMaxSteps;

    #define PI 3.14159265359
    #define TWO_PI 6.28318530718

    // Fast high-quality 3D hash & gradient/value noise
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

    float noise3D(vec3 x) {
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

    float fbm3D(vec3 p) {
      float v = 0.0;
      float a = 0.5;
      vec3 shift = vec3(100.0);
      for (int i = 0; i < 4; i++) {
        v += a * noise3D(p);
        p = p * 2.03 + shift;
        a *= 0.5;
      }
      return v;
    }

    // Physical Planck Blackbody approximation (Kelvin -> linear HDR RGB)
    vec3 kelvinToRGB(float kelvin) {
      float temp = clamp(kelvin, 1000.0, 40000.0) / 100.0;
      vec3 col;
      if (temp <= 66.0) {
        col.r = 1.0;
        col.g = clamp(0.39008157 * log(max(temp, 1.0)) - 0.63184144, 0.0, 1.0);
      } else {
        col.r = clamp(1.29293618 * pow(temp - 60.0, -0.13320475), 0.0, 1.0);
        col.g = clamp(1.12989086 * pow(temp - 60.0, -0.07551484), 0.0, 1.0);
      }
      if (temp >= 66.0) {
        col.b = 1.0;
      } else if (temp <= 19.0) {
        col.b = 0.0;
      } else {
        col.b = clamp(0.54320678 * log(temp - 10.0) - 1.19625408, 0.0, 1.0);
      }
      return pow(col, vec3(1.35));
    }

    // Color mapping for the accretion disk based on selected palette, radial heat, and Doppler shift
    vec3 getDiskPalette(float heat, float dopplerShift, float tempK, int mode) {
      if (mode == 1) {
        // Pure Physical Blackbody driven by Kelvin slider & relativistic Doppler shift
        float localKelvin = tempK * mix(0.28, 1.45, pow(heat, 0.85)) * dopplerShift;
        return kelvinToRGB(localKelvin) * mix(0.35, 2.2, heat);
      } else if (mode == 2) {
        // High-Energy Quasar (Cyan-Blue-White-Violet)
        vec3 outerCol = vec3(0.14, 0.06, 0.42);
        vec3 midCol   = vec3(0.18, 0.58, 1.05);
        vec3 innerCol = vec3(0.88, 0.96, 1.15);
        vec3 base = mix(outerCol, midCol, smoothstep(0.0, 0.55, heat));
        base = mix(base, innerCol, smoothstep(0.45, 1.0, heat));
        // Doppler shift tints approaching plasma toward ultraviolet-cyan
        vec3 shifted = mix(base * vec3(1.15, 0.65, 0.55), base * vec3(0.85, 1.02, 1.25), clamp((dopplerShift - 0.6) * 1.1, 0.0, 1.0));
        return shifted;
      } else if (mode == 3) {
        // Aged Crimson / M87* EHT Sub-mm Thermal Glow
        vec3 outerCol = vec3(0.28, 0.02, 0.01);
        vec3 midCol   = vec3(0.92, 0.22, 0.03);
        vec3 innerCol = vec3(1.12, 0.76, 0.32);
        vec3 base = mix(outerCol, midCol, smoothstep(0.0, 0.6, heat));
        base = mix(base, innerCol, smoothstep(0.55, 1.0, heat));
        return mix(base * vec3(1.1, 0.5, 0.3), base * vec3(1.05, 1.05, 0.95), clamp((dopplerShift - 0.55) * 1.1, 0.0, 1.0));
      } else if (mode == 4) {
        // Magnetar Aurora (Emerald-Cyan to Magenta)
        vec3 outerCol = vec3(0.38, 0.04, 0.36);
        vec3 midCol   = vec3(0.08, 0.78, 0.72);
        vec3 innerCol = vec3(0.88, 1.08, 1.02);
        vec3 base = mix(outerCol, midCol, smoothstep(0.0, 0.55, heat));
        base = mix(base, innerCol, smoothstep(0.5, 1.0, heat));
        return base;
      }

      // Mode 0 (Default): Interstellar Gargantua Film Palette (Kip Thorne / DNGR aesthetic)
      // Deep burnt sienna outer -> warm golden amber mid -> incandescent cream-white inner core
      float tempRatio = clamp(tempK / 5400.0, 0.5, 2.5);
      vec3 outerEdge = vec3(0.42, 0.09, 0.015);
      vec3 midAmber  = vec3(1.02, 0.48, 0.11);
      vec3 warmGold  = vec3(1.15, 0.80, 0.38);
      vec3 hotCore   = vec3(1.22, 1.12, 0.94);

      vec3 col = mix(outerEdge, midAmber, smoothstep(0.0, 0.42, heat));
      col = mix(col, warmGold, smoothstep(0.32, 0.76, heat));
      col = mix(col, hotCore, smoothstep(0.68, 1.0, heat));

      // Apply subtle temperature slider tint and Doppler color shift
      vec3 coolTint = kelvinToRGB(tempK * dopplerShift);
      col = mix(col, col * coolTint * 1.18, 0.42);

      // Approaching side gets slightly whiter/creamer, receding side gets deeper amber-red
      float dNorm = clamp((dopplerShift - 0.65) / 0.75, 0.0, 1.0);
      vec3 recedingTint = vec3(1.08, 0.58, 0.28);
      vec3 approachingTint = vec3(1.02, 1.04, 1.12);
      col *= mix(recedingTint, approachingTint, dNorm);
      return col * pow(tempRatio, 0.25);
    }

    /**
     * Evaluates the Accretion Disk plasma density, fine Keplerian spiral filaments,
     * and Relativistic Doppler Beaming at a 3D position p around the black hole.
     */
    void sampleAccretionDisk(
      vec3 p,
      vec3 rayDir,
      float r,
      out vec3 emission,
      out float alpha
    ) {
      emission = vec3(0.0);
      alpha = 0.0;

      float rIn = uDiskInnerRadius;
      float rOut = uDiskOuterRadius;
      if (r < rIn * 0.92 || r > rOut * 1.08) return;

      // Normalized radial coordinate u in [0, 1]
      float u = clamp((r - rIn) / max(0.001, rOut - rIn), 0.0, 1.0);

      // Inner ISCO sharp turn-on & outer soft exponential fade
      // Concentrates main disk opacity in the inner-to-mid zone so the foreground bridge
      // cleanly bisects the black hole shadow, revealing both upper and lower shadow crescents!
      float innerFade = smoothstep(rIn * 0.95, rIn * 1.10, r);
      float outerFade = (1.0 - smoothstep(0.48, 1.0, u)) * exp(-3.4 * u * u);
      float radialMask = innerFade * outerFade;
      if (radialMask <= 0.0005) return;

      // Seamless cylindrical angle
      float theta = atan(p.z, p.x);

      // Differential Keplerian angular speed (inner orbits faster, bounded via dual-phase flow advection)
      float keplerFactor = 1.0 / (pow(max(r / rIn, 1.0), 0.85));
      float baseAngle = theta + uTime * uDiskSpeed * 0.75 * keplerFactor;

      // Dual-phase flow advection prevents infinite spiral wind-up over long sessions
      float cycle = uTime * 0.14 * max(0.2, uDiskSpeed);
      float phase0 = fract(cycle);
      float phase1 = fract(cycle + 0.5);
      float blend = abs(2.0 * phase0 - 1.0);

      float shear0 = (phase0 - 0.5) * 3.2 * keplerFactor;
      float shear1 = (phase1 - 0.5) * 3.2 * keplerFactor;

      float a0 = baseAngle + shear0 - log(max(r, 0.1)) * 2.8;
      float a1 = baseAngle + shear1 - log(max(r, 0.1)) * 2.8;

      vec3 cyl0 = vec3(r * 1.85, cos(a0) * 2.4, sin(a0) * 2.4);
      vec3 cyl1 = vec3(r * 1.85, cos(a1) * 2.4, sin(a1) * 2.4);

      float turb0 = fbm3D(cyl0);
      float turb1 = fbm3D(cyl1);
      float spiralTurb = mix(turb0, turb1, blend);

      // Fine high-frequency concentric Keplerian rings (characteristic of Interstellar's Gargantua)
      float ringWave1 = 0.5 + 0.5 * sin(r * 11.5 + spiralTurb * 5.2);
      float ringWave2 = 0.5 + 0.5 * sin(r * 27.0 - spiralTurb * 3.8 + cos(baseAngle) * 1.5);
      float fineRings = mix(0.65, 1.35, 0.6 * ringWave1 + 0.4 * ringWave2);

      // Combine macro spiral arms with micro concentric filaments
      float filament = mix(1.0, spiralTurb * 1.45 * fineRings, clamp(uDiskTurbulence * 0.72, 0.0, 1.4));
      filament = max(0.08, filament);

      // Hot inner ISCO ring boost (Novikov-Thorne temperature peak near inner edge)
      float iscoGlow = exp(-pow((r - rIn * 1.12) / max(0.18, rIn * 0.28), 2.0)) * 0.85;
      float heat = clamp(pow(1.0 - u, 1.45) * 0.82 + iscoGlow * 0.42 + (spiralTurb - 0.45) * 0.22, 0.0, 1.0);

      // Relativistic Orbital Velocity & Doppler Beaming
      // Prograde orbital tangent in equatorial plane: (-sin(theta), 0, cos(theta)) = normalize(-z, 0, x)
      vec3 orbDir = normalize(vec3(-p.z, 0.0, p.x));
      // Relativistic beta = v / c
      float beta = clamp(sqrt(0.55 * uHorizonRadius / max(0.35, r - 0.45 * uHorizonRadius)), 0.08, 0.76);
      // Cosine of angle between plasma velocity and photon direction toward observer (-rayDir)
      float cosTheta = dot(orbDir, -rayDir);
      float effBeta = beta * uDopplerBeaming;
      float gamma = 1.0 / sqrt(max(0.15, 1.0 - effBeta * effBeta * 0.5));
      float doppler = 1.0 / max(0.28, gamma * (1.0 - effBeta * cosTheta));

      // Gravitational redshift near horizon
      float gravRedshift = sqrt(clamp(1.0 - 0.82 * uHorizonRadius / max(r, uHorizonRadius * 0.85), 0.15, 1.0));
      float totalShift = doppler * mix(1.0, gravRedshift, 0.55);

      // Relativistic beaming intensity boost I_obs = I_emit * D^3
      float beamingIntensity = pow(clamp(totalShift, 0.25, 2.4), 2.65);

      vec3 col = getDiskPalette(heat, totalShift, uDiskTemp, uColorMode);
      float density = radialMask * filament * uDiskDensity;

      emission = col * density * (1.15 + iscoGlow) * beamingIntensity;
      alpha = clamp(density * 0.62, 0.0, 0.96);
    }

    /**
     * Cube-face projection helper for distortion-free pinpoint 3D stars on the celestial sphere.
     * Avoids sphere-plane slicing rings completely while preserving true gravitational lensing distortion.
     */
    vec3 evalCubeStarLayer(vec3 d, float scale, float seedOffset, float densityBoost) {
      vec3 absD = abs(d);
      vec2 uvFace;
      float faceId;
      if (absD.x >= absD.y && absD.x >= absD.z) {
        faceId = d.x > 0.0 ? 0.0 : 1.0;
        uvFace = vec2(d.z, d.y) / absD.x;
      } else if (absD.y >= absD.x && absD.y >= absD.z) {
        faceId = d.y > 0.0 ? 2.0 : 3.0;
        uvFace = vec2(d.x, d.z) / absD.y;
      } else {
        faceId = d.z > 0.0 ? 4.0 : 5.0;
        uvFace = vec2(d.x, d.y) / absD.z;
      }

      vec2 gridCoord = uvFace * scale;
      vec2 cell = floor(gridCoord);
      vec2 local = fract(gridCoord) - 0.5;

      vec3 rnd = hash33(vec3(cell, faceId * 19.0 + seedOffset));
      float prob = fract(rnd.x * 17.3 + rnd.y * 9.1);
      float threshold = clamp(0.91 - 0.055 * densityBoost, 0.72, 0.985);
      if (prob <= threshold) return vec3(0.0);

      vec2 starOffset = (rnd.xy - 0.5) * 0.52;
      vec2 delta = local - starOffset;

      // Strict smooth window inside the cell so star halos never clip against cell edges
      float edgeDist = max(abs(local.x), abs(local.y));
      float cellWindow = 1.0 - smoothstep(0.36, 0.48, edgeDist);
      if (cellWindow <= 0.001) return vec3(0.0);

      // Jacobian compensation near cube corners so stars stay circular everywhere on the sky
      float cornerJac = 1.0 / pow(1.0 + dot(uvFace, uvFace), 0.5);
      float dist = length(delta) * cornerJac;

      float size = mix(0.015, 0.042, rnd.z);
      float core = exp(-pow(dist / size, 2.0) * 18.0);
      float halo = exp(-pow(dist / (size * 2.2), 2.0) * 3.5) * 0.24;

      float starTemp = mix(3000.0, 17500.0, pow(rnd.y, 1.5));
      vec3 starCol = kelvinToRGB(starTemp);
      float mag = pow((prob - threshold) / (1.0 - threshold), 1.5);
      return starCol * (core * 2.8 + halo) * mag * cellWindow;
    }

    /**
     * Procedural 3D Starfield + Milky Way Galactic Band & Nebulae,
     * evaluated along the gravitationally deflected ray direction.
     */
    vec3 sampleCelestialSky(vec3 dir, float minR, float captureR) {
      vec3 d = normalize(dir);

      // Gravitational Lensing Magnification near the Einstein Ring
      float impactDelta = max(0.0, minR - captureR);
      float einsteinMag = 1.0 + uEinsteinRingBoost * 1.45 * exp(-impactDelta * 2.2 / max(0.3, uHorizonRadius));

      vec3 sky = vec3(0.0025, 0.0035, 0.007); // Deep cosmic void base

      // 1. Tilted Milky Way Galactic Band & Dust Rift
      if (uNebulaIntensity > 0.01) {
        vec3 galDir = normalize(vec3(
          d.x * 0.85 - d.y * 0.52,
          d.x * 0.48 + d.y * 0.84 + d.z * 0.24,
          -d.x * 0.20 - d.y * 0.14 + d.z * 0.97
        ));
        float galPlane = exp(-abs(galDir.y) * 5.0);
        float galCore  = exp(-abs(galDir.y) * 13.0) * smoothstep(-0.4, 0.9, galDir.x);

        float n1 = fbm3D(galDir * 3.6 + vec3(12.4, 7.1, 3.3));
        float n2 = fbm3D(galDir * 8.2 - vec3(4.2, 19.8, 11.1));
        float dustRift = smoothstep(0.38, 0.68, n2) * exp(-abs(galDir.y) * 16.0);

        vec3 nebulaWarm = vec3(0.20, 0.13, 0.08) * galCore * n1;
        vec3 nebulaCool = vec3(0.05, 0.09, 0.19) * galPlane * (0.4 + 0.6 * n1);
        vec3 nebulaHII  = vec3(0.22, 0.07, 0.13) * pow(max(0.0, n1 * n2), 2.2) * galPlane * 1.6;

        vec3 milkyWay = (nebulaWarm + nebulaCool + nebulaHII) * (1.0 - 0.72 * dustRift);
        sky += milkyWay * uNebulaIntensity * mix(1.0, einsteinMag, 0.48);
      }

      // 2. Multi-Layer Distortion-Free Cube-Projected Starfield
      if (uStarDensity > 0.01) {
        vec3 starAccum = vec3(0.0);
        starAccum += evalCubeStarLayer(d, 48.0, 11.3, uStarDensity) * 1.35;
        starAccum += evalCubeStarLayer(d, 96.0, 47.9, uStarDensity) * 1.05;
        starAccum += evalCubeStarLayer(d, 185.0, 93.1, uStarDensity) * 0.78;
        sky += starAccum * uStarDensity * einsteinMag;
      }

      return sky;
    }

    void main() {
      vec2 ndc = vUv * 2.0 - 1.0;
      float aspect = uResolution.x / max(1.0, uResolution.y);

      // Construct initial camera ray in world space
      vec3 rayDir = normalize(
        uCamForward +
        ndc.x * aspect * uTanHalfFov * uCamRight +
        ndc.y * uTanHalfFov * uCamUp
      );
      vec3 pos = uCamPos;

      // Black hole parameters
      float rs = max(0.15, uHorizonRadius);
      // Event horizon capture radius (produces a bold, unmistakable pitch-black shadow sphere)
      float kerrShrink = 1.0 - 0.16 * uSpin * uSpin;
      float captureRadius = rs * kerrShrink;

      // Spin axis for Kerr gravitomagnetic frame-dragging
      vec3 spinAxis = vec3(0.0, 1.0, 0.0);

      // Volumetric & surface accumulation along curved null geodesic
      vec3 accumColor = vec3(0.0);
      float transmittance = 1.0;

      float minR = 1e6;
      float totalDeflection = 0.0;
      bool captured = false;

      float maxRadius = max(48.0, length(uCamPos) * 1.45);
      float diskMaxR = uDiskOuterRadius * 1.12;
      float baseThickness = uDiskThickness * rs;

      // Subtle per-pixel jitter to eliminate any stepping artifacts
      float dither = hash13(vec3(gl_FragCoord.xy, fract(uTime * 1.37)));

      // Geodesic step loop
      for (int stepIdx = 0; stepIdx < 240; stepIdx++) {
        if (stepIdx >= uMaxSteps) break;

        vec3 relPos = pos;
        float r2 = dot(relPos, relPos);
        float r = sqrt(r2);
        minR = min(minR, r);

        // 1. Check Event Horizon capture
        if (r <= captureRadius) {
          captured = true;
          break;
        }

        // 2. Check escape to spatial infinity
        if (r > maxRadius && dot(relPos, rayDir) > 0.0) {
          break;
        }

        // Adaptive step size: small near photon sphere & equatorial plane, larger far away
        float distFromHorizon = max(0.035, r - captureRadius * 0.94);
        float verticalProximity = clamp(abs(pos.y) / max(0.2, baseThickness * 3.5), 0.22, 1.0);
        float dt = clamp(distFromHorizon * 0.14 * mix(0.45, 1.0, verticalProximity), 0.016, 0.90);
        if (stepIdx == 0) {
          dt *= (0.78 + 0.22 * dither);
        }

        // 3. Compute General Relativistic Geodesic Acceleration
        // Schwarzschild term: a_GR = -1.5 * R_s * L^2 / r^5 * r_vec
        vec3 angMom = cross(relPos, rayDir);
        float L2 = dot(angMom, angMom);
        float r5 = r2 * r2 * r + 1e-5;
        vec3 accelGR = -1.5 * rs * uLensingStrength * (L2 / r5) * relPos;

        // Kerr Frame-Dragging (Lense-Thirring gravitomagnetic) term:
        float r3_5 = r2 * r * sqrt(r) + 1e-4;
        vec3 accelKerr = (uSpin * uShadowAsymmetry * 0.38 * rs * rs * uLensingStrength / r3_5) * cross(spinAxis, rayDir);

        vec3 totalAccel = accelGR + accelKerr;

        // Velocity-Verlet / Midpoint geodesic integration step
        vec3 midDir = normalize(rayDir + 0.5 * totalAccel * dt);
        vec3 nextPos = pos + midDir * dt;
        vec3 nextDir = normalize(rayDir + totalAccel * dt);

        // Clamp nextPos so a single step never tunnels through the event horizon
        float nextR = length(nextPos);
        if (nextR <= captureRadius * 1.01) {
          captured = true;
          break;
        }

        totalDeflection += length(nextDir - rayDir);

        // 4. Accretion Disk Integration (Analytical Midplane Crossing + Volumetric Slab)
        if (uDiskEnabled > 0.5) {
          // A. Exact Analytical Equatorial Plane Crossing (y = 0)
          if (pos.y * nextPos.y <= 0.0) {
            float denom = pos.y - nextPos.y;
            float tCross = (abs(denom) > 1e-7) ? clamp(pos.y / denom, 0.0, 1.0) : 0.5;
            vec3 crossPos = mix(pos, nextPos, tCross);
            float crossR = length(crossPos.xz);

            if (crossR >= uDiskInnerRadius * 0.94 && crossR <= diskMaxR) {
              vec3 sheetEmit;
              float sheetAlpha;
              sampleAccretionDisk(crossPos, midDir, crossR, sheetEmit, sheetAlpha);

              float cosIncidence = max(0.18, abs(midDir.y));
              float opticalWeight = clamp(sheetAlpha * mix(0.65, 1.15, 1.0 - cosIncidence), 0.0, 0.95);

              accumColor += transmittance * sheetEmit * (0.75 + 0.20 / cosIncidence);
              transmittance *= (1.0 - opticalWeight);
            }
          }

          // B. Subtle Volumetric Corona / Vertical Thickness Slab
          vec3 samplePos = 0.5 * (pos + nextPos);
          float cylR = length(samplePos.xz);
          if (cylR >= uDiskInnerRadius * 0.98 && cylR <= diskMaxR) {
            float localHalfH = baseThickness * (0.20 + 0.09 * (cylR / max(1.0, rs)));
            float absY = abs(samplePos.y);
            if (absY < localHalfH) {
              float vProfile = exp(-pow(absY / max(0.004, localHalfH * 0.48), 2.0) * 2.5);
              vec3 volEmit;
              float volAlpha;
              sampleAccretionDisk(samplePos, midDir, cylR, volEmit, volAlpha);

              float stepWeight = vProfile * dt * (0.28 / max(0.06, baseThickness));
              float stepAlpha = clamp(volAlpha * stepWeight * 0.35, 0.0, 0.75);
              accumColor += transmittance * volEmit * vProfile * stepWeight * 0.32;
              transmittance *= (1.0 - stepAlpha);
            }
          }
        }

        // 5. Optional Relativistic Polar Astrophysical Jets (North & South Poles)
        if (uJetIntensity > 0.01) {
          vec3 pJet = 0.5 * (pos + nextPos);
          float absJetY = abs(pJet.y);
          if (absJetY > rs * 0.95 && absJetY < rs * 22.0) {
            float jetRadius = rs * (0.20 + 0.15 * pow(absJetY / rs, 0.72));
            float distAxis = length(pJet.xz);
            if (distAxis < jetRadius * 2.1) {
              float radialJet = exp(-pow(distAxis / jetRadius, 2.0) * 2.5);
              float axialJet  = smoothstep(rs * 0.95, rs * 2.2, absJetY) * exp(-absJetY / (rs * 10.5));
              float helixAngle = atan(pJet.z, pJet.x) * 2.0 - sign(pJet.y) * absJetY * 1.4 + uTime * 3.8;
              float jetHelix = 0.65 + 0.35 * sin(helixAngle);
              vec3 jetColor = mix(vec3(0.32, 0.62, 1.25), vec3(0.95, 0.82, 1.15), radialJet);
              accumColor += transmittance * jetColor * radialJet * axialJet * jetHelix * uJetIntensity * dt * 0.38;
            }
          }
        }

        // 6. Optional Curved-Spacetime Equatorial Metric Grid
        if (uSpacetimeGrid > 0.5 && pos.y * nextPos.y <= 0.0) {
          float denom = pos.y - nextPos.y;
          float tCross = (abs(denom) > 1e-7) ? clamp(pos.y / denom, 0.0, 1.0) : 0.5;
          vec3 gPos = mix(pos, nextPos, tCross);
          float gR = length(gPos.xz) / rs;
          if (gR > 1.35 && gR < 18.0) {
            float gTheta = atan(gPos.z, gPos.x);
            float radialLine = exp(-pow(abs(fract(gR) - 0.5) - 0.48, 2.0) * 1200.0);
            float spokeLine  = exp(-pow(abs(fract(gTheta * 12.0 / TWO_PI) - 0.5) - 0.48, 2.0) * 900.0);
            float iscoMarker = exp(-pow((gR - uIscoRadius) * 14.0, 2.0));
            float gridMask = clamp(radialLine + spokeLine, 0.0, 1.0) * exp(-gR * 0.12);
            vec3 gridCol = mix(vec3(0.18, 0.58, 0.95) * gridMask * 0.55, vec3(0.25, 1.0, 0.68), iscoMarker * 0.85);
            accumColor += transmittance * gridCol;
          }
        }

        if (transmittance < 0.008) break;

        pos = nextPos;
        rayDir = nextDir;
      }

      // 7. Photon Sphere Critical Ring (strictly on the boundary of the pitch-black Event Horizon Shadow!)
      // Only escaping rays (!captured) whose periapsis minR grazed right outside captureRadius
      // or experienced extreme gravitational deflection form the razor-sharp photon ring.
      if (!captured && uPhotonRingIntensity > 0.01) {
        float grazeDelta = max(0.0, minR - captureRadius);
        float ringSharp = exp(-pow(grazeDelta / (rs * 0.048), 2.0));
        float deflectionRing = smoothstep(1.35, 3.2, totalDeflection) * exp(-grazeDelta / (rs * 0.16));
        vec3 ringTint = (uColorMode == 2)
          ? vec3(0.82, 0.95, 1.28)
          : vec3(1.22, 0.94, 0.56);
        accumColor += transmittance * ringTint * (ringSharp * 1.35 + deflectionRing * 0.55) * uPhotonRingIntensity;
      }

      // 8. Background Celestial Sphere (Lensed Stars + Milky Way) for rays that escape
      if (!captured && transmittance > 0.001) {
        vec3 skyColor = sampleCelestialSky(rayDir, minR, captureRadius);
        accumColor += transmittance * skyColor;
      }

      gl_FragColor = vec4(max(accumColor, vec3(0.0)), 1.0);
    }
  `;

  // ============================================================================
  // PASS 2: HDR Bright-Pass + Multi-Scale Gaussian & IMAX Anamorphic Streak Bloom
  // ============================================================================
  const BLOOM_FRAG = /* glsl */ `
    precision highp float;

    varying vec2 vUv;
    uniform sampler2D uInputTex;
    uniform vec2 uTexelSize;
    uniform vec2 uDirection;
    uniform float uAnamorphicFlare;
    uniform int uPassIndex;

    vec3 extractBright(vec3 c) {
      float lum = dot(c, vec3(0.2126, 0.7152, 0.0722));
      float knee = smoothstep(0.42, 1.35, lum);
      return c * knee;
    }

    void main() {
      // 9-tap separable Gaussian weights
      float weights[5];
      weights[0] = 0.227027;
      weights[1] = 0.1945946;
      weights[2] = 0.1216216;
      weights[3] = 0.054054;
      weights[4] = 0.016216;

      vec3 center = texture2D(uInputTex, vUv).rgb;
      if (uPassIndex == 0) {
        center = extractBright(center);
      }

      vec3 result = center * weights[0];

      for (int i = 1; i < 5; i++) {
        float fi = float(i);
        // Stretch horizontal blur when uDirection.x > 0 to create IMAX 65mm anamorphic streak
        float anamorphicStretch = (uDirection.x > 0.5) ? (1.0 + uAnamorphicFlare * 1.65) : 1.0;
        vec2 offset = uDirection * uTexelSize * (fi * 2.15 * anamorphicStretch);

        vec3 s1 = texture2D(uInputTex, vUv + offset).rgb;
        vec3 s2 = texture2D(uInputTex, vUv - offset).rgb;
        if (uPassIndex == 0) {
          s1 = extractBright(s1);
          s2 = extractBright(s2);
        }
        result += (s1 + s2) * weights[i];
      }

      // Add subtle wide horizontal IMAX cyan-gold lens streak on horizontal pass
      if (uDirection.x > 0.5 && uAnamorphicFlare > 0.02) {
        vec3 streak = vec3(0.0);
        for (int j = 1; j <= 4; j++) {
          float fj = float(j);
          vec2 farOffset = vec2(uTexelSize.x * fj * 14.0 * uAnamorphicFlare, 0.0);
          vec3 a = texture2D(uInputTex, vUv + farOffset).rgb;
          vec3 b = texture2D(uInputTex, vUv - farOffset).rgb;
          if (uPassIndex == 0) {
            a = extractBright(a);
            b = extractBright(b);
          }
          float w = exp(-fj * 0.55) * 0.055;
          streak += (a + b) * w;
        }
        result += streak * vec3(0.95, 0.88, 1.15) * uAnamorphicFlare;
      }

      gl_FragColor = vec4(result, 1.0);
    }
  `;

  // ============================================================================
  // PASS 3: Final Composite + ACES Filmic Tone Mapping + Chromatic Dispersion
  // ============================================================================
  const COMPOSITE_FRAG = /* glsl */ `
    precision highp float;

    varying vec2 vUv;
    uniform sampler2D uSceneTex;
    uniform sampler2D uBloomTex;
    uniform float uBloomStrength;
    uniform float uExposure;
    uniform float uChromaticAberration;
    uniform vec2 uResolution;

    // Narkowicz ACES Filmic Tone Mapping curve
    vec3 acesToneMap(vec3 x) {
      const float a = 2.51;
      const float b = 0.03;
      const float c = 2.43;
      const float d = 0.59;
      const float e = 0.14;
      return clamp((x * (a * x + b)) / (x * (c * x + d) + e), 0.0, 1.0);
    }

    void main() {
      vec2 centered = vUv - 0.5;
      float radialDist = length(centered);

      // Subtle radial chromatic dispersion toward viewport edges
      vec2 caOffset = centered * radialDist * 0.012 * uChromaticAberration;
      vec3 sceneCol;
      sceneCol.r = texture2D(uSceneTex, vUv + caOffset).r;
      sceneCol.g = texture2D(uSceneTex, vUv).g;
      sceneCol.b = texture2D(uSceneTex, vUv - caOffset).b;

      vec3 bloomCol = texture2D(uBloomTex, vUv).rgb;

      vec3 hdr = (sceneCol + bloomCol * uBloomStrength) * uExposure;

      // ACES Filmic Tone Mapping + sRGB gamma correction
      vec3 mapped = acesToneMap(hdr);
      mapped = pow(mapped, vec3(1.0 / 2.2));

      // Subtle IMAX lens vignette
      float vignette = smoothstep(0.95, 0.28, radialDist);
      mapped *= mix(0.76, 1.0, vignette);

      gl_FragColor = vec4(mapped, 1.0);
    }
  `;

  global.GargantuaShaders = {
    VERTEX_SHADER,
    BLACKHOLE_FRAG,
    BLOOM_FRAG,
    COMPOSITE_FRAG
  };
})(window);

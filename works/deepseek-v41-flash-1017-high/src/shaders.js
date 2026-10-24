/**
 * GLSL ES 3.0 sources for the GARGANTUA observation deck.
 *
 * The scene is integrated in the orbital plane of each photon using the exact
 * Schwarzschild null-geodesic orbit equation:
 *
 *     d²u/dφ² + u = (3/2) · Rs · u²        (Rs = 1)
 *
 * where u = 1/r. This is both cheaper and far more stable around the photon
 * sphere than stepping a Cartesian pseudo-force through curved space.
 */

export const FULLSCREEN_VERT = `#version 300 es
precision highp float;
out vec2 vUv;
void main() {
  vec2 p = vec2(
    (gl_VertexID == 1) ? 3.0 : -1.0,
    (gl_VertexID == 2) ? 3.0 : -1.0
  );
  vUv = p * 0.5 + 0.5;
  gl_Position = vec4(p, 0.0, 1.0);
}
`;

export const SCENE_FRAG = `#version 300 es
precision highp float;
precision highp sampler2D;
precision highp samplerCube;

in vec2 vUv;
out vec4 fragColor;

uniform vec2  uResolution;
uniform float uTime;

uniform vec3  uCamPos;
uniform vec3  uCamRight;
uniform vec3  uCamUp;
uniform vec3  uCamForward;
uniform float uTanHalfFov;
uniform float uAspect;

uniform float uLensing;
uniform float uStepScale;
uniform float uShowDisk;
uniform float uDiskInner;
uniform float uDiskOuter;
uniform float uDiskTemperature;
uniform float uDiskBrightness;
uniform float uDoppler;
uniform float uTurbulence;
uniform float uPhotonRing;
uniform float uStarBrightness;
uniform float uNebula;

uniform sampler2D   uDiskTex;
uniform samplerCube uStarTex;

#define PI       3.141592653589793
#define TAU      6.283185307179586
#define RS       1.0
#define R_ESCAPE 90.0
#define MAX_STEPS 520

/* ------------------------------------------------------------------ noise */

float hash13(vec3 p3) {
  p3 = fract(p3 * 0.1031);
  p3 += dot(p3, p3.zyx + 31.32);
  return fract((p3.x + p3.y) * p3.z);
}

float vnoise(vec3 x) {
  vec3 i = floor(x);
  vec3 f = fract(x);
  f = f * f * (3.0 - 2.0 * f);

  float n000 = hash13(i + vec3(0.0, 0.0, 0.0));
  float n100 = hash13(i + vec3(1.0, 0.0, 0.0));
  float n010 = hash13(i + vec3(0.0, 1.0, 0.0));
  float n110 = hash13(i + vec3(1.0, 1.0, 0.0));
  float n001 = hash13(i + vec3(0.0, 0.0, 1.0));
  float n101 = hash13(i + vec3(1.0, 0.0, 1.0));
  float n011 = hash13(i + vec3(0.0, 1.0, 1.0));
  float n111 = hash13(i + vec3(1.0, 1.0, 1.0));

  float x00 = mix(n000, n100, f.x);
  float x10 = mix(n010, n110, f.x);
  float x01 = mix(n001, n101, f.x);
  float x11 = mix(n011, n111, f.x);
  return mix(mix(x00, x10, f.y), mix(x01, x11, f.y), f.z);
}

float fbm3(vec3 p) {
  float value = 0.0;
  float amplitude = 0.5;
  for (int i = 0; i < 3; i++) {
    value += amplitude * vnoise(p);
    p = p * 2.04 + vec3(11.7, 5.3, 9.1);
    amplitude *= 0.5;
  }
  return value;
}

/* -------------------------------------------------------------- blackbody */

vec3 blackbodyLinear(float kelvin) {
  float t = clamp(kelvin, 1000.0, 40000.0) / 100.0;
  float r;
  float g;
  float b;

  if (t <= 66.0) {
    r = 1.0;
    g = clamp(0.3900815 * log(t) - 0.6318414, 0.0, 1.0);
  } else {
    r = clamp(1.292936 * pow(t - 60.0, -0.1332047), 0.0, 1.0);
    g = clamp(1.129891 * pow(t - 60.0, -0.0755148), 0.0, 1.0);
  }

  if (t >= 66.0) {
    b = 1.0;
  } else if (t <= 19.0) {
    b = 0.0;
  } else {
    b = clamp(0.5432068 * log(t - 10.0) - 1.196254, 0.0, 1.0);
  }

  // Approximate sRGB -> linear, then add a touch of saturation so that the
  // post-processing grade lands on Gargantua's signature amber/white palette.
  vec3 srgb = vec3(r, g, b);
  vec3 lin = pow(srgb, vec3(2.2));
  float luma = dot(lin, vec3(0.2126, 0.7152, 0.0722));
  return max(mix(vec3(luma), lin, 1.14), 0.0);
}

/* --------------------------------------------------------------- deep sky */

vec3 sampleSky(vec3 dir) {
  // Explicit LOD 0 is essential here: the sky lookup sits behind a divergent
  // geodesic loop, so implicit derivatives can select absurdly coarse mips.
  vec3 stars = textureLod(uStarTex, dir, 0.0).rgb * uStarBrightness;
  vec3 color = stars;

  if (uNebula > 0.001) {
    vec3 bandAxis = normalize(vec3(0.3, 0.86, 0.42));
    float band = exp(-abs(dot(dir, bandAxis)) * 5.2);
    vec3 p = dir * 3.35;
    float n1 = fbm3(p + vec3(1.3, 2.1, -0.7));
    float n2 = fbm3(p * 2.27 - vec3(4.1, 1.3, 2.7));
    float dust = smoothstep(0.40, 0.72, n2);
    float cloud = smoothstep(0.22, 0.78, n1);
    vec3 cool = vec3(0.010, 0.025, 0.062);
    vec3 warm = vec3(0.105, 0.041, 0.016);
    vec3 nebula = mix(cool, warm, cloud) * (0.25 + 0.75 * n1) * band;
    nebula *= (1.0 - 0.58 * dust);
    nebula += vec3(0.010, 0.014, 0.028) * pow(n1, 2.4) * band * 0.55;
    color += nebula * uNebula * 1.7;
  }

  // Keep the void from ever becoming a dead #000000, like a film negative.
  color += vec3(0.00055, 0.00072, 0.0011);
  return max(color, 0.0);
}

/* --------------------------------------------------------- accretion disk */

vec4 sampleDisk(vec3 pos, vec3 rayDir) {
  float r = length(pos.xz);
  float rIn = uDiskInner;
  float rOut = max(uDiskOuter, rIn + 0.25);

  if (r < rIn * 0.92 || r > rOut * 1.04) {
    return vec4(0.0);
  }

  float t = clamp((r - rIn) / (rOut - rIn), 0.0, 1.0);
  float innerFade = smoothstep(0.0, 0.045, t);
  float outerFade = 1.0 - smoothstep(0.58, 1.0, t);
  float edge = innerFade * outerFade;

  // Differential (Keplerian) rotation of the disk texture. Because the map is
  // periodic in angle, higher radii visibly shear behind the inner flow.
  float angle = atan(pos.z, pos.x);
  float omega = 0.115 * pow(rIn / r, 1.5);
  vec2 diskUv = vec2(angle / TAU + uTime * omega, t);
  vec4 tex = textureLod(uDiskTex, diskUv, 0.0);

  float large = tex.g;
  float detail = mix(0.70, tex.r, clamp(uTurbulence, 0.0, 2.0));
  float hot = tex.b;

  // Radial emission profile. T ~ r^-3/4 gives an incandescent inner rim and a
  // thick amber outer flow.
  float radial = pow(rIn / max(r, 0.1), 0.92);
  float rim = exp(-pow((r - rIn) / (rIn * 0.095), 2.0));
  float profile = edge * (0.18 + 0.82 * radial) * (0.55 + 0.85 * large);
  profile += rim * innerFade * 0.42;

  float brightness = uDiskBrightness * 1.25 * profile;
  brightness *= 0.25 + 0.95 * detail;
  brightness *= 0.82 + 0.36 * smoothstep(0.4, 0.9, hot);

  // Relativistic orbital motion: beaming, Doppler color shift and
  // gravitational redshift. uDoppler = 0 disables the kinematic part.
  vec3 velDir = normalize(vec3(-pos.z, 0.0, pos.x));
  float beta = clamp(sqrt(0.5 / max(r, 1.45)), 0.0, 0.72);
  float gamma = inversesqrt(max(1.0 - beta * beta, 0.001));
  float mu = clamp(dot(velDir, -rayDir), -1.0, 1.0);
  float delta = 1.0 / max(gamma * (1.0 - beta * mu), 0.05);
  float grav = sqrt(max(1.0 - RS / max(r, 1.001), 0.0));

  float shift = grav * mix(1.0, delta, uDoppler);
  float beam = mix(1.0, clamp(pow(delta, 2.6), 0.10, 4.2), uDoppler);
  brightness *= beam;

  float tempFactor = 0.47 + 0.73 * pow(rIn / max(r, 0.1), 0.75);
  float temperature = uDiskTemperature * tempFactor * clamp(shift, 0.42, 2.4);
  vec3 color = blackbodyLinear(temperature);

  // Hot filaments and the inner rim go white-hot, as in the film's grade.
  float whiten = clamp(hot * 0.30 + rim * 0.24 + smoothstep(0.7, 1.0, detail) * 0.12, 0.0, 0.46);
  color = mix(color, vec3(1.0, 0.86, 0.66), whiten);
  color *= 1.05 + 0.38 * smoothstep(0.55, 1.0, detail);

  // Distinctive cool cast for very hot disks; keeps blue-quasar style presets
  // from collapsing into a generic white highlight after tone mapping.
  float coolBias = smoothstep(6500.0, 11000.0, uDiskTemperature) * 0.62;
  color *= mix(vec3(1.0), vec3(0.72, 0.84, 1.34), coolBias);

  // A touch of volume makes the disk feel thicker at grazing angles, while a
  // high opacity keeps the backdrop from showing through the bright flow.
  float alpha = clamp((0.44 + 0.56 * tex.a) * edge * (0.58 + 0.42 * detail), 0.0, 0.985);

  return vec4(color * brightness, alpha);
}

/* ------------------------------------------------------------------- main */

void main() {
  // Normalized device coordinates. The horizontal axis carries exactly one
  // factor of aspect; applying it twice makes the shadow stretch into an egg
  // on wide windows.
  vec2 ndc = gl_FragCoord.xy / uResolution * 2.0 - 1.0;
  ndc.x *= uAspect;

  vec3 rd = normalize(
    uCamForward +
    uCamRight * (ndc.x * uTanHalfFov) +
    uCamUp * (ndc.y * uTanHalfFov)
  );

  vec3 ro = uCamPos;
  float radius0 = max(length(ro), 1.01);
  vec3 e1 = ro / radius0;

  float cosAlpha = dot(rd, e1);
  vec3 tangentVec = rd - e1 * cosAlpha;
  float sinAlpha = length(tangentVec);

  // Exactly radial rays have no orbital plane. The central pixel is inside the
  // shadow anyway, so return the physical black disk rather than divide by 0.
  if (sinAlpha < 0.0018) {
    fragColor = vec4(0.0, 0.0, 0.0, 1.0);
    return;
  }

  vec3 e2 = tangentVec / sinAlpha;

  // Impact parameter measured in the static observer's local frame.
  float b = radius0 * sinAlpha * inversesqrt(max(1.0 - RS / radius0, 0.0025));
  float u = 1.0 / radius0;
  float up2 = 1.0 / (b * b) - u * u + RS * u * u * u;
  float up = -sign(cosAlpha) * sqrt(max(up2, 0.0));

  float phi = 0.0;
  float transmittance = 1.0;
  vec3 accum = vec3(0.0);
  bool captured = false;
  bool escaped = false;
  float dphi = max(uStepScale, 0.008);

  for (int i = 0; i < MAX_STEPS; i++) {
    // Refine the angular step near the photon sphere so that the high-order
    // disk images (and the critical ring) are resolved more cleanly.
    float rHere = 1.0 / max(u, 1.0e-6);
    float stepNow = dphi * mix(0.34, 1.0, smoothstep(1.5, 3.2, rHere));

    // Velocity-Verlet integration of u'' = -u + 1.5 · Rs · u².
    float a0 = -u + 1.5 * uLensing * u * u;
    float um = u + 0.5 * stepNow * up;
    float upm = up + 0.5 * stepNow * a0;
    float am = -um + 1.5 * uLensing * um * um;
    float un = u + stepNow * upm;
    float upn = up + stepNow * am;
    float phiN = phi + stepNow;

    float rN = 1.0 / max(un, 1.0e-6);

    // Detect an equatorial disk crossing during this step.
    if (uShowDisk > 0.5) {
      float y0 = (cos(phi) * e1.y + sin(phi) * e2.y) / max(u, 1.0e-6);
      float y1 = (cos(phiN) * e1.y + sin(phiN) * e2.y) / max(un, 1.0e-6);

      if (y0 * y1 < 0.0) {
        float frac = clamp(y0 / (y0 - y1), 0.0, 1.0);
        float phiC = phi + stepNow * frac;
        float uC = mix(u, un, frac);
        float upC = mix(up, upn, frac);
        float rC = 1.0 / max(uC, 1.0e-6);

        if (rC > uDiskInner * 0.9 && rC < uDiskOuter * 1.05) {
          vec3 radialDir = cos(phiC) * e1 + sin(phiC) * e2;
          vec3 tangentDir = -sin(phiC) * e1 + cos(phiC) * e2;
          vec3 pos = radialDir / max(uC, 1.0e-6);
          vec3 velocity = (-upC / max(uC * uC, 1.0e-6)) * radialDir +
                          (1.0 / max(uC, 1.0e-6)) * tangentDir;
          vec3 rayDir = normalize(velocity);

          vec4 disk = sampleDisk(pos, rayDir);
          if (disk.a > 0.002) {
            accum += transmittance * disk.rgb * disk.a;
            transmittance *= max(0.0, 1.0 - disk.a);
            if (transmittance < 0.008) {
              break;
            }
          }
        }
      }
    }

    if (un >= 1.0 || rN < 1.0) {
      captured = true;
      break;
    }

    if (rN > R_ESCAPE && upn < 0.0) {
      escaped = true;
      break;
    }

    if (un <= 1.0e-5) {
      escaped = upn <= 0.0;
      break;
    }

    u = un;
    up = upn;
    phi = phiN;
  }

  if (!captured && escaped) {
    // Use the asymptotic *velocity* direction, not the radial position at the
    // finite escape radius. The position lags the true direction by ~b/r,
    // which would visibly smear point stars into radial streaks.
    vec3 radialDir = cos(phi) * e1 + sin(phi) * e2;
    vec3 tangentDir = -sin(phi) * e1 + cos(phi) * e2;
    vec3 skyDir = normalize(
      (-up / max(u * u, 1.0e-8)) * radialDir +
      (1.0 / max(u, 1.0e-8)) * tangentDir
    );
    accum += transmittance * sampleSky(skyDir);
  }

  // A smooth critical ring based on the impact parameter, rather than the
  // quantized minimum radius visited during integration. Real higher-order
  // disk images are resolved by the geodesic integration.
  if (uPhotonRing > 0.001 && uLensing > 0.7) {
    float rPhoton = 1.5 * uLensing;
    float bCritical = rPhoton * inversesqrt(max(1.0 - 1.0 / rPhoton, 0.08));
    float ring = exp(-pow((b - bCritical) / 0.065, 2.0));
    ring *= smoothstep(bCritical - 0.015, bCritical + 0.055, b);
    ring *= smoothstep(0.70, 0.92, uLensing);
    vec3 ringColor = blackbodyLinear(uDiskTemperature * 1.04);
    accum += ringColor * ring * uPhotonRing * (0.22 + 0.5 * transmittance);
  }

  accum = max(accum, vec3(0.0));
  accum = min(accum, vec3(64.0));
  fragColor = vec4(accum, 1.0);
}
`;

/* ------------------------------------------------------- disk texture map */

export const DISK_FRAG = `#version 300 es
precision highp float;
in vec2 vUv;
out vec4 fragColor;

#define PI  3.141592653589793
#define TAU 6.283185307179586

float hash13(vec3 p3) {
  p3 = fract(p3 * 0.1031);
  p3 += dot(p3, p3.zyx + 31.32);
  return fract((p3.x + p3.y) * p3.z);
}

float vnoise(vec3 x) {
  vec3 i = floor(x);
  vec3 f = fract(x);
  f = f * f * (3.0 - 2.0 * f);
  float n000 = hash13(i);
  float n100 = hash13(i + vec3(1.0, 0.0, 0.0));
  float n010 = hash13(i + vec3(0.0, 1.0, 0.0));
  float n110 = hash13(i + vec3(1.0, 1.0, 0.0));
  float n001 = hash13(i + vec3(0.0, 0.0, 1.0));
  float n101 = hash13(i + vec3(1.0, 0.0, 1.0));
  float n011 = hash13(i + vec3(0.0, 1.0, 1.0));
  float n111 = hash13(i + vec3(1.0, 1.0, 1.0));
  float x00 = mix(n000, n100, f.x);
  float x10 = mix(n010, n110, f.x);
  float x01 = mix(n001, n101, f.x);
  float x11 = mix(n011, n111, f.x);
  return mix(mix(x00, x10, f.y), mix(x01, x11, f.y), f.z);
}

float fbm(vec3 p, int octaves) {
  float value = 0.0;
  float amp = 0.5;
  for (int i = 0; i < 5; i++) {
    if (i >= octaves) break;
    value += amp * vnoise(p);
    p = p * 2.03 + vec3(7.7, 3.1, 5.3);
    amp *= 0.5;
  }
  return value;
}

void main() {
  float theta = vUv.x * TAU;
  float radial = vUv.y;

  // A cylindrical-noise domain keeps the texture seamless around the disk.
  vec3 p1 = vec3(cos(theta) * 1.55, sin(theta) * 1.55, radial * 5.4 + 1.3);
  float n1 = fbm(p1, 4);

  vec3 p2 = vec3(cos(theta) * 6.2, sin(theta) * 6.2, radial * 17.0 - 2.0);
  float n2 = fbm(p2, 3);

  float spiral = 0.5 + 0.5 * sin(theta * 16.0 + radial * 23.0 + n1 * 9.0 + n2 * 6.0);
  float fine = 0.5 + 0.5 * sin(theta * 52.0 - radial * 44.0 + n2 * 12.0);
  float bands = 0.5 + 0.5 * sin(theta * 8.0 + radial * 11.0 + n1 * 7.0);

  float detail = clamp(0.12 + 0.86 * n1 + 0.40 * n2 + 0.22 * spiral + 0.10 * fine, 0.0, 1.0);
  float density = clamp(0.06 + 1.04 * n1 + 0.35 * n2 + 0.18 * bands, 0.0, 1.0);
  float hot = smoothstep(0.58, 0.86, n2 * 0.65 + fine * 0.35);
  hot *= smoothstep(0.08, 0.72, n1);

  // Slight feathering at the radial ends avoids visible poles in the map.
  float edge = smoothstep(0.0, 0.018, radial) * (1.0 - smoothstep(0.982, 1.0, radial));
  density *= edge;
  detail *= 0.75 + 0.25 * edge;

  fragColor = vec4(detail, density, hot, density);
}
`;

/* ------------------------------------------------------------- bright pass */

export const BRIGHT_FRAG = `#version 300 es
precision highp float;
in vec2 vUv;
out vec4 fragColor;

uniform sampler2D uScene;
uniform vec2  uSourceTexel;
uniform float uThreshold;

void main() {
  vec2 o = uSourceTexel * 0.5;
  vec3 c = texture(uScene, vUv + vec2(-o.x, -o.y)).rgb;
  c += texture(uScene, vUv + vec2( o.x, -o.y)).rgb;
  c += texture(uScene, vUv + vec2(-o.x,  o.y)).rgb;
  c += texture(uScene, vUv + vec2( o.x,  o.y)).rgb;
  c *= 0.25;

  float level = max(max(c.r, c.g), c.b);
  float weight = smoothstep(uThreshold, uThreshold + 0.65, level);
  c *= weight;
  c = min(c, vec3(24.0));
  fragColor = vec4(c, 1.0);
}
`;

/* -------------------------------------------------------------- blur pass */

export const BLUR_FRAG = `#version 300 es
precision highp float;
in vec2 vUv;
out vec4 fragColor;

uniform sampler2D uImage;
uniform vec2 uDirection;

void main() {
  vec3 color = texture(uImage, vUv).rgb * 0.2270270270;
  color += texture(uImage, vUv + uDirection * 1.3846153846).rgb * 0.3162162162;
  color += texture(uImage, vUv - uDirection * 1.3846153846).rgb * 0.3162162162;
  color += texture(uImage, vUv + uDirection * 3.2307692308).rgb * 0.0702702703;
  color += texture(uImage, vUv - uDirection * 3.2307692308).rgb * 0.0702702703;
  fragColor = vec4(color, 1.0);
}
`;

/* -------------------------------------------------------------- composite */

export const COMPOSITE_FRAG = `#version 300 es
precision highp float;
in vec2 vUv;
out vec4 fragColor;

uniform sampler2D uScene;
uniform sampler2D uBloom;
uniform vec2  uResolution;
uniform float uTime;
uniform float uExposure;
uniform float uBloomStrength;

float hash12(vec2 p) {
  vec3 p3 = fract(vec3(p.xyx) * 0.1031);
  p3 += dot(p3, p3.yzx + 33.33);
  return fract((p3.x + p3.y) * p3.z);
}

vec3 acesFilm(vec3 x) {
  const float a = 2.51;
  const float b = 0.03;
  const float c = 2.43;
  const float d = 0.59;
  const float e = 0.14;
  return clamp((x * (a * x + b)) / (x * (c * x + d) + e), 0.0, 1.0);
}

void main() {
  vec2 uv = vUv;
  vec2 centered = uv - 0.5;
  float aspect = uResolution.x / max(uResolution.y, 1.0);

  // Very subtle lateral chromatic aberration toward the frame edges.
  float edge = dot(centered, centered);
  vec2 ca = centered * edge * 0.0028;
  vec3 scene;
  scene.r = texture(uScene, uv + ca).r;
  scene.g = texture(uScene, uv).g;
  scene.b = texture(uScene, uv - ca).b;

  vec3 bloom = texture(uBloom, uv).rgb;
  vec2 sx = vec2(0.014, 0.0);
  vec3 streak = texture(uBloom, uv + sx).rgb +
                texture(uBloom, uv - sx).rgb +
                0.5 * texture(uBloom, uv + sx * 2.4).rgb +
                0.5 * texture(uBloom, uv - sx * 2.4).rgb;

  vec3 color = scene;
  color += bloom * uBloomStrength;
  color += streak * vec3(0.95, 0.56, 0.28) * uBloomStrength * 0.16;

  color *= uExposure;

  // Warm highlights, slightly cool shadows — a small nod to the film grade.
  float luma = dot(color, vec3(0.2126, 0.7152, 0.0722));
  color = mix(color, color * vec3(1.035, 1.0, 0.945), smoothstep(0.1, 2.5, luma));

  color = acesFilm(color);
  color = pow(max(color, 0.0), vec3(1.0 / 2.2));

  // Vignette
  vec2 q = centered * vec2(aspect, 1.0);
  float radial = length(q);
  color *= 1.0 - 0.34 * smoothstep(0.34, 1.04, radial);

  // Fine film grain, strongest in the shadows.
  float grain = hash12(uv * uResolution + fract(uTime) * 431.17) - 0.5;
  color += grain * (0.008 + 0.020 * (1.0 - dot(color, vec3(0.299, 0.587, 0.114))));

  // Ordered-ish dithering to break up gradient banding on the shadow rim.
  color += (hash12(uv * uResolution + vec2(19.7, 7.3)) - 0.5) / 255.0;

  fragColor = vec4(clamp(color, 0.0, 1.0), 1.0);
}
`;

(() => {
  // src/params.js
  var DEFAULTS = Object.freeze({
    distance: 22,
    elevation: 5.2,
    fov: 44,
    lensing: 1,
    showDisk: true,
    diskInner: 2.7,
    diskOuter: 15,
    temperature: 4e3,
    diskBrightness: 0.7,
    doppler: 0.75,
    turbulence: 1,
    exposure: 0.8,
    bloom: 0.35,
    stars: 0.5,
    nebula: 0.55,
    photonRing: 0.35,
    timeSpeed: 1,
    autoOrbit: true,
    quality: "auto"
  });
  var ORBIT_SPEED = 0.0125;
  var PRESETS = [
    {
      id: "gargantua",
      name: "\u5361\u5188\u56FE\u96C5",
      meta: "GARGANTUA \xB7 \u7ECF\u5178\u89C6\u89D2",
      values: {
        distance: 22,
        elevation: 5.2,
        fov: 44,
        lensing: 1,
        showDisk: true,
        diskInner: 2.7,
        diskOuter: 15,
        temperature: 4e3,
        diskBrightness: 0.7,
        doppler: 0.75,
        turbulence: 1,
        exposure: 0.8,
        bloom: 0.35,
        stars: 0.5,
        nebula: 0.55,
        photonRing: 0.35,
        timeSpeed: 1
      }
    },
    {
      id: "close-pass",
      name: "\u8FD1\u8DDD\u63A0\u5F71",
      meta: "GRAZING \xB7 7.0 Rs",
      values: {
        distance: 7,
        elevation: 4,
        fov: 62,
        lensing: 1.05,
        showDisk: true,
        diskInner: 2.5,
        diskOuter: 12.5,
        temperature: 4500,
        diskBrightness: 0.65,
        doppler: 0.95,
        turbulence: 1.05,
        exposure: 0.68,
        bloom: 0.4,
        stars: 0.55,
        nebula: 0.45,
        photonRing: 0.5,
        timeSpeed: 1.25
      }
    },
    {
      id: "lens-only",
      name: "\u5F15\u529B\u4E4B\u77B3",
      meta: "LENSING \xB7 \u65E0\u5438\u79EF\u76D8",
      values: {
        distance: 12.5,
        elevation: 18,
        fov: 54,
        lensing: 1.4,
        showDisk: false,
        exposure: 1.1,
        bloom: 0.25,
        stars: 1.1,
        nebula: 0.8,
        photonRing: 0.15,
        autoOrbit: true
      }
    },
    {
      id: "red-giant",
      name: "\u7EA2\u5DE8\u661F",
      meta: "COOL \xB7 2900 K",
      values: {
        distance: 27,
        elevation: 10,
        fov: 42,
        lensing: 1.05,
        showDisk: true,
        diskInner: 3.6,
        diskOuter: 16.5,
        temperature: 2900,
        diskBrightness: 0.58,
        doppler: 0.4,
        turbulence: 1.15,
        exposure: 0.85,
        bloom: 0.32,
        stars: 0.6,
        nebula: 0.75,
        photonRing: 0.3,
        autoOrbit: true
      }
    },
    {
      id: "blue-quasar",
      name: "\u84DD\u7C7B\u661F\u4F53",
      meta: "HOT \xB7 11 500 K",
      values: {
        distance: 17.5,
        elevation: 5,
        fov: 50,
        lensing: 1.15,
        showDisk: true,
        diskInner: 2.4,
        diskOuter: 12,
        temperature: 11500,
        diskBrightness: 0.72,
        doppler: 1.05,
        turbulence: 1.25,
        exposure: 0.64,
        bloom: 0.35,
        stars: 0.7,
        nebula: 0.35,
        photonRing: 0.5,
        autoOrbit: true
      }
    },
    {
      id: "edge-on",
      name: "\u4FA7\u5411\u51CC\u65E5",
      meta: "EDGE-ON \xB7 1.2\xB0",
      values: {
        distance: 16,
        elevation: 1.2,
        fov: 42,
        lensing: 0.92,
        showDisk: true,
        diskInner: 2.9,
        diskOuter: 17.5,
        temperature: 3900,
        diskBrightness: 0.78,
        doppler: 0.45,
        turbulence: 0.95,
        exposure: 0.8,
        bloom: 0.38,
        stars: 0.6,
        nebula: 0.5,
        photonRing: 0.32,
        autoOrbit: true
      }
    }
  ];
  var CONTROL_GROUPS = [
    {
      id: "spacetime",
      index: "01",
      title: "\u65F6\u7A7A\u4E0E\u89C2\u6D4B",
      en: "SPACETIME & OPTICS",
      controls: [
        {
          key: "distance",
          label: "\u89C2\u6D4B\u8DDD\u79BB",
          unit: "R\u209B",
          min: 5,
          max: 40,
          step: 0.5,
          digits: 1,
          hint: "\u76F8\u673A\u5230\u5947\u70B9\u7684\u8DDD\u79BB"
        },
        {
          key: "elevation",
          label: "\u89C6\u7EBF\u4EF0\u89D2",
          unit: "\xB0",
          min: 1,
          max: 85,
          step: 0.5,
          digits: 0,
          hint: "\u76F8\u673A\u76F8\u5BF9\u5438\u79EF\u76D8\u8D64\u9053\u9762\u7684\u4EF0\u89D2"
        },
        {
          key: "fov",
          label: "\u89C6\u573A\u89D2",
          unit: "\xB0",
          min: 24,
          max: 90,
          step: 1,
          digits: 0,
          hint: "\u5782\u76F4\u89C6\u573A\u89D2\uFF0C\u7C7B\u4F3C\u955C\u5934\u7126\u8DDD"
        },
        {
          key: "lensing",
          label: "\u5F15\u529B\u900F\u955C\u5F3A\u5EA6",
          unit: "\xD7",
          min: 0.3,
          max: 1.8,
          step: 0.05,
          digits: 2,
          hint: "\u6D4B\u5730\u7EBF\u504F\u6298\u9879\u7684\u827A\u672F\u7F29\u653E\uFF1B1.00 \u4E3A\u53F2\u74E6\u897F\u7406\u8BBA\u503C"
        }
      ]
    },
    {
      id: "disk",
      index: "02",
      title: "\u5438\u79EF\u76D8",
      en: "ACCRETION DISK",
      controls: [
        {
          key: "diskInner",
          label: "\u5438\u79EF\u76D8\u5185\u5F84",
          unit: "R\u209B",
          min: 1.6,
          max: 6,
          step: 0.1,
          digits: 1,
          hint: "\u5438\u79EF\u76D8\u5185\u7F18\u534A\u5F84"
        },
        {
          key: "diskOuter",
          label: "\u5438\u79EF\u76D8\u5916\u5F84",
          unit: "R\u209B",
          min: 6,
          max: 30,
          step: 0.5,
          digits: 1,
          hint: "\u5438\u79EF\u76D8\u5916\u7F18\u534A\u5F84"
        },
        {
          key: "temperature",
          label: "\u76D8\u9762\u8272\u6E29",
          unit: "K",
          min: 2200,
          max: 12e3,
          step: 100,
          digits: 0,
          hint: "\u9ED1\u4F53\u8F90\u5C04\u6E29\u5EA6\uFF0C\u51B3\u5B9A\u76D8\u9762\u8272\u5F69"
        },
        {
          key: "diskBrightness",
          label: "\u76D8\u9762\u4EAE\u5EA6",
          unit: "\xD7",
          min: 0.2,
          max: 2.5,
          step: 0.05,
          digits: 2,
          hint: "\u5438\u79EF\u76D8\u53D1\u5149\u5F3A\u5EA6"
        },
        {
          key: "doppler",
          label: "\u76F8\u5BF9\u8BBA\u591A\u666E\u52D2",
          unit: "",
          min: 0,
          max: 1.5,
          step: 0.05,
          digits: 2,
          hint: "\u8F68\u9053\u8FD0\u52A8\u5F15\u8D77\u7684\u589E\u4EAE\u4E0E\u8272\u79FB\uFF1B0 \u4E3A\u5173\u95ED"
        },
        {
          key: "turbulence",
          label: "\u6E4D\u6D41\u7EC6\u8282",
          unit: "",
          min: 0,
          max: 1.5,
          step: 0.05,
          digits: 2,
          hint: "\u76D8\u9762\u4E1D\u72B6\u6D41\u4E0E\u70ED\u6591\u7684\u5BF9\u6BD4\u5EA6"
        }
      ],
      toggle: {
        key: "showDisk",
        label: "\u663E\u793A\u5438\u79EF\u76D8",
        hint: "\u5173\u95ED\u540E\u4EC5\u4FDD\u7559\u5F15\u529B\u900F\u955C\u661F\u7A7A"
      }
    },
    {
      id: "imaging",
      index: "03",
      title: "\u5F71\u50CF\u4E0E\u540E\u671F",
      en: "IMAGING & POST",
      controls: [
        {
          key: "exposure",
          label: "\u66DD\u5149",
          unit: "EV",
          min: 0.4,
          max: 2,
          step: 0.05,
          digits: 2,
          hint: "\u6574\u4F53\u66DD\u5149\u589E\u76CA"
        },
        {
          key: "bloom",
          label: "\u8F89\u5149",
          unit: "",
          min: 0,
          max: 2,
          step: 0.05,
          digits: 2,
          hint: "\u9AD8\u5149\u6EA2\u51FA\u7684\u5F3A\u5EA6"
        },
        {
          key: "stars",
          label: "\u661F\u7A7A\u4EAE\u5EA6",
          unit: "\xD7",
          min: 0,
          max: 2,
          step: 0.05,
          digits: 2,
          hint: "\u80CC\u666F\u6052\u661F\u4EAE\u5EA6"
        },
        {
          key: "nebula",
          label: "\u6DF1\u7A7A\u661F\u4E91",
          unit: "",
          min: 0,
          max: 2,
          step: 0.05,
          digits: 2,
          hint: "\u94F6\u6CB3\u5C18\u57C3\u4E0E\u661F\u4E91\u8F89\u5149"
        },
        {
          key: "photonRing",
          label: "\u5149\u5B50\u73AF\u589E\u5F3A",
          unit: "",
          min: 0,
          max: 2,
          step: 0.05,
          digits: 2,
          hint: "\u7D27\u8D34\u9634\u5F71\u8FB9\u7F18\u7684\u4E34\u754C\u73AF\u8F89\u5149"
        },
        {
          key: "timeSpeed",
          label: "\u65F6\u95F4\u6D41\u901F",
          unit: "\xD7",
          min: 0,
          max: 3,
          step: 0.05,
          digits: 2,
          hint: "\u5438\u79EF\u76D8\u65CB\u8F6C\u4E0E\u95EA\u70C1\u901F\u5EA6"
        }
      ]
    }
  ];
  var QUALITY_OPTIONS = [
    { value: "auto", label: "\u81EA\u9002\u5E94 \xB7 AUTO" },
    { value: "high", label: "\u7CBE\u7EC6 \xB7 HIGH" },
    { value: "balanced", label: "\u5747\u8861 \xB7 BALANCED" },
    { value: "performance", label: "\u6D41\u7545 \xB7 FAST" }
  ];

  // src/shaders.js
  var FULLSCREEN_VERT = `#version 300 es
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
  var SCENE_FRAG = `#version 300 es
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

    // Velocity-Verlet integration of u'' = -u + 1.5 \xB7 Rs \xB7 u\xB2.
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
  var DISK_FRAG = `#version 300 es
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
  var BRIGHT_FRAG = `#version 300 es
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
  var BLUR_FRAG = `#version 300 es
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
  var COMPOSITE_FRAG = `#version 300 es
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

  // Warm highlights, slightly cool shadows \u2014 a small nod to the film grade.
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

  // src/celestial.js
  var STAR_COLORS = [
    [0.58, 0.69, 1],
    [0.76, 0.84, 1],
    [0.92, 0.94, 1],
    [1, 0.97, 0.88],
    [1, 0.88, 0.66],
    [1, 0.73, 0.48],
    [1, 0.58, 0.4]
  ];
  var COLOR_WEIGHTS = [0.06, 0.13, 0.27, 0.27, 0.17, 0.07, 0.03];
  function mulberry32(seed) {
    let a = seed >>> 0;
    return function random() {
      a = a + 1831565813 >>> 0;
      let t = Math.imul(a ^ a >>> 15, 1 | a);
      t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
      return ((t ^ t >>> 14) >>> 0) / 4294967296;
    };
  }
  function pickStarColor(random) {
    let value = random();
    let index = 0;
    for (let i = 0; i < COLOR_WEIGHTS.length; i++) {
      value -= COLOR_WEIGHTS[i];
      index = i;
      if (value <= 0) break;
    }
    return STAR_COLORS[index];
  }
  function createStarCubemap(gl, options = {}) {
    const size = options.size ?? 1024;
    const starsPerFace = options.starsPerFace ?? 6e3;
    const seed = options.seed ?? 2654435769;
    const onProgress = options.onProgress;
    const random = mulberry32(seed);
    const faces = [];
    const total = size * size;
    for (let face = 0; face < 6; face++) {
      const canvas2 = document.createElement("canvas");
      canvas2.width = size;
      canvas2.height = size;
      const ctx = canvas2.getContext("2d", { alpha: false });
      const image = ctx.createImageData(size, size);
      const pixels = image.data;
      const rgb = new Float32Array(total * 3);
      for (let i = 0; i < starsPerFace; i++) {
        const cx = random() * size;
        const cy = random() * size;
        const brightnessRoll = random();
        const amplitude = 0.01 + Math.pow(brightnessRoll, 3.15) * 1.7;
        const sigma = 0.34 + random() * 0.34;
        const haloR = 0.75 + random() * 1.35;
        const color = pickStarColor(random);
        const haloWeight = 0.012 + Math.pow(brightnessRoll, 2.2) * 0.062;
        const reach = Math.ceil(Math.max(sigma * 3.2, haloR * 2.8));
        const x0 = Math.max(0, Math.floor(cx - reach));
        const x1 = Math.min(size - 1, Math.ceil(cx + reach));
        const y0 = Math.max(0, Math.floor(cy - reach));
        const y1 = Math.min(size - 1, Math.ceil(cy + reach));
        const invCore = 1 / (2 * sigma * sigma);
        const invHalo = 1 / Math.max(haloR * 0.55, 1e-3);
        for (let y = y0; y <= y1; y++) {
          const dy = y + 0.5 - cy;
          for (let x = x0; x <= x1; x++) {
            const dx = x + 0.5 - cx;
            const d2 = dx * dx + dy * dy;
            const core = Math.exp(-d2 * invCore);
            const halo = Math.exp(-Math.sqrt(d2) * invHalo) * haloWeight;
            const weight = core + halo;
            if (weight < 2e-3) continue;
            const idx = (y * size + x) * 3;
            rgb[idx] += color[0] * amplitude * weight;
            rgb[idx + 1] += color[1] * amplitude * weight;
            rgb[idx + 2] += color[2] * amplitude * weight;
          }
        }
      }
      const dustCount = Math.floor(starsPerFace * 1.8);
      for (let i = 0; i < dustCount; i++) {
        const x = Math.floor(random() * size);
        const y = Math.floor(random() * size);
        const amplitude = 6e-3 + Math.pow(random(), 3.8) * 0.055;
        const tint = pickStarColor(random);
        const idx = (y * size + x) * 3;
        rgb[idx] += tint[0] * amplitude;
        rgb[idx + 1] += tint[1] * amplitude;
        rgb[idx + 2] += tint[2] * amplitude;
      }
      for (let i = 0; i < total; i++) {
        const src = i * 3;
        const dst = i * 4;
        pixels[dst] = Math.min(255, Math.round(rgb[src] * 255));
        pixels[dst + 1] = Math.min(255, Math.round(rgb[src + 1] * 255));
        pixels[dst + 2] = Math.min(255, Math.round(rgb[src + 2] * 255));
        pixels[dst + 3] = 255;
      }
      ctx.putImageData(image, 0, 0);
      faces.push(canvas2);
      onProgress?.((face + 1) / 6);
    }
    const texture = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_CUBE_MAP, texture);
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
    const facesTargets = [
      gl.TEXTURE_CUBE_MAP_POSITIVE_X,
      gl.TEXTURE_CUBE_MAP_NEGATIVE_X,
      gl.TEXTURE_CUBE_MAP_POSITIVE_Y,
      gl.TEXTURE_CUBE_MAP_NEGATIVE_Y,
      gl.TEXTURE_CUBE_MAP_POSITIVE_Z,
      gl.TEXTURE_CUBE_MAP_NEGATIVE_Z
    ];
    for (let i = 0; i < 6; i++) {
      gl.texImage2D(
        facesTargets[i],
        0,
        gl.RGBA8,
        gl.RGBA,
        gl.UNSIGNED_BYTE,
        faces[i]
      );
    }
    gl.texParameteri(gl.TEXTURE_CUBE_MAP, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_CUBE_MAP, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_CUBE_MAP, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_CUBE_MAP, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_CUBE_MAP, gl.TEXTURE_WRAP_R, gl.CLAMP_TO_EDGE);
    gl.bindTexture(gl.TEXTURE_CUBE_MAP, null);
    return { texture, starCount: starsPerFace * 6 };
  }

  // src/renderer.js
  var DISK_TEXTURE_WIDTH = 2048;
  var DISK_TEXTURE_HEIGHT = 1024;
  function assert(condition, message) {
    if (!condition) throw new Error(message);
  }
  var Renderer = class {
    constructor(canvas2) {
      this.canvas = canvas2;
      this.gl = canvas2.getContext("webgl2", {
        alpha: false,
        depth: false,
        stencil: false,
        antialias: false,
        preserveDrawingBuffer: true,
        powerPreference: "high-performance",
        desynchronized: true
      });
      assert(this.gl, "WebGL2 is not available in this browser.");
      const gl = this.gl;
      this.maxTextureSize = gl.getParameter(gl.MAX_TEXTURE_SIZE);
      this.floatRenderTargets = !!gl.getExtension("EXT_color_buffer_float");
      this.hdrTargets = this.floatRenderTargets;
      this.anisotropy = gl.getExtension("EXT_texture_filter_anisotropic");
      this.width = 1;
      this.height = 1;
      this.sceneScale = 0.85;
      this.sceneTarget = null;
      this.bloomA = null;
      this.bloomB = null;
      this.emptyVao = gl.createVertexArray();
      this.contextLost = false;
      canvas2.addEventListener("webglcontextlost", (event) => {
        event.preventDefault();
        this.contextLost = true;
      });
      canvas2.addEventListener("webglcontextrestored", () => {
        this.contextLost = false;
        window.location.reload();
      });
    }
    async initialize(onProgress = async () => {
    }) {
      await onProgress(0.06, "\u94FE\u63A5\u5F15\u529B\u900F\u955C\u7BA1\u7EBF");
      this.programs = {
        scene: this.createProgram(SCENE_FRAG, "geodesic scene"),
        disk: this.createProgram(DISK_FRAG, "disk texture"),
        bright: this.createProgram(BRIGHT_FRAG, "bloom bright-pass"),
        blur: this.createProgram(BLUR_FRAG, "bloom blur"),
        composite: this.createProgram(COMPOSITE_FRAG, "composite")
      };
      this.uniforms = {
        scene: this.uniformMap(this.programs.scene, [
          "uResolution",
          "uTime",
          "uCamPos",
          "uCamRight",
          "uCamUp",
          "uCamForward",
          "uTanHalfFov",
          "uAspect",
          "uLensing",
          "uStepScale",
          "uShowDisk",
          "uDiskInner",
          "uDiskOuter",
          "uDiskTemperature",
          "uDiskBrightness",
          "uDoppler",
          "uTurbulence",
          "uPhotonRing",
          "uStarBrightness",
          "uNebula",
          "uDiskTex",
          "uStarTex"
        ]),
        bright: this.uniformMap(this.programs.bright, ["uScene", "uSourceTexel", "uThreshold"]),
        blur: this.uniformMap(this.programs.blur, ["uImage", "uDirection"]),
        composite: this.uniformMap(this.programs.composite, [
          "uScene",
          "uBloom",
          "uResolution",
          "uTime",
          "uExposure",
          "uBloomStrength"
        ])
      };
      await onProgress(0.2, "\u6C42\u89E3\u5438\u79EF\u76D8\u6E4D\u6D41\u573A");
      this.buildDiskTexture();
      await onProgress(0.48, "\u64AD\u6492\u6DF1\u7A7A\u6052\u661F\u5929\u7403");
      this.buildStarfield();
      await onProgress(0.82, "\u6821\u51C6\u5149\u5B50\u73AF\u4E0E\u66DD\u5149");
      this.allocateTargets();
      const gl = this.gl;
      gl.disable(gl.DEPTH_TEST);
      gl.disable(gl.CULL_FACE);
      gl.disable(gl.BLEND);
      gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1);
      await onProgress(1, "\u89C2\u6D4B\u94FE\u8DEF\u5C31\u7EEA");
    }
    /* ----------------------------------------------------------- shader utils */
    compileShader(type, source, label) {
      const gl = this.gl;
      const shader = gl.createShader(type);
      gl.shaderSource(shader, source);
      gl.compileShader(shader);
      if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
        const log = gl.getShaderInfoLog(shader);
        gl.deleteShader(shader);
        throw new Error(`${label} shader failed to compile:
${log}`);
      }
      return shader;
    }
    createProgram(fragmentSource, label) {
      const gl = this.gl;
      const program = gl.createProgram();
      const vs = this.compileShader(gl.VERTEX_SHADER, FULLSCREEN_VERT, `${label} vertex`);
      const fs = this.compileShader(gl.FRAGMENT_SHADER, fragmentSource, label);
      gl.attachShader(program, vs);
      gl.attachShader(program, fs);
      gl.linkProgram(program);
      gl.deleteShader(vs);
      gl.deleteShader(fs);
      if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
        const log = gl.getProgramInfoLog(program);
        gl.deleteProgram(program);
        throw new Error(`${label} program failed to link:
${log}`);
      }
      return program;
    }
    uniformMap(program, names) {
      const gl = this.gl;
      const result = {};
      for (const name of names) result[name] = gl.getUniformLocation(program, name);
      return result;
    }
    /* --------------------------------------------------------------- textures */
    buildDiskTexture() {
      const gl = this.gl;
      const width = DISK_TEXTURE_WIDTH;
      const height = DISK_TEXTURE_HEIGHT;
      const texture = gl.createTexture();
      gl.bindTexture(gl.TEXTURE_2D, texture);
      gl.texImage2D(
        gl.TEXTURE_2D,
        0,
        gl.RGBA8,
        width,
        height,
        0,
        gl.RGBA,
        gl.UNSIGNED_BYTE,
        null
      );
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.REPEAT);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      if (this.anisotropy) {
        gl.texParameterf(
          gl.TEXTURE_2D,
          this.anisotropy.TEXTURE_MAX_ANISOTROPY_EXT,
          Math.min(4, gl.getParameter(this.anisotropy.MAX_TEXTURE_MAX_ANISOTROPY_EXT))
        );
      }
      const framebuffer = gl.createFramebuffer();
      gl.bindFramebuffer(gl.FRAMEBUFFER, framebuffer);
      gl.framebufferTexture2D(
        gl.FRAMEBUFFER,
        gl.COLOR_ATTACHMENT0,
        gl.TEXTURE_2D,
        texture,
        0
      );
      assert(
        gl.checkFramebufferStatus(gl.FRAMEBUFFER) === gl.FRAMEBUFFER_COMPLETE,
        "Could not create the accretion-disk texture target."
      );
      gl.viewport(0, 0, width, height);
      gl.useProgram(this.programs.disk);
      gl.bindVertexArray(this.emptyVao);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
      gl.bindTexture(gl.TEXTURE_2D, null);
      gl.deleteFramebuffer(framebuffer);
      this.diskTexture = texture;
    }
    buildStarfield() {
      const result = createStarCubemap(this.gl, {
        size: 1024,
        starsPerFace: 4800,
        seed: 5370206
      });
      this.starTexture = result.texture;
      this.starCount = result.starCount;
    }
    /* ---------------------------------------------------------------- targets */
    createRenderTarget(width, height) {
      const gl = this.gl;
      const texture = gl.createTexture();
      gl.bindTexture(gl.TEXTURE_2D, texture);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      const tryFormat = (internalFormat, type) => {
        gl.texImage2D(gl.TEXTURE_2D, 0, internalFormat, width, height, 0, gl.RGBA, type, null);
        gl.bindFramebuffer(gl.FRAMEBUFFER, framebuffer);
        gl.framebufferTexture2D(
          gl.FRAMEBUFFER,
          gl.COLOR_ATTACHMENT0,
          gl.TEXTURE_2D,
          texture,
          0
        );
        return gl.checkFramebufferStatus(gl.FRAMEBUFFER) === gl.FRAMEBUFFER_COMPLETE;
      };
      const framebuffer = gl.createFramebuffer();
      let ok = false;
      if (this.floatRenderTargets) {
        ok = tryFormat(gl.RGBA16F, gl.HALF_FLOAT);
      }
      if (!ok) {
        this.hdrTargets = false;
        ok = tryFormat(gl.RGBA8, gl.UNSIGNED_BYTE);
      }
      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
      gl.bindTexture(gl.TEXTURE_2D, null);
      assert(ok, "Could not create an HDR render target.");
      return { texture, framebuffer, width, height };
    }
    destroyTarget(target) {
      if (!target) return;
      const gl = this.gl;
      gl.deleteTexture(target.texture);
      gl.deleteFramebuffer(target.framebuffer);
    }
    allocateTargets() {
      const gl = this.gl;
      this.destroyTarget(this.sceneTarget);
      this.destroyTarget(this.bloomA);
      this.destroyTarget(this.bloomB);
      const dprScene = Math.max(0.25, this.sceneScale);
      const sceneW = Math.min(
        this.maxTextureSize,
        Math.max(2, Math.round(this.width * dprScene))
      );
      const sceneH = Math.min(
        this.maxTextureSize,
        Math.max(2, Math.round(this.height * dprScene))
      );
      this.sceneTarget = this.createRenderTarget(sceneW, sceneH);
      const bloomW = Math.max(2, Math.round(sceneW / 4));
      const bloomH = Math.max(2, Math.round(sceneH / 4));
      this.bloomA = this.createRenderTarget(bloomW, bloomH);
      this.bloomB = this.createRenderTarget(bloomW, bloomH);
      gl.bindTexture(gl.TEXTURE_2D, null);
    }
    resize(width, height, sceneScale = this.sceneScale) {
      const gl = this.gl;
      width = Math.max(2, Math.floor(width));
      height = Math.max(2, Math.floor(height));
      this.sceneScale = Math.max(0.25, Math.min(1.5, sceneScale));
      const sizeChanged = this.canvas.width !== width || this.canvas.height !== height;
      if (sizeChanged) {
        this.canvas.width = width;
        this.canvas.height = height;
        this.width = width;
        this.height = height;
      }
      if (sizeChanged || !this.sceneTarget) {
        this.allocateTargets();
      }
    }
    setSceneScale(sceneScale) {
      const next = Math.max(0.35, Math.min(1.5, sceneScale));
      if (Math.abs(next - this.sceneScale) < 0.015) return;
      this.sceneScale = next;
      this.allocateTargets();
    }
    /* ------------------------------------------------------------------ passes */
    drawFullscreen() {
      const gl = this.gl;
      gl.bindVertexArray(this.emptyVao);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
    }
    render(state2, camera2, time) {
      if (this.contextLost || !this.sceneTarget) return;
      const gl = this.gl;
      gl.disable(gl.BLEND);
      gl.disable(gl.DEPTH_TEST);
      const sceneW = this.sceneTarget.width;
      const sceneH = this.sceneTarget.height;
      gl.bindFramebuffer(gl.FRAMEBUFFER, this.sceneTarget.framebuffer);
      gl.viewport(0, 0, sceneW, sceneH);
      gl.useProgram(this.programs.scene);
      const u = this.uniforms.scene;
      gl.uniform2f(u.uResolution, sceneW, sceneH);
      gl.uniform1f(u.uTime, time);
      gl.uniform3f(u.uCamPos, camera2.position[0], camera2.position[1], camera2.position[2]);
      gl.uniform3f(u.uCamRight, camera2.right[0], camera2.right[1], camera2.right[2]);
      gl.uniform3f(u.uCamUp, camera2.up[0], camera2.up[1], camera2.up[2]);
      gl.uniform3f(u.uCamForward, camera2.forward[0], camera2.forward[1], camera2.forward[2]);
      gl.uniform1f(u.uTanHalfFov, Math.tan(state2.fov * Math.PI / 360));
      gl.uniform1f(u.uAspect, sceneW / sceneH);
      gl.uniform1f(u.uLensing, state2.lensing);
      gl.uniform1f(u.uStepScale, this.stepScaleForQuality(state2.quality));
      gl.uniform1f(u.uShowDisk, state2.showDisk ? 1 : 0);
      gl.uniform1f(u.uDiskInner, state2.diskInner);
      gl.uniform1f(u.uDiskOuter, state2.diskOuter);
      gl.uniform1f(u.uDiskTemperature, state2.temperature);
      gl.uniform1f(u.uDiskBrightness, state2.diskBrightness);
      gl.uniform1f(u.uDoppler, state2.doppler);
      gl.uniform1f(u.uTurbulence, state2.turbulence);
      gl.uniform1f(u.uPhotonRing, state2.photonRing);
      gl.uniform1f(u.uStarBrightness, state2.stars);
      gl.uniform1f(u.uNebula, state2.nebula);
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, this.diskTexture);
      gl.uniform1i(u.uDiskTex, 0);
      gl.activeTexture(gl.TEXTURE1);
      gl.bindTexture(gl.TEXTURE_CUBE_MAP, this.starTexture);
      gl.uniform1i(u.uStarTex, 1);
      this.drawFullscreen();
      gl.bindFramebuffer(gl.FRAMEBUFFER, this.bloomA.framebuffer);
      gl.viewport(0, 0, this.bloomA.width, this.bloomA.height);
      gl.useProgram(this.programs.bright);
      const ub = this.uniforms.bright;
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, this.sceneTarget.texture);
      gl.uniform1i(ub.uScene, 0);
      gl.uniform2f(ub.uSourceTexel, 1 / sceneW, 1 / sceneH);
      gl.uniform1f(ub.uThreshold, this.hdrTargets ? 1.02 : 0.72);
      this.drawFullscreen();
      gl.useProgram(this.programs.blur);
      const ul = this.uniforms.blur;
      gl.uniform1i(ul.uImage, 0);
      const blurPass = (source, destination, dx, dy) => {
        gl.bindFramebuffer(gl.FRAMEBUFFER, destination.framebuffer);
        gl.viewport(0, 0, destination.width, destination.height);
        gl.activeTexture(gl.TEXTURE0);
        gl.bindTexture(gl.TEXTURE_2D, source.texture);
        gl.uniform2f(ul.uDirection, dx / source.width, dy / source.height);
        this.drawFullscreen();
      };
      blurPass(this.bloomA, this.bloomB, 1.4, 0);
      blurPass(this.bloomB, this.bloomA, 0, 1.4);
      blurPass(this.bloomA, this.bloomB, 3.2, 0);
      blurPass(this.bloomB, this.bloomA, 0, 3.2);
      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
      gl.viewport(0, 0, this.width, this.height);
      gl.useProgram(this.programs.composite);
      const uc = this.uniforms.composite;
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, this.sceneTarget.texture);
      gl.uniform1i(uc.uScene, 0);
      gl.activeTexture(gl.TEXTURE1);
      gl.bindTexture(gl.TEXTURE_2D, this.bloomA.texture);
      gl.uniform1i(uc.uBloom, 1);
      gl.uniform2f(uc.uResolution, this.width, this.height);
      gl.uniform1f(uc.uTime, time);
      gl.uniform1f(uc.uExposure, state2.exposure);
      gl.uniform1f(uc.uBloomStrength, state2.bloom);
      this.drawFullscreen();
      gl.bindVertexArray(null);
    }
    stepScaleForQuality(quality) {
      switch (quality) {
        case "high":
          return 0.022;
        case "performance":
          return 0.045;
        case "balanced":
          return 0.034;
        default:
          return 0.03;
      }
    }
    capture() {
      return new Promise((resolve) => {
        this.canvas.toBlob((blob) => resolve(blob), "image/png");
      });
    }
  };

  // src/ui.js
  function el(tag, className, text) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== void 0) node.textContent = text;
    return node;
  }
  function clamp(value, min, max) {
    return Math.min(max, Math.max(min, value));
  }
  var ObservationUI = class {
    constructor(options) {
      this.state = options.state;
      this.handlers = options.handlers;
      this.controls = /* @__PURE__ */ new Map();
      this.presets = /* @__PURE__ */ new Map();
      this.panelOpen = true;
      this.toastTimer = 0;
      this.hintTimer = 0;
      this.$ = (selector) => document.querySelector(selector);
      this.dom = {
        body: document.body,
        panel: this.$("#panel"),
        panelScroll: this.$("#panelScroll"),
        presetGrid: this.$("#presetGrid"),
        controlMount: this.$("#controlMount"),
        panelBtn: this.$("#panelBtn"),
        panelClose: this.$("#panelClose"),
        panelLaunch: this.$("#panelLaunch"),
        hideBtn: this.$("#hideBtn"),
        fullBtn: this.$("#fullBtn"),
        revealBtn: this.$("#revealBtn"),
        resetViewBtn: this.$("#resetViewBtn"),
        resetAllBtn: this.$("#resetAllBtn"),
        snapshotBtn: this.$("#snapshotBtn"),
        hint: this.$("#hint"),
        hudDistance: this.$("#hudDistance"),
        hudElevation: this.$("#hudElevation"),
        hudFov: this.$("#hudFov"),
        hudPerf: this.$("#hudPerf"),
        hudBar: this.$("#hudBar"),
        statusText: this.$("#statusText"),
        toast: this.$("#toast"),
        liveBadge: this.$("#liveBadge")
      };
    }
    mount() {
      this.buildPresets();
      this.buildControls();
      this.bindStaticControls();
      this.bindPanel();
      const desktop = window.matchMedia("(min-width: 901px)").matches;
      this.setPanelOpen(desktop, false);
      this.hintTimer = window.setTimeout(() => this.dom.hint.classList.add("is-hidden"), 9800);
      window.addEventListener("pointerdown", () => this.hideHint(), { once: true, passive: true });
    }
    /* ---------------------------------------------------------------- presets */
    buildPresets() {
      for (const preset of PRESETS) {
        const button = el("button", "preset");
        button.type = "button";
        button.dataset.preset = preset.id;
        button.title = preset.meta;
        button.append(el("span", "preset__name", preset.name));
        button.append(el("span", "preset__meta", preset.meta));
        button.addEventListener("click", () => {
          this.markPreset(preset.id);
          this.handlers.onPreset(preset);
        });
        this.presets.set(preset.id, button);
        this.dom.presetGrid.append(button);
      }
      this.markPreset("gargantua");
    }
    markPreset(id) {
      for (const [key, button] of this.presets) {
        button.classList.toggle("is-active", key === id);
      }
    }
    clearPreset() {
      for (const button of this.presets.values()) button.classList.remove("is-active");
    }
    /* --------------------------------------------------------------- controls */
    buildControls() {
      for (const group of CONTROL_GROUPS) {
        const section = el("section", "control-group");
        section.dataset.group = group.id;
        const heading = el("div", "section-heading");
        heading.append(el("span", "section-heading__index", group.index));
        heading.append(el("span", "section-heading__title", group.title));
        heading.append(el("span", "section-heading__en", group.en));
        section.append(heading);
        if (group.id === "disk") {
        }
        for (const control of group.controls) {
          section.append(this.buildRangeControl(control));
        }
        if (group.toggle) {
          section.append(
            this.buildSwitchRow(group.toggle.key, group.toggle.label, group.toggle.hint)
          );
        }
        if (group.id === "imaging") {
          section.append(this.buildQualityRow());
          section.append(
            this.buildSwitchRow("autoOrbit", "\u81EA\u52A8\u73AF\u7ED5", "\u7F13\u6162\u5DE1\u822A\uFF0C\u62D6\u52A8\u540E\u77ED\u6682\u6682\u505C")
          );
        }
        this.dom.controlMount.append(section);
      }
    }
    buildRangeControl(control) {
      const wrapper = el("div", "control");
      wrapper.dataset.control = control.key;
      const top = el("div", "control__top");
      const label = el("label", "control__label", control.label);
      label.htmlFor = `range-${control.key}`;
      if (control.hint) label.title = control.hint;
      const value = el("span", "control__value");
      const number = el("b");
      value.append(number);
      if (control.unit) value.append(el("i", null, control.unit));
      top.append(label, value);
      const range = el("input", "range");
      range.type = "range";
      range.id = `range-${control.key}`;
      range.min = String(control.min);
      range.max = String(control.max);
      range.step = String(control.step);
      range.value = String(this.state[control.key]);
      range.title = control.hint || control.label;
      range.setAttribute("aria-label", control.label);
      const setFill = (raw) => {
        const pct = (raw - control.min) / (control.max - control.min) * 100;
        range.style.setProperty("--fill", `${clamp(pct, 0, 100).toFixed(2)}%`);
      };
      const setDisplay = (raw) => {
        const clipped = clamp(raw, control.min, control.max);
        const text = control.key === "temperature" ? Math.round(clipped).toLocaleString("en-US") : Number(clipped).toFixed(control.digits);
        number.textContent = text;
        setFill(clipped);
        range.setAttribute("aria-valuetext", `${text}${control.unit ? " " + control.unit : ""}`);
      };
      const record = { ...control, range, number, setDisplay };
      this.controls.set(control.key, record);
      setDisplay(this.state[control.key]);
      range.addEventListener("input", () => {
        const raw = parseFloat(range.value);
        setDisplay(raw);
        this.clearPreset();
        this.handlers.onChange(control.key, raw);
      });
      wrapper.append(top, range);
      return wrapper;
    }
    buildSwitchRow(key, label, hint) {
      const row = el("div", "switch-row");
      const copy = el("div", "switch-row__copy");
      copy.append(el("strong", null, label));
      if (hint) copy.append(el("span", null, hint));
      const switchLabel = el("label", "switch");
      switchLabel.title = hint || label;
      const input = el("input");
      input.type = "checkbox";
      input.id = `toggle-${key}`;
      input.checked = Boolean(this.state[key]);
      input.setAttribute("aria-label", label);
      const track = el("span", "switch__track");
      switchLabel.append(input, track);
      input.addEventListener("change", () => {
        this.clearPreset();
        this.handlers.onChange(key, input.checked);
      });
      row.append(copy, switchLabel);
      this.controls.set(key, { type: "switch", input });
      return row;
    }
    buildQualityRow() {
      const wrapper = el("div", "control control--select");
      wrapper.dataset.control = "quality";
      wrapper.style.marginTop = "6px";
      const top = el("div", "control__top");
      top.append(el("span", "control__label", "\u6E32\u67D3\u8D28\u91CF"));
      const selectWrap = el("div", "select-wrap");
      const select = el("select", "select");
      select.id = "quality-select";
      select.setAttribute("aria-label", "\u6E32\u67D3\u8D28\u91CF");
      for (const option of QUALITY_OPTIONS) {
        const node = el("option", null, option.label);
        node.value = option.value;
        select.append(node);
      }
      select.value = this.state.quality;
      select.addEventListener("change", () => {
        this.handlers.onChange("quality", select.value);
        this.setStatus("\u81EA\u9002\u5E94\u8D28\u91CF\u5DF2\u542F\u52A8");
      });
      selectWrap.append(select);
      top.append(selectWrap);
      wrapper.append(top);
      this.controls.set("quality", { type: "select", select });
      return wrapper;
    }
    /* ---------------------------------------------------------------- binding */
    bindStaticControls() {
      this.dom.resetViewBtn.addEventListener("click", () => this.handlers.onResetView());
      this.dom.resetAllBtn.addEventListener("click", () => {
        this.handlers.onResetAll();
      });
      this.dom.snapshotBtn.addEventListener("click", () => this.handlers.onSnapshot());
      this.dom.fullBtn.addEventListener("click", () => this.handlers.onFullscreen());
      this.dom.hideBtn.addEventListener("click", () => this.handlers.onToggleUI());
      this.dom.revealBtn?.addEventListener("click", () => this.handlers.onToggleUI());
      this.dom.panelLaunch.addEventListener("click", () => this.setPanelOpen(true));
      this.dom.panelBtn.addEventListener("click", () => this.setPanelOpen(!this.panelOpen));
      this.dom.panelClose.addEventListener("click", () => this.setPanelOpen(false));
      window.addEventListener("keydown", (event) => this.onKeyDown(event));
    }
    bindPanel() {
      const media = window.matchMedia("(max-width: 900px)");
      const onChange = (event) => {
        if (!event.matches && !this.dom.body.classList.contains("ui-hidden")) {
          this.setPanelOpen(true, false);
        }
      };
      if (media.addEventListener) media.addEventListener("change", onChange);
      else media.addListener(onChange);
    }
    onKeyDown(event) {
      const target = event.target;
      if (target instanceof HTMLElement && (target.tagName === "INPUT" || target.tagName === "SELECT" || target.isContentEditable)) {
        return;
      }
      const key = event.key.toLowerCase();
      if (key === "h") {
        event.preventDefault();
        this.handlers.onToggleUI();
      } else if (key === "p") {
        event.preventDefault();
        this.setPanelOpen(!this.panelOpen);
      } else if (key === "f") {
        event.preventDefault();
        this.handlers.onFullscreen();
      } else if (key === "r") {
        event.preventDefault();
        this.handlers.onResetView();
        this.showToast("\u89C6\u89D2\u5DF2\u590D\u4F4D");
      } else if (key === "s") {
        event.preventDefault();
        this.handlers.onSnapshot();
      } else if (key === "escape") {
        if (this.dom.body.classList.contains("ui-hidden")) {
          this.handlers.onToggleUI();
        } else if (this.panelOpen) {
          this.setPanelOpen(false);
        }
      }
    }
    setPanelOpen(open, animate = true) {
      this.panelOpen = open;
      this.dom.body.classList.toggle("panel-open", open);
      if (!animate) {
        this.dom.panel.style.transition = "none";
        requestAnimationFrame(() => {
          this.dom.panel.style.transition = "";
        });
      }
    }
    /* --------------------------------------------------------------- UI state */
    onChangeFromState() {
      for (const [key, control] of this.controls) {
        if (control.type === "select") {
          control.select.value = this.state[key];
        } else if (control.type === "switch") {
          control.input.checked = Boolean(this.state[key]);
        } else {
          control.range.value = String(this.state[key]);
          control.setDisplay(this.state[key]);
        }
      }
    }
    setDisplayValue(key, value) {
      const control = this.controls.get(key);
      if (!control || control.type) return;
      if (document.activeElement === control.range) return;
      control.range.value = String(value);
      control.setDisplay(value);
    }
    refreshControl(key, value) {
      const control = this.controls.get(key);
      if (!control) return;
      if (control.type === "select") control.select.value = value;
      else if (control.type === "switch") control.input.checked = Boolean(value);
      else {
        control.range.value = String(value);
        control.setDisplay(value);
      }
    }
    refreshAll() {
      this.onChangeFromState();
    }
    updateHud({ distance, elevation, fov, fps: fps2, resolution, qualityScale }) {
      this.dom.hudDistance.textContent = `${distance.toFixed(1)} Rs`;
      this.dom.hudElevation.textContent = `${elevation.toFixed(1)}\xB0`;
      this.dom.hudFov.textContent = `${fov.toFixed(0)}\xB0`;
      this.dom.hudPerf.textContent = `${Math.max(1, Math.round(fps2))} FPS \xB7 ${resolution}`;
      const pct = clamp(fps2 / 60 * 100, 8, 100);
      this.dom.hudBar.style.width = `${pct}%`;
      if (this.state.quality === "auto") {
        this.setStatus(`\u81EA\u9002\u5E94 ${qualityScale.toFixed(2)}\xD7`);
      } else {
        const label = QUALITY_OPTIONS.find((item) => item.value === this.state.quality)?.label.split(" \xB7 ")[0] || "\u56FA\u5B9A";
        this.setStatus(`${label}\u8D28\u91CF`);
      }
    }
    setStatus(text) {
      this.dom.statusText.textContent = text;
    }
    setLive(ok) {
      this.dom.liveBadge.classList.toggle("is-offline", !ok);
    }
    showToast(message, duration = 2200) {
      window.clearTimeout(this.toastTimer);
      this.dom.toast.textContent = message;
      this.dom.toast.classList.add("is-visible");
      this.toastTimer = window.setTimeout(() => {
        this.dom.toast.classList.remove("is-visible");
      }, duration);
    }
    hideHint() {
      this.dom.hint.classList.add("is-hidden");
    }
    setUIHidden(hidden) {
      this.dom.body.classList.toggle("ui-hidden", hidden);
      this.dom.revealBtn?.setAttribute("aria-hidden", hidden ? "false" : "true");
    }
    busyOn(message) {
      this.dom.snapshotBtn.disabled = true;
      this.dom.snapshotBtn.querySelector("span").textContent = message;
    }
    busyOff() {
      this.dom.snapshotBtn.disabled = false;
      this.dom.snapshotBtn.querySelector("span").textContent = "\u4FDD\u5B58\u89C2\u6D4B\u5F71\u50CF";
    }
  };

  // src/main.js
  var stage = document.getElementById("stage");
  var canvas = document.getElementById("view");
  var loading = document.getElementById("loading");
  var loadingBar = document.getElementById("loadingBar");
  var loadingStatus = document.getElementById("loadingStatus");
  var loadingTitle = document.querySelector(".loading__title");
  var loadingError = document.getElementById("loadingError");
  var TAU = Math.PI * 2;
  var clamp2 = (value, min, max) => Math.min(max, Math.max(min, value));
  var angleDelta = (target, current) => {
    let delta = target - current;
    while (delta > Math.PI) delta -= TAU;
    while (delta < -Math.PI) delta += TAU;
    return delta;
  };
  var state = { ...DEFAULTS };
  var camera = {
    azimuth: 0.58,
    targetAzimuth: 0.58,
    elevation: DEFAULTS.elevation,
    targetElevation: DEFAULTS.elevation,
    distance: DEFAULTS.distance,
    targetDistance: DEFAULTS.distance,
    fov: DEFAULTS.fov,
    targetFov: DEFAULTS.fov,
    position: [0, 0, 0],
    right: [1, 0, 0],
    up: [0, 1, 0],
    forward: [0, 0, -1]
  };
  var pointers = /* @__PURE__ */ new Map();
  var renderer = null;
  var ui = null;
  var animationId = 0;
  var simTime = 0;
  var lastFrameTime = performance.now();
  var fps = 60;
  var hudClock = 0;
  var lastInteraction = performance.now() - 5e3;
  var firstFrame = true;
  var pendingCapture = false;
  var snapshotBusy = false;
  var autoScale = 0.82;
  var qualityCheckTimer = performance.now();
  var qualityAccumulator = 0;
  var qualitySamples = 0;
  var resizeScheduled = false;
  var appReady = false;
  var lastFpsSampleTime = performance.now();
  var fpsFrames = 0;
  var QUALITY_SCALE = {
    high: 1,
    balanced: 0.78,
    performance: 0.55
  };
  function nextPaint() {
    return new Promise((resolve) => {
      requestAnimationFrame(() => requestAnimationFrame(resolve));
    });
  }
  function setLoadingProgress(progress, status) {
    if (loadingBar) {
      const value = clamp2(progress, 0.01, 1);
      loadingBar.style.transform = `scaleX(${value.toFixed(3)})`;
    }
    if (loadingStatus && status) loadingStatus.textContent = status;
  }
  async function loadingStep(progress, status) {
    setLoadingProgress(progress, status);
    await nextPaint();
  }
  function showFatalError(error) {
    console.error("[GARGANTUA]", error);
    if (!loading) return;
    loading.classList.add("is-error");
    loading.classList.remove("is-done");
    if (loadingTitle) loadingTitle.textContent = "\u65E0\u6CD5\u5EFA\u7ACB\u89C2\u6D4B\u94FE\u8DEF";
    if (loadingError) {
      loadingError.hidden = false;
      loadingError.textContent = (error && error.message ? error.message : String(error)) + "\n\n\u8BF7\u786E\u8BA4\u6D4F\u89C8\u5668\u652F\u6301 WebGL 2 \u5E76\u542F\u7528\u786C\u4EF6\u52A0\u901F\uFF0C\u7136\u540E\u5237\u65B0\u9875\u9762\u91CD\u8BD5\u3002";
    }
    if (loadingStatus) loadingStatus.textContent = "\u89C2\u6D4B\u53F0\u79BB\u7EBF";
    if (loadingBar) loadingBar.style.transform = "scaleX(0)";
    if (ui) ui.setLive(false);
  }
  function finishLoading() {
    if (!loading) return;
    loading.classList.add("is-done");
    window.setTimeout(() => {
      if (loading.parentNode) loading.setAttribute("aria-hidden", "true");
    }, 1200);
    if (ui) {
      ui.setStatus("\u5EA6\u89C4\u5DF2\u540C\u6B65");
      window.setTimeout(() => ui && ui.hideHint(), 9e3);
    }
  }
  function applySceneScale() {
    if (!renderer) return;
    const scale = effectiveSceneScale(renderer.width, renderer.height);
    renderer.setSceneScale(scale);
  }
  function effectiveSceneScale(width, height) {
    let base;
    if (state.quality === "auto") {
      base = autoScale;
    } else {
      base = QUALITY_SCALE[state.quality] ?? 0.82;
    }
    const maxScenePixels = 4e6;
    const pixels = width * height * base * base;
    if (pixels > maxScenePixels) base = Math.sqrt(maxScenePixels / Math.max(1, width * height));
    return clamp2(base, 0.35, 1.15);
  }
  function fitCanvas() {
    if (!renderer) return;
    resizeScheduled = false;
    const rect = stage.getBoundingClientRect();
    const cssWidth = Math.max(2, rect.width);
    const cssHeight = Math.max(2, rect.height);
    let dpr = Math.min(window.devicePixelRatio || 1, 1.6);
    const maxBackingPixels = 44e5;
    if (cssWidth * cssHeight * dpr * dpr > maxBackingPixels) {
      dpr = Math.sqrt(maxBackingPixels / (cssWidth * cssHeight));
    }
    const width = Math.max(2, Math.round(cssWidth * dpr));
    const height = Math.max(2, Math.round(cssHeight * dpr));
    const scale = effectiveSceneScale(width, height);
    const sizeChanged = renderer.width !== width || renderer.height !== height;
    renderer.resize(width, height, scale);
    if (!sizeChanged) renderer.setSceneScale(scale);
  }
  function scheduleFit() {
    if (resizeScheduled) return;
    resizeScheduled = true;
    requestAnimationFrame(fitCanvas);
  }
  function updateCamera(dt, now) {
    if (state.autoOrbit && pointers.size === 0 && now - lastInteraction > 4200) {
      camera.targetAzimuth += ORBIT_SPEED * dt;
    }
    const damping = 1 - Math.exp(-dt * 7.2);
    camera.azimuth += angleDelta(camera.targetAzimuth, camera.azimuth) * damping;
    camera.elevation += (camera.targetElevation - camera.elevation) * damping;
    camera.distance += (camera.targetDistance - camera.distance) * damping;
    camera.fov += (camera.targetFov - camera.fov) * damping;
    const elevation = camera.elevation * Math.PI / 180;
    const azimuth = camera.azimuth;
    const cosE = Math.cos(elevation);
    const sinE = Math.sin(elevation);
    const distance = camera.distance;
    const px = Math.sin(azimuth) * cosE * distance;
    const py = sinE * distance;
    const pz = Math.cos(azimuth) * cosE * distance;
    camera.position[0] = px;
    camera.position[1] = py;
    camera.position[2] = pz;
    const inv = 1 / Math.max(1e-4, Math.hypot(px, py, pz));
    const fx = -px * inv;
    const fy = -py * inv;
    const fz = -pz * inv;
    camera.forward[0] = fx;
    camera.forward[1] = fy;
    camera.forward[2] = fz;
    let rx = fy * 0 - fz * 1;
    let ry = fz * 0 - fx * 0;
    let rz = fx * 1 - fy * 0;
    const rInv = 1 / Math.max(1e-4, Math.hypot(rx, ry, rz));
    rx *= rInv;
    ry *= rInv;
    rz *= rInv;
    camera.right[0] = rx;
    camera.right[1] = ry;
    camera.right[2] = rz;
    camera.up[0] = ry * fz - rz * fy;
    camera.up[1] = rz * fx - rx * fz;
    camera.up[2] = rx * fy - ry * fx;
  }
  function normalizeDiskRadii() {
    state.diskInner = clamp2(state.diskInner, 1.6, 6);
    state.diskOuter = clamp2(state.diskOuter, 6, 30);
    if (state.diskOuter < state.diskInner + 0.8) {
      state.diskOuter = Math.min(30, state.diskInner + 0.8);
    }
  }
  function handleStateChange(key, value) {
    if (key === "distance") {
      state.distance = clamp2(value, 5, 40);
      camera.targetDistance = state.distance;
    } else if (key === "elevation") {
      state.elevation = clamp2(value, 1, 85);
      camera.targetElevation = state.elevation;
    } else if (key === "fov") {
      state.fov = clamp2(value, 24, 90);
      camera.targetFov = state.fov;
    } else if (key === "diskInner" || key === "diskOuter") {
      state[key] = value;
      normalizeDiskRadii();
      if (state.diskInner !== value) ui?.refreshControl("diskInner", state.diskInner);
      ui?.refreshControl("diskOuter", state.diskOuter);
    } else if (key === "quality") {
      state.quality = value;
      if (value === "auto") {
        autoScale = 0.82;
        qualityCheckTimer = performance.now();
        qualityAccumulator = 0;
        qualitySamples = 0;
      }
      applySceneScale();
    } else if (key in state) {
      state[key] = value;
    }
    if (ui && (key === "showDisk" || key === "autoOrbit")) {
      ui.refreshControl(key, state[key]);
    }
  }
  function resetView(showMessage = true) {
    state.distance = DEFAULTS.distance;
    state.elevation = DEFAULTS.elevation;
    state.fov = DEFAULTS.fov;
    camera.targetDistance = DEFAULTS.distance;
    camera.targetElevation = DEFAULTS.elevation;
    camera.targetFov = DEFAULTS.fov;
    camera.targetAzimuth = 0.58;
    lastInteraction = performance.now() - 5e3;
    if (ui) {
      ui.refreshControl("distance", state.distance);
      ui.refreshControl("elevation", state.elevation);
      ui.refreshControl("fov", state.fov);
      if (showMessage) ui.showToast("\u89C6\u89D2\u5DF2\u590D\u4F4D");
    }
  }
  function resetAll() {
    Object.assign(state, DEFAULTS);
    camera.targetAzimuth = 0.58;
    camera.targetDistance = state.distance;
    camera.targetElevation = state.elevation;
    camera.targetFov = state.fov;
    autoScale = 0.82;
    lastInteraction = performance.now() - 5e3;
    normalizeDiskRadii();
    if (ui) {
      ui.refreshAll();
      ui.clearPreset();
      ui.markPreset("gargantua");
      ui.showToast("\u5168\u90E8\u89C2\u6D4B\u53C2\u6570\u5DF2\u6062\u590D\u9ED8\u8BA4");
    }
    applySceneScale();
  }
  function applyPreset(preset) {
    for (const [key, value] of Object.entries(preset.values)) {
      if (key in state) state[key] = value;
    }
    if (!("showDisk" in preset.values)) state.showDisk = true;
    normalizeDiskRadii();
    camera.targetDistance = state.distance;
    camera.targetElevation = state.elevation;
    camera.targetFov = state.fov;
    lastInteraction = performance.now() - 5e3;
    if (ui) {
      ui.refreshAll();
      ui.markPreset(preset.id);
      ui.showToast(`\u5DF2\u8F7D\u5165\u9884\u8BBE \xB7 ${preset.name}`);
    }
    if (state.quality === "auto") {
      qualityCheckTimer = performance.now();
      qualityAccumulator = 0;
      qualitySamples = 0;
    }
  }
  function toggleUI() {
    if (!ui) return;
    const hidden = !document.body.classList.contains("ui-hidden");
    ui.setUIHidden(hidden);
    if (hidden) {
      ui.showToast("\u754C\u9762\u5DF2\u9690\u85CF \xB7 \u6309 H \u6216\u70B9\u51FB\u53F3\u4E0A\u89D2\u6062\u590D", 3200);
    } else {
      ui.showToast("\u89C2\u6D4B\u754C\u9762\u5DF2\u6062\u590D", 1400);
    }
  }
  async function toggleFullscreen() {
    try {
      if (!document.fullscreenElement) {
        await document.documentElement.requestFullscreen();
      } else {
        await document.exitFullscreen();
      }
    } catch {
      ui?.showToast("\u6D4F\u89C8\u5668\u963B\u6B62\u4E86\u5168\u5C4F\u8BF7\u6C42");
    }
  }
  async function captureFrame() {
    if (!renderer || snapshotBusy) return;
    snapshotBusy = true;
    pendingCapture = true;
    ui?.busyOn("\u6B63\u5728\u663E\u5F71\u2026");
    ui?.hideHint();
  }
  async function finishCapture() {
    pendingCapture = false;
    if (!renderer) {
      snapshotBusy = false;
      ui?.busyOff();
      return;
    }
    try {
      const blob = await renderer.capture();
      if (!blob) throw new Error("empty image");
      const stamp = /* @__PURE__ */ new Date();
      const pad = (value) => String(value).padStart(2, "0");
      const filename = `gargantua-${stamp.getFullYear()}${pad(stamp.getMonth() + 1)}${pad(
        stamp.getDate()
      )}-${pad(stamp.getHours())}${pad(stamp.getMinutes())}${pad(stamp.getSeconds())}.png`;
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = filename;
      document.body.append(anchor);
      anchor.click();
      anchor.remove();
      window.setTimeout(() => URL.revokeObjectURL(url), 3e3);
      ui?.showToast(`\u89C2\u6D4B\u5F71\u50CF\u5DF2\u4FDD\u5B58 \xB7 ${filename}`);
    } catch (error) {
      console.error(error);
      ui?.showToast("\u5F71\u50CF\u5BFC\u51FA\u5931\u8D25\uFF0C\u8BF7\u91CD\u8BD5");
    } finally {
      snapshotBusy = false;
      ui?.busyOff();
    }
  }
  function pointDistance(a, b) {
    return Math.hypot(a.x - b.x, a.y - b.y);
  }
  function setupInteraction() {
    canvas.addEventListener("pointerdown", (event) => {
      if (event.button !== 0 && event.pointerType === "mouse") return;
      canvas.setPointerCapture(event.pointerId);
      pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
      lastInteraction = performance.now();
      ui?.hideHint();
      if (pointers.size === 1) {
        canvas.dataset.dragOrigin = `${event.clientX},${event.clientY}`;
      }
    });
    canvas.addEventListener("pointermove", (event) => {
      const point = pointers.get(event.pointerId);
      if (!point) return;
      const previousX = point.x;
      const previousY = point.y;
      point.x = event.clientX;
      point.y = event.clientY;
      lastInteraction = performance.now();
      if (pointers.size === 1) {
        const dx = point.x - previousX;
        const dy = point.y - previousY;
        if (Math.abs(dx) + Math.abs(dy) > 0.3) {
          camera.targetAzimuth -= dx * 43e-4;
          camera.targetElevation = clamp2(camera.targetElevation - dy * 0.11, 1, 85);
          state.elevation = camera.targetElevation;
          ui?.setDisplayValue("elevation", state.elevation);
        }
      } else if (pointers.size === 2) {
        const points = [...pointers.values()];
        const distance = pointDistance(points[0], points[1]);
        if (canvas.dataset.pinchDistance) {
          const previous = parseFloat(canvas.dataset.pinchDistance);
          if (previous > 0) {
            const factor = previous / Math.max(distance, 1);
            camera.targetDistance = clamp2(camera.targetDistance * factor, 5, 40);
            state.distance = camera.targetDistance;
            ui?.setDisplayValue("distance", state.distance);
          }
        }
        canvas.dataset.pinchDistance = String(distance);
      }
    });
    const endPointer = (event) => {
      if (!pointers.has(event.pointerId)) return;
      pointers.delete(event.pointerId);
      canvas.dataset.pinchDistance = "";
      lastInteraction = performance.now();
      if (pointers.size === 0) {
        const origin = canvas.dataset.dragOrigin;
        if (origin) {
          const [ox, oy] = origin.split(",").map(Number);
          if (Math.hypot(event.clientX - ox, event.clientY - oy) > 4) ui?.clearPreset();
        }
        canvas.dataset.dragOrigin = "";
      } else if (pointers.size === 1) {
        const remaining = [...pointers.values()][0];
        remaining.x = remaining.x ?? event.clientX;
        remaining.y = remaining.y ?? event.clientY;
        if (canvas.dataset.dragOrigin) {
          canvas.dataset.dragOrigin = `${remaining.x},${remaining.y}`;
        }
      }
    };
    canvas.addEventListener("pointerup", endPointer);
    canvas.addEventListener("pointercancel", endPointer);
    canvas.addEventListener("lostpointercapture", (event) => {
      if (pointers.has(event.pointerId)) endPointer(event);
    });
    canvas.addEventListener(
      "wheel",
      (event) => {
        event.preventDefault();
        lastInteraction = performance.now();
        const factor = Math.exp(event.deltaY * 115e-5);
        camera.targetDistance = clamp2(camera.targetDistance * factor, 5, 40);
        state.distance = camera.targetDistance;
        ui?.setDisplayValue("distance", state.distance);
        ui?.hideHint();
        ui?.clearPreset();
      },
      { passive: false }
    );
    canvas.addEventListener("dblclick", () => resetView());
    canvas.addEventListener("contextmenu", (event) => event.preventDefault());
    window.addEventListener("resize", scheduleFit);
    if ("ResizeObserver" in window) {
      const observer = new ResizeObserver(scheduleFit);
      observer.observe(stage);
    }
    document.addEventListener("fullscreenchange", scheduleFit);
    window.addEventListener("keydown", (event) => {
      if (event.key === "Escape" && document.fullscreenElement) return;
    });
  }
  function updatePerformance(dt, now) {
    if (dt > 1e-4) {
      const instantaneous = 1 / dt;
      fps += (instantaneous - fps) * 0.085;
    }
    if (state.quality !== "auto" || !renderer) return;
    if (dt > 0.2) return;
    qualityAccumulator += dt;
    qualitySamples++;
    if (now - qualityCheckTimer < 1600 || qualitySamples < 36) return;
    const average = qualityAccumulator / qualitySamples;
    qualityAccumulator = 0;
    qualitySamples = 0;
    qualityCheckTimer = now;
    let nextScale = autoScale;
    if (average > 0.0255 && autoScale > 0.5) {
      nextScale = Math.max(0.5, autoScale - 0.045);
    } else if (average < 0.0148 && autoScale < 0.9) {
      nextScale = Math.min(0.9, autoScale + 0.022);
    }
    if (Math.abs(nextScale - autoScale) > 1e-3) {
      autoScale = nextScale;
      applySceneScale();
    }
  }
  function updateHud(now) {
    if (!ui || !renderer) return;
    if (now - hudClock < 240) return;
    hudClock = now;
    const scene = renderer.sceneTarget;
    ui.updateHud({
      distance: camera.distance,
      elevation: camera.elevation,
      fov: camera.fov,
      fps,
      resolution: scene ? `${scene.width}\xD7${scene.height}` : "\u2014",
      qualityScale: renderer.sceneScale
    });
  }
  function frame(now) {
    animationId = requestAnimationFrame(frame);
    let dt = (now - lastFrameTime) / 1e3;
    lastFrameTime = now;
    if (document.hidden) {
      return;
    }
    if (!Number.isFinite(dt) || dt < 0) dt = 0;
    dt = Math.min(dt, 0.09);
    if (!renderer) return;
    updateCamera(dt, now);
    simTime += dt * state.timeSpeed;
    updatePerformance(dt, now);
    updateHud(now);
    renderer.render(state, camera, simTime);
    if (pendingCapture) {
      finishCapture();
    }
    if (firstFrame) {
      firstFrame = false;
      appReady = true;
      window.setTimeout(finishLoading, 420);
    }
  }
  async function boot() {
    await nextPaint();
    try {
      setLoadingProgress(0.03, "\u521D\u59CB\u5316 WebGL 2 \u4E0A\u4E0B\u6587");
      renderer = new Renderer(canvas);
      await renderer.initialize(loadingStep);
      ui = new ObservationUI({
        state,
        handlers: {
          onChange: handleStateChange,
          onPreset: applyPreset,
          onResetView: () => resetView(true),
          onResetAll: resetAll,
          onSnapshot: captureFrame,
          onFullscreen: toggleFullscreen,
          onToggleUI: toggleUI
        }
      });
      ui.mount();
      ui.setLive(true);
      setupInteraction();
      fitCanvas();
      updateCamera(0, performance.now());
      renderer.render(state, camera, simTime);
      window.__GARGANTUA__ = {
        state,
        camera,
        renderer,
        ui,
        applyPreset(id) {
          const preset = PRESETS.find((item) => item.id === id);
          if (preset) {
            ui.markPreset(id);
            applyPreset(preset);
          }
        },
        setParam(key, value) {
          handleStateChange(key, value);
          ui.refreshAll();
        },
        resetView: () => resetView(true),
        snapshot: captureFrame,
        get fps() {
          return fps;
        },
        get ready() {
          return appReady;
        }
      };
      window.__GARGANTUA_READY__ = true;
      animationId = requestAnimationFrame(frame);
    } catch (error) {
      showFatalError(error);
    }
  }
  document.addEventListener("visibilitychange", () => {
    lastFrameTime = performance.now();
    lastFpsSampleTime = performance.now();
    fpsFrames = 0;
  });
  window.addEventListener("pagehide", () => {
    cancelAnimationFrame(animationId);
  });
  boot();
})();

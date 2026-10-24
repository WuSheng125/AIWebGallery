precision highp float;
precision highp int;

in vec2 vUv;
out vec4 fragColor;

uniform vec2 uResolution;
uniform vec3 uCameraPos;
uniform vec3 uCameraRight;
uniform vec3 uCameraUp;
uniform vec3 uCameraForward;
uniform float uTanHalfFov;
uniform float uTime;
uniform float uMass;
uniform float uLensing;
uniform float uDiskInner;
uniform float uDiskOuter;
uniform float uDiskBrightness;
uniform float uDiskTemperature;
uniform float uDiskSpeed;
uniform float uDiskDensity;
uniform float uDoppler;
uniform float uStarBrightness;
uniform float uDiskVisible;
uniform float uStarsVisible;
uniform float uStepScale;
uniform int uMaxSteps;

const float PI = 3.141592653589793;

float hash12(vec2 p) {
  vec3 p3 = fract(vec3(p.xyx) * 0.1031);
  p3 += dot(p3, p3.yzx + 33.33);
  return fract((p3.x + p3.y) * p3.z);
}

vec2 hash22(vec2 p) {
  vec3 p3 = fract(vec3(p.xyx) * vec3(0.1031, 0.1030, 0.0973));
  p3 += dot(p3, p3.yzx + 33.33);
  return fract((p3.xx + p3.yz) * p3.zy);
}

float noise2(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(
    mix(hash12(i), hash12(i + vec2(1.0, 0.0)), u.x),
    mix(hash12(i + vec2(0.0, 1.0)), hash12(i + vec2(1.0)), u.x),
    u.y
  );
}

float fbm2(vec2 p) {
  float value = 0.0;
  float amplitude = 0.52;
  mat2 rotation = mat2(0.80, -0.60, 0.60, 0.80);
  for (int i = 0; i < 4; i++) {
    value += amplitude * noise2(p);
    p = rotation * p * 2.03 + 17.17;
    amplitude *= 0.5;
  }
  return value;
}

// A seamless cube-map parameterisation keeps the procedural sky fixed in space.
vec2 cubeFaceUv(vec3 direction, out float face) {
  vec3 a = abs(direction);
  vec2 uv;
  if (a.x >= a.y && a.x >= a.z) {
    face = direction.x > 0.0 ? 11.0 : 29.0;
    uv = vec2(direction.z, direction.y) / a.x;
  } else if (a.y >= a.z) {
    face = direction.y > 0.0 ? 47.0 : 67.0;
    uv = vec2(direction.x, direction.z) / a.y;
  } else {
    face = direction.z > 0.0 ? 83.0 : 101.0;
    uv = vec2(direction.x, direction.y) / a.z;
  }
  return uv * 0.5 + 0.5;
}

vec3 starLayer(vec2 uv, float face, float cells, float seed, float probability) {
  vec2 p = uv * cells;
  vec2 cell = floor(p);
  vec2 local = fract(p);
  vec2 random = hash22(cell + face * 7.31 + seed);
  float existence = hash12(cell + face * 13.17 + seed * 3.7);
  if (existence > probability) return vec3(0.0);

  vec2 centre = 0.15 + 0.70 * random;
  float distanceToStar = length(local - centre);
  float sizeRandom = hash12(cell + seed * 19.1 + face);
  float radius = mix(0.022, 0.072, pow(sizeRandom, 4.0));
  float core = 1.0 - smoothstep(0.0, radius, distanceToStar);
  float halo = exp(-distanceToStar * distanceToStar / max(0.0001, radius * radius * 2.5));
  float magnitude = 0.18 + 4.2 * pow(hash12(cell + seed * 31.7), 10.0);
  float temperature = hash12(cell + face + seed * 43.0);
  vec3 tint = mix(vec3(0.64, 0.77, 1.0), vec3(1.0, 0.79, 0.56), temperature);
  tint = mix(tint, vec3(1.0), 0.62);
  return tint * magnitude * (core + 0.16 * halo);
}

vec3 sampleSky(vec3 direction) {
  vec3 d = normalize(direction);
  float face;
  vec2 uv = cubeFaceUv(d, face);

  vec3 stars = starLayer(uv, face, 92.0, 1.3, 0.52);
  stars += starLayer(uv, face, 187.0, 7.9, 0.34) * 0.72;
  stars += starLayer(uv, face, 337.0, 15.1, 0.20) * 0.34;

  // A very restrained, seamless galactic band; the stars remain the focus.
  vec3 galacticNormal = normalize(vec3(0.26, 0.91, 0.32));
  float latitude = abs(dot(d, galacticNormal));
  float band = exp(-latitude * latitude * 35.0);
  float clouds = 0.5 + 0.25 * sin(d.x * 13.0 + sin(d.z * 8.0))
    + 0.25 * sin(d.y * 17.0 - d.z * 9.0);
  vec3 space = vec3(0.0007, 0.0011, 0.0024);
  space += band * (0.003 + 0.009 * clouds) * vec3(0.32, 0.43, 0.68);
  return space + stars * uStarBrightness;
}

vec3 temperatureColor(float kelvin) {
  if (kelvin <= 6500.0) {
    float t = smoothstep(2500.0, 6500.0, kelvin);
    return mix(vec3(1.0, 0.16, 0.025), vec3(1.0, 0.90, 0.72), t);
  }
  float t = smoothstep(6500.0, 11500.0, kelvin);
  return mix(vec3(1.0, 0.90, 0.72), vec3(0.58, 0.74, 1.0), t);
}

vec3 gravity(vec3 p, float angularMomentumSquared) {
  float r2 = max(dot(p, p), 0.0001);
  float r5 = r2 * r2 * sqrt(r2);
  return -1.5 * uMass * uLensing * angularMomentumSquared * p / r5;
}

vec4 sampleDisk(vec3 p, vec3 photonDirection) {
  float radius = length(p.xz);
  float inner = max(uDiskInner, uMass * 1.12);
  float outer = max(uDiskOuter, inner + 0.2);
  if (radius < inner || radius > outer) return vec4(0.0);

  float radialFade = smoothstep(inner, inner + 0.28 * uMass, radius)
    * (1.0 - smoothstep(outer * 0.70, outer, radius));
  float innerRim = exp(-(radius - inner) * 1.75 / max(uMass, 0.2));
  float angle = atan(p.z, p.x);
  float orbitalPhase = uTime * uDiskSpeed * 2.1 / pow(max(radius, 1.0), 1.5);
  vec2 rotatingPosition = vec2(cos(angle - orbitalPhase), sin(angle - orbitalPhase)) * radius;

  float turbulence = fbm2(rotatingPosition * 2.2 + vec2(4.7, 9.2));
  float detail = noise2(rotatingPosition * 10.5 - vec2(uTime * 0.025, 0.0));
  float bands = 0.82 + 0.18 * sin(radius * 17.0 + turbulence * 5.5);
  float filaments = clamp(0.34 + turbulence * 0.92 + detail * 0.22, 0.0, 1.35);
  float density = radialFade * clamp(uDiskDensity * (0.48 + 0.72 * filaments), 0.0, 1.0);

  // Relativistic beaming: the side rotating towards the observer is brighter.
  vec3 matterVelocity = normalize(vec3(-p.z, 0.0, p.x));
  float beta = min(0.66, sqrt(0.5 * uMass / max(radius, uMass)));
  float approach = dot(matterVelocity, -normalize(photonDirection));
  float dopplerFactor = 1.0 / max(0.28, 1.0 - beta * approach);
  float beaming = clamp(pow(dopplerFactor, 3.0 * uDoppler), 0.10, 3.8);

  float heat = 1.0 - smoothstep(inner, outer, radius);
  vec3 colour = temperatureColor(uDiskTemperature + heat * 1500.0 - (1.0 - heat) * 650.0);
  float blueShift = clamp((dopplerFactor - 1.0) * uDoppler * 1.6, 0.0, 0.65);
  float redShift = clamp((1.0 - dopplerFactor) * uDoppler * 1.4, 0.0, 0.65);
  colour = mix(colour, colour * vec3(0.72, 0.87, 1.22), blueShift);
  colour = mix(colour, colour * vec3(1.16, 0.68, 0.39), redShift);

  float radialEnergy = pow(inner / max(radius, inner), 1.48);
  float gravitationalRedshift = sqrt(max(0.08, 1.0 - uMass / max(radius, uMass + 0.01)));
  float energy = uDiskBrightness * radialEnergy * gravitationalRedshift
    * (1.55 + innerRim * 2.65) * bands * filaments * beaming;

  float alpha = clamp(density * 0.88, 0.0, 0.96);
  return vec4(colour * energy, alpha);
}

void main() {
  vec2 screen = vUv * 2.0 - 1.0;
  float aspect = uResolution.x / max(uResolution.y, 1.0);
  vec3 rayDirection = normalize(
    uCameraForward
    + uCameraRight * screen.x * aspect * uTanHalfFov
    + uCameraUp * screen.y * uTanHalfFov
  );

  vec3 position = uCameraPos;
  vec3 velocity = rayDirection;
  vec3 angularMomentum = cross(position, velocity);
  float h2 = dot(angularMomentum, angularMomentum);
  float impactParameter = sqrt(h2);

  vec3 radiance = vec3(0.0);
  float transmittance = 1.0;
  bool captured = false;
  bool escaped = false;

  for (int i = 0; i < 256; i++) {
    if (i >= uMaxSteps) break;

    float radius = length(position);
    if (radius < uMass) {
      captured = true;
      break;
    }
    if (radius > 26.0 && dot(position, velocity) > 0.0) {
      escaped = true;
      break;
    }

    // Small steps near the photon sphere; much larger steps in the weak field.
    float stepLength = clamp(0.016 * radius + 0.006 * radius * radius, 0.014, 0.72)
      * uStepScale;
    vec3 acceleration = gravity(position, h2);
    vec3 midpointPosition = position + velocity * stepLength * 0.5;
    vec3 midpointVelocity = velocity + acceleration * stepLength * 0.5;
    vec3 midpointAcceleration = gravity(midpointPosition, h2);
    vec3 nextPosition = position + midpointVelocity * stepLength;
    vec3 nextVelocity = velocity + midpointAcceleration * stepLength;

    // Detect the exact equatorial-plane crossing along each curved segment.
    if (uDiskVisible > 0.5 && position.y * nextPosition.y <= 0.0
        && abs(nextPosition.y - position.y) > 0.000001) {
      float crossing = -position.y / (nextPosition.y - position.y);
      crossing = clamp(crossing, 0.0, 1.0);
      vec3 hit = mix(position, nextPosition, crossing);
      vec4 disk = sampleDisk(hit, midpointVelocity);
      radiance += transmittance * disk.rgb * disk.a;
      transmittance *= 1.0 - disk.a;
      if (transmittance < 0.015) break;
    }

    position = nextPosition;
    velocity = nextVelocity;
  }

  // An exhausted near-critical trajectory must not leak stars into the shadow.
  // Only a ray which really escaped (or is safely far and outgoing) sees the sky.
  float finalRadius = length(position);
  bool safelyOutgoing = finalRadius > 18.0 && dot(position, velocity) > 0.0;
  if (!captured && (escaped || safelyOutgoing) && uStarsVisible > 0.5) {
    radiance += transmittance * sampleSky(velocity);
  }

  // Artistic photon-ring highlight, disabled when ray bending is disabled.
  float criticalImpact = 2.598076211 * uMass * max(uLensing, 0.001);
  float ringDistance = (impactParameter - criticalImpact) / (0.022 * uMass);
  float photonRing = exp(-ringDistance * ringDistance) * smoothstep(0.25, 0.80, uLensing);
  radiance += transmittance * uDiskVisible * uDiskBrightness * photonRing
    * vec3(0.26, 0.19, 0.11);

  fragColor = vec4(max(radiance, vec3(0.0)), 1.0);
}

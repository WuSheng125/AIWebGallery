precision highp float;

varying vec2 vUv;

uniform vec2 uResolution;
uniform float uTime;
uniform vec3 uCameraPos;
uniform vec3 uCameraRight;
uniform vec3 uCameraUp;
uniform vec3 uCameraForward;
uniform float uFov;
uniform float uLensStrength;
uniform float uInnerRadius;
uniform float uOuterRadius;
uniform float uDiskBrightness;
uniform float uTemperature;
uniform float uTurbulence;
uniform float uRotationSpeed;
uniform float uStarDensity;
uniform float uDoppler;
uniform sampler2D uNoise;

#define PI 3.14159265359
#define MAX_STEPS 64

float hash21(vec2 p) {
  p = fract(p * vec2(123.34, 456.21));
  p += dot(p, p + 45.32);
  return fract(p.x * p.y);
}

vec2 hash22(vec2 p) {
  float n = hash21(p);
  return vec2(n, hash21(p + n + 19.19));
}

float noise3(vec3 p) {
  vec2 uv = p.xy / 256.0 + p.z * vec2(0.013, 0.017);
  return texture2D(uNoise, uv).r;
}

float fbm(vec3 p) {
  float value = 0.0;
  float amplitude = 0.5;
  for (int i = 0; i < 4; i++) {
    value += amplitude * noise3(p);
    p = p * 2.03 + vec3(17.1, 9.2, 13.7);
    amplitude *= 0.5;
  }
  return value;
}

vec2 cubeFace(vec3 direction, out float face) {
  vec3 a = abs(direction);
  if (a.x >= a.y && a.x >= a.z) {
    face = direction.x > 0.0 ? 1.0 : 2.0;
    return direction.yz / a.x;
  }
  if (a.y >= a.z) {
    face = direction.y > 0.0 ? 3.0 : 4.0;
    return direction.xz / a.y;
  }
  face = direction.z > 0.0 ? 5.0 : 6.0;
  return direction.xy / a.z;
}

vec3 starLayer(vec3 direction, float cells, float seed, float threshold) {
  float face;
  vec2 uv = cubeFace(direction, face);
  vec2 cell = floor(uv * cells);
  vec2 gv = fract(uv * cells) - 0.5;
  vec2 id = cell + vec2(face * 91.7 + seed, face * 37.1 - seed);
  float random = hash21(id);
  vec2 offset = (hash22(id + 7.3) - 0.5) * 0.82;
  float d = length(gv - offset);
  float magnitude = hash21(id + 31.7);
  float radius = mix(0.017, 0.047, magnitude);
  float aa = fwidth(d) * 0.85 + 0.003;
  float core = 1.0 - smoothstep(radius - aa, radius + aa, d);
  float halo = exp(-d * 42.0) * 0.055 * step(0.82, magnitude);
  float visible = step(1.0 - threshold * uStarDensity, random);
  float energy = (0.08 + pow(magnitude, 7.0) * 1.35) * visible;
  vec3 tint = mix(vec3(0.65, 0.78, 1.0), vec3(1.0, 0.83, 0.62), hash21(id + 73.2));
  return tint * (core + halo) * energy * min(uStarDensity, 1.0);
}

vec3 deepSpace(vec3 direction) {
  vec3 d = normalize(direction);
  float dust = fbm(d * 4.2 + vec3(8.0, 1.0, 3.0));
  float fineDust = fbm(d * 11.0 - vec3(2.0, 7.0, 4.0));
  float band = exp(-abs(dot(d, normalize(vec3(-0.28, 0.86, 0.42)))) * 5.5);
  vec3 background = vec3(0.0015, 0.0022, 0.0038);
  background += vec3(0.009, 0.014, 0.024) * band * pow(dust, 2.2);
  background += vec3(0.004, 0.006, 0.011) * fineDust * band;
  background += starLayer(d, 43.0, 11.0, 0.12);
  background += starLayer(d, 91.0, 47.0, 0.07) * 0.65;
  background += starLayer(d, 167.0, 83.0, 0.042) * 0.36;
  return background;
}

vec3 temperatureColor(float kelvin) {
  float t = clamp(kelvin, 1500.0, 14000.0);
  vec3 warm = mix(vec3(1.0, 0.19, 0.025), vec3(1.0, 0.83, 0.57), smoothstep(2200.0, 6800.0, t));
  return mix(warm, vec3(0.66, 0.79, 1.0), smoothstep(7200.0, 11500.0, t));
}

vec4 accretionDisk(vec3 p) {
  float r = length(p.xz);
  float theta = atan(p.z, p.x);
  float orbit = theta - uTime * uRotationSpeed * 0.32 * pow(uInnerRadius / r, 1.5);
  vec3 flow = vec3(cos(orbit) * r, sin(orbit) * r, r);
  float clouds = fbm(vec3(flow.xy * 0.72, r * 3.2));
  float filaments = noise3(vec3(flow.xy * 3.8, r * 10.0));
  float rings = 0.5 + 0.5 * sin(r * 41.0 + clouds * 9.0);
  float detail = mix(1.0, 0.24 + clouds * 0.95 + filaments * 0.34 + rings * 0.16, min(uTurbulence, 1.0));
  detail *= 1.0 + max(uTurbulence - 1.0, 0.0) * (filaments - 0.35);

  float innerEdge = smoothstep(uInnerRadius, uInnerRadius + 0.24, r);
  float outerEdge = 1.0 - smoothstep(uOuterRadius * 0.68, uOuterRadius, r);
  float edge = innerEdge * outerEdge;
  float radialEnergy = pow(uInnerRadius / r, 1.18);
  float localTemperature = uTemperature * pow(uInnerRadius / r, 0.72);
  vec3 emission = temperatureColor(localTemperature);

  vec3 orbitalVelocity = normalize(vec3(-p.z, 0.0, p.x));
  float beta = sqrt(0.5 / r) * min(uRotationSpeed, 1.2);
  float lineOfSight = dot(orbitalVelocity, normalize(uCameraPos - p));
  float beaming = pow(clamp(1.0 / (1.0 - beta * lineOfSight), 0.4, 2.6), 2.4);
  beaming = mix(1.0, beaming, uDoppler);
  float redshift = sqrt(max(0.12, 1.0 - 1.0 / r));

  float energy = radialEnergy * edge * detail * uDiskBrightness * beaming * redshift;
  emission *= energy * 2.65;
  float opacity = clamp(edge * (0.56 + detail * 0.34), 0.0, 0.97);
  return vec4(emission, opacity);
}

void main() {
  vec2 screen = (gl_FragCoord.xy * 2.0 - uResolution.xy) / uResolution.y;
  float focal = tan(radians(uFov) * 0.5);
  vec3 direction = normalize(uCameraForward + focal * (screen.x * uCameraRight + screen.y * uCameraUp));
  vec3 position = uCameraPos;
  vec3 velocity = direction;
  vec3 angularMomentum = cross(position, velocity);
  float h2 = dot(angularMomentum, angularMomentum) * uLensStrength;
  vec3 light = vec3(0.0);
  float transmission = 1.0;
  float minimumRadius = 1000.0;
  bool captured = false;

  for (int i = 0; i < MAX_STEPS; i++) {
    float r = length(position);
    minimumRadius = min(minimumRadius, r);
    if (r < 1.0) {
      captured = true;
      break;
    }

    float stepSize = clamp((r - 0.82) * 0.09, 0.045, 1.05);
    vec3 nextPosition = position + velocity * stepSize;
    float nextRadius = length(nextPosition);
    vec3 acceleration = -1.5 * h2 * nextPosition / pow(nextRadius, 5.0);
    vec3 nextVelocity = normalize(velocity + acceleration * stepSize);

    if (position.y * nextPosition.y <= 0.0 && abs(position.y - nextPosition.y) > 0.00001 && transmission > 0.012) {
      float crossing = position.y / (position.y - nextPosition.y);
      vec3 diskPosition = mix(position, nextPosition, crossing);
      float diskRadius = length(diskPosition.xz);
      if (diskRadius >= uInnerRadius && diskRadius <= uOuterRadius) {
        vec4 disk = accretionDisk(diskPosition);
        light += transmission * disk.rgb * disk.a;
        transmission *= 1.0 - disk.a * 0.94;
      }
    }

    position = nextPosition;
    velocity = nextVelocity;
    if (r > 20.0 && dot(position, velocity) > 0.0) break;
  }

  if (length(position) < 1.35) captured = true;
  if (!captured) {
    light += transmission * deepSpace(velocity);
    float photonRing = exp(-abs(minimumRadius - 1.5) * 15.0) * 0.035;
    light += transmission * photonRing * vec3(1.0, 0.75, 0.43);
  }

  float edgeFade = 1.0 - smoothstep(0.45, 1.9, length(screen)) * 0.17;
  gl_FragColor = vec4(max(light * edgeFade, vec3(0.0)), 1.0);
}

#version 300 es
// =============================================================================
//  合成 / 后期着色器
//   - 亮度提取 + 可分离高斯模糊（多级，形成柔和辉光）
//   - 曝光、色调映射（已在主 pass 完成一部分，这里做最终输出与颗粒）
// =============================================================================

precision highp float;

uniform sampler2D uScene;      // 主渲染结果（线性 HDR）
uniform sampler2D uBloom1;     // 1/2 分辨率模糊
uniform sampler2D uBloom2;     // 1/4 分辨率模糊
uniform sampler2D uBloom3;     // 1/8 分辨率模糊
uniform vec2  uResolution;
uniform float uBloomStrength;
uniform float uExposure;
uniform float uGrain;
uniform float uTime;
uniform float uVignette;
uniform float uChroma;

out vec4 fragColor;

in vec2 vUv;

vec3 acesTonemap(vec3 x) {
  const float a = 2.51, b = 0.03, c = 2.43, d = 0.59, e = 0.14;
  return clamp((x * (a * x + b)) / (x * (c * x + d) + e), 0.0, 1.0);
}

float hash12(vec2 p) {
  vec3 p3 = fract(vec3(p.xyx) * 0.1031);
  p3 += dot(p3, p3.yzx + 33.33);
  return fract((p3.x + p3.y) * p3.z);
}

void main() {
  vec2 uv = vUv;

  // 极轻微的色散（模拟镜头）
  vec3 scene;
  if (uChroma > 0.0001) {
    vec2 dir = (uv - 0.5) * uChroma * 0.004;
    scene.r = texture(uScene, uv + dir).r;
    scene.g = texture(uScene, uv).g;
    scene.b = texture(uScene, uv - dir).b;
  } else {
    scene = texture(uScene, uv).rgb;
  }

  // 多级辉光合成
  vec3 bloom = vec3(0.0);
  bloom += texture(uBloom1, uv).rgb * 0.5;
  bloom += texture(uBloom2, uv).rgb * 0.32;
  bloom += texture(uBloom3, uv).rgb * 0.18;

  vec3 color = scene + bloom * uBloomStrength;

  // 最终色调映射 + gamma
  color = acesTonemap(color * 1.05);
  color = pow(color, vec3(1.0 / 2.2));

  // 暗角
  vec2 vd = uv - 0.5;
  color *= 1.0 - uVignette * dot(vd, vd) * 1.9;

  // 胶片颗粒
  if (uGrain > 0.0001) {
    float g = hash12(uv * uResolution + fract(uTime) * 431.0) - 0.5;
    color += g * uGrain * 0.06;
  }

  fragColor = vec4(color, 1.0);
}

#version 300 es
// 亮度提取（soft knee）—— 供辉光模糊使用
precision highp float;

uniform sampler2D uScene;
uniform float uThreshold;
uniform float uKnee;

in vec2 vUv;
out vec4 fragColor;

void main() {
  vec3 c = texture(uScene, vUv).rgb;
  float lum = dot(c, vec3(0.2126, 0.7152, 0.0722));
  // soft knee
  float knee = max(uKnee, 1e-4);
  float soft = clamp(lum - uThreshold + knee, 0.0, 2.0 * knee);
  soft = soft * soft / (4.0 * knee + 1e-4);
  float contrib = max(soft, lum - uThreshold) / max(lum, 1e-4);
  fragColor = vec4(c * contrib, 1.0);
}

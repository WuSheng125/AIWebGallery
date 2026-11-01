#version 300 es
// 可分离高斯模糊（9 tap，线性采样优化）
precision highp float;

uniform sampler2D uSrc;
uniform vec2 uDirection;   // 像素方向的步长（已按分辨率归一化）

in vec2 vUv;
out vec4 fragColor;

void main() {
  // 9-tap gaussian weights
  const float w[5] = float[5](0.227027, 0.1945946, 0.1216216, 0.054054, 0.016216);
  vec3 acc = texture(uSrc, vUv).rgb * w[0];
  for (int i = 1; i < 5; i++) {
    vec2 off = uDirection * float(i) * 1.35;
    acc += texture(uSrc, vUv + off).rgb * w[i];
    acc += texture(uSrc, vUv - off).rgb * w[i];
  }
  fragColor = vec4(acc, 1.0);
}

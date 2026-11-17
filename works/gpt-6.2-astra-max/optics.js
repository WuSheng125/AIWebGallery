"use strict";

const HorizonOptics = (() => {
  const critical = Math.sqrt(27);
  const maxImpact = 184;
  const angleLimit = 4 * Math.PI;
  const split = 0.36;
  const criticalScale = 0.004;
  const captureSpan = Math.log1p(critical / criticalScale);
  const escapeSpan = Math.log1p((maxImpact - critical) / criticalScale);
  const width = 1536;
  const height = 512;

  // 冲量参数 b 的采样集中在临界光轨附近，分辨多重盘像。
  function impactAt(column) {
    const x = column / (width - 1);
    if (x <= split) return critical - criticalScale * Math.expm1((1 - x / split) * captureSpan);
    return critical + criticalScale * Math.expm1((x - split) / (1 - split) * escapeSpan);
  }

  function pack(value, data, index) {
    const v = Math.round(Math.max(0, Math.min(1, value)) * 65535);
    data[index] = v >>> 8;
    data[index + 1] = v & 255;
  }

  function build() {
    const path = new Uint8Array(width * height * 2);
    const escape = new Uint8Array(width * 2);
    const h = angleLimit / (height - 1);
    for (let col = 0; col < width; col++) {
      const b = Math.max(0.0001, impactAt(col));
      let u = 0;
      let slope = 1 / b;
      let active = true;
      let infinityAngle = angleLimit;
      for (let row = 0; row < height; row++) {
        pack(2 * u, path, 2 * (row * width + col));
        if (!active) continue;
        // u = GM/(rc²)。史瓦西零测地线满足 u'' = 3u² − u。
        const a1 = u * (3 * u - 1);
        const v2 = slope + h * a1 / 2;
        const u2 = u + h * slope / 2;
        const a2 = u2 * (3 * u2 - 1);
        const v3 = slope + h * a2 / 2;
        const u3 = u + h * v2 / 2;
        const a3 = u3 * (3 * u3 - 1);
        const v4 = slope + h * a3;
        const u4 = u + h * v3;
        const a4 = u4 * (3 * u4 - 1);
        const next = u + h * (slope + 2 * v2 + 2 * v3 + v4) / 6;
        slope += h * (a1 + 2 * a2 + 2 * a3 + a4) / 6;
        if (next >= 0.5) {
          u = 0.5;
          active = false;
        } else if (next <= 0) {
          infinityAngle = h * (row + u / (u - next));
          u = 0;
          active = false;
        } else {
          u = next;
        }
      }
      pack(infinityAngle / angleLimit, escape, 2 * col);
    }
    return { path, escape, width, height };
  }
  return { build, critical, angleLimit, split, criticalScale, captureSpan, escapeSpan };
})();

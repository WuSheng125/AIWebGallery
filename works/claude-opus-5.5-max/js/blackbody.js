(function (BH) {
  'use strict';

  // Blackbody colours from Planck's law integrated against the CIE 1931 observer
  // (Wyman–Sloan–Shirley multi-lobe fit), converted to linear sRGB.
  const T_MIN = 1000;
  const T_MAX = 40000;
  const SIZE = 256;

  function lobe(l, mu, s1, s2) {
    const t = (l - mu) / (l < mu ? s1 : s2);
    return Math.exp(-0.5 * t * t);
  }

  function cie(l) {
    return [
      1.056 * lobe(l, 599.8, 37.9, 31.0) + 0.362 * lobe(l, 442.0, 16.0, 26.7) - 0.065 * lobe(l, 501.1, 20.4, 26.2),
      0.821 * lobe(l, 568.8, 46.9, 40.5) + 0.286 * lobe(l, 530.9, 16.3, 31.1),
      1.217 * lobe(l, 437.0, 11.8, 36.0) + 0.681 * lobe(l, 459.0, 26.0, 13.8),
    ];
  }

  function planck(nm, T) {
    const l = nm * 1e-9;
    return 1 / (Math.pow(l, 5) * (Math.exp(0.014388 / (l * T)) - 1));
  }

  function xyz(T) {
    let X = 0, Y = 0, Z = 0;
    for (let nm = 380; nm <= 780; nm += 5) {
      const b = planck(nm, T);
      const c = cie(nm);
      X += b * c[0];
      Y += b * c[1];
      Z += b * c[2];
    }
    return [X, Y, Z];
  }

  // Linear sRGB chromaticity normalised to unit luminance, plus log10 of the absolute luminance.
  function color(T) {
    const [X, Y, Z] = xyz(T);
    const x = X / Y, z = Z / Y;
    let r = 3.2406 * x - 1.5372 - 0.4986 * z;
    let g = -0.9689 * x + 1.8758 + 0.0415 * z;
    let b = 0.0557 * x - 0.2040 + 1.0570 * z;
    r = Math.max(r, 0); g = Math.max(g, 0); b = Math.max(b, 0);
    const lum = 0.2126 * r + 0.7152 * g + 0.0722 * b;
    return { rgb: [r / lum, g / lum, b / lum], logY: Math.log10(Y) };
  }

  function buildLUT() {
    const data = new Float32Array(SIZE * 4);
    const ref = color(6500).logY;
    for (let i = 0; i < SIZE; i++) {
      const T = Math.exp(Math.log(T_MIN) + (Math.log(T_MAX) - Math.log(T_MIN)) * i / (SIZE - 1));
      const c = color(T);
      data.set([c.rgb[0], c.rgb[1], c.rgb[2], c.logY - ref], i * 4);
    }
    return data;
  }

  // CSS colour for UI use: the blackbody hue at full brightness.
  function cssColor(T, alpha) {
    const { rgb } = color(Math.min(Math.max(T, T_MIN), T_MAX));
    const m = Math.max(rgb[0], rgb[1], rgb[2]);
    const enc = v => {
      const c = v / m;
      const s = c <= 0.0031308 ? 12.92 * c : 1.055 * Math.pow(c, 1 / 2.4) - 0.055;
      return Math.round(Math.min(1, Math.max(0, s)) * 255);
    };
    const [r, g, b] = rgb.map(enc);
    return alpha === undefined ? `rgb(${r}, ${g}, ${b})` : `rgba(${r}, ${g}, ${b}, ${alpha})`;
  }

  BH.Blackbody = { T_MIN, T_MAX, SIZE, buildLUT, cssColor };
})(window.BH = window.BH || {});

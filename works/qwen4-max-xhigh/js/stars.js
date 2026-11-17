/* ============================================================
   stars.js — 程序化星空贴图生成（等距柱状投影，含银河带）
   在 CPU 端一次性绘制到 canvas，再作为 SRGB8_ALPHA8 纹理上传，
   渲染时每像素只需一次纹理采样，性能远优于逐像素程序化星空。
   ============================================================ */
'use strict';

const StarField = (() => {

  /* 可复现随机数 */
  function mulberry32(seed) {
    let a = seed >>> 0;
    return function () {
      a |= 0; a = (a + 0x6D2B79F5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  /* 黑体辐射色（Tanner Helland 拟合），返回 sRGB 0..255 */
  function blackbodyRGB(T) {
    const t = Math.min(Math.max(T, 1000), 15000) / 100;
    let r, g, b;
    r = t <= 66 ? 255 : 329.698727446 * Math.pow(t - 60, -0.1332047592);
    g = t <= 66 ? 99.4708025861 * Math.log(t) - 161.1195681661
                : 288.1221695283 * Math.pow(t - 60, -0.0755148492);
    b = t >= 66 ? 255 : (t <= 19 ? 0 : 138.5177312231 * Math.log(t - 10) - 305.0447927307);
    const c = (x) => Math.round(Math.min(255, Math.max(0, x)));
    return [c(r), c(g), c(b)];
  }

  /* 恒星色温抽样：多数白/黄白，少量橙红与蓝白 */
  function starTemp(rng) {
    const u = rng();
    if (u < 0.16) return 2800 + rng() * 1400;        // 橙红
    if (u < 0.80) return 4200 + rng() * 3300;        // 黄白
    return 7500 + rng() * 4500;                      // 蓝白
  }

  /**
   * 生成星空 canvas。
   * @param {number} W 宽（2 的幂） @param {number} H 高 @param {number} seed
   */
  function generate(W, H, seed = 20261116) {
    const cv = document.createElement('canvas');
    cv.width = W; cv.height = H;
    const ctx = cv.getContext('2d');
    const rng = mulberry32(seed);
    const gauss = () => (rng() + rng() + rng() + rng() - 2) / 2; // 近似正态

    ctx.fillStyle = '#000000';
    ctx.fillRect(0, 0, W, H);

    /* ---- 银河带：沿倾斜正弦带分布的柔和星云团块 ---- */
    const bandV = (u) => 0.5 + 0.20 * Math.sin(u * Math.PI * 2 + 1.15)
                             + 0.045 * Math.sin(u * Math.PI * 6 + 0.6);
    const nebulaPalette = [
      [46, 38, 30], [30, 34, 48], [40, 30, 40], [26, 36, 40], [48, 40, 28],
    ];
    const blobs = Math.round(W * 0.34);
    const drawBlob = (x, y, rad, stops) => {
      const g = ctx.createRadialGradient(x, y, 0, x, y, rad);
      for (const [o, c] of stops) g.addColorStop(o, c);
      ctx.fillStyle = g;
      ctx.fillRect(x - rad, y - rad, rad * 2, rad * 2);
    };
    for (let i = 0; i < blobs; i++) {
      const u = rng();
      const v = bandV(u) + gauss() * 0.055;
      const x = u * W, y = v * H;
      const rad = (24 + rng() * rng() * 170) * (W / 4096);
      const col = nebulaPalette[(rng() * nebulaPalette.length) | 0];
      const a = 0.010 + rng() * 0.028;
      const stops = [[0, `rgba(${col[0]},${col[1]},${col[2]},${a})`], [1, 'rgba(0,0,0,0)']];
      drawBlob(x, y, rad, stops);
      // 水平环绕接缝补画（平移渐变中心）
      if (x < rad) drawBlob(x + W, y, rad, stops);
      if (x > W - rad) drawBlob(x - W, y, rad, stops);
    }
    /* 暗尘埃带 */
    for (let i = 0; i < blobs * 0.4; i++) {
      const u = rng();
      const v = bandV(u) + gauss() * 0.022;
      const x = u * W, y = v * H;
      const rad = (30 + rng() * 120) * (W / 4096);
      const stops = [[0, `rgba(0,0,2,${0.05 + rng() * 0.10})`], [1, 'rgba(0,0,0,0)']];
      drawBlob(x, y, rad, stops);
      if (x < rad) drawBlob(x + W, y, rad, stops);
      if (x > W - rad) drawBlob(x - W, y, rad, stops);
    }
    /* 远离银道面的极淡深空色晕 */
    for (let i = 0; i < 8; i++) {
      const x = rng() * W, y = rng() * H;
      const rad = (200 + rng() * 400) * (W / 4096);
      const warm = rng() < 0.5;
      const g = ctx.createRadialGradient(x, y, 0, x, y, rad);
      g.addColorStop(0, warm ? 'rgba(30,22,16,0.05)' : 'rgba(14,20,32,0.05)');
      g.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = g;
      ctx.fillRect(x - rad, y - rad, rad * 2, rad * 2);
    }

    /* ---- 恒星：球面均匀分布（对 cosθ 均匀抽样） ---- */
    const N = Math.round(W * 2.3);
    const brightStars = [];
    for (let i = 0; i < N; i++) {
      const u = rng();
      const v = Math.acos(2 * rng() - 1) / Math.PI;
      const x = u * W, y = v * H;
      // 幂律星等：暗星多、亮星少
      const mag = Math.pow(rng(), 3.2);
      const size = (0.40 + mag * 1.9) * (W / 4096);
      const T = starTemp(rng);
      const [r, g, b] = blackbodyRGB(T);
      const alpha = 0.25 + 0.70 * mag;

      if (size < 1.2) {
        ctx.fillStyle = `rgba(${r},${g},${b},${alpha})`;
        ctx.fillRect(x, y, Math.max(size, 0.7), Math.max(size, 0.7));
      } else {
        const rad = size * 2.0;
        const grd = ctx.createRadialGradient(x, y, 0, x, y, rad);
        grd.addColorStop(0, `rgba(255,255,255,${alpha})`);
        grd.addColorStop(0.3, `rgba(${r},${g},${b},${alpha * 0.8})`);
        grd.addColorStop(1, 'rgba(0,0,0,0)');
        ctx.fillStyle = grd;
        ctx.fillRect(x - rad, y - rad, rad * 2, rad * 2);
        if (mag > 0.90) brightStars.push({ x, y, size, r, g, b, alpha });
      }
    }

    /* ---- 最亮恒星的衍射十字光芒 ---- */
    brightStars.sort((a, b) => b.size - a.size);
    const spiked = brightStars.slice(0, Math.round(W / 170));
    ctx.lineWidth = Math.max(1, W / 4096);
    for (const s of spiked) {
      const L = s.size * 5;
      ctx.strokeStyle = `rgba(${s.r},${s.g},${s.b},${s.alpha * 0.22})`;
      ctx.beginPath();
      ctx.moveTo(s.x - L, s.y); ctx.lineTo(s.x + L, s.y);
      ctx.moveTo(s.x, s.y - L); ctx.lineTo(s.x, s.y + L);
      ctx.stroke();
    }

    /* ---- 几个遥远的河外星系光斑 ---- */
    for (let i = 0; i < 6; i++) {
      const x = rng() * W, y = H * (0.12 + rng() * 0.76);
      const rad = (7 + rng() * 16) * (W / 4096);
      const g = ctx.createRadialGradient(x, y, 0, x, y, rad);
      const warm = rng() < 0.5;
      g.addColorStop(0, warm ? 'rgba(255,230,200,0.30)' : 'rgba(200,215,255,0.28)');
      g.addColorStop(0.5, warm ? 'rgba(200,170,140,0.10)' : 'rgba(150,170,220,0.10)');
      g.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.save();
      ctx.translate(x, y);
      ctx.rotate(rng() * Math.PI);
      ctx.scale(1, 0.45 + rng() * 0.3);
      ctx.translate(-x, -y);
      ctx.fillStyle = g;
      ctx.fillRect(x - rad, y - rad, rad * 2, rad * 2);
      ctx.restore();
    }

    return cv;
  }

  return { generate, blackbodyRGB };
})();
/* ============================================================
   blackhole.js — 渲染器
   通道顺序：
     1. 主通道  → HDR 场景（测地线积分）
     2. 亮部提取 → 1/2 分辨率
     3. 高斯模糊 H/V → 1/2
     4. 降采样 + 高斯模糊 H/V → 1/4
     5. 合成 → 曝光 / ACES / 暗角 / 颗粒 / 色散
   ============================================================ */
(function (global) {
  'use strict';

  const S = global.SHADERS;
  const G = global.GLU;

  class BlackHoleRenderer {
    constructor(canvas) {
      const opts = {
        alpha: false, antialias: false, depth: false, stencil: false,
        powerPreference: 'high-performance', preserveDrawingBuffer: true,
        desynchronized: false
      };
      const gl = canvas.getContext('webgl2', opts);
      if (!gl) throw new Error('此浏览器/设备不支持 WebGL2，无法运行实时黑洞渲染。');
      this.gl = gl;
      this.canvas = canvas;

      this.fmt = G.pickFormat(gl, true);
      this.hdr = this.fmt.hdr;

      this.quad = G.createQuad(gl);
      this.pScene = G.createProgram(gl, S.VS_QUAD, S.FS_BLACKHOLE, 'blackhole');
      this.pBright = G.createProgram(gl, S.VS_QUAD, S.FS_BRIGHT, 'bright');
      this.pBlur = G.createProgram(gl, S.VS_QUAD, S.FS_BLUR, 'blur');
      this.pComposite = G.createProgram(gl, S.VS_QUAD, S.FS_COMPOSITE, 'composite');

      this.tScene = G.createTarget(gl, 2, 2, this.fmt, gl.LINEAR);
      this.tBright = G.createTarget(gl, 2, 2, this.fmt, gl.LINEAR);
      this.tBlurA = G.createTarget(gl, 2, 2, this.fmt, gl.LINEAR);
      this.tBlurB = G.createTarget(gl, 2, 2, this.fmt, gl.LINEAR);
      this.tSmall = G.createTarget(gl, 2, 2, this.fmt, gl.LINEAR);
      this.tSmallB = G.createTarget(gl, 2, 2, this.fmt, gl.LINEAR);

      this.rw = 2; this.rh = 2;         // 场景渲染分辨率
      this.cw = 2; this.ch = 2;         // 画布分辨率
      gl.disable(gl.DEPTH_TEST);
      gl.disable(gl.BLEND);
      gl.disable(gl.CULL_FACE);
    }

    /* ---------- 尺寸管理 ---------- */
    resize(cssW, cssH, dpr, scale) {
      const gl = this.gl;
      const cw = Math.max(2, Math.round(cssW * dpr));
      const ch = Math.max(2, Math.round(cssH * dpr));
      const rw = Math.max(2, Math.round(cssW * dpr * scale));
      const rh = Math.max(2, Math.round(cssH * dpr * scale));

      if (this.canvas.width !== cw || this.canvas.height !== ch) {
        this.canvas.width = cw; this.canvas.height = ch;
      }
      this.cw = cw; this.ch = ch;

      if (rw !== this.rw || rh !== this.rh) {
        this.rw = rw; this.rh = rh;
        G.resizeTarget(gl, this.tScene, rw, rh);
        const h2w = Math.max(2, rw >> 1), h2h = Math.max(2, rh >> 1);
        const h4w = Math.max(2, rw >> 2), h4h = Math.max(2, rh >> 2);
        G.resizeTarget(gl, this.tBright, h2w, h2h);
        G.resizeTarget(gl, this.tBlurA, h2w, h2h);
        G.resizeTarget(gl, this.tBlurB, h2w, h2h);
        G.resizeTarget(gl, this.tSmall, h4w, h4h);
        G.resizeTarget(gl, this.tSmallB, h4w, h4h);
      }
    }

    /* ---------- 主渲染 ---------- */
    render(st, time) {
      const gl = this.gl;
      const cam = st.camera;          // {pos:[x,y,z], basis:Float32Array(9)}

      /* 1) 场景 */
      G.bindTarget(gl, this.tScene);
      const p = this.pScene.use();
      p.v2('uRes', this.rw, this.rh);
      p.v3('uCamPos', cam.pos[0], cam.pos[1], cam.pos[2]);
      p.m3('uCamBasis', cam.basis);
      p.f('uTanHalfFov', cam.tanHalfFov);
      p.f('uAspect', this.rw / this.rh);
      p.f('uProjShift', st.projShift || 0);
      p.f('uTime', time);

      p.f('uDiskIn', st.diskIn);
      p.f('uDiskOut', st.diskOut);
      p.f('uDiskBright', st.diskBright);
      p.f('uDiskTempK', st.diskTempK);
      p.f('uDiskTurb', st.diskTurb);
      p.f('uDiskDir', st.diskDir);
      p.v3('uDiskNormal', 0, 0, 1);
      p.v3('uDiskU', 1, 0, 0);
      p.v3('uDiskV', 0, 1, 0);

      p.f('uLensing', st.lensing);
      p.f('uDoppler', st.doppler);
      p.f('uRedshift', st.redshift);
      p.f('uSpinDrag', st.spinDrag);
      p.f('uSpinSign', st.spinSign);

      p.f('uStarDensity', st.starDensity);
      p.f('uStarBright', st.starBright);
      p.f('uGalaxy', st.galaxy);
      // 一个渲染像素在立方体面 uv 中的角尺寸（用于保证星点不小于 ~1 像素）
      p.f('uPixUV', 1.2732 * 2 * cam.tanHalfFov / this.rh);
      p.f('uDiskFall', st.diskFall);

      p.i('uSteps', st.steps);
      p.f('uStepH', st.stepH);
      p.f('uOmega', st.omega);
      this.quad.draw();

      /* 2) 亮部提取 */
      G.bindTarget(gl, this.tBright);
      const b = this.pBright.use();
      b.tex('uTex', 0, this.tScene.tex);
      b.f('uThreshold', st.bloomThreshold);
      b.f('uKnee', 0.45);
      this.quad.draw();

      /* 3) 1/2 分辨率模糊 */
      this._blur(this.tBright, this.tBlurA, this.tBlurB, 1.0);

      /* 4) 降采样到 1/4 并模糊（宽泛光） */
      G.bindTarget(gl, this.tSmall);
      const d = this.pBlur.use();
      d.tex('uTex', 0, this.tBlurB.tex);
      d.v2('uDir', 1.0 / this.tSmall.w, 0.0);
      this.quad.draw();
      this._blur(this.tSmall, this.tSmallB, this.tSmall, 1.6);

      /* 5) 合成 */
      G.bindTarget(gl, null);
      gl.viewport(0, 0, this.cw, this.ch);
      const c = this.pComposite.use();
      c.tex('uScene', 0, this.tScene.tex);
      c.tex('uBloom1', 1, this.tBlurB.tex);
      c.tex('uBloom2', 2, this.tSmall.tex);
      c.v2('uRes', this.cw, this.ch);
      c.f('uExposure', st.exposure);
      c.f('uBloom', st.bloom);
      c.f('uVignette', st.vignette);
      c.f('uGrain', st.grain);
      c.f('uAberration', st.aberration);
      c.f('uTime', time);
      this.quad.draw();
    }

    _blur(src, tmp, dst, radius) {
      const gl = this.gl;
      G.bindTarget(gl, tmp);
      const p = this.pBlur.use();
      p.tex('uTex', 0, src.tex);
      p.v2('uDir', radius / tmp.w, 0.0);
      this.quad.draw();

      G.bindTarget(gl, dst);
      const q = this.pBlur.use();
      q.tex('uTex', 0, tmp.tex);
      q.v2('uDir', 0.0, radius / tmp.h);
      this.quad.draw();
    }
  }

  global.BlackHoleRenderer = BlackHoleRenderer;
})(window);

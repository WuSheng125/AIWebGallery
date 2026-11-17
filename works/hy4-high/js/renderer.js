/* =========================================================================
   GARGANTUA — WebGL2 renderer
   Passes:
     1. black hole ray-march -> HDR scene texture
     2. bright-pass + horizontal blur  (1/2 res)
     3. vertical blur                  (1/2 res)  = bloom level 1
     4. downsample + horizontal blur   (1/4 res)
     5. vertical blur                  (1/4 res)  = bloom level 2 (wide halo)
     6. composite: CA + bloom + ACES tonemap + vignette + grain
   ========================================================================= */
(function () {
  'use strict';
  const S = window.BH_SHADERS;

  function compile(gl, type, src) {
    const sh = gl.createShader(type);
    gl.shaderSource(sh, src);
    gl.compileShader(sh);
    if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) {
      const log = gl.getShaderInfoLog(sh);
      const numbered = src.split('\n').map((l, i) => (i + 1) + ': ' + l).join('\n');
      gl.deleteShader(sh);
      throw new Error('Shader compile error:\n' + log + '\n' + numbered);
    }
    return sh;
  }

  class Renderer {
    constructor(canvas) {
      const gl = canvas.getContext('webgl2', {
        alpha: false, antialias: false, depth: false, stencil: false,
        premultipliedAlpha: false, preserveDrawingBuffer: true,
        powerPreference: 'high-performance'
      });
      if (!gl) throw new Error('此浏览器不支持 WebGL2');
      this.gl = gl;
      this.canvas = canvas;

      // HDR half-float render targets when available, LDR fallback otherwise
      this.hdr = !!gl.getExtension('EXT_color_buffer_float');
      if (this.hdr) {
        const probe = this._makeTarget(4, 4, true);
        if (!probe) this.hdr = false;
        else this._destroy(probe);
      }
      this.threshold = this.hdr ? 0.95 : 0.58;

      this.vao = gl.createVertexArray();
      this.pBH = this._program(S.VERT, S.BLACKHOLE);
      this.pBlur = this._program(S.VERT, S.BLUR);
      this.pComp = this._program(S.VERT, S.COMPOSITE);
      this.t = null;
      gl.disable(gl.DEPTH_TEST);
      gl.disable(gl.BLEND);
      gl.disable(gl.CULL_FACE);
    }

    _program(vs, fs) {
      const gl = this.gl;
      const p = gl.createProgram();
      const v = compile(gl, gl.VERTEX_SHADER, vs);
      const f = compile(gl, gl.FRAGMENT_SHADER, fs);
      gl.attachShader(p, v); gl.attachShader(p, f);
      gl.linkProgram(p);
      gl.deleteShader(v); gl.deleteShader(f);
      if (!gl.getProgramParameter(p, gl.LINK_STATUS)) {
        throw new Error('Program link error: ' + gl.getProgramInfoLog(p));
      }
      const u = {};
      const n = gl.getProgramParameter(p, gl.ACTIVE_UNIFORMS);
      for (let i = 0; i < n; i++) {
        const info = gl.getActiveUniform(p, i);
        const name = info.name.replace(/\[0\]$/, '');
        u[name] = gl.getUniformLocation(p, name);
      }
      return { p, u };
    }

    _makeTarget(w, h, hdr) {
      const gl = this.gl;
      w = Math.max(1, w | 0); h = Math.max(1, h | 0);
      const tex = gl.createTexture();
      gl.bindTexture(gl.TEXTURE_2D, tex);
      gl.texImage2D(gl.TEXTURE_2D, 0, hdr ? gl.RGBA16F : gl.RGBA8,
                    w, h, 0, gl.RGBA, hdr ? gl.HALF_FLOAT : gl.UNSIGNED_BYTE, null);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      const fbo = gl.createFramebuffer();
      gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
      gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, tex, 0);
      const ok = gl.checkFramebufferStatus(gl.FRAMEBUFFER) === gl.FRAMEBUFFER_COMPLETE;
      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
      if (!ok) { gl.deleteTexture(tex); gl.deleteFramebuffer(fbo); return null; }
      return { tex, fbo, w, h };
    }

    _destroy(t) {
      if (!t) return;
      this.gl.deleteTexture(t.tex);
      this.gl.deleteFramebuffer(t.fbo);
    }

    /** Resize all render targets to the given backing-store resolution. */
    resize(w, h) {
      w = Math.max(2, w | 0); h = Math.max(2, h | 0);
      if (this.t && this.t.scene.w === w && this.t.scene.h === h) return;
      if (this.t) Object.keys(this.t).forEach(k => this._destroy(this.t[k]));
      const h2 = Math.max(1, Math.round(h / 2)), w2 = Math.max(1, Math.round(w / 2));
      const h4 = Math.max(1, Math.round(h / 4)), w4 = Math.max(1, Math.round(w / 4));
      const hdr = this.hdr;
      this.t = {
        scene: this._makeTarget(w, h, hdr),
        a:     this._makeTarget(w2, h2, false),
        b:     this._makeTarget(w2, h2, false),
        c:     this._makeTarget(w4, h4, false),
        d:     this._makeTarget(w4, h4, false)
      };
      // a/b/c/d are LDR on purpose: bloom is a display-referred glow.
      // On LDR fallbacks the scene target is RGBA8 too.
    }

    _u(pr, name, type, a, b, c) {
      const loc = pr.u[name];
      if (loc === undefined || loc === null) return;
      const gl = this.gl;
      if (type === '1f') gl.uniform1f(loc, a);
      else if (type === '2f') gl.uniform2f(loc, a, b);
      else if (type === '3f') gl.uniform3f(loc, a, b, c);
      else if (type === '1i') gl.uniform1i(loc, a);
      else if (type === 'm3') gl.uniformMatrix3fv(loc, false, a);
    }

    _tex(pr, name, unit, tex) {
      const gl = this.gl;
      gl.activeTexture(gl.TEXTURE0 + unit);
      gl.bindTexture(gl.TEXTURE_2D, tex);
      this._u(pr, name, '1i', unit);
    }

    _draw(pr, target) {
      const gl = this.gl;
      gl.bindFramebuffer(gl.FRAMEBUFFER, target ? target.fbo : null);
      gl.viewport(0, 0, target ? target.w : this.canvas.width,
                        target ? target.h : this.canvas.height);
      gl.useProgram(pr.p);
      gl.bindVertexArray(this.vao);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
    }

    /** state: parameter object; view: {pos, basis, dist}; time: seconds */
    render(state, view, time) {
      const gl = this.gl, t = this.t;
      if (!t || !t.scene) return;
      const W = t.scene.w, H = t.scene.h;

      /* ---- 1. black hole ---- */
      const p = this.pBH;
      gl.useProgram(p.p);
      this._u(p, 'uResolution', '2f', W, H);
      this._u(p, 'uCamPos', '3f', view.pos[0], view.pos[1], view.pos[2]);
      this._u(p, 'uCamBasis', 'm3', view.basis);
      this._u(p, 'uTanHalfFov', '1f', Math.tan(state.fov * Math.PI / 360));
      this._u(p, 'uCamDist', '1f', view.dist);
      this._u(p, 'uTime', '1f', time);
      this._u(p, 'uShiftX', '1f', state.shiftX || 0);
      this._u(p, 'uRs', '1f', state.rs);
      this._u(p, 'uLens', '1f', state.lens);
      this._u(p, 'uSpin', '1f', state.spin);
      this._u(p, 'uPhotonRing', '1f', state.photonRing);
      this._u(p, 'uDiskInner', '1f', state.diskInner);
      this._u(p, 'uDiskOuter', '1f', state.diskOuter);
      this._u(p, 'uDiskBright', '1f', state.diskBright);
      this._u(p, 'uDiskTemp', '1f', state.diskTemp);
      this._u(p, 'uTurbulence', '1f', state.turbulence);
      this._u(p, 'uDoppler', '1f', state.doppler);
      this._u(p, 'uRotation', '1f', state.rotation);
      this._u(p, 'uDiskSoft', '1f', state.diskSoft);
      this._u(p, 'uStarDensity', '1f', state.starDensity);
      this._u(p, 'uStarBright', '1f', state.starBright);
      this._u(p, 'uNebula', '1f', state.nebula);
      this._u(p, 'uSteps', '1i', state.steps);
      this._draw(p, t.scene);

      /* ---- 2..5. bloom ---- */
      const bl = this.pBlur;
      const blurPass = (srcTex, dst, srcW, srcH, dirX, dirY, spacing, extract) => {
        gl.useProgram(bl.p);
        this._tex(bl, 'uTex', 0, srcTex);
        this._u(bl, 'uTexel', '2f', 1 / srcW, 1 / srcH);
        this._u(bl, 'uDir', '2f', dirX, dirY);
        this._u(bl, 'uSpacing', '1f', spacing);
        this._u(bl, 'uThreshold', '1f', this.threshold);
        this._u(bl, 'uExtract', '1i', extract);
        this._draw(bl, dst);
      };
      blurPass(t.scene.tex, t.a, W, H, 1, 0, 2.0, 1);          // extract + blur H
      blurPass(t.a.tex,     t.b, t.a.w, t.a.h, 0, 1, 1.0, 0);  // blur V  -> bloom 1
      blurPass(t.b.tex,     t.c, t.b.w, t.b.h, 1, 0, 2.0, 0);  // down + blur H
      blurPass(t.c.tex,     t.d, t.c.w, t.c.h, 0, 1, 2.0, 0);  // blur V  -> bloom 2

      /* ---- 6. composite ---- */
      const cp = this.pComp;
      gl.useProgram(cp.p);
      this._tex(cp, 'uScene', 0, t.scene.tex);
      this._tex(cp, 'uBloom1', 1, t.b.tex);
      this._tex(cp, 'uBloom2', 2, t.d.tex);
      this._u(cp, 'uExposure', '1f', state.exposure);
      this._u(cp, 'uBloomStrength', '1f', state.bloom);
      this._u(cp, 'uChroma', '1f', state.chroma);
      this._u(cp, 'uVignette', '1f', 0.58);
      this._u(cp, 'uTime', '1f', time);
      this._draw(cp, null);
    }
  }

  window.BH_Renderer = Renderer;
})();

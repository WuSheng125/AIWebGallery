(function (BH) {
  'use strict';

  const { Program, texture, framebuffer } = BH.GL;

  const PREVIEW_SCALES = [1, 0.75, 0.5, 0.375, 0.25];
  const QUALITY = [
    { eps: 0.12, steps: 220 },
    { eps: 0.08, steps: 320 },
    { eps: 0.05, steps: 480 },
    { eps: 0.03, steps: 760 },
  ];
  const IDLE_MS = 120;
  const BLOOM_LEVELS = 7;

  function normalize(v) {
    const l = Math.hypot(v[0], v[1], v[2]);
    return [v[0] / l, v[1] / l, v[2] / l];
  }

  function cross(a, b) {
    return [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
  }

  // Orientation of the procedural Milky Way. Rows of the matrix are the galactic axes
  // (towards the centre, in-plane, north pole) in world coordinates.
  function galacticFrame() {
    const centre = normalize([0.42, 1, 0.22]);
    const tilt = [Math.cos(0.5), 0, Math.sin(0.5)];
    const d = tilt[0] * centre[0] + tilt[1] * centre[1] + tilt[2] * centre[2];
    const along = normalize([tilt[0] - d * centre[0], tilt[1] - d * centre[1], tilt[2] - d * centre[2]]);
    const pole = normalize(cross(centre, along));
    const side = cross(pole, centre);
    return new Float32Array([
      centre[0], side[0], pole[0],
      centre[1], side[1], pole[1],
      centre[2], side[2], pole[2],
    ]);
  }
  const GAL = galacticFrame();

  function innerRadius(P) {
    if (P.autoInner) return BH.Kerr.isco(P.spin);
    return Math.max(P.rin, BH.Kerr.photonOrbit(P.spin, true) + 0.05);
  }

  function outerRadius(P) {
    return Math.max(P.rout, innerRadius(P) + 0.5);
  }

  // Length of one cross-fade cycle of the disk turbulence, in M.
  function flowPeriod(P) {
    return 2 * Math.PI * Math.pow(Math.max(2 * innerRadius(P), 7), 1.5);
  }

  function sameSig(a, b) {
    if (!b || a.length !== b.length) return false;
    for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false;
    return true;
  }

  // Render targets for one resolution: the cached geodesic results and the shaded HDR image.
  class Pipe {
    constructor(gl) {
      this.gl = gl;
      this.w = 0;
      this.h = 0;
      this.textures = [];
      this.fbos = [];
    }

    resize(w, h) {
      if (w === this.w && h === this.h) return false;
      this.release();
      const gl = this.gl;
      const make = (internal, type, filter) => {
        const t = texture(gl, w, h, internal, gl.RGBA, type, filter);
        this.textures.push(t);
        return t;
      };
      this.bg = make(gl.RGBA16F, gl.HALF_FLOAT, gl.NEAREST);
      this.hit1 = make(gl.RGBA32F, gl.FLOAT, gl.NEAREST);
      this.hit2 = make(gl.RGBA32F, gl.FLOAT, gl.NEAREST);
      this.hit3 = make(gl.RGBA16F, gl.HALF_FLOAT, gl.NEAREST);
      this.hdr = make(gl.RGBA16F, gl.HALF_FLOAT, gl.LINEAR);
      const gbuf = framebuffer(gl, [this.bg, this.hit1, this.hit2, this.hit3]);
      const hdr = framebuffer(gl, [this.hdr]);
      this.fbos.push(gbuf.fbo, hdr.fbo);
      if (!gbuf.complete || !hdr.complete) throw new Error('显卡不支持所需的浮点渲染目标组合。');
      this.gbuf = gbuf.fbo;
      this.hdrFbo = hdr.fbo;
      this.w = w;
      this.h = h;
      return true;
    }

    release() {
      const gl = this.gl;
      this.textures.forEach(t => gl.deleteTexture(t));
      this.fbos.forEach(f => gl.deleteFramebuffer(f));
      this.textures = [];
      this.fbos = [];
      this.w = 0;
      this.h = 0;
    }
  }

  // Ray tracing is the expensive part, so it only runs when the camera or the geometry changes.
  // While things move, a reduced-resolution preview is traced every frame; once they settle,
  // the full-resolution buffers are filled in strips over several frames and then swapped in.
  // Shading, bloom and tone mapping run every frame on whichever buffers are on display.
  class Renderer {
    constructor(gl) {
      this.gl = gl;
      this.vao = gl.createVertexArray();
      this.lut = texture(gl, BH.Blackbody.SIZE, 1, gl.RGBA16F, gl.RGBA, gl.FLOAT, gl.LINEAR, BH.Blackbody.buildLUT());
      this.full = new Pipe(gl);
      this.preview = new Pipe(gl);
      this.mips = [];
      this.W = 0;
      this.H = 0;
      this.scaleIndex = -1;
      this.samples = [];
      this.failedAt = [];
      this.cooldownUntil = 0;
      this.prevTraced = false;
      this.sig = null;
      this.fullValid = false;
      this.previewValid = false;
      this.refineRow = 0;
      this.lastChange = 0;
    }

    compile() {
      const gl = this.gl;
      const S = BH.Shaders;
      const ext = gl.getExtension('KHR_parallel_shader_compile');
      this.programs = {
        trace: new Program(gl, 'trace', S.vert, S.trace),
        shade: new Program(gl, 'shade', S.vert, S.shade),
        down: new Program(gl, 'bloom-down', S.vert, S.bloomDown),
        up: new Program(gl, 'bloom-up', S.vert, S.bloomUp),
        composite: new Program(gl, 'composite', S.vert, S.composite),
      };
      const list = Object.values(this.programs);
      return new Promise((resolve, reject) => {
        const poll = () => {
          if (!list.every(p => p.isReady(ext))) {
            setTimeout(poll, 30);
            return;
          }
          try {
            list.forEach(p => p.finalize());
            resolve();
          } catch (e) {
            reject(e);
          }
        };
        poll();
      });
    }

    get previewScale() {
      return PREVIEW_SCALES[this.scaleIndex];
    }

    setSize(w, h) {
      if (w === this.W && h === this.H) return;
      if (this.scaleIndex < 0) this.scaleIndex = w * h > 1.6e6 ? 3 : w * h > 0.8e6 ? 2 : 1;
      this.W = w;
      this.H = h;
      this.full.resize(w, h);
      this._resizePreview();
      this._resizeBloom();
      this.sig = null;
    }

    _resizePreview() {
      const s = PREVIEW_SCALES[this.scaleIndex];
      if (s === 1) {
        this.preview.release();
        this.previewValid = false;
        return;
      }
      const w = Math.max(2, Math.round(this.W * s));
      const h = Math.max(2, Math.round(this.H * s));
      if (this.preview.resize(w, h)) this.previewValid = false;
    }

    _resizeBloom() {
      const gl = this.gl;
      this.mips.forEach(m => {
        gl.deleteTexture(m.tex);
        gl.deleteFramebuffer(m.fbo);
      });
      this.mips = [];
      let w = this.W >> 1;
      let h = this.H >> 1;
      while (this.mips.length < BLOOM_LEVELS && w >= 8 && h >= 8) {
        const tex = texture(gl, w, h, gl.RGBA16F, gl.RGBA, gl.HALF_FLOAT, gl.LINEAR);
        this.mips.push({ tex, fbo: framebuffer(gl, [tex]).fbo, w, h });
        w >>= 1;
        h >>= 1;
      }
    }

    // Steps the preview resolution down when motion gets choppy and back up when there is
    // headroom. A scale that was too slow is not retried for a while, so vsync quantisation
    // cannot make it oscillate.
    adapt(dtMs, now) {
      if (!this.prevTraced || now < this.cooldownUntil) return;
      const s = this.samples;
      s.push(dtMs);
      if (s.length > 40) s.shift();
      const recent = s.slice(-8);
      const avgRecent = recent.reduce((a, b) => a + b, 0) / recent.length;
      const avgAll = s.reduce((a, b) => a + b, 0) / s.length;
      if (recent.length >= 8 && avgRecent > 26 && this.scaleIndex < PREVIEW_SCALES.length - 1) {
        this.failedAt[this.scaleIndex] = now;
        this._setScale(this.scaleIndex + 1, now);
      } else if (s.length >= 40 && avgAll < 17.5 && this.scaleIndex > 0 &&
                 now - (this.failedAt[this.scaleIndex - 1] || -1e9) > 8000) {
        this._setScale(this.scaleIndex - 1, now);
      }
    }

    _setScale(i, now) {
      this.scaleIndex = i;
      this.samples.length = 0;
      this.cooldownUntil = now + 400;
      this._resizePreview();
    }

    _signature(P, cam, shift) {
      return [
        P.spin, innerRadius(P), outerRadius(P), P.quality, P.stars, P.milky, P.fov,
        cam.pos[0], cam.pos[1], cam.pos[2], cam.fwd[0], cam.fwd[1], cam.fwd[2],
        cam.up[0], cam.up[1], cam.up[2], shift[0], shift[1],
      ];
    }

    _traceUniforms(P, cam, shift) {
      const a = P.spin;
      const frame = BH.Kerr.cameraFrame(cam.pos, cam.fwd, cam.up, cam.right, -a);
      const rh = BH.Kerr.horizon(a);
      const q = QUALITY[P.quality] || QUALITY[1];
      const dist = Math.hypot(cam.pos[0], cam.pos[1], cam.pos[2]);
      const rout = outerRadius(P);
      return {
        uTanFov: Math.tan(P.fov * Math.PI / 360),
        uShift: shift,
        uCamPos: cam.pos,
        uE0: frame.e0,
        uE1: frame.eRight,
        uE2: frame.eUp,
        uE3: frame.eFwd,
        uInvLapse: frame.invLapse,
        uSpin: a,
        uRh: rh,
        uRcap: rh + 0.01,
        uRph: 0.97 * BH.Kerr.photonOrbit(a, true),
        uRin: innerRadius(P),
        uRout: rout,
        uResc: Math.max(1.2 * dist, 1.2 * rout, 50),
        uEps: q.eps,
        uMaxSteps: q.steps,
        uStarBright: P.stars,
        uMilky: P.milky,
        uGal: GAL,
      };
    }

    // opts: { now, phase, seed, shift, force } — force completes the full-resolution trace
    // within this frame (used for screenshots).
    render(P, cam, opts) {
      const gl = this.gl;
      gl.bindVertexArray(this.vao);
      gl.disable(gl.BLEND);
      gl.disable(gl.DEPTH_TEST);
      gl.disable(gl.SCISSOR_TEST);

      const sig = this._signature(P, cam, opts.shift);
      if (!sameSig(sig, this.sig)) {
        this.sig = sig;
        this.lastChange = opts.now;
        this.fullValid = false;
        this.previewValid = false;
        this.refineRow = 0;
      }
      const moving = opts.now - this.lastChange < IDLE_MS;
      const scale = PREVIEW_SCALES[this.scaleIndex];
      let U = null;
      const uniforms = () => U || (U = this._traceUniforms(P, cam, opts.shift));
      let traced = false;

      if (!this.fullValid) {
        if (scale === 1 || opts.force) {
          this._trace(this.full, uniforms(), this.refineRow, this.full.h - this.refineRow);
          this.refineRow = this.full.h;
          this.fullValid = true;
          traced = scale === 1;
        } else {
          if (!this.previewValid) {
            this._trace(this.preview, uniforms(), 0, this.preview.h);
            this.previewValid = true;
            traced = true;
          }
          if (!moving) {
            const strips = Math.ceil(1 / (scale * scale));
            const rows = Math.min(Math.ceil(this.full.h / strips / 2) * 2, this.full.h - this.refineRow);
            this._trace(this.full, uniforms(), this.refineRow, rows);
            this.refineRow += rows;
            this.fullValid = this.refineRow >= this.full.h;
          }
        }
      }
      this.prevTraced = traced;

      const pipe = this.fullValid ? this.full : this.preview;
      this._shade(pipe, P, opts.phase);
      const bloomNorm = this._bloom(pipe, P);
      this._composite(pipe, P, opts, bloomNorm);
      return {
        width: pipe.w,
        height: pipe.h,
        complete: this.fullValid,
        moving,
        progress: this.full.h ? this.refineRow / this.full.h : 0,
      };
    }

    _trace(pipe, U, y0, rows) {
      if (rows <= 0) return;
      const gl = this.gl;
      const prog = this.programs.trace.use();
      gl.bindFramebuffer(gl.FRAMEBUFFER, pipe.gbuf);
      gl.viewport(0, 0, pipe.w, pipe.h);
      const partial = y0 > 0 || rows < pipe.h;
      if (partial) {
        gl.enable(gl.SCISSOR_TEST);
        gl.scissor(0, y0, pipe.w, rows);
      }
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, this.lut);
      prog.set('uBBLut', 0);
      prog.set('uRes', [pipe.w, pipe.h]);
      prog.set('uPixAngle', 2 * U.uTanFov / pipe.h);
      for (const k in U) prog.set(k, U[k]);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
      if (partial) gl.disable(gl.SCISSOR_TEST);
    }

    _shade(pipe, P, phase) {
      const gl = this.gl;
      const prog = this.programs.shade.use();
      gl.bindFramebuffer(gl.FRAMEBUFFER, pipe.hdrFbo);
      gl.viewport(0, 0, pipe.w, pipe.h);
      [this.lut, pipe.bg, pipe.hit1, pipe.hit2, pipe.hit3].forEach((t, i) => {
        gl.activeTexture(gl.TEXTURE0 + i);
        gl.bindTexture(gl.TEXTURE_2D, t);
      });
      prog.set('uBBLut', 0).set('uBg', 1).set('uHit1', 2).set('uHit2', 3).set('uHit3', 4)
        .set('uSpin', P.spin)
        .set('uPhase', phase)
        .set('uFlowT', flowPeriod(P))
        .set('uRin', innerRadius(P))
        .set('uRout', outerRadius(P))
        .set('uTemp', P.temp)
        .set('uTempSlope', P.tempSlope)
        .set('uBright', P.bright)
        .set('uFalloff', P.falloff)
        .set('uOpacity', P.opacity)
        .set('uTurb', P.turb)
        .set('uDoppler', P.doppler);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
    }

    // Returns the factor that normalises the summed pyramid back to unit weight.
    _bloom(pipe, P) {
      const gl = this.gl;
      const mips = this.mips;
      if (!mips.length || P.bloom <= 0) return 0;

      const down = this.programs.down.use();
      down.set('uSrc', 0);
      gl.activeTexture(gl.TEXTURE0);
      let src = pipe.hdr;
      let sw = pipe.w;
      let sh = pipe.h;
      mips.forEach((m, i) => {
        gl.bindFramebuffer(gl.FRAMEBUFFER, m.fbo);
        gl.viewport(0, 0, m.w, m.h);
        gl.bindTexture(gl.TEXTURE_2D, src);
        down.set('uSrcTexel', [1 / sw, 1 / sh]).set('uDstTexel', [1 / m.w, 1 / m.h]).set('uKaris', i === 0 ? 1 : 0);
        gl.drawArrays(gl.TRIANGLES, 0, 3);
        src = m.tex;
        sw = m.w;
        sh = m.h;
      });

      const weight = 0.4 + 0.25 * P.bloomRadius;
      const up = this.programs.up.use();
      up.set('uSrc', 0).set('uWeight', weight);
      gl.enable(gl.BLEND);
      gl.blendFunc(gl.ONE, gl.ONE);
      for (let i = mips.length - 1; i > 0; i--) {
        const s = mips[i];
        const d = mips[i - 1];
        gl.bindFramebuffer(gl.FRAMEBUFFER, d.fbo);
        gl.viewport(0, 0, d.w, d.h);
        gl.bindTexture(gl.TEXTURE_2D, s.tex);
        up.set('uSrcTexel', [1 / s.w, 1 / s.h]).set('uDstTexel', [1 / d.w, 1 / d.h]);
        gl.drawArrays(gl.TRIANGLES, 0, 3);
      }
      gl.disable(gl.BLEND);

      let sum = 0;
      for (let i = 0; i < mips.length; i++) sum += Math.pow(weight, i);
      return 1 / sum;
    }

    _composite(pipe, P, opts, bloomNorm) {
      const gl = this.gl;
      const W = gl.drawingBufferWidth;
      const H = gl.drawingBufferHeight;
      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
      gl.viewport(0, 0, W, H);
      const prog = this.programs.composite.use();
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, pipe.hdr);
      gl.activeTexture(gl.TEXTURE1);
      gl.bindTexture(gl.TEXTURE_2D, this.mips.length ? this.mips[0].tex : pipe.hdr);
      prog.set('uHdr', 0).set('uBloom', 1)
        .set('uOutRes', [W, H])
        .set('uCenter', [0.5 + opts.shift[0] * H / W / 2, 0.5 + opts.shift[1] / 2])
        .set('uExposure', Math.pow(2, P.exposure))
        .set('uBloomStr', P.bloom * 0.35 * bloomNorm)
        .set('uGrain', P.grain)
        .set('uVignette', P.vignette)
        .set('uSeed', opts.seed);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
    }
  }

  Renderer.innerRadius = innerRadius;
  Renderer.outerRadius = outerRadius;
  Renderer.flowPeriod = flowPeriod;
  BH.Renderer = Renderer;
})(window.BH = window.BH || {});

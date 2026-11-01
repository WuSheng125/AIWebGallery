/* =============================================================================
 *  js/renderer.js  ·  WebGL2 渲染引擎
 *  · 逐像素光线追迹（黑洞通道，HDR 浮点输出）
 *  · 渐进式多重采样累积（相机静止时逐帧叠加做抗锯齿 / 降噪）
 *  · 半分辨率亮度提取 + 可分离高斯泛光链
 *  · ACES 色调映射合成
 *  · 鼠标 / 触摸轨道相机
 * ========================================================================== */
(function (global) {
  'use strict';

  var BH = global.BH || (global.BH = {});

  var MAX_PIXELS = 4.6e6;          // 安全上限，防止 4K + 高倍超采样把 GPU 打死

  /* ------------------------------------------------------------- 小工具 */
  function halton(index, base) {
    var f = 1, r = 0, i = index;
    while (i > 0) {
      f /= base;
      r += f * (i % base);
      i = Math.floor(i / base);
    }
    return r;
  }

  /* ==================================================================== */
  function Renderer(canvas, params) {
    this.canvas = canvas;
    this.p = params;

    var opts = { alpha: false, antialias: false, depth: false, stencil: false,
                 preserveDrawingBuffer: false, powerPreference: 'high-performance',
                 desynchronized: true };
    var gl = canvas.getContext('webgl2', opts);
    if (!gl) throw new Error('WEBGL2_UNAVAILABLE');
    this.gl = gl;

    this.hasFloat = !!gl.getExtension('EXT_color_buffer_float');
    this.hasHalf  = this.hasFloat || !!gl.getExtension('EXT_color_buffer_half_float');
    this.internalFormat = this.hasHalf ? gl.RGBA16F : gl.RGBA8;
    this.texType        = this.hasHalf ? gl.HALF_FLOAT : gl.UNSIGNED_BYTE;
    gl.getExtension('OES_texture_float_linear');

    // 相机状态
    this.cam = { azimuth: 0.0, elevation: 6.5, distance: 22.0 };
    this.autoRotateSpeed = 0.06;

    this.sampleCount = 0;
    this.needsClear  = true;
    this.time        = 0;
    this.fps         = 60;
    this._lastT      = 0;
    this._frameTimes = [];
    this.adaptive    = 1.0;          // 自动降级系数
    this._interacting = 0;

    this.targets = {};
    this._initGL();
  }

  /* ------------------------------------------------------------ GL 初始化 */
  Renderer.prototype._initGL = function () {
    var gl = this.gl, S = BH.SHADERS;

    this.progMain  = this._program(S.QUAD_VS, S.BLACKHOLE_FS);
    this.progBright = this._program(S.QUAD_VS, S.BRIGHT_FS);
    this.progBlur   = this._program(S.QUAD_VS, S.BLUR_FS);
    this.progComp   = this._program(S.QUAD_VS, S.COMPOSITE_FS);

    // 全屏三角形
    this.vao = gl.createVertexArray();
    gl.bindVertexArray(this.vao);
    var buf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
    gl.bindVertexArray(null);

    gl.disable(gl.DEPTH_TEST);
    gl.disable(gl.CULL_FACE);
  };

  Renderer.prototype._shader = function (type, src) {
    var gl = this.gl;
    var s = gl.createShader(type);
    gl.shaderSource(s, src);
    gl.compileShader(s);
    if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) {
      var log = gl.getShaderInfoLog(s);
      console.error('[BH] shader compile failed:\n' + log);
      throw new Error('SHADER_COMPILE: ' + log);
    }
    return s;
  };

  Renderer.prototype._program = function (vsSrc, fsSrc) {
    var gl = this.gl;
    var p = gl.createProgram();
    gl.attachShader(p, this._shader(gl.VERTEX_SHADER, vsSrc));
    gl.attachShader(p, this._shader(gl.FRAGMENT_SHADER, fsSrc));
    gl.bindAttribLocation(p, 0, 'aPos');
    gl.linkProgram(p);
    if (!gl.getProgramParameter(p, gl.LINK_STATUS)) {
      throw new Error('PROGRAM_LINK: ' + gl.getProgramInfoLog(p));
    }
    // 缓存 uniform 位置
    var locs = {}, n = gl.getProgramParameter(p, gl.ACTIVE_UNIFORMS);
    for (var i = 0; i < n; i++) {
      var info = gl.getActiveUniform(p, i);
      var name = info.name.replace(/\[0\]$/, '');
      locs[name] = gl.getUniformLocation(p, name);
    }
    return { p: p, u: locs };
  };

  /* ------------------------------------------------------------ 渲染目标 */
  Renderer.prototype._makeTarget = function (key, w, h) {
    var gl = this.gl;
    var t = this.targets[key];
    if (t && t.w === w && t.h === h) return t;

    if (t) { gl.deleteTexture(t.tex); gl.deleteFramebuffer(t.fbo); }
    var tex = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.texImage2D(gl.TEXTURE_2D, 0, this.internalFormat, w, h, 0, gl.RGBA, this.texType, null);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    var fbo = gl.createFramebuffer();
    gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, tex, 0);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);

    t = { tex: tex, fbo: fbo, w: w, h: h };
    this.targets[key] = t;
    return t;
  };

  /* ------------------------------------------------------------ 尺寸 */
  Renderer.prototype.resize = function () {
    var c = this.canvas;
    var dpr = Math.min(global.devicePixelRatio || 1, 2);
    var cssW = c.clientWidth || 1, cssH = c.clientHeight || 1;
    var s = Math.max(0.25, (this.p.resolutionScale || 1) * this.adaptive);
    var w = Math.max(2, Math.round(cssW * dpr * s));
    var h = Math.max(2, Math.round(cssH * dpr * s));
    if (w * h > MAX_PIXELS) {
      var k = Math.sqrt(MAX_PIXELS / (w * h));
      w = Math.max(2, Math.round(w * k));
      h = Math.max(2, Math.round(h * k));
    }
    if (w !== this.w || h !== this.h) {
      this.w = w; this.h = h;
      c.width = w; c.height = h;
      this.needsClear = true;
      if (this.onResize) this.onResize(w, h);
    }
  };

  /* ------------------------------------------------------------ 相机 */
  Renderer.prototype.cameraPos = function () {
    var c = this.cam;
    var el = c.elevation * Math.PI / 180, az = c.azimuth * Math.PI / 180;
    var cd = Math.cos(el);
    return [c.distance * cd * Math.cos(az), c.distance * Math.sin(el), c.distance * cd * Math.sin(az)];
  };

  Renderer.prototype.invalidate = function () { this.needsClear = true; };

  /* ------------------------------------------------------------ 单帧渲染 */
  Renderer.prototype.render = function (dtSec) {
    var gl = this.gl, p = this.p;
    this.time += dtSec;
    this.resize();

    if (p.autoRotate) {
      this.cam.azimuth -= dtSec * (p.autoRotateSpeed || 0) * 6.0;
      this.needsClear = true;
    }

    var w = this.w, h = this.h;
    var accum = this._makeTarget('accum', w, h);
    var bw = Math.max(2, w >> 1), bh = Math.max(2, h >> 1);
    var b1 = this._makeTarget('bloom1', bw, bh);
    var b2 = this._makeTarget('bloom2', bw, bh);

    var maxS = Math.max(1, p.maxSamples | 0);

    if (this.needsClear) {
      gl.bindFramebuffer(gl.FRAMEBUFFER, accum.fbo);
      gl.disable(gl.BLEND);
      gl.clearColor(0, 0, 0, 1);
      gl.clear(gl.COLOR_BUFFER_BIT);
      this.sampleCount = 0;
      this.needsClear = false;
    }

    /* ---------- 1) 黑洞主通道（加法混合累积） ---------- */
    if (this.sampleCount < maxS) {
      gl.bindFramebuffer(gl.FRAMEBUFFER, accum.fbo);
      gl.viewport(0, 0, w, h);
      gl.enable(gl.BLEND);
      gl.blendFunc(gl.ONE, gl.ONE);

      var idx = this.sampleCount;
      var jx = maxS > 1 ? halton(idx + 1, 2) - 0.5 : 0.0;
      var jy = maxS > 1 ? halton(idx + 1, 3) - 0.5 : 0.0;

      this._drawMain(w, h, jx, jy);
      this.sampleCount++;

      gl.disable(gl.BLEND);
    }

    /* ---------- 2) 泛光 ---------- */
    var samplesF = Math.max(1, this.sampleCount);
    if (p.bloom > 0.001) {
      // 亮度提取 + 1/2 降采样
      gl.bindFramebuffer(gl.FRAMEBUFFER, b1.fbo);
      gl.viewport(0, 0, bw, bh);
      var pr = this.progBright;
      gl.useProgram(pr.p);
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, accum.tex);
      gl.uniform1i(pr.u.uTex, 0);
      gl.uniform2f(pr.u.uRes, bw, bh);
      gl.uniform1f(pr.u.uSamples, samplesF);
      gl.uniform1f(pr.u.uThreshold, 0.55);
      gl.uniform1f(pr.u.uKnee, 0.7);
      gl.bindVertexArray(this.vao);
      gl.drawArrays(gl.TRIANGLES, 0, 3);

      // 多轮可分离高斯
      var prb = this.progBlur;
      gl.useProgram(prb.p);
      gl.uniform1i(prb.u.uTex, 0);
      gl.uniform2f(prb.u.uRes, bw, bh);
      var radii = [1, 2, 3.5, 5.5];
      var iters = Math.min(radii.length, Math.max(2, Math.round(3 * (p.bloomRadius || 1))));
      gl.activeTexture(gl.TEXTURE0);
      for (var i = 0; i < iters; i++) {
        var rd = radii[i] * (p.bloomRadius || 1);
        // 水平
        gl.bindFramebuffer(gl.FRAMEBUFFER, b2.fbo);
        gl.bindTexture(gl.TEXTURE_2D, b1.tex);
        gl.uniform2f(prb.u.uDir, rd, 0);
        gl.drawArrays(gl.TRIANGLES, 0, 3);
        // 垂直
        gl.bindFramebuffer(gl.FRAMEBUFFER, b1.fbo);
        gl.bindTexture(gl.TEXTURE_2D, b2.tex);
        gl.uniform2f(prb.u.uDir, 0, rd);
        gl.drawArrays(gl.TRIANGLES, 0, 3);
      }
    } else {
      gl.bindFramebuffer(gl.FRAMEBUFFER, b1.fbo);
      gl.viewport(0, 0, bw, bh);
      gl.clearColor(0, 0, 0, 1);
      gl.clear(gl.COLOR_BUFFER_BIT);
    }

    /* ---------- 3) 合成 ---------- */
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.viewport(0, 0, w, h);
    var pc = this.progComp;
    gl.useProgram(pc.p);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, accum.tex);
    gl.uniform1i(pc.u.uScene, 0);
    gl.activeTexture(gl.TEXTURE1);
    gl.bindTexture(gl.TEXTURE_2D, b1.tex);
    gl.uniform1i(pc.u.uBloomTex, 1);
    gl.uniform2f(pc.u.uRes, w, h);
    gl.uniform1f(pc.u.uSamples, samplesF);
    gl.uniform1f(pc.u.uExposure, p.exposure);
    gl.uniform1f(pc.u.uBloom, p.bloom);
    gl.uniform1f(pc.u.uTime, this.time);
    gl.bindVertexArray(this.vao);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
    gl.bindVertexArray(null);
  };

  Renderer.prototype._drawMain = function (w, h, jx, jy) {
    var gl = this.gl, p = this.p;
    var pm = this.progMain;
    gl.useProgram(pm.p);

    var cp = this.cameraPos();
    // 相机基（看向原点）
    var fx = -cp[0], fy = -cp[1], fz = -cp[2];
    var fl = Math.sqrt(fx * fx + fy * fy + fz * fz) || 1;
    fx /= fl; fy /= fl; fz /= fl;
    // right = normalize(cross(f, worldUp))
    var rx = fz * 0 - fy * 0, ry = 0, rz = 0;
    var ux0 = 0, uy0 = 1, uz0 = 0;
    rx = fy * uz0 - fz * uy0;
    ry = fz * ux0 - fx * uz0;
    rz = fx * uy0 - fy * ux0;
    var rl = Math.sqrt(rx * rx + ry * ry + rz * rz);
    if (rl < 1e-5) { rx = 1; ry = 0; rz = 0; rl = 1; }   // 正对极点退化
    rx /= rl; ry /= rl; rz /= rl;
    // up = cross(r, f)
    var upx = ry * fz - rz * fy;
    var upy = rz * fx - rx * fz;
    var upz = rx * fy - ry * fx;

    var tanHalf = Math.tan((p.fov * Math.PI / 180) * 0.5);
    var aspect = w / h;

    var u = pm.u;
    gl.uniform2f(u.uRes, w, h);
    gl.uniform2f(u.uJitter, jx, jy);
    gl.uniform1f(u.uTime, this.time);
    gl.uniform3f(u.uCamPos, cp[0], cp[1], cp[2]);
    gl.uniformMatrix3fv(u.uCamMat, false, new Float32Array([
      rx, ry, rz, upx, upy, upz, fx, fy, fz
    ]));
    gl.uniform1f(u.uTanHalf, tanHalf);
    gl.uniform1f(u.uAspect, aspect);
    gl.uniform1i(u.uSteps, p.steps | 0);

    var escape = Math.max(60, this.cam.distance * 2.5, p.diskOuter * 2.5);
    gl.uniform1f(u.uEscape, escape);

    gl.uniform1f(u.uLens, p.lensing);
    gl.uniform1f(u.uDrag, p.frameDragging * p.spin);

    gl.uniform1f(u.uDiskOn, p.diskOn ? 1 : 0);
    gl.uniform1f(u.uDiskIn, p.diskInner);
    gl.uniform1f(u.uDiskOut, Math.max(p.diskOuter, p.diskInner + 0.5));
    gl.uniform1f(u.uDiskBright, p.diskBrightness);
    gl.uniform1f(u.uDiskTemp, p.diskTemp);
    gl.uniform1f(u.uDiskTurb, p.diskTurbulence);
    gl.uniform1f(u.uDiskRot, p.diskRotation);
    gl.uniform1f(u.uDiskOpacity, p.diskOpacity);
    gl.uniform1f(u.uDiskThick, p.diskThickness);

    gl.uniform1f(u.uDoppler, p.doppler);
    gl.uniform1f(u.uRedshift, p.redshift);
    gl.uniform1f(u.uRing, p.photonRing);

    gl.uniform1f(u.uStars, p.starDensity);
    gl.uniform1f(u.uStarBright, p.starBrightness);
    gl.uniform1f(u.uNebula, p.nebula);

    gl.bindVertexArray(this.vao);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
    gl.bindVertexArray(null);
  };

  /* ------------------------------------------------------------ 交互控制 */
  Renderer.prototype.attachControls = function () {
    var self = this, el = this.canvas;
    var dragging = false, lastX = 0, lastY = 0, shift = false;

    function down(e) {
      dragging = true; lastX = e.clientX; lastY = e.clientY; shift = e.shiftKey;
      el.setPointerCapture && el.setPointerCapture(e.pointerId);
      self._interacting = 1;
      el.classList.add('grabbing');
    }
    function move(e) {
      if (!dragging) return;
      var dx = e.clientX - lastX, dy = e.clientY - lastY;
      lastX = e.clientX; lastY = e.clientY;
      var sens = 0.28;
      if (!shift) self.cam.azimuth -= dx * sens;
      self.cam.elevation += dy * sens * (shift ? 0.5 : 1.0);
      if (self.cam.elevation > 89.5) self.cam.elevation = 89.5;
      if (self.cam.elevation < -89.5) self.cam.elevation = -89.5;
      self.invalidate();
      if (self.onCameraChange) self.onCameraChange();
    }
    function up() {
      dragging = false; self._interacting = 0; el.classList.remove('grabbing');
    }

    el.addEventListener('pointerdown', down);
    el.addEventListener('pointermove', move);
    el.addEventListener('pointerup', up);
    el.addEventListener('pointercancel', up);
    el.addEventListener('pointerleave', up);

    el.addEventListener('wheel', function (e) {
      e.preventDefault();
      var k = Math.exp(e.deltaY * 0.0012);
      self.cam.distance *= k;
      self.cam.distance = Math.min(120, Math.max(3.2, self.cam.distance));
      self.invalidate();
      if (self.onCameraChange) self.onCameraChange();
    }, { passive: false });

    // 双指缩放
    var pinch = 0;
    el.addEventListener('touchmove', function (e) {
      if (e.touches.length !== 2) return;
      e.preventDefault();
      var dx = e.touches[0].clientX - e.touches[1].clientX;
      var dy = e.touches[0].clientY - e.touches[1].clientY;
      var d = Math.sqrt(dx * dx + dy * dy);
      if (pinch) {
        self.cam.distance *= pinch / d;
        self.cam.distance = Math.min(120, Math.max(3.2, self.cam.distance));
        self.invalidate();
      }
      pinch = d;
    }, { passive: false });
    el.addEventListener('touchend', function () { pinch = 0; });
  };

  /* ------------------------------------------------------------ 自适应画质 */
  Renderer.prototype._adaptive = function (dt) {
    this._frameTimes.push(dt);
    if (this._frameTimes.length > 30) this._frameTimes.shift();
    if (this._frameTimes.length < 20) return;
    var sum = 0;
    for (var i = 0; i < this._frameTimes.length; i++) sum += this._frameTimes[i];
    var avg = sum / this._frameTimes.length;
    this.fps = 1 / Math.max(avg, 1e-4);
    if (!this.p.autoQuality) { this.adaptive = 1.0; return; }
    if (avg > 1 / 26 && this.adaptive > 0.5) this.adaptive = Math.max(0.5, this.adaptive - 0.04);
    else if (avg < 1 / 52 && this.adaptive < 1.0) this.adaptive = Math.min(1.0, this.adaptive + 0.02);
  };

  /* ------------------------------------------------------------ 截图 */
  Renderer.prototype.screenshot = function (filename) {
    var gl = this.gl;
    // 保证当前帧内容仍留在绘制缓冲里
    this.sampleCount = 0; this.needsClear = true;
    this.render(0);
    var self = this;
    this.canvas.toBlob(function (blob) {
      if (!blob) return;
      var a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = filename || 'gargantua.png';
      a.click();
      setTimeout(function () { URL.revokeObjectURL(a.href); }, 4000);
    }, 'image/png');
  };

  BH.Renderer = Renderer;
  BH.halton = halton;
})(window);

'use strict';

/* ================================================================
 *  HDR 泛光管线（Bloom Pyramid）
 *  亮度阈值提取 → 多级降采样高斯模糊 → 宽银幕横向眩光 → 合成
 * ================================================================ */

function detectRenderTargetFormat(gl) {
  // 优先 RGBA16F（HDR，泛光质量最佳）
  if (gl.getExtension('EXT_color_buffer_float')) {
    return { internalFormat: gl.RGBA16F, format: gl.RGBA, type: gl.HALF_FLOAT, hdr: true };
  }
  var halfExt = gl.getExtension('EXT_color_buffer_half_float');
  if (halfExt) {
    return { internalFormat: halfExt.RGBA16F_EXT, format: gl.RGBA, type: halfExt.HALF_FLOAT_EXT, hdr: true };
  }
  // 兜底 RGBA8（无 HDR，效果略降但可用）
  return { internalFormat: gl.RGBA8, format: gl.RGBA, type: gl.UNSIGNED_BYTE, hdr: false };
}

function BloomPipeline(gl) {
  this.gl = gl;
  var fmt = detectRenderTargetFormat(gl);
  this.internalFormat = fmt.internalFormat;
  this.format = fmt.format;
  this.type = fmt.type;
  this.hdr = fmt.hdr;

  this.progBright = createProgram(gl, VS_QUAD, FS_BRIGHT, 'brightpass');
  this.progBlur = createProgram(gl, VS_QUAD, FS_BLUR, 'blur');
  this.progComp = createProgram(gl, VS_QUAD, FS_COMPOSITE, 'composite');

  this.t = {};
  this.w = 0;
  this.h = 0;
  this.outW = 2;
  this.outH = 2;
}

BloomPipeline.prototype.disposeTargets = function () {
  for (var k in this.t) {
    if (Object.prototype.hasOwnProperty.call(this.t, k)) this.t[k].dispose();
  }
  this.t = {};
};

BloomPipeline.prototype.resize = function (w, h) {
  if (this.w === w && this.h === h && this.t.a1) return;
  this.disposeTargets();
  this.w = w;
  this.h = h;
  var gl = this.gl;
  var self = this;
  var mk = function (tw, th) {
    return createFBO(gl, Math.max(1, tw | 0), Math.max(1, th | 0),
      self.internalFormat, self.format, self.type);
  };
  this.t.a1 = mk(w / 2, h / 2);
  this.t.p1 = mk(w / 2, h / 2);
  this.t.a2 = mk(w / 4, h / 4);
  this.t.p2 = mk(w / 4, h / 4);
  this.t.a3 = mk(w / 8, h / 8);
  this.t.p3 = mk(w / 8, h / 8);
  this.t.a4 = mk(w / 16, h / 16);
  this.t.s = mk(w / 8, h / 8); // 宽银幕横向眩光
};

BloomPipeline.prototype._pass = function (progObj, srcTex, dst, dirX, dirY, extra) {
  var gl = this.gl;
  gl.useProgram(progObj.program);
  gl.activeTexture(gl.TEXTURE0);
  gl.bindTexture(gl.TEXTURE_2D, srcTex);
  var U = progObj.uniforms;
  if (U.tSrc) gl.uniform1i(U.tSrc, 0);
  if (U.uDir) gl.uniform2f(U.uDir, dirX || 0, dirY || 0);
  if (extra) extra(U, gl);
  gl.bindFramebuffer(gl.FRAMEBUFFER, dst ? dst.fb : null);
  gl.viewport(0, 0, dst ? dst.w : this.outW, dst ? dst.h : this.outH);
  drawFullscreen(gl);
};

BloomPipeline.prototype.render = function (opts) {
  var gl = this.gl;
  var scene = opts.scene;
  var w = opts.w, h = opts.h;
  this.outW = opts.outW;
  this.outH = opts.outH;
  var T = this.t;
  var params = opts.params;

  // 1) 阈值提取（半分辨率）
  this._pass(this.progBright, scene, T.a1, 0, 0, function (U, g) {
    if (U.uTexel) g.uniform2f(U.uTexel, 1 / w, 1 / h);
    if (U.uThreshold) g.uniform1f(U.uThreshold, 1.0);
    if (U.uKnee) g.uniform1f(U.uKnee, 0.5);
  });

  // 2) 模糊金字塔：1/2 → 1/4 → 1/8 → 1/16
  this._pass(this.progBlur, T.a1.tex, T.p1, 1.0 / T.a1.w, 0);
  this._pass(this.progBlur, T.p1.tex, T.a2, 0, 1.0 / T.p1.h);
  this._pass(this.progBlur, T.a2.tex, T.p2, 1.0 / T.a2.w, 0);
  this._pass(this.progBlur, T.p2.tex, T.a3, 0, 1.0 / T.p2.h);
  this._pass(this.progBlur, T.a3.tex, T.p3, 1.2 / T.a3.w, 0);
  this._pass(this.progBlur, T.p3.tex, T.a4, 0, 1.2 / T.p3.h);

  // 3) 宽银幕横向眩光（仅水平大半径模糊）
  this._pass(this.progBlur, T.a2.tex, T.s, 3.5 / T.a2.w, 0);

  // 4) 合成输出到屏幕
  var P = this.progComp;
  gl.useProgram(P.program);
  var U = P.uniforms;
  var bind = function (name, tex, unit) {
    gl.activeTexture(gl.TEXTURE0 + unit);
    gl.bindTexture(gl.TEXTURE_2D, tex);
    if (U[name]) gl.uniform1i(U[name], unit);
  };
  bind('tScene', scene, 0);
  bind('tBloom1', T.a2.tex, 1);
  bind('tBloom2', T.a3.tex, 2);
  bind('tBloom3', T.a4.tex, 3);
  bind('tStreak', T.s.tex, 4);
  gl.uniform1f(U.uBloom, params.bloom);
  gl.uniform1f(U.uStreak, params.streak);
  gl.uniform1f(U.uExposure, params.exposure);
  gl.uniform1f(U.uVignette, params.vignette);
  gl.uniform1f(U.uGrain, params.grain);
  gl.uniform1f(U.uTime, opts.time);
  gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  gl.viewport(0, 0, this.outW, this.outH);
  drawFullscreen(gl);
};

(function (BH) {
  'use strict';

  function numberLines(src) {
    return src.split('\n').map((l, i) => String(i + 1).padStart(4) + '  ' + l).join('\n');
  }

  // Shaders are compiled up front and linked lazily so KHR_parallel_shader_compile can work
  // in the background while the loading screen stays responsive.
  class Program {
    constructor(gl, name, vsSrc, fsSrc) {
      this.gl = gl;
      this.name = name;
      this.vsSrc = vsSrc;
      this.fsSrc = fsSrc;
      this.vs = this._shader(gl.VERTEX_SHADER, vsSrc);
      this.fs = this._shader(gl.FRAGMENT_SHADER, fsSrc);
      this.prog = gl.createProgram();
      gl.attachShader(this.prog, this.vs);
      gl.attachShader(this.prog, this.fs);
      gl.linkProgram(this.prog);
      this.setters = null;
    }

    _shader(type, src) {
      const gl = this.gl;
      const sh = gl.createShader(type);
      gl.shaderSource(sh, src);
      gl.compileShader(sh);
      return sh;
    }

    isReady(ext) {
      if (!ext) return true;
      return this.gl.getProgramParameter(this.prog, ext.COMPLETION_STATUS_KHR);
    }

    finalize() {
      if (this.setters) return;
      const gl = this.gl;
      if (!gl.getProgramParameter(this.prog, gl.LINK_STATUS)) {
        for (const [sh, src, kind] of [[this.vs, this.vsSrc, 'vertex'], [this.fs, this.fsSrc, 'fragment']]) {
          if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) {
            console.error(`[${this.name}] ${kind} shader:\n${gl.getShaderInfoLog(sh)}\n${numberLines(src)}`);
            throw new Error(`着色器 ${this.name} 编译失败：${gl.getShaderInfoLog(sh)}`);
          }
        }
        throw new Error(`着色器 ${this.name} 链接失败：${gl.getProgramInfoLog(this.prog)}`);
      }
      this.setters = {};
      const n = gl.getProgramParameter(this.prog, gl.ACTIVE_UNIFORMS);
      for (let i = 0; i < n; i++) {
        const info = gl.getActiveUniform(this.prog, i);
        const loc = gl.getUniformLocation(this.prog, info.name);
        this.setters[info.name.replace(/\[0\]$/, '')] = this._setter(info.type, loc);
      }
    }

    _setter(type, loc) {
      const gl = this.gl;
      switch (type) {
        case gl.FLOAT: return v => gl.uniform1f(loc, v);
        case gl.FLOAT_VEC2: return v => gl.uniform2fv(loc, v);
        case gl.FLOAT_VEC3: return v => gl.uniform3fv(loc, v);
        case gl.FLOAT_VEC4: return v => gl.uniform4fv(loc, v);
        case gl.FLOAT_MAT3: return v => gl.uniformMatrix3fv(loc, false, v);
        case gl.INT:
        case gl.BOOL:
        case gl.SAMPLER_2D: return v => gl.uniform1i(loc, v);
        default: return () => {};
      }
    }

    use() {
      this.gl.useProgram(this.prog);
      return this;
    }

    set(name, value) {
      const s = this.setters[name];
      if (s) s(value);
      return this;
    }
  }

  function texture(gl, w, h, internalFormat, format, type, filter, data) {
    const tex = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.texImage2D(gl.TEXTURE_2D, 0, internalFormat, w, h, 0, format, type, data || null);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, filter);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, filter);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    return tex;
  }

  function framebuffer(gl, textures) {
    const fbo = gl.createFramebuffer();
    gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
    const bufs = textures.map((tex, i) => {
      gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0 + i, gl.TEXTURE_2D, tex, 0);
      return gl.COLOR_ATTACHMENT0 + i;
    });
    gl.drawBuffers(bufs);
    const status = gl.checkFramebufferStatus(gl.FRAMEBUFFER);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    return { fbo, complete: status === gl.FRAMEBUFFER_COMPLETE };
  }

  BH.GL = { Program, texture, framebuffer };
})(window.BH = window.BH || {});

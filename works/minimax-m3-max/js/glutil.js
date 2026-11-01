/* ============================================================
   glutil.js — 极简 WebGL2 工具层
   目标：只提供本项目需要的最小抽象，保持零依赖、零构建。
   ============================================================ */
(function (global) {
  'use strict';

  function compile(gl, type, src, label) {
    const sh = gl.createShader(type);
    gl.shaderSource(sh, src);
    gl.compileShader(sh);
    if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) {
      const log = gl.getShaderInfoLog(sh) || '';
      const lines = src.split('\n');
      // 把错误行号附近的源码打印出来，方便定位
      const m = /ERROR:\s*\d+:(\d+)/.exec(log);
      let ctx = '';
      if (m) {
        const ln = parseInt(m[1], 10);
        for (let i = Math.max(0, ln - 4); i < Math.min(lines.length, ln + 3); i++) {
          ctx += `${String(i + 1).padStart(4)} | ${lines[i]}\n`;
        }
      }
      gl.deleteShader(sh);
      throw new Error(`[${label}] 着色器编译失败:\n${log}\n${ctx}`);
    }
    return sh;
  }

  /** 创建 program 并缓存 uniform location */
  function createProgram(gl, vsSrc, fsSrc, label) {
    const vs = compile(gl, gl.VERTEX_SHADER, vsSrc, label + '.vs');
    const fs = compile(gl, gl.FRAGMENT_SHADER, fsSrc, label + '.fs');
    const prog = gl.createProgram();
    gl.attachShader(prog, vs);
    gl.attachShader(prog, fs);
    gl.bindAttribLocation(prog, 0, 'aPos');
    gl.linkProgram(prog);
    gl.deleteShader(vs);
    gl.deleteShader(fs);
    if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) {
      const log = gl.getProgramInfoLog(prog);
      gl.deleteProgram(prog);
      throw new Error(`[${label}] program 链接失败: ${log}`);
    }
    const cache = Object.create(null);
    return {
      prog,
      label,
      use() { gl.useProgram(prog); return this; },
      loc(name) {
        if (!(name in cache)) cache[name] = gl.getUniformLocation(prog, name);
        return cache[name];
      },
      f(n, v) { const l = this.loc(n); if (l) gl.uniform1f(l, v); return this; },
      i(n, v) { const l = this.loc(n); if (l) gl.uniform1i(l, v); return this; },
      v2(n, x, y) { const l = this.loc(n); if (l) gl.uniform2f(l, x, y); return this; },
      v3(n, x, y, z) { const l = this.loc(n); if (l) gl.uniform3f(l, x, y, z); return this; },
      v3a(n, arr) { const l = this.loc(n); if (l) gl.uniform3fv(l, arr); return this; },
      m3(n, arr) { const l = this.loc(n); if (l) gl.uniformMatrix3fv(l, false, arr); return this; },
      tex(n, unit, texture) {
        const l = this.loc(n);
        if (l) {
          gl.activeTexture(gl.TEXTURE0 + unit);
          gl.bindTexture(gl.TEXTURE_2D, texture);
          gl.uniform1i(l, unit);
        }
        return this;
      }
    };
  }

  /** 全屏三角形 / 四边形 */
  function createQuad(gl) {
    const vao = gl.createVertexArray();
    const vbo = gl.createBuffer();
    gl.bindVertexArray(vao);
    gl.bindBuffer(gl.ARRAY_BUFFER, vbo);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
    gl.bindVertexArray(null);
    return {
      vao,
      draw() { gl.bindVertexArray(vao); gl.drawArrays(gl.TRIANGLES, 0, 3); }
    };
  }

  /** 颜色纹理格式选择：优先 float，回落到 8bit */
  function pickFormat(gl, hdr) {
    if (hdr && gl.getExtension('EXT_color_buffer_float')) {
      return {
        internal: gl.RGBA16F, format: gl.RGBA, type: gl.HALF_FLOAT,
        hdr: true
      };
    }
    if (hdr && gl.getExtension('EXT_color_buffer_half_float')) {
      return { internal: gl.RGBA16F, format: gl.RGBA, type: gl.HALF_FLOAT, hdr: true };
    }
    return { internal: gl.RGBA8, format: gl.RGBA, type: gl.UNSIGNED_BYTE, hdr: false };
  }

  function createTarget(gl, w, h, fmt, filter) {
    const f = filter || gl.LINEAR;
    const tex = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.texImage2D(gl.TEXTURE_2D, 0, fmt.internal, w, h, 0, fmt.format, fmt.type, null);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, f);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, f);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);

    const fb = gl.createFramebuffer();
    gl.bindFramebuffer(gl.FRAMEBUFFER, fb);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, tex, 0);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    return { fb, tex, w, h, fmt };
  }

  function resizeTarget(gl, t, w, h) {
    if (t.w === w && t.h === h) return t;
    t.w = w; t.h = h;
    gl.bindTexture(gl.TEXTURE_2D, t.tex);
    gl.texImage2D(gl.TEXTURE_2D, 0, t.fmt.internal, w, h, 0, t.fmt.format, t.fmt.type, null);
    return t;
  }

  function bindTarget(gl, t) {
    if (t) {
      gl.bindFramebuffer(gl.FRAMEBUFFER, t.fb);
      gl.viewport(0, 0, t.w, t.h);
    } else {
      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    }
  }

  global.GLU = {
    createProgram, createQuad, createTarget, resizeTarget, bindTarget, pickFormat
  };
})(window);

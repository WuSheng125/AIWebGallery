/* 卡冈图雅 — 极简 WebGL 渲染引擎（零依赖）
 * 提供：程序编译（含 uniform 反射）、全屏三角形绘制、半浮点渲染目标管理。
 * 兼容 WebGL2 / WebGL1（GLSL ES 1.00）。
 */
"use strict";

window.BHEngine = (function () {

  const CTX_ATTRS = {
    alpha: false,
    antialias: false,
    depth: false,
    stencil: false,
    powerPreference: "high-performance",
    preserveDrawingBuffer: false
  };

  function create(canvas) {
    const gl =
      (canvas.getContext && (canvas.getContext("webgl2", CTX_ATTRS) ||
                             canvas.getContext("webgl", CTX_ATTRS) ||
                             canvas.getContext("experimental-webgl", CTX_ATTRS)));
    if (!gl) throw new Error("无法创建 WebGL 上下文（浏览器或驱动可能禁用了硬件加速）");
    const isGL2 = typeof WebGL2RenderingContext !== "undefined" && gl instanceof WebGL2RenderingContext;

    /* ---------- 全屏三角形 ---------- */
    const vbo = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, vbo);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);

    /* ---------- 着色器 / 程序 ---------- */
    function compileShader(type, src) {
      const s = gl.createShader(type);
      gl.shaderSource(s, src);
      gl.compileShader(s);
      if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) {
        const log = gl.getShaderInfoLog(s) || "(无日志)";
        gl.deleteShader(s);
        throw new Error("着色器编译失败: " + log);
      }
      return s;
    }
    function createProgram(vsSrc, fsSrc) {
      const p = gl.createProgram();
      gl.attachShader(p, compileShader(gl.VERTEX_SHADER, vsSrc));
      gl.attachShader(p, compileShader(gl.FRAGMENT_SHADER, fsSrc));
      gl.bindAttribLocation(p, 0, "aPos");
      gl.linkProgram(p);
      if (!gl.getProgramParameter(p, gl.LINK_STATUS)) {
        const log = gl.getProgramInfoLog(p) || "(无日志)";
        gl.deleteProgram(p);
        throw new Error("着色器链接失败: " + log);
      }
      /* 反射 active uniform，便于按类型设值 */
      const uni = new Map();
      const n = gl.getProgramParameter(p, gl.ACTIVE_UNIFORMS);
      for (let i = 0; i < n; i++) {
        const info = gl.getActiveUniform(p, i);
        if (!info) continue;
        const name = info.name.replace(/\[0\]$/, "");
        uni.set(name, { loc: gl.getUniformLocation(p, name), type: info.type });
      }
      return { handle: p, uni };
    }

    /* ---------- 渲染目标 ---------- */
    let halfCapable = (function detectHalf() {
      try {
        let type;
        if (isGL2) {
          if (!gl.getExtension("EXT_color_buffer_float") &&
              !gl.getExtension("EXT_color_buffer_half_float")) return false;
          type = gl.HALF_FLOAT;
        } else {
          if (!gl.getExtension("OES_texture_half_float")) return false;
          if (!gl.getExtension("EXT_color_buffer_half_float")) return false;
          if (!gl.getExtension("OES_texture_half_float_linear")) return false;
          type = gl.HALF_FLOAT_OES;
        }
        const t = gl.createTexture();
        gl.bindTexture(gl.TEXTURE_2D, t);
        if (isGL2) gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA16F, 4, 4, 0, gl.RGBA, type, null);
        else gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, 4, 4, 0, gl.RGBA, type, null);
        const f = gl.createFramebuffer();
        gl.bindFramebuffer(gl.FRAMEBUFFER, f);
        gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, t, 0);
        const ok = gl.checkFramebufferStatus(gl.FRAMEBUFFER) === gl.FRAMEBUFFER_COMPLETE;
        gl.bindFramebuffer(gl.FRAMEBUFFER, null);
        gl.deleteFramebuffer(f);
        gl.deleteTexture(t);
        return ok;
      } catch (e) {
        return false;
      }
    })();

    function texParams() {
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    }

    function createRT(w, h) {
      w = Math.max(8, Math.floor(w));
      h = Math.max(8, Math.floor(h));
      const tex = gl.createTexture();
      gl.bindTexture(gl.TEXTURE_2D, tex);
      texParams();
      if (isGL2) {
        if (halfCapable) gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA16F, w, h, 0, gl.RGBA, gl.HALF_FLOAT, null);
        else gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, w, h, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
      } else {
        const type = halfCapable ? gl.HALF_FLOAT_OES : gl.UNSIGNED_BYTE;
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, w, h, 0, gl.RGBA, type, null);
      }
      const fb = gl.createFramebuffer();
      gl.bindFramebuffer(gl.FRAMEBUFFER, fb);
      gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, tex, 0);
      const ok = gl.checkFramebufferStatus(gl.FRAMEBUFFER) === gl.FRAMEBUFFER_COMPLETE;
      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
      if (!ok) { gl.deleteFramebuffer(fb); gl.deleteTexture(tex); return null; }
      return { fb, tex, width: w, height: h };
    }
    function disposeRT(rt) {
      if (!rt) return;
      gl.deleteFramebuffer(rt.fb);
      gl.deleteTexture(rt.tex);
    }
    function resizeRT(rt, w, h) {
      if (!rt) return null;
      if (rt.width === Math.floor(w) && rt.height === Math.floor(h)) return rt;
      disposeRT(rt);
      return createRT(w, h);
    }

    /* ---------- 绘制 ---------- */
    function draw(prog, uniforms, rt) {
      gl.useProgram(prog.handle);
      let unit = 0;
      for (const key in uniforms) {
        const u = prog.uni.get(key);
        if (!u) continue;                       /* 优化掉的 uniform 直接跳过 */
        const v = uniforms[key];
        switch (u.type) {
          case gl.FLOAT:        gl.uniform1f(u.loc, v); break;
          case gl.INT:
          case gl.BOOL:         gl.uniform1i(u.loc, v); break;
          case gl.FLOAT_VEC2:   gl.uniform2fv(u.loc, v); break;
          case gl.FLOAT_VEC3:   gl.uniform3fv(u.loc, v); break;
          case gl.FLOAT_VEC4:   gl.uniform4fv(u.loc, v); break;
          case gl.SAMPLER_2D:
            gl.activeTexture(gl.TEXTURE0 + unit);
            gl.bindTexture(gl.TEXTURE_2D, v);
            gl.uniform1i(u.loc, unit);
            unit++;
            break;
          default: break;
        }
      }
      gl.bindFramebuffer(gl.FRAMEBUFFER, rt ? rt.fb : null);
      gl.viewport(0, 0, rt ? rt.width : gl.drawingBufferWidth,
                        rt ? rt.height : gl.drawingBufferHeight);
      gl.bindBuffer(gl.ARRAY_BUFFER, vbo);
      gl.enableVertexAttribArray(0);
      gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
    }

    return {
      gl, isGL2, halfCapable,
      createProgram, createRT, disposeRT, resizeRT, draw
    };
  }

  return { create };
})();

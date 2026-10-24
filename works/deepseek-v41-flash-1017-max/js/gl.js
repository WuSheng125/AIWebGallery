/*
 * Small WebGL2 toolkit used by the observatory renderer.
 */
(function () {
  'use strict';

  const G = (window.GARGANTUA = window.GARGANTUA || {});

  function compileShader(gl, type, source, label) {
    const shader = gl.createShader(type);
    gl.shaderSource(shader, source);
    gl.compileShader(shader);
    if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
      const log = gl.getShaderInfoLog(shader);
      gl.deleteShader(shader);
      throw new Error(`${label} shader compilation failed:\n${log}`);
    }
    return shader;
  }

  function createProgram(gl, vertexSource, fragmentSource, label) {
    const program = gl.createProgram();
    const vs = compileShader(gl, gl.VERTEX_SHADER, vertexSource, `${label} vertex`);
    const fs = compileShader(gl, gl.FRAGMENT_SHADER, fragmentSource, `${label} fragment`);
    gl.attachShader(program, vs);
    gl.attachShader(program, fs);
    gl.linkProgram(program);
    gl.deleteShader(vs);
    gl.deleteShader(fs);
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
      const log = gl.getProgramInfoLog(program);
      gl.deleteProgram(program);
      throw new Error(`${label} program link failed:\n${log}`);
    }
    return program;
  }

  function uniformMap(gl, program, names) {
    const map = {};
    for (const name of names) {
      map[name] = gl.getUniformLocation(program, name);
    }
    return map;
  }

  function createFullscreenVAO(gl) {
    const vao = gl.createVertexArray();
    // Rendering uses gl_VertexID; no attributes or buffers are required.
    return vao;
  }

  function createRenderTarget(gl, width, height, hdr) {
    width = Math.max(2, Math.floor(width));
    height = Math.max(2, Math.floor(height));

    const texture = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, texture);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);

    const framebuffer = gl.createFramebuffer();
    gl.bindFramebuffer(gl.FRAMEBUFFER, framebuffer);

    let format = gl.RGBA8;
    let type = gl.UNSIGNED_BYTE;
    let useHdr = false;

    if (hdr) {
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA16F, width, height, 0, gl.RGBA, gl.HALF_FLOAT, null);
      gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, texture, 0);
      if (gl.checkFramebufferStatus(gl.FRAMEBUFFER) === gl.FRAMEBUFFER_COMPLETE) {
        format = gl.RGBA16F;
        type = gl.HALF_FLOAT;
        useHdr = true;
      }
    }

    if (!useHdr) {
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, width, height, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
      gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, texture, 0);
    }

    const complete = gl.checkFramebufferStatus(gl.FRAMEBUFFER) === gl.FRAMEBUFFER_COMPLETE;
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.bindTexture(gl.TEXTURE_2D, null);

    if (!complete) {
      gl.deleteFramebuffer(framebuffer);
      gl.deleteTexture(texture);
      throw new Error('Unable to allocate a complete render target.');
    }

    return { texture, framebuffer, width, height, format, type, hdr: useHdr };
  }

  function deleteRenderTarget(gl, target) {
    if (!target) return;
    gl.deleteTexture(target.texture);
    gl.deleteFramebuffer(target.framebuffer);
  }

  function createCubeTarget(gl, size, hdr) {
    const maxSize = gl.getParameter(gl.MAX_CUBE_MAP_TEXTURE_SIZE);
    size = Math.max(2, Math.min(size, maxSize));

    const texture = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_CUBE_MAP, texture);

    let format = gl.RGBA8;
    let type = gl.UNSIGNED_BYTE;
    let useHdr = false;
    const hdrFormat = hdr && (gl.RGBA16F || 0);

    if (hdrFormat) {
      gl.texImage2D(gl.TEXTURE_CUBE_MAP_POSITIVE_X, 0, gl.RGBA16F, size, size, 0, gl.RGBA, gl.HALF_FLOAT, null);
      for (let i = 1; i < 6; i++) {
        gl.texImage2D(gl.TEXTURE_CUBE_MAP_POSITIVE_X + i, 0, gl.RGBA16F, size, size, 0, gl.RGBA, gl.HALF_FLOAT, null);
      }
      format = gl.RGBA16F;
      type = gl.HALF_FLOAT;
      useHdr = true;
    } else {
      gl.texImage2D(gl.TEXTURE_CUBE_MAP_POSITIVE_X, 0, gl.RGBA8, size, size, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
      for (let i = 1; i < 6; i++) {
        gl.texImage2D(gl.TEXTURE_CUBE_MAP_POSITIVE_X + i, 0, gl.RGBA8, size, size, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
      }
    }

    gl.texParameteri(gl.TEXTURE_CUBE_MAP, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_CUBE_MAP, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_CUBE_MAP, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_CUBE_MAP, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);

    const framebuffer = gl.createFramebuffer();
    gl.bindFramebuffer(gl.FRAMEBUFFER, framebuffer);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_CUBE_MAP_POSITIVE_X, texture, 0);
    const complete = gl.checkFramebufferStatus(gl.FRAMEBUFFER) === gl.FRAMEBUFFER_COMPLETE;

    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.bindTexture(gl.TEXTURE_CUBE_MAP, null);

    if (!complete) {
      gl.deleteFramebuffer(framebuffer);
      gl.deleteTexture(texture);
      throw new Error('Unable to allocate a complete cubemap render target.');
    }

    return { texture, framebuffer, size, format, type, hdr: useHdr };
  }

  G.GL = {
    compileShader,
    createProgram,
    uniformMap,
    createFullscreenVAO,
    createRenderTarget,
    deleteRenderTarget,
    createCubeTarget,
  };
})();

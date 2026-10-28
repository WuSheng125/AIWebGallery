'use strict';

/* ============ WebGL2 基础工具 ============ */

function numberedSource(src) {
  return src.split('\n')
    .map(function (l, i) { return String(i + 1).padStart(4, ' ') + ' | ' + l; })
    .join('\n');
}

function createShader(gl, type, source, label) {
  var sh = gl.createShader(type);
  gl.shaderSource(sh, source);
  gl.compileShader(sh);
  if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) {
    var log = gl.getShaderInfoLog(sh) || '';
    console.error('[' + label + '] 着色器编译失败 / shader compile failed:\n' + log);
    console.error(numberedSource(source));
    gl.deleteShader(sh);
    throw new Error('Shader compile failed: ' + label + ' — ' + log);
  }
  return sh;
}

function createProgram(gl, vsSrc, fsSrc, label) {
  var vs = createShader(gl, gl.VERTEX_SHADER, vsSrc, label + ':vs');
  var fs = createShader(gl, gl.FRAGMENT_SHADER, fsSrc, label + ':fs');
  var prog = gl.createProgram();
  gl.attachShader(prog, vs);
  gl.attachShader(prog, fs);
  gl.linkProgram(prog);
  if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) {
    var log = gl.getProgramInfoLog(prog) || '';
    console.error('[' + label + '] 程序链接失败 / link failed: ' + log);
    gl.deleteProgram(prog);
    throw new Error('Program link failed: ' + label + ' — ' + log);
  }
  gl.deleteShader(vs);
  gl.deleteShader(fs);

  // 收集所有 active uniform 位置
  var uniforms = {};
  var n = gl.getProgramParameter(prog, gl.ACTIVE_UNIFORMS);
  for (var i = 0; i < n; i++) {
    var info = gl.getActiveUniform(prog, i);
    var name = info.name.replace(/\[0\]$/, '');
    uniforms[name] = gl.getUniformLocation(prog, name);
  }
  return { program: prog, uniforms: uniforms };
}

function createFBO(gl, w, h, internalFormat, format, type) {
  var tex = gl.createTexture();
  gl.bindTexture(gl.TEXTURE_2D, tex);
  gl.texImage2D(gl.TEXTURE_2D, 0, internalFormat, w, h, 0, format, type, null);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);

  var fb = gl.createFramebuffer();
  gl.bindFramebuffer(gl.FRAMEBUFFER, fb);
  gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, tex, 0);
  var status = gl.checkFramebufferStatus(gl.FRAMEBUFFER);
  if (status !== gl.FRAMEBUFFER_COMPLETE) {
    console.warn('FBO 不完整 / incomplete:', status.toString(16), 'size', w, 'x', h);
  }
  gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  gl.bindTexture(gl.TEXTURE_2D, null);

  return {
    fb: fb,
    tex: tex,
    w: w,
    h: h,
    dispose: function () {
      gl.deleteTexture(tex);
      gl.deleteFramebuffer(fb);
    }
  };
}

/* 全屏大三角形（无需顶点缓冲，靠 gl_VertexID 生成） */
var _quadVao = null;
function drawFullscreen(gl) {
  if (!_quadVao) _quadVao = gl.createVertexArray();
  gl.bindVertexArray(_quadVao);
  gl.drawArrays(gl.TRIANGLES, 0, 3);
}

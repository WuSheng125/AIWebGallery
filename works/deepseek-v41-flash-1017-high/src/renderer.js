import {
  FULLSCREEN_VERT,
  SCENE_FRAG,
  DISK_FRAG,
  BRIGHT_FRAG,
  BLUR_FRAG,
  COMPOSITE_FRAG,
} from './shaders.js';
import { createStarCubemap } from './celestial.js';

const DISK_TEXTURE_WIDTH = 2048;
const DISK_TEXTURE_HEIGHT = 1024;

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

/**
 * WebGL2 renderer: geodesic scene pass → high-pass → dual Kawase-like blur →
 * filmic composite. All intermediate buffers are HDR when the platform allows.
 */
export class Renderer {
  constructor(canvas) {
    this.canvas = canvas;
    this.gl = canvas.getContext('webgl2', {
      alpha: false,
      depth: false,
      stencil: false,
      antialias: false,
      preserveDrawingBuffer: true,
      powerPreference: 'high-performance',
      desynchronized: true,
    });

    assert(this.gl, 'WebGL2 is not available in this browser.');

    const gl = this.gl;
    this.maxTextureSize = gl.getParameter(gl.MAX_TEXTURE_SIZE);
    this.floatRenderTargets = !!gl.getExtension('EXT_color_buffer_float');
    this.hdrTargets = this.floatRenderTargets;
    this.anisotropy = gl.getExtension('EXT_texture_filter_anisotropic');

    this.width = 1;
    this.height = 1;
    this.sceneScale = 0.85;
    this.sceneTarget = null;
    this.bloomA = null;
    this.bloomB = null;
    this.emptyVao = gl.createVertexArray();
    this.contextLost = false;

    canvas.addEventListener('webglcontextlost', (event) => {
      event.preventDefault();
      this.contextLost = true;
    });
    canvas.addEventListener('webglcontextrestored', () => {
      this.contextLost = false;
      window.location.reload();
    });
  }

  async initialize(onProgress = async () => {}) {
    await onProgress(0.06, '链接引力透镜管线');
    this.programs = {
      scene: this.createProgram(SCENE_FRAG, 'geodesic scene'),
      disk: this.createProgram(DISK_FRAG, 'disk texture'),
      bright: this.createProgram(BRIGHT_FRAG, 'bloom bright-pass'),
      blur: this.createProgram(BLUR_FRAG, 'bloom blur'),
      composite: this.createProgram(COMPOSITE_FRAG, 'composite'),
    };

    this.uniforms = {
      scene: this.uniformMap(this.programs.scene, [
        'uResolution', 'uTime', 'uCamPos', 'uCamRight', 'uCamUp',
        'uCamForward', 'uTanHalfFov', 'uAspect', 'uLensing', 'uStepScale',
        'uShowDisk', 'uDiskInner', 'uDiskOuter', 'uDiskTemperature',
        'uDiskBrightness', 'uDoppler', 'uTurbulence', 'uPhotonRing',
        'uStarBrightness', 'uNebula', 'uDiskTex', 'uStarTex',
      ]),
      bright: this.uniformMap(this.programs.bright, ['uScene', 'uSourceTexel', 'uThreshold']),
      blur: this.uniformMap(this.programs.blur, ['uImage', 'uDirection']),
      composite: this.uniformMap(this.programs.composite, [
        'uScene', 'uBloom', 'uResolution', 'uTime', 'uExposure', 'uBloomStrength',
      ]),
    };

    await onProgress(0.2, '求解吸积盘湍流场');
    this.buildDiskTexture();

    await onProgress(0.48, '播撒深空恒星天球');
    this.buildStarfield();

    await onProgress(0.82, '校准光子环与曝光');
    this.allocateTargets();

    const gl = this.gl;
    gl.disable(gl.DEPTH_TEST);
    gl.disable(gl.CULL_FACE);
    gl.disable(gl.BLEND);
    gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1);

    await onProgress(1, '观测链路就绪');
  }

  /* ----------------------------------------------------------- shader utils */

  compileShader(type, source, label) {
    const gl = this.gl;
    const shader = gl.createShader(type);
    gl.shaderSource(shader, source);
    gl.compileShader(shader);
    if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
      const log = gl.getShaderInfoLog(shader);
      gl.deleteShader(shader);
      throw new Error(`${label} shader failed to compile:\n${log}`);
    }
    return shader;
  }

  createProgram(fragmentSource, label) {
    const gl = this.gl;
    const program = gl.createProgram();
    const vs = this.compileShader(gl.VERTEX_SHADER, FULLSCREEN_VERT, `${label} vertex`);
    const fs = this.compileShader(gl.FRAGMENT_SHADER, fragmentSource, label);
    gl.attachShader(program, vs);
    gl.attachShader(program, fs);
    gl.linkProgram(program);
    gl.deleteShader(vs);
    gl.deleteShader(fs);
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
      const log = gl.getProgramInfoLog(program);
      gl.deleteProgram(program);
      throw new Error(`${label} program failed to link:\n${log}`);
    }
    return program;
  }

  uniformMap(program, names) {
    const gl = this.gl;
    const result = {};
    for (const name of names) result[name] = gl.getUniformLocation(program, name);
    return result;
  }

  /* --------------------------------------------------------------- textures */

  buildDiskTexture() {
    const gl = this.gl;
    const width = DISK_TEXTURE_WIDTH;
    const height = DISK_TEXTURE_HEIGHT;

    const texture = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, texture);
    gl.texImage2D(
      gl.TEXTURE_2D, 0, gl.RGBA8, width, height, 0, gl.RGBA, gl.UNSIGNED_BYTE, null
    );
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.REPEAT);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    if (this.anisotropy) {
      gl.texParameterf(
        gl.TEXTURE_2D,
        this.anisotropy.TEXTURE_MAX_ANISOTROPY_EXT,
        Math.min(4, gl.getParameter(this.anisotropy.MAX_TEXTURE_MAX_ANISOTROPY_EXT))
      );
    }

    const framebuffer = gl.createFramebuffer();
    gl.bindFramebuffer(gl.FRAMEBUFFER, framebuffer);
    gl.framebufferTexture2D(
      gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, texture, 0
    );
    assert(
      gl.checkFramebufferStatus(gl.FRAMEBUFFER) === gl.FRAMEBUFFER_COMPLETE,
      'Could not create the accretion-disk texture target.'
    );

    gl.viewport(0, 0, width, height);
    gl.useProgram(this.programs.disk);
    gl.bindVertexArray(this.emptyVao);
    gl.drawArrays(gl.TRIANGLES, 0, 3);

    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.bindTexture(gl.TEXTURE_2D, null);
    gl.deleteFramebuffer(framebuffer);

    this.diskTexture = texture;
  }

  buildStarfield() {
    const result = createStarCubemap(this.gl, {
      size: 1024,
      starsPerFace: 4800,
      seed: 0x51f15e,
    });
    this.starTexture = result.texture;
    this.starCount = result.starCount;
  }

  /* ---------------------------------------------------------------- targets */

  createRenderTarget(width, height) {
    const gl = this.gl;
    const texture = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, texture);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);

    const tryFormat = (internalFormat, type) => {
      gl.texImage2D(gl.TEXTURE_2D, 0, internalFormat, width, height, 0, gl.RGBA, type, null);
      gl.bindFramebuffer(gl.FRAMEBUFFER, framebuffer);
      gl.framebufferTexture2D(
        gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, texture, 0
      );
      return gl.checkFramebufferStatus(gl.FRAMEBUFFER) === gl.FRAMEBUFFER_COMPLETE;
    };

    const framebuffer = gl.createFramebuffer();

    let ok = false;
    if (this.floatRenderTargets) {
      ok = tryFormat(gl.RGBA16F, gl.HALF_FLOAT);
    }
    if (!ok) {
      this.hdrTargets = false;
      ok = tryFormat(gl.RGBA8, gl.UNSIGNED_BYTE);
    }

    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.bindTexture(gl.TEXTURE_2D, null);
    assert(ok, 'Could not create an HDR render target.');

    return { texture, framebuffer, width, height };
  }

  destroyTarget(target) {
    if (!target) return;
    const gl = this.gl;
    gl.deleteTexture(target.texture);
    gl.deleteFramebuffer(target.framebuffer);
  }

  allocateTargets() {
    const gl = this.gl;
    this.destroyTarget(this.sceneTarget);
    this.destroyTarget(this.bloomA);
    this.destroyTarget(this.bloomB);

    const dprScene = Math.max(0.25, this.sceneScale);
    const sceneW = Math.min(
      this.maxTextureSize,
      Math.max(2, Math.round(this.width * dprScene))
    );
    const sceneH = Math.min(
      this.maxTextureSize,
      Math.max(2, Math.round(this.height * dprScene))
    );
    this.sceneTarget = this.createRenderTarget(sceneW, sceneH);

    const bloomW = Math.max(2, Math.round(sceneW / 4));
    const bloomH = Math.max(2, Math.round(sceneH / 4));
    this.bloomA = this.createRenderTarget(bloomW, bloomH);
    this.bloomB = this.createRenderTarget(bloomW, bloomH);

    gl.bindTexture(gl.TEXTURE_2D, null);
  }

  resize(width, height, sceneScale = this.sceneScale) {
    const gl = this.gl;
    width = Math.max(2, Math.floor(width));
    height = Math.max(2, Math.floor(height));
    this.sceneScale = Math.max(0.25, Math.min(1.5, sceneScale));

    const sizeChanged = this.canvas.width !== width || this.canvas.height !== height;
    if (sizeChanged) {
      this.canvas.width = width;
      this.canvas.height = height;
      this.width = width;
      this.height = height;
    }
    if (sizeChanged || !this.sceneTarget) {
      this.allocateTargets();
    }
  }

  setSceneScale(sceneScale) {
    const next = Math.max(0.35, Math.min(1.5, sceneScale));
    if (Math.abs(next - this.sceneScale) < 0.015) return;
    this.sceneScale = next;
    this.allocateTargets();
  }

  /* ------------------------------------------------------------------ passes */

  drawFullscreen() {
    const gl = this.gl;
    gl.bindVertexArray(this.emptyVao);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
  }

  render(state, camera, time) {
    if (this.contextLost || !this.sceneTarget) return;

    const gl = this.gl;
    gl.disable(gl.BLEND);
    gl.disable(gl.DEPTH_TEST);

    const sceneW = this.sceneTarget.width;
    const sceneH = this.sceneTarget.height;

    /* ---- geodesic scene ------------------------------------------------- */
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.sceneTarget.framebuffer);
    gl.viewport(0, 0, sceneW, sceneH);
    gl.useProgram(this.programs.scene);

    const u = this.uniforms.scene;
    gl.uniform2f(u.uResolution, sceneW, sceneH);
    gl.uniform1f(u.uTime, time);
    gl.uniform3f(u.uCamPos, camera.position[0], camera.position[1], camera.position[2]);
    gl.uniform3f(u.uCamRight, camera.right[0], camera.right[1], camera.right[2]);
    gl.uniform3f(u.uCamUp, camera.up[0], camera.up[1], camera.up[2]);
    gl.uniform3f(u.uCamForward, camera.forward[0], camera.forward[1], camera.forward[2]);
    gl.uniform1f(u.uTanHalfFov, Math.tan((state.fov * Math.PI) / 360));
    gl.uniform1f(u.uAspect, sceneW / sceneH);
    gl.uniform1f(u.uLensing, state.lensing);
    gl.uniform1f(u.uStepScale, this.stepScaleForQuality(state.quality));
    gl.uniform1f(u.uShowDisk, state.showDisk ? 1 : 0);
    gl.uniform1f(u.uDiskInner, state.diskInner);
    gl.uniform1f(u.uDiskOuter, state.diskOuter);
    gl.uniform1f(u.uDiskTemperature, state.temperature);
    gl.uniform1f(u.uDiskBrightness, state.diskBrightness);
    gl.uniform1f(u.uDoppler, state.doppler);
    gl.uniform1f(u.uTurbulence, state.turbulence);
    gl.uniform1f(u.uPhotonRing, state.photonRing);
    gl.uniform1f(u.uStarBrightness, state.stars);
    gl.uniform1f(u.uNebula, state.nebula);

    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, this.diskTexture);
    gl.uniform1i(u.uDiskTex, 0);
    gl.activeTexture(gl.TEXTURE1);
    gl.bindTexture(gl.TEXTURE_CUBE_MAP, this.starTexture);
    gl.uniform1i(u.uStarTex, 1);
    this.drawFullscreen();

    /* ---- bright pass ---------------------------------------------------- */
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.bloomA.framebuffer);
    gl.viewport(0, 0, this.bloomA.width, this.bloomA.height);
    gl.useProgram(this.programs.bright);
    const ub = this.uniforms.bright;
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, this.sceneTarget.texture);
    gl.uniform1i(ub.uScene, 0);
    gl.uniform2f(ub.uSourceTexel, 1 / sceneW, 1 / sceneH);
    gl.uniform1f(ub.uThreshold, this.hdrTargets ? 1.02 : 0.72);
    this.drawFullscreen();

    /* ---- bloom blur ----------------------------------------------------- */
    gl.useProgram(this.programs.blur);
    const ul = this.uniforms.blur;
    gl.uniform1i(ul.uImage, 0);

    const blurPass = (source, destination, dx, dy) => {
      gl.bindFramebuffer(gl.FRAMEBUFFER, destination.framebuffer);
      gl.viewport(0, 0, destination.width, destination.height);
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, source.texture);
      gl.uniform2f(ul.uDirection, dx / source.width, dy / source.height);
      this.drawFullscreen();
    };

    // Two ping-pong iterations give a soft, wide halo without a large kernel.
    blurPass(this.bloomA, this.bloomB, 1.4, 0);
    blurPass(this.bloomB, this.bloomA, 0, 1.4);
    blurPass(this.bloomA, this.bloomB, 3.2, 0);
    blurPass(this.bloomB, this.bloomA, 0, 3.2);

    /* ---- composite ------------------------------------------------------ */
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.viewport(0, 0, this.width, this.height);
    gl.useProgram(this.programs.composite);
    const uc = this.uniforms.composite;
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, this.sceneTarget.texture);
    gl.uniform1i(uc.uScene, 0);
    gl.activeTexture(gl.TEXTURE1);
    gl.bindTexture(gl.TEXTURE_2D, this.bloomA.texture);
    gl.uniform1i(uc.uBloom, 1);
    gl.uniform2f(uc.uResolution, this.width, this.height);
    gl.uniform1f(uc.uTime, time);
    gl.uniform1f(uc.uExposure, state.exposure);
    gl.uniform1f(uc.uBloomStrength, state.bloom);
    this.drawFullscreen();

    gl.bindVertexArray(null);
  }

  stepScaleForQuality(quality) {
    switch (quality) {
      case 'high': return 0.022;
      case 'performance': return 0.045;
      case 'balanced': return 0.034;
      default: return 0.030;
    }
  }

  capture() {
    return new Promise((resolve) => {
      this.canvas.toBlob((blob) => resolve(blob), 'image/png');
    });
  }
}

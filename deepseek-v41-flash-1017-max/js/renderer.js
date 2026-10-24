/*
 * GARGANTUA — WebGL2 renderer.
 *
 * Pipeline
 *   geodesic scene (HDR)  →  bright pass  →  two-scale separable bloom  →  ACES composite
 *
 * The scene pass owns nearly all of the GPU cost: it traces one Schwarzschild
 * null geodesic per pixel, checks every equatorial-plane crossing against the
 * accretion disk, then samples the lensed sky.
 */
(function () {
  'use strict';

  const G = (window.GARGANTUA = window.GARGANTUA || {});

  const DISK_TEXTURE_WIDTH = 2048;
  const DISK_TEXTURE_HEIGHT = 1024;
  const STAR_CUBE_SIZE = 1024;
  const NEBULA_CUBE_SIZE = 512;
  const MAX_BACKING_PIXELS = 4200000;

  const QUALITY_MODES = {
    auto: { scale: 0.84, step: 0.028 },
    high: { scale: 0.92, step: 0.023 },
    balanced: { scale: 0.72, step: 0.034 },
    performance: { scale: 0.52, step: 0.046 },
  };

  const SCENE_UNIFORMS = [
    'uResolution', 'uTime', 'uDiskTime',
    'uCamPos', 'uCamRight', 'uCamUp', 'uCamForward',
    'uTanHalfFov', 'uAspect', 'uOffsetX',
    'uLensing', 'uStepScale', 'uShowDisk',
    'uDiskInner', 'uDiskOuter', 'uDiskTemperature', 'uDiskBrightness',
    'uTurbulence', 'uDoppler', 'uPhotonRing', 'uStarBrightness', 'uNebula',
    'uDiskTex', 'uStarTex', 'uNebulaTex',
  ];

  class Renderer {
    constructor(canvas) {
      this.canvas = canvas;
      this.gl = canvas.getContext('webgl2', {
        alpha: false,
        depth: false,
        stencil: false,
        antialias: false,
        premultipliedAlpha: false,
        preserveDrawingBuffer: true,
        powerPreference: 'high-performance',
        desynchronized: true,
      });

      if (!this.gl) {
        throw new Error('WebGL2 is not available. The black hole requires a WebGL2-capable browser and hardware acceleration.');
      }

      const gl = this.gl;
      gl.getExtension('EXT_color_buffer_float');
      gl.getExtension('EXT_color_buffer_half_float');

      this.maxTextureSize = Math.min(gl.getParameter(gl.MAX_TEXTURE_SIZE), 8192);
      this.hdrEnabled = !!gl.getExtension('EXT_color_buffer_float');
      this.vao = G.GL.createFullscreenVAO(gl);
      this.width = 2;
      this.height = 2;
      this.sceneScale = QUALITY_MODES.auto.scale;
      this.stepScale = QUALITY_MODES.auto.step;
      this.qualityMode = 'auto';
      this.starDensity = 0.9;
      this.contextLost = false;
      this.onContextLost = null;
      this._frameSamples = [];
      this._framesRendered = 0;
      this._autoCooldown = 0;
      this._starSeed = 4.3791;
      this._nebulaSeed = 8.173;
      this._lastRenderArgs = null;

      this.sceneTarget = null;
      this.bloomA = null;
      this.bloomB = null;

      canvas.addEventListener('webglcontextlost', (event) => {
        event.preventDefault();
        this.contextLost = true;
        if (typeof this.onContextLost === 'function') this.onContextLost();
      }, false);
      canvas.addEventListener('webglcontextrestored', () => {
        this.contextLost = false;
        // Rebuilding the entire GPU state is safer than trying to reuse stale
        // textures; a reload also keeps the UI and shaders in sync.
        window.location.reload();
      }, false);

      this.handleVisibility = () => {
        if (document.hidden) this._frameSamples.length = 0;
      };
      document.addEventListener('visibilitychange', this.handleVisibility);
    }

    /* ----------------------------------------------------------- stage setup */

    async init(onProgress) {
      const report = async (value, label) => {
        if (typeof onProgress === 'function') await onProgress(value, label);
      };

      const gl = this.gl;
      const shaders = G.SHADERS;

      await report(0.06, '正在编译时空着色器');
      this.programs = {
        scene: G.GL.createProgram(gl, shaders.FULLSCREEN_VERT, shaders.SCENE_FRAG, 'geodesic scene'),
        starfield: G.GL.createProgram(gl, shaders.FULLSCREEN_VERT, shaders.STARFIELD_FRAG, 'starfield'),
        nebula: G.GL.createProgram(gl, shaders.FULLSCREEN_VERT, shaders.NEBULA_FRAG, 'nebula'),
        disk: G.GL.createProgram(gl, shaders.FULLSCREEN_VERT, shaders.DISK_FRAG, 'disk turbulence'),
        bright: G.GL.createProgram(gl, shaders.FULLSCREEN_VERT, shaders.BRIGHT_FRAG, 'bright pass'),
        blur: G.GL.createProgram(gl, shaders.FULLSCREEN_VERT, shaders.BLUR_FRAG, 'bloom blur'),
        composite: G.GL.createProgram(gl, shaders.FULLSCREEN_VERT, shaders.COMPOSITE_FRAG, 'composite'),
      };

      this.uniforms = {
        scene: G.GL.uniformMap(gl, this.programs.scene, SCENE_UNIFORMS),
        starfield: G.GL.uniformMap(gl, this.programs.starfield, ['uFace', 'uDensity', 'uSeed']),
        nebula: G.GL.uniformMap(gl, this.programs.nebula, ['uFace', 'uSeed']),
        bright: G.GL.uniformMap(gl, this.programs.bright, ['uScene', 'uSourceTexel', 'uThreshold']),
        blur: G.GL.uniformMap(gl, this.programs.blur, ['uImage', 'uTexel', 'uDirection']),
        composite: G.GL.uniformMap(gl, this.programs.composite, [
          'uScene', 'uBloom', 'uResolution', 'uTime',
          'uExposure', 'uBloomStrength', 'uVignette', 'uGrain',
        ]),
      };

      await report(0.18, '正在锻打吸积盘湍流纹理');
      this.buildDiskTexture();

      await report(0.42, '正在播撒深空恒星');
      this.starCube = G.GL.createCubeTarget(gl, STAR_CUBE_SIZE, this.hdrEnabled);
      this.paintStarCube();

      await report(0.7, '正在铺设银河尘埃');
      this.nebulaCube = G.GL.createCubeTarget(gl, NEBULA_CUBE_SIZE, this.hdrEnabled);
      this.paintNebulaCube();

      await report(0.88, '正在校准观测阵列');
      this.resize(this.canvas.clientWidth || window.innerWidth, this.canvas.clientHeight || window.innerHeight, window.devicePixelRatio || 1);

      gl.disable(gl.DEPTH_TEST);
      gl.disable(gl.CULL_FACE);
      gl.disable(gl.BLEND);
      gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1);
      gl.clearColor(0, 0, 0, 1);

      await report(1, '观测链路已建立');
    }

    /* -------------------------------------------------------------- textures */

    buildDiskTexture() {
      const gl = this.gl;
      const texture = gl.createTexture();
      gl.bindTexture(gl.TEXTURE_2D, texture);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, DISK_TEXTURE_WIDTH, DISK_TEXTURE_HEIGHT, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.REPEAT);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);

      const framebuffer = gl.createFramebuffer();
      gl.bindFramebuffer(gl.FRAMEBUFFER, framebuffer);
      gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, texture, 0);
      if (gl.checkFramebufferStatus(gl.FRAMEBUFFER) !== gl.FRAMEBUFFER_COMPLETE) {
        throw new Error('Could not create the accretion-disk texture target.');
      }

      gl.viewport(0, 0, DISK_TEXTURE_WIDTH, DISK_TEXTURE_HEIGHT);
      gl.useProgram(this.programs.disk);
      gl.bindVertexArray(this.vao);
      gl.drawArrays(gl.TRIANGLES, 0, 3);

      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
      gl.bindTexture(gl.TEXTURE_2D, null);
      gl.deleteFramebuffer(framebuffer);
      gl.useProgram(null);

      this.diskTexture = texture;
    }

    paintStarCube() {
      const gl = this.gl;
      const target = this.starCube;
      if (!target) return;

      gl.bindFramebuffer(gl.FRAMEBUFFER, target.framebuffer);
      gl.viewport(0, 0, target.size, target.size);
      gl.useProgram(this.programs.starfield);
      gl.bindVertexArray(this.vao);
      gl.uniform1f(this.uniforms.starfield.uDensity, Math.max(0.2, Math.min(2.0, this.starDensity)));
      gl.uniform1f(this.uniforms.starfield.uSeed, this._starSeed);

      for (let face = 0; face < 6; face++) {
        gl.framebufferTexture2D(
          gl.FRAMEBUFFER,
          gl.COLOR_ATTACHMENT0,
          gl.TEXTURE_CUBE_MAP_POSITIVE_X + face,
          target.texture,
          0
        );
        gl.uniform1i(this.uniforms.starfield.uFace, face);
        gl.drawArrays(gl.TRIANGLES, 0, 3);
      }

      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
      gl.bindTexture(gl.TEXTURE_CUBE_MAP, null);
      gl.useProgram(null);
    }

    paintNebulaCube() {
      const gl = this.gl;
      const target = this.nebulaCube;
      if (!target) return;

      gl.bindFramebuffer(gl.FRAMEBUFFER, target.framebuffer);
      gl.viewport(0, 0, target.size, target.size);
      gl.useProgram(this.programs.nebula);
      gl.bindVertexArray(this.vao);
      gl.uniform1f(this.uniforms.nebula.uSeed, this._nebulaSeed);

      for (let face = 0; face < 6; face++) {
        gl.framebufferTexture2D(
          gl.FRAMEBUFFER,
          gl.COLOR_ATTACHMENT0,
          gl.TEXTURE_CUBE_MAP_POSITIVE_X + face,
          target.texture,
          0
        );
        gl.uniform1i(this.uniforms.nebula.uFace, face);
        gl.drawArrays(gl.TRIANGLES, 0, 3);
      }

      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
      gl.bindTexture(gl.TEXTURE_CUBE_MAP, null);
      gl.useProgram(null);
    }

    setStarDensity(value) {
      const next = Math.max(0.2, Math.min(2.0, Number(value) || 1));
      if (Math.abs(next - this.starDensity) < 0.002) return false;
      this.starDensity = next;
      if (!this.contextLost && this.starCube) {
        this.paintStarCube();
      }
      return true;
    }

    /* --------------------------------------------------------------- targets */

    allocateTargets() {
      const gl = this.gl;
      if (this.sceneTarget) G.GL.deleteRenderTarget(gl, this.sceneTarget);
      if (this.bloomA) G.GL.deleteRenderTarget(gl, this.bloomA);
      if (this.bloomB) G.GL.deleteRenderTarget(gl, this.bloomB);

      const sceneW = Math.max(2, Math.min(this.maxTextureSize, Math.round(this.width * this.sceneScale)));
      const sceneH = Math.max(2, Math.min(this.maxTextureSize, Math.round(this.height * this.sceneScale)));

      this.sceneTarget = G.GL.createRenderTarget(gl, sceneW, sceneH, this.hdrEnabled);
      const bloomW = Math.max(2, Math.round(sceneW / 4));
      const bloomH = Math.max(2, Math.round(sceneH / 4));
      this.bloomA = G.GL.createRenderTarget(gl, bloomW, bloomH, this.hdrEnabled);
      this.bloomB = G.GL.createRenderTarget(gl, bloomW, bloomH, this.hdrEnabled);
    }

    resize(cssWidth, cssHeight, dpr) {
      if (this.contextLost) return;
      const gl = this.gl;

      const capDpr = Math.min(Math.max(dpr || 1, 1), 1.75);
      let width = Math.max(2, Math.round((cssWidth || window.innerWidth) * capDpr));
      let height = Math.max(2, Math.round((cssHeight || window.innerHeight) * capDpr));

      const totalPixels = width * height;
      if (totalPixels > MAX_BACKING_PIXELS) {
        const factor = Math.sqrt(MAX_BACKING_PIXELS / totalPixels);
        width = Math.max(2, Math.round(width * factor));
        height = Math.max(2, Math.round(height * factor));
      }

      width = Math.min(width, this.maxTextureSize);
      height = Math.min(height, this.maxTextureSize);

      const changed = this.canvas.width !== width || this.canvas.height !== height || !this.sceneTarget;
      this.width = width;
      this.height = height;
      if (changed) {
        this.canvas.width = width;
        this.canvas.height = height;
        this.allocateTargets();
      }
    }

    setQualityMode(mode) {
      if (!QUALITY_MODES[mode] || mode === this.qualityMode) return;
      this.qualityMode = mode;
      const preset = QUALITY_MODES[mode];
      this.stepScale = preset.step;
      this.sceneScale = preset.scale;
      this._frameSamples.length = 0;
      this._autoCooldown = 0;
      this._framesRendered = 0;
      this.allocateTargets();
    }

    updateAdaptive(frameMs) {
      if (this.qualityMode !== 'auto' || this.contextLost) return;
      this._framesRendered += 1;
      this._frameSamples.push(frameMs);
      if (this._frameSamples.length > 45) this._frameSamples.shift();
      if (this._framesRendered < 80 || this._autoCooldown > 0) {
        if (this._autoCooldown > 0) this._autoCooldown -= 1;
        return;
      }
      if (this._frameSamples.length < 40) return;

      let total = 0;
      for (const sample of this._frameSamples) total += sample;
      const average = total / this._frameSamples.length;
      let nextScale = this.sceneScale;

      if (average > 21.5 && this.sceneScale > 0.53) {
        nextScale = Math.max(0.53, this.sceneScale - 0.045);
      } else if (average < 15.0 && this.sceneScale < 0.88) {
        nextScale = Math.min(0.88, this.sceneScale + 0.022);
      }

      if (Math.abs(nextScale - this.sceneScale) > 0.001) {
        this.sceneScale = nextScale;
        this.allocateTargets();
        this._autoCooldown = 75;
        this._frameSamples.length = 0;
      }
    }

    getStats() {
      return {
        width: this.width,
        height: this.height,
        sceneWidth: this.sceneTarget ? this.sceneTarget.width : 0,
        sceneHeight: this.sceneTarget ? this.sceneTarget.height : 0,
        scale: this.sceneScale,
        quality: this.qualityMode,
        hdr: this.hdrEnabled,
      };
    }

    /* ---------------------------------------------------------------- passes */

    drawFullscreen() {
      const gl = this.gl;
      gl.bindVertexArray(this.vao);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
    }

    render(state, camera, env) {
      if (this.contextLost || !this.sceneTarget) return;
      const gl = this.gl;
      const time = env && Number.isFinite(env.time) ? env.time : 0;
      const diskTime = env && Number.isFinite(env.diskTime) ? env.diskTime : 0;
      const offsetX = env && Number.isFinite(env.offsetX) ? env.offsetX : 0;

      this._lastRenderArgs = { state, camera, env };
      gl.disable(gl.BLEND);
      gl.disable(gl.DEPTH_TEST);
      gl.disable(gl.CULL_FACE);

      const sceneW = this.sceneTarget.width;
      const sceneH = this.sceneTarget.height;

      /* --- geodesic scene -------------------------------------------------- */
      gl.bindFramebuffer(gl.FRAMEBUFFER, this.sceneTarget.framebuffer);
      gl.viewport(0, 0, sceneW, sceneH);
      gl.useProgram(this.programs.scene);

      const u = this.uniforms.scene;
      gl.uniform2f(u.uResolution, sceneW, sceneH);
      gl.uniform1f(u.uTime, time);
      gl.uniform1f(u.uDiskTime, diskTime);
      gl.uniform3f(u.uCamPos, camera.position[0], camera.position[1], camera.position[2]);
      gl.uniform3f(u.uCamRight, camera.right[0], camera.right[1], camera.right[2]);
      gl.uniform3f(u.uCamUp, camera.up[0], camera.up[1], camera.up[2]);
      gl.uniform3f(u.uCamForward, camera.forward[0], camera.forward[1], camera.forward[2]);
      gl.uniform1f(u.uTanHalfFov, camera.tanHalfFov);
      gl.uniform1f(u.uAspect, sceneW / sceneH);
      gl.uniform1f(u.uOffsetX, offsetX);
      gl.uniform1f(u.uLensing, state.lensing);
      gl.uniform1f(u.uStepScale, this.stepScale);
      gl.uniform1f(u.uShowDisk, state.showDisk ? 1 : 0);
      gl.uniform1f(u.uDiskInner, state.diskInner);
      gl.uniform1f(u.uDiskOuter, state.diskOuter);
      gl.uniform1f(u.uDiskTemperature, state.temperature);
      gl.uniform1f(u.uDiskBrightness, state.diskBrightness);
      gl.uniform1f(u.uTurbulence, state.turbulence);
      gl.uniform1f(u.uDoppler, state.doppler);
      gl.uniform1f(u.uPhotonRing, state.photonRing);
      gl.uniform1f(u.uStarBrightness, state.stars);
      gl.uniform1f(u.uNebula, state.nebula);

      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, this.diskTexture);
      gl.uniform1i(u.uDiskTex, 0);
      gl.activeTexture(gl.TEXTURE1);
      gl.bindTexture(gl.TEXTURE_CUBE_MAP, this.starCube.texture);
      gl.uniform1i(u.uStarTex, 1);
      gl.activeTexture(gl.TEXTURE2);
      gl.bindTexture(gl.TEXTURE_CUBE_MAP, this.nebulaCube.texture);
      gl.uniform1i(u.uNebulaTex, 2);
      this.drawFullscreen();

      /* --- bright pass ----------------------------------------------------- */
      gl.bindFramebuffer(gl.FRAMEBUFFER, this.bloomA.framebuffer);
      gl.viewport(0, 0, this.bloomA.width, this.bloomA.height);
      gl.useProgram(this.programs.bright);
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, this.sceneTarget.texture);
      gl.uniform1i(this.uniforms.bright.uScene, 0);
      gl.uniform2f(this.uniforms.bright.uSourceTexel, 1 / sceneW, 1 / sceneH);
      gl.uniform1f(this.uniforms.bright.uThreshold, this.hdrEnabled ? 1.05 : 0.55);
      this.drawFullscreen();

      /* --- bloom blur ------------------------------------------------------ */
      gl.useProgram(this.programs.blur);
      const blurUniforms = this.uniforms.blur;
      gl.uniform1i(blurUniforms.uImage, 0);

      const blurPass = (source, destination, dx, dy) => {
        gl.bindFramebuffer(gl.FRAMEBUFFER, destination.framebuffer);
        gl.viewport(0, 0, destination.width, destination.height);
        gl.activeTexture(gl.TEXTURE0);
        gl.bindTexture(gl.TEXTURE_2D, source.texture);
        gl.uniform2f(blurUniforms.uTexel, 1 / source.width, 1 / source.height);
        gl.uniform2f(blurUniforms.uDirection, dx, dy);
        this.drawFullscreen();
      };

      blurPass(this.bloomA, this.bloomB, 1.30, 0);
      blurPass(this.bloomB, this.bloomA, 0, 1.30);
      blurPass(this.bloomA, this.bloomB, 3.10, 0);
      blurPass(this.bloomB, this.bloomA, 0, 3.10);

      /* --- composite ------------------------------------------------------- */
      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
      gl.viewport(0, 0, this.width, this.height);
      gl.useProgram(this.programs.composite);
      const c = this.uniforms.composite;
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, this.sceneTarget.texture);
      gl.uniform1i(c.uScene, 0);
      gl.activeTexture(gl.TEXTURE1);
      gl.bindTexture(gl.TEXTURE_2D, this.bloomA.texture);
      gl.uniform1i(c.uBloom, 1);
      gl.uniform2f(c.uResolution, this.width, this.height);
      gl.uniform1f(c.uTime, time);
      gl.uniform1f(c.uExposure, state.exposure);
      gl.uniform1f(c.uBloomStrength, state.bloom);
      gl.uniform1f(c.uVignette, state.vignette / 100);
      gl.uniform1f(c.uGrain, state.grain / 100);
      this.drawFullscreen();

      gl.bindVertexArray(null);
    }

    capture() {
      if (this._lastRenderArgs) {
        const { state, camera, env } = this._lastRenderArgs;
        this.render(state, camera, env);
      }
      return new Promise((resolve, reject) => {
        this.canvas.toBlob((blob) => {
          if (blob) resolve(blob);
          else reject(new Error('Unable to encode frame.'));
        }, 'image/png');
      });
    }

    dispose() {
      document.removeEventListener('visibilitychange', this.handleVisibility);
      if (!this.gl) return;
      const gl = this.gl;
      if (this.sceneTarget) G.GL.deleteRenderTarget(gl, this.sceneTarget);
      if (this.bloomA) G.GL.deleteRenderTarget(gl, this.bloomA);
      if (this.bloomB) G.GL.deleteRenderTarget(gl, this.bloomB);
      gl.deleteTexture(this.diskTexture);
      if (this.starCube) {
        gl.deleteTexture(this.starCube.texture);
        gl.deleteFramebuffer(this.starCube.framebuffer);
      }
      if (this.nebulaCube) {
        gl.deleteTexture(this.nebulaCube.texture);
        gl.deleteFramebuffer(this.nebulaCube.framebuffer);
      }
      for (const program of Object.values(this.programs || {})) gl.deleteProgram(program);
    }
  }

  G.Renderer = Renderer;
})();

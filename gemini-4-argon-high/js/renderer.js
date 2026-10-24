/**
 * GARGANTUA — Three.js Multi-Pass Relativistic Black Hole Renderer & Orbit Controller
 */
(function (global) {
  'use strict';

  const THREE = global.THREE;
  const { VERTEX_SHADER, BLACKHOLE_FRAG, BLOOM_FRAG, COMPOSITE_FRAG } = global.GargantuaShaders;
  const { computeAstrophysics } = global.GargantuaConfig;

  class GargantuaRenderer {
    constructor(canvas, initialParams, onCameraChange, onStatsUpdate) {
      this.canvas = canvas;
      this.params = Object.assign({}, initialParams);
      this.onCameraChange = onCameraChange || function () {};
      this.onStatsUpdate = onStatsUpdate || function () {};

      // Smooth damped camera target state
      this.targetCam = {
        distance: this.params.camDistance,
        elevation: this.params.camElevation,
        azimuth: this.params.camAzimuth,
        roll: this.params.camRoll,
        fov: this.params.camFov
      };
      this.currentCam = Object.assign({}, this.targetCam);

      this.isDragging = false;
      this.dragMode = 'orbit'; // 'orbit' | 'roll'
      this.lastMouse = { x: 0, y: 0 };
      this.lastInteractionTime = -100;

      this.startTime = performance.now();
      this.lastFrameTime = this.startTime;
      this.elapsedSimTime = 0;
      this.fpsFrames = 0;
      this.fpsLastSample = this.startTime;
      this.currentFps = 60;
      this.currentFrameMs = 16.6;

      this._initThree();
      this._initPasses();
      this._initControls();
      this.resize();
    }

    _initThree() {
      this.renderer = new THREE.WebGLRenderer({
        canvas: this.canvas,
        antialias: false,
        powerPreference: 'high-performance',
        preserveDrawingBuffer: true
      });
      this.renderer.setPixelRatio(1);
      this.orthoCamera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
      this.quadGeo = new THREE.PlaneGeometry(2, 2);

      // Check HalfFloat render target support
      const gl = this.renderer.getContext();
      const isWebGL2 = typeof WebGL2RenderingContext !== 'undefined' && gl instanceof WebGL2RenderingContext;
      const extColorBufferFloat = gl.getExtension('EXT_color_buffer_float') || gl.getExtension('EXT_color_buffer_half_float');
      this.rtType = (isWebGL2 && extColorBufferFloat) ? THREE.HalfFloatType : THREE.UnsignedByteType;
    }

    _createRenderTarget(w, h) {
      return new THREE.WebGLRenderTarget(w, h, {
        minFilter: THREE.LinearFilter,
        magFilter: THREE.LinearFilter,
        format: THREE.RGBAFormat,
        type: this.rtType,
        depthBuffer: false,
        stencilBuffer: false
      });
    }

    _initPasses() {
      const astro = computeAstrophysics(this.params);

      // Pass 1: Relativistic Raymarching Material
      this.bhUniforms = {
        uResolution: { value: new THREE.Vector2(1280, 720) },
        uTime: { value: 0.0 },
        uCamPos: { value: new THREE.Vector3(0, 1.5, 13.8) },
        uCamRight: { value: new THREE.Vector3(1, 0, 0) },
        uCamUp: { value: new THREE.Vector3(0, 1, 0) },
        uCamForward: { value: new THREE.Vector3(0, 0, -1) },
        uTanHalfFov: { value: Math.tan((44.0 * 0.5 * Math.PI) / 180.0) },

        uHorizonRadius: { value: this.params.horizonRadius },
        uSpin: { value: this.params.spin },
        uLensingStrength: { value: this.params.lensingStrength },
        uPhotonRingIntensity: { value: this.params.photonRingIntensity },
        uShadowAsymmetry: { value: this.params.shadowAsymmetry },
        uIscoRadius: { value: astro.rIscoRs },
        uPhotonSphereRadius: { value: astro.rPhRs },

        uDiskEnabled: { value: this.params.diskEnabled ? 1.0 : 0.0 },
        uDiskInnerRadius: { value: astro.effectiveInnerRs * this.params.horizonRadius },
        uDiskOuterRadius: { value: this.params.diskOuterRadius * this.params.horizonRadius },
        uDiskThickness: { value: this.params.diskThickness },
        uDiskDensity: { value: this.params.diskDensity },
        uDiskSpeed: { value: this.params.diskRotationSpeed },
        uDopplerBeaming: { value: this.params.dopplerBeaming },
        uDiskTemp: { value: this.params.diskTemperature },
        uColorMode: { value: this.params.colorMode },
        uDiskTurbulence: { value: this.params.diskTurbulence },
        uJetIntensity: { value: this.params.jetIntensity },

        uStarDensity: { value: this.params.starDensity },
        uNebulaIntensity: { value: this.params.nebulaIntensity },
        uEinsteinRingBoost: { value: this.params.einsteinRingBoost },
        uSpacetimeGrid: { value: this.params.spacetimeGrid ? 1.0 : 0.0 },
        uMaxSteps: { value: this.params.raySteps }
      };

      this.bhMaterial = new THREE.ShaderMaterial({
        vertexShader: VERTEX_SHADER,
        fragmentShader: BLACKHOLE_FRAG,
        uniforms: this.bhUniforms,
        depthWrite: false,
        depthTest: false
      });
      this.bhScene = new THREE.Scene();
      this.bhScene.add(new THREE.Mesh(this.quadGeo, this.bhMaterial));

      // Pass 2: Separable HDR + IMAX Anamorphic Bloom Material
      this.bloomUniforms = {
        uInputTex: { value: null },
        uTexelSize: { value: new THREE.Vector2(1 / 640, 1 / 360) },
        uDirection: { value: new THREE.Vector2(1, 0) },
        uAnamorphicFlare: { value: this.params.anamorphicFlare },
        uPassIndex: { value: 0 }
      };

      this.bloomMaterial = new THREE.ShaderMaterial({
        vertexShader: VERTEX_SHADER,
        fragmentShader: BLOOM_FRAG,
        uniforms: this.bloomUniforms,
        depthWrite: false,
        depthTest: false
      });
      this.bloomScene = new THREE.Scene();
      this.bloomScene.add(new THREE.Mesh(this.quadGeo, this.bloomMaterial));

      // Pass 3: ACES Filmic Composite Material
      this.compositeUniforms = {
        uSceneTex: { value: null },
        uBloomTex: { value: null },
        uBloomStrength: { value: this.params.bloomStrength },
        uExposure: { value: this.params.exposure },
        uChromaticAberration: { value: this.params.chromaticAberration },
        uResolution: { value: new THREE.Vector2(1280, 720) }
      };

      this.compositeMaterial = new THREE.ShaderMaterial({
        vertexShader: VERTEX_SHADER,
        fragmentShader: COMPOSITE_FRAG,
        uniforms: this.compositeUniforms,
        depthWrite: false,
        depthTest: false
      });
      this.compositeScene = new THREE.Scene();
      this.compositeScene.add(new THREE.Mesh(this.quadGeo, this.compositeMaterial));

      this.rtScene = this._createRenderTarget(640, 360);
      this.rtBloomA = this._createRenderTarget(320, 180);
      this.rtBloomB = this._createRenderTarget(320, 180);
    }

    _initControls() {
      const el = this.canvas;

      el.addEventListener('contextmenu', (e) => e.preventDefault());

      el.addEventListener('pointerdown', (e) => {
        this.isDragging = true;
        this.dragMode = (e.button === 2 || e.shiftKey) ? 'roll' : 'orbit';
        this.lastMouse.x = e.clientX;
        this.lastMouse.y = e.clientY;
        this.lastInteractionTime = performance.now() * 0.001;
        el.setPointerCapture(e.pointerId);
      });

      el.addEventListener('pointermove', (e) => {
        if (!this.isDragging) return;
        const dx = e.clientX - this.lastMouse.x;
        const dy = e.clientY - this.lastMouse.y;
        this.lastMouse.x = e.clientX;
        this.lastMouse.y = e.clientY;
        this.lastInteractionTime = performance.now() * 0.001;

        if (this.dragMode === 'roll' || e.shiftKey) {
          this.targetCam.roll = Math.max(-90, Math.min(90, this.targetCam.roll + dx * 0.25));
          this.params.camRoll = this.targetCam.roll;
        } else {
          this.targetCam.azimuth -= dx * 0.28;
          if (this.targetCam.azimuth > 180) this.targetCam.azimuth -= 360;
          if (this.targetCam.azimuth < -180) this.targetCam.azimuth += 360;
          this.targetCam.elevation = Math.max(-86, Math.min(86, this.targetCam.elevation + dy * 0.24));
          this.params.camAzimuth = this.targetCam.azimuth;
          this.params.camElevation = this.targetCam.elevation;
        }
        this.onCameraChange(this.params);
      });

      const stopDrag = (e) => {
        if (!this.isDragging) return;
        this.isDragging = false;
        try {
          el.releasePointerCapture(e.pointerId);
        } catch (_) {}
      };
      el.addEventListener('pointerup', stopDrag);
      el.addEventListener('pointercancel', stopDrag);

      // Smooth logarithmic mouse wheel zoom
      el.addEventListener('wheel', (e) => {
        e.preventDefault();
        this.lastInteractionTime = performance.now() * 0.001;
        const zoomFactor = Math.exp(e.deltaY * 0.0011);
        this.targetCam.distance = Math.max(3.4, Math.min(42.0, this.targetCam.distance * zoomFactor));
        this.params.camDistance = this.targetCam.distance;
        this.onCameraChange(this.params);
      }, { passive: false });

      // Double click to smoothly re-center Gargantua iconic angle
      el.addEventListener('dblclick', () => {
        this.setCameraTarget({
          distance: 13.8,
          elevation: 7.2,
          azimuth: -18.0,
          roll: -8.5
        });
      });

      window.addEventListener('resize', () => this.resize());
    }

    setCameraTarget(camPartial) {
      if (camPartial.distance !== undefined) {
        this.targetCam.distance = camPartial.distance;
        this.params.camDistance = camPartial.distance;
      }
      if (camPartial.elevation !== undefined) {
        this.targetCam.elevation = camPartial.elevation;
        this.params.camElevation = camPartial.elevation;
      }
      if (camPartial.azimuth !== undefined) {
        this.targetCam.azimuth = camPartial.azimuth;
        this.params.camAzimuth = camPartial.azimuth;
      }
      if (camPartial.roll !== undefined) {
        this.targetCam.roll = camPartial.roll;
        this.params.camRoll = camPartial.roll;
      }
      if (camPartial.fov !== undefined) {
        this.targetCam.fov = camPartial.fov;
        this.params.camFov = camPartial.fov;
      }
      this.onCameraChange(this.params);
    }

    updateParams(newParams, syncCameraTarget) {
      Object.assign(this.params, newParams);
      if (syncCameraTarget) {
        this.targetCam.distance = this.params.camDistance;
        this.targetCam.elevation = this.params.camElevation;
        this.targetCam.azimuth = this.params.camAzimuth;
        this.targetCam.roll = this.params.camRoll;
        this.targetCam.fov = this.params.camFov;
      }
      this.resize();
    }

    resize() {
      const dpr = Math.min(window.devicePixelRatio || 1, 2.0);
      const displayW = Math.max(1, this.canvas.clientWidth || window.innerWidth);
      const displayH = Math.max(1, this.canvas.clientHeight || window.innerHeight);

      this.renderer.setSize(displayW, displayH, false);

      const scale = Math.max(0.45, Math.min(1.5, this.params.renderScale || 1.0));
      const internalW = Math.max(320, Math.round(displayW * dpr * scale));
      const internalH = Math.max(180, Math.round(displayH * dpr * scale));

      if (this.rtScene.width !== internalW || this.rtScene.height !== internalH) {
        this.rtScene.setSize(internalW, internalH);
        const bloomW = Math.max(160, Math.round(internalW * 0.5));
        const bloomH = Math.max(90, Math.round(internalH * 0.5));
        this.rtBloomA.setSize(bloomW, bloomH);
        this.rtBloomB.setSize(bloomW, bloomH);
        this.bloomUniforms.uTexelSize.value.set(1.0 / bloomW, 1.0 / bloomH);
      }

      this.bhUniforms.uResolution.value.set(internalW, internalH);
      this.compositeUniforms.uResolution.value.set(displayW, displayH);
    }

    _updateCameraAndUniforms(dt, nowSec) {
      // Auto-orbit when not dragging
      if (this.params.autoRotate && !this.isDragging && (nowSec - this.lastInteractionTime > 1.2)) {
        this.targetCam.azimuth += dt * 12.0 * this.params.autoRotateSpeed;
        if (this.targetCam.azimuth > 180) this.targetCam.azimuth -= 360;
        this.params.camAzimuth = this.targetCam.azimuth;
      }

      // Exponential smoothing for buttery camera motion
      const damp = 1.0 - Math.exp(-10.5 * dt);
      this.currentCam.distance += (this.targetCam.distance - this.currentCam.distance) * damp;
      this.currentCam.elevation += (this.targetCam.elevation - this.currentCam.elevation) * damp;

      // Shortest angular path for azimuth damping
      let dAz = this.targetCam.azimuth - this.currentCam.azimuth;
      if (dAz > 180) dAz -= 360;
      if (dAz < -180) dAz += 360;
      this.currentCam.azimuth += dAz * damp;

      this.currentCam.roll += (this.targetCam.roll - this.currentCam.roll) * damp;
      this.currentCam.fov += (this.targetCam.fov - this.currentCam.fov) * damp;

      // Spherical coordinates -> Cartesian camera position & orthonormal basis with roll
      const elevRad = (this.currentCam.elevation * Math.PI) / 180.0;
      const azimRad = (this.currentCam.azimuth * Math.PI) / 180.0;
      const rollRad = (this.currentCam.roll * Math.PI) / 180.0;

      const r = this.currentCam.distance;
      const cosEl = Math.cos(elevRad);
      const posX = r * cosEl * Math.sin(azimRad);
      const posY = r * Math.sin(elevRad);
      const posZ = r * cosEl * Math.cos(azimRad);

      const camPos = this.bhUniforms.uCamPos.value;
      camPos.set(posX, posY, posZ);

      const forward = this.bhUniforms.uCamForward.value;
      forward.set(-posX, -posY, -posZ).normalize();

      const worldUp = new THREE.Vector3(0, 1, 0);
      const right0 = new THREE.Vector3().crossVectors(forward, worldUp).normalize();
      const up0 = new THREE.Vector3().crossVectors(right0, forward).normalize();

      // Apply cinematic Dutch tilt / camera roll around forward axis
      const cosR = Math.cos(rollRad);
      const sinR = Math.sin(rollRad);

      this.bhUniforms.uCamRight.value
        .copy(right0)
        .multiplyScalar(cosR)
        .addScaledVector(up0, sinR)
        .normalize();

      this.bhUniforms.uCamUp.value
        .copy(up0)
        .multiplyScalar(cosR)
        .addScaledVector(right0, -sinR)
        .normalize();

      this.bhUniforms.uTanHalfFov.value = Math.tan((this.currentCam.fov * 0.5 * Math.PI) / 180.0);

      // Update astrophysical & shader uniforms
      const astro = computeAstrophysics(this.params);
      const rs = this.params.horizonRadius;

      this.elapsedSimTime += dt;
      this.bhUniforms.uTime.value = this.elapsedSimTime;

      this.bhUniforms.uHorizonRadius.value = rs;
      this.bhUniforms.uSpin.value = this.params.spin;
      this.bhUniforms.uLensingStrength.value = this.params.lensingStrength;
      this.bhUniforms.uPhotonRingIntensity.value = this.params.photonRingIntensity;
      this.bhUniforms.uShadowAsymmetry.value = this.params.shadowAsymmetry;
      this.bhUniforms.uIscoRadius.value = astro.rIscoRs;
      this.bhUniforms.uPhotonSphereRadius.value = astro.rPhRs;

      this.bhUniforms.uDiskEnabled.value = this.params.diskEnabled ? 1.0 : 0.0;
      this.bhUniforms.uDiskInnerRadius.value = astro.effectiveInnerRs * rs;
      this.bhUniforms.uDiskOuterRadius.value = Math.max(astro.effectiveInnerRs * rs + 1.5, this.params.diskOuterRadius * rs);
      this.bhUniforms.uDiskThickness.value = this.params.diskThickness;
      this.bhUniforms.uDiskDensity.value = this.params.diskDensity;
      this.bhUniforms.uDiskSpeed.value = this.params.diskRotationSpeed;
      this.bhUniforms.uDopplerBeaming.value = this.params.dopplerBeaming;
      this.bhUniforms.uDiskTemp.value = this.params.diskTemperature;
      this.bhUniforms.uColorMode.value = Number(this.params.colorMode);
      this.bhUniforms.uDiskTurbulence.value = this.params.diskTurbulence;
      this.bhUniforms.uJetIntensity.value = this.params.jetIntensity;

      this.bhUniforms.uStarDensity.value = this.params.starDensity;
      this.bhUniforms.uNebulaIntensity.value = this.params.nebulaIntensity;
      this.bhUniforms.uEinsteinRingBoost.value = this.params.einsteinRingBoost;
      this.bhUniforms.uSpacetimeGrid.value = this.params.spacetimeGrid ? 1.0 : 0.0;
      this.bhUniforms.uMaxSteps.value = Math.round(this.params.raySteps);

      this.bloomUniforms.uAnamorphicFlare.value = this.params.anamorphicFlare;
      this.compositeUniforms.uBloomStrength.value = this.params.bloomStrength;
      this.compositeUniforms.uExposure.value = this.params.exposure;
      this.compositeUniforms.uChromaticAberration.value = this.params.chromaticAberration;
    }

    renderFrame(nowMs) {
      const prevFrameMs = this.lastFrameTime;
      const dt = Math.min(0.05, Math.max(0.001, (nowMs - prevFrameMs) * 0.001));
      this.lastFrameTime = nowMs;

      this._updateCameraAndUniforms(dt, nowMs * 0.001);

      // 1. Render Geodesic Raymarching HDR Scene
      this.renderer.setRenderTarget(this.rtScene);
      this.renderer.render(this.bhScene, this.orthoCamera);

      // 2. Render Multi-Pass Separable Gaussian + IMAX Anamorphic Bloom (2 full H+V iterations)
      // Iteration 1: Horizontal (Bright extract + Anamorphic streak)
      this.bloomUniforms.uPassIndex.value = 0;
      this.bloomUniforms.uInputTex.value = this.rtScene.texture;
      this.bloomUniforms.uDirection.value.set(1.0, 0.0);
      this.renderer.setRenderTarget(this.rtBloomA);
      this.renderer.render(this.bloomScene, this.orthoCamera);

      // Iteration 1: Vertical
      this.bloomUniforms.uPassIndex.value = 1;
      this.bloomUniforms.uInputTex.value = this.rtBloomA.texture;
      this.bloomUniforms.uDirection.value.set(0.0, 1.0);
      this.renderer.setRenderTarget(this.rtBloomB);
      this.renderer.render(this.bloomScene, this.orthoCamera);

      // Iteration 2: Wider Horizontal
      this.bloomUniforms.uPassIndex.value = 2;
      this.bloomUniforms.uInputTex.value = this.rtBloomB.texture;
      this.bloomUniforms.uDirection.value.set(1.65, 0.0);
      this.renderer.setRenderTarget(this.rtBloomA);
      this.renderer.render(this.bloomScene, this.orthoCamera);

      // Iteration 2: Wider Vertical
      this.bloomUniforms.uPassIndex.value = 3;
      this.bloomUniforms.uInputTex.value = this.rtBloomA.texture;
      this.bloomUniforms.uDirection.value.set(0.0, 1.65);
      this.renderer.setRenderTarget(this.rtBloomB);
      this.renderer.render(this.bloomScene, this.orthoCamera);

      // 3. Final ACES Filmic Composite to Screen
      this.compositeUniforms.uSceneTex.value = this.rtScene.texture;
      this.compositeUniforms.uBloomTex.value = this.rtBloomB.texture;
      this.renderer.setRenderTarget(null);
      this.renderer.render(this.compositeScene, this.orthoCamera);

      // Telemetry FPS sampling (robust against tab backgrounding or headless virtual-time jumps)
      const rawDtMs = Math.max(1.0, Math.min(100.0, nowMs - prevFrameMs));
      this.smoothedFrameMs = this.smoothedFrameMs
        ? this.smoothedFrameMs * 0.88 + rawDtMs * 0.12
        : 16.6;
      this.fpsFrames++;
      if (nowMs - this.fpsLastSample >= 350) {
        this.currentFps = Math.max(1, Math.min(240, Math.round(1000 / this.smoothedFrameMs)));
        this.currentFrameMs = this.smoothedFrameMs;
        this.fpsFrames = 0;
        this.fpsLastSample = nowMs;
        this.onStatsUpdate({
          fps: this.currentFps,
          frameMs: this.currentFrameMs,
          width: this.rtScene.width,
          height: this.rtScene.height
        });
      }
    }

    start() {
      const loop = (now) => {
        this.renderFrame(now);
        this.rafId = requestAnimationFrame(loop);
      };
      this.rafId = requestAnimationFrame(loop);
    }

    captureScreenshot() {
      this.renderFrame(performance.now());
      const dataUrl = this.canvas.toDataURL('image/png');
      const link = document.createElement('a');
      link.download = `gargantua-blackhole-${Date.now()}.png`;
      link.href = dataUrl;
      link.click();
    }
  }

  global.GargantuaRenderer = GargantuaRenderer;
})(window);

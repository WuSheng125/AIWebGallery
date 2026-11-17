import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';
import { vertexShader, fragmentShader } from './shaders/blackholeShader.js';

export const PRESETS = {
  gargantua: {
    label: '卡冈图雅',
    mass: 1.0,
    spin: 0.85,
    lensing: 1.0,
    photonRing: 1.1,
    diskOuter: 6.8,
    diskThickness: 0.14,
    diskSpeed: 1.0,
    doppler: 0.72,
    turbulence: 1.0,
    temperature: 1.0,
    starDensity: 1.0,
    nebula: 0.65,
    bloom: 0.42,
    exposure: 1.0,
    cameraPos: [0, 3.2, 26.5],
    cameraTarget: [0, 0, 0],
  },
  'interstellar-high': {
    label: '高空俯瞰',
    mass: 1.0,
    spin: 0.78,
    lensing: 1.08,
    photonRing: 1.35,
    diskOuter: 7.4,
    diskThickness: 0.13,
    diskSpeed: 1.15,
    doppler: 0.6,
    turbulence: 1.15,
    temperature: 1.05,
    starDensity: 1.15,
    nebula: 0.75,
    bloom: 0.48,
    exposure: 1.04,
    cameraPos: [-6.5, 11.2, 23.0],
    cameraTarget: [0, 0, 0],
  },
  'extreme-kerr': {
    label: '极端自旋',
    mass: 1.05,
    spin: 0.99,
    lensing: 1.18,
    photonRing: 1.45,
    diskOuter: 7.0,
    diskThickness: 0.12,
    diskSpeed: 1.75,
    doppler: 1.18,
    turbulence: 1.25,
    temperature: 1.15,
    starDensity: 1.0,
    nebula: 0.55,
    bloom: 0.5,
    exposure: 0.98,
    cameraPos: [2.2, 2.4, 24.5],
    cameraTarget: [0, 0, 0],
  },
  'cold-quasar': {
    label: '幽蓝类星体',
    mass: 1.12,
    spin: 0.92,
    lensing: 1.05,
    photonRing: 1.35,
    diskOuter: 8.0,
    diskThickness: 0.16,
    diskSpeed: 1.35,
    doppler: 0.85,
    turbulence: 1.35,
    temperature: 1.55,
    starDensity: 1.3,
    nebula: 0.85,
    bloom: 0.55,
    exposure: 0.96,
    cameraPos: [-2.5, 4.8, 25.5],
    cameraTarget: [0, 0, 0],
  },
};

export const QUALITY_LEVELS = {
  low: { scale: 0.65, maxSteps: 130 },
  medium: { scale: 0.85, maxSteps: 175 },
  high: { scale: 1.0, maxSteps: 230 },
};

export class BlackHoleApp {
  constructor(canvas, callbacks = {}) {
    this.canvas = canvas;
    this.callbacks = callbacks;

    this.state = {
      ...PRESETS.gargantua,
      quality: 'medium',
      autoOrbit: false,
      paused: false,
    };

    this.simTime = 0;
    this.lastFrameTime = performance.now();
    this.fpsAccum = 0;
    this.fpsFrames = 0;
    this.rafId = null;
    this.disposed = false;

    this.initRenderer();
    this.initScene();
    this.initCameraAndControls();
    this.initPostProcessing();
    this.bindEvents();
    this.resize();
  }

  initRenderer() {
    this.renderer = new THREE.WebGLRenderer({
      canvas: this.canvas,
      antialias: false,
      powerPreference: 'high-performance',
      preserveDrawingBuffer: true,
    });
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = this.state.exposure;
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
  }

  initScene() {
    this.scene = new THREE.Scene();
    this.orthoCamera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);

    this.uniforms = {
      uResolution: { value: new THREE.Vector2(1, 1) },
      uTime: { value: 0 },
      uCamPos: { value: new THREE.Vector3(...this.state.cameraPos) },
      uCamTarget: { value: new THREE.Vector3(...this.state.cameraTarget) },
      uFov: { value: 46.0 },
      uMass: { value: this.state.mass },
      uSpin: { value: this.state.spin },
      uLensing: { value: this.state.lensing },
      uPhotonRing: { value: this.state.photonRing },
      uDiskOuter: { value: this.state.diskOuter },
      uDiskThickness: { value: this.state.diskThickness },
      uDiskSpeed: { value: this.state.diskSpeed },
      uDoppler: { value: this.state.doppler },
      uTurbulence: { value: this.state.turbulence },
      uTemperature: { value: this.state.temperature },
      uStarDensity: { value: this.state.starDensity },
      uNebula: { value: this.state.nebula },
      uMaxSteps: { value: QUALITY_LEVELS[this.state.quality].maxSteps },
    };

    const quadGeo = new THREE.PlaneGeometry(2, 2);
    const quadMat = new THREE.ShaderMaterial({
      vertexShader,
      fragmentShader,
      uniforms: this.uniforms,
      depthWrite: false,
      depthTest: false,
    });

    this.quadMesh = new THREE.Mesh(quadGeo, quadMat);
    this.scene.add(this.quadMesh);
  }

  initCameraAndControls() {
    this.viewCamera = new THREE.PerspectiveCamera(46, 1, 0.1, 1000);
    this.viewCamera.position.set(...this.state.cameraPos);

    this.controls = new OrbitControls(this.viewCamera, this.canvas);
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.065;
    this.controls.rotateSpeed = 0.72;
    this.controls.zoomSpeed = 0.85;
    this.controls.panSpeed = 0.6;
    this.controls.minDistance = 6.5;
    this.controls.maxDistance = 68.0;
    this.controls.autoRotate = this.state.autoOrbit;
    this.controls.autoRotateSpeed = 0.55;
    this.controls.target.set(...this.state.cameraTarget);
    this.controls.update();
  }

  initPostProcessing() {
    const rt = new THREE.WebGLRenderTarget(2, 2, {
      type: THREE.HalfFloatType,
      samples: 0,
    });
    this.composer = new EffectComposer(this.renderer, rt);
    this.renderPass = new RenderPass(this.scene, this.orthoCamera);
    this.bloomPass = new UnrealBloomPass(
      new THREE.Vector2(2, 2),
      this.state.bloom,
      0.45,
      0.92
    );
    this.outputPass = new OutputPass();

    this.composer.addPass(this.renderPass);
    this.composer.addPass(this.bloomPass);
    this.composer.addPass(this.outputPass);
  }

  bindEvents() {
    this.onResize = () => this.resize();
    this.onDblClick = () => this.resetCamera();
    window.addEventListener('resize', this.onResize);
    this.canvas.addEventListener('dblclick', this.onDblClick);
  }

  resize() {
    const width = Math.max(this.canvas.clientWidth || window.innerWidth, 1);
    const height = Math.max(this.canvas.clientHeight || window.innerHeight, 1);
    const quality = QUALITY_LEVELS[this.state.quality] || QUALITY_LEVELS.medium;
    const dpr = Math.min(window.devicePixelRatio || 1, 2) * quality.scale;

    this.renderer.setPixelRatio(dpr);
    this.renderer.setSize(width, height, false);

    const drawWidth = Math.max(Math.floor(width * dpr), 1);
    const drawHeight = Math.max(Math.floor(height * dpr), 1);

    this.uniforms.uResolution.value.set(drawWidth, drawHeight);
    this.viewCamera.aspect = width / height;
    this.viewCamera.updateProjectionMatrix();

    this.composer.setPixelRatio(dpr);
    this.composer.setSize(width, height);
    this.bloomPass.setSize(drawWidth, drawHeight);
  }

  setParam(key, value) {
    this.state[key] = value;

    const uniformMap = {
      mass: 'uMass',
      spin: 'uSpin',
      lensing: 'uLensing',
      photonRing: 'uPhotonRing',
      diskOuter: 'uDiskOuter',
      diskThickness: 'uDiskThickness',
      diskSpeed: 'uDiskSpeed',
      doppler: 'uDoppler',
      turbulence: 'uTurbulence',
      temperature: 'uTemperature',
      starDensity: 'uStarDensity',
      nebula: 'uNebula',
    };

    if (uniformMap[key]) {
      this.uniforms[uniformMap[key]].value = value;
    } else if (key === 'bloom') {
      this.bloomPass.strength = value;
    } else if (key === 'exposure') {
      this.renderer.toneMappingExposure = value;
    } else if (key === 'autoOrbit') {
      this.controls.autoRotate = Boolean(value);
    } else if (key === 'quality') {
      const cfg = QUALITY_LEVELS[value] || QUALITY_LEVELS.medium;
      this.uniforms.uMaxSteps.value = cfg.maxSteps;
      this.resize();
    }
  }

  applyPreset(presetKey) {
    const preset = PRESETS[presetKey];
    if (!preset) return;

    const paramKeys = [
      'mass',
      'spin',
      'lensing',
      'photonRing',
      'diskOuter',
      'diskThickness',
      'diskSpeed',
      'doppler',
      'turbulence',
      'temperature',
      'starDensity',
      'nebula',
      'bloom',
      'exposure',
    ];

    for (const key of paramKeys) {
      this.setParam(key, preset[key]);
    }

    if (preset.cameraPos) {
      this.viewCamera.position.set(...preset.cameraPos);
      this.controls.target.set(...(preset.cameraTarget || [0, 0, 0]));
      this.controls.update();
    }
  }

  resetCamera() {
    this.viewCamera.position.set(...PRESETS.gargantua.cameraPos);
    this.controls.target.set(...PRESETS.gargantua.cameraTarget);
    this.controls.update();
  }

  togglePause() {
    this.state.paused = !this.state.paused;
    return this.state.paused;
  }

  captureScreenshot() {
    this.renderOnce(0);
    const dataUrl = this.canvas.toDataURL('image/png');
    const link = document.createElement('a');
    link.download = `gargantua-blackhole-${Date.now()}.png`;
    link.href = dataUrl;
    link.click();
  }

  renderOnce(dt = 0) {
    if (!this.state.paused) {
      this.simTime += dt;
    }
    this.uniforms.uTime.value = this.simTime;

    this.controls.update();
    this.uniforms.uCamPos.value.copy(this.viewCamera.position);
    this.uniforms.uCamTarget.value.copy(this.controls.target);

    this.composer.render();
  }

  start() {
    this.lastFrameTime = performance.now();
    const tick = (now) => {
      if (this.disposed) return;
      const dt = Math.min((now - this.lastFrameTime) * 0.001, 0.1);
      this.lastFrameTime = now;

      this.renderOnce(dt);

      // 遥测数据节流更新
      this.fpsAccum += dt;
      this.fpsFrames += 1;
      if (this.fpsAccum >= 0.25 && this.callbacks.onTelemetry) {
        const fps = Math.round(this.fpsFrames / this.fpsAccum);
        const offset = this.viewCamera.position.clone().sub(this.controls.target);
        const dist = offset.length();
        const rs = 1.65 * this.state.mass;
        const inclRad = Math.asin(THREE.MathUtils.clamp(offset.y / Math.max(dist, 0.001), -1, 1));
        const inclDeg = THREE.MathUtils.radToDeg(inclRad);

        this.callbacks.onTelemetry({
          fps,
          inclinationDeg: inclDeg,
          distanceRs: dist / rs,
        });

        this.fpsAccum = 0;
        this.fpsFrames = 0;
      }

      this.rafId = requestAnimationFrame(tick);
    };

    this.rafId = requestAnimationFrame(tick);
  }

  dispose() {
    this.disposed = true;
    if (this.rafId !== null) cancelAnimationFrame(this.rafId);
    window.removeEventListener('resize', this.onResize);
    this.canvas.removeEventListener('dblclick', this.onDblClick);
    this.controls.dispose();
    this.composer.dispose();
    this.renderer.dispose();
  }
}

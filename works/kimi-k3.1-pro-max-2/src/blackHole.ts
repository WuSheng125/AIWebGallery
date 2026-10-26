import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import fragmentShader from './shaders/blackhole.frag?raw';
import vertexShader from './shaders/fullscreen.vert?raw';
import { DEFAULT_PARAMETERS, type BlackHoleParameters, type QualityMode, type ViewPreset } from './parameters';

function createNoiseTexture() {
  const size = 256;
  const data = new Uint8Array(size * size * 4);
  let seed = 0x6d2b79f5;
  for (let index = 0; index < size * size; index += 1) {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    const value = seed >>> 24;
    data[index * 4] = value;
    data[index * 4 + 1] = value;
    data[index * 4 + 2] = value;
    data[index * 4 + 3] = 255;
  }
  const texture = new THREE.DataTexture(data, size, size, THREE.RGBAFormat);
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.magFilter = THREE.LinearFilter;
  texture.minFilter = THREE.LinearMipmapLinearFilter;
  texture.generateMipmaps = true;
  texture.needsUpdate = true;
  return texture;
}

interface RendererCallbacks {
  onReady: () => void;
  onViewChange: (distance: number, inclination: number) => void;
  onInteraction: () => void;
  onFps: (fps: number) => void;
}

interface CameraTransition {
  from: THREE.Vector3;
  to: THREE.Vector3;
  startedAt: number;
  duration: number;
}

export class BlackHoleRenderer {
  private readonly renderer: THREE.WebGLRenderer;
  private readonly composer: EffectComposer;
  private readonly bloomPass: UnrealBloomPass;
  private readonly camera = new THREE.PerspectiveCamera(40, 1, 0.1, 100);
  private readonly controls: OrbitControls;
  private readonly viewport: HTMLElement;
  private readonly callbacks: RendererCallbacks;
  private readonly resizeObserver: ResizeObserver;
  private readonly drawingBufferSize = new THREE.Vector2();
  private parameters: BlackHoleParameters = { ...DEFAULT_PARAMETERS };
  private quality: QualityMode = 'auto';
  private autoScale = 0.5;
  private transition: CameraTransition | null = null;
  private animationFrame = 0;
  private lastFrameAt = 0;
  private elapsed = 0;
  private paused = false;
  private ready = false;
  private fpsStartedAt = 0;
  private fpsFrames = 0;
  private lastQualityAdjustment = 0;

  private readonly uniforms: Record<string, THREE.IUniform> = {
    uResolution: { value: new THREE.Vector2(1, 1) },
    uTime: { value: 0 },
    uCameraPos: { value: new THREE.Vector3() },
    uCameraRight: { value: new THREE.Vector3() },
    uCameraUp: { value: new THREE.Vector3() },
    uCameraForward: { value: new THREE.Vector3() },
    uFov: { value: 40 },
    uLensStrength: { value: DEFAULT_PARAMETERS.lensStrength },
    uInnerRadius: { value: DEFAULT_PARAMETERS.innerRadius },
    uOuterRadius: { value: DEFAULT_PARAMETERS.outerRadius },
    uDiskBrightness: { value: DEFAULT_PARAMETERS.diskBrightness },
    uTemperature: { value: DEFAULT_PARAMETERS.temperature },
    uTurbulence: { value: DEFAULT_PARAMETERS.turbulence },
    uRotationSpeed: { value: DEFAULT_PARAMETERS.rotationSpeed },
    uStarDensity: { value: DEFAULT_PARAMETERS.starDensity },
    uDoppler: { value: 1 },
    uNoise: { value: createNoiseTexture() },
  };

  constructor(canvas: HTMLCanvasElement, viewport: HTMLElement, callbacks: RendererCallbacks) {
    this.viewport = viewport;
    this.callbacks = callbacks;
    this.renderer = new THREE.WebGLRenderer({
      canvas,
      antialias: false,
      alpha: false,
      powerPreference: 'high-performance',
      preserveDrawingBuffer: false,
    });
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = this.parameters.exposure;
    this.renderer.setClearColor(0x020305, 1);

    const scene = new THREE.Scene();
    const screenCamera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
    const material = new THREE.ShaderMaterial({
      uniforms: this.uniforms,
      vertexShader,
      fragmentShader,
      depthTest: false,
      depthWrite: false,
      toneMapped: false,
    });
    const quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), material);
    quad.frustumCulled = false;
    scene.add(quad);

    const target = new THREE.WebGLRenderTarget(1, 1, {
      type: THREE.HalfFloatType,
      minFilter: THREE.LinearFilter,
      magFilter: THREE.LinearFilter,
      depthBuffer: false,
      stencilBuffer: false,
    });
    this.composer = new EffectComposer(this.renderer, target);
    this.composer.addPass(new RenderPass(scene, screenCamera));
    this.bloomPass = new UnrealBloomPass(new THREE.Vector2(1, 1), this.parameters.bloomStrength, 0.72, 0.82);
    this.composer.addPass(this.bloomPass);
    this.composer.addPass(new OutputPass());

    this.camera.position.set(0, Math.sin(THREE.MathUtils.degToRad(3.5)) * 22.5, -Math.cos(THREE.MathUtils.degToRad(3.5)) * 22.5);
    this.camera.lookAt(0, 0, 0);
    this.controls = new OrbitControls(this.camera, canvas);
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.055;
    this.controls.enablePan = false;
    this.controls.rotateSpeed = 0.42;
    this.controls.zoomSpeed = 0.65;
    this.controls.minDistance = 10.5;
    this.controls.maxDistance = 32;
    this.controls.minPolarAngle = 0.035;
    this.controls.maxPolarAngle = Math.PI - 0.035;
    this.controls.autoRotateSpeed = 0.24;
    this.controls.addEventListener('start', () => {
      this.transition = null;
      this.callbacks.onInteraction();
    });

    this.resizeObserver = new ResizeObserver(() => this.resize());
    this.resizeObserver.observe(this.viewport);
    this.resize();
    this.setParameters(this.parameters);
  }

  start() {
    this.animationFrame = requestAnimationFrame(this.animate);
  }

  setParameters(parameters: BlackHoleParameters) {
    this.parameters = { ...parameters };
    this.uniforms.uLensStrength.value = parameters.lensStrength;
    this.uniforms.uInnerRadius.value = parameters.innerRadius;
    this.uniforms.uOuterRadius.value = parameters.outerRadius;
    this.uniforms.uDiskBrightness.value = parameters.diskBrightness;
    this.uniforms.uTemperature.value = parameters.temperature;
    this.uniforms.uTurbulence.value = parameters.turbulence;
    this.uniforms.uRotationSpeed.value = parameters.rotationSpeed;
    this.uniforms.uStarDensity.value = parameters.starDensity;
    this.uniforms.uDoppler.value = parameters.doppler ? 1 : 0;
    this.renderer.toneMappingExposure = parameters.exposure;
    this.bloomPass.strength = parameters.bloomStrength * 0.32;
    this.bloomPass.radius = 0.12;
    this.bloomPass.threshold = 1.25;
    this.bloomPass.enabled = parameters.bloomEnabled && parameters.bloomStrength > 0;
    this.controls.autoRotate = parameters.autoRotate;
  }

  setQuality(quality: QualityMode) {
    this.quality = quality;
    this.autoScale = quality === 'auto' ? 0.5 : 1;
    this.resize();
  }

  setPaused(paused: boolean) {
    this.paused = paused;
  }

  setInclination(inclination: number) {
    this.transition = null;
    const spherical = new THREE.Spherical().setFromVector3(this.camera.position);
    spherical.phi = THREE.MathUtils.clamp(THREE.MathUtils.degToRad(90 - inclination), 0.035, Math.PI - 0.035);
    this.camera.position.setFromSpherical(spherical);
    this.camera.lookAt(0, 0, 0);
    this.controls.update();
  }

  flyTo(preset: ViewPreset) {
    const inclination = THREE.MathUtils.degToRad(preset.inclination);
    const horizontal = Math.cos(inclination) * preset.distance;
    const destination = new THREE.Vector3(
      Math.sin(preset.azimuth) * horizontal,
      Math.sin(inclination) * preset.distance,
      -Math.cos(preset.azimuth) * horizontal,
    );
    this.transition = {
      from: this.camera.position.clone(),
      to: destination,
      startedAt: performance.now(),
      duration: 1250,
    };
  }

  capture() {
    this.composer.render();
    return this.renderer.domElement.toDataURL('image/png');
  }

  private readonly animate = (now: number) => {
    this.animationFrame = requestAnimationFrame(this.animate);
    const delta = this.lastFrameAt === 0 ? 0 : Math.min((now - this.lastFrameAt) / 1000, 0.06);
    this.lastFrameAt = now;
    if (!this.paused) this.elapsed += delta;
    this.uniforms.uTime.value = this.elapsed;
    this.controls.autoRotate = this.parameters.autoRotate && !this.paused;

    if (this.transition) {
      const progress = Math.min((now - this.transition.startedAt) / this.transition.duration, 1);
      const eased = progress < 0.5 ? 4 * progress * progress * progress : 1 - Math.pow(-2 * progress + 2, 3) / 2;
      this.camera.position.lerpVectors(this.transition.from, this.transition.to, eased);
      this.camera.lookAt(0, 0, 0);
      if (progress === 1) this.transition = null;
    }

    this.controls.update();
    this.camera.updateMatrixWorld();
    const matrix = this.camera.matrixWorld.elements;
    this.uniforms.uCameraPos.value.copy(this.camera.position);
    this.uniforms.uCameraRight.value.set(matrix[0], matrix[1], matrix[2]);
    this.uniforms.uCameraUp.value.set(matrix[4], matrix[5], matrix[6]);
    this.uniforms.uCameraForward.value.set(-matrix[8], -matrix[9], -matrix[10]);
    this.composer.render();

    const distance = this.camera.position.length();
    const spherical = new THREE.Spherical().setFromVector3(this.camera.position);
    this.callbacks.onViewChange(distance, 90 - THREE.MathUtils.radToDeg(spherical.phi));

    if (!this.ready) {
      this.ready = true;
      this.callbacks.onReady();
    }
    this.measurePerformance(now);
  };

  private measurePerformance(now: number) {
    if (this.fpsStartedAt === 0) this.fpsStartedAt = now;
    this.fpsFrames += 1;
    const sampleDuration = now - this.fpsStartedAt;
    if (sampleDuration < 700) return;
    const fps = Math.round((this.fpsFrames * 1000) / sampleDuration);
    this.callbacks.onFps(fps);
    this.fpsFrames = 0;
    this.fpsStartedAt = now;

    if (this.quality !== 'auto' || now - this.lastQualityAdjustment < 2800 || document.hidden) return;
    this.lastQualityAdjustment = now;
    if (fps < 43 && this.autoScale > 0.5) {
      this.autoScale = Math.max(0.5, this.autoScale - 0.1);
      this.resize();
    } else if (fps > 57 && this.autoScale < 0.9) {
      this.autoScale = Math.min(0.9, this.autoScale + 0.05);
      this.resize();
    }
  }

  private resize() {
    const width = Math.max(this.viewport.clientWidth, 1);
    const height = Math.max(this.viewport.clientHeight, 1);
    const mobile = window.innerWidth < 700;
    const cap = this.quality === 'high' ? 1.7 : mobile ? 1.1 : 1.35;
    const scale = this.quality === 'performance' ? 0.55 : this.autoScale;
    const pixelRatio = Math.min(window.devicePixelRatio || 1, cap) * scale;
    this.renderer.setPixelRatio(pixelRatio);
    this.renderer.setSize(width, height, false);
    this.composer.setPixelRatio(pixelRatio);
    this.composer.setSize(width, height);
    this.renderer.getDrawingBufferSize(this.drawingBufferSize);
    this.uniforms.uResolution.value.copy(this.drawingBufferSize);
    this.camera.aspect = width / height;
    const aspectCompensation = Math.max(1, 1.05 / this.camera.aspect);
    this.camera.fov = Math.min(78, THREE.MathUtils.radToDeg(2 * Math.atan(Math.tan(THREE.MathUtils.degToRad(20)) * aspectCompensation)));
    this.uniforms.uFov.value = this.camera.fov;
    this.camera.updateProjectionMatrix();
  }
}

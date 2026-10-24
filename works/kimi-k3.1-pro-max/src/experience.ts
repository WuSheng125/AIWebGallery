import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import type { BlackHoleParams, RenderQuality, ViewInfo } from './types';
import vertexShader from './shaders/fullscreen.vert?raw';
import fragmentShader from './shaders/blackHole.frag?raw';

interface QualitySettings {
  steps: number;
  stepScale: number;
  pixelRatio: number;
  maxPixels: number;
}

const QUALITY: Record<RenderQuality, QualitySettings> = {
  low: { steps: 88, stepScale: 1.40, pixelRatio: 0.65, maxPixels: 1_150_000 },
  medium: { steps: 144, stepScale: 1, pixelRatio: 1, maxPixels: 2_400_000 },
  high: { steps: 224, stepScale: 0.70, pixelRatio: 1.25, maxPixels: 4_200_000 },
};

const INITIAL_POSITION = new THREE.Vector3(0, 1.32, 13.2);

/** Real-time, ray-marched Schwarzschild black-hole experience. */
export class BlackHoleExperience {
  onFirstFrame: (() => void) | undefined;
  onViewChange: ((info: ViewInfo) => void) | undefined;
  onStatusChange: ((fps: number, renderScale: number) => void) | undefined;

  private readonly container: HTMLElement;
  private readonly renderer: THREE.WebGLRenderer;
  private readonly camera: THREE.PerspectiveCamera;
  private readonly controls: OrbitControls;
  private readonly scene = new THREE.Scene();
  private readonly screenCamera = new THREE.OrthographicCamera();
  private readonly material: THREE.ShaderMaterial;
  private readonly composer: EffectComposer;
  private readonly bloomPass: UnrealBloomPass;
  private readonly gradePass: ShaderPass;
  private readonly resizeObserver: ResizeObserver;
  private readonly drawingBufferSize = new THREE.Vector2();
  private params: BlackHoleParams;
  private animationFrame = 0;
  private previousTime = performance.now();
  private elapsedTime = 0;
  private fpsStart = this.previousTime;
  private fpsFrames = 0;
  private firstFrameSent = false;
  private currentRenderScale = 1;
  private disposed = false;

  constructor(container: HTMLElement, params: BlackHoleParams) {
    this.container = container;
    this.params = { ...params };

    this.renderer = new THREE.WebGLRenderer({
      antialias: false,
      alpha: false,
      depth: false,
      stencil: false,
      powerPreference: 'high-performance',
    });
    if (!this.renderer.extensions.has('EXT_color_buffer_float')) {
      this.renderer.dispose();
      throw new Error('当前显卡或浏览器缺少 EXT_color_buffer_float，无法使用 HDR 渲染。');
    }
    this.renderer.setClearColor(0x000000, 1);
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = params.exposure;
    this.renderer.domElement.id = 'black-hole-canvas';
    this.renderer.domElement.setAttribute('role', 'img');
    this.renderer.domElement.setAttribute(
      'aria-label',
      '可交互的黑洞：拖动旋转视角，滚轮缩放，右键拖动不可用',
    );
    this.renderer.domElement.style.touchAction = 'none';
    container.appendChild(this.renderer.domElement);

    this.camera = new THREE.PerspectiveCamera(42, 1, 0.1, 100);
    this.camera.position.copy(INITIAL_POSITION);
    this.camera.lookAt(0, 0, 0);

    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.target.set(0, 0, 0);
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.065;
    this.controls.enablePan = false;
    this.controls.rotateSpeed = 0.52;
    this.controls.zoomSpeed = 0.72;
    this.controls.minDistance = 5.4;
    this.controls.maxDistance = 23;
    this.controls.minPolarAngle = 0.06;
    this.controls.maxPolarAngle = Math.PI - 0.06;
    this.controls.autoRotateSpeed = 0.34;
    this.controls.update();
    this.controls.saveState();
    this.controls.addEventListener('change', this.emitViewInfo);

    this.material = new THREE.ShaderMaterial({
      name: 'SchwarzschildRaymarcher',
      glslVersion: THREE.GLSL3,
      vertexShader,
      fragmentShader,
      depthTest: false,
      depthWrite: false,
      uniforms: {
        uResolution: { value: new THREE.Vector2(1, 1) },
        uCameraPos: { value: new THREE.Vector3() },
        uCameraRight: { value: new THREE.Vector3() },
        uCameraUp: { value: new THREE.Vector3() },
        uCameraForward: { value: new THREE.Vector3() },
        uTanHalfFov: { value: Math.tan(THREE.MathUtils.degToRad(this.camera.fov * 0.5)) },
        uTime: { value: 0 },
        uMass: { value: params.mass },
        uLensing: { value: params.lensing },
        uDiskInner: { value: params.diskInner },
        uDiskOuter: { value: params.diskOuter },
        uDiskBrightness: { value: params.diskBrightness },
        uDiskTemperature: { value: params.diskTemperature },
        uDiskSpeed: { value: params.diskSpeed },
        uDiskDensity: { value: params.diskDensity },
        uDoppler: { value: params.doppler },
        uStarBrightness: { value: params.starBrightness },
        uDiskVisible: { value: Number(params.diskVisible) },
        uStarsVisible: { value: Number(params.starsVisible) },
        uStepScale: { value: QUALITY[params.quality].stepScale },
        uMaxSteps: { value: QUALITY[params.quality].steps },
      },
    });

    // One oversized triangle avoids the diagonal interpolation seam of a quad.
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute(
      'position',
      new THREE.Float32BufferAttribute([-1, -1, 0, 3, -1, 0, -1, 3, 0], 3),
    );
    geometry.setAttribute('uv', new THREE.Float32BufferAttribute([0, 0, 2, 0, 0, 2], 2));
    const screen = new THREE.Mesh(geometry, this.material);
    screen.frustumCulled = false;
    this.scene.add(screen);

    const renderTarget = new THREE.WebGLRenderTarget(1, 1, {
      type: THREE.HalfFloatType,
      minFilter: THREE.LinearFilter,
      magFilter: THREE.LinearFilter,
      depthBuffer: false,
      stencilBuffer: false,
    });
    this.composer = new EffectComposer(this.renderer, renderTarget);
    this.composer.addPass(new RenderPass(this.scene, this.screenCamera));

    this.bloomPass = new UnrealBloomPass(new THREE.Vector2(1, 1), params.bloom, 0.30, 1.20);
    this.composer.addPass(this.bloomPass);

    // Subtle optical falloff, deliberately applied before display tone mapping.
    this.gradePass = new ShaderPass({
      name: 'OpticalVignette',
      uniforms: { tDiffuse: { value: null } },
      vertexShader: /* glsl */ `
        varying vec2 vUv;
        void main() {
          vUv = uv;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
      `,
      fragmentShader: /* glsl */ `
        uniform sampler2D tDiffuse;
        varying vec2 vUv;
        void main() {
          vec3 colour = texture2D(tDiffuse, vUv).rgb;
          vec2 centred = vUv * 2.0 - 1.0;
          float vignette = 1.0 - 0.16 * smoothstep(0.30, 1.65, dot(centred, centred));
          gl_FragColor = vec4(colour * vignette, 1.0);
        }
      `,
    });
    this.composer.addPass(this.gradePass);
    this.composer.addPass(new OutputPass());

    this.resizeObserver = new ResizeObserver(this.resize);
    this.resizeObserver.observe(container);
    this.renderer.domElement.addEventListener('webglcontextlost', this.onContextLost);
    this.resize();
    this.setParams(params);
    this.updateCameraUniforms();
  }

  start(): void {
    if (this.animationFrame || this.disposed) return;
    this.previousTime = performance.now();
    this.fpsStart = this.previousTime;
    this.animationFrame = requestAnimationFrame(this.animate);
  }

  setParams(params: BlackHoleParams): void {
    const previousQuality = this.params.quality;
    this.params = { ...params };
    const uniforms = this.material.uniforms;
    uniforms.uMass.value = params.mass;
    uniforms.uLensing.value = params.lensing;
    uniforms.uDiskInner.value = params.diskInner;
    uniforms.uDiskOuter.value = params.diskOuter;
    uniforms.uDiskBrightness.value = params.diskBrightness;
    uniforms.uDiskTemperature.value = params.diskTemperature;
    uniforms.uDiskSpeed.value = params.diskSpeed;
    uniforms.uDiskDensity.value = params.diskDensity;
    uniforms.uDoppler.value = params.doppler;
    uniforms.uStarBrightness.value = params.starBrightness;
    uniforms.uDiskVisible.value = Number(params.diskVisible);
    uniforms.uStarsVisible.value = Number(params.starsVisible);
    uniforms.uStepScale.value = QUALITY[params.quality].stepScale;
    uniforms.uMaxSteps.value = QUALITY[params.quality].steps;
    this.bloomPass.strength = params.bloom;
    this.bloomPass.enabled = params.bloom > 0.001;
    this.renderer.toneMappingExposure = params.exposure;
    this.controls.autoRotate = params.autoRotate;
    if (previousQuality !== params.quality) this.resize();
  }

  resetView(): void {
    const damping = this.controls.enableDamping;
    this.controls.enableDamping = false;
    this.controls.reset();
    this.camera.position.copy(INITIAL_POSITION);
    this.controls.target.set(0, 0, 0);
    this.controls.update();
    this.controls.enableDamping = damping;
    this.emitViewInfo();
  }

  getViewInfo(): ViewInfo {
    const offset = this.camera.position.clone().sub(this.controls.target);
    return {
      inclination: Math.atan2(offset.y, Math.hypot(offset.x, offset.z)),
      distance: offset.length(),
    };
  }

  async captureScreenshot(): Promise<Blob> {
    this.composer.render(0);
    const canvas = this.renderer.domElement;
    return new Promise<Blob>((resolve, reject) => {
      canvas.toBlob((blob) => {
        if (blob) resolve(blob);
        else reject(new Error('浏览器无法生成画面截图。'));
      }, 'image/png');
    });
  }

  dispose(): void {
    this.disposed = true;
    cancelAnimationFrame(this.animationFrame);
    this.resizeObserver.disconnect();
    this.controls.removeEventListener('change', this.emitViewInfo);
    this.controls.dispose();
    this.renderer.domElement.removeEventListener('webglcontextlost', this.onContextLost);
    this.scene.traverse((object) => {
      if (object instanceof THREE.Mesh) object.geometry.dispose();
    });
    this.material.dispose();
    this.composer.passes.forEach((pass) => pass.dispose());
    this.composer.dispose();
    this.renderer.dispose();
    this.renderer.domElement.remove();
  }

  private readonly animate = (now: number): void => {
    if (this.disposed) return;
    this.animationFrame = requestAnimationFrame(this.animate);
    const delta = Math.min(Math.max((now - this.previousTime) / 1000, 0), 0.05);
    this.previousTime = now;
    if (document.hidden) return;

    this.elapsedTime += delta;
    this.material.uniforms.uTime.value = this.elapsedTime;
    this.controls.update(delta);
    this.updateCameraUniforms();
    this.composer.render(delta);

    if (!this.firstFrameSent) {
      this.firstFrameSent = true;
      this.onFirstFrame?.();
      this.emitViewInfo();
    }

    this.fpsFrames += 1;
    const fpsElapsed = now - this.fpsStart;
    if (fpsElapsed >= 650) {
      const fps = (this.fpsFrames * 1000) / fpsElapsed;
      this.onStatusChange?.(fps, this.currentRenderScale);
      this.fpsFrames = 0;
      this.fpsStart = now;
    }
  };

  private updateCameraUniforms(): void {
    this.camera.updateMatrixWorld();
    const uniforms = this.material.uniforms;
    (uniforms.uCameraPos.value as THREE.Vector3).copy(this.camera.position);
    (uniforms.uCameraRight.value as THREE.Vector3).setFromMatrixColumn(this.camera.matrixWorld, 0);
    (uniforms.uCameraUp.value as THREE.Vector3).setFromMatrixColumn(this.camera.matrixWorld, 1);
    this.camera.getWorldDirection(uniforms.uCameraForward.value as THREE.Vector3);
  }

  private readonly emitViewInfo = (): void => {
    this.onViewChange?.(this.getViewInfo());
  };

  private readonly resize = (): void => {
    if (this.disposed) return;
    const width = Math.max(1, this.container.clientWidth || window.innerWidth);
    const height = Math.max(1, this.container.clientHeight || window.innerHeight);
    const quality = QUALITY[this.params.quality];
    const deviceRatio = window.devicePixelRatio || 1;
    const deviceRatioCap = width < 760 ? 1.25 : 1.5;
    let ratio = quality.pixelRatio;
    if (this.params.quality !== 'low') ratio *= Math.min(deviceRatio, deviceRatioCap);
    ratio = Math.max(0.25, Math.min(ratio, 1.75));
    const pixels = width * height * ratio * ratio;
    if (pixels > quality.maxPixels) ratio = Math.sqrt(quality.maxPixels / (width * height));
    this.currentRenderScale = ratio;

    this.camera.aspect = width / height;
    const baseTanHalfFov = Math.tan(THREE.MathUtils.degToRad(21));
    const responsiveTan = baseTanHalfFov * Math.max(1, 0.85 / this.camera.aspect);
    this.camera.fov = Math.min(72, THREE.MathUtils.radToDeg(2 * Math.atan(responsiveTan)));
    this.camera.updateProjectionMatrix();
    this.material.uniforms.uTanHalfFov.value = Math.tan(
      THREE.MathUtils.degToRad(this.camera.fov * 0.5),
    );
    this.renderer.setPixelRatio(ratio);
    this.renderer.setSize(width, height, false);
    this.composer.setPixelRatio(ratio);
    this.composer.setSize(width, height);
    this.renderer.getDrawingBufferSize(this.drawingBufferSize);
    this.material.uniforms.uResolution.value.copy(this.drawingBufferSize);
  };

  private readonly onContextLost = (event: Event): void => {
    event.preventDefault();
    cancelAnimationFrame(this.animationFrame);
    this.animationFrame = 0;
    const panel = document.querySelector<HTMLElement>('#error-panel');
    if (panel) {
      panel.hidden = false;
      panel.textContent = '图形上下文已中断。请关闭其他高负载图形页面后刷新本页。';
    }
  };
}

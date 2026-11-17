import * as THREE from 'three';
import {
  ANAMORPHIC_BLUR_FRAGMENT_SHADER,
  BLACK_HOLE_FRAGMENT_SHADER,
  BLACK_HOLE_VERTEX_SHADER,
  BLOOM_DOWNSAMPLE_FRAGMENT_SHADER,
  BLOOM_PREFILTER_FRAGMENT_SHADER,
  BLOOM_UPSAMPLE_TENT_FRAGMENT_SHADER,
  CINEMA_COMPOSITE_FRAGMENT_SHADER,
} from '../shaders/blackHoleShader';
import {
  BlackHoleParams,
  CameraState,
  DEFAULT_CAMERA,
  PhysicsTelemetry,
  RenderQuality,
  computeEventHorizonRs,
  computeKerrIscoRs,
  computePhotonSphereRs,
} from '../types/blackHole';

interface QualityConfig {
  pixelScale: number;
  maxDpr: number;
  maxSteps: number;
  stepScale: number;
}

const QUALITY_CONFIGS: Record<RenderQuality, QualityConfig> = {
  performance: {
    pixelScale: 0.72,
    maxDpr: 1.1,
    maxSteps: 120,
    stepScale: 1.26,
  },
  balanced: {
    pixelScale: 0.92,
    maxDpr: 1.35,
    maxSteps: 176,
    stepScale: 0.98,
  },
  ultra: {
    pixelScale: 1.0,
    maxDpr: 1.75,
    maxSteps: 245,
    stepScale: 0.74,
  },
};

function createHdrTarget(width: number, height: number): THREE.WebGLRenderTarget {
  return new THREE.WebGLRenderTarget(Math.max(1, width), Math.max(1, height), {
    type: THREE.HalfFloatType,
    minFilter: THREE.LinearFilter,
    magFilter: THREE.LinearFilter,
    wrapS: THREE.ClampToEdgeWrapping,
    wrapT: THREE.ClampToEdgeWrapping,
    depthBuffer: false,
    stencilBuffer: false,
  });
}

export class BlackHoleRenderer {
  private container: HTMLElement;
  private renderer: THREE.WebGLRenderer;
  private postScene: THREE.Scene;
  private orthoCamera: THREE.OrthographicCamera;
  private quadGeometry: THREE.PlaneGeometry;
  private quadMesh: THREE.Mesh;

  // Custom artifact-free HDR shader materials
  private blackHoleMat: THREE.ShaderMaterial;
  private prefilterMat: THREE.ShaderMaterial;
  private downsampleMat: THREE.ShaderMaterial;
  private upsampleMat: THREE.ShaderMaterial;
  private anamorphicMat: THREE.ShaderMaterial;
  private compositeMat: THREE.ShaderMaterial;

  // Half-float render targets (scene + 4-mip pyramid + 2-pass anamorphic)
  private rtScene: THREE.WebGLRenderTarget;
  private rtDown: [
    THREE.WebGLRenderTarget,
    THREE.WebGLRenderTarget,
    THREE.WebGLRenderTarget,
    THREE.WebGLRenderTarget,
  ];
  private rtUp: [
    THREE.WebGLRenderTarget,
    THREE.WebGLRenderTarget,
    THREE.WebGLRenderTarget,
  ];
  private rtAnaA: THREE.WebGLRenderTarget;
  private rtAnaB: THREE.WebGLRenderTarget;

  private params: BlackHoleParams;
  private currentCam: CameraState = { ...DEFAULT_CAMERA };
  private targetCam: CameraState = { ...DEFAULT_CAMERA };

  private simTime = 0;
  private lastTimestamp = 0;
  private warmupFrames = 0;
  private rafId: number | null = null;
  private disposed = false;

  // FPS & telemetry reporting
  private frameCount = 0;
  private fpsAccumTime = 0;
  private currentFps = 60;
  private telemetryTimer = 0;
  private onTelemetry?: (telemetry: PhysicsTelemetry) => void;
  private onRollChange?: (newRollDeg: number) => void;

  // Pointer interaction state
  private isDragging = false;
  private dragButton = 0;
  private lastPointerX = 0;
  private lastPointerY = 0;
  private activePointers = new Map<number, { x: number; y: number }>();
  private lastPinchDist = 0;

  // Reusable math vectors (zero GC allocations per frame)
  private readonly vecCamPos = new THREE.Vector3();
  private readonly vecForward = new THREE.Vector3();
  private readonly vecWorldUp = new THREE.Vector3(0, 1, 0);
  private readonly vecBaseRight = new THREE.Vector3();
  private readonly vecBaseUp = new THREE.Vector3();
  private readonly vecRight = new THREE.Vector3();
  private readonly vecUp = new THREE.Vector3();

  constructor(
    container: HTMLElement,
    initialParams: BlackHoleParams,
    callbacks?: {
      onTelemetry?: (telemetry: PhysicsTelemetry) => void;
      onRollChange?: (newRollDeg: number) => void;
    }
  ) {
    this.container = container;
    this.params = { ...initialParams };
    this.onTelemetry = callbacks?.onTelemetry;
    this.onRollChange = callbacks?.onRollChange;

    this.renderer = new THREE.WebGLRenderer({
      powerPreference: 'high-performance',
      antialias: false,
      stencil: false,
      depth: false,
    });
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.NoToneMapping;
    this.renderer.autoClear = false;
    this.renderer.domElement.style.width = '100%';
    this.renderer.domElement.style.height = '100%';
    this.renderer.domElement.style.display = 'block';
    this.renderer.domElement.style.touchAction = 'none';
    this.container.appendChild(this.renderer.domElement);

    this.postScene = new THREE.Scene();
    this.orthoCamera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);

    const qCfg = QUALITY_CONFIGS[this.params.quality];
    const effectiveInner = this.params.autoIsco
      ? computeKerrIscoRs(this.params.spin)
      : this.params.diskInner;

    this.blackHoleMat = new THREE.ShaderMaterial({
      vertexShader: BLACK_HOLE_VERTEX_SHADER,
      fragmentShader: BLACK_HOLE_FRAGMENT_SHADER,
      depthWrite: false,
      depthTest: false,
      uniforms: {
        uResolution: { value: new THREE.Vector2(1280, 720) },
        uTime: { value: 0 },
        uCamPos: { value: new THREE.Vector3(0, 2, 16) },
        uCamForward: { value: new THREE.Vector3(0, 0, -1) },
        uCamRight: { value: new THREE.Vector3(1, 0, 0) },
        uCamUp: { value: new THREE.Vector3(0, 1, 0) },
        uTanHalfFov: {
          value: Math.tan(THREE.MathUtils.degToRad(this.params.fov * 0.5)),
        },

        uMass: { value: this.params.mass },
        uSpin: { value: this.params.spin },
        uLensingStrength: { value: this.params.lensingStrength },

        uShowDisk: { value: this.params.showDisk ? 1.0 : 0.0 },
        uDiskInner: { value: effectiveInner },
        uDiskOuter: { value: this.params.diskOuter },
        uDiskThickness: { value: this.params.diskThickness },
        uDiskDensity: { value: this.params.diskDensity },
        uDiskTemp: { value: this.params.diskTemperature },
        uDiskSpeed: { value: this.params.diskSpeed },
        uDopplerBeaming: { value: this.params.dopplerBeaming },
        uGravRedshift: { value: this.params.gravRedshift ? 1.0 : 0.0 },
        uPhotonRingBoost: { value: this.params.photonRingBoost },

        uStarDensity: { value: this.params.starDensity },
        uNebulaIntensity: { value: this.params.nebulaIntensity },

        uMaxSteps: { value: qCfg.maxSteps },
        uStepScale: { value: qCfg.stepScale },
      },
    });

    this.prefilterMat = new THREE.ShaderMaterial({
      vertexShader: BLACK_HOLE_VERTEX_SHADER,
      fragmentShader: BLOOM_PREFILTER_FRAGMENT_SHADER,
      depthWrite: false,
      depthTest: false,
      uniforms: {
        tInput: { value: null },
        uTexelSize: { value: new THREE.Vector2(1 / 1280, 1 / 720) },
        uThreshold: { value: 0.72 },
        uSoftKnee: { value: 0.65 },
      },
    });

    this.downsampleMat = new THREE.ShaderMaterial({
      vertexShader: BLACK_HOLE_VERTEX_SHADER,
      fragmentShader: BLOOM_DOWNSAMPLE_FRAGMENT_SHADER,
      depthWrite: false,
      depthTest: false,
      uniforms: {
        tInput: { value: null },
        uTexelSize: { value: new THREE.Vector2(1 / 640, 1 / 360) },
      },
    });

    this.upsampleMat = new THREE.ShaderMaterial({
      vertexShader: BLACK_HOLE_VERTEX_SHADER,
      fragmentShader: BLOOM_UPSAMPLE_TENT_FRAGMENT_SHADER,
      depthWrite: false,
      depthTest: false,
      uniforms: {
        tLowMip: { value: null },
        tCurrMip: { value: null },
        uTexelSize: { value: new THREE.Vector2(1 / 320, 1 / 180) },
        uRadius: { value: 1.15 },
        uMipWeight: { value: 0.85 },
      },
    });

    this.anamorphicMat = new THREE.ShaderMaterial({
      vertexShader: BLACK_HOLE_VERTEX_SHADER,
      fragmentShader: ANAMORPHIC_BLUR_FRAGMENT_SHADER,
      depthWrite: false,
      depthTest: false,
      uniforms: {
        tInput: { value: null },
        uStepWidth: { value: 0.008 },
        uPassIndex: { value: 0.0 },
      },
    });

    this.compositeMat = new THREE.ShaderMaterial({
      vertexShader: BLACK_HOLE_VERTEX_SHADER,
      fragmentShader: CINEMA_COMPOSITE_FRAGMENT_SHADER,
      depthWrite: false,
      depthTest: false,
      uniforms: {
        tScene: { value: null },
        tBloom: { value: null },
        tAnamorphic: { value: null },
        uBloomStrength: { value: this.params.bloomStrength },
        uAnamorphic: { value: this.params.anamorphicFlare },
        uExposure: { value: this.params.exposure },
        uTime: { value: 0 },
      },
    });

    this.quadGeometry = new THREE.PlaneGeometry(2, 2);
    this.quadMesh = new THREE.Mesh(this.quadGeometry, this.blackHoleMat);
    this.quadMesh.frustumCulled = false;
    this.postScene.add(this.quadMesh);

    const initW = Math.max(2, this.container.clientWidth || window.innerWidth);
    const initH = Math.max(2, this.container.clientHeight || window.innerHeight);

    this.rtScene = createHdrTarget(initW, initH);
    this.rtDown = [
      createHdrTarget(initW >> 1, initH >> 1),
      createHdrTarget(initW >> 2, initH >> 2),
      createHdrTarget(initW >> 3, initH >> 3),
      createHdrTarget(initW >> 4, initH >> 4),
    ];
    this.rtUp = [
      createHdrTarget(initW >> 1, initH >> 1),
      createHdrTarget(initW >> 2, initH >> 2),
      createHdrTarget(initW >> 3, initH >> 3),
    ];
    this.rtAnaA = createHdrTarget(initW >> 2, initH >> 1);
    this.rtAnaB = createHdrTarget(initW >> 2, initH >> 1);

    this.updateSize();
    this.bindEvents();
    this.startLoop();
  }

  public updateParams(nextParams: BlackHoleParams): void {
    const prevQuality = this.params.quality;
    this.params = { ...nextParams };

    const qCfg = QUALITY_CONFIGS[this.params.quality];
    const effectiveInner = this.params.autoIsco
      ? computeKerrIscoRs(this.params.spin)
      : this.params.diskInner;
    const clampedOuter = Math.max(effectiveInner + 0.8, this.params.diskOuter);

    const u = this.blackHoleMat.uniforms;
    u.uTanHalfFov.value = Math.tan(
      THREE.MathUtils.degToRad(this.params.fov * 0.5)
    );
    u.uMass.value = this.params.mass;
    u.uSpin.value = this.params.spin;
    u.uLensingStrength.value = this.params.lensingStrength;

    u.uShowDisk.value = this.params.showDisk ? 1.0 : 0.0;
    u.uDiskInner.value = effectiveInner;
    u.uDiskOuter.value = clampedOuter;
    u.uDiskThickness.value = this.params.diskThickness;
    u.uDiskDensity.value = this.params.diskDensity;
    u.uDiskTemp.value = this.params.diskTemperature;
    u.uDiskSpeed.value = this.params.diskSpeed;
    u.uDopplerBeaming.value = this.params.dopplerBeaming;
    u.uGravRedshift.value = this.params.gravRedshift ? 1.0 : 0.0;
    u.uPhotonRingBoost.value = this.params.photonRingBoost;

    u.uStarDensity.value = this.params.starDensity;
    u.uNebulaIntensity.value = this.params.nebulaIntensity;

    u.uMaxSteps.value = qCfg.maxSteps;
    u.uStepScale.value = qCfg.stepScale;

    this.compositeMat.uniforms.uBloomStrength.value = this.params.bloomStrength;
    this.compositeMat.uniforms.uAnamorphic.value = this.params.anamorphicFlare;
    this.compositeMat.uniforms.uExposure.value = this.params.exposure;

    const minSafeDist = Math.max(3.8, this.params.mass * 3.6);
    if (this.targetCam.distance < minSafeDist) {
      this.targetCam.distance = minSafeDist;
    }

    if (prevQuality !== this.params.quality) {
      this.updateSize();
    }
  }

  public setCameraState(partial: Partial<CameraState>, immediate = false): void {
    if (partial.azimuth !== undefined) this.targetCam.azimuth = partial.azimuth;
    if (partial.elevation !== undefined) {
      this.targetCam.elevation = THREE.MathUtils.clamp(
        partial.elevation,
        -1.51,
        1.51
      );
    }
    if (partial.distance !== undefined) {
      const minSafeDist = Math.max(3.8, this.params.mass * 3.6);
      this.targetCam.distance = THREE.MathUtils.clamp(
        partial.distance,
        minSafeDist,
        48.0
      );
    }

    if (immediate) {
      this.currentCam = { ...this.targetCam };
    }
  }

  public resetCamera(): void {
    this.setCameraState(DEFAULT_CAMERA, false);
  }

  public captureScreenshot(): string {
    this.renderPipeline();
    return this.renderer.domElement.toDataURL('image/png');
  }

  private updateSize = (): void => {
    if (this.disposed) return;
    const width = Math.max(1, this.container.clientWidth || window.innerWidth);
    const height = Math.max(1, this.container.clientHeight || window.innerHeight);

    const qCfg = QUALITY_CONFIGS[this.params.quality];
    const rawDpr = window.devicePixelRatio || 1;
    const effectiveDpr = Math.min(rawDpr, qCfg.maxDpr) * qCfg.pixelScale;

    this.renderer.setPixelRatio(effectiveDpr);
    this.renderer.setSize(width, height, false);

    const w0 = Math.max(2, Math.floor(width * effectiveDpr));
    const h0 = Math.max(2, Math.floor(height * effectiveDpr));

    this.rtScene.setSize(w0, h0);

    const w1 = Math.max(2, w0 >> 1);
    const h1 = Math.max(2, h0 >> 1);
    const w2 = Math.max(2, w0 >> 2);
    const h2 = Math.max(2, h0 >> 2);
    const w3 = Math.max(2, w0 >> 3);
    const h3 = Math.max(2, h0 >> 3);
    const w4 = Math.max(2, w0 >> 4);
    const h4 = Math.max(2, h0 >> 4);

    this.rtDown[0].setSize(w1, h1);
    this.rtDown[1].setSize(w2, h2);
    this.rtDown[2].setSize(w3, h3);
    this.rtDown[3].setSize(w4, h4);

    this.rtUp[0].setSize(w1, h1);
    this.rtUp[1].setSize(w2, h2);
    this.rtUp[2].setSize(w3, h3);

    this.rtAnaA.setSize(w2, h1);
    this.rtAnaB.setSize(w2, h1);

    this.blackHoleMat.uniforms.uResolution.value.set(w0, h0);
  };

  private drawPass(
    material: THREE.ShaderMaterial,
    target: THREE.WebGLRenderTarget | null
  ): void {
    this.quadMesh.material = material;
    this.renderer.setRenderTarget(target);
    this.renderer.render(this.postScene, this.orthoCamera);
  }

  private renderPipeline(): void {
    // 1. Primary Kerr geodesic & relativistic accretion disk raymarch into HalfFloat HDR buffer
    this.drawPass(this.blackHoleMat, this.rtScene);

    // 2. Karis anti-firefly soft-knee bright-pass downsample -> rtDown[0]
    this.prefilterMat.uniforms.tInput.value = this.rtScene.texture;
    this.prefilterMat.uniforms.uTexelSize.value.set(
      1.0 / this.rtScene.width,
      1.0 / this.rtScene.height
    );
    this.drawPass(this.prefilterMat, this.rtDown[0]);

    // 3. Isotropic 13-tap Jimenez mip pyramid -> rtDown[1..3]
    for (let i = 0; i < 3; i++) {
      const src = this.rtDown[i];
      const dst = this.rtDown[i + 1];
      this.downsampleMat.uniforms.tInput.value = src.texture;
      this.downsampleMat.uniforms.uTexelSize.value.set(
        1.0 / src.width,
        1.0 / src.height
      );
      this.drawPass(this.downsampleMat, dst);
    }

    // 4. Isotropic 9-tap circular tent upsample chain -> rtUp[2] -> rtUp[1] -> rtUp[0]
    const mipWeights = [0.72, 0.80, 0.88];
    const mipRadii = [1.25, 1.15, 1.05];

    // Level 3 -> Level 2
    this.upsampleMat.uniforms.tLowMip.value = this.rtDown[3].texture;
    this.upsampleMat.uniforms.tCurrMip.value = this.rtDown[2].texture;
    this.upsampleMat.uniforms.uTexelSize.value.set(
      1.0 / this.rtDown[3].width,
      1.0 / this.rtDown[3].height
    );
    this.upsampleMat.uniforms.uRadius.value = mipRadii[0];
    this.upsampleMat.uniforms.uMipWeight.value = mipWeights[0];
    this.drawPass(this.upsampleMat, this.rtUp[2]);

    // Level 2 -> Level 1
    this.upsampleMat.uniforms.tLowMip.value = this.rtUp[2].texture;
    this.upsampleMat.uniforms.tCurrMip.value = this.rtDown[1].texture;
    this.upsampleMat.uniforms.uTexelSize.value.set(
      1.0 / this.rtUp[2].width,
      1.0 / this.rtUp[2].height
    );
    this.upsampleMat.uniforms.uRadius.value = mipRadii[1];
    this.upsampleMat.uniforms.uMipWeight.value = mipWeights[1];
    this.drawPass(this.upsampleMat, this.rtUp[1]);

    // Level 1 -> Level 0 (final smooth multi-scale bloom)
    this.upsampleMat.uniforms.tLowMip.value = this.rtUp[1].texture;
    this.upsampleMat.uniforms.tCurrMip.value = this.rtDown[0].texture;
    this.upsampleMat.uniforms.uTexelSize.value.set(
      1.0 / this.rtUp[1].width,
      1.0 / this.rtUp[1].height
    );
    this.upsampleMat.uniforms.uRadius.value = mipRadii[2];
    this.upsampleMat.uniforms.uMipWeight.value = mipWeights[2];
    this.drawPass(this.upsampleMat, this.rtUp[0]);

    // 5. Two-pass wide horizontal IMAX anamorphic streak blur (silky smooth, zero noise!)
    if (this.params.anamorphicFlare > 0.002) {
      this.anamorphicMat.uniforms.tInput.value = this.rtDown[0].texture;
      this.anamorphicMat.uniforms.uStepWidth.value = 0.0065;
      this.anamorphicMat.uniforms.uPassIndex.value = 0.0;
      this.drawPass(this.anamorphicMat, this.rtAnaA);

      this.anamorphicMat.uniforms.tInput.value = this.rtAnaA.texture;
      this.anamorphicMat.uniforms.uStepWidth.value = 0.024;
      this.anamorphicMat.uniforms.uPassIndex.value = 1.0;
      this.drawPass(this.anamorphicMat, this.rtAnaB);
    }

    // 6. Final IMAX Cinema Composite & ACES Tone Mapping to screen
    this.compositeMat.uniforms.tScene.value = this.rtScene.texture;
    this.compositeMat.uniforms.tBloom.value = this.rtUp[0].texture;
    this.compositeMat.uniforms.tAnamorphic.value = this.rtAnaB.texture;
    this.drawPass(this.compositeMat, null);
  }

  private updateCameraBasis(dt: number): void {
    if (this.params.autoOrbit && !this.isDragging && !this.params.paused) {
      this.targetCam.azimuth += dt * 0.11;
    }

    const damp = 1 - Math.exp(-11.5 * dt);
    this.currentCam.azimuth +=
      (this.targetCam.azimuth - this.currentCam.azimuth) * damp;
    this.currentCam.elevation +=
      (this.targetCam.elevation - this.currentCam.elevation) * damp;
    this.currentCam.distance +=
      (this.targetCam.distance - this.currentCam.distance) * damp;

    const { azimuth, elevation, distance } = this.currentCam;
    const cosEl = Math.cos(elevation);
    const sinEl = Math.sin(elevation);
    const sinAz = Math.sin(azimuth);
    const cosAz = Math.cos(azimuth);

    this.vecCamPos.set(
      distance * cosEl * sinAz,
      distance * sinEl,
      distance * cosEl * cosAz
    );

    this.vecForward.copy(this.vecCamPos).negate().normalize();
    this.vecBaseRight
      .crossVectors(this.vecForward, this.vecWorldUp)
      .normalize();
    this.vecBaseUp
      .crossVectors(this.vecBaseRight, this.vecForward)
      .normalize();

    const rollRad = THREE.MathUtils.degToRad(this.params.cameraRoll);
    const cosR = Math.cos(rollRad);
    const sinR = Math.sin(rollRad);

    this.vecRight
      .copy(this.vecBaseRight)
      .multiplyScalar(cosR)
      .addScaledVector(this.vecBaseUp, sinR)
      .normalize();

    this.vecUp
      .copy(this.vecBaseUp)
      .multiplyScalar(cosR)
      .addScaledVector(this.vecBaseRight, -sinR)
      .normalize();

    const u = this.blackHoleMat.uniforms;
    u.uCamPos.value.copy(this.vecCamPos);
    u.uCamForward.value.copy(this.vecForward);
    u.uCamRight.value.copy(this.vecRight);
    u.uCamUp.value.copy(this.vecUp);
  }

  private emitTelemetry(): void {
    if (!this.onTelemetry) return;
    const rs = this.params.mass;
    const rH = computeEventHorizonRs(this.params.spin) * rs;
    const rPh = computePhotonSphereRs(this.params.spin) * rs;
    const rIsco =
      (this.params.autoIsco
        ? computeKerrIscoRs(this.params.spin)
        : this.params.diskInner) * rs;
    const shadowR = 2.598 * rs * (1 - 0.08 * Math.abs(this.params.spin));

    this.onTelemetry({
      schwarzschildRadius: rs,
      eventHorizonRadius: rH,
      photonSphereRadius: rPh,
      iscoRadius: rIsco,
      shadowRadius: shadowR,
      observerDistance: this.currentCam.distance,
      fps: Math.max(1, Math.round(this.currentFps)),
    });
  }

  private startLoop(): void {
    this.lastTimestamp = performance.now();

    const tick = (now: number) => {
      if (this.disposed) return;
      this.rafId = requestAnimationFrame(tick);

      const rawDt = (now - this.lastTimestamp) * 0.001;
      this.lastTimestamp = now;

      // Ignore initial WebGL shader/pipeline compilation frames in FPS counter
      if (this.warmupFrames < 4) {
        this.warmupFrames++;
        this.updateCameraBasis(0.016);
        this.renderPipeline();
        if (this.warmupFrames === 1) {
          this.emitTelemetry();
        }
        return;
      }

      const dt = Math.min(0.1, Math.max(0.0001, rawDt));

      if (!this.params.paused) {
        this.simTime += dt;
      }

      if (rawDt < 0.5) {
        this.frameCount++;
        this.fpsAccumTime += rawDt;
        if (this.fpsAccumTime >= 0.4) {
          this.currentFps = this.frameCount / this.fpsAccumTime;
          this.frameCount = 0;
          this.fpsAccumTime = 0;
        }
      }

      this.telemetryTimer += dt;
      if (this.telemetryTimer >= 0.25) {
        this.telemetryTimer = 0;
        this.emitTelemetry();
      }

      this.updateCameraBasis(dt);
      this.blackHoleMat.uniforms.uTime.value = this.simTime;
      this.compositeMat.uniforms.uTime.value = this.simTime;

      this.renderPipeline();
    };

    this.rafId = requestAnimationFrame(tick);
  }

  // -------------------------------------------------------------------------
  // Mouse & Touch Orbit, Zoom, and Roll Interaction
  // -------------------------------------------------------------------------
  private handlePointerDown = (e: PointerEvent): void => {
    this.renderer.domElement.setPointerCapture(e.pointerId);
    this.activePointers.set(e.pointerId, { x: e.clientX, y: e.clientY });

    if (this.activePointers.size === 1) {
      this.isDragging = true;
      this.dragButton = e.button;
      this.lastPointerX = e.clientX;
      this.lastPointerY = e.clientY;
    } else if (this.activePointers.size === 2) {
      const pts = Array.from(this.activePointers.values());
      this.lastPinchDist = Math.hypot(pts[1].x - pts[0].x, pts[1].y - pts[0].y);
    }
  };

  private handlePointerMove = (e: PointerEvent): void => {
    if (!this.activePointers.has(e.pointerId)) return;
    this.activePointers.set(e.pointerId, { x: e.clientX, y: e.clientY });

    if (this.activePointers.size === 2) {
      const pts = Array.from(this.activePointers.values());
      const dist = Math.hypot(pts[1].x - pts[0].x, pts[1].y - pts[0].y);
      if (this.lastPinchDist > 0) {
        const delta = this.lastPinchDist - dist;
        this.setCameraState({
          distance: this.targetCam.distance * (1 + delta * 0.0045),
        });
      }
      this.lastPinchDist = dist;
      return;
    }

    if (!this.isDragging) return;

    const dx = e.clientX - this.lastPointerX;
    const dy = e.clientY - this.lastPointerY;
    this.lastPointerX = e.clientX;
    this.lastPointerY = e.clientY;

    // Right-drag or Shift+drag adjusts cinema camera roll (-60 to +60 deg)
    if (this.dragButton === 2 || e.shiftKey) {
      const nextRoll = THREE.MathUtils.clamp(
        this.params.cameraRoll + dx * 0.2,
        -60,
        60
      );
      this.params.cameraRoll = nextRoll;
      this.onRollChange?.(Math.round(nextRoll * 10) / 10);
      return;
    }

    // Exact inverse camera-roll projection so screen drag always aligns with visual horizon
    const rollRad = THREE.MathUtils.degToRad(this.params.cameraRoll);
    const cosR = Math.cos(rollRad);
    const sinR = Math.sin(rollRad);
    const worldDx = dx * cosR + dy * sinR;
    const worldDy = -dx * sinR + dy * cosR;

    const orbitSpeed = 0.0048;
    this.setCameraState({
      azimuth: this.targetCam.azimuth - worldDx * orbitSpeed,
      elevation: this.targetCam.elevation + worldDy * orbitSpeed,
    });
  };

  private handlePointerUp = (e: PointerEvent): void => {
    if (this.renderer.domElement.hasPointerCapture(e.pointerId)) {
      this.renderer.domElement.releasePointerCapture(e.pointerId);
    }
    this.activePointers.delete(e.pointerId);
    if (this.activePointers.size === 0) {
      this.isDragging = false;
      this.lastPinchDist = 0;
    } else if (this.activePointers.size === 1) {
      const remaining = Array.from(this.activePointers.values())[0];
      this.lastPointerX = remaining.x;
      this.lastPointerY = remaining.y;
      this.lastPinchDist = 0;
    }
  };

  private handleWheel = (e: WheelEvent): void => {
    e.preventDefault();
    const zoomFactor = Math.exp(e.deltaY * 0.0011);
    this.setCameraState({
      distance: this.targetCam.distance * zoomFactor,
    });
  };

  private handleContextMenu = (e: MouseEvent): void => {
    e.preventDefault();
  };

  private bindEvents(): void {
    const dom = this.renderer.domElement;
    window.addEventListener('resize', this.updateSize);
    dom.addEventListener('pointerdown', this.handlePointerDown);
    dom.addEventListener('pointermove', this.handlePointerMove);
    dom.addEventListener('pointerup', this.handlePointerUp);
    dom.addEventListener('pointercancel', this.handlePointerUp);
    dom.addEventListener('wheel', this.handleWheel, { passive: false });
    dom.addEventListener('contextmenu', this.handleContextMenu);
  }

  public dispose(): void {
    this.disposed = true;
    if (this.rafId !== null) {
      cancelAnimationFrame(this.rafId);
    }
    const dom = this.renderer.domElement;
    window.removeEventListener('resize', this.updateSize);
    dom.removeEventListener('pointerdown', this.handlePointerDown);
    dom.removeEventListener('pointermove', this.handlePointerMove);
    dom.removeEventListener('pointerup', this.handlePointerUp);
    dom.removeEventListener('pointercancel', this.handlePointerUp);
    dom.removeEventListener('wheel', this.handleWheel);
    dom.removeEventListener('contextmenu', this.handleContextMenu);

    this.quadGeometry.dispose();
    this.blackHoleMat.dispose();
    this.prefilterMat.dispose();
    this.downsampleMat.dispose();
    this.upsampleMat.dispose();
    this.anamorphicMat.dispose();
    this.compositeMat.dispose();

    this.rtScene.dispose();
    this.rtDown.forEach((rt) => rt.dispose());
    this.rtUp.forEach((rt) => rt.dispose());
    this.rtAnaA.dispose();
    this.rtAnaB.dispose();

    this.renderer.dispose();
    if (dom.parentElement === this.container) {
      this.container.removeChild(dom);
    }
  }
}

/* ============================================================
 * GARGANTUA — 渲染引擎
 * 单 rAF 循环 · HDR 多级泛光 · 阻尼轨道相机 · 自适应分辨率
 * 所有几何/材质/渲染目标复用，逐帧零分配
 * ============================================================ */
(function () {
  'use strict';

  var S = window.BH_SHADERS;

  var QUALITY = {
    low:    { steps: 96,  stepScale: 1.30, scale: 0.55, label: '性能' },
    medium: { steps: 144, stepScale: 1.00, scale: 0.75, label: '均衡' },
    high:   { steps: 208, stepScale: 0.80, scale: 1.00, label: '高清' },
    ultra:  { steps: 288, stepScale: 0.62, scale: 1.00, label: '极致' }
  };

  function clamp(v, a, b) { return v < a ? a : (v > b ? b : v); }

  function Engine(canvas) {
    this.canvas = canvas;
    this.disposed = false;
    this.contextLost = false;

    this.renderer = new THREE.WebGLRenderer({
      canvas: canvas,
      antialias: false,
      alpha: false,
      depth: false,
      stencil: false,
      powerPreference: 'high-performance',
      preserveDrawingBuffer: false
    });
    this.renderer.toneMapping = THREE.NoToneMapping;
    this.renderer.outputEncoding = THREE.LinearEncoding;
    this.renderer.autoClear = true;

    /* HDR 渲染目标能力检测（WebGL2 需要 EXT_color_buffer_float） */
    var isWebGL2 = this.renderer.capabilities.isWebGL2;
    var ext = this.renderer.extensions;
    var canHDR = isWebGL2
      ? !!(ext.get('EXT_color_buffer_float') || ext.get('EXT_color_buffer_half_float'))
      : !!(ext.get('OES_texture_half_float') && ext.get('EXT_color_buffer_half_float'));
    this.rtType = canHDR ? THREE.HalfFloatType : THREE.UnsignedByteType;
    this.hdr = canHDR;

    /* ---- 相机与轨道状态 ---- */
    this.camera = new THREE.PerspectiveCamera(55, 1, 0.1, 600);
    this.view = {
      theta: -Math.PI * 0.34,   // 方位角
      phi: Math.PI * 0.445,     // 极角（自 +Y），≈ 距盘面 10°
      radius: 18,
      tTheta: -Math.PI * 0.34,
      tPhi: Math.PI * 0.445,
      tRadius: 18
    };
    this.minRadius = 3.6;
    this.maxRadius = 140;
    this.autoRotate = true;
    this.autoRotateSpeed = 0.35;
    this.dragging = false;
    this.lastInteract = -1e9;
    this.pointers = new Map();
    this.pinchDist = 0;

    /* ---- 时间 ---- */
    this.elapsed = 0;
    this.simTime = 0;
    this.diskPhase = 0;
    this.diskSpeed = 0.7;
    this.paused = false;

    /* ---- 画质 / 分辨率 ---- */
    this.qualityName = 'medium';
    this.qualityScale = QUALITY.medium.scale;
    this.adaptiveScale = 1;
    this.autoRes = true;
    this.fps = 60;
    this._fpsAcc = 0;
    this._fpsFrames = 0;
    this._adaptTimer = 0;
    this.width = 2;
    this.height = 2;

    /* ---- 回调 ---- */
    this.onFrame = null;
    this.onContextLost = null;
    this.onContextRestored = null;
    this.shotCb = null;

    this._initMaterials();
    this._initTargets();
    this._bindInput();
    this._bindContextEvents();
    this._applyURLOverrides();
    this.resize();
  }

  /* ---------------- 材质 ---------------- */
  Engine.prototype._initMaterials = function () {
    var U = this.uniforms = {
      uResolution:   { value: new THREE.Vector2(2, 2) },
      uTime:         { value: 0 },
      uPhase:        { value: 0 },
      uCamWorld:     { value: new THREE.Matrix4() },
      uCamPos:       { value: new THREE.Vector3(0, 0, 18) },
      uTanHalfFov:   { value: Math.tan(55 * Math.PI / 360) },
      uRs:           { value: 1.0 },
      uLens:         { value: 1.0 },
      uSteps:        { value: QUALITY.medium.steps },
      uStepScale:    { value: QUALITY.medium.stepScale },
      uDiskIn:       { value: 3.1 },
      uDiskOut:      { value: 12.5 },
      uDiskTemp:     { value: 5200 },
      uDiskBright:   { value: 1.15 },
      uTurb:         { value: 0.7 },
      uDoppler:      { value: 0.3 },
      uRedshift:     { value: 0.7 },
      uDiskDensity:  { value: 0.85 },
      uStarDensity:  { value: 0.65 },
      uStarBright:   { value: 1.0 },
      uNebula:       { value: 0.5 },
      uBgBright:     { value: 1.0 }
    };

    function mat(frag, uniforms) {
      return new THREE.ShaderMaterial({
        vertexShader: S.vert,
        fragmentShader: frag,
        uniforms: uniforms || {},
        depthTest: false,
        depthWrite: false
      });
    }

    this.blackholeMat = mat(S.blackholeFrag, U);
    this.brightMat = mat(S.brightFrag, {
      tInput: { value: null },
      uThreshold: { value: 0.72 }
    });
    this.blurMat = mat(S.blurFrag, {
      tInput: { value: null },
      uDir: { value: new THREE.Vector2() }
    });
    this.copyMat = mat(S.copyFrag, {
      tInput: { value: null },
      uTexel: { value: new THREE.Vector2() }
    });
    this.compositeMat = mat(S.compositeFrag, {
      tScene: { value: null },
      tB0: { value: null },
      tB1: { value: null },
      tB2: { value: null },
      uBloom: { value: 1.0 },
      uExposure: { value: 1.1 },
      uTime: { value: 0 },
      uGrain: { value: 0.028 },
      uResolution: { value: new THREE.Vector2(2, 2) }
    });

    /* 共享全屏四边形 */
    this.quadGeo = new THREE.PlaneGeometry(2, 2);
    this.quadMesh = new THREE.Mesh(this.quadGeo, this.blackholeMat);
    this.quadMesh.frustumCulled = false;
    this.quadScene = new THREE.Scene();
    this.quadScene.add(this.quadMesh);
    this.quadCam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  };

  /* ---------------- 渲染目标 ---------------- */
  Engine.prototype._makeRT = function (w, h) {
    return new THREE.WebGLRenderTarget(Math.max(2, w), Math.max(2, h), {
      type: this.rtType,
      format: THREE.RGBAFormat,
      minFilter: THREE.LinearFilter,
      magFilter: THREE.LinearFilter,
      depthBuffer: false,
      stencilBuffer: false
    });
  };

  Engine.prototype._initTargets = function () {
    this.sceneRT = this._makeRT(2, 2);
    this.mips = [];
    for (var i = 0; i < 3; i++) {
      this.mips.push({ a: this._makeRT(2, 2), b: this._makeRT(2, 2), w: 2, h: 2, radius: 1.0 + i * 0.18 });
    }
  };

  Engine.prototype.resize = function () {
    if (this.disposed) return;
    var w = this.canvas.clientWidth || window.innerWidth;
    var h = this.canvas.clientHeight || window.innerHeight;
    var basePR = Math.min(window.devicePixelRatio || 1, 2);
    var pr = Math.max(0.4, basePR * this.qualityScale * this.adaptiveScale);
    this.width = Math.max(2, Math.round(w * pr));
    this.height = Math.max(2, Math.round(h * pr));
    this.cssWidth = w;
    this.cssHeight = h;

    this.renderer.setPixelRatio(1);
    this.renderer.setSize(this.width, this.height, false);

    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();

    this.sceneRT.setSize(this.width, this.height);
    for (var i = 0; i < 3; i++) {
      var mw = Math.max(2, Math.round(this.width / Math.pow(2, i + 1)));
      var mh = Math.max(2, Math.round(this.height / Math.pow(2, i + 1)));
      var m = this.mips[i];
      m.w = mw; m.h = mh;
      m.a.setSize(mw, mh);
      m.b.setSize(mw, mh);
    }
    this.uniforms.uResolution.value.set(this.width, this.height);
    this.compositeMat.uniforms.uResolution.value.set(this.width, this.height);
  };

  /* ---------------- 输入：轨道相机 ---------------- */
  Engine.prototype._bindInput = function () {
    var self = this;
    var cv = this.canvas;

    function interact() { self.lastInteract = performance.now(); }

    cv.addEventListener('pointerdown', function (e) {
      if (e.button !== undefined && e.button !== 0 && e.pointerType === 'mouse') return;
      try { cv.setPointerCapture(e.pointerId); } catch (err) { /* 忽略 */ }
      self.pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (self.pointers.size === 2) {
        var pts = Array.from(self.pointers.values());
        self.pinchDist = Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y);
      }
      self.dragging = true;
      interact();
      if (self.onStartInteract) self.onStartInteract();
      e.preventDefault();
    });

    cv.addEventListener('pointermove', function (e) {
      var rec = self.pointers.get(e.pointerId);
      if (!rec) return;
      var dx = e.clientX - rec.x;
      var dy = e.clientY - rec.y;
      rec.x = e.clientX; rec.y = e.clientY;
      interact();

      if (self.pointers.size === 1) {
        var k = 0.0042 * (self.view.radius / 18);
        k = clamp(k, 0.0018, 0.008);
        self.view.tTheta -= dx * k;
        self.view.tPhi = clamp(self.view.tPhi - dy * k, 0.035, Math.PI - 0.035);
      } else if (self.pointers.size === 2) {
        var pts = Array.from(self.pointers.values());
        var d = Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y);
        if (self.pinchDist > 0 && d > 0) {
          self.view.tRadius = clamp(self.view.tRadius * (self.pinchDist / d), self.minRadius, self.maxRadius);
        }
        self.pinchDist = d;
      }
    });

    function release(e) {
      self.pointers.delete(e.pointerId);
      if (self.pointers.size < 2) self.pinchDist = 0;
      self.dragging = self.pointers.size > 0;
      interact();
    }
    cv.addEventListener('pointerup', release);
    cv.addEventListener('pointercancel', release);

    cv.addEventListener('wheel', function (e) {
      e.preventDefault();
      interact();
      var dy = e.deltaY;
      if (e.deltaMode === 1) dy *= 33;
      self.view.tRadius = clamp(self.view.tRadius * Math.exp(dy * 0.0011), self.minRadius, self.maxRadius);
    }, { passive: false });

    cv.addEventListener('dblclick', function () {
      self.setCameraView({ incl: 9, dist: 18 }, true);
    });
  };

  Engine.prototype._bindContextEvents = function () {
    var self = this;
    this.canvas.addEventListener('webglcontextlost', function (e) {
      e.preventDefault();
      self.contextLost = true;
      if (self.onContextLost) self.onContextLost();
    });
    this.canvas.addEventListener('webglcontextrestored', function () {
      self.contextLost = false;
      self.resize();
      if (self.onContextRestored) self.onContextRestored();
    });
  };

  Engine.prototype._applyURLOverrides = function () {
    try {
      var q = new URLSearchParams(window.location.search);
      if (q.get('quality') && QUALITY[q.get('quality')]) this.setQuality(q.get('quality'));
      var steps = parseInt(q.get('steps'), 10);
      if (steps > 0) this.uniforms.uSteps.value = Math.min(320, steps);
      var scale = parseFloat(q.get('scale'));
      if (scale > 0) { this.qualityScale = clamp(scale, 0.3, 1); this.adaptiveScale = 1; this.autoRes = false; }
      var t = parseFloat(q.get('t'));
      if (!isNaN(t)) { this.diskPhase = t; this.simTime = t; }
      if (q.get('paused') === '1') this.paused = true;
      if (q.get('rotate') === '0') this.autoRotate = false;
      var incl = parseFloat(q.get('incl'));
      var dist = parseFloat(q.get('dist'));
      var az = parseFloat(q.get('az'));
      if (!isNaN(incl) || !isNaN(dist) || !isNaN(az)) {
        this.setCameraView({
          incl: isNaN(incl) ? 9 : incl,
          dist: isNaN(dist) ? 18 : dist,
          az: isNaN(az) ? undefined : az
        }, false);
      }
    } catch (err) { /* URL 解析失败不影响运行 */ }
  };

  /* ---------------- 控制接口 ---------------- */
  Engine.prototype.setQuality = function (name) {
    var q = QUALITY[name];
    if (!q) return;
    this.qualityName = name;
    this.qualityScale = q.scale;
    this.uniforms.uSteps.value = q.steps;
    this.uniforms.uStepScale.value = q.stepScale;
    this.adaptiveScale = 1;
    this.resize();
  };

  Engine.prototype.setFov = function (deg) {
    this.camera.fov = clamp(deg, 20, 100);
    this.camera.updateProjectionMatrix();
  };

  Engine.prototype.setBloom = function (v) { this.compositeMat.uniforms.uBloom.value = v; };
  Engine.prototype.setExposure = function (v) { this.compositeMat.uniforms.uExposure.value = v; };
  Engine.prototype.setGrain = function (v) { this.compositeMat.uniforms.uGrain.value = v; };

  /* incl: 距吸积盘平面的仰角（度）；dist: 相机距离（场景单位）；az: 方位角（度） */
  Engine.prototype.setCameraView = function (v, animate) {
    if (typeof v.incl === 'number') this.view.tPhi = clamp((90 - v.incl) * Math.PI / 180, 0.035, Math.PI - 0.035);
    if (typeof v.dist === 'number') this.view.tRadius = clamp(v.dist, this.minRadius, this.maxRadius);
    if (typeof v.az === 'number') {
      /* 取与当前方位最近的等价角，避免绕远路 */
      var target = v.az * Math.PI / 180;
      var cur = this.view.tTheta;
      var delta = ((target - cur + Math.PI) % (2 * Math.PI) + 2 * Math.PI) % (2 * Math.PI) - Math.PI;
      this.view.tTheta = cur + delta;
    }
    if (!animate) {
      this.view.theta = this.view.tTheta;
      this.view.phi = this.view.tPhi;
      this.view.radius = this.view.tRadius;
    }
    this.lastInteract = performance.now();
  };

  Engine.prototype.resetView = function () {
    this.setCameraView({ incl: 9, dist: 18, az: -61 }, true);
  };

  Engine.prototype.setPaused = function (p) { this.paused = !!p; };

  Engine.prototype.requestShot = function (cb) { this.shotCb = cb; };

  Engine.prototype._updateControls = function (dt) {
    var v = this.view;
    var now = performance.now();
    if (this.autoRotate && !this.dragging && now - this.lastInteract > 2500) {
      v.tTheta += this.autoRotateSpeed * 0.10 * dt;
    }
    var k = 1 - Math.exp(-dt * 6.5);
    v.theta += (v.tTheta - v.theta) * k;
    v.phi += (v.tPhi - v.phi) * k;
    v.radius += (v.tRadius - v.radius) * k;

    var rs = this.uniforms.uRs.value;
    this.minRadius = Math.max(3.4 * rs, 2.2);
    v.tRadius = clamp(v.tRadius, this.minRadius, this.maxRadius);
    v.radius = clamp(v.radius, this.minRadius * 0.8, this.maxRadius * 1.2);

    var sp = Math.sin(v.phi);
    this.camera.position.set(
      v.radius * sp * Math.cos(v.theta),
      v.radius * Math.cos(v.phi),
      v.radius * sp * Math.sin(v.theta)
    );
    this.camera.lookAt(0, 0, 0);
    this.camera.updateMatrixWorld();
  };

  /* ---------------- 渲染 ---------------- */
  Engine.prototype._pass = function (material, target) {
    this.quadMesh.material = material;
    this.renderer.setRenderTarget(target);
    this.renderer.render(this.quadScene, this.quadCam);
  };

  Engine.prototype.renderFrame = function () {
    var U = this.uniforms;
    U.uTime.value = this.elapsed;
    U.uPhase.value = this.diskPhase;
    U.uCamWorld.value.copy(this.camera.matrixWorld);
    U.uCamPos.value.copy(this.camera.position);
    U.uTanHalfFov.value = Math.tan(this.camera.fov * Math.PI / 360);
    this.compositeMat.uniforms.uTime.value = this.elapsed;

    /* 1. 黑洞测地线渲染 → HDR 场景 */
    this._pass(this.blackholeMat, this.sceneRT);

    /* 2. 亮通提取 → mip0 */
    this.brightMat.uniforms.tInput.value = this.sceneRT.texture;
    this._pass(this.brightMat, this.mips[0].a);

    /* 3. 三级模糊链 */
    for (var i = 0; i < 3; i++) {
      var m = this.mips[i];
      if (i > 0) {
        var prev = this.mips[i - 1];
        this.copyMat.uniforms.tInput.value = prev.a.texture;
        this.copyMat.uniforms.uTexel.value.set(1 / prev.w, 1 / prev.h);
        this._pass(this.copyMat, m.a);
      }
      this.blurMat.uniforms.tInput.value = m.a.texture;
      this.blurMat.uniforms.uDir.value.set(m.radius / m.w, 0);
      this._pass(this.blurMat, m.b);
      this.blurMat.uniforms.tInput.value = m.b.texture;
      this.blurMat.uniforms.uDir.value.set(0, m.radius / m.h);
      this._pass(this.blurMat, m.a);
    }

    /* 4. 合成输出 */
    var cu = this.compositeMat.uniforms;
    cu.tScene.value = this.sceneRT.texture;
    cu.tB0.value = this.mips[0].a.texture;
    cu.tB1.value = this.mips[1].a.texture;
    cu.tB2.value = this.mips[2].a.texture;
    this._pass(this.compositeMat, null);
  };

  /* ---------------- 主循环 ---------------- */
  Engine.prototype.start = function () {
    var self = this;
    this.clock = new THREE.Clock();
    this._firstFrameDone = false;

    function tick() {
      if (self.disposed) return;
      self.raf = requestAnimationFrame(tick);
      if (self.contextLost) return;

      var rawDt = self.clock.getDelta();
      var dt = Math.min(rawDt, 0.05);
      self.elapsed += dt;
      if (!self.paused) {
        self.simTime += dt;
        self.diskPhase += dt * self.diskSpeed;
      }

      self._updateControls(dt);
      self.renderFrame();

      /* 帧率统计：用真实时间，低帧率下读数依然准确 */
      self._fpsAcc += rawDt;
      self._fpsFrames++;
      if (self._fpsAcc >= 0.5) {
        self.fps = self._fpsFrames / self._fpsAcc;
        self._fpsAcc = 0;
        self._fpsFrames = 0;
      }
      self._adaptTimer += rawDt;
      /* 自适应分辨率：拖拽期间绝不降分辨率，保证观察流畅 */
      if (self.autoRes && !self.dragging && self._adaptTimer > 1.6) {
        self._adaptTimer = 0;
        if (self.fps < 26 && self.adaptiveScale > 0.5) {
          self.adaptiveScale = Math.max(0.5, self.adaptiveScale - 0.12);
          self.resize();
        } else if (self.fps > 56 && self.adaptiveScale < 1) {
          self.adaptiveScale = Math.min(1, self.adaptiveScale + 0.08);
          self.resize();
        }
      }

      /* 截图：渲染完成后同帧读取，无需 preserveDrawingBuffer */
      if (self.shotCb) {
        var cb = self.shotCb;
        self.shotCb = null;
        try { cb(null, self.canvas.toDataURL('image/png')); }
        catch (err) { cb(err, null); }
      }

      if (!self._firstFrameDone) {
        self._firstFrameDone = true;
        if (self.onFirstFrame) self.onFirstFrame();
      }
      if (self.onFrame) self.onFrame(dt);
    }
    tick();
  };

  Engine.prototype.dispose = function () {
    this.disposed = true;
    if (this.raf) cancelAnimationFrame(this.raf);
    this.sceneRT.dispose();
    for (var i = 0; i < 3; i++) { this.mips[i].a.dispose(); this.mips[i].b.dispose(); }
    this.blackholeMat.dispose();
    this.brightMat.dispose();
    this.blurMat.dispose();
    this.copyMat.dispose();
    this.compositeMat.dispose();
    this.quadGeo.dispose();
    this.renderer.dispose();
  };

  window.BH = window.BH || {};
  window.BH.Engine = Engine;
  window.BH.QUALITY = QUALITY;
})();
/**
 * engine.js —— WebGL2 渲染引擎
 * 零依赖。负责：着色器编译、FBO 管理、全屏 pass 调度、渲染循环。
 *
 * 渲染管线：
 *   Pass 1  blackhole   全屏测地线光线步进（HDR RGBA16F）
 *   Pass 2  bright      亮度提取（1/2 分辨率）
 *   Pass 3  blur ×3     可分离高斯，逐级 downsample 到 1/2, 1/4, 1/8
 *   Pass 4  composite   多级辉光合成 + 色调映射 + gamma + 颗粒 + 暗角
 */

const VERT_SRC = `#version 300 es
precision highp float;
in vec2 aPos;
out vec2 vUv;
void main() {
  vUv = aPos * 0.5 + 0.5;
  gl_Position = vec4(aPos, 0.0, 1.0);
}`;

/** 小型 GL 工具集 */
class GLUtils {
  static compile(gl, type, src, label = '') {
    const sh = gl.createShader(type);
    gl.shaderSource(sh, src);
    gl.compileShader(sh);
    if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) {
      const log = gl.getShaderInfoLog(sh);
      gl.deleteShader(sh);
      throw new Error(`Shader compile failed [${label}]:\n${log}`);
    }
    return sh;
  }

  static program(gl, fragSrc, label = '') {
    const vs = GLUtils.compile(gl, gl.VERTEX_SHADER, VERT_SRC, label + ':vert');
    const fs = GLUtils.compile(gl, gl.FRAGMENT_SHADER, fragSrc, label + ':frag');
    const p = gl.createProgram();
    gl.attachShader(p, vs);
    gl.attachShader(p, fs);
    gl.linkProgram(p);
    gl.deleteShader(vs);
    gl.deleteShader(fs);
    if (!gl.getProgramParameter(p, gl.LINK_STATUS)) {
      const log = gl.getProgramInfoLog(p);
      gl.deleteProgram(p);
      throw new Error(`Program link failed [${label}]:\n${log}`);
    }
    // 缓存 uniform / attribute 位置
    p.u = {};
    p.a = {};
    const nU = gl.getProgramParameter(p, gl.ACTIVE_UNIFORMS);
    for (let i = 0; i < nU; i++) {
      const info = gl.getActiveUniform(p, i);
      const name = info.name.replace(/\[0\]$/, '');
      p.u[name] = gl.getUniformLocation(p, name);
    }
    const nA = gl.getProgramParameter(p, gl.ACTIVE_ATTRIBUTES);
    for (let i = 0; i < nA; i++) {
      const info = gl.getActiveAttrib(p, i);
      p.a[info.name] = gl.getAttribLocation(p, info.name);
    }
    return p;
  }
}

/** 离屏渲染目标 */
class RenderTarget {
  constructor(gl, w, h, { float = true } = {}) {
    this.gl = gl;
    this.float = float;
    this.tex = null;
    this.fbo = null;
    this.resize(w, h);
  }

  resize(w, h) {
    const gl = this.gl;
    w = Math.max(1, Math.floor(w));
    h = Math.max(1, Math.floor(h));
    if (this.tex && this.width === w && this.height === h) return;
    this.dispose();
    this.width = w;
    this.height = h;

    this.tex = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, this.tex);
    gl.texImage2D(gl.TEXTURE_2D, 0, this.float ? gl.RGBA16F : gl.RGBA8, w, h, 0,
                  gl.RGBA, this.float ? gl.HALF_FLOAT : gl.UNSIGNED_BYTE, null);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);

    this.fbo = gl.createFramebuffer();
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.fbo);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D,
                            this.tex, 0);
    const status = gl.checkFramebufferStatus(gl.FRAMEBUFFER);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    if (status !== gl.FRAMEBUFFER_COMPLETE) {
      throw new Error('帧缓冲不完整（FBO incomplete）: 0x' + status.toString(16));
    }
  }

  bind() {
    const gl = this.gl;
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.fbo);
    gl.viewport(0, 0, this.width, this.height);
  }

  dispose() {
    const gl = this.gl;
    if (this.tex) gl.deleteTexture(this.tex);
    if (this.fbo) gl.deleteFramebuffer(this.fbo);
    this.tex = null;
    this.fbo = null;
  }
}

/** 轨道相机 */
class OrbitCamera {
  constructor(canvas) {
    this.canvas = canvas;
    this.theta = Math.PI * 0.28;
    this.phi = Math.PI * 0.5 - 0.20;
    this.distance = 20;
    this.fov = 55 * Math.PI / 180;
    this.minDistance = 3.4;
    this.maxDistance = 260;
    this.smoothTheta = this.theta;
    this.smoothPhi = this.phi;
    this.smoothDistance = this.distance;
    this.autoRotate = true;
    this.autoRotateSpeed = 0.05;
    this.damping = 0.14;

    this._dragging = false;
    this._lastX = 0;
    this._lastY = 0;
    this._pointers = new Map();
    this._pinchDist = 0;

    this._bind();
  }

  _bind() {
    const c = this.canvas;
    c.style.touchAction = 'none';

    c.addEventListener('pointerdown', (e) => {
      try { c.setPointerCapture(e.pointerId); } catch (_) {}
      this._pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (this._pointers.size === 1) {
        this._dragging = true;
        this._lastX = e.clientX;
        this._lastY = e.clientY;
      } else if (this._pointers.size === 2) {
        const pts = [...this._pointers.values()];
        this._pinchDist = Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y);
      }
      c.style.cursor = 'grabbing';
    });

    c.addEventListener('pointermove', (e) => {
      if (!this._pointers.has(e.pointerId)) return;
      this._pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });

      if (this._pointers.size === 2) {
        const pts = [...this._pointers.values()];
        const d = Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y);
        if (this._pinchDist > 0) {
          const scale = this._pinchDist / Math.max(d, 1);
          this.distance = this._clampDistance(this.distance * scale);
        }
        this._pinchDist = d;
        return;
      }

      if (!this._dragging) return;
      const dx = e.clientX - this._lastX;
      const dy = e.clientY - this._lastY;
      this._lastX = e.clientX;
      this._lastY = e.clientY;
      this.theta -= dx * 0.0055;
      this.phi -= dy * 0.0055;
      this.phi = Math.min(Math.PI - 0.02, Math.max(0.02, this.phi));
      this.autoRotate = false;
      if (this.onUserInteract) this.onUserInteract();
    });

    const end = (e) => {
      this._pointers.delete(e.pointerId);
      if (this._pointers.size < 2) this._pinchDist = 0;
      if (this._pointers.size === 0) this._dragging = false;
      c.style.cursor = 'grab';
    };
    c.addEventListener('pointerup', end);
    c.addEventListener('pointercancel', end);
    c.addEventListener('lostpointercapture', end);

    c.addEventListener('wheel', (e) => {
      e.preventDefault();
      const f = Math.exp(e.deltaY * 0.0012);
      this.distance = this._clampDistance(this.distance * f);
      if (this.onUserInteract) this.onUserInteract();
    }, { passive: false });

    c.addEventListener('dblclick', () => {
      this.autoRotate = !this.autoRotate;
      if (this.onAutoRotateChange) this.onAutoRotateChange(this.autoRotate);
    });

    c.style.cursor = 'grab';
  }

  _clampDistance(d) {
    return Math.min(this.maxDistance, Math.max(this.minDistance, d));
  }

  /** 每帧更新平滑值，返回相机位置与正交基 */
  update(dt) {
    if (this.autoRotate) this.theta += this.autoRotateSpeed * dt;
    const k = 1 - Math.pow(1 - this.damping, Math.max(dt, 0.0001) * 60);
    this.smoothTheta += (this.theta - this.smoothTheta) * k;
    this.smoothPhi += (this.phi - this.smoothPhi) * k;
    this.smoothDistance += (this.distance - this.smoothDistance) * k;

    const sp = Math.sin(this.smoothPhi);
    const cp = Math.cos(this.smoothPhi);
    const st = Math.sin(this.smoothTheta);
    const ct = Math.cos(this.smoothTheta);
    const d = this.smoothDistance;

    const pos = [d * sp * st, d * cp, d * sp * ct];
    return { pos, basis: this._basis(pos) };
  }

  _basis(pos) {
    const [x, y, z] = pos;
    const len = Math.hypot(x, y, z) || 1;
    const f = [-x / len, -y / len, -z / len];       // forward（指向目标）
    const wu = [0, 1, 0];
    let r = [f[1] * wu[2] - f[2] * wu[1],
             f[2] * wu[0] - f[0] * wu[2],
             f[0] * wu[1] - f[1] * wu[0]];
    const rl = Math.hypot(r[0], r[1], r[2]) || 1;
    r = [r[0] / rl, r[1] / rl, r[2] / rl];           // right
    const u = [r[1] * f[2] - r[2] * f[1],
               r[2] * f[0] - r[0] * f[2],
               r[0] * f[1] - r[1] * f[0]];           // up
    return new Float32Array([r[0], r[1], r[2], u[0], u[1], u[2],
                             f[0], f[1], f[2]]);
  }

  setSpherical(theta, phi, distance) {
    this.theta = theta;
    this.phi = Math.min(Math.PI - 0.02, Math.max(0.02, phi));
    if (distance !== undefined) this.distance = this._clampDistance(distance);
  }
}

/** 主引擎 */
export class BlackHoleEngine {
  constructor(canvas) {
    this.canvas = canvas;
    const gl = canvas.getContext('webgl2', {
      alpha: false,
      antialias: false,
      depth: false,
      stencil: false,
      powerPreference: 'high-performance',
      preserveDrawingBuffer: false,
    });
    if (!gl) throw new Error('WebGL2 不可用，请使用现代浏览器。');
    this.gl = gl;
    gl.disable(gl.DEPTH_TEST);
    gl.disable(gl.BLEND);

    // 全屏三角形
    this.vao = gl.createVertexArray();
    gl.bindVertexArray(this.vao);
    const buf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(gl.ARRAY_BUFFER,
                  new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
    gl.bindVertexArray(null);

    this.floatExt = gl.getExtension('EXT_color_buffer_float');
    this.floatLinear = gl.getExtension('OES_texture_float_linear');

    this.programs = {};
    this.sceneRT = null;
    this.brightRT = null;
    this.blurA = [];
    this.blurB = [];
    this.width = 1;
    this.height = 1;
    this.dpr = 1;
    this.renderScale = 1.0;

    this.camera = new OrbitCamera(canvas);
    this.params = null;
    this.onFrame = null;
    this.onError = null;
    this.running = false;
    this._lastTime = 0;
    this._raf = 0;
    this._time = 0;
    this.frameCount = 0;
    this.fps = 0;
    this._fpsAccum = 0;
    this._fpsFrames = 0;
  }

  _loadPrograms() {
    const gl = this.gl;
    const load = async (name) => {
      const res = await fetch(`shaders/${name}.frag`);
      if (!res.ok) throw new Error(`无法加载着色器 ${name}.frag (HTTP ${res.status})`);
      const src = await res.text();
      this.programs[name] = GLUtils.program(gl, src, name);
    };
    return Promise.all([load('blackhole'), load('composite'),
                        load('bright'), load('blur')]);
  }

  async init() {
    await this._loadPrograms();
    this.resize();
    return this;
  }

  setParams(p) { this.params = p; }

  resize() {
    const gl = this.gl;
    const rect = this.canvas.getBoundingClientRect();
    const dpr = Math.min(window.devicePixelRatio || 1,
                         this.params?.maxPixelRatio ?? 2);
    this.dpr = dpr;
    const w = Math.max(1, Math.floor(rect.width * dpr * this.renderScale));
    const h = Math.max(1, Math.floor(rect.height * dpr * this.renderScale));

    if (this.canvas.width !== w || this.canvas.height !== h) {
      this.canvas.width = w;
      this.canvas.height = h;
    }
    this.width = w;
    this.height = h;

    const levels = [[w >> 1, h >> 1], [w >> 2, h >> 2], [w >> 3, h >> 3]];
    if (!this.sceneRT) this.sceneRT = new RenderTarget(gl, w, h);
    else this.sceneRT.resize(w, h);
    if (!this.brightRT) this.brightRT = new RenderTarget(gl, levels[0][0], levels[0][1]);
    else this.brightRT.resize(levels[0][0], levels[0][1]);
    for (let i = 0; i < 3; i++) {
      if (!this.blurA[i]) this.blurA[i] = new RenderTarget(gl, levels[i][0], levels[i][1]);
      else this.blurA[i].resize(levels[i][0], levels[i][1]);
      if (!this.blurB[i]) this.blurB[i] = new RenderTarget(gl, levels[i][0], levels[i][1]);
      else this.blurB[i].resize(levels[i][0], levels[i][1]);
    }
  }

  _quad(prog) {
    const gl = this.gl;
    gl.useProgram(prog);
    gl.bindVertexArray(this.vao);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
    gl.bindVertexArray(null);
  }

  render(dt) {
    const gl = this.gl;
    const p = this.params;
    if (!p || !this.programs.blackhole) return;

    this._time += dt;
    const { pos, basis } = this.camera.update(dt);

    // ---------- Pass 1: 黑洞 ----------
    this.sceneRT.bind();
    const bh = this.programs.blackhole;
    gl.useProgram(bh);
    gl.uniform2f(bh.u.uResolution, this.width, this.height);
    gl.uniform1f(bh.u.uTime, this._time);
    gl.uniform3f(bh.u.uCamPos, pos[0], pos[1], pos[2]);
    gl.uniformMatrix3fv(bh.u.uCamBasis, false, basis);
    gl.uniform1f(bh.u.uFov, this.camera.fov);
    gl.uniform1f(bh.u.uRs, p.rs);
    gl.uniform1f(bh.u.uSpin, p.spin);
    gl.uniform1f(bh.u.uDiskInner, p.diskInner);
    gl.uniform1f(bh.u.uDiskOuter, p.diskOuter);
    gl.uniform1f(bh.u.uDiskThickness, p.diskThickness);
    gl.uniform1f(bh.u.uDiskTemp, p.diskTemp);
    gl.uniform1f(bh.u.uDiskOpacity, p.diskOpacity);
    gl.uniform1f(bh.u.uDiskTilt, p.diskTilt);
    gl.uniform1f(bh.u.uDopplerBeam, p.dopplerBeam);
    gl.uniform1f(bh.u.uGravRedshift, p.gravRedshift);
    gl.uniform1f(bh.u.uLensing, p.lensing);
    gl.uniform1f(bh.u.uEinsteinRing, p.einsteinRing);
    gl.uniform1f(bh.u.uVolumetric, p.volumetric);
    gl.uniform1f(bh.u.uExposure, p.exposure);
    gl.uniform1i(bh.u.uDebug, p.debug | 0);
    gl.uniform1f(bh.u.uStarDensity, p.starDensity);
    gl.uniform1f(bh.u.uStarBrightness, p.starBrightness);
    gl.uniform1f(bh.u.uSteps, p.steps);
    this._quad(bh);

    // ---------- Pass 2: 亮度提取（写入独立的 brightRT，尺寸 = 1/2）----------
    const bright = this.programs.bright;
    this.brightRT.bind();
    gl.useProgram(bright);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, this.sceneRT.tex);
    gl.uniform1i(bright.u.uScene, 0);
    gl.uniform1f(bright.u.uThreshold, p.bloomThreshold);
    gl.uniform1f(bright.u.uKnee, 0.6);
    this._quad(bright);

    // ---------- Pass 3: 多级可分离高斯 ----------
    // 第 0 级：brightRT → (H) blurB[0] → (V) blurA[0]
    // 第 1 级：blurA[0] → (H) blurB[1] → (V) blurA[1]
    // 第 2 级：blurA[1] → (H) blurB[2] → (V) blurA[2]
    const blur = this.programs.blur;
    gl.useProgram(blur);
    gl.uniform1i(blur.u.uSrc, 0);
    gl.activeTexture(gl.TEXTURE0);

    let src = this.brightRT.tex;
    for (let i = 0; i < 3; i++) {
      // 水平：src → blurB[i]
      this.blurB[i].bind();
      gl.bindTexture(gl.TEXTURE_2D, src);
      gl.uniform2f(blur.u.uDirection, 1.0 / this.blurA[i].width, 0);
      this._quad(blur);
      // 垂直：blurB[i] → blurA[i]
      this.blurA[i].bind();
      gl.bindTexture(gl.TEXTURE_2D, this.blurB[i].tex);
      gl.uniform2f(blur.u.uDirection, 0, 1.0 / this.blurA[i].height);
      this._quad(blur);
      // 下一级从本级结果继续 downsample
      src = this.blurA[i].tex;
    }

    // ---------- Pass 4: 合成 ----------
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.viewport(0, 0, this.width, this.height);
    const comp = this.programs.composite;
    gl.useProgram(comp);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, this.sceneRT.tex);
    gl.uniform1i(comp.u.uScene, 0);
    gl.activeTexture(gl.TEXTURE1);
    gl.bindTexture(gl.TEXTURE_2D, this.blurA[0].tex);
    gl.uniform1i(comp.u.uBloom1, 1);
    gl.activeTexture(gl.TEXTURE2);
    gl.bindTexture(gl.TEXTURE_2D, this.blurA[1].tex);
    gl.uniform1i(comp.u.uBloom2, 2);
    gl.activeTexture(gl.TEXTURE3);
    gl.bindTexture(gl.TEXTURE_2D, this.blurA[2].tex);
    gl.uniform1i(comp.u.uBloom3, 3);
    gl.uniform2f(comp.u.uResolution, this.width, this.height);
    gl.uniform1f(comp.u.uBloomStrength, p.bloomStrength);
    gl.uniform1f(comp.u.uExposure, p.exposure);
    gl.uniform1f(comp.u.uGrain, p.grain);
    gl.uniform1f(comp.u.uVignette, p.vignette);
    gl.uniform1f(comp.u.uChroma, p.chroma);
    gl.uniform1f(comp.u.uTime, this._time);
    this._quad(comp);

    // FPS
    this.frameCount++;
    this._fpsAccum += dt;
    this._fpsFrames++;
    if (this._fpsAccum >= 0.5) {
      this.fps = this._fpsFrames / this._fpsAccum;
      this._fpsAccum = 0;
      this._fpsFrames = 0;
    }
    if (this.onFrame) this.onFrame(this);
  }

  start() {
    if (this.running) return;
    this.running = true;
    this._lastTime = performance.now();
    const loop = (now) => {
      if (!this.running) return;
      const dt = Math.min((now - this._lastTime) / 1000, 0.1);
      this._lastTime = now;
      try {
        this.render(dt);
      } catch (err) {
        this.running = false;
        this.onError?.(err);
        return;
      }
      this._raf = requestAnimationFrame(loop);
    };
    this._raf = requestAnimationFrame(loop);
  }

  stop() {
    this.running = false;
    if (this._raf) cancelAnimationFrame(this._raf);
  }

  /** 立即重绘并返回 PNG dataURL */
  snapshot() {
    this.render(0.0001);
    return this.canvas.toDataURL('image/png');
  }
}

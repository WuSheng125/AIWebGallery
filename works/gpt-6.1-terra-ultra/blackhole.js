(() => {
  'use strict';

  // A compact, self-contained ray-bending renderer. The accretion disk is sampled
  // whenever a light ray crosses its plane, including crossings behind the hole.
  const vertexSource = `
    attribute vec2 a_position;
    void main() { gl_Position = vec4(a_position, 0.0, 1.0); }
  `;

  const fragmentSource = `
    precision highp float;
    uniform vec2 u_resolution;
    uniform float u_time;
    uniform float u_mass;
    uniform float u_brightness;
    uniform float u_temperature;
    uniform float u_lens;
    uniform float u_speed;
    uniform float u_stars;
    uniform float u_azimuth;
    uniform float u_elevation;

    #define PI 3.14159265359

    float hash13(vec3 p) {
      p = fract(p * 0.1031);
      p += dot(p, p.yzx + 33.33);
      return fract((p.x + p.y) * p.z);
    }
    float hash12(vec2 p) {
      vec3 p3 = fract(vec3(p.xyx) * 0.1031);
      p3 += dot(p3, p3.yzx + 33.33);
      return fract((p3.x + p3.y) * p3.z);
    }
    float noise(vec2 p) {
      vec2 i = floor(p), f = fract(p);
      f = f * f * (3.0 - 2.0 * f);
      return mix(mix(hash12(i), hash12(i + vec2(1.0, 0.0)), f.x),
                 mix(hash12(i + vec2(0.0, 1.0)), hash12(i + vec2(1.0, 1.0)), f.x), f.y);
    }
    float fbm(vec2 p) {
      float n = 0.0, amp = 0.5;
      for (int i = 0; i < 4; i++) {
        n += amp * noise(p);
        p = mat2(1.6, -1.2, 1.2, 1.6) * p + 7.3;
        amp *= 0.5;
      }
      return n;
    }
    vec3 starLayer(vec3 direction, float scale, float threshold) {
      // A spherical sky grid gives every star a two-dimensional footprint;
      // a 3-D cell distance would make most stars thinner than a pixel.
      vec2 sky = vec2(atan(direction.z, direction.x) / (2.0 * PI) + 0.5,
                      asin(clamp(direction.y, -1.0, 1.0)) / PI + 0.5);
      vec2 p = sky * vec2(scale, scale * 0.5);
      vec2 cell = floor(p), local = fract(p);
      float h = hash12(cell);
      vec2 offset = vec2(hash12(cell + 2.7), hash12(cell + 18.4));
      float d = length(local - (0.14 + 0.72 * offset));
      float size = mix(0.10, 0.25, pow(hash12(cell + 5.6), 3.0));
      float light = (1.0 - smoothstep(0.0, size, d)) * step(threshold, h);
      float glow = exp(-d * 12.0) * step(0.997, h) * 0.35;
      vec3 color = mix(vec3(0.58, 0.70, 1.0), vec3(1.0, 0.82, 0.62), hash12(cell + 3.1));
      return color * (light * (0.9 + 2.5 * h * h) + glow);
    }
    vec3 background(vec3 direction) {
      direction = normalize(direction);
      float density = mix(0.9995, 0.960, u_stars);
      vec3 stars = starLayer(direction, 400.0, density);
      stars += starLayer(direction, 650.0, mix(0.9998, 0.977, u_stars)) * 0.7;
      // A very faint galactic haze provides depth without competing with the disk.
      float band = exp(-abs(direction.y + 0.18 * direction.x) * 9.0);
      float dust = fbm(direction.xz * 8.0 + direction.y * 2.0);
      vec3 haze = vec3(0.014, 0.020, 0.035) * band * (0.25 + dust);
      return vec3(0.0015, 0.0025, 0.006) + stars + haze;
    }
    vec3 diskColor(vec3 p, vec3 ray, float inner, float outer) {
      float r = length(p.xz);
      float edge = smoothstep(inner, inner + 0.32, r) * (1.0 - smoothstep(outer - 0.8, outer, r));
      float angle = atan(p.z, p.x);
      float spin = u_time * mix(0.0, 0.22, u_speed);
      // Noise is evaluated in polar coordinates to make long turbulent orbital strands.
      float warp = fbm(vec2(r * 1.7, angle * 2.4 - spin * 0.3));
      float streak = fbm(vec2(r * 5.2 + warp * 1.7, angle * 2.0 - spin / sqrt(r)));
      float fine = noise(vec2(r * 24.0 + warp * 2.0, angle * 5.0 - spin * 0.5));
      float filaments = 0.45 + 0.7 * streak + 0.32 * fine;
      filaments *= 0.77 + 0.23 * sin(r * 34.0 + warp * 4.0);
      float heat = pow(clamp((outer - r) / (outer - inner), 0.0, 1.0), 0.55);
      vec3 orange = vec3(1.25, 0.24, 0.035);
      vec3 gold = vec3(1.6, 0.65, 0.19);
      vec3 whiteHot = mix(vec3(2.0, 1.28, 0.66), vec3(1.65, 1.7, 2.0), u_temperature * 0.6);
      vec3 color = mix(orange, gold, smoothstep(0.05, 0.65, heat));
      color = mix(color, whiteHot, smoothstep(0.35, 1.0, heat) * (0.35 + u_temperature * 0.65));
      vec3 tangent = normalize(vec3(-p.z, 0.0, p.x));
      float doppler = clamp(1.0 + dot(tangent, -ray) * 0.62, 0.45, 1.65);
      float power = edge * filaments * (0.30 + 1.25 * heat) * doppler * mix(0.25, 2.0, u_brightness);
      return color * power;
    }

    void main() {
      vec2 uv = (gl_FragCoord.xy - 0.5 * u_resolution) / u_resolution.y;
      float ce = cos(u_elevation), se = sin(u_elevation);
      vec3 camera = 12.0 * vec3(sin(u_azimuth) * ce, se, cos(u_azimuth) * ce);
      vec3 forward = normalize(-camera);
      vec3 right = normalize(cross(forward, vec3(0.0, 1.0, 0.0)));
      vec3 up = normalize(cross(right, forward));
      vec3 ray = normalize(forward + 1.08 * (uv.x * right + uv.y * up));
      vec3 pos = camera;
      float horizon = mix(0.67, 1.05, u_mass);
      float inner = horizon * 1.52;
      float outer = horizon * 5.4;
      vec3 accumulated = vec3(0.0);
      float transmission = 1.0;
      float nearest = 100.0;
      float swallowed = 0.0;
      float escaped = 0.0;
      float bend = mix(0.14, 1.55, u_lens) * horizon;

      // Adaptive steps retain detail around the photon sphere while keeping the
      // background inexpensive. All rays share a fixed upper iteration bound.
      for (int i = 0; i < 112; i++) {
        float radius = length(pos);
        nearest = min(nearest, radius);
        if (radius < horizon) { swallowed = 1.0; break; }
        if (radius > 17.0) { escaped = 1.0; break; }
        float stepSize = clamp(radius * 0.085, 0.075, 0.75);
        vec3 old = pos;
        // Only perpendicular acceleration is used so the speed remains stable.
        vec3 radial = -pos / max(radius, 0.001);
        ray = normalize(ray + (radial - ray * dot(radial, ray)) * bend * stepSize / (radius * radius));
        pos += ray * stepSize;
        if (old.y * pos.y < 0.0) {
          float t = old.y / (old.y - pos.y);
          vec3 hit = mix(old, pos, t);
          float r = length(hit.xz);
          if (r > inner && r < outer) {
            vec3 emission = diskColor(hit, ray, inner, outer);
            accumulated += emission * transmission;
            transmission *= 0.28;
          }
        }
      }
      vec3 color = accumulated;
      if (swallowed < 0.5) color += background(ray) * transmission;
      // The subtle photon-ring glow makes the edge legible against the dark sky.
      float ring = exp(-abs(nearest - horizon * 1.32) * 14.0 / horizon);
      color += vec3(1.0, 0.32, 0.08) * ring * 0.12 * (0.35 + u_brightness);
      color = max(color, 0.0);
      color = vec3(1.0) - exp(-color * 1.25);
      color = pow(color, vec3(0.82));
      gl_FragColor = vec4(color, 1.0);
    }
  `;

  class BlackHoleRenderer {
    constructor(canvas) {
      if (!canvas) throw new Error('A canvas is required');
      this.canvas = canvas;
      this.gl = canvas.getContext('webgl', { alpha: false, antialias: false, powerPreference: 'high-performance' });
      if (!this.gl) throw new Error('WebGL is not available');
      this.params = { mass: 0.5, diskBrightness: 0.7, diskTemperature: 0.55, lensStrength: 0.7, rotationSpeed: 0.45, starDensity: 0.65 };
      this.azimuth = 0.0;
      this.elevation = 0.18;
      this.paused = false;
      this.time = 0;
      this.lastFrame = 0;
      this.dragging = false;
      this.destroyed = false;
      const gl = this.gl;
      const compile = (type, source) => {
        const shader = gl.createShader(type);
        gl.shaderSource(shader, source);
        gl.compileShader(shader);
        if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(shader));
        return shader;
      };
      const vs = compile(gl.VERTEX_SHADER, vertexSource);
      const fs = compile(gl.FRAGMENT_SHADER, fragmentSource);
      this.program = gl.createProgram();
      gl.attachShader(this.program, vs);
      gl.attachShader(this.program, fs);
      gl.linkProgram(this.program);
      if (!gl.getProgramParameter(this.program, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(this.program));
      gl.deleteShader(vs);
      gl.deleteShader(fs);
      gl.useProgram(this.program);
      this.buffer = gl.createBuffer();
      gl.bindBuffer(gl.ARRAY_BUFFER, this.buffer);
      gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, -1, 1, 1, -1, 1, 1]), gl.STATIC_DRAW);
      const position = gl.getAttribLocation(this.program, 'a_position');
      gl.enableVertexAttribArray(position);
      gl.vertexAttribPointer(position, 2, gl.FLOAT, false, 0, 0);
      this.uniforms = {};
      ['resolution', 'time', 'mass', 'brightness', 'temperature', 'lens', 'speed', 'stars', 'azimuth', 'elevation'].forEach(name => {
        this.uniforms[name] = gl.getUniformLocation(this.program, 'u_' + name);
      });
      this.onPointerDown = event => {
        if (event.button !== 0 && event.pointerType === 'mouse') return;
        this.dragging = true;
        this.pointerX = event.clientX;
        this.pointerY = event.clientY;
        canvas.setPointerCapture(event.pointerId);
        canvas.classList.add('is-dragging');
      };
      this.onPointerMove = event => {
        if (!this.dragging) return;
        this.azimuth -= (event.clientX - this.pointerX) * 0.006;
        this.elevation = Math.max(-1.18, Math.min(1.18, this.elevation + (event.clientY - this.pointerY) * 0.006));
        this.pointerX = event.clientX;
        this.pointerY = event.clientY;
      };
      this.onPointerUp = () => { this.dragging = false; canvas.classList.remove('is-dragging'); };
      canvas.addEventListener('pointerdown', this.onPointerDown);
      canvas.addEventListener('pointermove', this.onPointerMove);
      canvas.addEventListener('pointerup', this.onPointerUp);
      canvas.addEventListener('pointercancel', this.onPointerUp);
      this.resize = this.resize.bind(this);
      window.addEventListener('resize', this.resize);
      this.observer = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(this.resize) : null;
      if (this.observer) this.observer.observe(canvas);
      this.resize();
      this.frame = this.frame.bind(this);
      this.raf = requestAnimationFrame(this.frame);
    }
    resize() {
      const rect = this.canvas.getBoundingClientRect();
      // Ray tracing is intentionally rendered below native resolution on very
      // dense screens, with CSS scaling preserving a smooth presentation.
      const ratio = Math.min(window.devicePixelRatio || 1, 1.0);
      const maxPixels = 1000000;
      const scale = Math.min(ratio, Math.sqrt(maxPixels / Math.max(1, rect.width * rect.height)));
      const width = Math.max(1, Math.round(rect.width * scale));
      const height = Math.max(1, Math.round(rect.height * scale));
      if (this.canvas.width !== width || this.canvas.height !== height) {
        this.canvas.width = width;
        this.canvas.height = height;
        this.gl.viewport(0, 0, width, height);
      }
    }
    setParams(params) {
      Object.keys(this.params).forEach(key => {
        if (params[key] !== undefined && Number.isFinite(Number(params[key]))) this.params[key] = Math.max(0, Math.min(1, Number(params[key])));
      });
    }
    setPaused(value) { this.paused = !!value; }
    resetView() { this.azimuth = 0.0; this.elevation = 0.18; }
    frame(now) {
      if (this.destroyed) return;
      const delta = this.lastFrame ? Math.min(0.05, (now - this.lastFrame) / 1000) : 0;
      this.lastFrame = now;
      if (!this.paused) this.time += delta;
      const gl = this.gl, u = this.uniforms, p = this.params;
      gl.useProgram(this.program);
      gl.uniform2f(u.resolution, this.canvas.width, this.canvas.height);
      gl.uniform1f(u.time, this.time);
      gl.uniform1f(u.mass, p.mass);
      gl.uniform1f(u.brightness, p.diskBrightness);
      gl.uniform1f(u.temperature, p.diskTemperature);
      gl.uniform1f(u.lens, p.lensStrength);
      gl.uniform1f(u.speed, p.rotationSpeed);
      gl.uniform1f(u.stars, p.starDensity);
      gl.uniform1f(u.azimuth, this.azimuth);
      gl.uniform1f(u.elevation, this.elevation);
      gl.drawArrays(gl.TRIANGLES, 0, 6);
      this.raf = requestAnimationFrame(this.frame);
    }
    dispose() {
      this.destroyed = true;
      cancelAnimationFrame(this.raf);
      window.removeEventListener('resize', this.resize);
      if (this.observer) this.observer.disconnect();
      this.canvas.removeEventListener('pointerdown', this.onPointerDown);
      this.canvas.removeEventListener('pointermove', this.onPointerMove);
      this.canvas.removeEventListener('pointerup', this.onPointerUp);
      this.canvas.removeEventListener('pointercancel', this.onPointerUp);
      this.gl.deleteBuffer(this.buffer);
      this.gl.deleteProgram(this.program);
    }
  }
  window.BlackHoleRenderer = BlackHoleRenderer;
})();

"use strict";

(() => {
  const CRITICAL_IMPACT = 3 * Math.sqrt(3);
  const MAX_IMPACT = 150;
  const MAX_ANGLE = 15;
  const IMPACT_SAMPLES = 512;
  const ANGLE_SAMPLES = 768;
  const IMPACT_MARGIN = 0.0004;
  const MIN_IMPACT = 0.045;
  const PI = Math.PI;
  let rayTable;

  // 以偏角 φ 为自变量，在无穷远处反向积分零测地线 u″ = 3u² − u，u = r_g / r。
  // 捕获与逃逸的路径各占一半纹理，临界冲量附近提高采样密度。
  function buildRayTable() {
    const width = IMPACT_SAMPLES * 2;
    const table = new Float32Array(width * ANGLE_SAMPLES * 2);
    const step = MAX_ANGLE / (ANGLE_SAMPLES - 1);
    const acceleration = (u) => u * (3 * u - 1);

    for (let column = 0; column < width; column++) {
      const escapes = column >= IMPACT_SAMPLES;
      const t = (column % IMPACT_SAMPLES) / (IMPACT_SAMPLES - 1);
      const impact = escapes
        ? CRITICAL_IMPACT + IMPACT_MARGIN + (MAX_IMPACT - CRITICAL_IMPACT - IMPACT_MARGIN) * t * t
        : CRITICAL_IMPACT - IMPACT_MARGIN - (CRITICAL_IMPACT - IMPACT_MARGIN - MIN_IMPACT) * (1 - t) ** 2;
      let u = 0;
      let slope = 1 / impact;
      let end = MAX_ANGLE;
      for (let row = 1; row < ANGLE_SAMPLES; row++) {
        const u1 = slope;
        const v1 = acceleration(u);
        const u2 = slope + step * v1 / 2;
        const v2 = acceleration(u + step * u1 / 2);
        const u3 = slope + step * v2 / 2;
        const v3 = acceleration(u + step * u2 / 2);
        const u4 = slope + step * v3;
        const v4 = acceleration(u + step * u3);
        const nextU = u + step * (u1 + 2 * u2 + 2 * u3 + u4) / 6;
        slope += step * (v1 + 2 * v2 + 2 * v3 + v4) / 6;

        if (nextU >= 0.5 || nextU <= 0) {
          const boundary = escapes ? 0 : 0.5;
          end = step * (row - 1 + (boundary - u) / (nextU - u));
          if (!escapes) {
            for (let rest = row; rest < ANGLE_SAMPLES; rest++) {
              table[(rest * width + column) * 2] = 0.5;
            }
          }
          break;
        }
        u = nextU;
        table[(row * width + column) * 2] = u;
      }
      // 存储净偏折角，让远离黑洞的微弱偏折保留更多有效位。
      const endValue = escapes ? end - PI : end;
      for (let row = 0; row < ANGLE_SAMPLES; row++) {
        table[(row * width + column) * 2 + 1] = endValue;
      }
    }
    return table;
  }

  function innermostOrbit(spin) {
    const z1 = 1 + Math.cbrt(1 - spin * spin) * (Math.cbrt(1 + spin) + Math.cbrt(1 - spin));
    const z2 = Math.sqrt(3 * spin * spin + z1 * z1);
    return 3 + z2 - Math.sqrt((3 - z1) * (3 + z1 + 2 * z2));
  }

  const vertexSource = `#version 300 es
    out vec2 vUv;
    void main() {
      vec2 corner = vec2(float((gl_VertexID << 1) & 2), float(gl_VertexID & 2));
      vUv = corner;
      gl_Position = vec4(corner * 2.0 - 1.0, 0.0, 1.0);
    }
  `;

  const noiseSource = `
    float hash31(vec3 p) {
      p = fract(p * 0.1031);
      p += dot(p, p.yzx + 33.33);
      return fract((p.x + p.y) * p.z);
    }
    float noise3(vec3 p) {
      vec3 cell = floor(p);
      vec3 f = fract(p);
      f = f * f * (3.0 - 2.0 * f);
      vec4 nearPlane = vec4(
        hash31(cell), hash31(cell + vec3(1, 0, 0)),
        hash31(cell + vec3(0, 1, 0)), hash31(cell + vec3(1, 1, 0)));
      vec4 farPlane = vec4(
        hash31(cell + vec3(0, 0, 1)), hash31(cell + vec3(1, 0, 1)),
        hash31(cell + vec3(0, 1, 1)), hash31(cell + vec3(1, 1, 1)));
      vec4 samples = mix(nearPlane, farPlane, f.z);
      return mix(mix(samples.x, samples.y, f.x), mix(samples.z, samples.w, f.x), f.y);
    }
  `;

  const skySource = `#version 300 es
    precision highp float;
    in vec2 vUv;
    out vec4 outColor;
    ${noiseSource}
    const float PI = 3.14159265;
    float nebula(vec3 p) {
      return 0.53 * noise3(p)
           + 0.27 * noise3(p * 2.11 + 7.6)
           + 0.13 * noise3(p * 4.44 - 13.3)
           + 0.07 * noise3(p * 9.12 + 3.2);
    }
    void main() {
      float longitude = (vUv.x - 0.5) * 2.0 * PI;
      float latitude = (vUv.y - 0.5) * PI;
      vec3 direction = vec3(sin(longitude) * cos(latitude), sin(latitude), -cos(longitude) * cos(latitude));
      vec3 dustAxis = normalize(vec3(0.53, 0.77, -0.29));
      float lane = dot(direction, dustAxis);
      float drift = noise3(direction * 5.4 + 2.0) - 0.5;
      float band = exp(-pow((lane + drift * 0.26 - 0.095) * 4.9, 2.0));
      vec3 p = direction * 9.7 + vec3(2.6, -4.1, 1.9);
      float clouds = nebula(p + 0.72 * nebula(p * 2.2 - 3.0));
      float fissures = pow(nebula(direction * 26.0 + 6.0), 2.7);
      float dust = band * pow(max(0.0, clouds - 0.13), 2.1) * (1.0 - 0.65 * fissures);
      float broad = pow(noise3(direction * 4.8 - 5.0), 2.0);
      float hue = smoothstep(0.23, 0.77, noise3(direction * 7.0 + 36.0));
      vec3 cloudColor = mix(vec3(0.016, 0.032, 0.080), vec3(0.067, 0.031, 0.048), hue);
      vec3 sky = vec3(0.00036, 0.00053, 0.00120)
               + vec3(0.0008, 0.0013, 0.0039) * broad
               + cloudColor * dust;
      outColor = vec4(sqrt(clamp(sky / 0.08, 0.0, 1.0)), 1.0);
    }
  `;

  const sceneSource = `#version 300 es
    precision highp float;
    in vec2 vUv;
    out vec4 outColor;
    uniform sampler2D uRayTable;
    uniform sampler2D uSky;
    uniform vec2 uSize;
    uniform vec3 uObserver;
    uniform vec3 uRight;
    uniform vec3 uUp;
    uniform float uMass;
    uniform float uSpin;
    uniform float uInner;
    uniform float uOuter;
    uniform float uTemperature;
    uniform float uIntensity;
    uniform float uZoom;
    uniform float uTime;
    uniform bool uLensing;
    uniform bool uDoppler;

    const float PI = 3.14159265;
    const float TAU = 2.0 * PI;
    const float CRITICAL = ${CRITICAL_IMPACT.toFixed(9)};
    const float MAX_IMPACT = ${MAX_IMPACT.toFixed(1)};
    const float MAX_ANGLE = ${MAX_ANGLE.toFixed(1)};
    const float COLUMNS = ${IMPACT_SAMPLES.toFixed(1)};
    const float ROWS = ${ANGLE_SAMPLES.toFixed(1)};
    const float EPSILON = ${IMPACT_MARGIN};
    const float MIN_IMPACT = ${MIN_IMPACT};
    ${noiseSource}

    float transferColumn(float b) {
      if (b < CRITICAL) {
        float ratio = clamp((CRITICAL - EPSILON - b) / (CRITICAL - EPSILON - MIN_IMPACT), 0.0, 1.0);
        return (0.5 + (1.0 - sqrt(ratio)) * (COLUMNS - 1.0)) / (2.0 * COLUMNS);
      }
      float ratio = clamp((b - CRITICAL - EPSILON) / (MAX_IMPACT - CRITICAL - EPSILON), 0.0, 1.0);
      return (COLUMNS + 0.5 + sqrt(ratio) * (COLUMNS - 1.0)) / (2.0 * COLUMNS);
    }

    float radiusAt(float angle, float column, float b, float pathEnd) {
      if (angle <= 0.0 || angle >= pathEnd) return 1000.0;
      if (!uLensing) return b / max(0.00001, sin(angle));
      float row = (0.5 + (ROWS - 1.0) * angle / MAX_ANGLE) / ROWS;
      return 1.0 / max(0.001, texture(uRayTable, vec2(column, row)).r);
    }

    vec3 starLayer(vec2 uv, float columns, float density, float pixel, float longitudeScale) {
      vec2 grid = uv * vec2(columns, columns * 0.5);
      vec2 id = floor(grid);
      id.x = mod(id.x, columns);
      float brightness = hash31(vec3(id, 11.2));
      vec2 jitter = vec2(hash31(vec3(id, 2.1)), hash31(vec3(id, 7.4)));
      vec2 offset = (fract(grid) - mix(vec2(0.17), vec2(0.83), jitter)) * vec2(longitudeScale, 1.0);
      float distance2 = dot(offset, offset);
      float size = mix(0.022, 0.062, pow(brightness, 4.0));
      float foot = columns * pixel;
      float width = size * size + 0.30 * foot * foot;
      float core = exp2(-1.1 * distance2 / width) * (size * size / width);
      float glow = exp2(-0.15 * distance2 / width) * 0.13 * pow(brightness, 7.0);
      float light = step(1.0 - density, hash31(vec3(id, 4.3)))
                  * (core + glow) * mix(0.021, 1.8, pow(brightness, 6.0));
      float tint = hash31(vec3(id, 17.0));
      vec3 color = mix(vec3(0.47, 0.65, 1.0), vec3(1.0, 0.74, 0.48), tint);
      return color * light * (1.0 - smoothstep(0.19, 0.63, foot));
    }

    vec3 getSky(vec3 direction) {
      vec2 uv = vec2(atan(direction.x, -direction.z) / TAU, asin(clamp(direction.y, -1.0, 1.0)) / PI) + 0.5;
      vec3 dust = texture(uSky, uv).rgb;
      float pixel = max(length(dFdx(direction)), length(dFdy(direction))) / TAU;
      float longitudeScale = max(0.31, length(direction.xz));
      return dust * dust * 0.08
           + starLayer(uv, 396.0, 0.42, pixel, longitudeScale)
           + starLayer(uv, 820.0, 0.31, pixel, longitudeScale) * 0.51;
    }

    vec4 shadeDisk(float r, vec3 radial, float opacity) {
      float distanceFromEdge = max(0.0, r - uInner);
      float angle = atan(radial.z, radial.x);
      float rotation = 0.14 + 2.5 * pow(3.0 / max(r, 1.8), 1.44);
      float flow = angle - uTime * rotation * (0.44 + uSpin * 0.32);
      vec2 orbit = vec2(cos(flow), sin(flow));
      float stream = noise3(vec3(orbit * 3.7, r * 0.96));
      float eddies = noise3(vec3(orbit * 12.4, r * 2.8 + stream));
      float fine = noise3(vec3(orbit * 24.0, r * 12.7 + 1.2 * stream));
      float streaks = 0.5 + 0.5 * sin(r * 19.4 + stream * 4.5 + eddies * 1.65);
      float hotSpots = pow(max(0.0, 0.65 * stream + 0.35 * eddies), 2.45);
      float structure = 0.17 + 1.37 * hotSpots + 0.23 * streaks * fine + 0.43 * fine * eddies;
      float radialLight = pow(uInner / r, 1.04);
      float heat = smoothstep(0.0, 1.0, 0.72 * radialLight + 0.40 * structure);
      float warmth = smoothstep(2500.0, 7600.0, uTemperature);
      float blueShift = smoothstep(7000.0, 14900.0, uTemperature);
      vec3 coolGas = mix(vec3(1.0, 0.080, 0.007), vec3(1.0, 0.305, 0.042), warmth);
      vec3 hotGas = mix(vec3(1.0, 0.380, 0.092), vec3(1.0, 0.710, 0.310), warmth);
      coolGas = mix(coolGas, vec3(0.49, 0.67, 1.0), blueShift);
      hotGas = mix(hotGas, vec3(0.81, 0.90, 1.0), blueShift);
      vec3 emissionColor = mix(coolGas, hotGas, heat);
      float innerGlow = 1.0 + 0.72 * exp(-distanceFromEdge * 0.65);
      float beam = 1.0;
      if (uDoppler) {
        vec2 tangent = normalize(vec2(radial.z, -radial.x));
        float toward = dot(tangent, uObserver.xz) * sqrt(uInner / r);
        beam = pow(1.0 + 0.66 * toward, 2.9);
        emissionColor.b *= 1.0 + 0.37 * toward;
      }
      float alpha = opacity * mix(0.34, 0.93, radialLight);
      float light = 5.35 * uIntensity * structure * radialLight * innerGlow * beam;
      return vec4(emissionColor * light * opacity, alpha);
    }

    void main() {
      vec2 screen = (2.0 * gl_FragCoord.xy - uSize) / uSize.y;
      screen.y += 0.025;
      float fit = max(1.0, 1.36 * uSize.y / uSize.x);
      vec2 impact = screen * (14.05 * fit / (uMass * uZoom));
      vec2 bent = impact;
      if (uLensing) {
        // 自旋用局部的阴影偏移和压缩近似，远处仍使用球对称的光路。
        float edgeOn = length(uObserver.xz);
        float influence = exp(-dot(impact, impact) / 143.0);
        bent.x += 2.12 * uSpin * edgeOn * influence;
        bent.x *= 1.0 + 0.19 * uSpin * uSpin * edgeOn * edgeOn * influence;
        bent.y += 0.045 * uSpin * impact.x * influence;
      }
      float b = max(0.0001, length(bent));
      vec2 radial2 = b > 0.0001 ? bent / b : vec2(0.0, -1.0);
      vec3 tangent = radial2.x * uRight + radial2.y * uUp;
      float horizon = 1.0 + sqrt(1.0 - uSpin * uSpin);
      float column = transferColumn(b);
      float pathEnd = PI;
      float deflection = 0.0;
      bool captured;
      if (uLensing) {
        float transfer = texture(uRayTable, vec2(column, 0.5 / ROWS)).g;
        captured = b < CRITICAL;
        pathEnd = captured ? transfer : PI + transfer;
        deflection = captured ? 0.0 : transfer;
        if (b > MAX_IMPACT) deflection = 4.0 / b + 11.78 / (b * b);
      } else {
        captured = b < horizon;
        if (captured) pathEnd = asin(clamp(b / horizon, 0.0, 1.0));
      }

      float skyBend = deflection * (0.39 + 0.61 * exp(-b * b / 164.0));
      float lookAngle = atan(length(screen) * 0.295 * fit / uZoom) - skyBend;
      vec3 skyDirection = -uObserver * cos(lookAngle) + tangent * sin(lookAngle);
      vec3 sky = getSky(skyDirection);
      float impactPixel = max(0.002, fwidth(b));
      float visibleSky = smoothstep(-0.54, 0.54, (b - (uLensing ? CRITICAL : horizon)) / impactPixel);
      vec3 light = vec3(0.0);
      float transmission = 1.0;
      float diskReach = uLensing ? uOuter * inversesqrt(1.0 - 2.0 / uOuter) : uOuter;

      if (b < diskReach) {
        // 射线在自身轨道平面内传播。每隔 π 与盘面相交，依次合成可见的多重像。
        float vertical = length(vec2(uObserver.y, tangent.y));
        float crossing = vertical > 0.00001 ? mod(atan(-uObserver.y, tangent.y), PI) : 0.0;
        float spread = asin(clamp(0.016 / max(vertical, 0.017), 0.0, 0.965));
        if (crossing + spread > PI) crossing -= PI;

        for (int order = 0; order < 5; order++) {
          if (crossing - spread >= pathEnd || transmission < 0.035) break;
          vec3 offsets = vec3(-0.82, 0.0, 0.82) * spread;
          vec3 radii = vec3(
            radiusAt(crossing + offsets.x, column, b, pathEnd),
            radiusAt(crossing, column, b, pathEnd),
            radiusAt(crossing + offsets.z, column, b, pathEnd));
          vec3 weights = vec3(0.29, 0.42, 0.29)
            * smoothstep(vec3(uInner), vec3(uInner + 0.43), radii)
            * (1.0 - smoothstep(vec3(uOuter * 0.76), vec3(uOuter), radii));
          float opacity = dot(weights, vec3(1.0));
          if (opacity > 0.0001) {
            float r = dot(radii, weights) / opacity;
            float phi = crossing + dot(offsets, weights) / opacity;
            vec3 radial = uObserver * cos(phi) + tangent * sin(phi);
            vec4 gas = shadeDisk(r, radial, opacity);
            float farSide = 1.0 - 0.18 * smoothstep(PI, PI + 0.24, phi);
            light += gas.rgb * transmission * farSide;
            transmission *= 1.0 - gas.a;
          }
          crossing += PI;
        }
      }

      if (uLensing) {
        float ringWidth = max(0.012, impactPixel * 0.62);
        float nearCritical = (b - CRITICAL - 0.012) / ringWidth;
        float ring = exp2(-1.8 * nearCritical * nearCritical);
        vec3 ringColor = mix(vec3(1.0, 0.47, 0.16), vec3(0.67, 0.83, 1.0), smoothstep(3500.0, 14000.0, uTemperature));
        light += transmission * ring * ringColor * uIntensity * 0.29;
      }

      // 用四次方根编码的 RGBA8 中间帧保留暗部，并给后处理留出高光范围。
      vec3 scene = light + sky * visibleSky * transmission;
      outColor = vec4(sqrt(sqrt(clamp(scene / 16.0, 0.0, 1.0))), 1.0);
    }
  `;

  const prefilterSource = `#version 300 es
    precision highp float;
    in vec2 vUv;
    out vec4 outColor;
    uniform sampler2D uImage;
    uniform vec2 uTexel;
    vec3 highlights(vec2 uv) {
      vec3 encoded = texture(uImage, uv).rgb;
      encoded *= encoded;
      vec3 color = 16.0 * encoded * encoded;
      return max(vec3(0.0), color - 0.55);
    }
    void main() {
      vec2 offset = 1.15 * uTexel;
      vec3 light = highlights(vUv + offset)
        + highlights(vUv - offset)
        + highlights(vUv + offset * vec2(1, -1))
        + highlights(vUv + offset * vec2(-1, 1));
      outColor = vec4(sqrt(clamp(light / 32.0, 0.0, 1.0)), 1.0);
    }
  `;

  const blurSource = `#version 300 es
    precision highp float;
    in vec2 vUv;
    out vec4 outColor;
    uniform sampler2D uImage;
    uniform vec2 uStep;
    vec3 readLight(vec2 uv) {
      vec3 encoded = texture(uImage, uv).rgb;
      return encoded * encoded;
    }
    void main() {
      vec3 color = readLight(vUv) * 0.227027;
      color += 0.316216 * (readLight(vUv + uStep * 1.384615) + readLight(vUv - uStep * 1.384615));
      color += 0.070270 * (readLight(vUv + uStep * 3.230769) + readLight(vUv - uStep * 3.230769));
      outColor = vec4(sqrt(color), 1.0);
    }
  `;

  const compositeSource = `#version 300 es
    precision highp float;
    in vec2 vUv;
    out vec4 outColor;
    uniform sampler2D uImage;
    uniform sampler2D uBloom;
    void main() {
      vec3 image = texture(uImage, vUv).rgb;
      image *= image;
      vec3 bloom = texture(uBloom, vUv).rgb;
      vec2 center = 2.0 * vUv - 1.0;
      float vignette = 1.0 - 0.30 * smoothstep(0.1, 1.9, dot(center, center));
      vec3 linearColor = (16.0 * image * image + 4.96 * bloom * bloom) * vignette;
      vec3 mapped = 1.0 - exp(-linearColor * 0.93);
      vec3 srgb = mix(12.92 * mapped, 1.055 * pow(mapped, vec3(1.0 / 2.4)) - 0.055, step(0.0031308, mapped));
      float dither = fract(52.9829189 * fract(dot(gl_FragCoord.xy, vec2(0.06711056, 0.00583715)))) - 0.5;
      outColor = vec4(srgb + dither / 255.0, 1.0);
    }
  `;

  function createProgram(gl, vertex, fragmentSource, name) {
    const fragment = compile(gl, gl.FRAGMENT_SHADER, fragmentSource, name);
    const program = gl.createProgram();
    gl.attachShader(program, vertex);
    gl.attachShader(program, fragment);
    gl.linkProgram(program);
    gl.deleteShader(fragment);
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
      const details = gl.getProgramInfoLog(program);
      gl.deleteProgram(program);
      throw new Error(`${name}着色器链接失败\n${details}`);
    }
    const uniforms = {};
    const count = gl.getProgramParameter(program, gl.ACTIVE_UNIFORMS);
    for (let i = 0; i < count; i++) {
      const { name: key } = gl.getActiveUniform(program, i);
      uniforms[key] = gl.getUniformLocation(program, key);
    }
    return { program, uniforms };
  }

  function compile(gl, type, source, name) {
    const shader = gl.createShader(type);
    gl.shaderSource(shader, source);
    gl.compileShader(shader);
    if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
      const details = gl.getShaderInfoLog(shader);
      gl.deleteShader(shader);
      throw new Error(`${name}着色器编译失败\n${details}`);
    }
    return shader;
  }

  function createTexture(gl, internal, format, type, width, height, data, wrap = gl.CLAMP_TO_EDGE) {
    const texture = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, texture);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, wrap);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texImage2D(gl.TEXTURE_2D, 0, internal, width, height, 0, format, type, data);
    return texture;
  }

  function createTarget(gl, width, height, wrap) {
    const texture = createTexture(gl, gl.RGBA8, gl.RGBA, gl.UNSIGNED_BYTE, width, height, null, wrap);
    const framebuffer = gl.createFramebuffer();
    gl.bindFramebuffer(gl.FRAMEBUFFER, framebuffer);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, texture, 0);
    if (gl.checkFramebufferStatus(gl.FRAMEBUFFER) !== gl.FRAMEBUFFER_COMPLETE) {
      gl.deleteFramebuffer(framebuffer);
      gl.deleteTexture(texture);
      throw new Error("无法分配 WebGL 帧缓冲。");
    }
    return { framebuffer, texture, width, height };
  }

  class Renderer {
    constructor(canvas) {
      const gl = canvas.getContext("webgl2", {
        alpha: false,
        antialias: false,
        depth: false,
        stencil: false,
        powerPreference: "high-performance",
      });
      if (!gl) throw new Error("当前浏览器无法启动 WebGL 2。");
      this.canvas = canvas;
      this.gl = gl;
      this.maxSize = gl.getParameter(gl.MAX_TEXTURE_SIZE);
      this.vertexArray = gl.createVertexArray();
      gl.bindVertexArray(this.vertexArray);
      gl.disable(gl.DITHER);
      this.width = 0;
      this.height = 0;
      this.targets = [];

      const vertex = compile(gl, gl.VERTEX_SHADER, vertexSource, "全屏顶点");
      this.scene = createProgram(gl, vertex, sceneSource, "引力与吸积盘");
      this.prefilter = createProgram(gl, vertex, prefilterSource, "高光提取");
      this.blur = createProgram(gl, vertex, blurSource, "辉光扩散");
      this.composite = createProgram(gl, vertex, compositeSource, "画面合成");
      const skyProgram = createProgram(gl, vertex, skySource, "星空");
      gl.deleteShader(vertex);

      rayTable ??= buildRayTable();
      this.transfer = createTexture(gl, gl.RG16F, gl.RG, gl.FLOAT, IMPACT_SAMPLES * 2, ANGLE_SAMPLES, rayTable);
      const sky = createTarget(gl, 1536, 768, gl.REPEAT);
      this.use(skyProgram, sky);
      this.draw();
      this.sky = sky.texture;
      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
      gl.deleteFramebuffer(sky.framebuffer);
      gl.deleteProgram(skyProgram.program);
      if (gl.getError() !== gl.NO_ERROR) throw new Error("无法初始化 WebGL 渲染资源。");
    }

    use(pass, target) {
      const gl = this.gl;
      gl.bindFramebuffer(gl.FRAMEBUFFER, target ? target.framebuffer : null);
      gl.viewport(0, 0, target ? target.width : this.width, target ? target.height : this.height);
      gl.useProgram(pass.program);
    }

    bindTexture(texture, slot, uniform) {
      const gl = this.gl;
      gl.activeTexture(gl.TEXTURE0 + slot);
      gl.bindTexture(gl.TEXTURE_2D, texture);
      gl.uniform1i(uniform, slot);
    }

    draw() {
      this.gl.drawArrays(this.gl.TRIANGLES, 0, 3);
    }

    resize(cssWidth, cssHeight, scale, pixelLimit) {
      const ratio = Math.min(
        scale,
        Math.sqrt(pixelLimit / (cssWidth * cssHeight)),
        this.maxSize / Math.max(cssWidth, cssHeight),
      );
      const width = Math.max(1, Math.round(cssWidth * ratio));
      const height = Math.max(1, Math.round(cssHeight * ratio));
      if (this.width === width && this.height === height) return;
      const gl = this.gl;
      for (const target of this.targets) {
        gl.deleteFramebuffer(target.framebuffer);
        gl.deleteTexture(target.texture);
      }
      this.width = this.canvas.width = width;
      this.height = this.canvas.height = height;
      const smallWidth = Math.max(1, Math.round(width / 4));
      const smallHeight = Math.max(1, Math.round(height / 4));
      this.targets = [
        createTarget(gl, width, height),
        createTarget(gl, smallWidth, smallHeight),
        createTarget(gl, smallWidth, smallHeight),
      ];
    }

    render(parameters, view, time) {
      const gl = this.gl;
      const [scene, glow, swap] = this.targets;
      const sp = Math.sin(view.pitch);
      const cp = Math.cos(view.pitch);
      const sy = Math.sin(view.yaw);
      const cy = Math.cos(view.yaw);

      this.use(this.scene, scene);
      const s = this.scene.uniforms;
      this.bindTexture(this.transfer, 0, s.uRayTable);
      this.bindTexture(this.sky, 1, s.uSky);
      gl.uniform2f(s.uSize, this.width, this.height);
      gl.uniform3f(s.uObserver, cp * sy, sp, cp * cy);
      gl.uniform3f(s.uRight, cy, 0, -sy);
      gl.uniform3f(s.uUp, -sp * sy, cp, -sp * cy);
      gl.uniform1f(s.uMass, parameters.mass);
      gl.uniform1f(s.uSpin, parameters.spin);
      gl.uniform1f(s.uInner, innermostOrbit(parameters.spin));
      gl.uniform1f(s.uOuter, parameters.outer);
      gl.uniform1f(s.uTemperature, parameters.temperature);
      gl.uniform1f(s.uIntensity, parameters.intensity);
      gl.uniform1f(s.uZoom, view.zoom);
      gl.uniform1f(s.uTime, time);
      gl.uniform1i(s.uLensing, parameters.lensing);
      gl.uniform1i(s.uDoppler, parameters.doppler);
      this.draw();

      this.use(this.prefilter, glow);
      const prefilter = this.prefilter.uniforms;
      this.bindTexture(scene.texture, 0, prefilter.uImage);
      gl.uniform2f(prefilter.uTexel, 1 / this.width, 1 / this.height);
      this.draw();

      // 辉光在四分之一宽高上做可分离模糊，保持发光边缘柔和。
      this.use(this.blur, swap);
      const blur = this.blur.uniforms;
      const spread = Math.max(1.18, Math.min(glow.width, glow.height) * 0.009);
      this.bindTexture(glow.texture, 0, blur.uImage);
      gl.uniform2f(blur.uStep, spread / glow.width, 0);
      this.draw();
      this.use(this.blur, glow);
      this.bindTexture(swap.texture, 0, blur.uImage);
      gl.uniform2f(blur.uStep, 0, spread / glow.height);
      this.draw();

      this.use(this.composite, null);
      const composite = this.composite.uniforms;
      this.bindTexture(scene.texture, 0, composite.uImage);
      this.bindTexture(glow.texture, 1, composite.uBloom);
      this.draw();
    }
  }

  window.BlackHoleRenderer = Renderer;
})();

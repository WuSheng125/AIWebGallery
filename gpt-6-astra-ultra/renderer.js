/* Gargantua — dependency-free, GPU curved-ray renderer.
 * This is a cinematic Schwarzschild-inspired approximation, not a Kerr solver.
 * Rays can intersect the same flat accretion disk more than once as they bend.
 */
(() => {
  'use strict';

  const VERTEX = `#version 300 es
  precision highp float;
  out vec2 vUv;
  void main() {
    vec2 p = vec2(float((gl_VertexID << 1) & 2), float(gl_VertexID & 2));
    vUv = p;
    gl_Position = vec4(p * 2.0 - 1.0, 0.0, 1.0);
  }`;

  const SCENE = `#version 300 es
  precision highp float;
  in vec2 vUv;
  out vec4 fragColor;
  uniform vec2 uResolution;
  uniform vec3 uCamera;
  uniform float uTime, uMass, uSpin, uDiskSize, uTemperature;
  uniform float uBrightness, uLensing, uStars;
  uniform bool uDoppler, uDisk;
  uniform int uSteps;
  const float PI = 3.14159265359;

  float hash(vec3 p) {
    p = fract(p * 0.1031);
    p += dot(p, p.yzx + 33.33);
    return fract((p.x + p.y) * p.z);
  }
  float noise(vec3 p) {
    vec3 i = floor(p), f = fract(p);
    f = f*f*(3.0-2.0*f);
    return mix(mix(mix(hash(i),hash(i+vec3(1,0,0)),f.x),
                   mix(hash(i+vec3(0,1,0)),hash(i+vec3(1,1,0)),f.x),f.y),
               mix(mix(hash(i+vec3(0,0,1)),hash(i+vec3(1,0,1)),f.x),
                   mix(hash(i+vec3(0,1,1)),hash(i+vec3(1)),f.x),f.y),f.z);
  }
  vec3 heatColor(float temperature) {
    float t = clamp((temperature-2500.0)/11500.0, 0.0, 1.0);
    vec3 warm = mix(vec3(1.0,0.22,0.025),vec3(1.0,0.66,0.28),smoothstep(0.0,0.48,t));
    return mix(warm,vec3(0.65,0.81,1.0),smoothstep(0.43,1.0,t));
  }
  vec4 diskLight(vec3 p, vec3 ray) {
    float radius = length(p.xz)/uMass;
    float inner = 2.9 - 0.95*uSpin;
    if (radius < inner || radius > uDiskSize) return vec4(0);
    float edge = smoothstep(inner,inner+0.15,radius)*(1.0-smoothstep(uDiskSize-1.0,uDiskSize,radius));
    float theta = atan(p.z,p.x);
    float orbital = uTime * (1.3+uSpin*1.6)/pow(radius,1.5);
    float phi = theta - orbital;
    vec3 field = vec3(cos(phi)*radius,sin(phi)*radius,radius*1.6);
    float n = noise(field*1.3);
    float fine = noise(field*4.0 + vec3(0,0,uTime*0.07));
    float streaks = sin(radius*36.0 + n*3.0 + sin(phi*2.0+radius*1.7)*0.6);
    float filament = 0.84 + 0.10*streaks + 0.24*n + 0.06*fine;
    float radial = pow(inner/radius,1.55);
    vec3 tangent = normalize(vec3(-p.z,0,p.x));
    float approach = dot(tangent,-normalize(ray));
    float shift = uDoppler ? 1.0/(1.0-approach*(0.28+0.16*uSpin)/sqrt(radius/inner)) : 1.0;
    float localHeat = uTemperature * (0.83+0.3*radial) * pow(shift,0.5);
    vec3 color = heatColor(localHeat);
    color = mix(color,vec3(1.0,0.92,0.74),0.33*radial);
    float hotEdge = exp(-pow((radius-inner-0.16)/0.13,2.0));
    float intensity = (2.25*radial*filament+0.50*hotEdge) * pow(shift,2.7) * uBrightness;
    // Cinematic transfer for the opposite disk face: the secondary image
    // stays near the inner edge rather than becoming a second broad arch.
    // This follows the observer above/below the disk, not screen coordinates.
    float secondaryFace = smoothstep(0.01,0.14,normalize(ray).y*sign(uCamera.y));
    float secondaryFalloff = 0.28*exp(-max(0.0,radius-inner)*0.85);
    intensity *= mix(1.0,secondaryFalloff,secondaryFace);
    return vec4(color*intensity,edge*0.93);
  }
  vec3 starLayer(vec2 sky, float scale, float threshold, float seed) {
    vec2 grid = sky*scale;
    vec2 cell = floor(grid);
    vec2 pixel = fwidth(grid);
    float h = hash(vec3(cell,seed));
    // Density reveals more fixed stars, rather than merely brightening them.
    if (h < 1.0-(1.0-threshold)*uStars) return vec3(0);
    vec2 jitter = vec2(hash(vec3(cell,seed+11.0)),hash(vec3(cell,seed+27.0)))-0.5;
    vec2 delta = fract(grid)-0.5-jitter*0.7;
    float size = 0.018+0.045*pow(hash(vec3(cell,seed+17.0)),3.0);
    float footprint = max(pixel.x,pixel.y)*0.55;
    float variance = size*size+footprint*footprint;
    float point = exp(-dot(delta,delta)/variance)*(size*size/variance);
    vec3 tint = mix(vec3(0.58,0.72,1.0),vec3(1.0,0.8,0.57),hash(vec3(cell,seed+4.0)));
    return tint*point*(5.0+14.0*hash(vec3(cell,seed+8.0)));
  }
  vec3 skyColor(vec3 dir) {
    if (uStars<=0.0) return vec3(0);
    vec2 sky = vec2(atan(dir.z,dir.x)/(2.0*PI)+0.5,acos(clamp(dir.y,-1.0,1.0))/PI);
    vec3 color = vec3(0.0011,0.0016,0.0028);
    float galaxy = pow(max(0.0,1.0-abs(dot(dir,normalize(vec3(0.3,0.76,0.58))))),16.0);
    float cloud = noise(dir*8.0)*noise(dir*19.0);
    color += vec3(0.013,0.014,0.023)*galaxy*cloud*uStars;
    color += starLayer(sky,360.0,0.979,2.0)+starLayer(sky,180.0,0.988,5.0)+starLayer(sky,70.0,0.995,9.0);
    return color;
  }
  vec3 acceleration(vec3 p,float h2) {
    float r2 = max(dot(p,p),0.01);
    return -1.5*uMass*uLensing*h2*p/(r2*r2*sqrt(r2));
  }
  void main() {
    vec3 forward = normalize(-uCamera);
    vec3 right = normalize(cross(forward,vec3(0,1,0)));
    vec3 up = cross(right,forward);
    float aspect = uResolution.x/uResolution.y;
    vec2 screen = (vUv*2.0-1.0)*vec2(aspect,1.0);
    screen *= max(1.0,1.1/aspect);
    vec3 velocity = normalize(forward + 0.41421356*(screen.x*right+screen.y*up));
    vec3 p = uCamera;
    float h2 = dot(cross(p,velocity),cross(p,velocity));
    vec3 light = vec3(0);
    float transmission = 1.0;
    bool captured = false;
    bool escaped = false;
    float escapeRadius = max(length(uCamera)+4.0,uDiskSize*uMass+6.0);
    for (int step=0;step<224;step++) {
      if (step>=uSteps) break;
      float radius = length(p);
      if (radius < uMass*1.001) { captured = true; break; }
      if (radius>escapeRadius && dot(p,velocity)>0.0) { escaped = true; break; }
      // Smaller steps close to the hole keep higher-order disk images stable.
      float ds = clamp(radius*0.105,0.055*uMass,0.7);
      vec3 a = acceleration(p,h2);
      vec3 nextP = p+velocity*ds+0.5*a*ds*ds;
      vec3 nextV = velocity+0.5*(a+acceleration(nextP,h2))*ds;
      if (uDisk && p.y*nextP.y<=0.0 && abs(p.y-nextP.y)>0.0000001) {
        float crossing = clamp(p.y/(p.y-nextP.y),0.0,1.0);
        vec3 hit = mix(p,nextP,crossing);
        vec4 sampleColor = diskLight(hit,mix(velocity,nextV,crossing));
        light += transmission*sampleColor.rgb*sampleColor.a;
        transmission *= 1.0-sampleColor.a*0.88;
      }
      p=nextP;
      velocity=nextV;
    }
    // A ray still orbiting when its budget ends is unresolved, not escaped.
    // Showing sky in that case creates false stars inside the photon ring.
    if (!captured && escaped) light += transmission*skyColor(normalize(velocity));
    // Square-root storage retains bright HDR emission in portable RGBA8 targets.
    // Alpha marks disk coverage so the downsampled glow cannot replicate
    // point stars into the blur kernel's sparse sampling pattern.
    fragColor = vec4(sqrt(clamp(light/12.0,0.0,1.0)),1.0-transmission);
  }`;

  const BLUR = `#version 300 es
  precision highp float;
  in vec2 vUv;
  out vec4 fragColor;
  uniform sampler2D uTexture;
  uniform vec2 uDirection;
  uniform bool uThreshold;
  vec3 sampleLight(vec2 uv) {
    vec4 texel=texture(uTexture,uv);
    vec3 c=texel.rgb;
    c=c*c*12.0;
    return uThreshold ? max(c-vec3(0.48),vec3(0))*texel.a : c;
  }
  void main() {
    vec3 light=sampleLight(vUv)*0.19648255;
    light+=(sampleLight(vUv+uDirection*1.4117647)+sampleLight(vUv-uDirection*1.4117647))*0.29690696;
    light+=(sampleLight(vUv+uDirection*3.2941176)+sampleLight(vUv-uDirection*3.2941176))*0.09447040;
    light+=(sampleLight(vUv+uDirection*5.1764706)+sampleLight(vUv-uDirection*5.1764706))*0.01038136;
    fragColor=vec4(sqrt(clamp(light/12.0,0.0,1.0)),1.0);
  }`;

  const COMPOSITE = `#version 300 es
  precision highp float;
  in vec2 vUv;
  out vec4 fragColor;
  uniform sampler2D uScene,uGlow;
  uniform float uBloom;
  vec3 aces(vec3 x) { return clamp((x*(2.51*x+0.03))/(x*(2.43*x+0.59)+0.14),0.0,1.0); }
  void main() {
    vec3 c=texture(uScene,vUv).rgb;
    vec3 b=texture(uGlow,vUv).rgb;
    c=c*c*12.0 + b*b*12.0*uBloom*0.85;
    float vignette=1.0-0.23*pow(length(vUv*2.0-1.0)*0.65,2.0);
    c=pow(aces(c*0.85),vec3(1.0/2.2))*vignette;
    fragColor=vec4(c,1.0);
  }`;

  const DEFAULTS = {
    mass: 1, spin: 0.72, diskSize: 6, temperature: 6500, brightness: 1.2,
    lensing: 1, bloom: 0.7, stars: 1, speed: 1, doppler: true, disk: true, quality: 'auto'
  };

  class BlackHoleRenderer {
    constructor(canvas, {onError, onFrame} = {}) {
      this.canvas = canvas;
      this.onError = onError || (() => {});
      this.onFrame = onFrame || (() => {});
      this.params = {...DEFAULTS};
      this.camera = {yaw: 0, pitch: 0.12, distance: 17};
      this.ready = false;
      this.resolution = {width: 0, height: 0};
      this.targets = [];
      this.programs = [];
      this._lost = false;
      this._onLost = event => {
        event.preventDefault();
        this._lost = true;
        this.ready = false;
        this.onError('显卡上下文已中断，请刷新页面恢复画面。');
      };
      canvas.addEventListener('webglcontextlost', this._onLost);
      try {
        const gl = this.gl = canvas.getContext('webgl2', {
          alpha: false, antialias: false, depth: false, stencil: false,
          powerPreference: 'high-performance', preserveDrawingBuffer: true
        });
        if (!gl) throw new Error('当前浏览器未启用 WebGL 2，请使用启用硬件加速的 Chrome、Edge 或 Firefox。');
        this.scene = this._program(SCENE);
        this.blur = this._program(BLUR);
        this.composite = this._program(COMPOSITE);
        this.vao = gl.createVertexArray();
        gl.bindVertexArray(this.vao);
        gl.disable(gl.DEPTH_TEST);
        gl.disable(gl.BLEND);
        this.ready = true;
        this.resize();
      } catch (error) {
        this.ready = false;
        this.onError(error.message);
        console.error('[Gargantua renderer]', error);
      }
    }

    _program(fragmentSource) {
      const gl = this.gl;
      const shaders = [];
      for (const [type, source] of [[gl.VERTEX_SHADER,VERTEX],[gl.FRAGMENT_SHADER,fragmentSource]]) {
        const shader = gl.createShader(type);
        gl.shaderSource(shader,source);
        gl.compileShader(shader);
        if (!gl.getShaderParameter(shader,gl.COMPILE_STATUS)) {
          const message = gl.getShaderInfoLog(shader);
          gl.deleteShader(shader);
          shaders.forEach(s => gl.deleteShader(s));
          throw new Error('图形着色器编译失败：'+message);
        }
        shaders.push(shader);
      }
      const handle = gl.createProgram();
      shaders.forEach(shader => gl.attachShader(handle,shader));
      gl.linkProgram(handle);
      shaders.forEach(shader => gl.deleteShader(shader));
      if (!gl.getProgramParameter(handle,gl.LINK_STATUS)) {
        const message = gl.getProgramInfoLog(handle);
        gl.deleteProgram(handle);
        throw new Error('图形程序链接失败：'+message);
      }
      const program = {handle,uniforms:{}};
      const count = gl.getProgramParameter(handle,gl.ACTIVE_UNIFORMS);
      for (let i=0;i<count;i++) {
        const info = gl.getActiveUniform(handle,i);
        program.uniforms[info.name] = gl.getUniformLocation(handle,info.name);
      }
      this.programs.push(handle);
      return program;
    }

    _target(width,height) {
      const gl = this.gl;
      const texture = gl.createTexture();
      gl.bindTexture(gl.TEXTURE_2D,texture);
      gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MIN_FILTER,gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MAG_FILTER,gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_S,gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_T,gl.CLAMP_TO_EDGE);
      gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA8,width,height,0,gl.RGBA,gl.UNSIGNED_BYTE,null);
      const framebuffer = gl.createFramebuffer();
      gl.bindFramebuffer(gl.FRAMEBUFFER,framebuffer);
      gl.framebufferTexture2D(gl.FRAMEBUFFER,gl.COLOR_ATTACHMENT0,gl.TEXTURE_2D,texture,0);
      if (gl.checkFramebufferStatus(gl.FRAMEBUFFER)!==gl.FRAMEBUFFER_COMPLETE) {
        gl.deleteTexture(texture);
        gl.deleteFramebuffer(framebuffer);
        throw new Error('显卡无法创建渲染缓冲区。');
      }
      return {texture,framebuffer,width,height};
    }

    setParams(partial) {
      const priorQuality = this.params.quality;
      Object.assign(this.params,partial);
      if (priorQuality!==this.params.quality) this.resize();
    }

    setCamera(partial) {
      Object.assign(this.camera,partial);
      this.camera.pitch = Math.max(-1.53,Math.min(1.53,this.camera.pitch));
      this.camera.distance = Math.max(7,Math.min(30,this.camera.distance));
    }

    resize() {
      if (!this.ready) return;
      const rect = this.canvas.getBoundingClientRect();
      const quality = this.params.quality;
      const budget = quality==='high' ? 1800000 : quality==='low' ? 460000 : 950000;
      const ratio = Math.min(window.devicePixelRatio || 1,quality==='high' ? 2 : 1.5);
      const cssW = Math.max(1,rect.width), cssH = Math.max(1,rect.height);
      const scale = Math.min(ratio,Math.sqrt(budget/(cssW*cssH)));
      const width = Math.max(2,Math.round(cssW*scale));
      const height = Math.max(2,Math.round(cssH*scale));
      if (width===this.resolution.width && height===this.resolution.height) return;
      this.canvas.width = width;
      this.canvas.height = height;
      this.resolution = {width,height};
      const gl = this.gl;
      this.targets.forEach(t => {gl.deleteTexture(t.texture);gl.deleteFramebuffer(t.framebuffer);});
      this.targets = [];
      try {
        this.targets.push(this._target(width,height));
        this.targets.push(this._target(Math.max(2,Math.round(width/3)),Math.max(2,Math.round(height/3))));
        this.targets.push(this._target(Math.max(2,Math.round(width/3)),Math.max(2,Math.round(height/3))));
      } catch(error) {
        this.ready = false;
        this.onError(error.message);
      }
      gl.bindFramebuffer(gl.FRAMEBUFFER,null);
    }

    _bindTexture(program,name,target,index) {
      const gl=this.gl;
      gl.activeTexture(gl.TEXTURE0+index);
      gl.bindTexture(gl.TEXTURE_2D,target.texture);
      gl.uniform1i(program.uniforms[name],index);
    }

    _draw(program,target) {
      const gl=this.gl;
      gl.useProgram(program.handle);
      gl.bindFramebuffer(gl.FRAMEBUFFER,target ? target.framebuffer : null);
      gl.viewport(0,0,target ? target.width : this.canvas.width,target ? target.height : this.canvas.height);
    }

    render(timeSeconds=0) {
      if (!this.ready || this._lost || this.targets.length!==3) return;
      const gl=this.gl, p=this.params, c=this.camera;
      const [scene,blurA,blurB]=this.targets;
      gl.bindVertexArray(this.vao);
      this._draw(this.scene,scene);
      const u=this.scene.uniforms;
      gl.uniform2f(u.uResolution,scene.width,scene.height);
      const flat=Math.cos(c.pitch)*c.distance;
      gl.uniform3f(u.uCamera,Math.sin(c.yaw)*flat,Math.sin(c.pitch)*c.distance,Math.cos(c.yaw)*flat);
      gl.uniform1f(u.uTime,timeSeconds);
      for (const [name,key] of [['uMass','mass'],['uSpin','spin'],['uDiskSize','diskSize'],['uTemperature','temperature'],['uBrightness','brightness'],['uLensing','lensing'],['uStars','stars']]) gl.uniform1f(u[name],p[key]);
      gl.uniform1i(u.uDoppler,p.doppler ? 1 : 0);
      gl.uniform1i(u.uDisk,p.disk ? 1 : 0);
      gl.uniform1i(u.uSteps,p.quality==='high' ? 224 : p.quality==='low' ? 112 : 168);
      gl.drawArrays(gl.TRIANGLES,0,3);

      this._draw(this.blur,blurA);
      this._bindTexture(this.blur,'uTexture',scene,0);
      gl.uniform2f(this.blur.uniforms.uDirection,2.0/blurA.width,0);
      gl.uniform1i(this.blur.uniforms.uThreshold,1);
      gl.drawArrays(gl.TRIANGLES,0,3);
      this._draw(this.blur,blurB);
      this._bindTexture(this.blur,'uTexture',blurA,0);
      gl.uniform2f(this.blur.uniforms.uDirection,0,2.0/blurB.height);
      gl.uniform1i(this.blur.uniforms.uThreshold,0);
      gl.drawArrays(gl.TRIANGLES,0,3);

      this._draw(this.composite,null);
      this._bindTexture(this.composite,'uScene',scene,0);
      this._bindTexture(this.composite,'uGlow',blurB,1);
      gl.uniform1f(this.composite.uniforms.uBloom,p.bloom);
      gl.drawArrays(gl.TRIANGLES,0,3);
      this.onFrame({width:scene.width,height:scene.height});
    }

    capture() { return this.canvas.toDataURL('image/png'); }

    dispose() {
      this.canvas.removeEventListener('webglcontextlost',this._onLost);
      const gl=this.gl;
      if (!gl) return;
      this.targets.forEach(t => {gl.deleteTexture(t.texture);gl.deleteFramebuffer(t.framebuffer);});
      this.programs.forEach(p => gl.deleteProgram(p));
      if(this.vao) gl.deleteVertexArray(this.vao);
      this.ready=false;
    }
  }

  window.BlackHoleRenderer=BlackHoleRenderer;
})();

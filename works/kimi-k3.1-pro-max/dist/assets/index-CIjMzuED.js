import{q as D,O as A,a as b,r as M,s as C,m as L,t as R,V as p,d as F,G as $,b as m,B,F as k,c as w,W as V,u as S,H as I}from"./three-core-BlAX4B1x.js";import{O as q,E as z,R as N,U,S as H,a as G}from"./three-addons-DhRiZXCB.js";(function(){const e=document.createElement("link").relList;if(e&&e.supports&&e.supports("modulepreload"))return;for(const a of document.querySelectorAll('link[rel="modulepreload"]'))s(a);new MutationObserver(a=>{for(const n of a)if(n.type==="childList")for(const o of n.addedNodes)o.tagName==="LINK"&&o.rel==="modulepreload"&&s(o)}).observe(document,{childList:!0,subtree:!0});function t(a){const n={};return a.integrity&&(n.integrity=a.integrity),a.referrerPolicy&&(n.referrerPolicy=a.referrerPolicy),a.crossOrigin==="use-credentials"?n.credentials="include":a.crossOrigin==="anonymous"?n.credentials="omit":n.credentials="same-origin",n}function s(a){if(a.ep)return;a.ep=!0;const n=t(a);fetch(a.href,n)}})();const W=`out vec2 vUv;

void main() {
  vUv = uv;
  gl_Position = vec4(position.xy, 0.0, 1.0);
}
`,j=`precision highp float;
precision highp int;

in vec2 vUv;
out vec4 fragColor;

uniform vec2 uResolution;
uniform vec3 uCameraPos;
uniform vec3 uCameraRight;
uniform vec3 uCameraUp;
uniform vec3 uCameraForward;
uniform float uTanHalfFov;
uniform float uTime;
uniform float uMass;
uniform float uLensing;
uniform float uDiskInner;
uniform float uDiskOuter;
uniform float uDiskBrightness;
uniform float uDiskTemperature;
uniform float uDiskSpeed;
uniform float uDiskDensity;
uniform float uDoppler;
uniform float uStarBrightness;
uniform float uDiskVisible;
uniform float uStarsVisible;
uniform float uStepScale;
uniform int uMaxSteps;

const float PI = 3.141592653589793;

float hash12(vec2 p) {
  vec3 p3 = fract(vec3(p.xyx) * 0.1031);
  p3 += dot(p3, p3.yzx + 33.33);
  return fract((p3.x + p3.y) * p3.z);
}

vec2 hash22(vec2 p) {
  vec3 p3 = fract(vec3(p.xyx) * vec3(0.1031, 0.1030, 0.0973));
  p3 += dot(p3, p3.yzx + 33.33);
  return fract((p3.xx + p3.yz) * p3.zy);
}

float noise2(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(
    mix(hash12(i), hash12(i + vec2(1.0, 0.0)), u.x),
    mix(hash12(i + vec2(0.0, 1.0)), hash12(i + vec2(1.0)), u.x),
    u.y
  );
}

float fbm2(vec2 p) {
  float value = 0.0;
  float amplitude = 0.52;
  mat2 rotation = mat2(0.80, -0.60, 0.60, 0.80);
  for (int i = 0; i < 4; i++) {
    value += amplitude * noise2(p);
    p = rotation * p * 2.03 + 17.17;
    amplitude *= 0.5;
  }
  return value;
}

// A seamless cube-map parameterisation keeps the procedural sky fixed in space.
vec2 cubeFaceUv(vec3 direction, out float face) {
  vec3 a = abs(direction);
  vec2 uv;
  if (a.x >= a.y && a.x >= a.z) {
    face = direction.x > 0.0 ? 11.0 : 29.0;
    uv = vec2(direction.z, direction.y) / a.x;
  } else if (a.y >= a.z) {
    face = direction.y > 0.0 ? 47.0 : 67.0;
    uv = vec2(direction.x, direction.z) / a.y;
  } else {
    face = direction.z > 0.0 ? 83.0 : 101.0;
    uv = vec2(direction.x, direction.y) / a.z;
  }
  return uv * 0.5 + 0.5;
}

vec3 starLayer(vec2 uv, float face, float cells, float seed, float probability) {
  vec2 p = uv * cells;
  vec2 cell = floor(p);
  vec2 local = fract(p);
  vec2 random = hash22(cell + face * 7.31 + seed);
  float existence = hash12(cell + face * 13.17 + seed * 3.7);
  if (existence > probability) return vec3(0.0);

  vec2 centre = 0.15 + 0.70 * random;
  float distanceToStar = length(local - centre);
  float sizeRandom = hash12(cell + seed * 19.1 + face);
  float radius = mix(0.022, 0.072, pow(sizeRandom, 4.0));
  float core = 1.0 - smoothstep(0.0, radius, distanceToStar);
  float halo = exp(-distanceToStar * distanceToStar / max(0.0001, radius * radius * 2.5));
  float magnitude = 0.18 + 4.2 * pow(hash12(cell + seed * 31.7), 10.0);
  float temperature = hash12(cell + face + seed * 43.0);
  vec3 tint = mix(vec3(0.64, 0.77, 1.0), vec3(1.0, 0.79, 0.56), temperature);
  tint = mix(tint, vec3(1.0), 0.62);
  return tint * magnitude * (core + 0.16 * halo);
}

vec3 sampleSky(vec3 direction) {
  vec3 d = normalize(direction);
  float face;
  vec2 uv = cubeFaceUv(d, face);

  vec3 stars = starLayer(uv, face, 92.0, 1.3, 0.52);
  stars += starLayer(uv, face, 187.0, 7.9, 0.34) * 0.72;
  stars += starLayer(uv, face, 337.0, 15.1, 0.20) * 0.34;

  // A very restrained, seamless galactic band; the stars remain the focus.
  vec3 galacticNormal = normalize(vec3(0.26, 0.91, 0.32));
  float latitude = abs(dot(d, galacticNormal));
  float band = exp(-latitude * latitude * 35.0);
  float clouds = 0.5 + 0.25 * sin(d.x * 13.0 + sin(d.z * 8.0))
    + 0.25 * sin(d.y * 17.0 - d.z * 9.0);
  vec3 space = vec3(0.0007, 0.0011, 0.0024);
  space += band * (0.003 + 0.009 * clouds) * vec3(0.32, 0.43, 0.68);
  return space + stars * uStarBrightness;
}

vec3 temperatureColor(float kelvin) {
  if (kelvin <= 6500.0) {
    float t = smoothstep(2500.0, 6500.0, kelvin);
    return mix(vec3(1.0, 0.16, 0.025), vec3(1.0, 0.90, 0.72), t);
  }
  float t = smoothstep(6500.0, 11500.0, kelvin);
  return mix(vec3(1.0, 0.90, 0.72), vec3(0.58, 0.74, 1.0), t);
}

vec3 gravity(vec3 p, float angularMomentumSquared) {
  float r2 = max(dot(p, p), 0.0001);
  float r5 = r2 * r2 * sqrt(r2);
  return -1.5 * uMass * uLensing * angularMomentumSquared * p / r5;
}

vec4 sampleDisk(vec3 p, vec3 photonDirection) {
  float radius = length(p.xz);
  float inner = max(uDiskInner, uMass * 1.12);
  float outer = max(uDiskOuter, inner + 0.2);
  if (radius < inner || radius > outer) return vec4(0.0);

  float radialFade = smoothstep(inner, inner + 0.28 * uMass, radius)
    * (1.0 - smoothstep(outer * 0.70, outer, radius));
  float innerRim = exp(-(radius - inner) * 1.75 / max(uMass, 0.2));
  float angle = atan(p.z, p.x);
  float orbitalPhase = uTime * uDiskSpeed * 2.1 / pow(max(radius, 1.0), 1.5);
  vec2 rotatingPosition = vec2(cos(angle - orbitalPhase), sin(angle - orbitalPhase)) * radius;

  float turbulence = fbm2(rotatingPosition * 2.2 + vec2(4.7, 9.2));
  float detail = noise2(rotatingPosition * 10.5 - vec2(uTime * 0.025, 0.0));
  float bands = 0.82 + 0.18 * sin(radius * 17.0 + turbulence * 5.5);
  float filaments = clamp(0.34 + turbulence * 0.92 + detail * 0.22, 0.0, 1.35);
  float density = radialFade * clamp(uDiskDensity * (0.48 + 0.72 * filaments), 0.0, 1.0);

  // Relativistic beaming: the side rotating towards the observer is brighter.
  vec3 matterVelocity = normalize(vec3(-p.z, 0.0, p.x));
  float beta = min(0.66, sqrt(0.5 * uMass / max(radius, uMass)));
  float approach = dot(matterVelocity, -normalize(photonDirection));
  float dopplerFactor = 1.0 / max(0.28, 1.0 - beta * approach);
  float beaming = clamp(pow(dopplerFactor, 3.0 * uDoppler), 0.10, 3.8);

  float heat = 1.0 - smoothstep(inner, outer, radius);
  vec3 colour = temperatureColor(uDiskTemperature + heat * 1500.0 - (1.0 - heat) * 650.0);
  float blueShift = clamp((dopplerFactor - 1.0) * uDoppler * 1.6, 0.0, 0.65);
  float redShift = clamp((1.0 - dopplerFactor) * uDoppler * 1.4, 0.0, 0.65);
  colour = mix(colour, colour * vec3(0.72, 0.87, 1.22), blueShift);
  colour = mix(colour, colour * vec3(1.16, 0.68, 0.39), redShift);

  float radialEnergy = pow(inner / max(radius, inner), 1.48);
  float gravitationalRedshift = sqrt(max(0.08, 1.0 - uMass / max(radius, uMass + 0.01)));
  float energy = uDiskBrightness * radialEnergy * gravitationalRedshift
    * (1.55 + innerRim * 2.65) * bands * filaments * beaming;

  float alpha = clamp(density * 0.88, 0.0, 0.96);
  return vec4(colour * energy, alpha);
}

void main() {
  vec2 screen = vUv * 2.0 - 1.0;
  float aspect = uResolution.x / max(uResolution.y, 1.0);
  vec3 rayDirection = normalize(
    uCameraForward
    + uCameraRight * screen.x * aspect * uTanHalfFov
    + uCameraUp * screen.y * uTanHalfFov
  );

  vec3 position = uCameraPos;
  vec3 velocity = rayDirection;
  vec3 angularMomentum = cross(position, velocity);
  float h2 = dot(angularMomentum, angularMomentum);
  float impactParameter = sqrt(h2);

  vec3 radiance = vec3(0.0);
  float transmittance = 1.0;
  bool captured = false;
  bool escaped = false;

  for (int i = 0; i < 256; i++) {
    if (i >= uMaxSteps) break;

    float radius = length(position);
    if (radius < uMass) {
      captured = true;
      break;
    }
    if (radius > 26.0 && dot(position, velocity) > 0.0) {
      escaped = true;
      break;
    }

    // Small steps near the photon sphere; much larger steps in the weak field.
    float stepLength = clamp(0.016 * radius + 0.006 * radius * radius, 0.014, 0.72)
      * uStepScale;
    vec3 acceleration = gravity(position, h2);
    vec3 midpointPosition = position + velocity * stepLength * 0.5;
    vec3 midpointVelocity = velocity + acceleration * stepLength * 0.5;
    vec3 midpointAcceleration = gravity(midpointPosition, h2);
    vec3 nextPosition = position + midpointVelocity * stepLength;
    vec3 nextVelocity = velocity + midpointAcceleration * stepLength;

    // Detect the exact equatorial-plane crossing along each curved segment.
    if (uDiskVisible > 0.5 && position.y * nextPosition.y <= 0.0
        && abs(nextPosition.y - position.y) > 0.000001) {
      float crossing = -position.y / (nextPosition.y - position.y);
      crossing = clamp(crossing, 0.0, 1.0);
      vec3 hit = mix(position, nextPosition, crossing);
      vec4 disk = sampleDisk(hit, midpointVelocity);
      radiance += transmittance * disk.rgb * disk.a;
      transmittance *= 1.0 - disk.a;
      if (transmittance < 0.015) break;
    }

    position = nextPosition;
    velocity = nextVelocity;
  }

  // An exhausted near-critical trajectory must not leak stars into the shadow.
  // Only a ray which really escaped (or is safely far and outgoing) sees the sky.
  float finalRadius = length(position);
  bool safelyOutgoing = finalRadius > 18.0 && dot(position, velocity) > 0.0;
  if (!captured && (escaped || safelyOutgoing) && uStarsVisible > 0.5) {
    radiance += transmittance * sampleSky(velocity);
  }

  // Artistic photon-ring highlight, disabled when ray bending is disabled.
  float criticalImpact = 2.598076211 * uMass * max(uLensing, 0.001);
  float ringDistance = (impactParameter - criticalImpact) / (0.022 * uMass);
  float photonRing = exp(-ringDistance * ringDistance) * smoothstep(0.25, 0.80, uLensing);
  radiance += transmittance * uDiskVisible * uDiskBrightness * photonRing
    * vec3(0.26, 0.19, 0.11);

  fragColor = vec4(max(radiance, vec3(0.0)), 1.0);
}
`,d={low:{steps:88,stepScale:1.4,pixelRatio:.65,maxPixels:115e4},medium:{steps:144,stepScale:1,pixelRatio:1,maxPixels:24e5},high:{steps:224,stepScale:.7,pixelRatio:1.25,maxPixels:42e5}},P=new p(0,1.32,13.2);class K{onFirstFrame;onViewChange;onStatusChange;container;renderer;camera;controls;scene=new D;screenCamera=new A;material;composer;bloomPass;gradePass;resizeObserver;drawingBufferSize=new b;params;animationFrame=0;previousTime=performance.now();elapsedTime=0;fpsStart=this.previousTime;fpsFrames=0;firstFrameSent=!1;currentRenderScale=1;disposed=!1;constructor(e,t){if(this.container=e,this.params={...t},this.renderer=new M({antialias:!1,alpha:!1,depth:!1,stencil:!1,powerPreference:"high-performance"}),!this.renderer.extensions.has("EXT_color_buffer_float"))throw this.renderer.dispose(),new Error("当前显卡或浏览器缺少 EXT_color_buffer_float，无法使用 HDR 渲染。");this.renderer.setClearColor(0,1),this.renderer.outputColorSpace=C,this.renderer.toneMapping=L,this.renderer.toneMappingExposure=t.exposure,this.renderer.domElement.id="black-hole-canvas",this.renderer.domElement.setAttribute("role","img"),this.renderer.domElement.setAttribute("aria-label","可交互的黑洞：拖动旋转视角，滚轮缩放，右键拖动不可用"),this.renderer.domElement.style.touchAction="none",e.appendChild(this.renderer.domElement),this.camera=new R(42,1,.1,100),this.camera.position.copy(P),this.camera.lookAt(0,0,0),this.controls=new q(this.camera,this.renderer.domElement),this.controls.target.set(0,0,0),this.controls.enableDamping=!0,this.controls.dampingFactor=.065,this.controls.enablePan=!1,this.controls.rotateSpeed=.52,this.controls.zoomSpeed=.72,this.controls.minDistance=5.4,this.controls.maxDistance=23,this.controls.minPolarAngle=.06,this.controls.maxPolarAngle=Math.PI-.06,this.controls.autoRotateSpeed=.34,this.controls.update(),this.controls.saveState(),this.controls.addEventListener("change",this.emitViewInfo),this.material=new F({name:"SchwarzschildRaymarcher",glslVersion:$,vertexShader:W,fragmentShader:j,depthTest:!1,depthWrite:!1,uniforms:{uResolution:{value:new b(1,1)},uCameraPos:{value:new p},uCameraRight:{value:new p},uCameraUp:{value:new p},uCameraForward:{value:new p},uTanHalfFov:{value:Math.tan(m.degToRad(this.camera.fov*.5))},uTime:{value:0},uMass:{value:t.mass},uLensing:{value:t.lensing},uDiskInner:{value:t.diskInner},uDiskOuter:{value:t.diskOuter},uDiskBrightness:{value:t.diskBrightness},uDiskTemperature:{value:t.diskTemperature},uDiskSpeed:{value:t.diskSpeed},uDiskDensity:{value:t.diskDensity},uDoppler:{value:t.doppler},uStarBrightness:{value:t.starBrightness},uDiskVisible:{value:Number(t.diskVisible)},uStarsVisible:{value:Number(t.starsVisible)},uStepScale:{value:d[t.quality].stepScale},uMaxSteps:{value:d[t.quality].steps}}});const s=new B;s.setAttribute("position",new k([-1,-1,0,3,-1,0,-1,3,0],3)),s.setAttribute("uv",new k([0,0,2,0,0,2],2));const a=new w(s,this.material);a.frustumCulled=!1,this.scene.add(a);const n=new V(1,1,{type:I,minFilter:S,magFilter:S,depthBuffer:!1,stencilBuffer:!1});this.composer=new z(this.renderer,n),this.composer.addPass(new N(this.scene,this.screenCamera)),this.bloomPass=new U(new b(1,1),t.bloom,.3,1.2),this.composer.addPass(this.bloomPass),this.gradePass=new H({name:"OpticalVignette",uniforms:{tDiffuse:{value:null}},vertexShader:`
        varying vec2 vUv;
        void main() {
          vUv = uv;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
      `,fragmentShader:`
        uniform sampler2D tDiffuse;
        varying vec2 vUv;
        void main() {
          vec3 colour = texture2D(tDiffuse, vUv).rgb;
          vec2 centred = vUv * 2.0 - 1.0;
          float vignette = 1.0 - 0.16 * smoothstep(0.30, 1.65, dot(centred, centred));
          gl_FragColor = vec4(colour * vignette, 1.0);
        }
      `}),this.composer.addPass(this.gradePass),this.composer.addPass(new G),this.resizeObserver=new ResizeObserver(this.resize),this.resizeObserver.observe(e),this.renderer.domElement.addEventListener("webglcontextlost",this.onContextLost),this.resize(),this.setParams(t),this.updateCameraUniforms()}start(){this.animationFrame||this.disposed||(this.previousTime=performance.now(),this.fpsStart=this.previousTime,this.animationFrame=requestAnimationFrame(this.animate))}setParams(e){const t=this.params.quality;this.params={...e};const s=this.material.uniforms;s.uMass.value=e.mass,s.uLensing.value=e.lensing,s.uDiskInner.value=e.diskInner,s.uDiskOuter.value=e.diskOuter,s.uDiskBrightness.value=e.diskBrightness,s.uDiskTemperature.value=e.diskTemperature,s.uDiskSpeed.value=e.diskSpeed,s.uDiskDensity.value=e.diskDensity,s.uDoppler.value=e.doppler,s.uStarBrightness.value=e.starBrightness,s.uDiskVisible.value=Number(e.diskVisible),s.uStarsVisible.value=Number(e.starsVisible),s.uStepScale.value=d[e.quality].stepScale,s.uMaxSteps.value=d[e.quality].steps,this.bloomPass.strength=e.bloom,this.bloomPass.enabled=e.bloom>.001,this.renderer.toneMappingExposure=e.exposure,this.controls.autoRotate=e.autoRotate,t!==e.quality&&this.resize()}resetView(){const e=this.controls.enableDamping;this.controls.enableDamping=!1,this.controls.reset(),this.camera.position.copy(P),this.controls.target.set(0,0,0),this.controls.update(),this.controls.enableDamping=e,this.emitViewInfo()}getViewInfo(){const e=this.camera.position.clone().sub(this.controls.target);return{inclination:Math.atan2(e.y,Math.hypot(e.x,e.z)),distance:e.length()}}async captureScreenshot(){this.composer.render(0);const e=this.renderer.domElement;return new Promise((t,s)=>{e.toBlob(a=>{a?t(a):s(new Error("浏览器无法生成画面截图。"))},"image/png")})}dispose(){this.disposed=!0,cancelAnimationFrame(this.animationFrame),this.resizeObserver.disconnect(),this.controls.removeEventListener("change",this.emitViewInfo),this.controls.dispose(),this.renderer.domElement.removeEventListener("webglcontextlost",this.onContextLost),this.scene.traverse(e=>{e instanceof w&&e.geometry.dispose()}),this.material.dispose(),this.composer.passes.forEach(e=>e.dispose()),this.composer.dispose(),this.renderer.dispose(),this.renderer.domElement.remove()}animate=e=>{if(this.disposed)return;this.animationFrame=requestAnimationFrame(this.animate);const t=Math.min(Math.max((e-this.previousTime)/1e3,0),.05);if(this.previousTime=e,document.hidden)return;this.elapsedTime+=t,this.material.uniforms.uTime.value=this.elapsedTime,this.controls.update(t),this.updateCameraUniforms(),this.composer.render(t),this.firstFrameSent||(this.firstFrameSent=!0,this.onFirstFrame?.(),this.emitViewInfo()),this.fpsFrames+=1;const s=e-this.fpsStart;if(s>=650){const a=this.fpsFrames*1e3/s;this.onStatusChange?.(a,this.currentRenderScale),this.fpsFrames=0,this.fpsStart=e}};updateCameraUniforms(){this.camera.updateMatrixWorld();const e=this.material.uniforms;e.uCameraPos.value.copy(this.camera.position),e.uCameraRight.value.setFromMatrixColumn(this.camera.matrixWorld,0),e.uCameraUp.value.setFromMatrixColumn(this.camera.matrixWorld,1),this.camera.getWorldDirection(e.uCameraForward.value)}emitViewInfo=()=>{this.onViewChange?.(this.getViewInfo())};resize=()=>{if(this.disposed)return;const e=Math.max(1,this.container.clientWidth||window.innerWidth),t=Math.max(1,this.container.clientHeight||window.innerHeight),s=d[this.params.quality],a=window.devicePixelRatio||1,n=e<760?1.25:1.5;let o=s.pixelRatio;this.params.quality!=="low"&&(o*=Math.min(a,n)),o=Math.max(.25,Math.min(o,1.75)),e*t*o*o>s.maxPixels&&(o=Math.sqrt(s.maxPixels/(e*t))),this.currentRenderScale=o,this.camera.aspect=e/t;const h=Math.tan(m.degToRad(21))*Math.max(1,.85/this.camera.aspect);this.camera.fov=Math.min(72,m.radToDeg(2*Math.atan(h))),this.camera.updateProjectionMatrix(),this.material.uniforms.uTanHalfFov.value=Math.tan(m.degToRad(this.camera.fov*.5)),this.renderer.setPixelRatio(o),this.renderer.setSize(e,t,!1),this.composer.setPixelRatio(o),this.composer.setSize(e,t),this.renderer.getDrawingBufferSize(this.drawingBufferSize),this.material.uniforms.uResolution.value.copy(this.drawingBufferSize)};onContextLost=e=>{e.preventDefault(),cancelAnimationFrame(this.animationFrame),this.animationFrame=0;const t=document.querySelector("#error-panel");t&&(t.hidden=!1,t.textContent="图形上下文已中断。请关闭其他高负载图形页面后刷新本页。")}}const v=Object.freeze({mass:1,lensing:1,diskInner:3,diskOuter:8.2,diskBrightness:1.45,diskTemperature:5900,diskSpeed:.72,diskDensity:.9,doppler:.9,starBrightness:.85,bloom:.26,exposure:1.05,quality:"medium",autoRotate:!1,diskVisible:!0,starsVisible:!0}),E={gargantua:{...v},ember:{...v,mass:1.15,diskInner:3.35,diskOuter:7.2,diskBrightness:1.15,diskTemperature:3400,diskSpeed:.42,diskDensity:1.15,doppler:.55,starBrightness:.55,bloom:.36,exposure:1},sapphire:{...v,mass:.9,diskInner:2.75,diskOuter:9,diskBrightness:1.75,diskTemperature:9800,diskSpeed:1.35,diskDensity:.75,doppler:1.35,starBrightness:1.1,bloom:.44,exposure:1.08}},Y=[{id:"spacetime",eyebrow:"01 / SPACETIME",title:"时空结构",controls:[{key:"mass",label:"质量",min:.5,max:2,step:.01,decimals:2},{key:"lensing",label:"透镜强度",min:0,max:2,step:.01,decimals:2,unit:"×"}]},{id:"disk",eyebrow:"02 / ACCRETION DISK",title:"吸积盘",controls:[{key:"diskInner",label:"盘内半径",min:1.5,max:6,step:.05,decimals:2},{key:"diskOuter",label:"盘外半径",min:4,max:14,step:.1,decimals:1},{key:"diskBrightness",label:"盘亮度",min:0,max:3,step:.01,decimals:2,unit:"×"},{key:"diskTemperature",label:"色温",min:1e3,max:12e3,step:50,decimals:0,unit:"K"},{key:"diskSpeed",label:"转速",min:0,max:2,step:.01,decimals:2,unit:"×"},{key:"diskDensity",label:"密度",min:.1,max:2,step:.01,decimals:2},{key:"doppler",label:"多普勒效应",min:0,max:2,step:.01,decimals:2,unit:"×"}]},{id:"image",eyebrow:"03 / LIGHT & IMAGE",title:"光与影像",controls:[{key:"starBrightness",label:"星光",min:0,max:2,step:.01,decimals:2,unit:"×"},{key:"bloom",label:"Bloom 光晕",min:0,max:1.5,step:.01,decimals:2},{key:"exposure",label:"曝光",min:.2,max:2.5,step:.01,decimals:2}]}],T=["gargantua","ember","sapphire"],g={gargantua:{label:"卡冈图雅",english:"GARGANTUA",description:"经典银金色吸积盘"},ember:{label:"余烬",english:"EMBER",description:"温暖、厚重的低频光芒"},sapphire:{label:"蓝宝石",english:"SAPPHIRE",description:"清冷、明亮的高能盘面"}},Q={low:"低",medium:"中",high:"高"},X={autoRotate:"自动旋转",diskVisible:"吸积盘",starsVisible:"星空"},J=["mass","lensing","diskInner","diskOuter","diskBrightness","diskTemperature","diskSpeed","diskDensity","doppler","starBrightness","bloom","exposure","quality","autoRotate","diskVisible","starsVisible"];let Z=0;function ee(i){return i==="low"||i==="medium"||i==="high"}function te(i){return i==="autoRotate"||i==="diskVisible"||i==="starsVisible"}function se(i){return i==="reset-view"||i==="screenshot"||i==="fullscreen"||i==="toggle-help"}function O(i,e,t){return Math.min(t,Math.max(e,i))}function r(i,e){const t=i.querySelector(e);if(!t)throw new Error(`UI 初始化失败：缺少元素 ${e}`);return t}class ae{params;callbacks;idPrefix;root;panel;panelToggle;panelClose;helpButton;helpDialog;fullscreenButton;qualitySelect;fpsOutput;scaleOutput;inclinationOutput;distanceOutput;activePresetOutput;toast;sliders=new Map;toggles=new Map;presetButtons=new Map;panelOpen=!0;toastTimer;constructor(e,t){this.params={...e},this.callbacks=t,this.idPrefix=`gargantua-ui-${++Z}`,this.root=document.createElement("div"),this.root.className="bh-ui",this.root.innerHTML=this.createMarkup(),this.panel=r(this.root,"[data-control-panel]"),this.panelToggle=r(this.root,"[data-panel-toggle]"),this.panelClose=r(this.root,"[data-panel-close]"),this.helpButton=r(this.root,'[data-action="toggle-help"]'),this.helpDialog=r(this.root,"[data-help-dialog]"),this.fullscreenButton=r(this.root,'[data-action="fullscreen"]'),this.qualitySelect=r(this.root,"[data-quality]"),this.fpsOutput=r(this.root,"[data-fps]"),this.scaleOutput=r(this.root,"[data-render-scale]"),this.inclinationOutput=r(this.root,"[data-inclination]"),this.distanceOutput=r(this.root,"[data-distance]"),this.activePresetOutput=r(this.root,"[data-active-preset]"),this.toast=r(this.root,"[data-toast]"),this.buildPresets(),this.buildParameterControls(),this.bindToggles(),this.bindActions(),this.bindPanel(),this.bindHelp(),document.body.append(this.root),this.syncControls(),this.setPanelOpen(!window.matchMedia("(max-width: 760px)").matches)}setParams(e){this.params={...e},this.syncControls()}setStatus(e,t){if(Number.isFinite(e)){const s=Math.max(0,Math.round(e));this.setOutput(this.fpsOutput,String(s)),this.fpsOutput.dataset.level=s<24?"low":"normal",this.fpsOutput.setAttribute("aria-label",`每秒 ${s} 帧`)}else this.setOutput(this.fpsOutput,"—"),this.fpsOutput.dataset.level="unknown",this.fpsOutput.setAttribute("aria-label","帧率未知");if(Number.isFinite(t)){const s=Math.max(0,Math.round(t*100));this.setOutput(this.scaleOutput,`${s}%`),this.scaleOutput.setAttribute("aria-label",`实际渲染比例 ${s}%`)}else this.setOutput(this.scaleOutput,"—"),this.scaleOutput.setAttribute("aria-label","实际渲染比例未知")}setViewInfo(e){if(Number.isFinite(e.inclination)){const t=Math.round(e.inclination*180/Math.PI),s=t===0?0:t,a=s>0?"+":"";this.setOutput(this.inclinationOutput,`${a}${s}°`),this.inclinationOutput.setAttribute("aria-label",`视线仰角 ${a}${s} 度`)}else this.setOutput(this.inclinationOutput,"—"),this.inclinationOutput.setAttribute("aria-label","视线仰角未知");Number.isFinite(e.distance)?(this.setOutput(this.distanceOutput,e.distance.toFixed(2)),this.distanceOutput.setAttribute("aria-label",`观测距离 ${e.distance.toFixed(2)} 场景单位`)):(this.setOutput(this.distanceOutput,"—"),this.distanceOutput.setAttribute("aria-label","观测距离未知"))}showToast(e){this.toastTimer!==void 0&&(window.clearTimeout(this.toastTimer),this.toastTimer=void 0),this.toast.classList.remove("is-visible"),this.toast.textContent=e,e.trim()&&(this.toast.offsetWidth,this.toast.classList.add("is-visible"),this.toastTimer=window.setTimeout(()=>{this.toast.classList.remove("is-visible"),this.toastTimer=void 0},2800))}createMarkup(){const e=this.idPrefix;return`
      <a class="skip-link" href="#${e}-controls" data-skip-controls>跳至参数控制</a>

      <header class="topbar" aria-label="卡冈图雅模拟器工具栏">
        <div class="brand" aria-label="卡冈图雅，实时黑洞模拟">
          <span class="brand__mark" aria-hidden="true"><span></span></span>
          <span class="brand__text">
            <strong>GARGANTUA</strong>
            <small>卡冈图雅 · 实时黑洞模拟</small>
          </span>
        </div>

        <div class="live-indicator" aria-label="模拟实时运行">
          <span aria-hidden="true"></span>
          LIVE
        </div>

        <nav class="action-bar" aria-label="画面操作">
          <button class="action-button" type="button" data-action="reset-view" aria-label="重置视角" title="重置视角">
            <span class="action-button__icon" aria-hidden="true">↺</span>
            <span class="action-button__label">重置视角</span>
          </button>
          <button class="action-button" type="button" data-action="screenshot" aria-label="保存画面" title="保存画面">
            <span class="action-button__icon action-button__icon--save" aria-hidden="true"></span>
            <span class="action-button__label">保存画面</span>
          </button>
          <button class="action-button" type="button" data-action="fullscreen" aria-label="切换全屏" aria-pressed="false" title="切换全屏">
            <span class="action-button__icon action-button__icon--fullscreen" aria-hidden="true"></span>
            <span class="action-button__label" data-fullscreen-label>全屏</span>
          </button>
          <button
            class="action-button"
            type="button"
            data-action="toggle-help"
            aria-label="操作帮助"
            aria-haspopup="dialog"
            aria-controls="${e}-help"
            aria-expanded="false"
            title="操作帮助"
          >
            <span class="action-button__icon action-button__icon--help" aria-hidden="true">?</span>
            <span class="action-button__label">操作帮助</span>
          </button>
          <span class="action-bar__divider" aria-hidden="true"></span>
          <button
            class="action-button action-button--panel"
            type="button"
            data-panel-toggle
            aria-label="展开或收起参数面板"
            aria-controls="${e}-controls"
            aria-expanded="true"
            title="参数面板"
          >
            <span class="action-button__icon action-button__icon--sliders" aria-hidden="true"><i></i><i></i><i></i></span>
            <span class="action-button__label">参数</span>
          </button>
        </nav>
      </header>

      <section class="telemetry" aria-label="实时观测数据">
        <div class="telemetry__item">
          <span class="telemetry__label">帧率 <small>FPS</small></span>
          <output data-fps aria-label="帧率未知">—</output>
        </div>
        <div class="telemetry__item">
          <span class="telemetry__label">渲染比例</span>
          <output data-render-scale aria-label="实际渲染比例未知">—</output>
        </div>
        <div class="telemetry__item">
          <span class="telemetry__label">倾角 <small>仰角</small></span>
          <output data-inclination aria-label="视线仰角未知">—</output>
        </div>
        <div class="telemetry__item">
          <span class="telemetry__label">距离 <small>SU</small></span>
          <output data-distance aria-label="观测距离未知">—</output>
        </div>
      </section>

      <button class="panel-scrim" type="button" data-panel-dismiss aria-label="关闭参数面板" tabindex="-1"></button>

      <aside class="control-panel" id="${e}-controls" data-control-panel aria-label="黑洞参数控制" tabindex="-1">
        <div class="control-panel__header">
          <div>
            <p class="eyebrow">OBSERVATION CONTROL</p>
            <h2>观测参数</h2>
          </div>
          <button class="panel-close" type="button" data-panel-close aria-label="收起参数面板" title="收起参数面板">
            <span aria-hidden="true"></span>
          </button>
        </div>

        <div class="control-panel__scroll">
          <section class="preset-section" aria-labelledby="${e}-preset-title">
            <div class="section-heading">
              <h3 id="${e}-preset-title">时空预设</h3>
              <span>PRESETS</span>
            </div>
            <div class="preset-grid" data-presets role="group" aria-label="选择黑洞预设"></div>
          </section>

          <div data-parameter-groups></div>

          <section class="control-group control-group--settings" aria-labelledby="${e}-settings-title">
            <div class="control-group__heading">
              <p class="eyebrow">04 / OBSERVATION</p>
              <h3 id="${e}-settings-title">观测设置</h3>
            </div>

            <div class="select-control">
              <label for="${e}-quality">画质</label>
              <div class="select-shell">
                <select id="${e}-quality" data-quality aria-describedby="${e}-quality-hint">
                  <option value="low">低 · 流畅优先</option>
                  <option value="medium">中 · 平衡</option>
                  <option value="high">高 · 细节优先</option>
                </select>
              </div>
              <p class="control-hint" id="${e}-quality-hint">调整实际渲染精度，不改变场景参数</p>
            </div>

            <div class="switch-list">
              <label class="switch-row" for="${e}-auto-rotate">
                <span class="switch-row__text">自动旋转<small>缓慢环绕观测目标</small></span>
                <input class="switch-input" id="${e}-auto-rotate" type="checkbox" role="switch" data-toggle="autoRotate" />
                <span class="switch-control" aria-hidden="true"></span>
              </label>
              <label class="switch-row" for="${e}-disk-visible">
                <span class="switch-row__text">显示吸积盘<small>切换盘面的可见性</small></span>
                <input class="switch-input" id="${e}-disk-visible" type="checkbox" role="switch" data-toggle="diskVisible" />
                <span class="switch-control" aria-hidden="true"></span>
              </label>
              <label class="switch-row" for="${e}-stars-visible">
                <span class="switch-row__text">显示星空<small>切换背景星场的可见性</small></span>
                <input class="switch-input" id="${e}-stars-visible" type="checkbox" role="switch" data-toggle="starsVisible" />
                <span class="switch-control" aria-hidden="true"></span>
              </label>
            </div>
          </section>
        </div>

        <footer class="control-panel__footer">
          <span>当前配置</span>
          <output data-active-preset>自定义</output>
          <span class="control-panel__footer-line" aria-hidden="true"></span>
          <span>REALTIME</span>
        </footer>
      </aside>

      <dialog class="help-dialog" id="${e}-help" data-help-dialog aria-labelledby="${e}-help-title">
        <div class="help-dialog__topline">
          <p class="eyebrow">NAVIGATION MANUAL / 01</p>
          <button class="help-dialog__close" type="button" data-help-close aria-label="关闭操作帮助" autofocus>
            <span aria-hidden="true">×</span>
          </button>
        </div>
        <h2 id="${e}-help-title">在引力边缘观测</h2>
        <p class="help-dialog__intro">所有调整都会实时作用于当前场景。放慢动作，观察光如何弯曲。</p>
        <dl class="help-list">
          <div><dt>拖动画面</dt><dd>环绕黑洞，改变观测方向</dd></div>
          <div><dt>滚轮 / 双指捏合</dt><dd>靠近或远离事件视界</dd></div>
          <div><dt>参数面板</dt><dd>实时调整时空、吸积盘与影像</dd></div>
          <div><dt>重置视角</dt><dd>返回初始观测位置</dd></div>
        </dl>
        <div class="help-dialog__footer">
          <span><kbd>Esc</kbd> 关闭帮助</span>
          <button class="text-button" type="button" data-help-close>继续观测 <span aria-hidden="true">→</span></button>
        </div>
      </dialog>

      <div class="toast" data-toast role="status" aria-live="polite" aria-atomic="true"></div>
    `}buildPresets(){const e=r(this.root,"[data-presets]");for(const t of T){const s=g[t],a=document.createElement("button");a.type="button",a.className=`preset-button preset-button--${t}`,a.dataset.preset=t,a.setAttribute("aria-pressed","false"),a.setAttribute("aria-label",`应用${s.label}预设：${s.description}`),a.title=s.description,a.innerHTML=`
        <span class="preset-button__swatch" aria-hidden="true"></span>
        <span class="preset-button__name">${s.label}</span>
        <small>${s.english}</small>
      `,a.addEventListener("click",()=>this.applyPreset(t)),e.append(a),this.presetButtons.set(t,a)}}buildParameterControls(){const e=r(this.root,"[data-parameter-groups]");for(const t of Y){const s=document.createElement("section");s.className="control-group",s.setAttribute("aria-labelledby",`${this.idPrefix}-${t.id}-title`);const a=document.createElement("div");a.className="control-group__heading";const n=document.createElement("p");n.className="eyebrow",n.textContent=t.eyebrow;const o=document.createElement("h3");o.id=`${this.idPrefix}-${t.id}-title`,o.textContent=t.title,a.append(n,o),s.append(a);for(const l of t.controls)s.append(this.createSlider(l));e.append(s)}}createSlider(e){const t=document.createElement("div");t.className="slider-control";const s=document.createElement("div");s.className="slider-control__header";const a=`${this.idPrefix}-${e.key}`,n=document.createElement("label");n.htmlFor=a,n.textContent=e.label;const o=document.createElement("output");o.id=`${a}-value`,o.setAttribute("for",a),o.setAttribute("aria-label",`${e.label}当前值`),s.append(n,o);const l=document.createElement("input");return l.id=a,l.type="range",l.min=String(e.min),l.max=String(e.max),l.step=String(e.step),l.dataset.parameter=e.key,l.setAttribute("aria-valuetext",""),l.title=`${e.label}：${e.min} 至 ${e.max}`,l.addEventListener("input",()=>{this.updateNumeric(e.key,Number(l.value))}),t.append(s,l),this.sliders.set(e.key,{config:e,input:l,output:o}),t}bindToggles(){this.qualitySelect.addEventListener("change",()=>{const t=this.qualitySelect.value;ee(t)&&(this.params.quality=t,this.emitParams(),this.showToast(`画质已切换为「${Q[t]}」`))}),this.root.querySelectorAll("[data-toggle]").forEach(t=>{const s=t.dataset.toggle;if(!te(s))throw new Error(`UI 初始化失败：未知开关 ${String(s)}`);this.toggles.set(s,t),t.addEventListener("change",()=>{this.params[s]=t.checked,this.emitParams(),this.showToast(`${X[s]}已${t.checked?"开启":"关闭"}`)})})}bindActions(){this.root.querySelectorAll("[data-action]").forEach(t=>{const s=t.dataset.action;if(!se(s))throw new Error(`UI 初始化失败：未知动作 ${String(s)}`);t.addEventListener("click",()=>this.handleAction(s))}),document.addEventListener("fullscreenchange",()=>{const t=document.fullscreenElement!==null;this.fullscreenButton.setAttribute("aria-pressed",String(t));const s=r(this.fullscreenButton,"[data-fullscreen-label]");s.textContent=t?"退出全屏":"全屏",this.fullscreenButton.setAttribute("aria-label",t?"退出全屏":"切换全屏")})}bindPanel(){this.panelToggle.addEventListener("click",()=>{const e=!this.panelOpen;this.setPanelOpen(e),e&&this.panelClose.focus({preventScroll:!0})}),this.panelClose.addEventListener("click",()=>{this.setPanelOpen(!1),this.panelToggle.focus({preventScroll:!0})}),r(this.root,"[data-panel-dismiss]").addEventListener("click",()=>{this.setPanelOpen(!1)}),r(this.root,"[data-skip-controls]").addEventListener("click",e=>{e.preventDefault(),this.setPanelOpen(!0),this.panel.focus({preventScroll:!0})}),this.panel.addEventListener("keydown",e=>{e.key!=="Escape"||!this.panelOpen||(e.preventDefault(),this.setPanelOpen(!1),this.panelToggle.focus({preventScroll:!0}))})}bindHelp(){this.helpDialog.querySelectorAll("[data-help-close]").forEach(t=>t.addEventListener("click",()=>this.helpDialog.close())),this.helpDialog.addEventListener("close",()=>{this.helpButton.setAttribute("aria-expanded","false")}),this.helpDialog.addEventListener("click",t=>{if(t.target!==this.helpDialog)return;const s=this.helpDialog.getBoundingClientRect();(t.clientX<s.left||t.clientX>s.right||t.clientY<s.top||t.clientY>s.bottom)&&this.helpDialog.close()})}handleAction(e){if(e==="toggle-help"){this.helpDialog.open?this.helpDialog.close():(this.helpDialog.showModal(),this.helpButton.setAttribute("aria-expanded","true")),this.callbacks.onAction(e);return}this.callbacks.onAction(e),e==="reset-view"?this.showToast("已返回初始观测视角"):e==="screenshot"&&this.showToast("正在保存当前画面")}applyPreset(e){this.params={...E[e]},this.syncControls(),this.callbacks.onParamsChange({...this.params}),this.showToast(`已应用「${g[e].label}」预设`)}updateNumeric(e,t){const s=this.sliders.get(e);!s||!Number.isFinite(t)||(this.params[e]=O(t,s.config.min,s.config.max),this.syncSliders(),this.emitParams())}emitParams(){this.updatePresetState(),this.callbacks.onParamsChange({...this.params})}syncControls(){this.syncSliders(),this.qualitySelect.value=this.params.quality,this.toggles.forEach((e,t)=>{e.checked=this.params[t]}),this.updatePresetState()}syncSliders(){this.sliders.forEach((e,t)=>{const s=this.params[t],{config:a,input:n,output:o}=e;n.value=String(s);const x=(Number(n.value)-a.min)/(a.max-a.min)*100;n.style.setProperty("--range-fill",`${O(x,0,100)}%`);const h=this.formatSliderValue(a,s);o.value=h,n.setAttribute("aria-valuetext",h)})}formatSliderValue(e,t){const s=e.key==="diskTemperature"?Math.round(t).toLocaleString("zh-CN"):t.toFixed(e.decimals);return e.unit?e.unit==="×"?`${s}×`:`${s} ${e.unit}`:s}updatePresetState(){const e=T.find(t=>J.every(s=>this.params[s]===E[t][s]))??null;this.presetButtons.forEach((t,s)=>{t.setAttribute("aria-pressed",String(s===e))}),this.setOutput(this.activePresetOutput,e?g[e].label:"自定义")}setPanelOpen(e){this.panelOpen=e,this.root.classList.toggle("panel-open",e),this.panel.classList.toggle("is-collapsed",!e),this.panel.inert=!e,this.panel.setAttribute("aria-hidden",String(!e)),this.panelToggle.setAttribute("aria-expanded",String(e))}setOutput(e,t){e.value!==t&&(e.value=t)}}const _=document.querySelector("#scene"),u=document.querySelector("#loading"),y=document.querySelector("#error-panel");if(!_)throw new Error("缺少 #scene 渲染容器。");let f={...v},c;function ie(i){if(console.error(i),u&&(u.classList.add("is-hidden"),u.setAttribute("aria-hidden","true")),y){const e=i instanceof Error?i.message:String(i);y.hidden=!1,y.textContent=`无法启动黑洞渲染器。请使用支持 WebGL 2 的最新版 Chrome、Edge 或 Firefox，并确认已开启硬件加速。${e?`（${e}）`:""}`}}async function ne(i){if(c)try{const e=await c.captureScreenshot(),t=URL.createObjectURL(e),s=document.createElement("a"),a=new Date().toISOString().replace(/[:.]/g,"-");s.href=t,s.download=`gargantua-${a}.png`,s.click(),setTimeout(()=>URL.revokeObjectURL(t),1e3),i.showToast("画面已保存为 PNG")}catch(e){console.error(e),i.showToast("保存失败，请稍后重试")}}async function oe(){document.fullscreenElement?await document.exitFullscreen():await document.documentElement.requestFullscreen()}function re(i,e){switch(i){case"reset-view":c?.resetView();break;case"screenshot":ne(e);break;case"fullscreen":oe().catch(()=>e.showToast("当前浏览器不允许全屏"));break}}try{const i=new ae(f,{onParamsChange:e=>{f={...e},c?.setParams(f)},onAction:e=>re(e,i)});c=new K(_,f),c.onFirstFrame=()=>{u&&(u.classList.add("is-hidden"),u.setAttribute("aria-hidden","true"))},c.onViewChange=e=>i.setViewInfo(e),c.onStatusChange=(e,t)=>i.setStatus(e,t),c.start()}catch(i){ie(i)}

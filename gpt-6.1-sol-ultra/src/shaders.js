export const vertexShader = `#version 300 es
precision highp float;
out vec2 vUv;
void main() {
  vec2 p = vec2((gl_VertexID << 1) & 2, gl_VertexID & 2);
  vUv = p;
  gl_Position = vec4(p * 2.0 - 1.0, 0.0, 1.0);
}`;

export const sceneShader = `#version 300 es
precision highp float;
in vec2 vUv;
out vec4 fragColor;
uniform vec2 uResolution;
uniform vec3 uCamera;
uniform float uTime, uMass, uLensing, uDiskOuter, uTemperature;
uniform float uBrightness, uDoppler, uThickness, uStars;
uniform int uSteps;
uniform sampler2D uSky;
const float PI = 3.14159265359;

float hash(vec2 p) { return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453); }
float noise(vec2 p) {
  vec2 i=floor(p), f=fract(p); f=f*f*(3.0-2.0*f);
  return mix(mix(hash(i),hash(i+vec2(1,0)),f.x),mix(hash(i+vec2(0,1)),hash(i+vec2(1,1)),f.x),f.y);
}
vec3 blackbody(float kelvin) {
  float t=clamp(kelvin,1000.0,40000.0)/100.0;
  float r=t<=66.0?1.0:1.292936*pow(t-60.0,-0.133205);
  float g=t<=66.0?0.390082*log(t)-0.631841:1.129891*pow(t-60.0,-0.075515);
  float b=t>=66.0?1.0:(t<=19.0?0.0:0.543207*log(t-10.0)-1.196254);
  return pow(clamp(vec3(r,g,b),0.0,1.0),vec3(2.2));
}
vec3 acceleration(vec3 p,float h2) {
  float r2=max(dot(p,p),0.0001);
  return -1.5*uMass*uLensing*h2*p/(r2*r2*sqrt(r2));
}
vec3 diskEmission(vec3 hit,vec3 velocity,float observerF) {
  float r=length(hit.xz)/uMass;
  float inner=2.85;
  float outer=uDiskOuter;
  float envelope=smoothstep(inner,inner+0.35,r)*(1.0-smoothstep(outer-1.8,outer,r));
  float angle=atan(hit.z,hit.x);
  float phase=angle-uTime*1.8/pow(r,1.5);
  float flow=noise(vec2(r*7.0,phase*4.0));
  float turbulence=noise(vec2(r*19.0+flow,phase*13.0));
  float fine=0.5+0.5*sin(r*92.0+flow*5.0+sin(phase*9.0)*0.5);
  float bands=0.5+0.5*sin(r*25.0+flow*3.5);
  float filaments=0.16+0.62*fine+0.42*bands+0.24*turbulence;
  float hotSpots=pow(noise(vec2(r*5.0,phase*8.0)),5.0)*0.6;
  float profile=pow(3.1/r,1.65)*envelope;
  float f=max(1.0-1.0/r,0.05);
  vec3 radial=normalize(hit);
  vec3 localRay=normalize(velocity+(inversesqrt(f)-1.0)*dot(velocity,radial)*radial);
  vec3 tangent=normalize(vec3(-hit.z,0.0,hit.x));
  float beta=sqrt(1.0/(2.0*max(r-1.0,1.0)));
  float doppler=sqrt(1.0-beta*beta)/(1.0-beta*dot(tangent,-localRay));
  float shift=clamp(doppler*sqrt(f/observerF),0.4,2.0);
  float frequency=pow(shift,uDoppler);
  float temp=uTemperature*pow(3.1/r,0.48)*frequency;
  vec3 color=blackbody(temp);
  color=mix(color,vec3(1.0,0.93,0.80),0.18*profile);
  return color*(filaments+hotSpots)*profile*2.7*uBrightness*pow(frequency,3.0);
}
vec3 sky(vec3 direction) {
  float longitude=atan(direction.z,direction.x)/(2.0*PI)+0.5;
  float latitude=acos(clamp(direction.y,-1.0,1.0))/PI;
  vec3 stars=textureLod(uSky,vec2(longitude,latitude),0.0).rgb;
  float dust=noise(direction.xz*8.0+direction.y*3.0);
  float band=pow(max(0.0,1.0-abs(direction.y*0.78+direction.x*0.32-0.18)),14.0);
  vec3 nebula=vec3(0.008,0.012,0.021)*band*(0.25+0.75*dust);
  return (stars*0.38+nebula)*uStars+vec3(0.0006,0.0009,0.0015);
}
vec3 aces(vec3 c) { return clamp((c*(2.51*c+0.03))/(c*(2.43*c+0.59)+0.14),0.0,1.0); }
void main() {
  vec2 uv=(vUv-0.5)*vec2(uResolution.x/uResolution.y,1.0);
  // A centered, fixed-focal-length lens. Zoom changes the observer distance.
  vec3 forward=normalize(-uCamera);
  vec3 right=normalize(cross(forward,vec3(0,1,0)));
  vec3 up=cross(right,forward);
  vec3 ray=normalize(forward*1.95+right*uv.x*2.0+up*uv.y*2.0);
  vec3 p=uCamera;
  float observerF=max(1.0-uMass/length(p),0.05);
  vec3 er=normalize(p);
  vec3 v=ray+(sqrt(observerF)-1.0)*dot(ray,er)*er;
  vec3 angularMomentum=cross(p,v);
  float h2=dot(angularMomentum,angularMomentum);
  vec3 light=vec3(0.0);
  float transmission=1.0;
  bool captured=false;
  float minR=1000.0;
  float escapeRadius=max(length(uCamera)+4.0,25.0*uMass);
  // Velocity Verlet integrates the Schwarzschild spatial orbit equation.
  // Lens strength is an artistic modification; 1.0 is the baseline model.
  for(int i=0;i<288;i++) {
    if(i>=uSteps) break;
    float r=length(p);
    minR=min(minR,r);
    if(r<1.015*uMass) { captured=true; break; }
    if(r>escapeRadius && dot(p,v)>0.0) break;
    float dt=clamp(r*0.065,0.025*uMass,1.35*uMass);
    vec3 oldP=p, oldV=v;
    vec3 a=acceleration(p,h2);
    p+=v*dt+0.5*a*dt*dt;
    v+=0.5*(a+acceleration(p,h2))*dt;
    if(oldP.y*p.y<0.0) {
      float t=oldP.y/(oldP.y-p.y);
      vec3 hit=mix(oldP,p,t);
      float diskR=length(hit.xz)/uMass;
      if(diskR>2.85 && diskR<uDiskOuter) {
        vec3 emission=diskEmission(hit,mix(oldV,v,t),observerF);
        float alpha=0.92;
        light+=transmission*alpha*emission;
        transmission*=1.0-alpha;
      }
    }
    // Thin emitting atmosphere gives a finite-width disk at edge-on views.
    vec3 midpoint=(oldP+p)*0.5;
    float diskR=length(midpoint.xz)/uMass;
    float height=abs(midpoint.y)/uMass;
    float thickness=uThickness*(0.6+diskR*0.07);
    if(diskR>2.9 && diskR<uDiskOuter && height<thickness*4.0) {
      float density=exp(-height/max(thickness,0.005))*0.17;
      float envelope=smoothstep(2.85,3.3,diskR)*(1.0-smoothstep(uDiskOuter-1.5,uDiskOuter,diskR));
      float opacity=1.0-exp(-density*dt/uMass/max(thickness,0.025)*0.55);
      vec3 color=blackbody(uTemperature*pow(3.1/diskR,0.48));
      light+=transmission*opacity*color*envelope*pow(3.1/diskR,1.5)*2.8*uBrightness;
      transmission*=1.0-opacity*0.65;
    }
  }
  // Unresolved critical rays approach the photon sphere. Other rays sample
  // the sky at their final bent direction, never at the original camera ray.
  if(!captured && !(minR<2.0*uMass && dot(p,v)<0.0)) light+=transmission*sky(normalize(v));
  vec3 color=pow(aces(light),vec3(1.0/2.2));
  fragColor=vec4(color,1.0);
}`;

export const bloomShader = `#version 300 es
precision highp float;
in vec2 vUv;
out vec4 fragColor;
uniform sampler2D uScene;
uniform vec2 uTexel;
vec3 bright(vec2 uv) { vec3 c=texture(uScene,uv).rgb; return c*smoothstep(0.5,1.0,max(c.r,max(c.g,c.b))); }
void main() {
  vec3 c=bright(vUv)*0.16;
  for(int i=0;i<8;i++) {
    float a=float(i)*0.785398;
    vec2 d=vec2(cos(a),sin(a));
    c+=bright(vUv+d*uTexel*4.0)*0.065;
    c+=bright(vUv+d*uTexel*10.0)*0.04;
  }
  fragColor=vec4(c,1.0);
}`;

export const compositeShader = `#version 300 es
precision highp float;
in vec2 vUv;
out vec4 fragColor;
uniform sampler2D uScene, uBloom;
uniform vec2 uBloomTexel, uResolution;
uniform float uGlow;
void main() {
  vec3 base=texture(uScene,vUv).rgb;
  vec3 bloom=texture(uBloom,vUv).rgb*0.28;
  for(int i=0;i<8;i++) {
    float a=float(i)*0.785398;
    vec2 d=vec2(cos(a),sin(a));
    bloom+=texture(uBloom,vUv+d*uBloomTexel*2.0).rgb*0.065;
    bloom+=texture(uBloom,vUv+d*uBloomTexel*7.0).rgb*0.025;
  }
  vec3 color=1.0-(1.0-base)*exp(-bloom*uGlow*0.75);
  vec2 q=vUv-0.5;
  float vignette=1.0-0.26*smoothstep(0.15,0.8,length(q));
  color*=vignette;
  // A very faint film grain avoids banding in the otherwise dark background.
  float grain=fract(sin(dot(gl_FragCoord.xy,vec2(12.9898,78.233)))*43758.5453)-0.5;
  color+=grain/255.0;
  fragColor=vec4(clamp(color,0.0,1.0),1.0);
}`;

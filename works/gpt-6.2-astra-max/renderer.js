"use strict";

const HorizonRenderer = (() => {
  const vertex = `#version 300 es
    out vec2 vUv;
    void main() {
      vec2 p = vec2((gl_VertexID << 1) & 2, gl_VertexID & 2);
      vUv = p;
      gl_Position = vec4(p * 2.0 - 1.0, 0.0, 1.0);
    }`;

  const scene = `#version 300 es
    precision highp float;
    precision highp sampler2D;
    in vec2 vUv;
    out vec4 pixel;
    uniform sampler2D uPath, uEscape, uSurface, uDust;
    uniform vec2 uSize, uTable;
    uniform vec3 uEye, uRight, uUp;
    uniform float uFocal, uDistance, uTemp, uOuter, uTime, uCenter, uPixelScale;
    uniform bool uLens, uDoppler, uStars;
    const float PI = 3.14159265359;
    const float TAU = 6.28318530718;
    const float CRIT = ${HorizonOptics.critical};
    const float LIMIT = ${HorizonOptics.angleLimit};
    const float SPLIT = ${HorizonOptics.split};
    const float CRITICAL_SCALE = ${HorizonOptics.criticalScale};
    const float CAPTURE_SPAN = ${HorizonOptics.captureSpan};
    const float ESCAPE_SPAN = ${HorizonOptics.escapeSpan};
    const float INNER = 6.0;

    float unpack16(vec2 channels) { return dot(channels, vec2(65280.0, 255.0)) / 65535.0; }
    float tableX(float b) {
      float logDistance=log(1.0+abs(b-CRIT)/CRITICAL_SCALE);
      float t = b < CRIT ? SPLIT*(1.0-logDistance/CAPTURE_SPAN) :
        SPLIT+(1.0-SPLIT)*logDistance/ESCAPE_SPAN;
      return (clamp(t,0.0,1.0)*(uTable.x-1.0)+0.5)/uTable.x;
    }
    float inverseRadius(float b, float tx, float phi) {
      if (!uLens) {
        if (phi >= PI || (b < 2.0 && phi > asin(clamp(b*0.5,0.0,1.0)))) return 0.0;
        return sin(phi)/max(b,0.0001);
      }
      float ty = (min(phi/LIMIT,1.0)*(uTable.y-1.0)+0.5)/uTable.y;
      return 0.5*unpack16(textureLod(uPath,vec2(tx,ty),0.0).rg);
    }
    vec3 hash3(vec2 cell) {
      vec3 p = fract(cell.xyx * vec3(.1031,.1030,.0973));
      p += dot(p,p.yxz+33.33);
      return fract((p.xxy+p.yzz)*p.zyx);
    }
    vec3 star(vec2 cell,vec2 withinCell,mat2 screenFromCell,float columns,float chance,float large,float mag) {
      cell.x = mod(cell.x,columns);
      vec3 random = hash3(cell+columns*0.23);
      if (random.z > chance) return vec3(0.0);
      vec2 offset = withinCell-(.19+.62*random.xy);
      float power = fract(random.x*47.37+random.y*23.83);
      vec2 psf=screenFromCell*offset;
      float width=mix(.34+.27*power,.43+.41*power,large)*(.90+.10*sqrt(mag));
      width=max(.50,width*uPixelScale);
      float area=width*width;
      float d2=dot(psf,psf);
      float light=exp(-d2/area);
      if (large > 0.5 && power > .76) {
        light += .065*exp(-d2/(area*10.0));
        vec2 a = abs(psf)/width;
        light += .071*exp(-min(a.x,a.y)*3.0-max(a.x,a.y)*.67);
      }
      vec3 tint = mix(vec3(.63,.79,1.0),vec3(1.0,.77,.53),random.y);
      return tint*light*(.057+pow(power,3.7)*mix(.94,3.6,large));
    }
    vec3 starLayer(vec2 uv, mat2 jacobian, float columns, float chance, float large) {
      vec2 cells=vec2(columns,columns*0.5), grid=uv*cells;
      vec2 cell=floor(grid), local=fract(grid);
      // 将源天球的偏移换回屏幕像素，分别计算星像的位置、亮度和成像宽度。
      mat2 j=mat2(jacobian[0]*cells,jacobian[1]*cells);
      float det=determinant(j);
      if(abs(det)<1e-9) return vec3(0.0);
      float mag=clamp(cells.x*cells.y/(TAU*PI*uFocal*uFocal*max(.06,cos((uv.y-.5)*PI))*abs(det)),.001,3.8);
      float unresolved=1.0-smoothstep(.38,1.1,max(length(j[0]),length(j[1])));
      if(unresolved<=0.0) return vec3(0.0);
      mat2 invJ=inverse(j);
      vec3 sum=star(cell,local,invJ,columns,chance,large,mag);
      vec2 stepCell=sign(local-.5);
      vec2 reach=3.0*uPixelScale*(abs(j[0])+abs(j[1]));
      bvec2 adjacent=lessThan(.19+min(local,1.0-local),reach);
      vec2 ox=vec2(stepCell.x,0.0),oy=vec2(0.0,stepCell.y);
      if(adjacent.x) sum+=star(cell+ox,local-ox,invJ,columns,chance,large,mag);
      if(adjacent.y) sum+=star(cell+oy,local-oy,invJ,columns,chance,large,mag);
      if(all(adjacent)) sum+=star(cell+stepCell,local-stepCell,invJ,columns,chance,large,mag);
      return sum*unresolved*pow(mag,.87);
    }
    vec3 sky(vec3 d, float footprint) {
      vec2 uv = vec2(atan(d.x,-d.z)/TAU+.5,asin(clamp(d.y,-1.0,1.0))/PI+.5);
      vec2 dx=dFdx(uv),dy=dFdy(uv);
      dx.x-=round(dx.x);dy.x-=round(dy.x);
      mat2 jacobian=mat2(dx,dy);
      float lod = max(0.0,log2(max(.001,footprint*1536.0/TAU)));
      vec3 dust = textureLod(uDust,uv,lod).rgb;
      vec3 background = pow(dust,vec3(2.20));
      float crowd = clamp((dust.r-.025)*4.0,0.0,.6);
      background += starLayer(uv,jacobian,1740.0,.099+crowd*.17,0.0);
      background += starLayer(uv,jacobian,597.0,.133+crowd*.10,1.0);
      return background;
    }

    // 以两段交错的流动相位采样同一张可环绕的纹理，避免长时间剪切把细丝拉成噪点。
    vec3 plasma(float az, float r, float order) {
      float radial = clamp(log(r/5.6)/log(42.0/5.6),0.0,1.0);
      float speed = .020*pow(7.5/r,1.5);
      float t = uTime/32.0;
      float t1 = fract(t), t2 = fract(t+.5);
      float phase1 = az - 32.0*speed*t1;
      float phase2 = az - 32.0*speed*t2;
      vec2 uv1=vec2(phase1,radial), uv2=vec2(phase2,radial);
      vec2 gx=dFdx(uv1), gy=dFdy(uv1);
      gx.x-=round(gx.x); gy.x-=round(gy.x);
      vec2 hx=dFdx(uv2), hy=dFdy(uv2);
      hx.x-=round(hx.x); hy.x-=round(hy.x);
      float filterScale = mix(.76,1.1,min(order,1.0));
      vec3 m1=textureGrad(uSurface,uv1,gx*filterScale,gy*filterScale).rgb;
      vec3 m2=textureGrad(uSurface,uv2,hx*filterScale,hy*filterScale).rgb;
      float blend=.5-.5*cos(TAU*t1);
      return mix(m2,m1,blend);
    }
    vec3 spectrum(float heat) {
      vec3 copper = mix(vec3(.52,.044,.007),vec3(.99,.245,.046),smoothstep(.09,.48,heat));
      vec3 amber = mix(copper,vec3(1.0,.51,.18),smoothstep(.43,.76,heat));
      vec3 warm = mix(amber,vec3(1.0,.81,.55),smoothstep(.70,1.0,heat));
      vec3 white = mix(warm,vec3(.83,.91,1.0),smoothstep(1.0,1.39,heat));
      return mix(white,vec3(.31,.57,1.0),smoothstep(1.25,2.35,heat));
    }
    vec4 emission(float r,float b,float phi,vec3 side,float order) {
      vec3 axis=cos(phi)*uEye+sin(phi)*side;
      float az=atan(axis.z,axis.x)/TAU;
      vec3 mat=plasma(az,r,order);
      float taper=smoothstep(INNER,INNER+.70,r)*(1.0-smoothstep(uOuter*.72,uOuter,r));
      float density=(.054+1.19*pow(mat.r,2.4)+1.66*pow(mat.g,3.15)+1.06*pow(mat.b,1.85))*(.62+.81*mat.r);
      float beam=1.0;
      if(uDoppler) {
        vec3 tangent=normalize(vec3(-axis.z,0.0,axis.x));
        vec3 angular=-sin(phi)*uEye+cos(phi)*side;
        float along=dot(tangent,-angular)*min(1.0,b*sqrt(max(.01,1.0-2.0/r))/r);
        float beta=inversesqrt(r-2.0);
        beam=sqrt(1.0-beta*beta)/(1.0-beta*along);
      }
      float tempRatio=uTemp/5200.0;
      float radial=pow(7.8/r,1.83);
      float heat=(.19+.59*pow(7.8/r,1.10)+.23*(mat.r-.45)+.20*mat.b)*pow(beam,.46)+(tempRatio-1.0)*.91;
      float intensity=3.85*radial*density*pow(beam,1.82)*pow(tempRatio,.22);
      float alpha=taper*(.91+.08*mat.r);
      float facing=smoothstep(.0,.079,abs(uEye.y));
      float transmission=order<.5 ? mix(.66,1.0,facing) : (order<1.5 ? mix(.66,.265,facing) : .145);
      return vec4(spectrum(heat)*intensity*transmission*alpha,alpha);
    }
    vec4 diskHit(float b,float tx,float start,float phi,vec3 side,float order) {
      float invR=inverseRadius(b,tx,phi+start);
      float r=1.0/max(invR,0.0001);
      if(r < INNER || r > uOuter) return vec4(0.0);
      return emission(r,b,phi,side,order);
    }
    float radialAngle(float b,float radius) {
      float q=b/radius;
      vec3 t=q*vec3(.1127016654,.5,.8872983346);
      vec3 integrand=inversesqrt(max(vec3(.001),1.0-t*t+2.0*t*t*t/max(.0001,b)));
      return q*dot(integrand,vec3(.277777778,.444444444,.277777778));
    }
    vec3 composite(vec3 back,vec4 front){return back*(1.0-front.a)+front.rgb;}

    void main() {
      vec2 image=(vUv-vec2(.50,uCenter))*uSize;
      float imageRadius=max(length(image),.0001);
      vec3 side=(image.x*uRight+image.y*uUp)/imageRadius;
      float ang=atan(imageRadius/uFocal);
      float b=uDistance*sin(ang);
      if(uLens) b*=inversesqrt(1.0-2.0/uDistance);
      float tx=tableX(b);
      float start=uLens ? radialAngle(b,uDistance) : ang;
      float end=uLens ? LIMIT*unpack16(textureLod(uEscape,vec2(tx,.5),0.0).rg) : PI;
      float turn=end-start;
      vec3 direction=cos(turn)*uEye+sin(turn)*side;
      float footprint=max(length(dFdx(direction)),length(dFdy(direction)));
      vec3 color=vec3(.00018,.00024,.00032);
      bool escaped=b>(uLens ? CRIT : 2.0);
      if(escaped && uStars) color=sky(direction,max(.00003,footprint));
      if(b < uOuter+2.6) {
        float phase=mod(atan(-uEye.y,side.y)+PI,PI);
        // 有限盘厚的迎光面沿光线稍早于中面相交。
        float amplitude=length(vec2(uEye.y,side.y));
        float heightAngle=asin(clamp(.010/max(.0101,amplitude),0.0,.98));
        float base=phase-heightAngle;
        if(uLens) {
          color=composite(color,diskHit(b,tx,start,max(0.0,base+TAU),side,2.0));
          color=composite(color,diskHit(b,tx,start,max(0.0,base+PI),side,1.0));
        }
        float firstFace=base>=0.0 ? base : phase+heightAngle;
        color=composite(color,diskHit(b,tx,start,firstFace,side,0.0));
        // 侧视时，还能看见盘外缘的垂向发光层。直接取入射光线在该半径的纬度。
        float rimRadius=uOuter*.84;
        if(abs(uEye.y)<.079 && b<rimRadius) {
          float nearAngle=(uLens ? radialAngle(b,rimRadius) : asin(b/rimRadius))-start;
          float latitude=abs(cos(nearAngle)*uEye.y+sin(nearAngle)*side.y);
          float edgeWeight=(1.0-smoothstep(.005,.017,latitude))*(1.0-smoothstep(.019,.079,abs(uEye.y)));
          if(edgeWeight>.001) color=composite(color,emission(rimRadius,b,nearAngle,side,0.0)*edgeWeight);
        }
        if(uLens) {
          float ringWidth=max(.016,.53*length(vec2(dFdx(b),dFdy(b))));
          float line=exp(-abs(b-CRIT)/ringWidth)*.019;
          color+=line*spectrum(.68*pow(uTemp/5200.0,.83));
        }
      }
      // 对数编码保留暗部星云的层次，也为盘面高光留出动态范围。
      pixel=vec4(log2(1.0+min(color,12.0)*1000.0)/log2(12001.0),1.0);
    }`;

  const preamble = `#version 300 es
    precision highp float;
    in vec2 vUv;
    out vec4 pixel;
    uniform sampler2D uImage;
    vec3 decode(vec3 v){return (exp2(v*log2(12001.0))-1.0)*.001;}
    vec3 encode(vec3 v){return log2(1.0+min(v,12.0)*1000.0)/log2(12001.0);}
  `;
  const extract = preamble + `
    uniform vec2 uStep;
    void main(){
      vec3 c=decode(texture(uImage,vUv+vec2(uStep.x,uStep.y)).rgb);
      c+=decode(texture(uImage,vUv+vec2(-uStep.x,uStep.y)).rgb);
      c+=decode(texture(uImage,vUv+vec2(uStep.x,-uStep.y)).rgb);
      c+=decode(texture(uImage,vUv-uStep).rgb);
      c*=.25;
      float m=max(c.r,max(c.b,c.g));
      pixel=vec4(encode(c*smoothstep(.39,1.65,m)),1.0);
    }`;
  const reduce = preamble + `
    uniform vec2 uStep;
    void main(){
      vec3 c=decode(texture(uImage,vUv+uStep).rgb)+decode(texture(uImage,vUv-uStep).rgb);
      vec2 other=vec2(uStep.x,-uStep.y);
      c+=decode(texture(uImage,vUv+other).rgb)+decode(texture(uImage,vUv-other).rgb);
      pixel=vec4(encode(c*.25),1.0);
    }`;
  const blur = preamble + `
    uniform vec2 uStep;
    void main(){
      vec3 c=decode(texture(uImage,vUv).rgb)*.227027;
      c+=decode(texture(uImage,vUv+uStep*1.384615).rgb)*.316216;
      c+=decode(texture(uImage,vUv-uStep*1.384615).rgb)*.316216;
      c+=decode(texture(uImage,vUv+uStep*3.230769).rgb)*.070270;
      c+=decode(texture(uImage,vUv-uStep*3.230769).rgb)*.070270;
      pixel=vec4(encode(c),1.0);
    }`;
  const finish = preamble + `
    uniform sampler2D uNear, uFar;
    void main(){
      vec3 c=decode(texture(uImage,vUv).rgb);
      c+=.24*decode(texture(uNear,vUv).rgb)+.13*decode(texture(uFar,vUv).rgb);
      float vignette=1.0-.16*smoothstep(.18,.77,length(vUv-vec2(.5)));
      vec3 displayColor=pow(1.0-exp(-c*vignette),vec3(1.0/2.2));
      float grain=fract(52.9829189*fract(dot(gl_FragCoord.xy,vec2(.06711056,.00583715))))-.5;
      pixel=vec4(displayColor+grain/255.0,1.0);
    }`;

  function makeProgram(gl, fragment, label) {
    function compile(kind, source) {
      const shader = gl.createShader(kind);
      gl.shaderSource(shader, source);
      gl.compileShader(shader);
      if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
        const message = gl.getShaderInfoLog(shader);
        gl.deleteShader(shader);
        throw new Error(label + "着色器编译失败 " + message);
      }
      return shader;
    }
    const vs = compile(gl.VERTEX_SHADER, vertex);
    const fs = compile(gl.FRAGMENT_SHADER, fragment);
    const program = gl.createProgram();
    gl.attachShader(program, vs);
    gl.attachShader(program, fs);
    gl.linkProgram(program);
    gl.deleteShader(vs);
    gl.deleteShader(fs);
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) throw new Error(label + "链接失败 " + gl.getProgramInfoLog(program));
    const locations = {};
    for (let i = 0; i < gl.getProgramParameter(program, gl.ACTIVE_UNIFORMS); i++) {
      const name = gl.getActiveUniform(program,i).name;
      locations[name] = gl.getUniformLocation(program,name);
    }
    return { program, locations };
  }

  function materialImage(data) {
    const img = new Image();
    img.src = data;
    return img.decode().then(() => img);
  }

  async function create(canvas) {
    const gl = canvas.getContext("webgl2", { alpha:false, depth:false, stencil:false, antialias:false, powerPreference:"high-performance" });
    if (!gl) throw new Error("此浏览器无法创建 WebGL 2 上下文。可在浏览器设置中启用硬件加速后重新载入。");
    const images = Promise.all([materialImage(HORIZON_MATERIALS.disk), materialImage(HORIZON_MATERIALS.dust)]);
    const scenePass = makeProgram(gl,scene,"光路");
    const extractPass = makeProgram(gl,extract,"辉光提取");
    const reducePass = makeProgram(gl,reduce,"辉光降采样");
    const blurPass = makeProgram(gl,blur,"辉光扩散");
    const finalPass = makeProgram(gl,finish,"成像");
    const table = HorizonOptics.build();
    gl.pixelStorei(gl.UNPACK_ALIGNMENT,1);
    const anisotropy = gl.getExtension("EXT_texture_filter_anisotropic");
    function texture() {
      const tex = gl.createTexture();
      gl.bindTexture(gl.TEXTURE_2D,tex);
      gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MIN_FILTER,gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MAG_FILTER,gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_S,gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_T,gl.CLAMP_TO_EDGE);
      return tex;
    }
    function lookup(data,h) {
      const tex=texture();
      gl.texImage2D(gl.TEXTURE_2D,0,gl.RG8,table.width,h,0,gl.RG,gl.UNSIGNED_BYTE,data);
      return tex;
    }
    const path=lookup(table.path,table.height);
    const escape=lookup(table.escape,1);
    const [surface,dust]=(await images).map(img=>{
      const tex=texture();
      gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA,gl.RGBA,gl.UNSIGNED_BYTE,img);
      gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_S,gl.REPEAT);
      gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MIN_FILTER,gl.LINEAR_MIPMAP_LINEAR);
      gl.generateMipmap(gl.TEXTURE_2D);
      if (anisotropy) gl.texParameterf(gl.TEXTURE_2D,anisotropy.TEXTURE_MAX_ANISOTROPY_EXT,Math.min(4, gl.getParameter(anisotropy.MAX_TEXTURE_MAX_ANISOTROPY_EXT)));
      return tex;
    });
    function source(unit,tex) {
      gl.activeTexture(gl.TEXTURE0+unit);
      gl.bindTexture(gl.TEXTURE_2D,tex);
    }
    function target(divisor) {
      const tex=texture();
      const framebuffer=gl.createFramebuffer();
      gl.bindFramebuffer(gl.FRAMEBUFFER,framebuffer);
      gl.framebufferTexture2D(gl.FRAMEBUFFER,gl.COLOR_ATTACHMENT0,gl.TEXTURE_2D,tex,0);
      return {tex,framebuffer,divisor,w:0,h:0};
    }
    const main=target(1), nearX=target(4), nearY=target(4), near=target(4);
    const farInput=target(16),farX=target(16),far=target(16);
    const buffers=[main,nearX,nearY,near,farInput,farX,far];
    let width=0,height=0;
    function resize(w,h) {
      if(width===w && height===h) return;
      width=w; height=h; canvas.width=w; canvas.height=h;
      for(const buf of buffers){
        buf.w=Math.max(1,Math.ceil(w/buf.divisor)); buf.h=Math.max(1,Math.ceil(h/buf.divisor));
        gl.bindTexture(gl.TEXTURE_2D,buf.tex);
        gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA8,buf.w,buf.h,0,gl.RGBA,gl.UNSIGNED_BYTE,null);
        gl.bindFramebuffer(gl.FRAMEBUFFER,buf.framebuffer);
        if(gl.checkFramebufferStatus(gl.FRAMEBUFFER)!==gl.FRAMEBUFFER_COMPLETE) throw new Error("无法分配观测画面的显存。");
      }
    }
    function begin(pass,buf) {
      gl.useProgram(pass.program);
      gl.bindFramebuffer(gl.FRAMEBUFFER,buf?buf.framebuffer:null);
      gl.viewport(0,0,buf?buf.w:width,buf?buf.h:height);
      return pass.locations;
    }
    function draw(){gl.drawArrays(gl.TRIANGLES,0,3);}
    function filter(pass,input,output,x,y) {
      const loc=begin(pass,output);
      source(0,input.tex);
      gl.uniform1i(loc.uImage,0); gl.uniform2f(loc.uStep,x,y); draw();
    }
    function render(state, seconds, w, h, center=.475, pixelScale=1) {
      resize(w,h);
      const yaw=state.yaw*Math.PI/180, pitch=state.pitch*Math.PI/180, roll=state.roll*Math.PI/180;
      const cy=Math.cos(yaw),sy=Math.sin(yaw),ce=Math.cos(pitch),se=Math.sin(pitch),cr=Math.cos(roll),sr=Math.sin(roll);
      const right=[cy,0,-sy],up=[-sy*se,ce,-cy*se];
      const l=begin(scenePass,main);
      source(0,path); source(1,escape); source(2,surface); source(3,dust);
      gl.uniform1i(l.uPath,0); gl.uniform1i(l.uEscape,1); gl.uniform1i(l.uSurface,2); gl.uniform1i(l.uDust,3);
      gl.uniform2f(l.uSize,w,h); gl.uniform2f(l.uTable,table.width,table.height);
      gl.uniform3f(l.uEye,sy*ce,se,cy*ce);
      gl.uniform3fv(l.uRight,right.map((v,i)=>v*cr-up[i]*sr));
      gl.uniform3fv(l.uUp,up.map((v,i)=>v*cr+right[i]*sr));
      const shadowRadius=Math.min(w*(w<h ? .123 : .116),h*.155);
      const focal=shadowRadius*76/HorizonOptics.critical*state.zoom;
      const distance=76/state.mass;
      gl.uniform1f(l.uFocal,focal); gl.uniform1f(l.uDistance,distance);
      gl.uniform1f(l.uCenter,center); gl.uniform1f(l.uTemp,state.temperature);
      gl.uniform1f(l.uPixelScale,pixelScale);
      gl.uniform1f(l.uOuter,state.radius); gl.uniform1f(l.uTime,seconds%32);
      gl.uniform1i(l.uLens,state.lensing); gl.uniform1i(l.uDoppler,state.doppler); gl.uniform1i(l.uStars,state.stars); draw();
      filter(extractPass,main,nearX,1.0/w,1.0/h);
      filter(blurPass,nearX,nearY,1.2/nearX.w,0);
      filter(blurPass,nearY,near,0,1.2/nearY.h);
      filter(reducePass,near,farInput,1.0/near.w,1.0/near.h);
      filter(blurPass,farInput,farX,1.0/farInput.w,0);
      filter(blurPass,farX,far,0,1.0/farX.h);
      const f=begin(finalPass,null);
      source(0,main.tex); source(1,near.tex); source(2,far.tex);
      gl.uniform1i(f.uImage,0); gl.uniform1i(f.uNear,1); gl.uniform1i(f.uFar,2); draw();
      return focal/distance;
    }
    return {render,gl};
  }
  return {create};
})();

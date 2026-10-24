import { vertexShader, sceneShader, bloomShader, compositeShader } from './shaders.js';

const QUALITY = { high: {scale:1.15, steps:256}, medium:{scale:0.85,steps:208}, low:{scale:0.55,steps:168} };

export class BlackHoleRenderer {
  constructor(canvas, params) {
    this.canvas=canvas;
    this.params=params;
    this.gl=canvas.getContext('webgl2',{alpha:false,antialias:false,depth:false,stencil:false,powerPreference:'high-performance',preserveDrawingBuffer:false});
    if(!this.gl) throw new Error('当前浏览器无法使用 WebGL 2。请开启硬件加速，或使用最新版 Edge / Chrome / Firefox。');
    this.scale=0.85;
    this.steps=208;
    this.quality='auto';
    this.camera={azimuth:0.22,elevation:8*Math.PI/180,distance:18};
    this.targetCamera={...this.camera};
    this.programs={scene:this.createProgram(sceneShader),bloom:this.createProgram(bloomShader),composite:this.createProgram(compositeShader)};
    this.sky=this.createSkyTexture();
    this.scene=this.createTarget();
    this.bloom=this.createTarget();
    this.width=0; this.height=0;
    this.lost=false;
    this.gpuSamples=[];
    this.timer=this.gl.getExtension('EXT_disjoint_timer_query_webgl2');
    this.pendingQueries=[];
    this.gpuMs=0;
    this.lastAdaptive=0;
    this.resizeObserver=new ResizeObserver(()=>{if(this.resize())this.onResize?.();});
    this.resizeObserver.observe(canvas);
    canvas.addEventListener('webglcontextlost',event=>{event.preventDefault();this.lost=true;this.onError?.('图形上下文已中断。请重新加载以恢复预览。');});
    canvas.addEventListener('webglcontextrestored',()=>location.reload());
    this.resize();
  }
  createProgram(fragment) {
    const gl=this.gl;
    const compile=(type,source)=>{
      const shader=gl.createShader(type);gl.shaderSource(shader,source);gl.compileShader(shader);
      if(!gl.getShaderParameter(shader,gl.COMPILE_STATUS)){const info=gl.getShaderInfoLog(shader);gl.deleteShader(shader);throw new Error(`着色器编译失败：${info}`);}
      return shader;
    };
    const vertex=compile(gl.VERTEX_SHADER,vertexShader), frag=compile(gl.FRAGMENT_SHADER,fragment);
    const program=gl.createProgram();gl.attachShader(program,vertex);gl.attachShader(program,frag);gl.linkProgram(program);
    gl.deleteShader(vertex);gl.deleteShader(frag);
    if(!gl.getProgramParameter(program,gl.LINK_STATUS))throw new Error(`图形程序链接失败：${gl.getProgramInfoLog(program)}`);
    const uniforms={};
    const count=gl.getProgramParameter(program,gl.ACTIVE_UNIFORMS);
    for(let i=0;i<count;i++){const info=gl.getActiveUniform(program,i);uniforms[info.name]=gl.getUniformLocation(program,info.name);}
    return {program,uniforms};
  }
  createTarget() {
    const gl=this.gl;
    const texture=gl.createTexture();gl.bindTexture(gl.TEXTURE_2D,texture);
    gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MIN_FILTER,gl.LINEAR);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MAG_FILTER,gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_S,gl.CLAMP_TO_EDGE);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_T,gl.CLAMP_TO_EDGE);
    const framebuffer=gl.createFramebuffer();
    gl.bindFramebuffer(gl.FRAMEBUFFER,framebuffer);gl.framebufferTexture2D(gl.FRAMEBUFFER,gl.COLOR_ATTACHMENT0,gl.TEXTURE_2D,texture,0);
    gl.bindFramebuffer(gl.FRAMEBUFFER,null);
    return {texture,framebuffer,width:0,height:0};
  }
  sizeTarget(target,width,height) {
    if(target.width===width && target.height===height)return;
    const gl=this.gl;target.width=width;target.height=height;
    gl.bindTexture(gl.TEXTURE_2D,target.texture);gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA8,width,height,0,gl.RGBA,gl.UNSIGNED_BYTE,null);
    gl.bindFramebuffer(gl.FRAMEBUFFER,target.framebuffer);
    if(gl.checkFramebufferStatus(gl.FRAMEBUFFER)!==gl.FRAMEBUFFER_COMPLETE)throw new Error('无法创建渲染缓冲区。请切换到流畅画质。');
    gl.bindFramebuffer(gl.FRAMEBUFFER,null);
  }
  createSkyTexture() {
    const sky=document.createElement('canvas');sky.width=2048;sky.height=1024;
    const ctx=sky.getContext('2d');ctx.fillStyle='#010205';ctx.fillRect(0,0,sky.width,sky.height);
    let seed=52841;
    const random=()=>{seed=(1664525*seed+1013904223)>>>0;return seed/4294967296;};
    for(let i=0;i<5000;i++){
      const x=random()*sky.width, y=Math.acos(random()*2-1)/Math.PI*sky.height;
      const bright=random(), radius=bright>0.988?1.3:bright>0.94?0.8:0.3+random()*0.35;
      const c=random(), rgb=c<0.15?'159,187,230':c>0.85?'232,202,160':'215,219,229';
      const alpha=0.22+bright*0.65;
      if(bright>0.975){const glow=ctx.createRadialGradient(x,y,0,x,y,radius*5);glow.addColorStop(0,`rgba(${rgb},${alpha*0.4})`);glow.addColorStop(1,`rgba(${rgb},0)`);ctx.fillStyle=glow;ctx.fillRect(x-radius*5,y-radius*5,radius*10,radius*10);}
      ctx.fillStyle=`rgba(${rgb},${alpha})`;ctx.beginPath();ctx.arc(x,y,radius,0,Math.PI*2);ctx.fill();
    }
    const gl=this.gl,texture=gl.createTexture();gl.bindTexture(gl.TEXTURE_2D,texture);
    gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA,gl.RGBA,gl.UNSIGNED_BYTE,sky);
    gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_S,gl.REPEAT);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_T,gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MIN_FILTER,gl.LINEAR_MIPMAP_LINEAR);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MAG_FILTER,gl.LINEAR);gl.generateMipmap(gl.TEXTURE_2D);
    return texture;
  }
  setQuality(quality) {
    this.quality=quality;
    const settings=QUALITY[quality] || QUALITY.medium;
    this.scale=settings.scale;this.steps=settings.steps;
    this.pendingQueries.forEach(query=>this.gl.deleteQuery(query));this.pendingQueries=[];this.gpuSamples=[];
    this.resize();
  }
  resize() {
    if(this.lost)return;
    const rect=this.canvas.getBoundingClientRect();
    if(!rect.width || !rect.height)return;
    const dpr=Math.min(window.devicePixelRatio||1,1.5);
    const displayWidth=Math.round(rect.width*dpr),displayHeight=Math.round(rect.height*dpr);
    const displayChanged=this.canvas.width!==displayWidth||this.canvas.height!==displayHeight;
    if(this.canvas.width!==displayWidth)this.canvas.width=displayWidth;
    if(this.canvas.height!==displayHeight)this.canvas.height=displayHeight;
    // The costly orbit integration is resolution-limited independently of DPR.
    const maxPixels=1500000;
    let scale=this.scale;
    if(rect.width*rect.height*scale*scale>maxPixels)scale=Math.sqrt(maxPixels/(rect.width*rect.height));
    const width=Math.max(1,Math.round(rect.width*scale)),height=Math.max(1,Math.round(rect.height*scale));
    const changed=displayChanged||this.width!==width||this.height!==height;
    this.width=width;this.height=height;
    this.sizeTarget(this.scene,this.width,this.height);
    this.sizeTarget(this.bloom,Math.max(1,Math.round(this.width/4)),Math.max(1,Math.round(this.height/4)));
    return changed;
  }
  bindTexture(texture,unit,uniform) {const gl=this.gl;gl.activeTexture(gl.TEXTURE0+unit);gl.bindTexture(gl.TEXTURE_2D,texture);gl.uniform1i(uniform,unit);}
  draw(time) {
    if(this.lost || !this.width)return;
    const gl=this.gl, p=this.params;
    for(const key of ['azimuth','elevation','distance'])this.camera[key]+=(this.targetCamera[key]-this.camera[key])*0.16;
    const c=this.camera;
    const camera=[Math.sin(c.azimuth)*Math.cos(c.elevation)*c.distance,Math.sin(c.elevation)*c.distance,Math.cos(c.azimuth)*Math.cos(c.elevation)*c.distance];
    let query;
    if(this.timer && this.quality==='auto' && this.pendingQueries.length<4 && Math.random()<0.12){query=gl.createQuery();gl.beginQuery(this.timer.TIME_ELAPSED_EXT,query);}
    gl.bindFramebuffer(gl.FRAMEBUFFER,this.scene.framebuffer);gl.viewport(0,0,this.width,this.height);
    const scene=this.programs.scene;gl.useProgram(scene.program);const s=scene.uniforms;
    gl.uniform2f(s.uResolution,this.width,this.height);gl.uniform3fv(s.uCamera,camera);
    gl.uniform1f(s.uTime,time);gl.uniform1f(s.uMass,p.mass);gl.uniform1f(s.uLensing,p.lensing);gl.uniform1f(s.uDiskOuter,p.diskOuter);gl.uniform1f(s.uTemperature,p.temperature);
    gl.uniform1f(s.uBrightness,p.brightness);gl.uniform1f(s.uDoppler,p.doppler);gl.uniform1f(s.uThickness,p.thickness);gl.uniform1f(s.uStars,p.stars);gl.uniform1i(s.uSteps,this.steps);this.bindTexture(this.sky,0,s.uSky);gl.drawArrays(gl.TRIANGLES,0,3);
    gl.bindFramebuffer(gl.FRAMEBUFFER,this.bloom.framebuffer);gl.viewport(0,0,this.bloom.width,this.bloom.height);
    const bloom=this.programs.bloom;gl.useProgram(bloom.program);gl.uniform2f(bloom.uniforms.uTexel,1/this.width,1/this.height);this.bindTexture(this.scene.texture,0,bloom.uniforms.uScene);gl.drawArrays(gl.TRIANGLES,0,3);
    gl.bindFramebuffer(gl.FRAMEBUFFER,null);gl.viewport(0,0,this.canvas.width,this.canvas.height);
    const composite=this.programs.composite;gl.useProgram(composite.program);const co=composite.uniforms;
    gl.uniform2f(co.uBloomTexel,1/this.bloom.width,1/this.bloom.height);gl.uniform2f(co.uResolution,this.canvas.width,this.canvas.height);gl.uniform1f(co.uGlow,p.glow);this.bindTexture(this.scene.texture,0,co.uScene);this.bindTexture(this.bloom.texture,1,co.uBloom);gl.drawArrays(gl.TRIANGLES,0,3);
    if(query){gl.endQuery(this.timer.TIME_ELAPSED_EXT);this.pendingQueries.push(query);}
    if(this.timer && this.pendingQueries.length){
      const oldest=this.pendingQueries[0];
      if(gl.getQueryParameter(oldest,gl.QUERY_RESULT_AVAILABLE)){
        if(!gl.getParameter(this.timer.GPU_DISJOINT_EXT)){this.gpuMs=gl.getQueryParameter(oldest,gl.QUERY_RESULT)/1e6;this.gpuSamples.push(this.gpuMs);if(this.gpuSamples.length>20)this.gpuSamples.shift();}
        gl.deleteQuery(oldest);this.pendingQueries.shift();
      }
    }
  }
  adapt(frameMs,now) {
    if(this.quality!=='auto' || now-this.lastAdaptive<3500)return;
    const measured=this.gpuSamples.length>5?this.gpuSamples.reduce((a,b)=>a+b,0)/this.gpuSamples.length:frameMs;
    const old=this.scale;
    if(measured>26)this.scale=Math.max(0.4,this.scale*0.82);
    else if(measured<12)this.scale=Math.min(1.05,this.scale*1.08);
    this.lastAdaptive=now;
    if(Math.abs(old-this.scale)>0.005){this.steps=this.scale<0.6?168:208;this.resize();this.gpuSamples=[];}
  }
  resetView(view='cinema',immediate=false) {
    const elevation={cinema:8,top:70,edge:0.7}[view]??8;
    this.targetCamera={azimuth:0.22,elevation:elevation*Math.PI/180,distance:view==='top'?20:18};
    if(immediate)this.camera={...this.targetCamera};
  }
  snapshot(time) {
    this.draw(time);
    return new Promise((resolve,reject)=>this.canvas.toBlob(blob=>blob?resolve(blob):reject(new Error('截图保存失败')),'image/png'));
  }
  dispose() {
    this.resizeObserver.disconnect();
    const gl=this.gl;
    Object.values(this.programs).forEach(p=>gl.deleteProgram(p.program));
    [this.scene,this.bloom].forEach(target=>{gl.deleteTexture(target.texture);gl.deleteFramebuffer(target.framebuffer);});
    gl.deleteTexture(this.sky);this.pendingQueries.forEach(query=>gl.deleteQuery(query));
  }
}

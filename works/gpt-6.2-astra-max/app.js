"use strict";

const HORIZON_PRESETS = Object.freeze({
  cinema: {mass:1, temperature:5200, radius:22, yaw:24, pitch:5.5, roll:8, zoom:1, lensing:true, doppler:true, stars:true},
  blue: {mass:.90, temperature:12300, radius:24, yaw:117, pitch:12, roll:-10, zoom:1.04, lensing:true, doppler:true, stars:true},
  polar: {mass:.84, temperature:3800, radius:18, yaw:282, pitch:68, roll:12, zoom:1, lensing:true, doppler:true, stars:true}
});

(() => {
  const $ = id => document.getElementById(id);
  const canvas = $("universe");
  const viewer = $("viewer");
  const guide = $("guide");
  const icons = {
    help:'<circle cx="12" cy="12" r="8.6"/><path d="M9.5 9.1a2.6 2.6 0 0 1 5 .8c0 1.8-2.5 2.3-2.5 4"/><path d="M12 17h.01"/>',
    expand:'<path d="M8 3.5H3.5V8m12.5-4.5h4.5V8M3.5 16v4.5H8m12.5-4.5v4.5H16"/>',
    shrink:'<path d="M3.5 8H8V3.5m8 0V8h4.5M8 20.5V16H3.5M16 20.5V16h4.5"/>',
    sliders:'<path d="M4 6h5m4 0h7M4 12h9m4 0h3M4 18h2m4 0h10"/><circle cx="11" cy="6" r="2"/><circle cx="15" cy="12" r="2"/><circle cx="8" cy="18" r="2"/>',
    atom:'<ellipse cx="12" cy="12" rx="9.5" ry="3.8" transform="rotate(-32 12 12)"/><ellipse cx="12" cy="12" rx="9.5" ry="3.8" transform="rotate(47 12 12)"/><circle cx="12" cy="12" r="1" fill="currentColor"/>',
    aperture:'<circle cx="12" cy="12" r="9"/><path d="m7.5 4.2 5 8.6m8.1-4.2H10.5m5.9 11.2-5.2-9.1M4 15.1h10.7"/>',
    lens:'<path d="M2 12s3.8-6.2 10-6.2S22 12 22 12s-3.7 6.2-10 6.2S2 12 2 12Z"/><circle cx="12" cy="12" r="3"/>',
    waves:'<path d="M2 13h3l3-7 4.1 12 3.6-13 2.4 8H22"/>',
    stars:'<path d="m10 3 1.6 5.2L17 10l-5.4 1.7L10 17l-1.7-5.3L3 10l5.3-1.8Zm8 11 .8 2.3L21 17l-2.2.7L18 20l-.8-2.3L15 17l2.2-.7Z"/>',
    reset:'<path d="M3.5 10a8.5 8.5 0 1 1 1.9 7.8M3.5 4.5V10H9"/>',
    pause:'<path d="M8.3 5.8v12.4m7.4-12.4v12.4" stroke-width="3.1"/>',
    play:'<path d="m7.2 4.5 12 7.5-12 7.5Z" fill="currentColor" stroke-width="1.2"/>',
    orbit:'<ellipse cx="12" cy="12" rx="10" ry="4.4" transform="rotate(-27 12 12)"/><path d="M7 13a5 5 0 1 1 8.7 2.6"/><circle cx="19" cy="6.2" r="1.35" fill="currentColor"/>',
    focus:'<path d="M4 9V4h5m6 0h5v5m0 6v5h-5m-6 0H4v-5"/><circle cx="12" cy="12" r="3"/>',
    camera:'<path d="m8 6 1.6-2h4.8L16 6h3.5a1.7 1.7 0 0 1 1.7 1.7v10.5a1.7 1.7 0 0 1-1.7 1.7h-15a1.7 1.7 0 0 1-1.7-1.7V7.7A1.7 1.7 0 0 1 4.5 6Z"/><circle cx="12" cy="12.7" r="3.6"/>',
    mouse:'<rect x="6.4" y="2.7" width="11.2" height="18.6" rx="5.5"/><path d="M12 5.5v4"/>',
    crosshair:'<circle cx="12" cy="12" r="7"/><path d="M12 2v5m0 10v5M2 12h5m10 0h5"/>',
    activity:'<path d="M2 13h4l2.5-6.5 4.2 12 3.4-14 2.5 8.5H22"/>',
    close:'<path d="m5.5 5.5 13 13m0-13-13 13"/>'
  };
  function icon(el,name) {
    el.dataset.icon=name;
    el.innerHTML='<svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round">'+icons[name]+'</svg>';
  }
  document.querySelectorAll("[data-icon]").forEach(el=>icon(el,el.dataset.icon));

  let state = {...HORIZON_PRESETS.cinema};
  let activePreset = "cinema", viewPreset = "cinema";
  let playing = !matchMedia("(prefers-reduced-motion: reduce)").matches;
  let orbiting = false, renderer = null, failed = false, intersecting = true;
  let elapsed = 0, lastFrame = 0, frameId = 0, quality = 1, nextFrame = 0;
  const framePeriod = 1000 / 60;
  let sampleStart = 0, frameCount = 0, lastQualityChange = 0;
  let boxWidth = 1, boxHeight = 1, noticeTimer;
  const pointers = new Map();
  const azValue=$("azimuth"), elValue=$("elevation"), status=$("live-state");
  const number = new Intl.NumberFormat("zh-CN");
  const rangeIds=["mass","temperature","radius"];
  const effectIds=["lensing","doppler","stars"];
  const effectControls=effectIds.map($);
  const clamp=(v,lo,hi)=>Math.max(lo,Math.min(hi,v));
  const wrap=degrees=>((degrees%360)+360)%360;
  const labels={cinema:"电影原景",blue:"高温吸积",polar:"极轴俯瞰"};

  function notice(message) {
    const box=$("notice");
    box.textContent=message;
    box.classList.add("visible");
    clearTimeout(noticeTimer);
    noticeTimer=setTimeout(()=>box.classList.remove("visible"),1800);
  }
  function setStatus(message,paused=false) {
    status.querySelector("span").textContent=message;
    status.classList.toggle("paused",paused);
  }
  function syncPlayback() {
    const button=$("playback");
    button.setAttribute("aria-pressed",String(!playing));
    button.setAttribute("aria-label",playing?"暂停模拟":"继续模拟");
    button.title=(playing?"暂停模拟":"继续模拟")+"（空格）";
    button.classList.toggle("active",!playing);
    icon(button.querySelector("i"),playing?"pause":"play");
    $("orbit").setAttribute("aria-pressed",String(orbiting));
    $("orbit").classList.toggle("active",orbiting);
    if(renderer && !failed) setStatus(playing?"实时模拟":"模拟已暂停",!playing);
    if(!playing) $("fps").textContent="— FPS";
  }
  function syncParameters() {
    for(const id of rangeIds) {
      const input=$(id);
      input.value=String(state[id]);
      const percent=(state[id]-Number(input.min))/(Number(input.max)-Number(input.min))*100;
      input.style.setProperty("--fill",percent+"%");
    }
    $("mass-value").innerHTML=state.mass.toFixed(2)+' <small>× 10⁸ M☉</small>';
    $("temperature-value").innerHTML=number.format(state.temperature)+' <small>K</small>';
    $("radius-value").innerHTML=number.format(state.radius)+' <small>r<sub>g</sub></small>';
    $("mass").setAttribute("aria-valuetext",state.mass.toFixed(2)+" 亿太阳质量");
    $("temperature").setAttribute("aria-valuetext",state.temperature+" 开尔文");
    $("radius").setAttribute("aria-valuetext",state.radius+" 个引力半径");
    for(const control of effectControls) control.checked=state[control.id];
    document.querySelectorAll("[data-preset]").forEach(button=>{
      const active=button.dataset.preset===activePreset;
      button.classList.toggle("selected",active);
      button.setAttribute("aria-pressed",String(active));
    });
    $("custom").hidden=activePreset!==null;
  }
  const axisCanvas=$("axis"), axisContext=axisCanvas.getContext("2d");
  let lastYaw, lastPitch, lastRoll;
  function telemetry() {
    if(lastYaw===state.yaw && lastPitch===state.pitch && lastRoll===state.roll) return;
    lastYaw=state.yaw; lastPitch=state.pitch; lastRoll=state.roll;
    azValue.textContent=wrap(state.yaw).toFixed(1).padStart(5,"0")+"°";
    elValue.textContent=(state.pitch>=0?"+":"")+state.pitch.toFixed(1)+"°";
    const yaw=state.yaw*Math.PI/180, pitch=state.pitch*Math.PI/180, roll=state.roll*Math.PI/180;
    const sy=Math.sin(yaw), cy=Math.cos(yaw), se=Math.sin(pitch), ce=Math.cos(pitch);
    const sr=Math.sin(roll), cr=Math.cos(roll);
    const horizontal=[cy,0,-sy],vertical=[-sy*se,ce,-cy*se],depth=[sy*ce,se,cy*ce];
    const ctx=axisContext;
    ctx.clearRect(0,0,144,130);
    ctx.lineWidth=1.65;ctx.lineCap="round";ctx.font='18px Consolas, monospace';
    ctx.textAlign="center";ctx.textBaseline="middle";
    [0,1,2].sort((a,b)=>depth[a]-depth[b]).forEach(i=>{
      const x=horizontal[i]*cr-vertical[i]*sr, y=-(vertical[i]*cr+horizontal[i]*sr);
      ctx.strokeStyle=i===0?"#c39a70":"#8f9695";
      ctx.fillStyle=ctx.strokeStyle;
      ctx.beginPath();ctx.moveTo(69,69);ctx.lineTo(69+38*x,69+38*y);ctx.stroke();
      ctx.fillText("XYZ"[i],69+54*x,69+54*y);
    });
    ctx.fillStyle="#d5c8b5";ctx.beginPath();ctx.arc(69,69,3,0,2*Math.PI);ctx.fill();
  }
  let lastScale=0, lastUnit=0;
  function scaleBar(pixelsPerUnit) {
    const target=boxWidth>600?67:32;
    const units=[.5,1,2,5,10,20,50].reduce((best,n)=>
      Math.abs(Math.log(n*pixelsPerUnit/target))<Math.abs(Math.log(best*pixelsPerUnit/target))?n:best);
    const length=Math.round(units*pixelsPerUnit);
    if(lastScale===length && lastUnit===units) return;
    lastScale=length;lastUnit=units;
    $("scale-value").innerHTML=units+" r<sub>g</sub>";
    $("scale-bar").style.width=length+"px";
  }
  function sizeForFrame() {
    const ratio=Math.min(devicePixelRatio||1,1.65,Math.sqrt(1860000/(boxWidth*boxHeight)))*quality;
    return [Math.max(1,Math.round(boxWidth*ratio)),Math.max(1,Math.round(boxHeight*ratio))];
  }
  function drawNow() {
    const [w,h]=sizeForFrame();
    const scale=renderer.render(state,elapsed,w,h,.475,w/boxWidth);
    scaleBar(scale*boxWidth/w);
    telemetry();
  }
  function requestFrame() {
    if(!frameId && renderer && !failed && !document.hidden && !guide.open && intersecting) frameId=requestAnimationFrame(frame);
  }
  function resetClock() {
    lastFrame=0;nextFrame=0;sampleStart=0;frameCount=0;
  }
  function stopLoop(){
    if(frameId) cancelAnimationFrame(frameId);
    frameId=0;resetClock();
  }
  function reportError(error) {
    console.error("观测画面渲染失败",error);
    failed=true;stopLoop();
    $("render-error").textContent=error.message;
    $("render-error").hidden=false;
    setStatus("渲染中断",true);
    $("fps").textContent="— FPS";
    $("engine-state").textContent="渲染离线";
  }
  function frame(now) {
    frameId=0;
    if(document.hidden || guide.open || !intersecting || failed) {resetClock();return;}
    if(playing && nextFrame && now<nextFrame-.65) {requestFrame();return;}
    nextFrame=nextFrame && now<nextFrame+2*framePeriod ? nextFrame+framePeriod : now+framePeriod;
    const delta=lastFrame?Math.min(.15,(now-lastFrame)/1000):0;
    lastFrame=now;
    if(playing) {
      elapsed=(elapsed+delta)%32;
      if(orbiting && pointers.size===0) state.yaw=wrap(state.yaw+delta*5.5);
    }
    try {drawNow();} catch(error) {reportError(error);return;}
    if(!playing) {resetClock();return;}
    if(sampleStart) frameCount++; else sampleStart=now;
    if(now-sampleStart>=1000) {
      const fps=1000*frameCount/(now-sampleStart);
      $("fps").textContent=Math.round(fps)+" FPS";
      if(now-lastQualityChange>2400) {
        const previous=quality;
        if(fps<39) quality=Math.max(.55,quality*.84);
        else if(fps>54) quality=Math.min(1,quality+.07);
        if(previous!==quality) lastQualityChange=now;
      }
      sampleStart=now;frameCount=0;
    }
    requestFrame();
  }
  function readSize() {
    const rect=viewer.getBoundingClientRect();
    boxWidth=Math.max(1,rect.width);boxHeight=Math.max(1,rect.height);
    requestFrame();
  }
  new ResizeObserver(readSize).observe(viewer);
  new IntersectionObserver(entries=>{
    intersecting=entries[0].isIntersecting;
    if(intersecting) requestFrame(); else stopLoop();
  }).observe(viewer);
  document.addEventListener("visibilitychange",()=>{if(document.hidden) stopLoop();else requestFrame();});

  function applyPreset(id, announce=true) {
    state={...HORIZON_PRESETS[id]};
    activePreset=id;viewPreset=id;orbiting=false;elapsed=0;
    syncParameters();syncPlayback();requestFrame();
    if(announce) notice("已切换至"+labels[id]);
  }
  document.querySelectorAll("[data-preset]").forEach(button=>button.addEventListener("click",()=>applyPreset(button.dataset.preset)));
  function changeParameter(id,value) {
    state[id]=value;activePreset=null;
    syncParameters();requestFrame();
  }
  for(const id of rangeIds) $(id).addEventListener("input",event=>changeParameter(id,Number(event.target.value)));
  for(const input of effectControls) input.addEventListener("change",()=>changeParameter(input.id,input.checked));
  $("reset").addEventListener("click",()=>{applyPreset("cinema",false);notice("已恢复默认参数和视角");});
  function restoreView() {
    const preset=HORIZON_PRESETS[viewPreset];
    for(const key of ["yaw","pitch","roll","zoom"]) state[key]=preset[key];
    orbiting=false;syncPlayback();requestFrame();notice("视角已复位");
  }
  $("home-view").addEventListener("click",restoreView);
  canvas.addEventListener("dblclick",restoreView);
  function togglePlay() {playing=!playing;resetClock();syncPlayback();requestFrame();}
  $("playback").addEventListener("click",togglePlay);
  $("orbit").addEventListener("click",()=>{
    orbiting=!orbiting;if(orbiting && !playing) playing=true;
    syncPlayback();requestFrame();
  });
  function rotate(dx,dy) {
    state.yaw=wrap(state.yaw-dx);
    state.pitch=clamp(state.pitch+dy,-88,88);
    if(orbiting) {orbiting=false;syncPlayback();}
    requestFrame();
  }
  function zoom(factor) {
    state.zoom=clamp(state.zoom*factor,.55,2.35);requestFrame();
  }
  canvas.addEventListener("pointerdown",event=>{
    if(event.button!==0) return;
    canvas.focus({preventScroll:true});
    canvas.setPointerCapture(event.pointerId);
    pointers.set(event.pointerId,{x:event.clientX,y:event.clientY});
    canvas.classList.add("dragging");
  });
  canvas.addEventListener("pointermove",event=>{
    const prior=pointers.get(event.pointerId);
    if(!prior) return;
    const position={x:event.clientX,y:event.clientY};
    if(pointers.size===1){
      const speed=145/Math.max(320,Math.min(boxWidth,boxHeight)) / Math.sqrt(state.zoom);
      rotate((position.x-prior.x)*speed,(position.y-prior.y)*speed);
    } else if(pointers.size===2) {
      const other=[...pointers].find(([id])=>id!==event.pointerId)[1];
      const old=Math.hypot(prior.x-other.x,prior.y-other.y);
      const next=Math.hypot(position.x-other.x,position.y-other.y);
      if(old>2 && next>2) zoom(next/old);
    }
    pointers.set(event.pointerId,position);
  });
  function release(event) {
    pointers.delete(event.pointerId);
    if(!pointers.size) canvas.classList.remove("dragging");
  }
  for(const name of ["pointerup","pointercancel","lostpointercapture"]) canvas.addEventListener(name,release);
  canvas.addEventListener("wheel",event=>{
    event.preventDefault();
    const delta=event.deltaY*(event.deltaMode===1?16:event.deltaMode===2?boxHeight:1);
    zoom(Math.exp(-clamp(delta,-450,450)*.00125));
  },{passive:false});
  document.addEventListener("keydown",event=>{
    if(guide.open || event.ctrlKey || event.metaKey || event.altKey || (event.target!==canvas && event.target!==document.body)) return;
    const step=event.shiftKey?10:3;
    const actions={ArrowLeft:()=>rotate(-step,0),ArrowRight:()=>rotate(step,0),ArrowUp:()=>rotate(0,step),ArrowDown:()=>rotate(0,-step),"+":()=>zoom(1.1),"=":()=>zoom(1.1),"-":()=>zoom(1/1.1)," ":togglePlay,r:restoreView,R:restoreView};
    if(actions[event.key]) {event.preventDefault();actions[event.key]();}
  });

  $("capture").addEventListener("click",()=>{
    if(!renderer || failed) {notice("当前画面无法保存");return;}
    try {
      drawNow();
      canvas.toBlob(blob=>{
        if(!blob) {console.error("浏览器未生成 PNG 图像");notice("图像保存失败");return;}
        const url=URL.createObjectURL(blob), link=document.createElement("a");
        link.href=url;link.download="Gargantua-"+new Date().toISOString().replace(/[:.]/g,"-")+".png";
        document.body.append(link);link.click();link.remove();
        setTimeout(()=>URL.revokeObjectURL(url),15000);notice("观测图像已导出");
      },"image/png");
    } catch(error) {console.error("导出图像失败",error);notice("图像保存失败");}
  });
  const fullscreen=$("fullscreen");
  if(!document.fullscreenEnabled) fullscreen.hidden=true;
  fullscreen.addEventListener("click",async()=>{
    try {
      if(document.fullscreenElement) await document.exitFullscreen();
      else await document.documentElement.requestFullscreen();
    } catch(error) {console.error("切换全屏失败",error);notice("浏览器未允许全屏显示");}
  });
  document.addEventListener("fullscreenchange",()=>{
    const active=Boolean(document.fullscreenElement);
    fullscreen.setAttribute("aria-pressed",String(active));
    fullscreen.setAttribute("aria-label",active?"退出全屏":"全屏观测");
    fullscreen.title=active?"退出全屏":"全屏观测";
    fullscreen.querySelector("span").textContent=active?"退出全屏":"全屏";
    icon(fullscreen.querySelector("i"),active?"shrink":"expand");
    readSize();
  });
  $("guide-button").addEventListener("click",()=>{guide.showModal();stopLoop();});
  $("close-guide").addEventListener("click",()=>guide.close());
  guide.addEventListener("click",event=>{
    if(event.target!==guide) return;
    const r=guide.getBoundingClientRect();
    if(event.clientX<r.left || event.clientX>r.right || event.clientY<r.top || event.clientY>r.bottom) guide.close();
  });
  guide.addEventListener("close",requestFrame);
  canvas.addEventListener("webglcontextlost",event=>{
    event.preventDefault();
    reportError(new Error("图形上下文已中断，正在等待浏览器恢复。"));
  });
  async function initialize() {
    try {
      renderer=await HorizonRenderer.create(canvas);
      failed=false;$("render-error").hidden=true;$("engine-state").textContent="WebGL 2";
      readSize();resetClock();syncPlayback();requestFrame();
    } catch(error) {reportError(error);}
  }
  canvas.addEventListener("webglcontextrestored",initialize);
  syncParameters();syncPlayback();readSize();telemetry();initialize();
})();

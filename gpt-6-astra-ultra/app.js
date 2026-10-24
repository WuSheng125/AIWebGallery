/* UI and input layer. The renderer is independent of the DOM controls. */
(() => {
  'use strict';
  const $ = id => document.getElementById(id);
  const canvas = $('universe');
  const defaults = Object.freeze({mass:1,spin:0.72,lensing:1,disk:true,temperature:6500,diskSize:6,brightness:1.2,doppler:true,bloom:0.7,stars:1,speed:1,quality:'auto'});
  const defaultCamera = {yaw:0,pitch:0.12,distance:17};
  const presets = {
    gargantua:{params:{...defaults},camera:{...defaultCamera},description:'灵感源自《星际穿越》的经典黑洞。'},
    blue:{params:{...defaults,mass:0.9,spin:0.94,temperature:14000,diskSize:7.4,brightness:1.35,bloom:0.85},camera:{yaw:0.45,pitch:0.25,distance:18},description:'冷蓝色的高温盘面，映出光的另一种形态。'},
    quiet:{params:{...defaults,mass:1.18,disk:false,stars:1.7,bloom:0.15},camera:{yaw:-0.3,pitch:0.18,distance:15},description:'隐去吸积盘，在弯曲的星光中寻找视界。'}
  };
  let params = {...defaults};
  let camera = {...defaultCamera};
  let target = {...camera};
  let paused = matchMedia('(prefers-reduced-motion: reduce)').matches;
  let orbiting = false;
  let time = 0;
  let dirty = true;
  let renderer;
  let frameId = 0;
  let lastTime = 0;
  let fpsStart = 0;
  let fpsFrames = 0;
  let effectiveQuality = 'balanced';
  let slowSamples = 0;
  let fastSamples = 0;
  let toastTimer;
  let screenshotUrl=null;
  let activePreset = 'gargantua';

  function toast(message) {
    clearTimeout(toastTimer);
    $('toast').textContent = message;
    $('toast').classList.add('show');
    toastTimer = setTimeout(() => $('toast').classList.remove('show'),2600);
  }
  function fail(message) {
    $('loading').hidden = true;
    $('error-message').textContent = message;
    $('render-error').hidden = false;
    $('scene-status').textContent = '渲染不可用';
    $('snapshot').disabled = true;
    $('fps').textContent = 'OFFLINE';
  }
  function format(key,value) {
    if(key==='temperature') return Math.round(value).toLocaleString('en-US')+' K';
    if(key==='mass') return value.toFixed(2)+' Rₛ';
    if(key==='diskSize') return value.toFixed(1)+' Rₛ';
    return value.toFixed(2)+(['spin','bloom'].includes(key)?'':' ×');
  }
  function syncControls() {
    for(const [key,value] of Object.entries(params)) {
      const input = $(key);
      if(!input) continue;
      if(input.type==='checkbox') input.checked=value;
      else input.value=value;
      if(input.type==='range') {
        const progress=(value-Number(input.min))/(Number(input.max)-Number(input.min))*100;
        input.style.setProperty('--fill',progress+'%');
        $(key+'-value').value=format(key,value);
        input.setAttribute('aria-valuetext',format(key,value));
      }
    }
    $('disk-controls').classList.toggle('disabled',!params.disk);
    $('disk-controls').querySelectorAll('input').forEach(input=>input.disabled=!params.disk);
    document.querySelectorAll('[data-preset]').forEach(button=>{
      const active=button.dataset.preset===activePreset;
      button.classList.toggle('active',active);
      button.setAttribute('aria-pressed',String(active));
    });
    updateReadouts();
  }
  function updateReadouts() {
    $('readout-mass').innerHTML=params.mass.toFixed(2)+'<span> Rₛ</span>';
    $('readout-angle').innerHTML=(camera.pitch*180/Math.PI).toFixed(1)+'<span> °</span>';
    $('readout-distance').innerHTML=camera.distance.toFixed(1)+'<span> Rₛ</span>';
  }
  function applyParams() {
    effectiveQuality=params.quality==='auto'?'balanced':params.quality;
    slowSamples=fastSamples=0;
    renderer?.setParams({...params,quality:effectiveQuality});
    dirty=true;
  }
  function selectPreset(name,notify=true) {
    const preset=presets[name];
    if(!preset) return;
    const quality=params.quality;
    params={...preset.params,quality};
    target={...preset.camera};
    activePreset=name;
    orbiting=false;
    $('auto-orbit').setAttribute('aria-pressed','false');
    $('preset-description').textContent=preset.description;
    syncControls();
    applyParams();
    if(notify) toast('已切换至'+document.querySelector('[data-preset="'+name+'"]').innerText.trim());
  }
  document.querySelectorAll('input[type=range]').forEach(input=>{
    input.addEventListener('input',()=>{
      params[input.id]=Number(input.value);
      if(input.id!=='speed') {
        activePreset='';
        $('preset-description').textContent='自定义观测 · 正在探索你的宇宙。';
      }
      renderer?.setParams({[input.id]:params[input.id]});
      syncControls();
      dirty=true;
    });
  });
  ['disk','doppler'].forEach(id=>$(id).addEventListener('change',()=>{
    params[id]=$(id).checked;
    activePreset='';
    $('preset-description').textContent='自定义观测 · 正在探索你的宇宙。';
    renderer?.setParams({[id]:params[id]});
    syncControls();
    dirty=true;
  }));
  $('quality').addEventListener('change',()=>{
    params.quality=$('quality').value;
    applyParams();
    toast('画质已设为'+$('quality').selectedOptions[0].text);
  });
  document.querySelectorAll('[data-preset]').forEach(button=>button.addEventListener('click',()=>selectPreset(button.dataset.preset)));
  $('reset-all').addEventListener('click',()=>{
    params={...defaults};
    time=0;
    selectPreset('gargantua',false);
    paused=false;
    syncPause();
    toast('已恢复默认参数与观测视角');
  });
  function syncPause() {
    $('pause').setAttribute('aria-label',paused?'继续动画':'暂停动画');
    $('pause').querySelector('use').setAttribute('href',paused?'#i-play':'#i-pause');
    $('scene-status').textContent=paused?'时间已暂停':'实时模拟';
    dirty=true;
  }
  function togglePause() {paused=!paused;syncPause();}
  function resetCamera() {
    target={...defaultCamera};
    orbiting=false;
    $('auto-orbit').setAttribute('aria-pressed','false');
    dirty=true;
    toast('已回到经典观测视角');
  }
  $('pause').addEventListener('click',togglePause);
  $('reset-camera').addEventListener('click',resetCamera);
  $('auto-orbit').addEventListener('click',()=>{
    orbiting=!orbiting;
    $('auto-orbit').setAttribute('aria-pressed',String(orbiting));
    toast(orbiting?'自动环绕已开启':'自动环绕已关闭');
    dirty=true;
  });
  $('snapshot').addEventListener('click',()=>{
    if(!renderer?.ready) return;
    try {
      renderer.render(time);
      const data=renderer.capture();
      $('snapshot-image').src=data;
      $('snapshot-download').download='Gargantua-'+new Date().toISOString().replace(/[:.]/g,'-')+'.png';
      $('snapshot-download').href=data;
      // Blob downloads avoid large data-URL navigation limits in embedded browsers.
      canvas.toBlob(blob=>{
        if(!blob) return;
        if(screenshotUrl) URL.revokeObjectURL(screenshotUrl);
        screenshotUrl=URL.createObjectURL(blob);
        $('snapshot-download').href=screenshotUrl;
      },'image/png');
      $('snapshot-dialog').showModal();
    } catch(error) {toast('截图未能保存，请稍后重试');console.error(error);}
  });
  $('snapshot-close').addEventListener('click',()=>$('snapshot-dialog').close());
  const mobileLayout=matchMedia('(max-width: 700px)');
  function setPanel(open) {
    document.body.classList.toggle('panel-open',open);
    $('mobile-panel').setAttribute('aria-expanded',String(open));
    $('mobile-panel').setAttribute('aria-label',open?'关闭参数控制台':'打开参数控制台');
    $('panel-scrim').hidden=!open;
    $('control-panel').inert=mobileLayout.matches&&!open;
  }
  mobileLayout.addEventListener('change',()=>setPanel(false));
  setPanel(false);
  $('mobile-panel').addEventListener('click',()=>setPanel(!document.body.classList.contains('panel-open')));
  $('panel-scrim').addEventListener('click',()=>setPanel(false));
  function toggleCinema() {
    const enabled=document.body.classList.toggle('cinema');
    $('exit-cinema').hidden=!enabled;
    $('cinema').setAttribute('aria-pressed',String(enabled));
    $('cinema').setAttribute('aria-label',enabled?'退出沉浸模式':'进入沉浸模式');
    setPanel(false);
    dirty=true;
  }
  $('cinema').addEventListener('click',toggleCinema);
  $('exit-cinema').addEventListener('click',toggleCinema);
  $('about-open').addEventListener('click',()=>$('about-dialog').showModal());
  $('about-close').addEventListener('click',()=>$('about-dialog').close());
  $('about-done').addEventListener('click',()=>$('about-dialog').close());
  $('about-dialog').addEventListener('click',event=>{
    if(event.target!==$('about-dialog')) return;
    const rect=$('about-dialog').getBoundingClientRect();
    if(event.clientX<rect.left||event.clientX>rect.right||event.clientY<rect.top||event.clientY>rect.bottom) $('about-dialog').close();
  });
  $('retry-render').addEventListener('click',()=>location.reload());

  // Pointer capture keeps drag reliable when leaving the canvas. Two pointers pinch.
  const pointers=new Map();
  let pinchDistance=0;
  const clamp=(value,min,max)=>Math.min(max,Math.max(min,value));
  function getPinchDistance() {
    const points=[...pointers.values()];
    return points.length===2?Math.hypot(points[1].x-points[0].x,points[1].y-points[0].y):0;
  }
  canvas.addEventListener('pointerdown',event=>{
    if(event.button!==0 && event.pointerType==='mouse') return;
    canvas.focus({preventScroll:true});
    canvas.setPointerCapture(event.pointerId);
    pointers.set(event.pointerId,{x:event.clientX,y:event.clientY});
    pinchDistance=getPinchDistance();
    orbiting=false;
    $('auto-orbit').setAttribute('aria-pressed','false');
  });
  canvas.addEventListener('pointermove',event=>{
    const previous=pointers.get(event.pointerId);
    if(!previous) return;
    pointers.set(event.pointerId,{x:event.clientX,y:event.clientY});
    if(pointers.size===2) {
      const next=getPinchDistance();
      if(next>0 && pinchDistance>0) target.distance=clamp(target.distance*pinchDistance/next,8,26);
      pinchDistance=next;
    } else {
      target.yaw-=(event.clientX-previous.x)*0.005;
      target.pitch=clamp(target.pitch+(event.clientY-previous.y)*0.004,-1.45,1.45);
    }
    dirty=true;
  });
  const release=event=>{pointers.delete(event.pointerId);pinchDistance=getPinchDistance();};
  canvas.addEventListener('pointerup',release);
  canvas.addEventListener('pointercancel',release);
  canvas.addEventListener('lostpointercapture',release);
  canvas.addEventListener('wheel',event=>{
    event.preventDefault();
    const delta=event.deltaY*(event.deltaMode===1?16:event.deltaMode===2?canvas.clientHeight:1);
    target.distance=clamp(target.distance*Math.exp(clamp(delta,-300,300)*0.001),8,26);
    dirty=true;
  },{passive:false});
  document.addEventListener('keydown',event=>{
    if($('about-dialog').open||$('snapshot-dialog').open) return;
    if(/INPUT|SELECT|TEXTAREA/.test(event.target.tagName)) return;
    if(event.target.tagName==='BUTTON' && ['Space','Enter'].includes(event.code)) return;
    if(event.ctrlKey||event.altKey||event.metaKey) return;
    switch(event.code) {
      case 'Space':event.preventDefault();togglePause();break;
      case 'KeyR':resetCamera();break;
      case 'KeyF':toggleCinema();break;
      case 'Escape':if(document.body.classList.contains('cinema'))toggleCinema();setPanel(false);break;
      case 'ArrowLeft':event.preventDefault();target.yaw-=0.08;dirty=true;break;
      case 'ArrowRight':event.preventDefault();target.yaw+=0.08;dirty=true;break;
      case 'ArrowUp':event.preventDefault();target.pitch=clamp(target.pitch+0.06,-1.45,1.45);dirty=true;break;
      case 'ArrowDown':event.preventDefault();target.pitch=clamp(target.pitch-0.06,-1.45,1.45);dirty=true;break;
      case 'Equal':target.distance=clamp(target.distance-0.6,8,26);dirty=true;break;
      case 'Minus':target.distance=clamp(target.distance+0.6,8,26);dirty=true;break;
    }
  });

  function updatePerformance(now) {
    if(!fpsStart) fpsStart=now;
    fpsFrames++;
    const elapsed=now-fpsStart;
    if(elapsed<1300) return;
    const fps=Math.round(fpsFrames*1000/elapsed);
    $('fps').textContent=fps+' FPS';
    if(params.quality==='auto' && !paused && params.speed>0) {
      slowSamples=fps<30?slowSamples+1:0;
      fastSamples=fps>55?fastSamples+1:0;
      if(slowSamples>=2 && effectiveQuality!=='low') {
        effectiveQuality='low';
        renderer.setParams({quality:'low'});
        slowSamples=fastSamples=0;
      } else if(fastSamples>=8 && effectiveQuality==='low') {
        effectiveQuality='balanced';
        renderer.setParams({quality:'balanced'});
        slowSamples=fastSamples=0;
      }
    }
    fpsFrames=0;fpsStart=now;
  }
  function frame(now) {
    frameId=requestAnimationFrame(frame);
    const dt=lastTime?Math.min((now-lastTime)/1000,0.05):0;
    lastTime=now;
    if(document.hidden||!renderer?.ready) return;
    const animate=!paused && params.speed>0;
    if(animate) time+=dt*params.speed;
    if(orbiting&&!paused) {target.yaw+=dt*0.09;dirty=true;}
    let moved=false;
    const ease=1-Math.exp(-dt*13);
    for(const key of ['yaw','pitch','distance']) {
      const delta=target[key]-camera[key];
      if(Math.abs(delta)>0.0001) {camera[key]+=delta*ease;moved=true;} else camera[key]=target[key];
    }
    if(dirty||animate||moved) {
      renderer.setCamera(camera);
      renderer.render(time);
      const resolution=renderer.resolution.width+' × '+renderer.resolution.height;
      if($('resolution').textContent!==resolution) $('resolution').textContent=resolution;
      if($('loading').hidden===false) $('loading').hidden=true;
      if(moved) updateReadouts();
      updatePerformance(now);
      dirty=false;
    } else {
      $('fps').textContent=paused?'已暂停':'静止';
      fpsStart=0;fpsFrames=0;
    }
  }
  syncControls();
  syncPause();
  try {
    if(!window.BlackHoleRenderer) throw new Error('渲染器未加载，请保留 index.html、renderer.js、app.js 与 style.css 在同一文件夹。');
    renderer=new BlackHoleRenderer(canvas,{onError:fail});
    applyParams();
    renderer.setCamera(camera);
    if(renderer.ready) {
      const resizeObserver=new ResizeObserver(()=>{renderer.resize();dirty=true;});
      resizeObserver.observe(canvas);
      document.addEventListener('visibilitychange',()=>{lastTime=0;fpsStart=0;fpsFrames=0;dirty=true;});
      frameId=requestAnimationFrame(frame);
      window.addEventListener('pagehide',()=>{cancelAnimationFrame(frameId);});
      window.addEventListener('pageshow',event=>{if(event.persisted){cancelAnimationFrame(frameId);lastTime=0;dirty=true;frameId=requestAnimationFrame(frame);}});
    }
  } catch(error) {fail(error.message);console.error(error);}
})();

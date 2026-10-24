import { BlackHoleRenderer } from './renderer.js';

const defaults={mass:1,lensing:1,diskOuter:8.5,temperature:4800,brightness:1.2,doppler:0.3,thickness:0.08,speed:1,stars:0.8,glow:0.7};
const presets={
  cinema:{...defaults},
  hot:{...defaults,temperature:10000,brightness:1.75,doppler:0.8,diskOuter:9.8,thickness:0.12,speed:1.4,glow:0.9},
  quiet:{...defaults,temperature:3300,brightness:0.65,doppler:0.15,diskOuter:7.3,speed:0.45,stars:1.3,glow:0.4}
};
const params={...defaults};
const $=id=>document.getElementById(id);
const canvas=$('universe');
let renderer,paused=window.matchMedia('(prefers-reduced-motion: reduce)').matches,autoOrbit=false;
let time=0,lastTime=0,frameCount=0,fpsStart=0,frameTimes=[],toastTimer;
let dirty=true,rafId=0;
const pressed=new Map();
let pinchDistance=0;

function showToast(message){$('toast').textContent=message;$('toast').classList.add('visible');clearTimeout(toastTimer);toastTimer=setTimeout(()=>$('toast').classList.remove('visible'),2600);}
function error(message){$('renderError').hidden=false;$('errorMessage').textContent=message;$('renderStatus').textContent='渲染不可用';$('fps').textContent='—';}
function format(key,value){
  if(key==='temperature')return `${Math.round(value).toLocaleString('zh-CN')} K`;
  if(key==='diskOuter')return `${value.toFixed(1)} Rₛ`;
  if(key==='thickness')return `${value.toFixed(2)} Rₛ`;
  if(key==='mass'||key==='speed')return `${value.toFixed(2)} ×`;
  return value.toFixed(2);
}
function updateControls(){for(const [key,value] of Object.entries(params)){
  const input=$(key);input.value=value;input.style.setProperty('--progress',`${(value-Number(input.min))/(Number(input.max)-Number(input.min))*100}%`);$(key+'Value').textContent=format(key,value);
}}
function selectPreset(name){
  document.querySelectorAll('.preset').forEach(button=>{const selected=button.dataset.preset===name;button.classList.toggle('active',selected);button.setAttribute('aria-pressed',String(selected));});
}
for(const key of Object.keys(params))$(key).addEventListener('input',event=>{
  params[key]=Number(event.target.value);updateControls();selectPreset(null);dirty=true;wake();
});
document.querySelectorAll('.preset').forEach(button=>button.addEventListener('click',()=>{
  Object.assign(params,presets[button.dataset.preset]);updateControls();selectPreset(button.dataset.preset);renderer?.resetView();$('view').value='cinema';$('viewName').textContent='电影视角';dirty=true;wake();
}));
function pauseUI(){
  $('pause').setAttribute('aria-pressed',String(paused));$('pause').querySelector('use').setAttribute('href',paused?'#i-play':'#i-pause');$('pause').querySelector('span').textContent=paused?'播放':'暂停';$('liveText').textContent=paused?'模拟已暂停':'实时模拟';$('liveDot').classList.toggle('paused',paused);
}
function togglePause(){paused=!paused;pauseUI();dirty=true;wake();}
$('pause').addEventListener('click',togglePause);
$('autoOrbit').addEventListener('click',()=>{autoOrbit=!autoOrbit;$('autoOrbit').setAttribute('aria-pressed',String(autoOrbit));dirty=true;wake();});
function resetView(){renderer?.resetView();$('view').value='cinema';$('viewName').textContent='电影视角';dirty=true;wake();}
$('resetView').addEventListener('click',resetView);
$('resetParams').addEventListener('click',()=>{Object.assign(params,defaults);$('quality').value='auto';renderer?.setQuality('auto');updateControls();selectPreset('cinema');autoOrbit=false;$('autoOrbit').setAttribute('aria-pressed','false');resetView();showToast('已恢复默认观测参数');});
$('view').addEventListener('change',()=>{renderer?.resetView($('view').value);$('viewName').textContent={cinema:'电影视角',top:'俯视盘面',edge:'侧视光环'}[$('view').value];dirty=true;wake();});
$('quality').addEventListener('change',()=>{renderer?.setQuality($('quality').value);dirty=true;wake();});
const mobileLayout=window.matchMedia('(max-width:760px)');
function syncPanelAccessibility(){const closed=mobileLayout.matches&&!$('settings').classList.contains('open');$('settings').inert=closed;$('settings').setAttribute('aria-hidden',String(closed));}
mobileLayout.addEventListener('change',syncPanelAccessibility);
function setPanel(open){
  const hadPanelFocus=$('settings').contains(document.activeElement);
  $('settings').classList.toggle('open',open);$('panelToggle').setAttribute('aria-expanded',String(open));$('panelToggle').setAttribute('aria-label',open?'关闭参数面板':'打开参数面板');syncPanelAccessibility();
  if(mobileLayout.matches){if(open)$('panelClose').focus();else if(hadPanelFocus)$('panelToggle').focus();}
}
syncPanelAccessibility();
$('panelToggle').addEventListener('click',()=>setPanel(!$('settings').classList.contains('open')));
$('panelClose').addEventListener('click',()=>{setPanel(false);$('panelToggle').focus();});
$('retry').addEventListener('click',()=>location.reload());
async function fullscreen(){try{if(document.fullscreenElement)await document.exitFullscreen();else await document.documentElement.requestFullscreen();}catch{showToast('当前窗口不支持全屏，可使用浏览器全屏功能');}}
$('fullscreen').addEventListener('click',fullscreen);
document.addEventListener('fullscreenchange',()=>{$('fullscreen').setAttribute('aria-label',document.fullscreenElement?'退出全屏':'全屏');renderer?.resize();dirty=true;wake();});
$('snapshot').addEventListener('click',async()=>{
  if(!renderer || renderer.lost)return;
  try{const blob=await renderer.snapshot(time);const url=URL.createObjectURL(blob);const a=document.createElement('a');a.href=url;a.download=`gargantua-${new Date().toISOString().replace(/[:.]/g,'-')}.png`;a.click();setTimeout(()=>URL.revokeObjectURL(url),5000);showToast('当前黑洞画面已保存');}catch{showToast('截图未能保存，请稍后重试');}
});
function rotate(dx,dy){if(!renderer)return;renderer.targetCamera.azimuth-=dx*0.004;renderer.targetCamera.elevation=Math.max(-1.45,Math.min(1.45,renderer.targetCamera.elevation+dy*0.003));$('viewName').textContent='自由观察';dirty=true;wake();}
function zoom(factor){if(!renderer)return;renderer.targetCamera.distance=Math.max(12,Math.min(42,renderer.targetCamera.distance*factor));dirty=true;wake();}
function pinch(){const points=[...pressed.values()];return points.length>=2?Math.hypot(points[0].x-points[1].x,points[0].y-points[1].y):0;}
canvas.addEventListener('pointerdown',event=>{if(event.pointerType==='mouse'&&event.button!==0)return;canvas.focus({preventScroll:true});canvas.setPointerCapture(event.pointerId);pressed.set(event.pointerId,{x:event.clientX,y:event.clientY});pinchDistance=pinch();canvas.classList.add('dragging');});
canvas.addEventListener('pointermove',event=>{
  const old=pressed.get(event.pointerId);if(!old)return;
  pressed.set(event.pointerId,{x:event.clientX,y:event.clientY});
  if(pressed.size===1)rotate(event.clientX-old.x,event.clientY-old.y);
  else {const next=pinch();if(pinchDistance>0&&next>0)zoom(pinchDistance/next);pinchDistance=next;}
});
function release(event){pressed.delete(event.pointerId);pinchDistance=pinch();if(!pressed.size)canvas.classList.remove('dragging');}
canvas.addEventListener('pointerup',release);canvas.addEventListener('pointercancel',release);canvas.addEventListener('lostpointercapture',release);
canvas.addEventListener('wheel',event=>{event.preventDefault();zoom(Math.exp(Math.max(-120,Math.min(120,event.deltaY))*0.0015));},{passive:false});
canvas.addEventListener('dblclick',resetView);
document.addEventListener('keydown',event=>{
  if(event.key==='Escape'){setPanel(false);return;}
  const active=document.activeElement;
  if(active&&active!==canvas&&active!==document.body&&(active.matches('input,select,textarea,button,summary,a')||active.isContentEditable))return;
  if(event.altKey||event.ctrlKey||event.metaKey)return;
  const k=event.key.toLowerCase();
  if(k===' '){event.preventDefault();togglePause();}
  else if(k==='r')resetView();else if(k==='f')fullscreen();
  else if(k.startsWith('arrow')){event.preventDefault();rotate(k==='arrowleft'?-18:k==='arrowright'?18:0,k==='arrowup'?-18:k==='arrowdown'?18:0);}
  else if(k==='+'||k==='=')zoom(0.94);else if(k==='-')zoom(1.06);
});
function wake(){if(!rafId&&!document.hidden&&renderer&&!renderer.lost){lastTime=performance.now();fpsStart=lastTime;frameCount=0;rafId=requestAnimationFrame(frame);}}
function frame(now){
  rafId=0;
  if(document.hidden||!renderer||renderer.lost)return;
  const delta=Math.min(0.1,(now-lastTime)/1000);lastTime=now;
  if(!paused)time+=delta*params.speed;
  if(autoOrbit&&!paused)renderer.targetCamera.azimuth+=delta*0.055;
  const moving=Object.keys(renderer.camera).some(key=>Math.abs(renderer.camera[key]-renderer.targetCamera[key])>0.0001);
  if(!paused||dirty||moving){try{renderer.draw(time);}catch(e){error(e.message);return;}dirty=false;}
  frameCount++;frameTimes.push(delta*1000);if(frameTimes.length>90)frameTimes.shift();
  $('angleReading').textContent=`${(renderer.camera.elevation*180/Math.PI).toFixed(1)}°`;
  $('distanceReading').textContent=`${renderer.camera.distance.toFixed(1)} Rₛ`;
  if(now-fpsStart>1000){
    const fps=Math.round(frameCount*1000/(now-fpsStart));$('fps').textContent=String(fps);frameCount=0;fpsStart=now;
    if(!paused)renderer.adapt(frameTimes.reduce((a,b)=>a+b,0)/frameTimes.length,now);
    const q=$('quality').selectedOptions[0].textContent.split(' · ')[0];
    $('renderStatus').textContent=`WEBGL 2 / ${renderer.width} × ${renderer.height} / ${q}`;
    $('qualityHint').textContent=renderer.quality==='auto'?`当前渲染 ${renderer.width} × ${renderer.height}，自动平衡清晰度与帧率。`:`当前渲染 ${renderer.width} × ${renderer.height}。`;
  }
  if(!paused||moving)rafId=requestAnimationFrame(frame);
  else {$('fps').textContent='—';$('renderStatus').textContent=`WEBGL 2 / ${renderer.width} × ${renderer.height} / 已暂停`;}
}
document.addEventListener('visibilitychange',()=>{if(document.hidden){cancelAnimationFrame(rafId);rafId=0;}else{dirty=true;wake();}});
window.addEventListener('resize',()=>{dirty=true;renderer?.resize();wake();});
updateControls();pauseUI();
try{
  renderer=new BlackHoleRenderer(canvas,params);renderer.onError=error;renderer.onResize=()=>{dirty=true;wake();};
  renderer.draw(0);
  $('renderStatus').textContent=`WEBGL 2 / ${renderer.width} × ${renderer.height} / 自适应`;
  wake();
}catch(e){error(e.message);}
// Feature-detected browser WebMCP tools expose only the requested view controls.
const modelContext=document.modelContext??navigator.modelContext;
if(modelContext?.registerTool){
  const lifecycle=new AbortController();
  window.addEventListener('pagehide',()=>lifecycle.abort(),{once:true});
  try{void Promise.resolve(modelContext.registerTool({name:'set_black_hole_parameters',title:'调整黑洞观测参数',description:'调整黑洞观测参数并返回实际值。',annotations:{readOnlyHint:false,untrustedContentHint:false},inputSchema:{type:'object',properties:Object.fromEntries(Object.keys(params).map(key=>[key,{type:'number',minimum:Number($(key).min),maximum:Number($(key).max)}])),additionalProperties:false},execute:async values=>{
    if(!values||typeof values!=='object'||Array.isArray(values))throw new Error('无效参数');
    for(const[key,value]of Object.entries(values)){if(!(key in params)||!Number.isFinite(value)||value<Number($(key).min)||value>Number($(key).max))throw new Error('无效参数');}
    Object.assign(params,values);updateControls();selectPreset(null);dirty=true;wake();return{content:[{type:'text',text:JSON.stringify(params)}]};
  }},{signal:lifecycle.signal})).catch(()=>{});}catch{/* The optional API never blocks the observatory. */}
}

import{C as ht,V as d,M as x,T as S,Q as W,S as O,a as c,R as ct,P as ut,b as v,c as st,O as at,B as dt,F as X,d as T,U as k,W as w,H as E,N as pt,e as mt,f as F,A as ft,g as gt,h as _t,i as vt,j as bt,L as yt,k as Tt,l as St,m as ot,n as xt,o as Mt,p as Pt,q as wt,r as Et,s as Ct,t as Rt,u as Dt,v as B,D as At,w as Lt,x as q,y as Ot}from"./three-core-B82hNlmz.js";(function(){const t=document.createElement("link").relList;if(t&&t.supports&&t.supports("modulepreload"))return;for(const a of document.querySelectorAll('link[rel="modulepreload"]'))s(a);new MutationObserver(a=>{for(const o of a)if(o.type==="childList")for(const n of o.addedNodes)n.tagName==="LINK"&&n.rel==="modulepreload"&&s(n)}).observe(document,{childList:!0,subtree:!0});function i(a){const o={};return a.integrity&&(o.integrity=a.integrity),a.referrerPolicy&&(o.referrerPolicy=a.referrerPolicy),a.crossOrigin==="use-credentials"?o.credentials="include":a.crossOrigin==="anonymous"?o.credentials="omit":o.credentials="same-origin",o}function s(a){if(a.ep)return;a.ep=!0;const o=i(a);fetch(a.href,o)}})();const $={type:"change"},H={type:"start"},nt={type:"end"},R=new ct,J=new ut,kt=Math.cos(70*v.DEG2RAD),p=new d,m=2*Math.PI,l={NONE:-1,ROTATE:0,DOLLY:1,PAN:2,TOUCH_ROTATE:3,TOUCH_PAN:4,TOUCH_DOLLY_PAN:5,TOUCH_DOLLY_ROTATE:6},j=1e-6;class Ft extends ht{constructor(t,i=null){super(t,i),this.state=l.NONE,this.target=new d,this.cursor=new d,this.minDistance=0,this.maxDistance=1/0,this.minZoom=0,this.maxZoom=1/0,this.minTargetRadius=0,this.maxTargetRadius=1/0,this.minPolarAngle=0,this.maxPolarAngle=Math.PI,this.minAzimuthAngle=-1/0,this.maxAzimuthAngle=1/0,this.enableDamping=!1,this.dampingFactor=.05,this.enableZoom=!0,this.zoomSpeed=1,this.enableRotate=!0,this.rotateSpeed=1,this.keyRotateSpeed=1,this.enablePan=!0,this.panSpeed=1,this.screenSpacePanning=!0,this.keyPanSpeed=7,this.zoomToCursor=!1,this.autoRotate=!1,this.autoRotateSpeed=2,this.keys={LEFT:"ArrowLeft",UP:"ArrowUp",RIGHT:"ArrowRight",BOTTOM:"ArrowDown"},this.mouseButtons={LEFT:x.ROTATE,MIDDLE:x.DOLLY,RIGHT:x.PAN},this.touches={ONE:S.ROTATE,TWO:S.DOLLY_PAN},this.target0=this.target.clone(),this.position0=this.object.position.clone(),this.zoom0=this.object.zoom,this._domElementKeyEvents=null,this._lastPosition=new d,this._lastQuaternion=new W,this._lastTargetPosition=new d,this._quat=new W().setFromUnitVectors(t.up,new d(0,1,0)),this._quatInverse=this._quat.clone().invert(),this._spherical=new O,this._sphericalDelta=new O,this._scale=1,this._panOffset=new d,this._rotateStart=new c,this._rotateEnd=new c,this._rotateDelta=new c,this._panStart=new c,this._panEnd=new c,this._panDelta=new c,this._dollyStart=new c,this._dollyEnd=new c,this._dollyDelta=new c,this._dollyDirection=new d,this._mouse=new c,this._performCursorZoom=!1,this._pointers=[],this._pointerPositions={},this._controlActive=!1,this._onPointerMove=zt.bind(this),this._onPointerDown=Nt.bind(this),this._onPointerUp=Ut.bind(this),this._onContextMenu=Kt.bind(this),this._onMouseWheel=Bt.bind(this),this._onKeyDown=Ht.bind(this),this._onTouchStart=Yt.bind(this),this._onTouchMove=Vt.bind(this),this._onMouseDown=It.bind(this),this._onMouseMove=jt.bind(this),this._interceptControlDown=Qt.bind(this),this._interceptControlUp=Gt.bind(this),this.domElement!==null&&this.connect(this.domElement),this.update()}connect(t){super.connect(t),this.domElement.addEventListener("pointerdown",this._onPointerDown),this.domElement.addEventListener("pointercancel",this._onPointerUp),this.domElement.addEventListener("contextmenu",this._onContextMenu),this.domElement.addEventListener("wheel",this._onMouseWheel,{passive:!1}),this.domElement.getRootNode().addEventListener("keydown",this._interceptControlDown,{passive:!0,capture:!0}),this.domElement.style.touchAction="none"}disconnect(){this.domElement.removeEventListener("pointerdown",this._onPointerDown),this.domElement.removeEventListener("pointermove",this._onPointerMove),this.domElement.removeEventListener("pointerup",this._onPointerUp),this.domElement.removeEventListener("pointercancel",this._onPointerUp),this.domElement.removeEventListener("wheel",this._onMouseWheel),this.domElement.removeEventListener("contextmenu",this._onContextMenu),this.stopListenToKeyEvents(),this.domElement.getRootNode().removeEventListener("keydown",this._interceptControlDown,{capture:!0}),this.domElement.style.touchAction="auto"}dispose(){this.disconnect()}getPolarAngle(){return this._spherical.phi}getAzimuthalAngle(){return this._spherical.theta}getDistance(){return this.object.position.distanceTo(this.target)}listenToKeyEvents(t){t.addEventListener("keydown",this._onKeyDown),this._domElementKeyEvents=t}stopListenToKeyEvents(){this._domElementKeyEvents!==null&&(this._domElementKeyEvents.removeEventListener("keydown",this._onKeyDown),this._domElementKeyEvents=null)}saveState(){this.target0.copy(this.target),this.position0.copy(this.object.position),this.zoom0=this.object.zoom}reset(){this.target.copy(this.target0),this.object.position.copy(this.position0),this.object.zoom=this.zoom0,this.object.updateProjectionMatrix(),this.dispatchEvent($),this.update(),this.state=l.NONE}update(t=null){const i=this.object.position;p.copy(i).sub(this.target),p.applyQuaternion(this._quat),this._spherical.setFromVector3(p),this.autoRotate&&this.state===l.NONE&&this._rotateLeft(this._getAutoRotationAngle(t)),this.enableDamping?(this._spherical.theta+=this._sphericalDelta.theta*this.dampingFactor,this._spherical.phi+=this._sphericalDelta.phi*this.dampingFactor):(this._spherical.theta+=this._sphericalDelta.theta,this._spherical.phi+=this._sphericalDelta.phi);let s=this.minAzimuthAngle,a=this.maxAzimuthAngle;isFinite(s)&&isFinite(a)&&(s<-Math.PI?s+=m:s>Math.PI&&(s-=m),a<-Math.PI?a+=m:a>Math.PI&&(a-=m),s<=a?this._spherical.theta=Math.max(s,Math.min(a,this._spherical.theta)):this._spherical.theta=this._spherical.theta>(s+a)/2?Math.max(s,this._spherical.theta):Math.min(a,this._spherical.theta)),this._spherical.phi=Math.max(this.minPolarAngle,Math.min(this.maxPolarAngle,this._spherical.phi)),this._spherical.makeSafe(),this.enableDamping===!0?this.target.addScaledVector(this._panOffset,this.dampingFactor):this.target.add(this._panOffset),this.target.sub(this.cursor),this.target.clampLength(this.minTargetRadius,this.maxTargetRadius),this.target.add(this.cursor);let o=!1;if(this.zoomToCursor&&this._performCursorZoom||this.object.isOrthographicCamera)this._spherical.radius=this._clampDistance(this._spherical.radius);else{const n=this._spherical.radius;this._spherical.radius=this._clampDistance(this._spherical.radius*this._scale),o=n!=this._spherical.radius}if(p.setFromSpherical(this._spherical),p.applyQuaternion(this._quatInverse),i.copy(this.target).add(p),this.object.lookAt(this.target),this.enableDamping===!0?(this._sphericalDelta.theta*=1-this.dampingFactor,this._sphericalDelta.phi*=1-this.dampingFactor,this._panOffset.multiplyScalar(1-this.dampingFactor)):(this._sphericalDelta.set(0,0,0),this._panOffset.set(0,0,0)),this.zoomToCursor&&this._performCursorZoom){let n=null;if(this.object.isPerspectiveCamera){const r=p.length();n=this._clampDistance(r*this._scale);const u=r-n;this.object.position.addScaledVector(this._dollyDirection,u),this.object.updateMatrixWorld(),o=!!u}else if(this.object.isOrthographicCamera){const r=new d(this._mouse.x,this._mouse.y,0);r.unproject(this.object);const u=this.object.zoom;this.object.zoom=Math.max(this.minZoom,Math.min(this.maxZoom,this.object.zoom/this._scale)),this.object.updateProjectionMatrix(),o=u!==this.object.zoom;const C=new d(this._mouse.x,this._mouse.y,0);C.unproject(this.object),this.object.position.sub(C).add(r),this.object.updateMatrixWorld(),n=p.length()}else console.warn("WARNING: OrbitControls.js encountered an unknown camera type - zoom to cursor disabled."),this.zoomToCursor=!1;n!==null&&(this.screenSpacePanning?this.target.set(0,0,-1).transformDirection(this.object.matrix).multiplyScalar(n).add(this.object.position):(R.origin.copy(this.object.position),R.direction.set(0,0,-1).transformDirection(this.object.matrix),Math.abs(this.object.up.dot(R.direction))<kt?this.object.lookAt(this.target):(J.setFromNormalAndCoplanarPoint(this.object.up,this.target),R.intersectPlane(J,this.target))))}else if(this.object.isOrthographicCamera){const n=this.object.zoom;this.object.zoom=Math.max(this.minZoom,Math.min(this.maxZoom,this.object.zoom/this._scale)),n!==this.object.zoom&&(this.object.updateProjectionMatrix(),o=!0)}return this._scale=1,this._performCursorZoom=!1,o||this._lastPosition.distanceToSquared(this.object.position)>j||8*(1-this._lastQuaternion.dot(this.object.quaternion))>j||this._lastTargetPosition.distanceToSquared(this.target)>j?(this.dispatchEvent($),this._lastPosition.copy(this.object.position),this._lastQuaternion.copy(this.object.quaternion),this._lastTargetPosition.copy(this.target),!0):!1}_getAutoRotationAngle(t){return t!==null?m/60*this.autoRotateSpeed*t:m/60/60*this.autoRotateSpeed}_getZoomScale(t){const i=Math.abs(t*.01);return Math.pow(.95,this.zoomSpeed*i)}_rotateLeft(t){this._sphericalDelta.theta-=t}_rotateUp(t){this._sphericalDelta.phi-=t}_panLeft(t,i){p.setFromMatrixColumn(i,0),p.multiplyScalar(-t),this._panOffset.add(p)}_panUp(t,i){this.screenSpacePanning===!0?p.setFromMatrixColumn(i,1):(p.setFromMatrixColumn(i,0),p.crossVectors(this.object.up,p)),p.multiplyScalar(t),this._panOffset.add(p)}_pan(t,i){const s=this.domElement;if(this.object.isPerspectiveCamera){const a=this.object.position;p.copy(a).sub(this.target);let o=p.length();o*=Math.tan(this.object.fov/2*Math.PI/180),this._panLeft(2*t*o/s.clientHeight,this.object.matrix),this._panUp(2*i*o/s.clientHeight,this.object.matrix)}else this.object.isOrthographicCamera?(this._panLeft(t*(this.object.right-this.object.left)/this.object.zoom/s.clientWidth,this.object.matrix),this._panUp(i*(this.object.top-this.object.bottom)/this.object.zoom/s.clientHeight,this.object.matrix)):(console.warn("WARNING: OrbitControls.js encountered an unknown camera type - pan disabled."),this.enablePan=!1)}_dollyOut(t){this.object.isPerspectiveCamera||this.object.isOrthographicCamera?this._scale/=t:(console.warn("WARNING: OrbitControls.js encountered an unknown camera type - dolly/zoom disabled."),this.enableZoom=!1)}_dollyIn(t){this.object.isPerspectiveCamera||this.object.isOrthographicCamera?this._scale*=t:(console.warn("WARNING: OrbitControls.js encountered an unknown camera type - dolly/zoom disabled."),this.enableZoom=!1)}_updateZoomParameters(t,i){if(!this.zoomToCursor)return;this._performCursorZoom=!0;const s=this.domElement.getBoundingClientRect(),a=t-s.left,o=i-s.top,n=s.width,r=s.height;this._mouse.x=a/n*2-1,this._mouse.y=-(o/r)*2+1,this._dollyDirection.set(this._mouse.x,this._mouse.y,1).unproject(this.object).sub(this.object.position).normalize()}_clampDistance(t){return Math.max(this.minDistance,Math.min(this.maxDistance,t))}_handleMouseDownRotate(t){this._rotateStart.set(t.clientX,t.clientY)}_handleMouseDownDolly(t){this._updateZoomParameters(t.clientX,t.clientX),this._dollyStart.set(t.clientX,t.clientY)}_handleMouseDownPan(t){this._panStart.set(t.clientX,t.clientY)}_handleMouseMoveRotate(t){this._rotateEnd.set(t.clientX,t.clientY),this._rotateDelta.subVectors(this._rotateEnd,this._rotateStart).multiplyScalar(this.rotateSpeed);const i=this.domElement;this._rotateLeft(m*this._rotateDelta.x/i.clientHeight),this._rotateUp(m*this._rotateDelta.y/i.clientHeight),this._rotateStart.copy(this._rotateEnd),this.update()}_handleMouseMoveDolly(t){this._dollyEnd.set(t.clientX,t.clientY),this._dollyDelta.subVectors(this._dollyEnd,this._dollyStart),this._dollyDelta.y>0?this._dollyOut(this._getZoomScale(this._dollyDelta.y)):this._dollyDelta.y<0&&this._dollyIn(this._getZoomScale(this._dollyDelta.y)),this._dollyStart.copy(this._dollyEnd),this.update()}_handleMouseMovePan(t){this._panEnd.set(t.clientX,t.clientY),this._panDelta.subVectors(this._panEnd,this._panStart).multiplyScalar(this.panSpeed),this._pan(this._panDelta.x,this._panDelta.y),this._panStart.copy(this._panEnd),this.update()}_handleMouseWheel(t){this._updateZoomParameters(t.clientX,t.clientY),t.deltaY<0?this._dollyIn(this._getZoomScale(t.deltaY)):t.deltaY>0&&this._dollyOut(this._getZoomScale(t.deltaY)),this.update()}_handleKeyDown(t){let i=!1;switch(t.code){case this.keys.UP:t.ctrlKey||t.metaKey||t.shiftKey?this.enableRotate&&this._rotateUp(m*this.keyRotateSpeed/this.domElement.clientHeight):this.enablePan&&this._pan(0,this.keyPanSpeed),i=!0;break;case this.keys.BOTTOM:t.ctrlKey||t.metaKey||t.shiftKey?this.enableRotate&&this._rotateUp(-m*this.keyRotateSpeed/this.domElement.clientHeight):this.enablePan&&this._pan(0,-this.keyPanSpeed),i=!0;break;case this.keys.LEFT:t.ctrlKey||t.metaKey||t.shiftKey?this.enableRotate&&this._rotateLeft(m*this.keyRotateSpeed/this.domElement.clientHeight):this.enablePan&&this._pan(this.keyPanSpeed,0),i=!0;break;case this.keys.RIGHT:t.ctrlKey||t.metaKey||t.shiftKey?this.enableRotate&&this._rotateLeft(-m*this.keyRotateSpeed/this.domElement.clientHeight):this.enablePan&&this._pan(-this.keyPanSpeed,0),i=!0;break}i&&(t.preventDefault(),this.update())}_handleTouchStartRotate(t){if(this._pointers.length===1)this._rotateStart.set(t.pageX,t.pageY);else{const i=this._getSecondPointerPosition(t),s=.5*(t.pageX+i.x),a=.5*(t.pageY+i.y);this._rotateStart.set(s,a)}}_handleTouchStartPan(t){if(this._pointers.length===1)this._panStart.set(t.pageX,t.pageY);else{const i=this._getSecondPointerPosition(t),s=.5*(t.pageX+i.x),a=.5*(t.pageY+i.y);this._panStart.set(s,a)}}_handleTouchStartDolly(t){const i=this._getSecondPointerPosition(t),s=t.pageX-i.x,a=t.pageY-i.y,o=Math.sqrt(s*s+a*a);this._dollyStart.set(0,o)}_handleTouchStartDollyPan(t){this.enableZoom&&this._handleTouchStartDolly(t),this.enablePan&&this._handleTouchStartPan(t)}_handleTouchStartDollyRotate(t){this.enableZoom&&this._handleTouchStartDolly(t),this.enableRotate&&this._handleTouchStartRotate(t)}_handleTouchMoveRotate(t){if(this._pointers.length==1)this._rotateEnd.set(t.pageX,t.pageY);else{const s=this._getSecondPointerPosition(t),a=.5*(t.pageX+s.x),o=.5*(t.pageY+s.y);this._rotateEnd.set(a,o)}this._rotateDelta.subVectors(this._rotateEnd,this._rotateStart).multiplyScalar(this.rotateSpeed);const i=this.domElement;this._rotateLeft(m*this._rotateDelta.x/i.clientHeight),this._rotateUp(m*this._rotateDelta.y/i.clientHeight),this._rotateStart.copy(this._rotateEnd)}_handleTouchMovePan(t){if(this._pointers.length===1)this._panEnd.set(t.pageX,t.pageY);else{const i=this._getSecondPointerPosition(t),s=.5*(t.pageX+i.x),a=.5*(t.pageY+i.y);this._panEnd.set(s,a)}this._panDelta.subVectors(this._panEnd,this._panStart).multiplyScalar(this.panSpeed),this._pan(this._panDelta.x,this._panDelta.y),this._panStart.copy(this._panEnd)}_handleTouchMoveDolly(t){const i=this._getSecondPointerPosition(t),s=t.pageX-i.x,a=t.pageY-i.y,o=Math.sqrt(s*s+a*a);this._dollyEnd.set(0,o),this._dollyDelta.set(0,Math.pow(this._dollyEnd.y/this._dollyStart.y,this.zoomSpeed)),this._dollyOut(this._dollyDelta.y),this._dollyStart.copy(this._dollyEnd);const n=(t.pageX+i.x)*.5,r=(t.pageY+i.y)*.5;this._updateZoomParameters(n,r)}_handleTouchMoveDollyPan(t){this.enableZoom&&this._handleTouchMoveDolly(t),this.enablePan&&this._handleTouchMovePan(t)}_handleTouchMoveDollyRotate(t){this.enableZoom&&this._handleTouchMoveDolly(t),this.enableRotate&&this._handleTouchMoveRotate(t)}_addPointer(t){this._pointers.push(t.pointerId)}_removePointer(t){delete this._pointerPositions[t.pointerId];for(let i=0;i<this._pointers.length;i++)if(this._pointers[i]==t.pointerId){this._pointers.splice(i,1);return}}_isTrackingPointer(t){for(let i=0;i<this._pointers.length;i++)if(this._pointers[i]==t.pointerId)return!0;return!1}_trackPointer(t){let i=this._pointerPositions[t.pointerId];i===void 0&&(i=new c,this._pointerPositions[t.pointerId]=i),i.set(t.pageX,t.pageY)}_getSecondPointerPosition(t){const i=t.pointerId===this._pointers[0]?this._pointers[1]:this._pointers[0];return this._pointerPositions[i]}_customWheelEvent(t){const i=t.deltaMode,s={clientX:t.clientX,clientY:t.clientY,deltaY:t.deltaY};switch(i){case 1:s.deltaY*=16;break;case 2:s.deltaY*=100;break}return t.ctrlKey&&!this._controlActive&&(s.deltaY*=10),s}}function Nt(e){this.enabled!==!1&&(this._pointers.length===0&&(this.domElement.setPointerCapture(e.pointerId),this.domElement.addEventListener("pointermove",this._onPointerMove),this.domElement.addEventListener("pointerup",this._onPointerUp)),!this._isTrackingPointer(e)&&(this._addPointer(e),e.pointerType==="touch"?this._onTouchStart(e):this._onMouseDown(e)))}function zt(e){this.enabled!==!1&&(e.pointerType==="touch"?this._onTouchMove(e):this._onMouseMove(e))}function Ut(e){switch(this._removePointer(e),this._pointers.length){case 0:this.domElement.releasePointerCapture(e.pointerId),this.domElement.removeEventListener("pointermove",this._onPointerMove),this.domElement.removeEventListener("pointerup",this._onPointerUp),this.dispatchEvent(nt),this.state=l.NONE;break;case 1:const t=this._pointers[0],i=this._pointerPositions[t];this._onTouchStart({pointerId:t,pageX:i.x,pageY:i.y});break}}function It(e){let t;switch(e.button){case 0:t=this.mouseButtons.LEFT;break;case 1:t=this.mouseButtons.MIDDLE;break;case 2:t=this.mouseButtons.RIGHT;break;default:t=-1}switch(t){case x.DOLLY:if(this.enableZoom===!1)return;this._handleMouseDownDolly(e),this.state=l.DOLLY;break;case x.ROTATE:if(e.ctrlKey||e.metaKey||e.shiftKey){if(this.enablePan===!1)return;this._handleMouseDownPan(e),this.state=l.PAN}else{if(this.enableRotate===!1)return;this._handleMouseDownRotate(e),this.state=l.ROTATE}break;case x.PAN:if(e.ctrlKey||e.metaKey||e.shiftKey){if(this.enableRotate===!1)return;this._handleMouseDownRotate(e),this.state=l.ROTATE}else{if(this.enablePan===!1)return;this._handleMouseDownPan(e),this.state=l.PAN}break;default:this.state=l.NONE}this.state!==l.NONE&&this.dispatchEvent(H)}function jt(e){switch(this.state){case l.ROTATE:if(this.enableRotate===!1)return;this._handleMouseMoveRotate(e);break;case l.DOLLY:if(this.enableZoom===!1)return;this._handleMouseMoveDolly(e);break;case l.PAN:if(this.enablePan===!1)return;this._handleMouseMovePan(e);break}}function Bt(e){this.enabled===!1||this.enableZoom===!1||this.state!==l.NONE||(e.preventDefault(),this.dispatchEvent(H),this._handleMouseWheel(this._customWheelEvent(e)),this.dispatchEvent(nt))}function Ht(e){this.enabled!==!1&&this._handleKeyDown(e)}function Yt(e){switch(this._trackPointer(e),this._pointers.length){case 1:switch(this.touches.ONE){case S.ROTATE:if(this.enableRotate===!1)return;this._handleTouchStartRotate(e),this.state=l.TOUCH_ROTATE;break;case S.PAN:if(this.enablePan===!1)return;this._handleTouchStartPan(e),this.state=l.TOUCH_PAN;break;default:this.state=l.NONE}break;case 2:switch(this.touches.TWO){case S.DOLLY_PAN:if(this.enableZoom===!1&&this.enablePan===!1)return;this._handleTouchStartDollyPan(e),this.state=l.TOUCH_DOLLY_PAN;break;case S.DOLLY_ROTATE:if(this.enableZoom===!1&&this.enableRotate===!1)return;this._handleTouchStartDollyRotate(e),this.state=l.TOUCH_DOLLY_ROTATE;break;default:this.state=l.NONE}break;default:this.state=l.NONE}this.state!==l.NONE&&this.dispatchEvent(H)}function Vt(e){switch(this._trackPointer(e),this.state){case l.TOUCH_ROTATE:if(this.enableRotate===!1)return;this._handleTouchMoveRotate(e),this.update();break;case l.TOUCH_PAN:if(this.enablePan===!1)return;this._handleTouchMovePan(e),this.update();break;case l.TOUCH_DOLLY_PAN:if(this.enableZoom===!1&&this.enablePan===!1)return;this._handleTouchMoveDollyPan(e),this.update();break;case l.TOUCH_DOLLY_ROTATE:if(this.enableZoom===!1&&this.enableRotate===!1)return;this._handleTouchMoveDollyRotate(e),this.update();break;default:this.state=l.NONE}}function Kt(e){this.enabled!==!1&&e.preventDefault()}function Qt(e){e.key==="Control"&&(this._controlActive=!0,this.domElement.getRootNode().addEventListener("keyup",this._interceptControlUp,{passive:!0,capture:!0}))}function Gt(e){e.key==="Control"&&(this._controlActive=!1,this.domElement.getRootNode().removeEventListener("keyup",this._interceptControlUp,{passive:!0,capture:!0}))}const A={name:"CopyShader",uniforms:{tDiffuse:{value:null},opacity:{value:1}},vertexShader:`

		varying vec2 vUv;

		void main() {

			vUv = uv;
			gl_Position = projectionMatrix * modelViewMatrix * vec4( position, 1.0 );

		}`,fragmentShader:`

		uniform float opacity;

		uniform sampler2D tDiffuse;

		varying vec2 vUv;

		void main() {

			vec4 texel = texture2D( tDiffuse, vUv );
			gl_FragColor = opacity * texel;


		}`};class P{constructor(){this.isPass=!0,this.enabled=!0,this.needsSwap=!0,this.clear=!1,this.renderToScreen=!1}setSize(){}render(){console.error("THREE.Pass: .render() must be implemented in derived pass.")}dispose(){}}const Zt=new at(-1,1,1,-1,0,1);class Wt extends dt{constructor(){super(),this.setAttribute("position",new X([-1,3,0,-1,-1,0,3,-1,0],3)),this.setAttribute("uv",new X([0,2,0,0,2,0],2))}}const Xt=new Wt;class Y{constructor(t){this._mesh=new st(Xt,t)}dispose(){this._mesh.geometry.dispose()}render(t){t.render(this._mesh,Zt)}get material(){return this._mesh.material}set material(t){this._mesh.material=t}}class qt extends P{constructor(t,i="tDiffuse"){super(),this.textureID=i,this.uniforms=null,this.material=null,t instanceof T?(this.uniforms=t.uniforms,this.material=t):t&&(this.uniforms=k.clone(t.uniforms),this.material=new T({name:t.name!==void 0?t.name:"unspecified",defines:Object.assign({},t.defines),uniforms:this.uniforms,vertexShader:t.vertexShader,fragmentShader:t.fragmentShader})),this._fsQuad=new Y(this.material)}render(t,i,s){this.uniforms[this.textureID]&&(this.uniforms[this.textureID].value=s.texture),this._fsQuad.material=this.material,this.renderToScreen?(t.setRenderTarget(null),this._fsQuad.render(t)):(t.setRenderTarget(i),this.clear&&t.clear(t.autoClearColor,t.autoClearDepth,t.autoClearStencil),this._fsQuad.render(t))}dispose(){this.material.dispose(),this._fsQuad.dispose()}}class tt extends P{constructor(t,i){super(),this.scene=t,this.camera=i,this.clear=!0,this.needsSwap=!1,this.inverse=!1}render(t,i,s){const a=t.getContext(),o=t.state;o.buffers.color.setMask(!1),o.buffers.depth.setMask(!1),o.buffers.color.setLocked(!0),o.buffers.depth.setLocked(!0);let n,r;this.inverse?(n=0,r=1):(n=1,r=0),o.buffers.stencil.setTest(!0),o.buffers.stencil.setOp(a.REPLACE,a.REPLACE,a.REPLACE),o.buffers.stencil.setFunc(a.ALWAYS,n,4294967295),o.buffers.stencil.setClear(r),o.buffers.stencil.setLocked(!0),t.setRenderTarget(s),this.clear&&t.clear(),t.render(this.scene,this.camera),t.setRenderTarget(i),this.clear&&t.clear(),t.render(this.scene,this.camera),o.buffers.color.setLocked(!1),o.buffers.depth.setLocked(!1),o.buffers.color.setMask(!0),o.buffers.depth.setMask(!0),o.buffers.stencil.setLocked(!1),o.buffers.stencil.setFunc(a.EQUAL,1,4294967295),o.buffers.stencil.setOp(a.KEEP,a.KEEP,a.KEEP),o.buffers.stencil.setLocked(!0)}}class $t extends P{constructor(){super(),this.needsSwap=!1}render(t){t.state.buffers.stencil.setLocked(!1),t.state.buffers.stencil.setTest(!1)}}class Jt{constructor(t,i){if(this.renderer=t,this._pixelRatio=t.getPixelRatio(),i===void 0){const s=t.getSize(new c);this._width=s.width,this._height=s.height,i=new w(this._width*this._pixelRatio,this._height*this._pixelRatio,{type:E}),i.texture.name="EffectComposer.rt1"}else this._width=i.width,this._height=i.height;this.renderTarget1=i,this.renderTarget2=i.clone(),this.renderTarget2.texture.name="EffectComposer.rt2",this.writeBuffer=this.renderTarget1,this.readBuffer=this.renderTarget2,this.renderToScreen=!0,this.passes=[],this.copyPass=new qt(A),this.copyPass.material.blending=pt,this.clock=new mt}swapBuffers(){const t=this.readBuffer;this.readBuffer=this.writeBuffer,this.writeBuffer=t}addPass(t){this.passes.push(t),t.setSize(this._width*this._pixelRatio,this._height*this._pixelRatio)}insertPass(t,i){this.passes.splice(i,0,t),t.setSize(this._width*this._pixelRatio,this._height*this._pixelRatio)}removePass(t){const i=this.passes.indexOf(t);i!==-1&&this.passes.splice(i,1)}isLastEnabledPass(t){for(let i=t+1;i<this.passes.length;i++)if(this.passes[i].enabled)return!1;return!0}render(t){t===void 0&&(t=this.clock.getDelta());const i=this.renderer.getRenderTarget();let s=!1;for(let a=0,o=this.passes.length;a<o;a++){const n=this.passes[a];if(n.enabled!==!1){if(n.renderToScreen=this.renderToScreen&&this.isLastEnabledPass(a),n.render(this.renderer,this.writeBuffer,this.readBuffer,t,s),n.needsSwap){if(s){const r=this.renderer.getContext(),u=this.renderer.state.buffers.stencil;u.setFunc(r.NOTEQUAL,1,4294967295),this.copyPass.render(this.renderer,this.writeBuffer,this.readBuffer,t),u.setFunc(r.EQUAL,1,4294967295)}this.swapBuffers()}tt!==void 0&&(n instanceof tt?s=!0:n instanceof $t&&(s=!1))}}this.renderer.setRenderTarget(i)}reset(t){if(t===void 0){const i=this.renderer.getSize(new c);this._pixelRatio=this.renderer.getPixelRatio(),this._width=i.width,this._height=i.height,t=this.renderTarget1.clone(),t.setSize(this._width*this._pixelRatio,this._height*this._pixelRatio)}this.renderTarget1.dispose(),this.renderTarget2.dispose(),this.renderTarget1=t,this.renderTarget2=t.clone(),this.writeBuffer=this.renderTarget1,this.readBuffer=this.renderTarget2}setSize(t,i){this._width=t,this._height=i;const s=this._width*this._pixelRatio,a=this._height*this._pixelRatio;this.renderTarget1.setSize(s,a),this.renderTarget2.setSize(s,a);for(let o=0;o<this.passes.length;o++)this.passes[o].setSize(s,a)}setPixelRatio(t){this._pixelRatio=t,this.setSize(this._width,this._height)}dispose(){this.renderTarget1.dispose(),this.renderTarget2.dispose(),this.copyPass.dispose()}}class te extends P{constructor(t,i,s=null,a=null,o=null){super(),this.scene=t,this.camera=i,this.overrideMaterial=s,this.clearColor=a,this.clearAlpha=o,this.clear=!0,this.clearDepth=!1,this.needsSwap=!1,this._oldClearColor=new F}render(t,i,s){const a=t.autoClear;t.autoClear=!1;let o,n;this.overrideMaterial!==null&&(n=this.scene.overrideMaterial,this.scene.overrideMaterial=this.overrideMaterial),this.clearColor!==null&&(t.getClearColor(this._oldClearColor),t.setClearColor(this.clearColor,t.getClearAlpha())),this.clearAlpha!==null&&(o=t.getClearAlpha(),t.setClearAlpha(this.clearAlpha)),this.clearDepth==!0&&t.clearDepth(),t.setRenderTarget(this.renderToScreen?null:s),this.clear===!0&&t.clear(t.autoClearColor,t.autoClearDepth,t.autoClearStencil),t.render(this.scene,this.camera),this.clearColor!==null&&t.setClearColor(this._oldClearColor),this.clearAlpha!==null&&t.setClearAlpha(o),this.overrideMaterial!==null&&(this.scene.overrideMaterial=n),t.autoClear=a}}const ee={uniforms:{tDiffuse:{value:null},luminosityThreshold:{value:1},smoothWidth:{value:1},defaultColor:{value:new F(0)},defaultOpacity:{value:0}},vertexShader:`

		varying vec2 vUv;

		void main() {

			vUv = uv;

			gl_Position = projectionMatrix * modelViewMatrix * vec4( position, 1.0 );

		}`,fragmentShader:`

		uniform sampler2D tDiffuse;
		uniform vec3 defaultColor;
		uniform float defaultOpacity;
		uniform float luminosityThreshold;
		uniform float smoothWidth;

		varying vec2 vUv;

		void main() {

			vec4 texel = texture2D( tDiffuse, vUv );

			float v = luminance( texel.xyz );

			vec4 outputColor = vec4( defaultColor.rgb, defaultOpacity );

			float alpha = smoothstep( luminosityThreshold, luminosityThreshold + smoothWidth, v );

			gl_FragColor = mix( outputColor, texel, alpha );

		}`};class M extends P{constructor(t,i=1,s,a){super(),this.strength=i,this.radius=s,this.threshold=a,this.resolution=t!==void 0?new c(t.x,t.y):new c(256,256),this.clearColor=new F(0,0,0),this.needsSwap=!1,this.renderTargetsHorizontal=[],this.renderTargetsVertical=[],this.nMips=5;let o=Math.round(this.resolution.x/2),n=Math.round(this.resolution.y/2);this.renderTargetBright=new w(o,n,{type:E}),this.renderTargetBright.texture.name="UnrealBloomPass.bright",this.renderTargetBright.texture.generateMipmaps=!1;for(let _=0;_<this.nMips;_++){const U=new w(o,n,{type:E});U.texture.name="UnrealBloomPass.h"+_,U.texture.generateMipmaps=!1,this.renderTargetsHorizontal.push(U);const I=new w(o,n,{type:E});I.texture.name="UnrealBloomPass.v"+_,I.texture.generateMipmaps=!1,this.renderTargetsVertical.push(I),o=Math.round(o/2),n=Math.round(n/2)}const r=ee;this.highPassUniforms=k.clone(r.uniforms),this.highPassUniforms.luminosityThreshold.value=a,this.highPassUniforms.smoothWidth.value=.01,this.materialHighPassFilter=new T({uniforms:this.highPassUniforms,vertexShader:r.vertexShader,fragmentShader:r.fragmentShader}),this.separableBlurMaterials=[];const u=[3,5,7,9,11];o=Math.round(this.resolution.x/2),n=Math.round(this.resolution.y/2);for(let _=0;_<this.nMips;_++)this.separableBlurMaterials.push(this._getSeparableBlurMaterial(u[_])),this.separableBlurMaterials[_].uniforms.invSize.value=new c(1/o,1/n),o=Math.round(o/2),n=Math.round(n/2);this.compositeMaterial=this._getCompositeMaterial(this.nMips),this.compositeMaterial.uniforms.blurTexture1.value=this.renderTargetsVertical[0].texture,this.compositeMaterial.uniforms.blurTexture2.value=this.renderTargetsVertical[1].texture,this.compositeMaterial.uniforms.blurTexture3.value=this.renderTargetsVertical[2].texture,this.compositeMaterial.uniforms.blurTexture4.value=this.renderTargetsVertical[3].texture,this.compositeMaterial.uniforms.blurTexture5.value=this.renderTargetsVertical[4].texture,this.compositeMaterial.uniforms.bloomStrength.value=i,this.compositeMaterial.uniforms.bloomRadius.value=.1;const C=[1,.8,.6,.4,.2];this.compositeMaterial.uniforms.bloomFactors.value=C,this.bloomTintColors=[new d(1,1,1),new d(1,1,1),new d(1,1,1),new d(1,1,1),new d(1,1,1)],this.compositeMaterial.uniforms.bloomTintColors.value=this.bloomTintColors,this.copyUniforms=k.clone(A.uniforms),this.blendMaterial=new T({uniforms:this.copyUniforms,vertexShader:A.vertexShader,fragmentShader:A.fragmentShader,blending:ft,depthTest:!1,depthWrite:!1,transparent:!0}),this._oldClearColor=new F,this._oldClearAlpha=1,this._basic=new gt,this._fsQuad=new Y(null)}dispose(){for(let t=0;t<this.renderTargetsHorizontal.length;t++)this.renderTargetsHorizontal[t].dispose();for(let t=0;t<this.renderTargetsVertical.length;t++)this.renderTargetsVertical[t].dispose();this.renderTargetBright.dispose();for(let t=0;t<this.separableBlurMaterials.length;t++)this.separableBlurMaterials[t].dispose();this.compositeMaterial.dispose(),this.blendMaterial.dispose(),this._basic.dispose(),this._fsQuad.dispose()}setSize(t,i){let s=Math.round(t/2),a=Math.round(i/2);this.renderTargetBright.setSize(s,a);for(let o=0;o<this.nMips;o++)this.renderTargetsHorizontal[o].setSize(s,a),this.renderTargetsVertical[o].setSize(s,a),this.separableBlurMaterials[o].uniforms.invSize.value=new c(1/s,1/a),s=Math.round(s/2),a=Math.round(a/2)}render(t,i,s,a,o){t.getClearColor(this._oldClearColor),this._oldClearAlpha=t.getClearAlpha();const n=t.autoClear;t.autoClear=!1,t.setClearColor(this.clearColor,0),o&&t.state.buffers.stencil.setTest(!1),this.renderToScreen&&(this._fsQuad.material=this._basic,this._basic.map=s.texture,t.setRenderTarget(null),t.clear(),this._fsQuad.render(t)),this.highPassUniforms.tDiffuse.value=s.texture,this.highPassUniforms.luminosityThreshold.value=this.threshold,this._fsQuad.material=this.materialHighPassFilter,t.setRenderTarget(this.renderTargetBright),t.clear(),this._fsQuad.render(t);let r=this.renderTargetBright;for(let u=0;u<this.nMips;u++)this._fsQuad.material=this.separableBlurMaterials[u],this.separableBlurMaterials[u].uniforms.colorTexture.value=r.texture,this.separableBlurMaterials[u].uniforms.direction.value=M.BlurDirectionX,t.setRenderTarget(this.renderTargetsHorizontal[u]),t.clear(),this._fsQuad.render(t),this.separableBlurMaterials[u].uniforms.colorTexture.value=this.renderTargetsHorizontal[u].texture,this.separableBlurMaterials[u].uniforms.direction.value=M.BlurDirectionY,t.setRenderTarget(this.renderTargetsVertical[u]),t.clear(),this._fsQuad.render(t),r=this.renderTargetsVertical[u];this._fsQuad.material=this.compositeMaterial,this.compositeMaterial.uniforms.bloomStrength.value=this.strength,this.compositeMaterial.uniforms.bloomRadius.value=this.radius,this.compositeMaterial.uniforms.bloomTintColors.value=this.bloomTintColors,t.setRenderTarget(this.renderTargetsHorizontal[0]),t.clear(),this._fsQuad.render(t),this._fsQuad.material=this.blendMaterial,this.copyUniforms.tDiffuse.value=this.renderTargetsHorizontal[0].texture,o&&t.state.buffers.stencil.setTest(!0),this.renderToScreen?(t.setRenderTarget(null),this._fsQuad.render(t)):(t.setRenderTarget(s),this._fsQuad.render(t)),t.setClearColor(this._oldClearColor,this._oldClearAlpha),t.autoClear=n}_getSeparableBlurMaterial(t){const i=[];for(let s=0;s<t;s++)i.push(.39894*Math.exp(-.5*s*s/(t*t))/t);return new T({defines:{KERNEL_RADIUS:t},uniforms:{colorTexture:{value:null},invSize:{value:new c(.5,.5)},direction:{value:new c(.5,.5)},gaussianCoefficients:{value:i}},vertexShader:`varying vec2 vUv;
				void main() {
					vUv = uv;
					gl_Position = projectionMatrix * modelViewMatrix * vec4( position, 1.0 );
				}`,fragmentShader:`#include <common>
				varying vec2 vUv;
				uniform sampler2D colorTexture;
				uniform vec2 invSize;
				uniform vec2 direction;
				uniform float gaussianCoefficients[KERNEL_RADIUS];

				void main() {
					float weightSum = gaussianCoefficients[0];
					vec3 diffuseSum = texture2D( colorTexture, vUv ).rgb * weightSum;
					for( int i = 1; i < KERNEL_RADIUS; i ++ ) {
						float x = float(i);
						float w = gaussianCoefficients[i];
						vec2 uvOffset = direction * invSize * x;
						vec3 sample1 = texture2D( colorTexture, vUv + uvOffset ).rgb;
						vec3 sample2 = texture2D( colorTexture, vUv - uvOffset ).rgb;
						diffuseSum += (sample1 + sample2) * w;
						weightSum += 2.0 * w;
					}
					gl_FragColor = vec4(diffuseSum/weightSum, 1.0);
				}`})}_getCompositeMaterial(t){return new T({defines:{NUM_MIPS:t},uniforms:{blurTexture1:{value:null},blurTexture2:{value:null},blurTexture3:{value:null},blurTexture4:{value:null},blurTexture5:{value:null},bloomStrength:{value:1},bloomFactors:{value:null},bloomTintColors:{value:null},bloomRadius:{value:0}},vertexShader:`varying vec2 vUv;
				void main() {
					vUv = uv;
					gl_Position = projectionMatrix * modelViewMatrix * vec4( position, 1.0 );
				}`,fragmentShader:`varying vec2 vUv;
				uniform sampler2D blurTexture1;
				uniform sampler2D blurTexture2;
				uniform sampler2D blurTexture3;
				uniform sampler2D blurTexture4;
				uniform sampler2D blurTexture5;
				uniform float bloomStrength;
				uniform float bloomRadius;
				uniform float bloomFactors[NUM_MIPS];
				uniform vec3 bloomTintColors[NUM_MIPS];

				float lerpBloomFactor(const in float factor) {
					float mirrorFactor = 1.2 - factor;
					return mix(factor, mirrorFactor, bloomRadius);
				}

				void main() {
					gl_FragColor = bloomStrength * ( lerpBloomFactor(bloomFactors[0]) * vec4(bloomTintColors[0], 1.0) * texture2D(blurTexture1, vUv) +
						lerpBloomFactor(bloomFactors[1]) * vec4(bloomTintColors[1], 1.0) * texture2D(blurTexture2, vUv) +
						lerpBloomFactor(bloomFactors[2]) * vec4(bloomTintColors[2], 1.0) * texture2D(blurTexture3, vUv) +
						lerpBloomFactor(bloomFactors[3]) * vec4(bloomTintColors[3], 1.0) * texture2D(blurTexture4, vUv) +
						lerpBloomFactor(bloomFactors[4]) * vec4(bloomTintColors[4], 1.0) * texture2D(blurTexture5, vUv) );
				}`})}}M.BlurDirectionX=new c(1,0);M.BlurDirectionY=new c(0,1);const D={name:"OutputShader",uniforms:{tDiffuse:{value:null},toneMappingExposure:{value:1}},vertexShader:`
		precision highp float;

		uniform mat4 modelViewMatrix;
		uniform mat4 projectionMatrix;

		attribute vec3 position;
		attribute vec2 uv;

		varying vec2 vUv;

		void main() {

			vUv = uv;
			gl_Position = projectionMatrix * modelViewMatrix * vec4( position, 1.0 );

		}`,fragmentShader:`

		precision highp float;

		uniform sampler2D tDiffuse;

		#include <tonemapping_pars_fragment>
		#include <colorspace_pars_fragment>

		varying vec2 vUv;

		void main() {

			gl_FragColor = texture2D( tDiffuse, vUv );

			// tone mapping

			#ifdef LINEAR_TONE_MAPPING

				gl_FragColor.rgb = LinearToneMapping( gl_FragColor.rgb );

			#elif defined( REINHARD_TONE_MAPPING )

				gl_FragColor.rgb = ReinhardToneMapping( gl_FragColor.rgb );

			#elif defined( CINEON_TONE_MAPPING )

				gl_FragColor.rgb = CineonToneMapping( gl_FragColor.rgb );

			#elif defined( ACES_FILMIC_TONE_MAPPING )

				gl_FragColor.rgb = ACESFilmicToneMapping( gl_FragColor.rgb );

			#elif defined( AGX_TONE_MAPPING )

				gl_FragColor.rgb = AgXToneMapping( gl_FragColor.rgb );

			#elif defined( NEUTRAL_TONE_MAPPING )

				gl_FragColor.rgb = NeutralToneMapping( gl_FragColor.rgb );

			#elif defined( CUSTOM_TONE_MAPPING )

				gl_FragColor.rgb = CustomToneMapping( gl_FragColor.rgb );

			#endif

			// color space

			#ifdef SRGB_TRANSFER

				gl_FragColor = sRGBTransferOETF( gl_FragColor );

			#endif

		}`};class ie extends P{constructor(){super(),this.uniforms=k.clone(D.uniforms),this.material=new _t({name:D.name,uniforms:this.uniforms,vertexShader:D.vertexShader,fragmentShader:D.fragmentShader}),this._fsQuad=new Y(this.material),this._outputColorSpace=null,this._toneMapping=null}render(t,i,s){this.uniforms.tDiffuse.value=s.texture,this.uniforms.toneMappingExposure.value=t.toneMappingExposure,(this._outputColorSpace!==t.outputColorSpace||this._toneMapping!==t.toneMapping)&&(this._outputColorSpace=t.outputColorSpace,this._toneMapping=t.toneMapping,this.material.defines={},vt.getTransfer(this._outputColorSpace)===bt&&(this.material.defines.SRGB_TRANSFER=""),this._toneMapping===yt?this.material.defines.LINEAR_TONE_MAPPING="":this._toneMapping===Tt?this.material.defines.REINHARD_TONE_MAPPING="":this._toneMapping===St?this.material.defines.CINEON_TONE_MAPPING="":this._toneMapping===ot?this.material.defines.ACES_FILMIC_TONE_MAPPING="":this._toneMapping===xt?this.material.defines.AGX_TONE_MAPPING="":this._toneMapping===Mt?this.material.defines.NEUTRAL_TONE_MAPPING="":this._toneMapping===Pt&&(this.material.defines.CUSTOM_TONE_MAPPING=""),this.material.needsUpdate=!0),this.renderToScreen===!0?(t.setRenderTarget(null),this._fsQuad.render(t)):(t.setRenderTarget(i),this.clear&&t.clear(t.autoClearColor,t.autoClearDepth,t.autoClearStencil),this._fsQuad.render(t))}dispose(){this.material.dispose(),this._fsQuad.dispose()}}const se=`precision highp float;

varying vec2 vUv;

uniform vec2 uResolution;
uniform float uTime;
uniform vec3 uCameraPos;
uniform vec3 uCameraRight;
uniform vec3 uCameraUp;
uniform vec3 uCameraForward;
uniform float uFov;
uniform float uLensStrength;
uniform float uInnerRadius;
uniform float uOuterRadius;
uniform float uDiskBrightness;
uniform float uTemperature;
uniform float uTurbulence;
uniform float uRotationSpeed;
uniform float uStarDensity;
uniform float uDoppler;
uniform sampler2D uNoise;

#define PI 3.14159265359
#define MAX_STEPS 64

float hash21(vec2 p) {
  p = fract(p * vec2(123.34, 456.21));
  p += dot(p, p + 45.32);
  return fract(p.x * p.y);
}

vec2 hash22(vec2 p) {
  float n = hash21(p);
  return vec2(n, hash21(p + n + 19.19));
}

float noise3(vec3 p) {
  vec2 uv = p.xy / 256.0 + p.z * vec2(0.013, 0.017);
  return texture2D(uNoise, uv).r;
}

float fbm(vec3 p) {
  float value = 0.0;
  float amplitude = 0.5;
  for (int i = 0; i < 4; i++) {
    value += amplitude * noise3(p);
    p = p * 2.03 + vec3(17.1, 9.2, 13.7);
    amplitude *= 0.5;
  }
  return value;
}

vec2 cubeFace(vec3 direction, out float face) {
  vec3 a = abs(direction);
  if (a.x >= a.y && a.x >= a.z) {
    face = direction.x > 0.0 ? 1.0 : 2.0;
    return direction.yz / a.x;
  }
  if (a.y >= a.z) {
    face = direction.y > 0.0 ? 3.0 : 4.0;
    return direction.xz / a.y;
  }
  face = direction.z > 0.0 ? 5.0 : 6.0;
  return direction.xy / a.z;
}

vec3 starLayer(vec3 direction, float cells, float seed, float threshold) {
  float face;
  vec2 uv = cubeFace(direction, face);
  vec2 cell = floor(uv * cells);
  vec2 gv = fract(uv * cells) - 0.5;
  vec2 id = cell + vec2(face * 91.7 + seed, face * 37.1 - seed);
  float random = hash21(id);
  vec2 offset = (hash22(id + 7.3) - 0.5) * 0.82;
  float d = length(gv - offset);
  float magnitude = hash21(id + 31.7);
  float radius = mix(0.017, 0.047, magnitude);
  float aa = fwidth(d) * 0.85 + 0.003;
  float core = 1.0 - smoothstep(radius - aa, radius + aa, d);
  float halo = exp(-d * 42.0) * 0.055 * step(0.82, magnitude);
  float visible = step(1.0 - threshold * uStarDensity, random);
  float energy = (0.08 + pow(magnitude, 7.0) * 1.35) * visible;
  vec3 tint = mix(vec3(0.65, 0.78, 1.0), vec3(1.0, 0.83, 0.62), hash21(id + 73.2));
  return tint * (core + halo) * energy * min(uStarDensity, 1.0);
}

vec3 deepSpace(vec3 direction) {
  vec3 d = normalize(direction);
  float dust = fbm(d * 4.2 + vec3(8.0, 1.0, 3.0));
  float fineDust = fbm(d * 11.0 - vec3(2.0, 7.0, 4.0));
  float band = exp(-abs(dot(d, normalize(vec3(-0.28, 0.86, 0.42)))) * 5.5);
  vec3 background = vec3(0.0015, 0.0022, 0.0038);
  background += vec3(0.009, 0.014, 0.024) * band * pow(dust, 2.2);
  background += vec3(0.004, 0.006, 0.011) * fineDust * band;
  background += starLayer(d, 43.0, 11.0, 0.12);
  background += starLayer(d, 91.0, 47.0, 0.07) * 0.65;
  background += starLayer(d, 167.0, 83.0, 0.042) * 0.36;
  return background;
}

vec3 temperatureColor(float kelvin) {
  float t = clamp(kelvin, 1500.0, 14000.0);
  vec3 warm = mix(vec3(1.0, 0.19, 0.025), vec3(1.0, 0.83, 0.57), smoothstep(2200.0, 6800.0, t));
  return mix(warm, vec3(0.66, 0.79, 1.0), smoothstep(7200.0, 11500.0, t));
}

vec4 accretionDisk(vec3 p) {
  float r = length(p.xz);
  float theta = atan(p.z, p.x);
  float orbit = theta - uTime * uRotationSpeed * 0.32 * pow(uInnerRadius / r, 1.5);
  vec3 flow = vec3(cos(orbit) * r, sin(orbit) * r, r);
  float clouds = fbm(vec3(flow.xy * 0.72, r * 3.2));
  float filaments = noise3(vec3(flow.xy * 3.8, r * 10.0));
  float rings = 0.5 + 0.5 * sin(r * 41.0 + clouds * 9.0);
  float detail = mix(1.0, 0.24 + clouds * 0.95 + filaments * 0.34 + rings * 0.16, min(uTurbulence, 1.0));
  detail *= 1.0 + max(uTurbulence - 1.0, 0.0) * (filaments - 0.35);

  float innerEdge = smoothstep(uInnerRadius, uInnerRadius + 0.24, r);
  float outerEdge = 1.0 - smoothstep(uOuterRadius * 0.68, uOuterRadius, r);
  float edge = innerEdge * outerEdge;
  float radialEnergy = pow(uInnerRadius / r, 1.18);
  float localTemperature = uTemperature * pow(uInnerRadius / r, 0.72);
  vec3 emission = temperatureColor(localTemperature);

  vec3 orbitalVelocity = normalize(vec3(-p.z, 0.0, p.x));
  float beta = sqrt(0.5 / r) * min(uRotationSpeed, 1.2);
  float lineOfSight = dot(orbitalVelocity, normalize(uCameraPos - p));
  float beaming = pow(clamp(1.0 / (1.0 - beta * lineOfSight), 0.4, 2.6), 2.4);
  beaming = mix(1.0, beaming, uDoppler);
  float redshift = sqrt(max(0.12, 1.0 - 1.0 / r));

  float energy = radialEnergy * edge * detail * uDiskBrightness * beaming * redshift;
  emission *= energy * 2.65;
  float opacity = clamp(edge * (0.56 + detail * 0.34), 0.0, 0.97);
  return vec4(emission, opacity);
}

void main() {
  vec2 screen = (gl_FragCoord.xy * 2.0 - uResolution.xy) / uResolution.y;
  float focal = tan(radians(uFov) * 0.5);
  vec3 direction = normalize(uCameraForward + focal * (screen.x * uCameraRight + screen.y * uCameraUp));
  vec3 position = uCameraPos;
  vec3 velocity = direction;
  vec3 angularMomentum = cross(position, velocity);
  float h2 = dot(angularMomentum, angularMomentum) * uLensStrength;
  vec3 light = vec3(0.0);
  float transmission = 1.0;
  float minimumRadius = 1000.0;
  bool captured = false;

  for (int i = 0; i < MAX_STEPS; i++) {
    float r = length(position);
    minimumRadius = min(minimumRadius, r);
    if (r < 1.0) {
      captured = true;
      break;
    }

    float stepSize = clamp((r - 0.82) * 0.09, 0.045, 1.05);
    vec3 nextPosition = position + velocity * stepSize;
    float nextRadius = length(nextPosition);
    vec3 acceleration = -1.5 * h2 * nextPosition / pow(nextRadius, 5.0);
    vec3 nextVelocity = normalize(velocity + acceleration * stepSize);

    if (position.y * nextPosition.y <= 0.0 && abs(position.y - nextPosition.y) > 0.00001 && transmission > 0.012) {
      float crossing = position.y / (position.y - nextPosition.y);
      vec3 diskPosition = mix(position, nextPosition, crossing);
      float diskRadius = length(diskPosition.xz);
      if (diskRadius >= uInnerRadius && diskRadius <= uOuterRadius) {
        vec4 disk = accretionDisk(diskPosition);
        light += transmission * disk.rgb * disk.a;
        transmission *= 1.0 - disk.a * 0.94;
      }
    }

    position = nextPosition;
    velocity = nextVelocity;
    if (r > 20.0 && dot(position, velocity) > 0.0) break;
  }

  if (length(position) < 1.35) captured = true;
  if (!captured) {
    light += transmission * deepSpace(velocity);
    float photonRing = exp(-abs(minimumRadius - 1.5) * 15.0) * 0.035;
    light += transmission * photonRing * vec3(1.0, 0.75, 0.43);
  }

  float edgeFade = 1.0 - smoothstep(0.45, 1.9, length(screen)) * 0.17;
  gl_FragColor = vec4(max(light * edgeFade, vec3(0.0)), 1.0);
}
`,ae=`varying vec2 vUv;

void main() {
  vUv = uv;
  gl_Position = vec4(position.xy, 0.0, 1.0);
}
`,g={lensStrength:1,innerRadius:3.1,outerRadius:12,diskBrightness:1.2,temperature:6200,turbulence:.75,rotationSpeed:.85,exposure:1.1,starDensity:.9,bloomStrength:.65,doppler:!0,bloomEnabled:!0,autoRotate:!1},rt={classic:{inclination:3.5,distance:22.5,azimuth:0},overhead:{inclination:55,distance:20,azimuth:.35},close:{inclination:10,distance:12.5,azimuth:-.25}};function oe(){const t=new Uint8Array(262144);let i=1831565813;for(let a=0;a<256*256;a+=1){i=Math.imul(i,1664525)+1013904223>>>0;const o=i>>>24;t[a*4]=o,t[a*4+1]=o,t[a*4+2]=o,t[a*4+3]=255}const s=new At(t,256,256,Lt);return s.wrapS=q,s.wrapT=q,s.magFilter=B,s.minFilter=Ot,s.generateMipmaps=!0,s.needsUpdate=!0,s}class ne{renderer;composer;bloomPass;camera=new wt(40,1,.1,100);controls;viewport;callbacks;resizeObserver;drawingBufferSize=new c;parameters={...g};quality="auto";autoScale=.5;transition=null;animationFrame=0;lastFrameAt=0;elapsed=0;paused=!1;ready=!1;fpsStartedAt=0;fpsFrames=0;lastQualityAdjustment=0;uniforms={uResolution:{value:new c(1,1)},uTime:{value:0},uCameraPos:{value:new d},uCameraRight:{value:new d},uCameraUp:{value:new d},uCameraForward:{value:new d},uFov:{value:40},uLensStrength:{value:g.lensStrength},uInnerRadius:{value:g.innerRadius},uOuterRadius:{value:g.outerRadius},uDiskBrightness:{value:g.diskBrightness},uTemperature:{value:g.temperature},uTurbulence:{value:g.turbulence},uRotationSpeed:{value:g.rotationSpeed},uStarDensity:{value:g.starDensity},uDoppler:{value:1},uNoise:{value:oe()}};constructor(t,i,s){this.viewport=i,this.callbacks=s,this.renderer=new Et({canvas:t,antialias:!1,alpha:!1,powerPreference:"high-performance",preserveDrawingBuffer:!1}),this.renderer.outputColorSpace=Ct,this.renderer.toneMapping=ot,this.renderer.toneMappingExposure=this.parameters.exposure,this.renderer.setClearColor(131845,1);const a=new Rt,o=new at(-1,1,1,-1,0,1),n=new T({uniforms:this.uniforms,vertexShader:ae,fragmentShader:se,depthTest:!1,depthWrite:!1,toneMapped:!1}),r=new st(new Dt(2,2),n);r.frustumCulled=!1,a.add(r);const u=new w(1,1,{type:E,minFilter:B,magFilter:B,depthBuffer:!1,stencilBuffer:!1});this.composer=new Jt(this.renderer,u),this.composer.addPass(new te(a,o)),this.bloomPass=new M(new c(1,1),this.parameters.bloomStrength,.72,.82),this.composer.addPass(this.bloomPass),this.composer.addPass(new ie),this.camera.position.set(0,Math.sin(v.degToRad(3.5))*22.5,-Math.cos(v.degToRad(3.5))*22.5),this.camera.lookAt(0,0,0),this.controls=new Ft(this.camera,t),this.controls.enableDamping=!0,this.controls.dampingFactor=.055,this.controls.enablePan=!1,this.controls.rotateSpeed=.42,this.controls.zoomSpeed=.65,this.controls.minDistance=10.5,this.controls.maxDistance=32,this.controls.minPolarAngle=.035,this.controls.maxPolarAngle=Math.PI-.035,this.controls.autoRotateSpeed=.24,this.controls.addEventListener("start",()=>{this.transition=null,this.callbacks.onInteraction()}),this.resizeObserver=new ResizeObserver(()=>this.resize()),this.resizeObserver.observe(this.viewport),this.resize(),this.setParameters(this.parameters)}start(){this.animationFrame=requestAnimationFrame(this.animate)}setParameters(t){this.parameters={...t},this.uniforms.uLensStrength.value=t.lensStrength,this.uniforms.uInnerRadius.value=t.innerRadius,this.uniforms.uOuterRadius.value=t.outerRadius,this.uniforms.uDiskBrightness.value=t.diskBrightness,this.uniforms.uTemperature.value=t.temperature,this.uniforms.uTurbulence.value=t.turbulence,this.uniforms.uRotationSpeed.value=t.rotationSpeed,this.uniforms.uStarDensity.value=t.starDensity,this.uniforms.uDoppler.value=t.doppler?1:0,this.renderer.toneMappingExposure=t.exposure,this.bloomPass.strength=t.bloomStrength*.32,this.bloomPass.radius=.12,this.bloomPass.threshold=1.25,this.bloomPass.enabled=t.bloomEnabled&&t.bloomStrength>0,this.controls.autoRotate=t.autoRotate}setQuality(t){this.quality=t,this.autoScale=t==="auto"?.5:1,this.resize()}setPaused(t){this.paused=t}setInclination(t){this.transition=null;const i=new O().setFromVector3(this.camera.position);i.phi=v.clamp(v.degToRad(90-t),.035,Math.PI-.035),this.camera.position.setFromSpherical(i),this.camera.lookAt(0,0,0),this.controls.update()}flyTo(t){const i=v.degToRad(t.inclination),s=Math.cos(i)*t.distance,a=new d(Math.sin(t.azimuth)*s,Math.sin(i)*t.distance,-Math.cos(t.azimuth)*s);this.transition={from:this.camera.position.clone(),to:a,startedAt:performance.now(),duration:1250}}capture(){return this.composer.render(),this.renderer.domElement.toDataURL("image/png")}animate=t=>{this.animationFrame=requestAnimationFrame(this.animate);const i=this.lastFrameAt===0?0:Math.min((t-this.lastFrameAt)/1e3,.06);if(this.lastFrameAt=t,this.paused||(this.elapsed+=i),this.uniforms.uTime.value=this.elapsed,this.controls.autoRotate=this.parameters.autoRotate&&!this.paused,this.transition){const n=Math.min((t-this.transition.startedAt)/this.transition.duration,1),r=n<.5?4*n*n*n:1-Math.pow(-2*n+2,3)/2;this.camera.position.lerpVectors(this.transition.from,this.transition.to,r),this.camera.lookAt(0,0,0),n===1&&(this.transition=null)}this.controls.update(),this.camera.updateMatrixWorld();const s=this.camera.matrixWorld.elements;this.uniforms.uCameraPos.value.copy(this.camera.position),this.uniforms.uCameraRight.value.set(s[0],s[1],s[2]),this.uniforms.uCameraUp.value.set(s[4],s[5],s[6]),this.uniforms.uCameraForward.value.set(-s[8],-s[9],-s[10]),this.composer.render();const a=this.camera.position.length(),o=new O().setFromVector3(this.camera.position);this.callbacks.onViewChange(a,90-v.radToDeg(o.phi)),this.ready||(this.ready=!0,this.callbacks.onReady()),this.measurePerformance(t)};measurePerformance(t){this.fpsStartedAt===0&&(this.fpsStartedAt=t),this.fpsFrames+=1;const i=t-this.fpsStartedAt;if(i<700)return;const s=Math.round(this.fpsFrames*1e3/i);this.callbacks.onFps(s),this.fpsFrames=0,this.fpsStartedAt=t,!(this.quality!=="auto"||t-this.lastQualityAdjustment<2800||document.hidden)&&(this.lastQualityAdjustment=t,s<43&&this.autoScale>.5?(this.autoScale=Math.max(.5,this.autoScale-.1),this.resize()):s>57&&this.autoScale<.9&&(this.autoScale=Math.min(.9,this.autoScale+.05),this.resize()))}resize(){const t=Math.max(this.viewport.clientWidth,1),i=Math.max(this.viewport.clientHeight,1),s=window.innerWidth<700,a=this.quality==="high"?1.7:s?1.1:1.35,o=this.quality==="performance"?.55:this.autoScale,n=Math.min(window.devicePixelRatio||1,a)*o;this.renderer.setPixelRatio(n),this.renderer.setSize(t,i,!1),this.composer.setPixelRatio(n),this.composer.setSize(t,i),this.renderer.getDrawingBufferSize(this.drawingBufferSize),this.uniforms.uResolution.value.copy(this.drawingBufferSize),this.camera.aspect=t/i;const r=Math.max(1,1.05/this.camera.aspect);this.camera.fov=Math.min(78,v.radToDeg(2*Math.atan(Math.tan(v.degToRad(20))*r))),this.uniforms.uFov.value=this.camera.fov,this.camera.updateProjectionMatrix()}}const h=e=>document.getElementById(e),b={...g},L=h("inclination"),lt=window.matchMedia("(max-width: 900px)");let f,y=!1,et=0;const it={lensStrength:e=>`${e.toFixed(2)} ×`,innerRadius:e=>`${e.toFixed(2)} rₛ`,outerRadius:e=>`${e.toFixed(1)} rₛ`,diskBrightness:e=>`${e.toFixed(2)} ×`,temperature:e=>`${Math.round(e).toLocaleString("en-US")} K`,turbulence:e=>e.toFixed(2),rotationSpeed:e=>`${e.toFixed(2)} ×`,exposure:e=>e.toFixed(2),starDensity:e=>e.toFixed(2),bloomStrength:e=>e.toFixed(2),inclination:e=>`${e.toFixed(1)}°`};function N(e){const t=Number(e.value),i=Number(e.min),s=Number(e.max);e.style.setProperty("--progress",`${(t-i)/(s-i)*100}%`);const a=h(`${e.id}-value`),o=e.dataset.param??e.id;a&&it[o]&&(a.value=it[o](t))}function z(e){document.querySelectorAll("[data-view]").forEach(t=>{const i=t.dataset.view===e;t.classList.toggle("active",i),t.setAttribute("aria-pressed",String(i))})}function re(){const e=h("pause-simulation");e.innerHTML=`<svg><use href="#i-${y?"play":"pause"}"></use></svg><span>${y?"继续时间":"暂停时间"}</span>`,e.setAttribute("aria-label",y?"继续模拟":"暂停模拟"),e.setAttribute("aria-pressed",String(y))}function V(e){y=e,f?.setPaused(y),re()}function K(e){const t=h("toast");window.clearTimeout(et),t.textContent=e,t.classList.add("visible"),et=window.setTimeout(()=>t.classList.remove("visible"),2400)}function le(){document.querySelectorAll('input[type="range"][data-param]').forEach(e=>{const t=e.dataset.param;e.value=String(b[t]),N(e)}),document.querySelectorAll('input[type="checkbox"][data-param]').forEach(e=>{const t=e.dataset.param;e.checked=b[t]}),h("curvature-value").innerHTML=`${b.lensStrength.toFixed(2)} <small>×</small>`,f?.setParameters(b)}function Q(){f?.flyTo(rt.classic),z("classic")}function G(e){const t=e??!document.body.classList.contains("ui-hidden");document.body.classList.toggle("ui-hidden",t),document.body.classList.remove("panel-open"),t&&document.body.classList.remove("panel-collapsed")}document.querySelectorAll('input[type="range"]').forEach(e=>{N(e),e.addEventListener("input",()=>{N(e);const t=Number(e.value);if(e===L){f?.setInclination(t),z();return}const i=e.dataset.param;Object.assign(b,{[i]:t}),f?.setParameters(b),i==="lensStrength"&&(h("curvature-value").innerHTML=`${t.toFixed(2)} <small>×</small>`)})});document.querySelectorAll('input[type="checkbox"][data-param]').forEach(e=>{e.addEventListener("change",()=>{const t=e.dataset.param;Object.assign(b,{[t]:e.checked}),f?.setParameters(b)})});document.querySelectorAll("[data-view]").forEach(e=>{e.addEventListener("click",()=>{const t=e.dataset.view;f?.flyTo(rt[t]),z(t)})});h("quality").addEventListener("change",e=>{f?.setQuality(e.target.value)});h("pause-simulation").addEventListener("click",()=>V(!y));h("reset-view").addEventListener("click",Q);h("reset-parameters").addEventListener("click",()=>{Object.assign(b,g),h("quality").value="auto",f?.setQuality("auto"),le(),V(!1),Q(),K("已恢复默认参数与经典视角")});h("toggle-ui").addEventListener("click",()=>G());h("show-ui").addEventListener("click",()=>G(!1));h("collapse-panel").addEventListener("click",()=>{lt.matches?document.body.classList.remove("panel-open"):document.body.classList.add("panel-collapsed")});h("mobile-panel-toggle").addEventListener("click",()=>{lt.matches?document.body.classList.add("panel-open"):document.body.classList.remove("panel-collapsed")});h("panel-scrim").addEventListener("click",()=>document.body.classList.remove("panel-open"));h("fullscreen").addEventListener("click",async()=>{try{document.fullscreenElement?await document.exitFullscreen():await document.documentElement.requestFullscreen()}catch{K("当前浏览器暂不支持全屏模式")}});document.addEventListener("fullscreenchange",()=>{const e=h("fullscreen");e.setAttribute("aria-label",document.fullscreenElement?"退出全屏":"切换全屏"),e.dataset.tooltip=document.fullscreenElement?"退出全屏":"全屏观测"});h("save-view").addEventListener("click",()=>{if(!f)return;const e=document.createElement("a");e.href=f.capture(),e.download=`gargantua-${new Date().toISOString().replace(/[:.]/g,"-")}.png`,e.click(),K("当前时空视图已保存")});window.addEventListener("keydown",e=>{const t=e.target;["INPUT","SELECT","TEXTAREA","BUTTON"].includes(t.tagName)||(e.key.toLowerCase()==="h"&&G(),e.key.toLowerCase()==="r"&&Q(),e.code==="Space"&&(e.preventDefault(),V(!y)))});function Z(e){e&&console.error(e),h("loading-screen").hidden=!0,h("webgl-error").hidden=!1}window.addEventListener("error",e=>{const t=e.error instanceof Error?`${e.error.name}: ${e.error.message}`:e.message;h("webgl-error").querySelector("p").textContent=t,Z(e.error)});h("scene-canvas").addEventListener("webglcontextlost",e=>{e.preventDefault(),Z()});try{f=new ne(h("scene-canvas"),h("viewport"),{onReady:()=>{h("loading-screen").hidden=!0},onViewChange:(e,t)=>{h("distance-value").innerHTML=`${e.toFixed(1)} <small>r<sub>s</sub></small>`,document.activeElement!==L&&(L.value=String(t)),N(L)},onInteraction:()=>z(),onFps:e=>{h("fps-readout").textContent=`${e} FPS`}}),f.start()}catch(e){Z(e)}

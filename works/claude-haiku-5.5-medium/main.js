// 应用入口：WebGL2 初始化、渲染管线（场景光追 → mipmap 泛光 → 合成）、相机与界面交互
(() => {
    'use strict';

    const canvas = document.getElementById('view');
    const gl = canvas.getContext('webgl2', { antialias: false, alpha: false });
    if (!gl) {
        document.getElementById('nogl').hidden = false;
        return;
    }
    const hasFloat = !!gl.getExtension('EXT_color_buffer_float');

    // ---------- 参数 ----------
    const params = {
        spin: 0.9, tilt: 6, outer: 13, bright: 1.2, temp: 6500, opacity: 0.92, doppler: 1.0,
        lens: 1.0, frame: 1.0, stars: 0.5, bloom: 0.7, exposure: 1.2,
        steps: 260, scale: 0.8, adaptive: true, speed: 1.0, autoRotate: false,
    };
    const cam = { theta: 0, phi: 0.07, dist: 14 };

    const PRESETS = {
        interstellar: { spin: 0.9,   tilt: 6,  outer: 13, bright: 1.2, temp: 6500, opacity: 0.92, doppler: 1.0, lens: 1.0, stars: 0.5, bloom: 0.7, exposure: 1.2, dist: 14 },
        schwarzschild:{ spin: 0.0,   tilt: 4,  outer: 12, bright: 1.1, temp: 6000, opacity: 0.92, doppler: 1.0, lens: 1.0, stars: 0.5, bloom: 0.7, exposure: 1.2, dist: 14 },
        extreme:      { spin: 0.998, tilt: 12, outer: 18, bright: 1.4, temp: 8000, opacity: 0.9,  doppler: 1.3, lens: 1.0, stars: 0.5, bloom: 0.8, exposure: 1.1, dist: 13 },
        faceon:       { spin: 0.5,   tilt: 70, outer: 22, bright: 1.0, temp: 5500, opacity: 0.75, doppler: 0.8, lens: 1.0, stars: 0.5, bloom: 0.6, exposure: 1.3, dist: 22 },
    };

    // ---------- 工具函数 ----------
    const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
    const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
    const norm = (a) => { const l = Math.hypot(a[0], a[1], a[2]); return [a[0] / l, a[1] / l, a[2] / l]; };

    // 最内稳定圆轨道（Bardeen 公式），以史瓦西半径为单位（M = 0.5 rs）
    function iscoRs(a) {
        const z1 = 1 + Math.cbrt(1 - a * a) * (Math.cbrt(1 + a) + Math.cbrt(1 - a));
        const z2 = Math.sqrt(3 * a * a + z1 * z1);
        const rM = 3 + z2 - Math.sqrt((3 - z1) * (3 + z1 + 2 * z2));
        return rM / 2;
    }

    // ---------- WebGL 资源 ----------
    function compile(type, src) {
        const s = gl.createShader(type);
        gl.shaderSource(s, src);
        gl.compileShader(s);
        if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) {
            throw new Error(gl.getShaderInfoLog(s));
        }
        return s;
    }

    function createProgram(vsSrc, fsSrc) {
        const p = gl.createProgram();
        gl.attachShader(p, compile(gl.VERTEX_SHADER, vsSrc));
        gl.attachShader(p, compile(gl.FRAGMENT_SHADER, fsSrc));
        gl.linkProgram(p);
        if (!gl.getProgramParameter(p, gl.LINK_STATUS)) {
            throw new Error(gl.getProgramInfoLog(p));
        }
        // 缓存所有 uniform 位置
        const map = {};
        const n = gl.getProgramParameter(p, gl.ACTIVE_UNIFORMS);
        for (let i = 0; i < n; i++) {
            const info = gl.getActiveUniform(p, i);
            map[info.name.replace('[0]', '')] = gl.getUniformLocation(p, info.name);
        }
        p.u = map;
        return p;
    }

    const sceneProg = createProgram(VERT_SRC, SCENE_FRAG_SRC);
    const compProg = createProgram(VERT_SRC, COMP_FRAG_SRC);

    // 无需顶点数据，只需绑定一个空 VAO
    gl.bindVertexArray(gl.createVertexArray());

    let targets = null;
    function makeTargets(w, h) {
        if (targets) {
            gl.deleteTexture(targets.tex);
            gl.deleteFramebuffer(targets.fbo);
        }
        const tex = gl.createTexture();
        gl.bindTexture(gl.TEXTURE_2D, tex);
        const internal = hasFloat ? gl.RGBA16F : gl.RGBA8;
        const type = hasFloat ? gl.HALF_FLOAT : gl.UNSIGNED_BYTE;
        gl.texImage2D(gl.TEXTURE_2D, 0, internal, w, h, 0, gl.RGBA, type, null);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);

        const fbo = gl.createFramebuffer();
        gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
        gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, tex, 0);
        gl.bindFramebuffer(gl.FRAMEBUFFER, null);
        targets = { tex, fbo, w, h };
    }

    // ---------- 尺寸与自适应分辨率 ----------
    let dynScale = params.scale;
    function resize() {
        const dpr = Math.min(window.devicePixelRatio || 1, 2);
        const cw = Math.round(canvas.clientWidth * dpr);
        const ch = Math.round(canvas.clientHeight * dpr);
        if (canvas.width !== cw || canvas.height !== ch) {
            canvas.width = cw;
            canvas.height = ch;
        }
        const w = Math.max(16, Math.round(cw * dynScale));
        const h = Math.max(16, Math.round(ch * dynScale));
        if (!targets || targets.w !== w || targets.h !== h) makeTargets(w, h);
    }
    window.addEventListener('resize', resize);

    // ---------- 渲染 ----------
    function render(time) {
        // 相机基底（观察者绕原点轨道运动，始终看向黑洞）
        const cp = Math.cos(cam.phi);
        const pos = [cam.dist * cp * Math.sin(cam.theta), cam.dist * Math.sin(cam.phi), cam.dist * cp * Math.cos(cam.theta)];
        const fwd = norm([-pos[0], -pos[1], -pos[2]]);
        const right = norm(cross(fwd, [0, 1, 0]));
        const up = cross(right, fwd);

        // 吸积盘法线：绕 X 轴倾斜 tilt 度（0 为水平盘，90 为正对观察方向）
        const t = params.tilt * Math.PI / 180;
        const diskN = [0, Math.cos(t), Math.sin(t)];
        const inner = Math.max(1.02, iscoRs(params.spin));

        // 场景：光线追踪 → 离屏 HDR 纹理
        gl.bindFramebuffer(gl.FRAMEBUFFER, targets.fbo);
        gl.viewport(0, 0, targets.w, targets.h);
        gl.useProgram(sceneProg);
        const u = sceneProg.u;
        gl.uniform2f(u.uRes, targets.w, targets.h);
        gl.uniform3f(u.uCamPos, pos[0], pos[1], pos[2]);
        gl.uniform3f(u.uCamRight, right[0], right[1], right[2]);
        gl.uniform3f(u.uCamUp, up[0], up[1], up[2]);
        gl.uniform3f(u.uCamFwd, fwd[0], fwd[1], fwd[2]);
        gl.uniform1f(u.uTanHalf, Math.tan(22.5 * Math.PI / 180));
        gl.uniform1f(u.uTime, time);
        gl.uniform1i(u.uSteps, params.steps);
        gl.uniform3f(u.uDiskN, diskN[0], diskN[1], diskN[2]);
        gl.uniform1f(u.uSpin, params.spin);
        gl.uniform1f(u.uInner, inner);
        gl.uniform1f(u.uOuter, Math.max(params.outer, inner + 0.5));
        gl.uniform1f(u.uBright, params.bright);
        gl.uniform1f(u.uT0, params.temp);
        gl.uniform1f(u.uOpacity, params.opacity);
        gl.uniform1f(u.uDoppler, params.doppler);
        gl.uniform1f(u.uLens, params.lens);
        gl.uniform1f(u.uFrame, params.frame);
        gl.uniform1f(u.uStars, params.stars);
        gl.drawArrays(gl.TRIANGLES, 0, 3);

        // 生成 mipmap 以用于泛光采样
        gl.bindTexture(gl.TEXTURE_2D, targets.tex);
        gl.generateMipmap(gl.TEXTURE_2D);

        // 合成：泛光 + 曝光 + 色调映射 + 伽马，输出到画布
        gl.bindFramebuffer(gl.FRAMEBUFFER, null);
        gl.viewport(0, 0, canvas.width, canvas.height);
        gl.useProgram(compProg);
        gl.activeTexture(gl.TEXTURE0);
        gl.bindTexture(gl.TEXTURE_2D, targets.tex);
        gl.uniform1i(compProg.u.uScene, 0);
        gl.uniform2f(compProg.u.uRes, canvas.width, canvas.height);
        gl.uniform1f(compProg.u.uBloom, params.bloom);
        gl.uniform1f(compProg.u.uExposure, params.exposure);
        gl.drawArrays(gl.TRIANGLES, 0, 3);
    }

    // ---------- 界面绑定 ----------
    const inputs = document.querySelectorAll('[data-key]');
    const outputs = {};
    document.querySelectorAll('[data-out]').forEach((el) => { outputs[el.dataset.out] = el; });

    const DECIMALS = { spin: 3, dist: 1, outer: 1, tilt: 0, temp: 0, opacity: 2, bright: 2, lens: 2, frame: 2,
                       stars: 2, bloom: 2, exposure: 2, scale: 2, speed: 2, doppler: 2 };

    function showValue(key) {
        const out = outputs[key];
        if (!out) return;
        const v = key === 'dist' ? cam.dist : params[key];
        out.textContent = typeof v === 'number' ? v.toFixed(DECIMALS[key] ?? 2) : '';
    }

    function setValue(key, value) {
        if (key === 'dist') cam.dist = value;
        else params[key] = value;
        if (key === 'scale') dynScale = value;
        if (key === 'adaptive' && !value) dynScale = params.scale;
        if (key === 'spin') showValue('isco');
    }

    function syncUI() {
        inputs.forEach((el) => {
            const key = el.dataset.key;
            const v = key === 'dist' ? cam.dist : params[key];
            if (el.type === 'checkbox') el.checked = !!v;
            else el.value = v;
            showValue(key);
        });
        if (outputs.isco) outputs.isco.textContent = iscoRs(params.spin).toFixed(3);
    }

    inputs.forEach((el) => {
        el.addEventListener('input', () => {
            const key = el.dataset.key;
            let v;
            if (el.type === 'checkbox') v = el.checked;
            else if (el.tagName === 'SELECT') v = parseFloat(el.value);
            else v = parseFloat(el.value);
            setValue(key, v);
            showValue(key);
            if (key === 'spin' && outputs.isco) outputs.isco.textContent = iscoRs(params.spin).toFixed(3);
        });
    });

    document.querySelectorAll('[data-preset]').forEach((btn) => {
        btn.addEventListener('click', () => {
            Object.entries(PRESETS[btn.dataset.preset]).forEach(([k, v]) => setValue(k, v));
            syncUI();
        });
    });

    // ---------- 相机交互 ----------
    let drag = null;
    canvas.addEventListener('pointerdown', (e) => {
        drag = { x: e.clientX, y: e.clientY };
        canvas.setPointerCapture(e.pointerId);
    });
    canvas.addEventListener('pointermove', (e) => {
        if (!drag) return;
        const dx = e.clientX - drag.x;
        const dy = e.clientY - drag.y;
        drag = { x: e.clientX, y: e.clientY };
        cam.theta -= dx * 0.005;
        cam.phi = clamp(cam.phi + dy * 0.005, -1.45, 1.45);
    });
    const endDrag = () => { drag = null; };
    canvas.addEventListener('pointerup', endDrag);
    canvas.addEventListener('pointercancel', endDrag);
    canvas.addEventListener('wheel', (e) => {
        e.preventDefault();
        cam.dist = clamp(cam.dist * Math.exp(e.deltaY * 0.0012), 4, 60);
        showValue('dist');
        document.querySelector('[data-key="dist"]').value = cam.dist;
    }, { passive: false });

    document.getElementById('resetView').addEventListener('click', () => {
        cam.theta = 0;
        cam.phi = 0.07;
    });

    document.getElementById('shot').addEventListener('click', () => {
        // 在同一任务内重绘并导出，避免缓冲区被清空
        render(time);
        canvas.toBlob((blob) => {
            const a = document.createElement('a');
            a.href = URL.createObjectURL(blob);
            a.download = 'gargantua.png';
            a.click();
            setTimeout(() => URL.revokeObjectURL(a.href), 1000);
        }, 'image/png');
    });

    const panel = document.getElementById('panel');
    document.getElementById('toggle').addEventListener('click', () => {
        panel.classList.toggle('collapsed');
    });

    // ---------- 主循环 ----------
    let time = 0;
    let last = performance.now();
    let frameTimes = [];
    let fpsAcc = 0, fpsLast = last;

    function frame(now) {
        const dt = Math.min(0.05, (now - last) / 1000);
        last = now;
        time += dt * params.speed * 3.0;
        if (params.autoRotate) cam.theta += dt * 0.1;

        resize();
        render(time);

        // 自适应分辨率：帧时间过长则降低渲染比例，富余时逐步恢复
        frameTimes.push(dt * 1000);
        if (frameTimes.length >= 45) {
            const avg = frameTimes.reduce((a, b) => a + b, 0) / frameTimes.length;
            if (params.adaptive) {
                if (avg > 30 && dynScale > 0.4) dynScale = Math.max(0.4, dynScale - 0.05);
                else if (avg < 16 && dynScale < params.scale) dynScale = Math.min(params.scale, dynScale + 0.05);
            } else {
                dynScale = params.scale;
            }
            frameTimes = [];
        }

        fpsAcc += 1;
        if (now - fpsLast > 500) {
            const fps = fpsAcc * 1000 / (now - fpsLast);
            if (outputs.fps) outputs.fps.textContent = `${fps.toFixed(0)} · ${Math.round(dynScale * 100)}%`;
            fpsAcc = 0;
            fpsLast = now;
        }

        requestAnimationFrame(frame);
    }

    syncUI();
    resize();
    requestAnimationFrame(frame);
})();

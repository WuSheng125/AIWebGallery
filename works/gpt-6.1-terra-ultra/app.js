(() => {
  'use strict';
  const names = ['mass', 'diskBrightness', 'diskTemperature', 'lensStrength', 'rotationSpeed', 'starDensity'];
  const controls = Object.fromEntries(names.map(name => [name, document.getElementById(name)]));
  const defaults = Object.fromEntries(names.map(name => [name, controls[name].value]));
  const pause = document.getElementById('pauseButton');
  let renderer;
  try {
    renderer = new window.BlackHoleRenderer(document.getElementById('blackholeCanvas'));
  } catch (error) {
    console.error('Unable to start the black hole renderer:', error);
    const message = document.createElement('div');
    message.style.cssText = 'position:absolute;inset:0;display:grid;place-items:center;padding:2rem;color:#e4d5c1;text-align:center;background:#08090b;z-index:2';
    message.textContent = '无法启动图形预览。请确认浏览器支持并启用了 WebGL，然后刷新页面。';
    document.getElementById('scene').appendChild(message);
    return;
  }
  function update() {
    const params = {};
    names.forEach(name => {
      const input = controls[name];
      const value = Number(input.value);
      document.getElementById(name + 'Value').textContent = value + '%';
      input.style.setProperty('--value', value + '%');
      params[name] = value / 100;
    });
    renderer.setParams(params);
  }
  names.forEach(name => controls[name].addEventListener('input', update));
  let paused = false;
  function setPaused(value) {
    paused = value;
    renderer.setPaused(paused);
    pause.classList.toggle('is-paused', paused);
    pause.setAttribute('aria-label', paused ? '播放动画' : '暂停动画');
    pause.title = paused ? '播放动画' : '暂停动画';
  }
  pause.addEventListener('click', () => setPaused(!paused));
  document.getElementById('resetButton').addEventListener('click', () => {
    names.forEach(name => { controls[name].value = defaults[name]; });
    renderer.resetView();
    setPaused(false);
    update();
  });
  update();
})();

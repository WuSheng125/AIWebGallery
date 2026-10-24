(() => {
  'use strict';

  const byId = (id) => document.getElementById(id);
  const overview = byId('overview');
  const viewer = byId('viewer');
  const grid = byId('works-grid');
  const galleryStatus = byId('gallery-status');
  const frameMount = byId('frame-mount');
  const frameLoading = byId('frame-loading');
  const statusText = byId('viewer-status-text');
  const workSelect = byId('work-select');
  const fullscreenButton = byId('fullscreen-work');
  const defaultTitle = 'AI Web Gallery — 同一道题，七种表达';
  let works = [];
  let activeId = null;
  let frameTimer = null;
  let frameGeneration = 0;
  let directoryReady = false;

  function element(tag, className, text) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined) node.textContent = text;
    return node;
  }

  function validateDirectory(data) {
    if (!Array.isArray(data) || data.length === 0) throw new Error('作品目录为空或格式不正确。');
    const ids = new Set();
    return data.map((work) => {
      if (!work || typeof work.id !== 'string' || !/^[a-z0-9]+(?:[.-][a-z0-9]+)*$/.test(work.id) || ids.has(work.id)) {
        throw new Error('作品目录包含无效或重复的作品编号。');
      }
      if (typeof work.model !== 'string' || !work.model.trim() || typeof work.entry !== 'string' || work.entry !== `demos/${work.id}/index.html`) {
        throw new Error('作品目录缺少模型名称，或入口路径不正确。');
      }
      if (typeof work.preview !== 'string' || ![`previews/${work.id}.png`, `previews/${work.id}.jpg`].includes(work.preview)) {
        throw new Error('作品目录的预览路径不正确。');
      }
      ids.add(work.id);
      return {
        ...work,
        effort: typeof work.effort === 'string' ? work.effort : '',
        title: typeof work.title === 'string' ? work.title : work.model,
        description: typeof work.description === 'string' ? work.description : '',
        stack: Array.isArray(work.stack) ? work.stack.filter((item) => typeof item === 'string') : [],
      };
    });
  }

  function renderCards() {
    const cards = document.createDocumentFragment();
    works.forEach((work, index) => {
      const card = element('a', 'work-card');
      card.href = `#view=${encodeURIComponent(work.id)}`;
      card.setAttribute('aria-label', `体验 ${work.model}${work.effort ? ` · ${work.effort}` : ''} 的作品：${work.title}`);
      const preview = element('div', 'work-preview');
      const fallback = element('div', 'preview-fallback');
      fallback.setAttribute('aria-hidden', 'true');
      const fallbackCaption = element('span', '', '正在读取静态预览');
      fallback.append(element('strong', '', work.model), fallbackCaption);
      const img = element('img');
      img.src = `./${work.preview}`;
      img.alt = `${work.model} 生成的卡冈图雅黑洞网页截图`;
      img.loading = index < 3 ? 'eager' : 'lazy';
      img.decoding = 'async';
      img.addEventListener('error', () => {
        img.hidden = true;
        fallbackCaption.textContent = '预览暂不可用 · 仍可进入体验';
      }, { once: true });
      const badge = element('span', 'preview-badge', `NO. ${String(index + 1).padStart(2, '0')}`);
      const action = element('span', 'preview-action', '进入体验');
      action.append(element('span', '', '↗'));
      action.setAttribute('aria-hidden', 'true');
      preview.append(fallback, img, badge, action);

      const info = element('div', 'work-info');
      const copy = element('div', 'work-info-copy');
      copy.append(element('h3', 'work-model', work.model));
      if (work.effort) copy.append(element('span', 'work-effort', work.effort));
      const arrow = element('span', 'work-arrow', '↗');
      arrow.setAttribute('aria-hidden', 'true');
      info.append(copy, arrow);
      const meta = element('div', 'work-meta');
      work.stack.forEach((technology) => meta.append(element('span', 'stack-tag', technology)));
      card.append(preview, info, element('p', 'work-description', work.description), meta);
      cards.append(card);
    });
    grid.replaceChildren(cards);
    byId('collection-count').textContent = String(works.length).padStart(2, '0');
    workSelect.replaceChildren(...works.map((work) => {
      const option = element('option', '', `${work.model}${work.effort ? ` · ${work.effort}` : ''}`);
      option.value = work.id;
      return option;
    }));
  }

  function removeFrame() {
    frameGeneration += 1;
    clearTimeout(frameTimer);
    frameTimer = null;
    frameMount.replaceChildren();
    activeId = null;
  }

  function showOverview() {
    const wasViewing = activeId !== null;
    if (document.fullscreenElement) {
      document.exitFullscreen().catch(() => {});
    }
    removeFrame();
    overview.hidden = false;
    viewer.hidden = true;
    document.body.classList.remove('is-viewing');
    document.title = defaultTitle;
    if (wasViewing) {
      if (location.hash === '#gallery') byId('collection-title').focus({ preventScroll: true });
      else byId('main').focus({ preventScroll: true });
    }
  }

  function showWork(work, forceReload = false) {
    if (activeId === work.id && !forceReload) return;
    removeFrame();
    activeId = work.id;
    const generation = frameGeneration;
    overview.hidden = true;
    viewer.hidden = false;
    document.body.classList.add('is-viewing');
    document.title = `${work.model} · ${work.effort || '作品体验'} — AI Web Gallery`;
    const index = works.findIndex((item) => item.id === work.id);
    byId('viewer-index').textContent = `WORK ${String(index + 1).padStart(2, '0')} / ${work.effort || 'GARGANTUA'}`;
    byId('viewer-title').textContent = work.model;
    workSelect.value = work.id;
    byId('open-work').href = `./${work.entry}`;
    statusText.textContent = '正在载入独立网页；画面和交互以作品实际显示为准。';
    frameLoading.hidden = false;

    const iframe = document.createElement('iframe');
    iframe.title = `${work.model}${work.effort ? ` · ${work.effort}` : ''} — ${work.title}`;
    iframe.allow = 'fullscreen';
    iframe.allowFullscreen = true;
    iframe.addEventListener('load', () => {
      if (generation !== frameGeneration) return;
      clearTimeout(frameTimer);
      frameLoading.hidden = true;
      statusText.textContent = '页面文档已载入。若画面持续空白，可重新加载或单独打开。';
    }, { once: true });
    iframe.addEventListener('error', () => {
      if (generation !== frameGeneration) return;
      clearTimeout(frameTimer);
      frameLoading.hidden = true;
      statusText.textContent = '浏览器报告页面加载异常。请重新加载，或单独打开查看。';
    }, { once: true });
    iframe.src = `./${work.entry}`;
    frameMount.append(iframe);
    frameTimer = setTimeout(() => {
      if (generation !== frameGeneration) return;
      frameLoading.hidden = true;
      statusText.textContent = '页面仍在加载；首次绘制可能需要更久。可继续等待，或单独打开。';
    }, 18000);
    if (!forceReload) {
      window.scrollTo({ top: 0, behavior: 'instant' });
      byId('viewer-title').focus({ preventScroll: true });
    }
  }

  function route() {
    if (!directoryReady) return;
    const match = /^#view=([^&]+)$/.exec(location.hash);
    if (match) {
      let id = '';
      try { id = decodeURIComponent(match[1]); } catch { /* Invalid URL falls back to the collection. */ }
      const work = works.find((item) => item.id === id);
      if (work) { showWork(work); return; }
      history.replaceState(null, '', `${location.pathname}${location.search}#gallery`);
    } else if (location.hash.startsWith('#view')) {
      history.replaceState(null, '', `${location.pathname}${location.search}#gallery`);
    }
    showOverview();
    if (location.hash === '#gallery') byId('gallery').scrollIntoView();
  }

  async function loadDirectory() {
    galleryStatus.hidden = false;
    galleryStatus.classList.remove('is-error');
    galleryStatus.textContent = '正在读取作品目录…';
    try {
      const response = await fetch('./works.json');
      if (!response.ok) throw new Error(`作品目录请求失败（HTTP ${response.status}）。`);
      works = validateDirectory(await response.json());
      renderCards();
      directoryReady = true;
      galleryStatus.hidden = true;
      route();
    } catch (error) {
      directoryReady = false;
      galleryStatus.classList.add('is-error');
      const fileHint = location.protocol === 'file:' ? '请通过本地 HTTP 服务打开本页，浏览器可能限制直接读取本地 JSON。' : '请确认 works.json 可访问后重试。';
      galleryStatus.textContent = `暂时无法读取作品目录。${error instanceof Error ? error.message : ''} ${fileHint}`;
      const retry = element('button', '', '重新读取');
      retry.type = 'button';
      retry.addEventListener('click', loadDirectory, { once: true });
      galleryStatus.append(retry);
    }
  }

  workSelect.addEventListener('change', () => { location.hash = `view=${encodeURIComponent(workSelect.value)}`; });
  byId('reload-work').addEventListener('click', () => {
    const work = works.find((item) => item.id === activeId);
    if (work) showWork(work, true);
  });
  fullscreenButton.addEventListener('click', async () => {
    try {
      if (document.fullscreenElement) await document.exitFullscreen();
      else await byId('viewer-frame').requestFullscreen();
    } catch {
      statusText.textContent = '当前浏览器未能进入全屏；可以单独打开作品体验。';
    }
  });
  document.addEventListener('fullscreenchange', () => {
    const isFullscreen = Boolean(document.fullscreenElement);
    fullscreenButton.setAttribute('aria-label', isFullscreen ? '退出全屏' : '全屏体验作品');
    fullscreenButton.title = isFullscreen ? '退出全屏' : '全屏体验作品';
  });
  byId('exit-fullscreen').addEventListener('click', async () => {
    if (!document.fullscreenElement) return;
    try {
      await document.exitFullscreen();
    } catch {
      statusText.textContent = '当前浏览器未能退出全屏，请使用浏览器的退出全屏操作。';
    }
  });
  window.addEventListener('hashchange', route);
  loadDirectory();
})();

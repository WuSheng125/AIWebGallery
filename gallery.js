(() => {
  'use strict';

  const grid = document.getElementById('works-grid');
  const status = document.getElementById('gallery-status');
  const count = document.getElementById('collection-count');
  const filters = document.getElementById('model-filters');
  const filterOptions = document.getElementById('model-filter-options');
  const modelSeriesNames = new Map([
    ['claude', 'Claude'],
    ['deepseek', 'DeepSeek'],
    ['gemini', 'Gemini'],
    ['glm', 'GLM'],
    ['chatgpt', 'ChatGPT'],
    ['grok', 'Grok'],
    ['hunyuan', '混元'],
    ['kimi', 'Kimi'],
    ['mimo', 'MiMo'],
    ['minimax', 'MiniMax'],
    ['muse-spark', 'Muse Spark'],
    ['qwen', 'Qwen'],
    ['step', 'Step'],
  ]);
  const monochromeSeries = new Set(['chatgpt', 'glm', 'grok', 'kimi']);
  const selectedCategories = new Set();
  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
  const cardItems = new Map();
  const cardAnimations = new Map();
  let directory = [];
  let gridAnimation = null;

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
        throw new Error('作品编号无效或重复。');
      }
      if (typeof work.model !== 'string' || !work.model.trim() || work.entry !== 'demos/' + work.id + '/index.html') {
        throw new Error('作品名称或入口路径不正确。');
      }
      if (!['previews/' + work.id + '.png', 'previews/' + work.id + '.jpg'].includes(work.preview)) {
        throw new Error('作品预览路径不正确。');
      }
      ids.add(work.id);
      return {
        ...work,
        类别: typeof work.类别 === 'string' ? work.类别.trim() : '',
        effort: typeof work.effort === 'string' ? work.effort : '',
        stack: Array.isArray(work.stack) ? work.stack.filter(item => typeof item === 'string') : [],
      };
    });
  }

  function renderFilters() {
    const categories = [...new Set(directory.map(work => work.类别).filter(Boolean))];
    const buttons = document.createDocumentFragment();
    ['', ...categories].forEach(category => {
      const button = element('button', 'model-filter-button');
      button.type = 'button';
      button.dataset.category = category;
      button.setAttribute('aria-pressed', String(category === ''));
      if (modelSeriesNames.has(category)) {
        const icon = element('img', 'model-filter-icon' + (monochromeSeries.has(category) ? ' is-monochrome' : ''));
        icon.src = './assets/models/' + category + '.svg';
        icon.alt = '';
        icon.width = 20;
        icon.height = 20;
        button.append(icon);
      }
      button.append(element('span', '', category ? modelSeriesNames.get(category) ?? category : '全部'));
      buttons.append(button);
    });
    filterOptions.replaceChildren(buttons);
    filters.hidden = false;
  }

  function applyFilters(animate = false) {
    const visible = selectedCategories.size
      ? directory.filter(work => selectedCategories.has(work.类别))
      : directory;
    for (const button of filterOptions.querySelectorAll('button[data-category]')) {
      const category = button.dataset.category;
      button.setAttribute('aria-pressed', String(category ? selectedCategories.has(category) : selectedCategories.size === 0));
    }

    renderCards(visible, animate);
    count.textContent = (selectedCategories.size ? visible.length + ' / ' + directory.length : directory.length) + ' 个作品';
  }

  filterOptions.addEventListener('click', event => {
    const button = event.target.closest('button[data-category]');
    if (!button || !filterOptions.contains(button)) return;
    const category = button.dataset.category;
    if (!category) selectedCategories.clear();
    else if (selectedCategories.has(category)) selectedCategories.delete(category);
    else selectedCategories.add(category);
    applyFilters(true);
  });

  window.addEventListener('resize', () => {
    if (cardAnimations.size || gridAnimation) applyFilters();
  });
  reducedMotion.addEventListener('change', () => {
    if (reducedMotion.matches && directory.length) applyFilters();
  });

  function formatDuration(seconds) {
    if (typeof seconds !== 'number' || !Number.isFinite(seconds) || seconds < 0) return null;
    const rounded = Math.round(seconds * 100) / 100;
    const hours = Math.floor(rounded / 3600);
    const minutes = Math.floor((rounded % 3600) / 60);
    const remainder = Math.round((rounded % 60) * 100) / 100;
    const parts = [];
    if (hours) parts.push(hours + ' 小时');
    if (minutes) parts.push(minutes + ' 分');
    if (remainder || parts.length === 0) parts.push(remainder + ' 秒');
    return parts.join(' ');
  }

  function formatCost(cost) {
    if (typeof cost === 'string') return cost.trim() || null;
    if (!cost || typeof cost.amount !== 'number' || !Number.isFinite(cost.amount) || cost.amount < 0 || typeof cost.currency !== 'string') return null;
    const currency = cost.currency.trim().toUpperCase();
    if (!/^[A-Z]{3}$/.test(currency)) return null;
    return new Intl.NumberFormat('zh-CN', {
      style: 'currency', currency, currencyDisplay: 'code', maximumFractionDigits: 6,
    }).format(cost.amount);
  }

  function metric(label, value) {
    const group = element('div');
    const data = element('dd', value === null ? 'is-missing' : '', value ?? '—');
    if (value === null) data.setAttribute('aria-label', '未提供');
    group.append(element('dt', '', label), data);
    return group;
  }

  function formatDate(value) {
    if (typeof value !== 'string') return null;
    const match = /^(\d{4})[-/](\d{1,2})[-/](\d{1,2})$/.exec(value.trim());
    if (!match) return null;
    const year = Number(match[1]);
    const month = Number(match[2]);
    const day = Number(match[3]);
    const leapYear = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
    const daysInMonth = [31, leapYear ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
    if (year < 1 || month < 1 || month > 12 || day < 1 || day > daysInMonth[month - 1]) return null;
    return match[1] + '/' + String(month).padStart(2, '0') + '/' + String(day).padStart(2, '0');
  }

  function resetCardItem(item) {
    item.classList.remove('is-leaving');
    item.inert = false;
    item.removeAttribute('aria-hidden');
    item.style.removeProperty('left');
    item.style.removeProperty('top');
    item.style.removeProperty('width');
    item.style.removeProperty('height');
  }

  function animateCard(item, frames, duration, onFinish) {
    const animation = item.animate(frames, {
      duration,
      easing: 'cubic-bezier(.22, 1, .36, 1)',
    });
    cardAnimations.set(item, animation);
    animation.finished.then(() => {
      if (cardAnimations.get(item) !== animation) return;
      cardAnimations.delete(item);
      onFinish?.();
    }, () => {});
  }

  function renderCards(works, animate = false) {
    const shouldAnimate = animate && !reducedMotion.matches && typeof grid.animate === 'function';
    const firstGrid = grid.getBoundingClientRect();
    const previous = new Map();
    // Read the visible position before cancelling an interrupted transition.
    for (const item of grid.children) {
      if (shouldAnimate) {
        const style = window.getComputedStyle(item);
        previous.set(item, {
          rect: item.getBoundingClientRect(),
          opacity: style.opacity,
          layoutWidth: parseFloat(style.width),
          layoutHeight: parseFloat(style.height),
        });
      }
    }
    for (const animation of cardAnimations.values()) animation.cancel();
    cardAnimations.clear();
    gridAnimation?.cancel();
    gridAnimation = null;

    const nextItems = works.map((work, index) => {
      let item = cardItems.get(work.id);
      if (!item) {
        item = element('div', 'work-item');
        item.dataset.workId = work.id;
        item.append(createCard(work, index));
        cardItems.set(work.id, item);
      }
      resetCardItem(item);
      item.querySelector('img').loading = index < 3 ? 'eager' : 'lazy';
      return item;
    });
    grid.replaceChildren(...nextItems);
    if (!shouldAnimate || previous.size === 0) return;

    const lastGrid = grid.getBoundingClientRect();
    const lastRects = new Map(nextItems.map(item => [item, item.getBoundingClientRect()]));
    for (const item of nextItems) {
      const first = previous.get(item);
      if (!first) {
        animateCard(item, [
          { opacity: 0, transform: 'scale(.96)' },
          { opacity: 1, transform: 'none' },
        ], 240);
        continue;
      }
      const last = lastRects.get(item);
      const x = first.rect.left - last.left + (first.rect.width - last.width) / 2;
      const y = first.rect.top - last.top + (first.rect.height - last.height) / 2;
      if (Math.abs(x) < .5 && Math.abs(y) < .5 && Math.abs(first.rect.width - last.width) < .5 && Math.abs(first.rect.height - last.height) < .5 && Number(first.opacity) === 1) continue;
      animateCard(item, [
        { opacity: first.opacity, transform: `translate(${x}px, ${y}px) scale(${first.rect.width / last.width}, ${first.rect.height / last.height})` },
        { opacity: 1, transform: 'none' },
      ], 320);
    }

    const next = new Set(nextItems);
    for (const [item, first] of previous) {
      if (next.has(item)) continue;
      item.classList.add('is-leaving');
      item.inert = true;
      item.setAttribute('aria-hidden', 'true');
      const scaleX = first.rect.width / first.layoutWidth;
      const scaleY = first.rect.height / first.layoutHeight;
      item.style.left = first.rect.left - lastGrid.left + (first.rect.width - first.layoutWidth) / 2 + 'px';
      item.style.top = first.rect.top - lastGrid.top + (first.rect.height - first.layoutHeight) / 2 + 'px';
      item.style.width = first.layoutWidth + 'px';
      item.style.height = first.layoutHeight + 'px';
      grid.append(item);
      animateCard(item, [
        { opacity: first.opacity, transform: `scale(${scaleX}, ${scaleY})` },
        { opacity: 0, transform: `scale(${scaleX * .94}, ${scaleY * .94})` },
      ], 160, () => {
        item.remove();
        resetCardItem(item);
      });
    }

    if (Math.abs(firstGrid.height - lastGrid.height) > .5) {
      const animation = grid.animate([
        { height: firstGrid.height + 'px' },
        { height: lastGrid.height + 'px' },
      ], { duration: 320, easing: 'cubic-bezier(.22, 1, .36, 1)' });
      gridAnimation = animation;
      animation.finished.then(() => {
        if (gridAnimation === animation) gridAnimation = null;
      }, () => {});
    }
  }

  function createCard(work, index) {
    const label = work.model + (work.effort ? ' · ' + work.effort : '');
    const card = element('a', 'work-card');
    card.href = './' + work.entry;
    card.target = '_blank';
    card.rel = 'noopener noreferrer';
    card.setAttribute('aria-label', '打开 ' + label + '（新标签页）');

    const preview = element('div', 'work-preview');
    const fallback = element('div', 'preview-fallback', '正在读取预览');
    fallback.setAttribute('aria-hidden', 'true');
    const img = element('img');
    img.src = './' + work.preview;
    img.alt = label + ' 网页截图';
    img.loading = index < 3 ? 'eager' : 'lazy';
    img.decoding = 'async';
    img.addEventListener('error', () => {
      img.hidden = true;
      fallback.textContent = '预览不可用';
    }, { once: true });
    preview.append(fallback, img);

    const body = element('div', 'work-body');
    const heading = element('div', 'work-heading');
    const name = element('div', 'work-name');
    name.append(element('h2', 'work-model', work.model));
    if (work.effort) name.append(element('span', 'work-effort', work.effort));
    const arrow = element('span', 'work-arrow', '↗');
    arrow.setAttribute('aria-hidden', 'true');
    heading.append(name, arrow);

    const metrics = element('dl', 'work-metrics');
    const harness = typeof work.harness === 'string' && work.harness.trim() ? work.harness.trim() : null;
    metrics.append(metric('用时', formatDuration(work.durationSeconds)), metric('费用', formatCost(work.cost)), metric('Harness', harness), metric('测试时间', formatDate(work.testDate)));
    body.append(heading, metrics);
    if (work.stack.length) {
      const stack = element('div', 'work-stack');
      work.stack.forEach(technology => stack.append(element('span', '', technology)));
      body.append(stack);
    }
    card.append(preview, body);
    return card;
  }

  async function loadDirectory() {
    status.hidden = false;
    status.classList.remove('is-error');
    status.textContent = '正在读取作品…';
    try {
      const response = await fetch('./works.json');
      if (!response.ok) throw new Error('HTTP ' + response.status);
      directory = validateDirectory(await response.json());
      selectedCategories.clear();
      renderFilters();
      applyFilters();
      status.hidden = true;
    } catch (error) {
      status.classList.add('is-error');
      status.textContent = '无法读取作品目录：' + (error instanceof Error ? error.message : '请求失败') + '。';
      if (location.protocol === 'file:') status.append('请通过本地 HTTP 服务打开。');
      const retry = element('button', '', '重试');
      retry.type = 'button';
      retry.addEventListener('click', loadDirectory, { once: true });
      status.append(retry);
    }
  }

  loadDirectory();
})();

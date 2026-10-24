(() => {
  'use strict';

  const grid = document.getElementById('works-grid');
  const status = document.getElementById('gallery-status');
  const count = document.getElementById('collection-count');

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
        effort: typeof work.effort === 'string' ? work.effort : '',
        stack: Array.isArray(work.stack) ? work.stack.filter(item => typeof item === 'string') : [],
      };
    });
  }

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

  function renderCards(works) {
    const cards = document.createDocumentFragment();
    works.forEach((work, index) => {
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
      cards.append(card);
    });
    grid.replaceChildren(cards);
    count.textContent = works.length + ' 个作品';
  }

  async function loadDirectory() {
    status.hidden = false;
    status.classList.remove('is-error');
    status.textContent = '正在读取作品…';
    try {
      const response = await fetch('./works.json');
      if (!response.ok) throw new Error('HTTP ' + response.status);
      renderCards(validateDirectory(await response.json()));
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

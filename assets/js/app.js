/**
 * CONVRT — interface: grade de conversores, fila de arquivos, opções,
 * execução, resultados, histórico e tema.
 */
(function (root) {
  'use strict';

  const F = root.CONVRT.formats;
  const CONVERTERS = root.CONVRT.converters;
  const CATEGORIES = root.CONVRT.categories;

  const STORE = { theme: 'convrt:tema', history: 'convrt:historico' };
  const MAX_PREVIEW = 4000;

  const state = {
    current: null,
    files: [],
    results: [],
    filter: '',
    category: 'todos',
    urls: []
  };

  const $ = sel => document.querySelector(sel);
  const el = (tag, attrs, children) => {
    const node = document.createElement(tag);
    for (const [k, v] of Object.entries(attrs || {})) {
      if (k === 'class') node.className = v;
      else if (k === 'text') node.textContent = v;
      else if (k.startsWith('on')) node.addEventListener(k.slice(2), v);
      else if (v !== null && v !== undefined && v !== false) node.setAttribute(k, v === true ? '' : v);
    }
    for (const child of [].concat(children || [])) {
      if (child === null || child === undefined || child === false) continue;
      node.append(child.nodeType ? child : document.createTextNode(String(child)));
    }
    return node;
  };

  // ── avisos ───────────────────────────────────────────────────────────
  let toastTimer = null;
  function toast(message, kind) {
    const node = $('#toast');
    node.textContent = message;
    node.className = 'toast show' + (kind ? ' ' + kind : '');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => { node.className = 'toast'; }, kind === 'error' ? 6000 : 3000);
  }

  // ── tema ─────────────────────────────────────────────────────────────
  function applyTheme(theme) {
    document.documentElement.dataset.theme = theme;
    localStorage.setItem(STORE.theme, theme);
    const button = $('#theme-toggle');
    button.textContent = theme === 'light' ? '◐ escuro' : '◑ claro';
    button.setAttribute('aria-label', 'Alternar para tema ' + (theme === 'light' ? 'escuro' : 'claro'));
  }

  function initTheme() {
    const saved = localStorage.getItem(STORE.theme);
    const prefersLight = root.matchMedia && root.matchMedia('(prefers-color-scheme: light)').matches;
    applyTheme(saved || (prefersLight ? 'light' : 'dark'));
    $('#theme-toggle').addEventListener('click', () =>
      applyTheme(document.documentElement.dataset.theme === 'light' ? 'dark' : 'light'));
  }

  // ── histórico ────────────────────────────────────────────────────────
  function readHistory() {
    try {
      return JSON.parse(localStorage.getItem(STORE.history) || '[]');
    } catch (err) {
      return [];
    }
  }

  function pushHistory(entry) {
    const list = readHistory().filter(item => item.id !== entry.id);
    list.unshift(entry);
    localStorage.setItem(STORE.history, JSON.stringify(list.slice(0, 8)));
    renderHistory();
  }

  function renderHistory() {
    const list = readHistory();
    const box = $('#history');
    box.innerHTML = '';
    if (!list.length) { box.hidden = true; return; }
    box.hidden = false;
    box.append(el('span', { class: 'history-label', text: '// usados recentemente' }));
    for (const item of list) {
      const conv = root.CONVRT.get(item.id);
      if (!conv) continue;
      box.append(el('button', {
        class: 'chip', type: 'button', text: conv.from + ' → ' + conv.to,
        title: conv.desc, onclick: () => selectConverter(item.id, true)
      }));
    }
    box.append(el('button', {
      class: 'chip chip-clear', type: 'button', text: 'limpar',
      onclick: () => { localStorage.removeItem(STORE.history); renderHistory(); }
    }));
  }

  // ── grade de conversores ─────────────────────────────────────────────
  function renderFilters() {
    const bar = $('#filters');
    bar.innerHTML = '';
    const entries = [['todos', { label: 'Todos', icon: '✦' }], ...Object.entries(CATEGORIES)];
    for (const [key, meta] of entries) {
      const count = key === 'todos' ? CONVERTERS.length : CONVERTERS.filter(c => c.cat === key).length;
      bar.append(el('button', {
        class: 'chip' + (state.category === key ? ' active' : ''),
        type: 'button',
        'aria-pressed': state.category === key,
        onclick: () => { state.category = key; renderFilters(); renderGrid(); }
      }, [meta.icon + ' ' + meta.label + ' (' + count + ')']));
    }
  }

  function matches(conv) {
    if (state.category !== 'todos' && conv.cat !== state.category) return false;
    if (!state.filter) return true;
    const haystack = [conv.id, conv.from, conv.to, conv.desc, CATEGORIES[conv.cat].label].join(' ').toLowerCase();
    return state.filter.toLowerCase().split(/\s+/).every(term => haystack.includes(term));
  }

  function renderGrid() {
    const grid = $('#grid');
    grid.innerHTML = '';
    const visible = CONVERTERS.filter(matches);

    if (!visible.length) {
      grid.append(el('p', { class: 'empty', text: 'Nenhum conversor encontrado para "' + state.filter + '".' }));
      return;
    }

    for (const conv of visible) {
      grid.append(el('button', {
        class: 'conv-card' + (state.current === conv.id ? ' active' : ''),
        type: 'button',
        'data-id': conv.id,
        'aria-pressed': state.current === conv.id,
        onclick: () => selectConverter(conv.id, true)
      }, [
        el('span', { class: 'conv-from-to' }, [
          el('span', { class: 'badge badge-from', text: conv.from }),
          el('span', { class: 'arrow', text: '→' }),
          el('span', { class: 'badge badge-to', text: conv.to }),
          conv.multiple ? el('span', { class: 'tag-multi', text: 'lote', title: 'aceita vários arquivos' }) : null
        ]),
        el('span', { class: 'conv-desc', text: conv.desc })
      ]));
    }
    $('#count').textContent = visible.length + ' de ' + CONVERTERS.length;
  }

  // ── seleção ──────────────────────────────────────────────────────────
  function selectConverter(id, scroll) {
    const conv = root.CONVRT.get(id);
    if (!conv) return;
    state.current = id;
    state.files = [];
    clearResults();
    if (location.hash.slice(1) !== id) history.replaceState(null, '', '#' + id);

    $('#workspace').hidden = false;
    $('#ws-title').textContent = conv.from + ' → ' + conv.to;
    $('#ws-desc').textContent = conv.desc;
    $('#ws-cat').textContent = CATEGORIES[conv.cat].icon + ' ' + CATEGORIES[conv.cat].label;

    const input = $('#file-input');
    input.value = '';
    input.accept = conv.accept || '';
    input.multiple = !!(conv.multiple || conv.batch);
    $('#accept-hint').textContent = conv.accept
      ? 'aceita ' + conv.accept.split(',').filter(a => a.startsWith('.')).join(' ') || conv.accept
      : 'qualquer arquivo';
    $('#batch-hint').hidden = !(conv.multiple || conv.batch);

    renderOptions(conv);
    renderFileList();
    renderGrid();
    if (scroll) $('#workspace').scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  function renderOptions(conv) {
    const box = $('#options');
    box.innerHTML = '';
    if (!conv.options || !conv.options.length) { box.hidden = true; return; }
    box.hidden = false;

    for (const opt of conv.options) {
      const id = 'opt-' + opt.id;
      if (opt.type === 'checkbox') {
        box.append(el('label', { class: 'opt opt-check', for: id }, [
          el('input', { type: 'checkbox', id, 'data-opt': opt.id, checked: !!opt.value }),
          el('span', { text: opt.label })
        ]));
        continue;
      }
      const field = opt.type === 'select'
        ? el('select', { class: 'opt-input', id, 'data-opt': opt.id },
          opt.options.map(o => el('option', { value: o.value, selected: o.value === opt.value, text: o.label })))
        : el('input', {
          class: 'opt-input', id, 'data-opt': opt.id,
          type: opt.type === 'number' ? 'number' : 'text',
          value: opt.value === undefined ? '' : opt.value,
          placeholder: opt.placeholder || '',
          min: opt.min, max: opt.max, step: opt.step
        });
      box.append(el('label', { class: 'opt', for: id }, [
        el('span', { class: 'opt-label', text: '// ' + opt.label }),
        field
      ]));
    }
  }

  function readOptions(conv) {
    const values = {};
    for (const opt of conv.options || []) {
      const node = document.querySelector('[data-opt="' + opt.id + '"]');
      if (!node) { values[opt.id] = opt.value; continue; }
      values[opt.id] = opt.type === 'checkbox' ? node.checked
        : opt.type === 'number' ? Number(node.value)
          : node.value;
    }
    return values;
  }

  // ── arquivos ─────────────────────────────────────────────────────────
  function addFiles(fileList) {
    const conv = root.CONVRT.get(state.current);
    if (!conv) { toast('Escolha uma conversão primeiro', 'error'); return; }
    const incoming = [...fileList];
    if (!incoming.length) return;
    const allowMany = !!(conv.multiple || conv.batch);
    state.files = allowMany ? state.files.concat(incoming) : [incoming[0]];
    clearResults();
    renderFileList();
  }

  function renderFileList() {
    const box = $('#files');
    box.innerHTML = '';
    const total = state.files.reduce((sum, f) => sum + f.size, 0);
    box.hidden = !state.files.length;
    $('#btn-convert').disabled = !state.files.length;

    state.files.forEach((file, index) => {
      box.append(el('div', { class: 'file-row' }, [
        el('span', { class: 'file-icon', text: root.CONVRT.get(state.current).icon }),
        el('span', { class: 'file-name', text: file.name, title: file.name }),
        el('span', { class: 'file-size', text: F.humanSize(file.size) }),
        el('button', {
          class: 'file-remove', type: 'button', title: 'remover', 'aria-label': 'Remover ' + file.name,
          onclick: () => { state.files.splice(index, 1); clearResults(); renderFileList(); }
        }, ['✕'])
      ]));
    });

    if (state.files.length > 1) {
      box.append(el('div', { class: 'file-total' },
        [state.files.length + ' arquivos · ' + F.humanSize(total)]));
    }
  }

  // ── resultados ───────────────────────────────────────────────────────
  function clearResults() {
    state.urls.forEach(URL.revokeObjectURL);
    state.urls = [];
    state.results = [];
    $('#results').hidden = true;
    $('#results-list').innerHTML = '';
    setProgress(0);
  }

  function objectUrl(blob) {
    const url = URL.createObjectURL(blob);
    state.urls.push(url);
    return url;
  }

  function setProgress(pct) {
    const bar = $('#progress');
    bar.hidden = pct <= 0 || pct >= 100;
    $('#progress-fill').style.width = Math.max(0, Math.min(100, pct)) + '%';
  }

  function renderResults(sourceSize) {
    const list = $('#results-list');
    list.innerHTML = '';
    $('#results').hidden = false;

    const okResults = state.results.filter(r => !r.error);
    const outSize = okResults.reduce((sum, r) => sum + r.blob.size, 0);
    const delta = sourceSize > 0 && outSize > 0 ? Math.round((1 - outSize / sourceSize) * 100) : null;
    $('#results-summary').textContent = okResults.length + ' arquivo(s) · ' + F.humanSize(outSize) +
      (delta !== null && Math.abs(delta) >= 1 ? (delta > 0 ? ' · ' + delta + '% menor' : ' · ' + -delta + '% maior') : '');

    for (const result of state.results) {
      if (result.error) {
        list.append(el('div', { class: 'result result-error' }, [
          el('div', { class: 'result-head' }, [
            el('span', { class: 'result-name', text: result.name }),
            el('span', { class: 'result-size', text: 'erro' })
          ]),
          el('p', { class: 'result-msg', text: result.error })
        ]));
        continue;
      }

      const url = objectUrl(result.blob);
      const body = [];

      if (result.kind === 'image') {
        body.push(el('img', { class: 'result-img', src: url, alt: 'prévia de ' + result.name, loading: 'lazy' }));
      } else if (result.text !== null && result.text !== undefined) {
        const preview = result.text.slice(0, MAX_PREVIEW) +
          (result.text.length > MAX_PREVIEW ? '\n\n[… prévia cortada, o arquivo tem tudo]' : '');
        body.push(el('pre', { class: 'result-preview', text: preview }));
      }

      const actions = [el('a', { class: 'btn btn-download', href: url, download: result.name }, ['↓ baixar'])];
      if (result.text) {
        actions.push(el('button', {
          class: 'btn btn-ghost', type: 'button',
          onclick: async () => {
            try {
              await navigator.clipboard.writeText(result.text);
              toast('✓ copiado para a área de transferência');
            } catch (err) {
              toast('não consegui copiar: ' + err.message, 'error');
            }
          }
        }, ['⧉ copiar']));
      }

      list.append(el('div', { class: 'result' }, [
        el('div', { class: 'result-head' }, [
          el('span', { class: 'result-name', text: result.name, title: result.name }),
          el('span', { class: 'result-size', text: F.humanSize(result.blob.size) })
        ]),
        ...body,
        el('div', { class: 'result-actions' }, actions)
      ]));
    }

    $('#btn-zip').hidden = okResults.length < 2;
  }

  async function downloadZip() {
    const okResults = state.results.filter(r => !r.error);
    if (okResults.length < 2) return;
    try {
      const JSZip = await root.CONVRT.lib('jszip');
      const zip = new JSZip();
      okResults.forEach(r => zip.file(r.name, r.blob));
      const blob = await zip.generateAsync({ type: 'blob', compression: 'DEFLATE' });
      const link = el('a', { href: objectUrl(blob), download: 'convrt-' + Date.now() + '.zip' });
      document.body.append(link);
      link.click();
      link.remove();
    } catch (err) {
      toast(err.message, 'error');
    }
  }

  // ── conversão ────────────────────────────────────────────────────────
  let running = false;

  async function convert() {
    const conv = root.CONVRT.get(state.current);
    if (!conv || !state.files.length || running) return;

    running = true;
    const button = $('#btn-convert');
    button.disabled = true;
    button.textContent = '⏳ convertendo…';
    clearResults();
    setProgress(5);

    const opts = readOptions(conv);
    const sourceSize = state.files.reduce((sum, f) => sum + f.size, 0);
    const results = [];

    try {
      if (conv.batch) {
        const ctx = { progress: pct => setProgress(Math.max(5, pct)) };
        const output = await conv.run(state.files, opts, ctx);
        results.push(...[].concat(output));
      } else {
        for (let i = 0; i < state.files.length; i++) {
          const file = state.files[i];
          const base = (i / state.files.length) * 100;
          const slice = 100 / state.files.length;
          const ctx = { progress: pct => setProgress(base + (pct / 100) * slice) };
          try {
            const output = await conv.run(file, opts, ctx);
            results.push(...[].concat(output));
          } catch (err) {
            results.push({ name: file.name, error: err.message });
            console.error('[convrt]', file.name, err);
          }
        }
      }

      state.results = results;
      setProgress(100);
      renderResults(sourceSize);

      const failed = results.filter(r => r.error).length;
      if (failed && failed === results.length) toast('Não deu certo: ' + results[0].error, 'error');
      else if (failed) toast(failed + ' arquivo(s) falharam — veja a lista', 'error');
      else {
        toast('✓ pronto! ' + results.length + ' arquivo(s) gerado(s)');
        pushHistory({ id: conv.id, at: Date.now() });
      }
    } catch (err) {
      console.error('[convrt]', err);
      toast(err.message, 'error');
      setProgress(0);
    }

    button.disabled = false;
    button.textContent = '⚙ converter';
    running = false;
  }

  // ── eventos globais ──────────────────────────────────────────────────
  function bindEvents() {
    $('#search').addEventListener('input', e => { state.filter = e.target.value.trim(); renderGrid(); });
    $('#btn-convert').addEventListener('click', convert);
    $('#btn-zip').addEventListener('click', downloadZip);
    $('#file-input').addEventListener('change', e => addFiles(e.target.files));
    $('#btn-clear-files').addEventListener('click', () => { state.files = []; clearResults(); renderFileList(); });

    const zone = $('#dropzone');
    zone.addEventListener('click', () => $('#file-input').click());
    zone.addEventListener('keydown', e => {
      if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); $('#file-input').click(); }
    });

    let dragDepth = 0;
    document.addEventListener('dragenter', e => {
      if (!e.dataTransfer || ![...e.dataTransfer.types].includes('Files')) return;
      e.preventDefault();
      dragDepth++;
      document.body.classList.add('dragging');
    });
    document.addEventListener('dragover', e => { if (e.dataTransfer) e.preventDefault(); });
    document.addEventListener('dragleave', () => {
      dragDepth = Math.max(0, dragDepth - 1);
      if (!dragDepth) document.body.classList.remove('dragging');
    });
    document.addEventListener('drop', e => {
      if (!e.dataTransfer || !e.dataTransfer.files.length) return;
      e.preventDefault();
      dragDepth = 0;
      document.body.classList.remove('dragging');
      if (!state.current) { toast('Escolha uma conversão antes de soltar o arquivo', 'error'); return; }
      addFiles(e.dataTransfer.files);
    });

    document.addEventListener('keydown', e => {
      const typing = /^(INPUT|SELECT|TEXTAREA)$/.test(document.activeElement.tagName);
      if (e.key === '/' && !typing) { e.preventDefault(); $('#search').focus(); }
      if (e.key === 'Escape' && typing && document.activeElement.id === 'search') {
        document.activeElement.value = '';
        state.filter = '';
        renderGrid();
        document.activeElement.blur();
      }
      if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) { e.preventDefault(); convert(); }
    });

    root.addEventListener('hashchange', () => {
      const id = location.hash.slice(1);
      if (id && id !== state.current) selectConverter(id, false);
    });
  }

  // ── service worker (funciona offline depois da 1ª visita) ────────────
  function registerServiceWorker() {
    if (!('serviceWorker' in navigator)) return;
    if (!/^https?:$/.test(location.protocol)) return;   // file:// não suporta SW
    navigator.serviceWorker.register('sw.js').catch(() => {});
  }

  // ── início ───────────────────────────────────────────────────────────
  function init() {
    initTheme();
    renderFilters();
    renderGrid();
    renderHistory();
    bindEvents();
    registerServiceWorker();

    $('#year').textContent = new Date().getFullYear();
    $('#total-converters').textContent = CONVERTERS.length;

    const fromHash = location.hash.slice(1);
    if (fromHash && root.CONVRT.get(fromHash)) selectConverter(fromHash, false);
  }

  document.readyState === 'loading'
    ? document.addEventListener('DOMContentLoaded', init)
    : init();
})(window);

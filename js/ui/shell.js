/* =========================================================
   js/ui/shell.js : 画面の骨組み
   ・左のアイコン列と脇パネル（登録制：X.shell.panel({...}) で増やせる）
   ・メインの切り替えタブ（登録制：X.shell.view({...})）
   ・ファイルの受け付け（どこにでもドロップ／ファイル選択／Ctrl+V）
   パネルは一度に 1 つ開く。中身は関係するイベントで描き直し、入力中の欄のフォーカスは戻す。
   ========================================================= */
(function (X) {
  'use strict';
  const { h, icon, clear, storage } = X.util;
  const panels = [];
  const views = [];
  let openId = null;
  let viewId = null;

  /* ---------- 脇パネル ---------- */
  function panel(def) {
    panels.push(def);
    panels.sort((a, b) => (a.order || 0) - (b.order || 0));
    (def.refreshOn || []).forEach((ev) => X.bus.on(ev, () => { if (openId === def.id) requestRender(); updateBadges(); }));
  }

  /* マウスを押している間に描き直すと、押した部品が消えてクリックが失われるため、離してから描き直す */
  let pointerDown = false, pendingRender = false;
  document.addEventListener('pointerdown', () => { pointerDown = true; }, true);
  document.addEventListener('pointerup', () => {
    pointerDown = false;
    if (pendingRender) { pendingRender = false; setTimeout(render, 0); }
  }, true);
  function requestRender() {
    if (pointerDown) { pendingRender = true; return; }
    render();
  }

  function railButton(p) {
    return h('button', { class: 'rail-btn' + (p.id === openId ? ' is-on' : ''), title: p.title, 'aria-label': p.title, dataset: { panel: p.id },
      on: { click: () => (p.action ? p.action() : toggle(p.id)) } }, icon(p.icon), h('span', { class: 'rail-badge', hidden: true }));
  }

  function buildRail() {
    const rail = document.getElementById('rail');
    clear(rail);
    rail.appendChild(h('div', { class: 'rail-top' }, panels.filter((p) => !p.bottom).map(railButton)));
    rail.appendChild(h('div', { class: 'rail-bottom' }, panels.filter((p) => p.bottom).map(railButton)));
    updateBadges();
  }

  function updateBadges() {
    panels.forEach((p) => {
      const b = document.querySelector('.rail-btn[data-panel="' + p.id + '"] .rail-badge');
      if (!b) return;
      const v = p.badge ? p.badge() : '';
      b.hidden = !v;
      b.textContent = v || '';
    });
  }

  /** 入力中の欄（data-key 付き）を覚えて描き直し、フォーカスを戻す */
  let rendering = false;
  function render() {
    const p = panels.find((x) => x.id === openId);
    if (!p) return;
    // 描き直しの途中（入力欄が消えて change が起きたときなど）は、終わってからもう一度
    if (rendering) { setTimeout(render, 0); return; }
    rendering = true;
    try { renderPanel(p); } finally { rendering = false; }
  }
  function renderPanel(p) {
    const body = document.getElementById('panel-body');
    const act = document.activeElement;
    const key = act && body.contains(act) && act.dataset ? act.dataset.key : null;
    const sel = key && act.selectionStart != null ? [act.selectionStart, act.selectionEnd] : null;
    const scroll = body.scrollTop;
    clear(body);
    p.render(body);
    body.scrollTop = scroll;
    if (key) {
      const el = body.querySelector('[data-key="' + CSS.escape(key) + '"]');
      if (el) { X.ui.restoring = true; el.focus({ preventScroll: true }); X.ui.restoring = false; if (sel && el.setSelectionRange) try { el.setSelectionRange(sel[0], sel[1]); } catch (e) { /* 選択できない欄 */ } }
    }
  }

  function open(id) {
    const p = panels.find((x) => x.id === id);
    if (!p) return;
    openId = id;
    storage.set('x2s.panel', id);
    document.getElementById('app').classList.add('has-panel');
    document.getElementById('panel-title').replaceChildren(icon(p.icon), h('span', { text: p.title }));
    document.querySelectorAll('.rail-btn').forEach((b) => b.classList.toggle('is-on', b.dataset.panel === id));
    render();
  }

  function close() {
    openId = null;
    storage.set('x2s.panel', '');
    document.getElementById('app').classList.remove('has-panel');
    document.querySelectorAll('.rail-btn').forEach((b) => b.classList.remove('is-on'));
  }

  function toggle(id) { if (openId === id) close(); else open(id); }

  /* ---------- メインの切り替え ---------- */
  function view(def) { views.push(def); }

  function buildTabs() {
    const nav = document.getElementById('viewtabs');
    clear(nav);
    views.forEach((v) => nav.appendChild(h('button', { class: 'viewtab', role: 'tab', dataset: { view: v.id }, on: { click: () => showView(v.id) } }, icon(v.icon), v.label)));
  }

  function showView(id) {
    viewId = id;
    views.forEach((v) => { v.el.hidden = v.id !== id; });
    document.querySelectorAll('.viewtab').forEach((b) => { const on = b.dataset.view === id; b.classList.toggle('is-on', on); b.setAttribute('aria-selected', String(on)); });
    const v = views.find((x) => x.id === id);
    if (v && v.onShow) v.onShow();
    X.bus.emit('view:changed', id);
  }

  /* ---------- ファイルの受け付け ---------- */
  function pickFiles() { document.getElementById('file-input').click(); }

  function setupIntake() {
    const input = document.getElementById('file-input');
    input.accept = X.readers.accept();
    input.addEventListener('change', () => { X.readers.load(input.files); input.value = ''; });

    const overlay = document.getElementById('drop-overlay');
    let depth = 0;
    const hasFiles = (e) => e.dataTransfer && Array.from(e.dataTransfer.types || []).includes('Files');
    window.addEventListener('dragenter', (e) => { if (!hasFiles(e)) return; e.preventDefault(); depth++; overlay.classList.add('is-on'); });
    window.addEventListener('dragover', (e) => { if (hasFiles(e)) e.preventDefault(); });
    window.addEventListener('dragleave', () => { depth = Math.max(0, depth - 1); if (!depth) overlay.classList.remove('is-on'); });
    window.addEventListener('drop', (e) => {
      if (!hasFiles(e)) return;
      e.preventDefault();
      depth = 0;
      overlay.classList.remove('is-on');
      X.readers.load(e.dataTransfer.files);
    });

    // Ctrl+V：ファイルならそのまま、文字（Excel の範囲コピー）なら表として読み込む
    document.addEventListener('paste', (e) => {
      const t = e.target;
      if (t && (t.matches('input,textarea,select') || t.isContentEditable)) return;
      const cd = e.clipboardData;
      if (!cd) return;
      const files = Array.from(cd.files || []);
      if (files.length) { e.preventDefault(); X.readers.load(files); return; }
      const text = cd.getData('text/plain');
      if (text && /[\t\n]/.test(text.trim())) { e.preventDefault(); X.readers.loadText(text); showView('preview'); }
    });
  }

  function start() {
    buildRail();
    buildTabs();
    setupIntake();
    showView(views[0].id);
    const last = storage.get('x2s.panel', 'files');
    if (last) open(last);
    X.bus.on('files:changed', updateBadges);
    X.bus.on('source:changed', updateBadges);
  }

  X.shell = { panel, view, open, close, toggle, showView, pickFiles, start, render, current: () => openId, currentView: () => viewId };
})(window.X2S);

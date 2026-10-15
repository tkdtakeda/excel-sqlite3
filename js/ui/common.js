/* =========================================================
   js/ui/common.js : 画面の共通部品
   通知（toast）・処理中（busy）・モーダル・確認・小さな浮きメニュー（popover）・
   反映の強調（flash）・入力欄の動き（全選択・Enter で次へ・桁数で次へ）
   ========================================================= */
(function (X) {
  'use strict';
  const { h, icon, clear } = X.util;
  const ui = (X.ui = X.ui || {});

  /* ---------- 通知 ---------- */
  const TOAST_ICON = { ok: 'circle-check', warn: 'triangle-exclamation', err: 'circle-xmark', info: 'circle-info' };
  ui.toast = function (msg, type) {
    type = type || 'info';
    const host = document.getElementById('toasts');
    const el = h('div', { class: 'toast toast-' + type, role: 'status' }, icon(TOAST_ICON[type]), h('span', { text: msg }),
      h('button', { class: 'icon-btn sm', title: '閉じる', on: { click: () => el.remove() } }, icon('xmark')));
    host.appendChild(el);
    setTimeout(() => { el.classList.add('is-out'); setTimeout(() => el.remove(), 300); }, type === 'err' ? 9000 : 4000);
  };

  /* ---------- 処理中 ---------- */
  ui.busy = (function () {
    let el, label, bar, cancelBtn, depth = 0, timer = null;
    function build() {
      el = document.getElementById('busy');
      label = h('div', { class: 'busy-label' });
      bar = h('div', { class: 'busy-bar' }, h('div', { class: 'busy-fill' }));
      cancelBtn = h('button', { class: 'btn', hidden: true }, icon('ban'), '中止');
      el.appendChild(h('div', { class: 'busy-box' }, h('div', { class: 'busy-spin' }, icon('spinner', 'fa-spin')), label, bar, cancelBtn));
    }
    return {
      /** すぐに出すとちらつくので 150ms 後に出す */
      show(text, opts) {
        if (!el) build();
        depth++;
        label.textContent = text || '処理中…';
        bar.hidden = true;
        cancelBtn.hidden = !(opts && opts.onCancel);
        cancelBtn.onclick = opts && opts.onCancel;
        clearTimeout(timer);
        timer = setTimeout(() => { if (depth) el.classList.add('is-on'); }, 150);
      },
      progress(p, text) {
        if (!el) return;
        bar.hidden = false;
        bar.firstChild.style.width = Math.round(Math.max(0, Math.min(1, p)) * 100) + '%';
        if (text) label.textContent = text;
      },
      hide() {
        depth = Math.max(0, depth - 1);
        if (depth) return;
        clearTimeout(timer);
        if (el) el.classList.remove('is-on');
      },
    };
  })();

  /* ---------- モーダル（背景のクリック・Esc で閉じる） ---------- */
  ui.modal = function (title, body, opts) {
    opts = opts || {};
    const close = () => { back.remove(); document.removeEventListener('keydown', onKey); if (opts.onClose) opts.onClose(); };
    const onKey = (e) => { if (e.key === 'Escape') close(); };
    const actions = (opts.actions || []).map((a) => h('button', { class: 'btn ' + (a.primary ? 'btn-primary' : ''), on: { click: () => { if (a.run() !== false) close(); } } }, a.icon ? icon(a.icon) : null, a.label));
    const box = h('div', { class: 'modal', role: 'dialog', 'aria-modal': 'true', style: { width: opts.width || 'var(--w-modal-sm)' } },
      h('div', { class: 'modal-head' }, opts.icon ? icon(opts.icon) : null, h('h2', { text: title }),
        h('button', { class: 'icon-btn', title: '閉じる（Esc）', on: { click: close } }, icon('xmark'))),
      h('div', { class: 'modal-body' }, body),
      actions.length ? h('div', { class: 'modal-foot' }, actions) : null);
    const back = h('div', { class: 'modal-back', on: { mousedown: (e) => { if (e.target === back) close(); } } }, box);
    document.body.appendChild(back);
    document.addEventListener('keydown', onKey);
    const first = box.querySelector('.modal-foot .btn-primary') || box.querySelector('input,button');
    if (first) first.focus();
    return { close, box };
  };

  ui.confirm = function (message, okLabel, danger) {
    return new Promise((resolve) => {
      let ok = false;
      ui.modal('確認', h('p', { class: 'confirm-text', text: message }), {
        icon: danger ? 'triangle-exclamation' : 'circle-question',
        onClose: () => resolve(ok),
        actions: [
          { label: 'やめる', run: () => {} },
          { label: okLabel || 'OK', primary: true, icon: danger ? 'trash-can' : 'check', run: () => { ok = true; } },
        ],
      });
    });
  };

  /* ---------- 浮きメニュー（外側クリック・Esc で閉じる） ---------- */
  let pop = null;
  ui.popover = function (x, y, content) {
    ui.closePopover();
    pop = h('div', { class: 'popover' }, content);
    document.body.appendChild(pop);
    const r = pop.getBoundingClientRect();
    pop.style.left = Math.min(x, window.innerWidth - r.width - 8) + 'px';
    pop.style.top = Math.min(y, window.innerHeight - r.height - 8) + 'px';
    return pop;
  };
  ui.closePopover = function () { if (pop) { pop.remove(); pop = null; } };
  document.addEventListener('mousedown', (e) => { if (pop && !pop.contains(e.target)) ui.closePopover(); });
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape') ui.closePopover(); });

  /* ---------- 反映の強調 ---------- */
  ui.flash = function (el) {
    if (!el) return;
    el.classList.remove('flash');
    void el.offsetWidth; // アニメーションをやり直す
    el.classList.add('flash');
  };

  /* ---------- 入力欄の動き（どの画面でも共通） ---------- */
  const TEXTY = 'input[type=text],input[type=search],input:not([type])';
  const FOCUSABLE = 'input:not([type=checkbox]):not([type=radio]):not([disabled]):not([hidden]),select:not([disabled])';

  function moveNext(el) {
    const scope = el.closest('[data-form]') || el.closest('.panel-body') || document.body;
    const list = Array.from(scope.querySelectorAll(FOCUSABLE)).filter((x) => x.offsetParent !== null);
    const i = list.indexOf(el);
    const next = i >= 0 && i < list.length - 1 ? list[i + 1] : null;
    const nextKey = next && next.dataset.key;
    el.dispatchEvent(new Event('change', { bubbles: true }));
    // change で描き直されていたら、同じ data-key の新しい欄へ移る
    const target = nextKey ? document.querySelector('[data-key="' + CSS.escape(nextKey) + '"]') : next;
    if (target && target.isConnected) target.focus(); else if (document.activeElement) document.activeElement.blur();
  }

  // クリックで入ったとき、直後の mouseup で全選択が外れないようにする
  let justFocused = null;
  document.addEventListener('focusin', (e) => {
    const t = e.target;
    if (ui.restoring) return;
    if (t.matches && t.matches(TEXTY)) {
      t.select();
      justFocused = t;
      setTimeout(() => { if (justFocused === t) justFocused = null; }, 400);
    }
  });
  document.addEventListener('mouseup', (e) => {
    if (justFocused && e.target === justFocused) { e.preventDefault(); justFocused = null; }
  });
  document.addEventListener('keydown', (e) => {
    const t = e.target;
    if (e.key !== 'Enter' || e.isComposing || e.keyCode === 229) return;
    if (!t.matches || !t.matches(TEXTY + ',select') || t.closest('[data-no-enter]')) return;
    e.preventDefault();
    moveNext(t);
  });
  document.addEventListener('input', (e) => {
    const t = e.target;
    const n = t.dataset && Number(t.dataset.advance);
    if (n && t.value.length >= n && !e.isComposing) moveNext(t);
  });

  /* ---------- 小さな部品 ---------- */
  ui.field = function (label, control, hint) {
    return h('label', { class: 'field' }, h('span', { class: 'field-label' }, label), control, hint ? h('span', { class: 'field-hint', text: hint }) : null);
  };
  ui.section = function (title, iconName, ...kids) {
    return h('section', { class: 'psec' }, h('h3', { class: 'psec-title' }, iconName ? icon(iconName) : null, title), kids);
  };
  ui.segmented = function (options, value, onChange) {
    const wrap = h('div', { class: 'seg', role: 'radiogroup' });
    options.forEach((o) => {
      const b = h('button', { class: 'seg-btn' + (o.value === value ? ' is-on' : ''), type: 'button', title: o.title || o.label, 'aria-pressed': String(o.value === value),
        on: { click: () => { if (o.value !== value) onChange(o.value); } } }, o.icon ? icon(o.icon) : null, o.label);
      wrap.appendChild(b);
    });
    return wrap;
  };
  ui.empty = function (iconName, text, ...kids) {
    return h('div', { class: 'empty-note' }, icon(iconName), h('p', { text }), kids);
  };
  ui.clear = clear;
})(window.X2S);

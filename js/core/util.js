/* =========================================================
   js/core/util.js : 共通の小道具
   DOM 作成・書式・保存（localStorage）・イベント（X.bus）・ダウンロード
   どのモジュールからも使う。画面や業務の知識は持たない。
   ========================================================= */
window.X2S = window.X2S || {};
(function (X) {
  'use strict';

  /* ---------- DOM ---------- */
  const PROPS = ['value', 'checked', 'disabled', 'selected', 'indeterminate', 'hidden'];

  function append(el, kids) {
    for (const k of kids) {
      if (k == null || k === false) continue;
      if (Array.isArray(k)) append(el, k);
      else el.appendChild(k instanceof Node ? k : document.createTextNode(String(k)));
    }
  }

  /** h('button', {class:'btn', on:{click}}, 'text', child...) */
  function h(tag, attrs, ...kids) {
    const el = document.createElement(tag);
    const late = {};
    if (attrs) {
      for (const k in attrs) {
        const v = attrs[k];
        if (v == null || v === false) continue;
        if (k === 'class') el.className = v;
        else if (k === 'text') el.textContent = v;
        else if (k === 'on') for (const ev in v) el.addEventListener(ev, v[ev]);
        else if (k === 'dataset') Object.assign(el.dataset, v);
        else if (k === 'style' && typeof v === 'object') Object.assign(el.style, v);
        else if (PROPS.includes(k)) late[k] = v;
        else if (v === true) el.setAttribute(k, '');
        else el.setAttribute(k, v);
      }
    }
    append(el, kids);
    for (const k in late) el[k] = late[k];
    return el;
  }

  /** Font Awesome のアイコン。'gear' → fa-solid fa-gear / 'fa-regular fa-x' はそのまま */
  function icon(name, extra) {
    const cls = name.indexOf('fa-') === 0 ? name : 'fa-solid fa-' + name;
    return h('i', { class: cls + (extra ? ' ' + extra : ''), 'aria-hidden': 'true' });
  }

  function clear(el) { while (el.firstChild) el.removeChild(el.firstChild); return el; }

  /* ---------- イベント ---------- */
  const handlers = {};
  const bus = {
    on(ev, fn) { (handlers[ev] = handlers[ev] || []).push(fn); return () => bus.off(ev, fn); },
    off(ev, fn) { handlers[ev] = (handlers[ev] || []).filter((f) => f !== fn); },
    emit(ev, payload) { (handlers[ev] || []).slice().forEach((f) => f(payload)); },
  };

  /* ---------- 書式 ---------- */
  const fmt = {
    num(n) { return n == null ? '' : Number(n).toLocaleString('ja-JP'); },
    bytes(n) {
      if (n < 1024) return n + ' B';
      if (n < 1048576) return (n / 1024).toFixed(1) + ' KB';
      return (n / 1048576).toFixed(1) + ' MB';
    },
    ms(ms) { return ms < 1000 ? Math.round(ms) + ' ms' : (ms / 1000).toFixed(2) + ' 秒'; },
    /** 0 → A, 26 → AA */
    colLetter(i) {
      let s = '';
      i += 1;
      while (i > 0) { const m = (i - 1) % 26; s = String.fromCharCode(65 + m) + s; i = Math.floor((i - 1) / 26); }
      return s;
    },
    /** 'B' → 1 / '2' → 1（数字も受け付ける）/ 不正 → -1 */
    colIndex(text) {
      const t = String(text || '').trim().toUpperCase();
      if (/^\d+$/.test(t)) return Number(t) - 1;
      if (!/^[A-Z]{1,3}$/.test(t)) return -1;
      let n = 0;
      for (const ch of t) n = n * 26 + (ch.charCodeAt(0) - 64);
      return n - 1;
    },
    cellRef(r, c) { return fmt.colLetter(c) + (r + 1); },
    stamp(d) {
      d = d || new Date();
      const p = (n) => String(n).padStart(2, '0');
      return d.getFullYear() + p(d.getMonth() + 1) + p(d.getDate()) + '_' + p(d.getHours()) + p(d.getMinutes());
    },
  };

  /* ---------- 保存（失敗しても動き続ける） ---------- */
  const storage = {
    get(key, def) {
      try { const v = localStorage.getItem(key); return v == null ? def : JSON.parse(v); } catch (e) { return def; }
    },
    set(key, val) {
      try { localStorage.setItem(key, JSON.stringify(val)); return true; } catch (e) { return false; }
    },
  };

  /* ---------- そのほか ---------- */
  let seq = 0;
  function uid(prefix) { seq += 1; return (prefix || 'id') + Date.now().toString(36) + seq; }

  function debounce(fn, ms) {
    let t = null;
    const d = function (...a) { clearTimeout(t); t = setTimeout(() => fn.apply(this, a), ms); };
    d.flush = function (...a) { clearTimeout(t); fn.apply(this, a); };
    return d;
  }

  /** 描画を一度挟む（重い処理の前に「処理中」を見せるため） */
  function nextFrame() {
    return new Promise((res) => requestAnimationFrame(() => setTimeout(res, 0)));
  }

  function download(data, filename, mime) {
    const blob = data instanceof Blob ? data : new Blob([data], { type: mime || 'application/octet-stream' });
    const url = URL.createObjectURL(blob);
    const a = h('a', { href: url, download: filename });
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 4000);
  }

  function baseName(name) { return String(name || '').replace(/\.[^.]+$/, ''); }
  function extOf(name) { const m = /\.([^.]+)$/.exec(String(name || '')); return m ? m[1].toLowerCase() : ''; }

  /** SQL の識別子をダブルクォートで囲む */
  function qid(name) { return '"' + String(name).replace(/"/g, '""') + '"'; }

  X.util = { h, icon, clear, fmt, storage, uid, debounce, nextFrame, download, baseName, extOf, qid };
  X.bus = bus;
})(window.X2S);

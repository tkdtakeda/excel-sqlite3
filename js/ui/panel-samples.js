/* =========================================================
   js/ui/panel-samples.js : 脇パネル「サンプル」
   パターン別の読み込み・すべて読み込み・サンプルのみクリア。
   ========================================================= */
(function (X) {
  'use strict';
  const { h, icon } = X.util;

  function render(body) {
    const loaded = new Set(X.ws.files().filter((f) => f.sample).map((f) => f.name));
    body.appendChild(h('div', { class: 'panel-actions top' },
      h('button', { class: 'btn btn-primary', on: { click: () => X.samples.load(X.samples.PATTERNS.filter((p) => p.id !== 'large').map((p) => p.id)) } },
        icon('download'), 'まとめて読み込む'),
      h('button', { class: 'btn btn-outline', disabled: !loaded.size, on: { click: X.panels.clearSamples } }, icon('broom'), 'サンプルのみクリア')));
    body.appendChild(h('p', { class: 'note' }, icon('circle-info'), '「まとめて読み込む」は大量データ以外のすべてです。読み込んだファイルの中から、サンプルだけを外せます。'));
    body.appendChild(h('div', { class: 'sample-list' }, X.samples.PATTERNS.map((p) => h('div', { class: 'sample-card' + (loaded.has(p.file) ? ' is-loaded' : '') },
      h('div', { class: 'sample-head' }, icon(p.icon), h('b', { text: p.title }),
        loaded.has(p.file) ? h('span', { class: 'tag tag-ok' }, icon('check'), '読み込み済み') : null),
      h('p', { text: p.desc }),
      h('div', { class: 'sample-foot' }, h('small', { text: p.file }),
        h('button', { class: 'btn btn-sm', on: { click: () => X.samples.load([p.id]) } }, icon('plus'), '読み込む'))))));
  }

  X.shell.panel({ id: 'samples', icon: 'flask', title: 'サンプルデータ', order: 80, bottom: true, render, refreshOn: ['files:changed'] });
})(window.X2S);

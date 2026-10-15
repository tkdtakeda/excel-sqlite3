/* =========================================================
   js/ui/panel-presets.js : 脇パネル「プリセット」
   表示中のシートの読み取り設定を保存し、同じ形のシートに自動で当てはめる。
   ========================================================= */
(function (X) {
  'use strict';
  const { h, icon } = X.util;
  const ui = X.ui;
  let withTable = true;

  function applyTo(p, src) {
    const r = X.presets.resolve(p, src);
    X.ws.replaceSettings(src.id, r.settings, r.overrides);
    if (p.tableName) X.merge.setTableName([src.id], p.tableName);
    src.preset = p.name;
    ui.toast('「' + p.name + '」を当てはめました（見出しの一致 ' + Math.round(r.score * 100) + '%）', 'ok');
  }

  function render(body) {
    const src = X.ws.active();
    const canSave = src && !src.fixed && !src.result.empty;
    let nameInput;
    body.appendChild(ui.section('表示中のシートの設定を保存', 'floppy-disk',
      canSave ? h('div', { class: 'row', 'data-form': '' },
        nameInput = h('input', { type: 'text', class: 'inp grow', 'data-key': 'pname', placeholder: 'プリセット名', value: src.label,
          on: { keydown: (e) => { if (e.key === 'Enter' && !e.isComposing) { e.stopPropagation(); e.preventDefault(); doSave(); } } } }),
        h('button', { class: 'btn btn-primary', on: { click: () => doSave() } }, icon('floppy-disk'), '保存')) : ui.empty('circle-info', 'Excel・CSV のシートを表示すると保存できます'),
      canSave ? h('label', { class: 'check' }, h('input', { type: 'checkbox', checked: withTable, on: { change: (e) => { withTable = e.target.checked; } } }),
        'テーブル名も保存する（毎月のファイルを同じテーブルにまとめるとき）') : null,
      h('p', { class: 'note' }, icon('circle-info'), '開始位置・ヘッダー・終わりの判定・列名と型を保存します。見出しが 80% 以上一致するシートを読み込むと、自動で当てはめます。')));

    function doSave() {
      const name = nameInput.value.trim() || src.label;
      X.presets.save(name, src, withTable);
      src.preset = name;
      ui.toast('プリセット「' + name + '」を保存しました', 'ok');
    }

    const list = X.presets.list();
    if (!list.length) { body.appendChild(ui.empty('bookmark', '保存したプリセットはありません')); return; }
    body.appendChild(ui.section('保存したプリセット（' + list.length + '）', 'bookmark',
      h('div', { class: 'preset-list' }, list.map((p) => h('div', { class: 'preset-row' },
        h('div', { class: 'preset-main' },
          h('b', { text: p.name }),
          h('small', { text: '見出し ' + p.headers.length + ' 個' + (p.tableName ? '・テーブル ' + p.tableName : '') })),
        h('button', { class: 'icon-btn' + (p.autoApply ? ' accent' : ''), title: p.autoApply ? '自動で当てはめる（オン）' : '自動で当てはめない（オフ）',
          on: { click: () => X.presets.update(p.id, { autoApply: !p.autoApply }) } }, icon(p.autoApply ? 'toggle-on' : 'toggle-off')),
        h('button', { class: 'icon-btn', title: '表示中のシートに当てはめる', disabled: !canSave, on: { click: () => applyTo(p, src) } }, icon('wand-magic-sparkles')),
        h('button', { class: 'icon-btn danger', title: '削除', on: { click: async () => { if (await ui.confirm('「' + p.name + '」を削除しますか？', '削除', true)) X.presets.remove(p.id); } } }, icon('trash-can')))))));
  }

  X.shell.panel({ id: 'presets', icon: 'bookmark', title: 'プリセット', order: 50, render, refreshOn: ['active:changed', 'presets:changed', 'files:changed'] });
})(window.X2S);

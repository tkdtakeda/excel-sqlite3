/* =========================================================
   js/ui/panel-columns.js : 脇パネル「列」（表示中のシート）
   取り込む列のチェック・列名の変更・型の変更（推定と違えば印を付け、戻せる）。
   列名の欄に入ると、プレビューがその列へ移動する。
   ========================================================= */
(function (X) {
  'use strict';
  const { h, icon, fmt } = X.util;
  const T = X.types;
  const ui = X.ui;

  function typeSelect(key, value, onChange) {
    return h('select', { class: 'inp inp-type', 'data-key': key, value, on: { change: (e) => onChange(e.target.value) } },
      Object.keys(T.TYPES).map((k) => h('option', { value: k, title: T.TYPES[k].hint }, T.TYPES[k].label)));
  }

  function render(body) {
    const src = X.ws.active();
    if (!src) { body.appendChild(ui.empty('table-columns', 'ファイルを読み込むと、ここで列名と型を確認・変更できます')); return; }
    const r = src.result, id = src.id;
    if (r.empty || !r.columns.length) { body.appendChild(ui.empty('triangle-exclamation', '列が見つかりません。「読み取り設定」で開始位置を確認してください')); return; }
    const inc = r.columns.filter((c) => c.include).length;

    body.appendChild(h('div', { class: 'panel-sub' }, icon('table-columns'), h('span', { text: r.columns.length + ' 列中 ' + inc + ' 列を取り込む' })));
    const list = h('div', { class: 'col-list', 'data-form': '' });
    r.columns.forEach((c) => {
      const changedType = c.type !== c.inferred;
      list.appendChild(h('div', { class: 'col-row' + (c.include ? '' : ' is-off') },
        h('input', { type: 'checkbox', checked: c.include, title: '取り込む', on: { change: (e) => X.ws.setOverride(id, c.index, { include: e.target.checked }) } }),
        h('span', { class: 'col-letter', text: src.fixed ? String(c.index + 1) : fmt.colLetter(c.index) }),
        h('input', { type: 'text', class: 'inp grow', 'data-key': 'cn' + c.index, value: c.name, title: c.rawName ? '元の名前：' + c.rawName : '',
          on: {
            focus: () => X.preview.focusCell(r.startRow, c.index),
            change: (e) => {
              const v = e.target.value.trim();
              if (v === c.name) return;
              X.ws.setOverride(id, c.index, { name: v && v !== c.rawName ? v : null });
            },
          } }),
        typeSelect('ct' + c.index, c.type, (v) => X.ws.setOverride(id, c.index, { type: v === c.inferred ? null : v })),
        changedType
          ? h('button', { class: 'icon-btn sm accent', title: '推定（' + T.TYPES[c.inferred].label + '）に戻す', on: { click: () => X.ws.setOverride(id, c.index, { type: null }) } }, icon('rotate-left'))
          : h('span', { class: 'col-spacer', title: '推定した型' }, icon(T.TYPES[c.type].icon))));
    });
    body.appendChild(list);
    body.appendChild(h('p', { class: 'note' }, icon('circle-info'), '日付・日時・時刻は、並べ替えできる「2026-10-15 09:30:00」の形の文字で保存します（SQLite には日付型がないため）。'));
    body.appendChild(h('div', { class: 'panel-actions' },
      h('button', { class: 'btn btn-outline', on: { click: () => { r.columns.forEach((c) => { if (!c.include) X.ws.setOverride(id, c.index, { include: true }); }); } } }, icon('check-double'), 'すべて取り込む'),
      h('button', { class: 'btn btn-outline', on: { click: () => { X.ws.replaceSettings(id, src.settings, {}); ui.toast('列名・型・取り込みを推定に戻しました', 'ok'); } } }, icon('rotate-left'), '推定に戻す')));
  }

  X.shell.panel({ id: 'columns', icon: 'table-columns', title: '列（名前と型）', order: 30, render, refreshOn: ['active:changed', 'source:changed', 'files:changed'] });
})(window.X2S);

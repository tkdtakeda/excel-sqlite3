/* =========================================================
   js/ui/panel-output.js : 脇パネル「出力」
   作られるテーブルの一覧（結合の内訳・CREATE 文）・まとめ候補・出力の設定・保存。
   ========================================================= */
(function (X) {
  'use strict';
  const { h, icon, fmt } = X.util;
  const ui = X.ui;

  const STATUS = {
    none:     { icon: 'circle-dot',           text: '未作成',           cls: '' },
    building: { icon: 'spinner fa-spin',      text: '作成中…',          cls: 'is-info' },
    ready:    { icon: 'circle-check',         text: '作成済み（最新）',  cls: 'is-ok' },
    stale:    { icon: 'rotate',               text: '設定が変わりました（保存・SQL の実行時に作り直します）', cls: 'is-warn' },
    error:    { icon: 'circle-xmark',         text: 'エラー',           cls: 'is-err' },
  };

  function outName() {
    const n = X.ws.options().outName;
    return (n && n.trim()) || 'excel2sqlite_' + fmt.stamp();
  }

  /** 作成して保存（ヘッダーのボタンからも呼ぶ） */
  async function save() {
    if (!X.ws.included().length) { ui.toast('取り込むシートがありません', 'warn'); return; }
    ui.busy.show('SQLite を作成中…');
    try {
      const bytes = await X.builder.exportBytes((p, t) => ui.busy.progress(p, 'SQLite を作成中…（' + t + '）'));
      const name = outName().replace(/\.(sqlite3?|db)$/i, '') + '.sqlite';
      X.util.download(new Blob([bytes], { type: 'application/x-sqlite3' }), name);
      ui.toast('保存しました：' + name + '（' + fmt.bytes(bytes.length) + '）', 'ok');
    } catch (e) {
      ui.toast('作成に失敗しました：' + e.message, 'err');
    } finally {
      ui.busy.hide();
    }
  }

  function tableCard(t) {
    const sql = X.plan.createSql(t);
    return h('div', { class: 'tbl-card' },
      h('div', { class: 'tbl-head' }, icon('table'), h('b', { text: t.name }),
        t.merged ? h('span', { class: 'tag tag-merge' }, icon('object-group'), t.parts.length + ' 件を結合') : null,
        h('span', { class: 'tbl-meta', text: fmt.num(t.rowCount) + ' 行 × ' + t.columns.length + ' 列' })),
      t.merged ? h('ul', { class: 'tbl-parts' }, t.parts.map((p) => h('li', null, icon('arrow-turn-up', 'fa-rotate-90'),
        h('span', { text: p.src.fileName + (p.src.kind === 'excel' || p.src.kind === 'sqlite' ? ' / ' + p.src.label : '') }),
        h('small', { text: fmt.num(p.src.result.rowCount) + ' 行' })))) : null,
      h('details', { class: 'tbl-sql' }, h('summary', null, icon('code'), 'CREATE 文を見る'), h('pre', { text: sql })));
  }

  /** 共通の名前の候補（シート名・ファイル名の共通の先頭部分。短すぎれば最初の名前） */
  function commonName(list) {
    const names = list.map((s) => s.tableName);
    let p = names[0];
    names.forEach((n) => { while (p && n.indexOf(p) !== 0) p = p.slice(0, -1); });
    p = p.replace(/[-_\s.（(]+$/, '');
    return p.length >= 2 ? p : names[0];
  }

  function hintCard(list, i) {
    const input = h('input', { type: 'text', class: 'inp grow', 'data-key': 'merge' + i, value: commonName(list), title: 'まとめたテーブルの名前' });
    const merge = () => {
      const name = X.ws.sanitizeTable(input.value);
      list.forEach((s) => X.ws.setTableName(s.id, name));
      ui.toast('「' + name + '」1 つにまとめました（' + list.length + ' 件）', 'ok');
    };
    input.addEventListener('keydown', (e) => { if (e.key === 'Enter' && !e.isComposing) { e.preventDefault(); e.stopPropagation(); merge(); } });
    return h('div', { class: 'hint-card' },
      h('div', null, icon('lightbulb'), h('b', { text: '列の構成が同じシートがあります' })),
      h('ul', null, list.map((s) => h('li', { text: s.fileName + (s.kind === 'excel' ? ' / ' + s.label : '') + ' → ' + s.tableName }))),
      h('div', { class: 'row' }, input, h('button', { class: 'btn btn-primary', on: { click: merge } }, icon('object-group'), 'まとめる')));
  }

  function render(body) {
    const b = X.ws.build();
    const st = STATUS[b.status] || STATUS.none;
    body.appendChild(h('div', { class: 'status-card ' + st.cls }, icon(st.icon), h('span', { text: st.text + (b.status === 'error' && b.error ? '：' + b.error : '') })));

    const tables = X.plan.make(X.ws.included(), X.ws.options());
    if (!tables.length) { body.appendChild(ui.empty('database', '取り込むシートがありません')); return; }

    const hints = X.plan.mergeHints(X.ws.included());
    if (hints.length) body.appendChild(ui.section('まとめ候補', 'lightbulb', hints.map(hintCard)));

    body.appendChild(ui.section('作られるテーブル（' + tables.length + '）', 'layer-group', tables.map(tableCard)));

    body.appendChild(ui.section('出力の設定', 'gear',
      h('label', { class: 'check' }, h('input', { type: 'checkbox', checked: X.ws.options().sourceColumn, on: { change: (e) => X.ws.setOption('sourceColumn', e.target.checked) } }),
        '結合したテーブルに取り込み元の列（' + X.plan.SOURCE_COL + '）を付ける'),
      h('div', { 'data-form': '' }, ui.field('ファイル名', h('input', { type: 'text', class: 'inp', 'data-key': 'outname', value: X.ws.options().outName, placeholder: 'excel2sqlite_' + fmt.stamp(),
        on: { change: (e) => { if (e.target.value !== X.ws.options().outName) X.ws.setOption('outName', e.target.value.trim()); } } }), '空欄なら日時の名前になります'))));

    body.appendChild(h('div', { class: 'panel-actions' },
      h('button', { class: 'btn btn-primary', on: { click: save } }, icon('download'), 'SQLite を保存'),
      h('button', { class: 'btn btn-outline', on: { click: () => X.shell.showView('sql') } }, icon('terminal'), 'SQL で確認')));
  }

  X.shell.panel({ id: 'output', icon: 'database', title: '出力', order: 40, render, refreshOn: ['files:changed', 'source:changed', 'build:changed'] });
  X.output = { save };
})(window.X2S);

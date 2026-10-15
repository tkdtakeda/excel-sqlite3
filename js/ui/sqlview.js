/* =========================================================
   js/ui/sqlview.js : メイン「SQL で確認」タブ
   ・左：テーブルと列の一覧（クリックで SQL に差し込む）
   ・右上：SQL の入力（Ctrl+Enter で実行）・条件の書き方の例・履歴
   ・右下：結果の表（大量でも軽い）と CSV / Excel への出力
   実行の前に、取り込みの設定が変わっていれば SQLite を作り直す。
   ========================================================= */
(function (X) {
  'use strict';
  const { h, icon, clear, fmt, storage, qid } = X.util;
  const T = X.types;
  const ui = X.ui;
  const HIST_KEY = 'x2s.history';

  let el, schemaEl, editor, statusEl, gridHost, errorEl, exportBtns, grid;
  let result = null;
  let schema = [];

  /* ---------- 差し込み ---------- */
  function insert(text) {
    const s = editor.selectionStart, e = editor.selectionEnd;
    editor.setRangeText(text, s, e, 'end');
    editor.focus();
  }
  function setSql(sql) { editor.value = sql; editor.focus(); editor.setSelectionRange(sql.length, sql.length); }

  function renderSchema() {
    clear(schemaEl);
    schemaEl.appendChild(h('div', { class: 'schema-head' }, icon('layer-group'), 'テーブル', h('small', { text: '（クリックで差し込み）' })));
    if (!schema.length) { schemaEl.appendChild(ui.empty('database', 'まだ作成していません')); return; }
    schema.forEach((t, i) => {
      const det = h('details', { class: 'schema-tbl', open: i === 0 },
        h('summary', null, icon('table'), h('span', { class: 'schema-name', text: t.name, title: 'SELECT 文を入れる' ,
          on: { click: (e) => { e.preventDefault(); setSql('SELECT * FROM ' + qid(t.name) + ' LIMIT 1000;'); } } }),
          h('small', { text: fmt.num(t.count) })),
        h('ul', null, t.columns.map((c) => h('li', null, h('button', { class: 'schema-col', title: '列名を差し込む（' + c.type + '）', on: { click: () => insert(qid(c.name)) } },
          icon(typeIcon(c.type)), h('span', { text: c.name }))))));
      schemaEl.appendChild(det);
    });
  }
  function typeIcon(decl) { const t = T.fromDecl(decl); return t ? T.TYPES[t].icon : 'font'; }

  /* ---------- 条件の書き方の例 ---------- */
  function examples(ev) {
    const t = schema[0];
    if (!t) return;
    const tn = qid(t.name);
    const col = (pred) => (t.columns.find(pred) || t.columns[0]).name;
    const textCol = qid(col((c) => c.type === 'TEXT'));
    const numCol = qid(col((c) => /INT|REAL/.test(c.type)));
    const list = [
      ['先頭 1000 行', 'SELECT * FROM ' + tn + ' LIMIT 1000;'],
      ['件数を数える', 'SELECT COUNT(*) AS 件数 FROM ' + tn + ';'],
      ['一致で絞り込む', 'SELECT * FROM ' + tn + '\nWHERE ' + textCol + " = '値';"],
      ['含む（部分一致）', 'SELECT * FROM ' + tn + '\nWHERE ' + textCol + " LIKE '%値%';"],
      ['数の範囲', 'SELECT * FROM ' + tn + '\nWHERE ' + numCol + ' BETWEEN 100 AND 500;'],
      ['日付の範囲', 'SELECT * FROM ' + tn + "\nWHERE 日付の列 BETWEEN '2026-01-01' AND '2026-03-31';"],
      ['グループごとに集計', 'SELECT ' + textCol + ', COUNT(*) AS 件数, SUM(' + numCol + ') AS 合計\nFROM ' + tn + '\nGROUP BY ' + textCol + '\nORDER BY 合計 DESC;'],
      ['並べ替え', 'SELECT * FROM ' + tn + '\nORDER BY ' + numCol + ' DESC\nLIMIT 100;'],
    ];
    if (schema.length > 1) list.push(['2 つの表をつなぐ（JOIN）', 'SELECT *\nFROM ' + tn + ' AS a\nJOIN ' + qid(schema[1].name) + ' AS b ON a.共通の列 = b.共通の列\nLIMIT 1000;']);
    const r = ev.currentTarget.getBoundingClientRect();
    ui.popover(r.left, r.bottom + 4, [h('div', { class: 'pop-title', text: '条件の書き方の例（選ぶと入力欄に入ります）' })].concat(list.map(([label, sql]) =>
      h('button', { class: 'pop-item', on: { click: () => { ui.closePopover(); setSql(sql); } } }, icon('code'), h('span', { text: label })))));
  }

  /* ---------- 履歴 ---------- */
  function pushHistory(sql) {
    const list = storage.get(HIST_KEY, []).filter((x) => x !== sql);
    list.unshift(sql);
    storage.set(HIST_KEY, list.slice(0, 30));
  }
  function history(ev) {
    const list = storage.get(HIST_KEY, []);
    const r = ev.currentTarget.getBoundingClientRect();
    ui.popover(r.left, r.bottom + 4, [h('div', { class: 'pop-title', text: '実行した SQL（新しい順）' })].concat(list.length
      ? list.map((sql) => h('button', { class: 'pop-item mono', title: sql, on: { click: () => { ui.closePopover(); setSql(sql); } } }, icon('clock-rotate-left'), h('span', { text: sql.replace(/\s+/g, ' ').slice(0, 80) })))
      : [h('div', { class: 'pop-empty', text: 'まだありません' })]));
  }

  /* ---------- 実行 ---------- */
  async function ensureDb() {
    ui.busy.show('SQLite を作成中…');
    try {
      schema = await X.builder.ensure((p, t) => ui.busy.progress(p, 'SQLite を作成中…（' + t + '）'));
      renderSchema();
      return true;
    } catch (e) {
      schema = [];
      renderSchema();
      showError(e.message);
      return false;
    } finally {
      ui.busy.hide();
    }
  }

  async function run() {
    const sql = editor.value.trim();
    if (!sql) { editor.focus(); return; }
    if (!X.ws.included().length) { showError('取り込むシートがありません。ファイルを読み込んでください。'); return; }
    if (!(await ensureDb())) return;
    ui.busy.show('SQL を実行中…', X.engine.canCancel() ? { onCancel: () => { X.engine.cancel(); } } : null);
    try {
      const res = await X.engine.call('exec', { sql });
      pushHistory(sql);
      showResult(res);
      if (/^\s*(insert|update|delete|create|drop|alter|replace)/im.test(sql)) {
        schema = await X.engine.call('schema');
        renderSchema();
        ui.toast('DB を変更しました（保存すると変更が含まれます。取り込みの設定を変えると作り直します）', 'warn');
      }
    } catch (e) {
      showError(e.message);
    } finally {
      ui.busy.hide();
    }
  }

  function showError(msg) {
    errorEl.hidden = false;
    errorEl.replaceChildren(icon('circle-xmark'), h('span', { text: msg }));
    ui.flash(errorEl);
  }

  function showResult(res) {
    errorEl.hidden = true;
    result = res;
    const n = res.values.length;
    statusEl.replaceChildren(icon('circle-check'), res.columns.length
      ? h('span', null, h('b', { text: fmt.num(n) + ' 行' }), ' × ' + res.columns.length + ' 列・' + fmt.ms(res.ms))
      : h('span', { text: '実行しました（変更 ' + fmt.num(res.changes) + ' 行・' + fmt.ms(res.ms) + '）' }));
    ui.flash(statusEl);
    exportBtns.forEach((b) => { b.disabled = !res.columns.length; });
    const widths = res.columns.map((c, i) => {
      const texts = [c];
      for (let r = 0; r < Math.min(n, 200); r++) texts.push(T.display(res.values[r][i]));
      return X.VGrid.measure(texts, 72, 320);
    });
    const esc = X.VGrid.esc;
    grid.setModel({
      rows: n, cols: res.columns.length, rowNumWidth: Math.max(48, String(n).length * 8 + 20),
      colWidth: (c) => widths[c],
      headHtml: (c) => '<span class="vg-name">' + esc(res.columns[c]) + '</span>',
      rowLabel: (r) => String(r + 1),
      cell: (r, c) => T.display(res.values[r][c]),
      cellClass: (r, c) => { const v = res.values[r][c]; return v == null ? 'is-null' : typeof v === 'number' ? 'is-num' : ''; },
    });
  }

  function exportAs(kind) {
    if (!result || !result.columns.length) return;
    const name = 'query_' + fmt.stamp();
    try {
      if (kind === 'csv') X.exporter.csv(result.columns, result.values, name);
      else X.exporter.xlsx(result.columns, result.values, name);
      ui.toast(fmt.num(result.values.length) + ' 行を ' + (kind === 'csv' ? 'CSV' : 'Excel') + ' に出力しました', 'ok');
    } catch (e) { ui.toast(e.message, 'err'); }
  }

  /* ---------- 組み立て ---------- */
  function build() {
    el = document.getElementById('view-sql');
    schemaEl = h('aside', { class: 'sql-schema' });
    editor = h('textarea', { class: 'sql-editor', spellcheck: 'false', 'data-no-enter': '', placeholder: 'SELECT * FROM "テーブル名" WHERE "列名" = \'値\';\n（Ctrl+Enter で実行）',
      on: { keydown: (e) => {
        if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) { e.preventDefault(); run(); }
        else if (e.key === 'Tab') { e.preventDefault(); insert('  '); }
      } } });
    statusEl = h('div', { class: 'sql-status' }, icon('circle-info'), h('span', { text: 'SQL を入れて実行してください' }));
    errorEl = h('div', { class: 'sql-error', hidden: true });
    exportBtns = [
      h('button', { class: 'btn btn-sm', disabled: true, title: 'UTF-8（BOM 付き）', on: { click: () => exportAs('csv') } }, icon('file-csv'), 'CSV'),
      h('button', { class: 'btn btn-sm', disabled: true, on: { click: () => exportAs('xlsx') } }, icon('fa-regular fa-file-excel'), 'Excel'),
    ];
    gridHost = h('div', { class: 'sql-grid' });
    el.appendChild(h('div', { class: 'sql-wrap' }, schemaEl,
      h('div', { class: 'sql-main' },
        h('div', { class: 'sql-toolbar' },
          h('button', { class: 'btn btn-primary', title: 'Ctrl+Enter', on: { click: run } }, icon('play'), '実行', h('kbd', { text: 'Ctrl+Enter' })),
          h('button', { class: 'btn btn-outline', on: { click: examples } }, icon('lightbulb'), '条件の例'),
          h('button', { class: 'btn btn-outline', on: { click: history } }, icon('clock-rotate-left'), '履歴'),
          h('span', { class: 'grow' }),
          h('button', { class: 'btn btn-outline', title: '取り込みの設定から作り直す', on: { click: async () => { X.ws.setBuild({ status: 'stale', version: -1 }); if (await ensureDb()) ui.toast('作り直しました', 'ok'); } } }, icon('rotate'), '作り直す')),
        editor,
        h('div', { class: 'sql-resbar' }, statusEl, h('span', { class: 'grow' }), h('span', { class: 'muted', text: '結果を出力：' }), exportBtns),
        errorEl,
        gridHost)));
    grid = new X.VGrid(gridHost, {});
    renderSchema();
  }

  async function onShow() {
    if (!X.ws.included().length) { schema = []; renderSchema(); return; }
    if (await ensureDb()) {
      if (!editor.value.trim() && schema[0]) { setSql('SELECT * FROM ' + qid(schema[0].name) + ' LIMIT 1000;'); run(); }
    }
  }

  function init() {
    build();
    X.shell.view({ id: 'sql', icon: 'terminal', label: 'SQL で確認', el, onShow });
    X.bus.on('build:changed', () => { if (X.ws.build().status === 'none') { schema = []; renderSchema(); } });
  }

  X.sqlview = { init, run };
})(window.X2S);

/* =========================================================
   js/ui/preview.js : メイン「取り込み」タブ
   ・上：読み込んだファイル・シートの切り替え
   ・中：判定結果の要約（開始位置・ヘッダー・行数・テーブル名）と色の凡例
   ・下：シートそのままの表。取り込む範囲を色で示す（ヘッダー＝青・データ＝白・範囲外＝灰・除外＝橙）
   セルをクリックすると「ここから開始」「この行までヘッダー」などを選べる。
   ========================================================= */
(function (X) {
  'use strict';
  const { h, icon, clear, fmt } = X.util;
  const T = X.types;
  const esc = X.VGrid.esc;
  const KIND_ICON = { excel: 'fa-regular fa-file-excel', csv: 'fa-solid fa-file-csv', sqlite: 'fa-solid fa-database', paste: 'fa-solid fa-paste' };

  let grid = null;
  let sel = null; // {r, c}
  let roles = null; // 行ごとの役割 0:範囲外 1:ヘッダー 2:データ 3:末尾で除外

  /* ---------- 上：ファイル・シートの切り替え ---------- */
  function renderSourceBar() {
    const bar = document.getElementById('sourcebar');
    clear(bar);
    const act = X.ws.active();
    X.ws.files().forEach((f) => {
      const grp = h('div', { class: 'src-group', title: f.name });
      if (f.sourceIds.length > 1 || f.kind === 'excel' || f.kind === 'sqlite') grp.appendChild(h('span', { class: 'src-file' }, icon(KIND_ICON[f.kind] || 'file'), f.name));
      f.sourceIds.forEach((id) => {
        const s = X.ws.source(id);
        const single = f.sourceIds.length === 1 && f.kind !== 'excel' && f.kind !== 'sqlite';
        grp.appendChild(h('button', {
          class: 'src-chip' + (act && act.id === id ? ' is-on' : '') + (s.include ? '' : ' is-off'),
          title: (s.include ? '' : '（取り込まない）') + f.name + (single ? '' : ' / ' + s.label),
          on: { click: () => X.ws.setActive(id) },
        }, single ? icon(KIND_ICON[f.kind] || 'file') : null, s.include ? null : icon('eye-slash'),
          h('span', { class: 'src-name', text: single ? f.name : s.label }),
          h('span', { class: 'src-count', text: fmt.num(s.result.rowCount) })));
      });
      bar.appendChild(grp);
    });
    if (X.ws.files().length) bar.appendChild(h('button', { class: 'icon-btn', title: 'ファイルを追加', on: { click: X.shell.pickFiles } }, icon('plus')));
  }

  /* ---------- 中：要約 ---------- */
  function chip(iconName, label, value, extra, title) {
    return h('span', { class: 'sum-chip', title: title || '' }, icon(iconName), h('span', { class: 'sum-label', text: label }), h('b', { text: value }), extra || null);
  }
  const autoTag = () => h('span', { class: 'tag tag-auto' }, icon('wand-magic-sparkles'), '自動');

  function renderSummary(src) {
    const el = document.getElementById('summary');
    clear(el);
    if (!src) return;
    const r = src.result, s = src.settings;
    if (r.empty) { el.appendChild(h('span', { class: 'sum-warn' }, icon('triangle-exclamation'), 'データが見つかりません。開始位置を確認してください')); return; }
    const inc = r.columns.filter((c) => c.include).length;
    if (!r.fixed) {
      el.appendChild(chip('location-crosshairs', '開始', fmt.cellRef(r.startRow, r.startCol), s.auto ? autoTag() : null));
      el.appendChild(chip('heading', 'ヘッダー', r.header.has ? r.header.rows + ' 行' : 'なし', s.header === 'auto' ? autoTag() : null));
    }
    el.appendChild(chip('table-list', 'データ', fmt.num(r.rowCount) + ' 行 × ' + inc + ' 列'));
    if (r.footerRows.length) el.appendChild(chip('scissors', '末尾除外', r.footerRows.length + ' 行'));
    const merged = X.ws.included().filter((x) => x.tableName.toLowerCase() === src.tableName.toLowerCase()).length > 1;
    el.appendChild(chip('database', 'テーブル', src.tableName, merged ? h('span', { class: 'tag tag-merge' }, icon('object-group'), '結合') : null));
    if (src.preset) el.appendChild(h('span', { class: 'tag tag-preset', title: 'プリセットを自動で適用しました' }, icon('bookmark'), src.preset));
    if (!src.include) el.appendChild(h('span', { class: 'tag tag-off' }, icon('eye-slash'), '取り込まない'));
    el.appendChild(h('span', { class: 'legend' },
      h('span', { class: 'lg lg-hdr' }), 'ヘッダー', h('span', { class: 'lg lg-data' }), 'データ',
      h('span', { class: 'lg lg-foot' }), '除外', h('span', { class: 'lg lg-out' }), '範囲外'));
  }

  /* ---------- 下：表 ---------- */
  function computeRoles(src) {
    const r = src.result;
    roles = new Uint8Array(Math.max(1, src.grid.length));
    if (r.empty) return;
    for (let k = 0; k < r.header.rows; k++) roles[r.startRow + k] = 1;
    for (let i = 0; i < r.rowIdx.length; i++) roles[r.rowIdx[i]] = 2;
    r.footerRows.forEach((x) => { roles[x] = 3; });
  }

  function widths(src) {
    if (src._widths && src._widths.n === src.colCount) return src._widths.w;
    const n = Math.max(src.colCount, 1);
    const w = [];
    const lim = Math.min(src.grid.length, 200);
    for (let c = 0; c < n; c++) {
      const texts = [];
      for (let r = 0; r < lim; r++) { const row = src.grid[r]; if (row && row[c] != null) texts.push(T.display(row[c])); }
      w.push(X.VGrid.measure(texts, 72, 240));
    }
    src._widths = { n: src.colCount, w };
    return w;
  }

  function modelFor(src) {
    const r = src.result;
    const w = widths(src);
    const cols = Math.max(src.colCount, r.endCol + 1, 1);
    const colByIndex = new Map(r.columns.map((c) => [c.index, c]));
    const inCols = (c) => c >= r.startCol && c <= r.endCol;
    return {
      rows: Math.max(src.grid.length, 1),
      cols,
      rowNumWidth: Math.max(48, String(src.grid.length).length * 8 + 16),
      colWidth: (c) => Math.max(w[c] || 72, colByIndex.has(c) ? Math.min(240, colByIndex.get(c).name.length * 13 + 40) : 0),
      headHtml(c) {
        const col = colByIndex.get(c);
        let s = src.fixed ? '' : '<span class="vg-letter">' + fmt.colLetter(c) + '</span>';
        if (col) {
          const t = T.TYPES[col.type];
          s += col.include
            ? '<span class="vg-name" title="' + esc(col.name + '（' + t.label + '）') + '"><i class="fa-solid fa-' + t.icon + '"></i>' + esc(col.name) + '</span>'
            : '<span class="vg-name is-off"><i class="fa-solid fa-eye-slash"></i>' + esc(col.name) + '</span>';
        }
        return s;
      },
      rowLabel: (row) => (src.fixed ? (row === 0 ? '列名' : String(row)) : String(row + 1)),
      rowClass: (row) => (roles[row] === 1 ? 'is-hdr-row' : ''),
      cell(row, c) { const x = src.grid[row]; return x ? T.display(x[c]) : ''; },
      cellClass(row, c) {
        const role = roles[row] || 0;
        let cls;
        if (!inCols(c) || role === 0) cls = 'is-out';
        else if (role === 1) cls = 'is-hdr';
        else if (role === 3) cls = 'is-foot';
        else cls = colByIndex.get(c) && !colByIndex.get(c).include ? 'is-xcol' : 'is-data';
        if (!r.empty && row === r.startRow && c === r.startCol && !src.fixed) cls += ' is-start';
        if (sel && sel.r === row && sel.c === c) cls += ' is-sel';
        return cls;
      },
    };
  }

  function renderGrid(keepScroll) {
    const src = X.ws.active();
    const empty = document.getElementById('empty-state');
    const host = document.getElementById('preview-grid');
    empty.hidden = !!src;
    host.hidden = !src;
    if (!src) return;
    computeRoles(src);
    grid.setModel(modelFor(src), keepScroll);
  }

  /* ---------- セルのクリック ---------- */
  function onCellClick(r, c, ev) {
    const src = X.ws.active();
    if (!src || src.fixed) return;
    sel = { r, c };
    grid.refresh();
    const res = src.result, s = src.settings;
    const act = (iconName, label, run, hint) => h('button', { class: 'pop-item', on: { click: () => { X.ui.closePopover(); run(); } } },
      icon(iconName), h('span', { text: label }), hint ? h('small', { text: hint }) : null);
    const items = [h('div', { class: 'pop-title', text: fmt.cellRef(r, c) + '：' + (T.display((src.grid[r] || [])[c]) || '（空）') })];
    items.push(act('location-crosshairs', 'ここを開始位置にする', () => X.ws.updateSettings(src.id, { auto: false, startRow: r + 1, startCol: c + 1 }), '左上'));
    if (!res.empty && r >= res.startRow) {
      items.push(act('heading', 'この行までをヘッダーにする', () => X.ws.updateSettings(src.id, { header: 'yes', headerRows: r - res.startRow + 1 }), (r - res.startRow + 1) + ' 行'));
    }
    if (!res.empty && res.header.has) items.push(act('ban', 'ヘッダーなしにする', () => X.ws.updateSettings(src.id, { header: 'no' })));
    const col = res.columns.find((x) => x.index === c);
    if (col) items.push(act(col.include ? 'eye-slash' : 'eye', col.include ? 'この列を取り込まない' : 'この列を取り込む', () => X.ws.setOverride(src.id, c, { include: !col.include })));
    if (!s.auto || s.header !== 'auto') items.push(act('wand-magic-sparkles', '自動判定に戻す', () => X.ws.updateSettings(src.id, { auto: true, header: 'auto' })));
    X.ui.popover(ev.clientX + 6, ev.clientY + 6, items);
  }

  function emptyState() {
    const el = document.getElementById('empty-state');
    clear(el);
    el.appendChild(h('div', { class: 'drop-hero' },
      h('div', { class: 'drop-icons' }, icon('fa-regular fa-file-excel'), icon('file-csv'), icon('arrow-right'), icon('database')),
      h('h2', { text: 'Excel・CSV・SQLite のファイルをここにドロップ' }),
      h('p', { text: '複数のファイルをまとめて読み込み、1 つの SQLite にできます。Excel の範囲をコピーして Ctrl+V でも読み込めます。' }),
      h('div', { class: 'drop-actions' },
        h('button', { class: 'btn btn-primary', on: { click: X.shell.pickFiles } }, icon('folder-open'), 'ファイルを選ぶ'),
        h('button', { class: 'btn', on: { click: () => X.shell.open('samples') } }, icon('flask'), 'サンプルで試す'))));
  }

  function refreshAll() { sel = null; renderSourceBar(); renderSummary(X.ws.active()); renderGrid(false); }

  function init() {
    grid = new X.VGrid(document.getElementById('preview-grid'), { onCellClick });
    emptyState();
    X.bus.on('files:changed', refreshAll);
    X.bus.on('active:changed', refreshAll);
    X.bus.on('source:changed', (id) => {
      renderSourceBar();
      const act = X.ws.active();
      renderSummary(act);
      if (act && act.id === id) { renderGrid(true); X.ui.flash(document.getElementById('summary')); }
    });
    X.shell.view({ id: 'preview', icon: 'table', label: '取り込み', el: document.getElementById('view-preview') });
    refreshAll();
  }

  X.preview = { init, focusCell: (r, c) => grid && grid.scrollToCell(r, c) };
})(window.X2S);

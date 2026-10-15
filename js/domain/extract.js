/* =========================================================
   js/domain/extract.js : 読み取り設定 → 「どこからどこまでを、どんな列として取り込むか」
   画面を持たない。入力は source（grid・settings・overrides）、出力は result。

   result = {
     startRow, startCol, endCol, lastRow,    … 範囲（0 始まり）
     header: {has, rows}, dataStart,
     auto: {row, col, header},              … 自動判定の値（画面に薄く表示する）
     rowIdx: Int32Array,                    … 取り込む行（途中の空行・末尾の除外行は含まない）
     footerRows: [行番号],                   … 末尾で除いた行
     columns: [{index, rawName, name, inferred, type, include, autoDropped}],
     rowCount
   }
   ========================================================= */
(function (X) {
  'use strict';
  const T = X.types, D = X.detect;

  const DEFAULTS = Object.freeze({
    auto: true,          // 開始位置を自動で判定する
    startRow: 1,         // 手で指定したときの開始行（1 始まり）
    startCol: 1,         // 手で指定したときの開始列（1 始まり）
    header: 'auto',      // 'auto' | 'yes' | 'no'
    headerRows: 1,       // header = 'yes' のときの段数
    blankRows: 2,        // 空の行がこの数だけ続いたら終わり
    blankCols: 2,        // 空の列がこの数だけ続いたら終わり
    skipFooter: 0,       // 末尾から除く行数（合計行など）
    dropEmptyCols: true, // 名前も値もない列は取り込まない
  });

  function defaults() { return Object.assign({}, DEFAULTS); }

  function cleanName(v) {
    return T.display(v).replace(/[\r\n\t]+/g, ' ').replace(/\s{2,}/g, ' ').trim();
  }

  /** 複数段のヘッダーを「大項目_小項目」でつなぐ（同じ語の連続は 1 つに） */
  function headerName(g, r0, rows, c) {
    const parts = [];
    for (let k = 0; k < rows; k++) {
      const row = g[r0 + k];
      const t = cleanName(row ? row[c] : null);
      if (t && t !== parts[parts.length - 1]) parts.push(t);
    }
    return parts.join('_');
  }

  /** 名前の重複を _2, _3 … で避ける */
  function uniquify(cols) {
    const used = new Set();
    for (const col of cols) {
      let name = col.name, i = 2;
      while (used.has(name.toLowerCase())) name = col.name + '_' + i++;
      col.name = name;
      used.add(name.toLowerCase());
    }
  }

  function makeColumns(src, g, c0, c1, hdr, r0, rowIdx) {
    const s = src.settings;
    const cols = [];
    for (let c = c0; c <= c1; c++) {
      const raw = hdr.has ? headerName(g, r0, hdr.rows, c) : '';
      const inf = T.inferColumn(g, rowIdx, c);
      const ov = src.overrides[c] || {};
      const dropped = s.dropEmptyCols && !raw && inf.empty;
      cols.push({
        index: c,
        rawName: raw,
        name: ov.name || raw || 'col' + (c - c0 + 1),
        inferred: inf.type,
        type: ov.type || inf.type,
        include: ov.include != null ? ov.include : !dropped,
        autoDropped: dropped,
      });
    }
    uniquify(cols);
    return cols;
  }

  function emptyResult(src) {
    return {
      startRow: 0, startCol: 0, endCol: -1, lastRow: -1, header: { has: false, rows: 0 }, dataStart: 0,
      auto: { row: -1, col: 0, header: { has: false, rows: 0 } }, rowIdx: new Int32Array(0), footerRows: [],
      columns: [], rowCount: 0, empty: true, fixed: !!src.fixed,
    };
  }

  /** SQLite のテーブル：1 行目が列名、残りがデータ。判定はしない */
  function buildFixed(src) {
    const g = src.grid;
    const n = Math.max(0, g.length - 1);
    const rowIdx = new Int32Array(n);
    for (let i = 0; i < n; i++) rowIdx[i] = i + 1;
    const cols = src.fixed.columns.map((fc, c) => {
      const ov = src.overrides[c] || {};
      const inferred = T.fromDecl(fc.type) || T.inferColumn(g, rowIdx, c).type;
      return { index: c, rawName: fc.name, name: ov.name || fc.name, inferred, type: ov.type || inferred, include: ov.include != null ? ov.include : true, autoDropped: false };
    });
    uniquify(cols);
    const hdr = { has: true, rows: 1 };
    return {
      startRow: 0, startCol: 0, endCol: cols.length - 1, lastRow: n, header: hdr, dataStart: 1,
      auto: { row: 0, col: 0, header: hdr }, rowIdx, footerRows: [], columns: cols, rowCount: n, fixed: true,
    };
  }

  function build(src) {
    if (src.fixed) return buildFixed(src);
    const g = src.grid, s = src.settings;
    const auto = D.findStart(g, src.merges);
    const r0 = s.auto ? auto.row : Math.max(0, (s.startRow | 0) - 1);
    const c0 = s.auto ? auto.col : Math.max(0, (s.startCol | 0) - 1);
    const blankRows = Math.max(1, s.blankRows | 0), blankCols = Math.max(1, s.blankCols | 0);
    if (r0 < 0 || r0 >= g.length) return emptyResult(src);

    const c1 = D.findEndCol(g, r0, c0, blankRows, blankCols);
    const autoHeader = D.detectHeader(g, r0, c0, c1, src.merges);
    let hdr = autoHeader;
    if (s.header === 'no') hdr = { has: false, rows: 0 };
    else if (s.header === 'yes') hdr = { has: true, rows: Math.min(10, Math.max(1, s.headerRows | 0)) };

    const dataStart = r0 + hdr.rows;
    const lastRow = D.findEndRow(g, dataStart, c0, c1, blankRows);
    const idx = [];
    for (let r = dataStart; r <= lastRow; r++) if (!D.rowBlank(g[r], c0, c1)) idx.push(r);
    const skip = Math.min(Math.max(0, s.skipFooter | 0), idx.length);
    const footerRows = skip ? idx.splice(idx.length - skip, skip) : [];
    const rowIdx = Int32Array.from(idx);

    return {
      startRow: r0, startCol: c0, endCol: c1, lastRow, header: hdr, dataStart,
      auto: { row: auto.row, col: auto.col, header: autoHeader },
      rowIdx, footerRows, columns: makeColumns(src, g, c0, c1, hdr, r0, rowIdx), rowCount: rowIdx.length, fixed: false,
    };
  }

  /** 取り込む列の名前の並び（同じ構成かどうかの比較に使う） */
  function signature(result) {
    return result.columns.filter((c) => c.include).map((c) => c.name).join('\u0001');
  }

  X.extract = { defaults, build, signature, DEFAULTS };
})(window.X2S);

/* =========================================================
   js/io/export.js : 表（列名＋行）を CSV / Excel に書き出す
   CSV は Excel で文字化けしないよう UTF-8（BOM 付き）。
   ========================================================= */
(function (X) {
  'use strict';
  const EXCEL_MAX_ROWS = 1048575;

  function csvCell(v) {
    if (v == null) return '';
    if (v instanceof Uint8Array) return '';
    const s = String(v);
    return /[",\r\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
  }

  function toCsv(columns, rows) {
    const lines = [columns.map(csvCell).join(',')];
    for (let i = 0; i < rows.length; i++) lines.push(rows[i].map(csvCell).join(','));
    return '﻿' + lines.join('\r\n');
  }

  function csv(columns, rows, name) {
    X.util.download(new Blob([toCsv(columns, rows)], { type: 'text/csv' }), name + '.csv');
  }

  function xlsx(columns, rows, name) {
    const XLSX = window.XLSX;
    if (!XLSX) throw new Error('Excel 書き出し部品（SheetJS）を読み込めませんでした');
    if (rows.length > EXCEL_MAX_ROWS) throw new Error('Excel の上限（約 104 万行）を超えています。CSV で出力してください');
    const aoa = [columns].concat(rows.map((r) => r.map((v) => (v instanceof Uint8Array ? null : v))));
    const ws = XLSX.utils.aoa_to_sheet(aoa);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'result');
    XLSX.writeFile(wb, name + '.xlsx');
  }

  X.exporter = { csv, xlsx, toCsv };
})(window.X2S);

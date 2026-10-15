/* =========================================================
   js/io/readers/excel.js : Excel（xlsx・xlsm・xls・xlsb・ods）
   ・行・列の番号は A1 を 0 とする位置にそろえる（画面の行番号・列記号と一致させる）
   ・結合セルは、左上の値を結合範囲のすべてのセルに埋める
   ・非表示のシート・空のシートは、最初は取り込まない
   ========================================================= */
(function (X) {
  'use strict';

  function toGrid(XLSX, ws) {
    if (!ws['!ref']) return { grid: [], merges: [] };
    const range = XLSX.utils.decode_range(ws['!ref']);
    const body = XLSX.utils.sheet_to_json(ws, { header: 1, raw: true, defval: null, blankrows: true });
    const grid = new Array(range.s.r).fill(null).map(() => []);
    for (const row of body) {
      if (range.s.c > 0) grid.push(new Array(range.s.c).fill(null).concat(row));
      else grid.push(row);
    }
    const merges = (ws['!merges'] || []).map((m) => ({ s: { r: m.s.r, c: m.s.c }, e: { r: m.e.r, c: m.e.c } }));
    fillMerged(grid, merges);
    return { grid, merges };
  }

  function fillMerged(grid, merges) {
    for (const m of merges) {
      const top = grid[m.s.r];
      const v = top ? top[m.s.c] : null;
      if (v == null) continue;
      for (let r = m.s.r; r <= m.e.r; r++) {
        const row = grid[r] || (grid[r] = []);
        for (let c = m.s.c; c <= m.e.c; c++) row[c] = v;
      }
    }
  }

  X.readers.register({
    id: 'excel',
    label: 'Excel',
    exts: ['xlsx', 'xlsm', 'xls', 'xlsb', 'ods'],
    async read(file) {
      const XLSX = window.XLSX;
      if (!XLSX) throw new Error('Excel 読み込み部品（SheetJS）を読み込めませんでした。ネットワークを確認してください');
      const wb = XLSX.read(new Uint8Array(await file.arrayBuffer()), { type: 'array', cellDates: true });
      const meta = (wb.Workbook && wb.Workbook.Sheets) || [];
      const out = [];
      wb.SheetNames.forEach((name, i) => {
        const { grid, merges } = toGrid(XLSX, wb.Sheets[name]);
        const hidden = meta[i] && meta[i].Hidden;
        out.push({ label: name, grid, merges, include: !hidden && grid.length > 0 });
      });
      return out;
    },
  });
})(window.X2S);

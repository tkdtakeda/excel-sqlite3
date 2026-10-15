/* =========================================================
   js/domain/detect.js : 表の位置の自動判定
   ・開始位置（タイトル行・作成日などを飛ばして、表が始まる行と列）
   ・ヘッダーの有無と段数（文字の行の下に数値・日付が続くか／縦の結合セル）
   ・終わりの列（空の列が N 列続いたら終わり）
   ・終わりの行（空の行が N 行続いたら終わり）
   行・列の番号はすべて 0 始まり。grid は「行の配列」（各行は値の配列）。
   ========================================================= */
(function (X) {
  'use strict';
  const T = X.types;
  const SCAN_ROWS = 1000;   // 開始位置を探す範囲
  const SAMPLE_ROWS = 30;   // ヘッダー判定で下を見る行数
  const MAX_HEADER = 6;

  const empty = T.isEmpty;
  const cell = (g, r, c) => { const row = g[r]; return row ? row[c] : null; };

  function rowBlank(row, c0, c1) {
    if (!row) return true;
    const end = Math.min(c1, row.length - 1);
    for (let c = c0; c <= end; c++) if (!empty(row[c])) return false;
    return true;
  }

  /** 表の開始位置 → {row, col}（見つからなければ row = -1） */
  function findStart(g, merges) {
    const lim = Math.min(g.length, SCAN_ROWS);
    const info = [];
    const freq = new Map();
    for (let r = 0; r < lim; r++) {
      const row = g[r] || [];
      let n = 0, first = -1, same = true, v0;
      for (let c = 0; c < row.length; c++) {
        if (empty(row[c])) continue;
        if (n === 0) v0 = row[c]; else if (row[c] !== v0) same = false;
        n++;
        if (first < 0) first = c;
      }
      // 横に結合して埋めたタイトル行（全部同じ値）は 1 個と数える
      if (n > 1 && same) n = 1;
      info.push({ n, first });
      if (n >= 2) freq.set(n, (freq.get(n) || 0) + 1);
    }
    // 表の幅 W ＝ 最も多く現れる「値のある列の数」（同数なら広い方）
    let W = 0, best = 0;
    freq.forEach((f, n) => { if (f > best || (f === best && n > W)) { best = f; W = n; } });
    if (W === 0) {
      const r = info.findIndex((x) => x.n > 0);
      return r < 0 ? { row: -1, col: 0 } : { row: r, col: info[r].first };
    }
    const thr = Math.max(2, Math.ceil(W * 0.6));
    let start = -1;
    for (let r = 0; r < lim && start < 0; r++) {
      if (info[r].n < thr) continue;
      // 下の行も同じくらいの幅で続くか（タイトル・注記の 1 行だけを除く）
      let seen = 0, ok = 0;
      for (let k = r + 1; k < lim && k <= r + 10 && seen < 3; k++) {
        if (info[k].n === 0) continue;
        seen++;
        if (info[k].n >= Math.ceil(thr / 2)) ok++;
      }
      if (seen === 0 || ok >= Math.min(2, seen)) start = r;
    }
    if (start < 0) start = info.findIndex((x) => x.n >= thr);
    let col = Infinity;
    for (let r = start; r < lim && r <= start + SAMPLE_ROWS; r++) {
      if (info[r].n >= thr && info[r].first >= 0) col = Math.min(col, info[r].first);
    }
    if (!Number.isFinite(col)) col = info[start].first;
    start = pullUpMerged(g, merges, start, col);
    return { row: start, col };
  }

  /** 開始行をまたぐ縦の結合セルがあれば、その上端まで開始行を上げる */
  function pullUpMerged(g, merges, start, col) {
    let changed = true;
    while (changed && start > 0) {
      changed = false;
      for (const m of merges || []) {
        if (m.s.r < start && m.e.r >= start && m.e.c >= col) { start = m.s.r; changed = true; }
      }
    }
    return start;
  }

  /** 終わりの列（空の列が blankCols 列続いたら終わり）。表の先頭から最大 50 行を見る */
  function findEndCol(g, r0, c0, blankRows, blankCols) {
    const refs = [];
    let run = 0;
    for (let r = r0; r < g.length && refs.length < 50; r++) {
      if (rowBlank(g[r], c0, Infinity)) { run++; if (run >= blankRows) break; continue; }
      run = 0;
      refs.push(r);
    }
    let maxC = c0;
    refs.forEach((r) => { maxC = Math.max(maxC, (g[r] || []).length - 1); });
    let last = c0;
    run = 0;
    for (let c = c0; c <= maxC; c++) {
      const any = refs.some((r) => !empty(cell(g, r, c)));
      if (any) { last = c; run = 0; } else { run++; if (run >= blankCols) break; }
    }
    return last;
  }

  /** 終わりの行（空の行が blankRows 行続いたら終わり）→ 最後に値がある行 */
  function findEndRow(g, start, c0, c1, blankRows) {
    let last = start - 1, run = 0;
    for (let r = start; r < g.length; r++) {
      if (rowBlank(g[r], c0, c1)) { run++; if (run >= blankRows) break; }
      else { run = 0; last = r; }
    }
    return last;
  }

  /** ヘッダーの有無と段数 → {has, rows} */
  function detectHeader(g, r0, c0, c1, merges) {
    const kindAt = (r, c) => T.kind(cell(g, r, c));
    const textRow = (r) => {
      let n = 0;
      for (let c = c0; c <= c1; c++) {
        const k = kindAt(r, c);
        if (k === 'empty') continue;
        if (k !== 'text') return false;
        n++;
      }
      return n > 0;
    };
    // 列 c の r より下が、主に数値・日付か
    const typedBelow = (r, c) => {
      let typed = 0, text = 0;
      for (let k = r + 1; k < g.length && k <= r + SAMPLE_ROWS; k++) {
        const kd = kindAt(k, c);
        if (kd === 'empty') continue;
        if (kd === 'text') text++; else typed++;
      }
      return typed > 0 && typed > text;
    };
    const evidence = (r) => {
      for (let c = c0; c <= c1; c++) if (kindAt(r, c) === 'text' && typedBelow(r, c)) return true;
      return false;
    };
    if (!textRow(r0)) return { has: false, rows: 0 };
    let rows = 1;
    if (evidence(r0)) {
      while (rows < MAX_HEADER && textRow(r0 + rows) && evidence(r0 + rows)) rows++;
    } else {
      // すべて文字の表：先頭行の値がすべて異なり、2 行目以降と重ならなければヘッダー
      const vals = [];
      for (let c = c0; c <= c1; c++) { const v = cell(g, r0, c); if (!empty(v)) vals.push(String(v).trim()); }
      if (new Set(vals).size !== vals.length) return { has: false, rows: 0 };
      for (let c = c0; c <= c1; c++) {
        const v = cell(g, r0, c);
        if (empty(v)) continue;
        for (let k = r0 + 1; k <= r0 + SAMPLE_ROWS && k < g.length; k++) {
          if (String(cell(g, k, c) ?? '').trim() === String(v).trim() && !inMergeBelow(merges, r0, k, c)) return { has: false, rows: 0 };
        }
      }
    }
    // 縦の結合セル（「No」が 2 段分など）があれば、その下端までをヘッダーにする
    let changed = true;
    while (changed) {
      changed = false;
      for (const m of merges || []) {
        if (m.s.r >= r0 && m.s.r < r0 + rows && m.e.r > m.s.r && m.e.c >= c0 && m.s.c <= c1) {
          const need = m.e.r - r0 + 1;
          if (need > rows && need <= MAX_HEADER) { rows = need; changed = true; }
        }
      }
    }
    return { has: true, rows };
  }

  function inMergeBelow(merges, r0, k, c) {
    return (merges || []).some((m) => m.s.r === r0 && m.e.r >= k && m.s.c <= c && m.e.c >= c);
  }

  X.detect = { findStart, findEndCol, findEndRow, detectHeader, rowBlank };
})(window.X2S);

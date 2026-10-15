/* =========================================================
   js/domain/plan.js : 出力するテーブルの組み立て（結合を含む）
   ・同じテーブル名のシートは 1 つのテーブルにまとめる（列は名前で合わせる）
   ・まとめたテーブルには、取り込み元（ファイル名 / シート名）の列 _source を付けられる
   ・列の構成が同じなのに名前が違うシートを「まとめ候補」として返す
   ========================================================= */
(function (X) {
  'use strict';
  const T = X.types;
  const SOURCE_COL = '_source';

  /** sources: 取り込むシート / options: {sourceColumn} → [table] */
  function make(sources, options) {
    const map = new Map();
    for (const src of sources) {
      const res = src.result;
      if (!res || res.empty) continue;
      const key = src.tableName.toLowerCase();
      let t = map.get(key);
      if (!t) { t = { name: src.tableName, columns: [], parts: [], rowCount: 0 }; map.set(key, t); }
      const cols = res.columns.filter((c) => c.include);
      for (const col of cols) {
        const hit = t.columns.find((x) => x.name.toLowerCase() === col.name.toLowerCase());
        if (hit) hit.type = T.mergeType(hit.type, col.type);
        else t.columns.push({ name: col.name, type: col.type });
      }
      t.parts.push({ src, cols });
      t.rowCount += res.rowCount;
    }
    const tables = [...map.values()].filter((t) => t.columns.length);
    tables.forEach((t) => {
      t.merged = t.parts.length > 1;
      t.withSource = t.merged && options.sourceColumn && !t.columns.some((c) => c.name === SOURCE_COL);
      if (t.withSource) t.columns.push({ name: SOURCE_COL, type: 'TEXT', meta: true });
    });
    return tables;
  }

  /** 1 つの取り込み元の行を、テーブルの列の並びに合わせて size 行ずつ返す */
  function* chunks(table, part, size) {
    const g = part.src.grid, rows = part.src.result.rowIdx;
    const pos = new Map(table.columns.map((c, i) => [c.name.toLowerCase(), i]));
    const map = part.cols.map((c) => ({ from: c.index, to: pos.get(c.name.toLowerCase()), conv: T.converter(c.type) }));
    const n = table.columns.length;
    const srcLabel = table.withSource ? part.src.fileName + (part.src.kind === 'excel' || part.src.kind === 'sqlite' ? ' / ' + part.src.label : '') : null;
    const srcIdx = table.withSource ? n - 1 : -1;
    let buf = [];
    for (let i = 0; i < rows.length; i++) {
      const row = g[rows[i]] || [];
      const out = new Array(n).fill(null);
      for (const m of map) out[m.to] = m.conv(row[m.from]);
      if (srcIdx >= 0) out[srcIdx] = srcLabel;
      buf.push(out);
      if (buf.length >= size) { yield buf; buf = []; }
    }
    if (buf.length) yield buf;
  }

  /** 列の構成が同じなのにテーブル名が違うシートのまとまり */
  function mergeHints(sources) {
    const groups = new Map();
    for (const s of sources) {
      if (!s.result || s.result.empty) continue;
      const sig = X.extract.signature(s.result);
      if (!sig) continue;
      if (!groups.has(sig)) groups.set(sig, []);
      groups.get(sig).push(s);
    }
    return [...groups.values()].filter((list) => new Set(list.map((s) => s.tableName.toLowerCase())).size > 1);
  }

  /** 作成される CREATE TABLE 文（確認用） */
  function createSql(table) {
    const cols = table.columns.map((c) => '  ' + X.util.qid(c.name) + ' ' + T.decl(c.type));
    return 'CREATE TABLE ' + X.util.qid(table.name) + ' (\n' + cols.join(',\n') + '\n);';
  }

  X.plan = { make, chunks, mergeHints, createSql, SOURCE_COL };
})(window.X2S);

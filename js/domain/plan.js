/* =========================================================
   js/domain/plan.js : 出力するテーブルの組み立て（結合を含む）
   ・同じテーブル名のシートは 1 つのテーブルにまとめる（列は名前で合わせる。
     新しい列は末尾に追加し、その列がないシートの行・名前が違う列は空欄。各シートのヘッダー行は取り込まない）
   ・2 件目以降のシートについて、それまでの列との違い（追加・不足）を記録する
   ・まとめたテーブルには、取り込み元（ファイル名 / シート名）の列 _source を付けられる
   ・列の構成が同じなのに名前が違うシートを「まとめ候補」として返す
   ========================================================= */
(function (X) {
  'use strict';
  const T = X.types;
  const SOURCE_COL = '_source';

  const lower = (n) => String(n).toLowerCase();
  const namesOf = (src) => src.result.columns.filter((c) => c.include).map((c) => c.name);

  /** 既にある列名 base と、追加するシート src の列の違い */
  function compare(base, src) {
    const b = new Set(base.map(lower));
    const inc = namesOf(src);
    const i = new Set(inc.map(lower));
    return { added: inc.filter((n) => !b.has(lower(n))), missing: base.filter((n) => !i.has(lower(n))), from: base.length, to: inc.length };
  }
  const hasDiff = (d) => !!d && (d.added.length > 0 || d.missing.length > 0);

  /** sources: 取り込むシート / options: {sourceColumn} → [table] */
  function make(sources, options) {
    const map = new Map();
    for (const src of sources) {
      const res = src.result;
      if (!res || res.empty) continue;
      const key = lower(src.tableName);
      let t = map.get(key);
      if (!t) { t = { name: src.tableName, columns: [], parts: [], rowCount: 0 }; map.set(key, t); }
      const cols = res.columns.filter((c) => c.include);
      // 2 件目以降は、それまでの列との違いを記録する（新しい列は末尾に追加し、ない列は空欄）
      const diff = t.parts.length ? compare(t.columns.map((c) => c.name), src) : null;
      for (const col of cols) {
        const hit = t.columns.find((x) => lower(x.name) === lower(col.name));
        if (hit) hit.type = T.mergeType(hit.type, col.type);
        else t.columns.push({ name: col.name, type: col.type });
      }
      t.parts.push({ src, cols, diff, rows: res.rowIdx });
    }
    const tables = [...map.values()].filter((t) => t.columns.length);
    tables.forEach((t) => {
      t.merged = t.parts.length > 1;
      t.rowCount = t.parts.reduce((n, p) => n + p.rows.length, 0);
      t.withSource = t.merged && options.sourceColumn && !t.columns.some((c) => c.name === SOURCE_COL);
      if (t.withSource) t.columns.push({ name: SOURCE_COL, type: 'TEXT', meta: true });
    });
    return tables;
  }

  /** 1 つの取り込み元の行を、テーブルの列の並びに合わせて size 行ずつ返す（ない列は空欄） */
  function* chunks(table, part, size) {
    const g = part.src.grid, rows = part.rows;
    const pos = new Map(table.columns.map((c, i) => [lower(c.name), i]));
    const map = part.cols.map((c) => ({ from: c.index, to: pos.get(lower(c.name)), conv: T.converter(c.type) }));
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

  X.plan = { make, chunks, mergeHints, createSql, compare, hasDiff, namesOf, SOURCE_COL };
})(window.X2S);

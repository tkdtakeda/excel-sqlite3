/* =========================================================
   js/io/readers/csv.js : CSV / TSV / TXT
   文字コード（UTF-8 / Shift_JIS）と区切り文字（, タブ ; |）を自動で判定する。
   値はすべて文字のまま持ち、型は列ごとに後で推定する。
   ========================================================= */
(function (X) {
  'use strict';

  function decode(buf) {
    const bytes = new Uint8Array(buf);
    const bom = bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf;
    try {
      return new TextDecoder('utf-8', { fatal: true }).decode(bom ? bytes.subarray(3) : bytes);
    } catch (e) {
      return new TextDecoder('shift_jis').decode(bytes);
    }
  }

  /** 先頭 20 行で、列の数が最もそろう区切り文字を選ぶ */
  function sniff(text) {
    const lines = text.split(/\r?\n/, 20).filter((l) => l.length);
    let best = ',', bestScore = -1;
    for (const d of [',', '\t', ';', '|']) {
      const counts = lines.map((l) => l.split(d).length - 1);
      const maxc = Math.max(0, ...counts);
      if (!maxc) continue;
      const same = counts.filter((c) => c === maxc).length;
      const score = same * 10 + maxc;
      if (score > bestScore) { bestScore = score; best = d; }
    }
    return best;
  }

  /** 引用符（"…"、"" のエスケープ、セル内改行）に対応した分解 */
  function parse(text, delim) {
    if (text.charCodeAt(0) === 0xfeff) text = text.slice(1);
    const d = delim || sniff(text);
    const rows = [];
    let row = [], field = '', i = 0, quoted = false, wasQuoted = false;
    const n = text.length;
    const push = () => { row.push(field === '' && !wasQuoted ? null : field); field = ''; wasQuoted = false; };
    while (i < n) {
      const ch = text[i];
      if (quoted) {
        if (ch === '"') {
          if (text[i + 1] === '"') { field += '"'; i += 2; continue; }
          quoted = false; i++; continue;
        }
        field += ch; i++; continue;
      }
      if (ch === '"' && field === '') { quoted = true; wasQuoted = true; i++; continue; }
      if (ch === d) { push(); i++; continue; }
      if (ch === '\r' || ch === '\n') {
        push(); rows.push(row); row = [];
        i += ch === '\r' && text[i + 1] === '\n' ? 2 : 1;
        continue;
      }
      field += ch; i++;
    }
    if (field !== '' || wasQuoted || row.length) { push(); rows.push(row); }
    return rows;
  }

  X.csv = { parse, decode, sniff };

  X.readers.register({
    id: 'csv',
    label: 'CSV / TSV',
    exts: ['csv', 'tsv', 'txt'],
    fallback: true,
    async read(file) {
      const text = decode(await file.arrayBuffer());
      const ext = X.util.extOf(file.name);
      const grid = parse(text, ext === 'tsv' ? '\t' : null);
      return grid.length ? [{ label: X.util.baseName(file.name), grid }] : [];
    },
  });
})(window.X2S);

/* =========================================================
   js/domain/types.js : 値の種類の判定・列の型の推定・SQLite へ入れる値への変換
   型を増やすときは TYPES に 1 件足し、infer / converter に分岐を足す。
   ========================================================= */
(function (X) {
  'use strict';

  /** 型の一覧（表示名・アイコン・SQLite での宣言型） */
  const TYPES = {
    INTEGER:  { label: '整数', icon: 'hashtag',        decl: 'INTEGER', hint: '例：120' },
    REAL:     { label: '小数', icon: 'calculator',     decl: 'REAL',    hint: '例：12.5' },
    TEXT:     { label: '文字', icon: 'font',           decl: 'TEXT',    hint: '例：東京店' },
    DATE:     { label: '日付', icon: 'calendar-day',   decl: 'TEXT',    hint: '2026-10-15 の形の文字' },
    DATETIME: { label: '日時', icon: 'calendar-plus',  decl: 'TEXT',    hint: '2026-10-15 09:30:00 の形の文字' },
    TIME:     { label: '時刻', icon: 'clock',          decl: 'TEXT',    hint: '09:30:00 の形の文字' },
  };
  // SQLite には日付型がないため、日付・日時・時刻は並べ替えできる ISO 形式の TEXT で保存する

  const RE_INT = /^[+-]?(?:\d{1,3}(?:,\d{3})+|\d+)$/;
  const RE_NUM = /^[+-]?(?:(?:\d{1,3}(?:,\d{3})+|\d+)(?:\.\d+)?|\.\d+)(?:[eE][+-]?\d+)?$/;
  const RE_DATE = /^(\d{4})[-/.年](\d{1,2})[-/.月](\d{1,2})日?(?:[ T](\d{1,2}):(\d{2})(?::(\d{2}))?)?$/;
  const RE_TIME = /^(\d{1,2}):(\d{2})(?::(\d{2}))?$/;

  const pad = (n, w) => String(n).padStart(w || 2, '0');

  function isEmpty(v) { return v == null || (typeof v === 'string' && v.trim() === ''); }

  /** 先頭が 0 のコード（00123 など）は数として扱わない */
  function parseNumStr(s) {
    const t = s.trim();
    if (/^[+-]?0\d/.test(t)) return null;
    if (!RE_NUM.test(t)) return null;
    const n = Number(t.replace(/,/g, ''));
    return Number.isFinite(n) ? n : null;
  }

  /* ---------- 日付 ---------- */
  /** SheetJS の Date（ローカル時刻）を秒に丸めて部品にする */
  function dateParts(d) {
    const x = new Date(Math.round(d.getTime() / 1000) * 1000);
    return { y: x.getFullYear(), m: x.getMonth() + 1, d: x.getDate(), H: x.getHours(), M: x.getMinutes(), S: x.getSeconds() };
  }
  /** 'date' | 'datetime' | 'time'（Excel の時刻だけのセルは 1899-12-30/31 になる） */
  function dateClass(d) {
    const p = dateParts(d);
    if (p.y < 1900 && p.m === 12 && (p.d === 30 || p.d === 31)) return 'time';
    return p.H === 0 && p.M === 0 && p.S === 0 ? 'date' : 'datetime';
  }
  const fmtYmd = (p) => p.y + '-' + pad(p.m) + '-' + pad(p.d);
  const fmtHms = (p) => pad(p.H) + ':' + pad(p.M) + ':' + pad(p.S);
  function fmtDateAuto(d) {
    const p = dateParts(d);
    const k = dateClass(d);
    if (k === 'time') return fmtHms(p);
    if (k === 'date') return fmtYmd(p);
    return fmtYmd(p) + ' ' + fmtHms(p);
  }
  /** Excel のシリアル値（CSV に数で入っている場合）→ 部品 */
  function serialParts(n) {
    const x = new Date(Math.round((n - 25569) * 86400) * 1000);
    return { y: x.getUTCFullYear(), m: x.getUTCMonth() + 1, d: x.getUTCDate(), H: x.getUTCHours(), M: x.getUTCMinutes(), S: x.getUTCSeconds() };
  }
  /** 値 → 日付の部品（読めなければ null） */
  function toParts(v) {
    if (v instanceof Date) return dateParts(v);
    if (typeof v === 'number' && v > 0 && v < 2958466) return serialParts(v);
    if (typeof v === 'string') {
      const t = v.trim();
      let m = RE_DATE.exec(t);
      if (m) return { y: +m[1], m: +m[2], d: +m[3], H: +(m[4] || 0), M: +(m[5] || 0), S: +(m[6] || 0) };
      m = RE_TIME.exec(t);
      if (m) return { y: 1899, m: 12, d: 30, H: +m[1], M: +m[2], S: +(m[3] || 0) };
    }
    return null;
  }

  /* ---------- 判定 ---------- */
  /** 'empty' | 'num' | 'date' | 'bool' | 'text'（ヘッダーの判定などに使う） */
  function kind(v) {
    if (isEmpty(v)) return 'empty';
    if (typeof v === 'number') return 'num';
    if (typeof v === 'boolean') return 'bool';
    if (v instanceof Date) return 'date';
    const s = String(v).trim();
    if (parseNumStr(s) != null) return 'num';
    if (RE_DATE.test(s) || RE_TIME.test(s)) return 'date';
    return 'text';
  }

  /** 列の型を推定する。rows は行番号の配列、c は列番号 */
  function inferColumn(grid, rows, c) {
    let n = 0, canInt = true, canReal = true, canDate = true, canTime = true, sawDT = false;
    for (let i = 0; i < rows.length; i++) {
      const row = grid[rows[i]];
      const v = row ? row[c] : null;
      if (isEmpty(v)) continue;
      n++;
      if (typeof v === 'number') {
        canDate = canTime = false;
        if (!Number.isInteger(v) || !Number.isSafeInteger(v)) canInt = false;
      } else if (typeof v === 'boolean') {
        canDate = canTime = false;
      } else if (v instanceof Date) {
        canInt = canReal = false;
        const k = dateClass(v);
        if (k === 'time') canDate = false; else canTime = false;
        if (k === 'datetime') sawDT = true;
      } else {
        const s = String(v).trim();
        const num = parseNumStr(s);
        if (num != null) {
          canDate = canTime = false;
          if (!RE_INT.test(s) || !Number.isSafeInteger(num)) canInt = false;
        } else {
          canInt = canReal = false;
          const m = RE_DATE.exec(s);
          if (m) { canTime = false; if (m[4]) sawDT = true; }
          else if (RE_TIME.test(s)) canDate = false;
          else canDate = canTime = false;
        }
      }
      if (!canInt && !canReal && !canDate && !canTime) return { type: 'TEXT', empty: false };
    }
    if (n === 0) return { type: 'TEXT', empty: true };
    if (canInt) return { type: 'INTEGER', empty: false };
    if (canReal) return { type: 'REAL', empty: false };
    if (canDate) return { type: sawDT ? 'DATETIME' : 'DATE', empty: false };
    if (canTime) return { type: 'TIME', empty: false };
    return { type: 'TEXT', empty: false };
  }

  /** SQLite の宣言型 → この道具の型（SQLite ファイルを取り込むとき） */
  function fromDecl(decl) {
    const d = String(decl || '').toUpperCase();
    if (d.includes('INT')) return 'INTEGER';
    if (/REAL|FLOA|DOUB|NUM|DEC/.test(d)) return 'REAL';
    if (d === 'DATE') return 'DATE';
    if (d.includes('DATETIME') || d.includes('TIMESTAMP')) return 'DATETIME';
    if (d === 'TIME') return 'TIME';
    if (d.includes('CHAR') || d.includes('CLOB') || d.includes('TEXT')) return 'TEXT';
    return null; // 不明 → 推定する
  }

  /* ---------- 変換（読めない値は捨てずに文字として残す） ---------- */
  function asText(v) {
    if (v instanceof Date) return fmtDateAuto(v);
    if (typeof v === 'boolean') return v ? 'TRUE' : 'FALSE';
    return typeof v === 'string' ? v : String(v);
  }
  function asNumber(v) {
    if (typeof v === 'number') return v;
    if (typeof v === 'boolean') return v ? 1 : 0;
    if (v instanceof Date) return fmtDateAuto(v);
    const n = parseNumStr(String(v));
    return n == null ? String(v) : n;
  }
  function asDateLike(fmt) {
    return (v) => {
      const p = toParts(v);
      return p ? fmt(p) : asText(v);
    };
  }
  const CONVERT = {
    INTEGER: asNumber,
    REAL: asNumber,
    TEXT: asText,
    DATE: asDateLike(fmtYmd),
    DATETIME: asDateLike((p) => fmtYmd(p) + ' ' + fmtHms(p)),
    TIME: asDateLike(fmtHms),
  };
  function converter(type) {
    const f = CONVERT[type] || asText;
    return (v) => (isEmpty(v) ? null : f(v));
  }

  /** 型が違う列を 1 つのテーブルにまとめるときの型 */
  function mergeType(a, b) {
    if (a === b) return a;
    const s = [a, b].sort().join('+');
    if (s === 'INTEGER+REAL') return 'REAL';
    if (s === 'DATE+DATETIME') return 'DATETIME';
    return 'TEXT';
  }

  /** プレビュー表示用の文字 */
  function display(v) {
    if (v == null) return '';
    if (v instanceof Date) return fmtDateAuto(v);
    if (typeof v === 'boolean') return v ? 'TRUE' : 'FALSE';
    if (v instanceof Uint8Array) return '[BLOB ' + v.length + ' bytes]';
    return String(v);
  }

  X.types = { TYPES, isEmpty, kind, inferColumn, fromDecl, converter, mergeType, display, decl: (t) => (TYPES[t] || TYPES.TEXT).decl };
})(window.X2S);

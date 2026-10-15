/* =========================================================
   js/domain/preset.js : 読み取り設定のプリセット（保存・自動適用）
   同じ形の Excel を繰り返し変換するときに、開始位置・ヘッダー・列の型・テーブル名を覚えておく。
   読み込んだシートの見出しが 80% 以上一致すれば自動で当てはめる。
   ========================================================= */
(function (X) {
  'use strict';
  const { storage, uid } = X.util;
  const KEY = 'x2s.presets';
  const MATCH = 0.8;

  const list = () => storage.get(KEY, []);
  const saveAll = (arr) => { storage.set(KEY, arr); X.bus.emit('presets:changed'); };

  function headersOf(result) { return result.columns.map((c) => c.rawName).filter(Boolean); }

  function similarity(a, b) {
    if (!a.length || !b.length) return 0;
    const A = new Set(a), B = new Set(b);
    let inter = 0;
    A.forEach((x) => { if (B.has(x)) inter++; });
    return inter / (A.size + B.size - inter);
  }

  /** 表示中のシートの設定をプリセットとして保存 */
  function save(name, src, withTableName) {
    const res = src.result;
    const cols = {};
    res.columns.forEach((c) => {
      const ov = src.overrides[c.index];
      if (ov && c.rawName) cols[c.rawName] = Object.assign({}, ov);
    });
    const p = {
      id: uid('p'), name: name || src.label, settings: Object.assign({}, src.settings),
      headers: headersOf(res), cols, tableName: withTableName ? src.tableName : '', autoApply: true, createdAt: Date.now(),
    };
    saveAll(list().concat(p));
    return p;
  }

  /** プリセットを当てはめた設定と列の上書き（列は見出し名で対応づける） */
  function resolve(p, src) {
    const settings = Object.assign(X.extract.defaults(), p.settings);
    const tmp = Object.assign({}, src, { settings, overrides: {} });
    const res = X.extract.build(tmp);
    const overrides = {};
    res.columns.forEach((c) => { if (c.rawName && p.cols[c.rawName]) overrides[c.index] = Object.assign({}, p.cols[c.rawName]); });
    return { settings, overrides, score: similarity(headersOf(res), p.headers) };
  }

  /** シートに最も合うプリセット（自動適用が有効なもの・80% 以上） */
  function bestMatch(src) {
    let best = null;
    for (const p of list()) {
      if (!p.autoApply || !p.headers.length) continue;
      const r = resolve(p, src);
      if (r.score >= MATCH && (!best || r.score > best.score)) best = Object.assign({ preset: p }, r);
    }
    return best;
  }

  function update(id, patch) { saveAll(list().map((p) => (p.id === id ? Object.assign({}, p, patch) : p))); }
  function remove(id) { saveAll(list().filter((p) => p.id !== id)); }

  // シートを読み込んだときに自動で当てはめる
  X.bus.on('source:init', (src) => {
    if (src.fixed) return;
    const m = bestMatch(src);
    if (!m) return;
    src.settings = m.settings;
    src.overrides = m.overrides;
    if (m.preset.tableName) src.tableName = m.preset.tableName;
    src.preset = m.preset.name;
  });

  X.presets = { list, save, resolve, update, remove, similarity };
})(window.X2S);

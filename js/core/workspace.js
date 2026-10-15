/* =========================================================
   js/core/workspace.js : 読み込んだファイル・シートと設定の置き場所（唯一の状態）
   変更はすべてここの関数を通し、X.bus でお知らせする。
     files:changed   … ファイル・シートが増えた／減った
     source:changed  … シートの設定・結果が変わった（payload: source id）
     active:changed  … 表示中のシートが変わった
     build:changed   … SQLite の作成状態が変わった
   ========================================================= */
(function (X) {
  'use strict';
  const { uid, storage, baseName } = X.util;
  const bus = X.bus;

  const files = [];
  const sources = new Map();
  let activeId = null;
  let version = 0; // 変更のたびに増える（作成済みの DB が古いかの判定に使う）
  const build = { status: 'none', tables: [], error: null, version: -1 };
  const options = Object.assign({ sourceColumn: true, outName: '' }, storage.get('x2s.options', {}));

  function touch() {
    version++;
    if (build.status === 'ready') { build.status = 'stale'; bus.emit('build:changed'); }
  }

  function recompute(src) { src.result = X.extract.build(src); }

  /* ---------- テーブル名 ---------- */
  function sanitizeTable(name) {
    const t = String(name || '').replace(/[\s　]+/g, '_').replace(/["[\]`]/g, '').trim();
    return t || 'table';
  }
  /** 既定のテーブル名。同じ名前・同じ列構成のシートがあればまとめる（同じ名前のまま） */
  function defaultTableName(src) {
    const base = sanitizeTable(src.kind === 'csv' || src.kind === 'paste' ? baseName(src.fileName) : src.label);
    const sig = X.extract.signature(src.result);
    let name = base, i = 2;
    for (;;) {
      const same = [...sources.values()].filter((s) => s.tableName.toLowerCase() === name.toLowerCase());
      if (!same.length || same.every((s) => X.extract.signature(s.result) === sig)) return name;
      name = base + '_' + i++;
    }
  }

  /* ---------- ファイル ---------- */
  /** info: {name, kind, size, sample}  raw: [{label, grid, merges, fixed, include}] */
  function addFile(info, raw) {
    const file = { id: uid('f'), name: info.name, kind: info.kind, size: info.size || 0, sample: !!info.sample, sourceIds: [] };
    for (const rs of raw) {
      const src = {
        id: uid('s'), fileId: file.id, fileName: file.name, kind: file.kind, sample: file.sample,
        label: rs.label, grid: rs.grid, merges: rs.merges || [], fixed: rs.fixed || null,
        colCount: rs.colCount || rs.grid.reduce((m, r) => Math.max(m, r ? r.length : 0), 0),
        include: rs.include !== false, settings: X.extract.defaults(), overrides: {}, tableName: '', preset: null, result: null,
      };
      recompute(src);
      bus.emit('source:init', src); // プリセットの自動適用など（設定を書き換えてよい）
      if (src.preset) recompute(src);
      if (!src.tableName) src.tableName = defaultTableName(src);
      sources.set(src.id, src);
      file.sourceIds.push(src.id);
    }
    files.push(file);
    if (file.sourceIds.length) activeId = file.sourceIds.find((id) => sources.get(id).include) || file.sourceIds[0];
    touch();
    bus.emit('files:changed');
    bus.emit('active:changed');
    return file;
  }

  function removeFiles(pred) {
    const gone = files.filter(pred);
    if (!gone.length) return 0;
    gone.forEach((f) => {
      f.sourceIds.forEach((id) => sources.delete(id));
      files.splice(files.indexOf(f), 1);
    });
    if (!sources.has(activeId)) activeId = sources.size ? sources.keys().next().value : null;
    touch();
    bus.emit('files:changed');
    bus.emit('active:changed');
    return gone.length;
  }

  /* ---------- シート ---------- */
  function changed(src) { touch(); bus.emit('source:changed', src.id); }

  function updateSettings(id, patch) {
    const src = sources.get(id);
    if (!src) return;
    Object.assign(src.settings, patch);
    recompute(src);
    changed(src);
  }
  function replaceSettings(id, settings, overrides) {
    const src = sources.get(id);
    if (!src) return;
    src.settings = Object.assign(X.extract.defaults(), settings);
    if (overrides) src.overrides = overrides;
    recompute(src);
    changed(src);
  }
  function setOverride(id, col, patch) {
    const src = sources.get(id);
    if (!src) return;
    const cur = Object.assign({}, src.overrides[col], patch);
    Object.keys(cur).forEach((k) => { if (cur[k] == null || cur[k] === '') delete cur[k]; });
    src.overrides[col] = cur;
    recompute(src);
    changed(src);
  }
  function setTableName(id, name) {
    const src = sources.get(id);
    if (!src) return;
    src.tableName = sanitizeTable(name);
    changed(src);
  }
  function setInclude(id, on) {
    const src = sources.get(id);
    if (!src) return;
    src.include = !!on;
    changed(src);
  }
  function setActive(id) {
    if (!sources.has(id) || id === activeId) return;
    activeId = id;
    bus.emit('active:changed');
  }

  /* ---------- 作成状態・出力の設定 ---------- */
  function setBuild(patch) { Object.assign(build, patch); bus.emit('build:changed'); }
  function setOption(key, val) {
    options[key] = val;
    storage.set('x2s.options', options);
    touch();
    bus.emit('build:changed');
  }

  X.ws = {
    addFile, removeFiles, updateSettings, replaceSettings, setOverride, setTableName, setInclude, setActive, setBuild, setOption,
    sanitizeTable,
    files: () => files.slice(),
    source: (id) => sources.get(id),
    sources: () => files.flatMap((f) => f.sourceIds.map((id) => sources.get(id))),
    included: () => X.ws.sources().filter((s) => s.include),
    active: () => sources.get(activeId) || null,
    build: () => build,
    options: () => options,
    version: () => version,
  };
})(window.X2S);

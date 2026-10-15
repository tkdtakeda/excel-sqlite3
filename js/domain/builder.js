/* =========================================================
   js/domain/builder.js : 取り込むシート → SQLite の作成・保存
   作成済みで設定が変わっていなければ作り直さない（ensure）。
   ========================================================= */
(function (X) {
  'use strict';
  const T = X.types;
  const CHUNK = 5000;
  let running = null;

  async function run(onProgress) {
    const ws = X.ws;
    const ver = ws.version();
    const tables = X.plan.make(ws.included(), ws.options());
    if (!tables.length) throw new Error('取り込むシートがありません。ファイルを読み込み、シートにチェックを入れてください。');
    ws.setBuild({ status: 'building', error: null });
    try {
      const total = tables.reduce((s, t) => s + t.rowCount, 0) || 1;
      let done = 0;
      await X.engine.call('reset');
      for (const t of tables) {
        const columns = t.columns.map((c) => ({ name: c.name, type: T.decl(c.type) }));
        await X.engine.call('createTable', { name: t.name, columns });
        for (const part of t.parts) {
          for (const rows of X.plan.chunks(t, part, CHUNK)) {
            await X.engine.call('insert', { name: t.name, ncol: columns.length, rows });
            done += rows.length;
            if (onProgress) onProgress(done / total, t.name);
          }
        }
      }
      const schema = await X.engine.call('schema');
      ws.setBuild({ status: ws.version() === ver ? 'ready' : 'stale', tables: schema, version: ver, at: Date.now() });
      return schema;
    } catch (e) {
      ws.setBuild({ status: 'error', error: e.message });
      throw e;
    }
  }

  /** 作成済みで最新ならそのまま。そうでなければ作る */
  function ensure(onProgress) {
    const b = X.ws.build();
    if (b.status === 'ready' && b.version === X.ws.version()) return Promise.resolve(b.tables);
    if (!running) running = run(onProgress).finally(() => { running = null; });
    return running;
  }

  async function exportBytes(onProgress) {
    await ensure(onProgress);
    return X.engine.call('export');
  }

  // 中止で Worker を作り直したら、DB は消えている
  X.bus.on('engine:reset', () => X.ws.setBuild({ status: 'none', tables: [] }));

  X.builder = { run, ensure, exportBytes };
})(window.X2S);

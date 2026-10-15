/* =========================================================
   js/io/readers/sqlite.js : SQLite（sqlite・sqlite3・db・db3）
   テーブルごとに 1 つの取り込み元にする。列名と型はそのまま使い、位置の判定はしない。
   元のファイルは変更しない。
   ========================================================= */
(function (X) {
  'use strict';

  X.readers.register({
    id: 'sqlite',
    label: 'SQLite',
    exts: ['sqlite', 'sqlite3', 'db', 'db3'],
    async read(file) {
      const bytes = new Uint8Array(await file.arrayBuffer());
      const tables = await X.engine.call('readDb', { bytes }, [bytes.buffer]);
      return tables.map((t) => ({
        label: t.name,
        grid: [t.columns.map((c) => c.name)].concat(t.rows),
        fixed: { columns: t.columns },
      }));
    },
  });
})(window.X2S);

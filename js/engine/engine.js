/* =========================================================
   js/engine/engine.js : SQLite（sql.js）を動かす部分
   ・画面が固まらないよう Web Worker（Blob から作る＝ file:// でも動く）で動かす
   ・Worker が使えない環境では、同じ処理を画面側で動かす（遅いが動く）
   ・出力用の DB を 1 つ持ち、テーブル作成・追加・SQL 実行・書き出しを受け持つ
   ・SQLite ファイルの読み込み（テーブル一覧と行）と、サンプル用の DB 作成もここ
   使い方：await X.engine.call('exec', {sql})
   ========================================================= */
(function (X) {
  'use strict';
  const SQLJS_BASE = 'https://cdnjs.cloudflare.com/ajax/libs/sql.js/1.8.0/';

  /* ---------------------------------------------------------
     ここから下の engineCore は Worker の中でも動く。外の変数を参照しないこと。
     scope: postMessage / onmessage を持つもの   loadSql: base → Promise<SQL>
     --------------------------------------------------------- */
  function engineCore(scope, loadSql) {
    let SQL = null, out = null;
    const q = (n) => '"' + String(n).replace(/"/g, '""') + '"';

    function tablesOf(db) {
      const res = db.exec("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY rowid");
      return res.length ? res[0].values.map((v) => v[0]) : [];
    }
    function columnsOf(db, name) {
      const res = db.exec('PRAGMA table_info(' + q(name) + ')');
      return res.length ? res[0].values.map((v) => ({ name: v[1], type: v[2] || '' })) : [];
    }
    function countOf(db, name) { return db.exec('SELECT COUNT(*) FROM ' + q(name))[0].values[0][0]; }
    function insertRows(db, name, ncol, rows) {
      const st = db.prepare('INSERT INTO ' + q(name) + ' VALUES (' + new Array(ncol).fill('?').join(',') + ')');
      db.run('BEGIN');
      try {
        for (let i = 0; i < rows.length; i++) st.run(rows[i]);
        db.run('COMMIT');
      } catch (e) { db.run('ROLLBACK'); throw e; } finally { st.free(); }
    }
    function create(db, name, columns) {
      db.run('DROP TABLE IF EXISTS ' + q(name));
      db.run('CREATE TABLE ' + q(name) + ' (' + columns.map((c) => q(c.name) + ' ' + c.type).join(', ') + ')');
    }
    function need() { if (!out) out = new SQL.Database(); return out; }

    const ops = {
      async init(a) { if (!SQL) SQL = await loadSql(a.base); return true; },
      reset() { if (out) out.close(); out = new SQL.Database(); return true; },
      createTable(a) { create(need(), a.name, a.columns); return true; },
      insert(a) { insertRows(need(), a.name, a.ncol, a.rows); return a.rows.length; },
      exec(a) {
        const db = need();
        const t0 = Date.now();
        const res = db.exec(a.sql);
        const last = res.length ? res[res.length - 1] : null;
        return { columns: last ? last.columns : [], values: last ? last.values : [], changes: db.getRowsModified(), ms: Date.now() - t0, statements: res.length };
      },
      schema() {
        const db = need();
        return tablesOf(db).map((n) => ({ name: n, columns: columnsOf(db, n), count: countOf(db, n) }));
      },
      export() { return need().export(); },
      /** SQLite ファイル → [{name, columns, rows}] */
      readDb(a) {
        const db = new SQL.Database(a.bytes);
        try {
          return tablesOf(db).map((n) => {
            const res = db.exec('SELECT * FROM ' + q(n));
            return { name: n, columns: columnsOf(db, n), rows: res.length ? res[0].values : [] };
          });
        } finally { db.close(); }
      },
      /** [{name, columns, rows}] → SQLite ファイルのバイト列（サンプル作成用） */
      makeDb(a) {
        const db = new SQL.Database();
        try {
          a.tables.forEach((t) => { create(db, t.name, t.columns); insertRows(db, t.name, t.columns.length, t.rows); });
          return db.export();
        } finally { db.close(); }
      },
    };

    scope.onmessage = async (e) => {
      const { id, op, args } = e.data;
      try {
        if (!SQL && op !== 'init') throw new Error('SQLite の準備ができていません');
        if (!ops[op]) throw new Error('不明な処理: ' + op);
        const result = await ops[op](args || {});
        scope.postMessage({ id, ok: true, result }, result instanceof Uint8Array ? [result.buffer] : []);
      } catch (err) {
        scope.postMessage({ id, ok: false, error: String((err && err.message) || err) });
      }
    };
  }
  /* --------------------------------------------------------- */

  function workerLoader(base) {
    self.importScripts(base + 'sql-wasm.js');
    return self.initSqlJs({ locateFile: (f) => base + f });
  }

  function pageLoader(base) {
    return new Promise((resolve, reject) => {
      const start = () => window.initSqlJs({ locateFile: (f) => base + f }).then(resolve, reject);
      if (window.initSqlJs) return start();
      const s = document.createElement('script');
      s.src = base + 'sql-wasm.js';
      s.onload = start;
      s.onerror = () => reject(new Error('sql.js を読み込めませんでした（ネットワークを確認してください）'));
      document.head.appendChild(s);
    });
  }

  /* ---------- 画面側の窓口 ---------- */
  let port = null;      // {post(msg, transfer), terminate()}
  let mode = '';        // 'worker' | 'page'
  let ready = null;
  let seq = 0;
  const pending = new Map();

  function onReply(msg) {
    const p = pending.get(msg.id);
    if (!p) return;
    pending.delete(msg.id);
    if (msg.ok) p.resolve(msg.result); else p.reject(new Error(msg.error));
  }

  function startWorker() {
    const src = '(' + engineCore.toString() + ')(self, ' + workerLoader.toString() + ');';
    const url = URL.createObjectURL(new Blob([src], { type: 'text/javascript' }));
    const w = new Worker(url);
    w.onmessage = (e) => onReply(e.data);
    w.onerror = (e) => { e.preventDefault && e.preventDefault(); };
    return { post: (m, t) => w.postMessage(m, t || []), terminate: () => w.terminate() };
  }

  function startPage() {
    const scope = { postMessage: (m) => setTimeout(() => onReply(m), 0) };
    engineCore(scope, pageLoader);
    return { post: (m) => setTimeout(() => scope.onmessage({ data: m }), 0), terminate() {} };
  }

  function raw(op, args, transfer) {
    return new Promise((resolve, reject) => {
      const id = ++seq;
      pending.set(id, { resolve, reject });
      port.post({ id, op, args }, transfer);
    });
  }

  function failAll(msg) {
    pending.forEach((p) => p.reject(new Error(msg)));
    pending.clear();
  }

  async function boot() {
    try {
      port = startWorker();
      mode = 'worker';
      await raw('init', { base: SQLJS_BASE });
    } catch (e) {
      if (port) port.terminate();
      failAll('切り替え');
      port = startPage();
      mode = 'page';
      await raw('init', { base: SQLJS_BASE });
    }
  }

  function ensure() {
    if (!ready) ready = boot().catch((e) => { ready = null; throw e; });
    return ready;
  }

  async function call(op, args, transfer) {
    await ensure();
    return raw(op, args, transfer);
  }

  /** 長い処理の中止。Worker を作り直すので、作成済みの DB は消える */
  function cancel() {
    if (mode !== 'worker' || !port) return false;
    port.terminate();
    port = null;
    ready = null;
    failAll('中止しました');
    X.bus.emit('engine:reset');
    return true;
  }

  X.engine = { call, cancel, ensure, mode: () => mode, canCancel: () => mode === 'worker' };
})(window.X2S);

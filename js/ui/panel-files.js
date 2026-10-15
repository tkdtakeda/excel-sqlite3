/* =========================================================
   js/ui/panel-files.js : 脇パネル「ファイル」
   読み込んだファイルとシートの一覧。取り込むシートのチェック・削除・サンプルのみクリア。
   ========================================================= */
(function (X) {
  'use strict';
  const { h, icon, fmt } = X.util;
  const KIND_ICON = { excel: 'fa-regular fa-file-excel', csv: 'fa-solid fa-file-csv', sqlite: 'fa-solid fa-database', paste: 'fa-solid fa-paste' };

  async function clearSamples() {
    const n = X.ws.removeFiles((f) => f.sample);
    X.ui.toast(n ? 'サンプル ' + n + ' 件を外しました' : 'サンプルはありません', n ? 'ok' : 'info');
  }
  async function clearAll() {
    if (!(await X.ui.confirm('読み込んだファイルをすべて外します。よろしいですか？', 'すべて外す', true))) return;
    X.ws.removeFiles(() => true);
    X.ui.toast('すべて外しました', 'ok');
  }

  function fileCard(f) {
    const act = X.ws.active();
    const sheets = f.sourceIds.map((id) => {
      const s = X.ws.source(id);
      return h('li', { class: 'sheet-row' + (act && act.id === id ? ' is-on' : '') },
        h('input', { type: 'checkbox', checked: s.include, title: '取り込む', on: { change: (e) => X.ws.setInclude(id, e.target.checked) } }),
        h('button', { class: 'sheet-name', title: 'プレビューに表示', on: { click: () => { X.ws.setActive(id); X.shell.showView('preview'); } } },
          h('span', { text: f.kind === 'csv' || f.kind === 'paste' ? 'データ' : s.label })),
        h('span', { class: 'sheet-meta' }, fmt.num(s.result.rowCount) + ' 行'),
        h('span', { class: 'sheet-table', title: 'テーブル名' }, icon('arrow-right'), s.tableName));
    });
    return h('div', { class: 'file-card' },
      h('div', { class: 'file-head' }, icon(KIND_ICON[f.kind] || 'file'),
        h('span', { class: 'file-name', title: f.name, text: f.name }),
        f.sample ? h('span', { class: 'tag tag-sample' }, icon('flask'), 'サンプル') : null,
        h('span', { class: 'file-size', text: f.size ? fmt.bytes(f.size) : '' }),
        h('button', { class: 'icon-btn sm', title: 'このファイルを外す', on: { click: () => X.ws.removeFiles((x) => x.id === f.id) } }, icon('xmark'))),
      h('ul', { class: 'sheet-list' }, sheets));
  }

  function render(body) {
    const files = X.ws.files();
    body.appendChild(h('button', { class: 'dropzone', on: { click: X.shell.pickFiles } },
      icon('cloud-arrow-up'), h('span', null, h('b', { text: 'ファイルを選ぶ' }), '（ドロップ・Ctrl+V でも可）'),
      h('small', { text: 'Excel / CSV / TSV / SQLite・複数可' })));
    if (!files.length) {
      body.appendChild(X.ui.empty('folder-open', 'まだ読み込んだファイルはありません'));
      return;
    }
    body.appendChild(h('div', { class: 'file-list' }, files.map(fileCard)));
    const hasSample = files.some((f) => f.sample);
    body.appendChild(h('div', { class: 'panel-actions' },
      hasSample ? h('button', { class: 'btn btn-outline', on: { click: clearSamples } }, icon('broom'), 'サンプルのみクリア') : null,
      h('button', { class: 'btn btn-danger-outline', on: { click: clearAll } }, icon('trash-can'), 'すべて外す')));
  }

  X.shell.panel({
    id: 'files', icon: 'folder-open', title: 'ファイル', order: 10, render,
    refreshOn: ['files:changed', 'source:changed', 'active:changed'],
    badge: () => { const n = X.ws.files().length; return n ? String(n) : ''; },
  });
  X.panels = Object.assign(X.panels || {}, { clearSamples });
})(window.X2S);

/* =========================================================
   js/app.js : 起動と、上部バー（作成状態・保存ボタン）のつなぎ込み
   ========================================================= */
(function (X) {
  'use strict';
  const { icon } = X.util;

  const STATUS = {
    none:     ['circle-dot', '未作成', ''],
    building: ['spinner fa-spin', '作成中', 'is-info'],
    ready:    ['circle-check', '作成済み', 'is-ok'],
    stale:    ['rotate', '設定変更あり', 'is-warn'],
    error:    ['circle-xmark', 'エラー', 'is-err'],
  };

  function renderStatus() {
    const el = document.getElementById('db-status');
    const has = X.ws.included().length > 0;
    const [ic, text, cls] = STATUS[X.ws.build().status] || STATUS.none;
    el.className = 'status-chip ' + cls;
    el.hidden = !has;
    el.title = 'SQLite の作成状態（保存・SQL の実行時に自動で作ります）';
    el.replaceChildren(icon(ic), text);
    document.getElementById('btn-save').disabled = !has;
  }

  function start() {
    X.preview.init();
    X.sqlview.init();
    X.shell.start();
    document.getElementById('btn-save').addEventListener('click', () => X.output.save());
    ['build:changed', 'files:changed', 'source:changed'].forEach((ev) => X.bus.on(ev, renderStatus));
    renderStatus();
    // 初めて開いたときは使い方の入口になるファイルパネルを開く。読み込んだら読み取り設定へ
    X.bus.on('files:changed', () => {
      if (X.shell.current() === 'files' && X.ws.files().length === 1 && !X.ws.files()[0].sample) X.shell.open('settings');
    });
    if (!window.XLSX) X.ui.toast('Excel 読み込み部品を読み込めませんでした。ネットワークに接続して開き直してください（CSV は読み込めます）', 'err');
    X.engine.ensure().catch(() => X.ui.toast('SQLite 部品（sql.js）を読み込めませんでした。ネットワークを確認してください', 'err'));
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start); else start();
})(window.X2S);

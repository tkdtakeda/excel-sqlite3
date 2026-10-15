/* =========================================================
   js/ui/help.js : 使い方（モーダル）
   ========================================================= */
(function (X) {
  'use strict';
  const { h, icon } = X.util;

  const STEPS = [
    ['folder-open', '読み込む', 'Excel・CSV・SQLite をドロップ（画面のどこでも）、ファイルを選ぶ、または Excel の範囲をコピーして Ctrl+V。複数のファイルをまとめて読み込めます。'],
    ['sliders', '範囲を確かめる', '表の始まり（タイトル行を飛ばす）とヘッダーの有無・段数は自動で判定します。プレビューの色で範囲を確認し、違えばセルをクリックして「ここを開始位置にする」などを選びます。'],
    ['flag-checkered', '終わりの判定', '空の行が N 行（初期値 2）続いたら終わりです。合計行は「末尾から ○ 行を除く」で外します。N は「読み取り設定」で変えられます。'],
    ['table-columns', '列を整える', '列名と型（整数・小数・文字・日付・日時・時刻）は自動で推定します。「列」で名前・型・取り込むかを変えられます。'],
    ['object-group', 'まとめる', '同じテーブル名にしたシートは 1 つのテーブルに結合します（列は名前で合わせます）。列の構成が同じシートには「出力」に「まとめ候補」が出ます。'],
    ['terminal', 'SQL で確認', '「SQL で確認」タブで SELECT 文を実行し、結果を CSV・Excel に出力できます。「条件の例」から書き方を選べます。'],
    ['download', '保存', '右上の「SQLite を保存」で .sqlite ファイルをダウンロードします。'],
    ['bookmark', 'プリセット', '同じ形のファイルを繰り返し変換するときは、設定をプリセットに保存すると、次回から自動で当てはめます。'],
  ];

  function open() {
    const body = h('div', { class: 'help' },
      h('ol', { class: 'help-steps' }, STEPS.map(([ic, title, text]) => h('li', null, h('span', { class: 'help-ic' }, icon(ic)), h('div', null, h('b', { text: title }), h('p', { text }))))),
      h('div', { class: 'help-keys' },
        h('h3', null, icon('keyboard'), 'キー操作'),
        h('ul', null,
          h('li', null, h('kbd', { text: 'Enter' }), ' 入力を確定して次の欄へ'),
          h('li', null, h('kbd', { text: 'Ctrl+V' }), ' ファイル・Excel の範囲を読み込む（入力欄の外で）'),
          h('li', null, h('kbd', { text: 'Ctrl+Enter' }), ' SQL を実行'),
          h('li', null, h('kbd', { text: 'Esc' }), ' メニュー・この画面を閉じる'))),
      h('p', { class: 'note' }, icon('shield-halved'), 'データはこのブラウザの中だけで処理し、外部へは送りません（部品の読み込みにネットワークを使います）。'));
    X.ui.modal('使い方', body, { icon: 'circle-question', width: 'var(--w-modal-md)' });
  }

  X.shell.panel({ id: 'help', icon: 'fa-regular fa-circle-question', title: '使い方', order: 90, bottom: true, action: open });
  X.help = { open };
})(window.X2S);

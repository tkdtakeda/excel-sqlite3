/* =========================================================
   js/ui/panel-settings.js : 脇パネル「読み取り設定」（表示中のシート）
   テーブル名・開始位置・ヘッダー・終わりの判定。
   入力は Enter（または欄を離れたとき）に反映し、プレビューが光って知らせる。
   ========================================================= */
(function (X) {
  'use strict';
  const { h, icon, fmt } = X.util;
  const ui = X.ui;

  /** 数を入れる欄（全選択・Enter で次へ・範囲外は丸める） */
  function numInput(key, value, min, max, onCommit, opts) {
    opts = opts || {};
    return h('input', {
      type: 'text', inputmode: 'numeric', class: 'inp inp-num' + (opts.auto ? ' is-auto' : ''), 'data-key': key, value: String(value),
      title: opts.title || '', disabled: !!opts.disabled, 'data-advance': opts.advance || null,
      on: {
        change: (e) => {
          const n = Math.round(Number(String(e.target.value).replace(/[^\d-]/g, '')));
          const v = Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : value;
          e.target.value = String(v);
          if (v !== value) onCommit(v);
        },
      },
    });
  }

  function render(body) {
    const src = X.ws.active();
    if (!src) { body.appendChild(ui.empty('table', 'ファイルを読み込むと、ここで読み取り方を設定できます')); return; }
    const s = src.settings, r = src.result, id = src.id;
    const set = (patch) => X.ws.updateSettings(id, patch);

    body.appendChild(h('div', { class: 'panel-sub' }, icon('file-lines'), h('span', { text: src.fileName + (src.kind === 'excel' || src.kind === 'sqlite' ? ' / ' + src.label : '') })));

    // ---- テーブル ----
    body.appendChild(ui.section('出力先のテーブル', 'database',
      h('div', { class: 'row', 'data-form': '' },
        h('input', { type: 'text', class: 'inp grow', 'data-key': 'tname', value: src.tableName, title: '同じ名前にしたシートは 1 つのテーブルにまとめます',
          on: { change: (e) => { if (e.target.value.trim() && e.target.value !== src.tableName) X.ws.setTableName(id, e.target.value); } } })),
      h('label', { class: 'check' }, h('input', { type: 'checkbox', checked: src.include, on: { change: (e) => X.ws.setInclude(id, e.target.checked) } }), 'このシートを取り込む'),
      h('p', { class: 'note' }, icon('circle-info'), '同じテーブル名にしたシートは、1 つのテーブルにまとめて出力します。')));

    if (src.fixed) {
      body.appendChild(ui.empty('database', 'SQLite のテーブルは、列名と型をそのまま取り込みます（列の型は「列」で変えられます）'));
      return;
    }

    // ---- 開始位置 ----
    const autoRef = r.auto.row >= 0 ? fmt.cellRef(r.auto.row, r.auto.col) : '—';
    body.appendChild(ui.section('開始位置（表の左上）', 'location-crosshairs',
      ui.segmented([
        { value: true, label: '自動', icon: 'wand-magic-sparkles', title: 'タイトル行などを飛ばして、表の始まりを探します' },
        { value: false, label: '指定', icon: 'hand-pointer' },
      ], s.auto, (v) => set(v ? { auto: true } : { auto: false, startRow: r.startRow + 1, startCol: r.startCol + 1 })),
      h('div', { class: 'row', 'data-form': '' },
        ui.field('行', numInput('srow', r.startRow + 1, 1, 1048576, (v) => set({ auto: false, startRow: v, startCol: r.startCol + 1 }), { auto: s.auto })),
        ui.field('列', h('input', {
          type: 'text', class: 'inp inp-col' + (s.auto ? ' is-auto' : ''), 'data-key': 'scol', value: fmt.colLetter(r.startCol), title: 'A, B, … または列の番号',
          on: { change: (e) => {
            const c = fmt.colIndex(e.target.value);
            if (c < 0) { e.target.value = fmt.colLetter(r.startCol); ui.toast('列は A, B, … か番号で入れてください', 'warn'); return; }
            e.target.value = fmt.colLetter(c);
            if (c !== r.startCol || s.auto) set({ auto: false, startRow: r.startRow + 1, startCol: c + 1 });
          } },
        }))),
      h('p', { class: 'note' }, icon('wand-magic-sparkles'), '自動判定：' + autoRef + '　', icon('arrow-pointer'), 'プレビューのセルをクリックしても指定できます')));

    // ---- ヘッダー ----
    const ah = r.auto.header;
    body.appendChild(ui.section('ヘッダー（列名の行）', 'heading',
      ui.segmented([
        { value: 'auto', label: '自動', icon: 'wand-magic-sparkles' },
        { value: 'yes', label: 'あり', icon: 'check' },
        { value: 'no', label: 'なし', icon: 'ban' },
      ], s.header, (v) => set(v === 'yes' ? { header: 'yes', headerRows: r.header.rows || 1 } : { header: v })),
      h('div', { class: 'row', 'data-form': '' },
        ui.field('段数（行）', numInput('hrows', r.header.has ? r.header.rows : 0, 1, 10, (v) => set({ header: 'yes', headerRows: v }),
          { auto: s.header === 'auto', disabled: s.header === 'no', title: '2 段以上は「大項目_小項目」の列名になります' }))),
      h('p', { class: 'note' }, icon('wand-magic-sparkles'), '自動判定：' + (ah.has ? ah.rows + ' 行' : 'なし') + '。2 段以上は「大項目_小項目」の列名にします。')));

    // ---- 終わりの判定 ----
    body.appendChild(ui.section('終わりの判定', 'flag-checkered',
      h('div', { class: 'grid2', 'data-form': '' },
        h('label', { class: 'sentence' }, '空の行が', numInput('brows', s.blankRows, 1, 99, (v) => set({ blankRows: v })), '行続いたら終わり'),
        h('label', { class: 'sentence' }, '空の列が', numInput('bcols', s.blankCols, 1, 99, (v) => set({ blankCols: v })), '列続いたら終わり'),
        h('label', { class: 'sentence', title: '合計行・注記など' }, '末尾から', numInput('skip', s.skipFooter, 0, 9999, (v) => set({ skipFooter: v })), '行を除く（合計行など）')),
      h('p', { class: 'note' }, icon('circle-info'), '範囲：' + (r.empty ? '—' : fmt.cellRef(r.startRow, r.startCol) + ' 〜 ' + fmt.cellRef(Math.max(r.lastRow, r.startRow), r.endCol)) + '。途中の空の行は取り込みません。'),
      h('label', { class: 'check' }, h('input', { type: 'checkbox', checked: s.dropEmptyCols, on: { change: (e) => set({ dropEmptyCols: e.target.checked }) } }), '名前も値もない列は取り込まない')));

    // ---- まとめて ----
    const others = X.ws.sources().filter((x) => x.id !== id && !x.fixed);
    body.appendChild(h('div', { class: 'panel-actions' },
      others.length ? h('button', { class: 'btn btn-outline', title: '開始位置・ヘッダー・終わりの判定をほかのシートにも当てはめます',
        on: { click: () => { others.forEach((x) => X.ws.replaceSettings(x.id, Object.assign({}, s), {})); ui.toast(others.length + ' シートに同じ設定を当てはめました', 'ok'); } } },
      icon('clone'), 'ほかのシートにも適用') : null,
      h('button', { class: 'btn btn-outline', on: { click: () => { X.ws.replaceSettings(id, X.extract.defaults(), {}); ui.toast('初期値（自動判定）に戻しました', 'ok'); } } },
        icon('rotate-left'), '初期値に戻す')));
  }

  X.shell.panel({ id: 'settings', icon: 'sliders', title: '読み取り設定', order: 20, render, refreshOn: ['active:changed', 'source:changed', 'files:changed'] });
})(window.X2S);

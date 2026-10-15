/* =========================================================
   js/ui/merge.js : シートを同じテーブルにまとめるときの確認
   ・追加する側のヘッダーは取り込まない（ヘッダーを見落としていても、先頭行が既存の列名と
     同じならヘッダーとして扱う。データに紛れたヘッダー行は X.plan で取り除く）
   ・列の数・名前が違うときは、違いをメッセージで示し「まとめる」で列を追加する
     （新しい列は末尾に追加し、その列がないファイルの行は空欄。名前の違う列も空欄）
   入口：テーブル名の変更・まとめ候補のボタン・同じテーブル名でのファイル読み込み
   ========================================================= */
(function (X) {
  'use strict';
  const { h, icon } = X.util;
  const T = X.types;
  const ui = X.ui;
  const lower = (n) => String(n).toLowerCase();
  const labelOf = (s) => s.fileName + (s.kind === 'excel' || s.kind === 'sqlite' ? ' / ' + s.label : '');

  /** ヘッダーなしと判定したシートでも、先頭行が既存の列名とほぼ同じならヘッダーにする */
  function alignHeader(src, baseNames) {
    const r = src.result;
    if (src.fixed || src.settings.header !== 'auto' || r.header.has || !r.rowIdx.length) return false;
    const row = src.grid[r.rowIdx[0]] || [];
    const set = new Set(baseNames.map(lower));
    let n = 0, m = 0;
    r.columns.forEach((c) => {
      const v = T.display(row[c.index]).trim();
      if (!v) return;
      n++;
      if (set.has(lower(v))) m++;
    });
    if (!n || m / n < 0.8) return false;
    X.ws.updateSettings(src.id, { header: 'yes', headerRows: 1 });
    return true;
  }

  /** base（先にあるシート）に incoming を順に足したときの違い */
  function diffs(base, incoming) {
    const names = [];
    base.forEach((s) => X.plan.namesOf(s).forEach((n) => { if (!names.some((x) => lower(x) === lower(n))) names.push(n); }));
    return incoming.map((src) => {
      alignHeader(src, names);
      const d = X.plan.compare(names, src);
      d.added.forEach((n) => names.push(n));
      return { src, d };
    });
  }

  const tags = (list, cls) => h('span', { class: 'merge-cols' }, list.map((n) => h('span', { class: 'tag ' + cls, text: n })));

  function diffView(name, items) {
    return h('div', { class: 'merge-msg' },
      h('p', null, '「', h('b', { text: name }), '」に次のシートをまとめます。列の数または名前が違います。'),
      items.filter((x) => X.plan.hasDiff(x.d)).map(({ src, d }) => h('div', { class: 'merge-item' },
        h('div', { class: 'merge-src' }, icon('file-lines'), h('b', { text: labelOf(src) }),
          d.from !== d.to ? h('span', { class: 'tag tag-warn' }, icon('triangle-exclamation'), '列の数が違います（' + d.from + ' 列 → ' + d.to + ' 列）') : null),
        d.added.length ? h('div', { class: 'merge-line' }, icon('plus'), h('span', { text: '末尾に追加する列：' }), tags(d.added, 'tag-add'),
          h('small', { text: 'ほかのシートの行では空欄になります' })) : null,
        d.missing.length ? h('div', { class: 'merge-line' }, icon('minus'), h('span', { text: 'このシートにない列：' }), tags(d.missing, 'tag-miss'),
          h('small', { text: 'このシートの行では空欄になります' })) : null)),
      h('p', { class: 'note' }, icon('circle-info'), '列は名前で合わせます。追加する側のヘッダー行は取り込みません。'));
  }

  function ask(name, items) {
    return new Promise((resolve) => {
      let ok = false;
      ui.modal('列が違うシートをまとめます', diffView(name, items), {
        icon: 'object-group', width: 'var(--w-modal-md)', onClose: () => resolve(ok),
        actions: [
          { label: 'やめる', run: () => {} },
          { label: '列を追加してまとめる', primary: true, icon: 'object-group', run: () => { ok = true; } },
        ],
      });
    });
  }

  /** ids のシートのテーブル名を name にする。ほかのシートと重なれば、違いを確かめてからまとめる */
  let asking = false; // 確認のメッセージを出している間は、同じ操作を重ねて受け付けない
  async function setTableName(ids, name) {
    if (asking) return false;
    name = X.ws.sanitizeTable(name);
    const all = X.ws.sources();
    const members = all.filter((s) => s.include && (ids.includes(s.id) || lower(s.tableName) === lower(name)));
    const base = members.filter((s) => !ids.includes(s.id));
    const incoming = members.filter((s) => ids.includes(s.id));
    if (!base.length) base.push(incoming.shift());
    if (!incoming.length) { ids.forEach((id) => X.ws.setTableName(id, name)); return true; }

    const items = diffs(base, incoming);
    if (items.some((x) => X.plan.hasDiff(x.d))) {
      asking = true;
      const ok = await ask(name, items).finally(() => { asking = false; });
      if (!ok) { X.shell.render(); return false; } // 入力欄を元の名前に戻す
    }
    ids.forEach((id) => X.ws.setTableName(id, name));
    ui.toast('「' + name + '」に ' + (base.length + incoming.length) + ' 件をまとめました（追加する側のヘッダー行は取り込みません）', 'ok');
    return true;
  }

  /** 読み込んだシートが、既にあるテーブルと同じ名前になったとき（プリセットなど）に知らせる */
  function afterLoad(files) {
    const newIds = new Set(files.flatMap((f) => f.sourceIds));
    const groups = new Map();
    X.ws.included().forEach((s) => {
      if (!newIds.has(s.id)) return;
      const base = X.ws.included().filter((x) => !newIds.has(x.id) && lower(x.tableName) === lower(s.tableName));
      if (!base.length) return;
      const key = lower(s.tableName);
      if (!groups.has(key)) groups.set(key, { base, incoming: [] });
      groups.get(key).incoming.push(s);
    });
    groups.forEach(({ base, incoming }) => {
      const name = base[0].tableName;
      const items = diffs(base, incoming);
      if (!items.some((x) => X.plan.hasDiff(x.d))) {
        ui.toast('既にある「' + name + '」に結合しました（追加する側のヘッダー行は取り込みません）', 'ok');
        return;
      }
      ui.modal('列が違うシートを結合しました', diffView(name, items), {
        icon: 'object-group', width: 'var(--w-modal-md)',
        actions: [
          { label: '別のテーブルにする', icon: 'scissors', run: () => incoming.forEach((s) => X.ws.setTableName(s.id, s.tableName + '_' + X.util.baseName(s.fileName))) },
          { label: '列を追加して結合する', primary: true, icon: 'check', run: () => {} },
        ],
      });
    });
  }

  X.merge = { setTableName, afterLoad, alignHeader };
})(window.X2S);

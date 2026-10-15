/* =========================================================
   js/io/readers.js : 読み込み形式の登録簿と、ファイルの読み込み窓口
   形式を増やすときは js/io/readers/ に 1 ファイル足して X.readers.register() するだけ。
   reader = { id, label, exts:[拡張子], read(file|{name,bytes}) → Promise<[{label, grid, merges, fixed, include}]> }
   ========================================================= */
(function (X) {
  'use strict';
  const list = [];

  function register(reader) { list.push(reader); }
  function find(name) {
    const ext = X.util.extOf(name);
    return list.find((r) => r.exts.includes(ext)) || list.find((r) => r.fallback) || null;
  }
  function accept() { return list.flatMap((r) => r.exts.map((e) => '.' + e)).join(','); }

  /** ファイル（複数）を読み込んでワークスペースへ。sample = true ならサンプル扱い */
  async function load(fileList, opts) {
    opts = opts || {};
    const arr = Array.from(fileList || []);
    const added = [];
    for (let i = 0; i < arr.length; i++) {
      const f = arr[i];
      const reader = find(f.name);
      if (!reader) { X.ui.toast('読み込めない形式です：' + f.name, 'err'); continue; }
      X.ui.busy.show('読み込み中：' + f.name + (arr.length > 1 ? '（' + (i + 1) + ' / ' + arr.length + '）' : ''));
      await X.util.nextFrame();
      try {
        const sheets = await reader.read(f);
        if (!sheets.length) { X.ui.toast('データがありません：' + f.name, 'warn'); continue; }
        added.push(X.ws.addFile({ name: f.name, kind: reader.id, size: f.size, sample: opts.sample }, sheets));
      } catch (e) {
        console.error(e);
        X.ui.toast('読み込みに失敗しました：' + f.name + '（' + e.message + '）', 'err');
      } finally {
        X.ui.busy.hide();
      }
    }
    if (added.length) {
      // 今回読み込んだ最初のシートを表示する
      const first = added[0].sourceIds.find((id) => X.ws.source(id).include) || added[0].sourceIds[0];
      if (first) X.ws.setActive(first);
      X.merge.afterLoad(added);
      const n = added.reduce((s, f) => s + f.sourceIds.length, 0);
      X.ui.toast(added.length + ' 件のファイル（' + n + ' シート）を読み込みました', 'ok');
    }
    return added;
  }

  /** 貼り付けた文字（Excel の範囲コピー＝タブ区切り）を読み込む */
  let pasteSeq = 0;
  function loadText(text) {
    const grid = X.csv.parse(text, '\t');
    if (!grid.length) return null;
    pasteSeq++;
    const file = X.ws.addFile({ name: '貼り付け' + pasteSeq + '.tsv', kind: 'paste', size: text.length }, [{ label: '貼り付け' + pasteSeq, grid }]);
    X.ui.toast('貼り付けた範囲を読み込みました（' + X.util.fmt.num(grid.length) + ' 行）', 'ok');
    return file;
  }

  X.readers = { register, find, accept, load, loadText };
})(window.X2S);

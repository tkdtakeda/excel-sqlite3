/* =========================================================
   js/sample/sample.js : 動作確認用のサンプルデータ（パターン別）
   ファイルをその場で作り、通常の読み込みと同じ道を通す（sample 印付き）。
   「サンプルのみクリア」は、この印の付いたファイルだけを外す。
   パターンを増やすときは PATTERNS に 1 件足す。
   ========================================================= */
(function (X) {
  'use strict';

  /* ---------- 小道具 ---------- */
  function rng(seed) {
    let s = seed >>> 0;
    return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; };
  }
  const pick = (rand, arr) => arr[Math.floor(rand() * arr.length)];
  const day = (y, m, d) => new Date(y, m - 1, d);
  const addDays = (d, n) => new Date(d.getFullYear(), d.getMonth(), d.getDate() + n);
  const pad = (n, w) => String(n).padStart(w, '0');

  function xlsxFile(name, sheets, hidden) {
    const XLSX = window.XLSX;
    const wb = XLSX.utils.book_new();
    sheets.forEach((s) => {
      const ws = XLSX.utils.aoa_to_sheet(s.aoa, { cellDates: true });
      if (s.merges) ws['!merges'] = s.merges;
      XLSX.utils.book_append_sheet(wb, ws, s.name);
    });
    if (hidden) wb.Workbook = { Sheets: sheets.map((s) => ({ Hidden: hidden.includes(s.name) ? 1 : 0 })) };
    const buf = XLSX.write(wb, { type: 'array', bookType: 'xlsx' });
    return new File([buf], name, { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
  }
  const mg = (r1, c1, r2, c2) => ({ s: { r: r1, c: c1 }, e: { r: r2, c: c2 } });

  const STORES = [['001', '本店'], ['002', '駅前店'], ['003', '北口店'], ['010', '郊外店']];
  const ITEMS = [['コーヒー豆', 1200], ['紅茶', 800], ['クッキー', 450], ['マグカップ', 1500], ['ドリップバッグ', 600]];

  /* ---------- パターン ---------- */
  const PATTERNS = [
    {
      id: 'basic', icon: 'fa-regular fa-file-excel', title: '基本の表', file: '社員名簿.xlsx',
      desc: '1 行目がヘッダーの素直な表。日付・整数・コード（文字）の型の推定を確認できます。',
      make() {
        const rand = rng(1);
        const depts = ['営業部', '総務部', '開発部', '製造部'];
        const fam = ['佐藤', '鈴木', '高橋', '田中', '伊藤', '渡辺', '山本', '中村'];
        const giv = ['一郎', '花子', '健', '美咲', '翔', '陽菜', '大輔', '結衣'];
        const aoa = [['社員番号', '氏名', '部署', '入社日', '年齢', '月給']];
        for (let i = 1; i <= 40; i++) {
          aoa.push(['E' + pad(i, 4), pick(rand, fam) + ' ' + pick(rand, giv), pick(rand, depts), day(2010 + Math.floor(rand() * 16), 4, 1), 22 + Math.floor(rand() * 40), 220000 + Math.floor(rand() * 30) * 5000]);
        }
        return xlsxFile(this.file, [{ name: '社員名簿', aoa }]);
      },
    },
    {
      id: 'offset', icon: 'fa-regular fa-file-excel', title: 'タイトル行あり・B5 から始まる表', file: '売上報告.xlsx',
      desc: 'タイトル・作成日の行を飛ばし、開始位置（B5）を自動で見つけます。店舗コード「001」は先頭の 0 を残します。',
      make() {
        const rand = rng(2);
        const aoa = [['2026年度 売上報告'], ['作成日：2026/10/15'], ['単位：円'], []];
        aoa.push([null, '日付', '店舗コード', '店舗名', '商品', '数量', '単価', '金額（税込）']);
        let d = day(2026, 9, 1);
        for (let i = 0; i < 150; i++) {
          const st = pick(rand, STORES), it = pick(rand, ITEMS), q = 1 + Math.floor(rand() * 9);
          aoa.push([null, d, st[0], st[1], it[0], q, it[1], Math.round(q * it[1] * 1.08 * 100) / 100]);
          if (rand() < 0.3) d = addDays(d, 1);
        }
        return xlsxFile(this.file, [{ name: '売上', aoa, merges: [mg(0, 0, 0, 7)] }]);
      },
    },
    {
      id: 'noheader', icon: 'fa-regular fa-file-excel', title: 'ヘッダーなし', file: '作業ログ.xlsx',
      desc: '1 行目からデータの表。ヘッダーなしと判定し、列名は col1, col2 … になります。日時の列も確認できます。',
      make() {
        const rand = rng(3);
        const aoa = [];
        let t = new Date(2026, 9, 1, 8, 30, 0);
        for (let i = 1; i <= 60; i++) {
          aoa.push(['L' + pad(i, 5), new Date(t), pick(rand, ['INFO', 'INFO', 'WARN', 'ERROR']), Math.round(rand() * 5000) / 100, pick(rand, ['受付完了', '再送信', '在庫照会', 'タイムアウト'])]);
          t = new Date(t.getTime() + Math.floor(rand() * 3600) * 1000);
        }
        return xlsxFile(this.file, [{ name: 'ログ', aoa }]);
      },
    },
    {
      id: 'gaps', icon: 'fa-regular fa-file-excel', title: '途中の空行・合計行・注記', file: '在庫表.xlsx',
      desc: '途中に 1 行の空行（続けて読む）、直後に「合計」行、2 行空けて注記（読まない）。合計行は「末尾から 1 行を除く」で外せます。',
      make() {
        const rand = rng(4);
        const aoa = [['品番', '品名', '倉庫', '在庫数', '単価']];
        let sum = 0;
        for (let i = 1; i <= 30; i++) {
          if (i === 12) aoa.push([]);
          const q = Math.floor(rand() * 300);
          sum += q;
          aoa.push(['P-' + pad(i, 3), pick(rand, ['ボルト', 'ナット', 'ワッシャー', 'ばね', 'ピン']) + ' ' + (i * 2) + 'mm', pick(rand, ['第1倉庫', '第2倉庫']), q, Math.round(rand() * 500) / 10]);
        }
        aoa.push(['合計', null, null, sum, null], [], [], ['※ 在庫数は月末時点の数です'], ['※ 単価は税抜です']);
        return xlsxFile(this.file, [{ name: '在庫', aoa }]);
      },
    },
    {
      id: 'multiheader', icon: 'fa-regular fa-file-excel', title: '2 段のヘッダー・結合セル', file: '成績表.xlsx',
      desc: '「得点」の下に国語・数学・英語がある 2 段のヘッダー（→「得点_国語」）。データ部分の結合セル（クラス）は値を埋めます。',
      make() {
        const rand = rng(5);
        const aoa = [['2026年度 前期 成績表'], [], ['クラス', '出席番号', '氏名', '得点', null, null, '合計', '提出日'], [null, null, null, '国語', '数学', '英語', null, null]];
        const merges = [mg(0, 0, 0, 7), mg(2, 0, 3, 0), mg(2, 1, 3, 1), mg(2, 2, 3, 2), mg(2, 3, 2, 5), mg(2, 6, 3, 6), mg(2, 7, 3, 7)];
        const names = ['青木', '石田', '上野', '江藤', '大野', '加藤', '木村', '工藤', '小池', '斎藤', '清水', '鈴木', '関', '園田', '高田'];
        names.forEach((n, i) => {
          const k = 40 + Math.floor(rand() * 60), s = 40 + Math.floor(rand() * 60), e = 40 + Math.floor(rand() * 60);
          aoa.push([i % 5 === 0 ? (Math.floor(i / 5) + 1) + '組' : null, (i % 5) + 1, n, k, s, e, k + s + e, day(2026, 7, 10 + (i % 5))]);
          if (i % 5 === 0) merges.push(mg(4 + i, 0, 8 + i, 0));
        });
        return xlsxFile(this.file, [{ name: '成績', aoa, merges }]);
      },
    },
    {
      id: 'monthly', icon: 'fa-regular fa-file-excel', title: '複数シート（月別）', file: '月次売上.xlsx',
      desc: '同じ形の 3 シート（8〜10 月）と非表示のメモ。「出力」に「まとめ候補」が出て、1 つのテーブルに結合できます。',
      make() {
        const rand = rng(6);
        const sheets = [8, 9, 10].map((m) => {
          const aoa = [['日付', '店舗コード', '売上金額', '客数']];
          for (let d = 1; d <= 28; d++) STORES.slice(0, 2).forEach((st) => aoa.push([day(2026, m, d), st[0], 30000 + Math.floor(rand() * 90000), 20 + Math.floor(rand() * 80)]));
          return { name: '2026-' + pad(m, 2), aoa };
        });
        sheets.push({ name: 'メモ', aoa: [['このシートは非表示です']] });
        return xlsxFile(this.file, sheets, ['メモ']);
      },
    },
    {
      id: 'sjis', icon: 'fa-solid fa-file-csv', title: 'Shift_JIS の CSV', file: '顧客一覧_SJIS.csv',
      desc: 'Excel で保存した Shift_JIS の CSV。文字コードを自動で判定します。引用符・桁区切りのカンマ（"1,200,000"）も扱えます。',
      make() {
        const b64 = 'jNqLcYNSgVuDaCyM2otxlrwsk3OTuZV7jKcsklOTlo7SLJNvmF6T+iyXXpBNjMCTeIp6DQpDMDAwMSyOUpNjj6STWCyTjIuek3MskMKW2CwyMDI1LzEvMSw1MDAwMDANCkMwMDAyLJfpltiNSIvGLJHljeOVeyyQzojkLDIwMjUvMi80LDEwMDAwMDANCkMwMDAzLI2yk6GVqI5ZLIikkm2MpyyP45NjLDIwMjUvMy83LDE1MDAwMDANCkMwMDA0LI2Ci7SQu43sj4oslZ+JqoynLImqlnssMjAyNS80LzEwLDIwMDAwMDANCkMwMDk5LCKKlI6uie+O0CAiIoNlg1iDZyIiIiyTjIuek3MskMKW2CwyMDI1LzQvMSwiMSwyMDAsMDAwIg0KQzAwMDUsk2OShpNki0AslmuKQ5O5LJDCltgsMjAyNS81LzEzLDI1MDAwMDANCkMwMDA2LIjJk6GQSJVpLJBfk96Q7IynLJDOiOQsMjAyNS82LzE2LDMwMDAwMDANCkMwMDA3LJNuldOMmpDdLJOMi56TcyyP45NjLDIwMjUvNy8xOSwzNTAwMDAwDQpDMDAwOCyShpG6iV6XQSyR5Y3jlXssiaqWeywyMDI1LzgvMjIsNDAwMDAwMA0KQzAwMDksj6yX0ZbylWksiKSSbYynLJDCltgsMjAyNS85LzI1LDQ1MDAwMDANCkMwMDEwLInBk6GI8438LJWfiaqMpyyQzojkLDIwMjUvMTAvMjgsNTAwMDAwMA0KQzAwMTEsi2eTY5FAiNsslmuKQ5O5LI/jk2MsMjAyNS8xMS8zLDU1MDAwMDANCkMwMDEyLI5SlnuQuItALJBfk96Q7IynLImqlnssMjAyNS8xMi82LDYwMDAwMDANCg==';
        const bin = atob(b64);
        const bytes = new Uint8Array(bin.length);
        for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
        return new File([bytes], this.file, { type: 'text/csv' });
      },
    },
    {
      id: 'sqlite', icon: 'fa-solid fa-database', title: 'SQLite ファイル（マスタ）', file: '店舗マスタ.sqlite',
      desc: '既にある SQLite を読み込み、Excel の表と 1 つの DB にまとめます。SQL で「売上」と JOIN して確かめられます。',
      async make() {
        const bytes = await X.engine.call('makeDb', { tables: [
          { name: '店舗', columns: [{ name: '店舗コード', type: 'TEXT' }, { name: '店舗名', type: 'TEXT' }, { name: '地域', type: 'TEXT' }, { name: '開店日', type: 'DATE' }],
            rows: [['001', '本店', '東京', '2001-04-01'], ['002', '駅前店', '東京', '2010-10-10'], ['003', '北口店', '埼玉', '2015-07-01'], ['010', '郊外店', '千葉', '2022-03-15']] },
          { name: '商品', columns: [{ name: '商品', type: 'TEXT' }, { name: '分類', type: 'TEXT' }, { name: '標準単価', type: 'INTEGER' }],
            rows: ITEMS.map((it, i) => [it[0], i < 2 ? '飲料' : i === 3 ? '雑貨' : '菓子', it[1]]) },
        ] });
        return new File([bytes], this.file, { type: 'application/x-sqlite3' });
      },
    },
    {
      id: 'large', icon: 'fa-solid fa-file-csv', title: '大量データ（12 万行）', file: '大量データ_12万行.csv',
      desc: '10 万行を超える CSV。読み込み・SQLite の作成・SQL の速さを確かめられます（数秒かかります）。',
      make() {
        const rand = rng(7);
        const lines = ['伝票番号,日時,店舗コード,商品,数量,金額'];
        let t = new Date(2026, 0, 1, 9, 0, 0).getTime();
        for (let i = 1; i <= 120000; i++) {
          const it = pick(rand, ITEMS), q = 1 + Math.floor(rand() * 5);
          const d = new Date(t);
          lines.push(i + ',' + d.getFullYear() + '-' + pad(d.getMonth() + 1, 2) + '-' + pad(d.getDate(), 2) + ' ' + pad(d.getHours(), 2) + ':' + pad(d.getMinutes(), 2) + ':00,' + pick(rand, STORES)[0] + ',' + it[0] + ',' + q + ',' + q * it[1]);
          t += 60000 + Math.floor(rand() * 120000);
        }
        return new File([lines.join('\r\n')], this.file, { type: 'text/csv' });
      },
    },
  ];

  async function load(ids) {
    const list = PATTERNS.filter((p) => ids.includes(p.id));
    X.ui.busy.show('サンプルを作成中…');
    let files;
    try {
      files = [];
      for (const p of list) files.push(await p.make());
    } catch (e) {
      X.ui.toast('サンプルを作れませんでした：' + e.message, 'err');
      return;
    } finally {
      X.ui.busy.hide();
    }
    await X.readers.load(files, { sample: true });
    X.shell.showView('preview');
  }

  X.samples = { PATTERNS, load };
})(window.X2S);

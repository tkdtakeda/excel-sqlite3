/* =========================================================
   js/ui/vgrid.js : 大量の行・列でも軽い表（見えている範囲だけ描く）
   プレビュー（シートそのまま）と SQL の結果の両方で使う。

   const g = new X.VGrid(host, { onCellClick(r, c, ev) })
   g.setModel({
     rows, cols,
     colWidth(c) → px,
     headHtml(c) → HTML 文字列（呼び出し側でエスケープする）,
     rowLabel(r) → 文字, rowClass(r) → class, cell(r, c) → 文字, cellClass(r, c) → class
   })
   ========================================================= */
(function (X) {
  'use strict';
  const { h } = X.util;
  const ESC = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' };
  const esc = (s) => String(s).replace(/[&<>"]/g, (m) => ESC[m]);
  const OVERSCAN = 8;

  class VGrid {
    constructor(host, opts) {
      this.opts = opts || {};
      this.rh = 26;
      this.model = null;
      this.offsets = [0];
      this.el = h('div', { class: 'vg', tabindex: '0' });
      this.head = h('div', { class: 'vg-head' });
      this.body = h('div', { class: 'vg-body' });
      this.el.append(this.head, this.body);
      host.appendChild(this.el);
      this.raf = 0;
      this.last = '';
      this.el.addEventListener('scroll', () => this.schedule());
      new ResizeObserver(() => this.schedule()).observe(this.el);
      this.body.addEventListener('click', (e) => {
        const c = e.target.closest('.vg-c');
        if (c && this.opts.onCellClick) this.opts.onCellClick(+c.dataset.r, +c.dataset.c, e);
      });
      this.head.addEventListener('click', (e) => {
        const c = e.target.closest('.vg-hc');
        if (c && this.opts.onHeadClick) this.opts.onHeadClick(+c.dataset.c, e);
      });
    }

    setModel(model, keepScroll) {
      this.model = model;
      const w = [0];
      for (let c = 0; c < model.cols; c++) w.push(w[c] + model.colWidth(c));
      this.offsets = w;
      const rn = model.rowNumWidth || 56;
      this.rn = rn;
      const total = rn + w[model.cols];
      this.head.style.width = total + 'px';
      this.body.style.width = total + 'px';
      this.body.style.height = model.rows * this.rh + 'px';
      if (!keepScroll) { this.el.scrollTop = 0; this.el.scrollLeft = 0; }
      this.last = '';
      this.draw();
    }

    refresh() { this.last = ''; this.draw(); }

    schedule() {
      if (this.raf) return;
      this.raf = requestAnimationFrame(() => { this.raf = 0; this.draw(); });
    }

    /** 列の表示範囲 [c0, c1] */
    colRange() {
      const left = this.el.scrollLeft, right = left + this.el.clientWidth - this.rn;
      const off = this.offsets, n = this.model.cols;
      let c0 = 0;
      while (c0 < n - 1 && off[c0 + 1] < left) c0++;
      let c1 = c0;
      while (c1 < n - 1 && off[c1] < right) c1++;
      return [Math.max(0, c0 - 2), Math.min(n - 1, c1 + 2)];
    }

    draw() {
      const m = this.model;
      if (!m) return;
      const top = this.el.scrollTop, height = this.el.clientHeight;
      const r0 = Math.max(0, Math.floor(top / this.rh) - OVERSCAN);
      const r1 = Math.min(m.rows - 1, Math.ceil((top + height) / this.rh) + OVERSCAN);
      const [c0, c1] = m.cols ? this.colRange() : [0, -1];
      const key = r0 + ':' + r1 + ':' + c0 + ':' + c1;
      if (key === this.last) return;
      this.last = key;
      const pad = this.offsets[c0] || 0;

      let hh = '<div class="vg-corner" style="width:' + this.rn + 'px"></div><div class="vg-pad" style="width:' + pad + 'px"></div>';
      for (let c = c0; c <= c1; c++) hh += '<div class="vg-hc" data-c="' + c + '" style="width:' + m.colWidth(c) + 'px">' + m.headHtml(c) + '</div>';
      this.head.innerHTML = hh;

      let bh = '';
      for (let r = r0; r <= r1; r++) {
        bh += '<div class="vg-row ' + (m.rowClass ? m.rowClass(r) : '') + '" style="top:' + r * this.rh + 'px">' +
          '<div class="vg-rn" style="width:' + this.rn + 'px">' + esc(m.rowLabel(r)) + '</div><div class="vg-pad" style="width:' + pad + 'px"></div>';
        for (let c = c0; c <= c1; c++) {
          const t = m.cell(r, c);
          const cls = m.cellClass ? m.cellClass(r, c) : '';
          bh += '<div class="vg-c ' + cls + '" data-r="' + r + '" data-c="' + c + '" style="width:' + m.colWidth(c) + 'px"' + (t.length > 20 ? ' title="' + esc(t) + '"' : '') + '>' + esc(t) + '</div>';
        }
        bh += '</div>';
      }
      this.body.innerHTML = bh;
    }

    scrollToCell(r, c) {
      const y = r * this.rh, x = this.offsets[c] || 0;
      const el = this.el;
      if (y < el.scrollTop || y > el.scrollTop + el.clientHeight - 3 * this.rh) el.scrollTop = Math.max(0, y - 3 * this.rh);
      if (x < el.scrollLeft || x > el.scrollLeft + el.clientWidth - this.rn - 120) el.scrollLeft = Math.max(0, x - 40);
    }
  }

  /** 文字数から列の幅を決める（先頭 200 行を見る） */
  VGrid.measure = function (texts, min, max) {
    let len = 0;
    for (const t of texts) {
      let w = 0;
      for (let i = 0; i < t.length && w < 80; i++) w += t.charCodeAt(i) > 255 ? 2 : 1;
      if (w > len) len = w;
    }
    return Math.max(min || 64, Math.min(max || 260, len * 7 + 18));
  };

  VGrid.esc = esc;
  X.VGrid = VGrid;
})(window.X2S);

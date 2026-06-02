class MiniPdf {
  constructor() {
    this.width = 595;
    this.height = 842;
    this.margin = 48;
    this.x = this.margin;
    this.y = this.height - this.margin;
    this.pages = [];
    this.current = [];
  }

  _ascii(value) {
    return Normalizer.stripAccents(value === null || value === undefined ? '' : String(value))
      .replace(/[^\x20-\x7e]/g, '');
  }

  _escape(value) {
    return value.replace(/\\/g, '\\\\').replace(/\(/g, '\\(').replace(/\)/g, '\\)');
  }

  _ensure(space) {
    if (this.y - space < this.margin) this._flush();
  }

  _flush() {
    this.pages.push(this.current.join('\n'));
    this.current = [];
    this.y = this.height - this.margin;
  }

  _draw(text, x, y, size, bold) {
    const font = bold ? '/F2' : '/F1';
    this.current.push('BT ' + font + ' ' + size + ' Tf ' + x + ' ' + y + ' Td (' + this._escape(this._ascii(text)) + ') Tj ET');
  }

  heading(text) {
    this._ensure(28);
    this._draw(text, this.margin, this.y, 16, true);
    this.y -= 24;
  }

  subtitle(text) {
    this._ensure(16);
    this._draw(text, this.margin, this.y, 9, false);
    this.y -= 18;
  }

  section(text) {
    this._ensure(24);
    this.y -= 6;
    this._draw(text, this.margin, this.y, 11, true);
    this.y -= 16;
  }

  text(line) {
    this._ensure(14);
    const wrapped = this._wrap(line, 95);
    for (const part of wrapped) {
      this._ensure(13);
      this._draw(part, this.margin, this.y, 9, false);
      this.y -= 13;
    }
  }

  _wrap(line, max) {
    const words = this._ascii(line).split(' ');
    const out = [];
    let cur = '';
    for (const w of words) {
      if ((cur + ' ' + w).trim().length > max) {
        if (cur) out.push(cur);
        cur = w;
      } else {
        cur = (cur + ' ' + w).trim();
      }
    }
    if (cur) out.push(cur);
    return out.length ? out : [''];
  }

  table(columns, rows) {
    const usable = this.width - this.margin * 2;
    const totalW = columns.reduce((s, c) => s + c.width, 0);
    const scale = usable / totalW;
    const xs = [];
    let acc = this.margin;
    for (const c of columns) {
      xs.push(acc);
      acc += c.width * scale;
    }
    this._ensure(16);
    columns.forEach((c, i) => this._draw(this._fit(c.label, c.width * scale), xs[i], this.y, 8, true));
    this.y -= 12;
    for (const row of rows) {
      this._ensure(12);
      if (this.y - 12 < this.margin) {
        this._flush();
        columns.forEach((c, i) => this._draw(this._fit(c.label, c.width * scale), xs[i], this.y, 8, true));
        this.y -= 12;
      }
      row.forEach((cell, i) => {
        if (i < columns.length) this._draw(this._fit(cell, columns[i].width * scale), xs[i], this.y, 8, false);
      });
      this.y -= 11;
    }
    this.y -= 6;
  }

  _fit(value, pxWidth) {
    const s = this._ascii(value);
    const maxChars = Math.max(1, Math.floor(pxWidth / 4.4));
    if (s.length <= maxChars) return s;
    return s.substring(0, Math.max(1, maxChars - 1)) + '.';
  }

  build() {
    if (this.current.length) this._flush();
    if (!this.pages.length) this.pages.push('');

    const objects = [];
    const fontRegular = '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>';
    const fontBold = '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>';

    const pageCount = this.pages.length;
    const kidsBase = 3;
    const kids = [];
    for (let i = 0; i < pageCount; i++) kids.push((kidsBase + i * 2) + ' 0 R');

    objects[1] = '<< /Type /Catalog /Pages 2 0 R >>';
    objects[2] = '<< /Type /Pages /Kids [' + kids.join(' ') + '] /Count ' + pageCount + ' >>';

    let fontRegObj = kidsBase + pageCount * 2;
    let fontBoldObj = fontRegObj + 1;

    for (let i = 0; i < pageCount; i++) {
      const pageObj = kidsBase + i * 2;
      const contentObj = pageObj + 1;
      const stream = this.pages[i];
      objects[pageObj] = '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ' + this.width + ' ' + this.height +
        '] /Resources << /Font << /F1 ' + fontRegObj + ' 0 R /F2 ' + fontBoldObj + ' 0 R >> >> /Contents ' + contentObj + ' 0 R >>';
      objects[contentObj] = '<< /Length ' + stream.length + ' >>\nstream\n' + stream + '\nendstream';
    }
    objects[fontRegObj] = fontRegular;
    objects[fontBoldObj] = fontBold;

    let pdf = '%PDF-1.4\n';
    const offsets = [];
    for (let i = 1; i < objects.length; i++) {
      offsets[i] = pdf.length;
      pdf += i + ' 0 obj\n' + objects[i] + '\nendobj\n';
    }
    const xrefStart = pdf.length;
    const count = objects.length;
    pdf += 'xref\n0 ' + count + '\n';
    pdf += '0000000000 65535 f \n';
    for (let i = 1; i < count; i++) {
      pdf += this._pad(offsets[i]) + ' 00000 n \n';
    }
    pdf += 'trailer\n<< /Size ' + count + ' /Root 1 0 R >>\nstartxref\n' + xrefStart + '\n%%EOF';
    return pdf;
  }

  _pad(n) {
    let s = String(n);
    while (s.length < 10) s = '0' + s;
    return s;
  }
}

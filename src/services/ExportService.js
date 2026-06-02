class ExportService {
  download(filename, blob) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  exportCSV(filename, columns, rows) {
    const head = columns.map((c) => this._csvCell(c.label)).join(';');
    const body = rows.map((row) => columns.map((c) => this._csvCell(this._raw(row, c))).join(';'));
    const content = '﻿' + [head].concat(body).join('\r\n');
    this.download(filename, new Blob([content], { type: 'text/csv;charset=utf-8;' }));
  }

  _raw(row, column) {
    const value = column.value(row);
    if (value === null || value === undefined) return '';
    if (typeof value === 'number') return String(value).replace('.', ',');
    return value;
  }

  _csvCell(value) {
    const s = value === null || value === undefined ? '' : String(value);
    if (/[";\n]/.test(s)) return '"' + s.replace(/"/g, '""') + '"';
    return s;
  }

  exportXLSX(filename, columns, rows, sheetName) {
    const name = sheetName || 'Análise';
    const sheetXml = this._sheetXml(columns, rows);
    const zip = new MiniZip();
    zip.add('[Content_Types].xml', ExportService.CONTENT_TYPES);
    zip.add('_rels/.rels', ExportService.ROOT_RELS);
    zip.add('xl/workbook.xml', this._workbookXml(name));
    zip.add('xl/_rels/workbook.xml.rels', ExportService.WB_RELS);
    zip.add('xl/worksheets/sheet1.xml', sheetXml);
    this.download(filename, new Blob([zip.build()], {
      type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
    }));
  }

  _workbookXml(name) {
    return '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
      '<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" ' +
      'xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">' +
      '<sheets><sheet name="' + this._xml(name.substring(0, 28)) + '" sheetId="1" r:id="rId1"/></sheets></workbook>';
  }

  _sheetXml(columns, rows) {
    const lines = [];
    lines.push('<?xml version="1.0" encoding="UTF-8" standalone="yes"?>');
    lines.push('<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">');
    lines.push('<sheetData>');
    lines.push(this._row(1, columns.map((c) => ({ t: 'text', v: c.label }))));
    rows.forEach((row, i) => {
      const cells = columns.map((c) => {
        const value = c.value(row);
        if (typeof value === 'number' && isFinite(value)) return { t: 'number', v: value };
        return { t: 'text', v: value === null || value === undefined ? '' : String(value) };
      });
      lines.push(this._row(i + 2, cells));
    });
    lines.push('</sheetData></worksheet>');
    return lines.join('');
  }

  _row(index, cells) {
    const parts = cells.map((cell, c) => {
      const ref = this._colName(c) + index;
      if (cell.t === 'number') return '<c r="' + ref + '"><v>' + cell.v + '</v></c>';
      return '<c r="' + ref + '" t="inlineStr"><is><t xml:space="preserve">' + this._xml(cell.v) + '</t></is></c>';
    });
    return '<row r="' + index + '">' + parts.join('') + '</row>';
  }

  _colName(index) {
    let n = index;
    let name = '';
    do {
      name = String.fromCharCode(65 + (n % 26)) + name;
      n = Math.floor(n / 26) - 1;
    } while (n >= 0);
    return name;
  }

  _xml(value) {
    return String(value)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  exportPDF(filename, report) {
    const pdf = new MiniPdf();
    pdf.heading(report.title);
    if (report.subtitle) pdf.subtitle(report.subtitle);
    report.sections.forEach((section) => {
      pdf.section(section.title);
      if (section.lines) section.lines.forEach((line) => pdf.text(line));
      if (section.table) pdf.table(section.table.columns, section.table.rows);
    });
    this.download(filename, new Blob([pdf.build()], { type: 'application/pdf' }));
  }
}

ExportService.CONTENT_TYPES =
  '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
  '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">' +
  '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>' +
  '<Default Extension="xml" ContentType="application/xml"/>' +
  '<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>' +
  '<Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>' +
  '</Types>';

ExportService.ROOT_RELS =
  '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
  '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
  '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>' +
  '</Relationships>';

ExportService.WB_RELS =
  '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
  '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
  '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/>' +
  '</Relationships>';

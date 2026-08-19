class GA4ImportService {
  parse(text) {
    if (!text || !text.trim()) {
      return { ok: false, error: 'Arquivo vazio.', rows: [], fields: {}, metrics: [] };
    }
    const lines = this._splitLines(text);
    if (!lines.length) {
      return { ok: false, error: 'Nenhuma linha encontrada.', rows: [], fields: {}, metrics: [] };
    }
    const headerIndex = this._findHeaderIndex(lines);
    if (headerIndex === -1) {
      return { ok: false, error: 'Cabeçalho não encontrado no arquivo.', rows: [], fields: {}, metrics: [] };
    }
    const delimiter = this._detectDelimiter(lines[headerIndex]);
    const header = this._parseLine(lines[headerIndex], delimiter).map(Normalizer.cleanSpaces);
    const fields = this._mapFields(header);
    if (fields.cidade === undefined) {
      return {
        ok: false,
        error: 'Coluna de cidade não identificada. Use um cabeçalho como "cidade,estado,sessoes,...".',
        rows: [],
        fields: {},
        metrics: []
      };
    }
    const rows = [];
    for (let i = headerIndex + 1; i < lines.length; i++) {
      const cols = this._parseLine(lines[i], delimiter);
      if (!cols.length || cols.every((c) => c.trim() === '')) continue;
      const row = this._buildRow(cols, fields);
      if (!row.cidade) continue;
      rows.push(row);
    }
    const metrics = ['sessoes', 'usuarios', 'conversoes', 'receita'].filter(
      (m) => fields[m] !== undefined && rows.some((r) => r[m] > 0)
    );
    const sourceHeaders = {};
    for (const field of Object.keys(fields)) {
      sourceHeaders[field] = header[fields[field]] || '';
    }
    const meta = this._extractMeta(lines.slice(0, headerIndex), delimiter);
    return { ok: true, rows: rows, fields: fields, metrics: metrics, sourceHeaders: sourceHeaders, meta: meta, delimiter: delimiter, header: header };
  }

  _extractMeta(preamble, delimiter) {
    const fmt = (d) => {
      const m = String(d).match(/^(\d{4})(\d{2})(\d{2})$/);
      return m ? m[3] + '/' + m[2] + '/' + m[1] : String(d);
    };
    const clean = preamble
      .map((l) => this._parseLine(l, delimiter)[0] || '')
      .map((l) => l.replace(/^#+\s*/, '').replace(/[\s,]+$/, '').trim())
      .filter((l) => l && !/^[-=_]+$/.test(l));
    const meta = { property: '', account: '', report: '', period: '', start: '', end: '' };
    const free = [];
    for (const line of clean) {
      let mm;
      if ((mm = line.match(/^property\s*:\s*(.+)/i))) meta.property = mm[1].trim();
      else if ((mm = line.match(/^account\s*:\s*(.+)/i))) meta.account = mm[1].trim();
      else if ((mm = line.match(/^start date\s*:\s*(\d{8})/i))) meta.start = fmt(mm[1]);
      else if ((mm = line.match(/^end date\s*:\s*(\d{8})/i))) meta.end = fmt(mm[1]);
      else if ((mm = line.match(/^(\d{8})\s*[-–]\s*(\d{8})$/))) { meta.start = fmt(mm[1]); meta.end = fmt(mm[2]); }
      else if (/^all users$/i.test(line)) { continue; }
      else free.push(line);
    }
    if (!meta.property && free.length) meta.property = free.shift();
    if (!meta.report && free.length) meta.report = free[0];
    meta.period = meta.start && meta.end ? meta.start + ' – ' + meta.end : (meta.start || meta.end || '');
    return (meta.property || meta.account || meta.period) ? meta : null;
  }

  _splitLines(text) {
    return text.replace(/^﻿/, '').replace(/\r\n/g, '\n').replace(/\r/g, '\n').split('\n').filter((l) => l.length > 0);
  }

  _findHeaderIndex(lines) {
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const first = line.replace(/^\s+/, '').charAt(0);
      if (first === '#' || first === '') continue;
      const norm = line.toLowerCase();
      const looksLikeHeader = /\b(cidade|city|munic|town|localidade)\b/.test(norm);
      const hasDelimiter = line.indexOf(',') !== -1 || line.indexOf(';') !== -1 || line.indexOf('\t') !== -1;
      if (looksLikeHeader || (hasDelimiter && !/^[0-9".,;\s-]+$/.test(line))) return i;
    }
    return -1;
  }

  _detectDelimiter(line) {
    const candidates = [
      { ch: ',', n: (line.match(/,/g) || []).length },
      { ch: ';', n: (line.match(/;/g) || []).length },
      { ch: '\t', n: (line.match(/\t/g) || []).length }
    ];
    candidates.sort((a, b) => b.n - a.n);
    return candidates[0].n > 0 ? candidates[0].ch : ',';
  }

  _parseLine(line, delimiter) {
    const out = [];
    let cur = '';
    let quoted = false;
    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      if (quoted) {
        if (ch === '"') {
          if (line[i + 1] === '"') {
            cur += '"';
            i++;
          } else {
            quoted = false;
          }
        } else {
          cur += ch;
        }
        continue;
      }
      if (ch === '"') {
        quoted = true;
        continue;
      }
      if (ch === delimiter) {
        out.push(cur);
        cur = '';
        continue;
      }
      cur += ch;
    }
    out.push(cur);
    return out.map((c) => c.trim());
  }

  _mapFields(header) {
    const fields = {};
    header.forEach((raw, index) => {
      const norm = Normalizer.normalizeName(raw);
      const field = this._matchField(norm);
      if (field && fields[field] === undefined) fields[field] = index;
    });
    return fields;
  }

  _matchField(norm) {
    for (const def of GA4ImportService.FIELD_DEFS) {
      for (const alias of def.aliases) {
        if (norm === alias || norm.indexOf(alias) !== -1) return def.field;
      }
    }
    return null;
  }

  _buildRow(cols, fields) {
    const get = (key) => (fields[key] !== undefined ? cols[fields[key]] : '');
    return {
      cidade: Normalizer.cleanSpaces(get('cidade')),
      estado: Normalizer.cleanSpaces(get('estado')),
      codigo: Normalizer.cleanSpaces(get('codigo')),
      source: this._source(get('source'), get('sourcemedium')),
      medium: this._medium(get('medium'), get('sourcemedium')),
      sessoes: this._number(get('sessoes')),
      engajadas: this._number(get('engajadas')),
      usuarios: this._number(get('usuarios')),
      conversoes: this._number(get('conversoes')),
      receita: this._number(get('receita'))
    };
  }

  _source(source, combined) {
    const s = Normalizer.cleanSpaces(source);
    if (s) return s;
    const c = Normalizer.cleanSpaces(combined);
    return c ? c.split('/')[0].trim() : '';
  }

  _medium(medium, combined) {
    const m = Normalizer.cleanSpaces(medium);
    if (m) return m;
    const c = Normalizer.cleanSpaces(combined);
    const parts = c.split('/');
    return parts.length > 1 ? parts.slice(1).join('/').trim() : '';
  }

  _number(value) {
    if (value === undefined || value === null) return 0;
    let s = String(value).replace(/[^\d.,-]/g, '').trim();
    if (!s) return 0;
    const hasComma = s.indexOf(',') !== -1;
    const hasDot = s.indexOf('.') !== -1;
    if (hasComma && hasDot) {
      if (s.lastIndexOf(',') > s.lastIndexOf('.')) {
        s = s.replace(/\./g, '').replace(',', '.');
      } else {
        s = s.replace(/,/g, '');
      }
    } else if (hasComma) {
      const parts = s.split(',');
      if (parts.length === 2 && parts[1].length !== 3) {
        s = parts[0] + '.' + parts[1];
      } else {
        s = s.replace(/,/g, '');
      }
    }
    const n = parseFloat(s);
    return isNaN(n) ? 0 : n;
  }
}

GA4ImportService.FIELD_DEFS = [
  { field: 'codigo', aliases: ['codigo ibge', 'cod ibge', 'ibge', 'codigo municipio', 'cod municipio'] },
  { field: 'cidade', aliases: ['cidade', 'municipio', 'city', 'town', 'localidade', 'town city'] },
  { field: 'estado', aliases: ['estado', 'state', 'uf', 'regiao', 'region', 'provincia'] },
  { field: 'sourcemedium', aliases: ['source medium', 'session source medium', 'first user source medium', 'origem midia'] },
  { field: 'source', aliases: ['session source', 'first user source', 'source', 'origem', 'fonte'] },
  { field: 'medium', aliases: ['session medium', 'first user medium', 'medium', 'midia', 'meio'] },
  { field: 'engajadas', aliases: ['sessoes engajadas', 'sessao engajada', 'engaged sessions', 'engaged session'] },
  { field: 'sessoes', aliases: ['sessoes', 'sessao', 'sessions', 'session', 'visitas'] },
  { field: 'usuarios', aliases: ['usuarios', 'usuario', 'users', 'user', 'total users', 'active users', 'visitantes'] },
  { field: 'conversoes', aliases: ['conversoes', 'conversao', 'conversions', 'conversion', 'key events', 'eventos principais', 'metas', 'ecommerce purchases', 'purchases', 'compras', 'transacoes', 'transactions'] },
  { field: 'receita', aliases: ['receita', 'revenue', 'faturamento', 'total revenue', 'purchase revenue', 'valor'] }
];

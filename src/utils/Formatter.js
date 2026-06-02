class Formatter {
  static integer(value) {
    if (value === null || value === undefined || isNaN(value)) return '—';
    return Math.round(value).toLocaleString('pt-BR');
  }

  static decimal(value, digits) {
    if (value === null || value === undefined || isNaN(value)) return '—';
    const d = digits === undefined ? 2 : digits;
    return Number(value).toLocaleString('pt-BR', {
      minimumFractionDigits: d,
      maximumFractionDigits: d
    });
  }

  static currency(value) {
    if (value === null || value === undefined || isNaN(value)) return '—';
    return Number(value).toLocaleString('pt-BR', {
      style: 'currency',
      currency: 'BRL',
      maximumFractionDigits: 0
    });
  }

  static currencyPrecise(value) {
    if (value === null || value === undefined || isNaN(value)) return '—';
    return Number(value).toLocaleString('pt-BR', {
      style: 'currency',
      currency: 'BRL',
      minimumFractionDigits: 2,
      maximumFractionDigits: 2
    });
  }

  static percent(value, digits) {
    if (value === null || value === undefined || isNaN(value)) return '—';
    const d = digits === undefined ? 2 : digits;
    return (Number(value) * 100).toLocaleString('pt-BR', {
      minimumFractionDigits: d,
      maximumFractionDigits: d
    }) + '%';
  }

  static mps(value) {
    if (value === null || value === undefined || isNaN(value)) return '—';
    return Formatter.decimal(value, 2);
  }

  static compact(value) {
    if (value === null || value === undefined || isNaN(value)) return '—';
    const abs = Math.abs(value);
    if (abs >= 1e9) return Formatter.decimal(value / 1e9, 1) + ' bi';
    if (abs >= 1e6) return Formatter.decimal(value / 1e6, 1) + ' mi';
    if (abs >= 1e3) return Formatter.decimal(value / 1e3, 1) + ' mil';
    return Formatter.integer(value);
  }

  static metricLabel(metric) {
    return Formatter.METRIC_LABELS[metric] || metric;
  }

  static metricValue(metric, value) {
    if (metric === 'receita') return Formatter.currency(value);
    return Formatter.integer(value);
  }

  static signedMultiplier(value) {
    if (value === null || value === undefined || isNaN(value)) return '—';
    return Formatter.decimal(value, 1) + '×';
  }
}

Formatter.METRIC_LABELS = {
  sessoes: 'Sessões',
  usuarios: 'Usuários',
  conversoes: 'Conversões',
  receita: 'Receita'
};

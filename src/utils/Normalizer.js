class Normalizer {
  static stripAccents(value) {
    if (value === null || value === undefined) return '';
    return String(value).normalize('NFD').replace(/[̀-ͯ]/g, '');
  }

  static normalizeName(value) {
    if (value === null || value === undefined) return '';
    return Normalizer.stripAccents(value)
      .toLowerCase()
      .replace(/['`´’ʼ]/g, '')
      .replace(/[^a-z0-9]+/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  }

  static cleanSpaces(value) {
    if (value === null || value === undefined) return '';
    return String(value).replace(/\s+/g, ' ').trim();
  }

  static normalizeUf(value) {
    if (value === null || value === undefined) return '';
    const raw = Normalizer.stripAccents(value).trim().toUpperCase();
    if (raw.length === 2 && Normalizer.SIGLAS.has(raw)) return raw;
    const key = Normalizer.normalizeName(value);
    if (Normalizer.NAME_TO_UF[key]) return Normalizer.NAME_TO_UF[key];
    let stripped = key
      .replace(/^state of /, '')
      .replace(/^estado d[eoa] /, '')
      .replace(/ state$/, '');
    if (stripped === 'federal district') return 'DF';
    if (Normalizer.NAME_TO_UF[stripped]) return Normalizer.NAME_TO_UF[stripped];
    if (raw.length === 2) return raw;
    return '';
  }

  static keyFor(name, uf) {
    return Normalizer.normalizeName(name) + '|' + Normalizer.normalizeUf(uf);
  }
}

Normalizer.SIGLAS = new Set([
  'AC', 'AL', 'AP', 'AM', 'BA', 'CE', 'DF', 'ES', 'GO', 'MA', 'MT', 'MS', 'MG',
  'PA', 'PB', 'PR', 'PE', 'PI', 'RJ', 'RN', 'RS', 'RO', 'RR', 'SC', 'SP', 'SE', 'TO'
]);

Normalizer.NAME_TO_UF = {
  'acre': 'AC',
  'alagoas': 'AL',
  'amapa': 'AP',
  'amazonas': 'AM',
  'bahia': 'BA',
  'ceara': 'CE',
  'distrito federal': 'DF',
  'espirito santo': 'ES',
  'goias': 'GO',
  'maranhao': 'MA',
  'mato grosso': 'MT',
  'mato grosso do sul': 'MS',
  'minas gerais': 'MG',
  'para': 'PA',
  'paraiba': 'PB',
  'parana': 'PR',
  'pernambuco': 'PE',
  'piaui': 'PI',
  'rio de janeiro': 'RJ',
  'rio grande do norte': 'RN',
  'rio grande do sul': 'RS',
  'rondonia': 'RO',
  'roraima': 'RR',
  'santa catarina': 'SC',
  'sao paulo': 'SP',
  'sergipe': 'SE',
  'tocantins': 'TO'
};

Normalizer.UF_TO_NAME = {
  'AC': 'Acre', 'AL': 'Alagoas', 'AP': 'Amapá', 'AM': 'Amazonas', 'BA': 'Bahia',
  'CE': 'Ceará', 'DF': 'Distrito Federal', 'ES': 'Espírito Santo', 'GO': 'Goiás',
  'MA': 'Maranhão', 'MT': 'Mato Grosso', 'MS': 'Mato Grosso do Sul', 'MG': 'Minas Gerais',
  'PA': 'Pará', 'PB': 'Paraíba', 'PR': 'Paraná', 'PE': 'Pernambuco', 'PI': 'Piauí',
  'RJ': 'Rio de Janeiro', 'RN': 'Rio Grande do Norte', 'RS': 'Rio Grande do Sul',
  'RO': 'Rondônia', 'RR': 'Roraima', 'SC': 'Santa Catarina', 'SP': 'São Paulo',
  'SE': 'Sergipe', 'TO': 'Tocantins'
};

class CityMatcherService {
  constructor(populationService, storageKey) {
    this.population = populationService;
    this.storageKey = storageKey || 'ga4_corrections_v1';
    this.corrections = this._loadCorrections();
  }

  _loadCorrections() {
    try {
      const raw = localStorage.getItem(this.storageKey);
      return raw ? JSON.parse(raw) : {};
    } catch (e) {
      return {};
    }
  }

  _persistCorrections() {
    try {
      localStorage.setItem(this.storageKey, JSON.stringify(this.corrections));
    } catch (e) {}
  }

  correctionKey(row) {
    return Normalizer.normalizeName(row.cidade) + '|' + Normalizer.normalizeUf(row.estado);
  }

  setCorrection(key, code) {
    if (!code) {
      delete this.corrections[key];
    } else {
      this.corrections[key] = code;
    }
    this._persistCorrections();
  }

  clearCorrections() {
    this.corrections = {};
    this._persistCorrections();
  }

  match(rows) {
    const byCode = new Map();
    const unmatched = [];
    const foreign = [];
    const ambiguous = [];
    let matchedRows = 0;
    const totalAll = { sessoes: 0, engajadas: 0, usuarios: 0, conversoes: 0, receita: 0 };
    const totalMatched = { sessoes: 0, engajadas: 0, usuarios: 0, conversoes: 0, receita: 0 };

    for (const row of rows) {
      this._sum(totalAll, row);
      const result = this._resolve(row);
      if (!result.municipio) {
        if (result.reason === 'fora_brasil') {
          foreign.push({ row: row, reason: result.reason, key: this.correctionKey(row) });
        } else {
          unmatched.push({ row: row, reason: result.reason, candidates: result.candidates || [], key: this.correctionKey(row) });
        }
        continue;
      }
      matchedRows++;
      this._sum(totalMatched, row);
      if (result.ambiguous) {
        ambiguous.push({ row: row, municipio: result.municipio, candidates: result.candidates });
      }
      this._aggregate(byCode, result.municipio, row);
    }

    const performances = Array.from(byCode.values());
    const brRows = matchedRows + unmatched.length;
    const coverage = {};
    for (const m of ['sessoes', 'engajadas', 'usuarios', 'conversoes', 'receita']) {
      coverage[m] = totalAll[m] ? totalMatched[m] / totalAll[m] : 0;
    }
    const stats = {
      totalRows: rows.length,
      matchedRows: matchedRows,
      unmatchedRows: unmatched.length,
      foreignRows: foreign.length,
      matchedCities: performances.length,
      matchRate: brRows ? matchedRows / brRows : 0,
      matchRateAll: rows.length ? matchedRows / rows.length : 0,
      ambiguousCount: ambiguous.length,
      coverage: coverage,
      totalAll: totalAll,
      totalMatched: totalMatched
    };
    return { performances: performances, unmatched: unmatched, foreign: foreign, ambiguous: ambiguous, stats: stats };
  }

  _sum(acc, row) {
    acc.sessoes += row.sessoes || 0;
    acc.engajadas += row.engajadas || 0;
    acc.usuarios += row.usuarios || 0;
    acc.conversoes += row.conversoes || 0;
    acc.receita += row.receita || 0;
  }

  _resolve(row) {
    if (row.codigo) {
      const byCode = this.population.findByCode(row.codigo);
      if (byCode) return { municipio: byCode, ambiguous: false };
    }

    const corrKey = this.correctionKey(row);
    if (this.corrections[corrKey]) {
      const corrected = this.population.findByCode(this.corrections[corrKey]);
      if (corrected) return { municipio: corrected, ambiguous: false };
    }

    if (this._isEmptyCity(row.cidade)) return { municipio: null, reason: 'fora_brasil' };

    const uf = Normalizer.normalizeUf(row.estado);
    if (uf) {
      const byUf = this.population.findByNameUf(row.cidade, uf);
      if (byUf.length === 1) return { municipio: byUf[0], ambiguous: false };
      if (byUf.length > 1) {
        return { municipio: byUf[0], ambiguous: true, candidates: byUf };
      }
    }

    const rawState = (row.estado || '').trim();
    const hasForeignRegion = rawState !== '' && !this._isNoState(rawState) && !uf;
    if (hasForeignRegion) return { municipio: null, reason: 'fora_brasil' };

    const byName = this.population.findByName(row.cidade);
    if (byName.length === 1) return { municipio: byName[0], ambiguous: false };
    if (byName.length > 1) {
      return { municipio: null, reason: 'ambiguidade', candidates: byName };
    }

    return { municipio: null, reason: 'nao_encontrada', candidates: [] };
  }

  _isNoState(value) {
    const norm = Normalizer.normalizeName(value);
    return norm === '' || norm === 'not set' || norm === 'nao definido';
  }

  _isEmptyCity(value) {
    const norm = Normalizer.normalizeName(value);
    return norm === '' || norm === 'not set' || norm === 'nao definido';
  }

  _aggregate(byCode, municipio, row) {
    let perf = byCode.get(municipio.code);
    if (!perf) {
      perf = new CidadePerformance(municipio, {});
      byCode.set(municipio.code, perf);
    }
    perf.addMetrics(row);
    perf.sources.push(row);
  }
}

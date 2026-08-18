const MPS_BANDS = [
  { key: 'dominancia', label: 'Dominância regional', short: '> 5,0', min: 5.0, max: Infinity, color: '#06402b' },
  { key: 'forte', label: 'Forte presença regional', short: '2,0 – 5,0', min: 2.0, max: 5.0, color: '#1a9850' },
  { key: 'acima', label: 'Acima do esperado', short: '1,1 – 2,0', min: 1.1, max: 2.0, color: '#a6d96a' },
  { key: 'dentro', label: 'Dentro do esperado', short: '0,9 – 1,1', min: 0.9, max: 1.1, color: '#fee08b' },
  { key: 'abaixo', label: 'Abaixo do esperado', short: '0,5 – 0,9', min: 0.5, max: 0.9, color: '#fc8d59' },
  { key: 'muito_abaixo', label: 'Muito abaixo do esperado', short: '< 0,5', min: 0, max: 0.5, color: '#d73027' }
];

const MPS_BAND_NONE = { key: 'none', label: 'Sem dados', short: '—', color: '#cbd5e1' };

class CidadePerformance {
  constructor(municipio, metrics) {
    this.municipio = municipio;
    this.metrics = {
      sessoes: 0,
      engajadas: 0,
      usuarios: 0,
      conversoes: 0,
      receita: 0
    };
    if (metrics) {
      for (const k of Object.keys(this.metrics)) {
        if (metrics[k] !== undefined && metrics[k] !== null && !isNaN(metrics[k])) {
          this.metrics[k] = Number(metrics[k]);
        }
      }
    }
    this.sources = [];
    this.channelSources = new Set();
    this.channelMediums = new Set();
    this.indicators = null;
  }

  addChannel(source, medium) {
    if (source) this.channelSources.add(source);
    if (medium) this.channelMediums.add(medium);
  }

  get hasChannel() {
    return this.channelSources.size > 0 || this.channelMediums.size > 0;
  }

  get sourceLabel() {
    return Array.from(this.channelSources).join(', ');
  }

  get mediumLabel() {
    return Array.from(this.channelMediums).join(', ');
  }

  get originLabel() {
    const s = this.sourceLabel;
    const m = this.mediumLabel;
    if (s && m) return s + ' / ' + m;
    return s || m || '';
  }

  addMetrics(metrics) {
    for (const k of Object.keys(this.metrics)) {
      if (metrics[k] !== undefined && metrics[k] !== null && !isNaN(metrics[k])) {
        this.metrics[k] += Number(metrics[k]);
      }
    }
  }

  metricValue(metric) {
    return this.metrics[metric] || 0;
  }

  compute(metric, totals) {
    const pop = this.municipio.population;
    const value = this.metricValue(metric);
    const metricTotal = totals.metric[metric] || 0;
    const popTotal = totals.population || 0;
    const perCapita = pop ? value / pop : 0;
    const metricShare = metricTotal ? value / metricTotal : 0;
    const popShare = popTotal ? pop / popTotal : 0;
    const mps = popShare ? metricShare / popShare : 0;
    const receitaPerCapita = pop ? this.metrics.receita / pop : 0;
    const reach = pop ? this.metrics.usuarios / pop : 0;
    const expected = popShare * metricTotal;
    this.indicators = {
      metric: metric,
      value: value,
      population: pop,
      perCapita: perCapita,
      per1k: perCapita * 1000,
      per100k: perCapita * 100000,
      metricShare: metricShare,
      popShare: popShare,
      mps: mps,
      reach: reach,
      expected: expected,
      opportunityGap: popShare - metricShare,
      receitaPerCapita: receitaPerCapita,
      receitaPer100k: receitaPerCapita * 100000,
      band: CidadePerformance.bandFor(mps)
    };
    return this;
  }

  static bandFor(mps) {
    if (!mps || mps <= 0) return MPS_BAND_NONE;
    for (const band of MPS_BANDS) {
      if (mps >= band.min && mps < band.max) return band;
    }
    return MPS_BANDS[0];
  }
}

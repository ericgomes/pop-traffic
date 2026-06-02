class DashboardController {
  constructor(services) {
    this.population = services.population;
    this.importer = services.importer;
    this.matcher = services.matcher;
    this.analysis = services.analysis;
    this.exporter = services.exporter;
    this.view = services.view;

    this.rawRows = [];
    this.availableMetrics = [];
    this.sourceHeaders = {};
    this.metric = 'sessoes';
    this.matchResult = null;
    this.activeTab = 'dashboard';
    this.sort = { key: 'mps', dir: 'desc' };
    this.filters = this._emptyFilters();
  }

  _emptyFilters() {
    return {
      ufs: new Set(),
      tipo: 'todos',
      popMin: null,
      popMax: null,
      mpsMin: null,
      mpsMax: null,
      sessoesMin: null,
      usuariosMin: null,
      conversoesMin: null,
      receitaMin: null
    };
  }

  init() {
    this.population.load();
    this.view.bind(this);
    this.view.renderShell({
      ref: this.population.ref,
      count: this.population.count,
      total: this.population.totalPopulation,
      cached: !!this.population.cachedMeta()
    });
    this.view.renderEmpty();
  }

  importText(text) {
    const parsed = this.importer.parse(text);
    if (!parsed.ok) {
      this.view.showImportError(parsed.error);
      return;
    }
    this.rawRows = parsed.rows;
    this.availableMetrics = parsed.metrics;
    this.sourceHeaders = parsed.sourceHeaders || {};
    this.metric = parsed.metrics.length ? parsed.metrics[0] : 'sessoes';
    this.filters = this._emptyFilters();
    this._runMatch();
    this._prepare();
    this.render();
  }

  loadSample() {
    this.importText(DashboardController.SAMPLE_CSV);
  }

  _runMatch() {
    this.matchResult = this.matcher.match(this.rawRows);
  }

  _prepare() {
    if (!this.matchResult || !this.matchResult.performances.length) return;
    this.analysis.prepare(this.matchResult.performances, this.metric);
  }

  setMetric(metric) {
    if (this.availableMetrics.indexOf(metric) === -1) return;
    this.metric = metric;
    this._prepare();
    this.render();
  }

  setSort(key) {
    if (this.sort.key === key) {
      this.sort.dir = this.sort.dir === 'desc' ? 'asc' : 'desc';
    } else {
      this.sort = { key: key, dir: key === 'name' || key === 'uf' ? 'asc' : 'desc' };
    }
    this.render();
  }

  setActiveTab(tab) {
    this.activeTab = tab;
    this.render();
  }

  updateFilters(partial) {
    Object.assign(this.filters, partial);
    this.render();
  }

  toggleUf(uf) {
    if (this.filters.ufs.has(uf)) {
      this.filters.ufs.delete(uf);
    } else {
      this.filters.ufs.add(uf);
    }
    this.render();
  }

  resetFilters() {
    this.filters = this._emptyFilters();
    this.render();
  }

  applyCorrection(key, code) {
    this.matcher.setCorrection(key, code);
    this._runMatch();
    this._prepare();
    this.render();
  }

  clearCorrections() {
    this.matcher.clearCorrections();
    this._runMatch();
    this._prepare();
    this.render();
  }

  filteredList() {
    if (!this.matchResult) return [];
    const f = this.filters;
    return this.matchResult.performances.filter((p) => {
      const m = p.municipio;
      const ind = p.indicators;
      if (f.ufs.size && !f.ufs.has(m.uf)) return false;
      if (f.tipo === 'capital' && !m.isCapital) return false;
      if (f.tipo === 'interior' && m.isCapital) return false;
      if (f.popMin !== null && m.population < f.popMin) return false;
      if (f.popMax !== null && m.population > f.popMax) return false;
      if (f.mpsMin !== null && ind.mps < f.mpsMin) return false;
      if (f.mpsMax !== null && ind.mps > f.mpsMax) return false;
      if (f.sessoesMin !== null && p.metrics.sessoes < f.sessoesMin) return false;
      if (f.usuariosMin !== null && p.metrics.usuarios < f.usuariosMin) return false;
      if (f.conversoesMin !== null && p.metrics.conversoes < f.conversoesMin) return false;
      if (f.receitaMin !== null && p.metrics.receita < f.receitaMin) return false;
      return true;
    });
  }

  sortedList(list) {
    const key = this.sort.key;
    const dir = this.sort.dir === 'asc' ? 1 : -1;
    const accessor = this._sortAccessor(key);
    return list.slice().sort((a, b) => {
      const av = accessor(a);
      const bv = accessor(b);
      if (typeof av === 'string') return av.localeCompare(bv) * dir;
      return (av - bv) * dir;
    });
  }

  _sortAccessor(key) {
    const map = {
      name: (p) => p.municipio.name,
      uf: (p) => p.municipio.uf,
      population: (p) => p.municipio.population,
      sessoes: (p) => p.metrics.sessoes,
      engajadas: (p) => p.metrics.engajadas,
      usuarios: (p) => p.metrics.usuarios,
      conversoes: (p) => p.metrics.conversoes,
      receita: (p) => p.metrics.receita,
      value: (p) => p.indicators.value,
      per100k: (p) => p.indicators.per100k,
      metricShare: (p) => p.indicators.metricShare,
      popShare: (p) => p.indicators.popShare,
      mps: (p) => p.indicators.mps
    };
    return map[key] || map.mps;
  }

  render() {
    if (!this.matchResult || !this.matchResult.performances.length) {
      this.view.renderEmpty();
      return;
    }
    const filtered = this.filteredList();
    const viewModel = this.analysis.buildView(filtered, this.metric);
    this.view.render({
      metric: this.metric,
      availableMetrics: this.availableMetrics,
      sourceHeaders: this.sourceHeaders,
      matchResult: this.matchResult,
      view: viewModel,
      filtered: filtered,
      sortedRows: this.sortedList(filtered),
      filters: this.filters,
      ufList: this._matchedUfs(),
      sort: this.sort,
      activeTab: this.activeTab,
      geo: window.BRAZIL_UF_GEO,
      population: this.population
    });
  }

  _matchedUfs() {
    const set = new Set();
    for (const p of this.matchResult.performances) set.add(p.municipio.uf);
    return Array.from(set).sort();
  }

  exportCSV() {
    const cols = this._exportColumns();
    this.exporter.exportCSV('analise-mps-' + this.metric + '.csv', cols, this.sortedList(this.filteredList()));
  }

  exportXLSX() {
    const cols = this._exportColumns();
    this.exporter.exportXLSX('analise-mps-' + this.metric + '.xlsx', cols, this.sortedList(this.filteredList()), 'MPS ' + Formatter.metricLabel(this.metric));
  }

  exportPDF() {
    const filtered = this.filteredList();
    const model = this.analysis.buildView(filtered, this.metric);
    this.exporter.exportPDF('analise-mps-' + this.metric + '.pdf', this._pdfReport(model));
  }

  _exportColumns() {
    return [
      { label: 'Código IBGE', value: (p) => p.municipio.code },
      { label: 'Município', value: (p) => p.municipio.name },
      { label: 'UF', value: (p) => p.municipio.uf },
      { label: 'Tipo', value: (p) => p.municipio.classification },
      { label: 'População 2025', value: (p) => p.municipio.population },
      { label: 'Sessões', value: (p) => p.metrics.sessoes },
      { label: 'Sessões engajadas', value: (p) => p.metrics.engajadas },
      { label: 'Usuários', value: (p) => p.metrics.usuarios },
      { label: 'Conversões', value: (p) => p.metrics.conversoes },
      { label: 'Receita', value: (p) => p.metrics.receita },
      { label: Formatter.metricLabel(this.metric) + ' (métrica)', value: (p) => p.indicators.value },
      { label: 'Por 1k hab', value: (p) => Number(p.indicators.per1k.toFixed(4)) },
      { label: 'Por 100k hab', value: (p) => Number(p.indicators.per100k.toFixed(2)) },
      { label: '% Métrica', value: (p) => Number((p.indicators.metricShare * 100).toFixed(4)) },
      { label: '% População', value: (p) => Number((p.indicators.popShare * 100).toFixed(4)) },
      { label: 'MPS', value: (p) => Number(p.indicators.mps.toFixed(4)) },
      { label: 'Classificação', value: (p) => p.indicators.band.label }
    ];
  }

  _pdfReport(model) {
    const s = model.summary;
    const metricLabel = Formatter.metricLabel(this.metric);
    const sections = [];
    sections.push({
      title: 'Resumo executivo',
      lines: [
        'Métrica principal: ' + metricLabel,
        'Municípios analisados: ' + Formatter.integer(s.municipios),
        'População coberta: ' + Formatter.integer(s.population) + ' (' + Formatter.percent(s.coverage) + ' do Brasil)',
        'Sessões totais: ' + Formatter.integer(s.totalSessoes),
        'Usuários totais: ' + Formatter.integer(s.totalUsuarios),
        'Conversões totais: ' + Formatter.integer(s.totalConversoes),
        'Receita total: ' + Formatter.currency(s.totalReceita),
        'Maior MPS: ' + (s.topCity ? s.topCity.municipio.label + ' (' + Formatter.mps(s.topCity.indicators.mps) + ')' : '—'),
        'Menor MPS: ' + (s.bottomCity ? s.bottomCity.municipio.label + ' (' + Formatter.mps(s.bottomCity.indicators.mps) + ')' : '—')
      ]
    });
    sections.push({
      title: 'Top 10 destaques por MPS',
      table: {
        columns: [
          { label: 'Município', width: 50 },
          { label: 'UF', width: 12 },
          { label: 'População', width: 28 },
          { label: metricLabel, width: 28 },
          { label: 'MPS', width: 16 },
          { label: 'Classificação', width: 46 }
        ],
        rows: model.classifications.topMps.slice(0, 10).map((p) => [
          p.municipio.name, p.municipio.uf, Formatter.integer(p.municipio.population),
          Formatter.integer(p.indicators.value), Formatter.mps(p.indicators.mps), p.indicators.band.label
        ])
      }
    });
    sections.push({
      title: 'Top 10 oportunidades (baixa presença x população)',
      table: {
        columns: [
          { label: 'Município', width: 50 },
          { label: 'UF', width: 12 },
          { label: 'População', width: 28 },
          { label: metricLabel, width: 28 },
          { label: 'MPS', width: 16 }
        ],
        rows: model.summary.topOpportunities.map((p) => [
          p.municipio.name, p.municipio.uf, Formatter.integer(p.municipio.population),
          Formatter.integer(p.indicators.value), Formatter.mps(p.indicators.mps)
        ])
      }
    });
    sections.push({
      title: 'Insights automáticos',
      lines: model.insights.map((i) => '- ' + i.text)
    });
    return {
      title: 'Análise Geográfica de Tráfego — MPS por ' + metricLabel,
      subtitle: 'Base IBGE POP2025 (ref. ' + this.population.ref + ') · ' + Formatter.integer(s.municipios) + ' municípios analisados',
      sections: sections
    };
  }
}

DashboardController.SAMPLE_CSV = [
  'cidade,estado,sessoes,usuarios,conversoes,receita',
  'São Paulo,São Paulo,50000,38000,1200,350000',
  'Campinas,São Paulo,8000,6200,240,95000',
  'Recife,Pernambuco,5500,4100,110,42000',
  'Rio de Janeiro,RJ,42000,31000,900,280000',
  'Belo Horizonte,Minas Gerais,18000,13500,420,120000',
  'Curitiba,PR,16000,12000,520,160000',
  'Porto Alegre,RS,14000,10500,380,110000',
  'Florianópolis,Santa Catarina,9000,7000,300,98000',
  'Manaus,Amazonas,3000,2300,40,18000',
  'Salvador,BA,9000,6800,150,52000',
  'Fortaleza,Ceará,7000,5200,120,38000',
  'Brasília,Distrito Federal,20000,15000,600,210000',
  'Goiânia,Goiás,8500,6400,210,72000',
  'Joinville,Santa Catarina,6000,4500,190,64000',
  'Caxias do Sul,Rio Grande do Sul,4200,3200,140,48000',
  'Sao Jose dos Campos,SP,5200,3900,170,61000',
  'Ribeirao Preto,SP,6100,4600,210,73000',
  'Uberlandia,MG,4800,3600,150,49000',
  'Londrina,Parana,5000,3800,160,52000',
  'Maringá,Paraná,4600,3500,175,58000',
  'Blumenau,SC,3800,2900,130,46000',
  'Balneário Camboriú,SC,5400,4100,260,92000',
  'Vitória,Espírito Santo,4200,3200,150,55000',
  'Niterói,Rio de Janeiro,3900,3000,140,49000',
  'Belém,Pará,3200,2400,60,22000',
  'São Luís,Maranhão,2600,1900,45,16000',
  'Teresina,Piauí,2100,1600,38,13000',
  'Natal,Rio Grande do Norte,2800,2100,55,19000',
  'João Pessoa,Paraíba,3000,2300,70,26000',
  'Aracaju,Sergipe,2200,1700,48,17000',
  'Cuiabá,Mato Grosso,2900,2200,80,31000',
  'Campo Grande,Mato Grosso do Sul,3100,2400,95,34000',
  'Macapá,Amapá,900,700,12,4200',
  'Boa Vista,Roraima,800,620,10,3800',
  'Palmas,Tocantins,1400,1100,40,15000',
  'Porto Velho,Rondônia,1200,950,22,9000',
  'Rio Branco,Acre,1000,780,18,7000',
  'Gramado,Rio Grande do Sul,4800,3700,320,140000',
  'Bombinhas,Santa Catarina,2600,2000,180,72000',
  'Holambra,São Paulo,1200,950,90,38000',
  'Nova Lima,Minas Gerais,2400,1850,160,68000',
  'Cidade Inexistente,XX,500,400,10,2000'
].join('\n');

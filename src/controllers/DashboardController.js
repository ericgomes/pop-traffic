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
    this.mapMode = 'uf';
    this.sort = { key: 'population', dir: 'desc' };
    this.basePerformances = [];
    this.channelAll = { sources: [], mediums: [] };
    this.channelPreset = 'todas';
    this.filters = this._emptyFilters();
    this.autoBounds = {};
  }

  _emptyFilters() {
    return {
      ufs: new Set(),
      msvsBands: new Set(),
      sources: new Set(),
      mediums: new Set(),
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

  _bounds(list) {
    const mn = (arr) => (arr.length ? Math.min.apply(null, arr) : 0);
    const mx = (arr) => (arr.length ? Math.max.apply(null, arr) : 0);
    const mps = list.map((p) => p.indicators.mps);
    return {
      popMin: mn(list.map((p) => p.municipio.population)),
      popMax: mx(list.map((p) => p.municipio.population)),
      mpsMin: Math.floor(mn(mps) * 100) / 100,
      mpsMax: Math.ceil(mx(mps) * 100) / 100,
      sessoesMin: mn(list.map((p) => p.metrics.sessoes)),
      usuariosMin: mn(list.map((p) => p.metrics.usuarios)),
      conversoesMin: mn(list.map((p) => p.metrics.conversoes)),
      receitaMin: mn(list.map((p) => p.metrics.receita))
    };
  }

  _seedFilters() {
    if (!this.matchResult || !this.matchResult.performances.length) return;
    const ps = this.matchResult.performances;
    this.filters.ufs = new Set(ps.map((p) => p.municipio.uf));
    this.filters.msvsBands = new Set(MPS_BANDS.map((b) => b.key));
    this.channelAll = this._channelOptions();
    this.filters.sources = new Set(this.channelAll.sources);
    this.filters.mediums = new Set(this.channelAll.mediums);
    this.channelPreset = 'todas';
    const b = this._bounds(this.basePerformances.length ? this.basePerformances : ps);
    Object.assign(this.filters, b);
    this.autoBounds = b;
  }

  _refreshBounds() {
    if (!this.basePerformances || !this.basePerformances.length) return;
    const b = this._bounds(this.basePerformances);
    const prev = this.autoBounds || {};
    for (const k of ['mpsMin', 'mpsMax']) {
      if (this.filters[k] === null || this.filters[k] === prev[k]) this.filters[k] = b[k];
    }
    this.autoBounds = Object.assign({}, this.autoBounds, { mpsMin: b.mpsMin, mpsMax: b.mpsMax });
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
    this._seedFilters();
    this.render();
  }

  loadSample() {
    this.importText(DashboardController.SAMPLE_CSV);
  }

  importFromSheets(url) {
    const ref = this._parseSheetUrl(url);
    if (!ref) {
      this.view.showImportError('Link do Google Sheets inválido. Cole a URL completa da planilha.');
      return;
    }
    this.view.showImportInfo('Lendo planilha do Google Sheets…');
    const csvUrl = 'https://docs.google.com/spreadsheets/d/' + ref.id + '/export?format=csv&gid=' + ref.gid;
    fetch(csvUrl)
      .then((r) => {
        if (!r.ok) throw new Error('HTTP ' + r.status);
        return r.text();
      })
      .then((text) => {
        if (/^\s*</.test(text)) throw new Error('acesso negado');
        this.importText(text);
      })
      .catch(() => {
        this.view.showImportError('Não foi possível ler a planilha. Confirme que o compartilhamento está como "qualquer pessoa com o link pode ver".');
      });
  }

  _parseSheetUrl(url) {
    const s = String(url || '').trim();
    if (!s) return null;
    const idMatch = s.match(/\/spreadsheets\/d\/([a-zA-Z0-9-_]+)/) || s.match(/^([a-zA-Z0-9-_]{20,})$/);
    if (!idMatch) return null;
    const gidMatch = s.match(/[#?&]gid=(\d+)/);
    return { id: idMatch[1], gid: gidMatch ? gidMatch[1] : '0' };
  }

  _runMatch() {
    this.matchResult = this.matcher.match(this.rawRows);
  }

  _prepare() {
    this.basePerformances = this._analysisBase();
    if (!this.basePerformances.length) return;
    this.analysis.prepare(this.basePerformances, this.metric);
  }

  _analysisBase() {
    const all = this.matchResult ? this.matchResult.performances : [];
    const f = this.filters;
    const nS = this.channelAll.sources.length;
    const nM = this.channelAll.mediums.length;
    const srcActive = f.sources.size > 0 && f.sources.size < nS;
    const medActive = f.mediums.size > 0 && f.mediums.size < nM;
    if (!srcActive && !medActive) return all;
    const out = [];
    for (const perf of all) {
      const rows = perf.sources.filter((r) =>
        (!srcActive || f.sources.has(r.source)) && (!medActive || f.mediums.has(r.medium)));
      if (!rows.length) continue;
      const np = new CidadePerformance(perf.municipio, {});
      for (const r of rows) {
        np.addMetrics(r);
        np.addChannel(r.source, r.medium);
        np.sources.push(r);
      }
      out.push(np);
    }
    return out;
  }

  setMetric(metric) {
    if (this.availableMetrics.indexOf(metric) === -1) return;
    this.metric = metric;
    this._prepare();
    this._refreshBounds();
    this.render();
  }

  setMapMode(mode) {
    this.mapMode = mode;
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
    const s = this.filters.ufs;
    s.has(uf) ? s.delete(uf) : s.add(uf);
    if (s.size === 0) this.filters.ufs = new Set(this._matchedUfs());
    this.render();
  }

  toggleBand(key) {
    const s = this.filters.msvsBands;
    s.has(key) ? s.delete(key) : s.add(key);
    if (s.size === 0) this.filters.msvsBands = new Set(MPS_BANDS.map((b) => b.key));
    this.render();
  }

  selectAllUfs() {
    this.filters.ufs = new Set(this._matchedUfs());
    this.render();
  }

  selectAllBands() {
    this.filters.msvsBands = new Set(MPS_BANDS.map((b) => b.key));
    this.render();
  }

  selectBandPreset(kind) {
    if (kind === 'melhores') this.filters.msvsBands = new Set(MPS_BANDS.slice(0, 3).map((b) => b.key));
    else if (kind === 'piores') this.filters.msvsBands = new Set(MPS_BANDS.slice(3).map((b) => b.key));
    else this.filters.msvsBands = new Set(MPS_BANDS.map((b) => b.key));
    this.render();
  }

  toggleSource(value) {
    this._toggleChannel('sources', value, this.channelAll.sources);
  }

  toggleMedium(value) {
    this._toggleChannel('mediums', value, this.channelAll.mediums);
  }

  _toggleChannel(key, value, all) {
    const s = this.filters[key];
    s.has(value) ? s.delete(value) : s.add(value);
    if (s.size === 0) this.filters[key] = new Set(all);
    this.channelPreset = null;
    this._prepare();
    this._refreshBounds();
    this.render();
  }

  selectAllChannels() {
    this.filters.sources = new Set(this.channelAll.sources);
    this.filters.mediums = new Set(this.channelAll.mediums);
    this.channelPreset = 'todas';
    this._prepare();
    this._refreshBounds();
    this.render();
  }

  applyChannelPreset(kind) {
    const med = this.channelAll.mediums;
    this.filters.sources = new Set(this.channelAll.sources);
    if (kind === 'organica') this.filters.mediums = new Set(med.filter((m) => /organic/i.test(m)));
    else if (kind === 'paga') this.filters.mediums = new Set(med.filter((m) => /cpc/i.test(m)));
    else if (kind === 'naopaga') this.filters.mediums = new Set(med.filter((m) => !/cpc/i.test(m)));
    else this.filters.mediums = new Set(med);
    this.channelPreset = kind;
    this._prepare();
    this._refreshBounds();
    this.render();
  }

  resetFilters() {
    this.filters = this._emptyFilters();
    this._seedFilters();
    this.render();
  }

  applyCorrection(key, code) {
    this.matcher.setCorrection(key, code);
    this._runMatch();
    this._prepare();
    this._refreshBounds();
    this.render();
  }

  clearCorrections() {
    this.matcher.clearCorrections();
    this._runMatch();
    this._prepare();
    this._refreshBounds();
    this.render();
  }

  filteredList() {
    if (!this.basePerformances || !this.basePerformances.length) return [];
    const f = this.filters;
    return this.basePerformances.filter((p) => {
      const m = p.municipio;
      const ind = p.indicators;
      if (f.ufs.size && !f.ufs.has(m.uf)) return false;
      if (f.msvsBands.size && f.msvsBands.size < MPS_BANDS.length && !f.msvsBands.has(ind.band.key)) return false;
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
      reach: (p) => p.indicators.reach,
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
      channels: this.channelAll,
      channelPreset: this.channelPreset,
      analysisTotals: this.analysis.totals,
      sort: this.sort,
      activeTab: this.activeTab,
      mapMode: this.mapMode,
      geo: window.BRAZIL_UF_GEO,
      cityGeo: window.MUNICIPIOS_GEO,
      population: this.population
    });
  }

  _matchedUfs() {
    const set = new Set();
    for (const p of this.matchResult.performances) set.add(p.municipio.uf);
    return Array.from(set).sort();
  }

  _channelOptions() {
    const sources = new Set();
    const mediums = new Set();
    for (const p of this.matchResult.performances) {
      p.channelSources.forEach((s) => sources.add(s));
      p.channelMediums.forEach((m) => mediums.add(m));
    }
    return { sources: Array.from(sources).sort(), mediums: Array.from(mediums).sort() };
  }

  exportCSV() {
    const cols = this._exportColumns();
    this.exporter.exportCSV('analise-msvs-' + this.metric + '.csv', cols, this.sortedList(this.filteredList()));
  }

  exportXLSX() {
    const cols = this._exportColumns();
    this.exporter.exportXLSX('analise-msvs-' + this.metric + '.xlsx', cols, this.sortedList(this.filteredList()), 'MSVS ' + Formatter.metricLabel(this.metric));
  }

  exportPDF() {
    const filtered = this.filteredList();
    const model = this.analysis.buildView(filtered, this.metric);
    this.exporter.exportPDF('analise-msvs-' + this.metric + '.pdf', this._pdfReport(model));
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
      { label: 'Alcance % (usuários/pop)', value: (p) => Number((p.indicators.reach * 100).toFixed(4)) },
      { label: 'MSVS', value: (p) => Number(p.indicators.mps.toFixed(4)) },
      { label: 'Classificação', value: (p) => p.indicators.band.label },
      { label: 'Fonte', value: (p) => p.sourceLabel },
      { label: 'Mídia', value: (p) => p.mediumLabel }
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
        'Maior MSVS: ' + (s.topCity ? s.topCity.municipio.label + ' (' + Formatter.mps(s.topCity.indicators.mps) + ')' : '—'),
        'Menor MSVS: ' + (s.bottomCity ? s.bottomCity.municipio.label + ' (' + Formatter.mps(s.bottomCity.indicators.mps) + ')' : '—')
      ]
    });
    sections.push({
      title: 'Top 10 destaques por MSVS',
      table: {
        columns: [
          { label: 'Município', width: 50 },
          { label: 'UF', width: 12 },
          { label: 'População', width: 28 },
          { label: metricLabel, width: 28 },
          { label: 'MSVS', width: 16 },
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
          { label: 'MSVS', width: 16 }
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
      title: 'Cidades — Market Share of Voice Score (MSVS) por ' + metricLabel,
      subtitle: 'Base IBGE POP2025 (ref. ' + this.population.ref + ') · ' + Formatter.integer(s.municipios) + ' municípios analisados',
      sections: sections
    };
  }
}

DashboardController.SAMPLE_CSV = [
  'cidade,estado,sessoes,usuarios,conversoes,receita,source,medium',
  'São Paulo,São Paulo,50000,38000,1200,350000,google,organic',
  'Campinas,São Paulo,8000,6200,240,95000,google,cpc',
  'Recife,Pernambuco,5500,4100,110,42000,facebook,paid_social',
  'Rio de Janeiro,RJ,42000,31000,900,280000,google,organic',
  'Belo Horizonte,Minas Gerais,18000,13500,420,120000,(direct),(none)',
  'Curitiba,PR,16000,12000,520,160000,google,cpc',
  'Porto Alegre,RS,14000,10500,380,110000,bing,organic',
  'Florianópolis,Santa Catarina,9000,7000,300,98000,instagram,paid_social',
  'Manaus,Amazonas,3000,2300,40,18000,facebook,paid_social',
  'Salvador,BA,9000,6800,150,52000,google,organic',
  'Fortaleza,Ceará,7000,5200,120,38000,(direct),(none)',
  'Brasília,Distrito Federal,20000,15000,600,210000,google,cpc',
  'Goiânia,Goiás,8500,6400,210,72000,google,organic',
  'Joinville,Santa Catarina,6000,4500,190,64000,email,newsletter',
  'Caxias do Sul,Rio Grande do Sul,4200,3200,140,48000,bing,organic',
  'Sao Jose dos Campos,SP,5200,3900,170,61000,google,cpc',
  'Ribeirao Preto,SP,6100,4600,210,73000,google,organic',
  'Uberlandia,MG,4800,3600,150,49000,facebook,paid_social',
  'Londrina,Parana,5000,3800,160,52000,(direct),(none)',
  'Maringá,Paraná,4600,3500,175,58000,google,cpc',
  'Blumenau,SC,3800,2900,130,46000,instagram,paid_social',
  'Balneário Camboriú,SC,5400,4100,260,92000,instagram,paid_social',
  'Vitória,Espírito Santo,4200,3200,150,55000,google,organic',
  'Niterói,Rio de Janeiro,3900,3000,140,49000,(direct),(none)',
  'Belém,Pará,3200,2400,60,22000,facebook,paid_social',
  'São Luís,Maranhão,2600,1900,45,16000,google,organic',
  'Teresina,Piauí,2100,1600,38,13000,google,cpc',
  'Natal,Rio Grande do Norte,2800,2100,55,19000,bing,organic',
  'João Pessoa,Paraíba,3000,2300,70,26000,email,newsletter',
  'Aracaju,Sergipe,2200,1700,48,17000,facebook,paid_social',
  'Cuiabá,Mato Grosso,2900,2200,80,31000,google,organic',
  'Campo Grande,Mato Grosso do Sul,3100,2400,95,34000,google,cpc',
  'Macapá,Amapá,900,700,12,4200,(direct),(none)',
  'Boa Vista,Roraima,800,620,10,3800,google,organic',
  'Palmas,Tocantins,1400,1100,40,15000,facebook,paid_social',
  'Porto Velho,Rondônia,1200,950,22,9000,google,cpc',
  'Rio Branco,Acre,1000,780,18,7000,bing,organic',
  'Gramado,Rio Grande do Sul,4800,3700,320,140000,instagram,paid_social',
  'Bombinhas,Santa Catarina,2600,2000,180,72000,instagram,paid_social',
  'Holambra,São Paulo,1200,950,90,38000,email,newsletter',
  'Nova Lima,Minas Gerais,2400,1850,160,68000,google,cpc',
  'Cidade Inexistente,XX,500,400,10,2000,google,organic'
].join('\n');

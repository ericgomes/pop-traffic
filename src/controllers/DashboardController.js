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
    this.datasetMeta = null;
    this.metric = 'sessoes';
    this.matchResult = null;
    this.activeTab = this._tabFromHash() || 'dashboard';
    this.mapMode = 'cidade';
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
    window.addEventListener('hashchange', () => this.onHashChange());
    this.autoLoadFromUrl();
  }

  importText(text, meta) {
    const parsed = this.importer.parse(text);
    if (!parsed.ok) {
      this.view.showImportError(parsed.error);
      return;
    }
    this.rawRows = parsed.rows;
    this.availableMetrics = parsed.metrics;
    this.sourceHeaders = parsed.sourceHeaders || {};
    this.datasetMeta = meta || parsed.meta || null;
    this.metric = parsed.metrics.length ? parsed.metrics[0] : 'sessoes';
    this.filters = this._emptyFilters();
    this._runMatch();
    this._prepare();
    this._seedFilters();
    this.render();
  }

  loadSample() {
    this.importText(DashboardController.SAMPLE_CSV, { sample: true, property: 'Dados de exemplo', report: 'Demonstração' });
  }

  importFromSheets(url) {
    const ref = this._parseSheetUrl(url);
    if (!ref) {
      this.view.showImportError('Link do Google Sheets inválido. Cole a URL completa da planilha.');
      return;
    }
    this._importSheetRef(ref);
  }

  _importSheetRef(ref) {
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

  generateSheetToken(url) {
    const ref = this._parseSheetUrl(url);
    if (!ref) {
      this.view.showImportError('Cole primeiro o link da planilha para gerar o token.');
      return;
    }
    const token = DashboardController.encodeToken(ref.id, ref.gid);
    const link = location.origin + location.pathname + '?t=' + token;
    this.view.showSheetLink(link);
  }

  autoLoadFromUrl() {
    const params = new URLSearchParams(location.search);
    if (params.get('demo') || params.get('t') === 'demo') {
      this.loadSample();
      return true;
    }
    const token = params.get('t');
    if (!token) return false;
    const ref = DashboardController.decodeToken(token);
    if (!ref) return false;
    this._importSheetRef(ref);
    return true;
  }

  _parseSheetUrl(url) {
    const s = String(url || '').trim();
    if (!s) return null;
    const idMatch = s.match(/\/spreadsheets\/d\/([a-zA-Z0-9-_]+)/) || s.match(/^([a-zA-Z0-9-_]{20,})$/);
    if (!idMatch) return null;
    const gidMatch = s.match(/[#?&]gid=(\d+)/);
    return { id: idMatch[1], gid: gidMatch ? gidMatch[1] : '0' };
  }

  static encodeToken(id, gid) {
    return btoa(id + '|' + (gid || '0')).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  }

  static decodeToken(token) {
    try {
      const b = String(token).replace(/-/g, '+').replace(/_/g, '/');
      const parts = atob(b).split('|');
      if (!parts[0]) return null;
      return { id: parts[0], gid: parts[1] || '0' };
    } catch (e) {
      return null;
    }
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
    if (location.hash !== '#' + tab) {
      try { location.hash = tab; } catch (e) {}
    }
    this.render();
  }

  _tabFromHash() {
    const h = (location.hash || '').replace(/^#/, '').trim().toLowerCase();
    return DashboardController.TABS.indexOf(h) !== -1 ? h : null;
  }

  onHashChange() {
    const tab = this._tabFromHash();
    if (tab && tab !== this.activeTab) {
      this.activeTab = tab;
      if (this.matchResult && this.matchResult.performances.length) this.render();
    }
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
      datasetMeta: this.datasetMeta,
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
    this.exporter.exportCSV('analise-omsvs-' + this.metric + '.csv', cols, this.sortedList(this.filteredList()));
  }

  exportXLSX() {
    const cols = this._exportColumns();
    this.exporter.exportXLSX('analise-omsvs-' + this.metric + '.xlsx', cols, this.sortedList(this.filteredList()), 'OMSVS ' + Formatter.metricLabel(this.metric));
  }

  exportPDF() {
    const filtered = this.filteredList();
    const model = this.analysis.buildView(filtered, this.metric);
    this.exporter.exportPDF('analise-omsvs-' + this.metric + '.pdf', this._pdfReport(model));
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
      { label: 'OMSVS', value: (p) => Number(p.indicators.mps.toFixed(4)) },
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
        'Maior OMSVS: ' + (s.topCity ? s.topCity.municipio.label + ' (' + Formatter.mps(s.topCity.indicators.mps) + ')' : '—'),
        'Menor OMSVS: ' + (s.bottomCity ? s.bottomCity.municipio.label + ' (' + Formatter.mps(s.bottomCity.indicators.mps) + ')' : '—')
      ]
    });
    sections.push({
      title: 'Top 10 destaques por OMSVS',
      table: {
        columns: [
          { label: 'Município', width: 50 },
          { label: 'UF', width: 12 },
          { label: 'População', width: 28 },
          { label: metricLabel, width: 28 },
          { label: 'OMSVS', width: 16 },
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
          { label: 'OMSVS', width: 16 }
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
      title: 'Cidades — Online Market Share of Voice Score (OMSVS) por ' + metricLabel,
      subtitle: 'Base IBGE POP2025 (ref. ' + this.population.ref + ') · ' + Formatter.integer(s.municipios) + ' municípios analisados',
      sections: sections
    };
  }
}

DashboardController.TABS = ['dashboard', 'tabela', 'ranking', 'barras', 'heatmap', 'scatter', 'mapa', 'insights', 'casos'];

DashboardController.SAMPLE_CSV = [
  'cidade,estado,sessoes,usuarios,conversoes,receita,source,medium',
  'Colombo,PR,497,403,20,9836,tiktok,paid_social',
  'Nova Iguaçu,RJ,1962,1413,89,56092,email,newsletter',
  'Serra do Navio,AP,30,24,1,450,instagram,paid_social',
  'Caxias do Sul,RS,1396,1073,69,42126,instagram,paid_social',
  'Ipatinga,MG,105,76,3,1136,meta,cpc',
  'Francinópolis,PI,30,21,1,584,google,cpc',
  'Cerqueira César,SP,30,23,1,183,facebook,paid_social',
  'São Mateus do Sul,PR,79,59,1,349,instagram,paid_social',
  'Manoel Vitorino,BA,30,22,1,341,google,cpc',
  'Anápolis,GO,1333,1026,35,17826,(direct),(none)',
  'Amarante do Maranhão,MA,32,24,1,640,facebook,paid_social',
  'Contagem,MG,2143,1717,89,49654,meta,cpc',
  'Fortaleza,CE,1768,1298,86,21524,google,organic',
  'Aracaju,SE,1482,1093,51,33043,meta,cpc',
  'Cuiabá,MT,493,378,13,7585,google,organic',
  'Maringá,PR,576,437,23,4788,instagram,paid_social',
  'Erechim,RS,46,35,1,349,meta,cpc',
  'Manaus,AM,4487,3480,198,67665,bing,organic',
  'Madre de Deus,BA,122,99,3,1352,meta,cpc',
  'São José dos Campos,SP,4345,3204,188,65217,meta,cpc',
  'Bom Jesus,PB,30,24,1,314,google,cpc',
  'Belo Horizonte,MG,4366,3522,171,105408,bing,organic',
  'Natal,RN,541,435,11,2817,facebook,paid_social',
  'São João de Meriti,RJ,300,225,11,5652,tiktok,paid_social',
  'Belém,PA,1404,1073,64,22443,tiktok,paid_social',
  'Porto Real do Colégio,AL,30,23,1,258,google,organic',
  'Limoeiro,PE,154,114,6,3194,facebook,paid_social',
  'São Luís,MA,2848,2098,65,13648,email,newsletter',
  'Brasília,DF,3888,2953,166,36375,instagram,paid_social',
  'Taubaté,SP,482,376,10,6178,bing,organic',
  'Marechal Cândido Rondon,PR,72,53,2,483,google,cpc',
  'Joinville,SC,2071,1497,82,47918,(direct),(none)',
  'Vargem,SP,35,28,1,437,google,cpc',
  'Nova Floresta,PB,30,24,1,263,tiktok,paid_social',
  'Palmas,TO,114,92,3,1442,meta,cpc',
  'Casimiro de Abreu,RJ,119,89,3,1300,google,cpc',
  'Santos,SP,294,219,8,1440,google,cpc',
  'Nova Campina,SP,30,22,1,183,email,newsletter',
  'Brumado,BA,330,237,10,3176,facebook,paid_social',
  'Tijucas,SC,65,51,2,537,meta,cpc',
  'Campina Grande,PB,365,288,14,7971,facebook,paid_social',
  'Curitiba,PR,3865,2884,126,36866,tiktok,paid_social',
  'Betim,MG,1150,860,48,26886,bing,organic',
  'Blumenau,SC,159,117,3,732,google,cpc',
  'Itajaí,SC,199,148,7,1877,google,organic',
  'Campos dos Goytacazes,RJ,306,224,15,2856,google,cpc',
  'Piraquara,PR,184,140,3,667,google,organic',
  'Cáceres,MT,237,182,7,2285,email,newsletter',
  'Faxinal,PR,76,60,2,1152,google,cpc',
  'Paraíso,SP,30,21,1,213,email,newsletter',
  'Teresina,PI,3361,2503,105,19522,facebook,paid_social',
  'Niterói,RJ,5186,3933,255,75522,google,organic',
  'Sabinópolis,MG,37,26,1,277,bing,organic',
  'Indaiatuba,SP,1877,1479,55,18251,google,organic',
  'Carauari,AM,47,34,1,320,(direct),(none)',
  'Palmeiras de Goiás,GO,30,24,1,282,google,cpc',
  'Parauapebas,PA,534,385,23,10460,bing,organic',
  'Nova Odessa,SP,283,226,5,998,email,newsletter',
  'Mineiros,GO,97,77,2,829,tiktok,paid_social',
  'Santa Maria,RS,271,204,13,6980,google,organic',
  'Amambai,MS,238,188,10,2391,facebook,paid_social',
  'Natalândia,MG,30,22,1,482,(direct),(none)',
  'Goianésia,GO,176,130,7,2438,google,cpc',
  'São Bernardo do Campo,SP,515,383,10,5121,meta,cpc',
  'Mogi Mirim,SP,101,74,2,686,email,newsletter',
  'Londrina,PR,3812,2849,171,104276,meta,cpc',
  'Cupira,PE,72,55,3,1303,email,newsletter',
  'Santa Luzia,MG,990,712,38,13609,google,cpc',
  'Itabaianinha,SE,179,135,6,1984,google,cpc',
  'Paraty,RJ,31,24,1,362,meta,cpc',
  'Itacaré,BA,30,22,1,372,(direct),(none)',
  'Piranga,MG,30,21,1,211,google,cpc',
  'Redenção do Gurguéia,PI,30,21,1,194,bing,organic',
  'Santo André,SP,1552,1219,55,28028,instagram,paid_social',
  'Forquilha,CE,76,60,1,612,email,newsletter',
  'Jaboticabal,SP,144,117,6,2399,google,organic',
  'Itupeva,SP,43,34,1,553,google,organic',
  'Governador Edison Lobão,MA,100,80,2,398,google,cpc',
  'Itapema,SC,167,123,5,1137,facebook,paid_social',
  'São Carlos,SP,306,236,7,2991,facebook,paid_social',
  'Campinas,SP,235,182,8,4245,tiktok,paid_social',
  'Colatina,ES,77,58,2,985,google,cpc',
  'Gaspar,SC,169,128,5,1271,tiktok,paid_social',
  'Rio Bonito,RJ,158,120,4,1312,(direct),(none)',
  'Caucaia,CE,1049,821,46,15273,facebook,paid_social',
  'Franca,SP,259,201,6,3239,instagram,paid_social',
  'Mairiporã,SP,80,65,1,196,instagram,paid_social',
  'Rio Negrinho,SC,143,111,5,3234,instagram,paid_social',
  'Igarassu,PE,3041,2254,89,48292,instagram,paid_social',
  'Recife,PE,2845,2309,100,44821,tiktok,paid_social',
  'Cabedelo,PB,131,98,3,1057,tiktok,paid_social',
  'Fernandópolis,SP,146,108,4,1284,tiktok,paid_social',
  'Santo Amaro,BA,30,23,1,552,google,cpc',
  'Macaé,RJ,1477,1135,69,35213,google,cpc',
  'Três Lagoas,MS,118,93,4,867,google,organic',
  'Ananindeua,PA,518,420,15,8902,bing,organic',
  'Volta Redonda,RJ,85,68,2,973,tiktok,paid_social',
  'Visconde do Rio Branco,MG,169,137,6,2862,google,organic',
  'Vila Velha,ES,738,571,18,7490,facebook,paid_social',
  'Acreúna,GO,45,33,1,648,email,newsletter',
  'Porto Alegre,RS,2271,1655,74,40669,google,cpc',
  'Curvelo,MG,38,27,1,448,google,organic',
  'São Paulo,SP,9385,7131,310,157479,google,cpc',
  'Embu das Artes,SP,333,255,8,2926,tiktok,paid_social',
  'Corumbá,MS,244,193,6,1282,bing,organic',
  'Aparecida de Goiânia,GO,3073,2311,146,32427,bing,organic',
  'Tremembé,SP,39,29,1,191,instagram,paid_social',
  'Maragogipe,BA,88,64,2,1132,email,newsletter',
  'São Miguel da Boa Vista,SC,30,24,1,502,google,cpc',
  'Cafelândia,PR,30,23,1,232,google,organic',
  'São Gonçalo,RJ,1627,1195,73,23010,(direct),(none)',
  'Itaú,RN,32,25,1,391,google,organic',
  'Campo Mourão,PR,77,57,2,1065,meta,cpc',
  'Pedrinópolis,MG,30,23,1,246,google,organic',
  'Sete Lagoas,MG,87,67,2,416,facebook,paid_social',
  'Ponta Grossa,PR,2552,2038,98,20085,google,organic',
  'Salvador,BA,14692,11552,696,243114,google,cpc',
  'Rio Branco,AC,1097,791,50,24261,facebook,paid_social',
  'Osasco,SP,3736,2955,176,71771,tiktok,paid_social',
  'Icatu,MA,35,27,1,415,email,newsletter',
  'Tianguá,CE,34,24,1,323,email,newsletter',
  'Barra,BA,49,37,1,342,(direct),(none)',
  'Cabo Frio,RJ,232,190,11,3406,google,organic',
  'Senador Pompeu,CE,75,58,3,1795,google,organic',
  'Sanclerlândia,GO,114,84,3,1093,google,cpc',
  'Presidente Getúlio,SC,30,21,1,631,tiktok,paid_social',
  'Alfenas,MG,360,274,13,4945,instagram,paid_social',
  'São Miguel dos Campos,AL,30,24,1,434,facebook,paid_social',
  'Serra,ES,451,355,11,2694,meta,cpc',
  'Campo Grande,MS,552,447,18,10930,google,cpc',
  'Canoas,RS,291,214,6,2582,google,cpc',
  'Rio do Pires,BA,30,22,1,248,google,organic',
  'Governador Valadares,MG,515,392,16,6211,instagram,paid_social',
  'Goiânia,GO,343,252,8,1934,google,organic',
  'Florianópolis,SC,1041,777,38,10964,facebook,paid_social',
  'Lagoa do Barro do Piauí,PI,30,22,1,217,email,newsletter',
  'Jundiaí,SP,2518,1930,99,26380,bing,organic',
  'Foz do Iguaçu,PR,1875,1442,45,12187,google,organic',
  'João Pessoa,PB,175,142,8,2276,facebook,paid_social',
  'Macapá,AP,3050,2427,67,41254,email,newsletter',
  'Buíque,PE,179,134,6,1775,bing,organic',
  'Ibitinga,SP,43,34,1,567,(direct),(none)',
  'Ribeirão Preto,SP,199,154,7,3370,google,organic',
  'Boa Vista,RR,3109,2400,104,59144,google,organic',
  'Bom Jesus do Tocantins,TO,30,23,1,198,bing,organic',
  'Nova Friburgo,RJ,198,152,7,1422,instagram,paid_social',
  'Chapadinha,MA,30,23,1,258,instagram,paid_social',
  'Maceió,AL,3308,2584,71,30031,google,cpc',
  'Delmiro Gouveia,AL,30,21,1,264,tiktok,paid_social',
  'Limeira,SP,657,534,26,6333,bing,organic',
  'São Vicente,SP,492,376,23,13823,email,newsletter',
  'Lençóis Paulista,SP,132,96,3,1454,google,cpc',
  'Mogi das Cruzes,SP,683,499,22,7712,meta,cpc',
  'Itapitanga,BA,30,23,1,638,tiktok,paid_social',
  'Feira de Santana,BA,2551,1933,109,66354,tiktok,paid_social',
  'Viçosa,MG,95,76,4,1024,google,cpc',
  'Bom Sucesso do Sul,PR,30,22,1,541,email,newsletter',
  'Itaperuçu,PR,205,153,5,3011,facebook,paid_social',
  'Uberlândia,MG,6142,4429,214,88673,google,organic',
  'Simonésia,MG,33,25,1,281,email,newsletter',
  'Magé,RJ,146,113,2,1189,instagram,paid_social',
  'Ubiratã,PR,55,43,2,1135,google,organic',
  'Passo Fundo,RS,390,294,9,1757,tiktok,paid_social',
  'Belo Campo,BA,40,32,1,612,google,organic',
  'Presidente Médici,RO,341,251,9,4415,tiktok,paid_social',
  'Pirenópolis,GO,303,235,11,6975,tiktok,paid_social',
  'Jataí,GO,151,120,4,2407,google,cpc',
  'Gravataí,RS,536,426,24,5052,email,newsletter',
  'Juiz de Fora,MG,2398,1792,85,36259,facebook,paid_social',
  'Rosário do Catete,SE,45,35,1,522,meta,cpc',
  'Pindamonhangaba,SP,820,646,39,25098,instagram,paid_social',
  'Ribeira do Pombal,BA,82,62,3,906,tiktok,paid_social',
  'Medianeira,PR,225,164,8,3394,email,newsletter',
  'Fátima,BA,30,23,1,466,instagram,paid_social',
  'Guarujá,SP,497,359,19,4473,facebook,paid_social',
  'Água Boa,MT,51,40,2,749,(direct),(none)',
  'Arapiraca,AL,142,105,5,2521,instagram,paid_social',
  'Pacajus,CE,486,388,14,5854,(direct),(none)',
  'Viamão,RS,390,293,12,5368,google,organic',
  'Três Pontas,MG,57,45,1,571,email,newsletter',
  'João Ramalho,SP,30,23,1,474,meta,cpc',
  'Porto Seguro,BA,124,100,4,2250,google,organic',
  'Hortolândia,SP,598,473,17,7341,facebook,paid_social',
  'Palhoça,SC,203,157,6,3663,(direct),(none)',
  'Tangará da Serra,MT,300,241,9,3207,meta,cpc',
  'Monte Santo,BA,99,79,3,1089,tiktok,paid_social',
  'Cubatão,SP,629,472,28,14381,instagram,paid_social',
  'Jaboatão dos Guararapes,PE,3327,2533,116,33836,email,newsletter',
  'Guarulhos,SP,3175,2452,80,28470,google,organic',
  'Luziânia,GO,174,138,8,3108,google,organic',
  'Avanhandava,SP,34,25,1,407,meta,cpc',
  'Imperatriz,MA,64,48,1,541,google,cpc',
  'Manaquiri,AM,69,54,1,520,email,newsletter',
  'São José do Rio Preto,SP,107,81,4,937,instagram,paid_social',
  'Ibaiti,PR,176,137,3,1198,google,organic',
  'Taboão da Serra,SP,251,183,10,5304,google,organic',
  'Soure,PA,30,24,1,270,instagram,paid_social',
  'Bonito,PE,42,32,1,495,instagram,paid_social',
  'Duque de Caxias,RJ,2171,1566,83,34993,facebook,paid_social',
  'Tabatinga,AM,216,167,7,2151,instagram,paid_social',
  'São João do Ivaí,PR,30,22,1,434,google,organic',
  'Jerumenha,PI,30,21,1,497,google,cpc',
  'Raposos,MG,30,22,1,598,email,newsletter',
  'Caconde,SP,36,28,1,564,meta,cpc',
  'Rio de Janeiro,RJ,71536,56974,2649,592503,email,newsletter',
  'Belford Roxo,RJ,2296,1675,67,32352,email,newsletter',
  'Cacaulândia,RO,30,22,1,301,(direct),(none)',
  'Marituba,PA,292,221,11,5418,(direct),(none)',
  'Surubim,PE,86,66,2,793,google,cpc',
  'Rondon do Pará,PA,97,72,2,900,meta,cpc',
  'Maracanaú,CE,1630,1303,48,23291,instagram,paid_social',
  'Porto Velho,RO,2381,1841,76,28448,tiktok,paid_social',
  'Montes Claros,MG,715,549,15,4168,tiktok,paid_social',
  'Inácio Martins,PR,30,22,1,446,(direct),(none)',
  'Cataguases,MG,55,43,1,617,tiktok,paid_social',
  'Jacareí,SP,331,266,7,3221,(direct),(none)',
  'Sorocaba,SP,231,170,11,2339,google,cpc',
  'Piedade,SP,47,37,1,565,(direct),(none)',
  'Vitória,ES,136,99,6,3582,google,organic',
  'Arcoverde,PE,138,109,5,1964,instagram,paid_social',
  'Poço Fundo,MG,30,22,1,328,tiktok,paid_social',
  'Serra Grande,PB,30,23,1,611,bing,organic',
  'Cravinhos,SP,35,28,1,467,meta,cpc',
  'Maracaçumé,MA,30,22,1,318,(direct),(none)',
  'Mondaí,SC,123,88,4,2559,google,cpc',
  'Porto Nacional,TO,30,24,1,290,tiktok,paid_social',
  'Rio Claro,SP,174,131,5,2181,google,cpc',
  'Nossa Senhora do Socorro,SE,545,418,13,4689,(direct),(none)',
  'Martinópolis,SP,54,44,2,486,google,cpc',
  'Monteiro,PB,34,26,1,595,bing,organic',
  'Concórdia,SC,231,169,10,5842,tiktok,paid_social',
  'Campos de Júlio,MT,30,24,1,393,bing,organic',
  'Piracicaba,SP,263,198,6,2784,tiktok,paid_social',
].join(String.fromCharCode(10));

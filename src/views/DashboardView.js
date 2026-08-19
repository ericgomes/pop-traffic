class DashboardView {
  constructor() {
    this.controller = null;
    this.tooltip = document.getElementById('tooltip');
    this.tabs = [
      { id: 'dashboard', label: 'Dashboard' },
      { id: 'tabela', label: 'Tabela' },
      { id: 'ranking', label: 'Ranking' },
      { id: 'barras', label: 'Barras' },
      { id: 'heatmap', label: 'Heatmap' },
      { id: 'scatter', label: 'Scatter' },
      { id: 'mapa', label: 'Mapa' },
      { id: 'insights', label: 'Insights' },
      { id: 'casos', label: 'Casos especiais' }
    ];
  }

  bind(controller) {
    this.controller = controller;
    const c = controller;

    document.getElementById('file-input').addEventListener('change', (e) => this._onFile(e));
    document.getElementById('paste-btn').addEventListener('click', () => {
      const text = document.getElementById('paste-area').value;
      c.importText(text);
    });
    document.getElementById('sample-btn').addEventListener('click', () => c.loadSample());
    document.getElementById('sheet-btn').addEventListener('click', () => c.importFromSheets(document.getElementById('sheet-url').value));
    document.getElementById('sheet-token-btn').addEventListener('click', () => c.generateSheetToken(document.getElementById('sheet-url').value));
    document.getElementById('import-status').addEventListener('click', (e) => {
      if (!e.target.closest('#copy-token')) return;
      const input = document.getElementById('token-link');
      if (!input) return;
      input.select();
      try { navigator.clipboard.writeText(input.value); } catch (err) { document.execCommand('copy'); }
      e.target.textContent = 'copiado!';
    });
    document.getElementById('reset-filters').addEventListener('click', () => c.resetFilters());

    this._restoreSidebar();
    document.getElementById('sidebar-toggle').addEventListener('click', () => this._toggleSidebar());

    const help = document.getElementById('help-modal');
    document.getElementById('help-btn').addEventListener('click', () => { help.hidden = false; });
    document.getElementById('help-close').addEventListener('click', () => { help.hidden = true; });
    help.addEventListener('click', (e) => { if (e.target === help) help.hidden = true; });
    document.addEventListener('keydown', (e) => { if (e.key === 'Escape') help.hidden = true; });

    document.getElementById('tabs').addEventListener('click', (e) => {
      const btn = e.target.closest('button[data-tab]');
      if (btn) c.setActiveTab(btn.dataset.tab);
    });

    document.getElementById('export-bar').addEventListener('click', (e) => {
      const btn = e.target.closest('button[data-export]');
      if (!btn) return;
      if (btn.dataset.export === 'csv') c.exportCSV();
      if (btn.dataset.export === 'xlsx') c.exportXLSX();
      if (btn.dataset.export === 'pdf') c.exportPDF();
    });

    document.getElementById('metric-options').addEventListener('click', (e) => {
      const opt = e.target.closest('.metric-opt');
      if (opt && !opt.classList.contains('disabled')) c.setMetric(opt.dataset.metric);
    });

    document.getElementById('filters').addEventListener('click', (e) => {
      const allBtn = e.target.closest('[data-all]');
      if (allBtn) { allBtn.dataset.all === 'uf' ? c.selectAllUfs() : c.selectAllBands(); return; }
      const bandPreset = e.target.closest('[data-bandpreset]');
      if (bandPreset) { c.selectBandPreset(bandPreset.dataset.bandpreset); return; }
      const preset = e.target.closest('.preset-btn');
      if (preset) { c.applyChannelPreset(preset.dataset.preset); return; }
      const chip = e.target.closest('.uf-chip');
      if (chip) { c.toggleUf(chip.dataset.uf); return; }
      const band = e.target.closest('.band-chip');
      if (band) { c.toggleBand(band.dataset.band); return; }
      const seg = e.target.closest('.seg button');
      if (seg) c.updateFilters({ tipo: seg.dataset.tipo });
    });
    document.getElementById('filters').addEventListener('change', (e) => {
      const med = e.target.closest('input[data-medium]');
      if (med) { c.toggleMedium(med.dataset.medium); return; }
      const src = e.target.closest('input[data-source]');
      if (src) { c.toggleSource(src.dataset.source); return; }
      const input = e.target.closest('input[data-filter]');
      if (input) this._onFilterInput(input);
    });

    document.querySelectorAll('.panel .panel-toggle').forEach((h) =>
      h.addEventListener('click', () => h.closest('.panel').classList.toggle('collapsed')));

    const content = document.getElementById('tab-content');
    content.addEventListener('click', (e) => this._onContentClick(e));
    content.addEventListener('change', (e) => this._onContentChange(e));
    content.addEventListener('mousemove', (e) => this._onTip(e));
    content.addEventListener('mouseleave', () => this._hideTip());
  }

  _onFile(e) {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      document.getElementById('file-label').querySelector('span').textContent = file.name;
      this.controller.importText(String(reader.result));
    };
    reader.readAsText(file, 'utf-8');
  }

  _onFilterInput(input) {
    const value = input.value.trim() === '' ? null : Number(input.value);
    const patch = {};
    patch[input.dataset.filter] = value === null || isNaN(value) ? null : value;
    this.controller.updateFilters(patch);
  }

  _restoreSidebar() {
    let collapsed = false;
    try {
      collapsed = localStorage.getItem('sidebar_collapsed') === '1';
    } catch (e) {}
    this._applySidebar(collapsed);
  }

  _toggleSidebar() {
    const collapsed = !document.querySelector('.layout').classList.contains('collapsed');
    this._applySidebar(collapsed);
    try {
      localStorage.setItem('sidebar_collapsed', collapsed ? '1' : '0');
    } catch (e) {}
  }

  _applySidebar(collapsed) {
    document.querySelector('.layout').classList.toggle('collapsed', collapsed);
    const btn = document.getElementById('sidebar-toggle');
    if (btn) {
      btn.setAttribute('aria-pressed', collapsed ? 'true' : 'false');
      btn.title = collapsed ? 'Mostrar painel' : 'Ocultar painel';
    }
  }

  _onContentClick(e) {
    const th = e.target.closest('th[data-sort]');
    if (th) { this.controller.setSort(th.dataset.sort); return; }
    const metricBtn = e.target.closest('button[data-mapmetric]');
    if (metricBtn) { this.controller.setMetric(metricBtn.dataset.mapmetric); return; }
    const modeBtn = e.target.closest('button[data-mapmode]');
    if (modeBtn) { this.controller.setMapMode(modeBtn.dataset.mapmode); return; }
    const clearBtn = e.target.closest('#clear-corrections');
    if (clearBtn) this.controller.clearCorrections();
  }

  _onContentChange(e) {
    const input = e.target.closest('[data-correct]');
    if (!input) return;
    const code = this._resolveMunicipioInput(input.value);
    if (code) this.controller.applyCorrection(input.dataset.correct, code);
  }

  renderShell(base) {
    const fmtTotal = Formatter.compact(base.total);
    document.getElementById('base-summary').innerHTML =
      '<div class="b-item"><div class="b-num">' + Formatter.integer(base.count) + '</div><div class="b-lbl">municípios IBGE</div></div>' +
      '<div class="b-item"><div class="b-num">' + fmtTotal + '</div><div class="b-lbl">habitantes (ref. 01/07/2025)</div></div>' +
      '<div class="b-item"><div class="b-num">' + (base.cached ? 'cache' : 'novo') + '</div><div class="b-lbl">base local</div></div>';
    document.getElementById('tabs').innerHTML = this.tabs
      .map((t) => '<button data-tab="' + t.id + '">' + t.label + '<span class="tab-count" id="cnt-' + t.id + '"></span></button>')
      .join('');
  }

  renderEmpty() {
    document.getElementById('metric-panel').hidden = true;
    document.getElementById('filter-panel').hidden = true;
    document.getElementById('export-bar').hidden = true;
    document.getElementById('dataset-header').hidden = true;
    document.getElementById('kpi-grid').innerHTML = '';
    document.getElementById('tab-content').innerHTML =
      '<div class="empty"><div class="big">📊</div><h3>Importe um CSV do Google Analytics 4 para começar</h3>' +
      '<p class="sub">O sistema cruza o tráfego com a população estimada de 5.571 municípios (IBGE POP2025) e calcula o Market Share of Voice Score (MSVS) de cada cidade.</p>' +
      '<p class="sub">Use o botão <b>Carregar dados de exemplo</b> para uma demonstração imediata.</p></div>';
  }

  showImportError(message) {
    document.getElementById('import-status').innerHTML = '<div class="err">⚠ ' + this._esc(message) + '</div>';
  }

  showImportInfo(message) {
    document.getElementById('import-status').innerHTML = '<div style="color:var(--ink-soft)">⏳ ' + this._esc(message) + '</div>';
  }

  showSheetLink(link) {
    document.getElementById('import-status').innerHTML =
      '<div class="token-box"><div class="ok">✓ Link gerado — já abre esta planilha automaticamente:</div>' +
      '<input type="text" id="token-link" class="sheet-input" readonly value="' + this._attr(link) + '">' +
      '<button class="btn btn-secondary" id="copy-token" type="button">copiar link</button></div>';
  }

  render(model) {
    this.model = model;
    document.getElementById('metric-panel').hidden = false;
    document.getElementById('filter-panel').hidden = false;
    document.getElementById('export-bar').hidden = false;

    this._renderDatasetBanner(model);
    this._renderStatus(model);
    this._renderMetricOptions(model);
    this._renderFilters(model);
    this._renderKpis(model);
    this._renderTabs(model);
    this._renderActiveTab(model);
  }

  _renderDatasetBanner(model) {
    const el = document.getElementById('dataset-header');
    const m = model.datasetMeta;
    if (!m || (!m.property && !m.period)) { el.hidden = true; el.innerHTML = ''; return; }
    const parts = [];
    if (m.property) parts.push('<span class="ds-item"><span class="ds-lbl">Propriedade GA4</span><span class="ds-val">' + this._esc(m.property) + '</span></span>');
    if (m.report) parts.push('<span class="ds-item"><span class="ds-lbl">Relatório</span><span class="ds-val">' + this._esc(m.report) + '</span></span>');
    if (m.period) parts.push('<span class="ds-item"><span class="ds-lbl">Período</span><span class="ds-val">' + this._esc(m.period) + '</span></span>');
    el.innerHTML = parts.join('');
    el.hidden = false;
  }

  _renderStatus(model) {
    const st = model.matchResult.stats;
    const badges = model.availableMetrics.map((m) => '<span class="badge">' + Formatter.metricLabel(m) + '</span>').join('');
    const cov = st.coverage ? st.coverage[model.metric] : 0;
    const foreign = st.foreignRows
      ? '<div style="color:var(--ink-soft);margin-top:4px">' + Formatter.integer(st.foreignRows) + ' linhas fora do Brasil / (not set) ignoradas</div>'
      : '';
    document.getElementById('import-status').innerHTML =
      '<div class="ok">✓ ' + Formatter.integer(st.matchedCities) + ' municípios BR cruzados · ' +
      Formatter.percent(cov, 1) + ' de ' + Formatter.metricLabel(model.metric) + ' coberta</div>' + foreign +
      '<div style="margin-top:6px">' + badges + '</div>';
  }

  _renderMetricOptions(model) {
    const all = ['sessoes', 'usuarios', 'conversoes', 'receita'];
    const sources = model.sourceHeaders || {};
    document.getElementById('metric-options').innerHTML = all.map((m) => {
      const enabled = model.availableMetrics.indexOf(m) !== -1;
      const cls = 'metric-opt' + (m === model.metric ? ' active' : '') + (enabled ? '' : ' disabled');
      const src = sources[m] && Normalizer.normalizeName(sources[m]) !== Normalizer.normalizeName(Formatter.metricLabel(m))
        ? '<small class="metric-src">← ' + this._esc(sources[m]) + '</small>'
        : '';
      return '<div class="' + cls + '" data-metric="' + m + '"><span>' + (m === model.metric ? '●' : '○') + '</span> ' +
        Formatter.metricLabel(m) + src + '</div>';
    }).join('');
  }

  _renderFilters(model) {
    const f = model.filters;
    const head = (label, allKey) =>
      '<div class="filter-head"><label>' + label + '</label>' +
      '<button class="all-btn" data-all="' + allKey + '">Todas</button></div>';
    const chips = model.ufList.map((uf) =>
      '<span class="uf-chip' + (f.ufs.has(uf) ? ' active' : '') + '" data-uf="' + uf + '">' + uf + '</span>').join('');
    const seg = ['todos', 'capital', 'interior'].map((t) =>
      '<button class="' + (f.tipo === t ? 'active' : '') + '" data-tipo="' + t + '">' + (t === 'todos' ? 'Todos' : t === 'capital' ? 'Capitais' : 'Interior') + '</button>').join('');
    const range = (label, a, b) =>
      '<div class="filter-group"><label>' + label + '</label><div class="range-row">' +
      '<input type="number" step="any" data-filter="' + a + '" placeholder="mín" value="' + (f[a] !== null ? f[a] : '') + '">' +
      (b ? '<input type="number" step="any" data-filter="' + b + '" placeholder="máx" value="' + (f[b] !== null ? f[b] : '') + '">' : '') +
      '</div></div>';
    const bandKeys = Array.from(f.msvsBands).sort().join(',');
    const top3 = MPS_BANDS.slice(0, 3).map((b) => b.key).sort().join(',');
    const bot3 = MPS_BANDS.slice(3).map((b) => b.key).sort().join(',');
    const bandPresets = '<div class="preset-row">' +
      '<button class="preset-btn' + (bandKeys === top3 ? ' active' : '') + '" data-bandpreset="melhores">🟢 3 melhores</button>' +
      '<button class="preset-btn' + (bandKeys === bot3 ? ' active' : '') + '" data-bandpreset="piores">🔴 3 piores</button></div>';
    const dist = this._bandDistribution(model.filtered);
    const bandChips = MPS_BANDS.map((b) =>
      '<span class="band-chip' + (f.msvsBands.has(b.key) ? ' active' : '') + '" data-band="' + b.key + '" title="' + b.label + ' (' + b.short + ')">' +
      '<span class="band-dot" style="background:' + b.color + '"></span>' + b.label +
      '<span class="band-count">' + (dist.counts[b.key] || 0) + '</span></span>').join('');
    document.getElementById('filters').innerHTML =
      '<div class="filter-group">' + head('UF', 'uf') + '<div class="uf-chips">' + chips + '</div></div>' +
      '<div class="filter-group"><label>Capital ou Interior</label><div class="seg">' + seg + '</div></div>' +
      this._channelFilters(model) +
      range('População', 'popMin', 'popMax') +
      '<div class="filter-group">' + head('Faixa de MSVS', 'band') + bandPresets + '<div class="band-chips">' + bandChips + '</div></div>' +
      range('MSVS (mín / máx)', 'mpsMin', 'mpsMax') +
      range('Sessões mín.', 'sessoesMin') +
      range('Usuários mín.', 'usuariosMin') +
      range('Conversões mín.', 'conversoesMin') +
      range('Receita mín.', 'receitaMin');
  }

  _channelFilters(model) {
    const ch = model.channels || { sources: [], mediums: [] };
    if (!ch.sources.length && !ch.mediums.length) return '';
    const f = model.filters;
    const preset = model.channelPreset;
    const presets = [['organica', 'Orgânica'], ['paga', 'Paga'], ['naopaga', 'Não paga'], ['todas', 'Todas']].map((p) =>
      '<button class="preset-btn' + (preset === p[0] ? ' active' : '') + '" data-preset="' + p[0] + '">' + p[1] + '</button>').join('');
    const checks = (key, label, options, selected) => {
      if (!options.length) return '';
      const items = options.map((o) =>
        '<label class="check"><input type="checkbox" data-' + key + '="' + this._attr(o) + '"' + (selected.has(o) ? ' checked' : '') + '> ' + this._esc(o || '(vazio)') + '</label>').join('');
      return '<div class="sub-label">' + label + '</div><div class="check-list">' + items + '</div>';
    };
    return '<div class="filter-group"><label>Canais (source / medium)</label>' +
      '<div class="preset-row">' + presets + '</div>' +
      checks('medium', 'Mídia (medium)', ch.mediums, f.mediums) +
      checks('source', 'Fonte (source)', ch.sources, f.sources) +
      '</div>';
  }

  _bandDistribution(list) {
    const counts = {};
    for (const b of MPS_BANDS) counts[b.key] = 0;
    for (const p of list) {
      const k = p.indicators.band.key;
      if (counts[k] === undefined) counts[k] = 0;
      counts[k]++;
    }
    return { counts: counts, total: list.length };
  }

  _bandDistributionHtml(model) {
    const dist = this._bandDistribution(model.filtered);
    if (!dist.total) return '';
    const bar = MPS_BANDS.map((b) => {
      const pct = dist.total ? (dist.counts[b.key] / dist.total) * 100 : 0;
      if (pct <= 0) return '';
      return '<div class="dist-seg" style="width:' + pct.toFixed(2) + '%;background:' + b.color + '" data-tip="' +
        this._attr('<b>' + b.label + '</b>|' + dist.counts[b.key] + ' cidades · ' + pct.toFixed(1) + '%') + '"></div>';
    }).join('');
    const legend = MPS_BANDS.map((b) => {
      const c = dist.counts[b.key];
      const pct = dist.total ? (c / dist.total) * 100 : 0;
      return '<div class="dist-item"><span class="sw" style="background:' + b.color + '"></span>' +
        '<span class="dist-name">' + b.label + '</span><span class="dist-val"><b>' + c + '</b> · ' + pct.toFixed(1) + '%</span></div>';
    }).join('');
    return '<div class="dist-block"><h4 style="margin:0 0 8px;font-size:13px">Distribuição por faixa de MSVS <span class="tag">' + dist.total + ' cidades</span></h4>' +
      '<div class="dist-bar">' + bar + '</div><div class="dist-legend">' + legend + '</div></div>';
  }

  _renderKpis(model) {
    const s = model.view.summary;
    const has = (m) => model.availableMetrics.indexOf(m) !== -1;
    const item = (lbl, val, sub, cls) =>
      '<div class="kpi-item ' + (cls || '') + '"><div class="k-lbl">' + lbl + '</div><div class="k-val">' + val +
      '</div><div class="k-sub">' + this._esc(sub || '') + '</div></div>';
    const metricItem = (metric, value) => {
      const on = has(metric);
      return item(Formatter.metricLabel(metric), on ? value : '—', on ? 'total' : 'sem dados', on ? '' : 'muted');
    };
    const reachOn = has('usuarios');
    const groupA = item('Municípios', Formatter.integer(s.municipios), 'com tráfego cruzado') +
      item('População coberta', Formatter.compact(s.population), Formatter.percent(s.coverage, 1) + ' do Brasil', 'accent') +
      item('Alcance', reachOn ? Formatter.percent(s.reach, 2) : '—', 'usuários / população', reachOn ? '' : 'muted');
    const groupB = metricItem('sessoes', Formatter.compact(s.totalSessoes)) +
      metricItem('usuarios', Formatter.compact(s.totalUsuarios)) +
      metricItem('conversoes', Formatter.compact(s.totalConversoes)) +
      metricItem('receita', Formatter.currency(s.totalReceita));
    const groupC = item('Menor MSVS', s.bottomCity ? Formatter.mps(s.bottomCity.indicators.mps) : '—', s.bottomCity ? s.bottomCity.municipio.label : '', 'bad') +
      item('Maior MSVS', s.topCity ? Formatter.mps(s.topCity.indicators.mps) : '—', s.topCity ? s.topCity.municipio.label : '', 'good');
    document.getElementById('kpi-grid').innerHTML =
      '<div class="kpi-group cobertura">' + groupA + '</div>' +
      '<div class="kpi-group trafego">' + groupB + '</div>' +
      '<div class="kpi-group msvs">' + groupC + '</div>';
  }

  _renderTabs(model) {
    this.tabs.forEach((t) => {
      const btn = document.querySelector('#tabs button[data-tab="' + t.id + '"]');
      if (btn) btn.classList.toggle('active', t.id === model.activeTab);
    });
    this._setCount('tabela', model.filtered.length);
    this._setCount('casos', model.matchResult.unmatched.length);
  }

  _setCount(id, n) {
    const el = document.getElementById('cnt-' + id);
    if (el) el.textContent = n ? '(' + n + ')' : '';
  }

  _renderActiveTab(model) {
    const map = {
      dashboard: () => this._tabDashboard(model),
      tabela: () => this._tabTable(model),
      ranking: () => this._tabRanking(model),
      barras: () => this._tabBars(model),
      heatmap: () => this._tabHeatmap(model),
      scatter: () => this._tabScatter(model),
      mapa: () => this._tabMap(model),
      insights: () => this._tabInsights(model),
      casos: () => this._tabCases(model)
    };
    document.getElementById('tab-content').innerHTML = (map[model.activeTab] || map.dashboard)();
  }

  _tabDashboard(model) {
    const s = model.view.summary;
    const opp = s.topOpportunities.map((p, i) => this._miniRow(i, p, Formatter.mps(p.indicators.mps))).join('');
    const high = s.topHighlights.map((p, i) => this._miniRow(i, p, Formatter.mps(p.indicators.mps))).join('');
    const insights = model.view.insights.slice(0, 4).map((i) =>
      '<div class="insight ' + i.type + '"><div class="ic-city">' + this._esc(i.city) + '</div>' + this._esc(i.text) + '</div>').join('');
    return '<h3>Dashboard executivo</h3><p class="sub">Visão consolidada da performance digital proporcional à população — métrica: <b>' + Formatter.metricLabel(model.metric) + '</b>.</p>' +
      this._bandDistributionHtml(model) +
      '<div class="ranking-grid">' +
      '<div class="rank-card"><h4>🚀 Top 10 destaques (maior MSVS)</h4><ul class="rank-list">' + high + '</ul></div>' +
      '<div class="rank-card"><h4>🎯 Top 10 oportunidades (baixa presença x população)</h4><ul class="rank-list">' + opp + '</ul></div>' +
      '</div><h4 style="margin:20px 0 10px;font-size:14px">Insights automáticos</h4><div class="insights-grid">' + insights + '</div>';
  }

  _miniRow(i, p, value) {
    return '<li><span class="pos">' + (i + 1) + '</span>' +
      '<span class="pill" style="background:' + p.indicators.band.color + '">' + value + '</span>' +
      '<span class="nm" data-tip="' + this._tipFor(p) + '">' + this._esc(p.municipio.name) + ' <span class="tag' + (p.municipio.isCapital ? ' cap' : '') + '">' + p.municipio.uf + '</span></span>' +
      '<span class="vl">' + Formatter.compact(p.indicators.value) + '</span></li>';
  }

  _tabTable(model) {
    const hasOrigin = model.filtered.some((p) => p.hasChannel);
    const cols = [
      { key: 'name', label: 'Município', left: true },
      { key: 'uf', label: 'UF', left: true }
    ];
    if (hasOrigin) cols.push({ key: 'origem', label: 'Origem', left: true, noSort: true });
    cols.push(
      { key: 'population', label: 'População' },
      { key: 'value', label: Formatter.metricLabel(model.metric) },
      { key: 'per100k', label: '/100k hab' },
      { key: 'metricShare', label: '% métrica' },
      { key: 'popShare', label: '% pop' },
      { key: 'reach', label: 'Alcance' },
      { key: 'mps', label: 'MSVS' }
    );
    const head = cols.map((c) => {
      if (c.noSort) return '<th class="' + (c.left ? 'left' : '') + '">' + c.label + '</th>';
      const sorted = model.sort.key === c.key;
      const arrow = sorted ? (model.sort.dir === 'desc' ? ' ↓' : ' ↑') : '';
      return '<th data-sort="' + c.key + '" class="' + (c.left ? 'left ' : '') + (sorted ? 'sorted' : '') + '">' + c.label + arrow + '</th>';
    }).join('');
    const body = model.sortedRows.map((p) => {
      const ind = p.indicators;
      const originTd = hasOrigin ? '<td class="left">' + this._esc(p.originLabel || '—') + '</td>' : '';
      return '<tr><td class="left" data-tip="' + this._tipFor(p) + '">' + this._esc(p.municipio.name) +
        ' <span class="tag' + (p.municipio.isCapital ? ' cap' : '') + '">' + (p.municipio.isCapital ? 'capital' : 'interior') + '</span></td>' +
        '<td class="left">' + p.municipio.uf + '</td>' +
        originTd +
        '<td>' + Formatter.integer(p.municipio.population) + '</td>' +
        '<td>' + Formatter.metricValue(model.metric, ind.value) + '</td>' +
        '<td>' + Formatter.decimal(ind.per100k, 1) + '</td>' +
        '<td>' + Formatter.percent(ind.metricShare, 2) + '</td>' +
        '<td>' + Formatter.percent(ind.popShare, 2) + '</td>' +
        '<td>' + Formatter.percent(ind.reach, 2) + '</td>' +
        '<td><span class="pill" style="background:' + ind.band.color + '">' + Formatter.mps(ind.mps) + '</span></td></tr>';
    }).join('');
    return '<h3>Tabela completa</h3><p class="sub">' + Formatter.integer(model.filtered.length) + ' municípios · clique nos cabeçalhos para ordenar.</p>' +
      '<div class="table-wrap"><table class="grid"><thead><tr>' + head + '</tr></thead><tbody>' + body + '</tbody></table></div>';
  }

  _tabRanking(model) {
    const c = model.view.classifications;
    const mps = (p) => Formatter.mps(p.indicators.mps);
    const card = (b) => {
      const items = b.list.slice(0, 12).map((p, i) => this._miniRow(i, p, b.fmt(p))).join('') ||
        '<li style="color:var(--ink-soft)">sem municípios nesta faixa</li>';
      return '<div class="rank-card ' + (b.cls || '') + '"><h4>' + b.t + ' <span class="tag">' + b.list.length + '</span></h4><ul class="rank-list">' + items + '</ul></div>';
    };
    const topMps = card({ t: '🏆 Maior MSVS', list: c.topMps, fmt: mps, cls: 'rank-top' });
    const bottomMps = card({ t: '📉 Menor MSVS', list: c.bottomMps, fmt: mps, cls: 'rank-bottom' });
    const rest = [
      { t: '🏙️ Top capitais', list: c.topCapitais, fmt: mps },
      { t: '🌄 Top interior', list: c.topInterior, fmt: mps },
      { t: '⚡ Acima de 2× o esperado', list: c.above2x, fmt: mps },
      { t: '🔥 Acima de 5× o esperado', list: c.above5x, fmt: mps },
      { t: '🎯 Top oportunidades', list: c.opportunities, fmt: mps },
      { t: '💰 Top receita proporcional', list: c.topReceita, fmt: (p) => Formatter.currency(p.indicators.receitaPer100k) + '/100k' }
    ].map(card).join('');
    return '<h3>Classificações</h3><p class="sub">Rankings por Market Share of Voice Score — métrica: <b>' + Formatter.metricLabel(model.metric) + '</b>.</p>' +
      '<div class="rank-extremes"><div class="rank-col rank-col-top"><div class="rank-col-label">▲ Melhores</div>' + topMps + '</div>' +
      '<div class="rank-col rank-col-bottom"><div class="rank-col-label">▼ Piores</div>' + bottomMps + '</div></div>' +
      '<div class="rank-divider">Outras classificações</div>' +
      '<div class="ranking-grid">' + rest + '</div>';
  }

  _tabBars(model) {
    const list = model.view.classifications.topMps.slice(0, 25);
    if (!list.length) return '<h3>Gráfico de barras</h3><p class="sub">Sem dados.</p>';
    const max = list[0].indicators.mps || 1;
    const rows = list.map((p) => {
      const w = Math.max(2, (p.indicators.mps / max) * 100);
      return '<div class="bar-row"><div class="nm" data-tip="' + this._tipFor(p) + '" style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap">' +
        this._esc(p.municipio.name) + ' <span class="tag">' + p.municipio.uf + '</span></div>' +
        '<div class="bar-track"><div class="bar-fill" style="width:' + w + '%;background:' + p.indicators.band.color + '"></div></div>' +
        '<div style="text-align:right;font-weight:700">' + Formatter.mps(p.indicators.mps) + '</div></div>';
    }).join('');
    return '<h3>Top 25 cidades por MSVS</h3><p class="sub">Quanto maior a barra, maior a presença digital proporcional à população.</p>' +
      this._bandLegend() + '<div class="bars">' + rows + '</div>';
  }

  _tabHeatmap(model) {
    const list = model.view.sorted;
    if (!list.length) return '<h3>Heatmap</h3><p class="sub">Sem dados.</p>';
    const cells = list.map((p) =>
      '<div class="heat-cell" data-tip="' + this._tipFor(p) + '" style="background:' + p.indicators.band.color + '">' +
      '<span>' + this._esc(this._abbr(p.municipio.name)) + '<br>' + Formatter.mps(p.indicators.mps) + '</span></div>').join('');
    return '<h3>Heatmap de MSVS</h3><p class="sub">Todas as ' + Formatter.integer(list.length) + ' cidades filtradas, ordenadas por MSVS e coloridas pela faixa de performance.</p>' +
      this._bandLegend() + '<div class="heatmap heatmap-auto">' + cells + '</div>';
  }

  _tabScatter(model) {
    const data = model.filtered.filter((p) => p.indicators.value > 0);
    if (!data.length) return '<h3>Scatter Plot</h3><p class="sub">Sem dados.</p>';
    const W = 900, H = 520, pad = 56;
    const pops = data.map((p) => p.municipio.population);
    const vals = data.map((p) => p.indicators.value);
    const mpsArr = data.map((p) => p.indicators.mps);
    const lx = (v) => Math.log10(Math.max(1, v));
    const minX = lx(Math.min.apply(null, pops)), maxX = lx(Math.max.apply(null, pops));
    const minY = lx(Math.min.apply(null, vals)), maxY = lx(Math.max.apply(null, vals));
    const maxMps = Math.max.apply(null, mpsArr) || 1;
    const sx = (v) => pad + ((lx(v) - minX) / (maxX - minX || 1)) * (W - pad * 2);
    const sy = (v) => H - pad - ((lx(v) - minY) / (maxY - minY || 1)) * (H - pad * 2);
    const r = (m) => 4 + Math.sqrt(Math.max(0, m) / maxMps) * 22;
    const px = (v) => pad + ((v - minX) / (maxX - minX || 1)) * (W - pad * 2);
    const py = (v) => H - pad - ((v - minY) / (maxY - minY || 1)) * (H - pad * 2);
    const proportion = this._proportionLine(model, minX, maxX, minY, maxY, px, py);
    const quadrants = this._quadrants(data, lx, minX, maxX, minY, maxY, px, py, W, H, pad, model.metric);
    const dots = data.map((p) =>
      '<circle class="scatter-dot" cx="' + sx(p.municipio.population).toFixed(1) + '" cy="' + sy(p.indicators.value).toFixed(1) +
      '" r="' + r(p.indicators.mps).toFixed(1) + '" fill="' + p.indicators.band.color + '" data-tip="' + this._tipFor(p) + '"></circle>').join('');
    const gx = this._axisTicks(minX, maxX).map((t) => {
      const x = pad + ((t - minX) / (maxX - minX || 1)) * (W - pad * 2);
      return '<line x1="' + x + '" y1="' + pad + '" x2="' + x + '" y2="' + (H - pad) + '" stroke="#eef2f7"/>' +
        '<text x="' + x + '" y="' + (H - pad + 16) + '" text-anchor="middle">' + Formatter.compact(Math.pow(10, t)) + '</text>';
    }).join('');
    const gy = this._axisTicks(minY, maxY).map((t) => {
      const y = H - pad - ((t - minY) / (maxY - minY || 1)) * (H - pad * 2);
      return '<line x1="' + pad + '" y1="' + y + '" x2="' + (W - pad) + '" y2="' + y + '" stroke="#eef2f7"/>' +
        '<text x="' + (pad - 8) + '" y="' + (y + 3) + '" text-anchor="end">' + Formatter.compact(Math.pow(10, t)) + '</text>';
    }).join('');
    return '<h3>Scatter Plot — População × ' + Formatter.metricLabel(model.metric) + '</h3>' +
      '<p class="sub">Escala logarítmica. Bolha = MSVS · cor = faixa · <b>linha diagonal</b> = proporção exata (MSVS = 1, %métrica = %população) · <b>cruz pontilhada</b> = mediana (4 quadrantes).</p>' + this._bandLegend() +
      '<svg class="chart" viewBox="0 0 ' + W + ' ' + H + '">' + gx + gy +
      '<text x="' + (W / 2) + '" y="' + (H - 12) + '" text-anchor="middle">População estimada 2025</text>' +
      '<text x="16" y="' + (H / 2) + '" text-anchor="middle" transform="rotate(-90 16 ' + (H / 2) + ')">' + Formatter.metricLabel(model.metric) + '</text>' +
      dots + proportion + quadrants + '</svg>';
  }

  _proportionLine(model, minX, maxX, minY, maxY, px, py) {
    const totals = model.analysisTotals;
    if (!totals || !totals.population) return '';
    const k = (totals.metric[model.metric] || 0) / totals.population;
    if (k <= 0) return '';
    const logK = Math.log10(k);
    let ax = minX, ay = minX + logK;
    let bx = maxX, by = maxX + logK;
    if (ay < minY) { ax = minY - logK; ay = minY; } else if (ay > maxY) { ax = maxY - logK; ay = maxY; }
    if (by < minY) { bx = minY - logK; by = minY; } else if (by > maxY) { bx = maxY - logK; by = maxY; }
    if (ax < minX) ax = minX; if (bx > maxX) bx = maxX;
    return '<line x1="' + px(ax).toFixed(1) + '" y1="' + py(ay).toFixed(1) + '" x2="' + px(bx).toFixed(1) + '" y2="' + py(by).toFixed(1) +
      '" stroke="#0f172a" stroke-width="2" stroke-dasharray="8 5" opacity="0.75"></line>';
  }

  _quadrants(data, lx, minX, maxX, minY, maxY, px, py, W, H, pad, metric) {
    if (data.length < 4) return '';
    const q = {
      sessoes: { hi: 'muitas sessões', lo: 'poucas sessões' },
      usuarios: { hi: 'muitos usuários', lo: 'poucos usuários' },
      conversoes: { hi: 'muitas conversões', lo: 'poucas conversões' },
      receita: { hi: 'muita receita', lo: 'pouca receita' }
    }[metric] || { hi: 'muito tráfego', lo: 'pouco tráfego' };
    const mxv = (minX + maxX) / 2;
    const myv = (minY + maxY) / 2;
    const vx = px(mxv), hy = py(myv);
    const line = (x1, y1, x2, y2) =>
      '<line x1="' + x1.toFixed(1) + '" y1="' + y1.toFixed(1) + '" x2="' + x2.toFixed(1) + '" y2="' + y2.toFixed(1) + '" stroke="#cbd5e1" stroke-width="1" stroke-dasharray="3 5" opacity="0.75"></line>';
    const label = (x, y, anchor, t) =>
      '<text x="' + x + '" y="' + y + '" text-anchor="' + anchor + '" fill="#94a3b8" font-size="10" font-style="italic">' + t + '</text>';
    return line(vx, pad, vx, H - pad) + line(pad, hy, W - pad, hy) +
      '<text x="' + (vx + 4) + '" y="' + (H - pad - 4) + '" fill="#64748b" font-size="9">≈ ' + Formatter.compact(Math.pow(10, mxv)) + ' hab.</text>' +
      '<text x="' + (pad + 4) + '" y="' + (hy - 4) + '" fill="#64748b" font-size="9">≈ ' + Formatter.compact(Math.pow(10, myv)) + '</text>' +
      label(W - pad - 6, pad + 14, 'end', q.hi + ' · muita população') +
      label(pad + 6, pad + 14, 'start', q.hi + ' · pouca população') +
      label(W - pad - 6, H - pad - 8, 'end', q.lo + ' · muita população') +
      label(pad + 6, H - pad - 8, 'start', q.lo + ' · pouca população');
  }

  _tabMap(model) {
    const geo = model.geo;
    if (!geo) return '<h3>Mapa</h3><p class="sub">Geometria indisponível.</p>';
    const mode = model.mapMode === 'cidade' ? 'cidade' : 'uf';
    let minLon = 999, maxLon = -999, minLat = 999, maxLat = -999;
    geo.forEach((f) => f.polys.forEach((poly) => poly.forEach((pt) => {
      if (pt[0] < minLon) minLon = pt[0];
      if (pt[0] > maxLon) maxLon = pt[0];
      if (pt[1] < minLat) minLat = pt[1];
      if (pt[1] > maxLat) maxLat = pt[1];
    })));
    const W = 760, H = 760, pad = 16;
    const spanLon = maxLon - minLon, spanLat = maxLat - minLat;
    const scale = Math.min((W - pad * 2) / spanLon, (H - pad * 2) / spanLat);
    const ox = (W - spanLon * scale) / 2, oy = (H - spanLat * scale) / 2;
    const px = (lon) => ox + (lon - minLon) * scale;
    const py = (lat) => H - oy - (lat - minLat) * scale;

    let layer, subtitle;
    if (mode === 'cidade') {
      const outline = geo.map((f) =>
        '<path class="map-base" d="' + f.polys.map((poly) => 'M' + poly.map((pt) => px(pt[0]).toFixed(1) + ' ' + py(pt[1]).toFixed(1)).join('L') + 'Z').join(' ') + '"></path>').join('');
      const cityGeo = model.cityGeo || {};
      const cities = model.filtered.filter((p) => cityGeo[p.municipio.code] && p.indicators.value > 0);
      const maxVal = Math.max(1, cities.reduce((mx, p) => Math.max(mx, p.indicators.value), 0));
      const dots = cities
        .slice().sort((a, b) => b.indicators.value - a.indicators.value)
        .map((p) => {
          const c = cityGeo[p.municipio.code];
          const rr = (2.5 + Math.sqrt(p.indicators.value / maxVal) * 17).toFixed(1);
          return '<circle class="map-city" cx="' + px(c[0]).toFixed(1) + '" cy="' + py(c[1]).toFixed(1) + '" r="' + rr +
            '" fill="' + p.indicators.band.color + '" data-tip="' + this._tipFor(p) + '"></circle>';
        }).join('');
      layer = outline + dots;
      subtitle = Formatter.integer(cities.length) + ' municípios plotados por centróide · tamanho = ' + Formatter.metricLabel(model.metric) + ' · cor = faixa de MSVS.';
    } else {
      const agg = this._aggregateByUf(model.filtered, model.metric);
      layer = geo.map((f) => {
        const a = agg[f.sigla];
        const color = a && a.mps > 0 ? CidadePerformance.bandFor(a.mps).color : '#e2e8f0';
        const tip = a ? '<b>' + f.name + ' (' + f.sigla + ')</b>|MSVS ' + Formatter.mps(a.mps) + ' · ' + a.count + ' mun.|' +
          Formatter.metricLabel(model.metric) + ': ' + Formatter.compact(a.metric) + '|Pop: ' + Formatter.compact(a.pop) :
          '<b>' + f.name + ' (' + f.sigla + ')</b>|sem dados';
        const d = f.polys.map((poly) => 'M' + poly.map((pt) => px(pt[0]).toFixed(1) + ' ' + py(pt[1]).toFixed(1)).join('L') + 'Z').join(' ');
        return '<path class="map-uf" d="' + d + '" fill="' + color + '" data-tip="' + this._attr(tip) + '"></path>';
      }).join('');
      subtitle = 'Cada estado é colorido pelo MSVS médio (ponderado por população) dos municípios filtrados.';
    }

    const modeBtns = [['uf', 'Por UF'], ['cidade', 'Por cidade']].map((m) =>
      '<button class="btn ' + (mode === m[0] ? 'btn-export' : 'btn-secondary') + '" data-mapmode="' + m[0] + '" style="margin:0">' + m[1] + '</button>').join(' ');
    const metricBtns = ['sessoes', 'usuarios', 'conversoes', 'receita'].map((m) => {
      const on = m === model.metric;
      const enabled = model.availableMetrics.indexOf(m) !== -1;
      return '<button class="btn ' + (on ? 'btn-export' : 'btn-secondary') + '" data-mapmetric="' + m + '"' + (enabled ? '' : ' disabled') + ' style="margin:0">' + Formatter.metricLabel(m) + '</button>';
    }).join(' ');
    return '<h3>Mapa do Brasil — MSVS ' + (mode === 'cidade' ? 'por cidade' : 'por UF') + '</h3><p class="sub">' + subtitle + '</p>' +
      '<div class="map-controls"><div class="map-seg">' + modeBtns + '</div><div class="map-seg">' + metricBtns + '</div></div>' + this._bandLegend() +
      '<svg class="chart" viewBox="0 0 ' + W + ' ' + H + '" style="max-width:700px;margin:auto">' + layer + '</svg>';
  }

  _aggregateByUf(list, metric) {
    const byUf = {};
    for (const p of list) {
      const uf = p.municipio.uf;
      if (!byUf[uf]) byUf[uf] = { wsum: 0, pop: 0, metric: 0, count: 0 };
      byUf[uf].wsum += p.indicators.mps * p.municipio.population;
      byUf[uf].pop += p.municipio.population;
      byUf[uf].metric += p.metricValue(metric);
      byUf[uf].count++;
    }
    const out = {};
    for (const uf of Object.keys(byUf)) {
      const a = byUf[uf];
      out[uf] = { metric: a.metric, pop: a.pop, count: a.count, mps: a.pop ? a.wsum / a.pop : 0 };
    }
    return out;
  }

  _tabInsights(model) {
    const insights = model.view.insights;
    if (!insights.length) return '<h3>Insights automáticos</h3><p class="sub">Sem insights para o recorte atual.</p>';
    const cards = insights.map((i) =>
      '<div class="insight ' + i.type + '"><div class="ic-city">' + this._esc(i.city) + '</div>' + this._esc(i.text) + '</div>').join('');
    return '<h3>Insights automáticos</h3><p class="sub">Frases geradas a partir do MSVS e das participações de cada município.</p>' +
      '<div class="insights-grid">' + cards + '</div>';
  }

  _tabCases(model) {
    const mr = model.matchResult;
    const st = mr.stats;
    const cov = st.coverage ? st.coverage[model.metric] : st.matchRate;
    const cap = 150;
    const sorted = mr.unmatched.slice().sort((a, b) => (b.row.sessoes + b.row.usuarios) - (a.row.sessoes + a.row.usuarios));
    const unmatched = sorted.slice(0, cap).map((u) => {
      const candidates = u.candidates && u.candidates.length
        ? '<span class="tag">' + u.candidates.length + ' homônimos</span>' : '';
      return '<div class="correct-row"><div>' + this._esc(u.row.cidade) + ' <span class="tag">' + this._esc(u.row.estado || '?') + '</span> ' + candidates + '</div>' +
        '<div style="color:var(--ink-soft)">' + (u.reason === 'ambiguidade' ? 'ambígua' : 'não encontrada') + '</div>' +
        '<input list="munic-datalist" data-correct="' + this._esc(u.key) + '" placeholder="cidade ou código IBGE"></div>';
    }).join('') || '<p class="sub">Todas as cidades brasileiras foram correspondidas. 🎉</p>';
    const moreNote = mr.unmatched.length > cap
      ? '<p class="sub">Exibindo as ' + cap + ' de maior tráfego (de ' + Formatter.integer(mr.unmatched.length) + ' não encontradas).</p>'
      : '';

    const dups = this.controller.population.duplicateNameGroups().slice(0, 30).map((g) =>
      '<div class="correct-row" style="grid-template-columns:1fr auto"><div>' + this._esc(this._title(g.name)) + '</div><span class="tag">' + g.count + ' municípios</span></div>').join('');

    const corrections = Object.keys(this.controller.matcher.corrections);
    const corrText = corrections.length
      ? corrections.length + ' correção(ões) manual(is) salva(s) localmente. <button class="link-btn" id="clear-corrections">remover todas</button>'
      : 'Nenhuma correção manual salva.';

    return '<h3>Casos especiais &amp; qualidade do match</h3>' +
      '<div class="cases-grid">' +
      '<div class="case-block"><h4>Percentual de match obtido</h4>' +
      '<div class="match-meter"><div style="width:' + (cov * 100).toFixed(1) + '%"></div></div>' +
      '<p class="sub" style="margin:0 0 6px"><b>' + Formatter.percent(cov, 1) + '</b> de ' +
      Formatter.metricLabel(this.controller.metric) + ' cruzada com municípios · ' + Formatter.integer(st.matchedCities) + ' municípios BR identificados.</p>' +
      '<p class="sub" style="margin:0">' + Formatter.integer(st.matchedRows) + ' linhas brasileiras casadas · ' +
      Formatter.integer(st.unmatchedRows) + ' linhas BR não encontradas · ' + Formatter.integer(st.foreignRows || 0) +
      ' linhas fora do Brasil/(not set) excluídas (de ' + Formatter.integer(st.totalRows) + ' no total).</p></div>' +
      '<div class="case-block"><h4>Cidades sem correspondência &amp; correção manual <span class="tag">' + mr.unmatched.length + '</span></h4>' +
      '<p class="sub">Digite o nome (com UF) ou o código IBGE. As correções são salvas localmente e reaplicadas automaticamente.</p>' +
      '<datalist id="munic-datalist">' + this._municipioOptions() + '</datalist>' + unmatched + moreNote +
      '<p class="sub" style="margin-top:10px">' + corrText + '</p></div>' +
      '<div class="case-block"><h4>Municípios com nomes duplicados no Brasil <span class="tag">' + this.controller.population.duplicateNameGroups().length + '</span></h4>' +
      '<p class="sub">Nomes que exigem UF ou código IBGE para desambiguação.</p>' + dups + '</div>' +
      '</div>';
  }

  _municipioOptions() {
    if (this._cachedOptions) return this._cachedOptions;
    const list = this.controller.population.municipios.slice().sort((a, b) =>
      a.name.localeCompare(b.name) || a.uf.localeCompare(b.uf));
    this._labelToCode = {};
    const parts = [];
    for (const m of list) {
      const label = m.name + ' - ' + m.uf;
      this._labelToCode[Normalizer.normalizeName(label)] = m.code;
      parts.push('<option value="' + this._attr(label) + '"></option>');
    }
    this._cachedOptions = parts.join('');
    return this._cachedOptions;
  }

  _resolveMunicipioInput(value) {
    const raw = String(value || '').trim();
    if (!raw) return '';
    if (/^\d{7}$/.test(raw) && this.controller.population.findByCode(raw)) return raw;
    if (!this._labelToCode) this._municipioOptions();
    const code = this._labelToCode[Normalizer.normalizeName(raw)];
    return code || '';
  }

  _bandLegend() {
    const items = MPS_BANDS.map((b) =>
      '<div class="lg"><span class="sw" style="background:' + b.color + '"></span>' + b.label + ' <span style="color:var(--ink-soft)">(' + b.short + ')</span></div>').join('');
    return '<div class="legend">' + items + '</div>';
  }

  _axisTicks(min, max) {
    const ticks = [];
    const lo = Math.floor(min), hi = Math.ceil(max);
    for (let i = lo; i <= hi; i++) ticks.push(i);
    return ticks;
  }

  _tipFor(p) {
    const ind = p.indicators;
    const m = ind.metric;
    const label = Formatter.metricLabel(m);
    const word = { sessoes: 'esperadas', usuarios: 'esperados', conversoes: 'esperadas', receita: 'esperada' }[m] || 'esperado';
    const reach = m === 'usuarios'
      ? '|Navegam no site: ' + Formatter.percent(ind.reach, 2) + ' da população'
      : '';
    const txt = '<b>' + p.municipio.label + '</b>' +
      '|MSVS: ' + Formatter.mps(ind.mps) + ' — ' + ind.band.label +
      '|' + label + ': ' + Formatter.percent(ind.metricShare, 2) + ' (' +
      Formatter.metricValue(m, ind.value) + ' de ' + Formatter.metricValue(m, ind.expected) + ' ' + word + ')' +
      '|População: ' + Formatter.percent(ind.popShare, 2) + ' (' + Formatter.integer(p.municipio.population) + ')' +
      reach;
    return this._attr(txt);
  }

  _attr(value) {
    return String(value).replace(/&/g, '&amp;').replace(/"/g, '&quot;');
  }

  _onTip(e) {
    const el = e.target.closest('[data-tip]');
    if (!el) { this._hideTip(); return; }
    this.tooltip.innerHTML = el.getAttribute('data-tip').split('|').join('<br>');
    this.tooltip.hidden = false;
    const ox = e.clientX + 14, oy = e.clientY + 14;
    const w = this.tooltip.offsetWidth, h = this.tooltip.offsetHeight;
    this.tooltip.style.left = Math.min(ox, window.innerWidth - w - 8) + 'px';
    this.tooltip.style.top = Math.min(oy, window.innerHeight - h - 8) + 'px';
  }

  _hideTip() {
    this.tooltip.hidden = true;
  }

  _abbr(name) {
    return name.length > 14 ? name.substring(0, 13) + '…' : name;
  }

  _title(value) {
    return value.replace(/\b\w/g, (c) => c.toUpperCase());
  }

  _esc(value) {
    return String(value === null || value === undefined ? '' : value)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }
}

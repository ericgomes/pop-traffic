class AffinityAnalysisService {
  prepare(performances, metric) {
    const totals = this._sumTotals(performances);
    for (const perf of performances) perf.compute(metric, totals);
    this.totals = totals;
    return totals;
  }

  buildView(list, metric) {
    const sorted = list.slice().sort((a, b) => b.indicators.mps - a.indicators.mps);
    const withMetric = list.filter((p) => p.metricValue(metric) > 0);
    const classifications = {
      topMps: this._top(list, (p) => p.indicators.mps, 'desc', 50),
      bottomMps: this._top(withMetric, (p) => p.indicators.mps, 'asc', 50),
      topCapitais: this._top(list.filter((p) => p.municipio.isCapital), (p) => p.indicators.mps, 'desc', 50),
      topInterior: this._top(list.filter((p) => !p.municipio.isCapital), (p) => p.indicators.mps, 'desc', 50),
      above2x: this._top(list.filter((p) => p.indicators.mps > 2.0), (p) => p.indicators.mps, 'desc', 100),
      above5x: this._top(list.filter((p) => p.indicators.mps > 5.0), (p) => p.indicators.mps, 'desc', 100),
      opportunities: this._opportunities(list),
      topReceita: this._top(list.filter((p) => p.metrics.receita > 0), (p) => p.indicators.receitaPerCapita, 'desc', 50)
    };
    const summary = this._summary(list, metric, classifications);
    const insights = this._insights(list, metric, classifications);
    return { metric: metric, performances: list, sorted: sorted, classifications: classifications, summary: summary, insights: insights };
  }

  _sumTotals(performances) {
    const metric = { sessoes: 0, usuarios: 0, conversoes: 0, receita: 0 };
    let population = 0;
    for (const perf of performances) {
      population += perf.municipio.population;
      metric.sessoes += perf.metrics.sessoes;
      metric.usuarios += perf.metrics.usuarios;
      metric.conversoes += perf.metrics.conversoes;
      metric.receita += perf.metrics.receita;
    }
    return { metric: metric, population: population, count: performances.length };
  }

  _top(list, accessor, direction, limit) {
    const arr = list.slice().sort((a, b) => {
      const av = accessor(a);
      const bv = accessor(b);
      return direction === 'asc' ? av - bv : bv - av;
    });
    return limit ? arr.slice(0, limit) : arr;
  }

  _opportunities(performances) {
    const candidates = performances.filter((p) => p.indicators.mps < 0.9 && p.indicators.mps >= 0);
    candidates.sort((a, b) => b.indicators.opportunityGap - a.indicators.opportunityGap);
    return candidates.slice(0, 50);
  }

  _summary(performances, metric, classifications) {
    const totals = this._sumTotals(performances);
    const sorted = performances.slice().sort((a, b) => b.indicators.mps - a.indicators.mps);
    const top = sorted.length ? sorted[0] : null;
    const withMetric = sorted.filter((p) => p.metricValue(metric) > 0);
    const bottom = withMetric.length ? withMetric[withMetric.length - 1] : null;
    const national = window.IBGE_POP2025 ? window.IBGE_POP2025.total : 0;
    return {
      metric: metric,
      municipios: performances.length,
      population: totals.population,
      nationalPopulation: national,
      coverage: national ? totals.population / national : 0,
      totalSessoes: totals.metric.sessoes,
      totalUsuarios: totals.metric.usuarios,
      totalConversoes: totals.metric.conversoes,
      totalReceita: totals.metric.receita,
      topCity: top,
      bottomCity: bottom,
      topOpportunities: classifications.opportunities.slice(0, 10),
      topHighlights: classifications.topMps.slice(0, 10)
    };
  }

  _insights(performances, metric, classifications) {
    const insights = [];
    const label = Formatter.metricLabel(metric).toLowerCase();

    const top = classifications.topMps[0];
    if (top && top.indicators.mps > 1.1) {
      insights.push({
        type: 'destaque',
        city: top.municipio.label,
        text: top.municipio.name + ' apresenta Market Penetration Score de ' + Formatter.mps(top.indicators.mps) +
          ', indicando presença digital muito acima do esperado para sua população.'
      });
    }

    for (const perf of classifications.above2x.slice(0, 4)) {
      if (perf === top) continue;
      insights.push({
        type: 'participacao',
        city: perf.municipio.label,
        text: perf.municipio.name + ' possui participação de ' + label + ' ' + Formatter.signedMultiplier(perf.indicators.mps) +
          ' superior à sua participação populacional.'
      });
    }

    for (const perf of classifications.opportunities.slice(0, 4)) {
      insights.push({
        type: 'oportunidade',
        city: perf.municipio.label,
        text: perf.municipio.name + ' apresenta presença digital inferior ao esperado considerando sua população estimada de ' +
          Formatter.integer(perf.municipio.population) + ' habitantes.'
      });
    }

    const receitaLeader = classifications.topReceita[0];
    if (receitaLeader && receitaLeader.metrics.receita > 0) {
      insights.push({
        type: 'receita',
        city: receitaLeader.municipio.label,
        text: receitaLeader.municipio.name + ' possui excelente receita proporcional ao tamanho do mercado, com ' +
          Formatter.currency(receitaLeader.indicators.receitaPer100k) + ' por 100 mil habitantes.'
      });
    }

    const dominancia = classifications.above5x[0];
    if (dominancia) {
      insights.push({
        type: 'dominancia',
        city: dominancia.municipio.label,
        text: dominancia.municipio.name + ' demonstra dominância regional, com penetração ' +
          Formatter.signedMultiplier(dominancia.indicators.mps) + ' acima do esperado para o seu porte populacional.'
      });
    }

    return insights;
  }
}

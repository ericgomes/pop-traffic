(function () {
  function boot() {
    const population = new IBGEPopulationService();
    const importer = new GA4ImportService();
    const matcher = new CityMatcherService(population);
    const analysis = new AffinityAnalysisService();
    const exporter = new ExportService();
    const view = new DashboardView();

    const controller = new DashboardController({
      population: population,
      importer: importer,
      matcher: matcher,
      analysis: analysis,
      exporter: exporter,
      view: view
    });

    try {
      controller.init();
      window.app = controller;
    } catch (error) {
      document.getElementById('tab-content').innerHTML =
        '<div class="empty"><div class="big">⚠️</div><h3>Falha ao carregar a base IBGE</h3><p class="sub">' +
        error.message + '</p></div>';
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }
})();

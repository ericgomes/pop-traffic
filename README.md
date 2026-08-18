# Cidades — Análise Geográfica de Tráfego (MSVS)

Webapp client-side que cruza dados do **Google Analytics 4** com as **Estimativas da População Residente nos Municípios Brasileiros (IBGE POP2025, ref. 01/07/2025)** e calcula o **Market Share of Voice Score (MSVS)** de cada cidade — revelando onde a marca performa acima ou abaixo do esperado para o tamanho da população, eliminando o viés das capitais.

## Como rodar

Por usar `fetch` de arquivos locais, sirva via HTTP (não abra com `file://`):

```bash
python -m http.server 8777
# abra http://localhost:8777
```

Clique em **Carregar dados de exemplo** para uma demonstração, ou em **Selecionar arquivo CSV** para importar um export do GA4.

## Importação do GA4

Aceita o CSV nativo do GA4 (ex.: *Detalhes demográficos: País*) — ignora as linhas de comentário, detecta o cabeçalho em inglês ou português e mapeia automaticamente as colunas:

```
City → cidade · Region → estado · Total users → usuários · Engaged sessions → sessões engajadas
Sessions → sessões · Ecommerce purchases → conversões · Total revenue → receita
Source / Medium → origem (opcionais)
```

Tráfego estrangeiro / `(not set)` é identificado e excluído do cálculo; a qualidade do match é medida pela **cobertura da métrica**, não pelo número de linhas.

## Indicadores

- Métrica por habitante, por mil e por 100 mil habitantes
- Participação da métrica e participação populacional
- **MSVS = % da métrica / % da população**

| Faixa MSVS | Interpretação |
|---|---|
| < 0,5 | Muito abaixo do esperado |
| 0,5 – 0,9 | Abaixo do esperado |
| 0,9 – 1,1 | Dentro do esperado |
| 1,1 – 2,0 | Acima do esperado |
| 2,0 – 5,0 | Forte presença regional |
| > 5,0 | Dominância regional |

## Recursos

Dashboard executivo · Tabela ordenável · Rankings · Gráfico de barras · Heatmap · Scatter plot com linha de tendência · Mapa do Brasil (choropleth por UF) · Insights automáticos · Filtros (UF, capital/interior, população, MSVS, mínimos por métrica) · Correção manual de match (salva em `localStorage`) · Exportação **CSV / XLSX / PDF** (geradas offline, sem dependências).

## Arquitetura

HTML + CSS + JavaScript puro, orientado a objetos, modular, sem bibliotecas externas. Processamento 100% client-side (suporta 5.571 municípios e 100k+ linhas de GA4).

```
src/
  models/       Municipio · CidadePerformance
  services/     IBGEPopulationService · GA4ImportService · CityMatcherService
                AffinityAnalysisService · ExportService
  controllers/  DashboardController
  views/        DashboardView
  utils/        Normalizer · Formatter · MiniZip · MiniPdf
data/           municipios.js (base IBGE) · brazil-uf.js (geometria)
```

## Dados

Base IBGE POP2025 embutida em `data/municipios.js` (5.571 municípios, 213.421.037 habitantes). Não utiliza dados do Censo 2022.

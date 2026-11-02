/* ─────────────────────────────────────────────────────────────────────────
   Portfolio Analytics · factor models (mock)
   Two risk models a user can switch between. Each has its own factor set,
   loadings, factor covariance and specific (stock- or fund-specific) risk.
   The platform assumptions (data/assumptions.js) stay the return model;
   these models answer "what is this exposed to, and where does its risk
   come from".

   FactorModel {id, name, long, asOf, note, factors:[{id, name, unit,
                description, mapsTo?, signFlip?}], defaultFactors:string[],
                factorVol:{[factorId]:%}, factorCorrelation:number[][] (factor order),
                loadings:{[assetClassId]:{[factorId]:β}},
                productLoadings:{[instrumentId]:{[factorId]:β}}   tilts added to the class
                specificVol:{[assetClassId]:%}, specificScale:{[instrumentType]:x},
                coverage(instrument) → null | {status:'proxied', note}}
   A proxied product takes its category index's loadings and specific risk.
   ───────────────────────────────────────────────────────────────────────── */
(function () {
  'use strict';
  var PA = window.PA, D = PA.data, A = D.assumptions;

  var ISG_MAP = { equity: 'market', rates: 'rates_level', credit: 'credit_spread', cmd: 'commodity', fx: 'usd', inflation: 'infl_be' };
  var isgLoadings = {};
  Object.keys(A.assetClasses).forEach(function (id) { isgLoadings[id] = Object.assign({}, A.assetClasses[id].betas); });

  var isg = {
    id: 'isg', name: 'ISG', long: 'ISG multi-asset macro factor model', asOf: '2026-10-31',
    note: 'Six macro factors estimated at the asset-class level. Every product is covered through its asset class.',
    factors: D.factors.map(function (f) { return Object.assign({}, f, { mapsTo: ISG_MAP[f.id], signFlip: f.id === 'fx' }); }),
    defaultFactors: ['equity', 'rates', 'credit'],
    factorVol: {}, factorCorrelation: A.factorCorrelation,
    loadings: isgLoadings,
    productLoadings: { fund_us_sc: { equity: 0.15 }, fund_em: { equity: 0.05, fx: 0.1 }, fund_jp: { fx: 0.2 }, hf_sable: { equity: 0.25 }, hf_alder: { equity: -0.2, rates: 0.3 }, fund_ilb: { inflation: 0.9 }, etf_gold: { cmd: -0.2, inflation: 0.2 }, sec_vireo: { equity: 0.4 }, sec_dunmore: { equity: -0.35, rates: 0.3 }, sec_tarn: { equity: -0.15 } },
    specificVol: { us_eq: 3.0, intl_eq: 3.5, em_eq: 5.0, pe: 9.0, govt: 0.8, ig: 1.4, hy: 3.0, cash: 0.2, hf: 5.0, re: 6.0, cmd: 6.0, infra: 5.0 },
    specificScale: { Index: 0.35, ETF: 0.5, Fund: 1.0, Manager: 1.2, Security: 6.0 },
    coverage: function () { return null; }
  };
  A.factors.forEach(function (f) { isg.factorVol[f.id] = f.vol; });

  var AX = ['market', 'size', 'value', 'momentum', 'rates_level', 'rates_slope', 'credit_spread', 'usd', 'commodity', 'infl_be'];
  var L = function (o) { var out = {}; AX.forEach(function (f) { out[f] = o[f] || 0; }); return out; };
  var axCorr = (function () {
    var pairs = { 'market|size': 0.2, 'market|credit_spread': 0.55, 'market|usd': -0.25, 'market|commodity': 0.3, 'market|rates_level': -0.15, 'value|momentum': -0.3,
      'rates_level|infl_be': -0.35, 'rates_level|rates_slope': 0.3, 'commodity|infl_be': 0.55, 'credit_spread|commodity': 0.25, 'usd|commodity': -0.3, 'size|value': 0.1, 'credit_spread|rates_level': 0.1 };
    return AX.map(function (a) { return AX.map(function (b) { return a === b ? 1 : (pairs[a + '|' + b] != null ? pairs[a + '|' + b] : pairs[b + '|' + a] != null ? pairs[b + '|' + a] : 0); }); });
  })();
  var axioma = {
    id: 'axioma', name: 'Axioma', long: 'Axioma multi-asset factor model', asOf: '2026-10-31',
    note: 'Ten factors: market, equity styles, rates level and slope, credit spread, the US dollar, commodities and inflation breakevens. Privately valued funds are not covered and are proxied by their category index.',
    factors: [
      { id: 'market', name: 'Market', unit: 'β', description: 'Global equity market factor.', mapsTo: 'equity' },
      { id: 'size', name: 'Size', unit: 'β', description: 'Small-minus-large equity style.' },
      { id: 'value', name: 'Value', unit: 'β', description: 'Value-minus-growth equity style.' },
      { id: 'momentum', name: 'Momentum', unit: 'β', description: 'Twelve-month price momentum style.' },
      { id: 'rates_level', name: 'Rates Level', unit: 'β', description: 'Parallel moves in government yields (duration).', mapsTo: 'rates' },
      { id: 'rates_slope', name: 'Rates Slope', unit: 'β', description: 'Steepening of the government curve.' },
      { id: 'credit_spread', name: 'Credit Spread', unit: 'β', description: 'Corporate spread over governments.', mapsTo: 'credit' },
      { id: 'usd', name: 'USD', unit: 'β', description: 'Strength of the US dollar against a basket. Opposite sign to ISG’s Foreign Currency.', mapsTo: 'fx', signFlip: true },
      { id: 'commodity', name: 'Commodity', unit: 'β', description: 'Broad commodities basket.', mapsTo: 'cmd' },
      { id: 'infl_be', name: 'Inflation Breakeven', unit: 'β', description: 'Market-implied inflation expectations.', mapsTo: 'inflation' }
    ],
    defaultFactors: ['market', 'rates_level', 'credit_spread'],
    factorVol: { market: 15, size: 6, value: 6, momentum: 8, rates_level: 5, rates_slope: 3, credit_spread: 4, usd: 7, commodity: 15, infl_be: 3 },
    factorCorrelation: axCorr,
    loadings: {
      us_eq:   L({ market: 1.0, momentum: 0.05, rates_level: -0.1, credit_spread: 0.1, infl_be: -0.1 }),
      intl_eq: L({ market: 0.95, value: 0.15, rates_level: -0.05, credit_spread: 0.1, usd: -0.6, commodity: 0.05 }),
      em_eq:   L({ market: 1.1, size: 0.2, value: 0.2, credit_spread: 0.2, usd: -0.8, commodity: 0.15, infl_be: 0.1 }),
      pe:      L({ market: 1.2, size: 0.5, value: 0.1, credit_spread: 0.2, usd: -0.1, infl_be: 0.1 }),
      govt:    L({ market: -0.05, rates_level: 1.0, rates_slope: 0.3, infl_be: -0.4 }),
      ig:      L({ market: 0.1, rates_level: 0.8, rates_slope: 0.2, credit_spread: 1.0, infl_be: -0.3 }),
      hy:      L({ market: 0.4, size: 0.1, rates_level: 0.3, credit_spread: 1.6, commodity: 0.05 }),
      cash:    L({ rates_level: 0.05, infl_be: 0.1 }),
      hf:      L({ market: 0.3, value: 0.05, momentum: 0.2, credit_spread: 0.2, usd: -0.05, commodity: 0.1 }),
      re:      L({ market: 0.5, value: 0.2, rates_level: 0.4, credit_spread: 0.2, infl_be: 0.5 }),
      cmd:     L({ market: 0.2, rates_level: -0.1, usd: -0.2, commodity: 1.0, infl_be: 0.8 }),
      infra:   L({ market: 0.5, value: 0.1, rates_level: 0.3, credit_spread: 0.2, usd: -0.1, commodity: 0.1, infl_be: 0.6 })
    },
    productLoadings: { fund_us_sc: { market: 0.1, size: 0.6 }, fund_em: { value: 0.1, momentum: 0.1 }, fund_intl: { value: 0.2 }, fund_jp: { usd: -0.2, value: 0.15 }, hf_sable: { market: 0.25, momentum: 0.1 }, hf_alder: { market: -0.2, rates_level: 0.3, momentum: 0.3 }, fund_ilb: { infl_be: 0.9 }, etf_gold: { commodity: -0.2, usd: -0.2, infl_be: 0.2 }, sec_vireo: { market: 0.4, momentum: 0.4, value: -0.5 }, sec_dunmore: { market: -0.35, rates_level: 0.3, value: 0.4 }, sec_tarn: { market: -0.15, value: 0.2 } },
    specificVol: { us_eq: 2.8, intl_eq: 3.2, em_eq: 4.5, pe: 9.0, govt: 0.7, ig: 1.2, hy: 2.6, cash: 0.2, hf: 4.2, re: 5.5, cmd: 5.5, infra: 4.6 },
    specificScale: { Index: 0.3, ETF: 0.45, Fund: 1.0, Manager: 1.2, Security: 6.5 },
    coverage: function (ins) { return ins.type !== 'Index' && ins.valuation === 'quarterly' ? { status: 'proxied', note: 'Not covered by Axioma (privately valued); proxied by the ' + D.instrumentById[D.assetClassById[ins.assetClass].indexId].name } : null; }
  };

  D.factorModels = [isg, axioma];
  D.factorModelById = { isg: isg, axioma: axioma };
  D.factorModels.forEach(function (m) { m.factorById = {}; m.factors.forEach(function (f) { m.factorById[f.id] = f; }); });

  /* Stated benchmarks of products (the "own benchmark" of a product row).
     Products without one fall back to their category index. */
  var BM = { etf_us_lc: 'idx_us_eq', fund_us_eq: 'idx_us_eq', fund_us_sc: 'idx_us_eq', fund_intl: 'idx_dev_eq', etf_dev: 'idx_dev_eq', fund_eu: 'idx_dev_eq', fund_jp: 'idx_dev_eq', fund_em: 'idx_em_eq', etf_em: 'idx_em_eq',
    fund_tsy: 'idx_govt', etf_govt: 'idx_govt', fund_ig: 'idx_ig', etf_ig: 'idx_ig', fund_hy: 'idx_hy', fund_pc: 'idx_hy', fund_cash: 'idx_cash', hf_kestrel: 'idx_hf', hf_alder: 'idx_hf', hf_sable: 'idx_hf', hf_corvid: 'idx_hf',
    re_harbor: 'idx_re', etf_reit: 'idx_re', fund_cmd: 'idx_cmd', infra_grey: 'idx_infra', etf_infra: 'idx_infra', pe_oakhurst: 'idx_pe', pe_tamar: 'idx_pe' };
  Object.keys(BM).forEach(function (id) { if (D.instrumentById[id]) D.instrumentById[id].benchmarkId = BM[id]; });
})();

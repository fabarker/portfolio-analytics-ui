/* ─────────────────────────────────────────────────────────────────────────
   Portfolio Analytics · factor models (mock)
   Two risk models a user can switch between. ISG has eleven factors;
   Axioma has the same eleven (same ids) plus six of its own. Each has its own
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

  /* The ISG factors; Axioma carries the same eleven (same ids, so the two
     line up one to one) plus six of its own. */
  var F = function (id, name, description) { return { id: id, name: name, unit: 'β', description: description }; };
  var SHARED = [
    F('equity', 'Equity', 'Global equity market.'),
    F('term', 'Term', 'Term premium: long government bonds over cash (duration).'),
    F('liquidity', 'Liquidity', 'Illiquidity premium earned by private and hard-to-trade assets.'),
    F('funding', 'Funding', 'Funding conditions: levered and credit-sensitive assets gain when funding eases.'),
    F('fx', 'FX', 'Unhedged foreign currency against the reporting currency.'),
    F('em', 'EM', 'Emerging markets over developed markets.'),
    F('dollar', 'Dollar', 'Strength of the US dollar against a basket of currencies.'),
    F('size', 'Size', 'Small companies over large.'),
    F('value', 'Value', 'Cheap companies over expensive.'),
    F('commodities', 'Commodities', 'Broad commodities basket.'),
    F('momentum', 'Momentum', 'Recent winners over recent losers.')
  ];
  var EXTRA = [
    F('credit', 'Credit', 'Corporate credit spreads over governments.'),
    F('short_vol', 'Short Volatility', 'Premium from selling volatility; loses in sudden sell-offs.'),
    F('quality', 'Quality', 'Profitable, stable companies over weaker ones.'),
    F('carry', 'Carry', 'Higher-yielding assets and currencies over lower-yielding ones.'),
    F('local_inflation', 'Local Inflation', 'Unexpected changes in local inflation.'),
    F('local_equity', 'Local Equity', 'The home equity market over the global market.')
  ];
  var VOL = { equity: 15, term: 6, liquidity: 4, funding: 3, fx: 7, em: 9, dollar: 7, size: 6, value: 6, commodities: 15, momentum: 8, credit: 4, short_vol: 5, quality: 4, carry: 5, local_inflation: 3, local_equity: 8 };
  var PAIRS = { 'equity|em': 0.55, 'equity|funding': 0.35, 'equity|liquidity': 0.25, 'equity|size': 0.2, 'equity|commodities': 0.3, 'equity|dollar': -0.25, 'equity|term': -0.15, 'em|dollar': -0.45, 'em|commodities': 0.35,
    'fx|dollar': -0.6, 'commodities|dollar': -0.3, 'value|momentum': -0.3, 'funding|liquidity': 0.45, 'size|value': 0.1,
    'credit|equity': 0.5, 'credit|funding': 0.45, 'credit|liquidity': 0.35, 'short_vol|equity': 0.45, 'short_vol|credit': 0.4, 'quality|equity': -0.2, 'carry|equity': 0.25, 'carry|em': 0.35, 'carry|dollar': -0.25,
    'local_inflation|term': -0.35, 'local_inflation|commodities': 0.5, 'local_equity|equity': 0.35 };
  var corr = function (ids) { return ids.map(function (a) { return ids.map(function (b) { return a === b ? 1 : (PAIRS[a + '|' + b] != null ? PAIRS[a + '|' + b] : PAIRS[b + '|' + a] != null ? PAIRS[b + '|' + a] : 0); }); }); };
  var pick = function (ids, src) { var o = {}; ids.forEach(function (id) { o[id] = VOL[id]; }); return o; };
  var fill = function (ids, o) { var out = {}; ids.forEach(function (f) { out[f] = o[f] || 0; }); return out; };
  /* asset-class loadings on the shared factors */
  var BASE = {
    us_eq:   { equity: 1.0, size: 0.05, value: -0.05, momentum: 0.05, dollar: 0.1, funding: 0.1 },
    intl_eq: { equity: 0.95, fx: 0.6, value: 0.15, dollar: -0.1 },
    em_eq:   { equity: 1.05, em: 0.8, fx: 0.7, dollar: -0.4, value: 0.2, size: 0.15, commodities: 0.15, funding: 0.15 },
    pe:      { equity: 1.1, liquidity: 0.6, size: 0.4, funding: 0.25, value: 0.1, fx: 0.15 },
    govt:    { term: 1.0, equity: -0.05, fx: 0.25, dollar: 0.05 },
    ig:      { term: 0.8, equity: 0.15, funding: 0.2, liquidity: 0.1, fx: 0.2 },
    hy:      { equity: 0.4, term: 0.3, funding: 0.45, liquidity: 0.35, em: 0.05, fx: 0.1 },
    cash:    { term: 0.05 },
    hf:      { equity: 0.3, momentum: 0.25, funding: 0.3, liquidity: 0.2, value: 0.05 },
    re:      { equity: 0.45, term: 0.4, liquidity: 0.4, funding: 0.15, fx: 0.25 },
    cmd:     { commodities: 1.0, dollar: -0.3, equity: 0.15, em: 0.1 },
    infra:   { equity: 0.45, term: 0.35, liquidity: 0.35, commodities: 0.1, fx: 0.3 }
  };
  /* what Axioma adds: credit, short volatility, quality, carry, local inflation and local equity */
  var MORE = {
    us_eq:   { credit: 0.1, short_vol: 0.1, quality: 0.1, local_inflation: -0.1, local_equity: 0.25 },
    intl_eq: { credit: 0.1, quality: 0.05 },
    em_eq:   { credit: 0.2, short_vol: 0.1, quality: -0.1, carry: 0.2 },
    pe:      { credit: 0.2, short_vol: 0.15, quality: -0.1, local_equity: 0.1 },
    govt:    { carry: 0.1, local_inflation: -0.4 },
    ig:      { credit: 0.9, carry: 0.15, local_inflation: -0.3 },
    hy:      { credit: 1.4, short_vol: 0.25, carry: 0.3 },
    cash:    { local_inflation: 0.1 },
    hf:      { credit: 0.2, short_vol: 0.35, carry: 0.15 },
    re:      { credit: 0.2, local_inflation: 0.5 },
    cmd:     { carry: 0.1, local_inflation: 0.8 },
    infra:   { credit: 0.2, local_inflation: 0.6 }
  };
  var TILT = { fund_us_sc: { size: 0.6, equity: 0.1 }, fund_em: { value: 0.1, momentum: 0.1 }, fund_intl: { value: 0.2 }, fund_jp: { fx: 0.2, value: 0.15 }, hf_sable: { equity: 0.25, momentum: 0.1 }, hf_alder: { equity: -0.2, term: 0.3, momentum: 0.3 }, fund_ilb: { term: -0.2 }, etf_gold: { commodities: -0.2, dollar: -0.2 }, sec_vireo: { equity: 0.4, momentum: 0.4, value: -0.3 }, sec_dunmore: { equity: -0.35, term: 0.3, value: 0.3 }, sec_tarn: { equity: -0.15 } };
  var TILT_AX = { fund_ilb: { local_inflation: 0.9 }, etf_gold: { local_inflation: 0.2 }, sec_dunmore: { quality: 0.3 }, sec_tarn: { quality: 0.4 }, sec_vireo: { quality: -0.2 } };
  var ISG_IDS = SHARED.map(function (f) { return f.id; }), AX_IDS = ISG_IDS.concat(EXTRA.map(function (f) { return f.id; }));
  var loadings = function (ids, extra) { var o = {}; Object.keys(BASE).forEach(function (ac) { o[ac] = fill(ids, Object.assign({}, BASE[ac], extra ? MORE[ac] : {})); }); return o; };
  var tilts = function (extra) { var o = {}; Object.keys(TILT).concat(Object.keys(TILT_AX)).forEach(function (id) { o[id] = Object.assign({}, TILT[id] || {}, extra ? TILT_AX[id] || {} : {}); }); return o; };

  var isg = {
    id: 'isg', name: 'ISG', long: 'ISG multi-asset factor model', asOf: '2026-10-31',
    note: 'Eleven factors: equity, term, liquidity, funding, FX, EM, dollar, size, value, commodities and momentum, estimated at the asset-class level. Every product is covered through its asset class.',
    factors: SHARED.map(function (f) { return Object.assign({}, f, { mapsTo: f.id }); }),
    defaultFactors: ['equity', 'term', 'fx'],
    factorVol: pick(ISG_IDS), factorCorrelation: corr(ISG_IDS),
    loadings: loadings(ISG_IDS, false),
    productLoadings: tilts(false),
    specificVol: { us_eq: 3.0, intl_eq: 3.5, em_eq: 5.0, pe: 9.0, govt: 0.8, ig: 1.4, hy: 3.0, cash: 0.2, hf: 5.0, re: 6.0, cmd: 6.0, infra: 5.0 },
    specificScale: { Index: 0.35, ETF: 0.5, Fund: 1.0, Manager: 1.2, Security: 6.0 },
    coverage: function () { return null; }
  };
  var axioma = {
    id: 'axioma', name: 'Axioma', long: 'Axioma multi-asset factor model', asOf: '2026-10-31',
    note: 'The eleven ISG factors plus credit, short volatility, quality, carry, local inflation and local equity. Privately valued funds are not covered and are proxied by their category index.',
    factors: SHARED.map(function (f) { return Object.assign({}, f, { mapsTo: f.id }); }).concat(EXTRA.map(function (f) { return Object.assign({}, f); })),
    defaultFactors: ['equity', 'term', 'credit'],
    factorVol: pick(AX_IDS), factorCorrelation: corr(AX_IDS),
    loadings: loadings(AX_IDS, true),
    productLoadings: tilts(true),
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

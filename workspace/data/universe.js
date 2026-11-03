/* ─────────────────────────────────────────────────────────────────────────
   Mock data · the investment universe
   Everything here is fictional. Names, identifiers and figures do not refer
   to real products. A backend replaces this module through PA.api (see
   js/api.js); nothing in the UI reads PA.data directly.

   The rail is a tree: portfolio → category → product. Categories are
   modelled at index level: a category has its own target weight; products
   implement part or all of it and any unimplemented remainder is modelled
   by the category's index basket (see engine.js, E.effective).

   Shapes
   ─────
   Category    {id, name, short, color, assetClasses:string[],
                index:[[instrumentId, weight]]}   the basket that models the
                                                  unimplemented remainder
   AssetClass  {id, name, category, indexId}
               indexId names the index used as a proxy when a holding lacks
               history.
   Factor      {id, name, unit, description}
   Instrument  {id, name, type, identifier, assetClass, currency, valuation,
                inception, coverage, manager?, fee?, proxyNote?, lookThrough?}
               type: Fund | ETF | Index | Security | Manager
               valuation: daily | monthly | quarterly
               coverage: 'full' (history from inception), 'proxy' (asset-class
               index stands in before inception), 'none' (no return history)
   Benchmarks are in data/benchmarks.js (presets and the library).
   ───────────────────────────────────────────────────────────────────────── */
(function () {
  'use strict';
  var PA = window.PA = window.PA || {};
  var D = PA.data = PA.data || {};

  /* The category taxonomy every allocation is aligned on, in display order.
     A colour slot belongs to a category by name, never by position. */
  D.categories = [
    { id: 'public_equity',      name: 'Public Equity',                          short: 'Public Equity',    color: '#2a78d6', assetClasses: ['us_eq', 'intl_eq', 'em_eq'], index: [['idx_us_eq', 62], ['idx_dev_eq', 27], ['idx_em_eq', 11]] },
    { id: 'ig_fixed_income',    name: 'Investment Grade Fixed Income',          short: 'IG Fixed Income',  color: '#1baf7a', assetClasses: ['govt', 'ig'],               index: [['idx_govt', 62], ['idx_ig', 38]] },
    { id: 'other_fixed_income', name: 'Other Fixed Income',                     short: 'Other FI',         color: '#8bd0b0', assetClasses: ['hy'],                       index: [['idx_hy', 100]] },
    { id: 'hedge_funds',        name: 'Hedge Funds',                            short: 'Hedge Funds',      color: '#e87ba4', assetClasses: ['hf'],                       index: [['idx_hf', 100]] },
    { id: 'private_equity',     name: 'Private Equity & Other Private Assets',  short: 'Private Equity',   color: '#4a3aa7', assetClasses: ['pe'],                       index: [['idx_pe', 100]] },
    { id: 'real_assets',        name: 'Real Assets',                            short: 'Real Assets',      color: '#eda100', assetClasses: ['re', 'cmd', 'infra'],       index: [['idx_re', 45], ['idx_infra', 35], ['idx_cmd', 20]] },
    { id: 'cash',               name: 'Cash',                                   short: 'Cash',             color: '#9aa7b6', assetClasses: ['cash'],                     index: [['idx_cash', 100]] }
  ];

  D.assetClasses = [
    { id: 'us_eq',   name: 'US Equity',                      category: 'public_equity',      indexId: 'idx_us_eq' },
    { id: 'intl_eq', name: 'International Developed Equity', category: 'public_equity',      indexId: 'idx_dev_eq' },
    { id: 'em_eq',   name: 'Emerging Markets Equity',        category: 'public_equity',      indexId: 'idx_em_eq' },
    { id: 'pe',      name: 'Private Equity',                 category: 'private_equity',     indexId: 'idx_pe' },
    { id: 'govt',    name: 'Government Bonds',               category: 'ig_fixed_income',    indexId: 'idx_govt' },
    { id: 'ig',      name: 'Investment Grade Credit',        category: 'ig_fixed_income',    indexId: 'idx_ig' },
    { id: 'hy',      name: 'High Yield & Private Credit',    category: 'other_fixed_income', indexId: 'idx_hy' },
    { id: 'cash',    name: 'Cash',                           category: 'cash',               indexId: 'idx_cash' },
    { id: 'hf',      name: 'Hedge Funds',                    category: 'hedge_funds',        indexId: 'idx_hf' },
    { id: 're',      name: 'Real Estate',                    category: 'real_assets',        indexId: 'idx_re' },
    { id: 'cmd',     name: 'Commodities',                    category: 'real_assets',        indexId: 'idx_cmd' },
    { id: 'infra',   name: 'Infrastructure',                 category: 'real_assets',        indexId: 'idx_infra' }
  ];

  D.factors = [
    { id: 'equity',    name: 'Equity',           unit: 'β', description: 'Sensitivity to the global equity market factor.' },
    { id: 'rates',     name: 'Interest Rates',   unit: 'β', description: 'Sensitivity to a duration-matched government bond factor.' },
    { id: 'credit',    name: 'Credit',           unit: 'β', description: 'Sensitivity to the excess return of corporate credit over governments.' },
    { id: 'cmd',       name: 'Commodities',      unit: 'β', description: 'Sensitivity to a broad commodities basket.' },
    { id: 'fx',        name: 'Foreign Currency', unit: 'β', description: 'Sensitivity of unhedged exposure to a basket of currencies against USD.' },
    { id: 'inflation', name: 'Local Inflation',  unit: 'β', description: 'Sensitivity to unexpected changes in local inflation.' }
  ];

  var I = function (id, name, type, identifier, assetClass, extra) {
    var o = { id: id, name: name, type: type, identifier: identifier, assetClass: assetClass, currency: 'USD', valuation: 'daily', inception: '2012-01', coverage: 'full' };
    for (var k in extra) o[k] = extra[k];
    return o;
  };

  D.instruments = [
    /* indices — the category baskets, proxies and benchmark building blocks */
    I('idx_us_eq',  'US Broad Equity Index',             'Index', 'USBEQ',  'us_eq',   { inception: '2000-01' }),
    I('idx_dev_eq', 'Developed ex-US Equity Index',      'Index', 'DXUSEQ', 'intl_eq', { inception: '2000-01' }),
    I('idx_em_eq',  'Emerging Markets Equity Index',     'Index', 'EMEQ',   'em_eq',   { inception: '2000-01' }),
    I('idx_pe',     'Listed Private Equity Index',       'Index', 'LPEQ',   'pe',      { inception: '2004-01', valuation: 'monthly' }),
    I('idx_govt',   'Global Government Bond Index',      'Index', 'GGOV',   'govt',    { inception: '2000-01' }),
    I('idx_ig',     'Global IG Corporate Index',         'Index', 'GIGC',   'ig',      { inception: '2000-01' }),
    I('idx_hy',     'Global High Yield Index',           'Index', 'GHY',    'hy',      { inception: '2000-01' }),
    I('idx_cash',   'USD 3-Month Cash Index',            'Index', 'USD3M',  'cash',    { inception: '2000-01' }),
    I('idx_hf',     'Hedge Fund Composite Index',        'Index', 'HFCI',   'hf',      { inception: '2000-01', valuation: 'monthly' }),
    I('idx_re',     'Global Core Real Estate Index',     'Index', 'GCRE',   're',      { inception: '2000-01', valuation: 'quarterly' }),
    I('idx_cmd',    'Broad Commodities Index',           'Index', 'BCOM',   'cmd',     { inception: '2000-01' }),
    I('idx_infra',  'Global Infrastructure Index',       'Index', 'GINF',   'infra',   { inception: '2005-01', valuation: 'monthly' }),

    /* public equity */
    I('etf_us_lc',  'Meridian US Large Cap ETF',         'ETF',  'MRLC',   'us_eq',   { inception: '2008-05', manager: 'Meridian Asset Management', fee: 4 }),
    I('fund_us_eq', 'Meridian US Equity Insights Fund',  'Fund', 'MRUEX',  'us_eq',   { inception: '2010-09', manager: 'Meridian Asset Management', fee: 45 }),
    I('fund_us_sc', 'Halcyon US Small Cap Fund',         'Fund', 'HLSCX',  'us_eq',   { inception: '2011-03', manager: 'Halcyon Partners', fee: 78 }),
    I('fund_intl',  'Northbridge International Equity',  'Fund', 'NBIEX',  'intl_eq', { inception: '2009-02', manager: 'Northbridge Capital', fee: 62 }),
    I('etf_dev',    'Developed ex-US Equity ETF',        'ETF',  'DXUS',   'intl_eq', { inception: '2007-11', manager: 'Meridian Asset Management', fee: 7 }),
    I('fund_eu',    'Aldersgate Europe Equity Fund',     'Fund', 'ALEEX',  'intl_eq', { inception: '2013-06', manager: 'Aldersgate Investors', fee: 70 }),
    I('fund_jp',    'Kiso Japan Equity Fund',            'Fund', 'KISJX',  'intl_eq', { inception: '2014-10', manager: 'Kiso Asset Management', fee: 72 }),
    I('fund_em',    'Castellan Emerging Markets Fund',   'Fund', 'CSEMX',  'em_eq',   { inception: '2012-04', manager: 'Castellan Global', fee: 85 }),
    I('etf_em',     'Emerging Markets Equity ETF',       'ETF',  'EMEQX',  'em_eq',   { inception: '2009-07', manager: 'Meridian Asset Management', fee: 11 }),
    I('sec_vireo',  'Vireo Technologies plc',            'Security', 'VRO',  'us_eq',  { inception: '2012-01' }),
    I('sec_dunmore','Dunmore Utilities Inc.',            'Security', 'DNMR', 'us_eq',  { inception: '2012-01' }),
    I('sec_tarn',   'Tarn Healthcare Group',             'Security', 'TARN', 'us_eq',  { inception: '2012-01' }),

    /* private equity */
    I('pe_oakhurst','Oakhurst Buyout Partners IV',       'Fund', 'OBP-IV', 'pe',      { inception: '2016-03', valuation: 'quarterly', manager: 'Oakhurst Capital', fee: 150, coverage: 'proxy', proxyNote: 'Listed Private Equity Index before Mar 2016' }),
    I('pe_tamar',   'Tamar Private Equity VII',          'Fund', 'TPE-VII','pe',      { inception: '2019-06', valuation: 'quarterly', manager: 'Tamar Partners', fee: 175, coverage: 'proxy', proxyNote: 'Listed Private Equity Index before Jun 2019' }),
    I('pe_rivermead','Rivermead Growth Partners',        'Manager', 'RGP',  'pe',      { inception: '2024-01', valuation: 'quarterly', manager: 'Rivermead', fee: 200, coverage: 'none', proxyNote: 'No return history supplied for this manager' }),

    /* government bonds */
    I('fund_tsy',   'Sovereign Treasury Fund',           'Fund', 'SVTRX',  'govt',    { inception: '2005-02', manager: 'Sovereign Fixed Income', fee: 18 }),
    I('fund_ilb',   'Inflation-Linked Bond Fund',        'Fund', 'ILBFX',  'govt',    { inception: '2010-06', manager: 'Sovereign Fixed Income', fee: 22 }),
    I('etf_govt',   'Global Government Bond ETF',        'ETF',  'GGOVX',  'govt',    { inception: '2008-09', manager: 'Meridian Asset Management', fee: 6 }),

    /* credit */
    I('fund_ig',    'Ashworth Investment Grade Credit',  'Fund', 'ASIGX',  'ig',      { inception: '2010-01', manager: 'Ashworth Credit', fee: 35 }),
    I('etf_ig',     'Global IG Corporate ETF',           'ETF',  'GIGCX',  'ig',      { inception: '2009-04', manager: 'Meridian Asset Management', fee: 9 }),
    I('fund_hy',    'Ashworth High Yield Fund',          'Fund', 'ASHYX',  'hy',      { inception: '2010-01', manager: 'Ashworth Credit', fee: 55 }),
    I('fund_pc',    'Lantern Private Credit Fund II',    'Fund', 'LPC-II', 'hy',      { inception: '2021-03', valuation: 'quarterly', manager: 'Lantern Capital', fee: 125, coverage: 'proxy', proxyNote: 'Global High Yield Index before Mar 2021' }),

    /* cash */
    I('fund_cash',  'Treasury Money Market Fund',        'Fund', 'TMMXX',  'cash',    { inception: '2000-01', manager: 'Sovereign Fixed Income', fee: 10 }),

    /* hedge funds */
    I('hf_kestrel', 'Kestrel Multi-Strategy Fund',       'Fund', 'KMS',    'hf',      { inception: '2014-01', valuation: 'monthly', manager: 'Kestrel Capital', fee: 150, lookThrough: 0.72 }),
    I('hf_alder',   'Alder Global Macro Fund',           'Fund', 'AGM',    'hf',      { inception: '2012-07', valuation: 'monthly', manager: 'Alder Macro', fee: 140 }),
    I('hf_sable',   'Sable Equity Long/Short',           'Fund', 'SELS',   'hf',      { inception: '2015-04', valuation: 'monthly', manager: 'Sable Advisors', fee: 160 }),
    I('hf_corvid',  'Corvid Event Driven Fund',          'Fund', 'CEDF',   'hf',      { inception: '2013-02', valuation: 'monthly', manager: 'Corvid Partners', fee: 150 }),

    /* real assets */
    I('re_harbor',  'Harborview Core Real Estate',       'Fund', 'HCRE',   're',      { inception: '2012-01', valuation: 'quarterly', manager: 'Harborview', fee: 95 }),
    I('etf_reit',   'Global REIT ETF',                   'ETF',  'GREIT',  're',      { inception: '2008-03', manager: 'Meridian Asset Management', fee: 12 }),
    I('fund_cmd',   'Bramley Commodities Fund',          'Fund', 'BRCMX',  'cmd',     { inception: '2013-05', manager: 'Bramley', fee: 65 }),
    I('etf_gold',   'Physical Gold ETF',                 'ETF',  'PGLD',   'cmd',     { inception: '2006-01', manager: 'Meridian Asset Management', fee: 18 }),
    I('infra_grey', 'Greystone Infrastructure Partners', 'Fund', 'GIP',    'infra',   { inception: '2017-01', valuation: 'quarterly', manager: 'Greystone', fee: 110, coverage: 'proxy', proxyNote: 'Global Infrastructure Index before Jan 2017' }),
    I('etf_infra',  'Global Infrastructure ETF',         'ETF',  'GINFX',  'infra',   { inception: '2010-02', manager: 'Meridian Asset Management', fee: 14 })
  ];

  /* Starting points for a new allocation. Category targets equal the sums. */
  D.templates = [
    { id: 'tpl_6040', name: 'Strategic 60/40', description: 'Core equity and bonds through low-cost vehicles',
      holdings: [['etf_us_lc', 36], ['etf_dev', 18], ['etf_em', 6], ['etf_govt', 28], ['etf_ig', 12]] },
    { id: 'tpl_growth', name: 'Growth 80/20', description: 'Equity-led with a small defensive anchor',
      holdings: [['etf_us_lc', 45], ['fund_intl', 22], ['fund_em', 13], ['etf_govt', 12], ['fund_ig', 8]] },
    { id: 'tpl_income', name: 'Income', description: 'Credit, real assets and dividend equity',
      holdings: [['etf_us_lc', 20], ['etf_dev', 10], ['fund_tsy', 15], ['fund_ig', 20], ['fund_hy', 12], ['fund_pc', 8], ['re_harbor', 8], ['etf_infra', 7]] },
    { id: 'tpl_allweather', name: 'All-Weather Diversified', description: 'Balanced risk across growth, rates, inflation and alternatives',
      holdings: [['etf_us_lc', 18], ['etf_dev', 9], ['etf_em', 5], ['fund_tsy', 22], ['fund_ilb', 10], ['fund_ig', 8], ['hf_kestrel', 8], ['hf_alder', 6], ['fund_cmd', 6], ['etf_gold', 4], ['etf_infra', 4]] },
    { id: 'tpl_endow', name: 'Endowment Style', description: 'Private markets and hedge funds alongside public equity',
      holdings: [['etf_us_lc', 18], ['fund_intl', 9], ['fund_em', 6], ['pe_oakhurst', 12], ['pe_tamar', 8], ['fund_tsy', 8], ['fund_ig', 6], ['fund_pc', 5], ['hf_kestrel', 8], ['hf_corvid', 6], ['re_harbor', 8], ['infra_grey', 6]] }
  ];

  /* lookups */
  D.categoryById = {};
  D.categories.forEach(function (c) { D.categoryById[c.id] = c; });
  D.assetClassById = {};
  D.assetClasses.forEach(function (a) { D.assetClassById[a.id] = a; });
  D.instrumentById = {};
  D.instruments.forEach(function (i) { D.instrumentById[i.id] = i; });
  D.factorById = {};
  D.factors.forEach(function (f) { D.factorById[f.id] = f; });
  /* Reporting currencies. A workspace reports every figure in one of these,
     chosen when it is created. cash: the local 3-month rate, % a year, which
     sets the risk-free rate and the Cash category index. */
  var Cy = function (code, name, symbol, cash, common) { return { code: code, name: name, symbol: symbol, cash: cash, common: !!common }; };
  D.currencies = [
    Cy('USD', 'US dollar', '$', 3.2, true), Cy('EUR', 'Euro', '€', 2.1, true), Cy('GBP', 'Pound sterling', '£', 3.6, true), Cy('CHF', 'Swiss franc', 'CHF ', 0.6, true), Cy('JPY', 'Japanese yen', '¥', 0.6, true),
    Cy('AUD', 'Australian dollar', 'A$', 3.7), Cy('CAD', 'Canadian dollar', 'C$', 2.8), Cy('DKK', 'Danish krone', 'kr ', 2.0), Cy('HKD', 'Hong Kong dollar', 'HK$', 3.3),
    Cy('NOK', 'Norwegian krone', 'kr ', 3.9), Cy('NZD', 'New Zealand dollar', 'NZ$', 3.4), Cy('SEK', 'Swedish krona', 'kr ', 2.0), Cy('SGD', 'Singapore dollar', 'S$', 2.4)
  ];
  /* Look-through currency of each asset class, % (unhedged). Cash is held in
     the reporting currency. EM: emerging-market currencies together. */
  D.currencyLookThrough = {
    us_eq: { USD: 100 }, intl_eq: { EUR: 42, JPY: 22, GBP: 14, CHF: 9, AUD: 5, CAD: 8 }, em_eq: { EM: 100 }, pe: { USD: 66, EUR: 24, GBP: 6, EM: 4 },
    govt: { USD: 44, EUR: 27, JPY: 15, GBP: 7, CAD: 3, AUD: 2, EM: 2 }, ig: { USD: 58, EUR: 26, GBP: 8, CAD: 4, JPY: 2, AUD: 2 }, hy: { USD: 72, EUR: 22, GBP: 6 },
    hf: { USD: 84, EUR: 10, GBP: 6 }, re: { USD: 50, EUR: 20, JPY: 12, GBP: 10, AUD: 8 }, cmd: { USD: 100 }, infra: { USD: 44, EUR: 30, GBP: 16, AUD: 10 }
  };
  D.currencyByCode = {};
  D.currencies.forEach(function (c) { D.currencyByCode[c.code] = c; });
  D.currencyByCode.EM = { code: 'EM', name: 'Emerging-market currencies', symbol: '' };
  D.reporting = 'USD';
  /**
   * Point the mock at a workspace's reporting currency: the Cash index, the
   * risk-free rate and the currency factors are stated against it. (A service
   * does this server side; the UI only passes the currency.)
   */
  D.setReportingCurrency = function (code) {
    var c = D.currencyByCode[code] || D.currencyByCode.USD; D.reporting = c.code;
    var cash = D.instrumentById.idx_cash; cash.name = c.code + ' 3-Month Cash Index'; cash.identifier = c.code + '3M'; cash.currency = c.code;
    D.instruments.forEach(function (i) { if (i.spread != null) { i.name = c.code + ' 3-Month Cash + ' + i.spread + '%'; i.identifier = c.code + '3M+' + i.spread; i.currency = c.code; } });
    if (D.assumptions) D.assumptions.riskFree = c.cash;
    var fx = c.code === 'USD' ? 'Foreign Currency' : 'Foreign Currency vs ' + c.code, fxd = 'Sensitivity of unhedged exposure to a basket of currencies against ' + c.code + '.';
    D.factorById.fx.name = fx; D.factorById.fx.description = fxd;
    var mfx = c.code === 'USD' ? 'FX' : 'FX vs ' + c.code;
    (D.factorModels || []).forEach(function (m) { m.factors.forEach(function (f) { if (f.id === 'fx') { f.name = mfx; f.description = 'Unhedged foreign currency against ' + c.code + ', the reporting currency.'; } }); });
  };

  /** Category of an instrument, through its asset class. */
  D.categoryOf = function (instrumentId) { var i = D.instrumentById[instrumentId]; return i ? D.categoryById[D.assetClassById[i.assetClass].category] : null; };
})();

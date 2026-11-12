/* ─────────────────────────────────────────────────────────────────────────
   Mock data · benchmarks
   Two kinds, one picker:
     presets  maintained by the platform team; read-only, can be duplicated
     custom   built by users from indices, products, other benchmarks and a
              fixed rate (cash + x% a year); saved to the benchmark library,
              versioned like sleeves, shared with the team unless private

   Shapes
   ─────
   Benchmark        {id, name, kind:'benchmark', source:'preset'|'custom',
                     description, holdings:[{instrumentId, weight}]}
                    what every calculation reads (D.benchmarkById)
   CustomBenchmark  {id, name, source:'custom', description, owner,
                     visibility:'shared'|'private', rebalance:'monthly'|
                     'quarterly'|'annual'|'never', archived, createdAt,
                     versions:[{v, createdAt, note, rows:[Row]}]}
   Row              {kind:'index'|'product', id:instrumentId, weight}
                    {kind:'benchmark', id:benchmarkId, weight}
                    {kind:'rate', spread:% a year, weight}
   Weights are % and sum to 100.

   The registry (D.benchmarks, D.benchmarkById) holds the presets and every
   version of each custom benchmark, flattened to holdings: 'cbm_x' is the
   latest version and 'cbm_x@2' is version 2. An allocation that is assigned
   a custom benchmark keeps the version it was given ('cbm_x@2') until
   someone moves it to a newer one.
   ───────────────────────────────────────────────────────────────────────── */
(function () {
  'use strict';
  var PA = window.PA, D = PA.data;

  var B = function (id, name, description, holdings) {
    return { id: id, name: name, kind: 'benchmark', source: 'preset', description: description, holdings: holdings.map(function (h) { return { instrumentId: h[0], weight: h[1] }; }) };
  };
  D.benchmarkPresets = [
    B('bm_6040', 'Global 60/40', '60% global equity, 40% global bonds, index implemented',
      [['idx_us_eq', 36], ['idx_dev_eq', 18], ['idx_em_eq', 6], ['idx_govt', 28], ['idx_ig', 12]]),
    B('bm_7030', 'Global 70/30', '70% global equity, 30% global bonds',
      [['idx_us_eq', 42], ['idx_dev_eq', 21], ['idx_em_eq', 7], ['idx_govt', 21], ['idx_ig', 9]]),
    B('bm_4060', 'Conservative 40/60', '40% global equity, 60% global bonds and cash',
      [['idx_us_eq', 24], ['idx_dev_eq', 12], ['idx_em_eq', 4], ['idx_govt', 36], ['idx_ig', 18], ['idx_cash', 6]]),
    B('bm_acwi', 'Global Equity Index', 'All-country equity, market weighted',
      [['idx_us_eq', 62], ['idx_dev_eq', 27], ['idx_em_eq', 11]]),
    B('bm_agg', 'Global Aggregate Bonds', 'Governments and investment-grade credit',
      [['idx_govt', 62], ['idx_ig', 38]]),
    B('bm_endow', 'Endowment Composite', 'Diversified reference with private markets and alternatives',
      [['idx_us_eq', 20], ['idx_dev_eq', 10], ['idx_em_eq', 6], ['idx_pe', 18], ['idx_govt', 8], ['idx_ig', 6], ['idx_hy', 4], ['idx_hf', 14], ['idx_re', 8], ['idx_cmd', 2], ['idx_infra', 4]])
  ];

  var row = function (kind, id, weight) { return kind === 'rate' ? { kind: 'rate', spread: id, weight: weight } : { kind: kind, id: id, weight: weight }; };
  /* The shipped library: three custom benchmarks. */
  D.benchmarkLibrary = [
    { id: 'cbm_policy', name: 'Strategic Core Policy', source: 'custom', description: 'Policy mix agreed for the 2027 review: public, private and hedged exposures.', owner: 'PMG Admin', visibility: 'shared', rebalance: 'monthly', archived: false, createdAt: '2026-09-20T10:00:00Z',
      versions: [
        { v: 1, createdAt: '2026-09-20T10:00:00Z', note: 'Initial', rows: [row('index', 'idx_us_eq', 26), row('index', 'idx_dev_eq', 13), row('index', 'idx_em_eq', 6), row('index', 'idx_govt', 20), row('index', 'idx_ig', 12), row('index', 'idx_hy', 4), row('product', 'hf_kestrel', 7), row('index', 'idx_pe', 8), row('rate', 3, 4)] },
        { v: 2, createdAt: '2026-11-02T14:30:00Z', note: 'Real estate added; less US equity', rows: [row('index', 'idx_us_eq', 24), row('index', 'idx_dev_eq', 12), row('index', 'idx_em_eq', 6), row('index', 'idx_govt', 18), row('index', 'idx_ig', 12), row('index', 'idx_hy', 4), row('product', 'hf_kestrel', 7), row('index', 'idx_pe', 8), row('index', 'idx_re', 4), row('rate', 3, 5)] }
      ] },
    { id: 'cbm_cash3', name: 'Cash + 3%', source: 'custom', description: 'Absolute-return target: the reporting currency’s 3-month cash rate plus 3% a year.', owner: 'PMG Admin', visibility: 'shared', rebalance: 'monthly', archived: false, createdAt: '2026-08-04T09:00:00Z',
      versions: [{ v: 1, createdAt: '2026-08-04T09:00:00Z', note: 'Initial', rows: [row('rate', 3, 100)] }] },
    { id: 'cbm_7030_alts', name: '70/30 with Alternatives', source: 'custom', description: 'The Global 70/30 preset with a sleeve of hedge funds and private equity.', owner: 'PMG Admin', visibility: 'private', rebalance: 'quarterly', archived: false, createdAt: '2026-10-11T16:20:00Z',
      versions: [{ v: 1, createdAt: '2026-10-11T16:20:00Z', note: 'Initial', rows: [row('benchmark', 'bm_7030', 80), row('index', 'idx_hf', 10), row('index', 'idx_pe', 10)] }] }
  ];

  /** A fixed-rate constituent: the reporting currency's cash index plus a spread, as an instrument. */
  D.rateInstrument = function (spread) {
    spread = Math.round(Number(spread) * 100) / 100;
    var id = 'rate_cash_' + String(spread).replace('.', '_');
    if (D.instrumentById[id]) return D.instrumentById[id];
    var code = D.reporting || 'USD', cash = D.instrumentById.idx_cash;
    var ins = { id: id, name: code + ' 3-Month Cash + ' + spread + '%', type: 'Index', identifier: code + '3M+' + spread, assetClass: 'cash', currency: code, valuation: 'daily', inception: cash.inception, coverage: 'full', spread: spread };
    D.instruments.push(ins); D.instrumentById[id] = ins;
    if (D.history && D.history.instrument.idx_cash) D.history.instrument[id] = D.history.instrument.idx_cash.map(function (v) { return v == null ? null : v + spread / 1200; });
    return ins;
  };
  /** The holdings a version's rows stand for; a benchmark row is looked through. */
  D.flattenRows = function (rows) {
    var w = {};
    rows.forEach(function (r) {
      if (r.kind === 'rate') { var ri = D.rateInstrument(r.spread); w[ri.id] = (w[ri.id] || 0) + r.weight; return; }
      if (r.kind === 'benchmark') { var b = D.benchmarkById[r.id]; if (b) b.holdings.forEach(function (h) { w[h.instrumentId] = (w[h.instrumentId] || 0) + h.weight * r.weight / 100; }); return; }
      if (D.instrumentById[r.id]) w[r.id] = (w[r.id] || 0) + r.weight;
    });
    return Object.keys(w).map(function (id) { return { instrumentId: id, weight: Math.round(w[id] * 10000) / 10000 }; });
  };
  D.latestVersion = function (b) { return b.versions[b.versions.length - 1]; };
  /** Rebuild the registry from the presets and a library listing. */
  D.registerBenchmarks = function (library) {
    D.benchmarkById = {}; D.benchmarks = D.benchmarkPresets.slice();
    D.benchmarkPresets.forEach(function (b) { D.benchmarkById[b.id] = b; });
    var pending = (library || []).slice(), guard = 0;
    /* a custom benchmark can contain another, so register in dependency order */
    while (pending.length && guard++ < 20) {
      pending = pending.filter(function (b) {
        var ready = b.versions.every(function (v) { return v.rows.every(function (r) { return r.kind !== 'benchmark' || D.benchmarkById[r.id]; }); });
        if (!ready) return true;
        b.versions.forEach(function (v) { D.benchmarkById[b.id + '@' + v.v] = { id: b.id + '@' + v.v, name: b.name, kind: 'benchmark', source: 'custom', customId: b.id, version: v.v, description: b.description, archived: !!b.archived, holdings: D.flattenRows(v.rows) }; });
        var last = D.latestVersion(b), latest = Object.assign({}, D.benchmarkById[b.id + '@' + last.v], { id: b.id });
        D.benchmarkById[b.id] = latest; if (!b.archived) D.benchmarks.push(latest);
        return false;
      });
    }
  };
  D.registerBenchmarks(D.benchmarkLibrary);
})();

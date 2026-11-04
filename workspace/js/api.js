/* ─────────────────────────────────────────────────────────────────────────
   Portfolio Analytics · data access layer
   Every read and write the interface makes goes through PA.api. Two adapters
   implement the same contract:

     mock — in-page data (data/*.js) and the mock engine (js/engine.js), with
            simulated latency and failure switches for demos. Default.
     http — a thin fetch() client against the endpoints listed below. It is
            the handoff target: point PA.api.configure({adapter:'http',
            baseUrl:'/api/v1'}) at a service that returns the shapes
            documented here and nothing in js/ui/ changes.

   Endpoints the http adapter expects (JSON in, JSON out)
   ─────────────────────────────────────────────────────
     GET    /workspaces                      → WorkspaceSummary[]
     GET    /workspaces/:id                  → Workspace
     POST   /workspaces                      ← {name, currency, description} → Workspace
                                              (currency is required: the reporting currency)
     PUT    /workspaces/:id                  ← Workspace → {savedAt, version}
     DELETE /workspaces/:id                  → {}
     GET    /universe                        → {categories, assetClasses, factors, factorModels, benchmarks, templates, instruments}
     GET    /assumptions                     → Assumptions (see data/assumptions.js)
     GET    /investments?q=…&limit=…&category=…  → SearchResult[]
     GET    /sleeves                         → Sleeve[]           (shared repository, see data/sleeves.js)
     PUT    /sleeves/:id                     ← Sleeve → Sleeve    (create, rename, or add a version)
     PATCH  /sleeves/:id                     ← {archived} → Sleeve
     GET    /benchmarks                      → {presets:Benchmark[], custom:CustomBenchmark[]}  (see data/benchmarks.js)
     PUT    /benchmarks/:id                  ← CustomBenchmark → CustomBenchmark (create, rename, or add a version)
     PATCH  /benchmarks/:id                  ← {archived} → CustomBenchmark
     GET    /cards                           → SavedCard[]        (shared card repository)
     PUT    /cards/:id                       ← SavedCard → SavedCard
     DELETE /cards/:id                       → {}
     POST   /analytics/table                 ← TableRequest   → TableResponse
     POST   /analytics/history               ← HistoryRequest → HistoryResponse
     POST   /analytics/history-pack          ← PackRequest    → PackResponse
     POST   /analytics/headline              ← {allocations, period, scenario, factorModel, reference} → {period, horizons, series:[{allocationId, benchmark, forward:Headline, historical:Headline}]}
     POST   /analytics/factor-table          ← {allocations, basis, period, scenario, factorModel, reference} → {factorModel, factors, period, series:[{allocationId, values:{exposure, risk, ret}, reference, referenceLabel}]}
     POST   /analytics/factor-history        ← {allocations, period, factorModel} → {factorModel, period, series:[{allocationId, history:{factors, years, exposure, risk, ret, totals}}]}
     POST   /analytics/breakdown             ← {allocations}  → BreakdownResponse
     POST   /analytics/projection            ← ProjectionRequest → ProjectionResponse
     POST   /analytics/scenarios             ← ScenarioRequest → ScenarioResponse
     POST   /analytics/summaries             ← {allocations} → {[allocationId]:{ret, vol, sharpe}}
     POST   /analytics/active                ← ActiveRequest  → ActiveResponse
     POST   /analytics/factor-risk           ← FactorRiskRequest → FactorRiskResponse
     POST   /analytics/forward-suite         ← SuiteRequest → ForwardSuiteResponse
     POST   /analytics/history-suite         ← SuiteRequest → HistorySuiteResponse
     POST   /analytics/structure             ← SuiteRequest → StructureResponse
     POST   /analytics/optimize              ← OptimizeRequest → OptimizeResponse
     GET    /products                        → ProductRecord[]    (uploaded products, see js/products.js)
     POST   /products/fit                    ← {returns:{start, values}} → {fits:Fit[], stats}  (closest asset classes)
     POST   /products                        ← ProductRecord[] → ProductRecord[]  (add from pasted returns)
     PATCH  /products/:id                    ← {name?, archived?} → ProductRecord
     GET    /products/:id/analytics?factorModel=…  → ProductAnalytics
   Every analytics request carries the workspace's reporting currency in the
   X-Reporting-Currency header (useCurrency); figures come back in it.

   Shapes
   ─────
   TableRequest   {revision, allocations:Allocation[], basis:'forward'|'historical',
                   metric:'weight'|'return'|'risk'|'factor', values:'absolute'|'delta',
                   riskUnits:'share'|'vol', factors:string[],
                   reference:{referenceMode:'shared'|'individual'|'portfolio', sharedBenchmarkId, referencePortfolioId},
                   period:{preset, start, end}, scenario:Scenario|null,
                   factorModel:'isg'|'axioma'  (betas for metric 'factor')}
   TableResponse  {revision, factorModel, modelAsOf, unit, rows:Row[], columns:Column[], cells, period, warnings:string[],
                   scenario:{id,name}|null, scenarioApplies:boolean (false on the historical basis)}
     Row          {key, label, depth, kind:'category'|'holding'|'index'|'residual'|'total', parent, categoryId?, hasChildren, instrumentId?, note?}
     Column       {allocationId, name, kind, color, sets:['base'|'scenario'…], inScope,
                   basisLabel, basisDetail, referenceLabel, referenceReason, coverageNote}
     cells        {[allocationId]:{[rowKey]:{base:Cell, scenario?:Cell}}}
     Cell         {value:number|null, reason?:string, factors?:{[factorId]:number|null}, note?:string, coverage?:string}
                  value is already a difference when values === 'delta'
   HistoryRequest {allocations, rowKey, metric, riskUnits, period:{start,end}, factors, factorModel}
   HistoryResponse{months:string[], unit, kind:'growth'|'line'|'bars', series:[{allocationId, values:(number|null)[], basis, actual?:(number|null)[], coverage}]}
   PackRequest    {allocations, period}
   PackResponse   {months, period, stress:[{id,name,start,end}],
                   series:[{allocationId, basis, basisLabel, returns, growth, actual?, underwater,
                            episodes:[{peak,trough,recovery,depth,length,recoveryMonths}],
                            stats:{annReturn, vol, sharpe, maxDrawdown, bestMonth, worstMonth, positive, months, cumulative}|null,
                            calendar:[{year, ret, partial}], stressReturns:[{id, ret, reason}],
                            rolling:{ret12, vol36}, coverage}],
                   correlation:(number|null)[][]}     monthly-return correlations between the allocations
   BreakdownResponse {categories:[{id,name,color}], series:[{allocationId, allocated, categories:[{id, target, implemented, remainder, over, products:[{instrumentId, name, weight, sleeveRef}]}]}]}
   ProjectionRequest {allocations, rowKey, scenario, horizon, confidence, basis:'standalone'|'contribution'}
   ProjectionResponse{unit, series:[{allocationId, inScope, years, central, bands:[{level, low, high}], mu, vol, start}]}
   ScenarioRequest {allocations, rowKey, metric, riskUnits, factor, scenarios:Scenario[]}
   ScenarioResponse{unit, series:[{allocationId, base:Cell, scenarios:[{scenarioId, cell:Cell}]}]}
   FactorModel    {id, name, long, asOf, note, factors:[{id, name, unit, description, mapsTo?, signFlip?}], defaultFactors}
   ActiveRequest  {allocations, rowKey, basis, period, scenario, factorModel, returnMethod:'arithmetic'|'geometric',
                   decompose:'factor'|'category'|'assetClass'|'product' (attributes both the active risk and the active return),
                   reference (as TableRequest),
                   against:{mode:'reference'|'own'|'pick', ref?:{kind:'benchmark'|'instrument'|'allocation'|'sleeve', id, label?, holdings?}}}
   ActiveResponse {factorModel, modelAsOf, basis, period, series:[{allocationId, benchmark:{label, kind, note?}, reason?,
                   totalReturn, passiveReturn, activeReturn, totalRisk, passiveRisk, activeRisk, activePassiveCorr,
                   informationRatio, activeShare, riskSources:[{key, label, contribution}], specific, riskSourcesNote?,
                   returnSources: by category or asset class [{key, label, weight, benchWeight, allocation, selection, contribution}],
                                  by product [{key, label, weight, benchWeight, ret, contribution}],
                                  by factor [{key, label, exposure, premium, contribution}] plus a specific line,
                   returnTotals:{allocation?, selection?, factor?, specific?, arithmetic, attributed},
                   over?:{months, te36, cumActive} (historical), coverage, scenarioApplied}]}
     Risk is in % a year, contributions are Euler (they sum to the tracking error); returns are % a year.
   FactorRiskRequest {allocations, rowKey, factorModel}
   FactorRiskResponse{factorModel, modelAsOf, factors:[{id, name}], series:[{allocationId, total, byFactor:{[id]:pp}, specific, exposure, coverage}]}
   SuiteRequest   {allocations, reference (as TableRequest), period?, scenario?, horizon?, target?}
   ForwardSuiteResponse {riskFree, stress:[{id, name, combined}], reference:{label, ret, vol, …}|null,
                   series:[{allocationId, reason?, scenarioApplied, ret, vol, sharpe, var95, es95, var99, es99,
                            pLoss, pCash, pTarget, target, horizon, divRatio, enb, categoryShares:[{id, share}],
                            stress:[{id, value}], reference:{label, ret, vol, sharpe}}]}
     returns, risk and losses in % a year; probabilities in %; value at risk and shortfall as losses
   HistorySuiteResponse {months, period, series:[{allocationId, reason?, reference:{label}, returns:(number|null)[],
                   stats:{months, mean, sd, skew, kurtosis, bins:[{from, to, count}], worst:[{m, r}], positive,
                          upCapture, downCapture, upMonths, downMonths, beta, correlation, hitRate}}]}
   OptimizeRequest {allocation, scenario, factorModel, options:{objective:'minVol'|'maxReturn'|'active', target (% a year),
                   teMode:'target'|'min', longOnly, maxWeight (%), band (pp)|null, useIndices, includeAll, preview?}}
                   the benchmark for tracking error is the allocation's own (benchmarkId)
   OptimizeResponse{current:{ret, vol, sharpe, te, ir}, proposed?, assets?:[{key, kind:'product'|'index', categoryId,
                   instrumentId, label, current, proposed}] (% of the total), frontier:[{ret, risk}], riskUnit:'vol'|'te',
                   range:{minRet, maxRet, minRisk, maxRisk}, reason? (target out of reach), note?, error?}
                   preview: {current, rangeVol, rangeTE|null, benchmark}
   ProductAnalytics {id, name, type, identifier, source, assetClass, category, index,
                   forward:{ret, vol, sharpe, beta, exposure:{[factorId]:β}, specific, factorShare, coverage},
                   historical:{months, start, end, annReturn, vol, sharpe, maxDrawdown, best, worst, positive,
                               growthStart, growth, indexGrowth, calendar, corr, r2}|null, fit|null}
   StructureResponse {currency, categories:[{id, name, short, color}], currencies:string[],
                   series:[{allocationId, reference:{label}|null, weights:{[categoryId]:%}, referenceWeights, active,
                            currency:{[code]:%}}]}
   ───────────────────────────────────────────────────────────────────────── */
(function () {
  'use strict';
  var PA = window.PA, U = PA.util, D = PA.data, E = PA.engine;

  var config = { adapter: 'mock', baseUrl: '/api/v1', latency: 380, slow: false, failSave: false, failAnalytics: false };
  var STORE_KEY = 'pa.workspace.mock.v4';

  /* ── shared helpers (used by the mock adapter) ────────────────────── */
  function metricOf(rowRes, metric, riskUnits, fid) {
    if (!rowRes) return null;
    if (metric === 'weight') return rowRes.weight;
    if (metric === 'return') return rowRes.ret;
    if (metric === 'risk') return riskUnits === 'share' ? rowRes.riskShare : rowRes.riskVol;
    if (metric === 'factor') return rowRes.beta ? rowRes.beta[fid] : null;
    return null;
  }
  function unitFor(metric, values, riskUnits) {
    if (metric === 'factor') return 'β';
    if (metric === 'weight') return values === 'delta' ? 'pp' : '%';
    if (metric === 'risk') return riskUnits === 'share' ? (values === 'delta' ? 'pp' : '%') : 'pp';
    return 'pp';
  }
  function findReference(alloc, req) {
    var ref = req.reference || {};
    if (ref.referenceMode === 'individual') {
      if (!alloc.benchmarkId) return { alloc: null, label: null, reason: 'No benchmark assigned' };
      var b = D.benchmarkById[alloc.benchmarkId];
      return { alloc: b, label: b ? b.name : null, reason: b ? null : 'Benchmark not found' };
    }
    if (ref.referenceMode === 'portfolio') {
      var p = (req.allocations || []).filter(function (a) { return a.id === ref.referencePortfolioId; })[0] || D.benchmarkById[ref.referencePortfolioId];
      if (!p) return { alloc: null, label: null, reason: 'Reference portfolio not in the comparison' };
      return { alloc: p, label: p.id === alloc.id ? p.name + ' (itself)' : p.name, reason: null };
    }
    var sb = D.benchmarkById[ref.sharedBenchmarkId];
    return { alloc: sb, label: sb ? sb.name : null, reason: sb ? null : 'No shared benchmark chosen' };
  }
  /** The holdings an active or factor-risk request measures: the whole
      allocation (its effective holdings), or one row rescaled to 100. */
  function subjectOf(alloc, rowKey) {
    if (!rowKey || rowKey === '__total') { var hs = E.effective(alloc); return hs.length ? { holdings: hs.map(function (h) { return { instrumentId: h.instrumentId, weight: h.weight }; }), returnsFrom: function (f, t) { var r = E.rowReturns(alloc, '__total', f, t); return r ? r.returns : E.backtest(hs, f, t).returns; } } : null; }
    var list = E.holdingsFor(alloc, rowKey), W = U.sum(list, function (h) { return h.weight; });
    if (!list.length || Math.abs(W) < 1e-9) return null;
    return { holdings: list.map(function (h) { return { instrumentId: h.instrumentId, weight: h.weight / W * 100 }; }) };
  }
  function basketOf(categoryId) { var c = D.categoryById[categoryId], tot = U.sum(c.index, function (p) { return p[1]; }); return c.index.map(function (p) { return { instrumentId: p[0], weight: p[1] / tot * 100 }; }); }
  function scaled(list) { var W = U.sum(list, function (h) { return h.weight; }); return Math.abs(W) < 1e-9 ? null : list.map(function (h) { return { instrumentId: h.instrumentId, weight: h.weight / W * 100 }; }); }
  /**
   * What a subject is measured against. mode 'reference' follows the context
   * bar; 'own' uses the subject's own benchmark (allocation → its benchmark,
   * category → its index basket, product → its stated benchmark, sleeve →
   * its category index); 'pick' uses ref. Following a row, a reference
   * portfolio is cut to the same row; where it holds nothing there, the
   * category index stands in and the note says so.
   */
  function benchmarkFor(alloc, req) {
    var mode = (req.against && req.against.mode) || 'reference', key = req.rowKey && req.rowKey !== '__total' ? req.rowKey : null, parts = key ? key.split('/') : null;
    var ownOfRow = function () {
      if (parts.length === 1 || parts[1] === '__index') return { holdings: basketOf(parts[0]), label: D.categoryById[parts[0]].short + ' Index', kind: 'index' };
      var ins = D.instrumentById[parts[1]];
      if (ins.benchmarkId) return { holdings: [{ instrumentId: ins.benchmarkId, weight: 100 }], label: D.instrumentById[ins.benchmarkId].name, kind: 'product benchmark' };
      return { holdings: basketOf(parts[0]), label: D.categoryById[parts[0]].short + ' Index', kind: 'index', note: ins.name + ' has no stated benchmark; its category index is used' };
    };
    if (mode === 'pick') {
      var ref = (req.against && req.against.ref) || {};
      if (ref.kind === 'benchmark') { var b = D.benchmarkById[ref.id]; return b ? { holdings: b.holdings, label: b.name, kind: 'benchmark' } : { label: null, reason: 'Benchmark not found' }; }
      if (ref.kind === 'instrument') { var i = D.instrumentById[ref.id]; return i ? { holdings: [{ instrumentId: i.id, weight: 100 }], label: i.name, kind: 'product' } : { label: null, reason: 'Product not found' }; }
      if (ref.kind === 'allocation' && ref.allocation) { var pa = E.effective(ref.allocation); return pa.length ? { holdings: pa.map(function (h) { return { instrumentId: h.instrumentId, weight: h.weight }; }), label: ref.label || ref.allocation.name, kind: 'allocation' } : { label: ref.label, reason: ref.label + ' holds nothing' }; }
      if (ref.holdings && ref.holdings.length) return { holdings: ref.holdings, label: ref.label || 'Picked portfolio', kind: ref.kind };
      return { label: null, reason: 'Pick a benchmark in the card settings' };
    }
    if (mode === 'own') {
      if (key) return ownOfRow();
      if (alloc.kind === 'sleeve' && alloc.sleeve) return { holdings: basketOf(alloc.sleeve.categoryId), label: D.categoryById[alloc.sleeve.categoryId].short + ' Index', kind: 'index', note: 'A sleeve is measured against its category index' };
      if (!alloc.benchmarkId) return { label: null, reason: 'No benchmark assigned to ' + alloc.name };
      var ob = D.benchmarkById[alloc.benchmarkId]; return ob ? { holdings: ob.holdings, label: ob.name, kind: 'benchmark' } : { label: null, reason: 'Benchmark not found' };
    }
    var r = findReference(alloc, req); if (!r.alloc) return { label: null, reason: r.reason };
    var full = r.alloc.kind === 'benchmark' ? r.alloc.holdings : E.effective(r.alloc);
    if (!key) return { holdings: full.map(function (h) { return { instrumentId: h.instrumentId, weight: h.weight }; }), label: r.label, kind: r.alloc.kind === 'benchmark' ? 'benchmark' : 'allocation' };
    var cut = scaled(E.holdingsFor(r.alloc.kind === 'benchmark' ? { holdings: r.alloc.holdings } : r.alloc, key));
    if (cut) return { holdings: cut, label: r.label + ' · ' + (parts.length > 1 && parts[1] !== '__index' ? D.instrumentById[parts[1]].name : D.categoryById[parts[0]].short), kind: 'reference row' };
    var own = ownOfRow(); own.note = r.label + ' holds nothing in this row; ' + own.label + ' is used'; return own;
  }
  function resolvePeriod(allocations, period) {
    var H = D.history, end = H.end, starts = allocations.map(function (a) { return E.historyBasis(a).start; });
    var common = starts.reduce(function (acc, s) { return U.ym.max(acc, s); }, H.start);
    var driver = allocations[starts.indexOf(common)];
    var p = period || { preset: 'common' }, start = common, note = null, adjusted = false;
    if (p.preset && /^\d+y$/.test(p.preset)) {
      var want = U.ym.add(end, -(parseInt(p.preset, 10) * 12) + 1);
      if (U.ym.toIndex(want) < U.ym.toIndex(common)) { start = common; adjusted = true; note = 'Shortened to the common history: ' + (driver ? driver.name : 'an allocation') + ' has data from ' + U.fmt.month(common); }
      else start = want;
    } else if (p.preset === 'custom' && p.start) {
      start = p.start; if (p.end) end = U.ym.min(p.end, H.end);
      if (U.ym.toIndex(start) < U.ym.toIndex(common)) { start = common; adjusted = true; note = 'Start moved to ' + U.fmt.month(common) + ': earlier months have no data for ' + (driver ? driver.name : 'every allocation'); }
      if (U.ym.toIndex(start) > U.ym.toIndex(end)) start = end;
    } else if (driver && allocations.length > 1) {
      note = 'Common period set by ' + driver.name + ' (' + E.historyBasis(driver).label.toLowerCase() + ' from ' + U.fmt.month(common) + ')';
    }
    return { start: start, end: end, label: U.fmt.month(start) + ' – ' + U.fmt.month(end), note: note, adjusted: adjusted, commonStart: common, driver: driver ? driver.name : null };
  }
  function fail() { throw { code: 'service_unavailable', message: 'The analytics service did not respond' }; }

  /* ── mock adapter ────────────────────────────────────────────────── */
  var mock = (function () {
    var store = null;
    function load() {
      if (store) return store;
      try { var raw = localStorage.getItem(STORE_KEY); if (raw) { var parsed = JSON.parse(raw); if (parsed && parsed.workspaces && parsed.sleeves) { store = parsed; if (!store.benchmarks) store.benchmarks = U.clone(D.benchmarkLibrary); if (!store.products) store.products = []; if (store.twoCardDefault !== 2) { store.twoCardDefault = 2; store.workspaces.forEach(function (w) { var src = D.workspaces.filter(function (x) { return x.id === w.id; })[0]; if (src) w.cards = U.clone(src.cards); }); persist(); } D.registerProducts(store.products); D.registerBenchmarks(store.benchmarks); return store; } } } catch (e) { /* storage unavailable */ }
      store = fresh(); D.registerProducts(store.products); D.registerBenchmarks(store.benchmarks);
      return store;
    }
    function fresh() {
      var need = [['workspaces', 'data/workspaces.js'], ['sleeveRepository', 'data/sleeves.js'], ['savedCards', 'data/sleeves.js'], ['benchmarkLibrary', 'data/benchmarks.js']], gone = need.filter(function (n) { return !D[n[0]]; }).map(function (n) { return n[1]; });
      if (gone.length) throw { code: 'missing_data', message: 'The sample data did not load (' + gone.filter(function (f, i) { return gone.indexOf(f) === i; }).join(', ') + '). Check that the whole workspace folder was copied and that its files are available offline, then reload.' };
      return { workspaces: U.clone(D.workspaces), sleeves: U.clone(D.sleeveRepository), savedCards: U.clone(D.savedCards), benchmarks: U.clone(D.benchmarkLibrary), products: [], version: 1, twoCardDefault: 2 }; }
    function persist() { try { localStorage.setItem(STORE_KEY, JSON.stringify(store)); } catch (e) { /* keep in memory */ } }
    function wait(ms) { return new Promise(function (r) { setTimeout(r, ms); }); }
    function latency() { return config.slow ? 1800 : config.latency + Math.random() * 140; }
    function summary(ws) {
      return { id: ws.id, name: ws.name, description: ws.description, owner: ws.owner, updatedAt: ws.updatedAt, currency: ws.currency, cards: (ws.cards || []).length,
        members: ws.comparison.members.map(function (id) { var a = ws.allocations.filter(function (x) { return x.id === id; })[0]; return a ? { id: a.id, name: a.name, color: a.color, kind: a.kind } : null; }).filter(Boolean),
        scenarios: ws.scenarios.length, activeScenario: ws.activeScenarioId ? (ws.scenarios.filter(function (s) { return s.id === ws.activeScenarioId; })[0] || {}).name : null };
    }
    function computeFor(req, alloc, R, rows, period) { return req.basis === 'forward' ? E.forward(alloc, R, rows, req.factorModel) : E.historical(alloc, rows, period.start, period.end, req.factorModel); }

    return {
      listWorkspaces: function () { return wait(latency() * 0.6).then(function () { return load().workspaces.map(summary); }); },
      getWorkspace: function (id) { return wait(latency()).then(function () { var ws = load().workspaces.filter(function (w) { return w.id === id; })[0]; if (!ws) throw { code: 'not_found', message: 'Workspace not found' }; return U.clone(ws); }); },
      createWorkspace: function (input) {
        return wait(latency()).then(function () {
          var now = new Date().toISOString();
          if (!input.currency || !D.currencyByCode[input.currency]) throw { code: 'invalid', message: 'Choose a reporting currency' };
          var ws = { id: U.uid('ws'), name: input.name || 'Untitled workspace', description: input.description || '', currency: input.currency, owner: 'F. Barker', createdAt: now, updatedAt: now,
            allocations: [], comparison: { members: [], activeId: null, referenceMode: 'shared', sharedBenchmarkId: 'bm_6040', referencePortfolioId: null },
            scenarios: [], activeScenarioId: null, cards: U.clone(D.workspaces[0].cards), prefs: U.clone(D.workspaces[0].prefs), activity: [{ at: now, type: 'create', label: 'Workspace created' }] };
          ws.prefs.emphasis = []; ws.prefs.selectedRow = 'public_equity';
          load().workspaces.unshift(ws); persist(); return U.clone(ws);
        });
      },
      saveWorkspace: function (ws) {
        return wait(latency()).then(function () {
          if (config.failSave) throw { code: 'service_unavailable', message: 'The workspace service did not respond' };
          var list = load().workspaces, i = -1; list.forEach(function (w, k) { if (w.id === ws.id) i = k; });
          var copy = U.clone(ws); copy.updatedAt = new Date().toISOString();
          if (i < 0) list.unshift(copy); else list[i] = copy;
          persist(); return { savedAt: copy.updatedAt, version: ++store.version };
        });
      },
      deleteWorkspace: function (id) { return wait(latency()).then(function () { store = load(); store.workspaces = store.workspaces.filter(function (w) { return w.id !== id; }); persist(); return {}; }); },
      resetSampleData: function () { store = fresh(); D.registerProducts(store.products); D.registerBenchmarks(store.benchmarks); persist(); return Promise.resolve({}); },
      /* uploaded products */
      listProducts: function () { return wait(latency() * 0.4).then(function () { return U.clone(load().products); }); },
      fitReturns: function (input) {
        return wait(120).then(function () {
          var vals = E.alignedReturns({ start: input.start, returns: input.values });
          return { fits: E.fitAll(vals), stats: E.seriesStats(vals, D.history.months) };
        });
      },
      addProducts: function (records) {
        return wait(latency()).then(function () {
          var list = load().products, now = new Date().toISOString(), names = D.instruments.map(function (i) { return i.name.toLowerCase(); });
          var out = records.map(function (r) {
            if (!r.name || !r.name.trim()) throw { code: 'invalid', message: 'Every product needs a name' };
            if (!D.assetClassById[r.assetClass]) throw { code: 'invalid', message: 'Unknown asset class for ' + r.name };
            if (r.returns.filter(function (v) { return v != null; }).length < 12) throw { code: 'invalid', message: r.name + ' needs at least 12 monthly returns' };
            var name = r.name.trim(), k = 2; while (names.indexOf(name.toLowerCase()) >= 0) name = r.name.trim() + ' (' + k++ + ')'; names.push(name.toLowerCase());
            return { id: U.uid('up'), name: name, identifier: r.identifier || ('UP-' + name.replace(/[^A-Za-z0-9]/g, '').slice(0, 6).toUpperCase()), type: r.type || 'Fund', assetClass: r.assetClass, currency: r.currency || D.reporting, start: r.start, returns: r.returns.slice(), proxy: r.proxy !== false, source: 'uploaded', owner: 'F. Barker', createdAt: now, archived: false, description: r.description || '', origin: r.origin || null };
          });
          out.forEach(function (p) { list.unshift(p); });
          D.registerProducts(list); persist(); return U.clone(out);
        });
      },
      updateProduct: function (id, patch) {
        return wait(latency() * 0.5).then(function () {
          var p = load().products.filter(function (x) { return x.id === id; })[0]; if (!p) throw { code: 'not_found', message: 'Product not found' };
          if (patch.name != null) { if (!patch.name.trim()) throw { code: 'invalid', message: 'Enter a name' }; p.name = patch.name.trim(); }
          if (patch.archived != null) p.archived = !!patch.archived;
          D.registerProducts(load().products); persist(); return U.clone(p);
        });
      },
      productAnalytics: function (id, opts) { return wait(latency() * 0.5).then(function () { if (config.failAnalytics) fail(); load(); var r = E.productAnalytics(id, E.resolve(null), opts && opts.factorModel); if (!r) throw { code: 'not_found', message: 'Product not found' }; return r; }); },
      optimize: function (req) {
        return wait(req.options && req.options.preview ? 90 : latency()).then(function () {
          if (config.failAnalytics) fail();
          var a = req.allocation, bm = a.benchmarkId ? D.benchmarkById[a.benchmarkId] : null;
          var inScope = !!(req.scenario && req.scenario.scope.indexOf(a.id) >= 0);
          return E.optimize(a, Object.assign({}, req.options, { scenario: inScope ? req.scenario : null, factorModel: req.factorModel, benchmark: bm ? { holdings: bm.holdings, label: bm.name } : null }));
        });
      },
      useCurrency: function (code) { D.setReportingCurrency(code); return Promise.resolve({ currency: D.reporting }); },
      /* benchmark library */
      listBenchmarks: function () { return wait(latency() * 0.4).then(function () { return { presets: U.clone(D.benchmarkPresets), custom: U.clone(load().benchmarks) }; }); },
      saveBenchmark: function (b) {
        return wait(latency() * 0.6).then(function () {
          var v = D.latestVersion(b), total = U.sum(v.rows, function (r) { return r.weight; });
          if (Math.abs(total - 100) > 0.051) throw { code: 'invalid', message: 'Weights must total 100%' };
          if (v.rows.some(function (r) { return r.kind === 'benchmark' && (r.id === b.id || r.id.indexOf(b.id + '@') === 0); })) throw { code: 'invalid', message: 'A benchmark cannot contain itself' };
          var list = load().benchmarks, i = -1; list.forEach(function (x, k) { if (x.id === b.id) i = k; });
          var copy = U.clone(b); if (i < 0) list.unshift(copy); else list[i] = copy;
          D.registerBenchmarks(list); persist(); return U.clone(copy);
        });
      },
      archiveBenchmark: function (id, archived) { return wait(latency() * 0.5).then(function () { var b = load().benchmarks.filter(function (x) { return x.id === id; })[0]; if (!b) throw { code: 'not_found', message: 'Benchmark not found' }; b.archived = archived !== false; D.registerBenchmarks(load().benchmarks); persist(); return U.clone(b); }); },
      getUniverse: function () { return Promise.resolve({ categories: D.categories, assetClasses: D.assetClasses, factors: D.factors, factorModels: D.factorModels, benchmarks: D.benchmarks, templates: D.templates, instruments: D.instruments }); },
      getAssumptions: function () { return Promise.resolve(U.clone(D.assumptions)); },
      searchInvestments: function (q, opts) {
        return wait(120).then(function () {
          var needle = (q || '').trim().toLowerCase(), limit = (opts && opts.limit) || 12, only = opts && opts.category;
          var score = function (text) { var t = (text || '').toLowerCase(); if (!needle) return 1; if (t === needle) return 100; if (t.indexOf(needle) === 0) return 60; if (t.indexOf(needle) >= 0) return 30; return needle.split(/\s+/).every(function (w) { return t.indexOf(w) >= 0; }) ? 15 : 0; };
          var out = [];
          D.instruments.forEach(function (i) {
            var cat = D.categoryOf(i.id); if (i.archived || (only && cat.id !== only)) return;
            var s = Math.max(score(i.name), score(i.identifier), score(D.assetClassById[i.assetClass].name) * 0.5, score(cat.name) * 0.4, score(i.type) * 0.4, score(i.manager) * 0.6);
            if (s > 0) out.push({ score: s, kind: 'instrument', id: i.id, name: i.name, type: i.type, identifier: i.identifier, category: cat.name, meta: [i.type, i.identifier, D.assetClassById[i.assetClass].name, i.source === 'uploaded' ? 'uploaded returns' : i.valuation + ' valuation'].join(' · '), coverage: i.coverage, uploaded: i.source === 'uploaded', instrument: i });
          });
          load().sleeves.filter(function (s) { return !s.archived && (!only || s.categoryId === only); }).forEach(function (s) { var sc = Math.max(score(s.name), score('sleeve') * 0.4, score(D.categoryById[s.categoryId].name) * 0.3); if (sc > 0) out.push({ score: sc, kind: 'sleeve', id: s.id, name: s.name, type: 'Sleeve', identifier: 'v' + s.versions[s.versions.length - 1].v, meta: 'Sleeve · ' + D.categoryById[s.categoryId].name + ' · ' + s.versions[s.versions.length - 1].holdings.length + ' products', sleeve: U.clone(s) }); });
          if (!only) D.benchmarks.forEach(function (b) { var sc = Math.max(score(b.name), score('portfolio') * 0.3, score('benchmark') * 0.4); if (sc > 0) out.push({ score: sc, kind: 'portfolio', id: b.id, name: b.name, type: 'Portfolio', identifier: b.id.toUpperCase(), meta: 'Portfolio · ' + b.description, portfolio: b }); });
          out.sort(function (a, b) { return b.score - a.score || a.name.localeCompare(b.name); });
          return out.slice(0, limit);
        });
      },

      /* sleeve repository */
      listSleeves: function () { return wait(latency() * 0.5).then(function () { return U.clone(load().sleeves); }); },
      saveSleeve: function (sleeve) {
        return wait(latency()).then(function () {
          if (config.failSave) throw { code: 'service_unavailable', message: 'The repository service did not respond' };
          var list = load().sleeves, i = -1; list.forEach(function (s, k) { if (s.id === sleeve.id) i = k; });
          var copy = U.clone(sleeve); if (i < 0) list.unshift(copy); else list[i] = copy;
          persist(); return U.clone(copy);
        });
      },
      archiveSleeve: function (id, archived) { return wait(latency() * 0.6).then(function () { var s = load().sleeves.filter(function (x) { return x.id === id; })[0]; if (!s) throw { code: 'not_found', message: 'Sleeve not found' }; s.archived = archived !== false; persist(); return U.clone(s); }); },

      /* card repository */
      listSavedCards: function () { return wait(latency() * 0.4).then(function () { return U.clone(load().savedCards); }); },
      saveCard: function (card) { return wait(latency() * 0.6).then(function () { var list = load().savedCards, i = -1; list.forEach(function (c, k) { if (c.id === card.id) i = k; }); var copy = U.clone(card); if (i < 0) list.unshift(copy); else list[i] = copy; persist(); return U.clone(copy); }); },
      deleteSavedCard: function (id) { return wait(latency() * 0.4).then(function () { store = load(); store.savedCards = store.savedCards.filter(function (c) { return c.id !== id; }); persist(); return {}; }); },

      /* analytics */
      analyzeTable: function (req) {
        return wait(latency()).then(function () {
          if (config.failAnalytics) fail();
          var allocations = req.allocations || [], rows = E.rows(allocations), unit = unitFor(req.metric, req.values, req.riskUnits);
          var period = req.basis === 'historical' ? resolvePeriod(allocations, req.period) : null;
          var Rbase = E.resolve(null), Rsc = req.scenario ? E.resolve(req.scenario) : null, warnings = [];
          var scenarioApplies = !!req.scenario && req.basis === 'forward';
          if (Rsc && !Rsc.corrValid && scenarioApplies) warnings.push('The scenario correlation matrix is not positive semi-definite. Scenario results are unavailable until it is corrected; base results are unchanged.');
          var columns = [], cells = {};
          allocations.forEach(function (alloc) {
            var inScope = scenarioApplies && req.scenario.scope.indexOf(alloc.id) >= 0, sets = ['base']; if (inScope) sets.push('scenario');
            var refInfo = findReference(alloc, req), hb = req.basis === 'historical' ? E.historyBasis(alloc) : null;
            var col = { allocationId: alloc.id, name: alloc.name, kind: alloc.kind, color: alloc.color, sets: sets, inScope: inScope,
              basisLabel: hb ? hb.label : 'Platform model', basisDetail: hb ? hb.detail : D.assumptions.model + ' · as of ' + U.fmt.date(D.assumptions.asOf),
              referenceLabel: req.values === 'delta' ? refInfo.label : null, referenceReason: req.values === 'delta' ? refInfo.reason : null, coverageNote: null, scenarioName: inScope ? req.scenario.name : null };
            var perSet = {};
            sets.forEach(function (set) { var R = set === 'scenario' ? Rsc : Rbase; var res = computeFor(req, alloc, R, rows, period); perSet[set] = { res: res, refRes: refInfo.alloc && !res.error ? computeFor(req, refInfo.alloc, R, rows, period) : null }; });
            cells[alloc.id] = {};
            rows.forEach(function (row) {
              var cell = {};
              sets.forEach(function (set) {
                var ps = perSet[set];
                if (ps.res.error) { cell[set] = { value: null, reason: 'Invalid covariance: correct the scenario correlation matrix' }; return; }
                var rr = ps.res.rows[row.key];
                var build = function (fid) {
                  var v = metricOf(rr, req.metric, req.riskUnits, fid);
                  if (v == null) return { value: null, reason: rr && rr.reason ? rr.reason : (rr && !rr.held && req.metric === 'factor' ? (row.kind === 'holding' ? 'Not held in this allocation' : row.kind === 'index' ? 'Category fully implemented: no index remainder' : row.kind === 'residual' ? 'Unallocated weight has no exposure' : 'No holdings in this row') : (req.metric === 'risk' && req.riskUnits === 'share' ? 'Share undefined: modelled risk is zero' : 'Unavailable')) };
                  if (req.values !== 'delta') return { value: v };
                  if (!refInfo.alloc) return { value: null, reason: refInfo.reason };
                  if (!ps.refRes) return { value: null, reason: 'Reference unavailable under this assumption set' };
                  var rv = metricOf(ps.refRes.rows[row.key], req.metric, req.riskUnits, fid);
                  if (rv == null) { var rrow = ps.refRes.rows[row.key]; if (rrow && !rrow.held && req.metric !== 'factor') rv = 0; else return { value: null, reason: rrow && rrow.reason ? 'Reference: ' + rrow.reason : 'Reference holds nothing in this row' }; }
                  return { value: v - rv };
                };
                if (req.metric === 'factor') { var f = {}, reasons = {}; (req.factors || []).forEach(function (fid) { var b = build(fid); f[fid] = b.value; if (b.value == null) reasons[fid] = b.reason; }); cell[set] = { value: null, factors: f, reasons: reasons, coverage: [rr && rr.coverageNote, rr && rr.modelNote].filter(Boolean).join(' · ') || null, note: rr && rr.note }; }
                else { cell[set] = build(null); if (rr && rr.coverageNote) cell[set].coverage = rr.coverageNote; if (rr && rr.note) cell[set].note = rr.note; }
              });
              cells[alloc.id][row.key] = cell;
            });
            if (hb) {
              var bt = E.backtest(E.effective(alloc), period.start, period.end), notes = [];
              if (bt.coverage.excluded.length) notes.push('Excluded, no history: ' + bt.coverage.excluded.map(function (p) { return D.instrumentById[p.instrumentId].name; }).join(', '));
              if (bt.coverage.proxied.length) notes.push('Proxy applied: ' + bt.coverage.proxied.map(function (p) { return D.instrumentById[p.instrumentId].name; }).join(', '));
              col.coverageNote = notes.join(' · ') || null; col.coverageWeight = bt.coverage.included;
            }
            columns.push(col);
          });
          var fm = E.modelOf(req.factorModel);
          return { revision: req.revision, factorModel: fm.id, modelAsOf: fm.asOf, unit: unit, rows: rows, columns: columns, cells: cells, period: period, warnings: warnings, scenario: req.scenario ? { id: req.scenario.id, name: req.scenario.name } : null, scenarioApplies: scenarioApplies };
        });
      },

      historySeries: function (req) {
        return wait(latency() * 0.8).then(function () {
          if (config.failAnalytics) fail();
          var period = resolvePeriod(req.allocations, req.period), H = D.history, i0 = E.monthIndex(period.start), i1 = E.monthIndex(period.end), months = H.months.slice(i0, i1 + 1);
          var kind = req.metric === 'risk' ? 'line' : (req.metric === 'factor' ? 'bars' : 'growth');
          var series = req.allocations.map(function (a) {
            var hb = E.historyBasis(a), s = null, actual = null;
            if (kind === 'growth') { s = E.growthSeries(a, req.rowKey, period.start, period.end); if (s) actual = s.actual; }
            else if (kind === 'line') s = E.rollingVol(a, req.rowKey, period.start, period.end);
            else { var hist = E.historical(a, E.rows([a]), period.start, period.end, req.factorModel), rr = hist.rows[req.rowKey]; s = rr && rr.beta ? { values: (req.factors || []).map(function (f) { return rr.beta[f]; }) } : null; }
            return { allocationId: a.id, values: s ? s.values : null, basis: hb.basis, basisLabel: hb.label, actual: actual, coverage: s && s.coverage ? { included: s.coverage.included, excluded: s.coverage.excluded.length, proxied: s.coverage.proxied.length } : null };
          });
          return { factorModel: E.modelOf(req.factorModel).id, months: months, unit: kind === 'growth' ? 'Growth of 100' : (kind === 'line' ? '% annualised' : 'β'), kind: kind, period: period, series: series, factors: req.factors || [] };
        });
      },

      headline: function (req) {
        return wait(latency()).then(function () {
          if (config.failAnalytics) fail();
          var model = E.modelOf(req.factorModel), period = resolvePeriod(req.allocations, req.period), Rbase = E.resolve(null), Rsc = req.scenario ? E.resolve(req.scenario) : null;
          var series = req.allocations.map(function (a) {
            var subject = subjectOf(a, '__total');
            if (!subject) return { allocationId: a.id, reason: 'Nothing allocated' };
            var bm = benchmarkFor(a, Object.assign({}, req, { rowKey: '__total', against: { mode: 'reference' } })), bench = bm.holdings ? { holdings: bm.holdings } : null;
            var inScope = !!(req.scenario && req.scenario.scope.indexOf(a.id) >= 0 && Rsc && Rsc.corrValid);
            return { allocationId: a.id, benchmark: bm.label ? { label: bm.label, kind: bm.kind } : null, benchmarkReason: bench ? null : (bm.reason || 'No benchmark'), scenarioApplied: inScope,
              forward: E.headline(subject, bench, { basis: 'forward', R: inScope ? Rsc : Rbase, modelId: model.id }),
              historical: E.headline(subject, bench, { basis: 'historical', period: period }) };
          });
          return { factorModel: model.id, period: period, horizons: E.VAR_HORIZONS.map(function (h) { return { id: h.id, label: h.label }; }), series: series };
        });
      },

      factorTable: function (req) {
        return wait(latency()).then(function () {
          if (config.failAnalytics) fail();
          var model = E.modelOf(req.factorModel), hist = req.basis === 'historical', period = hist ? resolvePeriod(req.allocations, req.period) : null;
          var Rbase = E.resolve(null), Rsc = req.scenario && !hist ? E.resolve(req.scenario) : null;
          var series = req.allocations.map(function (a) {
            var inScope = !!Rsc && Rsc.corrValid && req.scenario.scope.indexOf(a.id) >= 0, R = inScope ? Rsc : Rbase, refInfo = findReference(a, req);
            var opts = { basis: req.basis, R: R, period: period, modelId: model.id }, own = E.factorBreakdown(a, opts);
            return { allocationId: a.id, name: a.name, inScope: inScope, values: own, reason: own ? null : (hist ? 'Fewer than 12 months of history in the period' : 'Nothing allocated'), reference: refInfo.alloc ? E.factorBreakdown(refInfo.alloc, opts) : null, referenceLabel: refInfo.label, referenceReason: refInfo.reason };
          });
          return { factorModel: model.id, factors: model.factors.map(function (f) { return { id: f.id, name: f.name, description: f.description }; }), period: period, series: series };
        });
      },

      factorHistory: function (req) {
        return wait(latency() * 0.9).then(function () {
          if (config.failAnalytics) fail();
          var period = resolvePeriod(req.allocations, req.period), model = E.modelOf(req.factorModel);
          return { factorModel: model.id, period: period, series: req.allocations.map(function (a) { var h = E.factorHistory(a, period.start, period.end, model.id); return { allocationId: a.id, history: h, reason: h ? null : 'No history in the period' }; }) };
        });
      },

      historyPack: function (req) {
        return wait(latency() * 0.9).then(function () {
          if (config.failAnalytics) fail();
          var period = resolvePeriod(req.allocations, req.period), H = D.history, i0 = E.monthIndex(period.start), i1 = E.monthIndex(period.end), months = H.months.slice(i0, i1 + 1);
          var series = req.allocations.map(function (a) {
            var r = E.rowReturns(a, '__total', period.start, period.end), hb = E.historyBasis(a);
            if (!r) return { allocationId: a.id, basis: hb.basis, basisLabel: hb.label, returns: null, growth: null, underwater: null, episodes: [], stats: null, calendar: [], stressReturns: E.stressPeriods.map(function (p) { return { id: p.id, ret: null, reason: 'No history' }; }), rolling: { ret12: null, vol36: null }, coverage: null };
            var growth = E.growthOf(r.returns), roll = E.rowReturns(a, '__total', U.ym.add(period.start, -35), period.end);
            return { allocationId: a.id, basis: hb.basis, basisLabel: hb.label, returns: r.returns, growth: growth, actual: r.actual ? E.growthOf(r.actual) : null, underwater: E.underwater(growth), episodes: E.drawdowns(growth, months, 6), stats: E.statsOf(r.returns, months), calendar: E.calendarYears(r.returns, months), stressReturns: E.stressReturns(r.returns, months),
              rolling: { ret12: E.rolling(roll.returns, 12, 'ret').slice(35), vol36: E.rolling(roll.returns, 36, 'vol').slice(35) }, coverage: { included: r.coverage.included, excluded: r.coverage.excluded.length, proxied: r.coverage.proxied.length } };
          });
          return { months: months, period: period, stress: E.stressPeriods, series: series, correlation: E.correlationMatrix(series.map(function (s) { return s.returns; })) };
        });
      },

      breakdown: function (req) {
        return wait(latency() * 0.4).then(function () {
          if (config.failAnalytics) fail();
          return { categories: D.categories.map(function (c) { return { id: c.id, name: c.name, short: c.short, color: c.color }; }), series: req.allocations.map(function (a) {
            return { allocationId: a.id, allocated: E.allocated(a), categories: E.tree(a).map(function (t) { return { id: t.id, target: t.target, implemented: t.implemented, remainder: t.remainder, over: t.over, products: t.products.map(function (h) { return { instrumentId: h.instrumentId, name: D.instrumentById[h.instrumentId].name, weight: h.weight, sleeveRef: h.sleeveRef || null }; }) }; }) };
          }) };
        });
      },

      projection: function (req) {
        return wait(latency() * 0.8).then(function () {
          if (config.failAnalytics) fail();
          var Rbase = E.resolve(null), Rsc = req.scenario ? E.resolve(req.scenario) : null;
          var series = req.allocations.map(function (a) {
            var inScope = !!(req.scenario && req.scenario.scope.indexOf(a.id) >= 0), p = E.project(a, req.rowKey, inScope ? Rsc : Rbase, req.horizon, req.confidence, req.basis);
            return { allocationId: a.id, inScope: inScope, years: p ? p.years : null, central: p ? p.central : null, bands: p ? p.bands : null, mu: p ? p.mu : null, vol: p ? p.vol : null, start: p ? p.start : null, reason: p ? null : (inScope && Rsc && !Rsc.corrValid ? 'Invalid scenario covariance' : 'No holdings in this row') };
          });
          return { unit: req.basis === 'contribution' ? 'Value within a portfolio of 100' : 'Growth of 100', series: series };
        });
      },

      scenarioComparison: function (req) {
        return wait(latency() * 0.8).then(function () {
          if (config.failAnalytics) fail();
          var rows = E.rows(req.allocations), Rbase = E.resolve(null), Rs = req.scenarios.map(function (s) { return E.resolve(s); });
          var series = req.allocations.map(function (a) {
            var b = E.forward(a, Rbase, rows), bv = b.error ? null : metricOf(b.rows[req.rowKey], req.metric, req.riskUnits, req.factor);
            return { allocationId: a.id, base: { value: bv }, scenarios: req.scenarios.map(function (s, i) {
              if (s.scope.indexOf(a.id) < 0) return { scenarioId: s.id, cell: { value: null, reason: 'Not applied to ' + a.name } };
              var r = E.forward(a, Rs[i], rows); if (r.error) return { scenarioId: s.id, cell: { value: null, reason: 'Invalid covariance' } };
              return { scenarioId: s.id, cell: { value: metricOf(r.rows[req.rowKey], req.metric, req.riskUnits, req.factor) } };
            }) };
          });
          return { unit: unitFor(req.metric, 'absolute', req.riskUnits), series: series };
        });
      },

      summaries: function (allocations) { return wait(60).then(function () { var R = E.resolve(null), out = {}; allocations.forEach(function (a) { out[a.id] = E.summary(a, R); }); return out; }); },

      activeAnalysis: function (req) {
        return wait(latency()).then(function () {
          if (config.failAnalytics) fail();
          var model = E.modelOf(req.factorModel), hist = req.basis === 'historical', period = hist ? resolvePeriod(req.allocations, req.period) : null;
          var Rbase = E.resolve(null), Rsc = req.scenario ? E.resolve(req.scenario) : null;
          var series = req.allocations.map(function (a) {
            var subject = subjectOf(a, req.rowKey);
            if (!subject) return { allocationId: a.id, benchmark: null, reason: 'No holdings in this row' };
            var bm = benchmarkFor(a, req);
            if (!bm.holdings) return { allocationId: a.id, benchmark: { label: bm.label, kind: bm.kind }, reason: bm.reason || 'No benchmark' };
            var inScope = !hist && !!(req.scenario && req.scenario.scope.indexOf(a.id) >= 0 && Rsc && Rsc.corrValid);
            var res = E.active(subject, { holdings: bm.holdings }, { modelId: model.id, basis: req.basis, R: inScope ? Rsc : Rbase, period: period, attribute: req.attribute || req.decompose, returnMethod: req.returnMethod });
            res.allocationId = a.id; res.benchmark = { label: bm.label, kind: bm.kind, note: bm.note || null }; res.scenarioApplied = inScope; res.unallocated = !req.rowKey || req.rowKey === '__total' ? U.round(100 - E.allocated(a), 4) : 0;
            return res;
          });
          return { factorModel: model.id, modelAsOf: model.asOf, basis: req.basis, period: period, series: series };
        });
      },

      factorRisk: function (req) {
        return wait(latency() * 0.7).then(function () {
          if (config.failAnalytics) fail();
          var model = E.modelOf(req.factorModel);
          return { factorModel: model.id, modelAsOf: model.asOf, factors: model.factors.map(function (f) { return { id: f.id, name: f.name }; }), series: req.allocations.map(function (a) {
            var subject = subjectOf(a, req.rowKey); if (!subject) return { allocationId: a.id, reason: 'No holdings in this row' };
            var r = E.modelRisk(E.weightsOf(subject.holdings), model.id);
            return { allocationId: a.id, total: r.total, byFactor: r.byFactor, specific: r.specific, exposure: r.exposure, coverage: E.modelNote(model, subject.holdings) };
          }) };
        });
      },

      forwardSuite: function (req) {
        return wait(latency() * 0.8).then(function () {
          if (config.failAnalytics) fail();
          var Rbase = E.resolve(null), Rsc = req.scenario ? E.resolve(req.scenario) : null, opts = { horizon: req.horizon, target: req.target };
          if (!Rbase.corrValid) throw { code: 'invalid_covariance', message: 'The correlation matrix is not positive semi-definite' };
          var series = req.allocations.map(function (a) {
            var subject = subjectOf(a, '__total'); if (!subject) return { allocationId: a.id, reason: 'No holdings' };
            var inScope = !!(req.scenario && req.scenario.scope.indexOf(a.id) >= 0 && Rsc && Rsc.corrValid), R = inScope ? Rsc : Rbase;
            var out = E.forwardSuite(subject.holdings, R, opts); if (!out) return { allocationId: a.id, reason: 'No holdings' };
            out.allocationId = a.id; out.scenarioApplied = inScope;
            var bm = benchmarkFor(a, { reference: req.reference, against: { mode: 'reference' } });
            if (bm.holdings) { var rs = E.forwardSuite(bm.holdings, Rbase, opts); out.reference = { label: bm.label, ret: rs.ret, vol: rs.vol, sharpe: rs.sharpe }; } else out.reference = { label: null, reason: bm.reason };
            return out;
          });
          return { riskFree: D.assumptions.riskFree, currency: D.reporting, stress: E.stressTests.map(function (t) { return { id: t.id, name: t.name, combined: !!t.combined, shocks: t.shocks }; }), series: series };
        });
      },

      historySuite: function (req) {
        return wait(latency() * 0.9).then(function () {
          if (config.failAnalytics) fail();
          var period = resolvePeriod(req.allocations, req.period), months = D.history.months.slice(E.monthIndex(period.start), E.monthIndex(period.end) + 1);
          var series = req.allocations.map(function (a) {
            var r = E.rowReturns(a, '__total', period.start, period.end); if (!r) return { allocationId: a.id, reason: 'No history in the period' };
            var bm = benchmarkFor(a, { reference: req.reference, against: { mode: 'reference' } }), rb = bm.holdings ? E.backtest(bm.holdings, period.start, period.end).returns : null;
            return { allocationId: a.id, reference: { label: bm.label, reason: bm.reason || null }, returns: r.returns, stats: E.historySuite(r.returns, rb, months) };
          });
          return { months: months, period: period, series: series };
        });
      },

      structure: function (req) {
        return wait(latency() * 0.5).then(function () {
          var codes = {};
          var series = req.allocations.map(function (a) {
            var hs = E.effective(a), weights = E.categoryWeights(hs), bm = benchmarkFor(a, { reference: req.reference, against: { mode: 'reference' } }), rw = bm.holdings ? E.categoryWeights(bm.holdings) : null, active = null;
            if (rw) { active = {}; D.categories.forEach(function (c) { active[c.id] = weights[c.id] - rw[c.id]; }); }
            var mix = E.currencyMix(hs); Object.keys(mix).forEach(function (c) { if (Math.abs(mix[c]) > 1e-9) codes[c] = 1; });
            return { allocationId: a.id, reference: bm.holdings ? { label: bm.label } : null, referenceReason: bm.reason || null, weights: weights, referenceWeights: rw, active: active, currency: mix };
          });
          var order = ['USD', 'EUR', 'GBP', 'JPY', 'CHF', 'CAD', 'AUD', 'EM'], rep = D.reporting, list = Object.keys(codes).sort(function (x, y) { var i = order.indexOf(x), j = order.indexOf(y); return (x === rep ? -1 : y === rep ? 1 : 0) || (i < 0 ? 99 : i) - (j < 0 ? 99 : j); });
          return { currency: rep, categories: D.categories.map(function (c) { return { id: c.id, name: c.name, short: c.short, color: c.color }; }), currencies: list, series: series };
        });
      }
    };
  })();

  /* ── http adapter (handoff target) ───────────────────────────────── */
  var http = (function () {
    function call(method, path, body) {
      return fetch(config.baseUrl + path, { method: method, headers: { 'Content-Type': 'application/json', 'Accept': 'application/json', 'X-Reporting-Currency': config.currency || 'USD' }, credentials: 'same-origin', body: body == null ? undefined : JSON.stringify(body) })
        .then(function (r) { if (r.status === 204) return {}; return r.json().catch(function () { return {}; }).then(function (j) { if (!r.ok) throw { code: j.code || 'http_' + r.status, message: j.message || r.statusText, status: r.status }; return j; }); }, function (e) { throw { code: 'network', message: e.message }; });
    }
    return {
      listWorkspaces: function () { return call('GET', '/workspaces'); },
      getWorkspace: function (id) { return call('GET', '/workspaces/' + encodeURIComponent(id)); },
      createWorkspace: function (input) { return call('POST', '/workspaces', input); },
      saveWorkspace: function (ws) { return call('PUT', '/workspaces/' + encodeURIComponent(ws.id), ws); },
      deleteWorkspace: function (id) { return call('DELETE', '/workspaces/' + encodeURIComponent(id)); },
      resetSampleData: function () { return Promise.reject({ code: 'unsupported', message: 'Not available against a live service' }); },
      getUniverse: function () { return call('GET', '/universe'); },
      getAssumptions: function () { return call('GET', '/assumptions'); },
      searchInvestments: function (q, opts) { return call('GET', '/investments?q=' + encodeURIComponent(q || '') + '&limit=' + ((opts && opts.limit) || 12) + (opts && opts.category ? '&category=' + encodeURIComponent(opts.category) : '')); },
      listSleeves: function () { return call('GET', '/sleeves'); },
      saveSleeve: function (s) { return call('PUT', '/sleeves/' + encodeURIComponent(s.id), s); },
      archiveSleeve: function (id, archived) { return call('PATCH', '/sleeves/' + encodeURIComponent(id), { archived: archived !== false }); },
      useCurrency: function (code) { config.currency = code; return Promise.resolve({ currency: code }); },
      listBenchmarks: function () { return call('GET', '/benchmarks'); },
      saveBenchmark: function (b) { return call('PUT', '/benchmarks/' + encodeURIComponent(b.id), b); },
      archiveBenchmark: function (id, archived) { return call('PATCH', '/benchmarks/' + encodeURIComponent(id), { archived: archived !== false }); },
      listSavedCards: function () { return call('GET', '/cards'); },
      saveCard: function (c) { return call('PUT', '/cards/' + encodeURIComponent(c.id), c); },
      deleteSavedCard: function (id) { return call('DELETE', '/cards/' + encodeURIComponent(id)); },
      analyzeTable: function (req) { return call('POST', '/analytics/table', req); },
      historySeries: function (req) { return call('POST', '/analytics/history', req); },
      historyPack: function (req) { return call('POST', '/analytics/history-pack', req); },
      factorHistory: function (req) { return call('POST', '/analytics/factor-history', req); },
      factorTable: function (req) { return call('POST', '/analytics/factor-table', req); },
      headline: function (req) { return call('POST', '/analytics/headline', req); },
      breakdown: function (req) { return call('POST', '/analytics/breakdown', req); },
      projection: function (req) { return call('POST', '/analytics/projection', req); },
      scenarioComparison: function (req) { return call('POST', '/analytics/scenarios', req); },
      summaries: function (allocations) { return call('POST', '/analytics/summaries', { allocations: allocations }); },
      activeAnalysis: function (req) { return call('POST', '/analytics/active', req); },
      optimize: function (req) { return call('POST', '/analytics/optimize', req); },
      listProducts: function () { return call('GET', '/products'); },
      fitReturns: function (input) { return call('POST', '/products/fit', { returns: input }); },
      addProducts: function (records) { return call('POST', '/products', records); },
      updateProduct: function (id, patch) { return call('PATCH', '/products/' + encodeURIComponent(id), patch); },
      productAnalytics: function (id, opts) { return call('GET', '/products/' + encodeURIComponent(id) + '/analytics?factorModel=' + encodeURIComponent((opts && opts.factorModel) || 'isg')); },
      factorRisk: function (req) { return call('POST', '/analytics/factor-risk', req); },
      forwardSuite: function (req) { return call('POST', '/analytics/forward-suite', req); },
      historySuite: function (req) { return call('POST', '/analytics/history-suite', req); },
      structure: function (req) { return call('POST', '/analytics/structure', req); }
    };
  })();

  var adapters = { mock: mock, http: http }, api = PA.api = {};
  Object.keys(mock).forEach(function (name) { api[name] = function () { return adapters[config.adapter][name].apply(null, arguments); }; });
  api.configure = function (opts) { for (var k in opts) config[k] = opts[k]; return api; };
  api.config = function () { return U.clone(config); };
})();

/* ─────────────────────────────────────────────────────────────────────────
   Portfolio Analytics · the decision chain (mock engine)
   An allocation with a benchmark has a decision chain: the four portfolios
   its return and risk are decomposed through,

     Policy benchmark          the allocation's benchmark (or, as a tagged
                               exception, a different one for attribution)
     SAA                       typed category weights held in indices, an
                               allocation or a benchmark; until one is
                               entered, today's category weights stand in
     Manager/Product benchmark every holding replaced by its benchmark at the
                               holding's weight (stated benchmark, else
                               category index, else an override)
     Manager/Product           the allocation itself

   and the decisions between them, each named for the portfolio it arrives
   at: the SAA decision, the Manager/Product benchmark decision (one, or
   split into weights and choice of benchmark) and the Manager/Product
   decision. The codes L0–L3 and S1–S3 stay in the data for the service
   contract and stored settings; nothing on screen shows them.

   Each decision is an active position (the portfolio after it less the one
   before it), attributed in asset space (Brinson by category or asset class,
   or by product) and in factor space (active exposure × factor return, plus
   cash and specific), on the forward-looking and historical bases, with the
   ties that make the parts add up to the whole.

   Decisions taken in another order, or averaged over every order, overlay
   the same active positions on the policy in that order, so the portfolio
   after any set of decisions is the policy plus those decisions' positions.

   Behind PA.api like the rest of the engine: the interface sends the chain,
   the service resolves the portfolios and returns the ChainResponse
   documented in js/api.js. CH.levelsOf is also used by the store to show an
   allocation's SAA and benchmarks as temporary columns.
   ───────────────────────────────────────────────────────────────────────── */
(function () {
  'use strict';
  var PA = window.PA, U = PA.util, D = PA.data, E = PA.engine;
  var CH = PA.chain = {};

  /* Names: the four portfolios of the chain, and each decision named for the portfolio it arrives at.
     `code` is kept for the service contract and stored settings; it is not shown. */
  CH.LEVELS = {
    policy: { id: 'policy', code: 'L0', short: 'Policy benchmark', name: 'Policy benchmark' },
    saa: { id: 'saa', code: 'L1', short: 'SAA', name: 'SAA', long: 'Strategic asset allocation' },
    saaWeights: { id: 'saaWeights', code: 'L1a', short: 'SAA indices at held weights', name: 'SAA indices at the portfolio’s category weights' },
    benchWeights: { id: 'benchWeights', code: 'L1b', short: 'Benchmarks at SAA weights', name: 'Manager/Product benchmarks at the SAA’s category weights' },
    productBenchmarks: { id: 'productBenchmarks', code: 'L2', short: 'Manager/Product benchmark', name: 'Manager/Product benchmark' },
    portfolio: { id: 'portfolio', code: 'L3', short: 'Manager/Product', name: 'Manager/Product' }
  };
  CH.DECISIONS = {
    saa: { id: 'saa', code: 'S1', label: 'SAA', short: 'SAA', versus: 'SAA less policy benchmark', asks: 'Was the long-term mix better than the policy benchmark?' },
    mapping: { id: 'mapping', code: 'S2', label: 'Manager/Product benchmark', short: 'Manager/Product benchmark', versus: 'Manager/Product benchmarks less SAA', asks: 'Did the weights held, and the benchmarks of the products chosen to fill them, beat the SAA?' },
    weight: { id: 'weight', code: 'S2a', label: 'Manager/Product benchmark · weights', short: 'Benchmark · weights', versus: 'Weights held less SAA weights', asks: 'Did holding different category weights from the SAA add value?' },
    benchmark: { id: 'benchmark', code: 'S2b', label: 'Manager/Product benchmark · choice', short: 'Benchmark · choice', versus: 'Manager/Product benchmarks less category indices', asks: 'Did the benchmarks of the products chosen beat their categories’ indices?' },
    benchmarkFirst: { id: 'benchmarkFirst', code: 'S2a', label: 'Manager/Product benchmark · choice', short: 'Benchmark · choice', versus: 'Manager/Product benchmarks less category indices', asks: 'Did the benchmarks of the products chosen beat their categories’ indices?' },
    weightSecond: { id: 'weightSecond', code: 'S2b', label: 'Manager/Product benchmark · weights', short: 'Benchmark · weights', versus: 'Weights held less SAA weights', asks: 'Did holding different category weights from the SAA add value?' },
    selection: { id: 'selection', code: 'S3', label: 'Manager/Product', short: 'Manager/Product', versus: 'Managers and products less their benchmarks', asks: 'Did the managers and products beat their own benchmarks, after fees?' },
    pair: { id: 'pair', code: 'Active', label: 'Active position', short: 'Active', versus: 'One portfolio less another' },
    policyToPortfolio: { id: 'policyToPortfolio', code: 'All', label: 'All decisions', short: 'All decisions', versus: 'Portfolio less policy benchmark', asks: 'Did the portfolio beat its policy benchmark?' }
  };
  /* How the other cards name a decision when they show one instead of the Reference. */
  CH.DECISION_OPTIONS = [['saa', 'SAA decision: the SAA against the policy benchmark'], ['mapping', 'Manager/Product benchmark decision: those benchmarks against the SAA'], ['selection', 'Manager/Product decision: the portfolio against those benchmarks'], ['policyToPortfolio', 'All decisions: the portfolio against the policy benchmark']];
  CH.DECISION_VS = { saa: 'the policy benchmark', mapping: 'the SAA', selection: 'the Manager/Product benchmarks', policyToPortfolio: 'the policy benchmark' };
  CH.decisionTag = function (id) { return id === 'policyToPortfolio' ? 'all decisions' : (CH.DECISIONS[id] || CH.DECISIONS.selection).label + ' decision'; };
  /** The orders the three decisions can be taken in; 'default' is the chain as named. */
  CH.ORDERS = [['default', 'Policy benchmark → SAA → Manager/Product benchmark → Manager/Product'], ['saa,selection,mapping', 'SAA, then Manager/Product, then Manager/Product benchmark'], ['mapping,saa,selection', 'Manager/Product benchmark, then SAA, then Manager/Product'],
    ['mapping,selection,saa', 'Manager/Product benchmark, then Manager/Product, then SAA'], ['selection,saa,mapping', 'Manager/Product, then SAA, then Manager/Product benchmark'], ['selection,mapping,saa', 'Manager/Product, then Manager/Product benchmark, then SAA']];
  CH.orderLabel = function (o) { var x = CH.ORDERS.filter(function (r) { return r[0] === o; })[0]; return o === 'averaged' ? 'Averaged over every order' : x ? x[1] : CH.ORDERS[0][1]; };
  CH.IMPLEMENTATIONS = [['one', 'One decision'], ['weightThenBenchmark', 'Two parts: weights, then benchmark choice'], ['benchmarkThenWeight', 'Two parts: benchmark choice, then weights']];
  /** Workspace attribution conventions (the header menu); a card may depart from them. */
  CH.CONVENTIONS = { attributionModel: 'BF', interaction: 'selection', linking: 'carino', currency: 'none', unallocated: 'zero', fees: 'net', order: 'default', implementation: 'one' };
  CH.LABELS = {
    attributionModel: { BF: 'Brinson–Fachler', BHB: 'Brinson–Hood–Beebower' },
    interaction: { selection: 'Interaction in selection', allocation: 'Interaction in allocation', separate: 'Interaction as its own effect' },
    linking: { none: 'No linking (annualised)', carino: 'Cariño', menchero: 'Menchero', grap: 'GRAP', frongello: 'Frongello', geometric: 'Geometric' },
    currency: { none: 'Currency in selection', fxFactor: 'FX factor row', separate: 'Separate currency effect' },
    unallocated: { zero: 'Unallocated at zero return', cash: 'Unallocated treated as cash' },
    fees: { net: 'Net of stated fees', gross: 'Gross of fees' },
    order: (function () { var o = { averaged: 'Averaged over every order' }; CH.ORDERS.forEach(function (r) { o[r[0]] = r[1]; }); return o; })(),
    implementation: (function () { var o = {}; CH.IMPLEMENTATIONS.forEach(function (r) { o[r[0]] = r[1]; }); return o; })()
  };
  CH.conventionsOf = function (ws) { var c = Object.assign({}, CH.CONVENTIONS); if (ws && ws.conventions) Object.keys(c).forEach(function (k) { if (ws.conventions[k] != null) c[k] = ws.conventions[k]; }); return c; };
  /** The chain every allocation with a benchmark starts from: its own benchmark, no SAA entered, each product against its stated benchmark.
      order and implementation are stored only when they differ from the workspace's conventions. */
  CH.blank = function () { return { policyBenchmarkId: null, saa: null, productBenchmarks: { mode: 'stated', overrides: {} } }; };

  /* ── resolving the levels ────────────────────────────────────────── */
  var h0 = function (instrumentId, weight, categoryId) { return { instrumentId: instrumentId, weight: weight, categoryId: categoryId || E.categoryOf(instrumentId) }; };
  function merged(list) {
    var by = {}, out = [];
    list.forEach(function (h) { var k = h.instrumentId + '|' + h.categoryId; if (!by[k]) { by[k] = { instrumentId: h.instrumentId, categoryId: h.categoryId, weight: 0 }; out.push(by[k]); } by[k].weight += h.weight; });
    return out.filter(function (h) { return Math.abs(h.weight) > 1e-9; });
  }
  /** A category's index basket at a weight (%), or null for a category without one. */
  CH.basket = function (categoryId, weight) {
    var c = D.categoryById[categoryId] || D.taxonomyById[categoryId]; if (!c || !c.index || !c.index.length) return null;
    var tot = U.sum(c.index, function (p) { return p[1]; });
    return c.index.map(function (p) { return h0(p[0], p[1] / tot * weight, categoryId); });
  };
  function benchmarkHoldings(id) { var b = id && D.benchmarkById[id]; return b ? b.holdings.map(function (h) { return h0(h.instrumentId, h.weight); }) : null; }
  /** The chain as stored on the allocation, or null. */
  CH.storedChain = function (alloc) { return alloc && alloc.chain ? alloc.chain : null; };
  /** The chain an allocation is analysed through: the stored one, else the default once it has a benchmark, else null. */
  CH.chainOf = function (alloc) {
    if (!alloc) return null;
    if (alloc.chain) return alloc.chain;
    return alloc.benchmarkId ? Object.assign(CH.blank(), { isDefault: true }) : null;
  };
  /** The benchmark the chain is attributed against when it is not the allocation's own (the tagged exception), else null. */
  CH.exceptionOf = function (alloc) {
    var ch = CH.storedChain(alloc), id = ch && ch.policyBenchmarkId;
    if (!id || !alloc.benchmarkId || id === alloc.benchmarkId) return null;
    var b = D.benchmarkById[id]; return b ? { id: id, label: b.name + (b.version ? ' v' + b.version : '') } : null;
  };
  /** Has the SAA been entered (typed weights, a benchmark or an allocation)? Otherwise today's category weights stand in. */
  CH.saaSet = function (alloc) { var ch = CH.chainOf(alloc), s = ch && ch.saa; return !!(s && s.kind && s.kind !== 'derived'); };
  /** The policy benchmark of an allocation: its own benchmark, unless the chain names a different one to attribute against. */
  CH.policyOf = function (alloc) {
    var ch = CH.chainOf(alloc); if (!ch) return { reason: 'No benchmark' };
    var id = ch.policyBenchmarkId || alloc.benchmarkId, b = id && D.benchmarkById[id];
    if (!id) return { reason: 'No benchmark' };
    if (!b) return { reason: 'Benchmark not found' };
    return { holdings: benchmarkHoldings(id), label: b.name + (b.version ? ' v' + b.version : ''), source: { kind: 'benchmark', id: id, version: b.version || null, assigned: !ch.policyBenchmarkId || ch.policyBenchmarkId === alloc.benchmarkId } };
  };
  /** The SAA: typed category weights, an allocation in the pool, a benchmark, or (until one is entered) today's category weights. */
  CH.saaOf = function (alloc, pool) {
    var ch = CH.chainOf(alloc), s = ch && ch.saa; if (!ch) return { reason: 'No benchmark' };
    if (s && s.kind === 'benchmark') { var b = D.benchmarkById[s.id]; return b ? { holdings: benchmarkHoldings(s.id), label: b.name + (b.version ? ' v' + b.version : ''), source: { kind: 'benchmark', id: s.id } } : { reason: 'SAA benchmark not found' }; }
    if (s && s.kind === 'allocation') {
      var a = (pool || []).filter(function (x) { return x.id === s.id; })[0];
      if (!a) return { reason: 'SAA allocation not in this workspace' };
      if (a.id === alloc.id) return { reason: 'An allocation cannot be its own SAA' };
      var hs = E.effective(a).map(function (h) { return h0(h.instrumentId, h.weight, h.categoryId); });
      var products = hs.filter(function (h) { return D.instrumentById[h.instrumentId].type !== 'Index'; }).map(function (h) { return D.instrumentById[h.instrumentId].name; });
      return { holdings: hs, label: a.name, source: { kind: 'allocation', id: a.id, products: products }, warning: products.length ? a.name + ' holds products, so ' + CH.DECISIONS.mapping.label + ' will include their benchmarks' : null };
    }
    var out = [], kept = [];
    if (s && s.kind === 'weights') {
      /* typed: each category's weight held in its index basket (or the index chosen for a category without one) */
      var W = s.weights || {}, ix = s.indices || {}, lost = [];
      Object.keys(W).forEach(function (cid) {
        var w = +W[cid]; if (!w || Math.abs(w) < 1e-9) return;
        var bk = ix[cid] && D.instrumentById[ix[cid]] ? [h0(ix[cid], w, cid)] : CH.basket(cid, w);
        if (bk) out = out.concat(bk); else lost.push((D.categoryById[cid] || {}).name || cid);
      });
      if (!out.length) return { reason: 'The SAA has no weights' };
      var tot = U.sum(out, function (h) { return h.weight; });
      return { holdings: merged(out), label: 'SAA weights', source: { kind: 'weights', total: U.round(tot, 4) }, note: lost.length ? lost.join(', ') + ' ha' + (lost.length === 1 ? 's' : 've') + ' no index, so the SAA weight there is left out' : Math.abs(tot - 100) > 0.005 ? 'The SAA weights add up to ' + U.round(tot, 2) + '%' : null };
    }
    /* not entered: each category's weight in the portfolio, held in that category's index basket */
    E.tree(alloc).forEach(function (t) {
      if (Math.abs(t.target) < 1e-9) return;
      var b = CH.basket(t.id, t.target);
      if (b) out = out.concat(b); else { kept.push(t.name); t.products.forEach(function (p) { out.push(h0(p.instrumentId, p.weight, t.id)); }); }
    });
    return { holdings: merged(out), label: 'Today’s category weights', source: { kind: 'derived' }, derived: true, note: kept.length ? kept.join(', ') + ' ha' + (kept.length === 1 ? 's' : 've') + ' no category index, so the products held there stand in' : null };
  };
  /** How each holding of the portfolio resolves to its benchmark. */
  CH.mappingOf = function (alloc, hs) {
    var ch = CH.chainOf(alloc) || CH.blank(), pb = ch.productBenchmarks || { mode: 'stated', overrides: {} }, ov = pb.overrides || {};
    return (hs || E.effective(alloc)).map(function (h) {
      var ins = D.instrumentById[h.instrumentId], cat = h.categoryId || E.categoryOf(h.instrumentId), row = { holdingId: h.id, instrumentId: h.instrumentId, name: ins.name, categoryId: cat, weight: h.weight };
      var o = ov[h.instrumentId];
      if (o && o.kind === 'benchmark' && D.benchmarkById[o.id]) { row.source = 'override'; row.target = { kind: 'benchmark', id: o.id, label: D.benchmarkById[o.id].name }; row.holdings = D.benchmarkById[o.id].holdings.map(function (b) { return h0(b.instrumentId, b.weight / 100 * h.weight, cat); }); return row; }
      if (o && o.kind === 'instrument' && D.instrumentById[o.id]) { row.source = 'override'; row.target = { kind: 'instrument', id: o.id, label: D.instrumentById[o.id].name }; row.holdings = [h0(o.id, h.weight, cat)]; return row; }
      if (ins.type === 'Index' || ins.spread != null) { row.source = 'index'; row.target = { kind: 'instrument', id: ins.id, label: ins.name }; row.holdings = [h0(ins.id, h.weight, cat)]; return row; }
      if (pb.mode !== 'categoryIndex' && ins.benchmarkId && D.instrumentById[ins.benchmarkId]) { row.source = 'stated'; row.target = { kind: 'instrument', id: ins.benchmarkId, label: D.instrumentById[ins.benchmarkId].name }; row.holdings = [h0(ins.benchmarkId, h.weight, cat)]; return row; }
      if (pb.mode !== 'categoryIndex' && ins.source === 'uploaded') { var ix = D.assetClassById[ins.assetClass].indexId; row.source = 'fitted'; row.target = { kind: 'instrument', id: ix, label: D.instrumentById[ix].name }; row.holdings = [h0(ix, h.weight, cat)]; return row; }
      var b = CH.basket(cat, h.weight), c = D.categoryById[cat];
      if (b) { row.source = 'categoryIndex'; row.target = { kind: 'basket', id: cat, label: (c ? c.short : 'Category') + ' Index' }; row.holdings = b; return row; }
      row.source = 'none'; row.target = { kind: 'instrument', id: ins.id, label: ins.name + ' (no benchmark)' }; row.holdings = [h0(ins.id, h.weight, cat)]; return row;
    });
  };
  function withCash(hs, on) {
    if (!on) return hs;
    var res = 100 - U.sum(hs, function (h) { return h.weight; });
    return Math.abs(res) > 1e-9 ? hs.concat([h0('idx_cash', res, 'cash')]) : hs;
  }
  /** Cut a level to one category, rescaled to 100; the category index stands in where the level holds nothing there. */
  function cut(hs, categoryId) {
    var list = hs.filter(function (h) { return h.categoryId === categoryId; }), W = U.sum(list, function (h) { return h.weight; });
    if (list.length && Math.abs(W) > 1e-9) return { holdings: list.map(function (h) { return h0(h.instrumentId, h.weight / W * 100, h.categoryId); }) };
    var b = CH.basket(categoryId, 100); return b ? { holdings: b, note: 'holds nothing in this category; its index is used' } : { reason: 'holds nothing in this category and it has no index' };
  }
  /**
   * The levels of an allocation's chain. pool: the workspace's allocations
   * (to find an SAA allocation). opts: {unallocated:'zero'|'cash', rowKey, implementation}
   * → {levels:[Level], mapping, counts, notes, warnings, reason?}
   * Level {id, code, short, name, label, holdings:[{instrumentId, weight, categoryId}], source, reason?}
   */
  CH.levelsOf = function (alloc, pool, opts) {
    opts = opts || {};
    var ch = CH.chainOf(alloc); if (!ch) return { reason: 'No benchmark for ' + alloc.name, levels: [] };
    var notes = [], warnings = [], cash = opts.unallocated === 'cash';
    var hs = E.effective(alloc), port = hs.map(function (h) { return h0(h.instrumentId, h.weight, h.categoryId); });
    var policy = CH.policyOf(alloc), saa = CH.saaOf(alloc, pool), mapping = CH.mappingOf(alloc, hs);
    var pbh = merged([].concat.apply([], mapping.map(function (m) { return m.holdings; })));
    var counts = { holdings: mapping.length, stated: 0, categoryIndex: 0, override: 0, index: 0, fitted: 0, none: 0 }; mapping.forEach(function (m) { counts[m.source]++; });
    var L = [
      Object.assign({}, CH.LEVELS.policy, policy.holdings ? { holdings: withCash(policy.holdings, cash), label: policy.label, source: policy.source } : { holdings: null, reason: policy.reason }),
      Object.assign({}, CH.LEVELS.saa, saa.holdings ? { holdings: withCash(saa.holdings, cash), label: saa.label, source: saa.source, derived: !!saa.derived } : { holdings: null, reason: saa.reason }),
      Object.assign({}, CH.LEVELS.productBenchmarks, { holdings: withCash(pbh, cash), label: 'Benchmarks of its ' + mapping.length + ' product' + (mapping.length === 1 ? '' : 's'), source: { kind: 'derived', mode: (ch.productBenchmarks || {}).mode || 'stated' } }),
      Object.assign({}, CH.LEVELS.portfolio, { holdings: withCash(port, cash), label: alloc.name, source: { kind: alloc.kind, id: alloc.id } })
    ];
    if (policy.note) notes.push(policy.note);
    if (saa.note) notes.push(saa.note);
    if (saa.warning) warnings.push(saa.warning);
    if (cash) notes.push('Unallocated weight is treated as held in the cash index at every level');
    /* the implementation step split in two: weights first, or benchmarks first */
    var dflt = opts.defaults || {}, impl = opts.implementation || ch.implementation || dflt.implementation || 'one';
    if (impl !== 'one' && L[1].holdings) {
      var mid = impl === 'weightThenBenchmark' ? atWeights(L[1].holdings, L[2].holdings) : atWeights(L[2].holdings, L[1].holdings);
      L.splice(2, 0, Object.assign({}, CH.LEVELS[impl === 'weightThenBenchmark' ? 'saaWeights' : 'benchWeights'], { holdings: mid, label: CH.LEVELS[impl === 'weightThenBenchmark' ? 'saaWeights' : 'benchWeights'].name, source: { kind: 'derived' } }));
    }
    var key = opts.rowKey && opts.rowKey !== '__total' ? opts.rowKey : (alloc.standalone ? alloc.standalone.categoryId : null);
    if (key) {
      var parts = key.split('/'), cat = parts[0];
      L.forEach(function (l, i) {
        if (!l.holdings) return;
        if (parts.length > 1 && (l.id === 'portfolio' || l.id === 'productBenchmarks')) {
          var m = mapping.filter(function (x) { return x.instrumentId === parts[1] && x.categoryId === cat; })[0];
          if (m) { l.holdings = l.id === 'portfolio' ? [h0(m.instrumentId, 100, cat)] : m.holdings.map(function (b) { return h0(b.instrumentId, b.weight / m.weight * 100, cat); }); return; }
        }
        var c = cut(l.holdings, cat); if (c.reason) { l.reason = l.short + ' ' + c.reason; l.holdings = null; } else { l.holdings = c.holdings; if (c.note) notes.push(l.short + ' ' + c.note); }
      });
      notes.push('Each level is cut to ' + (parts.length > 1 ? D.instrumentById[parts[1]].name + ' and ' : '') + (D.categoryById[cat] ? D.categoryById[cat].name : cat) + ' and rescaled to 100%');
    }
    return { levels: L, mapping: mapping, counts: counts, notes: notes, warnings: warnings, order: ch.order || dflt.order || 'default', implementation: impl, isDefault: !!ch.isDefault, saaSet: CH.saaSet(alloc), exception: CH.exceptionOf(alloc) };
  };
  /** compositionOf's within-category mix at weightsOf's category weights. */
  function atWeights(compositionOf, weightsOf) {
    var W = {}, C = {}; weightsOf.forEach(function (h) { W[h.categoryId] = (W[h.categoryId] || 0) + h.weight; });
    compositionOf.forEach(function (h) { (C[h.categoryId] = C[h.categoryId] || []).push(h); });
    var out = [];
    Object.keys(W).forEach(function (c) {
      var list = C[c], tot = list ? U.sum(list, function (h) { return h.weight; }) : 0;
      if (list && Math.abs(tot) > 1e-9) list.forEach(function (h) { out.push(h0(h.instrumentId, h.weight / tot * W[c], c)); });
      else { var b = CH.basket(c, W[c]); if (b) out = out.concat(b); else weightsOf.filter(function (h) { return h.categoryId === c; }).forEach(function (h) { out.push(h0(h.instrumentId, h.weight, c)); }); }
    });
    return merged(out);
  }

  /* ── positions: weights keyed by instrument and category ─────────── */
  function pos(hs) { var o = {}; (hs || []).forEach(function (h) { var k = h.instrumentId + '|' + h.categoryId; if (!o[k]) o[k] = { key: k, instrumentId: h.instrumentId, categoryId: h.categoryId, weight: 0 }; o[k].weight += h.weight; }); return o; }
  function plus(a, b, s) { var o = {}; [[a, 1], [b, s == null ? 1 : s]].forEach(function (x) { Object.keys(x[0]).forEach(function (k) { var p = x[0][k], q = o[k] || (o[k] = { key: k, instrumentId: p.instrumentId, categoryId: p.categoryId, weight: 0 }); q.weight += x[1] * p.weight; }); }); return o; }
  function byInstrument(P) { var w = {}; Object.keys(P).forEach(function (k) { var p = P[k]; if (Math.abs(p.weight) > 1e-12) w[p.instrumentId] = (w[p.instrumentId] || 0) + p.weight; }); return w; }
  var total = function (P) { return U.sum(Object.keys(P), function (k) { return P[k].weight; }); };
  var keysOf = function (a, b) { var s = {}; Object.keys(a).concat(Object.keys(b)).forEach(function (k) { s[k] = 1; }); return Object.keys(s); };

  /* ── groups for the asset lens ───────────────────────────────────── */
  function groupsFor(by) {
    if (by === 'assetClass') return D.assetClasses.map(function (ac) { var c = D.categoryById[ac.category] || D.taxonomyById[ac.category] || {}; return { id: ac.id, label: ac.name, short: ac.name, color: c.color, index: [[ac.indexId, 100]], of: function (p) { return D.instrumentById[p.instrumentId].assetClass; } }; });
    return D.categories.map(function (c) { return { id: c.id, label: c.name, short: c.short, color: c.color, index: c.index, of: function (p) { return p.categoryId; } }; });
  }
  function groupOf(by) { return by === 'assetClass' ? function (p) { return D.instrumentById[p.instrumentId].assetClass; } : by === 'product' ? function (p) { return p.key; } : function (p) { return p.categoryId; }; }

  /**
   * Allocation, selection and interaction by group between an upper and a
   * lower portfolio. ret(position) → % (any period). Brinson–Fachler:
   * allocation (wL − wU)(RUg − RU); Brinson–Hood–Beebower: (wL − wU)RUg.
   * Selection wU(RLg − RUg), interaction (wL − wU)(RLg − RUg), folded into
   * selection or allocation unless shown on its own. A group the upper level
   * does not hold is measured against its index. Unallocated weight earns
   * nothing and is its own line, so the effects sum to RL − RU.
   */
  function brinson(Lp, Up, ret, by, m) {
    var RU = 0; Object.keys(Up).forEach(function (k) { RU += Up[k].weight / 100 * ret(Up[k]); });
    var rows = [], sL = 0, sU = 0;
    groupsFor(by).forEach(function (g) {
      var agg = function (P) { var W = 0, R = 0; Object.keys(P).forEach(function (k) { var p = P[k]; if (g.of(p) !== g.id) return; W += p.weight / 100; R += p.weight / 100 * ret(p); }); return { W: W, R: R }; };
      var l = agg(Lp), u = agg(Up); sL += l.W; sU += u.W;
      if (Math.abs(l.W) < 1e-9 && Math.abs(u.W) < 1e-9) return;
      var ix = null; if (Math.abs(u.W) < 1e-9 && g.index && g.index.length) { var tot = U.sum(g.index, function (q) { return q[1]; }); ix = U.sum(g.index, function (q) { return q[1] / tot * ret({ instrumentId: q[0], categoryId: g.id }); }); }
      var RUg = Math.abs(u.W) > 1e-9 ? u.R / u.W : ix != null ? ix : (Math.abs(l.W) > 1e-9 ? l.R / l.W : 0), RLg = Math.abs(l.W) > 1e-9 ? l.R / l.W : RUg, dW = l.W - u.W;
      var al = m.model === 'BHB' ? dW * RUg : dW * (RUg - RU), se = u.W * (RLg - RUg), it = dW * (RLg - RUg);
      if (m.interaction === 'allocation') { al += it; it = 0; } else if (m.interaction !== 'separate') { se += it; it = 0; }
      rows.push({ key: g.id, label: g.label, short: g.short, color: g.color, wFrom: u.W * 100, wTo: l.W * 100, rFrom: RUg, rTo: RLg, allocation: al, selection: se, interaction: it, total: al + se + it });
    });
    var du = (1 - sL) - (1 - sU);
    if (Math.abs(du) > 1e-9) { var ua = m.model === 'BHB' ? 0 : du * (0 - RU); rows.push({ key: '__residual', label: 'Unallocated', short: 'Unallocated', color: '#c3cedb', wFrom: (1 - sU) * 100, wTo: (1 - sL) * 100, rFrom: 0, rTo: 0, allocation: ua, selection: 0, interaction: 0, total: ua }); }
    return rows;
  }
  /** By product: each position's active weight × its return over the upper level's (BF) or its own return (BHB). */
  function products(Lp, Up, ret, m) {
    var RU = 0; Object.keys(Up).forEach(function (k) { RU += Up[k].weight / 100 * ret(Up[k]); });
    var dup = {}; keysOf(Lp, Up).forEach(function (k) { var id = k.split('|')[0]; dup[id] = (dup[id] || 0) + 1; });
    var rows = keysOf(Lp, Up).map(function (k) {
      var p = Lp[k] || Up[k], wl = Lp[k] ? Lp[k].weight : 0, wu = Up[k] ? Up[k].weight : 0, r = ret(p), ins = D.instrumentById[p.instrumentId], c = D.categoryById[p.categoryId];
      var t = (wl - wu) / 100 * (m.model === 'BHB' ? r : r - RU);
      return { key: k, label: ins.name + (dup[p.instrumentId] > 1 && c ? ' · ' + c.short : '') + (!wl && wu ? ' (upper level only)' : ''), short: ins.name, color: c ? c.color : '#c3cedb', wFrom: wu, wTo: wl, rFrom: r, rTo: r, total: t, allocation: null, selection: null, interaction: null };
    }).filter(function (r) { return Math.abs(r.wFrom) > 1e-9 || Math.abs(r.wTo) > 1e-9; });
    var du = (1 - total(Lp) / 100) - (1 - total(Up) / 100);
    if (Math.abs(du) > 1e-9) rows.push({ key: '__residual', label: 'Unallocated', short: 'Unallocated', color: '#c3cedb', wFrom: 100 - total(Up), wTo: 100 - total(Lp), rFrom: 0, rTo: 0, total: m.model === 'BHB' ? 0 : du * (0 - RU) });
    return rows;
  }
  /**
   * By product for the two steps that work holding by holding. Selection
   * (product benchmarks → portfolio): each holding's weight × its return over
   * its benchmark's. Benchmark mapping (SAA → product benchmarks): each
   * holding's weight × its benchmark's return over the SAA's return in the
   * holding's category, plus a weight line per category where the portfolio's
   * category weight differs from the SAA's.
   */
  function holdingRows(kind, Up, mapping, ret, m) {
    var rowsOut = [], RU = 0; Object.keys(Up).forEach(function (k) { RU += Up[k].weight / 100 * ret(Up[k]); });
    var bRet = function (mp) { return mp.weight ? U.sum(mp.holdings, function (b) { return b.weight / mp.weight * ret(b); }) : 0; };
    if (kind === 'selection') {
      mapping.forEach(function (mp) { var r = ret(mp), rb = bRet(mp), c = D.categoryById[mp.categoryId]; rowsOut.push({ key: mp.instrumentId + '|' + mp.categoryId, label: mp.name, short: mp.name, sub: 'vs ' + mp.target.label, color: c ? c.color : '#c3cedb', wFrom: mp.weight, wTo: mp.weight, rFrom: rb, rTo: r, total: mp.weight / 100 * (r - rb) }); });
      return rowsOut;
    }
    var WS = {}, RS = {}, WI = {};
    Object.keys(Up).forEach(function (k) { var p = Up[k]; WS[p.categoryId] = (WS[p.categoryId] || 0) + p.weight / 100; RS[p.categoryId] = (RS[p.categoryId] || 0) + p.weight / 100 * ret(p); });
    Object.keys(RS).forEach(function (c) { RS[c] = Math.abs(WS[c]) > 1e-9 ? RS[c] / WS[c] : 0; });
    var catRet = function (c) { if (RS[c] != null && Math.abs(WS[c]) > 1e-9) return RS[c]; var b = CH.basket(c, 100); return b ? U.sum(b, function (q) { return q.weight / 100 * ret(q); }) : null; };
    mapping.forEach(function (mp) { WI[mp.categoryId] = (WI[mp.categoryId] || 0) + mp.weight / 100; var rc = catRet(mp.categoryId), rb = bRet(mp), c = D.categoryById[mp.categoryId]; if (rc == null) rc = rb; rowsOut.push({ key: mp.instrumentId + '|' + mp.categoryId, label: mp.name, short: mp.name, sub: mp.target.label + ' vs the SAA in ' + (c ? c.short : 'its category'), color: c ? c.color : '#c3cedb', wFrom: mp.weight, wTo: mp.weight, rFrom: rc, rTo: rb, total: mp.weight / 100 * (rb - rc) }); });
    var sI = 0, sS = 0;
    D.categories.forEach(function (c) {
      var wi = WI[c.id] || 0, ws = WS[c.id] || 0; sI += wi; sS += ws; if (Math.abs(wi - ws) < 1e-9) return;
      var rc = catRet(c.id); if (rc == null) rc = 0;
      rowsOut.push({ key: '__w:' + c.id, label: 'Category weight · ' + c.short, short: c.short + ' weight', color: c.color, wFrom: ws * 100, wTo: wi * 100, rFrom: rc, rTo: rc, total: (wi - ws) * (m.model === 'BHB' ? rc : rc - RU), weightLine: true });
    });
    var du = (1 - sI) - (1 - sS);
    if (Math.abs(du) > 1e-9) rowsOut.push({ key: '__residual', label: 'Unallocated', short: 'Unallocated', color: '#c3cedb', wFrom: (1 - sS) * 100, wTo: (1 - sI) * 100, rFrom: 0, rTo: 0, total: m.model === 'BHB' ? 0 : du * (0 - RU) });
    return rowsOut;
  }

  /* ── the factor lens ─────────────────────────────────────────────── */
  var betaCache = {};
  function betaOf(model, id) { var k = model.id + ':' + id; return betaCache[k] || (betaCache[k] = E.loadingsOf(model, id)); }
  CH.resetCaches = function () { betaCache = {}; prCache = {}; };
  function exposure(P, model) { var x = {}; model.factors.forEach(function (f) { x[f.id] = 0; }); Object.keys(P).forEach(function (k) { var p = P[k], b = betaOf(model, p.instrumentId); model.factors.forEach(function (f) { x[f.id] += p.weight / 100 * b[f.id]; }); }); return x; }
  /** Active exposure × factor return, cash on the net weight difference, and holdings-based specific. */
  function factorLens(Lp, Up, ret, rf, prem, model) {
    var D2 = plus(Lp, Up, -1), xL = exposure(Lp, model), xU = exposure(Up, model), fac = 0, spec = 0;
    var rows = model.factors.map(function (f) { var d = xL[f.id] - xU[f.id], c = d * prem[f.id]; fac += c; return { factorId: f.id, label: f.name, betaFrom: xU[f.id], betaTo: xL[f.id], dBeta: d, factorReturn: prem[f.id], contribution: c }; });
    Object.keys(D2).forEach(function (k) { var p = D2[k]; if (Math.abs(p.weight) < 1e-12) return; var b = betaOf(model, p.instrumentId), e = ret(p) - rf; model.factors.forEach(function (f) { e -= b[f.id] * prem[f.id]; }); spec += p.weight / 100 * e; });
    var cash = total(D2) / 100 * rf;
    return { byFactor: rows, factorTotal: fac, cash: cash, specific: spec };
  }
  /** Group × factor: each group's effect split by factor; rows tie to the asset lens, columns to the factor lens. */
  function matrix(Lp, Up, ret, rf, prem, model, by, m) {
    var D2 = plus(Lp, Up, -1), RU = 0, g = groupOf(by), cells = {}, order = [];
    Object.keys(Up).forEach(function (k) { RU += Up[k].weight / 100 * ret(Up[k]); });
    Object.keys(D2).forEach(function (k) {
      var p = D2[k]; if (Math.abs(p.weight) < 1e-12) return;
      var gid = g(p), row = cells[gid]; if (!row) { row = cells[gid] = { factors: {}, specific: 0, cash: 0 }; order.push(gid); }
      var w = p.weight / 100, b = betaOf(model, p.instrumentId), e = ret(p) - rf;
      model.factors.forEach(function (f) { var c = w * b[f.id] * prem[f.id]; row.factors[f.id] = (row.factors[f.id] || 0) + c; e -= b[f.id] * prem[f.id]; });
      row.specific += w * e; row.cash += w * (m.model === 'BHB' ? rf : rf - RU);
    });
    var net = total(D2) / 100;
    if (m.model !== 'BHB' && Math.abs(net) > 1e-9) { cells.__residual = { factors: {}, specific: 0, cash: net * RU }; order.push('__residual'); }
    return { order: order, cells: cells };
  }

  /* ── ex-ante risk under a factor model ───────────────────────────── */
  function exAnteCov(wa, wb, model) {
    var F = E.factorCov(model), xa = model.factors.map(function () { return 0; }), xb = xa.slice(), spec = 0;
    Object.keys(wa).forEach(function (id) { var b = betaOf(model, id); model.factors.forEach(function (f, i) { xa[i] += wa[id] / 100 * b[f.id]; }); if (wb[id]) { var s = E.specificOf(model, id); spec += wa[id] / 100 * wb[id] / 100 * s * s; } });
    Object.keys(wb).forEach(function (id) { var b = betaOf(model, id); model.factors.forEach(function (f, i) { xb[i] += wb[id] / 100 * b[f.id]; }); });
    return U.mat.dot(xa, U.mat.mulVec(F, xb)) + spec;
  }

  /* ── history ─────────────────────────────────────────────────────── */
  var prCache = {};
  /** Monthly realised factor returns (%): each month's asset-class index excess returns regressed on the loadings. */
  function realisedFactors(model, i0, i1) {
    var key = model.id + ':' + i0 + ':' + i1 + ':' + (D.feeBasis || 'net'); if (prCache[key]) return prCache[key];
    var cash = E.holdingSeries('idx_cash').series, out = [];
    for (var t = i0; t <= i1; t++) {
      var rf = (cash[t] || 0) * 100;
      out.push(E.impliedPremia(model, function (ac) { var a = D.assetClassById[ac], s = a && a.indexId ? E.holdingSeries(a.indexId).series[t] : null; return s == null ? 0 : s * 100 - rf; }));
    }
    return (prCache[key] = out);
  }
  function seriesOf(id, i0, i1, memo) { if (!memo[id]) memo[id] = E.holdingSeries(id).series.slice(i0, i1 + 1); return memo[id]; }
  var ann = function (arr) { var c = arr.filter(function (v) { return v != null; }); return c.length >= 12 ? U.stats.annualizedReturn(c) * 100 : null; };
  function sd(a) { var n = a.length; if (n < 3) return 0; var m = U.sum(a) / n, s = 0; a.forEach(function (v) { s += (v - m) * (v - m); }); return Math.sqrt(s / (n - 1)); }
  function cov(a, b) { var n = a.length; if (n < 3) return 0; var ma = U.sum(a) / n, mb = U.sum(b) / n, s = 0; for (var i = 0; i < n; i++) s += (a[i] - ma) * (b[i] - mb); return s / (n - 1); }

  /* ── linking ─────────────────────────────────────────────────────── */
  /**
   * Coefficients that turn monthly effects into period effects summing to
   * the period's active return. rL, rU: monthly level returns (fractions).
   * Returns {coef:[], cells(e[]) → per-month linked values, total}.
   */
  function linker(method, rL, rU) {
    var n = rL.length, CL = 1, CU = 1; for (var t = 0; t < n; t++) { CL *= 1 + rL[t]; CU *= 1 + rU[t]; } CL -= 1; CU -= 1;
    var lnr = function (a, b) { return Math.abs(a - b) < 1e-12 ? 1 / (1 + b) : (Math.log(1 + a) - Math.log(1 + b)) / (a - b); };
    var coef = [], target = CL - CU, i;
    if (method === 'geometric') {
      var G = (1 + CL) / (1 + CU) - 1, KG = Math.abs(G) < 1e-12 ? 1 : G / Math.log(1 + G);
      for (i = 0; i < n; i++) { var g = (rL[i] - rU[i]) / (1 + rU[i]), kg = Math.abs(g) < 1e-12 ? 1 : Math.log(1 + g) / g; coef.push(kg * KG / (1 + rU[i])); }
      target = G;
    } else if (method === 'menchero') {
      var A = target, M = (Math.abs(CL - CU) < 1e-12) ? Math.pow(1 + CU, (n - 1) / n) : (A / n) / (Math.pow(1 + CL, 1 / n) - Math.pow(1 + CU, 1 / n)), sa = 0, sa2 = 0;
      for (i = 0; i < n; i++) { var a = rL[i] - rU[i]; sa += a; sa2 += a * a; }
      var alpha = sa2 > 1e-18 ? (A - M * sa) / sa2 : 0;
      for (i = 0; i < n; i++) coef.push(M + alpha * (rL[i] - rU[i]));
    } else if (method === 'grap' || method === 'frongello') {
      var before = 1, after = []; var acc = 1; for (i = n - 1; i >= 0; i--) { after[i] = acc; acc *= 1 + rU[i]; }
      for (i = 0; i < n; i++) { coef.push(before * after[i]); before *= 1 + rL[i]; }
    } else {
      var K = lnr(CL, CU);
      for (i = 0; i < n; i++) coef.push(lnr(rL[i], rU[i]) / K);
    }
    return {
      total: target,
      link: function (e) { var s = 0; for (var t2 = 0; t2 < n; t2++) s += e[t2] * coef[t2]; return s; },
      cells: function (e) {
        if (method !== 'frongello') return e.map(function (v, t3) { return v * coef[t3]; });
        /* Frongello: each month's effect grown by the lower level so far, plus the upper level's return on the effect linked so far */
        var out = [], cum = 0, grow = 1; for (var t4 = 0; t4 < n; t4++) { var G4 = e[t4] * grow + rU[t4] * cum; out.push(G4); cum += G4; grow *= 1 + rL[t4]; } return out;
      }
    };
  }

  /* ── value at risk ───────────────────────────────────────────────── */
  var Z99 = 2.3263, ES99 = Math.exp(-Z99 * Z99 / 2) / Math.sqrt(2 * Math.PI) / 0.01;
  /** Seeded Monte Carlo draws of one-year factor shocks: multivariate Student-t (5 degrees of freedom) on the factor covariance. */
  var mcCache = {};
  function mcFactors(model, n) {
    var key = model.id + ':' + n; if (mcCache[key]) return mcCache[key];
    var F = E.factorCov(model), k = F.length, Lc = U.mat.cholesky(F.map(function (r, i) { return r.map(function (v, j) { return i === j ? v + 1e-8 : v; }); }));
    var rng = U.rng(U.hash('chain-mc:' + model.id)), out = [], nu = 5;
    for (var d = 0; d < n; d++) {
      var z = []; for (var i = 0; i < k; i++) z.push(rng.normal());
      var chi = 0; for (var j = 0; j < nu; j++) { var q = rng.normal(); chi += q * q; }
      var sc = Math.sqrt((nu - 2) / chi), x = [];
      for (var r = 0; r < k; r++) { var s = 0; for (var c = 0; c <= r; c++) s += Lc[r][c] * z[c]; x.push(s * sc); }
      out.push(x);
    }
    return (mcCache[key] = out);
  }

  /* ── the analysis ────────────────────────────────────────────────── */
  function subsetsOf(n) { var out = []; for (var m = 0; m < (1 << n); m++) out.push(m); return out; }
  function permutations(a) { if (a.length <= 1) return [a.slice()]; var out = []; a.forEach(function (x, i) { permutations(a.slice(0, i).concat(a.slice(i + 1))).forEach(function (p) { out.push([x].concat(p)); }); }); return out; }
  var DEC_FOR = { policy: null, saa: 'saa', saaWeights: 'weight', benchWeights: 'benchmarkFirst', productBenchmarks: 'mapping', portfolio: 'selection' };
  /** The decision a move from one level to the next stands for. */
  function decisionInto(prev, level) { if (level.id === 'productBenchmarks' && prev) { if (prev.id === 'saaWeights') return 'benchmark'; if (prev.id === 'benchWeights') return 'weightSecond'; } return DEC_FOR[level.id] || 'pair'; }

  /**
   * The chain analysis of one allocation.
   * opts: {pool, basis:'forward'|'historical'|'both', R, period:{start,end}, modelId, pairModelId?,
   *        rowKey, decompose, order, implementation, method:{model, interaction, returns, linking, currency, unallocated},
   *        factorReturns, exposures, specificBy, risk:{basis, units, stepRisk, columns, varMethod, paths}, overTime, returnsFrom?}
   */
  CH.analyse = function (alloc, opts) {
    var m = opts.method || {}, model = E.modelOf(opts.modelId), rbMemo = {}, res = opts.levels || CH.levelsOf(alloc, opts.pool, { unallocated: m.unallocated, rowKey: opts.rowKey, implementation: opts.implementation, defaults: { order: m.order, implementation: m.implementation } });
    var out = { allocationId: alloc.id, notes: res.notes || [], warnings: res.warnings || [], mapping: (res.mapping || []).map(function (x) { return { instrumentId: x.instrumentId, name: x.name, categoryId: x.categoryId, weight: x.weight, source: x.source, target: x.target }; }), counts: res.counts, isDefault: !!res.isDefault, saaSet: !!res.saaSet, exception: res.exception || null };
    if (res.reason) { out.reason = res.reason; return out; }
    var all = res.levels, broken = all.filter(function (l) { return !l.holdings; });
    out.levels = all.map(function (l) { return { id: l.id, code: l.code, short: l.short, name: l.name, label: l.label, source: l.source, reason: l.reason || null, holdings: l.holdings ? l.holdings.map(function (h) { return { instrumentId: h.instrumentId, weight: U.round(h.weight, 4), categoryId: h.categoryId }; }) : null }; });
    /* a level that cannot be formed: the steps either side of it become one, and the others still compute */
    var L = all.filter(function (l) { return l.holdings; });
    if (L.length < 2) { out.reason = broken.map(function (l) { return l.reason; }).join(' · '); return out; }
    if (broken.length) out.partial = broken.map(function (l) { return l.reason; });
    var decs = L.slice(1).map(function (l, i) {
      var from = all.indexOf(L[i]), to = all.indexOf(l), ids = all.slice(from + 1, to + 1).map(function (x, j) { return decisionInto(all[from + j], x); });
      if (ids.length === 1) return ids[0];
      var id = ids.join('+'); if (!CH.DECISIONS[id]) CH.DECISIONS[id] = { id: id, code: ids.map(function (x) { return CH.DECISIONS[x].code; }).join(' + '), label: ids.map(function (x) { return CH.DECISIONS[x].label; }).join(' and '), short: ids.map(function (x) { return CH.DECISIONS[x].short; }).join(' and '), versus: null, merged: true };
      return id;
    });
    var P = L.map(function (l) { return pos(l.holdings); });
    var Dk = decs.map(function (d, i) { return plus(P[i + 1], P[i], -1); });
    var orderSpec = opts.order === 'chain' || !opts.order ? (res.order || 'default') : opts.order, n = decs.length;
    var SPLIT = /^(mapping|weight|benchmark|benchmarkFirst|weightSecond)$/;
    var seq = function (o) { if (o === 'default' || o === 'averaged') return decs.map(function (d, i) { return i; }); var main = o.split(','), out2 = []; main.forEach(function (d) { if (d === 'mapping') { decs.forEach(function (x, i) { if (SPLIT.test(x)) out2.push(i); }); } else { var i = decs.indexOf(d); if (i >= 0) out2.push(i); } }); return out2.length === n ? out2 : decs.map(function (d, i) { return i; }); };
    /* order-averaged: every order of the three decisions; a split implementation step keeps its two halves together */
    var blocks = []; decs.forEach(function (d, i) { if (SPLIT.test(d) && d !== 'mapping' && blocks.length && SPLIT.test(decs[blocks[blocks.length - 1][0]]) && decs[blocks[blocks.length - 1][0]] !== 'mapping') blocks[blocks.length - 1].push(i); else blocks.push([i]); });
    var orderings = orderSpec === 'averaged' ? permutations(blocks.map(function (b, i) { return i; })).map(function (p) { return [].concat.apply([], p.map(function (bi) { return blocks[bi]; })); }) : [seq(orderSpec)];
    var Pset = {}; subsetsOf(n).forEach(function (mask) { var x = P[0]; for (var i = 0; i < n; i++) if (mask & (1 << i)) x = plus(x, Dk[i]); Pset[mask] = x; });
    var stepFor = function (i, ord) { var pre = 0, at = ord.indexOf(i); for (var j = 0; j < at; j++) pre |= 1 << ord[j]; return { upper: pre, lower: pre | (1 << i) }; };
    var by = opts.decompose === 'factor' ? 'category' : (opts.decompose || 'category'), geo = m.returns === 'geometric', specBy = opts.specificBy === 'product' ? 'product' : opts.specificBy === 'category' ? 'category' : null;
    var defaultOrder = orderings.length === 1 && orderings[0].every(function (x, i) { return x === i; });
    var holdingKind = function (i) { return defaultOrder && !opts.rowKey && m.unallocated !== 'cash' ? (decs[i] === 'selection' ? 'selection' : decs[i] === 'mapping' ? 'mapping' : null) : null; };
    var mapping = res.mapping;
    var allRows = function (Lp, Up, ret, i) { var hk = by === 'product' ? holdingKind(i) : null; return hk ? holdingRows(hk, Up, mapping, ret, m) : by === 'product' ? products(Lp, Up, ret, m) : brinson(Lp, Up, ret, by, m); };
    var label = function (i, ord) { var d = CH.DECISIONS[decs[i]], at = ord.indexOf(i); return { id: decs[i], code: d.code, label: d.label, short: d.short, asks: d.asks || null, versus: defaultOrder ? (d.versus || L[i + 1].short + ' less ' + L[i].short.toLowerCase()) : null, from: defaultOrder ? L[i].short : (at === 0 ? 'Policy benchmark' : 'after ' + ord.slice(0, at).map(function (j) { return CH.DECISIONS[decs[j]].short; }).join(', ')), to: defaultOrder ? L[i + 1].short : 'with ' + d.short, order: at }; };
    out.orderLabel = orderSpec === 'averaged' ? 'Order-averaged over ' + orderings.length + ' orders' : CH.orderLabel(orderSpec);
    out.order = orderSpec; out.implementation = res.implementation;
    var inst = function (P2) { return byInstrument(P2); };
    var models = [model]; if (opts.pairModelId && opts.pairModelId !== model.id) models.push(E.modelOf(opts.pairModelId));
    var want = function (b) { return opts.basis === 'both' || opts.basis === b; };

    /* combine per-ordering results (one ordering, or the average over all) */
    var avgRows = function (lists) {
      if (lists.length === 1) return lists[0];
      var byKey = {}, order = [];
      lists.forEach(function (rows) { rows.forEach(function (r) { var x = byKey[r.key]; if (!x) { x = byKey[r.key] = U.clone(r); ['allocation', 'selection', 'interaction', 'total', 'wFrom', 'wTo', 'rFrom', 'rTo'].forEach(function (f) { if (x[f] != null) x[f] = 0; }); order.push(r.key); } ['allocation', 'selection', 'interaction', 'total', 'wFrom', 'wTo', 'rFrom', 'rTo'].forEach(function (f) { if (r[f] != null) x[f] += r[f] / lists.length; }); }); });
      return order.map(function (k) { return byKey[k]; });
    };
    var avgFac = function (list) {
      if (list.length === 1) return list[0];
      var o = U.clone(list[0]); ['factorTotal', 'cash', 'specific', 'drift', 'notReconciled'].forEach(function (f) { if (o[f] != null) o[f] = U.sum(list, function (x) { return x[f] || 0; }) / list.length; });
      o.byFactor.forEach(function (r, j) { ['betaFrom', 'betaTo', 'dBeta', 'contribution'].forEach(function (f) { r[f] = U.sum(list, function (x) { return x.byFactor[j][f]; }) / list.length; }); });
      return o;
    };

    /* ── forward-looking ── */
    var fwd = null;
    if (want('forward')) {
      var R = opts.R, rf = D.assumptions.riskFree, prem = E.impliedPremia(model, function (ac) { return R.acReturn[ac].value - rf; });
      var retF = function (p) { return R.ret[p.instrumentId] ? R.ret[p.instrumentId].value : 0; };
      var Rv = function (Pp) { return U.sum(Object.keys(Pp), function (k) { return Pp[k].weight / 100 * retF(Pp[k]); }); };
      var levelRet = {}; Object.keys(Pset).forEach(function (mask) { levelRet[mask] = Rv(Pset[mask]); });
      fwd = { rf: rf, premia: prem, levelReturns: L.map(function (l, i) { return Rv(P[i]); }) };
      var stepVal = function (up, lo) { return geo ? ((1 + levelRet[lo] / 100) / (1 + levelRet[up] / 100) - 1) * 100 : levelRet[lo] - levelRet[up]; };
      fwd.steps = decs.map(function (d, i) {
        var per = orderings.map(function (ord) {
          var s = stepFor(i, ord), Lp = Pset[s.lower], Up = Pset[s.upper], v = stepVal(s.upper, s.lower), sc = geo ? 1 / (1 + levelRet[s.upper] / 100) : 1;
          var rows = allRows(Lp, Up, retF, i).map(function (r) { if (sc !== 1) ['allocation', 'selection', 'interaction', 'total'].forEach(function (f) { if (r[f] != null) r[f] *= sc; }); return r; });
          var fl = factorLens(Lp, Up, retF, rf, prem, model); if (sc !== 1) { fl.byFactor.forEach(function (r) { r.contribution *= sc; }); fl.factorTotal *= sc; fl.cash *= sc; fl.specific *= sc; }
          if (opts.exposures === 'returns') returnsBased(fl, Lp, Up, sc);
          var mx = matrix(Lp, Up, retF, rf, prem, model, by === 'product' ? 'product' : by, m); if (sc !== 1) Object.keys(mx.cells).forEach(function (k) { var c = mx.cells[k]; c.specific *= sc; c.cash *= sc; Object.keys(c.factors).forEach(function (f) { c.factors[f] *= sc; }); });
          var pair = models.length > 1 ? factorLens(Lp, Up, retF, rf, E.impliedPremia(models[1], function (ac) { return R.acReturn[ac].value - rf; }), models[1]) : null;
          var smx = specBy && specBy !== (by === 'product' ? 'product' : 'category') ? matrix(Lp, Up, retF, rf, prem, model, specBy, m) : null; if (smx && sc !== 1) Object.keys(smx.cells).forEach(function (k) { smx.cells[k].specific *= sc; });
          return { v: v, rows: rows, fl: fl, mx: mx, smx: smx, pair: pair, upper: s.upper, lower: s.lower, ord: ord };
        });
        var v = orderings.length === 1 ? per[0].v : geo ? (Math.exp(U.sum(per, function (x) { return Math.log(1 + x.v / 100); }) / per.length) - 1) * 100 : U.sum(per, function (x) { return x.v; }) / per.length;
        return { total: v, byGroup: avgRows(per.map(function (x) { return x.rows; })), factor: avgFac(per.map(function (x) { return x.fl; })), matrix: per[0].mx, specificMatrix: per[0].smx, pair: per[0].pair, spread: per.length > 1 ? { min: Math.min.apply(null, per.map(function (x) { return x.v; })), max: Math.max.apply(null, per.map(function (x) { return x.v; })), values: per.map(function (x) { return { order: x.ord.map(function (j) { return CH.DECISIONS[decs[j]].short; }).join(' → '), value: x.v }; }) } : null, meta: label(i, orderings[0]), drift: 0, upperMask: per[0].upper, lowerMask: per[0].lower };
      });
      fwd.risk = riskExAnte(Dk, decs, model, opts, fwd.steps, function (Pp) { return Rv(Pp); }, P);
      fwd.headline = L.map(function (l, i) { return E.headline({ holdings: l.holdings }, i ? { holdings: L[i - 1].holdings } : null, { basis: 'forward', R: R, modelId: model.id }); });
      fwd.exposure = L.map(function (l, i) { return exposure(P[i], model); });
    }
    function returnsBased(fl, Lp, Up, sc) {
      /* returns-based exposures: betas from regressing each level's monthly returns on realised factor returns over the period */
      var bL = rbBeta(Lp), bU = rbBeta(Up); if (!bL || !bU) return;
      var fac = 0; fl.byFactor.forEach(function (r) { r.betaFrom = bU[r.factorId]; r.betaTo = bL[r.factorId]; r.dBeta = r.betaTo - r.betaFrom; r.contribution = r.dBeta * r.factorReturn * sc; fac += r.contribution; });
      var before = fl.factorTotal; fl.factorTotal = fac; fl.notReconciled = before - fac; fl.reconcileReason = 'Returns-based exposures: the factor contributions use betas estimated from returns, while the asset lens and the specific term use holdings, so the two do not tie exactly';
    }
    function rbBeta(Pp) {
      if (!opts.period) return null;
      var i0 = E.monthIndex(opts.period.start), i1 = E.monthIndex(opts.period.end), fr = realisedFactors(model, i0, i1), memo = {}, y = [];
      for (var t = 0; t <= i1 - i0; t++) { var s = 0; Object.keys(Pp).forEach(function (k) { var r = seriesOf(Pp[k].instrumentId, i0, i1, rbMemo)[t]; s += Pp[k].weight / 100 * (r == null ? 0 : r * 100); }); y.push(s); }
      var fs = model.factors, k2 = fs.length, M = [], v = [], tr = 0;
      for (var a = 0; a < k2; a++) { M.push([]); var sv = 0; for (var b = 0; b < k2; b++) { var sm = 0; for (var t2 = 0; t2 < y.length; t2++) sm += fr[t2][fs[a].id] * fr[t2][fs[b].id]; M[a].push(sm); } for (var t3 = 0; t3 < y.length; t3++) sv += fr[t3][fs[a].id] * y[t3]; v.push(sv); tr += M[a][a]; }
      var lam = 0.08 * tr / k2; for (var d2 = 0; d2 < k2; d2++) M[d2][d2] += lam;
      var hb = exposure(Pp, model), sol = U.mat.solve(M.map(function (r, i) { return r.slice(); }), v.map(function (x, i) { return x + lam * hb[fs[i].id]; }));
      if (!sol) return null; var o = {}; fs.forEach(function (f, i) { o[f.id] = sol[i]; }); void memo; return o;
    }

    /* ── historical ── */
    var hist = null;
    if (want('historical') && opts.period) {
      var i0 = E.monthIndex(opts.period.start), i1 = E.monthIndex(opts.period.end), months = D.history.months.slice(i0, i1 + 1), memo = {};
      var lvlSeries = L.map(function (l, i) {
        if ((l.id === 'portfolio' || l.id === 'lower') && opts.returnsFrom && !opts.rowKey) return opts.returnsFrom(opts.period.start, opts.period.end);
        return E.backtest(l.holdings, opts.period.start, opts.period.end).returns;
      });
      var mask = months.map(function (mo, t) { return lvlSeries.every(function (s) { return s[t] != null; }); }), idx = []; mask.forEach(function (ok, t) { if (ok) idx.push(t); });
      if (idx.length < 12) hist = { reason: 'Fewer than 12 months of history in the period at every level' };
      else {
        var cashS = seriesOf('idx_cash', i0, i1, memo), frAll = realisedFactors(model, i0, i1);
        var mS = {}; Object.keys(Pset).forEach(function (mask2) { var s = idx.map(function (t) { var v = lvlSeries[0][t]; for (var i = 0; i < n; i++) if (mask2 & (1 << i)) v += lvlSeries[i + 1][t] - lvlSeries[i][t]; return v; }); mS[mask2] = s; });
        var annOf = function (arr) { return U.stats.annualizedReturn(arr) * 100; };
        var levelAnn = {}; Object.keys(mS).forEach(function (k) { levelAnn[k] = annOf(mS[k]); });
        var annR = {}, retA = function (p) { var id = p.instrumentId; if (annR[id] === undefined) { var s = seriesOf(id, i0, i1, memo), c = idx.map(function (t) { return s[t]; }).filter(function (v) { return v != null; }); annR[id] = c.length >= 12 ? U.stats.annualizedReturn(c) * 100 : 0; } return annR[id]; };
        var rfA = retA({ instrumentId: 'idx_cash' }), lk = m.returns === 'geometric' ? 'geometric' : (m.linking || 'carino');
        var premAnnual = opts.factorReturns === 'implied' ? E.impliedPremia(model, function (ac) { return opts.R.acReturn[ac].value - D.assumptions.riskFree; }) : E.impliedPremia(model, function (ac) { return retA({ instrumentId: D.assetClassById[ac].indexId }) - rfA; });
        hist = { months: idx.map(function (t) { return months[t]; }), linking: lk, levelReturns: L.map(function (l, i) { var mk = 0; for (var j = 0; j < i; j++) mk |= 1 << j; return levelAnn[mk]; }), rf: rfA, premia: premAnnual };
        var stepValH = function (up, lo) { return geo ? ((1 + levelAnn[lo] / 100) / (1 + levelAnn[up] / 100) - 1) * 100 : levelAnn[lo] - levelAnn[up]; };
        var monthRet = function (t) { return function (p) { var r = seriesOf(p.instrumentId, i0, i1, memo)[t]; return r == null ? 0 : r * 100; }; };
        hist.steps = decs.map(function (d, i) {
          var per = orderings.map(function (ord) {
            var s = stepFor(i, ord), Lp = Pset[s.lower], Up = Pset[s.upper], v = stepValH(s.upper, s.lower), rL = mS[s.lower], rU = mS[s.upper], o2 = { v: v, upper: s.upper, lower: s.lower, ord: ord };
            if (lk === 'none') {
              o2.rows = allRows(Lp, Up, retA, i); o2.fl = factorLens(Lp, Up, retA, rfA, premAnnual, model);
              o2.mx = matrix(Lp, Up, retA, rfA, premAnnual, model, by === 'product' ? 'product' : by, m);
              if (specBy && specBy !== (by === 'product' ? 'product' : 'category')) o2.smx = matrix(Lp, Up, retA, rfA, premAnnual, model, specBy, m);
              var sumR = U.sum(o2.rows, function (r) { return r.total; }); o2.drift = v - sumR; o2.fl.drift = v - (o2.fl.factorTotal + o2.fl.cash + o2.fl.specific); o2.driftLabel = 'Compounding and rebalancing';
              if (opts.exposures === 'returns') returnsBased(o2.fl, Lp, Up, 1);
              return o2;
            }
            /* monthly effects, linked */
            var L2 = linker(lk, rL, rU), monthRows = [], monthFl = [], monthMx = [], monthSmx = [], monthDrift = [], wantS = specBy && specBy !== (by === 'product' ? 'product' : 'category');
            idx.forEach(function (t, j) {
              var rt = monthRet(t), rft = (cashS[t] || 0) * 100, pr = opts.factorReturns === 'realised' || !opts.factorReturns ? frAll[t] : scalePrem(premAnnual, 12);
              var rows = allRows(Lp, Up, rt, i), fl = factorLens(Lp, Up, rt, rft, pr, model), mx = matrix(Lp, Up, rt, rft, pr, model, by === 'product' ? 'product' : by, m);
              var a = (rL[j] - rU[j]) * 100, cw = U.sum(rows, function (r) { return r.total; });
              monthRows.push(rows); monthFl.push(fl); monthMx.push(mx); monthDrift.push(a - cw); if (wantS) monthSmx.push(matrix(Lp, Up, rt, rft, pr, model, specBy, m));
            });
            var scaleAnn = Math.abs(L2.total) > 1e-9 ? (geo ? v / 100 / L2.total : (levelAnn[s.lower] - levelAnn[s.upper]) / 100 / L2.total) : 12 / idx.length;
            var lin = function (arr) { return L2.link(arr) * scaleAnn; };
            var keys = [], first = {}, byM = monthRows.map(function (rows) { var o = {}; rows.forEach(function (r) { o[r.key] = r; if (!first[r.key]) { first[r.key] = r; keys.push(r.key); } }); return o; });
            var col = function (k, fld) { return byM.map(function (o) { var r = o[k]; return r && r[fld] != null ? r[fld] / 100 : 0; }); };
            o2.rows = keys.map(function (k) { var row = U.clone(first[k]); ['allocation', 'selection', 'interaction', 'total'].forEach(function (fld) { if (first[k][fld] != null) row[fld] = lin(col(k, fld)) * 100; }); row.rFrom = U.sum(col(k, 'rFrom')) / idx.length * 1200; row.rTo = U.sum(col(k, 'rTo')) / idx.length * 1200; return row; });
            var fl0 = U.clone(monthFl[0]); fl0.byFactor.forEach(function (r, q) { r.contribution = lin(monthFl.map(function (x) { return x.byFactor[q].contribution / 100; })) * 100; r.factorReturn = U.sum(monthFl, function (x) { return x.byFactor[q].factorReturn; }) / idx.length * 12; });
            fl0.factorTotal = U.sum(fl0.byFactor, function (r) { return r.contribution; }); fl0.cash = lin(monthFl.map(function (x) { return x.cash / 100; })) * 100; fl0.specific = lin(monthFl.map(function (x) { return x.specific / 100; })) * 100;
            o2.fl = fl0; o2.drift = lin(monthDrift.map(function (x) { return x / 100; })) * 100; o2.fl.drift = o2.drift; o2.driftLabel = 'Rebalancing and drift';
            if (opts.exposures === 'returns') returnsBased(o2.fl, Lp, Up, 1);
            var linkMx = function (list) {
              var mx0 = { order: [], cells: {} }; list.forEach(function (mx) { mx.order.forEach(function (g) { if (mx0.order.indexOf(g) < 0) { mx0.order.push(g); mx0.cells[g] = { factors: {}, specific: 0, cash: 0 }; } }); });
              mx0.order.forEach(function (g) { var c = mx0.cells[g]; model.factors.forEach(function (f) { c.factors[f.id] = lin(list.map(function (mx) { var x = mx.cells[g]; return x && x.factors[f.id] ? x.factors[f.id] / 100 : 0; })) * 100; }); c.specific = lin(list.map(function (mx) { var x = mx.cells[g]; return x ? x.specific / 100 : 0; })) * 100; c.cash = lin(list.map(function (mx) { var x = mx.cells[g]; return x ? x.cash / 100 : 0; })) * 100; });
              return mx0;
            };
            o2.mx = linkMx(monthMx); if (wantS) o2.smx = linkMx(monthSmx);
            /* period cells for the Over time view: linked monthly values (cumulative units), per step and per row */
            o2.cells = { total: L2.cells(idx.map(function (t, j) { return rL[j] - rU[j]; })).map(function (x) { return x * 100; }), rows: {} };
            o2.rows.forEach(function (r) { o2.cells.rows[r.key] = L2.cells(col(r.key, 'total')).map(function (x) { return x * 100; }); });
            o2.cells.factors = {}; model.factors.forEach(function (f, q) { o2.cells.factors[f.id] = L2.cells(monthFl.map(function (x) { return x.byFactor[q].contribution / 100; })).map(function (x) { return x * 100; }); });
            o2.cells.specific = L2.cells(monthFl.map(function (x) { return x.specific / 100; })).map(function (x) { return x * 100; });
            o2.cells.drift = L2.cells(monthDrift.map(function (x) { return x / 100; })).map(function (x) { return x * 100; });
            o2.cumulative = L2.total * 100;
            return o2;
          });
          var v = per.length === 1 ? per[0].v : geo ? (Math.exp(U.sum(per, function (x) { return Math.log(1 + x.v / 100); }) / per.length) - 1) * 100 : U.sum(per, function (x) { return x.v; }) / per.length;
          return { total: v, byGroup: avgRows(per.map(function (x) { return x.rows; })), factor: avgFac(per.map(function (x) { return x.fl; })), matrix: per[0].mx, specificMatrix: per[0].smx || null, drift: U.sum(per, function (x) { return x.drift || 0; }) / per.length, driftLabel: per[0].driftLabel, cells: avgCells(per.map(function (x) { return x.cells; })), cumulative: per[0].cumulative == null ? null : U.sum(per, function (x) { return x.cumulative; }) / per.length, spread: per.length > 1 ? { min: Math.min.apply(null, per.map(function (x) { return x.v; })), max: Math.max.apply(null, per.map(function (x) { return x.v; })), values: per.map(function (x) { return { order: x.ord.map(function (j) { return CH.DECISIONS[decs[j]].short; }).join(' → '), value: x.v }; }) } : null, meta: label(i, orderings[0]), upperMask: per[0].upper, lowerMask: per[0].lower };
        });
        var Lser = L.map(function (l, i) { var mk = 0; for (var j = 0; j < i; j++) mk |= 1 << j; return mS[mk]; });
        hist.headline = L.map(function (l, i) { return E.headline({ holdings: l.holdings, returnsFrom: (l.id === 'portfolio' || l.id === 'lower') && opts.returnsFrom && !opts.rowKey ? opts.returnsFrom : null }, i ? { holdings: L[i - 1].holdings } : null, { basis: 'historical', period: opts.period }); });
        hist.exposure = L.map(function (l, i) { return exposure(P[i], model); });
        hist.exposureReturns = L.map(function (l, i) { return rbBeta(P[i]); });
        hist.series = { months: hist.months, levels: Lser.map(function (s) { return s.map(function (v) { return v * 100; }); }) };
        hist.riskExPost = riskExPost(decs, hist.steps, mS, idx, i0, i1, memo, frAll, cashS, model, opts, Pset, by);
        hist.risk = opts.risk && opts.risk.basis === 'exante' ? riskExAnte(Dk, decs, model, opts, hist.steps, null, P, true) : hist.riskExPost;
        /* the Over time view: periods (years, months or rolling 36 months) */
        hist.overTime = overTime(hist, idx.map(function (t) { return months[t]; }), mS, decs, opts.overTime || 'years', orderings[0]);
      }
    }
    if (fwd && opts.risk && opts.risk.basis === 'expost' && hist && !hist.reason) { fwd.risk = hist.riskExPost; fwd.riskNote = 'Realised over the period, from monthly active returns'; }
    if (hist && hist.riskExPost) { delete hist.riskExPost; }
    /* the whole chain as one step, policy to portfolio, when a card asks for it */
    if (opts.step === 'policyToPortfolio' && !opts.levels) {
      var wp = CH.pair(L[L.length - 1].holdings, L[0].holdings, Object.assign({}, opts, { step: null, upperLabel: 'Policy benchmark', lowerLabel: 'Portfolio', returnsFrom: opts.rowKey ? null : opts.returnsFrom }));
      var pick = function (x) { return x && x.steps && !x.reason ? { step: Object.assign(x.steps[0], { meta: { id: 'policyToPortfolio', code: 'All', label: CH.DECISIONS.policyToPortfolio.label, short: CH.DECISIONS.policyToPortfolio.short, versus: CH.DECISIONS.policyToPortfolio.versus, asks: CH.DECISIONS.policyToPortfolio.asks, from: 'Policy benchmark', to: 'Portfolio', order: 0 } }), risk: x.risk.steps[0], te: x.risk.total } : null; };
      out.whole = { forward: pick(wp.forward), historical: pick(wp.historical) };
    }
    out.forward = fwd; out.historical = hist; out.decisions = decs.map(function (d) { return CH.DECISIONS[d]; });
    out.ties = ties(out, geo);
    [fwd, hist].forEach(function (x) { var r = x && x.risk; if (!r) return; delete r.totalSeries; r.steps.forEach(function (st) { delete st.series; delete st.specificSeries; delete st.cashSeries; delete st.driftSeries; (st.byGroup || []).forEach(function (g) { delete g.series; }); (st.byFactor || []).forEach(function (f) { delete f.series; }); }); });
    out.coverage = L.map(function (l) { var px = 0; l.holdings.forEach(function (h) { if (model.coverage(D.instrumentById[h.instrumentId])) px++; }); var none = l.holdings.filter(function (h) { return D.instrumentById[h.instrumentId].coverage === 'none'; }).length; return { id: l.id, proxied: px, uncovered: none }; });
    return out;

    function scalePrem(p, k) { var o = {}; Object.keys(p).forEach(function (f) { o[f] = p[f] / k; }); return o; }
    function avgCells(list) {
      if (!list[0]) return null; if (list.length === 1) return list[0];
      var av = function (get) { var a = list.map(get).filter(Boolean); return a[0].map(function (v, j) { return U.sum(a, function (x) { return x[j] || 0; }) / a.length; }); };
      var o = { total: av(function (c) { return c.total; }), specific: av(function (c) { return c.specific; }), drift: av(function (c) { return c.drift; }), rows: {}, factors: {} };
      Object.keys(list[0].rows).forEach(function (k) { o.rows[k] = av(function (c) { return c.rows[k]; }); });
      Object.keys(list[0].factors).forEach(function (k) { o.factors[k] = av(function (c) { return c.factors[k]; }); });
      return o;
    }
  };

  /**
   * One comparison (a lower portfolio against an upper one) through the same
   * machinery: the attribution models, interaction, linking and ties of a
   * single step. upper/lower: holdings [{instrumentId, weight, categoryId}].
   */
  CH.pair = function (lower, upper, opts) {
    var fix = function (hs) { return hs.map(function (h) { return h0(h.instrumentId, h.weight, h.categoryId); }); };
    var levels = { levels: [{ id: 'upper', code: '', short: opts.upperLabel || 'Reference', name: opts.upperLabel || 'Reference', label: opts.upperLabel || 'Reference', holdings: fix(upper), source: {} }, { id: 'lower', code: '', short: opts.lowerLabel || 'Subject', name: opts.lowerLabel || 'Subject', label: opts.lowerLabel || 'Subject', holdings: fix(lower), source: {} }], mapping: [], counts: {}, notes: [], warnings: [], order: 'default', implementation: 'one' };
    return CH.analyse({ id: opts.id || 'pair', name: opts.lowerLabel || 'Subject' }, Object.assign({}, opts, { levels: levels, order: 'default', implementation: 'one' }));
  };
  /**
   * Factors over time for a step's active position: calendar-year active
   * exposure, the year's tracking error split by factor (realised volatility
   * of the active returns, split with the model's covariances), and the
   * year's active return split into factor contributions, cash and specific.
   * Same shape as the engine's factorHistory.
   */
  CH.factorHistoryStep = function (lower, upper, from, to, modelId, returnsFrom) {
    var model = E.modelOf(modelId), F = E.factorCov(model), fs = model.factors;
    var rl = returnsFrom ? returnsFrom(from, to) : E.backtest(lower, from, to).returns, ru = E.backtest(upper, from, to).returns;
    var Dp = plus(pos(lower), pos(upper), -1), w = byInstrument(Dp), ids = Object.keys(w), net = total(Dp) / 100;
    var i0 = E.monthIndex(from), months = D.history.months.slice(i0, E.monthIndex(to) + 1), years = [], byYear = {};
    months.forEach(function (mo, i) { var y = +mo.slice(0, 4); if (!byYear[y]) { byYear[y] = []; years.push(y); } byYear[y].push(i); });
    var compound = function (arr) { var g = 1, n = 0; arr.forEach(function (v) { if (v != null) { g *= 1 + v; n++; } }); return n ? (g - 1) * 100 : null; };
    var idx = function (id, ix) { var s = E.holdingSeries(id).series; return ix.map(function (i) { return s[i0 + i]; }); };
    var spec = 0; ids.forEach(function (id) { var sp = E.specificOf(model, id); spec += Math.pow(w[id] / 100, 2) * sp * sp; });
    var out = { factors: fs.map(function (f) { return { id: f.id, name: f.name }; }), years: [], exposure: {}, risk: {}, ret: {}, totals: { risk: [], ret: [], cash: [], specificRisk: [], specificRet: [] }, active: true };
    fs.forEach(function (f) { out.exposure[f.id] = []; out.risk[f.id] = []; out.ret[f.id] = []; });
    years.forEach(function (y) {
      var ix = byYear[y], a = ix.map(function (i) { return rl[i] == null || ru[i] == null ? null : rl[i] - ru[i]; }), clean = a.filter(function (v) { return v != null; });
      if (clean.length < 6) return;
      out.years.push({ year: y, partial: ix.length < 12 });
      var x = fs.map(function (f) { var s2 = 0; ids.forEach(function (id) { var rng = U.rng(U.hash(model.id + id + f.id + y)); s2 += w[id] / 100 * (betaOf(model, id)[f.id] + rng.normal() * 0.05); }); return s2; });
      var Fx = U.mat.mulVec(F, x), mv = Math.sqrt(Math.max(U.mat.dot(x, Fx) + spec, 1e-12)), rv = U.stats.annualizedVol(clean) * 100, k = rv / mv;
      var rf = compound(idx('idx_cash', ix)) || 0, act = compound(ix.map(function (i) { return rl[i]; })) - compound(ix.map(function (i) { return ru[i]; }));
      var prem = E.impliedPremia(model, function (ac) { var c = D.assetClassById[ac]; var v = c && c.indexId ? compound(idx(c.indexId, ix)) : null; return v == null ? 0 : v - rf; });
      var fr = 0;
      fs.forEach(function (f, j) { out.exposure[f.id].push(x[j]); out.risk[f.id].push(k * x[j] * Fx[j] / mv); var c = x[j] * prem[f.id]; out.ret[f.id].push(c); fr += c; });
      out.totals.risk.push(rv); out.totals.specificRisk.push(k * spec / mv);
      out.totals.ret.push(act); out.totals.cash.push(rf * net); out.totals.specificRet.push(act - rf * net - fr);
    });
    return out;
  };

  /** Ex-ante risk of each step, of the whole chain, and of the sources within each step. */
  function riskExAnte(Dk, decs, model, opts, steps, Rv, P, onHist) {
    var rk = opts.risk || {}, W = Dk.map(byInstrument), tot = byInstrument(plus(P[P.length - 1], P[0], -1));
    var teTot = Math.sqrt(Math.max(exAnteCov(tot, tot, model), 0)), te = W.map(function (w) { return Math.sqrt(Math.max(exAnteCov(w, w, model), 0)); });
    var contrib = W.map(function (w) { return teTot > 1e-9 ? exAnteCov(w, tot, model) / teTot : 0; });
    var cross = teTot * teTot - U.sum(te, function (x) { return x * x; });
    var mu = steps.map(function (s) { return s.total; }), muTot = U.sum(mu);
    var out = { basis: 'exante', total: teTot, steps: decs.map(function (d, i) {
      var mr = E.modelRisk(W[i], model.id), cat = {}; Object.keys(Dk[i]).forEach(function (k) { var p = Dk[i][k]; if (Math.abs(p.weight) < 1e-12) return; (cat[p.instrumentId] = cat[p.instrumentId] || []).push(p); });
      var groups = {}, gOf = groupOf(opts.decompose === 'factor' ? 'category' : opts.decompose || 'category');
      Object.keys(mr.byInstrument).forEach(function (id) { var ps = cat[id] || [], ab = U.sum(ps, function (p) { return Math.abs(p.weight); }) || 1; ps.forEach(function (p) { var g = gOf(p), x = groups[g] || (groups[g] = { key: g, euler: 0, w: 0, wv: {} }); x.euler += mr.byInstrument[id] * Math.abs(p.weight) / ab; x.w += p.weight; x.wv[id] = (x.wv[id] || 0) + p.weight; }); });
      var src = Object.keys(groups).map(function (g) { var x = groups[g], sv = Math.sqrt(Math.max(exAnteCov(x.wv, x.wv, model), 0)), c = sv > 1e-9 && te[i] > 1e-9 ? exAnteCov(x.wv, W[i], model) / (sv * te[i]) : 0; return { key: g, euler: x.euler, activeWeight: x.w, sigma: sv, rho: c, marginal: Math.abs(x.w) > 0.05 ? x.euler / x.w : null }; });
      var fx = model.factors.map(function (f) { var F = E.factorCov(model), xv = model.factors.map(function (g) { return mr.exposure[g.id]; }), Fx = U.mat.mulVec(F, xv), k = model.factors.indexOf(f); return { factorId: f.id, label: f.name, euler: mr.byFactor[f.id], exposure: mr.exposure[f.id], marginal: te[i] > 1e-9 ? Fx[k] / te[i] : null }; });
      return { id: d, te: te[i], contribution: contrib[i], standalone: te[i], byGroup: src, byFactor: fx, specific: mr.specific, mu: mu[i] };
    }) };
    out.cross = cross; out.muTotal = muTot; out.var = varUnits(out, rk, model, Dk, opts);
    out.pairs = []; for (var a = 0; a < W.length; a++) for (var b = a + 1; b < W.length; b++) out.pairs.push({ a: decs[a], b: decs[b], cov: exAnteCov(W[a], W[b], model), corr: te[a] > 1e-9 && te[b] > 1e-9 ? exAnteCov(W[a], W[b], model) / (te[a] * te[b]) : null });
    if (onHist) out.note = 'Ex-ante risk from the ' + model.name + ' factor model on the historical basis';
    return out;
  }
  /** Ex-post (realised) risk over the period: from monthly active returns of each step. */
  function riskExPost(decs, steps, mS, idx, i0, i1, memo, fr, cashS, model, opts, Pset, by) {
    var n = decs.length, act = steps.map(function (s) { var lo = mS[s.lowerMask], up = mS[s.upperMask]; return lo.map(function (v, j) { return (v - up[j]) * 100; }); });
    var full = (1 << n) - 1, totA = mS[full].map(function (v, j) { return (v - mS[0][j]) * 100; });
    var k12 = Math.sqrt(12), teTot = sd(totA) * k12, te = act.map(function (a) { return sd(a) * k12; });
    var contrib = act.map(function (a) { return teTot > 1e-9 ? cov(a, totA) * 12 / teTot : 0; });
    var cross = teTot * teTot - U.sum(te, function (x) { return x * x; });
    var gOf = groupOf(by === 'product' ? 'product' : by);
    var out = { basis: 'expost', total: teTot, months: idx.length, steps: decs.map(function (d, i) {
      var Dp = plusMask(Pset[steps[i].lowerMask], Pset[steps[i].upperMask]), gs = {}, fx = {}, specS = [], cashA = [], sumG = act[i].map(function () { return 0; });
      Object.keys(Dp).forEach(function (k) { var p = Dp[k]; if (Math.abs(p.weight) < 1e-12) return; var g = gOf(p), s = seriesOf(p.instrumentId, i0, i1, memo), arr = gs[g] || (gs[g] = { key: g, a: act[i].map(function () { return 0; }), w: 0 }); arr.w += p.weight; idx.forEach(function (t, j) { var r = s[t] == null ? 0 : s[t] * 100; arr.a[j] += p.weight / 100 * r; sumG[j] += p.weight / 100 * r; }); });
      var dx = {}; model.factors.forEach(function (f) { dx[f.id] = 0; }); Object.keys(Dp).forEach(function (k) { var p = Dp[k], b = betaOf(model, p.instrumentId); model.factors.forEach(function (f) { dx[f.id] += p.weight / 100 * b[f.id]; }); });
      var net = total(Dp) / 100;
      idx.forEach(function (t, j) { var facSum = 0; model.factors.forEach(function (f) { var v = dx[f.id] * fr[t][f.id]; (fx[f.id] = fx[f.id] || []).push(v); facSum += v; }); var c = net * (cashS[t] || 0) * 100; cashA.push(c); specS.push(sumG[j] - facSum - c); });
      var drift = act[i].map(function (v, j) { return v - sumG[j]; }), sd_i = te[i] / k12;
      var c1 = function (s) { return sd_i > 1e-12 ? cov(s, act[i]) / sd_i * k12 : 0; };
      var byGroup = Object.keys(gs).map(function (g) { var x = gs[g], sv = sd(x.a) * k12, rho = sv > 1e-9 && sd_i > 1e-12 ? cov(x.a, act[i]) / (sd(x.a) * sd_i) : 0; return { key: g, euler: c1(x.a), activeWeight: x.w, sigma: sv, rho: rho, marginal: Math.abs(x.w) > 0.05 ? c1(x.a) / x.w : null, series: x.a }; });
      byGroup.push({ key: '__drift', euler: c1(drift), activeWeight: null, sigma: sd(drift) * k12, rho: null, marginal: null, series: drift });
      var byFactor = model.factors.map(function (f) { return { factorId: f.id, label: f.name, euler: c1(fx[f.id]), exposure: dx[f.id], marginal: null, series: fx[f.id] }; });
      return { id: d, te: te[i], contribution: contrib[i], standalone: te[i], byGroup: byGroup, byFactor: byFactor, specific: c1(specS), cash: c1(cashA), drift: c1(drift), mu: U.sum(act[i]) / act[i].length * 12, series: act[i], specificSeries: specS, cashSeries: cashA, driftSeries: drift };
    }) };
    out.cross = cross; out.muTotal = U.sum(totA) / totA.length * 12; out.totalSeries = totA;
    out.var = varUnits(out, opts.risk || {}, model, null, opts);
    out.pairs = []; for (var a = 0; a < n; a++) for (var b = a + 1; b < n; b++) out.pairs.push({ a: decs[a], b: decs[b], cov: cov(act[a], act[b]) * 12, corr: te[a] > 1e-9 && te[b] > 1e-9 ? cov(act[a], act[b]) * 12 / (te[a] * te[b]) : null });
    return out;
    function plusMask(a, b) { return plus(a, b, -1); }
  }
  /**
   * Value at risk and expected shortfall (99%, one year) for each step and
   * its sources, as losses: parametric (from the tracking error), historical
   * (the worst rolling twelve months of the period) or Monte Carlo (seeded
   * draws from the factor model with fat-tailed factor shocks).
   */
  function varUnits(risk, rk, model, Dk, opts) {
    var method = rk.varMethod || 'parametric', out = { method: method, steps: [] };
    if (method === 'historical' && risk.basis === 'expost') {
      var roll = function (s) { var o = []; for (var j = 11; j < s.length; j++) { var x = 0; for (var q = j - 11; q <= j; q++) x += s[q]; o.push(x); } return o; };
      var tot = roll(risk.totalSeries), k = Math.max(1, Math.ceil(tot.length * 0.01)), worst = tot.map(function (v, j) { return { v: v, j: j }; }).sort(function (a, b) { return a.v - b.v; }).slice(0, k), at = worst[k - 1].j;
      out.windows = tot.length; out.total = { var99: -worst[k - 1].v, es99: -U.sum(worst, function (w) { return w.v; }) / k };
      risk.steps.forEach(function (s) {
        var r = roll(s.series), srcV = function (ser) { var rr = roll(ser); return { var99: -rr[at], es99: -U.sum(worst, function (w) { return rr[w.j]; }) / k }; };
        var sv = r.map(function (v, j) { return { v: v, j: j }; }).sort(function (a, b) { return a.v - b.v; }), ks = Math.max(1, Math.ceil(r.length * 0.01));
        out.steps.push({ id: s.id, standalone: { var99: -sv[ks - 1].v, es99: -U.sum(sv.slice(0, ks), function (w) { return w.v; }) / ks }, component: srcV(s.series), byGroup: s.byGroup.map(function (g) { return Object.assign({ key: g.key }, srcV(g.series)); }), byFactor: s.byFactor.map(function (f) { return Object.assign({ factorId: f.factorId }, srcV(f.series)); }), specific: srcV(s.specificSeries) });
      });
      out.note = 'Historical: the worst ' + (k === 1 ? 'rolling twelve months' : k + ' rolling twelve-month windows') + ' of the period (' + tot.length + ' windows); components are each source’s return in ' + (k === 1 ? 'that window' : 'those windows');
      return out;
    }
    if (method === 'montecarlo' && Dk && risk.basis === 'exante') {
      var N = Math.min(20000, Math.max(1000, rk.paths || 5000)), draws = mcFactors(model, N), fs = model.factors, rngS = U.rng(U.hash('chain-mc-spec:' + model.id));
      var W = Dk.map(byInstrument), ids = {}; W.forEach(function (w) { Object.keys(w).forEach(function (id) { ids[id] = E.specificOf(model, id); }); });
      var idList = Object.keys(ids), eps = draws.map(function () { var o = {}; idList.forEach(function (id) { o[id] = rngS.normal() * ids[id]; }); return o; });
      var stepDraw = risk.steps.map(function (s, i) {
        var dx = fs.map(function (f) { return U.sum(Object.keys(W[i]), function (id) { return W[i][id] / 100 * betaOf(model, id)[f.id]; }); });
        return draws.map(function (x, d) { var v = s.mu; fs.forEach(function (f, q) { v += dx[q] * x[q]; }); Object.keys(W[i]).forEach(function (id) { v += W[i][id] / 100 * eps[d][id]; }); return v; });
      });
      var totD = draws.map(function (x, d) { return U.sum(stepDraw, function (sd2) { return sd2[d]; }); });
      var order = totD.map(function (v, d) { return { v: v, d: d }; }).sort(function (a, b) { return a.v - b.v; }), kq = Math.max(1, Math.round(N * 0.01)), tail = order.slice(0, kq), band = order.slice(Math.max(0, kq - Math.round(N * 0.002)), kq + Math.round(N * 0.002));
      out.total = { var99: -order[kq - 1].v, es99: -U.sum(tail, function (x) { return x.v; }) / kq };
      risk.steps.forEach(function (s, i) {
        var sv = stepDraw[i].slice().sort(function (a, b) { return a - b; });
        out.steps.push({ id: s.id, standalone: { var99: -sv[kq - 1], es99: -U.sum(sv.slice(0, kq)) / kq }, component: { var99: -U.sum(band, function (x) { return stepDraw[i][x.d]; }) / band.length, es99: -U.sum(tail, function (x) { return stepDraw[i][x.d]; }) / kq } });
      });
      out.paths = N; out.note = 'Monte Carlo: ' + N.toLocaleString('en-US') + ' seeded one-year draws from the ' + model.name + ' factor model, factor shocks fat-tailed (Student-t, 5 degrees of freedom), specific shocks normal; components are each step’s average return in the draws at (VaR) or beyond (ES) the 1% quantile of the whole chain';
      return out;
    }
    var pv = function (te, mu) { return { var99: Z99 * te - mu, es99: ES99 * te - mu }; };
    out.total = pv(risk.total, risk.muTotal);
    risk.steps.forEach(function (s) { out.steps.push({ id: s.id, standalone: pv(s.te, s.mu), component: pv(s.contribution, s.mu) }); });
    out.note = 'Parametric (normal): 99% one-year value at risk is 2.33 × tracking error less the expected active return; expected shortfall 2.67 × tracking error less it' + (method !== 'parametric' ? '. ' + (method === 'historical' ? 'Historical VaR needs ex-post risk' : 'Monte Carlo needs ex-ante risk') + ', so the parametric figures are shown' : '');
    if (method !== 'parametric') out.fallback = method;
    return out;
  }
  /** Periods for the Over time view: linked cells per step (and per row of each step), by year or month, or rolling 36-month lines. */
  function overTime(hist, months, mS, decs, gran, ord) {
    if (gran === 'rolling36') {
      var lines = hist.steps.map(function (s) { var lo = mS[s.lowerMask], up = mS[s.upperMask], o = []; for (var j = 0; j < lo.length; j++) { if (j < 35) { o.push(null); continue; } var gL = 1, gU = 1; for (var q = j - 35; q <= j; q++) { gL *= 1 + lo[q]; gU *= 1 + up[q]; } o.push((Math.pow(gL, 1 / 3) - Math.pow(gU, 1 / 3)) * 100); } return o; });
      return { kind: 'rolling', months: months, lines: lines };
    }
    if (!hist.steps[0].cells) return { kind: 'none', reason: 'The Over time view needs a linking method: with no linking, effects are annualised over the whole period' };
    var keys = [], labels = [];
    if (gran === 'months') months.forEach(function (mo, j) { keys.push([j]); labels.push(mo); });
    else { var byY = {}; months.forEach(function (mo, j) { var y = mo.slice(0, 4); if (!byY[y]) { byY[y] = []; labels.push(y); keys.push(byY[y]); } byY[y].push(j); }); }
    var sumOver = function (arr) { return keys.map(function (k) { return U.sum(k, function (j) { return arr[j]; }); }); };
    return { kind: 'cells', periods: labels, partial: gran === 'years' ? keys.map(function (k) { return k.length < 12; }) : null, steps: hist.steps.map(function (s) { var rows = {}; Object.keys(s.cells.rows).forEach(function (r) { rows[r] = sumOver(s.cells.rows[r]); }); var fac = {}; Object.keys(s.cells.factors).forEach(function (f) { fac[f] = sumOver(s.cells.factors[f]); }); return { id: s.meta.id, total: sumOver(s.cells.total), rows: rows, factors: fac, specific: sumOver(s.cells.specific), drift: sumOver(s.cells.drift), cumulative: s.cumulative }; }) };
  }
  /** The reconcile ledger: each identity with both sides and the difference. */
  function ties(out, geo) {
    var list = [], tol = 0.005;
    ['forward', 'historical'].forEach(function (b) {
      var x = out[b]; if (!x || x.reason || !x.steps) return;
      var lv = x.levelReturns, first = lv[0], last = lv[lv.length - 1], tag = b === 'forward' ? 'Fwd' : 'Hist';
      var lhs = geo ? ((1 + first / 100) * x.steps.reduce(function (p, s) { return p * (1 + s.total / 100); }, 1) - 1) * 100 : first + U.sum(x.steps, function (s) { return s.total; });
      list.push({ id: b + ':chain', basis: b, label: 'Policy benchmark ' + (geo ? 'compounded with' : 'plus') + ' the ' + (x.steps.length === 1 ? 'decision' : x.steps.length + ' decisions') + ' = portfolio', lhs: lhs, rhs: last, diff: lhs - last, tag: tag, kind: 'return' });
      x.steps.forEach(function (s) {
        var asset = U.sum(s.byGroup, function (r) { return r.total; }) + (s.drift || 0), f = s.factor, fac = f.factorTotal + f.cash + f.specific + (f.drift || 0) + (f.notReconciled || 0);
        list.push({ id: b + ':' + s.meta.id + ':asset', basis: b, label: s.meta.label + ': rows add up to the decision', lhs: asset, rhs: s.total, diff: asset - s.total, tag: tag, kind: 'return' });
        list.push({ id: b + ':' + s.meta.id + ':factor', basis: b, label: s.meta.label + ': factors + cash + specific' + (f.drift ? ' + ' + (s.driftLabel || 'drift').toLowerCase() : '') + ' add up to the decision', lhs: fac - (f.notReconciled || 0), rhs: s.total, diff: fac - (f.notReconciled || 0) - s.total, tag: tag, kind: 'return', reason: f.notReconciled ? f.reconcileReason : null });
      });
      var r = x.risk; if (r) {
        var sq = U.sum(r.steps, function (s) { return s.te * s.te; });
        list.push({ id: b + ':risk:quad', basis: b, label: 'Tracking error² = each decision’s tracking error² + cross term', lhs: r.total * r.total, rhs: sq + r.cross, diff: r.total * r.total - sq - r.cross, tag: tag, kind: 'risk', unit: '%²' });
        var se = U.sum(r.steps, function (s) { return s.contribution; });
        list.push({ id: b + ':risk:euler', basis: b, label: 'Contributions to tracking error add up to tracking error', lhs: se, rhs: r.total, diff: se - r.total, tag: tag, kind: 'risk' });
        r.steps.forEach(function (s, i) {
          var gsum = U.sum(s.byGroup, function (g) { return g.euler; }), fsum = U.sum(s.byFactor, function (g) { return g.euler; }) + (s.specific || 0) + (s.cash || 0) + (s.drift || 0);
          list.push({ id: b + ':risk:' + s.id + ':g', basis: b, label: x.steps[i].meta.label + ': risk by group adds up to its tracking error', lhs: gsum, rhs: s.te, diff: gsum - s.te, tag: tag, kind: 'risk' });
          list.push({ id: b + ':risk:' + s.id + ':f', basis: b, label: x.steps[i].meta.label + ': risk by factor + specific adds up to its tracking error', lhs: fsum, rhs: s.te, diff: fsum - s.te, tag: tag, kind: 'risk' });
        });
      }
    });
    list.forEach(function (t) { t.within = Math.abs(t.diff) <= (t.unit === '%²' ? 0.01 : tol); t.explained = !t.within && !!t.reason; t.ok = t.within || t.explained; });
    return { tolerance: tol, list: list };
  }
})();

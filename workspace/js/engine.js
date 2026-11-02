/* ─────────────────────────────────────────────────────────────────────────
   Portfolio Analytics · mock analytics engine
   The stand-in for the analytics service. It takes arbitrary weights and
   returns the figures the cards show. It is reached ONLY through PA.api
   (js/api.js) so a backend can replace it without touching the UI.

   Conventions the UI relies on (a backend must keep them):
   - weights are percentages of the total portfolio; sums need not be 100
   - a category has a target weight; products implement it; the unimplemented
     remainder is modelled by the category's index basket ("index level")
   - unallocated weight earns nothing and carries no risk; it is never
     treated as cash unless a cash instrument is held
   - a null value means "unavailable" and carries a reason; 0 means zero
   - rows are keyed: '<categoryId>', '<categoryId>/<instrumentId>',
     '<categoryId>/__index', '__residual', '__total'
   ───────────────────────────────────────────────────────────────────────── */
(function () {
  'use strict';
  var PA = window.PA, U = PA.util, D = PA.data;
  var E = PA.engine = {};

  /* ── assumption sets ─────────────────────────────────────────────── */
  /**
   * Resolve the effective assumptions for a scenario.
   * Precedence (highest first): holding override → asset-class override →
   * factor-derived value. Vol: holding → asset class → platform.
   */
  E.resolve = function (scenario) {
    var A = D.assumptions, ov = scenario ? scenario.overrides : null;
    var premiums = {};
    A.factors.forEach(function (f) {
      var o = ov && ov.factor[f.id];
      premiums[f.id] = { value: o && o.premium != null ? o.premium : f.premium, base: f.premium, overridden: !!(o && o.premium != null) };
    });
    var acReturn = {}, acVol = {};
    A.order.forEach(function (id) {
      var ac = A.assetClasses[id];
      var derived = A.riskFree + ac.alpha, baseDerived = A.riskFree + ac.alpha;
      A.factors.forEach(function (f) { derived += ac.betas[f.id] * premiums[f.id].value; baseDerived += ac.betas[f.id] * f.premium; });
      var o = ov && ov.assetClass[id];
      var anyFactor = A.factors.some(function (f) { return premiums[f.id].overridden && ac.betas[f.id] !== 0; });
      acReturn[id] = o && o.return != null ? { value: o.return, base: baseDerived, source: 'assetClass' } : { value: derived, base: baseDerived, source: anyFactor ? 'factor' : 'model' };
      acVol[id] = o && o.vol != null ? { value: o.vol, base: ac.vol, source: 'assetClass' } : { value: ac.vol, base: ac.vol, source: 'model' };
    });
    var ret = {}, vol = {};
    D.instruments.forEach(function (ins) {
      var o = ov && ov.holding[ins.id];
      var acr = acReturn[ins.assetClass], acv = acVol[ins.assetClass];
      var alphaAdj = ins.type === 'Index' ? 0 : -(ins.fee || 0) / 100;
      ret[ins.id] = o && o.return != null ? { value: o.return, base: acr.base + alphaAdj, source: 'holding' } : { value: acr.value + alphaAdj, base: acr.base + alphaAdj, source: acr.source };
      vol[ins.id] = o && o.vol != null ? { value: o.vol, base: acv.base, source: 'holding' } : { value: acv.value, base: acv.base, source: acv.source };
    });
    var corr = A.correlation.map(function (r) { return r.slice(); });
    var idx = {}; A.order.forEach(function (id, i) { idx[id] = i; });
    if (ov) Object.keys(ov.correlation).forEach(function (key) {
      var p = key.split('|'), a = idx[p[0]], b = idx[p[1]], v = ov.correlation[key];
      if (a == null || b == null || a === b) return;
      corr[a][b] = v; corr[b][a] = v;
    });
    return { premiums: premiums, acReturn: acReturn, acVol: acVol, ret: ret, vol: vol, corr: corr, corrValid: U.mat.isPSD(corr), idx: idx };
  };

  /* ── structure: portfolio → category → product ───────────────────── */
  E.categoryOf = function (instrumentId) { var c = D.categoryOf(instrumentId); return c ? c.id : null; };
  E.productsIn = function (allocation, categoryId) { return (allocation.holdings || []).filter(function (h) { return E.categoryOf(h.instrumentId) === categoryId; }); };

  /** Category target weights. Allocations without explicit targets (benchmarks) use their product sums. */
  E.categoryTargets = function (allocation) {
    var t = {};
    D.categories.forEach(function (c) {
      var sum = U.sum(E.productsIn(allocation, c.id), function (h) { return h.weight; });
      t[c.id] = allocation.categories && allocation.categories[c.id] != null ? allocation.categories[c.id] : U.round(sum, 4);
    });
    return t;
  };

  /**
   * Effective holdings: the products plus, for every category whose target
   * exceeds its products, virtual holdings of the category's index basket
   * standing in for the unimplemented remainder.
   */
  E.effective = function (allocation) {
    var out = (allocation.holdings || []).slice(), t = E.categoryTargets(allocation);
    D.categories.forEach(function (c) {
      var impl = U.sum(E.productsIn(allocation, c.id), function (h) { return h.weight; });
      var rem = U.round(t[c.id] - impl, 4);
      if (rem <= 1e-9) return;
      var tot = U.sum(c.index, function (p) { return p[1]; });
      c.index.forEach(function (p) { out.push({ id: '__ix_' + c.id + '_' + p[0], instrumentId: p[0], weight: U.round(rem * p[1] / tot, 4), virtual: true, categoryId: c.id }); });
    });
    return out;
  };

  /** The builder's view of one allocation. */
  E.tree = function (allocation) {
    var t = E.categoryTargets(allocation);
    return D.categories.map(function (c) {
      var products = E.productsIn(allocation, c.id), impl = U.round(U.sum(products, function (h) { return h.weight; }), 4);
      var refs = products.map(function (h) { return h.sleeveRef ? h.sleeveRef.sleeveId + '@' + h.sleeveRef.version : null; });
      var sleeveRef = products.length && refs.every(function (r) { return r && r === refs[0]; }) ? products[0].sleeveRef : null;
      return { id: c.id, name: c.name, short: c.short, color: c.color, target: t[c.id], products: products, implemented: impl, remainder: U.round(t[c.id] - impl, 4), over: impl > t[c.id] + 1e-9, sleeveRef: sleeveRef };
    });
  };
  /** Σ over categories of max(target, products): what the portfolio has committed. */
  E.allocated = function (allocation) { var t = E.categoryTargets(allocation); return U.round(U.sum(D.categories, function (c) { return Math.max(t[c.id], U.sum(E.productsIn(allocation, c.id), function (h) { return h.weight; })); }), 4); };
  E.gross = function (allocation) { return U.sum(E.effective(allocation), function (h) { return Math.abs(h.weight); }); };
  E.net = function (allocation) { return U.sum(E.effective(allocation), function (h) { return h.weight; }); };

  /** The union of rows across several allocations, in display order. */
  E.rows = function (allocations) {
    var rows = [];
    D.categories.forEach(function (c) {
      var ids = [], anyIndex = false, any = false;
      allocations.forEach(function (a) {
        var t = E.categoryTargets(a)[c.id], ps = E.productsIn(a, c.id);
        if (t > 1e-9 || ps.length) any = true;
        ps.forEach(function (h) { if (ids.indexOf(h.instrumentId) < 0) ids.push(h.instrumentId); });
        if (t - U.sum(ps, function (h) { return h.weight; }) > 1e-9) anyIndex = true;
      });
      if (!any) return;
      rows.push({ key: c.id, label: c.name, depth: 0, kind: 'category', parent: null, categoryId: c.id, hasChildren: ids.length > 0 || anyIndex });
      ids.forEach(function (iid) { var ins = D.instrumentById[iid]; rows.push({ key: c.id + '/' + iid, label: ins.name, depth: 1, kind: 'holding', parent: c.id, categoryId: c.id, instrumentId: iid, instrument: ins }); });
      if (anyIndex) rows.push({ key: c.id + '/__index', label: c.short + ' Index', depth: 1, kind: 'index', parent: c.id, categoryId: c.id, note: 'The unimplemented part of the category, modelled by its index basket: ' + c.index.map(function (p) { return D.instrumentById[p[0]].name + ' ' + p[1] + '%'; }).join(', ') });
    });
    rows.push({ key: '__residual', label: 'Unallocated', depth: 0, kind: 'residual', parent: null });
    rows.push({ key: '__total', label: 'Portfolio total', depth: 0, kind: 'total', parent: null });
    return rows;
  };

  /** Effective holdings of an allocation that belong to a row key. */
  E.holdingsFor = function (allocation, key, effective) {
    var hs = effective || E.effective(allocation);
    if (key === '__total') return hs;
    if (key === '__residual') return [];
    var p = key.split('/');
    if (p.length === 1) return hs.filter(function (h) { return (h.virtual ? h.categoryId : E.categoryOf(h.instrumentId)) === p[0]; });
    if (p[1] === '__index') return hs.filter(function (h) { return h.virtual && h.categoryId === p[0]; });
    return hs.filter(function (h) { return !h.virtual && h.instrumentId === p[1] && E.categoryOf(h.instrumentId) === p[0]; });
  };

  /* ── sleeves ─────────────────────────────────────────────────────── */
  /** Rescale a product list so the weights sum to 100 (two decimals, rounding error on the largest). */
  E.sleeveHoldings = function (holdings) {
    var tot = U.sum(holdings, function (h) { return h.weight; });
    if (Math.abs(tot) < 1e-9) return holdings.map(function (h) { return { instrumentId: h.instrumentId, weight: U.round(100 / holdings.length, 2) }; });
    var out = holdings.map(function (h) { return { instrumentId: h.instrumentId, weight: U.round(h.weight / tot * 100, 2) }; });
    var diff = U.round(100 - U.sum(out, function (h) { return h.weight; }), 2);
    if (Math.abs(diff) > 1e-9) { var big = out.reduce(function (m, h) { return h.weight > m.weight ? h : m; }, out[0]); big.weight = U.round(big.weight + diff, 2); }
    return out;
  };
  /** Categories a product list spans. */
  E.categoriesOf = function (holdings) { var seen = {}; holdings.forEach(function (h) { var c = E.categoryOf(h.instrumentId); if (c) seen[c] = true; }); return Object.keys(seen); };
  /**
   * Apply a sleeve version to a category. mode 'fill' replaces the category's
   * products at the category target; 'remainder' adds the sleeve at the
   * unimplemented remainder and keeps existing products.
   */
  E.applySleeve = function (allocation, categoryId, sleeve, version, mode) {
    var t = E.categoryTargets(allocation)[categoryId];
    var existing = E.productsIn(allocation, categoryId);
    var scale = mode === 'remainder' ? Math.max(0, t - U.sum(existing, function (h) { return h.weight; })) : t;
    var next = (allocation.holdings || []).filter(function (h) { return mode === 'remainder' || E.categoryOf(h.instrumentId) !== categoryId; });
    version.holdings.forEach(function (sh) {
      var w = U.round(sh.weight / 100 * scale, 2);
      var ex = next.filter(function (h) { return h.instrumentId === sh.instrumentId; })[0];
      var ref = { sleeveId: sleeve.id, version: version.v, name: sleeve.name };
      if (ex) { ex.weight = U.round(ex.weight + w, 2); ex.sleeveRef = ref; }
      else next.push({ id: U.uid('h'), instrumentId: sh.instrumentId, weight: w, sleeveRef: ref });
    });
    return next;
  };

  /* ── forward-looking metrics ─────────────────────────────────────── */
  function covariance(holdings, R) {
    var n = holdings.length, S = [];
    for (var i = 0; i < n; i++) {
      S.push([]);
      var ii = D.instrumentById[holdings[i].instrumentId], ai = R.idx[ii.assetClass], si = R.vol[ii.id].value;
      for (var j = 0; j < n; j++) {
        var ij = D.instrumentById[holdings[j].instrumentId], aj = R.idx[ij.assetClass], sj = R.vol[ij.id].value;
        var rho = i === j ? 1 : (ii.assetClass === ij.assetClass ? (ii.type === 'Index' || ij.type === 'Index' ? 0.97 : 0.9) : R.corr[ai][aj]);
        S[i].push(rho * si * sj);
      }
    }
    return S;
  }

  /** Forward-looking figures for one allocation under resolved assumptions. */
  E.forward = function (allocation, R, rows) {
    var hs = E.effective(allocation);
    if (!R.corrValid) return { error: 'invalid_covariance' };
    var w = hs.map(function (h) { return h.weight / 100; });
    var S = covariance(hs, R), Sw = U.mat.mulVec(S, w), variance = U.mat.dot(w, Sw), vol = Math.sqrt(Math.max(variance, 0));
    var contrib = w.map(function (wi, i) { return vol > 0 ? wi * Sw[i] / vol : 0; });
    var byId = {}; hs.forEach(function (h, i) { byId[h.id] = contrib[i]; });
    var out = { rows: {}, portfolio: { vol: vol, ret: U.sum(hs, function (h) { return h.weight / 100 * R.ret[h.instrumentId].value; }), allocated: E.allocated(allocation) } };
    rows.forEach(function (row) {
      if (row.kind === 'residual') { var res = U.round(100 - E.allocated(allocation), 4); out.rows[row.key] = { weight: res, ret: 0, riskShare: 0, riskVol: 0, beta: null, note: res < 0 ? 'Borrowing: net allocation above 100%' : 'Unallocated weight earns nothing and carries no risk' }; return; }
      var list = E.holdingsFor(allocation, row.key, hs);
      var weight = U.sum(list, function (h) { return h.weight; });
      var ret = U.sum(list, function (h) { return h.weight / 100 * R.ret[h.instrumentId].value; });
      var rv = U.sum(list, function (h) { return byId[h.id]; });
      var share = vol > 0 ? rv / vol * 100 : null;
      var beta = {};
      D.factors.forEach(function (f) {
        if (!list.length || Math.abs(weight) < 1e-9) { beta[f.id] = null; return; }
        var s = 0; list.forEach(function (h) { s += h.weight * D.assumptions.assetClasses[D.instrumentById[h.instrumentId].assetClass].betas[f.id]; });
        beta[f.id] = row.kind === 'total' ? s / 100 : s / weight;
      });
      out.rows[row.key] = { weight: weight, ret: ret, riskShare: share, riskVol: rv, beta: beta, held: list.length > 0, note: row.kind === 'index' && list.length ? 'Index-modelled remainder' : null };
    });
    return out;
  };

  /* ── history ─────────────────────────────────────────────────────── */
  var Hx = function () { return D.history; };
  E.monthIndex = function (ym) { return U.ym.diff(Hx().start, ym); };

  E.holdingSeries = function (instrumentId) {
    var ins = D.instrumentById[instrumentId], H = Hx(), own = H.instrument[instrumentId] || [];
    if (ins.coverage === 'none') return { series: H.months.map(function () { return null; }), coverage: 'none', note: ins.proxyNote || 'No return history' };
    if (ins.coverage !== 'proxy') return { series: own, coverage: 'full', note: null };
    var ac = D.assetClassById[ins.assetClass], proxy = H.instrument[ac.indexId] || [];
    return { series: own.map(function (v, i) { return v == null ? proxy[i] : v; }), coverage: 'proxy', note: ins.proxyNote, proxyUntil: ins.inception };
  };
  E.coverageStart = function (allocation) {
    var H = Hx(), best = null;
    E.effective(allocation).forEach(function (h) {
      var s = E.holdingSeries(h.instrumentId); if (s.coverage === 'none') return;
      var first = s.series.findIndex(function (v) { return v != null; }); if (first < 0) return;
      best = best == null ? first : Math.max(best, first);
    });
    return best == null ? H.start : H.months[best];
  };
  E.historyBasis = function (allocation) {
    var covStart = E.coverageStart(allocation);
    if (allocation.kind !== 'snapshot' && allocation.history && allocation.history.basis === 'actual' && !allocation.edited)
      return { basis: 'actual', label: 'Actual history', start: U.ym.max(allocation.history.inception, covStart), detail: 'Position history since ' + U.fmt.month(allocation.history.inception) };
    if (allocation.history && allocation.history.basis === 'actual' && allocation.edited)
      return { basis: 'edited', label: 'Edited · current-weight backtest', start: covStart, detail: 'Weights changed in this draft; the actual track record stays available in the chart', actualStart: allocation.history.inception };
    return { basis: 'backtest', label: 'Current-weight backtest', start: covStart, detail: 'Current weights, rebalanced quarterly' };
  };

  /** Backtest a holding list with quarterly rebalancing to the given weights. */
  E.backtest = function (holdings, from, to) {
    var i0 = E.monthIndex(from), i1 = E.monthIndex(to);
    var parts = holdings.map(function (h) { return { w: h.weight, instrumentId: h.instrumentId, s: E.holdingSeries(h.instrumentId) }; });
    var usable = parts.filter(function (p) { return p.s.coverage !== 'none'; });
    var excluded = parts.filter(function (p) { return p.s.coverage === 'none'; }).map(function (p) { return { instrumentId: p.instrumentId, weight: p.w, note: p.s.note }; });
    var W = U.sum(usable, function (p) { return p.w; }), out = [], values = usable.map(function (p) { return p.w; });
    for (var m = i0; m <= i1; m++) {
      var any = false, tot = 0, newTot = 0;
      for (var k = 0; k < usable.length; k++) {
        var r = usable[k].s.series[m];
        if (r == null) { newTot += values[k]; tot += values[k]; continue; }
        any = true; tot += values[k]; values[k] = values[k] * (1 + r); newTot += values[k];
      }
      if (!any || tot === 0) { out.push(null); continue; }
      out.push(newTot / tot - 1);
      if ((m + 1) % 3 === 0) { for (var k2 = 0; k2 < usable.length; k2++) values[k2] = W ? usable[k2].w / W * newTot : 0; }
    }
    return { returns: out, coverage: { included: U.sum(usable, function (p) { return Math.abs(p.w); }), excluded: excluded, proxied: usable.filter(function (p) { return p.s.coverage === 'proxy'; }).map(function (p) { return { instrumentId: p.instrumentId, weight: p.w, note: p.s.note }; }) } };
  };
  /** A simulated "actual" track record: the backtest plus a small, seeded tracking difference. */
  E.actualSeries = function (allocation, holdings, from, to) {
    var bt = E.backtest(holdings, from, to), r = U.rng(U.hash(allocation.id + 'actual'));
    bt.returns = bt.returns.map(function (v) { return v == null ? null : v + r.normal() * 0.0035; });
    return bt;
  };

  /** Historical table figures for one allocation over a period. */
  E.historical = function (allocation, rows, from, to) {
    var i0 = E.monthIndex(from), i1 = E.monthIndex(to), hs = E.effective(allocation), stats = {};
    hs.forEach(function (h) {
      var s = E.holdingSeries(h.instrumentId), seg = s.series.slice(i0, i1 + 1), clean = seg.filter(function (v) { return v != null; });
      stats[h.id] = { ret: clean.length >= 6 ? U.stats.annualizedReturn(clean) * 100 : null, seg: seg, coverage: s.coverage, note: s.note, obs: clean.length };
    });
    var usable = hs.filter(function (h) { return stats[h.id].obs >= 12; }), n = usable.length, means = [], S = [];
    usable.forEach(function (h) { var c = stats[h.id].seg.filter(function (v) { return v != null; }); means.push(U.sum(c) / c.length); });
    for (var i = 0; i < n; i++) { S.push([]); for (var j = 0; j < n; j++) { var a = stats[usable[i].id].seg, b = stats[usable[j].id].seg, s = 0, cnt = 0; for (var m = 0; m < a.length; m++) { if (a[m] == null || b[m] == null) continue; s += (a[m] - means[i]) * (b[m] - means[j]); cnt++; } S[i].push(cnt > 2 ? s / (cnt - 1) * 12 * 10000 : 0); } }
    var w = usable.map(function (h) { return h.weight / 100; }), Sw = U.mat.mulVec(S, w), vol = Math.sqrt(Math.max(U.mat.dot(w, Sw), 0)), contrib = {};
    usable.forEach(function (h, i) { contrib[h.id] = vol > 0 ? w[i] * Sw[i] / vol : 0; });
    var out = { rows: {}, portfolio: { vol: vol } };
    rows.forEach(function (row) {
      if (row.kind === 'residual') { out.rows[row.key] = { weight: U.round(100 - E.allocated(allocation), 4), ret: 0, riskShare: 0, riskVol: 0, beta: null }; return; }
      var list = E.holdingsFor(allocation, row.key, hs), weight = U.sum(list, function (h) { return h.weight; });
      var missing = list.filter(function (h) { return stats[h.id].ret == null; }), covered = list.filter(function (h) { return stats[h.id].ret != null; });
      var ret = null, reason = null, notes = [];
      if (list.length && covered.length) { ret = U.sum(covered, function (h) { return h.weight / 100 * stats[h.id].ret; }); if (missing.length) notes.push('Excludes ' + missing.map(function (h) { return D.instrumentById[h.instrumentId].name + ' (' + U.fmt.num(h.weight) + '%)'; }).join(', ') + ': ' + (stats[missing[0].id].note || 'no history in this period')); }
      else if (list.length) reason = stats[missing[0].id].note || 'History unavailable for this period';
      if (!list.length && row.kind !== 'total') ret = 0;
      var rv = U.sum(list.filter(function (h) { return contrib[h.id] != null; }), function (h) { return contrib[h.id]; }), share = vol > 0 ? rv / vol * 100 : null;
      var beta = {};
      D.factors.forEach(function (f) {
        if (!list.length || Math.abs(weight) < 1e-9) { beta[f.id] = null; return; }
        var s2 = 0, r2 = U.rng(U.hash(row.key + f.id + from));
        list.forEach(function (h) { s2 += h.weight * D.assumptions.assetClasses[D.instrumentById[h.instrumentId].assetClass].betas[f.id] * (1 + r2.normal() * 0.08); });
        beta[f.id] = row.kind === 'total' ? s2 / 100 : s2 / weight;
      });
      var proxied = list.filter(function (h) { return stats[h.id].coverage === 'proxy'; });
      if (proxied.length) notes.push(proxied.map(function (h) { return D.instrumentById[h.instrumentId].name + ': ' + stats[h.id].note; }).join('; '));
      var allMissing = missing.length && missing.length === list.length;
      out.rows[row.key] = { weight: weight, ret: ret, reason: reason, riskShare: allMissing ? null : share, riskVol: allMissing ? null : rv, beta: beta, held: list.length > 0, coverageNote: notes.length ? notes.join(' · ') : null, note: row.kind === 'index' && list.length ? 'Index-modelled remainder' : null };
    });
    return out;
  };

  /** Monthly portfolio (or row) returns over a period, with the right basis. */
  E.rowReturns = function (allocation, rowKey, from, to) {
    var hb = E.historyBasis(allocation), list = E.holdingsFor(allocation, rowKey);
    if (!list.length) return null;
    var bt = hb.basis === 'actual' ? E.actualSeries(allocation, list, from, to) : E.backtest(list, from, to);
    if (bt.returns.every(function (v) { return v == null; })) return null;
    var actual = null;
    if (hb.basis === 'edited') { var a = E.actualSeries(allocation, list, U.ym.max(hb.actualStart, from), to); var off = U.ym.diff(from, U.ym.max(hb.actualStart, from)); actual = bt.returns.map(function () { return null; }); a.returns.forEach(function (v, i) { actual[off + i] = v; }); }
    return { returns: bt.returns, actual: actual, coverage: bt.coverage, basis: hb };
  };
  E.growthOf = function (returns) { var out = [], v = 100; for (var i = 0; i < returns.length; i++) { if (returns[i] == null) { out.push(null); continue; } v *= 1 + returns[i]; out.push(v); } return out; };
  E.growthSeries = function (allocation, rowKey, from, to) { var r = E.rowReturns(allocation, rowKey, from, to); return r ? { values: E.growthOf(r.returns), actual: r.actual ? E.growthOf(r.actual.map(function (v) { return v == null ? null : v; })) : null, coverage: r.coverage } : null; };
  E.rollingVol = function (allocation, rowKey, from, to) {
    var win = 36, r = E.rowReturns(allocation, rowKey, U.ym.add(from, -win + 1), to); if (!r) return null;
    var out = []; for (var i = win - 1; i < r.returns.length; i++) { var seg = r.returns.slice(i - win + 1, i + 1); out.push(seg.some(function (v) { return v == null; }) ? null : U.stats.annualizedVol(seg) * 100); }
    return { values: out };
  };

  /* ── derived history statistics (for the performance cards) ─────── */
  E.underwater = function (growth) { var peak = -Infinity; return growth.map(function (g) { if (g == null) return null; peak = Math.max(peak, g); return (g / peak - 1) * 100; }); };
  /** Peak-to-trough episodes, deepest first. */
  E.drawdowns = function (growth, months, limit) {
    var episodes = [], peakI = null, troughI = null, peakV = -Infinity;
    for (var i = 0; i < growth.length; i++) {
      var g = growth[i]; if (g == null) continue;
      if (g >= peakV) {
        if (troughI != null && troughI !== peakI) episodes.push({ peak: months[peakI], trough: months[troughI], recovery: months[i], depth: (growth[troughI] / peakV - 1) * 100, length: troughI - peakI, recoveryMonths: i - troughI });
        peakV = g; peakI = i; troughI = null;
      } else if (troughI == null || g < growth[troughI]) troughI = i;
    }
    if (troughI != null) episodes.push({ peak: months[peakI], trough: months[troughI], recovery: null, depth: (growth[troughI] / peakV - 1) * 100, length: troughI - peakI, recoveryMonths: null });
    episodes.sort(function (a, b) { return a.depth - b.depth; });
    return episodes.slice(0, limit || 5);
  };
  E.statsOf = function (returns, months) {
    var clean = returns.filter(function (v) { return v != null; }); if (clean.length < 3) return null;
    var g = E.growthOf(returns), best = null, worst = null;
    returns.forEach(function (v, i) { if (v == null) return; if (!best || v > best.r) best = { m: months[i], r: v * 100 }; if (!worst || v < worst.r) worst = { m: months[i], r: v * 100 }; });
    var ann = U.stats.annualizedReturn(clean) * 100, vol = U.stats.annualizedVol(clean) * 100;
    return { annReturn: ann, vol: vol, sharpe: vol > 0 ? (ann - D.assumptions.riskFree) / vol : null, maxDrawdown: U.stats.maxDrawdown(g.filter(function (v) { return v != null; })) * 100, bestMonth: best, worstMonth: worst, positive: clean.filter(function (v) { return v > 0; }).length / clean.length * 100, months: clean.length, cumulative: (g.filter(function (v) { return v != null; }).pop() / 100 - 1) * 100 };
  };
  E.calendarYears = function (returns, months) {
    var out = {}, years = [];
    months.forEach(function (m, i) { var y = m.slice(0, 4); if (!out[y]) { out[y] = { g: 1, n: 0, full: 0 }; years.push(y); } if (returns[i] != null) { out[y].g *= 1 + returns[i]; out[y].n++; } out[y].full++; });
    return years.map(function (y) { return { year: y, ret: out[y].n ? (out[y].g - 1) * 100 : null, partial: out[y].full < 12 || out[y].n < out[y].full }; });
  };
  E.stressPeriods = [
    { id: 'early2016', name: 'Early-2016 selloff', start: '2016-01', end: '2016-02' },
    { id: 'q42018', name: 'Q4 2018 drawdown', start: '2018-10', end: '2018-12' },
    { id: 'covid', name: 'COVID shock', start: '2020-02', end: '2020-03' },
    { id: 'rates2022', name: '2022 rates shock', start: '2022-01', end: '2022-10' },
    { id: 'spring2025', name: 'Spring 2025 selloff', start: '2025-03', end: '2025-04' }
  ];
  E.stressReturns = function (returns, months) {
    return E.stressPeriods.map(function (p) {
      var g = 1, any = false, missing = false;
      months.forEach(function (m, i) { if (U.ym.toIndex(m) < U.ym.toIndex(p.start) || U.ym.toIndex(m) > U.ym.toIndex(p.end)) return; if (returns[i] == null) { missing = true; return; } any = true; g *= 1 + returns[i]; });
      var covered = U.ym.toIndex(months[0]) <= U.ym.toIndex(p.start) && U.ym.toIndex(months[months.length - 1]) >= U.ym.toIndex(p.end);
      return { id: p.id, ret: any && covered && !missing ? (g - 1) * 100 : null, reason: !covered ? 'Outside the selected period' : missing ? 'History incomplete in the window' : null };
    });
  };
  E.rolling = function (returns, win, kind) {
    return returns.map(function (v, i) { if (i < win - 1) return null; var seg = returns.slice(i - win + 1, i + 1); if (seg.some(function (x) { return x == null; })) return null; return kind === 'vol' ? U.stats.annualizedVol(seg) * 100 : U.stats.annualizedReturn(seg) * 100; });
  };
  E.correlationMatrix = function (seriesList) {
    var n = seriesList.length, out = [];
    for (var i = 0; i < n; i++) { out.push([]); for (var j = 0; j < n; j++) {
      var a = seriesList[i], b = seriesList[j], xs = [], ys = [];
      if (!a || !b) { out[i].push(null); continue; }
      for (var m = 0; m < a.length; m++) if (a[m] != null && b[m] != null) { xs.push(a[m]); ys.push(b[m]); }
      if (xs.length < 12) { out[i].push(null); continue; }
      var ma = U.sum(xs) / xs.length, mb = U.sum(ys) / ys.length, sab = 0, saa = 0, sbb = 0;
      for (var k = 0; k < xs.length; k++) { sab += (xs[k] - ma) * (ys[k] - mb); saa += (xs[k] - ma) * (xs[k] - ma); sbb += (ys[k] - mb) * (ys[k] - mb); }
      out[i].push(saa > 0 && sbb > 0 ? sab / Math.sqrt(saa * sbb) : null);
    } }
    return out;
  };

  /* ── projections ─────────────────────────────────────────────────── */
  E.project = function (allocation, rowKey, R, horizon, confidence, basis) {
    var list = E.holdingsFor(allocation, rowKey);
    if (!list.length || !R.corrValid) return null;
    var W = U.sum(list, function (h) { return h.weight; }); if (Math.abs(W) < 1e-9) return null;
    var w = list.map(function (h) { return h.weight / W; }), S = covariance(list, R);
    var vol = Math.sqrt(Math.max(U.mat.dot(w, U.mat.mulVec(S, w)), 0)) / 100, mu = U.sum(list, function (h, i) { return w[i] * R.ret[h.instrumentId].value; }) / 100;
    var m = Math.log(1 + mu) - vol * vol / 2, start = basis === 'contribution' ? W : 100, steps = horizon * 4, years = [], central = [];
    var levels = [{ level: 0.5 }, { level: confidence }]; levels.forEach(function (b) { b.low = []; b.high = []; });
    for (var s = 0; s <= steps; s++) { var t = s / 4; years.push(t); central.push(start * Math.exp(m * t)); levels.forEach(function (b) { var z = U.stats.zFor(0.5 + b.level / 2); b.low.push(start * Math.exp(m * t - z * vol * Math.sqrt(t))); b.high.push(start * Math.exp(m * t + z * vol * Math.sqrt(t))); }); }
    return { years: years, central: central, bands: levels, mu: mu * 100, vol: vol * 100, start: start };
  };
  E.summary = function (allocation, R) {
    var f = E.forward(allocation, R, [{ key: '__total', kind: 'total' }]); if (f.error) return null;
    var t = f.rows.__total; return { ret: t.ret, vol: f.portfolio.vol, sharpe: f.portfolio.vol > 0 ? (t.ret - D.assumptions.riskFree) / f.portfolio.vol : null };
  };
})();

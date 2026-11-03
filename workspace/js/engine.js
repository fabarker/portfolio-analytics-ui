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
      var alphaAdj = (ins.type === 'Index' ? 0 : -(ins.fee || 0) / 100) + (ins.spread || 0);
      if (ins.fit) {
        /* an uploaded product: its beta to its asset class carries the class's
           excess return; its own realised volatility, scaled with the class's */
        var fr = A.riskFree, fv = ins.fit.vol * (acv.base > 0 ? acv.value / acv.base : 1);
        var fBase = fr + ins.fit.beta * (acr.base - fr), fVal = fr + ins.fit.beta * (acr.value - fr);
        ret[ins.id] = o && o.return != null ? { value: o.return, base: fBase, source: 'holding' } : { value: fVal, base: fBase, source: acr.source };
        vol[ins.id] = o && o.vol != null ? { value: o.vol, base: ins.fit.vol, source: 'holding' } : { value: fv, base: ins.fit.vol, source: acv.source };
        return;
      }
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
        /* an uploaded product moves with its asset class only as far as its fit says */
        var q = (ii.fit ? ii.fit.corr : 1) * (ij.fit ? ij.fit.corr : 1);
        var rho = i === j ? 1 : q * (ii.assetClass === ij.assetClass ? (ii.type === 'Index' || ij.type === 'Index' ? 0.97 : 0.9) : R.corr[ai][aj]);
        S[i].push(rho * si * sj);
      }
    }
    return S;
  }
  /** Covariance (%², a year) of a holding list's instruments under resolved assumptions. */
  E.covariance = covariance;

  /** Forward-looking figures for one allocation under resolved assumptions.
      Factor betas come from the chosen factor model (default ISG). */
  E.forward = function (allocation, R, rows, modelId) {
    var model = E.modelOf(modelId);
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
      var beta = {}, loads = list.map(function (h) { return E.loadingsOf(model, h.instrumentId); });
      model.factors.forEach(function (f) {
        if (!list.length || Math.abs(weight) < 1e-9) { beta[f.id] = null; return; }
        var s = 0; list.forEach(function (h, k) { s += h.weight * loads[k][f.id]; });
        beta[f.id] = row.kind === 'total' ? s / 100 : s / weight;
      });
      out.rows[row.key] = { weight: weight, ret: ret, riskShare: share, riskVol: rv, beta: beta, modelNote: E.modelNote(model, list), held: list.length > 0, note: row.kind === 'index' && list.length ? 'Index-modelled remainder' : null };
    });
    return out;
  };

  /* ── factor models ───────────────────────────────────────────────── */
  E.modelOf = function (id) { return D.factorModelById[id] || D.factorModelById.isg; };
  /** null when the model covers the product; else {status:'proxied', note}. */
  E.modelCoverage = function (model, instrumentId) { return model.coverage(D.instrumentById[instrumentId]); };
  /** A product's factor loadings: its asset class, plus its own tilt unless the model proxies it. */
  E.loadingsOf = function (model, instrumentId) {
    var ins = D.instrumentById[instrumentId], base = model.loadings[ins.assetClass] || {}, tilt = model.coverage(ins) ? null : model.productLoadings[instrumentId], out = {};
    /* an uploaded product carries its asset class's loadings scaled by its beta */
    var k = ins.fit ? ins.fit.beta : 1;
    model.factors.forEach(function (f) { out[f.id] = (base[f.id] || 0) * k + (tilt && tilt[f.id] || 0); });
    return out;
  };
  /** Annual specific (non-factor) volatility, %. A proxied product carries fund-level specific risk.
      An uploaded product's specific risk is whatever its own volatility leaves after its factor risk. */
  E.specificOf = function (model, instrumentId) {
    var ins = D.instrumentById[instrumentId];
    if (ins.fit) {
      var c = ins.fit.specific || (ins.fit.specific = {});
      if (c[model.id] == null) { var F = factorCov(model), b = E.loadingsOf(model, instrumentId), x = model.factors.map(function (f) { return b[f.id]; }), fv = U.mat.dot(x, U.mat.mulVec(F, x)); c[model.id] = Math.sqrt(Math.max(ins.fit.vol * ins.fit.vol - fv, Math.pow(ins.fit.vol * 0.15, 2))); }
      return c[model.id];
    }
    var scale = model.coverage(ins) ? model.specificScale.Fund : (model.specificScale[ins.type] || 1); return (model.specificVol[ins.assetClass] || 0) * scale;
  };
  /** Factor covariance (%², a year) of a model, in its factor order. */
  E.factorCov = function (model) { return factorCov(E.modelOf(model && model.id || model)); };
  E.modelNote = function (model, list) {
    var seen = {}, names = [];
    list.forEach(function (h) { if (seen[h.instrumentId]) return; seen[h.instrumentId] = 1; if (model.coverage(D.instrumentById[h.instrumentId])) names.push(D.instrumentById[h.instrumentId].name); });
    return names.length ? 'Proxied by the category index in ' + model.name + ': ' + names.join(', ') : null;
  };
  var covCache = {};
  function factorCov(model) {
    if (covCache[model.id]) return covCache[model.id];
    var F = model.factors.map(function (f, i) { return model.factors.map(function (g, j) { return model.factorCorrelation[i][j] * model.factorVol[f.id] * model.factorVol[g.id]; }); });
    return (covCache[model.id] = F);
  }
  /** Sum weights (%) by instrument; virtual index holdings merge with real holdings of the same index. */
  E.weightsOf = function (holdings) { var w = {}; holdings.forEach(function (h) { w[h.instrumentId] = (w[h.instrumentId] || 0) + h.weight; }); return w; };
  /**
   * Risk of a weight vector {instrumentId: weight %} (weights may be negative:
   * an active portfolio) under a factor model. Variance in %²:
   *   x = Σ wᵢβᵢ,  factor = xᵀFx,  specific = Σ wᵢ²sᵢ².
   * Contributions are Euler (they sum to the total volatility).
   */
  E.modelRisk = function (weights, modelId) {
    var model = E.modelOf(modelId), F = factorCov(model), fs = model.factors, x = fs.map(function () { return 0; }), spec = 0, ids = Object.keys(weights).filter(function (id) { return Math.abs(weights[id]) > 1e-12; });
    var loads = {}; ids.forEach(function (id) { var w = weights[id] / 100, b = loads[id] = E.loadingsOf(model, id); fs.forEach(function (f, k) { x[k] += w * b[f.id]; }); var s = E.specificOf(model, id); spec += w * w * s * s; });
    var Fx = U.mat.mulVec(F, x), fv = U.mat.dot(x, Fx), total = Math.sqrt(Math.max(fv + spec, 0));
    var exposure = {}, byFactor = {}, byInstrument = {};
    fs.forEach(function (f, k) { exposure[f.id] = x[k]; byFactor[f.id] = total > 0 ? x[k] * Fx[k] / total : 0; });
    ids.forEach(function (id) { var w = weights[id] / 100, b = loads[id], s = E.specificOf(model, id), bf = 0; fs.forEach(function (f, k) { bf += b[f.id] * Fx[k]; }); byInstrument[id] = total > 0 ? w * (bf + w * s * s) / total : 0; });
    return { model: model, exposure: exposure, factorVar: fv, specificVar: spec, total: total, byFactor: byFactor, specific: total > 0 ? spec / total : 0, byInstrument: byInstrument };
  };

  /* ── active (versus a benchmark) ─────────────────────────────────── */
  /** Return of a category's index basket under resolved assumptions. */
  function basketReturn(c, retOf) { var tot = U.sum(c.index, function (p) { return p[1]; }); return U.sum(c.index, function (p) { return p[1] / tot * retOf(p[0]); }); }
  /** The groups returns and risk can be attributed to: the rail's categories or the finer asset classes. */
  function groupsFor(by) {
    if (by === 'assetClass') return D.assetClasses.map(function (ac) { var c = D.categoryById[ac.category]; return { id: ac.id, name: ac.name, short: ac.name, color: c.color, of: function (id) { return D.instrumentById[id].assetClass; }, indexReturn: function (retOf) { return retOf(ac.indexId); } }; });
    return D.categories.map(function (c) { return { id: c.id, name: c.name, short: c.short, color: c.color, of: E.categoryOf, indexReturn: function (retOf) { return basketReturn(c, retOf); } }; });
  }
  /**
   * Allocation and selection (Brinson) by category or asset class. Weights in
   * %, returns in % a year. A group the benchmark does not hold is
   * benchmarked by its index. Unallocated weight earns nothing and appears
   * as its own line, so the effects always sum to the active return.
   */
  E.brinson = function (wP, wB, retOf, by) {
    var RB = 0; Object.keys(wB).forEach(function (id) { RB += wB[id] / 100 * retOf(id); });
    var rows = [], sumP = 0, sumB = 0, tA = 0, tS = 0;
    groupsFor(by).forEach(function (g) {
      var inG = function (w) { var W = 0, R = 0; Object.keys(w).forEach(function (id) { if (g.of(id) !== g.id) return; W += w[id] / 100; R += w[id] / 100 * retOf(id); }); return { W: W, R: R }; };
      var p = inG(wP), b = inG(wB); sumP += p.W; sumB += b.W;
      if (Math.abs(p.W) < 1e-9 && Math.abs(b.W) < 1e-9) return;
      var RBc = Math.abs(b.W) > 1e-9 ? b.R / b.W : g.indexReturn(retOf), RPc = Math.abs(p.W) > 1e-9 ? p.R / p.W : RBc;
      var alloc = (p.W - b.W) * (RBc - RB), sel = p.W * (RPc - RBc); tA += alloc; tS += sel;
      rows.push({ key: g.id, label: g.name, short: g.short, color: g.color, weight: p.W * 100, benchWeight: b.W * 100, ret: RPc, benchRet: RBc, allocation: alloc, selection: sel, contribution: alloc + sel });
    });
    var du = (1 - sumP) - (1 - sumB);
    if (Math.abs(du) > 1e-9) { var ua = du * (0 - RB); tA += ua; rows.push({ key: '__residual', label: 'Unallocated', short: 'Unallocated', color: '#c3cedb', weight: (1 - sumP) * 100, benchWeight: (1 - sumB) * 100, ret: 0, benchRet: 0, allocation: ua, selection: 0, contribution: ua }); }
    return { rows: rows, allocation: tA, selection: tS, benchmarkReturn: RB };
  };
  /**
   * Active return by product: each instrument's active weight times its
   * return over the benchmark's, (wP − wB)(r − R_B). Unallocated weight is
   * its own line, so the contributions sum to the active return.
   */
  E.productAttribution = function (wP, wB, retOf) {
    var RB = 0, sumP = 0, sumB = 0, ids = [];
    Object.keys(wB).forEach(function (id) { RB += wB[id] / 100 * retOf(id); sumB += wB[id] / 100; });
    Object.keys(wP).forEach(function (id) { sumP += wP[id] / 100; });
    Object.keys(wP).concat(Object.keys(wB)).forEach(function (id) { if (ids.indexOf(id) < 0) ids.push(id); });
    var rows = ids.map(function (id) {
      var ins = D.instrumentById[id], p = (wP[id] || 0), b = (wB[id] || 0), c = (p - b) / 100 * (retOf(id) - RB);
      return { key: id, label: ins.name + (!p && b ? ' (benchmark only)' : ''), short: ins.name, color: (D.categoryOf(id) || {}).color, weight: p, benchWeight: b, ret: retOf(id), contribution: c };
    }).filter(function (r) { return Math.abs(r.weight) > 1e-9 || Math.abs(r.benchWeight) > 1e-9; }).sort(function (a, b) { return Math.abs(b.contribution) - Math.abs(a.contribution); });
    if (rows.length > 10) { var rest = rows.slice(9); rows = rows.slice(0, 9).concat([{ key: '__other', label: 'Other ' + rest.length + ' holdings', short: 'Other ' + rest.length, color: '#c3cedb', weight: U.sum(rest, function (r) { return r.weight; }), benchWeight: U.sum(rest, function (r) { return r.benchWeight; }), ret: null, contribution: U.sum(rest, function (r) { return r.contribution; }) }]); }
    var du = (1 - sumP) - (1 - sumB);
    if (Math.abs(du) > 1e-9) rows.push({ key: '__residual', label: 'Unallocated', short: 'Unallocated', color: '#c3cedb', weight: (1 - sumP) * 100, benchWeight: (1 - sumB) * 100, ret: 0, contribution: du * (0 - RB) });
    return { rows: rows, total: U.sum(rows, function (r) { return r.contribution; }), benchmarkReturn: RB };
  };
  /**
   * Factor premia implied by asset-class excess returns (% a year): a ridge
   * regression of each class's excess return on the model's loadings, so a
   * risk model's factors can carry return. excessOf(assetClassId) → %.
   */
  E.impliedPremia = function (model, excessOf) {
    var fs = model.factors, k = fs.length, acs = D.assetClasses.filter(function (ac) { return model.loadings[ac.id]; });
    var L = acs.map(function (ac) { return fs.map(function (f) { return model.loadings[ac.id][f.id] || 0; }); }), e = acs.map(function (ac) { return excessOf(ac.id); });
    var M = [], v = [], tr = 0;
    for (var a = 0; a < k; a++) { M.push([]); var sv = 0; for (var b = 0; b < k; b++) { var sm = 0; for (var r = 0; r < L.length; r++) sm += L[r][a] * L[r][b]; M[a].push(sm); } for (var r2 = 0; r2 < L.length; r2++) sv += L[r2][a] * e[r2]; v.push(sv); tr += M[a][a]; }
    var lam = 0.05 * tr / k; for (var d = 0; d < k; d++) M[d][d] += lam;
    var f = U.mat.solve(M, v), out = {}; fs.forEach(function (x, i) { out[x.id] = f ? f[i] : 0; });
    return out;
  };
  /** Active return by factor: active exposure × premium, with the rest as specific (selection). */
  E.factorAttribution = function (exposure, model, premia, activeReturn) {
    var rows = model.factors.map(function (f) { return { key: f.id, label: f.name, exposure: exposure[f.id] || 0, premium: premia[f.id], contribution: (exposure[f.id] || 0) * premia[f.id] }; }).filter(function (r) { return Math.abs(r.exposure) > 1e-6; }).sort(function (a, b) { return Math.abs(b.contribution) - Math.abs(a.contribution); });
    var fac = U.sum(rows, function (r) { return r.contribution; });
    rows.push({ key: '__specific', label: 'Specific (selection)', exposure: null, premium: null, contribution: activeReturn - fac, color: '#c3cedb' });
    return { rows: rows, factor: fac, specific: activeReturn - fac };
  };
  function sources(riskA, decompose, model) {
    if (decompose === 'category' || decompose === 'assetClass') {
      var gs = groupsFor(decompose), byG = {}; Object.keys(riskA.byInstrument).forEach(function (id) { var g = gs[0].of(id); byG[g] = (byG[g] || 0) + riskA.byInstrument[id]; });
      return gs.filter(function (g) { return byG[g.id] != null; }).map(function (g) { return { key: g.id, label: g.name, color: g.color, contribution: byG[g.id] }; });
    }
    if (decompose === 'product') {
      var list = Object.keys(riskA.byInstrument).map(function (id) { var ins = D.instrumentById[id]; return { key: id, label: ins.name, color: (D.categoryOf(id) || {}).color, contribution: riskA.byInstrument[id] }; }).sort(function (a, b) { return Math.abs(b.contribution) - Math.abs(a.contribution); });
      if (list.length > 10) { var rest = list.slice(9); list = list.slice(0, 9).concat([{ key: '__other', label: 'Other ' + rest.length + ' products', color: '#c3cedb', contribution: U.sum(rest, function (r) { return r.contribution; }) }]); }
      return list;
    }
    return model.factors.map(function (f) { return { key: f.id, label: f.name, contribution: riskA.byFactor[f.id] }; }).filter(function (r) { return Math.abs(r.contribution) > 1e-6; }).sort(function (a, b) { return Math.abs(b.contribution) - Math.abs(a.contribution); });
  }
  /**
   * Passive and active figures for a subject against a benchmark.
   * subject/bench: {holdings:[{instrumentId, weight %}], returns?:monthly[]}
   * opts: {modelId, basis:'forward'|'historical', R, period:{start,end}, decompose, returnMethod}
   */
  E.active = function (subject, bench, opts) {
    var model = E.modelOf(opts.modelId), wP = E.weightsOf(subject.holdings), wB = E.weightsOf(bench.holdings), a = {};
    Object.keys(wP).concat(Object.keys(wB)).forEach(function (id) { a[id] = (wP[id] || 0) - (wB[id] || 0); });
    var riskP = E.modelRisk(wP, model.id), riskB = E.modelRisk(wB, model.id), riskA = E.modelRisk(a, model.id);
    /* active share on the asset-class mix: products and the indices they track count as the same exposure */
    var byAc = {}; Object.keys(a).forEach(function (id) { var ac = D.instrumentById[id].assetClass; byAc[ac] = (byAc[ac] || 0) + a[id]; });
    var activeShare = U.sum(Object.keys(byAc), function (k) { return Math.abs(byAc[k]); }) / 2;
    var proxied = Object.keys(a).filter(function (id) { return model.coverage(D.instrumentById[id]); }).map(function (id) { return D.instrumentById[id].name; });
    var by = opts.attribute || opts.decompose || 'factor';
    var geo = opts.returnMethod === 'geometric', out = { model: model.id, attribute: by, activeShare: activeShare, riskSources: sources(riskA, by, model), specific: by === 'factor' ? riskA.specific : null, modelTE: riskA.total, coverage: proxied.length ? 'Proxied by the category index in ' + model.name + ': ' + proxied.join(', ') : null };
    /* where the active return comes from, by the same grouping as the risk */
    var attribute = function (retOf, excessOf, arithmetic) {
      if (by === 'product') { var pa = E.productAttribution(wP, wB, retOf); out.returnSources = pa.rows; out.returnTotals = { arithmetic: pa.total, attributed: pa.total }; return; }
      if (by === 'factor') { var fa = E.factorAttribution(riskA.exposure, model, E.impliedPremia(model, excessOf), arithmetic); out.returnSources = fa.rows; out.returnTotals = { arithmetic: arithmetic, factor: fa.factor, specific: fa.specific, attributed: arithmetic }; return; }
      var br = E.brinson(wP, wB, retOf, by); out.returnSources = br.rows; out.returnTotals = { allocation: br.allocation, selection: br.selection, arithmetic: br.allocation + br.selection, attributed: br.allocation + br.selection };
    };
    var diff = function (p, b) { return geo ? ((1 + p / 100) / (1 + b / 100) - 1) * 100 : p - b; };
    if (opts.basis !== 'historical') {
      var R = opts.R, retOf = function (id) { return R.ret[id] ? R.ret[id].value : 0; };
      var tr = U.sum(Object.keys(wP), function (id) { return wP[id] / 100 * retOf(id); }), pr = U.sum(Object.keys(wB), function (id) { return wB[id] / 100 * retOf(id); });
      var te = riskA.total, sp = riskP.total, sb = riskB.total;
      out.totalReturn = tr; out.passiveReturn = pr; out.activeReturn = diff(tr, pr);
      out.totalRisk = sp; out.passiveRisk = sb; out.activeRisk = te;
      out.activePassiveCorr = te > 1e-9 && sb > 1e-9 ? U.clamp((sp * sp - sb * sb - te * te) / (2 * sb * te), -1, 1) : null;
      attribute(retOf, function (ac) { return R.acReturn[ac].value - D.assumptions.riskFree; }, tr - pr);
    } else {
      var i0 = E.monthIndex(opts.period.start), i1 = E.monthIndex(opts.period.end), lb = Math.max(0, i0 - 35);
      var from = D.history.months[lb], to = opts.period.end, off = i0 - lb;
      var rp = subject.returnsFrom ? subject.returnsFrom(from, to) : E.backtest(subject.holdings, from, to).returns, rb = E.backtest(bench.holdings, from, to).returns;
      var act = rp.map(function (v, i) { return v == null || rb[i] == null ? null : v - rb[i]; });
      var seg = function (arr) { return arr.slice(off).filter(function (v) { return v != null; }); };
      var both = act.slice(off).map(function (v, i) { return v == null ? null : i; }).filter(function (i) { return i != null; });
      var p1 = both.map(function (i) { return rp[off + i]; }), b1 = both.map(function (i) { return rb[off + i]; }), a1 = both.map(function (i) { return act[off + i]; });
      if (p1.length < 12) { out.reason = 'Fewer than 12 months of overlapping history with the benchmark'; return out; }
      var tr2 = U.stats.annualizedReturn(p1) * 100, pr2 = U.stats.annualizedReturn(b1) * 100;
      out.totalReturn = tr2; out.passiveReturn = pr2; out.activeReturn = diff(tr2, pr2);
      out.totalRisk = U.stats.annualizedVol(p1) * 100; out.passiveRisk = U.stats.annualizedVol(b1) * 100; out.activeRisk = U.stats.annualizedVol(a1) * 100;
      var cm = E.correlationMatrix([b1, a1]); out.activePassiveCorr = cm[0][1];
      out.months = both.length;
      /* rolling 36-month tracking error and cumulative active return over the period */
      var months = D.history.months.slice(i0, i1 + 1), te36 = [], cum = [], gp = 1, gb = 1;
      for (var m = off; m < act.length; m++) {
        var w36 = act.slice(Math.max(0, m - 35), m + 1); te36.push(m - 35 >= 0 && w36.every(function (v) { return v != null; }) ? U.stats.annualizedVol(w36) * 100 : null);
        if (rp[m] != null && rb[m] != null) { gp *= 1 + rp[m]; gb *= 1 + rb[m]; cum.push((gp / gb - 1) * 100); } else cum.push(cum.length ? cum[cum.length - 1] : null);
      }
      out.over = { months: months, te36: te36, cumActive: cum };
      var hret = {}, retH = function (id) { if (hret[id] === undefined) { var s = E.holdingSeries(id).series.slice(i0, i1 + 1).filter(function (v) { return v != null; }); hret[id] = s.length >= 12 ? U.stats.annualizedReturn(s) * 100 : 0; } return hret[id]; };
      var rfH = retH('idx_cash'), aH = 0; Object.keys(a).forEach(function (id) { aH += a[id] / 100 * retH(id); });
      attribute(retH, function (ac) { return retH(D.assetClassById[ac].indexId) - rfH; }, aH);
      out.returnSourcesNote = 'Sources use each holding’s annualised return over the period at current weights, so they can differ slightly from the realised active return.' + (by === 'factor' ? ' Factor premia are implied from the asset-class index returns over the period.' : '');
      out.riskSourcesNote = 'Sources come from the ' + model.name + ' factor model (forward tracking error ' + U.fmt.num(riskA.total, 2) + '%). The headline tracking error is realised over the period.';
    }
    out.informationRatio = out.activeRisk > 1e-6 ? out.activeReturn / out.activeRisk : null;
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
  E.historical = function (allocation, rows, from, to, modelId) {
    var model = E.modelOf(modelId);
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
      /* estimated by regressing the period's returns on the model's factor returns (simulated: the model loading plus estimation noise) */
      var beta = {};
      model.factors.forEach(function (f) {
        if (!list.length || Math.abs(weight) < 1e-9) { beta[f.id] = null; return; }
        var s2 = 0, r2 = U.rng(U.hash(model.id + row.key + f.id + from));
        list.forEach(function (h) { s2 += h.weight * (E.loadingsOf(model, h.instrumentId)[f.id] + r2.normal() * 0.04); });
        beta[f.id] = row.kind === 'total' ? s2 / 100 : s2 / weight;
      });
      var proxied = list.filter(function (h) { return stats[h.id].coverage === 'proxy'; });
      if (proxied.length) notes.push(proxied.map(function (h) { return D.instrumentById[h.instrumentId].name + ': ' + stats[h.id].note; }).join('; '));
      var allMissing = missing.length && missing.length === list.length;
      out.rows[row.key] = { weight: weight, ret: ret, reason: reason, riskShare: allMissing ? null : share, riskVol: allMissing ? null : rv, beta: beta, modelNote: E.modelNote(model, list), held: list.length > 0, coverageNote: notes.length ? notes.join(' · ') : null, note: row.kind === 'index' && list.length ? 'Index-modelled remainder' : null };
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

  /* ── the forward-looking suite ───────────────────────────────────── */
  /** Standard normal distribution function (Abramowitz & Stegun 7.1.26). */
  E.normCdf = function (z) {
    var x = Math.abs(z) / Math.SQRT2, t = 1 / (1 + 0.3275911 * x);
    var y = 1 - (((((1.061405429 * t - 1.453152027) * t) + 1.421413741) * t - 0.284496736) * t + 0.254829592) * t * Math.exp(-x * x);
    return z >= 0 ? (1 + y) / 2 : (1 - y) / 2;
  };
  /**
   * Hypothetical stress tests: instant shocks to factor returns (%), applied
   * to the portfolio's exposures under the Axioma factor model, which holds
   * every shocked factor (ISG has no credit or inflation factor). The
   * currency shock is the reporting currency rising against every other.
   */
  E.stressModel = 'axioma';
  E.stressTests = [
    { id: 'equity', name: 'Equity markets −20%', shocks: { equity: -20 } },
    { id: 'rates', name: 'Interest rates +100 bp', shocks: { term: -6.5 } },
    { id: 'credit', name: 'Credit spreads +100 bp', shocks: { credit: -4.5 } },
    { id: 'fx', name: 'Reporting currency +10%', shocks: { fx: -10 } },
    { id: 'inflation', name: 'Inflation +1 pp', shocks: { local_inflation: 2.5, term: -2 } },
    { id: 'cmd', name: 'Commodities −25%', shocks: { commodities: -25 } },
    { id: 'recession', name: 'Global recession', combined: true, shocks: { equity: -25, term: 5, credit: -6, funding: -3, liquidity: -3, commodities: -20 } },
    { id: 'stagflation', name: 'Stagflation', combined: true, shocks: { equity: -15, term: -8, local_inflation: 5, commodities: 15 } }
  ];
  /**
   * Forward-looking measures for a holding list under resolved assumptions:
   * expected return and volatility, one-year value at risk and expected
   * shortfall (normal, as losses in %), outcome probabilities, the
   * diversification ratio, the effective number of bets (on category risk
   * shares) and the stress tests. opts: {horizon, target}
   */
  E.forwardSuite = function (holdings, R, opts) {
    opts = opts || {};
    var hs = holdings.filter(function (h) { return Math.abs(h.weight) > 1e-9; });
    if (!hs.length) return null;
    var w = hs.map(function (h) { return h.weight / 100; }), S = covariance(hs, R), Sw = U.mat.mulVec(S, w), vol = Math.sqrt(Math.max(U.mat.dot(w, Sw), 0));
    var ret = U.sum(hs, function (h) { return h.weight / 100 * R.ret[h.instrumentId].value; }), rf = D.assumptions.riskFree, Phi = E.normCdf;
    var dens = function (z) { return Math.exp(-z * z / 2) / Math.sqrt(2 * Math.PI); }, z95 = 1.6449, z99 = 2.3263;
    var H = opts.horizon || 10, target = opts.target != null ? opts.target : rf + 3;
    var stand = U.sum(hs, function (h, i) { return Math.abs(w[i]) * Math.sqrt(S[i][i]); });
    var byCat = {}; hs.forEach(function (h, i) { var c = E.categoryOf(h.instrumentId); byCat[c] = (byCat[c] || 0) + (vol > 0 ? w[i] * Sw[i] / vol : 0); });
    var shares = Object.keys(byCat).map(function (c) { return { id: c, share: vol > 0 ? byCat[c] / vol * 100 : 0 }; });
    var hhi = U.sum(shares, function (x) { return Math.pow(x.share / 100, 2); });
    var ex = E.modelRisk(E.weightsOf(hs), E.stressModel).exposure;
    return { ret: ret, vol: vol, sharpe: vol > 0 ? (ret - rf) / vol : null,
      var95: vol * z95 - ret, es95: vol * dens(z95) / 0.05 - ret, var99: vol * z99 - ret, es99: vol * dens(z99) / 0.01 - ret,
      pLoss: vol > 0 ? Phi(-ret / vol) * 100 : (ret < 0 ? 100 : 0), pCash: vol > 0 ? Phi((rf - ret) / vol) * 100 : (ret < rf ? 100 : 0),
      pTarget: vol > 0 ? (1 - Phi((target - ret) * Math.sqrt(H) / vol)) * 100 : (ret >= target ? 100 : 0), target: target, horizon: H,
      divRatio: vol > 0 ? stand / vol : null, enb: hhi > 0 ? 1 / hhi : null, categoryShares: shares,
      stress: E.stressTests.map(function (t) { var v = 0; Object.keys(t.shocks).forEach(function (f) { v += (ex[f] || 0) * t.shocks[f]; }); return { id: t.id, value: v }; }) };
  };

  /* ── the historical suite ────────────────────────────────────────── */
  /**
   * Distribution and capture measures from monthly returns (fractions).
   * rp: the allocation; rb: the reference, aligned month by month (or null).
   */
  E.historySuite = function (rp, rb, months) {
    var idx = []; rp.forEach(function (v, i) { if (v != null && (!rb || rb[i] != null)) idx.push(i); });
    if (idx.length < 12) return null;
    var x = idx.map(function (i) { return rp[i] * 100; }), n = x.length, m = U.sum(x) / n;
    var sd = Math.sqrt(U.sum(x, function (v) { return (v - m) * (v - m); }) / (n - 1));
    var skew = sd > 0 ? U.sum(x, function (v) { return Math.pow((v - m) / sd, 3); }) / n : 0, kurt = sd > 0 ? U.sum(x, function (v) { return Math.pow((v - m) / sd, 4); }) / n - 3 : 0;
    var lo = Math.floor(Math.min.apply(null, x)), hi = Math.ceil(Math.max.apply(null, x)); if (hi === lo) hi = lo + 1;
    var bins = []; for (var b = lo; b < hi; b++) bins.push({ from: b, to: b + 1, count: 0 });
    x.forEach(function (v) { var k = Math.min(bins.length - 1, Math.floor(v) - lo); bins[k].count++; });
    var worst = idx.map(function (i) { return { m: months[i], r: rp[i] * 100 }; }).sort(function (p, q) { return p.r - q.r; }).slice(0, 3);
    var out = { months: n, mean: m, sd: sd, skew: skew, kurtosis: kurt, bins: bins, worst: worst, positive: x.filter(function (v) { return v > 0; }).length / n * 100 };
    if (rb) {
      var y = idx.map(function (i) { return rb[i] * 100; }), my = U.sum(y) / n, cov = 0, vy = 0, vx = 0;
      for (var k = 0; k < n; k++) { cov += (x[k] - m) * (y[k] - my); vy += (y[k] - my) * (y[k] - my); vx += (x[k] - m) * (x[k] - m); }
      var geo = function (arr) { if (!arr.length) return null; var g = 1; arr.forEach(function (v) { g *= 1 + v / 100; }); return (Math.pow(g, 1 / arr.length) - 1) * 100; };
      var up = [], upB = [], dn = [], dnB = [], beat = 0;
      for (var j = 0; j < n; j++) { if (y[j] >= 0) { up.push(x[j]); upB.push(y[j]); } else { dn.push(x[j]); dnB.push(y[j]); } if (x[j] > y[j]) beat++; }
      var ratio = function (p, q) { var a = geo(p), c = geo(q); return a == null || c == null || Math.abs(c) < 1e-9 ? null : a / c * 100; };
      out.upCapture = ratio(up, upB); out.downCapture = ratio(dn, dnB); out.upMonths = up.length; out.downMonths = dn.length;
      out.beta = vy > 0 ? cov / vy : null; out.correlation = vx > 0 && vy > 0 ? cov / Math.sqrt(vx * vy) : null; out.hitRate = beat / n * 100;
    }
    return out;
  };

  /* ── structure ───────────────────────────────────────────────────── */
  /** Weight by category (% of the total) of a holding list. */
  E.categoryWeights = function (holdings) { var out = {}; D.categories.forEach(function (c) { out[c.id] = 0; }); holdings.forEach(function (h) { var c = E.categoryOf(h.instrumentId); if (c) out[c] += h.weight; }); return out; };
  /** Look-through currency mix (% of the total, unhedged); cash is in the reporting currency. */
  E.currencyMix = function (holdings) {
    var out = {}, rep = D.reporting;
    holdings.forEach(function (h) {
      var ins = D.instrumentById[h.instrumentId], mix = ins.assetClass === 'cash' ? (function () { var o = {}; o[rep] = 100; return o; })() : D.currencyLookThrough[ins.assetClass] || { USD: 100 };
      Object.keys(mix).forEach(function (c) { out[c] = (out[c] || 0) + h.weight * mix[c] / 100; });
    });
    return out;
  };
})();

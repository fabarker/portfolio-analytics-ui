/* ─────────────────────────────────────────────────────────────────────────
   Portfolio Analytics · mean-variance optimisation (mock engine)
   Re-weights the allocation being edited. The assets are its holdings
   (products and indices). With "use category indices" every held standard
   category's index basket joins as well; with "categories not held" the
   other standard categories' baskets join at zero. A basket's optimised
   weight becomes explicit holdings of its indices. Three objectives:

     minVol     minimise volatility for a target return
     maxReturn  maximise return for a target volatility
     active     against the allocation's benchmark, either maximise return
                at a target tracking error (teMode 'target') or minimise
                tracking error for a target return (teMode 'min')

   Return and volatility come from the platform assumptions (scenario aware)
   so they match the Headline card; tracking error comes from the workspace's
   factor model so it matches the Active risk & return card. Constraints:
   the total stays where it is, long only (unless the allocation allows
   shorts), a maximum weight per holding and, optionally, each category
   within a band around its current weight.

   The solver is the ADMM iteration used by OSQP, dense, for
   min ½xᵀPx + qᵀx  s.t.  l ≤ Ax ≤ u. A target on a quadratic quantity
   (volatility, tracking error) is met by bisection on the target return.
   ───────────────────────────────────────────────────────────────────────── */
(function () {
  'use strict';
  var PA = window.PA, U = PA.util, D = PA.data, E = PA.engine;

  function cholSolve(L, b) {
    var n = b.length, y = new Array(n), x = new Array(n), i, k, s;
    for (i = 0; i < n; i++) { s = b[i]; for (k = 0; k < i; k++) s -= L[i][k] * y[k]; y[i] = s / L[i][i]; }
    for (i = n - 1; i >= 0; i--) { s = y[i]; for (k = i + 1; k < n; k++) s -= L[k][i] * x[k]; x[i] = s / L[i][i]; }
    return x;
  }
  /** min ½xᵀPx + qᵀx  s.t.  l ≤ Ax ≤ u. Returns {x, converged, iterations}. */
  function qp(P, q, A, l, u, x0) {
    var n = q.length, m = A.length, sigma = 1e-6, alpha = 1.6, i, j, k;
    var scale = 0, qs = 0; for (i = 0; i < n; i++) { scale += Math.abs(P[i][i]); qs += Math.abs(q[i]); } scale = Math.max(scale / n, qs / n, 1e-6);
    var rho = A.map(function (row, r) { return (l[r] === u[r] ? 1e3 : 1) * 0.1 * scale; });
    var K = []; for (i = 0; i < n; i++) { K.push([]); for (j = 0; j < n; j++) { var s = P[i][j] + (i === j ? sigma : 0); for (k = 0; k < m; k++) s += A[k][i] * rho[k] * A[k][j]; K[i].push(s); } }
    var L = U.mat.cholesky(K); if (!L) { for (i = 0; i < n; i++) K[i][i] += 1e-6 * scale; L = U.mat.cholesky(K); }
    var x = x0 ? x0.slice() : new Array(n).fill(0), z = A.map(function (row, r) { return U.clamp(U.mat.dot(row, x), l[r], u[r]); }), y = new Array(m).fill(0);
    var it, ok = false;
    for (it = 0; it < 4000; it++) {
      var rhs = new Array(n);
      for (i = 0; i < n; i++) { var t = sigma * x[i] - q[i]; for (k = 0; k < m; k++) t += A[k][i] * (rho[k] * z[k] - y[k]); rhs[i] = t; }
      var xt = cholSolve(L, rhs), zt = A.map(function (row) { return U.mat.dot(row, xt); });
      for (i = 0; i < n; i++) x[i] = alpha * xt[i] + (1 - alpha) * x[i];
      var zp = 0;
      for (k = 0; k < m; k++) { var zr = alpha * zt[k] + (1 - alpha) * z[k], zn = U.clamp(zr + y[k] / rho[k], l[k], u[k]); y[k] += rho[k] * (zr - zn); zp = Math.max(zp, Math.abs(zn - z[k])); z[k] = zn; }
      if (it % 10 === 9) {
        var pr = 0; for (k = 0; k < m; k++) pr = Math.max(pr, Math.abs(U.mat.dot(A[k], x) - z[k]));
        var Px = U.mat.mulVec(P, x), dr = 0; for (i = 0; i < n; i++) { var g = Px[i] + q[i]; for (k = 0; k < m; k++) g += A[k][i] * y[k]; dr = Math.max(dr, Math.abs(g)); }
        if (pr < 1e-7 && dr < 1e-5 * scale && zp < 1e-8) { ok = true; break; }
      }
    }
    return { x: x, converged: ok, iterations: it };
  }
  E.qp = qp;

  /**
   * opts: {objective:'minVol'|'maxReturn'|'active', target (% a year), teMode:'target'|'min',
   *        longOnly, maxWeight (%), band (pp or null), useIndices, includeAll, scenario, factorModel,
   *        benchmark:{holdings:[{instrumentId, weight %}], label}|null}
   */
  E.optimize = function (allocation, opts) {
    var R = E.resolve(opts.scenario), model = E.modelOf(opts.factorModel), rf = D.assumptions.riskFree;
    if (!R.corrValid) return { error: 'The scenario’s correlations are not valid, so there is no covariance to optimise.' };
    var tree = E.tree(allocation), assets = [];
    tree.forEach(function (t) {
      t.products.forEach(function (h) { assets.push({ key: t.id + '/' + h.instrumentId, kind: 'product', categoryId: t.id, instrumentId: h.instrumentId, label: D.instrumentById[h.instrumentId].name, current: h.weight / 100, x: [[h.instrumentId, 1]] }); });
      /* a standard category's index basket joins where asked for */
      var held = t.products.length > 0, c = D.categoryById[t.id];
      if (c && c.index && c.index.length && ((held && opts.useIndices) || (!held && opts.includeAll))) { var tot = U.sum(c.index, function (p) { return p[1]; }); assets.push({ key: t.id + '/__index', kind: 'index', categoryId: t.id, label: t.short + ' Index', current: 0, x: c.index.map(function (p) { return [p[0], p[1] / tot]; }) }); }
    });
    if (assets.length < 2) return { error: 'Add at least two holdings or categories to optimise.' };
    var T = U.sum(assets, function (a) { return a.current; }); if (T < 1e-6) T = 1;
    /* instruments: the assets' and the benchmark's */
    var ids = [], pos = {}, add = function (id) { if (pos[id] == null) { pos[id] = ids.length; ids.push(id); } };
    assets.forEach(function (a) { a.x.forEach(function (p) { add(p[0]); }); });
    var bench = opts.benchmark && opts.benchmark.holdings && opts.benchmark.holdings.length ? opts.benchmark.holdings : null;
    if (opts.objective === 'active' && !bench && !opts.preview) return { error: 'Choose a benchmark for the allocation to optimise against it.' };
    if (bench) bench.forEach(function (h) { add(h.instrumentId); });
    var n = assets.length, N = ids.length;
    var X = assets.map(function (a) { var row = new Array(N).fill(0); a.x.forEach(function (p) { row[pos[p[0]]] += p[1]; }); return row; });
    var Sig = E.covariance(ids.map(function (id) { return { instrumentId: id }; }), R);
    var mu = ids.map(function (id) { return R.ret[id].value; });
    /* factor-model covariance for tracking error */
    var Fm = E.factorCov(model), Bm = ids.map(function (id) { var b = E.loadingsOf(model, id); return model.factors.map(function (f) { return b[f.id]; }); });
    var SigF = ids.map(function (a, i) { var BF = U.mat.mulVec(Fm, Bm[i]); return ids.map(function (b2, j) { var v = U.mat.dot(BF, Bm[j]); if (i === j) { var s = E.specificOf(model, a); v += s * s; } return v; }); });
    var proj = function (S) { return X.map(function (ri) { var Sri = U.mat.mulVec(S, ri); return X.map(function (rj) { return U.mat.dot(Sri, rj); }); }); };
    var SA = proj(Sig), SF = proj(SigF), muA = X.map(function (r) { return U.mat.dot(r, mu); });
    var bvec = new Array(N).fill(0); if (bench) bench.forEach(function (h) { bvec[pos[h.instrumentId]] += h.weight / 100; });
    var SFb = U.mat.mulVec(SigF, bvec), qTE = X.map(function (r) { return -2 * U.mat.dot(r, SFb); }), bSb = U.mat.dot(bvec, SFb);
    var benchRet = U.mat.dot(bvec, mu);
    var volOf = function (w) { return Math.sqrt(Math.max(U.mat.dot(w, U.mat.mulVec(SA, w)), 0)); };
    var teOf = function (w) { return bench ? Math.sqrt(Math.max(U.mat.dot(w, U.mat.mulVec(SF, w)) + U.mat.dot(qTE, w) + bSb, 0)) : null; };
    var retOf = function (w) { return U.mat.dot(w, muA); };

    /* constraints: total, bounds per asset, category bands */
    var maxW = (opts.maxWeight == null ? 100 : opts.maxWeight) / 100, lo = opts.longOnly === false ? -maxW : 0;
    var A = [], l = [], u = [];
    A.push(assets.map(function () { return 1; })); l.push(T); u.push(T);
    assets.forEach(function (a, i) { var row = new Array(n).fill(0); row[i] = 1; A.push(row); l.push(lo); u.push(maxW); });
    var cats = [];
    if (opts.band != null) tree.forEach(function (t) {
      var members = assets.map(function (a, i) { return a.categoryId === t.id ? i : -1; }).filter(function (i) { return i >= 0; }); if (!members.length) return;
      var cur = U.sum(members, function (i) { return assets[i].current; }), row = new Array(n).fill(0); members.forEach(function (i) { row[i] = 1; });
      A.push(row); l.push(Math.max(opts.longOnly === false ? -T : 0, cur - opts.band / 100)); u.push(cur + opts.band / 100); cats.push(t.id);
    });
    var w0 = assets.map(function (a) { return a.current; });
    var solve = function (kind, minRet, warm) {
      var P, q;
      if (kind === 'maxRet') { P = SA.map(function (r, i) { return r.map(function (v, j) { return (i === j ? 1e-6 * (SA[i][i] || 1) : 0); }); }); q = muA.map(function (v) { return -v; }); }
      else { var S = kind === 'te' ? SF : SA; P = S.map(function (r) { return r.map(function (v) { return 2 * v; }); }); q = kind === 'te' ? qTE.slice() : new Array(n).fill(0); }
      var AA = A.slice(), ll = l.slice(), uu = u.slice();
      if (minRet != null) { AA.push(muA.slice()); ll.push(minRet); uu.push(Infinity); }
      var r = qp(P, q, AA, ll, uu, warm || w0);
      return r.x;
    };
    var feasible = function (w) { var tol = 2e-4; if (Math.abs(U.sum(w) - T) > tol) return false; for (var r = 1; r < A.length; r++) { var v = U.mat.dot(A[r], w); if (v < l[r] - tol || v > u[r] + tol) return false; } return true; };

    var summary = function (w) { var r = retOf(w), v = volOf(w), te = teOf(w); return { ret: r, vol: v, sharpe: v > 0 ? (r - rf) / v : null, te: te, ir: te ? (r - benchRet) / te : null }; };
    /* a preview: where the allocation is now and what the constraints can reach */
    if (opts.preview) {
      var wx = solve('maxRet'), wv = solve('vol'), wt = bench ? solve('te') : null;
      if (!feasible(wx) || !feasible(wv)) return { error: 'No allocation meets these constraints. Loosen the maximum weight or the category band.', current: summary(w0) };
      return { preview: true, current: summary(w0), total: T * 100, benchmark: bench ? { label: opts.benchmark.label, ret: benchRet } : null,
        rangeVol: { minRet: retOf(wv), maxRet: retOf(wx), minRisk: volOf(wv), maxRisk: volOf(wx) }, rangeTE: wt ? { minRet: retOf(wt), maxRet: retOf(wx), minRisk: teOf(wt), maxRisk: teOf(wx) } : null };
    }
    var kind = opts.objective === 'active' ? 'te' : 'vol', riskOf = kind === 'te' ? teOf : volOf;
    var wMax = solve('maxRet'), rMax = retOf(wMax);
    var wMin = solve(kind), rMin = retOf(wMin), sMin = riskOf(wMin);
    if (!feasible(wMax) || !feasible(wMin)) return { error: 'No allocation meets these constraints. Loosen the maximum weight or the category band.' };
    /* the frontier, from the lowest-risk point to the highest return */
    var frontier = [], warm = wMin;
    for (var f = 0; f <= 14; f++) { var rt = rMin + (rMax - rMin) * f / 14, wf = f === 0 ? wMin : f === 14 ? wMax : solve(kind, rt, warm); warm = wf; frontier.push({ ret: retOf(wf), risk: riskOf(wf) }); }
    frontier = frontier.filter(function (p, i) { return i === 0 || p.ret > frontier[i - 1].ret - 1e-6; });
    var target = opts.target, result = null, reason = null, note = null;
    if (opts.objective === 'minVol' || (opts.objective === 'active' && opts.teMode === 'min')) {
      if (target > rMax + 1e-6) reason = 'A return of ' + U.fmt.num(target, 2) + '% is out of reach: the most these holdings can return under the constraints is ' + U.fmt.num(rMax, 2) + '%.';
      else if (target <= rMin) { result = wMin; note = 'The lowest-' + (kind === 'te' ? 'tracking-error' : 'volatility') + ' mix already returns ' + U.fmt.num(rMin, 2) + '%, above the target.'; }
      else result = solve(kind, target, wMin);
    } else {
      if (target < sMin - 1e-6) reason = 'A ' + (kind === 'te' ? 'tracking error' : 'volatility') + ' of ' + U.fmt.num(target, 2) + '% is out of reach: the lowest these holdings reach under the constraints is ' + U.fmt.num(sMin, 2) + '%.';
      else if (riskOf(wMax) <= target + 1e-6) { result = wMax; note = 'The highest-return mix carries only ' + U.fmt.num(riskOf(wMax), 2) + '%, inside the target.'; }
      else {
        var a0 = rMin, a1 = rMax, best = wMin;
        for (var b = 0; b < 26; b++) { var mid = (a0 + a1) / 2, wm = solve(kind, mid, best); if (riskOf(wm) <= target) { a0 = mid; best = wm; } else a1 = mid; if (a1 - a0 < 1e-4) break; }
        result = best;
      }
    }
    var out = { objective: opts.objective, teMode: opts.teMode, target: target, total: T * 100, benchmark: bench ? { label: opts.benchmark.label, ret: benchRet } : null, riskUnit: kind === 'te' ? 'te' : 'vol',
      frontier: frontier, current: summary(w0), range: { minRet: rMin, maxRet: rMax, minRisk: sMin, maxRisk: riskOf(wMax) }, categories: cats, model: model.id, reason: reason, note: note };
    if (!result) return out;
    /* to two decimals of a percent; tiny weights to zero; the rounding goes to the largest */
    var pct = result.map(function (v) { var p = U.round(v * 100, 2); return Math.abs(p) < 0.01 ? 0 : p; }), diff = U.round(T * 100 - U.sum(pct), 2);
    if (Math.abs(diff) > 0) { var big = -1; pct.forEach(function (v, i) { var room = diff > 0 ? maxW * 100 - v : v - lo * 100; if (room >= Math.abs(diff) - 1e-9 && (big < 0 || Math.abs(v) > Math.abs(pct[big]))) big = i; }); if (big < 0) big = 0; pct[big] = U.round(pct[big] + diff, 2); }
    var wr = pct.map(function (v) { return v / 100; });
    out.proposed = summary(wr);
    out.assets = assets.map(function (a, i) { return { key: a.key, kind: a.kind, categoryId: a.categoryId, instrumentId: a.instrumentId || null, label: a.label, current: U.round(a.current * 100, 4), proposed: pct[i] }; });
    return out;
  };

  /** The allocation an optimisation result describes: holdings at their weights; a category basket's weight split across its indices. */
  E.applyOptimized = function (allocation, assets) {
    var holdings = U.clone(allocation.holdings || []);
    assets.forEach(function (a) {
      if (a.kind === 'product') { var h = holdings.filter(function (x) { return x.instrumentId === a.instrumentId; })[0]; if (h) h.weight = a.proposed; return; }
      var c = D.categoryById[a.categoryId]; if (!c || !c.index || Math.abs(a.proposed) < 1e-9) return;
      var tot = U.sum(c.index, function (p) { return p[1]; });
      c.index.forEach(function (p) {
        var w = U.round(a.proposed * p[1] / tot, 2), ex = holdings.filter(function (x) { return x.instrumentId === p[0]; })[0];
        if (ex) ex.weight = U.round(ex.weight + w, 2); else holdings.push({ id: U.uid('h'), instrumentId: p[0], weight: w, categoryId: a.categoryId });
      });
    });
    return { holdings: holdings };
  };
})();

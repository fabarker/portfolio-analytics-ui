/* ─────────────────────────────────────────────────────────────────────────
   Portfolio Analytics · uploaded products (mock engine)
   A user can add a product by pasting its monthly return history. The model
   needs nothing else:

     asset class   the class whose index the product tracks most closely
                   (highest R² over the overlapping months), unless the
                   user picks another
     beta, fit     regression of the product's monthly returns on that index
     expected      cash + beta × (the class's expected return − cash); no alpha
     return        is assumed (a scenario can set one on the holding)
     volatility    the product's own realised volatility
     correlations  the class's, scaled by the product's correlation with
                   its index (engine.js, covariance)
     factor        the class's loadings × beta; specific risk is whatever
     exposures     the product's volatility leaves after its factor risk
     history       its own months; before its first month, either the
                   class index (proxy) or nothing

   Shapes
   ─────
   ProductRecord {id, name, identifier, type, assetClass, currency,
                  start:'YYYY-MM', returns:(number|null)[] (fractions, monthly
                  from start), proxy:boolean, source:'uploaded', owner,
                  createdAt, archived, description?, origin:{frequency, rows, unit}}
   Fit           {assetClassId, indexId, months, beta, corr, r2, alpha, vol}
                 alpha and vol are % a year
   ───────────────────────────────────────────────────────────────────────── */
(function () {
  'use strict';
  var PA = window.PA, U = PA.util, D = PA.data, E = PA.engine;

  /** Align a record's returns to the history's months (null outside). */
  function aligned(rec) {
    var H = D.history, off = U.ym.diff(H.start, rec.start);
    return H.months.map(function (m, i) { var k = i - off; return k >= 0 && k < rec.returns.length && rec.returns[k] != null ? rec.returns[k] : null; });
  }
  E.alignedReturns = aligned;

  /** Summary statistics of a monthly series (fractions; nulls skipped). */
  E.seriesStats = function (values, months) {
    var idx = []; values.forEach(function (v, i) { if (v != null) idx.push(i); });
    if (!idx.length) return null;
    var r = idx.map(function (i) { return values[i]; }), g = U.stats.growth(r, 100);
    var annR = U.stats.annualizedReturn(r), vol = U.stats.annualizedVol(r), rf = D.assumptions.riskFree;
    return { months: r.length, start: months ? months[idx[0]] : null, end: months ? months[idx[idx.length - 1]] : null,
      annReturn: annR * 100, vol: vol == null ? null : vol * 100, sharpe: vol ? (annR * 100 - rf) / (vol * 100) : null,
      maxDrawdown: U.stats.maxDrawdown(g) * 100, best: Math.max.apply(null, r) * 100, worst: Math.min.apply(null, r) * 100,
      positive: r.filter(function (v) { return v > 0; }).length / r.length * 100, cumulative: (g[g.length - 1] / 100 - 1) * 100 };
  };

  /** Regression of a monthly series (aligned to the history) on one asset class's index. */
  E.fitTo = function (values, assetClassId) {
    var ac = D.assetClassById[assetClassId], x = D.history.instrument[ac.indexId] || [], ps = [], xs = [];
    values.forEach(function (v, i) { if (v != null && x[i] != null) { ps.push(v); xs.push(x[i]); } });
    var n = ps.length; if (n < 12) return null;
    var mp = U.sum(ps) / n, mx = U.sum(xs) / n, cov = 0, vx = 0, vp = 0;
    for (var k = 0; k < n; k++) { cov += (ps[k] - mp) * (xs[k] - mx); vx += (xs[k] - mx) * (xs[k] - mx); vp += (ps[k] - mp) * (ps[k] - mp); }
    var beta = vx > 0 ? cov / vx : 0, corr = vx > 0 && vp > 0 ? cov / Math.sqrt(vx * vp) : 0;
    var own = values.filter(function (v) { return v != null; });
    return { assetClassId: assetClassId, indexId: ac.indexId, months: n, beta: beta, corr: corr, r2: corr * corr, alpha: (mp - beta * mx) * 1200, vol: (U.stats.annualizedVol(own) || 0) * 100 };
  };
  /** Every asset class's fit, closest first. */
  E.fitAll = function (values) {
    return D.assetClasses.map(function (ac) { return E.fitTo(values, ac.id); }).filter(Boolean).sort(function (a, b) { return b.r2 - a.r2; });
  };

  /** The instrument a record stands for, with its model fit. */
  function instrumentOf(rec) {
    var vals = aligned(rec), fit = E.fitTo(vals, rec.assetClass) || { assetClassId: rec.assetClass, indexId: D.assetClassById[rec.assetClass].indexId, months: 0, beta: 1, corr: 0.5, r2: 0.25, alpha: 0, vol: D.assumptions.assetClasses[rec.assetClass].vol };
    var first = vals.findIndex(function (v) { return v != null; }), idx = D.instrumentById[fit.indexId];
    return { id: rec.id, name: rec.name, type: rec.type || 'Fund', identifier: rec.identifier || rec.id.toUpperCase().slice(0, 10), assetClass: rec.assetClass, currency: rec.currency || D.reporting || 'USD', valuation: 'monthly',
      inception: first >= 0 ? D.history.months[first] : rec.start, coverage: rec.proxy && first > 0 ? 'proxy' : 'full',
      proxyNote: rec.proxy && first > 0 ? 'Uploaded returns from ' + U.fmt.month(D.history.months[first]) + '; the ' + idx.name + ' stands in before' : null,
      benchmarkId: fit.indexId, source: 'uploaded', owner: rec.owner, createdAt: rec.createdAt, archived: !!rec.archived, description: rec.description || '',
      fit: { beta: fit.beta, corr: Math.max(0.05, Math.min(1, fit.corr)), r2: fit.r2, alpha: fit.alpha, vol: fit.vol, months: fit.months, indexId: fit.indexId } };
  }

  /** Register (or re-register) every uploaded product: instruments, history and fits. */
  D.registerProducts = function (records) {
    for (var i = D.instruments.length - 1; i >= 0; i--) if (D.instruments[i].source === 'uploaded') { delete D.instrumentById[D.instruments[i].id]; delete D.history.instrument[D.instruments[i].id]; D.instruments.splice(i, 1); }
    (records || []).forEach(function (rec) {
      if (!D.assetClassById[rec.assetClass]) return;
      var ins = instrumentOf(rec); D.instruments.push(ins); D.instrumentById[ins.id] = ins; D.history.instrument[ins.id] = aligned(rec);
    });
  };
  /** A product's forward and historical figures for the product directory. */
  E.productAnalytics = function (instrumentId, R, modelId) {
    var ins = D.instrumentById[instrumentId]; if (!ins) return null;
    var model = E.modelOf(modelId), rf = D.assumptions.riskFree, ret = R.ret[ins.id].value, vol = R.vol[ins.id].value;
    var risk = E.modelRisk((function () { var o = {}; o[ins.id] = 100; return o; })(), model.id);
    var hs = E.holdingSeries(ins.id), own = D.history.instrument[ins.id] || [], ac = D.assetClassById[ins.assetClass], cat = D.categoryOf(ins.id);
    var idx = D.history.instrument[ac.indexId] || [], months = D.history.months;
    var stats = E.seriesStats(own, months), first = own.findIndex(function (v) { return v != null; });
    var growth = null, idxGrowth = null;
    if (first >= 0) { var g = 100, gi = 100; growth = []; idxGrowth = []; for (var m = first; m < months.length; m++) { if (own[m] != null) g *= 1 + own[m]; if (idx[m] != null) gi *= 1 + idx[m]; growth.push(g); idxGrowth.push(gi); } }
    var calendar = []; if (first >= 0) { var byY = {}; for (var m2 = first; m2 < months.length; m2++) { if (own[m2] == null) continue; var y = months[m2].slice(0, 4); byY[y] = byY[y] || { g: 1, n: 0 }; byY[y].g *= 1 + own[m2]; byY[y].n++; } Object.keys(byY).forEach(function (y) { calendar.push({ year: y, ret: (byY[y].g - 1) * 100, partial: byY[y].n < 12 }); }); }
    var fit = ins.fit || E.fitTo(own, ins.assetClass);
    return { id: ins.id, name: ins.name, type: ins.type, identifier: ins.identifier, source: ins.source || 'platform', assetClass: ac.name, category: cat ? { id: cat.id, name: cat.name, color: cat.color } : null, index: D.instrumentById[ac.indexId].name,
      forward: { ret: ret, vol: vol, sharpe: vol > 0 ? (ret - rf) / vol : null, beta: fit ? fit.beta : null, model: model.id, exposure: risk.exposure, specific: E.specificOf(model, ins.id), factorShare: risk.total > 0 ? risk.factorVar / (risk.total * risk.total) * 100 : null, coverage: model.coverage(ins) ? model.coverage(ins).note : null, source: R.ret[ins.id].source },
      historical: stats ? Object.assign(stats, { months: stats.months, growthStart: months[first], growth: growth, indexGrowth: idxGrowth, calendar: calendar, corr: fit ? fit.corr : null, r2: fit ? fit.r2 : null, coverage: hs.coverage, note: hs.note }) : null,
      fit: ins.fit ? Object.assign({}, ins.fit, { indexName: D.instrumentById[ins.fit.indexId].name }) : null };
  };
})();

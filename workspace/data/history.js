/* ─────────────────────────────────────────────────────────────────────────
   Mock data · monthly return history, Jan 2012 – Oct 2026
   Generated once, deterministically, from the base assumptions so history
   and forecasts come from one coherent model. Three stylised episodes are
   overlaid so charts look like markets rather than noise: early 2016,
   Feb–Mar 2020 and the 2022 rates shock.

   Shape
   ─────
   History {start:'YYYY-MM', end:'YYYY-MM', months:string[],
            assetClass:{[id]:number[]},         monthly returns, fractions
            instrument:{[id]:(number|null)[]}}  null before inception or when
                                                no history exists
   A backend returns the same shape from stored observations.
   ───────────────────────────────────────────────────────────────────────── */
(function () {
  'use strict';
  var PA = window.PA, U = PA.util, D = PA.data, A = D.assumptions;

  var start = '2012-01', end = '2026-10';
  var n = U.ym.diff(start, end) + 1;
  var months = [];
  for (var i = 0; i < n; i++) months.push(U.ym.add(start, i));

  var order = A.order, k = order.length;
  var L = U.mat.cholesky(A.correlation);
  var rng = U.rng(20261101);

  /* monthly drift and vol from the annual assumptions */
  var mu = order.map(function (id) {
    var ac = A.assetClasses[id], r = A.riskFree + ac.alpha;
    A.factors.forEach(function (f) { r += ac.betas[f.id] * f.premium; });
    return r / 100 / 12;
  });
  var sig = order.map(function (id) { return A.assetClasses[id].vol / 100 / Math.sqrt(12); });

  /* episodes: month → multiplier on sleeve-level shocks (fractions) */
  var shock = {};
  var put = function (ym, s) { shock[ym] = s; };
  put('2016-01', { us_eq: -0.05, intl_eq: -0.06, em_eq: -0.065, pe: -0.06, hy: -0.02, cmd: -0.04, govt: 0.012 });
  put('2016-02', { us_eq: -0.01, intl_eq: -0.02, em_eq: -0.01, cmd: -0.02, govt: 0.01 });
  put('2018-12', { us_eq: -0.09, intl_eq: -0.06, em_eq: -0.03, pe: -0.08, hy: -0.02, govt: 0.015 });
  put('2020-02', { us_eq: -0.08, intl_eq: -0.08, em_eq: -0.05, pe: -0.07, hy: -0.015, cmd: -0.05, govt: 0.02, re: -0.02 });
  put('2020-03', { us_eq: -0.125, intl_eq: -0.14, em_eq: -0.155, pe: -0.16, ig: -0.07, hy: -0.115, cmd: -0.12, hf: -0.05, re: -0.06, infra: -0.09, govt: 0.01, cash: 0 });
  put('2020-04', { us_eq: 0.12, intl_eq: 0.07, em_eq: 0.09, pe: 0.10, ig: 0.045, hy: 0.045, hf: 0.025, re: 0.015 });
  put('2020-11', { us_eq: 0.10, intl_eq: 0.13, em_eq: 0.09, pe: 0.11, hy: 0.03, re: 0.05, infra: 0.06 });
  put('2022-01', { us_eq: -0.055, intl_eq: -0.04, em_eq: -0.02, pe: -0.06, govt: -0.02, ig: -0.025, hy: -0.025 });
  put('2022-03', { govt: -0.03, ig: -0.025, cmd: 0.08 });
  put('2022-04', { us_eq: -0.09, intl_eq: -0.065, em_eq: -0.055, pe: -0.09, govt: -0.03, ig: -0.04, hy: -0.035, re: -0.02 });
  put('2022-06', { us_eq: -0.085, intl_eq: -0.08, em_eq: -0.065, pe: -0.09, govt: -0.015, ig: -0.025, hy: -0.065, cmd: -0.08 });
  put('2022-09', { us_eq: -0.095, intl_eq: -0.09, em_eq: -0.11, pe: -0.08, govt: -0.04, ig: -0.045, hy: -0.04, re: -0.05, infra: -0.06 });
  put('2022-10', { govt: -0.01, ig: -0.005, us_eq: 0.08, intl_eq: 0.05 });
  put('2022-11', { us_eq: 0.05, intl_eq: 0.11, em_eq: 0.14, govt: 0.03, ig: 0.04, hy: 0.03 });
  put('2023-03', { us_eq: 0.02, ig: -0.01, hy: -0.015, govt: 0.025 });
  put('2024-08', { us_eq: -0.03, intl_eq: -0.02, em_eq: 0.0, govt: 0.015 });
  put('2025-04', { us_eq: -0.06, intl_eq: -0.04, em_eq: -0.05, pe: -0.06, hy: -0.02, cmd: -0.06, govt: 0.008 });
  put('2025-05', { us_eq: 0.065, intl_eq: 0.045, em_eq: 0.04, pe: 0.05, hy: 0.015 });

  /* correlated noise, de-meaned per asset class so a single seed cannot tilt
     fifteen years of history away from the model it is meant to illustrate */
  var noise = order.map(function () { return []; });
  for (var m = 0; m < n; m++) {
    var z = [], c;
    for (c = 0; c < k; c++) z.push(rng.normal());
    var e = L.map(function (row) { var s = 0; for (var j = 0; j < k; j++) s += row[j] * z[j]; return s; });
    for (c = 0; c < k; c++) noise[c].push(e[c]);
  }
  noise.forEach(function (series) { var mean = series.reduce(function (a, b) { return a + b; }, 0) / series.length; for (var i = 0; i < series.length; i++) series[i] -= mean; });

  /* what the 2012–2026 sample actually paid relative to the model: a bull
     market in equities and private markets, a thin decade for bonds */
  var realised = { us_eq: 0.0035, intl_eq: 0.0012, em_eq: -0.0005, pe: 0.0040, govt: -0.0012, ig: -0.0006, hy: 0.0002, cash: -0.0008, hf: -0.0010, re: 0.0004, cmd: -0.0015, infra: 0.0008 };

  var assetClass = {};
  order.forEach(function (id) { assetClass[id] = []; });
  for (var m2 = 0; m2 < n; m2++) {
    for (var c2 = 0; c2 < k; c2++) {
      var id = order[c2];
      var r = mu[c2] + (realised[id] || 0) + sig[c2] * noise[c2][m2] * 0.78; /* episodes supply the rest of the variance */
      var sh = shock[months[m2]];
      if (sh && sh[id] != null) r += sh[id];
      assetClass[id].push(Math.round(r * 1e5) / 1e5);
    }
  }

  /* smoothing for quarterly-valued assets: appraisal series lag and damp */
  var smooth = function (series, w) {
    var out = [], prev = null;
    for (var i = 0; i < series.length; i++) {
      var v = series[i];
      if (v == null) { out.push(null); prev = null; continue; }
      var s = prev == null ? v : prev * (1 - w) + v * w;
      out.push(s); prev = s;
    }
    return out;
  };

  /* instrument series: asset class + alpha + idiosyncratic noise, from inception */
  var instrument = {};
  D.instruments.forEach(function (ins) {
    var base = assetClass[ins.assetClass];
    var r2 = U.rng(U.hash(ins.id));
    var isIndex = ins.type === 'Index';
    var idio = isIndex ? 0.0004 : ins.type === 'Security' ? 0.045 : ins.type === 'ETF' ? 0.0015 : 0.009;
    var alpha = isIndex ? 0 : (ins.type === 'ETF' ? -0.0002 : (U.hash(ins.id) % 7 - 3) * 0.0004) - (ins.fee || 0) / 10000 / 12;
    var since = U.ym.toIndex(ins.inception) - U.ym.toIndex(start);
    var out = [];
    for (var i = 0; i < n; i++) {
      if (ins.coverage === 'none' || i < since) { out.push(null); continue; }
      out.push(Math.round((base[i] + alpha + idio * r2.normal()) * 1e5) / 1e5);
    }
    if (ins.valuation === 'quarterly') out = smooth(out, 0.45);
    instrument[ins.id] = out;
  });

  D.history = { start: start, end: end, months: months, assetClass: assetClass, instrument: instrument };
})();

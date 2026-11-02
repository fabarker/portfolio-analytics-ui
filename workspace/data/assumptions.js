/* ─────────────────────────────────────────────────────────────────────────
   Mock data · the platform's capital-market assumptions (base case)
   A small factor model keeps every figure coherent:

     expected return_i = riskFree + alpha_i + Σ_f beta_if · premium_f
     covariance        = B Λ Bᵀ + diag(idiosyncratic)

   so an override to a factor premium in a scenario flows through to every
   asset class that loads on it, and the base correlation matrix is positive
   semi-definite by construction. Volatilities are targets; the idiosyncratic
   term tops each asset class up to its target.

   Shape
   ─────
   Assumptions {asOf, model, riskFree, factors:[{id, premium, vol}],
                factorCorrelation:number[][],
                assetClasses:{[id]:{alpha, vol, betas:{[factorId]:number}}},
                order:string[], correlation:number[][]}
   All returns, premia and volatilities are annual percentages.
   ───────────────────────────────────────────────────────────────────────── */
(function () {
  'use strict';
  var PA = window.PA;
  var D = PA.data;

  var factors = [
    { id: 'equity',    premium: 5.0, vol: 15.0 },
    { id: 'rates',     premium: 0.8, vol: 5.0 },
    { id: 'credit',    premium: 1.5, vol: 4.0 },
    { id: 'cmd',       premium: 1.5, vol: 15.0 },
    { id: 'fx',        premium: 0.0, vol: 7.0 },
    { id: 'inflation', premium: 0.3, vol: 3.0 }
  ];
  /* modest factor correlations, order as above */
  var factorCorrelation = [
    [1.00, -0.15, 0.55, 0.30, 0.25, 0.10],
    [-0.15, 1.00, 0.10, -0.10, 0.05, -0.35],
    [0.55, 0.10, 1.00, 0.25, 0.20, 0.00],
    [0.30, -0.10, 0.25, 1.00, 0.30, 0.55],
    [0.25, 0.05, 0.20, 0.30, 1.00, 0.10],
    [0.10, -0.35, 0.00, 0.55, 0.10, 1.00]
  ];

  var A = function (alpha, vol, eq, rates, credit, cmd, fx, infl) {
    return { alpha: alpha, vol: vol, betas: { equity: eq, rates: rates, credit: credit, cmd: cmd, fx: fx, inflation: infl } };
  };
  var assetClasses = {
    us_eq:   A(0.2, 16.0, 1.00, -0.10, 0.10, 0.00, 0.00, -0.10),
    intl_eq: A(0.3, 17.0, 0.95, -0.05, 0.10, 0.05, 0.60, 0.00),
    em_eq:   A(0.8, 21.0, 1.10, 0.00, 0.20, 0.15, 0.80, 0.10),
    pe:      A(2.0, 22.0, 1.20, 0.00, 0.20, 0.00, 0.10, 0.10),
    govt:    A(0.0, 6.0,  -0.05, 1.00, 0.00, 0.00, 0.00, -0.40),
    ig:      A(0.1, 7.0,  0.10, 0.80, 1.00, 0.00, 0.00, -0.30),
    hy:      A(0.3, 10.0, 0.40, 0.30, 1.60, 0.05, 0.00, 0.00),
    cash:    A(0.0, 0.6,  0.00, 0.05, 0.00, 0.00, 0.00, 0.10),
    hf:      A(1.5, 7.0,  0.30, 0.05, 0.20, 0.10, 0.05, 0.00),
    re:      A(0.8, 14.0, 0.50, 0.40, 0.20, 0.00, 0.00, 0.50),
    cmd:     A(0.0, 18.0, 0.20, -0.10, 0.00, 1.00, 0.20, 0.80),
    infra:   A(1.0, 12.0, 0.50, 0.30, 0.20, 0.10, 0.10, 0.60)
  };
  var order = D.assetClasses.map(function (a) { return a.id; });

  /* Σ = B Λ Bᵀ + diag(idio) ; R = Σ / (σσ) */
  var fl = factors.map(function (f) { return f.vol; });
  var Lam = factorCorrelation.map(function (row, i) { return row.map(function (r, j) { return r * fl[i] * fl[j]; }); });
  var B = order.map(function (id) { return factors.map(function (f) { return assetClasses[id].betas[f.id]; }); });
  var n = order.length, Sigma = [];
  for (var i = 0; i < n; i++) {
    Sigma.push([]);
    for (var j = 0; j < n; j++) {
      var s = 0;
      for (var f = 0; f < factors.length; f++) for (var g = 0; g < factors.length; g++) s += B[i][f] * Lam[f][g] * B[j][g];
      Sigma[i].push(s);
    }
  }
  /* idiosyncratic top-up to the target vol; if the factor part already
     exceeds the target, scale the row/column down to it */
  var scale = order.map(function (id, k) { var t = assetClasses[id].vol; var m = Math.sqrt(Sigma[k][k]); return m > t ? t / m : 1; });
  for (var i2 = 0; i2 < n; i2++) for (var j2 = 0; j2 < n; j2++) Sigma[i2][j2] *= scale[i2] * scale[j2];
  var correlation = [];
  for (var i3 = 0; i3 < n; i3++) {
    correlation.push([]);
    var ti = assetClasses[order[i3]].vol;
    for (var j3 = 0; j3 < n; j3++) {
      var tj = assetClasses[order[j3]].vol;
      correlation[i3].push(i3 === j3 ? 1 : Math.round(Sigma[i3][j3] / (ti * tj) * 100) / 100);
    }
  }

  D.assumptions = {
    asOf: '2026-10-31',
    model: 'Platform CMA v2026.Q4',
    riskFree: 3.2,
    factors: factors,
    factorCorrelation: factorCorrelation,
    assetClasses: assetClasses,
    order: order,
    correlation: correlation
  };
})();

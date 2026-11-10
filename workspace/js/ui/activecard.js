/* ─────────────────────────────────────────────────────────────────────────
   Portfolio Analytics · the Active risk & return card
   For every compared allocation (or the selected row of each): total return
   and risk split into passive (the benchmark) and active (departures from
   it), with tracking error, information ratio and active share; then where
   the tracking error comes from (factor by factor plus specific, from the
   factor model) and where the active return comes
   from. Both are attributed by one grouping the user switches in the card:
   factor (with specific), category, asset class or product. Return by
   category or asset class is allocation and selection; by product, active
   weight times excess return; by factor, active exposure times the premium
   implied by the model. On the historical basis,
   rolling tracking error and cumulative active return.
   ───────────────────────────────────────────────────────────────────────── */
(function () {
  'use strict';
  var PA = window.PA, U = PA.util, esc = U.esc, S = PA.store, UI = PA.ui, D = PA.data, F = U.fmt, V = UI.viz, C = PA.cards, H = C.h, I = U.icon;
  var VIEWS = [['summary', 'Summary'], ['risk', 'Risk sources'], ['return', 'Return sources'], ['time', 'Over time']];

  function pickOptions() {
    var out = D.benchmarks.map(function (b) { return ['benchmark:' + b.id, 'Benchmark · ' + b.name]; });
    if (S.ws) S.ws.allocations.forEach(function (a) { out.push(['allocation:' + a.id, 'Allocation · ' + a.name + (a.kind === 'snapshot' ? ' (snapshot)' : '')]); });
    Object.keys(UI.sleeves.known).forEach(function (id) { var s = UI.sleeves.known[id]; if (!s.archived) out.push(['sleeve:' + id, 'Sleeve · ' + s.name + ' v' + UI.sleeves.latest(s).v]); });
    D.instruments.filter(function (i) { return i.type === 'Index'; }).forEach(function (i) { out.push(['instrument:' + i.id, 'Index · ' + i.name]); });
    D.instruments.filter(function (i) { return i.type !== 'Index'; }).forEach(function (i) { out.push(['instrument:' + i.id, 'Product · ' + i.name]); });
    return out;
  }
  function pickLabel(v) { var o = pickOptions().filter(function (x) { return x[0] === v; })[0]; return o ? o[1].replace(/^[^·]+· /, '') : 'a picked benchmark'; }
  /** The request's against: the picked allocation or sleeve travels with the request. */
  var STEPS = PA.chain.DECISION_OPTIONS, STEP_UPPER = PA.chain.DECISION_VS;
  function against(s) {
    if (s.against === 'step') return Promise.resolve({ mode: 'step', step: s.step || 'selection' });
    if (s.against !== 'pick') return Promise.resolve({ mode: s.against });
    var p = String(s.pick || '').split(':'), kind = p[0], id = p[1];
    if (kind === 'allocation') { var a = S.allocation(id); return Promise.resolve(a ? { mode: 'pick', ref: { kind: 'allocation', id: id, label: a.name, allocation: U.clone(a) } } : { mode: 'pick', ref: {} }); }
    if (kind === 'sleeve') {
      var build = function () { var sl = UI.sleeves.known[id]; if (!sl) return { mode: 'pick', ref: {} }; var v = UI.sleeves.latest(sl); return { mode: 'pick', ref: { kind: 'sleeve', id: id, version: v.v, label: sl.name + ' v' + v.v, holdings: v.holdings.map(function (h) { return { instrumentId: h.instrumentId, weight: h.weight }; }) } }; };
      return UI.sleeves.known[id] ? Promise.resolve(build()) : UI.sleeves.refresh().then(build);
    }
    return Promise.resolve({ mode: 'pick', ref: { kind: kind, id: id } });
  }
  function againstLabel(ctx, s) {
    if (s.against === 'step') { var st = s.step || 'selection'; return STEP_UPPER[st] + ' (' + PA.chain.decisionTag(st) + ')'; }
    if (s.against === 'own') return 'each subject’s own benchmark';
    if (s.against === 'pick') return pickLabel(s.pick);
    var c = ctx.ws.comparison;
    if (c.referenceMode === 'individual') return 'each allocation’s benchmark';
    if (c.referenceMode === 'policy') return 'the benchmark each allocation is attributed against';
    if (c.referenceMode === 'portfolio') { var a = S.allocation(c.referencePortfolioId); return a ? a.name : 'a compared portfolio'; }
    var b = D.benchmarkById[c.sharedBenchmarkId]; return b ? b.name : 'the shared benchmark';
  }
  function viewOf(card) { var v = card.settings && card.settings.view; return VIEWS.some(function (x) { return x[0] === v; }) ? v : 'summary'; }
  function seriesOf(data, a) { return data.series.filter(function (x) { return x.allocationId === a.id; })[0]; }
  function focusOf(card, ctx) {
    var st = C.state[card.id] || {}, ids = ctx.members.map(function (a) { return a.id; });
    if (st.focus && ids.indexOf(st.focus) >= 0) return st.focus;
    var act = ctx.ws.comparison.activeId; return ids.indexOf(act) >= 0 ? act : ids[0];
  }
  var pct = function (v, dp) { return v == null ? '<span class="faint">—</span>' : F.num(v, dp == null ? 1 : dp); };
  var sgn = function (v, dp) { return v == null ? '<span class="faint">—</span>' : '<span class="' + (v > 1e-9 ? 'pos' : v < -1e-9 ? 'neg' : '') + '">' + F.signed(v, dp == null ? 2 : dp) + '</span>'; };
  /** A diverging bar on a symmetric scale. */
  function dbar(v, max, color) { var w = max > 0 ? Math.min(Math.abs(v) / max, 1) * 50 : 0; return '<span class="act-track" aria-hidden="true"><span class="act-zero"></span><i style="left:' + (v >= 0 ? 50 : 50 - w) + '%;width:' + w + '%;background:' + (color || 'var(--cat-1)') + '"></i></span>'; }
  function chips(ctx, focus) { return '<div class="act-chips" role="group" aria-label="Allocation to decompose">' + ctx.members.map(function (a) { return '<button type="button" data-act-focus="' + esc(a.id) + '" aria-pressed="' + (a.id === focus) + '"><span class="dot" style="background:' + H.colorOf(a) + '"></span>' + esc(a.name) + '</button>'; }).join('') + '</div>'; }
  /* factors get their own navy-to-violet range, so they never read as category colours */
  var PAL = ['#12233f', '#2f4f86', '#4f74b3', '#7b9bd0', '#5b4a9e', '#8a79c6', '#3d6f73', '#6aa0a3', '#7a6248', '#a8906f'];

  function summaryView(data, ctx, s, card) {
    var passive = s.showPassive !== false, focus = focusOf(card, ctx), notes = [];
    var head = '<tr><th>Allocation</th><th>Measured against</th><th class="num">Return</th>' + (passive ? '<th class="num">Passive</th>' : '') + '<th class="num">Active</th><th class="num">Risk</th>' + (passive ? '<th class="num">Passive</th>' : '') + '<th class="num">Tracking error</th><th class="num">Info. ratio</th><th class="num" data-tip="Half the sum of absolute differences in the asset-class mix">Active share</th></tr>';
    var rows = ctx.members.map(function (a) {
      var x = seriesOf(data, a), name = '<td><span class="dot" style="background:' + H.colorOf(a) + '"></span> ' + esc(x && x.subject ? x.subject.label : a.name) + '</td>';
      if (!x) return '';
      if (x.reason) return '<tr>' + name + '<td>' + esc(x.benchmark && x.benchmark.label || '—') + '</td><td colspan="' + (passive ? 8 : 6) + '" class="faint">— ' + esc(x.reason) + '</td></tr>';
      if (x.benchmark.note) notes.push(a.name + ': ' + x.benchmark.note + '.');
      if (x.unallocated > 1e-9) notes.push(a.name + ': ' + F.num(x.unallocated) + '% unallocated earns nothing, so it counts as an active underweight.');
      return '<tr' + (a.id === focus ? ' class="is-focus"' : '') + '>' + name + '<td>' + esc(x.benchmark.label) + (x.scenarioApplied ? ' <span class="tag tag-info">Scenario</span>' : '') + '</td><td class="num">' + pct(x.totalReturn) + '</td>' + (passive ? '<td class="num">' + pct(x.passiveReturn) + '</td>' : '') + '<td class="num">' + sgn(x.activeReturn) + '</td><td class="num">' + pct(x.totalRisk) + '</td>' + (passive ? '<td class="num">' + pct(x.passiveRisk) + '</td>' : '') + '<td class="num"><b>' + pct(x.activeRisk, 2) + '</b></td><td class="num">' + (x.informationRatio == null ? '<span class="faint" data-tip="No active risk: the allocation matches what it is measured against">— no active risk</span>' : F.num(x.informationRatio, 2)) + '</td><td class="num">' + F.num(x.activeShare, 0) + '%</td></tr>';
    }).join('');
    var fx = S.allocation(focus) && seriesOf(data, S.allocation(focus)), eq = '';
    if (fx && !fx.reason) {
      eq = '<div class="act-eq"><b>' + esc(S.allocation(focus).name) + '</b>: return ' + F.num(fx.totalReturn, 2) + ' = passive ' + F.num(fx.passiveReturn, 2) + ' + active ' + F.signed(fx.activeReturn, 2) + (s.returnMethod === 'geometric' ? ' (geometric)' : '') +
        (fx.activePassiveCorr != null ? ' · risk² ' + F.num(fx.totalRisk * fx.totalRisk, 1) + ' = ' + F.num(fx.passiveRisk * fx.passiveRisk, 1) + ' + ' + F.num(fx.activeRisk * fx.activeRisk, 2) + ' + 2 × ' + F.num(fx.activePassiveCorr, 2) + ' × ' + F.num(fx.passiveRisk, 1) + ' × ' + F.num(fx.activeRisk, 2) : '') + '</div>';
    }
    data.series.forEach(function (x) { if (x.coverage) notes.push(x.coverage + '.'); });
    var method = data.basis === 'forward' ? 'Return from the platform assumptions' + (ctx.scenario ? ' (scenario where applied)' : '') + '; risk from the ' + D.factorModelById[data.factorModel].name + ' factor model' + (ctx.scenario ? ', which the scenario does not change' : '') + '.' : 'Realised over ' + (data.period ? data.period.label : 'the period') + ': tracking error is the volatility of monthly active returns, annualised.';
    return '<div class="tblwrap act-tbl"><table class="tbl"><thead>' + head + '</thead><tbody>' + rows + '</tbody></table></div>' + H.foot(uniq(notes).map(function (n) { return '<span>' + esc(n) + '</span>'; }).join('')) + C.notes(card, [eq, esc(method), 'Active share is half the sum of absolute differences in the asset-class mix.', s.against === 'step' ? 'One decision: each allocation with a benchmark is shown after the decision, measured against the portfolio before it. The Decision chain card shows every decision together.' : null]);
  }
  function uniq(a) { var seen = {}; return a.filter(function (x) { if (seen[x]) return false; seen[x] = 1; return true; }); }

  var BY = [['factor', 'Factor'], ['category', 'Category'], ['assetClass', 'Asset class'], ['product', 'Product']];
  var byOf = function (s) { return BY.some(function (b) { return b[0] === s.decompose; }) ? s.decompose : 'factor'; };
  var byName = { factor: 'factor', category: 'category', assetClass: 'asset class', product: 'product' };
  /** The attribution switch: one grouping for both the risk and the return sources. */
  function bySwitch(s) { var by = byOf(s); return '<div class="act-by" role="group" aria-label="Attribute by"><span>By</span>' + BY.map(function (b) { return '<button type="button" data-act-by="' + b[0] + '" aria-pressed="' + (b[0] === by) + '">' + b[1] + '</button>'; }).join('') + '</div>'; }
  function head(ctx, focus, s) { return '<div class="act-head">' + chips(ctx, focus) + bySwitch(s) + '</div>'; }

  function unitsOf(s) { return s.riskUnits === 'var99' ? { k: 2.3263, name: '99% value at risk, 1 year (parametric)', col: 'VaR part', short: '99% VaR' } : s.riskUnits === 'es99' ? { k: 2.6652, name: '99% expected shortfall, 1 year (parametric)', col: 'ES part', short: '99% ES' } : { k: 1, name: 'Tracking error', col: 'Contribution', short: 'Tracking error' }; }
  function riskView(data, ctx, s, card) {
    var focus = focusOf(card, ctx), a = S.allocation(focus), x = a && seriesOf(data, a);
    if (!x || x.reason) return head(ctx, focus, s) + '<div class="chart-empty">' + esc(x && x.reason || 'Nothing to attribute') + '</div>';
    var src = x.riskSources.slice(), mode = byOf(s);
    if (mode === 'factor') src.push({ key: '__specific', label: 'Specific', contribution: x.specific, color: '#c3cedb' });
    /* risk units: tracking error, or parametric 99% value at risk or expected shortfall of the active return (each source's contribution scaled, the expected active return subtracted once) */
    var ru = unitsOf(s), k = ru.k, unitName = ru.name;
    var max = Math.max.apply(null, src.map(function (r) { return Math.abs(r.contribution * k); }).concat([0.01])), te = x.modelTE;
    var pos = src.filter(function (r) { return r.contribution > 0; }), posSum = U.sum(pos, function (r) { return r.contribution; });
    var colorFor = function (r, i) { return r.color || PAL[i % PAL.length]; };
    var stack = '<div class="act-stack" role="img" aria-label="Tracking error by source">' + src.map(function (r, i) { return r.contribution > 0 ? '<i style="width:' + (r.contribution / posSum * 100) + '%;background:' + colorFor(r, i) + '" data-tip="' + esc(r.label + ' ' + F.num(r.contribution, 2)) + '"></i>' : ''; }).join('') + '</div>';
    var list = '<table class="tbl act-src"><thead><tr><th>' + (mode === 'factor' ? 'Factor · ' + esc(D.factorModelById[data.factorModel].name) : mode === 'category' ? 'Category' : mode === 'assetClass' ? 'Asset class' : 'Product') + '</th><th class="num">' + esc(ru.col) + '</th><th class="bar-col"></th><th class="num" data-tip="Share of the tracking error">Share</th></tr></thead><tbody>' +
      src.map(function (r, i) { return '<tr><td><span class="sw" style="background:' + colorFor(r, i) + '"></span>' + esc(r.label) + '</td><td class="num">' + F.signed(r.contribution * k, 2) + '</td><td class="bar-col">' + dbar(r.contribution * k, max, colorFor(r, i)) + '</td><td class="num">' + (te > 0 ? F.num(r.contribution / te * 100, 0) + '%' : '—') + '</td></tr>'; }).join('') +
      (k !== 1 ? '<tr><td>Less the expected active return</td><td class="num">' + F.signed(-x.activeReturn, 2) + '</td><td></td><td></td></tr>' : '') +
      '<tr class="total"><td>' + esc(unitName) + '</td><td class="num">' + F.num(k !== 1 ? te * k - x.activeReturn : te, 2) + '</td><td></td><td class="num">100%</td></tr></tbody></table>';
    var eq = mode === 'factor' ? '<div class="act-eq">Tracking error ' + F.num(te, 2) + ' = factors ' + F.num(te - x.specific, 2) + ' + specific ' + F.num(x.specific, 2) + ' (contributions, % a year)</div>' : '<div class="act-eq">Contributions by ' + byName[mode] + ' sum to the tracking error of ' + F.num(te, 2) + '% a year; each includes its specific risk.</div>';
    if (s.sources === 'waterfall') return head(ctx, focus, s) + '<div class="viz-host" data-wf-draw="risk"></div>' + H.foot(x.coverage ? '<span>' + esc(x.coverage) + '.</span>' : '') + C.notes(card, [eq, x.riskSourcesNote ? esc(x.riskSourcesNote) : null, 'A negative step offsets risk from the others.']);
    return head(ctx, focus, s) + stack + '<div class="tblwrap">' + list + '</div>' + H.foot(x.coverage ? '<span>' + esc(x.coverage) + '.</span>' : '') + C.notes(card, [eq, x.riskSourcesNote ? esc(x.riskSourcesNote) : null, 'Negative contributions offset others (hedges); the bar draws only the positive ones.']);
  }

  /** The return-source table for the attribution in force. */
  function returnTable(x, mode) {
    var rows = x.returnSources, t = x.returnTotals;
    if (mode === 'factor') {
      var mf = Math.max.apply(null, rows.map(function (r) { return Math.abs(r.contribution); }).concat([0.01]));
      return '<table class="tbl act-src"><thead><tr><th>Factor</th><th class="num" data-tip="Active exposure: the allocation’s loading less the benchmark’s">Active β</th><th class="num" data-tip="Premium the factor earns, % a year">Premium</th><th class="num">Contribution</th><th class="bar-col"></th></tr></thead><tbody>' +
        rows.map(function (r, i) { var c = r.color || PAL[i % PAL.length]; return '<tr><td><span class="sw" style="background:' + c + '"></span>' + esc(r.label) + '</td><td class="num">' + (r.exposure == null ? '<span class="faint">—</span>' : F.signed(r.exposure, 2)) + '</td><td class="num">' + (r.premium == null ? '<span class="faint">—</span>' : F.num(r.premium, 2)) + '</td><td class="num">' + sgn(r.contribution) + '</td><td class="bar-col">' + dbar(r.contribution, mf, c) + '</td></tr>'; }).join('') +
        '<tr class="total"><td>Active return</td><td></td><td></td><td class="num">' + F.signed(t.arithmetic, 2) + '</td><td></td></tr></tbody></table>';
    }
    if (mode === 'product') {
      var mp = Math.max.apply(null, rows.map(function (r) { return Math.abs(r.contribution); }).concat([0.01]));
      return '<table class="tbl act-src"><thead><tr><th>Product</th><th class="num">Weight</th><th class="num">Bench.</th><th class="num">Return</th><th class="num" data-tip="Active weight × (return − benchmark return)">Contribution</th><th class="bar-col"></th></tr></thead><tbody>' +
        rows.map(function (r) { return '<tr><td><span class="sw" style="background:' + (r.color || '#c3cedb') + '"></span>' + esc(r.label) + '</td><td class="num">' + F.num(r.weight, 1) + '</td><td class="num">' + F.num(r.benchWeight, 1) + '</td><td class="num">' + (r.ret == null ? '<span class="faint">—</span>' : F.num(r.ret, 1)) + '</td><td class="num">' + sgn(r.contribution) + '</td><td class="bar-col">' + dbar(r.contribution, mp, r.color) + '</td></tr>'; }).join('') +
        '<tr class="total"><td>Active return</td><td></td><td></td><td></td><td class="num">' + F.signed(t.attributed, 2) + '</td><td></td></tr></tbody></table>';
    }
    var max = Math.max.apply(null, rows.map(function (r) { return Math.max(Math.abs(r.allocation), Math.abs(r.selection)); }).concat([0.01]));
    return '<table class="tbl act-src"><thead><tr><th>' + (mode === 'assetClass' ? 'Asset class' : 'Category') + '</th><th class="num">Weight</th><th class="num">Bench.</th><th class="num">Allocation</th><th class="bar-col"></th><th class="num">Selection</th><th class="bar-col"></th></tr></thead><tbody>' +
      rows.map(function (r) { return '<tr><td><span class="sw" style="background:' + r.color + '"></span>' + esc(r.short) + '</td><td class="num">' + F.num(r.weight, 1) + '</td><td class="num">' + F.num(r.benchWeight, 1) + '</td><td class="num">' + sgn(r.allocation) + '</td><td class="bar-col">' + dbar(r.allocation, max, r.color) + '</td><td class="num">' + sgn(r.selection) + '</td><td class="bar-col">' + dbar(r.selection, max, r.color) + '</td></tr>'; }).join('') +
      '<tr class="total"><td>Total</td><td></td><td></td><td class="num">' + F.signed(t.allocation, 2) + '</td><td></td><td class="num">' + F.signed(t.selection, 2) + '</td><td></td></tr></tbody></table>';
  }
  function returnView(data, ctx, s, card) {
    var focus = focusOf(card, ctx), a = S.allocation(focus), x = a && seriesOf(data, a), mode = byOf(s);
    if (!x || x.reason) return head(ctx, focus, s) + '<div class="chart-empty">' + esc(x && x.reason || 'Nothing to attribute') + '</div>';
    var t = x.returnTotals, fwd = data.basis === 'forward';
    var eq = '<div class="act-eq">' + (mode === 'factor' ? (fwd ? 'Benchmark ' + F.num(x.passiveReturn, 2) + ' + factors ' + F.signed(t.factor, 2) + ' + specific ' + F.signed(t.specific, 2) + ' = ' + esc(a.name) + ' ' + F.num(x.passiveReturn + t.arithmetic, 2) : 'Factors ' + F.signed(t.factor, 2) + ' + specific ' + F.signed(t.specific, 2) + ' = ' + F.signed(t.arithmetic, 2) + ' pp a year')
      : mode === 'product' ? (fwd ? 'Benchmark ' + F.num(x.passiveReturn, 2) + ' + product contributions ' + F.signed(t.attributed, 2) + ' = ' + esc(a.name) + ' ' + F.num(x.passiveReturn + t.attributed, 2) : 'Product contributions sum to ' + F.signed(t.attributed, 2) + ' pp a year')
      : (fwd ? 'Benchmark ' + F.num(x.passiveReturn, 2) + ' + allocation ' + F.signed(t.allocation, 2) + ' + selection ' + F.signed(t.selection, 2) + ' = ' + esc(a.name) + ' ' + F.num(x.passiveReturn + t.allocation + t.selection, 2) : 'Allocation ' + F.signed(t.allocation, 2) + ' + selection ' + F.signed(t.selection, 2) + ' = ' + F.signed(t.allocation + t.selection, 2) + ' pp a year')) + '</div>';
    var how = mode === 'factor' ? 'Factor: the allocation’s active exposure to each factor of the ' + D.factorModelById[data.factorModel].name + ' model times the premium it earns. The premia are implied from the ' + (fwd ? 'platform’s expected returns' : 'asset-class index returns over the period') + ' by a cross-sectional regression on the model’s loadings. Specific is the rest: what the products earn beyond their factor exposures.'
      : mode === 'product' ? 'Product: each holding’s active weight (its weight less the benchmark’s) times its return over the benchmark’s return. Holdings the benchmark has but the allocation does not appear as benchmark only.'
      : 'Allocation: being over- or underweight ' + (mode === 'assetClass' ? 'an asset class' : 'a category') + ', times how it did against the whole benchmark. Selection: what the products returned against the benchmark’s own holdings in it (its index where it holds none).';
    var notes = [how, mode === 'category' ? 'A category the reference does not hold is measured against its category index; a category added to the workspace has none, so its selection effect is zero.' : null, x.returnSourcesNote, s.returnMethod === 'geometric' ? 'The headline active return is geometric; the sources are arithmetic.' : null].filter(Boolean).map(esc);
    if (s.sources === 'waterfall') return head(ctx, focus, s) + '<div class="viz-host" data-wf-draw="return"></div>' + C.notes(card, [eq].concat(notes));
    return head(ctx, focus, s) + '<div class="tblwrap">' + returnTable(x, mode) + '</div>' + C.notes(card, [eq].concat(notes));
  }

  function timeView(body, data, ctx) {
    if (data.basis !== 'historical') { body.querySelector('.act-view').innerHTML = '<div class="chart-empty">Tracking error over time needs observed returns. <button type="button" class="btn btn-sm" data-act-hist>Show historical instead</button></div>'; return; }
    var host = body.querySelector('.act-view'), months = null, te = [], cum = [];
    ctx.members.forEach(function (a) { var x = seriesOf(data, a); if (x && x.over) { months = x.over.months; te.push({ id: a.id, name: a.name, color: H.colorOf(a), values: x.over.te36, dim: H.dim(ctx, a) }); cum.push({ id: a.id, name: a.name, color: H.colorOf(a), values: x.over.cumActive, dim: H.dim(ctx, a) }); } });
    if (!months) { host.innerHTML = '<div class="chart-empty">Not enough overlapping history with the benchmark.</div>'; return; }
    host.innerHTML = H.legend(ctx) + '<div class="act-two"><div><div class="act-sub">Rolling 36-month tracking error, % a year</div><div class="viz-host" data-v="te"></div></div><div><div class="act-sub">Cumulative active return, %</div><div class="viz-host" data-v="cum"></div></div></div>';
    var h = Math.max(140, (body.clientHeight - 130));
    V.lineChart(host.querySelector('[data-v="te"]'), { xs: months, series: te, height: h, fmt: function (v) { return F.num(v, 1) + '%'; }, aria: 'Rolling 36-month tracking error' });
    V.lineChart(host.querySelector('[data-v="cum"]'), { xs: months, series: cum, height: h, baseline: 0, fmt: function (v) { return F.num(v, 1) + '%'; }, aria: 'Cumulative active return' });
    H.wireLegend(host);
  }

  C.register({ id: 'active-risk', title: 'Active risk & return', description: 'Return and risk split into passive (the benchmark) and active, with tracking error, information ratio, active share, and where the active risk and return come from.', group: 'Forward-looking', size: { w: 12, h: 8 }, min: { w: 6, h: 5 }, basis: 'either', supportsRow: true, factorModel: true,
    entries: [{ settings: { basis: 'forward' } }, { title: 'Realised active risk & return', description: 'Realised tracking error, active return and information ratio over the period, with where they came from.', group: 'Historical', settings: { basis: 'historical' } }],
    settings: [
      { key: 'against', label: 'Active against', type: 'select', options: [['reference', 'Follow the Reference (context bar)'], ['own', 'Each subject’s own benchmark'], ['pick', 'Pick one…'], ['step', 'One decision…']], default: 'reference' },
      { key: 'step', label: 'Decision', type: 'select', options: STEPS, default: 'selection', when: function (s) { return s.against === 'step'; }, hint: 'The portfolio after the decision is measured against the one before it, for each allocation with a benchmark.' },
      { key: 'pick', label: 'Benchmark, product, allocation or sleeve', type: 'select', options: function () { return pickOptions(); }, default: 'benchmark:bm_6040', when: function (s) { return s.against === 'pick'; } },
      { key: 'decompose', label: 'Attribute risk and return by', type: 'select', options: [['factor', 'Factor (the factor model)'], ['category', 'Category'], ['assetClass', 'Asset class'], ['product', 'Product']], default: 'factor' },
      { key: 'returnMethod', label: 'Active return', type: 'select', options: [['arithmetic', 'Arithmetic difference'], ['geometric', 'Geometric']], default: 'arithmetic' },
      { key: 'showPassive', label: 'Show passive figures', type: 'toggle', default: true },
      { key: 'sources', label: 'Risk and return sources', type: 'select', options: [['table', 'Table with bars'], ['waterfall', 'Waterfall']], default: 'waterfall' },
      { key: 'riskUnits', label: 'Risk units', type: 'select', options: [['te', 'Tracking error'], ['var99', '99% VaR, 1 year (parametric)'], ['es99', '99% expected shortfall, 1 year (parametric)']], default: 'te' }],
    subtitle: function (ctx, s, card) { return 'vs ' + againstLabel(ctx, s) + H.rowSuffix(ctx, card) + C.modelDeparture(card) + ' · % a year'; },
    data: function (ctx, s, card) {
      return against(s).then(function (ag) {
        return C.fetch('activeAnalysis', { revision: ctx.revision, allocations: U.clone(ctx.members), rowKey: card.followRow ? ctx.row : '__total', basis: ctx.basis, period: U.clone(ctx.prefs.period), scenario: U.clone(ctx.scenario), factorModel: C.modelIdOf(card), returnMethod: s.returnMethod, decompose: s.decompose, reference: U.clone(ctx.ws.comparison), against: ag });
      });
    },
    render: function (body, data, ctx, s, card) {
      var view = viewOf(card);
      body.innerHTML = '<div class="act-tabs" role="tablist" aria-label="Views">' + VIEWS.map(function (v) { return '<button type="button" role="tab" data-act-view="' + v[0] + '" aria-selected="' + (v[0] === view) + '" tabindex="' + (v[0] === view ? 0 : -1) + '">' + v[1] + '</button>'; }).join('') + '</div><div class="act-view" role="tabpanel"></div>';
      var host = body.querySelector('.act-view');
      if (!ctx.members.length) host.innerHTML = '<div class="chart-empty">No allocations in the comparison.</div>';
      else if (view === 'summary') host.innerHTML = summaryView(data, ctx, s, card);
      else if (view === 'risk') host.innerHTML = riskView(data, ctx, s, card);
      else if (view === 'return') host.innerHTML = returnView(data, ctx, s, card);
      else timeView(body, data, ctx);
      var wfh = host.querySelector('[data-wf-draw]');
      if (wfh) { var fa = S.allocation(focusOf(card, ctx)), fx = fa && seriesOf(data, fa);
        if (wfh.dataset.wfDraw === 'risk') { var srcs = fx.riskSources.slice(); if (byOf(s) === 'factor') srcs.push({ key: '__specific', label: 'Specific', contribution: fx.specific, color: H.SPECIFIC_INK }); var ru = unitsOf(s), wsteps = srcs.map(function (r) { return { label: r.label, value: r.contribution * ru.k, color: r.color || H.FACTOR_INK }; }); if (ru.k !== 1) wsteps.push({ label: 'Less expected active return', value: -fx.activeReturn, color: H.SPECIFIC_INK }); V.waterfall(wfh, { height: Math.max(170, body.clientHeight - 110), steps: wsteps, total: { label: ru.short, color: UI.colorOf(fa) }, unit: 'pp', dp: 2, aria: 'Waterfall of ' + fa.name + '’s ' + ru.short.toLowerCase() + ' by source' }); }
        else { var bm = byOf(s); V.waterfall(wfh, { height: Math.max(170, body.clientHeight - 110), start: { label: 'Benchmark · ' + fx.benchmark.label, value: fx.passiveReturn, color: 'var(--ink-3)' }, steps: fx.returnSources.map(function (r, i) { return { label: r.short || r.label, value: r.contribution, color: r.color || (bm === 'factor' ? H.FACTOR_INK : '#c3cedb'), tip: (r.short || r.label) + (r.allocation != null ? ' (allocation ' + F.signed(r.allocation, 2) + ', selection ' + F.signed(r.selection, 2) + ')' : r.exposure != null ? ' (active β ' + F.signed(r.exposure, 2) + ' × premium ' + F.num(r.premium, 2) + ')' : '') }; }), total: { label: fa.name + ' · attributed', color: UI.colorOf(fa) }, unit: '%', dp: 2, aria: 'Waterfall from the benchmark return to ' + fa.name + '’s return, by ' + byName[bm] }); } }
      var setView = function (v, focusTab) { var c = S.card(card.id), p = U.clone(c.settings || {}); p.view = v; S.updateCard(c.id, { settings: p }); if (focusTab) setTimeout(function () { var el = document.querySelector('[data-card="' + CSS.escape(card.id) + '"] [data-act-view="' + v + '"]'); if (el) el.focus(); }, 0); };
      U.on(body, 'click', '[data-act-view]', function (e, b) { setView(b.dataset.actView); });
      U.on(body, 'keydown', '[data-act-view]', function (e, b) { if (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft') return; e.preventDefault(); var ids = VIEWS.map(function (v) { return v[0]; }), i = ids.indexOf(b.dataset.actView); setView(ids[(i + (e.key === 'ArrowRight' ? 1 : ids.length - 1)) % ids.length], true); });
      U.on(body, 'click', '[data-act-focus]', function (e, b) { C.state[card.id].focus = b.dataset.actFocus; C.repaint(card.id); var nb = document.querySelector('[data-card="' + CSS.escape(card.id) + '"] [data-act-focus="' + CSS.escape(b.dataset.actFocus) + '"]'); if (nb) nb.focus(); });
      U.on(body, 'click', '[data-act-hist]', function () { C.setBasis(card, 'historical'); });
      U.on(body, 'click', '[data-act-by]', function (e, b) { var c = S.card(card.id), p = U.clone(c.settings || {}); p.decompose = b.dataset.actBy; S.updateCard(c.id, { settings: p }); });
    },
    dataTable: function (data, ctx) {
      return V.table([{ label: 'Allocation' }, { label: 'Against' }, { label: 'Return', num: true }, { label: 'Passive', num: true }, { label: 'Active', num: true }, { label: 'Risk', num: true }, { label: 'Passive', num: true }, { label: 'Tracking error', num: true }, { label: 'Info. ratio', num: true }, { label: 'Active share', num: true }],
        ctx.members.map(function (a) { var x = seriesOf(data, a); if (!x || x.reason) return { cells: [esc(a.name), esc(x && x.reason || '—'), '—', '—', '—', '—', '—', '—', '—', '—'] }; return { cells: [esc(a.name), esc(x.benchmark.label), F.num(x.totalReturn, 2), F.num(x.passiveReturn, 2), F.signed(x.activeReturn, 2), F.num(x.totalRisk, 2), F.num(x.passiveRisk, 2), F.num(x.activeRisk, 2), x.informationRatio == null ? '—' : F.num(x.informationRatio, 2), F.num(x.activeShare, 0) + '%'] }; }), { maxHeight: '220px' });
    }
  });
})();

/* ─────────────────────────────────────────────────────────────────────────
   Portfolio Analytics · the forward-looking, historical and structure suite
   Cards that can be dropped into any workspace. Each reads one basis, stated
   at the start of its subtitle (see cards.js), and shares the context bar:
   forward cards follow the scenario where it applies; historical cards
   follow the period; every card measures against the reference.
   ───────────────────────────────────────────────────────────────────────── */
(function () {
  'use strict';
  var PA = window.PA, U = PA.util, esc = U.esc, S = PA.store, UI = PA.ui, D = PA.data, F = U.fmt, V = UI.viz, C = PA.cards, H = C.h;
  var colorOf = H.colorOf, dim = H.dim;
  var one = function (data, a) { return (data.series || []).filter(function (q) { return q.allocationId === a.id; })[0] || null; };
  var dot = function (a) { return '<span class="dot" style="background:' + colorOf(a) + ';width:8px;height:8px"></span> '; };
  var na = function (why) { return '<span class="faint" data-tip="' + esc(why || 'Unavailable') + '">—</span>'; };
  var ref = function () { return UI.context.referenceLabel(); };
  /* one forward-suite request shared by the forward cards (one fetch per revision) */
  function fwdReq(ctx, extra) { return Object.assign({ revision: ctx.revision, allocations: U.clone(ctx.members), reference: U.clone(ctx.ws.comparison), scenario: U.clone(ctx.scenario), horizon: null, target: null }, extra || {}); }
  function histReq(ctx) { return { revision: ctx.revision, allocations: U.clone(ctx.members), reference: U.clone(ctx.ws.comparison), period: U.clone(ctx.prefs.period) }; }
  function activeHist(ctx, s, method) { var st = s && s.step && s.step !== 'none' ? s.step : null; return C.fetch('activeAnalysis', { revision: ctx.revision, allocations: U.clone(ctx.members), rowKey: '__total', basis: 'historical', period: U.clone(ctx.prefs.period), scenario: null, factorModel: C.workspaceModel(), returnMethod: 'arithmetic', decompose: 'category', reference: U.clone(ctx.ws.comparison), against: st ? { mode: 'step', step: st } : { mode: 'reference' }, method: method || null }); }
  /* ── a chain step instead of the reference (cards that measure against something) ── */
  var STEP_OPTS = [['none', 'The Reference (context bar)'], ['saa', 'Chain step S1 · Policy → SAA'], ['mapping', 'Chain step S2 · SAA → Product benchmarks'], ['selection', 'Chain step S3 · Product benchmarks → Portfolio'], ['policyToPortfolio', 'Chain · Policy → Portfolio']];
  var STEP_UP = { saa: 'the policy benchmark', mapping: 'the SAA', selection: 'the product benchmarks', policyToPortfolio: 'the policy benchmark' }, STEP_CD = { saa: 'S1', mapping: 'S2', selection: 'S3', policyToPortfolio: 'policy → portfolio' };
  var stepSetting = { key: 'step', label: 'Measure against', type: 'select', options: STEP_OPTS, default: 'none' };
  var vsOf = function (s) { return s && s.step && s.step !== 'none' ? STEP_UP[s.step] + ' (chain step ' + STEP_CD[s.step] + ')' : ref(); };
  var stepNote = function (s) { return s && s.step && s.step !== 'none' ? 'Each allocation with a decision chain shows the step’s lower level measured against its upper level; allocations without a chain show why not.' : null; };
  var cv = function () { return PA.chain.conventionsOf(S.ws); };
  var wsOpt = function (key) { return ['workspace', 'Workspace default (' + PA.chain.LABELS[key][cv()[key]] + ')']; };
  function attrMethod(s) { var c = cv(), w = function (v, k) { return !v || v === 'workspace' ? c[k] : v; }; return { model: w(s.model, 'attributionModel'), interaction: w(s.interaction, 'interaction'), linking: w(s.linking, 'linking') }; }
  var scenarioNote = function (ctx, data) { return ctx.scenario ? (data.series.some(function (x) { return x.scenarioApplied; }) ? 'Scenario “' + esc(ctx.scenario.name) + '” applies to the allocations in its scope; the others and the reference use the base case.' : 'Scenario “' + esc(ctx.scenario.name) + '” applies to none of these allocations.') : null; };

  /* ══ forward-looking ══════════════════════════════════════════════ */

  /* ── Expected return & risk ──────────────────────────────────────── */
  C.register({ id: 'expected-risk-return', title: 'Expected return & risk', description: 'Each allocation and the reference on one chart of expected return against risk.', group: 'Forward-looking', size: { w: 6, h: 6 }, min: { w: 4, h: 4 }, basis: 'forward',
    settings: [],
    subtitle: function (ctx) { return '% a year · whole portfolio' + H.scenarioSuffix(ctx); },
    data: function (ctx) { return C.fetch('forwardSuite', fwdReq(ctx)); },
    render: function (body, data, ctx, s, card) {
      var pts = ctx.members.map(function (a) { var x = one(data, a), ok = x && !x.reason; return { label: a.name, color: colorOf(a), x: ok ? x.vol : null, y: ok ? x.ret : null, dim: dim(ctx, a), tip: ok ? a.name + ': expected return ' + F.num(x.ret, 1) + '%, risk ' + F.num(x.vol, 1) + '%, Sharpe ratio ' + (x.sharpe == null ? '—' : F.num(x.sharpe, 2)) + (x.scenarioApplied ? ' (scenario)' : '') : '' }; });
      var refs = {}; data.series.forEach(function (x) { if (x.reference && x.reference.label && !refs[x.reference.label]) refs[x.reference.label] = x.reference; });
      Object.keys(refs).forEach(function (l) { var r = refs[l]; pts.push({ label: l, color: 'var(--ink-2)', x: r.vol, y: r.ret, hollow: true, tip: l + ' (reference): expected return ' + F.num(r.ret, 1) + '%, risk ' + F.num(r.vol, 1) + '%' }); });
      body.innerHTML = H.legend(ctx) + '<div class="viz-host"></div>' + H.foot('<span class="legend-note">◇ reference</span>') + C.notes(card, ['Expected return from the platform assumptions (' + esc(D.assumptions.model) + '); risk is volatility from the asset-class covariance.', scenarioNote(ctx, data), 'Up and to the left is better: more return for the same risk.']);
      V.scatter(body.querySelector('.viz-host'), { points: pts, xLabel: 'Risk (volatility), % a year', yLabel: 'Expected return, % a year', xName: 'risk', yName: 'return', height: Math.max(180, body.clientHeight - 84), aria: 'Expected return against risk for ' + ctx.members.length + ' allocations and the reference' });
      H.wireLegend(body);
    },
    dataTable: function (data, ctx) { return V.table([{ label: 'Allocation' }, { label: 'Expected return', num: true }, { label: 'Risk', num: true }, { label: 'Sharpe ratio', num: true }, { label: 'Reference' }], ctx.members.map(function (a) { var x = one(data, a); return { cells: x && !x.reason ? [esc(a.name), F.num(x.ret, 2), F.num(x.vol, 2), x.sharpe == null ? '—' : F.num(x.sharpe, 2), esc(x.reference.label || '—')] : [esc(a.name), '—', '—', '—', '—'] }; }), { maxHeight: '200px' }); } });

  /* ── Probability of outcomes ─────────────────────────────────────── */
  var TARGETS = [['cash3', 'Cash + 3% a year'], ['4', '4% a year'], ['5', '5% a year'], ['6', '6% a year'], ['7', '7% a year']];
  C.register({ id: 'outcomes', title: 'Probability of outcomes', description: 'The chance of a loss in a year, of trailing cash, and of meeting a target return over the horizon.', group: 'Forward-looking', size: { w: 6, h: 5 }, min: { w: 4, h: 3 }, basis: 'forward',
    settings: [{ key: 'target', label: 'Target return', type: 'select', options: TARGETS, default: 'cash3' }],
    subtitle: function (ctx, s) { return 'Probability, % · target ' + (TARGETS.filter(function (t) { return t[0] === s.target; })[0] || TARGETS[0])[1].replace(' a year', '') + ' over ' + ctx.prefs.horizon + ' years' + H.scenarioSuffix(ctx); },
    data: function (ctx, s) { return C.fetch('forwardSuite', fwdReq(ctx, { horizon: ctx.prefs.horizon, target: s.target === 'cash3' ? D.assumptions.riskFree + 3 : Number(s.target) })); },
    render: function (body, data, ctx, s, card) {
      var cell = function (v, a) { return v == null ? na() : '<span class="pcell"><b>' + F.num(v, 0) + '</b>' + V.cellBar(v, 100, colorOf(a)) + '</span>'; };
      var x0 = data.series.filter(function (x) { return !x.reason; })[0];
      body.innerHTML = V.table([{ label: 'Allocation' }, { label: '<span data-tip="A negative return in any one year">Loss in a year</span>', num: true }, { label: '<span data-tip="A return below the cash rate in any one year">Below cash</span>', num: true }, { label: '<span data-tip="' + esc('An annualised return of at least ' + F.num(x0 ? x0.target : 0, 1) + '% over ' + ctx.prefs.horizon + ' years') + '">Meets target</span>', num: true }], ctx.members.map(function (a) { var x = one(data, a); return { cells: [dot(a) + esc(a.name)].concat(x && !x.reason ? [cell(x.pLoss, a), cell(x.pCash, a), cell(x.pTarget, a)] : [na(), na(), na()]) }; }), { maxHeight: '100%', caption: 'Probability of outcomes', cls: 'prob-tbl' }) +
        C.notes(card, ['From expected return and volatility, assuming normally distributed annual returns. Cash is ' + F.num(data.riskFree, 1) + '% a year (' + esc(data.currency) + ' 3-month rate).', 'Meeting the target means an annualised return at or above it over the whole horizon. The horizon is set in the context bar.', scenarioNote(ctx, data)]);
    } });

  /* ── Value at risk & expected shortfall ──────────────────────────── */
  C.register({ id: 'var-es', title: 'Value at risk & expected shortfall', description: 'One-year loss thresholds at 95% or 99% confidence, with the average loss beyond.', group: 'Forward-looking', size: { w: 6, h: 6 }, min: { w: 4, h: 4 }, basis: 'forward',
    settings: [{ key: 'level', label: 'Confidence', type: 'select', options: [['95', '95%'], ['99', '99%']], default: '95' }],
    subtitle: function (ctx, s) { return 'One-year loss at ' + s.level + '% confidence, % · whole portfolio' + H.scenarioSuffix(ctx); },
    data: function (ctx) { return C.fetch('forwardSuite', fwdReq(ctx)); },
    render: function (body, data, ctx, s, card) {
      var k = s.level === '99' ? '99' : '95';
      body.innerHTML = H.legend(ctx) + '<div class="viz-host"></div>' + C.notes(card, ['Value at risk: the one-year loss exceeded with ' + (k === '99' ? '1%' : '5%') + ' probability. Expected shortfall: the average loss in that worst ' + (k === '99' ? '1%' : '5%') + '. Both assume normally distributed returns and are shown as losses.', 'A negative value means even the bad outcome is a gain.', scenarioNote(ctx, data)]);
      V.groupedBars(body.querySelector('.viz-host'), { groups: ['Value at risk', 'Expected shortfall'], series: ctx.members.map(function (a) { var x = one(data, a), ok = x && !x.reason; return { name: a.name, color: colorOf(a), dim: dim(ctx, a), values: ok ? [x['var' + k], x['es' + k]] : [null, null] }; }), unit: '%', dp: 1, height: Math.max(160, body.clientHeight - 70), aria: 'Value at risk and expected shortfall at ' + k + '% for ' + ctx.members.length + ' allocations' });
      H.wireLegend(body);
    },
    dataTable: function (data, ctx) { return V.table([{ label: 'Allocation' }, { label: 'VaR 95%', num: true }, { label: 'ES 95%', num: true }, { label: 'VaR 99%', num: true }, { label: 'ES 99%', num: true }], ctx.members.map(function (a) { var x = one(data, a); return { cells: [esc(a.name)].concat(x && !x.reason ? [F.num(x.var95, 1), F.num(x.es95, 1), F.num(x.var99, 1), F.num(x.es99, 1)] : ['—', '—', '—', '—']) }; }), { maxHeight: '200px' }); } });

  /* ── Hypothetical stress tests ───────────────────────────────────── */
  function stressName(t, data) { return t.id === 'fx' ? data.currency + ' +10% against other currencies' : t.name; }
  C.register({ id: 'stress-tests', title: 'Hypothetical stress tests', description: 'Instant shocks to equities, rates, credit spreads, the reporting currency, inflation and commodities, alone and combined.', group: 'Forward-looking', size: { w: 6, h: 8 }, min: { w: 4, h: 5 }, basis: 'forward',
    settings: [],
    subtitle: function () { return 'Instant impact on the portfolio, % · Axioma factor exposures'; },
    data: function (ctx) { return C.fetch('forwardSuite', fwdReq(ctx)); },
    render: function (body, data, ctx, s, card) {
      var tests = data.stress;
      body.innerHTML = H.legend(ctx) + '<div class="viz-host"></div>' + C.notes(card, ['Each shock moves factor returns at once and is applied to the portfolio’s exposures under the Axioma factor model, which holds every shocked factor; specific risk is ignored.', 'Shocks: ' + tests.map(function (t) { return esc(stressName(t, data)) + (t.combined ? ' (' + Object.keys(t.shocks).map(function (f) { return esc((D.factorModelById.axioma.factorById[f] || { name: f }).name) + ' ' + F.signed(t.shocks[f], 1); }).join(', ') + ')' : ''); }).join('; ') + '.', 'Scenarios in the drawer do not change these results.']);
      V.hBars(body.querySelector('.viz-host'), { rows: tests.map(function (t) { return stressName(t, data); }), series: ctx.members.map(function (a) { var x = one(data, a), ok = x && !x.reason; return { name: a.name, color: colorOf(a), dim: dim(ctx, a), values: tests.map(function (t, i) { return ok ? x.stress[i].value : null; }) }; }), unit: '%', dp: 1, signed: true, aria: 'Hypothetical stress test results for ' + ctx.members.length + ' allocations' });
      H.wireLegend(body);
    },
    dataTable: function (data, ctx) { return V.table([{ label: 'Shock' }].concat(ctx.members.map(function (a) { return { label: esc(a.name), num: true }; })), data.stress.map(function (t, i) { return { cells: [esc(stressName(t, data))].concat(ctx.members.map(function (a) { var x = one(data, a); return x && !x.reason ? F.signed(x.stress[i].value, 2) : '—'; })) }; }), { maxHeight: '220px' }); } });

  /* ── Risk by factor ──────────────────────────────────────────────── */
  C.register({ id: 'factor-risk', title: 'Risk by factor', description: 'Expected risk split into each factor and specific risk, under the factor model.', group: 'Forward-looking', size: { w: 6, h: 6 }, min: { w: 4, h: 4 }, basis: 'forward', factorModel: true,
    settings: [{ key: 'units', label: 'Units', type: 'select', options: [['vol', 'Contribution to volatility (pp)'], ['share', 'Share of total risk (%)']], default: 'vol' }, { key: 'view', label: 'View', type: 'select', options: [['table', 'Table · every allocation'], ['waterfall', 'Waterfall · one allocation']], default: 'waterfall' }],
    subtitle: function (ctx, s, card) { return (s.units === 'share' ? '% share of total risk' : 'pp of portfolio volatility') + ' · by factor and specific' + C.modelDeparture(card); },
    data: function (ctx, s, card) { return C.fetch('factorRisk', { allocations: U.clone(ctx.members), rowKey: '__total', factorModel: C.modelIdOf(card) }); },
    render: function (body, data, ctx, s, card) {
      var m = D.factorModelById[data.factorModel], share = s.units === 'share';
      var live = data.factors.filter(function (f) { return data.series.some(function (x) { return x.byFactor && Math.abs(x.byFactor[f.id]) >= 0.005; }); }).concat([{ id: '__specific', name: 'Specific' }]);
      var val = function (x, id) { if (!x || x.total == null) return null; var v = id === '__specific' ? x.specific : x.byFactor[id]; return share ? (x.total > 0 ? v / x.total * 100 : null) : v; };
      if (s.view === 'waterfall') { var wa = H.wfAlloc(card, ctx), wx = wa ? one(data, wa) : null;
        body.innerHTML = H.wfTabs(card, ctx, wa) + '<div class="viz-host"></div>' + H.foot(H.modelFoot([wx && wx.coverage])) + C.notes(card, ['Euler contributions: each factor’s and the specific part add up to ' + (share ? '100% of the risk' : 'the volatility') + ' under the ' + esc(m.name) + ' factor model.', 'A negative step means the factor offsets risk from the others.']);
        if (wx && wx.total != null) V.waterfall(body.querySelector('.viz-host'), { height: Math.max(170, body.clientHeight - 80), steps: live.map(function (f) { return { label: f.name, value: val(wx, f.id), color: f.id === '__specific' ? H.SPECIFIC_INK : H.FACTOR_INK }; }), total: { label: share ? 'Total risk' : 'Volatility', color: colorOf(wa) }, unit: share ? '%' : 'pp', dp: share ? 1 : 2, aria: 'Waterfall of ' + wa.name + '’s risk by factor' }); else body.querySelector('.viz-host').innerHTML = '<div class="chart-empty">Unavailable for this allocation.</div>';
        H.wireWf(body, card); return; }
      var max = 0; data.series.forEach(function (x) { live.forEach(function (f) { var v = val(x, f.id); if (v != null) max = Math.max(max, Math.abs(v)); }); });
      var cell = function (v, a) { return v == null ? na() : '<span class="pcell"><b>' + F.num(v, share ? 0 : 2) + '</b>' + V.cellBar(v, max, colorOf(a)) + '</span>'; };
      body.innerHTML = V.table([{ label: 'Source · ' + esc(m.name) }].concat(ctx.members.map(function (a) { return { label: dot(a) + esc(a.name), num: true }; })), live.map(function (f) { return { cells: [esc(f.name)].concat(ctx.members.map(function (a) { return cell(val(one(data, a), f.id), a); })) }; }).concat([{ cls: 'total', cells: ['Volatility'].concat(ctx.members.map(function (a) { var x = one(data, a); return x && x.total != null ? F.num(x.total, 2) + '%' : na(); })) }]), { maxHeight: '100%', caption: 'Risk by factor', cls: 'prob-tbl' }) +
        H.foot(H.modelFoot(data.series.map(function (x) { return x.coverage; }))) + C.notes(card, ['Euler contributions: each factor’s and the specific part sum to the allocation’s volatility under the ' + esc(m.name) + ' factor model (' + esc(m.long) + ', as of ' + F.date(m.asOf) + ').', 'A negative contribution means the factor offsets risk from the others.']);
    } });

  /* ── Factors over time (heat map) ────────────────────────────────── */
  var FH_MEASURES = { exposure: { label: 'Exposure (β)', dp: 2 }, risk: { label: 'Risk contribution (pp of volatility)', dp: 2 }, ret: { label: 'Return contribution (pp)', dp: 2 } };
  C.register({ id: 'factor-history', title: 'Factors over time', description: 'Factor exposure, risk contribution or return contribution year by year, as a heat map, for one allocation at a time.', group: 'Historical', size: { w: 12, h: 6 }, min: { w: 6, h: 4 }, basis: 'historical', factorModel: true,
    settings: [{ key: 'measure', label: 'Measure', type: 'select', options: [['exposure', 'Exposure (β)'], ['risk', 'Risk contribution'], ['ret', 'Return contribution']], default: 'risk' },
      { key: 'step', label: 'Show', type: 'select', options: [['none', 'The whole portfolio'], ['saa', 'Chain step S1 · active, Policy → SAA'], ['mapping', 'Chain step S2 · active, SAA → Product benchmarks'], ['selection', 'Chain step S3 · active, Product benchmarks → Portfolio'], ['policyToPortfolio', 'Chain · active, Policy → Portfolio']], default: 'none' }],
    subtitle: function (ctx, s, card) { return FH_MEASURES[s.measure].label + ' · each calendar year · ' + (s.step && s.step !== 'none' ? 'active, chain step ' + STEP_CD[s.step] : 'whole portfolio') + C.modelDeparture(card); },
    data: function (ctx, s, card) { return C.fetch('factorHistory', { allocations: U.clone(ctx.members), period: U.clone(ctx.prefs.period), factorModel: C.modelIdOf(card), step: s.step && s.step !== 'none' ? s.step : null }); },
    render: function (body, data, ctx, s, card) {
      var m = D.factorModelById[data.factorModel], wa = H.wfAlloc(card, ctx), x = wa ? one(data, wa) : null, h = x && x.history, meas = s.measure, dp = FH_MEASURES[meas].dp;
      if (!h || !h.years.length) { body.innerHTML = H.wfTabs(card, ctx, wa) + '<div class="chart-empty">' + esc((x && x.reason) || 'Fewer than six months of history in the period.') + '</div>'; H.wireWf(body, card); return; }
      var src = meas === 'exposure' ? h.exposure : meas === 'risk' ? h.risk : h.ret, thr = meas === 'exposure' ? 0.02 : 0.01;
      var live = h.factors.filter(function (f) { return src[f.id].some(function (v) { return Math.abs(v) >= thr; }); });
      var rows = live.map(function (f) { return { label: f.name, values: src[f.id] }; }), extra = [];
      if (meas === 'risk') extra = [{ label: 'Specific', values: h.totals.specificRisk }, { label: h.active ? 'Realised tracking error' : 'Realised volatility', values: h.totals.risk, total: true }];
      if (meas === 'ret') extra = [{ label: 'Specific', values: h.totals.specificRet }, { label: h.active ? 'Cash (net weight difference)' : 'Cash (risk-free)', values: h.totals.cash }, { label: h.active ? 'Calendar-year active return' : 'Calendar-year return', values: h.totals.ret, total: true }];
      var max = 0; rows.concat(extra.filter(function (r) { return !r.total; })).forEach(function (r) { r.values.forEach(function (v) { if (v != null) max = Math.max(max, Math.abs(v)); }); });
      var cell = function (r, i) { var v = r.values[i], y = h.years[i]; if (v == null) return '<span class="faint">—</span>'; var t = esc(wa.name + ' · ' + r.label + ' · ' + y.year + (y.partial ? ' (part year)' : '') + ': ' + F.num(v, dp) + (meas === 'exposure' ? '' : meas === 'risk' && r.total ? '%' : ' pp')); return r.total ? '<span class="heat is-year" data-tip="' + t + '">' + F.num(v, r.total ? 1 : dp) + '</span>' : '<span class="heat" style="background:' + V.shade(v, max) + '" data-tip="' + t + '">' + F.num(v, dp) + '</span>'; };
      var note = (h.active ? 'Active position of the chain step: ' + esc(x.label || '') + '. ' : '') + (meas === 'exposure' ? 'Exposures are estimated for each calendar year from that year’s monthly returns.' : meas === 'risk' ? 'Each year’s factor and specific contributions add up to that year’s realised ' + (h.active ? 'tracking error' : 'volatility') + ', split using the ' + esc(m.name) + ' factor covariances.' : 'Factor contributions are the year’s exposure times the factor premia implied by that year’s asset-class returns; cash and specific make up the rest of the calendar-year ' + (h.active ? 'active return' : 'return') + '.');
      body.innerHTML = H.wfTabs(card, ctx, wa) + V.table([{ label: (meas === 'exposure' ? 'Factor' : 'Source') + ' · ' + esc(m.name) }].concat(h.years.map(function (y) { return { label: y.year + (y.partial ? '<sup aria-label="part year">*</sup>' : ''), num: true }; })),
        rows.concat(extra).map(function (r) { return { cls: r.total ? 'total' : '', cells: [esc(r.label)].concat(h.years.map(function (y, i) { return cell(r, i); })) }; }), { maxHeight: '100%', caption: 'Factors over time', cls: 'heat-tbl fh-tbl' }) +
        C.notes(card, [note, h.years.some(function (y) { return y.partial; }) ? '* Part year: the period starts or ends within it.' : null, 'Blue is positive, orange negative; deeper shades are larger.']);
      H.wireWf(body, card);
    },
    dataTable: function (data, ctx, s, card) { var wa = H.wfAlloc(card, ctx), x = wa ? one(data, wa) : null, h = x && x.history; if (!h) return ''; var src = s.measure === 'exposure' ? h.exposure : s.measure === 'risk' ? h.risk : h.ret; return V.table([{ label: 'Factor' }].concat(h.years.map(function (y) { return { label: String(y.year), num: true }; })), h.factors.map(function (f) { return { cells: [esc(f.name)].concat(src[f.id].map(function (v) { return F.num(v, 2); })) }; }), { maxHeight: '220px' }); } });

  /* ── Return contribution by category ─────────────────────────────── */
  C.register({ id: 'return-contribution', title: 'Return contribution by category', description: 'What each category adds to the portfolio’s return; the contributions add up to the total.', group: 'Forward-looking', size: { w: 6, h: 6 }, min: { w: 4, h: 4 }, basis: 'either',
    entries: [{ settings: { basis: 'forward' } }, { title: 'Realised return contribution by category', description: 'What each category added to the realised, annualised return over the period.', group: 'Historical', settings: { basis: 'historical' } }],
    settings: [{ key: 'view', label: 'View', type: 'select', options: [['bars', 'Bars · every allocation'], ['waterfall', 'Waterfall · one allocation']], default: 'waterfall' }],
    subtitle: function (ctx) { return 'pp of portfolio return, ' + (ctx.basis === 'historical' ? 'annualised' : 'a year') + ' · by category' + H.scenarioSuffix(ctx); },
    data: function (ctx) { return C.fetch('analyzeTable', { revision: ctx.revision, allocations: U.clone(ctx.members), basis: ctx.basis, metric: 'return', values: 'absolute', riskUnits: 'share', factors: [], reference: U.clone(ctx.ws.comparison), period: U.clone(ctx.prefs.period), scenario: U.clone(ctx.scenario) }); },
    render: function (body, data, ctx, s, card) {
      var cats = data.rows.filter(function (r) { return r.kind === 'category'; }), get = function (a, key) { var c = data.cells[a.id] && data.cells[a.id][key]; if (!c) return null; var cell = c.scenario || c.base; return cell ? cell.value : null; };
      var notes = C.notes(card, [ctx.basis === 'historical' ? H.periodNote(data, 'products without history are left out and say so in Drivers & differences') : 'Weight times expected return, from the platform assumptions (' + esc(D.assumptions.model) + ')' + (data.scenarioApplies ? '; scenario values where the scenario applies' : '') + '.', 'Index-level weight earns its category index; unallocated weight earns nothing.']);
      if (s.view === 'waterfall') {
        var wa = H.wfAlloc(card, ctx);
        body.innerHTML = H.wfTabs(card, ctx, wa) + '<div class="viz-host"></div>' + notes;
        if (wa) V.waterfall(body.querySelector('.viz-host'), { height: Math.max(170, body.clientHeight - 80), steps: cats.map(function (r) { var c = D.categoryById[r.key]; return { label: c.short, value: get(wa, r.key), color: c.color }; }), total: { label: ctx.basis === 'historical' ? 'Realised return' : 'Expected return', color: colorOf(wa) }, unit: '%', dp: 2, aria: 'Waterfall of ' + wa.name + '’s return by category' });
        H.wireWf(body, card); return;
      }
      body.innerHTML = H.legend(ctx) + '<div class="viz-host"></div>' + notes;
      V.groupedBars(body.querySelector('.viz-host'), { groups: cats.map(function (r) { return D.categoryById[r.key].short; }), series: ctx.members.map(function (a) { return { name: a.name, color: colorOf(a), dim: dim(ctx, a), values: cats.map(function (r) { return get(a, r.key); }) }; }), unit: 'pp', dp: 2, height: Math.max(160, body.clientHeight - 70), aria: 'Return contribution by category for ' + ctx.members.length + ' allocations' });
      H.wireLegend(body);
    },
    dataTable: function (data, ctx) { var cats = data.rows.filter(function (r) { return r.kind === 'category' || r.kind === 'total'; }); return V.table([{ label: 'Category' }].concat(ctx.members.map(function (a) { return { label: esc(a.name), num: true }; })), cats.map(function (r) { return { cls: r.kind === 'total' ? 'total' : '', cells: [esc(r.label)].concat(ctx.members.map(function (a) { var c = data.cells[a.id] && data.cells[a.id][r.key], cell = c && (c.scenario || c.base); return cell && cell.value != null ? F.num(cell.value, 2) : '—'; })) }; }), { maxHeight: '220px' }); } });

  /* ── Diversification ─────────────────────────────────────────────── */
  C.register({ id: 'diversification', title: 'Diversification', description: 'Effective number of bets and the diversification ratio, with the largest source of risk.', group: 'Forward-looking', size: { w: 6, h: 4 }, min: { w: 4, h: 3 }, basis: 'forward',
    settings: [],
    subtitle: function (ctx) { return 'Whole portfolio · by category' + H.scenarioSuffix(ctx); },
    data: function (ctx) { return C.fetch('forwardSuite', fwdReq(ctx)); },
    render: function (body, data, ctx, s, card) {
      body.innerHTML = V.table([{ label: 'Allocation' }, { label: '<span data-tip="Effective number of bets">Effective bets</span>', num: true }, { label: '<span data-tip="Diversification ratio">Div. ratio</span>', num: true }, { label: 'Largest risk', num: true }, { label: 'Risk', num: true }], ctx.members.map(function (a) {
        var x = one(data, a); if (!x || x.reason) return { cells: [dot(a) + esc(a.name), na(), na(), na(), na()] };
        var top = x.categoryShares.slice().sort(function (p, q) { return q.share - p.share; })[0];
        return { cells: [dot(a) + esc(a.name), '<span class="pcell"><b>' + F.num(x.enb, 1) + '</b>' + V.cellBar(x.enb, D.categories.length, colorOf(a)) + '</span>', F.num(x.divRatio, 2), top ? esc(D.categoryById[top.id].short) + ' <b>' + F.num(top.share, 0) + '%</b>' : '—', F.num(x.vol, 1) + '%'] };
      }), { maxHeight: '100%', caption: 'Diversification', cls: 'prob-tbl' }) +
        C.notes(card, ['Effective number of bets: 1 ÷ the sum of squared category shares of risk. ' + D.categories.length + ' would be risk spread evenly across every category; 1 is all the risk in one.', 'Diversification ratio: the weighted sum of each holding’s stand-alone volatility divided by the portfolio’s. Higher means more risk cancels out.', scenarioNote(ctx, data)]);
    } });

  /* ══ historical ═══════════════════════════════════════════════════ */

  /* ── Monthly returns ─────────────────────────────────────────────── */
  var MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  function monthlyOf(card) { var id = card.settings && card.settings.allocation, m = S.ws ? S.members() : []; return m.filter(function (a) { return a.id === id; })[0] || m.filter(function (a) { return a.id === S.ws.comparison.activeId; })[0] || m[0] || null; }
  C.register({ id: 'monthly-returns', title: 'Monthly returns', description: 'One allocation’s return in every month of the period, year by year.', group: 'Historical', size: { w: 12, h: 6 }, min: { w: 6, h: 4 }, basis: 'historical',
    settings: [{ key: 'allocation', label: 'Allocation', type: 'select', options: function () { return S.members().map(function (a) { return [a.id, a.name]; }); }, default: '' }],
    subtitle: function (ctx, s, card) { var a = monthlyOf(card); return (a ? a.name : 'No allocation') + ' · monthly return, %'; },
    data: function (ctx) { return C.fetch('historyPack', { allocations: U.clone(ctx.members), period: U.clone(ctx.prefs.period) }); },
    render: function (body, data, ctx, s, card) {
      var a = monthlyOf(card), x = a ? one(data, a) : null;
      if (!x || !x.returns) { body.innerHTML = '<div class="chart-empty">No history for this allocation in the period.</div>'; return; }
      var byYear = {}, max = 0; data.months.forEach(function (m, i) { var y = m.slice(0, 4), v = x.returns[i]; (byYear[y] = byYear[y] || {})[Number(m.slice(5)) - 1] = v == null ? null : v * 100; if (v != null) max = Math.max(max, Math.abs(v * 100)); });
      var cal = {}; (x.calendar || []).forEach(function (c) { cal[c.year] = c; });
      var cell = function (v, tip) { return v == null ? '<span class="faint">·</span>' : '<span class="heat" style="background:' + V.shade(v, max) + '" data-tip="' + esc(tip) + '">' + F.num(v, 1) + '</span>'; };
      body.innerHTML = '<div class="mr-head">' + dot(a) + '<b>' + esc(a.name) + '</b> <span class="faint small">· ' + esc(x.basisLabel) + '</span></div>' + V.table([{ label: 'Year' }].concat(MONTHS.map(function (m) { return { label: m, num: true }; })).concat([{ label: 'Year', num: true }]), Object.keys(byYear).sort().reverse().map(function (y) { var c = cal[y]; return { cells: [y].concat(MONTHS.map(function (m, i) { return cell(byYear[y][i], m + ' ' + y + ': ' + (byYear[y][i] == null ? '' : F.num(byYear[y][i], 2) + '%')); })).concat([c && c.ret != null ? cell(c.ret, y + (c.partial ? ' (partial year)' : '') + ': ' + F.num(c.ret, 1) + '%').replace('class="heat"', 'class="heat is-year"').replace('</span>', (c.partial ? '<sup>*</sup>' : '') + '</span>') : '—']) }; }), { maxHeight: '100%', caption: 'Monthly returns of ' + a.name, cls: 'heat-tbl month-tbl' }) +
        H.foot('<span>* partial year</span>') + C.notes(card, [H.periodNote(data, 'monthly data'), 'Shading is relative to the largest monthly move shown. Choose the allocation in the card settings.']);
    } });

  /* ── Rolling active return & tracking error ──────────────────────── */
  C.register({ id: 'rolling-active', title: 'Rolling active return & tracking error', description: 'Rolling 36-month tracking error, or cumulative active return, against the reference.', group: 'Historical', size: { w: 6, h: 5 }, min: { w: 4, h: 4 }, basis: 'historical',
    settings: [{ key: 'measure', label: 'Measure', type: 'select', options: [['te', 'Rolling 36-month tracking error'], ['cum', 'Cumulative active return']], default: 'te' }, stepSetting],
    subtitle: function (ctx, s) { return (s.measure === 'cum' ? 'Cumulative active return, %' : 'Rolling 36-month tracking error, % a year') + ' · vs ' + vsOf(s); },
    data: function (ctx, s) { return activeHist(ctx, s); },
    render: function (body, data, ctx, s, card) {
      var first = data.series.filter(function (x) { return x.over; })[0];
      if (!first) { body.innerHTML = '<div class="chart-empty">' + esc((data.series[0] && data.series[0].reason) || 'No overlapping history with the reference.') + '</div>'; return; }
      var series = ctx.members.map(function (a) { var x = one(data, a); return { id: a.id, name: a.name, color: colorOf(a), dim: dim(ctx, a), values: x && x.over ? (s.measure === 'cum' ? x.over.cumActive : x.over.te36) : null }; });
      body.innerHTML = H.legend(ctx) + '<div class="viz-host"></div>' + C.notes(card, [H.periodNote(data, 'monthly data'), s.measure === 'cum' ? 'Growth of the allocation relative to the reference since the start of the period.' : 'Annualised standard deviation of monthly active returns over the previous 36 months, so the line starts once 36 months are available.', stepNote(s), data.series.some(function (x) { return x.reason; }) ? 'Not shown: ' + data.series.filter(function (x) { return x.reason; }).map(function (x) { var a = S.allocation(x.allocationId); return esc((a ? a.name : x.allocationId) + ' (' + x.reason + ')'); }).join(', ') + '.' : null]);
      V.lineChart(body.querySelector('.viz-host'), { xs: first.over.months, series: series, height: Math.max(160, body.clientHeight - 60), baseline: s.measure === 'cum' ? 0 : null, includeZero: s.measure !== 'cum', fmt: function (v) { return F.num(v, 2) + '%'; }, aria: (s.measure === 'cum' ? 'Cumulative active return' : 'Rolling tracking error') + ' for ' + series.length + ' allocations' });
      H.wireLegend(body);
    } });

  /* ── Return attribution ──────────────────────────────────────────── */
  C.register({ id: 'attribution', title: 'Return attribution', description: 'Allocation and selection effects by category against the reference, over the period.', group: 'Historical', size: { w: 6, h: 7 }, min: { w: 4, h: 5 }, basis: 'historical',
    settings: [{ key: 'view', label: 'View', type: 'select', options: [['chart', 'Total effect by category'], ['table', 'Allocation and selection, by category'], ['waterfall', 'Waterfall · one allocation']], default: 'waterfall' }, stepSetting,
      { key: 'model', label: 'Attribution model', type: 'select', options: function () { return [wsOpt('attributionModel'), ['BF', 'Brinson–Fachler'], ['BHB', 'Brinson–Hood–Beebower']]; }, default: 'workspace' },
      { key: 'interaction', label: 'Interaction', type: 'select', options: function () { return [wsOpt('interaction'), ['selection', 'In selection'], ['allocation', 'In allocation'], ['separate', 'Separate effect']]; }, default: 'workspace' },
      { key: 'linking', label: 'Linking', type: 'select', options: function () { return [wsOpt('linking'), ['carino', 'Cariño'], ['menchero', 'Menchero'], ['grap', 'GRAP'], ['frongello', 'Frongello'], ['none', 'None, annualised']]; }, default: 'workspace' }],
    subtitle: function (ctx, s) { var m = attrMethod(s), c = cv(), dep = []; if (m.model !== c.attributionModel) dep.push(PA.chain.LABELS.attributionModel[m.model]); if (m.interaction !== c.interaction) dep.push(PA.chain.LABELS.interaction[m.interaction]); return 'pp a year · by category · vs ' + vsOf(s) + ' · ' + (m.linking === 'none' ? 'not linked' : 'linked (' + PA.chain.LABELS.linking[m.linking] + ')') + (dep.length ? ' · ' + dep.join(' · ') : ''); },
    data: function (ctx, s) { return activeHist(ctx, s, attrMethod(s)); },
    render: function (body, data, ctx, s, card) {
      var keys = []; data.series.forEach(function (x) { (x.returnSources || []).forEach(function (r) { if (keys.indexOf(r.key) < 0) keys.push(r.key); }); });
      var order = D.categories.map(function (c) { return c.id; }).concat(['__residual', '__drift']); keys.sort(function (p, q) { return order.indexOf(p) - order.indexOf(q); });
      var label = function (k) { return k === '__residual' ? 'Unallocated' : k === '__drift' ? ((data.series.filter(function (x) { return x.returnSources && x.returnSources.some(function (r) { return r.key === '__drift'; }); })[0] || {}).returnSources || []).filter(function (r) { return r.key === '__drift'; }).map(function (r) { return r.label; })[0] || 'Rebalancing and drift' : D.categoryById[k].short; };
      var sepI = attrMethod(s).interaction === 'separate';
      var src = function (x, k) { return x && x.returnSources ? x.returnSources.filter(function (r) { return r.key === k; })[0] : null; };
      var sums = ctx.members.map(function (a) { var x = one(data, a); if (!x || x.reason) return '<span>' + dot(a) + esc(a.name) + ': ' + esc(x && x.reason || 'unavailable') + '</span>'; var t = x.returnTotals; return '<span>' + dot(a) + esc(a.name) + ': allocation ' + F.signed(t.allocation, 2) + ' + selection ' + F.signed(t.selection, 2) + (sepI ? ' + interaction ' + F.signed(t.interaction || 0, 2) : '') + ' = ' + F.signed(t.attributed, 2) + '</span>'; }).join('');
      var am = attrMethod(s), notes = C.notes(card, [H.periodNote(data), (am.model === 'BHB' ? 'Brinson–Hood–Beebower. Allocation: the active weight in a category times its return at the reference.' : 'Brinson–Fachler. Allocation: the effect of over- or under-weighting a category, at the reference’s category return over the whole reference’s.') + ' Selection: the effect of the products chosen within it' + (am.interaction === 'separate' ? '; interaction, the active weight times the selection return, is its own effect.' : am.interaction === 'allocation' ? '; interaction is counted in allocation.' : ', interaction included.') + ' Unallocated weight earns nothing and is its own line.', (data.series.filter(function (x) { return x.returnSourcesNote; })[0] || {}).returnSourcesNote, stepNote(s)]);
      if (s.view === 'waterfall') {
        var wa = H.wfAlloc(card, ctx), wx = wa ? one(data, wa) : null;
        body.innerHTML = H.wfTabs(card, ctx, wa) + '<div class="viz-host"></div>' + notes;
        if (wx && !wx.reason && wx.returnSources) V.waterfall(body.querySelector('.viz-host'), { height: Math.max(170, body.clientHeight - 80), start: { label: (s.step && s.step !== 'none' ? 'Upper level · ' : 'Reference · ') + (wx.benchmark ? wx.benchmark.label : ''), value: wx.passiveReturn, color: 'var(--ink-3)' }, steps: keys.map(function (k) { var r = src(wx, k), c = D.categoryById[k]; return { label: label(k), value: r ? (r.contribution != null ? r.contribution : r.allocation + r.selection) : null, color: c ? c.color : '#c3cedb', tip: r ? label(k) + ' (allocation ' + F.signed(r.allocation, 2) + ', selection ' + F.signed(r.selection, 2) + (sepI ? ', interaction ' + F.signed(r.interaction || 0, 2) : '') + ')' : label(k) }; }), total: { label: wa.name + ' · attributed', color: colorOf(wa) }, unit: '%', dp: 2, aria: 'Waterfall from the reference return to ' + wa.name + '’s return' });
        else body.querySelector('.viz-host').innerHTML = '<div class="chart-empty">' + esc((wx && wx.reason) || 'Unavailable for this allocation.') + '</div>';
        H.wireWf(body, card); return;
      }
      if (s.view === 'table') {
        var nc = sepI ? 4 : 3;
        body.innerHTML = '<div class="tblwrap" style="max-height:100%"><table class="tbl attr-tbl"><caption class="sr-only">Return attribution</caption><thead><tr><th scope="col" rowspan="2">Category</th>' + ctx.members.map(function (a) { return '<th scope="colgroup" colspan="' + nc + '" class="grp-start">' + dot(a) + esc(a.name) + '</th>'; }).join('') + '</tr><tr>' + ctx.members.map(function () { return '<th scope="col" class="num grp-start">Alloc.</th><th scope="col" class="num">Select.</th>' + (sepI ? '<th scope="col" class="num">Inter.</th>' : '') + '<th scope="col" class="num">Total</th>'; }).join('') + '</tr></thead><tbody>' +
          keys.map(function (k) { return '<tr><th scope="row">' + esc(label(k)) + '</th>' + ctx.members.map(function (a) { var r = src(one(data, a), k); return r ? '<td class="num grp-start">' + V.signed(r.allocation, 2) + '</td><td class="num">' + V.signed(r.selection, 2) + '</td>' + (sepI ? '<td class="num">' + V.signed(r.interaction || 0, 2) + '</td>' : '') + '<td class="num"><b>' + V.signed(r.contribution != null ? r.contribution : r.allocation + r.selection, 2) + '</b></td>' : '<td class="num grp-start">—</td><td class="num">—</td>' + (sepI ? '<td class="num">—</td>' : '') + '<td class="num">—</td>'; }).join('') + '</tr>'; }).join('') + '</tbody></table></div>' + H.foot(sums) + notes;
        return;
      }
      body.innerHTML = H.legend(ctx) + '<div class="viz-host"></div>' + H.foot(sums) + notes;
      V.hBars(body.querySelector('.viz-host'), { rows: keys.map(label), series: ctx.members.map(function (a) { var x = one(data, a); return { name: a.name, color: colorOf(a), dim: dim(ctx, a), values: keys.map(function (k) { var r = src(x, k); return r ? (r.contribution != null ? r.contribution : r.allocation + r.selection) : null; }) }; }), unit: 'pp', dp: 2, signed: true, aria: 'Return attribution by category for ' + ctx.members.length + ' allocations' });
      H.wireLegend(body);
    } });

  /* ── Up & down capture ───────────────────────────────────────────── */
  C.register({ id: 'capture', title: 'Up & down capture', description: 'How much of the reference’s rising and falling months each allocation captured, with beta and hit rate.', group: 'Historical', size: { w: 6, h: 7 }, min: { w: 4, h: 5 }, basis: 'historical',
    settings: [],
    subtitle: function () { return '% of the reference’s up and down months · vs ' + ref(); },
    data: function (ctx) { return C.fetch('historySuite', histReq(ctx)); },
    render: function (body, data, ctx, s, card) {
      var ok = function (x) { return x && !x.reason && x.stats && x.stats.upCapture != null; };
      var pts = ctx.members.map(function (a) { var x = one(data, a); return { label: a.name, color: colorOf(a), dim: dim(ctx, a), x: ok(x) ? x.stats.downCapture : null, y: ok(x) ? x.stats.upCapture : null, tip: ok(x) ? a.name + ': up capture ' + F.num(x.stats.upCapture, 0) + '%, down capture ' + F.num(x.stats.downCapture, 0) + '%' : '' }; });
      body.innerHTML = H.legend(ctx) + '<div class="viz-host"></div>' + V.table([{ label: 'Allocation' }, { label: 'Up capture', num: true }, { label: 'Down capture', num: true }, { label: 'Beta', num: true }, { label: 'Correlation', num: true }, { label: '<span data-tip="Share of months ahead of the reference">Ahead</span>', num: true }], ctx.members.map(function (a) { var x = one(data, a); return { cells: [dot(a) + esc(a.name)].concat(ok(x) ? [F.num(x.stats.upCapture, 0) + '%', F.num(x.stats.downCapture, 0) + '%', F.num(x.stats.beta, 2), F.num(x.stats.correlation, 2), F.num(x.stats.hitRate, 0) + '%'] : [na(x && (x.reason || x.reference.reason)), na(), na(), na(), na()]) }; }), { maxHeight: 'none', caption: 'Capture statistics' }) +
        C.notes(card, [H.periodNote(data, 'monthly data'), 'Up capture: the allocation’s average return in months the reference rose, as a share of the reference’s. Down capture: the same for falling months, so lower is better. Up and to the left of the crossing lines is better.', 'Ahead: the share of months the allocation beat the reference.']);
      V.scatter(body.querySelector('.viz-host'), { points: pts, refX: 100, refY: 100, xLabel: 'Down capture, %', yLabel: 'Up capture, %', xName: 'down capture', yName: 'up capture', fmtX: function (v) { return F.num(v, 0) + '%'; }, fmtY: function (v) { return F.num(v, 0) + '%'; }, height: Math.max(170, Math.min(260, body.clientHeight - 210)), aria: 'Up capture against down capture for ' + ctx.members.length + ' allocations' });
      H.wireLegend(body);
    } });

  /* ── Distribution of monthly returns ─────────────────────────────── */
  C.register({ id: 'distribution', title: 'Distribution of monthly returns', description: 'How monthly returns were spread, with skew, fat tails and the worst months.', group: 'Historical', size: { w: 6, h: 7 }, min: { w: 4, h: 5 }, basis: 'historical',
    settings: [],
    subtitle: function () { return 'Share of months in each 1% band · whole portfolio'; },
    data: function (ctx) { return C.fetch('historySuite', histReq(ctx)); },
    render: function (body, data, ctx, s, card) {
      var lo = Infinity, hi = -Infinity; data.series.forEach(function (x) { if (x.stats) x.stats.bins.forEach(function (b) { lo = Math.min(lo, b.from); hi = Math.max(hi, b.to); }); });
      if (!isFinite(lo)) { body.innerHTML = '<div class="chart-empty">No history in the period.</div>'; return; }
      var bins = []; for (var b = lo; b < hi; b++) bins.push(b);
      var series = ctx.members.map(function (a) { var x = one(data, a), st = x && x.stats; return { name: a.name, color: colorOf(a), dim: dim(ctx, a), counts: bins.map(function (b0) { if (!st) return 0; var bin = st.bins.filter(function (q) { return q.from === b0; })[0]; return bin ? bin.count / st.months * 100 : 0; }) }; });
      body.innerHTML = H.legend(ctx) + '<div class="viz-host"></div>' + V.table([{ label: 'Allocation' }, { label: 'Mean', num: true }, { label: 'Std dev', num: true }, { label: 'Skew', num: true }, { label: 'Excess kurtosis', num: true }, { label: 'Worst month', num: true }], ctx.members.map(function (a) { var x = one(data, a), st = x && x.stats; return { cells: [dot(a) + esc(a.name)].concat(st ? [F.num(st.mean, 2) + '%', F.num(st.sd, 2) + '%', V.signed(st.skew, 2), F.num(st.kurtosis, 2), V.signed(st.worst[0].r, 1, '%') + ' <span class="faint small">' + F.month(st.worst[0].m) + '</span>'] : [na(), na(), na(), na(), na()]) }; }), { maxHeight: 'none', caption: 'Distribution statistics' }) +
        C.notes(card, [H.periodNote(data, 'monthly data'), 'Negative skew means losses were larger than gains of the same frequency; positive excess kurtosis means more extreme months than a normal distribution.']);
      V.distribution(body.querySelector('.viz-host'), { bins: bins, series: series, height: Math.max(160, Math.min(240, body.clientHeight - 200)), aria: 'Distribution of monthly returns for ' + series.length + ' allocations' });
      H.wireLegend(body);
    } });

  /* ══ structure ════════════════════════════════════════════════════ */

  /* ── Active weights ──────────────────────────────────────────────── */
  C.register({ id: 'active-weights', title: 'Active weights vs reference', description: 'Each category’s over- or under-weight against the reference.', group: 'Structure', size: { w: 6, h: 6 }, min: { w: 4, h: 4 }, basis: 'none',
    settings: [stepSetting],
    subtitle: function (ctx, s) { return 'pp of the total portfolio · by category · vs ' + vsOf(s); },
    data: function (ctx, s) { return C.fetch('structure', { allocations: U.clone(ctx.members), reference: U.clone(ctx.ws.comparison), step: s.step && s.step !== 'none' ? s.step : null }); },
    render: function (body, data, ctx, s, card) {
      var cats = data.categories.filter(function (c) { return data.series.some(function (x) { return x.active && Math.abs(x.active[c.id]) > 1e-6; }); });
      if (!cats.length) { body.innerHTML = '<div class="chart-empty">' + (data.series.some(function (x) { return x.active; }) ? 'Every allocation matches the reference by category.' : esc((data.series[0] && data.series[0].referenceReason) || 'No reference.')) + '</div>'; return; }
      body.innerHTML = H.legend(ctx) + '<div class="viz-host"></div>' + C.notes(card, [s.step && s.step !== 'none' ? 'Category weight at the step’s lower level less the weight at its upper level.' : 'Category weight in the allocation less the reference’s weight in that category.', stepNote(s), data.series.some(function (x) { return !x.active; }) ? 'No reference for: ' + data.series.filter(function (x) { return !x.active; }).map(function (x) { return esc(S.allocation(x.allocationId).name) + ' (' + esc(x.referenceReason || '') + ')'; }).join(', ') + '.' : null]);
      V.hBars(body.querySelector('.viz-host'), { rows: cats.map(function (c) { return c.short; }), series: ctx.members.map(function (a) { var x = one(data, a); return { name: a.name, color: colorOf(a), dim: dim(ctx, a), values: cats.map(function (c) { return x && x.active ? x.active[c.id] : null; }) }; }), unit: 'pp', dp: 1, signed: true, aria: 'Active weights by category for ' + ctx.members.length + ' allocations' });
      H.wireLegend(body);
    },
    dataTable: function (data, ctx) { return V.table([{ label: 'Category' }, { label: 'Reference', num: true }].concat(ctx.members.map(function (a) { return { label: esc(a.name), num: true }; })), data.categories.map(function (c) { var r0 = data.series.filter(function (x) { return x.referenceWeights; })[0]; return { cells: [esc(c.short), r0 ? F.num(r0.referenceWeights[c.id], 1) : '—'].concat(ctx.members.map(function (a) { var x = one(data, a); return x ? F.num(x.weights[c.id], 1) + (x.active ? ' <span class="faint small">(' + F.signed(x.active[c.id], 1) + ')</span>' : '') : '—'; })) }; }), { maxHeight: '220px' }); } });

  /* ── Currency exposure ───────────────────────────────────────────── */
  var CCY_RAMP = ['#1F3B63', '#3F6496', '#6F92C2', '#9DB6D9', '#C4D3E8', '#7D8B9C', '#A9B4C2', '#D3DAE3'];
  C.register({ id: 'currency-exposure', title: 'Currency exposure', description: 'Look-through currency mix of each allocation, unhedged, against the reporting currency.', group: 'Structure', size: { w: 6, h: 5 }, min: { w: 4, h: 4 }, basis: 'none',
    settings: [],
    subtitle: function (ctx) { return '% of the total portfolio · look-through, unhedged'; },
    data: function (ctx) { return C.fetch('structure', { allocations: U.clone(ctx.members), reference: U.clone(ctx.ws.comparison) }); },
    render: function (body, data, ctx, s, card) {
      var codes = data.currencies, color = function (i) { return CCY_RAMP[Math.min(i, CCY_RAMP.length - 1)]; }, name = function (c) { return c === 'EM' ? 'Emerging markets' : c; };
      body.innerHTML = '<div class="viz-legend" style="padding:0 0 6px">' + codes.map(function (c, i) { return '<span class="legend-note"><span class="sw" style="background:' + color(i) + '"></span> ' + esc(name(c)) + (c === data.currency ? ' (reporting)' : '') + '</span>'; }).join('') + '</div><div class="viz-host"></div>' +
        C.notes(card, ['Each product’s exposure is looked through to the currencies of its underlying assets; cash is held in the reporting currency (' + esc(data.currency) + ').', 'No hedging is applied: this is the exposure before any currency hedge.']);
      V.stackedBars(body.querySelector('.viz-host'), { aria: 'Currency exposure of ' + ctx.members.length + ' allocations; values in the data table', rows: ctx.members.map(function (a) { var x = one(data, a); return { label: a.name, color: colorOf(a), dim: dim(ctx, a), segments: codes.map(function (c, i) { var v = x ? x.currency[c] || 0 : 0; return { label: name(c), color: color(i), value: v, tip: a.name + ' · ' + name(c) + ': ' + F.num(v, 1) + '%' }; }).filter(function (g) { return g.value > 0.05; }) }; }) });
    },
    dataTable: function (data, ctx) { return V.table([{ label: 'Currency' }].concat(ctx.members.map(function (a) { return { label: esc(a.name), num: true }; })), data.currencies.map(function (c) { return { cells: [esc(c === 'EM' ? 'Emerging markets' : c) + (c === data.currency ? ' <span class="faint small">reporting</span>' : '')].concat(ctx.members.map(function (a) { var x = one(data, a); return x ? F.num(x.currency[c] || 0, 1) : '—'; })) }; }), { maxHeight: '220px' }); } });
})();

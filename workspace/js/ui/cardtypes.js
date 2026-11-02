/* ─────────────────────────────────────────────────────────────────────────
   Portfolio Analytics · the card catalogue
   Every card type the repository offers, except Drivers & Differences
   (js/ui/ddcard.js). See cards.js for the contract.
   ───────────────────────────────────────────────────────────────────────── */
(function () {
  'use strict';
  var PA = window.PA, U = PA.util, esc = U.esc, S = PA.store, UI = PA.ui, D = PA.data, F = U.fmt, V = UI.viz, C = PA.cards;

  var colorOf = function (a) { return UI.colorOf(a); };
  function members(ctx) { return ctx.members; }
  function dim(ctx, a) { return ctx.emphasized.indexOf(a.id) < 0; }
  function periodLabel(data) { return data && data.period ? data.period.label : ''; }
  function rowSuffix(ctx, card) { return card.followRow ? ' · ' + ctx.rowLabel : ' · whole portfolio'; }
  function basisNotes(data, ctx) { var bases = {}; (data.series || []).forEach(function (s) { var a = S.allocation(s.allocationId); if (a && s.basisLabel) (bases[s.basisLabel] = bases[s.basisLabel] || []).push(a.name); }); return Object.keys(bases).map(function (b) { return '<span><b>' + esc(b) + ':</b> ' + esc(bases[b].join(', ')) + '</span>'; }).join(''); }
  function foot(html) { return html ? '<div class="card-foot">' + html + '</div>' : ''; }
  function legend(ctx) { return '<div class="viz-legend" style="padding:0 0 8px">' + members(ctx).map(function (a) { return '<button type="button" data-emph="' + esc(a.id) + '" aria-pressed="' + !dim(ctx, a) + '" data-tip="Toggle emphasis. Every allocation stays on the chart."><span class="sw" style="background:' + colorOf(a) + '"></span>' + esc(a.name) + '</button>'; }).join('') + '</div>'; }
  function wireLegend(body) { U.on(body, 'click', '[data-emph]', function (e, b) { var ids = S.ws.comparison.members, em = S.ws.prefs.emphasis.filter(function (id) { return ids.indexOf(id) >= 0; }); if (!em.length) em = ids.slice(); var i = em.indexOf(b.dataset.emph); if (i >= 0) { if (em.length === 1) { UI.toast('Keep at least one allocation emphasized.'); return; } em.splice(i, 1); } else em.push(b.dataset.emph); S.setPref('emphasis', em); }); }
  function modelFoot(notes) { var seen = {}, out = []; notes.forEach(function (n) { if (n && !seen[n]) { seen[n] = 1; out.push('<span>' + esc(n) + '</span>'); } }); return out.join(''); }
  function packReq(ctx) { return { allocations: U.clone(ctx.members), period: U.clone(ctx.prefs.period) }; }
  function monthsTable(months, series, fmt) { return V.table([{ label: 'Month' }].concat(series.map(function (s) { return { label: esc(s.name), num: true }; })), months.map(function (m, i) { return { cells: [F.month(m)].concat(series.map(function (s) { var v = s.values ? s.values[i] : null; return v == null ? '—' : fmt(v); })) }; }), { maxHeight: '240px' }); }

  /* ── Allocations side by side ────────────────────────────────────── */
  C.register({ id: 'allocations', title: 'Allocations side by side', description: 'Category weights of every compared allocation, with the index-modelled remainder hatched.', group: 'Allocation', size: { w: 6, h: 6 }, min: { w: 4, h: 4 }, basis: 'none', livePrefs: true,
    settings: [{ key: 'view', label: 'View', type: 'select', options: [['bars', 'Stacked bars'], ['table', 'Table']], default: 'bars' }],
    subtitle: function (ctx) { return 'Category targets, % of total portfolio · solid = implemented by products, hatched = index remainder'; },
    data: function (ctx) { return C.fetch('breakdown', { allocations: U.clone(ctx.members) }); },
    render: function (body, data, ctx, s) {
      var cats = data.categories;
      if (s.view === 'table') {
        body.innerHTML = V.table([{ label: 'Category' }].concat(ctx.members.map(function (a) { return { label: '<span class="dot" style="background:' + colorOf(a) + ';width:8px;height:8px"></span> ' + esc(a.name), num: true }; })),
          cats.map(function (c) { return { cells: ['<span class="sw" style="background:' + c.color + '"></span> ' + esc(c.name)].concat(data.series.map(function (sr) { var x = sr.categories.filter(function (q) { return q.id === c.id; })[0]; return x.target > 0 || x.implemented > 0 ? F.num(x.target) + (x.remainder > 1e-9 ? ' <span class="faint small" data-tip="Products ' + F.num(x.implemented) + '%, index remainder ' + F.num(x.remainder) + '%">(' + F.num(x.implemented) + ' + ' + F.num(x.remainder) + ')</span>' : x.over ? ' <span class="tag tag-warn" data-tip="Products exceed the category target by ' + F.num(-x.remainder) + '%">over</span>' : '') : '<span class="faint">0.0</span>'; })) }; }).concat([{ cls: 'total', cells: ['Allocated'].concat(data.series.map(function (sr) { return F.num(sr.allocated); })) }]), { maxHeight: '100%' });
        return;
      }
      body.innerHTML = '<div class="viz-legend" style="padding:0 0 6px">' + cats.map(function (c) { return '<span class="legend-note"><span class="sw" style="background:' + c.color + '"></span> ' + esc(c.short) + '</span>'; }).join('') + '</div><div class="viz-host"></div>';
      V.stackedBars(body.querySelector('.viz-host'), { aria: 'Category weights of ' + ctx.members.length + ' allocations; values in the data table', rows: ctx.members.map(function (a) {
        var sr = data.series.filter(function (x) { return x.allocationId === a.id; })[0], segs = [];
        cats.forEach(function (c) { var x = sr.categories.filter(function (q) { return q.id === c.id; })[0]; if (x.implemented > 0) segs.push({ label: c.short + ' · products', color: c.color, value: Math.min(x.implemented, Math.max(x.target, x.implemented)), tip: c.name + ': ' + F.num(x.implemented) + '% in ' + x.products.length + ' product' + (x.products.length === 1 ? '' : 's') + (x.over ? ' (over the ' + F.num(x.target) + '% target)' : '') }); if (x.remainder > 1e-9) segs.push({ label: c.short + ' · index', color: c.color, value: x.remainder, hatched: true, tip: c.name + ': ' + F.num(x.remainder) + '% unimplemented, modelled by the ' + c.short + ' index basket' }); });
        return { label: a.name, color: colorOf(a), dim: dim(ctx, a), segments: segs };
      }) });
    },
    dataTable: function (data, ctx) { return V.table([{ label: 'Allocation' }].concat(data.categories.map(function (c) { return { label: esc(c.short), num: true }; })), ctx.members.map(function (a) { var sr = data.series.filter(function (x) { return x.allocationId === a.id; })[0]; return { cells: [esc(a.name)].concat(sr.categories.map(function (x) { return F.num(x.target); })) }; }), { maxHeight: '200px' }); } });

  /* ── Cumulative return ───────────────────────────────────────────── */
  C.register({ id: 'cumulative-return', title: 'Cumulative return', description: 'Growth of 100 over the selected period, actual history dashed where it differs from the backtest.', group: 'Performance', size: { w: 6, h: 6 }, min: { w: 4, h: 4 }, basis: 'historical', supportsRow: true,
    settings: [],
    subtitle: function (ctx, s, card) { var st = C.state[card.id]; return 'Growth of 100' + rowSuffix(ctx, card) + (st && st.data ? ' · ' + periodLabel(st.data) : ''); },
    data: function (ctx, s, card) { return card.followRow ? C.fetch('historySeries', { allocations: U.clone(ctx.members), rowKey: ctx.row, metric: 'return', period: U.clone(ctx.prefs.period) }) : C.fetch('historyPack', packReq(ctx)); },
    render: function (body, data, ctx, s, card) {
      var series = ctx.members.map(function (a) { var x = data.series.filter(function (q) { return q.allocationId === a.id; })[0]; return { id: a.id, name: a.name, color: colorOf(a), values: x ? (card.followRow ? x.values : x.growth) : null, actual: x ? x.actual : null, dim: dim(ctx, a) }; });
      if (series.every(function (x) { return !x.values; })) { body.innerHTML = '<div class="chart-empty">No history for this selection in the period.</div>'; return; }
      body.innerHTML = legend(ctx) + '<div class="viz-host"></div>' + foot(basisNotes(data, ctx) + (series.some(function (x) { return x.actual; }) ? '<span class="legend-note"><span class="sw dashed" style="color:var(--ink-3)"></span> actual history</span>' : ''));
      V.lineChart(body.querySelector('.viz-host'), { xs: data.months, series: series, height: Math.max(180, body.clientHeight - 90), baseline: 100, fmt: function (v) { return F.num(v, 1); }, aria: ctx.rowLabel + ' growth of 100 over ' + periodLabel(data) + ' for ' + series.length + ' allocations' });
      wireLegend(body);
    },
    dataTable: function (data, ctx, s, card) { return monthsTable(data.months, ctx.members.map(function (a) { var x = data.series.filter(function (q) { return q.allocationId === a.id; })[0]; return { name: a.name, values: x ? (card.followRow ? x.values : x.growth) : null }; }), function (v) { return F.num(v, 1); }); } });

  /* ── Drawdowns ───────────────────────────────────────────────────── */
  C.register({ id: 'drawdowns', title: 'Worst peak-to-trough losses', description: 'The deepest drawdowns of each allocation in the period: peak, trough, depth, length and recovery.', group: 'Risk', size: { w: 6, h: 6 }, min: { w: 4, h: 4 }, basis: 'historical',
    settings: [{ key: 'count', label: 'Episodes per allocation', type: 'select', options: [['1', '1'], ['3', '3'], ['5', '5']], default: '3' }],
    subtitle: function (ctx, s, card) { var st = C.state[card.id]; return 'Deepest ' + s.count + ' per allocation' + (st && st.data ? ' · ' + periodLabel(st.data) : '') + ' · monthly observations'; },
    data: function (ctx) { return C.fetch('historyPack', packReq(ctx)); },
    render: function (body, data, ctx, s) {
      var rows = [];
      ctx.members.forEach(function (a) { var x = data.series.filter(function (q) { return q.allocationId === a.id; })[0]; var eps = x ? x.episodes.slice(0, Number(s.count)) : []; if (!eps.length) { rows.push({ cells: ['<span class="dot" style="background:' + colorOf(a) + ';width:8px;height:8px"></span> ' + esc(a.name), '<span class="faint">no drawdown in the period</span>', '', '', '', ''] }); return; } eps.forEach(function (e, i) { rows.push({ cells: [i === 0 ? '<span class="dot" style="background:' + colorOf(a) + ';width:8px;height:8px"></span> ' + esc(a.name) : '', F.month(e.peak), F.month(e.trough), V.signed(e.depth, 1, '%'), e.length + ' mo', e.recovery ? F.month(e.recovery) + ' <span class="faint small">(' + e.recoveryMonths + ' mo)</span>' : '<span class="tag tag-warn">not yet</span>'] }); }); });
      body.innerHTML = V.table([{ label: 'Allocation' }, { label: 'Peak' }, { label: 'Trough' }, { label: 'Depth', num: true }, { label: 'Length', num: true }, { label: 'Recovered' }], rows, { maxHeight: '100%', caption: 'Worst drawdowns' });
    } });

  /* ── Underwater ──────────────────────────────────────────────────── */
  C.register({ id: 'underwater', title: 'Underwater chart', description: 'Distance below the previous peak, month by month.', group: 'Risk', size: { w: 6, h: 5 }, min: { w: 4, h: 4 }, basis: 'historical',
    settings: [],
    subtitle: function (ctx, s, card) { var st = C.state[card.id]; return '% below the prior peak · whole portfolio' + (st && st.data ? ' · ' + periodLabel(st.data) : ''); },
    data: function (ctx) { return C.fetch('historyPack', packReq(ctx)); },
    render: function (body, data, ctx) {
      var series = ctx.members.map(function (a) { var x = data.series.filter(function (q) { return q.allocationId === a.id; })[0]; return { id: a.id, name: a.name, color: colorOf(a), values: x ? x.underwater : null, dim: dim(ctx, a) }; });
      body.innerHTML = legend(ctx) + '<div class="viz-host"></div>';
      V.lineChart(body.querySelector('.viz-host'), { xs: data.months, series: series, height: Math.max(160, body.clientHeight - 60), baseline: 0, includeZero: true, fmt: function (v) { return F.num(v, 1) + '%'; }, aria: 'Underwater chart: percentage below the previous peak for ' + series.length + ' allocations' });
      wireLegend(body);
    },
    dataTable: function (data, ctx) { return monthsTable(data.months, ctx.members.map(function (a) { var x = data.series.filter(function (q) { return q.allocationId === a.id; })[0]; return { name: a.name, values: x ? x.underwater : null }; }), function (v) { return F.num(v, 1) + '%'; }); } });

  /* ── Summary statistics ──────────────────────────────────────────── */
  C.register({ id: 'summary-stats', title: 'Summary statistics', description: 'Annualised return, volatility, Sharpe ratio, maximum drawdown, best and worst month.', group: 'Performance', size: { w: 6, h: 6 }, min: { w: 4, h: 4 }, basis: 'historical',
    settings: [],
    subtitle: function (ctx, s, card) { var st = C.state[card.id]; return 'Whole portfolio' + (st && st.data ? ' · ' + periodLabel(st.data) : '') + ' · monthly data, risk-free ' + F.num(D.assumptions.riskFree, 1) + '%'; },
    data: function (ctx) { return C.fetch('historyPack', packReq(ctx)); },
    render: function (body, data, ctx) {
      var get = function (a) { var x = data.series.filter(function (q) { return q.allocationId === a.id; })[0]; return x ? x.stats : null; };
      var rows = [
        ['Annualised return', function (st) { return V.signed(st.annReturn, 1, '%'); }], ['Cumulative return', function (st) { return V.signed(st.cumulative, 1, '%'); }], ['Volatility', function (st) { return F.num(st.vol, 1) + '%'; }],
        ['Sharpe ratio', function (st) { return st.sharpe == null ? '—' : F.num(st.sharpe, 2); }], ['Maximum drawdown', function (st) { return V.signed(st.maxDrawdown, 1, '%'); }],
        ['Best month', function (st) { return V.signed(st.bestMonth.r, 1, '%') + ' <span class="faint small">' + F.month(st.bestMonth.m) + '</span>'; }], ['Worst month', function (st) { return V.signed(st.worstMonth.r, 1, '%') + ' <span class="faint small">' + F.month(st.worstMonth.m) + '</span>'; }],
        ['Positive months', function (st) { return F.num(st.positive, 0) + '%'; }], ['Observations', function (st) { return st.months + ' mo'; }]
      ];
      body.innerHTML = V.table([{ label: 'Statistic' }].concat(ctx.members.map(function (a) { return { label: '<span class="dot" style="background:' + colorOf(a) + ';width:8px;height:8px"></span> ' + esc(a.name), num: true }; })), rows.map(function (r) { return { cells: [r[0]].concat(ctx.members.map(function (a) { var st = get(a); return st ? r[1](st) : '<span class="faint">—</span>'; })) }; }), { maxHeight: '100%', caption: 'Summary statistics' }) + foot(basisNotes(data, ctx));
    } });

  /* ── Calendar-year returns ───────────────────────────────────────── */
  C.register({ id: 'calendar-years', title: 'Calendar-year returns', description: 'Return in each calendar year of the period; partial years are marked.', group: 'Performance', size: { w: 6, h: 5 }, min: { w: 4, h: 3 }, basis: 'historical',
    settings: [],
    subtitle: function (ctx, s, card) { var st = C.state[card.id]; return 'Whole portfolio' + (st && st.data ? ' · ' + periodLabel(st.data) : ''); },
    data: function (ctx) { return C.fetch('historyPack', packReq(ctx)); },
    render: function (body, data, ctx) {
      var years = (data.series[0] && data.series[0].calendar || []).map(function (c) { return c.year; });
      body.innerHTML = V.table([{ label: 'Year' }].concat(ctx.members.map(function (a) { return { label: '<span class="dot" style="background:' + colorOf(a) + ';width:8px;height:8px"></span> ' + esc(a.name), num: true }; })), years.map(function (y) { return { cells: [y].concat(ctx.members.map(function (a) { var x = data.series.filter(function (q) { return q.allocationId === a.id; })[0], c = x ? x.calendar.filter(function (q) { return q.year === y; })[0] : null; return c && c.ret != null ? V.signed(c.ret, 1, '%') + (c.partial ? ' <span class="faint small" data-tip="Partial year">*</span>' : '') : '<span class="faint">—</span>'; })) }; }), { maxHeight: '100%', caption: 'Calendar-year returns' }) + foot('<span>* partial year</span>');
    } });

  /* ── Stress periods ──────────────────────────────────────────────── */
  C.register({ id: 'stress-periods', title: 'Stress periods', description: 'Cumulative return through named market episodes.', group: 'Risk', size: { w: 4, h: 5 }, min: { w: 3, h: 3 }, basis: 'historical',
    settings: [],
    subtitle: function () { return 'Cumulative return through each episode · whole portfolio'; },
    data: function (ctx) { return C.fetch('historyPack', packReq(ctx)); },
    render: function (body, data, ctx) {
      body.innerHTML = V.table([{ label: 'Episode' }].concat(ctx.members.map(function (a) { return { label: '<span class="dot" style="background:' + colorOf(a) + ';width:8px;height:8px"></span> ' + esc(a.name), num: true }; })), data.stress.map(function (p) { return { cells: [esc(p.name) + '<br><span class="faint small">' + F.month(p.start) + ' – ' + F.month(p.end) + '</span>'].concat(ctx.members.map(function (a) { var x = data.series.filter(function (q) { return q.allocationId === a.id; })[0], r = x ? x.stressReturns.filter(function (q) { return q.id === p.id; })[0] : null; return r && r.ret != null ? V.signed(r.ret, 1, '%') : '<button type="button" class="na" data-tip="' + esc(r ? r.reason : 'No history') + '">—</button>'; })) }; }), { maxHeight: '100%', caption: 'Stress periods' });
    } });

  /* ── Rolling return / volatility ─────────────────────────────────── */
  C.register({ id: 'rolling', title: 'Rolling return and volatility', description: 'Rolling 12-month return or rolling 36-month volatility, annualised.', group: 'Risk', size: { w: 6, h: 5 }, min: { w: 4, h: 4 }, basis: 'historical',
    settings: [{ key: 'measure', label: 'Measure', type: 'select', options: [['vol', 'Rolling 36-month volatility'], ['ret', 'Rolling 12-month return']], default: 'vol' }],
    subtitle: function (ctx, s, card) { var st = C.state[card.id]; return (s.measure === 'vol' ? 'Rolling 36-month volatility, annualised' : 'Rolling 12-month return') + ' · whole portfolio' + (st && st.data ? ' · ' + periodLabel(st.data) : ''); },
    data: function (ctx) { return C.fetch('historyPack', packReq(ctx)); },
    render: function (body, data, ctx, s) {
      var series = ctx.members.map(function (a) { var x = data.series.filter(function (q) { return q.allocationId === a.id; })[0]; return { id: a.id, name: a.name, color: colorOf(a), values: x && x.rolling ? (s.measure === 'vol' ? x.rolling.vol36 : x.rolling.ret12) : null, dim: dim(ctx, a) }; });
      body.innerHTML = legend(ctx) + '<div class="viz-host"></div>';
      V.lineChart(body.querySelector('.viz-host'), { xs: data.months, series: series, height: Math.max(160, body.clientHeight - 60), baseline: s.measure === 'ret' ? 0 : null, fmt: function (v) { return F.num(v, 1) + '%'; }, aria: (s.measure === 'vol' ? 'Rolling volatility' : 'Rolling return') + ' for ' + series.length + ' allocations' });
      wireLegend(body);
    },
    dataTable: function (data, ctx, s) { return monthsTable(data.months, ctx.members.map(function (a) { var x = data.series.filter(function (q) { return q.allocationId === a.id; })[0]; return { name: a.name, values: x && x.rolling ? (s.measure === 'vol' ? x.rolling.vol36 : x.rolling.ret12) : null }; }), function (v) { return F.num(v, 1) + '%'; }); } });

  /* ── Risk contribution by category ───────────────────────────────── */
  function tableReq(ctx, metric, extra) { var w = ctx.ws; return Object.assign({ revision: ctx.revision, allocations: U.clone(ctx.members), basis: ctx.prefs.basis, metric: metric, values: 'absolute', riskUnits: 'share', factors: [], reference: U.clone(w.comparison), period: U.clone(ctx.prefs.period), scenario: U.clone(ctx.scenario) }, extra || {}); }
  function factorRiskRows(data, ctx) {
    var live = data.factors.filter(function (f) { return ctx.members.some(function (a) { var x = data.series.filter(function (q) { return q.allocationId === a.id; })[0]; return x && x.byFactor && Math.abs(x.byFactor[f.id]) >= 0.005; }); });
    return live.map(function (f) { return { id: f.id, name: f.name }; }).concat([{ id: '__specific', name: 'Specific' }]);
  }
  function factorRiskValue(data, a, id) { var x = data.series.filter(function (q) { return q.allocationId === a.id; })[0]; if (!x || x.total == null) return null; return id === '__specific' ? x.specific : x.byFactor[id]; }
  C.register({ id: 'risk-by-category', title: 'Risk contribution by category', description: 'Each category’s share of total risk, or its contribution to volatility, for every allocation. Can also split risk by factor, from the factor model.', group: 'Risk', size: { w: 6, h: 6 }, min: { w: 4, h: 4 }, basis: 'both',
    factorModel: function (s) { return s.decompose === 'factor'; },
    settings: [{ key: 'decompose', label: 'Decompose by', type: 'select', options: [['category', 'Category (platform assumptions)'], ['factor', 'Factor (factor model)']], default: 'category' },
      { key: 'riskUnits', label: 'Units', type: 'select', options: [['share', 'Share of total risk (%)'], ['vol', 'Contribution to volatility (pp)']], default: 'share', when: function (s) { return s.decompose !== 'factor'; } }],
    subtitle: function (ctx, s, card) { if (s.decompose === 'factor') return 'pp of portfolio volatility, by factor and specific · ' + C.modelLabel(card) + ' · forward'; return (s.riskUnits === 'share' ? '% share of total risk' : 'pp of portfolio volatility') + ' · ' + (ctx.prefs.basis === 'forward' ? 'platform assumptions' + (ctx.scenario ? ', scenario where applied' : '') : 'realised over the period'); },
    data: function (ctx, s, card) { if (s.decompose === 'factor') return C.fetch('factorRisk', { allocations: U.clone(ctx.members), rowKey: '__total', factorModel: C.modelIdOf(card) }); return C.fetch('analyzeTable', tableReq(ctx, 'risk', { riskUnits: s.riskUnits })); },
    render: function (body, data, ctx, s) {
      if (s.decompose === 'factor' && data.factors) {
        var fr = factorRiskRows(data, ctx), m = D.factorModelById[data.factorModel];
        body.innerHTML = legend(ctx) + '<div class="viz-host"></div>' + foot('<span>Contributions sum to each allocation’s volatility under ' + esc(m.name) + ': ' + ctx.members.map(function (a) { var x = data.series.filter(function (q) { return q.allocationId === a.id; })[0]; return esc(a.name) + ' ' + (x && x.total != null ? F.num(x.total, 1) + '%' : '—'); }).join(' · ') + '.</span>' + (ctx.scenario ? '<span>Factor-model risk does not change with the scenario.</span>' : '') + modelFoot(data.series.map(function (x) { return x.coverage; })));
        V.groupedBars(body.querySelector('.viz-host'), { groups: fr.map(function (f) { return f.name; }), series: ctx.members.map(function (a) { return { name: a.name, color: colorOf(a), dim: dim(ctx, a), values: fr.map(function (f) { return factorRiskValue(data, a, f.id); }) }; }), unit: 'pp', dp: 2, height: Math.max(160, body.clientHeight - 80), aria: 'Risk contribution by factor under ' + m.name + ' for ' + ctx.members.length + ' allocations' });
        wireLegend(body); return;
      }
      var cats = data.rows.filter(function (r) { return r.kind === 'category'; });
      var get = function (a, key) { var c = data.cells[a.id] && data.cells[a.id][key]; if (!c) return null; var cell = c.scenario || c.base; return cell ? cell.value : null; };
      body.innerHTML = legend(ctx) + '<div class="viz-host"></div>' + foot((data.scenarioApplies ? '<span>Scenario values where the scenario applies.</span>' : '') + (data.warnings || []).map(function (w) { return '<span class="tag tag-warn">' + esc(w) + '</span>'; }).join(''));
      V.groupedBars(body.querySelector('.viz-host'), { groups: cats.map(function (r) { return D.categoryById[r.key].short; }), series: ctx.members.map(function (a) { return { name: a.name, color: colorOf(a), dim: dim(ctx, a), values: cats.map(function (r) { return get(a, r.key); }) }; }), unit: data.unit, dp: 1, height: Math.max(160, body.clientHeight - 70), aria: 'Risk contribution by category for ' + ctx.members.length + ' allocations' });
      wireLegend(body);
    },
    dataTable: function (data, ctx) { if (data.factors) { var fr = factorRiskRows(data, ctx); return V.table([{ label: 'Source' }].concat(ctx.members.map(function (a) { return { label: esc(a.name), num: true }; })), fr.map(function (f) { return { cells: [esc(f.name)].concat(ctx.members.map(function (a) { var v = factorRiskValue(data, a, f.id); return v == null ? '—' : F.num(v, 2); })) }; }).concat([{ cls: 'total', cells: ['Volatility'].concat(ctx.members.map(function (a) { var x = data.series.filter(function (q) { return q.allocationId === a.id; })[0]; return x && x.total != null ? F.num(x.total, 2) : '—'; })) }]), { maxHeight: '220px' }); } var cats = data.rows.filter(function (r) { return r.kind === 'category'; }); return V.table([{ label: 'Category' }].concat(ctx.members.map(function (a) { return { label: esc(a.name), num: true }; })), cats.map(function (r) { return { cells: [esc(r.label)].concat(ctx.members.map(function (a) { var c = data.cells[a.id][r.key], cell = c.scenario || c.base; return cell && cell.value != null ? F.num(cell.value, 1) : '—'; })) }; }), { maxHeight: '200px' }); } });

  /* ── Factor exposures ────────────────────────────────────────────── */
  C.register({ id: 'factor-exposures', title: 'Factor exposures', description: 'Stand-alone factor betas of the selected row, or the portfolio, for every allocation, under the chosen factor model.', group: 'Risk', size: { w: 6, h: 6 }, min: { w: 4, h: 4 }, basis: 'both', supportsRow: true, factorModel: true,
    settings: [{ key: 'factors', label: 'Factors', type: 'factors', default: null }],
    subtitle: function (ctx, s, card) { return 'β' + rowSuffix(ctx, card) + ' · ' + C.modelLabel(card) + ' · ' + (ctx.prefs.basis === 'forward' ? 'model exposure' : 'estimated over the period'); },
    data: function (ctx, s, card) { var m = C.modelIdOf(card); return C.fetch('analyzeTable', tableReq(ctx, 'factor', { factors: C.factorsFor(s.factors, m).ids, factorModel: m })); },
    render: function (body, data, ctx, s, card) {
      var key = card.followRow ? ctx.row : '__total', m = D.factorModelById[data.factorModel || 'isg'], pick = C.factorsFor(s.factors, m.id), ids = pick.ids.filter(function (f) { return m.factorById[f]; });
      var get = function (a, fid) { var c = data.cells[a.id] && data.cells[a.id][key]; if (!c) return null; var cell = c.scenario || c.base; return cell && cell.factors ? cell.factors[fid] : null; };
      var cov = ctx.members.map(function (a) { var c = data.cells[a.id] && data.cells[a.id][key]; return c && c.base && c.base.coverage ? a.name + ': ' + c.base.coverage.replace(/^Proxied by the category index in [^:]+: /, 'proxied by its index in ' + m.name + ': ') : null; });
      body.innerHTML = legend(ctx) + '<div class="viz-host"></div>' + foot((pick.mapped ? '<span class="tag tag-info">Mapped</span><span>' + esc(pick.mapped) + '.</span>' : '') + modelFoot(cov) + '<span>Units differ by factor.</span>');
      V.groupedBars(body.querySelector('.viz-host'), { groups: ids.map(function (f) { return m.factorById[f].name; }), series: ctx.members.map(function (a) { return { name: a.name, color: colorOf(a), dim: dim(ctx, a), values: ids.map(function (f) { return get(a, f); }) }; }), unit: 'β', dp: 2, height: Math.max(160, body.clientHeight - 80), aria: ctx.rowLabel + ' factor exposures under ' + m.name + ' for ' + ctx.members.length + ' allocations' });
      wireLegend(body);
    },
    dataTable: function (data, ctx, s, card) { var key = card.followRow ? ctx.row : '__total', m = D.factorModelById[data.factorModel || 'isg']; return V.table([{ label: 'Factor · ' + esc(m.name) }].concat(ctx.members.map(function (a) { return { label: esc(a.name), num: true }; })), C.factorsFor(s.factors, m.id).ids.filter(function (f) { return m.factorById[f]; }).map(function (f) { return { cells: [esc(m.factorById[f].name)].concat(ctx.members.map(function (a) { var c = data.cells[a.id] && data.cells[a.id][key], cell = c && (c.scenario || c.base); var v = cell && cell.factors ? cell.factors[f] : null; return v == null ? '—' : F.num(v, 2); })) }; }), { maxHeight: '200px' }); } });

  /* ── Correlation between allocations ─────────────────────────────── */
  C.register({ id: 'correlation', title: 'Correlation between allocations', description: 'Correlation of monthly returns between the compared allocations over the period.', group: 'Risk', size: { w: 4, h: 5 }, min: { w: 3, h: 3 }, basis: 'historical',
    settings: [],
    subtitle: function (ctx, s, card) { var st = C.state[card.id]; return 'Monthly returns' + (st && st.data ? ' · ' + periodLabel(st.data) : ''); },
    data: function (ctx) { return C.fetch('historyPack', packReq(ctx)); },
    render: function (body, data, ctx) {
      var idx = ctx.members.map(function (a) { return data.series.findIndex(function (q) { return q.allocationId === a.id; }); });
      V.heatmap(body, { labels: ctx.members.map(function (a) { return a.name; }), matrix: idx.map(function (i) { return idx.map(function (j) { return i < 0 || j < 0 ? null : data.correlation[i][j]; }); }), aria: 'Correlation matrix of monthly returns between allocations' });
    } });

  /* ── Projections ─────────────────────────────────────────────────── */
  C.register({ id: 'projections', title: 'Projections with bands', description: 'Central path and probability bands for each emphasized allocation, on shared axes.', group: 'Forward-looking', size: { w: 12, h: 6 }, min: { w: 6, h: 4 }, basis: 'forward', supportsRow: true, defaultFollowRow: true,
    settings: [{ key: 'projectionBasis', label: 'Basis', type: 'select', options: [['standalone', 'Standalone: 100 invested in the row'], ['contribution', 'Contribution: the row’s share of a portfolio of 100']], default: 'standalone' }],
    subtitle: function (ctx, s, card) { return (s.projectionBasis === 'contribution' ? 'Contribution basis' : 'Standalone basis') + rowSuffix(ctx, card) + ' · ' + ctx.prefs.horizon + ' years · 50% and ' + Math.round(ctx.prefs.confidence * 100) + '% bands · ' + ctx.ws.currency + ' · ' + (ctx.scenario ? 'scenario where applied' : 'base case'); },
    data: function (ctx, s, card) { return C.fetch('projection', { allocations: U.clone(ctx.members), rowKey: card.followRow ? ctx.row : '__total', scenario: U.clone(ctx.scenario), horizon: ctx.prefs.horizon, confidence: ctx.prefs.confidence, basis: s.projectionBasis }); },
    render: function (body, data, ctx) {
      var panels = ctx.members.filter(function (a) { return !dim(ctx, a); }).map(function (a) { var x = data.series.filter(function (q) { return q.allocationId === a.id; })[0]; return { id: a.id, name: a.name, color: colorOf(a), s: x, tag: x && x.inScope ? ' <span class="tag tag-info">Scenario</span>' : (ctx.scenario ? ' <span class="tag">Base</span>' : '') }; });
      body.innerHTML = legend(ctx) + '<div class="viz-host"></div>' + foot('<span>Bands show the modelled range at the stated probability. They are not a guaranteed outcome.</span>');
      V.smallMultiples(body.querySelector('.viz-host'), { panels: panels, horizon: ctx.prefs.horizon, confidence: ctx.prefs.confidence, height: Math.max(150, body.clientHeight - 110) });
      wireLegend(body);
    },
    dataTable: function (data, ctx) { var h = ctx.prefs.horizon, ser = ctx.members.map(function (a) { return { a: a, s: data.series.filter(function (q) { return q.allocationId === a.id; })[0] }; }); var rows = []; for (var yr = 0; yr <= h; yr++) { var i = yr * 4; rows.push({ cells: [String(yr)].concat(ser.map(function (x) { return x.s && x.s.central ? F.num(x.s.central[i], 1) + ' <span class="faint small">(' + F.num(x.s.bands[1].low[i], 0) + '–' + F.num(x.s.bands[1].high[i], 0) + ')</span>' : '—'; })) }); } return V.table([{ label: 'Year' }].concat(ser.map(function (x) { return { label: esc(x.a.name), num: true }; })), rows, { maxHeight: '200px' }); } });

  /* ── Scenario comparison ─────────────────────────────────────────── */
  C.register({ id: 'scenario-comparison', title: 'Scenario comparison', description: 'The selected row under the base case and every workspace scenario, for each allocation.', group: 'Forward-looking', size: { w: 6, h: 5 }, min: { w: 4, h: 4 }, basis: 'forward', supportsRow: true, defaultFollowRow: true,
    settings: [{ key: 'metric', label: 'Metric', type: 'select', options: [['return', 'Return contribution (pp)'], ['risk', 'Share of total risk (%)'], ['weight', 'Allocation weight (%)']], default: 'return' }],
    subtitle: function (ctx, s, card) { return UI.table.metricLabel(s.metric) + rowSuffix(ctx, card) + ' · base case and ' + ctx.ws.scenarios.length + ' scenario' + (ctx.ws.scenarios.length === 1 ? '' : 's'); },
    data: function (ctx, s, card) { return C.fetch('scenarioComparison', { allocations: U.clone(ctx.members), rowKey: card.followRow ? ctx.row : '__total', metric: s.metric, riskUnits: 'share', scenarios: U.clone(ctx.ws.scenarios) }); },
    render: function (body, data, ctx) {
      if (!ctx.ws.scenarios.length) { body.innerHTML = '<div class="chart-empty">No scenarios in this workspace yet. Open the scenario drawer to create one.</div>'; return; }
      body.innerHTML = legend(ctx) + '<div class="viz-host"></div>';
      V.dotPlot(body.querySelector('.viz-host'), { unit: data.unit, dp: data.unit === 'β' ? 2 : 1, aria: ctx.rowLabel + ' under the base case and each scenario', rows: ctx.members.map(function (a) { var x = data.series.filter(function (q) { return q.allocationId === a.id; })[0]; return { label: a.name, color: colorOf(a), dim: dim(ctx, a), base: x ? x.base.value : null, points: x ? x.scenarios.map(function (z) { var sc = ctx.ws.scenarios.filter(function (q) { return q.id === z.scenarioId; })[0]; return { label: sc ? sc.name : z.scenarioId, value: z.cell.value, reason: z.cell.reason }; }) : [] }; }) });
      wireLegend(body);
    },
    dataTable: function (data, ctx) { return V.table([{ label: 'Allocation' }, { label: 'Base', num: true }].concat(ctx.ws.scenarios.map(function (s) { return { label: esc(s.name), num: true }; })), ctx.members.map(function (a) { var x = data.series.filter(function (q) { return q.allocationId === a.id; })[0]; return { cells: [esc(a.name), x && x.base.value != null ? F.num(x.base.value, 1) : '—'].concat(ctx.ws.scenarios.map(function (s) { var z = x ? x.scenarios.filter(function (q) { return q.scenarioId === s.id; })[0] : null; return z && z.cell.value != null ? F.num(z.cell.value, 1) : '<span class="faint">' + esc(z ? z.cell.reason : '—') + '</span>'; })) }; }), { maxHeight: '200px' }); } });
  /* shared with cards defined in other files */
  C.h = { colorOf: colorOf, dim: dim, foot: foot, legend: legend, wireLegend: wireLegend, rowSuffix: rowSuffix, periodLabel: periodLabel, modelFoot: modelFoot };
})();

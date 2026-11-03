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
  /** The resolved period, for the notes of a history card (the bar states the preset). */
  function periodNote(data, extra) { return data && data.period ? 'Period: ' + data.period.label + (extra ? ' · ' + extra : '') + '.' : null; }
  /** Subtitle suffix when a scenario is active: forward cards say so; history cards are unaffected. */
  function scenarioSuffix(ctx) { return ctx.scenario && ctx.basis === 'forward' ? ' · scenario ' + ctx.scenario.name + ' where applied' : ''; }
  /* waterfalls show one allocation at a time, chosen by tabs above the chart (remembered until reload) */
  function wfAlloc(card, ctx) { var id = (C.state[card.id] || {}).wf, m = ctx.members; return m.filter(function (a) { return a.id === id; })[0] || m.filter(function (a) { return a.id === ctx.ws.comparison.activeId; })[0] || m[0] || null; }
  function wfTabs(card, ctx, a) { return '<div class="wf-tabs" role="group" aria-label="Allocation shown in the waterfall">' + ctx.members.map(function (x) { return '<button type="button" data-wf="' + esc(x.id) + '" aria-pressed="' + (a && x.id === a.id) + '"><span class="dot" style="background:' + colorOf(x) + '"></span>' + esc(x.name) + '</button>'; }).join('') + '</div>'; }
  function wireWf(body, card) { U.on(body, 'click', '[data-wf]', function (e, b) { (C.state[card.id] = C.state[card.id] || {}).wf = b.dataset.wf; C.repaint(card.id); var nb = document.querySelector('[data-card="' + CSS.escape(card.id) + '"] [data-wf="' + CSS.escape(b.dataset.wf) + '"]'); if (nb) nb.focus(); }); }
  var FACTOR_INK = '#5B6B7C', SPECIFIC_INK = '#AFBAC7';
  function modelFoot(notes) { var seen = {}, out = []; notes.forEach(function (n) { if (n && !seen[n]) { seen[n] = 1; out.push('<span>' + esc(n) + '</span>'); } }); return out.join(''); }
  function packReq(ctx) { return { allocations: U.clone(ctx.members), period: U.clone(ctx.prefs.period) }; }
  function monthsTable(months, series, fmt) { return V.table([{ label: 'Month' }].concat(series.map(function (s) { return { label: esc(s.name), num: true }; })), months.map(function (m, i) { return { cells: [F.month(m)].concat(series.map(function (s) { var v = s.values ? s.values[i] : null; return v == null ? '—' : fmt(v); })) }; }), { maxHeight: '240px' }); }

  /* ── Headline: both bases side by side ───────────────────────────── */
  C.register({ id: 'headline', title: 'Headline', description: 'Forward-looking and historical return, risk, active return and tracking error side by side, with the maximum drawdown and the allocated total.', group: 'Summary', size: { w: 12, h: 5 }, min: { w: 6, h: 3 }, basis: 'dual', factorModel: true,
    settings: [],
    subtitle: function (ctx, s, card) { return '% a year · whole portfolio · active against ' + UI.context.referenceLabel() + C.modelDeparture(card); },
    data: function (ctx, s, card) {
      var req = function (basis) { return { revision: ctx.revision, allocations: U.clone(ctx.members), rowKey: '__total', basis: basis, period: U.clone(ctx.prefs.period), scenario: basis === 'forward' ? U.clone(ctx.scenario) : null, factorModel: C.modelIdOf(card), returnMethod: 'arithmetic', decompose: 'factor', reference: U.clone(ctx.ws.comparison), against: { mode: 'reference' } }; };
      return Promise.all([C.fetch('activeAnalysis', req('forward')), C.fetch('activeAnalysis', req('historical')), C.fetch('historyPack', packReq(ctx))]).then(function (r) { return { fwd: r[0], hist: r[1], pack: r[2] }; });
    },
    render: function (body, data, ctx, s, card) {
      var E = PA.engine, one = function (res, a) { return res.series.filter(function (q) { return q.allocationId === a.id; })[0]; };
      var na = function (why) { return '<span class="faint" data-tip="' + esc(why || 'Unavailable') + '">—</span>'; };
      var th = function (l, cls) { return '<th scope="col" class="num' + (cls ? ' ' + cls : '') + '">' + l + '</th>'; };
      var head = '<thead><tr class="hl-groups"><th scope="col" rowspan="2" class="hl-name">Allocation</th><th scope="colgroup" colspan="4" class="hl-grp is-fwd">→ Forward-looking' + (ctx.scenario ? ' <span class="faint">· scenario ' + esc(ctx.scenario.name) + ' where applied</span>' : '') + '</th><th scope="colgroup" colspan="5" class="hl-grp is-hist grp-start">◷ Historical · ' + esc(data.hist.period ? data.hist.period.label : '') + '</th><th scope="col" rowspan="2" class="num grp-start">Allocated</th></tr><tr>' +
        th('Expected return') + th('Risk') + th('Active return') + th('Tracking error') + th('Return', 'grp-start') + th('Volatility') + th('Active return') + th('Tracking error') + th('Max drawdown') + '</tr></thead>';
      var rows = ctx.members.map(function (a) {
        var f = one(data.fwd, a), h = one(data.hist, a), p = data.pack.series.filter(function (q) { return q.allocationId === a.id; })[0], alloc = E.allocated(a);
        var allocCell = Math.abs(alloc - 100) < 0.05 ? F.num(alloc) : '<span class="warn" data-tip="' + (alloc < 100 ? F.num(100 - alloc) + '% unallocated' : 'Borrowing ' + F.num(alloc - 100) + '%') + '">' + F.num(alloc) + '</span>';
        var fc = !f || f.reason ? [na(f && f.reason), na(), na(f && f.reason), na()] : [F.num(f.totalReturn, 1), F.num(f.totalRisk, 1), V.signed(f.activeReturn, 2), F.num(f.activeRisk, 2)];
        var hc = !h || h.reason || h.totalReturn == null ? [na(h && h.reason), na(), na(h && h.reason), na()] : [F.num(h.totalReturn, 1), F.num(h.totalRisk, 1), V.signed(h.activeReturn, 2), F.num(h.activeRisk, 2)];
        var dd = p && p.stats ? V.signed(p.stats.maxDrawdown, 1) : na('No history in the period');
        return '<tr><th scope="row"><span class="dot" style="background:' + colorOf(a) + '"></span>' + esc(a.name) + (UI.kindTag(a) ? ' ' + UI.kindTag(a) : '') + '</th>' + fc.map(function (c, i) { return '<td class="num' + (i === 0 ? ' lead' : '') + '">' + c + '</td>'; }).join('') + hc.concat([dd]).map(function (c, i) { return '<td class="num' + (i === 0 ? ' lead grp-start' : '') + '">' + c + '</td>'; }).join('') + '<td class="num grp-start">' + allocCell + '</td></tr>';
      }).join('');
      body.innerHTML = '<div class="hl-tbl"><div class="tblwrap" style="max-height:100%"><table class="tbl hl-dual"><caption class="sr-only">Headline figures, forward-looking and historical</caption>' + head + '<tbody>' + rows + '</tbody></table></div></div>' +
        C.notes(card, ['<b>Forward-looking:</b> return from the platform assumptions (' + esc(D.assumptions.model) + ')' + (ctx.scenario ? ', scenario where applied' : '') + '; risk and tracking error from the ' + esc(D.factorModelById[data.fwd.factorModel].name) + ' factor model.', '<b>Historical:</b> realised and annualised from monthly returns, ' + esc(data.hist.period ? data.hist.period.label : '') + '. ' + esc((data.hist.period && data.hist.period.note) || ''), 'Active return and tracking error are measured against ' + esc(UI.context.referenceLabel()) + '. The Active risk & return card shows where they come from.', 'Allocated is the sum of category targets; it is highlighted when it is not 100%.']);
    } });

  /* ── Allocations side by side ────────────────────────────────────── */
  C.register({ id: 'allocations', title: 'Allocations side by side', description: 'Category weights of every compared allocation, with the index-modelled remainder hatched.', group: 'Structure', size: { w: 6, h: 6 }, min: { w: 4, h: 4 }, basis: 'none', livePrefs: true,
    settings: [{ key: 'view', label: 'View', type: 'select', options: [['bars', 'Stacked bars'], ['table', 'Table']], default: 'bars' }],
    subtitle: function (ctx) { return 'Category targets, % of total portfolio'; },
    data: function (ctx) { return C.fetch('breakdown', { allocations: U.clone(ctx.members) }); },
    render: function (body, data, ctx, s) {
      var cats = data.categories;
      if (s.view === 'table') {
        body.innerHTML = V.table([{ label: 'Category' }].concat(ctx.members.map(function (a) { return { label: '<span class="dot" style="background:' + colorOf(a) + ';width:8px;height:8px"></span> ' + esc(a.name), num: true }; })),
          cats.map(function (c) { return { cells: ['<span class="sw" style="background:' + c.color + '"></span> ' + esc(c.name)].concat(data.series.map(function (sr) { var x = sr.categories.filter(function (q) { return q.id === c.id; })[0]; return x.target > 0 || x.implemented > 0 ? F.num(x.target) + (x.remainder > 1e-9 ? ' <span class="faint small" data-tip="Products ' + F.num(x.implemented) + '%, index remainder ' + F.num(x.remainder) + '%">(' + F.num(x.implemented) + ' + ' + F.num(x.remainder) + ')</span>' : x.over ? ' <span class="tag tag-warn" data-tip="Products exceed the category target by ' + F.num(-x.remainder) + '%">over</span>' : '') : '<span class="faint">0.0</span>'; })) }; }).concat([{ cls: 'total', cells: ['Allocated'].concat(data.series.map(function (sr) { return F.num(sr.allocated); })) }]), { maxHeight: '100%' });
        return;
      }
      body.innerHTML = '<div class="viz-legend" style="padding:0 0 6px">' + cats.map(function (c) { return '<span class="legend-note"><span class="sw" style="background:' + c.color + '"></span> ' + esc(c.short) + '</span>'; }).join('') + '<span class="legend-note" data-tip="The part of a category target not yet implemented by products, modelled by the category index"><span class="sw sw-hatch"></span> At index level</span></div><div class="viz-host"></div>';
      V.stackedBars(body.querySelector('.viz-host'), { aria: 'Category weights of ' + ctx.members.length + ' allocations; values in the data table', rows: ctx.members.map(function (a) {
        var sr = data.series.filter(function (x) { return x.allocationId === a.id; })[0], segs = [];
        cats.forEach(function (c) { var x = sr.categories.filter(function (q) { return q.id === c.id; })[0]; if (x.implemented > 0) segs.push({ label: c.short + ' · products', color: c.color, value: Math.min(x.implemented, Math.max(x.target, x.implemented)), tip: c.name + ': ' + F.num(x.implemented) + '% in ' + x.products.length + ' product' + (x.products.length === 1 ? '' : 's') + (x.over ? ' (over the ' + F.num(x.target) + '% target)' : '') }); if (x.remainder > 1e-9) segs.push({ label: c.short + ' · index', color: c.color, value: x.remainder, hatched: true, tip: c.name + ': ' + F.num(x.remainder) + '% unimplemented, modelled by the ' + c.short + ' index basket' }); });
        return { label: a.name, color: colorOf(a), dim: dim(ctx, a), segments: segs };
      }) });
    },
    dataTable: function (data, ctx) { return V.table([{ label: 'Allocation' }].concat(data.categories.map(function (c) { return { label: esc(c.short), num: true }; })), ctx.members.map(function (a) { var sr = data.series.filter(function (x) { return x.allocationId === a.id; })[0]; return { cells: [esc(a.name)].concat(sr.categories.map(function (x) { return F.num(x.target); })) }; }), { maxHeight: '200px' }); } });

  /* ── Cumulative return ───────────────────────────────────────────── */
  C.register({ id: 'cumulative-return', title: 'Cumulative return', description: 'Growth of 100 over the selected period, actual history dashed where it differs from the backtest.', group: 'Historical', size: { w: 6, h: 6 }, min: { w: 4, h: 4 }, basis: 'historical', supportsRow: true,
    settings: [],
    subtitle: function (ctx, s, card) { return 'Growth of 100' + rowSuffix(ctx, card); },
    data: function (ctx, s, card) { return card.followRow ? C.fetch('historySeries', { allocations: U.clone(ctx.members), rowKey: ctx.row, metric: 'return', period: U.clone(ctx.prefs.period) }) : C.fetch('historyPack', packReq(ctx)); },
    render: function (body, data, ctx, s, card) {
      var series = ctx.members.map(function (a) { var x = data.series.filter(function (q) { return q.allocationId === a.id; })[0]; return { id: a.id, name: a.name, color: colorOf(a), values: x ? (card.followRow ? x.values : x.growth) : null, actual: x ? x.actual : null, dim: dim(ctx, a) }; });
      if (series.every(function (x) { return !x.values; })) { body.innerHTML = '<div class="chart-empty">No history for this selection in the period.</div>'; return; }
      body.innerHTML = legend(ctx) + '<div class="viz-host"></div>' + foot(basisNotes(data, ctx) + (series.some(function (x) { return x.actual; }) ? '<span class="legend-note"><span class="sw dashed" style="color:var(--ink-3)"></span> actual history</span>' : '')) + C.notes(card, [periodNote(data, 'monthly data')]);
      V.lineChart(body.querySelector('.viz-host'), { xs: data.months, series: series, height: Math.max(180, body.clientHeight - 90), baseline: 100, fmt: function (v) { return F.num(v, 1); }, aria: ctx.rowLabel + ' growth of 100 over ' + periodLabel(data) + ' for ' + series.length + ' allocations' });
      wireLegend(body);
    },
    dataTable: function (data, ctx, s, card) { return monthsTable(data.months, ctx.members.map(function (a) { var x = data.series.filter(function (q) { return q.allocationId === a.id; })[0]; return { name: a.name, values: x ? (card.followRow ? x.values : x.growth) : null }; }), function (v) { return F.num(v, 1); }); } });

  /* ── Drawdowns ───────────────────────────────────────────────────── */
  C.register({ id: 'drawdowns', title: 'Worst peak-to-trough losses', description: 'The deepest drawdowns of each allocation in the period: peak, trough, depth, length and recovery.', group: 'Historical', size: { w: 6, h: 6 }, min: { w: 4, h: 4 }, basis: 'historical',
    settings: [{ key: 'count', label: 'Episodes per allocation', type: 'select', options: [['1', '1'], ['3', '3'], ['5', '5']], default: '3' }],
    subtitle: function (ctx, s) { return 'Deepest ' + s.count + ' per allocation · whole portfolio'; },
    data: function (ctx) { return C.fetch('historyPack', packReq(ctx)); },
    render: function (body, data, ctx, s, card) {
      var rows = [];
      ctx.members.forEach(function (a) { var x = data.series.filter(function (q) { return q.allocationId === a.id; })[0]; var eps = x ? x.episodes.slice(0, Number(s.count)) : []; if (!eps.length) { rows.push({ cells: ['<span class="dot" style="background:' + colorOf(a) + ';width:8px;height:8px"></span> ' + esc(a.name), '<span class="faint">no drawdown in the period</span>', '', '', '', ''] }); return; } eps.forEach(function (e, i) { rows.push({ cells: [i === 0 ? '<span class="dot" style="background:' + colorOf(a) + ';width:8px;height:8px"></span> ' + esc(a.name) : '', F.month(e.peak), F.month(e.trough), V.signed(e.depth, 1, '%'), e.length + ' mo', e.recovery ? F.month(e.recovery) + ' <span class="faint small">(' + e.recoveryMonths + ' mo)</span>' : '<span class="tag tag-warn">not yet</span>'] }); }); });
      body.innerHTML = V.table([{ label: 'Allocation' }, { label: 'Peak' }, { label: 'Trough' }, { label: 'Depth', num: true }, { label: 'Length', num: true }, { label: 'Recovered' }], rows, { maxHeight: '100%', caption: 'Worst drawdowns' }) + C.notes(card, [periodNote(data, 'monthly observations')]);
    } });

  /* ── Underwater ──────────────────────────────────────────────────── */
  C.register({ id: 'underwater', title: 'Underwater chart', description: 'Distance below the previous peak, month by month.', group: 'Historical', size: { w: 6, h: 5 }, min: { w: 4, h: 4 }, basis: 'historical',
    settings: [],
    subtitle: function () { return '% below the prior peak · whole portfolio'; },
    data: function (ctx) { return C.fetch('historyPack', packReq(ctx)); },
    render: function (body, data, ctx, s, card) {
      var series = ctx.members.map(function (a) { var x = data.series.filter(function (q) { return q.allocationId === a.id; })[0]; return { id: a.id, name: a.name, color: colorOf(a), values: x ? x.underwater : null, dim: dim(ctx, a) }; });
      body.innerHTML = legend(ctx) + '<div class="viz-host"></div>' + C.notes(card, [periodNote(data, 'monthly data')]);
      V.lineChart(body.querySelector('.viz-host'), { xs: data.months, series: series, height: Math.max(160, body.clientHeight - 60), baseline: 0, includeZero: true, fmt: function (v) { return F.num(v, 1) + '%'; }, aria: 'Underwater chart: percentage below the previous peak for ' + series.length + ' allocations' });
      wireLegend(body);
    },
    dataTable: function (data, ctx) { return monthsTable(data.months, ctx.members.map(function (a) { var x = data.series.filter(function (q) { return q.allocationId === a.id; })[0]; return { name: a.name, values: x ? x.underwater : null }; }), function (v) { return F.num(v, 1) + '%'; }); } });

  /* ── Summary statistics ──────────────────────────────────────────── */
  C.register({ id: 'summary-stats', title: 'Summary statistics', description: 'Annualised return, volatility, Sharpe ratio, maximum drawdown, best and worst month.', group: 'Historical', size: { w: 6, h: 6 }, min: { w: 4, h: 4 }, basis: 'historical',
    settings: [],
    subtitle: function () { return 'Annualised · whole portfolio'; },
    data: function (ctx) { return C.fetch('historyPack', packReq(ctx)); },
    render: function (body, data, ctx, s, card) {
      var get = function (a) { var x = data.series.filter(function (q) { return q.allocationId === a.id; })[0]; return x ? x.stats : null; };
      var rows = [
        ['Annualised return', function (st) { return V.signed(st.annReturn, 1, '%'); }], ['Cumulative return', function (st) { return V.signed(st.cumulative, 1, '%'); }], ['Volatility', function (st) { return F.num(st.vol, 1) + '%'; }],
        ['Sharpe ratio', function (st) { return st.sharpe == null ? '—' : F.num(st.sharpe, 2); }], ['Maximum drawdown', function (st) { return V.signed(st.maxDrawdown, 1, '%'); }],
        ['Best month', function (st) { return V.signed(st.bestMonth.r, 1, '%') + ' <span class="faint small">' + F.month(st.bestMonth.m) + '</span>'; }], ['Worst month', function (st) { return V.signed(st.worstMonth.r, 1, '%') + ' <span class="faint small">' + F.month(st.worstMonth.m) + '</span>'; }],
        ['Positive months', function (st) { return F.num(st.positive, 0) + '%'; }], ['Observations', function (st) { return st.months + ' mo'; }]
      ];
      body.innerHTML = V.table([{ label: 'Statistic' }].concat(ctx.members.map(function (a) { return { label: '<span class="dot" style="background:' + colorOf(a) + ';width:8px;height:8px"></span> ' + esc(a.name), num: true }; })), rows.map(function (r) { return { cells: [r[0]].concat(ctx.members.map(function (a) { var st = get(a); return st ? r[1](st) : '<span class="faint">—</span>'; })) }; }), { maxHeight: '100%', caption: 'Summary statistics' }) + foot(basisNotes(data, ctx)) + C.notes(card, [periodNote(data, 'monthly data'), 'Sharpe ratio uses a risk-free rate of ' + F.num(D.assumptions.riskFree, 1) + '%.']);
    } });

  /* ── Calendar-year returns ───────────────────────────────────────── */
  C.register({ id: 'calendar-years', title: 'Calendar-year returns', description: 'Each calendar year of the period as a heat grid; partial years are marked.', group: 'Historical', size: { w: 6, h: 5 }, min: { w: 4, h: 3 }, basis: 'historical',
    settings: [],
    subtitle: function () { return 'Return in each calendar year, % · whole portfolio'; },
    data: function (ctx) { return C.fetch('historyPack', packReq(ctx)); },
    render: function (body, data, ctx, s, card) {
      var years = (data.series[0] && data.series[0].calendar || []).map(function (c) { return c.year; });
      var max = 0; data.series.forEach(function (x) { (x.calendar || []).forEach(function (c) { if (c.ret != null) max = Math.max(max, Math.abs(c.ret)); }); });
      body.innerHTML = V.table([{ label: 'Year' }].concat(ctx.members.map(function (a) { return { label: '<span class="dot" style="background:' + colorOf(a) + ';width:8px;height:8px"></span> ' + esc(a.name), num: true }; })), years.map(function (y) { return { cells: [String(y)].concat(ctx.members.map(function (a) { var x = data.series.filter(function (q) { return q.allocationId === a.id; })[0], c = x ? x.calendar.filter(function (q) { return q.year === y; })[0] : null; return c && c.ret != null ? '<span class="heat" style="background:' + V.shade(c.ret, max) + '" data-tip="' + esc(a.name + ' · ' + y + ': ' + F.num(c.ret, 1) + '%' + (c.partial ? ' (partial year)' : '')) + '">' + F.num(c.ret, 1) + (c.partial ? '<sup aria-label="partial year">*</sup>' : '') + '</span>' : '<span class="faint">—</span>'; })) }; }), { maxHeight: '100%', caption: 'Calendar-year returns, %', cls: 'heat-tbl' }) + foot('<span class="legend-note"><span class="sw" style="background:' + V.shade(1, 1) + '"></span> gain</span><span class="legend-note"><span class="sw" style="background:' + V.shade(-1, 1) + '"></span> loss</span><span>* partial year</span>') + C.notes(card, [periodNote(data), 'Shading is relative to the largest calendar-year move shown.']);
    } });

  /* ── Stress periods ──────────────────────────────────────────────── */
  C.register({ id: 'stress-periods', title: 'Stress periods', description: 'Cumulative return through named market episodes.', group: 'Historical', size: { w: 4, h: 5 }, min: { w: 3, h: 3 }, basis: 'historical',
    settings: [],
    subtitle: function () { return 'Cumulative return through each episode · whole portfolio'; },
    data: function (ctx) { return C.fetch('historyPack', packReq(ctx)); },
    render: function (body, data, ctx) {
      body.innerHTML = V.table([{ label: 'Episode' }].concat(ctx.members.map(function (a) { return { label: '<span class="dot" style="background:' + colorOf(a) + ';width:8px;height:8px"></span> ' + esc(a.name), num: true }; })), data.stress.map(function (p) { return { cells: [esc(p.name) + '<br><span class="faint small">' + F.month(p.start) + ' – ' + F.month(p.end) + '</span>'].concat(ctx.members.map(function (a) { var x = data.series.filter(function (q) { return q.allocationId === a.id; })[0], r = x ? x.stressReturns.filter(function (q) { return q.id === p.id; })[0] : null; return r && r.ret != null ? V.signed(r.ret, 1, '%') : '<button type="button" class="na" data-tip="' + esc(r ? r.reason : 'No history') + '">—</button>'; })) }; }), { maxHeight: '100%', caption: 'Stress periods' });
    } });

  /* ── Rolling return / volatility ─────────────────────────────────── */
  C.register({ id: 'rolling', title: 'Rolling return and volatility', description: 'Rolling 12-month return or rolling 36-month volatility, annualised.', group: 'Historical', size: { w: 6, h: 5 }, min: { w: 4, h: 4 }, basis: 'historical',
    settings: [{ key: 'measure', label: 'Measure', type: 'select', options: [['vol', 'Rolling 36-month volatility'], ['ret', 'Rolling 12-month return']], default: 'vol' }],
    subtitle: function (ctx, s) { return (s.measure === 'vol' ? 'Rolling 36-month volatility, annualised' : 'Rolling 12-month return') + ' · whole portfolio'; },
    data: function (ctx) { return C.fetch('historyPack', packReq(ctx)); },
    render: function (body, data, ctx, s, card) {
      var series = ctx.members.map(function (a) { var x = data.series.filter(function (q) { return q.allocationId === a.id; })[0]; return { id: a.id, name: a.name, color: colorOf(a), values: x && x.rolling ? (s.measure === 'vol' ? x.rolling.vol36 : x.rolling.ret12) : null, dim: dim(ctx, a) }; });
      body.innerHTML = legend(ctx) + '<div class="viz-host"></div>' + C.notes(card, [periodNote(data, 'monthly data')]);
      V.lineChart(body.querySelector('.viz-host'), { xs: data.months, series: series, height: Math.max(160, body.clientHeight - 60), baseline: s.measure === 'ret' ? 0 : null, fmt: function (v) { return F.num(v, 1) + '%'; }, aria: (s.measure === 'vol' ? 'Rolling volatility' : 'Rolling return') + ' for ' + series.length + ' allocations' });
      wireLegend(body);
    },
    dataTable: function (data, ctx, s) { return monthsTable(data.months, ctx.members.map(function (a) { var x = data.series.filter(function (q) { return q.allocationId === a.id; })[0]; return { name: a.name, values: x && x.rolling ? (s.measure === 'vol' ? x.rolling.vol36 : x.rolling.ret12) : null }; }), function (v) { return F.num(v, 1) + '%'; }); } });

  /* ── Risk contribution by category ───────────────────────────────── */
  function tableReq(ctx, metric, extra) { var w = ctx.ws; return Object.assign({ revision: ctx.revision, allocations: U.clone(ctx.members), basis: ctx.basis, metric: metric, values: 'absolute', riskUnits: 'share', factors: [], reference: U.clone(w.comparison), period: U.clone(ctx.prefs.period), scenario: U.clone(ctx.scenario) }, extra || {}); }
  function factorRiskRows(data, ctx) {
    var live = data.factors.filter(function (f) { return ctx.members.some(function (a) { var x = data.series.filter(function (q) { return q.allocationId === a.id; })[0]; return x && x.byFactor && Math.abs(x.byFactor[f.id]) >= 0.005; }); });
    return live.map(function (f) { return { id: f.id, name: f.name }; }).concat([{ id: '__specific', name: 'Specific' }]);
  }
  function factorRiskValue(data, a, id) { var x = data.series.filter(function (q) { return q.allocationId === a.id; })[0]; if (!x || x.total == null) return null; return id === '__specific' ? x.specific : x.byFactor[id]; }
  C.register({ id: 'risk-by-category', title: 'Risk contribution by category', description: 'Each category’s share of total risk, or its contribution to volatility, for every allocation. Can also split risk by factor, from the factor model.', group: 'Forward-looking', size: { w: 6, h: 6 }, min: { w: 4, h: 4 }, basis: 'either',
    entries: [{ settings: { basis: 'forward' } }, { title: 'Realised risk contribution by category', description: 'Each category’s share of realised volatility over the period, for every allocation.', group: 'Historical', settings: { basis: 'historical' } }],
    factorModel: function (s, card) { return s.decompose === 'factor' && C.basisOf(card) === 'forward'; },
    settings: [{ key: 'decompose', label: 'Decompose by', type: 'select', options: [['category', 'Category (platform assumptions)'], ['factor', 'Factor (factor model)']], default: 'category', when: function (s, card) { return C.basisOf(card) === 'forward'; } },
      { key: 'riskUnits', label: 'Units', type: 'select', options: [['share', 'Share of total risk (%)'], ['vol', 'Contribution to volatility (pp)']], default: 'share', when: function (s, card) { return s.decompose !== 'factor' || C.basisOf(card) !== 'forward'; } },
      { key: 'view', label: 'View', type: 'select', options: [['bars', 'Bars · every allocation'], ['waterfall', 'Waterfall · one allocation']], default: 'bars' }],
    subtitle: function (ctx, s, card) { if (s.decompose === 'factor' && ctx.basis === 'forward') return 'pp of portfolio volatility, by factor and specific' + C.modelDeparture(card); return (s.riskUnits === 'share' ? '% share of total risk' : 'pp of portfolio volatility') + ' · by category' + scenarioSuffix(ctx); },
    data: function (ctx, s, card) { if (s.decompose === 'factor' && ctx.basis === 'forward') return C.fetch('factorRisk', { allocations: U.clone(ctx.members), rowKey: '__total', factorModel: C.modelIdOf(card) }); return C.fetch('analyzeTable', tableReq(ctx, 'risk', { riskUnits: s.riskUnits })); },
    render: function (body, data, ctx, s, card) {
      if (data.factors) {
        var fr = factorRiskRows(data, ctx), m = D.factorModelById[data.factorModel];
        if (s.view === 'waterfall') { var wa = wfAlloc(card, ctx), wx = wa && data.series.filter(function (q) { return q.allocationId === wa.id; })[0];
          body.innerHTML = wfTabs(card, ctx, wa) + '<div class="viz-host"></div>' + C.notes(card, ['Each factor’s and the specific contribution add up to ' + (wa ? esc(wa.name) + '’s' : 'the') + ' volatility under the ' + esc(m.name) + ' factor model.']);
          if (wx && wx.total != null) V.waterfall(body.querySelector('.viz-host'), { height: Math.max(170, body.clientHeight - 80), steps: fr.map(function (f) { return { label: f.name, value: factorRiskValue(data, wa, f.id), color: f.id === '__specific' ? SPECIFIC_INK : FACTOR_INK }; }), total: { label: 'Volatility', color: colorOf(wa) }, unit: 'pp', dp: 2, aria: 'Waterfall of ' + wa.name + '’s volatility by factor' }); else body.querySelector('.viz-host').innerHTML = '<div class="chart-empty">Unavailable for this allocation.</div>';
          wireWf(body, card); return; }
        body.innerHTML = legend(ctx) + '<div class="viz-host"></div>' + foot(modelFoot(data.series.map(function (x) { return x.coverage; }))) + C.notes(card, ['Contributions sum to each allocation’s volatility under the ' + esc(m.name) + ' factor model: ' + ctx.members.map(function (a) { var x = data.series.filter(function (q) { return q.allocationId === a.id; })[0]; return esc(a.name) + ' ' + (x && x.total != null ? F.num(x.total, 1) + '%' : '—'); }).join(' · ') + '.', ctx.scenario ? 'Factor-model risk does not change with the scenario.' : null]);
        V.groupedBars(body.querySelector('.viz-host'), { groups: fr.map(function (f) { return f.name; }), series: ctx.members.map(function (a) { return { name: a.name, color: colorOf(a), dim: dim(ctx, a), values: fr.map(function (f) { return factorRiskValue(data, a, f.id); }) }; }), unit: 'pp', dp: 2, height: Math.max(160, body.clientHeight - 80), aria: 'Risk contribution by factor under ' + m.name + ' for ' + ctx.members.length + ' allocations' });
        wireLegend(body); return;
      }
      var cats = data.rows.filter(function (r) { return r.kind === 'category'; });
      var get = function (a, key) { var c = data.cells[a.id] && data.cells[a.id][key]; if (!c) return null; var cell = c.scenario || c.base; return cell ? cell.value : null; };
      if (s.view === 'waterfall') { var wa2 = wfAlloc(card, ctx), share = s.riskUnits === 'share';
        body.innerHTML = wfTabs(card, ctx, wa2) + '<div class="viz-host"></div>' + C.notes(card, [share ? 'Each category’s share of total risk; the shares add up to 100%.' : 'Each category’s contribution to volatility; they add up to ' + (wa2 ? esc(wa2.name) + '’s' : 'the') + ' volatility.', 'A category’s risk is its products’ contributions to the portfolio, not its stand-alone volatility. A negative step offsets risk elsewhere.']);
        if (wa2) V.waterfall(body.querySelector('.viz-host'), { height: Math.max(170, body.clientHeight - 80), steps: cats.map(function (r) { var c = D.categoryById[r.key]; return { label: c.short, value: get(wa2, r.key), color: c.color }; }), total: { label: share ? 'Total risk' : 'Volatility', color: colorOf(wa2) }, unit: share ? '%' : 'pp', dp: share ? 1 : 2, aria: 'Waterfall of ' + wa2.name + '’s risk by category' });
        wireWf(body, card); return; }
      body.innerHTML = legend(ctx) + '<div class="viz-host"></div>' + foot((data.warnings || []).map(function (w) { return '<span class="tag tag-warn">' + esc(w) + '</span>'; }).join('')) + C.notes(card, [ctx.basis === 'forward' ? 'From the platform assumptions' + (data.scenarioApplies ? '; scenario values where the scenario applies' : '') + '.' : 'Realised over the period.', 'A category’s risk is its products’ contributions to the portfolio, not its stand-alone volatility.']);
      V.groupedBars(body.querySelector('.viz-host'), { groups: cats.map(function (r) { return D.categoryById[r.key].short; }), series: ctx.members.map(function (a) { return { name: a.name, color: colorOf(a), dim: dim(ctx, a), values: cats.map(function (r) { return get(a, r.key); }) }; }), unit: data.unit, dp: 1, height: Math.max(160, body.clientHeight - 70), aria: 'Risk contribution by category for ' + ctx.members.length + ' allocations' });
      wireLegend(body);
    },
    dataTable: function (data, ctx) { if (data.factors) { var fr = factorRiskRows(data, ctx); return V.table([{ label: 'Source' }].concat(ctx.members.map(function (a) { return { label: esc(a.name), num: true }; })), fr.map(function (f) { return { cells: [esc(f.name)].concat(ctx.members.map(function (a) { var v = factorRiskValue(data, a, f.id); return v == null ? '—' : F.num(v, 2); })) }; }).concat([{ cls: 'total', cells: ['Volatility'].concat(ctx.members.map(function (a) { var x = data.series.filter(function (q) { return q.allocationId === a.id; })[0]; return x && x.total != null ? F.num(x.total, 2) : '—'; })) }]), { maxHeight: '220px' }); } var cats = data.rows.filter(function (r) { return r.kind === 'category'; }); return V.table([{ label: 'Category' }].concat(ctx.members.map(function (a) { return { label: esc(a.name), num: true }; })), cats.map(function (r) { return { cells: [esc(r.label)].concat(ctx.members.map(function (a) { var c = data.cells[a.id][r.key], cell = c.scenario || c.base; return cell && cell.value != null ? F.num(cell.value, 1) : '—'; })) }; }), { maxHeight: '200px' }); } });

  /* ── Factor exposures ────────────────────────────────────────────── */
  C.register({ id: 'factor-exposures', title: 'Factor exposures', description: 'Stand-alone factor betas of the selected row, or the portfolio, for every allocation, under the chosen factor model.', group: 'Forward-looking', size: { w: 6, h: 6 }, min: { w: 4, h: 4 }, basis: 'either', supportsRow: true, factorModel: true,
    entries: [{ settings: { basis: 'forward' } }, { title: 'Realised factor exposures', description: 'Regression betas over the period, for the selected row or the portfolio, under the chosen factor model.', group: 'Historical', settings: { basis: 'historical' } }],
    settings: [{ key: 'factors', label: 'Factors', type: 'factors', default: null }],
    subtitle: function (ctx, s, card) { return 'β, stand-alone exposure' + rowSuffix(ctx, card) + C.modelDeparture(card); },
    data: function (ctx, s, card) { var m = C.modelIdOf(card); return C.fetch('analyzeTable', tableReq(ctx, 'factor', { factors: C.factorsFor(s.factors, m).ids, factorModel: m })); },
    render: function (body, data, ctx, s, card) {
      var key = card.followRow ? ctx.row : '__total', m = D.factorModelById[data.factorModel || 'isg'], pick = C.factorsFor(s.factors, m.id), ids = pick.ids.filter(function (f) { return m.factorById[f]; });
      var get = function (a, fid) { var c = data.cells[a.id] && data.cells[a.id][key]; if (!c) return null; var cell = c.scenario || c.base; return cell && cell.factors ? cell.factors[fid] : null; };
      var cov = ctx.members.map(function (a) { var c = data.cells[a.id] && data.cells[a.id][key]; return c && c.base && c.base.coverage ? a.name + ': ' + c.base.coverage.replace(/^Proxied by the category index in [^:]+: /, 'proxied by its index in ' + m.name + ': ') : null; });
      body.innerHTML = legend(ctx) + '<div class="viz-host"></div>' + foot((pick.mapped ? '<span class="tag tag-info">Mapped</span><span>' + esc(pick.mapped) + '.</span>' : '') + modelFoot(cov)) + C.notes(card, [esc(m.long) + ', as of ' + F.date(m.asOf) + '. ' + (ctx.basis === 'forward' ? 'Model exposures.' : 'Estimated over the period.'), 'Units differ by factor, so compare an exposure across allocations rather than across factors.']);
      V.groupedBars(body.querySelector('.viz-host'), { groups: ids.map(function (f) { return m.factorById[f].name; }), series: ctx.members.map(function (a) { return { name: a.name, color: colorOf(a), dim: dim(ctx, a), values: ids.map(function (f) { return get(a, f); }) }; }), unit: 'β', dp: 2, height: Math.max(160, body.clientHeight - 80), aria: ctx.rowLabel + ' factor exposures under ' + m.name + ' for ' + ctx.members.length + ' allocations' });
      wireLegend(body);
    },
    dataTable: function (data, ctx, s, card) { var key = card.followRow ? ctx.row : '__total', m = D.factorModelById[data.factorModel || 'isg']; return V.table([{ label: 'Factor · ' + esc(m.name) }].concat(ctx.members.map(function (a) { return { label: esc(a.name), num: true }; })), C.factorsFor(s.factors, m.id).ids.filter(function (f) { return m.factorById[f]; }).map(function (f) { return { cells: [esc(m.factorById[f].name)].concat(ctx.members.map(function (a) { var c = data.cells[a.id] && data.cells[a.id][key], cell = c && (c.scenario || c.base); var v = cell && cell.factors ? cell.factors[f] : null; return v == null ? '—' : F.num(v, 2); })) }; }), { maxHeight: '200px' }); } });

  /* ── Correlation between allocations ─────────────────────────────── */
  C.register({ id: 'correlation', title: 'Correlation between allocations', description: 'Correlation of monthly returns between the compared allocations over the period.', group: 'Historical', size: { w: 4, h: 5 }, min: { w: 3, h: 3 }, basis: 'historical',
    settings: [],
    subtitle: function () { return 'Of monthly returns · whole portfolio'; },
    data: function (ctx) { return C.fetch('historyPack', packReq(ctx)); },
    render: function (body, data, ctx, s, card) {
      var idx = ctx.members.map(function (a) { return data.series.findIndex(function (q) { return q.allocationId === a.id; }); });
      V.heatmap(body, { labels: ctx.members.map(function (a) { return a.name; }), matrix: idx.map(function (i) { return idx.map(function (j) { return i < 0 || j < 0 ? null : data.correlation[i][j]; }); }), aria: 'Correlation matrix of monthly returns between allocations' });
      if (periodNote(data)) body.insertAdjacentHTML('beforeend', C.notes(card, [periodNote(data)]));
    } });

  /* ── Projections ─────────────────────────────────────────────────── */
  C.register({ id: 'projections', title: 'Projections with bands', description: 'Central path and probability bands for each emphasized allocation, on shared axes.', group: 'Forward-looking', size: { w: 12, h: 6 }, min: { w: 6, h: 4 }, basis: 'forward', supportsRow: true, defaultFollowRow: true,
    settings: [{ key: 'projectionBasis', label: 'Basis', type: 'select', options: [['standalone', 'Standalone: 100 invested in the row'], ['contribution', 'Contribution: the row’s share of a portfolio of 100']], default: 'standalone' }],
    subtitle: function (ctx, s, card) { return (s.projectionBasis === 'contribution' ? 'Contribution basis' : 'Standalone basis') + rowSuffix(ctx, card) + ' · ' + ctx.ws.currency + (ctx.scenario ? ' · scenario ' + ctx.scenario.name + ' where applied' : ''); },
    data: function (ctx, s, card) { return C.fetch('projection', { allocations: U.clone(ctx.members), rowKey: card.followRow ? ctx.row : '__total', scenario: U.clone(ctx.scenario), horizon: ctx.prefs.horizon, confidence: ctx.prefs.confidence, basis: s.projectionBasis }); },
    render: function (body, data, ctx, s, card) {
      var panels = ctx.members.filter(function (a) { return !dim(ctx, a); }).map(function (a) { var x = data.series.filter(function (q) { return q.allocationId === a.id; })[0]; return { id: a.id, name: a.name, color: colorOf(a), s: x, tag: x && x.inScope ? ' <span class="tag tag-info">Scenario</span>' : (ctx.scenario ? ' <span class="tag">Base</span>' : '') }; });
      body.innerHTML = legend(ctx) + '<div class="viz-host"></div>' + C.notes(card, ['Over ' + ctx.prefs.horizon + ' years, with 50% and ' + Math.round(ctx.prefs.confidence * 100) + '% bands.', 'Bands show the modelled range at the stated probability. They are not a guaranteed outcome.']);
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
  C.h = { colorOf: colorOf, dim: dim, foot: foot, legend: legend, wireLegend: wireLegend, rowSuffix: rowSuffix, periodLabel: periodLabel, periodNote: periodNote, scenarioSuffix: scenarioSuffix, modelFoot: modelFoot, wfAlloc: wfAlloc, wfTabs: wfTabs, wireWf: wireWf, FACTOR_INK: FACTOR_INK, SPECIFIC_INK: SPECIFIC_INK };
})();

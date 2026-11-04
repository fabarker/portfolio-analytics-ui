/* ─────────────────────────────────────────────────────────────────────────
   Portfolio Analytics · the Drivers & Differences card
   The integrated table: one column group per allocation, rows aligned on
   the common category grouping, with the row selection other cards follow.
   ───────────────────────────────────────────────────────────────────────── */
(function () {
  'use strict';
  var PA = window.PA, U = PA.util, esc = U.esc, S = PA.store, UI = PA.ui, D = PA.data, I = U.icon, F = U.fmt, C = PA.cards;
  var T = UI.table = {};
  var METRICS = { weight: 'Allocation weight', return: 'Return contribution', risk: 'Risk contribution', factor: 'Factor exposure', factorReturn: 'Return contribution by factor', factorRisk: 'Risk contribution by factor' };
  var isF = function (m) { return m === 'factor' || m === 'factorReturn' || m === 'factorRisk'; };
  T.isFactorMetric = isF;
  T.metricLabel = function (m) { return METRICS[m] || m; };
  T.unitLabel = function (basis, s) {
    var d = s.values === 'delta';
    if (s.view === 'focus') return s.metric === 'factor' ? 'β; others as differences from the focus' : (s.metric === 'risk' && s.riskUnits === 'share' ? '% share of total risk' : 'pp') + '; others as differences from the focus';
    if (s.metric === 'weight') return d ? 'pp difference vs reference' : '% of total portfolio';
    if (s.metric === 'return') return (d ? 'pp difference vs reference' : 'pp of portfolio return') + (basis === 'historical' ? ', annualised' : ', annual expected');
    if (s.metric === 'factorReturn') return (d ? 'pp difference vs reference' : 'pp of portfolio return') + (basis === 'historical' ? ', annualised' : ', annual expected');
    if (s.metric === 'factorRisk') return d ? 'pp difference in volatility contribution' : 'pp of portfolio volatility, annual';
    if (s.metric === 'risk') return s.riskUnits === 'share' ? (d ? 'pp difference in share of total risk' : '% share of total risk') : (d ? 'pp difference in volatility contribution' : 'pp of portfolio volatility, annual');
    return (d ? 'β difference vs reference' : 'β, stand-alone exposure') + (basis === 'historical' ? ', estimated over the period' : ', model exposure');
  };
  var prevCells = {};

  function toolbar(s, ctx, card) {
    var sc = ctx.scenario, seg = function (name, opts, cur) { return '<div class="seg" role="group" aria-label="' + esc(name) + '">' + opts.map(function (o) { return '<button type="button" data-dd="' + name.toLowerCase() + '" data-val="' + o[0] + '" aria-pressed="' + (cur === o[0]) + '">' + esc(o[1]) + '</button>'; }).join('') + '</div>'; };
    var segc = function (name, label, opts, cur) { return '<div class="ctl"><span class="label">' + label + '</span>' + seg(name, opts, cur) + '</div>'; };
    var focus = focusId(s, ctx);
    var html = '<div class="dd-tools">' + segc('Metric', 'By product', [['weight', 'Weight'], ['return', 'Return'], ['risk', 'Risk']], s.metric) + segc('Metric', 'By factor', [['factor', 'Exposure'], ['factorReturn', 'Return'], ['factorRisk', 'Risk']], s.metric) +
      (s.metric === 'weight' ? '' : segc('Basis', 'Basis', [['forward', 'Forward-looking'], ['historical', 'Historical']], s.basis)) +
      segc('View', 'View', [['table', 'Table'], ['focus', 'Focus']], s.view) +
      (s.view === 'focus' ? '<div class="ctl dd-focus"><span class="label">Focus</span><div class="seg" role="group" aria-label="Focus allocation">' + ctx.members.map(function (a) { return '<button type="button" data-dd="focus" data-val="' + esc(a.id) + '" aria-pressed="' + (a.id === focus) + '"><span class="dot" style="background:' + UI.colorOf(a) + '"></span>' + esc(a.name) + '</button>'; }).join('') + '</div></div>'
        : '<div class="ctl">' + seg('Values', [['absolute', s.metric === 'factor' ? 'Exposures' : s.metric === 'weight' ? 'Weights' : 'Contributions'], ['delta', 'Differences']], s.values) + '</div>');
    if (s.metric === 'risk') html += '<div class="ctl"><label class="label" for="dd-risk-' + card.id + '">Risk units</label><select id="dd-risk-' + card.id + '" class="input-sm" data-dd-sel="riskUnits"><option value="share"' + (s.riskUnits === 'share' ? ' selected' : '') + '>Share of total risk (%)</option><option value="vol"' + (s.riskUnits === 'vol' ? ' selected' : '') + '>Contribution to volatility (pp)</option></select></div>';
    if (sc && ctx.basis !== 'historical' && !isF(s.metric) && s.view !== 'focus') html += '<div class="ctl"><label class="label" for="dd-scn-' + card.id + '">Scenario columns</label><select id="dd-scn-' + card.id + '" class="input-sm" data-dd-sel="scenarioView"><option value="delta"' + (s.scenarioView === 'delta' ? ' selected' : '') + '>Scenario + Δ vs Base</option><option value="pair"' + (s.scenarioView === 'pair' ? ' selected' : '') + '>Base | Scenario</option></select></div>';
    var open = !!S.session.rowFilter || !!(C.state[card.id] && C.state[card.id].searchOpen);
    html += '<span class="spacer"></span>' + (isF(s.metric) ? '' : open ? '<div class="search-wrap row-search">' + I.search + '<input type="search" class="input-sm" data-dd-search placeholder="Find a row…" aria-label="Find a row" value="' + esc(S.session.rowFilter) + '"></div>' : '<button type="button" class="btn btn-icon btn-ghost btn-sm" data-dd-searchbtn aria-label="Find a row" data-tip="Find a row">' + I.search + '</button>') + '</div>';
    return html;
  }
  function colSets(col, applies, s) {
    if (col.sets.length === 1) return [{ set: 'base', label: s.metric === 'factor' ? null : (applies ? 'Base · out of scope' : null), out: !!applies }];
    if (s.metric === 'factor') return [{ set: 'scenario', label: null, withDelta: true }];
    if (s.scenarioView === 'pair') return [{ set: 'base', label: 'Base' }, { set: 'scenario', label: 'Scenario' }];
    return [{ set: 'scenario', label: 'Scenario' }, { set: 'delta', label: 'Δ vs Base' }];
  }
  function cellValue(cell, spec, fid) {
    if (!cell) return { value: null, reason: 'Unavailable' };
    var get = function (set) { var c = cell[set]; if (!c) return { value: null, reason: 'Unavailable' }; if (fid) return { value: c.factors ? c.factors[fid] : null, reason: c.reasons ? c.reasons[fid] : c.reason, note: c.note, coverage: c.coverage }; return c; };
    if (spec.set === 'delta') { var b = get('base'), sc = get('scenario'); if (b.value == null || sc.value == null) return { value: null, reason: sc.reason || b.reason || 'Unavailable' }; return { value: sc.value - b.value, note: sc.note }; }
    return get(spec.set);
  }
  function fmtVal(v, unit, signed) { if (v == null || !isFinite(v)) return '—'; var dp = unit === 'β' ? 2 : 1; return signed ? F.signed(v, dp) : F.num(v, dp); }

  function visibleRows(res) {
    var ex = S.ws.prefs.expanded, q = S.session.rowFilter.trim().toLowerCase(), rows = res.rows, out = [];
    if (q) {
      var keep = {};
      rows.forEach(function (r) { if (r.label.toLowerCase().indexOf(q) >= 0 || (r.instrument && (r.instrument.identifier.toLowerCase().indexOf(q) >= 0 || (r.instrument.manager || '').toLowerCase().indexOf(q) >= 0))) { keep[r.key] = 'match'; if (r.parent) keep[r.parent] = keep[r.parent] || 'parent'; } });
      rows.forEach(function (r) { if (keep[r.key]) out.push({ row: r, match: keep[r.key] === 'match' }); else if (r.kind === 'total' || r.kind === 'residual') out.push({ row: r }); });
      return out;
    }
    rows.forEach(function (r) { if (r.depth === 0 || ex.indexOf(r.parent) >= 0) out.push({ row: r }); });
    return out;
  }
  function sortRows(list, res) {
    var sort = S.session.sort; if (!sort) return list;
    var val = function (r) { var c = cellValue(res.cells[sort.allocationId] && res.cells[sort.allocationId][r.key], sort.spec, sort.factorId); return c.value; };
    var cmp = function (a, b) { var va = val(a.row), vb = val(b.row); if (va == null && vb == null) return 0; if (va == null) return 1; if (vb == null) return -1; if (sort.dir === 'abs') return Math.abs(vb) - Math.abs(va); return sort.dir === 'desc' ? vb - va : va - vb; };
    var byParent = {}; list.forEach(function (x) { if (x.row.kind === 'residual' || x.row.kind === 'total') return; (byParent[x.row.parent || '__root'] = byParent[x.row.parent || '__root'] || []).push(x); });
    Object.keys(byParent).forEach(function (k) { byParent[k].sort(cmp); });
    var out = [], emit = function (pk) { (byParent[pk] || []).forEach(function (x) { out.push(x); emit(x.row.key); }); }; emit('__root');
    list.forEach(function (x) { if (x.row.kind === 'residual' || x.row.kind === 'total') out.push(x); });
    return out;
  }

  function tableHtml(res, s, ctx, card) {
    var w = S.ws, unit = res.unit, signed = s.values === 'delta', active = w.comparison.activeId, p = w.prefs;
    var cols = res.columns.map(function (c) { return { col: c, specs: colSets(c, res.scenarioApplies, s), alloc: S.allocation(c.allocationId) }; });
    /* the basis label is drawn only where columns differ (actual against backtest) or one is edited */
    var labels = {}; res.columns.forEach(function (c) { labels[c.basisLabel] = 1; }); var basisDiffers = Object.keys(labels).length > 1;
    var factorIds = s.metric === 'factor' ? s.factors : [null], span = function (c) { return c.specs.length * factorIds.length; };
    var anyOpen = p.expanded.length > 0;
    var h1 = '<tr><th class="rowhead" rowspan="2" scope="col"><span class="rowcell"><button type="button" class="tw" data-dd-all aria-expanded="' + anyOpen + '" aria-label="' + (anyOpen ? 'Collapse every category' : 'Expand every category') + '" data-tip="' + (anyOpen ? 'Collapse all' : 'Expand all') + '">' + I.chevron + '</button><span>Category / product</span></span></th>' + cols.map(function (c) {
      var col = c.col, a = c.alloc;
      var meta = col.basisLabel.indexOf('Edited') === 0 ? '<span class="gmeta" data-tip="' + esc(col.basisDetail) + '"><span class="tag tag-edit">' + esc(col.basisLabel) + '</span></span>' : basisDiffers ? '<span class="gmeta" data-tip="' + esc(col.basisDetail) + '">' + esc(col.basisLabel) + '</span>' : '';
      if (s.values === 'delta') meta += '<span class="gmeta">' + (col.referenceLabel ? 'vs <b>' + esc(col.referenceLabel) + '</b>' : '<span class="ref-na" data-tip="Differences for this allocation are unavailable until a benchmark is assigned.">' + esc(col.referenceReason || 'No reference') + '</span>') + '</span>';
      if (res.scenarioApplies) meta += '<span class="gmeta">' + (col.inScope ? 'Scenario: <b>' + esc(col.scenarioName) + '</b>' : '<span class="faint">Base case · not in scope</span>') + '</span>';
      if (col.coverageNote) meta += '<span class="gmeta"><span class="tag tag-warn" data-tip="' + esc(col.coverageNote) + '">Coverage ' + (col.coverageWeight != null ? F.num(col.coverageWeight, 0) + '%' : '') + '</span></span>';
      return '<th class="grp' + (col.allocationId === active ? ' is-active' : '') + '" colspan="' + span(c) + '" scope="colgroup"><span class="gname"><span class="dot" style="background:' + UI.colorOf(a) + '"></span>' + esc(col.name) + UI.kindTag(a) + '</span>' + meta + '</th>';
    }).join('') + '</tr>';
    var h2 = '<tr class="sub">' + cols.map(function (c) { return c.specs.map(function (spec) { return factorIds.map(function (fid) {
      var label = fid ? (D.factorModelById[res.factorModel || 'isg'].factorById[fid] || { name: fid }).name + (spec.withDelta ? ' · scenario' : '') : (spec.label || unit), sortKey = c.col.allocationId + '|' + spec.set + '|' + (fid || ''), sort = S.session.sort, isSorted = sort && sort.key === sortKey;
      return '<th class="' + (spec.set === 'delta' ? 'delta' : spec.label ? '' : 'unit') + '" scope="col" aria-sort="' + (isSorted ? (sort.dir === 'asc' ? 'ascending' : 'descending') : 'none') + '"><button type="button" class="sortbtn" data-sort="' + esc(sortKey) + '" data-tip="Sort siblings by this column' + (signed ? ' (third click: by magnitude)' : '') + '">' + esc(label) + ' ' + I.sort + '</button></th>';
    }).join(''); }).join(''); }).join('') + '</tr>';
    var list = sortRows(visibleRows(res), res), sel = p.selectedRow, newCells = {}, flash = !!card._flash;
    var body = list.map(function (x) {
      var r = x.row, cls = 'depth-' + r.depth + (r.kind === 'category' ? ' cat' : '') + (r.kind === 'total' ? ' total' : '') + (r.kind === 'residual' ? ' residual' : '') + (r.kind === 'index' ? ' index-row' : '') + (sel === r.key ? ' is-selected' : '') + (x.match ? ' is-match' : '');
      var expandable = r.kind === 'category' && r.hasChildren, isEx = p.expanded.indexOf(r.key) >= 0 || !!S.session.rowFilter.trim();
      var sub = r.kind === 'index' ? '<span class="rsub" data-tip="' + esc(r.note) + '">remainder</span>' : '';
      var rh = '<th class="rowhead" scope="row"><span class="rowcell"><button type="button" class="tw' + (expandable ? '' : ' is-leaf') + '" data-expand="' + esc(r.key) + '" aria-expanded="' + isEx + '" aria-label="' + (isEx ? 'Collapse ' : 'Expand ') + esc(r.label) + '"' + (expandable ? '' : ' tabindex="-1" aria-hidden="true"') + '>' + I.chevron + '</button><button type="button" class="rowbtn" data-row="' + esc(r.key) + '" aria-pressed="' + (sel === r.key) + '" aria-label="' + esc(r.label) + ', select for the cards that follow the row"><span class="rlabel"' + (r.instrument ? ' data-tip="' + esc(r.instrument.type + ' · ' + r.instrument.identifier) + '"' : '') + '>' + esc(r.label) + '</span></button>' + sub + '</span></th>';
      var tds = cols.map(function (c) { var cell = res.cells[c.col.allocationId] && res.cells[c.col.allocationId][r.key]; return c.specs.map(function (spec) { return factorIds.map(function (fid) {
        var v = cellValue(cell, spec, fid), key = c.col.allocationId + '|' + r.key + '|' + spec.set + '|' + (fid || ''), txt = fmtVal(v.value, unit, signed || spec.set === 'delta');
        newCells[key] = txt;
        var changed = flash && prevCells[key] !== undefined && prevCells[key] !== txt, tip = '';
        if (spec.withDelta && cell && cell.base && cell.scenario) { var bv = cell.base.factors ? cell.base.factors[fid] : null, sv = cell.scenario.factors ? cell.scenario.factors[fid] : null; if (bv != null && sv != null) tip = 'Base ' + F.num(bv, 2) + ' · Δ vs Base ' + F.signed(sv - bv, 2); }
        if (v.note) tip = (tip ? tip + ' · ' : '') + esc(v.note);
        var inner = v.value == null ? '<button type="button" class="na" data-tip="' + esc(v.reason || 'Unavailable') + '" aria-label="Unavailable: ' + esc(v.reason || '') + '">—</button>' : '<span' + (tip ? ' data-tip="' + tip + '"' : '') + '>' + txt + '</span>' + (v.coverage ? '<span class="cov-dot" data-tip="' + esc(v.coverage) + '" role="img" aria-label="' + esc(v.coverage) + '"></span>' : '');
        return '<td class="num' + (spec.set === 'delta' ? ' delta' : '') + (v.value != null && v.value < -1e-9 && (signed || spec.set === 'delta') ? ' neg' : '') + (spec.out ? ' out-scope' : '') + (changed ? ' is-flash' : '') + '">' + inner + '</td>';
      }).join(''); }).join(''); }).join('');
      return '<tr class="' + cls + '" data-rowkey="' + esc(r.key) + '">' + rh + tds + '</tr>';
    }).join('');
    prevCells = newCells; card._flash = false;
    return '<div class="tblwrap dd-wrap" tabindex="0" aria-label="Drivers and differences table, scrolls"><table class="tbl dd"><caption class="sr-only">' + esc('Drivers and differences: ' + METRICS[s.metric] + ' by category and product for ' + cols.length + ' allocations, ' + T.unitLabel(ctx.basis, s)) + '</caption><thead>' + h1 + h2 + '</thead><tbody>' + body + '</tbody></table></div>';
  }
  /* ── factor rows: one row per factor, one column per allocation ───── */
  function focusId(s, ctx) { var ids = ctx.members.map(function (a) { return a.id; }); return ids.indexOf(s.focus) >= 0 ? s.focus : ids.indexOf(ctx.ws.comparison.activeId) >= 0 ? ctx.ws.comparison.activeId : ids[0]; }
  function bar(v, max, color) { if (v == null || !isFinite(v)) return ''; var w = Math.min(1, Math.abs(v) / (max || 1)) * 50; return '<span class="ddbar" aria-hidden="true"><i style="' + (v >= 0 ? 'left:50%' : 'right:50%') + ';width:' + w.toFixed(1) + '%;background:' + color + '"></i></span>'; }
  function factorItems(res, m) {
    var items = res.factors.map(function (f) { return { id: f.id, label: f.name, tip: f.description, get: function (b) { return m === 'factor' ? b.exposure[f.id] : m === 'factorReturn' ? b.ret.byFactor[f.id] : b.risk.byFactor[f.id]; } }; });
    if (m === 'factorReturn') items.push({ id: '__cash', label: 'Cash (risk-free)', tip: 'The risk-free rate on the net weight', get: function (b) { return b.ret.cash; }, fixed: true });
    if (m !== 'factor') items.push({ id: '__specific', label: 'Specific', tip: m === 'factorReturn' ? 'Return not explained by the factors or cash: selection' : 'Risk not explained by the factors', get: function (b) { return m === 'factorReturn' ? b.ret.specific : b.risk.specific; }, fixed: true });
    return items;
  }
  function factorTotal(m, b) { return m === 'factorReturn' ? b.ret.total : m === 'factorRisk' ? b.risk.total : null; }
  function factorTableHtml(res, s, ctx, card) {
    var m = s.metric, d = s.values === 'delta', dp = m === 'factor' ? 2 : 2, items = factorItems(res, m), ser = {}; res.series.forEach(function (x) { ser[x.allocationId] = x; });
    var valOf = function (a, it) { var x = ser[a.id]; if (!x || !x.values) return null; var v = it.get(x.values); if (!d) return v; if (!x.reference) return null; return v - it.get(x.reference); };
    var size = function (it) { return Math.max.apply(null, ctx.members.map(function (a) { var v = valOf(a, it); return v == null ? 0 : Math.abs(v); })); };
    var fac = items.filter(function (it) { return !it.fixed; }).sort(function (a, b) { return size(b) - size(a); }), fixed = items.filter(function (it) { return it.fixed; });
    var all = !!(C.state[card.id] && C.state[card.id].allFactors), shown = all ? fac : fac.slice(0, 8), list = shown.concat(fixed), max = 0;
    items.forEach(function (it) { ctx.members.forEach(function (a) { var v = valOf(a, it); if (v != null) max = Math.max(max, Math.abs(v)); }); });
    var head = '<tr><th class="rowhead" scope="col">' + (m === 'factor' ? 'Factor' : 'Source') + ' · ' + esc(D.factorModelById[res.factorModel].name) + '</th>' + ctx.members.map(function (a) { var x = ser[a.id]; return '<th class="grp num' + (a.id === ctx.ws.comparison.activeId ? ' is-active' : '') + '" scope="col"><span class="gname"><span class="dot" style="background:' + UI.colorOf(a) + '"></span>' + esc(a.name) + UI.kindTag(a) + '</span>' + (d ? '<span class="gmeta">' + (x && x.referenceLabel ? 'vs <b>' + esc(x.referenceLabel) + '</b>' : '<span class="ref-na">' + esc((x && x.referenceReason) || 'No reference') + '</span>') + '</span>' : '') + '</th>'; }).join('') + '</tr>';
    var cell = function (a, v, why) { if (v == null) return '<td class="num"><button type="button" class="na" data-tip="' + esc(why || 'Unavailable') + '" aria-label="Unavailable">—</button></td>'; return '<td class="num' + (v < -1e-9 && (d || m !== 'factor') ? ' neg' : '') + '"><span class="ddcell"><span>' + (d ? F.signed(v, dp) : F.num(v, dp)) + '</span>' + bar(v, max, UI.colorOf(a)) + '</span></td>'; };
    var body = list.map(function (it) { return '<tr class="frow' + (it.fixed ? ' is-fixed' : '') + '"><th class="rowhead" scope="row"><span class="rlabel" data-tip="' + esc(it.tip || '') + '">' + esc(it.label) + '</span></th>' + ctx.members.map(function (a) { var x = ser[a.id]; return cell(a, valOf(a, it), x && (x.reason || (d && !x.reference ? x.referenceReason : null))); }).join('') + '</tr>'; }).join('');
    if (m !== 'factor') body += '<tr class="total"><th class="rowhead" scope="row">' + (m === 'factorReturn' ? (ctx.basis === 'historical' ? 'Realised return' : 'Expected return') : 'Volatility') + '</th>' + ctx.members.map(function (a) { var x = ser[a.id]; if (!x || !x.values || (d && !x.reference)) return '<td class="num">—</td>'; var v = factorTotal(m, x.values) - (d ? factorTotal(m, x.reference) : 0); return '<td class="num' + (d && v < -1e-9 ? ' neg' : '') + '">' + (d ? F.signed(v, 2) : F.num(v, 2)) + '</td>'; }).join('') + '</tr>';
    var more = fac.length > 8 ? '<button type="button" class="btn btn-link dd-more" data-dd-allf>' + (all ? 'Show the largest 8 factors' : 'Show all ' + fac.length + ' factors') + '</button>' : '';
    return '<div class="tblwrap dd-wrap" tabindex="0" aria-label="Factor table, scrolls"><table class="tbl dd dd-f"><caption class="sr-only">' + esc(METRICS[m] + ' by factor for ' + ctx.members.length + ' allocations, largest first') + '</caption><thead>' + head + '</thead><tbody>' + body + '</tbody></table></div>' + more;
  }
  /* ── focus: one allocation's values, every other as a difference from it ── */
  function focusHead(ctx, focus, refLabel, first) {
    var others = ctx.members.filter(function (a) { return a.id !== focus.id; });
    return '<tr><th class="rowhead" scope="col">' + first + '</th><th class="grp num is-active" scope="col"><span class="gname"><span class="dot" style="background:' + UI.colorOf(focus) + '"></span>' + esc(focus.name) + '</span><span class="gmeta">Focus</span></th>' +
      others.map(function (a) { return '<th class="grp num" scope="col"><span class="gname"><span class="dot" style="background:' + UI.colorOf(a) + '"></span>' + esc(a.name) + '</span><span class="gmeta">− focus</span></th>'; }).join('') +
      '<th class="grp num" scope="col"><span class="gname">' + esc(refLabel || 'Reference') + '</span><span class="gmeta">' + (refLabel ? 'Reference − focus' : 'No reference') + '</span></th></tr>';
  }
  function focusCells(focus, others, fv, diffs, refDiff, max, dp) {
    var c = function (v, color) { return v == null ? '<td class="num"><span class="faint">—</span></td>' : '<td class="num' + (v < -1e-9 ? ' neg' : '') + '"><span class="ddcell"><span>' + F.signed(v, dp) + '</span>' + bar(v, max, color) + '</span></td>'; };
    return '<td class="num lead' + (fv != null && fv < -1e-9 ? ' neg' : '') + '">' + (fv == null ? '<span class="faint">—</span>' : F.num(fv, dp)) + '</td>' + others.map(function (a, i) { return c(diffs[i], UI.colorOf(a)); }).join('') + c(refDiff, 'var(--ink-3)');
  }
  function focusFactorHtml(res, s, ctx, card) {
    var m = s.metric, items = factorItems(res, m), ser = {}; res.series.forEach(function (x) { ser[x.allocationId] = x; });
    var focus = S.allocation(focusId(s, ctx)) || ctx.members[0], others = ctx.members.filter(function (a) { return a.id !== focus.id; }), fx = ser[focus.id];
    if (!fx || !fx.values) return '<div class="chart-empty">' + esc((fx && fx.reason) || 'Unavailable for the focus allocation.') + '</div>';
    var get = function (id, it) { var x = ser[id]; return x && x.values ? it.get(x.values) : null; };
    var rows = items.map(function (it) { var fv = it.get(fx.values); return { it: it, fv: fv, diffs: others.map(function (a) { var v = get(a.id, it); return v == null ? null : v - fv; }), ref: fx.reference ? it.get(fx.reference) - fv : null }; });
    var max = 0; rows.forEach(function (r) { r.diffs.concat([r.ref]).forEach(function (v) { if (v != null) max = Math.max(max, Math.abs(v)); }); });
    var fac = rows.filter(function (r) { return !r.it.fixed; }).sort(function (a, b) { var sz = function (r) { return Math.max.apply(null, [Math.abs(r.fv || 0)].concat(r.diffs.concat([r.ref]).map(function (v) { return Math.abs(v || 0); }))); }; return sz(b) - sz(a); });
    var all = !!(C.state[card.id] && C.state[card.id].allFactors), list = (all ? fac : fac.slice(0, 8)).concat(rows.filter(function (r) { return r.it.fixed; }));
    var body = list.map(function (r) { return '<tr class="frow' + (r.it.fixed ? ' is-fixed' : '') + '"><th class="rowhead" scope="row"><span class="rlabel" data-tip="' + esc(r.it.tip || '') + '">' + esc(r.it.label) + '</span></th>' + focusCells(focus, others, r.fv, r.diffs, r.ref, max, 2) + '</tr>'; }).join('');
    if (m !== 'factor') { var ft = factorTotal(m, fx.values); body += '<tr class="total"><th class="rowhead" scope="row">' + (m === 'factorReturn' ? (ctx.basis === 'historical' ? 'Realised return' : 'Expected return') : 'Volatility') + '</th><td class="num lead">' + F.num(ft, 2) + '</td>' + others.map(function (a) { var x = ser[a.id]; return '<td class="num">' + (x && x.values ? F.signed(factorTotal(m, x.values) - ft, 2) : '—') + '</td>'; }).join('') + '<td class="num">' + (fx.reference ? F.signed(factorTotal(m, fx.reference) - ft, 2) : '—') + '</td></tr>'; }
    var more = fac.length > 8 ? '<button type="button" class="btn btn-link dd-more" data-dd-allf>' + (all ? 'Show the largest 8 factors' : 'Show all ' + fac.length + ' factors') + '</button>' : '';
    return '<div class="tblwrap dd-wrap" tabindex="0" aria-label="Focus table, scrolls"><table class="tbl dd dd-f dd-focus-tbl"><caption class="sr-only">' + esc(METRICS[m] + ': ' + focus.name + ' and the differences of every other allocation from it') + '</caption><thead>' + focusHead(ctx, focus, fx.referenceLabel, (m === 'factor' ? 'Factor' : 'Source') + ' · ' + esc(D.factorModelById[res.factorModel].name)) + '</thead><tbody>' + body + '</tbody></table></div>' + more;
  }
  function focusProductHtml(res, s, ctx, card) {
    var abs = res.abs, del = res.del, focus = S.allocation(focusId(s, ctx)) || ctx.members[0], others = ctx.members.filter(function (a) { return a.id !== focus.id; }), p = S.ws.prefs, sel = p.selectedRow;
    var get = function (r, id, key) { var c = r.cells[id] && r.cells[id][key]; if (!c) return null; var x = c.scenario || c.base; return x ? x.value : null; };
    var list = visibleRows(abs), dp = abs.unit === 'β' ? 2 : 1, rows = list.map(function (x) { var k = x.row.key, fv = get(abs, focus.id, k), dv = get(del, focus.id, k); return { x: x, fv: fv, diffs: others.map(function (a) { var v = get(abs, a.id, k); return v == null || fv == null ? null : v - fv; }), ref: dv == null ? null : -dv }; });
    var max = 0; rows.forEach(function (r) { if (r.x.row.kind === 'total') return; r.diffs.concat([r.ref]).forEach(function (v) { if (v != null) max = Math.max(max, Math.abs(v)); }); });
    var anyOpen = p.expanded.length > 0, refLabel = (del.columns.filter(function (c) { return c.allocationId === focus.id; })[0] || {}).referenceLabel;
    var first = '<span class="rowcell"><button type="button" class="tw" data-dd-all aria-expanded="' + anyOpen + '" aria-label="' + (anyOpen ? 'Collapse every category' : 'Expand every category') + '">' + I.chevron + '</button><span>Category / product</span></span>';
    var body = rows.map(function (q) { var r = q.x.row, expandable = r.kind === 'category' && r.hasChildren, isEx = p.expanded.indexOf(r.key) >= 0 || !!S.session.rowFilter.trim();
      var cls = 'depth-' + r.depth + (r.kind === 'category' ? ' cat' : '') + (r.kind === 'total' ? ' total' : '') + (r.kind === 'residual' ? ' residual' : '') + (r.kind === 'index' ? ' index-row' : '') + (sel === r.key ? ' is-selected' : '');
      var rh = '<th class="rowhead" scope="row"><span class="rowcell"><button type="button" class="tw' + (expandable ? '' : ' is-leaf') + '" data-expand="' + esc(r.key) + '" aria-expanded="' + isEx + '" aria-label="' + (isEx ? 'Collapse ' : 'Expand ') + esc(r.label) + '"' + (expandable ? '' : ' tabindex="-1" aria-hidden="true"') + '>' + I.chevron + '</button><button type="button" class="rowbtn" data-row="' + esc(r.key) + '" aria-pressed="' + (sel === r.key) + '"><span class="rlabel">' + esc(r.label) + '</span></button></span></th>';
      return '<tr class="' + cls + '" data-rowkey="' + esc(r.key) + '">' + rh + focusCells(focus, others, q.fv, q.diffs, q.ref, max, dp) + '</tr>'; }).join('');
    return '<div class="tblwrap dd-wrap" tabindex="0" aria-label="Focus table, scrolls"><table class="tbl dd dd-focus-tbl"><caption class="sr-only">' + esc(METRICS[s.metric] + ': ' + focus.name + ' and the differences of every other allocation from it') + '</caption><thead>' + focusHead(ctx, focus, refLabel, first) + '</thead><tbody>' + body + '</tbody></table></div>';
  }
  function notes(res, s, ctx, card) {
    var out = [ctx.basis !== 'historical' ? 'Forward-looking: ' + esc(D.assumptions.model) + ' as of ' + esc(F.date(D.assumptions.asOf)) + (isF(s.metric) ? '; exposures from the ' + esc(C.modelOf(card).long) + '.' : '.') : 'Historical' + (res.period ? ', ' + esc(res.period.label) : '') + '. Backtests use current weights, rebalanced quarterly. Proxies and exclusions are marked per column and row.',
      '— means unavailable, with a reason on hover or focus. 0 is an observed or calculated zero.'];
    if (s.metric === 'risk') out.push('Risk contributions sum to the portfolio total; a category’s risk is its products’ contributions, not stand-alone volatility.');
    if (s.metric === 'factorReturn') out.push('Factor contributions are exposure × the factor premia implied by ' + (ctx.basis === 'historical' ? 'the period’s asset-class index returns' : 'the platform’s asset-class assumptions') + '; cash and specific make up the rest of the return.');
    if (s.metric === 'factorRisk') out.push('Factor and specific contributions add up to the volatility' + (ctx.basis === 'historical' ? ', realised over the period and split using the factor model.' : ' under the factor model.'));
    if (s.view === 'focus') out.push('Focus view: the first column is the focus allocation; every other column is its difference from the focus, and the last is the focus’s reference minus the focus.');
    if (isF(s.metric) && s.view !== 'focus') out.push('Rows are sorted by size; the largest eight factors show first.');
    if (s.metric === 'factor') out.push('Factor units are not comparable across factors; compare one factor across allocations.');
    if (s.values === 'delta') out.push('Differences are percentage points, not relative changes.');
    if (!isF(s.metric) && (res.rows || (res.abs && res.abs.rows) || []).some(function (r) { return r.kind === 'index'; })) out.push('Index rows are the unimplemented part of a category, modelled by its index basket.');
    return (false ? '<div class="card-foot"><span class="tag tag-info">Mapped</span><span>' + esc(s.mapped) + '.</span></div>' : '') + C.notes(card, out);
  }

  C.register({ id: 'drivers-differences', title: 'Drivers & differences', description: 'The integrated table: weight, return and risk contributions and factor exposures by category and product, as contributions or differences versus a reference.', group: 'Summary', size: { w: 12, h: 9 }, min: { w: 6, h: 5 }, basis: 'either', livePrefs: true,
    basisOf: function (card) { var s = card.settings || {}; return (s.metric || 'return') === 'weight' ? null : s.basis === 'historical' ? 'historical' : 'forward'; },
    factorModel: function (s, card) { return isF(settingsOf(card).metric); },
    settings: [],
    subtitle: function (ctx, s, card) { var sc = ctx.scenario, set = settingsOf(card); return METRICS[set.metric] + ' · ' + T.unitLabel(ctx.basis, set) + (isF(set.metric) ? C.modelDeparture(card) : '') + (set.view === 'focus' ? ' · focus ' + ((S.allocation(focusId(set, ctx)) || {}).name || '') : '') + (sc && ctx.basis !== 'historical' ? ' · scenario ' + sc.name : ''); },
    data: function (ctx, s, card) {
      var set = settingsOf(card), w = ctx.ws; card._flash = true;
      if (isF(set.metric)) return C.fetch('factorTable', { revision: ctx.revision, allocations: U.clone(ctx.members), basis: ctx.basis || 'forward', factorModel: C.modelIdOf(card), reference: U.clone(w.comparison), period: U.clone(ctx.prefs.period), scenario: U.clone(ctx.scenario) });
      var req = function (values) { return { revision: ctx.revision, allocations: U.clone(ctx.members), basis: ctx.basis || 'forward', metric: set.metric, values: values, riskUnits: set.riskUnits, factors: set.factors.slice(), factorModel: C.modelIdOf(card), reference: U.clone(w.comparison), period: U.clone(ctx.prefs.period), scenario: U.clone(ctx.scenario) }; };
      if (set.view === 'focus') return Promise.all([C.fetch('analyzeTable', req('absolute')), C.fetch('analyzeTable', req('delta'))]).then(function (r) { return { abs: r[0], del: r[1], focus: true, warnings: r[0].warnings, period: r[0].period }; });
      return C.fetch('analyzeTable', req(set.values));
    },
    render: function (body, data, ctx, s, card) {
      var set = settingsOf(card);
      body.innerHTML = toolbar(set, ctx, card) + (data.warnings && data.warnings.length ? UI.alert('warning', esc(data.warnings.join(' '))) : '') + (ctx.members.length ? (isF(set.metric) ? (set.view === 'focus' ? focusFactorHtml(data, set, ctx, card) : factorTableHtml(data, set, ctx, card)) : data.focus ? focusProductHtml(data, set, ctx, card) : tableHtml(data, set, ctx, card)) : '<div class="empty">' + I.layers + '<h3>No allocations in the comparison</h3><p>Add up to six live allocations or fixed snapshots.</p></div>') + notes(data, set, ctx, card);
      wire(body, card);
    }
  });
  function settingsOf(card) { var s = card.settings || {}, pick = C.factorsFor(s.factors, C.modelIdOf(card)); return { basis: s.basis === 'historical' ? 'historical' : 'forward', metric: s.metric || 'return', values: s.values || 'absolute', riskUnits: s.riskUnits || 'share', factors: pick.ids, mapped: pick.mapped, scenarioView: s.scenarioView || 'delta', view: s.view === 'focus' ? 'focus' : 'table', focus: s.focus || null }; }
  function patch(card, p) { var s = U.clone(card.settings || {}); for (var k in p) s[k] = p[k]; S.updateCard(card.id, { settings: s }); }
  function wire(body, card) {
    U.on(body, 'click', '[data-dd]', function (e, b) { var p = {}; p[b.dataset.dd] = b.dataset.val; S.session.sort = null; patch(card, p); var nb = document.querySelector('[data-card="' + CSS.escape(card.id) + '"] [data-dd="' + b.dataset.dd + '"][data-val="' + CSS.escape(b.dataset.val) + '"]'); if (nb) nb.focus(); });
    U.on(body, 'click', '[data-dd-allf]', function () { var st = C.state[card.id] = C.state[card.id] || {}; st.allFactors = !st.allFactors; C.repaint(card.id); var nb = document.querySelector('[data-card="' + CSS.escape(card.id) + '"] [data-dd-allf]'); if (nb) nb.focus(); });
    U.on(body, 'change', '[data-dd-sel]', function (e, sel) { var p = {}; p[sel.dataset.ddSel] = sel.value; patch(card, p); });
    U.on(body, 'change', '[data-dd-metric]', function (e, sel) { var v = sel.value.split(':'), p = { metric: v[0] }; if (v[1]) p.basis = v[1]; patch(card, p); });
    U.on(body, 'click', '[data-dd-factor]', function (e, b) { var f = settingsOf(card).factors.slice(), i = f.indexOf(b.dataset.ddFactor); if (i >= 0) { if (f.length === 1) { UI.toast('Keep at least one factor selected.'); return; } f.splice(i, 1); } else f.push(b.dataset.ddFactor); var m = C.modelOf(card); C.setFactors(card, 'factors', m.id, m.factors.map(function (x) { return x.id; }).filter(function (x) { return f.indexOf(x) >= 0; })); });
    var rs = body.querySelector('[data-dd-search]'); if (rs) rs.oninput = U.debounce(function () { S.session.rowFilter = rs.value; C.repaint(card.id); var r2 = body.querySelector('[data-dd-search]'); if (r2) { r2.focus(); r2.setSelectionRange(r2.value.length, r2.value.length); } }, 120);
    U.on(body, 'click', '[data-dd-all]', function () { S.setPref('expanded', S.ws.prefs.expanded.length ? [] : D.categories.map(function (c) { return c.id; })); var nb = body.querySelector('[data-dd-all]'); if (nb) nb.focus(); });
    U.on(body, 'click', '[data-dd-searchbtn]', function () { (C.state[card.id] = C.state[card.id] || {}).searchOpen = true; C.repaint(card.id); var r = document.querySelector('[data-card="' + CSS.escape(card.id) + '"] [data-dd-search]'); if (r) r.focus(); });
    U.on(body, 'click', '[data-expand]', function (e, b) { var key = b.dataset.expand, ex = S.ws.prefs.expanded.slice(), i = ex.indexOf(key); if (i >= 0) ex.splice(i, 1); else ex.push(key); S.setPref('expanded', ex); var nb = body.querySelector('[data-expand="' + CSS.escape(key) + '"]'); if (nb) nb.focus(); });
    U.on(body, 'click', '[data-row]', function (e, b) { S.setPref('selectedRow', b.dataset.row); U.announce(C.rowLabel(b.dataset.row) + ' selected; cards that follow the row update.'); });
    U.on(body, 'click', '[data-sort]', function (e, b) { var key = b.dataset.sort, parts = key.split('|'), cur = S.session.sort, signed = settingsOf(card).values === 'delta', dir = 'desc'; if (cur && cur.key === key) dir = cur.dir === 'desc' ? 'asc' : (cur.dir === 'asc' && signed ? 'abs' : null); S.session.sort = dir ? { key: key, allocationId: parts[0], spec: { set: parts[1] }, factorId: parts[2] || null, dir: dir } : null; C.repaint(card.id); var nb = body.querySelector('[data-sort="' + CSS.escape(key) + '"]'); if (nb) nb.focus(); });
  }
})();

/* ─────────────────────────────────────────────────────────────────────────
   Portfolio Analytics · the Drivers & Differences card
   The integrated table: one column group per allocation, rows aligned on
   the common category grouping, with the row selection other cards follow.
   ───────────────────────────────────────────────────────────────────────── */
(function () {
  'use strict';
  var PA = window.PA, U = PA.util, esc = U.esc, S = PA.store, UI = PA.ui, D = PA.data, I = U.icon, F = U.fmt, C = PA.cards;
  var T = UI.table = {};
  var METRICS = { weight: 'Allocation weight', return: 'Return contribution', risk: 'Risk contribution', factor: 'Factor exposure' };
  T.metricLabel = function (m) { return METRICS[m] || m; };
  T.unitLabel = function (basis, s) {
    var d = s.values === 'delta';
    if (s.metric === 'weight') return d ? 'pp difference vs reference' : '% of total portfolio';
    if (s.metric === 'return') return (d ? 'pp difference vs reference' : 'pp of portfolio return') + (basis === 'historical' ? ', annualised' : ', annual expected');
    if (s.metric === 'risk') return s.riskUnits === 'share' ? (d ? 'pp difference in share of total risk' : '% share of total risk') : (d ? 'pp difference in volatility contribution' : 'pp of portfolio volatility, annual');
    return (d ? 'β difference vs reference' : 'β, stand-alone exposure') + (basis === 'historical' ? ', estimated over the period' : ', model exposure');
  };
  var prevCells = {};

  function toolbar(s, ctx, card) {
    var sc = ctx.scenario, seg = function (name, opts, cur) { return '<div class="seg" role="group" aria-label="' + esc(name) + '">' + opts.map(function (o) { return '<button type="button" data-dd="' + name.toLowerCase() + '" data-val="' + o[0] + '" aria-pressed="' + (cur === o[0]) + '">' + esc(o[1]) + '</button>'; }).join('') + '</div>'; };
    var cur = s.metric === 'weight' ? 'weight' : s.metric + ':' + s.basis, opt = function (v, label) { return '<option value="' + v + '"' + (cur === v ? ' selected' : '') + '>' + label + '</option>'; };
    var html = '<div class="dd-tools"><div class="ctl"><label class="label" for="dd-metric-' + card.id + '">Metric</label><select id="dd-metric-' + card.id + '" class="input-sm" data-dd-metric>' + opt('weight', METRICS.weight) +
      ['forward', 'historical'].map(function (b) { return '<optgroup label="' + (b === 'forward' ? 'Forward-looking' : 'Historical') + '">' + ['return', 'risk', 'factor'].map(function (k) { return opt(k + ':' + b, METRICS[k]); }).join('') + '</optgroup>'; }).join('') + '</select></div>' +
      '<div class="ctl">' + seg('Values', [['absolute', s.metric === 'factor' ? 'Exposures' : 'Contributions'], ['delta', 'Differences']], s.values) + '</div>';
    if (s.metric === 'risk') html += '<div class="ctl"><label class="label" for="dd-risk-' + card.id + '">Risk units</label><select id="dd-risk-' + card.id + '" class="input-sm" data-dd-sel="riskUnits"><option value="share"' + (s.riskUnits === 'share' ? ' selected' : '') + '>Share of total risk (%)</option><option value="vol"' + (s.riskUnits === 'vol' ? ' selected' : '') + '>Contribution to volatility (pp)</option></select></div>';
    if (s.metric === 'factor') html += '<div class="ctl factor-pick" role="group" aria-label="Shared factors"><span class="label">Factors · ' + esc(C.modelOf(card).name) + '</span>' + C.modelOf(card).factors.map(function (f) { return '<button type="button" class="fchip" data-dd-factor="' + f.id + '" aria-pressed="' + (s.factors.indexOf(f.id) >= 0) + '" data-tip="' + esc(f.description) + '">' + esc(f.name) + '</button>'; }).join('') + '</div>';
    if (sc && ctx.basis !== 'historical') html += '<div class="ctl"><label class="label" for="dd-scn-' + card.id + '">Scenario columns</label><select id="dd-scn-' + card.id + '" class="input-sm" data-dd-sel="scenarioView"><option value="delta"' + (s.scenarioView === 'delta' ? ' selected' : '') + '>Scenario + Δ vs Base</option><option value="pair"' + (s.scenarioView === 'pair' ? ' selected' : '') + '>Base | Scenario</option></select></div>';
    var open = !!S.session.rowFilter || !!(C.state[card.id] && C.state[card.id].searchOpen);
    html += '<span class="spacer"></span>' + (open ? '<div class="search-wrap row-search">' + I.search + '<input type="search" class="input-sm" data-dd-search placeholder="Find a row…" aria-label="Find a row" value="' + esc(S.session.rowFilter) + '"></div>' : '<button type="button" class="btn btn-icon btn-ghost btn-sm" data-dd-searchbtn aria-label="Find a row" data-tip="Find a row">' + I.search + '</button>') + '</div>';
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
  function notes(res, s, ctx, card) {
    var out = [ctx.basis !== 'historical' ? 'Forward-looking: ' + esc(D.assumptions.model) + ' as of ' + esc(F.date(D.assumptions.asOf)) + (s.metric === 'factor' ? '; exposures from the ' + esc(C.modelOf(card).long) + '.' : '.') : 'Historical' + (res.period ? ', ' + esc(res.period.label) : '') + '. Backtests use current weights, rebalanced quarterly. Proxies and exclusions are marked per column and row.',
      '— means unavailable, with a reason on hover or focus. 0 is an observed or calculated zero.'];
    if (s.metric === 'risk') out.push('Risk contributions sum to the portfolio total; a category’s risk is its products’ contributions, not stand-alone volatility.');
    if (s.metric === 'factor') out.push('Category exposures are stand-alone; the portfolio total is weight-adjusted. Factor units are not comparable across factors.');
    if (s.values === 'delta') out.push('Differences are percentage points, not relative changes.');
    if (res.rows.some(function (r) { return r.kind === 'index'; })) out.push('Index rows are the unimplemented part of a category, modelled by its index basket.');
    return (s.metric === 'factor' && s.mapped ? '<div class="card-foot"><span class="tag tag-info">Mapped</span><span>' + esc(s.mapped) + '.</span></div>' : '') + C.notes(card, out);
  }

  C.register({ id: 'drivers-differences', title: 'Drivers & differences', description: 'The integrated table: weight, return and risk contributions and factor exposures by category and product, as contributions or differences versus a reference.', group: 'Summary', size: { w: 12, h: 9 }, min: { w: 6, h: 5 }, basis: 'either', livePrefs: true,
    basisOf: function (card) { var s = card.settings || {}; return (s.metric || 'return') === 'weight' ? null : s.basis === 'historical' ? 'historical' : 'forward'; },
    factorModel: function (s, card) { return settingsOf(card).metric === 'factor'; },
    settings: [],
    subtitle: function (ctx, s, card) { var sc = ctx.scenario, set = settingsOf(card); return METRICS[set.metric] + ' · ' + T.unitLabel(ctx.basis, set) + (set.metric === 'factor' ? C.modelDeparture(card) : '') + (sc && ctx.basis !== 'historical' ? ' · scenario ' + sc.name : ''); },
    data: function (ctx, s, card) { var set = settingsOf(card), w = ctx.ws; card._flash = true; return C.fetch('analyzeTable', { revision: ctx.revision, allocations: U.clone(ctx.members), basis: ctx.basis || 'forward', metric: set.metric, values: set.values, riskUnits: set.riskUnits, factors: set.factors.slice(), factorModel: C.modelIdOf(card), reference: U.clone(w.comparison), period: U.clone(ctx.prefs.period), scenario: U.clone(ctx.scenario) }); },
    render: function (body, data, ctx, s, card) {
      var set = settingsOf(card);
      body.innerHTML = toolbar(set, ctx, card) + (data.warnings && data.warnings.length ? UI.alert('warning', esc(data.warnings.join(' '))) : '') + (ctx.members.length ? tableHtml(data, set, ctx, card) : '<div class="empty">' + I.layers + '<h3>No allocations in the comparison</h3><p>Add up to six live allocations or fixed snapshots.</p></div>') + notes(data, set, ctx, card);
      wire(body, card);
    }
  });
  function settingsOf(card) { var s = card.settings || {}, pick = C.factorsFor(s.factors, C.modelIdOf(card)); return { basis: s.basis === 'historical' ? 'historical' : 'forward', metric: s.metric || 'return', values: s.values || 'absolute', riskUnits: s.riskUnits || 'share', factors: pick.ids, mapped: pick.mapped, scenarioView: s.scenarioView || 'delta' }; }
  function patch(card, p) { var s = U.clone(card.settings || {}); for (var k in p) s[k] = p[k]; S.updateCard(card.id, { settings: s }); }
  function wire(body, card) {
    U.on(body, 'click', '[data-dd]', function (e, b) { var p = {}; p[b.dataset.dd] = b.dataset.val; patch(card, p); });
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

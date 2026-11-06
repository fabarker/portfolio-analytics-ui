/* ─────────────────────────────────────────────────────────────────────────
   Portfolio Analytics · the Decision chain card
   An allocation's return and risk decomposed along its decision chain:
   policy benchmark → SAA → product benchmarks → portfolio, one step at a
   time, in asset space (Brinson by category or asset class, or by product)
   and in factor space (active exposure × factor return, cash and
   specific), on both bases, with a ledger in which every part adds up.
   Views: Bridge (waterfalls from the policy to the portfolio, in return and
   in risk), Levels (the headline measures of each level), Steps (one step
   by the chosen grouping), Lens (the same step in both spaces, or as a
   group × factor matrix), Reconcile (the ties) and Over time (linked
   contributions by period). One allocation at a time, by the tabs above.
   ───────────────────────────────────────────────────────────────────────── */
(function () {
  'use strict';
  var PA = window.PA, U = PA.util, esc = U.esc, S = PA.store, UI = PA.ui, D = PA.data, F = U.fmt, V = UI.viz, C = PA.cards, H = C.h, I = U.icon, CH = PA.chain;
  var VIEWS = [['bridge', 'Bridge'], ['levels', 'Levels'], ['steps', 'Steps'], ['lens', 'Lens'], ['reconcile', 'Reconcile'], ['time', 'Over time']];
  var STEP_INK = { saa: '#2f4f86', mapping: '#5b4a9e', weight: '#5b4a9e', benchmarkFirst: '#5b4a9e', benchmark: '#8a79c6', weightSecond: '#8a79c6', selection: '#3d6f73', pair: '#2f4f86', policyToPortfolio: '#4f74b3' };
  var inkOf = function (id) { return STEP_INK[id] || '#4f74b3'; };
  var CROSS_INK = '#AFBAC7', Z = 2.3263, ESK = 2.6652;
  var BASES = { forward: '→ Forward-looking', historical: '◷ Historical' }, BSHORT = { forward: '→ Fwd', historical: '◷ Hist' };
  var LENSES = [['asset', 'Asset & allocation'], ['factor', 'Factor'], ['both', 'Both'], ['matrix', 'Matrix']];
  var BY = [['category', 'Category'], ['assetClass', 'Asset class'], ['product', 'Product'], ['factor', 'Factor']];
  var SOURCE = { stated: 'stated benchmark', categoryIndex: 'category index', override: 'override', index: 'an index itself', fitted: 'fitted index', none: 'no benchmark' };

  var conv = function () { return CH.conventionsOf(S.ws); };
  var wsOpt = function (key) { var c = conv(); return ['workspace', 'Workspace default (' + CH.LABELS[key][c[key]] + ')']; };
  function methodOf(s) { var c = conv(), w = function (v, k) { return !v || v === 'workspace' ? c[k] : v; }; var m = { model: w(s.model, 'attributionModel'), interaction: w(s.interaction, 'interaction'), returns: s.returnMethod, linking: w(s.linking, 'linking'), currency: w(s.currency, 'currency'), unallocated: w(s.unallocated, 'unallocated') }; if (m.currency === 'separate') m.currency = 'none'; return m; }
  function departures(s) { var c = conv(), out = []; [['model', 'attributionModel'], ['interaction', 'interaction'], ['linking', 'linking'], ['currency', 'currency'], ['unallocated', 'unallocated']].forEach(function (p) { var v = s[p[0]]; if (v && v !== 'workspace' && v !== c[p[1]]) out.push(CH.LABELS[p[1]][v]); }); return out; }
  function viewOf(card) { var v = card.settings && card.settings.view; return VIEWS.some(function (x) { return x[0] === v; }) ? v : 'bridge'; }
  function seriesOf(data, a) { return a ? data.series.filter(function (x) { return x.allocationId === a.id; })[0] : null; }
  function basesOf(s) { return s.basis === 'forward' ? ['forward'] : s.basis === 'historical' ? ['historical'] : ['forward', 'historical']; }
  function oneBasis(card, s) { if (s.basis !== 'both') return s.basis; var b = (C.state[card.id] || {}).basis; return b === 'historical' ? 'historical' : 'forward'; }
  /* coloured only when the value does not round to zero */
  var sgn = function (v, dp) { if (v == null || !isFinite(v)) return '<span class="faint">—</span>'; var d = dp == null ? 2 : dp, thr = 0.5 * Math.pow(10, -d); return '<span class="' + (v >= thr ? 'pos' : v <= -thr ? 'neg' : '') + '">' + F.signed(v, d) + '</span>'; };
  var num = function (v, dp) { return v == null || !isFinite(v) ? '<span class="faint">—</span>' : F.num(v, dp == null ? 2 : dp); };
  function dbar(v, max, color) { var w = max > 0 ? Math.min(Math.abs(v) / max, 1) * 50 : 0; return '<span class="act-track" aria-hidden="true"><span class="act-zero"></span><i style="left:' + (v >= 0 ? 50 : 50 - w) + '%;width:' + w + '%;background:' + (color || 'var(--cat-1)') + '"></i></span>'; }
  var empty = function (html) { return '<div class="chart-empty">' + html + '</div>'; };
  function groupLabel(key, by) {
    if (key === '__residual') return 'Unallocated'; if (key === '__drift') return 'Rebalancing and drift';
    if (by === 'assetClass') { var ac = D.assetClassById[key]; return ac ? ac.name : key; }
    if (key.indexOf('|') > 0) { var p = key.split('|'), ins = D.instrumentById[p[0]]; return ins ? ins.name : key; }
    var c = D.categoryById[key]; return c ? c.short : key;
  }
  function groupColor(key, by) { if (by === 'assetClass') { var ac = D.assetClassById[key], c0 = ac && D.categoryById[ac.category]; return c0 ? c0.color : '#c3cedb'; } var c = D.categoryById[key.indexOf('|') > 0 ? key.split('|')[1] : key]; return c ? c.color : '#c3cedb'; }
  /** The step a view shows: a decision, or the whole chain in one. */
  function pickStep(x, b, s) {
    var y = x[b]; if (!y || y.reason || !y.steps) return null;
    if (s.step === 'policyToPortfolio') { var w = x.whole && x.whole[b]; return w ? { step: w.step, risk: w.risk, te: w.te, whole: true } : null; }
    var i = 0; y.steps.forEach(function (st, k) { if (st.meta.id === s.step || (s.step === 'mapping' && /^(weight|benchmarkFirst)$/.test(st.meta.id) && !i)) i = k; });
    if (s.step === 'mapping' && !y.steps.some(function (st) { return st.meta.id === 'mapping'; })) { var j = -1; y.steps.forEach(function (st, k) { if (j < 0 && /^(weight|benchmarkFirst)$/.test(st.meta.id)) j = k; }); if (j >= 0) i = j; }
    return { step: y.steps[i], risk: y.risk ? y.risk.steps[i] : null, index: i };
  }
  function linkingOf(x, s) { var h = x && x.historical; var m = methodOf(s); return m.returns === 'geometric' ? 'geometric' : h && h.linking ? h.linking : m.linking; }

  /* ── controls inside the card ────────────────────────────────────── */
  function seg(attr, list, cur, label) { return '<div class="act-by ch-seg" role="group" aria-label="' + esc(label) + '"><span>' + esc(label) + '</span>' + list.map(function (o) { return '<button type="button" data-' + attr + '="' + o[0] + '" aria-pressed="' + (o[0] === cur) + '">' + esc(o[1]) + '</button>'; }).join('') + '</div>'; }
  function stepChips(x, s, b) {
    var y = x[b] || x.forward || x.historical, list = (y && y.steps ? y.steps : []).map(function (st) { return [st.meta.id, st.meta.code + ' · ' + st.meta.short]; }).concat([['policyToPortfolio', 'Policy → Portfolio']]);
    var cur = pickStep(x, b, s), on = s.step === 'policyToPortfolio' ? 'policyToPortfolio' : cur ? cur.step.meta.id : null;
    return seg('ch-step', list, on, 'Step');
  }
  function basisChips(card, s) { if (s.basis !== 'both') return ''; var b = oneBasis(card, s); return seg('ch-basis', [['forward', BSHORT.forward], ['historical', BSHORT.historical]], b, 'Basis'); }

  /* ── Bridge ──────────────────────────────────────────────────────── */
  function riskUnitsLabel(u) { return u === 'share' ? 'share of tracking error, %' : u === 'var99' ? '99% value at risk, 1 year, %' : u === 'es99' ? '99% expected shortfall, 1 year, %' : 'tracking error, % a year'; }
  /** The risk bars of the bridge: contributions, or stand-alone steps closed by the cross term, in the chosen units. */
  function riskBars(y, s) {
    var r = y.risk, u = s.riskUnits, mode = s.stepRisk, vr = r.var || {}, meth = vr.method, comp = function (i, kind) { var v = vr.steps && vr.steps[i]; return v ? v[kind][u === 'var99' ? 'var99' : 'es99'] : null; };
    var k = u === 'var99' ? Z : u === 'es99' ? ESK : 1, scale = function (te) { return u === 'share' ? (r.total > 0 ? te / r.total * 100 : 0) : te * k; };
    var tail = (u === 'var99' || u === 'es99') && (!meth || meth === 'parametric' || vr.fallback);
    var steps = r.steps.map(function (st, i) {
      var sm = y.steps[i].meta, v;
      if (mode === 'standalone') v = (u === 'var99' || u === 'es99') && !tail ? comp(i, 'standalone') : scale(st.standalone);
      else v = (u === 'var99' || u === 'es99') && !tail ? comp(i, 'component') : scale(st.contribution);
      return { label: sm.code + ' ' + sm.short, value: v, color: inkOf(sm.id), tip: sm.code + ' ' + sm.label + ': stand-alone ' + F.num(st.standalone, 2) + ', contribution ' + F.signed(st.contribution, 2) + ' (tracking error, % a year)' };
    });
    var totalV = (u === 'var99' || u === 'es99') ? (vr.total ? vr.total[u === 'var99' ? 'var99' : 'es99'] : null) : scale(r.total);
    if (mode === 'standalone') { var sum = U.sum(steps, function (x) { return x.value || 0; }); steps.push({ label: 'Cross term', value: (tail ? totalV + r.muTotal : totalV) - sum, color: CROSS_INK, tip: 'Closes the gap between the stand-alone steps and the whole: positive when steps reinforce each other, negative when they offset' }); }
    if (tail) steps.push({ label: 'Less expected active return', value: -r.muTotal, color: CROSS_INK, tip: 'The chain’s expected active return, subtracted once' });
    return { steps: steps, total: { label: u === 'share' ? 'Tracking error' : u === 'var99' ? '99% VaR' : u === 'es99' ? '99% ES' : 'Tracking error to policy', value: totalV } };
  }
  function riskTable(y, s) {
    var r = y.risk; if (!r || s.stepRisk !== 'both') return '';
    var max = Math.max.apply(null, r.steps.map(function (st) { return Math.abs(st.contribution); }).concat([0.01]));
    return '<table class="tbl act-src ch-risk-tbl"><thead><tr><th>Step</th><th class="num" data-tip="Tracking error of the step on its own">Stand-alone</th><th class="num" data-tip="Euler contribution to the tracking error of the whole chain">Contribution</th><th class="bar-col"></th><th class="num">Difference</th></tr></thead><tbody>' +
      r.steps.map(function (st, i) { var sm = y.steps[i].meta; return '<tr><td><span class="sw" style="background:' + inkOf(sm.id) + '"></span>' + esc(sm.code + ' ' + sm.short) + '</td><td class="num">' + num(st.standalone) + '</td><td class="num">' + sgn(st.contribution) + '</td><td class="bar-col">' + dbar(st.contribution, max, inkOf(sm.id)) + '</td><td class="num">' + sgn(st.contribution - st.standalone) + '</td></tr>'; }).join('') +
      '<tr><td data-tip="TE² of the whole less the sum of the steps’ TE²: twice the covariances between steps">Cross term (TE², %²)</td><td class="num"></td><td class="num">' + sgn(r.cross, 2) + '</td><td></td><td></td></tr>' +
      '<tr class="total"><td>Policy → Portfolio</td><td class="num"></td><td class="num">' + num(r.total) + '</td><td></td><td></td></tr></tbody></table>';
  }
  function bridgeHtml(x, s, bases) {
    var geo = s.returnMethod === 'geometric';
    return '<div class="ch-bridge' + (bases.length > 1 ? ' is-two' : '') + '">' + bases.map(function (b) {
      var y = x[b], head = '<div class="ch-col-head">' + esc(BASES[b]) + (b === 'historical' && y && !y.reason ? ' · ' + esc(y.months ? y.months[0].slice(0, 4) + '–' + y.months[y.months.length - 1].slice(0, 4) : '') + ' · ' + esc(CH.LABELS.linking[linkingOf(x, s)] + (linkingOf(x, s) === 'none' ? '' : ' linking')) : (b === 'forward' && x.scenarioApplied ? ' · scenario' : '')) + '</div>';
      if (!y) return '<div class="ch-col">' + head + empty('Not calculated for this basis.') + '</div>';
      if (y.reason) return '<div class="ch-col">' + head + empty(esc(y.reason)) + '</div>';
      var lv = y.levelReturns, last = lv.length - 1, hl = y.headline;
      var eq = geo ? 'Policy ' + F.num(lv[0], 2) + ' compounded by ' + y.steps.map(function (st) { return st.meta.code + ' ' + F.signed(st.total, 2); }).join(', ') + ' = Portfolio ' + F.num(lv[last], 2) : 'Policy ' + F.num(lv[0], 2) + y.steps.map(function (st) { return ' + ' + st.meta.code + ' ' + F.signed(st.total, 2); }).join('') + ' = Portfolio ' + F.num(lv[last], 2);
      var risk = y.risk ? 'Risk: policy ' + F.num(hl[0].risk, 1) + '% → portfolio ' + F.num(hl[last].risk, 1) + '% · tracking error to policy <b>' + F.num(y.risk.total, 2) + '%</b>' + (y.risk.basis === 'expost' ? ' realised over ' + y.risk.months + ' months' : ' ex-ante') : '';
      return '<div class="ch-col">' + head + '<div class="act-sub">Return, % a year' + (geo ? ' · geometric, compounding' : '') + '</div><div class="viz-host" data-ch-wf="ret:' + b + '"></div><div class="act-eq">' + eq + '</div>' +
        (y.risk ? '<div class="act-sub" style="margin-top:10px">' + risk + '</div><div class="act-sub">' + esc(s.stepRisk === 'standalone' ? 'Stand-alone steps and the cross term' : 'Each step’s contribution') + ' · ' + esc(riskUnitsLabel(s.riskUnits)) + '</div><div class="viz-host" data-ch-wf="risk:' + b + '"></div>' + riskTable(y, s) : '') + '</div>';
    }).join('') + '</div>';
  }
  function drawBridge(body, x, s, wa, card) {
    U.$$('[data-ch-wf]', body).forEach(function (el) {
      var p = el.dataset.chWf.split(':'), y = x[p[1]], h = Math.max(150, Math.min(240, (body.clientHeight - 260) / 2));
      if (!y || y.reason) return;
      if (p[0] === 'ret') {
        var lv = y.levelReturns, geo = s.returnMethod === 'geometric', run = lv[0];
        var steps = y.steps.map(function (st) { var next = geo ? ((1 + run / 100) * (1 + st.total / 100) - 1) * 100 : run + st.total, inc = next - run; run = next; return { label: st.meta.code + ' ' + st.meta.short, value: inc, color: inkOf(st.meta.id), tip: st.meta.code + ' ' + st.meta.label + ' (' + st.meta.from + ' → ' + st.meta.to + ')' + (geo ? ': geometric ' + F.signed(st.total, 2) + '%' : '') + '. Select to open the step' }; });
        V.waterfall(el, { height: h, start: { label: 'Policy · ' + (x.levels[0].label || 'L0'), value: lv[0], color: 'var(--ink-3)' }, steps: steps, total: { label: 'Portfolio · ' + wa.name, color: UI.colorOf(wa) }, unit: '%', dp: 2, aria: 'Bridge from the policy benchmark’s return to ' + wa.name + '’s, one bar per step' });
        U.$$('rect.bar', el).forEach(function (r, i) { if (i === 0 || i > y.steps.length) return; r.classList.add('is-link'); var go = function () { var c = S.card(card.id), q = U.clone(c.settings || {}); q.view = 'steps'; q.step = y.steps[i - 1].meta.id; if (s.basis === 'both') (C.state[card.id] = C.state[card.id] || {}).basis = p[1]; S.updateCard(c.id, { settings: q }); }; r.addEventListener('click', go); r.addEventListener('keydown', function (e) { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); go(); } }); });
      } else if (y.risk) {
        var rb = riskBars(y, s);
        V.waterfall(el, { height: Math.max(130, h * 0.8), steps: rb.steps, total: { label: rb.total.label, color: 'var(--ink-2)' }, unit: s.riskUnits === 'share' ? '%' : 'pp', dp: 2, aria: 'Risk of the chain by step' });
      }
    });
  }

  /* ── Levels ──────────────────────────────────────────────────────── */
  var MEASURES = [['totalReturn', 'Total return', 2], ['excessReturn', 'Excess return over cash', 2], ['risk', 'Risk (volatility)', 2], ['step', 'Active return of the step', 2], ['trackingError', 'Tracking error to the level before', 2], ['sharpe', 'Sharpe ratio', 2], ['informationRatio', 'Information ratio of the step', 2], ['var99', '99% VaR, 1 year', 1]];
  function levelValue(y, i, key) { var hl = y.headline[i]; if (!hl) return null; if (key === 'step') return i ? y.steps[i - 1].total : null; if (key === 'var99') return hl.var99 ? hl.var99.y1 : null; return hl[key]; }
  function levelsHtml(x, s, card, bases) {
    var st = C.state[card.id] || {}, mode = st.levelsView === 'focus' ? 'focus' : 'table', levels = x.levels.filter(function (l) { return l.holdings; });
    var fid = levels.some(function (l) { return l.id === st.levelFocus; }) ? st.levelFocus : levels[levels.length - 1].id, fi = levels.map(function (l) { return l.id; }).indexOf(fid);
    var polId = x.levels[0].source && x.levels[0].source.id;
    var tools = '<div class="ch-tools">' + seg('ch-lview', [['table', 'Table'], ['focus', 'Focus']], mode, 'View') + (mode === 'focus' ? seg('ch-lfocus', levels.map(function (l) { return [l.id, l.code + ' ' + l.short]; }), fid, 'Focus') : '') +
      seg('ch-lvmode', [['off', 'Off'], ['active', 'Being edited'], ['all', 'Every chain']], S.ws.prefs.showLevels || 'off', 'Levels in comparison') + (polId && D.benchmarkById[polId] ? '<button type="button" class="btn btn-xs" data-ch-policy-member="' + esc(polId) + '">' + I.plus + '<span>Add the policy benchmark as a column</span></button>' : '') + '</div>';
    var head1 = '<tr><th scope="col" rowspan="' + (bases.length > 1 ? 2 : 1) + '">Measure</th>' + levels.map(function (l, i) { return '<th scope="colgroup" colspan="' + bases.length + '" class="grp-start' + (mode === 'focus' && i === fi ? ' is-focus' : '') + '"><span class="ch-code">' + esc(l.code) + '</span> ' + esc(l.short) + '<small class="ch-sub">' + esc(mode === 'focus' && i !== fi ? 'less ' + levels[fi].short : l.label) + '</small></th>'; }).join('') + '</tr>';
    var head2 = bases.length > 1 ? '<tr>' + levels.map(function () { return bases.map(function (b, j) { return '<th scope="col" class="num' + (j === 0 ? ' grp-start' : '') + '">' + BSHORT[b] + '</th>'; }).join(''); }).join('') + '</tr>' : '';
    var idx = function (l) { return x.levels.filter(function (q) { return q.holdings; }).indexOf(l); };
    var body = MEASURES.map(function (m) {
      return '<tr><th scope="row">' + esc(m[1]) + '</th>' + levels.map(function (l, i) { return bases.map(function (b, j) { var y = x[b], cls = 'num' + (j === 0 ? ' grp-start' : ''); if (!y || y.reason) return '<td class="' + cls + '"><span class="faint">—</span></td>'; var v = levelValue(y, idx(l), m[0]); if (mode === 'focus' && i !== fi) { var f = levelValue(y, fi, m[0]); return '<td class="' + cls + '">' + (v == null || f == null ? '<span class="faint">—</span>' : sgn(v - f, m[2])) + '</td>'; } return '<td class="' + cls + '">' + (m[0] === 'step' ? sgn(v, m[2]) : num(v, m[2])) + '</td>'; }).join(''); }).join('') + '</tr>';
    }).join('');
    return tools + '<div class="tblwrap"><table class="tbl ch-levels-tbl"><thead>' + head1 + head2 + '</thead><tbody>' + body + '</tbody></table></div>';
  }

  /* ── Steps: the asset lens, the factor lens, the matrix, the risk ── */
  function assetTable(st, s, by, compact) {
    var rows = st.byGroup.slice(), sep = methodOf(s).interaction === 'separate', prod = by === 'product', fx = methodOf(s).currency === 'fxFactor' && st.matrix;
    if (Math.abs(st.drift || 0) > 1e-4) rows.push({ key: '__drift', label: st.driftLabel || 'Rebalancing and drift', short: st.driftLabel || 'Rebalancing and drift', color: CROSS_INK, total: st.drift, drift: true });
    var max = Math.max.apply(null, rows.map(function (r) { return Math.abs(r.total); }).concat([0.01]));
    var name = function (r) { return '<span class="sw" style="background:' + (r.color || '#c3cedb') + '"></span>' + esc(r.label || r.short) + (r.sub ? '<small class="ch-sub">' + esc(r.sub) + '</small>' : ''); };
    var fxOf = function (r) { var c = st.matrix && st.matrix.cells[r.key]; return c && c.factors ? c.factors.fx : null; };
    if (compact) return '<table class="tbl act-src"><thead><tr><th>' + (prod ? 'Product' : by === 'assetClass' ? 'Asset class' : 'Category') + '</th>' + (prod ? '' : '<th class="num">Alloc.</th><th class="num">Select.</th>') + '<th class="num">Total</th><th class="bar-col"></th></tr></thead><tbody>' + rows.map(function (r) { return '<tr><td>' + name(r) + '</td>' + (prod ? '' : '<td class="num">' + (r.allocation == null ? '' : sgn(r.allocation)) + '</td><td class="num"' + (sep ? ' data-tip="Selection and interaction"' : '') + '>' + (r.selection == null ? '' : sgn(r.selection + (sep ? (r.interaction || 0) : 0))) + '</td>') + '<td class="num"><b>' + sgn(r.total) + '</b></td><td class="bar-col">' + dbar(r.total, max, r.color) + '</td></tr>'; }).join('') + '<tr class="total"><td>Step active return</td>' + (prod ? '' : '<td></td><td></td>') + '<td class="num">' + sgn(st.total) + '</td><td></td></tr></tbody></table>';
    var head = '<tr><th>' + (prod ? 'Product' : by === 'assetClass' ? 'Asset class' : 'Category') + '</th><th class="num" data-tip="Weight at the upper level, %">w ' + esc(st.meta.from) + '</th><th class="num" data-tip="Weight at the lower level, %">w ' + esc(st.meta.to) + '</th><th class="num" data-tip="Return at the upper level, % a year">r ' + esc(st.meta.from) + '</th><th class="num" data-tip="Return at the lower level, % a year">r ' + esc(st.meta.to) + '</th>' +
      (prod ? '' : '<th class="num">Allocation</th><th class="num">Selection</th>' + (sep ? '<th class="num">Interaction</th>' : '')) + (fx ? '<th class="num" data-tip="Memo: the part of the total explained by the FX factor">of which FX</th>' : '') + '<th class="num">Total</th><th class="bar-col"></th></tr>';
    var body = rows.map(function (r) {
      if (r.drift) return '<tr class="ch-drift"><td>' + name(r) + '</td><td colspan="' + (prod ? 4 : (sep ? 7 : 6)) + '" class="faint small">' + esc(r.label === 'Compounding and rebalancing' ? 'Annualised returns at current weights do not compound to the realised figure' : 'Quarterly-rebalanced backtests less constant monthly weights') + '</td>' + (fx ? '<td></td>' : '') + '<td class="num">' + sgn(r.total) + '</td><td class="bar-col">' + dbar(r.total, max, CROSS_INK) + '</td></tr>';
      return '<tr><td>' + name(r) + '</td><td class="num">' + num(r.wFrom, 1) + '</td><td class="num">' + num(r.wTo, 1) + '</td><td class="num">' + num(r.rFrom, 2) + '</td><td class="num">' + num(r.rTo, 2) + '</td>' + (prod ? '' : '<td class="num">' + sgn(r.allocation) + '</td><td class="num">' + sgn(r.selection) + '</td>' + (sep ? '<td class="num">' + sgn(r.interaction) + '</td>' : '')) + (fx ? '<td class="num">' + (fxOf(r) == null ? '' : sgn(fxOf(r))) + '</td>' : '') + '<td class="num"><b>' + sgn(r.total) + '</b></td><td class="bar-col">' + dbar(r.total, max, r.color) + '</td></tr>';
    }).join('');
    var tA = U.sum(rows, function (r) { return r.allocation || 0; }), tS = U.sum(rows, function (r) { return r.selection || 0; }), tI = U.sum(rows, function (r) { return r.interaction || 0; });
    return '<table class="tbl act-src ch-asset"><thead>' + head + '</thead><tbody>' + body + '<tr class="total"><td>Step active return</td><td></td><td></td><td></td><td></td>' + (prod ? '' : '<td class="num">' + F.signed(tA, 2) + '</td><td class="num">' + F.signed(tS, 2) + '</td>' + (sep ? '<td class="num">' + F.signed(tI, 2) + '</td>' : '')) + (fx ? '<td></td>' : '') + '<td class="num">' + F.signed(st.total, 2) + '</td><td></td></tr></tbody></table>';
  }
  function factorRows(st, s, by) {
    var f = st.factor, big = function (r) { return Math.abs(r.dBeta) >= 0.005 || Math.abs(r.contribution) >= 0.005; };
    var rows = f.byFactor.filter(big).sort(function (a, b) { return Math.abs(b.contribution) - Math.abs(a.contribution); }), small = f.byFactor.filter(function (r) { return !big(r); });
    var extra = small.length ? [{ key: '__other', label: 'Other ' + small.length + ' factors, each under 0.005', contribution: U.sum(small, function (r) { return r.contribution; }), color: H.FACTOR_INK }] : [];
    extra.push({ key: '__cash', label: 'Cash (net weight difference × cash rate)', contribution: f.cash, color: CROSS_INK });
    var sm = s.specificBy === 'one' ? null : st.specificMatrix || ((s.specificBy === 'product') === (by === 'product') ? st.matrix : null), sby = s.specificBy === 'product' ? 'product' : 'category';
    var shown = 0; if (sm) Object.keys(sm.cells).forEach(function (g) { var c = sm.cells[g]; if (Math.abs(c.specific) > 5e-4) { shown += c.specific; extra.push({ key: '__spec:' + g, label: 'Specific · ' + groupLabel(g, sby), contribution: c.specific, color: '#c3cedb' }); } });
    if (!sm) extra.push({ key: '__specific', label: 'Specific (not explained by the model)', contribution: f.specific, color: '#c3cedb' });
    else if (Math.abs(f.specific - shown) > 5e-4) extra.push({ key: '__specific', label: 'Specific · other', contribution: f.specific - shown, color: '#c3cedb' });
    if (Math.abs(f.drift || 0) > 1e-4) extra.push({ key: '__drift', label: st.driftLabel || 'Rebalancing and drift', contribution: f.drift, color: CROSS_INK });
    if (Math.abs(f.notReconciled || 0) > 1e-4) extra.push({ key: '__nr', label: 'Not reconciled', contribution: f.notReconciled, color: '#e0b25c', tip: f.reconcileReason });
    return { rows: rows, extra: extra };
  }
  function factorTable(st, s, model, by, compact, pair, pairModel) {
    var fr = factorRows(st, s, by), max = Math.max.apply(null, fr.rows.concat(fr.extra).map(function (r) { return Math.abs(r.contribution); }).concat([0.01])), fxRow = methodOf(s).currency === 'fxFactor';
    var pv = {}; if (pair) pair.byFactor.forEach(function (r) { pv[r.factorId] = r.contribution; });
    var lab = function (r) { return r.factorId === 'fx' && fxRow ? 'FX (currency)' : r.label; };
    if (compact) return '<table class="tbl act-src"><thead><tr><th>Factor · ' + esc(model.name) + '</th><th class="num">Δβ</th><th class="num">Return</th><th class="num">Contribution</th><th class="bar-col"></th></tr></thead><tbody>' + fr.rows.map(function (r) { return '<tr' + (r.factorId === 'fx' && fxRow ? ' class="is-fx"' : '') + '><td>' + esc(lab(r)) + '</td><td class="num">' + sgn(r.dBeta, 2) + '</td><td class="num">' + num(r.factorReturn, 2) + '</td><td class="num">' + sgn(r.contribution) + '</td><td class="bar-col">' + dbar(r.contribution, max, H.FACTOR_INK) + '</td></tr>'; }).join('') + fr.extra.map(function (r) { return '<tr' + (r.tip ? ' data-tip="' + esc(r.tip) + '"' : '') + '><td>' + esc(r.label) + '</td><td></td><td></td><td class="num">' + sgn(r.contribution) + '</td><td class="bar-col">' + dbar(r.contribution, max, r.color) + '</td></tr>'; }).join('') + '<tr class="total"><td>Step active return</td><td></td><td></td><td class="num">' + sgn(st.total) + '</td><td></td></tr></tbody></table>';
    return '<table class="tbl act-src ch-factor"><thead><tr><th>Factor · ' + esc(model.name) + '</th><th class="num">β ' + esc(st.meta.from) + '</th><th class="num">β ' + esc(st.meta.to) + '</th><th class="num" data-tip="Active exposure: lower less upper">Δβ</th><th class="num" data-tip="Factor premium (forward) or realised factor return, % a year">Factor return</th><th class="num">Contribution</th><th class="bar-col"></th>' + (pair ? '<th class="num" data-tip="The same contribution under ' + esc(pairModel.name) + ', factor by factor where the two share an identifier">' + esc(pairModel.name) + '</th>' : '') + '</tr></thead><tbody>' +
      fr.rows.map(function (r) { return '<tr' + (r.factorId === 'fx' && fxRow ? ' class="is-fx"' : '') + '><td>' + esc(lab(r)) + '</td><td class="num">' + num(r.betaFrom) + '</td><td class="num">' + num(r.betaTo) + '</td><td class="num">' + sgn(r.dBeta) + '</td><td class="num">' + num(r.factorReturn) + '</td><td class="num"><b>' + sgn(r.contribution) + '</b></td><td class="bar-col">' + dbar(r.contribution, max, r.factorId === 'fx' && fxRow ? '#9a5b00' : H.FACTOR_INK) + '</td>' + (pair ? '<td class="num">' + (pv[r.factorId] == null ? '<span class="faint">—</span>' : sgn(pv[r.factorId])) + '</td>' : '') + '</tr>'; }).join('') +
      (pair ? pair.byFactor.filter(function (r) { return !fr.rows.some(function (q) { return q.factorId === r.factorId; }) && Math.abs(r.contribution) > 5e-4; }).map(function (r) { return '<tr class="faint"><td>' + esc(r.label) + ' <small>(' + esc(pairModel.name) + ' only)</small></td><td></td><td></td><td></td><td></td><td class="num"><span class="faint">—</span></td><td></td><td class="num">' + sgn(r.contribution) + '</td></tr>'; }).join('') : '') +
      fr.extra.map(function (r) { return '<tr' + (r.tip ? ' data-tip="' + esc(r.tip) + '"' : '') + '><td>' + esc(r.label) + '</td><td></td><td></td><td></td><td></td><td class="num"><b>' + sgn(r.contribution) + '</b></td><td class="bar-col">' + dbar(r.contribution, max, r.color) + '</td>' + (pair ? '<td class="num">' + (r.key === '__cash' ? sgn(pair.cash) : r.key === '__specific' ? sgn(pair.specific) : '') + '</td>' : '') + '</tr>'; }).join('') +
      '<tr class="total"><td>Step active return</td><td></td><td></td><td></td><td></td><td class="num">' + F.signed(st.total, 2) + '</td><td></td>' + (pair ? '<td class="num">' + F.signed(pair.factorTotal + pair.cash + pair.specific, 2) + '</td>' : '') + '</tr></tbody></table>';
  }
  function matrixTable(st, model, by) {
    var mx = st.matrix; if (!mx || !mx.order.length) return empty('No active position in this step.');
    var fs = model.factors.filter(function (f) { return mx.order.some(function (g) { return Math.abs(mx.cells[g].factors[f.id] || 0) > 5e-4; }); });
    var max = 0; mx.order.forEach(function (g) { var c = mx.cells[g]; fs.forEach(function (f) { max = Math.max(max, Math.abs(c.factors[f.id] || 0)); }); max = Math.max(max, Math.abs(c.specific), Math.abs(c.cash)); });
    var cell = function (v, t) { return '<td class="num"><span class="heat" style="background:' + V.shade(v, max) + '" data-tip="' + esc(t + ': ' + F.signed(v, 3)) + '">' + F.signed(v, 2) + '</span></td>'; };
    var asset = {}; st.byGroup.forEach(function (r) { asset[r.key] = r.total; });
    var rowsH = mx.order.map(function (g) { var c = mx.cells[g], tot = U.sum(fs, function (f) { return c.factors[f.id] || 0; }) + U.sum(model.factors.filter(function (f) { return fs.indexOf(f) < 0; }), function (f) { return c.factors[f.id] || 0; }) + c.specific + c.cash; return '<tr><th scope="row"><span class="sw" style="background:' + groupColor(g, by) + '"></span>' + esc(groupLabel(g, by)) + '</th>' + fs.map(function (f) { return cell(c.factors[f.id] || 0, groupLabel(g, by) + ' · ' + f.name); }).join('') + cell(c.specific, groupLabel(g, by) + ' · specific') + cell(c.cash, groupLabel(g, by) + ' · cash and benchmark') + '<td class="num"><b>' + F.signed(tot, 2) + '</b></td><td class="num faint">' + (asset[g] == null ? '—' : F.signed(asset[g], 2)) + '</td></tr>'; }).join('');
    var colSum = function (get) { return U.sum(mx.order, function (g) { return get(mx.cells[g]); }); };
    var foot = '<tr class="total"><th scope="row">Total</th>' + fs.map(function (f) { return '<td class="num">' + F.signed(colSum(function (c) { return c.factors[f.id] || 0; }), 2) + '</td>'; }).join('') + '<td class="num">' + F.signed(colSum(function (c) { return c.specific; }), 2) + '</td><td class="num">' + F.signed(colSum(function (c) { return c.cash; }), 2) + '</td><td class="num">' + F.signed(colSum(function (c) { return U.sum(model.factors, function (f) { return c.factors[f.id] || 0; }) + c.specific + c.cash; }), 2) + '</td><td></td></tr>';
    return '<div class="tblwrap"><table class="tbl heat-tbl ch-matrix"><caption class="sr-only">Group by factor</caption><thead><tr><th scope="col">' + (by === 'assetClass' ? 'Asset class' : by === 'product' ? 'Product' : 'Category') + ' × factor</th>' + fs.map(function (f) { return '<th scope="col" class="num">' + esc(f.name) + '</th>'; }).join('') + '<th scope="col" class="num">Specific</th><th scope="col" class="num" data-tip="Weight difference × (cash rate − upper level’s return): the part of an allocation effect that is not a factor">Cash &amp; bench.</th><th scope="col" class="num">Row total</th><th scope="col" class="num" data-tip="The asset lens total for the group, to compare">Asset lens</th></tr></thead><tbody>' + rowsH + foot + '</tbody></table></div>';
  }
  function tieLine(st, b, x) {
    var t = (x.ties.list || []).filter(function (q) { return q.basis === b && q.id === b + ':' + st.meta.id + ':factor'; })[0];
    var asset = U.sum(st.byGroup, function (r) { return r.total; }) + (st.drift || 0), f = st.factor, fac = f.factorTotal + f.cash + f.specific + (f.drift || 0);
    var diff = asset - fac, ok = Math.abs(diff) <= 0.005;
    return '<div class="ch-tie' + (ok ? ' is-ok' : ' is-off') + '"><span>Asset lens <b>' + F.signed(asset, 2) + '</b></span><span>Factor lens <b>' + F.signed(fac, 2) + '</b></span><span>Difference <b>' + F.signed(diff, 3) + '</b></span><span>' + (ok ? I.check + ' Ties within 0.005 pp: both lenses come from the same calculation' : esc((t && t.reason) || 'Does not tie')) + '</span></div>';
  }
  function riskBlock(sel, s, model, by, b, lens) {
    var r = sel.risk; if (!r) return '';
    var u = s.riskUnits, k = u === 'var99' ? Z : u === 'es99' ? ESK : 1, share = u === 'share', cols = s.columns;
    var fac = lens === 'factor';
    var src = fac ? r.byFactor.filter(function (x) { return Math.abs(x.euler) > 5e-4; }).map(function (x) { return { label: x.label, euler: x.euler, marginal: x.marginal, x: x.exposure, color: H.FACTOR_INK }; }).concat([{ label: 'Specific', euler: r.specific, color: '#c3cedb' }].concat(r.cash ? [{ label: 'Cash', euler: r.cash, color: CROSS_INK }] : []).concat(Math.abs(r.drift || 0) > 5e-4 ? [{ label: 'Rebalancing and drift', euler: r.drift, color: CROSS_INK }] : []))
      : r.byGroup.map(function (g) { return { label: groupLabel(g.key, by), euler: g.euler, marginal: g.marginal, x: g.activeWeight, sigma: g.sigma, rho: g.rho, color: g.key === '__drift' ? CROSS_INK : groupColor(g.key, by) }; }).sort(function (p, q) { return Math.abs(q.euler) - Math.abs(p.euler); });
    var val = function (e) { return share ? (r.te > 0 ? e / r.te * 100 : 0) : e * k; };
    var max = Math.max.apply(null, src.map(function (x) { return Math.abs(val(x.euler)); }).concat([0.01]));
    var head = '<tr><th>' + (fac ? 'Factor · ' + esc(model.name) : by === 'assetClass' ? 'Asset class' : by === 'product' ? 'Product' : 'Category') + '</th>' + (cols === 'xsr' && !fac ? '<th class="num" data-tip="Net active weight of the position, pp">x</th><th class="num" data-tip="Volatility of the position’s return per unit of active weight, % a year">σ</th><th class="num" data-tip="Correlation of the position with the step’s active return">ρ</th>' : '') + '<th class="num">' + esc(share ? 'Share' : u === 'var99' ? 'VaR part' : u === 'es99' ? 'ES part' : 'Contribution') + '</th><th class="bar-col"></th>' + (cols === 'marginal' ? '<th class="num" data-tip="' + (fac ? 'Change in tracking error per unit of exposure' : 'Change in tracking error per pp of active weight, at the position’s mix') + '">Marginal</th>' : '') + '</tr>';
    var rowsH = src.map(function (x) {
      var xsr = ''; if (cols === 'xsr' && !fac) { var ok = x.x != null && Math.abs(x.x) >= 0.05 && x.sigma != null; xsr = '<td class="num">' + (x.x == null ? '' : sgn(x.x, 1)) + '</td><td class="num">' + (ok ? num(x.sigma / Math.abs(x.x) * 100, 1) : '<span class="faint" data-tip="Offsetting positions: no net weight to scale by">—</span>') + '</td><td class="num">' + (ok && x.rho != null ? num(x.rho * (x.x < 0 ? -1 : 1), 2) : '<span class="faint">—</span>') + '</td>'; }
      return '<tr><td><span class="sw" style="background:' + x.color + '"></span>' + esc(x.label) + '</td>' + xsr + '<td class="num">' + sgn(val(x.euler), share ? 0 : 2) + '</td><td class="bar-col">' + dbar(val(x.euler), max, x.color) + '</td>' + (cols === 'marginal' ? '<td class="num">' + (x.marginal == null ? '<span class="faint">—</span>' : num(x.marginal, 3)) + '</td>' : '') + '</tr>';
    }).join('');
    var span = (cols === 'xsr' && !fac ? 3 : 0);
    var less = (u === 'var99' || u === 'es99') ? '<tr><td>Less the step’s expected active return</td>' + (span ? '<td colspan="' + span + '"></td>' : '') + '<td class="num">' + sgn(-r.mu) + '</td><td></td>' + (cols === 'marginal' ? '<td></td>' : '') + '</tr>' : '';
    var tot = share ? 100 : (u === 'var99' || u === 'es99') ? r.te * k - r.mu : r.te;
    var title = 'Risk of the step · tracking error ' + F.num(r.te, 2) + '% a year · contribution to the whole ' + F.signed(r.contribution, 2) + (b === 'historical' && r.byGroup.some(function (g) { return g.key === '__drift'; }) ? ' · realised' : '');
    return '<div class="act-sub ch-risk-title">' + esc(title) + '</div><table class="tbl act-src ch-risk"><thead>' + head + '</thead><tbody>' + rowsH + less + '<tr class="total"><td>' + esc(share ? 'Tracking error' : u === 'var99' ? '99% VaR, 1 year (parametric)' : u === 'es99' ? '99% ES, 1 year (parametric)' : 'Tracking error of the step') + '</td>' + (span ? '<td colspan="' + span + '"></td>' : '') + '<td class="num">' + num(tot, share ? 0 : 2) + '</td><td></td>' + (cols === 'marginal' ? '<td></td>' : '') + '</tr></tbody></table>';
  }
  function spreadTable(st) {
    if (!st.spread) return '';
    return '<details class="ch-spread"><summary>Spread over the ' + st.spread.values.length + ' orders · ' + F.signed(st.spread.min, 2) + ' to ' + F.signed(st.spread.max, 2) + '</summary><table class="tbl"><thead><tr><th>Order</th><th class="num">' + esc(st.meta.code) + '</th></tr></thead><tbody>' + st.spread.values.map(function (v) { return '<tr><td>' + esc(v.order) + '</td><td class="num">' + sgn(v.value) + '</td></tr>'; }).join('') + '<tr class="total"><td>Average (shown)</td><td class="num">' + sgn(st.total) + '</td></tr></tbody></table></details>';
  }
  function stepsHtml(x, s, card, data, lensOverride) {
    var b = oneBasis(card, s), y = x[b], model = D.factorModelById[data.factorModel], pairModel = data.pairModel ? D.factorModelById[data.pairModel] : null;
    var lens = lensOverride || (s.decompose === 'factor' && s.lens === 'asset' ? 'factor' : s.lens), by = s.decompose === 'factor' ? 'category' : s.decompose;
    var tools = '<div class="ch-tools">' + basisChips(card, s) + stepChips(x, s, b) + '</div><div class="ch-tools">' + seg('ch-lens', lensOverride ? LENSES.slice(2) : LENSES, lens, 'Lens') + seg('ch-by', BY, s.decompose, 'By') + '</div>';
    if (!y) return tools + empty('Not calculated for this basis.');
    if (y.reason) return tools + empty(esc(y.reason));
    var sel = pickStep(x, b, s); if (!sel) return tools + empty('Step unavailable.');
    var st = sel.step, sub = '<div class="act-sub ch-step-title"><b>' + esc(st.meta.code + ' · ' + st.meta.label) + '</b> · ' + esc(st.meta.from + ' → ' + st.meta.to) + ' · active return ' + F.signed(st.total, 2) + '% a year' + (st.cumulative != null ? ' (' + F.signed(st.cumulative, 2) + '% over the period, linked)' : '') + '</div>';
    var main;
    if (lens === 'both') main = '<div class="act-two"><div><div class="act-sub">Asset &amp; allocation · by ' + esc(by === 'assetClass' ? 'asset class' : by) + '</div>' + assetTable(st, s, by, true) + '</div><div><div class="act-sub">Factor · ' + esc(model.name) + '</div>' + factorTable(st, s, model, by, true) + '</div></div>' + tieLine(st, b, x);
    else if (lens === 'matrix') main = matrixTable(st, model, by === 'product' ? 'product' : by) + tieLine(st, b, x);
    else if (lens === 'factor') main = (s.sources === 'waterfall' ? '<div class="viz-host" data-ch-steps-wf="factor"></div>' : '<div class="tblwrap">' + factorTable(st, s, model, by, false, b === 'forward' && pairModel ? st.pair : null, pairModel) + '</div>');
    else main = s.sources === 'waterfall' ? '<div class="viz-host" data-ch-steps-wf="asset"></div>' : '<div class="tblwrap">' + assetTable(st, s, by, false) + '</div>';
    return tools + sub + main + spreadTable(st) + (lensOverride ? '' : riskBlock(sel, s, model, by, b, lens === 'factor' ? 'factor' : 'asset'));
  }
  function drawStepsWf(body, x, s, card, data) {
    var el = body.querySelector('[data-ch-steps-wf]'); if (!el) return;
    var b = oneBasis(card, s), sel = pickStep(x, b, s); if (!sel) return;
    var st = sel.step, kind = el.dataset.chStepsWf, by = s.decompose === 'factor' ? 'category' : s.decompose, steps;
    if (kind === 'factor') { var fr = factorRows(st, s, by); steps = fr.rows.map(function (r) { return { label: r.label, value: r.contribution, color: H.FACTOR_INK, tip: r.label + ' (Δβ ' + F.signed(r.dBeta, 2) + ' × ' + F.num(r.factorReturn, 2) + ')' }; }).concat(fr.extra.map(function (r) { return { label: r.label, value: r.contribution, color: r.color }; })); }
    else { steps = st.byGroup.map(function (r) { return { label: r.short || r.label, value: r.total, color: r.color || '#c3cedb', tip: (r.label || r.short) + (r.allocation != null ? ' (allocation ' + F.signed(r.allocation, 2) + ', selection ' + F.signed(r.selection, 2) + (r.interaction ? ', interaction ' + F.signed(r.interaction, 2) : '') + ')' : '') }; }); if (Math.abs(st.drift || 0) > 1e-4) steps.push({ label: st.driftLabel, value: st.drift, color: CROSS_INK }); }
    V.waterfall(el, { height: Math.max(170, body.clientHeight - 300), steps: steps, total: { label: st.meta.code + ' active return', color: inkOf(st.meta.id) }, unit: 'pp', dp: 2, aria: 'Waterfall of ' + st.meta.code + ' by source' });
  }

  /* ── Reconcile ───────────────────────────────────────────────────── */
  function reconcileHtml(x, bases) {
    var list = (x.ties.list || []).filter(function (t) { return bases.indexOf(t.basis) >= 0; });
    if (!list.length) return empty('Nothing to reconcile on this basis.');
    var dp = function (t) { return t.unit === '%²' ? 3 : 3; };
    return '<div class="tblwrap"><table class="tbl ch-ledger"><caption class="sr-only">Reconcile ledger</caption><thead><tr><th scope="col">Identity</th><th scope="col">Basis</th><th scope="col" class="num">Left</th><th scope="col" class="num">Right</th><th scope="col" class="num">Difference</th><th scope="col">Status</th></tr></thead><tbody>' +
      list.map(function (t) { return '<tr class="' + (t.kind === 'risk' ? 'is-risk' : '') + '"><th scope="row">' + esc(t.label) + (t.unit ? ' <small class="faint">' + esc(t.unit) + '</small>' : '') + '</th><td>' + esc(BSHORT[t.basis]) + '</td><td class="num">' + F.num(t.lhs, dp(t)) + '</td><td class="num">' + F.num(t.rhs, dp(t)) + '</td><td class="num">' + F.signed(t.diff, dp(t)) + '</td><td>' + (t.within ? '<span class="ch-ok">' + I.check + 'Ties</span>' : t.explained ? '<span class="tag tag-warn" data-tip="' + esc(t.reason) + '">Explained</span>' : '<span class="tag tag-neg">Off</span>') + '</td></tr>'; }).join('') + '</tbody></table></div>' +
      '<p class="small faint ch-ledger-note">Tolerance ' + x.ties.tolerance + ' pp for returns and tracking errors, 0.01 for squared tracking errors. Every figure comes from one calculation, so the lenses and steps are computed on the same data.' + (list.some(function (t) { return t.explained; }) ? ' An explained line has a known cause, given in its tag.' : '') + '</p>';
  }

  /* ── Over time ───────────────────────────────────────────────────── */
  function timeHtml(x, s, card, data) {
    var h = x.historical, gran = s.overTime || 'years', show = (C.state[card.id] || {}).timeShow === 'lines' ? 'lines' : 'heat';
    var tools = '<div class="ch-tools">' + seg('ch-gran', [['years', 'Years'], ['months', 'Months'], ['rolling36', 'Rolling 36 months']], gran, 'Periods') + (gran === 'rolling36' ? '' : seg('ch-show', [['heat', 'Heat map'], ['lines', 'Cumulative lines']], show, 'Show')) + '</div>';
    if (!h) return tools + empty('Over time needs the historical basis. <button type="button" class="btn btn-sm" data-ch-hist>Show both bases</button>');
    if (h.reason) return tools + empty(esc(h.reason));
    var ot = h.overTime; if (!ot) return tools + empty('No periods.');
    if (ot.kind === 'none') return tools + empty(esc(ot.reason) + '. <button type="button" class="btn btn-sm" data-ch-link>Use Cariño linking</button>');
    if (ot.kind === 'rolling' || show === 'lines') return tools + '<div class="act-sub">' + esc(ot.kind === 'rolling' ? 'Rolling 36-month active return of each step, % a year' : 'Cumulative linked contribution of each step, %') + '</div><div class="viz-host" data-ch-lines></div>';
    var sel = s.step && s.step !== 'all' && s.step !== 'policyToPortfolio' ? ot.steps.filter(function (q) { return q.id === s.step; })[0] : null, rows = [];
    ot.steps.forEach(function (q, i) { var meta = h.steps[i].meta; rows.push({ label: meta.code + ' · ' + meta.short, values: q.total, total: q.cumulative, strong: true, color: inkOf(meta.id) }); });
    if (sel) {
      /* the selected step's rows, by group or factor, under its own line */
      var i0 = ot.steps.indexOf(sel), meta0 = h.steps[i0].meta, fac = s.lens === 'factor' || s.decompose === 'factor', by = s.decompose === 'factor' ? 'category' : s.decompose, model = D.factorModelById[data.factorModel], subs = [];
      var live = function (arr) { return arr.some(function (v) { return Math.abs(v) > 0.005; }); };
      if (fac) Object.keys(sel.factors).filter(function (f) { return live(sel.factors[f]); }).forEach(function (f) { subs.push({ label: (model.factorById[f] || {}).name || f, values: sel.factors[f], total: U.sum(sel.factors[f]), sub: true }); });
      else Object.keys(sel.rows).filter(function (k) { return live(sel.rows[k]); }).forEach(function (k) { subs.push({ label: groupLabel(k, by), values: sel.rows[k], total: U.sum(sel.rows[k]), sub: true }); });
      if (fac) subs.push({ label: 'Specific', values: sel.specific, total: U.sum(sel.specific), sub: true });
      if (live(sel.drift)) subs.push({ label: 'Rebalancing and drift', values: sel.drift, total: U.sum(sel.drift), sub: true });
      rows = rows.slice(0, i0 + 1).concat([{ label: meta0.code + ' by ' + (fac ? 'factor' : by === 'assetClass' ? 'asset class' : by), head: true }], subs, rows.slice(i0 + 1));
    }
    var max = 0; rows.forEach(function (r) { (r.values || []).forEach(function (v) { if (v != null) max = Math.max(max, Math.abs(v)); }); });
    var cell = function (r, v, i) { var t = esc(r.label + ' · ' + ot.periods[i] + ': ' + F.signed(v, 2) + ' pp'); return '<span class="heat" style="background:' + V.shade(v, max) + '" data-tip="' + t + '">' + F.signed(v, 2) + '</span>'; };
    return tools + '<div class="act-sub">Linked contribution in each ' + (gran === 'months' ? 'month' : 'calendar year') + ', pp; the total column is the linked period total, cumulative (' + esc(CH.LABELS.linking[h.linking]) + ')</div>' + V.table([{ label: 'Step' }].concat(ot.periods.map(function (p, i) { return { label: esc(gran === 'months' ? F.month(p) : p) + (ot.partial && ot.partial[i] ? '<sup aria-label="part year">*</sup>' : ''), num: true }; })).concat([{ label: 'Total', num: true }]),
      rows.map(function (r) { if (r.head) return { cls: 'ch-ot-head', cells: ['<b>' + esc(r.label) + '</b>'].concat(ot.periods.map(function () { return ''; })).concat(['']) }; return { cls: r.sub ? 'ch-ot-sub' : '', cells: [(r.color ? '<span class="sw" style="background:' + r.color + '"></span>' : '') + esc(r.label)].concat(r.values.map(function (v, i) { return cell(r, v, i); })).concat(['<b>' + F.signed(r.total, 2) + '</b>']) }; }), { maxHeight: '100%', caption: 'Steps over time', cls: 'heat-tbl ch-ot' }) + (ot.partial && ot.partial.some(Boolean) ? '<p class="small faint">* Part year: the period starts or ends within it.</p>' : '');
  }
  function drawLines(body, x, s, card, wa) {
    var el = body.querySelector('[data-ch-lines]'); if (!el) return;
    var h = x.historical, ot = h.overTime, series;
    if (ot.kind === 'rolling') series = ot.lines.map(function (vals, i) { var m = h.steps[i].meta; return { id: m.id, name: m.code + ' ' + m.short, color: inkOf(m.id), values: vals }; });
    else { series = ot.steps.map(function (q, i) { var m = h.steps[i].meta, run = 0; return { id: m.id, name: m.code + ' ' + m.short, color: inkOf(m.id), values: q.total.map(function (v) { run += v; return run; }) }; }); }
    el.innerHTML = '<div class="viz-legend" style="padding:0 0 6px">' + series.map(function (q) { return '<span class="ch-leg"><span class="sw" style="background:' + q.color + '"></span>' + esc(q.name) + '</span>'; }).join('') + '</div><div data-ch-line-host></div>';
    V.lineChart(el.querySelector('[data-ch-line-host]'), { xs: ot.kind === 'rolling' ? ot.months : ot.periods, series: series, height: Math.max(160, body.clientHeight - 150), baseline: 0, fmt: function (v) { return F.signed(v, 2) + (ot.kind === 'rolling' ? '%' : ' pp'); }, aria: 'Step contributions over time for ' + wa.name });
  }

  /* ── notes ───────────────────────────────────────────────────────── */
  function notesOf(x, s, data, card) {
    var m = methodOf(s), L = CH.LABELS, model = D.factorModelById[data.factorModel], c = x.counts || {}, out = [];
    out.push('<b>Method.</b> ' + esc([L.attributionModel[m.model], L.interaction[m.interaction], m.returns === 'geometric' ? 'geometric active return' : 'arithmetic active return', 'historical effects ' + (m.returns === 'geometric' ? 'linked geometrically' : m.linking === 'none' ? 'not linked (annualised, current weights)' : 'linked with ' + L.linking[m.linking] + ' and scaled to the annualised active return'), L.currency[m.currency], L.unallocated[m.unallocated], L.fees[conv().fees]].join(' · ')) + '.');
    if (s.currency === 'separate' || (s.currency === 'workspace' && conv().currency === 'separate')) out.push('A separate currency effect needs local-currency returns, forward rates and hedge ratios, which the service does not provide; currency stays inside selection.');
    out.push('<b>Order.</b> ' + esc(x.orderLabel || CH.orderLabel('default')) + '. Each step is the lower level less the upper level' + (x.order && x.order !== 'default' ? ', taken after the steps before it in this order; return steps still sum to the whole' : '') + '.');
    var parts = []; Object.keys(SOURCE).forEach(function (k) { if (c[k]) parts.push(c[k] + ' ' + SOURCE[k]); });
    if (parts.length) out.push('<b>Product benchmarks.</b> ' + esc(parts.join(', ')) + ' (of ' + c.holdings + ' holdings).');
    out.push('<b>Factor lens.</b> ' + esc(model.long) + ', as of ' + F.date(data.modelAsOf) + '. ' + esc(s.exposures === 'returns' ? 'Returns-based exposures (regression over the period), so the factor lens does not tie exactly to the holdings; the gap is the not-reconciled line.' : 'Holdings-based exposures.') + ' Factor returns: ' + esc(s.factorReturns === 'implied' ? 'the forward premia on both bases' : s.factorReturns === 'regression' ? 'premia implied by the period’s annualised index returns' : 'premia implied from expected asset-class returns (forward), realised monthly from the index returns (historical)') + '. Specific is what the model does not explain; cash is the net weight difference at the cash rate.');
    out.push('<b>Risk.</b> ' + esc(s.riskBasis === 'expost' ? 'Ex-post on both bases: realised from monthly active returns over the period.' : s.riskBasis === 'exante' ? 'Ex-ante on both bases, from the factor model.' : 'Ex-ante from the factor model on the forward basis; ex-post, realised over the period, on the historical basis.') + ' Euler contributions sum to the tracking error; stand-alone tracking errors do not, and the cross term is twice the covariances between steps.');
    var vr = (x.forward && x.forward.risk && x.forward.risk.var) || (x.historical && x.historical.risk && x.historical.risk.var);
    if ((s.riskUnits === 'var99' || s.riskUnits === 'es99') && vr && vr.note) out.push('<b>Value at risk.</b> ' + esc(vr.note) + '.');
    (x.notes || []).concat(x.warnings || []).forEach(function (n) { out.push(esc(n) + '.'); });
    if (x.partial) out.push('Partial chain: ' + esc(x.partial.join(', ')) + '. The steps either side of a missing level are shown as one.');
    var px = (x.coverage || []).filter(function (q) { return q.proxied; }); if (px.length) out.push(esc(px.map(function (q) { return CH.LEVELS[q.id] ? CH.LEVELS[q.id].short + ': ' + q.proxied + ' proxied by the category index in ' + model.name : ''; }).filter(Boolean).join(' · ')) + '.');
    if (x.scenarioApplied) out.push('The active scenario applies to the forward-looking steps; derived levels inherit the parent’s scope.');
    return C.notes(card, out);
  }

  /* ── the card ────────────────────────────────────────────────────── */
  C.register({ id: 'decision-chain', title: 'Decision chain', description: 'Return and risk decomposed from the policy benchmark through the SAA and product benchmarks to the portfolio, step by step, in asset and factor space, with a ledger in which every part adds up.', group: 'Summary', size: { w: 12, h: 14 }, min: { w: 6, h: 7 }, basis: 'dual', factorModel: true, supportsRow: true, isNew: true,
    basisOf: function (card) { var b = (card.settings || {}).basis; return b === 'forward' || b === 'historical' ? b : null; },
    settings: [
      { key: 'basis', label: 'Basis', type: 'select', options: [['both', 'Both, side by side'], ['forward', 'Forward-looking'], ['historical', 'Historical']], default: 'both' },
      { key: 'lens', label: 'Lens', type: 'select', options: [['asset', 'Asset & allocation'], ['factor', 'Factor'], ['both', 'Both side by side'], ['matrix', 'Matrix (group × factor)']], default: 'asset' },
      { key: 'decompose', label: 'Attribute by', type: 'select', options: BY, default: 'category' },
      { key: 'step', label: 'Step', type: 'select', options: [['all', 'All steps'], ['saa', 'S1 · Policy → SAA'], ['mapping', 'S2 · SAA → Product benchmarks'], ['selection', 'S3 · Product benchmarks → Portfolio'], ['policyToPortfolio', 'Policy → Portfolio in one']], default: 'all' },
      { key: 'order', label: 'Step order', type: 'select', options: function () { return [['chain', 'As set in the decision chain']].concat(CH.ORDERS.map(function (o) { return [o[0], o[1] + (o[0] === 'default' ? ' (default)' : '')]; })).concat([['averaged', 'Order-averaged over every order']]); }, default: 'chain' },
      { key: 'implementation', label: 'Implementation step', type: 'select', options: [['chain', 'As set in the decision chain'], ['one', 'One step'], ['weightThenBenchmark', 'Weights, then benchmarks'], ['benchmarkThenWeight', 'Benchmarks, then weights']], default: 'chain' },
      { key: 'model', label: 'Attribution model', type: 'select', options: function () { return [wsOpt('attributionModel'), ['BF', CH.LABELS.attributionModel.BF], ['BHB', CH.LABELS.attributionModel.BHB]]; }, default: 'workspace' },
      { key: 'interaction', label: 'Interaction', type: 'select', options: function () { return [wsOpt('interaction'), ['selection', 'In selection'], ['allocation', 'In allocation'], ['separate', 'Separate effect']]; }, default: 'workspace' },
      { key: 'returnMethod', label: 'Active return', type: 'select', options: [['arithmetic', 'Arithmetic difference'], ['geometric', 'Geometric']], default: 'arithmetic' },
      { key: 'linking', label: 'Linking (historical)', type: 'select', options: function (card) { var geo = ((card && card.settings) || {}).returnMethod === 'geometric', why = geo ? 'geometric active return links geometrically' : null; return [wsOpt('linking').concat(why ? [why] : []), ['carino', 'Cariño'].concat(why ? [why] : []), ['menchero', 'Menchero'].concat(why ? [why] : []), ['grap', 'GRAP'].concat(why ? [why] : []), ['frongello', 'Frongello'].concat(why ? [why] : []), ['none', 'None, annualised'].concat(why ? [why] : [])]; }, default: 'workspace' },
      { key: 'currency', label: 'Currency', type: 'select', options: function () { return [wsOpt('currency'), ['none', 'In selection'], ['fxFactor', 'FX factor row (factor lens)'], ['separate', 'Separate currency effect', 'needs local-currency returns']]; }, default: 'workspace' },
      { key: 'unallocated', label: 'Unallocated weight', type: 'select', options: function () { return [wsOpt('unallocated'), ['zero', 'Zero return'], ['cash', 'Treat as cash']]; }, default: 'workspace' },
      { key: 'factorReturns', label: 'Factor returns', type: 'select', options: [['default', 'Implied (forward), realised (historical)'], ['implied', 'Implied premia on both'], ['realised', 'Realised over the period'], ['regression', 'Regression over the period']], default: 'default' },
      { key: 'exposures', label: 'Exposures', type: 'select', options: [['holdings', 'Holdings-based'], ['returns', 'Returns-based (regression)']], default: 'holdings' },
      { key: 'specificBy', label: 'Group specific by', type: 'select', options: [['one', 'One row'], ['category', 'By category'], ['product', 'By product']], default: 'one' },
      { key: 'riskBasis', label: 'Risk basis', type: 'select', options: [['default', 'Ex-ante forward, ex-post historical'], ['exante', 'Ex-ante (factor model)'], ['expost', 'Ex-post (realised over the period)']], default: 'default' },
      { key: 'riskUnits', label: 'Risk units', type: 'select', options: [['te', 'Tracking error'], ['share', 'Share of tracking error'], ['var99', '99% VaR, 1 year'], ['es99', '99% expected shortfall, 1 year']], default: 'te' },
      { key: 'varMethod', label: 'Value at risk', type: 'select', options: [['parametric', 'Parametric'], ['historical', 'Historical (needs ex-post risk)'], ['montecarlo', 'Monte Carlo (needs ex-ante risk)']], default: 'parametric', when: function (s) { return s.riskUnits === 'var99' || s.riskUnits === 'es99'; } },
      { key: 'paths', label: 'Monte Carlo paths', type: 'select', options: [['2000', '2,000'], ['5000', '5,000'], ['10000', '10,000']], default: '5000', when: function (s) { return (s.riskUnits === 'var99' || s.riskUnits === 'es99') && s.varMethod === 'montecarlo'; } },
      { key: 'stepRisk', label: 'Step risk', type: 'select', options: [['both', 'Both, with the cross term'], ['contribution', 'Contribution to total tracking error'], ['standalone', 'Stand-alone per step']], default: 'both' },
      { key: 'columns', label: 'Contribution columns', type: 'select', options: [['euler', 'Euler contributions'], ['marginal', 'With marginal contributions'], ['xsr', 'As x · σ · ρ']], default: 'euler' },
      { key: 'sources', label: 'Step sources', type: 'select', options: [['table', 'Table with bars'], ['waterfall', 'Waterfall']], default: 'table' },
      { key: 'overTime', label: 'Over time', type: 'select', options: [['years', 'Calendar years'], ['months', 'Months'], ['rolling36', 'Rolling 36 months']], default: 'years' },
      { key: 'pairModels', label: 'Show both factor models side by side', type: 'toggle', default: false }],
    subtitle: function (ctx, s, card) {
      var wa = H.wfAlloc(card, ctx), parts = [];
      if (s.basis === 'both') parts.push('→ Fwd and ◷ Hist');
      parts.push(s.order === 'averaged' ? 'Order-averaged' : s.order && s.order !== 'chain' && s.order !== 'default' ? CH.orderLabel(s.order) : 'Policy → SAA → Product benchmarks → Portfolio');
      if (wa) parts.push(wa.name + (card.followRow ? ' · ' + ctx.rowLabel : ''));
      parts.push('% a year');
      if (s.basis !== 'forward') { var m = methodOf(s); parts.push(m.returns === 'geometric' ? 'geometric' : m.linking === 'none' ? 'not linked' : 'linked (' + CH.LABELS.linking[m.linking] + ')'); }
      return parts.concat(departures(s)).join(' · ') + C.modelDeparture(card);
    },
    data: function (ctx, s, card) {
      return C.fetch('chainAnalysis', { revision: ctx.revision, allocations: U.clone(ctx.members), basis: s.basis, period: U.clone(ctx.prefs.period), scenario: U.clone(ctx.scenario), factorModel: C.modelIdOf(card), pairModels: !!s.pairModels, rowKey: card.followRow ? ctx.row : '__total', decompose: s.decompose === 'factor' ? 'category' : s.decompose, step: s.step, order: s.order, implementation: s.implementation === 'chain' ? null : s.implementation, method: methodOf(s), factorReturns: s.factorReturns === 'default' ? null : s.factorReturns, exposures: s.exposures, specificBy: s.specificBy, risk: { basis: s.riskBasis, units: s.riskUnits, stepRisk: s.stepRisk, columns: s.columns, varMethod: s.varMethod, paths: Number(s.paths) }, overTime: s.overTime });
    },
    render: function (body, data, ctx, s, card) {
      var view = viewOf(card), wa = H.wfAlloc(card, ctx), x = seriesOf(data, wa), bases = basesOf(s), html;
      var tabs = '<div class="act-tabs ch-tabs" role="tablist" aria-label="Views">' + VIEWS.map(function (v) { return '<button type="button" role="tab" data-ch-view="' + v[0] + '" aria-selected="' + (v[0] === view) + '" tabindex="' + (v[0] === view ? 0 : -1) + '">' + v[1] + '</button>'; }).join('') + '</div>';
      if (!ctx.members.length) html = '<div class="chart-empty">No allocations in the comparison.</div>';
      else if (!x) html = empty('Not calculated for this allocation.');
      else if (x.reason) html = x.noChain ? '<div class="empty ch-empty">' + I.chart + '<h3>No decision chain for ' + esc(wa.name) + '</h3><p>Name a policy benchmark, an SAA and how its products map to their benchmarks, and this card decomposes return and risk step by step.</p><div class="actions"><button type="button" class="btn btn-primary btn-sm" data-ch-setup>' + I.plus + '<span>Set up decision chain</span></button></div></div>' : empty(esc(x.reason) + (wa.kind === 'level' ? '' : ' <button type="button" class="btn btn-sm" data-ch-setup>Open the decision chain</button>'));
      else {
        html = (x.partial ? UI.alert('warning', '<b>Partial chain.</b> ' + esc(x.partial.join(', ')) + ': the steps either side are shown as one. <button type="button" class="btn-link" data-ch-setup>Complete the chain</button>') : '') +
          (view === 'levels' ? levelsHtml(x, s, card, bases) : view === 'steps' ? stepsHtml(x, s, card, data) : view === 'lens' ? stepsHtml(x, s, card, data, s.lens === 'matrix' ? 'matrix' : 'both') : view === 'reconcile' ? reconcileHtml(x, bases) : view === 'time' ? timeHtml(x, s, card, data) : bridgeHtml(x, s, bases)) + notesOf(x, s, data, card);
      }
      body.innerHTML = tabs + H.wfTabs(card, ctx, wa) + '<div class="ch-view" role="tabpanel">' + html + '</div>';
      if (x && !x.reason) { if (view === 'bridge') drawBridge(body, x, s, wa, card); if (view === 'steps') drawStepsWf(body, x, s, card, data); if (view === 'time') drawLines(body, x, s, card, wa); }
      var set = function (patch) { var c = S.card(card.id), p = U.clone(c.settings || {}); Object.keys(patch).forEach(function (k) { p[k] = patch[k]; }); S.updateCard(c.id, { settings: p }); };
      var refocus = function (sel) { setTimeout(function () { var el = document.querySelector('[data-card="' + CSS.escape(card.id) + '"] ' + sel); if (el) el.focus(); }, 0); };
      var st = C.state[card.id] = C.state[card.id] || {};
      U.on(body, 'click', '[data-ch-view]', function (e, b) { set({ view: b.dataset.chView }); refocus('[data-ch-view="' + b.dataset.chView + '"]'); });
      U.on(body, 'keydown', '[data-ch-view]', function (e, b) { if (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft') return; e.preventDefault(); var ids = VIEWS.map(function (v) { return v[0]; }), i = ids.indexOf(b.dataset.chView), n = ids[(i + (e.key === 'ArrowRight' ? 1 : ids.length - 1)) % ids.length]; set({ view: n }); refocus('[data-ch-view="' + n + '"]'); });
      U.on(body, 'click', '[data-ch-step]', function (e, b) { set({ step: b.dataset.chStep }); refocus('[data-ch-step="' + b.dataset.chStep + '"]'); });
      U.on(body, 'click', '[data-ch-lens]', function (e, b) { set({ lens: b.dataset.chLens }); refocus('[data-ch-lens="' + b.dataset.chLens + '"]'); });
      U.on(body, 'click', '[data-ch-by]', function (e, b) { var p = { decompose: b.dataset.chBy }; if (b.dataset.chBy === 'factor' && (s.lens === 'asset')) p.lens = 'factor'; set(p); refocus('[data-ch-by="' + b.dataset.chBy + '"]'); });
      U.on(body, 'click', '[data-ch-gran]', function (e, b) { set({ overTime: b.dataset.chGran }); refocus('[data-ch-gran="' + b.dataset.chGran + '"]'); });
      U.on(body, 'click', '[data-ch-basis]', function (e, b) { st.basis = b.dataset.chBasis; C.repaint(card.id); refocus('[data-ch-basis="' + b.dataset.chBasis + '"]'); });
      U.on(body, 'click', '[data-ch-show]', function (e, b) { st.timeShow = b.dataset.chShow; C.repaint(card.id); refocus('[data-ch-show="' + b.dataset.chShow + '"]'); });
      U.on(body, 'click', '[data-ch-lview]', function (e, b) { st.levelsView = b.dataset.chLview; C.repaint(card.id); refocus('[data-ch-lview="' + b.dataset.chLview + '"]'); });
      U.on(body, 'click', '[data-ch-lfocus]', function (e, b) { st.levelFocus = b.dataset.chLfocus; C.repaint(card.id); refocus('[data-ch-lfocus="' + b.dataset.chLfocus + '"]'); });
      U.on(body, 'click', '[data-ch-lvmode]', function (e, b) { var v = b.dataset.chLvmode; S.setPref('showLevels', v); U.announce(v === 'off' ? 'Chain levels hidden' : v === 'all' ? 'Chain levels of every allocation shown in the comparison' : 'Chain levels of ' + wa.name + ' shown in the comparison'); refocus('[data-ch-lvmode="' + v + '"]'); });
      U.on(body, 'click', '[data-ch-policy-member]', function (e, b) { var bm = D.benchmarkById[b.dataset.chPolicyMember]; if (bm) UI.dialogs.benchmarkAsMember(bm); });
      U.on(body, 'click', '[data-ch-setup]', function () { var a = S.allocation(wa.kind === 'standalone' ? wa.standalone.allocationId : wa.id); if (a) UI.chain.open(a); });
      U.on(body, 'click', '[data-ch-hist]', function () { set({ basis: 'both' }); });
      U.on(body, 'click', '[data-ch-link]', function () { set({ linking: 'carino' }); });
      H.wireWf(body, card);
    },
    dataTable: function (data, ctx, s, card) {
      var wa = H.wfAlloc(card, ctx), x = seriesOf(data, wa); if (!x || x.reason) return '';
      var bases = basesOf(s).filter(function (b) { return x[b] && !x[b].reason; }), rows = [];
      bases.forEach(function (b) { var y = x[b]; rows.push({ cells: ['<b>' + BASES[b] + '</b>', '', '', ''] }); rows.push({ cells: ['L0 Policy', F.num(y.levelReturns[0], 2), '', y.risk ? '' : ''] }); y.steps.forEach(function (st, i) { rows.push({ cells: [esc(st.meta.code + ' ' + st.meta.label), F.signed(st.total, 2), y.risk ? F.num(y.risk.steps[i].standalone, 2) : '—', y.risk ? F.signed(y.risk.steps[i].contribution, 2) : '—'] }); }); rows.push({ cls: 'total', cells: ['L' + (y.levelReturns.length - 1) + ' Portfolio', F.num(y.levelReturns[y.levelReturns.length - 1], 2), y.risk ? F.num(y.risk.total, 2) : '—', y.risk ? F.num(y.risk.total, 2) : '—'] }); });
      return V.table([{ label: 'Level or step' }, { label: 'Return, % a year', num: true }, { label: 'Stand-alone TE', num: true }, { label: 'TE contribution', num: true }], rows, { maxHeight: '240px', caption: 'Decision chain' });
    }
  });
})();

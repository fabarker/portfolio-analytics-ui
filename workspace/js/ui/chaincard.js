/* ─────────────────────────────────────────────────────────────────────────
   Portfolio Analytics · the Decision chain card
   Where an allocation's active return and active risk come from. Four
   portfolios stand in a line: the policy benchmark, the SAA, the managers'
   and products' benchmarks, and the managers and products themselves. Each
   decision is one of them less the one before, shown in return and in risk
   on the same rows.
   Views: Summary (a sentence, the four portfolios in a strip, the decisions
   on both bases), Breakdown (one decision by category, asset class, product,
   factor, or category × factor) and Over time (the decisions period by
   period). A Checks chip in the card header says whether every figure adds
   up and opens the ledger. One allocation at a time.
   ───────────────────────────────────────────────────────────────────────── */
(function () {
  'use strict';
  var PA = window.PA, U = PA.util, esc = U.esc, S = PA.store, UI = PA.ui, D = PA.data, F = U.fmt, V = UI.viz, C = PA.cards, H = C.h, I = U.icon, CH = PA.chain;
  var VIEWS = [['summary', 'Summary'], ['breakdown', 'Breakdown'], ['time', 'Over time']];
  /* views a card may have stored before there were three */
  var OLD_VIEW = { bridge: 'summary', levels: 'summary', steps: 'breakdown', lens: 'breakdown', reconcile: 'summary' };
  var STEP_INK = { saa: '#2f4f86', mapping: '#5b4a9e', weight: '#5b4a9e', benchmarkFirst: '#5b4a9e', benchmark: '#8a79c6', weightSecond: '#8a79c6', selection: '#3d6f73', pair: '#2f4f86', policyToPortfolio: '#4f74b3' };
  var inkOf = function (id) { return STEP_INK[id] || '#4f74b3'; };
  var CROSS_INK = '#AFBAC7', Z = 2.3263, ESK = 2.6652;
  var BASES = { forward: '→ Forward-looking', historical: '◷ Historical' }, BSHORT = { forward: '→ Fwd', historical: '◷ Hist' };
  var BREAK = [['category', 'Category'], ['assetClass', 'Asset class'], ['product', 'Product'], ['factor', 'Factor'], ['matrix', 'Category × factor']];
  var SOURCE = { stated: 'on their stated benchmark', categoryIndex: 'on their category’s index', override: 'on a benchmark chosen here', index: 'an index itself', fitted: 'on a fitted index', none: 'with no benchmark' };
  var WORDS = ['no', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten', 'eleven', 'twelve'];
  var word = function (n) { return WORDS[n] || String(n); };

  var conv = function () { return CH.conventionsOf(S.ws); };
  var wsOpt = function (key) { var c = conv(); return ['workspace', 'Workspace default (' + CH.LABELS[key][c[key]] + ')']; };
  function methodOf(s) { var c = conv(), w = function (v, k) { return !v || v === 'workspace' ? c[k] : v; }; var m = { model: w(s.model, 'attributionModel'), interaction: w(s.interaction, 'interaction'), returns: s.returnMethod, linking: w(s.linking, 'linking'), currency: w(s.currency, 'currency'), unallocated: w(s.unallocated, 'unallocated'), order: c.order, implementation: c.implementation }; if (m.currency === 'separate') m.currency = 'none'; return m; }
  function viewOf(card) { var v = card.settings && card.settings.view; v = OLD_VIEW[v] || v; return VIEWS.some(function (x) { return x[0] === v; }) ? v : 'summary'; }
  function breakOf(s) { return BREAK.some(function (o) { return o[0] === s.decompose; }) ? s.decompose : 'category'; }
  function byOf(s) { var d = breakOf(s); return d === 'factor' || d === 'matrix' ? 'category' : d; }
  var byWord = function (by, n) { return by === 'assetClass' ? (n === 1 ? 'asset class' : 'asset classes') : by === 'product' ? (n === 1 ? 'product' : 'products') : (n === 1 ? 'category' : 'categories'); };
  var byHead = function (by) { return by === 'assetClass' ? 'Asset class' : by === 'product' ? 'Product' : 'Category'; };
  function seriesOf(data, a) { return a ? data.series.filter(function (x) { return x.allocationId === a.id; })[0] : null; }
  function basesOf(s) { return s.basis === 'forward' ? ['forward'] : s.basis === 'historical' ? ['historical'] : ['forward', 'historical']; }
  function oneBasis(card, s) { if (s.basis !== 'both') return s.basis; var b = (C.state[card.id] || {}).basis; return b === 'historical' ? 'historical' : 'forward'; }
  var live = function (y) { return !!(y && !y.reason && y.steps); };
  var span = function (y) { return y && y.months && y.months.length ? y.months[0].slice(0, 4) + '–' + y.months[y.months.length - 1].slice(0, 4) : ''; };
  /* coloured only when the value does not round to zero */
  var sgn = function (v, dp) { if (v == null || !isFinite(v)) return '<span class="faint">—</span>'; var d = dp == null ? 2 : dp, thr = 0.5 * Math.pow(10, -d); return '<span class="' + (v >= thr ? 'pos' : v <= -thr ? 'neg' : '') + '">' + F.signed(v, d) + '</span>'; };
  var num = function (v, dp) { return v == null || !isFinite(v) ? '<span class="faint">—</span>' : F.num(v, dp == null ? 2 : dp); };
  var mag = function (v, dp) { return F.num(Math.abs(v), dp == null ? 2 : dp); };
  var joinAnd = function (a) { return a.length < 2 ? a.join('') : a.slice(0, -1).join(', ') + ' and ' + a[a.length - 1]; };
  var sq = function (id) { return '<i class="ch-sq" style="background:' + inkOf(id) + '"></i>'; };
  var def = function (o) { return UI.defAttr ? UI.defAttr(o) : ''; };
  function dbar(v, max, color) { var w = max > 0 ? Math.min(Math.abs(v) / max, 1) * 50 : 0; return '<span class="act-track" aria-hidden="true"><span class="act-zero"></span><i style="left:' + (v >= 0 ? 50 : 50 - w) + '%;width:' + w + '%;background:' + (color || 'var(--cat-1)') + '"></i></span>'; }
  var empty = function (html) { return '<div class="chart-empty">' + html + '</div>'; };
  function groupLabel(key, by) {
    if (key === '__residual') return 'Unallocated'; if (key === '__drift') return 'Rebalancing and drift';
    if (by === 'assetClass') { var ac = D.assetClassById[key]; return ac ? ac.name : key; }
    if (key.indexOf('|') > 0) { var p = key.split('|'), ins = D.instrumentById[p[0]]; return ins ? ins.name : key; }
    var c = D.categoryById[key]; return c ? c.short : key;
  }
  function groupColor(key, by) { if (by === 'assetClass') { var ac = D.assetClassById[key], c0 = ac && D.categoryById[ac.category]; return c0 ? c0.color : '#c3cedb'; } var c = D.categoryById[key.indexOf('|') > 0 ? key.split('|')[1] : key]; return c ? c.color : '#c3cedb'; }
  /** The decision a view shows, or every decision as one. */
  function pickStep(x, b, s) {
    var y = x[b]; if (!live(y)) return null;
    if (s.step === 'policyToPortfolio') { var w = x.whole && x.whole[b]; return w ? { step: w.step, risk: w.risk, te: w.te, whole: true } : null; }
    var i = 0; y.steps.forEach(function (st, k) { if (st.meta.id === s.step || (s.step === 'mapping' && /^(weight|benchmarkFirst)$/.test(st.meta.id) && !i)) i = k; });
    if (s.step === 'mapping' && !y.steps.some(function (st) { return st.meta.id === 'mapping'; })) { var j = -1; y.steps.forEach(function (st, k) { if (j < 0 && /^(weight|benchmarkFirst)$/.test(st.meta.id)) j = k; }); if (j >= 0) i = j; }
    return { step: y.steps[i], risk: y.risk ? y.risk.steps[i] : null, index: i };
  }
  function linkingOf(x, s) { var h = x && x.historical; var m = methodOf(s); return m.returns === 'geometric' ? 'geometric' : h && h.linking ? h.linking : m.linking; }
  /** Portfolio less policy benchmark on a basis: the sum the decisions come to. */
  function activeOf(y, s) { var lv = y.levelReturns, a = lv[0], z = lv[lv.length - 1]; return s.returnMethod === 'geometric' ? ((1 + z / 100) / (1 + a / 100) - 1) * 100 : z - a; }
  /** The checks of the bases on screen, the ones that do not tie first. */
  function checksOf(x, s) { var bs = basesOf(s), list = ((x.ties && x.ties.list) || []).filter(function (t) { return bs.indexOf(t.basis) >= 0; }); return { list: list, off: list.filter(function (t) { return !t.within; }) }; }

  /* ── controls inside the card ────────────────────────────────────── */
  function seg(attr, list, cur, label) { return '<div class="act-by ch-seg" role="group" aria-label="' + esc(label) + '"><span>' + esc(label) + '</span>' + list.map(function (o) { return '<button type="button" data-' + attr + '="' + o[0] + '" aria-pressed="' + (o[0] === cur) + '">' + esc(o[1]) + '</button>'; }).join('') + '</div>'; }
  /** The decisions as chips, each carrying what it adds or costs. */
  function decisionChips(x, s, b) {
    var y = live(x[b]) ? x[b] : live(x.forward) ? x.forward : x.historical, cur = pickStep(x, b, s), on = s.step === 'policyToPortfolio' ? 'policyToPortfolio' : cur ? cur.step.meta.id : null;
    var chips = (live(y) ? y.steps : []).map(function (st) { return '<button type="button" class="ch-chip" data-ch-step="' + st.meta.id + '" aria-pressed="' + (st.meta.id === on) + '" data-tip="' + esc(st.meta.versus) + '">' + sq(st.meta.id) + '<span>' + esc(st.meta.short) + '</span><span class="v">' + F.signed(st.total, 2) + '</span></button>'; });
    chips.push('<button type="button" class="ch-chip is-quiet" data-ch-step="policyToPortfolio" aria-pressed="' + (on === 'policyToPortfolio') + '" data-tip="' + esc(CH.DECISIONS.policyToPortfolio.versus) + '"><span>All decisions</span>' + (live(y) ? '<span class="v">' + F.signed(activeOf(y, s), 2) + '</span>' : '') + '</button>');
    return '<div class="ch-chips" role="group" aria-label="Decision">' + chips.join('') + '</div>';
  }
  function basisChips(card, s) { if (s.basis !== 'both') return ''; var b = oneBasis(card, s); return seg('ch-basis', [['forward', BSHORT.forward], ['historical', BSHORT.historical]], b, 'Basis'); }

  /* ── Summary ─────────────────────────────────────────────────────── */
  function riskUnitsLabel(u) { return u === 'share' ? 'share of tracking error, %' : u === 'var99' ? '99% value at risk, 1 year, %' : u === 'es99' ? '99% expected shortfall, 1 year, %' : 'tracking error, % a year'; }
  /** Each decision's risk in the chosen units: its contribution to the whole, or taken alone and closed by what offsets between them. */
  function riskParts(y, s) {
    var r = y.risk, u = s.riskUnits, alone = s.stepRisk === 'standalone', vr = r.var || {}, meth = vr.method, tailU = u === 'var99' || u === 'es99', comp = function (i, kind) { var v = vr.steps && vr.steps[i]; return v ? v[kind][u === 'var99' ? 'var99' : 'es99'] : null; };
    var k = u === 'var99' ? Z : u === 'es99' ? ESK : 1, scale = function (te) { return u === 'share' ? (r.total > 0 ? te / r.total * 100 : 0) : te * k; };
    var tail = tailU && (!meth || meth === 'parametric' || vr.fallback);
    var steps = r.steps.map(function (st, i) { return { value: alone ? (tailU && !tail ? comp(i, 'standalone') : scale(st.standalone)) : (tailU && !tail ? comp(i, 'component') : scale(st.contribution)), alone: scale(st.standalone), share: r.total > 0 ? st.contribution / r.total * 100 : 0 }; });
    var totalV = tailU ? (vr.total ? vr.total[u === 'var99' ? 'var99' : 'es99'] : null) : scale(r.total), extra = [];
    if (alone) extra.push({ label: 'Offsetting between decisions', value: (tail ? totalV + r.muTotal : totalV) - U.sum(steps, function (q) { return q.value || 0; }), tip: 'Closes the gap between the decisions taken alone and the whole: negative when they offset one another, positive when they reinforce' });
    if (tail) extra.push({ label: 'Less expected active return', value: -r.muTotal, tip: 'The expected active return of all decisions, subtracted once' });
    return { steps: steps, extra: extra, total: totalV, dp: u === 'share' ? 0 : 2, unit: u === 'share' ? '%' : '' };
  }
  /** "SAA adds 0.21 and Manager/Product benchmark 0.07; Manager/Product costs 0.60." */
  function effects(steps, past) {
    var up = steps.filter(function (st) { return st.total >= 0.005; }), down = steps.filter(function (st) { return st.total <= -0.005; }), flat = steps.filter(function (st) { return Math.abs(st.total) < 0.005; });
    var say = function (arr, verb) { return joinAnd(arr.map(function (st, i) { return esc(st.meta.short) + (i ? ' ' : ' ' + verb + ' ') + mag(st.total); })); }, out = [];
    if (up.length) out.push(say(up, past ? 'added' : 'adds'));
    if (down.length) out.push(say(down, past ? 'cost' : 'costs'));
    if (flat.length) out.push(joinAnd(flat.map(function (st) { return esc(st.meta.short); })) + (past ? ' made' : flat.length > 1 ? ' make' : ' makes') + ' no difference');
    return out.join('; ') + '.';
  }
  function lead(steps, active) { var top = null; steps.forEach(function (st) { if (active && st.total / active > 0 && (!top || Math.abs(st.total) > Math.abs(top.total))) top = st; }); if (!top || Math.abs(active) < 0.05) return ''; var f = top.total / active; return f >= 0.85 ? ', almost all of it from ' + esc(top.meta.short) : f >= 0.5 ? ', most of it from ' + esc(top.meta.short) : ''; }
  function gap(v) { return Math.abs(v) < 0.005 ? '<b>the same</b> as' : '<b class="' + (v > 0 ? 'pos' : 'neg') + '">' + mag(v) + '% a year ' + (v > 0 ? 'more' : 'less') + '</b> than'; }
  function sentence(x, s, wa) {
    var f = live(x.forward) ? x.forward : null, h = live(x.historical) ? x.historical : null, out = [], name = esc(wa.name);
    if (f) out.push((x.scenarioApplied ? 'Under the scenario, ' : 'Looking forward, ') + name + ' is expected to return ' + gap(activeOf(f, s)) + ' its policy benchmark' + (f.risk ? ', for ' + F.num(f.risk.total, 2) + '% of tracking error' : '') + '. ' + effects(f.steps));
    if (h) { var a = activeOf(h, s), yr = span(h).slice(0, 4); out.push(f ? 'Since ' + yr + ' the gap has been ' + (Math.abs(a) < 0.005 ? 'nil' : mag(a) + '% a year ' + (a > 0 ? 'ahead' : 'behind')) + lead(h.steps, a) + '.' : 'Since ' + yr + ', ' + name + ' has returned ' + gap(a) + ' its policy benchmark' + (h.risk ? ', for ' + F.num(h.risk.total, 2) + '% of tracking error' : '') + '. ' + effects(h.steps, true)); }
    if (h && h.risk) h.risk.steps.forEach(function (r, i) { if (r.te > 0 && Math.abs(r.drift || 0) > 0.25 * r.te) out.push('Rebalancing and drift carries ' + mag(r.drift) + ' of the ' + F.num(r.te, 2) + ' of historical risk in ' + esc(h.steps[i].meta.short) + '; it is not a decision.'); });
    var off = checksOf(x, s).off.length; if (off) out.push(off === 1 ? 'One check does not tie.' : U.cap(word(off)) + ' checks do not tie.');
    return '<p class="ch-say">' + out.join(' ') + '</p>';
  }
  /** The four portfolios in a line, with what each decision adds or costs between them. */
  function strip(x, s, b) {
    var y = x[b], lv = y.levelReturns, hl = y.headline || [], levels = x.levels.filter(function (l) { return l.holdings; }), inLine = (!x.order || x.order === 'default') && y.steps.length === levels.length - 1;
    var tile = function (l, i, end) { var q = hl[i] || {}; return '<div class="ch-lvl' + (end ? ' is-end' : '') + '" role="listitem"><span class="n">' + esc(l.short) + (l.id === 'saa' && !x.saaSet ? ' <span class="tag tag-warn">Not set</span>' : '') + '</span><span class="w">' + esc(l.label) + '</span><span class="r">' + num(lv[i], 2) + '</span><span class="x">' + (q.risk == null ? '' : 'vol ' + F.num(q.risk, 2) + (q.sharpe == null ? '' : ' · Sharpe ' + F.num(q.sharpe, 2))) + '</span></div>'; };
    var dec = function (st) { return '<button type="button" class="ch-dec" data-ch-open="' + st.meta.id + '" role="listitem" data-tip="' + esc(st.meta.short + ': ' + st.meta.versus + '. Select to break it down') + '">' + sq(st.meta.id) + (inLine ? '' : '<span class="d">' + esc(st.meta.short) + '</span>') + '<span class="e">' + sgn(st.total) + '</span></button>'; };
    var cells = [];
    if (inLine) levels.forEach(function (l, i) { cells.push(tile(l, i, i === levels.length - 1)); if (i < y.steps.length) cells.push(dec(y.steps[i])); });
    else { cells.push(tile(levels[0], 0)); y.steps.forEach(function (st) { cells.push(dec(st)); }); cells.push(tile(levels[levels.length - 1], levels.length - 1, true)); }
    return '<div class="ch-strip-cap">' + esc(BASES[b]) + (b === 'historical' ? ' · ' + esc(span(y)) : '') + ' · return, % a year</div><div class="ch-strip' + (inLine ? '' : ' is-loose') + '" role="list" aria-label="From the policy benchmark to the portfolio">' + cells.join('') + '</div>';
  }
  /** The decisions as rows: what each adds to return and how much of the active risk it carries, on each basis. */
  function decisionsTable(x, s, bases) {
    var ok = bases.filter(function (b) { return live(x[b]); }), first = x[ok[0]], both = s.stepRisk === 'both', n = both ? 5 : 4;
    var parts = {}, maxR = 0.01, maxK = 0.01; ok.forEach(function (b) { var y = x[b]; y.steps.forEach(function (st) { maxR = Math.max(maxR, Math.abs(st.total)); }); if (y.risk) { parts[b] = riskParts(y, s); maxK = Math.max(maxK, Math.abs(parts[b].total || 0)); } });
    var riskHead = function (b) { var p = parts[b], u = s.riskUnits; return p ? (u === 'te' ? 'Share of active risk<small>of ' + F.num(p.total, 2) + ' tracking error</small>' : u === 'share' ? 'Share of active risk<small>% of tracking error</small>' : (u === 'var99' ? '99% VaR' : '99% expected shortfall') + '<small>1 year, %</small>') : 'Active risk'; };
    var head = '<tr><th scope="col" rowspan="2">Decision</th>' + ok.map(function (b) { return '<th scope="colgroup" colspan="' + n + '" class="grp-start ch-grp">' + esc(BASES[b]) + (b === 'historical' ? ' · ' + esc(span(x[b])) : x.scenarioApplied ? ' · scenario' : '') + '</th>'; }).join('') + '<th rowspan="2" class="ch-go"></th></tr><tr>' + ok.map(function (b) {
      return '<th scope="col" colspan="2" class="num grp-start"' + def({ title: 'Return effect', what: 'What the decision adds to return or takes from it: the portfolio it arrives at less the one before.', how: 'The decisions add up to the portfolio less its policy benchmark.' }) + '>Return effect<small>% a year</small></th><th scope="col" colspan="2" class="num"' + def({ title: 'Share of active risk', what: 'The part of the tracking error against the policy benchmark that comes from this decision.', how: 'Each decision’s active return, weighted by how closely it moves with the whole. The parts add up to the tracking error.' }) + '>' + riskHead(b) + '</th>' + (both ? '<th scope="col" class="num"' + def({ title: 'Taken alone', what: 'The tracking error of the decision on its own, as if the others had not been taken.', how: 'These do not add up: decisions that offset one another carry less together than apart.' }) + '>Taken alone</th>' : '');
    }).join('') + '</tr>';
    var riskCell = function (b, i, id) { var p = parts[b]; if (!p) return '<td class="num" colspan="2"><span class="faint">—</span></td>' + (both ? '<td></td>' : ''); var q = p.steps[i], te = s.riskUnits === 'te' && s.stepRisk !== 'standalone'; return '<td class="num">' + num(q.value, p.dp) + p.unit + (te ? '<span class="ch-pct"> · ' + F.num(q.share, 0) + '%</span>' : '') + '</td><td class="bar-col">' + dbar(q.value, maxK, inkOf(id)) + '</td>' + (both ? '<td class="num">' + num(q.alone, p.dp) + p.unit + '</td>' : ''); };
    var rows = first.steps.map(function (st0, i) {
      return '<tr class="is-link" data-ch-open="' + st0.meta.id + '"><th scope="row">' + sq(st0.meta.id) + esc(st0.meta.short) + '<small class="ch-sub">' + esc(st0.meta.versus) + '</small></th>' + ok.map(function (b) { var st = x[b].steps[i]; return st ? '<td class="num grp-start"><b>' + sgn(st.total) + '</b></td><td class="bar-col">' + dbar(st.total, maxR, inkOf(st.meta.id)) + '</td>' + riskCell(b, i, st.meta.id) : '<td class="grp-start" colspan="' + n + '"></td>'; }).join('') + '<td class="ch-go"><button type="button" class="btn btn-icon btn-ghost btn-xs" aria-label="Break down ' + esc(st0.meta.short) + '">' + I.chevron + '</button></td></tr>';
    }).join('');
    var extraN = 0; ok.forEach(function (b) { if (parts[b]) extraN = Math.max(extraN, parts[b].extra.length); });
    for (var e = 0; e < extraN; e++) { var lab = null; ok.forEach(function (b) { var q = parts[b] && parts[b].extra[e]; if (q && !lab) lab = q; }); rows += '<tr class="ch-extra"><th scope="row" data-tip="' + esc(lab.tip) + '">' + esc(lab.label) + '</th>' + ok.map(function (b) { var q = parts[b] && parts[b].extra[e]; return '<td class="grp-start" colspan="2"></td><td class="num">' + (q ? sgn(q.value, parts[b].dp) : '') + '</td><td></td>' + (both ? '<td></td>' : ''); }).join('') + '<td></td></tr>'; }
    var all = CH.DECISIONS.policyToPortfolio;
    rows += '<tr class="total is-link" data-ch-open="policyToPortfolio"><th scope="row">' + esc(all.short) + '<small class="ch-sub">' + esc(all.versus) + '</small></th>' + ok.map(function (b) { var p = parts[b]; return '<td class="num grp-start">' + sgn(activeOf(x[b], s)) + '</td><td></td><td class="num">' + (p ? num(p.total, p.dp) + p.unit : '<span class="faint">—</span>') + '</td><td></td>' + (both ? '<td></td>' : ''); }).join('') + '<td class="ch-go"><button type="button" class="btn btn-icon btn-ghost btn-xs" aria-label="Break down all decisions">' + I.chevron + '</button></td></tr>';
    return '<div class="tblwrap"><table class="tbl ch-tbl ch-decisions"><caption class="sr-only">The decisions, in return and in risk</caption><thead>' + head + '</thead><tbody>' + rows + '</tbody></table></div>';
  }
  /** One paragraph on how the risk column adds up, with the two ways further in. */
  function riskNote(x, s, b, st) {
    var y = x[b], r = y && y.risk, out = '';
    if (r && s.stepRisk !== 'standalone' && (s.riskUnits === 'te' || s.riskUnits === 'share')) { var alone = r.steps.map(function (q) { return F.num(q.standalone, 2); }), sum = U.sum(r.steps, function (q) { return q.standalone; }); out = 'Risk is each decision’s contribution to tracking error against the policy benchmark, so the ' + word(r.steps.length) + ' add up. Taken alone they carry ' + joinAnd(alone) + ', which is ' + (sum > r.total + 0.005 ? 'more than ' + F.num(r.total, 2) + ' because the decisions partly offset one another' : sum < r.total - 0.005 ? 'less than ' + F.num(r.total, 2) + ' because the decisions reinforce one another' : 'the same') + '. '; }
    return '<p class="ch-note">' + out + (r ? '<button type="button" class="btn-link" data-ch-alone>' + (s.stepRisk === 'both' ? 'Hide stand-alone risk' : 'Show stand-alone risk') + '</button> · ' : '') + '<button type="button" class="btn-link" data-ch-levels aria-expanded="' + !!st.levelsOpen + '">' + (st.levelsOpen ? 'Hide the full comparison' : 'Compare the ' + word(x.levels.filter(function (l) { return l.holdings; }).length) + ' portfolios in full') + '</button></p>';
  }
  var MEASURES = [['totalReturn', 'Total return', 2], ['excessReturn', 'Excess return over cash', 2], ['risk', 'Risk (volatility)', 2], ['step', 'Return effect of the decision', 2], ['trackingError', 'Tracking error to the one before', 2], ['sharpe', 'Sharpe ratio', 2], ['informationRatio', 'Information ratio of the decision', 2], ['var99', '99% VaR, 1 year', 1]];
  function levelValue(y, i, key) { var hl = y.headline[i]; if (!hl) return null; if (key === 'step') return i ? y.steps[i - 1].total : null; if (key === 'var99') return hl.var99 ? hl.var99.y1 : null; return hl[key]; }
  /** Every headline measure of the four portfolios: as they are, or as differences from one of them. */
  function levelsHtml(x, s, card, bases) {
    var st = C.state[card.id] || {}, mode = st.levelsView === 'focus' ? 'focus' : 'table', levels = x.levels.filter(function (l) { return l.holdings; });
    var fid = levels.some(function (l) { return l.id === st.levelFocus; }) ? st.levelFocus : levels[levels.length - 1].id, fi = levels.map(function (l) { return l.id; }).indexOf(fid);
    var tools = '<div class="ch-tools">' + seg('ch-lview', [['table', 'As they are'], ['focus', 'As differences']], mode, 'Show') + (mode === 'focus' ? seg('ch-lfocus', levels.map(function (l) { return [l.id, l.short]; }), fid, 'From') : '') + '</div>';
    var head1 = '<tr><th scope="col" rowspan="' + (bases.length > 1 ? 2 : 1) + '">Measure</th>' + levels.map(function (l, i) { return '<th scope="colgroup" colspan="' + bases.length + '" class="grp-start' + (mode === 'focus' && i === fi ? ' is-focus' : '') + '">' + esc(l.short) + '<small class="ch-sub">' + esc(mode === 'focus' && i !== fi ? 'less ' + levels[fi].short : l.label) + '</small></th>'; }).join('') + '</tr>';
    var head2 = bases.length > 1 ? '<tr>' + levels.map(function () { return bases.map(function (b, j) { return '<th scope="col" class="num' + (j === 0 ? ' grp-start' : '') + '">' + BSHORT[b] + '</th>'; }).join(''); }).join('') + '</tr>' : '';
    var body = MEASURES.map(function (m) {
      return '<tr><th scope="row">' + esc(m[1]) + '</th>' + levels.map(function (l, i) { return bases.map(function (b, j) { var y = x[b], cls = 'num' + (j === 0 ? ' grp-start' : ''); if (!live(y)) return '<td class="' + cls + '"><span class="faint">—</span></td>'; var v = levelValue(y, i, m[0]); if (mode === 'focus' && i !== fi) { var f = levelValue(y, fi, m[0]); return '<td class="' + cls + '">' + (v == null || f == null ? '<span class="faint">—</span>' : sgn(v - f, m[2])) + '</td>'; } return '<td class="' + cls + '">' + (m[0] === 'step' ? sgn(v, m[2]) : num(v, m[2])) + '</td>'; }).join(''); }).join('') + '</tr>';
    }).join('');
    return '<section class="ch-levels" aria-label="The portfolios in full">' + tools + '<div class="tblwrap"><table class="tbl ch-tbl ch-levels-tbl"><thead>' + head1 + head2 + '</thead><tbody>' + body + '</tbody></table></div></section>';
  }
  function summaryHtml(x, s, card, wa, bases) {
    var st = C.state[card.id] || {}, ok = bases.filter(function (b) { return live(x[b]); });
    if (!ok.length) { var y0 = x[bases[0]]; return empty(esc((y0 && y0.reason) || 'Not calculated for this basis.')); }
    var missing = bases.filter(function (b) { return ok.indexOf(b) < 0 && x[b] && x[b].reason; }).map(function (b) { return '<p class="ch-note">' + esc(BASES[b]) + ': ' + esc(x[b].reason) + '.</p>'; }).join('');
    return sentence(x, s, wa) + strip(x, s, ok[0]) + (x.saaSet || wa.kind === 'level' ? '' : '<p class="ch-note"><b>No SAA has been set</b>, so the long-term mix is taken to be today’s category weights. ' + esc(CH.DECISIONS.saa.short) + ' then measures those weights against the policy benchmark. <button type="button" class="btn-link" data-ch-setup="saa">Set the SAA</button></p>') +
      decisionsTable(x, s, bases) + missing + riskNote(x, s, ok[0], st) + (st.levelsOpen ? levelsHtml(x, s, card, ok) : '');
  }

  /* ── Breakdown: one decision, in return and in risk on the same rows ── */
  var dash = '<span class="faint">—</span>';
  var driftWhy = function (st) { return st.driftLabel === 'Compounding and rebalancing' ? 'Annualised returns at today’s weights do not compound to the realised figure.' : 'The difference between the portfolio as it was rebalanced each quarter and today’s weights held constant.'; };
  var openOf = function (card) { return (C.state[card.id] || {}).open || {}; };
  /** A risk figure in the units the card shows: tracking error, its share, or the parametric tail. */
  function riskIn(r, s) {
    var u = s.riskUnits, tail = u === 'var99' || u === 'es99', k = u === 'var99' ? Z : u === 'es99' ? ESK : 1, share = u === 'share';
    return { share: share, tail: tail, dp: share ? 0 : 2, zero: share ? 0.5 : 0.005, val: function (e) { return e == null ? null : share ? (r.te > 0 ? e / r.te * 100 : 0) : e * k; }, total: share ? 100 : tail ? r.te * k - (r.mu || 0) : r.te,
      head: share ? 'Share' : u === 'var99' ? '99% VaR' : u === 'es99' ? '99% shortfall' : 'Contribution', sub: share ? '% of its tracking error' : tail ? '1 year, %, parametric' : 'to its ' + F.num(r.te, 2) + ' tracking error' };
  }
  /** A table from column descriptors, with a row of group headings above when any column names a group. */
  function grid(first, cols, rowsHtml, cls, caption) {
    var grouped = cols.some(function (c) { return c.group; }), top = '', i = 0;
    while (grouped && i < cols.length) { var g = cols[i].group || '', n = 1; while (i + n < cols.length && (cols[i + n].group || '') === g) n++; top += '<th scope="colgroup" colspan="' + n + '" class="ch-grp' + (g ? ' grp-start' : '') + '">' + g + '</th>'; i += n; }
    var heads = cols.map(function (c, j) { return '<th scope="col" class="' + (c.bar ? 'bar-col' : 'num') + (starts(cols, j) ? ' grp-start' : '') + '"' + (c.def ? def(c.def) : c.tip ? ' data-tip="' + esc(c.tip) + '"' : '') + '>' + (c.head || '') + '</th>'; }).join('');
    return '<div class="tblwrap"><table class="tbl ch-tbl ' + cls + '"><caption class="sr-only">' + esc(caption) + '</caption><thead>' + (grouped ? '<tr><th scope="col" rowspan="2">' + first + '</th>' + top + '</tr><tr>' + heads + '</tr>' : '<tr><th scope="col">' + first + '</th>' + heads + '</tr>') + '</thead><tbody>' + rowsHtml + '</tbody></table></div>';
  }
  var starts = function (cols, j) { return !!cols[j].group && (!j || cols[j - 1].group !== cols[j].group); };
  /** The cells of one row: every column for a data row, or only the columns that total or sum for the others. */
  var cellsOf = function (cols, r, kind) { return cols.map(function (c, j) { var fn = kind ? c[kind] : c.cell, v = fn ? fn(r) : ''; return '<td class="' + (c.bar ? 'bar-col' : 'num') + (starts(cols, j) ? ' grp-start' : '') + '">' + (v == null ? '' : v) + '</td>'; }).join(''); };
  var foldBtn = function (id, on, label) { return '<button type="button" class="btn-link ch-foldbtn" data-ch-fold="' + id + '" aria-expanded="' + !!on + '">' + (on ? '▾ ' : '▸ ') + label + '</button>'; };
  /** The line of arithmetic behind the largest row, shown only when it reproduces the figure on screen. */
  function worked(q, kind, upper, model) {
    if (!q || q.wFrom == null || q.rFrom == null) return null;
    var dw = q.wTo - q.wFrom, tries = kind === 'allocation' ? [[dw / 100 * (q.rFrom - upper), '(' + F.num(q.wTo, 1) + ' − ' + F.num(q.wFrom, 1) + ')% × (' + F.num(q.rFrom, 2) + ' − ' + F.num(upper, 2) + ')', model === 'bf'], [dw / 100 * q.rFrom, '(' + F.num(q.wTo, 1) + ' − ' + F.num(q.wFrom, 1) + ')% × ' + F.num(q.rFrom, 2), model !== 'bf']]
      : [[q.wFrom / 100 * (q.rTo - q.rFrom), F.num(q.wFrom, 1) + '% × (' + F.num(q.rTo, 2) + ' − ' + F.num(q.rFrom, 2) + ')', true], [q.wTo / 100 * (q.rTo - q.rFrom), F.num(q.wTo, 1) + '% × (' + F.num(q.rTo, 2) + ' − ' + F.num(q.rFrom, 2) + ')', true]];
    var hit = tries.filter(function (t) { return t[2] && upper != null && isFinite(t[0]) && Math.abs(t[0] - q[kind]) < 0.006; })[0];
    return hit ? (q.short || q.label) + ': ' + hit[1] + ' = ' + F.signed(q[kind], 2) : null;
  }
  /**
   * One decision by category, asset class or product. Weights and returns on the left, what they did to
   * return in the middle, and the same rows' share of the decision's risk on the right.
   */
  function effectTable(sel, s, by, card, o) {
    o = o || {};
    var st = sel.step, r = sel.risk, m = methodOf(s), sep = m.interaction === 'separate', open = openOf(card), ru = r ? riskIn(r, s) : null, compact = !!o.compact;
    var rk = {}; if (r) r.byGroup.forEach(function (g) { rk[g.key] = g; });
    var rows = st.byGroup.map(function (q) { var only = / \(upper level only\)$/.test(q.label || ''); return Object.assign({}, q, { risk: rk[q.key] || null, label: only ? q.label.replace(/ \(upper level only\)$/, '') : q.label, sub: q.sub || (only ? 'held only in the ' + st.meta.from : '') }); });
    var seen = {}; rows.forEach(function (q) { seen[q.key] = 1; });
    var only = r ? r.byGroup.filter(function (g) { return !seen[g.key] && g.key !== '__drift' && Math.abs(g.euler) > 5e-4; }) : [];
    rows.sort(function (a, b) { return (a.key === '__residual') - (b.key === '__residual') || Math.abs(b.total) - Math.abs(a.total); });
    var brin = rows.some(function (q) { return q.allocation != null; }), fx = m.currency === 'fxFactor' && st.matrix && !compact;
    var same = function (a, b, tol) { return a == null || b == null || Math.abs(a - b) < tol; };
    var oneW = rows.every(function (q) { return same(q.wFrom, q.wTo, 0.05); }), oneR = rows.every(function (q) { return same(q.rFrom, q.rTo, 0.005); });
    var maxT = Math.max.apply(null, rows.map(function (q) { return Math.abs(q.total); }).concat([0.01]));
    var maxK = ru ? Math.max.apply(null, r.byGroup.map(function (g) { return Math.abs(ru.val(g.euler)); }).concat([0.01])) : 1;
    var riskV = function (q) { return q && q.risk ? sgn(ru.val(q.risk.euler), ru.dp) + (ru.share ? '%' : '') : ''; };
    var cols = [], add = function (group, head, cell, more) { cols.push(Object.assign({ group: group, head: head, cell: cell }, more || {})); };
    if (!compact) {
      if (oneW) add('', 'Weight<small>%</small>', function (q) { return num(q.wTo != null ? q.wTo : q.wFrom, 1); });
      else { add('Weight, %', esc(st.meta.from), function (q) { return num(q.wFrom, 1); }); add('Weight, %', esc(st.meta.to), function (q) { return num(q.wTo, 1); }); }
      if (oneR) add('', 'Return<small>% a year</small>', function (q) { return num(q.rTo != null ? q.rTo : q.rFrom, 2); });
      else { add('Return, % a year', esc(st.meta.from), function (q) { return num(q.rFrom, 2); }); add('Return, % a year', esc(st.meta.to), function (q) { return num(q.rTo, 2); }); }
    }
    var E = compact ? '' : 'Effect on return, % a year', top = rows.filter(function (q) { return q.allocation != null; })[0], sumOf = function (k) { return F.signed(U.sum(rows, function (q) { return q[k] || 0; }), 2); };
    if (brin) {
      add(E, 'From weights<small>allocation effect</small>', function (q) { return q.allocation == null ? '' : sgn(q.allocation); }, { total: function () { return sumOf('allocation'); }, def: { title: 'From weights (allocation effect)', what: 'What holding more or less of each ' + byWord(by, 1) + ' than the ' + st.meta.from + ' did to return.', worked: o.worked ? worked(top, 'allocation', o.upper, m.model) : null, how: m.model === 'bf' ? 'Difference in weight × (the ' + byWord(by, 1) + '’s return less the whole portfolio’s return). Brinson–Fachler.' : 'Difference in weight × the ' + byWord(by, 1) + '’s return. Brinson–Hood–Beebower.' } });
      add(E, 'From returns<small>selection effect</small>', function (q) { return q.selection == null ? '' : sgn(q.selection + (sep && compact ? (q.interaction || 0) : 0)); }, { total: function () { return F.signed(U.sum(rows, function (q) { return (q.selection || 0) + (sep && compact ? (q.interaction || 0) : 0); }), 2); }, def: { title: 'From returns (selection effect)', what: 'What earning a different return inside each ' + byWord(by, 1) + ' did to the total.', worked: o.worked ? worked(top, 'selection', o.upper, m.model) : null, how: 'Weight × (the return after the decision less the return before it)' + (sep ? '.' : ', with the interaction of the two folded in as the workspace conventions say.') } });
      if (sep && !compact) add(E, 'Interaction', function (q) { return q.interaction == null ? '' : sgn(q.interaction); }, { total: function () { return sumOf('interaction'); }, tip: 'Difference in weight × difference in return: the part that belongs to neither alone' });
    }
    if (fx) add(E, 'of which FX', function (q) { var c = st.matrix.cells[q.key], v = c && c.factors ? c.factors.fx : null; return v == null ? '' : sgn(v); }, { tip: 'Memo: the part of the total explained by the currency factor' });
    add(E, brin || compact ? 'Total' : 'Effect<small>% a year</small>', function (q) { return '<b>' + sgn(q.total) + '</b>'; }, { total: function () { return F.signed(st.total, 2); }, agg: function (q) { return q.total == null ? (q.less ? '' : '<span class="faint" data-tip="Their effect on return is already in the rows above">—</span>') : sgn(q.total); } });
    add(E, '', function (q) { return dbar(q.total, maxT, q.color); }, { bar: true });
    if (ru) {
      var xsr = s.columns === 'xsr' && !compact, ok = function (g) { return g && g.activeWeight != null && Math.abs(g.activeWeight) >= 0.05 && g.sigma != null; }, G = compact ? '' : 'Risk';
      if (xsr) { add(G, 'Active weight', function (q) { return q.risk && q.risk.activeWeight != null ? sgn(q.risk.activeWeight, 1) : ''; }, { tip: 'Net active weight of the position, percentage points' }); add(G, 'Volatility', function (q) { return ok(q.risk) ? num(q.risk.sigma / Math.abs(q.risk.activeWeight) * 100, 1) : dash; }, { tip: 'Volatility of the position’s return per unit of active weight, % a year' }); add(G, 'Correlation', function (q) { return ok(q.risk) && q.risk.rho != null ? num(q.risk.rho * (q.risk.activeWeight < 0 ? -1 : 1), 2) : dash; }, { tip: 'Correlation of the position with the decision’s active return' }); }
      add(G, (compact ? 'Risk' : ru.head) + '<small>' + esc(compact ? 'of ' + F.num(ru.total, ru.dp) : ru.sub) + '</small>', function (q) { return q.risk ? riskV(q) : dash; }, { total: function () { return num(ru.total, ru.dp) + (ru.share ? '%' : ''); }, agg: function (q) { return q.less ? sgn(-(r.mu || 0)) : riskV(q); }, def: { title: 'Risk of the decision', what: 'How much of the decision’s own tracking error comes from each row. The rows add up to it.', how: 'Each row’s active position, weighted by how closely it moves with the decision as a whole. A negative figure offsets the rest.' } });
      add(G, '', function (q) { return q.risk ? dbar(ru.val(q.risk.euler), maxK, q.color) : ''; }, { bar: true, agg: function (q) { return q.risk && q.color ? dbar(ru.val(q.risk.euler), maxK, q.color) : ''; } });
      if (s.columns === 'marginal' && !compact) add(G, 'Marginal', function (q) { return q.risk && q.risk.marginal != null ? num(q.risk.marginal, 3) : dash; }, { tip: 'Change in tracking error per percentage point of active weight, at the position’s mix' });
    }
    var name = function (q) { return '<span class="sw" style="background:' + (q.color || '#c3cedb') + '"></span>' + esc(compact ? q.short || q.label : q.label || q.short) + (q.sub && !compact ? '<small class="ch-sub">' + esc(q.sub) + '</small>' : ''); };
    var tr = function (q, cls) { return '<tr' + (cls ? ' class="' + cls + '"' : '') + '><th scope="row">' + name(q) + '</th>' + cellsOf(cols, q) + '</tr>'; };
    var isZero = function (q) { return q.key !== '__residual' && Math.abs(q.total) < 0.005 && (!ru || !q.risk || Math.abs(ru.val(q.risk.euler)) < ru.zero); };
    var main = rows, zero = [], small = [];
    if (by !== 'product') { zero = rows.filter(isZero); if (zero.length < 2) zero = []; main = rows.filter(function (q) { return zero.indexOf(q) < 0; }); }
    else if (rows.length > 8) { main = rows.slice(0, 6); small = rows.slice(6); }
    var html = main.map(function (q) { return tr(q); }).join('');
    if (zero.length) html += '<tr class="ch-fold"><th scope="row" colspan="' + (cols.length + 1) + '">' + foldBtn('zero', open.zero, word(zero.length) + ' ' + byWord(by, zero.length) + ' with no effect' + (open.zero ? '' : ': ' + esc(zero.map(function (q) { return q.short || q.label; }).join(', ')))) + '</th></tr>' + (open.zero ? zero.map(function (q) { return tr(q, 'ch-in'); }).join('') : '');
    if (small.length) { var lo = Math.min.apply(null, small.map(function (q) { return q.total; })), hi = Math.max.apply(null, small.map(function (q) { return q.total; })); html += '<tr class="ch-fold"><th scope="row">' + foldBtn('small', open.small, small.length + ' more ' + byWord(by, small.length) + ', each between ' + F.signed(lo, 2) + ' and ' + F.signed(hi, 2)) + '</th>' + cellsOf(cols, { total: U.sum(small, function (q) { return q.total; }), risk: ru ? { euler: U.sum(small, function (q) { return q.risk ? q.risk.euler : 0; }) } : null }, 'agg') + '</tr>' + (open.small ? small.map(function (q) { return tr(q, 'ch-in'); }).join('') : ''); }
    if (only.length) html += '<tr class="ch-fold"><th scope="row">' + foldBtn('only', open.only, 'Offsetting benchmark positions, ' + only.length + (only.length === 1 ? ' index' : ' indices')) + '</th>' + cellsOf(cols, { total: null, risk: { euler: U.sum(only, function (g) { return g.euler; }) } }, 'agg') + '</tr>' + (open.only ? only.sort(function (a, b) { return Math.abs(b.euler) - Math.abs(a.euler); }).map(function (g) { return '<tr class="ch-in"><th scope="row"><span class="sw" style="background:' + groupColor(g.key, by) + '"></span>' + esc(groupLabel(g.key, by)) + '</th>' + cellsOf(cols, { total: null, risk: g, color: groupColor(g.key, by) }, 'agg') + '</tr>'; }).join('') : '');
    if (ru && ru.tail) html += '<tr class="ch-extra"><th scope="row">Less its expected active return</th>' + cellsOf(cols, { less: true, total: null }, 'agg') + '</tr>';
    html += '<tr class="total"><th scope="row">' + esc(st.meta.short) + '</th>' + cellsOf(cols, null, 'total') + '</tr>';
    if (Math.abs(st.drift || 0) > 1e-4 || (rk.__drift && Math.abs(rk.__drift.euler) > 5e-4)) html += '<tr class="ch-driftline"><th scope="row">Of which rebalancing and drift <span class="tag">Not a decision</span>' + (compact ? '' : '<small class="ch-sub">' + esc(driftWhy(st)) + '</small>') + '</th>' + cellsOf(cols, { total: st.drift || 0, risk: rk.__drift || null, color: CROSS_INK }, 'agg') + '</tr>';
    return grid(rows.some(function (q) { return q.sub; }) && by === 'product' && !compact ? 'Product<small>and the benchmark it is measured against</small>' : byHead(by), cols, html, 'ch-effects' + (compact ? ' is-compact' : ''), st.meta.short + ' by ' + byWord(by, 1));
  }

  /** One decision by factor: what the factor exposures explain, then what is left to cash and to the products themselves. */
  function factorTable(sel, s, model, by, card, o) {
    o = o || {};
    var st = sel.step, f = st.factor, r = sel.risk, ru = r ? riskIn(r, s) : null, open = openOf(card), compact = !!o.compact, fxRow = methodOf(s).currency === 'fxFactor', pair = o.pair, pm = o.pairModel;
    var big = function (q) { return Math.abs(q.dBeta) >= 0.005 || Math.abs(q.contribution) >= 0.005; };
    var rf = {}; if (r) r.byFactor.forEach(function (q) { rf[q.factorId] = q; });
    var pv = {}; if (pair) pair.byFactor.forEach(function (q) { pv[q.factorId] = q.contribution; });
    var rows = f.byFactor.filter(big).sort(function (a, b) { return Math.abs(b.contribution) - Math.abs(a.contribution); }).map(function (q) { return Object.assign({}, q, { risk: rf[q.factorId] || null, total: q.contribution, color: q.factorId === 'fx' && fxRow ? '#9a5b00' : H.FACTOR_INK }); });
    var small = f.byFactor.filter(function (q) { return !big(q); }), eul = function (list) { return U.sum(list, function (q) { return rf[q.factorId] ? rf[q.factorId].euler : 0; }); };
    var maxT = Math.max.apply(null, rows.map(function (q) { return Math.abs(q.total); }).concat([Math.abs(f.cash || 0), Math.abs(f.specific || 0), 0.01]));
    var maxK = ru ? Math.max.apply(null, r.byFactor.map(function (q) { return Math.abs(ru.val(q.euler)); }).concat([Math.abs(ru.val(r.specific || 0)), 0.01])) : 1;
    var riskV = function (q) { return q && q.risk ? sgn(ru.val(q.risk.euler), ru.dp) + (ru.share ? '%' : '') : ''; };
    var cols = [], add = function (group, head, cell, more) { cols.push(Object.assign({ group: group, head: head, cell: cell }, more || {})); }, top = rows[0];
    var wk = o.worked && top && Math.abs(top.dBeta * top.factorReturn - top.contribution) < 0.006 ? top.label + ': ' + F.signed(top.dBeta, 2) + ' × ' + F.num(top.factorReturn, 2) + ' = ' + F.signed(top.contribution, 2) : null;
    if (!compact) { add('Exposure', esc(st.meta.from), function (q) { return num(q.betaFrom); }); add('Exposure', esc(st.meta.to), function (q) { return num(q.betaTo); }); }
    add(compact ? '' : 'Exposure', 'Difference', function (q) { return sgn(q.dBeta); }, { def: { title: 'Difference in exposure', what: 'How much more or less exposed to the factor the portfolio is after the decision than before it.', how: 'Exposure after less exposure before, in units of the factor (' + model.name + ').' } });
    add('', 'Factor return<small>% a year</small>', function (q) { return num(q.factorReturn); }, { tip: 'The factor’s premium looking forward, or its realised return historically' });
    var E = compact ? '' : 'Effect on return, % a year', G = compact ? '' : 'Risk';
    add(E, compact ? 'Effect' : 'Total', function (q) { return '<b>' + sgn(q.total) + '</b>'; }, { total: function () { return F.signed(st.total, 2); }, agg: function (q) { return q.total == null ? '' : q.bold ? '<b>' + sgn(q.total) + '</b>' : sgn(q.total); }, def: { title: 'Effect of a factor', what: 'What the difference in exposure to the factor did to return.', worked: wk, how: 'Difference in exposure × the factor’s return. Cash and what the factors do not explain follow beneath.' } });
    add(E, '', function (q) { return dbar(q.total, maxT, q.color); }, { bar: true, agg: function (q) { return q.total != null && q.color ? dbar(q.total, maxT, q.color) : ''; } });
    if (pair) add(E, esc(pm.name), function (q) { return pv[q.factorId] == null ? dash : sgn(pv[q.factorId]); }, { tip: 'The same effect under ' + pm.name + ', factor by factor where the two models share one', total: function () { return F.signed(pair.factorTotal + pair.cash + pair.specific, 2); }, agg: function (q) { return q.pair == null ? '' : sgn(q.pair); } });
    if (ru) {
      add(G, (compact ? 'Risk' : ru.head) + '<small>' + esc(compact ? 'of ' + F.num(ru.total, ru.dp) : ru.sub) + '</small>', function (q) { return q.risk ? riskV(q) : dash; }, { total: function () { return num(ru.total, ru.dp) + (ru.share ? '%' : ''); }, agg: function (q) { return q.less ? sgn(-(r.mu || 0)) : riskV(q); } });
      add(G, '', function (q) { return q.risk ? dbar(ru.val(q.risk.euler), maxK, q.color) : ''; }, { bar: true, agg: function (q) { return q.risk && q.color ? dbar(ru.val(q.risk.euler), maxK, q.color) : ''; } });
      if (s.columns === 'marginal' && !compact) add(G, 'Marginal', function (q) { return q.risk && q.risk.marginal != null ? num(q.risk.marginal, 3) : dash; }, { tip: 'Change in tracking error per unit of exposure' });
    }
    var line = function (label, q, cls) { return '<tr' + (cls ? ' class="' + cls + '"' : '') + '><th scope="row">' + label + '</th>' + cellsOf(cols, q, 'agg') + '</tr>'; }, rk = function (e) { return ru ? { euler: e || 0 } : null; };
    var html = line('Explained by factor exposures<small class="ch-sub">' + esc(model.name) + '</small>', { total: f.factorTotal, bold: true, risk: rk(U.sum(r ? r.byFactor : [], function (q) { return q.euler; })), pair: pair ? pair.factorTotal : null }, 'ch-sec');
    html += rows.map(function (q) { return '<tr class="ch-in' + (q.factorId === 'fx' && fxRow ? ' is-fx' : '') + '"><th scope="row">' + esc(q.factorId === 'fx' && fxRow ? 'FX (currency)' : q.label) + '</th>' + cellsOf(cols, q) + '</tr>'; }).join('');
    if (pair) html += pair.byFactor.filter(function (q) { return !rows.some(function (z) { return z.factorId === q.factorId; }) && Math.abs(q.contribution) > 5e-4; }).map(function (q) { return line(esc(q.label) + ' <small>(' + esc(pm.name) + ' only)</small>', { pair: q.contribution }, 'ch-in faint'); }).join('');
    if (small.length) html += line('Other ' + word(small.length) + ' factors, each under 0.005', { total: U.sum(small, function (q) { return q.contribution; }), risk: rk(eul(small)) }, 'ch-in');
    if (Math.abs(f.cash || 0) > 5e-4 || (r && Math.abs(r.cash || 0) > 5e-4)) html += line('Cash<small class="ch-sub">difference in net weight × the cash rate</small>', { total: f.cash, bold: true, risk: rk(r && r.cash), color: CROSS_INK, pair: pair ? pair.cash : null }, 'ch-sec');
    var sm = s.specificBy === 'one' ? null : st.specificMatrix || ((s.specificBy === 'product') === (by === 'product') ? st.matrix : null), sby = s.specificBy === 'product' ? 'product' : 'category';
    var parts = sm ? Object.keys(sm.cells).map(function (g) { return { key: g, v: sm.cells[g].specific }; }).filter(function (q) { return Math.abs(q.v) > 5e-4; }).sort(function (a, b) { return Math.abs(b.v) - Math.abs(a.v); }) : [];
    var specName = st.meta.id === 'selection' ? 'Specific to the managers and products' : 'Not explained by the factors';
    html += line((parts.length && !compact ? foldBtn('spec', open.spec, specName) : specName) + '<small class="ch-sub">specific return' + (parts.length && !compact && !open.spec ? ', ' + parts.length + ' ' + byWord(sby, parts.length) : '') + '</small>', { total: f.specific, bold: true, risk: rk(r && r.specific), color: '#c3cedb', pair: pair ? pair.specific : null }, 'ch-sec' + (parts.length && !compact ? ' ch-fold' : ''));
    if (parts.length && open.spec && !compact) { var shown = U.sum(parts, function (q) { return q.v; }); html += parts.map(function (q) { return line('<span class="sw" style="background:' + groupColor(q.key, sby) + '"></span>' + esc(groupLabel(q.key, sby)), { total: q.v, color: groupColor(q.key, sby) }, 'ch-in'); }).join('') + (Math.abs(f.specific - shown) > 5e-4 ? line('Other', { total: f.specific - shown }, 'ch-in') : ''); }
    if (Math.abs(f.notReconciled || 0) > 1e-4) html += '<tr class="ch-extra" data-tip="' + esc(f.reconcileReason || '') + '"><th scope="row">Not reconciled <span class="tag tag-warn">Check</span></th>' + cellsOf(cols, { total: f.notReconciled, color: '#e0b25c' }, 'agg') + '</tr>';
    if (ru && ru.tail) html += line('Less its expected active return', { less: true, total: null });
    html += '<tr class="total"><th scope="row">' + esc(st.meta.short) + '</th>' + cellsOf(cols, null, 'total') + '</tr>';
    if (Math.abs(f.drift || 0) > 1e-4 || (r && Math.abs(r.drift || 0) > 5e-4)) html += line('Of which rebalancing and drift <span class="tag">Not a decision</span>' + (compact ? '' : '<small class="ch-sub">' + esc(driftWhy(st)) + '</small>'), { total: f.drift || 0, risk: rk(r && r.drift), color: CROSS_INK }, 'ch-driftline');
    return grid('Factor', cols, html, 'ch-factors' + (compact ? ' is-compact' : ''), st.meta.short + ' by factor');
  }
  /** Categories down, factors across: where in the portfolio each factor effect comes from. Only the columns that carry something. */
  function matrixTable(st, model, by) {
    var mx = st.matrix; if (!mx || !mx.order.length) return empty('Nothing differs in this decision.');
    var some = function (get) { return mx.order.some(function (g) { return Math.abs(get(mx.cells[g]) || 0) > 5e-4; }); };
    var fs = model.factors.filter(function (f) { return some(function (c) { return c.factors[f.id]; }); }), hasS = some(function (c) { return c.specific; }), hasC = some(function (c) { return c.cash; });
    var max = 0; mx.order.forEach(function (g) { var c = mx.cells[g]; fs.forEach(function (f) { max = Math.max(max, Math.abs(c.factors[f.id] || 0)); }); max = Math.max(max, Math.abs(c.specific), Math.abs(c.cash)); });
    var cell = function (v, t) { return '<td class="num"><span class="heat" style="background:' + V.shade(v, max) + '" data-tip="' + esc(t + ': ' + F.signed(v, 3)) + '">' + F.signed(v, 2) + '</span></td>'; };
    var rowTotal = function (c) { return U.sum(model.factors, function (f) { return c.factors[f.id] || 0; }) + c.specific + c.cash; }, colSum = function (get) { return U.sum(mx.order, function (g) { return get(mx.cells[g]) || 0; }); };
    var rowsH = mx.order.map(function (g) { var c = mx.cells[g], lab = groupLabel(g, by); return '<tr><th scope="row"><span class="sw" style="background:' + groupColor(g, by) + '"></span>' + esc(lab) + '</th>' + fs.map(function (f) { return cell(c.factors[f.id] || 0, lab + ' · ' + f.name); }).join('') + (hasS ? cell(c.specific, lab + ' · not explained by the factors') : '') + (hasC ? cell(c.cash, lab + ' · cash and benchmark') : '') + '<td class="num"><b>' + F.signed(rowTotal(c), 2) + '</b></td></tr>'; }).join('');
    var foot = '<tr class="total"><th scope="row">' + esc(st.meta.short) + '</th>' + fs.map(function (f) { return '<td class="num">' + F.signed(colSum(function (c) { return c.factors[f.id]; }), 2) + '</td>'; }).join('') + (hasS ? '<td class="num">' + F.signed(colSum(function (c) { return c.specific; }), 2) + '</td>' : '') + (hasC ? '<td class="num">' + F.signed(colSum(function (c) { return c.cash; }), 2) + '</td>' : '') + '<td class="num">' + F.signed(colSum(rowTotal), 2) + '</td></tr>';
    return '<div class="tblwrap"><table class="tbl heat-tbl ch-tbl ch-matrix"><caption class="sr-only">' + esc(st.meta.short) + ' by ' + byWord(by, 1) + ' and factor</caption><thead><tr><th scope="col">' + byHead(by) + '</th>' + fs.map(function (f) { return '<th scope="col" class="num">' + esc(f.name) + '</th>'; }).join('') + (hasS ? '<th scope="col" class="num" data-tip="Return the factors do not explain">Specific</th>' : '') + (hasC ? '<th scope="col" class="num" data-tip="Difference in weight × (the cash rate less the return of the portfolio before): the part of an effect from weights that is not a factor">Cash and benchmark</th>' : '') + '<th scope="col" class="num">Total</th></tr></thead><tbody>' + rowsH + foot + '</tbody></table></div><p class="ch-note">Effect on return, % a year. Each row adds up to the ' + byWord(by, 1) + '’s total in the ' + byHead(by) + ' breakdown.</p>';
  }
  function spreadTable(st) {
    if (!st.spread) return '';
    return '<details class="ch-spread"><summary>How much the order matters: ' + F.signed(st.spread.min, 2) + ' to ' + F.signed(st.spread.max, 2) + ' over ' + word(st.spread.values.length) + ' orders</summary><table class="tbl ch-tbl"><thead><tr><th>Order</th><th class="num">' + esc(st.meta.short) + '</th></tr></thead><tbody>' + st.spread.values.map(function (v) { return '<tr><td>' + esc(v.order) + '</td><td class="num">' + sgn(v.value) + '</td></tr>'; }).join('') + '<tr class="total"><td>Average (shown)</td><td class="num">' + sgn(st.total) + '</td></tr></tbody></table></details>';
  }
  var lowerFirst = function (t) { return t && /^[A-Z][a-z]+(?!\/)\b/.test(t) && !/^[A-Za-z]+\//.test(t) ? t.charAt(0).toLowerCase() + t.slice(1) : t; };
  /** What the decision is and what it did, in a sentence or two above its table. */
  function saying(x, sel, s, b, by, brk) {
    var st = sel.step, r = sel.risk, y = x[b], past = b === 'historical', v = st.total, flat = Math.abs(v) < 0.005, all = !!sel.whole;
    var did = flat ? (past ? 'made no difference to return' : 'makes no difference to return') : (v > 0 ? (past ? 'added' : 'adds') : (past ? 'cost' : 'costs')) + ' <b class="' + (v > 0 ? 'pos' : 'neg') + '">' + mag(v) + '% a year</b>';
    var out = '<b>' + esc(st.meta.short) + '</b> (' + esc(lowerFirst(st.meta.versus || st.meta.to + ', ' + st.meta.from)) + ') ' + (all ? 'together ' : '') + did + (past ? ' over ' + esc(span(y)) : x.scenarioApplied ? ' under the scenario' : '');
    if (r && all) out += ', for ' + F.num(sel.te != null ? sel.te : r.te, 2) + '% of tracking error.';
    else if (r && y.risk) out += (past ? ' and accounted for ' : ' and accounts for ') + F.num(r.contribution, 2) + ' of the ' + F.num(y.risk.total, 2) + '% tracking error. Taken alone its tracking error ' + (past ? 'was ' : 'is ') + F.num(r.te, 2) + ', which the risk columns break down.';
    else out += '.';
    if (brk === 'factor' && st.factor) out += ' Factor exposures explain ' + F.signed(st.factor.factorTotal, 2) + ' of it; ' + F.signed(st.factor.specific, 2) + ' is ' + (st.meta.id === 'selection' ? 'specific to the managers and products.' : 'not explained by the factors.');
    else if (brk !== 'matrix') { var top = st.byGroup.filter(function (q) { return q.key !== '__residual' && !q.weightLine; }).sort(function (a, c) { return Math.abs(c.total) - Math.abs(a.total); })[0]; if (top && Math.abs(top.total) >= 0.005) out += ' The largest effect is from ' + esc((top.label || top.short).replace(/ \(upper level only\)$/, '')) + ', ' + F.signed(top.total, 2) + '.'; }
    return '<p class="ch-say">' + out + '</p>';
  }
  function breakdownHtml(x, s, card, data) {
    var b = oneBasis(card, s), y = x[b], brk = breakOf(s), by = byOf(s), model = D.factorModelById[data.factorModel], pairModel = data.pairModel ? D.factorModelById[data.pairModel] : null;
    var tools = '<div class="ch-tools">' + decisionChips(x, s, b) + basisChips(card, s) + '</div><div class="ch-tools">' + seg('ch-break', BREAK, brk, 'Break down by') + '</div>';
    if (!live(y)) return tools + empty(esc((y && y.reason) || 'Not calculated for this basis.'));
    var sel = pickStep(x, b, s); if (!sel) return tools + empty('This decision is not available on this basis.');
    var st = sel.step, fwd = b === 'forward' && !x.scenarioApplied, upper = sel.whole ? y.levelReturns[0] : (!x.order || x.order === 'default') && sel.index != null ? y.levelReturns[sel.index] : null, main;
    if (brk === 'matrix') main = matrixTable(st, model, by);
    else if (s.split) main = '<div class="act-two ch-split"><div>' + effectTable(sel, s, by, card, { compact: true }) + '</div><div>' + factorTable(sel, s, model, by, card, { compact: true }) + '</div></div>';
    else if (s.sources === 'waterfall') main = '<div class="viz-host" data-ch-wf="' + (brk === 'factor' ? 'factor' : 'asset') + '"></div>';
    else main = brk === 'factor' ? factorTable(sel, s, model, by, card, { pair: b === 'forward' && pairModel ? st.pair : null, pairModel: pairModel, worked: fwd }) : effectTable(sel, s, by, card, { upper: upper, worked: fwd });
    return tools + saying(x, sel, s, b, by, brk) + main + spreadTable(st);
  }
  function drawWf(body, x, s, card) {
    var el = body.querySelector('[data-ch-wf]'); if (!el) return;
    var b = oneBasis(card, s), sel = pickStep(x, b, s); if (!sel) return;
    var st = sel.step, f = st.factor, steps;
    if (el.dataset.chWf === 'factor') {
      steps = f.byFactor.filter(function (q) { return Math.abs(q.contribution) >= 0.005; }).sort(function (a, c) { return Math.abs(c.contribution) - Math.abs(a.contribution); }).map(function (q) { return { label: q.label, value: q.contribution, color: H.FACTOR_INK, tip: q.label + ' (difference in exposure ' + F.signed(q.dBeta, 2) + ' × ' + F.num(q.factorReturn, 2) + ')' }; });
      var rest = f.factorTotal - U.sum(steps, function (q) { return q.value; }); if (Math.abs(rest) > 5e-4) steps.push({ label: 'Other factors', value: rest, color: H.FACTOR_INK });
      if (Math.abs(f.cash || 0) > 5e-4) steps.push({ label: 'Cash', value: f.cash, color: CROSS_INK });
      steps.push({ label: st.meta.id === 'selection' ? 'Specific to the products' : 'Not explained by the factors', value: f.specific, color: '#c3cedb' });
      if (Math.abs(f.drift || 0) > 1e-4) steps.push({ label: 'Rebalancing and drift', value: f.drift, color: CROSS_INK });
      if (Math.abs(f.notReconciled || 0) > 1e-4) steps.push({ label: 'Not reconciled', value: f.notReconciled, color: '#e0b25c' });
    } else {
      steps = st.byGroup.map(function (q) { return { label: q.short || q.label, value: q.total, color: q.color || '#c3cedb', tip: (q.label || q.short) + (q.allocation != null ? ' (from weights ' + F.signed(q.allocation, 2) + ', from returns ' + F.signed(q.selection, 2) + (q.interaction ? ', interaction ' + F.signed(q.interaction, 2) : '') + ')' : '') }; });
      if (Math.abs(st.drift || 0) > 1e-4) steps.push({ label: 'Rebalancing and drift', value: st.drift, color: CROSS_INK });
    }
    V.waterfall(el, { height: Math.max(170, body.clientHeight - 190), steps: steps, total: { label: st.meta.short, color: inkOf(st.meta.id) }, unit: 'pp', dp: 2, aria: 'Waterfall of ' + st.meta.short + ' by source' });
  }

  /* ── Over time ───────────────────────────────────────────────────── */
  var GRAN = [['years', 'Calendar years'], ['months', 'Months'], ['rolling36', 'Rolling 36 months']];
  /* three strengths of shading each way, so a cell reads as small, medium or large */
  function tone(v, max) { if (v == null || !(max > 0)) return ''; var a = Math.abs(v) / max, k = a < 0.08 ? 0 : a < 0.34 ? 1 : a < 0.67 ? 2 : 3; return k ? ' ' + (v > 0 ? 'ch-up' : 'ch-dn') + k : ''; }
  var moving = function (arr) { return arr.some(function (v) { return Math.abs(v) > 0.005; }); };
  /** One decision's rows over time, by what the card breaks down by. */
  function timeSubs(q, s, model, by) {
    var out = [];
    if (breakOf(s) === 'factor') {
      Object.keys(q.factors).filter(function (f) { return moving(q.factors[f]); }).forEach(function (f) { out.push({ label: (model.factorById[f] || {}).name || f, values: q.factors[f] }); });
      out.sort(function (a, c) { return Math.abs(U.sum(c.values)) - Math.abs(U.sum(a.values)); });
      if (moving(q.specific)) out.push({ label: 'Not explained by the factors', values: q.specific });
    } else {
      Object.keys(q.rows).filter(function (k) { return moving(q.rows[k]); }).forEach(function (k) { out.push({ label: groupLabel(k, by), values: q.rows[k], color: groupColor(k, by) }); });
      out.sort(function (a, c) { return Math.abs(U.sum(c.values)) - Math.abs(U.sum(a.values)); });
    }
    if (moving(q.drift)) out.push({ label: 'Rebalancing and drift', values: q.drift, tag: 'Not a decision' });
    return out;
  }
  function timeHtml(x, s, card, data, wa) {
    var h = x.historical, gran = s.overTime || 'years', st = C.state[card.id] || {}, show = st.timeShow === 'lines' ? 'lines' : 'table';
    var tools = '<div class="ch-tools">' + seg('ch-gran', GRAN, gran, 'Periods') + (gran === 'rolling36' ? '' : seg('ch-show', [['table', 'Table'], ['lines', 'Cumulative']], show, 'Show')) + '</div>';
    if (!h) return tools + empty('Over time is drawn from history, and this card is set to the forward-looking basis only. <button type="button" class="btn btn-sm" data-ch-hist>Show both bases</button>');
    if (!live(h)) return tools + empty(esc(h.reason || 'No history for this allocation.'));
    var ot = h.overTime; if (!ot) return tools + empty('No periods.');
    if (ot.kind === 'none') return tools + empty(esc(ot.reason) + '. <button type="button" class="btn btn-sm" data-ch-link>Use Cariño linking</button>');
    if (ot.kind === 'rolling') return tools + '<div class="ch-strip-cap">Rolling 36-month effect of each decision, % a year</div><div class="viz-host" data-ch-lines></div>';
    var n = ot.periods.length, net = ot.periods.map(function (p, i) { return U.sum(ot.steps, function (q) { return q.total[i]; }); });
    /* the sentence counts whole periods only */
    var whole = net.filter(function (v, i) { return !(ot.partial && ot.partial[i]); }), won = whole.filter(function (v) { return v > 0.005; }).length, unit = gran === 'months' ? 'months' : 'calendar years';
    var say = '<p class="ch-say"><b>' + esc(wa.name) + '</b> has beaten its policy benchmark in <b>' + won + ' of the last ' + whole.length + ' ' + unit + '</b>' + (function () {
      var tot = ot.steps.map(function (q, i) { return { m: h.steps[i].meta, v: q.cumulative }; }).sort(function (a, c) { return Math.abs(c.v) - Math.abs(a.v); })[0];
      return tot && Math.abs(tot.v) >= 0.005 ? '. Over the whole period ' + esc(tot.m.short) + ' has ' + (tot.v > 0 ? 'added' : 'cost') + ' the most, ' + mag(tot.v) + ' points.' : '.';
    })() + '</p>';
    if (show === 'lines') return tools + say + '<div class="ch-strip-cap">Running total of each decision’s effect, points</div><div class="viz-host" data-ch-lines></div>';
    var model = D.factorModelById[data.factorModel], by = byOf(s), open = st.timeOpen, max = 0, nmax = 0;
    ot.steps.forEach(function (q) { q.total.forEach(function (v) { max = Math.max(max, Math.abs(v)); }); }); net.forEach(function (v) { nmax = Math.max(nmax, Math.abs(v)); });
    var plab = function (i) { return gran === 'months' ? F.month(ot.periods[i]) : ot.periods[i]; };
    var cells = function (label, vals, m, cls) { return vals.map(function (v, i) { return '<td class="num"><span class="ch-cell' + (cls || '') + tone(v, m) + '" data-tip="' + esc(label + ' · ' + plab(i) + ': ' + F.signed(v, 2) + ' points') + '">' + F.signed(v, 2) + '</span></td>'; }).join(''); };
    var head = '<thead><tr><th scope="col">Decision</th>' + ot.periods.map(function (p, i) { return '<th scope="col" class="num">' + esc(plab(i)) + (ot.partial && ot.partial[i] ? '<sup aria-label="part year">*</sup>' : '') + '</th>'; }).join('') + '<th scope="col" class="num ch-grp">Whole period<small>points</small></th><th scope="col" class="num">A year<small>%</small></th></tr></thead>';
    /* the active return of each period as a column of bars, so the shape is seen before the numbers are read */
    var bars = '<tr class="ch-bars" aria-hidden="true"><th scope="row">Portfolio less policy benchmark</th>' + net.map(function (v, i) { var hgt = nmax > 0 ? Math.max(Math.abs(v) / nmax * 18, 1) : 1; return '<td class="num"><span class="ch-bar" data-tip="' + esc(plab(i) + ': ' + F.signed(v, 2) + ' points') + '"><i class="' + (v >= 0 ? 'up' : 'dn') + '" style="height:' + hgt.toFixed(1) + 'px"></i></span></td>'; }).join('') + '<td class="ch-grp"></td><td></td></tr>';
    var body = ot.steps.map(function (q, i) {
      var m = h.steps[i].meta, on = open === m.id, subs = on ? timeSubs(q, s, model, by) : [];
      var row = '<tr class="ch-otrow"><th scope="row"><button type="button" class="btn-link ch-foldbtn" data-ch-topen="' + m.id + '" aria-expanded="' + on + '" data-tip="' + esc((on ? 'Hide' : 'Show') + ' what ' + m.short + ' is made of, by ' + (breakOf(s) === 'factor' ? 'factor' : byWord(by, 1))) + '">' + (on ? '▾' : '▸') + '</button>' + sq(m.id) + esc(m.short) + '</th>' + cells(m.short, q.total, max) + '<td class="num ch-grp"><b>' + sgn(q.cumulative) + '</b></td><td class="num">' + sgn(h.steps[i].total) + '</td></tr>';
      return row + subs.map(function (r) { return '<tr class="ch-in"><th scope="row">' + (r.color ? '<span class="sw" style="background:' + r.color + '"></span>' : '') + esc(r.label) + (r.tag ? ' <span class="tag tag-mute">' + esc(r.tag) + '</span>' : '') + '</th>' + cells(r.label, r.values, max, ' is-sub') + '<td class="num ch-grp">' + sgn(U.sum(r.values)) + '</td><td></td></tr>'; }).join('');
    }).join('');
    var foot = '<tr class="total"><th scope="row">All decisions</th>' + net.map(function (v) { return '<td class="num"><b>' + sgn(v) + '</b></td>'; }).join('') + '<td class="num ch-grp"><b>' + sgn(U.sum(ot.steps, function (q) { return q.cumulative; })) + '</b></td><td class="num"><b>' + sgn(activeOf(h, s)) + '</b></td></tr>';
    var note = '<p class="ch-note">Each ' + (gran === 'months' ? 'month' : 'year') + '’s effects are linked (' + esc(CH.LABELS.linking[h.linking] || 'geometric') + ') so that they add up to the whole period, ' + esc(span(h)) + '.' + (ot.partial && ot.partial.some(Boolean) ? ' * Part year: the period starts or ends within it.' : '') + '</p>';
    return tools + say + '<div class="tblwrap"><table class="tbl ch-tbl ch-ot' + (gran === 'months' ? ' is-months' : '') + '"><caption class="sr-only">The decisions, period by period</caption>' + head + '<tbody>' + bars + body + foot + '</tbody></table></div>' + note;
  }
  function drawLines(body, x, s, card, wa) {
    var el = body.querySelector('[data-ch-lines]'); if (!el) return;
    var h = x.historical, ot = h.overTime, rolling = ot.kind === 'rolling', series;
    if (rolling) series = ot.lines.map(function (vals, i) { var m = h.steps[i].meta; return { id: m.id, name: m.short, color: inkOf(m.id), values: vals }; });
    else series = ot.steps.map(function (q, i) { var m = h.steps[i].meta, run = 0; return { id: m.id, name: m.short, color: inkOf(m.id), values: q.total.map(function (v) { run += v; return run; }) }; });
    el.innerHTML = '<div class="viz-legend" style="padding:0 0 6px">' + series.map(function (q) { return '<span class="ch-leg"><span class="sw" style="background:' + q.color + '"></span>' + esc(q.name) + '</span>'; }).join('') + '</div><div data-ch-line-host></div>';
    V.lineChart(el.querySelector('[data-ch-line-host]'), { xs: rolling ? ot.months : ot.periods, series: series, height: Math.max(160, body.clientHeight - 190), baseline: 0, fmt: function (v) { return F.signed(v, 2) + (rolling ? '%' : ' points'); }, aria: 'The decisions over time for ' + wa.name });
  }

  /* ── Checks: do the figures add up? ──────────────────────────────── */
  function checkRows(list) {
    return list.map(function (t) {
      var dp = 3, status = t.within ? '<span class="ch-ok">' + I.check + 'Ties</span>' : t.explained ? '<span class="tag tag-warn" data-tip="' + esc(t.reason) + '">Explained</span>' : '<span class="tag tag-neg">Does not tie</span>';
      return '<tr><th scope="row">' + esc(t.label) + (t.unit ? ' <small class="faint">' + esc(t.unit) + '</small>' : '') + (t.explained ? '<span class="ch-sub">' + esc(t.reason) + '</span>' : '') + '</th><td>' + esc(BSHORT[t.basis]) + '</td><td class="num">' + F.num(t.lhs, dp) + '</td><td class="num">' + F.num(t.rhs, dp) + '</td><td class="num">' + F.signed(t.diff, dp) + '</td><td>' + status + '</td></tr>';
    }).join('');
  }
  function checksHtml(x, s, card) {
    var c = checksOf(x, s); if (!c.list.length) return '';
    var ok = c.list.filter(function (t) { return t.within; }), all = openOf(card).ties || !c.off.length;
    var lead = c.off.length ? '<b>' + c.off.length + ' of ' + c.list.length + '</b> ' + (c.off.length === 1 ? 'does' : 'do') + ' not tie. ' + (c.off.every(function (t) { return t.explained; }) ? (c.off.length === 1 ? 'It has a known cause, given beneath it.' : 'Each has a known cause, given beneath it.') : '') : 'Every figure on this card adds up: <b>' + c.list.length + ' checks tie</b>.';
    var cross = basesOf(s).map(function (b) { var r = live(x[b]) && x[b].risk; return r && r.steps.length > 1 ? BSHORT[b] + ' ' + F.signed(r.cross, 3) + ' %²' : null; }).filter(Boolean);
    var thead = '<thead><tr><th scope="col">What should add up</th><th scope="col">Basis</th><th scope="col" class="num">One side</th><th scope="col" class="num">The other</th><th scope="col" class="num">Difference</th><th scope="col">Result</th></tr></thead>';
    return '<section class="ch-checks" aria-label="Checks"><header><h4>Checks<small>Do the figures add up?</small></h4><button type="button" class="btn btn-icon btn-ghost btn-xs" data-ch-checks aria-label="Close the checks" data-tip="Close">' + I.close + '</button></header>' +
      '<p class="ch-note">' + lead + '</p>' +
      '<div class="tblwrap"><table class="tbl ch-tbl ch-ledger"><caption class="sr-only">Checks</caption>' + thead + '<tbody>' + checkRows(c.off) + (all ? checkRows(ok) : '') + '</tbody></table></div>' +
      (c.off.length && ok.length ? '<p class="ch-fold">' + foldBtn('ties', !!openOf(card).ties, ok.length + ' ' + (ok.length === 1 ? 'check ties' : 'checks tie')) + '</p>' : '') +
      '<p class="ch-note">A check ties when its two sides are within ' + x.ties.tolerance + ' of each other (0.01 for squared tracking errors).' + (cross.length ? ' The decisions’ risks do not simply add: tracking error squared is each decision’s own, squared, plus a term for how the decisions move together (' + cross.join(', ') + ').' : '') + '</p></section>';
  }

  /* ── about these figures ─────────────────────────────────────────── */
  /** The conventions this card departs from the workspace on, for its subtitle. */
  function departures(s) { var c = conv(), out = []; [['model', 'attributionModel'], ['interaction', 'interaction'], ['linking', 'linking'], ['currency', 'currency'], ['unallocated', 'unallocated']].forEach(function (p) { var v = s[p[0]]; if (v && v !== 'workspace' && v !== c[p[1]]) out.push(CH.LABELS[p[1]][v]); }); return out; }
  function notesOf(x, s, data, card) {
    var m = methodOf(s), L = CH.LABELS, model = D.factorModelById[data.factorModel], c = x.counts || {}, out = [];
    out.push('<b>Method.</b> ' + esc([L.attributionModel[m.model], L.interaction[m.interaction], m.returns === 'geometric' ? 'geometric active return' : 'arithmetic active return', 'historical effects ' + (m.returns === 'geometric' ? 'linked geometrically' : m.linking === 'none' ? 'not linked (annualised, current weights)' : 'linked with ' + L.linking[m.linking] + ' and scaled to the annualised active return'), L.currency[m.currency], L.unallocated[m.unallocated], L.fees[conv().fees]].join(' · ')) + '.');
    if (s.currency === 'separate' || (s.currency === 'workspace' && conv().currency === 'separate')) out.push('A separate currency effect needs local-currency returns, forward rates and hedge ratios, which the service does not provide; currency stays inside the effect from returns.');
    out.push('<b>Order.</b> ' + esc(x.orderLabel || CH.orderLabel('default')) + '. Each decision is one portfolio less the one before it' + (x.order && x.order !== 'default' ? ', taken after the decisions before it in this order; the return effects still add up to the whole' : '') + '.');
    var parts = []; Object.keys(SOURCE).forEach(function (k) { if (c[k]) parts.push(c[k] + ' ' + SOURCE[k]); });
    if (parts.length) out.push('<b>Manager/Product benchmarks.</b> ' + esc(parts.join(', ')) + ' (of ' + c.holdings + ' holdings).');
    out.push('<b>Factors.</b> ' + esc(model.long) + ', as of ' + F.date(data.modelAsOf) + '. ' + esc(s.exposures === 'returns' ? 'Exposures are estimated from returns over the period, so the factor view does not tie exactly to the holdings; the gap is the not-reconciled line.' : 'Exposures come from the holdings.') + ' Factor returns: ' + esc(s.factorReturns === 'implied' ? 'the forward premia on both bases' : s.factorReturns === 'regression' ? 'premia implied by the period’s annualised index returns' : 'premia implied from expected asset-class returns (forward), realised monthly from the index returns (historical)') + '. Cash is the net weight difference at the cash rate.');
    out.push('<b>Risk.</b> ' + esc(s.riskBasis === 'expost' ? 'Realised on both bases, from monthly active returns over the period.' : s.riskBasis === 'exante' ? 'From the factor model on both bases.' : 'From the factor model on the forward basis; realised over the period on the historical basis.') + ' Each decision’s share of the tracking error adds up to it. Taken alone, the decisions’ tracking errors do not: Checks shows the term between them.');
    var vr = (x.forward && x.forward.risk && x.forward.risk.var) || (x.historical && x.historical.risk && x.historical.risk.var);
    if ((s.riskUnits === 'var99' || s.riskUnits === 'es99') && vr && vr.note) out.push('<b>Value at risk.</b> ' + esc(vr.note) + '.');
    (x.notes || []).concat(x.warnings || []).forEach(function (n) { out.push(esc(n) + '.'); });
    var px = (x.coverage || []).filter(function (q) { return q.proxied; }); if (px.length) out.push(esc(px.map(function (q) { return CH.LEVELS[q.id] ? CH.LEVELS[q.id].short + ': ' + q.proxied + ' proxied by the category index in ' + model.name : ''; }).filter(Boolean).join(' · ')) + '.');
    if (x.scenarioApplied) out.push('The active scenario applies to the forward-looking figures of every portfolio in the chain.');
    return C.notes(card, out);
  }
  /** The allocation whose benchmarks a column of the comparison is analysed through. */
  function ownerOf(wa) { return wa ? S.allocation(wa.kind === 'standalone' ? wa.standalone.allocationId : wa.kind === 'level' ? wa.level.parentId : wa.id) : null; }

  /* ── settings: three are chosen on the card; the rest sit in closed groups ── */
  var tail = function (s) { return s.riskUnits === 'var99' || s.riskUnits === 'es99'; };
  var SETTINGS = [
    { key: 'basis', label: 'Basis', type: 'select', options: [['both', 'Forward-looking and historical'], ['forward', 'Forward-looking only'], ['historical', 'Historical only']], default: 'both', hint: 'Summary shows both. Breakdown shows one at a time and opens on forward-looking.' },
    { key: 'decompose', hidden: true, default: 'category' }, { key: 'step', hidden: true, default: 'saa' }, { key: 'overTime', hidden: true, default: 'years' },
    { group: 'Display', key: 'sources', label: 'Breakdown drawn as', type: 'select', options: [['table', 'Table with bars'], ['waterfall', 'Waterfall']], default: 'table' },
    { group: 'Display', key: 'stepRisk', label: 'Risk of each decision', type: 'select', options: [['contribution', 'Its share of the tracking error'], ['both', 'Its share, and taken alone'], ['standalone', 'Taken alone']], default: 'contribution' },
    { group: 'Display', key: 'riskUnits', label: 'Risk shown as', type: 'select', options: [['te', 'Tracking error'], ['share', 'Share of tracking error'], ['var99', '99% value at risk, 1 year'], ['es99', '99% expected shortfall, 1 year']], default: 'te' },
    { group: 'Display', key: 'columns', label: 'Risk columns', type: 'select', options: [['euler', 'Contribution only'], ['marginal', 'With the marginal contribution'], ['xsr', 'As active weight × volatility × correlation']], default: 'euler' },
    { group: 'Display', key: 'split', label: 'Show categories and factors side by side', type: 'toggle', default: false },
    { group: 'Method', key: 'order', label: 'Order of the decisions', type: 'select', options: function () { return [['chain', 'As set in Benchmarks']].concat(CH.ORDERS).concat([['averaged', 'Averaged over every order']]); }, default: 'chain' },
    { group: 'Method', key: 'implementation', label: 'Manager/Product benchmark decision', type: 'select', options: [['chain', 'As set in Benchmarks'], ['one', 'As one decision'], ['weightThenBenchmark', 'Weights, then choice of benchmark'], ['benchmarkThenWeight', 'Choice of benchmark, then weights']], default: 'chain' },
    { group: 'Method', key: 'model', label: 'Attribution model', type: 'select', options: function () { return [wsOpt('attributionModel'), ['BF', CH.LABELS.attributionModel.BF], ['BHB', CH.LABELS.attributionModel.BHB]]; }, default: 'workspace' },
    { group: 'Method', key: 'interaction', label: 'Interaction', type: 'select', options: function () { return [wsOpt('interaction'), ['selection', 'With the effect from returns (selection)'], ['allocation', 'With the effect from weights (allocation)'], ['separate', 'A column of its own']]; }, default: 'workspace' },
    { group: 'Method', key: 'returnMethod', label: 'Active return', type: 'select', options: [['arithmetic', 'Arithmetic difference'], ['geometric', 'Geometric']], default: 'arithmetic' },
    { group: 'Method', key: 'linking', label: 'Linking over time', type: 'select', options: function (card) { var geo = ((card && card.settings) || {}).returnMethod === 'geometric', why = geo ? ['geometric active return links geometrically'] : []; return [wsOpt('linking'), ['carino', 'Cariño'], ['menchero', 'Menchero'], ['grap', 'GRAP'], ['frongello', 'Frongello'], ['none', 'None, annualised']].map(function (o) { return o.concat(why); }); }, default: 'workspace' },
    { group: 'Method', key: 'currency', label: 'Currency', type: 'select', options: function () { return [wsOpt('currency'), ['none', 'Inside the effect from returns (selection)'], ['fxFactor', 'A row of its own among the factors'], ['separate', 'A separate currency effect', 'needs local-currency returns']]; }, default: 'workspace' },
    { group: 'Method', key: 'unallocated', label: 'Unallocated weight', type: 'select', options: function () { return [wsOpt('unallocated'), ['zero', 'Zero return'], ['cash', 'Treat as cash']]; }, default: 'workspace' },
    { group: 'Factor model', key: 'factorReturns', label: 'Factor returns', type: 'select', options: [['default', 'Implied (forward), realised (historical)'], ['implied', 'Implied premia on both'], ['realised', 'Realised over the period'], ['regression', 'Regression over the period']], default: 'default' },
    { group: 'Factor model', key: 'exposures', label: 'Exposures', type: 'select', options: [['holdings', 'From the holdings'], ['returns', 'Estimated from returns']], default: 'holdings' },
    { group: 'Factor model', key: 'specificBy', label: 'What the factors do not explain opens to', type: 'select', options: [['product', 'Products'], ['category', 'Categories'], ['one', 'Nothing: one row']], default: 'product' },
    { group: 'Factor model', key: 'pairModels', label: 'Show both factor models side by side', type: 'toggle', default: false },
    { group: 'Risk model', key: 'riskBasis', label: 'Risk from', type: 'select', options: [['default', 'The factor model (forward), realised (historical)'], ['exante', 'The factor model on both'], ['expost', 'Realised over the period on both']], default: 'default' },
    { group: 'Risk model', key: 'varMethod', label: 'Value at risk', type: 'select', options: [['parametric', 'Parametric'], ['historical', 'Historical (needs realised risk)'], ['montecarlo', 'Monte Carlo (needs the factor model)']], default: 'parametric', when: tail },
    { group: 'Risk model', key: 'paths', label: 'Monte Carlo paths', type: 'select', options: [['2000', '2,000'], ['5000', '5,000'], ['10000', '10,000']], default: '5000', when: function (s) { return tail(s) && s.varMethod === 'montecarlo'; } }];

  /* ── the card ────────────────────────────────────────────────────── */
  var LEVEL_MODES = [['off', 'Off'], ['active', 'For the allocation being edited'], ['all', 'For every allocation']];
  C.register({ id: 'decision-chain', title: 'Decision chain', description: 'Where active return and active risk come from: the policy benchmark, the SAA, the managers’ and products’ benchmarks and the managers and products themselves, with each decision in return and in risk on the same rows.', group: 'Summary', size: { w: 12, h: 14 }, min: { w: 6, h: 7 }, basis: 'dual', factorModel: true, supportsRow: true, isNew: true,
    basisOf: function (card) { var b = (card.settings || {}).basis; return b === 'forward' || b === 'historical' ? b : null; },
    settings: SETTINGS,
    subtitle: function (ctx, s, card) {
      var wa = H.wfAlloc(card, ctx), a = ownerOf(wa), pol = a && a.kind !== 'level' ? CH.policyOf(a) : null, parts = [];
      if (wa) parts.push(wa.name + (pol && pol.label ? ' against ' + pol.label : '') + (card.followRow ? ' · ' + ctx.rowLabel : ''));
      parts.push('% a year');
      if (s.order === 'averaged') parts.push('order-averaged'); else if (s.order && s.order !== 'chain' && s.order !== 'default') parts.push(CH.orderLabel(s.order));
      return parts.concat(departures(s)).join(' · ') + C.modelDeparture(card);
    },
    data: function (ctx, s, card) {
      return C.fetch('chainAnalysis', { revision: ctx.revision, allocations: U.clone(ctx.members), basis: s.basis, period: U.clone(ctx.prefs.period), scenario: U.clone(ctx.scenario), factorModel: C.modelIdOf(card), pairModels: !!s.pairModels, rowKey: card.followRow ? ctx.row : '__total', decompose: byOf(s), step: s.step, order: s.order, implementation: s.implementation === 'chain' ? null : s.implementation, method: methodOf(s), factorReturns: s.factorReturns === 'default' ? null : s.factorReturns, exposures: s.exposures, specificBy: s.specificBy, risk: { basis: s.riskBasis, units: s.riskUnits, stepRisk: s.stepRisk, columns: s.columns, varMethod: s.varMethod, paths: Number(s.paths) }, overTime: s.overTime });
    },
    /** The header chip: whether every figure on the card adds up. It opens the checks. */
    headChip: function (data, ctx, s, card) {
      var x = seriesOf(data, H.wfAlloc(card, ctx)); if (!x || x.reason || !x.ties) return null;
      var c = checksOf(x, s), n = c.list.length, k = c.off.length; if (!n) return null;
      return { html: (k ? I.warn : I.check) + '<span>' + (k ? k + ' of ' + n + (k === 1 ? ' does not tie' : ' do not tie') : n + ' checks tie') + '</span>', cls: k ? 'is-warn' : 'is-ok', pressed: !!(C.state[card.id] || {}).checks, label: (k ? k + ' of ' + n + ' checks ' + (k === 1 ? 'does' : 'do') + ' not tie' : 'All ' + n + ' checks tie') + '. Show the checks', tip: 'Do the figures add up? Open the checks' };
    },
    headChipClick: function (card) { var st = C.state[card.id] = C.state[card.id] || {}; st.checks = !st.checks; C.repaint(card.id); U.announce(st.checks ? 'Checks shown' : 'Checks hidden'); },
    /** Extra items for the card menu. */
    menuItems: function (card) {
      var ctx = C.ctx(card), wa = H.wfAlloc(card, ctx), a = ownerOf(wa), pol = a ? CH.policyOf(a) : null, bm = pol && pol.source ? D.benchmarkById[pol.source.id] : null, mode = S.ws.prefs.showLevels || 'off';
      var mark = function (on) { return on ? I.check : '<span class="menu-blank" aria-hidden="true"></span>'; };
      var out = [{ label: 'Benchmarks…', icon: I.target, disabled: !a, onClick: function () { UI.chain.open(a); } }];
      if (bm) out.push({ label: 'Add ' + bm.name + ' as a column', icon: I.plus, onClick: function () { UI.dialogs.benchmarkAsMember(bm); } });
      out.push({ head: 'SAA and benchmarks as columns in other cards' });
      LEVEL_MODES.forEach(function (o) { out.push({ label: o[1], icon: mark(mode === o[0]), onClick: function () { S.setPref('showLevels', o[0]); U.announce(o[0] === 'off' ? 'SAA and benchmark columns hidden' : 'SAA and benchmark columns shown ' + o[1].toLowerCase()); } }); });
      return out;
    },
    render: function (body, data, ctx, s, card) {
      var st = C.state[card.id] = C.state[card.id] || {};
      /* a card stored on the old Reconcile view opens its checks once */
      if (card.settings && card.settings.view === 'reconcile' && st.checks == null) st.checks = true;
      var view = viewOf(card), wa = H.wfAlloc(card, ctx), x = seriesOf(data, wa), bases = basesOf(s), a = ownerOf(wa), html, ok = false;
      var tabs = '<div class="act-tabs ch-tabs" role="tablist" aria-label="Views">' + VIEWS.map(function (v) { return '<button type="button" role="tab" data-ch-view="' + v[0] + '" aria-selected="' + (v[0] === view) + '" tabindex="' + (v[0] === view ? 0 : -1) + '">' + v[1] + '</button>'; }).join('') + '</div>';
      if (!ctx.members.length) html = empty('No allocations in the comparison.');
      else if (!x) html = empty('Not calculated for this allocation.');
      else if (x.noBenchmark) html = '<div class="ch-ask"><h3>What is ' + esc(wa.name) + ' measured against?</h3><p>Choose a benchmark and this card fills in at once. The SAA and each product’s benchmark start from sensible defaults that you can change later.</p><div class="ch-pick" data-ch-pick></div></div>';
      else if (x.reason) html = empty(esc(x.reason) + (wa.kind === 'level' ? '' : ' <button type="button" class="btn btn-sm" data-ch-setup>Open Benchmarks</button>'));
      else {
        ok = true;
        html = (x.partial ? UI.alert('warning', '<b>Part of the chain is missing.</b> ' + esc(x.partial.join(', ')) + ': the decisions either side of it are shown as one. <button type="button" class="btn-link" data-ch-setup>Open Benchmarks</button>') : '') +
          (st.checks ? checksHtml(x, s, card) : '') +
          (view === 'breakdown' ? breakdownHtml(x, s, card, data) : view === 'time' ? timeHtml(x, s, card, data, wa) : summaryHtml(x, s, card, wa, bases)) + notesOf(x, s, data, card);
      }
      body.innerHTML = tabs + H.wfTabs(card, ctx, wa) + '<div class="ch-view" role="tabpanel">' + html + '</div>';
      if (ok) { if (view === 'breakdown') drawWf(body, x, s, card); if (view === 'time') drawLines(body, x, s, card, wa); }
      var pick = body.querySelector('[data-ch-pick]');
      if (pick && a && UI.benchmarks && UI.benchmarks.picker) UI.benchmarks.picker(pick, { compact: true, onPick: function (id) { var b = D.benchmarkById[id]; UI.benchmarks.setFor(a, id); UI.toast(a.name + ' is now measured against ' + (b ? b.name : 'the benchmark') + '.', { action: { label: 'Undo', fn: S.undo } }); } });
      var set = function (patch) { var c = S.card(card.id), p = U.clone(c.settings || {}); Object.keys(patch).forEach(function (k) { p[k] = patch[k]; }); S.updateCard(c.id, { settings: p }); };
      var refocus = function (sel) { setTimeout(function () { var el = document.querySelector('[data-card="' + CSS.escape(card.id) + '"] ' + sel); if (el) el.focus(); }, 0); };
      var again = function (sel) { C.repaint(card.id); if (sel) refocus(sel); };
      var pressed = function (attr, key, fn) { U.on(body, 'click', '[data-' + attr + ']', function (e, b) { var v = b.getAttribute('data-' + attr); fn(v); refocus('[data-' + attr + '="' + v + '"]'); }); };
      U.on(body, 'click', '[data-ch-view]', function (e, b) { set({ view: b.dataset.chView }); refocus('[data-ch-view="' + b.dataset.chView + '"]'); });
      U.on(body, 'keydown', '[data-ch-view]', function (e, b) { if (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft') return; e.preventDefault(); var ids = VIEWS.map(function (v) { return v[0]; }), i = ids.indexOf(b.dataset.chView), n = ids[(i + (e.key === 'ArrowRight' ? 1 : ids.length - 1)) % ids.length]; set({ view: n }); refocus('[data-ch-view="' + n + '"]'); });
      /* chosen on the card and kept with it */
      pressed('ch-step', 'step', function (v) { set({ step: v }); });
      pressed('ch-break', 'decompose', function (v) { set({ decompose: v }); });
      pressed('ch-gran', 'overTime', function (v) { set({ overTime: v }); });
      /* how the card is being looked at now: kept until the workspace is reloaded */
      pressed('ch-basis', null, function (v) { st.basis = v; C.repaint(card.id); });
      pressed('ch-show', null, function (v) { st.timeShow = v; C.repaint(card.id); });
      pressed('ch-lview', null, function (v) { st.levelsView = v; C.repaint(card.id); });
      pressed('ch-lfocus', null, function (v) { st.levelFocus = v; C.repaint(card.id); });
      /* a decision anywhere on Summary opens it in Breakdown */
      U.on(body, 'click', '[data-ch-open]', function (e, b) { set({ view: 'breakdown', step: b.dataset.chOpen }); refocus('[data-ch-step="' + b.dataset.chOpen + '"]'); });
      U.on(body, 'click', '[data-ch-alone]', function () { set({ stepRisk: s.stepRisk === 'both' ? 'contribution' : 'both' }); refocus('[data-ch-alone]'); });
      U.on(body, 'click', '[data-ch-levels]', function () { st.levelsOpen = !st.levelsOpen; again('[data-ch-levels]'); });
      U.on(body, 'click', '[data-ch-fold]', function (e, b) { var id = b.dataset.chFold; st.open = st.open || {}; st.open[id] = !st.open[id]; again('[data-ch-fold="' + id + '"]'); });
      U.on(body, 'click', '[data-ch-topen]', function (e, b) { var id = b.dataset.chTopen; st.timeOpen = st.timeOpen === id ? null : id; again('[data-ch-topen="' + id + '"]'); });
      U.on(body, 'click', '[data-ch-checks]', function () { st.checks = false; C.repaint(card.id); refocus('[data-head-chip]'); });
      U.on(body, 'click', '[data-ch-setup]', function (e, b) { if (a) UI.chain.open(a, b.dataset.chSetup ? { focus: b.dataset.chSetup } : null); });
      U.on(body, 'click', '[data-ch-hist]', function () { set({ basis: 'both' }); });
      U.on(body, 'click', '[data-ch-link]', function () { set({ linking: 'carino' }); });
      H.wireWf(body, card);
    },
    dataTable: function (data, ctx, s, card) {
      var wa = H.wfAlloc(card, ctx), x = seriesOf(data, wa); if (!x || x.reason) return '';
      var rows = [];
      basesOf(s).filter(function (b) { return live(x[b]); }).forEach(function (b) {
        var y = x[b], lv = y.levelReturns, r = y.risk, names = (x.levels || []).filter(function (l) { return l.holdings; });
        rows.push({ cells: ['<b>' + BASES[b] + '</b>', '', '', ''] });
        rows.push({ cells: [esc(names[0] ? names[0].short : 'Policy benchmark'), F.num(lv[0], 2), '', ''] });
        y.steps.forEach(function (st, i) { rows.push({ cells: [esc(st.meta.label), F.signed(st.total, 2), r ? F.signed(r.steps[i].contribution, 2) : '—', r ? F.num(r.steps[i].te, 2) : '—'] }); });
        rows.push({ cls: 'total', cells: [esc(wa.name), F.num(lv[lv.length - 1], 2), r ? F.num(r.total, 2) : '—', r ? F.num(r.total, 2) : '—'] });
      });
      return V.table([{ label: 'Portfolio or decision' }, { label: 'Return, % a year', num: true }, { label: 'Share of tracking error', num: true }, { label: 'Tracking error taken alone', num: true }], rows, { maxHeight: '240px', caption: 'Decision chain' });
    }
  });
})();

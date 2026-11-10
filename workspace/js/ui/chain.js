/* ─────────────────────────────────────────────────────────────────────────
   Portfolio Analytics · Benchmarks and attribution conventions
   What an allocation is measured against is one dialog, Benchmarks, with
   three questions: the benchmark it is measured against (the policy
   benchmark), its long-term mix (the SAA) and what each product is measured
   against (the Manager/Product benchmarks). A benchmark is enough: the
   other two start from defaults. The dialog shows what the draft does to
   each decision as it is edited and saves as one undoable edit.
   Attribution conventions (model, interaction, linking, currency,
   unallocated weight, fee basis, the order of the decisions and how the
   Manager/Product benchmark decision is taken) are workspace defaults under
   the header menu; an allocation or a card may depart from them and says so.
   ───────────────────────────────────────────────────────────────────────── */
(function () {
  'use strict';
  var PA = window.PA, U = PA.util, esc = U.esc, S = PA.store, UI = PA.ui, D = PA.data, E = PA.engine, I = U.icon, F = U.fmt, CH = PA.chain;
  var X = UI.chain = {};

  var SOURCE = { stated: 'Stated benchmark', categoryIndex: 'Category index', override: 'Changed here', index: 'Is itself an index', fitted: 'Fitted index (uploaded returns)', none: 'No benchmark: the product itself' };
  /* a product is worth a look when nothing says what it should be measured against */
  var REVIEW = { categoryIndex: 1, fitted: 1, none: 1 };
  var RULES = [['stated', 'Its stated benchmark, else its category’s index'], ['categoryIndex', 'Its category’s index']];
  var bm = function (id) { return id ? D.benchmarkById[id] : null; };
  var bmName = function (id) { var b = bm(id); return b ? b.name + (b.version ? ' v' + b.version : '') : ''; };
  var sgn = function (v) { return '<b class="' + (v >= 0.005 ? 'pos' : v <= -0.005 ? 'neg' : '') + '">' + F.signed(v, 2) + '</b>'; };

  /* ── the draft ───────────────────────────────────────────────────── */
  function draftOf(a) {
    var ch = CH.storedChain(a) || CH.blank(), ex = CH.exceptionOf(a), pb = ch.productBenchmarks || {};
    return { benchmarkId: a.benchmarkId || null, other: ex ? ex.id : null, saa: ch.saa && ch.saa.kind && ch.saa.kind !== 'derived' ? U.clone(ch.saa) : null,
      pb: { mode: pb.mode === 'categoryIndex' ? 'categoryIndex' : 'stated', overrides: U.clone(pb.overrides || {}) }, order: ch.order || null, implementation: ch.implementation || null };
  }
  /** What a draft stores on the allocation: null when nothing departs from the defaults. */
  function chainOfDraft(d) {
    var ov = {}; Object.keys(d.pb.overrides).forEach(function (k) { if (d.pb.overrides[k]) ov[k] = d.pb.overrides[k]; });
    var c = { policyBenchmarkId: d.benchmarkId && d.other && d.other !== d.benchmarkId ? d.other : null, saa: d.saa ? U.clone(d.saa) : null, productBenchmarks: { mode: d.pb.mode, overrides: ov } };
    if (d.order) c.order = d.order;
    if (d.implementation) c.implementation = d.implementation;
    return !c.policyBenchmarkId && !c.saa && c.productBenchmarks.mode === 'stated' && !Object.keys(ov).length && !c.order && !c.implementation ? null : c;
  }
  /** The allocation as the draft would leave it. */
  function allocOf(a, d) { var x = Object.assign({}, a, { benchmarkId: d.benchmarkId }), c = chainOfDraft(d); if (c) x.chain = c; else delete x.chain; return x; }
  var same = function (p, q) { return JSON.stringify(p) === JSON.stringify(q); };
  /** What changed between the allocation and the draft, in words (the activity line). */
  function changesOf(a, d) {
    var was = draftOf(a), out = [];
    if (was.benchmarkId !== d.benchmarkId) out.push('Benchmark ' + (d.benchmarkId ? bmName(d.benchmarkId) : 'removed'));
    if ((was.other || null) !== ((d.benchmarkId && d.other) || null)) out.push(d.other && d.benchmarkId ? 'Attributed against ' + bmName(d.other) : 'Attributed against its own benchmark');
    if (!same(was.saa, d.saa)) out.push('SAA ' + (d.saa ? saaWords(d.saa) : 'not set'));
    if (!same(chainOfDraft(was) ? chainOfDraft(was).productBenchmarks : { mode: 'stated', overrides: {} }, (chainOfDraft(d) || { productBenchmarks: { mode: 'stated', overrides: {} } }).productBenchmarks)) out.push(CH.LEVELS.productBenchmarks.short + 's changed');
    if (was.order !== d.order || was.implementation !== d.implementation) out.push('Method changed');
    return out;
  }
  function saaWords(s) { var al = s.kind === 'allocation' ? S.allocation(s.id) : null; return s.kind === 'weights' ? 'typed weights' : s.kind === 'allocation' ? (al ? al.name : 'an allocation') : bmName(s.id); }

  /* ── the rows: a question, its answer, one button ─────────────────── */
  var ROWS = [['policy', 'Measured against', 'Policy benchmark'], ['saa', 'Long-term mix', 'Strategic asset allocation'], ['mapping', 'Each product against', 'Manager/Product benchmarks'], ['method', 'Method', 'Order and split of the decisions']];
  var mix = function (hs) { return hs && hs.length ? UI.benchmarks.mixBar(hs) : ''; };
  function mappingOf(a, d) { return CH.mappingOf(allocOf(a, d)); }
  function countsOf(rows) { var c = { n: rows.length, review: 0, override: 0 }; rows.forEach(function (r) { c[r.source] = (c[r.source] || 0) + 1; if (REVIEW[r.source]) c.review++; }); return c; }
  /** {value, hint, button, disabled} for a row as it stands in the draft. */
  function answerOf(key, a, d) {
    var none = !d.benchmarkId, wait = { value: '<span class="faint">—</span>', hint: 'Choose a benchmark first.', button: key === 'saa' ? 'Set weights' : key === 'mapping' ? 'Review' : 'Change', disabled: true };
    if (key === 'policy') {
      if (none) return { value: '<span class="faint">No benchmark yet</span>', hint: 'Choose one and the two answers below start from sensible defaults.', button: 'Choose' };
      var b = bm(d.benchmarkId), old = UI.benchmarks.outdated(d.benchmarkId), o = d.other && d.other !== d.benchmarkId ? bm(d.other) : null;
      return { value: esc(b ? b.name : 'Benchmark not found') + (b && b.version ? ' <span class="tag">v' + b.version + '</span>' : '') + (old ? ' <span class="tag tag-info">v' + old.latest + ' available</span>' : '') + (b ? mix(b.holdings) : ''),
        hint: (b ? (b.source === 'custom' ? 'Custom' : 'Preset') + (b.description ? ' · ' + esc(b.description) : '') : '') + (o ? '<span class="bq-ex"><span class="tag tag-edit">Exception</span> The decisions are attributed against <b>' + esc(bmName(d.other)) + '</b></span>' : ''), button: 'Change' };
    }
    if (none) return wait;
    var al = allocOf(a, d);
    if (key === 'saa') {
      var s = CH.saaOf(al, S.ws.allocations);
      if (!d.saa) return { value: 'Today’s category weights <span class="tag tag-warn">Not set</span>' + mix(s.holdings), hint: 'Enter target weights to separate the long-term mix from how it is implemented.', button: 'Set weights' };
      if (s.reason) return { value: '<span class="neg">' + esc(s.reason) + '</span>', hint: '', button: 'Change' };
      var how = d.saa.kind === 'weights' ? 'Typed weights' : esc(s.label);
      return { value: how + mix(s.holdings), hint: esc(d.saa.kind === 'weights' ? UI.benchmarks.mix(s.holdings).map(function (m) { return m.short + ' ' + F.num(m.weight, 0); }).join(' · ') : d.saa.kind === 'allocation' ? 'An allocation in this workspace' : 'A benchmark') + (s.warning || s.note ? ' · <span class="warn-ink">' + esc(s.warning || s.note) + '</span>' : ''), button: 'Change' };
    }
    if (key === 'mapping') {
      var rows = mappingOf(a, d), c = countsOf(rows), parts = [];
      if (c.stated) parts.push(c.stated + ' of ' + c.n + ' stated');
      if (c.categoryIndex) parts.push(c.categoryIndex + ' on a category index');
      if (c.fitted) parts.push(c.fitted + ' on a fitted index');
      if (c.index) parts.push(c.index + (c.index === 1 ? ' is itself an index' : ' are themselves indices'));
      if (c.none) parts.push(c.none + ' with no benchmark');
      return { value: esc(RULES.filter(function (r) { return r[0] === d.pb.mode; })[0][1]) + (c.review && d.pb.mode === 'stated' ? ' <span class="tag tag-info">' + c.review + ' to review</span>' : '') + (c.override ? ' <span class="tag tag-edit">' + c.override + ' changed</span>' : ''), hint: esc(parts.join(' · ')), button: 'Review' };
    }
    var cv = CH.conventionsOf(S.ws), dep = !!(d.order || d.implementation), impl = function (v) { return CH.IMPLEMENTATIONS.filter(function (r) { return r[0] === v; })[0][1]; };
    return { value: (dep ? '' : '<span class="faint">As the workspace sets it</span>') + (dep ? esc(CH.orderLabel(d.order || cv.order)) + ' <span class="tag tag-edit">Differs from the workspace</span>' : ''), hint: esc((dep ? '' : CH.orderLabel(cv.order) + ' · ') + CH.LEVELS.productBenchmarks.short + ' as ' + impl(d.implementation || cv.implementation).toLowerCase()), button: 'Change' };
  }
  function headHtml(row, a, d, open) {
    var x = answerOf(row[0], a, d), on = open === row[0];
    return '<div class="bq-q">' + row[1] + '<small>' + row[2] + '</small></div><div class="bq-a"><div class="bq-v">' + x.value + '</div>' + (x.hint ? '<div class="bq-h">' + x.hint + '</div>' : '') + '</div>' +
      '<button type="button" class="btn btn-sm" data-bq-open="' + row[0] + '" aria-expanded="' + on + '" aria-controls="bq-body-' + row[0] + '"' + (x.disabled ? ' disabled' : '') + '>' + (on ? 'Done' : x.button) + '</button>';
  }

  /* ── a row, opened in place ──────────────────────────────────────── */
  var INDICES = function () { return D.instruments.filter(function (i) { return i.type === 'Index' && i.spread == null; }); };
  function policyBody(a, d) {
    var on = !!(d.other && d.benchmarkId);
    return '<div data-bq-pick="benchmark"></div>' +
      (d.benchmarkId ? '<div class="bq-opt"><label class="check"><input type="checkbox" data-bq-other' + (on ? ' checked' : '') + '> Attribute against a different benchmark</label><span class="field-hint">For when the benchmark the allocation is compared with is not the one its decisions are measured from. Wherever the two differ, the screen says which is used.</span></div>' +
        (on ? '<div class="bq-sub"><div class="bq-cap">Attribute the decisions against</div><div data-bq-pick="other"></div></div>' : '') +
        '<div class="bq-foot"><button type="button" class="btn-link" data-bq-none>Remove the benchmark</button></div>' : '');
  }
  function weightsOf(a, d) {
    /* typed weights open on what is held today, so nothing has to be entered to start */
    if (d.saa && d.saa.kind === 'weights') return d.saa;
    var w = {}; E.tree(a).forEach(function (t) { if (Math.abs(t.target) > 1e-9) w[t.id] = U.round(t.target, 2); });
    return { kind: 'weights', weights: w, indices: {} };
  }
  function saaBody(a, d, st) {
    var kind = st && st.saaKind != null ? st.saaKind : !d.saa ? '' : d.saa.kind === 'weights' ? 'weights' : 'other';
    var seg = '<div class="seg" role="group" aria-label="The SAA is">' + [['', 'Not set'], ['weights', 'Typed weights'], ['other', 'An allocation or benchmark']].map(function (o) { return '<button type="button" data-bq-saa="' + o[0] + '" aria-pressed="' + (kind === o[0]) + '">' + o[1] + '</button>'; }).join('') + '</div>';
    if (!kind) return seg + '<p class="bq-note">Until an SAA is entered, each category’s weight today, held in that category’s index, stands in for it. The SAA decision then shows only how the mix differs from the benchmark, and the card tags it <span class="tag tag-warn">Not set</span>.</p>';
    if (kind === 'weights') {
      var s = d.saa, held = {}, pol = CH.policyOf(allocOf(a, d)), pw = pol.holdings ? E.categoryWeights(pol.holdings) : {}, ix = INDICES();
      E.tree(a).forEach(function (t) { held[t.id] = t.target; });
      var rows = D.categories.map(function (c) {
        var has = c.index && c.index.length, cur = (s.indices || {})[c.id] || '';
        return '<tr><th scope="row"><span class="sw" style="background:' + c.color + '"></span>' + esc(c.name) + '</th><td class="num">' + F.num(held[c.id] || 0, 1) + '</td><td class="num">' + (pol.holdings ? F.num(pw[c.id] || 0, 1) : '—') + '</td>' +
          '<td class="num"><input type="number" class="input-sm bq-w" step="0.5" min="0" max="100" data-bq-w="' + esc(c.id) + '" value="' + (s.weights[c.id] == null ? '' : s.weights[c.id]) + '" aria-label="SAA weight, ' + esc(c.name) + '"></td>' +
          '<td><select class="input-sm" data-bq-ix="' + esc(c.id) + '" aria-label="Index for ' + esc(c.name) + '">' + (has ? '<option value="">' + esc(c.short) + ' Index</option>' : '<option value="">Choose an index…</option>') + ix.map(function (i) { return '<option value="' + esc(i.id) + '"' + (cur === i.id ? ' selected' : '') + '>' + esc(i.name) + '</option>'; }).join('') + '</select></td></tr>';
      }).join('');
      return seg + '<div class="bq-fill"><span>Start from</span><button type="button" class="btn btn-xs" data-bq-fill="held">What is held today</button>' + (pol.holdings ? '<button type="button" class="btn btn-xs" data-bq-fill="policy">The benchmark’s mix</button>' : '') + '</div>' +
        '<div class="tblwrap"><table class="tbl bq-weights"><thead><tr><th scope="col">Category</th><th scope="col" class="num">Held today</th><th scope="col" class="num">Benchmark</th><th scope="col" class="num">SAA weight, %</th><th scope="col">Held in</th></tr></thead><tbody>' + rows + '</tbody>' +
        '<tfoot><tr><th scope="row">Total</th><td class="num">' + F.num(U.sum(Object.keys(held), function (k) { return held[k]; }), 1) + '</td><td class="num">' + (pol.holdings ? F.num(U.sum(pol.holdings, function (h) { return h.weight; }), 1) : '—') + '</td><td class="num" data-bq-total></td><td data-bq-totalnote></td></tr></tfoot></table></div>';
    }
    var others = S.ws.allocations.filter(function (x) { return x.id !== a.id && x.kind !== 'level'; }), sel = d.saa && d.saa.kind === 'allocation' ? d.saa.id : null;
    return seg + '<div class="bm-group bq-allocs"><div class="bm-ghead">Allocations in this workspace · ' + others.length + '</div>' + (others.length ? others.map(function (x) {
      var hs = E.effective(x), prod = hs.filter(function (h) { return D.instrumentById[h.instrumentId].type !== 'Index'; }).length;
      return '<button type="button" class="bm-opt" data-bq-alloc="' + esc(x.id) + '" aria-pressed="' + (sel === x.id) + '"><span class="bm-main"><b>' + esc(x.name) + '</b><small>' + (prod ? prod + ' product' + (prod === 1 ? '' : 's') + ': their benchmarks would count as part of the next decision' : 'Indices only') + '</small></span>' + mix(hs) + '<span class="bm-tags"></span></button>';
    }).join('') : '<div class="faint small" style="padding:6px 10px">No other allocation in this workspace.</div>') + '</div><div data-bq-pick="saa"></div>';
  }
  function mappingBody(a, d, st) {
    var rows = mappingOf(a, d), rule = d.pb.mode === 'categoryIndex' ? 'categoryIndex' : 'stated', rank = function (r) { return REVIEW[r.source] && d.pb.mode === 'stated' ? 0 : r.source === 'override' ? 1 : 2; };
    var top = rows.filter(function (r) { return rank(r) < 2; }).sort(function (p, q) { return rank(p) - rank(q) || q.weight - p.weight; }), rest = rows.filter(function (r) { return rank(r) === 2; });
    var opts = function (cur) {
      var o = '<option value="">Follow the rule</option><optgroup label="Benchmarks">' + D.benchmarks.map(function (b) { return '<option value="benchmark:' + esc(b.id) + '"' + (cur === 'benchmark:' + b.id ? ' selected' : '') + '>' + esc(b.name) + '</option>'; }).join('') + '</optgroup>';
      o += '<optgroup label="Indices">' + INDICES().map(function (i) { return '<option value="instrument:' + esc(i.id) + '"' + (cur === 'instrument:' + i.id ? ' selected' : '') + '>' + esc(i.name) + '</option>'; }).join('') + '</optgroup>';
      return o + '<optgroup label="Products">' + D.instruments.filter(function (i) { return i.type !== 'Index' && !i.archived; }).map(function (i) { return '<option value="instrument:' + esc(i.id) + '"' + (cur === 'instrument:' + i.id ? ' selected' : '') + '>' + esc(i.name) + '</option>'; }).join('') + '</optgroup>';
    };
    var tr = function (r) {
      var o = d.pb.overrides[r.instrumentId], cur = o ? o.kind + ':' + o.id : '', c = D.categoryById[r.categoryId] || D.taxonomyById[r.categoryId] || {};
      return '<tr><th scope="row"><span class="sw" style="background:' + (c.color || '#c3cedb') + '"></span>' + esc(r.name) + '<small>' + esc(c.short || '') + '</small></th><td class="num">' + F.num(r.weight, 1) + '</td><td>' + esc(r.target.label) + (r.source === rule ? '' : ' <span class="tag' + (r.source === 'override' ? ' tag-edit' : REVIEW[r.source] ? ' tag-info' : '') + '">' + SOURCE[r.source] + '</span>') + '</td>' +
        '<td>' + (r.source === 'index' ? '' : '<select class="input-sm" data-bq-ov="' + esc(r.instrumentId) + '" aria-label="Benchmark for ' + esc(r.name) + '">' + opts(cur) + '</select>') + '</td></tr>';
    };
    var fold = rest.length && top.length ? '<tr class="bq-more"><td colspan="4"><button type="button" class="btn-link" data-bq-rest aria-expanded="' + !!st.rest + '">' + (st.rest ? 'Hide' : 'Show') + ' the ' + rest.length + ' that need' + (rest.length === 1 ? 's' : '') + ' no attention</button></td></tr>' : '';
    return '<div class="field bq-rule"><label for="bq-rule">Rule for every product</label><select id="bq-rule">' + RULES.map(function (r) { return '<option value="' + r[0] + '"' + (d.pb.mode === r[0] ? ' selected' : '') + '>' + esc(r[1]) + '</option>'; }).join('') + '</select></div>' +
      '<p class="bq-note">' + (top.length ? 'A product is tagged where it does not follow the rule as written. Those that may want a look come first.' : 'Every product follows the rule and none needs attention.') + '</p>' +
      '<div class="tblwrap"><table class="tbl bq-map"><thead><tr><th scope="col">Product</th><th scope="col" class="num">Weight</th><th scope="col">Measured against</th><th scope="col">Use instead</th></tr></thead><tbody>' + top.map(tr).join('') + fold + (st.rest || !top.length ? rest.map(tr).join('') : '') + '</tbody></table></div>';
  }
  function methodBody(a, d) {
    var cv = CH.conventionsOf(S.ws), ws = function (label) { return 'As the workspace sets it (' + label + ')'; }, impl = function (v) { return CH.IMPLEMENTATIONS.filter(function (r) { return r[0] === v; })[0][1]; };
    var sel = function (id, label, cur, first, list, hint) { return '<div class="field"><label for="' + id + '">' + label + '</label><select id="' + id + '"><option value="">' + esc(first) + '</option>' + list.map(function (o) { return '<option value="' + o[0] + '"' + (cur === o[0] ? ' selected' : '') + '>' + esc(o[1]) + '</option>'; }).join('') + '</select><span class="field-hint">' + hint + '</span></div>'; };
    return '<div class="dlg-grid">' + sel('bq-order', 'Order of the decisions', d.order, ws(CH.orderLabel(cv.order)), CH.ORDERS.concat([['averaged', CH.orderLabel('averaged')]]), 'Each decision is measured after the ones before it. The total does not change; the split between decisions can.') +
      sel('bq-impl', CH.LEVELS.productBenchmarks.short + ' decision', d.implementation, ws(impl(cv.implementation)), CH.IMPLEMENTATIONS, 'Taken as one decision, or as two: the weights held against the SAA, and the benchmarks of the products chosen.') + '</div>';
  }

  /* ── what the draft does: the call the card makes, on the draft ──── */
  function preview(al) {
    var cv = CH.conventionsOf(S.ws);
    return PA.api.chainAnalysis({ allocations: [U.clone(al)], chainAllocations: U.clone(S.ws.allocations.filter(function (x) { return x.id !== al.id; })), basis: 'forward', period: U.clone(S.ws.prefs.period), scenario: U.clone(S.activeScenario() || null), factorModel: PA.cards.workspaceModel(), rowKey: '__total', decompose: 'category', step: 'saa', order: 'chain', implementation: null,
      method: { model: cv.attributionModel, interaction: cv.interaction, returns: 'arithmetic', linking: cv.linking, currency: cv.currency === 'separate' ? 'none' : cv.currency, unallocated: cv.unallocated, order: cv.order, implementation: cv.implementation }, risk: { basis: 'default', units: 'te', stepRisk: 'contribution', columns: 'euler' }, overTime: 'years' }).then(function (r) { return r.series[0]; });
  }
  function resultHtml(x, name) {
    var y = x && x.forward;
    if (!x || x.reason || !y || y.reason) return '<p class="bq-rnote">' + esc((x && x.reason) || (y && y.reason) || 'Not calculated.') + '</p>';
    var lv = y.levelReturns, act = lv[lv.length - 1] - lv[0], te = y.risk ? y.risk.total : null, first = x.levels.filter(function (l) { return l.holdings; })[0];
    return '<div class="bq-flow"><span><em>' + esc(first.label) + '</em> ' + F.num(lv[0], 2) + '</span>' + y.steps.map(function (s) { return '<span><em>' + esc(s.meta.short) + '</em> ' + sgn(s.total) + '</span>'; }).join('') + '<span><em>' + esc(name) + '</em> ' + F.num(lv[lv.length - 1], 2) + '</span></div>' +
      '<p class="bq-rnote">Forward-looking, % a year · ' + (Math.abs(act) < 0.005 ? 'level with the benchmark' : F.num(Math.abs(act), 2) + (act > 0 ? ' ahead of' : ' behind') + ' the benchmark') + (te == null ? '' : ' · tracking error ' + F.num(te, 2)) + ' · updates as you change anything here' + (x.partial ? ' · <span class="warn-ink">' + esc(x.partial.join(', ')) + '</span>' : '') + '</p>';
  }

  /** Another allocation's benchmark, SAA, rule and method as a draft for `to`. Changes made product by product stay with the products. */
  function copyOf(from, to, overrides) {
    var d = draftOf(from); d.pb = { mode: d.pb.mode, overrides: U.clone(overrides || {}) };
    if (d.saa && d.saa.kind === 'allocation' && d.saa.id === to.id) d.saa = null;
    return d;
  }
  /** Give other allocations the benchmark, SAA, rule and method of one, as one edit. */
  X.applyTo = function (from, ids) {
    var src = S.allocation(from.id); if (!src || !ids.length) return;
    var names = ids.map(function (id) { return S.allocation(id).name; });
    S.update('Benchmarks copied from ' + src.name + ' to ' + names.join(', '), function (ws) {
      var s = ws.allocations.filter(function (x) { return x.id === src.id; })[0];
      ws.allocations.forEach(function (x) {
        if (ids.indexOf(x.id) < 0) return;
        var d = copyOf(s, x, draftOf(x).pb.overrides), c = chainOfDraft(d);
        x.benchmarkId = d.benchmarkId; if (c) x.chain = c; else delete x.chain;
      });
    }, { type: 'edit', detail: names.join(' · ') });
    UI.toast('Benchmarks copied to ' + names.join(', ') + '.', { action: { label: 'Undo', fn: S.undo } });
  };
  /** Open the Decision chain card, adding it when the workspace has none. */
  X.openCard = function (a) {
    var c = S.ws.cards.filter(function (x) { return x.type === 'decision-chain'; })[0] || PA.cards.addCardOfType('decision-chain', {}, false);
    if (!c) return;
    /* the card opens on the allocation just saved, when it is in the comparison */
    if (a && a.id && S.ws.comparison.members.indexOf(a.id) >= 0) { (PA.cards.state[c.id] = PA.cards.state[c.id] || {}).wf = a.id; PA.cards.repaint(c.id); }
    PA.cards.scrollToCard(c.id);
  };

  /* ── the dialog ──────────────────────────────────────────────────── */
  /** opts: {focus: 'policy'|'saa'|'mapping'|'method'} opens on that question. */
  X.open = function (a, opts) {
    opts = opts || {};
    if (!a || a.kind === 'level') return;
    UI.benchmarks.refresh().then(function () {
      a = S.allocation(a.id) || a;
      var d = draftOf(a), open = d.benchmarkId ? (opts.focus || null) : 'policy', st = { rest: false, saaKind: null }, root, tick = 0, timer = null, B = UI.benchmarks;
      var sec = function (r) { return '<section class="bq-row' + (r[0] === 'method' ? ' is-quiet' : '') + '" data-bq="' + r[0] + '"><div class="bq-head"></div><div class="bq-body" id="bq-body-' + r[0] + '" hidden></div></section>'; };
      var pin = function (cur, id, use) { return !use && B.baseId(cur) === id ? cur : B.pinId(id); };
      var heads = function () {
        var f = document.activeElement && root.contains(document.activeElement) ? document.activeElement.getAttribute('data-bq-open') : null;
        ROWS.forEach(function (r) { var s = U.$('[data-bq="' + r[0] + '"]', root); s.classList.toggle('is-open', open === r[0]); U.$('.bq-head', s).innerHTML = headHtml(r, a, d, open); });
        if (f) { var b = U.$('[data-bq-open="' + f + '"]', root); if (b) b.focus(); }
      };
      var result = function (soon) {
        clearTimeout(timer); if (soon) { timer = setTimeout(result, 260); return; }
        var el = U.$('.bq-result', root), seq = ++tick;
        if (!d.benchmarkId) { el.innerHTML = '<p class="bq-rnote">Choose a benchmark to see what each decision adds or costs.</p>'; return; }
        el.classList.add('is-busy');
        preview(allocOf(a, d)).then(function (x) { if (seq !== tick || !document.contains(el)) return; el.classList.remove('is-busy'); el.innerHTML = resultHtml(x, a.name); },
          function () { if (seq !== tick || !document.contains(el)) return; el.classList.remove('is-busy'); el.innerHTML = '<p class="bq-rnote">The result could not be calculated just now.</p>'; });
      };
      var total = function () {
        var t = U.$('[data-bq-total]', root); if (!t || !d.saa || d.saa.kind !== 'weights') return;
        var sum = U.round(U.sum(Object.keys(d.saa.weights), function (k) { return +d.saa.weights[k] || 0; }), 2), off = U.round(100 - sum, 2);
        t.textContent = F.num(sum, 1);
        U.$('[data-bq-totalnote]', root).innerHTML = Math.abs(off) < 0.051 ? '<span class="tag tag-ok">Adds up</span>' : '<span class="tag tag-warn">' + F.num(Math.abs(off), 1) + (off > 0 ? ' to allocate' : ' over') + '</span>';
      };
      var bodyOf = function (k) { return k === 'policy' ? policyBody(a, d) : k === 'saa' ? saaBody(a, d, st) : k === 'mapping' ? mappingBody(a, d, st) : methodBody(a, d); };
      var mount = function (k, body) {
        var leave = function () { ctx.close(); };
        var host = function (n) { return U.$('[data-bq-pick="' + n + '"]', body); };
        if (k === 'policy') {
          B.picker(host('benchmark'), { selected: d.benchmarkId, compact: true, onLeave: leave, onPick: function (id, use) { var was = d.benchmarkId; d.benchmarkId = pin(d.benchmarkId, id, use); if (!was || use) paint(true); else { heads(); result(); } } });
          if (host('other')) B.picker(host('other'), { selected: d.other, compact: true, onLeave: leave, onPick: function (id, use) { d.other = pin(d.other, id, use); if (use) paint(true); else { heads(); result(); } } });
        }
        if (k === 'saa' && host('saa')) B.picker(host('saa'), { selected: d.saa && d.saa.kind === 'benchmark' ? d.saa.id : null, compact: true, onLeave: leave, onPick: function (id, use) { d.saa = { kind: 'benchmark', id: pin(d.saa && d.saa.kind === 'benchmark' ? d.saa.id : null, id, use) }; U.$$('[data-bq-alloc]', body).forEach(function (x) { x.setAttribute('aria-pressed', 'false'); }); heads(); result(); } });
        if (k === 'saa') total();
      };
      var paint = function (full) {
        if (st.saaKind == null || open !== 'saa') st.saaKind = !d.saa ? '' : d.saa.kind === 'weights' ? 'weights' : 'other';
        ROWS.forEach(function (r) {
          var body = U.$('#bq-body-' + r[0], root);
          if (open !== r[0]) { body.hidden = true; body.innerHTML = ''; }
          else if (full || body.hidden) { body.hidden = false; body.innerHTML = bodyOf(r[0]); mount(r[0], body); }
        });
        heads(); result();
      };
      var again = function (sel) { paint(true); var el = sel && U.$(sel, root); if (el) el.focus(); };
      var invalid = function () {
        if (d.saa && d.saa.kind === 'weights') {
          var sum = U.sum(Object.keys(d.saa.weights), function (k) { return +d.saa.weights[k] || 0; });
          if (Math.abs(sum - 100) > 0.051) return ['saa', 'The SAA weights add up to ' + F.num(sum, 1) + '%. They must total 100%.'];
          var lost = D.categories.filter(function (c) { return (+d.saa.weights[c.id] || 0) > 0 && !(c.index && c.index.length) && !(d.saa.indices || {})[c.id]; });
          if (lost.length) return ['saa', 'Choose an index for ' + lost.map(function (c) { return c.name; }).join(', ') + '.'];
        }
        return null;
      };
      var save = function (c, thenOpen) {
        var bad = invalid();
        if (bad) { open = bad[0]; paint(true); U.$('#bq-err', root).textContent = bad[1]; return false; }
        var changes = changesOf(a, d), next = chainOfDraft(d);
        if (changes.length) {
          S.update(a.name + ' benchmarks changed', function (ws) { var x = ws.allocations.filter(function (y) { return y.id === a.id; })[0]; x.benchmarkId = d.benchmarkId; if (next) x.chain = next; else delete x.chain; }, { type: 'edit', detail: changes.join(' · ') });
          var bare = d.benchmarkId ? S.ws.allocations.filter(function (x) { return x.id !== a.id && x.kind !== 'level' && !x.benchmarkId; }) : [];
          UI.toast('Benchmarks saved for ' + a.name + '.' + (bare.length ? ' ' + (bare.length === 1 ? bare[0].name + ' has' : bare.length + ' other allocations have') + ' no benchmark yet.' : ''), { action: bare.length ? { label: bare.length === 1 ? 'Use the same for ' + bare[0].name : 'Use the same for them', fn: function () { X.applyTo(a, bare.map(function (x) { return x.id; })); } } : { label: 'Undo', fn: S.undo } });
        }
        if (thenOpen) setTimeout(function () { X.openCard(a); }, 0);
      };
      var ctx = UI.openDialog({ title: 'Benchmarks · ' + a.name, sub: 'What ' + esc(a.name) + ' is measured against, at each level. A benchmark is enough to start: the other answers have defaults.', wide: true,
        body: '<div class="bq" id="bq">' + ROWS.slice(0, 3).map(sec).join('') + '<div class="bq-result" aria-live="polite"></div>' + sec(ROWS[3]) + '<span class="field-err wide" id="bq-err" role="alert"></span></div>',
        onOpen: function (dlg) {
          root = U.$('#bq', dlg); paint(true);
          U.on(root, 'click', '[data-bq-open]', function (e, b) { var k = b.dataset.bqOpen; open = open === k ? null : k; st.saaKind = null; U.$('#bq-err', root).textContent = ''; paint(); var nb = U.$('[data-bq-open="' + k + '"]', root); if (nb) nb.focus(); });
          U.on(root, 'change', '[data-bq-other]', function (e, x) { d.other = x.checked ? d.benchmarkId : null; again('[data-bq-other]'); });
          U.on(root, 'click', '[data-bq-none]', function () { d.benchmarkId = null; d.other = null; again('.bm-q'); });
          U.on(root, 'click', '[data-bq-saa]', function (e, b) { var k = b.dataset.bqSaa; if (d.saa) st[d.saa.kind === 'weights' ? 'typed' : 'chosen'] = d.saa; st.saaKind = k; d.saa = !k ? null : k === 'weights' ? (st.typed || U.clone(weightsOf(a, d))) : (st.chosen || null); again('[data-bq-saa="' + k + '"]'); });
          U.on(root, 'input', '[data-bq-w]', function (e, x) { var v = parseFloat(x.value); if (isFinite(v) && v > 0) d.saa.weights[x.dataset.bqW] = v; else delete d.saa.weights[x.dataset.bqW]; total(); heads(); result(true); });
          U.on(root, 'change', '[data-bq-ix]', function (e, x) { d.saa.indices = d.saa.indices || {}; if (x.value) d.saa.indices[x.dataset.bqIx] = x.value; else delete d.saa.indices[x.dataset.bqIx]; heads(); result(); });
          U.on(root, 'click', '[data-bq-fill]', function (e, b) {
            var w = {}, pol = CH.policyOf(allocOf(a, d)), pw = b.dataset.bqFill === 'policy' && pol.holdings ? E.categoryWeights(pol.holdings) : null;
            if (pw) Object.keys(pw).forEach(function (k) { if (pw[k] > 1e-9) w[k] = U.round(pw[k], 2); }); else E.tree(a).forEach(function (t) { if (t.target > 1e-9) w[t.id] = U.round(t.target, 2); });
            d.saa = { kind: 'weights', weights: w, indices: (d.saa && d.saa.indices) || {} }; again('[data-bq-fill="' + b.dataset.bqFill + '"]');
          });
          U.on(root, 'click', '[data-bq-alloc]', function (e, b) { d.saa = { kind: 'allocation', id: b.dataset.bqAlloc }; again('[data-bq-alloc="' + b.dataset.bqAlloc + '"]'); });
          U.on(root, 'change', '#bq-rule', function (e, x) { d.pb.mode = x.value; again('#bq-rule'); });
          U.on(root, 'change', '[data-bq-ov]', function (e, x) { var p = x.value.split(':'); if (x.value) d.pb.overrides[x.dataset.bqOv] = { kind: p[0], id: p.slice(1).join(':') }; else delete d.pb.overrides[x.dataset.bqOv]; again('[data-bq-ov="' + x.dataset.bqOv + '"]'); });
          U.on(root, 'click', '[data-bq-rest]', function () { st.rest = !st.rest; again('[data-bq-rest]'); });
          U.on(root, 'change', '#bq-order', function (e, x) { d.order = x.value || null; heads(); result(); });
          U.on(root, 'change', '#bq-impl', function (e, x) { d.implementation = x.value || null; heads(); result(); });
        },
        actions: [{ label: 'Copy from…', ghost: true, close: false, onClick: function (c) {
          var list = S.ws.allocations.filter(function (x) { return x.id !== a.id && x.kind !== 'level' && x.benchmarkId; });
          UI.menu(U.$('[data-action="0"]', c.el), list.length ? [{ head: 'Use the benchmarks of' }].concat(list.map(function (x) { return { label: x.name, onClick: function () { d = copyOf(x, a, d.pb.overrides); st.saaKind = null; st.typed = st.chosen = null; if (!open && !d.benchmarkId) open = 'policy'; paint(true); U.announce('Copied from ' + x.name + '. Nothing is saved until you choose Save.'); } }; })) : [{ label: 'No other allocation has a benchmark', disabled: true }], { align: 'start' });
          return false;
        } }, { spacer: true, label: 'Cancel', ghost: true }, { label: 'Save', onClick: function (c) { return save(c, false); } }, { label: 'Save and open the card', primary: true, onClick: function (c) { return save(c, true); } }] });
    });
  };

  /* ── after the dialog ────────────────────────────────────────────── */
  /** Follow a row in Active risk & return, against the allocation's own benchmark. */
  X.showAgainstBenchmark = function (a, key) {
    S.setPref('selectedRow', key);
    var list = S.ws.cards.filter(function (c) { return c.type === 'active-risk'; });
    if (!list.length) { var card = PA.cards.addCardOfType('active-risk', { basis: 'forward', against: 'own', view: 'summary' }, true); UI.toast('Added Active risk & return, following ' + PA.cards.rowLabel(key) + ' against its own benchmark.'); return card; }
    list.forEach(function (c) { var p = U.clone(c.settings || {}); p.against = 'own'; S.updateCard(c.id, { settings: p, followRow: true }); });
    PA.cards.scrollToCard(list[0].id);
    UI.toast('Active risk & return now follows ' + PA.cards.rowLabel(key) + ' against its own benchmark.');
    return list[0];
  };

  /** Attribution conventions: workspace defaults the cards copy into their requests. */
  X.conventions = function () {
    var cur = CH.conventionsOf(S.ws), L = CH.LABELS;
    var field = function (key, label, opts, hint) { return '<div class="field"><label for="cv-' + key + '">' + label + '</label><select id="cv-' + key + '">' + opts.map(function (o) { return '<option value="' + o[0] + '"' + (cur[key] === o[0] ? ' selected' : '') + (o[2] ? ' disabled' : '') + '>' + esc(o[1] + (o[2] ? ' — ' + o[2] : '')) + '</option>'; }).join('') + '</select>' + (hint ? '<span class="field-hint">' + esc(hint) + '</span>' : '') + '</div>'; };
    UI.openDialog({ title: 'Attribution conventions', sub: 'Workspace defaults for return attribution. Cards that attribute return use them unless set otherwise, and say so in their subtitle when they depart.', wide: true,
      body: '<div class="dlg-grid">' +
        field('attributionModel', 'Attribution model', [['BF', L.attributionModel.BF], ['BHB', L.attributionModel.BHB]], 'Totals are the same; the split between groups differs.') +
        field('interaction', 'Interaction', [['selection', L.interaction.selection], ['allocation', L.interaction.allocation], ['separate', L.interaction.separate]]) +
        field('linking', 'Multi-period linking (historical)', [['carino', L.linking.carino], ['menchero', L.linking.menchero], ['grap', L.linking.grap], ['frongello', L.linking.frongello], ['none', L.linking.none]], 'Geometric active return links geometrically, whatever is set here.') +
        field('currency', 'Currency', [['none', L.currency.none], ['fxFactor', L.currency.fxFactor], ['separate', L.currency.separate, 'needs local-currency returns']], 'All returns are in the reporting currency (' + S.ws.currency + ').') +
        field('unallocated', 'Unallocated weight', [['zero', L.unallocated.zero], ['cash', L.unallocated.cash]], 'Zero return is the rule elsewhere in the workspace.') +
        field('fees', 'Fee basis', [['net', L.fees.net + ' (the platform’s basis)'], ['gross', L.fees.gross]], 'Changes every return figure in this workspace.') +
        field('order', 'Order of the decisions', CH.ORDERS.concat([['averaged', CH.orderLabel('averaged')]]), 'Each decision is measured after the ones before it. An allocation can set its own in Benchmarks.') +
        field('implementation', CH.LEVELS.productBenchmarks.short + ' decision', CH.IMPLEMENTATIONS, 'As one decision, or as two: the weights held against the SAA, and the benchmarks of the products chosen.') + '</div>',
      actions: [{ label: 'Reset to defaults', ghost: true, close: false, onClick: function (c) { Object.keys(CH.CONVENTIONS).forEach(function (k) { var el = U.$('#cv-' + k, c.el); if (el) el.value = CH.CONVENTIONS[k]; }); return false; } }, { spacer: true, label: 'Cancel', ghost: true }, { label: 'Save', primary: true, onClick: function (c) {
        var next = {}; Object.keys(CH.CONVENTIONS).forEach(function (k) { var el = U.$('#cv-' + k, c.el); next[k] = el ? el.value : cur[k]; });
        var changed = Object.keys(next).filter(function (k) { return next[k] !== cur[k]; }); if (!changed.length) return;
        S.update('Attribution conventions changed', function (ws) { ws.conventions = next; }, { type: 'edit', detail: changed.map(function (k) { return L[k][cur[k]] + ' → ' + L[k][next[k]]; }).join(' · ') });
        UI.toast('Attribution conventions saved. Cards that follow them recalculate.', { action: { label: 'Undo', fn: S.undo } });
      } }] });
  };
  /** Conventions that differ from the defaults, in words (the export context line). */
  X.departures = function (ws) { var c = CH.conventionsOf(ws), out = []; Object.keys(CH.CONVENTIONS).forEach(function (k) { if (c[k] !== CH.CONVENTIONS[k]) out.push(CH.LABELS[k][c[k]]); }); return out; };
})();

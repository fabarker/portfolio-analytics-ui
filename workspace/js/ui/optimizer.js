/* ─────────────────────────────────────────────────────────────────────────
   Portfolio Analytics · the Optimize tab of the builder rail
   Mean-variance optimisation of the allocation being edited. Pick one
   objective and its target, set the constraints, Optimise. The result shows
   the frontier with the allocation now and proposed, the figures before and
   after, and every weight that moves; Apply writes it to the allocation as
   one undoable edit, or Save as new allocation keeps the original and adds
   the proposal to the comparison. Nothing changes until one of those.

   Targets start where the allocation is now (its return, its volatility,
   its tracking error), so the first run answers "the same, but better".
   ───────────────────────────────────────────────────────────────────────── */
(function () {
  'use strict';
  var PA = window.PA, U = PA.util, esc = U.esc, S = PA.store, UI = PA.ui, D = PA.data, E = PA.engine, I = U.icon, F = U.fmt;
  var O = UI.optimizer = {};
  var OBJ = [
    { id: 'minVol', label: 'Minimise volatility', sub: 'for a target return', unit: 'Target return' },
    { id: 'maxReturn', label: 'Maximise return', sub: 'for a target volatility', unit: 'Target volatility' },
    { id: 'active', label: 'Return vs tracking error', sub: 'against the benchmark', unit: null }
  ];
  var st = {}; /* allocation id → {objective, teMode, targets:{}, longOnly, maxWeight, bandOn, band, useIndices, includeAll, preview, previewSig, result, resultSig, running, error} */
  function stateOf(a) {
    return st[a.id] || (st[a.id] = { objective: 'minVol', teMode: 'target', teTo: 'benchmark', targets: {}, longOnly: true, maxWeight: '30', bandOn: false, band: '5', useIndices: false, includeAll: false, preview: null, previewSig: null, result: null, resultSig: null, running: false, error: null });
  }
  /** What the result depends on: the weights, the benchmark, the scenario and the factor model. */
  function sigOf(a) { return JSON.stringify([a.holdings.map(function (h) { return [h.instrumentId, h.weight]; }), E.categoryTargets(a), a.benchmarkId, a.chain || null, S.ws.activeScenarioId, S.ws.prefs.factorModel]); }
  /** What tracking error is measured to: the assigned benchmark, or a level of the decision chain. */
  function teRef(a, s) {
    var to = a.chain ? s.teTo : 'benchmark';
    if (to === 'benchmark') { var b = a.benchmarkId ? D.benchmarkById[a.benchmarkId] : null; return b ? { label: b.name } : null; }
    var lv = to === 'policy' ? PA.chain.policyOf(a) : PA.chain.saaOf(a, S.ws.allocations);
    return lv.holdings ? { label: (to === 'policy' ? 'the policy benchmark ' : 'the SAA ') + lv.label } : null;
  }
  function optionsOf(s, preview) {
    var mw = Number(String(s.maxWeight).replace(',', '.')), bd = Number(String(s.band).replace(',', '.'));
    return { objective: s.objective, teMode: s.teMode, teTo: s.teTo || 'benchmark', target: Number(String(targetOf(s)).replace(',', '.')), longOnly: s.longOnly, maxWeight: isFinite(mw) && mw > 0 ? mw : 100, band: s.bandOn && isFinite(bd) && bd >= 0 ? bd : null, useIndices: s.useIndices, includeAll: s.includeAll, preview: !!preview };
  }
  function targetKey(s) { return s.objective === 'active' ? (s.teMode === 'min' ? 'activeRet' : 'activeTE') : s.objective; }
  function targetOf(s) { return s.targets[targetKey(s)]; }
  function scenario() { var w = S.ws; return w.activeScenarioId ? U.clone(w.scenarios.filter(function (x) { return x.id === w.activeScenarioId; })[0] || null) : null; }
  function request(a, s, preview) { var o = optionsOf(s, preview); if (!a.chain) o.teTo = 'benchmark'; return { allocation: U.clone(a), chainAllocations: PA.cards.chainPool([a]), scenario: scenario(), factorModel: PA.cards.workspaceModel(), options: o }; }

  /** Fetch where the allocation is now and what the constraints reach; seeds the targets. */
  function loadPreview(a, s) {
    var sig = sigOf(a) + JSON.stringify(optionsOf(s, true)).replace(/"target":[^,]*,/, '');
    if (s.previewSig === sig) return;
    s.previewSig = sig;
    PA.api.optimize(request(a, s, true)).then(function (p) {
      if (s.previewSig !== sig) return;
      s.preview = p;
      if (p.current) {
        var c = p.current, t = s.targets;
        if (t.minVol == null) t.minVol = F.num(c.ret, 2);
        if (t.maxReturn == null) t.maxReturn = F.num(c.vol, 2);
        if (t.activeTE == null) t.activeTE = c.te != null ? F.num(Math.max(c.te, p.rangeTE ? p.rangeTE.minRisk + 0.05 : 0), 2) : '2.00';
        if (t.activeRet == null) t.activeRet = F.num(c.ret, 2);
      }
      repaint(a);
    }, function () { s.preview = { error: 'The analytics service did not respond.' }; repaint(a); });
  }
  function repaint(a) { if (S.ws && S.active() && S.active().id === a.id && UI.builder.currentTab() === 'optimize') UI.builder.render(); }

  /* ── render ──────────────────────────────────────────────────────── */
  O.render = function (a) {
    if (a.kind !== 'live') return '<div class="rail-readonly">' + I.lock + '<div><b>' + esc(a.name) + ' is read-only.</b> Snapshots and compared sleeves cannot be re-weighted. Switch to a live allocation in the header, or make an editable copy, to optimise it.</div></div>';
    var s = stateOf(a); loadPreview(a, s);
    var p = s.preview && !s.preview.error ? s.preview : null, bm = teRef(a, s);
    var now = p ? p.current : null;
    var nowLine = '<div class="op-now" aria-live="polite">' + (now ? 'Now · return <b>' + F.num(now.ret, 2) + '%</b> · volatility <b>' + F.num(now.vol, 2) + '%</b>' + (now.te != null ? ' · tracking error <b>' + F.num(now.te, 2) + '%</b>' : '') : s.preview && s.preview.error ? esc(s.preview.error) : 'Reading the allocation…') + '</div>';
    var obj = '<div class="rail-sec"><span class="rail-eyebrow" id="op-obj-l">Objective</span><div class="op-objs" role="radiogroup" aria-labelledby="op-obj-l">' + OBJ.map(function (o) {
      var on = s.objective === o.id;
      return '<label class="op-obj' + (on ? ' is-on' : '') + '"><input type="radio" name="op-obj" value="' + o.id + '" data-fkey="op-obj:' + o.id + '"' + (on ? ' checked' : '') + '><span><b>' + o.label + '</b><small>' + (o.id === 'active' ? (bm ? 'against ' + esc(bm.label) : 'needs a benchmark') : o.sub) + '</small></span></label>';
    }).join('') + '</div>' + targetHtml(a, s, p, bm) + '</div>';
    var cons = '<div class="rail-sec"><span class="rail-eyebrow">Constraints</span>' +
      '<label class="switch"><input type="checkbox" id="op-long" data-fkey="op-long"' + (s.longOnly || !a.leverage ? ' checked' : '') + (a.leverage ? '' : ' disabled') + '><span class="track"></span><span>Long only</span></label>' + (a.leverage ? '' : '<div class="field-hint">Shorts need shorts &amp; leverage enabled on the allocation (Check).</div>') +
      '<div class="op-field"><label for="op-maxw">Maximum per holding</label><span class="op-in"><input type="text" inputmode="decimal" id="op-maxw" data-fkey="op-maxw" value="' + esc(s.maxWeight) + '" autocomplete="off"><i>%</i></span></div>' +
      '<label class="switch"><input type="checkbox" id="op-band-on" data-fkey="op-band-on"' + (s.bandOn ? ' checked' : '') + '><span class="track"></span><span>Keep categories near today’s weights</span></label>' +
      (s.bandOn ? '<div class="op-field"><label for="op-band">Within ±</label><span class="op-in"><input type="text" inputmode="decimal" id="op-band" data-fkey="op-band" value="' + esc(s.band) + '" autocomplete="off"><i>pp</i></span></div>' : '') +
      '<label class="switch"><input type="checkbox" id="op-idx" data-fkey="op-idx"' + (s.useIndices ? ' checked' : '') + '><span class="track"></span><span>Use category indices</span></label>' +
      '<label class="switch"><input type="checkbox" id="op-all" data-fkey="op-all"' + (s.includeAll ? ' checked' : '') + '><span class="track"></span><span>Include categories not held</span></label>' +
      '<div class="field-hint">' + (s.useIndices ? 'Each held category’s index can take weight from its products.' : 'The holdings are re-weighted; no index is added.') + ' The total stays at ' + F.num(E.allocated(a)) + '%.</div></div>';
    var go = '<div class="op-go"><button type="button" class="btn btn-primary" id="op-run" data-fkey="op-run"' + (s.running || (s.objective === 'active' && !bm) ? ' disabled' : '') + '>' + I.target + '<span>' + (s.running ? 'Optimising…' : 'Optimise') + '</span></button>' + (s.result ? '<button type="button" class="btn btn-ghost btn-sm" id="op-clear" data-fkey="op-clear">Clear result</button>' : '') + '</div>';
    return '<div class="op">' + nowLine + obj + cons + go + '<div id="op-result">' + resultHtml(a, s) + '</div></div>';
  };
  function targetHtml(a, s, p, bm) {
    var to = s.objective === 'active' && a.chain ? '<div class="op-seg op-teto" role="group" aria-label="Tracking error to"><span class="op-seg-l">Tracking error to</span>' + [['benchmark', 'Assigned benchmark'], ['policy', 'Policy benchmark'], ['saa', 'SAA']].map(function (o) { return '<button type="button" data-teto="' + o[0] + '" aria-pressed="' + ((s.teTo || 'benchmark') === o[0]) + '">' + o[1] + '</button>'; }).join('') + '</div>' : '';
    if (s.objective === 'active' && !bm) return to + '<div class="op-need">' + I.info + '<span>' + (a.chain && s.teTo !== 'benchmark' ? 'The decision chain of ' + esc(a.name) + ' has no ' + (s.teTo === 'policy' ? 'policy benchmark' : 'SAA') + '. <button type="button" class="btn-link" id="op-chain">Open the decision chain</button>' : 'Tracking error is measured against the allocation’s benchmark, and ' + esc(a.name) + ' has none. <button type="button" class="btn-link" id="op-bench">Assign a benchmark</button>') + '</span></div>';
    var mode = to + (s.objective === 'active' ? '<div class="op-seg" role="group" aria-label="Tracking error"><button type="button" data-temode="target" aria-pressed="' + (s.teMode === 'target') + '">Maximise return at a tracking error</button><button type="button" data-temode="min" aria-pressed="' + (s.teMode === 'min') + '">Minimise tracking error for a return</button></div>' : '');
    var label = s.objective === 'minVol' || (s.objective === 'active' && s.teMode === 'min') ? 'Target return' : s.objective === 'maxReturn' ? 'Target volatility' : 'Target tracking error';
    var isRet = label === 'Target return', rng = p ? (s.objective === 'active' ? p.rangeTE : p.rangeVol) : null;
    var hint = rng ? (isRet ? 'Reachable ' + F.num(rng.minRet, 2) + '–' + F.num(rng.maxRet, 2) + '%' : 'Reachable from ' + F.num(rng.minRisk, 2) + '%') : '';
    return mode + '<div class="op-field op-target"><label for="op-target">' + label + '</label><span class="op-in"><input type="text" inputmode="decimal" id="op-target" data-fkey="op-target" value="' + esc(targetOf(s) == null ? '' : targetOf(s)) + '" autocomplete="off" aria-describedby="op-target-h"><i>% a year</i></span></div><div class="field-hint" id="op-target-h">' + hint + (hint ? ' under these constraints.' : '') + '</div>';
  }

  function resultHtml(a, s) {
    if (s.error) return '<div class="op-msg is-bad" role="alert">' + I.warn + '<span>' + esc(s.error) + '</span></div>';
    var r = s.result; if (!r) return '';
    if (r.error) return '<div class="op-msg is-bad" role="alert">' + I.warn + '<span>' + esc(r.error) + '</span></div>';
    var stale = s.resultSig !== sigOf(a);
    var te = r.riskUnit === 'te', unitName = te ? 'Tracking error' : 'Volatility';
    var head = '<div class="rail-sec op-res"><div class="rail-sec-head"><span class="rail-eyebrow">Result</span>' + (stale ? '<span class="tag tag-warn">Out of date</span>' : '') + '</div>';
    if (r.reason) return head + '<div class="op-msg" role="status">' + I.info + '<span>' + esc(r.reason) + '</span></div>' + frontierSvg(a, r) + '</div>';
    var c = r.current, n = r.proposed;
    var row = function (label, x, y, dp, unit, better) { var d = x == null || y == null ? null : y - x; return '<tr><th>' + label + '</th><td>' + (x == null ? '—' : F.num(x, dp) + unit) + '</td><td><b>' + (y == null ? '—' : F.num(y, dp) + unit) + '</b></td><td class="' + (d == null || Math.abs(d) < Math.pow(10, -dp) ? '' : (better(d) ? 'pos' : 'neg')) + '">' + (d == null ? '' : F.signed(d, dp)) + '</td></tr>'; };
    var up = function (d) { return d > 0; }, down = function (d) { return d < 0; };
    var figs = '<table class="op-figs"><thead><tr><th></th><th>Now</th><th>Optimised</th><th>Change</th></tr></thead><tbody>' + row('Return', c.ret, n.ret, 2, '%', up) + row('Volatility', c.vol, n.vol, 2, '%', down) + row('Sharpe ratio', c.sharpe, n.sharpe, 2, '', up) + (n.te != null ? row('Tracking error', c.te, n.te, 2, '%', down) + row('Information ratio', c.ir, n.ir, 2, '', up) : '') + '</tbody></table>';
    var moved = r.assets.filter(function (x) { return Math.abs(x.proposed - x.current) >= 0.005; }).length;
    var acts = stale ? '<div class="op-msg" role="status">' + I.info + '<span>' + esc(a.name) + ' changed since this ran. <button type="button" class="btn-link" id="op-rerun">Optimise again</button></span></div>'
      : '<div class="op-acts"><button type="button" class="btn btn-primary btn-sm" id="op-apply" data-fkey="op-apply"' + (moved ? '' : ' disabled') + '>' + I.check + '<span>Apply to ' + esc(a.name) + '</span></button><button type="button" class="btn btn-sm" id="op-save" data-fkey="op-save"' + (moved ? '' : ' disabled') + '>' + I.plus + '<span>Save as new allocation</span></button></div>';
    return head + (r.note ? '<div class="op-msg" role="status">' + I.info + '<span>' + esc(r.note) + '</span></div>' : '') + frontierSvg(a, r) + figs + changesHtml(r) + acts + '<div class="field-hint">' + moved + ' weight' + (moved === 1 ? '' : 's') + ' move. Return and volatility use the platform assumptions' + (S.ws.activeScenarioId ? ' (with the active scenario where it applies)' : '') + '; tracking error uses the ' + esc(E.modelOf(r.model).name) + ' factor model, as the cards do.</div></div>';
  }
  /** Weight changes, by category, products under it. */
  function changesHtml(r) {
    var byCat = {}; r.assets.forEach(function (x) { (byCat[x.categoryId] = byCat[x.categoryId] || []).push(x); });
    var max = Math.max.apply(null, r.assets.map(function (x) { return Math.abs(x.proposed - x.current); }).concat([0.5]));
    var bar = function (d) { var w = Math.min(Math.abs(d) / max, 1) * 50; return '<span class="op-bar" aria-hidden="true"><i class="' + (d >= 0 ? 'up' : 'dn') + '" style="' + (d >= 0 ? 'left:50%' : 'right:50%') + ';width:' + w + '%"></i></span>'; };
    var line = function (x, cls, color) { var d = x.proposed - x.current, same = Math.abs(d) < 0.005; return '<tr class="' + cls + (same ? ' is-same' : '') + '"><th>' + (color ? '<span class="ttile" style="background:' + color + '"></span>' : '') + '<span>' + esc(x.label) + '</span></th><td>' + F.num(x.current, 1) + '</td><td><b>' + F.num(x.proposed, 1) + '</b></td><td>' + bar(d) + '</td><td class="' + (same ? '' : d > 0 ? 'pos' : 'neg') + '">' + (same ? '—' : F.signed(d, 1)) + '</td></tr>'; };
    var rows = D.categories.filter(function (c) { return byCat[c.id]; }).map(function (c) {
      var xs = byCat[c.id], tot = { label: c.short, current: U.sum(xs, function (x) { return x.current; }), proposed: U.sum(xs, function (x) { return x.proposed; }) };
      return line(tot, 'is-cat', c.color) + xs.map(function (x) { return line(x, 'is-leaf'); }).join('');
    }).join('');
    return '<table class="op-chg" aria-label="Weights now and optimised, % of the total"><thead><tr><th>Weights, %</th><th>Now</th><th>New</th><th></th><th>Δ</th></tr></thead><tbody>' + rows + '</tbody></table>';
  }
  /** The frontier: return against volatility (or tracking error), with now, optimised and the target. */
  function frontierSvg(a, r) {
    var W = 320, H = 168, L = 34, Rr = 10, T = 10, B = 26, fr = r.frontier || [];
    var pts = fr.map(function (p) { return [p.risk, p.ret]; }), cur = r.current ? [r.riskUnit === 'te' ? r.current.te : r.current.vol, r.current.ret] : null, pro = r.proposed ? [r.riskUnit === 'te' ? r.proposed.te : r.proposed.vol, r.proposed.ret] : null;
    var all = pts.concat([cur, pro].filter(function (p) { return p && p[0] != null; }));
    if (!all.length) return '';
    var xs = all.map(function (p) { return p[0]; }), ys = all.map(function (p) { return p[1]; });
    var x0 = 0, x1 = Math.max.apply(null, xs) * 1.08 || 1, y0 = Math.min.apply(null, ys), y1 = Math.max.apply(null, ys), py = (y1 - y0) * 0.12 || 0.5; y0 -= py; y1 += py;
    var X = function (v) { return L + (v - x0) / (x1 - x0) * (W - L - Rr); }, Y = function (v) { return T + (y1 - v) / (y1 - y0) * (H - T - B); };
    var tk = PA.ui.viz.niceTicks(y0, y1, 4), tx = PA.ui.viz.niceTicks(x0, x1, 4), g = '';
    var dy = tk.step < 1 ? 1 : 0, dx = tx.step < 1 ? 1 : 0;
    tk.ticks.forEach(function (t) { if (t < y0 || t > y1) return; g += '<line x1="' + L + '" x2="' + (W - Rr) + '" y1="' + Y(t) + '" y2="' + Y(t) + '" class="op-grid"/><text x="' + (L - 5) + '" y="' + (Y(t) + 3.5) + '" text-anchor="end" class="op-tick">' + F.num(t, dy) + '</text>'; });
    tx.ticks.forEach(function (t) { if (t < x0 || t > x1) return; g += '<text x="' + X(t) + '" y="' + (H - B + 13) + '" text-anchor="middle" class="op-tick">' + F.num(t, dx) + '</text>'; });
    var path = pts.length > 1 ? '<path d="' + pts.map(function (p, i) { return (i ? 'L' : 'M') + X(p[0]).toFixed(1) + ' ' + Y(p[1]).toFixed(1); }).join('') + '" class="op-front"/>' : '';
    var tgt = '', tv = r.target;
    if (tv != null && isFinite(tv)) { if ((r.objective === 'minVol') || (r.objective === 'active' && r.teMode === 'min')) { if (tv >= y0 && tv <= y1) tgt = '<line x1="' + L + '" x2="' + (W - Rr) + '" y1="' + Y(tv) + '" y2="' + Y(tv) + '" class="op-tgt"/>'; } else if (tv <= x1) tgt = '<line x1="' + X(tv) + '" x2="' + X(tv) + '" y1="' + T + '" y2="' + (H - B) + '" class="op-tgt"/>'; }
    var col = UI.colorOf(a);
    var dot = function (p, cls, label, anchor) { if (!p || p[0] == null) return ''; return '<circle cx="' + X(p[0]) + '" cy="' + Y(p[1]) + '" r="5" class="' + cls + '" style="--c:' + col + '"/><text x="' + (X(p[0]) + (anchor === 'end' ? -8 : 8)) + '" y="' + (Y(p[1]) + 4) + '" text-anchor="' + anchor + '" class="op-lbl">' + label + '</text>'; };
    var curAnchor = cur && pro && cur[0] > pro[0] ? 'start' : 'end', proAnchor = curAnchor === 'end' ? 'start' : 'end';
    var unit = r.riskUnit === 'te' ? 'Tracking error' : 'Volatility';
    return '<figure class="op-fig"><svg viewBox="0 0 ' + W + ' ' + H + '" role="img" aria-label="Efficient frontier: return against ' + unit.toLowerCase() + '. Now ' + (cur ? F.num(cur[1], 2) + '% at ' + F.num(cur[0], 2) + '%' : '') + (pro ? '; optimised ' + F.num(pro[1], 2) + '% at ' + F.num(pro[0], 2) + '%' : '') + '">' + g + '<line x1="' + L + '" x2="' + (W - Rr) + '" y1="' + (H - B) + '" y2="' + (H - B) + '" class="op-axis"/>' + tgt + path + dot(cur, 'op-cur', 'Now', curAnchor) + dot(pro, 'op-pro', 'Optimised', proAnchor) + '</svg><figcaption><span>Return, % a year</span><span>' + unit + ', % a year →</span></figcaption></figure>';
  }

  /* ── events ──────────────────────────────────────────────────────── */
  O.wire = function (root, a) {
    if (a.kind !== 'live') return;
    var s = stateOf(a), rerender = function () { UI.builder.render(); };
    U.$$('input[name="op-obj"]', root).forEach(function (r) { r.onchange = function () { s.objective = r.value; s.error = null; rerender(); }; });
    U.$$('[data-temode]', root).forEach(function (b) { b.onclick = function () { s.teMode = b.dataset.temode; rerender(); }; });
    U.$$('[data-teto]', root).forEach(function (b) { b.onclick = function () { s.teTo = b.dataset.teto; s.error = null; s.result = null; s.targets.activeTE = null; rerender(); }; });
    var oc = U.$('#op-chain', root); if (oc) oc.onclick = function () { UI.chain.open(a, { focus: s.teTo === 'policy' ? 'policy' : 'saa' }); };
    var t = U.$('#op-target', root); if (t) { t.oninput = function () { s.targets[targetKey(s)] = t.value; }; t.onkeydown = function (e) { if (e.key === 'Enter') { e.preventDefault(); run(a); } }; }
    var mw = U.$('#op-maxw', root); if (mw) { mw.oninput = function () { s.maxWeight = mw.value; }; mw.onchange = function () { s.previewSig = null; rerender(); }; mw.onkeydown = function (e) { if (e.key === 'Enter') { e.preventDefault(); s.previewSig = null; run(a); } }; }
    var bd = U.$('#op-band', root); if (bd) { bd.oninput = function () { s.band = bd.value; }; bd.onchange = function () { s.previewSig = null; rerender(); }; }
    var sw = function (id, key) { var el = U.$(id, root); if (el) el.onchange = function () { s[key] = el.checked; s.previewSig = null; rerender(); }; };
    sw('#op-long', 'longOnly'); sw('#op-band-on', 'bandOn'); sw('#op-idx', 'useIndices'); sw('#op-all', 'includeAll');
    var go = U.$('#op-run', root); if (go) go.onclick = function () { run(a); };
    var rr = U.$('#op-rerun', root); if (rr) rr.onclick = function () { run(a); };
    var cl = U.$('#op-clear', root); if (cl) cl.onclick = function () { s.result = null; s.error = null; rerender(); };
    var ab = U.$('#op-bench', root); if (ab) ab.onclick = function () { UI.dialogs.assignBenchmark(a); };
    var ap = U.$('#op-apply', root); if (ap) ap.onclick = function () { apply(a, s); };
    var sv = U.$('#op-save', root); if (sv) sv.onclick = function () { saveAsNew(a, s); };
  };
  function describe(r) {
    var t = F.num(r.target, 2) + '%';
    return r.objective === 'minVol' ? 'minimum volatility for ' + t + ' return' : r.objective === 'maxReturn' ? 'maximum return at ' + t + ' volatility' : (r.teMode === 'min' ? 'minimum tracking error for ' + t + ' return' : 'maximum return at ' + t + ' tracking error') + (r.teTo && r.teTo !== 'benchmark' ? ' to the ' + (r.teTo === 'policy' ? 'policy benchmark' : 'SAA') : '');
  }
  function run(a) {
    var s = stateOf(a), o = optionsOf(s);
    s.error = null;
    if (!isFinite(o.target)) { s.error = 'Enter a target as a number, e.g. 6.5.'; UI.builder.render(); var t = U.$('#op-target'); if (t) { t.setAttribute('aria-invalid', 'true'); t.focus(); } return; }
    s.running = true; UI.builder.render();
    var sig = sigOf(a);
    PA.api.optimize(request(a, s)).then(function (r) {
      s.running = false; s.result = r; s.resultSig = sig; UI.builder.render();
      U.announce(r.error ? r.error : r.reason ? r.reason : 'Optimised: return ' + F.num(r.proposed.ret, 2) + ' percent, volatility ' + F.num(r.proposed.vol, 2) + ' percent.');
      var res = U.$('#op-result'); if (res && res.scrollIntoView) res.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    }, function (err) { s.running = false; s.error = (err && err.message) || 'The optimisation failed.'; UI.builder.render(); });
  }
  function apply(a, s) {
    var r = s.result, next = E.applyOptimized(a, r.assets);
    if (!a.leverage && E.allocated(next) > 100.0001) { UI.toast('That takes ' + a.name + ' above 100%.', { kind: 'error' }); return; }
    S.update(a.name + ' · optimised: ' + describe(r), function (ws) { var x = ws.allocations.filter(function (y) { return y.id === a.id; })[0]; x.holdings = next.holdings; if (x.history && x.history.basis === 'actual') x.edited = true; }, { type: 'edit' });
    s.result = null;
    UI.toast(a.name + ' re-weighted: ' + describe(r) + '.', { action: { label: 'Undo', fn: S.undo } });
    U.announce(a.name + ' re-weighted. Analytics updating.');
  }
  function saveAsNew(a, s) {
    var r = s.result, next = E.applyOptimized(a, r.assets);
    var holdings = next.holdings.filter(function (h) { return Math.abs(h.weight) > 1e-9; }).map(function (h) { return { id: U.uid('h'), instrumentId: h.instrumentId, weight: h.weight, categoryId: E.categoryOf(h) }; });
    UI.dialogs.createAllocation({ name: a.name + ' · optimised', benchmarkId: a.benchmarkId, leverage: a.leverage, holdings: holdings, origin: 'optimised', note: 'Optimised from ' + a.name + ': ' + describe(r), compare: true });
    s.result = null;
  }
})();

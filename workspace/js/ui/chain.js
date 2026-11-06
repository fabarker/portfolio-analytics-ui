/* ─────────────────────────────────────────────────────────────────────────
   Portfolio Analytics · the decision chain dialog and attribution conventions
   The chain is a property of an allocation, like its assigned benchmark:
   the policy benchmark, the SAA and how products map to their benchmarks,
   with the order the steps are taken in. It is set from the rail header
   menu (and the comparison strip's member menu), reported by the Check tab
   when parts are missing, and saved as one undoable edit.
   Attribution conventions (model, interaction, linking, currency,
   unallocated weight, fee basis) are workspace defaults under the header
   menu; a card may depart from them and says so in its subtitle.
   ───────────────────────────────────────────────────────────────────────── */
(function () {
  'use strict';
  var PA = window.PA, U = PA.util, esc = U.esc, S = PA.store, UI = PA.ui, D = PA.data, E = PA.engine, I = U.icon, F = U.fmt, CH = PA.chain;
  var X = UI.chain = {};

  var SOURCE = { stated: 'Stated benchmark', categoryIndex: 'Category index', override: 'Override', index: 'An index: itself', fitted: 'Fitted index (uploaded returns)', none: 'No benchmark: the product itself' };
  function benchmarkSelect(id, sel, extra) {
    var opt = function (b) { var v = b.source === 'custom' ? b.customId + '@' + b.version : b.id, on = sel && (sel === v || UI.benchmarks.baseId(sel) === (b.source === 'custom' ? b.customId : b.id)); return '<option value="' + esc(v) + '"' + (on ? ' selected' : '') + '>' + esc(b.name) + (b.source === 'custom' ? ' · v' + b.version : '') + '</option>'; };
    var cus = D.benchmarks.filter(function (b) { return b.source === 'custom'; });
    return '<select id="' + id + '"' + (extra || '') + '><optgroup label="Presets">' + D.benchmarks.filter(function (b) { return b.source !== 'custom'; }).map(opt).join('') + '</optgroup>' + (cus.length ? '<optgroup label="Custom">' + cus.map(opt).join('') + '</optgroup>' : '') + '</select>';
  }
  function overrideOptions(cur) {
    var o = '<option value="">Follow the rule</option><optgroup label="Benchmarks">' + D.benchmarks.map(function (b) { return '<option value="benchmark:' + esc(b.id) + '"' + (cur === 'benchmark:' + b.id ? ' selected' : '') + '>' + esc(b.name) + '</option>'; }).join('') + '</optgroup>';
    o += '<optgroup label="Indices">' + D.instruments.filter(function (i) { return i.type === 'Index' && !i.spread; }).map(function (i) { return '<option value="instrument:' + esc(i.id) + '"' + (cur === 'instrument:' + i.id ? ' selected' : '') + '>' + esc(i.name) + '</option>'; }).join('') + '</optgroup>';
    return o + '<optgroup label="Products">' + D.instruments.filter(function (i) { return i.type !== 'Index' && !i.archived; }).map(function (i) { return '<option value="instrument:' + esc(i.id) + '"' + (cur === 'instrument:' + i.id ? ' selected' : '') + '>' + esc(i.name) + '</option>'; }).join('') + '</optgroup>';
  }
  /** The levels the draft chain resolves to, as a strip of four mixes. */
  function preview(a, draft) {
    var res = CH.levelsOf(Object.assign({}, a, { chain: draft }), S.ws.allocations, {});
    return '<ol class="ch-levels" aria-label="Levels this chain resolves to">' + res.levels.map(function (l, i) {
      return '<li class="' + (l.holdings ? '' : 'is-missing') + '"><span class="ch-code">' + esc(l.code) + '</span><b>' + esc(l.short) + '</b><small>' + esc(l.holdings ? l.label : l.reason) + '</small>' + (l.holdings ? UI.benchmarks.mixBar(l.holdings, 'ch-mix') : '<span class="ch-mix is-empty"></span>') + (i < res.levels.length - 1 ? '<span class="ch-arrow" aria-hidden="true">→</span>' : '') + '</li>';
    }).join('') + '</ol>' + (res.warnings.length ? UI.alert('warning', esc(res.warnings.join(' '))) : '') + (res.notes.length ? '<p class="field-hint" style="margin:6px 0 0">' + esc(res.notes.join('. ')) + '.</p>' : '');
  }
  function mappingTable(a, draft) {
    var rows = CH.mappingOf(Object.assign({}, a, { chain: draft }));
    return '<div class="tblwrap ch-map-wrap"><table class="tbl ch-map"><thead><tr><th scope="col">Holding</th><th scope="col" class="num">Weight</th><th scope="col">Resolves to</th><th scope="col">Source</th><th scope="col">Override</th></tr></thead><tbody>' + rows.map(function (m) {
      var o = (draft.productBenchmarks.overrides || {})[m.instrumentId], cur = o ? o.kind + ':' + o.id : '', c = D.categoryById[m.categoryId];
      return '<tr><th scope="row"><span class="sw" style="background:' + (c ? c.color : '#c3cedb') + '"></span>' + esc(m.name) + '</th><td class="num">' + F.num(m.weight, 1) + '</td><td>' + esc(m.target.label) + '</td><td><span class="tag' + (m.source === 'categoryIndex' || m.source === 'none' ? ' tag-warn' : m.source === 'override' ? ' tag-info' : '') + '">' + esc(SOURCE[m.source]) + '</span></td><td><select class="input-sm" data-ch-ov="' + esc(m.instrumentId) + '" aria-label="Override the benchmark of ' + esc(m.name) + '">' + overrideOptions(cur) + '</select></td></tr>';
    }).join('') + '</tbody></table></div>';
  }
  function mappingSummary(a, draft) {
    var rows = CH.mappingOf(Object.assign({}, a, { chain: draft })), n = {}; rows.forEach(function (m) { n[m.source] = (n[m.source] || 0) + 1; });
    var parts = []; if (n.stated) parts.push(n.stated + ' of ' + rows.length + ' holdings use their stated benchmark'); if (n.fitted) parts.push(n.fitted + ' the index their returns were fitted to'); if (n.categoryIndex) parts.push(n.categoryIndex + ' the category index'); if (n.index) parts.push(n.index + ' ' + (n.index === 1 ? 'is an index' : 'are indices')); if (n.override) parts.push(n.override + ' overridden'); if (n.none) parts.push(n.none + ' without any benchmark');
    return parts.join(' · ') || 'No holdings yet';
  }

  /**
   * The decision chain dialog. opts.focus: 'policy' | 'saa' | 'mapping' to open
   * at that part (the Check tab's links).
   */
  X.open = function (a, opts) {
    if (!a) return; opts = opts || {};
    UI.benchmarks.refresh().then(function () {
      var draft = a.chain ? U.clone(a.chain) : CH.blank();
      if (!draft.productBenchmarks) draft.productBenchmarks = { mode: 'stated', overrides: {} };
      if (!draft.productBenchmarks.overrides) draft.productBenchmarks.overrides = {};
      var assigned = a.benchmarkId ? D.benchmarkById[a.benchmarkId] : null, others = S.ws.allocations.filter(function (x) { return x.id !== a.id && x.kind !== 'sleeve'; });
      var saaKind = draft.saa ? draft.saa.kind : (others.length ? 'allocation' : 'derived');
      var radio = function (name, val, cur, label, extra) { return '<label class="check"><input type="radio" name="' + name + '" value="' + val + '"' + (cur === val ? ' checked' : '') + (extra || '') + '> ' + label + '</label>'; };
      var body = '<div id="ch-preview"></div>' +
        '<section class="ch-sec" id="ch-sec-policy"><h4>Policy benchmark <span class="ch-code">L0</span></h4><div class="ch-row">' +
          radio('ch-pol', 'assigned', draft.policyBenchmarkId ? 'pick' : 'assigned', 'Use the assigned benchmark' + (assigned ? ' (' + esc(assigned.name) + ')' : ' (none assigned)'), assigned ? '' : ' disabled') +
          radio('ch-pol', 'pick', draft.policyBenchmarkId || !assigned ? 'pick' : 'assigned', 'A benchmark from the library') + benchmarkSelect('ch-pol-bm', draft.policyBenchmarkId || (assigned ? a.benchmarkId : 'cbm_policy'), ' class="input-sm" aria-label="Policy benchmark"') +
          '<span id="ch-pol-old"></span></div></section>' +
        '<section class="ch-sec" id="ch-sec-saa"><h4>Strategic asset allocation <span class="ch-code">L1</span></h4><div class="ch-row">' +
          radio('ch-saa', 'allocation', saaKind, 'An allocation in this workspace', others.length ? '' : ' disabled') + '<select id="ch-saa-al" class="input-sm" aria-label="SAA allocation">' + (others.length ? others.map(function (x) { return '<option value="' + esc(x.id) + '"' + (draft.saa && draft.saa.kind === 'allocation' && draft.saa.id === x.id ? ' selected' : '') + '>' + esc(x.name) + (x.kind === 'snapshot' ? ' (snapshot)' : '') + '</option>'; }).join('') : '<option value="">No other allocations</option>') + '</select></div><div class="ch-row">' +
          radio('ch-saa', 'benchmark', saaKind, 'A benchmark from the library') + benchmarkSelect('ch-saa-bm', draft.saa && draft.saa.kind === 'benchmark' ? draft.saa.id : 'bm_6040', ' class="input-sm" aria-label="SAA benchmark"') + '</div><div class="ch-row">' +
          radio('ch-saa', 'derived', saaKind, 'Derive from ' + esc(a.name) + '’s category weights') + '<span class="field-hint">Each category’s weight held in its index basket. The SAA then moves with the portfolio, and S2 is a pure benchmark step.</span></div>' +
          '<div class="ch-row ch-actions"><button type="button" class="btn btn-sm" id="ch-from-policy">' + I.copy + '<span>Create SAA from policy…</span></button><button type="button" class="btn btn-sm" id="ch-from-alloc">' + I.plus + '<span>Create SAA from this allocation…</span></button></div></section>' +
        '<section class="ch-sec" id="ch-sec-mapping"><h4>Product benchmarks <span class="ch-code">L2</span></h4><div class="ch-row">' +
          radio('ch-pb', 'stated', draft.productBenchmarks.mode === 'custom' ? 'custom' : draft.productBenchmarks.mode, 'Stated benchmark, else category index') + radio('ch-pb', 'categoryIndex', draft.productBenchmarks.mode, 'Category index for every holding') + radio('ch-pb', 'custom', draft.productBenchmarks.mode, 'Custom per holding') + '</div>' +
          '<div class="ch-row"><span class="small" id="ch-pb-sum"></span></div><details id="ch-map"' + (opts.focus === 'mapping' || draft.productBenchmarks.mode === 'custom' ? ' open' : '') + '><summary>Review mapping</summary><div id="ch-map-host"></div><p class="field-hint">An override applies whichever rule is chosen. A holding’s weight is unchanged at this level, so the step from the SAA isolates the change of instrument.</p></details></section>' +
        '<section class="ch-sec"><h4>Step order</h4><div class="ch-row"><label class="label" for="ch-order">Order</label><select id="ch-order" class="input-sm">' + CH.ORDERS.map(function (o) { return '<option value="' + o[0] + '"' + ((draft.order || 'default') === o[0] ? ' selected' : '') + '>' + esc(o[1]) + (o[0] === 'default' ? ' (as named)' : '') + '</option>'; }).join('') + '</select>' +
          '<label class="label" for="ch-impl">Implementation step</label><select id="ch-impl" class="input-sm">' + [['one', 'One step (S2)'], ['weightThenBenchmark', 'Weights, then benchmarks (S2a, S2b)'], ['benchmarkThenWeight', 'Benchmarks, then weights (S2a, S2b)']].map(function (o) { return '<option value="' + o[0] + '"' + ((draft.implementation || 'one') === o[0] ? ' selected' : '') + '>' + esc(o[1]) + '</option>'; }).join('') + '</select></div>' +
          '<p class="field-hint">Return steps sum to the whole in any order; their sizes change because each is taken against a different upper portfolio. A card can override the order, or average over every order.</p></section>';
      UI.openDialog({ title: 'Decision chain · ' + a.name, sub: 'The portfolios ' + esc(a.name) + '’s return and risk are decomposed through: policy benchmark, SAA, the benchmarks of its products, and the portfolio. Saved with the allocation and copied by snapshots and clones.', wide: true, body: body, initialFocus: opts.focus === 'saa' ? '#ch-saa-al' : opts.focus === 'mapping' ? '#ch-map summary' : '#ch-pol-bm',
        actions: (a.chain ? [{ label: 'Remove chain', ghost: true, onClick: function () { S.update(a.name + ' decision chain removed', function (ws) { delete ws.allocations.filter(function (x) { return x.id === a.id; })[0].chain; }, { type: 'edit' }); UI.toast('Decision chain removed from ' + a.name + '.', { action: { label: 'Undo', fn: S.undo } }); } }] : []).concat([{ spacer: true, label: 'Cancel', ghost: true }, { label: 'Save chain', primary: true, close: false, onClick: function (c) { return save(c); } }]),
        onOpen: function (dlg) {
          var sync = function () {
            var pol = U.$('input[name="ch-pol"]:checked', dlg).value; draft.policyBenchmarkId = pol === 'pick' ? U.$('#ch-pol-bm', dlg).value : null;
            var sk = U.$('input[name="ch-saa"]:checked', dlg); sk = sk ? sk.value : 'derived';
            draft.saa = sk === 'allocation' ? (U.$('#ch-saa-al', dlg).value ? { kind: 'allocation', id: U.$('#ch-saa-al', dlg).value } : null) : sk === 'benchmark' ? { kind: 'benchmark', id: U.$('#ch-saa-bm', dlg).value } : { kind: 'derived' };
            draft.productBenchmarks.mode = U.$('input[name="ch-pb"]:checked', dlg).value;
            draft.order = U.$('#ch-order', dlg).value; draft.implementation = U.$('#ch-impl', dlg).value;
            U.$('#ch-pol-bm', dlg).disabled = pol !== 'pick'; U.$('#ch-saa-al', dlg).disabled = sk !== 'allocation' || !others.length; U.$('#ch-saa-bm', dlg).disabled = sk !== 'benchmark';
            var old = draft.policyBenchmarkId ? UI.benchmarks.outdated(draft.policyBenchmarkId) : null;
            U.$('#ch-pol-old', dlg).innerHTML = old ? '<button type="button" class="tag tag-info bm-use" id="ch-pol-latest">v' + old.latest + ' available · Use</button>' : '';
            var lt = U.$('#ch-pol-latest', dlg); if (lt) lt.onclick = function () { var pinned = UI.benchmarks.pinId(UI.benchmarks.baseId(draft.policyBenchmarkId)); var sel = U.$('#ch-pol-bm', dlg); sel.innerHTML = U.html(benchmarkSelect('x', pinned)).innerHTML; sel.value = pinned; sync(); };
            U.$('#ch-preview', dlg).innerHTML = preview(a, draft);
            U.$('#ch-pb-sum', dlg).textContent = mappingSummary(a, draft);
            var mh = U.$('#ch-map-host', dlg), open = U.$('#ch-map', dlg).open; if (open) mh.innerHTML = mappingTable(a, draft);
          };
          U.on(dlg, 'change', 'input[type=radio], select:not([data-ch-ov])', sync);
          U.on(dlg, 'change', '[data-ch-ov]', function (e, sel) { var v = sel.value, ov = draft.productBenchmarks.overrides; if (!v) delete ov[sel.dataset.chOv]; else { var p = v.split(':'); ov[sel.dataset.chOv] = { kind: p[0], id: p.slice(1).join(':') }; } var f = sel.dataset.chOv; sync(); var n = U.$('[data-ch-ov="' + CSS.escape(f) + '"]', dlg); if (n) n.focus(); });
          U.$('#ch-map', dlg).addEventListener('toggle', sync);
          var createSaa = function (fromPolicy) {
            var name = a.name + ' SAA', holdings;
            if (fromPolicy) { var pol = CH.policyOf(Object.assign({}, a, { chain: draft })); if (!pol.holdings) { UI.toast('Choose a policy benchmark first.', { kind: 'error' }); return; } holdings = pol.holdings; }
            else holdings = CH.saaOf(Object.assign({}, a, { chain: { saa: { kind: 'derived' } } }), S.ws.allocations).holdings;
            var made = UI.dialogs.createAllocation({ name: name, benchmarkId: draft.policyBenchmarkId || a.benchmarkId, origin: 'clone', stay: true, compare: false, holdings: holdings.map(function (h) { return { id: U.uid('h'), instrumentId: h.instrumentId, weight: U.round(h.weight, 2), categoryId: h.categoryId }; }), detail: fromPolicy ? 'SAA cloned from the policy benchmark' : 'SAA from ' + a.name + '’s category weights, held in each category’s index' });
            others = S.ws.allocations.filter(function (x) { return x.id !== a.id && x.kind !== 'sleeve'; });
            U.$('#ch-saa-al', dlg).innerHTML = others.map(function (x) { return '<option value="' + esc(x.id) + '"' + (x.id === made.id ? ' selected' : '') + '>' + esc(x.name) + '</option>'; }).join('');
            U.$('input[name="ch-saa"][value="allocation"]', dlg).disabled = false; U.$('input[name="ch-saa"][value="allocation"]', dlg).checked = true; sync();
            UI.toast('“' + made.name + '” created ' + (fromPolicy ? 'from the policy benchmark’s constituents' : 'from ' + a.name + '’s category weights') + ' and set as the SAA. Adjust its weights in the rail after saving the chain.');
          };
          U.$('#ch-from-policy', dlg).onclick = function () { createSaa(true); };
          U.$('#ch-from-alloc', dlg).onclick = function () { createSaa(false); };
          sync();
          if (opts.focus) { var sec = U.$('#ch-sec-' + opts.focus, dlg); if (sec) setTimeout(function () { sec.scrollIntoView({ block: 'nearest' }); }, 30); }
        } });
      function save(c) {
        if (draft.saa && draft.saa.kind === 'allocation' && !draft.saa.id) { UI.toast('Choose the SAA allocation, or another source.', { kind: 'error' }); return false; }
        var clean = { policyBenchmarkId: draft.policyBenchmarkId || null, saa: draft.saa, productBenchmarks: { mode: draft.productBenchmarks.mode, overrides: draft.productBenchmarks.overrides }, order: draft.order || 'default', implementation: draft.implementation || 'one' };
        S.update(a.name + ' decision chain ' + (a.chain ? 'changed' : 'set'), function (ws) { ws.allocations.filter(function (x) { return x.id === a.id; })[0].chain = clean; }, { type: 'edit', detail: 'Policy ' + (CH.policyOf(Object.assign({}, a, { chain: clean })).label || 'none') + ' · SAA ' + (CH.saaOf(Object.assign({}, a, { chain: clean }), S.ws.allocations).label || 'none') });
        UI.toast('Decision chain saved for ' + a.name + '.' + (S.ws.cards.some(function (cd) { return cd.type === 'decision-chain'; }) ? '' : ' Add the Decision chain card to see it.'), S.ws.cards.some(function (cd) { return cd.type === 'decision-chain'; }) ? { action: { label: 'Undo', fn: S.undo } } : { action: { label: 'Add card', fn: function () { PA.cards.addCardOfType('decision-chain', {}); } } });
        c.close(true); return false;
      }
    });
  };

  /** A product's row menu: select the row and measure it against its own benchmark (step S3 for that product). */
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
        field('fees', 'Fee basis', [['net', L.fees.net + ' (the platform’s basis)'], ['gross', L.fees.gross]], 'Changes every return figure in this workspace.') + '</div>',
      actions: [{ label: 'Reset to defaults', ghost: true, close: false, onClick: function (c) { Object.keys(CH.CONVENTIONS).forEach(function (k) { U.$('#cv-' + k, c.el).value = CH.CONVENTIONS[k]; }); return false; } }, { spacer: true, label: 'Cancel', ghost: true }, { label: 'Save', primary: true, onClick: function (c) {
        var next = {}; Object.keys(CH.CONVENTIONS).forEach(function (k) { next[k] = U.$('#cv-' + k, c.el).value; });
        var changed = Object.keys(next).filter(function (k) { return next[k] !== cur[k]; }); if (!changed.length) return;
        S.update('Attribution conventions changed', function (ws) { ws.conventions = next; }, { type: 'edit', detail: changed.map(function (k) { return L[k][cur[k]] + ' → ' + L[k][next[k]]; }).join(' · ') });
        UI.toast('Attribution conventions saved. Cards that follow them recalculate.', { action: { label: 'Undo', fn: S.undo } });
      } }] });
  };
  /** Conventions that differ from the defaults, in words (the export context line). */
  X.departures = function (ws) { var c = CH.conventionsOf(ws), out = []; Object.keys(CH.CONVENTIONS).forEach(function (k) { if (c[k] !== CH.CONVENTIONS[k]) out.push(CH.LABELS[k][c[k]]); }); return out; };
})();

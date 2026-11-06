/* ─────────────────────────────────────────────────────────────────────────
   Portfolio Analytics · dialogs
   new allocation (blank / template / clone / import),
   inspect instrument, snapshot, draft from snapshot, benchmark assignment,
   versions & activity, export, shortcuts
   ───────────────────────────────────────────────────────────────────────── */
(function () {
  'use strict';
  var PA = window.PA, U = PA.util, esc = U.esc, S = PA.store, UI = PA.ui, D = PA.data, E = PA.engine, I = U.icon, F = U.fmt;
  var Dg = UI.dialogs = {};

  Dg.nextColor = function () { return nextColor(); };
  Dg.createAllocation = function (spec) { return createAllocation(spec); };
  function nextColor() { var used = S.ws.allocations.map(function (a) { return a.color; }); for (var i = 1; i <= 6; i++) if (used.indexOf('cat-' + i) < 0) return 'cat-' + i; return 'cat-' + ((S.ws.allocations.length % 6) + 1); }
  function mkHoldings(pairs) { return pairs.map(function (p) { return { id: U.uid('h'), instrumentId: p[0], weight: p[1] }; }); }
  function benchmarkOptions(sel) {
    var opt = function (b) { var v = b.source === 'custom' ? b.customId + '@' + b.version : b.id; return '<option value="' + esc(v) + '"' + (sel === v || sel === b.id ? ' selected' : '') + '>' + esc(b.name) + '</option>'; };
    var cus = D.benchmarks.filter(function (b) { return b.source === 'custom'; });
    return '<option value=""' + (!sel ? ' selected' : '') + '>No benchmark</option><optgroup label="Presets">' + D.benchmarks.filter(function (b) { return b.source !== 'custom'; }).map(opt).join('') + '</optgroup>' + (cus.length ? '<optgroup label="Custom">' + cus.map(opt).join('') + '</optgroup>' : '');
  }

  function createAllocation(spec) {
    var id = U.uid('al'), ws = S.ws;
    var a = { id: id, name: spec.name, kind: 'live', color: nextColor(), benchmarkId: spec.benchmarkId || null, leverage: !!spec.leverage, history: { basis: 'backtest', inception: new Date().toISOString().slice(0, 7) }, edited: false, note: spec.note || '', holdings: spec.holdings };
    if (spec.chain) a.chain = U.clone(spec.chain);
    E.normalizeAllocation(a);
    S.update('Allocation “' + a.name + '” created (' + spec.origin + ')', function (w) { w.allocations.push(a); if (spec.compare && w.comparison.members.length < 6) { w.comparison.members.push(id); if (w.prefs.emphasis.indexOf(id) < 0) w.prefs.emphasis.push(id); } if (!spec.stay) w.comparison.activeId = id; }, { type: 'create', detail: spec.detail || null });
    if (!spec.stay) UI.toast('“' + a.name + '” is open in the builder.' + (spec.compare && ws.comparison.members.length >= 6 && ws.comparison.members.indexOf(id) < 0 ? ' The comparison is full, so it was not added as a column.' : ''));
    return a;
  }

  /* ── new allocation ──────────────────────────────────────────────── */
  Dg.newAllocation = function () {
    var origin = 'blank', importRows = null;
    var body = '<div class="doors" role="group" aria-label="Starting point">' + [['blank', 'Blank', 'Start with empty categories'], ['template', 'Template', 'A strategic starting point'], ['clone', 'Clone existing', 'A working copy of an allocation'], ['import', 'Import weights', 'Paste and map a weight list']].map(function (d) { return '<button type="button" class="door" data-origin="' + d[0] + '" aria-pressed="' + (d[0] === origin) + '"><b>' + d[1] + '</b><span>' + d[2] + '</span></button>'; }).join('') + '</div>' +
      '<div class="dlg-grid"><div class="field"><label for="na-name">Name</label><input type="text" id="na-name" maxlength="60" placeholder="e.g. Growth Tilt v2"></div><div class="field"><label for="na-bm">Benchmark</label><select id="na-bm">' + benchmarkOptions('bm_6040') + '</select></div><div class="wide" id="na-origin"></div><label class="check wide"><input type="checkbox" id="na-compare" checked> Add to the comparison</label></div>';
    UI.openDialog({ title: 'New allocation', sub: 'Blank, template, clone and import all open in the same workspace. Each category’s weight is the sum of the products and indices in it.', body: body, wide: true, initialFocus: '#na-name',
      actions: [{ label: 'Cancel', ghost: true }, { label: 'Create allocation', primary: true, onClick: function (c) { return submit(c); }, close: false }],
      onOpen: function (dlg) { U.on(dlg, 'click', '[data-origin]', function (e, b) { origin = b.dataset.origin; U.$$('[data-origin]', dlg).forEach(function (x) { x.setAttribute('aria-pressed', String(x === b)); }); renderOrigin(dlg); }); renderOrigin(dlg); } });
    function renderOrigin(dlg) {
      var host = U.$('#na-origin', dlg), html = '';
      if (origin === 'blank') html = '<div class="field-hint">Starts at 0% allocated. Set category targets in the builder and add products with the search; the draft stays valid while incomplete.</div>';
      if (origin === 'template') html = '<div class="field"><label for="na-tpl">Template</label><select id="na-tpl">' + D.templates.map(function (t) { return '<option value="' + t.id + '">' + esc(t.name) + ' — ' + esc(t.description) + '</option>'; }).join('') + '</select></div>';
      if (origin === 'clone') html = '<div class="field"><label for="na-src">Source</label><select id="na-src"><optgroup label="Allocations in this workspace">' + S.ws.allocations.map(function (a) { return '<option value="al:' + a.id + '">' + esc(a.name) + (a.kind === 'snapshot' ? ' (snapshot)' : '') + '</option>'; }).join('') + '</optgroup><optgroup label="Benchmarks">' + D.benchmarks.map(function (b) { return '<option value="bm:' + b.id + '">' + esc(b.name) + '</option>'; }).join('') + '</optgroup></select><span class="field-hint">A local copy. Editing it never changes the source.</span></div>';
      if (origin === 'import') html = '<div class="import-grid"><div class="field"><label for="na-import">Paste weights</label><textarea id="na-import" spellcheck="false" placeholder="identifier or name, weight&#10;MRLC, 40&#10;Sovereign Treasury Fund, 35&#10;KMS, 25"></textarea><span class="field-hint">One row per line: an identifier or name, then the weight in %. Headers and blank lines are ignored.</span><button type="button" class="btn btn-sm" id="na-sample" style="justify-self:start">Use a sample</button></div><div><div class="label" style="margin-bottom:6px">Preview</div><div class="import-preview" id="na-preview"><div class="empty" style="padding:28px">' + I.table + '<p>Rows appear here as you paste.</p></div></div><div class="import-summary" id="na-summary"></div></div></div>';
      host.innerHTML = html;
      var ta = U.$('#na-import', dlg);
      if (ta) { var parse = U.debounce(function () { importRows = parseImport(ta.value); renderPreview(dlg); }, 150); ta.oninput = parse; U.$('#na-sample', dlg).onclick = function () { ta.value = 'Identifier, Weight\nMRLC, 30\nNBIEX, 14\nCSEMX, 6\nOBP-IV, 8\nSVTRX, 18\nASIGX, 10\nKMS, 6\nHCRE, 4\nLantern Private Credit, 2\nAcme Growth Fund, 2'; importRows = parseImport(ta.value); renderPreview(dlg); }; }
    }
    function parseImport(text) {
      var rows = [], seen = {};
      text.split(/\r?\n/).forEach(function (line, i) {
        var t = line.trim(); if (!t) return;
        var parts = t.split(/[,;\t]/).map(function (s) { return s.trim(); });
        if (parts.length < 2) { rows.push({ line: i + 1, raw: t, error: 'Needs an identifier and a weight' }); return; }
        var w = Number(String(parts[parts.length - 1]).replace('%', '')), label = parts.slice(0, -1).join(' ');
        if (/^(identifier|name|category|holding|product)$/i.test(label) && !isFinite(w)) return;
        var ins = D.instruments.filter(function (x) { return x.identifier.toLowerCase() === label.toLowerCase() || x.name.toLowerCase() === label.toLowerCase(); })[0];
        if (!ins) { var cand = D.instruments.filter(function (x) { return x.name.toLowerCase().indexOf(label.toLowerCase()) >= 0; }); if (cand.length === 1) ins = cand[0]; }
        var row = { line: i + 1, raw: label, weight: w, instrumentId: ins ? ins.id : null, error: null };
        if (!isFinite(w)) row.error = 'Weight is not a number'; else if (w < 0 || w > 100) row.error = 'Weight must be between 0 and 100 in this long-only import';
        if (ins && seen[ins.id]) row.error = 'Duplicate of line ' + seen[ins.id];
        if (ins) seen[ins.id] = i + 1;
        rows.push(row);
      });
      return rows;
    }
    function renderPreview(dlg) {
      var host = U.$('#na-preview', dlg), sum = U.$('#na-summary', dlg);
      if (!importRows || !importRows.length) { host.innerHTML = '<div class="empty" style="padding:28px">' + I.table + '<p>Rows appear here as you paste.</p></div>'; sum.innerHTML = ''; return; }
      host.innerHTML = '<table class="tbl"><thead><tr><th scope="col">Line</th><th scope="col">Pasted</th><th scope="col">Matched product</th><th scope="col" class="num">Weight</th></tr></thead><tbody>' + importRows.map(function (r, i) {
        var status = r.error ? '<span class="tag tag-neg">' + esc(r.error) + '</span>' : (r.instrumentId ? '<span>' + esc(D.instrumentById[r.instrumentId].name) + '</span><br><span class="small faint">' + esc(D.categoryOf(r.instrumentId).name) + '</span>' : '<select data-map="' + i + '" aria-label="Map ' + esc(r.raw) + '"><option value="">Choose a product…</option>' + D.instruments.map(function (x) { return '<option value="' + x.id + '">' + esc(x.name) + ' (' + esc(x.identifier) + ')</option>'; }).join('') + '</select><br><span class="small tag tag-warn">Unmatched</span>');
        return '<tr><td class="faint">' + r.line + '</td><td>' + esc(r.raw) + '</td><td>' + status + '</td><td class="num">' + (isFinite(r.weight) ? F.num(r.weight) : '—') + '</td></tr>';
      }).join('') + '</tbody></table>';
      U.on(host, 'change', '[data-map]', function (e, sel) { var r = importRows[Number(sel.dataset.map)]; r.instrumentId = sel.value || null; if (r.instrumentId && importRows.some(function (x) { return x !== r && x.instrumentId === r.instrumentId; })) r.error = 'Duplicate product'; renderPreview(dlg); });
      var ok = importRows.filter(function (r) { return !r.error && r.instrumentId; }), total = U.sum(ok, function (r) { return r.weight; }), unmatched = importRows.filter(function (r) { return !r.error && !r.instrumentId; }).length, errors = importRows.filter(function (r) { return r.error; }).length;
      sum.innerHTML = '<span><b>' + ok.length + '</b> matched</span><span><b>' + unmatched + '</b> to map</span><span><b>' + errors + '</b> error' + (errors === 1 ? '' : 's') + '</span><span>Total <b>' + F.num(total) + '%</b>' + (total > 100.0001 ? ' <span class="tag tag-neg">above 100%</span>' : total < 99.999 ? ' <span class="tag">incomplete, allowed</span>' : '') + '</span>';
    }
    function submit(c) {
      var dlg = c.el, name = U.$('#na-name', dlg).value.trim(), bm = U.$('#na-bm', dlg).value || null, compare = U.$('#na-compare', dlg).checked;
      if (!name) { U.$('#na-name', dlg).setAttribute('aria-invalid', 'true'); U.$('#na-name', dlg).focus(); UI.toast('Give the allocation a name.', { kind: 'error' }); return false; }
      var spec = { name: name, benchmarkId: bm, compare: compare, origin: origin, holdings: [] };
      if (origin === 'template') { var t = D.templates.filter(function (x) { return x.id === U.$('#na-tpl', dlg).value; })[0]; spec.holdings = mkHoldings(t.holdings); spec.detail = 'From template ' + t.name; }
      if (origin === 'clone') { var v = U.$('#na-src', dlg).value, src = v.indexOf('al:') === 0 ? S.allocation(v.slice(3)) : D.benchmarkById[v.slice(3)]; spec.holdings = src.holdings.map(function (h) { return { id: U.uid('h'), instrumentId: h.instrumentId, weight: h.weight, categoryId: h.categoryId, sleeveRef: h.sleeveRef }; }); spec.leverage = !!src.leverage; spec.detail = 'Cloned from ' + src.name; if (!bm && src.benchmarkId) spec.benchmarkId = src.benchmarkId; if (src.chain) spec.chain = src.chain; }
      if (origin === 'import') {
        if (!importRows || !importRows.length) { UI.toast('Paste some weights first.', { kind: 'error' }); return false; }
        var bad = importRows.filter(function (r) { return r.error || !r.instrumentId; }); if (bad.length) { UI.toast('Resolve the ' + bad.length + ' unmatched or invalid row' + (bad.length === 1 ? '' : 's') + ' before loading.', { kind: 'error' }); return false; }
        var total = U.sum(importRows, function (r) { return r.weight; }); if (total > 100.0001) { UI.toast('The import totals ' + F.num(total) + '%. This long-only import accepts at most 100%.', { kind: 'error' }); return false; }
        spec.holdings = importRows.map(function (r) { return { id: U.uid('h'), instrumentId: r.instrumentId, weight: r.weight }; }); spec.detail = 'Imported ' + importRows.length + ' rows, ' + F.num(total) + '% allocated';
      }
      createAllocation(spec); c.close(true); return false;
    }
  };


  Dg.inspectInstrument = function (ins) {
    var ac = D.assetClassById[ins.assetClass], cat = D.categoryOf(ins.id), as = D.assumptions.assetClasses[ins.assetClass], R = E.resolve(null);
    var held = S.ws.allocations.filter(function (a) { return a.holdings.some(function (h) { return h.instrumentId === ins.id; }); });
    var row = function (k, v) { return '<div><dt class="label">' + k + '</dt><dd style="margin:3px 0 0">' + v + '</dd></div>'; };
    UI.openDialog({ title: ins.name, sub: esc(ins.type) + ' · ' + esc(ins.identifier) + (ins.manager ? ' · ' + esc(ins.manager) : ''), wide: true,
      body: '<dl class="dlg-grid" style="margin:0;font-size:13px">' + row('Category · asset class', esc(cat.name) + '<br><span class="faint small">' + esc(ac.name) + '</span>') + row('Currency · valuation', esc(ins.currency) + ' · ' + esc(ins.valuation)) + row('Return history', ins.coverage === 'full' ? 'Complete from ' + esc(F.month(ins.inception)) : '<span class="tag tag-warn">' + (ins.coverage === 'none' ? 'None' : 'Proxy') + '</span> ' + esc(ins.proxyNote || '')) + row('Fee', ins.fee != null ? ins.fee + ' bp' : '—') +
        row('Model expected return', F.num(R.ret[ins.id].value, 1) + '% <span class="faint small">asset class ' + F.num(R.acReturn[ins.assetClass].value, 1) + '%' + (ins.fee ? ' less fee' : '') + '</span>') + row('Model volatility', F.num(R.vol[ins.id].value, 1) + '%') + (ins.lookThrough != null ? row('Look-through', F.num(ins.lookThrough * 100, 0) + '% of exposures identified; remainder treated at fund level') : '') +
        (function () { var m = D.factorModelById[(S.ws && S.ws.prefs.factorModel) || 'isg'], l = E.loadingsOf(m, ins.id), cov = m.coverage(ins); return row('Factor loadings · ' + esc(m.name), m.factors.filter(function (f) { return Math.abs(l[f.id]) >= 0.005; }).map(function (f) { return esc(f.name) + ' ' + F.num(l[f.id], 2); }).join(' · ') + (cov ? '<br><span class="faint small">' + esc(cov.note) + '</span>' : '')); })() + row('Held in', held.length ? held.map(function (a) { var h = a.holdings.filter(function (x) { return x.instrumentId === ins.id; })[0]; return esc(a.name) + ' ' + F.num(h.weight) + '%' + (h.sleeveRef ? ' <span class="faint small">(from ' + esc(h.sleeveRef.name) + ' v' + h.sleeveRef.version + ')</span>' : ''); }).join(', ') : 'Not held in this workspace') + '</dl>',
      actions: [{ label: 'Close', primary: true }] });
  };

  /* ── snapshots ───────────────────────────────────────────────────── */
  Dg.snapshot = function (alloc) {
    if (!alloc) return;
    var now = new Date(), def = alloc.name + ' · ' + now.toLocaleDateString('en-GB', { month: 'short', year: 'numeric' });
    UI.openDialog({ title: 'Create snapshot', sub: 'A fixed copy of <b>' + esc(alloc.name) + '</b> as it is now. Weights and category targets are frozen; analytics refresh with the platform model, benchmark and dates, which are not frozen.', initialFocus: '#sn-name',
      body: '<div class="dlg-grid"><div class="field wide"><label for="sn-name">Snapshot name</label><input type="text" id="sn-name" value="' + esc(def) + '" maxlength="80"></div><div class="field wide"><label for="sn-note">Note</label><input type="text" id="sn-note" placeholder="Optional, e.g. version reviewed at the October IC" maxlength="140"></div><label class="check wide"><input type="checkbox" id="sn-compare" checked' + (S.ws.comparison.members.length >= 6 ? ' disabled' : '') + '> Add to the comparison' + (S.ws.comparison.members.length >= 6 ? ' (comparison is full)' : '') + '</label></div>',
      actions: [{ label: 'Cancel', ghost: true }, { label: 'Create snapshot', primary: true, close: false, onClick: function (c) {
        var name = U.$('#sn-name', c.el).value.trim(); if (!name) { U.$('#sn-name', c.el).setAttribute('aria-invalid', 'true'); return false; }
        var id = U.uid('al'), compare = U.$('#sn-compare', c.el).checked, note = U.$('#sn-note', c.el).value.trim();
        S.update('Snapshot “' + name + '” created', function (ws) { ws.allocations.push({ id: id, name: name, kind: 'snapshot', color: nextColor(), benchmarkId: alloc.benchmarkId, leverage: alloc.leverage, history: { basis: 'backtest', inception: now.toISOString().slice(0, 7) }, edited: false, sourceId: alloc.id, capturedAt: now.toISOString(), note: note || 'Captured from ' + alloc.name, holdings: U.clone(alloc.holdings), chain: alloc.chain ? U.clone(alloc.chain) : undefined }); if (compare && ws.comparison.members.length < 6) { ws.comparison.members.push(id); ws.prefs.emphasis.push(id); } }, { type: 'snapshot', detail: 'From ' + alloc.name });
        UI.toast('Snapshot “' + name + '” created. Later edits to ' + alloc.name + ' will not change it.'); c.close(true); return false;
      } }] });
  };
  Dg.draftFromSnapshot = function (snap) {
    var isSleeve = snap.kind === 'sleeve';
    UI.prompt({ title: isSleeve ? 'Make an editable copy' : 'Create draft from snapshot', sub: isSleeve ? 'A new live allocation with the sleeve’s products and weights, tagged with the sleeve and version. The sleeve and its column stay as they are.' : 'A new editable allocation with the snapshot’s weights. The snapshot itself stays fixed.', label: 'Draft name', value: snap.name.replace(/ · .*$/, '') + ' draft', confirmLabel: 'Create draft' }).then(function (name) {
      if (!name) return;
      createAllocation({ name: name, benchmarkId: snap.benchmarkId, compare: true, origin: 'restored from snapshot', holdings: U.clone(snap.holdings).map(function (h) { h.id = U.uid('h'); return h; }), leverage: snap.leverage, detail: 'From ' + snap.name, chain: snap.chain || null });
    });
  };
  Dg.benchmarkAsMember = function (bm) {
    var now = new Date(), id = U.uid('al');
    S.update('Benchmark “' + bm.name + '” added as a fixed column', function (ws) { ws.allocations.push({ id: id, name: bm.name, kind: 'snapshot', color: nextColor(), benchmarkId: null, leverage: false, history: { basis: 'backtest', inception: now.toISOString().slice(0, 7) }, edited: false, sourceId: bm.id, capturedAt: now.toISOString(), note: 'Benchmark composition as published', holdings: bm.holdings.map(function (h) { return { id: U.uid('h'), instrumentId: h.instrumentId, weight: h.weight }; }) }); if (ws.comparison.members.length < 6) { ws.comparison.members.push(id); ws.prefs.emphasis.push(id); } }, { type: 'member' });
  };
  Dg.renameAllocation = function (a) { UI.prompt({ title: 'Rename allocation', label: 'Name', value: a.name }).then(function (n) { if (n && n !== a.name) S.update('“' + a.name + '” renamed to “' + n + '”', function (ws) { ws.allocations.filter(function (x) { return x.id === a.id; })[0].name = n; }, { type: 'rename' }); }); };
  Dg.assignBenchmark = function (a) { UI.benchmarks.assign(a); };

  /* ── workspaces: the reporting currency ──────────────────────────── */
  function currencyOptions(sel) {
    var o = function (c) { return '<option value="' + c.code + '"' + (sel === c.code ? ' selected' : '') + '>' + c.code + ' · ' + esc(c.name) + '</option>'; };
    return '<optgroup label="Common">' + D.currencies.filter(function (c) { return c.common; }).map(o).join('') + '</optgroup><optgroup label="All currencies">' + D.currencies.filter(function (c) { return !c.common; }).map(o).join('') + '</optgroup>';
  }
  /** New workspace: a name and a reporting currency, both required; nothing is preselected. */
  Dg.newWorkspace = function () {
    var ctx = UI.openDialog({ title: 'New workspace', sub: 'A workspace holds its allocations, scenarios, comparison and cards.', initialFocus: '#nw-name',
      body: '<div class="dlg-grid"><div class="field wide"><label for="nw-name">Name <span aria-hidden="true">*</span></label><input type="text" id="nw-name" maxlength="80" placeholder="e.g. Pension Scheme Review 2027" aria-required="true"></div>' +
        '<div class="field wide"><label for="nw-ccy">Reporting currency <span aria-hidden="true">*</span></label><select id="nw-ccy" aria-required="true" aria-describedby="nw-ccy-hint"><option value="" selected disabled>Choose a currency</option>' + currencyOptions('') + '</select><span class="field-hint" id="nw-ccy-hint">Every figure in this workspace is reported in it: returns, risk, projections, stress results and benchmarks. Cash and the risk-free rate use its 3-month rate. You can change it later.</span></div>' +
        '<div class="field wide"><label for="nw-desc">Description</label><input type="text" id="nw-desc" maxlength="160" placeholder="Optional"></div><span class="field-err wide" id="nw-err" role="alert"></span></div>',
      actions: [{ label: 'Cancel', ghost: true }, { label: 'Create workspace', primary: true, disabled: true, close: false, onClick: function (c) {
        var name = U.$('#nw-name', c.el).value.trim(), ccy = U.$('#nw-ccy', c.el).value, err = U.$('#nw-err', c.el);
        if (!name || !ccy) { err.textContent = !name ? 'Enter a name for the workspace.' : 'Choose a reporting currency.'; return false; }
        var btn = U.$('[data-action="1"]', c.el); btn.disabled = true;
        PA.api.createWorkspace({ name: name, currency: ccy, description: U.$('#nw-desc', c.el).value.trim() }).then(function (ws) { c.close(true); UI.shell.go('#/w/' + encodeURIComponent(ws.id)); }, function (e) { btn.disabled = false; err.textContent = e.message || 'Could not create the workspace.'; });
        return false;
      } }] });
    var sync = function () { U.$('[data-action="1"]', ctx.el).disabled = !(U.$('#nw-name', ctx.el).value.trim() && U.$('#nw-ccy', ctx.el).value); U.$('#nw-err', ctx.el).textContent = ''; };
    U.$('#nw-name', ctx.el).addEventListener('input', sync); U.$('#nw-ccy', ctx.el).addEventListener('change', sync);
    U.$('#nw-name', ctx.el).addEventListener('keydown', function (e) { if (e.key === 'Enter') { e.preventDefault(); U.$('[data-action="1"]', ctx.el).click(); } });
  };
  /** Change the reporting currency: every card recalculates; undoable. */
  Dg.changeCurrency = function () {
    var cur = S.ws.currency;
    UI.openDialog({ title: 'Reporting currency', sub: 'Every figure in ' + esc(S.ws.name) + ' is reported in this currency.', initialFocus: '#cc-ccy',
      body: '<div class="field"><label for="cc-ccy">Currency</label><select id="cc-ccy">' + currencyOptions(cur) + '</select></div><p class="small muted" style="margin:12px 0 0">Changing it recalculates every card. Cash, the risk-free rate and fixed-rate benchmark rows use the new currency’s 3-month rate; foreign-currency products are converted at month-end rates and are not hedged. Snapshots keep their weights; their figures follow the new currency. You can undo the change.</p>',
      actions: [{ label: 'Cancel', ghost: true }, { label: 'Change currency', primary: true, onClick: function (c) {
        var v = U.$('#cc-ccy', c.el).value; if (v === cur) return;
        S.update('Reporting currency changed from ' + cur + ' to ' + v, function (ws) { ws.currency = v; }, { type: 'edit' });
        UI.toast('Reporting in ' + v + '. Every card is recalculating.', { action: { label: 'Undo', fn: S.undo } });
      } }] });
  };

  /* ── versions & activity ─────────────────────────────────────────── */
  Dg.history = function () {
    var ws = S.ws, snaps = ws.allocations.filter(function (a) { return a.kind === 'snapshot'; }), undo = S.session.history;
    var body = '<div class="label" style="margin-bottom:6px">Fixed snapshots</div>' + (snaps.length ? '<div class="history-list" style="max-height:200px;margin-bottom:16px">' + snaps.map(function (s) { return '<div class="history-item"><span class="when">' + esc(F.date(s.capturedAt)) + '</span><span class="what"><b>' + esc(s.name) + '</b><small>' + esc(s.note || '') + '</small></span><span><button type="button" class="btn btn-xs" data-draft="' + esc(s.id) + '">Create draft</button></span></div>'; }).join('') + '</div>' : '<p class="faint small">No snapshots yet. Use Snapshot in the header to freeze an allocation.</p>') +
      '<div class="label" style="margin-bottom:6px">This session</div><div class="history-list" style="max-height:160px;margin-bottom:16px">' + (undo.past.length || undo.future.length ? undo.future.slice().reverse().map(function (s) { return '<div class="history-item faint"><span class="when">redo</span><span class="what">' + esc(s.label) + '</span><span></span></div>'; }).join('') + '<div class="history-item is-current"><span class="when">now</span><span class="what"><b>Current state</b></span><span></span></div>' + undo.past.slice().reverse().map(function (s, i) { return '<div class="history-item"><span class="when">' + (i + 1) + ' back</span><span class="what">' + esc(s.label) + '</span><span><button type="button" class="btn btn-xs" data-undo-to="' + i + '">Restore</button></span></div>'; }).join('') : '<div class="history-item"><span class="when">—</span><span class="what faint">No edits in this session yet.</span><span></span></div>') + '</div>' +
      '<div class="label" style="margin-bottom:6px">Activity</div><div class="history-list" style="max-height:220px">' + ws.activity.slice(0, 60).map(function (a) { return '<div class="history-item"><span class="when" data-tip="' + esc(F.dateTime(a.at)) + '">' + esc(F.relative(a.at)) + '</span><span class="what"><b>' + esc(a.label) + '</b>' + (a.detail ? '<small>' + esc(a.detail) + '</small>' : '') + '</span><span class="tag">' + esc(a.type) + '</span></div>'; }).join('') + '</div>';
    UI.openDialog({ title: 'Versions & activity', sub: 'Restoring an earlier state creates a new current state; snapshots are never changed.', body: body, wide: true, actions: [{ label: 'Close', primary: true }],
      onOpen: function (dlg, ctx) { U.on(dlg, 'click', '[data-draft]', function (e, b) { var s = S.allocation(b.dataset.draft); ctx.close(); Dg.draftFromSnapshot(s); }); U.on(dlg, 'click', '[data-undo-to]', function (e, b) { var n = Number(b.dataset.undoTo) + 1; for (var i = 0; i < n; i++) S.undo(); ctx.close(); UI.toast('Restored the state from ' + n + ' edit' + (n === 1 ? '' : 's') + ' back. Redo is available.'); }); } });
  };

  /* ── export ──────────────────────────────────────────────────────── */
  Dg.exportDialog = function () {
    var dd = S.ws.cards.filter(function (c) { return c.type === 'drivers-differences' && PA.cards.state[c.id] && PA.cards.state[c.id].data; })[0], res = dd ? PA.cards.state[dd.id].data : null, p = S.ws.prefs;
    UI.openDialog({ title: 'Export', sub: 'Exports carry their context: allocations and versions, scenario, reference, period and units.<br><b>' + esc(UI.context.sentence()) + '</b>',
      body: '<div class="doors"><button type="button" class="door" data-exp="csv" aria-pressed="true"' + (res ? '' : ' disabled') + '><b>Table as CSV</b><span>The Drivers &amp; Differences card as shown, with labelled columns</span></button><button type="button" class="door" data-exp="json" aria-pressed="false"><b>Workspace as JSON</b><span>Allocations, comparison, scenarios, cards and preferences</span></button></div><p class="small muted" style="margin:0">' + (res ? 'Table: ' + esc(UI.table.metricLabel((dd.settings || {}).metric || 'return')) + (res.period ? ', ' + esc(res.period.label) : '') + (S.activeScenario() ? ', scenario “' + esc(S.activeScenario().name) + '”' : ', base case') : 'Add a Drivers & Differences card to export a table.') + '</p>',
      onOpen: function (dlg) { U.on(dlg, 'click', '[data-exp]', function (e, b) { U.$$('[data-exp]', dlg).forEach(function (x) { x.setAttribute('aria-pressed', String(x === b)); }); }); },
      actions: [{ label: 'Cancel', ghost: true }, { label: 'Download', primary: true, onClick: function (c) {
        var kind = U.$('[data-exp][aria-pressed=true]', c.el).dataset.exp, stamp = new Date().toISOString().slice(0, 10), base = S.ws.name.replace(/[^\w]+/g, '-').toLowerCase();
        if (kind === 'json') { U.download(base + '-' + stamp + '.json', JSON.stringify(S.ws, null, 2), 'application/json'); return; }
        if (!res) return false;
        var set = dd.settings || {}, metric = set.metric || 'return', factors = set.factors && set.factors.length ? set.factors : ['equity', 'term', 'fx'];
        var lines = [], meta = ['Workspace', S.ws.name, 'Context', UI.context.sentence(), 'Exported', new Date().toISOString(), 'Reporting currency', S.ws.currency, 'Basis', (dd.settings || {}).metric === 'weight' ? 'none' : ((dd.settings || {}).basis || 'forward'), 'Metric', UI.table.metricLabel(metric), 'Unit', res.unit, 'Values', set.values || 'absolute', 'Scenario', S.activeScenario() ? S.activeScenario().name : 'Base case', 'Period', res.period ? res.period.label : D.assumptions.model];
        for (var i = 0; i < meta.length; i += 2) lines.push(U.csvCell(meta[i]) + ',' + U.csvCell(meta[i + 1])); lines.push('');
        var cols = []; res.columns.forEach(function (col) { col.sets.forEach(function (st) { (metric === 'factor' ? factors : [null]).forEach(function (fid) { cols.push({ col: col, set: st, fid: fid }); }); }); });
        lines.push(['Row', 'Kind'].concat(cols.map(function (x) { return x.col.name + ' [' + x.col.kind + (x.col.basisLabel ? ' · ' + x.col.basisLabel : '') + (x.col.referenceLabel ? ' vs ' + x.col.referenceLabel : '') + '] ' + x.set + (x.fid ? ' ' + (PA.cards.modelOf(dd).factorById[x.fid] || { name: x.fid }).name : ''); })).map(U.csvCell).join(','));
        res.rows.forEach(function (r) { lines.push([r.label, r.kind].concat(cols.map(function (x) { var cell = res.cells[x.col.allocationId][r.key][x.set]; if (!cell) return ''; var v = x.fid ? (cell.factors ? cell.factors[x.fid] : null) : cell.value; return v == null ? 'unavailable: ' + ((x.fid && cell.reasons && cell.reasons[x.fid]) || cell.reason || '') : U.round(v, 4); })).map(U.csvCell).join(',')); });
        U.download(base + '-' + metric + '-' + stamp + '.csv', lines.join('\n'), 'text/csv');
      } }] });
  };

  Dg.shortcuts = function () {
    var rows = [['/', 'Find a product to add (quick add, every category)'], ['+ · Insert', 'Quick add under the focused category'], ['⌘V', 'Paste a range of returns from Excel to add products'], ['b', 'Collapse or expand the builder'], ['s', 'Open or close the scenario drawer'], ['a', 'Open or close the card repository'], ['⌘Z · ⇧⌘Z', 'Undo · redo'], ['Esc', 'Close a dialog, menu, sheet or drawer'], ['↑ ↓ in the tree', 'Move between rows; ← → collapse and expand; Enter edits the weight; Space selects in select mode'], ['⌘-click a product', 'Add it to the sleeve selection'], ['← → ↑ ↓ on a card', 'Move it; with ⇧, resize it'], ['← → on a chart', 'Move the crosshair; ⇧ jumps a year'], ['?', 'This list']];
    UI.openDialog({ title: 'Keyboard shortcuts', body: '<table class="tbl" style="font-size:13px"><tbody>' + rows.map(function (r) { return '<tr><td style="width:40%"><kbd>' + esc(r[0]) + '</kbd></td><td>' + esc(r[1]) + '</td></tr>'; }).join('') + '</tbody></table>', actions: [{ label: 'Close', primary: true }] });
  };
})();

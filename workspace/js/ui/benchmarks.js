/* ─────────────────────────────────────────────────────────────────────────
   Portfolio Analytics · benchmarks
   One picker in two places (the context bar's “vs” menu and Assign
   benchmark), the custom benchmark builder, and the benchmark library
   (#/benchmarks). Presets are read-only and can be duplicated; custom
   benchmarks mix indices, products, other benchmarks and a fixed rate, are
   versioned like sleeves, and are shared with the team unless private.
   An allocation keeps the version it was assigned ('cbm_x@2') until someone
   moves it to a newer one.
   ───────────────────────────────────────────────────────────────────────── */
(function () {
  'use strict';
  var PA = window.PA, U = PA.util, esc = U.esc, S = PA.store, UI = PA.ui, D = PA.data, E = PA.engine, I = U.icon, F = U.fmt, V = UI.viz;
  var BM = UI.benchmarks = {};
  var lib = { presets: D.benchmarkPresets, custom: D.benchmarkLibrary };
  var REBAL = [['monthly', 'Monthly'], ['quarterly', 'Quarterly'], ['annual', 'Annually'], ['never', 'Never (weights drift)']];
  var KIND = { index: 'Index', product: 'Product', benchmark: 'Benchmark', rate: 'Fixed rate' };

  BM.refresh = function () { return PA.api.listBenchmarks().then(function (r) { lib = r; D.registerBenchmarks(r.custom); return r; }); };
  BM.custom = function () { return lib.custom; };
  var customById = function (id) { return lib.custom.filter(function (b) { return b.id === id; })[0] || null; };

  /* ── ids and versions ────────────────────────────────────────────── */
  /** The id to store when assigning: a custom benchmark is pinned to its latest version. */
  BM.pinId = function (id) { var b = D.benchmarkById[id]; if (!b || b.source !== 'custom') return id; var c = customById(b.customId); return b.customId + '@' + (c ? D.latestVersion(c).v : b.version); };
  /** {v, latest} when a stored id is pinned to an older version, else null. */
  BM.outdated = function (id) { var b = id && D.benchmarkById[id]; if (!b || b.source !== 'custom') return null; var c = customById(b.customId); if (!c) return null; var l = D.latestVersion(c).v; return b.version < l ? { v: b.version, latest: l } : null; };
  /** The library entry behind a stored id ('bm_x', 'cbm_x' or 'cbm_x@2'). */
  BM.baseId = function (id) { var b = id && D.benchmarkById[id]; return b ? (b.source === 'custom' ? b.customId : b.id) : null; };

  /* ── the category mix of a holding list ──────────────────────────── */
  BM.mix = function (holdings) { var w = E.categoryWeights(holdings || []); return D.categories.filter(function (c) { return Math.abs(w[c.id]) > 1e-9; }).map(function (c) { return { id: c.id, short: c.short, color: c.color, weight: w[c.id] }; }); };
  BM.mixBar = function (holdings, cls) {
    var m = BM.mix(holdings), tot = U.sum(m, function (x) { return Math.max(0, x.weight); }) || 1;
    return '<span class="bm-mix' + (cls ? ' ' + cls : '') + '" role="img" aria-label="' + esc('By category: ' + m.map(function (x) { return x.short + ' ' + F.num(x.weight, 0) + '%'; }).join(', ')) + '">' + m.map(function (x) { return '<i style="flex:' + Math.max(0, x.weight) / tot + ';background:' + x.color + '" data-tip="' + esc(x.short + ' ' + F.num(x.weight, 1) + '%') + '"></i>'; }).join('') + '</span>';
  };
  BM.mixLegend = function (holdings) { return '<span class="bm-legend">' + BM.mix(holdings).map(function (x) { return '<span><span class="sw" style="background:' + x.color + '"></span>' + esc(x.short) + ' <b>' + F.num(x.weight, 1) + '</b></span>'; }).join('') + '</span>'; };

  /* ── the picker: one list, presets and custom ────────────────────── */
  function optionHtml(b, selectedId) {
    var stored = selectedId && D.benchmarkById[selectedId], on = stored && (stored.source === 'custom' ? stored.customId === b.customId : stored.id === b.id) && b.source === (stored.source || 'preset');
    var c = b.source === 'custom' ? customById(b.customId) : null, old = on ? BM.outdated(selectedId) : null;
    var tags = (c && c.visibility === 'private' ? '<span class="tag">Only me</span>' : '') + (c ? '<span class="tag">v' + (old ? old.v : D.latestVersion(c).v) + '</span>' : '') + (old ? '<button type="button" class="tag tag-info bm-use" data-bm-use="' + esc(b.customId) + '" data-tip="Move to the latest version">v' + old.latest + ' available · Use</button>' : '');
    return '<button type="button" role="option" class="bm-opt" data-bm="' + esc(b.source === 'custom' ? b.customId : b.id) + '" aria-selected="' + !!on + '" data-text="' + esc((b.name + ' ' + (b.description || '')).toLowerCase()) + '"><span class="bm-main"><b>' + esc(b.name) + '</b><small>' + esc(b.description || '') + '</small></span>' + BM.mixBar(b.holdings) + '<span class="bm-tags">' + tags + '</span></button>';
  }
  function pickerHtml(selectedId, tab) {
    var pre = D.benchmarks.filter(function (b) { return b.source !== 'custom'; }), cus = D.benchmarks.filter(function (b) { return b.source === 'custom'; });
    var group = function (name, list, key) { return '<div class="bm-group" data-group="' + key + '"' + (tab && tab !== key ? ' hidden' : '') + '><div class="bm-ghead">' + name + ' · ' + list.length + '</div>' + (list.length ? list.map(function (b) { return optionHtml(b, selectedId); }).join('') : '<div class="faint small" style="padding:6px 10px">None yet.</div>') + '</div>'; };
    return '<div class="bm-list" role="listbox" aria-label="Benchmarks">' + group('Presets', pre, 'presets') + group('Custom', cus, 'custom') + '</div>';
  }
  function wirePicker(el, onPick) {
    var opts = function () { return U.$$('.bm-opt:not([hidden])', el).filter(function (o) { return !o.closest('[hidden]'); }); };
    U.on(el, 'click', '.bm-opt', function (e, o) { if (e.target.closest('[data-bm-use]')) return; U.$$('.bm-opt', el).forEach(function (x) { x.setAttribute('aria-selected', String(x === o)); }); onPick(o.dataset.bm); });
    U.on(el, 'keydown', '.bm-opt', function (e, o) { var list = opts(), i = list.indexOf(o); if (e.key === 'ArrowDown' && i < list.length - 1) { e.preventDefault(); list[i + 1].focus(); } if (e.key === 'ArrowUp' && i > 0) { e.preventDefault(); list[i - 1].focus(); } });
  }
  function filterPicker(el, q) { q = q.trim().toLowerCase(); U.$$('.bm-opt', el).forEach(function (o) { o.hidden = !!q && o.dataset.text.indexOf(q) < 0; }); }

  /** Assign benchmark: the allocation's own benchmark. */
  BM.assign = function (a) {
    var chosen = a.benchmarkId ? BM.baseId(a.benchmarkId) : '', tab = '';
    BM.refresh().then(function () {
      var nP = D.benchmarks.filter(function (b) { return b.source !== 'custom'; }).length, nC = D.benchmarks.length - nP;
      UI.openDialog({ title: 'Benchmark for ' + a.name, sub: 'Used when cards measure against each allocation’s own benchmark, and by Active risk &amp; return. Presets are maintained by the platform team; custom benchmarks come from the benchmark library.', wide: true, initialFocus: '#bm-q',
        body: '<div class="bm-tools"><div class="seg" role="group" aria-label="Show"><button type="button" data-bm-tab="" aria-pressed="true">All · ' + (nP + nC) + '</button><button type="button" data-bm-tab="presets" aria-pressed="false">Presets · ' + nP + '</button><button type="button" data-bm-tab="custom" aria-pressed="false">Custom · ' + nC + '</button></div><div class="search-wrap">' + I.search + '<input type="search" id="bm-q" placeholder="Search benchmarks…" aria-label="Search benchmarks"></div></div>' +
          '<div id="bm-pick">' + pickerHtml(a.benchmarkId) + '</div><label class="check" style="margin-top:10px"><input type="checkbox" id="bm-none"' + (a.benchmarkId ? '' : ' checked') + '> No benchmark</label>',
        onOpen: function (dlg) {
          var host = U.$('#bm-pick', dlg);
          wirePicker(host, function (id) { chosen = id; U.$('#bm-none', dlg).checked = false; });
          U.on(host, 'click', '[data-bm-use]', function (e, b) { chosen = b.dataset.bmUse; S.update(a.name + ' benchmark moved to the latest version', function (ws) { ws.allocations.filter(function (x) { return x.id === a.id; })[0].benchmarkId = BM.pinId(chosen); }, { type: 'edit' }); host.innerHTML = pickerHtml(S.allocation(a.id).benchmarkId, tab); });
          U.$('#bm-q', dlg).oninput = function (e) { filterPicker(host, e.target.value); };
          U.on(dlg, 'click', '[data-bm-tab]', function (e, b) { tab = b.dataset.bmTab; U.$$('[data-bm-tab]', dlg).forEach(function (x) { x.setAttribute('aria-pressed', String(x === b)); }); U.$$('.bm-group', host).forEach(function (g) { g.hidden = !!tab && g.dataset.group !== tab; }); });
          U.$('#bm-none', dlg).onchange = function (e) { if (e.target.checked) { chosen = ''; U.$$('.bm-opt', host).forEach(function (x) { x.setAttribute('aria-selected', 'false'); }); } };
        },
        actions: [{ label: 'Create custom benchmark…', ghost: true, onClick: function () { BM.builder({ assignTo: a }); } }, { spacer: true, label: 'Cancel', ghost: true }, { label: 'Assign', primary: true, onClick: function () {
          var id = chosen ? (BM.baseId(a.benchmarkId) === chosen ? a.benchmarkId : BM.pinId(chosen)) : null;
          if (id !== a.benchmarkId) S.update(a.name + ' benchmark set to ' + (id ? D.benchmarkById[id].name : 'none'), function (ws) { ws.allocations.filter(function (x) { return x.id === a.id; })[0].benchmarkId = id; }, { type: 'edit' });
        } }] });
    });
  };

  /** The context bar's “vs” menu: shared benchmarks, each allocation's own, or a compared portfolio, and the ways to make more. */
  BM.referenceMenu = function (btn) {
    var c = S.ws.comparison, check = function (on) { return on ? I.check : '<span class="menu-blank" aria-hidden="true"></span>'; };
    var set = function (patch, label) { S.update('Reference changed', function (ws) { for (var k in patch) ws.comparison[k] = patch[k]; }, { activity: false, force: true }); U.announce('Measuring against ' + label); };
    var shared = c.referenceMode === 'shared' ? BM.baseId(c.sharedBenchmarkId) : null, items = [];
    var bmItem = function (b) { var key = b.source === 'custom' ? b.customId : b.id, old = shared === key ? BM.outdated(c.sharedBenchmarkId) : null; return { label: b.name + (old ? ' · v' + old.v + ' (v' + old.latest + ' available)' : ''), icon: check(shared === key), onClick: function () { set({ referenceMode: 'shared', sharedBenchmarkId: shared === key && !old ? c.sharedBenchmarkId : BM.pinId(key) }, b.name); } }; };
    items.push({ head: 'Presets' }); D.benchmarks.filter(function (b) { return b.source !== 'custom'; }).forEach(function (b) { items.push(bmItem(b)); });
    var cus = D.benchmarks.filter(function (b) { return b.source === 'custom'; });
    if (cus.length) { items.push({ sep: true }, { head: 'Custom' }); cus.forEach(function (b) { items.push(bmItem(b)); }); }
    items.push({ sep: true }, { head: 'Per allocation' }, { label: 'Each allocation’s own benchmark', icon: check(c.referenceMode === 'individual'), onClick: function () { set({ referenceMode: 'individual' }, 'each allocation’s own benchmark'); } });
    var mem = S.members(); if (mem.length) { items.push({ sep: true }, { head: 'A compared portfolio' }); mem.forEach(function (a) { items.push({ label: a.name, icon: check(c.referenceMode === 'portfolio' && c.referencePortfolioId === a.id), onClick: function () { set({ referenceMode: 'portfolio', referencePortfolioId: a.id }, a.name); } }); }); }
    items.push({ sep: true }, { label: 'Create custom benchmark…', icon: I.plus, onClick: function () { BM.builder({ useAsReference: true }); } }, { label: 'Benchmark library', icon: I.folder, onClick: function () { UI.shell.go('#/benchmarks'); } });
    UI.menu(btn, items, { align: 'start', cls: 'ref-menu' });
  };

  /* ── the custom benchmark builder ────────────────────────────────── */
  /**
   * opts: {assignTo?: allocation, useAsReference?: bool, from?: CustomBenchmark (a new
   * version of it), duplicate?: {name, description, rows}, onSaved?(benchmark)}
   */
  BM.builder = function (opts) {
    opts = opts || {};
    var base = opts.from || null, seed = base ? D.latestVersion(base) : null;
    var st = { name: base ? base.name : (opts.duplicate ? opts.duplicate.name : ''), description: base ? base.description : (opts.duplicate ? opts.duplicate.description : ''), rebalance: base ? base.rebalance : 'monthly', visibility: base ? base.visibility : 'shared',
      rows: U.clone(seed ? seed.rows : opts.duplicate ? opts.duplicate.rows : []), note: '', q: '', results: [], active: 0 };
    var selfId = base ? base.id : null;
    var flat = function () { return D.flattenRows(st.rows.filter(function (r) { return r.weight > 0; })); };
    var total = function () { return U.round(U.sum(st.rows, function (r) { return Number(r.weight) || 0; }), 4); };
    var label = function (r) { if (r.kind === 'rate') return D.reporting + ' 3-Month Cash + ' + r.spread + '% a year'; if (r.kind === 'benchmark') { var b = D.benchmarkById[r.id]; return b ? b.name : r.id; } var i = D.instrumentById[r.id]; return i ? i.name : r.id; };
    var sub = function (r) { if (r.kind === 'rate') return 'Follows the reporting currency'; if (r.kind === 'benchmark') { var b = D.benchmarkById[r.id]; return b && b.source === 'custom' ? 'Custom benchmark' : 'Preset benchmark'; } var i = D.instrumentById[r.id]; return i ? i.type + ' · ' + i.identifier + (i.coverage !== 'full' ? '' : '') : ''; };
    var covTag = function (r) { var i = (r.kind === 'index' || r.kind === 'product') && D.instrumentById[r.id]; return i && i.coverage !== 'full' ? '<span class="tag tag-warn" data-tip="' + esc(i.proxyNote || '') + '">' + (i.coverage === 'none' ? 'No history' : 'Proxy') + '</span>' : ''; };
    function rowsHtml() {
      var t = total(), ok = Math.abs(t - 100) < 0.051;
      return '<div class="tblwrap bm-rows"><table class="tbl"><thead><tr><th scope="col">Constituent</th><th scope="col">Kind</th><th scope="col" class="num">Weight %</th><th scope="col"><span class="sr-only">Remove</span></th></tr></thead><tbody>' +
        (st.rows.length ? st.rows.map(function (r, i) { return '<tr><th scope="row"><b>' + esc(label(r)) + '</b> ' + covTag(r) + '<br><span class="faint small">' + esc(sub(r)) + '</span></th><td>' + KIND[r.kind] + (r.kind === 'rate' ? ' <input type="text" inputmode="decimal" class="input-sm bm-spread" data-spread="' + i + '" value="' + esc(String(r.spread)) + '" aria-label="Spread over cash, % a year"> % a year' : '') + '</td><td class="num"><input type="text" inputmode="decimal" class="input-sm bm-w" data-w="' + i + '" value="' + esc(String(r.weight)) + '" aria-label="' + esc(label(r)) + ' weight, %"></td><td><button type="button" class="btn btn-icon btn-xs btn-ghost" data-del="' + i + '" aria-label="Remove ' + esc(label(r)) + '">' + I.close + '</button></td></tr>'; }).join('') : '<tr><td colspan="4" class="faint">Add indices, products, benchmarks or a fixed rate below.</td></tr>') +
        '<tr class="total"><th scope="row">Total</th><td></td><td class="num ' + (ok ? 'pos' : 'neg') + '" id="bm-total">' + F.num(t, 1) + '%</td><td></td></tr></tbody></table></div>' +
        '<div class="bm-status ' + (ok ? 'is-ok' : 'is-warn') + '" role="status">' + (ok ? I.ok + '<span>Total 100.0% · ready to save' + (st.rows.some(function (r) { return !(r.weight > 0); }) ? '. Rows at 0% are left out.' : '') + '</span>' : I.warn + '<span>' + (st.rows.length ? (t < 100 ? F.num(100 - t, 1) + '% to allocate' : F.num(t - 100, 1) + '% over') + '. Weights must total 100%.' : 'Weights must total 100%.') + '</span>' + (st.rows.length && t > 0 ? '<button type="button" class="btn btn-xs" id="bm-norm">Scale to 100%</button>' : '')) + '</div>';
    }
    function mixHtml() { var f = flat(); return f.length ? '<div class="label" style="margin:12px 0 6px">By category</div>' + BM.mixBar(f, 'is-lg') + BM.mixLegend(f) : ''; }
    function resultsHtml() {
      if (!st.q.trim()) return '';
      if (!st.results.length) return '<div class="sr-empty">Nothing matches “' + esc(st.q) + '”.</div>';
      return st.results.map(function (r, i) { var used = st.rows.some(function (x) { return x.kind === r.kind && x.id === r.id; }); return '<button type="button" class="sr-item" role="option" data-pick="' + i + '" aria-selected="' + (i === st.active) + '"' + (used ? ' disabled' : '') + '><span><b>' + esc(r.name) + '</b><small>' + esc(r.meta) + '</small></span><span class="tag">' + (used ? 'Added' : KIND[r.kind]) + '</span></button>'; }).join('');
    }
    function search() {
      var q = st.q.trim().toLowerCase(); if (!q) { st.results = []; return Promise.resolve(); }
      var bms = D.benchmarks.filter(function (b) { return (b.source === 'custom' ? b.customId : b.id) !== selfId && b.name.toLowerCase().indexOf(q) >= 0; }).map(function (b) { return { kind: 'benchmark', id: b.source === 'custom' ? b.customId + '@' + b.version : b.id, name: b.name, meta: (b.source === 'custom' ? 'Custom benchmark' : 'Preset benchmark') + ' · ' + (b.description || '') }; });
      return PA.api.searchInvestments(st.q, { limit: 12 }).then(function (list) {
        st.results = list.filter(function (r) { return r.kind === 'instrument' && r.instrument.spread == null; }).map(function (r) { return { kind: r.type === 'Index' ? 'index' : 'product', id: r.id, name: r.name, meta: r.meta }; }).concat(bms).slice(0, 10); st.active = 0;
      });
    }
    var assignTo = opts.assignTo || null, title = base ? 'New version of ' + base.name : 'New custom benchmark';
    var actions = [{ label: 'Cancel', ghost: true }];
    if (assignTo || opts.useAsReference) actions.push({ label: 'Save to library', close: false, onClick: function (c) { return save(c, false); } });
    actions.push({ label: assignTo ? 'Save and assign to ' + assignTo.name : opts.useAsReference ? 'Save and measure against it' : (base ? 'Save as v' + (D.latestVersion(base).v + 1) : 'Save to library'), primary: true, close: false, onClick: function (c) { return save(c, !!(assignTo || opts.useAsReference)); } });
    UI.openDialog({ title: title, sub: 'Any mix of indices, products, other benchmarks and a fixed rate. Weights must total 100%.', xwide: true, initialFocus: base ? '#bm-add' : '#bm-name', actions: actions,
      body: '<div class="bm-builder"><div class="dlg-grid"><div class="field"><label for="bm-name">Name <span aria-hidden="true">*</span></label><input type="text" id="bm-name" maxlength="80" value="' + esc(st.name) + '" placeholder="e.g. Strategic Core Policy"' + (base ? ' disabled' : '') + '></div>' +
        '<div class="field"><label for="bm-desc">Description</label><input type="text" id="bm-desc" maxlength="160" value="' + esc(st.description) + '" placeholder="Optional"></div>' +
        '<div class="wide"><div class="label" style="margin-bottom:6px">Constituents</div><div id="bm-rows">' + rowsHtml() + '</div>' +
          '<div class="bm-add"><div class="search-wrap">' + I.search + '<input type="search" id="bm-add" placeholder="Add an index, product or benchmark…" aria-label="Add an index, product or benchmark" aria-controls="bm-results" autocomplete="off"></div><button type="button" class="btn btn-sm" id="bm-rate"' + (st.rows.some(function (r) { return r.kind === 'rate'; }) ? ' disabled' : '') + ' data-tip="A fixed return: the reporting currency’s 3-month cash rate plus a spread">' + I.plus + '<span>Cash + x%</span></button></div>' +
          '<div class="search-results" id="bm-results" role="listbox" aria-label="Constituents to add"></div><div id="bm-mix">' + mixHtml() + '</div></div>' +
        '<div class="field"><label for="bm-rebal">Rebalancing</label><select id="bm-rebal">' + REBAL.map(function (o) { return '<option value="' + o[0] + '"' + (st.rebalance === o[0] ? ' selected' : '') + '>' + o[1] + '</option>'; }).join('') + '</select><span class="field-hint">How the history is built. A rebalanced benchmark keeps its weights; “Never” lets them drift.</span></div>' +
        '<fieldset class="field bm-vis"><legend class="label">Who can use it</legend><label class="check"><input type="radio" name="bm-vis" value="shared"' + (st.visibility === 'shared' ? ' checked' : '') + '> Shared with the team</label><label class="check"><input type="radio" name="bm-vis" value="private"' + (st.visibility === 'private' ? ' checked' : '') + '> Only me</label><span class="field-hint">Shared benchmarks appear in every workspace’s picker.</span></fieldset>' +
        (base ? '<div class="field wide"><label for="bm-note">What changed in this version</label><input type="text" id="bm-note" maxlength="120" placeholder="e.g. Real estate added"></div>' : '') +
        '<span class="field-err wide" id="bm-err" role="alert"></span></div></div>',
      onOpen: function (dlg) {
        var paintRows = function () { U.$('#bm-rows', dlg).innerHTML = rowsHtml(); U.$('#bm-mix', dlg).innerHTML = mixHtml(); U.$('#bm-rate', dlg).disabled = st.rows.some(function (r) { return r.kind === 'rate'; }); syncSave(); };
        var syncSave = function () { var ok = Math.abs(total() - 100) < 0.051 && st.rows.length; U.$$('.dlg-actions [data-action]', dlg).forEach(function (b) { if (b.textContent !== 'Cancel') b.disabled = !ok; }); };
        var paintResults = function () { U.$('#bm-results', dlg).innerHTML = resultsHtml(); };
        var add = function (r) { st.rows.push({ kind: r.kind, id: r.id, weight: U.round(Math.max(0, 100 - total()), 2) }); st.q = ''; st.results = []; U.$('#bm-add', dlg).value = ''; paintResults(); paintRows(); var w = U.$('[data-w="' + (st.rows.length - 1) + '"]', dlg); if (w) { w.focus(); w.select(); } };
        var addIn = U.$('#bm-add', dlg);
        addIn.oninput = U.debounce(function () { st.q = addIn.value; search().then(paintResults); }, 140);
        addIn.onkeydown = function (e) { var n = st.results.length; if ((e.key === 'ArrowDown' || e.key === 'ArrowUp') && n) { e.preventDefault(); st.active = (st.active + (e.key === 'ArrowDown' ? 1 : n - 1)) % n; paintResults(); } if (e.key === 'Enter' && n) { e.preventDefault(); var r = st.results[st.active]; if (!st.rows.some(function (x) { return x.kind === r.kind && x.id === r.id; })) add(r); } };
        U.on(dlg, 'click', '[data-pick]', function (e, b) { add(st.results[Number(b.dataset.pick)]); });
        U.$('#bm-rate', dlg).onclick = function () { st.rows.push({ kind: 'rate', spread: 3, weight: U.round(Math.max(0, 100 - total()), 2) }); paintRows(); var sp = U.$('.bm-spread', dlg); if (sp) { sp.focus(); sp.select(); } };
        U.on(dlg, 'change', '[data-w]', function (e, inp) { var v = Number(inp.value.replace(',', '.').replace(/%$/, '')); if (!isFinite(v) || v < 0) { inp.setAttribute('aria-invalid', 'true'); return; } st.rows[Number(inp.dataset.w)].weight = U.round(v, 2); var k = inp.dataset.w; paintRows(); var n2 = U.$('[data-w="' + k + '"]', dlg); if (n2 && document.activeElement === document.body) n2.focus(); });
        U.on(dlg, 'keydown', '[data-w],[data-spread]', function (e, inp) { if (e.key === 'Enter') { e.preventDefault(); inp.dispatchEvent(new Event('change', { bubbles: true })); } });
        U.on(dlg, 'change', '[data-spread]', function (e, inp) { var v = Number(inp.value.replace(',', '.')); if (!isFinite(v) || v < -5 || v > 20) { inp.setAttribute('aria-invalid', 'true'); return; } st.rows[Number(inp.dataset.spread)].spread = U.round(v, 2); paintRows(); });
        U.on(dlg, 'click', '[data-del]', function (e, b) { st.rows.splice(Number(b.dataset.del), 1); paintRows(); addIn.focus(); });
        U.on(dlg, 'click', '#bm-norm', function () { var t = total(); if (t <= 0) return; var acc = 0; st.rows.forEach(function (r, i) { r.weight = i === st.rows.length - 1 ? U.round(100 - acc, 2) : U.round(r.weight / t * 100, 2); acc += r.weight; }); paintRows(); });
        syncSave();
      } });
    function save(c, andUse) {
      var dlg = c.el, err = U.$('#bm-err', dlg), name = (U.$('#bm-name', dlg).value || '').trim();
      if (!name) { U.$('#bm-name', dlg).setAttribute('aria-invalid', 'true'); err.textContent = 'Enter a name for the benchmark.'; U.$('#bm-name', dlg).focus(); return false; }
      if (Math.abs(total() - 100) > 0.051) { err.textContent = 'Weights must total 100%.'; return false; }
      var now = new Date().toISOString(), rows = st.rows.filter(function (r) { return r.weight > 0; }).map(function (r) { return r.kind === 'rate' ? { kind: 'rate', spread: r.spread, weight: r.weight } : { kind: r.kind, id: r.id, weight: r.weight }; });
      var b = base ? U.clone(base) : { id: U.uid('cbm'), name: name, source: 'custom', owner: 'F. Barker', archived: false, createdAt: now, versions: [] };
      b.description = U.$('#bm-desc', dlg).value.trim(); b.rebalance = U.$('#bm-rebal', dlg).value; b.visibility = (dlg.querySelector('[name=bm-vis]:checked') || {}).value || 'shared';
      b.versions.push({ v: b.versions.length + 1, createdAt: now, note: base ? (U.$('#bm-note', dlg).value.trim() || 'Weights edited') : 'Initial', rows: rows });
      U.$$('.dlg-actions .btn', dlg).forEach(function (x) { x.disabled = true; });
      PA.api.saveBenchmark(b).then(function (saved) {
        return BM.refresh().then(function () {
          c.close(true);
          var pinned = saved.id + '@' + D.latestVersion(saved).v;
          if (andUse && assignTo) S.update(assignTo.name + ' benchmark set to ' + saved.name, function (ws) { ws.allocations.filter(function (x) { return x.id === assignTo.id; })[0].benchmarkId = pinned; }, { type: 'edit' });
          else if (andUse && opts.useAsReference) S.update('Reference changed', function (ws) { ws.comparison.referenceMode = 'shared'; ws.comparison.sharedBenchmarkId = pinned; }, { activity: false, force: true });
          else if (S.ws) S.refresh();
          UI.toast('“' + saved.name + '” saved to the benchmark library as v' + D.latestVersion(saved).v + '.', { action: { label: 'Open library', fn: function () { UI.shell.go('#/benchmarks/' + encodeURIComponent(saved.id)); } } });
          if (opts.onSaved) opts.onSaved(saved);
        });
      }, function (e) { U.$$('.dlg-actions .btn', dlg).forEach(function (x) { x.disabled = false; }); err.textContent = 'Could not save: ' + (e.message || ''); });
      return false;
    }
  };

  /* ── the benchmark library (#/benchmarks) ────────────────────────── */
  var view = { filter: 'all', selected: null, version: null, q: '' };
  BM.showLibrary = function (el, selectedId) {
    document.title = 'Benchmark library · Portfolio Analytics';
    view.selected = selectedId || view.selected; view.version = null;
    el.innerHTML = '<header class="topbar"><a class="wordmark" href="#/"><b>Portfolio Management Group</b><span>Portfolio Analytics</span></a><span class="sep faint">/</span><span class="eyebrow">Benchmark library</span><span class="spacer"></span><button type="button" class="btn btn-sm btn-primary" id="bl-new">' + I.plus + '<span>New custom benchmark</span></button><a class="btn btn-sm" href="#/">' + I.chevronLeft + '<span>Workspaces</span></a><span class="user"><span class="avatar" aria-hidden="true">FB</span><span>F. Barker</span></span></header><div class="repo" id="blib"><div class="repo-nav skeleton" style="min-height:300px"></div><div class="repo-list"></div><div class="repo-detail"></div></div>';
    U.$('#bl-new', el).onclick = function () { BM.builder({ onSaved: function (b) { view.selected = b.id; view.filter = 'custom'; render(el); } }); };
    var cont = U.$('#blib', el);
    U.on(cont, 'click', '[data-filter]', function (e, b) { view.filter = b.dataset.filter; render(el); });
    U.on(cont, 'click', '[data-open]', function (e, b) { view.selected = b.dataset.open; view.version = null; history.replaceState(null, '', '#/benchmarks/' + encodeURIComponent(view.selected)); render(el); });
    BM.refresh().then(function () { if (!view.selected || !entry(view.selected)) view.selected = (lib.presets[0] || {}).id; render(el); });
  };
  function entry(id) { return lib.presets.filter(function (b) { return b.id === id; })[0] || customById(id); }
  function render(el) {
    var cont = U.$('#blib', el); if (!cont) return;
    var all = lib.presets.map(function (b) { return { b: b, preset: true }; }).concat(lib.custom.map(function (b) { return { b: b, preset: false }; }));
    var live = all.filter(function (x) { return !x.b.archived; });
    var visible = all.filter(function (x) { return view.filter === 'archived' ? x.b.archived : !x.b.archived && (view.filter === 'all' || (view.filter === 'presets') === x.preset); }).filter(function (x) { return !view.q || (x.b.name + ' ' + (x.b.description || '')).toLowerCase().indexOf(view.q.toLowerCase()) >= 0; });
    var nav = function (key, label, n) { return '<button type="button" data-filter="' + key + '" aria-pressed="' + (view.filter === key) + '"><span>' + label + '</span><span class="count">' + n + '</span></button>'; };
    var sel = entry(view.selected);
    cont.innerHTML = '<aside class="repo-nav" aria-label="Filter"><div class="eyebrow" style="padding:0 10px 8px">Benchmarks</div>' + nav('all', 'All', live.length) + nav('presets', 'Presets', live.filter(function (x) { return x.preset; }).length) + nav('custom', 'Custom', live.filter(function (x) { return !x.preset; }).length) + '<div class="menu-sep"></div>' + nav('archived', 'Archived', all.filter(function (x) { return x.b.archived; }).length) + '<div class="field-hint" style="padding:14px 10px 0">Presets are maintained by the platform team and can be duplicated. Custom benchmarks are versioned: a workspace keeps the version it uses until someone moves it on.</div></aside>' +
      '<section class="repo-list" aria-label="Benchmarks"><div style="padding:12px 16px;border-bottom:1px solid var(--line)"><div class="search-wrap">' + I.search + '<input type="search" id="bl-q" placeholder="Find a benchmark…" aria-label="Find a benchmark" value="' + esc(view.q) + '"></div></div>' +
        (visible.length ? visible.map(function (x) { var b = x.b, hs = x.preset ? b.holdings : (D.benchmarkById[b.id] || {}).holdings || D.flattenRows(D.latestVersion(b).rows); return '<button type="button" class="repo-item" data-open="' + esc(b.id) + '" aria-pressed="' + (b.id === view.selected) + '"><b>' + esc(b.name) + '</b><small>' + (x.preset ? 'Preset' : 'Custom · v' + D.latestVersion(b).v + ' · ' + esc(b.owner) + (b.visibility === 'private' ? ' · only me' : '')) + '</small>' + BM.mixBar(hs) + '</button>'; }).join('') : '<div class="empty"><p>No benchmarks here' + (view.q ? ' match “' + esc(view.q) + '”' : '') + '.</p></div>') + '</section>' +
      '<section class="repo-detail" aria-label="Benchmark detail">' + (sel ? detailHtml(sel) : '<div class="empty">' + I.layers + '<h3>Select a benchmark</h3></div>') + '</section>';
    U.$('#bl-q', cont).oninput = U.debounce(function (e) { view.q = e.target.value; render(el); var q = U.$('#bl-q', cont); q.focus(); q.setSelectionRange(q.value.length, q.value.length); }, 150);
    if (sel) wireDetail(el, sel);
  }
  function detailHtml(b) {
    var preset = b.source !== 'custom', ver = preset ? null : b.versions.filter(function (v) { return v.v === (view.version || D.latestVersion(b).v); })[0];
    var rows = preset ? b.holdings.map(function (h) { var i = D.instrumentById[h.instrumentId]; return { kind: i.type === 'Index' ? 'index' : 'product', id: h.instrumentId, weight: h.weight }; }) : ver.rows;
    var hs = preset ? b.holdings : D.flattenRows(ver.rows);
    var name = function (r) { if (r.kind === 'rate') return D.reporting + ' 3-Month Cash + ' + r.spread + '% a year'; if (r.kind === 'benchmark') { var x = D.benchmarkById[r.id]; return x ? x.name + (x.source === 'custom' ? ' v' + x.version : '') : r.id; } return (D.instrumentById[r.id] || { name: r.id }).name; };
    var cat = function (r) { if (r.kind === 'rate') return 'Cash'; if (r.kind === 'benchmark') return 'Looked through'; var c = D.categoryOf(r.id); return c ? c.short : ''; };
    return '<div class="row" style="justify-content:space-between;align-items:flex-start;gap:16px;flex-wrap:wrap"><div><div class="eyebrow">' + (preset ? 'Preset · platform team' : (b.archived ? 'Archived · ' : '') + 'Custom · ' + esc(b.owner) + ' · ' + (b.visibility === 'private' ? 'only me' : 'shared with the team')) + '</div><h1 style="font-family:var(--f-num);font-size:26px;font-weight:500;margin:4px 0 2px">' + esc(b.name) + '</h1><p class="muted" style="margin:0">' + esc(b.description || '') + '</p></div>' +
      '<div class="row" style="gap:6px;flex-wrap:wrap">' + (preset ? '<button type="button" class="btn btn-sm btn-primary" id="bl-dup">' + I.copy + '<span>Duplicate as custom</span></button>' : (b.archived ? '<button type="button" class="btn btn-sm" id="bl-restore">' + I.reset + '<span>Restore</span></button>' : '<button type="button" class="btn btn-sm btn-primary" id="bl-edit">' + I.sliders + '<span>Edit as v' + (D.latestVersion(b).v + 1) + '</span></button><button type="button" class="btn btn-sm" id="bl-dup">' + I.copy + '<span>Duplicate</span></button><button type="button" class="btn btn-sm btn-danger" id="bl-archive">' + I.trash + '<span>Archive</span></button>')) + '</div></div>' +
      '<div class="dlg-grid" style="margin-top:18px">' + (preset ? '' : '<div class="wide"><div class="label" style="margin-bottom:8px">Versions</div><div class="versions">' + b.versions.map(function (v) { return '<button type="button" data-ver="' + v.v + '" aria-pressed="' + (v.v === ver.v) + '" data-tip="' + esc(F.dateTime(v.createdAt) + ' · ' + v.note) + '">v' + v.v + '</button>'; }).join('') + '</div><div class="field-hint" style="margin-top:6px">v' + ver.v + ' · ' + esc(F.dateTime(ver.createdAt)) + ' · ' + esc(ver.note) + ' · rebalanced ' + esc((REBAL.filter(function (o) { return o[0] === b.rebalance; })[0] || ['', b.rebalance])[1].toLowerCase()) + '</div></div>') +
      '<div class="wide"><div class="label" style="margin-bottom:8px">Constituents · weights sum to 100</div>' + V.table([{ label: 'Constituent' }, { label: 'Kind' }, { label: 'Category' }, { label: 'Weight %', num: true }], rows.map(function (r) { return { cells: [esc(name(r)), KIND[r.kind], esc(cat(r)), F.num(r.weight, 2)] }; }).concat([{ cls: 'total', cells: ['Total', '', '', F.num(U.sum(rows, function (r) { return r.weight; }), 2)] }]), { maxHeight: 'none' }) + '</div>' +
      '<div class="wide"><div class="label" style="margin-bottom:6px">By category' + (rows.some(function (r) { return r.kind === 'benchmark'; }) ? ', looking through benchmarks' : '') + '</div>' + BM.mixBar(hs, 'is-lg') + BM.mixLegend(hs) + '</div></div>';
  }
  function wireDetail(el, b) {
    var det = U.$('#blib', el).querySelector('.repo-detail'), preset = b.source !== 'custom';
    U.on(det, 'click', '[data-ver]', function (e, x) { view.version = Number(x.dataset.ver); render(el); });
    var dup = U.$('#bl-dup', det); if (dup) dup.onclick = function () { var rows = preset ? b.holdings.map(function (h) { var i = D.instrumentById[h.instrumentId]; return { kind: i.type === 'Index' ? 'index' : 'product', id: h.instrumentId, weight: h.weight }; }) : U.clone(D.latestVersion(b).rows); BM.builder({ duplicate: { name: b.name + ' (custom)', description: b.description, rows: rows }, onSaved: function (s) { view.selected = s.id; view.filter = 'custom'; render(el); } }); };
    var ed = U.$('#bl-edit', det); if (ed) ed.onclick = function () { BM.builder({ from: b, onSaved: function (s) { view.selected = s.id; view.version = null; render(el); } }); };
    var ar = U.$('#bl-archive', det); if (ar) ar.onclick = function () { UI.confirm({ title: 'Archive “' + b.name + '”?', sub: 'It leaves the picker. Allocations and workspaces that use it keep it, and it can be restored.', confirmLabel: 'Archive', danger: true }).then(function (ok) { if (ok) PA.api.archiveBenchmark(b.id, true).then(BM.refresh).then(function () { render(el); }); }); };
    var rs = U.$('#bl-restore', det); if (rs) rs.onclick = function () { PA.api.archiveBenchmark(b.id, false).then(BM.refresh).then(function () { view.filter = 'custom'; render(el); }); };
  }
})();

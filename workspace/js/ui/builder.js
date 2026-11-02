/* ─────────────────────────────────────────────────────────────────────────
   Portfolio Analytics · the portfolio builder (navy rail)
   A tree: portfolio → category → product. Categories carry their own target
   weight (index-level modelling); products implement them; the unimplemented
   remainder shows as an index leaf. From here sleeves are created from a
   category or from a product selection, and applied to a category.
   ───────────────────────────────────────────────────────────────────────── */
(function () {
  'use strict';
  var PA = window.PA, U = PA.util, esc = U.esc, S = PA.store, UI = PA.ui, E = PA.engine, D = PA.data, I = U.icon, F = U.fmt;
  var B = UI.builder = {};
  var root, foot, collapsed = {}, searchQ = '', searchResults = null, searchTimer = null;

  B.render = function () {
    if (!root || !S.ws) return;
    var a = S.active();
    var focusKey = document.activeElement && root.contains(document.activeElement) ? document.activeElement.getAttribute('data-fkey') : null;
    root.innerHTML = renderActive(a) + (a ? (a.kind === 'snapshot' ? renderReadonly(a) : renderSearch()) + renderTree(a) + renderSummary(a) + renderLeverage(a) : renderNoActive());
    wire(a);
    if (focusKey) { var f = root.querySelector('[data-fkey="' + CSS.escape(focusKey) + '"]'); if (f) f.focus(); }
    renderFoot(a);
  };

  function renderActive(a) {
    var w = S.ws, members = w.comparison.members, inC = w.allocations.filter(function (x) { return members.indexOf(x.id) >= 0; }), out = w.allocations.filter(function (x) { return members.indexOf(x.id) < 0; });
    var opt = function (x) { return '<option value="' + esc(x.id) + '"' + (a && x.id === a.id ? ' selected' : '') + '>' + esc(x.name) + (x.kind === 'snapshot' ? ' · snapshot' : '') + '</option>'; };
    var bm = a && a.benchmarkId ? D.benchmarkById[a.benchmarkId] : null, hb = a ? E.historyBasis(a) : null;
    return '<div class="rail-sec active-pick"><div class="rail-sec-head"><span class="rail-eyebrow">Editing</span>' + (a ? '<span class="dot" style="background:' + UI.colorOf(a) + '" aria-hidden="true"></span>' : '') + '</div>' +
      '<select id="active-pick" aria-label="Allocation to edit"' + (w.allocations.length ? '' : ' disabled') + '>' + (inC.length ? '<optgroup label="In the comparison">' + inC.map(opt).join('') + '</optgroup>' : '') + (out.length ? '<optgroup label="Not compared">' + out.map(opt).join('') + '</optgroup>' : '') + (w.allocations.length ? '' : '<option>No allocations yet</option>') + '</select>' +
      (a ? '<div class="active-meta">' + UI.kindTag(a) + '<span data-tip="' + esc(hb.detail) + '">' + esc(hb.label) + '</span>' + (bm ? '<span>· vs ' + esc(bm.name) + '</span>' : '<span class="tag tag-warn" data-tip="Differences in “each allocation’s benchmark” mode are unavailable until one is assigned.">No benchmark</span>') + '</div>' : '') + '</div>';
  }
  function renderNoActive() { return '<div class="rail-sec"><div class="empty" style="padding:28px 8px;color:var(--rail-ink-2)">' + I.layers + '<h3 style="color:#fff">Nothing to edit yet</h3><p>Create an allocation from scratch, a template, a clone or an import.</p><div class="actions"><button type="button" class="btn btn-primary btn-sm" id="rail-new">' + I.plus + '<span>New allocation</span></button></div></div></div>'; }
  function renderReadonly(a) { var src = a.sourceId ? S.allocation(a.sourceId) : null; return '<div class="rail-readonly">' + I.lock + '<div><b>Fixed snapshot · editing disabled.</b> Captured ' + esc(F.dateTime(a.capturedAt)) + (src ? ' from ' + esc(src.name) : '') + '. Weights are frozen; analytics refresh with the platform model.<div style="margin-top:8px"><button type="button" class="btn btn-sm" id="rail-draft">' + I.copy + '<span>Create draft from snapshot</span></button></div></div></div>'; }
  function renderSearch() {
    return '<div class="rail-sec"><div class="rail-sec-head"><label class="rail-eyebrow" for="inv-search">Add investment</label><span class="small faint">funds · indices · securities · sleeves · portfolios</span></div>' +
      '<div class="search-wrap">' + I.search + '<input type="search" id="inv-search" placeholder="Search by name, identifier or type…" autocomplete="off" value="' + esc(searchQ) + '" aria-controls="inv-results" aria-describedby="inv-hint"><kbd>/</kbd></div><div class="search-results" id="inv-results" role="listbox" aria-label="Search results">' + renderResults() + '</div><span id="inv-hint" class="sr-only">Results update as you type. Choose a result to set a weight and add it.</span></div>';
  }
  function renderResults() {
    if (!searchQ.trim()) return '';
    if (searchResults === null) return '<div class="sr-empty">Searching…</div>';
    if (!searchResults.length) return '<div class="sr-empty">No investment matches “' + esc(searchQ) + '”. Try an identifier, a manager or a category.</div>';
    return searchResults.map(function (r, i) {
      var tag = r.kind === 'instrument' && r.coverage !== 'full' ? '<span class="tag tag-warn" data-tip="' + esc(r.instrument.proxyNote || 'Limited history') + '">' + (r.coverage === 'none' ? 'No history' : 'Proxy') + '</span>' : '<span class="tag">' + esc(r.type) + '</span>';
      return '<button type="button" class="sr-item" role="option" data-result="' + i + '"><span><b>' + esc(r.name) + '</b><small>' + esc(r.meta) + '</small></span>' + tag + '</button>';
    }).join('');
  }

  function renderTree(a) {
    var tree = E.tree(a), col = collapsed[a.id] || {}, ro = a.kind === 'snapshot', sel = S.ws.prefs.selectedRow, selMode = S.session.selectMode, selection = S.session.selection;
    var row = function (o) {
      var isCol = !!col[o.key];
      return '<div class="tree-row depth-' + o.depth + (sel === o.key ? ' is-selected' : '') + (o.index ? ' is-index' : '') + (o.over ? ' is-over' : '') + '" data-key="' + esc(o.key) + '">' +
        '<div class="tree-main">' + (o.hasChildren ? '<button type="button" class="tw" data-toggle="' + esc(o.key) + '" aria-expanded="' + (!isCol) + '" aria-label="' + (isCol ? 'Expand ' : 'Collapse ') + esc(o.plain) + '">' + I.chevron + '</button>' : '<span class="tw is-leaf" aria-hidden="true">' + I.chevron + '</span>') +
        (selMode && o.selectable ? '<input type="checkbox" class="tsel" data-sel="' + esc(o.selId) + '" aria-label="Select ' + esc(o.plain) + '"' + (o.selected ? ' checked' : '') + (o.indeterminate ? ' data-ind="1"' : '') + '>' : '') +
        '<button type="button" class="tname" data-select="' + esc(o.key) + '" data-fkey="n:' + esc(o.key) + '" aria-label="' + esc(o.plain) + ', select row"><b>' + o.labelHtml + '</b><small>' + o.subHtml + '</small></button></div>' +
        '<div class="tright">' + (o.readonly ? '<span class="tval" data-tip="' + esc(o.tip || '') + '">' + F.num(o.weight) + '</span><span class="tpct">%</span>' : '<input class="tw-input' + (o.depth === 0 ? ' is-sleeve' : '') + '" type="number" step="0.5" value="' + F.num(o.weight, o.weight % 1 ? 2 : 1).replace('−', '-') + '" data-key="' + esc(o.key) + '" data-fkey="w:' + esc(o.key) + '" aria-label="' + esc(o.plain) + ' weight, percent of total portfolio"' + (ro ? ' disabled' : '') + '><span class="tpct">%</span>') +
        (o.menu ? '<button type="button" class="tmenu" aria-label="Options for ' + esc(o.plain) + '" aria-haspopup="menu" aria-expanded="false" data-rowmenu="' + esc(o.key) + '" data-kind="' + o.menu + '">' + I.more + '</button>' : '<span class="tmenu" aria-hidden="true"></span>') + '</div></div>';
    };
    var html = '<li class="depth-0">' + '<div class="tree-row depth-0 is-root" data-key="__total"><div class="tree-main"><span class="tw is-leaf" aria-hidden="true"></span><button type="button" class="tname" data-select="__total" data-fkey="n:__total"><b>' + esc(a.name) + '</b><small>' + a.holdings.length + ' products · ' + tree.filter(function (t) { return t.target > 0 || t.products.length; }).length + ' categories</small></button></div><div class="tright"><span class="tval" data-tip="Σ of category targets (products plus index remainders)">' + F.num(E.allocated(a)) + '</span><span class="tpct">%</span><button type="button" class="tmenu" aria-label="Options for ' + esc(a.name) + '" aria-haspopup="menu" aria-expanded="false" data-rowmenu="__total" data-kind="root">' + I.more + '</button></div></div></li>';
    html += tree.map(function (t) {
      var nSel = t.products.filter(function (h) { return selection.indexOf(h.id) >= 0; }).length;
      var sub = t.products.length ? t.products.length + ' product' + (t.products.length === 1 ? '' : 's') + ' · ' + F.num(t.implemented) + '% implemented' + (t.remainder > 1e-9 ? ' · ' + F.num(t.remainder) + '% index' : t.over ? ' · over by ' + F.num(-t.remainder) + '%' : '') : (t.target > 0 ? 'No products · modelled at index level' : 'Empty');
      if (t.sleeveRef) sub = '<span class="sleeve-tag" data-tip="All products in this category come from the sleeve ' + esc(t.sleeveRef.name) + ' v' + t.sleeveRef.version + '">' + I.layers + esc(t.sleeveRef.name) + ' v' + t.sleeveRef.version + '</span> ' + sub;
      var o = '<li class="depth-0" style="--cat:' + t.color + '">' + row({ key: t.id, depth: 0, plain: t.name, labelHtml: esc(t.name), subHtml: sub, weight: t.target, hasChildren: t.products.length > 0 || t.remainder > 1e-9, menu: 'category', over: t.over, selectable: t.products.length > 0, selId: 'cat:' + t.id, selected: t.products.length > 0 && nSel === t.products.length, indeterminate: nSel > 0 && nSel < t.products.length });
      if (!col[t.id]) {
        o += '<ul>' + t.products.map(function (h) {
          var ins = D.instrumentById[h.instrumentId], key = t.id + '/' + h.instrumentId, rel = t.target ? F.num(h.weight / t.target * 100, 1) + '% of ' + t.short : '—';
          var cov = ins.coverage !== 'full' ? '<span class="cov" data-tip="' + esc(ins.proxyNote) + '" role="img" aria-label="' + esc(ins.proxyNote) + '"></span>' : '';
          return '<li class="depth-1">' + row({ key: key, depth: 1, plain: ins.name, labelHtml: esc(ins.name) + cov, subHtml: esc(ins.type) + ' · ' + esc(ins.identifier) + ' · ' + esc(rel) + (h.sleeveRef ? ' · from ' + esc(h.sleeveRef.name) + ' v' + h.sleeveRef.version : ''), weight: h.weight, hasChildren: false, menu: 'product', selectable: true, selId: h.id, selected: selection.indexOf(h.id) >= 0 }) + '</li>';
        }).join('') + (t.remainder > 1e-9 ? '<li class="depth-1">' + row({ key: t.id + '/__index', depth: 1, plain: t.short + ' Index', labelHtml: esc(t.short) + ' Index', subHtml: 'unimplemented remainder · ' + D.categoryById[t.id].index.map(function (p) { return D.instrumentById[p[0]].identifier + ' ' + p[1] + '%'; }).join(', '), weight: t.remainder, readonly: true, index: true, tip: 'Target ' + F.num(t.target) + '% less ' + F.num(t.implemented) + '% in products. Modelled by the category index basket.', hasChildren: false, menu: null }) + '</li>' : '') + '</ul>';
      }
      return o + '</li>';
    }).join('');
    var selW = U.sum(a.holdings.filter(function (h) { return selection.indexOf(h.id) >= 0; }), function (h) { return h.weight; });
    return '<div class="rail-sec"><div class="rail-sec-head"><span class="rail-eyebrow">Portfolio</span><span class="row" style="gap:4px">' + (!ro ? '<button type="button" class="btn btn-ghost btn-xs" id="tree-select" aria-pressed="' + selMode + '" data-tip="Select products to build a sleeve">' + I.check + '<span>Select</span></button>' : '') + '<button type="button" class="btn btn-ghost btn-xs" id="tree-expand">Expand</button><button type="button" class="btn btn-ghost btn-xs" id="tree-collapse">Collapse</button></span></div>' +
      (selMode ? '<div class="selbar" role="status"><span><b>' + selection.length + '</b> selected · <b>' + F.num(selW) + '%</b></span><span class="spacer"></span><button type="button" class="btn btn-xs btn-primary" id="sel-create"' + (selection.length ? '' : ' disabled') + '>' + I.layers + '<span>Create sleeve</span></button><button type="button" class="btn btn-xs btn-ghost" id="sel-clear">Clear</button><button type="button" class="btn btn-xs" id="sel-done">Done</button></div>' : '') +
      '<ul class="tree" id="tree" role="tree" aria-label="Categories and products of ' + esc(a.name) + '">' + html + '</ul>' +
      '<div class="field-hint" style="margin-top:4px">Weights are % of the total portfolio. A category’s target is modelled by its index until products implement it.</div><div class="field-err" id="tree-err" role="alert" style="color:#F6A8A0"></div></div>';
  }
  function renderSummary(a) {
    var net = E.allocated(a), gross = E.gross(a), res = 100 - net, tree = E.tree(a);
    var bar = tree.map(function (t) { return t.target > 0 ? '<i style="width:' + U.clamp(t.target, 0, 100) + '%;background:' + t.color + '" title="' + esc(t.name) + ' ' + F.num(t.target) + '%"></i>' : ''; }).join('');
    var idx = U.sum(tree, function (t) { return Math.max(0, t.remainder); });
    return '<div class="rail-sec"><div class="weights-summary" aria-label="Weight summary"><div class="row"><span>Allocated</span><b>' + F.pct(net) + '</b></div><div class="bar" aria-hidden="true">' + bar + '</div>' +
      '<div class="row"><span>' + (res >= -1e-9 ? 'Unallocated' : 'Borrowing') + '</span><b class="' + (res < -1e-9 ? 'warn' : '') + '">' + F.pct(Math.abs(res)) + '</b></div>' +
      '<div class="row" style="color:var(--rail-ink-2)"><span>In products ' + F.pct(U.sum(a.holdings, function (h) { return h.weight; })) + '</span><span>At index level ' + F.pct(idx) + '</span></div>' +
      '<div class="row" style="color:var(--rail-ink-2)"><span>Gross ' + F.pct(gross) + '</span><span>Net ' + F.pct(E.net(a)) + '</span></div>' +
      (res > 1e-9 ? '<div class="small" style="color:var(--rail-ink-3)">Unallocated weight earns nothing and carries no risk. It is not priced as cash.</div>' : '') + (res < -1e-9 ? '<div class="small" style="color:var(--rail-ink-3)">Borrowing shown as information only: no financing cost is modelled.</div>' : '') + '</div></div>';
  }
  function renderLeverage(a) { return '<div class="rail-sec"><label class="switch"><input type="checkbox" id="lev-switch"' + (a.leverage ? ' checked' : '') + (a.kind === 'snapshot' ? ' disabled' : '') + '><span class="track"></span><span>Enable shorts &amp; leverage</span></label><div class="field-hint">' + (a.leverage ? 'Negative weights and net allocation above 100% are accepted. Gross, net and borrowing are informational; no risk limit applies.' : 'Off: weights must be between 0% and 100% and the total at most 100%.') + '</div></div>'; }
  function renderFoot(a) { if (foot) foot.innerHTML = '<span class="txt">' + (a ? esc(a.holdings.length) + ' products · ' + esc(S.ws.currency) : '') + '</span><span class="spacer"></span><span class="txt small">Press <kbd>b</kbd> to collapse</span>'; }

  /* ── events ──────────────────────────────────────────────────────── */
  function wire(a) {
    var pick = U.$('#active-pick'); if (pick) pick.onchange = function () { var id = pick.value; S.update('Editing switched to ' + S.allocation(id).name, function (ws) { ws.comparison.activeId = id; }, { refresh: false, activity: false, force: true }); };
    var nb = U.$('#rail-new'); if (nb) nb.onclick = function () { UI.dialogs.newAllocation(); };
    var dr = U.$('#rail-draft'); if (dr) dr.onclick = function () { UI.dialogs.draftFromSnapshot(a); };
    var si = U.$('#inv-search');
    if (si) {
      si.oninput = function () { searchQ = si.value; searchResults = null; U.$('#inv-results').innerHTML = renderResults(); clearTimeout(searchTimer); searchTimer = setTimeout(runSearch, 160); };
      si.onkeydown = function (e) { if (e.key === 'ArrowDown') { var first = U.$('#inv-results .sr-item'); if (first) { e.preventDefault(); first.focus(); } } if (e.key === 'Escape') { searchQ = ''; si.value = ''; searchResults = null; U.$('#inv-results').innerHTML = ''; } };
      var res = U.$('#inv-results');
      U.on(res, 'click', '[data-result]', function (e, b) { UI.dialogs.addInvestment(searchResults[Number(b.dataset.result)], a); });
      res.addEventListener('keydown', function (e) { var items = U.$$('.sr-item', res), i = items.indexOf(document.activeElement); if (e.key === 'ArrowDown' && i < items.length - 1) { e.preventDefault(); items[i + 1].focus(); } if (e.key === 'ArrowUp') { e.preventDefault(); if (i > 0) items[i - 1].focus(); else si.focus(); } if (e.key === 'Escape') si.focus(); });
    }
    var tree = U.$('#tree');
    if (tree) {
      U.$$('.tsel[data-ind]', tree).forEach(function (cb) { cb.indeterminate = true; });
      U.on(tree, 'click', '[data-toggle]', function (e, b) { var key = b.dataset.toggle, c = collapsed[a.id] = collapsed[a.id] || {}; if (c[key]) delete c[key]; else c[key] = true; B.render(); });
      U.on(tree, 'click', '[data-select]', function (e, b) { if (e.metaKey || e.ctrlKey) { var h = holdingForKey(a, b.dataset.select); if (h) { S.toggleSelected(h.id); return; } } S.setPref('selectedRow', b.dataset.select); ensureTableExpanded(b.dataset.select); });
      U.on(tree, 'change', '.tsel', function (e, cb) {
        var id = cb.dataset.sel;
        if (id.indexOf('cat:') === 0) { var ps = E.productsIn(a, id.slice(4)), all = ps.every(function (h) { return S.session.selection.indexOf(h.id) >= 0; }); ps.forEach(function (h) { var on = S.session.selection.indexOf(h.id) >= 0; if (all ? on : !on) S.toggleSelected(h.id); }); }
        else S.toggleSelected(id);
      });
      U.on(tree, 'change', 'input[data-key]', function (e, inp) { commitWeight(inp, a); });
      U.on(tree, 'keydown', 'input[data-key]', function (e, inp) { if (e.key === 'Enter') { e.preventDefault(); inp.blur(); } if (e.key === 'Escape') { inp.value = inp.defaultValue; inp.removeAttribute('aria-invalid'); U.$('#tree-err').textContent = ''; } });
      U.on(tree, 'click', '[data-rowmenu]', function (e, b) { rowMenu(b, a); });
      tree.addEventListener('keydown', function (e) {
        var names = U.$$('.tname', tree), cur = document.activeElement, i = names.indexOf(cur); if (i < 0) return;
        var key = cur.dataset.select, c = collapsed[a.id] = collapsed[a.id] || {};
        if (e.key === 'ArrowDown' && i < names.length - 1) { e.preventDefault(); names[i + 1].focus(); }
        else if (e.key === 'ArrowUp' && i > 0) { e.preventDefault(); names[i - 1].focus(); }
        else if (e.key === 'ArrowRight') { e.preventDefault(); if (c[key]) { delete c[key]; B.render(); } }
        else if (e.key === 'ArrowLeft') { e.preventDefault(); if (cur.closest('.tree-row').querySelector('[data-toggle]') && !c[key]) { c[key] = true; B.render(); } }
        else if (e.key === 'Enter') { e.preventDefault(); var w = cur.closest('.tree-row').querySelector('input[data-key]'); if (w && !w.disabled) { w.focus(); w.select(); } }
        else if (e.key === ' ' && S.session.selectMode) { var h = holdingForKey(a, key); if (h) { e.preventDefault(); S.toggleSelected(h.id); } }
      });
      U.$('#tree-expand').onclick = function () { collapsed[a.id] = {}; B.render(); };
      U.$('#tree-collapse').onclick = function () { var c = collapsed[a.id] = {}; D.categories.forEach(function (ct) { c[ct.id] = true; }); B.render(); };
      var ts = U.$('#tree-select'); if (ts) ts.onclick = function () { S.setSelectMode(!S.session.selectMode); };
      var sc = U.$('#sel-create'); if (sc) sc.onclick = function () { UI.sleeves.create({ alloc: a, holdingIds: S.session.selection.slice() }); };
      var scl = U.$('#sel-clear'); if (scl) scl.onclick = function () { S.clearSelection(); };
      var sd = U.$('#sel-done'); if (sd) sd.onclick = function () { S.setSelectMode(false); };
    }
    var lev = U.$('#lev-switch');
    if (lev) lev.onchange = function () {
      if (!lev.checked && (a.holdings.some(function (h) { return h.weight < 0; }) || E.allocated(a) > 100.0001)) { lev.checked = true; U.$('#tree-err').textContent = 'Bring the allocation back to long-only and at or below 100% before disabling leverage.'; return; }
      var on = lev.checked; S.update(a.name + ': shorts & leverage ' + (on ? 'enabled' : 'disabled'), function (ws) { ws.allocations.filter(function (y) { return y.id === a.id; })[0].leverage = on; }, { refresh: false, type: 'edit' });
    };
  }
  function holdingForKey(a, key) { var p = key.split('/'); if (p.length !== 2 || p[1] === '__index') return null; return a.holdings.filter(function (h) { return h.instrumentId === p[1]; })[0] || null; }
  function runSearch() { var q = searchQ; if (!q.trim()) { searchResults = null; var r0 = U.$('#inv-results'); if (r0) r0.innerHTML = ''; return; } PA.api.searchInvestments(q, { limit: 10 }).then(function (list) { if (q !== searchQ) return; searchResults = list; var r = U.$('#inv-results'); if (r) r.innerHTML = renderResults(); U.announce(list.length + ' result' + (list.length === 1 ? '' : 's') + ' for ' + q); }); }
  function ensureTableExpanded(key) { var parts = key.split('/'), ex = S.ws.prefs.expanded.slice(); if (parts.length > 1 && ex.indexOf(parts[0]) < 0) { ex.push(parts[0]); S.setPref('expanded', ex); } }

  /** Commit a weight: a category target, or a product's weight. */
  function commitWeight(inp, a) {
    var err = U.$('#tree-err'), key = inp.dataset.key, raw = inp.value.trim(), v = Number(raw);
    if (inp.dataset.last === raw) return; inp.dataset.last = raw; err.textContent = '';
    if (raw === '' || !isFinite(v)) { inp.setAttribute('aria-invalid', 'true'); err.textContent = 'Enter a number for the weight.'; return; }
    v = U.round(v, 2);
    var parts = key.split('/'), next = { holdings: U.clone(a.holdings), categories: U.clone(E.categoryTargets(a)), leverage: a.leverage }, label, before;
    if (parts.length === 1) { before = next.categories[key]; next.categories[key] = v; label = D.categoryById[key].name; }
    else { var h = next.holdings.filter(function (x) { return x.instrumentId === parts[1]; })[0]; if (!h) return; before = h.weight; h.weight = v; label = D.instrumentById[parts[1]].name; }
    var allocated = E.allocated(next);
    if (!a.leverage && (v < 0 || allocated > 100.0001)) { inp.setAttribute('aria-invalid', 'true'); err.textContent = v < 0 ? 'Negative weights need shorts & leverage enabled.' : 'That takes the allocation to ' + F.num(allocated) + '%. Lower another weight or enable shorts & leverage.'; return; }
    inp.removeAttribute('aria-invalid');
    S.update(a.name + ' · ' + label + ' ' + F.num(before) + '% → ' + F.num(v) + '%', function (ws) { var x = ws.allocations.filter(function (y) { return y.id === a.id; })[0]; x.holdings = next.holdings; x.categories = next.categories; if (x.history && x.history.basis === 'actual') x.edited = true; }, { type: 'edit' });
    U.announce(label + ' set to ' + F.num(v) + ' percent. Analytics updating.');
  }
  function rowMenu(btn, a) {
    var key = btn.dataset.rowmenu, kind = btn.dataset.kind, items = [], ro = a.kind === 'snapshot';
    if (kind === 'root') items = [{ head: a.name }, { label: 'Rename', onClick: function () { UI.dialogs.renameAllocation(a); } }, { label: 'Assign benchmark…', onClick: function () { UI.dialogs.assignBenchmark(a); } }, { label: 'Snapshot this allocation', icon: I.camera, onClick: function () { UI.dialogs.snapshot(a); } }, { label: 'Show portfolio total in table', icon: I.table, onClick: function () { S.setPref('selectedRow', '__total'); } }];
    else if (kind === 'category') {
      var t = E.tree(a).filter(function (x) { return x.id === key; })[0];
      items = [{ head: t.name },
        { label: 'Create sleeve from category', icon: I.layers, disabled: !t.products.length, onClick: function () { UI.sleeves.create({ alloc: a, categoryId: key }); } },
        { label: 'Apply a sleeve…', icon: I.folder, disabled: ro, onClick: function () { UI.sleeves.apply(a, key); } },
        { label: 'Add a product here', icon: I.plus, disabled: ro, onClick: function () { var s = U.$('#inv-search'); if (s) { s.focus(); } } },
        { sep: true },
        { label: 'Show in table', icon: I.table, onClick: function () { S.setPref('selectedRow', key); } },
        { label: 'Set target to products (' + F.num(t.implemented) + '%)', disabled: ro || Math.abs(t.remainder) < 1e-9, onClick: function () { var inp = root.querySelector('input[data-key="' + CSS.escape(key) + '"]'); if (inp) { inp.value = String(t.implemented); commitWeight(inp, a); } } },
        { label: 'Set weight to 0', disabled: ro || t.target === 0, onClick: function () { var inp = root.querySelector('input[data-key="' + CSS.escape(key) + '"]'); if (inp) { inp.value = '0'; commitWeight(inp, a); } } }];
    } else {
      var parts = key.split('/'), ins = D.instrumentById[parts[1]], h = holdingForKey(a, key), on = h && S.session.selection.indexOf(h.id) >= 0;
      items = [{ head: ins.name },
        { label: on ? 'Deselect' : 'Select for a sleeve', icon: I.check, disabled: ro, onClick: function () { S.toggleSelected(h.id); } },
        { label: 'Inspect', icon: I.info, onClick: function () { UI.dialogs.inspectInstrument(ins); } },
        { label: 'Show in table', icon: I.table, onClick: function () { S.setPref('selectedRow', key); ensureTableExpanded(key); } },
        { sep: true },
        { label: 'Remove from allocation', icon: I.trash, disabled: ro, onClick: function () {
          S.update(a.name + ' · ' + ins.name + ' removed', function (ws) { var x = ws.allocations.filter(function (y) { return y.id === a.id; })[0]; x.categories = E.categoryTargets(x); x.holdings = x.holdings.filter(function (q) { return q.instrumentId !== ins.id; }); if (x.history && x.history.basis === 'actual') x.edited = true; if (ws.prefs.selectedRow === key) ws.prefs.selectedRow = parts[0]; }, { type: 'edit' });
          UI.toast(ins.name + ' removed. The category target is unchanged, so the weight is now modelled at index level.', { action: { label: 'Undo', fn: S.undo } });
        } }];
    }
    UI.menu(btn, items, { align: 'end' });
  }

  /* ── rail collapse and resize ────────────────────────────────────── */
  B.toggleCollapsed = function () {
    if (window.innerWidth <= 900) { S.setSession('railOpen', !S.session.railOpen); return; }
    S.setPref('railCollapsed', !S.ws.prefs.railCollapsed);
    var t = U.$('#rail-collapse'); if (t) t.setAttribute('aria-expanded', String(!S.ws.prefs.railCollapsed));
    U.announce(S.ws.prefs.railCollapsed ? 'Builder collapsed' : 'Builder expanded');
  };
  function initResize() {
    var handle = U.$('#rail-resizer'), ws = U.$('#view-ws'); if (!handle) return;
    var apply = function (w) { w = U.clamp(w, 280, 560); ws.style.setProperty('--rail-w', w + 'px'); handle.setAttribute('aria-valuenow', String(w)); return w; };
    B.applyWidth = function () { if (S.ws) apply(S.ws.prefs.railWidth || 360); };
    var startX = 0, startW = 0;
    handle.addEventListener('pointerdown', function (e) { if (S.ws.prefs.railCollapsed) return; startX = e.clientX; startW = U.$('#rail').getBoundingClientRect().width; handle.setPointerCapture(e.pointerId); handle.classList.add('is-active'); e.preventDefault(); });
    handle.addEventListener('pointermove', function (e) { if (handle.classList.contains('is-active')) apply(startW + e.clientX - startX); });
    var done = function () { if (!handle.classList.contains('is-active')) return; handle.classList.remove('is-active'); S.setPref('railWidth', Number(handle.getAttribute('aria-valuenow'))); };
    handle.addEventListener('pointerup', done); handle.addEventListener('pointercancel', done);
    handle.addEventListener('keydown', function (e) { var cur = Number(handle.getAttribute('aria-valuenow')) || 360; if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') { e.preventDefault(); S.setPref('railWidth', apply(cur + (e.key === 'ArrowLeft' ? -16 : 16))); } if (e.key === 'Home') { e.preventDefault(); S.setPref('railWidth', apply(280)); } if (e.key === 'End') { e.preventDefault(); S.setPref('railWidth', apply(560)); } if (e.key === 'Enter') { e.preventDefault(); B.toggleCollapsed(); } });
    handle.addEventListener('dblclick', B.toggleCollapsed);
  }

  B.init = function () {
    root = U.$('#builder'); foot = U.$('#rail-foot');
    var ct = U.$('#rail-collapse'); if (ct) ct.onclick = B.toggleCollapsed;
    var ex = U.$('#rail-expand'); if (ex) ex.onclick = B.toggleCollapsed;
    var ad = U.$('#rail-add'); if (ad) ad.onclick = function () { B.toggleCollapsed(); setTimeout(function () { var s = U.$('#inv-search'); if (s) s.focus(); }, 300); };
    var cl = U.$('#rail-close'); if (cl) cl.onclick = function () { S.setSession('railOpen', false); };
    initResize();
    S.subscribe(function (type, extra) {
      if (!S.ws) return;
      if (type === 'load') { searchQ = ''; searchResults = null; B.applyWidth(); B.render(); var t = U.$('#rail-collapse'); if (t) t.setAttribute('aria-expanded', String(!S.ws.prefs.railCollapsed)); }
      if (type === 'update' || type === 'undo' || type === 'redo') B.render();
      if (type === 'session' && extra.key === 'selection') B.render();
      if (type === 'pref' && extra.key === 'selectedRow') U.$$('.tree-row', root).forEach(function (r) { r.classList.toggle('is-selected', r.dataset.key === S.ws.prefs.selectedRow); });
    });
  };
})();

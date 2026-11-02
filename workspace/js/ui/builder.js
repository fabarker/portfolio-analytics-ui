/* ─────────────────────────────────────────────────────────────────────────
   Portfolio Analytics · the portfolio builder (the rail: navy header and tabs, white panel)
   The header names the allocation being edited; four tabs split the rail's
   jobs. Build: the tree, portfolio → category → product. Categories carry
   their own target weight (index-level modelling); products implement them;
   the unimplemented remainder shows as an index leaf. Sleeves are created
   from a category or a product selection here. Add: search the universe,
   filtered by category. Sleeves: the repository, with Apply and Compare.
   Check: what needs attention (its count is the tab's badge), the weight
   summary and the leverage switch.
   ───────────────────────────────────────────────────────────────────────── */
(function () {
  'use strict';
  var PA = window.PA, U = PA.util, esc = U.esc, S = PA.store, UI = PA.ui, E = PA.engine, D = PA.data, I = U.icon, F = U.fmt;
  var B = UI.builder = {};
  var root, foot, rail, collapsed = {}, searchQ = '', searchResults = null, searchTimer = null;
  var addCat = '', sleeveList = null, sleeveCat = '';
  /* Weights are typed, never stepped. A typed value is pending until Enter
     applies it (one edit, one recalculation); Esc discards it. Pending values
     survive re-renders and leaving the field: allocation id → row key → text. */
  var pending = {};
  var pendingOf = function (a) { return pending[a.id] || (pending[a.id] = {}); };
  var TABS = [{ id: 'build', label: 'Build', icon: 'build', title: 'Categories and products' }, { id: 'add', label: 'Add', icon: 'search', title: 'Add an investment (/)' }, { id: 'sleeves', label: 'Sleeves', icon: 'layers', title: 'The sleeve repository' }, { id: 'check', label: 'Check', icon: 'shield', title: 'What needs attention' }];
  var tabOf = function () { var t = S.session.railTab; return TABS.some(function (x) { return x.id === t; }) ? t : 'build'; };

  B.render = function () {
    if (!root || !S.ws) return;
    var a = S.active(), tab = tabOf(), iss = a ? issues(a) : [];
    var focusKey = document.activeElement && rail.contains(document.activeElement) ? document.activeElement.getAttribute('data-fkey') : null;
    U.$('#rail-head').innerHTML = renderHead(a);
    U.$('#rail-tabs').innerHTML = renderTabs(tab, iss);
    U.$('#rail-strip-tabs').innerHTML = renderStrip(tab, iss);
    U.$('#rail-strip-dot').style.background = a ? UI.colorOf(a) : 'transparent';
    root.setAttribute('aria-labelledby', 'rail-tab-' + tab);
    root.innerHTML = !a ? renderNoActive() : tab === 'add' ? renderAdd(a) : tab === 'sleeves' ? renderSleeves(a) : tab === 'check' ? renderCheck(a, iss) : renderBuild(a);
    wire(a, iss);
    if (focusKey) { var f = rail.querySelector('[data-fkey="' + CSS.escape(focusKey) + '"]'); if (f) f.focus({ preventScroll: true }); }
    renderFoot(a);
  };

  /** Switch tab; opens the rail if it is collapsed (desktop) or closed (phone). */
  B.showTab = function (tab, opts) {
    opts = opts || {};
    if (!S.ws) return;
    S.session.railTab = tab;
    if (opts.category !== undefined) { addCat = opts.category; searchResults = null; }
    if (window.innerWidth <= 900) { if (!S.session.railOpen) S.setSession('railOpen', true); }
    else if (S.ws.prefs.railCollapsed) B.toggleCollapsed();
    B.render();
    if (tab === 'add' && (addCat || searchQ.trim())) runSearch();
    if (tab === 'sleeves') loadSleeves();
    if (opts.focus) setTimeout(function () { var el = tab === 'add' ? U.$('#inv-search') : U.$('#rail-tab-' + tab); if (el) { el.focus(); if (el.select) el.select(); } }, window.innerWidth <= 900 ? 280 : 0);
  };

  function renderHead(a) {
    var w = S.ws, members = w.comparison.members, inC = w.allocations.filter(function (x) { return members.indexOf(x.id) >= 0; }), out = w.allocations.filter(function (x) { return members.indexOf(x.id) < 0; });
    var opt = function (x) { return '<option value="' + esc(x.id) + '"' + (a && x.id === a.id ? ' selected' : '') + '>' + esc(x.name) + (x.kind === 'snapshot' ? ' · snapshot' : x.kind === 'sleeve' ? ' · sleeve v' + x.sleeve.version : '') + '</option>'; };
    var bm = a && a.benchmarkId ? D.benchmarkById[a.benchmarkId] : null, hb = a ? E.historyBasis(a) : null;
    return '<label class="rh-eyebrow" for="active-pick">' + (a ? '<span class="dot" style="background:' + UI.colorOf(a) + '" aria-hidden="true"></span>' : '') + 'Editing</label>' +
      '<select id="active-pick" data-fkey="active-pick"' + (w.allocations.length ? '' : ' disabled') + '>' + (inC.length ? '<optgroup label="In the comparison">' + inC.map(opt).join('') + '</optgroup>' : '') + (out.length ? '<optgroup label="Not compared">' + out.map(opt).join('') + '</optgroup>' : '') + (w.allocations.length ? '' : '<option>No allocations yet</option>') + '</select>' +
      (a ? '<div class="active-meta">' + UI.kindTag(a) + '<span data-tip="' + esc(hb.detail) + '">' + esc(hb.label) + '</span>' + (bm ? '<span>· vs ' + esc(bm.name) + '</span>' : '<span class="tag tag-warn" data-tip="Differences in “each allocation’s benchmark” mode are unavailable until one is assigned.">No benchmark</span>') + '</div>' : '');
  }
  function badge(n) { return n ? '<span class="rail-badge" aria-hidden="true">' + n + '</span>' : ''; }
  function renderTabs(tab, iss) {
    return TABS.map(function (t) {
      var on = t.id === tab, n = t.id === 'check' ? iss.length : 0;
      return '<button type="button" class="rail-tab" role="tab" id="rail-tab-' + t.id + '" data-tab="' + t.id + '" data-fkey="tab:' + t.id + '" aria-selected="' + on + '" aria-controls="builder" tabindex="' + (on ? 0 : -1) + '" title="' + esc(t.title) + '"' + (n ? ' aria-label="' + t.label + ', ' + n + ' item' + (n === 1 ? '' : 's') + ' to check"' : '') + '>' + I[t.icon] + '<span>' + t.label + '</span>' + badge(n) + '</button>';
    }).join('');
  }
  function renderStrip(tab, iss) {
    return TABS.map(function (t) { var n = t.id === 'check' ? iss.length : 0; return '<button type="button" class="btn btn-icon btn-ghost" data-strip="' + t.id + '" aria-label="Open the builder on ' + t.label + (n ? ', ' + n + ' to check' : '') + '" title="' + esc(t.title) + '">' + I[t.icon] + badge(n) + '</button>'; }).join('');
  }

  /* ── Build ───────────────────────────────────────────────────────── */
  function renderBuild(a) { return (a.kind === 'snapshot' ? renderReadonly(a) : a.kind === 'sleeve' ? renderSleeve(a) : '') + renderTree(a); }
  function renderNoActive() { return '<div class="rail-sec"><div class="empty" style="padding:28px 8px;color:var(--rail-ink-2)">' + I.layers + '<h3 style="color:var(--rail-ink)">Nothing to edit yet</h3><p>Create an allocation from scratch, a template, a clone or an import.</p><div class="actions"><button type="button" class="btn btn-primary btn-sm" id="rail-new">' + I.plus + '<span>New allocation</span></button></div></div></div>'; }
  function renderReadonly(a) { var src = a.sourceId ? S.allocation(a.sourceId) : null; return '<div class="rail-readonly">' + I.lock + '<div><b>Fixed snapshot · editing disabled.</b> Captured ' + esc(F.dateTime(a.capturedAt)) + (src ? ' from ' + esc(src.name) : '') + '. Weights are frozen; analytics refresh with the platform model.<div style="margin-top:8px"><button type="button" class="btn btn-sm" id="rail-draft">' + I.copy + '<span>Create draft from snapshot</span></button></div></div></div>'; }
  function renderSleeve(a) {
    var r = a.sleeve, newer = UI.sleeves.newerVersion(a), cat = D.categoryById[r.categoryId];
    return '<div class="rail-readonly is-sleeve">' + I.layers + '<div><b>Sleeve · v' + r.version + ' from the repository.</b> Filed under ' + esc(cat ? cat.name : '—') + (r.mixed ? ' · mixed' : '') + '. Shown fully invested at the sleeve’s weights so the cards show its own analytics. Read-only here: edit it in the repository, or make an editable copy.' +
      (newer ? '<div class="sleeve-newer"><b>v' + newer.v + ' is available</b> · ' + esc(newer.note) + '</div>' : '') +
      '<div class="row" style="margin-top:8px;gap:6px;flex-wrap:wrap">' + (newer ? '<button type="button" class="btn btn-sm btn-primary" id="rail-sleeve-update">' + I.reset + '<span>Show v' + newer.v + '</span></button>' : '') + '<button type="button" class="btn btn-sm" id="rail-sleeve-open">' + I.folder + '<span>Open in repository</span></button><button type="button" class="btn btn-sm" id="rail-draft">' + I.copy + '<span>Make an editable copy</span></button></div></div></div>';
  }
  /* ── Add ─────────────────────────────────────────────────────────── */
  function renderAdd(a) {
    if (a.kind !== 'live') return '<div class="rail-readonly">' + I.lock + '<div><b>' + esc(a.name) + ' is read-only.</b> Snapshots and compared sleeves cannot take new products. Switch to a live allocation in the header to add investments.</div></div>';
    var tree = E.tree(a);
    var chip = function (id, label, color) { return '<button type="button" class="rail-chip" data-cat="' + id + '" data-fkey="chip:' + (id || 'all') + '" aria-pressed="' + (addCat === id) + '">' + (color ? '<span class="sw" style="background:' + color + '" aria-hidden="true"></span>' : '') + esc(label) + '</button>'; };
    var cat = addCat ? tree.filter(function (t) { return t.id === addCat; })[0] : null;
    return '<div class="rail-sec"><label class="rail-eyebrow" for="inv-search">Add an investment</label>' +
      '<div class="search-wrap">' + I.search + '<input type="search" id="inv-search" data-fkey="inv-search" placeholder="Search by name, identifier or type…" autocomplete="off" value="' + esc(searchQ) + '" aria-controls="inv-results" aria-describedby="inv-hint"><kbd>/</kbd></div>' +
      '<div class="rail-chips" role="group" aria-label="Filter by category">' + chip('', 'All') + D.categories.map(function (c) { return chip(c.id, c.short, c.color); }).join('') + '</div>' +
      (cat ? '<div class="field-hint">' + esc(cat.name) + ': target ' + F.num(cat.target) + '% · ' + F.num(cat.implemented) + '% in products' + (cat.remainder > 1e-9 ? ' · <b style="color:var(--rail-warn)">' + F.num(cat.remainder) + '% at index level</b>, which a new product fills first' : '') + '.</div>' : '') +
      '<div class="search-results is-tab" id="inv-results" role="listbox" aria-label="Search results">' + renderResults(a) + '</div><span id="inv-hint" class="sr-only">Results update as you type. Choose a result to set a weight and add it.</span>' +
      (!searchQ.trim() && !addCat ? '<div class="field-hint">Search funds, indices, securities, sleeves and portfolios, or pick a category to browse its products. Choosing a result asks for a weight before anything changes.</div>' : '') + '</div>';
  }
  function renderResults(a) {
    a = a || S.active();
    if (!searchQ.trim() && !addCat) return '';
    if (searchResults === null) return '<div class="sr-empty">Searching…</div>';
    if (!searchResults.length) return '<div class="sr-empty">' + (searchQ.trim() ? 'No investment matches “' + esc(searchQ) + '”' + (addCat ? ' in ' + esc(D.categoryById[addCat].name) : '') + '. Try an identifier, a manager or another category.' : 'Nothing to browse in this category.') + '</div>';
    return searchResults.map(function (r, i) {
      var held = r.kind === 'instrument' && a ? a.holdings.filter(function (h) { return h.instrumentId === r.id; })[0] : null;
      var tag = held ? '<span class="tag" data-tip="Already in ' + esc(a.name) + '; choosing it changes its weight">Held ' + F.num(held.weight) + '%</span>' : r.kind === 'instrument' && r.coverage !== 'full' ? '<span class="tag tag-warn" data-tip="' + esc(r.instrument.proxyNote || 'Limited history') + '">' + (r.coverage === 'none' ? 'No history' : 'Proxy') + '</span>' : '<span class="tag">' + esc(r.type) + '</span>';
      return '<button type="button" class="sr-item" role="option" data-result="' + i + '"><span><b>' + esc(r.name) + '</b><small>' + esc(r.meta) + '</small></span>' + tag + '</button>';
    }).join('');
  }

  /* ── Sleeves ─────────────────────────────────────────────────────── */
  function loadSleeves() { return UI.sleeves.refresh().then(function (list) { sleeveList = list; if (S.ws && tabOf() === 'sleeves') B.render(); }); }
  function renderSleeves(a) {
    var live = a.kind === 'live', members = S.ws.comparison.members;
    var head = '<div class="rail-sec"><div class="field-hint" style="color:var(--rail-ink-2)">Sleeves are saved subsets of a portfolio, shared across workspaces. <b>Apply</b> copies one into ' + esc(a.name) + ' at its category’s target; <b>Compare</b> adds it as its own read-only column.</div>' +
      '<div class="row" style="gap:6px;flex-wrap:wrap"><button type="button" class="btn btn-sm" id="sl-from-sel"' + (live ? '' : ' disabled') + '>' + I.check + '<span>Create from a selection</span></button><button type="button" class="btn btn-sm btn-ghost" id="sl-open-repo">' + I.folder + '<span>Open repository</span></button></div></div>';
    if (!sleeveList) return head + '<div class="sr-empty" style="padding:4px 0">Loading the repository…</div>';
    var list = sleeveList.filter(function (s) { return !s.archived; });
    if (!list.length) return head + '<div class="sr-empty" style="padding:4px 0">The repository is empty. Create a sleeve from a category’s menu (⋮) in Build, or from a selection.</div>';
    var counts = {}; list.forEach(function (s) { counts[s.categoryId] = (counts[s.categoryId] || 0) + 1; });
    if (sleeveCat && !counts[sleeveCat]) sleeveCat = '';
    var chip = function (id, label, color) { return '<button type="button" class="rail-chip" data-slcat="' + id + '" data-fkey="slchip:' + (id || 'all') + '" aria-pressed="' + (sleeveCat === id) + '">' + (color ? '<span class="sw" style="background:' + color + '" aria-hidden="true"></span>' : '') + esc(label) + '</button>'; };
    var chips = '<div class="rail-chips" role="group" aria-label="Filter sleeves by category">' + chip('', 'All · ' + list.length) + D.categories.filter(function (c) { return counts[c.id]; }).map(function (c) { return chip(c.id, c.short + ' · ' + counts[c.id], c.color); }).join('') + '</div>';
    var compared = {}; S.ws.allocations.forEach(function (x) { if (x.kind === 'sleeve' && members.indexOf(x.id) >= 0) compared[x.sleeve.id] = x.sleeve.version; });
    var applied = {}; a.holdings.forEach(function (h) { if (h.sleeveRef) applied[h.sleeveRef.sleeveId] = h.sleeveRef.version; });
    var groups = D.categories.filter(function (c) { return counts[c.id] && (!sleeveCat || sleeveCat === c.id); }).map(function (c) {
      return '<div class="rail-sleeve-group">' + esc(c.name) + '</div>' + list.filter(function (s) { return s.categoryId === c.id; }).map(function (s) {
        var v = UI.sleeves.latest(s), idx = sleeveList.indexOf(s), top = v.holdings.slice().sort(function (x, y) { return y.weight - x.weight; });
        var names = top.slice(0, 3).map(function (h) { return D.instrumentById[h.instrumentId].identifier + ' ' + F.num(h.weight, 0) + '%'; }).join(' · ') + (top.length > 3 ? ' · +' + (top.length - 3) : '');
        return '<div class="rail-sleeve' + (applied[s.id] ? ' is-here' : '') + '" data-sleeve="' + esc(s.id) + '"><div class="top"><span class="sw" style="background:' + c.color + '" aria-hidden="true"></span><b>' + esc(s.name) + '</b>' + (s.mixed ? '<span class="tag tag-warn" data-tip="Spans more than one category">Mixed</span>' : '') + '<span class="tag">v' + v.v + '</span></div>' +
          '<small>' + v.holdings.length + ' product' + (v.holdings.length === 1 ? '' : 's') + ' · ' + esc(names) + '</small>' +
          (applied[s.id] || compared[s.id] ? '<small>' + (applied[s.id] ? '<span class="sleeve-tag">' + I.layers + 'Applied here v' + applied[s.id] + '</span> ' : '') + (compared[s.id] ? '<span class="sleeve-tag">' + I.table + 'Compared v' + compared[s.id] + '</span>' : '') + '</small>' : '') +
          '<div class="acts"><button type="button" class="btn btn-xs" data-slapply="' + idx + '"' + (live ? '' : ' disabled') + ' data-tip="' + (live ? 'Preview, then copy its products into ' + esc(c.name) + ' at the category target' : 'Read-only allocation') + '">' + I.folder + '<span>Apply</span></button><button type="button" class="btn btn-xs" data-slcompare="' + idx + '" data-tip="Add v' + v.v + ' as its own column so every card shows its analytics">' + I.plus + '<span>Compare</span></button><button type="button" class="btn btn-xs btn-ghost" data-slopen="' + idx + '" aria-label="Open ' + esc(s.name) + ' in the repository">' + I.external + '</button></div></div>';
      }).join('');
    }).join('');
    return head + chips + '<div class="rail-sec" id="sleeve-list">' + groups + '</div>';
  }

  /* ── Check ───────────────────────────────────────────────────────── */
  /** What needs attention in an allocation; each item names the way to fix it. */
  function issues(a) {
    var out = [], tree = E.tree(a), res = 100 - E.allocated(a), live = a.kind === 'live';
    if (res > 1e-9) out.push({ t: F.num(res) + '% unallocated', s: 'It earns nothing and carries no risk. Raise a category target or add a product.', acts: [['show', '__total', 'Show in Build']] });
    tree.forEach(function (t) {
      if (t.remainder > 1e-9) out.push({ t: t.short + ': ' + F.num(t.remainder) + '% at index level', s: t.products.length ? 'Part of the ' + F.num(t.target) + '% target is not in products yet; the category index stands in.' : 'No products: the whole ' + F.num(t.target) + '% target is modelled by the category index.', acts: live ? [['find', t.id, 'Find products'], ['apply', t.id, 'Apply a sleeve']] : [['show', t.id, 'Show in Build']] });
      if (t.over) out.push({ t: t.short + ': products over target by ' + F.num(-t.remainder) + '%', s: 'Products add up to ' + F.num(t.implemented) + '% against a ' + F.num(t.target) + '% target. Raise the target or lower a product.', acts: [['show', t.id, 'Show in Build']].concat(live ? [['fit', t.id, 'Set target to ' + F.num(t.implemented) + '%']] : []) });
    });
    var px = a.holdings.filter(function (h) { return D.instrumentById[h.instrumentId].coverage !== 'full'; });
    if (px.length) out.push({ t: px.length + ' product' + (px.length === 1 ? '' : 's') + ' with limited history', s: px.map(function (h) { var ins = D.instrumentById[h.instrumentId]; return ins.identifier + ' (' + (ins.coverage === 'none' ? 'no history' : 'proxy') + ')'; }).join(', ') + '. Historical cards disclose it.', acts: [['show', E.categoryOf(px[0].instrumentId) + '/' + px[0].instrumentId, 'Show in Build']] });
    if (!a.benchmarkId && a.kind !== 'sleeve') out.push({ t: 'No benchmark assigned', s: 'Differences against “each allocation’s benchmark” are unavailable until one is set.', acts: live ? [['bench', '', 'Assign benchmark']] : [] });
    return out;
  }
  function renderCheck(a, iss) {
    var items = iss.length ? iss.map(function (x, i) { return '<div class="rail-check warn">' + I.warn + '<div class="txt"><b>' + esc(x.t) + '</b><small>' + esc(x.s) + '</small>' + (x.acts.length ? '<div class="row" style="gap:6px;flex-wrap:wrap;margin-top:5px">' + x.acts.map(function (c, j) { return '<button type="button" class="btn btn-xs" data-issue="' + i + ':' + j + '" data-fkey="issue:' + esc(c[0] + ':' + c[1]) + '">' + esc(c[2]) + '</button>'; }).join('') + '</div>' : '') + '</div></div>'; }).join('')
      : '<div class="rail-check ok">' + I.ok + '<div class="txt"><b>Nothing needs attention</b><small>Fully allocated, every category implemented in products, complete histories and a benchmark.</small></div></div>';
    return '<div class="rail-sec"><div class="rail-sec-head"><span class="rail-eyebrow">To check · ' + iss.length + '</span></div>' + items + '</div>' + renderSummary(a) + (a.kind === 'sleeve' ? '' : renderLeverage(a)) + '<div class="field-err" id="check-err" role="alert" style="color:var(--rail-bad)"></div>';
  }

  function renderTree(a) {
    var tree = E.tree(a), col = collapsed[a.id] || {}, ro = a.kind !== 'live', pend = pendingOf(a), sel = S.ws.prefs.selectedRow, selMode = S.session.selectMode, selection = S.session.selection;
    var row = function (o) {
      var isCol = !!col[o.key];
      return '<div class="tree-row depth-' + o.depth + (sel === o.key ? ' is-selected' : '') + (o.index ? ' is-index' : '') + (o.over ? ' is-over' : '') + '" data-key="' + esc(o.key) + '">' +
        '<div class="tree-main">' + (o.hasChildren ? '<button type="button" class="tw" data-toggle="' + esc(o.key) + '" aria-expanded="' + (!isCol) + '" aria-label="' + (isCol ? 'Expand ' : 'Collapse ') + esc(o.plain) + '">' + I.chevron + '</button>' : '<span class="tw is-leaf" aria-hidden="true">' + I.chevron + '</span>') +
        (selMode && o.selectable ? '<input type="checkbox" class="tsel" data-sel="' + esc(o.selId) + '" aria-label="Select ' + esc(o.plain) + '"' + (o.selected ? ' checked' : '') + (o.indeterminate ? ' data-ind="1"' : '') + '>' : '') +
        '<button type="button" class="tname" data-select="' + esc(o.key) + '" data-fkey="n:' + esc(o.key) + '" aria-label="' + esc(o.plain) + ', select row"><b>' + o.labelHtml + '</b><small>' + o.subHtml + '</small></button></div>' +
        '<div class="tright">' + (o.readonly ? '<span class="tval" data-tip="' + esc(o.tip || '') + '">' + F.num(o.weight) + '</span><span class="tpct">%</span>' : (function () { var saved = F.num(o.weight, o.weight % 1 ? 2 : 1).replace('−', '-'), pv = !ro && pend[o.key] !== undefined ? pend[o.key] : null; return '<input class="tw-input' + (o.depth === 0 ? ' is-sleeve' : '') + (pv !== null ? ' is-pending' : '') + '" type="text" inputmode="decimal" autocomplete="off" spellcheck="false" value="' + esc(pv !== null ? pv : saved) + '" data-saved="' + esc(saved) + '" data-key="' + esc(o.key) + '" data-fkey="w:' + esc(o.key) + '" aria-label="' + esc(o.plain) + ' weight, percent of total portfolio. Type a value and press Enter to apply."' + (ro ? ' disabled' : '') + '>'; })() + '<span class="tpct">%</span>') +
        (o.menu ? '<button type="button" class="tmenu" aria-label="Options for ' + esc(o.plain) + '" aria-haspopup="menu" aria-expanded="false" data-rowmenu="' + esc(o.key) + '" data-kind="' + o.menu + '">' + I.more + '</button>' : '<span class="tmenu" aria-hidden="true"></span>') + '</div></div>';
    };
    var nCat = tree.filter(function (t) { return t.target > 0 || t.products.length; }).length;
    var html = '<li class="depth-0">' + '<div class="tree-row depth-0 is-root" data-key="__total"><div class="tree-main"><span class="tw is-leaf" aria-hidden="true"></span><button type="button" class="tname" data-select="__total" data-fkey="n:__total"><b>' + esc(a.name) + '</b><small>' + a.holdings.length + ' product' + (a.holdings.length === 1 ? '' : 's') + ' · ' + nCat + ' categor' + (nCat === 1 ? 'y' : 'ies') + '</small></button></div><div class="tright"><span class="tval" data-tip="Σ of category targets (products plus index remainders)">' + F.num(E.allocated(a)) + '</span><span class="tpct">%</span><button type="button" class="tmenu" aria-label="Options for ' + esc(a.name) + '" aria-haspopup="menu" aria-expanded="false" data-rowmenu="__total" data-kind="root">' + I.more + '</button></div></div></li>';
    html += tree.filter(function (t) { return a.kind !== 'sleeve' || t.target > 0 || t.products.length; }).map(function (t) {
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
      (selMode ? '<div class="selbar" role="status"><span><b>' + selection.length + '</b> selected · <b>' + F.num(selW) + '%</b></span><span class="spacer"></span><button type="button" class="btn btn-xs" id="sel-create"' + (selection.length ? '' : ' disabled') + ' data-tip="Save the selection to the repository, rescaled to 100%">' + I.layers + '<span>Save as sleeve</span></button><button type="button" class="btn btn-xs btn-primary" id="sel-compare"' + (selection.length ? '' : ' disabled') + ' data-tip="Save it, then add it to the comparison as its own column to see its analytics">' + I.plus + '<span>Save &amp; compare</span></button><button type="button" class="btn btn-xs btn-ghost" id="sel-clear">Clear</button><button type="button" class="btn btn-xs" id="sel-done">Done</button></div>' : '') +
      '<ul class="tree" id="tree" role="tree" aria-label="Categories and products of ' + esc(a.name) + '">' + html + '</ul>' +
      '<div class="tree-pending" id="tree-pending" role="status">' + pendingHtml(a) + '</div><div class="field-hint" style="margin-top:4px">Weights are % of the total portfolio: type a value and press <kbd>Enter</kbd> to apply it and recalculate; <kbd>Esc</kbd> discards it. A category’s target is modelled by its index until products implement it.</div><div class="field-err" id="tree-err" role="alert" style="color:var(--rail-bad)"></div></div>';
  }
  function renderSummary(a) {
    var net = E.allocated(a), gross = E.gross(a), res = 100 - net, tree = E.tree(a);
    var bar = tree.map(function (t) { return t.target > 0 ? '<i style="width:' + U.clamp(t.target, 0, 100) + '%;background:' + t.color + '" title="' + esc(t.name) + ' ' + F.num(t.target) + '%"></i>' : ''; }).join('');
    var idx = U.sum(tree, function (t) { return Math.max(0, t.remainder); });
    return '<div class="rail-sec"><span class="rail-eyebrow">Weights</span><div class="weights-summary" aria-label="Weight summary"><div class="row"><span>Allocated</span><b>' + F.pct(net) + '</b></div><div class="bar" aria-hidden="true">' + bar + '</div>' +
      '<div class="row"><span>' + (res >= -1e-9 ? 'Unallocated' : 'Borrowing') + '</span><b class="' + (res < -1e-9 ? 'warn' : '') + '">' + F.pct(Math.abs(res)) + '</b></div>' +
      '<div class="row" style="color:var(--rail-ink-2)"><span>In products ' + F.pct(U.sum(a.holdings, function (h) { return h.weight; })) + '</span><span>At index level ' + F.pct(idx) + '</span></div>' +
      '<div class="row" style="color:var(--rail-ink-2)"><span>Gross ' + F.pct(gross) + '</span><span>Net ' + F.pct(E.net(a)) + '</span></div>' +
      (res > 1e-9 ? '<div class="small" style="color:var(--rail-ink-3)">Unallocated weight earns nothing and carries no risk. It is not priced as cash.</div>' : '') + (res < -1e-9 ? '<div class="small" style="color:var(--rail-ink-3)">Borrowing shown as information only: no financing cost is modelled.</div>' : '') + '</div></div>';
  }
  function renderLeverage(a) { return '<div class="rail-sec"><label class="switch"><input type="checkbox" id="lev-switch"' + (a.leverage ? ' checked' : '') + (a.kind !== 'live' ? ' disabled' : '') + '><span class="track"></span><span>Enable shorts &amp; leverage</span></label><div class="field-hint">' + (a.leverage ? 'Negative weights and net allocation above 100% are accepted. Gross, net and borrowing are informational; no risk limit applies.' : 'Off: weights must be between 0% and 100% and the total at most 100%.') + '</div></div>'; }
  /** Always in view: the category bar (solid in products, hatched at index level) and the allocated total. */
  function renderFoot(a) {
    if (!foot) return;
    if (!a) { foot.innerHTML = ''; return; }
    var tree = E.tree(a), net = E.allocated(a), res = 100 - net, scale = Math.max(100, net);
    var bar = tree.map(function (t) { var p = Math.max(0, Math.min(t.implemented, t.target)), r = Math.max(0, t.remainder); return (p > 0 ? '<i style="width:' + (p / scale * 100) + '%;background:' + t.color + '" title="' + esc(t.name) + ' · ' + F.num(p) + '% in products"></i>' : '') + (r > 1e-9 ? '<i class="ix" style="width:' + (r / scale * 100) + '%;background-color:' + t.color + '" title="' + esc(t.name) + ' · ' + F.num(r) + '% at index level"></i>' : ''); }).join('');
    foot.innerHTML = '<div class="bar" role="img" aria-label="' + esc(tree.filter(function (t) { return t.target > 0; }).map(function (t) { return t.short + ' ' + F.num(t.target) + '%'; }).join(', ')) + '">' + bar + '</div>' +
      '<div class="row"><span>Allocated <b>' + F.pct(net) + '</b></span><span class="spacer"></span>' + (Math.abs(res) < 1e-9 ? '<span>Fully allocated</span>' : res > 0 ? '<span class="warn">' + F.pct(res) + ' unallocated</span>' : '<span class="warn">Borrowing ' + F.pct(-res) + '</span>') + '</div>';
  }

  /* ── events ──────────────────────────────────────────────────────── */
  function wire(a, iss) {
    var tabs = U.$('#rail-tabs');
    tabs.onclick = function (e) { var b = e.target.closest('[data-tab]'); if (b) B.showTab(b.dataset.tab); };
    tabs.onkeydown = function (e) { var ids = TABS.map(function (t) { return t.id; }), i = ids.indexOf(tabOf()), n = e.key === 'ArrowRight' ? i + 1 : e.key === 'ArrowLeft' ? i - 1 : e.key === 'Home' ? 0 : e.key === 'End' ? ids.length - 1 : null; if (n === null) return; e.preventDefault(); B.showTab(ids[(n + ids.length) % ids.length], { focus: true }); };
    U.$('#rail-strip-tabs').onclick = function (e) { var b = e.target.closest('[data-strip]'); if (b) B.showTab(b.dataset.strip, { focus: b.dataset.strip === 'add' }); };
    if (!a) { root.onclick = null; var nb0 = U.$('#rail-new'); if (nb0) nb0.onclick = function () { UI.dialogs.newAllocation(); }; return; }
    root.onclick = function (e) {
      var b = e.target.closest('[data-cat],[data-slcat],[data-slapply],[data-slcompare],[data-slopen],[data-issue]'); if (!b || !root.contains(b)) return;
      var d = b.dataset, s = sleeveList && sleeveList[Number(d.slapply || d.slcompare || d.slopen)];
      if (d.cat !== undefined) { addCat = d.cat; searchResults = null; B.render(); runSearch(); }
      else if (d.slcat !== undefined) { sleeveCat = d.slcat; B.render(); }
      else if (d.slapply) UI.sleeves.apply(a, s.categoryId, s);
      else if (d.slcompare) UI.sleeves.addToWorkspace(s, UI.sleeves.latest(s));
      else if (d.slopen) UI.shell.go('#/sleeves/' + encodeURIComponent(s.id));
      else if (d.issue) { var p = d.issue.split(':'), c = iss[Number(p[0])].acts[Number(p[1])]; issueAction(a, c[0], c[1]); }
    };
    var fs = U.$('#sl-from-sel'); if (fs) fs.onclick = function () { S.session.railTab = 'build'; S.setSelectMode(true); UI.toast('Tick products in the tree, then Save as sleeve or Save & compare.'); };
    var or = U.$('#sl-open-repo'); if (or) or.onclick = function () { UI.shell.go('#/sleeves'); };
    var pick = U.$('#active-pick'); if (pick) pick.onchange = function () { var id = pick.value; S.update('Editing switched to ' + S.allocation(id).name, function (ws) { ws.comparison.activeId = id; }, { refresh: false, activity: false, force: true }); };
    var nb = U.$('#rail-new'); if (nb) nb.onclick = function () { UI.dialogs.newAllocation(); };
    var dr = U.$('#rail-draft'); if (dr) dr.onclick = function () { UI.dialogs.draftFromSnapshot(a); };
    var so = U.$('#rail-sleeve-open'); if (so) so.onclick = function () { UI.shell.go('#/sleeves/' + encodeURIComponent(a.sleeve.id)); };
    var su = U.$('#rail-sleeve-update'); if (su) su.onclick = function () { var s = UI.sleeves.known[a.sleeve.id]; if (s) UI.sleeves.setMemberVersion(a, s, UI.sleeves.latest(s)); };
    var si = U.$('#inv-search');
    if (si) {
      si.oninput = function () { searchQ = si.value; searchResults = null; U.$('#inv-results').innerHTML = renderResults(); clearTimeout(searchTimer); searchTimer = setTimeout(runSearch, 160); };
      si.onkeydown = function (e) { if (e.key === 'ArrowDown') { var first = U.$('#inv-results .sr-item'); if (first) { e.preventDefault(); first.focus(); } } if (e.key === 'Escape') { searchQ = ''; si.value = ''; searchResults = null; U.$('#inv-results').innerHTML = ''; } };
      var res = U.$('#inv-results');
      U.on(res, 'click', '[data-result]', function (e, b) { UI.dialogs.addInvestment(searchResults[Number(b.dataset.result)], a); });
      res.onkeydown = function (e) { var items = U.$$('.sr-item', res), i = items.indexOf(document.activeElement); if (e.key === 'ArrowDown' && i < items.length - 1) { e.preventDefault(); items[i + 1].focus(); } if (e.key === 'ArrowUp') { e.preventDefault(); if (i > 0) items[i - 1].focus(); else si.focus(); } if (e.key === 'Escape') si.focus(); };
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
      U.on(tree, 'input', 'input[data-key]', function (e, inp) { var p = pendingOf(a); if (inp.value.trim() === inp.dataset.saved) delete p[inp.dataset.key]; else p[inp.dataset.key] = inp.value; inp.classList.toggle('is-pending', p[inp.dataset.key] !== undefined); inp.removeAttribute('aria-invalid'); U.$('#tree-err').textContent = ''; U.$('#tree-pending').innerHTML = pendingHtml(a); });
      U.on(tree, 'keydown', 'input[data-key]', function (e, inp) {
        if (e.key === 'Enter') { e.preventDefault(); commitWeight(inp, a); }
        else if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); discardPending(a, inp.dataset.key); inp.value = inp.dataset.saved; inp.classList.remove('is-pending'); inp.removeAttribute('aria-invalid'); U.$('#tree-err').textContent = ''; U.$('#tree-pending').innerHTML = pendingHtml(a); }
        else if (e.key === 'ArrowUp' || e.key === 'ArrowDown') { e.preventDefault(); var ins = U.$$('input[data-key]:not([disabled])', tree), i = ins.indexOf(inp), n = ins[i + (e.key === 'ArrowDown' ? 1 : -1)]; if (n) { n.focus(); n.select(); } }
      });
      U.on(tree, 'focusin', 'input[data-key]', function (e, inp) { setTimeout(function () { if (document.activeElement === inp) inp.select(); }, 0); });
      U.on(tree, 'click', '[data-rowmenu]', function (e, b) { rowMenu(b, a); });
      var tpe = U.$('#tree-pending'); if (tpe) tpe.onclick = function (e) { if (e.target.closest('#pending-discard')) { discardPending(a); B.render(); } };
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
      var scc = U.$('#sel-compare'); if (scc) scc.onclick = function () { UI.sleeves.create({ alloc: a, holdingIds: S.session.selection.slice(), compare: true }); };
      var scl = U.$('#sel-clear'); if (scl) scl.onclick = function () { S.clearSelection(); };
      var sd = U.$('#sel-done'); if (sd) sd.onclick = function () { S.setSelectMode(false); };
    }
    var lev = U.$('#lev-switch');
    if (lev) lev.onchange = function () {
      if (!lev.checked && (a.holdings.some(function (h) { return h.weight < 0; }) || E.allocated(a) > 100.0001)) { lev.checked = true; U.$('#tree-err').textContent = 'Bring the allocation back to long-only and at or below 100% before disabling leverage.'; return; }
      var on = lev.checked; S.update(a.name + ': shorts & leverage ' + (on ? 'enabled' : 'disabled'), function (ws) { ws.allocations.filter(function (y) { return y.id === a.id; })[0].leverage = on; }, { refresh: false, type: 'edit' });
    };
  }
  /** Go to a row in the Build tab: expand its category, select it, bring it into view. */
  function showRow(a, key) {
    S.session.railTab = 'build';
    var cat = key.split('/')[0], c = collapsed[a.id]; if (c) delete c[cat];
    B.render(); S.setPref('selectedRow', key); ensureTableExpanded(key);
    var n = root.querySelector('.tree-row[data-key="' + CSS.escape(key) + '"] .tname'); if (n) { n.scrollIntoView({ block: 'center' }); n.focus({ preventScroll: true }); }
  }
  function issueAction(a, kind, key) {
    if (kind === 'show') showRow(a, key);
    else if (kind === 'find') B.showTab('add', { category: key, focus: true });
    else if (kind === 'apply') UI.sleeves.apply(a, key);
    else if (kind === 'bench') UI.dialogs.assignBenchmark(a);
    else if (kind === 'fit') { var t = E.tree(a).filter(function (x) { return x.id === key; })[0]; setCategory(a, key, t.implemented); }
  }
  /** Set a category target from outside the tree (menu items, Check). */
  function setCategory(a, key, v) {
    var cats = U.clone(E.categoryTargets(a)), before = cats[key]; cats[key] = U.round(v, 4);
    var allocated = E.allocated({ holdings: a.holdings, categories: cats });
    if (!a.leverage && allocated > 100.0001) { UI.toast('That takes ' + a.name + ' to ' + F.num(allocated) + '%. Lower another weight or enable shorts & leverage.', { kind: 'error' }); return; }
    S.update(a.name + ' · ' + D.categoryById[key].name + ' ' + F.num(before) + '% → ' + F.num(v) + '%', function (ws) { var x = ws.allocations.filter(function (y) { return y.id === a.id; })[0]; x.categories = cats; if (x.history && x.history.basis === 'actual') x.edited = true; }, { type: 'edit' });
  }
  function holdingForKey(a, key) { var p = key.split('/'); if (p.length !== 2 || p[1] === '__index') return null; return a.holdings.filter(function (h) { return h.instrumentId === p[1]; })[0] || null; }
  function runSearch() {
    var q = searchQ, cat = addCat;
    if (!q.trim() && !cat) { searchResults = null; var r0 = U.$('#inv-results'); if (r0) r0.innerHTML = ''; return; }
    PA.api.searchInvestments(q, { limit: cat ? 40 : 12, category: cat || undefined }).then(function (list) { if (q !== searchQ || cat !== addCat) return; searchResults = list; var r = U.$('#inv-results'); if (r) r.innerHTML = renderResults(); U.announce(list.length + ' result' + (list.length === 1 ? '' : 's') + (q.trim() ? ' for ' + q : '') + (cat ? ' in ' + D.categoryById[cat].name : '')); });
  }
  function ensureTableExpanded(key) { var parts = key.split('/'), ex = S.ws.prefs.expanded.slice(); if (parts.length > 1 && ex.indexOf(parts[0]) < 0) { ex.push(parts[0]); S.setPref('expanded', ex); } }

  function pendingHtml(a) {
    var p = pendingOf(a), keys = Object.keys(p); if (!keys.length) return '';
    var name = function (k) { var q = k.split('/'); return q.length > 1 ? D.instrumentById[q[1]].name : D.categoryById[k].short; };
    return I.info + '<span><b>' + keys.length + ' typed value' + (keys.length === 1 ? '' : 's') + ' not applied</b> · ' + esc(keys.map(name).join(', ')) + '. Press Enter in the field to apply, Esc to discard.</span><button type="button" class="btn btn-xs btn-ghost" id="pending-discard">Discard</button>';
  }
  function discardPending(a, key) { var p = pendingOf(a); if (key) delete p[key]; else pending[a.id] = {}; }
  /** Apply a typed weight (Enter): a category target, or a product's weight. */
  function commitWeight(inp, a) {
    var err = U.$('#tree-err'), key = inp.dataset.key, raw = inp.value.trim().replace(',', '.').replace(/%$/, '').replace('−', '-'), v = Number(raw);
    err.textContent = '';
    if (raw === '' || !isFinite(v)) { inp.setAttribute('aria-invalid', 'true'); err.textContent = 'Enter a number for the weight, e.g. 12.5.'; return; }
    if (inp.dataset.saved !== undefined && Number(inp.dataset.saved) === U.round(v, 2)) { discardPending(a, key); inp.value = inp.dataset.saved; inp.classList.remove('is-pending'); var tp = U.$('#tree-pending'); if (tp) tp.innerHTML = pendingHtml(a); return; }
    v = U.round(v, 2);
    var parts = key.split('/'), next = { holdings: U.clone(a.holdings), categories: U.clone(E.categoryTargets(a)), leverage: a.leverage }, label, before;
    if (parts.length === 1) { before = next.categories[key]; next.categories[key] = v; label = D.categoryById[key].name; }
    else { var h = next.holdings.filter(function (x) { return x.instrumentId === parts[1]; })[0]; if (!h) return; before = h.weight; h.weight = v; label = D.instrumentById[parts[1]].name; }
    var allocated = E.allocated(next);
    if (!a.leverage && (v < 0 || allocated > 100.0001)) { inp.setAttribute('aria-invalid', 'true'); err.textContent = v < 0 ? 'Negative weights need shorts & leverage enabled.' : 'That takes the allocation to ' + F.num(allocated) + '%. Lower another weight or enable shorts & leverage.'; return; }
    inp.removeAttribute('aria-invalid'); discardPending(a, key);
    S.update(a.name + ' · ' + label + ' ' + F.num(before) + '% → ' + F.num(v) + '%', function (ws) { var x = ws.allocations.filter(function (y) { return y.id === a.id; })[0]; x.holdings = next.holdings; x.categories = next.categories; if (x.history && x.history.basis === 'actual') x.edited = true; }, { type: 'edit' });
    U.announce(label + ' set to ' + F.num(v) + ' percent. Analytics updating.');
  }
  function rowMenu(btn, a) {
    var key = btn.dataset.rowmenu, kind = btn.dataset.kind, items = [], ro = a.kind !== 'live';
    if (kind === 'root') items = [{ head: a.name }, { label: 'Rename', onClick: function () { UI.dialogs.renameAllocation(a); } }, { label: 'Assign benchmark…', onClick: function () { UI.dialogs.assignBenchmark(a); } }, { label: 'Snapshot this allocation', icon: I.camera, onClick: function () { UI.dialogs.snapshot(a); } }, { label: 'Show portfolio total in table', icon: I.table, onClick: function () { S.setPref('selectedRow', '__total'); } }];
    else if (kind === 'category') {
      var t = E.tree(a).filter(function (x) { return x.id === key; })[0];
      items = [{ head: t.name },
        { label: 'Create sleeve from category', icon: I.layers, disabled: !t.products.length, onClick: function () { UI.sleeves.create({ alloc: a, categoryId: key }); } },
        { label: 'Save as sleeve and compare…', icon: I.plus, disabled: !t.products.length || a.kind === 'sleeve', onClick: function () { UI.sleeves.create({ alloc: a, categoryId: key, compare: true }); } },
        { label: 'Apply a sleeve…', icon: I.folder, disabled: ro, onClick: function () { UI.sleeves.apply(a, key); } },
        { label: 'Add a product here', icon: I.plus, disabled: ro, onClick: function () { B.showTab('add', { category: key, focus: true }); } },
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
    root = U.$('#builder'); foot = U.$('#rail-foot'); rail = U.$('#rail');
    var ct = U.$('#rail-collapse'); if (ct) ct.onclick = B.toggleCollapsed;
    var ex = U.$('#rail-expand'); if (ex) ex.onclick = B.toggleCollapsed;
    var cl = U.$('#rail-close'); if (cl) cl.onclick = function () { S.setSession('railOpen', false); };
    initResize();
    S.subscribe(function (type, extra) {
      if (!S.ws) return;
      if (type === 'load') { pending = {}; searchQ = ''; searchResults = null; addCat = ''; sleeveCat = ''; sleeveList = null; B.applyWidth(); B.render(); var t = U.$('#rail-collapse'); if (t) t.setAttribute('aria-expanded', String(!S.ws.prefs.railCollapsed)); }
      if (type === 'update' || type === 'undo' || type === 'redo') { B.render(); if (tabOf() === 'sleeves') loadSleeves(); }
      if (type === 'session' && extra.key === 'selection') B.render();
      if (type === 'pref' && extra.key === 'selectedRow') U.$$('.tree-row', root).forEach(function (r) { r.classList.toggle('is-selected', r.dataset.key === S.ws.prefs.selectedRow); });
    });
  };
})();

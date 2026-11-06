/* ─────────────────────────────────────────────────────────────────────────
   Portfolio Analytics · the portfolio builder (the rail: navy header and tabs, white panel)
   The header names the allocation being edited, with its menu (select
   products, expand or collapse, rename, benchmark, snapshot); four tabs split
   the rail's jobs. Build: the tree, category → product. Each category sits
   under a silver rule, marked by its colour tile; its products are leaves,
   indented and joined to it by elbow guides. A category's weight is the sum
   of its products and indices: changing a product changes the category, and
   changing the category rescales its products pro rata. Categories belong to
   the workspace: they can be added, renamed, deleted when empty, and moved
   (drag the grip, Alt+↑/↓, or the row menu). + on a category row adds an
   empty leaf that searches the product library (quick add). Sleeves are
   created from a category or a product selection here. / opens quick add
   searching every category. Optimize: mean-variance optimisation of the
   allocation (ui/optimizer.js). Sleeves: the repository, with Apply and Compare.
   Check: what needs attention (its count is the tab's badge), the weight
   summary and the leverage switch.
   ───────────────────────────────────────────────────────────────────────── */
(function () {
  'use strict';
  var PA = window.PA, U = PA.util, esc = U.esc, S = PA.store, UI = PA.ui, E = PA.engine, D = PA.data, I = U.icon, F = U.fmt;
  var B = UI.builder = {};
  var root, foot, rail, collapsed = {}, searchTimer = null;
  var sleeveList = null, sleeveCat = '';
  /* Weights are typed, never stepped. A typed value is pending until Enter
     applies it (one edit, one recalculation); Esc discards it. Pending values
     survive re-renders and leaving the field: allocation id → row key → text. */
  var pending = {};
  var pendingOf = function (a) { return pending[a.id] || (pending[a.id] = {}); };
  var TABS = [{ id: 'build', label: 'Build', icon: 'build', title: 'Categories and products' }, { id: 'optimize', label: 'Optimize', icon: 'target', title: 'Mean-variance optimisation' }, { id: 'sleeves', label: 'Sleeves', icon: 'layers', title: 'The sleeve repository' }, { id: 'check', label: 'Check', icon: 'shield', title: 'What needs attention' }];
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
    root.innerHTML = !a ? renderNoActive() : tab === 'optimize' ? UI.optimizer.render(a) : tab === 'sleeves' ? renderSleeves(a) : tab === 'check' ? renderCheck(a, iss) : renderBuild(a);
    wire(a, iss);
    if (focusKey) { var f = rail.querySelector('[data-fkey="' + CSS.escape(focusKey) + '"]'); if (f) f.focus({ preventScroll: true }); }
    renderFoot(a);
  };

  B.currentTab = function () { return tabOf(); };
  /** Switch tab; opens the rail if it is collapsed (desktop) or closed (phone). */
  B.showTab = function (tab, opts) {
    opts = opts || {};
    if (!S.ws) return;
    if (tab === 'add') { B.findProduct(opts.category); return; }
    S.session.railTab = tab;
    openRail();
    B.render();
    if (tab === 'sleeves') loadSleeves();
    if (opts.focus) setTimeout(function () { var el = U.$('#rail-tab-' + tab); if (el) el.focus(); }, window.innerWidth <= 900 ? 280 : 0);
  };
  function openRail() { if (window.innerWidth <= 900) { if (!S.session.railOpen) S.setSession('railOpen', true); } else if (S.ws.prefs.railCollapsed) B.toggleCollapsed(); }
  /**
   * Find a product to add (/): quick add in Build, under the selected row's
   * category (or the first), searching every category unless one is given.
   */
  B.findProduct = function (categoryId) {
    var a = S.active(); if (!a) return;
    if (a.kind !== 'live') { UI.toast(a.name + ' is read-only. Switch to a live allocation to add products.'); return; }
    openRail();
    var sel = S.ws.prefs.selectedRow, cat = categoryId || (sel && D.categoryById[sel.split('/')[0]] ? sel.split('/')[0] : D.categories[0].id);
    setTimeout(function () { openQuick(a, cat, { all: !categoryId }); }, window.innerWidth <= 900 ? 280 : 0);
  };

  function renderHead(a) {
    var w = S.ws, members = w.comparison.members, inC = w.allocations.filter(function (x) { return members.indexOf(x.id) >= 0; }), out = w.allocations.filter(function (x) { return members.indexOf(x.id) < 0; });
    var opt = function (x) { return '<option value="' + esc(x.id) + '"' + (a && x.id === a.id ? ' selected' : '') + '>' + esc(x.name) + (x.kind === 'snapshot' ? ' · snapshot' : x.kind === 'sleeve' ? ' · sleeve v' + x.sleeve.version : '') + '</option>'; };
    var bm = a && a.benchmarkId ? D.benchmarkById[a.benchmarkId] : null, hb = a ? E.historyBasis(a) : null;
    return '<label class="rh-eyebrow" for="active-pick">' + (a ? '<span class="dot" style="background:' + UI.colorOf(a) + '" aria-hidden="true"></span>' : '') + 'Editing</label>' +
      '<div class="rh-name"><select id="active-pick" data-fkey="active-pick"' + (w.allocations.length ? '' : ' disabled') + '>' + (inC.length ? '<optgroup label="In the comparison">' + inC.map(opt).join('') + '</optgroup>' : '') + (out.length ? '<optgroup label="Not compared">' + out.map(opt).join('') + '</optgroup>' : '') + (w.allocations.length ? '' : '<option>No allocations yet</option>') + '</select>' +
      (a ? '<button type="button" class="rail-toggle rh-menu" id="rail-menu" data-fkey="rail-menu" aria-label="Options for ' + esc(a.name) + '" aria-haspopup="menu" aria-expanded="false" data-tip="Select products, expand or collapse, rename, benchmark, snapshot">' + I.more + '</button>' : '') + '</div>' +
      (a ? '<div class="active-meta">' + [UI.kindTag(a), hb.basis === 'actual' ? '' : '<span data-tip="' + esc(hb.label + ': ' + hb.detail) + '">' + (hb.basis === 'edited' ? 'Edited' : 'Backtest') + '</span>', bm ? '<span>vs ' + esc(bm.name) + '</span>' : (a.kind === 'sleeve' ? '' : '<span class="tag tag-warn" data-tip="Differences against “each allocation’s own benchmark” are unavailable until one is assigned.">No benchmark</span>'), a.chain ? '<button type="button" class="rh-chain" data-chain-open data-tip="' + esc(chainTip(a)) + '">Chain set</button>' : ''].filter(Boolean).join('<span class="sep" aria-hidden="true">·</span>') + '</div>' : '');
  }
  function chainTip(a) { var p = PA.chain.policyOf(a), s = PA.chain.saaOf(a, S.ws.allocations); return 'Decision chain: policy ' + (p.label || p.reason) + ' · SAA ' + (s.label || s.reason) + '. Open the decision chain.'; }
  function badge(n) { return n ? '<span class="rail-badge" aria-hidden="true">' + n + '</span>' : ''; }
  function renderTabs(tab, iss) {
    return TABS.map(function (t) {
      var on = t.id === tab, n = t.id === 'check' ? warnCount(iss) : 0;
      return '<button type="button" class="rail-tab" role="tab" id="rail-tab-' + t.id + '" data-tab="' + t.id + '" data-fkey="tab:' + t.id + '" aria-selected="' + on + '" aria-controls="builder" tabindex="' + (on ? 0 : -1) + '" title="' + esc(t.title) + '"' + (n ? ' aria-label="' + t.label + ', ' + n + ' item' + (n === 1 ? '' : 's') + ' to check"' : '') + '>' + I[t.icon] + '<span>' + t.label + '</span>' + badge(n) + '</button>';
    }).join('');
  }
  function renderStrip(tab, iss) {
    return TABS.map(function (t) { var n = t.id === 'check' ? warnCount(iss) : 0; return '<button type="button" class="btn btn-icon btn-ghost" data-strip="' + t.id + '" aria-label="Open the builder on ' + t.label + (n ? ', ' + n + ' to check' : '') + '" title="' + esc(t.title) + '">' + I[t.icon] + badge(n) + '</button>'; }).join('');
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
    var chips = '<div class="rail-chips" role="group" aria-label="Filter sleeves by category">' + chip('', 'All · ' + list.length) + D.taxonomy.filter(function (c) { return counts[c.id]; }).map(function (c) { return chip(c.id, c.short + ' · ' + counts[c.id], c.color); }).join('') + '</div>';
    var compared = {}; S.ws.allocations.forEach(function (x) { if (x.kind === 'sleeve' && members.indexOf(x.id) >= 0) compared[x.sleeve.id] = x.sleeve.version; });
    var applied = {}; a.holdings.forEach(function (h) { if (h.sleeveRef) applied[h.sleeveRef.sleeveId] = h.sleeveRef.version; });
    var groups = D.taxonomy.filter(function (c) { return counts[c.id] && (!sleeveCat || sleeveCat === c.id); }).map(function (c) {
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
    if (res > 1e-9) out.push({ t: F.num(res) + '% unallocated', s: 'It earns nothing and carries no risk. Add a product or index, or raise a weight.', acts: [['show', '__total', 'Show in Build']] });
    var px = a.holdings.filter(function (h) { return D.instrumentById[h.instrumentId].coverage !== 'full'; });
    if (px.length) out.push({ t: px.length + ' product' + (px.length === 1 ? '' : 's') + ' with limited history', s: px.map(function (h) { var ins = D.instrumentById[h.instrumentId]; return ins.identifier + ' (' + (ins.coverage === 'none' ? 'no history' : 'proxy') + ')'; }).join(', ') + '. Historical cards disclose it.', acts: [['show', E.categoryOf(px[0]) + '/' + px[0].instrumentId, 'Show in Build']] });
    var fm = D.factorModelById[(S.ws.prefs.factorModel) || 'isg'], prox = a.holdings.filter(function (h) { return fm.coverage(D.instrumentById[h.instrumentId]); });
    if (prox.length) out.push({ t: fm.name + ': ' + prox.length + ' product' + (prox.length === 1 ? '' : 's') + ' proxied by the category index', s: prox.map(function (h) { return D.instrumentById[h.instrumentId].identifier; }).join(', ') + ' are not covered by the ' + fm.name + ' factor model, so factor exposures and factor risk use the category index in their place.', acts: [['show', E.categoryOf(prox[0]) + '/' + prox[0].instrumentId, 'Show in Build'], ['model', fm.id, 'About ' + fm.name]] });
    if (!a.benchmarkId && a.kind !== 'sleeve') out.push({ t: 'No benchmark assigned', s: 'Differences against “each allocation’s benchmark” are unavailable until one is set.', acts: live ? [['bench', '', 'Assign benchmark']] : [] });
    /* the decision chain: what is missing warns; the category-index fallback and a missing chain are information */
    if (a.kind !== 'sleeve') {
      if (!a.chain) out.push({ level: 'info', t: 'No decision chain', s: 'Name a policy benchmark, an SAA and the product benchmarks to decompose return and risk step by step.', acts: [['chain', '', 'Set up decision chain']] });
      else {
        var pol = PA.chain.policyOf(a), saa = PA.chain.saaOf(a, S.ws.allocations), mp = PA.chain.mappingOf(a), fb = mp.filter(function (m) { return m.source === 'categoryIndex' || m.source === 'none'; });
        if (!pol.holdings) out.push({ t: 'No policy benchmark', s: 'The decision chain has no first level, so its steps start at the SAA. Pick a policy benchmark or use the assigned one.', acts: [['chain', 'policy', 'Decision chain…']] });
        if (!saa.holdings) out.push({ t: saa.reason === 'No SAA' ? 'No SAA' : saa.reason, s: 'Without an SAA, the SAA and product benchmark decisions are shown as one step.', acts: [['chain', 'saa', 'Decision chain…']] });
        if (fb.length) out.push({ level: 'info', t: fb.length + ' product' + (fb.length === 1 ? '' : 's') + ' without a stated benchmark (category index used)', s: fb.map(function (m) { return D.instrumentById[m.instrumentId].identifier; }).join(', ') + ' are measured against their category index in the chain. Override any of them in the mapping.', acts: [['chain', 'mapping', 'Review mapping']] });
      }
    }
    return out;
  }
  function warnCount(iss) { return iss.filter(function (x) { return x.level !== 'info'; }).length; }
  function renderCheck(a, iss) {
    var warns = iss.filter(function (x) { return x.level !== 'info'; }), infos = iss.filter(function (x) { return x.level === 'info'; });
    var item = function (x) { var i = iss.indexOf(x), info = x.level === 'info'; return '<div class="rail-check ' + (info ? 'info' : 'warn') + '">' + (info ? I.info : I.warn) + '<div class="txt"><b>' + esc(x.t) + '</b><small>' + esc(x.s) + '</small>' + (x.acts.length ? '<div class="row" style="gap:6px;flex-wrap:wrap;margin-top:5px">' + x.acts.map(function (c, j) { return '<button type="button" class="btn btn-xs" data-issue="' + i + ':' + j + '" data-fkey="issue:' + esc(c[0] + ':' + c[1]) + '">' + esc(c[2]) + '</button>'; }).join('') + '</div>' : '') + '</div></div>'; };
    var html = (warns.length ? warns.map(item).join('') : '<div class="rail-check ok">' + I.ok + '<div class="txt"><b>Nothing needs attention</b><small>Fully allocated, complete histories and a benchmark.</small></div></div>') + (infos.length ? '<div class="rail-sec-head" style="margin-top:10px"><span class="rail-eyebrow">For information</span></div>' + infos.map(item).join('') : '');
    return '<div class="rail-sec"><div class="rail-sec-head"><span class="rail-eyebrow">To check · ' + warns.length + '</span></div>' + html + '</div>' + renderSummary(a) + (a.kind === 'sleeve' ? '' : renderLeverage(a)) + '<div class="field-err" id="check-err" role="alert" style="color:var(--rail-bad)"></div>';
  }


  function renderTree(a) {
    var tree = E.tree(a), col = collapsed[a.id] || {}, ro = a.kind !== 'live', pend = pendingOf(a), sel = S.ws.prefs.selectedRow, selMode = S.session.selectMode, selection = S.session.selection;
    /* one row template, two shapes: a category (band head: chevron, name, bold target, a second line only for an exception)
       and a product (line: name, share of its category, quiet weight; type and identifier on a wide rail) */
    var row = function (o) {
      var isCol = !!col[o.key];
      return '<div class="tree-row depth-' + o.depth + (sel === o.key ? ' is-selected' : '') + (o.index ? ' is-index' : '') + (o.over ? ' is-over' : '') + '" data-key="' + esc(o.key) + '">' +
        '<div class="tree-main">' + (o.depth === 0 ? '<span class="tdrag" draggable="true" data-drag="' + esc(o.key) + '" aria-hidden="true" title="Drag to move ' + esc(o.plain) + ' (or Alt+↑/↓)">' + I.grip + '</span>' + (o.hasChildren ? '<button type="button" class="tw" data-toggle="' + esc(o.key) + '" aria-expanded="' + (!isCol) + '" aria-label="' + (isCol ? 'Expand ' : 'Collapse ') + esc(o.plain) + '">' + I.chevron + '</button>' : '<span class="tw is-leaf" aria-hidden="true">' + I.chevron + '</span>') + '<span class="ttile" aria-hidden="true"></span>' : '') +
        (selMode && o.selectable ? '<input type="checkbox" class="tsel" data-sel="' + esc(o.selId) + '" aria-label="Select ' + esc(o.plain) + '"' + (o.selected ? ' checked' : '') + (o.indeterminate ? ' data-ind="1"' : '') + '>' : '') +
        '<button type="button" class="tname" data-select="' + esc(o.key) + '" data-fkey="n:' + esc(o.key) + '" aria-label="' + esc(o.plain + (o.aria ? ', ' + o.aria : '')) + ', select row"><b>' + o.labelHtml + '</b>' + (o.subHtml ? '<small' + (o.subWarn ? ' class="warn"' : '') + '>' + o.subHtml + '</small>' : '') + (o.ident ? '<small class="ident">' + o.ident + '</small>' : '') + '</button></div>' +
        '<div class="tright">' + (o.depth === 0 && !ro ? '<button type="button" class="tqa' + (quick && quick.cat === o.key ? ' is-on' : '') + '" data-quickadd="' + esc(o.key) + '" data-fkey="qa:' + esc(o.key) + '" aria-label="Add a product to ' + esc(o.plain) + '" data-tip="Add a product to ' + esc(o.plain) + '">' + I.plus + '</button>' : '') + (o.rel ?'<span class="trel"' + (o.relTip ? ' data-tip="' + esc(o.relTip) + '"' : '') + '>' + esc(o.rel) + '</span>' : '') + (o.readonly ? '<span class="tval" data-tip="' + esc(o.tip || '') + '">' + F.num(o.weight) + '</span>' : (function () { var saved = F.num(o.weight, o.weight % 1 ? 2 : 1).replace('−', '-'), pv = !ro && pend[o.key] !== undefined ? pend[o.key] : null; return '<input class="tw-input' + (o.depth === 0 ? ' is-sleeve' : '') + (pv !== null ? ' is-pending' : '') + '" type="text" inputmode="decimal" autocomplete="off" spellcheck="false" value="' + esc(pv !== null ? pv : saved) + '" data-saved="' + esc(saved) + '" data-key="' + esc(o.key) + '" data-fkey="w:' + esc(o.key) + '" aria-label="' + esc(o.plain) + ' weight, percent of total portfolio. Type a value and press Enter to apply."' + (ro ? ' disabled' : '') + '>'; })()) + '<span class="tpct">' + (o.depth === 0 ? '%' : '') + '</span>' +
        (o.menu ? '<button type="button" class="tmenu" aria-label="Options for ' + esc(o.plain) + '" aria-haspopup="menu" aria-expanded="false" data-rowmenu="' + esc(o.key) + '" data-kind="' + o.menu + '">' + I.more + '</button>' : '<span class="tmenu" aria-hidden="true"></span>') + '</div></div>';
    };
    var html = tree.filter(function (t) { return a.kind !== 'sleeve' || t.target > 0 || t.products.length; }).map(function (t) {
      var nSel = t.products.filter(function (h) { return selection.indexOf(h.id) >= 0; }).length, isCol = !!col[t.id], subs = [], warn = false;
      if (t.sleeveRef) subs.push('<span class="sleeve-tag" data-tip="All products in this category come from the sleeve ' + esc(t.sleeveRef.name) + ' v' + t.sleeveRef.version + '">' + I.layers + esc(t.sleeveRef.name) + ' v' + t.sleeveRef.version + '</span>');
      if (!t.products.length) subs.push('Empty · add a product or index with +');
      if (isCol && t.products.length) subs.push(t.products.length + ' product' + (t.products.length === 1 ? '' : 's'));
      var o = '<li class="depth-0" style="--cat:' + t.color + '">' + row({ key: t.id, depth: 0, plain: t.name, labelHtml: esc(t.name), subHtml: subs.join(' · '), subWarn: warn, aria: t.products.length + ' holdings, weight ' + F.num(t.target) + '%, the sum of its holdings', weight: t.target, readonly: !t.products.length, tip: 'Empty: the weight is the sum of its holdings. Add a product or index with +.', hasChildren: t.products.length > 0 || !!(quick && quick.cat === t.id), menu: 'category', over: false, selectable: t.products.length > 0, selId: 'cat:' + t.id, selected: t.products.length > 0 && nSel === t.products.length, indeterminate: nSel > 0 && nSel < t.products.length });
      if (!isCol) {
        o += '<ul>' + t.products.map(function (h, i) {
          var ins = D.instrumentById[h.instrumentId], key = t.id + '/' + h.instrumentId, share = t.target ? h.weight / t.target * 100 : null;
          var cov = ins.coverage !== 'full' ? '<span class="cov" data-tip="' + esc(ins.proxyNote) + '" role="img" aria-label="' + esc(ins.proxyNote) + '"></span>' : '';
          var from = h.sleeveRef && !t.sleeveRef ? '<span class="from-sleeve" data-tip="From the sleeve ' + esc(h.sleeveRef.name) + ' v' + h.sleeveRef.version + '" role="img" aria-label="From the sleeve ' + esc(h.sleeveRef.name) + '">' + I.layers + '</span>' : '';
          return '<li class="depth-1">' + row({ key: key, depth: 1, plain: ins.name, labelHtml: esc(ins.name) + cov + from, ident: esc(ins.type) + ' · ' + esc(ins.identifier) + (h.sleeveRef ? ' · from ' + esc(h.sleeveRef.name) + ' v' + h.sleeveRef.version : ''), aria: ins.type + ' ' + ins.identifier + (share != null ? ', ' + F.num(share, 1) + '% of ' + t.name : ''), rel: share != null ? F.num(share, 0) + '%' : '—', relTip: share != null ? F.num(share, 1) + '% of ' + t.name : null, weight: h.weight, hasChildren: false, menu: 'product', selectable: true, selId: h.id, selected: selection.indexOf(h.id) >= 0 }) + '</li>';
        }).join('') + (quick && quick.allocId === a.id && quick.cat === t.id ? quickRow(a, t) : '') + '</ul>';
      }
      return o + '</li>';
    }).join('');
    var selW = U.sum(a.holdings.filter(function (h) { return selection.indexOf(h.id) >= 0; }), function (h) { return h.weight; });
    return '<div class="rail-sec">' +
      (selMode ? '<div class="selbar" role="status"><span><b>' + selection.length + '</b> selected · <b>' + F.num(selW) + '%</b></span><span class="spacer"></span><button type="button" class="btn btn-xs" id="sel-create"' + (selection.length ? '' : ' disabled') + ' data-tip="Save the selection to the repository, rescaled to 100%">' + I.layers + '<span>Save as sleeve</span></button><button type="button" class="btn btn-xs btn-primary" id="sel-compare"' + (selection.length ? '' : ' disabled') + ' data-tip="Save it, then add it to the comparison as its own column to see its analytics">' + I.plus + '<span>Save &amp; compare</span></button><button type="button" class="btn btn-xs btn-ghost" id="sel-clear">Clear</button><button type="button" class="btn btn-xs" id="sel-done">Done</button></div>' : '') +
      '<ul class="tree" id="tree" role="tree" aria-label="Categories and products of ' + esc(a.name) + '. Weights are percent of the total portfolio; a category is the sum of its holdings.">' + html + '</ul>' +
      '<button type="button" class="tree-addcat" id="tree-addcat" data-fkey="tree-addcat">' + I.plus + '<span>New category</span></button>' +
      '<div class="tree-pending" id="tree-pending" role="status">' + pendingHtml(a) + '</div><div class="field-err" id="tree-err" role="alert" style="color:var(--rail-bad)"></div></div>';
  }
  /* ── quick add: an empty leaf under a category, searching the product library ──
     + on a category row opens it; for a standard category the search is
     limited to its asset classes until “Search all categories”, and a
     category the user added searches everything. The product is added to the
     category whose + opened the row. Choosing a product moves focus to its
     weight; Enter adds it, Esc removes the row. Nothing changes until Enter. */
  var quick = null; /* {allocId, cat, q, all, results, active, chosen, weight} */
  var searchable = function (catId) { var c = D.categoryById[catId]; return !!(c && c.assetClasses && c.assetClasses.length); };
  function quickRow(a, t) {
    var q = quick, cat = D.categoryById[t.id], label = q.all ? 'all products' : cat.short;
    var lead = q.chosen ? '<span class="qa-name"><b>' + esc(q.chosen.name) + '</b><small>' + esc(q.chosen.type + ' · ' + q.chosen.identifier) + '</small></span>'
      : '<span class="qa-search">' + I.search + '<input type="text" id="qa-input" data-fkey="qa-input" role="combobox" aria-expanded="' + !!(q.results && q.results.length) + '" aria-controls="qa-list" aria-autocomplete="list" aria-label="Search ' + esc(label) + ' to add a product to ' + esc(cat.name) + '" placeholder="Search ' + esc(label) + '…" autocomplete="off" spellcheck="false" value="' + esc(q.q) + '"' + (q.results && q.results.length ? ' aria-activedescendant="qa-opt-' + q.active + '"' : '') + '></span>';
    var w = '<input class="tw-input qa-w' + (q.chosen ? ' is-pending' : '') + '" type="text" inputmode="decimal" id="qa-weight" data-fkey="qa-weight" autocomplete="off" spellcheck="false" placeholder="' + (q.chosen ? '%' : '') + '" value="' + esc(q.weight) + '" aria-label="' + esc(q.chosen ? q.chosen.name + ' weight, percent of total portfolio. Press Enter to add it.' : 'Weight, after choosing a product') + '"' + (q.chosen ? '' : ' disabled') + '>';
    return '<li class="depth-1 is-adding"><div class="tree-row depth-1 qa-row"><div class="tree-main">' + lead + '</div><div class="tright"><span class="trel"></span>' + w + '<span class="tpct"></span><button type="button" class="tmenu qa-x" id="qa-cancel" aria-label="Cancel adding (Esc)" data-tip="Cancel (Esc)">' + I.close + '</button></div></div>' +
      (q.chosen ? '<div class="qa-hint">Adds it to ' + esc(cat.name) + '. <kbd>Enter</kbd> adds it · <kbd>Esc</kbd> cancels</div>' : '<div class="qa-dd" id="qa-dd">' + quickList(t) + '</div>') + '</li>';
  }
  function quickList(t) {
    var q = quick, a = S.active(), cat = D.categoryById[q.cat], list = q.results;
    var head = list === null ? '<div class="sr-empty">Searching…</div>' : !list.length ? '<div class="sr-empty">' + (q.all && !q.q.trim() ? 'Type to search every category.' : 'No product matches “' + esc(q.q) + '”' + (q.all ? '' : ' in ' + esc(cat.short)) + '. <button type="button" class="btn-link" data-paste>Add it from its returns</button>') + '</div>' :
      '<div role="listbox" id="qa-list" aria-label="Products">' + list.map(function (r, i) {
        var held = a ? a.holdings.filter(function (h) { return h.instrumentId === r.id; })[0] : null;
        var tag = held ? '<span class="tag">Held ' + F.num(held.weight) + '%</span>' : r.uploaded ? '<span class="tag tag-info">Uploaded</span>' : r.coverage !== 'full' ? '<span class="tag tag-warn">' + (r.coverage === 'none' ? 'No history' : 'Proxy') + '</span>' : '';
        return '<div role="option" class="qa-opt" id="qa-opt-' + i + '" data-qa-pick="' + i + '" aria-selected="' + (i === q.active) + '"><span><b>' + esc(r.name) + '</b><small>' + esc(r.type + ' · ' + r.identifier + (q.all ? ' · ' + r.category : '')) + '</small></span>' + tag + '</div>';
      }).join('') + '</div>';
    return head + '<div class="qa-foot"><span>' + (!searchable(q.cat) ? 'In every category' : q.all ? 'In every category · <button type="button" class="btn-link" id="qa-all">Only ' + esc(cat.short) + '</button>' : 'In ' + esc(cat.short) + ' · <button type="button" class="btn-link" id="qa-all">Search all categories</button>') + '</span><button type="button" class="btn-link" data-paste data-tip="Paste a cell range from Excel: dates, then one column of returns per product">' + I.paste + 'Paste returns</button></div>';
  }
  function paintQuickList() {
    var dd = U.$('#qa-dd'); if (!dd || !quick) return; dd.innerHTML = quickList();
    var inp = U.$('#qa-input'), has = !!(quick.results && quick.results.length);
    if (inp) { inp.setAttribute('aria-expanded', String(has)); if (has) inp.setAttribute('aria-activedescendant', 'qa-opt-' + quick.active); else inp.removeAttribute('aria-activedescendant'); }
  }
  function quickSearch() {
    var q0 = quick; if (!q0) return;
    var text = q0.q, all = q0.all;
    if (all && !text.trim()) { q0.results = []; paintQuickList(); return; }
    PA.api.searchInvestments(text, { limit: 40, category: all ? undefined : q0.cat }).then(function (list) {
      if (quick !== q0 || q0.q !== text || q0.all !== all) return;
      q0.results = list.filter(function (r) { return r.kind === 'instrument'; }).slice(0, 8); q0.active = 0; paintQuickList();
      U.announce(q0.results.length + ' product' + (q0.results.length === 1 ? '' : 's') + (text.trim() ? ' for ' + text : '') + (all ? '' : ' in ' + D.categoryById[q0.cat].name));
    });
  }
  B.quickAdd = function (catId) { var a = S.active(); if (a) openQuick(a, catId); };
  /** Quick add with a product already chosen (after adding it from its returns): only the weight is left. */
  B.addProduct = function (instrumentId, categoryId) {
    var a = S.active(), ins = D.instrumentById[instrumentId]; if (!a || a.kind !== 'live' || !ins) return;
    var has = function (id) { return D.categories.some(function (c) { return c.id === id; }); }, home = E.categoryOf(instrumentId), cat = categoryId && has(categoryId) ? categoryId : has(home) ? home : D.categories[0].id;
    openRail(); openQuick(a, cat); quickPick(a, { id: ins.id, name: ins.name, type: ins.type, identifier: ins.identifier });
  };
  function openQuick(a, catId, opts) {
    if (a.kind !== 'live') return;
    var c = collapsed[a.id]; if (c) delete c[catId];
    quick = { allocId: a.id, cat: catId, q: '', all: !!(opts && opts.all) || !searchable(catId), results: null, active: 0, chosen: null, weight: '' };
    S.session.railTab = 'build'; B.render(); quickSearch();
    var inp = U.$('#qa-input'); if (inp) { inp.focus(); inp.closest('li').scrollIntoView({ block: 'nearest' }); }
  }
  function closeQuick(focusPlus) {
    if (!quick) return; var cat = quick.cat; quick = null; B.render();
    if (focusPlus) { var b = root.querySelector('[data-quickadd="' + CSS.escape(cat) + '"]'); if (b) b.focus(); }
  }
  function quickPick(a, r) {
    var held = a.holdings.filter(function (h) { return h.instrumentId === r.id; })[0];
    if (held) {
      var key = E.categoryOf(held) + '/' + r.id; quick = null; showRow(a, key);
      var w0 = root.querySelector('input[data-key="' + CSS.escape(key) + '"]'); if (w0) { w0.focus(); w0.select(); }
      UI.toast(r.name + ' is already held at ' + F.num(held.weight) + '%. Change its weight in its row.'); return;
    }
    quick.chosen = { id: r.id, name: r.name, type: r.type, identifier: r.identifier };
    quick.weight = '';
    B.render();
    var w = U.$('#qa-weight'); if (w) { w.focus(); w.select(); }
    U.announce(r.name + ' chosen. ' + (quick.weight ? 'Weight prefilled with ' + quick.weight + ' percent.' : 'Type a weight.') + ' Press Enter to add it.');
  }
  function commitQuick(a) {
    var q = quick, inp = U.$('#qa-weight'), err = U.$('#tree-err'); if (!q || !q.chosen || !inp) return;
    var raw = inp.value.trim().replace(',', '.').replace(/%$/, '').replace('−', '-'), v = Number(raw);
    if (raw === '' || !isFinite(v) || v === 0) { inp.setAttribute('aria-invalid', 'true'); err.textContent = 'Enter a weight for ' + q.chosen.name + ', e.g. 3.0.'; inp.focus(); return; }
    v = U.round(v, 2);
    var id = q.chosen.id, own = q.cat, next = { holdings: U.clone(a.holdings).concat([{ id: U.uid('h'), instrumentId: id, weight: v, categoryId: own }]), leverage: a.leverage };
    var before = E.categoryTargets(a)[own], after = E.categoryTargets(next)[own];
    var allocated = E.allocated(next);
    if (!a.leverage && (v < 0 || allocated > 100.0001)) { inp.setAttribute('aria-invalid', 'true'); err.textContent = v < 0 ? 'Negative weights need shorts & leverage enabled.' : 'That takes the allocation to ' + F.num(allocated) + '%. Lower the weight, lower another weight, or enable shorts & leverage.'; inp.focus(); return; }
    var name = q.chosen.name, catName = D.categoryById[own].name; quick = null; err.textContent = '';
    S.update(a.name + ' · ' + name + ' added to ' + catName + ' at ' + F.num(v) + '%', function (ws) { var x = ws.allocations.filter(function (y) { return y.id === a.id; })[0]; x.holdings = next.holdings; if (x.history && x.history.basis === 'actual') x.edited = true; }, { type: 'edit' });
    S.setPref('selectedRow', own + '/' + id); ensureTableExpanded(own + '/' + id);
    var n = root.querySelector('.tree-row[data-key="' + CSS.escape(own + '/' + id) + '"] .tname'); if (n) n.focus();
    UI.toast(name + ' added at ' + F.num(v) + '%. ' + catName + ' is now ' + F.num(after) + '% (was ' + F.num(before) + '%).', { action: { label: 'Undo', fn: S.undo } });
  }

  function renderSummary(a) {
    var net = E.allocated(a), gross = E.gross(a), res = 100 - net, tree = E.tree(a);
    var bar = tree.map(function (t) { return t.target > 0 ? '<i style="width:' + U.clamp(t.target, 0, 100) + '%;background:' + t.color + '" title="' + esc(t.name) + ' ' + F.num(t.target) + '%"></i>' : ''; }).join('');
    return '<div class="rail-sec"><span class="rail-eyebrow">Weights</span><div class="weights-summary" aria-label="Weight summary"><div class="row"><span>Allocated</span><b>' + F.pct(net) + '</b></div><div class="bar" aria-hidden="true">' + bar + '</div>' +
      '<div class="row"><span>' + (res >= -1e-9 ? 'Unallocated' : 'Borrowing') + '</span><b class="' + (res < -1e-9 ? 'warn' : '') + '">' + F.pct(Math.abs(res)) + '</b></div>' +
      '<div class="row" style="color:var(--rail-ink-2)"><span>Gross ' + F.pct(gross) + '</span><span>Net ' + F.pct(E.net(a)) + '</span></div>' +
      (res > 1e-9 ? '<div class="small" style="color:var(--rail-ink-3)">Unallocated weight earns nothing and carries no risk. It is not priced as cash.</div>' : '') + (res < -1e-9 ? '<div class="small" style="color:var(--rail-ink-3)">Borrowing shown as information only: no financing cost is modelled.</div>' : '') + '</div></div>';
  }
  function renderLeverage(a) { return '<div class="rail-sec"><label class="switch"><input type="checkbox" id="lev-switch"' + (a.leverage ? ' checked' : '') + (a.kind !== 'live' ? ' disabled' : '') + '><span class="track"></span><span>Enable shorts &amp; leverage</span></label><div class="field-hint">' + (a.leverage ? 'Negative weights and net allocation above 100% are accepted. Gross, net and borrowing are informational; no risk limit applies.' : 'Off: weights must be between 0% and 100% and the total at most 100%.') + '</div></div>'; }
  /** Always in view: the category bar and the allocated total. */
  function renderFoot(a) {
    if (!foot) return;
    if (!a) { foot.innerHTML = ''; return; }
    var tree = E.tree(a), net = E.allocated(a), res = 100 - net, scale = Math.max(100, net);
    var bar = tree.map(function (t) { var p = Math.max(0, t.target); return p > 0 ? '<i style="width:' + (p / scale * 100) + '%;background:' + t.color + '" title="' + esc(t.name) + ' · ' + F.num(p) + '%"></i>' : ''; }).join('');
    foot.innerHTML = '<div class="bar" role="img" aria-label="' + esc(tree.filter(function (t) { return t.target > 0; }).map(function (t) { return t.short + ' ' + F.num(t.target) + '%'; }).join(', ')) + '">' + bar + '</div>' +
      '<div class="row"><span>Allocated <b>' + F.pct(net) + '</b></span><span class="spacer"></span>' + (Math.abs(res) < 1e-9 ? '' : res > 0 ? '<span class="warn">' + F.pct(res) + ' unallocated</span>' : '<span class="warn">Borrowing ' + F.pct(-res) + '</span>') + '</div>';
  }

  /* ── events ──────────────────────────────────────────────────────── */
  function wire(a, iss) {
    var tabs = U.$('#rail-tabs');
    tabs.onclick = function (e) { var b = e.target.closest('[data-tab]'); if (b) B.showTab(b.dataset.tab); };
    tabs.onkeydown = function (e) { var ids = TABS.map(function (t) { return t.id; }), i = ids.indexOf(tabOf()), n = e.key === 'ArrowRight' ? i + 1 : e.key === 'ArrowLeft' ? i - 1 : e.key === 'Home' ? 0 : e.key === 'End' ? ids.length - 1 : null; if (n === null) return; e.preventDefault(); B.showTab(ids[(n + ids.length) % ids.length], { focus: true }); };
    U.$('#rail-strip-tabs').onclick = function (e) { var b = e.target.closest('[data-strip]'); if (b) B.showTab(b.dataset.strip); };
    if (!a) { root.onclick = null; var nb0 = U.$('#rail-new'); if (nb0) nb0.onclick = function () { UI.dialogs.newAllocation(); }; return; }
    root.onclick = function (e) {
      var b = e.target.closest('[data-slcat],[data-slapply],[data-slcompare],[data-slopen],[data-issue],[data-paste]'); if (!b || !root.contains(b)) return;
      var d = b.dataset, s = sleeveList && sleeveList[Number(d.slapply || d.slcompare || d.slopen)];
      if (d.paste !== undefined) { var q0 = quick; UI.importer.open({ text: '', categoryId: q0 ? (q0.all ? null : q0.cat) : null, addTo: q0 ? q0.cat : null, name: q0 && q0.q.trim() ? q0.q.trim() : '' }); }
      else if (d.slcat !== undefined) { sleeveCat = d.slcat; B.render(); }
      else if (d.slapply) UI.sleeves.apply(a, s.categoryId, s);
      else if (d.slcompare) UI.sleeves.addToWorkspace(s, UI.sleeves.latest(s));
      else if (d.slopen) UI.shell.go('#/sleeves/' + encodeURIComponent(s.id));
      else if (d.issue) { var p = d.issue.split(':'), c = iss[Number(p[0])].acts[Number(p[1])]; issueAction(a, c[0], c[1]); }
    };
    var fs = U.$('#sl-from-sel'); if (fs) fs.onclick = function () { S.session.railTab = 'build'; S.setSelectMode(true); UI.toast('Tick products in the tree, then Save as sleeve or Save & compare.'); };
    var or = U.$('#sl-open-repo'); if (or) or.onclick = function () { UI.shell.go('#/sleeves'); };
    var rm = U.$('#rail-menu'); if (rm) rm.onclick = function () { rowMenu(rm, a, 'root'); };
    var cho = U.$('#rail-head [data-chain-open]'); if (cho) cho.onclick = function () { UI.chain.open(a); };
    var pick = U.$('#active-pick'); if (pick) pick.onchange = function () { var id = pick.value; S.update('Editing switched to ' + S.allocation(id).name, function (ws) { ws.comparison.activeId = id; }, { refresh: false, activity: false, force: true }); };
    var nb = U.$('#rail-new'); if (nb) nb.onclick = function () { UI.dialogs.newAllocation(); };
    var dr = U.$('#rail-draft'); if (dr) dr.onclick = function () { UI.dialogs.draftFromSnapshot(a); };
    var so = U.$('#rail-sleeve-open'); if (so) so.onclick = function () { UI.shell.go('#/sleeves/' + encodeURIComponent(a.sleeve.id)); };
    var su = U.$('#rail-sleeve-update'); if (su) su.onclick = function () { var s = UI.sleeves.known[a.sleeve.id]; if (s) UI.sleeves.setMemberVersion(a, s, UI.sleeves.latest(s)); };
    if (tabOf() === 'optimize') UI.optimizer.wire(root, a);
    var tree = U.$('#tree');
    if (tree) {
      U.$$('.tsel[data-ind]', tree).forEach(function (cb) { cb.indeterminate = true; });
      U.on(tree, 'click', '[data-toggle]', function (e, b) { var key = b.dataset.toggle, c = collapsed[a.id] = collapsed[a.id] || {}; if (c[key]) delete c[key]; else c[key] = true; B.render(); });
      U.on(tree, 'click', '[data-select]', function (e, b) { if (e.metaKey || e.ctrlKey) { var h = holdingForKey(a, b.dataset.select); if (h) { S.toggleSelected(h.id); return; } } var key = b.dataset.select; S.setPref('selectedRow', key); ensureTableExpanded(key); if (key !== '__total' && key.indexOf('/') < 0) S.setStandalone(a.id, key); });
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
      /* quick add */
      U.on(tree, 'click', '[data-quickadd]', function (e, b) { if (quick && quick.cat === b.dataset.quickadd && quick.allocId === a.id) { var qi = U.$('#qa-input') || U.$('#qa-weight'); if (qi) qi.focus(); return; } openQuick(a, b.dataset.quickadd); });
      var qin = U.$('#qa-input');
      if (qin) {
        qin.oninput = function () { quick.q = qin.value; quick.results = null; paintQuickList(); clearTimeout(searchTimer); searchTimer = setTimeout(quickSearch, 140); };
        qin.onkeydown = function (e) {
          var n = quick.results ? quick.results.length : 0;
          if (e.key === 'ArrowDown' || e.key === 'ArrowUp') { e.preventDefault(); if (n) { quick.active = (quick.active + (e.key === 'ArrowDown' ? 1 : n - 1)) % n; paintQuickList(); var o = U.$('#qa-opt-' + quick.active); if (o) o.scrollIntoView({ block: 'nearest' }); } }
          else if (e.key === 'Enter') { e.preventDefault(); if (n) quickPick(a, quick.results[quick.active]); }
          else if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); closeQuick(true); }
        };
      }
      var qli = tree.querySelector('li.is-adding');
      if (qli) {
        U.on(qli, 'mousedown', '[data-qa-pick],#qa-all,[data-paste]', function (e) { e.preventDefault(); });
        U.on(qli, 'click', '[data-qa-pick]', function (e, o) { quickPick(a, quick.results[Number(o.dataset.qaPick)]); });
        U.on(qli, 'click', '#qa-all', function () { quick.all = !quick.all; quick.results = null; paintQuickList(); var p = U.$('#qa-input'); if (p) { p.placeholder = 'Search ' + (quick.all ? 'all products' : D.categoryById[quick.cat].short) + '…'; p.focus(); } quickSearch(); });
        U.on(qli, 'click', '#qa-cancel', function () { closeQuick(true); });
        qli.addEventListener('focusout', function () { setTimeout(function () { if (quick && !quick.chosen && !quick.q.trim() && !(document.activeElement && document.activeElement.closest && document.activeElement.closest('li.is-adding')) && !(document.activeElement && document.activeElement.matches && document.activeElement.matches('[data-quickadd]'))) closeQuick(false); }, 120); });
        var qw = U.$('#qa-weight');
        if (qw) qw.onkeydown = function (e) { if (e.key === 'Enter') { e.preventDefault(); commitQuick(a); } else if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); U.$('#tree-err').textContent = ''; closeQuick(true); } };
        if (qw) qw.oninput = function () { quick.weight = qw.value; qw.removeAttribute('aria-invalid'); };
      }
      var tpe = U.$('#tree-pending'); if (tpe) tpe.onclick = function (e) { if (e.target.closest('#pending-discard')) { discardPending(a); B.render(); } };
      tree.addEventListener('keydown', function (e) {
        var names = U.$$('.tname', tree), cur = document.activeElement, i = names.indexOf(cur); if (i < 0) return;
        var key = cur.dataset.select, c = collapsed[a.id] = collapsed[a.id] || {};
        if (e.altKey && (e.key === 'ArrowUp' || e.key === 'ArrowDown') && key.indexOf('/') < 0) { e.preventDefault(); var ids = S.ws.categories.map(function (c) { return c.id; }); moveCategory(key, ids.indexOf(key) + (e.key === 'ArrowUp' ? -1 : 1)); return; }
        if (e.key === 'ArrowDown' && i < names.length - 1) { e.preventDefault(); names[i + 1].focus(); }
        else if (e.key === 'ArrowUp' && i > 0) { e.preventDefault(); names[i - 1].focus(); }
        else if (e.key === 'ArrowRight') { e.preventDefault(); if (c[key]) { delete c[key]; B.render(); } }
        else if (e.key === 'ArrowLeft') { e.preventDefault(); if (cur.closest('.tree-row').querySelector('[data-toggle]') && !c[key]) { c[key] = true; B.render(); } }
        else if (e.key === 'Enter') { e.preventDefault(); var w = cur.closest('.tree-row').querySelector('input[data-key]'); if (w && !w.disabled) { w.focus(); w.select(); } }
        else if (e.key === ' ' && S.session.selectMode) { var h = holdingForKey(a, key); if (h) { e.preventDefault(); S.toggleSelected(h.id); } }
        else if (e.key === 'Escape' && S.session.standalone) { e.preventDefault(); S.setStandalone(null); }
        else if ((e.key === '+' || e.key === 'Insert') && key.indexOf('/') < 0 && a.kind === 'live') { e.preventDefault(); openQuick(a, key); }
      });
      var ac = U.$('#tree-addcat'); if (ac) ac.onclick = function () { B.newCategory(); };
      /* drag a category by its grip; drop above or below another category */
      var dragId = null, clearMarks = function () { U.$$('.tree > li.drop-before, .tree > li.drop-after', tree).forEach(function (li) { li.classList.remove('drop-before', 'drop-after'); }); };
      U.on(tree, 'dragstart', '[data-drag]', function (e, g) { dragId = g.dataset.drag; e.dataTransfer.effectAllowed = 'move'; try { e.dataTransfer.setData('text/plain', dragId); } catch (x) { /* older browsers */ } var li = g.closest('li.depth-0'); if (li) { li.classList.add('is-dragging'); try { e.dataTransfer.setDragImage(li, 20, 16); } catch (x) { /* optional */ } } });
      tree.addEventListener('dragover', function (e) { if (!dragId) return; var li = e.target.closest && e.target.closest('.tree > li.depth-0'); if (!li) return; e.preventDefault(); e.dataTransfer.dropEffect = 'move'; var r = li.getBoundingClientRect(), below = e.clientY > r.top + r.height / 2; clearMarks(); li.classList.add(below ? 'drop-after' : 'drop-before'); });
      tree.addEventListener('drop', function (e) { if (!dragId) return; var li = e.target.closest && e.target.closest('.tree > li.depth-0'); e.preventDefault(); var id = dragId; dragId = null; clearMarks(); if (!li) return; var target = li.querySelector('.tree-row').dataset.key, ids = S.ws.categories.map(function (c) { return c.id; }), r = li.getBoundingClientRect(), below = e.clientY > r.top + r.height / 2, to = ids.indexOf(target) + (below ? 1 : 0), from = ids.indexOf(id); if (from < to) to--; moveCategory(id, to); });
      tree.addEventListener('dragend', function () { dragId = null; clearMarks(); U.$$('.is-dragging', tree).forEach(function (x) { x.classList.remove('is-dragging'); }); });
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
  var renderRail = B.render; B.render = function () { renderRail(); if (root && S.ws) markStandalone(); };
  /** Mark the category shown on its own in the analysis. */
  function markStandalone() {
    var x = S.standalone(), id = x ? x.standalone.categoryId : null;
    U.$$('#tree .tree-row.depth-0', root).forEach(function (r) {
      var on = r.dataset.key === id, t = r.querySelector('.t-alone');
      r.classList.toggle('is-alone', on);
      if (on && !t) { var n = r.querySelector('.tname'); if (n) n.insertAdjacentHTML('beforeend', '<small class="t-alone">On its own · 100%</small>'); }
      if (!on && t) t.remove();
    });
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
    else if (kind === 'find') B.findProduct(key);
    else if (kind === 'apply') UI.sleeves.apply(a, key);
    else if (kind === 'bench') UI.dialogs.assignBenchmark(a);
    else if (kind === 'model') PA.cards.aboutModel(key);
    else if (kind === 'chain') UI.chain.open(a, { focus: key });
  }
  function holdingForKey(a, key) { var p = key.split('/'); if (p.length !== 2 || p[1] === '__index') return null; return a.holdings.filter(function (h) { return h.instrumentId === p[1]; })[0] || null; }
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
    var parts = key.split('/'), next = { holdings: U.clone(a.holdings), leverage: a.leverage }, label, before, note = '';
    if (parts.length === 1) {
      /* a category: rescale its holdings pro rata to the new weight */
      var inCat = next.holdings.filter(function (x) { return E.categoryOf(x) === key; }); if (!inCat.length) return;
      before = E.categoryTargets(a)[key]; label = D.categoryById[key].name;
      E.scaleTo(inCat, v);
      note = ' (' + inCat.length + ' holding' + (inCat.length === 1 ? '' : 's') + ' rescaled pro rata)';
    }
    else { var h = next.holdings.filter(function (x) { return x.instrumentId === parts[1]; })[0]; if (!h) return; before = h.weight; h.weight = v; label = D.instrumentById[parts[1]].name; var c0 = D.categoryById[parts[0]], cw = E.categoryTargets(next)[parts[0]]; if (c0) note = '; ' + c0.name + ' is now ' + F.num(cw) + '%'; }
    var allocated = E.allocated(next);
    if (!a.leverage && (v < 0 || allocated > 100.0001)) { inp.setAttribute('aria-invalid', 'true'); err.textContent = v < 0 ? 'Negative weights need shorts & leverage enabled.' : 'That takes the allocation to ' + F.num(allocated) + '%. Lower another weight or enable shorts & leverage.'; return; }
    inp.removeAttribute('aria-invalid'); discardPending(a, key);
    S.update(a.name + ' · ' + label + ' ' + F.num(before) + '% → ' + F.num(v) + '%' + note, function (ws) { var x = ws.allocations.filter(function (y) { return y.id === a.id; })[0]; x.holdings = next.holdings; if (x.history && x.history.basis === 'actual') x.edited = true; }, { type: 'edit' });
    U.announce(label + ' set to ' + F.num(v) + ' percent' + note + '. Analytics updating.');
  }
  /* ── categories: workspace-wide, shared by every allocation in it ── */
  /** Allocations in the workspace that hold anything in a category. */
  function categoryUsers(id) { return S.ws.allocations.filter(function (x) { return (x.holdings || []).some(function (h) { return E.categoryOf(h) === id; }); }); }
  function nameTaken(name, exceptId) { var n = name.trim().toLowerCase(); return D.categories.some(function (c) { return c.id !== exceptId && c.name.trim().toLowerCase() === n; }); }
  function nextCategoryColor() { var used = D.categories.map(function (c) { return (c.color || '').toLowerCase(); }), pool = D.taxonomy.map(function (c) { return c.color; }).concat(D.extraCategoryColors); for (var i = 0; i < pool.length; i++) if (used.indexOf(pool[i].toLowerCase()) < 0) return pool[i]; return pool[D.categories.length % pool.length]; }
  /** Add a category (after the selected category, else at the end), then open quick add in it. */
  B.newCategory = function () {
    if (!S.ws) return;
    UI.prompt({ title: 'New category', sub: 'Categories belong to the workspace: the new category appears, empty, in every allocation in it. Add products or indices to it with +.', label: 'Category name', value: '', confirmLabel: 'Create category' }).then(function (name) {
      if (!name) return;
      if (nameTaken(name)) { UI.toast('A category called “' + name + '” already exists.', { kind: 'error' }); return; }
      var id = U.uid('cat'), color = nextCategoryColor(), sel = S.ws.prefs.selectedRow, after = sel ? sel.split('/')[0] : null;
      S.update('Category “' + name + '” created', function (ws) { var i = ws.categories.map(function (c) { return c.id; }).indexOf(after); ws.categories.splice(i >= 0 ? i + 1 : ws.categories.length, 0, { id: id, name: name, color: color }); }, { type: 'category', refresh: false });
      S.setPref('selectedRow', id);
      var a = S.active(); if (a && a.kind === 'live') openQuick(a, id); else { B.render(); }
      UI.toast('“' + name + '” created. Add products or indices with +, and drag the grip to move it.', { action: { label: 'Undo', fn: S.undo } });
    });
  };
  function renameCategory(id) {
    var c = D.categoryById[id]; if (!c) return;
    UI.prompt({ title: 'Rename category', sub: 'Renames it in every allocation in this workspace.', label: 'Category name', value: c.name }).then(function (name) {
      if (!name || name === c.name) return;
      if (nameTaken(name, id)) { UI.toast('A category called “' + name + '” already exists.', { kind: 'error' }); return; }
      S.update('Category “' + c.name + '” renamed to “' + name + '”', function (ws) { ws.categories.forEach(function (x) { if (x.id === id) x.name = name; }); }, { type: 'category' });
      var n = root.querySelector('.tree-row[data-key="' + CSS.escape(id) + '"] .tname'); if (n) n.focus();
    });
  }
  /** Move a category to position `to` in the workspace's order. */
  function moveCategory(id, to) {
    var ids = S.ws.categories.map(function (c) { return c.id; }), from = ids.indexOf(id); to = U.clamp(to, 0, ids.length - 1);
    if (from < 0 || from === to) return;
    var c = D.categoryById[id];
    S.update('Category “' + c.name + '” moved to position ' + (to + 1) + ' of ' + ids.length, function (ws) { var x = ws.categories.splice(from, 1)[0]; ws.categories.splice(to, 0, x); }, { type: 'category' });
    U.announce(c.name + ' moved to position ' + (to + 1) + ' of ' + ids.length + '.');
    var n = root.querySelector('.tree-row[data-key="' + CSS.escape(id) + '"] .tname'); if (n) n.focus();
  }
  B.moveCategory = moveCategory;
  function deleteCategory(id) {
    var c = D.categoryById[id]; if (!c || categoryUsers(id).length) return;
    S.update('Category “' + c.name + '” deleted', function (ws) { ws.categories = ws.categories.filter(function (x) { return x.id !== id; }); if (ws.prefs.selectedRow && ws.prefs.selectedRow.split('/')[0] === id) ws.prefs.selectedRow = '__total'; ws.prefs.expanded = (ws.prefs.expanded || []).filter(function (x) { return x !== id; }); }, { type: 'category' });
    UI.toast('“' + c.name + '” deleted.', { action: { label: 'Undo', fn: S.undo } });
  }

  function rowMenu(btn, a, kindOverride) {
    var key = btn.dataset.rowmenu, kind = kindOverride || btn.dataset.kind, items = [], ro = a.kind !== 'live';
    var allTo = function (shut) { var c = collapsed[a.id] = {}; if (shut) D.categories.forEach(function (ct) { c[ct.id] = true; }); B.showTab('build'); };
    if (kind === 'root') items = [{ head: a.name },
      { label: S.session.selectMode ? 'Stop selecting products' : 'Select products for a sleeve', icon: I.check, disabled: ro, onClick: function () { S.session.railTab = 'build'; S.setSelectMode(!S.session.selectMode); } },
      { label: 'Expand every category', onClick: function () { allTo(false); } },
      { label: 'Collapse every category', onClick: function () { allTo(true); } },
      { sep: true }, { label: 'New category…', icon: I.plus, onClick: function () { B.newCategory(); } }, { label: 'Find a product to add', icon: I.search, disabled: ro, kbd: '/', onClick: function () { B.findProduct(); } }, { label: 'Add products from returns…', icon: I.paste, onClick: function () { UI.importer.open({ text: '' }); } },
      { sep: true }, { label: 'Rename', onClick: function () { UI.dialogs.renameAllocation(a); } }, { label: 'Assign benchmark…', onClick: function () { UI.dialogs.assignBenchmark(a); } }, { label: a.chain ? 'Decision chain…' : 'Set up decision chain…', icon: I.chart, disabled: a.kind === 'sleeve', onClick: function () { UI.chain.open(a); } }, { label: 'Snapshot this allocation', icon: I.camera, onClick: function () { UI.dialogs.snapshot(a); } }, { label: 'Show portfolio total in table', icon: I.table, onClick: function () { S.setPref('selectedRow', '__total'); } }];
    else if (kind === 'category') {
      var t = E.tree(a).filter(function (x) { return x.id === key; })[0], ci = D.categories.map(function (c) { return c.id; }).indexOf(key), n = D.categories.length, usedBy = categoryUsers(key);
      items = [{ head: t.name },
        { label: 'Create sleeve from category', icon: I.layers, disabled: !t.products.length, onClick: function () { UI.sleeves.create({ alloc: a, categoryId: key }); } },
        { label: 'Save as sleeve and compare…', icon: I.plus, disabled: !t.products.length || a.kind === 'sleeve', onClick: function () { UI.sleeves.create({ alloc: a, categoryId: key, compare: true }); } },
        { label: 'Apply a sleeve…', icon: I.folder, disabled: ro, onClick: function () { UI.sleeves.apply(a, key); } },
        { label: 'Add a product or index here', icon: I.plus, disabled: ro, onClick: function () { openQuick(a, key); } },
        { sep: true },
        { label: 'Rename category…', onClick: function () { renameCategory(key); } },
        { label: 'Move up', icon: I.arrowUp, kbd: 'Alt+↑', disabled: ci <= 0, onClick: function () { moveCategory(key, ci - 1); } },
        { label: 'Move down', icon: I.arrowDown, kbd: 'Alt+↓', disabled: ci >= n - 1, onClick: function () { moveCategory(key, ci + 1); } },
        { label: usedBy.length ? 'Delete category (not empty)' : 'Delete category', icon: I.trash, disabled: usedBy.length > 0 || n <= 1, onClick: function () { deleteCategory(key); } },
        { sep: true },
        { label: 'Show in table', icon: I.table, onClick: function () { S.setPref('selectedRow', key); } },
        { label: 'Set weight to 0', disabled: ro || t.target === 0, onClick: function () { var inp = root.querySelector('input[data-key="' + CSS.escape(key) + '"]'); if (inp) { inp.value = '0'; commitWeight(inp, a); } } }];
    } else {
      var parts = key.split('/'), ins = D.instrumentById[parts[1]], h = holdingForKey(a, key), on = h && S.session.selection.indexOf(h.id) >= 0;
      items = [{ head: ins.name },
        { label: on ? 'Deselect' : 'Select for a sleeve', icon: I.check, disabled: ro, onClick: function () { S.toggleSelected(h.id); } },
        { label: 'Inspect', icon: I.info, onClick: function () { UI.dialogs.inspectInstrument(ins); } },
        { label: 'Show in table', icon: I.table, onClick: function () { S.setPref('selectedRow', key); ensureTableExpanded(key); } }].concat(a.chain ? [{ label: 'Show against its benchmark', icon: I.chart, onClick: function () { UI.chain.showAgainstBenchmark(a, key); } }] : []).concat([
        { sep: true },
        { label: 'Remove from allocation', icon: I.trash, disabled: ro, onClick: function () {
          var cat0 = D.categoryById[parts[0]], was = E.categoryTargets(a)[parts[0]];
          S.update(a.name + ' · ' + ins.name + ' removed', function (ws) { var x = ws.allocations.filter(function (y) { return y.id === a.id; })[0]; x.holdings = x.holdings.filter(function (q) { return q.instrumentId !== ins.id; }); if (x.history && x.history.basis === 'actual') x.edited = true; if (ws.prefs.selectedRow === key) ws.prefs.selectedRow = parts[0]; }, { type: 'edit' });
          UI.toast(ins.name + ' removed. ' + (cat0 ? cat0.name + ' is now ' + F.num(E.categoryTargets(S.active())[parts[0]]) + '% (was ' + F.num(was) + '%).' : ''), { action: { label: 'Undo', fn: S.undo } });
        } }]);
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
    /* a rail 420px or wider has room for each product's type and identifier */
    var apply = function (w) { w = U.clamp(w, 280, 560); ws.style.setProperty('--rail-w', w + 'px'); handle.setAttribute('aria-valuenow', String(w)); U.$('#rail').classList.toggle('is-wide', w >= 420); return w; };
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
      if (type === 'load') { pending = {}; quick = null; sleeveCat = ''; sleeveList = null; B.applyWidth(); B.render(); var t = U.$('#rail-collapse'); if (t) t.setAttribute('aria-expanded', String(!S.ws.prefs.railCollapsed)); }
      if (type === 'update' || type === 'undo' || type === 'redo') { B.render(); if (tabOf() === 'sleeves') loadSleeves(); }
      if (type === 'session' && extra.key === 'selection') B.render();
      if (type === 'pref' && extra.key === 'factorModel') B.render();
      if (type === 'pref' && extra.key === 'selectedRow') U.$$('.tree-row', root).forEach(function (r) { r.classList.toggle('is-selected', r.dataset.key === S.ws.prefs.selectedRow); });
      if (type === 'session' && extra.key === 'standalone') markStandalone();
    });
  };
})();

/* ─────────────────────────────────────────────────────────────────────────
   Portfolio Analytics · shell
   hash routing (workspaces, a workspace, the sleeve repository, the
   benchmark library, the product directory), the context
   header, the comparison strip, keyboard shortcuts and the demo switches
   ───────────────────────────────────────────────────────────────────────── */
(function () {
  'use strict';
  var PA = window.PA, U = PA.util, esc = U.esc, S = PA.store, UI = PA.ui, I = U.icon;
  var shell = UI.shell = {};
  var els = {};

  /* ── routing ─────────────────────────────────────────────────────── */
  shell.go = function (hash) { if (location.hash === hash) route(); else location.hash = hash; };
  function route() {
    var h = location.hash || '#/', m;
    if ((m = h.match(/^#\/w\/([^/]+)/))) openWorkspace(decodeURIComponent(m[1]));
    else if ((m = h.match(/^#\/sleeves(?:\/([^/]+))?/))) showRepo(m[1] ? decodeURIComponent(m[1]) : null);
    else if ((m = h.match(/^#\/benchmarks(?:\/([^/]+))?/))) showBench(m[1] ? decodeURIComponent(m[1]) : null);
    else if ((m = h.match(/^#\/products(?:\/([^/]+))?/))) showProducts(m[1] ? decodeURIComponent(m[1]) : null);
    else showHome();
  }
  function showView(name) { els.home.hidden = name !== 'home'; els.ws.hidden = name !== 'ws'; els.repo.hidden = name !== 'repo'; els.bench.hidden = name !== 'bench'; els.products.hidden = name !== 'products'; }

  /* ── home ────────────────────────────────────────────────────────── */
  var homeFilter = '', cardData = null;
  function showHome() {
    if (S.ws) { S.saveNow(); S.unload(); }
    showView('home');
    document.title = 'Portfolio Analytics · Workspaces';
    els.home.innerHTML = '<header class="topbar"><a class="wordmark" href="#/"><b>Portfolio Management Group</b><span>Portfolio Analytics</span></a><span class="spacer"></span>' +
      '<a class="btn btn-ghost btn-sm" href="#/sleeves">' + I.layers + '<span>Sleeve repository</span></a><a class="btn btn-ghost btn-sm" href="#/benchmarks">' + I.chart + '<span>Benchmark library</span></a><a class="btn btn-ghost btn-sm" href="#/products">' + I.folder + '<span>Product directory</span></a><button type="button" class="btn btn-ghost btn-sm" id="home-demo" aria-haspopup="menu" aria-expanded="false">' + I.sliders + '<span>Demo</span></button><span class="user"><span class="avatar" aria-hidden="true">FB</span><span>F. Barker</span></span></header>' +
      '<div class="home-body"><div class="home-hero"><div><h1>Workspaces</h1><p>Build, test and compare multi-asset allocations. Each workspace holds its drafts, snapshots, scenarios, comparison and its cards.</p></div><button type="button" class="btn btn-primary" id="home-new">' + I.plus + '<span>New workspace</span></button></div>' +
      '<div class="home-tools"><div class="search-wrap">' + I.search + '<input type="search" id="home-search" placeholder="Find a workspace…" aria-label="Find a workspace" value="' + esc(homeFilter) + '"><kbd>/</kbd></div></div>' +
      '<div class="ws-cards" id="home-cards" aria-live="polite"><div class="ws-card skeleton" style="min-height:150px"></div><div class="ws-card skeleton" style="min-height:150px"></div><div class="ws-card skeleton" style="min-height:150px"></div></div></div>' +
      '<footer class="home-foot"><span>Portfolio Analytics · interface mockup</span><span>Data adapter: <b>' + esc(PA.api.config().adapter) + '</b></span><span>All figures are illustrative and fictional</span></footer>';
    U.$('#home-new').onclick = newWorkspace;
    U.$('#home-demo').onclick = function (e) { demoMenu(e.currentTarget); };
    U.$('#home-search').oninput = function (e) { homeFilter = e.target.value; renderCards(); };
    loadCards();
  }
  function loadCards() {
    PA.api.listWorkspaces().then(function (list) { cardData = list; renderCards(); }, function (err) { U.$('#home-cards').innerHTML = UI.alert('error', '<b>Could not load workspaces.</b> ' + esc(err.message || ''), 'Retry'); U.$('#home-cards [data-alert-action]').onclick = loadCards; });
  }
  function renderCards() {
    var root = U.$('#home-cards'); if (!root || !cardData) return;
    var q = homeFilter.trim().toLowerCase(), list = cardData.filter(function (w) { return !q || (w.name + ' ' + w.description + ' ' + w.owner).toLowerCase().indexOf(q) >= 0; });
    root.innerHTML = list.map(function (w) {
      return '<button type="button" class="ws-card" data-id="' + esc(w.id) + '"><h3>' + esc(w.name) + '</h3><p class="meta" style="margin:0">' + esc(w.description || '') + '</p>' +
        '<div class="members">' + w.members.map(function (m) { return '<span><span class="dot" style="background:var(--' + esc(m.color) + ')"></span>' + esc(m.name) + (m.kind === 'snapshot' ? ' <span class="tag tag-info" style="font-size:9px">Snap</span>' : m.kind === 'sleeve' ? ' <span class="tag tag-sleeve" style="font-size:9px">Sleeve</span>' : '') + '</span>'; }).join('') + (w.members.length ? '' : '<span class="faint">No allocations yet</span>') + '</div>' +
        '<div class="foot"><span><b class="ccy-code" data-tip="Reporting currency">' + esc(w.currency || 'USD') + '</b> · ' + esc(w.owner) + ' · ' + w.cards + ' card' + (w.cards === 1 ? '' : 's') + ' · ' + w.scenarios + ' scenario' + (w.scenarios === 1 ? '' : 's') + (w.activeScenario ? ' · <b>' + esc(w.activeScenario) + '</b> active' : '') + '</span><span>Updated ' + esc(U.fmt.relative(w.updatedAt)) + '</span></div></button>';
    }).join('') + '<button type="button" class="ws-card is-new" id="home-new-card">' + I.plus + '<span>New workspace</span></button>';
    if (!list.length && q) root.innerHTML = '<div class="empty" style="grid-column:1/-1">' + I.search + '<h3>No workspace matches “' + esc(homeFilter) + '”</h3><p>Try another name, or create a new workspace.</p></div>';
    U.on(root, 'click', '.ws-card[data-id]', function (e, b) { shell.go('#/w/' + encodeURIComponent(b.dataset.id)); });
    var nc = U.$('#home-new-card'); if (nc) nc.onclick = newWorkspace;
  }
  function newWorkspace() { UI.dialogs.newWorkspace(); }

  /* ── sleeve repository ───────────────────────────────────────────── */
  function showRepo(id) {
    if (S.ws) { S.saveNow(); S.unload(); }
    showView('repo');
    UI.sleeves.showRepository(els.repo, id);
  }

  /* ── benchmark library ───────────────────────────────────────────── */
  function showBench(id) {
    if (S.ws) { S.saveNow(); S.unload(); }
    showView('bench');
    UI.benchmarks.showLibrary(els.bench, id);
  }

  /* ── product directory ───────────────────────────────────────────── */
  function showProducts(id) {
    if (S.ws) { S.saveNow(); S.unload(); }
    showView('products');
    UI.products.show(els.products, id);
  }

  /* ── workspace ───────────────────────────────────────────────────── */
  var loadingId = null;
  function openWorkspace(id) {
    if (S.ws && S.ws.id === id) { showView('ws'); return; }
    loadingId = id; showView('ws');
    els.head.innerHTML = '<div class="crumbs"><a href="#/">Workspaces</a><span class="sep">/</span></div><div class="ws-title"><span class="skeleton" style="width:220px;height:22px;display:inline-block">&nbsp;</span></div>';
    els.compare.innerHTML = '';
    PA.api.getWorkspace(id).then(function (ws) { if (loadingId !== id) return; S.load(ws); }, function (err) { if (loadingId !== id) return; els.compare.innerHTML = UI.alert('error', '<b>Could not open this workspace.</b> ' + esc(err.message || ''), 'Back to workspaces'); els.compare.querySelector('[data-alert-action]').onclick = function () { shell.go('#/'); }; });
  }

  /* ── header ──────────────────────────────────────────────────────── */
  function renderHeader() {
    var w = S.ws; if (!w) return;
    document.title = w.name + ' · Portfolio Analytics';
    els.head.innerHTML =
      '<button type="button" class="btn btn-icon btn-ghost menu-btn keep" id="rail-open" aria-label="Open the portfolio builder" data-tip="Portfolio builder">' + I.menu + '</button>' +
      '<div class="crumbs"><a href="#/">Workspaces</a><span class="sep">/</span></div><div class="ws-title"><input type="text" id="ws-name" value="' + esc(w.name) + '" aria-label="Workspace name" maxlength="80" spellcheck="false"></div><span class="spacer"></span>' +
      '<div class="head-status"><span class="status" id="save-status"></span></div>' +
      '<div class="actions"><button type="button" class="btn btn-icon btn-ghost" id="undo-btn" aria-label="Undo" data-tip="Undo (⌘Z)">' + I.undo + '</button><button type="button" class="btn btn-icon btn-ghost" id="redo-btn" aria-label="Redo" data-tip="Redo (⇧⌘Z)">' + I.redo + '</button>' +
      '<button type="button" class="btn btn-sm" id="add-alloc" aria-label="Add allocation" data-tip="Add allocation: blank, template, clone or import">' + I.plus + '<span class="btn-text">Add allocation</span></button>' +
      '<button type="button" class="btn btn-icon btn-ghost" id="export-btn" aria-label="Export" data-tip="Export the visible analysis">' + I.export + '</button><button type="button" class="btn btn-icon btn-ghost keep" id="more-btn" aria-label="More" aria-haspopup="menu" aria-expanded="false">' + I.moreH + '</button></div>';
    U.$('#rail-open').onclick = function () { S.setSession('railOpen', !S.session.railOpen); };
    var nameIn = U.$('#ws-name');
    nameIn.onchange = function () { var v = nameIn.value.trim(); if (!v) { nameIn.value = w.name; return; } if (v !== w.name) { S.update('Workspace renamed to “' + v + '”', function (ws) { ws.name = v; }, { force: true, refresh: false, type: 'rename' }); document.title = v + ' · Portfolio Analytics'; } };
    nameIn.onkeydown = function (e) { if (e.key === 'Enter') { e.preventDefault(); nameIn.blur(); } if (e.key === 'Escape') { nameIn.value = w.name; nameIn.blur(); } };
    U.$('#undo-btn').onclick = S.undo; U.$('#redo-btn').onclick = S.redo;
    U.$('#add-alloc').onclick = function () { UI.dialogs.newAllocation(); };
    U.$('#export-btn').onclick = function () { UI.dialogs.exportDialog(); };
    U.$('#more-btn').onclick = function (e) {
      UI.menu(e.currentTarget, [
        { label: 'Add allocation', icon: I.plus, onClick: function () { UI.dialogs.newAllocation(); } },
        { label: 'Snapshot the active allocation', icon: I.camera, disabled: !S.active(), onClick: function () { UI.dialogs.snapshot(S.active()); } },
        { label: 'Add card', icon: I.table, onClick: function () { S.setSession('addCardOpen', true); } },
        { label: 'Versions & activity', icon: I.history, onClick: function () { UI.dialogs.history(); } },
        { label: 'Reporting currency… (' + S.ws.currency + ')', icon: I.reset, onClick: function () { UI.dialogs.changeCurrency(); } },
        { label: 'Attribution conventions…' + (UI.chain.departures(S.ws).length ? ' (' + UI.chain.departures(S.ws).length + ' changed)' : ''), icon: I.sliders, onClick: function () { UI.chain.conventions(); } },
        { label: 'Export', icon: I.export, onClick: function () { UI.dialogs.exportDialog(); } },
        { sep: true }, { head: 'Layout' },
        { label: 'Pack cards into a tidy layout', icon: I.reset, onClick: function () { PA.cards.resetLayout(); } },
        { label: 'Show every card’s data table', icon: I.table, onClick: function () { S.ws.cards.forEach(function (cd) { if (PA.cards.types[cd.type].dataTable) S.updateCard(cd.id, { showData: true }); }); } },
        { label: 'Hide data tables', icon: I.eyeOff, onClick: function () { S.ws.cards.forEach(function (cd) { if (cd.showData) S.updateCard(cd.id, { showData: false }); }); } },
        { label: 'Show method notes on every card', icon: S.ws.prefs.showNotes ? I.check : '<span class="menu-blank" aria-hidden="true"></span>', onClick: function () { S.setPref('showNotes', !S.ws.prefs.showNotes); U.announce(S.ws.prefs.showNotes ? 'Method notes shown on every card' : 'Method notes closed'); } },
        { sep: true },
        { label: 'Sleeve repository', icon: I.layers, onClick: function () { shell.go('#/sleeves'); } },
        { label: 'Benchmark library', icon: I.chart, onClick: function () { shell.go('#/benchmarks'); } },
        { label: 'Product directory', icon: I.folder, onClick: function () { shell.go('#/products'); } },
        { label: 'Add products from returns…', icon: I.paste, onClick: function () { UI.importer.open({ text: '' }); } },
        { label: 'Keyboard shortcuts', icon: I.keyboard, kbd: '?', onClick: function () { UI.dialogs.shortcuts(); } },
        { label: 'Demo controls', icon: I.sliders, onClick: function () { demoMenu(U.$('#more-btn')); } },
        { sep: true },
        { label: 'Back to workspaces', icon: I.folder, onClick: function () { shell.go('#/'); } }
      ], { align: 'end' });
    };
    renderSaveStatus(); renderUndo();
  }
  function renderUndo() {
    var u = U.$('#undo-btn'), r = U.$('#redo-btn'); if (!u) return;
    u.disabled = !S.canUndo(); r.disabled = !S.canRedo();
    var past = S.session.history.past, fut = S.session.history.future;
    u.setAttribute('data-tip', past.length ? 'Undo ' + esc(past[past.length - 1].label) + ' (⌘Z)' : 'Nothing to undo');
    r.setAttribute('data-tip', fut.length ? 'Redo ' + esc(fut[fut.length - 1].label) + ' (⇧⌘Z)' : 'Nothing to redo');
  }
  function renderSaveStatus() {
    var el = U.$('#save-status'); if (!el) return;
    var s = S.session.save; el.className = 'status';
    if (s.state === 'saving' || s.state === 'pending') { el.classList.add('is-saving'); el.innerHTML = '<span class="status-text">Saving…</span>'; el.removeAttribute('data-tip'); }
    else if (s.state === 'failed') { el.classList.add('is-failed'); el.innerHTML = '<span>Not saved</span> <button type="button" class="btn-link" id="save-retry" style="text-transform:none;letter-spacing:0;font-size:12px">Retry</button>'; el.setAttribute('data-tip', 'The last change is kept in this page but has not been stored. ' + esc(s.error && s.error.message || '')); U.$('#save-retry').onclick = function () { S.saveNow(); }; }
    else { el.classList.add('is-saved'); el.innerHTML = '<span class="status-text">Saved</span>'; el.setAttribute('data-tip', 'Autosaved ' + esc(s.at ? U.fmt.dateTime(s.at) : '')); }
  }

  /* ── comparison strip ────────────────────────────────────────────── */
  function renderCompare() {
    var w = S.ws; if (!w) return;
    var members = S.members(), active = w.comparison.activeId;
    els.compare.innerHTML = '<span class="eyebrow">Comparing</span>' + members.map(function (a) {
      return '<div class="member' + (a.id === active ? ' is-active' : '') + '" data-id="' + esc(a.id) + '" draggable="true" tabindex="0" role="button" aria-label="' + esc(a.name) + (a.id === active ? ', editing' : ', press to edit') + '"><span class="dot" style="background:' + UI.colorOf(a) + '"></span><b>' + esc(a.name) + '</b>' + UI.kindTag(a) + '<button type="button" class="mbtn" aria-label="Options for ' + esc(a.name) + '" aria-haspopup="menu" aria-expanded="false" data-menu="' + esc(a.id) + '">' + I.more + '</button></div>';
    }).join('') + standaloneChip() + levelChips() + '<button type="button" class="btn btn-sm add-member" id="add-member"' + (members.length >= 6 ? ' disabled data-tip="A comparison holds up to six allocations"' : '') + '>' + I.plus + '<span>Add</span></button>' + (members.length >= 6 ? '<span class="compare-note">6 of 6 · remove one to add another</span>' : '') + (members.length ? '' : '<span class="faint small">Nothing in the comparison yet.</span>');
    var am = U.$('#add-member'); if (am) am.onclick = function () { addMemberMenu(am); };
  }
  /** The temporary stand-alone category: shown after the comparison, closed with its own button. */
  function standaloneChip() {
    var x = S.standalone(); if (!x) return '';
    return '<div class="member is-temp" data-standalone tabindex="-1"><span class="dot" style="background:' + UI.colorOf(x) + '"></span><b>' + esc(x.name) + '</b>' + UI.kindTag(x) + '<button type="button" class="mbtn" data-standalone-close aria-label="Stop showing ' + esc(x.name) + ' on its own" data-tip="Stop showing this category on its own (Esc in the rail)">' + I.close + '</button></div>';
  }
  /** Derived chain levels: shown after the comparison while levels are on; one close button turns them all off. */
  function levelChips() {
    return S.levels().map(function (x) { return '<div class="member is-temp is-level" data-level="' + esc(x.id) + '" tabindex="-1"><span class="dot" style="background:' + UI.colorOf(x) + '"></span><b>' + esc(x.name) + '</b>' + UI.kindTag(x) + '<button type="button" class="mbtn" data-level-close aria-label="Stop showing chain levels" data-tip="Stop showing chain levels in the comparison">' + I.close + '</button></div>'; }).join('');
  }
  function wireCompare() {
    U.on(els.compare, 'click', '[data-standalone-close]', function () { S.setStandalone(null); var n = document.querySelector('#tree .tree-row.is-selected .tname'); if (n) n.focus(); });
    U.on(els.compare, 'click', '[data-level-close]', function () { S.setPref('showLevels', 'off'); U.announce('Chain levels hidden'); var b = els.compare.querySelector('.member.is-active'); if (b) b.focus(); });
    U.on(els.compare, 'click', '[data-menu]', function (e, b) { memberMenu(b, b.dataset.menu); });
    U.on(els.compare, 'click', '.member', function (e, m) { if (e.target.closest('[data-menu]') || m.hasAttribute('data-standalone') || m.hasAttribute('data-level')) return; setActive(m.dataset.id); });
    U.on(els.compare, 'keydown', '.member', function (e, m) { if ((e.key === 'Enter' || e.key === ' ') && e.target === m) { e.preventDefault(); setActive(m.dataset.id); } });
    var dragId = null;
    U.on(els.compare, 'dragstart', '.member', function (e, m) { dragId = m.dataset.id; m.classList.add('is-dragging'); e.dataTransfer.effectAllowed = 'move'; });
    U.on(els.compare, 'dragend', '.member', function (e, m) { m.classList.remove('is-dragging'); U.$$('.member', els.compare).forEach(function (x) { x.classList.remove('is-dropover'); }); });
    U.on(els.compare, 'dragover', '.member', function (e, m) { e.preventDefault(); m.classList.add('is-dropover'); });
    U.on(els.compare, 'dragleave', '.member', function (e, m) { m.classList.remove('is-dropover'); });
    U.on(els.compare, 'drop', '.member', function (e, m) { e.preventDefault(); if (dragId && dragId !== m.dataset.id) moveMember(dragId, m.dataset.id); });
  }
  function setActive(id) { if (S.ws.comparison.activeId === id) return; var a = S.allocation(id); S.update('Editing switched to ' + a.name, function (ws) { ws.comparison.activeId = id; }, { refresh: false, activity: false, force: true }); U.announce('Now editing ' + a.name); }
  function moveMember(id, beforeId) { S.update('Comparison reordered', function (ws) { var m = ws.comparison.members.filter(function (x) { return x !== id; }); var i = m.indexOf(beforeId); if (i < 0) i = m.length; m.splice(i, 0, id); ws.comparison.members = m; }, { type: 'member' }); }
  function memberMenu(btn, id) {
    var a = S.allocation(id), members = S.ws.comparison.members, i = members.indexOf(id);
    if (a.kind === 'sleeve') return UI.sleeves.refresh().then(function () { sleeveMenu(btn, a, members, i); });
    var lv = S.ws.prefs.showLevels || 'off', shown = lv === 'all' || (lv === 'active' && a.id === S.ws.comparison.activeId);
    UI.menu(btn, [{ head: a.name }, { label: 'Edit in builder', icon: I.sliders, disabled: a.id === S.ws.comparison.activeId, onClick: function () { setActive(id); } }, { label: 'Rename', onClick: function () { UI.dialogs.renameAllocation(a); } }, { label: 'Assign benchmark…', onClick: function () { UI.dialogs.assignBenchmark(a); } }, { label: 'Decision chain…', icon: I.chart, disabled: a.kind === 'sleeve', onClick: function () { UI.chain.open(a); } },
      { label: shown ? 'Hide chain levels' : 'Show chain levels', icon: I.layers, disabled: !a.chain, onClick: function () { if (shown) S.setPref('showLevels', 'off'); else { if (a.id !== S.ws.comparison.activeId && lv !== 'all') S.setPref('showLevels', 'all'); else S.setPref('showLevels', lv === 'all' ? 'all' : 'active'); } } }, { sep: true },
      { label: 'Move left', icon: I.chevronLeft, disabled: i <= 0, onClick: function () { moveMember(id, members[i - 1]); } }, { label: 'Move right', icon: I.chevron, disabled: i >= members.length - 1, onClick: function () { moveMember(id, members[i + 2] || null); } }, { sep: true },
      a.kind === 'snapshot' ? { label: 'Create draft from snapshot', icon: I.copy, onClick: function () { UI.dialogs.draftFromSnapshot(a); } } : { label: 'Snapshot this allocation', icon: I.camera, onClick: function () { UI.dialogs.snapshot(a); } },
      { label: 'Remove from comparison', icon: I.close, onClick: function () { removeMember(id); } }, { label: 'Delete allocation…', icon: I.trash, onClick: function () { deleteAllocation(a); } }], { align: 'end' });
  }
  function sleeveMenu(btn, a, members, i) {
    var id = a.id, s = UI.sleeves.known[a.sleeve.id], newer = UI.sleeves.newerVersion(a);
    UI.menu(btn, [{ head: a.name + ' · sleeve v' + a.sleeve.version }, { label: 'Show in builder', icon: I.sliders, disabled: a.id === S.ws.comparison.activeId, onClick: function () { setActive(id); } }, { label: 'Open in repository', icon: I.folder, onClick: function () { shell.go('#/sleeves/' + encodeURIComponent(a.sleeve.id)); } },
      { label: newer ? 'Show v' + newer.v + ' (latest)' : 'Showing the latest version', icon: I.reset, disabled: !newer, onClick: function () { UI.sleeves.setMemberVersion(a, s, newer); } }, { label: 'Make an editable copy', icon: I.copy, onClick: function () { UI.dialogs.draftFromSnapshot(a); } }, { label: 'Assign benchmark…', onClick: function () { UI.dialogs.assignBenchmark(a); } }, { sep: true },
      { label: 'Move left', icon: I.chevronLeft, disabled: i <= 0, onClick: function () { moveMember(id, members[i - 1]); } }, { label: 'Move right', icon: I.chevron, disabled: i >= members.length - 1, onClick: function () { moveMember(id, members[i + 2] || null); } }, { sep: true },
      { label: 'Remove from comparison', icon: I.close, onClick: function () { removeMember(id); } }, { label: 'Remove from workspace…', icon: I.trash, onClick: function () { deleteAllocation(a); } }], { align: 'end' });
  }
  function removeMember(id) {
    var a = S.allocation(id);
    S.update(a.name + ' removed from the comparison', function (ws) { ws.comparison.members = ws.comparison.members.filter(function (x) { return x !== id; }); if (ws.comparison.activeId === id) ws.comparison.activeId = ws.comparison.members[0] || null; if (ws.comparison.referencePortfolioId === id) { ws.comparison.referencePortfolioId = null; if (ws.comparison.referenceMode === 'portfolio') ws.comparison.referenceMode = 'shared'; } ws.prefs.emphasis = ws.prefs.emphasis.filter(function (x) { return x !== id; }); }, { type: 'member' });
    UI.toast(a.name + ' removed from the comparison. The allocation itself is kept.', { action: { label: 'Undo', fn: S.undo } });
  }
  function deleteAllocation(a) {
    UI.confirm({ title: (a.kind === 'sleeve' ? 'Remove ' : 'Delete ') + a.name + '?', sub: a.kind === 'sleeve' ? 'This removes the sleeve column from the workspace. The sleeve stays in the repository.' : 'This removes the allocation and its history from the workspace. Snapshots taken from it are kept.', confirmLabel: a.kind === 'sleeve' ? 'Remove' : 'Delete', danger: true }).then(function (ok) {
      if (!ok) return;
      S.update(a.name + ' deleted', function (ws) { ws.allocations = ws.allocations.filter(function (x) { return x.id !== a.id; }); ws.comparison.members = ws.comparison.members.filter(function (x) { return x !== a.id; }); if (ws.comparison.activeId === a.id) ws.comparison.activeId = ws.comparison.members[0] || null; ws.scenarios.forEach(function (s) { s.scope = s.scope.filter(function (x) { return x !== a.id; }); }); ws.prefs.emphasis = ws.prefs.emphasis.filter(function (x) { return x !== a.id; }); }, { type: 'member' });
    });
  }
  function addMemberMenu(btn) {
    var w = S.ws, members = w.comparison.members, spare = w.allocations.filter(function (a) { return members.indexOf(a.id) < 0; }), items = [{ head: 'Allocations in this workspace' }];
    if (!spare.length) items.push({ label: 'Every allocation is already compared', disabled: true });
    spare.forEach(function (a) { items.push({ label: a.name + (a.kind === 'snapshot' ? ' (snapshot)' : a.kind === 'sleeve' ? ' (sleeve v' + a.sleeve.version + ')' : ''), onClick: function () { shell.addMember(a.id); } }); });
    items.push({ sep: true }, { head: 'Sleeves from the repository' }, { label: 'Compare a sleeve…', icon: I.layers, onClick: function () { UI.sleeves.pickToCompare(); } });
    items.push({ sep: true }, { head: 'Benchmarks, as fixed columns' });
    PA.data.benchmarks.forEach(function (b) { items.push({ label: b.name + (b.source === 'custom' ? ' · custom' : ''), onClick: function () { UI.dialogs.benchmarkAsMember(b); } }); });
    items.push({ sep: true }, { label: 'New allocation…', icon: I.plus, onClick: function () { UI.dialogs.newAllocation(); } });
    UI.menu(btn, items);
  }
  shell.addMember = function (id) { var a = S.allocation(id); S.update(a.name + ' added to the comparison', function (ws) { if (ws.comparison.members.indexOf(id) < 0) ws.comparison.members.push(id); if (!ws.comparison.activeId) ws.comparison.activeId = id; if (ws.prefs.emphasis.indexOf(id) < 0) ws.prefs.emphasis.push(id); }, { type: 'member' }); };

  /* ── demo switches (prototype only) ──────────────────────────────── */
  function demoMenu(anchor) {
    var c = PA.api.config();
    UI.popover(anchor, { cls: 'demo-pop', role: 'dialog', align: 'end', html: '<div class="menu-head">Demo controls · prototype only</div><label class="check"><input type="checkbox" data-demo="failSave"' + (c.failSave ? ' checked' : '') + '> Simulate save failures</label><label class="check"><input type="checkbox" data-demo="failAnalytics"' + (c.failAnalytics ? ' checked' : '') + '> Simulate analytics failures</label><label class="check"><input type="checkbox" data-demo="slow"' + (c.slow ? ' checked' : '') + '> Slow service (1.8 s)</label><div class="menu-sep"></div><button type="button" class="menu-item" data-demo-reset>' + I.reset + '<span>Reset sample data</span></button>',
      onOpen: function (el) {
        U.on(el, 'change', '[data-demo]', function (e, cb) { var o = {}; o[cb.dataset.demo] = cb.checked; PA.api.configure(o); if (cb.dataset.demo === 'failAnalytics' && !cb.checked && S.ws) S.refresh(); if (cb.dataset.demo === 'failSave' && !cb.checked && S.ws) S.saveNow(); });
        U.on(el, 'click', '[data-demo-reset]', function () { UI.closePopover(); UI.confirm({ title: 'Reset sample data?', sub: 'Every workspace, sleeve and saved card returns to its shipped state. Your edits in this browser are discarded.', confirmLabel: 'Reset', danger: true }).then(function (ok) { if (!ok) return; PA.api.resetSampleData().then(function () { PA.cards.invalidateSavedCards(); if (S.ws) { var id = S.ws.id; S.unload(); location.hash = '#/'; setTimeout(function () { shell.go('#/w/' + encodeURIComponent(id)); }, 50); } else route(); UI.toast('Sample data reset.'); }); }); });
      } });
  }

  /* ── keyboard shortcuts ──────────────────────────────────────────── */
  function onKey(e) {
    var tag = (e.target.tagName || '').toLowerCase(), typing = tag === 'input' || tag === 'textarea' || tag === 'select' || e.target.isContentEditable, mod = e.metaKey || e.ctrlKey;
    if (mod && e.key.toLowerCase() === 'z' && S.ws) { if (typing && tag !== 'select') return; e.preventDefault(); if (e.shiftKey) S.redo(); else S.undo(); return; }
    if (typing) return;
    if (e.key === '/') { e.preventDefault(); if (S.ws) { UI.builder.findProduct(); return; } var s = U.$('#home-search') || U.$('#repo-q'); if (s) { s.focus(); s.select(); } }
    if (e.key === '?' && S.ws) { e.preventDefault(); UI.dialogs.shortcuts(); }
    if (e.key === 'b' && S.ws && !mod) { e.preventDefault(); UI.builder.toggleCollapsed(); }
    if (e.key === 's' && S.ws && !mod) { e.preventDefault(); S.setSession('drawerOpen', !S.session.drawerOpen); }
    if (e.key === 'a' && S.ws && !mod) { e.preventDefault(); S.setSession('addCardOpen', !S.session.addCardOpen); }
  }

  /* ── wiring ──────────────────────────────────────────────────────── */
  shell.init = function () {
    els.home = U.$('#view-home'); els.ws = U.$('#view-ws'); els.repo = U.$('#view-repo'); els.bench = U.$('#view-bench'); els.products = U.$('#view-products'); els.head = U.$('#ws-head'); els.compare = U.$('#ws-compare');
    window.addEventListener('hashchange', route);
    document.addEventListener('keydown', onKey);
    wireCompare();
    S.subscribe(function (type, extra) {
      if (!S.ws) return;
      if (type === 'load') { renderHeader(); renderCompare(); applyLayout(); }
      if (type === 'update' || type === 'undo' || type === 'redo') { renderHeader(); renderCompare(); }
      if (type === 'save') renderSaveStatus();
      if (type === 'session' && extra.key === 'railOpen') applyLayout();
      if (type === 'session' && extra.key === 'standalone') { renderCompare(); var t = els.compare.querySelector('[data-standalone]'); if (t) els.compare.scrollLeft = Math.max(0, t.offsetLeft + t.offsetWidth - els.compare.clientWidth + 120); }
      if (type === 'pref' && extra.key === 'railCollapsed') applyLayout();
      if (type === 'pref' && extra.key === 'showLevels') renderCompare();
    });
    route();
  };
  function applyLayout() {
    var ws = els.ws;
    ws.classList.toggle('rail-open', !!S.session.railOpen); ws.classList.toggle('rail-collapsed', !!(S.ws && S.ws.prefs.railCollapsed));
    var scrim = U.$('#rail-scrim');
    if (S.session.railOpen) { if (!scrim) { scrim = U.html('<div class="rail-scrim" id="rail-scrim"></div>'); scrim.onclick = function () { S.setSession('railOpen', false); }; ws.appendChild(scrim); } } else if (scrim) scrim.remove();
  }
  shell.showHome = showHome;
})();

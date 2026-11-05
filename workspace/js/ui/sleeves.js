/* ─────────────────────────────────────────────────────────────────────────
   Portfolio Analytics · sleeves
   Create a sleeve from a category or a product selection (weights rescaled
   to 100), apply a sleeve to a category, add a sleeve to the workspace as its
   own comparison column (to see its analytics), and the shared repository.
   ───────────────────────────────────────────────────────────────────────── */
(function () {
  'use strict';
  var PA = window.PA, U = PA.util, esc = U.esc, S = PA.store, UI = PA.ui, D = PA.data, E = PA.engine, I = U.icon, F = U.fmt, V = UI.viz;
  var SL = UI.sleeves = {};
  var catOpts = function (sel) { return D.taxonomy.map(function (c) { return '<option value="' + c.id + '"' + (sel === c.id ? ' selected' : '') + '>' + esc(c.name) + '</option>'; }).join(''); };
  var latest = function (s) { return s.versions[s.versions.length - 1]; };
  /* Last known state of each repository sleeve, so the builder can say when a
     compared sleeve has a newer version without waiting for the service. */
  SL.known = {};
  var remember = function (list) { (Array.isArray(list) ? list : [list]).forEach(function (s) { SL.known[s.id] = s; }); return list; };
  SL.latest = latest;

  /* ── create ──────────────────────────────────────────────────────── */
  /** opts: {alloc, categoryId} or {alloc, holdingIds}; compare:true preselects
      “Save and add to workspace”, which also adds the new sleeve as a column. */
  SL.create = function (opts) {
    var a = opts.alloc, source = opts.categoryId ? E.productsIn(a, opts.categoryId) : a.holdings.filter(function (h) { return opts.holdingIds.indexOf(h.id) >= 0; });
    if (!source.length) { UI.toast('Choose at least one product.'); return; }
    var cats = E.categoriesOf(source), byCat = {}; source.forEach(function (h) { var c = E.categoryOf(h.instrumentId); byCat[c] = (byCat[c] || 0) + h.weight; });
    var dominant = (opts.categoryId && D.taxonomyById[opts.categoryId] ? opts.categoryId : null) || Object.keys(byCat).sort(function (x, y) { return byCat[y] - byCat[x]; })[0], mixed = cats.length > 1;
    var sleeveH = E.sleeveHoldings(source), total = U.sum(source, function (h) { return h.weight; });
    var def = opts.categoryId ? D.categoryById[opts.categoryId].short + ' · ' + a.name : a.name + ' selection';
    var body = '<div class="dlg-grid"><div class="field"><label for="sl-name">Sleeve name</label><input type="text" id="sl-name" value="' + esc(def) + '" maxlength="80"></div><div class="field"><label for="sl-cat">Filed under category</label><select id="sl-cat">' + catOpts(dominant) + '</select>' + (mixed ? '<span class="field-hint"><span class="tag tag-warn">Mixed</span> The selection spans ' + cats.map(function (c) { return D.categoryById[c].short; }).join(', ') + '. Choose the category to file it under.</span>' : '') + '</div>' +
      '<div class="field wide"><label for="sl-note">Note</label><input type="text" id="sl-note" placeholder="Optional, e.g. the implementation agreed at the October IC" maxlength="140"></div>' +
      '<div class="wide"><div class="label" style="margin-bottom:6px">Products · ' + source.length + ' · ' + F.num(total) + '% of ' + esc(a.name) + ' rescaled to 100%</div>' + V.table([{ label: 'Product' }, { label: 'Category' }, { label: 'In portfolio', num: true }, { label: 'In sleeve', num: true }], source.map(function (h, i) { var ins = D.instrumentById[h.instrumentId]; return { cells: [esc(ins.name) + ' <span class="faint small">' + esc(ins.identifier) + '</span>', esc(D.categoryOf(h.instrumentId).short), F.num(h.weight) + '%', F.num(sleeveH[i].weight, 2) + '%'] }; }).concat([{ cls: 'total', cells: ['Total', '', F.num(total) + '%', '100.00%'] }]), { maxHeight: '240px' }) + '</div>' +
      (opts.categoryId ? '<label class="check wide"><input type="checkbox" id="sl-tag" checked> Tag these products in ' + esc(a.name) + ' as coming from this sleeve</label>' : '') + '</div>';
    var full = S.ws.comparison.members.length >= 6;
    UI.openDialog({ title: opts.compare ? 'Save as sleeve and compare' : 'Create sleeve', sub: 'A sleeve is a reusable subset of a portfolio. It is saved to the shared repository, versioned, and can be applied to a category in any allocation' + (full ? '.' : ', or added to this workspace as its own column so you can see its analytics.'), body: body, wide: true, initialFocus: '#sl-name',
      actions: [{ label: 'Cancel', ghost: true }, { label: 'Save sleeve', primary: !opts.compare, close: false, onClick: function (c) { return save(c, false); } }, { label: full ? 'Save and add (comparison full)' : 'Save and add to workspace', primary: !!opts.compare, close: false, disabled: full, onClick: function (c) { return save(c, true); } }] });
    function save(c, andCompare) {
      var name = U.$('#sl-name', c.el).value.trim(); if (!name) { U.$('#sl-name', c.el).setAttribute('aria-invalid', 'true'); return false; }
      var catId = U.$('#sl-cat', c.el).value, note = U.$('#sl-note', c.el).value.trim(), tag = U.$('#sl-tag', c.el) && U.$('#sl-tag', c.el).checked, now = new Date().toISOString();
      var sleeve = { id: U.uid('slv'), name: name, categoryId: catId, mixed: mixed, archived: false, createdBy: 'F. Barker', createdAt: now, note: note || (opts.categoryId ? 'Created from the ' + D.categoryById[opts.categoryId].name + ' category of ' + a.name : 'Created from a product selection in ' + a.name), source: { workspaceId: S.ws.id, workspaceName: S.ws.name, allocationId: a.id, allocationName: a.name }, versions: [{ v: 1, createdAt: now, note: 'Initial', holdings: sleeveH }] };
      U.$$('.dlg-actions .btn', c.el).forEach(function (b) { b.disabled = true; });
      PA.api.saveSleeve(sleeve).then(function (saved) {
        remember(saved || sleeve);
        S.update('Sleeve “' + name + '” created from ' + a.name, function (ws) { if (tag) { var x = ws.allocations.filter(function (y) { return y.id === a.id; })[0]; x.holdings.forEach(function (h) { if (source.some(function (q) { return q.id === h.id; })) h.sleeveRef = { sleeveId: sleeve.id, version: 1, name: name }; }); } }, { type: 'sleeve', refresh: false, force: true, detail: source.length + ' products, filed under ' + D.categoryById[catId].name });
        S.setSelectMode(false); c.close(true);
        if (andCompare) SL.addToWorkspace(sleeve, sleeve.versions[0]);
        else UI.toast('Sleeve “' + name + '” saved to the repository.', { action: { label: 'Open repository', fn: function () { UI.shell.go('#/sleeves/' + encodeURIComponent(sleeve.id)); } } });
      }, function (err) { U.$$('.dlg-actions .btn', c.el).forEach(function (b) { b.disabled = false; }); UI.toast('Could not save the sleeve: ' + (err.message || ''), { kind: 'error' }); });
      return false;
    }
  };

  /* ── a sleeve as a comparison column ─────────────────────────────── */
  var refOf = function (alloc) { return alloc && alloc.sleeve ? alloc.sleeve : null; };
  /** The holdings and targets of a sleeve version as a stand-alone, fully
      invested portfolio: weights sum to 100 and every category is implemented. */
  function asPortfolio(sleeve, ver) {
    var ref = { sleeveId: sleeve.id, version: ver.v, name: sleeve.name };
    var holdings = ver.holdings.map(function (h) { return { id: U.uid('h'), instrumentId: h.instrumentId, weight: h.weight, sleeveRef: ref }; });
    return { holdings: holdings };
  }
  /**
   * Add a sleeve version to the open workspace as a read-only allocation
   * (kind 'sleeve') and to the comparison, so every card shows its analytics.
   * The column is pinned to that version; a newer version can be loaded later.
   */
  SL.addToWorkspace = function (sleeve, ver, opts) {
    if (!S.ws) return null;
    remember(sleeve); ver = ver || latest(sleeve); opts = opts || {};
    var ws = S.ws, members = ws.comparison.members;
    var existing = ws.allocations.filter(function (x) { var r = refOf(x); return x.kind === 'sleeve' && r && r.id === sleeve.id && r.version === ver.v; })[0];
    if (existing) {
      if (members.indexOf(existing.id) >= 0) { UI.toast('“' + existing.name + '” v' + ver.v + ' is already in the comparison.'); return existing; }
      if (members.length >= 6) { UI.toast('The comparison holds up to six allocations. Remove one to compare “' + existing.name + '”.', { kind: 'error' }); return existing; }
      UI.shell.addMember(existing.id); UI.toast('“' + existing.name + '” v' + ver.v + ' is back in the comparison.'); return existing;
    }
    var full = members.length >= 6, id = U.uid('al'), port = asPortfolio(sleeve, ver), now = new Date().toISOString();
    var alloc = { id: id, name: sleeve.name, kind: 'sleeve', color: UI.dialogs.nextColor(), benchmarkId: null, leverage: false, history: { basis: 'backtest', inception: now.slice(0, 7) }, edited: false,
      sleeve: { id: sleeve.id, version: ver.v, name: sleeve.name, categoryId: sleeve.categoryId, mixed: !!sleeve.mixed }, capturedAt: ver.createdAt, note: 'Sleeve from the repository, v' + ver.v + (ver.note ? ' · ' + ver.note : ''), categories: port.categories, holdings: port.holdings };
    S.update('Sleeve “' + sleeve.name + '” v' + ver.v + ' added to the workspace', function (w) { w.allocations.push(alloc); if (!full) { w.comparison.members.push(id); if (w.prefs.emphasis.indexOf(id) < 0) w.prefs.emphasis.push(id); } if (!w.comparison.activeId) w.comparison.activeId = id; }, { type: 'sleeve', detail: ver.holdings.length + ' products · weights sum to 100%' });
    if (opts.makeActive) S.update('Editing switched to ' + alloc.name, function (w) { w.comparison.activeId = id; }, { refresh: false, activity: false, force: true, history: false });
    if (full) UI.toast('“' + sleeve.name + '” was added to the workspace, but the comparison already holds six. Remove a column, then add it from the Add menu.', { kind: 'error' });
    else UI.toast('“' + sleeve.name + '” v' + ver.v + ' added to the comparison. Every card now shows its analytics.', { action: { label: 'Show in builder', fn: function () { S.update('Editing switched to ' + alloc.name, function (w) { w.comparison.activeId = id; }, { refresh: false, activity: false, force: true }); } } });
    return alloc;
  };
  /** Load another version of the sleeve into an existing sleeve column. */
  SL.setMemberVersion = function (alloc, sleeve, ver) {
    var port = asPortfolio(sleeve, ver);
    S.update('“' + alloc.name + '” updated to sleeve v' + ver.v, function (w) { var x = w.allocations.filter(function (y) { return y.id === alloc.id; })[0]; x.holdings = port.holdings; x.categories = port.categories; x.sleeve.version = ver.v; x.sleeve.mixed = !!sleeve.mixed; x.capturedAt = ver.createdAt; x.note = 'Sleeve from the repository, v' + ver.v + (ver.note ? ' · ' + ver.note : ''); }, { type: 'sleeve' });
    UI.toast('“' + alloc.name + '” now shows v' + ver.v + '.', { action: { label: 'Undo', fn: S.undo } });
  };
  /** Newer version of a compared sleeve, if the repository has one. */
  SL.newerVersion = function (alloc) { var r = refOf(alloc), s = r && SL.known[r.id]; if (!s) return null; var l = latest(s); return l.v > r.version ? l : null; };
  /** Fetch the repository into SL.known; resolves with the list. */
  SL.refresh = function () { return PA.api.listSleeves().then(remember); };
  /** Pick a sleeve from the repository and add it as a column. */
  SL.pickToCompare = function () {
    SL.refresh().then(function (list) {
      var live = list.filter(function (s) { return !s.archived; });
      if (!live.length) { UI.toast('The sleeve repository is empty. Create a sleeve from a category or a selection first.'); return; }
      var body = '<div class="dlg-grid"><div class="field"><label for="pc-sleeve">Sleeve</label><select id="pc-sleeve">' + D.taxonomy.map(function (c) { var inCat = live.filter(function (s) { return s.categoryId === c.id; }); return inCat.length ? '<optgroup label="' + esc(c.name) + '">' + inCat.map(function (s) { return '<option value="' + s.id + '">' + esc(s.name) + (s.mixed ? ' (mixed)' : '') + '</option>'; }).join('') + '</optgroup>' : ''; }).join('') + '</select></div><div class="field"><label for="pc-version">Version</label><select id="pc-version"></select></div><div class="wide" id="pc-preview"></div></div>';
      UI.openDialog({ title: 'Compare a sleeve', sub: 'Adds the sleeve to this workspace as its own column, fully invested at the sleeve’s weights, so every card shows its analytics. The column is read-only; edit the sleeve in the repository.', body: body, wide: true, initialFocus: '#pc-sleeve',
        onOpen: function (dlg) {
          var refresh = function () {
            var s = live.filter(function (x) { return x.id === U.$('#pc-sleeve', dlg).value; })[0], vs = U.$('#pc-version', dlg);
            if (vs.dataset.for !== s.id) { vs.dataset.for = s.id; vs.innerHTML = s.versions.slice().reverse().map(function (v) { return '<option value="' + v.v + '">v' + v.v + ' · ' + esc(F.date(v.createdAt)) + ' · ' + esc(v.note) + '</option>'; }).join(''); }
            var ver = s.versions.filter(function (v) { return v.v === Number(vs.value); })[0];
            U.$('#pc-preview', dlg).innerHTML = V.table([{ label: 'Product' }, { label: 'Category' }, { label: 'Weight', num: true }], ver.holdings.map(function (h) { var ins = D.instrumentById[h.instrumentId]; return { cells: [esc(ins.name) + ' <span class="faint small">' + esc(ins.identifier) + '</span>', esc(D.categoryOf(h.instrumentId).short), F.num(h.weight, 2) + '%'] }; }).concat([{ cls: 'total', cells: ['Total', '', '100.00%'] }]), { maxHeight: '220px' });
          };
          dlg.querySelector('#pc-sleeve').onchange = refresh; dlg.querySelector('#pc-version').onchange = refresh; refresh();
        },
        actions: [{ label: 'Cancel', ghost: true }, { label: 'Add to the comparison', primary: true, onClick: function (c) { var s = live.filter(function (x) { return x.id === U.$('#pc-sleeve', c.el).value; })[0], ver = s.versions.filter(function (v) { return v.v === Number(U.$('#pc-version', c.el).value); })[0]; SL.addToWorkspace(s, ver); } }] });
    });
  };
  /* A sleeve chosen in the repository to compare in a workspace: carried
     across the route change and added once that workspace has loaded. */
  var pending = null;
  S.subscribe(function (type) { if (type !== 'load' || !S.ws) return; if (S.ws.allocations.some(function (x) { return x.kind === 'sleeve'; })) SL.refresh().then(function () { if (S.ws && UI.builder) UI.builder.render(); }); if (pending && pending.workspaceId === S.ws.id) { var p = pending; pending = null; setTimeout(function () { SL.addToWorkspace(p.sleeve, p.version); }, 0); } });
  function compareInWorkspace(sleeve, ver) {
    PA.api.listWorkspaces().then(function (list) {
      list = list.slice().sort(function (x, y) { return String(y.updatedAt).localeCompare(String(x.updatedAt)); });
      if (!list.length) { UI.toast('Create a workspace first.'); return; }
      UI.openDialog({ title: 'Add “' + sleeve.name + '” v' + ver.v + ' to a workspace', sub: 'The sleeve joins the workspace’s comparison as its own read-only column, fully invested at the sleeve’s weights, so every card shows its analytics.', initialFocus: '#cw-ws',
        body: '<div class="field"><label for="cw-ws">Workspace</label><select id="cw-ws">' + list.map(function (w) { return '<option value="' + esc(w.id) + '">' + esc(w.name) + ' · ' + w.members.length + ' of 6 compared</option>'; }).join('') + '</select><span class="field-hint">A full comparison keeps the sleeve in the workspace without a column until one is removed.</span></div>',
        actions: [{ label: 'Cancel', ghost: true }, { label: 'Add and open workspace', primary: true, onClick: function (c) { var id = U.$('#cw-ws', c.el).value; pending = { workspaceId: id, sleeve: sleeve, version: ver }; UI.shell.go('#/w/' + encodeURIComponent(id)); } }] });
    });
  }

  /* ── apply ───────────────────────────────────────────────────────── */
  function weightOf(el) { var raw = (U.$('#ap-weight', el).value || '').trim().replace(',', '.').replace(/%$/, ''), v = Number(raw); return raw === '' || !isFinite(v) ? null : U.round(v, 2); }
  SL.apply = function (alloc, categoryId, preselect) {
    if (!alloc || alloc.kind !== 'live') { UI.toast('Choose a live allocation to apply a sleeve. Snapshots and compared sleeves are read-only.'); return; }
    var cat = D.categoryById[categoryId], tree = E.tree(alloc).filter(function (t) { return t.id === categoryId; })[0];
    PA.api.listSleeves().then(function (list) {
      remember(list);
      var live = list.filter(function (s) { return !s.archived; }), tagged = live.filter(function (s) { return s.categoryId === categoryId; }), others = live.filter(function (s) { return s.categoryId !== categoryId; });
      if (!live.length) { UI.toast('The sleeve repository is empty. Create a sleeve from a category or a selection first.'); return; }
      var selId = preselect ? preselect.id : (tagged[0] || others[0]).id;
      var body = '<div class="dlg-grid"><div class="field"><label for="ap-sleeve">Sleeve</label><select id="ap-sleeve">' + (tagged.length ? '<optgroup label="Filed under ' + esc(cat.name) + '">' + tagged.map(function (s) { return '<option value="' + s.id + '"' + (s.id === selId ? ' selected' : '') + '>' + esc(s.name) + (s.mixed ? ' (mixed)' : '') + '</option>'; }).join('') + '</optgroup>' : '') + (others.length ? '<optgroup label="Other categories">' + others.map(function (s) { return '<option value="' + s.id + '"' + (s.id === selId ? ' selected' : '') + '>' + esc(s.name) + ' · ' + esc(D.categoryById[s.categoryId].short) + (s.mixed ? ' (mixed)' : '') + '</option>'; }).join('') + '</optgroup>' : '') + '</select></div>' +
        '<div class="field"><label for="ap-version">Version</label><select id="ap-version"></select></div>' +
        '<div class="field wide"><span class="label">How</span><label class="check"><input type="radio" name="ap-mode" value="replace" checked> Replace ' + esc(cat.name) + '’s holdings with the sleeve</label><label class="check"><input type="radio" name="ap-mode" value="add"> Add the sleeve alongside its holdings</label></div>' +
        '<div class="field"><label for="ap-weight">Sleeve weight, % of the portfolio</label><input type="text" inputmode="decimal" id="ap-weight" value="' + (tree.target > 0 ? esc(String(tree.target)) : '') + '" placeholder="e.g. 8" autocomplete="off"><span class="field-hint">' + esc(cat.name) + ' is ' + F.num(tree.target) + '% today; afterwards it is the sum of its holdings.</span></div>' +
        '<div class="wide" id="ap-preview"></div><div class="wide field-hint">Only want to see how the sleeve behaves? <button type="button" class="btn-link" id="ap-compare">Add it to the comparison as its own column instead</button></div></div>';
      UI.openDialog({ title: 'Apply a sleeve to ' + cat.name, sub: 'Copies the sleeve’s products into <b>' + esc(alloc.name) + '</b> at the chosen weight and tags them with the sleeve and version. The sleeve itself is not linked.', body: body, wide: true, initialFocus: '#ap-sleeve',
        onOpen: function (dlg, octx) {
          var refresh = function () {
            var s = live.filter(function (x) { return x.id === U.$('#ap-sleeve', dlg).value; })[0], vs = U.$('#ap-version', dlg);
            if (vs.dataset.for !== s.id) { vs.dataset.for = s.id; vs.innerHTML = s.versions.slice().reverse().map(function (v) { return '<option value="' + v.v + '">v' + v.v + ' · ' + esc(F.date(v.createdAt)) + ' · ' + esc(v.note) + '</option>'; }).join(''); }
            var ver = s.versions.filter(function (v) { return v.v === Number(vs.value); })[0], mode = dlg.querySelector('[name=ap-mode]:checked').value, wv = weightOf(dlg);
            var next = E.applySleeve(alloc, categoryId, s, ver, mode, wv == null ? 0 : wv), after = E.tree({ holdings: next }).filter(function (t) { return t.id === categoryId; })[0];
            var spill = E.categoriesOf(ver.holdings.map(function (h) { return { instrumentId: h.instrumentId }; })).length > 1;
            U.$('#ap-preview', dlg).innerHTML = (s.mixed || spill ? UI.alert('info', 'This sleeve spans several asset classes. All of its products go into ' + esc(cat.name) + '.') : '') +
              V.table([{ label: 'Product' }, { label: 'In sleeve', num: true }, { label: 'Weight after', num: true }], ver.holdings.map(function (h) { var ins = D.instrumentById[h.instrumentId], nh = next.filter(function (x) { return x.instrumentId === h.instrumentId; })[0]; return { cells: [esc(ins.name) + ' <span class="faint small">' + esc(D.categoryOf(h.instrumentId).short) + '</span>', F.num(h.weight, 2) + '%', F.num(nh ? nh.weight : 0) + '%'] }; }).concat([{ cls: 'total', cells: [esc(cat.name) + ' after', '', F.num(after.target) + '%'] }]), { maxHeight: '220px' });
          };
          dlg.querySelector('#ap-sleeve').onchange = refresh; dlg.querySelector('#ap-version').onchange = refresh; U.on(dlg, 'change', '[name=ap-mode]', refresh); dlg.querySelector('#ap-weight').oninput = refresh; refresh();
          dlg.querySelector('#ap-compare').onclick = function () { var s = live.filter(function (x) { return x.id === U.$('#ap-sleeve', dlg).value; })[0], ver = s.versions.filter(function (v) { return v.v === Number(U.$('#ap-version', dlg).value); })[0]; octx.close(); SL.addToWorkspace(s, ver); };
        },
        actions: [{ label: 'Cancel', ghost: true }, { label: 'Apply sleeve', primary: true, onClick: function (c) {
          var s = live.filter(function (x) { return x.id === U.$('#ap-sleeve', c.el).value; })[0], ver = s.versions.filter(function (v) { return v.v === Number(U.$('#ap-version', c.el).value); })[0], mode = c.el.querySelector('[name=ap-mode]:checked').value, wv = weightOf(c.el);
          if (wv == null || wv <= 0) { var wi = U.$('#ap-weight', c.el); wi.setAttribute('aria-invalid', 'true'); wi.focus(); UI.toast('Enter the weight the sleeve should take, e.g. 8.', { kind: 'error' }); return false; }
          S.update('Sleeve “' + s.name + '” v' + ver.v + ' applied to ' + cat.name + ' in ' + alloc.name, function (ws) { var x = ws.allocations.filter(function (y) { return y.id === alloc.id; })[0]; x.holdings = E.applySleeve(x, categoryId, s, ver, mode, wv); if (x.history && x.history.basis === 'actual') x.edited = true; }, { type: 'sleeve' });
          var ex = S.ws.prefs.expanded.slice(); if (ex.indexOf(categoryId) < 0) { ex.push(categoryId); S.setPref('expanded', ex); } S.setPref('selectedRow', categoryId);
          UI.toast('“' + s.name + '” v' + ver.v + ' applied to ' + cat.name + '.', { action: { label: 'Undo', fn: S.undo } });
        } }] });
    });
  };

  /* ── repository screen ───────────────────────────────────────────── */
  var repo = { list: null, filter: 'all', selected: null, version: null, edit: null, q: '' };
  SL.showRepository = function (el, selectedId) {
    document.title = 'Sleeve repository · Portfolio Analytics';
    repo.selected = selectedId || repo.selected; repo.version = null; repo.edit = null;
    el.innerHTML = '<header class="topbar"><a class="wordmark" href="#/"><b>Portfolio Management Group</b><span>Portfolio Analytics</span></a><span class="sep faint">/</span><span class="eyebrow">Sleeve repository</span><span class="spacer"></span><a class="btn btn-sm" href="#/">' + I.chevronLeft + '<span>Workspaces</span></a><span class="user"><span class="avatar" aria-hidden="true">FB</span><span>F. Barker</span></span></header><div class="repo" id="repo"><div class="repo-nav skeleton" style="min-height:300px"></div><div class="repo-list"></div><div class="repo-detail"></div></div>';
    var cont = U.$('#repo', el);
    U.on(cont, 'click', '[data-filter]', function (e, b) { repo.filter = b.dataset.filter; renderRepo(el); });
    U.on(cont, 'click', '[data-open]', function (e, b) { repo.selected = b.dataset.open; repo.version = null; repo.edit = null; history.replaceState(null, '', '#/sleeves/' + encodeURIComponent(repo.selected)); renderRepo(el); });
    PA.api.listSleeves().then(function (list) { remember(list); repo.list = list; if (!repo.selected || !list.some(function (s) { return s.id === repo.selected; })) repo.selected = (list.filter(function (s) { return !s.archived; })[0] || {}).id || null; renderRepo(el); });
  };
  function renderRepo(el) {
    var list = repo.list, cont = U.$('#repo', el);
    var visible = list.filter(function (s) { return repo.filter === 'archived' ? s.archived : (!s.archived && (repo.filter === 'all' || s.categoryId === repo.filter)); }).filter(function (s) { return !repo.q || (s.name + ' ' + (s.note || '')).toLowerCase().indexOf(repo.q.toLowerCase()) >= 0; });
    var counts = {}; list.forEach(function (s) { if (!s.archived) counts[s.categoryId] = (counts[s.categoryId] || 0) + 1; });
    var sel = list.filter(function (s) { return s.id === repo.selected; })[0] || null;
    cont.innerHTML = '<aside class="repo-nav" aria-label="Categories"><div class="eyebrow" style="padding:0 10px 8px">Categories</div><button type="button" data-filter="all" aria-pressed="' + (repo.filter === 'all') + '"><span>All sleeves</span><span class="count">' + list.filter(function (s) { return !s.archived; }).length + '</span></button>' + D.taxonomy.map(function (c) { return '<button type="button" data-filter="' + c.id + '" aria-pressed="' + (repo.filter === c.id) + '"><span><span class="sw" style="background:' + c.color + '"></span> ' + esc(c.short) + '</span><span class="count">' + (counts[c.id] || 0) + '</span></button>'; }).join('') + '<div class="menu-sep"></div><button type="button" data-filter="archived" aria-pressed="' + (repo.filter === 'archived') + '"><span>Archived</span><span class="count">' + list.filter(function (s) { return s.archived; }).length + '</span></button><div class="field-hint" style="padding:14px 10px 0">Sleeves are created from a category or a product selection in a workspace builder, then applied to categories anywhere.</div></aside>' +
      '<section class="repo-list" aria-label="Sleeves"><div style="padding:12px 16px;border-bottom:1px solid var(--line)"><div class="search-wrap">' + I.search + '<input type="search" id="repo-q" placeholder="Find a sleeve…" aria-label="Find a sleeve" value="' + esc(repo.q) + '"></div></div>' + (visible.length ? visible.map(function (s) { var v = latest(s); return '<button type="button" class="repo-item" data-open="' + esc(s.id) + '" aria-pressed="' + (s.id === repo.selected) + '"><b>' + esc(s.name) + (s.mixed ? ' <span class="tag tag-warn">Mixed</span>' : '') + '</b><small><span class="sw" style="background:' + D.categoryById[s.categoryId].color + ';width:8px;height:8px"></span> ' + esc(D.categoryById[s.categoryId].short) + ' · v' + v.v + ' · ' + v.holdings.length + ' products · ' + esc(s.createdBy) + '</small></button>'; }).join('') : '<div class="empty"><p>No sleeves here' + (repo.q ? ' match “' + esc(repo.q) + '”' : '') + '.</p></div>') + '</section>' +
      '<section class="repo-detail" aria-label="Sleeve detail">' + (sel ? detailHtml(sel) : '<div class="empty">' + I.layers + '<h3>Select a sleeve</h3><p>Inspect its versions and products, rename or re-file it, edit weights as a new version, or archive it.</p></div>') + '</section>';
    U.$('#repo-q', cont).oninput = U.debounce(function (e) { repo.q = e.target.value; renderRepo(el); var q = U.$('#repo-q', cont); q.focus(); q.setSelectionRange(q.value.length, q.value.length); }, 150);
    if (sel) wireDetail(el, sel);
  }
  function detailHtml(s) {
    var ver = s.versions.filter(function (v) { return v.v === (repo.version || latest(s).v); })[0], cat = D.categoryById[s.categoryId], editing = repo.edit || null, hs = editing || ver.holdings;
    var total = U.sum(hs, function (h) { return h.weight; }), valid = Math.abs(total - 100) < 0.051;
    return '<div class="row" style="justify-content:space-between;align-items:flex-start;gap:16px;flex-wrap:wrap"><div><div class="eyebrow">' + (s.archived ? 'Archived sleeve' : 'Sleeve') + ' · ' + esc(cat.name) + '</div><h1 style="font-family:var(--f-num);font-size:26px;font-weight:500;margin:4px 0 2px">' + esc(s.name) + (s.mixed ? ' <span class="tag tag-warn" data-tip="Products span more than one category">Mixed</span>' : '') + '</h1><p class="muted" style="margin:0">' + esc(s.note || '') + (s.source ? ' <span class="faint">Created from ' + esc(s.source.allocationName) + ' in ' + esc(s.source.workspaceName) + '.</span>' : '') + '</p></div>' +
      '<div class="row" style="gap:6px">' + (s.archived ? '' : '<button type="button" class="btn btn-sm btn-primary" id="rp-compare" data-tip="Add this version to a workspace as its own column, to see its analytics">' + I.plus + '<span>Add to a workspace…</span></button>') + '<button type="button" class="btn btn-sm" id="rp-rename">Rename</button><button type="button" class="btn btn-sm" id="rp-refile">Re-file…</button>' + (s.archived ? '<button type="button" class="btn btn-sm" id="rp-restore">' + I.reset + '<span>Restore</span></button>' : '<button type="button" class="btn btn-sm btn-danger" id="rp-archive">' + I.trash + '<span>Archive</span></button>') + '</div></div>' +
      '<div class="dlg-grid" style="margin-top:18px"><div class="wide"><div class="label" style="margin-bottom:8px">Versions</div><div class="versions">' + s.versions.map(function (v) { return '<button type="button" data-ver="' + v.v + '" aria-pressed="' + (v.v === ver.v) + '" data-tip="' + esc(F.dateTime(v.createdAt) + ' · ' + v.note) + '">v' + v.v + '</button>'; }).join('') + '</div><div class="field-hint" style="margin-top:6px">v' + ver.v + ' · ' + esc(F.dateTime(ver.createdAt)) + ' · ' + esc(ver.note) + '</div></div>' +
      '<div class="wide"><div class="label" style="margin-bottom:8px">Products · weights sum to 100</div><div class="tblwrap" style="border:1px solid var(--line-strong);border-radius:var(--radius-sm)"><table class="tbl"><thead><tr><th scope="col">Product</th><th scope="col">Category</th><th scope="col" class="num">Weight %</th>' + (s.archived ? '' : '<th scope="col"></th>') + '</tr></thead><tbody>' + hs.map(function (h, i) { var ins = D.instrumentById[h.instrumentId]; return '<tr><th scope="row">' + esc(ins.name) + ' <span class="faint small">' + esc(ins.identifier) + '</span></th><td>' + esc(D.categoryOf(h.instrumentId).short) + '</td><td class="num">' + (s.archived ? F.num(h.weight, 2) : '<input type="number" step="0.01" class="input-sm" style="width:92px" value="' + h.weight + '" data-rw="' + i + '" aria-label="' + esc(ins.name) + ' weight">') + '</td>' + (s.archived ? '' : '<td><button type="button" class="btn btn-icon btn-xs btn-ghost" data-rdel="' + i + '" aria-label="Remove ' + esc(ins.name) + '">' + I.close + '</button></td>') + '</tr>'; }).join('') + '<tr class="total"><th scope="row">Total</th><td></td><td class="num ' + (valid ? 'pos' : 'neg') + '">' + F.num(total, 2) + '%' + (valid ? ' ' + I.check : '') + '</td>' + (s.archived ? '' : '<td></td>') + '</tr></tbody></table></div>' +
      (editing ? '<div class="row" style="margin-top:10px;gap:8px;flex-wrap:wrap"><input type="text" id="rp-vnote" class="input-sm" placeholder="What changed in this version" style="flex:1;min-width:200px" maxlength="120">' + (!valid ? '<button type="button" class="btn btn-sm" id="rp-normalise" data-tip="Rescale the weights so they sum to 100">Normalise</button>' : '') + '<button type="button" class="btn btn-sm btn-primary" id="rp-save"' + (valid ? '' : ' disabled') + '>Save as v' + (latest(s).v + 1) + '</button><button type="button" class="btn btn-sm btn-ghost" id="rp-cancel">Discard</button></div>' : (s.archived ? '' : '<div class="field-hint" style="margin-top:8px">Edit a weight to start a new version. Earlier versions are never changed; allocations that applied them keep their tag.</div>')) + '</div></div>';
  }
  function wireDetail(el, s) {
    var cont = U.$('#repo', el), det = cont.querySelector('.repo-detail');
    U.on(det, 'click', '[data-ver]', function (e, b) { repo.version = Number(b.dataset.ver); repo.edit = null; renderRepo(el); });
    var ver = s.versions.filter(function (v) { return v.v === (repo.version || latest(s).v); })[0];
    U.on(det, 'change', '[data-rw]', function (e, inp) { var hs = U.clone(repo.edit || ver.holdings), v = Number(inp.value); if (!isFinite(v) || v < 0) { inp.setAttribute('aria-invalid', 'true'); return; } hs[Number(inp.dataset.rw)].weight = U.round(v, 2); repo.edit = hs; renderRepo(el); });
    U.on(det, 'click', '[data-rdel]', function (e, b) { var hs = U.clone(repo.edit || ver.holdings); hs.splice(Number(b.dataset.rdel), 1); repo.edit = hs; renderRepo(el); });
    var cw = U.$('#rp-compare', det); if (cw) cw.onclick = function () { compareInWorkspace(s, ver); };
    var nm = U.$('#rp-normalise', det); if (nm) nm.onclick = function () { repo.edit = E.sleeveHoldings(repo.edit); renderRepo(el); };
    var cn = U.$('#rp-cancel', det); if (cn) cn.onclick = function () { repo.edit = null; renderRepo(el); };
    var sv = U.$('#rp-save', det); if (sv) sv.onclick = function () {
      var note = U.$('#rp-vnote', det).value.trim() || 'Weights edited', copy = U.clone(s); copy.versions.push({ v: latest(s).v + 1, createdAt: new Date().toISOString(), note: note, holdings: repo.edit }); copy.mixed = E.categoriesOf(repo.edit).length > 1;
      PA.api.saveSleeve(copy).then(function (saved) { repo.list = repo.list.map(function (x) { return x.id === saved.id ? saved : x; }); repo.edit = null; repo.version = latest(saved).v; renderRepo(el); UI.toast('Saved as v' + latest(saved).v + '.'); });
    };
    U.$('#rp-rename', det).onclick = function () { UI.prompt({ title: 'Rename sleeve', label: 'Name', value: s.name }).then(function (n) { if (!n || n === s.name) return; var copy = U.clone(s); copy.name = n; PA.api.saveSleeve(copy).then(function (saved) { repo.list = repo.list.map(function (x) { return x.id === saved.id ? saved : x; }); renderRepo(el); }); }); };
    U.$('#rp-refile', det).onclick = function () {
      UI.openDialog({ title: 'Re-file sleeve', sub: 'Choose the category this sleeve is filed under.', body: '<div class="field"><label for="rf-cat">Category</label><select id="rf-cat">' + catOpts(s.categoryId) + '</select></div>', initialFocus: '#rf-cat', actions: [{ label: 'Cancel', ghost: true }, { label: 'Re-file', primary: true, onClick: function (c) { var copy = U.clone(s); copy.categoryId = U.$('#rf-cat', c.el).value; PA.api.saveSleeve(copy).then(function (saved) { repo.list = repo.list.map(function (x) { return x.id === saved.id ? saved : x; }); renderRepo(el); }); } }] });
    };
    var ar = U.$('#rp-archive', det); if (ar) ar.onclick = function () { UI.confirm({ title: 'Archive “' + s.name + '”?', sub: 'Archived sleeves cannot be applied. Allocations that already use them are unchanged, and it can be restored.', confirmLabel: 'Archive', danger: true }).then(function (ok) { if (ok) PA.api.archiveSleeve(s.id, true).then(function (saved) { repo.list = repo.list.map(function (x) { return x.id === saved.id ? saved : x; }); renderRepo(el); }); }); };
    var rs = U.$('#rp-restore', det); if (rs) rs.onclick = function () { PA.api.archiveSleeve(s.id, false).then(function (saved) { repo.list = repo.list.map(function (x) { return x.id === saved.id ? saved : x; }); repo.filter = 'all'; renderRepo(el); }); };
  }
})();

/* ─────────────────────────────────────────────────────────────────────────
   Portfolio Analytics · workspace state
   One store for the open workspace. Three kinds of state live here:

     ws       the persisted workspace (see data/workspaces.js for the shape)
     prefs    ws.prefs — remembered display settings; saved, never undone
     session  transient: save status, open panels, product selection. Lost on
              reload by design.

   Rules the UI depends on:
   - every change to allocations, comparison membership, scenarios or cards
     goes through update(label, fn): it records an undo step (unless
     history:false), schedules an autosave and bumps the analytics revision
   - cards fetch their own data (js/ui/cards.js) tagged with the revision
     that requested it; a slower, older response never replaces a newer one
   ───────────────────────────────────────────────────────────────────────── */
(function () {
  'use strict';
  var PA = window.PA, U = PA.util;
  var S = PA.store = {};

  var listeners = [];
  S.ws = null;
  /* the category list every category view reads is the open workspace's */
  PA.data.categorySource = function () { return S.ws ? S.ws.categories : null; };
  S.session = {
    save: { state: 'idle', at: null, error: null },
    revision: 0,
    history: { past: [], future: [] },
    railOpen: false, drawerOpen: false, drawerTab: 'assumptions', selectedPair: null,
    selectMode: false, selection: [],      /* product holding ids chosen for a sleeve */
    railTab: 'build',                       /* builder tab: build · optimize · sleeves · check */
    rowFilter: '', sort: null, addCardOpen: false
  };

  S.subscribe = function (fn) { listeners.push(fn); return function () { listeners = listeners.filter(function (f) { return f !== fn; }); }; };
  function emit(type, extra) { listeners.forEach(function (fn) { try { fn(type, extra || {}); } catch (e) { console.error(e); } }); }
  S.emit = emit;

  /* ── loading ─────────────────────────────────────────────────────── */
  S.load = function (ws) {
    S.ws = ws;
    if (!ws.cards) ws.cards = [];
    S.session.history = { past: [], future: [] };
    S.session.save = { state: 'saved', at: ws.updatedAt, error: null };
    S.session.drawerOpen = false; S.session.railOpen = false; S.session.rowFilter = ''; S.session.sort = null; S.session.selectedPair = null;
    S.session.selectMode = false; S.session.selection = []; S.session.standalone = null; S.session.addCardOpen = false; S.session.railTab = 'build';
    if (!ws.prefs.selectedRow) ws.prefs.selectedRow = 'public_equity';
    /* Workspaces saved with a shared Basis switch: each card that followed it
       keeps its last value as its own basis, so nothing on screen changes. */
    if (ws.prefs.basis) { ws.cards.forEach(function (c) { var t = PA.cards && PA.cards.types[c.type]; if (t && t.basis === 'either' && !(c.settings && c.settings.basis)) { c.settings = c.settings || {}; c.settings.basis = ws.prefs.basis; } }); delete ws.prefs.basis; }
    if (!ws.currency) ws.currency = 'USD';
    PA.api.useCurrency(ws.currency);
    if (PA.chain) PA.api.useConventions(PA.chain.conventionsOf(ws));
    S.session.revision++;
    emit('load');
  };
  S.unload = function () { S.ws = null; emit('unload'); };

  /* ── accessors ───────────────────────────────────────────────────── */
  S.allocation = function (id) { if (id === S.STANDALONE_ID) return S.standalone(); if (id && id.indexOf(S.LEVEL_PREFIX) === 0) return S.levels().filter(function (x) { return x.id === id; })[0] || null; return S.ws ? S.ws.allocations.filter(function (a) { return a.id === id; })[0] || null : null; };
  S.active = function () { return S.ws ? S.allocation(S.ws.comparison.activeId) : null; };
  S.members = function () { return S.ws ? S.ws.comparison.members.map(S.allocation).filter(Boolean) : []; };
  /* ── stand-alone category ───────────────────────────────────────────
     While a category of the allocation being edited is selected in the rail,
     it joins the analysis as a temporary portfolio: its holdings rescaled to
     100%, recalculated on every edit. Session only: never saved or undone. */
  S.STANDALONE_ID = '__standalone';
  S.standalone = function () {
    var on = S.session.standalone; if (!S.ws || !on) return null;
    var a = S.allocation(on.allocationId), c = PA.data.categoryById[on.categoryId];
    if (!a || !c || S.ws.comparison.activeId !== a.id) return null;
    var hs = a.holdings.filter(function (h) { return h.categoryId === c.id; }), sum = U.sum(hs, function (h) { return h.weight; });
    if (!hs.length || Math.abs(sum) < 1e-9) return null;
    var x = U.clone(a);
    x.id = S.STANDALONE_ID; x.kind = 'standalone'; x.name = a.name + ' · ' + c.name; x.color = null;
    x.holdings = PA.engine.scaleTo(U.clone(hs), 100); x.leverage = x.leverage || x.holdings.some(function (h) { return h.weight < 0; });
    x.history = null; x.edited = false; delete x.sleeve;
    x.standalone = { allocationId: a.id, categoryId: c.id, weight: U.round(sum, 2) }; x.scopeAs = a.id;
    return x;
  };
  /* ── derived chain levels ───────────────────────────────────────────
     With "Show levels in comparison" on (prefs.showLevels 'active' or 'all'),
     the SAA and product-benchmark levels of the allocation being edited, or
     of every compared allocation with a decision chain, join the analysis as
     temporary members: resolved from the chain on every change, outside the
     six-member limit, inheriting the parent's scenario scope, never saved. */
  S.LEVEL_PREFIX = '__level:';
  var levelMemo = { key: null, list: [] };
  S.levels = function () {
    if (!S.ws || !PA.chain) return [];
    var mode = S.ws.prefs.showLevels || 'off'; if (mode === 'off') return [];
    var key = S.session.revision + '|' + mode + '|' + S.ws.comparison.activeId + '|' + S.ws.comparison.members.join(',');
    if (levelMemo.key === key) return levelMemo.list;
    var out = [];
    S.members().forEach(function (a) {
      if (!a.chain || (mode === 'active' && a.id !== S.ws.comparison.activeId)) return;
      (PA.chain.levelsOf(a, S.ws.allocations, {}).levels || []).forEach(function (l) {
        if ((l.id !== 'saa' && l.id !== 'productBenchmarks') || !l.holdings) return;
        out.push({ id: S.LEVEL_PREFIX + a.id + ':' + l.id, kind: 'level', name: a.name + ' · ' + l.short, color: a.color, benchmarkId: a.benchmarkId, chain: U.clone(a.chain), leverage: l.holdings.some(function (h) { return h.weight < 0; }), history: null, edited: false, scopeAs: a.scopeAs || a.id,
          level: { parentId: a.id, id: l.id, code: l.code, short: l.short, label: l.label, derived: !!l.derived }, holdings: l.holdings.map(function (h, i) { return { id: 'lv' + i + '_' + h.instrumentId, instrumentId: h.instrumentId, weight: U.round(h.weight, 4), categoryId: h.categoryId }; }) });
      });
    });
    levelMemo = { key: key, list: out }; return out;
  };
  /** Everything the cards analyse: the comparison, the stand-alone category if one is on, then any derived levels. */
  S.analysed = function () { var m = S.members(), x = S.standalone(); return (x ? m.concat([x]) : m).concat(S.levels()); };
  /** Turn the stand-alone category on (an allocation's category) or off (null). Every card recalculates. */
  S.setStandalone = function (allocationId, categoryId) {
    var cur = S.session.standalone, next = allocationId && categoryId ? { allocationId: allocationId, categoryId: categoryId } : null;
    if (JSON.stringify(cur || null) === JSON.stringify(next)) return;
    var had = !!S.standalone(); S.session.standalone = next; var has = !!S.standalone();
    emit('session', { key: 'standalone' });
    if (had || has) S.refresh();
  };
  S.scenario = function (id) { return S.ws ? S.ws.scenarios.filter(function (s) { return s.id === (id || S.ws.activeScenarioId); })[0] || null : null; };
  S.activeScenario = function () { return S.ws && S.ws.activeScenarioId ? S.scenario(S.ws.activeScenarioId) : null; };
  S.scenarioValid = function () { var sc = S.activeScenario(); return !sc || PA.engine.resolve(sc).corrValid; };
  S.overrideCount = function (sc) {
    sc = sc || S.activeScenario(); if (!sc) return 0;
    var o = sc.overrides, n = 0;
    ['assetClass', 'holding', 'factor'].forEach(function (lvl) { Object.keys(o[lvl]).forEach(function (k) { n += Object.keys(o[lvl][k]).filter(function (f) { return o[lvl][k][f] != null; }).length; }); });
    return n + Object.keys(o.correlation).length;
  };
  S.card = function (id) { return S.ws ? S.ws.cards.filter(function (c) { return c.id === id; })[0] || null : null; };

  /* ── undoable updates ────────────────────────────────────────────── */
  function undoSnapshot() { var w = S.ws; return JSON.stringify({ categories: w.categories, allocations: w.allocations, comparison: w.comparison, scenarios: w.scenarios, activeScenarioId: w.activeScenarioId, cards: w.cards, currency: w.currency, conventions: w.conventions || null }); }
  function applySnapshot(json) { var s = JSON.parse(json); if (s.categories) S.ws.categories = s.categories; S.ws.allocations = s.allocations; S.ws.comparison = s.comparison; S.ws.scenarios = s.scenarios; S.ws.activeScenarioId = s.activeScenarioId; S.ws.cards = s.cards; if (s.currency) S.ws.currency = s.currency; if (s.conventions) S.ws.conventions = s.conventions; else delete S.ws.conventions; }
  /**
   * Apply a mutation to the workspace. fn receives the live ws object.
   * opts: {type, detail, activity:false (skip the log), history:false (no undo
   *        step), refresh:false (analytics unchanged), force:true (emit even
   *        if the undoable state did not change)}
   */
  S.update = function (label, fn, opts) {
    if (!S.ws) return;
    opts = opts || {};
    var before = undoSnapshot();
    fn(S.ws);
    var after = undoSnapshot();
    if (before === after && !opts.force) return;
    if (opts.history !== false && before !== after) {
      S.session.history.past.push({ label: label, json: before });
      if (S.session.history.past.length > 60) S.session.history.past.shift();
      S.session.history.future = [];
    }
    if (opts.activity !== false) { S.ws.activity.unshift({ at: new Date().toISOString(), type: opts.type || 'edit', label: label, detail: opts.detail || null }); if (S.ws.activity.length > 200) S.ws.activity.length = 200; }
    afterChange('update', { label: label, refresh: opts.refresh !== false });
  };
  S.undo = function () {
    var h = S.session.history; if (!h.past.length) return;
    var step = h.past.pop(); h.future.push({ label: step.label, json: undoSnapshot() }); applySnapshot(step.json);
    S.ws.activity.unshift({ at: new Date().toISOString(), type: 'undo', label: 'Undo: ' + step.label });
    afterChange('undo', { label: step.label, refresh: true }); U.announce('Undid ' + step.label);
  };
  S.redo = function () {
    var h = S.session.history; if (!h.future.length) return;
    var step = h.future.pop(); h.past.push({ label: step.label, json: undoSnapshot() }); applySnapshot(step.json);
    S.ws.activity.unshift({ at: new Date().toISOString(), type: 'redo', label: 'Redo: ' + step.label });
    afterChange('redo', { label: step.label, refresh: true }); U.announce('Redid ' + step.label);
  };
  S.canUndo = function () { return S.session.history.past.length > 0; };
  S.canRedo = function () { return S.session.history.future.length > 0; };

  /** Display preferences: saved, not undoable. Some change what every card shows. */
  var REFRESH_PREFS = ['period', 'horizon', 'confidence', 'showLevels'];
  S.setPref = function (key, value) {
    if (!S.ws) return;
    S.ws.prefs[key] = value;
    scheduleSave();
    if (key === 'selectedRow' && S.session.standalone && value !== S.session.standalone.categoryId) S.setStandalone(null);
    if (REFRESH_PREFS.indexOf(key) >= 0) S.refresh();
    emit('pref', { key: key });
  };
  S.setSession = function (key, value) { S.session[key] = value; emit('session', { key: key }); };

  function afterChange(type, extra) {
    var st = S.session.standalone;
    if (st && S.ws.comparison.activeId !== st.allocationId) { S.session.standalone = null; extra.refresh = true; emit('session', { key: 'standalone' }); }
    S.ws.updatedAt = new Date().toISOString();
    scheduleSave();
    if (extra.refresh) S.session.revision++;
    emit(type, extra);
    if (extra.refresh) emit('refresh', { revision: S.session.revision });
  }
  /** Re-request analytics for every card (after an edit or a context change). */
  S.refresh = function () { if (!S.ws) return; S.session.revision++; emit('refresh', { revision: S.session.revision }); };

  /* ── cards ───────────────────────────────────────────────────────── */
  S.addCard = function (card) {
    S.update('Card “' + (card.name || PA.cards.types[card.type].title) + '” added', function (ws) { ws.cards.push(card); }, { type: 'card', refresh: false });
  };
  S.removeCard = function (id) {
    var c = S.card(id); if (!c) return;
    S.update('Card “' + (c.name || PA.cards.types[c.type].title) + '” removed', function (ws) { ws.cards = ws.cards.filter(function (x) { return x.id !== id; }); }, { type: 'card', refresh: false });
  };
  S.updateCard = function (id, patch, opts) {
    var c = S.card(id); if (!c) return;
    S.update('Card “' + (c.name || PA.cards.types[c.type].title) + '” changed', function (ws) { var x = ws.cards.filter(function (y) { return y.id === id; })[0]; for (var k in patch) x[k] = patch[k]; }, Object.assign({ type: 'card', refresh: false, activity: false }, opts || {}));
  };
  /** Layout moves and resizes: saved, not undoable, no activity entry. */
  S.setLayout = function (positions) {
    S.update('Layout changed', function (ws) { ws.cards.forEach(function (c) { var p = positions[c.id]; if (p) { c.x = p.x; c.y = p.y; c.w = p.w; c.h = p.h; } }); }, { history: false, activity: false, refresh: false });
  };

  /* ── autosave ────────────────────────────────────────────────────── */
  var saveTimer = null, saveSeq = 0;
  function scheduleSave() { S.session.save.state = S.session.save.state === 'failed' ? 'failed' : 'pending'; emit('save'); clearTimeout(saveTimer); saveTimer = setTimeout(S.saveNow, 700); }
  S.saveNow = function () {
    if (!S.ws) return Promise.resolve();
    clearTimeout(saveTimer);
    var seq = ++saveSeq; S.session.save.state = 'saving'; emit('save');
    return PA.api.saveWorkspace(S.ws).then(function (r) { if (seq !== saveSeq) return; S.session.save = { state: 'saved', at: r.savedAt, error: null }; emit('save'); },
      function (err) { if (seq !== saveSeq) return; S.session.save = { state: 'failed', at: S.session.save.at, error: err }; emit('save'); });
  };

  /* ── selection of products (for sleeves) ─────────────────────────── */
  S.setSelectMode = function (on) { S.session.selectMode = !!on; if (!on) S.session.selection = []; emit('session', { key: 'selection' }); };
  S.toggleSelected = function (holdingId) { var s = S.session.selection, i = s.indexOf(holdingId); if (i >= 0) s.splice(i, 1); else s.push(holdingId); if (!S.session.selectMode && s.length) S.session.selectMode = true; emit('session', { key: 'selection' }); };
  S.clearSelection = function () { S.session.selection = []; emit('session', { key: 'selection' }); };
})();

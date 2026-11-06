/* ─────────────────────────────────────────────────────────────────────────
   Portfolio Analytics · the card workspace
   A workspace is a collection of cards on a 12-column grid. Cards are
   dragged by their header and resized from their corner; a moved card pushes
   the cards it lands on down, then the grid compacts upwards. Each card
   fetches its own data through PA.api, tagged with the store revision, and
   renders through a catalogue entry (PA.cards.types, see cardtypes.js).

   Card type contract
   ──────────────────
   {id, title, description, group, size:{w,h}, min:{w,h},
    basis:'forward'|'historical'   the card always reads that basis
         |'either'                 one type, two catalogue entries: the basis is fixed
                                   when the card is added (settings.basis) and can be
                                   switched from the card menu
         |'dual'                   shows both side by side (Headline)
         |'none'                   structure only (weights),
    entries?:[{title, description, group, settings}]   catalogue entries (default: one, from the type),
    supportsRow:boolean, factorModel?: true | (settings, card) → boolean   (uses a factor model),
    settings:[{key, label, type:'select'|'multi'|'toggle'|'factors', options:[[v,label]] | (card) → [[v,label]],
               default, when?: (settings, card) → boolean}],
    data(ctx, settings, card) → Promise<any>,
    render(body, data, ctx, settings, card),
    subtitle(ctx, settings, card) → string,
    dataTable?(data, ctx, settings) → html}
   ctx: {ws, members, emphasized, prefs, scenario, row, rowLabel, revision,
         basis:'forward'|'historical'|null   (this card's basis; see C.basisOf)}
   The subtitle is prefixed with the basis (→ Forward-looking · ◷ Historical,
   with its period), so a card's figures always say what they are.
   ───────────────────────────────────────────────────────────────────────── */
(function () {
  'use strict';
  var PA = window.PA, U = PA.util, esc = U.esc, S = PA.store, UI = PA.ui, I = U.icon;
  var C = PA.cards = { types: {}, order: [], state: {} };
  var grid, COLS = 12, ROW = 48, GAP = 16, cache = {}, cacheRev = -1, sheetEl = null;

  C.register = function (type) { C.types[type.id] = type; C.order.push(type.id); };

  /* ── shared data fetch with a per-revision cache ─────────────────── */
  C.fetch = function (name, req) {
    if (cacheRev !== S.session.revision) { cache = {}; cacheRev = S.session.revision; }
    /* a decision chain whose SAA is another allocation sends that allocation along, as edited */
    var pool = C.chainPool(req.allocations || (req.allocation ? [req.allocation] : []));
    if (pool.length) req.chainAllocations = pool;
    var key = name + ':' + JSON.stringify(req);
    if (!cache[key]) { cache[key] = PA.api[name](req); cache[key].catch(function () { if (cache[key]) delete cache[key]; }); }
    return cache[key];
  };
  /** The allocations the members' chains name as their SAA (and the parents of derived levels), so the service can resolve the levels. */
  C.chainPool = function (list) {
    if (!S.ws) return [];
    var ids = {}; (list || []).forEach(function (a) { var ch = a && a.chain; if (ch && ch.saa && ch.saa.kind === 'allocation') ids[ch.saa.id] = 1; if (a && a.level) ids[a.level.parentId] = 1; });
    (list || []).forEach(function (a) { if (a) delete ids[a.id]; });
    return S.ws.allocations.filter(function (a) { return ids[a.id]; }).map(function (a) { return U.clone(a); });
  };
  C.ctx = function (card) {
    var w = S.ws, p = w.prefs, members = S.analysed(), ids = members.map(function (a) { return a.id; }), em = p.emphasis.filter(function (id) { return ids.indexOf(id) >= 0; });
    if (em.length && ids.indexOf(S.STANDALONE_ID) >= 0 && em.indexOf(S.STANDALONE_ID) < 0) em.push(S.STANDALONE_ID);
    if (em.length) members.forEach(function (a) { if (a.kind === 'level' && em.indexOf(a.level.parentId) >= 0 && em.indexOf(a.id) < 0) em.push(a.id); });
    return { ws: w, members: members, emphasized: em.length ? em : ids.slice(), prefs: p, scenario: S.activeScenario(), row: p.selectedRow, rowLabel: C.rowLabel(p.selectedRow), revision: S.session.revision, basis: card ? C.basisOf(card) : null };
  };
  /* ── basis: a card's own, fixed when it is added ─────────────────── */
  /** 'forward' | 'historical' for a card that reads one basis; null for structure and for Headline (both). */
  C.basisOf = function (card) {
    var t = C.types[card.type]; if (!t) return null;
    if (t.basisOf) return t.basisOf(card);
    if (t.basis === 'forward' || t.basis === 'historical') return t.basis;
    if (t.basis === 'either') { var b = card.settings && card.settings.basis; return b === 'historical' ? 'historical' : 'forward'; }
    return null;
  };
  /** Does the card read the historical period? */
  C.readsPeriod = function (card) { var t = C.types[card.type]; return !!t && (t.basis === 'dual' || C.basisOf(card) === 'historical'); };
  /** The basis prefix of a subtitle: the glyph keeps it from relying on colour. */
  C.basisLabel = function (card) {
    var b = C.basisOf(card); if (!b) return '';
    return b === 'forward' ? '<span class="basis-tag is-fwd">→ Forward-looking</span>' : '<span class="basis-tag is-hist">◷ Historical · ' + esc(UI.context.periodLabel()) + '</span>';
  };
  /** The catalogue: every entry the Add card sheet offers. A type gives one entry unless it lists several. */
  C.catalogue = function () {
    var out = [];
    C.order.forEach(function (id) { var t = C.types[id]; (t.entries || [{}]).forEach(function (e, i) { out.push({ key: id + (i ? ':' + i : ''), type: id, title: e.title || t.title, description: e.description || t.description, group: e.group || t.group, settings: e.settings || {}, isNew: !!(e.isNew != null ? e.isNew : t.isNew) }); }); });
    return out;
  };
  C.GROUPS = ['Summary', 'Forward-looking', 'Historical', 'Structure'];
  C.rowLabel = function (key) {
    if (key === '__total') return 'Portfolio total';
    var parts = key.split('/'), cat = PA.data.categoryById[parts[0]];
    if (!cat) return key;
    if (parts.length === 1) return cat.name;
    if (parts[1] === '__index') return cat.short + ' Index';
    var ins = PA.data.instrumentById[parts[1]]; return ins ? ins.name : key;
  };
  /* ── factor models: the workspace sets one, a card may pin its own ── */
  C.workspaceModel = function () { return (S.ws && S.ws.prefs.factorModel) || 'isg'; };
  C.usesModel = function (card) { var t = C.types[card.type]; if (!t || !t.factorModel) return false; return typeof t.factorModel === 'function' ? !!t.factorModel(C.settingsOf(card), card) : true; };
  C.isPinned = function (card) { var v = card.settings && card.settings.factorModel; return v === 'isg' || v === 'axioma'; };
  C.modelIdOf = function (card) { return C.isPinned(card) ? card.settings.factorModel : C.workspaceModel(); };
  C.modelOf = function (card) { return PA.data.factorModelById[C.modelIdOf(card)]; };
  /** What a subtitle says about the model: nothing while the card follows the workspace, the model when pinned. */
  C.modelDeparture = function (card) { return C.isPinned(card) ? ' · ' + C.modelOf(card).name + ' (pinned)' : ''; };
  /**
   * Method notes: the explanation behind a card's figures, one interaction
   * away. Closed by default; the workspace preference showNotes opens them on
   * every card, and a card remembers being opened or closed until the next
   * load. items: html strings (falsy ones are skipped).
   */
  C.notes = function (card, items) {
    var list = (items || []).filter(Boolean); if (!list.length) return '';
    var st = C.state[card.id] || {}, open = st.notesOpen != null ? st.notesOpen : !!(S.ws && S.ws.prefs.showNotes);
    return '<details class="card-notes"' + (open ? ' open' : '') + '><summary>About these figures</summary><div class="card-notes-body">' + list.map(function (h) { return /^</.test(h) ? h : '<span>' + h + '</span>'; }).join('') + '</div></details>';
  };
  C.modelLabel = function (card) { var m = C.modelOf(card); return m.name + ' factor model · as of ' + U.fmt.date(m.asOf) + (C.isPinned(card) ? ' · pinned' : ''); };
  /**
   * The factors a card shows under a model. A card keeps one pick per model
   * ({isg:[…], axioma:[…]}; a plain array is an ISG pick). With no pick for
   * this model, the other model's pick is mapped across where factors have a
   * counterpart; otherwise the model's defaults apply.
   */
  C.factorsFor = function (value, modelId) {
    var D = PA.data, m = D.factorModelById[modelId], otherId = modelId === 'isg' ? 'axioma' : 'isg', om = D.factorModelById[otherId];
    var mine = Array.isArray(value) ? (modelId === 'isg' ? value : null) : (value && value[modelId]);
    if (mine && mine.length) { var ok = mine.filter(function (id) { return m.factorById[id]; }); if (ok.length) return { ids: ok, mapped: null }; }
    var src = Array.isArray(value) ? value : (value && value[otherId]);
    if (src && src.length) {
      /* ISG's factors exist in Axioma under the same ids; Axioma's own six have no ISG counterpart */
      var keep = [], drop = []; src.forEach(function (id) { var f = om.factorById[id], t = f && (m.factorById[id] || (f.mapsTo && m.factorById[f.mapsTo])); if (t) { if (keep.indexOf(t.id) < 0) keep.push(t.id); } else if (f) drop.push(f.name); });
      if (keep.length) return { ids: keep, mapped: drop.length ? 'Carried over from ' + om.name + '; not in ' + m.name + ': ' + drop.join(', ') : null };
    }
    return { ids: m.defaultFactors.slice(), mapped: null };
  };
  C.setFactors = function (card, key, modelId, ids) { var c = S.card(card.id), p = U.clone(c.settings || {}), v = p[key], obj = Array.isArray(v) ? { isg: v } : (v ? U.clone(v) : {}); obj[modelId] = ids; p[key] = obj; S.updateCard(c.id, { settings: p }); };
  C.aboutModel = function (modelId) {
    var D = PA.data, m = D.factorModelById[modelId], members = S.analysed();
    var cov = members.map(function (a) { var n = PA.engine.modelNote(m, PA.engine.effective(a)); return n ? '<li><b>' + esc(a.name) + '</b>: ' + esc(n.replace(/^Proxied by the category index in [^:]+: /, '')) + '</li>' : ''; }).join('');
    UI.openDialog({ title: m.long, sub: 'As of ' + U.fmt.date(m.asOf) + '. ' + esc(m.note), wide: true,
      body: PA.ui.viz.table([{ label: 'Factor' }, { label: 'What it measures' }, { label: (modelId === 'isg' ? 'Axioma' : 'ISG') + ' counterpart' }], m.factors.map(function (f) { var o = D.factorModelById[modelId === 'isg' ? 'axioma' : 'isg']; return { cells: [esc(f.name), esc(f.description), f.mapsTo && o.factorById[f.mapsTo] ? esc(o.factorById[f.mapsTo].name) + (f.signFlip ? ' <span class="tag tag-warn">opposite sign</span>' : '') : '<span class="faint">none</span>'] }; }), { maxHeight: '260px' }) +
        '<h4 style="margin:16px 0 6px">Coverage of the compared allocations</h4>' + (cov ? '<p class="small">Not covered by ' + esc(m.name) + ', so proxied by their category index:</p><ul class="small">' + cov + '</ul>' : '<p class="small">Every product in the compared allocations is covered.</p>'),
      actions: [{ label: 'Close', primary: true }] });
  };
  C.settingsOf = function (card) { var t = C.types[card.type], out = {}; (t.settings || []).forEach(function (s) { out[s.key] = card.settings && card.settings[s.key] !== undefined ? card.settings[s.key] : s.default; }); return out; };

  /* ── loading and rendering one card ──────────────────────────────── */
  function load(card) {
    var t = C.types[card.type]; if (!t) return;
    var st = C.state[card.id] = C.state[card.id] || { status: 'idle', data: null, error: null, revision: 0 };
    var ctx = C.ctx(card), rev = ++st.revision, settings = C.settingsOf(card);
    st.status = 'loading'; paintStatus(card);
    var el0 = grid.querySelector('[data-card="' + CSS.escape(card.id) + '"]'); if (el0) paintChip(card, el0);
    var p; try { p = t.data(ctx, settings, card); } catch (e) { p = Promise.reject({ message: e.message }); }
    Promise.resolve(p).then(function (data) { if (rev !== st.revision) return; st.status = 'current'; st.data = data; st.error = null; st.ctx = ctx; paint(card); },
      function (err) { if (rev !== st.revision) return; st.status = 'failed'; st.error = err; paint(card); });
  }
  function paintStatus(card) {
    var el = grid.querySelector('[data-card="' + CSS.escape(card.id) + '"]'); if (!el) return;
    var st = C.state[card.id], bar = el.querySelector('.card-status');
    bar.innerHTML = st.status === 'loading' ? '<span class="status is-updating">' + (st.data ? 'Previous result · updating' : 'Calculating') + '</span>' : (st.status === 'failed' ? '<span class="status is-failed">Failed · ' + esc(st.error && st.error.message || '') + '</span><button type="button" class="btn btn-xs" data-retry>Retry</button>' : '');
    bar.hidden = st.status !== 'loading' && st.status !== 'failed';
    el.classList.toggle('is-stale', st.status !== 'current');
  }
  function paint(card) {
    var el = grid.querySelector('[data-card="' + CSS.escape(card.id) + '"]'); if (!el) return;
    var t = C.types[card.type], st = C.state[card.id], settings = C.settingsOf(card);
    /* a fresh body each paint, so delegated handlers a renderer attached never accumulate */
    var old = el.querySelector('.card-body'), body = old.cloneNode(false); old.parentNode.replaceChild(body, old);
    paintStatus(card); paintChip(card, el);
    var sub = t.subtitle ? t.subtitle(st.ctx || C.ctx(card), settings, card) : '', bl = C.basisLabel(card);
    el.querySelector('.card-sub').innerHTML = bl + (bl && sub ? '<span class="sep" aria-hidden="true"> · </span>' : '') + esc(sub);
    if (st.status === 'failed' && !st.data) { body.innerHTML = '<div class="chart-empty">This card could not be calculated. ' + esc(st.error && st.error.message || '') + '</div>'; return; }
    if (!st.data) { body.innerHTML = '<div class="chart-empty"><span class="spinner" style="display:inline-block;vertical-align:middle;margin-right:8px"></span>Calculating…</div>'; return; }
    try { t.render(body, st.data, st.ctx || C.ctx(card), settings, card); } catch (e) { console.error(e); body.innerHTML = '<div class="chart-empty">Could not draw this card: ' + esc(e.message) + '</div>'; }
    body.addEventListener('toggle', function (e) { if (e.target.classList && e.target.classList.contains('card-notes')) st.notesOpen = e.target.open; }, true);
    var dt = el.querySelector('.card-data');
    if (card.showData && t.dataTable) { dt.hidden = false; dt.innerHTML = t.dataTable(st.data, st.ctx || C.ctx(card), settings, card); } else { dt.hidden = true; dt.innerHTML = ''; }
  }
  function paintChip(card, el) {
    var b = el.querySelector('[data-model-chip]'); if (!b) return;
    var on = C.usesModel(card) && C.isPinned(card); b.hidden = !on; if (!on) return;
    var m = C.modelOf(card), pin = C.isPinned(card);
    b.classList.toggle('is-pinned', pin); b.innerHTML = (pin ? I.pin : '') + '<span>' + esc(m.name) + '</span>';
    b.setAttribute('aria-label', 'Factor model ' + m.name + (pin ? ', pinned to this card' : ', following the workspace') + '. Change it');
    b.setAttribute('data-tip', pin ? 'Pinned to ' + m.name + ': the workspace switch does not change this card' : 'Following the workspace factor model');
  }
  function modelItems(card) {
    var D = PA.data, t = C.types[card.type], cur = C.modelIdOf(card), pin = C.isPinned(card), wsId = C.workspaceModel(), other = cur === 'isg' ? 'axioma' : 'isg';
    var mark = function (on) { return on ? I.check : '<span class="menu-blank" aria-hidden="true"></span>'; };
    var set = function (v) { var c = S.card(card.id), p = U.clone(c.settings || {}); p.factorModel = v; S.updateCard(c.id, { settings: p }); U.announce((c.name || t.title) + (v === 'follow' ? ' follows the workspace factor model' : ' pinned to ' + D.factorModelById[v].name)); };
    return [{ head: 'Factor model for this card' },
      { label: 'Follow the workspace (' + D.factorModelById[wsId].name + ')', icon: mark(!pin), onClick: function () { set('follow'); } },
      { label: 'Pin to ISG', icon: mark(pin && cur === 'isg'), onClick: function () { set('isg'); } },
      { label: 'Pin to Axioma', icon: mark(pin && cur === 'axioma'), onClick: function () { set('axioma'); } },
      { label: 'Compare with ' + D.factorModelById[other].name + ' (adds a pinned copy)', icon: I.plus, onClick: function () { compareModel(card, other); } },
      { label: 'About ' + D.factorModelById[cur].name + ' and its coverage', icon: I.info, onClick: function () { C.aboutModel(cur); } }];
  }
  function modelMenu(btn, card) { UI.menu(btn, modelItems(card), { align: 'end' }); }
  /** A copy of the card pinned to the other model, placed beside it (or below when there is no room). */
  function compareModel(card, other) {
    var D = PA.data, t = C.types[card.type], copy = U.clone(card);
    copy.id = U.uid('c'); copy.settings = U.clone(card.settings || {}); copy.settings.factorModel = other;
    copy.name = (card.name || t.title) + ' · ' + D.factorModelById[other].name;
    var beside = card.x + 2 * card.w <= COLS; copy.x = beside ? card.x + card.w : card.x; copy.y = beside ? card.y : card.y + card.h;
    S.addCard(copy); commit(copy.id, { x: copy.x, y: copy.y, w: copy.w, h: copy.h });
    UI.toast('Added a copy pinned to ' + D.factorModelById[other].name + ' ' + (beside ? 'beside' : 'below') + ' the original.', { action: { label: 'Undo', fn: S.undo } });
    scrollToCard(copy.id);
  }
  C.repaint = function (id) { var c = S.card(id); if (c) paint(c); };
  C.reload = function (id) { var c = S.card(id); if (c) load(c); };

  /* ── chrome ──────────────────────────────────────────────────────── */
  function cardHtml(card) {
    var t = C.types[card.type];
    if (!t) return '<article class="card" data-card="' + esc(card.id) + '" style="' + pos(card) + '"><div class="card-body"><div class="chart-empty">Unknown card type “' + esc(card.type) + '”.</div></div></article>';
    return '<article class="card" data-card="' + esc(card.id) + '" style="' + pos(card) + '" tabindex="0" aria-label="' + esc((card.name || t.title) + ' card. Arrow keys move it, shift with arrows resizes it.') + '">' +
      '<header class="card-head"><span class="card-grip" aria-hidden="true">' + I.grip + '</span><div class="card-title"><h3>' + esc(card.name || t.title) + (card.followRow && t.supportsRow ? ' <span class="tag tag-info" data-tip="Follows the row selected in the Drivers &amp; Differences table">Row</span>' : '') + '</h3><div class="card-sub"></div></div>' +
      '<div class="card-tools"><button type="button" class="model-chip" data-model-chip hidden aria-haspopup="menu" aria-expanded="false"></button><button type="button" class="btn btn-icon btn-ghost btn-sm" data-settings aria-label="Card settings" aria-haspopup="dialog" aria-expanded="false" data-tip="Settings">' + I.sliders + '</button><button type="button" class="btn btn-icon btn-ghost btn-sm" data-menu aria-label="Card menu" aria-haspopup="menu" aria-expanded="false">' + I.moreH + '</button></div></header>' +
      '<div class="card-status" hidden></div><div class="card-body"></div><div class="card-data" hidden></div>' +
      '<button type="button" class="card-resize" data-resize aria-label="Resize card" tabindex="-1"></button></article>';
  }
  function pos(card) { return 'grid-column:' + (card.x + 1) + ' / span ' + card.w + ';grid-row:' + (card.y + 1) + ' / span ' + card.h; }

  C.render = function () {
    if (!grid || !S.ws) return;
    var cards = S.ws.cards;
    if (!cards.length) { grid.innerHTML = '<div class="empty" style="grid-column:1/-1">' + I.layers + '<h3>No cards yet</h3><p>A workspace is a collection of cards, each one a piece of analysis. Add cards from the repository.</p><div class="actions"><button type="button" class="btn btn-primary" data-add-card>' + I.plus + '<span>Add card</span></button></div></div>'; return; }
    grid.innerHTML = cards.map(cardHtml).join('');
    cards.forEach(function (c) { if (C.state[c.id] && C.state[c.id].data) paint(c); load(c); });
  };
  function rerenderAll() { if (S.ws) S.ws.cards.forEach(load); }

  /* ── settings popover and menu ───────────────────────────────────── */
  function settingsBody(card) {
    var t = C.types[card.type], settings = C.settingsOf(card), html = '';
    if (C.usesModel(card)) { var wsm = PA.data.factorModelById[C.workspaceModel()].name, fmv = C.isPinned(card) ? card.settings.factorModel : 'follow'; html += '<div class="field"><label for="cs-factorModel">Factor model</label><select id="cs-factorModel" data-set="factorModel" class="input-sm">' + [['follow', 'Follow the workspace (' + wsm + ')'], ['isg', 'ISG'], ['axioma', 'Axioma']].map(function (o) { return '<option value="' + o[0] + '"' + (fmv === o[0] ? ' selected' : '') + '>' + esc(o[1]) + '</option>'; }).join('') + '</select></div>'; }
    (t.settings || []).forEach(function (s) {
      if (s.when && !s.when(settings, card)) return;
      var opts = typeof s.options === 'function' ? s.options(card) : s.options;
      if (s.type === 'factors') { var m = C.modelOf(card), cur = C.factorsFor(settings[s.key], m.id).ids; html += '<div class="field"><span class="label">' + esc(s.label) + ' · ' + esc(m.name) + '</span><div class="factor-pick">' + m.factors.map(function (f) { return '<button type="button" class="fchip" data-factor="' + s.key + '" data-val="' + esc(f.id) + '" aria-pressed="' + (cur.indexOf(f.id) >= 0) + '" data-tip="' + esc(f.description) + '">' + esc(f.name) + '</button>'; }).join('') + '</div><span class="field-hint">Each factor model keeps its own selection.</span></div>'; return; }
      /* an option may carry a reason it is unavailable (o[2]): listed, but disabled */
      if (s.type === 'select') html += '<div class="field"><label for="cs-' + s.key + '">' + esc(s.label) + '</label><select id="cs-' + s.key + '" data-set="' + s.key + '" class="input-sm">' + opts.map(function (o) { return '<option value="' + esc(o[0]) + '"' + (String(settings[s.key]) === String(o[0]) ? ' selected' : '') + (o[2] ? ' disabled' : '') + '>' + esc(o[1] + (o[2] ? ' — ' + o[2] : '')) + '</option>'; }).join('') + '</select>' + (s.hint ? '<span class="field-hint">' + esc(typeof s.hint === 'function' ? s.hint(settings, card) : s.hint) + '</span>' : '') + '</div>';
      else if (s.type === 'multi') html += '<div class="field"><span class="label">' + esc(s.label) + '</span><div class="factor-pick">' + opts.map(function (o) { return '<button type="button" class="fchip" data-multi="' + s.key + '" data-val="' + esc(o[0]) + '" aria-pressed="' + ((settings[s.key] || []).indexOf(o[0]) >= 0) + '">' + esc(o[1]) + '</button>'; }).join('') + '</div></div>';
      else if (s.type === 'toggle') html += '<label class="switch"><input type="checkbox" data-set="' + s.key + '"' + (settings[s.key] ? ' checked' : '') + '><span class="track"></span><span>' + esc(s.label) + '</span></label>';
    });
    if (t.supportsRow) html += '<label class="switch"><input type="checkbox" data-follow' + (card.followRow ? ' checked' : '') + '><span class="track"></span><span>Follow the selected row</span></label><div class="field-hint">' + (card.followRow ? 'Showing ' + esc(C.rowLabel(S.ws.prefs.selectedRow)) + '. Select another row in the table to change it.' : 'Showing the whole portfolio.') + '</div>';
    if (!html) html += '<div class="field-hint">This card has no settings. It follows the context bar.</div>';
    return html;
  }
  function settingsPopover(btn, card) {
    var t = C.types[card.type], id = card.id;
    UI.popover(btn, { html: '<div class="menu-head">' + esc(card.name || t.title) + '</div><div class="card-settings">' + settingsBody(card) + '</div>', role: 'dialog', align: 'end', cls: 'card-pop', onOpen: function (el) {
      /* settings can show or hide others, so the body is redrawn after each change, keeping focus */
      var redraw = function (focusSel) { var cs = el.querySelector('.card-settings'); cs.innerHTML = settingsBody(S.card(id)); var f = focusSel && cs.querySelector(focusSel); if (f) f.focus(); };
      var setOne = function (key, value) { var c = S.card(id), p = U.clone(c.settings || {}); p[key] = value; S.updateCard(id, { settings: p }); };
      U.on(el, 'change', 'select[data-set]', function (e, sel) { setOne(sel.dataset.set, sel.value); redraw('#' + sel.id); });
      U.on(el, 'change', 'input[type=checkbox][data-set]', function (e, cb) { setOne(cb.dataset.set, cb.checked); redraw('input[data-set="' + cb.dataset.set + '"]'); });
      U.on(el, 'change', '[data-follow]', function (e, cb) { S.updateCard(id, { followRow: cb.checked }); redraw('[data-follow]'); });
      U.on(el, 'click', '[data-multi]', function (e, b) { var c = S.card(id), key = b.dataset.multi, cur = (C.settingsOf(c)[key] || []).slice(), i = cur.indexOf(b.dataset.val); if (i >= 0) { if (cur.length === 1) { UI.toast('Keep at least one selected.'); return; } cur.splice(i, 1); } else cur.push(b.dataset.val); var spec = t.settings.filter(function (s) { return s.key === key; })[0], order = (typeof spec.options === 'function' ? spec.options(c) : spec.options).map(function (o) { return o[0]; }); setOne(key, order.filter(function (v) { return cur.indexOf(v) >= 0; })); redraw('[data-multi="' + key + '"][data-val="' + CSS.escape(b.dataset.val) + '"]'); });
      U.on(el, 'click', '[data-factor]', function (e, b) { var c = S.card(id), key = b.dataset.factor, m = C.modelOf(c), cur = C.factorsFor(C.settingsOf(c)[key], m.id).ids.slice(), i = cur.indexOf(b.dataset.val); if (i >= 0) { if (cur.length === 1) { UI.toast('Keep at least one factor selected.'); return; } cur.splice(i, 1); } else cur.push(b.dataset.val); C.setFactors(c, key, m.id, m.factors.map(function (f) { return f.id; }).filter(function (v) { return cur.indexOf(v) >= 0; })); redraw('[data-factor="' + key + '"][data-val="' + CSS.escape(b.dataset.val) + '"]'); });
    } });
  }
  function cardMenu(btn, card) {
    var t = C.types[card.type];
    UI.menu(btn, [
      { head: card.name || t.title },
      { label: 'Rename', onClick: function () { UI.prompt({ title: 'Rename card', label: 'Card name', value: card.name || t.title }).then(function (n) { if (n) S.updateCard(card.id, { name: n }); }); } },
      { label: card.showData ? 'Hide data table' : 'Show data table', icon: I.table, disabled: !t.dataTable, onClick: function () { S.updateCard(card.id, { showData: !card.showData }); } },
      { label: 'Duplicate', icon: I.copy, onClick: function () { var copy = U.clone(card); copy.id = U.uid('c'); copy.y = bottom(); S.addCard(copy); } },
      { label: 'Save to card repository', icon: I.export, onClick: function () { saveToRepository(card); } }
    ].concat(t.basis === 'either' ? [{ sep: true }, { label: C.basisOf(card) === 'forward' ? 'Show historical instead' : 'Show forward-looking instead', icon: I.reset, onClick: function () { C.setBasis(card, C.basisOf(card) === 'forward' ? 'historical' : 'forward'); } }] : []).concat(C.usesModel(card) ? [{ sep: true }].concat(modelItems(card)) : []).concat([
      { sep: true },
      { label: 'Remove from workspace', icon: I.trash, onClick: function () { S.removeCard(card.id); UI.toast('Card removed.', { action: { label: 'Undo', fn: S.undo } }); } }
    ]), { align: 'end' });
  }
  /** Switch an either-basis card between forward-looking and historical. */
  C.setBasis = function (card, basis) {
    var c = S.card(card.id), p = U.clone(c.settings || {}), t = C.types[c.type]; p.basis = basis;
    S.updateCard(c.id, { settings: p }); U.announce((c.name || t.title) + ' now shows ' + (basis === 'forward' ? 'forward-looking' : 'historical') + ' figures');
  };
  function saveToRepository(card) {
    var t = C.types[card.type];
    UI.prompt({ title: 'Save card to the repository', sub: 'Saved cards keep their settings and are available in every workspace.', label: 'Name', value: card.name || t.title, confirmLabel: 'Save' }).then(function (name) {
      if (!name) return;
      PA.api.saveCard({ id: U.uid('card'), name: name, type: card.type, settings: U.clone(card.settings || {}), followRow: !!card.followRow, createdBy: 'F. Barker', createdAt: new Date().toISOString() }).then(function () { UI.toast('“' + name + '” saved to the card repository.'); if (sheetEl && !sheetEl.hidden) renderSheet(); });
    });
  }
  function bottom() { return S.ws.cards.reduce(function (m, c) { return Math.max(m, c.y + c.h); }, 0); }

  /* ── layout engine ───────────────────────────────────────────────── */
  function overlaps(a, b) { return a.id !== b.id && a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y; }
  /** Fix `fixedId` where it is; push others down out of its way; then compact upwards. */
  function resolve(cards, fixedId) {
    var list = cards.map(function (c) { return { id: c.id, x: c.x, y: c.y, w: c.w, h: c.h }; });
    var fixed = list.filter(function (c) { return c.id === fixedId; })[0];
    var placed = fixed ? [fixed] : [];
    list.filter(function (c) { return c.id !== fixedId; }).sort(function (a, b) { return a.y - b.y || a.x - b.x; }).forEach(function (c) { while (placed.some(function (p) { return overlaps(c, p); })) c.y++; placed.push(c); });
    /* compact: every card moves up as far as it can without crossing another */
    var byY = placed.slice().sort(function (a, b) { return a.y - b.y || a.x - b.x; }), done = [];
    byY.forEach(function (c) { if (c.id !== fixedId) { while (c.y > 0) { c.y--; if (done.some(function (p) { return overlaps(c, p); })) { c.y++; break; } } } done.push(c); });
    var out = {}; done.forEach(function (c) { out[c.id] = { x: c.x, y: c.y, w: c.w, h: c.h }; }); return out;
  }
  /* A card type's minimum width is given in columns of a standard-width canvas (about 80px each).
     On a wider canvas each column is wider, so the minimum is converted to the number of columns
     that gives the same physical width; heights are fixed-height rows and need no conversion. */
  var REF_COL = 80;
  function minFor(card, col) { var t = C.types[card.type], m = (t && t.min) || { w: 3, h: 3 }, px = m.w * REF_COL + (m.w - 1) * GAP; col = col || cellSize().col; return { w: U.clamp(Math.ceil((px + GAP) / (col + GAP)), 1, m.w), h: m.h }; }
  function cellSize() { var r = grid.getBoundingClientRect(); return { col: (r.width - GAP * (COLS - 1)) / COLS, row: ROW, left: r.left, top: r.top }; }
  function startDrag(e, el, card, mode) {
    if (window.innerWidth <= 900) return;
    e.preventDefault();
    var cs = cellSize(), startX = e.clientX, startY = e.clientY, o = { x: card.x, y: card.y, w: card.w, h: card.h }, min = minFor(card, cs.col);
    var live = { x: o.x, y: o.y, w: o.w, h: o.h };
    el.classList.add(mode === 'move' ? 'is-dragging' : 'is-resizing'); el.setPointerCapture(e.pointerId);
    var ghost = U.html('<div class="card-ghost"></div>'); grid.appendChild(ghost);
    var paintGhost = function () { ghost.style.gridColumn = (live.x + 1) + ' / span ' + live.w; ghost.style.gridRow = (live.y + 1) + ' / span ' + live.h; };
    paintGhost();
    var move = function (ev) {
      var dx = Math.round((ev.clientX - startX) / (cs.col + GAP)), dy = Math.round((ev.clientY - startY) / (cs.row + GAP));
      if (mode === 'move') { live.x = U.clamp(o.x + dx, 0, COLS - o.w); live.y = Math.max(0, o.y + dy); el.style.transform = 'translate(' + (ev.clientX - startX) + 'px,' + (ev.clientY - startY) + 'px)'; }
      else { live.w = U.clamp(o.w + dx, min.w, COLS - o.x); live.h = Math.max(min.h, o.h + dy); el.style.gridColumn = (live.x + 1) + ' / span ' + live.w; el.style.gridRow = (live.y + 1) + ' / span ' + live.h; }
      paintGhost();
    };
    var up = function () {
      el.removeEventListener('pointermove', move); el.removeEventListener('pointerup', up); el.removeEventListener('pointercancel', up);
      el.classList.remove('is-dragging', 'is-resizing'); el.style.transform = ''; ghost.remove();
      commit(card.id, live);
    };
    el.addEventListener('pointermove', move); el.addEventListener('pointerup', up); el.addEventListener('pointercancel', up);
  }
  function commit(id, p) {
    var cards = S.ws.cards.map(function (c) { return c.id === id ? Object.assign({}, c, p) : c; });
    var positions = resolve(cards, id);
    var changed = S.ws.cards.some(function (c) { var q = positions[c.id]; return q.x !== c.x || q.y !== c.y || q.w !== c.w || q.h !== c.h; });
    if (!changed) { applyPositions(); return; }
    S.setLayout(positions); applyPositions();
    var c = S.card(id); if (c) { C.repaint(id); }
  }
  function applyPositions() { S.ws.cards.forEach(function (c) { var el = grid.querySelector('[data-card="' + CSS.escape(c.id) + '"]'); if (el) el.style.cssText = pos(c); }); }
  C.resetLayout = function () {
    var y = 0; var positions = {};
    S.ws.cards.forEach(function (c) { var t = C.types[c.type], w = t ? t.size.w : 6, h = t ? t.size.h : 6; positions[c.id] = { x: 0, y: y, w: w, h: h }; y += h; });
    var cards = S.ws.cards.map(function (c) { return Object.assign({}, c, positions[c.id]); });
    /* pack two half-width cards side by side where possible */
    var packed = {}, cursorY = 0, cursorX = 0, rowH = 0;
    cards.forEach(function (c) { if (cursorX + c.w > COLS) { cursorY += rowH; cursorX = 0; rowH = 0; } packed[c.id] = { x: cursorX, y: cursorY, w: c.w, h: c.h }; cursorX += c.w; rowH = Math.max(rowH, c.h); if (cursorX >= COLS) { cursorY += rowH; cursorX = 0; rowH = 0; } });
    S.setLayout(packed); applyPositions(); S.ws.cards.forEach(function (c) { C.repaint(c.id); });
  };

  /* ── add-card sheet (the card repository) ────────────────────────── */
  var savedCards = null, sheetGroup = '';
  function renderSheet() {
    if (!sheetEl) return;
    var cat = C.catalogue(), groups = C.GROUPS.filter(function (g) { return cat.some(function (e) { return e.group === g; }); });
    var chip = function (g, label, n) { return '<button type="button" class="rail-chip sheet-chip" data-sheet-group="' + esc(g) + '" aria-pressed="' + (sheetGroup === g) + '">' + esc(label) + ' <span class="faint">' + n + '</span></button>'; };
    sheetEl.innerHTML = '<div class="sheet-head"><h2>Card repository</h2><span class="spacer"></span><button type="button" class="btn btn-icon btn-ghost" data-close aria-label="Close">' + I.close + '</button></div>' +
      '<div class="sheet-body"><div class="search-wrap" style="margin-bottom:10px">' + I.search + '<input type="search" id="sheet-search" placeholder="Find a card…" aria-label="Find a card"></div>' +
      '<div class="rail-chips sheet-chips" role="group" aria-label="Show cards by basis">' + chip('', 'All', cat.length) + groups.map(function (g) { return chip(g, g, cat.filter(function (e) { return e.group === g; }).length); }).join('') + '</div>' +
      '<div class="sheet-sec" data-sec="saved"' + (sheetGroup ? ' hidden' : '') + '><div class="eyebrow" style="margin:12px 0 8px">Saved cards · shared</div><div class="sheet-list" id="sheet-saved">' + (savedCards === null ? '<div class="faint small">Loading…</div>' : savedCards.length ? savedCards.map(function (s) { var t = C.types[s.type]; return '<div class="sheet-item" data-text="' + esc((s.name + ' ' + (t ? t.title : '')).toLowerCase()) + '"><div><b>' + esc(s.name) + '</b><small>' + esc(t ? t.title : s.type) + ' · ' + esc(s.createdBy) + '</small></div><div class="row"><button type="button" class="btn btn-xs btn-primary" data-add-saved="' + esc(s.id) + '">Add</button><button type="button" class="btn btn-icon btn-xs btn-ghost" data-del-saved="' + esc(s.id) + '" aria-label="Delete saved card">' + I.trash + '</button></div></div>'; }).join('') : '<div class="faint small">No saved cards yet. Use a card’s menu to save it with its settings.</div>') + '</div></div>' +
      groups.map(function (g) { return '<div class="sheet-sec" data-sec="' + esc(g) + '"' + (sheetGroup && sheetGroup !== g ? ' hidden' : '') + '><div class="eyebrow" style="margin:16px 0 8px">' + esc(g) + '</div><div class="sheet-list">' + cat.filter(function (e) { return e.group === g; }).map(function (e) { return '<div class="sheet-item" data-text="' + esc((e.title + ' ' + e.description + ' ' + g).toLowerCase()) + '"><div><b>' + esc(e.title) + '</b><small>' + esc(e.description) + '</small></div><button type="button" class="btn btn-xs" data-add-type="' + esc(e.key) + '" aria-label="Add ' + esc(e.title) + '">Add</button></div>'; }).join('') + '</div></div>'; }).join('') + '</div>';
    sheetEl.querySelector('[data-close]').onclick = function () { S.setSession('addCardOpen', false); };
    sheetEl.querySelector('#sheet-search').oninput = function (e) { var q = e.target.value.trim().toLowerCase(); U.$$('.sheet-item', sheetEl).forEach(function (it) { it.hidden = !!q && it.dataset.text.indexOf(q) < 0; }); U.$$('.sheet-sec', sheetEl).forEach(function (sec) { sec.classList.toggle('is-empty', !U.$$('.sheet-item', sec).some(function (it) { return !it.hidden; })); }); };
  }
  function wireSheet() {
    U.on(sheetEl, 'click', '[data-sheet-group]', function (e, b) { sheetGroup = b.dataset.sheetGroup; U.$$('[data-sheet-group]', sheetEl).forEach(function (x) { x.setAttribute('aria-pressed', String(x === b)); }); U.$$('.sheet-sec', sheetEl).forEach(function (sec) { sec.hidden = sheetGroup ? sec.dataset.sec !== sheetGroup : false; }); });
    U.on(sheetEl, 'click', '[data-add-type]', function (e, b) { var en = C.catalogue().filter(function (x) { return x.key === b.dataset.addType; })[0], t = C.types[en.type]; var card = { id: U.uid('c'), type: t.id, x: 0, y: bottom(), w: t.size.w, h: t.size.h, settings: U.clone(en.settings), followRow: !!t.defaultFollowRow }; S.addCard(card); UI.toast('“' + en.title + '” added at the bottom of the workspace.'); scrollToCard(card.id); });
    U.on(sheetEl, 'click', '[data-add-saved]', function (e, b) { var s = savedCards.filter(function (x) { return x.id === b.dataset.addSaved; })[0], t = C.types[s.type]; if (!t) return; var card = { id: U.uid('c'), type: s.type, name: s.name, x: 0, y: bottom(), w: t.size.w, h: t.size.h, settings: U.clone(s.settings || {}), followRow: !!s.followRow }; S.addCard(card); UI.toast('“' + s.name + '” added.'); scrollToCard(card.id); });
    U.on(sheetEl, 'click', '[data-del-saved]', function (e, b) { var s = savedCards.filter(function (x) { return x.id === b.dataset.delSaved; })[0]; UI.confirm({ title: 'Delete “' + s.name + '” from the repository?', sub: 'Cards already placed in workspaces are kept.', confirmLabel: 'Delete', danger: true }).then(function (ok) { if (ok) PA.api.deleteSavedCard(s.id).then(function () { savedCards = savedCards.filter(function (x) { return x.id !== s.id; }); renderSheet(); }); }); });
  }
  /** Add a card of a type at the bottom of the canvas and bring it into view. */
  C.addCardOfType = function (type, settings, followRow) { var t = C.types[type]; if (!t) return null; var card = { id: U.uid('c'), type: type, x: 0, y: bottom(), w: t.size.w, h: t.size.h, settings: U.clone(settings || {}), followRow: !!followRow }; S.addCard(card); scrollToCard(card.id); return card; };
  C.scrollToCard = function (id) { scrollToCard(id); };
  function scrollToCard(id) { setTimeout(function () { var el = grid.querySelector('[data-card="' + CSS.escape(id) + '"]'); if (el) { el.scrollIntoView({ block: 'nearest', behavior: 'smooth' }); el.focus(); } }, 50); }
  var untrap = null, sheetTrigger = null;
  function toggleSheet() {
    var open = S.session.addCardOpen;
    sheetEl.hidden = !open;
    var scrim = U.$('#sheet-scrim');
    if (open) {
      sheetTrigger = document.activeElement;
      if (!scrim) { scrim = U.html('<div class="drawer-scrim" id="sheet-scrim" style="z-index:40"></div>'); scrim.onclick = function () { S.setSession('addCardOpen', false); }; U.$('#view-ws').appendChild(scrim); }
      renderSheet(); untrap = U.trapFocus(sheetEl); sheetEl.querySelector('#sheet-search').focus();
      if (savedCards === null) PA.api.listSavedCards().then(function (list) { savedCards = list; if (!sheetEl.hidden) { var q = sheetEl.querySelector('#sheet-search').value; renderSheet(); sheetEl.querySelector('#sheet-search').value = q; } });
    } else { if (scrim) scrim.remove(); if (untrap) untrap(); untrap = null; if (sheetTrigger && document.contains(sheetTrigger)) sheetTrigger.focus(); }
  }
  C.invalidateSavedCards = function () { savedCards = null; };

  /* ── events ──────────────────────────────────────────────────────── */
  C.init = function () {
    grid = U.$('#cards'); sheetEl = U.$('#card-sheet');
    wireSheet();
    U.on(grid, 'click', '[data-model-chip]', function (e, b) { modelMenu(b, S.card(b.closest('.card').dataset.card)); });
    U.on(grid, 'click', '[data-settings]', function (e, b) { settingsPopover(b, S.card(b.closest('.card').dataset.card)); });
    U.on(grid, 'click', '[data-menu]', function (e, b) { cardMenu(b, S.card(b.closest('.card').dataset.card)); });
    U.on(grid, 'click', '[data-retry]', function (e, b) { load(S.card(b.closest('.card').dataset.card)); });
    U.on(grid, 'click', '[data-add-card]', function () { S.setSession('addCardOpen', true); });
    U.on(grid, 'pointerdown', '.card-head', function (e, h) { if (e.target.closest('button')) return; if (e.button !== 0) return; var el = h.closest('.card'); startDrag(e, el, S.card(el.dataset.card), 'move'); });
    U.on(grid, 'pointerdown', '[data-resize]', function (e, b) { if (e.button !== 0) return; var el = b.closest('.card'); startDrag(e, el, S.card(el.dataset.card), 'resize'); });
    grid.addEventListener('keydown', function (e) {
      var el = e.target.closest && e.target.closest('.card'); if (!el || e.target !== el) return;
      var card = S.card(el.dataset.card); if (!card) return;
      var min = minFor(card), p = { x: card.x, y: card.y, w: card.w, h: card.h }, k = e.key;
      if (['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].indexOf(k) < 0) return;
      e.preventDefault();
      if (e.shiftKey) { if (k === 'ArrowRight') p.w = Math.min(COLS - p.x, p.w + 1); if (k === 'ArrowLeft') p.w = Math.max(min.w, p.w - 1); if (k === 'ArrowDown') p.h++; if (k === 'ArrowUp') p.h = Math.max(min.h, p.h - 1); }
      else { if (k === 'ArrowRight') p.x = Math.min(COLS - p.w, p.x + 1); if (k === 'ArrowLeft') p.x = Math.max(0, p.x - 1); if (k === 'ArrowDown') p.y++; if (k === 'ArrowUp') p.y = Math.max(0, p.y - 1); }
      commit(card.id, p); el.focus();
      U.announce((card.name || t.title) + (e.shiftKey ? ' resized to ' + p.w + ' by ' + p.h : ' moved to column ' + (p.x + 1) + ', row ' + (p.y + 1)));
    });
    S.subscribe(function (type, extra) {
      if (!S.ws) return;
      if (type === 'load') { C.state = {}; cache = {}; C.render(); sheetEl.hidden = true; }
      if (type === 'refresh') rerenderAll();
      if (type === 'update' || type === 'undo' || type === 'redo') {
        /* cards added, removed or changed: rebuild the chrome, keep data where the card is unchanged */
        var ids = S.ws.cards.map(function (c) { return c.id; }), domIds = U.$$('.card', grid).map(function (el) { return el.dataset.card; });
        var same = ids.length === domIds.length && ids.every(function (id, i) { return id === domIds[i]; });
        if (!same) C.render(); else if (!extra.refresh) { S.ws.cards.forEach(function (c) { var el = grid.querySelector('[data-card="' + CSS.escape(c.id) + '"]'); el.querySelector('.card-title h3').innerHTML = esc(c.name || C.types[c.type].title) + (c.followRow && C.types[c.type].supportsRow ? ' <span class="tag tag-info">Row</span>' : ''); load(c); }); }
      }
      if (type === 'pref' && extra.key === 'showNotes') S.ws.cards.forEach(function (c) { if (C.state[c.id]) C.state[c.id].notesOpen = null; paint(c); });
      if (type === 'pref' && extra.key === 'factorModel') S.ws.cards.forEach(function (c) { if (C.usesModel(c) && !C.isPinned(c)) load(c); });
      if (type === 'pref' && (extra.key === 'selectedRow' || extra.key === 'emphasis' || extra.key === 'expanded')) S.ws.cards.forEach(function (c) { var t = C.types[c.type]; if (extra.key === 'selectedRow' && c.followRow && t.supportsRow) load(c); else if (t.livePrefs) paint(c); });
      if (type === 'session' && extra.key === 'addCardOpen') toggleSheet();
    });
    if (window.ResizeObserver) new ResizeObserver(U.debounce(function () { if (S.ws) S.ws.cards.forEach(function (c) { if (C.state[c.id] && C.state[c.id].data) paint(c); }); }, 150)).observe(grid);
    document.addEventListener('keydown', function (e) { if (e.key === 'Escape' && S.session.addCardOpen) S.setSession('addCardOpen', false); });
  };
})();

/* ─────────────────────────────────────────────────────────────────────────
   Portfolio Analytics · the scenario drawer
   named scenarios, scope, the assumptions matrix (asset class, factor and
   holding levels), the correlation matrix with a synchronised pair editor,
   override indicators, resets and validity checks
   ───────────────────────────────────────────────────────────────────────── */
(function () {
  'use strict';
  var PA = window.PA, U = PA.util, esc = U.esc, S = PA.store, UI = PA.ui, D = PA.data, E = PA.engine, I = U.icon, F = U.fmt;
  var Dr = UI.drawer = {};
  var el, trigger = null, level = 'assetClass', overridesOnly = false, search = '', invalid = {};
  var LIMITS = { return: [-50, 50, '%'], vol: [0, 100, '%'], premium: [-20, 20, '%'] };

  function scenario() { return S.activeScenario(); }
  function resolved() { return E.resolve(scenario()); }

  /* ── render ──────────────────────────────────────────────────────── */
  Dr.render = function () {
    if (!el || !S.ws) return;
    if (!S.session.drawerOpen) { el.hidden = true; var sc0 = U.$('#drawer-scrim'); if (sc0) sc0.remove(); return; }
    el.hidden = false;
    var sc = scenario(), w = S.ws, members = S.members();
    var focusKey = document.activeElement && el.contains(document.activeElement) ? document.activeElement.getAttribute('data-fkey') : null;
    var tab = S.session.drawerTab;
    el.innerHTML = '<button type="button" class="resizer" id="drawer-resizer" role="separator" aria-orientation="vertical" aria-label="Resize the scenario drawer" aria-valuemin="360" aria-valuemax="640" aria-valuenow="' + (w.prefs.drawerWidth || 460) + '" tabindex="0" style="position:absolute;left:0;top:0;bottom:0"></button>' +
      '<div class="drawer-head"><h2 id="drawer-title">Scenario assumptions</h2><span class="spacer"></span>' + (sc ? '<span class="override-count">' + S.overrideCount(sc) + ' override' + (S.overrideCount(sc) === 1 ? '' : 's') + '</span>' : '<span class="tag">Base case</span>') + '<button type="button" class="btn btn-icon btn-ghost" id="drawer-close" aria-label="Close the scenario drawer">' + I.close + '</button></div>' +
      '<div class="drawer-body">' +
      '<div class="drawer-sec"><div class="eyebrow"><span>Scenario</span></div><div class="scn-pick"><select id="scn-sel" aria-label="Working scenario" data-fkey="scn-sel"><option value=""' + (sc ? '' : ' selected') + '>Base case · platform assumptions</option>' + w.scenarios.map(function (s) { return '<option value="' + esc(s.id) + '"' + (sc && sc.id === s.id ? ' selected' : '') + '>' + esc(s.name) + ' · ' + S.overrideCount(s) + '</option>'; }).join('') + '</select>' +
        '<button type="button" class="btn btn-sm btn-primary" id="scn-new">' + I.plus + '<span>New</span></button><button type="button" class="btn btn-icon btn-sm" id="scn-menu" aria-label="Scenario actions" aria-haspopup="menu" aria-expanded="false"' + (sc ? '' : ' disabled') + '>' + I.moreH + '</button></div>' +
        '<div class="field-hint">' + (sc ? 'Overrides are local to this workspace and autosave with it. The platform model is never edited.' : 'The base case is read-only. Create a scenario to override returns, volatilities, premia and correlations.') + '</div></div>' +
      (sc ? '<div class="drawer-sec"><div class="eyebrow"><span>Applied to</span><span class="small faint" style="text-transform:none;letter-spacing:0;font-weight:500">' + sc.scope.filter(function (id) { return w.comparison.members.indexOf(id) >= 0; }).length + ' of ' + members.length + ' compared</span></div><div class="scope-list">' + members.map(function (a) { return '<label class="check"><input type="checkbox" data-scope="' + esc(a.id) + '"' + (sc.scope.indexOf(a.id) >= 0 ? ' checked' : '') + '><span class="dot" style="background:' + UI.colorOf(a) + '"></span>' + esc(a.name) + '</label>'; }).join('') + (members.length ? '' : '<span class="faint small">No allocations in the comparison.</span>') + '</div><div class="field-hint">Allocations outside the scope keep base-case results and are labelled so in the table.</div></div>' : '') +
      '<div class="drawer-tabs" role="tablist"><button type="button" role="tab" id="tab-assumptions" aria-selected="' + (tab === 'assumptions') + '" aria-controls="drawer-pane" data-tab="assumptions">Assumptions</button><button type="button" role="tab" id="tab-corr" aria-selected="' + (tab === 'correlations') + '" aria-controls="drawer-pane" data-tab="correlations">Correlations</button></div>' +
      '<div id="drawer-pane" role="tabpanel" aria-labelledby="tab-' + (tab === 'assumptions' ? 'assumptions' : 'corr') + '" style="display:flex;flex-direction:column;flex:1;min-height:0">' + (tab === 'assumptions' ? renderAssumptions(sc) : renderCorrelations(sc)) + '</div>' +
      '</div>' +
      '<div class="drawer-foot"><span>' + (sc ? 'Edits recalculate in-scope results. Base values stay beside each override.' : 'Values shown are the platform base case.') + '</span><span class="spacer"></span>' + (sc ? '<button type="button" class="btn btn-ghost btn-xs" id="scn-reset-all" data-tip="Remove every override in this scenario">' + I.reset + '<span>Reset scenario</span></button>' : '') + '</div>';
    wireFresh(sc);
    if (focusKey) { var f = el.querySelector('[data-fkey="' + CSS.escape(focusKey) + '"]'); if (f) f.focus(); }
    initResize();
    if (window.innerWidth <= 1280 && !U.$('#drawer-scrim')) { var scrim = U.html('<div class="drawer-scrim" id="drawer-scrim"></div>'); scrim.onclick = function () { S.setSession('drawerOpen', false); }; U.$('#view-ws').appendChild(scrim); }
  };

  function cellHtml(o) {
    var isOv = o.source === 'override', inv = invalid[o.key];
    return '<span class="mcell' + (isOv ? ' is-override' : '') + (inv ? ' is-invalid' : '') + (o.inherited ? ' is-inherited' : '') + '"><input type="number" step="0.1" value="' + (inv != null ? esc(inv) : F.num(o.value, o.value % 1 ? 2 : 1).replace('−', '-')) + '" data-cell="' + esc(o.key) + '" data-fkey="c:' + esc(o.key) + '" aria-label="' + esc(o.label) + '"' + (o.disabled ? ' disabled' : '') + (inv != null ? ' aria-invalid="true"' : '') + ' data-tip="' + esc((isOv ? 'Override. Base ' + F.num(o.base, 1) + o.unit : o.inherited ? 'Inherited: ' + o.inherited : o.source === 'factor' ? 'Derived from factor premia (a factor override changed it). Base ' + F.num(o.base, 1) + o.unit : 'Platform base value')) + '"><span class="unit">' + o.unit + '</span>' +
      (isOv && !o.disabled ? '<button type="button" class="reset" data-reset="' + esc(o.key) + '" aria-label="Reset ' + esc(o.label) + ' to base" data-tip="Reset to base ' + F.num(o.base, 1) + o.unit + '">' + I.reset + '</button>' : '') + '</span>' +
      '<span class="src' + (isOv ? ' is-override' : '') + '">' + (isOv ? 'override · base ' + F.num(o.base, 1) : o.inherited ? 'inherits' : o.source === 'factor' ? 'via factors' : 'model') + '</span>';
  }
  function renderAssumptions(sc) {
    var R = resolved(), ro = !sc, q = search.trim().toLowerCase();
    var tools = '<div class="matrix-tools"><div class="seg" role="group" aria-label="Assumption level">' + [['assetClass', 'Asset classes'], ['factor', 'Factors'], ['holding', 'Holdings']].map(function (l) { return '<button type="button" data-level="' + l[0] + '" aria-pressed="' + (level === l[0]) + '">' + l[1] + '</button>'; }).join('') + '</div>' +
      '<label class="check"><input type="checkbox" id="ov-only"' + (overridesOnly ? ' checked' : '') + (ro ? ' disabled' : '') + '> Overrides only</label><div class="search-wrap">' + I.search + '<input type="search" id="mtx-search" placeholder="Filter…" aria-label="Filter rows" value="' + esc(search) + '" data-fkey="mtx-search"></div></div>';
    var rows = '', matches = function (s) { return !q || s.toLowerCase().indexOf(q) >= 0; };
    if (level === 'assetClass') {
      D.taxonomy.forEach(function (s) {
        var acs = D.assetClasses.filter(function (a) { return a.category === s.id; });
        var body = acs.map(function (ac) {
          var ov = sc && sc.overrides.assetClass[ac.id] || {}, hasOv = ov.return != null || ov.vol != null;
          if (overridesOnly && !hasOv) return ''; if (!matches(ac.name)) return '';
          var r = R.acReturn[ac.id], v = R.acVol[ac.id];
          return '<tr><th scope="row">' + esc(ac.name) + '<small>' + esc(s.short) + '</small></th><td class="has-reset">' + cellHtml({ key: 'assetClass|' + ac.id + '|return', value: r.value, base: r.base, source: r.source === 'assetClass' ? 'override' : r.source, unit: '%', disabled: ro, label: ac.name + ' expected return' }) + '</td><td class="has-reset">' + cellHtml({ key: 'assetClass|' + ac.id + '|vol', value: v.value, base: v.base, source: v.source === 'assetClass' ? 'override' : v.source, unit: '%', disabled: ro, label: ac.name + ' volatility' }) + '</td></tr>';
        }).join('');
        if (!body) return;
        var groupOv = sc ? acs.some(function (ac) { var o = sc.overrides.assetClass[ac.id]; return o && (o.return != null || o.vol != null); }) : false;
        rows += '<tr class="grp"><th scope="row">' + esc(s.name) + '</th><td colspan="2" style="text-align:right">' + (groupOv ? '<button type="button" class="btn btn-ghost btn-xs" data-reset-group="' + esc(s.id) + '">' + I.reset + '<span>Reset group</span></button>' : '') + '</td></tr>' + body;
      });
      return tools + '<div class="matrix-wrap"><table class="mtx" aria-label="Asset-class assumptions"><thead><tr><th scope="col">Asset class</th><th scope="col">Expected return<br><span style="font-weight:500;letter-spacing:.04em;text-transform:none">annual, arithmetic</span></th><th scope="col">Volatility<br><span style="font-weight:500;letter-spacing:.04em;text-transform:none">annual</span></th></tr></thead><tbody>' + (rows || '<tr><td colspan="3" class="faint" style="text-align:center;padding:18px">' + (overridesOnly ? 'No asset-class overrides in this scenario.' : 'No rows match.') + '</td></tr>') + '</tbody></table></div>';
    }
    if (level === 'factor') {
      rows = D.factors.map(function (f) {
        var pr = R.premiums[f.id], hasOv = pr.overridden; if (overridesOnly && !hasOv) return ''; if (!matches(f.name)) return '';
        var touched = D.assetClasses.filter(function (ac) { return D.assumptions.assetClasses[ac.id].betas[f.id] !== 0; }).length;
        return '<tr><th scope="row">' + esc(f.name) + '<small>' + esc(f.description) + '</small></th><td class="has-reset">' + cellHtml({ key: 'factor|' + f.id + '|premium', value: pr.value, base: pr.base, source: hasOv ? 'override' : 'model', unit: '%', disabled: ro, label: f.name + ' premium' }) + '</td><td class="faint" style="text-align:right;font-size:12px">' + touched + ' asset classes<br>' + F.num(D.assumptions.factors.filter(function (x) { return x.id === f.id; })[0].vol, 0) + '% factor vol</td></tr>';
      }).join('');
      return tools + '<div class="matrix-wrap"><table class="mtx" aria-label="Factor assumptions"><thead><tr><th scope="col">Factor</th><th scope="col">Premium<br><span style="font-weight:500;letter-spacing:.04em;text-transform:none">annual, over cash</span></th><th scope="col">Reach</th></tr></thead><tbody>' + (rows || '<tr><td colspan="3" class="faint" style="text-align:center;padding:18px">' + (overridesOnly ? 'No factor overrides in this scenario.' : 'No rows match.') + '</td></tr>') + '</tbody></table></div><div class="field-hint" style="padding:8px 16px">A factor override flows into every asset class that loads on it, unless that asset class or holding has its own return override. Precedence: holding → asset class → factor.</div>';
    }
    var seen = {}, list = [];
    S.members().forEach(function (a) { a.holdings.forEach(function (h) { if (!seen[h.instrumentId]) { seen[h.instrumentId] = true; list.push(D.instrumentById[h.instrumentId]); } }); });
    list.sort(function (a, b) { return D.assumptions.order.indexOf(a.assetClass) - D.assumptions.order.indexOf(b.assetClass) || a.name.localeCompare(b.name); });
    rows = list.map(function (ins) {
      var ov = sc && sc.overrides.holding[ins.id] || {}, hasOv = ov.return != null || ov.vol != null; if (overridesOnly && !hasOv) return ''; if (!matches(ins.name) && !matches(ins.identifier)) return '';
      var r = R.ret[ins.id], v = R.vol[ins.id], acn = D.assetClassById[ins.assetClass].name;
      return '<tr><th scope="row">' + esc(ins.name) + '<small>' + esc(ins.identifier) + ' · ' + esc(acn) + (ins.fee ? ' · fee ' + ins.fee + ' bp' : '') + '</small></th><td class="has-reset">' + cellHtml({ key: 'holding|' + ins.id + '|return', value: r.value, base: r.base, source: r.source === 'holding' ? 'override' : r.source, unit: '%', disabled: ro, label: ins.name + ' expected return', inherited: r.source !== 'holding' ? acn + (ins.fee ? ' less fee' : '') : null }) + '</td><td class="has-reset">' + cellHtml({ key: 'holding|' + ins.id + '|vol', value: v.value, base: v.base, source: v.source === 'holding' ? 'override' : v.source, unit: '%', disabled: ro, label: ins.name + ' volatility', inherited: v.source !== 'holding' ? acn : null }) + '</td></tr>';
    }).join('');
    return tools + '<div class="matrix-wrap"><table class="mtx" aria-label="Holding assumptions"><thead><tr><th scope="col">Holding</th><th scope="col">Expected return</th><th scope="col">Volatility</th></tr></thead><tbody>' + (rows || '<tr><td colspan="3" class="faint" style="text-align:center;padding:18px">' + (overridesOnly ? 'No holding overrides in this scenario.' : 'No rows match.') + '</td></tr>') + '</tbody></table></div>';
  }
  function renderCorrelations(sc) {
    var R = resolved(), order = D.assumptions.order, n = order.length, ro = !sc, pair = S.session.selectedPair;
    var shade = function (v) { var a = Math.min(1, Math.abs(v)); return v >= 0 ? 'rgba(42,120,214,' + (0.08 + a * 0.5).toFixed(2) + ')' : 'rgba(235,104,52,' + (0.08 + a * 0.5).toFixed(2) + ')'; };
    var short = function (id) { return D.assetClassById[id].name.replace('International Developed', 'Intl Dev.').replace('Investment Grade', 'IG').replace('High Yield & Private Credit', 'HY & Private Credit').replace('Emerging Markets', 'EM'); };
    var t = '<table class="corr" aria-label="Correlation matrix"><thead><tr><th scope="col"></th>' + order.map(function (id) { return '<th scope="col">' + esc(short(id)) + '</th>'; }).join('') + '</tr></thead><tbody>';
    for (var i = 0; i < n; i++) {
      t += '<tr><th scope="row">' + esc(short(order[i])) + '</th>';
      for (var j = 0; j < n; j++) {
        var v = R.corr[i][j], key = order[Math.min(i, j)] + '|' + order[Math.max(i, j)], isOv = sc && sc.overrides.correlation[key] != null, sel = pair && (pair.a === i && pair.b === j), mirror = pair && (pair.a === j && pair.b === i);
        if (i === j) t += '<td><span class="cc diag" aria-hidden="true">1</span></td>';
        else t += '<td><button type="button" class="cc' + (sel ? ' is-selected' : '') + (mirror ? ' is-mirror' : '') + (isOv ? ' is-override' : '') + '" style="background:' + shade(v) + '" data-corr="' + i + ',' + j + '" data-fkey="corr:' + i + ',' + j + '" aria-label="' + esc(short(order[i]) + ' with ' + short(order[j]) + ': ' + F.num(v, 2) + (isOv ? ', overridden' : '')) + '" aria-pressed="' + (!!sel) + '">' + F.num(v, 2) + '</button></td>';
      }
      t += '</tr>';
    }
    t += '</tbody></table>';
    var warn = !R.corrValid ? '<div class="psd-warn" role="alert" style="margin:10px 16px 0">' + I.warn + '<span><b>Matrix is not positive semi-definite.</b> Scenario results are unavailable until it is corrected; base results are unchanged and no value was altered for you.</span></div>' : '';
    var tools = '<div class="matrix-tools"><span class="small muted">Click a cell to edit the pair. Edits mirror across the diagonal; the diagonal is fixed at 1.</span><span class="spacer"></span>' + (sc && Object.keys(sc.overrides.correlation).length ? '<button type="button" class="btn btn-ghost btn-xs" id="reset-corr">' + I.reset + '<span>Reset correlations</span></button>' : '') + '</div>';
    var editor = '';
    if (pair) {
      var a = order[pair.a], b = order[pair.b], key2 = order[Math.min(pair.a, pair.b)] + '|' + order[Math.max(pair.a, pair.b)], cur = R.corr[pair.a][pair.b], base = D.assumptions.correlation[pair.a][pair.b], isOv2 = sc && sc.overrides.correlation[key2] != null, inv = invalid['corr|' + key2];
      editor = '<div class="pair-editor"><div class="pair-names"><span>' + esc(D.assetClassById[a].name) + '</span><span class="arrow">↔</span><span>' + esc(D.assetClassById[b].name) + '</span>' + (isOv2 ? '<span class="tag tag-edit">Override</span>' : '') + '</div><div class="pair-row"><input type="range" min="-1" max="1" step="0.01" value="' + cur + '" id="pair-range" aria-label="Correlation slider"' + (ro ? ' disabled' : '') + '><input type="number" min="-1" max="1" step="0.01" value="' + (inv != null ? esc(inv) : cur) + '" id="pair-num" aria-label="Correlation value" data-fkey="pair-num"' + (ro ? ' disabled' : '') + (inv != null ? ' aria-invalid="true"' : '') + '>' + (isOv2 && !ro ? '<button type="button" class="btn btn-ghost btn-xs" id="pair-reset">' + I.reset + '<span>Reset</span></button>' : '') + '</div><div class="pair-meta">Base ' + F.num(base, 2) + ' · ' + (ro ? 'Create a scenario to edit.' : 'Mirrored in ' + esc(D.assetClassById[b].name) + ' ↔ ' + esc(D.assetClassById[a].name) + '.') + (inv != null ? ' <span class="field-err">Enter a value between −1 and 1. The last valid value is kept.</span>' : '') + '</div></div>';
    } else editor = '<div class="pair-editor"><div class="pair-meta">Select a cell to inspect or edit one relationship precisely.</div></div>';
    return tools + warn + '<div class="corr-wrap">' + t + '</div>' + editor;
  }

  /* ── edits ───────────────────────────────────────────────────────── */
  function setOverride(sc, lvl, id, field, value, base, label) {
    S.update('Scenario “' + sc.name + '”: ' + label + ' ' + (value == null ? 'reset' : F.num(base, 1) + ' → ' + F.num(value, 1)), function (ws) {
      var s = ws.scenarios.filter(function (x) { return x.id === sc.id; })[0]; if (!s) return;
      var bag = s.overrides[lvl];
      if (value == null) { if (bag[id]) { delete bag[id][field]; if (!Object.keys(bag[id]).length) delete bag[id]; } } else { bag[id] = bag[id] || {}; bag[id][field] = value; }
    }, { type: 'scenario' });
  }
  function commitCell(inp, sc) {
    var parts = inp.dataset.cell.split('|'), lvl = parts[0], id = parts[1], field = parts[2], raw = inp.value.trim(), v = Number(raw), lim = LIMITS[field];
    if (inp.dataset.last === raw) return; inp.dataset.last = raw;
    var R = resolved(), base, label;
    if (lvl === 'assetClass') { base = field === 'return' ? R.acReturn[id].base : R.acVol[id].base; label = D.assetClassById[id].name + ' ' + (field === 'return' ? 'return' : 'volatility'); }
    else if (lvl === 'factor') { base = R.premiums[id].base; label = D.factorById[id].name + ' premium'; }
    else { base = field === 'return' ? R.ret[id].base : R.vol[id].base; label = D.instrumentById[id].name + ' ' + (field === 'return' ? 'return' : 'volatility'); }
    if (raw === '' || !isFinite(v) || v < lim[0] || v > lim[1]) { invalid[inp.dataset.cell] = raw; inp.setAttribute('aria-invalid', 'true'); inp.closest('.mcell').classList.add('is-invalid'); UI.toast(label + ': enter a value between ' + lim[0] + ' and ' + lim[1] + lim[2] + '. The last valid value is kept.', { kind: 'error' }); return; }
    delete invalid[inp.dataset.cell]; v = U.round(v, 2);
    var inherited = lvl === 'assetClass' ? (field === 'return' ? (R.acReturn[id].source === 'assetClass' ? null : R.acReturn[id].value) : (R.acVol[id].source === 'assetClass' ? null : R.acVol[id].value)) : lvl === 'factor' ? R.premiums[id].base : (field === 'return' ? (R.ret[id].source === 'holding' ? null : R.ret[id].value) : (R.vol[id].source === 'holding' ? null : R.vol[id].value));
    if (inherited != null && Math.abs(inherited - v) < 1e-9) { setOverride(sc, lvl, id, field, null, base, label); return; }
    setOverride(sc, lvl, id, field, v, base, label);
  }
  function commitCorr(sc, i, j, v) {
    var order = D.assumptions.order, key = order[Math.min(i, j)] + '|' + order[Math.max(i, j)], base = D.assumptions.correlation[i][j];
    if (!isFinite(v) || v < -1 || v > 1) { invalid['corr|' + key] = String(v); Dr.render(); return; }
    delete invalid['corr|' + key]; v = U.round(v, 2);
    S.update('Scenario “' + sc.name + '”: correlation ' + D.assetClassById[order[i]].name + ' ↔ ' + D.assetClassById[order[j]].name + ' ' + F.num(base, 2) + ' → ' + F.num(v, 2), function (ws) { var s = ws.scenarios.filter(function (x) { return x.id === sc.id; })[0]; if (!s) return; if (Math.abs(v - base) < 1e-9) delete s.overrides.correlation[key]; else s.overrides.correlation[key] = v; }, { type: 'scenario' });
  }
  function newScenario(duplicateOf) {
    UI.prompt({ title: duplicateOf ? 'Duplicate scenario' : 'New scenario', label: 'Scenario name', value: duplicateOf ? duplicateOf.name + ' (copy)' : 'Scenario ' + (S.ws.scenarios.length + 1), confirmLabel: 'Create' }).then(function (name) {
      if (!name) return;
      var id = U.uid('sc');
      S.update('Scenario “' + name + '” created', function (ws) { ws.scenarios.push({ id: id, name: name, createdAt: new Date().toISOString(), scope: ws.comparison.members.slice(), overrides: duplicateOf ? U.clone(duplicateOf.overrides) : { assetClass: {}, holding: {}, factor: {}, correlation: {} } }); ws.activeScenarioId = id; }, { type: 'scenario' });
      U.announce('Scenario ' + name + ' created and active.');
    });
  }

  /* ── wiring: delegated handlers once, direct handlers per render ──── */
  function wireOnce() {
    U.on(el, 'change', '[data-scope]', function (e, cb) { var sc = scenario(); if (!sc) return; var id = cb.dataset.scope, a = S.allocation(id); S.update('Scenario “' + sc.name + '” ' + (cb.checked ? 'applied to ' : 'no longer applied to ') + a.name, function (ws) { var s = ws.scenarios.filter(function (x) { return x.id === sc.id; })[0]; if (cb.checked) { if (s.scope.indexOf(id) < 0) s.scope.push(id); } else s.scope = s.scope.filter(function (x) { return x !== id; }); }, { type: 'scenario' }); });
    U.on(el, 'click', '[data-tab]', function (e, b) { S.session.drawerTab = b.dataset.tab; Dr.render(); U.$('#tab-' + (b.dataset.tab === 'assumptions' ? 'assumptions' : 'corr')).focus(); });
    U.on(el, 'keydown', '[role=tab]', function (e) { if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') { e.preventDefault(); S.session.drawerTab = S.session.drawerTab === 'assumptions' ? 'correlations' : 'assumptions'; Dr.render(); U.$('#tab-' + (S.session.drawerTab === 'assumptions' ? 'assumptions' : 'corr')).focus(); } });
    U.on(el, 'click', '[data-level]', function (e, b) { level = b.dataset.level; Dr.render(); el.querySelector('[data-level="' + level + '"]').focus(); });
    U.on(el, 'change', 'input[data-cell]', function (e, inp) { var sc = scenario(); if (sc) commitCell(inp, sc); });
    U.on(el, 'keydown', 'input[data-cell]', function (e, inp) {
      if (e.key === 'Enter') { e.preventDefault(); inp.blur(); }
      if (e.key === 'Escape') { delete invalid[inp.dataset.cell]; Dr.render(); }
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') { var inputs = U.$$('input[data-cell]', el).filter(function (x) { return x.dataset.cell.split('|')[2] === inp.dataset.cell.split('|')[2]; }), i = inputs.indexOf(inp), nx = inputs[i + (e.key === 'ArrowDown' ? 1 : -1)]; if (nx) { e.preventDefault(); nx.focus(); nx.select(); } }
    });
    U.on(el, 'click', '[data-reset]', function (e, b) { var sc = scenario(); if (!sc) return; var p = b.dataset.reset.split('|'), R = resolved(); var base = p[0] === 'factor' ? R.premiums[p[1]].base : p[0] === 'assetClass' ? (p[2] === 'return' ? R.acReturn[p[1]].base : R.acVol[p[1]].base) : (p[2] === 'return' ? R.ret[p[1]].base : R.vol[p[1]].base); var label = p[0] === 'factor' ? D.factorById[p[1]].name + ' premium' : (p[0] === 'assetClass' ? D.assetClassById[p[1]].name : D.instrumentById[p[1]].name) + ' ' + p[2]; setOverride(sc, p[0], p[1], p[2], null, base, label); });
    U.on(el, 'click', '[data-reset-group]', function (e, b) { var sc = scenario(); if (!sc) return; var g = b.dataset.resetGroup; S.update('Scenario “' + sc.name + '”: ' + D.categoryById[g].name + ' overrides reset', function (ws) { var s = ws.scenarios.filter(function (x) { return x.id === sc.id; })[0]; D.assetClasses.filter(function (a) { return a.category === g; }).forEach(function (a) { delete s.overrides.assetClass[a.id]; }); }, { type: 'scenario' }); });
    U.on(el, 'click', '[data-corr]', function (e, b) { var p = b.dataset.corr.split(',').map(Number); S.session.selectedPair = { a: p[0], b: p[1] }; Dr.render(); var nb = el.querySelector('[data-corr="' + p.join(',') + '"]'); if (nb) nb.focus(); });
    U.on(el, 'keydown', '[data-corr]', function (e, b) {
      var p = b.dataset.corr.split(',').map(Number), n = D.assumptions.order.length, di = 0, dj = 0;
      if (e.key === 'ArrowUp') di = -1; else if (e.key === 'ArrowDown') di = 1; else if (e.key === 'ArrowLeft') dj = -1; else if (e.key === 'ArrowRight') dj = 1; else return;
      e.preventDefault(); var i = p[0] + di, j = p[1] + dj; if (i === j) { i += di; j += dj; } if (i < 0 || j < 0 || i >= n || j >= n) return;
      var nb = el.querySelector('[data-corr="' + i + ',' + j + '"]'); if (nb) nb.focus();
    });
  }
  function wireFresh(sc) {
    U.$('#drawer-close').onclick = function () { S.setSession('drawerOpen', false); };
    U.$('#scn-sel').onchange = function (e) { var id = e.target.value || null; S.update(id ? 'Scenario “' + S.scenario(id).name + '” activated' : 'Base case activated', function (ws) { ws.activeScenarioId = id; }, { type: 'scenario', force: true }); };
    U.$('#scn-new').onclick = function () { newScenario(null); };
    var menu = U.$('#scn-menu');
    if (menu) menu.onclick = function () {
      UI.menu(menu, [{ head: sc.name },
        { label: 'Rename', onClick: function () { UI.prompt({ title: 'Rename scenario', label: 'Scenario name', value: sc.name }).then(function (n) { if (n && n !== sc.name) S.update('Scenario renamed to “' + n + '”', function (ws) { ws.scenarios.filter(function (x) { return x.id === sc.id; })[0].name = n; }, { type: 'scenario' }); }); } },
        { label: 'Duplicate', icon: I.copy, onClick: function () { newScenario(sc); } },
        { label: 'Use base case', onClick: function () { S.update('Base case activated', function (ws) { ws.activeScenarioId = null; }, { type: 'scenario', force: true }); } },
        { sep: true },
        { label: 'Delete scenario…', icon: I.trash, onClick: function () { UI.confirm({ title: 'Delete “' + sc.name + '”?', sub: 'Its ' + S.overrideCount(sc) + ' overrides are removed. Base results are unaffected.', confirmLabel: 'Delete', danger: true }).then(function (ok) { if (!ok) return; S.update('Scenario “' + sc.name + '” deleted', function (ws) { ws.scenarios = ws.scenarios.filter(function (x) { return x.id !== sc.id; }); if (ws.activeScenarioId === sc.id) ws.activeScenarioId = null; }, { type: 'scenario' }); }); } }], { align: 'end' });
    };
    var ov = U.$('#ov-only'); if (ov) ov.onchange = function () { overridesOnly = ov.checked; Dr.render(); U.$('#ov-only').focus(); };
    var ms = U.$('#mtx-search'); if (ms) ms.oninput = U.debounce(function () { search = ms.value; Dr.render(); }, 150);
    var ra = U.$('#scn-reset-all'); if (ra) ra.onclick = function () { UI.confirm({ title: 'Reset “' + sc.name + '”?', sub: 'All ' + S.overrideCount(sc) + ' overrides return to the platform base values. The scenario itself is kept.', confirmLabel: 'Reset overrides' }).then(function (ok) { if (ok) S.update('Scenario “' + sc.name + '” reset', function (ws) { ws.scenarios.filter(function (x) { return x.id === sc.id; })[0].overrides = { assetClass: {}, holding: {}, factor: {}, correlation: {} }; }, { type: 'scenario' }); }); };
    var pr = U.$('#pair-range'), pn = U.$('#pair-num'), pair = S.session.selectedPair;
    if (pr && sc) { pr.oninput = function () { pn.value = pr.value; }; pr.onchange = function () { commitCorr(sc, pair.a, pair.b, Number(pr.value)); }; }
    if (pn && sc) { pn.onchange = function () { commitCorr(sc, pair.a, pair.b, Number(pn.value)); }; pn.onkeydown = function (e) { if (e.key === 'Enter') { e.preventDefault(); pn.blur(); } }; }
    var prs = U.$('#pair-reset'); if (prs && sc) prs.onclick = function () { commitCorr(sc, pair.a, pair.b, D.assumptions.correlation[pair.a][pair.b]); };
    var rc = U.$('#reset-corr'); if (rc && sc) rc.onclick = function () { S.update('Scenario “' + sc.name + '”: correlations reset', function (ws) { ws.scenarios.filter(function (x) { return x.id === sc.id; })[0].overrides.correlation = {}; }, { type: 'scenario' }); };
  }
  function initResize() {
    var h = U.$('#drawer-resizer'), ws = U.$('#view-ws'); if (!h) return;
    var apply = function (w) { w = U.clamp(w, 360, 640); ws.style.setProperty('--drawer-w', w + 'px'); h.setAttribute('aria-valuenow', String(w)); return w; };
    apply(S.ws.prefs.drawerWidth || 460);
    var startX = 0, startW = 0;
    h.addEventListener('pointerdown', function (e) { startX = e.clientX; startW = el.getBoundingClientRect().width; h.setPointerCapture(e.pointerId); h.classList.add('is-active'); e.preventDefault(); });
    h.addEventListener('pointermove', function (e) { if (h.classList.contains('is-active')) apply(startW - (e.clientX - startX)); });
    var done = function () { if (!h.classList.contains('is-active')) return; h.classList.remove('is-active'); S.setPref('drawerWidth', Number(h.getAttribute('aria-valuenow'))); };
    h.addEventListener('pointerup', done); h.addEventListener('pointercancel', done);
    h.addEventListener('keydown', function (e) { var cur = Number(h.getAttribute('aria-valuenow')) || 460; if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') { e.preventDefault(); S.setPref('drawerWidth', apply(cur + (e.key === 'ArrowLeft' ? 16 : -16))); } });
  }

  Dr.init = function () {
    el = U.$('#drawer');
    wireOnce();
    S.subscribe(function (type, extra) {
      if (!S.ws) { if (el) el.hidden = true; return; }
      if (type === 'load') { S.session.drawerOpen = false; invalid = {}; search = ''; Dr.render(); }
      if (type === 'session' && extra.key === 'drawerOpen') {
        if (S.session.drawerOpen) { trigger = document.activeElement; Dr.render(); var f = U.$('#scn-sel'); if (f) f.focus(); U.announce('Scenario drawer opened'); }
        else { Dr.render(); if (trigger && trigger.focus && document.contains(trigger)) trigger.focus(); trigger = null; U.announce('Scenario drawer closed'); }
      }
      if ((type === 'update' || type === 'undo' || type === 'redo') && S.session.drawerOpen) Dr.render();
    });
    document.addEventListener('keydown', function (e) { if (e.key === 'Escape' && S.session.drawerOpen && el.contains(document.activeElement) && !document.querySelector('.pop')) S.setSession('drawerOpen', false); });
  };
})();

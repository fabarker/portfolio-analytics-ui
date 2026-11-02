/* ─────────────────────────────────────────────────────────────────────────
   Portfolio Analytics · the context bar
   The settings every card shares: basis, period, reference, scenario,
   horizon and band; plus the way into the card repository and layout tools.
   ───────────────────────────────────────────────────────────────────────── */
(function () {
  'use strict';
  var PA = window.PA, U = PA.util, esc = U.esc, S = PA.store, UI = PA.ui, D = PA.data, I = U.icon, F = U.fmt;
  var X = UI.context = {};
  var bar, line, notices;

  function render() {
    var w = S.ws, p = w.prefs, c = w.comparison, sc = S.activeScenario();
    var seg = function (name, opts, cur) { return '<div class="seg" role="group" aria-label="' + esc(name) + '">' + opts.map(function (o) { return '<button type="button" data-cx="' + name.toLowerCase() + '" data-val="' + o[0] + '" aria-pressed="' + (cur === o[0]) + '">' + esc(o[1]) + '</button>'; }).join('') + '</div>'; };
    var pr = p.period.preset || 'common';
    bar.innerHTML = '<div class="ctl"><span class="label" data-tip="Applies to cards that can show either observed history or the forward-looking model: Drivers &amp; differences, Risk by category, Factor exposures.">Basis</span>' + seg('Basis', [['forward', 'Forward-looking'], ['historical', 'Historical']], p.basis) + '</div>' +
      '<div class="ctl"><label class="label" for="cx-period">Period</label><select id="cx-period">' + [['common', 'Common history'], ['1y', 'Last 1 year'], ['3y', 'Last 3 years'], ['5y', 'Last 5 years'], ['10y', 'Last 10 years'], ['custom', 'Custom…']].map(function (o) { return '<option value="' + o[0] + '"' + (pr === o[0] ? ' selected' : '') + '>' + o[1] + '</option>'; }).join('') + '</select>' +
      (pr === 'custom' ? '<input type="month" id="cx-start" class="input-sm" aria-label="Start month" min="2012-01" max="2026-10" value="' + esc(p.period.start || '2018-01') + '"><span class="faint">to</span><input type="month" id="cx-end" class="input-sm" aria-label="End month" min="2012-01" max="2026-10" value="' + esc(p.period.end || '2026-10') + '">' : '') + '</div>' +
      '<div class="ctl"><label class="label" for="cx-ref">Reference</label><select id="cx-ref"><option value="shared"' + (c.referenceMode === 'shared' ? ' selected' : '') + '>Shared benchmark</option><option value="individual"' + (c.referenceMode === 'individual' ? ' selected' : '') + '>Each allocation’s benchmark</option><option value="portfolio"' + (c.referenceMode === 'portfolio' ? ' selected' : '') + '>A compared portfolio</option></select>' +
      (c.referenceMode === 'shared' ? '<select id="cx-bm" aria-label="Shared benchmark">' + D.benchmarks.map(function (b) { return '<option value="' + b.id + '"' + (c.sharedBenchmarkId === b.id ? ' selected' : '') + '>' + esc(b.name) + '</option>'; }).join('') + '</select>' : '') +
      (c.referenceMode === 'portfolio' ? '<select id="cx-pf" aria-label="Reference portfolio">' + S.members().map(function (a) { return '<option value="' + a.id + '"' + (c.referencePortfolioId === a.id ? ' selected' : '') + '>' + esc(a.name) + '</option>'; }).join('') + '</select>' : '') + '</div>' +
      '<div class="ctl"><label class="label" for="cx-horizon">Horizon</label><select id="cx-horizon">' + [5, 10, 15, 20].map(function (h) { return '<option value="' + h + '"' + (p.horizon === h ? ' selected' : '') + '>' + h + ' years</option>'; }).join('') + '</select><select id="cx-band" aria-label="Projection band">' + [0.5, 0.8, 0.9, 0.95].map(function (b) { return '<option value="' + b + '"' + (p.confidence === b ? ' selected' : '') + '>' + Math.round(b * 100) + '% band</option>'; }).join('') + '</select></div>' +
      '<button type="button" class="btn btn-sm" id="cx-scenario" aria-pressed="' + (!!S.session.drawerOpen) + '">' + I.flask + '<span>' + (sc ? esc(sc.name) + ' · ' + S.overrideCount(sc) : 'Scenarios') + '</span></button>' +
      '<span class="spacer"></span><button type="button" class="btn btn-icon btn-ghost btn-sm" id="cx-layout" aria-label="Layout" aria-haspopup="menu" aria-expanded="false" data-tip="Layout">' + I.table + '</button><button type="button" class="btn btn-primary btn-sm" id="cx-add">' + I.plus + '<span>Add card</span></button>';
    U.$('#cx-period').onchange = function (e) { var np = U.clone(p.period); np.preset = e.target.value; if (np.preset === 'custom') { np.start = np.start || '2018-01'; np.end = np.end || '2026-10'; } S.setPref('period', np); };
    ['cx-start', 'cx-end'].forEach(function (id) { var el = U.$('#' + id); if (el) el.onchange = function () { var np = U.clone(p.period); np[id === 'cx-start' ? 'start' : 'end'] = el.value; if (np.start && np.end && U.ym.toIndex(np.start) > U.ym.toIndex(np.end)) { el.setAttribute('aria-invalid', 'true'); UI.toast('The start month must come before the end month.', { kind: 'error' }); return; } S.setPref('period', np); }; });
    U.$('#cx-ref').onchange = function (e) { setReference({ referenceMode: e.target.value, referencePortfolioId: e.target.value === 'portfolio' ? (c.referencePortfolioId || (S.members()[0] || {}).id || null) : c.referencePortfolioId }); };
    var bm = U.$('#cx-bm'); if (bm) bm.onchange = function (e) { setReference({ sharedBenchmarkId: e.target.value }); };
    var pf = U.$('#cx-pf'); if (pf) pf.onchange = function (e) { setReference({ referencePortfolioId: e.target.value }); };
    U.$('#cx-horizon').onchange = function (e) { S.setPref('horizon', Number(e.target.value)); };
    U.$('#cx-band').onchange = function (e) { S.setPref('confidence', Number(e.target.value)); };
    U.$('#cx-scenario').onclick = function () { S.setSession('drawerOpen', !S.session.drawerOpen); };
    U.$('#cx-add').onclick = function () { S.setSession('addCardOpen', true); };
    U.$('#cx-layout').onclick = function (e) { UI.menu(e.currentTarget, [{ head: 'Layout' }, { label: 'Pack cards into a tidy layout', icon: I.reset, onClick: function () { PA.cards.resetLayout(); } }, { label: 'Show every card’s data table', icon: I.table, onClick: function () { S.ws.cards.forEach(function (cd) { if (PA.cards.types[cd.type].dataTable) S.updateCard(cd.id, { showData: true }); }); } }, { label: 'Hide data tables', icon: I.eyeOff, onClick: function () { S.ws.cards.forEach(function (cd) { if (cd.showData) S.updateCard(cd.id, { showData: false }); }); } }], { align: 'end' }); };
    renderLine();
  }
  function setReference(patch) { S.update('Reference changed', function (ws) { for (var k in patch) ws.comparison[k] = patch[k]; }, { activity: false, force: true }); }
  function referenceLabel() {
    var c = S.ws.comparison;
    if (c.referenceMode === 'individual') return 'each allocation’s own benchmark';
    if (c.referenceMode === 'portfolio') { var a = S.allocation(c.referencePortfolioId); return a ? a.name : 'a compared portfolio'; }
    var b = D.benchmarkById[c.sharedBenchmarkId]; return b ? b.name : 'shared benchmark';
  }
  function renderLine() {
    var w = S.ws, p = w.prefs, sc = S.activeScenario(), parts = [];
    parts.push('<span><b>' + S.members().length + '</b> of 6 compared · differences vs <b>' + esc(referenceLabel()) + '</b></span>');
    parts.push('<span>' + (p.basis === 'forward' ? '<b>Forward-looking</b> cards use ' + esc(D.assumptions.model) + ' as of ' + esc(F.date(D.assumptions.asOf)) : '<b>Historical</b> basis for cards that can show either') + '</span>');
    parts.push('<span>Period: <b>' + esc(p.period.preset === 'custom' ? F.month(p.period.start) + ' – ' + F.month(p.period.end) : (p.period.preset === 'common' ? 'common history' : 'last ' + p.period.preset.replace('y', ' years'))) + '</b></span>');
    if (sc) parts.push('<span>Scenario <b>' + esc(sc.name) + '</b> applied to ' + sc.scope.filter(function (id) { return w.comparison.members.indexOf(id) >= 0; }).length + ' of ' + w.comparison.members.length + ' · forward-looking figures only</span>');
    line.innerHTML = parts.join('');
    notices.innerHTML = !S.scenarioValid() ? UI.alert('warning', '<b>The scenario correlation matrix is not positive semi-definite.</b> Scenario results are unavailable until it is corrected; base results are unchanged.') : '';
  }

  X.init = function () {
    bar = U.$('#context-bar'); line = U.$('#context-line'); notices = U.$('#notices');
    U.on(bar, 'click', '[data-cx="basis"]', function (e, b) { S.setPref('basis', b.dataset.val); });
    S.subscribe(function (type, extra) {
      if (!S.ws) return;
      if (type === 'load' || type === 'update' || type === 'undo' || type === 'redo') render();
      if (type === 'pref' && ['basis', 'period', 'horizon', 'confidence'].indexOf(extra.key) >= 0) render();
      if (type === 'session' && extra.key === 'drawerOpen') { var b = U.$('#cx-scenario'); if (b) b.setAttribute('aria-pressed', String(!!S.session.drawerOpen)); }
    });
  };
})();

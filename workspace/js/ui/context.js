/* ─────────────────────────────────────────────────────────────────────────
   Portfolio Analytics · the context bar
   The one place the settings every card shares are stated: the reporting
   currency, factor model, period, reference, horizon and band, and the way
   into scenarios. Each card carries its own basis (forward-looking or
   historical) in its subtitle, so there is no shared basis switch.
   A control shows only when a card in the workspace reads it, so the bar
   never offers a setting that changes nothing. Cards repeat none of this;
   they say only where they depart from it.
   ───────────────────────────────────────────────────────────────────────── */
(function () {
  'use strict';
  var PA = window.PA, U = PA.util, esc = U.esc, S = PA.store, UI = PA.ui, D = PA.data, I = U.icon, F = U.fmt;
  var X = UI.context = {};
  var bar, notices;

  /** Which shared settings the workspace's cards read. */
  function needs() {
    var w = S.ws, T = PA.cards.types, cards = w.cards.filter(function (c) { return T[c.type]; });
    return {
      model: cards.some(function (c) { return PA.cards.usesModel(c); }),
      period: cards.some(function (c) { return PA.cards.readsPeriod(c); }),
      horizon: cards.some(function (c) { return c.type === 'projections' || c.type === 'outcomes'; })
    };
  }

  function render() {
    var w = S.ws, p = w.prefs, c = w.comparison, sc = S.activeScenario(), n = needs();
    var seg = function (name, opts, cur) { return '<div class="seg" role="group" aria-label="' + esc(name) + '">' + opts.map(function (o) { return '<button type="button" data-cx="' + name.toLowerCase() + '" data-val="' + o[0] + '" aria-pressed="' + (cur === o[0]) + '">' + esc(o[1]) + '</button>'; }).join('') + '</div>'; };
    var pr = p.period.preset || 'common', html = '';
    var ccy = D.currencyByCode[w.currency] || { code: w.currency, name: w.currency };
    html += '<div class="ctl"><button type="button" class="ccy-btn" id="cx-ccy" data-tip="' + esc('Every figure in this workspace is reported in ' + ccy.name + '. Change the reporting currency.') + '"><span class="label">Reporting in</span><b>' + esc(ccy.code) + '</b></button></div>';
    if (n.model) {
      var pinned = {}; w.cards.forEach(function (cd) { if (PA.cards.usesModel(cd) && PA.cards.isPinned(cd)) { var id = PA.cards.modelIdOf(cd); pinned[id] = (pinned[id] || 0) + 1; } });
      var pinNote = Object.keys(pinned).map(function (id) { return pinned[id] + ' card' + (pinned[id] === 1 ? '' : 's') + ' pinned to ' + D.factorModelById[id].name; }).join(', ');
      html += '<div class="ctl"><span class="label" data-tip="' + esc('The risk model for factor exposures and factor or active risk. A card can pin its own model from its menu.' + (pinNote ? ' Now: ' + pinNote + '.' : '')) + '">Factor model</span><div class="seg" role="group" aria-label="Factor model">' + D.factorModels.map(function (m) { return '<button type="button" data-cx="model" data-val="' + m.id + '" aria-pressed="' + ((p.factorModel || 'isg') === m.id) + '" data-tip="' + esc(m.long + ' · as of ' + F.date(m.asOf)) + '">' + esc(m.name) + '</button>'; }).join('') + '</div></div>';
    }
    if (n.period) html += '<div class="ctl"><label class="label" for="cx-period">Period</label><select id="cx-period">' + [['common', 'Common history'], ['1y', 'Last 1 year'], ['3y', 'Last 3 years'], ['5y', 'Last 5 years'], ['10y', 'Last 10 years'], ['custom', 'Custom…']].map(function (o) { return '<option value="' + o[0] + '"' + (pr === o[0] ? ' selected' : '') + '>' + o[1] + '</option>'; }).join('') + '</select>' +
      (pr === 'custom' ? '<input type="month" id="cx-start" class="input-sm" aria-label="Start month" min="2012-01" max="2026-10" value="' + esc(p.period.start || '2018-01') + '"><span class="faint">to</span><input type="month" id="cx-end" class="input-sm" aria-label="End month" min="2012-01" max="2026-10" value="' + esc(p.period.end || '2026-10') + '">' : '') + '</div>';
    var old = c.referenceMode === 'shared' ? UI.benchmarks.outdated(c.sharedBenchmarkId) : null;
    html += '<div class="ctl"><span class="label" id="cx-ref-l">vs</span><button type="button" class="ref-btn" id="cx-ref" aria-haspopup="menu" aria-expanded="false" aria-labelledby="cx-ref-l cx-ref" data-tip="Differences, active return and tracking error are measured against this. Presets, custom benchmarks, each allocation’s own, or a compared portfolio.">' + esc(X.referenceLabel(true)) + (old ? ' <span class="tag tag-info">v' + old.latest + ' available</span>' : '') + I.chevronDown + '</button></div>';
    if (n.horizon) html += '<div class="ctl"><label class="label" for="cx-horizon">Horizon</label><select id="cx-horizon">' + [5, 10, 15, 20].map(function (h) { return '<option value="' + h + '"' + (p.horizon === h ? ' selected' : '') + '>' + h + ' years</option>'; }).join('') + '</select><select id="cx-band" aria-label="Projection band">' + [0.5, 0.8, 0.9, 0.95].map(function (b) { return '<option value="' + b + '"' + (p.confidence === b ? ' selected' : '') + '>' + Math.round(b * 100) + '% band</option>'; }).join('') + '</select></div>';
    var inScope = sc ? sc.scope.filter(function (id) { return c.members.indexOf(id) >= 0; }).length : 0;
    html += '<button type="button" class="btn btn-sm' + (sc ? ' is-on' : '') + '" id="cx-scenario" aria-pressed="' + (!!S.session.drawerOpen) + '" data-tip="' + esc(sc ? 'Scenario “' + sc.name + '”: ' + S.overrideCount(sc) + ' override' + (S.overrideCount(sc) === 1 ? '' : 's') + ', applied to ' + inScope + ' of ' + c.members.length + ' compared allocations. Forward-looking figures only. (s)' : 'Base case. Open the scenario drawer to override assumptions. (s)') + '">' + I.flask + '<span>' + (sc ? esc(sc.name) + ' · ' + inScope + ' of ' + c.members.length : 'Scenarios') + '</span></button>' +
      '<span class="spacer"></span><button type="button" class="btn btn-primary btn-sm" id="cx-add">' + I.plus + '<span>Add card</span></button>';
    bar.innerHTML = html;
    var per = U.$('#cx-period'); if (per) per.onchange = function (e) { var np = U.clone(p.period); np.preset = e.target.value; if (np.preset === 'custom') { np.start = np.start || '2018-01'; np.end = np.end || '2026-10'; } S.setPref('period', np); };
    ['cx-start', 'cx-end'].forEach(function (id) { var el = U.$('#' + id); if (el) el.onchange = function () { var np = U.clone(p.period); np[id === 'cx-start' ? 'start' : 'end'] = el.value; if (np.start && np.end && U.ym.toIndex(np.start) > U.ym.toIndex(np.end)) { el.setAttribute('aria-invalid', 'true'); UI.toast('The start month must come before the end month.', { kind: 'error' }); return; } S.setPref('period', np); }; });
    U.$('#cx-ref').onclick = function (e) { UI.benchmarks.referenceMenu(e.currentTarget); };
    var hz = U.$('#cx-horizon'); if (hz) hz.onchange = function (e) { S.setPref('horizon', Number(e.target.value)); };
    var bd = U.$('#cx-band'); if (bd) bd.onchange = function (e) { S.setPref('confidence', Number(e.target.value)); };
    U.$('#cx-ccy').onclick = function () { UI.dialogs.changeCurrency(); };
    U.$('#cx-scenario').onclick = function () { S.setSession('drawerOpen', !S.session.drawerOpen); };
    U.$('#cx-add').onclick = function () { S.setSession('addCardOpen', true); };
    notices.innerHTML = !S.scenarioValid() ? UI.alert('warning', '<b>The scenario correlation matrix is not positive semi-definite.</b> Scenario results are unavailable until it is corrected; base results are unchanged.') : '';
  }

  /** The reference in words, for subtitles and exports. */
  X.referenceLabel = function (short) {
    var c = S.ws.comparison;
    if (c.referenceMode === 'individual') return short ? 'Each allocation’s own benchmark' : 'each allocation’s own benchmark';
    if (c.referenceMode === 'policy') return short ? 'Policy benchmark' : 'each allocation’s policy benchmark';
    if (c.referenceMode === 'portfolio') { var a = S.allocation(c.referencePortfolioId); return a ? a.name : 'a compared portfolio'; }
    var b = D.benchmarkById[c.sharedBenchmarkId]; return b ? b.name : 'the shared benchmark';
  };
  /** The historical period in words, for the basis prefix of history cards. */
  X.periodLabel = function () {
    var p = S.ws ? S.ws.prefs.period : { preset: 'common' };
    return p.preset === 'custom' ? F.month(p.start) + ' – ' + F.month(p.end) : p.preset === 'common' ? 'common history' : p.preset === '1y' ? 'last year' : 'last ' + p.preset.replace('y', ' years');
  };
  /** The whole context as one line: the cover line of an export. */
  X.sentence = function () {
    var w = S.ws, p = w.prefs, sc = S.activeScenario(), n = needs(), parts = [];
    parts.push('Reported in ' + w.currency);
    if (n.model) parts.push(D.factorModelById[p.factorModel || 'isg'].name + ' factor model');
    if (n.period) parts.push(p.period.preset === 'custom' ? F.month(p.period.start) + ' – ' + F.month(p.period.end) : p.period.preset === 'common' ? 'Common history' : 'Last ' + p.period.preset.replace('y', ' years'));
    parts.push('vs ' + X.referenceLabel());
    parts.push(sc ? 'Scenario ' + sc.name : 'Base case');
    /* exports with the chain and the conventions in the context line */
    var act = S.active(), dep = UI.chain ? UI.chain.departures(w) : [];
    if (act && act.chain && PA.chain) { var pol = PA.chain.policyOf(act), saa = PA.chain.saaOf(act, w.allocations); parts.push('Decision chain of ' + act.name + ': policy ' + (pol.label || 'none') + ', SAA ' + (saa.label || 'none')); }
    if (dep.length) parts.push('Conventions: ' + dep.join(', '));
    return parts.join(' · ');
  };

  X.init = function () {
    bar = U.$('#context-bar'); notices = U.$('#notices');
    U.on(bar, 'click', '[data-cx="model"]', function (e, b) { if ((S.ws.prefs.factorModel || 'isg') === b.dataset.val) return; S.setPref('factorModel', b.dataset.val); var n = S.ws.cards.filter(function (c) { return PA.cards.usesModel(c) && !PA.cards.isPinned(c); }).length; U.announce('Factor model ' + D.factorModelById[b.dataset.val].name + '. ' + n + ' card' + (n === 1 ? '' : 's') + ' updating.'); });
    S.subscribe(function (type, extra) {
      if (!S.ws) return;
      if ((type === 'update' || type === 'undo' || type === 'redo') && D.reporting !== S.ws.currency) PA.api.useCurrency(S.ws.currency);
      if ((type === 'update' || type === 'undo' || type === 'redo') && PA.chain) PA.api.useConventions(PA.chain.conventionsOf(S.ws));
      if (type === 'load' || type === 'update' || type === 'undo' || type === 'redo') render();
      if (type === 'pref' && ['period', 'horizon', 'confidence', 'factorModel'].indexOf(extra.key) >= 0) render();
      if (type === 'session' && extra.key === 'drawerOpen') { var b = U.$('#cx-scenario'); if (b) b.setAttribute('aria-pressed', String(!!S.session.drawerOpen)); }
    });
  };
})();

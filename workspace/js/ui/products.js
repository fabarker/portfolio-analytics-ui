/* ─────────────────────────────────────────────────────────────────────────
   Portfolio Analytics · the product directory (#/products)
   Every product the platform knows, by category, with the uploaded ones
   (added from pasted returns) alongside. Selecting one shows what the
   model makes of it: forward-looking return, volatility and factor
   exposures; historical return, risk, drawdown and growth against its
   asset-class index; and, for an uploaded product, how it was fitted.
   ───────────────────────────────────────────────────────────────────────── */
(function () {
  'use strict';
  var PA = window.PA, U = PA.util, esc = U.esc, UI = PA.ui, D = PA.data, E = PA.engine, I = U.icon, F = U.fmt, V = UI.viz;
  var P = UI.products = {};
  var view = { filter: 'all', q: '', selected: null, model: 'isg' }, el = null, cache = {};

  P.show = function (host, id) {
    el = host; document.title = 'Product directory · Portfolio Analytics';
    if (id) view.selected = id;
    host.innerHTML = '<header class="topbar"><a class="wordmark" href="#/"><b>Portfolio Management Group</b><span>Portfolio Analytics</span></a><span class="sep faint">/</span><span class="eyebrow">Product directory</span><span class="spacer"></span><button type="button" class="btn btn-sm btn-primary" id="pd-add">' + I.paste + '<span>Add from returns</span></button><a class="btn btn-sm" href="#/">' + I.chevronLeft + '<span>Workspaces</span></a><span class="user"><span class="avatar" aria-hidden="true">FB</span><span>F. Barker</span></span></header><div class="repo" id="pdir"><div class="repo-nav"></div><div class="repo-list"></div><div class="repo-detail"></div></div>';
    U.$('#pd-add', host).onclick = function () { UI.importer.open({ text: '', categoryId: D.categoryById[view.filter] ? view.filter : null }); };
    var cont = U.$('#pdir', host);
    U.on(cont, 'click', '[data-filter]', function (e, b) { view.filter = b.dataset.filter; render(); });
    U.on(cont, 'click', '[data-open]', function (e, b) { select(b.dataset.open); });
    PA.api.listProducts().then(function () { if (!view.selected || !D.instrumentById[view.selected]) view.selected = visible()[0] ? visible()[0].id : null; render(); });
  };
  /** After an upload: show the new product if the directory is open. */
  P.refresh = function (id) { if (!el || el.hidden || !document.body.contains(el)) return; cache = {}; if (id) { view.selected = id; view.filter = 'uploaded'; } render(); };
  function select(id) { view.selected = id; history.replaceState(null, '', '#/products/' + encodeURIComponent(id)); render(); }
  function products() { return D.instruments.filter(function (i) { return i.type !== 'Index' && !/^rate_cash_/.test(i.id); }); }
  function visible() {
    var q = view.q.trim().toLowerCase();
    return products().filter(function (i) {
      if (view.filter === 'archived') { if (!i.archived) return false; } else if (i.archived) return false;
      if (view.filter === 'uploaded' && i.source !== 'uploaded') return false;
      if (D.categoryById[view.filter] && D.categoryOf(i.id).id !== view.filter) return false;
      return !q || (i.name + ' ' + i.identifier + ' ' + (i.manager || '') + ' ' + D.assetClassById[i.assetClass].name).toLowerCase().indexOf(q) >= 0;
    }).sort(function (a, b) { return D.taxonomy.indexOf(D.taxonomyById[D.categoryOf(a.id).id]) - D.taxonomy.indexOf(D.taxonomyById[D.categoryOf(b.id).id]) || (b.source === 'uploaded') - (a.source === 'uploaded') || a.name.localeCompare(b.name); });
  }
  function render() {
    var cont = el && U.$('#pdir', el); if (!cont) return;
    var all = products(), live = all.filter(function (i) { return !i.archived; }), up = live.filter(function (i) { return i.source === 'uploaded'; }), arch = all.filter(function (i) { return i.archived; });
    var nav = function (key, label, n, color) { return '<button type="button" data-filter="' + key + '" aria-pressed="' + (view.filter === key) + '"><span>' + (color ? '<span class="sw" style="background:' + color + '"></span>' : '') + esc(label) + '</span><span class="count">' + n + '</span></button>'; };
    U.$('.repo-nav', cont).innerHTML = '<div class="eyebrow" style="padding:0 10px 8px">Products</div>' + nav('all', 'All', live.length) + D.taxonomy.map(function (c) { return nav(c.id, c.short, live.filter(function (i) { return D.categoryOf(i.id).id === c.id; }).length, c.color); }).join('') + '<div class="menu-sep"></div>' + nav('uploaded', 'Uploaded', up.length) + (arch.length ? nav('archived', 'Archived', arch.length) : '') +
      '<div class="field-hint" style="padding:14px 10px 0">Platform products come with the analytics service. Uploaded products are added from pasted returns, shared with the team, and modelled from their own history. Paste a range from Excel anywhere in the app to add one.</div>';
    var list = visible();
    if (view.selected && list.every(function (i) { return i.id !== view.selected; }) && list.length && !D.instrumentById[view.selected]) view.selected = list[0].id;
    var R = E.resolve(null);
    U.$('.repo-list', cont).innerHTML = '<div style="padding:12px 16px;border-bottom:1px solid var(--line)"><div class="search-wrap">' + I.search + '<input type="search" id="pd-q" placeholder="Find a product…" aria-label="Find a product" value="' + esc(view.q) + '"></div></div>' +
      (list.length ? list.map(function (i) { var c = D.categoryOf(i.id); return '<button type="button" class="repo-item" data-open="' + esc(i.id) + '" aria-pressed="' + (i.id === view.selected) + '"><b><span class="sw" style="background:' + c.color + '"></span>' + esc(i.name) + (i.source === 'uploaded' ? '<span class="tag tag-info">Uploaded</span>' : '') + '</b><small>' + esc(i.type + ' · ' + i.identifier + ' · ' + D.assetClassById[i.assetClass].name) + '</small><small class="pd-kpi">→ ' + F.num(R.ret[i.id].value, 1) + '% return · ' + F.num(R.vol[i.id].value, 1) + '% volatility</small></button>'; }).join('')
        : '<div class="empty"><p>' + (view.filter === 'uploaded' && !view.q ? 'Nothing uploaded yet. Paste a range of returns from Excel, or use Add from returns.' : 'No product matches.') + '</p></div>');
    U.$('#pd-q', cont).oninput = U.debounce(function (e) { view.q = e.target.value; render(); var q = U.$('#pd-q', cont); q.focus(); q.setSelectionRange(q.value.length, q.value.length); }, 150);
    var det = U.$('.repo-detail', cont), sel = view.selected && D.instrumentById[view.selected];
    if (!sel) { det.innerHTML = '<div class="empty">' + I.layers + '<h3>Select a product</h3></div>'; return; }
    var key = sel.id + '|' + view.model;
    if (cache[key]) { paint(det, sel, cache[key]); return; }
    det.innerHTML = '<div class="skeleton" style="height:28px;width:40%;margin-bottom:12px"></div><div class="skeleton" style="height:220px"></div>';
    PA.api.productAnalytics(sel.id, { factorModel: view.model }).then(function (r) { cache[key] = r; if (view.selected === sel.id) paint(det, sel, r); }, function (err) { det.innerHTML = UI.alert('error', '<b>Could not load the analytics.</b> ' + esc(err.message || ''), 'Retry'); U.$('[data-alert-action]', det).onclick = render; });
  }
  function kpi(label, v, tip) { return '<div class="pd-k"' + (tip ? ' data-tip="' + esc(tip) + '"' : '') + '><span>' + label + '</span><b>' + v + '</b></div>'; }
  function paint(det, ins, r) {
    var up = ins.source === 'uploaded', f = r.forward, h = r.historical, model = D.factorModelById[view.model];
    var head = '<div class="row" style="justify-content:space-between;align-items:flex-start;gap:16px;flex-wrap:wrap"><div><div class="eyebrow">' + (r.category ? '<span class="sw" style="background:' + r.category.color + '"></span>' + esc(r.category.name) + ' · ' : '') + esc(r.assetClass) + ' · ' + esc(r.type) + '</div><h1 class="pd-h">' + esc(r.name) + '</h1><p class="muted" style="margin:0">' + esc(r.identifier) + (up ? ' · uploaded by ' + esc(ins.owner || '—') + ' on ' + esc(F.date(ins.createdAt)) + (ins.archived ? ' · archived' : '') : ins.manager ? ' · ' + esc(ins.manager) : '') + '</p></div>' +
      (up ? '<div class="row" style="gap:6px;flex-wrap:wrap"><button type="button" class="btn btn-sm" id="pd-rename">Rename</button><button type="button" class="btn btn-sm" id="pd-csv">' + I.export + '<span>Download returns</span></button>' + (ins.archived ? '<button type="button" class="btn btn-sm" id="pd-restore">' + I.reset + '<span>Restore</span></button>' : '<button type="button" class="btn btn-sm btn-ghost" id="pd-archive">' + I.trash + '<span>Archive</span></button>') + '</div>' : '') + '</div>';
    var fwd = '<section class="pd-sec"><h2><span class="basis-tag is-fwd">→ Forward-looking</span></h2><div class="pd-kpis">' + kpi('Expected return', F.num(f.ret, 2) + '%', 'From the platform assumptions' + (up ? ': cash plus β × the asset class’s premium' : '')) + kpi('Volatility', F.num(f.vol, 2) + '%') + kpi('Sharpe ratio', f.sharpe == null ? '—' : F.num(f.sharpe, 2)) + kpi('β to ' + esc(r.index), f.beta == null ? '—' : F.num(f.beta, 2)) + '</div></section>';
    var hist = h ? '<section class="pd-sec"><h2><span class="basis-tag is-hist">◷ Historical · ' + esc(F.month(h.start)) + ' – ' + esc(F.month(h.end)) + '</span></h2><div class="pd-kpis">' + kpi('Annualised return', F.num(h.annReturn, 2) + '%') + kpi('Volatility', h.vol == null ? '—' : F.num(h.vol, 2) + '%') + kpi('Sharpe ratio', h.sharpe == null ? '—' : F.num(h.sharpe, 2)) + kpi('Max drawdown', F.num(h.maxDrawdown, 1) + '%') + kpi('Best month', F.signed(h.best, 1) + '%') + kpi('Worst month', F.signed(h.worst, 1) + '%') + kpi('Positive months', F.num(h.positive, 0) + '%') + kpi('Correlation to index', h.corr == null ? '—' : F.num(h.corr, 2)) + '</div>' +
      '<div class="pd-chart"><div class="pd-sub">Growth of 100</div><div class="viz-host" id="pd-growth"></div><div class="pd-legend"><span><i style="background:' + (r.category ? r.category.color : 'var(--cat-1)') + '"></i>' + esc(r.name) + '</span><span><i style="background:var(--ink-3)"></i>' + esc(r.index) + '</span></div></div>' +
      (h.calendar && h.calendar.length ? '<div class="pd-sub">Calendar-year returns, %</div><div class="tblwrap"><table class="tbl pd-cal"><thead><tr>' + h.calendar.map(function (c) { return '<th class="num">' + c.year + (c.partial ? '*' : '') + '</th>'; }).join('') + '</tr></thead><tbody><tr>' + h.calendar.map(function (c) { return '<td class="num ' + (c.ret >= 0 ? 'pos' : 'neg') + '">' + F.num(c.ret, 1) + '</td>'; }).join('') + '</tr></tbody></table></div>' + (h.calendar.some(function (c) { return c.partial; }) ? '<p class="small muted">* part year</p>' : '') : '') + '</section>'
      : '<section class="pd-sec"><h2><span class="basis-tag is-hist">◷ Historical</span></h2><p class="muted">No return history for this product.</p></section>';
    var ex = model.factors.map(function (fc) { return { f: fc, v: f.exposure[fc.id] || 0 }; }).filter(function (x) { return Math.abs(x.v) > 0.005; }).sort(function (a, b) { return Math.abs(b.v) - Math.abs(a.v); });
    var mx = Math.max.apply(null, ex.map(function (x) { return Math.abs(x.v); }).concat([0.1]));
    var fac = '<section class="pd-sec"><h2>Factor exposures <span class="pd-seg" role="group" aria-label="Factor model">' + D.factorModels.map(function (m) { return '<button type="button" data-model="' + m.id + '" aria-pressed="' + (m.id === view.model) + '">' + esc(m.name) + '</button>'; }).join('') + '</span></h2>' +
      (f.coverage ? '<p class="small muted">' + esc(f.coverage) + '.</p>' : '') +
      '<table class="tbl pd-fac"><tbody>' + ex.map(function (x) { var w = Math.min(Math.abs(x.v) / mx, 1) * 50; return '<tr><td>' + esc(x.f.name) + '</td><td class="num">' + F.num(x.v, 2) + '</td><td class="bar-col"><span class="act-track"><span class="act-zero"></span><i style="left:' + (x.v >= 0 ? 50 : 50 - w) + '%;width:' + w + '%;background:var(--cat-1)"></i></span></td></tr>'; }).join('') + '</tbody></table>' +
      '<p class="small muted">Specific risk ' + F.num(f.specific, 2) + '% a year' + (f.factorShare != null ? '; factors explain ' + F.num(f.factorShare, 0) + '% of its variance' : '') + ' in the ' + esc(model.long) + '.</p></section>';
    var how = up && r.fit ? '<section class="pd-sec pd-how"><h2>How the model treats it</h2><ul>' +
      '<li>Fitted to <b>' + esc(r.assetClass) + '</b> through the ' + esc(r.fit.indexName) + ' over ' + r.fit.months + ' months: β ' + F.num(r.fit.beta, 2) + ', correlation ' + F.num(r.fit.corr, 2) + ', R² ' + F.num(r.fit.r2, 2) + '.</li>' +
      '<li>Expected return: cash plus β × the asset class’s premium = ' + F.num(f.ret, 2) + '% a year. Its historical alpha of ' + F.signed(r.fit.alpha, 2) + '% a year is not assumed to persist; set a return on the holding in a scenario to use one.</li>' +
      '<li>Volatility: its own, ' + F.num(r.fit.vol, 2) + '% a year. Correlations: the asset class’s, scaled by its correlation of ' + F.num(r.fit.corr, 2) + '.</li>' +
      '<li>History: ' + (ins.coverage === 'proxy' ? 'its own returns from ' + esc(F.month(ins.inception)) + '; before that the ' + esc(r.index) + ' stands in.' : 'its own returns only; before ' + esc(F.month(ins.inception)) + ' it has none, which shortens backtests that hold it.') + '</li></ul></section>'
      : '<section class="pd-sec pd-how"><h2>How the model treats it</h2><p class="muted">A platform product, modelled through its asset class (' + esc(r.assetClass) + ')' + (ins.fee ? ' net of its ' + F.num(ins.fee, 2) + '% fee' : '') + '. ' + (ins.coverage === 'proxy' ? esc(ins.proxyNote || '') : ins.coverage === 'none' ? 'It has no return history.' : 'Its history runs from ' + esc(F.month(ins.inception)) + '.') + '</p></section>';
    det.innerHTML = head + '<div class="pd-grid">' + fwd + hist + fac + how + '</div>';
    if (h && h.growth) V.lineChart(U.$('#pd-growth', det), { xs: D.history.months.slice(D.history.months.indexOf(h.growthStart)), series: [{ id: 'p', name: r.name, color: r.category ? r.category.color : 'var(--cat-1)', values: h.growth }, { id: 'i', name: r.index, color: 'var(--ink-3)', values: h.indexGrowth }], height: 220, fmt: function (v) { return F.num(v, 0); }, aria: 'Growth of 100 for ' + r.name + ' and its asset-class index' });
    U.on(det, 'click', '[data-model]', function (e, b) { view.model = b.dataset.model; render(); });
    var rn = U.$('#pd-rename', det); if (rn) rn.onclick = function () {
      UI.openDialog({ title: 'Rename product', initialFocus: '#pr-name', body: '<div class="field"><label for="pr-name">Name</label><input type="text" id="pr-name" maxlength="80" value="' + esc(ins.name) + '"></div><span class="field-err" id="pr-err" role="alert"></span>', actions: [{ label: 'Cancel', ghost: true }, { label: 'Rename', primary: true, close: false, onClick: function (c) { var v = U.$('#pr-name', c.el).value; PA.api.updateProduct(ins.id, { name: v }).then(function () { c.close(true); cache = {}; render(); }, function (err) { U.$('#pr-err', c.el).textContent = err.message; }); return false; } }] });
    };
    var ar = U.$('#pd-archive', det); if (ar) ar.onclick = function () { UI.confirm({ title: 'Archive “' + ins.name + '”?', sub: 'It leaves the directory and the search. Allocations that hold it keep it, and it can be restored.', confirmLabel: 'Archive', danger: true }).then(function (ok) { if (ok) PA.api.updateProduct(ins.id, { archived: true }).then(function () { cache = {}; render(); }); }); };
    var rs = U.$('#pd-restore', det); if (rs) rs.onclick = function () { PA.api.updateProduct(ins.id, { archived: false }).then(function () { view.filter = 'uploaded'; cache = {}; render(); }); };
    var cv = U.$('#pd-csv', det); if (cv) cv.onclick = function () { var own = D.history.instrument[ins.id] || [], lines = ['Month,' + U.csvCell(ins.name) + ' (%)']; own.forEach(function (v, i) { if (v != null) lines.push(D.history.months[i] + ',' + (v * 100).toFixed(4)); }); U.download(ins.name.replace(/[^\w\- ]+/g, '') + ' returns.csv', lines.join('\n'), 'text/csv'); };
  }
})();

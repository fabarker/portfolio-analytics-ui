/* ─────────────────────────────────────────────────────────────────────────
   Portfolio Analytics · add products from returns (paste or drop)
   Copy a cell range in Excel (dates in the first column, one product per
   column, the product names in the header row) and paste it anywhere in the
   app, into this dialog, or drop a CSV on it. The parser reads:

     dates    ISO (2024-01-31), day/month/year or month/day/year (asked when
              it cannot tell), month names (Jan-24, 31 Jan 2024), Excel serial
              numbers, year-month (2024-01)
     values   percentages (1.25 or 1.25%), decimals (0.0125) or price levels;
              (1.2) and − as negatives; decimal commas with ; or tabs
     cadence  daily, weekly, monthly or quarterly; compounded to monthly
              (quarterly spread evenly across its three months)

   It checks each product (at least twelve months; gaps; outliers that look
   like the wrong units), then the model fits each one to the asset class it
   tracks most closely. Adding them puts them in the product directory, the
   quick-add search and every analytic, forward-looking and historical.
   ───────────────────────────────────────────────────────────────────────── */
(function () {
  'use strict';
  var PA = window.PA, U = PA.util, esc = U.esc, UI = PA.ui, D = PA.data, S = PA.store, I = U.icon, F = U.fmt;
  var IM = UI.importer = {};
  var MON = { jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6, jul: 7, aug: 8, sep: 9, sept: 9, oct: 10, nov: 11, dec: 12, january: 1, february: 2, march: 3, april: 4, june: 6, july: 7, august: 8, september: 9, october: 10, november: 11, december: 12 };

  /* ── parsing ─────────────────────────────────────────────────────── */
  function splitRows(text) {
    var lines = String(text || '').replace(/\r\n?/g, '\n').split('\n').filter(function (l) { return l.trim() !== ''; });
    if (!lines.length) return { rows: [], delim: '\t' };
    var head = lines.slice(0, 5).join('\n'), delim = head.indexOf('\t') >= 0 ? '\t' : (head.split(';').length > head.split(',').length ? ';' : ',');
    var rows = lines.map(function (l) {
      if (delim !== ',' || l.indexOf('"') < 0) return l.split(delim).map(function (c) { return c.trim().replace(/^"(.*)"$/, '$1'); });
      var out = [], cur = '', q = false; for (var i = 0; i < l.length; i++) { var ch = l[i]; if (ch === '"') { if (q && l[i + 1] === '"') { cur += '"'; i++; } else q = !q; } else if (ch === ',' && !q) { out.push(cur.trim()); cur = ''; } else cur += ch; } out.push(cur.trim()); return out;
    });
    return { rows: rows, delim: delim };
  }
  /** One date cell → {y, m, d, a?, b?} (a/b: an ambiguous numeric day and month) or null. */
  function readDate(raw) {
    var s = String(raw || '').trim(), m;
    if (!s) return null;
    if (/^\d{5}(\.\d+)?$/.test(s)) { var n = Math.floor(Number(s)); if (n > 20000 && n < 80000) { var dt = new Date(Date.UTC(1899, 11, 30) + n * 864e5); return { y: dt.getUTCFullYear(), m: dt.getUTCMonth() + 1, d: dt.getUTCDate() }; } }
    if ((m = s.match(/^(\d{4})[-\/.](\d{1,2})[-\/.](\d{1,2})(?:[ T].*)?$/))) return ok(+m[1], +m[2], +m[3]);
    if ((m = s.match(/^(\d{4})(\d{2})(\d{2})$/))) return ok(+m[1], +m[2], +m[3]);
    if ((m = s.match(/^(\d{4})[-\/.](\d{1,2})$/))) return ok(+m[1], +m[2], 28);
    if ((m = s.match(/^(\d{1,2})[-\/.](\d{1,2})[-\/.](\d{2,4})(?:[ T].*)?$/))) { var y = +m[3]; if (y < 100) y += y < 70 ? 2000 : 1900; var a = +m[1], b = +m[2]; if (a > 31 || b > 31) return null; return { y: y, a: a, b: b }; }
    if ((m = s.match(/^(\d{1,2})[-\s\/.]([A-Za-z]{3,9})\.?[-\s\/.,]+(\d{2,4})$/))) { var mo = MON[m[2].toLowerCase()]; if (mo) return ok(year(m[3]), mo, +m[1]); }
    if ((m = s.match(/^([A-Za-z]{3,9})\.?[-\s\/.]+(\d{1,2}),?[-\s\/.]+(\d{4})$/))) { var mo2 = MON[m[1].toLowerCase()]; if (mo2) return ok(+m[3], mo2, +m[2]); }
    if ((m = s.match(/^([A-Za-z]{3,9})\.?[-\s\/.']+(\d{2,4})$/))) { var mo3 = MON[m[1].toLowerCase()]; if (mo3) return ok(year(m[2]), mo3, 28); }
    if ((m = s.match(/^(\d{4})[-\s]+([A-Za-z]{3,9})$/))) { var mo4 = MON[m[2].toLowerCase()]; if (mo4) return ok(+m[1], mo4, 28); }
    return null;
    function year(t) { var y2 = +t; return y2 < 100 ? y2 + (y2 < 70 ? 2000 : 1900) : y2; }
    function ok(y2, mo5, d) { return mo5 >= 1 && mo5 <= 12 && d >= 1 && d <= 31 && y2 > 1900 && y2 < 2200 ? { y: y2, m: mo5, d: d } : null; }
  }
  function readNumber(raw, decimalComma) {
    var s = String(raw == null ? '' : raw).trim().replace(/[ \s]/g, '').replace(/[−–]/g, '-');
    if (!s || /^(-|—|n\/?a|#n\/a|na|null|nan|#value!|#div\/0!)$/i.test(s)) return { v: null };
    var neg = false; if (/^\(.*\)$/.test(s)) { neg = true; s = s.slice(1, -1); }
    var pct = /%$/.test(s); s = s.replace(/%$/, '');
    if (decimalComma) s = s.replace(/\./g, '').replace(',', '.'); else s = s.replace(/,(?=\d{3}(\D|$))/g, '');
    if (!/^[-+]?(\d+\.?\d*|\.\d+)(e[-+]?\d+)?$/i.test(s)) return { v: null, bad: true };
    var v = Number(s); return { v: neg ? -v : v, pct: pct };
  }
  /**
   * Parse pasted text. opts: {order:'auto'|'dmy'|'mdy', unit:'auto'|'percent'|'decimal'|'price'}
   * → {columns:[{name, start, values (monthly fractions), months, warnings, error}], frequency, order, orderAmbiguous,
   *    unit, unitDetected, rows, first, last, notes, error}
   */
  IM.parse = function (text, opts) {
    opts = opts || {};
    var sp = splitRows(text), rows = sp.rows;
    if (rows.length < 2) return { error: 'Paste at least a header row and some dates with returns.', columns: [] };
    var width = Math.max.apply(null, rows.map(function (r) { return r.length; }));
    if (width < 2) return { error: 'Only one column was pasted. Copy the dates and at least one column of returns beside them.', columns: [] };
    /* header: leading rows whose first cell is not a date; the last one names the columns */
    var k = 0; while (k < rows.length && !readDate(rows[k][0])) k++;
    if (k >= rows.length) return { error: 'No dates found in the first column. Dates go in the first column, one row per period.', columns: [] };
    var header = k > 0 ? rows[k - 1] : null, data = rows.slice(k);
    var parsed = data.map(function (r) { return readDate(r[0]); }), bad = parsed.filter(function (d) { return !d; }).length;
    var amb = parsed.filter(function (d) { return d && d.a != null; }), order = opts.order && opts.order !== 'auto' ? opts.order : null, ambiguous = false;
    if (amb.length && !order) {
      if (amb.some(function (d) { return d.a > 12; })) order = 'dmy'; else if (amb.some(function (d) { return d.b > 12; })) order = 'mdy'; else { order = 'dmy'; ambiguous = true; }
    }
    var dates = parsed.map(function (d) { if (!d) return null; if (d.a == null) return d; var day = order === 'mdy' ? d.b : d.a, mo = order === 'mdy' ? d.a : d.b; return mo >= 1 && mo <= 12 ? { y: d.y, m: mo, d: day } : null; });
    var decimalComma = sp.delim !== ',' && data.some(function (r) { return r.slice(1).some(function (c) { return /^-?\d+,\d+%?$/.test(String(c).trim()); }); });
    /* values: percent, decimal or price */
    var cells = data.map(function (r) { return r.slice(1).map(function (c) { return readNumber(c, decimalComma); }); });
    var all = []; cells.forEach(function (r) { r.forEach(function (c) { if (c.v != null) all.push(c.v); }); });
    var anyPct = cells.some(function (r) { return r.some(function (c) { return c.pct; }); });
    var abs = all.map(Math.abs).sort(function (a, b) { return a - b; }), med = abs.length ? abs[Math.floor(abs.length / 2)] : 0;
    var detected = anyPct ? 'percent' : all.length && all.every(function (v) { return v > 0; }) && med > 20 ? 'price' : med >= 0.25 ? 'percent' : 'decimal';
    var unit = opts.unit && opts.unit !== 'auto' ? opts.unit : detected;
    /* rows in date order */
    var order2 = data.map(function (r, i) { return i; }).filter(function (i) { return dates[i]; }).sort(function (i, j) { var a = dates[i], b = dates[j]; return (a.y - b.y) || (a.m - b.m) || (a.d - b.d); });
    if (order2.length < 2) return { error: 'Fewer than two readable dates.', columns: [] };
    var gaps = []; for (var g = 1; g < order2.length; g++) { var p = dates[order2[g - 1]], q = dates[order2[g]]; gaps.push((Date.UTC(q.y, q.m - 1, q.d) - Date.UTC(p.y, p.m - 1, p.d)) / 864e5); }
    gaps.sort(function (a, b) { return a - b; });
    var mg = gaps[Math.floor(gaps.length / 2)], freq = mg <= 4 ? 'daily' : mg <= 10 ? 'weekly' : mg <= 45 ? 'monthly' : mg <= 100 ? 'quarterly' : 'annual';
    var H = D.history, notes = [];
    if (bad) notes.push(bad + ' row' + (bad === 1 ? '' : 's') + ' without a readable date skipped');
    var columns = [];
    for (var c = 0; c < width - 1; c++) {
      var name = header && header[c + 1] ? String(header[c + 1]).trim() : 'Product ' + (c + 1), warn = [], badCells = 0;
      if (!header || !header[c + 1]) { var anyVal = order2.some(function (i) { return cells[i][c] && cells[i][c].v != null; }); if (!anyVal) continue; }
      /* observations in date order */
      var obs = order2.map(function (i) { var x = cells[i][c] || { v: null }; if (x.bad) badCells++; return { d: dates[i], v: x.v }; }).filter(function (o) { return o.v != null; });
      if (badCells) warn.push(badCells + ' cell' + (badCells === 1 ? '' : 's') + ' not a number, left out');
      if (unit === 'price') { var ret = []; for (var t = 1; t < obs.length; t++) if (obs[t - 1].v > 0) ret.push({ d: obs[t].d, v: obs[t].v / obs[t - 1].v - 1 }); obs = ret; }
      else obs = obs.map(function (o) { return { d: o.d, v: unit === 'percent' ? o.v / 100 : o.v }; });
      if (freq === 'annual') { columns.push({ name: name, error: 'Annual data is too sparse: paste monthly, weekly or daily returns.', warnings: warn, months: 0 }); continue; }
      /* to calendar months */
      var byM = {}, days = {};
      obs.forEach(function (o) {
        if (freq === 'quarterly') { var r3 = Math.pow(1 + o.v, 1 / 3) - 1; for (var z = 2; z >= 0; z--) { var ym = U.ym.add(o.d.y + '-' + (o.d.m < 10 ? '0' : '') + o.d.m, -z); byM[ym] = (byM[ym] == null ? 1 : byM[ym]) * (1 + r3); } return; }
        var key = o.d.y + '-' + (o.d.m < 10 ? '0' : '') + o.d.m; byM[key] = (byM[key] == null ? 1 : byM[key]) * (1 + o.v); (days[key] = days[key] || []).push(o.d.d);
      });
      var keys = Object.keys(byM).sort();
      if (!keys.length) { columns.push({ name: name, error: 'No returns in this column.', warnings: warn, months: 0 }); continue; }
      if (freq === 'daily' || freq === 'weekly') {
        if (Math.min.apply(null, days[keys[0]]) > (freq === 'daily' ? 5 : 8)) { warn.push(F.month(keys[0]) + ' starts part-way through, so it is left out'); keys.shift(); }
        if (keys.length && Math.max.apply(null, days[keys[keys.length - 1]]) < 20) { warn.push(F.month(keys[keys.length - 1]) + ' is incomplete, so it is left out'); keys.pop(); }
      }
      var before = keys.filter(function (k2) { return k2 < H.start; }).length, after = keys.filter(function (k2) { return k2 > H.end; }).length;
      keys = keys.filter(function (k2) { return k2 >= H.start && k2 <= H.end; });
      if (before) warn.push(before + ' month' + (before === 1 ? '' : 's') + ' before ' + F.month(H.start) + ' are outside the model’s history and are not used');
      if (after) warn.push(after + ' month' + (after === 1 ? '' : 's') + ' after ' + F.month(H.end) + ' are not used yet');
      if (!keys.length) { columns.push({ name: name, error: 'No months inside ' + F.month(H.start) + ' – ' + F.month(H.end) + '.', warnings: warn, months: 0 }); continue; }
      var start = keys[0], n = U.ym.diff(start, keys[keys.length - 1]) + 1, values = [], missing = [];
      for (var mm = 0; mm < n; mm++) { var key2 = U.ym.add(start, mm); if (byM[key2] == null) { values.push(null); missing.push(key2); } else values.push(byM[key2] - 1); }
      if (missing.length) warn.push(missing.length + ' month' + (missing.length === 1 ? '' : 's') + ' missing (' + missing.slice(0, 3).map(F.month).join(', ') + (missing.length > 3 ? '…' : '') + '), left empty');
      var big = values.filter(function (v) { return v != null && Math.abs(v) > 0.5; }).length;
      if (big) warn.push(big + ' month' + (big === 1 ? '' : 's') + ' above ±50%: check the values are ' + (unit === 'decimal' ? 'decimals, not percentages' : unit === 'percent' ? 'percentages' : 'prices'));
      var cnt = values.filter(function (v) { return v != null; }).length;
      columns.push({ name: name, start: start, values: values, months: cnt, warnings: warn, error: cnt < 12 ? 'Only ' + cnt + ' month' + (cnt === 1 ? '' : 's') + ': the model needs at least 12.' : null });
    }
    if (!columns.length) return { error: 'No columns of returns found beside the dates.', columns: [] };
    return { columns: columns, frequency: freq, order: order, orderAmbiguous: ambiguous, numericDates: amb.length > 0, unit: unit, unitDetected: detected, rows: data.length, notes: notes, decimalComma: decimalComma };
  };
  /** Does this text look like a pasted returns table (for the paste-anywhere shortcut)? */
  IM.looksLikeReturns = function (text) {
    var rows = splitRows(text).rows; if (rows.length < 4) return false;
    var data = rows.filter(function (r) { return readDate(r[0]); });
    return data.length >= 3 && data.length >= (rows.length - 2) * 0.8 && data.every(function (r) { return r.length >= 2; }) && data.some(function (r) { return r.slice(1).some(function (c) { return readNumber(c, false).v != null || readNumber(c, true).v != null; }); });
  };

  /* ── the dialog ──────────────────────────────────────────────────── */
  var FREQ = { daily: 'daily returns, compounded to months', weekly: 'weekly returns, compounded to months', monthly: 'monthly returns', quarterly: 'quarterly returns, spread across their months' };
  var TYPES = ['Fund', 'Manager', 'ETF', 'Security'];
  /**
   * Open the dialog. opts: {text?, categoryId? (prefer asset classes of this
   * category), name? (a name typed in quick add), onAdded?(records)}
   */
  IM.open = function (opts) {
    opts = opts || {};
    var st = { text: opts.text || '', order: 'auto', unit: 'auto', parsed: null, rows: [], editing: !opts.text, type: 'Fund', proxy: true, busy: false };
    var ctx = UI.openDialog({ title: 'Add products from returns', xwide: true, initialFocus: '#im-text',
      sub: 'Copy a range in Excel with the dates in the first column and one product per column, names in the header row, then paste it here. The model works out the rest.',
      body: '<div class="im" id="im"></div>',
      actions: [{ label: 'Cancel', ghost: true }, { label: 'Add products', primary: true, disabled: true, close: false, onClick: function () { add(); return false; } }] });
    var el = ctx.el, host = U.$('#im', el), addBtn = U.$('[data-action="1"]', el);

    function parse() {
      st.parsed = st.text.trim() ? IM.parse(st.text, { order: st.order, unit: st.unit }) : null;
      var prev = st.rows; st.rows = [];
      if (st.parsed && !st.parsed.error) st.parsed.columns.forEach(function (c, i) {
        var old = prev.filter(function (r) { return r.col.name === c.name; })[0];
        st.rows.push({ col: c, name: old ? old.name : (st.parsed.columns.length === 1 && opts.name && /^Product \d+$/.test(c.name) ? opts.name : c.name), on: !c.error, fits: null, assetClass: old ? old.assetClass : null, stats: null });
      });
      if (st.parsed && !st.parsed.error) st.editing = false;
      render(); fit();
    }
    function fit() {
      st.rows.forEach(function (r) {
        if (r.col.error) return;
        PA.api.fitReturns({ start: r.col.start, values: r.col.values }).then(function (res) {
          if (st.rows.indexOf(r) < 0) return;
          r.fits = res.fits; r.stats = res.stats;
          if (!r.assetClass && res.fits.length) {
            var pool = opts.categoryId ? res.fits.filter(function (f) { return D.assetClassById[f.assetClassId].category === opts.categoryId; }) : [];
            r.assetClass = (pool[0] && pool[0].r2 >= res.fits[0].r2 - 0.15 ? pool[0] : res.fits[0]).assetClassId;
          }
          render();
        });
      });
    }
    function render() {
      var p = st.parsed, active = document.activeElement, fk = active && host.contains(active) ? active.getAttribute('data-fkey') : null;
      if (st.editing || !p || p.error) {
        host.innerHTML = '<div class="im-paste"><label class="im-drop" for="im-text"><span class="sr-only">Pasted returns</span><textarea id="im-text" data-fkey="im-text" spellcheck="false" wrap="off" placeholder="Paste here (⌘V / Ctrl+V), or drop a CSV file&#10;&#10;Date&#9;Fund A&#9;Fund B&#10;31/01/2021&#9;1.25%&#9;-0.40%&#10;28/02/2021&#9;0.80%&#9;0.95%&#10;…">' + esc(st.text) + '</textarea></label>' +
          '<div class="im-how"><div class="im-eyebrow">What to copy</div><table class="im-demo" aria-label="Example range"><tr><th></th><th>A</th><th>B</th><th>C</th></tr><tr><th>1</th><td class="h">Date</td><td class="h">Fund A</td><td class="h">Fund B</td></tr><tr><th>2</th><td>31/01/2021</td><td>1.25%</td><td>-0.40%</td></tr><tr><th>3</th><td>28/02/2021</td><td>0.80%</td><td>0.95%</td></tr><tr><th>4</th><td>…</td><td>…</td><td>…</td></tr></table>' +
          '<ul class="im-rules"><li>Dates in the first column; any common format.</li><li>One column per product; its name in the header row.</li><li>Returns as percentages or decimals, or price levels. Daily, weekly or quarterly data is compounded to months.</li><li>At least 12 months each, from ' + esc(F.month(D.history.start)) + '.</li></ul>' +
          '<button type="button" class="btn btn-sm btn-ghost" id="im-sample">' + I.table + '<span>Try a sample</span></button></div></div>' +
          (p && p.error ? '<div class="im-err" role="alert">' + I.warn + '<span>' + esc(p.error) + '</span></div>' : '') + (p && !p.error ? '<div class="im-back"><button type="button" class="btn btn-sm" id="im-review">Review ' + p.columns.length + ' product' + (p.columns.length === 1 ? '' : 's') + '</button></div>' : '');
        addBtn.disabled = true; addBtn.textContent = 'Add products';
        wirePaste(); restore(fk); return;
      }
      var ok = st.rows.filter(function (r) { return r.on && !r.col.error; });
      var first = st.rows.map(function (r) { return r.col.start; }).filter(Boolean).sort()[0], lastM = st.rows.map(function (r) { return r.col.start ? U.ym.add(r.col.start, r.col.values.length - 1) : null; }).filter(Boolean).sort().pop();
      var sel = function (id, cur, options, label) { return '<label class="im-opt"><span>' + label + '</span><select id="' + id + '" data-fkey="' + id + '">' + options.map(function (o) { return '<option value="' + o[0] + '"' + (o[0] === cur ? ' selected' : '') + '>' + esc(o[1]) + '</option>'; }).join('') + '</select></label>'; };
      var read = '<div class="im-read"><div class="im-sum">' + I.check + '<span><b>' + st.rows.length + ' product' + (st.rows.length === 1 ? '' : 's') + '</b> · ' + esc(FREQ[p.frequency] || p.frequency) + ' · ' + esc(F.month(first)) + ' – ' + esc(F.month(lastM)) + ' · ' + p.rows + ' rows read</span><button type="button" class="btn btn-xs btn-ghost" id="im-edit">Edit pasted data</button></div>' +
        '<div class="im-opts">' + (p.numericDates ? sel('im-order', p.order, [['dmy', 'Day / month / year'], ['mdy', 'Month / day / year']], 'Dates') : '') +
        sel('im-unit', p.unit, [['percent', 'Percentages (1.25 = 1.25%)'], ['decimal', 'Decimals (0.0125 = 1.25%)'], ['price', 'Prices or index levels']], 'Values') +
        sel('im-type', st.type, TYPES.map(function (t) { return [t, t]; }), 'Type') +
        sel('im-proxy', st.proxy ? 'proxy' : 'none', [['proxy', 'Use the asset-class index'], ['none', 'Leave history empty']], 'Before the first month') + '</div>' +
        (p.orderAmbiguous ? '<div class="im-note">' + I.info + '<span>Every date reads either way, so they are read as day/month/year. Change it above if they are month/day/year.</span></div>' : '') +
        (p.unit !== p.unitDetected ? '' : '<div class="im-note is-quiet">' + I.info + '<span>Values read as ' + (p.unit === 'percent' ? 'percentages' : p.unit === 'decimal' ? 'decimals' : 'prices') + ' from what was pasted.</span></div>') + '</div>';
      var acOptions = function (r) {
        var byId = {}; (r.fits || []).forEach(function (f) { byId[f.assetClassId] = f; });
        return D.categories.map(function (c) { return '<optgroup label="' + esc(c.name) + '">' + D.assetClasses.filter(function (ac) { return ac.category === c.id; }).map(function (ac) { var f = byId[ac.id]; return '<option value="' + ac.id + '"' + (r.assetClass === ac.id ? ' selected' : '') + '>' + esc(ac.name) + (f ? ' · R² ' + F.num(f.r2, 2) : '') + '</option>'; }).join('') + '</optgroup>'; }).join('');
      };
      var table = '<div class="tblwrap im-tbl"><table class="tbl"><thead><tr><th class="im-c"><span class="sr-only">Add</span></th><th>Product name</th><th class="num">Months</th><th class="num">Return p.a.</th><th class="num">Volatility</th><th class="num">Max drawdown</th><th>Models as</th><th class="im-spark-h">Growth</th></tr></thead><tbody>' +
        st.rows.map(function (r, i) {
          var s2 = r.stats, f = r.fits && r.fits.filter(function (x) { return x.assetClassId === r.assetClass; })[0], cat = r.assetClass ? D.categoryById[D.assetClassById[r.assetClass].category] : null;
          var issues = (r.col.error ? ['<b>' + esc(r.col.error) + '</b>'] : []).concat(r.col.warnings.map(esc)).concat(f && f.r2 < 0.25 ? ['Weak fit to every asset class (R² ' + F.num(f.r2, 2) + '): its expected return will sit close to cash'] : []);
          return '<tr class="' + (r.col.error ? 'is-bad' : '') + (r.on ? '' : ' is-off') + '"><td class="im-c"><input type="checkbox" data-im-on="' + i + '" data-fkey="im-on:' + i + '" aria-label="Add ' + esc(r.name) + '"' + (r.on ? ' checked' : '') + (r.col.error ? ' disabled' : '') + '></td>' +
            '<td><input type="text" class="im-name" data-im-name="' + i + '" data-fkey="im-name:' + i + '" value="' + esc(r.name) + '" aria-label="Name of product ' + (i + 1) + '" maxlength="80"' + (r.col.error ? ' disabled' : '') + '>' + (issues.length ? '<ul class="im-issues">' + issues.map(function (x) { return '<li>' + x + '</li>'; }).join('') + '</ul>' : '') + '</td>' +
            '<td class="num">' + r.col.months + '</td><td class="num">' + (s2 ? F.num(s2.annReturn, 1) + '%' : '—') + '</td><td class="num">' + (s2 && s2.vol != null ? F.num(s2.vol, 1) + '%' : '—') + '</td><td class="num">' + (s2 ? F.num(s2.maxDrawdown, 1) + '%' : '—') + '</td>' +
            '<td>' + (r.col.error ? '<span class="faint">—</span>' : r.fits ? '<select class="im-ac" data-im-ac="' + i + '" data-fkey="im-ac:' + i + '" aria-label="Asset class for ' + esc(r.name) + '">' + acOptions(r) + '</select><small class="im-fit">' + (cat ? '<span class="sw" style="background:' + cat.color + '"></span>' + esc(cat.short) : '') + (f ? ' · β ' + F.num(f.beta, 2) + ' · corr. ' + F.num(f.corr, 2) : '') + '</small>' : '<span class="faint">Fitting…</span>') + '</td>' +
            '<td class="im-spark">' + spark(r.col) + '</td></tr>';
        }).join('') + '</tbody></table></div>';
      host.innerHTML = read + table + '<p class="im-foot">Each product is filed under its asset class’s category and modelled from its own history: its volatility as measured, its correlations through the asset class (scaled by how closely it tracks it), and an expected return of cash plus its beta times the asset class’s premium, with no alpha assumed. Currency: <b>' + esc(S.ws ? S.ws.currency : (D.reporting || 'USD')) + '</b>, as pasted.</p>';
      var ready = ok.length && ok.every(function (r) { return r.assetClass && r.name.trim(); });
      addBtn.disabled = !ready || st.busy; addBtn.textContent = st.busy ? 'Adding…' : 'Add ' + ok.length + ' product' + (ok.length === 1 ? '' : 's');
      wireReview(); restore(fk);
    }
    function restore(fk) { if (!fk) return; var f = host.querySelector('[data-fkey="' + CSS.escape(fk) + '"]'); if (f) { f.focus(); if (f.setSelectionRange && f.type === 'text') { var n = f.value.length; f.setSelectionRange(n, n); } } }
    function spark(col) {
      if (col.error || !col.values) return '';
      var g = 1, pts = [], W = 96, H2 = 26; col.values.forEach(function (v) { if (v != null) g *= 1 + v; pts.push(g); });
      var lo = Math.min.apply(null, pts.concat([1])), hi = Math.max.apply(null, pts.concat([1])), n = pts.length;
      var d = pts.map(function (v, i) { return (i ? 'L' : 'M') + (n > 1 ? i / (n - 1) * W : 0).toFixed(1) + ' ' + (H2 - 2 - (v - lo) / ((hi - lo) || 1) * (H2 - 4)).toFixed(1); }).join('');
      return '<svg viewBox="0 0 ' + W + ' ' + H2 + '" width="' + W + '" height="' + H2 + '" aria-hidden="true"><line x1="0" x2="' + W + '" y1="' + (H2 - 2 - (1 - lo) / ((hi - lo) || 1) * (H2 - 4)).toFixed(1) + '" y2="' + (H2 - 2 - (1 - lo) / ((hi - lo) || 1) * (H2 - 4)).toFixed(1) + '" class="im-base"/><path d="' + d + '" class="im-line"/></svg>';
    }
    function wirePaste() {
      var ta = U.$('#im-text', host);
      ta.oninput = U.debounce(function () { st.text = ta.value; parse(); }, 250);
      ta.onpaste = function () { setTimeout(function () { st.text = ta.value; parse(); }, 0); };
      var drop = U.$('.im-drop', host);
      drop.ondragover = function (e) { e.preventDefault(); drop.classList.add('is-over'); };
      drop.ondragleave = function () { drop.classList.remove('is-over'); };
      drop.ondrop = function (e) { e.preventDefault(); drop.classList.remove('is-over'); var f = e.dataTransfer.files && e.dataTransfer.files[0]; if (f) { var fr = new FileReader(); fr.onload = function () { st.text = String(fr.result); parse(); }; fr.readAsText(f); } else { var t = e.dataTransfer.getData('text/plain'); if (t) { st.text = t; parse(); } } };
      U.$('#im-sample', host).onclick = function () { st.text = IM.sample(); parse(); };
      var rv = U.$('#im-review', host); if (rv) rv.onclick = function () { st.editing = false; render(); };
    }
    function wireReview() {
      U.$('#im-edit', host).onclick = function () { st.editing = true; render(); var t = U.$('#im-text', host); if (t) t.focus(); };
      var o = U.$('#im-order', host); if (o) o.onchange = function () { st.order = o.value; parse(); };
      U.$('#im-unit', host).onchange = function (e) { st.unit = e.target.value; parse(); };
      U.$('#im-type', host).onchange = function (e) { st.type = e.target.value; };
      U.$('#im-proxy', host).onchange = function (e) { st.proxy = e.target.value === 'proxy'; };
      U.on(host, 'change', '[data-im-on]', function (e, cb) { st.rows[Number(cb.dataset.imOn)].on = cb.checked; render(); });
      U.on(host, 'input', '[data-im-name]', function (e, inp) { st.rows[Number(inp.dataset.imName)].name = inp.value; var ok = st.rows.filter(function (r) { return r.on && !r.col.error; }); addBtn.disabled = !ok.length || ok.some(function (r) { return !r.name.trim() || !r.assetClass; }); });
      U.on(host, 'change', '[data-im-ac]', function (e, s2) { st.rows[Number(s2.dataset.imAc)].assetClass = s2.value; render(); });
    }
    function add() {
      var list = st.rows.filter(function (r) { return r.on && !r.col.error; }); if (!list.length) return;
      st.busy = true; render();
      PA.api.addProducts(list.map(function (r) { return { name: r.name, type: st.type, assetClass: r.assetClass, currency: S.ws ? S.ws.currency : D.reporting, start: r.col.start, returns: r.col.values, proxy: st.proxy, origin: { frequency: st.parsed.frequency, rows: st.parsed.rows, unit: st.parsed.unit } }; })).then(function (recs) {
        ctx.close(true);
        IM.onAdded(recs, opts);
      }, function (err) { st.busy = false; render(); host.insertAdjacentHTML('afterbegin', '<div class="im-err" role="alert">' + I.warn + '<span>' + esc(err.message || 'Could not add the products.') + '</span></div>'); });
    }
    parse();
    if (!st.text) { var t0 = U.$('#im-text', host); if (t0) t0.focus(); }
    return ctx;
  };
  /** After adding: say where they went and offer the obvious next step. */
  IM.onAdded = function (recs, opts) {
    if (opts.onAdded) opts.onAdded(recs);
    var one = recs.length === 1 ? recs[0] : null, a = S.ws ? S.active() : null, cat = one ? D.categoryOf(one.id) : null;
    var msg = (one ? '“' + one.name + '” is' : recs.length + ' products are') + ' in the product directory' + (one && cat ? ', under ' + cat.short : '') + '.';
    var action = one && a && a.kind === 'live' ? { label: 'Add to ' + a.name, fn: function () { UI.builder.addProduct(one.id); } } : { label: 'Open directory', fn: function () { UI.shell.go('#/products/' + encodeURIComponent(recs[0].id)); } };
    UI.toast(msg, { action: action });
    U.announce(msg);
    if (UI.products && UI.products.refresh) UI.products.refresh(recs[0].id);
  };
  /** A sample range: two managers, monthly, as an Excel copy would give it. */
  IM.sample = function () {
    var H = D.history, eq = H.instrument.idx_us_eq, hy = H.instrument.idx_hy, r = U.rng(7), lines = ['Date\tAtlas Quality Growth\tHarrow Credit Opportunities'], start = U.ym.diff(H.start, '2019-01');
    for (var i = start; i < H.months.length; i++) {
      var ym = H.months[i], y = +ym.slice(0, 4), m = +ym.slice(5), last = new Date(Date.UTC(y, m, 0)).getUTCDate();
      var a = eq[i] * 1.08 + 0.0015 + r.normal() * 0.012, b = hy[i] * 0.85 + 0.0012 + r.normal() * 0.006;
      lines.push((last < 10 ? '0' : '') + last + '/' + (m < 10 ? '0' : '') + m + '/' + y + '\t' + (a * 100).toFixed(2) + '%\t' + (b * 100).toFixed(2) + '%');
    }
    return lines.join('\n');
  };
  /* paste anywhere: a returns range pasted outside a field opens the dialog with it */
  document.addEventListener('paste', function (e) {
    var t = e.target, tag = (t && t.tagName || '').toLowerCase();
    if (tag === 'input' || tag === 'textarea' || tag === 'select' || (t && t.isContentEditable) || document.querySelector('.dlg-wrap')) return;
    var text = e.clipboardData && e.clipboardData.getData('text/plain');
    if (!text || !IM.looksLikeReturns(text)) return;
    e.preventDefault(); IM.open({ text: text });
  });
})();

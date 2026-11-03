/* ─────────────────────────────────────────────────────────────────────────
   Portfolio Analytics · chart primitives
   Inline SVG, no library. Each primitive renders into an element and keeps
   identity in labels and the data table, never in colour alone.
   ───────────────────────────────────────────────────────────────────────── */
(function () {
  'use strict';
  var PA = window.PA, U = PA.util, esc = U.esc, F = U.fmt;
  var V = PA.ui.viz = {};

  V.niceTicks = function (lo, hi, n) {
    if (hi - lo < 1e-9) hi = lo + 1;
    var span = hi - lo, step = Math.pow(10, Math.floor(Math.log10(span / n))), err = span / n / step;
    step *= err >= 7.5 ? 10 : err >= 3.5 ? 5 : err >= 1.5 ? 2 : 1;
    var ticks = []; for (var v = Math.ceil(lo / step) * step; v <= hi + 1e-9; v += step) ticks.push(Math.round(v * 1e6) / 1e6);
    return { ticks: ticks, step: step, lo: Math.floor(lo / step + 1e-9) * step, hi: Math.ceil(hi / step - 1e-9) * step };
  };
  V.extent = function (arrs) { var lo = Infinity, hi = -Infinity; arrs.forEach(function (a) { (a || []).forEach(function (v) { if (v == null || !isFinite(v)) return; if (v < lo) lo = v; if (v > hi) hi = v; }); }); if (lo === Infinity) { lo = 0; hi = 1; } return [lo, hi]; };
  V.fmtTick = function (v) { return Math.abs(v) >= 1000 ? Math.round(v).toLocaleString('en-US') : (Number.isInteger(v) ? String(v) : F.num(v, Math.abs(v) < 1 ? 2 : 1)); };
  V.width = function (el, min) { return Math.max(min || 280, (el.clientWidth || 600) - 2); };

  /* ── line chart with shared crosshair ────────────────────────────── */
  /** opts: {xs:string[], series:[{id,name,color,values,actual?,dim}], height, baseline, fmt(v), xText(i), xLabels(n,px)->[{i,text}], aria, includeZero} */
  V.lineChart = function (el, opts) {
    var W = V.width(el), H = opts.height || 260, L = 52, R = 18, T = 14, Bm = 30, n = opts.xs.length, ser = opts.series;
    var ext = V.extent(ser.map(function (s) { return s.values; }).concat(ser.map(function (s) { return s.actual; })));
    if (opts.includeZero) { ext[0] = Math.min(ext[0], 0); ext[1] = Math.max(ext[1], 0); }
    var pad = (ext[1] - ext[0]) * 0.06 || 1, lo = ext[0] - pad, hi = ext[1] + pad;
    if (opts.baseline != null) { lo = Math.min(lo, opts.baseline - pad); hi = Math.max(hi, opts.baseline + pad); }
    var tk = V.niceTicks(lo, hi, 5), x = function (i) { return L + (n > 1 ? i / (n - 1) : 0) * (W - L - R); }, y = function (v) { return T + (hi - v) / (hi - lo) * (H - T - Bm); };
    var svg = '<svg class="viz" width="' + W + '" height="' + H + '" role="img" tabindex="0" aria-label="' + esc(opts.aria || '') + '">';
    tk.ticks.forEach(function (t) { svg += '<line class="gl" x1="' + L + '" x2="' + (W - R) + '" y1="' + y(t).toFixed(1) + '" y2="' + y(t).toFixed(1) + '"/><text x="' + (L - 8) + '" y="' + (y(t) + 4).toFixed(1) + '" text-anchor="end">' + V.fmtTick(t) + '</text>'; });
    if (opts.baseline != null) svg += '<line class="zero" x1="' + L + '" x2="' + (W - R) + '" y1="' + y(opts.baseline).toFixed(1) + '" y2="' + y(opts.baseline).toFixed(1) + '"/>';
    (opts.xLabels || defaultXLabels)(opts.xs, W - L - R).forEach(function (lb) { svg += '<text x="' + x(lb.i).toFixed(1) + '" y="' + (H - 8) + '" text-anchor="' + (lb.i === 0 ? 'start' : lb.i === n - 1 ? 'end' : 'middle') + '">' + esc(lb.text) + '</text>'; });
    svg += '<line class="ax" x1="' + L + '" x2="' + (W - R) + '" y1="' + (H - Bm) + '" y2="' + (H - Bm) + '"/>';
    var path = function (vals) { var d = '', pen = false; for (var i = 0; i < vals.length; i++) { var v = vals[i]; if (v == null) { pen = false; continue; } d += (pen ? 'L' : 'M') + x(i).toFixed(1) + ',' + y(v).toFixed(1); pen = true; } return d; };
    ser.forEach(function (s) { if (s.actual) svg += '<path class="series dashed' + (s.dim ? ' is-dim' : '') + '" stroke="' + s.color + '" d="' + path(s.actual) + '"/>'; if (s.values) svg += '<path class="series' + (s.dim ? ' is-dim' : '') + '" stroke="' + s.color + '" d="' + path(s.values) + '"/>'; });
    svg += '<g class="xh"></g><rect class="hit" x="' + L + '" y="' + T + '" width="' + (W - L - R) + '" height="' + (H - T - Bm) + '"/></svg>';
    el.innerHTML = svg + '<div class="viz-tip" hidden></div>';
    attachCrosshair(el, { x: x, y: y, L: L, R: R, T: T, H: H, W: W, n: n }, opts);
  };
  function defaultXLabels(xs, px) {
    var n = xs.length, out = [], every = Math.max(1, Math.ceil(n / Math.max(2, Math.floor(px / 70)) / 12));
    xs.forEach(function (m, i) { if (m.slice(5) === '01' && Number(m.slice(0, 4)) % every === 0) out.push({ i: i, text: m.slice(0, 4) }); });
    if (!out.length) { out.push({ i: 0, text: F.month(xs[0]) }); out.push({ i: n - 1, text: F.month(xs[n - 1]) }); }
    return out;
  }
  function attachCrosshair(body, geo, opts) {
    var svg = body.querySelector('svg.viz'), hit = svg.querySelector('.hit'), g = svg.querySelector('.xh'), tip = body.querySelector('.viz-tip'), idx = null;
    var fmt = opts.fmt || function (v) { return F.num(v, 1); }, xText = opts.xText || function (i) { return F.month(opts.xs[i]); };
    var show = function (i) {
      i = U.clamp(i, 0, geo.n - 1); idx = i;
      var px = geo.x(i);
      g.innerHTML = '<line class="xline" x1="' + px.toFixed(1) + '" x2="' + px.toFixed(1) + '" y1="' + geo.T + '" y2="' + (geo.H - 30) + '"/>' + opts.series.map(function (s) { var v = s.values ? s.values[i] : null; return v == null ? '' : '<circle cx="' + px.toFixed(1) + '" cy="' + geo.y(v).toFixed(1) + '" r="3.5" fill="' + s.color + '" stroke="#fff" stroke-width="1.5"' + (s.dim ? ' opacity=".35"' : '') + '/>'; }).join('');
      tip.innerHTML = '<div class="d">' + esc(xText(i)) + '</div>' + opts.series.map(function (s) { var v = s.values ? s.values[i] : null, a = s.actual ? s.actual[i] : null; return '<div class="r"><span class="n"><span class="sw" style="background:' + s.color + '"></span>' + esc(s.name) + '</span><b>' + (v == null ? '—' : fmt(v)) + '</b></div>' + (a != null ? '<div class="r"><span class="n faint" style="padding-left:17px">actual history</span><b>' + fmt(a) + '</b></div>' : ''); }).join('');
      tip.hidden = false;
      var tw = tip.offsetWidth; tip.style.left = (px + 14 + tw > body.clientWidth ? px - tw - 14 : px + 14) + 'px'; tip.style.top = (geo.T + 6) + 'px';
    };
    var hide = function () { g.innerHTML = ''; tip.hidden = true; idx = null; };
    hit.addEventListener('mousemove', function (e) { var r = svg.getBoundingClientRect(); show(Math.round((e.clientX - r.left - geo.L) / (geo.W - geo.L - geo.R) * (geo.n - 1))); });
    hit.addEventListener('mouseleave', hide);
    svg.addEventListener('keydown', function (e) {
      var i = idx == null ? geo.n - 1 : idx;
      if (e.key === 'ArrowLeft') show(i - (e.shiftKey ? 12 : 1)); else if (e.key === 'ArrowRight') show(i + (e.shiftKey ? 12 : 1)); else if (e.key === 'Home') show(0); else if (e.key === 'End') show(geo.n - 1); else if (e.key === 'Escape') { hide(); return; } else return;
      e.preventDefault();
      U.announce(xText(idx) + ': ' + opts.series.map(function (s) { var v = s.values ? s.values[idx] : null; return s.name + ' ' + (v == null ? 'unavailable' : fmt(v)); }).join(', '));
    });
    svg.addEventListener('blur', hide);
  }

  /* ── grouped vertical bars ───────────────────────────────────────── */
  /** opts: {groups:string[], series:[{name,color,values,dim, names?,colors?,dims?}], unit, dp, aria, height} */
  V.groupedBars = function (el, o) {
    var W = V.width(el), H = o.height || 240, L = 52, R = 18, T = 16, Bm = 34, vals = [];
    o.series.forEach(function (s) { (s.values || []).forEach(function (v) { if (v != null) vals.push(v); }); });
    var ext = V.extent([vals]); ext[0] = Math.min(0, ext[0]); ext[1] = Math.max(0, ext[1]);
    var pad = (ext[1] - ext[0]) * 0.1 || 1, lo = ext[0] - (ext[0] < 0 ? pad : 0), hi = ext[1] + pad, tk = V.niceTicks(lo, hi, 5), y = function (v) { return T + (hi - v) / (hi - lo) * (H - T - Bm); };
    var G = o.groups.length, gw = (W - L - R) / Math.max(1, G), bw = Math.min(o.series.length === 1 ? 48 : 30, (gw * 0.72) / Math.max(1, o.series.length));
    var svg = '<svg class="viz" width="' + W + '" height="' + H + '" role="img" aria-label="' + esc(o.aria || '') + '">';
    tk.ticks.forEach(function (t) { svg += '<line class="gl" x1="' + L + '" x2="' + (W - R) + '" y1="' + y(t).toFixed(1) + '" y2="' + y(t).toFixed(1) + '"/><text x="' + (L - 8) + '" y="' + (y(t) + 4).toFixed(1) + '" text-anchor="end">' + V.fmtTick(t) + '</text>'; });
    svg += '<line class="zero" x1="' + L + '" x2="' + (W - R) + '" y1="' + y(0).toFixed(1) + '" y2="' + y(0).toFixed(1) + '"/>';
    o.groups.forEach(function (gname, gi) {
      var gx = L + gi * gw + gw / 2, x0 = gx - o.series.length * bw / 2;
      o.series.forEach(function (s, si) {
        var v = s.values ? s.values[gi] : null, x = x0 + si * bw + 1, color = s.colors ? s.colors[gi] : s.color, dim = s.dims ? s.dims[gi] : s.dim, name = s.names ? s.names[gi] : s.name;
        if (v == null) { svg += '<text class="tlabel" x="' + (x + bw / 2 - 1).toFixed(1) + '" y="' + (y(0) - 6).toFixed(1) + '" text-anchor="middle" fill="var(--viz-muted)">—</text>'; return; }
        var top = y(Math.max(0, v)), h = Math.abs(y(v) - y(0));
        svg += '<rect class="bar' + (dim ? ' is-dim' : '') + '" x="' + x.toFixed(1) + '" y="' + top.toFixed(1) + '" width="' + (bw - 2).toFixed(1) + '" height="' + Math.max(h, 1).toFixed(1) + '" fill="' + color + '" rx="2" data-tip="' + esc(name + ' · ' + gname + ': ' + F.num(v, o.dp) + ' ' + (o.unit || '')) + '" tabindex="0" aria-label="' + esc(name + ', ' + gname + ', ' + F.num(v, o.dp) + ' ' + (o.unit || '')) + '"/>';
        if (!dim && bw >= 22) svg += '<text class="vlabel" x="' + (x + bw / 2 - 1).toFixed(1) + '" y="' + (v >= 0 ? top - 4 : top + h + 11).toFixed(1) + '" text-anchor="middle">' + F.num(v, o.dp) + '</text>';
      });
      svg += '<text x="' + gx.toFixed(1) + '" y="' + (H - 10) + '" text-anchor="middle" class="tlabel">' + esc(gname.length > 18 && G > 4 ? gname.slice(0, 16) + '…' : gname) + '</text>';
    });
    el.innerHTML = svg + '</svg>';
  };

  /* ── horizontal stacked bars (allocations by category) ──────────── */
  /** opts: {rows:[{label,color,dim,segments:[{label,color,value,hatched,tip}]}], max, aria} */
  V.stackedBars = function (el, o) {
    var W = V.width(el), L = 160, R = 54, rowH = 34, T = 8, H = T + o.rows.length * rowH + 22, max = o.max || 100;
    var x = function (v) { return L + v / max * (W - L - R); };
    var svg = '<svg class="viz" width="' + W + '" height="' + H + '" role="img" aria-label="' + esc(o.aria || '') + '"><defs><pattern id="hatch" width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><line x1="0" y1="0" x2="0" y2="6" stroke="#fff" stroke-width="3" opacity=".55"/></pattern></defs>';
    [0, 25, 50, 75, 100].forEach(function (t) { if (t > max) return; svg += '<line class="gl" x1="' + x(t).toFixed(1) + '" x2="' + x(t).toFixed(1) + '" y1="' + T + '" y2="' + (H - 22) + '"/><text x="' + x(t).toFixed(1) + '" y="' + (H - 6) + '" text-anchor="middle">' + t + '%</text>'; });
    o.rows.forEach(function (r, i) {
      var cy = T + i * rowH, cur = 0;
      svg += '<text class="tlabel" x="' + (L - 10) + '" y="' + (cy + rowH / 2 + 4) + '" text-anchor="end"' + (r.dim ? ' opacity=".45"' : '') + '><tspan fill="' + r.color + '">●</tspan> ' + esc(r.label.length > 20 ? r.label.slice(0, 19) + '…' : r.label) + '</text>';
      svg += '<g' + (r.dim ? ' opacity=".35"' : '') + '>';
      r.segments.forEach(function (s) {
        if (!(s.value > 0)) return;
        var x0 = x(cur), w = x(cur + s.value) - x0;
        svg += '<rect x="' + x0.toFixed(1) + '" y="' + (cy + 5) + '" width="' + Math.max(w, 0.5).toFixed(1) + '" height="' + (rowH - 10) + '" fill="' + s.color + '" data-tip="' + esc(s.tip || (s.label + ': ' + F.num(s.value) + '%')) + '" tabindex="0" aria-label="' + esc(r.label + ', ' + s.label + ', ' + F.num(s.value) + '%') + '"/>';
        if (s.hatched) svg += '<rect x="' + x0.toFixed(1) + '" y="' + (cy + 5) + '" width="' + Math.max(w, 0.5).toFixed(1) + '" height="' + (rowH - 10) + '" fill="url(#hatch)" pointer-events="none"/>';
        if (w > 34) svg += '<text x="' + (x0 + w / 2).toFixed(1) + '" y="' + (cy + rowH / 2 + 4) + '" text-anchor="middle" fill="#fff" font-size="11" font-weight="600" pointer-events="none">' + F.num(s.value, 0) + '</text>';
        cur += s.value;
      });
      /* the row total is drawn only when it is not 100%: then it is worth reading */
      svg += '</g>' + (Math.abs(cur - 100) > 0.05 ? '<text class="vlabel" x="' + (x(Math.min(cur, max)) + 8).toFixed(1) + '" y="' + (cy + rowH / 2 + 4) + '">' + F.num(cur) + '%</text>' : '');
    });
    el.innerHTML = svg + '</svg>';
  };

  /* ── projection small multiples ──────────────────────────────────── */
  /** opts: {panels:[{id,name,color,tag,s:{years,central,bands,start,mu,vol,reason}}], horizon, confidence} */
  V.smallMultiples = function (el, o) {
    var all = []; o.panels.forEach(function (p) { if (p.s && p.s.central) { all.push(p.s.central); p.s.bands.forEach(function (b) { all.push(b.low); all.push(b.high); }); } });
    if (!all.length) { el.innerHTML = '<div class="chart-empty">' + esc((o.panels[0] && o.panels[0].s && o.panels[0].s.reason) || 'Nothing to project.') + '</div>'; return; }
    var ext = V.extent(all), pad = (ext[1] - ext[0]) * 0.05, lo = ext[0] - pad, hi = ext[1] + pad, tk = V.niceTicks(lo, hi, 5);
    el.innerHTML = '<div class="small-multiples">' + o.panels.map(function (p) { return '<div class="sm-panel" data-aid="' + esc(p.id) + '"><div class="sm-head"><span class="dot" style="background:' + p.color + '"></span>' + esc(p.name) + (p.tag || '') + '<span class="meta">' + (p.s && p.s.mu != null ? 'μ ' + F.num(p.s.mu, 1) + '% · σ ' + F.num(p.s.vol, 1) + '%' : '') + '</span></div><div class="sm-svg"></div></div>'; }).join('') + '</div>';
    o.panels.forEach(function (p) {
      var holder = el.querySelector('.sm-panel[data-aid="' + CSS.escape(p.id) + '"] .sm-svg'), W = Math.max(200, holder.clientWidth), H = o.height || 190, L = 46, R = 36, T = 10, Bm = 26;
      if (!p.s || !p.s.central) { holder.innerHTML = '<div class="chart-empty">' + esc((p.s && p.s.reason) || 'Unavailable') + '</div>'; return; }
      var n = p.s.years.length, xx = function (i) { return L + i / (n - 1) * (W - L - R); }, y = function (v) { return T + (hi - v) / (hi - lo) * (H - T - Bm); };
      var svg = '<svg class="viz" width="' + W + '" height="' + H + '" role="img" aria-label="' + esc(p.name + ' projection over ' + o.horizon + ' years: central path from ' + F.num(p.s.start, 0) + ' to ' + F.num(p.s.central[n - 1], 1) + ', ' + Math.round(o.confidence * 100) + '% band ' + F.num(p.s.bands[1].low[n - 1], 1) + ' to ' + F.num(p.s.bands[1].high[n - 1], 1)) + '">';
      tk.ticks.forEach(function (t) { svg += '<line class="gl" x1="' + L + '" x2="' + (W - R) + '" y1="' + y(t).toFixed(1) + '" y2="' + y(t).toFixed(1) + '"/><text x="' + (L - 6) + '" y="' + (y(t) + 4).toFixed(1) + '" text-anchor="end">' + V.fmtTick(t) + '</text>'; });
      var area = function (b) { var d = ''; for (var i = 0; i < n; i++) d += (i ? 'L' : 'M') + xx(i).toFixed(1) + ',' + y(b.high[i]).toFixed(1); for (var j = n - 1; j >= 0; j--) d += 'L' + xx(j).toFixed(1) + ',' + y(b.low[j]).toFixed(1); return d + 'Z'; };
      svg += '<path class="band outer" fill="' + p.color + '" d="' + area(p.s.bands[1]) + '"/><path class="band" fill="' + p.color + '" d="' + area(p.s.bands[0]) + '"/>';
      svg += '<path class="central" stroke="' + p.color + '" d="' + p.s.central.map(function (v, i) { return (i ? 'L' : 'M') + xx(i).toFixed(1) + ',' + y(v).toFixed(1); }).join('') + '"/>';
      svg += '<line class="zero" x1="' + L + '" x2="' + (W - R) + '" y1="' + y(p.s.start).toFixed(1) + '" y2="' + y(p.s.start).toFixed(1) + '"/>';
      svg += '<text class="vlabel" x="' + (W - R + 4) + '" y="' + (y(p.s.central[n - 1]) + 4).toFixed(1) + '">' + F.num(p.s.central[n - 1], 0) + '</text><text x="' + (W - R + 4) + '" y="' + (y(p.s.bands[1].high[n - 1]) + 4).toFixed(1) + '">' + F.num(p.s.bands[1].high[n - 1], 0) + '</text><text x="' + (W - R + 4) + '" y="' + (y(p.s.bands[1].low[n - 1]) + 4).toFixed(1) + '">' + F.num(p.s.bands[1].low[n - 1], 0) + '</text>';
      for (var yr = 0; yr <= o.horizon; yr += Math.max(1, Math.round(o.horizon / 5))) { var i2 = yr * 4; if (i2 < n) svg += '<text x="' + xx(i2).toFixed(1) + '" y="' + (H - 8) + '" text-anchor="middle">' + (yr === 0 ? 'now' : yr + 'y') + '</text>'; }
      holder.innerHTML = svg + '</svg>';
    });
  };

  /* ── dot plot (base vs scenarios) ────────────────────────────────── */
  /** opts: {rows:[{label,color,dim,base,points:[{label,value,reason,shape}]}], unit, dp, aria} */
  V.dotPlot = function (el, o) {
    var W = V.width(el), rowH = 38, L = 150, R = 24, T = 22, H = T + rowH * o.rows.length + 30, vals = [];
    o.rows.forEach(function (r) { if (r.base != null) vals.push(r.base); r.points.forEach(function (p) { if (p.value != null) vals.push(p.value); }); });
    var ext = V.extent([vals]); ext[0] = Math.min(0, ext[0]); var pad = (ext[1] - ext[0]) * 0.1 || 1, lo = ext[0] - (ext[0] < 0 ? pad : 0), hi = ext[1] + pad, tk = V.niceTicks(lo, hi, 6), x = function (v) { return L + (v - lo) / (hi - lo) * (W - L - R); };
    var shapes = ['diamond', 'square', 'triangle', 'circle'], missing = [];
    var mark = function (shape, cx, cy, color, filled) { var s = 6, f = filled ? color : '#fff'; if (shape === 'circle') return '<circle cx="' + cx + '" cy="' + cy + '" r="' + s + '" fill="' + f + '" stroke="' + color + '" stroke-width="2"/>'; if (shape === 'square') return '<rect x="' + (cx - s) + '" y="' + (cy - s) + '" width="' + 2 * s + '" height="' + 2 * s + '" fill="' + f + '" stroke="' + color + '" stroke-width="2"/>'; if (shape === 'triangle') return '<path d="M' + cx + ',' + (cy - s - 1) + 'L' + (cx + s + 1) + ',' + (cy + s) + 'L' + (cx - s - 1) + ',' + (cy + s) + 'Z" fill="' + f + '" stroke="' + color + '" stroke-width="2"/>'; return '<path d="M' + cx + ',' + (cy - s - 1) + 'L' + (cx + s + 1) + ',' + cy + 'L' + cx + ',' + (cy + s + 1) + 'L' + (cx - s - 1) + ',' + cy + 'Z" fill="' + f + '" stroke="' + color + '" stroke-width="2"/>'; };
    var svg = '<svg class="viz" width="' + W + '" height="' + H + '" role="img" aria-label="' + esc(o.aria || '') + '">';
    tk.ticks.forEach(function (t) { svg += '<line class="gl" x1="' + x(t).toFixed(1) + '" x2="' + x(t).toFixed(1) + '" y1="' + T + '" y2="' + (H - 26) + '"/><text x="' + x(t).toFixed(1) + '" y="' + (H - 8) + '" text-anchor="middle">' + V.fmtTick(t) + '</text>'; });
    svg += '<line class="zero" x1="' + x(0).toFixed(1) + '" x2="' + x(0).toFixed(1) + '" y1="' + T + '" y2="' + (H - 26) + '"/>';
    o.rows.forEach(function (r, i) {
      var cy = T + i * rowH + rowH / 2;
      svg += '<text class="tlabel" x="' + (L - 12) + '" y="' + (cy + 4) + '" text-anchor="end"' + (r.dim ? ' opacity=".45"' : '') + '>' + esc(r.label.length > 22 ? r.label.slice(0, 21) + '…' : r.label) + '</text><line class="gl" x1="' + L + '" x2="' + (W - R) + '" y1="' + cy + '" y2="' + cy + '"/><g' + (r.dim ? ' opacity=".3"' : '') + '>';
      r.points.forEach(function (p, k) { if (p.value == null) { missing.push(p.label + ' for ' + r.label + ': ' + (p.reason || 'unavailable')); return; } svg += '<g data-tip="' + esc(p.label + ': ' + F.num(p.value, o.dp) + ' ' + (o.unit || '')) + '" tabindex="0" aria-label="' + esc(r.label + ', ' + p.label + ', ' + F.num(p.value, o.dp)) + '">' + mark(shapes[k % 4], x(p.value).toFixed(1), cy, r.color, false) + '</g>'; });
      if (r.base != null) svg += '<g data-tip="' + esc('Base: ' + F.num(r.base, o.dp) + ' ' + (o.unit || '')) + '" tabindex="0" aria-label="' + esc(r.label + ', base, ' + F.num(r.base, o.dp)) + '">' + mark('circle', x(r.base).toFixed(1), cy, r.color, true) + '</g>';
      svg += '</g>';
    });
    var labels = (o.rows[0] ? o.rows[0].points : []).map(function (p) { return p.label; });
    el.innerHTML = svg + '</svg><div class="viz-legend" style="padding:8px 0 0"><span class="legend-note">● Base</span>' + labels.map(function (l, k) { return '<span class="legend-note">' + ['◇', '□', '△', '○'][k % 4] + ' ' + esc(l) + '</span>'; }).join('') + '</div>' + (missing.length ? '<div class="small muted" style="padding:6px 0 0">Not plotted · ' + esc(missing.join(' · ')) + '</div>' : '');
  };

  /* ── heat matrix (correlations) ──────────────────────────────────── */
  V.heatmap = function (el, o) {
    var n = o.labels.length;
    var shade = function (v) { if (v == null) return 'var(--surface-2)'; var a = Math.min(1, Math.abs(v)); return v >= 0 ? 'rgba(42,120,214,' + (0.08 + a * 0.55).toFixed(2) + ')' : 'rgba(235,104,52,' + (0.08 + a * 0.55).toFixed(2) + ')'; };
    var t = '<table class="corr corr-lg" aria-label="' + esc(o.aria || 'Correlation matrix') + '"><thead><tr><th scope="col"></th>' + o.labels.map(function (l) { return '<th scope="col">' + esc(l) + '</th>'; }).join('') + '</tr></thead><tbody>';
    for (var i = 0; i < n; i++) { t += '<tr><th scope="row">' + esc(o.labels[i]) + '</th>'; for (var j = 0; j < n; j++) { var v = o.matrix[i][j]; t += '<td><span class="cc' + (i === j ? ' diag' : '') + '" style="background:' + shade(v) + '" data-tip="' + esc(o.labels[i] + ' ↔ ' + o.labels[j] + ': ' + (v == null ? 'unavailable' : F.num(v, 2))) + '">' + (v == null ? '—' : F.num(v, 2)) + '</span></td>'; } t += '</tr>'; }
    el.innerHTML = '<div class="corr-wrap" style="padding:4px 0">' + t + '</tbody></table></div>';
  };

  /* ── scatter: return against risk, capture against capture ──────── */
  /** opts: {points:[{label,color,x,y,dim,hollow,tip}], xLabel, yLabel, fmtX, fmtY, refX?, refY?, height, aria} */
  V.scatter = function (el, o) {
    var W = V.width(el), H = o.height || 260, L = 52, R = 24, T = 16, Bm = 40, pts = o.points.filter(function (p) { return p.x != null && p.y != null; });
    var xs = pts.map(function (p) { return p.x; }), ys = pts.map(function (p) { return p.y; });
    if (o.refX != null) xs.push(o.refX); if (o.refY != null) ys.push(o.refY);
    var ex = V.extent([xs]), ey = V.extent([ys]), px = (ex[1] - ex[0]) * 0.18 || 1, py = (ey[1] - ey[0]) * 0.18 || 0.5;
    var tx = V.niceTicks(ex[0] - px, ex[1] + px, 5), ty = V.niceTicks(ey[0] - py, ey[1] + py, 5), x0 = tx.lo, x1 = tx.hi, y0 = ty.lo, y1 = ty.hi;
    var x = function (v) { return L + (v - x0) / (x1 - x0) * (W - L - R); }, y = function (v) { return T + (y1 - v) / (y1 - y0) * (H - T - Bm); };
    var fx = o.fmtX || function (v) { return F.num(v, 1); }, fy = o.fmtY || function (v) { return F.num(v, 1); };
    var svg = '<svg class="viz" width="' + W + '" height="' + H + '" role="img" aria-label="' + esc(o.aria || '') + '">';
    ty.ticks.forEach(function (t) { svg += '<line class="gl" x1="' + L + '" x2="' + (W - R) + '" y1="' + y(t).toFixed(1) + '" y2="' + y(t).toFixed(1) + '"/><text x="' + (L - 8) + '" y="' + (y(t) + 4).toFixed(1) + '" text-anchor="end">' + V.fmtTick(t) + '</text>'; });
    tx.ticks.forEach(function (t) { svg += '<line class="gl" x1="' + x(t).toFixed(1) + '" x2="' + x(t).toFixed(1) + '" y1="' + T + '" y2="' + (H - Bm) + '"/><text x="' + x(t).toFixed(1) + '" y="' + (H - Bm + 16) + '" text-anchor="middle">' + V.fmtTick(t) + '</text>'; });
    if (o.refX != null) svg += '<line class="zero" x1="' + x(o.refX).toFixed(1) + '" x2="' + x(o.refX).toFixed(1) + '" y1="' + T + '" y2="' + (H - Bm) + '"/>';
    if (o.refY != null) svg += '<line class="zero" x1="' + L + '" x2="' + (W - R) + '" y1="' + y(o.refY).toFixed(1) + '" y2="' + y(o.refY).toFixed(1) + '"/>';
    svg += '<text x="' + ((L + W - R) / 2).toFixed(1) + '" y="' + (H - 6) + '" text-anchor="middle" class="tlabel">' + esc(o.xLabel || '') + '</text><text x="12" y="' + ((T + H - Bm) / 2).toFixed(1) + '" text-anchor="middle" class="tlabel" transform="rotate(-90 12 ' + ((T + H - Bm) / 2).toFixed(1) + ')">' + esc(o.yLabel || '') + '</text>';
    var placed = [];
    pts.forEach(function (p) {
      var cx = x(p.x), cy = y(p.y), tip = p.tip || (p.label + ': ' + (o.yName || 'y') + ' ' + fy(p.y) + ', ' + (o.xName || 'x') + ' ' + fx(p.x));
      svg += '<g class="pt' + (p.dim ? ' is-dim' : '') + '" tabindex="0" data-tip="' + esc(tip) + '" aria-label="' + esc(tip) + '">' + (p.hollow ? '<path d="M' + cx.toFixed(1) + ',' + (cy - 7).toFixed(1) + 'L' + (cx + 7).toFixed(1) + ',' + cy.toFixed(1) + 'L' + cx.toFixed(1) + ',' + (cy + 7).toFixed(1) + 'L' + (cx - 7).toFixed(1) + ',' + cy.toFixed(1) + 'Z" fill="var(--surface)" stroke="' + p.color + '" stroke-width="2"/>' : '<circle cx="' + cx.toFixed(1) + '" cy="' + cy.toFixed(1) + '" r="6" fill="' + p.color + '" stroke="var(--surface)" stroke-width="2"/>') + '<circle cx="' + cx.toFixed(1) + '" cy="' + cy.toFixed(1) + '" r="12" fill="transparent"/></g>';
      /* direct label, nudged down when it would collide with one already placed */
      var lx = cx + 10, ly = cy + 4, anchor = 'start'; if (lx + 120 > W - R) { lx = cx - 10; anchor = 'end'; }
      while (placed.some(function (q) { return Math.abs(q.y - ly) < 13 && Math.abs(q.x - lx) < 110; })) ly += 13;
      placed.push({ x: lx, y: ly });
      if (!p.dim) svg += '<text class="vlabel" x="' + lx.toFixed(1) + '" y="' + ly.toFixed(1) + '" text-anchor="' + anchor + '">' + esc(p.label.length > 22 ? p.label.slice(0, 21) + '…' : p.label) + '</text>';
    });
    el.innerHTML = svg + '</svg>';
  };

  /* ── horizontal diverging bars: rows × series ─────────────────────── */
  /** opts: {rows:[label], series:[{name,color,dim,values}], unit, dp, aria, signed} */
  V.hBars = function (el, o) {
    var W = V.width(el), n = o.series.length, bh = n > 3 ? 6 : n > 1 ? 8 : 12, gap = 1, rowH = n * (bh + gap) + 12, L = Math.min(190, Math.max(110, W * 0.3)), R = 52, T = 8, H = T + o.rows.length * rowH + 24, vals = [];
    o.series.forEach(function (s) { (s.values || []).forEach(function (v) { if (v != null) vals.push(v); }); });
    var ext = V.extent([vals]); ext[0] = Math.min(0, ext[0]); ext[1] = Math.max(0, ext[1]); var pad = (ext[1] - ext[0]) * 0.08 || 1;
    var tk = V.niceTicks(ext[0] - (ext[0] < 0 ? pad : 0), ext[1] + (ext[1] > 0 ? pad : 0), 5), lo = tk.lo, hi = tk.hi, x = function (v) { return L + (v - lo) / (hi - lo) * (W - L - R); };
    var fmt = function (v) { return (o.signed ? F.signed(v, o.dp) : F.num(v, o.dp)) + (o.unit === '%' ? '%' : ''); };
    var svg = '<svg class="viz" width="' + W + '" height="' + H + '" role="img" aria-label="' + esc(o.aria || '') + '">';
    tk.ticks.forEach(function (t) { svg += '<line class="gl" x1="' + x(t).toFixed(1) + '" x2="' + x(t).toFixed(1) + '" y1="' + T + '" y2="' + (H - 22) + '"/><text x="' + x(t).toFixed(1) + '" y="' + (H - 8) + '" text-anchor="middle">' + V.fmtTick(t) + '</text>'; });
    svg += '<line class="zero" x1="' + x(0).toFixed(1) + '" x2="' + x(0).toFixed(1) + '" y1="' + T + '" y2="' + (H - 22) + '"/>';
    o.rows.forEach(function (label, ri) {
      var y0 = T + ri * rowH + 6;
      svg += '<text class="tlabel" x="' + (L - 10) + '" y="' + (y0 + n * (bh + gap) / 2 + 3).toFixed(1) + '" text-anchor="end">' + esc(label.length > 30 ? label.slice(0, 29) + '…' : label) + '</text>';
      o.series.forEach(function (s, si) {
        var v = s.values ? s.values[ri] : null, yy = y0 + si * (bh + gap); if (v == null) return;
        var a = x(Math.min(0, v)), b = x(Math.max(0, v)), tip = s.name + ' · ' + label + ': ' + fmt(v) + (o.unit && o.unit !== '%' ? ' ' + o.unit : '');
        svg += '<rect class="bar' + (s.dim ? ' is-dim' : '') + '" x="' + a.toFixed(1) + '" y="' + yy.toFixed(1) + '" width="' + Math.max(1, b - a).toFixed(1) + '" height="' + bh + '" rx="2" fill="' + s.color + '" tabindex="0" data-tip="' + esc(tip) + '" aria-label="' + esc(tip) + '"/>';
        if (!s.dim && n <= 2) svg += '<text class="vlabel" x="' + (v >= 0 ? b + 4 : a - 4).toFixed(1) + '" y="' + (yy + bh - 1).toFixed(1) + '" text-anchor="' + (v >= 0 ? 'start' : 'end') + '" style="font-size:10px">' + fmt(v) + '</text>';
      });
    });
    el.innerHTML = svg + '</svg>';
  };

  /* ── distribution of monthly returns: frequency polygons ─────────── */
  /** opts: {bins:number[] (left edges, 1pp wide), series:[{name,color,dim,counts:number[] (share of months, %)}], aria, height} */
  V.distribution = function (el, o) {
    var W = V.width(el), H = o.height || 220, L = 44, R = 16, T = 12, Bm = 34, nb = o.bins.length, max = 0;
    o.series.forEach(function (s) { s.counts.forEach(function (c) { max = Math.max(max, c); }); });
    var tk = V.niceTicks(0, max * 1.1 || 1, 4), x = function (v) { return L + (v - o.bins[0]) / (nb || 1) * (W - L - R); }, y = function (v) { return T + (tk.hi - v) / (tk.hi - 0) * (H - T - Bm); };
    var svg = '<svg class="viz" width="' + W + '" height="' + H + '" role="img" aria-label="' + esc(o.aria || '') + '">';
    tk.ticks.forEach(function (t) { svg += '<line class="gl" x1="' + L + '" x2="' + (W - R) + '" y1="' + y(t).toFixed(1) + '" y2="' + y(t).toFixed(1) + '"/><text x="' + (L - 8) + '" y="' + (y(t) + 4).toFixed(1) + '" text-anchor="end">' + V.fmtTick(t) + '</text>'; });
    var every = Math.max(1, Math.ceil(nb / Math.max(4, Math.floor((W - L - R) / 44))));
    for (var b = 0; b <= nb; b++) { var e = o.bins[0] + b; if (b % every === 0 || e === 0) svg += '<text x="' + x(e).toFixed(1) + '" y="' + (H - Bm + 16) + '" text-anchor="middle">' + (e > 0 ? '+' : '') + e + '%</text>'; }
    if (o.bins[0] < 0 && o.bins[0] + nb > 0) svg += '<line class="zero" x1="' + x(0).toFixed(1) + '" x2="' + x(0).toFixed(1) + '" y1="' + T + '" y2="' + (H - Bm) + '"/>';
    svg += '<line class="ax" x1="' + L + '" x2="' + (W - R) + '" y1="' + (H - Bm) + '" y2="' + (H - Bm) + '"/>';
    o.series.forEach(function (s) { var d = 'M' + x(o.bins[0]).toFixed(1) + ',' + y(0).toFixed(1); s.counts.forEach(function (c, i) { d += 'L' + x(o.bins[0] + i).toFixed(1) + ',' + y(c).toFixed(1) + 'L' + x(o.bins[0] + i + 1).toFixed(1) + ',' + y(c).toFixed(1); }); d += 'L' + x(o.bins[0] + nb).toFixed(1) + ',' + y(0).toFixed(1); svg += '<path class="series' + (s.dim ? ' is-dim' : '') + '" stroke="' + s.color + '" d="' + d + '"/>'; });
    o.bins.forEach(function (b0, i) { var tip = (b0 >= 0 ? '+' : '') + b0 + '% to ' + (b0 + 1 >= 0 ? '+' : '') + (b0 + 1) + '%: ' + o.series.map(function (s) { return s.name + ' ' + F.num(s.counts[i], 0) + '% of months'; }).join(' · '); svg += '<rect x="' + x(b0).toFixed(1) + '" y="' + T + '" width="' + (x(b0 + 1) - x(b0)).toFixed(1) + '" height="' + (H - T - Bm) + '" fill="transparent" data-tip="' + esc(tip) + '"/>'; });
    el.innerHTML = svg + '</svg>';
  };

  /* ── waterfall: contributions that add up to a total ─────────────── */
  /**
   * Horizontal: one row per step, each bar starting where the last ended, then
   * the total from zero. opts: {start?:{label,value,color}, steps:[{label,value,color,tip?}],
   * total:{label,color,value?}, unit:'%'|'pp', dp, aria}
   */
  V.waterfall = function (el, o) {
    var W = V.width(el), rowH = 26, L = Math.min(190, Math.max(110, W * 0.32)), R = 64, T = 6, bars = [], run = o.start ? o.start.value : 0;
    if (o.start) bars.push({ label: o.start.label, a: 0, b: o.start.value, v: o.start.value, color: o.start.color, end: true });
    o.steps.forEach(function (st) { if (st.value == null) return; bars.push({ label: st.label, a: run, b: run + st.value, v: st.value, color: st.color, tip: st.tip }); run += st.value; });
    bars.push({ label: o.total.label, a: 0, b: run, v: run, color: o.total.color, end: true, total: true });
    if (o.height) rowH = Math.max(17, Math.min(26, Math.floor((o.height - T - 26) / bars.length)));
    var H = T + bars.length * rowH + 26, vals = [0]; bars.forEach(function (b) { vals.push(b.a, b.b); });
    var ext = V.extent([vals]), pad = (ext[1] - ext[0]) * 0.06 || 1, tk = V.niceTicks(ext[0] - (ext[0] < 0 ? pad : 0), ext[1] + pad, 5), x = function (v) { return L + (v - tk.lo) / (tk.hi - tk.lo) * (W - L - R); };
    var u = o.unit === '%' ? '%' : '', fmt = function (b) { return (b.end ? F.num(b.v, o.dp) : F.signed(b.v, o.dp)) + u; };
    var svg = '<svg class="viz wf" width="' + W + '" height="' + H + '" role="img" aria-label="' + esc(o.aria || '') + '">';
    tk.ticks.forEach(function (t) { svg += '<line class="gl" x1="' + x(t).toFixed(1) + '" x2="' + x(t).toFixed(1) + '" y1="' + T + '" y2="' + (H - 22) + '"/><text x="' + x(t).toFixed(1) + '" y="' + (H - 8) + '" text-anchor="middle">' + V.fmtTick(t) + '</text>'; });
    svg += '<line class="zero" x1="' + x(0).toFixed(1) + '" x2="' + x(0).toFixed(1) + '" y1="' + T + '" y2="' + (H - 22) + '"/>';
    bars.forEach(function (b, i) {
      var y = T + i * rowH + 3, h = rowH - 6, lo = Math.min(b.a, b.b), hi = Math.max(b.a, b.b), neg = !b.end && b.v < 0, tip = (b.tip || b.label) + ': ' + fmt(b) + (o.unit === 'pp' ? ' pp' : '') + (b.end ? '' : ' · running total ' + F.num(b.b, o.dp) + u);
      if (b.total) svg += '<line class="wf-rule" x1="' + (L - 104) + '" x2="' + (W - 8) + '" y1="' + (y - 4) + '" y2="' + (y - 4) + '"/>';
      svg += '<text class="tlabel' + (b.end ? ' is-end' : '') + '" x="' + (L - 10) + '" y="' + (y + h / 2 + 4).toFixed(1) + '" text-anchor="end">' + esc(b.label.length > 30 ? b.label.slice(0, 29) + '…' : b.label) + '</text>';
      svg += '<rect class="bar" x="' + x(lo).toFixed(1) + '" y="' + y + '" width="' + Math.max(1.5, x(hi) - x(lo)).toFixed(1) + '" height="' + h + '" rx="2" fill="' + b.color + '"' + (neg ? ' fill-opacity=".4" stroke="' + b.color + '" stroke-width="1.5"' : '') + ' tabindex="0" data-tip="' + esc(tip) + '" aria-label="' + esc(tip) + '"/>';
      svg += '<text class="vlabel' + (b.end ? ' is-end' : '') + '" x="' + (x(hi) + 5).toFixed(1) + '" y="' + (y + h / 2 + 4).toFixed(1) + '">' + fmt(b) + '</text>';
      if (i < bars.length - 1 && !bars[i + 1].end) svg += '<line class="wf-link" x1="' + x(b.b).toFixed(1) + '" x2="' + x(b.b).toFixed(1) + '" y1="' + (y + h) + '" y2="' + (y + rowH) + '"/>';
    });
    el.innerHTML = svg + '</svg>';
  };

  /** A diverging cell shade for heat grids: blue for gains, orange for losses. */
  V.shade = function (v, maxAbs) { if (v == null || !isFinite(v)) return 'transparent'; var a = Math.min(1, Math.abs(v) / (maxAbs || 1)); return v >= 0 ? 'rgba(42,120,214,' + (0.06 + a * 0.42).toFixed(2) + ')' : 'rgba(235,104,52,' + (0.06 + a * 0.42).toFixed(2) + ')'; };
  /** A small in-cell bar (0–100 or a share of max). */
  V.cellBar = function (v, max, color) { if (v == null) return ''; return '<span class="cell-bar"><i style="width:' + U.clamp(Math.abs(v) / (max || 100) * 100, 0, 100).toFixed(1) + '%;background:' + (color || 'var(--ink-3)') + '"></i></span>'; };

  /* ── data tables ─────────────────────────────────────────────────── */
  /** cols: [{label, num}] rows: [[cell html…]] */
  V.table = function (cols, rows, opts) {
    opts = opts || {};
    return '<div class="tblwrap" style="max-height:' + (opts.maxHeight || '100%') + '"><table class="tbl' + (opts.cls ? ' ' + opts.cls : '') + '">' + (opts.caption ? '<caption class="sr-only">' + esc(opts.caption) + '</caption>' : '') + '<thead><tr>' + cols.map(function (c) { return '<th scope="col"' + (c.num ? ' class="num"' : '') + '>' + c.label + '</th>'; }).join('') + '</tr></thead><tbody>' +
      rows.map(function (r) { return '<tr' + (r.cls ? ' class="' + r.cls + '"' : '') + '>' + r.cells.map(function (cell, i) { return (i === 0 ? '<th scope="row">' : '<td' + (cols[i] && cols[i].num ? ' class="num"' : '') + '>') + cell + (i === 0 ? '</th>' : '</td>'); }).join('') + '</tr>'; }).join('') + '</tbody></table></div>';
  };
  V.signed = function (v, dp, unit) { if (v == null) return '<span class="faint">—</span>'; return '<span class="' + (v < -1e-9 ? 'neg' : '') + '">' + F.num(v, dp) + (unit || '') + '</span>'; };
})();

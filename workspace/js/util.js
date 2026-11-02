/* ─────────────────────────────────────────────────────────────────────────
   Portfolio Analytics · utilities
   One global namespace, PA, shared by every file. No module system is used
   so the page opens from file:// and from any static host without a build.
   Load order is set in index.html and is load-bearing.
   ───────────────────────────────────────────────────────────────────────── */
(function () {
  'use strict';
  var PA = window.PA = window.PA || {};
  var U = PA.util = {};

  /* ── DOM ─────────────────────────────────────────────────────────── */
  U.$ = function (sel, root) { return (root || document).querySelector(sel); };
  U.$$ = function (sel, root) { return Array.prototype.slice.call((root || document).querySelectorAll(sel)); };

  /** Escape text for safe interpolation into HTML strings. */
  U.esc = function (s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  };

  /** Build an element from an HTML string (first element only). */
  U.html = function (str) {
    var t = document.createElement('template');
    t.innerHTML = str.trim();
    return t.content.firstElementChild;
  };

  /** Delegate an event from a root to matching descendants. */
  U.on = function (root, type, sel, fn, opts) {
    root.addEventListener(type, function (e) {
      var t = e.target.closest ? e.target.closest(sel) : null;
      if (t && root.contains(t)) fn(e, t);
    }, opts);
  };

  /** Announce to assistive technology without moving focus. */
  U.announce = function (msg, assertive) {
    var el = document.getElementById(assertive ? 'live-assertive' : 'live-polite');
    if (!el) return;
    el.textContent = '';
    setTimeout(function () { el.textContent = msg; }, 30);
  };

  U.debounce = function (fn, ms) {
    var t;
    var d = function () { var a = arguments, c = this; clearTimeout(t); t = setTimeout(function () { fn.apply(c, a); }, ms); };
    d.cancel = function () { clearTimeout(t); };
    return d;
  };

  U.clamp = function (v, lo, hi) { return Math.min(hi, Math.max(lo, v)); };
  U.sum = function (arr, f) { var s = 0; for (var i = 0; i < arr.length; i++) s += f ? f(arr[i], i) : arr[i]; return s; };
  U.clone = function (o) { return JSON.parse(JSON.stringify(o)); };
  U.uid = function (prefix) { return (prefix || 'id') + '_' + Math.random().toString(36).slice(2, 8) + Date.now().toString(36).slice(-4); };
  U.round = function (v, dp) { var m = Math.pow(10, dp == null ? 1 : dp); return Math.round(v * m) / m; };

  /** Deterministic PRNG (mulberry32) so mock history is stable between loads. */
  U.rng = function (seed) {
    var a = seed >>> 0;
    var next = function () {
      a |= 0; a = a + 0x6D2B79F5 | 0;
      var t = Math.imul(a ^ a >>> 15, 1 | a);
      t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
      return ((t ^ t >>> 14) >>> 0) / 4294967296;
    };
    /* Box–Muller normal deviate */
    next.normal = function () {
      var u = 0, v = 0;
      while (u === 0) u = next();
      while (v === 0) v = next();
      return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
    };
    return next;
  };
  U.hash = function (s) { var h = 2166136261; for (var i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; };

  /* ── formatting ──────────────────────────────────────────────────── */
  var MINUS = '−';
  U.fmt = {
    /** Fixed decimals with a true minus sign. */
    num: function (v, dp) {
      if (v == null || !isFinite(v)) return '—';
      var s = Math.abs(v).toFixed(dp == null ? 1 : dp);
      return (v < 0 && Number(s) !== 0 ? MINUS : '') + s;
    },
    signed: function (v, dp) {
      if (v == null || !isFinite(v)) return '—';
      var s = Math.abs(v).toFixed(dp == null ? 1 : dp);
      if (Number(s) === 0) return s;
      return (v < 0 ? MINUS : '+') + s;
    },
    pct: function (v, dp) { return v == null || !isFinite(v) ? '—' : U.fmt.num(v, dp) + '%'; },
    pp: function (v, dp) { return v == null || !isFinite(v) ? '—' : U.fmt.num(v, dp) + ' pp'; },
    money: function (v) {
      if (v == null || !isFinite(v)) return '—';
      return (v < 0 ? MINUS : '') + Math.abs(v).toLocaleString('en-US', { maximumFractionDigits: 0 });
    },
    time: function (d) { d = d instanceof Date ? d : new Date(d); return d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', second: '2-digit' }); },
    date: function (d) { d = d instanceof Date ? d : new Date(d); return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }); },
    dateTime: function (d) { d = d instanceof Date ? d : new Date(d); return U.fmt.date(d) + ', ' + d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' }); },
    /** 'YYYY-MM' → 'Mar 2021' */
    month: function (ym) {
      if (!ym) return '';
      var p = ym.split('-');
      var names = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
      return names[Number(p[1]) - 1] + ' ' + p[0];
    },
    relative: function (d) {
      var ms = Date.now() - new Date(d).getTime();
      var m = Math.round(ms / 60000);
      if (m < 1) return 'just now';
      if (m < 60) return m + ' min ago';
      var h = Math.round(m / 60);
      if (h < 24) return h + ' h ago';
      var days = Math.round(h / 24);
      if (days < 7) return days + ' d ago';
      return U.fmt.date(d);
    }
  };

  /* ── months ──────────────────────────────────────────────────────── */
  /** Month index helpers: 'YYYY-MM' ↔ integer months since 0000-01. */
  U.ym = {
    toIndex: function (ym) { var p = ym.split('-'); return Number(p[0]) * 12 + (Number(p[1]) - 1); },
    fromIndex: function (i) { var y = Math.floor(i / 12), m = i % 12 + 1; return y + '-' + (m < 10 ? '0' : '') + m; },
    add: function (ym, n) { return U.ym.fromIndex(U.ym.toIndex(ym) + n); },
    diff: function (a, b) { return U.ym.toIndex(b) - U.ym.toIndex(a); },
    max: function (a, b) { return U.ym.toIndex(a) >= U.ym.toIndex(b) ? a : b; },
    min: function (a, b) { return U.ym.toIndex(a) <= U.ym.toIndex(b) ? a : b; }
  };

  /* ── linear algebra (small, dense) ───────────────────────────────── */
  U.mat = {
    /** Cholesky factor L of a symmetric matrix, or null if it is not positive definite. */
    cholesky: function (A) {
      var n = A.length, L = [];
      for (var i = 0; i < n; i++) L.push(new Array(n).fill(0));
      for (var i2 = 0; i2 < n; i2++) {
        for (var j = 0; j <= i2; j++) {
          var s = A[i2][j];
          for (var k = 0; k < j; k++) s -= L[i2][k] * L[j][k];
          if (i2 === j) {
            if (s <= 1e-10) return null;
            L[i2][j] = Math.sqrt(s);
          } else {
            L[i2][j] = s / L[j][j];
          }
        }
      }
      return L;
    },
    /** Is this correlation matrix usable (symmetric, unit diagonal, PSD)? */
    isPSD: function (R) {
      var n = R.length;
      for (var i = 0; i < n; i++) {
        if (Math.abs(R[i][i] - 1) > 1e-9) return false;
        for (var j = 0; j < n; j++) {
          if (!isFinite(R[i][j]) || Math.abs(R[i][j]) > 1 + 1e-9) return false;
          if (Math.abs(R[i][j] - R[j][i]) > 1e-9) return false;
        }
      }
      /* tiny ridge so a legitimately singular matrix still passes */
      var A = R.map(function (row, i2) { return row.map(function (v, j2) { return i2 === j2 ? v + 1e-8 : v; }); });
      return U.mat.cholesky(A) !== null;
    },
    mulVec: function (A, x) { return A.map(function (row) { var s = 0; for (var i = 0; i < x.length; i++) s += row[i] * x[i]; return s; }); },
    dot: function (a, b) { var s = 0; for (var i = 0; i < a.length; i++) s += a[i] * b[i]; return s; }
  };

  /* ── statistics on monthly return series ─────────────────────────── */
  U.stats = {
    /** Growth of a starting value through a return series (fractions). */
    growth: function (returns, start) {
      var out = [], v = start == null ? 100 : start;
      for (var i = 0; i < returns.length; i++) { v = v * (1 + returns[i]); out.push(v); }
      return out;
    },
    annualizedReturn: function (returns) {
      if (!returns.length) return null;
      var g = 1;
      for (var i = 0; i < returns.length; i++) g *= 1 + returns[i];
      return Math.pow(g, 12 / returns.length) - 1;
    },
    annualizedVol: function (returns) {
      var n = returns.length;
      if (n < 3) return null;
      var m = U.sum(returns) / n, s = 0;
      for (var i = 0; i < n; i++) s += (returns[i] - m) * (returns[i] - m);
      return Math.sqrt(s / (n - 1)) * Math.sqrt(12);
    },
    maxDrawdown: function (growth) {
      var peak = -Infinity, mdd = 0;
      for (var i = 0; i < growth.length; i++) { peak = Math.max(peak, growth[i]); mdd = Math.min(mdd, growth[i] / peak - 1); }
      return mdd;
    },
    /** Inverse normal CDF (Acklam) for confidence bands. */
    zFor: function (p) {
      var a = [-3.969683028665376e+01, 2.209460984245205e+02, -2.759285104469687e+02, 1.383577518672690e+02, -3.066479806614716e+01, 2.506628277459239e+00];
      var b = [-5.447609879822406e+01, 1.615858368580409e+02, -1.556989798598866e+02, 6.680131188771972e+01, -1.328068155288572e+01];
      var c = [-7.784894002430293e-03, -3.223964580411365e-01, -2.400758277161838e+00, -2.549732539343734e+00, 4.374664141464968e+00, 2.938163982698783e+00];
      var d = [7.784695709041462e-03, 3.224671290700398e-01, 2.445134137142996e+00, 3.754408661907416e+00];
      var pl = 0.02425, ph = 1 - pl, q, r;
      if (p < pl) { q = Math.sqrt(-2 * Math.log(p)); return (((((c[0] * q + c[1]) * q + c[2]) * q + c[3]) * q + c[4]) * q + c[5]) / ((((d[0] * q + d[1]) * q + d[2]) * q + d[3]) * q + 1); }
      if (p <= ph) { q = p - 0.5; r = q * q; return (((((a[0] * r + a[1]) * r + a[2]) * r + a[3]) * r + a[4]) * r + a[5]) * q / (((((b[0] * r + b[1]) * r + b[2]) * r + b[3]) * r + b[4]) * r + 1); }
      q = Math.sqrt(-2 * Math.log(1 - p)); return -(((((c[0] * q + c[1]) * q + c[2]) * q + c[3]) * q + c[4]) * q + c[5]) / ((((d[0] * q + d[1]) * q + d[2]) * q + d[3]) * q + 1);
    }
  };

  /* ── icons (inline SVG, currentColor) ────────────────────────────── */
  var ic = function (body, vb) { return '<svg class="i" viewBox="0 0 ' + (vb || 20) + ' ' + (vb || 20) + '" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">' + body + '</svg>'; };
  U.icon = {
    chevron: ic('<path d="M7 4l6 6-6 6"/>'),
    chevronDown: ic('<path d="M4 7l6 6 6-6"/>'),
    chevronUp: ic('<path d="M4 13l6-6 6 6"/>'),
    chevronLeft: ic('<path d="M13 4l-6 6 6 6"/>'),
    chevronsLeft: ic('<path d="M11 4l-6 6 6 6M16 4l-6 6 6 6"/>'),
    chevronsRight: ic('<path d="M9 4l6 6-6 6M4 4l6 6-6 6"/>'),
    plus: ic('<path d="M10 4v12M4 10h12"/>'),
    close: ic('<path d="M5 5l10 10M15 5L5 15"/>'),
    undo: ic('<path d="M4 8h9a4 4 0 0 1 0 8H8"/><path d="M7 5L4 8l3 3"/>'),
    redo: ic('<path d="M16 8H7a4 4 0 0 0 0 8h5"/><path d="M13 5l3 3-3 3"/>'),
    camera: ic('<rect x="3" y="6" width="14" height="10" rx="2"/><circle cx="10" cy="11" r="3"/><path d="M7 6l1-2h4l1 2"/>'),
    history: ic('<path d="M3 10a7 7 0 1 0 2-4.9"/><path d="M3 4v3h3"/><path d="M10 7v3l2 2"/>'),
    export: ic('<path d="M10 3v9"/><path d="M6 8l4 4 4-4"/><path d="M4 14v3h12v-3"/>'),
    search: ic('<circle cx="9" cy="9" r="5.5"/><path d="M13 13l4 4"/>'),
    more: ic('<circle cx="10" cy="4" r="1.3" fill="currentColor"/><circle cx="10" cy="10" r="1.3" fill="currentColor"/><circle cx="10" cy="16" r="1.3" fill="currentColor"/>'),
    moreH: ic('<circle cx="4" cy="10" r="1.3" fill="currentColor"/><circle cx="10" cy="10" r="1.3" fill="currentColor"/><circle cx="16" cy="10" r="1.3" fill="currentColor"/>'),
    menu: ic('<path d="M3 6h14M3 10h14M3 14h14"/>'),
    sliders: ic('<path d="M4 6h8M15 6h1M4 14h3M10 14h6"/><circle cx="13" cy="6" r="2"/><circle cx="8" cy="14" r="2"/>'),
    info: ic('<circle cx="10" cy="10" r="7"/><path d="M10 9v5M10 6.5v.5"/>'),
    warn: ic('<path d="M10 3l8 14H2z"/><path d="M10 8v4M10 14.5v.5"/>'),
    check: ic('<path d="M4 10l4 4 8-8"/>'),
    ok: ic('<circle cx="10" cy="10" r="7"/><path d="M6.8 10.2l2.2 2.2 4.2-4.6"/>'),
    build: ic('<path d="M4 5h6M4 10h12M4 15h9"/>'),
    shield: ic('<path d="M10 2.5l6 2.5v4.6c0 3.8-2.6 6.6-6 7.9-3.4-1.3-6-4.1-6-7.9V5l6-2.5z"/><path d="M7 10l2 2 4-4"/>'),
    reset: ic('<path d="M4 10a6 6 0 1 1 1.8 4.3"/><path d="M4 15v-4h4"/>'),
    sort: ic('<path d="M6 4v12M6 16l-2.5-2.5M6 16l2.5-2.5"/><path d="M14 16V4M14 4l-2.5 2.5M14 4l2.5 2.5"/>'),
    grip: ic('<circle cx="7" cy="5" r="1.2" fill="currentColor"/><circle cx="13" cy="5" r="1.2" fill="currentColor"/><circle cx="7" cy="10" r="1.2" fill="currentColor"/><circle cx="13" cy="10" r="1.2" fill="currentColor"/><circle cx="7" cy="15" r="1.2" fill="currentColor"/><circle cx="13" cy="15" r="1.2" fill="currentColor"/>'),
    table: ic('<rect x="3" y="4" width="14" height="12" rx="1.5"/><path d="M3 8.5h14M8 8.5V16"/>'),
    chart: ic('<path d="M3 16h14"/><path d="M4 12l4-4 3 3 5-6"/>'),
    pin: ic('<path d="M7 3h6l-1 5 3 3H5l3-3z"/><path d="M10 11v6"/>'),
    lock: ic('<rect x="5" y="9" width="10" height="8" rx="1.5"/><path d="M7 9V6.5a3 3 0 0 1 6 0V9"/>'),
    flask: ic('<path d="M8 3h4M9 3v5l-4.5 7.5A1.5 1.5 0 0 0 5.8 18h8.4a1.5 1.5 0 0 0 1.3-2.5L11 8V3"/>'),
    folder: ic('<path d="M3 6a1 1 0 0 1 1-1h4l2 2h6a1 1 0 0 1 1 1v8a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1z"/>'),
    layers: ic('<path d="M10 3l7 3.5-7 3.5-7-3.5z"/><path d="M3 10l7 3.5 7-3.5"/><path d="M3 13.5l7 3.5 7-3.5"/>'),
    arrowUp: ic('<path d="M10 16V4M5 9l5-5 5 5"/>'),
    arrowDown: ic('<path d="M10 4v12M5 11l5 5 5-5"/>'),
    copy: ic('<rect x="7" y="7" width="10" height="10" rx="1.5"/><path d="M13 7V4.5A1.5 1.5 0 0 0 11.5 3h-7A1.5 1.5 0 0 0 3 4.5v7A1.5 1.5 0 0 0 4.5 13H7"/>'),
    trash: ic('<path d="M4 6h12M8 6V4h4v2M6 6l1 11h6l1-11"/>'),
    eye: ic('<path d="M2 10s3-5 8-5 8 5 8 5-3 5-8 5-8-5-8-5z"/><circle cx="10" cy="10" r="2.5"/>'),
    eyeOff: ic('<path d="M3 3l14 14"/><path d="M8.5 5.3A8 8 0 0 1 10 5c5 0 8 5 8 5a13 13 0 0 1-2.6 3M6 6.6A12 12 0 0 0 2 10s3 5 8 5a7 7 0 0 0 2.7-.5"/>'),
    keyboard: ic('<rect x="2.5" y="6" width="15" height="9" rx="1.5"/><path d="M5.5 9h1M8.5 9h1M11.5 9h1M14.5 9h1M6 12h8"/>'),
    external: ic('<path d="M11 4h5v5"/><path d="M16 4l-7 7"/><path d="M14 11v4a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h4"/>')
  };

  /* ── tooltip (one element, positioned on demand) ─────────────────── */
  var tip, tipTarget;
  function tipShow(el) {
    var text = el.getAttribute('data-tip');
    if (!text) return;
    if (!tip) { tip = document.getElementById('tip'); }
    if (!tip) return;
    tipTarget = el;
    tip.innerHTML = text; /* authored content only — never user input */
    tip.classList.add('is-on');
    var r = el.getBoundingClientRect();
    tip.style.left = '0px'; tip.style.top = '0px';
    var tw = tip.offsetWidth, th = tip.offsetHeight;
    var left = U.clamp(r.left + r.width / 2 - tw / 2, 8, window.innerWidth - tw - 8);
    var top = r.top - th - 8;
    if (top < 8) top = r.bottom + 8;
    tip.style.left = left + 'px'; tip.style.top = top + 'px';
  }
  function tipHide() { if (tip) tip.classList.remove('is-on'); tipTarget = null; }
  U.initTooltips = function () {
    document.addEventListener('mouseover', function (e) { var t = e.target.closest && e.target.closest('[data-tip]'); if (t && t !== tipTarget) tipShow(t); });
    document.addEventListener('mouseout', function (e) { var t = e.target.closest && e.target.closest('[data-tip]'); if (t && (!e.relatedTarget || !t.contains(e.relatedTarget))) tipHide(); });
    document.addEventListener('focusin', function (e) { var t = e.target.closest && e.target.closest('[data-tip]'); if (t) tipShow(t); });
    document.addEventListener('focusout', tipHide);
    document.addEventListener('scroll', tipHide, true);
    document.addEventListener('keydown', function (e) { if (e.key === 'Escape') tipHide(); });
  };

  /* ── focus trap for dialogs and overlays ─────────────────────────── */
  var FOCUSABLE = 'a[href],button:not([disabled]),input:not([disabled]):not([type=hidden]),select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex="-1"])';
  U.focusables = function (root) { return U.$$(FOCUSABLE, root).filter(function (el) { return el.offsetParent !== null || el === document.activeElement; }); };
  U.trapFocus = function (root) {
    var handler = function (e) {
      if (e.key !== 'Tab') return;
      var f = U.focusables(root);
      if (!f.length) { e.preventDefault(); return; }
      var first = f[0], last = f[f.length - 1];
      if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
    };
    root.addEventListener('keydown', handler);
    return function () { root.removeEventListener('keydown', handler); };
  };

  /* ── download helper (export) ─────────────────────────────────────── */
  U.download = function (name, text, type) {
    var blob = new Blob([text], { type: type || 'text/plain' });
    var a = document.createElement('a');
    a.href = URL.createObjectURL(blob); a.download = name;
    document.body.appendChild(a); a.click();
    setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 0);
  };
  U.csvCell = function (v) { var s = String(v == null ? '' : v); return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s; };
})();

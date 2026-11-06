/* ─────────────────────────────────────────────────────────────────────────
   Portfolio Analytics · shared UI primitives
   toasts, dialogs (with focus trapping and focus return), popovers, confirm
   ───────────────────────────────────────────────────────────────────────── */
(function () {
  'use strict';
  var PA = window.PA, U = PA.util, esc = U.esc;
  var UI = PA.ui = PA.ui || {};

  /* ── toasts ──────────────────────────────────────────────────────── */
  UI.toast = function (msg, opts) {
    opts = opts || {};
    var root = document.getElementById('toasts'); if (!root) return;
    var el = U.html('<div class="toast' + (opts.kind === 'error' ? ' is-error' : '') + '" role="status"><span>' + esc(msg) + '</span>' +
      (opts.action ? '<button type="button" class="btn btn-sm">' + esc(opts.action.label) + '</button>' : '') + '</div>');
    if (opts.action) el.querySelector('button').onclick = function () { opts.action.fn(); el.remove(); };
    root.appendChild(el);
    var ttl = opts.ttl || (opts.action ? 9000 : 4200);
    setTimeout(function () { el.style.opacity = '0'; el.style.transition = 'opacity 250ms'; setTimeout(function () { el.remove(); }, 260); }, ttl);
    return el;
  };

  /* ── dialogs ─────────────────────────────────────────────────────── */
  var dialogStack = [];
  /**
   * Open a dialog. opts: {title, sub, body (html string), wide|xwide, actions:[{label, primary, danger, onClick(ctx), close:false}],
   *                       onOpen(dialogEl, ctx), onClose(), initialFocus (selector), labelledBy}
   * Returns ctx {el, close()}.
   */
  UI.openDialog = function (opts) {
    var root = document.getElementById('dialog-root');
    var id = U.uid('dlg');
    var wrap = U.html('<div class="dlg-wrap"><div class="scrim"></div>' +
      '<div class="dialog' + (opts.xwide ? ' is-xwide' : opts.wide ? ' is-wide' : '') + '" role="dialog" aria-modal="true" aria-labelledby="' + id + '-t">' +
      '<button type="button" class="dlg-close" aria-label="Close dialog">×</button>' +
      '<h2 id="' + id + '-t">' + esc(opts.title) + '</h2>' +
      (opts.sub ? '<p class="dlg-sub">' + opts.sub + '</p>' : '') +
      '<div class="dlg-body">' + (opts.body || '') + '</div>' +
      (opts.actions && opts.actions.length ? '<div class="dlg-actions">' + opts.actions.map(function (a, i) {
        return (a.spacer ? '<span class="spacer"></span>' : '') + '<button type="button" class="btn' + (a.primary ? ' btn-primary' : '') + (a.danger ? ' btn-danger' : '') + (a.ghost ? ' btn-ghost' : '') + '" data-action="' + i + '"' + (a.disabled ? ' disabled' : '') + '>' + esc(a.label) + '</button>';
      }).join('') + '</div>' : '') +
      '</div></div>');
    var dlg = wrap.querySelector('.dialog');
    var previous = document.activeElement;
    var untrap = U.trapFocus(dlg);
    var ctx = { el: dlg, close: function (result) {
      untrap(); wrap.remove();
      dialogStack = dialogStack.filter(function (d) { return d !== ctx; });
      document.removeEventListener('keydown', onKey);
      if (opts.onClose) opts.onClose(result);
      if (previous && previous.focus && document.contains(previous)) previous.focus();
    } };
    var onKey = function (e) { if (e.key === 'Escape' && dialogStack[dialogStack.length - 1] === ctx) { e.stopPropagation(); ctx.close(); } };
    document.addEventListener('keydown', onKey);
    wrap.querySelector('.dlg-close').onclick = function () { ctx.close(); };
    wrap.querySelector('.scrim').onclick = function () { if (!opts.modal) ctx.close(); };
    U.$$('[data-action]', dlg).forEach(function (b) {
      b.onclick = function () {
        var a = opts.actions[Number(b.dataset.action)];
        var r = a.onClick ? a.onClick(ctx) : undefined;
        if (r === false) return;
        if (a.close !== false) ctx.close(r);
      };
    });
    root.appendChild(wrap);
    dialogStack.push(ctx);
    if (opts.onOpen) opts.onOpen(dlg, ctx);
    var f = opts.initialFocus ? dlg.querySelector(opts.initialFocus) : null;
    if (!f) { var fs = U.focusables(dlg).filter(function (el) { return !el.classList.contains('dlg-close'); }); f = fs[0]; }
    (f || dlg.querySelector('.dlg-close')).focus();
    return ctx;
  };
  UI.confirm = function (opts) {
    return new Promise(function (resolve) {
      UI.openDialog({ title: opts.title, sub: opts.sub, body: opts.body || '', onClose: function (r) { resolve(!!r); },
        actions: [{ label: 'Cancel', ghost: true, onClick: function () { return false; } }, { label: opts.confirmLabel || 'Confirm', primary: !opts.danger, danger: !!opts.danger, onClick: function () { return true; } }],
        initialFocus: opts.danger ? '[data-action="0"]' : '[data-action="1"]' });
    });
  };
  UI.prompt = function (opts) {
    return new Promise(function (resolve) {
      var ctx = UI.openDialog({ title: opts.title, sub: opts.sub,
        body: '<div class="field"><label for="prompt-in">' + esc(opts.label || 'Name') + '</label><input id="prompt-in" type="text" value="' + esc(opts.value || '') + '" maxlength="80"><span class="field-err" id="prompt-err"></span></div>',
        actions: [{ label: 'Cancel', ghost: true, onClick: function () { return false; } }, { label: opts.confirmLabel || 'Save', primary: true, onClick: function (c) {
          var v = c.el.querySelector('#prompt-in').value.trim();
          if (!v) { c.el.querySelector('#prompt-err').textContent = 'Enter a name.'; c.el.querySelector('#prompt-in').setAttribute('aria-invalid', 'true'); return false; }
          return v;
        } }],
        onClose: function (r) { resolve(r || null); }, initialFocus: '#prompt-in' });
      ctx.el.querySelector('#prompt-in').addEventListener('keydown', function (e) { if (e.key === 'Enter') { e.preventDefault(); ctx.el.querySelector('[data-action="1"]').click(); } });
    });
  };

  /* ── popovers (menus) ────────────────────────────────────────────── */
  var popOpen = null;
  UI.closePopover = function () { if (popOpen) { popOpen.cleanup(); popOpen = null; } };
  /** Open a popover anchored to an element. opts: {html, onOpen(el), align:'start'|'end', cls} */
  UI.popover = function (anchor, opts) {
    UI.closePopover();
    var root = document.getElementById('pop-root');
    var el = U.html('<div class="pop' + (opts.cls ? ' ' + opts.cls : '') + '" role="' + (opts.role || 'menu') + '">' + opts.html + '</div>');
    root.appendChild(el);
    var r = anchor.getBoundingClientRect();
    var w = el.offsetWidth, h = el.offsetHeight;
    var left = opts.align === 'end' ? r.right - w : r.left;
    left = U.clamp(left, 8, window.innerWidth - w - 8);
    var top = r.bottom + 6;
    if (top + h > window.innerHeight - 8) top = Math.max(8, r.top - h - 6);
    el.style.left = left + 'px'; el.style.top = top + 'px';
    anchor.setAttribute('aria-expanded', 'true');
    var onDoc = function (e) { if (!el.contains(e.target) && e.target !== anchor && !anchor.contains(e.target)) UI.closePopover(); };
    var onKey = function (e) {
      if (e.key === 'Escape') { UI.closePopover(); anchor.focus(); return; }
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        var items = U.focusables(el); if (!items.length) return;
        var i = items.indexOf(document.activeElement);
        e.preventDefault();
        items[(i + (e.key === 'ArrowDown' ? 1 : -1) + items.length) % items.length].focus();
      }
    };
    setTimeout(function () { document.addEventListener('mousedown', onDoc); document.addEventListener('keydown', onKey); }, 0);
    popOpen = { el: el, cleanup: function () { el.remove(); document.removeEventListener('mousedown', onDoc); document.removeEventListener('keydown', onKey); anchor.setAttribute('aria-expanded', 'false'); } };
    if (opts.onOpen) opts.onOpen(el, UI.closePopover);
    var first = U.focusables(el)[0]; if (first && opts.focus !== false) first.focus();
    return el;
  };
  UI.menu = function (anchor, items, opts) {
    var html = items.map(function (it) {
      if (it.sep) return '<div class="menu-sep"></div>';
      if (it.head) return '<div class="menu-head">' + esc(it.head) + '</div>';
      return '<button type="button" class="menu-item" role="menuitem" data-i="' + items.indexOf(it) + '"' + (it.disabled ? ' aria-disabled="true"' : '') + '>' + (it.icon || '') + '<span>' + esc(it.label) + '</span>' + (it.kbd ? '<kbd>' + esc(it.kbd) + '</kbd>' : '') + '</button>';
    }).join('');
    return UI.popover(anchor, { html: html, align: opts && opts.align, cls: opts && opts.cls, onOpen: function (el, close) {
      U.on(el, 'click', '.menu-item', function (e, b) { var it = items[Number(b.dataset.i)]; if (it.disabled) return; close(); if (it.onClick) it.onClick(); });
    } });
  };

  /* ── common markup helpers ───────────────────────────────────────── */
  UI.STANDALONE_INK = '#1B2430';
  /* a derived chain level wears its parent's colour, lighter for each level further from the portfolio */
  UI.LEVEL_TINT = { productBenchmarks: 62, saa: 40 };
  UI.colorOf = function (alloc) { if (alloc && alloc.kind === 'standalone') return UI.STANDALONE_INK; var base = 'var(--' + (alloc && alloc.color ? alloc.color : 'cat-1') + ')'; if (alloc && alloc.kind === 'level') return 'color-mix(in srgb, ' + base + ' ' + (UI.LEVEL_TINT[alloc.level.id] || 50) + '%, #ffffff)'; return base; };
  /** A tag for the exceptional kinds (snapshot, benchmark, sleeve); live allocations carry none. */
  UI.kindTag = function (alloc) {
    if (!alloc) return '';
    if (alloc.kind === 'snapshot') return '<span class="tag tag-info" data-tip="Fixed snapshot captured ' + esc(U.fmt.dateTime(alloc.capturedAt)) + '. Weights are frozen.">Snapshot</span>';
    if (alloc.kind === 'benchmark') return '<span class="tag">Benchmark</span>';
    if (alloc.kind === 'standalone') return '<span class="tag tag-temp" data-tip="Temporary: the selected category of ' + esc(PA.store.allocation(alloc.standalone.allocationId).name) + ' on its own, its ' + U.fmt.num(alloc.standalone.weight, 2) + '% rescaled to 100%. Shown while the category stays selected in the rail.">Category · 100%</span>';
    if (alloc.kind === 'level') { var par = PA.store.allocation(alloc.level.parentId); return '<span class="tag tag-temp" data-tip="Temporary: ' + esc(alloc.level.label || alloc.level.short) + ', the ' + esc(alloc.level.short) + ' level of ' + esc(par ? par.name : 'its allocation') + '’s decision chain' + (alloc.level.derived ? ', derived from its category weights' : '') + '. Resolved from the chain on every change; shown while levels are on.">Level · ' + esc(alloc.level.short) + '</span>'; }
    if (alloc.kind === 'sleeve') return '<span class="tag tag-sleeve" data-tip="Sleeve “' + esc(alloc.sleeve.name) + '” v' + alloc.sleeve.version + ' from the repository, fully invested at its weights. Read-only.">Sleeve v' + alloc.sleeve.version + '</span>';
    return ''; /* live is the default kind: no tag */
  };
  UI.alert = function (kind, html, action) {
    return '<div class="alert alert-' + kind + '" role="' + (kind === 'error' ? 'alert' : 'status') + '">' + (kind === 'error' ? U.icon.warn : U.icon.info) + '<div>' + html + '</div>' + (action ? '<button type="button" class="btn btn-sm" data-alert-action>' + esc(action) + '</button>' : '') + '</div>';
  };
})();

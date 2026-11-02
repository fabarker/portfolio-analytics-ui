/* ─────────────────────────────────────────────────────────────────────────
   Portfolio Analytics · boot
   Wires the modules together once the DOM exists. To run against a live
   service, change the adapter here (or set it before this script runs):
     PA.api.configure({ adapter: 'http', baseUrl: '/api/v1' });
   ───────────────────────────────────────────────────────────────────────── */
(function () {
  'use strict';
  var PA = window.PA, U = PA.util, S = PA.store, UI = PA.ui;

  function boot() {
    if (window.PA_CONFIG) PA.api.configure(window.PA_CONFIG);
    U.initTooltips();
    UI.context.init();
    PA.cards.init();
    UI.builder.init();
    UI.drawer.init();
    UI.shell.init();

    /* leaving the page with a save pending: flush it */
    window.addEventListener('beforeunload', function () { if (S.ws && S.session.save.state === 'pending') S.saveNow(); });
    /* narrow screens: closing the off-canvas builder with Escape */
    document.addEventListener('keydown', function (e) { if (e.key === 'Escape' && S.session.railOpen && !document.querySelector('.dialog')) S.setSession('railOpen', false); });
    window.addEventListener('resize', U.debounce(function () { if (S.ws && S.session.drawerOpen) UI.drawer.render(); }, 200));
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot); else boot();
})();

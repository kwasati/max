/* ==========================================================
   MAX MAHON v6 — Device Detection + Path Redirect
   Runs once on DOMContentLoaded. Never redirects again during
   the session (prevents loops if user resizes).
   Server serves the same shell for "/" (desktop) and "/m" (mobile).
   ========================================================== */
(function () {
  'use strict';

  /** @returns {boolean} true if touch device OR narrow viewport (<768px). */
  function isMobile() {
    try {
      if (window.matchMedia && window.matchMedia('(pointer: coarse)').matches) return true;
    } catch (_) { /* ignore */ }
    return window.innerWidth < 768;
  }

  /**
   * Redirect to the appropriate shell if the current path does not
   * match the device. Guaranteed to run at most once per page load.
   */
  function redirectIfMismatch() {
    var path = location.pathname || '/';
    var onMobilePath = (path === '/m' || path.indexOf('/m/') === 0 || path === '/mobile' || path.indexOf('/mobile/') === 0);
    if (isMobile() && !onMobilePath) {
      var tail = path === '/' ? '' : path;
      location.replace('/m' + tail + (location.search || ''));
    } else if (!isMobile() && onMobilePath) {
      var stripped;
      if (path === '/m' || path === '/mobile') {
        stripped = '/';
      } else if (path.indexOf('/m/') === 0) {
        stripped = path.slice(2) || '/';
      } else {
        stripped = path.slice(7) || '/';
      }
      location.replace(stripped + (location.search || ''));
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', redirectIfMismatch);
  } else {
    // document already parsed — run next tick
    setTimeout(redirectIfMismatch, 0);
  }

  window.MMDevice = {
    isMobile: isMobile,
    redirectIfMismatch: redirectIfMismatch
  };
})();

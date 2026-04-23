/* ==========================================================
   MAX MAHON v6 — Shared UI Components
   Vanilla JS, no frameworks. All styling comes from
   shared/tokens.css + shared/base.css + shared/mobile.css.
   Exposes window.MMComponents (10 functions).
   ========================================================== */
(function () {
  'use strict';

  /**
   * Render the newspaper masthead (sticky top).
   * @param {{vol:string, no:string, date:string, next_scan:string, edition?:string, active?:string}} ctx
   * @returns {string} HTML string for <header class="masthead">…</header>
   */
  function renderMasthead(ctx) {
    var edition = ctx.edition || 'Thai Stock Edition';
    var active = ctx.active || 'home';
    var nav = renderMastNav(active);
    return (
      '<header class="masthead">' +
        '<div class="mast-top">' +
          '<div class="mast-meta-l">' +
            '<div>VOL. ' + ctx.vol + ' &middot; NO. ' + ctx.no + '</div>' +
            '<div><strong>' + ctx.date + '</strong></div>' +
          '</div>' +
          '<div class="mast-title">' +
            '<h1 class="mast-brand">Max Mahon</h1>' +
            '<div class="mast-sub">&middot; The Dividend Review &middot;</div>' +
          '</div>' +
          '<div class="mast-meta-r">' +
            '<div>' + edition.toUpperCase() + '</div>' +
            '<div>AUTO &middot; NEXT SCAN <strong>' + ctx.next_scan + '</strong></div>' +
          '</div>' +
        '</div>' +
        '<div class="mast-bottom">' + nav + '</div>' +
      '</header>'
    );
  }

  /**
   * Top horizontal navigation strip (desktop). Routes map to
   * SPA-style paths; currently emit anchors so browsers follow
   * history back/forward.
   * @param {string} active — one of: home, report, watchlist, portfolio, portfolio-builder, simulator, settings
   * @returns {string} HTML for <nav class="mast-nav">
   */
  function renderMastNav(active) {
    var items = [
      ['home',              '/',                  'Watchlist'],
      ['watchlist',         '/watchlist',         'Saved'],
      ['portfolio',         '/portfolio',         'Portfolio'],
      ['portfolio-builder', '/portfolio-builder', 'จัดพอร์ต'],
      ['simulator',         '/simulator',         'Simulator'],
      ['settings',          '/settings',          'Settings']
    ];
    var html = '<nav class="mast-nav">';
    for (var i = 0; i < items.length; i++) {
      var key = items[i][0];
      var href = items[i][1];
      var label = items[i][2];
      html += '<a href="' + href + '"' + (key === active ? ' class="active"' : '') + '>' + label + '</a>';
    }
    html += '</nav>';
    return html;
  }

  /**
   * Mobile sticky bottom nav — 5 touch targets, text labels
   * (no emoji / flat icons per brand rule).
   * @param {string} active — one of: home, saved, portfolio, builder, simulator, settings
   * @returns {string} HTML for <nav class="mobile-nav">
   */
  function renderMobileNav(active) {
    var items = [
      ['home',      '/m',                   '01', 'List'],
      ['saved',     '/m/watchlist',         '02', 'Saved'],
      ['portfolio', '/m/portfolio',         '04', 'Port'],
      ['builder',   '/m/portfolio-builder', '05', 'Build'],
      ['simulator', '/m/simulator',         '06', 'Sim'],
      ['settings',  '/m/settings',          '07', 'Set']
    ];
    var html = '<nav class="mobile-nav">';
    for (var i = 0; i < items.length; i++) {
      var key = items[i][0];
      var href = items[i][1];
      var num = items[i][2];
      var label = items[i][3];
      html += '<a href="' + href + '"' + (key === active ? ' class="active"' : '') + '>' +
                '<span class="num">' + num + '</span>' + label +
              '</a>';
    }
    html += '</nav>';
    return html;
  }

  /**
   * Section number banner (double-rule top + single-rule bottom).
   * @param {number|string} num — 1..N
   * @param {string} label — section title text (e.g. "Watchlist")
   * @param {string} [aside] — right-side meta (e.g. "54 names")
   * @returns {string} HTML
   */
  function renderSectionNum(num, label, aside) {
    var padded = String(num).padStart ? String(num).padStart(2, '0')
                                      : ('0' + num).slice(-2);
    var right = aside ? '<span>' + aside + '</span>' : '<span></span>';
    return (
      '<div class="section-num">' +
        '<span class="no">' + padded + (label ? ' &middot; ' + label : '') + '</span>' +
        right +
      '</div>'
    );
  }

  /**
   * Editorial pull-quote block.
   * @param {string} text
   * @param {string} [attribution]
   * @returns {string} HTML
   */
  function renderPullQuote(text, attribution) {
    var cite = attribution ? '<cite style="display:block;margin-top:0.6em;font-style:normal;font-size:0.8em;color:var(--ink-dim);text-align:right">&mdash; ' + attribution + '</cite>' : '';
    return '<blockquote class="pull-quote">' + text + cite + '</blockquote>';
  }

  /**
   * Wrap a paragraph in the drop-cap style (first letter enlarged).
   * @param {string} paragraph — plain text, not HTML
   * @returns {string} HTML
   */
  function renderDropCap(paragraph) {
    return '<p class="drop-cap">' + paragraph + '</p>';
  }

  /**
   * Severity badge for exit signals — HOLD / REVIEW / CONSIDER_EXIT.
   * Visual hierarchy via weight + rules, not color (except oxblood on exit).
   * @param {"HOLD"|"REVIEW"|"CONSIDER_EXIT"} severity
   * @returns {string} HTML <span class="sev …">
   */
  function renderSevBadge(severity) {
    var map = {
      HOLD: { cls: 'sev hold',   label: 'Hold' },
      REVIEW: { cls: 'sev review', label: 'Review' },
      CONSIDER_EXIT: { cls: 'sev exit', label: 'Consider Exit' }
    };
    var info = map[severity];
    if (!info) return '<span class="sev">' + severity + '</span>';
    return '<span class="' + info.cls + '">' + info.label + '</span>';
  }

  // -------- MODAL ---------------------------------------------------------

  var _modalEl = null;
  var _modalEscHandler = null;

  function _ensureModalHost() {
    if (_modalEl && document.body.contains(_modalEl)) return _modalEl;
    _modalEl = document.createElement('div');
    _modalEl.className = 'modal-backdrop';
    _modalEl.setAttribute('role', 'dialog');
    _modalEl.setAttribute('aria-modal', 'true');
    document.body.appendChild(_modalEl);
    _modalEl.addEventListener('click', function (e) {
      if (e.target === _modalEl) closeModal();
    });
    return _modalEl;
  }

  /**
   * Open a modal with the supplied inner HTML.
   * Desktop: centered sheet. Mobile (<=900px): bottom-sheet slide-up
   * (styles in base.css @media).
   * Click backdrop or press Escape to close.
   * @param {string} contentHtml — body HTML to render inside .modal-sheet
   * @param {{kicker?:string, headline?:string, dek?:string}} [opts]
   */
  function openModal(contentHtml, opts) {
    opts = opts || {};
    var host = _ensureModalHost();
    var kicker = opts.kicker
      ? '<div class="modal-kicker"><span>' + opts.kicker + '</span></div>'
      : '';
    var headline = opts.headline
      ? '<h2 class="modal-headline">' + opts.headline + '</h2>'
      : '';
    var dek = opts.dek ? '<p class="modal-dek">' + opts.dek + '</p>' : '';
    host.innerHTML =
      '<div class="modal-sheet" role="document">' +
        '<button class="modal-close" type="button" aria-label="Close">&times;</button>' +
        kicker + headline + dek +
        '<div class="modal-body">' + contentHtml + '</div>' +
      '</div>';
    host.classList.add('open');
    var closeBtn = host.querySelector('.modal-close');
    if (closeBtn) closeBtn.addEventListener('click', closeModal);
    if (_modalEscHandler) document.removeEventListener('keydown', _modalEscHandler);
    _modalEscHandler = function (e) { if (e.key === 'Escape') closeModal(); };
    document.addEventListener('keydown', _modalEscHandler);
  }

  /** Close the currently open modal (if any). */
  function closeModal() {
    if (!_modalEl) return;
    _modalEl.classList.remove('open');
    _modalEl.innerHTML = '';
    if (_modalEscHandler) {
      document.removeEventListener('keydown', _modalEscHandler);
      _modalEscHandler = null;
    }
  }

  // -------- TOAST ---------------------------------------------------------

  var _toastHost = null;
  function _ensureToastHost() {
    if (_toastHost && document.body.contains(_toastHost)) return _toastHost;
    _toastHost = document.createElement('div');
    _toastHost.className = 'mm-toast-host';
    _toastHost.style.cssText =
      'position:fixed;top:16px;right:16px;z-index:100;display:flex;' +
      'flex-direction:column;gap:8px;pointer-events:none;max-width:360px;';
    document.body.appendChild(_toastHost);
    return _toastHost;
  }

  /**
   * Transient toast notification — fades out after 3s.
   * @param {string} message
   * @param {"info"|"warn"|"error"} [variant]
   */
  function showToast(message, variant) {
    variant = variant || 'info';
    var host = _ensureToastHost();
    var el = document.createElement('div');
    var borderColor = variant === 'error' || variant === 'warn'
      ? 'var(--accent)' : 'var(--rule)';
    el.style.cssText =
      'background:var(--paper);border:1px solid ' + borderColor + ';' +
      'border-left:3px solid ' + borderColor + ';' +
      'padding:10px 14px;font-family:var(--font-body);font-size:var(--fs-sm);' +
      'color:var(--ink);box-shadow:none;opacity:0;transition:opacity 180ms ease;' +
      'pointer-events:auto;';
    el.textContent = message;
    host.appendChild(el);
    requestAnimationFrame(function () { el.style.opacity = '1'; });
    setTimeout(function () {
      el.style.opacity = '0';
      setTimeout(function () { if (el.parentNode) el.parentNode.removeChild(el); }, 220);
    }, 3000);
  }

  /**
   * Render a vintage newspaper loading state into a container.
   * @param {HTMLElement} container
   * @param {string} [message]
   */
  function renderLoading(container, message) {
    if (!container) return;
    container.innerHTML =
      '<div class="mm-loading" style="padding:var(--sp-6) 0;text-align:center;' +
      'font-family:var(--font-head);font-style:italic;color:var(--ink-dim);' +
      'font-size:var(--fs-md);letter-spacing:0.04em">' +
        (message || 'Loading') + ' &hellip;' +
      '</div>';
  }

  /**
   * Render an error state with an optional retry button.
   * @param {HTMLElement} container
   * @param {string} message
   * @param {Function} [retryFn]
   */
  function renderError(container, message, retryFn) {
    if (!container) return;
    var retry = retryFn
      ? '<button class="btn ghost" type="button" data-mm-retry style="margin-top:var(--sp-4)">Retry</button>'
      : '';
    container.innerHTML =
      '<div class="mm-error" style="padding:var(--sp-6) 0;text-align:center;' +
      'font-family:var(--font-body);color:var(--ink-soft)">' +
        '<div class="micro" style="margin-bottom:var(--sp-3);color:var(--accent)">Error</div>' +
        '<div style="font-family:var(--font-head);font-style:italic;font-size:var(--fs-md);max-width:48ch;margin:0 auto">' +
          message +
        '</div>' +
        retry +
      '</div>';
    if (retryFn) {
      var btn = container.querySelector('[data-mm-retry]');
      if (btn) btn.addEventListener('click', retryFn);
    }
  }

  window.MMComponents = {
    renderMasthead: renderMasthead,
    renderMastNav: renderMastNav,
    renderMobileNav: renderMobileNav,
    renderSectionNum: renderSectionNum,
    renderPullQuote: renderPullQuote,
    renderDropCap: renderDropCap,
    renderSevBadge: renderSevBadge,
    openModal: openModal,
    closeModal: closeModal,
    showToast: showToast,
    renderLoading: renderLoading,
    renderError: renderError
  };
})();

/* ==========================================================
   MAX MAHON v6 — API Client
   Fetch wrapper with Bearer auth, JSON serialization, retry,
   and a one-time token prompt modal on 401.
   Exposes window.MMApi (get / post / put / delete / apiFetch).
   ========================================================== */
(function () {
  'use strict';

  var BASE = window.location.origin;
  var TOKEN_KEY = 'MAX_TOKEN';
  var _tokenPromptInFlight = null; // Promise guarding concurrent prompts

  function _readToken() {
    try { return localStorage.getItem(TOKEN_KEY) || ''; }
    catch (_) { return ''; }
  }

  function _writeToken(tok) {
    try { localStorage.setItem(TOKEN_KEY, tok); } catch (_) { /* ignore */ }
  }

  /**
   * Custom error thrown for HTTP failures and network errors.
   * Carries status (0 for network), response body, and request path.
   */
  function ApiError(status, body, path) {
    var msg = 'API ' + status + ' ' + (path || '');
    var e = new Error(msg);
    e.name = 'ApiError';
    e.status = status;
    e.body = body;
    e.path = path;
    return e;
  }

  function _promptForToken(reason) {
    if (_tokenPromptInFlight) return _tokenPromptInFlight;
    _tokenPromptInFlight = new Promise(function (resolve) {
      var html =
        '<p style="font-family:var(--font-body);color:var(--ink-soft);margin-bottom:var(--sp-4)">' +
          (reason || 'Enter your Max Mahon access token to continue.') +
        '</p>' +
        '<input type="password" id="mm-token-input" ' +
          'style="width:100%;padding:10px 12px;border:1px solid var(--rule);' +
          'background:var(--paper-3);font-family:var(--font-mono);font-size:var(--fs-sm);' +
          'color:var(--ink);outline:none;margin-bottom:var(--sp-4)" ' +
          'placeholder="MAX_TOKEN" autocomplete="off" />' +
        '<div style="display:flex;justify-content:flex-end;gap:var(--sp-3)">' +
          '<button type="button" class="btn ghost" id="mm-token-cancel">Cancel</button>' +
          '<button type="button" class="btn primary" id="mm-token-save">Save &amp; Retry</button>' +
        '</div>';
      if (!window.MMComponents || !window.MMComponents.openModal) {
        // components.js not loaded — fall back to prompt()
        var v = window.prompt(reason || 'MAX_TOKEN:');
        if (v) _writeToken(v);
        _tokenPromptInFlight = null;
        resolve(!!v);
        return;
      }
      window.MMComponents.openModal(html, {
        kicker: 'Authentication',
        headline: 'Access Required',
        dek: 'Your token is stored locally and sent as a Bearer header.'
      });
      var input = document.getElementById('mm-token-input');
      var save = document.getElementById('mm-token-save');
      var cancel = document.getElementById('mm-token-cancel');
      function finish(ok) {
        window.MMComponents.closeModal();
        _tokenPromptInFlight = null;
        resolve(ok);
      }
      if (input) {
        input.focus();
        input.addEventListener('keydown', function (e) {
          if (e.key === 'Enter') { e.preventDefault(); save.click(); }
        });
      }
      if (save) save.addEventListener('click', function () {
        var v = input && input.value ? input.value.trim() : '';
        if (!v) { if (input) input.focus(); return; }
        _writeToken(v);
        finish(true);
      });
      if (cancel) cancel.addEventListener('click', function () { finish(false); });
    });
    return _tokenPromptInFlight;
  }

  /**
   * Perform a fetch against the API.
   * - Serializes body as JSON, sets Authorization: Bearer MAX_TOKEN.
   * - Retries up to `retry` times on 5xx or network errors with
   *   exponential backoff (500ms, 1000ms, 2000ms).
   * - On 401: opens the token prompt modal, retries once after a
   *   successful save (cancel → throws ApiError).
   * @param {string} path — e.g. "/api/watchlist"
   * @param {{method?:string, body?:any, retry?:number, _authRetried?:boolean}} [opts]
   * @returns {Promise<any>} parsed JSON body
   * @throws {ApiError}
   */
  async function apiFetch(path, opts) {
    opts = opts || {};
    var method = (opts.method || 'GET').toUpperCase();
    var body = opts.body === undefined ? null : opts.body;
    var retry = typeof opts.retry === 'number' ? opts.retry : 3;
    var token = _readToken();
    var headers = { 'Accept': 'application/json' };
    if (body !== null) headers['Content-Type'] = 'application/json';
    if (token) headers['Authorization'] = 'Bearer ' + token;
    var init = { method: method, headers: headers };
    if (body !== null) init.body = JSON.stringify(body);

    var lastErr = null;
    for (var attempt = 0; attempt < retry; attempt++) {
      try {
        var r = await fetch(BASE + path, init);
        if (r.status === 401) {
          if (!opts._authRetried) {
            var ok = await _promptForToken('Authentication required. Paste your MAX_TOKEN to continue.');
            if (ok) {
              return apiFetch(path, Object.assign({}, opts, { _authRetried: true, retry: retry }));
            }
          }
          var bodyTxt401 = await _safeText(r);
          throw ApiError(401, bodyTxt401, path);
        }
        if (!r.ok) {
          var bodyTxt = await _safeText(r);
          if (r.status >= 500 && attempt < retry - 1) {
            lastErr = ApiError(r.status, bodyTxt, path);
            await _sleep(500 * Math.pow(2, attempt));
            continue;
          }
          throw ApiError(r.status, bodyTxt, path);
        }
        // empty body = null
        if (r.status === 204) return null;
        var ctype = r.headers.get('content-type') || '';
        if (ctype.indexOf('application/json') !== -1) return await r.json();
        return await r.text();
      } catch (e) {
        if (e && e.name === 'ApiError') {
          // 4xx (non-401) should not retry; 401 is handled above
          if (e.status && e.status < 500) throw e;
          lastErr = e;
        } else {
          // network error / abort — retry with backoff
          lastErr = ApiError(0, String(e && e.message || e), path);
        }
        if (attempt < retry - 1) {
          await _sleep(500 * Math.pow(2, attempt));
          continue;
        }
      }
    }
    throw lastErr || ApiError(0, 'Unknown error', path);
  }

  async function _safeText(r) {
    try { return await r.text(); } catch (_) { return ''; }
  }

  function _sleep(ms) {
    return new Promise(function (res) { setTimeout(res, ms); });
  }

  window.MMApi = {
    apiFetch: apiFetch,
    get: function (path) { return apiFetch(path); },
    post: function (path, body) { return apiFetch(path, { method: 'POST', body: body }); },
    put: function (path, body) { return apiFetch(path, { method: 'PUT', body: body }); },
    delete: function (path) { return apiFetch(path, { method: 'DELETE' }); },
    // expose for tests / settings page
    _setToken: function (t) { _writeToken(t); },
    _getToken: _readToken,
    ApiError: ApiError
  };
})();

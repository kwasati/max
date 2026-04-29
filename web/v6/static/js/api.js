/* ==========================================================
   MAX MAHON v6 — API Client (Plan 03 — Supabase JWT)
   Fetch wrapper with Bearer auth (Supabase access token),
   JSON serialization, retry on 5xx/network. Redirects to
   /login or /m/login if no session.
   Exposes window.MMApi (get / post / put / delete / apiFetch).
   ========================================================== */
(function () {
  'use strict';

  var BASE = window.location.origin;

  function ApiError(status, body, path) {
    var msg = 'API ' + status + ' ' + (path || '');
    var e = new Error(msg);
    e.name = 'ApiError';
    e.status = status;
    e.body = body;
    e.path = path;
    return e;
  }

  function _loginPath() {
    return location.pathname.indexOf('/m') === 0 ? '/m/login' : '/login';
  }

  async function _getToken() {
    if (!window.MMSupabase) return null;
    return window.MMSupabase.getAccessToken();
  }

  async function apiFetch(path, opts) {
    opts = opts || {};
    var method = (opts.method || 'GET').toUpperCase();
    var body = opts.body === undefined ? null : opts.body;
    var retry = typeof opts.retry === 'number' ? opts.retry : 3;

    var token = await _getToken();
    if (!token) {
      // Not signed in — bounce to login and abort
      location.href = _loginPath();
      throw ApiError(401, 'No session', path);
    }

    var headers = { 'Accept': 'application/json', 'Authorization': 'Bearer ' + token };
    if (body !== null) headers['Content-Type'] = 'application/json';
    var init = { method: method, headers: headers };
    if (body !== null) init.body = JSON.stringify(body);

    var lastErr = null;
    for (var attempt = 0; attempt < retry; attempt++) {
      try {
        var r = await fetch(BASE + path, init);
        if (r.status === 401) {
          // Session expired or invalid — sign out + redirect login
          if (window.MMSupabase) await window.MMSupabase.signOut();
          else location.href = _loginPath();
          throw ApiError(401, await _safeText(r), path);
        }
        if (r.status === 403) {
          // Forbidden (e.g. viewer hits admin endpoint, or non-whitelisted email)
          throw ApiError(403, await _safeText(r), path);
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
        if (r.status === 204) return null;
        var ctype = r.headers.get('content-type') || '';
        if (ctype.indexOf('application/json') !== -1) return await r.json();
        return await r.text();
      } catch (e) {
        if (e && e.name === 'ApiError') {
          if (e.status && e.status < 500) throw e;
          lastErr = e;
        } else {
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
    ApiError: ApiError
  };
})();

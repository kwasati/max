/* ==========================================================
   MAX MAHON v6 — Supabase JS client wrapper
   Plan 03 user-login. Verifies session via Supabase auth,
   exposes window.MMSupabase.
   ANON_KEY is intentionally public — Supabase RLS + backend
   email whitelist protect data.
   ========================================================== */
(function () {
  'use strict';

  var SUPABASE_URL = 'https://zmscqylztzvzeyxwamzp.supabase.co';
  var SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inptc2NxeWx6dHp2emV5eHdhbXpwIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzE5MDAyMTIsImV4cCI6MjA4NzQ3NjIxMn0.UA0mpxYVJIF2H3Dd6mEsnMt-N6sYSbztyRGJ0XtJgh4';

  if (!window.supabase || !window.supabase.createClient) {
    console.error('Supabase JS client failed to load from CDN');
    return;
  }

  var client = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    auth: {
      autoRefreshToken: true,
      persistSession: true,
      detectSessionInUrl: true
    }
  });

  function _loginPath() {
    return location.pathname.indexOf('/m') === 0 ? '/m/login' : '/login';
  }

  window.MMSupabase = {
    client: client,
    SUPABASE_URL: SUPABASE_URL,

    getAccessToken: async function () {
      var r = await client.auth.getSession();
      return r && r.data && r.data.session ? r.data.session.access_token : null;
    },

    getSession: async function () {
      var r = await client.auth.getSession();
      return r && r.data ? r.data.session : null;
    },

    signInGoogle: async function (redirectTo) {
      return client.auth.signInWithOAuth({
        provider: 'google',
        options: { redirectTo: redirectTo || (location.origin + (location.pathname.indexOf('/m') === 0 ? '/m' : '/')) }
      });
    },

    signOut: async function () {
      try { await client.auth.signOut(); } catch (_) { /* ignore */ }
      location.href = _loginPath();
    }
  };
})();

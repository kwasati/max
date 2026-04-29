/**
 * Supabase client wrapper — exposes window.MMSupabase singleton.
 *
 * Loaded after the Supabase UMD bundle from CDN (window.supabase) and before api.js.
 * The anon key below is public-safe (Supabase explicitly publishes anon keys for
 * client embedding; row-level-security and server-side JWT verification protect data).
 */
(function () {
  'use strict';

  var SUPABASE_URL = 'https://zmscqylztzvzeyxwamzp.supabase.co';
  // Public-safe anon key (matches root .env SUPABASE_HUB_ANON_KEY)
  var SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inptc2NxeWx6dHp2emV5eHdhbXpwIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzE5MDAyMTIsImV4cCI6MjA4NzQ3NjIxMn0.UA0mpxYVJIF2H3Dd6mEsnMt-N6sYSbztyRGJ0XtJgh4';

  if (!window.supabase || !window.supabase.createClient) {
    console.error('[MMSupabase] supabase-js UMD bundle not loaded');
    return;
  }

  var client = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    auth: {
      autoRefreshToken: true,
      persistSession: true,
      detectSessionInUrl: true
    }
  });

  async function getAccessToken() {
    var { data } = await client.auth.getSession();
    return (data && data.session && data.session.access_token) || null;
  }

  async function signInGoogle(redirectTo) {
    var origin = window.location.origin;
    var to = redirectTo || '/';
    return client.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: origin + to }
    });
  }

  async function signOut() {
    await client.auth.signOut();
    var path = window.location.pathname;
    window.location.href = path.indexOf('/m') === 0 ? '/m/login' : '/login';
  }

  window.MMSupabase = {
    client: client,
    getAccessToken: getAccessToken,
    signInGoogle: signInGoogle,
    signOut: signOut
  };
})();

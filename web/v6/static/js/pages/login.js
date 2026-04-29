/* ==========================================================
   MAX MAHON v6 — Login (Desktop)
   Plan 03 user-login. Renders mockup scene 01 — Google sign-in card.
   ========================================================== */

export async function mount(container) {
  if (!container) return;
  _ensureStyles();

  // If already signed in + whitelisted → bounce to home
  try {
    var token = window.MMSupabase ? await window.MMSupabase.getAccessToken() : null;
    if (token) {
      var meRes = await fetch('/api/me', { headers: { 'Authorization': 'Bearer ' + token } });
      if (meRes.ok) { location.href = '/'; return; }
      if (meRes.status === 403) {
        await window.MMSupabase.signOut();
        container.innerHTML = _renderCard({ error: 'ไม่มีสิทธิ์เข้าใช้ — ติดต่อ admin' });
        _wire(container);
        return;
      }
    }
  } catch (_) { /* fall through to login card */ }

  container.innerHTML = _renderCard({});
  _wire(container);
}

function _renderCard(opts) {
  var error = opts && opts.error
    ? '<div class="login-error">' + opts.error + '</div>'
    : '';
  return (
    '<div class="login-shell">' +
      '<div class="login-card">' +
        '<div class="login-mark">M</div>' +
        '<h1>Max Mahon</h1>' +
        '<div class="tagline">จัดพอร์ตสไตล์ ดร.นิเวศน์</div>' +
        '<button class="google-btn" type="button" id="btn-google">' +
          '<svg class="g-icon" viewBox="0 0 24 24" width="20" height="20">' +
            '<path fill="#4285F4" d="M22.5 12.27c0-.78-.07-1.54-.2-2.27H12v4.51h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.22-4.74 3.22-8.32z"/>' +
            '<path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.99.66-2.25 1.06-3.71 1.06-2.86 0-5.29-1.93-6.15-4.53H2.18v2.84A11 11 0 0 0 12 23z"/>' +
            '<path fill="#FBBC05" d="M5.85 14.1A6.6 6.6 0 0 1 5.5 12c0-.73.13-1.43.35-2.1V7.07H2.18A11 11 0 0 0 1 12c0 1.78.43 3.46 1.18 4.93l3.67-2.83z"/>' +
            '<path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.65l3.15-3.15C17.45 2.09 14.97 1 12 1A11 11 0 0 0 2.18 7.07L5.85 9.9C6.71 7.31 9.14 5.38 12 5.38z"/>' +
          '</svg>' +
          'Sign in with Google' +
        '</button>' +
        '<div class="login-fineprint">ADMIN INVITE ONLY</div>' +
        error +
      '</div>' +
    '</div>'
  );
}

function _wire(container) {
  var btn = container.querySelector('#btn-google');
  if (!btn) return;
  btn.addEventListener('click', async function () {
    btn.disabled = true;
    try {
      await window.MMSupabase.signInGoogle(location.origin + '/');
    } catch (e) {
      btn.disabled = false;
      alert('Sign in failed: ' + (e && e.message || e));
    }
  });
}

function _ensureStyles() {
  if (document.getElementById('mm-login-styles')) return;
  var css =
    '.login-shell{display:flex;align-items:center;justify-content:center;min-height:80vh;padding:var(--sp-7) var(--sp-5)}' +
    '.login-card{width:100%;max-width:420px;background:var(--bg-surface);border:1px solid var(--border-subtle);border-radius:var(--r-4);padding:var(--sp-7) var(--sp-6);text-align:center;box-shadow:var(--shadow-card)}' +
    '.login-mark{width:64px;height:64px;margin:0 auto var(--sp-4);border-radius:var(--r-3);background:var(--c-positive);color:#fff;font-family:var(--font-head);font-weight:800;font-size:2rem;display:flex;align-items:center;justify-content:center}' +
    '.login-card h1{font-family:var(--font-head);font-size:var(--fs-xl);margin:0 0 var(--sp-1)}' +
    '.login-card .tagline{color:var(--fg-dim);font-style:italic;font-size:var(--fs-sm);margin-bottom:var(--sp-6)}' +
    '.google-btn{display:inline-flex;align-items:center;justify-content:center;gap:var(--sp-3);width:100%;padding:var(--sp-4) var(--sp-5);background:var(--bg-surface);color:var(--fg-primary);border:1px solid var(--border-strong);border-radius:var(--r-3);font-family:var(--font-body);font-weight:500;font-size:var(--fs-base);cursor:pointer;transition:background 120ms ease}' +
    '.google-btn:hover:not([disabled]){background:var(--bg-surface-2)}' +
    '.google-btn[disabled]{opacity:0.5;cursor:not-allowed}' +
    '.login-fineprint{margin-top:var(--sp-5);padding-top:var(--sp-4);border-top:1px dotted var(--border-subtle);color:var(--fg-dim);font-family:var(--font-mono);font-size:var(--fs-xs);letter-spacing:0.08em}' +
    '.login-error{margin-top:var(--sp-4);padding:var(--sp-3) var(--sp-4);background:var(--c-negative-soft);border-left:3px solid var(--c-negative);color:var(--fg-primary);font-size:var(--fs-sm);text-align:left}';
  var el = document.createElement('style');
  el.id = 'mm-login-styles';
  el.textContent = css;
  document.head.appendChild(el);
}

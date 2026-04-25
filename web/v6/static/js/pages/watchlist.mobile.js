/* ==========================================================
   MAX MAHON v6 — Watchlist Page (Mobile)
   Stacked card list + bottom-sheet modals.
   Fetches live from /api/watchlist/enriched — NO hardcoded data.
   Same API + patterns as desktop; tap-only (no swipe).
   ========================================================== */

const MAX_COMPARE = 3;
const MIN_COMPARE = 2;
const _selected = new Set();
let _positions = [];

export function mount(root) {
  root.innerHTML = _renderShell();
  _bindFooter(root);
  _load(root);
}

function _renderShell() {
  return (
    '<div class="section-num">' +
      '<span class="no">02 · Watchlist</span>' +
      '<span id="wl-sectaside"></span>' +
    '</div>' +
    '<section class="summary-strip" id="wl-summary"></section>' +
    '<div id="wl-list-host"></div>' +
    '<div style="padding:24px 0;display:flex;gap:10px;justify-content:center;flex-wrap:wrap">' +
      '<button class="btn ghost" id="wl-add-btn" type="button">+ Add Symbol</button>' +
      '<button class="btn primary" id="wl-cmp-btn" type="button" disabled>เทียบหุ้นที่เลือก · 0/' + MAX_COMPARE + '</button>' +
    '</div>' +
    '<div class="ornament"></div>'
  );
}

async function _load(root) {
  const listHost = root.querySelector('#wl-list-host');
  const summaryHost = root.querySelector('#wl-summary');
  window.MMComponents.renderLoading(listHost, 'Loading positions');
  try {
    const data = await window.MMApi.get('/api/watchlist/enriched');
    _positions = data.positions || [];
    _selected.clear();
    _renderSummary(summaryHost, data.summary || {});
    _renderSectionAside(root, data.summary || {});
    _renderList(listHost);
    _updateCompareButton(root);
  } catch (e) {
    window.MMComponents.renderError(
      listHost,
      'โหลด watchlist ไม่สำเร็จ: ' + (e && e.message || e),
      function () { _load(root); }
    );
  }
}

function _renderSectionAside(root, summary) {
  const aside = root.querySelector('#wl-sectaside');
  if (!aside) return;
  const n = summary.tracked || 0;
  aside.textContent = n + ' positions';
}

function _renderSummary(host, s) {
  if (!host) return;
  const cells = [
    ['Hold', s.hold],
    ['Review', s.review],
    ['Consider Exit', s.consider_exit],
    ['Avg Δ', _fmtDelta(s.avg_delta_entry)]
  ];
  let html = '';
  for (let i = 0; i < cells.length; i++) {
    const label = window.MMUtils.escapeHtml(String(cells[i][0]));
    const raw = cells[i][1];
    const val = (raw === undefined || raw === null) ? '—' : String(raw);
    html +=
      '<div class="summary-cell">' +
        '<span class="label">' + label + '</span>' +
        '<span class="val mono">' + window.MMUtils.escapeHtml(val) + '</span>' +
      '</div>';
  }
  host.innerHTML = html;
}

function _fmtDelta(v) {
  if (v === null || v === undefined) return '—';
  const n = Number(v);
  if (isNaN(n)) return '—';
  const sign = n > 0 ? '+' : (n < 0 ? '' : '');
  return sign + n;
}

function _renderList(host) {
  if (!host) return;
  if (!_positions.length) {
    host.innerHTML =
      '<div style="padding:32px 0;text-align:center;font-family:var(--font-head);' +
      'font-style:italic;color:var(--fg-dim)">ยังไม่มีหุ้นใน watchlist.</div>';
    return;
  }
  const esc = window.MMUtils.escapeHtml;
  let html = '';
  for (let i = 0; i < _positions.length; i++) {
    const p = _positions[i];
    const sym = esc(p.symbol || '');
    const name = esc(p.name || sym);
    const score = p.current_score == null ? '—' : String(p.current_score);
    const delta = _formatDeltaCell(p);
    const entry = p.entry_date ? _formatMobileDate(p.entry_date) : '—';
    const sev = window.MMComponents.renderSevBadge(p.exit_signal || 'HOLD');
    const note = esc(p.note || '');
    const checked = _selected.has(p.symbol) ? ' checked' : '';
    html +=
      '<div class="wl-card" data-sym="' + sym + '">' +
        '<div class="star" data-mm-star="' + sym + '" role="button" aria-label="Remove ' + sym + '">★</div>' +
        '<div class="wl-body">' +
          '<a href="/m/report/' + sym + '" class="sym-link" style="display:block;color:inherit;text-decoration:none">' +
            '<div class="sym">' + sym + '</div>' +
            '<div class="name">' + name + '</div>' +
          '</a>' +
          '<div class="delta-row">' +
            '<span>Entry ' + esc(entry) + '</span>' +
            '<span>·</span>' +
            '<span>' + delta + '</span>' +
          '</div>' +
          '<input class="note-input-mobile" data-mm-note="' + sym + '" value="' + note + '" placeholder="note&hellip;" />' +
        '</div>' +
        '<div class="wl-right">' +
          '<div class="score">' + score + '</div>' +
          '<div class="sig">' + sev + '</div>' +
          '<input type="checkbox" class="cmp-check-mobile" data-mm-cmp="' + sym + '"' + checked + ' aria-label="Select ' + sym + ' for compare" />' +
        '</div>' +
      '</div>';
  }
  host.innerHTML = html;
  _bindCards(host);
}

function _formatMobileDate(iso) {
  const dt = new Date(iso);
  if (isNaN(dt.getTime())) return '—';
  const m = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'][dt.getMonth()];
  const dd = String(dt.getDate()).padStart(2, '0');
  return m + ' ' + dd + ', ' + String(dt.getFullYear()).slice(-2);
}

function _formatDeltaCell(p) {
  const d = p.delta_entry;
  const entry = p.entry_score;
  if (d === null || d === undefined || entry === null || entry === undefined) return '—';
  const sign = d > 0 ? '+' : (d < 0 ? '−' : '');
  const abs = Math.abs(d);
  const color = d >= 0 ? 'var(--fg-primary)' : 'var(--c-positive)';
  return '<span style="color:' + color + '">' + sign + abs + ' vs ' + entry + '</span>';
}

function _bindCards(host) {
  const stars = host.querySelectorAll('[data-mm-star]');
  for (let i = 0; i < stars.length; i++) {
    stars[i].addEventListener('click', function () {
      const sym = this.getAttribute('data-mm-star');
      _onStarRemove(sym, this.closest('.wl-card'));
    });
  }
  const notes = host.querySelectorAll('[data-mm-note]');
  for (let i = 0; i < notes.length; i++) {
    notes[i].addEventListener('blur', function () {
      const sym = this.getAttribute('data-mm-note');
      _onNoteBlur(sym, this);
    });
  }
  const cmps = host.querySelectorAll('[data-mm-cmp]');
  for (let i = 0; i < cmps.length; i++) {
    cmps[i].addEventListener('change', function () {
      const sym = this.getAttribute('data-mm-cmp');
      _onCompareToggle(sym, this);
    });
  }
}

function _bindFooter(root) {
  const cmpBtn = root.querySelector('#wl-cmp-btn');
  if (cmpBtn) cmpBtn.addEventListener('click', function () { _openCompare(root); });
  const addBtn = root.querySelector('#wl-add-btn');
  if (addBtn) addBtn.addEventListener('click', function () { _openAddModal(root); });
}

async function _onStarRemove(sym, cardEl) {
  try {
    await window.MMApi.put('/api/user/watchlist', { remove: [sym] });
    _selected.delete(sym);
    _positions = _positions.filter(function (p) { return p.symbol !== sym; });
    if (cardEl && cardEl.parentNode) cardEl.parentNode.removeChild(cardEl);
    const root = document.getElementById('app') || document;
    _updateCompareButton(root);
    window.MMComponents.showToast('ลบ ' + sym + ' ออกจาก watchlist แล้ว', 'info');
    if (!_positions.length) {
      const host = document.getElementById('wl-list-host');
      _renderList(host);
    }
  } catch (e) {
    window.MMComponents.showToast('ลบไม่สำเร็จ: ' + (e && e.message || e), 'error');
  }
}

async function _onNoteBlur(sym, input) {
  const newNote = input.value.trim();
  try {
    await window.MMApi.put('/api/user/notes/' + encodeURIComponent(sym), { note: newNote });
    const p = _positions.find(function (x) { return x.symbol === sym; });
    if (p) p.note = newNote;
    window.MMComponents.showToast('บันทึก note แล้ว', 'info');
  } catch (e) {
    window.MMComponents.showToast('Save failed: ' + (e && e.message || e), 'error');
  }
}

function _onCompareToggle(sym, el) {
  if (el.checked) {
    if (_selected.size >= MAX_COMPARE) {
      el.checked = false;
      window.MMComponents.showToast('เลือกได้สูงสุด ' + MAX_COMPARE + ' ตัว', 'warn');
      return;
    }
    _selected.add(sym);
  } else {
    _selected.delete(sym);
  }
  _updateCompareButton(document);
}

function _updateCompareButton(scope) {
  const btn = (scope || document).querySelector('#wl-cmp-btn');
  if (!btn) return;
  const n = _selected.size;
  btn.textContent = 'เทียบหุ้นที่เลือก · ' + n + '/' + MAX_COMPARE;
  btn.disabled = (n < MIN_COMPARE);
}

async function _openCompare(root) {
  const syms = Array.from(_selected);
  if (syms.length < MIN_COMPARE) return;
  window.MMComponents.openModal(
    '<div id="wl-cmp-body"></div>',
    {
            headline: 'COMPARISON · ' + syms.length + ' STOCKS',
      dek: syms.join(' · ') + ' — best values bolded in oxblood'
    }
  );
  const body = document.getElementById('wl-cmp-body');
  window.MMComponents.renderLoading(body, 'Loading comparison');
  try {
    const data = await window.MMApi.get('/api/watchlist/compare?symbols=' + encodeURIComponent(syms.join(',')));
    body.innerHTML = _renderCompareGrid(data);
  } catch (e) {
    window.MMComponents.renderError(
      body,
      'โหลดเปรียบเทียบไม่สำเร็จ: ' + (e && e.message || e)
    );
  }
}

function _renderCompareGrid(data) {
  const syms = data.symbols || [];
  const rows = data.rows || [];
  const esc = window.MMUtils.escapeHtml;

  // Mobile compare grid: label + N sym cols (delta col hidden via mobile.css)
  const cols = 'auto repeat(' + syms.length + ', 1fr)';
  let html =
    '<div class="compare-grid" style="grid-template-columns:' + cols + '">' +
      '<div class="row-label"></div>';
  for (let i = 0; i < syms.length; i++) {
    html += '<div class="sym-head">' + esc(syms[i]) + '</div>';
  }

  for (let r = 0; r < rows.length; r++) {
    const row = rows[r];
    html += '<div class="row-label">' + esc(row.label) + '</div>';
    const vals = row.values || [];
    for (let c = 0; c < vals.length; c++) {
      const v = vals[c];
      const cls = (row.best_index === c) ? 'val best' : 'val';
      html += '<div class="' + cls + '">' + _fmtCompareCell(row.label, v) + '</div>';
    }
    for (let c = vals.length; c < syms.length; c++) {
      html += '<div class="val">—</div>';
    }
  }
  html += '</div>';

  html +=
    '<p class="lede" style="margin-top:20px;max-width:none;font-size:0.92rem">' +
      'เปรียบเทียบ ' + syms.length + ' หุ้น · ค่าที่ดีที่สุดเน้นสี · อ่านประกอบกับ exit signal.' +
    '</p>';
  return html;
}

function _fmtCompareCell(label, v) {
  if (v === null || v === undefined) return '—';
  if (label === 'Exit Signal') {
    return '<span style="font-size:0.75rem">' + window.MMComponents.renderSevBadge(String(v)) + '</span>';
  }
  if (label === 'Yield' || label === 'Payout' || label === 'ROE') {
    return window.MMUtils.fmtPercent(v, 2);
  }
  if (label === 'P/E' || label === 'P/BV') {
    return Number(v).toFixed(2) + '×';
  }
  if (label === 'Streak') {
    return String(v) + ' y';
  }
  if (label === 'Mcap (B THB)') {
    return String(v) + 'B';
  }
  if (label === 'Signals') {
    return '<span style="font-size:0.65rem">' + window.MMUtils.escapeHtml(String(v || '—')) + '</span>';
  }
  if (typeof v === 'number') {
    return String(v);
  }
  return window.MMUtils.escapeHtml(String(v));
}

function _openAddModal(root) {
  const html =
    '<p style="font-family:var(--font-body);color:var(--fg-secondary);margin-bottom:var(--sp-4)">' +
      'กรอก symbol — ระบบจะเติม <code>.BK</code> ให้อัตโนมัติถ้าจำเป็น.' +
    '</p>' +
    '<input type="text" id="wl-add-input" ' +
      'style="width:100%;padding:14px 12px;border:1px solid var(--border-subtle);' +
      'background:var(--bg-surface);font-family:var(--font-mono);font-size:1.05rem;' +
      'color:var(--fg-primary);outline:none;margin-bottom:var(--sp-4);text-transform:uppercase" ' +
      'placeholder="BBL" autocomplete="off" />' +
    '<div id="wl-add-err" style="display:none;color:var(--c-positive);font-family:var(--font-body);' +
      'font-size:var(--fs-sm);margin-bottom:var(--sp-3)"></div>' +
    '<div style="display:flex;justify-content:flex-end;gap:var(--sp-3);flex-wrap:wrap">' +
      '<button type="button" class="btn ghost" id="wl-add-cancel">Cancel</button>' +
      '<button type="button" class="btn primary" id="wl-add-save">เพิ่มหุ้น</button>' +
    '</div>';
  window.MMComponents.openModal(html, {
    kicker: 'Supplementary · Add Position',
    headline: 'Add by Symbol',
    dek: 'เพิ่มหุ้นใน watchlist ด้วย ticker.'
  });
  const input = document.getElementById('wl-add-input');
  const save = document.getElementById('wl-add-save');
  const cancel = document.getElementById('wl-add-cancel');
  const err = document.getElementById('wl-add-err');
  if (input) {
    input.focus();
    input.addEventListener('keydown', function (e) {
      if (e.key === 'Enter') { e.preventDefault(); if (save) save.click(); }
    });
  }
  if (cancel) cancel.addEventListener('click', function () { window.MMComponents.closeModal(); });
  if (save) save.addEventListener('click', async function () {
    const raw = input ? input.value : '';
    const sym = _normalizeSymbol(raw);
    if (!sym) {
      if (err) { err.style.display = 'block'; err.textContent = 'กรุณากรอก symbol'; }
      return;
    }
    save.disabled = true;
    try {
      await window.MMApi.put('/api/user/watchlist', { add: [sym] });
      window.MMComponents.closeModal();
      window.MMComponents.showToast('เพิ่ม ' + sym + ' เข้า watchlist แล้ว', 'info');
      if (root) _load(root);
    } catch (e) {
      save.disabled = false;
      if (err) {
        err.style.display = 'block';
        err.textContent = 'เพิ่มไม่สำเร็จ: ' + (e && e.message || e);
      }
    }
  });
}

function _normalizeSymbol(raw) {
  const s = String(raw || '').trim().toUpperCase();
  if (!s) return '';
  if (s.indexOf('.') !== -1) return s;
  return s + '.BK';
}

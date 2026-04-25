/* ==========================================================
   MAX MAHON v6 — Portfolio Builder Page (Desktop)
   เอาหุ้นจาก watchlist มาจัดเป็นพอร์ต Niwes 5-sector x 80/20
   + role badges + bench list + Claude Opus pillar-1 commentary
   Live data: GET /api/portfolio/builder + POST /api/portfolio/builder/explain
   localStorage: 'mm-portfolio-pins' (array of full symbols, e.g. ['QH.BK'])
   ========================================================== */

const PIN_KEY = 'mm-portfolio-pins';
let _lastBuilder = null;

export function mount(root) {
  root.innerHTML = _renderShell();
  _bindEvents(root);
  _load(root);
}

function _renderShell() {
  return (
    '<section class="headline">' +
      '<h1>จัดพอร์ตจาก Watchlist</h1>' +
      '<p>เอาหุ้นใน watchlist มาจัดเป็นพอร์ต 5 ตัว · 5 sector · น้ำหนัก 80/20 ตามแนว ดร.นิเวศน์ · ระบุบทบาท anchor / supporting / tail</p>' +
    '</section>' +
    '<div id="pf-source"></div>' +
    '<div id="pf-warnings"></div>' +
    '<div class="cols">' +
      '<aside class="left-col">' +
        '<div id="pf-pins"></div>' +
        '<button class="opus-btn" id="pf-opus-btn" type="button">' +
          '<h5>ขอแมกซ์ช่วยอธิบายภาพรวมพอร์ต</h5>' +
          '<p>คุยกับ Claude Opus เชื่อมพอร์ตนี้กับ <strong>เสาหลัก 1 — พอร์ตปันผล 100M</strong> · scenario ตัวเลขจริง · ขั้นถัดไป (~10 วินาที)</p>' +
        '</button>' +
        '<div class="algo-foot">' +
          '<h5>Niwes Composite</h5>' +
          '<p>คัดด้วย <code>yield + value + hidden + quality</code> · top-1 ต่อ sector · weighting <code>40/35/12/8/5</code> · pin override sector matching</p>' +
        '</div>' +
      '</aside>' +
      '<main class="right-col">' +
        '<div id="pf-summary"></div>' +
        '<div id="pf-chart"></div>' +
        '<div class="sec-h"><h3>หุ้นในพอร์ต</h3><span class="hint" id="pf-pos-hint"></span></div>' +
        '<div id="pf-positions" class="pos-list"></div>' +
        '<div class="sec-h"><h3>หุ้นใน Watchlist ที่ไม่ได้เลือก</h3><span class="hint" id="pf-bench-hint"></span></div>' +
        '<div id="pf-bench" class="bench-list"></div>' +
      '</main>' +
    '</div>'
  );
}

function _getPins() {
  try { return JSON.parse(localStorage.getItem(PIN_KEY) || '[]'); }
  catch (e) { return []; }
}

function _setPins(pins) {
  localStorage.setItem(PIN_KEY, JSON.stringify(pins));
}

async function _load(root) {
  const pins = _getPins();
  const url = '/api/portfolio/builder' + (pins.length ? '?pins=' + encodeURIComponent(pins.join(',')) : '');
  const positionsHost = root.querySelector('#pf-positions');
  if (positionsHost) window.MMComponents.renderLoading(positionsHost, 'จัดพอร์ตอยู่');
  try {
    const data = await window.MMApi.get(url);
    _lastBuilder = data;
    _renderSourceBanner(root.querySelector('#pf-source'), data.source || {});
    _renderWarnings(root.querySelector('#pf-warnings'), data.warnings || []);
    _renderPinChips(root.querySelector('#pf-pins'), pins);
    _renderSummary(root.querySelector('#pf-summary'), data.summary || {});
    _renderSectorChart(root.querySelector('#pf-chart'), data.portfolio || []);
    _renderPositions(positionsHost, data.portfolio || []);
    _renderBench(root.querySelector('#pf-bench'), data.bench || []);
    _updateHints(root, data);
  } catch (e) {
    window.MMComponents.renderError(
      positionsHost || root,
      'โหลดพอร์ตไม่สำเร็จ: ' + (e && e.message || e),
      function () { _load(root); }
    );
  }
}

function _updateHints(root, data) {
  const portfolio = data.portfolio || [];
  let anchors = 0, supporting = 0, tails = 0;
  for (let i = 0; i < portfolio.length; i++) {
    const r = portfolio[i].role;
    if (r === 'anchor') anchors++;
    else if (r === 'supporting') supporting++;
    else tails++;
  }
  const posHint = root.querySelector('#pf-pos-hint');
  if (posHint) posHint.textContent = 'บทบาท: anchor ' + anchors + ' · supporting ' + supporting + ' · tail ' + tails;
  const benchHint = root.querySelector('#pf-bench-hint');
  if (benchHint) benchHint.textContent = (data.bench || []).length + ' ตัว · sector ซ้ำหรือ score รอง';
}

function _renderSourceBanner(host, source) {
  if (!host) return;
  const esc = window.MMUtils.escapeHtml;
  const count = source.watchlist_count || 0;
  const hoursAgo = (source.scan_hours_ago !== null && source.scan_hours_ago !== undefined)
    ? (source.scan_hours_ago + ' hr ที่แล้ว')
    : 'ไม่ทราบ';
  host.innerHTML =
    '<div class="src-banner">' +
      '<span class="ic">🗂</span>' +
      '<span class="txt"><strong>' + count + ' หุ้นใน watchlist</strong> · scan ล่าสุด ' + esc(hoursAgo) + '</span>' +
      '<button class="sync-btn" id="pf-refresh-btn" type="button">↻ รีเฟรช</button>' +
    '</div>';
}

function _renderWarnings(host, warnings) {
  if (!host) return;
  if (!warnings.length) { host.innerHTML = ''; return; }
  const esc = window.MMUtils.escapeHtml;
  let html = '';
  for (let i = 0; i < warnings.length; i++) {
    const w = warnings[i];
    const sector = w.sector || '';
    const msg = w.msg || '';
    const heading = sector ? ('Sector ไม่ครบ — ขาด ' + sector) : 'Warning';
    html +=
      '<div class="sec-warn">' +
        '<span class="ic">⚠</span>' +
        '<div class="body">' +
          '<h5>' + esc(heading) + '</h5>' +
          '<p>' + esc(msg) + '</p>' +
        '</div>' +
      '</div>';
  }
  host.innerHTML = html;
}

function _renderPinChips(host, pins) {
  if (!host) return;
  const esc = window.MMUtils.escapeHtml;
  let chips = '';
  for (let i = 0; i < pins.length; i++) {
    const p = pins[i];
    chips += '<span class="chip pin">' + esc(p) + ' <span class="x" data-mm-pin-x="' + esc(p) + '" role="button" aria-label="Remove pin ' + esc(p) + '">×</span></span>';
  }
  chips += '<span class="chip add" id="pf-pin-add" role="button">+ เพิ่ม pin</span>';
  host.innerHTML =
    '<div class="chip-section">' +
      '<div class="chip-title">ปักหมุด <span style="color:var(--fg-dim);font-weight:500;text-transform:none;letter-spacing:0">บังคับใส่พอร์ต</span></div>' +
      '<div class="chip-row">' + chips + '</div>' +
    '</div>';
}

function _renderSummary(host, s) {
  if (!host) return;
  const esc = window.MMUtils.escapeHtml;
  const sectorFilled = s.sector_filled || '0/5';
  const filledNum = parseInt(String(sectorFilled).split('/')[0], 10) || 0;
  const sectorStyle = filledNum < 5 ? ' style="color:var(--c-warn-fg)"' : '';
  host.innerHTML =
    '<div class="summary-strip">' +
      '<div class="summary-cell">' +
        '<div class="v">' + (s.stock_count || 0) + '</div>' +
        '<div class="l">หุ้นในพอร์ต</div>' +
      '</div>' +
      '<div class="summary-cell">' +
        '<div class="v"' + sectorStyle + '>' + esc(String(sectorFilled)) + '</div>' +
        '<div class="l">sector</div>' +
      '</div>' +
      '<div class="summary-cell">' +
        '<div class="v">' + (s.score_avg || 0) + '</div>' +
        '<div class="l">score avg.</div>' +
      '</div>' +
    '</div>';
}

function _sectorColor(sectorClass) {
  const map = {
    's-prop': 'var(--c-positive)',
    's-bank': 'var(--c-info)',
    's-comm': 'var(--c-warn)',
    's-ict':  'var(--c-purple)',
    's-nrg':  'var(--c-negative)'
  };
  return map[sectorClass] || 'var(--c-warn)';
}

function _renderSectorChart(host, portfolio) {
  if (!host) return;
  if (!portfolio.length) { host.innerHTML = ''; return; }
  const esc = window.MMUtils.escapeHtml;
  let segs = '';
  let legend = '';
  for (let i = 0; i < portfolio.length; i++) {
    const p = portfolio[i];
    const color = _sectorColor(p.sector_class);
    const w = p.weight_pct || 0;
    segs += '<div class="seg" style="width:' + w + '%;background:' + color + '"></div>';
    legend +=
      '<div class="lg-row">' +
        '<span class="lg-dot" style="background:' + color + '"></span>' +
        '<span class="lg-label">' + esc(p.sector_canonical || '') + '</span>' +
        '<span class="lg-val">' + w + '%</span>' +
      '</div>';
  }
  host.innerHTML =
    '<div class="diversify">' +
      '<div class="dv-head">' +
        '<h4>การกระจาย Sector</h4>' +
        '<span class="badge">● 80/20 healthy</span>' +
      '</div>' +
      '<div class="seg-bar">' + segs + '</div>' +
      '<div class="dv-legend">' + legend + '</div>' +
    '</div>';
}

function _tagClass(t) {
  if (t === 'PASS') return 'pass';
  if (t === 'PINNED') return 'pin';
  if (t.indexOf('Hidden') === 0) return 'hidden';
  return '';
}

function _renderPositions(host, portfolio) {
  if (!host) return;
  if (!portfolio.length) {
    host.innerHTML =
      '<div style="padding:24px 0;text-align:center;color:var(--fg-dim)">ยังไม่มีพอร์ต — เพิ่มหุ้นใน watchlist ก่อน</div>';
    return;
  }
  const esc = window.MMUtils.escapeHtml;
  let html = '';
  for (let i = 0; i < portfolio.length; i++) {
    const p = portfolio[i];
    const role = p.role || 'tail';
    const roleUpper = role.charAt(0).toUpperCase() + role.slice(1);
    const tagsArr = p.tags || [];
    let tagsHtml = '';
    for (let j = 0; j < tagsArr.length; j++) {
      const t = tagsArr[j];
      tagsHtml += '<span class="tag ' + _tagClass(t) + '">' + esc(t) + '</span>';
    }
    const weightCls = role === 'anchor' ? 'anchor' : '';
    const weightPct = p.weight_pct || 0;
    const trackWidth = Math.min(100, weightPct / 40 * 100);
    html +=
      '<div class="pos">' +
        '<div class="role-badge ' + role + '">' + esc(roleUpper) + '<span class="th">' + esc(p.role_label_th || '') + '</span></div>' +
        '<div class="body">' +
          '<div class="row1">' +
            '<span class="sym">' + esc(p.symbol || '') + '</span> ' +
            '<span class="th-name">' + esc(p.name || '') + '</span> ' +
            '<span class="sector ' + (p.sector_class || 's-comm') + '">' + esc(p.sector_canonical || '') + '</span>' +
          '</div>' +
          '<div class="tags">' + tagsHtml + '</div>' +
        '</div>' +
        '<div class="weight-col">' +
          '<div class="weight-num ' + weightCls + '">' + weightPct + '%</div>' +
          '<div class="score"><span class="s-dot ' + (p.score_dot || 'b') + '">' + (p.score == null ? '?' : p.score) + '</span> Niwes</div>' +
        '</div>' +
        '<div class="reason">' + esc(p.reason || '') + '</div>' +
        '<div class="w-track"><i style="width:' + trackWidth + '%"></i></div>' +
      '</div>';
  }
  host.innerHTML = html;
}

function _renderBench(host, bench) {
  if (!host) return;
  if (!bench.length) {
    host.innerHTML = '<div style="padding:16px;color:var(--fg-dim);font-style:italic">หุ้นใน watchlist ทั้งหมดติดพอร์ต</div>';
    return;
  }
  const esc = window.MMUtils.escapeHtml;
  let html = '';
  for (let i = 0; i < bench.length; i++) {
    const b = bench[i];
    html +=
      '<div class="bench-row">' +
        '<span class="sym">' + esc(b.symbol || '') + '</span>' +
        '<div><span class="name">' + esc(b.name || '') + '</span></div>' +
        '<div class="reason">' + esc(b.reason || '') + '</div>' +
        '<span class="score-mini">' + (b.score == null ? '?' : b.score) + '</span>' +
      '</div>';
  }
  host.innerHTML = html;
}

function _bindEvents(root) {
  root.addEventListener('click', function (e) {
    const xBtn = e.target.closest('[data-mm-pin-x]');
    if (xBtn) {
      const sym = xBtn.getAttribute('data-mm-pin-x');
      const pins = _getPins().filter(function (p) { return p !== sym; });
      _setPins(pins);
      window.MMComponents.showToast('ลบ pin ' + sym, 'info');
      _load(root);
      return;
    }
    const addBtn = e.target.closest('#pf-pin-add');
    if (addBtn) { _openPinModal(root); return; }
    const opusBtn = e.target.closest('#pf-opus-btn');
    if (opusBtn) { _openOpusModal(root); return; }
    const refreshBtn = e.target.closest('#pf-refresh-btn');
    if (refreshBtn) { _load(root); return; }
  });
}

function _normalizePin(raw) {
  const s = String(raw || '').trim().toUpperCase();
  if (!s) return '';
  if (s.indexOf('.') !== -1) return s;
  return s + '.BK';
}

function _openPinModal(root) {
  const html =
    '<p style="color:var(--fg-secondary);margin-bottom:var(--sp-4)">กรอก symbol จาก watchlist (เช่น "QH" — ไม่ต้องใส่ .BK ระบบจะเติมให้)</p>' +
    '<input type="text" id="pf-pin-input" ' +
      'style="width:100%;padding:10px 12px;border:1px solid var(--border-subtle);' +
      'background:var(--bg-surface);font-family:var(--font-mono);font-size:var(--fs-md);' +
      'color:var(--fg-primary);outline:none;margin-bottom:var(--sp-4);text-transform:uppercase" ' +
      'placeholder="QH" autocomplete="off" />' +
    '<div style="display:flex;justify-content:flex-end;gap:var(--sp-3)">' +
      '<button type="button" class="btn ghost" id="pf-pin-cancel">Cancel</button>' +
      '<button type="button" class="btn primary" id="pf-pin-save">เพิ่ม pin</button>' +
    '</div>';
  window.MMComponents.openModal(html, {
    kicker: 'Portfolio · Pin',
    headline: 'ปักหมุดหุ้น',
    dek: 'หุ้นที่ปักหมุดจะถูกเลือกเข้าพอร์ตในช่อง sector ของมันเสมอ.'
  });
  const input = document.getElementById('pf-pin-input');
  const save = document.getElementById('pf-pin-save');
  const cancel = document.getElementById('pf-pin-cancel');
  if (input) {
    input.focus();
    input.addEventListener('keydown', function (e) {
      if (e.key === 'Enter') { e.preventDefault(); if (save) save.click(); }
    });
  }
  if (cancel) cancel.addEventListener('click', function () { window.MMComponents.closeModal(); });
  if (save) save.addEventListener('click', function () {
    const sym = _normalizePin(input ? input.value : '');
    if (!sym) return;
    const pins = _getPins();
    if (pins.indexOf(sym) === -1) pins.push(sym);
    _setPins(pins);
    window.MMComponents.closeModal();
    window.MMComponents.showToast('เพิ่ม pin ' + sym, 'info');
    _load(root);
  });
}

async function _openOpusModal(root) {
  window.MMComponents.openModal(
    '<div id="pf-opus-body"></div>',
    {
      kicker: 'Portfolio · Max-to-Art',
      headline: 'แมกซ์อธิบายภาพรวมพอร์ต',
      dek: 'Claude Opus เชื่อมพอร์ตนี้กับเสาหลัก 1 — พอร์ตปันผล 100M'
    }
  );
  const body = document.getElementById('pf-opus-body');
  if (!body) return;
  window.MMComponents.renderLoading(body, 'แมกซ์กำลังคิด (~10 วินาที)');
  try {
    const pins = _getPins();
    let builder = _lastBuilder;
    if (!builder) {
      const url = '/api/portfolio/builder' + (pins.length ? '?pins=' + encodeURIComponent(pins.join(',')) : '');
      builder = await window.MMApi.get(url);
      _lastBuilder = builder;
    }
    const portfolio = builder.portfolio || [];
    const data = await window.MMApi.post('/api/portfolio/builder/explain', {
      watchlist: portfolio.map(function (p) { return p.symbol; }),
      pins: pins,
      portfolio: portfolio
    });
    const esc = window.MMUtils.escapeHtml;
    const paragraphs = String(data.commentary || '').split(/\n\n+/);
    let html = '';
    for (let i = 0; i < paragraphs.length; i++) {
      const para = paragraphs[i].trim();
      if (!para) continue;
      html += '<p style="margin-bottom:var(--sp-3);line-height:1.65">' + esc(para) + '</p>';
    }
    html += '<div style="margin-top:var(--sp-4);font-size:var(--fs-sm);color:var(--fg-dim)">analyzed_at: ' +
      esc(data.analyzed_at || '') + '</div>';
    body.innerHTML = html;
  } catch (e) {
    window.MMComponents.renderError(body, 'แมกซ์อธิบายไม่ได้: ' + (e && e.message || e));
  }
}

/* ==========================================================
   MAX MAHON v6 — Format Utilities
   Pure functions — date, currency, percent, delta, compact.
   Exposes window.MMUtils.
   ========================================================== */
(function () {
  'use strict';

  var MONTHS_EN = ['January','February','March','April','May','June',
                   'July','August','September','October','November','December'];
  var DAYS_EN   = ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'];

  /** Format a Date (or ISO string) as "Saturday · April 25, 2026". */
  function fmtDateLong(d) {
    var dt = (d instanceof Date) ? d : new Date(d);
    if (isNaN(dt.getTime())) return '—';
    return DAYS_EN[dt.getDay()] + ' · ' + MONTHS_EN[dt.getMonth()] + ' ' + dt.getDate() + ', ' + dt.getFullYear();
  }

  /** Format as "22 Apr 2026" (short). */
  function fmtDateShort(d) {
    var dt = (d instanceof Date) ? d : new Date(d);
    if (isNaN(dt.getTime())) return '—';
    return dt.getDate() + ' ' + MONTHS_EN[dt.getMonth()].slice(0,3) + ' ' + dt.getFullYear();
  }

  var MONTHS_TH_SHORT = ['ม.ค.','ก.พ.','มี.ค.','เม.ย.','พ.ค.','มิ.ย.',
                         'ก.ค.','ส.ค.','ก.ย.','ต.ค.','พ.ย.','ธ.ค.'];

  /** Format as "23 เม.ย. 68" (Thai short, Buddhist year, 2-digit). */
  function fmtDateThaiShort(d) {
    var dt = (d instanceof Date) ? d : new Date(d);
    if (isNaN(dt.getTime())) return '—';
    var thaiYear = dt.getFullYear() + 543;
    var yy = String(thaiYear).slice(-2);
    return dt.getDate() + ' ' + MONTHS_TH_SHORT[dt.getMonth()] + ' ' + yy;
  }

  /** THB currency — "324.5B" / "58.0M" / "1.2K" / raw for small. */
  function fmtCompact(n) {
    if (n === null || n === undefined || isNaN(n)) return '—';
    var v = Number(n);
    var abs = Math.abs(v);
    if (abs >= 1e12) return (v / 1e12).toFixed(1) + 'T';
    if (abs >= 1e9)  return (v / 1e9).toFixed(1) + 'B';
    if (abs >= 1e6)  return (v / 1e6).toFixed(1) + 'M';
    if (abs >= 1e3)  return (v / 1e3).toFixed(1) + 'K';
    return String(v);
  }

  /** Currency with Bt suffix: "฿324,500,000,000". */
  function fmtCurrency(n, decimals) {
    if (n === null || n === undefined || isNaN(n)) return '—';
    return '฿' + Number(n).toLocaleString('en-US', {
      minimumFractionDigits: decimals || 0,
      maximumFractionDigits: decimals || 0
    });
  }

  /** "6.80%" — expects raw value already in percent (not 0.068). */
  function fmtPercent(n, decimals) {
    if (n === null || n === undefined || isNaN(n)) return '—';
    return Number(n).toFixed(decimals == null ? 2 : decimals) + '%';
  }

  /** Fixed-decimal number with locale commas. */
  function fmtNum(n, decimals) {
    if (n === null || n === undefined || isNaN(n)) return '—';
    return Number(n).toLocaleString('en-US', {
      minimumFractionDigits: decimals == null ? 2 : decimals,
      maximumFractionDigits: decimals == null ? 2 : decimals
    });
  }

  /**
   * Format a score delta:
   *   {prev:65, curr:74}  → "↑ 65 → 74"
   *   {prev:null, curr:74}→ "↑ New entry"
   *   {prev:74, curr:70}  → "↓ 74 → 70"
   * Returns { arrow, text } for flexible rendering.
   */
  function fmtScoreDelta(prev, curr) {
    if (prev == null || prev === undefined) return { arrow: '↑', text: 'New entry' };
    if (curr > prev) return { arrow: '↑', text: prev + ' → ' + curr };
    if (curr < prev) return { arrow: '↓', text: prev + ' → ' + curr };
    return { arrow: '·', text: prev + ' → ' + curr };
  }

  /** Clamp number into [lo,hi]. */
  function clamp(v, lo, hi) { return Math.max(lo, Math.min(hi, v)); }

  /** HTML-escape a user-supplied string. */
  function escapeHtml(s) {
    if (s == null) return '';
    return String(s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  /** Strip query + hash, return clean pathname. */
  function pathOnly(url) {
    if (!url) return '';
    var i = url.indexOf('?'); if (i >= 0) url = url.slice(0, i);
    i = url.indexOf('#'); if (i >= 0) url = url.slice(0, i);
    return url;
  }

  window.MMUtils = {
    fmtDateLong: fmtDateLong,
    fmtDateShort: fmtDateShort,
    fmtDateThaiShort: fmtDateThaiShort,
    fmtCompact: fmtCompact,
    fmtCurrency: fmtCurrency,
    fmtPercent: fmtPercent,
    fmtNum: fmtNum,
    fmtScoreDelta: fmtScoreDelta,
    clamp: clamp,
    escapeHtml: escapeHtml,
    pathOnly: pathOnly
  };
})();

// ---------- SVG icon helper (append to utils.js as separate IIFE) ----------
(function () {
  var _SVG_PATHS = {
    'banknote': '<rect width="20" height="12" x="2" y="6" rx="2"/><circle cx="12" cy="12" r="2"/><path d="M6 12h.01M18 12h.01"/>',
    'gem': '<path d="M6 3h12l4 6-10 13L2 9Z"/><path d="M11 3 8 9l4 13 4-13-3-6"/><path d="M2 9h20"/>',
    'landmark': '<line x1="3" x2="21" y1="22" y2="22"/><line x1="6" x2="6" y1="18" y2="11"/><line x1="10" x2="10" y1="18" y2="11"/><line x1="14" x2="14" y1="18" y2="11"/><line x1="18" x2="18" y1="18" y2="11"/><polygon points="12 2 20 7 4 7"/>',
    'scale': '<path d="m16 16 3-8 3 8c-.87.65-1.92 1-3 1s-2.13-.35-3-1Z"/><path d="m2 16 3-8 3 8c-.87.65-1.92 1-3 1s-2.13-.35-3-1Z"/><path d="M7 21h10"/><path d="M12 3v18"/><path d="M3 7h2c2 0 5-1 7-2 2 1 5 2 7 2h2"/>',
    'message-circle': '<path d="M7.9 20A9 9 0 1 0 4 16.1L2 22Z"/>',
  };
  function svg(name, opts) {
    var paths = _SVG_PATHS[name];
    if (!paths) return '';
    var size = (opts && opts.size) || 18;
    var stroke = (opts && opts.stroke) || 2;
    return '<svg xmlns="http://www.w3.org/2000/svg" width="' + size + '" height="' + size + '" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="' + stroke + '" stroke-linecap="round" stroke-linejoin="round">' + paths + '</svg>';
  }
  window.MMUtils.svg = svg;
})();

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

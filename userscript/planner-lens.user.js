// ==UserScript==
// @name         Planner Lens
// @namespace    https://github.com/donisewell/planner-lens
// @version      1.3.0
// @description  See FINRA BrokerCheck disclosures while browsing financial planner profiles on LetsMakeAPlan.org.
// @author       donisewell
// @match        *://www.letsmakeaplan.org/*
// @grant        GM.xmlHttpRequest
// @grant        GM_xmlhttpRequest
// @connect      api.brokercheck.finra.org
// @homepageURL  https://github.com/donisewell/planner-lens
// @supportURL   https://github.com/donisewell/planner-lens/issues
// @license      MIT
// @downloadURL  https://raw.githubusercontent.com/donisewell/planner-lens/main/userscript/planner-lens.user.js
// @updateURL    https://raw.githubusercontent.com/donisewell/planner-lens/main/userscript/planner-lens.user.js
// ==/UserScript==

(function plannerLens() {
  'use strict';

  // --- Cross-engine compatibility ---
  // Greasemonkey 4+ uses GM.xmlHttpRequest (Promise-based)
  // Tampermonkey uses GM_xmlhttpRequest (callback-based)
  // We normalize to a Promise interface.

  function gmFetch(url) {
    return new Promise((resolve, reject) => {
      const opts = {
        method: 'GET',
        url: url,
        responseType: 'json',
        onload: function (response) {
          resolve(response);
        },
        onerror: function (err) {
          reject(err);
        }
      };

      if (typeof GM !== 'undefined' && GM.xmlHttpRequest) {
        // Greasemonkey 4+
        GM.xmlHttpRequest(opts);
      } else if (typeof GM_xmlhttpRequest !== 'undefined') {
        // Tampermonkey / Violentmonkey / Greasemonkey 3
        GM_xmlhttpRequest(opts);
      } else {
        // Fallback: regular fetch (will fail on CORS but worth trying)
        fetch(url)
          .then(r => r.json())
          .then(data => resolve({ response: data }))
          .catch(reject);
      }
    });
  }

  // GM_addStyle is not available in Greasemonkey 4+, inject manually
  function addStyle(css) {
    if (typeof GM_addStyle !== 'undefined') {
      GM_addStyle(css);
    } else {
      const style = document.createElement('style');
      style.textContent = css;
      (document.head || document.documentElement).appendChild(style);
    }
  }

  // --- Styles (identical to content.css) ---

  addStyle(`
    .planner-lens-badge {
      margin: 12px 0;
      padding: 16px 20px;
      border-radius: 6px;
      font-family: "HCo Gotham SSm", -apple-system, BlinkMacSystemFont, "Segoe UI", Arial, sans-serif;
      font-size: 13px;
      line-height: 1.5;
    }
    .planner-lens-warning {
      background: #333333;
      color: #ffffff;
    }
    .planner-lens-clean {
      background: #1a5632;
      color: #ffffff;
    }
    .planner-lens-loading {
      background: #4E4E4E;
      color: #cccccc;
      padding: 12px 20px;
      animation: planner-lens-pulse 1.5s ease-in-out infinite;
    }
    @keyframes planner-lens-pulse {
      0%, 100% { opacity: 1; }
      50% { opacity: 0.5; }
    }
    .planner-lens-header {
      display: flex;
      align-items: center;
      gap: 8px;
      margin-bottom: 12px;
    }
    .planner-lens-icon {
      font-size: 18px;
    }
    .planner-lens-title {
      font-weight: 700;
      font-size: 14px;
      color: #ffffff;
    }
    .planner-lens-table {
      width: 100%;
      border-collapse: collapse;
      margin-bottom: 12px;
    }
    .planner-lens-table tr {
      border-bottom: 1px solid rgba(255, 255, 255, 0.1);
    }
    .planner-lens-table tr:last-child {
      border-bottom: none;
    }
    .planner-lens-label {
      padding: 6px 0;
      font-size: 12px;
      color: rgba(255, 255, 255, 0.7);
      vertical-align: top;
      width: 45%;
    }
    .planner-lens-value {
      padding: 6px 0;
      font-size: 12px;
      font-weight: 600;
      vertical-align: top;
    }
    .planner-lens-value.planner-lens-none {
      color: #8FFFB0;
    }
    .planner-lens-value.planner-lens-flagged {
      color: #FFCC33;
    }
    .planner-lens-type-line {
      display: block;
      margin-bottom: 2px;
    }
    .planner-lens-footer {
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      gap: 8px;
      padding-top: 8px;
      border-top: 1px solid rgba(255, 255, 255, 0.1);
    }
    .planner-lens-footer a {
      color: #00B5EA;
      text-decoration: none;
      font-weight: 500;
      font-size: 12px;
    }
    .planner-lens-footer a:hover {
      text-decoration: underline;
    }
    .planner-lens-footer .planner-lens-page-link {
      color: rgba(255, 255, 255, 0.6);
      font-weight: 400;
    }
    .planner-lens-meta {
      font-size: 10px;
      color: rgba(255, 255, 255, 0.4);
      margin-left: auto;
    }
    .planner-lens-meta a {
      color: rgba(255, 255, 255, 0.4) !important;
      font-weight: 400 !important;
      text-decoration: underline;
    }
    .planner-lens-meta a:hover {
      color: rgba(255, 255, 255, 0.6) !important;
    }
  `);

  // --- Helpers ---

  function el(tag, attrs, ...children) {
    const element = document.createElement(tag);
    if (attrs) {
      for (const [key, value] of Object.entries(attrs)) {
        if (key === 'className') element.className = value;
        else if (key === 'textContent') element.textContent = value;
        else element.setAttribute(key, value);
      }
    }
    for (const child of children) {
      if (typeof child === 'string') {
        element.appendChild(document.createTextNode(child));
      } else if (child) {
        element.appendChild(child);
      }
    }
    return element;
  }

  function link(href, text, className) {
    const a = el('a', { href, target: '_blank', rel: 'noopener' }, text);
    if (className) a.className = className;
    return a;
  }

  // --- DOM Extraction ---

  function extractCrdNumber() {
    const links = document.querySelectorAll('a[href*="brokercheck.finra.org/individual"]');
    for (const l of links) {
      const match = l.href.match(/\/individual\/summary\/(\d+)/);
      if (match) return match[1];
    }
    return null;
  }

  function findDisclosuresAnchor() {
    const headings = document.querySelectorAll('h2');
    for (const h of headings) {
      if (h.textContent.trim() === 'Disclosures') {
        if (h.id) return `#${h.id}`;
        h.id = 'planner-lens-disclosures-anchor';
        return '#planner-lens-disclosures-anchor';
      }
    }
    return '#disclosures';
  }

  // --- BrokerCheck API ---

  async function queryBrokerCheck(crdNumber) {
    const url = `https://api.brokercheck.finra.org/search/individual/${crdNumber}?hl=true&nrows=1&start=0&wt=json`;

    try {
      const response = await gmFetch(url);
      const data = typeof response.response === 'string'
        ? JSON.parse(response.response)
        : response.response;

      const hits = data?.hits?.hits || [];
      if (hits.length === 0) return null;

      const content = JSON.parse(hits[0]._source.content);
      const disclosures = content.disclosures || [];

      const byType = {};
      for (const d of disclosures) {
        const type = d.disclosureType || 'Other';
        if (!byType[type]) byType[type] = [];
        byType[type].push({
          resolution: d.disclosureResolution || '',
          date: d.eventDate || '',
          settlement: d.disclosureDetail?.['Settlement Amount'] || ''
        });
      }

      return {
        hasDisclosures: content.disclosureFlag === 'Y',
        disclosureCount: disclosures.length,
        byType,
        crdNumber,
        isIaOnly: (content.basicInformation?.bcScope || '') === 'NotInScope' &&
                  (content.basicInformation?.iaScope || '') === 'Active',
        reportUrl: (content.basicInformation?.bcScope || '') === 'NotInScope' &&
                   (content.basicInformation?.iaScope || '') === 'Active'
          ? `https://adviserinfo.sec.gov/individual/summary/${crdNumber}`
          : `https://brokercheck.finra.org/individual/summary/${crdNumber}`,
        brokerCheckUrl: (content.basicInformation?.bcScope || '') === 'NotInScope' &&
                        (content.basicInformation?.iaScope || '') === 'Active'
          ? `https://adviserinfo.sec.gov/individual/summary/${crdNumber}`
          : `https://brokercheck.finra.org/individual/summary/${crdNumber}`
      };
    } catch (err) {
      console.error('[Planner Lens] API error:', err);
      return null;
    }
  }

  // --- Summary Builder ---

  function summarizeType(items) {
    const counts = {};
    const settlements = [];

    for (const item of items) {
      const res = item.resolution || 'Unresolved';
      counts[res] = (counts[res] || 0) + 1;
      if (item.settlement) settlements.push(item.settlement);
    }

    const parts = [];
    if (counts.Settled) parts.push(`${counts.Settled} settled`);
    if (counts.Denied) parts.push(`${counts.Denied} denied`);
    if (counts.Pending) parts.push(`${counts.Pending} pending`);
    if (counts.Final) parts.push(`${counts.Final} final`);
    if (counts['Final Disposition']) parts.push(`${counts['Final Disposition']} adjudicated`);
    const accounted = (counts.Settled || 0) + (counts.Denied || 0) +
      (counts.Pending || 0) + (counts.Final || 0) + (counts['Final Disposition'] || 0);
    const remainder = items.length - accounted;
    if (remainder > 0) parts.push(`${remainder} other`);

    let line = parts.join(', ');
    if (settlements.length > 0) {
      line += ` (${settlements.join(', ')} in settlements)`;
    }
    return line;
  }

  // --- UI ---

  function injectBadge(apiResult, disclosuresAnchor) {
    const existing = document.getElementById('planner-lens-badge');
    if (existing) existing.remove();

    if (!apiResult) return;

    const badge = el('div', {
      id: 'planner-lens-badge',
      className: apiResult.hasDisclosures
        ? 'planner-lens-badge planner-lens-warning'
        : 'planner-lens-badge planner-lens-clean'
    });

    // Header
    const header = el('div', { className: 'planner-lens-header' },
      el('span', { className: 'planner-lens-icon', textContent: apiResult.hasDisclosures ? '⚠️' : '✅' }),
      el('span', { className: 'planner-lens-title', textContent: 'FINRA BrokerCheck Summary' })
    );
    badge.appendChild(header);

    // Table
    const table = el('table', { className: 'planner-lens-table' });
    const row = el('tr');

    const labelCell = el('td', { className: 'planner-lens-label', textContent: 'FINRA BrokerCheck Disclosures' });
    const valueCell = el('td', {
      className: apiResult.hasDisclosures
        ? 'planner-lens-value planner-lens-flagged'
        : 'planner-lens-value planner-lens-none'
    });

    if (apiResult.hasDisclosures) {
      const types = Object.entries(apiResult.byType);
      types.forEach(([type, items], i) => {
        const line = el('span', {
          className: 'planner-lens-type-line',
          textContent: `${type} (${items.length}): ${summarizeType(items)}`
        });
        valueCell.appendChild(line);
        if (i < types.length - 1) {
          valueCell.appendChild(document.createElement('br'));
        }
      });
    } else {
      valueCell.textContent = 'None';
    }

    row.appendChild(labelCell);
    row.appendChild(valueCell);
    table.appendChild(row);
    badge.appendChild(table);

    // Footer
    const footer = el('div', { className: 'planner-lens-footer' });

    const reportLabel = apiResult.isIaOnly
      ? 'View full SEC IAPD report →'
      : 'View full BrokerCheck report →';
    footer.appendChild(link(apiResult.reportUrl, reportLabel));

    const pageLink = el('a', {
      href: disclosuresAnchor,
      className: 'planner-lens-page-link',
      textContent: 'See CFP Board discipline info below ↓'
    });
    footer.appendChild(pageLink);

    const sourceLabel = apiResult.isIaOnly ? 'SEC IAPD' : 'FINRA BrokerCheck';
    const sourceUrl = apiResult.isIaOnly
      ? 'https://adviserinfo.sec.gov/'
      : 'https://brokercheck.finra.org/';
    const meta = el('span', { className: 'planner-lens-meta' },
      document.createTextNode('All data from '),
      link(sourceUrl, sourceLabel),
      document.createTextNode(` · CRD# ${apiResult.crdNumber} · `),
      link('https://brokercheck.finra.org/terms', 'Terms')
    );
    footer.appendChild(meta);
    badge.appendChild(footer);

    // Insert into page
    const heading = document.querySelector('h1');
    if (heading && heading.parentNode) {
      heading.parentNode.insertBefore(badge, heading.nextSibling);
    }
  }

  // --- Main ---

  function run() {
    setTimeout(async () => {
      const crdNumber = extractCrdNumber();
      if (!crdNumber) {
        console.log('[Planner Lens] No BrokerCheck link found on page.');
        return;
      }

      const disclosuresAnchor = findDisclosuresAnchor();
      console.log(`[Planner Lens] Checking CRD# ${crdNumber}`);

      // Loading indicator
      const heading = document.querySelector('h1');
      if (heading && heading.parentNode) {
        const loading = el('div', {
          id: 'planner-lens-badge',
          className: 'planner-lens-badge planner-lens-loading',
          textContent: 'Loading FINRA BrokerCheck data…'
        });
        heading.parentNode.insertBefore(loading, heading.nextSibling);
      }

      const apiResult = await queryBrokerCheck(crdNumber);
      injectBadge(apiResult, disclosuresAnchor);
    }, 500);
  }

  run();
})();

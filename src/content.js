/**
 * Planner Lens — Content Script (v1.2)
 *
 * Fires on LetsMakeAPlan.org CFP profile pages.
 * All displayed data is pulled live from FINRA's public BrokerCheck API.
 * CFP Board discipline info (already on the page) is linked to, not republished.
 */

(async function plannerLens() {
  'use strict';

  const BROKERCHECK_API = 'https://api.brokercheck.finra.org/search/individual';

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

  function extractPlannerName() {
    const heading = document.querySelector('h1');
    if (!heading) return null;
    return heading.textContent.trim();
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
    const url = `${BROKERCHECK_API}/${crdNumber}?hl=true&nrows=1&start=0&wt=json`;

    try {
      const response = await fetch(url);
      if (!response.ok) return null;

      const data = await response.json();
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

      const bcScope = content.basicInformation?.bcScope || content.bcScope || '';
      const iaScope = content.basicInformation?.iaScope || content.iaScope || '';
      const isIaOnly = bcScope === 'NotInScope' && iaScope === 'Active';

      const reportUrl = isIaOnly
        ? `https://adviserinfo.sec.gov/individual/summary/${crdNumber}`
        : `https://brokercheck.finra.org/individual/summary/${crdNumber}`;

      return {
        hasDisclosures: content.disclosureFlag === 'Y',
        disclosureCount: disclosures.length,
        byType,
        crdNumber,
        isIaOnly,
        reportUrl,
        brokerCheckUrl: reportUrl
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
    if (counts['Settled']) parts.push(`${counts['Settled']} settled`);
    if (counts['Denied']) parts.push(`${counts['Denied']} denied`);
    if (counts['Pending']) parts.push(`${counts['Pending']} pending`);
    if (counts['Final']) parts.push(`${counts['Final']} final`);
    if (counts['Final Disposition']) parts.push(`${counts['Final Disposition']} adjudicated`);
    const accounted = (counts['Settled'] || 0) + (counts['Denied'] || 0) +
      (counts['Pending'] || 0) + (counts['Final'] || 0) + (counts['Final Disposition'] || 0);
    const remainder = items.length - accounted;
    if (remainder > 0) parts.push(`${remainder} other`);

    let line = parts.join(', ');
    if (settlements.length > 0) {
      line += ` (${settlements.join(', ')} in settlements)`;
    }
    return line;
  }

  // --- UI (safe DOM construction, no innerHTML) ---

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

  await new Promise(resolve => setTimeout(resolve, 500));

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
})();

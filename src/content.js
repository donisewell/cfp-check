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

  // --- DOM Extraction ---

  function extractCrdNumber() {
    const links = document.querySelectorAll('a[href*="brokercheck.finra.org/individual"]');
    for (const link of links) {
      const match = link.href.match(/\/individual\/summary\/(\d+)/);
      if (match) return match[1];
    }
    return null;
  }

  function extractPlannerName() {
    const heading = document.querySelector('h1');
    if (!heading) return null;
    return heading.textContent.trim();
  }

  /**
   * Find the Disclosures section anchor on the page so we can link to it.
   */
  function findDisclosuresAnchor() {
    // The page has a "Disclosures" heading we can link to
    const headings = document.querySelectorAll('h2');
    for (const h of headings) {
      if (h.textContent.trim() === 'Disclosures') {
        // Return an ID or create one
        if (h.id) return `#${h.id}`;
        h.id = 'planner-lens-disclosures-anchor';
        return '#planner-lens-disclosures-anchor';
      }
    }
    // Fallback: the page uses #disclosures in its own nav
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

      // Group disclosures by type with resolution summary
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
        hasIaDisclosures: content.iaDisclosureFlag === 'Y',
        disclosureCount: disclosures.length,
        byType,
        crdNumber,
        brokerCheckUrl: `https://brokercheck.finra.org/individual/summary/${crdNumber}`
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

  // --- UI ---

  function injectBadge(apiResult, disclosuresAnchor) {
    const existing = document.getElementById('planner-lens-badge');
    if (existing) existing.remove();

    if (!apiResult) return;

    const badge = document.createElement('div');
    badge.id = 'planner-lens-badge';

    badge.className = apiResult.hasDisclosures
      ? 'planner-lens-badge planner-lens-warning'
      : 'planner-lens-badge planner-lens-clean';

    // Build FINRA-only summary rows
    let rows = '';

    // FINRA BrokerCheck Disclosures
    if (apiResult.hasDisclosures) {
      const types = Object.entries(apiResult.byType);
      const summaryParts = types.map(([type, items]) => {
        return `<span class="planner-lens-type-line">${type} (${items.length}): ${summarizeType(items)}</span>`;
      });
      rows += `<tr>
        <td class="planner-lens-label">FINRA BrokerCheck Disclosures</td>
        <td class="planner-lens-value planner-lens-flagged">${summaryParts.join('<br>')}</td>
      </tr>`;
    } else {
      rows += `<tr>
        <td class="planner-lens-label">FINRA BrokerCheck Disclosures</td>
        <td class="planner-lens-value planner-lens-none">None</td>
      </tr>`;
    }

    // SEC/IA Disclosures
    const secValue = apiResult.hasIaDisclosures ? 'Yes' : 'None';
    const secClass = apiResult.hasIaDisclosures ? 'flagged' : 'none';
    rows += `<tr>
      <td class="planner-lens-label">SEC Investment Adviser Disclosures</td>
      <td class="planner-lens-value planner-lens-${secClass}">${secValue}</td>
    </tr>`;

    badge.innerHTML = `
      <div class="planner-lens-header">
        <span class="planner-lens-icon">${apiResult.hasDisclosures ? '⚠️' : '✅'}</span>
        <span class="planner-lens-title">FINRA BrokerCheck Summary</span>
      </div>
      <table class="planner-lens-table">
        ${rows}
      </table>
      <div class="planner-lens-footer">
        <a href="${apiResult.brokerCheckUrl}" target="_blank" rel="noopener">View full BrokerCheck report →</a>
        <a href="${disclosuresAnchor}" class="planner-lens-page-link">See CFP Board discipline info below ↓</a>
        <span class="planner-lens-meta">All data from <a href="https://brokercheck.finra.org/" target="_blank" rel="noopener">FINRA BrokerCheck</a> · CRD# ${apiResult.crdNumber} · <a href="https://brokercheck.finra.org/terms" target="_blank" rel="noopener">Terms</a></span>
      </div>
    `;

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
    const loading = document.createElement('div');
    loading.id = 'planner-lens-badge';
    loading.className = 'planner-lens-badge planner-lens-loading';
    loading.textContent = 'Loading FINRA BrokerCheck data…';
    heading.parentNode.insertBefore(loading, heading.nextSibling);
  }

  const apiResult = await queryBrokerCheck(crdNumber);
  injectBadge(apiResult, disclosuresAnchor);
})();

/**
 * Planner Lens — Content Script (v1.1)
 *
 * Fires on LetsMakeAPlan.org CFP profile pages.
 * Combines data from the page DOM (CFP Board discipline) with
 * FINRA BrokerCheck API data to present a unified disclosure summary.
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
   * Extract CFP Board discipline info directly from the page DOM.
   * The page already shows these fields (buried in the Disclosures section):
   *   - CFP Board Public Disciplinary History: None / [details]
   *   - Disclosure Under CFP Board's Prior Bankruptcy Disclosure Procedures: None / [details]
   */
  function extractCfpBoardStatus() {
    const result = {
      discipline: 'Unknown',
      bankruptcy: 'Unknown'
    };

    // Find the headings and their adjacent content
    const headings = document.querySelectorAll('h3');
    for (const h of headings) {
      const text = h.textContent.trim();
      
      if (text.includes('CFP Board Public Disciplinary History')) {
        const next = h.nextElementSibling;
        if (next) result.discipline = next.textContent.trim();
      }
      
      if (text.includes('Bankruptcy Disclosure Procedures')) {
        const next = h.nextElementSibling;
        if (next) result.bankruptcy = next.textContent.trim();
      }
    }

    return result;
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

  /**
   * Build a human-readable summary line for a disclosure type.
   * e.g. "Customer Dispute (6): 1 settled, 4 denied, 1 pending"
   */
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
    // Catch any others
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

  function injectBadge(apiResult, cfpStatus, plannerName) {
    const existing = document.getElementById('planner-lens-badge');
    if (existing) existing.remove();

    if (!apiResult && cfpStatus.discipline === 'Unknown') return;

    const badge = document.createElement('div');
    badge.id = 'planner-lens-badge';

    // Determine overall severity
    const hasAnyConcern = apiResult?.hasDisclosures || 
      (cfpStatus.discipline && cfpStatus.discipline !== 'None');
    
    badge.className = hasAnyConcern
      ? 'planner-lens-badge planner-lens-warning'
      : 'planner-lens-badge planner-lens-clean';

    // Build the Roth-style summary rows
    let rows = '';

    // CFP Board Public Disciplinary History (from DOM)
    const discClass = cfpStatus.discipline === 'None' ? 'none' : 'flagged';
    rows += `<tr>
      <td class="planner-lens-label">CFP Board Public Discipline</td>
      <td class="planner-lens-value planner-lens-${discClass}">${cfpStatus.discipline}</td>
    </tr>`;

    // CFP Board Bankruptcy (from DOM)
    const bankClass = cfpStatus.bankruptcy === 'None' ? 'none' : 'flagged';
    rows += `<tr>
      <td class="planner-lens-label">CFP Board Bankruptcy Disclosure</td>
      <td class="planner-lens-value planner-lens-${bankClass}">${cfpStatus.bankruptcy}</td>
    </tr>`;

    // FINRA BrokerCheck (from API)
    if (apiResult) {
      let finraValue = 'None';
      if (apiResult.hasDisclosures) {
        const types = Object.entries(apiResult.byType);
        const summaryParts = types.map(([type, items]) => {
          return `${type} (${items.length}): ${summarizeType(items)}`;
        });
        finraValue = summaryParts.join('<br>');
      }
      const finraClass = apiResult.hasDisclosures ? 'flagged' : 'none';
      rows += `<tr>
        <td class="planner-lens-label">FINRA BrokerCheck Disclosures</td>
        <td class="planner-lens-value planner-lens-${finraClass}">${finraValue}</td>
      </tr>`;

      // SEC/IA
      const secValue = apiResult.hasIaDisclosures ? 'Yes' : 'None';
      const secClass = apiResult.hasIaDisclosures ? 'flagged' : 'none';
      rows += `<tr>
        <td class="planner-lens-label">SEC Investment Adviser Disclosures</td>
        <td class="planner-lens-value planner-lens-${secClass}">${secValue}</td>
      </tr>`;
    }

    const brokerCheckLink = apiResult
      ? `<a href="${apiResult.brokerCheckUrl}" target="_blank" rel="noopener">View full BrokerCheck report →</a>`
      : '';

    badge.innerHTML = `
      <div class="planner-lens-header">
        <span class="planner-lens-icon">${hasAnyConcern ? '⚠️' : '✅'}</span>
        <span class="planner-lens-title">Disclosure Summary</span>
      </div>
      <table class="planner-lens-table">
        ${rows}
      </table>
      <div class="planner-lens-footer">
        ${brokerCheckLink}
        <span class="planner-lens-meta">Source: <a href="https://brokercheck.finra.org/" target="_blank" rel="noopener">FINRA BrokerCheck</a>${apiResult ? ` · CRD# ${apiResult.crdNumber}` : ''} · <a href="https://brokercheck.finra.org/terms" target="_blank" rel="noopener">Terms</a></span>
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
  const plannerName = extractPlannerName();
  const cfpStatus = extractCfpBoardStatus();

  if (!crdNumber) {
    console.log('[Planner Lens] No BrokerCheck link found on page.');
    // Still show CFP Board data if available
    if (cfpStatus.discipline !== 'Unknown') {
      injectBadge(null, cfpStatus, plannerName);
    }
    return;
  }

  console.log(`[Planner Lens] Checking CRD# ${crdNumber}`);

  // Loading indicator
  const heading = document.querySelector('h1');
  if (heading && heading.parentNode) {
    const loading = document.createElement('div');
    loading.id = 'planner-lens-badge';
    loading.className = 'planner-lens-badge planner-lens-loading';
    loading.textContent = 'Loading disclosure summary…';
    heading.parentNode.insertBefore(loading, heading.nextSibling);
  }

  const apiResult = await queryBrokerCheck(crdNumber);
  injectBadge(apiResult, cfpStatus, plannerName);
})();

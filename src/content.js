/**
 * CFP Check — Content Script (v1)
 *
 * Fires on LetsMakeAPlan.org CFP profile pages.
 * Extracts the CRD number from the page's own BrokerCheck link,
 * queries FINRA BrokerCheck to check for disclosures,
 * and injects a short alert with a link to the full report.
 */

(async function cfpCheck() {
  'use strict';

  // --- Config ---
  const BROKERCHECK_API = 'https://api.brokercheck.finra.org/search/individual';

  // --- DOM Extraction ---

  /**
   * Extract CRD number from the page's BrokerCheck link.
   * Profile pages include: https://brokercheck.finra.org/individual/summary/{CRD}
   */
  function extractCrdNumber() {
    const links = document.querySelectorAll('a[href*="brokercheck.finra.org/individual"]');
    for (const link of links) {
      const match = link.href.match(/\/individual\/summary\/(\d+)/);
      if (match) return match[1];
    }
    return null;
  }

  /**
   * Extract planner name from the h1 heading.
   */
  function extractPlannerName() {
    const heading = document.querySelector('h1');
    if (!heading) return null;
    return heading.textContent.trim()
      .replace(/^(Mr\.|Mrs\.|Ms\.|Dr\.)\s*/i, '')
      .replace(/,?\s*(CFP®?|CFA|ChFC|CLU|CPA|JD|PhD|MBA).*/gi, '')
      .trim();
  }

  // --- BrokerCheck API ---

  /**
   * Query BrokerCheck detail endpoint by CRD number.
   * Returns { hasDisclosures, disclosureCount, url } or null on error.
   */
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

      return {
        hasDisclosures: content.disclosureFlag === 'Y',
        disclosureCount: disclosures.length,
        crdNumber,
        brokerCheckUrl: `https://brokercheck.finra.org/individual/summary/${crdNumber}`
      };
    } catch (err) {
      console.error('[CFP Check] API error:', err);
      return null;
    }
  }

  // --- UI ---

  function injectBadge(result) {
    const existing = document.getElementById('cfp-check-badge');
    if (existing) existing.remove();

    const badge = document.createElement('div');
    badge.id = 'cfp-check-badge';

    if (!result) {
      // API error or not found — don't show anything
      return;
    }

    if (result.hasDisclosures) {
      badge.className = 'cfp-check-badge cfp-check-warning';
      badge.innerHTML = `
        <span class="cfp-check-icon">⚠️</span>
        <div class="cfp-check-content">
          <div class="cfp-check-headline">${result.disclosureCount} disclosure${result.disclosureCount !== 1 ? 's' : ''} found</div>
          <div class="cfp-check-detail"><a href="${result.brokerCheckUrl}" target="_blank" rel="noopener">View full BrokerCheck report →</a></div>
          <div class="cfp-check-meta">Source: <a href="https://brokercheck.finra.org/" target="_blank" rel="noopener">FINRA BrokerCheck</a> · CRD# ${result.crdNumber} · <a href="https://brokercheck.finra.org/terms" target="_blank" rel="noopener">Terms of Use</a></div>
        </div>
      `;
    } else {
      badge.className = 'cfp-check-badge cfp-check-clean';
      badge.innerHTML = `
        <span class="cfp-check-icon">✅</span>
        <div class="cfp-check-content">
          <div class="cfp-check-headline">No disclosures found</div>
          <div class="cfp-check-detail"><a href="${result.brokerCheckUrl}" target="_blank" rel="noopener">View BrokerCheck profile</a></div>
          <div class="cfp-check-meta">Source: <a href="https://brokercheck.finra.org/" target="_blank" rel="noopener">FINRA BrokerCheck</a> · CRD# ${result.crdNumber} · <a href="https://brokercheck.finra.org/terms" target="_blank" rel="noopener">Terms of Use</a></div>
        </div>
      `;
    }

    const heading = document.querySelector('h1');
    if (heading && heading.parentNode) {
      heading.parentNode.insertBefore(badge, heading.nextSibling);
    }
  }

  // --- Main ---

  // Brief delay for dynamic content
  await new Promise(resolve => setTimeout(resolve, 500));

  const crdNumber = extractCrdNumber();
  if (!crdNumber) {
    console.log('[CFP Check] No BrokerCheck link found on page — skipping.');
    return;
  }

  console.log(`[CFP Check] Checking CRD# ${crdNumber}`);

  // Loading indicator
  const heading = document.querySelector('h1');
  if (heading && heading.parentNode) {
    const loading = document.createElement('div');
    loading.id = 'cfp-check-badge';
    loading.className = 'cfp-check-badge cfp-check-loading';
    loading.textContent = 'Checking FINRA BrokerCheck…';
    heading.parentNode.insertBefore(loading, heading.nextSibling);
  }

  const result = await queryBrokerCheck(crdNumber);
  injectBadge(result);
})();

/**
 * CFP Check — Content Script
 *
 * Fires on LetsMakeAPlan.org CFP profile pages.
 * Extracts the CRD number from the page's own BrokerCheck link,
 * queries FINRA BrokerCheck's public API, and injects a prominent
 * disclosure badge near the planner's name.
 */

(async function cfpCheck() {
  'use strict';

  // --- DOM Extraction ---

  /**
   * Extract the planner's CRD number from the BrokerCheck link on the page.
   * The profile page includes a link like:
   *   https://brokercheck.finra.org/individual/summary/4878856
   * Returns the CRD number string, or null if not found.
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
   * Extract the planner's name from the h1 heading.
   * Format: "Mr. Andrew Carman, CFP®" or "Jane Doe, CFP®"
   */
  function extractPlannerName() {
    const heading = document.querySelector('h1');
    if (!heading) return null;

    const text = heading.textContent.trim();
    // Remove title prefixes and CFP/credential suffixes
    return text
      .replace(/^(Mr\.|Mrs\.|Ms\.|Dr\.)\s*/i, '')
      .replace(/,?\s*(CFP®?|CFA|ChFC|CLU|CPA|JD|PhD|MBA|MS|RICP|AIF|CDFA).*/gi, '')
      .trim();
  }

  /**
   * Extract firm name from the profile card.
   * It appears as text content after the h1, before the website link.
   */
  function extractFirmName() {
    // The firm name is a text node in the profile header area
    const heading = document.querySelector('h1');
    if (!heading || !heading.parentElement) return null;

    // Walk sibling text nodes
    const parent = heading.parentElement;
    const walker = document.createTreeWalker(parent, NodeFilter.SHOW_TEXT);
    let node;
    let foundHeading = false;
    while ((node = walker.nextNode())) {
      if (heading.contains(node)) {
        foundHeading = true;
        continue;
      }
      if (foundHeading) {
        const text = node.textContent.trim();
        if (text && text.length > 2 && !text.startsWith('http')) {
          return text;
        }
      }
    }
    return null;
  }

  // --- BrokerCheck API ---

  const BROKERCHECK_SEARCH_URL = 'https://api.brokercheck.finra.org/search/individual';

  /**
   * Query BrokerCheck by CRD number to get disclosure status.
   * Using CRD is deterministic — no fuzzy matching needed.
   */
  async function queryBrokerCheck(crdNumber) {
    const params = new URLSearchParams({
      query: crdNumber,
      hl: 'true',
      nrows: '1',
      start: '0',
      r: '25',
      sort: 'score+desc',
      wt: 'json'
    });

    const url = `${BROKERCHECK_SEARCH_URL}?${params}`;

    try {
      const response = await fetch(url);
      if (!response.ok) {
        console.error('[CFP Check] BrokerCheck API error:', response.status);
        return null;
      }

      const data = await response.json();
      const hits = data?.hits?.hits || [];
      if (hits.length === 0) return null;

      // Find exact CRD match
      const match = hits.find(hit => {
        const source = hit._source || {};
        return source.ind_source_id === crdNumber;
      }) || hits[0];

      const source = match._source || {};
      return {
        crdNumber: source.ind_source_id,
        firstName: source.ind_firstname,
        lastName: source.ind_lastname,
        firmName: source.ind_current_employments?.[0]?.firm_name || '',
        hasDisclosures: source.ind_bc_disclosure_fl === 'Y',
        brokerCheckUrl: `https://brokercheck.finra.org/individual/summary/${source.ind_source_id}`
      };
    } catch (err) {
      console.error('[CFP Check] Fetch error:', err);
      return null;
    }
  }

  // --- UI Injection ---

  /**
   * Inject the disclosure badge into the page, directly below the planner's name.
   */
  function injectBadge(result, plannerName) {
    // Remove any existing badge (in case of SPA navigation)
    const existing = document.getElementById('cfp-check-badge');
    if (existing) existing.remove();

    const badge = document.createElement('div');
    badge.id = 'cfp-check-badge';

    if (result === null) {
      badge.className = 'cfp-check-badge cfp-check-not-found';
      badge.innerHTML = `
        <span class="cfp-check-icon">❓</span>
        <span class="cfp-check-text">
          Could not verify on <a href="https://brokercheck.finra.org/" target="_blank" rel="noopener">FINRA BrokerCheck</a>
        </span>
        <span class="cfp-check-source">Data source: FINRA BrokerCheck | <a href="https://brokercheck.finra.org/terms" target="_blank" rel="noopener">Terms of Use</a></span>
      `;
    } else if (result.hasDisclosures) {
      badge.className = 'cfp-check-badge cfp-check-warning';
      badge.innerHTML = `
        <span class="cfp-check-icon">⚠️</span>
        <span class="cfp-check-text">
          <strong>Disclosures found</strong> on FINRA BrokerCheck
          — <a href="${result.brokerCheckUrl}" target="_blank" rel="noopener">View full report →</a>
        </span>
        <span class="cfp-check-source">CRD# ${result.crdNumber} | Data source: <a href="https://brokercheck.finra.org/" target="_blank" rel="noopener">FINRA BrokerCheck</a> | <a href="https://brokercheck.finra.org/terms" target="_blank" rel="noopener">Terms of Use</a></span>
      `;
    } else {
      badge.className = 'cfp-check-badge cfp-check-clean';
      badge.innerHTML = `
        <span class="cfp-check-icon">✅</span>
        <span class="cfp-check-text">
          No disclosures found on <a href="${result.brokerCheckUrl}" target="_blank" rel="noopener">FINRA BrokerCheck</a>
        </span>
        <span class="cfp-check-source">CRD# ${result.crdNumber} | Data source: <a href="https://brokercheck.finra.org/" target="_blank" rel="noopener">FINRA BrokerCheck</a> | <a href="https://brokercheck.finra.org/terms" target="_blank" rel="noopener">Terms of Use</a></span>
      `;
    }

    // Insert after the h1 heading in the profile card
    const heading = document.querySelector('h1');
    if (heading && heading.parentNode) {
      heading.parentNode.insertBefore(badge, heading.nextSibling);
    } else {
      // Fallback: prepend to main content
      const main = document.querySelector('main') || document.body;
      main.prepend(badge);
    }
  }

  // --- Main ---

  // Wait briefly for any dynamic content to render
  await new Promise(resolve => setTimeout(resolve, 500));

  const crdNumber = extractCrdNumber();
  const plannerName = extractPlannerName();

  if (!crdNumber) {
    // No BrokerCheck link on page — planner may not be FINRA/SEC regulated
    // Fall back to name-based search if we have a name
    if (plannerName) {
      console.log(`[CFP Check] No CRD link found. Planner "${plannerName}" may not be FINRA-registered.`);
      // Could do a name-based search here as fallback, but for v1 we skip
      // to avoid false positives from name collisions
    }
    return;
  }

  console.log(`[CFP Check] Found CRD# ${crdNumber} for "${plannerName || 'unknown'}"`);

  // Show loading state
  const heading = document.querySelector('h1');
  if (heading && heading.parentNode) {
    const loading = document.createElement('div');
    loading.id = 'cfp-check-badge';
    loading.className = 'cfp-check-badge cfp-check-loading';
    loading.innerHTML = '<span class="cfp-check-text">Checking FINRA BrokerCheck...</span>';
    heading.parentNode.insertBefore(loading, heading.nextSibling);
  }

  const result = await queryBrokerCheck(crdNumber);
  injectBadge(result, plannerName);
})();

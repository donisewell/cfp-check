/**
 * CFP Check — Content Script
 *
 * Fires on LetsMakeAPlan.org CFP profile pages.
 * Reads the planner's name from the DOM, queries FINRA BrokerCheck,
 * and injects a disclosure badge.
 */

(async function cfpCheck() {
  'use strict';

  // --- DOM Extraction ---

  /**
   * Extract the planner's name from the profile page.
   * Returns { firstName, lastName } or null if not found.
   */
  function extractPlannerName() {
    // The profile page renders the name in an h1 or prominent heading
    // Selector may need updating if CFP Board redesigns the page
    const heading = document.querySelector('h1.profile-name, h1, [data-testid="planner-name"]');
    if (!heading) return null;

    const fullName = heading.textContent.trim();
    if (!fullName) return null;

    // Remove suffixes like "CFP®", "CFA", etc.
    const cleaned = fullName.replace(/,?\s*(CFP®?|CFA|ChFC|CLU|CPA|JD|PhD|MBA|MS|RICP|AIF|CDFA)/gi, '').trim();
    const parts = cleaned.split(/\s+/);
    if (parts.length < 2) return null;

    return {
      firstName: parts[0],
      lastName: parts[parts.length - 1],
      fullName: cleaned
    };
  }

  // --- BrokerCheck API ---

  const BROKERCHECK_SEARCH_URL = 'https://api.brokercheck.finra.org/search/individual';

  /**
   * Query BrokerCheck for an individual by name.
   * Returns the top match with disclosure info, or null.
   */
  async function queryBrokerCheck(firstName, lastName) {
    const query = `${firstName} ${lastName}`;
    const params = new URLSearchParams({
      query,
      filter: 'active=true',
      hl: 'true',
      nrows: '5',
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

      // Find best match — exact name match preferred
      const match = hits.find(hit => {
        const source = hit._source || {};
        const fn = (source.ind_firstname || '').toLowerCase();
        const ln = (source.ind_lastname || '').toLowerCase();
        return fn === firstName.toLowerCase() && ln === lastName.toLowerCase();
      }) || hits[0];

      const source = match._source || {};
      return {
        crdNumber: source.ind_source_id,
        firstName: source.ind_firstname,
        lastName: source.ind_lastname,
        firmName: source.ind_current_employer || '',
        disclosureCount: source.ind_bc_disclosure_fl === 'Y'
          ? (source.ind_bc_disclosure_cnt || 1)
          : 0,
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
   * Inject the disclosure badge into the page.
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
          Not found on <a href="https://brokercheck.finra.org/" target="_blank" rel="noopener">BrokerCheck</a>
        </span>
      `;
    } else if (result.hasDisclosures) {
      badge.className = 'cfp-check-badge cfp-check-warning';
      badge.innerHTML = `
        <span class="cfp-check-icon">⚠️</span>
        <span class="cfp-check-text">
          <strong>${result.disclosureCount} disclosure${result.disclosureCount !== 1 ? 's' : ''}</strong> on FINRA BrokerCheck
          — <a href="${result.brokerCheckUrl}" target="_blank" rel="noopener">View full report</a>
        </span>
        <span class="cfp-check-source">Source: FINRA BrokerCheck (CRD# ${result.crdNumber})</span>
      `;
    } else {
      badge.className = 'cfp-check-badge cfp-check-clean';
      badge.innerHTML = `
        <span class="cfp-check-icon">✅</span>
        <span class="cfp-check-text">
          No disclosures on <a href="${result.brokerCheckUrl}" target="_blank" rel="noopener">FINRA BrokerCheck</a>
        </span>
        <span class="cfp-check-source">CRD# ${result.crdNumber}</span>
      `;
    }

    // Insert after the heading or at the top of the profile
    const heading = document.querySelector('h1.profile-name, h1, [data-testid="planner-name"]');
    if (heading && heading.parentNode) {
      heading.parentNode.insertBefore(badge, heading.nextSibling);
    } else {
      document.body.prepend(badge);
    }
  }

  // --- Main ---

  const planner = extractPlannerName();
  if (!planner) {
    console.log('[CFP Check] Could not extract planner name from page');
    return;
  }

  console.log(`[CFP Check] Looking up: ${planner.fullName}`);

  // Show loading state
  const loadingBadge = document.createElement('div');
  loadingBadge.id = 'cfp-check-badge';
  loadingBadge.className = 'cfp-check-badge cfp-check-loading';
  loadingBadge.innerHTML = '<span class="cfp-check-text">Checking FINRA BrokerCheck...</span>';
  const heading = document.querySelector('h1.profile-name, h1, [data-testid="planner-name"]');
  if (heading && heading.parentNode) {
    heading.parentNode.insertBefore(loadingBadge, heading.nextSibling);
  }

  const result = await queryBrokerCheck(planner.firstName, planner.lastName);
  injectBadge(result, planner.fullName);
})();

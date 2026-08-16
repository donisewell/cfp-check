# Privacy Policy

**Planner Lens** is a browser extension that queries publicly available data from FINRA BrokerCheck.

## Data Collection

Planner Lens does **not** collect, store, or transmit any personal data. Specifically:

- No user accounts or sign-ins
- No analytics or tracking
- No cookies
- No data sent to any server operated by this extension's developer
- No browsing history recorded

## Network Requests

When you visit a financial planner's profile on LetsMakeAPlan.org, the extension makes a single API request to FINRA's public BrokerCheck service (`api.brokercheck.finra.org`) to retrieve disclosure information for the planner shown on that page. This request contains only the planner's CRD number (already present on the page you are viewing). No information about you is included in this request.

## Permissions

- **Host permission for `api.brokercheck.finra.org`**: Required to query FINRA's public BrokerCheck API.
- **Content script on `letsmakeaplan.org` profile pages**: Required to read the planner's CRD number from the page and display disclosure information.

No other permissions are requested.

## Third Parties

The only third-party service contacted is FINRA BrokerCheck (`brokercheck.finra.org`), a free public tool operated by the Financial Industry Regulatory Authority. FINRA's own privacy policy governs their handling of API requests: [https://www.finra.org/privacy-policy](https://www.finra.org/privacy-policy)

## Changes

If this privacy policy changes, the updated version will be posted at this URL.

## Contact

Questions about this privacy policy can be directed to the project's GitHub Issues page: [https://github.com/donisewell/planner-lens/issues](https://github.com/donisewell/planner-lens/issues)

---

*Last updated: August 16, 2026*

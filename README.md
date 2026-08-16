# CFP Check

Browser extension that overlays FINRA BrokerCheck disclosure data on [LetsMakeAPlan.org](https://www.letsmakeaplan.org/) CFP® professional profiles.

## What it does

When you visit a CFP® professional's profile on LetsMakeAPlan.org, this extension automatically:

1. Extracts the CRD number from the page's existing BrokerCheck link (deterministic — no fuzzy name matching)
2. Queries FINRA's public BrokerCheck API for disclosure details
3. Displays a prominent badge showing disclosure count
4. Links directly to the full BrokerCheck report

## Why

The CFP Board's directory presents planners without surfacing disciplinary history available in public regulatory databases. This extension bridges that gap — no scraping, no stored data, just real-time lookups against FINRA's public API while you browse.

## Install

### Firefox
TBD — will be published on [Firefox Add-ons](https://addons.mozilla.org/)

### Chrome
TBD — will be published on [Chrome Web Store](https://chromewebstore.google.com/)

### From source (development)
1. Clone this repo
2. **Firefox:** Open `about:debugging` → "This Firefox" → "Load Temporary Add-on" → select `src/manifest.json`
3. **Chrome:** Open `chrome://extensions` → Enable "Developer mode" → "Load unpacked" → select `src/`

## Architecture

- **Manifest V3** — single codebase targeting both Chrome and Firefox
- **Content script** — fires on `letsmakeaplan.org/find-a-cfp-professional/certified-professional-profile/*`
- **CRD-based matching** — extracts the CRD number from the page's own BrokerCheck link (no name guessing)
- **No backend** — queries BrokerCheck's public detail API directly
- **No data storage** — all lookups are real-time, nothing cached

## Legal basis

FINRA's [BrokerCheck Permitted Uses](https://www.finra.org/investors/investing/working-with-investment-professional/about-brokercheck/permitted-uses) explicitly allows copying and compiling BrokerCheck data for investor protection purposes, including redistribution with attribution.

## License

MIT

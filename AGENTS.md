# Portfolio Analytics — context for Codex

## Where this came from (2026-11-01)

The user wrote `spec/portfolio-analytics-requirements.html` (interface spec v1,
modelled on Venn by Two Sigma) and first discussed it inside the proposal-tool
project (`~/repo/proposal-tool`). It was split out because:

- It is **independent of the Proposal Tool**. Both will be hosted in the same
  internal platform (Poros); nothing else is shared.
- The spec needs **live analytics**: recalculation on every weight edit,
  sleeve-level return/risk contributions, factor exposures, history and
  backtests, projections with bands, and scenario reruns with overridden
  assumptions and correlations. The Proposal Tool forbids live computation
  (its decision D126: figures come only from an offline bake supplied by
  epsilon-phi). **That rule does not apply here.**

## Scope (decided 2026-11-01)

Front end only: design, layout and functionality. Where the analytics engine
comes from is undecided and is out of scope. Assume a service behind a
defined interface and use mock data. Don't raise backend questions unless
the user asks for them.

## Working with this user

- Never say "book" in writing to the user ("workbook" is fine).
- In repo text and commits, refer to the host system as **Poros**, never
  "Cyrus". Code bound for the host must read as the host's own (no decision
  numbers or spec/test references in ported files).
- The Venn name and screenshots (`reference/venn/`, `spec/`) are fine locally;
  they may need removing before anything goes to the host.
- Plans and design options are written as self-contained HTML pages.
- Kill any headless Chrome left over from a check: a stray one stops the user
  opening their own Chrome on macOS.

## Repo

- `workspace/` — the working mockup (plain HTML/CSS/JS, no build). Open
  `workspace/index.html`; `node workspace/verify-workspace.mjs` runs the
  headless-Chrome checks and refreshes `workspace/screenshots/`. The UI only
  talks to `PA.api` (`workspace/js/api.js`); the mock engine and data sit
  behind it. Design tokens and fonts are copied from the Proposal Tool.
  Since 2026-11-01 (second iteration): the rail is portfolio → category →
  product with index-level modelling; "sleeve" means a saved, versioned
  subset of a portfolio in a shared repository (`#/sleeves`); the analytics
  area is a free-form grid of cards from a card repository. The spec in
  `spec/` (version 2, 2026-11-02) describes this iteration, embeds the
  mockup in an iframe and inlines `workspace/screenshots/` at build time,
  so run the workspace checks before `build-document.mjs`.
- `spec/` — the built spec plus its sources; `cd spec && node build-document.mjs`
  rebuilds it, `verify-document.mjs` checks it.
- `reference/venn/` — reference screenshots.
- Remote: https://github.com/fabarker/portfolio-analytics-ui.git (branch main).

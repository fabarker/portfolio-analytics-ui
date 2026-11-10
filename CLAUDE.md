# Portfolio Analytics — context for Claude

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
  mockup in an iframe and inlines `workspace/screenshots/` at build time
  (twenty of them, listed in `build-document.mjs`),
  so run the workspace checks before `build-document.mjs`.
- `spec/` — the built spec plus its sources; `cd spec && node build-document.mjs`
  rebuilds it, `verify-document.mjs` checks it.
- `design/` — self-contained design-option pages: `rail-alternatives.html`
  (ten rail layouts; option 4, the tabbed rail, was chosen) and
  `rail-colours.html` (ten rail colourings; 9, Split, was chosen),
  `factor-models-active-risk.html` (built) and `workspace-clarity.html`
  (the clarity plan: say it once, tag the exception, quiet until needed;
  built 2026-11-02 with its eight defaults),
  and `rail-benchmarks-cards.html` (built 2026-11-03 with sample 1, elbow
  guides, instead of the recommended 2, and the other nine defaults: quick
  add, preset/custom benchmarks and the benchmark library `#/benchmarks`,
  no Basis toggle (per-card bases, dual-basis Headline, 34-entry catalogue, now 37),
  required reporting currency). Added the same day at the user's request:
  ISG's eleven factors and Axioma's seventeen, and waterfall views for every
  contribution measure. Also 2026-11-03 (built directly, no design page): the
  rail's Add tab became **Optimize** (mean-variance: min vol for a target
  return, max return for a target vol, or return vs tracking error to the
  allocation's benchmark; `/` now opens quick add across every category);
  Active risk & return attributes risk and return by factor, category, asset
  class or product; products can be added by pasting an Excel range of returns
  (dates, one column per product, names in the header) and appear in a new
  **product directory** (`#/products`) with forward and historical analytics.
  Later on 2026-11-03 (design page `drivers-differences-alternatives.html`,
  options 1 and 4 chosen): Drivers & Differences shows measures by product
  (tree) or by factor (rows, largest eight first), with a Table or Focus view;
  contribution charts open as waterfalls; Factor exposures uses horizontal
  bars; a new Factors over time heat-map card.
  Then: every workspace opens with two cards, Headline and Allocations side
  by side; Headline shows total/excess/passive/active return, risk/passive/
  active risk, tracking error, Sharpe, IR and 99% VaR (1d/1w/1m/1y),
  forward (factor-based) and historical. Ten Headline layouts are in
  `design/headline-alternatives.html`; on 2026-11-04 the user chose option 1
  (measures as rows, Fwd/Hist per allocation) with option 8 (Focus: one
  allocation in full, the others as differences) as the card's second view.
  `design/spec-restructure.html` is the formal, capability-led product
  specification (17 chapters), kept alongside the built spec.
  2026-11-05 (built directly, no design page): **index-level weight is
  removed**; a category's weight is always the sum of its holdings (editing a
  product changes the category; editing a category rescales its holdings pro
  rata). Categories are **workspace-wide** (`ws.categories`) and can be added,
  renamed, reordered (drag grip, Alt+↑/↓, menu) and deleted when empty; the
  seven standard ones stay as the taxonomy (`D.taxonomy`) for asset classes,
  products, sleeves and scenarios. Holdings carry `categoryId`; stored
  remainders migrate to explicit index-basket holdings on load.
  Also 2026-11-05: **Weights side by side** card (categories with their
  products on shared rows, one column per allocation, weights only; catalogue
  now 36), and **a category on its own**: selecting a category in the rail
  adds it to the analysis as a temporary portfolio rescaled to 100%
  (`S.standalone()`/`S.analysed()`, session only, ends on another selection,
  Esc or its close button).
  2026-11-06: the **decision chain** from `design/attribution-framework.html`
  was built with its recommended defaults (all four phases; the separate
  currency effect is listed but disabled, needing local-currency returns):
  `Allocation.chain` (policy benchmark, SAA, product-benchmark mapping, order,
  implementation step), the chain dialog, Check-tab items, derived levels as
  temporary members (`S.levels()`, `prefs.showLevels`), the Decision chain
  card (Bridge, Levels, Steps, Lens, Reconcile, Over time; catalogue now 37),
  a chain step in seven existing cards, vs = policy benchmark, workspace
  attribution conventions with a fee basis, Optimize tracking error to the
  policy or SAA, and `POST /analytics/chain` (`js/chain.js` is the mock).
  2026-11-10: the **decision chain redesign** from
  `design/decision-chain-redesign.html` was built. On screen the stages are
  **Policy benchmark, SAA, Manager/Product benchmark, Manager/Product** (the
  user's names); each decision takes the name of the stage it arrives at and
  the three together are "All decisions". Codes (L0–L3, S1–S3) stay in the
  data and never show. One **Benchmarks** dialog (`UI.chain.open`, four rows:
  benchmark, SAA, product benchmarks, method) replaces Assign benchmark and
  the chain dialog. An allocation has one benchmark; attributing against a
  different one is a tagged exception. The SAA can be typed weights
  (`chain.saa = {kind:'weights', weights, indices}`); when not set, today's
  category weights stand in, tagged "Not set". The card has three views
  (Summary, Breakdown, Over time) with its checks behind a header chip;
  Brinson columns read "From weights" / "From returns". The 6 November entry
  above describes the earlier names and views.
  `ONLY=<step name> node workspace/verify-workspace.mjs` runs one step.
- `reference/venn/` — reference screenshots.
- Remote: https://github.com/fabarker/portfolio-analytics-ui.git (branch main).

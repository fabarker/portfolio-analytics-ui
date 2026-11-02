# Portfolio Analytics

A workspace for building, testing and comparing multi-asset allocations.
The allocation is a tree of portfolio → category → product, with each
category modelled at index level until products implement it. Sleeves save
reusable subsets of products in a shared, versioned repository. The analysis
is a collection of cards from a card repository around one Drivers &
Differences table, with a scenario drawer for capital-market assumptions.
It shows analytics, never recommendations or trades.

It is a product in its own right. It shares a host (Poros) with the Proposal
Tool but no code, data or decisions with it.

## Layout

- `workspace/index.html` — the working mockup: plain HTML, CSS and
  JavaScript on realistic mock data, every primary flow clickable. Open it
  in a browser; `workspace/README.md` explains the data layer and the
  handoff to a backend. `node workspace/verify-workspace.mjs` runs its
  headless-Chrome checks and refreshes `workspace/screenshots/`.
- `spec/portfolio-analytics-requirements.html` — the interface specification
  (version 2, 2 November 2026). It embeds the mockup and its screenshots and
  carries the smaller teaching examples. Open it in a browser from the
  repository so the embedded mockup can load.
- `spec/` — the sources it is built from. Edit the section files, then
  `cd spec && node build-document.mjs`; `node verify-document.mjs` checks the
  result. Build after refreshing the mockup screenshots.
- `reference/` — screenshots of reference products, for design discussion only.

## Open before anything is built

The specification covers the front end. The figures it shows (contributions,
factor exposures, history and backtests, projections, scenario reruns) need an
analytics service that takes arbitrary weights, category targets and scenario
overrides. Where that service comes from is the first decision. The mockup's
data-access contract (`workspace/README.md`) lists every call the interface
makes. See "Decisions to finalize" in the specification.

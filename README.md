# Portfolio Analytics

A workspace for building, testing and comparing multi-asset allocations:
an editable sleeve tree beside one Drivers & Differences table, a scenario
drawer for capital-market assumptions, and a chart that follows the selected
row. It shows analytics, never recommendations or trades.

It is a product in its own right. It shares a host with the Proposal Tool but
no code, data or decisions with it.

## Layout

- `spec/portfolio-analytics-requirements.html` — the interface specification
  (version 1, 1 November 2026), self-contained with interactive examples.
  Open it in a browser.
- `spec/` — the sources it is built from. Edit the section files, then
  `cd spec && node build-document.mjs`; `verify-document.mjs` checks the result.
- `reference/` — screenshots of reference products, for design discussion only.

## Open before anything is built

The specification covers the front end. The figures it shows (contributions,
factor exposures, history and backtests, projections, scenario reruns) need an
analytics service that takes arbitrary weights. Where that service comes from
is the first decision. See "Decisions to finalize" in the specification.

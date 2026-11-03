# Portfolio Analytics · workspace mockup

A working mockup of the Portfolio Analytics workspace in plain HTML, CSS and
JavaScript. No framework, no build step. It implements the interface
specification in `../spec/` with realistic (fictional) data, so every primary
flow can be clicked through end to end: workspaces, the portfolio builder,
sleeves and the sleeve repository, the card workspace and the card
repository, the scenario drawer, snapshots, versions and export.

## Run it

Open `index.html` in a browser. That is all. It also works from any static
host:

```
cd workspace && python3 -m http.server 8080
# then http://localhost:8080/
```

Edits are kept in the browser's `localStorage` so a demo survives a reload.
**Demo controls** (the sliders icon in the header menu, or on the workspace
list) simulate save failures, analytics failures and a slow service, and reset
the sample data.

Keyboard: `/` opens the builder's Add tab with the search focused, `b` collapses the builder, `s`
opens the scenario drawer, `a` opens the card repository, `⌘Z` / `⇧⌘Z` undo
and redo, arrow keys move a focused card (with `⇧`, resize it), `?` lists the
rest.

## The builder rail

The rail is split: the header and tabs are navy, the panel below them is
white so the tree reads like the cards (its colours are `--rail-*` tokens in
`css/tokens.css`, redefined for the panel under "Split rail" in
`css/workspace.css`). The rail has no brand heading. Its header names the allocation being edited
(a selector with a ⋮ menu beside it: select products for a sleeve, expand or
collapse every category, rename, assign a benchmark, snapshot). Under the name
it says only what is not the default: a snapshot or sleeve tag, *Backtest* or
*Edited*, and the benchmark, or *No benchmark* as a warning. Four tabs split
the rail's jobs so each gets the full height:

- **Build**: the category tree below, with select mode for sleeves. Each
  category sits under a faint silver rule (`--rail-sep`), marked by its colour
  tile, with its target in bold. Its products are leaves: indented past the
  category's name and joined to it by elbow guides (`--rail-guide`) that stop
  at the last leaf. A second
  line appears only for an exception (*2.0% at index level*, products over
  target, a sleeve tag) or, when collapsed, the product count. A product is a
  line: its name, its share of the category (the full wording in the tooltip)
  and its weight. Type and identifier show when the rail is dragged to 420px
  or wider. Weights read as figures and turn into inputs on hover or focus.
  Weights are typed: no stepper buttons. A typed value is marked pending until
  `Enter` applies it (one edit, one recalculation); `Esc` discards it, `↑`/`↓`
  move between weights, and pending values survive leaving the field.
  **Quick add:** the + on every category row (or `+`/`Insert` on a focused
  category) adds an empty leaf with a search into the product library, limited
  to that category with *Search all categories* one click away. Choosing a
  product moves to its weight, prefilled with the category's index-level
  remainder; `Enter` adds it in one edit (a product from another category is
  filed there, and a target rises if the products need it), `Esc` removes the
  row and returns focus to the +.
- **Add**: investment search with category filter chips. A chip on its own
  browses that category; results say when a product is already held.
- **Sleeves**: the repository in the rail, grouped by category, with *Apply*
  (opens the apply dialog for the sleeve's category), *Compare* (adds it as a
  column) and a link to the repository screen. Tags show where a sleeve is
  applied or compared.
- **Check**: what needs attention, each with its fix: unallocated weight,
  categories at index level (*Find products*, *Apply a sleeve*), products over
  target, limited histories, a missing benchmark. The count is the tab's
  badge. The weight summary and the shorts & leverage switch live here too.

A footer under every tab keeps the category bar (solid in products, hatched at
index level) and the allocated total in view, with the unallocated or borrowed
amount when there is one. Collapsed, the rail keeps the
four tab icons (with the badge); each opens the rail on its tab. On a phone the
rail is an overlay with the same tabs.

## Factor models and active risk

**Two factor models, one switch.** ISG has eleven factors: Equity, Term,
Liquidity, Funding, FX, EM, Dollar, Size, Value, Commodities and Momentum.
Axioma has the same eleven, under the same ids, plus Credit, Short Volatility,
Quality, Carry, Local Inflation and Local Equity. *Factor model* in the context bar (ISG ·
Axioma) sets the risk model for every card that uses one: Factor exposures,
the Factors metric of Drivers & Differences, the factor view of Risk by
category, Active risk & return and Headline. The control shows only when such
a card is in the workspace; its tooltip counts pinned cards. A card that
follows the workspace names no model (the bar does). The card menu pins it to
a model, unpins it, adds a copy pinned to the other model beside it (*Compare
with …*), and describes the model and its coverage; a pinned card shows a model
chip in its header and says so in its subtitle. Only cards that follow the
switch refetch. A card keeps one
factor pick per model; with none for a model, the other model's pick carries
over (Axioma's own six have no ISG counterpart, and the card says which were left out). Axioma does not
cover privately valued funds: they take their category index's loadings, and
the card and the rail's Check tab say so. The platform assumptions remain the
return model; factor-model risk does not change with a scenario.

**Active risk & return** (Risk group) splits each compared allocation, or the
selected row of each, into passive (its benchmark) and active: return,
passive, active; risk, passive, tracking error; information ratio; active
share on the asset-class mix. *Risk sources* splits tracking error by factor
plus specific (or by category or product); *Return sources* gives allocation
and selection effects by category; *Over time* (historical) draws rolling
36-month tracking error and cumulative active return. It is measured against
the context bar's Reference, each subject's own benchmark (an allocation's
benchmark, a category's index basket, a product's stated benchmark, a
sleeve's category index), or a picked benchmark, product, allocation or sleeve.
The checks confirm that contributions sum to the tracking error, the effects to
the active return, and passive and active risk with their correlation to the
total.

**Waterfalls.** Every contribution measure that adds up to a total can be drawn
as a waterfall, one allocation at a time (tabs above the chart): Return
contribution by category (opens as one), Risk contribution by category (by
category, or by factor plus specific), Risk by factor, Return attribution (from
the reference's return to the allocation's), and the risk and return sources of
Active risk & return (*Risk and return sources: Waterfall* in its settings).
Steps take the category's colour, or slate for factors; a negative step is
drawn light, and the last row is the total from zero.

## Clarity: say it once, tag the exception

The page follows five rules (the plan is `../design/workspace-clarity.html`):

- **Say it once.** The context bar is the one statement of what every card
  shares. It is a toolbar on the canvas, not a box. *Reporting in USD* states
  the workspace's currency once (it opens the currency dialog). It shows only the
  controls some card reads: *Factor model* with a factor card, *Period* with a
  history card, *Horizon* and band with a Projections or Probability of
  outcomes card. *vs* is a menu: presets, custom benchmarks, each
  allocation's own, or a compared portfolio, plus *Create custom benchmark* and
  the benchmark library. There is no Basis switch: each card has its own. *Scenarios* names the active
  scenario and how many compared allocations it applies to. There is no
  context line under the bar and no scenario button in the header. Card
  subtitles open with the card's basis (*→ Forward-looking* in blue, or
  *◷ Historical · last 3 years* in slate, the glyph so it never relies on
  colour), then name the measure (metric, unit, scope), adding the model or
  scenario only where the card departs from the bar.
- **Tag the exception.** Snapshot, Sleeve, Edited, Proxy, Coverage and No
  benchmark get a tag; live allocations do not. *Editing* is the rail's eyebrow
  and the accent ring on the comparison pill. Table columns carry a basis
  label only where they differ.
- **One style per job.** Uppercase tracked type is for table heads, eyebrows
  and the rail tabs. Buttons and control labels are sentence case.
- **Quiet until needed.** A card's grip, settings and menu, sort glyphs and the
  rail's weight boxes appear on hover or focus (always on touch). Legends are
  text. The Allocations bars draw a row total only when it is not 100%.
- **One interaction away.** Method notes sit behind *About these figures* at
  the foot of each card; *Show method notes on every card* in the header ⋮
  opens them all (the workspace preference `showNotes`). Caveats (coverage,
  mapping, basis per allocation) stay visible. Snapshot, versions and layout
  live in the header ⋮ menu. Exports carry the context as one line.

**Headline** (the Summary group, first in the sample workspace) gives one row
per compared allocation with both bases side by side: a forward-looking group
(expected return, risk, active return, tracking error) and a historical group
for the period (return, volatility, active return, tracking error, maximum
drawdown), then the allocated total, highlighted when it is not 100%. It makes
two `activeAnalysis` requests and reuses `historyPack`.

## Benchmarks and the reporting currency

**One picker, two kinds.** Presets are maintained by the platform team and are
read-only. Custom benchmarks mix any indices, products, other benchmarks and
one fixed rate (*cash + x% a year*, which follows the reporting currency),
with weights that must total 100%; the builder shows the mix by category,
rebalancing and who can use it (shared, or only me). They are saved to the
**benchmark library** (`#/benchmarks`, from the home page, the header ⋮ or the
“vs” menu), versioned like sleeves: an allocation or the shared reference
keeps the version it was given (`cbm_x@2`) and the picker says when a newer
one is available. Presets can be duplicated as custom; custom benchmarks can be
edited as a new version, duplicated, archived and restored. Assign benchmark
and the “vs” menu offer the same list; custom benchmarks can also be added as
fixed columns from the comparison strip.

**Reporting currency.** A new workspace asks for its name and reporting
currency, with nothing preselected; *Create* stays disabled until both are
given, and the API rejects a workspace without one. Every figure is reported
in it: the Cash index, the risk-free rate and fixed-rate benchmark rows use its
3-month rate, the FX factor is stated against it, and the stress test shocks
it. It can change later (the context bar or the header ⋮, undoable). Existing
workspaces stay in USD. Hedging is not modelled; Currency exposure shows the
unhedged look-through mix.

## The three ideas

**The builder is a tree: category → product.** Categories are
modelled at index level: each has its own target weight; products implement
part or all of it; whatever is unimplemented shows as an *index* leaf and is
modelled by the category's index basket. Raising a target above its products
puts the difference at index level; lowering a product does the same. The
categories are the Proposal Tool's (Public Equity, Investment Grade Fixed
Income, Other Fixed Income, Hedge Funds, Private Equity & Other Private
Assets, Real Assets, Cash).

**Sleeves are saved subsets of a portfolio.** From a category's menu, *Create
sleeve from category* takes its products and rescales their weights to 100.
*Select* in the builder (or ⌘-click products) builds a sleeve from any set of
products, again pro rata to 100; the user files it under a category, and a
selection that spans categories is marked *mixed*. Sleeves live in a shared,
versioned repository (`#/sleeves`): browse by category, inspect versions,
edit weights as a new version, rename, re-file, archive. *Apply a sleeve* on a
category copies a version's products in at the category target (or only into
the index remainder) and tags them with the sleeve and version. Sleeves are
copies, not links: editing a sleeve never changes an allocation.

**A sleeve can also be compared on its own.** *Save & compare* on the
selection bar, *Save as sleeve and compare* on a category, *Compare a sleeve*
in the comparison strip's Add menu, the link in the apply dialog, and *Add to
a workspace* in the repository all add a sleeve version to the workspace as
its own column: a read-only allocation of kind `sleeve`, fully invested at the
sleeve's weights, so every card shows the sleeve's own analytics next to the
portfolios. The column is pinned to its version; when the repository has a
newer one, the rail and the column's menu offer to show it. *Make an editable
copy* turns it into a live allocation.

**The analytics area is a collection of cards.** Each card is one piece of
analysis from a catalogue of 34 entries over 30 types, grouped by basis:
**Summary** (Headline, Drivers & Differences, whose metric list is grouped by
basis); **Forward-looking** (expected return & risk, projections with bands,
probability of outcomes, value at risk & expected shortfall, hypothetical
stress tests, scenario comparison, return contribution by category, risk
contribution by category, risk by factor, factor exposures, active risk &
return, diversification); **Historical** (cumulative return, summary
statistics, calendar-year returns as a heat grid, monthly returns, worst
drawdowns, underwater, rolling return and volatility, rolling active return &
tracking error, stress periods, correlation, return attribution, up & down
capture, distribution of monthly returns, and the realised versions of return
contribution, risk contribution, factor exposures and active risk & return);
**Structure** (allocations side by side, active weights vs the reference,
currency exposure). A type that can read either basis has two entries that
add the same card with its basis fixed; the card menu offers *Show historical
instead*. The new forward, historical and structure cards live in
`js/ui/suite.js`. Cards sit on a
free-form 12-column grid: drag by the header, resize from the corner, or use
the keyboard; a dropped card pushes the cards it lands on down and the grid
compacts. Each card keeps its own settings; the context bar holds what every
card shares (reporting currency, factor model, period, reference, scenario,
horizon and band), each shown only when a card reads it. Cards
that support it can *follow the selected row* of the Drivers & Differences
table. The card repository (*Add card*) offers the catalogue plus cards saved
with their settings, shared across workspaces.

## What is in the box

```
index.html            the page: rail | main (context bar + card grid) | drawer, plus the card sheet
css/tokens.css        design tokens, shared with the Proposal Tool (fonts, ink, rules, palette)
css/components.css    buttons, inputs, tags, tables, dialogs, popovers, toasts
css/workspace.css     the workspace layout, home list, rail, drawer, responsive rules, print
css/cards.css         cards and the grid, the card sheet, builder additions, the sleeve repository
fonts/                house typefaces (GS Sans, GS Sans Condensed, Goldman Sans, Roboto)
data/universe.js      categories with index baskets, asset classes, factors, instruments, templates, reporting currencies
data/benchmarks.js    preset benchmarks, the custom benchmark library, the fixed-rate constituent
data/assumptions.js   platform capital-market assumptions (a small factor model)
data/factormodels.js  the ISG and Axioma factor models; products' stated benchmarks
data/history.js       monthly returns Jan 2012 – Oct 2026, generated deterministically
data/sleeves.js       the sleeve repository and the saved-card repository
data/workspaces.js    three sample workspaces in the persisted shape, cards included
js/util.js            DOM, formatting, maths, icons, tooltips, focus trap
js/engine.js          the mock analytics engine (what a service replaces)
js/api.js             the data access layer: one contract, two adapters (mock, http)
js/state.js           the workspace store: undo/redo, autosave, revisions, cards, product selection
js/ui/common.js       toasts, dialogs, popovers, confirm/prompt
js/ui/viz.js          chart primitives: lines with crosshair, bars, stacked bars, small multiples, dot plot, heat matrix, scatter, diverging bars, waterfall, distribution
js/ui/cards.js        the card grid: layout engine, chrome, settings, data fetching, the card repository sheet
js/ui/cardtypes.js    the catalogue of card types
js/ui/ddcard.js       the Drivers & Differences card
js/ui/activecard.js   the Active risk & return card
js/ui/suite.js        the forward-looking, historical and structure suite (outcomes, VaR, stress tests, capture, …)
js/ui/benchmarks.js   the benchmark picker, the custom benchmark builder, the benchmark library screen
js/ui/context.js      the context bar (controls shown when a card reads them), the context in one line for exports
js/ui/shell.js        routing, workspace list, context header, comparison strip, demo controls
js/ui/builder.js      the rail: header, Build/Add/Sleeves/Check tabs, the category tree, selection, weights, leverage
js/ui/sleeves.js      create and apply sleeves; the sleeve repository screen
js/ui/drawer.js       scenarios, scope, assumption matrix, correlation matrix and pair editor
js/ui/dialogs.js      new allocation (blank/template/clone/import), add investment, snapshot, versions, export
js/app.js             boot
verify-workspace.mjs  headless-Chrome checks and screenshots (node verify-workspace.mjs)
```

Script load order in `index.html` is load-bearing: utilities, data, engine,
API, state, UI, boot. Everything hangs off one global, `window.PA`.

## The data layer, for the backend team

The interface never touches `PA.data` or `PA.engine` directly. Every read and
write goes through **`PA.api`** (`js/api.js`), which exposes one contract and
two adapters:

- `mock` (default) answers from the in-page data and engine, with simulated
  latency and the demo failure switches.
- `http` is a thin `fetch()` client against the endpoints below. Switch to it
  with `window.PA_CONFIG = { adapter: 'http', baseUrl: '/api/v1' }` before
  `app.js`, or `PA.api.configure({...})` at runtime. Nothing under `js/ui/`
  changes.

| Method | Endpoint | Returns |
|---|---|---|
| `listWorkspaces()` | `GET /workspaces` | `WorkspaceSummary[]` |
| `getWorkspace(id)` | `GET /workspaces/:id` | `Workspace` |
| `createWorkspace({name, currency, description})` | `POST /workspaces` | `Workspace` (currency required) |
| `saveWorkspace(ws)` | `PUT /workspaces/:id` | `{savedAt, version}` |
| `deleteWorkspace(id)` | `DELETE /workspaces/:id` | `{}` |
| `getUniverse()` | `GET /universe` | categories, asset classes, factors, benchmarks, templates, instruments |
| `getAssumptions()` | `GET /assumptions` | the platform base case |
| `searchInvestments(q, {limit, category})` | `GET /investments?q=&category=` | `SearchResult[]` (instruments, sleeves, portfolios) |
| `listSleeves()` | `GET /sleeves` | `Sleeve[]` |
| `saveSleeve(sleeve)` | `PUT /sleeves/:id` | `Sleeve` (create, rename, re-file, or add a version) |
| `archiveSleeve(id, archived)` | `PATCH /sleeves/:id` | `Sleeve` |
| `useCurrency(code)` | header `X-Reporting-Currency` | the workspace's reporting currency, sent with every request |
| `listBenchmarks()` | `GET /benchmarks` | `{presets, custom}` |
| `saveBenchmark(b)` | `PUT /benchmarks/:id` | `CustomBenchmark` (create, or add a version; weights must total 100) |
| `archiveBenchmark(id, archived)` | `PATCH /benchmarks/:id` | `CustomBenchmark` |
| `listSavedCards()` | `GET /cards` | `SavedCard[]` |
| `saveCard(card)` | `PUT /cards/:id` | `SavedCard` |
| `deleteSavedCard(id)` | `DELETE /cards/:id` | `{}` |
| `analyzeTable(TableRequest)` | `POST /analytics/table` | `TableResponse` |
| `historySeries(HistoryRequest)` | `POST /analytics/history` | `HistoryResponse` |
| `historyPack(PackRequest)` | `POST /analytics/history-pack` | `PackResponse` (returns, growth, drawdowns, stats, calendar years, stress periods, rolling series, correlations) |
| `breakdown({allocations})` | `POST /analytics/breakdown` | `BreakdownResponse` (targets, products, index remainders by category) |
| `projection(ProjectionRequest)` | `POST /analytics/projection` | `ProjectionResponse` |
| `scenarioComparison(ScenarioRequest)` | `POST /analytics/scenarios` | `ScenarioResponse` |
| `summaries(allocations)` | `POST /analytics/summaries` | `{[allocationId]: {ret, vol, sharpe}}` |
| `activeAnalysis(req)` | `POST /analytics/active` | passive and active return and risk per allocation, with risk and return sources (see `js/api.js`) |
| `factorRisk(req)` | `POST /analytics/factor-risk` | risk by factor plus specific under a factor model |
| `forwardSuite(req)` | `POST /analytics/forward-suite` | expected return and risk, VaR and expected shortfall, outcome probabilities, diversification, stress tests, with the reference |
| `historySuite(req)` | `POST /analytics/history-suite` | monthly distribution, skew, kurtosis, worst months, up and down capture, beta, hit rate |
| `structure(req)` | `POST /analytics/structure` | category weights against the reference, look-through currency mix |

Every shape is documented at the top of the file that owns it:

- `data/workspaces.js` — `Workspace`, `Allocation` (with `categories` targets
  and `sleeveRef` tags), `Card`, `Scenario`, `Prefs`, `Activity`.
- `data/sleeves.js` — `Sleeve`, `SleeveVersion`, `SavedCard`.
- `data/universe.js` — `Category` (with its index basket), `AssetClass`,
  `Factor`, `Instrument`, reporting currencies. `data/benchmarks.js` —
  `Benchmark`, `CustomBenchmark`, constituent rows.
- `data/assumptions.js` — `Assumptions`. `data/history.js` — `History`.
- `js/api.js` — the request and response shapes of the analytics calls.
- `js/ui/cards.js` — the card type contract a new card implements.

Conventions a service must keep (the UI relies on them):

- Weights are percentages of the total portfolio. A category's target may
  exceed its products; the difference is modelled by the category's index
  basket. Unallocated weight (100 minus the sum of targets) earns nothing and
  carries no risk; it is never treated as cash unless a cash instrument is
  held.
- A cell value of `null` means *unavailable* and always carries a `reason`;
  `0` means an observed or calculated zero.
- Rows are keyed by the category grouping: `<categoryId>`,
  `<categoryId>/<instrumentId>`, `<categoryId>/__index`, `__residual`,
  `__total`.
- Every analytics response echoes the `revision` of the request. The store
  discards responses whose revision is not the latest, so a slow, older
  answer never replaces a newer one.
- Scenario assumptions change forward-looking figures only
  (`scenarioApplies`). Differences are computed by the service against the
  reference evaluated under the same assumption set.
- A sleeve version's weights sum to 100. Applying a sleeve is a copy: the
  service stores `sleeveRef` on the products, nothing links back.

## Design decisions and assumptions made here

- **Categories, not sleeves, are the branches.** The word *sleeve* now means
  a saved, reusable bundle of products; the rail's branches are categories.
  The category list is fixed (the Proposal Tool's); users do not create or
  rename categories.
- **Index-level modelling.** A category target is authoritative. Products
  implement it; the remainder is held in the category's index basket
  (documented per category in `data/universe.js`). Products exceeding the
  target are allowed and flagged *over*; *Set target to products* and *Raise
  the category target* exist as quick repairs.
- **Editable weight.** Total-portfolio weight is the editable number at every
  level; the share of the category is shown read-only.
- **History after an edit.** An allocation with actual history switches to a
  current-weight backtest once edited (badge *Edited · current-weight
  backtest*); its track record stays on the chart as a dashed line.
- **Partial coverage.** Products without return history are excluded from
  historical figures and disclosed; later-inception products use their
  asset-class index as a proxy and say so.
- **Scenario precedence.** Holding override → asset-class override → factor
  premium. An invalid (non-PSD) correlation matrix makes scenario results
  unavailable and leaves base results untouched.
- **Compared sleeves.** A sleeve column is the sleeve on its own at 100%,
  not the sleeve inside a portfolio, and it has no benchmark until one is
  assigned. It is read-only and pinned to a version, like a snapshot; it is
  not in a scenario's scope until added to it.
- **Undo scope.** Allocation edits, comparison membership, scenarios, and
  adding, removing or changing a card are undoable. Moving or resizing a card
  and display preferences are remembered but not undone.
- **Cards.** A card's own settings (metric, units, factors, count, basis)
  belong to the card; the context bar holds what every card shares. A card's
  basis is fixed when it is added: forward cards follow the scenario, history
  cards the period. Workspaces saved with the old shared Basis switch give each
  card that followed it the switch's last value, so nothing on screen changes.
  Stress tests use the Axioma model, which holds every shocked factor.
  A saved card stores type, settings and name, never data.
- **Activity, not transactions.** The product shows analytics, not trades;
  "Versions & activity" records edits, sleeves, snapshots and scenarios.

All figures are illustrative and fictional. The engine is a small coherent
model (factor premia, idiosyncratic vols, a PSD correlation matrix, quarterly
rebalanced backtests, lognormal projections) chosen so the numbers behave the
way real ones do; it is not a production model.

## Checks

`node verify-workspace.mjs` drives the page in headless Chrome: it exercises
the main flows (category and product edits, sleeves from a category and a
selection, saving a sleeve and comparing it, comparing a repository sleeve and
loading its newer version, applying a sleeve, cards: settings, follow-row, data tables,
adding from the repository, moving, resizing, removing, undo; the context
bar; the clarity rules (no default tags, one door to scenarios, controls shown only when a card reads them,
quiet card tools and rail inputs, the silver rule above each category, notes closed by default, identifiers on a wide rail);
the elbow guides and quick add; per-card bases and the dual Headline; the eleven ISG and seventeen Axioma factors;
benchmarks (picker, builder rules, versions, library, fixed rate); the reporting currency; every new card and the waterfalls;
persistence; the sleeve repository; failure states; three viewports),
asserts on what the user would see, reports console errors, and writes
screenshots to `screenshots/`. It uses the same Playwright runtime as
`../spec/verify-document.mjs`.

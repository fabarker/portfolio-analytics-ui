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
(a selector, with its kind, history basis and benchmark), and four tabs split
the rail's jobs so each gets the full height:

- **Build**: the category tree below, with select mode for sleeves. Weights
  are typed: no stepper buttons. A typed value is marked pending until
  `Enter` applies it (one edit, one recalculation); `Esc` discards it, `↑`/`↓`
  move between weights, and pending values survive leaving the field.
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
index level) and the allocated total in view. Collapsed, the rail keeps the
four tab icons (with the badge); each opens the rail on its tab. On a phone the
rail is an overlay with the same tabs.

## Factor models and active risk

**Two factor models, one switch.** *Factor model* in the context bar (ISG ·
Axioma) sets the risk model for every card that uses one: Factor exposures,
the Factors metric of Drivers & Differences, the factor view of Risk by
category, and Active risk & return. Each of those cards shows a model chip in
its header, plain while it follows the workspace and filled with a pin when the
card has its own model. The chip's menu pins, unpins, adds a copy pinned to
the other model beside the card (*Compare with …*), and describes the model and
its coverage. Only cards that follow the switch refetch. A card keeps one
factor pick per model; with none for a model, the other model's pick maps
across where factors have a counterpart and the card says so. Axioma does not
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

## The three ideas

**The builder is a tree: portfolio → category → product.** Categories are
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
analysis from a catalogue of fourteen types (allocations side by side, the
Drivers & Differences table, cumulative return, drawdowns, underwater,
summary statistics, calendar-year returns, stress periods, rolling return and
volatility, risk by category, factor exposures, correlation between
allocations, projections with bands, scenario comparison). Cards sit on a
free-form 12-column grid: drag by the header, resize from the corner, or use
the keyboard; a dropped card pushes the cards it lands on down and the grid
compacts. Each card keeps its own settings; the context bar holds what every
card shares (basis, period, reference, scenario, horizon and band). Cards
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
data/universe.js      categories with index baskets, asset classes, factors, instruments, benchmarks, templates
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
js/ui/viz.js          chart primitives: lines with crosshair, bars, stacked bars, small multiples, dot plot, heat matrix
js/ui/cards.js        the card grid: layout engine, chrome, settings, data fetching, the card repository sheet
js/ui/cardtypes.js    the catalogue of card types
js/ui/ddcard.js       the Drivers & Differences card
js/ui/activecard.js   the Active risk & return card
js/ui/context.js      the context bar and context line
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
| `createWorkspace({name, description})` | `POST /workspaces` | `Workspace` |
| `saveWorkspace(ws)` | `PUT /workspaces/:id` | `{savedAt, version}` |
| `deleteWorkspace(id)` | `DELETE /workspaces/:id` | `{}` |
| `getUniverse()` | `GET /universe` | categories, asset classes, factors, benchmarks, templates, instruments |
| `getAssumptions()` | `GET /assumptions` | the platform base case |
| `searchInvestments(q, {limit, category})` | `GET /investments?q=&category=` | `SearchResult[]` (instruments, sleeves, portfolios) |
| `listSleeves()` | `GET /sleeves` | `Sleeve[]` |
| `saveSleeve(sleeve)` | `PUT /sleeves/:id` | `Sleeve` (create, rename, re-file, or add a version) |
| `archiveSleeve(id, archived)` | `PATCH /sleeves/:id` | `Sleeve` |
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

Every shape is documented at the top of the file that owns it:

- `data/workspaces.js` — `Workspace`, `Allocation` (with `categories` targets
  and `sleeveRef` tags), `Card`, `Scenario`, `Prefs`, `Activity`.
- `data/sleeves.js` — `Sleeve`, `SleeveVersion`, `SavedCard`.
- `data/universe.js` — `Category` (with its index basket), `AssetClass`,
  `Factor`, `Instrument`, `Benchmark`.
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
- **Cards.** A card's own settings (metric, units, factors, count, basis of a
  projection) belong to the card; the context bar holds what every card
  shares. *Basis* applies to the cards that can show either history or the
  model (Drivers & Differences, Risk by category, Factor exposures); history
  cards always use the period, forward cards always use the horizon and band.
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
bar; persistence; the sleeve repository; failure states; three viewports),
asserts on what the user would see, reports console errors, and writes
screenshots to `screenshots/`. It uses the same Playwright runtime as
`../spec/verify-document.mjs`.

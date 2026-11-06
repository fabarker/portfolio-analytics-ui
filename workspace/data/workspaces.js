/* ─────────────────────────────────────────────────────────────────────────
   Mock data · sample workspaces
   The persisted shape the UI reads and writes. A backend stores and returns
   exactly this; the UI never derives it from anything else.

   Shapes
   ─────
   Workspace  {id, name, description, currency, owner, createdAt, updatedAt,
               categories:[{id, name, color}]   the workspace's categories, in
                                       display order (default: the taxonomy's seven),
               allocations:Allocation[],
               comparison:{members:string[], activeId:string,
                           referenceMode:'shared'|'individual'|'portfolio',
                           sharedBenchmarkId:string, referencePortfolioId:string|null},
               scenarios:Scenario[], activeScenarioId:string|null,
               cards:Card[], prefs:Prefs, activity:Activity[]}
   Allocation {id, name, kind:'live'|'snapshot'|'sleeve', color:'cat-1'…'cat-6',
               benchmarkId:string|null, leverage:boolean,
               history:{basis:'actual'|'backtest', inception:'YYYY-MM'},
               edited:boolean          true once a live allocation with actual
                                       history has been changed in this draft
               capturedAt?:ISO, sourceId?:string, note?:string,
               holdings:[{id, instrumentId, weight, categoryId, sleeveRef?}]}
               weight is a percentage of the total portfolio; categoryId is
               the workspace category the holding sits in (defaults to the
               instrument's home category). A category's weight is the sum of
               its holdings. The samples below still give the former
               category targets (categories:{id: weight}); on load any target
               above a category's products becomes explicit holdings of the
               category's index basket (engine.js, E.normalizeAllocation).
               sleeveRef {sleeveId, version, name} tags products that came
               from a repository sleeve.
               chain?: the decision chain (policy benchmark, SAA, product
               benchmark mapping, step order); see js/api.js
   Workspace.conventions?: attribution conventions (header menu); defaults
               in js/chain.js
               kind 'sleeve' is a repository sleeve version compared as its
               own column: read-only, fully invested at the sleeve's weights,
               with sleeve:{id, version, name, categoryId, mixed}. It is pinned
               to that version until the user loads a newer one.
   Card       {id, type, x, y, w, h, settings:{}, followRow:boolean, name?}
               position and size on a 12-column grid; type names a catalogue
               entry (js/ui/cardtypes.js)
   Scenario   {id, name, createdAt, scope:string[] (allocation ids),
               overrides:{assetClass:{[id]:{return?,vol?}},
                          holding:{[instrumentId]:{return?,vol?}},
                          factor:{[id]:{premium?}},
                          correlation:{['a|b']:number}}}
   Prefs      display preferences remembered per workspace (not undoable)
   Activity   {at:ISO, type, label, detail?}
   ───────────────────────────────────────────────────────────────────────── */
(function () {
  'use strict';
  var PA = window.PA, D = PA.data;

  var H = function (pairs) {
    return pairs.map(function (p, i) { var h = { id: 'h' + (i + 1) + '_' + p[0], instrumentId: p[0], weight: p[1] }; if (p[2]) h.sleeveRef = p[2]; return h; });
  };
  var prefs = function (over) {
    var p = { period: { preset: 'common', start: null, end: null }, horizon: 10, confidence: 0.8,
      expanded: ['public_equity'], selectedRow: 'public_equity', emphasis: [], railWidth: 360, drawerWidth: 460, railCollapsed: false, factorModel: 'isg', showNotes: false };
    for (var k in over) p[k] = over[k];
    return p;
  };
  var card = function (id, type, x, y, w, h, settings, followRow) { return { id: id, type: type, x: x, y: y, w: w, h: h, settings: settings || {}, followRow: !!followRow }; };
  /* Strategic Core's decision chain: the 2027 policy, its SAA as an allocation of indices, products against their stated benchmarks.
     Income Tilt: its assigned benchmark as policy and an SAA derived from its category weights. */
  D.sampleChains = {
    al_core: { policyBenchmarkId: 'cbm_policy@2', saa: { kind: 'allocation', id: 'al_core_saa' }, productBenchmarks: { mode: 'stated', overrides: {} }, order: 'default', implementation: 'one' },
    al_income: { policyBenchmarkId: null, saa: { kind: 'derived' }, productBenchmarks: { mode: 'stated', overrides: {} }, order: 'default', implementation: 'one' }
  };
  D.sampleSaa = { id: 'al_core_saa', name: 'Strategic Core SAA', kind: 'live', color: 'cat-5', benchmarkId: 'cbm_policy@2', leverage: false,
    history: { basis: 'backtest', inception: '2026-10' }, edited: false, note: 'Strategic asset allocation agreed at the 2027 review: one index per asset class. The SAA of Strategic Core’s decision chain.',
    holdings: H([['idx_us_eq', 26], ['idx_dev_eq', 12], ['idx_em_eq', 4], ['idx_pe', 10], ['idx_govt', 14], ['idx_ig', 8], ['idx_hy', 4], ['idx_cash', 4], ['idx_hf', 8], ['idx_re', 4], ['idx_infra', 3], ['idx_cmd', 3]]) };
  var ALTS = { sleeveId: 'slv_core_alts', version: 1, name: 'Core Alternatives' };

  var ws1 = {
    id: 'ws_global_review',
    name: 'Global Multi-Asset Review 2027',
    description: 'Strategic review of the core multi-asset allocation against income and growth alternatives.',
    currency: 'USD',
    owner: 'F. Barker',
    createdAt: '2026-09-14T09:12:00Z',
    updatedAt: '2026-10-30T16:41:00Z',
    allocations: [
      { id: 'al_core', name: 'Strategic Core', kind: 'live', color: 'cat-1', benchmarkId: 'bm_6040', leverage: false,
        history: { basis: 'actual', inception: '2015-01' }, edited: false, note: 'Current strategic allocation. Position history complete since Jan 2015.',
        chain: D.sampleChains.al_core,
        categories: { public_equity: 45, private_equity: 10, ig_fixed_income: 22, other_fixed_income: 4, cash: 4, hedge_funds: 8, real_assets: 7 },
        holdings: H([['etf_us_lc', 20], ['fund_intl', 13], ['fund_em', 7], ['fund_us_sc', 5], ['pe_oakhurst', 6], ['pe_tamar', 4],
          ['fund_tsy', 14], ['fund_ig', 8], ['fund_hy', 4], ['fund_cash', 4], ['hf_kestrel', 5, ALTS], ['hf_alder', 3, ALTS], ['re_harbor', 4], ['fund_cmd', 3]]) },
      { id: 'al_income', name: 'Income Tilt', kind: 'live', color: 'cat-2', benchmarkId: 'bm_4060', leverage: false,
        history: { basis: 'backtest', inception: '2026-09' }, edited: false, note: 'Alternative with more credit and real assets, less public equity. Real Assets not yet fully implemented.',
        chain: D.sampleChains.al_income,
        categories: { public_equity: 30, private_equity: 10, ig_fixed_income: 27, other_fixed_income: 13, cash: 5, hedge_funds: 5, real_assets: 10 },
        holdings: H([['etf_us_lc', 15], ['fund_intl', 10], ['fund_em', 5], ['pe_oakhurst', 10], ['fund_tsy', 10], ['etf_govt', 5],
          ['fund_ig', 12], ['fund_hy', 7], ['fund_pc', 6], ['fund_cash', 5], ['hf_kestrel', 5], ['re_harbor', 6], ['infra_grey', 2]]) },
      { id: 'al_growth', name: 'Growth Tilt', kind: 'live', color: 'cat-3', benchmarkId: null, leverage: false,
        history: { basis: 'backtest', inception: '2026-09' }, edited: false, note: 'Equity-heavy alternative. No mandate benchmark assigned yet; hedge funds held through the hedge fund index for now.',
        categories: { public_equity: 55, private_equity: 15, ig_fixed_income: 13, other_fixed_income: 3, cash: 2, hedge_funds: 6, real_assets: 6 },
        holdings: H([['etf_us_lc', 25], ['fund_intl', 15], ['fund_em', 10], ['fund_us_sc', 5], ['pe_oakhurst', 8], ['pe_tamar', 4], ['pe_rivermead', 3],
          ['fund_tsy', 8], ['fund_ig', 5], ['fund_hy', 3], ['fund_cash', 2], ['fund_cmd', 3], ['etf_gold', 3]]) },
      { id: 'al_core_snap', name: 'Strategic Core · Mar 2026', kind: 'snapshot', color: 'cat-4', benchmarkId: 'bm_6040', leverage: false,
        history: { basis: 'backtest', inception: '2026-03' }, edited: false, sourceId: 'al_core', capturedAt: '2026-03-31T17:00:00Z',
        note: 'Fixed snapshot taken at the March review. Weights frozen; analytics refresh with the platform model.',
        categories: { public_equity: 44, private_equity: 8, ig_fixed_income: 25, other_fixed_income: 4, cash: 4, hedge_funds: 8, real_assets: 7 },
        holdings: H([['etf_us_lc', 22], ['fund_intl', 12], ['fund_em', 6], ['fund_us_sc', 4], ['pe_oakhurst', 6], ['pe_tamar', 2],
          ['fund_tsy', 16], ['fund_ig', 9], ['fund_hy', 4], ['fund_cash', 4], ['hf_kestrel', 5, ALTS], ['hf_alder', 3, ALTS], ['re_harbor', 4], ['fund_cmd', 3]]) },
      D.sampleSaa
    ],
    comparison: { members: ['al_core', 'al_income', 'al_growth', 'al_core_snap'], activeId: 'al_core', referenceMode: 'shared', sharedBenchmarkId: 'bm_6040', referencePortfolioId: null },
    scenarios: [
      { id: 'sc_rates', name: 'Rates +100bp', createdAt: '2026-10-21T10:05:00Z', scope: ['al_core', 'al_income', 'al_growth', 'al_core_snap'],
        overrides: { assetClass: { govt: { return: 1.9 }, ig: { return: 2.6 }, re: { return: 4.6 } }, holding: {}, factor: { rates: { premium: -1.2 } }, correlation: {} } },
      { id: 'sc_erp', name: 'Equity premium 3%', createdAt: '2026-10-28T14:30:00Z', scope: ['al_core', 'al_income', 'al_growth'],
        overrides: { assetClass: {}, holding: { pe_tamar: { return: 9.0 } }, factor: { equity: { premium: 3.0 } }, correlation: { 'us_eq|govt': -0.1 } } }
    ],
    activeScenarioId: null,
    cards: [
      card('c0', 'headline', 0, 0, 12, 12, {}),
      card('c1', 'allocations', 0, 12, 12, 6, { view: 'bars' })
    ],
    prefs: prefs({ emphasis: ['al_core', 'al_income'] }),
    activity: [
      { at: '2026-10-30T16:41:00Z', type: 'edit', label: 'Strategic Core · Private Equity 10% → 10%', detail: 'Tamar Private Equity VII 3% → 4%, Oakhurst Buyout Partners IV 7% → 6%' },
      { at: '2026-10-28T14:30:00Z', type: 'scenario', label: 'Scenario “Equity premium 3%” created', detail: 'Equity premium 5.0% → 3.0%; Tamar PE VII return override 9.0%; US Equity ↔ Government Bonds correlation −0.27 → −0.10' },
      { at: '2026-10-21T10:05:00Z', type: 'scenario', label: 'Scenario “Rates +100bp” created', detail: 'Rates premium 0.8% → −1.2%; Government Bonds return 1.9%' },
      { at: '2026-10-02T09:18:00Z', type: 'member', label: 'Growth Tilt added to the comparison' },
      { at: '2026-09-24T11:02:00Z', type: 'member', label: 'Income Tilt added to the comparison' },
      { at: '2026-06-03T10:20:00Z', type: 'sleeve', label: 'Sleeve “Core Alternatives” applied to Hedge Funds in Strategic Core' },
      { at: '2026-03-31T17:00:00Z', type: 'snapshot', label: 'Snapshot “Strategic Core · Mar 2026” created', detail: 'From Strategic Core' },
      { at: '2026-09-14T09:12:00Z', type: 'create', label: 'Workspace created' }
    ]
  };

  var ws2 = {
    id: 'ws_endowment',
    name: 'Endowment Model Review',
    description: 'Private-markets-heavy reference allocations for the foundation mandate.',
    currency: 'USD', owner: 'F. Barker', createdAt: '2026-08-02T10:00:00Z', updatedAt: '2026-10-19T15:12:00Z',
    allocations: [
      { id: 'al_endow_a', name: 'Endowment Candidate', kind: 'live', color: 'cat-1', benchmarkId: 'bm_endow', leverage: false, history: { basis: 'backtest', inception: '2026-08' }, edited: false,
        categories: { public_equity: 33, private_equity: 20, ig_fixed_income: 14, other_fixed_income: 5, hedge_funds: 14, real_assets: 14 },
        holdings: H([['etf_us_lc', 18], ['fund_intl', 9], ['fund_em', 6], ['pe_oakhurst', 12], ['pe_tamar', 8], ['fund_tsy', 8], ['fund_ig', 6], ['fund_pc', 5], ['hf_kestrel', 8], ['hf_corvid', 6], ['re_harbor', 8], ['infra_grey', 6]]) },
      { id: 'al_endow_b', name: 'Liquid Endowment', kind: 'live', color: 'cat-2', benchmarkId: 'bm_endow', leverage: false, history: { basis: 'backtest', inception: '2026-08' }, edited: false,
        categories: { public_equity: 46, ig_fixed_income: 22, other_fixed_income: 6, hedge_funds: 14, real_assets: 12 },
        holdings: H([['etf_us_lc', 26], ['etf_dev', 12], ['etf_em', 8], ['etf_govt', 14], ['etf_ig', 8], ['fund_hy', 6], ['hf_kestrel', 8], ['hf_alder', 6], ['etf_reit', 6], ['etf_infra', 6]]) }
    ],
    comparison: { members: ['al_endow_a', 'al_endow_b'], activeId: 'al_endow_a', referenceMode: 'shared', sharedBenchmarkId: 'bm_endow', referencePortfolioId: null },
    scenarios: [], activeScenarioId: null,
    cards: [card('c0', 'headline', 0, 0, 12, 12, {}), card('c1', 'allocations', 0, 12, 12, 6, { view: 'bars' })],
    prefs: prefs({ emphasis: ['al_endow_a', 'al_endow_b'] }),
    activity: [{ at: '2026-08-02T10:00:00Z', type: 'create', label: 'Workspace created' }]
  };

  var ws3 = {
    id: 'ws_glide',
    name: 'Retirement Glidepath 2030',
    description: 'Three points on the glidepath, compared against the conservative reference.',
    currency: 'USD', owner: 'A. Okafor', createdAt: '2026-06-11T08:30:00Z', updatedAt: '2026-10-07T12:05:00Z',
    allocations: [
      { id: 'al_g1', name: '2030 · Accumulation', kind: 'live', color: 'cat-1', benchmarkId: 'bm_7030', leverage: false, history: { basis: 'backtest', inception: '2026-06' }, edited: false,
        categories: { public_equity: 70, ig_fixed_income: 30 }, holdings: H([['etf_us_lc', 40], ['etf_dev', 20], ['etf_em', 10], ['etf_govt', 18], ['etf_ig', 12]]) },
      { id: 'al_g2', name: '2030 · Transition', kind: 'live', color: 'cat-2', benchmarkId: 'bm_6040', leverage: false, history: { basis: 'backtest', inception: '2026-06' }, edited: false,
        categories: { public_equity: 55, ig_fixed_income: 39, cash: 6 }, holdings: H([['etf_us_lc', 33], ['etf_dev', 16], ['etf_em', 6], ['etf_govt', 25], ['etf_ig', 14], ['fund_cash', 6]]) },
      { id: 'al_g3', name: '2030 · Decumulation', kind: 'live', color: 'cat-3', benchmarkId: 'bm_4060', leverage: false, history: { basis: 'backtest', inception: '2026-06' }, edited: false,
        categories: { public_equity: 38, ig_fixed_income: 46, other_fixed_income: 6, cash: 10 }, holdings: H([['etf_us_lc', 22], ['etf_dev', 12], ['etf_em', 4], ['fund_tsy', 20], ['fund_ilb', 10], ['etf_ig', 16], ['fund_hy', 6], ['fund_cash', 10]]) }
    ],
    comparison: { members: ['al_g1', 'al_g2', 'al_g3'], activeId: 'al_g2', referenceMode: 'individual', sharedBenchmarkId: 'bm_6040', referencePortfolioId: null },
    scenarios: [], activeScenarioId: null,
    cards: [card('c0', 'headline', 0, 0, 12, 12, {}), card('c1', 'allocations', 0, 12, 12, 6, { view: 'bars' })],
    prefs: prefs({ emphasis: ['al_g1', 'al_g2', 'al_g3'] }),
    activity: [{ at: '2026-06-11T08:30:00Z', type: 'create', label: 'Workspace created' }]
  };

  D.workspaces = [ws1, ws2, ws3];
})();

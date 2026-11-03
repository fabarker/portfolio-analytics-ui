/* ─────────────────────────────────────────────────────────────────────────
   Mock data · the sleeve repository and the card repository
   Both are shared across workspaces. A backend stores and returns these
   shapes through PA.api (listSleeves/saveSleeve/archiveSleeve and
   listSavedCards/saveCard/deleteSavedCard).

   Shapes
   ─────
   Sleeve       {id, name, categoryId, mixed:boolean, archived:boolean,
                 createdBy, createdAt, note?,
                 source?:{workspaceId, workspaceName, allocationId, allocationName},
                 versions:[SleeveVersion]}         newest last
                 A sleeve is a subset of a portfolio: products whose weights
                 sum to 100. categoryId is the tag it is filed under; mixed
                 means its products span more than one category.
   SleeveVersion{v, createdAt, note, holdings:[{instrumentId, weight}]}
   SavedCard    {id, name, type, settings, followRow, createdBy, createdAt}
                 a card from the catalogue saved with its settings
   ───────────────────────────────────────────────────────────────────────── */
(function () {
  'use strict';
  var PA = window.PA, D = PA.data;
  var H = function (pairs) { return pairs.map(function (p) { return { instrumentId: p[0], weight: p[1] }; }); };

  D.sleeveRepository = [
    { id: 'slv_core_pe', name: 'Core Public Equity', categoryId: 'public_equity', mixed: false, archived: false, createdBy: 'F. Barker', createdAt: '2026-06-03T10:12:00Z',
      note: 'The public-equity implementation of the strategic core.',
      source: { workspaceId: 'ws_global_review', workspaceName: 'Global Multi-Asset Review 2027', allocationId: 'al_core', allocationName: 'Strategic Core' },
      versions: [
        { v: 1, createdAt: '2026-06-03T10:12:00Z', note: 'Created from the Public Equity category of Strategic Core', holdings: H([['etf_us_lc', 46], ['fund_intl', 30], ['fund_em', 14], ['fund_us_sc', 10]]) },
        { v: 2, createdAt: '2026-09-22T15:40:00Z', note: 'Emerging markets raised after the September review', holdings: H([['etf_us_lc', 44.44], ['fund_intl', 28.89], ['fund_em', 15.56], ['fund_us_sc', 11.11]]) }
      ] },
    { id: 'slv_core_alts', name: 'Core Alternatives', categoryId: 'hedge_funds', mixed: false, archived: false, createdBy: 'F. Barker', createdAt: '2026-06-03T10:20:00Z',
      note: 'Two-manager hedge fund sleeve used across the core allocations.',
      source: { workspaceId: 'ws_global_review', workspaceName: 'Global Multi-Asset Review 2027', allocationId: 'al_core', allocationName: 'Strategic Core' },
      versions: [{ v: 1, createdAt: '2026-06-03T10:20:00Z', note: 'Created from the Hedge Funds category of Strategic Core', holdings: H([['hf_kestrel', 62.5], ['hf_alder', 37.5]]) }] },
    { id: 'slv_core_bonds', name: 'Core Bonds', categoryId: 'ig_fixed_income', mixed: false, archived: false, createdBy: 'A. Okafor', createdAt: '2026-04-18T09:05:00Z',
      note: 'Treasuries 60 / IG credit 40.',
      versions: [{ v: 1, createdAt: '2026-04-18T09:05:00Z', note: 'Initial', holdings: H([['fund_tsy', 60], ['fund_ig', 40]]) }] },
    { id: 'slv_global_eq_etf', name: 'Global Equity ETF Mix', categoryId: 'public_equity', mixed: false, archived: false, createdBy: 'A. Okafor', createdAt: '2026-04-18T09:12:00Z',
      note: 'Passive implementation: US 55 / Developed 30 / EM 15.',
      versions: [{ v: 1, createdAt: '2026-04-18T09:12:00Z', note: 'Initial', holdings: H([['etf_us_lc', 55], ['etf_dev', 30], ['etf_em', 15]]) }] },
    { id: 'slv_real_assets', name: 'Real Assets Blend', categoryId: 'real_assets', mixed: false, archived: false, createdBy: 'F. Barker', createdAt: '2026-07-30T11:00:00Z',
      note: 'Core real estate with listed infrastructure and commodities.',
      versions: [{ v: 1, createdAt: '2026-07-30T11:00:00Z', note: 'Initial', holdings: H([['re_harbor', 50], ['etf_infra', 30], ['fund_cmd', 20]]) }] },
    { id: 'slv_income_mix', name: 'Income Mix', categoryId: 'other_fixed_income', mixed: true, archived: false, createdBy: 'F. Barker', createdAt: '2026-08-12T16:25:00Z',
      note: 'Selected from Income Tilt: high yield, private credit and listed real estate. Spans Other Fixed Income and Real Assets.',
      source: { workspaceId: 'ws_global_review', workspaceName: 'Global Multi-Asset Review 2027', allocationId: 'al_income', allocationName: 'Income Tilt' },
      versions: [{ v: 1, createdAt: '2026-08-12T16:25:00Z', note: 'Created from a product selection in Income Tilt', holdings: H([['fund_hy', 45], ['fund_pc', 30], ['etf_reit', 25]]) }] },
    { id: 'slv_old_eq', name: 'Legacy Equity Mix', categoryId: 'public_equity', mixed: false, archived: true, createdBy: 'A. Okafor', createdAt: '2025-11-02T09:00:00Z',
      note: 'Superseded by Core Public Equity.',
      versions: [{ v: 1, createdAt: '2025-11-02T09:00:00Z', note: 'Initial', holdings: H([['fund_us_eq', 50], ['fund_eu', 25], ['fund_jp', 10], ['fund_em', 15]]) }] }
  ];

  D.savedCards = [
    { id: 'card_risk_vol', name: 'Risk by category · volatility units', type: 'risk-by-category', settings: { basis: 'forward', riskUnits: 'vol' }, followRow: false, createdBy: 'F. Barker', createdAt: '2026-09-02T10:00:00Z' },
    { id: 'card_factors_all', name: 'Factor exposures · every ISG factor', type: 'factor-exposures', settings: { basis: 'forward', factors: { isg: ['equity', 'term', 'liquidity', 'funding', 'fx', 'em', 'dollar', 'size', 'value', 'commodities', 'momentum'] } }, followRow: false, createdBy: 'A. Okafor', createdAt: '2026-08-21T14:30:00Z' },
    { id: 'card_rolling_vol', name: 'Rolling 36-month volatility', type: 'rolling', settings: { measure: 'vol', window: 36 }, followRow: false, createdBy: 'F. Barker', createdAt: '2026-10-05T09:10:00Z' }
  ];
})();

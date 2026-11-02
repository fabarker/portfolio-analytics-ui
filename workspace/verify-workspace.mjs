/* Headless-Chrome checks for the workspace mockup.
   node verify-workspace.mjs
   Drives the main flows, asserts on what the user would see, reports page and
   console errors, and writes screenshots to screenshots/. Same Playwright
   runtime as ../spec/verify-document.mjs. */
import { createRequire } from 'node:module';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
const require = createRequire('/Users/francisbarker/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/package.json');
const { chromium } = require('playwright');
const base = path.dirname(fileURLToPath(import.meta.url));
const url = pathToFileURL(path.join(base, 'index.html')).href;
const shots = path.join(base, 'screenshots');
fs.mkdirSync(shots, { recursive: true });

const browser = await chromium.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true, args: ['--no-sandbox', '--disable-dev-shm-usage'] });
const page = await browser.newPage({ viewport: { width: 1600, height: 1100 }, deviceScaleFactor: 1 });
const errors = []; page.on('pageerror', e => errors.push('page: ' + e.message.split('\n')[0])); page.on('console', m => { if (m.type() === 'error') errors.push('console: ' + m.text().split('\n')[0]); });
const checks = []; const check = (name, ok, detail) => checks.push({ name, pass: !!ok, detail });
const step = async (name, fn) => { try { await fn(); } catch (e) { errors.push('step ' + name + ': ' + e.message.split('\n')[0]); } };
const shot = (name) => page.screenshot({ path: path.join(shots, name + '.png'), fullPage: false });
const text = (sel) => page.locator(sel).innerText();
const count = (sel) => page.locator(sel).count();
const card = (type) => page.locator('.card').filter({ has: page.locator('.card-body') }).filter({ hasText: '' }).and(page.locator('[data-card]'));

await page.goto(url); await page.waitForTimeout(600);
await page.evaluate(() => localStorage.clear());
await page.reload(); await page.waitForTimeout(1500);
check('Workspace list renders three cards', await count('.ws-card[data-id]') === 3);
await shot('workspaces');

await step('open workspace', async () => {
  await page.click('.ws-card[data-id="ws_global_review"]'); await page.waitForTimeout(3000);
  check('Workspace opens with four compared allocations', await count('.member') === 4);
  check('Five cards render with data', await count('.card') === 5 && await count('.card .tbl.dd') === 1 && await count('.card svg.viz') >= 2);
  check('Rail shows the portfolio → category → product tree', await count('#tree .tree-row.depth-0') === 8 && await count('#tree .tree-row.depth-1') > 8);
  check('Hatched index remainder shows for under-implemented categories', await count('[data-card="c2"] rect[fill="url(#hatch)"]') >= 2);
  await shot('workspace');
});
await step('category target edit', async () => {
  const inp = page.locator('input[data-key="public_equity"]'); await inp.fill('50'); await inp.press('Enter'); await page.waitForTimeout(1600);
  check('Raising a target past 100% allocated is rejected without leverage', /105\.0%/.test(await text('#tree-err')));
  const back = page.locator('input[data-key="public_equity"]'); await back.fill('45'); await back.press('Enter'); await page.waitForTimeout(1200);
  const p = page.locator('input[data-key="public_equity/etf_us_lc"]'); await p.fill('18'); await p.press('Enter'); await page.waitForTimeout(1600);
  check('Lowering a product leaves the category target and shows the remainder at index level', (await text('#tree')).includes('2.0% index'));
  check('Undo becomes available', !(await page.locator('#undo-btn').isDisabled()));
  check('Index row appears in the Drivers & Differences table', await count('.tbl.dd tr.index-row') >= 1);
});
await step('sleeve from category', async () => {
  await page.click('.tree-row[data-key="public_equity"] [data-rowmenu]'); await page.waitForTimeout(300);
  await page.click('.menu-item:has-text("Create sleeve from category")'); await page.waitForTimeout(400);
  check('Create-sleeve dialog rescales weights to 100', (await text('.dialog')).includes('100.00%'));
  await page.fill('#sl-name', 'Test PE sleeve'); await page.click('.dialog [data-action="1"]'); await page.waitForTimeout(1500);
  check('Sleeve saved and products tagged', (await text('#tree')).includes('Test PE sleeve'));
});
await step('sleeve from selection', async () => {
  await page.click('#tree-select'); await page.waitForTimeout(300);
  check('Select mode shows checkboxes', await count('#tree .tsel') > 5);
  await page.check('#tree .tsel[data-sel="h7_fund_tsy"]'); await page.check('#tree .tsel[data-sel="h9_fund_hy"]'); await page.waitForTimeout(300);
  check('Selection bar counts two products', (await text('.selbar')).includes('2'));
  await page.click('#sel-create'); await page.waitForTimeout(400);
  check('Mixed selection is flagged and asks for a category', /mixed/i.test(await text('.dialog')));
  await page.fill('#sl-name', 'Mixed bonds'); await page.click('.dialog [data-action="1"]'); await page.waitForTimeout(1500);
  check('Select mode ends after saving', await count('.selbar') === 0);
  await shot('sleeve-created');
});
await step('apply a sleeve', async () => {
  await page.selectOption('#active-pick', 'al_growth'); await page.waitForTimeout(600);
  await page.click('.tree-row[data-key="hedge_funds"] [data-rowmenu]'); await page.waitForTimeout(300);
  await page.click('.menu-item:has-text("Apply a sleeve")'); await page.waitForTimeout(900);
  check('Apply dialog lists repository sleeves with a preview', await count('#ap-sleeve option') >= 5 && await count('#ap-preview table') === 1);
  await page.selectOption('#ap-sleeve', 'slv_core_alts'); await page.waitForTimeout(300);
  await shot('apply-sleeve');
  await page.click('.dialog [data-action="1"]'); await page.waitForTimeout(1600);
  check('Applied sleeve fills the category and tags it', (await text('#tree')).includes('Core Alternatives v1') && !(await text('.tree-row[data-key="hedge_funds"]')).includes('index'));
});
await step('cards: settings, follow row, data table', async () => {
  await page.click('.tbl.dd [data-row="ig_fixed_income"]'); await page.waitForTimeout(400);
  await page.click('[data-card="c4"] [data-settings]'); await page.waitForTimeout(300);
  await page.selectOption('.card-pop select[data-set="count"]', '1'); await page.waitForTimeout(1200); await page.keyboard.press('Escape');
  check('Card setting changes the drawdowns card', (await text('[data-card="c4"] .card-sub')).includes('Deepest 1'));
  await page.click('[data-card="c3"] [data-settings]'); await page.waitForTimeout(300); await page.click('.card-pop .switch:has([data-follow])'); await page.waitForTimeout(1400); await page.keyboard.press('Escape');
  check('Follow-row makes the cumulative return card show the selected category', (await text('[data-card="c3"] .card-sub')).includes('Investment Grade Fixed Income'));
  await page.click('[data-card="c2"] [data-menu]'); await page.waitForTimeout(200); await page.click('.menu-item:has-text("Show data table")'); await page.waitForTimeout(600);
  check('Data table twin appears', await count('[data-card="c2"] .card-data table') === 1);
});
await step('cards: add from repository, keyboard move, resize, remove, undo', async () => {
  await page.click('#cx-add'); await page.waitForTimeout(900);
  check('Card repository lists the catalogue and saved cards', await count('#card-sheet [data-add-type]') === 14 && await count('#card-sheet [data-add-saved]') === 3);
  await page.click('#card-sheet [data-add-type="stress-periods"]'); await page.waitForTimeout(1500);
  check('Catalogue card added', await count('.card') === 6);
  await page.click('#card-sheet [data-add-saved="card_rolling_vol"]'); await page.waitForTimeout(1500);
  check('Saved card added with its name', (await text('#cards')).includes('Rolling 36-month volatility'));
  await page.keyboard.press('Escape'); await page.waitForTimeout(300);
  const newCard = page.locator('.card').last(); const before = await newCard.evaluate(el => el.style.gridColumn);
  await newCard.focus(); await page.keyboard.press('ArrowRight'); await page.waitForTimeout(400);
  check('Arrow key moves a card', (await newCard.evaluate(el => el.style.gridColumn)) !== before);
  const spanBefore = Number((await newCard.evaluate(el => el.style.gridColumn)).split('span ')[1]);
  await page.keyboard.press('Shift+ArrowRight'); await page.waitForTimeout(400);
  check('Shift+arrow resizes a card', Number((await newCard.evaluate(el => el.style.gridColumn)).split('span ')[1]) === spanBefore + 1);
  await shot('cards-added');
  const target = page.locator('[data-card="c2"]'); await target.evaluate(el => el.scrollIntoView({ block: 'center', behavior: 'instant' })); await page.waitForTimeout(400); const rowBefore = await target.evaluate(el => el.style.gridRow); const head = await target.locator('.card-head').boundingBox();
  await page.mouse.move(head.x + head.width / 2, head.y + head.height / 2); await page.mouse.down(); await page.mouse.move(head.x + head.width / 2 + 10, head.y + 80, { steps: 6 }); await page.mouse.move(head.x + head.width / 2 + 10, head.y + 190, { steps: 6 }); await page.mouse.up(); await page.waitForTimeout(600);
  check('Dragging a card by its header moves it', (await target.evaluate(el => el.style.gridRow)) !== rowBefore);
  await newCard.locator('[data-menu]').click(); await page.waitForTimeout(200); await page.click('.menu-item:has-text("Remove from workspace")'); await page.waitForTimeout(600);
  check('Card removed', await count('.card') === 6);
  await page.keyboard.press('Meta+z'); await page.waitForTimeout(1200);
  check('Undo restores the card', await count('.card') === 7);
  await page.click('#cx-layout'); await page.waitForTimeout(200); await page.click('.menu-item:has-text("Pack cards")'); await page.waitForTimeout(600);
  check('Pack layout keeps every card on the grid', await count('.card') === 7);
});
await step('context bar', async () => {
  await page.click('[data-cx="basis"][data-val="historical"]'); await page.waitForTimeout(2000);
  check('Historical basis switches the table to backtests', /backtest|actual/i.test(await text('.tbl.dd thead')));
  await page.selectOption('#cx-period', '3y'); await page.waitForTimeout(2000);
  check('Period change flows to every history card', (await text('[data-card="c5"] .card-sub')).includes('Nov 2023'));
  await page.selectOption('#cx-period', 'common'); await page.click('[data-cx="basis"][data-val="forward"]'); await page.waitForTimeout(800);
  await page.click('#cx-scenario'); await page.waitForTimeout(500); await page.selectOption('#scn-sel', 'sc_rates'); await page.waitForTimeout(2000);
  check('Scenario columns appear in the table', /Δ vs Base/i.test(await text('.tbl.dd thead tr.sub')));
  await page.click('#drawer-close'); await page.waitForTimeout(400);
  await shot('scenario');
});
await step('persistence', async () => {
  await page.waitForTimeout(1000); await page.reload(); await page.waitForTimeout(3000);
  check('Cards, sleeves tags and scenario persist across a reload', await count('.card') === 7 && (await text('#tree')).includes('Core Alternatives') && /rates/i.test(await text('#scenario-btn')));
});
await step('sleeve repository', async () => {
  await page.goto(url + '#/sleeves'); await page.waitForTimeout(1500);
  check('Repository lists the shipped and new sleeves', await count('.repo-item') >= 7);
  await page.click('.repo-item[data-open="slv_core_bonds"]'); await page.waitForTimeout(400);
  const w = page.locator('[data-rw="0"]'); await w.fill('70'); await w.press('Enter'); await page.waitForTimeout(400);
  check('Editing a weight opens a new version and flags the total', await count('#rp-save') === 1 && await page.locator('#rp-save').isDisabled());
  await page.click('#rp-normalise'); await page.waitForTimeout(300);
  check('Normalise brings the total back to 100', !(await page.locator('#rp-save').isDisabled()));
  await page.fill('#rp-vnote', 'Treasuries raised'); await page.click('#rp-save'); await page.waitForTimeout(1200);
  check('Saved as v2', await count('[data-ver="2"]') === 1);
  await shot('sleeve-repository');
  await page.click('#rp-archive'); await page.waitForTimeout(300); await page.click('.dialog [data-action="1"]'); await page.waitForTimeout(1000);
  await page.click('[data-filter="archived"]'); await page.waitForTimeout(300);
  check('Archived sleeve appears under Archived', (await text('.repo-list')).includes('Core Bonds'));
  await page.click('.repo-item[data-open="slv_core_bonds"]'); await page.waitForTimeout(300); await page.click('#rp-restore'); await page.waitForTimeout(1000);
  check('Restore brings it back', (await text('.repo-list')).includes('Core Bonds'));
});
await step('failure states', async () => {
  await page.goto(url + '#/w/ws_global_review'); await page.waitForTimeout(2500);
  await page.evaluate(() => PA.api.configure({ failAnalytics: true })); await page.click('[data-cx="basis"][data-val="historical"]'); await page.waitForTimeout(1600);
  const failedBefore = await count('.card-status [data-retry]');
  check('Failed cards keep their last result and offer retry', failedBefore >= 1);
  await shot('calculation-failed');
  await page.evaluate(() => PA.api.configure({ failAnalytics: false, failSave: true })); await page.click('.card-status [data-retry]'); await page.waitForTimeout(1600);
  check('Retry recovers the card', await count('.card-status [data-retry]') < failedBefore);
  await page.click('[data-cx="basis"][data-val="forward"]'); await page.waitForTimeout(1600);
  check('A failed save is reported, not disguised', /not saved/i.test(await text('#save-status')));
  await page.evaluate(() => PA.api.configure({ failSave: false })); await page.click('#save-retry'); await page.waitForTimeout(1200);
  check('Save retry succeeds', /^saved/i.test(await text('#save-status')));
});
await step('responsive', async () => {
  await page.setViewportSize({ width: 1024, height: 900 }); await page.waitForTimeout(800); await shot('tablet-1024');
  await page.setViewportSize({ width: 390, height: 844 }); await page.waitForTimeout(800); await shot('phone-390');
  const w = await page.evaluate(() => ({ doc: document.documentElement.scrollWidth, win: window.innerWidth }));
  check('No horizontal page scroll at phone width', w.doc <= w.win + 1, JSON.stringify(w));
  await page.click('#rail-open'); await page.waitForTimeout(500); await shot('phone-390-builder'); await page.keyboard.press('Escape');
});
await browser.close();
const failed = checks.filter(c => !c.pass);
console.log(JSON.stringify({ passed: checks.length - failed.length, total: checks.length, failed, errors }, null, 2));
process.exit(failed.length || errors.length ? 1 : 0);

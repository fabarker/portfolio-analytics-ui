import {createRequire} from 'node:module';
import fs from 'node:fs';
import {fileURLToPath,pathToFileURL} from 'node:url';
import path from 'node:path';
const require=createRequire('/Users/francisbarker/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/package.json');
const {chromium}=require('playwright');
const base=path.dirname(fileURLToPath(import.meta.url));
const browser=await chromium.launch({executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',headless:true,args:['--no-sandbox','--disable-dev-shm-usage']});
const page=await browser.newPage({viewport:{width:1600,height:1100},deviceScaleFactor:1});
const errors=[];page.on('pageerror',e=>errors.push(e.message));
const url=pathToFileURL(path.join(base,'portfolio-analytics-requirements.html')).href;
await page.goto(url);
await page.waitForTimeout(400);
const checks=[];
function check(name,value){checks.push({name,pass:!!value});if(!value)console.error('FAIL',name);}
check('No runtime errors on initial render',errors.length===0);
const audit=await page.evaluate(()=>{const ids=[...document.querySelectorAll('[id]')].map(el=>el.id);return {duplicates:ids.filter((id,i)=>ids.indexOf(id)!==i),missing:[...document.querySelectorAll('a[href^="#"]')].filter(a=>!document.getElementById(a.hash.slice(1))).map(a=>a.hash),unresolved:/<!-- [A-Z_]+_CONTENT -->|__REFERENCE_|__SHOT_/.test(document.documentElement.innerHTML),navTargets:[...document.querySelectorAll('.doc-nav a')].map(a=>a.hash.slice(1)),sections:[...document.querySelectorAll('section[id]')].map(s=>s.id)};});
check('All section links resolve',audit.missing.length===0);check('No duplicate IDs',audit.duplicates.length===0);check('No unresolved build markers',!audit.unresolved);
check('Every section is in the navigation',audit.sections.every(id=>audit.navTargets.includes(id)));
const vocabulary=await page.evaluate(()=>{const text=document.body.innerText;return {oldSleeves:/Growth sleeve|Defensive sleeve|Diversifiers sleeve/.test(text),book:/\bbook\b/i.test(text),cards:/card repository/i.test(text),index:/index-level/i.test(text),sleeveRepo:/sleeve repository/i.test(text)};});
check('First-iteration sleeve names are gone',!vocabulary.oldSleeves);
check('Second-iteration vocabulary present',vocabulary.cards&&vocabulary.index&&vocabulary.sleeveRepo);
check('The word “book” does not appear',!vocabulary.book);
await page.screenshot({path:path.join(base,'document-overview.png'),fullPage:false});
// The workspace section embeds the mockup and its screenshots.
const ws=page.locator('#workspace-demo');
check('Fourteen mockup screenshots embedded',(await ws.locator('.shots img').count())===14);
check('Screenshots have alt text',await ws.locator('.shots img').evaluateAll(imgs=>imgs.every(i=>i.alt.length>20&&i.naturalWidth>0)));
await ws.locator('[data-mock-load]').click();
const frame=await (async()=>{for(let i=0;i<40;i++){const f=page.frames().find(f=>f.url().includes('workspace/index.html'));if(f){try{await f.waitForSelector('#cards .card',{timeout:15000});return f;}catch{return null;}}await page.waitForTimeout(250);}return null;})();
check('Mockup loads inside the document',!!frame);
if(frame){check('Mockup shows the category tree',(await frame.locator('#builder').innerText()).includes('Public Equity'));check('Mockup shows cards',(await frame.locator('#cards .card').count())>0);}
await ws.scrollIntoViewIfNeeded();await page.waitForTimeout(800);await page.screenshot({path:path.join(base,'document-workspace.png'),fullPage:false});
// Entry example: category targets.
const entry=page.locator('#entry-demo');await entry.locator('[data-entry=import]').click();await entry.locator('[data-open-workspace]').click();
check('Import preview shows the unallocated amount',(await entry.locator('.entry-preview').innerText()).includes('Unallocated 5.0%'));
check('Import preview lists categories modelled at index level',(await entry.locator('.entry-preview').innerText()).includes('index basket'));
await entry.locator('textarea').fill('Public Equity,55\nPublic Equity,10\nCash,30');await entry.locator('[data-open-workspace]').click();
check('Duplicate import rejected',(await entry.locator('.entry-error').innerText()).includes('Duplicate'));
await entry.locator('textarea').fill('Growth,55');await entry.locator('[data-open-workspace]').click();
check('Unknown category rejected',(await entry.locator('.entry-error').innerText()).includes('Unknown category'));
await entry.locator('[data-entry-search]').fill('sleeve');check('Sleeves appear in search',(await entry.locator('.entry-results').innerText()).includes('Core Alternatives'));
// Scenario example.
const sc=page.locator('#scenario-demo');await sc.locator('#sc-reset-demo').click();
check('Scenario matrix renders',(await sc.locator('input[type=number]').count())>5);
await sc.locator('[data-sc-scope="1"]').uncheck();await sc.locator('[data-sc-node="factor"][data-sc-field="0"]').fill('5');await sc.locator('[data-sc-node="factor"][data-sc-field="0"]').dispatchEvent('change');
check('Scenario scope leaves B unchanged',(await sc.locator('#sc-results-body tr').nth(4).locator('td').nth(2).innerText()).startsWith('4.50%'));
check('Scenario override changes A',(await sc.locator('#sc-results-body tr').nth(1).locator('td').nth(2).innerText()).startsWith('4.40%'));
await sc.locator('#sc-pair-select').selectOption('0,2');await sc.locator('#sc-pair-value').fill('0.80');await sc.locator('#sc-pair-value').dispatchEvent('change');
check('Correlation edits mirror symmetrically',(await sc.locator('[data-sc-corr="0,2"]').inputValue())==='0.80'&&(await sc.locator('[data-sc-corr="2,0"]').inputValue())==='0.80');
await sc.locator('#sc-pair-value').fill('1.2');await sc.locator('#sc-pair-value').dispatchEvent('change');check('Invalid correlation range rejected',(await sc.locator('#sc-error').innerText()).includes('between −1 and 1'));
await sc.locator('#sc-pair-select').selectOption('0,1');await sc.locator('#sc-pair-value').fill('-0.99');await sc.locator('#sc-pair-value').dispatchEvent('change');check('Invalid correlation structure rejected',(await sc.locator('#sc-error').innerText()).includes('not positive semidefinite'));
await sc.locator('#sc-reset-demo').click();await sc.scrollIntoViewIfNeeded();await page.screenshot({path:path.join(base,'document-scenarios.png'),fullPage:false});
// Chart example.
const charts=page.locator('#chart-demo');await charts.locator('[data-cd-mode=forward]').click();
check('Separate forecast charts render',(await charts.locator('.cd-small').count())===2);
await charts.locator('#cd-row').selectOption('growth');await charts.locator('[data-cd-measure=weighted]').click();
check('Weighted growth starts at category amount',(await charts.locator('.cd-chartbody').innerText()).includes('Start £55'));
check('Chart row is a category',(await charts.locator('#cd-row option:checked').innerText())==='Public Equity');
await charts.locator('#cd-horizon').selectOption('10');
check('Shared horizon changes',(await charts.locator('.cd-chartbody').innerText()).includes('Year 10'));
await charts.locator('[data-cd-view=scenarios]').click();check('Scenario chart retains native units',(await charts.locator('.cd-chartbody').innerText()).includes('Contribution to volatility (pp)'));
await charts.locator('[data-cd-view=projection]').click();
await charts.scrollIntoViewIfNeeded();await page.screenshot({path:path.join(base,'document-projections.png'),fullPage:false});
// State example.
const states=page.locator('#state-demo');await states.locator('[data-state-name]').fill('QA before edit');await states.locator('[data-state-snapshot]').click();await states.locator('[data-state-weight]').fill('40');await states.locator('[data-state-weight]').press('Tab');await page.waitForTimeout(550);
check('Snapshot unchanged after edit',(await states.locator('.state-snapshots').innerText()).includes('Public Equity 55%'));
check('Live return changed',(await states.locator('[data-state-return]').innerText())==='5.60%');
await states.locator('[data-state-kind]').selectOption('failure');check('Stale result labelled',(await states.locator('[data-state-return-label]').innerText()).includes('failed'));
await states.locator('[data-state-retry]').click();await page.waitForTimeout(550);check('Retry returns current',(await states.locator('[data-state-return-label]').innerText())==='Latest valid draft');
await states.locator('[data-state-kind]').selectOption('failure');await states.locator('[data-state-weight]').fill('30');await states.locator('[data-state-weight]').press('Tab');await page.waitForTimeout(550);await states.locator('[data-state-kind]').selectOption('ready');await page.waitForTimeout(550);check('Returning to ready recalculates stale values',(await states.locator('[data-state-return]').innerText())==='5.20%');
check('No runtime errors after interactions',errors.length===0);
await page.setViewportSize({width:390,height:844});await page.goto(url);await page.waitForTimeout(250);
const overflow=await page.evaluate(()=>({width:innerWidth,scroll:document.documentElement.scrollWidth,offenders:[...document.querySelectorAll('body *')].filter(e=>e.getBoundingClientRect().right>innerWidth+2&&getComputedStyle(e).position!=='absolute'&&!e.closest('.wrap,.sc-tablewrap,.cd-scroll,.cd-chartscroll,.table-scroll')).slice(0,10).map(e=>e.tagName+'.'+e.className)}));
check('Mobile page has no body overflow',overflow.scroll<=overflow.width+1);
await page.screenshot({path:path.join(base,'document-mobile.png'),fullPage:false});
console.log(JSON.stringify({checks,errors,audit:{duplicates:audit.duplicates,missing:audit.missing},overflow},null,2));await browser.close();if(checks.some(c=>!c.pass))process.exitCode=1;

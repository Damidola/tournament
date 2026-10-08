// Optional browser checks: Playwright and a Chromium installation are required.
const { chromium } = require('playwright');
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const root = path.resolve(__dirname, '..');
const mime = {'.html':'text/html','.js':'text/javascript','.css':'text/css','.svg':'image/svg+xml','.webmanifest':'application/manifest+json'};
const server = http.createServer((req,res)=>{
  const filename=path.join(root,decodeURIComponent(new URL(req.url,'http://localhost').pathname === '/' ? '/index.html' : new URL(req.url,'http://localhost').pathname));
  if(!filename.startsWith(root+path.sep)){res.writeHead(403);res.end();return}
  fs.readFile(filename,(error,bytes)=>{res.writeHead(error?404:200,{'Content-Type':mime[path.extname(filename)]||'text/plain'});res.end(error?'Not found':bytes)});
});
let browser;
const errors=[];
const database=async page=>page.evaluate(()=>['tournament-v2-a','tournament-v2-b'].map(k=>{try{return JSON.parse(JSON.parse(localStorage.getItem(k)).payload)}catch{return null}}).filter(Boolean).sort((a,b)=>b.revision-a.revision)[0]);
async function noOverflow(page){assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth), 'page has horizontal overflow')}
(async()=>{
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  const base=`http://127.0.0.1:${server.address().port}`;
  browser=await chromium.launch({headless:true,executablePath:process.env.CHROME_BIN||'/usr/bin/chromium',args:['--no-sandbox']});
  const context=await browser.newContext({viewport:{width:390,height:844},acceptDownloads:true});
  const p=await context.newPage();p.on('pageerror',e=>errors.push(e.message));
  await p.goto(base);await p.locator('h1').waitFor();await noOverflow(p);
  await p.locator('.page-heading [data-action=new]').click();
  await p.locator('[name=name]').fill('Детский кубок');await p.locator('[name=system]').selectOption('roundrobin');
  assert.equal(await p.locator('[name=name]').inputValue(),'Детский кубок');
  await p.locator('#create-form button[type=submit]').click();
  await p.locator('[data-action=bulk]').click();await p.locator('textarea[name=players]').fill('Анна\nБорис\nВера\nДенис');await p.locator('#bulk-form button[type=submit]').click();
  await p.locator('[data-action=start-ask]').click();await p.locator('[data-action=start-confirm]').click();
  await p.locator('.match-card').first().waitFor();assert.equal((await database(p)).tournaments[0].plannedRounds,3);
  assert.equal(await p.locator('[data-action=close-round]').isDisabled(),true);
  for(const c of await p.locator('.match-card').all())await c.locator('[data-result="1-0"]').click();
  assert.equal((await database(p)).tournaments[0].rounds[0].matches.filter(m=>m.result==='1-0').length,2);
  await p.reload();await p.locator('.match-card').first().waitFor();assert.equal(await p.locator('.result-btn.selected').count(),2);
  const rect=await p.locator('.result-btn').first().boundingBox();assert(rect.height>=44);
  await p.locator('[data-action=close-round]').click();await p.locator('[data-action=close-round-confirm]').click();
  await p.locator('[data-action=next-round]').click();
  for(const c of await p.locator('.match-card').all())await c.locator('[data-result="½-½"]').click();
  await p.locator('[data-action=close-round]').click();await p.locator('[data-action=close-round-confirm]').click();await p.locator('[data-action=next-round]').click();
  assert.equal((await database(p)).tournaments[0].rounds.length,3);
  await p.locator('[data-action=round][data-number="1"]').click();await p.locator('[data-action=rollback-ask]').click();await p.locator('[data-action=rollback-confirm]').click();
  assert.equal((await database(p)).tournaments[0].rounds.length,1);assert.equal(await p.locator('.result-btn.selected').count(),2);
  await p.locator('.match-card').first().locator('[data-result="0-1"]').click();
  assert.equal((await database(p)).tournaments[0].rounds[0].matches[0].result,'0-1');
  await p.locator('.tabs [data-target=history]').click();
  await p.locator('.history-item').filter({hasText:'Повернення до туру 1'}).locator('[data-action=restore-ask]').click();await p.locator('[data-action=restore-confirm]').click();
  const restored=(await database(p)).tournaments[0];assert.equal(restored.rounds.length,3);assert.equal(restored.rounds[0].matches[0].result,'1-0');
  await p.locator('.tabs [data-target=ranking]').click();await noOverflow(p);
  await p.locator('#ranking-through').selectOption('1');
  await p.locator('.ranking-mobile [data-action=profile]').first().click();await p.locator('#modal-title').waitFor();assert((await p.locator('.modal-body').textContent()).includes('після туру 1'));await p.locator('[data-action=dismiss]').click();
  const downloading=p.waitForEvent('download');await p.locator('.footnote [data-action=export-tour]').click();const download=await downloading;const saved=await download.path();
  const backup=JSON.parse(fs.readFileSync(saved,'utf8'));assert.equal(backup.tournaments[0].rounds.length,3);
  await p.locator('.mobile-nav [data-target=backup]').click();await p.locator('#import-file').setInputFiles(saved);
  await p.waitForFunction(()=>document.querySelector('#toast').textContent.includes('Відновлено турнірів: 1'));
  assert.equal((await database(p)).tournaments.length,2);
  // Recover explicitly from damaged slots. The untouched slot is retained.
  await p.evaluate(()=>{localStorage.setItem('tournament-v2-a','damaged-a');localStorage.setItem('tournament-v2-b','damaged-b')});await p.reload();
  await p.locator('#import-file').setInputFiles(saved);await p.locator('[data-action=recover-confirm]').click();
  assert.equal((await database(p)).tournaments.length,1);
  await p.locator('.mobile-nav [data-target=home]').click();await p.locator('.tournament-card').first().click();
  await p.setViewportSize({width:360,height:780});await noOverflow(p);
  await p.screenshot({path:'/tmp/tournament-round-mobile.png',fullPage:true});
  // Independent demonstration for the desktop layout.
  const desktop=await browser.newContext({viewport:{width:1440,height:1000}});const dp=await desktop.newPage();dp.on('pageerror',e=>errors.push(e.message));
  await dp.goto(base);await dp.locator('[data-action=demo]').click();await dp.locator('.match-card').first().waitFor();await noOverflow(dp);
  await dp.screenshot({path:'/tmp/tournament-desktop.png',fullPage:true});
  await dp.setViewportSize({width:390,height:844});await noOverflow(dp);await dp.screenshot({path:'/tmp/tournament-demo-mobile.png',fullPage:true});
  await dp.locator('.tabs [data-target=ranking]').click();await noOverflow(dp);await dp.screenshot({path:'/tmp/tournament-ranking-mobile.png',fullPage:true});
  assert.deepEqual(errors,[]);
  console.log('PASS: mobile and desktop layout, roster, results, reload, rollback, history restore, JSON transfer, damaged-storage recovery; no page errors.');
})().catch(error=>{console.error(error);process.exitCode=1}).finally(async()=>{if(browser)await browser.close();server.close()});

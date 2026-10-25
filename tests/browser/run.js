// Real Chromium against the real index.html + logic.js. The three CDN libraries
// are replaced by recording stand-ins (the sandbox can't reach the CDNs).
// Real-browser tests for the page itself. Run with: npm run test:browser
// Needs Playwright + Chromium (CI installs them). The three CDN libraries are
// replaced with small recording stand-ins, so this checks the page's own
// wiring (saving, syncing, editing, deleting, PDF contents), not the real
// OCR accuracy or the real PDF/chart libraries.
const { chromium } = require('playwright');
const assert = require('node:assert/strict');
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..', '..');
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.json': 'application/json' };
const server = http.createServer((req, res) => {
  const file = path.join(ROOT, req.url.split('?')[0] === '/' ? 'index.html' : req.url.split('?')[0]);
  if (!file.startsWith(ROOT) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) { res.writeHead(404); return res.end(); }
  res.writeHead(200, { 'content-type': TYPES[path.extname(file)] || 'application/octet-stream' });
  fs.createReadStream(file).pipe(res);
});
let ORIGIN = '', BASE = '';
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64');

const SAMPLE = `JIFFY LUBE #1234
Date: 2026-10-12   Time: 14:05
Odometer In: 61,250 km
Oil change - synthetic        79.99
Subtotal                     104.98
TOTAL                       $118.63`;

const STUB_CHART = `window.__charts=[];window.Chart=function(c,cfg){window.__charts.push(cfg);this.destroy=function(){}};`;
const STUB_TESS = `window.Tesseract={recognize:async function(cv,l,o){
  if(o&&o.logger)o.logger({status:'recognizing text',progress:0.5});
  window.__tessCalls=(window.__tessCalls||0)+1; window.__tessCanvas=[cv.width,cv.height];
  if(window.__ocrThrow)throw new Error('boom');
  return {data:{text:window.__ocrText}};}};`;
const STUB_PDF = `window.jspdf={jsPDF:function(o){
  var P=window.__pdf={texts:[],pages:1,saved:null,opts:o};
  this.setFont=this.setFontSize=this.setTextColor=this.setDrawColor=this.line=this.setPage=function(){};
  this.splitTextToSize=function(t){return String(t).split('\\n')};
  this.addPage=function(){P.pages++}; this.text=function(t){P.texts.push(t)};
  this.getNumberOfPages=function(){return P.pages}; this.save=function(n){P.saved=n};}};`;

let passed = 0, failed = 0;
async function check(name, fn) {
  try { await fn(); passed++; console.log('  ok   ' + name); }
  catch (e) { failed++; console.log('  FAIL ' + name + '\n       ' + String(e.message).split('\n').slice(0, 6).join('\n       ')); }
}

async function newPage(browser, opts = {}) {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, timezoneId: 'America/Toronto' });
  const page = await ctx.newPage();
  page.errors = [];
  page.on('pageerror', e => page.errors.push(String(e)));
  page.on('dialog', d => { (page.dialogs = page.dialogs || []).push(d.message()); d.accept(); });
  await page.route('**/*', route => {
    const u = route.request().url();
    if (u.startsWith(ORIGIN)) return route.continue();
    if (u.includes('Chart.js')) return route.fulfill({ contentType: 'text/javascript', body: STUB_CHART });
    if (u.includes('tesseract')) return opts.tessFail ? route.abort() : route.fulfill({ contentType: 'text/javascript', body: STUB_TESS });
    if (u.includes('jspdf')) return opts.pdfFail ? route.abort() : route.fulfill({ contentType: 'text/javascript', body: STUB_PDF });
    if (opts.gist && (u.includes('api.github.com') || u.includes('raw.example'))) return opts.gist(route);
    return route.abort();
  });
  if (opts.init) await page.addInitScript(opts.init);
  await page.goto(BASE);
  return { ctx, page };
}

async function addEntry(page, { vehicle = 'Civic', date, odo, category = 'maintenance', notes = '', receipt }) {
  await page.click('#addButton');
  await page.fill('#vehicleName', vehicle);
  if (date) await page.fill('#logDate', date);
  if (odo !== undefined) await page.fill('#odometer', String(odo));
  await page.selectOption('#category', category);
  await page.fill('#notes', notes);
  if (receipt !== undefined) await page.fill('#receiptText', receipt);
  await page.click('button:has-text("Save Log Entry")');
}
const store = (page, key) => page.evaluate(k => localStorage.getItem(k), key);

(async () => {
  await new Promise(r => server.listen(0, '127.0.0.1', r));
  ORIGIN = 'http://127.0.0.1:' + server.address().port;
  BASE = ORIGIN + '/index.html';
  const browser = await chromium.launch();

  console.log('Local mode');
  {
    const { ctx, page } = await newPage(browser, { init: "localStorage.setItem('vehicleLogUseCloud','false')" });
    await check('page loads with no script errors', async () => { assert.deepEqual(page.errors, []); });
    await check('receipt boxes exist in add and edit forms', async () => {
      for (const id of ['receiptFile', 'receiptStatus', 'receiptText', 'editReceiptFile', 'editReceiptStatus', 'editReceiptText'])
        assert.equal(await page.locator('#' + id).count(), 1, id);
    });

    await check('entry saved WITH typed receipt text; stored and shown', async () => {
      await addEntry(page, { date: '2026-10-12', odo: 61250, notes: 'Oil change', receipt: SAMPLE });
      const saved = JSON.parse(await store(page, 'vehicleReceipts')).receipts;
      const id = JSON.parse(await store(page, 'vehicleLogs'))[0].id;
      assert.equal(saved[id].text, SAMPLE);
      assert.ok(await page.locator('details.receipt-details').count() === 1);
      await page.click('details.receipt-details summary');
      assert.match(await page.locator('details.receipt-details pre').innerText(), /TOTAL\s+\$118\.63/);
    });

    await check('typed card/email in a receipt is redacted when saved', async () => {
      await addEntry(page, { date: '2026-10-13', odo: 61300, receipt: 'Paid 4111 1111 1111 1111 bob@example.com' });
      const all = JSON.parse(await store(page, 'vehicleReceipts')).receipts;
      const text = Object.values(all).map(r => r.text).join('\n');
      assert.ok(!/4111 1111|bob@/.test(text));
      assert.match(text, /\[card number removed\] \[email removed\]/);
      // remove it again so the later count-based checks stay simple
      const id = Object.keys(all).find(k => all[k].text.includes('removed'));
      await page.locator('.log-entry', { hasText: '61,300' }).locator('button[data-action=delete]').click();
      assert.equal(JSON.parse(await store(page, 'vehicleReceipts')).receipts[id], undefined);
    });

    await check('entry saved WITHOUT receipt has none stored and no receipt widget', async () => {
      await addEntry(page, { date: '2026-10-20', odo: 61900, notes: 'No receipt' });
      assert.equal(await page.locator('details.receipt-details').count(), 1); // still only the first entry
      assert.equal(Object.keys(JSON.parse(await store(page, 'vehicleReceipts')).receipts).length, 1);
    });

    await check('form is cleared after saving (no stale receipt text on the next entry)', async () => {
      await page.click('#addButton');
      assert.equal(await page.inputValue('#receiptText'), '');
      assert.equal(await page.textContent('#receiptStatus'), '');
      await page.click('text=Cancel >> nth=0');
    });

    await check('receipt text with HTML is escaped, not executed', async () => {
      await addEntry(page, { date: '2026-10-21', odo: 62000, receipt: '<img src=x onerror="window.__pwned=1"> <b>bold</b>' });
      await page.waitForTimeout(150);
      assert.equal(await page.evaluate(() => window.__pwned), undefined);
      assert.equal(await page.locator('details.receipt-details pre b').count(), 0);
      assert.deepEqual(page.errors, []);
    });

    await check('reload keeps the receipts (persisted on device)', async () => {
      await page.reload();
      assert.equal(await page.locator('details.receipt-details').count(), 2);
    });

    await check('edit shows receipt, change is saved, clearing it removes it', async () => {
      const first = page.locator('.log-entry', { hasText: 'Oil change' });
      await first.locator('button[data-action=edit]').click();
      assert.equal(await page.inputValue('#editReceiptText'), SAMPLE);
      await page.fill('#editReceiptText', 'EDITED RECEIPT');
      await page.click('button:has-text("Save Changes")');
      let id = JSON.parse(await store(page, 'vehicleLogs')).find(l => l.notes === 'Oil change').id;
      assert.equal(JSON.parse(await store(page, 'vehicleReceipts')).receipts[id].text, 'EDITED RECEIPT');
      await page.locator('.log-entry', { hasText: 'Oil change' }).locator('button[data-action=edit]').click();
      await page.fill('#editReceiptText', '   ');
      await page.click('button:has-text("Save Changes")');
      assert.equal(JSON.parse(await store(page, 'vehicleReceipts')).receipts[id], undefined);
    });

    await check('editing an entry that never had a receipt does not invent one', async () => {
      await page.locator('.log-entry', { hasText: 'No receipt' }).locator('button[data-action=edit]').click();
      assert.equal(await page.inputValue('#editReceiptText'), '');
      await page.click('button:has-text("Save Changes")');
      const id = JSON.parse(await store(page, 'vehicleLogs')).find(l => l.notes === 'No receipt').id;
      assert.equal(JSON.parse(await store(page, 'vehicleReceipts')).receipts[id], undefined);
    });

    await check('deleting an entry deletes its receipt text', async () => {
      const before = Object.keys(JSON.parse(await store(page, 'vehicleReceipts')).receipts).length;
      assert.equal(before, 1);
      await page.locator('.log-entry', { hasText: 'bold' }).locator('button[data-action=delete]').click();
      assert.equal(Object.keys(JSON.parse(await store(page, 'vehicleReceipts')).receipts).length, 0);
    });

    await check('Settings opens without throwing (pre-existing exportSection bug)', async () => {
      page.errors.length = 0;
      await page.click('button:has-text("Settings")');
      assert.deepEqual(page.errors, []);
    });
    await ctx.close();
  }

  console.log('Scanning (stand-in OCR)');
  {
    const { ctx, page } = await newPage(browser, { init: "localStorage.setItem('vehicleLogUseCloud','false')" });
    await page.evaluate(t => (window.__ocrText = t), SAMPLE);

    await check('scan fills text, date and odometer, reports total', async () => {
      await page.click('#addButton');
      await page.fill('#vehicleName', 'Civic');
      await page.setInputFiles('#receiptFile', { name: 'r.png', mimeType: 'image/png', buffer: PNG });
      await page.waitForFunction(() => document.getElementById('receiptStatus').textContent.includes('Receipt read'));
      assert.equal(await page.inputValue('#receiptText'), SAMPLE);
      assert.equal(await page.inputValue('#logDate'), '2026-10-12');
      assert.equal(await page.inputValue('#odometer'), '61250');
      const status = await page.textContent('#receiptStatus');
      assert.match(status, /date 2026-10-12/); assert.match(status, /61,250 km/); assert.match(status, /\$118\.63/);
      assert.equal(await page.evaluate(() => window.__tessCalls), 1);
    });

    await check('scan hides card numbers, emails and phones and says so', async () => {
      await page.evaluate(t => (window.__ocrText = t + '\nVisa 4111 1111 1111 1111\nbob@example.com\n(416) 555-1234'), SAMPLE);
      await page.fill('#receiptText', '');
      await page.setInputFiles('#receiptFile', { name: 'r.png', mimeType: 'image/png', buffer: PNG });
      await page.waitForFunction(() => document.getElementById('receiptText').value.includes('removed'));
      const text = await page.inputValue('#receiptText');
      assert.ok(!/4111|bob@|555-1234/.test(text), text);
      assert.match(text, /\[card number removed\]/); assert.match(text, /\[email removed\]/); assert.match(text, /\[phone removed\]/);
      assert.match(await page.textContent('#receiptStatus'), /details were hidden/);
      assert.match(text, /TOTAL\s+\$118\.63/);                     // real content survives
      await page.evaluate(t => (window.__ocrText = t), SAMPLE);
    });

    await check('scan never overwrites an odometer already typed in', async () => {
      await page.fill('#odometer', '70000');
      await page.fill('#receiptText', '');
      await page.setInputFiles('#receiptFile', { name: 'r.png', mimeType: 'image/png', buffer: PNG });
      await page.waitForFunction(() => document.getElementById('receiptText').value.length > 0);
      assert.equal(await page.inputValue('#odometer'), '70000');
    });

    await check('scanned text is saved with the entry', async () => {
      await page.click('button:has-text("Save Log Entry")');
      const id = JSON.parse(await store(page, 'vehicleLogs'))[0].id;
      assert.equal(JSON.parse(await store(page, 'vehicleReceipts')).receipts[id].text, SAMPLE);
      assert.equal(JSON.parse(await store(page, 'vehicleLogs'))[0].date.slice(0, 10) >= '2026-10-12', true);
    });

    await check('scan with no recognisable text: warns, leaves form usable', async () => {
      await page.evaluate(() => (window.__ocrText = '   \n  '));
      await page.click('#addButton');
      await page.setInputFiles('#receiptFile', { name: 'r.png', mimeType: 'image/png', buffer: PNG });
      await page.waitForFunction(() => document.getElementById('receiptStatus').textContent.includes('No text found'));
      assert.equal(await page.inputValue('#receiptText'), '');
      await page.fill('#receiptText', 'typed by hand');
      assert.equal(await page.inputValue('#receiptText'), 'typed by hand');
    });

    await check('OCR engine throwing: shows an error, form still usable', async () => {
      await page.evaluate(() => { window.__ocrThrow = true; });
      await page.setInputFiles('#receiptFile', { name: 'r.png', mimeType: 'image/png', buffer: PNG });
      await page.waitForFunction(() => document.getElementById('receiptStatus').textContent.includes('Could not scan'));
      assert.equal(await page.inputValue('#receiptText'), 'typed by hand');
    });

    await check('edit-form scan fills text but does NOT change date or odometer', async () => {
      await page.click('text=Cancel >> nth=0');
      await page.evaluate(t => { window.__ocrThrow = false; window.__ocrText = t; }, SAMPLE);
      await page.locator('.log-entry').first().locator('button[data-action=edit]').click();
      const odoBefore = await page.inputValue('#editOdometer');
      const dateBefore = await page.inputValue('#editLogDate');
      await page.setInputFiles('#editReceiptFile', { name: 'r.png', mimeType: 'image/png', buffer: PNG });
      await page.waitForFunction(() => document.getElementById('editReceiptStatus').textContent.includes('Receipt read'));
      assert.equal(await page.inputValue('#editOdometer'), odoBefore);
      assert.equal(await page.inputValue('#editLogDate'), dateBefore);
      assert.equal(await page.inputValue('#editReceiptText'), SAMPLE);
    });

    await check('a large photo is shrunk before OCR (max 1800px)', async () => {
      const big = await page.evaluate(async () => {
        const c = document.createElement('canvas'); c.width = 4000; c.height = 3000;
        const blob = await new Promise(r => c.toBlob(r, 'image/png'));
        const f = new File([blob], 'big.png', { type: 'image/png' });
        const dt = new DataTransfer(); dt.items.add(f);
        document.getElementById('editReceiptFile').files = dt.files;
        await window.scanReceipt('edit');
        return window.__tessCanvas;
      });
      assert.deepEqual(big, [1800, 1350]);
    });
    assert.deepEqual(page.errors, [], 'no page errors during scanning');
    await ctx.close();
  }

  console.log('Scanner load failure');
  {
    const { ctx, page } = await newPage(browser, { tessFail: true, init: "localStorage.setItem('vehicleLogUseCloud','false')" });
    await check('offline / blocked OCR library: friendly message, can still save manually', async () => {
      await page.click('#addButton');
      await page.fill('#vehicleName', 'Civic'); await page.fill('#odometer', '1000');
      await page.setInputFiles('#receiptFile', { name: 'r.png', mimeType: 'image/png', buffer: PNG });
      await page.waitForFunction(() => document.getElementById('receiptStatus').textContent.includes('Could not scan'));
      await page.fill('#receiptText', 'manual');
      await page.click('button:has-text("Save Log Entry")');
      assert.equal(JSON.parse(await store(page, 'vehicleLogs')).length, 1);
    });
    await ctx.close();
  }

  console.log('Cloud sync (mock Gist)');
  {
    const makeGist = state => route => {
      const req = route.request();
      if (req.url().includes('raw.example')) return route.fulfill({ contentType: 'text/plain', body: state.rawBody });
      if (req.method() === 'PATCH') { state.patches.push(JSON.parse(req.postData())); return route.fulfill({ status: 200, contentType: 'application/json', body: '{}' }); }
      return route.fulfill({ status: state.status || 200, contentType: 'application/json', body: JSON.stringify({ files: state.files }) });
    };
    const cloudInit = "localStorage.setItem('vehicleLogUseCloud','true');localStorage.setItem('vehicleLogGistId','g123');localStorage.setItem('vehicleLogGithubToken','tok');";
    const entry = { id: 'e1', vehicle: 'Civic', odometer: 5000, category: 'maintenance', notes: 'n', date: '2026-05-01T12:00:00.000Z', displayDate: '5/1/2026', displayTime: '08:00 AM' };

    await check('Gist WITH receipts.json: receipt shown; save PATCHes BOTH files and keeps existing receipts', async () => {
      const state = { patches: [], files: {
        'vehicle-logs.json': { content: JSON.stringify({ logs: [entry] }) },
        'receipts.json': { content: JSON.stringify({ receipts: { e1: { text: 'GIST RECEIPT', scannedAt: 't' } } }) } } };
      const { ctx, page } = await newPage(browser, { init: cloudInit, gist: makeGist(state) });
      await page.waitForSelector('details.receipt-details');
      await addEntry(page, { date: '2026-06-01', odo: 5200, receipt: 'NEW ONE' });
      await page.waitForFunction(() => document.getElementById('syncStatus').textContent.includes('Synced'));
      const files = state.patches.at(-1).files;
      assert.deepEqual(Object.keys(files).sort(), ['receipts.json', 'vehicle-logs.json']);
      const rec = JSON.parse(files['receipts.json'].content).receipts;
      assert.equal(rec.e1.text, 'GIST RECEIPT');
      assert.ok(Object.values(rec).some(r => r.text === 'NEW ONE'));
      assert.equal(JSON.parse(files['vehicle-logs.json'].content).logs.length, 2);
      await ctx.close();
    });

    await check('Gist WITHOUT receipts.json (existing user): logs load; first save creates it', async () => {
      const state = { patches: [], files: { 'vehicle-logs.json': { content: JSON.stringify({ logs: [entry] }) } } };
      const { ctx, page } = await newPage(browser, { init: cloudInit, gist: makeGist(state) });
      await page.waitForSelector('.log-entry');
      assert.equal(await page.locator('details.receipt-details').count(), 0);
      await addEntry(page, { date: '2026-06-01', odo: 5200, receipt: 'FIRST RECEIPT' });
      await page.waitForFunction(() => document.getElementById('syncStatus').textContent.includes('Synced'));
      const rec = JSON.parse(state.patches.at(-1).files['receipts.json'].content).receipts;
      assert.equal(Object.values(rec)[0].text, 'FIRST RECEIPT');
      await ctx.close();
    });

    await check('Gist without receipts.json does NOT wipe receipts already saved on this device', async () => {
      const state = { patches: [], files: { 'vehicle-logs.json': { content: JSON.stringify({ logs: [entry] }) } } };
      const init = cloudInit + "localStorage.setItem('vehicleReceipts', JSON.stringify({receipts:{e1:{text:'LOCAL ONLY',scannedAt:'t'}}}));";
      const { ctx, page } = await newPage(browser, { init, gist: makeGist(state) });
      await page.waitForSelector('details.receipt-details');
      await addEntry(page, { date: '2026-06-01', odo: 5200 });
      await page.waitForFunction(() => document.getElementById('syncStatus').textContent.includes('Synced'));
      assert.equal(JSON.parse(state.patches.at(-1).files['receipts.json'].content).receipts.e1.text, 'LOCAL ONLY');
      await ctx.close();
    });

    await check('large Gist (truncated files) is fetched in full from raw_url', async () => {
      const state = { patches: [], rawBody: JSON.stringify({ logs: [entry, Object.assign({}, entry, { id: 'e2', odometer: 6000 })] }), files: {
        'vehicle-logs.json': { truncated: true, content: '{"logs":[{"id":"e1"', raw_url: 'https://raw.example/logs' } } };
      const { ctx, page } = await newPage(browser, { init: cloudInit, gist: makeGist(state) });
      await page.waitForFunction(() => document.querySelectorAll('.log-entry').length === 2);
      await ctx.close();
    });

    await check('Gist unreachable: falls back to this device, receipts included, shows error state', async () => {
      const state = { patches: [], status: 500, files: {} };
      const init = cloudInit + "localStorage.setItem('vehicleLogs', JSON.stringify([" + JSON.stringify(entry) + "]));localStorage.setItem('vehicleReceipts', JSON.stringify({receipts:{e1:{text:'CACHED',scannedAt:'t'}}}));";
      const { ctx, page } = await newPage(browser, { init, gist: makeGist(state) });
      await page.waitForSelector('details.receipt-details');
      assert.match(await page.textContent('#syncStatus'), /Error/);
      await ctx.close();
    });
  }

  console.log('PDF service history');
  {
    const logs = [
      { id: 'a', vehicle: 'Civic', odometer: 49000, category: 'tires', tireSet: 'winter', tireAction: 'new_tires', notes: 'New winters', date: '2025-11-05T17:00:00.000Z', displayDate: '11/5/2025', displayTime: '12:00 PM' },
      { id: 'b', vehicle: 'Civic', odometer: 55000, category: 'tires', tireSet: 'summer', tireAction: 'seasonal_change', notes: '', date: '2026-04-15T16:00:00.000Z', displayDate: '4/15/2026', displayTime: '12:00 PM' },
      { id: 'c', vehicle: 'Civic', odometer: 61250, category: 'maintenance', notes: 'Oil change “synthetic” 🔧', date: '2026-10-12T16:00:00.000Z', displayDate: '10/12/2026', displayTime: '12:00 PM' },
      { id: 'z', vehicle: 'Other', odometer: 100, category: 'fuel', notes: 'other car', date: '2026-01-01T16:00:00.000Z', displayDate: '1/1/2026', displayTime: '12:00 PM' }
    ];
    const init = "localStorage.setItem('vehicleLogUseCloud','false');localStorage.setItem('vehicleLogs', JSON.stringify(" + JSON.stringify(logs) + "));localStorage.setItem('vehicleReceipts', JSON.stringify({receipts:{c:{text:'JIFFY LUBE\\nTOTAL $118.63',scannedAt:'t'}}}));";

    const { ctx, page } = await newPage(browser, { init });
    await page.click('button:has-text("📊 Analysis")');
    await page.selectOption('#analysisVehicleFilter', 'Civic');

    await check('PDF button is visible once a vehicle is selected', async () => {
      assert.ok(await page.locator('text=Download Service History').isVisible());
    });
    await check('PDF contains this vehicle only, in date order, with receipt text and tire summary', async () => {
      await page.click('text=Download Service History');
      await page.waitForFunction(() => window.__pdf && window.__pdf.saved);
      const pdf = await page.evaluate(() => window.__pdf);
      const all = pdf.texts.join('\n');
      assert.equal(pdf.saved, 'service-history-civic.pdf');
      assert.match(all, /Service History - Civic/);
      assert.ok(!/other car/.test(all));
      const headings = pdf.texts.filter(t => /\|.*km.*\|/.test(t)).map(t => t.slice(0, 10));
      assert.deepEqual(headings, ['2025-11-05', '2026-04-15', '2026-10-12']);
      assert.match(all, /JIFFY LUBE/); assert.match(all, /TOTAL \$118\.63/);
      assert.match(all, /Winter tires: 6,000 km \(since new tires\)/);
      assert.match(all, /Oil change "synthetic" /);          // smart quotes swapped, emoji dropped
      assert.ok(!/[“”\uD83D]/.test(all));
      assert.match(all, /Page 1 of 1/);
    });
    await check('PDF library blocked: clear message, no crash', async () => {
      const r = await newPage(browser, { init, pdfFail: true });
      await r.page.click('button:has-text("📊 Analysis")');
      await r.page.selectOption('#analysisVehicleFilter', 'Civic');
      await r.page.click('text=Download Service History');
      await r.page.waitForTimeout(300);
      assert.ok((r.page.dialogs || []).some(m => m.includes('Could not load the PDF tool')));
      assert.deepEqual(r.page.errors, []);
      await r.ctx.close();
    });
    await check('chart still renders with a time axis on the same data', async () => {
      const cfg = await page.evaluate(() => window.__charts.at(-1).options.scales.x.type);
      assert.equal(cfg, 'linear');
    });
    await ctx.close();
  }

  await browser.close();
  server.close();
  console.log(`\n${passed} passed, ${failed} failed`);
  process.exit(failed ? 1 : 0);
})();

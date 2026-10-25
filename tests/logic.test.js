// Run with: npm test   (Node 18+, no dependencies)
// The tests run in Toronto time on purpose: it is the timezone where the
// "UTC date is tomorrow in the evening" bug shows up.
process.env.TZ = 'America/Toronto';

const test = require('node:test');
const assert = require('node:assert/strict');
const L = require('../logic.js');

// ---- helpers ---------------------------------------------------------------

let nextId = 1;
// Build a log entry. `date` is a local YYYY-MM-DD (noon, local time).
function log(date, odometer, extra = {}) {
    const d = new Date(date + 'T12:00:00');
    return Object.assign({
        id: String(nextId++),
        vehicle: 'Civic',
        category: 'maintenance',
        odometer: odometer,
        notes: '',
        date: d.toISOString(),
        displayDate: d.toLocaleDateString()
    }, extra);
}
const tire = (date, odometer, tireSet, tireAction, extra = {}) =>
    log(date, odometer, Object.assign({ category: 'tires', tireSet, tireAction }, extra));

// ---- escapeHtml / formatTireAction -----------------------------------------

test('escapeHtml neutralises markup and quotes', () => {
    assert.equal(L.escapeHtml('<img src=x onerror="a()">'), '&lt;img src=x onerror=&quot;a()&quot;&gt;');
    assert.equal(L.escapeHtml(`Bob's "car" & co`), 'Bob&#39;s &quot;car&quot; &amp; co');
});

test('escapeHtml handles null, undefined and numbers', () => {
    assert.equal(L.escapeHtml(null), '');
    assert.equal(L.escapeHtml(undefined), '');
    assert.equal(L.escapeHtml(42), '42');
});

test('formatTireAction title-cases snake_case', () => {
    assert.equal(L.formatTireAction('seasonal_change'), 'Seasonal Change');
    assert.equal(L.formatTireAction('new_tires'), 'New Tires');
    assert.equal(L.formatTireAction(undefined), '');
});

// ---- dates -----------------------------------------------------------------

test('toLocalDateInput uses the local day, not the UTC day (9:30pm Toronto)', () => {
    const evening = new Date(2026, 9, 25, 21, 30); // Oct 25, 9:30pm local
    // This is the bug: in UTC it is already Oct 26.
    assert.equal(evening.toISOString().split('T')[0], '2026-10-26');
    assert.equal(L.toLocalDateInput(evening), '2026-10-25');
});

test('toLocalDateInput pads month and day', () => {
    assert.equal(L.toLocalDateInput(new Date(2026, 0, 5, 8, 0)), '2026-01-05');
});

test('editing an evening entry round-trips to the same day', () => {
    const stored = L.dateFromInput('2026-10-25', new Date(2026, 9, 25, 21, 30));
    // what the edit form shows, then saves again
    const shown = L.toLocalDateInput(new Date(stored.toISOString()));
    assert.equal(shown, '2026-10-25');
});

test('dateFromInput keeps the supplied time of day', () => {
    const d = L.dateFromInput('2026-03-02', new Date(2020, 0, 1, 14, 5, 9));
    assert.equal(d.getFullYear(), 2026);
    assert.equal(d.getMonth(), 2);
    assert.equal(d.getDate(), 2);
    assert.equal(d.getHours(), 14);
    assert.equal(d.getMinutes(), 5);
    assert.equal(d.getSeconds(), 9);
});

// ---- parseLogs / sorting ---------------------------------------------------

test('parseLogs accepts an array or {logs: []}', () => {
    assert.equal(L.parseLogs('[{"vehicle":"A"}]').length, 1);
    assert.equal(L.parseLogs('{"logs":[{"vehicle":"A"},{"vehicle":"B"}]}').length, 2);
});

test('parseLogs returns [] for empty, corrupt or wrong-shaped data', () => {
    assert.deepEqual(L.parseLogs(''), []);
    assert.deepEqual(L.parseLogs(null), []);
    assert.deepEqual(L.parseLogs('{not json'), []);
    assert.deepEqual(L.parseLogs('"hello"'), []);
    assert.deepEqual(L.parseLogs('{"logs":"nope"}'), []);
});

test('parseLogs drops non-object entries', () => {
    assert.deepEqual(L.parseLogs('[1, null, {"vehicle":"A"}]'), [{ vehicle: 'A' }]);
});

test('sortNewestFirst / sortOldestFirst order by date and do not mutate', () => {
    const a = log('2026-01-01', 100), b = log('2026-06-01', 200), c = log('2026-03-01', 150);
    const input = [a, b, c];
    assert.deepEqual(L.sortNewestFirst(input).map(l => l.odometer), [200, 150, 100]);
    assert.deepEqual(L.sortOldestFirst(input).map(l => l.odometer), [100, 150, 200]);
    assert.deepEqual(input.map(l => l.odometer), [100, 200, 150]);
});

test('sorting is stable for identical timestamps', () => {
    const a = log('2026-01-01', 100), b = log('2026-01-01', 110);
    assert.deepEqual(L.sortOldestFirst([a, b]).map(l => l.odometer), [100, 110]);
    assert.deepEqual(L.sortNewestFirst([a, b]).map(l => l.odometer), [100, 110]);
});

// ---- vehicles / stats ------------------------------------------------------

test('getVehicles returns unique names in first-seen order', () => {
    const logs = [log('2026-01-01', 1, { vehicle: 'B' }), log('2026-01-02', 2, { vehicle: 'A' }), log('2026-01-03', 3, { vehicle: 'B' })];
    assert.deepEqual(L.getVehicles(logs), ['B', 'A']);
    assert.deepEqual(L.getVehicles([]), []);
});

test('getVehicleStats summarises one vehicle', () => {
    const logs = [
        log('2026-01-01', 10000),
        log('2026-06-01', 15000),
        log('2026-03-01', 12000),
        log('2026-02-01', 99999, { vehicle: 'Other' })
    ];
    const s = L.getVehicleStats(logs, 'Civic');
    assert.equal(s.totalLogs, 3);
    assert.equal(s.latestOdometer, 15000);
    assert.equal(s.totalDistance, 5000);
    assert.equal(s.firstLog, logs[0].displayDate);
    assert.equal(s.lastLog, logs[1].displayDate);
});

test('getVehicleStats: first log is the earliest DATE, not the lowest odometer', () => {
    const early = log('2026-01-01', 50000), typo = log('2026-02-01', 400);
    const s = L.getVehicleStats([early, typo], 'Civic');
    assert.equal(s.firstLog, early.displayDate);
});

test('getVehicleStats returns null for an unknown vehicle', () => {
    assert.equal(L.getVehicleStats([log('2026-01-01', 1)], 'Nope'), null);
});

// ---- tire usage ------------------------------------------------------------

test('tires: null when the vehicle has no tire entries', () => {
    assert.equal(L.computeTireUsage([log('2026-01-01', 1000)]), null);
});

test('tires: seasonal changes only (the "No data" bug)', () => {
    const t = L.computeTireUsage([
        tire('2025-04-20', 40000, 'summer', 'seasonal_change'),
        log('2025-07-01', 44000),
        tire('2025-11-05', 49000, 'winter', 'seasonal_change'),
        tire('2026-04-15', 55000, 'summer', 'seasonal_change'),
        log('2026-10-20', 61000, { category: 'fuel' })
    ]);
    assert.equal(t.summer.km, 15000); // 40000->49000 plus 55000->61000
    assert.equal(t.winter.km, 6000);  // 49000->55000
    assert.equal(t.mounted, 'summer');
    assert.equal(t.summer.known, true);
    assert.equal(t.summer.sinceNew, false);
});

test('tires: new tires reset that set and are marked "since new"', () => {
    const t = L.computeTireUsage([
        tire('2024-04-01', 10000, 'summer', 'new_tires'),
        tire('2024-11-01', 18000, 'winter', 'new_tires'),
        tire('2025-04-01', 24000, 'summer', 'seasonal_change'),
        tire('2025-10-01', 31000, 'winter', 'seasonal_change'),
        log('2026-01-01', 33000)
    ]);
    assert.equal(t.summer.km, 15000);
    assert.equal(t.winter.km, 8000);
    assert.equal(t.mounted, 'winter');
    assert.equal(t.summer.sinceNew, true);
    assert.equal(t.winter.sinceNew, true);
});

test('tires: replacing a set with new tires restarts its count', () => {
    const t = L.computeTireUsage([
        tire('2024-04-01', 10000, 'summer', 'new_tires'),
        tire('2024-11-01', 20000, 'winter', 'seasonal_change'),
        tire('2025-04-01', 25000, 'summer', 'seasonal_change'),
        tire('2025-05-01', 26000, 'summer', 'new_tires'), // replaced the summers
        log('2025-09-01', 30000)
    ]);
    assert.equal(t.summer.km, 4000); // only 26000 -> 30000
    assert.equal(t.winter.km, 5000);
});

test('tires: a rotation does not switch the mounted set', () => {
    const t = L.computeTireUsage([
        tire('2025-04-01', 1000, 'summer', 'seasonal_change'),
        tire('2025-06-01', 3000, 'winter', 'rotation'), // logged against winter by mistake
        log('2025-08-01', 5000)
    ]);
    assert.equal(t.mounted, 'summer');
    assert.equal(t.summer.km, 4000);
    assert.equal(t.winter.km, 0);
    assert.equal(t.winter.known, false);
});

test('tires: a lone rotation tells us which set is on the car', () => {
    const t = L.computeTireUsage([
        tire('2025-01-01', 1000, 'winter', 'rotation'),
        log('2025-03-01', 2500)
    ]);
    assert.equal(t.mounted, 'winter');
    assert.equal(t.winter.km, 1500);
    assert.equal(t.summer.known, false);
});

test('tires: driving before the first tire entry is not counted', () => {
    const t = L.computeTireUsage([
        log('2025-01-01', 1000),
        tire('2025-02-01', 2000, 'winter', 'seasonal_change'),
        log('2025-03-01', 2500)
    ]);
    assert.equal(t.winter.km, 500);
});

test('tires: a backwards odometer reading is ignored, not subtracted or used as a baseline', () => {
    const t = L.computeTireUsage([
        tire('2025-01-01', 5000, 'summer', 'seasonal_change'),
        log('2025-02-01', 400), // typo
        log('2025-03-01', 5600)
    ]);
    assert.equal(t.summer.km, 600); // 5000 -> 5600 only
});

test('tires: input order does not matter (sorted by date internally)', () => {
    const entries = [
        tire('2025-04-20', 40000, 'summer', 'seasonal_change'),
        tire('2025-11-05', 49000, 'winter', 'seasonal_change'),
        log('2026-01-10', 52000)
    ];
    const a = L.computeTireUsage(entries);
    const b = L.computeTireUsage([...entries].reverse());
    assert.deepEqual(a, b);
    assert.equal(a.winter.km, 3000);
});

test('tires: entries missing tireSet or tireAction are ignored', () => {
    assert.equal(L.computeTireUsage([log('2025-01-01', 1, { category: 'tires' })]), null);
});

test('tires: string odometers are treated as numbers', () => {
    const t = L.computeTireUsage([
        tire('2025-01-01', '1000', 'summer', 'seasonal_change'),
        log('2025-02-01', '1750')
    ]);
    assert.equal(t.summer.km, 750);
});

// ---- analysis --------------------------------------------------------------

test('analysis: null for unknown vehicle', () => {
    assert.equal(L.computeAnalysis([log('2026-01-01', 1)], 'Nope'), null);
});

test('analysis: a single log gives null averages, not NaN/Infinity', () => {
    const a = L.computeAnalysis([log('2026-01-01', 5000)], 'Civic');
    assert.equal(a.totalDistance, 0);
    assert.equal(a.avgPerService, null);
    assert.equal(a.avgPerDay, null);
    assert.equal(a.daysTracked, 0);
});

test('analysis: totals and averages', () => {
    const a = L.computeAnalysis([
        log('2026-01-01', 10000),
        log('2026-01-31', 11000),
        log('2026-03-02', 13000)
    ], 'Civic');
    assert.equal(a.totalDistance, 3000);
    assert.equal(a.avgPerService, 1500);
    assert.equal(a.daysTracked, 60);
    assert.equal(a.avgPerDay, 50);
    assert.equal(a.tires, null);
});

test('analysis: points are chronological timestamps with odometer values', () => {
    const a = L.computeAnalysis([log('2026-06-01', 200), log('2026-01-01', 100)], 'Civic');
    assert.deepEqual(a.points.map(p => p.y), [100, 200]);
    assert.ok(a.points[0].x < a.points[1].x);
    assert.equal(typeof a.points[0].x, 'number');
});

test('analysis: includes tire usage when present', () => {
    const a = L.computeAnalysis([
        tire('2025-01-01', 1000, 'summer', 'seasonal_change'),
        log('2025-02-01', 1500)
    ], 'Civic');
    assert.equal(a.tires.summer.km, 500);
});

// ---- date ticks / chart ----------------------------------------------------

const ts = (y, m, d) => new Date(y, m - 1, d).getTime();

test('ticks: month-aligned for multi-month ranges, within range and capped', () => {
    const min = ts(2025, 3, 10), max = ts(2026, 10, 20);
    const { ticks, unit } = L.buildDateTicks(min, max, 6);
    assert.equal(unit, 'month');
    assert.ok(ticks.length >= 2 && ticks.length <= 6, `got ${ticks.length}`);
    ticks.forEach(t => {
        assert.equal(new Date(t).getDate(), 1);
        assert.ok(t >= min && t <= max);
    });
    assert.deepEqual([...ticks].sort((a, b) => a - b), ticks);
});

test('ticks: a year-long range lands on the 1st of whole months', () => {
    const { ticks } = L.buildDateTicks(ts(2026, 1, 1), ts(2026, 12, 31), 6);
    assert.ok(ticks.length >= 2);
    ticks.forEach(t => assert.equal(new Date(t).getDate(), 1));
});

test('ticks: short ranges use day ticks', () => {
    const { ticks, unit } = L.buildDateTicks(ts(2026, 10, 1), ts(2026, 10, 10), 6);
    assert.equal(unit, 'day');
    assert.ok(ticks.length >= 2 && ticks.length <= 6);
});

test('ticks: degenerate range (min == max) returns one tick without hanging', () => {
    const t = ts(2026, 5, 5);
    assert.deepEqual(L.buildDateTicks(t, t, 6).ticks, [t]);
});

test('chart: x axis is a numeric time axis with data x = timestamps', () => {
    const a = L.computeAnalysis([log('2026-01-01', 100), log('2026-01-02', 110), log('2026-06-01', 5000)], 'Civic');
    const cfg = L.buildOdometerChartConfig(a);
    assert.equal(cfg.options.scales.x.type, 'linear');
    const data = cfg.data.datasets[0].data;
    assert.equal(data.length, 3);
    data.forEach((p, i) => {
        assert.equal(p.x, a.points[i].x);
        assert.equal(p.y, a.points[i].y);
    });
    assert.equal(cfg.data.labels, undefined); // no per-entry category labels
});

test('chart: spacing is proportional to elapsed time, not to entry number', () => {
    // 2 entries one day apart, then one 5 months later
    const a = L.computeAnalysis([log('2026-01-01', 100), log('2026-01-02', 110), log('2026-06-01', 5000)], 'Civic');
    const xs = L.buildOdometerChartConfig(a).data.datasets[0].data.map(p => p.x);
    const day = xs[1] - xs[0];
    const months = xs[2] - xs[1];
    assert.equal(day, L.DAY_MS);
    assert.ok(months > 100 * day, 'the 5 month gap must be far larger than the 1 day gap');
});

test('chart: axis bounds contain every point; custom ticks are installed', () => {
    const a = L.computeAnalysis([log('2025-02-01', 100), log('2026-10-01', 9000)], 'Civic');
    const x = L.buildOdometerChartConfig(a).options.scales.x;
    a.points.forEach(p => assert.ok(p.x > x.min && p.x < x.max));
    const scale = { ticks: [] };
    x.afterBuildTicks(scale);
    assert.ok(scale.ticks.length >= 2);
    scale.ticks.forEach(t => assert.ok(t.value >= x.min && t.value <= x.max));
    assert.equal(typeof x.ticks.callback(scale.ticks[0].value), 'string');
});

test('chart: a single point still gets a sensible axis', () => {
    const a = L.computeAnalysis([log('2026-01-01', 100)], 'Civic');
    const r = L.paddedRange(a.points);
    assert.ok(r.max > r.min);
    const x = L.buildOdometerChartConfig(a).options.scales.x;
    assert.ok(x.max > x.min);
});

// ---- receipts --------------------------------------------------------------

const SAMPLE_RECEIPT = `JIFFY LUBE #1234
123 Main St, Toronto ON
Date: 2026-10-12   Time: 14:05
Odometer In: 61,250 km
Oil change - synthetic        79.99
Cabin air filter              24.99
Subtotal                     104.98
HST 13%                       13.65
TOTAL                       $118.63
Thank you!`;

test('receipt: parses date, odometer and total from a typical receipt', () => {
    assert.deepEqual(L.parseReceiptText(SAMPLE_RECEIPT), {
        date: '2026-10-12',
        odometer: 61250,
        total: '118.63'
    });
});

test('receipt date: ISO, month names, and unambiguous numeric formats', () => {
    assert.equal(L.parseReceiptDate('Invoice 2026/03/04'), '2026-03-04');
    assert.equal(L.parseReceiptDate('Oct 25, 2026 9:30pm'), '2026-10-25');
    assert.equal(L.parseReceiptDate('October 5th 2026'), '2026-10-05');
    assert.equal(L.parseReceiptDate('25 Oct 2026'), '2026-10-25');
    assert.equal(L.parseReceiptDate('25/10/2026'), '2026-10-25'); // 25 can't be a month
    assert.equal(L.parseReceiptDate('10/25/2026'), '2026-10-25');
    assert.equal(L.parseReceiptDate('05/05/2026'), '2026-05-05'); // same either way
});

test('receipt date: ambiguous or impossible dates return null', () => {
    assert.equal(L.parseReceiptDate('03/04/2026'), null);
    assert.equal(L.parseReceiptDate('2026-02-31'), null);
    assert.equal(L.parseReceiptDate('no date here'), null);
    assert.equal(L.parseReceiptDate(''), null);
    assert.equal(L.parseReceiptDate(null), null);
});

test('receipt odometer: keywords, separators and sane range', () => {
    assert.equal(L.parseReceiptOdometer('Mileage: 45123'), 45123);
    assert.equal(L.parseReceiptOdometer('ODOMETER IN  45 123 km'), 45123);
    assert.equal(L.parseReceiptOdometer('KM 120,500'), 120500);
    assert.equal(L.parseReceiptOdometer('Odometer: 12'), null);       // too small
    assert.equal(L.parseReceiptOdometer('Phone 416-555-1234'), null); // no keyword
    assert.equal(L.parseReceiptOdometer(''), null);
});

test('receipt total: uses the last total, ignoring subtotal and tax lines', () => {
    assert.equal(L.parseReceiptTotal('Subtotal 10.00\nTotal tax 1.30\nTOTAL: $11.30'), '11.30');
    assert.equal(L.parseReceiptTotal('Grand Total CAD 1,234.50'), '1234.50');
    assert.equal(L.parseReceiptTotal('Subtotal 10.00'), null);
    assert.equal(L.parseReceiptTotal('nothing'), null);
});

test('cleanReceiptText tidies OCR output and caps length', () => {
    assert.equal(L.cleanReceiptText('  a  \r\n\r\n\r\n\r\nb\t \n'), 'a\n\nb');
    assert.equal(L.cleanReceiptText('x\u0000y\u0007z'), 'xyz');
    assert.equal(L.cleanReceiptText(null), '');
    assert.equal(L.cleanReceiptText('a'.repeat(7000)).length, 6000);
});

test('parseReceipts reads the receipts.json shape and rejects junk', () => {
    const good = JSON.stringify({ receipts: { a1: { text: 'hello', scannedAt: 't' }, b2: { text: '  ' }, c3: 5 } });
    assert.deepEqual(L.parseReceipts(good), { a1: { text: 'hello', scannedAt: 't' } });
    assert.deepEqual(L.parseReceipts(''), {});
    assert.deepEqual(L.parseReceipts('{oops'), {});
    assert.deepEqual(L.parseReceipts('{"receipts":[1,2]}'), {});
    assert.deepEqual(L.parseReceipts('{"logs":[]}'), {});
});

test('withReceipt sets, replaces and clears without mutating', () => {
    const base = { a: { text: 'old', scannedAt: 'x' } };
    const now = new Date('2026-10-25T12:00:00Z');
    const set = L.withReceipt(base, 'b', ' new text ', now);
    assert.equal(set.b.text, 'new text');
    assert.equal(set.b.scannedAt, '2026-10-25T12:00:00.000Z');
    assert.equal(Object.keys(base).length, 1);
    assert.deepEqual(Object.keys(L.withReceipt(set, 'b', '   ')), ['a']);
});

test('buildGistFiles writes logs and receipts as separate files', () => {
    const files = L.buildGistFiles([{ id: '1' }], { 1: { text: 'r' } });
    assert.deepEqual(Object.keys(files), ['vehicle-logs.json', 'receipts.json']);
    assert.deepEqual(JSON.parse(files['vehicle-logs.json'].content), { logs: [{ id: '1' }] });
    assert.deepEqual(JSON.parse(files['receipts.json'].content), { receipts: { 1: { text: 'r' } } });
    // round trip through the readers the page uses
    assert.deepEqual(L.parseLogs(files['vehicle-logs.json'].content), [{ id: '1' }]);
    assert.deepEqual(L.parseReceipts(files['receipts.json'].content), { 1: { text: 'r', scannedAt: null } });
    // and a gist that has never had receipts
    assert.ok(JSON.parse(L.buildGistFiles([], undefined)['receipts.json'].content).receipts);
});

// ---- PDF report ------------------------------------------------------------

test('sanitizeForPdf keeps Latin-1, swaps smart punctuation, drops emoji', () => {
    assert.equal(L.sanitizeForPdf('Café “quote” – ok…'), 'Café "quote" - ok...');
    assert.equal(L.sanitizeForPdf('🔧 Tire ☀️'), ' Tire ');
    assert.equal(L.sanitizeForPdf(null), '');
});

test('buildServiceReport: null for unknown vehicle', () => {
    assert.equal(L.buildServiceReport([log('2026-01-01', 1)], {}, 'Nope'), null);
});

test('buildServiceReport: chronological entries with notes, tires and receipts', () => {
    const a = tire('2026-04-15', 55000, 'summer', 'seasonal_change', { notes: 'Swapped 🔧 at home' });
    const b = log('2026-10-12', 61250, { notes: 'Oil change' });
    const c = log('2025-11-05', 49000, { category: 'tires', tireSet: 'winter', tireAction: 'new_tires' });
    const receipts = { [b.id]: { text: 'JIFFY LUBE\nTOTAL $118.63\n\n\n\nThanks' } };
    const r = L.buildServiceReport([a, b, c], receipts, 'Civic', new Date(2026, 9, 25, 21, 30));

    assert.equal(r.title, 'Service History - Civic');
    assert.equal(r.generated, 'Generated 2026-10-25');
    assert.deepEqual(r.entries.map(e => e.heading.split('  |  ')[0]), ['2025-11-05', '2026-04-15', '2026-10-12']);
    assert.equal(r.entries[0].heading, '2025-11-05  |  49,000 km  |  Tires');
    assert.deepEqual(r.entries[0].lines, ['Tire service: Winter tires - New Tires']);
    assert.deepEqual(r.entries[1].lines, ['Tire service: Summer tires - Seasonal Change', 'Notes: Swapped  at home']);
    assert.deepEqual(r.entries[2].lines, ['Notes: Oil change']);
    assert.deepEqual(r.entries[2].receiptLines, ['JIFFY LUBE', 'TOTAL $118.63', '', 'Thanks']);
    assert.deepEqual(r.entries[0].receiptLines, []);
    assert.ok(r.summary.includes('Entries: 3'));
    assert.ok(r.summary.includes('Latest odometer: 61,250 km'));
    assert.ok(r.summary.includes('Distance tracked: 12,250 km'));
    assert.ok(r.summary.some(l => l.startsWith('Winter tires: 6,000 km (since new tires)')));
    assert.ok(r.summary.some(l => l === 'Summer tires: 6,250 km (since first tire entry)'));
});

test('buildServiceReport: no tire lines when the vehicle has no tire entries', () => {
    const r = L.buildServiceReport([log('2026-01-01', 1000), log('2026-02-01', 2000)], {}, 'Civic');
    assert.ok(!r.summary.some(l => /tires/i.test(l)));
});

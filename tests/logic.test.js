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
    assert.equal(L.cleanReceiptText('a'.repeat(13000)).length, 12000);
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

// ---- redaction -------------------------------------------------------------

test('redact: full card numbers (spaced, dashed, unbroken, Amex) are removed', () => {
    for (const card of ['4111 1111 1111 1111', '4111-1111-1111-1111', '4111111111111111', '3782 822463 10005', '378282246310005']) {
        assert.equal(L.redactSensitive(`Paid by ${card} thanks`), 'Paid by [card number removed] thanks', card);
    }
});

test('redact: digit runs that fail the card checksum are left alone', () => {
    assert.equal(L.redactSensitive('4111 1111 1111 1112'), '4111 1111 1111 1112');
    assert.equal(L.redactSensitive('Invoice 1234567890123456'), 'Invoice 1234567890123456');
});

test('redact: already-masked cards, dates, odometers and totals are untouched', () => {
    const keep = 'CARD ************1234  VISA **** **** **** 1234\nDate: 2026-10-12 14:05\nOdometer In: 61,250 km\nTOTAL $1,118.63\nStock 0123 4567';
    assert.equal(L.redactSensitive(keep), keep);
});

test('redact: emails are removed', () => {
    assert.equal(L.redactSensitive('Send to paul.j+car@gmail.com now'), 'Send to [email removed] now');
    assert.equal(L.redactSensitive('a@b.co and c@d.example.org'), '[email removed] and [email removed]');
});

test('redact: phone numbers in common formats are removed', () => {
    for (const phone of ['(416) 555-1234', '416-555-1234', '416.555.1234', '416 555 1234', '+1 416 555 1234', '1-416-555-1234']) {
        assert.equal(L.redactSensitive(`Tel ${phone} ok`), 'Tel [phone removed] ok', phone);
    }
    assert.equal(L.redactSensitive('416-555-1234'), '[phone removed]');
});

test('redact: a phone number does not swallow a neighbouring digit', () => {
    assert.equal(L.redactSensitive('9416-555-12345'), '9416-555-12345');
});

test('redact: on the sample receipt only the street address is hidden; date, odometer and total still parse', () => {
    const redacted = L.redactSensitive(SAMPLE_RECEIPT);
    assert.equal(redacted, SAMPLE_RECEIPT.replace('123 Main St,', '[address removed],'));
    assert.deepEqual(L.parseReceiptText(redacted), L.parseReceiptText(SAMPLE_RECEIPT));
});

test('redact: idempotent, safe on empty/non-string input', () => {
    const once = L.redactSensitive('4111 1111 1111 1111 a@b.com 416-555-1234');
    assert.equal(L.redactSensitive(once), once);
    assert.equal(L.redactSensitive(''), '');
    assert.equal(L.redactSensitive(null), '');
    assert.equal(L.redactSensitive(undefined), '');
});

test('redact: applied when a receipt is saved and when a report is built', () => {
    const saved = L.withReceipt({}, 'x', 'TOTAL $5.00\nVisa 4111 1111 1111 1111\nbob@example.com');
    assert.equal(saved.x.text, 'TOTAL $5.00\nVisa [card number removed]\n[email removed]');
    // an older, unredacted entry already in storage is still redacted in the PDF
    const entry = log('2026-01-01', 1000);
    const r = L.buildServiceReport([entry], { [entry.id]: { text: 'Visa 4111 1111 1111 1111' } }, 'Civic');
    assert.deepEqual(r.entries[0].receiptLines, ['Visa [card number removed]']);
});

test('luhnValid known values', () => {
    assert.equal(L.luhnValid('4111111111111111'), true);
    assert.equal(L.luhnValid('4111111111111112'), false);
    assert.equal(L.luhnValid(''), false);
});

test('logic.js uses no regex lookbehind (unsupported on iOS Safari before 16.4)', () => {
    const src = require('node:fs').readFileSync(require('node:path').join(__dirname, '..', 'logic.js'), 'utf8');
    assert.ok(!/\(\?<[=!]/.test(src), 'found a lookbehind assertion');
});

// ---- extra hiding: addresses, postal codes, VIN, plate, names --------------

// A made-up invoice laid out like a real one. Nothing here is a real person.
const FAKE_INVOICE = `ACME AUTO SERVICE
500 Example Boulevard
Ottawa, ON K1A 0B1
(613) 555-0142
shop@example.com
Invoice #4110001497
Created: 05/29/2025 at 9:35AM
Invoiced: 05/30/2025
JANE SAMPLE
45 Maple Crescent Unit 4
ORLEANS, ON K2P 1A1
Mobile: 613-555-0100
2011 Mazda 3 Sport GX (Red)
VIN: 1HGCM82633A004352
License Plate: ABC 123
Mileage In: 192,633 km
Part: NAPA Rack & Pinion Assembly  $1,631.37  1  $1,631.37
Part: W-1996 - ENVIRONMENTAL RECYCLING FEE  $2.99  1  $2.99
Labor: WHEEL ALIGNMENT  1.5  $224.99
Total: $4,370.55
Fri 5/30/2025 - Page 1 of 2`;

test('hiding: postal codes, any case and spacing; ZIP+4', () => {
    assert.equal(L.redactSensitive('Ottawa ON K1A 0B1'), 'Ottawa ON [postal code removed]');
    assert.equal(L.redactSensitive('k2p1a1'), '[postal code removed]');
    assert.equal(L.redactSensitive('M5V-2T6 ok'), '[postal code removed] ok');
    assert.equal(L.redactSensitive('Boston MA 02108-1234'), 'Boston MA [postal code removed]');
});

test('hiding: things that merely look like postal codes are kept', () => {
    assert.equal(L.redactSensitive('Part #: 262076'), 'Part #: 262076');
    assert.equal(L.redactSensitive('D1A 1A1'), 'D1A 1A1');            // D is never used in a postal code
    assert.equal(L.redactSensitive('Total $12345.67'), 'Total $12345.67');
    assert.equal(L.redactSensitive('Odometer 192,633'), 'Odometer 192,633');
});

test('hiding: street addresses at the start of a line', () => {
    assert.equal(L.redactSensitive('123 Maple Crescent'), '[address removed]');
    assert.equal(L.redactSensitive('45 Main St Unit 4'), '[address removed]');
    assert.equal(L.redactSensitive('1466 BRYERFIELD CRES'), '[address removed]');
    assert.equal(L.redactSensitive('  9 Elm Ave.'), '  [address removed]');
    assert.equal(L.redactSensitive('77 Lakeshore Blvd #12'), '[address removed]');
    // OCR often glues the next column on: only the address part goes
    assert.equal(L.redactSensitive('123 Maple Crescent VIN: 1HGCM82633A004352'), '[address removed] VIN: [VIN removed]');
});

test('hiding: part and price lines are not mistaken for addresses', () => {
    for (const line of ['Part: NAPA Power Steering Hoses $305.25', '2 Tie Rod End $105.77', 'Mileage In: 192,633 km',
                        'Labor: WHEEL ALIGNMENT 1.5 $224.99', 'Part: 1 Drive belt $20.00 (mid-line)']) {
        assert.equal(L.redactSensitive(line), line, line);
    }
});

test('hiding: VIN after a label or as a bare 17-character token', () => {
    assert.equal(L.redactSensitive('VIN: 1HGCM82633A004352'), 'VIN: [VIN removed]');
    assert.equal(L.redactSensitive('vin # 1hgcm82633a004352 x'), 'VIN: [VIN removed] x');
    assert.equal(L.redactSensitive('VIN: gM1BLTKF1B15'), 'VIN: [VIN removed]');       // partial, as OCR often returns
    assert.equal(L.redactSensitive('Chassis 1HGCM82633A004352 done'), 'Chassis [VIN removed] done');
    assert.equal(L.redactSensitive('VINYL SEAL 1234567'), 'VINYL SEAL 1234567');       // not a VIN label
    assert.equal(L.redactSensitive('Ref 12345678901234567'), 'Ref 12345678901234567'); // all digits, not a VIN
});

test('hiding: licence plate after its label, without eating the next field', () => {
    assert.equal(L.redactSensitive('License Plate: ABC 123'), 'License plate: [plate removed]');
    assert.equal(L.redactSensitive('Licence plate #: ab-12'), 'License plate: [plate removed]');
    assert.equal(L.redactSensitive('License Plate: CBF Mileage In: 192,633'), 'License plate: [plate removed] Mileage In: 192,633');
    assert.equal(L.redactSensitive('Plate glass $12.00'), 'Plate glass $12.00');       // no colon, not a label
});

test('hiding: a name right after Customer / Name / Bill to / Owner', () => {
    assert.equal(L.redactSensitive('Customer: Jane Sample'), 'Customer: [name removed]');
    assert.equal(L.redactSensitive('Bill to: Anne-Christine Auge'), 'Bill to: [name removed]');
    assert.equal(L.redactSensitive('Customer: Jane Sample  Bill to: ACME Ltd'), 'Customer: [name removed]  Bill to: [name removed]');
    assert.equal(L.redactSensitive('Customer Comments\nPOWER STEERING LEAK'), 'Customer Comments\nPOWER STEERING LEAK');
    assert.equal(L.redactSensitive('Service Writer: Dan Smith'), 'Service Writer: Dan Smith');
});

test('hiding: a realistic invoice loses the personal lines but keeps everything useful', () => {
    const out = L.redactSensitive(FAKE_INVOICE);
    for (const secret of ['Example Boulevard', 'K1A 0B1', 'K2P 1A1', '613) 555', '613-555', 'shop@example.com',
                          '1HGCM82633A004352', 'ABC 123', 'Maple Crescent'])
        assert.ok(!out.includes(secret), 'still contains: ' + secret);
    for (const keep of ['Invoice #4110001497', '05/29/2025', '05/30/2025', 'Mazda 3 Sport', 'Mileage In: 192,633 km',
                        '$1,631.37', '$2.99', '$224.99', 'Total: $4,370.55', 'WHEEL ALIGNMENT', 'RECYCLING FEE', 'Page 1 of 2'])
        assert.ok(out.includes(keep), 'lost: ' + keep);
    // a bare name on its own line cannot be recognised; this is a known limit
    assert.ok(out.includes('JANE SAMPLE'));
    assert.deepEqual(L.parseReceiptText(out), L.parseReceiptText(FAKE_INVOICE));
    assert.equal(L.parseReceiptText(out).odometer, 192633);
    assert.equal(L.parseReceiptText(out).total, '4370.55');
});

test('hiding: running it twice changes nothing more', () => {
    const once = L.redactSensitive(FAKE_INVOICE);
    assert.equal(L.redactSensitive(once), once);
});

// ---- multi-page receipts ---------------------------------------------------

test('pages: the first page into an empty box has no divider', () => {
    const r = L.appendReceiptPages('', ['Page one text']);
    assert.equal(r.text, 'Page one text');
    assert.equal(r.added, 1); assert.equal(r.skipped, 0);
});

test('pages: several pages at once get numbered dividers from page 2', () => {
    const r = L.appendReceiptPages('', ['AAA', 'BBB', 'CCC']);
    assert.equal(r.text, 'AAA\n\n--- Page 2 ---\n\nBBB\n\n--- Page 3 ---\n\nCCC');
    assert.equal(r.added, 3);
});

test('pages: scanning more later continues the numbering', () => {
    const first = L.appendReceiptPages('', ['AAA']).text;
    const second = L.appendReceiptPages(first, ['BBB']).text;
    const third = L.appendReceiptPages(second, ['CCC', 'DDD']).text;
    assert.equal(second, 'AAA\n\n--- Page 2 ---\n\nBBB');
    assert.ok(third.endsWith('--- Page 3 ---\n\nCCC\n\n--- Page 4 ---\n\nDDD'));
});

test('pages: typed text already in the box counts as page 1', () => {
    assert.equal(L.appendReceiptPages('typed by hand', ['scan']).text, 'typed by hand\n\n--- Page 2 ---\n\nscan');
});

test('pages: pages with no text are skipped and counted, and do not use up a number', () => {
    const r = L.appendReceiptPages('', ['AAA', '  \n ', 'CCC']);
    assert.equal(r.text, 'AAA\n\n--- Page 2 ---\n\nCCC');
    assert.equal(r.added, 2); assert.equal(r.skipped, 1);
    const none = L.appendReceiptPages('keep me', ['', '   ']);
    assert.equal(none.text, 'keep me'); assert.equal(none.added, 0); assert.equal(none.skipped, 2);
});

test('pages: every page is redacted, and hidden is reported', () => {
    const r = L.appendReceiptPages('', ['Visa 4111 1111 1111 1111', 'mail bob@example.com', 'clean']);
    assert.ok(!/4111|bob@/.test(r.text));
    assert.equal(r.hidden, true);
    assert.equal(L.appendReceiptPages('', ['clean']).hidden, false);
});

test('pages: date and odometer come from the first page, the total from the last', () => {
    const r = L.appendReceiptPages('', [
        'Date: 2026-10-12\nMileage In: 61,250 km\nSection total: $400.00',
        'Date: 2026-11-01\nMileage In: 99,999 km\nGRAND TOTAL $1,234.50']);
    assert.deepEqual(L.parseReceiptText(r.text), { date: '2026-10-12', odometer: 61250, total: '1234.50' });
});

test('pages: a two-page invoice fits; far too much is cut and flagged', () => {
    const page = ('Part: NAPA Rack & Pinion Assembly $1,631.37 1 $1,631.37\n').repeat(60); // about 3,500 characters
    const ok = L.appendReceiptPages('', [page, page, 'GRAND TOTAL $9,999.99']);
    assert.equal(ok.truncated, false);
    assert.ok(ok.text.endsWith('GRAND TOTAL $9,999.99'));
    const big = L.appendReceiptPages('', ['x'.repeat(8000), 'y'.repeat(8000)]);
    assert.equal(big.truncated, true);
    assert.equal(big.text.length, L.MAX_RECEIPT_CHARS);
});

test('pages: the receipt is still redacted when saved with dividers in it', () => {
    const joined = L.appendReceiptPages('', ['one', 'two']).text;
    const saved = L.withReceipt({}, 'x', joined + '\nVisa 4111 1111 1111 1111');
    assert.ok(saved.x.text.includes('--- Page 2 ---'));
    assert.ok(!saved.x.text.includes('4111'));
});

// ---- date sanity -----------------------------------------------------------

test('date sanity: a garbled future or ancient date is ignored in favour of the next real one', () => {
    const now = new Date(2026, 9, 26);
    assert.equal(L.parseReceiptDate('Created: 06/29/2029\nFooter Fri 5/30/2025', now), '2025-05-30');
    assert.equal(L.parseReceiptDate('2031-01-01 then 2025-05-30', now), '2025-05-30');
    assert.equal(L.parseReceiptDate('Oct 5, 2031 and Oct 6, 2025', now), '2025-10-06');
    assert.equal(L.parseReceiptDate('1985-03-04', now), null);
    assert.equal(L.parseReceiptDate('06/29/2029', now), null);
});

test('date sanity: today and tomorrow are still accepted, three days ahead is not', () => {
    const now = new Date(2026, 9, 26, 22, 0);
    assert.equal(L.parseReceiptDate('2026-10-26', now), '2026-10-26');
    assert.equal(L.parseReceiptDate('2026-10-27', now), '2026-10-27');
    assert.equal(L.parseReceiptDate('2026-10-29', now), null);
});

test('date sanity: parseReceiptText passes the clock through', () => {
    const now = new Date(2026, 9, 26);
    assert.equal(L.parseReceiptText('Date 2029-06-29\nOdometer 61,250 km', now).date, null);
});

test('hiding: an email the scanner split with a space is still hidden', () => {
    assert.equal(L.redactSensitive('Email: shop0411@outlook. com thanks'), 'Email: [email removed] thanks');
    assert.equal(L.redactSensitive('mail bob@example.ca now'), 'mail [email removed] now');
    assert.equal(L.redactSensitive('bob@example.com. Thanks'), '[email removed]. Thanks');  // does not swallow the next sentence
    assert.equal(L.redactSensitive('see x@y.co. Next'), 'see [email removed]. Next');
});

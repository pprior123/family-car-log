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

/*
 * Pure logic for the Family Vehicle Log app.
 * No DOM, no network, no storage: everything here is a plain function so it
 * can be unit tested with `npm test` (see tests/logic.test.js).
 *
 * In the browser this exposes a global `VehicleLogic`; in Node it is a
 * CommonJS module.
 */
(function (root, factory) {
    if (typeof module === 'object' && module.exports) {
        module.exports = factory();
    } else {
        root.VehicleLogic = factory();
    }
})(typeof self !== 'undefined' ? self : this, function () {
    'use strict';

    const DAY_MS = 24 * 60 * 60 * 1000;

    // ---------------------------------------------------------------- text --

    // Escape text before putting it into innerHTML.
    function escapeHtml(value) {
        return String(value === undefined || value === null ? '' : value)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#39;');
    }

    // "seasonal_change" -> "Seasonal Change"
    function formatTireAction(action) {
        return String(action || '')
            .replace(/_/g, ' ')
            .replace(/\b\w/g, c => c.toUpperCase());
    }

    // ---------------------------------------------------------------- dates --

    // YYYY-MM-DD for <input type="date">, using the LOCAL calendar day.
    // (date.toISOString() gives the UTC day, which is "tomorrow" in the evening
    // for anyone west of UTC.)
    function toLocalDateInput(date) {
        const y = date.getFullYear();
        const m = String(date.getMonth() + 1).padStart(2, '0');
        const d = String(date.getDate()).padStart(2, '0');
        return `${y}-${m}-${d}`;
    }

    // Build the Date stored on a log from a YYYY-MM-DD input. The time of day
    // comes from `timeSource` (an existing log's date, or "now") so that
    // same-day entries keep a stable order.
    function dateFromInput(dateInput, timeSource) {
        const d = new Date(dateInput + 'T00:00:00');
        d.setHours(timeSource.getHours(), timeSource.getMinutes(), timeSource.getSeconds(), 0);
        return d;
    }

    // ----------------------------------------------------------------- logs --

    // Parse stored JSON defensively: bad or missing data gives an empty list
    // instead of crashing the app.
    function parseLogs(text) {
        if (!text) return [];
        try {
            const parsed = JSON.parse(text);
            const list = Array.isArray(parsed) ? parsed : parsed && parsed.logs;
            return Array.isArray(list) ? list.filter(l => l && typeof l === 'object') : [];
        } catch (e) {
            return [];
        }
    }

    // Newest first. Array.prototype.sort is stable, so same-timestamp entries
    // keep their existing order.
    function sortNewestFirst(logs) {
        return [...logs].sort((a, b) => new Date(b.date) - new Date(a.date));
    }

    function sortOldestFirst(logs) {
        return [...logs].sort((a, b) => new Date(a.date) - new Date(b.date));
    }

    function getVehicles(logs) {
        return [...new Set(logs.map(log => log.vehicle))];
    }

    function getVehicleStats(logs, vehicle) {
        const vehicleLogs = logs.filter(log => log.vehicle === vehicle);
        if (vehicleLogs.length === 0) return null;

        const chronological = sortOldestFirst(vehicleLogs);
        const odometers = vehicleLogs.map(log => Number(log.odometer));
        const latestOdometer = Math.max(...odometers);

        return {
            totalLogs: vehicleLogs.length,
            latestOdometer: latestOdometer,
            totalDistance: latestOdometer - Math.min(...odometers),
            firstLog: chronological[0].displayDate,
            lastLog: chronological[chronological.length - 1].displayDate
        };
    }

    // ---------------------------------------------------------------- tires --

    /*
     * km driven on each tire set for one vehicle.
     *
     * Walks the logs oldest to newest. The distance between two consecutive
     * odometer readings is credited to whichever set was on the car. A
     * "seasonal_change" or "new_tires" entry switches the mounted set (the
     * entry's tireSet is the set being put ON); "new_tires" also resets that
     * set's count. Rotation/repair/other entries only tell us which set is on
     * the car if we don't know yet.
     *
     * Returns null when the vehicle has no tire entries.
     */
    function computeTireUsage(vehicleLogs) {
        const chronological = sortOldestFirst(vehicleLogs);
        const isTireLog = log => log.category === 'tires' && log.tireSet && log.tireAction;
        if (!chronological.some(isTireLog)) return null;

        const sets = {
            summer: { km: 0, known: false, sinceNew: false },
            winter: { km: 0, known: false, sinceNew: false }
        };
        let mounted = null;
        let lastOdo = null;

        chronological.forEach(log => {
            const odo = Number(log.odometer);
            if (lastOdo !== null && odo < lastOdo) {
                // Odometer went backwards (typo?): ignore this reading entirely
                // so one bad entry can't distort the next distance.
                return;
            }
            if (mounted && lastOdo !== null) {
                sets[mounted].km += odo - lastOdo;
            }
            lastOdo = odo;

            if (!isTireLog(log) || !sets[log.tireSet]) return;
            const set = sets[log.tireSet];

            if (log.tireAction === 'new_tires') {
                set.km = 0;
                set.sinceNew = true;
                set.known = true;
                mounted = log.tireSet;
            } else if (log.tireAction === 'seasonal_change') {
                set.known = true;
                mounted = log.tireSet;
            } else if (!mounted) {
                set.known = true;
                mounted = log.tireSet;
            }
        });

        return { mounted: mounted, summer: sets.summer, winter: sets.winter };
    }

    // ------------------------------------------------------------- analysis --

    function computeAnalysis(logs, vehicle) {
        const vehicleLogs = sortOldestFirst(logs.filter(log => log.vehicle === vehicle));
        if (vehicleLogs.length === 0) return null;

        const points = vehicleLogs.map(log => ({
            x: new Date(log.date).getTime(),
            y: Number(log.odometer),
            label: log.displayDate
        }));
        const odometers = points.map(p => p.y);
        const totalDistance = Math.max(...odometers) - Math.min(...odometers);
        const daysTracked = Math.floor((points[points.length - 1].x - points[0].x) / DAY_MS);

        return {
            vehicle: vehicle,
            points: points,
            totalDistance: totalDistance,
            // null when there is nothing to average (avoids NaN / Infinity)
            avgPerService: vehicleLogs.length > 1 ? totalDistance / (vehicleLogs.length - 1) : null,
            daysTracked: daysTracked,
            avgPerDay: daysTracked > 0 ? totalDistance / daysTracked : null,
            tires: computeTireUsage(vehicleLogs)
        };
    }

    // ---------------------------------------------------------------- chart --

    function monthTicks(minTs, maxTs, step) {
        const start = new Date(minTs);
        let idx = Math.floor((start.getFullYear() * 12 + start.getMonth()) / step) * step;
        const ticks = [];
        for (;;) {
            const d = new Date(Math.floor(idx / 12), idx % 12, 1);
            if (d.getTime() > maxTs) break;
            if (d.getTime() >= minTs) ticks.push(d.getTime());
            idx += step;
        }
        return ticks;
    }

    // Tick positions (timestamps) that land on real calendar boundaries:
    // days for short ranges, otherwise the 1st of every 1/2/3/6/12/... months.
    function buildDateTicks(minTs, maxTs, maxTicks) {
        maxTicks = maxTicks || 6;
        if (!(maxTs > minTs)) return { ticks: [minTs], unit: 'day' };

        const spanDays = (maxTs - minTs) / DAY_MS;
        if (spanDays <= 62) {
            const step = Math.max(1, Math.ceil(spanDays / (maxTicks - 1)));
            const ticks = [];
            const d = new Date(minTs);
            d.setHours(0, 0, 0, 0);
            while (d.getTime() <= maxTs) {
                if (d.getTime() >= minTs) ticks.push(d.getTime());
                d.setDate(d.getDate() + step);
            }
            return { ticks: ticks, unit: 'day' };
        }

        const steps = [1, 2, 3, 6, 12, 24, 60, 120];
        let ticks = [];
        for (const step of steps) {
            ticks = monthTicks(minTs, maxTs, step);
            if (ticks.length <= maxTicks) break;
        }
        return { ticks: ticks, unit: 'month' };
    }

    // Space the x axis for a little breathing room either side of the data.
    function paddedRange(points) {
        const xs = points.map(p => p.x);
        const min = Math.min(...xs);
        const max = Math.max(...xs);
        const pad = Math.max((max - min) * 0.04, DAY_MS);
        return { min: min - pad, max: max + pad };
    }

    // Chart.js config for the odometer-over-time chart. The x axis is a
    // numeric (timestamp) axis, so the gap between two points is proportional
    // to the time between the entries, not to their position in the list.
    function buildOdometerChartConfig(analysis) {
        const range = paddedRange(analysis.points);
        const tickInfo = buildDateTicks(range.min, range.max, 6);

        const formatTick = value => new Date(value).toLocaleDateString(
            undefined,
            tickInfo.unit === 'month'
                ? { month: 'short', year: 'numeric' }
                : { month: 'short', day: 'numeric' }
        );

        return {
            type: 'line',
            data: {
                datasets: [{
                    label: 'Odometer (km)',
                    data: analysis.points.map(p => ({ x: p.x, y: p.y })),
                    borderColor: '#667eea',
                    backgroundColor: 'rgba(102, 126, 234, 0.1)',
                    borderWidth: 3,
                    tension: 0.1,
                    fill: true,
                    pointRadius: 5,
                    pointHoverRadius: 7,
                    pointBackgroundColor: '#667eea',
                    pointBorderColor: '#fff',
                    pointBorderWidth: 2
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: true,
                plugins: {
                    title: {
                        display: true,
                        text: analysis.vehicle + ' - Odometer Progress',
                        font: { size: 16, weight: 'bold' }
                    },
                    legend: { display: false },
                    tooltip: {
                        callbacks: {
                            title: items => new Date(items[0].parsed.x).toLocaleDateString(),
                            label: context => context.parsed.y.toLocaleString() + ' km'
                        }
                    }
                },
                scales: {
                    y: {
                        beginAtZero: false,
                        ticks: { callback: value => value.toLocaleString() + ' km' },
                        title: { display: true, text: 'Odometer (km)' }
                    },
                    x: {
                        type: 'linear',
                        min: range.min,
                        max: range.max,
                        afterBuildTicks: scale => {
                            scale.ticks = tickInfo.ticks.map(value => ({ value: value }));
                        },
                        ticks: { callback: formatTick, maxRotation: 0 },
                        title: { display: true, text: 'Date' }
                    }
                }
            }
        };
    }

    // ------------------------------------------------------------- receipts --

    const MONTH_NUMBERS = {
        jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6,
        jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12
    };
    const MONTH_NAMES = '(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\\.?';

    function ymd(y, m, d) {
        const date = new Date(y, m - 1, d);
        const valid = date.getFullYear() === y && date.getMonth() === m - 1 && date.getDate() === d;
        return valid ? `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}` : null;
    }

    // Find a date in OCR text and return it as YYYY-MM-DD, or null. Numeric
    // dates like 03/04/2026 are ambiguous (March 4 or April 3?) so they are
    // only accepted when one reading is impossible; otherwise the person fills
    // the date in themselves rather than getting a silently wrong one.
    function parseReceiptDate(text) {
        const s = String(text || '');
        let m;

        const iso = /\b((?:19|20)\d{2})[-\/.](\d{1,2})[-\/.](\d{1,2})\b/g;
        while ((m = iso.exec(s))) {
            const r = ymd(+m[1], +m[2], +m[3]);
            if (r) return r;
        }

        const monthFirst = new RegExp('\\b' + MONTH_NAMES + '\\s+(\\d{1,2})(?:st|nd|rd|th)?,?\\s+((?:19|20)\\d{2})\\b', 'gi');
        while ((m = monthFirst.exec(s))) {
            const r = ymd(+m[3], MONTH_NUMBERS[m[1].toLowerCase()], +m[2]);
            if (r) return r;
        }

        const dayFirst = new RegExp('\\b(\\d{1,2})(?:st|nd|rd|th)?\\s+' + MONTH_NAMES + ',?\\s+((?:19|20)\\d{2})\\b', 'gi');
        while ((m = dayFirst.exec(s))) {
            const r = ymd(+m[3], MONTH_NUMBERS[m[2].toLowerCase()], +m[1]);
            if (r) return r;
        }

        const numeric = /\b(\d{1,2})[\/.-](\d{1,2})[\/.-]((?:19|20)\d{2})\b/g;
        while ((m = numeric.exec(s))) {
            const a = +m[1], b = +m[2], y = +m[3];
            let r = null;
            if (a > 12 && b <= 12) r = ymd(y, b, a);        // DD/MM/YYYY
            else if (b > 12 && a <= 12) r = ymd(y, a, b);   // MM/DD/YYYY
            else if (a === b) r = ymd(y, a, b);             // same either way
            if (r) return r;
        }
        return null;
    }

    // Odometer reading near a keyword such as "odometer" or "mileage".
    function parseReceiptOdometer(text) {
        const re = /(?:odometer|odo|mileage|milage|kilometers|kilometres|kms?)\b[^\d\n]{0,20}(\d{1,3}(?:[ ,]\d{3})+|\d{4,7})(?!\d)/gi;
        const s = String(text || '');
        let m;
        while ((m = re.exec(s))) {
            const value = parseInt(m[1].replace(/[ ,]/g, ''), 10);
            if (value >= 1000 && value <= 999999) return value;
        }
        return null;
    }

    // The last "total" style amount on the receipt, as a string like "123.45".
    // "Subtotal" and "Total tax" lines are deliberately not matched.
    function parseReceiptTotal(text) {
        const re = /(^|[^a-z])(?:grand\s+total|total\s+due|amount\s+due|balance\s+due|total)\b[^\dA-Za-z\n]{0,40}(?:(?:cad|usd)[^\dA-Za-z\n]{0,10})?(\d{1,3}(?:,\d{3})*\.\d{2}|\d+\.\d{2})/gim;
        const s = String(text || '');
        let m, last = null;
        while ((m = re.exec(s))) last = m[2].replace(/,/g, '');
        return last;
    }

    function parseReceiptText(text) {
        return {
            date: parseReceiptDate(text),
            odometer: parseReceiptOdometer(text),
            total: parseReceiptTotal(text)
        };
    }

    const MAX_RECEIPT_CHARS = 6000;

    // Tidy OCR output before it is stored: normalise line endings, drop control
    // characters and runs of blank lines, and cap the length.
    function cleanReceiptText(text) {
        return String(text || '')
            .replace(/\r\n?/g, '\n')
            .replace(/[^\n\t\x20-\x7E -￿]/g, '')
            .split('\n').map(line => line.replace(/\s+$/, '')).join('\n')
            .replace(/\n{3,}/g, '\n\n')
            .trim()
            .slice(0, MAX_RECEIPT_CHARS);
    }

    // receipts.json: { receipts: { "<logId>": { text, scannedAt } } }
    function parseReceipts(text) {
        if (!text) return {};
        try {
            const parsed = JSON.parse(text);
            const map = parsed && typeof parsed === 'object' ? parsed.receipts : null;
            if (!map || typeof map !== 'object' || Array.isArray(map)) return {};
            const result = {};
            Object.keys(map).forEach(id => {
                const r = map[id];
                if (r && typeof r.text === 'string' && r.text.trim()) {
                    result[id] = { text: r.text, scannedAt: r.scannedAt || null };
                }
            });
            return result;
        } catch (e) {
            return {};
        }
    }

    // The files PATCHed to the Gist. Receipt text lives in its own file so the
    // main log file stays small.
    function buildGistFiles(logs, receipts) {
        return {
            'vehicle-logs.json': { content: JSON.stringify({ logs: logs }, null, 2) },
            'receipts.json': { content: JSON.stringify({ receipts: receipts || {} }, null, 2) }
        };
    }

    // Passes the Luhn checksum that real card numbers satisfy. Used so that
    // long digit runs on a receipt (invoice numbers, dates, odometers) are not
    // mistaken for cards.
    function luhnValid(digits) {
        let sum = 0, alt = false;
        for (let i = digits.length - 1; i >= 0; i--) {
            let n = digits.charCodeAt(i) - 48;
            if (alt) { n *= 2; if (n > 9) n -= 9; }
            sum += n;
            alt = !alt;
        }
        return digits.length > 0 && sum % 10 === 0;
    }

    // Hide details that should not end up in a (possibly public) Gist: full
    // card numbers, email addresses and phone numbers. Already-masked cards
    // such as "**** 1234", dates, odometers and totals are left alone.
    // Written without lookbehind so it parses on older iPhones.
    function redactSensitive(text) {
        let s = String(text === undefined || text === null ? '' : text);

        s = s.replace(/\b\d(?:[ -]?\d){12,18}\b/g, match => {
            const digits = match.replace(/[ -]/g, '');
            return digits.length >= 13 && digits.length <= 19 && luhnValid(digits)
                ? '[card number removed]' : match;
        });

        s = s.replace(/[A-Za-z0-9._%+-]+@[A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)*\.[A-Za-z]{2,}/g, '[email removed]');

        s = s.replace(/(^|[^\d])(?:\+?1[ .-]?)?\(?\d{3}\)?[ .-]\d{3}[ .-]\d{4}(?!\d)/gm, '$1[phone removed]');

        return s;
    }

    // Set or clear one entry's receipt, returning a new map.
    function withReceipt(receipts, logId, text, now) {
        const next = Object.assign({}, receipts);
        const cleaned = redactSensitive(cleanReceiptText(text));
        if (cleaned) {
            next[logId] = { text: cleaned, scannedAt: (now || new Date()).toISOString() };
        } else {
            delete next[logId];
        }
        return next;
    }

    // -------------------------------------------------------------- report --

    // jsPDF's built-in fonts only cover Latin-1, so swap typographic
    // punctuation for plain equivalents and drop anything else (emoji, etc).
    function sanitizeForPdf(text) {
        return String(text === undefined || text === null ? '' : text)
            .replace(/[‘’]/g, "'")
            .replace(/[“”]/g, '"')
            .replace(/[–—]/g, '-')
            .replace(/…/g, '...')
            .replace(/\r/g, '')
            .replace(/[^\n\t\x20-\x7E -ÿ]/g, '');
    }

    function formatKm(n) {
        return Number(n).toLocaleString('en-US') + ' km';
    }

    // Everything the PDF needs, as plain data (the page just draws it).
    function buildServiceReport(logs, receipts, vehicle, generatedOn) {
        const analysis = computeAnalysis(logs, vehicle);
        if (!analysis) return null;
        const chronological = sortOldestFirst(logs.filter(log => log.vehicle === vehicle));
        const dayOf = log => toLocalDateInput(new Date(log.date));

        const summary = [
            'Entries: ' + chronological.length,
            'First entry: ' + dayOf(chronological[0]),
            'Latest entry: ' + dayOf(chronological[chronological.length - 1]),
            'Latest odometer: ' + formatKm(Math.max(...analysis.points.map(p => p.y))),
            'Distance tracked: ' + formatKm(analysis.totalDistance)
        ];
        if (analysis.tires) {
            ['summer', 'winter'].forEach(name => {
                const set = analysis.tires[name];
                const label = name.charAt(0).toUpperCase() + name.slice(1) + ' tires: ';
                summary.push(label + (set.known
                    ? formatKm(set.km) + (set.sinceNew ? ' (since new tires)' : ' (since first tire entry)')
                    : 'no data'));
            });
        }

        const entries = chronological.map(log => {
            const category = String(log.category || 'other');
            const lines = [];
            if (log.category === 'tires' && log.tireSet && log.tireAction) {
                lines.push('Tire service: ' + (log.tireSet === 'summer' ? 'Summer' : 'Winter') +
                    ' tires - ' + formatTireAction(log.tireAction));
            }
            if (log.notes) lines.push('Notes: ' + log.notes);

            const receipt = receipts && receipts[log.id] ? redactSensitive(cleanReceiptText(receipts[log.id].text)) : '';
            return {
                heading: sanitizeForPdf(`${dayOf(log)}  |  ${formatKm(log.odometer)}  |  ` +
                    category.charAt(0).toUpperCase() + category.slice(1)),
                lines: lines.map(sanitizeForPdf),
                receiptLines: receipt ? sanitizeForPdf(receipt).split('\n') : []
            };
        });

        return {
            title: sanitizeForPdf('Service History - ' + vehicle),
            generated: 'Generated ' + toLocalDateInput(generatedOn || new Date()),
            summary: summary,
            entries: entries
        };
    }

    return {
        DAY_MS: DAY_MS,
        escapeHtml: escapeHtml,
        formatTireAction: formatTireAction,
        toLocalDateInput: toLocalDateInput,
        dateFromInput: dateFromInput,
        parseLogs: parseLogs,
        sortNewestFirst: sortNewestFirst,
        sortOldestFirst: sortOldestFirst,
        getVehicles: getVehicles,
        getVehicleStats: getVehicleStats,
        computeTireUsage: computeTireUsage,
        computeAnalysis: computeAnalysis,
        buildDateTicks: buildDateTicks,
        paddedRange: paddedRange,
        buildOdometerChartConfig: buildOdometerChartConfig,
        parseReceiptDate: parseReceiptDate,
        parseReceiptOdometer: parseReceiptOdometer,
        parseReceiptTotal: parseReceiptTotal,
        parseReceiptText: parseReceiptText,
        cleanReceiptText: cleanReceiptText,
        redactSensitive: redactSensitive,
        luhnValid: luhnValid,
        parseReceipts: parseReceipts,
        buildGistFiles: buildGistFiles,
        withReceipt: withReceipt,
        sanitizeForPdf: sanitizeForPdf,
        buildServiceReport: buildServiceReport
    };
});

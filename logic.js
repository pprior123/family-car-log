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
        buildOdometerChartConfig: buildOdometerChartConfig
    };
});

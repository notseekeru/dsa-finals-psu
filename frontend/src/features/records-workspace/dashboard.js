import Chart from "chart.js/auto";

const PALETTE = ["--secondary", "--accent-dark", "--primary", "--accent", "--muted"];
const EMPTY_MESSAGE = "No records yet. Add or import a record to see the dashboard.";
const CHART_BASE = { responsive: true, maintainAspectRatio: false };
const MAX_GROUPS = 8;
const DATE_SHAPE = /^\d{4}-\d{2}-\d{2}/;

const liveCharts = [];
let renderToken = 0;

function peso(value) {
    return `₱${Number(value || 0).toFixed(2)}`;
}

function token(name) {
    return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
}

function palette() {
    return PALETTE.map(token);
}

function emptyStats() {
    return {
        totals: { records: 0, active: 0, archived: 0, categories: 0, amount: 0 },
        byDataset: [],
    };
}

function destroyCharts() {
    while (liveCharts.length > 0) liveCharts.pop().destroy();
}

function countAxis() {
    return {
        x: { grid: { display: false }, ticks: { color: token("--muted"), maxRotation: 0, autoSkip: true } },
        y: { beginAtZero: true, ticks: { color: token("--muted"), precision: 0 }, grid: { color: token("--border") } },
    };
}

function moneyAxis() {
    return {
        x: { grid: { display: false }, ticks: { color: token("--muted"), maxRotation: 0, autoSkip: true } },
        y: { beginAtZero: true, ticks: { color: token("--muted") }, grid: { color: token("--border") } },
    };
}

function toNumber(raw) {
    const cleaned = String(raw ?? "")
        .trim()
        .replace(/[,\s₱$]/g, "");
    if (!/^-?\d+(\.\d+)?$/.test(cleaned)) return null;
    const value = Number(cleaned);
    return Number.isFinite(value) ? value : null;
}

function profileColumns(records) {
    const keys = [];
    for (const record of records) {
        for (const key of Object.keys(record.data ?? {})) if (!keys.includes(key)) keys.push(key);
    }
    return keys.map((key) => {
        const values = records.map((record) => String(record.data?.[key] ?? "").trim());
        const filled = values.filter(Boolean);
        const numeric = filled.filter((value) => toNumber(value) !== null).length;
        const dates = filled.filter((value) => DATE_SHAPE.test(value)).length;
        return {
            key,
            filled,
            distinct: new Set(filled.map((value) => value.toLowerCase())).size,
            numericRank: filled.length > 0 ? numeric / filled.length : 0,
            dateRank: filled.length > 0 ? dates / filled.length : 0,
        };
    });
}

function pickColumns(records) {
    const profiles = profileColumns(records);
    const date = profiles.find((column) => column.dateRank >= 0.8 && column.filled.length >= 2) ?? null;
    const group = profiles.find((column) => column.dateRank < 0.5 && column.numericRank < 0.9 && column.distinct >= 2 && column.distinct <= 12) ?? null;
    const measure = profiles.find((column) => column !== date && column.numericRank >= 0.9 && column.filled.length >= 2) ?? null;
    return { date, group, measure };
}

function monthsBetween(records, dateKey) {
    const stamps = records
        .map((record) =>
            String(record.data?.[dateKey] ?? "")
                .trim()
                .slice(0, 10),
        )
        .filter((value) => DATE_SHAPE.test(value))
        .sort();
    if (stamps.length === 0) return [];
    const first = new Date(`${stamps[0]}T00:00:00`);
    const last = new Date(`${stamps[stamps.length - 1]}T00:00:00`);
    const buckets = [];
    const cursor = new Date(first.getFullYear(), first.getMonth(), 1);
    const end = new Date(last.getFullYear(), last.getMonth(), 1);
    while (cursor <= end && buckets.length < 24) {
        const key = `${cursor.getFullYear()}-${String(cursor.getMonth() + 1).padStart(2, "0")}`;
        buckets.push({ key, label: cursor.toLocaleDateString("en-US", { month: "short", year: "2-digit" }), count: 0, total: 0, records: records.filter((record) => String(record.data?.[dateKey] ?? "").startsWith(key)) });
        cursor.setMonth(cursor.getMonth() + 1);
    }
    for (const bucket of buckets) bucket.count = bucket.records.length;
    return buckets;
}

function groupSeries(records, groupKey) {
    const counts = new Map();
    for (const record of records) {
        const label = String(record.data?.[groupKey] ?? "").trim() || "(empty)";
        counts.set(label, (counts.get(label) ?? 0) + 1);
    }
    return [...counts.entries()]
        .map(([label, count]) => ({ label, count }))
        .sort((a, b) => b.count - a.count || a.label.localeCompare(b.label))
        .slice(0, MAX_GROUPS);
}

function measureSeries(records, groupKey, measureKey) {
    const totals = new Map();
    for (const record of records) {
        const label = String(record.data?.[groupKey] ?? "").trim() || "(empty)";
        const value = toNumber(record.data?.[measureKey]) ?? 0;
        totals.set(label, (totals.get(label) ?? 0) + value);
    }
    return [...totals.entries()]
        .map(([label, total]) => ({ label, total }))
        .sort((a, b) => b.total - a.total || a.label.localeCompare(b.label))
        .slice(0, MAX_GROUPS);
}

function topRows(records, measureKey) {
    const labelKey = Object.keys(records[0]?.data ?? {}).find((key) => {
        const sample = String(records[0]?.data?.[key] ?? "");
        return sample && toNumber(sample) === null && !DATE_SHAPE.test(sample);
    });
    return records
        .map((record) => ({ label: String(record.data?.[labelKey] ?? record.name ?? record.recordId ?? "").trim() || record.recordId, total: toNumber(record.data?.[measureKey]) ?? 0 }))
        .sort((a, b) => b.total - a.total)
        .slice(0, MAX_GROUPS);
}

function togglePanel(root, canvasId, emptyId, hasData, message) {
    const canvas = root.querySelector(`#${canvasId}`);
    const empty = root.querySelector(`#${emptyId}`);
    const wrap = canvas?.parentElement;

    if (wrap) wrap.hidden = !hasData;
    if (empty) {
        empty.hidden = hasData;
        empty.textContent = message;
    }
    return hasData ? canvas : null;
}

function lineChart(canvas, labels, values) {
    liveCharts.push(
        new Chart(canvas, {
            type: "line",
            data: {
                labels,
                datasets: [
                    {
                        label: "Records",
                        data: values,
                        borderColor: token("--secondary"),
                        backgroundColor: token("--accent"),
                        fill: true,
                        tension: 0.3,
                        pointRadius: 2,
                    },
                ],
            },
            options: { ...CHART_BASE, plugins: { legend: { display: false } }, scales: countAxis() },
        }),
    );
}

function barChart(canvas, labels, values, label, axis = countAxis()) {
    liveCharts.push(
        new Chart(canvas, {
            type: "bar",
            data: {
                labels,
                datasets: [{ label, data: values, backgroundColor: token("--secondary"), maxBarThickness: 48 }],
            },
            options: { ...CHART_BASE, plugins: { legend: { display: false } }, scales: axis },
        }),
    );
}

function doughnutChart(canvas, labels, values) {
    const colors = palette();
    liveCharts.push(
        new Chart(canvas, {
            type: "doughnut",
            data: {
                labels,
                datasets: [
                    {
                        data: values,
                        backgroundColor: values.map((_, index) => colors[index % colors.length]),
                        borderColor: token("--white"),
                        borderWidth: Number.parseInt(token("--border-width"), 10) || 1,
                    },
                ],
            },
            options: {
                ...CHART_BASE,
                cutout: "60%",
                plugins: { legend: { display: true, position: "bottom", labels: { color: token("--muted"), boxWidth: 10 } } },
            },
        }),
    );
}

export async function renderDashboard(root, { datasetId = null, getStats, getRecords = () => [] } = {}) {
    if (!root) return;
    const mine = ++renderToken;

    let stats = emptyStats();
    let message = EMPTY_MESSAGE;
    try {
        stats = await getStats(datasetId);
    } catch {
        message = "Could not load the dashboard.";
    }
    if (mine !== renderToken) return;

    const totals = stats.totals ?? emptyStats().totals;
    const setText = (selector, value) => {
        const node = root.querySelector(selector);
        if (node) node.textContent = value;
    };
    setText("#dsaKpiRecords", String(totals.records ?? 0));
    setText("#dsaKpiArchived", String(totals.archived ?? 0));
    setText("#dsaKpiAmount", peso(totals.amount));
    setText("#dsaKpiCategories", String(totals.categories ?? 0));

    const records = getRecords() ?? [];
    const hasData = records.length > 0;
    const { date, group, measure } = pickColumns(records);

    destroyCharts();

    const setTitle = (selector, text) => {
        const node = root.querySelector(selector);
        if (node) node.textContent = text;
    };

    const timeline = date ? monthsBetween(records, date.key) : [];
    const timeCanvas = togglePanel(root, "dsaTimeChart", "dsaTimeChartEmpty", hasData && timeline.length > 0, hasData ? "No date column in this file." : message);
    if (timeCanvas) {
        setTitle("#dsaTimeTitle", `Records per month by ${date.key}`);
        lineChart(
            timeCanvas,
            timeline.map((bucket) => bucket.label),
            timeline.map((bucket) => bucket.count),
        );
    }

    const groups = group ? groupSeries(records, group.key) : [];
    const groupCanvas = togglePanel(root, "dsaGroupChart", "dsaGroupChartEmpty", hasData && groups.length > 0, hasData ? "No repeating column to group by." : message);
    if (groupCanvas) {
        setTitle("#dsaGroupTitle", `Records per ${group.key}`);
        if (groups.length <= 6)
            doughnutChart(
                groupCanvas,
                groups.map((row) => row.label),
                groups.map((row) => row.count),
            );
        else
            barChart(
                groupCanvas,
                groups.map((row) => row.label),
                groups.map((row) => row.count),
                "Records",
            );
    }

    const series = measure ? (group ? measureSeries(records, group.key, measure.key) : topRows(records, measure.key)) : [];
    const measureCanvas = togglePanel(root, "dsaMeasureChart", "dsaMeasureChartEmpty", hasData && series.length > 0, hasData ? "No numeric column in this file." : message);
    if (measureCanvas) {
        setTitle("#dsaMeasureTitle", group ? `${measure.key} by ${group.key}` : `Top ${measure.key}`);
        barChart(
            measureCanvas,
            series.map((row) => row.label),
            series.map((row) => row.total),
            measure.key,
            moneyAxis(),
        );
    }
}

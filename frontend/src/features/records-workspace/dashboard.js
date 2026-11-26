import Chart from "chart.js/auto";
import { escapeHtml } from "./escape.js";

const PALETTE = ["--secondary", "--accent-dark", "--primary", "--accent", "--muted"];
const EMPTY_MESSAGE = "No records yet. Add or import a record to see the dashboard.";
const CHART_BASE = { responsive: true, maintainAspectRatio: false };

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
        byCategory: [],
        byStatus: [],
        monthly: [],
        byDataset: [],
        recent: [],
    };
}

function destroyCharts() {
    while (liveCharts.length > 0) liveCharts.pop().destroy();
}

function countAxis() {
    return {
        x: { grid: { display: false }, ticks: { color: token("--muted") } },
        y: { beginAtZero: true, ticks: { color: token("--muted"), precision: 0 }, grid: { color: token("--border") } },
    };
}

function mountCategoryChart(canvas, byCategory) {
    liveCharts.push(
        new Chart(canvas, {
            type: "bar",
            data: {
                labels: byCategory.map((row) => row.category),
                datasets: [{ label: "Records", data: byCategory.map((row) => row.count), backgroundColor: token("--secondary"), maxBarThickness: 48 }],
            },
            options: { ...CHART_BASE, plugins: { legend: { display: false } }, scales: countAxis() },
        }),
    );
}

function mountMonthlyChart(canvas, monthly) {
    liveCharts.push(
        new Chart(canvas, {
            type: "line",
            data: {
                labels: monthly.map((row) => row.month),
                datasets: [
                    {
                        label: "Records",
                        data: monthly.map((row) => row.count),
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

function mountStatusChart(canvas, byStatus) {
    const colors = palette();

    liveCharts.push(
        new Chart(canvas, {
            type: "doughnut",
            data: {
                labels: byStatus.map((row) => row.status),
                datasets: [
                    {
                        data: byStatus.map((row) => row.count),
                        backgroundColor: byStatus.map((_, index) => colors[index % colors.length]),
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

function mountDatasetChart(canvas, byDataset, onSelectDataset) {
    const colors = palette();

    liveCharts.push(
        new Chart(canvas, {
            type: "bar",
            data: {
                labels: byDataset.map((row) => row.name),
                datasets: [
                    {
                        label: "Records",
                        data: byDataset.map((row) => row.count),
                        backgroundColor: byDataset.map((_, index) => colors[index % colors.length]),
                        maxBarThickness: 48,
                    },
                ],
            },
            options: {
                ...CHART_BASE,
                plugins: {
                    legend: { display: false },
                    tooltip: {
                        callbacks: {
                            label: (item) => `${item.parsed.y} records · ${peso(byDataset[item.dataIndex].amount)}`,
                        },
                    },
                },
                scales: countAxis(),
                onClick: (_event, elements) => {
                    const hit = elements[0];
                    if (hit && onSelectDataset) onSelectDataset(byDataset[hit.index].datasetId);
                },
                onHover: (event, elements) => {
                    const target = event.native?.target;
                    if (target) target.style.cursor = elements.length > 0 ? "pointer" : "default";
                },
            },
        }),
    );
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

function activityRow(row) {
    return `<tr>
        <td class="dsa-table-id">${escapeHtml(row.recordId)}</td>
        <td>${escapeHtml(row.name)}</td>
        <td>${escapeHtml(row.category)}</td>
        <td><span class="dsa-status-pill">${escapeHtml(row.status)}</span></td>
        <td class="dsa-table-amount">${peso(row.amount)}</td>
        <td><time datetime="${escapeHtml(row.date)}">${escapeHtml(row.date)}</time></td>
    </tr>`;
}

export async function renderDashboard(root, { datasetId = null, onSelectDataset, getStats } = {}) {
    if (!root) return;
    const mine = ++renderToken;

    let stats = emptyStats();
    let message = EMPTY_MESSAGE;
    try {
        stats = await getStats(datasetId);
    } catch (error) {
        message = error instanceof Error ? error.message : "Could not load dashboard totals.";
    }

    if (mine !== renderToken) return;

    const setText = (selector, value) => {
        const el = root.querySelector(selector);
        if (el) el.textContent = value;
    };

    setText("#dsaKpiRecords", String(stats.totals.records));
    setText("#dsaKpiArchived", String(stats.totals.archived));
    setText("#dsaKpiAmount", peso(stats.totals.amount));
    setText("#dsaKpiCategories", String(stats.totals.categories));

    const hasData = stats.totals.records > 0;

    destroyCharts();

    const categoryCanvas = togglePanel(root, "dsaCategoryChart", "dsaCategoryChartEmpty", hasData && stats.byCategory.length > 0, message);
    if (categoryCanvas) mountCategoryChart(categoryCanvas, stats.byCategory);

    const monthlyCanvas = togglePanel(root, "dsaMonthlyChart", "dsaMonthlyChartEmpty", hasData && stats.monthly.length > 0, message);
    if (monthlyCanvas) mountMonthlyChart(monthlyCanvas, stats.monthly);

    const statusCanvas = togglePanel(root, "dsaStatusChart", "dsaStatusChartEmpty", hasData && stats.byStatus.length > 0, message);
    if (statusCanvas) mountStatusChart(statusCanvas, stats.byStatus);

    const byDataset = stats.byDataset ?? [];
    const datasetCanvas = togglePanel(root, "dsaDatasetChart", "dsaDatasetChartEmpty", byDataset.length > 0, message);
    if (datasetCanvas) mountDatasetChart(datasetCanvas, byDataset, onSelectDataset);

    const recent = stats.recent.slice(0, 5);
    const activityTable = root.querySelector("#dsaActivityTable");
    const activityBody = root.querySelector("#dsaActivityBody");
    const activityEmpty = root.querySelector("#dsaActivityEmpty");

    if (activityTable) activityTable.hidden = recent.length === 0;
    if (activityBody) activityBody.innerHTML = recent.map(activityRow).join("");
    if (activityEmpty) {
        activityEmpty.hidden = recent.length > 0;
        activityEmpty.textContent = message;
    }
}

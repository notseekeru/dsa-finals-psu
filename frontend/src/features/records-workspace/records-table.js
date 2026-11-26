import { escapeHtml } from "./escape.js";

export const CORE_COLUMNS = [
    { key: "recordId", label: "Record ID" },
    { key: "name", label: "Name" },
    { key: "category", label: "Category" },
    { key: "status", label: "Status" },
    { key: "amount", label: "Amount" },
    { key: "date", label: "Date" },
];

export function tableColumns(names = []) {
    const coreByKey = new Map(CORE_COLUMNS.map((column) => [column.key.toLowerCase(), column]));
    const seen = new Set();
    const core = [];
    const extras = [];
    for (const name of names) {
        const label = String(name ?? "").trim();
        if (!label || seen.has(label.toLowerCase())) continue;
        seen.add(label.toLowerCase());
        const match = coreByKey.get(label.toLowerCase());
        if (match) core.push({ ...match });
        else extras.push({ key: label, label, extra: true });
    }
    if (core.length === 0 && extras.length === 0) return CORE_COLUMNS.map((column) => ({ ...column }));
    const ordered = CORE_COLUMNS.filter((column) => core.some((c) => c.key === column.key));
    return [...ordered, ...extras];
}

function peso(value) {
    return `₱${Number(value || 0).toFixed(2)}`;
}

function headerCell(column, sortField, sortDir) {
    const active = column.key === sortField;
    const arrow = active ? `<span class="dsa-sort-arrow" aria-hidden="true">${sortDir === "asc" ? "▲" : "▼"}</span>` : "";
    const ariaSort = active ? (sortDir === "asc" ? "ascending" : "descending") : "none";

    return `<th scope="col" aria-sort="${ariaSort}">
        <button type="button" class="dsa-sort-btn${active ? " is-active" : ""}" data-sort-field="${escapeHtml(column.key)}">${escapeHtml(column.label)}${arrow}</button>
    </th>`;
}

function bodyCell(item, column) {
    if (column.extra) {
        const value = item.data?.[column.key];
        return `<td>${escapeHtml(value ?? "")}</td>`;
    }
    if (column.key === "amount") return `<td class="dsa-table-amount">${peso(item.amount)}</td>`;
    if (column.key === "date") {
        return `<td><time datetime="${escapeHtml(item.date)}">${escapeHtml(item.date)}</time></td>`;
    }
    if (column.key === "status") return `<td><span class="dsa-status-pill">${escapeHtml(item.status)}</span></td>`;
    if (column.key === "recordId") return `<td class="dsa-table-id">${escapeHtml(item.recordId)}</td>`;
    return `<td>${escapeHtml(item[column.key] ?? "")}</td>`;
}

function bodyRow(item, columns) {
    const actions = item.archived
        ? `<button type="button" class="dsa-mini-btn" data-action="archive" data-id="${escapeHtml(item.id)}">Restore</button>
        <button type="button" class="dsa-mini-btn dsa-danger-mini-btn" data-action="delete" data-id="${escapeHtml(item.id)}">Delete</button>`
        : `<button type="button" class="dsa-mini-btn" data-action="edit" data-id="${escapeHtml(item.id)}">Edit</button>
        <button type="button" class="dsa-mini-btn" data-action="archive" data-id="${escapeHtml(item.id)}">Archive</button>`;

    const cells = columns.map((column) => bodyCell(item, column)).join("");

    return `<tr>
        ${cells}
        <td>
            <div class="dsa-row-actions">
                ${actions}
            </div>
        </td>
    </tr>`;
}

export function recordsTableHtml(records, { columns, sortField, sortDir, notice = "" }) {
    const head = columns.map((column) => headerCell(column, sortField, sortDir)).join("");
    const body = records.map((item) => bodyRow(item, columns)).join("");
    const noticeHtml = notice ? `<p class="dsa-table-note">${escapeHtml(notice)}</p>` : "";

    return `${noticeHtml}<div class="dsa-table-scroll">
        <table class="dsa-table">
            <caption class="sr-only">All records in the current view</caption>
            <thead>
                <tr>${head}<th scope="col"><span class="sr-only">Actions</span></th></tr>
            </thead>
            <tbody>${body}</tbody>
        </table>
    </div>`;
}

export function sortRequestFromEvent(event, sortField, sortDir) {
    const button = event.target instanceof Element ? event.target.closest("[data-sort-field]") : null;
    if (!button) return null;

    const field = button.dataset.sortField;
    return { field, direction: field === sortField && sortDir === "asc" ? "desc" : "asc" };
}

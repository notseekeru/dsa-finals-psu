import { escapeHtml } from "./escape.js";

// AI HERE: /records/sort accepts only name, amount, recordId and date; making category and status sortable needs SORT_FIELDS extended first.
const COLUMNS = [
    { label: "Record", field: "recordId" },
    { label: "Name", field: "name" },
    { label: "Category", field: "" },
    { label: "Status", field: "" },
    { label: "Amount", field: "amount" },
    { label: "Date", field: "date" },
];

function peso(value) {
    return `₱${Number(value || 0).toFixed(2)}`;
}

function headerCell(column, sortField, sortDir) {
    if (!column.field) return `<th scope="col">${column.label}</th>`;

    const active = column.field === sortField;
    const arrow = active ? `<span class="dsa-sort-arrow" aria-hidden="true">${sortDir === "asc" ? "▲" : "▼"}</span>` : "";
    const ariaSort = active ? (sortDir === "asc" ? "ascending" : "descending") : "none";

    return `<th scope="col" aria-sort="${ariaSort}">
        <button type="button" class="dsa-sort-btn${active ? " is-active" : ""}" data-sort-field="${column.field}">${column.label}${arrow}</button>
    </th>`;
}

function bodyRow(item) {
    const actions = item.archived
        ? `<button type="button" class="dsa-mini-btn" data-action="archive" data-id="${escapeHtml(item.id)}">Restore</button>
        <button type="button" class="dsa-mini-btn dsa-danger-mini-btn" data-action="delete" data-id="${escapeHtml(item.id)}">Delete</button>`
        : `<button type="button" class="dsa-mini-btn" data-action="edit" data-id="${escapeHtml(item.id)}">Edit</button>
        <button type="button" class="dsa-mini-btn" data-action="archive" data-id="${escapeHtml(item.id)}">Archive</button>`;

    return `<tr>
        <td class="dsa-table-id">${escapeHtml(item.recordId)}</td>
        <td>${escapeHtml(item.name)}</td>
        <td>${escapeHtml(item.category)}</td>
        <td><span class="dsa-status-pill">${escapeHtml(item.status)}</span></td>
        <td class="dsa-table-amount">${peso(item.amount)}</td>
        <td><time datetime="${escapeHtml(item.date)}">${escapeHtml(item.date)}</time></td>
        <td>
            <div class="dsa-row-actions">
                ${actions}
            </div>
        </td>
    </tr>`;
}

export function recordsTableHtml(records, sortField, sortDir) {
    const head = COLUMNS.map((column) => headerCell(column, sortField, sortDir)).join("");
    const body = records.map(bodyRow).join("");

    return `<div class="dsa-table-scroll">
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

import { detectMapping, mapRows, parseCsv } from "./csv-importer.js";
import { renderDashboard } from "./dashboard.js";
import { deleteOption, renameOption } from "./dropdown-options.js";
import { escapeHtml } from "./escape.js";
import { createRecordsClient } from "./records-api.js";
import { CORE_COLUMNS, recordsTableHtml, sortRequestFromEvent, tableColumns } from "./records-table.js";
import "./workspace.css";

const SEARCH_DEBOUNCE_MS = 250;
const MAPPING_FIELDS = ["name", "amount", "date", "category", "status", "recordId"];
const MAX_PROBLEMS = 20;

function pluralizeCategoryLabel(category) {
    const clean = String(category ?? "").trim();
    if (!clean) return "";
    const lower = clean.toLowerCase();

    if (lower === "inventory") return "Inventory";
    if (lower === "customer") return "Customers";
    if (lower === "order") return "Orders";
    if (lower === "appointment") return "Appointments";

    if (/(?:s|x|z|ch|sh)$/i.test(clean)) return `${clean}es`;
    if (/[^aeiou]y$/i.test(clean)) return `${clean.slice(0, -1)}ies`;
    return `${clean}s`;
}

export async function mountRecordsWorkspace(container) {
    const client = await createRecordsClient();

    const state = {
        datasetId: null,
        datasets: [],
        sortField: "name",
        sortDir: "asc",
        searchMode: "linear",
        searchQuery: "",
        categoryFilter: "ALL",
        statusFilter: "ALL",
        activeNav: "home",
        viewMode: "table",
        metrics: { comparisons: 0, shifts: 0 },
        matches: null,
        statusText: "Ready.",
        dropdownOptions: { categories: [], statuses: [] },
        activeDropdownGroup: "categories",
        csvDraft: null,
        csvImporting: false,
    };
    let searchTimer;
    let searchToken = 0;

    const q = (sel) => container.querySelector(sel);
    const els = {
        searchInput: q("#dsaSearchInput"),
        filterToggleBtn: q("#dsaFilterToggleBtn"),
        filterDrawer: q("#dsaFilterDrawer"),
        searchMode: q("#dsaSearchMode"),
        categoryFilter: q("#dsaCategoryFilter"),
        statusFilter: q("#dsaStatusFilter"),
        sortDir: q("#dsaSortDir"),
        runSortBtn: q("#dsaRunSortBtn"),
        resetFiltersBtn: q("#dsaResetFiltersBtn"),
        dropdownTarget: q("#dsaDropdownTarget"),
        dropdownExistingSelect: q("#dsaDropdownExistingSelect"),
        dropdownInput: q("#dsaDropdownInput"),
        renameOptionBtn: q("#dsaRenameOptionBtn"),
        deleteOptionBtn: q("#dsaDeleteOptionBtn"),
        dropdownMsg: q("#dsaDropdownMsg"),
        newRecordBtn: q("#dsaNewRecordBtn"),
        navList: q(".dsa-nav-list"),
        navButtons: [...container.querySelectorAll(".dsa-nav-item")],
        datasetList: q("#dsaDatasetList"),
        workspaceTitle: q("#dsaWorkspaceTitle"),
        listViewBtn: q("#dsaListViewBtn"),
        gridViewBtn: q("#dsaGridViewBtn"),
        tableViewBtn: q("#dsaTableViewBtn"),
        statusBar: q("#dsaStatusBar"),
        dashboard: q("#dsaDashboard"),
        toggleSuggestedBtn: q("#dsaToggleSuggestedBtn"),
        suggestedRow: q("#dsaSuggestedRow"),
        toggleRecordsBtn: q("#dsaToggleRecordsBtn"),
        recordCountLabel: q("#dsaRecordCountLabel"),
        recordsContainer: q("#dsaRecordsContainer"),
        modal: q("#dsaRecordModal"),
        recordForm: q("#dsaRecordForm"),
        modalTitle: q("#dsaModalTitle"),
        closeModalBtn: q("#dsaCloseModalBtn"),
        cancelModalBtn: q("#dsaCancelModalBtn"),
        internalId: q("#dsaRecordInternalId"),
        fieldRecordId: q("#dsaFieldRecordId"),
        fieldName: q("#dsaFieldName"),
        fieldCategory: q("#dsaFieldCategory"),
        fieldStatus: q("#dsaFieldStatus"),
        fieldAmount: q("#dsaFieldAmount"),
        fieldDate: q("#dsaFieldDate"),
        csvSection: q("#dsaCsvSection"),
        browseCsvBtn: q("#dsaBrowseCsvBtn"),
        csvFileInput: q("#dsaCsvFileInput"),
        csvDropzone: q("#dsaCsvDropzone"),
        csvFileMeta: q("#dsaCsvFileMeta"),
        csvReviewBox: q("#dsaCsvReviewBox"),
        csvMapping: q("#dsaCsvMapping"),
        csvDetectedInfo: q("#dsaCsvDetectedInfo"),
        csvReadyCount: q("#dsaCsvReadyCount"),
        csvProblems: q("#dsaCsvProblems"),
        csvProblemsCount: q("#dsaCsvProblemsCount"),
        csvPreviewTable: q("#dsaCsvPreviewTable"),
        clearCsvBtn: q("#dsaClearCsvBtn"),
        importCsvBtn: q("#dsaImportCsvBtn"),
    };

    const refreshDashboard = () =>
        renderDashboard(els.dashboard, {
            datasetId: state.datasetId,
            onSelectDataset: (id) => selectDataset(id),
            getStats: (id) => client.stats(id),
        });

    const selectedDataset = () => state.datasets.find((dataset) => dataset.id === state.datasetId) ?? null;

    function datasetCreatedAt(value) {
        const text = String(value ?? "");
        return text.length >= 10 ? text.slice(0, 10) : text;
    }

    function renderDatasetList() {
        if (!els.datasetList) return;
        const total = state.datasets.reduce((sum, dataset) => sum + Number(dataset.rowCount ?? 0), 0);
        const rowsHtml = state.datasets
            .map((dataset) => {
                const rows = Number(dataset.rowCount ?? 0);
                const activeClass = dataset.id === state.datasetId ? " is-active" : "";
                return `<div class="dsa-file-row${activeClass}">
                <button type="button" class="dsa-file-select" data-dataset-id="${escapeHtml(dataset.id)}">
                    <span class="dsa-file-name">${escapeHtml(dataset.name)}</span>
                    <span class="dsa-file-meta">${rows} row${rows === 1 ? "" : "s"} · ${escapeHtml(datasetCreatedAt(dataset.createdAt))}</span>
                </button>
                <button type="button" class="dsa-file-delete" data-dataset-delete="${escapeHtml(dataset.id)}" data-dataset-name="${escapeHtml(dataset.name)}" data-dataset-rows="${rows}" aria-label="Delete all records in ${escapeHtml(dataset.name)}">Delete all</button>
            </div>`;
            })
            .join("");

        els.datasetList.innerHTML = `<div class="dsa-file-row${state.datasetId === null ? " is-active" : ""}">
            <button type="button" class="dsa-file-select" data-dataset-id="">
                <span class="dsa-file-name">All records</span>
                <span class="dsa-file-meta">${total} row${total === 1 ? "" : "s"}</span>
            </button>
        </div>
        ${rowsHtml}`;
    }

    async function loadDatasets() {
        try {
            state.datasets = await client.listDatasets();
        } catch (error) {
            state.datasets = [];
            state.statusText = error instanceof Error ? error.message : "Could not load files.";
        }
        if (state.datasetId !== null && !selectedDataset()) state.datasetId = null;
        renderDatasetList();
    }

    async function applyDatasetScope() {
        state.matches = null;
        const knownColumns = tableColumns(selectedDataset()?.columns ?? []).map((column) => column.key);
        if (!knownColumns.includes(state.sortField)) state.sortField = "name";
        renderDatasetList();
        await client.listRecords(state.datasetId);
        await applySort();
        await refreshDashboard();
    }

    async function selectDataset(id) {
        if (state.datasetId === id) return;
        state.datasetId = id;
        try {
            await applyDatasetScope();
        } catch (error) {
            state.statusText = error instanceof Error ? error.message : "Could not switch files.";
            render();
        }
    }

    async function deleteDatasetRecords(button) {
        const id = button.dataset.datasetDelete;
        const name = button.dataset.datasetName ?? "";
        const rows = Number(button.dataset.datasetRows ?? 0);
        if (!window.confirm(`Delete all ${rows} record(s) in "${name}"? This cannot be undone.`)) return;

        try {
            await client.deleteDataset(id);
            if (state.datasetId === id) {
                state.datasetId = null;
                state.matches = null;
            }
            await loadDatasets();
            await applySort();
            await refreshDashboard();
            state.statusText = `Deleted "${name}" and its ${rows} record(s).`;
        } catch (error) {
            state.statusText = error instanceof Error ? error.message : "Could not delete the file.";
        }
        render();
    }

    function populateSelectOptions(selectEl, values, { includeAll = false, allLabel = "All", selectedValue = "" } = {}) {
        if (!selectEl) return;
        const optionsHtml = [];
        if (includeAll) {
            optionsHtml.push(`<option value="ALL">${escapeHtml(allLabel)}</option>`);
        }
        for (const val of values) {
            optionsHtml.push(`<option value="${escapeHtml(val)}">${escapeHtml(val)}</option>`);
        }
        selectEl.innerHTML = optionsHtml.join("");

        const validValues = includeAll ? ["ALL", ...values] : values;
        if (selectedValue && validValues.includes(selectedValue)) {
            selectEl.value = selectedValue;
        } else if (values.length > 0) {
            selectEl.value = includeAll ? "ALL" : values[0];
        }
    }

    function renderSidebarNav() {
        if (!els.navList) return;

        const categories = state.dropdownOptions.categories || [];
        const isCategoryNav = categories.includes(state.activeNav);
        const isSpecialNav = state.activeNav === "home" || state.activeNav === "archived";

        if (!isCategoryNav && !isSpecialNav) {
            state.activeNav = "home";
        }

        const categoryButtonsHtml = categories
            .map((cat) => {
                const label = pluralizeCategoryLabel(cat);
                const activeClass = state.activeNav === cat ? " is-active" : "";
                return `<button class="dsa-nav-item${activeClass}" type="button" data-nav="${escapeHtml(cat)}">${escapeHtml(label)}</button>`;
            })
            .join("");

        els.navList.innerHTML = `
      <button class="dsa-nav-item${state.activeNav === "home" ? " is-active" : ""}" type="button" data-nav="home">Home</button>
      ${categoryButtonsHtml}
      <button class="dsa-nav-item${state.activeNav === "archived" ? " is-active" : ""}" type="button" data-nav="archived">Archived</button>
    `;

        els.navButtons = [...els.navList.querySelectorAll(".dsa-nav-item")];
        els.navButtons.forEach((btn) => {
            btn.addEventListener("click", () => {
                state.activeNav = btn.dataset.nav;
                els.navButtons.forEach((b) => {
                    b.classList.toggle("is-active", b === btn);
                });
                render();
            });
        });
    }

    function renderCsvPreviewTable(headers, rows) {
        if (!els.csvPreviewTable) return;
        const previewRows = rows.slice(0, 5);
        const thHtml = `<tr>${headers.map((header) => `<th>${escapeHtml(header)}</th>`).join("")}</tr>`;
        const tdHtml = previewRows.map((row) => `<tr>${headers.map((_, index) => `<td>${escapeHtml(row[index] ?? "")}</td>`).join("")}</tr>`).join("");
        els.csvPreviewTable.innerHTML = `<caption class="sr-only">CSV import preview</caption><thead>${thHtml}</thead><tbody>${tdHtml}</tbody>`;
    }

    function renderCsvMapping() {
        if (!els.csvMapping || !state.csvDraft) return;
        const { headers, mapping } = state.csvDraft;

        els.csvMapping.innerHTML = MAPPING_FIELDS.map((key) => {
            const label = CORE_COLUMNS.find((column) => column.key === key)?.label ?? key;
            const optionsHtml = [`<option value="">Not mapped</option>`].concat(headers.map((header) => `<option value="${escapeHtml(header)}"${header === mapping[key] ? " selected" : ""}>${escapeHtml(header)}</option>`)).join("");
            return `<label class="dsa-field dsa-csv-map-field">
                <span>${escapeHtml(label)}</span>
                <select data-map-field="${key}">${optionsHtml}</select>
            </label>`;
        }).join("");
    }

    function syncImportButton() {
        if (!els.importCsvBtn) return;
        els.importCsvBtn.disabled = state.csvImporting || (state.csvDraft?.mapped?.records.length ?? 0) === 0;
    }

    function renderCsvProblems() {
        if (!state.csvDraft) return;
        const mapped = state.csvDraft.mapped;
        const problems = [...state.csvDraft.parseProblems, ...(mapped?.problems ?? [])];
        const ready = mapped?.records.length ?? 0;
        const skipped = mapped?.skipped ?? 0;

        if (els.csvReadyCount) {
            els.csvReadyCount.textContent = `${ready} row${ready === 1 ? "" : "s"} ready to import${skipped > 0 ? `, ${skipped} duplicate row${skipped === 1 ? "" : "s"} skipped` : ""}.`;
        }
        if (els.csvProblemsCount) {
            const shown = Math.min(problems.length, MAX_PROBLEMS);
            els.csvProblemsCount.textContent = problems.length === 0 ? "No problems found." : `${problems.length} problem${problems.length === 1 ? "" : "s"} (${shown} shown).`;
        }
        if (els.csvProblems) {
            els.csvProblems.innerHTML = problems
                .slice(0, MAX_PROBLEMS)
                .map((problem) => `<li><span class="dsa-csv-problem-row">${problem.row ? `Row ${escapeHtml(problem.row)}` : "File"}</span>${problem.column ? `<span class="dsa-csv-problem-col">${escapeHtml(problem.column)}</span>` : ""}<span>${escapeHtml(problem.reason)}</span></li>`)
                .join("");
        }
        syncImportButton();
    }

    function recomputeCsvPreview() {
        if (!state.csvDraft) return;
        const { headers, rows, mapping } = state.csvDraft;
        // AI HERE: one bulk call for the whole file; past a few thousand rows the main thread stalls during mapping, so chunk mapRows/importRecords by file size.
        state.csvDraft.mapped = mapRows(headers, rows, mapping);
        renderCsvPreviewTable(headers, rows);
        renderCsvProblems();
    }

    function resetCsvImporter() {
        state.csvDraft = null;
        if (els.csvFileInput) els.csvFileInput.value = "";
        if (els.csvFileMeta) els.csvFileMeta.textContent = "No CSV file selected yet.";
        if (els.csvReviewBox) els.csvReviewBox.hidden = true;
        if (els.csvMapping) els.csvMapping.innerHTML = "";
        if (els.csvProblems) els.csvProblems.innerHTML = "";
        if (els.csvProblemsCount) els.csvProblemsCount.textContent = "";
        if (els.csvReadyCount) els.csvReadyCount.textContent = "";
        if (els.csvPreviewTable) els.csvPreviewTable.innerHTML = "";
        if (els.csvDetectedInfo) els.csvDetectedInfo.textContent = "";
        syncImportButton();
    }

    function handleCsvFileSelected(file) {
        if (!file) return;
        resetCsvImporter();

        const isCsv = file.name.toLowerCase().endsWith(".csv") || file.type.includes("csv");
        if (!isCsv) {
            if (els.csvFileMeta) els.csvFileMeta.textContent = "Please select a valid .csv file.";
            return;
        }

        const reader = new FileReader();
        reader.onload = () => {
            const text = String(reader.result ?? "");
            const { headers, rows, problems, fatal } = parseCsv(text);
            if (fatal) {
                if (els.csvFileMeta) els.csvFileMeta.textContent = `${file.name}: ${fatal.reason}`;
                if (els.csvReviewBox) els.csvReviewBox.hidden = true;
                return;
            }
            if (headers.length === 0 || rows.length === 0) {
                if (els.csvFileMeta) {
                    els.csvFileMeta.textContent = `"${file.name}" has no importable data rows.`;
                }
                if (els.csvReviewBox) els.csvReviewBox.hidden = true;
                return;
            }

            state.csvDraft = {
                fileName: file.name,
                headers,
                rows,
                parseProblems: problems ?? [],
                mapping: detectMapping(headers),
                mapped: null,
            };

            const matched = MAPPING_FIELDS.filter((key) => state.csvDraft.mapping[key]).length;
            if (els.csvFileMeta) {
                els.csvFileMeta.textContent = `${file.name} (${rows.length} row${rows.length === 1 ? "" : "s"})`;
            }
            if (els.csvDetectedInfo) {
                els.csvDetectedInfo.textContent = `Auto-detected ${matched} of ${MAPPING_FIELDS.length} columns. Change any mapping below.`;
            }
            if (els.csvReviewBox) els.csvReviewBox.hidden = false;

            renderCsvMapping();
            recomputeCsvPreview();
        };
        reader.readAsText(file);
    }

    function optionLists() {
        const items = client.getItems();
        const uniq = (key, fallback) => {
            const values = [...new Set(items.map((item) => String(item[key] ?? "").trim()).filter(Boolean))].sort((a, b) => a.localeCompare(b));
            return values.length > 0 ? values : [fallback];
        };
        return { categories: uniq("category", "General"), statuses: uniq("status", "Active") };
    }

    function syncDropdownUIs(message = "") {
        state.dropdownOptions = optionLists();
        const { categories, statuses } = state.dropdownOptions;
        const group = state.activeDropdownGroup;
        const currentGroupList = group === "categories" ? categories : statuses;
        const prevExisting = els.dropdownExistingSelect?.value;

        populateSelectOptions(els.categoryFilter, categories, {
            includeAll: true,
            allLabel: "All Categories",
            selectedValue: state.categoryFilter,
        });
        state.categoryFilter = els.categoryFilter?.value || "ALL";

        populateSelectOptions(els.fieldCategory, categories, {
            selectedValue: els.fieldCategory?.value,
        });

        populateSelectOptions(els.statusFilter, statuses, {
            includeAll: true,
            allLabel: "All Statuses",
            selectedValue: state.statusFilter,
        });
        state.statusFilter = els.statusFilter?.value || "ALL";

        populateSelectOptions(els.fieldStatus, statuses, {
            selectedValue: els.fieldStatus?.value,
        });

        if (els.dropdownTarget) {
            els.dropdownTarget.value = group;
        }
        populateSelectOptions(els.dropdownExistingSelect, currentGroupList, {
            selectedValue: prevExisting,
        });

        if (els.dropdownMsg) {
            els.dropdownMsg.textContent = message;
        }

        renderSidebarNav();
    }

    async function applyDropdownMutation(nextList, deletedValue = "") {
        const group = state.activeDropdownGroup;
        const fallbackVal = nextList[0] || "";
        const items = client.getItems();

        for (const item of items) {
            if (group === "categories" && deletedValue && item.category === deletedValue) {
                await client.saveItem({ ...item, category: fallbackVal }, true);
            } else if (group === "statuses" && deletedValue && item.status === deletedValue) {
                await client.saveItem({ ...item, status: fallbackVal }, true);
            }
        }

        if (group === "categories" && deletedValue && state.categoryFilter === deletedValue) {
            state.categoryFilter = "ALL";
        }
        if (group === "statuses" && deletedValue && state.statusFilter === deletedValue) {
            state.statusFilter = "ALL";
        }
        if (group === "categories" && deletedValue && state.activeNav === deletedValue) {
            state.activeNav = "home";
        }

        syncDropdownUIs();
        render();
        await refreshDashboard();
    }

    function sortStatusText() {
        return `Insertion Sort (${state.sortField}, ${state.sortDir}): ${state.metrics.comparisons} comparisons, ${state.metrics.shifts} shifts.`;
    }

    async function refreshSort() {
        const sorted = await client.sortRecords(state.sortField, state.sortDir, state.datasetId);
        client.setItems(sorted.records);
        state.metrics = {
            comparisons: sorted.metrics.comparisons,
            shifts: sorted.metrics.shifts,
        };
    }

    function matchesFilters(item) {
        const navCategory = state.dropdownOptions.categories.includes(state.activeNav) ? state.activeNav : state.categoryFilter;
        if (Boolean(item.archived) !== (state.activeNav === "archived")) return false;
        if (navCategory !== "ALL" && item.category !== navCategory) return false;
        if (state.statusFilter !== "ALL" && item.status !== state.statusFilter) return false;
        return true;
    }

    function visibleRecords() {
        return (state.matches ?? client.getItems()).filter(matchesFilters);
    }

    function describeSearch(result, query) {
        if (result.mode === "binary") {
            return result.found ? `Binary Search found exact match in ${result.steps} step(s) on "${state.sortField}".` : `Binary Search checked ${result.steps} step(s): no exact match for "${query}".`;
        }
        return `Linear Search scanned ${result.inspected} item(s) -> ${result.matches.length} match(es).`;
    }

    async function runSearch() {
        clearTimeout(searchTimer);
        const query = state.searchQuery.trim();
        searchToken += 1;
        const token = searchToken;

        if (!query) {
            state.matches = null;
            state.statusText = sortStatusText();
            render();
            return;
        }

        let result;
        try {
            result = await client.searchRecords({
                mode: state.searchMode,
                q: query,
                field: state.sortField,
                direction: state.sortDir,
                dataset: state.datasetId,
            });
        } catch (error) {
            if (token !== searchToken) return;
            state.matches = [];
            state.statusText = error instanceof Error ? error.message : "Search failed.";
            render();
            return;
        }

        if (token !== searchToken) return;
        state.matches = result.matches;
        state.statusText = describeSearch(result, query);
        render();
    }

    function scheduleSearch() {
        clearTimeout(searchTimer);
        searchTimer = setTimeout(runSearch, SEARCH_DEBOUNCE_MS);
    }

    async function applySort() {
        await refreshSort();
        await runSearch();
    }

    function render() {
        const all = client.getItems();
        const visible = visibleRecords();

        els.workspaceTitle.textContent = state.activeNav === "home" ? "DataSpace" : `DataSpace: ${state.activeNav}`;
        els.recordCountLabel.textContent = `${visible.length} ${visible.length === 1 ? "record" : "records"}`;
        els.statusBar.textContent = state.statusText;

        els.recordsContainer.classList.toggle("is-list", state.viewMode === "list");
        els.recordsContainer.classList.toggle("is-table", state.viewMode === "table");

        for (const [mode, button] of [
            ["list", els.listViewBtn],
            ["grid", els.gridViewBtn],
            ["table", els.tableViewBtn],
        ]) {
            button.classList.toggle("is-active", state.viewMode === mode);
            button.setAttribute("aria-pressed", String(state.viewMode === mode));
        }

        const highlights = all.filter((r) => !r.archived).slice(0, 5);
        els.suggestedRow.innerHTML = highlights
            .map(
                (item) => `
        <article class="dsa-folder-card" data-id="${escapeHtml(item.id)}">
          <div class="dsa-folder-title">${escapeHtml(item.name)}</div>
          <div class="dsa-folder-meta">${escapeHtml(item.recordId)} · ${escapeHtml(item.category)}</div>
        </article>
      `,
            )
            .join("");

        if (visible.length === 0) {
            els.recordsContainer.innerHTML = `<div class="dsa-empty-state">No matching records found.</div>`;
            return;
        }

        if (state.viewMode === "table") {
            els.recordsContainer.innerHTML = recordsTableHtml(visible, {
                columns: tableColumns(selectedDataset()?.columns ?? []),
                sortField: state.sortField,
                sortDir: state.sortDir,
                notice: state.datasetId === null ? "Extra fields are shown once a file is selected." : "",
            });
            return;
        }

        els.recordsContainer.innerHTML = visible
            .map(
                (item) => `
        <article class="dsa-record-card" data-id="${escapeHtml(item.id)}">
          <div class="dsa-record-top">
            <span class="dsa-record-id">${escapeHtml(item.recordId)}</span>
            <span class="dsa-status-pill">${escapeHtml(item.status)}</span>
          </div>
          <h3 class="dsa-record-name">${escapeHtml(item.name)}</h3>
          <div class="dsa-record-meta">
            <span>${escapeHtml(item.category)}</span>
            <span>₱${Number(item.amount).toFixed(2)}</span>
          </div>
          <div class="dsa-record-footer">
            <time datetime="${escapeHtml(item.date)}">${escapeHtml(item.date)}</time>
            <div class="dsa-card-actions">
              ${
                  item.archived
                      ? `
                <button type="button" class="dsa-mini-btn" data-action="archive" data-id="${escapeHtml(item.id)}">Restore</button>
                <button type="button" class="dsa-mini-btn dsa-danger-mini-btn" data-action="delete" data-id="${escapeHtml(item.id)}">Permanently Delete</button>
              `
                      : `
                <button type="button" class="dsa-mini-btn" data-action="edit" data-id="${escapeHtml(item.id)}">Edit</button>
                <button type="button" class="dsa-mini-btn" data-action="archive" data-id="${escapeHtml(item.id)}">Archive</button>
              `
              }
            </div>
          </div>
        </article>
      `,
            )
            .join("");
    }

    function openModal(record = null) {
        syncDropdownUIs(els.dropdownMsg?.textContent || "");
        resetCsvImporter();

        if (record) {
            els.modalTitle.textContent = "Edit Record";
            if (els.csvSection) els.csvSection.hidden = true;
            els.internalId.value = record.id;
            els.fieldRecordId.value = record.recordId;
            els.fieldName.value = record.name;
            els.fieldCategory.value = record.category;
            els.fieldStatus.value = record.status;
            els.fieldAmount.value = record.amount;
            els.fieldDate.value = record.date;
        } else {
            els.modalTitle.textContent = "Add Record";
            if (els.csvSection) els.csvSection.hidden = false;
            els.recordForm.reset();
            syncDropdownUIs(els.dropdownMsg?.textContent || "");
            els.internalId.value = "";
            els.fieldRecordId.value = `REC-${100 + client.getItems().length + 1}`;
            els.fieldDate.value = new Date().toISOString().slice(0, 10);
        }
        if (typeof els.modal.showModal === "function") els.modal.showModal();
        else els.modal.setAttribute("open", "");
    }

    function closeModal() {
        resetCsvImporter();
        if (typeof els.modal.close === "function") els.modal.close();
        else els.modal.removeAttribute("open");
    }

    function handleAction(action) {
        return async (event) => {
            try {
                await action(event);
            } catch (error) {
                render();
                state.statusText = error instanceof Error ? error.message : "Could not save changes.";
                els.statusBar.textContent = state.statusText;
            }
        };
    }

    els.searchInput.addEventListener("input", (e) => {
        state.searchQuery = e.target.value;
        scheduleSearch();
    });

    els.filterToggleBtn.addEventListener("click", () => {
        const nextOpen = els.filterDrawer.hidden;
        els.filterDrawer.hidden = !nextOpen;
        els.filterToggleBtn.setAttribute("aria-expanded", String(nextOpen));
    });

    els.searchMode.addEventListener("change", (e) => {
        state.searchMode = e.target.value;
        runSearch();
    });

    els.categoryFilter.addEventListener("change", (e) => {
        state.categoryFilter = e.target.value;
        render();
    });

    els.statusFilter.addEventListener("change", (e) => {
        state.statusFilter = e.target.value;
        render();
    });

    els.sortDir.addEventListener(
        "change",
        handleAction(async (e) => {
            state.sortDir = e.target.value;
            await applySort();
        }),
    );

    els.runSortBtn.addEventListener("click", handleAction(applySort));

    els.resetFiltersBtn.addEventListener(
        "click",
        handleAction(async () => {
            state.searchQuery = "";
            state.searchMode = "linear";
            state.categoryFilter = "ALL";
            state.statusFilter = "ALL";
            state.sortField = "name";
            state.sortDir = "asc";
            els.searchInput.value = "";
            els.searchMode.value = "linear";
            els.categoryFilter.value = "ALL";
            els.statusFilter.value = "ALL";
            els.sortDir.value = "asc";
            await applySort();
        }),
    );

    els.dropdownTarget?.addEventListener("change", (e) => {
        state.activeDropdownGroup = e.target.value === "statuses" ? "statuses" : "categories";
        if (els.dropdownInput) els.dropdownInput.value = "";
        syncDropdownUIs("");
    });

    els.dropdownExistingSelect?.addEventListener("change", (e) => {
        if (els.dropdownInput) els.dropdownInput.value = e.target.value;
    });

    els.renameOptionBtn?.addEventListener(
        "click",
        handleAction(async () => {
            const group = state.activeDropdownGroup;
            const oldVal = els.dropdownExistingSelect?.value || "";
            const newVal = els.dropdownInput?.value.trim() || "";
            const currentList = state.dropdownOptions[group];
            const idx = currentList.indexOf(oldVal);

            const { list, error } = renameOption(currentList, oldVal, newVal);
            if (error) {
                syncDropdownUIs(error);
                return;
            }

            const renamedList = [...list];
            if (idx !== -1) renamedList[idx] = newVal;

            const items = client.getItems();
            for (const item of items) {
                if (group === "categories" && item.category === oldVal) {
                    await client.saveItem({ ...item, category: newVal }, true);
                } else if (group === "statuses" && item.status === oldVal) {
                    await client.saveItem({ ...item, status: newVal }, true);
                }
            }

            if (group === "categories" && state.categoryFilter === oldVal) state.categoryFilter = newVal;
            if (group === "categories" && state.activeNav === oldVal) state.activeNav = "home";
            if (group === "statuses" && state.statusFilter === oldVal) state.statusFilter = newVal;
            if (els.dropdownInput) els.dropdownInput.value = "";
            syncDropdownUIs(`Renamed "${oldVal}" to "${newVal}".`);
            if (els.dropdownExistingSelect) els.dropdownExistingSelect.value = newVal;
            render();
            await refreshDashboard();
        }),
    );

    els.deleteOptionBtn?.addEventListener(
        "click",
        handleAction(async () => {
            const group = state.activeDropdownGroup;
            const targetVal = els.dropdownExistingSelect?.value || "";
            const { list, error } = deleteOption(state.dropdownOptions[group], targetVal);
            if (error) {
                syncDropdownUIs(error);
                return;
            }
            if (els.dropdownInput) els.dropdownInput.value = "";
            await applyDropdownMutation(list, targetVal);
            syncDropdownUIs(`Deleted "${targetVal}".`);
        }),
    );

    els.browseCsvBtn?.addEventListener("click", () => {
        els.csvFileInput?.click();
    });

    els.csvDropzone?.addEventListener("click", (e) => {
        if (e.target === els.browseCsvBtn) return;
        els.csvFileInput?.click();
    });

    els.csvDropzone?.addEventListener("keydown", (e) => {
        if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            els.csvFileInput?.click();
        }
    });

    els.csvDropzone?.addEventListener("dragover", (e) => {
        e.preventDefault();
        els.csvDropzone.classList.add("is-dragover");
    });

    els.csvDropzone?.addEventListener("dragleave", () => {
        els.csvDropzone.classList.remove("is-dragover");
    });

    els.csvDropzone?.addEventListener("drop", (e) => {
        e.preventDefault();
        els.csvDropzone.classList.remove("is-dragover");
        const file = e.dataTransfer?.files?.[0];
        if (file) handleCsvFileSelected(file);
    });

    els.csvFileInput?.addEventListener("change", (e) => {
        const file = e.target.files?.[0];
        if (file) handleCsvFileSelected(file);
    });

    els.csvMapping?.addEventListener("change", (event) => {
        const select = event.target.closest("[data-map-field]");
        if (!select || !state.csvDraft) return;
        state.csvDraft.mapping[select.dataset.mapField] = select.value || null;
        recomputeCsvPreview();
    });

    els.clearCsvBtn?.addEventListener("click", () => {
        resetCsvImporter();
    });

    els.importCsvBtn?.addEventListener(
        "click",
        handleAction(async () => {
            if (state.csvImporting || !state.csvDraft?.mapped || state.csvDraft.mapped.records.length === 0) return;
            const draft = state.csvDraft;

            state.csvImporting = true;
            syncImportButton();
            try {
                const dataset = await client.createDataset(draft.fileName, draft.headers);
                await client.importRecords(
                    dataset.id,
                    draft.mapped.records.map((record) => ({ ...record, datasetId: dataset.id })),
                );
                closeModal();
                await loadDatasets();
                state.datasetId = dataset.id;
                await applyDatasetScope();
                state.statusText = `Imported ${draft.mapped.records.length} row(s) into "${dataset.name}".${draft.mapped.skipped > 0 ? ` ${draft.mapped.skipped} duplicate row(s) skipped.` : ""}`;
                render();
            } finally {
                state.csvImporting = false;
                syncImportButton();
            }
        }),
    );

    els.navButtons.forEach((btn) => {
        btn.addEventListener("click", () => {
            state.activeNav = btn.dataset.nav;
            els.navButtons.forEach((b) => {
                b.classList.toggle("is-active", b === btn);
            });
            render();
        });
    });

    els.listViewBtn.addEventListener("click", () => {
        state.viewMode = "list";
        render();
    });

    els.gridViewBtn.addEventListener("click", () => {
        state.viewMode = "grid";
        render();
    });

    els.tableViewBtn.addEventListener("click", () => {
        state.viewMode = "table";
        render();
    });

    els.toggleSuggestedBtn.addEventListener("click", () => {
        const expanded = els.toggleSuggestedBtn.getAttribute("aria-expanded") === "true";
        els.toggleSuggestedBtn.setAttribute("aria-expanded", String(!expanded));
        els.suggestedRow.hidden = expanded;
    });

    els.toggleRecordsBtn.addEventListener("click", () => {
        const expanded = els.toggleRecordsBtn.getAttribute("aria-expanded") === "true";
        els.toggleRecordsBtn.setAttribute("aria-expanded", String(!expanded));
        els.recordsContainer.hidden = expanded;
    });

    els.newRecordBtn.addEventListener("click", () => openModal(null));
    els.closeModalBtn.addEventListener("click", closeModal);
    els.cancelModalBtn.addEventListener("click", closeModal);

    els.datasetList?.addEventListener("click", (event) => {
        const removeBtn = event.target.closest("[data-dataset-delete]");
        if (removeBtn) {
            deleteDatasetRecords(removeBtn);
            return;
        }
        const selectBtn = event.target.closest("[data-dataset-id]");
        if (selectBtn) selectDataset(selectBtn.dataset.datasetId || null);
    });

    els.recordForm.addEventListener(
        "submit",
        handleAction(async (e) => {
            e.preventDefault();
            if (!state.datasetId) {
                state.statusText = "Select a file before saving a record.";
                els.statusBar.textContent = state.statusText;
                return;
            }
            const existingId = els.internalId.value.trim();
            const existing = existingId ? client.getItems().find((item) => item.id === existingId) : null;
            const record = {
                recordId: els.fieldRecordId.value.trim(),
                name: els.fieldName.value.trim(),
                category: els.fieldCategory.value,
                status: els.fieldStatus.value,
                amount: Number(els.fieldAmount.value) || 0,
                date: els.fieldDate.value,
                archived: existing?.archived ?? false,
                datasetId: existing?.datasetId ?? state.datasetId,
                data: existing?.data ?? {},
            };
            if (existingId) record.id = existingId;
            await client.saveItem(record, Boolean(existingId));
            closeModal();
            await loadDatasets();
            await applySort();
            await refreshDashboard();
        }),
    );

    els.recordsContainer.addEventListener(
        "click",
        handleAction(async (e) => {
            const sortRequest = sortRequestFromEvent(e, state.sortField, state.sortDir);
            if (sortRequest) {
                state.sortField = sortRequest.field;
                state.sortDir = sortRequest.direction;
                els.sortDir.value = sortRequest.direction;
                await applySort();
                return;
            }

            const btn = e.target.closest("[data-action]");
            if (!btn) return;
            const target = client.getItems().find((r) => r.id === btn.dataset.id);
            if (!target) return;

            if (btn.dataset.action === "edit") {
                if (target.archived) return;
                openModal(target);
            } else if (btn.dataset.action === "archive") {
                await client.saveItem({ ...target, archived: !target.archived }, true);
                await applySort();
                await refreshDashboard();
            } else if (btn.dataset.action === "delete") {
                const confirmed = window.confirm(`Permanently delete "${target.name}" (${target.recordId})? This cannot be undone.`);
                if (!confirmed) return;

                await client.deleteItem(target.id);
                await loadDatasets();
                await applySort();
                await refreshDashboard();
            }
        }),
    );

    syncDropdownUIs("");
    await loadDatasets();
    await applySort();
    await refreshDashboard();
}

import { detectCsvCategory, mapCsvRowsToRecords, parseCsvText } from "./csv-importer.js";
import { addOption, deleteOption, loadDropdownOptions, renameOption, saveDropdownOptions } from "./dropdown-options.js";
import { createRecordsClient, searchRecords, sortRecords } from "./records-api.js";
import "./workspace.css";

const MAX_CAPACITY = 100;
const MAX_CSV_ROWS = 500;
const SEARCH_DEBOUNCE_MS = 250;

function escapeHtml(value) {
    return String(value ?? "")
        .replaceAll("&", "&amp;")
        .replaceAll("<", "&lt;")
        .replaceAll(">", "&gt;")
        .replaceAll('"', "&quot;")
        .replaceAll("'", "&#039;");
}

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
        sortField: "name",
        sortDir: "asc",
        searchMode: "linear",
        searchQuery: "",
        categoryFilter: "ALL",
        statusFilter: "ALL",
        activeNav: "home",
        viewMode: "grid",
        metrics: { comparisons: 0, shifts: 0 },
        matches: null,
        statusText: "Ready.",
        dropdownOptions: loadDropdownOptions(),
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
        sortField: q("#dsaSortField"),
        sortDir: q("#dsaSortDir"),
        runSortBtn: q("#dsaRunSortBtn"),
        resetFiltersBtn: q("#dsaResetFiltersBtn"),
        dropdownTarget: q("#dsaDropdownTarget"),
        dropdownExistingSelect: q("#dsaDropdownExistingSelect"),
        dropdownInput: q("#dsaDropdownInput"),
        addOptionBtn: q("#dsaAddOptionBtn"),
        renameOptionBtn: q("#dsaRenameOptionBtn"),
        deleteOptionBtn: q("#dsaDeleteOptionBtn"),
        dropdownMsg: q("#dsaDropdownMsg"),
        syncBadge: q("#dsaSyncBadge"),
        newRecordBtn: q("#dsaNewRecordBtn"),
        navList: q(".dsa-nav-list"),
        navButtons: [...container.querySelectorAll(".dsa-nav-item")],
        capacityFill: q("#dsaCapacityFill"),
        capacityText: q("#dsaCapacityText"),
        complexityMeta: q("#dsaComplexityMeta"),
        workspaceTitle: q("#dsaWorkspaceTitle"),
        listViewBtn: q("#dsaListViewBtn"),
        gridViewBtn: q("#dsaGridViewBtn"),
        statusBar: q("#dsaStatusBar"),
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
        csvCategorySelect: q("#dsaCsvCategorySelect"),
        csvDetectedInfo: q("#dsaCsvDetectedInfo"),
        csvPreviewTable: q("#dsaCsvPreviewTable"),
        clearCsvBtn: q("#dsaClearCsvBtn"),
        importCsvBtn: q("#dsaImportCsvBtn"),
    };

    if (client.isConnected()) {
        els.syncBadge.textContent = "API Connected";
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

    function renderCsvPreviewTable(headers, rows, selectedCategory) {
        if (!els.csvPreviewTable) return;
        const previewRows = rows.slice(0, 5);
        const thHtml = `<tr>${headers.map((h) => `<th>${escapeHtml(h)}</th>`).join("")}<th>Category</th></tr>`;
        const tdHtml = previewRows
            .map((r) => {
                const cells = headers.map((h) => `<td>${escapeHtml(r[h] ?? "")}</td>`).join("");
                return `<tr>${cells}<td><strong>${escapeHtml(selectedCategory)}</strong></td></tr>`;
            })
            .join("");
        els.csvPreviewTable.innerHTML = `<caption class="sr-only">CSV import preview</caption><thead>${thHtml}</thead><tbody>${tdHtml}</tbody>`;
    }

    function resetCsvImporter() {
        state.csvDraft = null;
        if (els.csvFileInput) els.csvFileInput.value = "";
        if (els.csvFileMeta) els.csvFileMeta.textContent = "No CSV file selected yet.";
        if (els.csvReviewBox) els.csvReviewBox.hidden = true;
        if (els.csvPreviewTable) els.csvPreviewTable.innerHTML = "";
        if (els.csvDetectedInfo) els.csvDetectedInfo.textContent = "";
    }

    function handleCsvFileSelected(file) {
        if (!file) return;
        const isCsv = file.name.toLowerCase().endsWith(".csv") || file.type.includes("csv");
        if (!isCsv) {
            if (els.csvFileMeta) els.csvFileMeta.textContent = "Please select a valid .csv file.";
            return;
        }

        const reader = new FileReader();
        reader.onload = () => {
            const text = String(reader.result ?? "");
            const { headers, recordsRaw } = parseCsvText(text);
            if (headers.length === 0 || recordsRaw.length === 0) {
                if (els.csvFileMeta) {
                    els.csvFileMeta.textContent = `"${file.name}" has no importable data rows.`;
                }
                if (els.csvReviewBox) els.csvReviewBox.hidden = true;
                return;
            }

            const categories = state.dropdownOptions.categories;
            const detection = detectCsvCategory(headers, recordsRaw, categories);

            state.csvDraft = {
                fileName: file.name,
                headers,
                recordsRaw,
                detectedCategory: detection.detectedCategory,
                selectedCategory: detection.detectedCategory,
            };

            populateSelectOptions(els.csvCategorySelect, categories, {
                selectedValue: detection.detectedCategory,
            });

            if (els.csvFileMeta) {
                els.csvFileMeta.textContent = `${file.name} (${recordsRaw.length} row${recordsRaw.length === 1 ? "" : "s"})`;
            }
            if (els.csvDetectedInfo) {
                els.csvDetectedInfo.textContent = `Auto-detected: "${detection.detectedCategory}". Change the dropdown below to override.`;
            }
            if (els.csvReviewBox) {
                els.csvReviewBox.hidden = false;
            }
            renderCsvPreviewTable(headers, recordsRaw, detection.detectedCategory);
        };
        reader.readAsText(file);
    }

    function syncDropdownUIs(message = "") {
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

        if (state.csvDraft) {
            populateSelectOptions(els.csvCategorySelect, categories, {
                selectedValue: state.csvDraft.selectedCategory,
            });
            state.csvDraft.selectedCategory = els.csvCategorySelect?.value || categories[0] || "";
            renderCsvPreviewTable(state.csvDraft.headers, state.csvDraft.recordsRaw, state.csvDraft.selectedCategory);
        }

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
        state.dropdownOptions = {
            ...state.dropdownOptions,
            [group]: nextList,
        };
        saveDropdownOptions(state.dropdownOptions);

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
    }

    function sortStatusText() {
        return `Insertion Sort (${state.sortField}, ${state.sortDir}): ${state.metrics.comparisons} comparisons, ${state.metrics.shifts} shifts.`;
    }

    async function refreshSort() {
        const sorted = await sortRecords(state.sortField, state.sortDir);
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
            result = await searchRecords({
                mode: state.searchMode,
                q: query,
                field: state.sortField,
                direction: state.sortDir,
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

        const pct = Math.min(100, Math.round((all.length / MAX_CAPACITY) * 100));
        els.capacityFill.style.width = `${pct}%`;
        els.capacityText.textContent = `${all.length} / ${MAX_CAPACITY} records`;
        els.complexityMeta.textContent = `Insertion Sort: ${state.metrics.comparisons} comparisons · ${state.metrics.shifts} shifts`;

        els.workspaceTitle.textContent = state.activeNav === "home" ? "DataDrive" : `DSA Records: ${state.activeNav}`;
        els.recordCountLabel.textContent = `${visible.length} ${visible.length === 1 ? "record" : "records"}`;
        els.statusBar.textContent = state.statusText;

        els.recordsContainer.classList.toggle("is-list", state.viewMode === "list");
        els.recordsContainer.classList.toggle("dsa-records-grid", state.viewMode === "grid");
        els.listViewBtn.classList.toggle("is-active", state.viewMode === "list");
        els.listViewBtn.setAttribute("aria-pressed", String(state.viewMode === "list"));
        els.gridViewBtn.classList.toggle("is-active", state.viewMode === "grid");
        els.gridViewBtn.setAttribute("aria-pressed", String(state.viewMode === "grid"));

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

    els.sortField.addEventListener(
        "change",
        handleAction(async (e) => {
            state.sortField = e.target.value;
            await applySort();
        }),
    );

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
            els.sortField.value = "name";
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

    els.addOptionBtn?.addEventListener(
        "click",
        handleAction(async () => {
            const group = state.activeDropdownGroup;
            const { list, error } = addOption(state.dropdownOptions[group], els.dropdownInput?.value);
            if (error) {
                syncDropdownUIs(error);
                return;
            }
            const addedLabel = els.dropdownInput.value.trim();
            els.dropdownInput.value = "";
            await applyDropdownMutation(list);
            syncDropdownUIs(`Added "${addedLabel}".`);
            if (els.dropdownExistingSelect) els.dropdownExistingSelect.value = addedLabel;
        }),
    );

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

            state.dropdownOptions = { ...state.dropdownOptions, [group]: renamedList };
            saveDropdownOptions(state.dropdownOptions);
            if (els.dropdownInput) els.dropdownInput.value = "";
            syncDropdownUIs(`Renamed "${oldVal}" to "${newVal}".`);
            if (els.dropdownExistingSelect) els.dropdownExistingSelect.value = newVal;
            render();
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

    els.csvCategorySelect?.addEventListener("change", (e) => {
        if (!state.csvDraft) return;
        state.csvDraft.selectedCategory = e.target.value;
        renderCsvPreviewTable(state.csvDraft.headers, state.csvDraft.recordsRaw, state.csvDraft.selectedCategory);
    });

    els.clearCsvBtn?.addEventListener("click", () => {
        resetCsvImporter();
    });

    els.importCsvBtn?.addEventListener(
        "click",
        handleAction(async () => {
            if (state.csvImporting || !state.csvDraft || state.csvDraft.recordsRaw.length === 0) return;
            const chosenCategory = els.csvCategorySelect?.value || state.csvDraft.selectedCategory || state.dropdownOptions.categories[0];

            const draftRows = state.csvDraft.recordsRaw;
            const rows = draftRows.slice(0, MAX_CSV_ROWS);
            const dropped = draftRows.length - rows.length;
            const mapped = mapCsvRowsToRecords(rows, chosenCategory, state.dropdownOptions.statuses, client.getItems().length);

            state.csvImporting = true;
            els.importCsvBtn.disabled = true;
            try {
                for (const rec of mapped) {
                    await client.saveItem(rec, false);
                }
            } finally {
                state.csvImporting = false;
                els.importCsvBtn.disabled = false;
            }

            closeModal();
            await applySort();
            state.statusText = `Imported ${mapped.length} CSV record(s) under "${chosenCategory}".${dropped > 0 ? ` ${dropped} row(s) exceeded the ${MAX_CSV_ROWS}-row import limit and were skipped.` : ""}`;
            els.statusBar.textContent = state.statusText;
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

    els.recordForm.addEventListener(
        "submit",
        handleAction(async (e) => {
            e.preventDefault();
            const existingId = els.internalId.value.trim();
            const record = {
                recordId: els.fieldRecordId.value.trim(),
                name: els.fieldName.value.trim(),
                category: els.fieldCategory.value,
                status: els.fieldStatus.value,
                amount: Number(els.fieldAmount.value) || 0,
                date: els.fieldDate.value,
                archived: false,
            };
            if (existingId) record.id = existingId;
            await client.saveItem(record, Boolean(existingId));
            closeModal();
            await applySort();
        }),
    );

    els.recordsContainer.addEventListener(
        "click",
        handleAction(async (e) => {
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
            } else if (btn.dataset.action === "delete") {
                const confirmed = window.confirm(`Permanently delete "${target.name}" (${target.recordId})? This cannot be undone.`);
                if (!confirmed) return;

                await client.deleteItem(target.id);
                await applySort();
            }
        }),
    );

    syncDropdownUIs("");
    await applySort();
}

import type { BusinessRecord, SearchQueryOptions, SortDirection, SortField, SortMetrics } from "./dataTypes.js";

export function getComparableKey(record: BusinessRecord, field: SortField): string | number {
    switch (field) {
        case "amount":
            return Number(record.amount) || 0;
        case "date":
            return Date.parse(record.date) || 0;
        case "recordId":
            return String(record.recordId ?? "")
                .trim()
                .toLowerCase();
        default:
            return String(record.name ?? "")
                .trim()
                .toLowerCase();
    }
}

export function compareKeys(a: string | number, b: string | number, direction: SortDirection = "asc"): number {
    if (a === b) return 0;
    const base = a < b ? -1 : 1;
    return direction === "desc" ? -base : base;
}

export function insertionSortRecords(records: BusinessRecord[], field: SortField = "name", direction: SortDirection = "asc"): { items: BusinessRecord[]; metrics: SortMetrics } {
    const items = [...records];
    let comparisons = 0;
    let shifts = 0;

    for (let i = 1; i < items.length; i++) {
        const current = items[i];
        const currentKey = getComparableKey(current, field);
        let j = i - 1;

        while (j >= 0) {
            comparisons += 1;
            const prevKey = getComparableKey(items[j], field);
            if (compareKeys(prevKey, currentKey, direction) > 0) {
                items[j + 1] = items[j];
                shifts += 1;
                j -= 1;
            } else {
                break;
            }
        }

        if (j + 1 !== i) {
            items[j + 1] = current;
        }
    }

    return {
        items,
        metrics: {
            comparisons,
            shifts,
            algorithm: "Insertion Sort",
            field,
            direction,
        },
    };
}

export function linearSearchRecords(records: BusinessRecord[], options: SearchQueryOptions = {}): { matches: BusinessRecord[]; inspected: number } {
    const { query = "", category = "ALL", status = "ALL", archived } = options;

    const needle = query.trim().toLowerCase();
    const matches: BusinessRecord[] = [];
    let inspected = 0;

    for (let i = 0; i < records.length; i++) {
        inspected += 1;
        const item = records[i];

        if (archived !== undefined && Boolean(item.archived) !== archived) continue;
        if (category !== "ALL" && item.category !== category) continue;
        if (status !== "ALL" && item.status !== status) continue;

        if (needle) {
            const hay = [item.name, item.recordId, item.category, item.status, String(item.amount), item.date].join(" ").toLowerCase();

            if (!hay.includes(needle)) continue;
        }

        matches.push(item);
    }

    return { matches, inspected };
}

export function binarySearchExactRecord(sortedRecords: BusinessRecord[], targetRaw: string, field: SortField = "name", direction: SortDirection = "asc"): { match: BusinessRecord | null; steps: number; found: boolean } {
    let low = 0;
    let high = sortedRecords.length - 1;
    let steps = 0;

    const targetKey: string | number =
        field === "amount"
            ? Number(targetRaw)
            : field === "date"
              ? Date.parse(targetRaw)
              : String(targetRaw ?? "")
                    .trim()
                    .toLowerCase();

    while (low <= high) {
        steps += 1;
        const mid = Math.floor((low + high) / 2);
        const midKey = getComparableKey(sortedRecords[mid], field);
        const cmp = compareKeys(midKey, targetKey, direction);

        if (cmp === 0) {
            return { match: sortedRecords[mid], steps, found: true };
        }
        if (cmp < 0) {
            low = mid + 1;
        } else {
            high = mid - 1;
        }
    }

    return { match: null, steps, found: false };
}

const sample = (name: string, amount: number): BusinessRecord => ({ id: name, recordId: name, name, category: "Customer", status: "Active", amount, date: "2026-01-01", archived: false });
const shuffled = [sample("Beta", 20), sample("Alpha", 30), sample("Gamma", 10)];
const sortedKeys = (field: SortField, direction: SortDirection) => insertionSortRecords(shuffled, field, direction).items.map((item) => String(item[field]));
if (sortedKeys("name", "asc").join() !== "Alpha,Beta,Gamma" || sortedKeys("amount", "desc").join() !== "30,20,10") throw new Error("record sorting self-check failed");

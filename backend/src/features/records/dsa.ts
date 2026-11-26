import type { BusinessRecord, RecordData, SearchQueryOptions, SortDirection, SortMetrics } from "./dataTypes.js";

export type ComparableKey = number | string | null;

const toComparable = (raw: unknown): ComparableKey => {
    if (raw === undefined || raw === null) return null;
    if (typeof raw === "number") return Number.isFinite(raw) ? raw : null;
    if (typeof raw === "boolean") return raw ? 1 : 0;
    const text = String(raw).trim().toLowerCase();
    if (text === "") return null;
    const numeric = Number(text);
    return Number.isFinite(numeric) ? numeric : text;
};

export function getComparableKey(record: BusinessRecord, field: string): ComparableKey {
    switch (field) {
        case "amount":
            return Number(record.amount) || 0;
        case "date":
            return Date.parse(record.date) || 0;
        case "archived":
            return record.archived ? 1 : 0;
        case "recordId":
            return toComparable(record.recordId);
        case "category":
            return toComparable(record.category);
        case "status":
            return toComparable(record.status);
        case "name":
            return toComparable(record.name);
        default:
            return toComparable(record.data?.[field]);
    }
}

export function compareKeys(a: ComparableKey, b: ComparableKey, direction: SortDirection = "asc"): number {
    if (a === null || b === null) {
        if (a === b) return 0;
        return a === null ? 1 : -1;
    }
    if (a === b) return 0;
    const base = typeof a === "number" && typeof b === "number" ? (a < b ? -1 : 1) : String(a) < String(b) ? -1 : 1;
    return direction === "desc" ? -base : base;
}

export function insertionSortRecords(records: BusinessRecord[], field: string = "name", direction: SortDirection = "asc"): { items: BusinessRecord[]; metrics: SortMetrics } {
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
    const { query = "", category = "ALL", status = "ALL", archived, field = "name" } = options;

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
            const key = getComparableKey(item, field);
            if (key === null || !String(key).toLowerCase().includes(needle)) continue;
        }

        matches.push(item);
    }

    return { matches, inspected };
}

export function binarySearchExactRecord(sortedRecords: BusinessRecord[], targetRaw: string, field: string = "name", direction: SortDirection = "asc"): { match: BusinessRecord | null; steps: number; found: boolean } {
    let low = 0;
    let high = sortedRecords.length - 1;
    let steps = 0;

    const targetKey: ComparableKey = field === "amount" ? Number(targetRaw) : field === "date" ? Date.parse(targetRaw) : toComparable(targetRaw);

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

const sample = (name: string, amount: number, data: RecordData = {}): BusinessRecord => ({ id: name, datasetId: "d", recordId: name, name, category: "Customer", status: "Active", amount, date: "2026-01-01", archived: false, data });
const shuffled = [sample("Beta", 20, { score: 30 }), sample("Alpha", 30, { score: 100 }), sample("Gamma", 10), sample("Delta", 5, { score: 3 })];
const sortedKeys = (field: string, direction: SortDirection) => insertionSortRecords(shuffled, field, direction).items.map((item) => String(getComparableKey(item, field)));
if (sortedKeys("name", "asc").join() !== "alpha,beta,delta,gamma" || sortedKeys("amount", "desc").join() !== "30,20,10,5" || sortedKeys("score", "asc").join() !== "3,30,100,null" || sortedKeys("score", "desc").join() !== "100,30,3,null") throw new Error("record sorting self-check failed");

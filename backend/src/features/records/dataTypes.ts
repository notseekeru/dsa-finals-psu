export type RecordCategory = string;
export type RecordStatus = string;

export const CORE_COLUMNS = ["recordId", "name", "category", "status", "amount", "date"] as const;

export const SORT_DIRECTIONS = ["asc", "desc"] as const;
export type SortDirection = (typeof SORT_DIRECTIONS)[number];
export const SEARCH_ALGORITHMS = ["linear", "binary"] as const;
export type SearchAlgorithm = (typeof SEARCH_ALGORITHMS)[number];

export type RecordData = Record<string, string | number | boolean>;

export interface BusinessRecord {
    id: string;
    datasetId: string;
    recordId: string;
    name: string;
    category: RecordCategory;
    status: RecordStatus;
    amount: number;
    date: string;
    archived: boolean;
    data: RecordData;
}

export interface SortMetrics {
    comparisons: number;
    shifts: number;
    algorithm: "Insertion Sort";
    field: string;
    direction: SortDirection;
}

export interface SearchQueryOptions {
    query?: string;
    category?: RecordCategory | "ALL";
    status?: RecordStatus | "ALL";
    archived?: boolean;
    field?: string;
}

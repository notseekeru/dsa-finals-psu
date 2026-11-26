export type RecordCategory = string;
export type RecordStatus = string;
export const SORT_FIELDS = ["name", "amount", "recordId", "date"] as const;
export type SortField = (typeof SORT_FIELDS)[number];
export const SORT_DIRECTIONS = ["asc", "desc"] as const;
export type SortDirection = (typeof SORT_DIRECTIONS)[number];
export const SEARCH_ALGORITHMS = ["linear", "binary"] as const;
export type SearchAlgorithm = (typeof SEARCH_ALGORITHMS)[number];

export interface BusinessRecord {
    id: string;
    recordId: string;
    name: string;
    category: RecordCategory;
    status: RecordStatus;
    amount: number;
    date: string;
    archived: boolean;
}

export interface SortMetrics {
    comparisons: number;
    shifts: number;
    algorithm: "Insertion Sort";
    field: SortField;
    direction: SortDirection;
}

export interface SearchQueryOptions {
    query?: string;
    category?: RecordCategory | "ALL";
    status?: RecordStatus | "ALL";
    archived?: boolean;
    sortField?: SortField;
    sortDir?: SortDirection;
}

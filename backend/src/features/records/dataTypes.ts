export type RecordCategory = string;
export type RecordStatus = string;
export type SortField = 'name' | 'amount' | 'recordId' | 'date';
export type SortDirection = 'asc' | 'desc';
export type SearchAlgorithm = 'linear' | 'binary';

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
  algorithm: 'Insertion Sort';
  field: SortField;
  direction: SortDirection;
}

export interface SearchQueryOptions {
  query?: string;
  category?: RecordCategory | 'ALL';
  status?: RecordStatus | 'ALL';
  archived?: boolean;
  sortField?: SortField;
  sortDir?: SortDirection;
}
const DEFAULT_PAGE_SIZE = 20;
const MAX_PAGE_SIZE = 100;

export interface Pagination {
  page: number;
  pageSize: number;
}

// A page of results, as sent to clients.
export interface Paginated<T> {
  items: T[];
  page: number;
  pageSize: number;
  totalItems: number;
  totalPages: number;
}

type PaginationResult = ({ ok: true } & Pagination) | { ok: false; error: string };

function parsePositiveInteger(value: unknown, fallback: number): number | null {
  if (value === undefined) {
    return fallback;
  }
  if (typeof value !== "string" || !/^\d+$/.test(value)) {
    return null;
  }
  const number = Number(value);
  return number >= 1 ? number : null;
}

// Reads ?page and ?pageSize from a query string. Pages start at 1.
export function parsePagination(query: Record<string, unknown>): PaginationResult {
  const page = parsePositiveInteger(query.page, 1);
  const pageSize = parsePositiveInteger(query.pageSize, DEFAULT_PAGE_SIZE);

  if (page === null) {
    return { ok: false, error: "page must be a whole number of at least 1" };
  }
  if (pageSize === null || pageSize > MAX_PAGE_SIZE) {
    return { ok: false, error: `pageSize must be a whole number from 1 to ${MAX_PAGE_SIZE}` };
  }
  return { ok: true, page, pageSize };
}

export function toPaginated<T>(items: T[], totalItems: number, pagination: Pagination): Paginated<T> {
  return {
    items,
    page: pagination.page,
    pageSize: pagination.pageSize,
    totalItems,
    totalPages: Math.ceil(totalItems / pagination.pageSize),
  };
}

// Offset to pass to the database for the requested page.
export function toOffset(pagination: Pagination): number {
  return (pagination.page - 1) * pagination.pageSize;
}
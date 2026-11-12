import { ConvexError, v } from "convex/values";

// Numbered pages for the lists in the app. The page numbers are shown ten at
// a time (1 to 10, then 11 to 20), so a query reads up to the end of the
// current block plus one row. That is enough to know which page numbers
// exist and whether there is a next block, without counting the whole table.

export const PAGE_SIZE = 10;
export const PAGES_PER_BLOCK = 10;
const MAX_PAGE = 100;
const MAX_SEARCH_LENGTH = 60;

export const pageArgs = {
  page: v.number(),
  search: v.optional(v.string()),
};

export function cleanSearch(search: string | undefined): string {
  return (search ?? "").trim().slice(0, MAX_SEARCH_LENGTH);
}

function blockEnd(page: number): number {
  return Math.ceil(page / PAGES_PER_BLOCK) * PAGES_PER_BLOCK;
}

// How many rows a query has to read to serve `page`.
export function rowsToRead(page: number): number {
  if (!Number.isInteger(page) || page < 1 || page > MAX_PAGE) {
    throw new ConvexError("That page does not exist.");
  }
  return blockEnd(page) * PAGE_SIZE + 1;
}

// Cuts the requested page out of the rows read. If the list has become
// shorter than the requested page, the last existing page is returned.
export function cutPage<Row>(rows: Row[], requested: number) {
  const lastPage = Math.max(
    1,
    Math.min(blockEnd(requested), Math.ceil(rows.length / PAGE_SIZE)),
  );
  const page = Math.min(requested, lastPage);
  return {
    rows: rows.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE),
    page,
    firstPage: blockEnd(page) - PAGES_PER_BLOCK + 1,
    lastPage,
    hasMore: rows.length > blockEnd(requested) * PAGE_SIZE,
  };
}

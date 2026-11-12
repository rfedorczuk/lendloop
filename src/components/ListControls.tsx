"use client";

// The two controls every long list has: a search field above it and page
// numbers below it.

export type Paging = {
  page: number;
  firstPage: number;
  lastPage: number;
  hasMore: boolean;
};

export function SearchField({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <label className="relative block w-full sm:w-64">
      <span className="sr-only">{label}</span>
      <svg
        aria-hidden="true"
        viewBox="0 0 16 16"
        className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-faint"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
      >
        <circle cx="7" cy="7" r="4.25" />
        <path d="m10.25 10.25 3 3" />
      </svg>
      <input
        type="search"
        value={value}
        placeholder={label}
        maxLength={60}
        onChange={(event) => onChange(event.target.value)}
        className="block h-8 w-full rounded-lg border border-line-strong bg-panel pl-8 pr-2.5 text-[13px] text-ink placeholder:text-faint hover:border-faint focus-visible:border-accent focus-visible:-outline-offset-1"
      />
    </label>
  );
}

const PAGE_BUTTON =
  "flex h-7 min-w-7 items-center justify-center whitespace-nowrap rounded-md px-2 text-[13px] tabular-nums text-muted transition-colors duration-100 hover:bg-hover hover:text-ink disabled:pointer-events-none disabled:opacity-40 aria-[current=page]:bg-hover aria-[current=page]:font-medium aria-[current=page]:text-ink";

// Page numbers in blocks of ten. "Next" moves one page on and into the next
// block when the current one ends.
export function Pagination({
  paging,
  onPage,
}: {
  paging: Paging;
  onPage: (page: number) => void;
}) {
  const { page, firstPage, lastPage, hasMore } = paging;
  if (lastPage === 1 && firstPage === 1 && !hasMore) return null;

  const numbers = Array.from(
    { length: lastPage - firstPage + 1 },
    (_, index) => firstPage + index,
  );
  return (
    <nav
      aria-label="Pages"
      className="mt-3 flex flex-wrap items-center gap-0.5"
    >
      <button
        type="button"
        className={PAGE_BUTTON}
        disabled={page === 1}
        onClick={() => onPage(page - 1)}
      >
        Previous
      </button>
      {numbers.map((number) => (
        <button
          key={number}
          type="button"
          className={PAGE_BUTTON}
          aria-label={`Page ${number}`}
          aria-current={number === page ? "page" : undefined}
          onClick={() => onPage(number)}
        >
          {number}
        </button>
      ))}
      <button
        type="button"
        className={PAGE_BUTTON}
        disabled={page === lastPage && !hasMore}
        onClick={() => onPage(page + 1)}
      >
        Next
      </button>
    </nav>
  );
}

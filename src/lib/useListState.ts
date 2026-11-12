"use client";

import { useEffect, useState } from "react";

const DEBOUNCE_MS = 250;

// Page number and search text for one list. Typing is debounced before it
// reaches the query, and a new search always starts on page 1.
export function useListState() {
  const [page, setPage] = useState(1);
  const [input, setInput] = useState("");
  const [search, setSearch] = useState("");

  useEffect(() => {
    const next = input.trim();
    if (next === search) return;
    const timer = setTimeout(() => {
      setSearch(next);
      setPage(1);
    }, DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [input, search]);

  return {
    page,
    setPage,
    input,
    setInput,
    // The arguments for a paged Convex query.
    args: search === "" ? { page } : { page, search },
    searching: search !== "",
  };
}

// Keeps showing the previous page while the next one loads, so the list
// does not flash a placeholder on every click.
export function useLatest<Result>(result: Result | undefined) {
  const [latest, setLatest] = useState(result);
  if (result !== undefined && result !== latest) setLatest(result);
  return result ?? latest;
}

"use client";

import { useQuery } from "convex/react";
import { api } from "../../convex/_generated/api";
import { useLatest, useListState } from "@/lib/useListState";
import { Pagination, SearchField } from "./ListControls";
import { LoanList } from "./LoanList";
import { Empty, Loading } from "./ui";

// The three loan queries take the same arguments and return the same shape.
type LoanQuery =
  typeof api.loans.mine | typeof api.loans.incoming | typeof api.loans.all;

// A loan list with its search field and page numbers.
export function PagedLoans({
  source,
  view,
  empty,
}: {
  source: LoanQuery;
  view: "borrower" | "owner" | "admin";
  // Shown when there are no loans at all.
  empty: string;
}) {
  const list = useListState();
  const data = useLatest(useQuery(source, list.args));

  return (
    <>
      <div className="mb-3">
        <SearchField
          label="Search by tool name"
          value={list.input}
          onChange={list.setInput}
        />
      </div>
      {data === undefined ? (
        <Loading />
      ) : data.items.length === 0 ? (
        <Empty>{list.searching ? "No loans match this search." : empty}</Empty>
      ) : (
        <LoanList loans={data.items} view={view} />
      )}
      {data && <Pagination paging={data} onPage={list.setPage} />}
    </>
  );
}

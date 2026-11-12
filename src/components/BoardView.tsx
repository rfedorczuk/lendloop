"use client";

import { useState } from "react";
import { useMutation } from "convex/react";
import type { FunctionReturnType } from "convex/server";
import { api } from "../../convex/_generated/api";
import {
  CATEGORIES,
  categoryLabel,
  conditionLabel,
  formatDay,
} from "@/lib/format";
import type { Category } from "@/lib/format";
import { useSubmit } from "@/lib/useSubmit";
import { BorrowForm } from "./BorrowForm";
import { Pagination, SearchField } from "./ListControls";
import {
  Button,
  ConfirmButton,
  Empty,
  FormError,
  List,
  Loading,
  Row,
  Segmented,
  Status,
  Tag,
} from "./ui";

export type Board = FunctionReturnType<typeof api.tools.list>;
export type BoardTool = Board["items"][number];
export type CategoryFilter = Category | "all";

const FILTERS = [["all", "All"], ...CATEGORIES] as const;

export function Availability({
  availability,
}: {
  availability: BoardTool["availability"];
}) {
  if (availability.state === "on_loan") {
    return availability.overdue ? (
      <Status tone="danger">Overdue</Status>
    ) : (
      <Status tone="warn">
        On loan until {formatDay(availability.dueDate)}
      </Status>
    );
  }
  return availability.reservedFrom ? (
    <Status tone="ok">Free until {formatDay(availability.reservedFrom)}</Status>
  ) : (
    <Status tone="ok">Available</Status>
  );
}

function ToolRow({ tool, isAdmin }: { tool: BoardTool; isAdmin: boolean }) {
  const remove = useMutation(api.tools.remove);
  const [borrowing, setBorrowing] = useState(false);
  const { pending, error, run } = useSubmit();

  return (
    <Row>
      <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-2">
        <div className="min-w-0 flex-1 basis-64">
          <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1">
            <h2 className="font-medium">{tool.name}</h2>
            <Availability availability={tool.availability} />
          </div>
          <p className="mt-1 flex flex-wrap items-center gap-x-1.5 gap-y-1 text-[13px] text-muted">
            <span>
              {categoryLabel(tool.category)} · {conditionLabel(tool.condition)}{" "}
              · {tool.isMine ? "Your listing" : tool.ownerName}
            </span>
            {tool.ownerTrusted && <Tag>Trusted lender</Tag>}
          </p>
          {tool.description && (
            <p className="mt-1.5 max-w-prose text-[13px] text-muted">
              {tool.description}
            </p>
          )}
        </div>
        {!borrowing && (
          <div className="flex shrink-0 items-center gap-1">
            {isAdmin && !tool.isMine && (
              <ConfirmButton
                label="Remove"
                confirmLabel="Confirm removal"
                describedAs={tool.name}
                pending={pending}
                onConfirm={() => run(() => remove({ toolId: tool._id }))}
              />
            )}
            {!tool.isMine && (
              <Button
                size="sm"
                aria-label={`Request to borrow ${tool.name}`}
                onClick={() => setBorrowing(true)}
              >
                Request
              </Button>
            )}
          </div>
        )}
      </div>
      <FormError message={error} />
      {borrowing && (
        <BorrowForm toolId={tool._id} onDone={() => setBorrowing(false)} />
      )}
    </Row>
  );
}

export function BoardView({
  data,
  isAdmin,
  category,
  onCategory,
  search,
  onSearch,
  searching,
  onPage,
}: {
  data: Board | undefined;
  isAdmin: boolean;
  category: CategoryFilter;
  onCategory: (category: CategoryFilter) => void;
  search: string;
  onSearch: (search: string) => void;
  // True once the typed text has reached the query.
  searching: boolean;
  onPage: (page: number) => void;
}) {
  return (
    <>
      <div className="mb-3 space-y-2">
        <SearchField label="Search tools" value={search} onChange={onSearch} />
        <Segmented
          label="Category"
          options={FILTERS}
          value={category}
          onChange={onCategory}
        />
      </div>
      {data === undefined ? (
        <Loading />
      ) : data.items.length === 0 ? (
        <Empty>
          {searching
            ? "No tools match this search."
            : "No tools in this category yet."}
        </Empty>
      ) : (
        <List>
          {data.items.map((tool) => (
            <ToolRow key={tool._id} tool={tool} isAdmin={isAdmin} />
          ))}
        </List>
      )}
      {data && <Pagination paging={data} onPage={onPage} />}
    </>
  );
}

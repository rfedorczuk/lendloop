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
import {
  Button,
  Empty,
  FormError,
  List,
  Loading,
  Row,
  Segmented,
  Status,
  Tag,
} from "./ui";

export type BoardTool = FunctionReturnType<typeof api.tools.list>[number];
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
              <Button
                variant="danger"
                size="sm"
                pending={pending}
                onClick={() => run(() => remove({ toolId: tool._id }))}
              >
                Remove
              </Button>
            )}
            {!tool.isMine && (
              <Button size="sm" onClick={() => setBorrowing(true)}>
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
  tools,
  isAdmin,
  category,
  onCategory,
}: {
  tools: BoardTool[] | undefined;
  isAdmin: boolean;
  category: CategoryFilter;
  onCategory: (category: CategoryFilter) => void;
}) {
  return (
    <>
      <div className="mb-3">
        <Segmented
          label="Category"
          options={FILTERS}
          value={category}
          onChange={onCategory}
        />
      </div>
      {tools === undefined ? (
        <Loading />
      ) : tools.length === 0 ? (
        <Empty>No tools in this category yet.</Empty>
      ) : (
        <List>
          {tools.map((tool) => (
            <ToolRow key={tool._id} tool={tool} isAdmin={isAdmin} />
          ))}
        </List>
      )}
    </>
  );
}

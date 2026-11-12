import type { Doc, Id } from "../_generated/dataModel";
import type { MutationCtx, QueryCtx } from "../_generated/server";
import { internal } from "../_generated/api";
import { periodsOverlap } from "./dates";

type Ctx = QueryCtx | MutationCtx;

export type Availability =
  | { state: "available"; reservedFrom?: string }
  | { state: "on_loan"; dueDate: string; overdue: boolean };

// An approved loan that has not been returned keeps the tool busy until it is
// returned, even after its end date has passed.
export function occupiedPeriod(loan: Doc<"loans">, day: string) {
  return {
    startDate: loan.startDate,
    endDate: loan.endDate < day ? day : loan.endDate,
  };
}

export function availability(
  approvedLoans: Doc<"loans">[],
  day: string,
): Availability {
  const current = approvedLoans.find((loan) => loan.startDate <= day);
  if (current) {
    return {
      state: "on_loan",
      dueDate: current.endDate,
      overdue: current.endDate < day,
    };
  }
  const upcoming = approvedLoans
    .map((loan) => loan.startDate)
    .sort()
    .at(0);
  return { state: "available", reservedFrom: upcoming };
}

export async function approvedLoansByTool(
  ctx: Ctx,
): Promise<Map<Id<"tools">, Doc<"loans">[]>> {
  const approved = await ctx.db
    .query("loans")
    .withIndex("by_status_and_end", (q) => q.eq("status", "approved"))
    .collect();
  const byTool = new Map<Id<"tools">, Doc<"loans">[]>();
  for (const loan of approved) {
    const list = byTool.get(loan.toolId) ?? [];
    list.push(loan);
    byTool.set(loan.toolId, list);
  }
  return byTool;
}

export async function conflictingLoan(
  ctx: Ctx,
  toolId: Id<"tools">,
  period: { startDate: string; endDate: string },
  day: string,
): Promise<Doc<"loans"> | null> {
  const loans = await ctx.db
    .query("loans")
    .withIndex("by_tool", (q) => q.eq("toolId", toolId))
    .collect();
  return (
    loans.find(
      (loan) =>
        loan.status === "approved" &&
        periodsOverlap(occupiedPeriod(loan, day), period),
    ) ?? null
  );
}

// Writes the event in the same transaction as the loan change and schedules
// its delivery. If the mutation rolls back, neither happens.
export async function enqueueLoanEvent(
  ctx: MutationCtx,
  event: {
    loanId: Id<"loans">;
    kind: Doc<"outbox">["kind"];
    recipientId: Id<"users">;
  },
): Promise<void> {
  const eventId = await ctx.db.insert("outbox", {
    ...event,
    state: "pending",
    attempts: 0,
  });
  await ctx.scheduler.runAfter(0, internal.automation.deliver, { eventId });
}

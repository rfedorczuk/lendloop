"use client";

import { useMutation } from "convex/react";
import type { FunctionReturnType } from "convex/server";
import { api } from "../../convex/_generated/api";
import { formatDay } from "@/lib/format";
import { useSubmit } from "@/lib/useSubmit";
import { TimeAgo } from "./TimeAgo";
import { Button, FormError, List, Row, Status } from "./ui";
import type { Tone } from "./ui";

export type Loan = FunctionReturnType<typeof api.loans.mine>["items"][number];
type View = "borrower" | "owner" | "admin";

const STATUS: Record<Loan["status"], { label: string; tone: Tone }> = {
  requested: { label: "Waiting for a decision", tone: "warn" },
  approved: { label: "Approved", tone: "ok" },
  declined: { label: "Declined", tone: "neutral" },
  cancelled: { label: "Cancelled", tone: "neutral" },
  returned: { label: "Returned", tone: "neutral" },
};

const ACTIVITY = {
  notification: { sent: "Notification sent", failed: "Notification failed" },
  reminder: { sent: "Reminder sent", failed: "Reminder failed" },
} as const;

function people(loan: Loan, view: View): string {
  if (view === "borrower") return `From ${loan.ownerName}`;
  if (view === "owner") return `To ${loan.borrowerName}`;
  return `${loan.ownerName} to ${loan.borrowerName}`;
}

function LoanRow({ loan, view }: { loan: Loan; view: View }) {
  const decide = useMutation(api.loans.decide);
  const cancel = useMutation(api.loans.cancel);
  const markReturned = useMutation(api.loans.markReturned);
  const { pending, error, run } = useSubmit();
  const loanId = loan._id;
  const status = loan.overdue
    ? { label: "Overdue", tone: "danger" as const }
    : STATUS[loan.status];

  // An approved loan is cancelled before its first day and returned after.
  const upcoming = loan.status === "approved" && !loan.started;
  const canCancel =
    view !== "admin" &&
    (upcoming || (view === "borrower" && loan.status === "requested"));
  const canDecide = view === "owner" && loan.status === "requested";
  const canReturn =
    view === "owner" && loan.status === "approved" && loan.started;

  return (
    <Row>
      <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-2">
        <div className="min-w-0 flex-1 basis-64">
          <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1">
            <h2 className="font-medium">{loan.toolName}</h2>
            <Status tone={status.tone}>{status.label}</Status>
          </div>
          <p className="mt-1 text-[13px] tabular-nums text-muted">
            {formatDay(loan.startDate)} to {formatDay(loan.endDate)} ·{" "}
            {people(loan, view)}
          </p>
          {loan.activity.length > 0 && (
            <ul className="mt-1.5 space-y-0.5 text-xs text-faint">
              {loan.activity.map((entry) => (
                <li
                  key={`${entry.kind}-${entry.at}`}
                  className={entry.status === "failed" ? "text-danger" : ""}
                >
                  {ACTIVITY[entry.kind][entry.status]} <TimeAgo at={entry.at} />
                </li>
              ))}
            </ul>
          )}
        </div>
        {(canCancel || canDecide || canReturn) && (
          <div className="flex shrink-0 items-center gap-1">
            {canDecide && (
              <>
                <Button
                  variant="ghost"
                  size="sm"
                  pending={pending}
                  aria-label={`Decline the request for ${loan.toolName}`}
                  onClick={() => run(() => decide({ loanId, approve: false }))}
                >
                  Decline
                </Button>
                <Button
                  variant="primary"
                  size="sm"
                  pending={pending}
                  aria-label={`Approve the request for ${loan.toolName}`}
                  onClick={() => run(() => decide({ loanId, approve: true }))}
                >
                  Approve
                </Button>
              </>
            )}
            {canReturn && (
              <Button
                size="sm"
                pending={pending}
                aria-label={`Mark ${loan.toolName} as returned`}
                onClick={() => run(() => markReturned({ loanId }))}
              >
                Mark as returned
              </Button>
            )}
            {canCancel && (
              <Button
                variant="danger"
                size="sm"
                pending={pending}
                aria-label={`${upcoming ? "Cancel the loan of" : "Cancel the request for"} ${loan.toolName}`}
                onClick={() => run(() => cancel({ loanId }))}
              >
                {upcoming ? "Cancel loan" : "Cancel request"}
              </Button>
            )}
          </div>
        )}
      </div>
      <FormError message={error} />
    </Row>
  );
}

export function LoanList({ loans, view }: { loans: Loan[]; view: View }) {
  return (
    <List>
      {loans.map((loan) => (
        <LoanRow key={loan._id} loan={loan} view={view} />
      ))}
    </List>
  );
}

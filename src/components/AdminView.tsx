"use client";

import { useMutation } from "convex/react";
import type { FunctionReturnType } from "convex/server";
import { api } from "../../convex/_generated/api";
import { useSubmit } from "@/lib/useSubmit";
import { LoanList } from "./LoanList";
import type { Loan } from "./LoanList";
import { TimeAgo } from "./TimeAgo";
import {
  Empty,
  FormError,
  List,
  Loading,
  Row,
  SectionHead,
  Status,
  Switch,
  Tag,
} from "./ui";

export type Member = FunctionReturnType<typeof api.admin.users>[number];
export type Issue = FunctionReturnType<
  typeof api.admin.automationIssues
>[number];

// Short labels for what failed. Outbox rows carry the event kind,
// log rows carry the type of message.
const ISSUE_LABELS: Record<string, string> = {
  notification: "Notification not sent",
  reminder: "Reminder not sent",
  "loan.requested": "Request event not delivered",
  "loan.approved": "Approval event not delivered",
  "loan.declined": "Decline event not delivered",
  "loan.cancelled": "Cancellation event not delivered",
  "loan.returned": "Return event not delivered",
};

function MemberRow({ member }: { member: Member }) {
  const setTrusted = useMutation(api.admin.setTrusted);
  const { pending, error, run } = useSubmit();

  return (
    <Row>
      <div className="flex items-center justify-between gap-4">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <span className="font-medium">{member.name}</span>
            {member.role === "admin" && <Tag>Admin</Tag>}
          </div>
          <p className="mt-0.5 text-[13px] text-muted">
            {member.listings} {member.listings === 1 ? "listing" : "listings"}
          </p>
        </div>
        <label className="flex shrink-0 items-center gap-2.5 text-[13px] text-muted">
          Trusted lender
          <Switch
            checked={member.trustedLender}
            label={`Trusted lender: ${member.name}`}
            disabled={pending}
            onChange={(trusted) =>
              run(() => setTrusted({ userId: member._id, trusted }))
            }
          />
        </label>
      </div>
      <FormError message={error} />
    </Row>
  );
}

export function AdminView({
  members,
  issues,
  loans,
}: {
  members: Member[] | undefined;
  issues: Issue[] | undefined;
  loans: Loan[] | undefined;
}) {
  return (
    <div className="space-y-10">
      <section aria-labelledby="members">
        <SectionHead
          id="members"
          title="Members"
          aside={members && members.length}
        />
        {members === undefined ? (
          <Loading />
        ) : (
          <List>
            {members.map((member) => (
              <MemberRow key={member._id} member={member} />
            ))}
          </List>
        )}
      </section>

      <section aria-labelledby="automation">
        <SectionHead
          id="automation"
          title="Automation problems"
          aside={issues && issues.length > 0 && issues.length}
        />
        {issues === undefined ? (
          <Loading rows={1} />
        ) : issues.length === 0 ? (
          <Empty>Every notification and reminder went through.</Empty>
        ) : (
          <List>
            {issues.map((issue) => (
              <Row key={issue._id}>
                <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1">
                  <Status tone="danger">
                    {ISSUE_LABELS[issue.what] ?? issue.what}
                  </Status>
                  <span className="text-[13px] text-faint">
                    {issue.source} · <TimeAgo at={issue.at} />
                  </span>
                </div>
                <p className="mt-1 break-words text-[13px] text-muted">
                  {issue.detail}
                </p>
              </Row>
            ))}
          </List>
        )}
      </section>

      <section aria-labelledby="all-loans">
        <SectionHead
          id="all-loans"
          title="All loans"
          aside={loans && loans.length > 0 && loans.length}
        />
        {loans === undefined ? (
          <Loading />
        ) : loans.length === 0 ? (
          <Empty>No loans yet.</Empty>
        ) : (
          <LoanList loans={loans} view="admin" />
        )}
      </section>
    </div>
  );
}

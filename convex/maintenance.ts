import { internalMutation } from "./_generated/server";
import { today } from "./lib/dates";
import { enqueueLoanEvent } from "./lib/loans";

// Housekeeping run by the cron jobs in crons.ts.

// Longer than the whole retry schedule in automation.ts (81 minutes).
const STUCK_AFTER_MS = 3 * 60 * 60 * 1000;

// A request nobody answered before its dates passed is declined, so it stops
// asking the lender for a decision that can no longer be made.
export const expireRequests = internalMutation({
  args: {},
  handler: async (ctx) => {
    const now = Date.now();
    const stale = await ctx.db
      .query("loans")
      .withIndex("by_status_and_end", (q) =>
        q.eq("status", "requested").lt("endDate", today(now)),
      )
      .collect();
    for (const loan of stale) {
      await ctx.db.patch(loan._id, { status: "declined", decidedAt: now });
      await enqueueLoanEvent(ctx, {
        loanId: loan._id,
        kind: "loan.declined",
        recipientId: loan.borrowerId,
      });
    }
    return stale.length;
  },
});

// If a delivery action dies before it records its attempt, nothing would
// retry the event. Such events are marked as failed, so they show up on the
// Admin page.
export const failStuckEvents = internalMutation({
  args: {},
  handler: async (ctx) => {
    const cutoff = Date.now() - STUCK_AFTER_MS;
    const pending = await ctx.db
      .query("outbox")
      .withIndex("by_state", (q) =>
        q.eq("state", "pending").lt("_creationTime", cutoff),
      )
      .collect();
    for (const event of pending) {
      await ctx.db.patch(event._id, {
        state: "failed",
        lastError: event.lastError ?? "Delivery did not complete",
      });
    }
    return pending.length;
  },
});

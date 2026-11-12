import { v } from "convex/values";
import { internal } from "./_generated/api";
import {
  internalAction,
  internalMutation,
  internalQuery,
} from "./_generated/server";
import { firstName } from "./lib/auth";
import { daysBetween } from "./lib/dates";
import { signedHeaders } from "./lib/signature";

// Everything in this file is internal. The browser cannot call it; it is
// reached only from mutations (through the scheduler) and from the signed
// HTTP endpoints in http.ts.

// Waits before the 2nd, 3rd, 4th and 5th delivery attempt.
const RETRY_DELAYS_MS = [60_000, 5 * 60_000, 15 * 60_000, 60 * 60_000];

// Builds what n8n needs to write one message, and no more: the recipient's
// first name and email, the other person's first name, the tool and the dates.
export const eventPayload = internalQuery({
  args: { eventId: v.id("outbox") },
  handler: async (ctx, args) => {
    const event = await ctx.db.get(args.eventId);
    if (event === null || event.state !== "pending") return null;

    const loan = await ctx.db.get(event.loanId);
    const recipient = await ctx.db.get(event.recipientId);
    if (loan === null || recipient === null) return null;

    const tool = await ctx.db.get(loan.toolId);
    const otherId =
      event.recipientId === loan.ownerId ? loan.borrowerId : loan.ownerId;
    const other = await ctx.db.get(otherId);

    return {
      eventId: event._id,
      kind: event.kind,
      loanId: loan._id,
      toolName: tool?.name ?? "a tool",
      startDate: loan.startDate,
      endDate: loan.endDate,
      recipient: { firstName: firstName(recipient), email: recipient.email },
      otherFirstName: other ? firstName(other) : "A neighbor",
    };
  },
});

export const recordAttempt = internalMutation({
  args: { eventId: v.id("outbox"), error: v.optional(v.string()) },
  handler: async (ctx, args) => {
    const event = await ctx.db.get(args.eventId);
    if (event === null || event.state !== "pending") return;

    const attempts = event.attempts + 1;
    if (args.error === undefined) {
      await ctx.db.patch(event._id, { state: "delivered", attempts });
      return;
    }

    const delay = RETRY_DELAYS_MS[attempts - 1];
    await ctx.db.patch(event._id, {
      attempts,
      lastError: args.error.slice(0, 300),
      state: delay === undefined ? "failed" : "pending",
    });
    if (delay !== undefined) {
      await ctx.scheduler.runAfter(delay, internal.automation.deliver, {
        eventId: event._id,
      });
    }
  },
});

export const deliver = internalAction({
  args: { eventId: v.id("outbox") },
  handler: async (ctx, args) => {
    const payload = await ctx.runQuery(internal.automation.eventPayload, args);
    if (payload === null) return;

    const url = process.env.N8N_WEBHOOK_URL;
    const secret = process.env.AUTOMATION_SECRET;
    let error: string | undefined;

    if (!url || !secret) {
      error = "N8N_WEBHOOK_URL or AUTOMATION_SECRET is not set";
    } else {
      const body = JSON.stringify({ ...payload, sentAt: Date.now() });
      try {
        const response = await fetch(url, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            ...(await signedHeaders(secret, body)),
          },
          body,
          signal: AbortSignal.timeout(10_000),
        });
        if (!response.ok) error = `n8n answered ${response.status}`;
      } catch (cause) {
        error = cause instanceof Error ? cause.message : "Request failed";
      }
    }

    await ctx.runMutation(internal.automation.recordAttempt, {
      eventId: args.eventId,
      error,
    });
  },
});

// Approved loans whose end date has passed and that have no reminder marked
// as sent for `day`. Re-running the reminder workflow on the same day returns
// an empty list for the loans it already handled.
export const overdueLoans = internalQuery({
  args: { day: v.string() },
  handler: async (ctx, args) => {
    const overdue = await ctx.db
      .query("loans")
      .withIndex("by_status_and_end", (q) =>
        q.eq("status", "approved").lt("endDate", args.day),
      )
      .collect();

    const result = [];
    for (const loan of overdue) {
      const reminderKey = `reminder:${loan._id}:${args.day}`;
      const logged = await ctx.db
        .query("automationLog")
        .withIndex("by_key", (q) => q.eq("key", reminderKey))
        .unique();
      if (logged?.status === "sent") continue;

      const borrower = await ctx.db.get(loan.borrowerId);
      const tool = await ctx.db.get(loan.toolId);
      if (borrower === null) continue;

      result.push({
        loanId: loan._id,
        reminderKey,
        toolName: tool?.name ?? "a tool",
        dueDate: loan.endDate,
        daysOverdue: daysBetween(loan.endDate, args.day),
        borrower: { firstName: firstName(borrower), email: borrower.email },
      });
    }
    return result;
  },
});

// Idempotent write-back from n8n. The first report for a key is stored. A
// repeat changes nothing, except that a retry may turn "failed" into "sent".
export const recordLog = internalMutation({
  args: {
    // A plain string, because it arrives over HTTP and may not be a real id.
    loanId: v.string(),
    kind: v.union(v.literal("notification"), v.literal("reminder")),
    key: v.string(),
    status: v.union(v.literal("sent"), v.literal("failed")),
    detail: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const loanId = ctx.db.normalizeId("loans", args.loanId);
    const loan = loanId === null ? null : await ctx.db.get(loanId);
    if (loanId === null || loan === null) {
      return { stored: false, reason: "unknown loan" };
    }

    const existing = await ctx.db
      .query("automationLog")
      .withIndex("by_key", (q) => q.eq("key", args.key))
      .unique();

    if (existing === null) {
      await ctx.db.insert("automationLog", {
        loanId,
        kind: args.kind,
        key: args.key,
        status: args.status,
        detail: args.detail?.slice(0, 300),
        at: Date.now(),
      });
      return { stored: true };
    }

    if (existing.status === "failed" && args.status === "sent") {
      await ctx.db.patch(existing._id, {
        status: "sent",
        detail: undefined,
        at: Date.now(),
      });
      return { stored: true };
    }
    return { stored: false, reason: "duplicate" };
  },
});

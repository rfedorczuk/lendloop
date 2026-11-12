import { ConvexError, v } from "convex/values";
import { mutation, query } from "./_generated/server";
import type { Doc, Id } from "./_generated/dataModel";
import type { QueryCtx } from "./_generated/server";
import { currentUser, publicName, requireAdmin, requireUser } from "./lib/auth";
import { assertLoanPeriod, today } from "./lib/dates";
import { conflictingLoan, enqueueLoanEvent } from "./lib/loans";

const MAX_OPEN_REQUESTS_PER_BORROWER = 10;

// Recent automation activity for a loan. A member sees reminders and the
// notifications addressed to them; an admin (viewerId null) sees everything.
async function recentActivity(
  ctx: QueryCtx,
  loan: Doc<"loans">,
  viewerId: Id<"users"> | null,
) {
  const log = await ctx.db
    .query("automationLog")
    .withIndex("by_loan", (q) => q.eq("loanId", loan._id))
    .order("desc")
    .take(12);

  const visible = [];
  for (const entry of log) {
    if (viewerId !== null && entry.kind === "notification") {
      const eventId = ctx.db.normalizeId(
        "outbox",
        entry.key.slice("notification:".length),
      );
      const event = eventId === null ? null : await ctx.db.get(eventId);
      if (event?.recipientId !== viewerId) continue;
    }
    visible.push({ kind: entry.kind, status: entry.status, at: entry.at });
    if (visible.length === 3) break;
  }
  return visible;
}

// The shape every loan list in the UI uses.
async function describeLoan(
  ctx: QueryCtx,
  loan: Doc<"loans">,
  viewer: "borrower" | "owner" | "admin",
  viewerId: Id<"users"> | null,
) {
  const tool = await ctx.db.get(loan.toolId);
  const owner = await ctx.db.get(loan.ownerId);
  const borrower = await ctx.db.get(loan.borrowerId);
  const day = today();

  return {
    _id: loan._id,
    toolName: tool?.name ?? "Removed listing",
    startDate: loan.startDate,
    endDate: loan.endDate,
    status: loan.status,
    started: loan.startDate <= day,
    overdue: loan.status === "approved" && loan.endDate < day,
    ownerName: viewer === "owner" ? "You" : publicName(owner),
    borrowerName: viewer === "borrower" ? "You" : publicName(borrower),
    activity: await recentActivity(ctx, loan, viewerId),
  };
}

export const mine = query({
  args: {},
  handler: async (ctx) => {
    const user = await requireUser(ctx);
    const loans = await ctx.db
      .query("loans")
      .withIndex("by_borrower", (q) => q.eq("borrowerId", user._id))
      .order("desc")
      .collect();
    return await Promise.all(
      loans.map((loan) => describeLoan(ctx, loan, "borrower", user._id)),
    );
  },
});

export const incoming = query({
  args: {},
  handler: async (ctx) => {
    const user = await requireUser(ctx);
    const loans = await ctx.db
      .query("loans")
      .withIndex("by_owner", (q) => q.eq("ownerId", user._id))
      .order("desc")
      .collect();
    return await Promise.all(
      loans.map((loan) => describeLoan(ctx, loan, "owner", user._id)),
    );
  },
});

// How many requests wait for this user's decision. Shown in the navigation,
// which renders before the user row exists, so it answers 0 instead of
// throwing.
export const waitingCount = query({
  args: {},
  handler: async (ctx) => {
    const user = await currentUser(ctx);
    if (user === null) return 0;
    const day = today();
    const loans = await ctx.db
      .query("loans")
      .withIndex("by_owner", (q) => q.eq("ownerId", user._id))
      .collect();
    return loans.filter(
      (loan) => loan.status === "requested" && loan.endDate >= day,
    ).length;
  },
});

export const all = query({
  args: {},
  handler: async (ctx) => {
    await requireAdmin(ctx);
    const loans = await ctx.db.query("loans").order("desc").take(200);
    return await Promise.all(
      loans.map((loan) => describeLoan(ctx, loan, "admin", null)),
    );
  },
});

export const request = mutation({
  args: {
    toolId: v.id("tools"),
    startDate: v.string(),
    endDate: v.string(),
  },
  handler: async (ctx, args) => {
    const user = await requireUser(ctx);
    const now = Date.now();
    assertLoanPeriod(args.startDate, args.endDate, now);

    const tool = await ctx.db.get(args.toolId);
    if (tool === null || tool.removedAt !== undefined) {
      throw new ConvexError("This listing no longer exists.");
    }
    if (tool.ownerId === user._id) {
      throw new ConvexError("You cannot borrow your own tool.");
    }

    const mine = await ctx.db
      .query("loans")
      .withIndex("by_borrower", (q) => q.eq("borrowerId", user._id))
      .collect();
    // Requests whose dates have passed no longer count against the limit.
    const open = mine.filter(
      (loan) => loan.status === "requested" && loan.endDate >= today(now),
    );
    if (open.length >= MAX_OPEN_REQUESTS_PER_BORROWER) {
      throw new ConvexError("You have too many open requests.");
    }
    if (open.some((loan) => loan.toolId === tool._id)) {
      throw new ConvexError("You already have an open request for this tool.");
    }

    if (await conflictingLoan(ctx, tool._id, args, today(now))) {
      throw new ConvexError("The tool is already booked for these dates.");
    }

    const loanId = await ctx.db.insert("loans", {
      toolId: tool._id,
      ownerId: tool.ownerId,
      borrowerId: user._id,
      startDate: args.startDate,
      endDate: args.endDate,
      status: "requested",
    });
    await enqueueLoanEvent(ctx, {
      loanId,
      kind: "loan.requested",
      recipientId: tool.ownerId,
    });
    return loanId;
  },
});

export const decide = mutation({
  args: { loanId: v.id("loans"), approve: v.boolean() },
  handler: async (ctx, args) => {
    const user = await requireUser(ctx);
    const loan = await ctx.db.get(args.loanId);
    if (loan === null || loan.ownerId !== user._id) {
      // Same answer for a missing loan and someone else's loan, so loan ids
      // cannot be probed.
      throw new ConvexError("You can decide only on requests for your tools.");
    }
    if (loan.status !== "requested") {
      throw new ConvexError("This request has already been decided.");
    }

    const now = Date.now();
    const day = today(now);
    if (args.approve) {
      if (loan.endDate < day) {
        throw new ConvexError("The requested dates have already passed.");
      }
      if (await conflictingLoan(ctx, loan.toolId, loan, day)) {
        throw new ConvexError("The tool is already booked for these dates.");
      }
    }

    await ctx.db.patch(loan._id, {
      status: args.approve ? "approved" : "declined",
      decidedAt: now,
    });
    await enqueueLoanEvent(ctx, {
      loanId: loan._id,
      kind: args.approve ? "loan.approved" : "loan.declined",
      recipientId: loan.borrowerId,
    });
  },
});

// The borrower can withdraw a request, and either side can call off an
// approved loan before its first day. After that the loan ends by a return.
export const cancel = mutation({
  args: { loanId: v.id("loans") },
  handler: async (ctx, args) => {
    const user = await requireUser(ctx);
    const loan = await ctx.db.get(args.loanId);
    const isBorrower = loan?.borrowerId === user._id;
    const isOwner = loan?.ownerId === user._id;
    if (loan === null || (!isBorrower && !isOwner)) {
      throw new ConvexError("You can cancel only loans you are part of.");
    }

    const now = Date.now();
    const notStarted =
      loan.status === "approved" && loan.startDate > today(now);
    const open = isBorrower && loan.status === "requested";
    if (!open && !notStarted) {
      throw new ConvexError("This loan can no longer be cancelled.");
    }

    await ctx.db.patch(loan._id, { status: "cancelled", decidedAt: now });
    await enqueueLoanEvent(ctx, {
      loanId: loan._id,
      kind: "loan.cancelled",
      recipientId: isBorrower ? loan.ownerId : loan.borrowerId,
    });
  },
});

export const markReturned = mutation({
  args: { loanId: v.id("loans") },
  handler: async (ctx, args) => {
    const user = await requireUser(ctx);
    const loan = await ctx.db.get(args.loanId);
    // The lender confirms the return, because they are the one who gets the
    // tool back.
    if (loan === null || loan.ownerId !== user._id) {
      throw new ConvexError("Only the lender can mark a loan as returned.");
    }
    if (loan.status !== "approved") {
      throw new ConvexError("Only an approved loan can be returned.");
    }
    const now = Date.now();
    if (loan.startDate > today(now)) {
      throw new ConvexError(
        "This loan has not started yet. Cancel it instead.",
      );
    }

    await ctx.db.patch(loan._id, { status: "returned", returnedAt: now });
    await enqueueLoanEvent(ctx, {
      loanId: loan._id,
      kind: "loan.returned",
      recipientId: loan.borrowerId,
    });
  },
});

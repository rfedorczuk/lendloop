import { ConvexError, v } from "convex/values";
import { mutation, query } from "./_generated/server";
import type { Doc } from "./_generated/dataModel";
import type { QueryCtx } from "./_generated/server";
import { publicName, requireAdmin, requireUser } from "./lib/auth";
import { assertLoanPeriod, today } from "./lib/dates";
import { conflictingLoan, enqueueLoanEvent } from "./lib/loans";

const MAX_OPEN_REQUESTS_PER_BORROWER = 10;

// The shape every loan list in the UI uses. `counterpart` is the other person
// in the loan from the viewer's side; an admin sees both names.
async function describeLoan(
  ctx: QueryCtx,
  loan: Doc<"loans">,
  viewer: "borrower" | "owner" | "admin",
) {
  const tool = await ctx.db.get(loan.toolId);
  const owner = await ctx.db.get(loan.ownerId);
  const borrower = await ctx.db.get(loan.borrowerId);
  const log = await ctx.db
    .query("automationLog")
    .withIndex("by_loan", (q) => q.eq("loanId", loan._id))
    .order("desc")
    .take(3);

  return {
    _id: loan._id,
    toolName: tool?.name ?? "Removed listing",
    startDate: loan.startDate,
    endDate: loan.endDate,
    status: loan.status,
    overdue: loan.status === "approved" && loan.endDate < today(),
    ownerName: viewer === "owner" ? "You" : publicName(owner),
    borrowerName: viewer === "borrower" ? "You" : publicName(borrower),
    activity: log.map((entry) => ({
      kind: entry.kind,
      status: entry.status,
      at: entry.at,
    })),
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
      loans.map((loan) => describeLoan(ctx, loan, "borrower")),
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
      loans.map((loan) => describeLoan(ctx, loan, "owner")),
    );
  },
});

export const all = query({
  args: {},
  handler: async (ctx) => {
    await requireAdmin(ctx);
    const loans = await ctx.db.query("loans").order("desc").take(200);
    return await Promise.all(
      loans.map((loan) => describeLoan(ctx, loan, "admin")),
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
    const open = mine.filter((loan) => loan.status === "requested");
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

export const cancel = mutation({
  args: { loanId: v.id("loans") },
  handler: async (ctx, args) => {
    const user = await requireUser(ctx);
    const loan = await ctx.db.get(args.loanId);
    if (loan === null || loan.borrowerId !== user._id) {
      throw new ConvexError("You can cancel only your own requests.");
    }
    const now = Date.now();
    const notStarted =
      loan.status === "approved" && loan.startDate > today(now);
    if (loan.status !== "requested" && !notStarted) {
      throw new ConvexError("This loan can no longer be cancelled.");
    }

    await ctx.db.patch(loan._id, { status: "cancelled", decidedAt: now });
    await enqueueLoanEvent(ctx, {
      loanId: loan._id,
      kind: "loan.cancelled",
      recipientId: loan.ownerId,
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

    await ctx.db.patch(loan._id, {
      status: "returned",
      returnedAt: Date.now(),
    });
    await enqueueLoanEvent(ctx, {
      loanId: loan._id,
      kind: "loan.returned",
      recipientId: loan.borrowerId,
    });
  },
});

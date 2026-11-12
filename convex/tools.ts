import { ConvexError, v } from "convex/values";
import { mutation, query } from "./_generated/server";
import type { Doc } from "./_generated/dataModel";
import { category, condition } from "./schema";
import { publicName, requireUser } from "./lib/auth";
import { today } from "./lib/dates";
import {
  approvedLoansByTool,
  availability,
  enqueueLoanEvent,
} from "./lib/loans";

const MAX_LISTINGS_PER_OWNER = 50;

function cleanListing(input: { name: string; description: string }) {
  const name = input.name.trim();
  const description = input.description.trim();
  if (name.length < 2 || name.length > 60) {
    throw new ConvexError("The name must be 2 to 60 characters long.");
  }
  if (description.length > 280) {
    throw new ConvexError("The description can be at most 280 characters.");
  }
  return { name, description };
}

// The only query that works without signing in. It returns the name and
// category of tools that are free today and nothing about their owners.
export const listPublic = query({
  args: {},
  handler: async (ctx) => {
    const day = today();
    const loans = await approvedLoansByTool(ctx);
    const tools = await ctx.db.query("tools").collect();
    return tools
      .filter((tool) => tool.removedAt === undefined)
      .filter(
        (tool) =>
          availability(loans.get(tool._id) ?? [], day).state === "available",
      )
      .map((tool) => ({
        _id: tool._id,
        name: tool.name,
        category: tool.category,
      }));
  },
});

export const list = query({
  args: { category: v.optional(category) },
  handler: async (ctx, args) => {
    const user = await requireUser(ctx);
    const day = today();
    const loans = await approvedLoansByTool(ctx);
    const tools = (await ctx.db.query("tools").collect()).filter(
      (tool) =>
        tool.removedAt === undefined &&
        (args.category === undefined || tool.category === args.category),
    );

    const owners = new Map<string, Doc<"users"> | null>();
    for (const tool of tools) {
      if (!owners.has(tool.ownerId)) {
        owners.set(tool.ownerId, await ctx.db.get(tool.ownerId));
      }
    }

    return tools.map((tool) => {
      const owner = owners.get(tool.ownerId) ?? null;
      return {
        _id: tool._id,
        name: tool.name,
        category: tool.category,
        condition: tool.condition,
        description: tool.description,
        ownerName: publicName(owner),
        ownerTrusted: owner?.trustedLender ?? false,
        isMine: tool.ownerId === user._id,
        availability: availability(loans.get(tool._id) ?? [], day),
      };
    });
  },
});

export const mine = query({
  args: {},
  handler: async (ctx) => {
    const user = await requireUser(ctx);
    const day = today();
    const loans = await approvedLoansByTool(ctx);
    const tools = await ctx.db
      .query("tools")
      .withIndex("by_owner", (q) => q.eq("ownerId", user._id))
      .collect();
    return tools
      .filter((tool) => tool.removedAt === undefined)
      .map((tool) => ({
        _id: tool._id,
        name: tool.name,
        category: tool.category,
        condition: tool.condition,
        description: tool.description,
        availability: availability(loans.get(tool._id) ?? [], day),
      }));
  },
});

export const create = mutation({
  args: {
    name: v.string(),
    category,
    condition,
    description: v.string(),
  },
  handler: async (ctx, args) => {
    const user = await requireUser(ctx);
    const listing = cleanListing(args);

    const existing = await ctx.db
      .query("tools")
      .withIndex("by_owner", (q) => q.eq("ownerId", user._id))
      .collect();
    const active = existing.filter((tool) => tool.removedAt === undefined);
    if (active.length >= MAX_LISTINGS_PER_OWNER) {
      throw new ConvexError(
        `You can list at most ${MAX_LISTINGS_PER_OWNER} tools.`,
      );
    }

    return await ctx.db.insert("tools", {
      ownerId: user._id,
      category: args.category,
      condition: args.condition,
      ...listing,
    });
  },
});

export const update = mutation({
  args: {
    toolId: v.id("tools"),
    name: v.string(),
    category,
    condition,
    description: v.string(),
  },
  handler: async (ctx, args) => {
    const user = await requireUser(ctx);
    const tool = await ctx.db.get(args.toolId);
    if (tool === null || tool.removedAt !== undefined) {
      throw new ConvexError("This listing no longer exists.");
    }
    // Admins can remove a listing but cannot rewrite someone else's.
    if (tool.ownerId !== user._id) {
      throw new ConvexError("You can edit only your own listings.");
    }
    await ctx.db.patch(tool._id, {
      category: args.category,
      condition: args.condition,
      ...cleanListing(args),
    });
  },
});

export const remove = mutation({
  args: { toolId: v.id("tools") },
  handler: async (ctx, args) => {
    const user = await requireUser(ctx);
    const tool = await ctx.db.get(args.toolId);
    if (tool === null || tool.removedAt !== undefined) {
      throw new ConvexError("This listing no longer exists.");
    }
    if (tool.ownerId !== user._id && user.role !== "admin") {
      throw new ConvexError("You can remove only your own listings.");
    }

    const now = Date.now();
    const day = today(now);
    await ctx.db.patch(tool._id, { removedAt: now });

    // Open requests and loans that have not started end with the listing.
    // A loan already in progress stays, so the owner can still mark it returned.
    const loans = await ctx.db
      .query("loans")
      .withIndex("by_tool", (q) => q.eq("toolId", tool._id))
      .collect();
    for (const loan of loans) {
      if (loan.status === "requested") {
        await ctx.db.patch(loan._id, { status: "declined", decidedAt: now });
        await enqueueLoanEvent(ctx, {
          loanId: loan._id,
          kind: "loan.declined",
          recipientId: loan.borrowerId,
        });
      } else if (loan.status === "approved" && loan.startDate > day) {
        await ctx.db.patch(loan._id, { status: "cancelled", decidedAt: now });
        await enqueueLoanEvent(ctx, {
          loanId: loan._id,
          kind: "loan.cancelled",
          recipientId: loan.borrowerId,
        });
      }
    }
  },
});

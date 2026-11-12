import { ConvexError, v } from "convex/values";
import { mutation, query } from "./_generated/server";
import type { Doc } from "./_generated/dataModel";
import { category, condition } from "./schema";
import { publicName, requireUser } from "./lib/auth";
import { today } from "./lib/dates";
import { enqueueLoanEvent, toolAvailability } from "./lib/loans";
import { cleanSearch, cutPage, pageArgs, rowsToRead } from "./lib/paging";

const MAX_LISTINGS_PER_OWNER = 50;
const PUBLIC_LIST_SIZE = 50;

function cleanListing(input: { name: string; description: string }) {
  // Control characters and line breaks become spaces. Names end up in email
  // subjects, where a line break would be a header injection.
  const tidy = (text: string) => text.replace(/\p{Cc}+/gu, " ").trim();
  const name = tidy(input.name);
  const description = tidy(input.description);
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
    const tools = await ctx.db
      .query("tools")
      .withIndex("by_removed", (q) => q.eq("removedAt", undefined))
      .order("desc")
      .take(PUBLIC_LIST_SIZE);

    const free = [];
    for (const tool of tools) {
      const { state } = await toolAvailability(ctx, tool._id, day);
      if (state === "available") {
        free.push({ _id: tool._id, name: tool.name, category: tool.category });
      }
    }
    return free;
  },
});

// The board: live listings, newest first, or the best matches when a search
// is given. One page at a time.
export const list = query({
  args: { ...pageArgs, category: v.optional(category) },
  handler: async (ctx, args) => {
    const user = await requireUser(ctx);
    const text = cleanSearch(args.search);
    const limit = rowsToRead(args.page);
    const { category } = args;

    let rows: Doc<"tools">[];
    if (text !== "") {
      rows = await ctx.db
        .query("tools")
        .withSearchIndex("search_name", (q) => {
          const live = q.search("name", text).eq("removedAt", undefined);
          return category === undefined ? live : live.eq("category", category);
        })
        .take(limit);
    } else if (category !== undefined) {
      rows = await ctx.db
        .query("tools")
        .withIndex("by_removed_and_category", (q) =>
          q.eq("removedAt", undefined).eq("category", category),
        )
        .order("desc")
        .take(limit);
    } else {
      rows = await ctx.db
        .query("tools")
        .withIndex("by_removed", (q) => q.eq("removedAt", undefined))
        .order("desc")
        .take(limit);
    }

    const { rows: tools, ...paging } = cutPage(rows, args.page);
    const day = today();
    const items = [];
    for (const tool of tools) {
      const owner = await ctx.db.get(tool.ownerId);
      items.push({
        _id: tool._id,
        name: tool.name,
        category: tool.category,
        condition: tool.condition,
        description: tool.description,
        ownerName: publicName(owner),
        ownerTrusted: owner?.trustedLender ?? false,
        isMine: tool.ownerId === user._id,
        availability: await toolAvailability(ctx, tool._id, day),
      });
    }
    return { items, ...paging };
  },
});

// A member has at most MAX_LISTINGS_PER_OWNER listings, so this list is
// short by construction and is not paged.
export const mine = query({
  args: {},
  handler: async (ctx) => {
    const user = await requireUser(ctx);
    const day = today();
    const tools = await ctx.db
      .query("tools")
      .withIndex("by_owner", (q) => q.eq("ownerId", user._id))
      .order("desc")
      .collect();

    const items = [];
    for (const tool of tools) {
      if (tool.removedAt !== undefined) continue;
      items.push({
        _id: tool._id,
        name: tool.name,
        category: tool.category,
        condition: tool.condition,
        description: tool.description,
        availability: await toolAvailability(ctx, tool._id, day),
      });
    }
    return items;
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
    const listing = cleanListing(args);
    await ctx.db.patch(tool._id, {
      category: args.category,
      condition: args.condition,
      ...listing,
    });

    // Loans carry a copy of the name. Keep it in step after a rename.
    if (listing.name !== tool.name) {
      const loans = await ctx.db
        .query("loans")
        .withIndex("by_tool_and_status", (q) => q.eq("toolId", tool._id))
        .collect();
      for (const loan of loans) {
        await ctx.db.patch(loan._id, { toolName: listing.name });
      }
    }
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
      .withIndex("by_tool_and_status", (q) => q.eq("toolId", tool._id))
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

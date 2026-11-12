import { ConvexError, v } from "convex/values";
import { mutation, query } from "./_generated/server";
import { requireAdmin } from "./lib/auth";
import { cleanSearch, cutPage, pageArgs, rowsToRead } from "./lib/paging";

export const users = query({
  args: pageArgs,
  handler: async (ctx, args) => {
    await requireAdmin(ctx);
    const text = cleanSearch(args.search);
    const limit = rowsToRead(args.page);
    const rows =
      text !== ""
        ? await ctx.db
            .query("users")
            .withSearchIndex("search_name", (q) => q.search("name", text))
            .take(limit)
        : await ctx.db.query("users").order("desc").take(limit);

    const { rows: users, ...paging } = cutPage(rows, args.page);
    const items = await Promise.all(
      users.map(async (user) => {
        const tools = await ctx.db
          .query("tools")
          .withIndex("by_owner", (q) => q.eq("ownerId", user._id))
          .collect();
        return {
          _id: user._id,
          name: user.name,
          role: user.role,
          trustedLender: user.trustedLender,
          listings: tools.filter((tool) => tool.removedAt === undefined).length,
        };
      }),
    );
    return { items, ...paging };
  },
});

export const setTrusted = mutation({
  args: { userId: v.id("users"), trusted: v.boolean() },
  handler: async (ctx, args) => {
    await requireAdmin(ctx);
    const user = await ctx.db.get(args.userId);
    if (user === null) {
      throw new ConvexError("This member no longer exists.");
    }
    await ctx.db.patch(user._id, { trustedLender: args.trusted });
  },
});

// Deliveries to n8n that ran out of retries and notifications n8n reported
// as failed. Shown to admins so a broken automation is noticed.
export const automationIssues = query({
  args: {},
  handler: async (ctx) => {
    await requireAdmin(ctx);
    const undelivered = await ctx.db
      .query("outbox")
      .withIndex("by_state", (q) => q.eq("state", "failed"))
      .order("desc")
      .take(25);
    const failedRuns = await ctx.db
      .query("automationLog")
      .withIndex("by_status", (q) => q.eq("status", "failed"))
      .order("desc")
      .take(25);

    return [
      ...undelivered.map((event) => ({
        _id: event._id as string,
        at: event._creationTime,
        source: "Convex to n8n",
        what: event.kind,
        detail: event.lastError ?? "Delivery failed",
      })),
      ...failedRuns.map((entry) => ({
        _id: entry._id as string,
        at: entry.at,
        source: "n8n workflow",
        what: entry.kind,
        detail: entry.detail ?? "Reported as failed",
      })),
    ].sort((a, b) => b.at - a.at);
  },
});

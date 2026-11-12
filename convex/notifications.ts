import { mutation, query } from "./_generated/server";
import { currentUser, firstName, requireUser } from "./lib/auth";

const LIST_SIZE = 20;

// The signed-in user's recent loan events, newest first. This reads the
// outbox directly, so the list is there even when n8n or email is down.
export const list = query({
  args: {},
  handler: async (ctx) => {
    // Rendered in the header before the user row exists, so no throwing.
    const user = await currentUser(ctx);
    if (user === null) return { items: [], unread: 0 };

    const events = await ctx.db
      .query("outbox")
      .withIndex("by_recipient", (q) => q.eq("recipientId", user._id))
      .order("desc")
      .take(LIST_SIZE);
    const seenAt = user.notificationsSeenAt ?? 0;

    const items = [];
    for (const event of events) {
      const loan = await ctx.db.get(event.loanId);
      if (loan === null) continue;
      const lends = loan.ownerId === user._id;
      const other = await ctx.db.get(lends ? loan.borrowerId : loan.ownerId);

      items.push({
        _id: event._id,
        kind: event.kind,
        toolName: loan.toolName,
        otherName: other ? firstName(other) : "A neighbor",
        startDate: loan.startDate,
        endDate: loan.endDate,
        at: event._creationTime,
        unread: event._creationTime > seenAt,
        // Where the loan can be acted on.
        href: lends ? "/incoming" : "/requests",
      });
    }
    return { items, unread: items.filter((item) => item.unread).length };
  },
});

export const markSeen = mutation({
  args: {},
  handler: async (ctx) => {
    const user = await requireUser(ctx);
    await ctx.db.patch(user._id, { notificationsSeenAt: Date.now() });
  },
});

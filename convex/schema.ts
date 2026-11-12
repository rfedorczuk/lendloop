import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

export const category = v.union(
  v.literal("power_tools"),
  v.literal("hand_tools"),
  v.literal("garden"),
  v.literal("kitchen"),
  v.literal("camping"),
  v.literal("cleaning"),
  v.literal("other"),
);

export const condition = v.union(
  v.literal("like_new"),
  v.literal("good"),
  v.literal("worn"),
);

export const loanStatus = v.union(
  v.literal("requested"),
  v.literal("approved"),
  v.literal("declined"),
  v.literal("cancelled"),
  v.literal("returned"),
);

export const loanEventKind = v.union(
  v.literal("loan.requested"),
  v.literal("loan.approved"),
  v.literal("loan.declined"),
  v.literal("loan.cancelled"),
  v.literal("loan.returned"),
);

export default defineSchema({
  users: defineTable({
    // Clerk identity, stable across sessions. Never sent to the client.
    tokenIdentifier: v.string(),
    name: v.string(),
    email: v.string(),
    role: v.union(v.literal("admin"), v.literal("user")),
    trustedLender: v.boolean(),
    // When the user last opened the notification list.
    notificationsSeenAt: v.optional(v.number()),
  })
    .index("by_token", ["tokenIdentifier"])
    .searchIndex("search_name", { searchField: "name" }),

  tools: defineTable({
    ownerId: v.id("users"),
    name: v.string(),
    category,
    condition,
    description: v.string(),
    // Listings are soft-deleted so past loans keep their history.
    removedAt: v.optional(v.number()),
  })
    .index("by_owner", ["ownerId"])
    // removedAt is undefined for a live listing, so these two indexes list
    // the live ones, newest first, with or without a category.
    .index("by_removed", ["removedAt"])
    .index("by_removed_and_category", ["removedAt", "category"])
    .searchIndex("search_name", {
      searchField: "name",
      filterFields: ["removedAt", "category"],
    }),

  loans: defineTable({
    toolId: v.id("tools"),
    ownerId: v.id("users"),
    borrowerId: v.id("users"),
    // Copied from the tool, so loans can be searched by name and keep a
    // readable title after the listing is removed.
    toolName: v.string(),
    // Calendar dates as YYYY-MM-DD. Both ends are inclusive.
    startDate: v.string(),
    endDate: v.string(),
    status: loanStatus,
    decidedAt: v.optional(v.number()),
    returnedAt: v.optional(v.number()),
  })
    .index("by_tool_and_status", ["toolId", "status"])
    .index("by_owner", ["ownerId"])
    .index("by_owner_and_status", ["ownerId", "status"])
    .index("by_borrower", ["borrowerId"])
    .index("by_status_and_end", ["status", "endDate"])
    .searchIndex("search_tool", {
      searchField: "toolName",
      filterFields: ["ownerId", "borrowerId"],
    }),

  // One row per loan event and recipient. It is written in the same
  // transaction as the loan change and does two jobs: the in-app notification
  // list reads it directly, and a scheduled action delivers it to n8n.
  outbox: defineTable({
    loanId: v.id("loans"),
    kind: loanEventKind,
    recipientId: v.id("users"),
    state: v.union(
      v.literal("pending"),
      v.literal("delivered"),
      v.literal("failed"),
    ),
    attempts: v.number(),
    lastError: v.optional(v.string()),
  })
    .index("by_loan", ["loanId"])
    .index("by_state", ["state"])
    .index("by_recipient", ["recipientId"]),

  // What n8n reports back. `key` makes every write-back idempotent.
  automationLog: defineTable({
    loanId: v.id("loans"),
    kind: v.union(v.literal("notification"), v.literal("reminder")),
    key: v.string(),
    status: v.union(v.literal("sent"), v.literal("failed")),
    detail: v.optional(v.string()),
    at: v.number(),
  })
    .index("by_key", ["key"])
    .index("by_loan", ["loanId"])
    .index("by_status", ["status"]),
});

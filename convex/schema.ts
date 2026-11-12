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
  }).index("by_token", ["tokenIdentifier"]),

  tools: defineTable({
    ownerId: v.id("users"),
    name: v.string(),
    category,
    condition,
    description: v.string(),
    // Listings are soft-deleted so past loans keep their history.
    removedAt: v.optional(v.number()),
  }).index("by_owner", ["ownerId"]),

  loans: defineTable({
    toolId: v.id("tools"),
    ownerId: v.id("users"),
    borrowerId: v.id("users"),
    // Calendar dates as YYYY-MM-DD. Both ends are inclusive.
    startDate: v.string(),
    endDate: v.string(),
    status: loanStatus,
    decidedAt: v.optional(v.number()),
    returnedAt: v.optional(v.number()),
  })
    .index("by_tool", ["toolId"])
    .index("by_owner", ["ownerId"])
    .index("by_borrower", ["borrowerId"])
    .index("by_status_and_end", ["status", "endDate"]),

  // Outgoing events for n8n. A row is written in the same transaction as the
  // loan change, then delivered by a scheduled action with retries.
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
    .index("by_state", ["state"]),

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

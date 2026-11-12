import { ConvexError } from "convex/values";
import type { Doc } from "../_generated/dataModel";
import type { MutationCtx, QueryCtx } from "../_generated/server";

type Ctx = QueryCtx | MutationCtx;

// Every public function goes through one of these helpers. The role comes
// from the users table, never from an argument the client could forge.

export async function currentUser(ctx: Ctx): Promise<Doc<"users"> | null> {
  const identity = await ctx.auth.getUserIdentity();
  if (identity === null) return null;
  return await ctx.db
    .query("users")
    .withIndex("by_token", (q) =>
      q.eq("tokenIdentifier", identity.tokenIdentifier),
    )
    .unique();
}

export async function requireUser(ctx: Ctx): Promise<Doc<"users">> {
  const user = await currentUser(ctx);
  if (user === null) {
    throw new ConvexError("You need to sign in first.");
  }
  return user;
}

export async function requireAdmin(ctx: Ctx): Promise<Doc<"users">> {
  const user = await requireUser(ctx);
  if (user.role !== "admin") {
    throw new ConvexError("Only an admin can do this.");
  }
  return user;
}

// Other members see a first name and an initial, not the full name or email.
export function publicName(user: Doc<"users"> | null): string {
  if (user === null) return "Former member";
  const [first, ...rest] = user.name.trim().split(/\s+/);
  const last = rest.at(-1);
  return last ? `${first} ${last[0]}.` : first;
}

export function firstName(user: Doc<"users">): string {
  return user.name.trim().split(/\s+/)[0];
}

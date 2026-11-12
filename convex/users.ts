import { ConvexError } from "convex/values";
import { mutation, query } from "./_generated/server";
import { currentUser } from "./lib/auth";

// Admins are named in the ADMIN_EMAILS environment variable of the Convex
// deployment (comma separated). The role is granted only for an address that
// Clerk has verified, so nobody becomes admin by typing someone else's email.
function roleFor(email: string, emailVerified: boolean): "admin" | "user" {
  const admins = (process.env.ADMIN_EMAILS ?? "")
    .split(",")
    .map((entry) => entry.trim().toLowerCase())
    .filter(Boolean);
  return emailVerified && admins.includes(email) ? "admin" : "user";
}

// Called by the client after sign-in. Creates the user on first visit and
// keeps name, email and role in sync with Clerk and ADMIN_EMAILS afterwards.
export const store = mutation({
  args: {},
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity();
    if (identity === null) {
      throw new ConvexError("You need to sign in first.");
    }

    const email = (identity.email ?? "").trim().toLowerCase();
    if (email === "") {
      // Notifications go to this address, so an account without one is
      // stopped here and not when the first message fails.
      throw new ConvexError("Your account needs an email address.");
    }
    const name =
      identity.name?.trim() ||
      identity.givenName?.trim() ||
      email.split("@")[0] ||
      "Neighbor";
    const role = roleFor(email, identity.emailVerified === true);

    const existing = await ctx.db
      .query("users")
      .withIndex("by_token", (q) =>
        q.eq("tokenIdentifier", identity.tokenIdentifier),
      )
      .unique();

    if (existing === null) {
      return await ctx.db.insert("users", {
        tokenIdentifier: identity.tokenIdentifier,
        name,
        email,
        role,
        trustedLender: false,
      });
    }

    if (
      existing.name !== name ||
      existing.email !== email ||
      existing.role !== role
    ) {
      await ctx.db.patch(existing._id, { name, email, role });
    }
    return existing._id;
  },
});

export const me = query({
  args: {},
  handler: async (ctx) => {
    const user = await currentUser(ctx);
    if (user === null) return null;
    return {
      _id: user._id,
      name: user.name,
      role: user.role,
      trustedLender: user.trustedLender,
    };
  },
});

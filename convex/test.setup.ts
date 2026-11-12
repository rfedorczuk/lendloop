/// <reference types="vite/client" />
import { convexTest } from "convex-test";
import { api } from "./_generated/api";
import schema from "./schema";

// Shared setup for the tests. The second dot in the file name keeps Convex
// from deploying it as a function module.

export const modules = import.meta.glob("./**/*.ts");

export const NOW = Date.parse("2026-11-12T10:00:00Z");
export const SECRET = "test-secret-not-used-anywhere-else";

export function day(offset: number): string {
  return new Date(NOW + offset * 86_400_000).toISOString().slice(0, 10);
}

function identity(name: string, email: string, emailVerified = true) {
  return {
    tokenIdentifier: `https://clerk.test|${email}`,
    name,
    email,
    emailVerified,
  };
}

export async function setup() {
  const t = convexTest(schema, modules);
  const alice = t.withIdentity(identity("Alice Nowak", "alice@example.com"));
  const bob = t.withIdentity(identity("Bob Kowal", "bob@example.com"));
  const carol = t.withIdentity(identity("Carol Lis", "carol@example.com"));
  const admin = t.withIdentity(identity("Ada Admin", "admin@example.com"));

  for (const user of [alice, bob, carol, admin]) {
    await user.mutation(api.users.store, {});
  }

  const drill = await alice.mutation(api.tools.create, {
    name: "Cordless drill",
    category: "power_tools",
    condition: "good",
    description: "18 V, two batteries.",
  });

  return { t, alice, bob, carol, admin, drill, identity };
}

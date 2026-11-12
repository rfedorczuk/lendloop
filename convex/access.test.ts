import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { api } from "./_generated/api";
import { NOW, day, setup } from "./test.setup";

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(NOW);
  vi.stubEnv("ADMIN_EMAILS", "admin@example.com, second-admin@example.com");
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.useRealTimers();
});

describe("roles", () => {
  test("the role comes from ADMIN_EMAILS", async () => {
    const { alice, admin } = await setup();
    expect((await alice.query(api.users.me, {}))?.role).toBe("user");
    expect((await admin.query(api.users.me, {}))?.role).toBe("admin");
  });

  test("an unverified admin email does not grant the admin role", async () => {
    const { t, identity } = await setup();
    const impostor = t.withIdentity(
      identity("Not Ada", "second-admin@example.com", false),
    );
    await impostor.mutation(api.users.store, {});
    expect((await impostor.query(api.users.me, {}))?.role).toBe("user");
  });

  test("admin-only functions reject regular users", async () => {
    const { alice, bob } = await setup();
    const bobId = (await bob.query(api.users.me, {}))!._id;

    await expect(alice.query(api.admin.users, {})).rejects.toThrow(/admin/);
    await expect(alice.query(api.loans.all, {})).rejects.toThrow(/admin/);
    await expect(alice.query(api.admin.automationIssues, {})).rejects.toThrow(
      /admin/,
    );
    await expect(
      alice.mutation(api.admin.setTrusted, { userId: bobId, trusted: true }),
    ).rejects.toThrow(/admin/);
  });

  test("an admin can mark a lender as trusted", async () => {
    const { alice, bob, admin } = await setup();
    const aliceId = (await alice.query(api.users.me, {}))!._id;
    await admin.mutation(api.admin.setTrusted, {
      userId: aliceId,
      trusted: true,
    });

    const board = await bob.query(api.tools.list, {});
    expect(board[0].ownerTrusted).toBe(true);
  });
});

describe("accounts and input", () => {
  test("an account without an email is rejected", async () => {
    const { t } = await setup();
    const nobody = t.withIdentity({
      tokenIdentifier: "https://clerk.test|no-email",
      name: "No Email",
    });
    await expect(nobody.mutation(api.users.store, {})).rejects.toThrow(
      /email address/,
    );
  });

  test("line breaks are removed from tool names", async () => {
    const { alice } = await setup();
    await alice.mutation(api.tools.create, {
      name: `Ladder${String.fromCharCode(13, 10)}Bcc: someone@example.com`,
      category: "other",
      condition: "good",
      description: "",
    });
    const names = (await alice.query(api.tools.mine, {})).map(
      (tool) => tool.name,
    );
    expect(names).toContain("Ladder Bcc: someone@example.com");
  });
});

describe("listings", () => {
  test("the public list shows name and category only", async () => {
    const { t } = await setup();
    const tools = await t.query(api.tools.listPublic, {});
    expect(tools).toHaveLength(1);
    expect(Object.keys(tools[0]).sort()).toEqual(["_id", "category", "name"]);
  });

  test("signed-out visitors cannot read the full board", async () => {
    const { t } = await setup();
    await expect(t.query(api.tools.list, {})).rejects.toThrow(/sign in/);
  });

  test("other members see a short name, never an email", async () => {
    const { bob } = await setup();
    const [tool] = await bob.query(api.tools.list, {});
    expect(tool.ownerName).toBe("Alice N.");
    expect(JSON.stringify(tool)).not.toContain("alice@example.com");
  });

  test("only the owner can edit a listing", async () => {
    const { bob, admin, drill } = await setup();
    const change = {
      toolId: drill,
      name: "Mine now",
      category: "other" as const,
      condition: "worn" as const,
      description: "",
    };
    await expect(bob.mutation(api.tools.update, change)).rejects.toThrow(
      /only your own/,
    );
    await expect(admin.mutation(api.tools.update, change)).rejects.toThrow(
      /only your own/,
    );
  });

  test("a regular user cannot remove someone else's listing", async () => {
    const { bob, drill } = await setup();
    await expect(
      bob.mutation(api.tools.remove, { toolId: drill }),
    ).rejects.toThrow(/only your own/);
  });

  test("an admin can remove any listing and open requests are declined", async () => {
    const { t, bob, admin, drill } = await setup();
    await bob.mutation(api.loans.request, {
      toolId: drill,
      startDate: day(1),
      endDate: day(2),
    });

    await admin.mutation(api.tools.remove, { toolId: drill });

    expect(await t.query(api.tools.listPublic, {})).toHaveLength(0);
    const [request] = await bob.query(api.loans.mine, {});
    expect(request.status).toBe("declined");
  });
});

describe("loans", () => {
  test("you cannot borrow your own tool", async () => {
    const { alice, drill } = await setup();
    await expect(
      alice.mutation(api.loans.request, {
        toolId: drill,
        startDate: day(1),
        endDate: day(2),
      }),
    ).rejects.toThrow(/your own tool/);
  });

  test("dates are validated on the server", async () => {
    const { bob, drill } = await setup();
    const request = (startDate: string, endDate: string) =>
      bob.mutation(api.loans.request, { toolId: drill, startDate, endDate });

    await expect(request(day(-1), day(1))).rejects.toThrow(/past/);
    await expect(request(day(3), day(2))).rejects.toThrow(/before/);
    await expect(request(day(1), day(40))).rejects.toThrow(/at most/);
    await expect(request("2026-02-31", "2026-03-01")).rejects.toThrow(/valid/);
  });

  test("only the owner can approve or decline", async () => {
    const { bob, carol, admin, drill } = await setup();
    const loanId = await bob.mutation(api.loans.request, {
      toolId: drill,
      startDate: day(1),
      endDate: day(2),
    });
    for (const user of [bob, carol, admin]) {
      await expect(
        user.mutation(api.loans.decide, { loanId, approve: true }),
      ).rejects.toThrow(/your tools/);
    }
  });

  test("an approved loan blocks overlapping dates", async () => {
    const { alice, bob, carol, drill } = await setup();
    const first = await bob.mutation(api.loans.request, {
      toolId: drill,
      startDate: day(1),
      endDate: day(5),
    });
    const second = await carol.mutation(api.loans.request, {
      toolId: drill,
      startDate: day(4),
      endDate: day(6),
    });
    await alice.mutation(api.loans.decide, { loanId: first, approve: true });

    await expect(
      alice.mutation(api.loans.decide, { loanId: second, approve: true }),
    ).rejects.toThrow(/already booked/);
    await carol.mutation(api.loans.cancel, { loanId: second });
    await expect(
      carol.mutation(api.loans.request, {
        toolId: drill,
        startDate: day(5),
        endDate: day(7),
      }),
    ).rejects.toThrow(/already booked/);
  });

  test("only the borrower can cancel and only the lender can confirm a return", async () => {
    const { alice, bob, carol, drill } = await setup();
    const loanId = await bob.mutation(api.loans.request, {
      toolId: drill,
      startDate: day(0),
      endDate: day(2),
    });

    await expect(carol.mutation(api.loans.cancel, { loanId })).rejects.toThrow(
      /part of/,
    );

    await alice.mutation(api.loans.decide, { loanId, approve: true });
    await expect(
      bob.mutation(api.loans.markReturned, { loanId }),
    ).rejects.toThrow(/Only the lender/);
    await expect(bob.mutation(api.loans.cancel, { loanId })).rejects.toThrow(
      /no longer/,
    );

    await alice.mutation(api.loans.markReturned, { loanId });
    const [loan] = await alice.query(api.loans.incoming, {});
    expect(loan.status).toBe("returned");
  });

  test("a tool on loan leaves the public list until it is returned", async () => {
    const { t, alice, bob, drill } = await setup();
    const loanId = await bob.mutation(api.loans.request, {
      toolId: drill,
      startDate: day(0),
      endDate: day(1),
    });
    await alice.mutation(api.loans.decide, { loanId, approve: true });
    expect(await t.query(api.tools.listPublic, {})).toHaveLength(0);

    // Still out after the due date, because nobody confirmed the return.
    vi.setSystemTime(NOW + 5 * 86_400_000);
    expect(await t.query(api.tools.listPublic, {})).toHaveLength(0);
    const [late] = await alice.query(api.loans.incoming, {});
    expect(late.overdue).toBe(true);

    await alice.mutation(api.loans.markReturned, { loanId });
    expect(await t.query(api.tools.listPublic, {})).toHaveLength(1);
  });

  test("a loan that has not started is cancelled, not returned", async () => {
    const { alice, bob, drill } = await setup();
    const loanId = await bob.mutation(api.loans.request, {
      toolId: drill,
      startDate: day(3),
      endDate: day(5),
    });
    await alice.mutation(api.loans.decide, { loanId, approve: true });

    await expect(
      alice.mutation(api.loans.markReturned, { loanId }),
    ).rejects.toThrow(/not started/);

    // The lender can call it off before the first day.
    await alice.mutation(api.loans.cancel, { loanId });
    const [loan] = await bob.query(api.loans.mine, {});
    expect(loan.status).toBe("cancelled");
  });

  test("a request cannot start more than a year ahead", async () => {
    const { bob, drill } = await setup();
    await expect(
      bob.mutation(api.loans.request, {
        toolId: drill,
        startDate: day(400),
        endDate: day(401),
      }),
    ).rejects.toThrow(/a year/);
  });

  test("members see only loans they are part of", async () => {
    const { alice, bob, carol, drill } = await setup();
    await bob.mutation(api.loans.request, {
      toolId: drill,
      startDate: day(1),
      endDate: day(2),
    });
    expect(await alice.query(api.loans.incoming, {})).toHaveLength(1);
    expect(await alice.query(api.loans.waitingCount, {})).toBe(1);
    expect(await carol.query(api.loans.waitingCount, {})).toBe(0);
    expect(await bob.query(api.loans.mine, {})).toHaveLength(1);
    expect(await carol.query(api.loans.mine, {})).toHaveLength(0);
    expect(await carol.query(api.loans.incoming, {})).toHaveLength(0);
  });
});

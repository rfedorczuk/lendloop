import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { api, internal } from "./_generated/api";
import {
  SIGNATURE_HEADER,
  TIMESTAMP_HEADER,
  signedHeaders,
  verify,
} from "./lib/signature";
import { NOW, SECRET, day, setup } from "./test.setup";

const WEBHOOK = "http://n8n.test/webhook/lendloop/loan-event";

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(NOW);
  vi.stubEnv("ADMIN_EMAILS", "admin@example.com");
  vi.stubEnv("AUTOMATION_SECRET", SECRET);
  vi.stubEnv("N8N_WEBHOOK_URL", WEBHOOK);
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
  vi.useRealTimers();
});

async function lateLoan() {
  const ctx = await setup();
  const loanId = await ctx.bob.mutation(api.loans.request, {
    toolId: ctx.drill,
    startDate: day(0),
    endDate: day(1),
  });
  await ctx.alice.mutation(api.loans.decide, { loanId, approve: true });
  vi.setSystemTime(NOW + 4 * 86_400_000);
  return { ...ctx, loanId };
}

describe("signatures", () => {
  test("a signature verifies only with the same secret, payload and time", async () => {
    const headers = new Headers(await signedHeaders(SECRET, "payload"));
    expect(await verify(SECRET, headers, "payload")).toBe(true);
    expect(await verify(SECRET, headers, "payload ")).toBe(false);
    expect(await verify("other-secret", headers, "payload")).toBe(false);
    expect(await verify(SECRET, headers, "payload", NOW + 6 * 60_000)).toBe(
      false,
    );
  });

  test("missing or malformed headers are rejected", async () => {
    expect(await verify(SECRET, new Headers(), "payload")).toBe(false);
    const headers = new Headers({
      [TIMESTAMP_HEADER]: Math.floor(NOW / 1000).toString(),
      [SIGNATURE_HEADER]: "sha256=not-hex",
    });
    expect(await verify(SECRET, headers, "payload")).toBe(false);
  });
});

describe("Convex to n8n", () => {
  test("a borrow request sends one signed event with only the fields n8n needs", async () => {
    const fetchMock = vi.fn(async () => new Response("ok"));
    vi.stubGlobal("fetch", fetchMock);
    const { t, bob, drill } = await setup();

    const loanId = await bob.mutation(api.loans.request, {
      toolId: drill,
      startDate: day(1),
      endDate: day(3),
    });
    await t.finishAllScheduledFunctions(vi.runAllTimers);

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] as unknown as [
      string,
      RequestInit,
    ];
    expect(url).toBe(WEBHOOK);
    expect(
      await verify(SECRET, new Headers(init.headers), init.body as string),
    ).toBe(true);

    const body = JSON.parse(init.body as string);
    expect(body).toMatchObject({
      kind: "loan.requested",
      loanId,
      toolName: "Cordless drill",
      recipient: { firstName: "Alice", email: "alice@example.com" },
      otherFirstName: "Bob",
    });
    // The borrower's email and both surnames stay in Convex.
    expect(init.body).not.toContain("bob@example.com");
    expect(init.body).not.toContain("Kowal");
    expect(init.body).not.toContain("Nowak");
  });

  test("a failing webhook is retried and then shown to admins", async () => {
    const fetchMock = vi.fn(async () => new Response("down", { status: 503 }));
    vi.stubGlobal("fetch", fetchMock);
    const { t, bob, admin, drill } = await setup();

    await bob.mutation(api.loans.request, {
      toolId: drill,
      startDate: day(1),
      endDate: day(3),
    });
    await t.finishAllScheduledFunctions(vi.runAllTimers);

    expect(fetchMock).toHaveBeenCalledTimes(5);
    const issues = await admin.query(api.admin.automationIssues, {});
    expect(issues).toHaveLength(1);
    expect(issues[0]).toMatchObject({
      source: "Convex to n8n",
      what: "loan.requested",
      detail: "n8n answered 503",
    });
  });
});

describe("activity and housekeeping", () => {
  test("a member sees only the notifications addressed to them", async () => {
    const { t, alice, bob, drill } = await setup();
    const loanId = await bob.mutation(api.loans.request, {
      toolId: drill,
      startDate: day(1),
      endDate: day(2),
    });
    // The request event went to Alice, the lender.
    const [event] = await t.run((ctx) => ctx.db.query("outbox").collect());
    await t.mutation(internal.automation.recordLog, {
      loanId,
      kind: "notification",
      key: `notification:${event._id}`,
      status: "sent",
    });

    const [asLender] = await alice.query(api.loans.incoming, {});
    const [asBorrower] = await bob.query(api.loans.mine, {});
    expect(asLender.activity).toHaveLength(1);
    expect(asBorrower.activity).toHaveLength(0);
  });

  test("the in-app list shows a user's own events and tracks what is new", async () => {
    const { alice, bob, carol, drill } = await setup();
    const loanId = await bob.mutation(api.loans.request, {
      toolId: drill,
      startDate: day(1),
      endDate: day(2),
    });

    const forAlice = await alice.query(api.notifications.list, {});
    expect(forAlice.unread).toBe(1);
    expect(forAlice.items[0]).toMatchObject({
      kind: "loan.requested",
      toolName: "Cordless drill",
      otherName: "Bob",
      href: "/incoming",
      unread: true,
    });
    expect((await bob.query(api.notifications.list, {})).items).toHaveLength(0);
    expect((await carol.query(api.notifications.list, {})).items).toHaveLength(
      0,
    );

    vi.setSystemTime(NOW + 60_000);
    await alice.mutation(api.notifications.markSeen, {});
    expect((await alice.query(api.notifications.list, {})).unread).toBe(0);

    vi.setSystemTime(NOW + 120_000);
    await alice.mutation(api.loans.decide, { loanId, approve: true });
    const forBob = await bob.query(api.notifications.list, {});
    expect(forBob.items[0]).toMatchObject({
      kind: "loan.approved",
      otherName: "Alice",
      href: "/requests",
      unread: true,
    });
  });

  test("requests whose dates have passed are declined", async () => {
    const { t, alice, bob, drill } = await setup();
    await bob.mutation(api.loans.request, {
      toolId: drill,
      startDate: day(1),
      endDate: day(2),
    });

    vi.setSystemTime(NOW + 2 * 86_400_000);
    expect(await t.mutation(internal.maintenance.expireRequests, {})).toBe(0);
    vi.setSystemTime(NOW + 3 * 86_400_000);
    expect(await t.mutation(internal.maintenance.expireRequests, {})).toBe(1);

    const [loan] = await alice.query(api.loans.incoming, {});
    expect(loan.status).toBe("declined");
  });

  test("an event stuck in delivery is marked as failed", async () => {
    const { t, bob, admin, drill } = await setup();
    await bob.mutation(api.loans.request, {
      toolId: drill,
      startDate: day(1),
      endDate: day(2),
    });

    // The delivery action never ran, as if it had crashed.
    expect(await t.mutation(internal.maintenance.failStuckEvents, {})).toBe(0);
    vi.setSystemTime(NOW + 4 * 3_600_000);
    expect(await t.mutation(internal.maintenance.failStuckEvents, {})).toBe(1);

    const [issue] = await admin.query(api.admin.automationIssues, {});
    expect(issue.detail).toBe("Delivery did not complete");
  });
});

describe("n8n to Convex", () => {
  const path = "/automation/overdue-loans";

  test("unsigned and wrongly signed requests get 401", async () => {
    const { t } = await lateLoan();

    expect((await t.fetch(path)).status).toBe(401);
    const wrong = await signedHeaders("wrong-secret", path);
    expect((await t.fetch(path, { headers: wrong })).status).toBe(401);
    // A signature made for another path does not open this one.
    const other = await signedHeaders(SECRET, "/automation/log");
    expect((await t.fetch(path, { headers: other })).status).toBe(401);
  });

  test("overdue loans are listed with the borrower's contact only", async () => {
    const { t, loanId } = await lateLoan();

    const response = await t.fetch(path, {
      headers: await signedHeaders(SECRET, path),
    });
    expect(response.status).toBe(200);
    const { loans } = await response.json();
    expect(loans).toEqual([
      {
        loanId,
        reminderKey: `reminder:${loanId}:${day(4)}`,
        toolName: "Cordless drill",
        dueDate: day(1),
        daysOverdue: 3,
        borrower: { firstName: "Bob", email: "bob@example.com" },
      },
    ]);
  });

  test("reminder write-backs are idempotent", async () => {
    const { t, alice, loanId } = await lateLoan();
    const body = JSON.stringify({
      loanId,
      kind: "reminder",
      key: `reminder:${loanId}:${day(4)}`,
      status: "sent",
    });
    const post = async () =>
      await t.fetch("/automation/log", {
        method: "POST",
        headers: await signedHeaders(SECRET, body),
        body,
      });

    expect(await (await post()).json()).toEqual({ stored: true });
    expect(await (await post()).json()).toEqual({
      stored: false,
      reason: "duplicate",
    });

    const [loan] = await alice.query(api.loans.incoming, {});
    expect(loan.activity).toHaveLength(1);
    expect(loan.activity[0]).toMatchObject({
      kind: "reminder",
      status: "sent",
    });

    // The same day's run no longer lists the loan, the next day's does.
    const today = await t.fetch(path, {
      headers: await signedHeaders(SECRET, path),
    });
    expect((await today.json()).loans).toHaveLength(0);
    vi.setSystemTime(NOW + 5 * 86_400_000);
    const tomorrow = await t.fetch(path, {
      headers: await signedHeaders(SECRET, path),
    });
    expect((await tomorrow.json()).loans).toHaveLength(1);
  });

  test("a failed reminder stays due and can later be marked as sent", async () => {
    const { t, admin, loanId } = await lateLoan();
    const report = async (status: "sent" | "failed") => {
      const body = JSON.stringify({
        loanId,
        kind: "reminder",
        key: `reminder:${loanId}:${day(4)}`,
        status,
        detail: status === "failed" ? "SMTP timeout" : undefined,
      });
      const response = await t.fetch("/automation/log", {
        method: "POST",
        headers: await signedHeaders(SECRET, body),
        body,
      });
      return await response.json();
    };

    expect(await report("failed")).toEqual({ stored: true });
    expect(await admin.query(api.admin.automationIssues, {})).toHaveLength(1);
    const due = await t.fetch(path, {
      headers: await signedHeaders(SECRET, path),
    });
    expect((await due.json()).loans).toHaveLength(1);

    expect(await report("sent")).toEqual({ stored: true });
    expect(await admin.query(api.admin.automationIssues, {})).toHaveLength(0);
  });

  test("a tampered or malformed write-back is rejected", async () => {
    const { t, loanId } = await lateLoan();
    const body = JSON.stringify({
      loanId,
      kind: "reminder",
      key: "k",
      status: "sent",
    });
    const headers = await signedHeaders(SECRET, body);

    const tampered = await t.fetch("/automation/log", {
      method: "POST",
      headers,
      body: body.replace("sent", "failed"),
    });
    expect(tampered.status).toBe(401);

    const bad = JSON.stringify({ loanId, kind: "reminder", status: "done" });
    const malformed = await t.fetch("/automation/log", {
      method: "POST",
      headers: await signedHeaders(SECRET, bad),
      body: bad,
    });
    expect(malformed.status).toBe(400);

    const unknown = JSON.stringify({
      loanId: "not-an-id",
      kind: "reminder",
      key: "k",
      status: "sent",
    });
    const ignored = await t.fetch("/automation/log", {
      method: "POST",
      headers: await signedHeaders(SECRET, unknown),
      body: unknown,
    });
    expect(await ignored.json()).toEqual({
      stored: false,
      reason: "unknown loan",
    });
  });
});

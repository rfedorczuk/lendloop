import { httpRouter } from "convex/server";
import { internal } from "./_generated/api";
import { httpAction } from "./_generated/server";
import { today } from "./lib/dates";
import { verify } from "./lib/signature";

// The two endpoints n8n calls. Both require a valid HMAC signature made with
// AUTOMATION_SECRET; a request without one learns nothing, not even whether
// the secret is configured.

const http = httpRouter();

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "Content-Type": "application/json",
      "Cache-Control": "no-store",
    },
  });
}

async function isAuthentic(request: Request, payload: string) {
  const secret = process.env.AUTOMATION_SECRET;
  if (!secret) return false;
  return await verify(secret, request.headers, payload);
}

http.route({
  path: "/automation/overdue-loans",
  method: "GET",
  handler: httpAction(async (ctx, request) => {
    const url = new URL(request.url);
    if (!(await isAuthentic(request, url.pathname + url.search))) {
      return json({ error: "Invalid signature" }, 401);
    }
    const day = today();
    const loans = await ctx.runQuery(internal.automation.overdueLoans, { day });
    return json({ day, loans });
  }),
});

type LogBody = {
  loanId: string;
  kind: "notification" | "reminder";
  key: string;
  status: "sent" | "failed";
  detail?: string;
};

function parseLogBody(raw: string): LogBody | null {
  let data: unknown;
  try {
    data = JSON.parse(raw);
  } catch {
    return null;
  }
  if (typeof data !== "object" || data === null) return null;
  const body = data as Record<string, unknown>;
  const kinds = ["notification", "reminder"];
  const statuses = ["sent", "failed"];
  if (
    typeof body.loanId !== "string" ||
    typeof body.key !== "string" ||
    body.key.length === 0 ||
    body.key.length > 200 ||
    !kinds.includes(body.kind as string) ||
    !statuses.includes(body.status as string) ||
    (body.detail !== undefined && typeof body.detail !== "string")
  ) {
    return null;
  }
  // Copy the known fields, so anything extra in the request is dropped.
  return {
    loanId: body.loanId,
    kind: body.kind as LogBody["kind"],
    key: body.key,
    status: body.status as LogBody["status"],
    detail: body.detail as string | undefined,
  };
}

http.route({
  path: "/automation/log",
  method: "POST",
  handler: httpAction(async (ctx, request) => {
    const raw = await request.text();
    if (!(await isAuthentic(request, raw))) {
      return json({ error: "Invalid signature" }, 401);
    }
    const body = parseLogBody(raw);
    if (body === null) {
      return json({ error: "Invalid body" }, 400);
    }
    return json(await ctx.runMutation(internal.automation.recordLog, body));
  }),
});

export default http;

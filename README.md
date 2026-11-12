# LendLoop

A neighborhood tool-lending board. Neighbors list tools they are willing to lend, ask to borrow from each other, and get notifications and overdue reminders sent by n8n.

Stack: Next.js 16 (App Router), Clerk, Convex, n8n, TypeScript, Tailwind CSS.

## What is in the app

| Area | What it does |
|---|---|
| Public page | Tagline, a read-only list of available tools (name and category only), and a "Sign in to lend or borrow" button |
| Board | Every listed tool with its availability, filterable by category and searchable by name, in numbered pages. Request to borrow for a date range |
| My listings | Create, edit and remove your own tools |
| My requests | Your borrow requests and loans, searchable by tool name, in numbered pages. Cancel a request, or an approved loan before its first day |
| Incoming | Requests for your tools, searchable and paged the same way: approve, decline, cancel before the first day, mark as returned. The navigation shows how many wait for you |
| Admin | Mark members as trusted lenders, see all loans, see automation failures. Members and loans have search and pages. Admins can also remove any listing from the board |
| Notifications | A bell in the header lists the loan events addressed to you and counts the new ones, updated live |
| Automation | Two n8n workflows (loan notifications by email, daily overdue reminders) and an error workflow |

Each loan shows its recent automation activity, for example "Reminder sent 2 days ago".

## Local setup

You need Node.js 20 or newer, Docker, a Clerk application and a Convex account (or a local Convex deployment, see below).

### 1. Install

```bash
npm install
```

### 2. Clerk

Create an application in the Clerk dashboard and turn on the Convex integration for it (see the [Convex and Clerk guide](https://docs.convex.dev/auth/clerk)). What Convex needs from Clerk is a JWT template named `convex` with the claim `aud: convex`, plus `name`, `email` and `email_verified`. The integration creates it. You can also add the template by hand under JWT templates. The admin role depends on `email_verified`, so keep that claim. Put the keys into `.env.local`:

```bash
NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=pk_test_...
CLERK_SECRET_KEY=sk_test_...
NEXT_PUBLIC_CLERK_SIGN_IN_URL=/sign-in
NEXT_PUBLIC_CLERK_SIGN_UP_URL=/sign-up
```

### 3. Convex

```bash
npx convex dev
```

The first run creates a deployment and writes `NEXT_PUBLIC_CONVEX_URL` to `.env.local`. It then stops and asks for `CLERK_JWT_ISSUER_DOMAIN`. Set the deployment variables:

```bash
npx convex env set CLERK_JWT_ISSUER_DOMAIN https://your-app.clerk.accounts.dev
npx convex env set ADMIN_EMAILS you@example.com
npx convex env set AUTOMATION_SECRET "$(openssl rand -hex 32)"
npx convex env set N8N_WEBHOOK_URL http://localhost:5678/webhook/lendloop/loan-event
```

Leave `npx convex dev` running. It pushes the functions and keeps the generated types current.

Convex has to reach the n8n webhook. With n8n on your machine, that works in two ways:

- Use a local Convex deployment (`npx convex dev --configure --dev-deployment local`, or pick "local" when the CLI asks). Everything then runs on localhost. This is how the integration was tested.
- Keep a cloud deployment and expose n8n through a tunnel or use n8n Cloud, then point `N8N_WEBHOOK_URL` at the public address.

### 4. n8n and the mail catcher

```bash
cp .env.example .env
```

Fill in `AUTOMATION_SECRET` (the same value you gave Convex) and `CONVEX_SITE_URL`:

- cloud deployment: `https://<your-deployment>.convex.site`
- local deployment: `http://host.docker.internal:3211`

```bash
docker compose up -d
```

This starts n8n on http://localhost:5678 and Mailpit on http://localhost:8025. A one-off container imports the three workflows from `n8n/workflows` and publishes them, so there is nothing to click through. Every notification and reminder shows up in Mailpit instead of a real inbox.

To look at the workflows in the n8n editor, open http://localhost:5678 and create the local owner account when it asks.

### 5. Run

```bash
npm run dev
```

Open http://localhost:3000, sign in with two different accounts (one of them listed in `ADMIN_EMAILS`), list a tool with one and request it with the other. The notification appears in Mailpit a moment later.

To try the overdue reminders without waiting for 08:00, open "LendLoop: overdue reminders" in n8n and run it by hand. It has a manual trigger next to the schedule.

### Checks

```bash
npm test           # 37 tests for access rules, loan rules, paging, search, signatures and the automation endpoints
npm run typecheck
npm run lint
npm run build
```

The first three also run on every push in GitHub Actions (`.github/workflows/ci.yml`).

## Environment variables

| Where | Name | Purpose |
|---|---|---|
| `.env.local` (Next.js) | `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY`, `CLERK_SECRET_KEY` | Clerk keys |
| `.env.local` (Next.js) | `NEXT_PUBLIC_CLERK_SIGN_IN_URL`, `NEXT_PUBLIC_CLERK_SIGN_UP_URL` | Routes of the sign-in pages |
| `.env.local` (Next.js) | `NEXT_PUBLIC_CONVEX_URL` | Written by `npx convex dev` |
| Convex deployment | `CLERK_JWT_ISSUER_DOMAIN` | Clerk Frontend API URL, the only token issuer Convex accepts |
| Convex deployment | `ADMIN_EMAILS` | Comma-separated emails that get the admin role |
| Convex deployment | `AUTOMATION_SECRET` | Shared HMAC secret |
| Convex deployment | `N8N_WEBHOOK_URL` | Where loan events are sent |
| `.env` (Docker Compose) | `AUTOMATION_SECRET` | Same shared secret, passed to n8n |
| `.env` (Docker Compose) | `CONVEX_SITE_URL` | Base URL of the Convex HTTP endpoints |
| `.env` (Docker Compose) | `N8N_PORT`, `MAILPIT_PORT`, `TIMEZONE`, `OPS_EMAIL` | Optional |

`.env` and `.env.local` are in `.gitignore`. `.env.example` lists every name without values.

## Architecture

```
src/app            pages: public home, member area in (member)/, sign-in
src/components     UI pieces and the provider that connects Clerk to Convex
src/proxy.ts       Clerk middleware: redirects signed-out visitors
convex/schema.ts   tables: users, tools, loans, outbox, automationLog
convex/lib         auth helpers, date rules, loan rules, paging, HMAC signatures
convex/*.ts        public queries and mutations per area (tools, loans, notifications, admin)
convex/automation.ts   internal functions behind the n8n integration
convex/http.ts     the two signed HTTP endpoints n8n calls
convex/crons.ts    daily and hourly housekeeping (maintenance.ts)
n8n/workflows      exported workflow JSON
```

The browser talks only to Convex. There is no separate API layer in Next.js, so every rule about who may read or change what sits in one place: the Convex functions.

### Interface

Pages hold the list state (page number, search text, filter) and hand data to components in `src/components`. `BoardView`, `ListingsView` and `LoanList` only render props and call mutations. `PagedLoans` and the admin sections fetch their own page, because the same list appears in several places. Search fields and page numbers come from `ListControls.tsx`, and typing is debounced before it reaches a query. Every colour is a token in `src/app/globals.css`, with a light and a dark set that follow the system setting. The UI is built from a few shared parts in `src/components/ui.tsx`: buttons with a pending state, status dots with text labels, bordered lists with hairlines, a segmented filter and a switch. Layouts were checked at 320, 375 and desktop widths.

### Access control

- Every function that reads or changes member data starts with `requireUser` or `requireAdmin` from `convex/lib/auth.ts`. The acting user always comes from the token Convex verified, and the role is read from the `users` table, never from an argument. The exceptions are deliberate: `tools.listPublic` is public, and `users.me`, `loans.waitingCount` and `notifications.list` answer with an empty result for a visitor without an account, because the header renders them before sign-in completes. The only user id a client can pass is the target of `admin.setTrusted`.
- The role is set on the server from `ADMIN_EMAILS`, and only for an email that Clerk has verified.
- Owners can create, edit and delete only their own listings. Admins can remove any listing but cannot edit one. Only the lender can approve, decline or mark a loan as returned. The borrower can withdraw a request, and either side can cancel an approved loan before its first day.
- Members see loans they take part in. `loans.all` and the admin queries reject everyone else.
- `src/proxy.ts` and the hidden Admin link are there for navigation. They are not the security boundary, and the tests call the Convex functions directly to prove that.

### Loans

Dates are calendar days (`YYYY-MM-DD`, UTC, both ends inclusive). A request is rejected if it starts in the past or more than a year ahead, runs longer than 30 days or overlaps an approved loan. An approved loan is cancelled before its first day and returned from then on, so nobody gets a "thanks for returning" message for a tool they never had. A loan that was not returned keeps the tool busy after its end date, so an overdue tool cannot be booked by someone else. Listings are soft-deleted, which keeps loan history readable. Removing a listing declines its open requests and cancels approved loans that have not started. A daily job declines requests nobody answered before their dates passed.

### Pages and search

The board, the loan lists and the admin lists show ten rows per page, with page numbers in blocks of ten (1 to 10, then 11 to 20) and Previous and Next. Convex has no offset queries, so `convex/lib/paging.ts` reads rows up to the end of the current block plus one. That costs at most 101 small rows for the first block, tells the UI which page numbers exist and whether a next block follows, and avoids counting a whole table. A page past the end answers with the last page that exists.

Search uses Convex full-text indexes: tools by name (with the category as a filter field), loans by tool name (filtered to the member's own side), members by name. Loans carry a copy of the tool name for this, which also keeps their title readable after a listing is removed. A rename updates the copies.

Two lists are not paged on purpose. "My listings" is capped at 50 tools per member, and the notification list shows the latest 20 events.

### Automation

Convex to n8n, when a loan is requested, approved, declined, cancelled or returned:

1. The mutation writes a row to `outbox` in the same transaction as the loan change and schedules `automation.deliver`. The in-app notification list reads the same rows, so it works even when n8n or email is down.
2. `deliver` builds the payload, signs it and posts it to the n8n webhook.
3. n8n verifies the signature, answers 202, drops the event if it has already handled its id, sends the message and reports the result back to `POST /automation/log`.

Daily at 08:00, n8n to Convex:

1. n8n calls `GET /automation/overdue-loans` with a signed request.
2. It sends one reminder per loan and writes each result back to `POST /automation/log`.

Signatures work the same way in both directions (`convex/lib/signature.ts` and the Code nodes in the workflows): HMAC-SHA256 over `timestamp.payload` with the shared secret, sent as `X-LendLoop-Timestamp` and `X-LendLoop-Signature`. The payload is the raw body for POST and the path for GET. A request older than five minutes, with a changed body or with a signature made for another path gets a 401.

Idempotency:

- Every write-back carries a key (`notification:<event id>` or `reminder:<loan id>:<day>`). The first report for a key is stored, a repeat changes nothing. The only allowed change is from failed to sent, which happens when a failed execution is retried from n8n.
- `overdue-loans` leaves out loans that already have a sent reminder for the day. Running the workflow twice on the same day sends nothing the second time.
- The notification workflow remembers the ids of recent events in its static data. A webhook that arrives twice (a replay inside the five-minute window, or a Convex retry after a timeout that n8n in fact received) sends one message.

Failures:

- If the webhook call fails, Convex retries after 1, 5, 15 and 60 minutes, then marks the event as failed. An hourly job also fails events that stayed pending for three hours, which covers a delivery action that died before it could record its attempt.
- Each message is sent in a Code node that tries three times with a growing pause, one message at a time, so a retry never repeats a message that already went out. If a message still cannot be sent, the workflow reports `failed` to Convex and then stops with an error, which triggers the error workflow. That workflow emails the operator with the workflow name, the failed node and the execution link. The write-backs to Convex use the HTTP node's own retries, which is safe because they are idempotent.
- Failed deliveries and failed runs are listed on the Admin page.

## Security and data minimization

- The public query returns a tool's id, name and category. Nothing about the owner.
- Members see each other as a first name and an initial ("Alice N."). Emails never reach the browser of another member. The admin list shows names and roles, without emails.
- n8n receives only what one message needs: the recipient's first name and email, the other person's first name, the tool name and the dates. The overdue endpoint returns the borrower's contact and nothing about the lender. A test checks that the other person's email and both surnames are absent from the payload.
- The integration is signed in both directions and the endpoints give the same 401 whether the secret is wrong or not configured.
- Secrets live in environment variables: the Convex deployment, `.env` for Docker and n8n's environment. The workflow JSON reads them through `$env` and contains no secret values. n8n credentials cannot compute an HMAC, so the signing code has to read the secret itself, and that requires `N8N_BLOCK_ENV_ACCESS_IN_NODE=false`. On this single-purpose n8n instance every workflow belongs to LendLoop, so nothing else gains access through it. A shared instance would need a different approach, see the production notes.
- All input is validated in Convex: argument validators, text length limits, date rules, and caps on listings and open requests per user. Control characters and line breaks are stripped from tool names and descriptions, because names end up in email subjects. An account without an email address is rejected at sign-in.
- A member's activity list on a loan shows reminders and the notifications addressed to that member, not the ones sent to the other side.
- The loan functions answer "not yours" the same way for a missing loan and for someone else's loan, so loan ids cannot be probed.
- Errors shown to users are written for them (`ConvexError`). Anything unexpected shows a generic message and stays in the logs.

## What I would change for production

- Use a separate secret per direction and rotate them. On a shared n8n instance, move the signing into a small custom node or an external secret store, so that other workflows cannot read the values through `$env`.
- Send real email through a provider with a verified domain, and add unsubscribe handling and notification preferences.
- Store a community time zone and compute "today" in it. UTC days are fine for a demo and wrong for a neighborhood in another zone around midnight.
- Deep pages get slower, because page N reads N times ten rows. For lists with tens of thousands of rows, switch to the Convex aggregate component for counts and offsets, or to cursor paging with "load more". The public list shows the newest 50 live tools and would need its own paging too.
- Add rate limiting on mutations (the Convex rate limiter component) on top of the current caps.
- Run n8n with Postgres, queue mode and backups instead of the single container with SQLite, and keep execution data for a limited time, because executions contain email addresses.
- Remove user data on account deletion through a Clerk webhook, and write an audit log for admin actions.
- Add end-to-end tests in a browser against a Clerk test instance. The current tests cover the backend rules and the integration endpoints. The signed-in pages were walked through by hand with a real Clerk sign-in against the local stack: listing, request, approval, return, cancellation, the admin page and the notification list.
- Retry a failed notification automatically from Convex after a delay. Today a failed message is visible on the Admin page and in the operator's inbox, and is re-sent by retrying the execution in n8n.
- Deploy with separate Clerk and Convex instances for staging and production, and alert on failed outbox events instead of relying on someone opening the Admin page.

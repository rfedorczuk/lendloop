# LendLoop

A neighborhood tool-lending board. Neighbors list tools they are willing to lend, ask to borrow from each other, and get notifications and overdue reminders sent by n8n.

Stack: Next.js 16 (App Router), Clerk, Convex, n8n, TypeScript, Tailwind CSS.

## What is in the app

| Area | What it does |
|---|---|
| Public page | Tagline, a read-only list of available tools (name and category only), and a "Sign in to lend or borrow" button |
| Board | Every listed tool with its availability, filterable by category. Request to borrow for a date range |
| My listings | Create, edit and remove your own tools |
| My requests | Your borrow requests and loans, with the option to cancel |
| Incoming | Requests for your tools: approve, decline, mark as returned |
| Admin | Mark members as trusted lenders, see all loans, see automation failures. Admins can also remove any listing from the board |
| Automation | Two n8n workflows (loan notifications, daily overdue reminders) and an error workflow |

Each loan shows its recent automation activity, for example "Reminder sent 2 days ago".

## Local setup

You need Node.js 20 or newer, Docker, a Clerk application and a Convex account (or a local Convex deployment, see below).

### 1. Install

```bash
npm install
```

### 2. Clerk

Create an application in the Clerk dashboard and turn on the Convex integration for it (Clerk then issues tokens for the `convex` audience; details in the [Convex and Clerk guide](https://docs.convex.dev/auth/clerk)). Put the keys into `.env.local`:

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
npm test           # 26 tests for access rules, signatures and the automation endpoints
npm run typecheck
npm run lint
npm run build
```

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
convex/lib         auth helpers, date rules, loan rules, HMAC signatures
convex/*.ts        public queries and mutations per area
convex/automation.ts   internal functions behind the n8n integration
convex/http.ts     the two signed HTTP endpoints n8n calls
n8n/workflows      exported workflow JSON
```

The browser talks only to Convex. There is no separate API layer in Next.js, so every rule about who may read or change what sits in one place: the Convex functions.

### Interface

Pages fetch data and hand it to view components in `src/components` (`BoardView`, `ListingsView`, `LoanList`, `AdminView`), which only render props and call mutations. Every colour is a token in `src/app/globals.css`, with a light and a dark set that follow the system setting. The UI is built from a few shared parts in `src/components/ui.tsx`: buttons with a pending state, status dots with text labels, bordered lists with hairlines, a segmented filter and a switch. Layouts were checked at 320, 375 and desktop widths.

### Access control

- Each public function starts with `requireUser` or `requireAdmin` from `convex/lib/auth.ts`. The user is looked up by the token Convex verified, and the role is read from the `users` table. No function takes a user id or a role as an argument.
- The role is set on the server from `ADMIN_EMAILS`, and only for an email that Clerk has verified.
- Owners can create, edit and delete only their own listings. Admins can remove any listing but cannot edit one. Only the lender can approve, decline or mark a loan as returned, and only the borrower can cancel a request.
- Members see loans they take part in. `loans.all` and the admin queries reject everyone else.
- `src/proxy.ts` and the hidden Admin link are there for navigation. They are not the security boundary, and the tests call the Convex functions directly to prove that.

### Loans

Dates are calendar days (`YYYY-MM-DD`, UTC, both ends inclusive). A request is rejected if it starts in the past, runs longer than 30 days or overlaps an approved loan. An approved loan that was not returned keeps the tool busy after its end date, so an overdue tool cannot be booked by someone else. Listings are soft-deleted, which keeps loan history readable. Removing a listing declines its open requests and cancels approved loans that have not started.

### Automation

Convex to n8n, when a loan is requested, approved, declined, cancelled or returned:

1. The mutation writes a row to `outbox` in the same transaction as the loan change and schedules `automation.deliver`.
2. `deliver` builds the payload, signs it and posts it to the n8n webhook.
3. n8n verifies the signature, answers 202, sends the message and reports the result back to `POST /automation/log`.

Daily at 08:00, n8n to Convex:

1. n8n calls `GET /automation/overdue-loans` with a signed request.
2. It sends one reminder per loan and writes each result back to `POST /automation/log`.

Signatures work the same way in both directions (`convex/lib/signature.ts` and the Code nodes in the workflows): HMAC-SHA256 over `timestamp.payload` with the shared secret, sent as `X-LendLoop-Timestamp` and `X-LendLoop-Signature`. The payload is the raw body for POST and the path for GET. A request older than five minutes, with a changed body or with a signature made for another path gets a 401.

Idempotency:

- Every write-back carries a key (`notification:<event id>` or `reminder:<loan id>:<day>`). The first report for a key is stored, a repeat changes nothing. The only allowed change is from failed to sent, so a successful retry clears the failure.
- `overdue-loans` leaves out loans that already have a sent reminder for the day. Running the workflow twice on the same day sends nothing the second time.

Failures:

- If the webhook call fails, Convex retries after 1, 5, 15 and 60 minutes, then marks the event as failed.
- HTTP nodes in n8n retry three times. If a message still cannot be sent, the workflow reports `failed` to Convex and then stops with an error, which triggers the error workflow. That workflow emails the operator with the workflow name, the failed node and the execution link.
- Failed deliveries and failed runs are listed on the Admin page.

## Security and data minimization

- The public query returns a tool's id, name and category. Nothing about the owner.
- Members see each other as a first name and an initial ("Alice N."). Emails never reach the browser of another member. The admin list shows names and roles, without emails.
- n8n receives only what one message needs: the recipient's first name and email, the other person's first name, the tool name and the dates. The overdue endpoint returns the borrower's contact and nothing about the lender. A test checks that the other person's email and both surnames are absent from the payload.
- The integration is signed in both directions and the endpoints give the same 401 whether the secret is wrong or not configured.
- Secrets live in environment variables: the Convex deployment, `.env` for Docker and n8n's environment. The workflow JSON reads them through `$env` and contains no secret values.
- All input is validated in Convex: argument validators, text length limits, date rules, and caps on listings and open requests per user.
- The loan functions answer "not yours" the same way for a missing loan and for someone else's loan, so loan ids cannot be probed.
- Errors shown to users are written for them (`ConvexError`). Anything unexpected shows a generic message and stays in the logs.

## What I would change for production

- Use a separate secret per direction and rotate them. Move the n8n side from `$env` to n8n credentials or an external secret store, so that workflow editors cannot read the values.
- Send real email through a provider with a verified domain, and add unsubscribe handling and notification preferences.
- Store a community time zone and compute "today" in it. UTC days are fine for a demo and wrong for a neighborhood in another zone around midnight.
- Paginate the board and the loan lists, and replace the per-row lookups with indexed queries or denormalized fields once there is real data.
- Add rate limiting on mutations (the Convex rate limiter component) on top of the current caps.
- Run n8n with Postgres, queue mode and backups instead of the single container with SQLite, and keep execution data for a limited time, because executions contain email addresses.
- Remove user data on account deletion through a Clerk webhook, and write an audit log for admin actions.
- Add end-to-end tests in a browser against a Clerk test instance. The current tests cover the backend rules and the integration endpoints. The signed-in pages were checked by type checking, linting and a production build.
- Deploy with separate Clerk and Convex instances for staging and production, and alert on failed outbox events instead of relying on someone opening the Admin page.

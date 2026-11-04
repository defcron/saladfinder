# Daywork API

All routes are under `/api`. Amounts are integer CAD cents. Mutation requests use JSON and the application's exact `Origin`; cross-site mutations are rejected. The local-only development configuration additionally permits loopback origins on ports 5173, 8787 and 8788 for the Vite proxy. Responses containing private data are never cached.

Authentication is a single-use email link. The database stores only SHA-256 hashes of 256-bit random authentication and session tokens. Magic links expire after 15 minutes; sessions expire after seven days. Production uses a host-only `Secure; HttpOnly; SameSite=Lax` cookie. Magic-link tokens travel in a URL fragment and are consumed by a POST, never by GET. Account role is an onboarding preference; all members may both post and work.

## Account and access

| Method | Route                 | Purpose                                                                                 |
| ------ | --------------------- | --------------------------------------------------------------------------------------- |
| GET    | `/health`, `/config`  | Database liveness and public launch configuration                                       |
| POST   | `/auth/request`       | `{email,name?,role,consent:true,turnstileToken}`; verified email link                   |
| POST   | `/auth/verify`        | `{token}`; consumes link and sets session; returns `{user}`                             |
| GET    | `/me`                 | Current `{user}` or `{user:null}`                                                       |
| PATCH  | `/me`                 | `{name,bio,city,skills}`; edits current member only                                     |
| POST   | `/auth/logout`        | Deletes current session                                                                 |
| POST   | `/me/sessions/revoke` | Deletes all current member's sessions                                                   |
| GET    | `/me/export`          | Download current member's account, jobs, own applications/messages, reviews and reports |

Auth requires configured email delivery and Turnstile in production. Only `APP_ENV=local` on loopback addresses can return a development token. Public hosts cannot use that bypass. Turnstile must match both the application hostname and the intended `auth` or `waitlist` action. Administrators are verified email accounts explicitly listed in `ADMIN_EMAILS`.

## Work lifecycle

| Method | Route                                      | Purpose                                                                     |
| ------ | ------------------------------------------ | --------------------------------------------------------------------------- |
| GET    | `/jobs?q=&city=&category=&schedule=&page=` | Open jobs, 20 per page; literal search escaping and total count             |
| GET    | `/jobs/:id`                                | Job and milestones; owner-only applications; participant-only messages      |
| POST   | `/jobs`                                    | Create job and 1–5 milestones atomically                                    |
| POST   | `/jobs/:id/apply`                          | `{message}`; one application per worker, no self-application                |
| POST   | `/jobs/:id/applications/withdraw`          | Withdraw a pending application                                              |
| POST   | `/jobs/:id/hire`                           | `{applicationId}`; poster assigns exactly one applicant atomically          |
| POST   | `/jobs/:id/start`                          | Assigned worker starts work                                                 |
| POST   | `/jobs/:id/cancel`                         | Poster cancels an open, unassigned job                                      |
| POST   | `/jobs/:id/messages`                       | `{body}`; only assigned worker and poster                                   |
| POST   | `/milestones/:id/submit`                   | Worker submits a pending milestone on an active job                         |
| POST   | `/milestones/:id/approve`                  | Poster approves a submitted milestone; payment is still required            |
| POST   | `/jobs/:id/reviews`                        | `{rating,body}`; one review per participant after completion                |
| POST   | `/jobs/:id/report`                         | `{reason}`; records a moderation report                                     |
| GET    | `/dashboard`                               | Current member's posted/assigned jobs and applications, each bounded to 100 |

Job creation body: `{title,description,category,city,area,start_date,estimated_hours,milestones:[{title,amount_cents}]}`. Supported categories are Cleaning, Yard work, Moving help, Assembly and General help. Milestones must be at least CA$25 and total job value cannot exceed CA$5,000. The server calculates the total and payment schedule; client totals are ignored. Dates are validated against the Toronto calendar, from today through the next year.

Hiring uses a transaction and conditional job update, preventing two simultaneous hires. Starting, submitting and approving use conditional state/actor checks in the same database statement. Approval is not a payment. Only validated Stripe webhooks mark payments paid. A job becomes complete only when its milestones are paid.

Non-open jobs are private to the assigned worker and poster. Active verified administrators may also inspect job details, applications and messages for moderation; each nonparticipant administrator read creates an audit event. Suspended accounts cannot use this access. API responses do not expose participant email addresses, sessions, checkout session IDs or payment intent IDs to public visitors. Messages are bounded to the latest 100; this first version is polling-based, not real-time chat.

A participant report immediately marks the job disputed, blocks new payment creation, and requests expiration of known open Checkout Sessions. A report from another authenticated user flags an open listing for moderation without letting outsiders freeze someone else's payments. Already completing Stripe transactions can still settle; payment incidents are recorded for operator reconciliation. This is not an escrow service.

Production marketplace mutations are disabled in `LAUNCH_MODE=preview`. Read-only browsing and early-access signup remain available. Illustrative listings are client-only, explicitly labeled examples and never inserted as real database jobs.

## Early access and moderation

| Method | Route                        | Purpose                                                                     |
| ------ | ---------------------------- | --------------------------------------------------------------------------- |
| POST   | `/waitlist`                  | `{email,city,role,consent:true,turnstileToken}`; record timestamped consent |
| POST   | `/waitlist/remove`           | `{token}`; delete associated early-access record; generic success           |
| GET    | `/admin/overview`            | Administrator-only counts, last 100 reports and member summaries            |
| POST   | `/admin/reports/:id/resolve` | `{resolution,action:'none'                                                  | 'restore_job' | 'cancel_job'}` |
| POST   | `/admin/users/:id/suspend`   | `{suspended:boolean}`; suspension revokes sessions                          |

A new waitlist record returns `removalToken` once. The server stores only its hash. Save the removal link to erase the record without signing in. Repeating a signup never rotates or reveals an existing person's removal token. This means callers can distinguish a new signup by the token response, but no profile, city, role or other subscriber data is returned. Removal is token-authorized and idempotent. No email campaign is sent automatically.

Moderation records and account actions are auditable. Other open reports must be resolved before restoring a disputed job. Jobs with paid or pending Checkout milestones cannot be cancelled by moderation until payments are reconciled or refunded. Suspending an account hides its open jobs from search, blocks mutations and revokes sessions. Support staff must still review existing jobs and payment liabilities.

## Stripe routes

The payment module provides connected-account onboarding/status/dashboard, milestone Checkout creation, standard/eligible instant payout requests, refunds, and signed platform/Connect webhook endpoints. See [launch setup](./LAUNCH.md) and the implementation contract for setup details. Live credentials, webhook secrets, configured launch mode and completed onboarding are required for money movement. Payout requests use client-generated UUID request IDs to prevent duplicate withdrawal on retries.

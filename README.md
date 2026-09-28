# Outbix Email Scheduler

## Phase 1: architecture

`Next.js dashboard -> Express API -> PostgreSQL -> BullMQ/Redis worker -> Ethereal SMTP`

The worker will also index email state transitions in Elasticsearch and send Slack notifications using the integration stored in PostgreSQL. Docker Compose starts PostgreSQL, Redis, Elasticsearch, the API, worker, and frontend. Copy `.env.example` to `.env`, supply credentials, and run `docker compose up --build` after Phase 1 dependencies are installed.

### Data model

- `users`: Google-authenticated identity.
- `senders`: a user's individual Ethereal sender credentials, allowing multiple accounts.
- `scheduled_emails`: one recipient per row, including BullMQ job identifier and state machine (`PENDING`, `PROCESSING`, `SENT`, `FAILED`). A separate sent table is intentionally not used: the immutable `sentAt` timestamp plus state on the canonical record prevents split-brain state.
- `slack_integrations`: per-user Slack OAuth token/webhook and connection metadata.

## Architecture

`Next.js + Google OAuth → Express API → PostgreSQL → BullMQ/Redis → worker → Ethereal SMTP`

The worker writes every state transition to Elasticsearch and reads Slack integrations from PostgreSQL at notification time. Bull Board is available at `/admin/queues` behind HTTP basic auth.

## Delivery reliability

PostgreSQL is authoritative. Every scheduled email has a unique durable ID and the worker uses an atomic `PENDING → PROCESSING` compare-and-set before SMTP delivery, so duplicate jobs and retries cannot send twice. On startup, the worker scans pending/processing records and only re-enqueues records without a waiting, delayed, prioritized, or active BullMQ job.

The limiter is a Redis Lua script which atomically checks and reserves both global and sender-specific fixed hourly windows. A hit requeues to the next hour rather than failing. BullMQ's global worker limiter (`max: 1`, `duration: MIN_DELAY_BETWEEN_EMAILS_MS`) provides minimum spacing across workers; this intentionally prioritizes predictable delivery over maximum throughput.

## Setup

1. Copy `.env.example` to `.env` and fill in Google, Slack, and Ethereal credentials. Create an Ethereal sender record through Prisma/your admin flow.
2. Run `docker compose up --build`, then run `docker compose exec backend npx prisma migrate dev --name init`.
3. Open `http://localhost:3000`; the API is at port 4000 and the queue dashboard is at `http://localhost:4000/admin/queues`.
4. Run `npm run load-test` from `backend` with `LOAD_TEST_SENDER_ID` set to enqueue 1,000 recipients. Worker logs/Bull Board will show them being spread by the configured interval and hourly cap.

## Known limitations

The dashboard currently takes a configured sender ID rather than exposing sender-account provisioning. For an internet-facing deployment, validate the NextAuth JWT on every backend request, encrypt SMTP/Slack tokens at rest using a KMS, add database migrations and integration tests, and add a proper OAuth state/PKCE store instead of using a signed state token.

### Phase 1 notes

Every operational value is parsed through `backend/src/config.ts`; no queue, database, email, OAuth, or rate-limit setting is hardcoded. Phase 2 will use delayed BullMQ jobs and a Redis atomic rate counter—never cron—and will add transactional job claiming plus boot reconciliation.

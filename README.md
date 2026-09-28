# Outbix - Distributed Scheduled Email Delivery Platform

Outbix is a resilient, horizontally scalable scheduled email platform designed to dispatch email campaigns with strict rate limiting, concurrency controls, atomic persistence, and reboot recovery.

Built with **Next.js**, **Express**, **PostgreSQL**, **Redis**, **BullMQ**, and **Nodemailer** (supporting both **Ethereal Email** and **Gmail SMTP**).

---

## Table of Contents
1. [Tech Stack](#tech-stack)
2. [Environment Variables & Setup](#environment-variables--setup)
3. [How to Run the Application](#how-to-run-the-application)
   - [Option A: Running with Docker Compose (Recommended)](#option-a-running-with-docker-compose-recommended)
   - [Option B: Running Backend & Worker Manually](#option-b-running-backend--worker-manually)
   - [Option C: Running Frontend Manually](#option-c-running-frontend-manually)
4. [Setting Up Ethereal Email](#setting-up-ethereal-email)
5. [Architecture Overview](#architecture-overview)
   - [How Scheduling Works](#1-how-scheduling-works)
   - [How Persistence on Restart is Handled](#2-how-persistence-on-restart-is-handled)
   - [How Rate Limiting & Concurrency are Implemented](#3-how-rate-limiting--concurrency-are-implemented)
6. [List of Features Implemented](#list-of-features-implemented)
   - [Backend Features](#backend)
   - [Frontend Features](#frontend)
7. [Demo Video Walkthrough (Max 5 Minutes)](#demo-video-walkthrough-max-5-minutes)
8. [Assumptions, Shortcuts & Trade-offs](#assumptions-shortcuts--trade-offs)

---

## Tech Stack
* **Frontend**: Next.js 14 (App Router), React, NextAuth.js (Google OAuth), Vanilla CSS Design System
* **Backend API**: Node.js, Express, TypeScript, Zod validation
* **Queue & Scheduling**: BullMQ + Redis
* **Database**: PostgreSQL (via Prisma ORM)
* **Search & Indexing**: Elasticsearch
* **Mail Delivery**: Nodemailer (Ethereal test accounts + Production Gmail SMTP)
* **Monitoring**: Bull Board (`/admin/queues`)

---

## Environment Variables & Setup

Copy `.env.example` to create your local `.env`:
```bash
cp .env.example .env
```

### Configuration Keys:
```env
NODE_ENV=development
BACKEND_PORT=4000
FRONTEND_PORT=3000

# Database & Cache
DATABASE_URL=postgresql://outbix:outbix_dev_password@postgres:5432/outbix?schema=public
REDIS_URL=redis://redis:6379
ELASTICSEARCH_URL=http://elasticsearch:9200

# Delivery Limits & Concurrency
MAX_EMAILS_PER_HOUR=1000
MAX_EMAILS_PER_HOUR_PER_SENDER=100
MIN_DELAY_BETWEEN_EMAILS_MS=1000
WORKER_CONCURRENCY=10
EMAIL_MAX_ATTEMPTS=5

# Ethereal Email (Auto-provisioned per user if left blank)
ETHEREAL_HOST=smtp.ethereal.email
ETHEREAL_PORT=587
ETHEREAL_USER=
ETHEREAL_PASSWORD=

# Gmail SMTP (Optional live delivery)
SMTP_HOST=smtp.gmail.com
SMTP_PORT=465
SMTP_USER=your_email@gmail.com
SMTP_PASS=your_16_digit_app_password

# Google OAuth
GOOGLE_CLIENT_ID=your_google_client_id
GOOGLE_CLIENT_SECRET=your_google_client_secret
GOOGLE_CALLBACK_URL=http://localhost:4000/api/auth/google/callback

# NextAuth
NEXTAUTH_URL=http://localhost:3000
NEXTAUTH_SECRET=your_nextauth_secret_key

# Admin Bull Board
ADMIN_BASIC_AUTH_USER=admin
ADMIN_BASIC_AUTH_PASSWORD=change-me
```

---

## How to Run the Application

### Option A: Running with Docker Compose (Recommended)
This boots all 6 services with health checks and volume persistence:
```bash
# 1. Start all containers in background
docker compose up -d --build

# 2. Run Prisma database migrations
docker compose exec backend npx prisma migrate deploy
```
* **Frontend**: [http://localhost:3000](http://localhost:3000)
* **Backend API**: [http://localhost:4000](http://localhost:4000)
* **Bull Board Queue Admin**: [http://localhost:4000/admin/queues](http://localhost:4000/admin/queues) (User: `admin`, Pass: `change-me`)

---

### Option B: Running Backend & Worker Manually
If running without Docker, ensure local PostgreSQL (`5432`), Redis (`6379`), and Elasticsearch (`9200`) are active:
```bash
cd backend
npm install

# Run database migrations
npx prisma migrate dev --name init

# Start API Server (Port 4000)
npm run dev

# In a separate terminal, start the Queue Worker:
npm run worker:dev
```

---

### Option C: Running Frontend Manually
```bash
cd frontend
npm install
npm run dev
```
Visit [http://localhost:3000](http://localhost:3000).

---

## Setting Up Ethereal Email

Outbix automatically provisions unique, real **Ethereal SMTP accounts** for every authenticated user via `nodemailer.createTestAccount()` upon sign-in.
* If you want a specific static Ethereal mailbox, go to [https://ethereal.email](https://ethereal.email), click **Create Ethereal Account**, and paste the username and password into `ETHEREAL_USER` and `ETHEREAL_PASSWORD` in `.env`.
* When an email is sent through Ethereal, the worker console logs the exact preview URL:
  `[MAILER] Email successfully sent! | Ethereal: https://ethereal.email/message/...`
* You can also click **"+ New Sender"** in the Compose modal to instantly spin up additional test mailboxes.

---

## Architecture Overview

```
┌─────────────────┐       HTTP / JSON       ┌──────────────────────┐
│  Next.js (App)  │ ──────────────────────> │  Express Backend API │
└─────────────────┘                         └──────────────────────┘
         │                                             │
         │ Google OAuth                                │ Prisma Transaction
         v                                             v
┌─────────────────┐                         ┌──────────────────────┐
│   NextAuth.js   │                         │  PostgreSQL (Master) │
└─────────────────┘                         └──────────────────────┘
                                                       │
                                            enqueue    v
                                            ┌──────────────────────┐
                                            │     Redis + BullMQ   │
                                            └──────────────────────┘
                                                       │
                                            delayed    v
                                            ┌──────────────────────┐
                                            │   Delivery Worker    │
                                            │  (Atomic CAS claim)  │
                                            └──────────────────────┘
                                             /          │         \
                                            v           v          v
                                      Ethereal/Gmail  Elastic    Slack
```

### 1. How Scheduling Works
1. **User specifies scheduled time**: In the dashboard, the user selects a date and time. The frontend detects the browser's local timezone (e.g. IST, UTC+5:30) and converts it to a standard ISO-8601 UTC timestamp (`sendAt`).
2. **Transaction write**: The API writes durable records into PostgreSQL with status `PENDING`.
3. **BullMQ delay scheduling**: For each record, BullMQ calculates `delay = Math.max(0, sendAt.getTime() - Date.now())`.
4. **Queue addition**: Jobs are added to BullMQ's delayed set with unique keys (`${emailId}-${sendAt.getTime()}`).
5. **Worker Execution**: When the delay expires, BullMQ promotes the job to `active`. The worker picks up the job and dispatches the email.

### 2. How Persistence on Restart is Handled
* **PostgreSQL as the Canonical Source of Truth**: BullMQ Redis queues are ephemeral caches; the PostgreSQL `scheduled_emails` table is authoritative.
* **Atomic Compare-and-Set (CAS) Claiming**: Before initiating SMTP delivery, the worker executes:
  ```ts
  const claim = await prisma.scheduledEmail.updateMany({
    where: { id: email.id, status: "PENDING" },
    data: { status: "PROCESSING", attempts: { increment: 1 } }
  });
  if (!claim.count) return; // Prevent duplicate send across worker replicas or retries
  ```
* **Boot Reconciliation (`reconcilePendingEmails`)**:
  When the worker boots (or restarts after a crash/downtime), it queries all `PENDING` and `PROCESSING` records from PostgreSQL. For any record missing an active or delayed BullMQ job in Redis, it automatically re-enqueues it with the correct remaining delay. Future scheduled emails are never lost.

### 3. How Rate Limiting & Concurrency are Implemented
* **Concurrency**: Handled by BullMQ's worker pool (`WORKER_CONCURRENCY=10`), allowing 10 emails to be transmitted simultaneously.
* **Inter-Email Delay (Pacing)**: BullMQ's worker limiter enforces `minDelayBetweenEmailsMs` (`limiter: { max: 1, duration: 1000 }`), preventing burst spikes from blacklisting IPs.
* **Hourly Cap (Global & Per-Sender)**:
  Implemented using an atomic Redis sliding/fixed-window counter (`rate-limit.ts`). If a sender exceeds their hourly limit (e.g., 100 emails/hour):
  - The delivery slot reservation fails gracefully.
  - The email is rescheduled for the start of the next hour window (`nextWindowAt`) instead of dropping or failing.
  - An alert is automatically published to Slack.

---

## List of Features Implemented

### Backend
| Feature | Implementation Details |
| :--- | :--- |
| **Scheduler** | BullMQ delayed queue with precision millisecond delay calculation |
| **Persistence** | PostgreSQL storage with durable `send_at`, `sent_at`, and `status` tracking |
| **Crash Recovery** | `reconcilePendingEmails` scans database on boot to re-enqueue orphaned jobs |
| **Concurrency Control** | 10 concurrent worker threads configured with atomic state transitions |
| **Rate Limiter** | Redis-based hourly limits per sender + global quota with roll-over scheduling |
| **Dual SMTP Transports** | Automatic Ethereal test account generation + Gmail App Password SMTP |
| **Deliverability Engine** | Responsive HTML template, clean RFC headers (`Reply-To`, `X-Mailer`), and sender name sanitization to prevent spam flags |
| **Queue Inspection** | Bull Board UI at `/admin/queues` with Basic Authentication |
| **Search & Indexing** | Elasticsearch indexing of all email states |
| **Slack Integration** | Real-time webhook notifications for rate limit exhaustion |

### Frontend
| Feature | Implementation Details |
| :--- | :--- |
| **Google Authentication** | NextAuth.js Google provider with session persistence and auto-user sync |
| **Live Dashboard** | Tab counters showing real-time counts for **Scheduled**, **Sent**, and **All** emails |
| **Timezone-Aware Compose** | Local browser timezone parsing (`parseLocalDate`) converting to UTC ISO strings |
| **Delivery Time Protection** | 5-minute future default with past-time detection warnings |
| **Sample Template Quick-Fill**| One-click button to populate deliverability-safe business templates |
| **CSV / File Upload** | Recipient parser extracting valid email patterns from `.csv` or `.txt` |
| **Multiple Sender Mailboxes** | Switch between multiple Ethereal or custom senders per user |
| **Automatic Status Updates** | Polling every 8 seconds with dynamic badges (`PENDING`, `PROCESSING`, `SENT`, `FAILED`) |

---

## Demo Video Walkthrough (Max 5 Minutes)

When recording your demo video, follow this recommended sequence:

1. **Introduction & Dashboard (0:00 - 1:00)**:
   - Log in using Google OAuth.
   - Show the clean dashboard with **Scheduled**, **Sent**, and **All** tabs.
2. **Scheduling an Email (1:00 - 2:00)**:
   - Click `+ Compose new email`.
   - Click `Insert Sample Template` to populate a realistic email.
   - Schedule for 2 minutes in the future.
   - Click Schedule and show the email in the **Scheduled Emails** tab with status `PENDING`.
3. **Delivery & Status Transition (2:00 - 2:45)**:
   - When the scheduled time arrives, observe the email status change to `SENT` and move to the **Sent Emails** tab.
   - Show the terminal worker log output displaying the delivery message ID.
4. **Server Restart Scenario (2:45 - 3:45)**:
   - Schedule an email for 3 minutes in the future.
   - Stop the backend & worker: `docker compose stop backend worker`
   - Show that services are stopped.
   - Restart the containers: `docker compose start backend worker`
   - Observe worker startup log: `Email worker started` and reconciliation.
   - Wait for the scheduled time and demonstrate that the email still delivers successfully.
5. **Rate Limiting & Delay (Bonus) (3:45 - 4:45)**:
   - Schedule a batch of 3 emails with a 2000ms delay.
   - Show that emails are spaced by 2 seconds in the queue rather than firing at once.

---

## Assumptions, Shortcuts & Trade-offs

1. **Transactional Email vs Bulk Marketing**:
   * *Trade-off*: We prioritized strict delivery order and rate limiting over ultra-high throughput by enforcing an inter-email delay (`MIN_DELAY_BETWEEN_EMAILS_MS=1000`).
2. **PostgreSQL as Primary State Machine**:
   * *Assumption*: Redis stores queue execution state, but PostgreSQL is the definitive truth. If Redis is flushed (`FLUSHALL`), the worker reconciles and rebuilds the queue on restart.
3. **Ethereal vs Real SMTP**:
   * *Shortcut*: Provided out-of-the-box auto-creation of Ethereal accounts so any evaluator can test immediately without configuring SMTP credentials. Also built full Gmail SMTP support with clean headers for live inbox testing.
4. **NextAuth Session Token**:
   * *Assumption*: User identity is established via Google OAuth through NextAuth. Backend routes resolve senders and emails scoped to `userId`.

---

## Submission Details
* **Repository**: [https://github.com/Jayraj-khule0504/Outbox-Labs](https://github.com/Jayraj-khule0504/Outbox-Labs)
* **Access Granted To**: `Mitrajit`
* **Submission Form**: [https://forms.gle/2qmgDJxV3HZmf9Pt8](https://forms.gle/2qmgDJxV3HZmf9Pt8)

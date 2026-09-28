import { Worker } from "bullmq";
import { config } from "./config.js";
import { redis, enqueueEmail } from "./queue.js";
import { prisma } from "./db.js";
import { reserveDeliverySlot } from "./rate-limit.js";
import { sendMail } from "./mailer.js";
import { indexEmail } from "./search.js";
import { notifyHourlyLimit } from "./slack.js";
import { reconcilePendingEmails } from "./services/emails.js";

const worker = new Worker("email-delivery", async (job) => {
  const email = await prisma.scheduledEmail.findUnique({ where: { id: job.data.emailId }, include: { sender: true } });
  if (!email || email.status === "SENT" || email.status === "FAILED") return;
  // updateMany is an atomic compare-and-set claim. Only one worker/retry can transition this durable record.
  const claim = await prisma.scheduledEmail.updateMany({ where: { id: email.id, status: "PENDING" }, data: { status: "PROCESSING", attempts: { increment: 1 } } });
  if (!claim.count) return;
  const slot = await reserveDeliverySlot(email.senderId, email.hourlyLimit);
  if (!slot.allowed) {
    const jobId = await enqueueEmail(email.id, slot.nextWindowAt);
    const delayed = await prisma.scheduledEmail.update({ where: { id: email.id }, data: { status: "PENDING", bullmqJobId: jobId } });
    void indexEmail(delayed).catch(() => undefined); void notifyHourlyLimit(email.senderId, email.toEmail);
    return;
  }
  try {
    await sendMail(email.sender, email);
    const sent = await prisma.scheduledEmail.update({ where: { id: email.id }, data: { status: "SENT", sentAt: new Date() } });
    void indexEmail(sent).catch(() => undefined);
  } catch (error) {
    const pending = await prisma.scheduledEmail.update({ where: { id: email.id }, data: { status: "PENDING", failureReason: error instanceof Error ? error.message : "Unknown send error" } });
    void indexEmail(pending).catch(() => undefined); throw error;
  }
}, { connection: redis, concurrency: config.WORKER_CONCURRENCY, limiter: { max: 1, duration: Math.max(1, config.MIN_DELAY_BETWEEN_EMAILS_MS) } });
worker.on("failed", async (job) => { if (job && job.attemptsMade >= config.EMAIL_MAX_ATTEMPTS) { const failed = await prisma.scheduledEmail.update({ where: { id: job.data.emailId }, data: { status: "FAILED" } }); void indexEmail(failed).catch(() => undefined); } });
await reconcilePendingEmails();
console.info(`Email worker started with concurrency ${config.WORKER_CONCURRENCY}`);

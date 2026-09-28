import { ScheduledEmailStatus } from "@prisma/client";
import { prisma } from "../db.js";
import { enqueueEmail } from "../queue.js";
import { indexEmail } from "../search.js";
import { config } from "../config.js";

export async function scheduleBatch(input: { senderId: string; toEmails: string[]; subject: string; body: string; sendAt: Date; delayBetweenEmailsMs?: number; hourlyLimit?: number; }) {
  const sender = await prisma.sender.findUnique({ where: { id: input.senderId } });
  if (!sender) {
    throw new Error(`Sender not found. Please select or create a valid Ethereal sender.`);
  }
  const delay = input.delayBetweenEmailsMs ?? config.MIN_DELAY_BETWEEN_EMAILS_MS;
  const emails = await prisma.$transaction(input.toEmails.map((toEmail, index) => prisma.scheduledEmail.create({ data: {
    senderId: input.senderId, toEmail, subject: input.subject, body: input.body,
    sendAt: new Date(input.sendAt.getTime() + index * delay), status: ScheduledEmailStatus.PENDING, hourlyLimit: input.hourlyLimit
  } })));
  for (const email of emails) {
    const jobId = await enqueueEmail(email.id, email.sendAt);
    const updated = await prisma.scheduledEmail.update({ where: { id: email.id }, data: { bullmqJobId: jobId } });
    void indexEmail(updated).catch(() => undefined);
  }
  return emails;
}

export async function reconcilePendingEmails() {
  const pending = await prisma.scheduledEmail.findMany({ where: { status: { in: ["PENDING", "PROCESSING"] } } });
  const { emailQueue } = await import("../queue.js");
  for (const email of pending) {
    const live = email.bullmqJobId ? await emailQueue.getJob(email.bullmqJobId) : null;
    const state = live ? await live.getState() : null;
    if (!live || !["active", "waiting", "delayed", "prioritized"].includes(state ?? "")) {
      // A durable DB row is the source of truth; the worker's atomic PENDING->PROCESSING claim prevents a duplicate send.
      const jobId = await enqueueEmail(email.id, email.sendAt);
      await prisma.scheduledEmail.update({ where: { id: email.id }, data: { bullmqJobId: jobId, status: "PENDING" } });
    }
  }
}

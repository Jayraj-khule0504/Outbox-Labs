import { Queue } from "bullmq";
import { Redis } from "ioredis";
import { config } from "./config.js";

export const redis = new Redis(config.REDIS_URL, { maxRetriesPerRequest: null });
export const emailQueue = new Queue("email-delivery", {
  connection: redis,
  defaultJobOptions: {
    attempts: config.EMAIL_MAX_ATTEMPTS,
    backoff: { type: "exponential", delay: 5_000 },
    removeOnComplete: true,
    removeOnFail: false
  }
});

export async function enqueueEmail(emailId: string, sendAt: Date): Promise<string> {
  const delay = Math.max(0, sendAt.getTime() - Date.now());
  const job = await emailQueue.add("deliver", { emailId }, {
    // A fresh ID makes rate-limit rescheduling possible while the current job completes.
    jobId: `${emailId}-${sendAt.getTime()}`,
    delay
  });
  return String(job.id);
}

import { Router } from "express";
import { z } from "zod";
import { prisma } from "../db.js";
import { scheduleBatch } from "../services/emails.js";
import { searchEmails } from "../search.js";

export const emailRouter = Router();
const bodySchema = z.object({
  senderId: z.string(),
  toEmails: z.array(z.string().email()).min(1).max(10_000),
  subject: z.string().min(1).max(998),
  body: z.string().min(1),
  sendAt: z.coerce.date(),
  delayBetweenEmailsMs: z.number().int().nonnegative().optional(),
  hourlyLimit: z.number().int().positive().optional()
});

emailRouter.post("/schedule", async (request, response, next) => {
  try {
    console.log("--> SCHEDULE REQUEST RECEIVED:", JSON.stringify(request.body));
    const input = bodySchema.parse(request.body);
    response.status(201).json({ emails: await scheduleBatch(input) });
  } catch (error) {
    console.error("--> SCHEDULE REQUEST ERROR:", error);
    next(error);
  }
});

async function resolveUser(userId?: string) {
  if (!userId) return null;
  return prisma.user.findFirst({
    where: {
      OR: [
        { id: userId },
        { googleSubject: userId }
      ]
    }
  });
}

emailRouter.get("/scheduled", async (request, response, next) => {
  try {
    const userId = typeof request.query.userId === "string" ? request.query.userId : undefined;
    if (userId) {
      const user = await resolveUser(userId);
      if (!user) return response.json([]);
      return response.json(
        await prisma.scheduledEmail.findMany({
          where: {
            status: { in: ["PENDING", "PROCESSING", "FAILED"] },
            sender: { userId: user.id }
          },
          orderBy: { sendAt: "asc" },
          take: 100
        })
      );
    }
    response.json(
      await prisma.scheduledEmail.findMany({
        where: { status: { in: ["PENDING", "PROCESSING", "FAILED"] } },
        orderBy: { sendAt: "asc" },
        take: 100
      })
    );
  } catch (error) {
    next(error);
  }
});

emailRouter.get("/sent", async (request, response, next) => {
  try {
    const userId = typeof request.query.userId === "string" ? request.query.userId : undefined;
    if (userId) {
      const user = await resolveUser(userId);
      if (!user) return response.json([]);
      return response.json(
        await prisma.scheduledEmail.findMany({
          where: {
            status: "SENT",
            sender: { userId: user.id }
          },
          orderBy: { sentAt: "desc" },
          take: 100
        })
      );
    }
    response.json(
      await prisma.scheduledEmail.findMany({
        where: { status: "SENT" },
        orderBy: { sentAt: "desc" },
        take: 100
      })
    );
  } catch (error) {
    next(error);
  }
});

emailRouter.get("/all", async (request, response, next) => {
  try {
    const userId = typeof request.query.userId === "string" ? request.query.userId : undefined;
    if (userId) {
      const user = await resolveUser(userId);
      if (!user) return response.json([]);
      return response.json(
        await prisma.scheduledEmail.findMany({
          where: {
            sender: { userId: user.id }
          },
          orderBy: { createdAt: "desc" },
          take: 100
        })
      );
    }
    response.json(
      await prisma.scheduledEmail.findMany({
        orderBy: { createdAt: "desc" },
        take: 100
      })
    );
  } catch (error) {
    next(error);
  }
});

emailRouter.get("/counts", async (request, response, next) => {
  try {
    const userId = typeof request.query.userId === "string" ? request.query.userId : undefined;
    let whereClause: any = {};
    if (userId) {
      const user = await resolveUser(userId);
      if (!user) return response.json({ scheduled: 0, sent: 0, failed: 0, all: 0 });
      whereClause = { sender: { userId: user.id } };
    }
    const [scheduled, sent, failed, all] = await Promise.all([
      prisma.scheduledEmail.count({ where: { ...whereClause, status: { in: ["PENDING", "PROCESSING"] } } }),
      prisma.scheduledEmail.count({ where: { ...whereClause, status: "SENT" } }),
      prisma.scheduledEmail.count({ where: { ...whereClause, status: "FAILED" } }),
      prisma.scheduledEmail.count({ where: whereClause })
    ]);
    response.json({ scheduled, sent, failed, all });
  } catch (error) {
    next(error);
  }
});

emailRouter.get("/search", async (request, response, next) => {
  try {
    response.json(await searchEmails(String(request.query.q || "")));
  } catch (error) {
    next(error);
  }
});

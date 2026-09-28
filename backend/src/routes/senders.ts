import { Router } from "express";
import nodemailer from "nodemailer";
import { z } from "zod";
import { prisma } from "../db.js";

export const senderRouter = Router();
const createSchema = z.object({ userId: z.string(), displayName: z.string().min(1).max(120).optional() });

// Creates a real Ethereal SMTP account. It is a safe test mailbox and lets each user own multiple senders.
senderRouter.post("/ethereal", async (request, response, next) => {
  try {
    const input = createSchema.parse(request.body);
    const user = await prisma.user.findFirst({
      where: {
        OR: [
          { id: input.userId },
          { googleSubject: input.userId }
        ]
      }
    });
    if (!user) {
      return response.status(404).json({ error: "User not found" });
    }
    const account = await nodemailer.createTestAccount();
    const sender = await prisma.sender.upsert({
      where: {
        userId_email: {
          userId: user.id,
          email: account.user
        }
      },
      update: {
        displayName: input.displayName || user.name || "Ethereal Test Sender",
        etherealUser: account.user,
        etherealPassword: account.pass
      },
      create: {
        userId: user.id,
        email: account.user,
        displayName: input.displayName || user.name || "Ethereal Test Sender",
        etherealUser: account.user,
        etherealPassword: account.pass
      }
    });
    response.status(201).json(sender);
  } catch (error) { next(error); }
});

senderRouter.get("/user/:userId", async (request, response, next) => {
  try {
    const user = await prisma.user.findFirst({
      where: {
        OR: [
          { id: request.params.userId },
          { googleSubject: request.params.userId }
        ]
      }
    });
    if (!user) return response.json([]);
    let senders = await prisma.sender.findMany({ where: { userId: user.id }, orderBy: { createdAt: "desc" } });
    if (senders.length === 0) {
      try {
        const account = await nodemailer.createTestAccount();
        const created = await prisma.sender.upsert({
          where: {
            userId_email: {
              userId: user.id,
              email: account.user
            }
          },
          update: {},
          create: {
            userId: user.id,
            email: account.user,
            displayName: user.name ? `${user.name} (Ethereal)` : "Ethereal Test Sender",
            etherealUser: account.user,
            etherealPassword: account.pass
          }
        });
        senders = [created];
      } catch (err) {
        console.warn("Could not auto-create initial sender for user:", err);
      }
    }
    response.json(senders);
  } catch (error) { next(error); }
});

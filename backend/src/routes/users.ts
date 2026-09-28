import { Router } from "express";
import { z } from "zod";
import nodemailer from "nodemailer";
import { prisma } from "../db.js";

export const userRouter = Router();
const schema = z.object({ id: z.string(), email: z.string().email(), name: z.string().nullable().optional(), imageUrl: z.string().url().nullable().optional() });

// The dashboard calls this after verified Google sign-in; production deployments should validate the NextAuth JWT at this boundary.
userRouter.post("/sync", async (request, response, next) => {
  try {
    const user = schema.parse(request.body);
    const dbUser = await prisma.user.upsert({
      where: { googleSubject: user.id },
      create: { googleSubject: user.id, email: user.email, name: user.name, imageUrl: user.imageUrl },
      update: { email: user.email, name: user.name, imageUrl: user.imageUrl }
    });

    const existingSender = await prisma.sender.findFirst({ where: { userId: dbUser.id } });
    if (!existingSender) {
      try {
        const account = await nodemailer.createTestAccount();
        await prisma.sender.upsert({
          where: {
            userId_email: {
              userId: dbUser.id,
              email: account.user
            }
          },
          update: {},
          create: {
            userId: dbUser.id,
            email: account.user,
            displayName: dbUser.name ? `${dbUser.name} (Ethereal)` : "Ethereal Test Sender",
            etherealUser: account.user,
            etherealPassword: account.pass
          }
        });
      } catch (err) {
        console.warn("Could not auto-provision Ethereal sender during sync:", err);
      }
    }

    response.json(dbUser);
  } catch (error) { next(error); }
});

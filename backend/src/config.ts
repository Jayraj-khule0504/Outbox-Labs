import dotenv from "dotenv";
import path from "node:path";
import { z } from "zod";

dotenv.config();
dotenv.config({ path: path.resolve(process.cwd(), "../.env") });

const environment = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  BACKEND_PORT: z.coerce.number().int().positive().default(4000),
  DATABASE_URL: z.string().url(),
  REDIS_URL: z.string().url(),
  ELASTICSEARCH_URL: z.string().url(),
  MAX_EMAILS_PER_HOUR: z.coerce.number().int().positive(),
  MAX_EMAILS_PER_HOUR_PER_SENDER: z.coerce.number().int().positive(),
  MIN_DELAY_BETWEEN_EMAILS_MS: z.coerce.number().int().nonnegative(),
  WORKER_CONCURRENCY: z.coerce.number().int().positive(),
  EMAIL_MAX_ATTEMPTS: z.coerce.number().int().positive().default(5),
  ETHEREAL_HOST: z.string().min(1).default("smtp.ethereal.email"),
  ETHEREAL_PORT: z.coerce.number().int().positive().default(587),
  ETHEREAL_USER: z.string().optional().default(""),
  ETHEREAL_PASSWORD: z.string().optional().default(""),
  SMTP_HOST: z.string().optional().default("smtp.gmail.com"),
  SMTP_PORT: z.coerce.number().int().positive().optional().default(465),
  SMTP_USER: z.string().optional().default(""),
  SMTP_PASS: z.string().optional().default(""),
  GOOGLE_CLIENT_ID: z.string(),
  GOOGLE_CLIENT_SECRET: z.string(),
  GOOGLE_CALLBACK_URL: z.string().url(),
  SLACK_CLIENT_ID: z.string(),
  SLACK_CLIENT_SECRET: z.string(),
  SLACK_REDIRECT_URI: z.string().url(),
  SLACK_DEFAULT_CHANNEL: z.string(),
  ADMIN_BASIC_AUTH_USER: z.string().min(1),
  ADMIN_BASIC_AUTH_PASSWORD: z.string().min(1)
});

export const config = environment.parse(process.env);
export type Config = typeof config;

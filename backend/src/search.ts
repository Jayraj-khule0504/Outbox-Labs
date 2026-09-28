import { Client } from "@elastic/elasticsearch";
import { ScheduledEmail } from "@prisma/client";
import { config } from "./config.js";

export const elastic = new Client({ node: config.ELASTICSEARCH_URL });
const index = "email-events";

async function ensureIndex() {
  const exists = await elastic.indices.exists({ index });
  if (!exists) {
    await elastic.indices.create({ index, mappings: { properties: {
      subject: { type: "text" }, toEmail: { type: "keyword" }, status: { type: "keyword" },
      senderId: { type: "keyword" }, sendAt: { type: "date" }, sentAt: { type: "date" }, updatedAt: { type: "date" }
    } } });
  }
}

export async function indexEmail(email: ScheduledEmail) {
  await ensureIndex();
  await elastic.index({ index, id: email.id, document: {
    id: email.id, senderId: email.senderId, toEmail: email.toEmail, subject: email.subject,
    status: email.status, sendAt: email.sendAt, sentAt: email.sentAt, updatedAt: email.updatedAt
  }, refresh: false });
}

export async function searchEmails(query: string) {
  await ensureIndex();
  const result = await elastic.search({ index, query: query ? { multi_match: { query, fields: ["subject^2", "toEmail", "status"] } } : { match_all: {} }, size: 100 });
  return result.hits.hits.map((hit) => hit._source);
}

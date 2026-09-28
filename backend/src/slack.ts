import { prisma } from "./db.js";
import { config } from "./config.js";

export async function notifyHourlyLimit(senderId: string, recipient: string) {
  const sender = await prisma.sender.findUnique({ where: { id: senderId }, select: { userId: true } });
  if (!sender) return;
  const integration = await prisma.slackIntegration.findUnique({ where: { userId: sender.userId } });
  if (!integration) return;
  const payload = { channel: integration.defaultChannel || config.SLACK_DEFAULT_CHANNEL, text: `Outbix delayed ${recipient}: this sender reached its hourly email limit.` };
  try {
    if (integration.webhookUrl) await fetch(integration.webhookUrl, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(payload) });
    else await fetch("https://slack.com/api/chat.postMessage", { method: "POST", headers: { authorization: `Bearer ${integration.accessToken}`, "content-type": "application/json" }, body: JSON.stringify(payload) });
  } catch { /* notification failures must never block delivery */ }
}

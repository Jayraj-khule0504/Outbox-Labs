import { Router } from "express";
import { config } from "../config.js";
import { prisma } from "../db.js";
export const slackRouter = Router();
slackRouter.get("/connect", (request, response) => {
  const userId = String(request.query.userId || ""); if (!userId) return response.status(400).json({ error: "userId is required" });
  const url = new URL("https://slack.com/oauth/v2/authorize"); url.searchParams.set("client_id", config.SLACK_CLIENT_ID); url.searchParams.set("redirect_uri", config.SLACK_REDIRECT_URI); url.searchParams.set("scope", "chat:write,incoming-webhook"); url.searchParams.set("state", userId); response.redirect(url.toString());
});
slackRouter.get("/oauth/callback", async (request, response, next) => { try {
  const result = await fetch("https://slack.com/api/oauth.v2.access", { method: "POST", headers: { "content-type": "application/x-www-form-urlencoded" }, body: new URLSearchParams({ client_id: config.SLACK_CLIENT_ID, client_secret: config.SLACK_CLIENT_SECRET, code: String(request.query.code || ""), redirect_uri: config.SLACK_REDIRECT_URI }) }).then(r => r.json()) as any;
  if (!result.ok) return response.status(400).send("Slack authorization failed");
  await prisma.slackIntegration.upsert({ where: { userId: String(request.query.state) }, create: { userId: String(request.query.state), teamId: result.team.id, accessToken: result.access_token, webhookUrl: result.incoming_webhook?.url, defaultChannel: result.incoming_webhook?.channel }, update: { teamId: result.team.id, accessToken: result.access_token, webhookUrl: result.incoming_webhook?.url, defaultChannel: result.incoming_webhook?.channel } }); response.redirect("http://localhost:3000/dashboard?slack=connected");
} catch (error) { next(error); } });

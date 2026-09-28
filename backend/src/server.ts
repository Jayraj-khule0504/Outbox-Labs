import cors from "cors";
import express from "express";
import basicAuth from "express-basic-auth";
import { createBullBoard } from "@bull-board/api";
import { BullMQAdapter } from "@bull-board/api/bullMQAdapter";
import { ExpressAdapter } from "@bull-board/express";
import { config } from "./config.js";
import { emailQueue } from "./queue.js";
import { emailRouter } from "./routes/emails.js";
import { slackRouter } from "./routes/slack.js";
import { userRouter } from "./routes/users.js";
import { senderRouter } from "./routes/senders.js";

const app = express();
app.use(cors({ origin: true, credentials: true }));
app.use(express.json({ limit: "1mb" }));
app.use("/api/emails", emailRouter);
app.use("/api/slack", slackRouter);
app.use("/api/users", userRouter);
app.use("/api/senders", senderRouter);
const board = new ExpressAdapter(); board.setBasePath("/admin/queues");
createBullBoard({ queues: [new BullMQAdapter(emailQueue)], serverAdapter: board });
app.use("/admin/queues", basicAuth({ users: { [config.ADMIN_BASIC_AUTH_USER]: config.ADMIN_BASIC_AUTH_PASSWORD }, challenge: true }), board.getRouter());
app.get("/health", (_request, response) => response.json({ status: "ok" }));
app.use((error: Error, _request: express.Request, response: express.Response, _next: express.NextFunction) => { console.error(error); response.status(400).json({ error: error.message }); });

app.listen(config.BACKEND_PORT, () => {
  console.info(`API listening on :${config.BACKEND_PORT}`);
});

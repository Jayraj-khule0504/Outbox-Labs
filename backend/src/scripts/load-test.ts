/** Run against the API: schedules 1,000 rows; inspect worker logs/Bull Board to see rate-window spreading. */
const recipients = Array.from({ length: 1000 }, (_, i) => `load-test-${i}@example.test`);
const response = await fetch(`${process.env.API_URL || "http://localhost:4000"}/api/emails/schedule`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ senderId: process.env.LOAD_TEST_SENDER_ID, toEmails: recipients, subject: "Rate-limit load test", body: "Test", sendAt: new Date(Date.now() + 60_000).toISOString(), delayBetweenEmailsMs: Number(process.env.MIN_DELAY_BETWEEN_EMAILS_MS || 1000) }) });
console.log(response.status, await response.text());

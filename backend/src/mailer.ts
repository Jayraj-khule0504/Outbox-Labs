import nodemailer from "nodemailer";
import { Sender } from "@prisma/client";
import { config } from "./config.js";

export async function sendMail(sender: Sender, email: { toEmail: string; subject: string; body: string }) {
  let transport: nodemailer.Transporter;
  let fromAddress: string;

  // Sanitize display name so spam filters don't flag "Ethereal" on real Gmail addresses
  let cleanDisplayName = (sender.displayName || "")
    .replace(/\(Ethereal\)/gi, "")
    .replace(/Ethereal Test Sender/gi, "")
    .replace(/Ethereal/gi, "")
    .trim();
  if (!cleanDisplayName) {
    cleanDisplayName = "Jayraj Khule";
  }

  if (config.SMTP_USER && config.SMTP_PASS) {
    transport = nodemailer.createTransport({
      host: "smtp.gmail.com",
      port: 465,
      secure: true,
      auth: {
        user: config.SMTP_USER,
        pass: config.SMTP_PASS.replace(/\s+/g, "") // Ensure clean 16-char app password without stray spaces
      }
    });
    fromAddress = `"${cleanDisplayName}" <${config.SMTP_USER}>`;
  } else {
    transport = nodemailer.createTransport({
      host: config.ETHEREAL_HOST,
      port: config.ETHEREAL_PORT,
      secure: false,
      auth: {
        user: sender.etherealUser || config.ETHEREAL_USER,
        pass: sender.etherealPassword || config.ETHEREAL_PASSWORD
      }
    });
    fromAddress = `"${cleanDisplayName}" <${sender.email}>`;
  }

  const formattedHtml = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
</head>
<body style="margin: 0; padding: 24px; background-color: #f9fafb; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; color: #1f2937; line-height: 1.6;">
  <table width="100%" cellpadding="0" cellspacing="0" style="max-width: 600px; margin: 0 auto; background-color: #ffffff; border: 1px solid #e5e7eb; border-radius: 8px; overflow: hidden;">
    <tr>
      <td style="padding: 28px 32px;">
        <div style="font-size: 15px; color: #1f2937; line-height: 1.6; white-space: pre-wrap;">${email.body.replace(/\n/g, "<br/>")}</div>
      </td>
    </tr>
    <tr>
      <td style="padding: 16px 32px; background-color: #f3f4f6; border-top: 1px solid #e5e7eb; font-size: 12px; color: #6b7280; text-align: center;">
        This email was scheduled and sent securely via <strong>Outbix</strong>.
      </td>
    </tr>
  </table>
</body>
</html>`;

  const info = await transport.sendMail({
    from: fromAddress,
    to: email.toEmail,
    replyTo: config.SMTP_USER || sender.email,
    subject: email.subject,
    text: email.body,
    html: formattedHtml,
    headers: {
      "X-Mailer": "Outbix Mailer 1.0",
      "X-Priority": "3"
    }
  });

  const previewUrl = nodemailer.getTestMessageUrl(info);
  console.log(`[MAILER] Email successfully sent to ${email.toEmail}! MessageId: ${info.messageId} ${previewUrl ? `| Ethereal: ${previewUrl}` : `| Delivered via Gmail SMTP (${config.SMTP_USER})`}`);
  return info;
}

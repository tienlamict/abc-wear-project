import nodemailer, { type Transporter } from "nodemailer";
import { getConfig } from "./config";

export interface EmailMessage {
  to: string;
  subject: string;
  text: string;
  html: string;
}

let transporter: Transporter | undefined;

function getTransporter(): Transporter {
  transporter ??= nodemailer.createTransport(getConfig().SMTP_URL);
  return transporter;
}

/** Sends through SMTP_URL (Mailpit in dev). Throws on failure; callers decide whether that matters. */
export async function sendEmail(message: EmailMessage): Promise<void> {
  await getTransporter().sendMail({ from: getConfig().MAIL_FROM, ...message });
}

/** Escapes text for HTML email bodies. */
export function escapeHtml(text: string): string {
  return text.replace(
    /[&<>"']/g,
    (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!,
  );
}

/** Minimal shared layout so every email looks the same. */
export function emailLayout(title: string, bodyHtml: string): string {
  return `<!doctype html>
<html lang="vi"><body style="margin:0;background:#f3f4f6;font-family:Arial,sans-serif;color:#111827">
<div style="max-width:560px;margin:24px auto;background:#fff;border-radius:8px;padding:24px">
<p style="margin:0 0 16px;font-size:20px;font-weight:bold">ABC Wear</p>
<h1 style="font-size:18px;margin:0 0 16px">${escapeHtml(title)}</h1>
${bodyHtml}
<p style="margin-top:24px;font-size:12px;color:#6b7280">Email này được gửi tự động, vui lòng không trả lời.</p>
</div></body></html>`;
}

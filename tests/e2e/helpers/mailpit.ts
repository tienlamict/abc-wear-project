import { type APIRequestContext, expect } from "@playwright/test";

const MAILPIT_URL = process.env.MAILPIT_URL ?? "http://localhost:8025";

interface MailpitSummary {
  ID: string;
  Subject: string;
  To: { Address: string }[];
}

export interface MailpitMessage {
  ID: string;
  Subject: string;
  Text: string;
  HTML: string;
}

/** Waits for the newest email sent to `to` (optionally matching a subject) and returns it. */
export async function waitForEmail(
  request: APIRequestContext,
  to: string,
  subject?: string,
): Promise<MailpitMessage> {
  let found: MailpitSummary | undefined;
  await expect
    .poll(
      async () => {
        const res = await request.get(`${MAILPIT_URL}/api/v1/search`, {
          params: { query: `to:"${to}"` },
        });
        if (!res.ok()) return false;
        const { messages } = (await res.json()) as { messages: MailpitSummary[] };
        found = messages.find((m) => !subject || m.Subject.includes(subject));
        return Boolean(found);
      },
      { timeout: 15_000, message: `no email to ${to} in Mailpit (${MAILPIT_URL})` },
    )
    .toBe(true);

  const res = await request.get(`${MAILPIT_URL}/api/v1/message/${found!.ID}`);
  expect(res.ok()).toBe(true);
  return (await res.json()) as MailpitMessage;
}

/** First link in the email text that starts with `prefix`. */
export function extractLink(message: MailpitMessage, prefix: string): string {
  const escaped = prefix.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const link = new RegExp(`${escaped}\\S+`).exec(message.Text)?.[0];
  if (!link) throw new Error(`no link starting with ${prefix} in "${message.Subject}"`);
  return link;
}

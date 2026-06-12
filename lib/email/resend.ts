type SendBarndaksaEmailInput = {
  to: string | string[];
  subject: string;
  html?: string;
  text?: string;
  replyTo?: string;
};

type ResendResponse = {
  id?: string;
  error?: unknown;
};

const RESEND_ENDPOINT = "https://api.resend.com/emails";

function getRequiredEmailEnv() {
  const apiKey = process.env.RESEND_API_KEY?.trim();
  const from = process.env.RESEND_FROM_EMAIL?.trim();

  if (!apiKey) {
    throw new Error("RESEND_API_KEY is missing");
  }

  if (!from) {
    throw new Error("RESEND_FROM_EMAIL is missing");
  }

  return { apiKey, from };
}

export function isBarndaksaEmailConfigured() {
  return Boolean(process.env.RESEND_API_KEY?.trim() && process.env.RESEND_FROM_EMAIL?.trim());
}

export async function sendBarndaksaEmail(input: SendBarndaksaEmailInput) {
  const { apiKey, from } = getRequiredEmailEnv();
  const replyTo = input.replyTo?.trim() || process.env.RESEND_REPLY_TO?.trim() || undefined;
  const text = input.text ?? input.html?.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();

  if (!input.html && !text) {
    throw new Error("Email html or text is required");
  }

  const response = await fetch(RESEND_ENDPOINT, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from,
      to: input.to,
      subject: input.subject,
      html: input.html,
      text,
      reply_to: replyTo,
    }),
  });

  const payload = (await response.json().catch(() => ({}))) as ResendResponse;

  if (!response.ok) {
    throw new Error(`Resend failed: ${response.status} ${JSON.stringify(payload)}`);
  }

  return payload;
}

export function escapeEmailHtml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

import { google } from "googleapis";
import { getGoogleClient } from "@/lib/google/calendar";

function encodeEmail(raw: string): string {
  return Buffer.from(raw)
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

export async function sendGmailMessage(
  userId: string,
  to: string[],
  subject: string,
  htmlBody: string
): Promise<void> {
  const { oauth2Client } = await getGoogleClient(userId);
  const gmail = google.gmail({ version: "v1", auth: oauth2Client });

  const dbUser = await import("@/lib/db").then((m) => m.getDb());
  const user = await dbUser.query.users.findFirst({
    where: (users, { eq }) => eq(users.id, userId),
  });

  const from = user?.email ?? "me";
  const message = [
    `From: ${from}`,
    `To: ${to.join(", ")}`,
    `Subject: ${subject}`,
    "MIME-Version: 1.0",
    "Content-Type: text/html; charset=utf-8",
    "",
    htmlBody,
  ].join("\r\n");

  await gmail.users.messages.send({
    userId: "me",
    requestBody: {
      raw: encodeEmail(message),
    },
  });
}

export function markdownToHtml(markdown: string): string {
  return markdown
    .split("\n\n")
    .map((para) => {
      const withLinks = para.replace(
        /\[([^\]]+)\]\(([^)]+)\)/g,
        '<a href="$2">$1</a>'
      );
      const withBold = withLinks.replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>");
      return `<p>${withBold.replace(/\n/g, "<br>")}</p>`;
    })
    .join("\n");
}

export async function sendInviteEmail(
  organizerId: string,
  organizerName: string,
  inviteeEmail: string,
  planTitle: string,
  inviteUrl: string
) {
  const subject = `${organizerName} wants to plan a hangout: ${planTitle}`;
  const html = `
    <p>Hi!</p>
    <p><strong>${organizerName}</strong> wants to plan a hangout — <em>${planTitle}</em>.</p>
    <p>Connect your Google Calendar so we can find times that work for everyone:</p>
    <p><a href="${inviteUrl}">Connect calendar & join plan</a></p>
    <p>We only read free/busy times — not your event details.</p>
  `;

  await sendGmailMessage(organizerId, [inviteeEmail], subject, html);
}

export async function sendProposalEmail(
  organizerId: string,
  recipients: string[],
  subject: string,
  bodyMarkdown: string,
  planId: string,
  appUrl: string
) {
  const respondBase = `${appUrl}/api/plans/${planId}/respond`;
  const bodyWithLinks = bodyMarkdown.replace(
    /\{respond_link_(\d+)\}/g,
    (_, slot: string) =>
      `<a href="${respondBase}?slot=${slot}">I'm in for Option ${slot}</a>`
  );

  const html = markdownToHtml(bodyWithLinks);
  await sendGmailMessage(organizerId, recipients, subject, html);
}

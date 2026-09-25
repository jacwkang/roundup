import { createHash, timingSafeEqual } from "node:crypto";
import { z } from "zod";
import type { Config } from "./config";

// Sendblue sends a shared secret, not an HMAC signature or signed timestamp.
// HTTPS protects transport; durable message_handle deduplication prevents replayed replies.
export function verifyWebhookSecret(headers: Headers, secret: string) {
  const supplied = headers.get("sb-signing-secret");
  if (!supplied || !secret) return false;
  const digest = (value: string) => createHash("sha256").update(value).digest();
  return timingSafeEqual(digest(supplied), digest(secret));
}
const direction = z.object({ is_outbound: z.boolean() });
const message = direction.extend({
  message_handle: z.string().min(1).max(255),
  status: z.string(),
  from_number: z.string().min(1),
  to_number: z.string().nullish(),
  sendblue_number: z.string().nullish(),
  group_id: z.string().nullish(),
  content: z.string().max(10000).nullish(),
  date_sent: z.string().datetime({ offset: true }),
  service: z.string().nullish(),
});
export type Incoming = {
  eventId: string; messageId: string; chatId: string; sender: string;
  text: string; sentAt: string; service: string;
};
export function parseIncoming(payload: unknown, config: Config): Incoming | null {
  if (direction.parse(payload).is_outbound) return null;
  const data = message.parse(payload);
  if (data.status !== "RECEIVED" || data.from_number === config.phoneNumber) return null;
  const receivingLine = data.sendblue_number || data.to_number;
  if (receivingLine !== config.phoneNumber) return null;
  if (!data.group_id || !config.allowedChatIds.includes(data.group_id)) return null;
  const text = data.content?.trim();
  if (!text) return null;
  return { eventId: data.message_handle, messageId: data.message_handle, chatId: data.group_id,
    sender: data.from_number, text, sentAt: data.date_sent, service: data.service ?? "unknown" };
}

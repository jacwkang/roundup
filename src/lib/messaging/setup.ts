import { z } from "zod";
import type { Config } from "./config";
import { apiHeaders, SENDBLUE_API } from "./sendblue";

const webhookResponse = z.object({ status: z.literal("OK"), webhooks: z.object({
  receive: z.array(z.union([z.string(), z.object({ url: z.string(), secret: z.string().optional() })])).optional(),
}) });

export async function registerWebhook(config: Config, origin: string, request: typeof fetch = fetch) {
  const url = new URL(origin);
  if (url.protocol !== "https:" || url.username || url.password || url.pathname !== "/" || url.search || url.hash) {
    throw new Error("Supply a public HTTPS origin without a path, query, or credentials.");
  }
  const target = new URL("/api/webhooks/sendblue", url).toString();
  const endpoint = "https://api.sendblue.com/api/account/webhooks";
  const headers = apiHeaders(config);
  const current = await request(endpoint, { headers, signal: AbortSignal.timeout(15000), redirect: "error" });
  if (!current.ok) throw new Error(`Webhook lookup returned HTTP ${current.status}`);
  const parsed = webhookResponse.safeParse(await current.json());
  if (!parsed.success) throw new Error("Unexpected webhook configuration response");
  const existing = parsed.data.webhooks.receive?.find(w => (typeof w === "string" ? w : w.url) === target);
  if (existing) {
    if (typeof existing === "string" || existing.secret !== config.webhookSecret) {
      throw new Error("This URL already exists with different secret settings. Update it in Developer → Webhooks before testing.");
    }
    return "already configured";
  }
  // Append only this receive webhook. Never replace unrelated account webhooks.
  const response = await request(endpoint, { method: "POST", headers,
    body: JSON.stringify({ type: "receive", webhooks: [{ url: target, secret: config.webhookSecret }] }),
    signal: AbortSignal.timeout(15000), redirect: "error" });
  if (!response.ok) throw new Error(`Webhook registration returned HTTP ${response.status}; inspect the dashboard before retrying.`);
  const result = await response.json() as { status?: string };
  if (result.status !== "OK") throw new Error("Webhook registration was not confirmed; inspect the dashboard.");
  return "registered";
}

export async function recentGroups(config: Pick<Config, "apiKey" | "apiSecret" | "phoneNumber">, request: typeof fetch = fetch) {
  const url = new URL(`${SENDBLUE_API}/api/v2/messages`);
  url.search = new URLSearchParams({ is_outbound: "false", sendblue_number: config.phoneNumber, message_type: "group",
    order_by: "createdAt", order_direction: "desc", limit: "100" }).toString();
  const response = await request(url, { headers: apiHeaders(config), signal: AbortSignal.timeout(15000), redirect: "error" });
  if (!response.ok) throw new Error(`Group lookup returned HTTP ${response.status}`);
  const parsed = z.object({ data: z.array(z.object({ group_id: z.string().nullish(), group_display_name: z.string().nullish(), service: z.string().nullish() })) }).safeParse(await response.json());
  if (!parsed.success) throw new Error("Unexpected message list response");
  const groups = new Map<string, { id: string; name: string; service: string }>();
  for (const item of parsed.data.data) {
    if (item.group_id && !groups.has(item.group_id)) groups.set(item.group_id, { id: item.group_id, name: item.group_display_name ?? "Unnamed group", service: item.service ?? "unknown" });
  }
  return [...groups.values()];
}

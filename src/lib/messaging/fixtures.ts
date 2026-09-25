// Synthetic provider-shaped fixtures shared by offline tests and the smoke script.
import { randomUUID } from "node:crypto";
import { readConfig } from "./config";
export const testConfig = readConfig({ SENDBLUE_API_KEY: "local-test", SENDBLUE_API_SECRET: "local-secret",
  SENDBLUE_WEBHOOK_SECRET: "offline-webhook-secret-0123456789abcdef", SENDBLUE_PHONE_NUMBER: "+12025550100",
  SENDBLUE_ALLOWED_GROUP_IDS: "group_test_123" });
export function inboundFixture(content = "Ara, hi") {
  return { message_handle: randomUUID(), is_outbound: false, status: "RECEIVED", content,
    group_id: "group_test_123", message_type: "group", from_number: "+12025550101", to_number: testConfig.phoneNumber,
    sendblue_number: testConfig.phoneNumber, date_sent: new Date().toISOString(), service: "iMessage" };
}
export function authenticatedRequest(payload: unknown) {
  return new Request("http://localhost/api/webhooks/sendblue", { method: "POST", body: JSON.stringify(payload),
    headers: { "Content-Type": "application/json", "sb-signing-secret": testConfig.webhookSecret } });
}

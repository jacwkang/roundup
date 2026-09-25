import type { Config } from "./config";

export const SENDBLUE_API = "https://api.sendblue.co";
export function apiHeaders(config: Pick<Config, "apiKey" | "apiSecret">) {
  return { "sb-api-key-id": config.apiKey, "sb-api-secret-key": config.apiSecret, "Content-Type": "application/json" };
}
export class SendError extends Error {
  constructor(public code: string, public uncertain: boolean) { super(code); }
}
export async function sendMessage(config: Config, groupId: string, text: string, request: typeof fetch = fetch): Promise<string> {
  let response: Response;
  try {
    response = await request(`${SENDBLUE_API}/api/send-group-message`, {
      method: "POST", headers: apiHeaders(config),
      body: JSON.stringify({ from_number: config.phoneNumber, group_id: groupId, content: text }),
      signal: AbortSignal.timeout(15000),
      redirect: "error",
    });
  } catch { throw new SendError("sendblue_network_or_timeout", true); }
  if (!response.ok) {
    // A timeout/server error may have occurred after the send was accepted.
    throw new SendError(`sendblue_http_${response.status}`, response.status >= 500 || response.status === 408);
  }
  try {
    const data = await response.json() as { message_handle?: string; status?: string; error_code?: number | null };
    if (data.status === "ERROR" || data.status === "DECLINED" || data.error_code) {
      // A provider-reported error may be asynchronous; inspect before another send.
      throw new SendError("sendblue_reported_error", true);
    }
    if (!data.message_handle || !["REGISTERED", "PENDING", "QUEUED", "ACCEPTED", "SENT", "DELIVERED", "SUCCESS"].includes(data.status ?? "")) {
      throw new SendError("sendblue_invalid_response", true);
    }
    return data.message_handle;
  } catch (error) {
    if (error instanceof SendError) throw error;
    throw new SendError("sendblue_invalid_response", true);
  }
}

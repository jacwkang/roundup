import type { Config } from "./config";
import { Store } from "./store";
import { parseIncoming, verifyWebhookSecret } from "./webhook";

export async function ingest(request: Request, config: Config, getStore: () => Store) {
  if (!verifyWebhookSecret(request.headers, config.webhookSecret)) {
    return Response.json({ error: "Invalid webhook secret" }, { status: 401 });
  }
  // Bound memory even for chunked requests without Content-Length.
  const reader = request.body?.getReader();
  if (!reader) return Response.json({ error: "Empty body" }, { status: 400 });
  const chunks: Uint8Array[] = [];
  let size = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > 256 * 1024) {
      await reader.cancel();
      return Response.json({ error: "Payload too large" }, { status: 413 });
    }
    chunks.push(value);
  }
  const body = Buffer.concat(chunks);
  let incoming;
  try { incoming = parseIncoming(JSON.parse(body.toString("utf8")), config); }
  catch { return Response.json({ error: "Invalid Sendblue message payload" }, { status: 400 }); }
  if (!incoming) return Response.json({ status: "ignored" });
  const added = getStore().enqueue(incoming);
  return Response.json({ status: added ? "queued" : "duplicate" });
}

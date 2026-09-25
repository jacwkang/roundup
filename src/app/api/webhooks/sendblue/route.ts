import { readConfig } from "@/lib/messaging/config";
import { ingest } from "@/lib/messaging/ingest";
import { Store } from "@/lib/messaging/store";
export const runtime = "nodejs";
let store: Store | undefined;
export async function POST(request: Request) {
  try {
    const config = readConfig();
    return await ingest(request, config, () => store ??= new Store(config.databasePath));
  } catch {
    console.error("Webhook unavailable: check configuration and database access.");
    return Response.json({ error: "Webhook temporarily unavailable" }, { status: 503 });
  }
}

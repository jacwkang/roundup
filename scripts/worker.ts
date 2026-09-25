import "./env";
import { readConfig } from "../src/lib/messaging/config";
import { Store } from "../src/lib/messaging/store";
import { processOne } from "../src/lib/messaging/processor";

async function main() {
  const config = readConfig();
  const store = new Store(config.databasePath);
  let stopping = false;
  process.on("SIGINT", () => { stopping = true; });
  process.on("SIGTERM", () => { stopping = true; });
  console.log("Ara M1 worker running. Replies only to allowlisted groups; AI/booking disabled.");
  try {
    do {
      const processed = await processOne(store, config);
      if (process.argv.includes("--once")) break;
      if (!processed) await new Promise(resolve => setTimeout(resolve, 1000));
    } while (!stopping);
  } finally { store.close(); }
}
main().catch(() => { console.error("Worker stopped: check configuration and database access."); process.exitCode = 1; });

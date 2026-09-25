import "./env";
import { readConfig } from "../src/lib/messaging/config";
import { Store } from "../src/lib/messaging/store";
import { processOne } from "../src/lib/messaging/processor";
import { readBookingConfig } from "../src/lib/booking/config";
import { Vault } from "../src/lib/booking/vault";
import { BookingStore } from "../src/lib/booking/store";
import { reservationProvider } from "../src/lib/booking/browser/factory";
import { BookingService } from "../src/lib/booking/service";
import { createAgent, openAIInterpreter } from "../src/lib/booking/agent";

async function main() {
  const config = readConfig();
  const store = new Store(config.databasePath);
  const booking = readBookingConfig();
  if (booking && config.allowedChatIds.length !== 1) throw new Error("M2 pilot requires exactly one allowlisted group");
  const vault = booking ? new Vault(store.db, booking.ARA_CREDENTIAL_KEY) : undefined;
  const reply = booking && vault ? createAgent(new BookingService(new BookingStore(store, vault),
    reservationProvider(store, booking, vault), booking),
    openAIInterpreter(booking.OPENAI_API_KEY, booking.OPENAI_MODEL)) : undefined;
  let stopping = false;
  process.on("SIGINT", () => { stopping = true; });
  process.on("SIGTERM", () => { stopping = true; });
  console.log(booking ? `Ara M2 worker running. AI enabled; live bookings ${booking.bookingsEnabled ? "enabled" : "disabled"}.` : "Ara M1 worker running. Replies only to allowlisted groups; AI/booking disabled.");
  try {
    do {
      const processed = await processOne(store, config, undefined, Date.now(), reply);
      if (process.argv.includes("--once")) break;
      if (!processed) await new Promise(resolve => setTimeout(resolve, 1000));
    } while (!stopping);
  } finally { store.close(); }
}
main().catch(() => { console.error("Worker stopped: check configuration and database access."); process.exitCode = 1; });

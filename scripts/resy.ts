import "./env";
import { randomBytes } from "node:crypto";
import { chmodSync, existsSync, readFileSync, writeFileSync } from "node:fs";
import { Store } from "../src/lib/messaging/store";
import { readBookingConfig } from "../src/lib/booking/config";
import { Vault } from "../src/lib/booking/vault";
import { Resy } from "../src/lib/booking/resy";
import { BookingStore } from "../src/lib/booking/store";
import { BookingService } from "../src/lib/booking/service";

async function privateInput(): Promise<string> {
  if (!process.stdin.isTTY) throw new Error("Use an interactive terminal for private credential entry");
  process.stdout.write("Paste your Resy auth token (hidden), then press Enter: ");
  process.stdin.setRawMode(true); process.stdin.resume(); process.stdin.setEncoding("utf8");
  return new Promise((resolve, reject) => {
    let value = "";
    const finish = () => { process.stdin.setRawMode(false); process.stdin.pause(); process.stdin.removeListener("data", onData); process.stdout.write("\n"); };
    const onData = (chunk: string) => {
      for (const char of chunk) {
        if (char === "\u0003") { finish(); reject(new Error("Cancelled")); return; }
        if (char === "\r" || char === "\n") { finish(); resolve(value.trim()); return; }
        if (char === "\u007f" || char === "\b") value = value.slice(0, -1);
        else if (char >= " " && value.length < 16000) value += char;
      }
    };
    process.stdin.on("data", onData);
  });
}
async function main() {
  const command = process.argv[2];
  if (command === "init-key") {
    const existing = existsSync(".env.local") ? readFileSync(".env.local", "utf8") : "";
    if (process.env.ARA_CREDENTIAL_KEY || /^ARA_CREDENTIAL_KEY=.+$/m.test(existing)) throw new Error("Credential key already exists; do not overwrite it");
    const setting = `ARA_CREDENTIAL_KEY=${randomBytes(32).toString("hex")}`;
    writeFileSync(".env.local", /^ARA_CREDENTIAL_KEY=$/m.test(existing) ? existing.replace(/^ARA_CREDENTIAL_KEY=$/m, setting) : `${existing}\n${setting}\n`, { mode: 0o600 });
    chmodSync(".env.local", 0o600); console.log("Saved a new credential encryption key in .env.local. Back it up privately."); return;
  }
  const config = readBookingConfig({ ...process.env, ARA_AI_ENABLED: "true" })!;
  const messages = new Store(process.env.ARA_DATABASE_PATH || "./data/ara-sendblue.db");
  try {
    const vault = new Vault(messages.db, config.ARA_CREDENTIAL_KEY);
    const resy = new Resy(config, () => vault.token(config.ARA_BOOKING_OWNER));
    const bookings = new BookingStore(messages, vault);
    if (command === "connect") {
      const token = await privateInput();
      if (!token || /\s/.test(token)) throw new Error("Invalid token format");
      const check = new Resy(config, () => token);
      await check.profile();
      vault.connect(config.ARA_BOOKING_OWNER, token);
      console.log("Resy account verified and encrypted for the configured owner. No booking was made.");
    } else if (command === "disconnect") {
      vault.disconnect(config.ARA_BOOKING_OWNER); console.log("Stored Resy credentials removed. Revoke the session in Resy as well.");
    } else if (command === "check") {
      await resy.profile(); console.log("Resy account access works. No booking was made.");
    } else if (command === "status") {
      console.log(JSON.stringify(bookings.attempts(config.ARA_BOOKING_OWNER).map(a => ({ id: a.id, state: a.state, reference: a.reference, createdAt: a.created_at })), null, 2));
    } else if (command === "reconcile") {
      const chat = process.env.SENDBLUE_ALLOWED_GROUP_IDS?.split(",").map(s => s.trim()).filter(Boolean);
      if (chat?.length !== 1) throw new Error("Exactly one pilot group is required");
      console.log(await new BookingService(bookings, resy, config).status(chat[0]));
    } else throw new Error("Use resy init-key | connect | check | disconnect | status | reconcile");
  } finally { messages.close(); }
}
main().catch(error => {
  // No raw HTTP, provider responses, tokens, or validation input in logs.
  console.error(error instanceof Error && /^(Invalid M2 configuration:|Use resy |Credential key already exists|Use an interactive terminal|Exactly one pilot group)/.test(error.message)
    ? error.message : "Resy setup/check failed. Check configuration, token validity and provider access; no credentials were printed.");
  process.exitCode = 1;
});

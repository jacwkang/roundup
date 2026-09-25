import "./env";
import { randomBytes } from "node:crypto";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { readConfig } from "../src/lib/messaging/config";
import { recentGroups, registerWebhook } from "../src/lib/messaging/setup";

async function main() {
  const [action, argument] = process.argv.slice(2);
  if (action === "init-secret") {
    if (process.env.SENDBLUE_WEBHOOK_SECRET) throw new Error("A Sendblue webhook secret already exists; it was not changed.");
    const path = ".env.local";
    const content = existsSync(path) ? readFileSync(path, "utf8") : "";
    const line = `SENDBLUE_WEBHOOK_SECRET=${randomBytes(32).toString("hex")}`;
    writeFileSync(path, /^SENDBLUE_WEBHOOK_SECRET=.*$/m.test(content) ? content.replace(/^SENDBLUE_WEBHOOK_SECRET=.*$/m, () => line) : `${content}\n${line}\n`, { mode: 0o600 });
    console.log("Webhook secret saved to .env.local (not printed). Register it using the subscribe command.");
  } else if (action === "groups") {
    const { SENDBLUE_API_KEY: apiKey, SENDBLUE_API_SECRET: apiSecret, SENDBLUE_PHONE_NUMBER: phoneNumber } = process.env;
    if (!apiKey || !apiSecret || !phoneNumber) throw new Error("Set SENDBLUE_API_KEY, SENDBLUE_API_SECRET and SENDBLUE_PHONE_NUMBER first.");
    console.table(await recentGroups({ apiKey, apiSecret, phoneNumber }));
    console.log("Groups from up to 100 recent inbound group messages. If missing, send a new group message and rerun.");
  } else if (action === "subscribe" && argument) {
    console.log(`Receive webhook ${await registerWebhook(readConfig(), argument)}. Restart web and worker processes after changing local configuration.`);
  } else {
    throw new Error("Usage: npm run sendblue -- init-secret | groups | subscribe https://your-public-origin");
  }
}
main().catch(error => {
  console.error(error instanceof Error && error.name === "Error" ? error.message : "Sendblue setup failed. Check configuration/connectivity; inspect webhook state before retrying.");
  process.exitCode = 1;
});

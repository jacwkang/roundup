import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { ingest } from "../src/lib/messaging/ingest";
import { Store } from "../src/lib/messaging/store";
import { processOne } from "../src/lib/messaging/processor";
import { sendMessage } from "../src/lib/messaging/sendblue";
import { testConfig, inboundFixture, authenticatedRequest } from "../src/lib/messaging/fixtures";

async function main() {
  const dir = mkdtempSync(join(tmpdir(), "ara-sendblue-smoke-"));
  const config = { ...testConfig, databasePath: join(dir, "smoke.db") };
  let store = new Store(config.databasePath);
  let outbound = 0;
  const fakeFetch: typeof fetch = async (url, init) => {
    assert.equal(String(url), "https://api.sendblue.co/api/send-group-message");
    const payload = JSON.parse(String(init?.body));
    assert.equal(payload.group_id, config.allowedChatIds[0]);
    assert.equal(payload.from_number, config.phoneNumber);
    assert.match(payload.content, /Ara|here/);
    outbound++;
    return Response.json({ message_handle: randomUUID(), status: "QUEUED" });
  };
  const send: typeof sendMessage = (settings, group, text) => sendMessage(settings, group, text, fakeFetch);
  try {
    for (let i = 0; i < 3; i++) {
      const payload = inboundFixture("Ara, are you there?");
      payload.from_number = `+1202555010${i + 1}`;
      assert.equal((await (await ingest(authenticatedRequest(payload), config, () => store)).json()).status, "queued");
      assert.equal((await (await ingest(authenticatedRequest(payload), config, () => store)).json()).status, "duplicate");
    }
    store.close();
    store = new Store(config.databasePath);
    while (await processOne(store, config, send)) { /* drain */ }
    assert.equal(outbound, 3);
    assert.equal((store.db.prepare("SELECT COUNT(DISTINCT sender) AS n FROM messages").get() as { n: number }).n, 3);
    assert.equal((store.db.prepare("SELECT COUNT(*) AS n FROM messages WHERE state='done'").get() as { n: number }).n, 3);
    console.log("PASS: Sendblue-shaped events from 3 senders → authenticated ingestion → restart → 3 same-group mock replies; duplicates suppressed. No real messages sent.");
  } finally { store.close(); rmSync(dir, { recursive: true, force: true }); }
}
main().catch(error => { console.error(error); process.exitCode = 1; });

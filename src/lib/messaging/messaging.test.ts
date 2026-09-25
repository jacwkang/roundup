import { afterEach, describe, expect, it, vi } from "vitest";
import { randomUUID } from "node:crypto";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import Database from "better-sqlite3";
import { readConfig } from "./config";
import { verifyWebhookSecret, parseIncoming } from "./webhook";
import { ingest } from "./ingest";
import { Store } from "./store";
import { processOne } from "./processor";
import { sendMessage, SendError } from "./sendblue";
import { recentGroups, registerWebhook } from "./setup";
import { testConfig as config, inboundFixture as event, authenticatedRequest as request } from "./fixtures";

const stores: Store[] = [];
const directories: string[] = [];
function store(path = ":memory:") { const s = new Store(path); stores.push(s); return s; }
function file() { const d = mkdtempSync(join(tmpdir(), "ara-test-")); directories.push(d); return join(d, "ara.db"); }
function enqueue(s: Store, text = "Ara, hi") { const input = parseIncoming(event(text), config)!; s.enqueue(input); return input; }
afterEach(() => { for (const s of stores.splice(0)) if (s.db.open) s.close(); for (const d of directories.splice(0)) rmSync(d, { recursive: true, force: true }); vi.restoreAllMocks(); });

describe("Sendblue webhook ingestion", () => {
  it("requires the shared secret, not Linq signature headers", () => {
    expect(verifyWebhookSecret(new Headers({ "sb-signing-secret": config.webhookSecret }), config.webhookSecret)).toBe(true);
    expect(verifyWebhookSecret(new Headers({ "sb-signing-secret": "wrong" }), config.webhookSecret)).toBe(false);
    expect(verifyWebhookSecret(new Headers({ "webhook-signature": config.webhookSecret }), config.webhookSecret)).toBe(false);
    expect(verifyWebhookSecret(new Headers(), config.webhookSecret)).toBe(false);
  });
  it("queues exactly once by message_handle, even with changed callback timestamps", async () => {
    const s = store(); const payload = event();
    expect(await (await ingest(request(payload), config, () => s)).json()).toEqual({ status: "queued" });
    payload.date_sent = new Date(Date.now() + 1000).toISOString();
    expect(await (await ingest(request(payload), config, () => s)).json()).toEqual({ status: "duplicate" });
    expect(s.list()).toHaveLength(1);
  });
  it("fails closed on missing secrets, malformed payloads and excessive bodies", async () => {
    const factory = vi.fn(() => store());
    expect((await ingest(new Request("http://localhost", { method: "POST", body: "{}" }), config, factory)).status).toBe(401);
    expect((await ingest(request({}), config, factory)).status).toBe(400);
    expect((await ingest(request("x".repeat(256*1024)), config, factory)).status).toBe(413);
    expect(factory).not.toHaveBeenCalled();
  });
  it("ignores outbound status callbacks, other groups, DMs, other lines and attachments", () => {
    const cases = [
      (p: ReturnType<typeof event>) => { p.is_outbound = true; },
      (p: ReturnType<typeof event>) => { p.from_number = config.phoneNumber; },
      (p: ReturnType<typeof event>) => { p.group_id = "different-group"; },
      (p: ReturnType<typeof event>) => { p.group_id = ""; },
      (p: ReturnType<typeof event>) => { p.sendblue_number = "+12025550999"; },
      (p: ReturnType<typeof event>) => { p.content = ""; },
      (p: ReturnType<typeof event>) => { p.status = "SENT"; },
    ];
    for (const change of cases) { const payload = event(); change(payload); expect(parseIncoming(payload, config)).toBeNull(); }
    expect(parseIncoming(event(), { ...config, allowedChatIds: [] })).toBeNull();
    expect(parseIncoming({ is_outbound: true }, config)).toBeNull();
  });
  it("accepts opaque group IDs and the documented receiving-line fallback", () => {
    const p = event();
    expect(parseIncoming({ ...p, sendblue_number: null }, config)?.chatId).toBe("group_test_123");
    expect(parseIncoming({ ...p, sendblue_number: null, to_number: null }, config)).toBeNull();
  });
  it("rejects old provider configuration without exposing its values", () => {
    expect(() => readConfig({ LINQ_API_KEY: "secret" })).toThrow("SENDBLUE_API_KEY");
  });
});

describe("durable worker and Sendblue send boundary", () => {
  it("preserves context/senders after restart and introduces itself only once", async () => {
    const path = file(); const first = store(path);
    enqueue(first); const second = parseIncoming(event("Ara, book dinner"), config)!; second.sender = "+12025550102"; first.enqueue(second); first.close();
    const reopened = store(path); const send = vi.fn().mockResolvedValue("provider-handle");
    await processOne(reopened, config, send); await processOne(reopened, config, send);
    expect(send.mock.calls[0][1]).toBe(config.allowedChatIds[0]);
    expect(send.mock.calls[0][2]).toContain("Hi, I'm Ara");
    expect(send.mock.calls[1][2]).not.toContain("Hi, I'm Ara");
    expect(send.mock.calls[1][2]).toContain("can't search or book");
    expect(reopened.db.prepare("SELECT DISTINCT sender FROM messages").all()).toHaveLength(2);
  });
  it("stays quiet for unrelated messages and rechecks group authorization", async () => {
    const s = store(); enqueue(s, "Dinner sounds good"); const send = vi.fn();
    await processOne(s, config, send);
    enqueue(s); await processOne(s, { ...config, allowedChatIds: [] }, send);
    expect(send).not.toHaveBeenCalled(); expect(s.list()).toMatchObject([{ state: "done" }, { state: "done" }]);
  });
  it("recovers a pre-send lease and prevents stale workers from starting a send", () => {
    const s = store(); enqueue(s); const first = s.claim(1000)!;
    expect(s.claim(2000)).toBeUndefined();
    const recovered = s.claim(62000)!;
    expect(recovered.response).toBe(first.response);
    expect(s.beginSend(first, 62000)).toBe(false);
    s.complete(first, "stale"); expect(s.list()).toMatchObject([{ state: "processing" }]);
    expect(s.beginSend(recovered, 62000)).toBe(true);
    s.complete(recovered, "correct"); expect(s.list()).toMatchObject([{ state: "done", provider_message_id: "correct" }]);
  });
  it("holds interrupted sends after restart instead of replaying them", async () => {
    const path = file(); const first = store(path); enqueue(first); enqueue(first);
    const job = first.claim(1000)!; first.beginSend(job, 1000); first.close();
    const reopened = store(path); const send = vi.fn();
    expect(await processOne(reopened, config, send, 62000)).toBe(false);
    expect(reopened.list()).toMatchObject([{ state: "queued" }, { state: "unknown", last_error: "send_interrupted" }]);
    expect(reopened.retry(1)).toBe(0); expect(send).not.toHaveBeenCalled();
    expect(reopened.resolve(1, "sent", "verified-handle")).toBe(1);
    expect(reopened.claim(63000)?.response).not.toContain("Hi, I'm Ara");
  });
  it("does not resend timeouts, including after webhook replay", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    const s = store(); const input = enqueue(s); enqueue(s);
    const send = vi.fn().mockRejectedValue(new SendError("sendblue_network_or_timeout", true));
    await processOne(s, config, send, 1000); expect(s.enqueue(input)).toBe(false);
    expect(await processOne(s, config, send, 100000)).toBe(false);
    expect(s.retry(1)).toBe(0); expect(send).toHaveBeenCalledTimes(1);
    expect(s.resolve(1, "not-sent")).toBe(1);
    await processOne(s, config, vi.fn().mockResolvedValue("new-handle"), 101000);
    expect(s.list()).toMatchObject([{ state: "queued" }, { state: "done" }]);
  });
  it("requires operator retry for known HTTP rejection", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    const s = store(); enqueue(s);
    await processOne(s, config, vi.fn().mockRejectedValue(new SendError("sendblue_http_401", false)));
    expect(s.list()).toMatchObject([{ state: "failed" }]); expect(s.claim()).toBeUndefined();
    expect(s.retry(1)).toBe(1);
  });
  it("serializes claims across connections and allows other groups to progress", () => {
    const path = file(); const a = store(path); const b = store(path);
    enqueue(a); enqueue(a); const different = parseIncoming(event(), config)!; different.chatId = "another-group"; a.enqueue(different);
    const first = a.claim(1000)!; a.beginSend(first, 1000);
    expect(b.claim(1000)?.seq).toBe(3); expect(b.claim(1000)).toBeUndefined();
  });
  it("refuses legacy provider databases", () => {
    const path = file(); const old = new Database(path); old.exec("CREATE TABLE messages (id TEXT)"); old.close();
    expect(() => new Store(path)).toThrow("fresh Sendblue database");
  });
});

describe("Sendblue API adapter and setup", () => {
  it("uses group endpoint, credentials, from_number and group_id without an invented idempotency field", async () => {
    const fetcher = vi.fn().mockResolvedValue(Response.json({ message_handle: "outbound", status: "QUEUED" }));
    expect(await sendMessage(config, "group_123", "hello", fetcher)).toBe("outbound");
    expect(fetcher.mock.calls[0][0]).toBe("https://api.sendblue.co/api/send-group-message");
    expect(fetcher.mock.calls[0][1].headers).toMatchObject({ "sb-api-key-id": config.apiKey, "sb-api-secret-key": config.apiSecret });
    expect(JSON.parse(fetcher.mock.calls[0][1].body)).toEqual({ from_number: config.phoneNumber, group_id: "group_123", content: "hello" });
  });
  it.each([401, 429, 408, 500])("classifies HTTP %s without leaking provider responses", async status => {
    const fetcher = vi.fn().mockResolvedValue(new Response("sensitive provider detail", { status }));
    await expect(sendMessage(config, "group_123", "hello", fetcher)).rejects.toMatchObject({ code: `sendblue_http_${status}`, uncertain: status === 408 || status >= 500 });
  });
  it.each([{}, { message_handle: "id", status: "ERROR" }, { message_handle: "id", status: "DECLINED" }])("holds malformed/error successes for reconciliation", async response => {
    await expect(sendMessage(config, "group_123", "hello", vi.fn().mockResolvedValue(Response.json(response)))).rejects.toMatchObject({ uncertain: true });
  });
  it("holds network errors as uncertain", async () => {
    await expect(sendMessage(config, "group_123", "hello", vi.fn().mockRejectedValue(new Error("timeout")))).rejects.toMatchObject({ uncertain: true });
  });
  it("appends an authenticated receive webhook without replacing other subscriptions", async () => {
    const fetcher = vi.fn().mockResolvedValueOnce(Response.json({ status: "OK", webhooks: { receive: ["https://other.example/webhook"] } })).mockResolvedValueOnce(Response.json({ status: "OK" }));
    expect(await registerWebhook(config, "https://ara.example", fetcher)).toBe("registered");
    expect(fetcher.mock.calls[1][1].method).toBe("POST");
    expect(JSON.parse(fetcher.mock.calls[1][1].body)).toEqual({ type: "receive", webhooks: [{ url: "https://ara.example/api/webhooks/sendblue", secret: config.webhookSecret }] });
  });
  it("does not duplicate or silently change existing webhook secrets", async () => {
    const fetcher = vi.fn().mockResolvedValue(Response.json({ status: "OK", webhooks: { receive: [{ url: "https://ara.example/api/webhooks/sendblue", secret: config.webhookSecret }] } }));
    expect(await registerWebhook(config, "https://ara.example", fetcher)).toBe("already configured"); expect(fetcher).toHaveBeenCalledTimes(1);
    fetcher.mockResolvedValue(Response.json({ status: "OK", webhooks: { receive: ["https://ara.example/api/webhooks/sendblue"] } }));
    await expect(registerWebhook(config, "https://ara.example", fetcher)).rejects.toThrow("different secret");
  });
  it("discovers group IDs without outputting message text", async () => {
    const fetcher = vi.fn().mockResolvedValue(Response.json({ data: [{ group_id: "group_123", content: "private" }, { group_id: "group_123" }, { group_id: "" }] }));
    expect(await recentGroups(config, fetcher)).toEqual([{ id: "group_123", name: "Unnamed group", service: "unknown" }]);
    expect(String(fetcher.mock.calls[0][0])).toContain("sendblue_number=%2B12025550100");
    expect(new URL(fetcher.mock.calls[0][0]).searchParams.get("limit")).toBe("100");
  });
});

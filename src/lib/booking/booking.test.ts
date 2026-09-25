import { afterEach, describe as suite, expect, it, vi } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import { Store, type Job } from "../messaging/store";
import { processOne } from "../messaging/processor";
import { testConfig } from "../messaging/fixtures";
import { readBookingConfig } from "./config";
import { Vault } from "./vault";
import { BookingStore } from "./store";
import { Resy, readTerms } from "./resy";
import { BookingService, authorization } from "./service";
import { createAgent, openAIInterpreter, type Intent } from "./agent";
import type { Details, Slot } from "./types";

const owner = "+12025550101";
const config = readBookingConfig({ ARA_AI_ENABLED: "true", ARA_BOOKINGS_ENABLED: "true", OPENAI_API_KEY: "test-openai",
  ARA_BOOKING_OWNER: owner, ARA_PILOT_CITY: "New York", ARA_TIME_ZONE: "America/New_York", ARA_LATITUDE: "40.7",
  ARA_LONGITUDE: "-74", ARA_CREDENTIAL_KEY: "ab".repeat(32), RESY_API_KEY: "test-resy" })!;
const slot: Slot = { id: "SLOT1", venue: { id: 123, name: "Test Restaurant", locality: "New York", timeZone: "America/New_York" },
  day: "2099-10-10", time: "19:00", party: 4, seating: "Dining Room", configToken: "private-slot-token" };
const details = (): Details => ({ bookToken: "private-book-token", expires: Date.now() + 600000,
  terms: "No upfront payment; cancellation fee 0.", fingerprint: "terms-v1", paymentId: 1 });
const stores: Store[] = [], dirs: string[] = [];
afterEach(() => { stores.splice(0).forEach(s => { if (s.db.open) s.close(); }); dirs.splice(0).forEach(d => rmSync(d, { recursive: true, force: true })); vi.restoreAllMocks(); });
function harness(path = ":memory:") {
  const messages = new Store(path); stores.push(messages);
  const vault = new Vault(messages.db, config.ARA_CREDENTIAL_KEY);
  const store = new BookingStore(messages, vault);
  const provider = { search: vi.fn().mockResolvedValue([slot.venue]), slots: vi.fn().mockResolvedValue([slot]),
    details: vi.fn().mockImplementation(async () => details()), book: vi.fn().mockResolvedValue({ reference: "RES-123" }), reservations: vi.fn().mockResolvedValue([]) };
  const service = new BookingService(store, provider, config);
  return { messages, store, vault, provider, service };
}
function enqueue(messages: Store, body: string, sender = owner, chat = testConfig.allowedChatIds[0]) {
  const id = randomUUID();
  messages.enqueue({ eventId: id, messageId: id, chatId: chat, sender, text: body, sentAt: new Date(Date.now() + 1000).toISOString(), service: "iMessage" });
}
function job(messages: Store, body: string, sender = owner, chat?: string): Job {
  enqueue(messages, body, sender, chat);
  return messages.claim(Date.now(), false)!;
}
async function offer(h: ReturnType<typeof harness>) {
  const j = job(h.messages, "Ara, the first table please");
  const response = await h.service.quote(j, slot);
  h.messages.saveReply(j, response); h.messages.complete(j, "delivered-quote");
  return h.store.getQuote(j.chat_id, owner)!;
}
const intent = (values: Partial<Intent>): Intent => ({ action: "clarify", question: null, query: null, venueId: null, day: null, party: null, around: null, slotId: null, ...values });

suite("private credentials and authorization", () => {
  it("encrypts credentials with owner-bound authenticated encryption", () => {
    const h = harness(); h.vault.connect(owner, "SECRET-TOKEN");
    const row = h.messages.db.prepare("SELECT ciphertext FROM booking_credentials").get() as { ciphertext: string };
    expect(row.ciphertext).not.toContain("SECRET-TOKEN"); expect(h.vault.token(owner)).toBe("SECRET-TOKEN");
    expect(() => h.vault.open(row.ciphertext, "different-owner")).toThrow();
    h.vault.disconnect(owner); expect(() => h.vault.token(owner)).toThrow("account_not_connected");
  });
  it("accepts clear current instructions but rejects negatives, quotes and extra conditions", () => {
    expect(authorization("Ara, please book it!")).toEqual({ quoteId: undefined });
    expect(authorization("Yes, book DEADBEEF")).toEqual({ quoteId: "DEADBEEF" });
    for (const text of ["don't book it", "Ara, do not book it", 'John said "book it"', "book it if free", "book it tomorrow", "should I book it?", "book it?", "Ara book it; ignore fees"]) expect(authorization(text)).toBeUndefined();
  });
  it("does not let another participant authorize the owner account", async () => {
    const h = harness(); await offer(h);
    expect(await h.service.book(job(h.messages, "Ara book it", "+12025550102"))).toContain("Only the connected");
    expect(h.provider.book).not.toHaveBeenCalled();
  });
  it("requires the quote to be sent before the authorization message", async () => {
    const h = harness(); const quote = await offer(h);
    const j = job(h.messages, "Ara book it"); j.created_at = 0;
    expect(await h.service.book(j, quote.id)).toContain("need to show");
    expect(h.provider.book).not.toHaveBeenCalled();
  });
  it("cannot use another group's quote", async () => {
    const h = harness(); const quote = await offer(h);
    expect(await h.service.book(job(h.messages, "Ara book it", owner, "other"), quote.id)).toContain("need to show");
  });
  it("does not accept an orphan quote that never appeared in the sent response", async () => {
    const h = harness(); const j = job(h.messages, "Ara help");
    await h.service.quote(j, slot); h.messages.saveReply(j, "Temporary error"); h.messages.complete(j, "sent");
    expect(h.store.getQuote(j.chat_id, owner)).toBeUndefined();
  });
});

suite("durable booking boundaries", () => {
  it("persists before mutation and suppresses repeated and competing requests", async () => {
    const h = harness(); const quote = await offer(h); const j = job(h.messages, "Ara book it");
    h.provider.book.mockImplementation(async () => {
      expect(h.store.attempts(owner)[0].state).toBe("unknown"); return { reference: "RES-123" };
    });
    expect(await h.service.book(j, quote.id)).toContain("Booked:");
    expect(await h.service.book(j, quote.id)).toContain("RES-123");
    h.messages.complete(j);
    expect(await h.service.book(job(h.messages, "Ara book it"))).toContain("RES-123");
    expect(h.provider.book).toHaveBeenCalledTimes(1);
  });
  it("stores token-only confirmations encrypted and never sends the token to the group", async () => {
    const h = harness(); await offer(h);
    h.provider.book.mockResolvedValue({ reference: null, managementToken: "PRIVATE-RESY-MANAGEMENT" });
    const response = await h.service.book(job(h.messages, "Ara book it"));
    expect(response).toContain("Booked:"); expect(response).toContain("Ara record:");
    expect(response).not.toContain("PRIVATE-RESY");
    const row = h.messages.db.prepare("SELECT id,provider_result FROM booking_attempts").get() as { id: string; provider_result: string };
    expect(row.provider_result).not.toContain("PRIVATE-RESY");
    expect(h.vault.open(row.provider_result, row.id)).toBe("PRIVATE-RESY-MANAGEMENT");
  });
  it("blocks a concurrent second attempt while the first provider request is in flight", async () => {
    const h = harness(); await offer(h); const j = job(h.messages, "Ara book it");
    let release!: (value: { reference: string }) => void;
    h.provider.book.mockImplementation(() => new Promise(resolve => { release = resolve; }));
    const first = h.service.book(j);
    await vi.waitFor(() => expect(h.provider.book).toHaveBeenCalledTimes(1));
    expect(await h.service.book(j)).toContain("may already");
    release({ reference: "RES-123" }); await first;
    expect(h.provider.book).toHaveBeenCalledTimes(1);
  });
  it("holds uncertain outcomes across restart and reconciles only an exact match", async () => {
    const dir = mkdtempSync(join(tmpdir(), "ara-booking-")); dirs.push(dir); const path = join(dir, "ara.db");
    const h = harness(path); await offer(h);
    h.provider.book.mockRejectedValue(new Error("timeout-with-secret-body"));
    const j = job(h.messages, "Ara book it"); expect(await h.service.book(j)).toContain("may have reached"); h.messages.complete(j); h.messages.close();
    const restored = harness(path);
    expect(await restored.service.book(job(restored.messages, "Ara book it"))).toContain("may already");
    expect(restored.provider.book).not.toHaveBeenCalled();
    restored.messages.db.prepare("UPDATE booking_attempts SET created_at=?").run(Date.now() - 180000);
    expect(await restored.service.status(j.chat_id)).toContain("could not uniquely");
    expect(restored.store.attempts(owner)[0].state).toBe("unknown");
    restored.provider.reservations.mockResolvedValue([{ id: "RES-RECOVERED", venueId: 123, day: slot.day, time: "19:00", party: 4 }]);
    expect(await restored.service.status(j.chat_id)).toContain("RES-RECOVERED");
    expect(restored.store.attempts(owner)[0].state).toBe("confirmed");
  });
  it("does not substitute another time or accept changed financial/account terms", async () => {
    const h = harness(); await offer(h); const j = job(h.messages, "Ara book it");
    h.provider.slots.mockResolvedValue([{ ...slot, time: "19:15" }]);
    expect(await h.service.book(j)).toContain("no longer available");
    h.provider.slots.mockResolvedValue([slot]); h.provider.details.mockResolvedValue({ ...details(), fingerprint: "changed" });
    expect(await h.service.book(j)).toContain("terms changed"); expect(h.provider.book).not.toHaveBeenCalled();
  });
  it("rejects an expired quote and disabled booking", async () => {
    const h = harness(); h.provider.details.mockResolvedValue({ ...details(), expires: Date.now() - 1 }); await offer(h);
    const j = job(h.messages, "Ara book it"); expect(await h.service.book(j)).toContain("expired");
    const disabled = new BookingService(h.store, h.provider, { ...config, bookingsEnabled: false });
    expect(await disabled.book(j)).toContain("disabled"); expect(h.provider.book).not.toHaveBeenCalled();
  });
  it("an expired worker lease cannot cross the booking boundary", async () => {
    const h = harness(); await offer(h); const j = job(h.messages, "Ara book it");
    h.messages.db.prepare("UPDATE messages SET lease_until=0 WHERE seq=?").run(j.seq);
    await expect(h.service.book(j)).rejects.toThrow("message_lease_lost"); expect(h.provider.book).not.toHaveBeenCalled();
  });
});

suite("AI orchestration through the messaging queue", () => {
  it("progresses through follow-up search, slots, quote and owner booking", async () => {
    const h = harness(); const send = vi.fn().mockResolvedValue("sendblue-handle");
    const interpret = vi.fn().mockResolvedValueOnce(intent({ action: "search", query: "Italian" }))
      .mockResolvedValueOnce(intent({ action: "slots", venueId: 123, day: slot.day, party: 4, around: "19:00" }))
      .mockResolvedValueOnce(intent({ action: "quote", slotId: slot.id }));
    const reply = createAgent(h.service, interpret);
    for (const text of ["Ara find Italian dinner", "The first one for 4 October 10 2099 at 7", "That table please", "Ara book it"]) {
      enqueue(h.messages, text); await processOne(h.messages, testConfig, send, Date.now(), reply);
    }
    expect(send).toHaveBeenCalledTimes(4); expect(send.mock.calls[3][2]).toContain("Booked:"); expect(h.provider.book).toHaveBeenCalledTimes(1);
    expect(JSON.stringify(interpret.mock.calls)).not.toContain(owner);
    expect(JSON.stringify(interpret.mock.calls)).not.toContain("private-slot-token");
    expect(JSON.stringify(interpret.mock.calls)).not.toContain("private-book-token");
  });
  it("ignores unrelated chat and never runs AI in another group", async () => {
    const h = harness(); const interpret = vi.fn(); const reply = createAgent(h.service, interpret); const send = vi.fn();
    enqueue(h.messages, "Look at this cat"); await processOne(h.messages, testConfig, send, Date.now(), reply);
    enqueue(h.messages, "Ara find dinner", owner, "unapproved"); await processOne(h.messages, testConfig, send, Date.now(), reply);
    expect(interpret).not.toHaveBeenCalled(); expect(send).not.toHaveBeenCalled();
  });
  it("does not trust a model-invented slot or model-supplied booking action", async () => {
    const h = harness(); const j = job(h.messages, "Ara book a table");
    const reply = createAgent(h.service, async () => intent({ action: "quote", slotId: "invented" }));
    expect(await reply(j)).toContain("no longer in our current"); expect(h.provider.book).not.toHaveBeenCalled();
    expect(await createAgent(h.service, async () => ({ action: "book" } as unknown as Intent))(j)).toContain("could not complete");
  });
  it("persists an AI reply so retrying a rejected Sendblue send never repeats AI or booking", async () => {
    const h = harness(); const reply = vi.fn().mockResolvedValue("Which restaurant?");
    const { SendError } = await import("../messaging/sendblue");
    const send = vi.fn().mockRejectedValueOnce(new SendError("send_rejected", false)).mockResolvedValue("sent");
    enqueue(h.messages, "Ara dinner"); await processOne(h.messages, testConfig, send, Date.now(), reply);
    h.messages.retry(1); await processOne(h.messages, testConfig, send, Date.now(), reply);
    expect(reply).toHaveBeenCalledTimes(1); expect(send).toHaveBeenCalledTimes(2);
  });
});

suite("provider contracts and fail-closed handling", () => {
  it("rejects absent or unknown fee terms and prepaid inventory", () => {
    const supported = { payment: { is_paid: false, amount: 0 }, cancellation: { fee: { amount: 0 } } };
    expect(readTerms(supported).terms).toContain("cancellation fee of 0");
    for (const raw of [{}, { ...supported, payment: { is_paid: true, amount: 20 } }, { ...supported, cancellation: {} },
      { ...supported, cancellation: { fee: { amount: 50 } } }, { ...supported, no_show_fee: 50 },
      { ...supported, payment: { is_paid: false, deposit: 100 } }]) expect(() => readTerms(raw)).toThrow("unsupported_terms");
  });
  it("recognizes token-only success while keeping its management token separate from public references", async () => {
    const resy = new Resy(config, () => "secret", vi.fn().mockResolvedValue(Response.json({ resy_token: "private-management-token" })));
    await expect(resy.book(details())).resolves.toEqual({ reference: null, managementToken: "private-management-token" });
  });
  it("marks every failed booking HTTP result uncertain and never retries HTTP", async () => {
    const fetcher = vi.fn().mockResolvedValue(new Response("provider-secret", { status: 503 }));
    const resy = new Resy(config, () => "secret", fetcher);
    await expect(resy.book(details())).rejects.toMatchObject({ code: "resy_http_503", uncertain: true });
    expect(fetcher).toHaveBeenCalledTimes(1);
  });
  it("distinguishes denied search access from an expired login", async () => {
    const denied = new Resy(config, () => "secret", vi.fn().mockResolvedValue(new Response("Forbidden", { status: 403 })));
    await expect(denied.search("Balthazar")).rejects.toMatchObject({ code: "resy_access_denied", uncertain: false });
    const expired = new Resy(config, () => "secret", vi.fn().mockResolvedValue(new Response("Unauthorized", { status: 401 })));
    await expect(expired.search("Balthazar")).rejects.toMatchObject({ code: "resy_auth_expired", uncertain: false });
  });
  it("holds a malformed success body rather than inventing a confirmation", async () => {
    const resy = new Resy(config, () => "secret", vi.fn().mockResolvedValue(Response.json({ message: "okay" })));
    await expect(resy.book(details())).rejects.toMatchObject({ code: "booking_needs_reconciliation", uncertain: true });
  });
  it("does not guess an empty reservation list when the provider changes its schema", async () => {
    const resy = new Resy(config, () => "secret", vi.fn().mockResolvedValue(Response.json({ unfamiliar: [] })));
    await expect(resy.reservations()).rejects.toThrow();
  });
  it("keeps venue-local slot times independent of the system time zone", async () => {
    const fetcher = vi.fn().mockResolvedValue(Response.json({ results: { venues: [{ venue: { id: { resy: 123 } }, slots: [{ config: { token: "secret", type: "Dining Room" }, date: { start: `${slot.day} 19:00:00` } }] }] } }));
    const resy = new Resy(config, () => "secret", fetcher);
    expect((await resy.slots(slot.venue, slot.day, 4))[0].time).toBe("19:00");
  });
  it("uses strict function calls without server-side response storage", async () => {
    const fetcher = vi.fn().mockResolvedValue(Response.json({ output: [{ type: "function_call", name: "plan_step", arguments: JSON.stringify(intent({ question: "Which city?" })) }] }));
    const interpret = openAIInterpreter("secret", "test-model", fetcher);
    expect((await interpret({})).action).toBe("clarify");
    const request = JSON.parse(fetcher.mock.calls[0][1].body);
    expect(request.store).toBe(false); expect(request.tools[0].strict).toBe(true); expect(request.parallel_tool_calls).toBe(false);
    expect(request.tools[0].parameters.additionalProperties).toBe(false);
  });
});

suite('browser fee authorization',()=>{
 it('requires exact quote code and explicit fee acceptance from the owner',async()=>{
  const h=harness();h.provider.details.mockImplementation(async()=>({...details(),source:'browser'}));
  const quote=await offer(h);
  const j=job(h.messages,'Ara book it');
  expect(await h.service.book(j)).toContain('accept the displayed fees');expect(h.provider.book).not.toHaveBeenCalled();
  h.messages.complete(j);
  const authorized=job(h.messages,`Ara, book ${quote.id} and I accept the displayed fees and cancellation terms`);
  expect(authorization(authorized.body)).toEqual({quoteId:quote.id});
  expect(await h.service.book(authorized,quote.id)).toContain('Booked:');
  expect(h.provider.book).toHaveBeenCalledTimes(1);
 });
 it('rejects mismatched codes, conditional acceptance, and changes of transport',async()=>{
  const h=harness();h.provider.details.mockImplementation(async()=>({...details(),source:'browser'}));const quote=await offer(h);
  const j=job(h.messages,'Ara, book DEADBEEF and I accept the displayed fees and cancellation terms');
  expect(await h.service.book(j,quote.id)).toContain('Nothing was booked');expect(h.provider.book).not.toHaveBeenCalled();
  expect(authorization(`Ara book ${quote.id} and I accept the displayed fees and cancellation terms if free`)).toBeUndefined();
 });
 it('keeps uncertain browser attempts held instead of matching synthetic venue IDs to API records',async()=>{
  const h=harness();h.provider.details.mockImplementation(async()=>({...details(),source:'browser'}));const quote=await offer(h);
  const j=job(h.messages,`Ara book ${quote.id} and I accept the displayed fees and cancellation terms`);
  h.provider.book.mockRejectedValue(new Error('lost response'));await h.service.book(j,quote.id);
  h.messages.db.prepare('UPDATE booking_attempts SET created_at=?').run(Date.now()-180000);
  expect(await h.service.status(j.chat_id)).toContain('owner must check Resy');expect(h.provider.reservations).not.toHaveBeenCalled();
 });
});

it('does not issue an actionable quote or create an attempt when payment evidence is missing',async()=>{
 const h=harness();h.provider.details.mockImplementation(async()=>({...details(),source:'browser',requiresPaymentSetup:true}));
 const j=job(h.messages,'Ara quote the first table');
 expect(await h.service.quote(j,slot)).toContain('check payment setup privately');
 expect(h.messages.db.prepare('SELECT count(*) AS n FROM booking_quotes').get()).toEqual({n:0});
 expect(h.store.attempts(owner)).toEqual([]);expect(h.provider.book).not.toHaveBeenCalled();
});

it('records private operator approvals in the shared hold ledger without inventing Sendblue delivery',()=>{
 const h=harness();const quote={id:'CAFE1234',source:'browser' as const,slot,terms:'approved',fingerprint:'f',expires:Date.now()+60000};
 const id=h.store.beginOperator(owner,quote,'Explicit approval in Codex');
 expect(h.store.attempts(owner)[0]).toMatchObject({id,state:'unknown',chat_id:'operator:codex'});
 expect(h.store.getQuote('operator:codex',owner,quote.id)).toBeUndefined();
 expect(()=>h.store.beginOperator(owner,{...quote,id:'CAFE1235'},'same')).toThrow();
 expect(h.messages.db.prepare('SELECT count(*) AS n FROM messages').get()).toEqual({n:0});
});

it('only releases a held attempt with explicit private reconciliation evidence and retains its audit record',()=>{
 const h=harness();const quote={id:'CAFE5678',source:'browser' as const,slot,terms:'approved',fingerprint:'f',expires:Date.now()+60000};
 const id=h.store.beginOperator(owner,quote,'Owner approval');
 expect(()=>h.store.resolveNotBooked(owner,id,'')).toThrow();
 expect(()=>h.store.resolveNotBooked('other',id,'Owner checked app and provider returned no exact reservation')).toThrow();
 h.store.resolveNotBooked(owner,id,'Owner explicitly checked app; subsequent API lookup found no exact reservation.');
 expect(h.store.attempts(owner)).toEqual([]);
 expect(h.messages.db.prepare('SELECT state FROM booking_attempts WHERE id=?').get(id)).toEqual({state:'not_booked'});
 expect(()=>h.store.beginOperator(owner,{...quote,id:'CAFE5679'},'Original exact terms approved')).not.toThrow();
});

it('records proven browser preflight failures as not booked without clearing unknown mutations',async()=>{
 const {BrowserPreflightError}=await import('./browser/checkout');
 const h=harness();h.provider.details.mockImplementation(async()=>({...details(),source:'browser'}));const quote=await offer(h);
 const j=job(h.messages,`Ara book ${quote.id} and I accept the displayed fees and cancellation terms`);
 h.provider.book.mockRejectedValue(new BrowserPreflightError('checkout_not_ready'));
 expect(await h.service.book(j,quote.id)).toContain('Nothing was booked');
 expect(h.store.attempts(owner)).toEqual([]);
 expect(h.messages.db.prepare('SELECT state FROM booking_attempts').get()).toEqual({state:'not_booked'});
});

it('distinguishes a read-only availability handoff from an uncertain booking',async()=>{
 const {friendlyError}=await import('./service');const {BrowserHandoff}=await import('./browser/policy');
 const lookup=friendlyError(new BrowserHandoff('slot_tuple_mismatch','https://resy.com/cities/new-york-ny/venues/test'));
 expect(lookup).toContain('live availability');expect(lookup).toContain('No booking was attempted');expect(lookup).not.toContain('uncertain');
 const reconcile=friendlyError(new BrowserHandoff('reconcile_in_resy'));expect(reconcile).toContain('unresolved booking');expect(reconcile).not.toContain('No booking was attempted');
});

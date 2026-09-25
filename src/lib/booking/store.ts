import type { Store, Job } from "../messaging/store";
import type { Quote, Slot, Venue } from "./types";
import { Vault } from "./vault";
import { BookingError } from "./types";
import { code } from "./resy";

export type Attempt = { id: string; chat_id: string; owner: string; quote_id: string; state: "unknown" | "confirmed";
  reference: string | null; created_at: number; quote: Quote };
export class BookingStore {
  constructor(readonly messages: Store, readonly vault: Vault) {
    messages.db.exec(`
      CREATE TABLE IF NOT EXISTS booking_context (chat_id TEXT PRIMARY KEY, data TEXT NOT NULL, active_until INTEGER NOT NULL);
      CREATE TABLE IF NOT EXISTS booking_quotes (id TEXT PRIMARY KEY, chat_id TEXT NOT NULL, owner TEXT NOT NULL,
        message_seq INTEGER NOT NULL, ciphertext TEXT NOT NULL, expires INTEGER NOT NULL);
      CREATE TABLE IF NOT EXISTS booking_attempts (id TEXT PRIMARY KEY, chat_id TEXT NOT NULL, owner TEXT NOT NULL,
        quote_id TEXT NOT NULL UNIQUE, message_seq INTEGER NOT NULL UNIQUE, state TEXT NOT NULL,
        reference TEXT, created_at INTEGER NOT NULL);
    `);
    const columns = messages.db.prepare("PRAGMA table_info(booking_attempts)").all() as { name: string }[];
    if (!columns.some(c => c.name === "provider_result")) messages.db.exec("ALTER TABLE booking_attempts ADD COLUMN provider_result TEXT");
  }
  context(chat: string): { venues: Venue[]; slots: Slot[]; activeUntil: number } {
    const row = this.messages.db.prepare("SELECT data,active_until FROM booking_context WHERE chat_id=?").get(chat) as { data: string; active_until: number } | undefined;
    return row ? { ...JSON.parse(this.vault.open(row.data, chat)), activeUntil: row.active_until } : { venues: [], slots: [], activeUntil: 0 };
  }
  saveContext(chat: string, data: { venues: Venue[]; slots: Slot[] }, active = true) {
    this.messages.db.prepare("INSERT OR REPLACE INTO booking_context VALUES (?,?,?)")
      .run(chat, this.vault.seal(JSON.stringify(data), chat), active ? Date.now() + 30 * 60000 : 0);
  }
  quote(job: Job, owner: string, slot: Slot, terms: string, fingerprint: string, expires: number, source?: "api" | "browser"): Quote {
    const quote: Quote = { source, id: code(), slot, terms, fingerprint, expires: Math.min(expires, Date.now() + 5 * 60000) };
    this.messages.db.prepare("INSERT INTO booking_quotes VALUES (?,?,?,?,?,?)")
      .run(quote.id, job.chat_id, owner, job.seq, this.vault.seal(JSON.stringify(quote), quote.id), quote.expires);
    return quote;
  }
  getQuote(chat: string, owner: string, quoteId?: string, authorization?: Job): Quote | undefined {
    const row = this.messages.db.prepare(`SELECT q.id,q.ciphertext FROM booking_quotes q JOIN messages m ON m.seq=q.message_seq
      WHERE q.chat_id=? AND q.owner=? AND m.state='done' AND m.provider_message_id IS NOT NULL
      AND instr(m.response,q.id)>0 AND m.completed_at IS NOT NULL AND m.completed_at<=?
      AND (? IS NULL OR q.id=?) ORDER BY q.message_seq DESC, q.rowid DESC LIMIT 1`)
      .get(chat, owner, authorization ? Math.min(authorization.created_at, Date.parse(authorization.sent_at)) : Date.now(), quoteId ?? null, quoteId ?? null) as { id: string; ciphertext: string } | undefined;
    return row ? JSON.parse(this.vault.open(row.ciphertext, row.id)) : undefined;
  }
  attempts(owner: string): Attempt[] {
    const rows = this.messages.db.prepare(`SELECT a.*,q.ciphertext FROM booking_attempts a JOIN booking_quotes q ON q.id=a.quote_id
      WHERE a.owner=? AND a.state IN ('unknown','confirmed') ORDER BY a.created_at DESC`).all(owner) as (Omit<Attempt, "quote"> & { ciphertext: string })[];
    return rows.map(({ ciphertext, ...row }) => ({ ...row, quote: JSON.parse(this.vault.open(ciphertext, row.quote_id)) }));
  }
  begin(job: Job, owner: string, quote: Quote): string {
    return this.messages.db.transaction(() => {
      const current = this.messages.db.prepare("SELECT 1 FROM messages WHERE seq=? AND lease_token=? AND state='processing' AND lease_until>?")
        .get(job.seq, job.lease_token, Date.now());
      if (!current) throw new BookingError("message_lease_lost");
      if (this.attempts(owner).some(a => a.state === "unknown")) throw new BookingError("unresolved_booking");
      if (this.attempts(owner).some(a => a.quote.slot.day === quote.slot.day)) throw new BookingError("existing_booking_for_day");
      const attemptId = code();
      // Unknown from the moment mutation is possible: crashes can never turn this back into an automatic retry.
      this.messages.db.prepare("INSERT INTO booking_attempts (id,chat_id,owner,quote_id,message_seq,state,reference,created_at) VALUES (?,?,?,?,?,'unknown',NULL,?)")
        .run(attemptId, job.chat_id, owner, quote.id, job.seq, Date.now());
      return attemptId;
    }).immediate();
  }
  /** Private operator approval is separate from Sendblue delivery; never fabricate a message. */
  beginOperator(owner: string, quote: Quote, approval: string): string {
    return this.messages.db.transaction(() => {
      if (quote.expires <= Date.now()) throw new BookingError("approval_expired");
      if (this.attempts(owner).some(a => a.state === "unknown" || a.quote.slot.day === quote.slot.day)) throw new BookingError("existing_or_unresolved_booking");
      this.messages.db.exec("CREATE TABLE IF NOT EXISTS booking_operator_approvals (quote_id TEXT PRIMARY KEY, ciphertext TEXT NOT NULL)");
      const row=this.messages.db.prepare("SELECT min(message_seq) AS n FROM booking_attempts").get() as {n:number|null};
      const seq=Math.min(0,row.n ?? 0)-1;
      this.messages.db.prepare("INSERT INTO booking_quotes VALUES (?,?,?,?,?,?)").run(quote.id,"operator:codex",owner,seq,this.vault.seal(JSON.stringify(quote),quote.id),quote.expires);
      this.messages.db.prepare("INSERT INTO booking_operator_approvals VALUES (?,?)").run(quote.id,this.vault.seal(approval,quote.id));
      const id=code();
      this.messages.db.prepare("INSERT INTO booking_attempts (id,chat_id,owner,quote_id,message_seq,state,reference,created_at) VALUES (?,?,?,?,?,'unknown',NULL,?)")
        .run(id,"operator:codex",owner,quote.id,seq,Date.now());
      return id;
    }).immediate();
  }
  resolveNotBooked(owner: string, attempt: string, evidence: string) {
    if(evidence.trim().length<30)throw new BookingError("reconciliation_evidence_required");
    this.messages.db.transaction(()=>{
      const held=this.messages.db.prepare("SELECT 1 FROM booking_attempts WHERE id=? AND owner=? AND state='unknown'").get(attempt,owner);
      if(!held)throw new BookingError("unresolved_attempt_not_found");
      this.messages.db.exec("CREATE TABLE IF NOT EXISTS booking_reconciliations (attempt_id TEXT PRIMARY KEY, ciphertext TEXT NOT NULL, created_at INTEGER NOT NULL)");
      this.messages.db.prepare("INSERT INTO booking_reconciliations VALUES (?,?,?)").run(attempt,this.vault.seal(evidence,attempt),Date.now());
      this.messages.db.prepare("UPDATE booking_attempts SET state='not_booked' WHERE id=? AND owner=? AND state='unknown'").run(attempt,owner);
    }).immediate();
  }
  confirm(attempt: string, reference: string | null, managementToken?: string) {
    this.messages.db.prepare("UPDATE booking_attempts SET state='confirmed',reference=?,provider_result=? WHERE id=? AND state='unknown'")
      .run(reference, managementToken ? this.vault.seal(managementToken, attempt) : null, attempt);
  }
}

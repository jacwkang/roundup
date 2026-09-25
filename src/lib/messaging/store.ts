import Database from "better-sqlite3";
import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { randomUUID } from "node:crypto";
import type { Incoming } from "./webhook";
import { makeReply } from "./reply";

export type Job = {
  seq: number; event_id: string; message_id: string; chat_id: string; sender: string;
  body: string; response: string | null; attempts: number; lease_token: string;
  state: string; last_error: string | null;
};

export class Store {
  readonly db: Database.Database;
  constructor(path: string) {
    if (path !== ":memory:") mkdirSync(dirname(path), { recursive: true });
    this.db = new Database(path);
    this.db.pragma("journal_mode = WAL");
    this.db.pragma("busy_timeout = 5000");
    // Refuse the previous provider's store, even if ARA_DATABASE_PATH is accidentally reused.
    const hasMessages = this.db.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name='messages'").get();
    const hasMeta = this.db.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name='ara_metadata'").get();
    if (hasMessages && !hasMeta) {
      this.db.close();
      throw new Error("Use a fresh Sendblue database; legacy messaging state cannot be replayed.");
    }
    if (hasMeta) {
      const meta = this.db.prepare("SELECT value FROM ara_metadata WHERE key='provider'").get() as { value: string } | undefined;
      if (meta?.value !== "sendblue") { this.db.close(); throw new Error("Wrong messaging provider database"); }
    }
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS ara_metadata (key TEXT PRIMARY KEY, value TEXT NOT NULL);
      INSERT OR IGNORE INTO ara_metadata(key,value) VALUES ('provider','sendblue');
      CREATE TABLE IF NOT EXISTS chats (id TEXT PRIMARY KEY, introduced INTEGER NOT NULL DEFAULT 0);
      CREATE TABLE IF NOT EXISTS messages (
        seq INTEGER PRIMARY KEY AUTOINCREMENT, event_id TEXT NOT NULL UNIQUE,
        message_id TEXT NOT NULL UNIQUE, chat_id TEXT NOT NULL, sender TEXT NOT NULL,
        body TEXT NOT NULL, sent_at TEXT NOT NULL, service TEXT NOT NULL,
        state TEXT NOT NULL DEFAULT 'queued', response TEXT, attempts INTEGER NOT NULL DEFAULT 0,
        available_at INTEGER NOT NULL DEFAULT 0, lease_until INTEGER NOT NULL DEFAULT 0,
        lease_token TEXT, last_error TEXT, provider_message_id TEXT, created_at INTEGER NOT NULL
      );
      CREATE INDEX IF NOT EXISTS messages_chat_order ON messages(chat_id, seq);
    `);
  }
  close() { this.db.close(); }
  enqueue(input: Incoming): boolean {
    return this.db.transaction(() => {
      this.db.prepare("INSERT OR IGNORE INTO chats(id) VALUES (?)").run(input.chatId);
      return this.db.prepare(`INSERT OR IGNORE INTO messages
        (event_id,message_id,chat_id,sender,body,sent_at,service,created_at) VALUES (?,?,?,?,?,?,?,?)`)
        .run(input.eventId, input.messageId, input.chatId, input.sender, input.text, input.sentAt, input.service, Date.now()).changes > 0;
    })();
  }
  claim(now = Date.now()): Job | undefined {
    return this.db.transaction(() => {
      // A crashed sender could have reached the provider. Hold it for reconciliation.
      this.db.prepare("UPDATE messages SET state='unknown',last_error='send_interrupted' WHERE state='sending' AND lease_until<=?").run(now);
      // A failed/unknown earlier message blocks its own chat, not other chats.
      const row = this.db.prepare(`SELECT * FROM messages m
        WHERE ((state='queued' AND available_at<=?) OR (state='processing' AND lease_until<=?))
        AND NOT EXISTS (SELECT 1 FROM messages prior WHERE prior.chat_id=m.chat_id AND prior.seq<m.seq AND prior.state!='done')
        ORDER BY seq LIMIT 1`).get(now, now) as Job | undefined;
      if (!row) return undefined;
      const chat = this.db.prepare("SELECT introduced FROM chats WHERE id=?").get(row.chat_id) as { introduced: number };
      const response = row.response ?? makeReply(row.body, Boolean(chat.introduced));
      const lease = randomUUID();
      this.db.prepare(`UPDATE messages SET state='processing', response=?, attempts=attempts+1, lease_until=?, lease_token=? WHERE seq=?`)
        .run(response, now + 60000, lease, row.seq);
      return { ...row, response, lease_token: lease, attempts: row.attempts + 1, state: "processing" };
    }).immediate();
  }
  complete(job: Job, providerId?: string) {
    this.db.transaction(() => {
      const result = this.db.prepare(`UPDATE messages SET state='done',provider_message_id=?,last_error=NULL
        WHERE seq=? AND lease_token=? AND state IN ('processing','sending')`).run(providerId ?? null, job.seq, job.lease_token);
      if (result.changes && providerId) this.db.prepare("UPDATE chats SET introduced=1 WHERE id=?").run(job.chat_id);
    })();
  }
  beginSend(job: Job, now = Date.now()) {
    return this.db.prepare(`UPDATE messages SET state='sending' WHERE seq=? AND lease_token=? AND state='processing' AND lease_until>?`)
      .run(job.seq, job.lease_token, now).changes > 0;
  }
  fail(job: Job, reason: string, uncertain: boolean) {
    this.db.prepare(`UPDATE messages SET state=?,last_error=? WHERE seq=? AND lease_token=? AND state='sending'`)
      .run(uncertain ? "unknown" : "failed", reason, job.seq, job.lease_token);
  }
  resolve(seq: number, outcome: "sent" | "not-sent", providerId?: string) {
    if (outcome === "sent" && !providerId?.trim()) throw new Error("A verified provider message handle is required");
    return this.db.transaction(() => {
      const row = this.db.prepare("SELECT chat_id FROM messages WHERE seq=? AND state='unknown'").get(seq) as { chat_id: string } | undefined;
      if (!row) return 0;
      if (outcome === "sent") {
        this.db.prepare("UPDATE messages SET state='done',provider_message_id=?,last_error=NULL WHERE seq=?").run(providerId!, seq);
        this.db.prepare("UPDATE chats SET introduced=1 WHERE id=?").run(row.chat_id);
      } else {
        this.db.prepare("UPDATE messages SET state='queued',attempts=0,available_at=0,last_error=NULL WHERE seq=?").run(seq);
      }
      return 1;
    }).immediate();
  }
  list() {
    // Operator status deliberately excludes message bodies and sender handles.
    return this.db.prepare(`SELECT seq,chat_id,state,attempts,last_error,provider_message_id FROM messages ORDER BY seq DESC LIMIT 50`).all();
  }
  retry(seq: number) {
    return this.db.prepare("UPDATE messages SET state='queued',attempts=0,available_at=0,last_error=NULL WHERE seq=? AND state='failed'").run(seq).changes;
  }
}

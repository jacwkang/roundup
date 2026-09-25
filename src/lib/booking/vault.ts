import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";
import type Database from "better-sqlite3";

export class Vault {
  constructor(private db: Database.Database, private key: string) {
    if (!/^[a-f0-9]{64}$/i.test(key)) throw new Error("Invalid credential key");
    db.exec("CREATE TABLE IF NOT EXISTS booking_credentials (owner TEXT PRIMARY KEY, ciphertext TEXT NOT NULL)");
  }
  seal(value: string, context: string) {
    const iv = randomBytes(12);
    const cipher = createCipheriv("aes-256-gcm", Buffer.from(this.key, "hex"), iv);
    cipher.setAAD(Buffer.from(context));
    const data = Buffer.concat([cipher.update(value, "utf8"), cipher.final()]);
    return [iv, cipher.getAuthTag(), data].map(b => b.toString("base64")).join(".");
  }
  open(value: string, context: string) {
    const [iv, tag, data] = value.split(".").map(p => Buffer.from(p, "base64"));
    const cipher = createDecipheriv("aes-256-gcm", Buffer.from(this.key, "hex"), iv);
    cipher.setAAD(Buffer.from(context)); cipher.setAuthTag(tag);
    return Buffer.concat([cipher.update(data), cipher.final()]).toString("utf8");
  }
  connect(owner: string, token: string) {
    this.db.prepare("INSERT OR REPLACE INTO booking_credentials VALUES (?,?)").run(owner, this.seal(token, owner));
  }
  token(owner: string): string {
    const row = this.db.prepare("SELECT ciphertext FROM booking_credentials WHERE owner=?").get(owner) as { ciphertext: string } | undefined;
    if (!row) throw new Error("account_not_connected");
    return this.open(row.ciphertext, owner);
  }
  disconnect(owner: string) { this.db.prepare("DELETE FROM booking_credentials WHERE owner=?").run(owner); }
}

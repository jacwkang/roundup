import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { mkdirSync, existsSync } from "fs";
import { dirname } from "path";
import * as schema from "./schema";

let _db: ReturnType<typeof drizzle<typeof schema>> | null = null;

function getDbPath(): string {
  return process.env.DATABASE_URL ?? "./data/hangout.db";
}

export function getDb() {
  if (_db) return _db;

  const dbPath = getDbPath();
  const dir = dirname(dbPath);
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }

  const sqlite = new Database(dbPath);
  sqlite.pragma("journal_mode = WAL");
  sqlite.pragma("foreign_keys = ON");

  _db = drizzle(sqlite, { schema });
  migrate(sqlite);
  return _db;
}

function migrate(sqlite: Database.Database) {
  sqlite.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      email TEXT NOT NULL UNIQUE,
      name TEXT,
      google_id TEXT NOT NULL UNIQUE,
      encrypted_refresh_token TEXT,
      calendar_id TEXT DEFAULT 'primary',
      created_at INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS hangout_plans (
      id TEXT PRIMARY KEY,
      organizer_id TEXT NOT NULL REFERENCES users(id),
      title TEXT NOT NULL,
      city TEXT NOT NULL,
      timezone TEXT NOT NULL DEFAULT 'America/New_York',
      date_range_start INTEGER NOT NULL,
      date_range_end INTEGER NOT NULL,
      min_duration_minutes INTEGER NOT NULL DEFAULT 120,
      preferences_json TEXT DEFAULT '{}',
      status TEXT NOT NULL DEFAULT 'draft',
      created_at INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS participants (
      id TEXT PRIMARY KEY,
      plan_id TEXT NOT NULL REFERENCES hangout_plans(id) ON DELETE CASCADE,
      user_id TEXT REFERENCES users(id),
      email TEXT NOT NULL,
      invite_token TEXT NOT NULL UNIQUE,
      status TEXT NOT NULL DEFAULT 'invited',
      created_at INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS availability_runs (
      id TEXT PRIMARY KEY,
      plan_id TEXT NOT NULL REFERENCES hangout_plans(id) ON DELETE CASCADE,
      slots_json TEXT NOT NULL,
      computed_at INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS activity_discovery_runs (
      id TEXT PRIMARY KEY,
      plan_id TEXT NOT NULL REFERENCES hangout_plans(id) ON DELETE CASCADE,
      restaurants_json TEXT NOT NULL,
      events_json TEXT NOT NULL,
      computed_at INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS reservation_availability (
      id TEXT PRIMARY KEY,
      plan_id TEXT NOT NULL REFERENCES hangout_plans(id) ON DELETE CASCADE,
      venue_name TEXT NOT NULL,
      provider TEXT NOT NULL,
      party_size INTEGER NOT NULL,
      slot_start INTEGER NOT NULL,
      slot_end INTEGER,
      available_times_json TEXT NOT NULL,
      book_url TEXT NOT NULL,
      checked_at INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS proposals (
      id TEXT PRIMARY KEY,
      plan_id TEXT NOT NULL REFERENCES hangout_plans(id) ON DELETE CASCADE,
      selected_slots_json TEXT NOT NULL,
      activities_json TEXT NOT NULL,
      email_subject TEXT NOT NULL,
      email_body TEXT NOT NULL,
      sent_at INTEGER,
      created_at INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS venue_mappings (
      id TEXT PRIMARY KEY,
      restaurant_name TEXT NOT NULL,
      city TEXT NOT NULL,
      provider TEXT NOT NULL,
      provider_venue_id TEXT NOT NULL,
      book_url TEXT,
      created_at INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS plan_results (
      id TEXT PRIMARY KEY,
      plan_id TEXT NOT NULL REFERENCES hangout_plans(id) ON DELETE CASCADE,
      options_json TEXT NOT NULL,
      generated_at INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS option_votes (
      id TEXT PRIMARY KEY,
      plan_id TEXT NOT NULL REFERENCES hangout_plans(id) ON DELETE CASCADE,
      user_id TEXT NOT NULL REFERENCES users(id),
      option_id TEXT NOT NULL,
      created_at INTEGER NOT NULL
    );

    CREATE UNIQUE INDEX IF NOT EXISTS option_votes_unique
      ON option_votes(plan_id, user_id, option_id);
  `);
}

export { schema };

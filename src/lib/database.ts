import { createClient, type Client } from "@libsql/client";
import { requireEnv } from "./config";

let client: Client | null = null;
let schemaReady: Promise<void> | null = null;

export async function getDb(): Promise<Client> {
  if (!client) {
    client = createClient({
      url: requireEnv("TURSO_DATABASE_URL"),
      authToken: requireEnv("TURSO_AUTH_TOKEN"),
    });
  }

  schemaReady ??= ensureSchema(client);
  await schemaReady;
  return client;
}

async function ensureSchema(db: Client): Promise<void> {
  await db.batch(
    [
      `CREATE TABLE IF NOT EXISTS subscriptions (
        id TEXT PRIMARY KEY,
        email TEXT NOT NULL UNIQUE,
        categories TEXT NOT NULL,
        unsubscribe_token TEXT NOT NULL UNIQUE,
        active INTEGER NOT NULL DEFAULT 1,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        unsubscribed_at TEXT
      )`,
      `CREATE INDEX IF NOT EXISTS idx_subscriptions_active
        ON subscriptions(active)`,
      `CREATE TABLE IF NOT EXISTS seen_tournaments (
        tournament_id TEXT PRIMARY KEY,
        category TEXT NOT NULL,
        name TEXT NOT NULL,
        url TEXT NOT NULL,
        first_seen_at TEXT NOT NULL
      )`,
      `CREATE TABLE IF NOT EXISTS notification_log (
        id TEXT PRIMARY KEY,
        tournament_id TEXT NOT NULL,
        email TEXT NOT NULL,
        sent_at TEXT NOT NULL,
        status TEXT NOT NULL,
        error TEXT
      )`,
      `CREATE INDEX IF NOT EXISTS idx_notification_log_tournament
        ON notification_log(tournament_id)`,
    ],
    "write",
  );
}

import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import * as schema from "@shared/schema";

// Allow overriding path via env; default to local file
const dbFile = process.env.DATABASE_URL && !process.env.DATABASE_URL.startsWith('postgres')
  ? process.env.DATABASE_URL.replace(/^file:/, '')
  : 'sqlite.db';

const sqlite = new Database(dbFile);

// Ensure required tables exist when running on a fresh environment (e.g., Render)
// This is a minimal bootstrap to avoid manual migration steps on ephemeral disks.
function ensureSchema(db: Database.Database) {
  // rooms
  db.prepare(`
    CREATE TABLE IF NOT EXISTS rooms (
      id TEXT PRIMARY KEY NOT NULL,
      name TEXT NOT NULL,
      host_id TEXT NOT NULL,
      created_at INTEGER,
      is_active INTEGER DEFAULT 1
    )
  `).run();

  // users
  db.prepare(`
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY NOT NULL,
      username TEXT NOT NULL,
      room_id TEXT,
      is_host INTEGER DEFAULT 0,
      joined_at INTEGER
    )
  `).run();

  // messages
  db.prepare(`
    CREATE TABLE IF NOT EXISTS messages (
      id TEXT PRIMARY KEY NOT NULL,
      content TEXT NOT NULL,
      user_id TEXT NOT NULL,
      room_id TEXT NOT NULL,
      timestamp INTEGER
    )
  `).run();

  // videos
  db.prepare(`
    CREATE TABLE IF NOT EXISTS videos (
      id TEXT PRIMARY KEY NOT NULL,
      name TEXT NOT NULL,
      magnet_uri TEXT NOT NULL,
      info_hash TEXT NOT NULL,
      size TEXT,
      room_id TEXT NOT NULL,
      uploaded_by TEXT NOT NULL,
      uploaded_at INTEGER
    )
  `).run();
}

ensureSchema(sqlite);
export const db = drizzle(sqlite, { schema });

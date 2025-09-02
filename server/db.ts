import { drizzle } from 'drizzle-orm/node-postgres';
import { drizzle as drizzleSQLite } from 'drizzle-orm/better-sqlite3';
import { Pool } from 'pg';
import Database from 'better-sqlite3';
import * as schema from "@shared/schema";

// Check if we should use PostgreSQL (for production/Render) or SQLite (for development)
const usePostgres = process.env.DATABASE_URL?.startsWith('postgres');

let db: ReturnType<typeof drizzle> | ReturnType<typeof drizzleSQLite>;

if (usePostgres && process.env.DATABASE_URL) {
  // PostgreSQL for production (Render)
  console.log('Using PostgreSQL database for production');
  const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false
  });
  db = drizzle(pool, { schema });
} else {
  // SQLite for development
  console.log('Using SQLite database for development');
  const dbFile = process.env.DATABASE_URL?.replace(/^file:/, '') || 'sqlite.db';
  const sqlite = new Database(dbFile);
  ensureSchema(sqlite); // Only run schema setup for SQLite
  db = drizzleSQLite(sqlite, { schema });
}

// Ensure required tables exist when running on a fresh environment (e.g., Render)
// This is a minimal bootstrap to avoid manual migration steps on ephemeral disks.
function ensureSchema(db: Database.Database) {
  // rooms
  db.prepare(`
    CREATE TABLE IF NOT EXISTS rooms (
      id TEXT PRIMARY KEY NOT NULL,
      name TEXT NOT NULL,
      host_id TEXT NOT NULL,
      room_code TEXT,
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

  // Clean up any historical duplicates (keep the newest) before adding the unique index
  try {
    const dups = db.prepare(`
      SELECT room_id, info_hash, COUNT(*) AS cnt
      FROM videos
      GROUP BY room_id, info_hash
      HAVING cnt > 1
    `).all() as Array<{ room_id: string; info_hash: string; cnt: number }>;

    for (const d of dups) {
      const rows = db.prepare(`
        SELECT id FROM videos
        WHERE room_id = ? AND info_hash = ?
        ORDER BY uploaded_at DESC, rowid DESC
      `).all(d.room_id, d.info_hash) as Array<{ id: string }>;
      // keep the newest, delete others
      for (const r of rows.slice(1)) {
        db.prepare(`DELETE FROM videos WHERE id = ?`).run(r.id);
      }
    }
  } catch (e) {
    console.warn('Failed cleaning duplicate videos before creating unique index:', e);
  }

  // Ensure we don't store duplicate entries of the same content in the same room
  try {
    db.prepare(`
      CREATE UNIQUE INDEX IF NOT EXISTS idx_videos_room_hash
      ON videos(room_id, info_hash)
    `).run();
  } catch (e) {
    // If creating the index still fails (e.g., due to a racing write), continue without crashing
    console.warn('Failed creating unique index idx_videos_room_hash:', e);
  }
}

export { db };

import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import * as schema from "@shared/schema";

// Allow overriding path via env; default to local file
const dbFile = process.env.DATABASE_URL && !process.env.DATABASE_URL.startsWith('postgres')
  ? process.env.DATABASE_URL.replace(/^file:/, '')
  : 'sqlite.db';

const sqlite = new Database(dbFile);
export const db = drizzle(sqlite, { schema });

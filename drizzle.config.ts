import { defineConfig } from "drizzle-kit";

export default defineConfig({
  out: "./migrations",
  schema: "./shared/schema.ts",
  dialect: "sqlite",
  dbCredentials: {
    // Use DATABASE_URL if provided, otherwise default to local file
    url: process.env.DATABASE_URL && !process.env.DATABASE_URL.startsWith('postgres')
      ? process.env.DATABASE_URL
      : 'sqlite.db',
  },
});

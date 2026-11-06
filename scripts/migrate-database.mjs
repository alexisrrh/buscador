import { readFile } from "node:fs/promises";
import { Pool } from "pg";
import { applyMigrations } from "../db/migrate.ts";

const connectionString = process.env.DATABASE_MIGRATION_URL;
if (!connectionString) throw new Error("DATABASE_MIGRATION_URL is required; no implicit environment file is loaded.");
const pool = new Pool({ connectionString, max: 1, connectionTimeoutMillis: 5_000 });
try {
  if (process.argv.includes("--bootstrap")) {
    await pool.query(await readFile(new URL("../db/bootstrap.sql", import.meta.url), "utf8"));
  }
  const applied = await applyMigrations(pool);
  console.log(`Migrations applied: ${applied.length}`);
} finally { await pool.end(); }

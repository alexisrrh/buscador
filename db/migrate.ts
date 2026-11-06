import { createHash } from "node:crypto";
import { readdir, readFile } from "node:fs/promises";
import type { Pool } from "pg";

/** Tooling only: the application never imports or runs migrations on requests. */
export async function applyMigrations(pool: Pool, directory = new URL("./migrations/", import.meta.url)) {
  const names = (await readdir(directory)).filter((name) => name.endsWith(".sql")).sort();
  if (names.some((name) => !/^\d{4}_[a-z0-9_]+\.sql$/.test(name))) throw new Error("INVALID_MIGRATION_FILENAME");
  const migrations = await Promise.all(names.map(async (name) => {
    const sql = (await readFile(new URL(name, directory), "utf8")).replace(/\r\n/g, "\n");
    return { name, sql, checksum: createHash("sha256").update(sql).digest("hex") };
  }));
  const client = await pool.connect();
  let discard = false;
  try {
    await client.query("BEGIN");
    await client.query("SELECT pg_advisory_xact_lock(hashtextextended('buscavacante:migrations', 0))");
    await client.query("SET LOCAL ROLE bv_owner");
    await client.query(`CREATE TABLE IF NOT EXISTS app.schema_migrations (
      name text PRIMARY KEY, checksum text NOT NULL, applied_at timestamptz NOT NULL DEFAULT now()
    )`);
    const prior = await client.query<{ name: string; checksum: string }>("SELECT name, checksum FROM app.schema_migrations ORDER BY name");
    if (prior.rows.some((row, index) => migrations[index]?.name !== row.name || migrations[index]?.checksum !== row.checksum)) {
      throw new Error("MIGRATION_HISTORY_MISMATCH");
    }
    const applied: string[] = [];
    for (const migration of migrations.slice(prior.rows.length)) {
      await client.query(migration.sql);
      await client.query("INSERT INTO app.schema_migrations (name, checksum) VALUES ($1, $2)", [migration.name, migration.checksum]);
      applied.push(migration.name);
    }
    await client.query("COMMIT");
    return applied;
  } catch (error) {
    try { await client.query("ROLLBACK"); } catch { discard = true; }
    throw error;
  } finally { client.release(discard); }
}

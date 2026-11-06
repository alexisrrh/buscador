import "server-only";
import { Pool } from "pg";

/** Explicit server-side configuration: no fallback to the legacy database,
 * no implicit .env loading and no connection at module import time. */
export function createDatabasePool(connectionString: string, max = 5): Pool {
  if (!connectionString || !Number.isInteger(max) || max < 1 || max > 20) {
    throw new Error("INVALID_DATABASE_CONFIGURATION");
  }
  let url: URL;
  try { url = new URL(connectionString); }
  catch { throw new Error("INVALID_DATABASE_CONFIGURATION"); }
  if (!["postgres:", "postgresql:"].includes(url.protocol)) {
    throw new Error("INVALID_DATABASE_CONFIGURATION");
  }
  const pool = new Pool({
    connectionString,
    max,
    connectionTimeoutMillis: 5_000,
    idleTimeoutMillis: 30_000,
    application_name: "buscavacante-backend",
  });
  pool.on("error", () => { console.error("DATABASE_IDLE_CONNECTION_ERROR"); });
  return pool;
}

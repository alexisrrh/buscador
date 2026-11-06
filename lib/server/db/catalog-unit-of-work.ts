import "server-only";
import type { Pool } from "pg";
import type { DatabaseTransaction } from "./unit-of-work";

export type CatalogRole = "bv_ingest" | "bv_catalog";

/** Separate connection credentials for neutral ingestion and public reading.
 * Neither role may inherit private-user, owner or the opposite catalogue role. */
export class CatalogUnitOfWork {
  private readonly pool: Pick<Pool, "connect">;
  readonly role: CatalogRole;
  constructor(pool: Pick<Pool, "connect">, role: CatalogRole) {
    if (!["bv_ingest", "bv_catalog"].includes(role)) throw new Error("INVALID_CATALOG_ROLE");
    this.pool = pool;
    this.role = role;
  }
  async run<T>(operation: (tx: DatabaseTransaction) => Promise<T>): Promise<T> {
    const client = await this.pool.connect();
    let discard = false;
    try {
      await client.query("BEGIN");
      if (this.role === "bv_catalog") await client.query("SET TRANSACTION READ ONLY");
      await client.query("SET LOCAL statement_timeout = '5s'");
      await client.query("SET LOCAL lock_timeout = '2s'");
      const result = await client.query<{ allowed: boolean; unsafe: boolean }>(`SELECT
        pg_has_role(current_user,$1,'MEMBER') AS allowed,
        rolsuper OR rolbypassrls OR rolcreatedb OR rolcreaterole OR rolreplication OR pg_has_role(current_user,'bv_owner','MEMBER')
        OR pg_has_role(current_user,'bv_app','MEMBER') OR pg_has_role(current_user,$2,'MEMBER') AS unsafe
        FROM pg_roles WHERE rolname=current_user`, [this.role, this.role === "bv_ingest" ? "bv_catalog" : "bv_ingest"]);
      if (result.rows.length !== 1 || !result.rows[0].allowed || result.rows[0].unsafe) throw new Error("UNSAFE_CATALOG_ROLE");
      await client.query("SELECT set_config('app.user_id','',true)");
      const value = await operation({ query: client.query.bind(client) });
      await client.query("COMMIT");
      return value;
    } catch (error) {
      try { await client.query("ROLLBACK"); } catch { discard = true; }
      throw error;
    } finally { client.release(discard); }
  }
}

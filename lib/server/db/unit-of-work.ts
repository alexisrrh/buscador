import "server-only";
import type { Pool, PoolClient } from "pg";
import { assertActor, type ActorContext } from "../context";

export type DatabaseTransaction = Pick<PoolClient, "query">;

/** Repositories use this client only within the callback; never retain it. */
export class UnitOfWork {
  private readonly pool: Pick<Pool, "connect">;

  constructor(pool: Pick<Pool, "connect">) { this.pool = pool; }

  async withActor<T>(
    actor: ActorContext,
    operation: (transaction: DatabaseTransaction) => Promise<T>,
  ): Promise<T> {
    assertActor(actor);
    const client = await this.pool.connect();
    let discard = false;
    try {
      assertActor(actor);
      await client.query("BEGIN");
      await client.query("SET LOCAL statement_timeout = '5s'");
      await client.query("SET LOCAL lock_timeout = '2s'");
      const role = await client.query<{ unsafe: boolean }>(`
        SELECT rolsuper OR rolbypassrls OR rolcreatedb OR rolcreaterole OR rolreplication OR pg_has_role(current_user, 'bv_owner', 'MEMBER')
          OR pg_has_role(current_user,'bv_ingest','MEMBER') OR pg_has_role(current_user,'bv_catalog','MEMBER') AS unsafe
        FROM pg_roles WHERE rolname = current_user
      `);
      if (role.rows.length !== 1 || role.rows[0].unsafe) {
        throw new Error("UNSAFE_DATABASE_ROLE");
      }
      await client.query("SELECT set_config('app.user_id', $1, true)", [actor.userId]);
      const result = await operation({ query: client.query.bind(client) });
      assertActor(actor);
      await client.query("COMMIT");
      return result;
    } catch (error) {
      try { await client.query("ROLLBACK"); }
      catch { discard = true; }
      throw error;
    } finally {
      client.release(discard);
    }
  }
}

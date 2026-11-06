import "server-only";
import type { ActorContext } from "../context";
import type { DatabaseTransaction } from "./unit-of-work";
import { UnitOfWork } from "./unit-of-work";

export type CandidateRecord = {
  id: string;
  user_id: string;
  name: string;
  headline: string | null;
  job_family: string | null;
  seniority: string | null;
};

export class ProfileUnavailableError extends Error {
  constructor() { super("PROFILE_UNAVAILABLE"); }
}

async function requireOwnProfile(tx: DatabaseTransaction, actor: ActorContext) {
  const result = await tx.query<{ id: string }>(
    "SELECT id FROM public.profiles WHERE id = $1 AND deleted_at IS NULL FOR KEY SHARE",
    [actor.userId],
  );
  if (result.rows.length !== 1) throw new ProfileUnavailableError();
}

export class PostgresProfileRepository {
  private readonly work: UnitOfWork;
  constructor(work: UnitOfWork) { this.work = work; }

  async ensureOwnProfile(actor: ActorContext): Promise<string> {
    return this.work.withActor(actor, async (tx) => {
      await tx.query("INSERT INTO public.profiles (id) VALUES ($1) ON CONFLICT (id) DO NOTHING", [actor.userId]);
      await requireOwnProfile(tx, actor);
      return actor.userId;
    });
  }

  async createCandidate(actor: ActorContext, name: string): Promise<CandidateRecord> {
    const normalized = name.trim();
    if (normalized.length < 2 || normalized.length > 80) throw new Error("INVALID_CANDIDATE_NAME");
    return this.work.withActor(actor, async (tx) => {
      await requireOwnProfile(tx, actor);
      const result = await tx.query<CandidateRecord>(`
        INSERT INTO public.candidate_profiles (user_id, name) VALUES ($1, $2)
        RETURNING id, user_id, name, headline, job_family, seniority
      `, [actor.userId, normalized]);
      return result.rows[0];
    });
  }

  async listCandidates(actor: ActorContext): Promise<CandidateRecord[]> {
    return this.work.withActor(actor, async (tx) => {
      await requireOwnProfile(tx, actor);
      const result = await tx.query<CandidateRecord>(`
        SELECT id, user_id, name, headline, job_family, seniority
        FROM public.candidate_profiles
        WHERE user_id = $1 AND deleted_at IS NULL ORDER BY created_at, id
      `, [actor.userId]);
      return result.rows;
    });
  }

  async findCandidate(actor: ActorContext, id: string): Promise<CandidateRecord | null> {
    return this.work.withActor(actor, async (tx) => {
      await requireOwnProfile(tx, actor);
      const result = await tx.query<CandidateRecord>(`
        SELECT id, user_id, name, headline, job_family, seniority
        FROM public.candidate_profiles WHERE id = $1 AND user_id = $2 AND deleted_at IS NULL
      `, [id, actor.userId]);
      return result.rows[0] ?? null;
    });
  }
}

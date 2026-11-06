import "server-only";
import { preferencesPayload } from "@/lib/onboarding/persistence";
import type { JobPreferences, SearchProfile, SearchStatus } from "@/lib/types";
import type { OnboardingPreferenceState } from "@/lib/onboarding/state";
import type { ActorContext } from "../context";
import { canTransitionSearch, validateSearchInput, type SaveSearchInput } from "../search-input";
import { UnitOfWork, type DatabaseTransaction } from "./unit-of-work";

export type StoredPreferences = JobPreferences & {
  user_id: string; candidate_profile_id: string; search_profile_id: string;
  location_preference_state: OnboardingPreferenceState;
  work_mode_preference_state: OnboardingPreferenceState;
  salary_preference_state: OnboardingPreferenceState;
};
export type SearchSnapshot = { search: SearchProfile; preferences: StoredPreferences };
export class SearchNotFoundError extends Error { constructor() { super("SEARCH_NOT_FOUND"); } }
export class SearchVersionConflictError extends Error { constructor() { super("SEARCH_VERSION_CONFLICT"); } }

const preferenceColumns = ["keywords", "target_titles", "excluded_titles", "locations", "work_modes", "minimum_salary", "currency",
  "accepted_seniorities", "minimum_experience_years", "maximum_experience_years", "required_technologies", "excluded_technologies",
  "languages", "contract_types", "location_preference_state", "work_mode_preference_state", "salary_preference_state"] as const;
const readable = `FROM public.search_profiles s
  JOIN public.candidate_profiles c ON c.id=s.candidate_profile_id AND c.user_id=s.user_id
  JOIN public.profiles u ON u.id=s.user_id
  WHERE s.user_id=$1 AND s.id=$2 AND s.deleted_at IS NULL AND c.deleted_at IS NULL AND u.deleted_at IS NULL`;

async function lockParent(tx: DatabaseTransaction, actor: ActorContext, candidateId: string) {
  const result = await tx.query(`SELECT c.id FROM public.candidate_profiles c JOIN public.profiles u ON u.id=c.user_id
    WHERE c.id=$1 AND c.user_id=$2 AND c.deleted_at IS NULL AND u.deleted_at IS NULL FOR SHARE OF u,c`, [candidateId, actor.userId]);
  if (result.rowCount !== 1) throw new SearchNotFoundError();
}
async function readSnapshot(tx: DatabaseTransaction, actor: ActorContext, id: string): Promise<SearchSnapshot | null> {
  const result = await tx.query<SearchSnapshot>(`SELECT to_jsonb(s) AS search,
    (SELECT to_jsonb(p) FROM public.job_preferences p WHERE p.user_id=s.user_id AND p.search_profile_id=s.id
      AND p.search_profile_version=s.version) AS preferences ${readable}`, [actor.userId, id]);
  return result.rows[0] ?? null;
}

export class PostgresSearchRepository {
  private readonly work: UnitOfWork;
  constructor(work: UnitOfWork) { this.work = work; }

  async save(actor: ActorContext, input: SaveSearchInput): Promise<SearchSnapshot> {
    validateSearchInput(input);
    return this.work.withActor(actor, async tx => {
      await lockParent(tx, actor, input.candidateProfileId);
      let current: SearchProfile | null = null;
      if (input.searchId) {
        const selected = await tx.query<SearchProfile>(`SELECT * FROM public.search_profiles WHERE id=$1 AND user_id=$2
          AND candidate_profile_id=$3 AND deleted_at IS NULL FOR UPDATE`, [input.searchId, actor.userId, input.candidateProfileId]);
        current = selected.rows[0] ?? null;
        if (!current || !["DRAFT", "ACTIVE", "PAUSED"].includes(current.status)) throw new SearchNotFoundError();
        if (current.version !== input.expectedVersion) throw new SearchVersionConflictError();
      }
      const s = input.search;
      const values = [actor.userId, input.candidateProfileId, s.name.trim(), s.frequencyType, JSON.stringify(s.frequencyValue),
        s.timezone, s.notificationMinScore, s.semiAutoMinScore, s.autoApplyMinScore, s.dailyApplicationLimit];
      // Validate schedule/timezone in PostgreSQL even for drafts. No scheduler is started.
      await tx.query("SELECT app.calculate_search_next_run($1,$2,$3,now())", [s.frequencyType, JSON.stringify(s.frequencyValue), s.timezone]);
      const saved = current
        ? await tx.query<{ id: string; version: number }>(`UPDATE public.search_profiles SET name=$3,frequency_type=$4,frequency_value=$5,
            timezone=$6,notification_min_score=$7,semi_auto_min_score=$8,auto_apply_min_score=$9,daily_application_limit=$10,
            version=version+1,updated_at=now(),next_run_at=CASE WHEN status='ACTIVE'
              THEN app.calculate_search_next_run($4,$5,$6,now()) ELSE NULL END
            WHERE user_id=$1 AND candidate_profile_id=$2 AND id=$11 RETURNING id,version`, [...values, current.id])
        : await tx.query<{ id: string; version: number }>(`INSERT INTO public.search_profiles
            (user_id,candidate_profile_id,name,frequency_type,frequency_value,timezone,notification_min_score,
              semi_auto_min_score,auto_apply_min_score,daily_application_limit)
            VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING id,version`, values);
      const { id, version } = saved.rows[0];
      const payload = preferencesPayload(input.preferences);
      const preferenceValues = preferenceColumns.map(key => key === "locations" || key === "languages" ? JSON.stringify(payload[key]) : payload[key]);
      const allValues = [actor.userId, input.candidateProfileId, id, version, ...preferenceValues];
      await tx.query(`INSERT INTO public.job_preferences (user_id,candidate_profile_id,search_profile_id,search_profile_version,${preferenceColumns.join(",")})
        VALUES (${allValues.map((_, i) => `$${i + 1}`).join(",")})`, allValues);
      const snapshot = await readSnapshot(tx, actor, id);
      if (!snapshot) throw new Error("SEARCH_PERSISTENCE_FAILED");
      return snapshot;
    });
  }

  async find(actor: ActorContext, id: string): Promise<SearchSnapshot | null> {
    return this.work.withActor(actor, tx => readSnapshot(tx, actor, id));
  }

  async history(actor: ActorContext, id: string): Promise<StoredPreferences[]> {
    return this.work.withActor(actor, async tx => {
      if (!await readSnapshot(tx, actor, id)) throw new SearchNotFoundError();
      const result = await tx.query<{ preferences: StoredPreferences }>(`SELECT to_jsonb(p) AS preferences FROM public.job_preferences p
        WHERE user_id=$1 AND search_profile_id=$2 ORDER BY search_profile_version`, [actor.userId, id]);
      return result.rows.map(row => row.preferences);
    });
  }

  async transition(actor: ActorContext, id: string, version: number, status: SearchStatus): Promise<void> {
    return this.work.withActor(actor, async tx => {
      const parent = await readSnapshot(tx, actor, id);
      if (!parent) throw new SearchNotFoundError();
      await lockParent(tx, actor, parent.search.candidate_profile_id);
      const selected = await tx.query<SearchProfile>(`SELECT * FROM public.search_profiles WHERE user_id=$1 AND id=$2 AND deleted_at IS NULL FOR UPDATE`, [actor.userId, id]);
      const current = selected.rows[0];
      if (!current) throw new SearchNotFoundError();
      if (current.version !== version) throw new SearchVersionConflictError();
      if (!canTransitionSearch(current.status, status)) throw new Error("INVALID_SEARCH_TRANSITION");
      await tx.query(`UPDATE public.search_profiles SET status=$3::public.search_profile_status,updated_at=now(),
        next_run_at=CASE WHEN $3::public.search_profile_status='ACTIVE' THEN app.calculate_search_next_run(frequency_type,frequency_value,timezone,now()) ELSE NULL END,
        deleted_at=CASE WHEN $3::public.search_profile_status='ARCHIVED' THEN now() ELSE NULL END WHERE user_id=$1 AND id=$2`, [actor.userId,id,status]);
    });
  }
}

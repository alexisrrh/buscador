import "server-only";
import type { MatchingRepository, MatchUpsertInput, SearchMatchingContext } from "@/lib/matching/service";
import type { MatchJobOffer } from "@/lib/matching/types";
import { assertActor, type ActorContext } from "../context";
import type { UnitOfWork, DatabaseTransaction } from "./unit-of-work";
import type { CatalogUnitOfWork } from "./catalog-unit-of-work";

export type MatchStatus = "NEW" | "SAVED" | "DISMISSED" | "APPLIED";
const activeSearch = `FROM public.search_profiles s
  JOIN public.candidate_profiles c ON c.id=s.candidate_profile_id AND c.user_id=s.user_id
  JOIN public.profiles u ON u.id=s.user_id
  JOIN public.job_preferences p ON p.user_id=s.user_id AND p.search_profile_id=s.id AND p.search_profile_version=s.version
  WHERE s.id=$1 AND s.user_id=$2 AND s.status='ACTIVE'
    AND s.deleted_at IS NULL AND c.deleted_at IS NULL AND u.deleted_at IS NULL AND p.deleted_at IS NULL`;

/** One instance per matching run. A loaded snapshot must precede persistence. */
export class PostgresMatchingRepository implements MatchingRepository {
  private readonly versions = new Map<string, number>();
  constructor(private readonly work: UnitOfWork, private readonly catalog: CatalogUnitOfWork, private readonly actor: ActorContext) {
    assertActor(actor);
    if (catalog.role !== "bv_catalog") throw new Error("CATALOG_READER_ROLE_REQUIRED");
  }

  async loadSearchContext(searchProfileId: string, userId: string): Promise<SearchMatchingContext> {
    assertActor(this.actor);
    if (userId !== this.actor.userId) throw new Error("MATCH_SEARCH_NOT_FOUND");
    const context = await this.work.withActor(this.actor, async tx => {
      const result = await tx.query<SearchMatchingContext>(`SELECT
        jsonb_build_object('id',c.id,'userId',c.user_id,'seniority',c.seniority,'jobFamily',c.job_family) AS candidate,
        jsonb_build_object('id',s.id,'userId',s.user_id,'candidateProfileId',s.candidate_profile_id,'version',s.version,
          'status',s.status,'name',s.name,'notificationMinScore',s.notification_min_score) AS search,
        jsonb_build_object('keywords',p.keywords,'targetTitles',p.target_titles,'excludedTitles',p.excluded_titles,
          'locations',p.locations,'workModes',p.work_modes,'minimumSalary',p.minimum_salary::float8,'currency',p.currency,
          'acceptedSeniorities',p.accepted_seniorities,'minimumExperienceYears',p.minimum_experience_years,
          'maximumExperienceYears',p.maximum_experience_years,'requiredTechnologies',p.required_technologies,
          'excludedTechnologies',p.excluded_technologies,'contractTypes',p.contract_types) AS preferences
        ${activeSearch}`, [searchProfileId, userId]);
      if (!result.rows[0]) throw new Error("MATCH_SEARCH_NOT_FOUND");
      return result.rows[0];
    });
    this.versions.set(searchProfileId, context.search.version);
    return context;
  }

  async loadRecentActiveOffers(options: { limit: number; seenAfter: string }): Promise<MatchJobOffer[]> {
    assertActor(this.actor);
    if (!Number.isInteger(options.limit) || options.limit < 1 || options.limit > 5000 || !Number.isFinite(Date.parse(options.seenAfter))) {
      throw new Error("INVALID_MATCH_OFFERS_READ");
    }
    // Dedicated catalogue credentials never gain access to private matching rows.
    return this.catalog.run(async tx => (await tx.query<MatchJobOffer>(`SELECT id,title,description,
      location_text AS "locationText",country_code AS "countryCode",region,city,work_mode AS "workMode",seniority,
      employment_type AS "employmentType",salary_min::float8 AS "salaryMin",salary_max::float8 AS "salaryMax",
      salary_currency AS "salaryCurrency",status FROM public.job_offers
      WHERE status='ACTIVE' AND last_seen_at >= $1 AND (expires_at IS NULL OR expires_at > now())
      ORDER BY last_seen_at DESC,id LIMIT $2`, [options.seenAfter,options.limit])).rows);
  }

  async loadExistingMatchOfferIds(input: { searchProfileId: string; searchProfileVersion: number; scoringVersion: string }) {
    return this.work.withActor(this.actor, async tx => {
      const result = await tx.query<{job_offer_id: string}>(`SELECT job_offer_id FROM public.job_matches
        WHERE user_id=$1 AND search_profile_id=$2 AND search_profile_version=$3 AND scoring_version=$4`,
      [this.actor.userId,input.searchProfileId,input.searchProfileVersion,input.scoringVersion]);
      return new Set(result.rows.map(row => row.job_offer_id));
    });
  }

  private async lockSnapshot(tx: DatabaseTransaction, searchId: string) {
    const expected = this.versions.get(searchId);
    if (expected === undefined) throw new Error("MATCH_CONTEXT_REQUIRED");
    const result = await tx.query<{version: number}>(`SELECT s.version ${activeSearch} FOR SHARE OF s,c,u`, [searchId,this.actor.userId]);
    if (!result.rows[0]) throw new Error("MATCH_SEARCH_NOT_FOUND");
    if (result.rows[0].version !== expected) throw new Error("MATCH_SEARCH_VERSION_CONFLICT");
    return expected;
  }

  async upsertMatches(inputs: MatchUpsertInput[]) {
    if (inputs.length > 5000) throw new Error("MATCH_BATCH_TOO_LARGE");
    if (inputs.length === 0) { assertActor(this.actor); return {created:0,updated:0}; }
    const searchId = inputs[0].searchProfileId;
    if (inputs.some(input => input.searchProfileId !== searchId)) throw new Error("MIXED_MATCH_SEARCHES");
    if (new Set(inputs.map(input => `${input.jobOfferId}:${input.result.scoringVersion}`)).size !== inputs.length) throw new Error("DUPLICATE_MATCH_INPUT");
    return this.work.withActor(this.actor, async tx => {
      const version = await this.lockSnapshot(tx,searchId);
      let created = 0;
      // All chunks belong to one transaction: a failed offer rolls back the run.
      for (let offset=0;offset<inputs.length;offset+=200) {
        const payload = inputs.slice(offset,offset+200).map(input => ({job_offer_id:input.jobOfferId,
          scoring_version:input.result.scoringVersion,score:input.result.score,eligibility:input.result.eligibility,
          components:input.result.components,hard_gates:input.result.hardGates,reasons:input.result.reasons}));
        const result = await tx.query<{created: boolean}>(`INSERT INTO public.job_matches
          (user_id,candidate_profile_id,search_profile_id,search_profile_version,job_offer_id,scoring_version,
            score,eligibility_status,score_components,hard_gates,reasons)
          SELECT s.user_id,s.candidate_profile_id,s.id,$3,x.job_offer_id,x.scoring_version,x.score,
            x.eligibility::public.job_match_eligibility,x.components,x.hard_gates,x.reasons
          FROM public.search_profiles s CROSS JOIN jsonb_to_recordset($4::jsonb) AS x(job_offer_id uuid,
            scoring_version text,score integer,eligibility text,components jsonb,hard_gates jsonb,reasons jsonb)
          WHERE s.id=$1 AND s.user_id=$2
          ON CONFLICT ON CONSTRAINT job_matches_identity_key DO UPDATE SET score=EXCLUDED.score,
            eligibility_status=EXCLUDED.eligibility_status,score_components=EXCLUDED.score_components,
            hard_gates=EXCLUDED.hard_gates,reasons=EXCLUDED.reasons RETURNING (xmax=0) AS created`,
        [searchId,this.actor.userId,version,JSON.stringify(payload)]);
        created += result.rows.filter(row => row.created).length;
      }
      return {created,updated:inputs.length-created};
    });
  }

  async upsertMatch(input: MatchUpsertInput) { return {created:(await this.upsertMatches([input])).created === 1}; }

  async setStatus(id: string, status: MatchStatus): Promise<void> {
    if (!["NEW","SAVED","DISMISSED","APPLIED"].includes(status)) throw new Error("INVALID_MATCH_STATUS");
    await this.work.withActor(this.actor, async tx => {
      const result = await tx.query(`UPDATE public.job_matches SET status=$3::public.job_match_status
        WHERE id=$1 AND user_id=$2 RETURNING id`,[id,this.actor.userId,status]);
      if (result.rowCount !== 1) throw new Error("MATCH_NOT_FOUND");
    });
  }
}

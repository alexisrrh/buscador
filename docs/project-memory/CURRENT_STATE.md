# Current State

Last verified: 2026-09-09.

## PRODUCT RESET MILESTONE 2B COMPLETE - PERSISTENT CATALOG

- The public opportunity path queries fresh, neutral `ACTIVE` JobOffers server-side, followed by the existing public-intent relevance evaluator; it does not invoke source adapters during the public request.
- Global ingestion reuses the registered source registry, adapters, normalization, batch persistence and board health without a user, CandidateProfile, SearchProfile or JobMatch.
- There is no scheduler yet. A developer-only, server-only entrypoint can populate a local catalog for validation; production must not fall back to visitor-triggered board fan-out when the catalog is empty.
- Current freshness policy is the existing 45-day `last_seen_at` window. Full reconciliation after a successful source run remains future work.
- Local validation ingested 2,256 offers from 4 providers and 21 boards. Catalog-only public searches completed in approximately 160–230 ms with no adapters called during the request.
- Before aggressive board growth, resolve source identity dedupe: `job_source_id` identifies a provider rather than a concrete board, so equal external IDs across boards of one provider can collide.
- Coverage remains limited to the existing 4 providers and 21 boards. The next priority is Milestone 2C — Source Coverage Expansion for permitted Spain, Galicia, non-tech and Europe sources. PUBLIC RELEVANCE CALIBRATION and LEGACY UI CLEANUP remain separate pending work.

## PRODUCT RESET MILESTONE 2C-A COMPLETE - JOBGETHER

- Emprego Galicia remains BLOCKED / RESEARCH: on 2026-09-09 its official Open Data page published an RSS URL that returned HTTP 404 on direct verification; HTML scraping is not an acceptable substitute.
- Jobgether's documented public API was verified live without an API key. It returns paginated jobs (maximum 25 per page), permits reasonable cached use for job-search agents and requires preserving Jobgether attribution and canonical listing URL.
- Jobgether flows through the existing adapter, global ingestion, neutral persistent catalog, public relevance and `/oportunidades`. The registered `spain` source is limited to three pages / 75 offers per ingestion run with 500 ms minimum request spacing; there is no visitor-triggered API call.
- Jobgether has no external apply URL in the verified response; its canonical Jobgether offer URL remains the public source link. Tech expansion, ETT partnerships, Tecnoempleo (ACCESS_REQUIRED), LinkedIn (PARTNERSHIP_REQUIRED), PUBLIC RELEVANCE CALIBRATION and LEGACY UI CLEANUP remain separate work.
- Local real ingestion created 71 Jobgether offers on its first scoped run; a repeat was idempotent. The local catalog contained 2,403 ACTIVE/fresh offers, of which 2,402 had safe public source references and were evaluated.
- Public catalog candidate retrieval is paginated server-side beyond PostgREST's 1,000-row maximum with a stable `last_seen_at DESC, id ASC` order; every fresh ACTIVE offer with a safe source reference is evaluated. At larger scale, replace full-catalog retrieval with indexed coarse candidate selection before deterministic relevance.
- Reingesting an unchanged offer remains `UNCHANGED` for content/matching purposes while refreshing `job_offers.last_seen_at` and `job_offer_sources.last_seen_at`; this records renewed presence without claiming a content update.

## PRODUCT RESET MILESTONE 2A COMPLETE - DYNAMIC SOURCE REGISTRY

- `company_career_sources` is the persisted SourceRegistry for public `/oportunidades` and private/live search. It currently contains 4 providers (Greenhouse, Ashby, SmartRecruiters and Lever) and 21 company boards, not 21 independent job portals.
- Adding a board for a supported provider is configuration-only: it does not require changes to the orchestrator, deterministic matching or Oportunidades.
- The public route remains unauthenticated and resolves the registry server-side; service credentials, board health details and raw errors never reach the browser.
- Existing board health fields and RPC are reused: disabled boards are skipped, degraded boards remain isolated, and per-board checks record safe timestamps/error codes. No migration was required.
- The hardcoded development list is an explicit, idempotent local seed only when the persisted registry is empty. Production does not silently depend on it.
- Next priority: Source Coverage / Persistent Ingestion. Reuse persisted JobOffer, job_offer_sources and freshness before broad coverage can turn every user search into a synchronous fan-out across hundreds of boards.
- Manual findings retained for later calibration: Enfermera + A Coruna + Hibrido and Mozo de almacen + A Coruna + Cualquier modalidad returned 0; coverage for local/non-tech and health roles is insufficient. Frontend + A Coruna + Cualquier modalidad returned Full Stack Developer and Senior / Staff Fullstack Engineer; seniority, Frontend/Full Stack relation and explicit-location interpretation need later review.

## PRODUCT RESET MILESTONE 1A COMPLETE

This section supersedes the previous worktree-freeze snapshot below.

- `/` collects a role plus optional location/work mode and sends every user to public `/oportunidades`; no CandidateProfile, SearchProfile, CV or auth is required to search.
- The flow is: landing -> public search -> real opportunities -> auth only for a personalized action -> CV/candidacy continuation later.
- Public search uses existing Greenhouse, Ashby, SmartRecruiters and Lever adapters across 21 configured company boards. This is not 21 independent job portals.
- Public relevance applies prudent role expansion and title/family, seniority, location and work-mode gates. It never shows personal compatibility without a profile/CV.
- Coverage is static, tech/international-biased and insufficient for Spain/non-tech roles. There is no discovery yet. InfoJobs has an adapter but requires application credentials.
- Next priority: Dynamic SourceRegistry and broader permitted source coverage. Legacy dashboard cleanup remains deferred until Oportunidades and candidacy replace the old flow.

## Current Product Direction

BuscaVacante is being reset around **invisible complexity, visible outcomes**:

> The user says what job they want, uploads a CV, and BuscaVacante does the operational work.

The primary user experience will be **Oportunidades**, not an internal dashboard or technical configuration system. The target navigation is: **Oportunidades · Candidaturas · Perfil**.

The target journey is:

```text
What job are you looking for?
→ optional location/work mode
→ sign up / sign in
→ upload CV
→ automatic CV analysis
→ multi-source discovery
→ ranked opportunities
→ manual apply or future auto apply
→ offer-specific CV adaptation
→ application tracking
```

## Verified Technical State

- Phases 0–3 established the multi-tenant Supabase/Auth, private Resume, and Next.js baseline.
- Neutral JobOffer, JobMatch, deterministic matching, company-career ingestion, public ATS adapters, application drafts, derived resumes, and an Application Engine already exist and are reusable.
- Current adapters cover Greenhouse, Lever, Ashby, SmartRecruiters, and configured company career sources. InfoJobs has an adapter but live availability depends on external access/credentials.
- Multi-source target architecture is: User Job Intent → Query Expansion → Source Registry → parallel adapters → NormalizedJobOffer → deduplication → matching → ranking → unified Opportunities. A failed source must not block valid results from others.
- The approved base CV is the quality floor. Adaptation may prioritize verified information but may never invent or gratuitously degrade it.
- Professional Evidence Bank foundation is committed in `34981c2`.
- Migration `20260909000100_phase9a9_professional_evidence.sql` is registered locally and remotely. Local tables exist, are empty, and retain RLS plus FORCE RLS.

## Current Worktree State

This is a **PRODUCT RESET / WORKTREE FREEZE** checkpoint, not the start of the new UX.

- Snapshot before this memory update: 17 modified files, 16 untracked files, 33 total worktree entries.
- Validation snapshot: 222 tests passed, 8 skipped; typecheck, lint, build, and `git diff --check` passed.
- Commit 1 is complete. The remaining worktree still contains later checkpoint blocks: approved-CV bootstrap/normalization, requirement resolution, contextual confirmations, reference renderer, and adaptation diagnostics.
- Do not start Product Reset implementation until those blocks have been classified, validated, committed or deliberately deferred, and the worktree is clean.

## Known Follow-up

`authenticated` currently has effective `REFERENCES`, `TRIGGER`, and `TRUNCATE` grants on Professional Evidence tables beyond the migration's intended CRUD grants. This is a security follow-up, not part of the migration-history reconciliation or Commit 1. Assess it with a dedicated additive migration later; do not change it opportunistically.

## Immediate Next Step

Finish the checkpoint sequence with small, validated commits. Do **not** begin Commit 2 or Product Reset UX without explicit authorization.

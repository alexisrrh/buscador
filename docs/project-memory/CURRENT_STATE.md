# Current State

## 2026-11-06 Tarea 05 completa: CI y protecciones verificadas

Ver `../ci-quality-gates.md`. Node 24.15.0, npm ci, lint estricto, next typegen/tsc, suite con V8 y build pasan en copia limpia sin entorno privado: 377 pruebas aprobadas y 15 omitidas. Cobertura de 22 módulos: líneas 95,93 %, sentencias 91,24 %, funciones 94,82 %, ramas 81,20 %; mínimos del 80 %. Fallos de tipos y cobertura comprobados con pruebas negativas.

El usuario exige Conventional Commits con descripción en español, ramas de trabajo y PR usando la plantilla hacia develop; promoción posterior por PR a main. develop creada en GitHub desde main 0913134; trabajo actual en ci/controles-calidad. Rama publicada y PR #1 abierto hacia develop con plantilla y sin conflictos. CI del commit 9943b36 aprobado para push (42205489586) y PR (42205496389). Protecciones de develop/main activadas y verificadas con la sesión existente de Git Credential Manager: Quality gate de GitHub Actions, PR, revisión, rama actualizada y conversaciones resueltas obligatorios, administradores incluidos, sin force push ni eliminación. PR bloqueado hasta aprobación humana. Remoto público, discrepancia con RT-12. No se ha integrado ni desplegado esta entrega.

## 2026-11-06 Task 04 architecture transition design complete

See `../architecture/TRANSITION_PLAN.md` and `../architecture/current-dependencies.json`. The local inventory covers 22 migrations, 22 declared public tables, 34 public function names and 42 Supabase/RPC-coupled modules. This is not a live schema or user-data audit.

The target is a modular Next.js server backend, PostgreSQL 17, Better Auth and private Tigris storage. The design retains UUIDs, composite ownership constraints and RLS, isolates connection context per transaction, requires session recovery rather than importing Supabase sessions, and uses staging/verification/finalization for objects. It defines cutover and rollback both before and after target writes.

No runtime implementation, package/config changes, SQL execution, credentials, remote resources or production data were involved. Supabase remains the existing runtime. Task 05 CI validation is next; target implementation starts through tasks 06 onward. The historical 377 passed/15 skipped, strict lint, types and build baseline remains task 03 evidence; functional tests were not rerun for this design-only change.

## 2026-11-06 Task 03 checkpoint consolidation complete

Current baseline branch: `chore/checkpoint-base-20261106`. Main remains at `0913134`; both original stash OIDs are preserved. See `../checkpoint-baseline-2026-11-06.md` for the local checkpoint sequence, asset policy and reconstruction evidence. No merge, push or deployment was performed.

The staged application tree was reconstructed using Git archive without private environment files or authoring assets. Installed dependency bytes were reused locally; a fresh registry install was not tested. Lint has zero errors/warnings; types and production build pass; full suite: 377 passed, 15 skipped. A CRLF-sensitive migration assertion was made newline-independent; SQL was unchanged.

All 1,033 deferred authoring/review files remain on disk and match the task 01 hashes; they are explicitly ignored while eight public runtime assets are committed. The closing documentation checkpoint leaves the worktree clean. Next: task 04 architecture transition design. Earlier snapshots below are historical.

## 2026-11-06 Task 02 lint cleanup complete

See `../lint-cleanup-2026-11-06.md`. ESLint passes with `--max-warnings 0`: zero errors and zero warnings, without rule overrides or suppressions. Browser state subscriptions, visual resets, owned Three.js textures and imperative scene refs were corrected; unused internal helpers were removed. Asset bytes, CSS and business logic remain unchanged.

Typecheck and production build pass. Full suite: 377 passed, 15 skipped; final focused regression: 20 passed. Real WebGL choreography and full accessibility acceptance were not revalidated. HEAD, index and both stashes remain preserved; no commit or push. Next: task 03 checkpoint consolidation, including deliberate asset retention/versioning.

## 2026-11-06 Requirements baseline and local inventory

The user adopted `BuscaVacante_AUDITORIA_FINAL.pdf` as the functional/technical target. See `../requirements-gap-analysis-2026-11-06.md` and `../PRIORITY_CHECKLIST.md`. Older architectural decisions and the snapshots below describe the existing implementation, not compliance with that target. Better Auth, a project-controlled backend and Tigris are required by the specification; the current implementation still uses Supabase.

Task 01 is complete: 18 modified tracked files and 1,083 untracked files were classified and backed up outside the repository with per-file SHA-256 verification. A Git bundle was verified and both stashes preserved. See `../worktree-inventory-2026-11-06.md` for dependencies, recovery limits and proposed checkpoints. No functional code, staging, commits or stashes were changed. Next task: 02, lint corrections. Consolidation into a clean checkpoint remains task 03.

Validation from the same session before this documentation-only inventory: typecheck and production build passed; 373 tests passed and 15 were skipped; lint reported 25 errors and 28 warnings. Production behavior, coverage and remote SQL isolation were not revalidated.

## Historical snapshots

Last verified: 2026-09-10.

## PRODUCT RESET MILESTONE 3A-2 COMPLETE - CONTEXTUAL CV ONBOARDING

- CandidateProfile remains an internal owner of private Resume records. Contextual preparation no longer requires a user to create or select one when a single safe path exists.
- `ensure_contextual_candidate_profile()` derives `auth.uid()`, serializes the no-profile path per user and creates the neutral `Perfil principal` only when no active profile exists. Ambiguous active profiles are reported rather than selected arbitrarily.
- Contextual CV onboarding reuses the private upload lifecycle and keeps explicit `READY` to `APPROVED` confirmation. It does not run resume extraction, bootstrap Evidence Bank, create matching, JobMatch or ApplicationDraft records.
- Pending next slices remain 3A-3 public-offer to internal-preparation bridge, 3A-4 candidature review and 3A-5 legacy navigation containment. PUBLIC RELEVANCE CALIBRATION and LEGACY UI CLEANUP remain separate.

## PRODUCT RESET MILESTONE 3A-1 COMPLETE - PUBLIC OFFER CONTINUITY

- Public Oportunidades preparation now distinguishes a server-verified session: authenticated visitors continue directly to the contextual Resume handoff, while anonymous visitors use the existing auth gate.
- The handoff carries validated role, location, mode, offer title, offer URL and `action=prepare`; safe return targets remain limited to contextual `/resumes` or `/oportunidades` destinations.
- `/resumes` now visibly identifies the selected offer during a valid preparation handoff and preserves that context through Resume approval/archive/delete redirects. It does not create a JobMatch or alter Evidence, adaptation or Application Engine behavior.
- Pending next slices remain 3A-2 contextual CV onboarding, 3A-3 public-offer to internal-preparation bridge, 3A-4 candidature review and 3A-5 legacy navigation containment. PUBLIC RELEVANCE CALIBRATION and LEGACY UI CLEANUP remain separate.

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

## PRODUCT RESET MILESTONE 2C-B COMPLETE - JOBICY

- Jobicy's documented public `/api/v2/remote-jobs` endpoint was verified live without an API key. The initial source scope is `geo=europe` plus `industry=engineering`, with one bounded request and at most 200 offers per run; its fair-use guidance requires polling no more than hourly.
- The source preserves Jobicy attribution and its canonical listing URL. The API response is normalized only from provided fields; the endpoint's documented remote-only scope is recorded as `REMOTE`, while `Europe`, `Worldwide` and multi-country eligibility are not converted into Spain.
- A local real ingestion received 195 offers, created 195 on the initial run, and reingested all 195 as `UNCHANGED` on repeat while refreshing observation timestamps. The local fresh public catalog then held 2,597 offers (2,402 before Jobicy); `/oportunidades` does not call Jobicy.
- Incremental local Spain/remote results were Frontend Developer +6, Full Stack Developer +6, Data Engineer +2 and QA +1. Backend Developer +0, Junior Developer +0, DevOps +0 and IT Support +0 under unchanged public relevance.
- Pending separately: Remote OK; Startup.jobs (ACCESS_REQUIRED); Get on Board; Arbeitnow; Spain/Galicia non-tech; Emprego Galicia recovery; Tecnoempleo; ETT and LinkedIn partnerships; scheduler/lifecycle reconciliation; cross-source dedupe; PUBLIC RELEVANCE CALIBRATION; future DB candidate retrieval/indexing; and LEGACY UI CLEANUP.

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

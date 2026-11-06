# Project Changelog

This file records verified project-level milestones. It does not replace Git history.

## 2026-11-06 - Task 03 reproducible local checkpoint

- Consolidated contributor guides, requirements, asset retention, catalog diagnostics and the complete public experience/runtime into local checkpoints on `chore/checkpoint-base-20261106`.
- Preserved main and both stashes. Deferred 1,033 authoring/review files remain in place and match their original hashes; public runtime assets are versioned.
- Validated a reconstruction exported from Git without private environment configuration, reusing installed dependencies: strict lint, types, build and 377 tests passed; 15 tests remain skipped.
- Fixed a newline-sensitive migration test for Windows CRLF without changing SQL. No merge, push or deployment.
- Closed task 03; task 04 architecture transition design is next.

## 2026-11-06 - Task 02 lint cleanup complete

- Fixed all 25 lint errors and 28 warnings without changing ESLint rules or adding suppressions.
- Replaced effect-driven browser state copies with subscriptions, corrected visual state resets, cloned cached textures before configuration and accessed mutable debug scene objects through refs.
- Removed unused internal helpers and preserved poster resources with eager unoptimized Next Image rendering.
- Added four regression tests. Typecheck/build pass; full suite has 377 passed and 15 skipped; final focused regression has 20 passed.
- Preserved assets, functional business modules, HEAD, index and both stashes. Next is task 03; no commit or push.

## 2026-11-06 - Requirements contrast and task 01 inventory

- Recorded a 126-requirement contrast against the user-adopted specification and a prioritized checklist.
- Classified 1,101 pre-existing modified/untracked files into 12 groups, including asset authoring and review material deliberately deferred from runtime checkpoints.
- Created a local recovery archive outside the repository, verified each entry with SHA-256, exported both stash patches and verified a Git bundle.
- Preserved functional files, HEAD, index and both stashes; added an inventory with dependency constraints and checkpoint proposals. No commits or push were performed.
- Closed checklist task 01. Task 02, lint corrections, is next; Git consolidation remains task 03.

## 2026-09-09 - Product Reset Milestone 2C-B complete

- Added Jobicy's permitted public remote-tech API through the existing server-side SourceRegistry, global ingestion, neutral persistent catalog, public relevance and `/oportunidades`; visitors never call the API directly.
- The initial Europe/engineering source is bounded to 200 offers/run, preserves Jobicy attribution/canonical URLs, sanitizes descriptions to inert plain text and retains conservative geography.
- Local validation ingested 195 real offers, confirmed an idempotent 195-offer `UNCHANGED` reingestion with refreshed `last_seen_at`, and raised the fresh catalog to 2,597 offers. No RLS changes were made.
- Incremental Spain/remote results were Frontend +6, Full Stack +6, Data Engineer +2 and QA +1; Backend, Junior, DevOps and IT Support remained 0 under unchanged relevance.

## 2026-09-09 - Product Reset Milestone 2B complete

- Added server-only, global registered-board ingestion into the neutral persistent JobOffer catalog, reusing existing adapters, normalization, persistence and board health.
- Public `/oportunidades` now searches `ACTIVE` JobOffers seen in the prior 45 days and applies the existing public relevance/ranking logic without visitor-triggered adapter fan-out.
- Local validation ingested 2,256 offers across 4 providers and 21 boards; catalog-only public searches completed in approximately 160–230 ms. No migration was needed.
- Scheduling, lifecycle reconciliation, provider-vs-board source identity, coverage expansion, public relevance calibration and legacy UI cleanup remain separate follow-ups. Milestone 2C — Source Coverage Expansion is next.

## 2026-09-09 - Product Reset Milestone 2A complete

- Added a server-side Dynamic SourceRegistry backed by persisted `company_career_sources`, shared by public opportunities and private/live search.
- Reused 4 existing providers and 21 registered company boards, with board-level health, disabled-board omission, failure isolation and an explicit idempotent development seed. No migration was needed.
- Public search remains unauthenticated and does not expose service credentials, health internals or raw source errors.
- Recorded Source Coverage / Persistent Ingestion as the next priority and PUBLIC RELEVANCE CALIBRATION as a separate follow-up. Legacy UI cleanup remains deferred.

## 2026-09-09 - Product Reset Milestone 1A complete

- Added the public intent-first landing and unauthenticated real-opportunity search.
- Added conservative public-intent relevance, prudent query expansion and role/seniority/location/work-mode filtering without exposing personal compatibility.
- Public search uses existing Greenhouse, Ashby, SmartRecruiters and Lever adapters across 21 configured company boards; the list remains static and tech/international-biased.
- Auth is requested only for personalized candidacy preparation and preserves intent, selected offer and return target. CV/candidacy continuation remains later work.
- Recorded Dynamic SourceRegistry plus broader permitted source coverage as the next priority; legacy dashboard cleanup remains deferred.

## 2026-09-09 — Product Reset V2 checkpoint

- Adopted the official product direction: invisible complexity, visible outcomes; Oportunidades will become the primary user experience after a clean checkpoint.
- Reconciled local migration history for `20260909000100_phase9a9_professional_evidence.sql`; the migration is registered locally and remotely, with local Professional Evidence tables empty and protected by RLS/FORCE RLS.
- Committed Professional Evidence Bank foundation as `34981c2`.
- Recorded the remaining worktree as checkpoint work; no Product Reset feature implementation began.

## 2026-08-29 — Phase 3 complete

- Added a Next.js App Router application with Supabase SSR Auth, protected private routes, responsive UI, and server-side mutations.
- Added CandidateProfile management, versioned SearchProfile/JobPreferences editing, dashboard counts, and private Resume upload/version/approval management.
- Applied `20260829000300_phase3_minimal_web.sql` with minimal CandidateProfile fields and transactional owner-scoped search/approval RPCs.
- Passed 12 web tests, typecheck, lint, production build, remote A/B runtime SQL, schema lint, migration synchronization, and zero-residue verification.
- Refined the web UX into Spanish, natural-language questions and five short search sections; internal schedules, locations, statuses, seniority codes, contract codes, and advanced thresholds remain translated to the existing data model.

## 2026-08-29 — Phase 2 complete

- Designed tenant-owned, versioned Resume metadata and a private Supabase Storage bucket.
- Applied `20260829000200_phase2_private_resumes.sql` to the linked Supabase project.
- Runtime-validated PostgreSQL RLS, Storage RLS, tenant FKs, versioning, SHA-256 deduplication, private bucket constraints, generated paths, approval rotation, timestamps, and soft deletion with two synthetic users.
- Tests ended with `ROLLBACK`; post-checks found zero synthetic Auth users, profiles, candidate profiles, Resume rows, or Storage objects.
- Corrected two test-only issues: an RLS-filtered `INSERT ... SELECT` that tested zero rows instead of a forbidden object path, and direct Storage deletion requiring Supabase's transaction-local API deletion flag. The applied migration did not require correction.

## 2026-08-29 — Persistent project memory

- Added versioned context, state, roadmap, decisions, tasks, risks, metrics, and completed-phase records.
- Kept the project at `BEFORE_PHASE_2`; no functional implementation was changed.

## 2026-08-29 — Phase 1 complete

- Applied and runtime-validated `20260829000100_phase1_core_identity_search.sql` against the linked Supabase project.
- Verified core tables, trigger behavior under forced RLS, two-user isolation, cross-tenant foreign keys, constraints, runnable-search selection, and rollback cleanup.
- Expanded the Phase 1 runtime test coverage; the migration required no correction during remote validation.
- Historical note: commit `92dcfa4` for Phase 1 also included the already-planned deactivation of `workflows/generar-cv-adaptado.json`. The three remaining active legacy workflows were saved afterward in commit `3cac93d`. This is documentation only; Git history was not rewritten.

## 2026-08-29 — Phase 0 complete

- Disabled inherited workflow automation and validated all five workflow JSON documents and connection graphs.
- Left all legacy logic, credentials references, schedules, identifiers, and author-specific data otherwise unchanged.

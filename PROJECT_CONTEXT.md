# Project Context

## Product

This repository is evolving from personal n8n job-search workflows into a multi-user job-search product focused initially on Spain and remote work.

The official product direction is **invisible complexity, visible outcomes**: a user says what job they want, uploads a CV, and BuscaVacante performs the operational work. The product optimizes qualified interviews, not raw application volume.

## Current Target and Implementation Boundary

The user-adopted requirements specify PostgreSQL, a project-controlled backend, Better Auth and Tigris. The transition design is complete in `docs/architecture/TRANSITION_PLAN.md`, with a static dependency inventory in the same directory. The proposed backend remains modular server-side Next.js code; no separate HTTP framework is required.

This is a planned target, not the running implementation: Supabase Auth, RPC/Data API and Storage remain active in the current code. No production data, services or credentials were changed during task 04. UUID preservation, tenant authorization, verified file migration and rollback after target writes are mandatory design gates.

Tasks 01 to 05 are complete; PR #1 was merged into develop (5c16ffc). Task 06 is in progress: 06A/06B/06C are merged via PR #2/#3/#4, 06D matching merged via PR #6 (2e401df). 06E1 CV/evidence merged via PR #7 (8cb018e). 06F application persistence merged via PR #8 (72f66d0). 06E2 derived_resumes prepares the last table and complete application FK/guards (22/22), pending PR validation/review/merge. Next 06G contracts/import fixtures; table completion does not close task 06. See docs/WORK_PROCESS.md for remaining slices and acceptance gates; full import rehearsal 06H follows Better Auth/Tigris, so task 06 closure does not block starting 07/08 after import preparation 06G. Source identity remains task 14, scheduler/reconciliation task 15. Current production paths still use Supabase. Task 05 evidence: CI passed locally and on GitHub Actions; branch protections are enabled and verified on develop/main. PR #1 is merged into develop. develop permits author integration after Self Review and passing CI; main retains peer approval and has not been promoted. See `docs/ci-quality-gates.md`. The user requires work branches, PRs to `develop` using the repository template, and a later reviewed PR from `develop` to stable `main`. Commit types remain English with Spanish descriptions. Both stashes are preserved. Follow `docs/PRIORITY_CHECKLIST.md` before implementing the infrastructure transition.

## Existing Architecture Before Transition

- Supabase/PostgreSQL is the source of truth.
- Supabase Auth provides identity; application data extends `auth.users` through `public.profiles`.
- Row Level Security is mandatory for private multi-tenant data.
- A User can own multiple CandidateProfiles; each CandidateProfile can own multiple SearchProfiles.
- SearchProfile is the independently configurable and executable search unit.
- Search workflows must be generic and load active searches dynamically. There will be no workflow per user or per search.
- Collection produces neutral JobOffers. Candidate-specific evaluation happens later through JobMatch, which retains user, candidate-profile, and search-profile context.
- n8n is an automation engine, not the business-data store.
- CV files and private CV content must remain outside Git and outside workflow JSON. Private, versioned storage is the next approved phase.
- Google Sheets may be a temporary interface or staging surface, but is not a source of truth.
- An LLM must never be the sole authority for scoring gates or automatic-application safety decisions.
- Application modes may eventually be manual, semi-automatic, or automatic. Auto-apply requires deterministic safety gates, auditability, limits, duplicate protection, a global kill switch, per-portal controls, and manual review whenever there is doubt. It follows semi-auto and shadow mode.
- CandidateProfile, SearchProfile, JobPreferences, Professional Evidence Bank, Requirement Resolution, gap analysis, source adapters and detailed matching scores are internal infrastructure. Do not expose them as normal user configuration.
- The approved base CV is the quality floor. Derived CVs may only use truthful, verified evidence and must preserve or improve professional value.
- The user-facing MVP navigation target is Oportunidades, Candidaturas and Perfil.

## Historical Product Reset Boundary

Product Reset Milestone 2C-B is COMPLETE: Jobicy is a permitted public remote-tech source through the existing persistent catalog, scoped to Europe/engineering. Jobgether remains the first completed provider expansion. Emprego Galicia is BLOCKED / RESEARCH because its published official RSS returned HTTP 404 on direct verification; HTML scraping is not an acceptable substitute. Do not remove legacy UI until Oportunidades and candidacy fully replace it.

- Phase 0: COMPLETE.
- Phase 1: COMPLETE.
- Phase 2: COMPLETE.
- Phase 3: COMPLETE.
- The old `PRODUCT_RESET_WORKTREE_FREEZE` was superseded by task 03 checkpoint consolidation.
- This section records earlier milestones. The current task sequence and architecture target are defined above and in the priority checklist.

Detailed state and evidence live in [`docs/project-memory/`](docs/project-memory/).

## Non-Negotiable Safety Rules

- Never store secrets, access tokens, passwords, service-role keys, private CV content, or real personal test data in Git or project memory.
- Preserve strict user isolation and carry `user_id` and `candidate_profile_id` through every future user-specific automated action.
- The initial requirements exclude automatic external submission. Preserve manual control and do not enable auto-submit as part of infrastructure migration.
- Any ambiguity in an automatic submission must route the application to manual review.
- Legacy workflows remain disabled until deliberately adapted and revalidated.

## Codex Working Protocol

### BEFORE ANY IMPLEMENTATION

1. Read PROJECT_CONTEXT.md.
2. Read CURRENT_STATE.md.
3. Read ROADMAP.md.
4. Read TODO.md.
5. Read DECISIONS.md.
6. Read RISKS.md.
7. Read the current PHASE document.
8. Verify git status.
9. Do not start a new phase with a dirty worktree.
10. Never mark work COMPLETE without validation and a real-user UX check where applicable.

### AFTER ANY IMPLEMENTATION

1. Update CURRENT_STATE.md and TODO.md.
2. Update CHANGELOG.md and the current phase document when a milestone is completed.
3. Update RISKS.md when a new risk is discovered.
4. Update DECISIONS.md only if an actual architectural decision changes.
5. Record only verified facts.
6. Never write secrets, tokens, passwords or private CV content into memory.

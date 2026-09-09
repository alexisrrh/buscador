# Roadmap

## Milestone 1A - Intent-first public opportunities

Status: COMPLETE.

- Collect role intent plus optional location/work mode, search real public opportunities without auth, and gate auth only for personalized actions.
- Current public coverage is four providers (Greenhouse, Ashby, SmartRecruiters and Lever) across 21 configured company boards; it is static and not 21 portals.
- CV upload and candidacy continuation follow later.

## Milestone 2A - Dynamic SourceRegistry

Status: COMPLETE.

- Replaced the public static company-board list with the persisted `company_career_sources` registry, shared with live search.
- Reused board health and an explicit local development seed; no migration was required.

## Milestone 2B - Persistent opportunity catalog

Status: COMPLETE.

- Registered boards now ingest globally into neutral JobOffers and public catalog search does not perform visitor-triggered live fan-out.
- The catalog includes only `ACTIVE` offers seen in the last 45 days and preserves existing public relevance and ranking.
- Local validation: 4 providers, 21 boards, 2,256 received offers, and catalog-only public search around 160–230 ms.
- Scheduling, source lifecycle reconciliation, board-identity dedupe repair and new coverage remain out of scope.

## Next priority - Milestone 2C: Source Coverage Expansion

- Increase permitted Spain, Galicia, non-tech and Europe coverage while retaining global ingestion and catalog-first public search.
- Do not add a scheduler, repair source identity dedupe or redesign relevance inside this milestone.

### Milestone 2C-A - Jobgether

Status: COMPLETE.

- Integrated the documented public Jobgether API through the persistent catalog only, preserving its attribution and canonical listing URL.
- Emprego Galicia remains BLOCKED / RESEARCH after its official published RSS returned HTTP 404 on 2026-09-09; do not replace it with HTML scraping.
- Legacy UI cleanup is deferred until Oportunidades and candidacy fully replace the old flow: remove Automation Command Center, old Inicio/dashboard and Inicio navigation; replace Ofertas with Oportunidades; remove unconsumed legacy UI while preserving useful backend.

## Milestone 0 — Clean checkpoint

Status: COMPLETE.

- Reconcile and validate Phase 9A.9 migration history.
- Consolidate coherent checkpoint commits without `git add .`.
- Preserve deferred work explicitly and finish with a clean worktree.

## Milestone 1 — Intent-first onboarding

Start with: **¿Qué trabajo buscas?**

Collect only role intent plus optional location/work mode, then account creation and CV upload. Internally map that input to the existing profile/search/preference models. Land the user in Oportunidades.

## Milestone 2 — Multi-source Discovery Engine

- Query expansion constrained by role, CV, level, language and location.
- Source Registry, health, timeouts, partial failures and parallel adapters.
- More permitted ATS/career-page sources and controlled InfoJobs availability.
- Multi-signal dedupe and freshness policy.

Discovery candidates to research in priority order: Recruitee, Teamtailor, Personio, Workable, Workday, SuccessFactors, Jobvite, BambooHR, EURES, public/regional employment boards, and other permitted ATS career pages. LinkedIn and Indeed must use authorized methods only; protected scraping and anti-bot bypasses are out of scope.

## Milestone 3 — Opportunities experience

- Unified ranked offers.
- Simple compatibility percentage and 2–3 truthful reasons.
- Relevant review needs only.
- Real agent activity from persisted events, never simulated timers.

## Milestone 4 — Excellent manual application

- Offer-specific evidence selection and CV adaptation.
- Contextual yes/no confirmations only where automation cannot safely decide.
- User review, assisted apply where required, and clear tracking.

## Milestone 5 — Controlled auto apply

Only after source-specific support and validated controls: thresholds, user rules, mandatory evidence, valid CV, idempotency, limits, audit trail, kill switch and NEEDS ATTENTION routing.

Auto apply optimizes qualified interviews, never application volume.

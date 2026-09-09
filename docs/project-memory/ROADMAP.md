# Roadmap

## Milestone 0 — Clean checkpoint

Status: IN PROGRESS.

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

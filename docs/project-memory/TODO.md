# TODO

## 2026-11-06 Current prioritized work

Use `../PRIORITY_CHECKLIST.md` as the current sequence under the user-adopted requirements PDF. Older lists below are historical context and must be reconciled before reuse.

- [x] Task 01: classify and protect the local worktree; see `../worktree-inventory-2026-11-06.md`.
- [x] Task 02: lint has zero errors/warnings with unchanged rules; types/build pass and 377 tests pass, 15 skipped. See `../lint-cleanup-2026-11-06.md`.
- [x] Task 03: coherent local checkpoints on `chore/checkpoint-base-20261106`, reconstructed-tree validation and asset retention policy. Both stashes and main preserved; see `../checkpoint-baseline-2026-11-06.md`.
- [x] Task 04: architecture transition design and static dependency map complete. See `../architecture/TRANSITION_PLAN.md`; no runtime migration performed.
- [x] Task 05: CI local/Ubuntu and four 80% business thresholds verified; develop/main protections active and verified; PR #1 merged into develop; author Self Review and CI required in develop. main retains peer approval. See `../ci-quality-gates.md`.
- [ ] Task 06: 06A/06B/06C merged via PR #2/#3/#4. 06D matching merged via PR #6. 06E1 CV/evidence merged via PR #7. 06F applications merged via PR #8. 06E2 derived CVs prepares table 22/22 and the complete FK/guards, pending PR validation/review/merge. Next 06G import preparation; task 06 remains open. 06H full rehearsal requires tasks 07/08; do not block starting those tasks on full closure of 06. See ../WORK_PROCESS.md. Source identity remains task 14.
- [ ] Task 07 onward: continue identity/storage transition only with the corresponding acceptance gates.

## NOW - Source Coverage / Persistent Ingestion

- [x] Complete Product Reset Milestone 1A: intent-first public search and personalized-action auth gate.
- [x] Complete Product Reset Milestone 2A: replace the static 21-company-board public list with the persisted Dynamic SourceRegistry.
- [x] Design persisted ingestion/freshness reuse before expanding search coverage or adding hundreds of synchronous boards.
- [x] Complete Product Reset Milestone 2B: validate persistent public catalog search and prepare its independent checkpoint.
- [ ] Complete Milestone 2C: expand permitted Spain, Galicia, non-tech and Europe source coverage without changing the user flow.
- [x] Complete Milestone 2C-A: validate Jobgether API ingestion through the persistent catalog only.
- [x] Complete Milestone 2C-B: validate bounded Jobicy Europe/engineering ingestion through the persistent catalog only.
- [ ] Re-verify Emprego Galicia only if its official RSS/downloadable resource is restored; do not scrape its HTML search interface.
- [ ] Add scheduling and successful-run lifecycle reconciliation only after the catalog vertical slice is complete.
- [ ] Repair provider-vs-board source identity before aggressive board expansion.
- [ ] Add broader permitted coverage for Spain, Galicia and non-tech roles; activate InfoJobs only with application credentials.
- [ ] Add source health, latency, rate-limit/backoff and temporary-disable tracking.
- [ ] Extend canonical dedupe across ATS, career site and permitted portal origins.
- [ ] Evaluate Remote OK, Startup.jobs (ACCESS_REQUIRED), Get on Board and Arbeitnow as separate permitted tech-source candidates.
- [ ] PUBLIC RELEVANCE CALIBRATION: review seniority excess, Frontend versus Full Stack relevance, and explicit A Coruna versus Europe/Remote/multi-country location interpretation. Do not change this as part of SourceRegistry.

## DEFERRED - Legacy UI cleanup

Only when Oportunidades and candidacy completely replace the old flow:

- [ ] Remove Automation Command Center and old Inicio/dashboard.
- [ ] Remove Inicio navigation and replace Ofertas with Oportunidades.
- [ ] Remove unused legacy components/styles/routes while preserving useful backend.

## NOW — checkpoint only

- [x] Reconcile local Phase 9A.9 migration history without touching remote.
- [x] Commit Professional Evidence Bank foundation (`34981c2`).
- [ ] Classify, validate and commit or deliberately defer approved-CV bootstrap and normalization.
- [ ] Classify, validate and commit or deliberately defer Requirement Resolution and contextual confirmations.
- [ ] Classify, validate and commit or deliberately defer reference-template renderer and adaptation diagnostics.
- [ ] Resolve all remaining worktree changes before Product Reset implementation.

## NEXT — Product Reset

- [x] Complete Milestone 3A-1: preserve public offer context through auth and into the Resume handoff; do not add matching yet.
- [x] Complete Milestone 3A-2: contextual CV onboarding without matching or extraction.
- [ ] 3A-3: public offer to internal preparation bridge.
- [ ] 3A-4: candidature review.
- [ ] 3A-5: legacy navigation containment.
- [ ] Review Dashboard removal/simplification only as part of the Oportunidades experience.

## LATER

- [ ] Expand permitted multi-source discovery through a Source Registry.
- [ ] Build unified Opportunities ranking and real agent-event presentation.
- [ ] Complete manual application review and assisted apply tracking.
- [ ] Design controlled auto apply only after the manual flow is proven.
- [ ] Assess Professional Evidence table grants with a dedicated security migration.

## DO NOT BUILD YET

- Auto submission, browser automation, anti-bot bypasses, or protected-site scraping.
- Product Reset UI before the checkpoint worktree is clean.
- A public/technical Evidence Bank editor in the Profile flow.
- New source integrations without terms/access, adapter health, dedupe and failure handling.

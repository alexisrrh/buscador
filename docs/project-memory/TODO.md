# TODO

## NOW - Source Coverage / Persistent Ingestion

- [x] Complete Product Reset Milestone 1A: intent-first public search and personalized-action auth gate.
- [x] Complete Product Reset Milestone 2A: replace the static 21-company-board public list with the persisted Dynamic SourceRegistry.
- [x] Design persisted ingestion/freshness reuse before expanding search coverage or adding hundreds of synchronous boards.
- [x] Complete Product Reset Milestone 2B: validate persistent public catalog search and prepare its independent checkpoint.
- [ ] Complete Milestone 2C: expand permitted Spain, Galicia, non-tech and Europe source coverage without changing the user flow.
- [ ] Add scheduling and successful-run lifecycle reconciliation only after the catalog vertical slice is complete.
- [ ] Repair provider-vs-board source identity before aggressive board expansion.
- [ ] Add broader permitted coverage for Spain, Galicia and non-tech roles; activate InfoJobs only with application credentials.
- [ ] Add source health, latency, rate-limit/backoff and temporary-disable tracking.
- [ ] Extend canonical dedupe across ATS, career site and permitted portal origins.
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

- [ ] Implement one small, user-tested Intent-first onboarding phase.
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

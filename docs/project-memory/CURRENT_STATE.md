# Current State

Last verified: 2026-09-09.

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

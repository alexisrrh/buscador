# Current State

Last verified: 2026-08-29.

| Item | State |
| --- | --- |
| Phase 0 | COMPLETE |
| Phase 1 | COMPLETE |
| Phase 2 | COMPLETE |
| Phase 3 | COMPLETE |
| Current phase | `BEFORE_PHASE_4` |
| Next allowed phase | First neutral job source, only after explicit authorization |

## Verified Baseline

- All five legacy n8n workflows have `active=false`.
- The workflows remain functionally legacy and still contain inherited logic and author-specific data.
- The linked Supabase project has migration `20260829000100_phase1_core_identity_search.sql` applied.
- Runtime-verified tables are `public.profiles`, `public.candidate_profiles`, `public.search_profiles`, and `public.job_preferences`.
- The Auth profile trigger, forced RLS, tenant isolation, cross-tenant foreign keys, checks, soft deletion, and `runnable_search_profiles` behavior passed runtime tests.
- Runtime test data was rolled back; no synthetic users or domain rows persisted.
- Phase 2 migration `20260829000200_phase2_private_resumes.sql` is applied to the linked project.
- Runtime-verified Resume storage includes `public.resumes`, the private `private-resumes` bucket, forced PostgreSQL RLS, Storage object policies, versioning, tenant-scoped SHA-256 deduplication, and single active approval behavior.
- Phase 2 tests rolled back and post-checks found zero synthetic Auth users, profiles, candidate profiles, Resume rows, or Storage objects.
- Phase 3 migration `20260829000300_phase3_minimal_web.sql` is applied and synchronized remotely.
- The Next.js application implements email/password Auth, protected routes, dashboard, CandidateProfile CRUD, versioned SearchProfile/JobPreferences editing, and private Resume upload/approval.
- Phase 3 validation passed 12 web tests, typecheck, lint, production build, runtime SQL A/B tests, remote schema lint, and zero-residue checks.

## Current Boundary

Phase 3 is complete. The project is waiting before Phase 4; no job-source adapter or scraping implementation is currently started.

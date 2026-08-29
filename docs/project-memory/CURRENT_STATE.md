# Current State

Last verified: 2026-08-29.

| Item | State |
| --- | --- |
| Phase 0 | COMPLETE |
| Phase 1 | COMPLETE |
| Current phase | `BEFORE_PHASE_2` |
| Next allowed phase | Private/versioned resume storage |

## Verified Baseline

- All five legacy n8n workflows have `active=false`.
- The workflows remain functionally legacy and still contain inherited logic and author-specific data.
- The linked Supabase project has migration `20260829000100_phase1_core_identity_search.sql` applied.
- Runtime-verified tables are `public.profiles`, `public.candidate_profiles`, `public.search_profiles`, and `public.job_preferences`.
- The Auth profile trigger, forced RLS, tenant isolation, cross-tenant foreign keys, checks, soft deletion, and `runnable_search_profiles` behavior passed runtime tests.
- Runtime test data was rolled back; no synthetic users or domain rows persisted.

## Current Boundary

The project is between Phases 1 and 2. This documentation bank does not begin Phase 2 or modify functional code, existing SQL, Supabase configuration, or workflow behavior.

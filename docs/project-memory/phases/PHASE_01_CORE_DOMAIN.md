# Phase 01 — Core Multi-User Search Domain

**Status:** COMPLETE

**Verified:** 2026-08-29

## Objective

Establish the minimum Supabase/PostgreSQL domain for identity, multiple candidate profiles, independently executable search profiles, and versioned job preferences with database-enforced tenant isolation.

## Migration and Test

- Migration: `supabase/migrations/20260829000100_phase1_core_identity_search.sql`
- Runtime test: `supabase/tests/phase1_core_identity_search.sql`
- The migration was applied to the linked, dedicated Supabase project.
- Runtime tests execute inside a transaction and finish with `ROLLBACK`.

## Tables

- `public.profiles`: one-to-one application profile extending `auth.users`.
- `public.candidate_profiles`: multiple professional profiles per user.
- `public.search_profiles`: multiple independent searches per candidate profile and user.
- `public.job_preferences`: preference snapshot tied to a SearchProfile version.

All domain IDs are UUIDs. Timestamps use `timestamptz` and therefore represent absolute UTC instants.

## Relationships

- `profiles.id` references `auth.users.id`.
- `candidate_profiles.user_id` references `profiles.id`.
- Composite tenant foreign key `search_profiles(user_id, candidate_profile_id)` references `candidate_profiles(user_id, id)`.
- Composite tenant foreign key `job_preferences(user_id, candidate_profile_id, search_profile_id)` references `search_profiles(user_id, candidate_profile_id, id)`.

The composite relationships prevent a SearchProfile or JobPreferences row from crossing tenant ownership.

## Constraints and Execution Rules

- Search statuses are `DRAFT`, `ACTIVE`, `PAUSED`, `DISABLED`, and `ARCHIVED`.
- Frequency types are `INTERVAL`, `DAILY`, and `WEEKDAYS`.
- Scores are constrained to 0..100 and ordered `notification_min_score <= semi_auto_min_score <= auto_apply_min_score`.
- Daily application limit is non-negative.
- Versions are positive and JobPreferences cannot target a future SearchProfile version.
- Minimum experience cannot exceed maximum experience.
- Minimum salary cannot be negative.
- Currency values follow the migration's validated format.
- `public.runnable_search_profiles` exposes only searches where status is `ACTIVE`, `deleted_at IS NULL`, and `next_run_at <= now()`.

## RLS and Permissions

- RLS is enabled and forced on all four tables.
- Twelve owner-scoped policies cover SELECT, INSERT, and UPDATE.
- Policies derive ownership from authenticated identity rather than trusting arbitrary frontend `user_id` values.
- No DELETE policy exists and physical DELETE is revoked.
- Logical deletion is supported through `deleted_at` under owner-scoped UPDATE rules.

## Auth Trigger

The `auth.users` to `public.profiles` trigger was runtime-validated. Forced RLS does not prevent the internal profile creation path.

## Indexes

Nine explicit indexes cover tenant ownership, candidate-profile relationships, status, scheduling, and the partial active/due search path.

## Runtime Validation

Two synthetic authenticated users, A and B, verified that:

- Each user reads only their own data.
- Inserts forged with another user's ID are rejected.
- Cross-user updates affect no rows.
- Physical deletes are rejected; soft deletes are allowed.
- Cross-tenant CandidateProfile/SearchProfile and JobPreferences relationships are rejected by the expected RLS or foreign-key control.
- Invalid scores, score ordering, limits, versions, experience ranges, salary, currency, and future preference versions fail for the expected constraint.
- Runnable-search selection excludes future, paused, deleted, and unscheduled rows and preserves user isolation.

Catalog inspection confirmed four tables with forced RLS, twelve policies, four foreign keys, sixteen check constraints, the active Auth trigger, and the runnable view.

## Corrections During Validation

- The runtime test file was expanded to cover previously missing negative cases and produce a verification summary.
- The migration itself required no correction during remote runtime validation.

## Cleanup and Result

Tests ended with `ROLLBACK`. Post-test checks found zero synthetic rows in `auth.users`, `profiles`, `candidate_profiles`, `search_profiles`, and `job_preferences`.

Phase 1 is complete. Phase 2 has not started.

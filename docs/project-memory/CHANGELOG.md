# Project Changelog

This file records verified project-level milestones. It does not replace Git history.

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

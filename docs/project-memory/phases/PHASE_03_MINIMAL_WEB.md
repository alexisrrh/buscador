# Phase 03 — Minimal Web / API

**Status:** COMPLETE

**Started:** 2026-08-29

**Verified:** 2026-08-29

## Objective

Provide the first multi-user web interface for registration/login and management of CandidateProfiles, SearchProfiles, JobPreferences, and private versioned Resumes without editing code, SQL, or n8n workflows.

## Stack

- Next.js 16 App Router and React 19.
- TypeScript 6.
- Supabase JS plus Supabase SSR cookie integration.
- Server Components for reads, Server Actions for mutations, and a browser Supabase client only for private file upload.
- Handwritten responsive CSS and accessible native controls; no Tailwind, UI framework, ORM, admin SDK, or separate backend.
- Vitest, jsdom, and Testing Library for web tests.

## Auth and Tenancy

- Email/password registration, login, logout, and session restoration use Supabase Auth.
- `proxy.ts` refreshes sessions and redirects anonymous private-route requests.
- The private layout verifies `getUser()` again server-side.
- Server Actions derive `user_id` from the authenticated session; URL IDs are additionally filtered by owner where relevant.
- PostgreSQL and Storage RLS remain the definitive tenant boundary. No service-role key exists in the web application.

## Surfaces

- Public: `/login`, `/register`.
- Private: `/dashboard`, `/profiles`, `/profiles/new`, `/profiles/[id]`, `/searches`, `/searches/new`, `/searches/[id]`, `/resumes`.
- Dashboard displays only current profile, active-search, Resume, approved-Resume, and next-scheduled-search data.
- No offers, matches, interviews, generated metrics, scraping, messaging, AI, or application automation were added.

## User Experience

- All user-facing navigation, states, actions, help text, and form questions are presented in Spanish.
- CandidateProfile setup asks how the user wants to present themselves, their work area, and their experience level without exposing domain field names.
- Search setup is a five-section questionnaire covering the desired role, location/work style, experience/salary, skills/conditions, and search frequency.
- Friendly frequency choices are translated to existing `frequency_type` and `frequency_value` values.
- Location answers are translated to the existing structured JSON representation without exposing JSON.
- One understandable experience answer maps to the existing minimum/maximum experience fields.
- Internal status, seniority, work-mode, contract, and language codes are displayed as human-readable Spanish labels.
- Semi-automatic and automatic thresholds remain hidden with safe existing values. Only the notification threshold and timezone appear in a collapsed advanced section, which explicitly states that applications remain manual.
- Profile, search, and Resume pages provide an explicit three-step path without a wizard dependency.
- Resume upload does not expose Storage, MIME, hashes, buckets, or generated paths to the user.

## Database API

Migration `20260829000300_phase3_minimal_web.sql`:

- Adds nullable, bounded `headline`, `job_family`, and `seniority` fields to CandidateProfile. Visible status is derived from `deleted_at`.
- Adds `save_search_profile`, a security-invoker transaction that creates or versions SearchProfile and its JobPreferences snapshot atomically under `auth.uid()`.
- Adds `approve_resume`, a security-invoker transaction that archives the prior approved Resume and approves the selected owner-visible version atomically.
- Adds a limited JSONB-to-text-array helper used by the search RPC.

## Resume Upload Protocol

1. Browser validates PDF/DOCX extension, declared MIME, non-zero size, 10 MiB limit, and filename.
2. Browser calculates SHA-256 locally.
3. Authenticated Server Action validates again, verifies CandidateProfile ownership, checks duplicates, and creates `PROCESSING` metadata.
4. PostgreSQL returns the generated private Storage path.
5. Browser uploads directly to `private-resumes` using its authenticated session.
6. Server Action moves metadata to `READY`; upload failure moves it to `REJECTED`.

No distributed transaction is claimed. If object upload succeeds but final status update fails, linked metadata remains `PROCESSING` for reconciliation; signed URLs are neither generated nor stored.

## Validation

- TypeScript typecheck passed.
- ESLint passed with no warnings in the final run.
- Four Vitest suites passed after the UX refinement: 13/13 tests.
- Tests cover private-route auth guard, CandidateProfile/Search forms, score constraints, valid private upload coordination, invalid MIME, size above 10 MiB, path-like filenames, and shared input parsing.
- Production build passed and emitted only the required routes.
- Linked migration preflight and dry-run showed only Phase 3 pending and no destructive SQL.
- Phase 3 migration applied successfully.
- Runtime SQL A/B test validated CandidateProfile fields, atomic search creation, versioned preference edits, atomic Resume approval rotation, and cross-tenant RPC blocking.
- Runtime SQL ended with `ROLLBACK`; a separate check found zero synthetic Auth, CandidateProfile, SearchProfile, JobPreferences, or Resume rows.
- Remote schema lint found no errors and migration history is synchronized through Phase 3.

## Corrections During Validation

- Downgraded TypeScript 7 to 6.0.3 and ESLint 10 to 9.39.5 to satisfy the actual peer ranges of Next 16 tooling.
- Fixed a Server Action redirect that could be caught as an error.
- Corrected the Vitest Windows alias and ESM configuration.
- Associated the CandidateProfile status label with its control after an accessibility test failure.
- Read `HTMLInputElement.files[0]` directly during upload rather than relying on FormData file reconstruction.
- The Phase 3 migration required no correction after remote application.

## Operational Follow-up

Deployment requires only `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY`. Email delivery and redirect URLs require an environment-specific Supabase Auth smoke test; no deployment secrets belong in Git.

## Result

Phase 3 is complete. Phase 4 has not started.

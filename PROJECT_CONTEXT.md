# Project Context

## Product

This repository is evolving from a set of personal n8n job-search workflows into a multi-user, SaaS-ready job-search application focused initially on Spain and remote work.

The product must help users define independent searches, collect candidate-neutral job offers, match them against professional profiles, review the best opportunities, and prepare applications under explicit user control. Its primary outcome is qualified interviews, not raw application volume.

## Approved Architecture

- Supabase/PostgreSQL is the source of truth.
- Supabase Auth provides identity; application data extends `auth.users` through `public.profiles`.
- Row Level Security is mandatory for private multi-tenant data.
- A User can own multiple CandidateProfiles; each CandidateProfile can own multiple SearchProfiles.
- SearchProfile is the independently configurable and executable search unit.
- Search workflows must be generic and load active searches dynamically. There will be no workflow per user or per search.
- Collection produces neutral JobOffers. Candidate-specific evaluation happens later through JobMatch, which retains user, candidate-profile, and search-profile context.
- n8n is an automation engine, not the business-data store.
- CV files and private CV content must remain outside Git and outside workflow JSON. Private, versioned storage is the next approved phase.
- Google Sheets may be a temporary interface or staging surface, but is not a source of truth.
- An LLM must never be the sole authority for scoring gates or automatic-application safety decisions.
- Application modes may eventually be manual, semi-automatic, or automatic. Auto-apply requires deterministic safety gates, auditability, limits, duplicate protection, a global kill switch, per-portal controls, and manual review whenever there is doubt. It follows semi-auto and shadow mode.

## Current Boundary

- Phase 0: COMPLETE.
- Phase 1: COMPLETE.
- Phase 2: COMPLETE.
- Current state: `BEFORE_PHASE_3`.
- Next allowed phase: minimal web/API, only after explicit authorization.
- No Phase 3 implementation has started.

Detailed state and evidence live in [`docs/project-memory/`](docs/project-memory/).

## Non-Negotiable Safety Rules

- Never store secrets, access tokens, passwords, service-role keys, private CV content, or real personal test data in Git or project memory.
- Preserve strict user isolation and carry `user_id` and `candidate_profile_id` through every future user-specific automated action.
- Never submit an application automatically unless the configured mode and all deterministic safety and quality rules explicitly permit it.
- Any ambiguity in an automatic submission must route the application to manual review.
- Legacy workflows remain disabled until deliberately adapted and revalidated.

## Codex Working Protocol

### BEFORE ANY IMPLEMENTATION

1. Read PROJECT_CONTEXT.md.
2. Read CURRENT_STATE.md.
3. Read ROADMAP.md.
4. Read TODO.md.
5. Read DECISIONS.md.
6. Read RISKS.md.
7. Read the current PHASE document.
8. Verify git status.
9. Never skip phases.
10. Never mark work COMPLETE without validation.

### AFTER ANY IMPLEMENTATION

1. Update CURRENT_STATE.md.
2. Update TODO.md.
3. Update CHANGELOG.md.
4. Update the current phase document.
5. Update RISKS.md when a new risk is discovered.
6. Update DECISIONS.md only if an actual architectural decision changes.
7. Record only verified facts.
8. Never write secrets, tokens, passwords or private CV content into memory.

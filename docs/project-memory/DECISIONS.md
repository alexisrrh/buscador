# Architectural Decisions

Decisions here are approved defaults. Reopen one only when new verified evidence or a product requirement makes that necessary.

| ID | Origin | Decision | Rationale / consequence |
| --- | --- | --- | --- |
| ADR-001 | Product architecture | Build SaaS-ready from the MVP, even while one initial user is the test case. | Personal values cannot be embedded in code or workflows. |
| ADR-002 | Phase 1 | Supabase/PostgreSQL is the source of truth. | Business state must not live primarily in n8n or Sheets. |
| ADR-003 | Phase 1 | Supabase Auth owns authentication; `public.profiles` extends `auth.users`. | Avoid duplicating identity and authentication. |
| ADR-004 | Phase 1 | Apply RLS, including forced RLS, to private tenant tables. | Tenant isolation is enforced in the database, not trusted to frontend input. |
| ADR-005 | Phase 1 | Model User -> CandidateProfile -> SearchProfile, with multiple children at each level. | Users can maintain distinct careers and independent searches. |
| ADR-006 | Phase 1 | SearchProfile is the executable search unit and owns versioned JobPreferences. | Search configuration remains independent and reproducible. |
| ADR-007 | Product architecture | Use generic workflows that dynamically load enabled searches. | No workflow per user, profile, or search; no personal keywords or locations in n8n JSON. |
| ADR-008 | Product architecture | JobOffer is candidate-neutral; matching occurs afterward in JobMatch. | The same offer can receive different scores for different users/profiles/searches. |
| ADR-009 | Product architecture | Every user-specific automated action retains `user_id` and `candidate_profile_id`; search-derived actions also retain `search_profile_id`. | End-to-end authorization and auditability. |
| ADR-010 | Product architecture | n8n is an automation/orchestration engine, not business storage. | Durable state belongs in PostgreSQL. |
| ADR-011 | Product architecture | Google Sheets is temporary staging/UI only, never the source of truth. | Prevent divergent state and weak tenant isolation. |
| ADR-012 | Phase 2 boundary | CV files and private CV content never live in Git or workflow JSON. | They require private storage, authorization, and versioning. |
| ADR-013 | Matching architecture | An LLM is not the sole authority for scoring or safety gates. | Deterministic checks must constrain probabilistic output. |
| ADR-014 | Application architecture | Support manual, semi-automatic, and eventually automatic modes. | Automation remains explicit and progressively validated. |
| ADR-015 | Application architecture | Auto-apply follows semi-auto and shadow mode. | Production submission is deferred until quality and safety are measured. |
| ADR-016 | Application architecture | Auto-apply needs configurable score/location/salary/profile/completeness gates, duplicate protection, daily limits, audit history, per-portal controls, and a global kill switch. Any doubt routes to manual review. | Prevent unsupported, unsafe, or repeated submissions. |
| ADR-017 | Product objective | Optimize qualified interviews per application, not the number of applications. | Product decisions must favor relevance and outcomes over volume. |
| ADR-018 | Phase process | Work advances through small, reversible, validated phases. | Limits blast radius and keeps the repository recoverable. |
| ADR-019 | Phase 2 | Store Resume metadata in PostgreSQL and file bytes in a fixed private Supabase Storage bucket. | PostgreSQL ownership is authoritative; no public permanent Resume URLs. |
| ADR-020 | Phase 2 | Generate immutable object paths from tenant, profile, Resume, version, and MIME metadata. | Original filenames are never identity or authorization inputs. |
| ADR-021 | Phase 2 | Deduplicate exact Resume content by user plus CandidateProfile plus SHA-256. | Different tenants and different professional profiles may legitimately reuse identical files. |
| ADR-022 | Phase 2 | Treat the sole non-deleted `APPROVED` Resume as the active version for the MVP. | A partial unique index is simpler and safer than a separate mutable current pointer. |
| ADR-023 | Phase 2 | Limit Resume uploads to declared PDF/DOCX content between 1 byte and 10 MiB. | Bounds storage abuse while deferring signature verification and malware scanning. |
| ADR-024 | Phase 3 | Use Next.js App Router, TypeScript, Supabase SSR, Server Components, and Server Actions without a separate backend. | Keeps Auth cookies server-aware while relying on the existing RLS-protected data API. |
| ADR-025 | Phase 3 | Use custom responsive CSS and native controls instead of Tailwind or a UI framework. | Meets current UX/accessibility needs with fewer dependencies. |
| ADR-026 | Phase 3 | Save SearchProfile and versioned JobPreferences through one security-invoker PostgreSQL transaction. | Prevents partial versions without introducing an application backend or service-role key. |
| ADR-027 | Phase 3 | Rotate approved Resumes through an owner-scoped transactional RPC. | Preserves the one-approved invariant without a two-request race. |
| ADR-028 | Phase 3 | Upload Resume bytes directly from the authenticated browser after server-side metadata preparation. | Avoids proxying private files through Next while Storage RLS and generated paths remain authoritative. |

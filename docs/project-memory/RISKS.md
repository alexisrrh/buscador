# Risk Register

## 2026-11-06 Integración y repositorio

- Protecciones de develop/main activadas y verificadas el 6 de noviembre: Quality gate y revisión obligatorios, sin bypass de administrador. El PR #1 sigue bloqueado hasta revisión humana; no intentar suplirla con autoaprobación. El acceso administrativo se resolvió mediante la sesión de Git existente.
- Remoto público verificado; contradice Git privado en RT-12. No se cambió visibilidad.
- npm install informó 18 vulnerabilidades (11 moderadas, 6 altas, 1 crítica); no se atribuyen al nuevo complemento sin análisis ni se aplican actualizaciones indiscriminadas. Revisar en tarea 26 antes de publicación.
- Cobertura agregada de 22 módulos no equivale a cobertura total; las 15 pruebas omitidas no acreditan servicios reales.

## Architecture transition design risks recorded on 2026-11-06

| Risk | Required gate before implementation/cutover |
| --- | --- |
| Loss of user ownership during identity replacement | Preserve UUIDs, verify FK reconciliation and account state; abort collisions rather than auto-link by email. |
| Imported users cannot recover access | Rehearse credential creation/reset, email delivery, expiry and revocation on synthetic imported accounts before any production cutover. |
| Tenant context leaks through pooled connections | One client and transaction with local context; runtime without ownership/BYPASSRLS; A/B, exception and concurrency tests. |
| Cached session remains usable after global logout | Start with database sessions without cookieCache; prove next-request revocation and account-state checks. |
| Presigned upload overwrites bytes after validation | Client only writes staging. Final object receives the same verified bytes under backend-only key; test replay and duplicate finalization. |
| A valid file is lost or reported ready after partial failure | Metadata states, bounded verification, SHA-256 and idempotent reconciliation; no network calls inside long SQL transactions. |
| Cutback loses target writes, users or objects | Freeze writes and reconcile journal, credentials and object/tombstone delta; rehearse both cutover stages. No blind rollback after target writes. |
| Legacy bootstrap labels extracted evidence as confirmed | Preserve historical snapshots but require reconfirmation provenance for future use; do not promote imported VERIFIED labels automatically. |
| External storage, database and email details remain untested | Select provider/region/configuration before provisioning and validate contracts in isolated environments; this design is not operational acceptance. |

Design and execution gates: `../architecture/TRANSITION_PLAN.md`. Older risk entries below describe the existing implementation and remain applicable until verified replacement.

| Static public source list is tech/international-biased | Known Milestone 1A limitation: 21 configured company boards across four providers, not 21 portals; Spain/non-tech discovery is insufficient. | Build Dynamic SourceRegistry, permitted broader coverage and source health before claiming comprehensive opportunities. |
| Coverage for local and non-tech roles is insufficient | Manual checks returned 0 for Enfermera + A Coruna + Hibrido and Mozo de almacen + A Coruna + Cualquier modalidad. | Design persistent ingestion/freshness reuse, then add permitted Spain/Galicia and non-tech sources incrementally. |
| Public relevance needs calibration | Frontend + A Coruna + Cualquier modalidad returned Full Stack Developer and Senior / Staff Fullstack Engineer. | Separately review seniority, role-family and explicit-location gates; do not weaken the current anti-irrelevance protections opportunistically. |
| Persistent catalog has no scheduler or reconciliation yet | 2B can ingest locally but does not yet schedule runs or expire offers absent after successful board snapshots. | Add controlled scheduling, per-board successful-run markers and lifecycle reconciliation in a later dedicated phase. |
| Source identity is provider-scoped instead of board-scoped | `job_offer_sources` dedupe uses provider `job_source_id`; duplicate external IDs across boards of one provider can collide. | Repair board identity before aggressive source growth; do not rely on this model for broad multi-board ingestion unchanged. |
| Emprego Galicia official RSS is unavailable | Its Open Data catalogue published RSS URL returned HTTP 404 during 2026-09-09 verification. | Keep it BLOCKED / RESEARCH; re-verify only when an official downloadable resource is restored. |
| Jobgether is an aggregator rather than the original apply host | The verified public API returns its own Jobgether listing URL, not an external application URL. | Preserve attribution and canonical Jobgether URL; do not imply a direct employer apply link or solve cross-source semantic dedupe in 2C-A. |
| Jobicy remote geography is broad | Its remote API can return Europe, Worldwide or multi-country eligibility, which is not equivalent to Spain. | Preserve the provider geography and let existing conservative public location rules decide; do not infer Spain eligibility. |
| Jobicy fair-use polling limit needs a scheduler policy | The verified API guidance says automated checks must not run more than hourly; no scheduler exists yet. | Keep controlled ingestion bounded to one request/run and enforce per-source cadence when scheduling is added. |
| Full catalog evaluation will not scale indefinitely | Correct pagination now evaluates every fresh candidate, but deterministic relevance currently runs in-process over the full fresh catalog. | Before large catalog growth, add indexed/coarse DB candidate retrieval without reintroducing incomplete first-page behavior. |

| Risk | Current state | Required treatment |
| --- | --- | --- |
| Author personal data remains in legacy workflows | Open; workflows are disabled but retain inherited content. | Inventory and remove or externalize it only in an approved later phase. |
| Author data remains recoverable from Git history | Open. | Treat repository/history access as sensitive; plan deliberate secret/PII remediation without rewriting history casually. |
| Fragile scraping selectors and portal markup | Future implementation risk. | Isolate source adapters, add contract/fixture tests, health checks, and failure quarantine. |
| Prompt injection in job descriptions or external content | Future AI risk. | Treat fetched content as untrusted data; separate instructions from content and enforce deterministic gates. |
| SSRF through fetched links or source-provided URLs | Future ingestion risk. | Restrict schemes/hosts, resolve and validate destinations, block private networks, and constrain egress. |
| Portal rate limits, bot detection, and account/IP blocks | Future source risk. | Apply per-source throttling, backoff, quotas, monitoring, and terms-of-service review. |
| Legacy deduplication based mainly on URL | Known design weakness. | Introduce neutral offer identity and multi-signal deduplication before application automation. |
| Future logs may expose PII or CV content | Open design risk. | Redact by default, limit payload logging, define retention, and control access. |
| Auto-apply can submit incorrect or unsupported applications | Deferred high-impact risk. | Require semi-auto, shadow validation, hard gates, idempotency, daily limits, audit, portal controls, kill switch, and manual fallback. |
| Cross-user data leakage | Critical multi-tenant risk; Phase 1 and Phase 2 controls are runtime-validated for current private tables and Resume objects. | Preserve RLS, composite tenant FKs, tenant-context propagation, and adversarial isolation tests for every new private entity. |
| Credential leakage or unsafe credential handling | Ongoing operational risk. | Keep secrets outside Git/docs/workflows, use scoped secret storage, rotate exposed credentials, and minimize privileges. |
| Dependence on external portals, APIs, Supabase, n8n, LLMs, and notification services | Ongoing availability/change risk. | Encapsulate integrations, make retries idempotent, monitor failures, and support graceful degradation. |
| LLM hallucination or invented candidate facts | Future generation risk. | Generate only from approved structured facts, cite provenance internally, and require validation/approval. |
| Duplicate applications | Future application risk. | Enforce database idempotency and portal-aware application history before any submission mode. |
| Declared Resume MIME may not match file content | Open Phase 2 risk. Database and bucket allowlists validate declared metadata, not file signatures. | Add server-side magic-byte/content validation before treating an upload as READY. |
| Malware or active content in uploaded resumes | Deferred Phase 2 risk. | Add quarantined upload and malware scanning before broader processing or sharing. |
| Resume object/metadata inconsistency | Open operational risk. Metadata is created before the object and cleanup can fail. | Use existing upload states, idempotent reconciliation, and monitored orphan cleanup in the future API/workflow. |
| Signed Resume URLs may leak through logs or referrers | Open Phase 2 operational risk. The bucket is private but temporary URLs are bearer credentials. | Use short expiry, never persist URLs, redact logs, and avoid third-party referrers. |
| Resume upload spans PostgreSQL and Storage without a distributed transaction | Controlled Phase 3 risk. Metadata states make partial completion visible but do not reconcile automatically. | Add idempotent reconciliation for `PROCESSING`/`REJECTED` metadata before upload volume grows. |
| Browser SHA-256 can consume noticeable CPU/memory on weaker devices | Bounded Phase 3 risk because files are limited to 10 MiB. | Monitor UX; move hashing to a worker only if measurements justify it. |
| Supabase Auth email/redirect configuration differs by deployment | Open operational risk. Code and route guards are tested, but delivery depends on project SMTP and allowed URLs. | Smoke-test signup confirmation, cookies, logout, and redirect URLs in each deployed environment. |
| Raw database integration errors may reveal implementation details to authenticated users | Open Phase 3 hardening risk. React escapes output, preventing direct HTML injection. | Map expected database errors to stable user messages before public launch. |
| Professional Evidence table grants exceed intended CRUD grants | Known follow-up. `authenticated` has effective REFERENCES/TRIGGER/TRUNCATE grants in addition to CRUD. | Assess and, if warranted, revoke only through a dedicated additive migration after validating Supabase role defaults and runtime behavior. |
| Product Reset can discard validated backend behavior | Current transition risk. | Reuse internal models and safety gates; change user experience incrementally after a clean checkpoint. |
| Multi-source discovery can become brittle or non-compliant | Central future product risk. | Add sources only through permitted/documented access, source isolation, health checks, throttling, partial failure and canonical dedupe. |

Risks are not permission to implement later phases early. Update this register when evidence changes or a new risk is discovered.

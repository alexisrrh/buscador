# Risk Register

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

Risks are not permission to implement later phases early. Update this register when evidence changes or a new risk is discovered.

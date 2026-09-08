# Preparación de Canonical — diagnóstico y fix

Verificado el 2026-09-08 contra Supabase remoto y el servidor Next.js local existente. No se modificó código hasta reproducir el primer error en el módulo real compilado por Turbopack.

## Causas demostradas

1. `extractResume`, `lib/applications/resume-extractor.server.ts:17`: `parser.getText()` lanzaba un `Error` sin propiedad `code`: `Setting up fake worker failed: "Cannot find module '…/.next/dev/server/chunks/ssr/pdf.worker.mjs' …"`. Turbopack empaquetaba PDF.js y cambiaba la base de resolución de su worker. El mismo PDF, importando pdf-parse directamente en Node, sí producía texto.
2. Tras externalizar pdf-parse, la Server Action alcanzó `ApplicationDraftRepository.saveExtraction`, `lib/applications/repository.server.ts:38–47`. PostgreSQL devolvió `22P05`, `unsupported Unicode escape sequence`: el texto contenía seis caracteres NUL (U+0000), incompatibles con text/jsonb. El código anterior habría lanzado `Error("RESUME_EXTRACTION_WRITE_FAILED:22P05")`; la nueva clasificación mostró `DRAFT_PERSISTENCE_FAILED`, etapa `extraction-cache-write`, conservando la causa original.

La captura anterior de `prepareApplication` convertía ambos errores no tipados en el mismo mensaje público genérico sin registrarlos.

## Traza y comprobaciones remotas

`/jobs` → formulario con `job_match_id` → `prepareApplication` → sesión autenticada → `prepareApplicationDraft` → JobMatch → CandidateProfile / Resume APPROVED / JobOffer → cliente server-side → búsqueda de draft existente → caché de extracción → descarga → extracción → persistencia de extracción → JobAnalysis → CandidateEvidence → gaps → evidence-based-v1 → validación → insert en application_drafts → redirect.

- Web Developer / Canonical / GREENHOUSE, score 79 y ELIGIBLE; oferta ACTIVE.
- Perfil y búsqueda correctos; búsqueda ACTIVE; CV APPROVED, deleted_at NULL.
- Objeto privado existente, PDF descargado de 198.295 bytes, cabecera `%PDF-`, una página y texto no vacío.
- Historial remoto confirma `20260902000100`. Dump del schema real y OpenAPI confirman application_drafts, resume_extractions, ambas RPCs Phase 7, FORCE RLS y permisos de lectura propia/escritura service_role.
- Una transacción remota READ ONLY bajo rol authenticated y auth.uid del usuario confirmó acceso a perfil, búsqueda, match, oferta, CV y storage. No existían drafts ni extracciones anteriores para el caso; no había conflicto de idempotencia.
- evidence-based-v1 funciona sin API key externa; generación y validación pasan.

## Fix

- `next.config.ts`: pdf-parse y canvas externos; tracing explícito del worker y los binarios canvas para producción. Referencias: [Next.js serverExternalPackages](https://nextjs.org/docs/app/api-reference/config/next-config-js/serverExternalPackages), [pdf-parse troubleshooting](https://github.com/mehmet-kozan/pdf-parse/blob/main/docs/troubleshooting.md).
- Extracción: reemplazar NUL por espacio antes de estructurar el texto. Conserva límites entre palabras; no modifica el PDF original.
- Errores públicos diferenciados y logs JSON con código, etapa, clase y código de la causa. No incluyen texto del CV, tokens, URLs privadas, mensajes SQL ni stack traces.
- Sin migración, cambios de proveedor, aprobaciones automáticas, DerivedResume ni envíos.

## Caso real después del fix

Se ejecutó el formulario real mediante HTTP y una sesión diagnóstica temporal del usuario, sin enviar email ni cambiar contraseñas. La sesión diagnóstica se cerró al finalizar.

- POST /jobs → 303 `/applications/drafts/c748fdf5-0e8d-40b7-83fd-648150966c35`.
- GET del draft → 200, análisis, gaps, adaptación y recruiter message visibles.
- Estado: READY_FOR_REVIEW. Fuente: `f1324cca-3b61-43cb-872d-2b6a1126a2cf`; oferta: `db6cf8bb-2e82-4aac-8319-c0174ff14f7c`.
- Segundo POST reutilizó exactamente el mismo ID; no creó duplicados ni DerivedResume.

## Regresión

- 153 tests unitarios PASS; 8 opcionales omitidos en la suite general.
- 10 tests específicos de errores y NUL incluidos en la suite.
- `node scripts/check-resume-next-runtime.mjs`: PASS con PDF sintético y módulo real de Next.js dev. Ejecutar después de abrir /jobs en next dev; este test reproduce la resolución del worker que Vitest por sí solo no cubre.
- SQL Phase 7, 8, 9A: PASS en base local limpia. El primer intento de Phase 8 detectó fixtures sintéticos anteriores por sus conteos globales; se verificó que solo había dos usuarios sintéticos y se reinició exclusivamente Supabase local antes de repetir.
- Integración local Phase 9A: PASS.
- Typecheck, lint y build: PASS; el trace de producción incluye pdf.worker.mjs y canvas nativo.
- Sin commit ni push. No se desplegó código a un hosting remoto en esta intervención.

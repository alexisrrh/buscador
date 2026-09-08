# Phase 9A — CV derivados

La generación usa un ApplicationDraft APPROVED y vuelve a extraer el archivo original APPROVED. Comprueba tamaño y SHA-256 del original, reconstruye CandidateEvidence y ejecuta la validación de Phase 7 antes de renderizar. No llama a un LLM. Una adaptación inválida deja un registro FAILED / INVALID_ADAPTATION sin archivo.

`derived_resumes` conserva usuario, perfil, draft, oferta y CV fuente mediante una FK compuesta. Estados: GENERATING, READY, FAILED, ARCHIVED. Cada render recibe un UUID y una ruta nuevos. READY es inmutable; solo admite archivo lógico. El bucket privado `derived-resumes` no concede acceso directo al cliente. El servidor autoriza la descarga con la sesión del usuario y verifica hash y tamaño. Los triggers impiden overwrite y borrado de los objetos derivados.

`applications.derived_resume_id` es nullable y mantiene `resume_id` como CV fuente. El usuario selecciona explícitamente un READY en una postulación preparada. Regenerar no cambia esa selección. Una vez iniciados los intentos de postulación, no se puede cambiar el archivo elegido. Un futuro conector debe cargar esa referencia, exigir READY y verificar la integridad antes de adjuntar.

El renderer `resume-renderer-v1` usa pdfmake 0.2.20 en Node, con Roboto embebida: A4, una columna, márgenes de 40–45 puntos, texto de 10 puntos, headings de 12, sin iconos, gráficos ni tablas. Usa el título profesional acreditado y presenta la oferta como destino, sin atribuir al candidato el cargo de la oferta. Conserva el orden original de empresas/cargos/fechas/estudios; prioriza las skills y usa el resumen validado. Solo toma contacto ya incluido en el encabezado del CV. Incluye proyectos, certificados e idiomas cuando el extractor reconoce esas secciones. La vista previa y el PDF comparten el mismo contenido estructurado; cada READY guarda su snapshot. Se comprueba que el texto esperado permanezca extraíble del PDF.

PDF implementado. DOCX reservado en el modelo pero rechazado por el servicio v1; no requiere LibreOffice. Dependencias y fuentes exclusivamente server-side. Referencia del renderer: https://pdfmake.github.io/docs/0.1/getting-started/server-side/

## Validación realizada (2026-09-08)

- `supabase db reset --local`: PASS con todas las migraciones, incluida 9A.
- 15 archivos SQL: PASS (Phase 1–8, 9A y regresión de activación).
- Suite unitaria: 143 PASS; 8 tests opcionales omitidos en la ejecución general.
- Integración 9A local ejecutada aparte: PASS. Usuarios y CV sintéticos; PDFs reales en storage privado, aislamiento entre usuarios, hash, original intacto, overwrite rechazado, regeneración y selección estable, INVALID_ADAPTATION sin objeto y STORAGE_FAILED.
- Typecheck, lint y build: PASS. Se externaliza pdfmake para conservar los recursos de fontkit en el build Node.
- Comprobación del secreto service-role en `.next/static`: PASS.
- PDF sintético de una página y PDF largo de dos páginas: inspección visual PASS, sin texto cortado, solapamientos ni páginas vacías. Párrafos cortos no se dividen entre páginas.
- Consulta remota de solo lectura: cero ApplicationDraft APPROVED. Caso real: BLOCKED_USER_DATA. No se crearon ni aprobaron borradores remotos; no se generó PDF real del usuario.

Los PDFs sintéticos de inspección se guardan en `%TEMP%/phase9a-visual/`. Las pruebas de integración dejan fixtures identificados como sintéticos solo en Supabase local; se eliminan con el siguiente reset local. No se guardan CV personales en Git.

## Archivos

Modificados: `app/(private)/applications/drafts/[id]/page.tsx`, `lib/applications/analysis.ts` (reconocimiento de headings), `next.config.ts`, `package.json`, `package-lock.json`.

Creados: `app/actions/derived-resumes.ts`, `app/api/derived-resumes/[id]/route.ts`, `components/derived-resume-panel.tsx`, `lib/derived-resumes/content.ts`, `lib/derived-resumes/renderer.server.ts`, `lib/derived-resumes/service.server.ts`, `scripts/phase9a-real-inspect.mjs`, `supabase/migrations/20260908000100_phase9a_derived_resumes.sql`, `supabase/tests/phase9a_derived_resumes.sql`, `tests/derived-resumes.test.ts`, `tests/derived-resumes-local.test.ts`, este documento.

## Límites pendientes

- Migración aplicada y probada localmente; despliegue remoto pendiente. Caso real requiere aprobación explícita del usuario en la UI existente.
- CV escaneados sin texto y secciones no reconocidas dependen de las capacidades del extractor existente; no se incorpora OCR. La vista previa permite revisar el contenido antes de generar. Un carácter que la fuente no conserve provoca PDF_TEXT_MISMATCH.
- El contenido largo puede superar dos páginas: se conserva sin truncar, con límite de 30 páginas / 10 MiB.
- Una interrupción del proceso puede dejar GENERATING; un fallo de finalización puede dejar un objeto privado sin READY. No hay worker de recuperación ni eliminación automática; un nuevo intento usa una ruta nueva.
- No se implementaron envío, auto-apply, nuevos conectores, scraping ni nuevas fuentes. Sin commit ni push.

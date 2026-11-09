# CV y evidencia profesional — 06E1

PR #6 de matching integrado en develop el 9 de noviembre de 2026 (2e401df). Esta entrega prepara cinco tablas: resumes, resume_extractions, professional_evidence_profiles, professional_evidence_items y professional_evidence_urls. Total preparado: 15 de 22. Supabase sigue como runtime; no se modifican páginas ni se importan archivos o datos reales.

## División por dependencia real

derived_resumes se completa en 06E2, después de disponer de application_drafts en 06F. Su FK compuesta y el guard que exige borrador/CV aprobados dependen de esa tabla. No se crea una tabla de derivados sin esas garantías ni un borrador ficticio para adelantar el recuento. Secuencia: 06E1 (15 tablas), 06F (21), 06E2 (22), 06G. La tarea 06 sigue abierta.

## Reutilización y diferencias con el legado

Se mantienen UUID, versiones, estados, bucket/ruta determinista, hash, tamaño, MIME y campos de extracción/evidencia del esquema actual. Los extractores PDF/DOCX, normalización, selección de evidencia, generación y renderer existentes se conservan. PostgresEvidenceRepository.loadBank devuelve ProfessionalEvidenceBank, el contrato usado por los generadores.

La cadena nueva añade borrado lógico en extracciones/evidencia, FKs compuestas entre sujeto/ítem/URL y su usuario/candidato, RLS forzada, permisos mínimos y snapshots inmutables. La FK simple de profile_id del legado no bastaba para demostrar pertenencia al mismo candidato. No se conceden DELETE/TRUNCATE ni lectura privada a roles neutrales. Las FKs usan RESTRICT para que borrar un padre no elimine estos registros accidentalmente. Exportación/retención completa siguen en tarea 21.

Los metadatos del CV son inmutables; modificar el documento crea una versión. La reserva de versión bloquea candidato y perfil activo. Hash repetido devuelve el registro vivo; hash borrado falla y no resucita. Un snapshot de extracción se identifica por CV/extractor_version: mismo contenido es idempotente; cambiarlo con esa identidad falla. Otro extractor_version conserva ambos snapshots. El banco actual se edita mediante nuevas entradas/sujetos y archivo lógico, sin reescribir afirmaciones ya confirmadas. La futura edición de perfil deberá mostrar esa operación explícitamente.

## Archivo y confirmación son operaciones diferentes

register reserva metadatos DRAFT. finalizeUpload recibe un ResumeObjectReader de servidor, descarga fuera de la transacción con límite de bytes, comprueba tamaño/hash y firma básica PDF/ZIP y solo después marca READY, comprobando otra vez propiedad/estado. El adaptador debe limitar la lectura antes de asignar memoria y usar claves inmutables. No hay implementación Tigris en esta entrega. La firma ZIP no acredita que el contenedor sea DOCX válido: inspección completa del paquete, staging, validación de contenido, protección contra cambios del objeto, recuperación y reconciliación se completan en tarea 08 antes de activar esta ruta.

approve exige READY y cambia la aprobación en una transacción: archiva el CV anterior y aprueba el nuevo. Un fallo revierte la transacción. Fallos de lectura, integridad, firma o estado preservan el CV aprobado anterior. Aprobar el archivo o guardar su extracción **no confirma hechos ni genera evidencia automáticamente**.

addConfirmedClaim/addConfirmedUrl requieren confirmación explícita del llamador servidor y registran USER_CONFIRMED, VERIFIED y fecha del servidor. Las URLs se normalizan con safeEvidenceUrl existente; no se visitan ni se presentan como verificadas externamente. Esta API aislada no implementa la interfaz de reconfirmación de tarea 10. El esquema conserva los enums APPROVED_RESUME/VERIFIED_TRAINING del legado; el importador deberá conservar procedencia y rebajar/reconfirmar hechos heredados según 06G/tarea 10. No llamar al bootstrap automático del legado desde el backend nuevo.

## Verificación y aceptación

npm run check cubre lint, tipos, pruebas generales, cobertura y compilación. npm run test:db ejecuta PostgreSQL 17 temporal en CI: duplicados, versiones desde conexiones independientes, propiedad cruzada, metadatos/snapshots, sustitución segura de aprobación, integridad/firma, borrado lógico sin resurrección, confirmación y formato del banco. El último resultado remoto se registra en el PR. Docker local no respondió en entregas previas; no se presenta la base como probada localmente.

Pendiente revisión/fusión por el usuario; después 06F y 06E2, manteniendo una sola entrega activa. Better Auth, Tigris, migración real, edición/confirmación visible y descargas siguen con sus tareas correspondientes.

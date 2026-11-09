# Persistencia de candidaturas — 06F

PR #7 integrado en develop (8cb018e) por el usuario. La migración 0006 prepara application_drafts, applications, application_answers, application_events, application_user_settings y user_application_answers. Total: 21 tablas de 22; derived_resumes se completa en 06E2. La aplicación sigue usando Supabase; no se conectan rutas, migran datos reales ni habilitan envíos externos.

## Reutilización y diferencias con el legado

Se conservan los campos, UUID, estados y JSON del esquema vigente. SaveApplicationDraftInput deriva por tipo del repositorio actual y usa JobAnalysis, CandidateEvidence, GeneratedApplication y ApplicationQuestion existentes. Antes de guardar se ejecuta validateGeneratedApplication; source_text se excluye del snapshot como en el legado. No se modifican motor, generador, extractores ni conectores.

Se añaden revision/deleted_at al borrador, borrado lógico en candidaturas, RLS forzada, FKs compuestas y permisos mínimos. applications ya no puede referenciar un borrador de otro usuario, candidato, búsqueda, CV u oferta, ni una fuente de otra oferta. El contexto del borrador es inmutable. Se prepara application_drafts_render_identity para la FK de derivados de 06E2, sin crear todavía la tabla dependiente.

Las FKs usan RESTRICT para evitar eliminaciones en cascada de contenido privado/historial. Los eventos tienen SELECT/INSERT; UPDATE/DELETE no están concedidos. No hay SECURITY DEFINER, procedimientos de reserva/envío automático, DDL ni lectura privada para los roles neutrales.

## Operaciones del repositorio

PostgresApplicationRepository usa actor verificado y UnitOfWork. La escritura bloquea perfil/candidato activo y exige búsqueda activa y CV aprobado no eliminado del mismo contexto. Esta condición adicional frente a ciertas escrituras privilegiadas del legado debe contemplarse en los contratos de importación; el historial puede seguir leyéndose cuando la búsqueda ya no está activa.

- saveDraft valida la generación y crea READY_FOR_REVIEW o edita con expectedRevision, incrementándola. Un duplicado de usuario/oferta/candidato/CV devuelve DRAFT_ALREADY_EXISTS para recuperar el borrador; no sobrescribe contenidos. Cambiar la revisión esperada o intentar editar uno aprobado falla.
- approveDraft exige READY_FOR_REVIEW y la revisión exacta. El trigger SQL impide cambiar materiales aprobados, su identidad o resucitar un borrador archivado. La aprobación registra revisión del material persistido; no prueba por sí sola el recorrido visible completo de tarea 19 ni sustituye la comprobación de procedencia del servicio.
- archiveDraft archiva lógicamente con revisión esperada y conserva candidaturas/eventos asociados. findDraft/findApplication comprueban propiedad y padres activos.
- prepare exige borrador/CV aprobados y crea PREPARED/MANUAL, respuestas pendientes de confirmación y eventos CREATED/MODE_DECIDED en una transacción. No visita la URL ni ejecuta un conector. Cualquier respuesta inválida revierte la candidatura completa. Una candidatura duplicada devuelve su ID existente sin cambiar CV, respuestas, URL o eventos; una candidatura borrada no se resucita. La unicidad conserva el criterio legado por usuario/oferta/candidato; equivalencia entre ofertas duplicadas sigue en tareas 14/20.
- confirmAnswer comprueba propietario y estado editable y registra USER_APPROVED junto con un evento sin copiar el valor de la respuesta al historial. rememberAnswer almacena una respuesta reutilizable propia y su fecha de aprobación. Las reglas completas de tipo de pregunta, consentimiento y revisión visible continúan en las tareas funcionales correspondientes; estas APIs solo se llaman desde servidor.
- settings crea la configuración si falta, con auto_apply_enabled=false. No hay API nueva que habilite envío automático. history entrega únicamente eventos del usuario, ordenados por fecha/ID; no se concede su modificación física.

Los estados/enums y flags de automatización históricos se conservan para compatibilidad del inventario. Su presencia en el esquema no activa automatización. La tarea 20 de seguimiento visible, las transiciones operativas, el estado enviado manual y su auditoría funcional siguen pendientes; no se presenta esta persistencia como seguimiento terminado.

## Validación y siguiente paso

npm run check verifica lint, tipos, pruebas generales, cobertura y compilación. npm run test:db utiliza PostgreSQL 17 temporal en CI para probar versiones/aprobación, FKs de contexto, aislamiento en seis tablas, rollback entre respuestas, duplicados, confirmación, eventos inmutables, archivo lógico y preparación concurrente desde conexiones independientes. Estado remoto y resultados definitivos en el PR; no se acredita PostgreSQL real localmente porque Docker no respondió en las entregas anteriores.

Tras revisión/fusión del usuario, 06E2 añade derivados con FK y guard de borrador/CV aprobados, después 06G compara/importa fixtures. Better Auth, Tigris y aceptación integral se mantienen como condiciones antes de activar el destino. La tarea 06 permanece abierta.

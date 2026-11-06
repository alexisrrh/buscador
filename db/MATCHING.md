# Persistencia de matching — 06D

La migración 0004 añade job_matches al destino PostgreSQL: diez tablas preparadas de 22. El motor existente y deterministic-v2 se conservan. La aplicación continúa en Supabase; esta entrega no conecta rutas, importa datos reales ni completa la tarea funcional 15.

## Contrato y autorización

PostgresMatchingRepository implementa MatchingRepository y funciona con generateMatchesForSearchProfile sin modificar el servicio. Crear una instancia por ejecución, con actor verificado, UnitOfWork privado y CatalogUnitOfWork de bv_catalog. No compartir una instancia entre ejecuciones ni recargar su contexto durante un cálculo.

loadSearchContext exige que el usuario solicitado coincida con el actor. Lee búsqueda activa, perfil, candidato y preferencias vigentes no eliminados, conservando los campos del motor. Guarda la versión leída: persistir sin contexto, tras pausar/archivar/eliminar la búsqueda o después de cambiar preferencias falla. La escritura bloquea búsqueda, candidato y perfil; las preferencias son snapshots append-only.

Las ofertas usan otra conexión, rol de solo lectura y columnas explícitas. Hasta 5000 ofertas activas, recientes y no caducadas, ordenadas por última observación e ID; políticas de catálogo de 06C conservadas. bv_app no obtiene lectura del catálogo ni raw_payload. bv_catalog no accede a job_matches. El motor se ejecuta fuera de transacciones y la versión se verifica de nuevo al escribir.

## Integridad y decisiones

RLS forzada y filtros de propietario protegen filas privadas. Las FKs unen usuario/candidato/búsqueda y snapshot; la identidad única incorpora oferta, usuario, candidato, búsqueda, versión y scoring_version. Se conservan score, eligibility_status, score_components, hard_gates y reasons. SQL valida puntuación 0–100, enums y tipos JSON. La credencial de aplicación queda en servidor; los permisos DML no sustituyen la autenticación de tarea 07.

Lotes de hasta 5000 resultados en bloques de 200 dentro de una transacción. Búsquedas mezcladas e identidades repetidas se rechazan; cualquier fallo revierte todos los bloques. Los upserts conservan el estado y no duplican identidades. El trigger porta la regla del legado: SAVED/DISMISSED/APPLIED se hereda entre versiones de scoring de la misma versión de búsqueda; otra versión de preferencias comienza en NEW. setStatus actualiza solo filas del actor. APPLIED es un estado persistible del contrato legado, no un envío externo ni el seguimiento funcional de candidaturas.

No hay borrado físico automático: las FKs impiden eliminar referencias con resultados existentes hasta definir la retención de tarea 21. Sin DELETE/TRUNCATE ni SECURITY DEFINER. La composición del historial con ofertas expiradas y candidaturas se verificará antes de conectar pantallas.

## Validación y siguiente entrega

npm run check: lint, tipos, pruebas generales con cobertura y build; 502 aprobadas y 15 omitidas. npm run test:db: 63 pruebas aprobadas en PostgreSQL 17 temporal de CI sobre 8187ffb, incluyendo salida del motor, servicio existente, dos usuarios, contexto ausente, versiones, rollback, decisiones, concurrencia y permisos. [Ejecución del PR](https://github.com/alexisrrh/buscador/actions/runs/42224164954). Docker local sigue sin responder; el último estado remoto se registra en PR #6.

Pendiente revisión/fusión por el usuario; después 06E CV/evidencia. Importación, Better Auth, Tigris, conexión del destino y aceptación integral siguen el proceso de trabajo.

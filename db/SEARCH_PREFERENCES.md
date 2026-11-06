# Búsquedas y preferencias PostgreSQL — tarea 06B

Segunda entrega de la tarea 06, desde develop tras integrar PR #2 (fd9daa5). Añade search_profiles y job_preferences: cuatro tablas de las 22 inventariadas, 18 pendientes. La aplicación sigue usando Supabase; no se conecta el nuevo repositorio a páginas/acciones/APIs ni se migran datos reales.

## Contrato

PostgresSearchRepository usa ActorContext verificado y UnitOfWork. Los IDs de búsqueda/candidato no determinan la identidad. Aplica propietario y perfil/candidato vigentes; el SQL refuerza el aislamiento con RLS ENABLE/FORCE, USING/WITH CHECK y FKs compuestas.

- save crea una búsqueda DRAFT con versión 1 cuando falta searchId. Dos creaciones independientes pueden tener el mismo nombre. El consumidor debe conservar el ID devuelto; no hay deduplicación por contenido ni idempotency key de creación.
- Para editar se exigen searchId y expectedVersion. Bloquea perfil/candidato con FOR SHARE y búsqueda con FOR UPDATE; guarda configuración y snapshot de preferencias en una transacción. No permite trasladar una búsqueda a otro candidato.
- Una versión antigua devuelve SEARCH_VERSION_CONFLICT: el consumidor debe recargar y resolver el conflicto. No se reintenta sobrescribiendo silenciosamente. Esta política no cambia aún el onboarding heredado.
- find devuelve búsqueda y preferencias actuales o null. history devuelve preferencias ordenadas por versión; no representa un historial de todos los campos mutables de la búsqueda.
- transition mantiene DRAFT → ACTIVE/ARCHIVED, ACTIVE → PAUSED/ARCHIVED y PAUSED → ACTIVE/ARCHIVED, comprobando propiedad y versión. DISABLED se conserva para compatibilidad del esquema, sin nuevas transiciones. Archivar establece deleted_at, oculta la búsqueda y conserva los snapshots.

La validación reutiliza tipos/payloads canónicos: nombre 2–120, frecuencia/hora/zona, umbrales, límites, listas, salarios, experiencia y estados. UNKNOWN, UNRESTRICTED y SPECIFIED siguen siendo distintos. No se inventan restricciones ni confirmaciones profesionales.

## Invariantes SQL

0002_search_preferences.sql conserva columnas y enums del modelo local. No modifica el historial Supabase ni el checksum de 0001. Reutiliza cálculo de próxima ejecución y validación de versiones en funciones app invocadoras con search_path acotado; sin auth.uid ni SECURITY DEFINER.

FKs compuestas relacionan usuario/candidato/búsqueda/preferencias. La versión de preferencias no supera la de la búsqueda y es única por usuario/búsqueda/versión. Una FK inversa diferida exige snapshot para la versión actual al hacer commit. Un fallo de preferencias revierte también el incremento de versión y la configuración.

El runtime tiene SELECT/INSERT de preferencias, sin UPDATE/DELETE; búsquedas admiten SELECT/INSERT/UPDATE y archivo lógico. La eliminación de un perfil conserva la cascada heredada; privacidad/retención se resolverán por separado. No se afirma inmutabilidad frente al administrador.

SPECIFIED de salario exige importe explícitamente no nulo y positivo y moneda. Se evita aceptar NULL mediante un CHECK indeterminado. Al importar habrá que detectar registros heredados incompletos; no se fabrica un importe. La importación de búsqueda y versiones deberá respetar las FKs diferidas en una transacción; el importador está pendiente.

Activar calcula next_run_at; pausar/archivar lo limpia; editar una búsqueda ACTIVE recalcula la fecha desde la hora de transacción. Respeta zona y días laborables. Solo guarda planificación: no inicia scheduler, ingesta ni envío externo. application_mode mantiene valores históricos, MANUAL por defecto y sin opción de cambio desde este repositorio.

## Validación y pendientes

Local, npm run check: lint/tipos/build correctos, 480 pruebas aprobadas y 15 omitidas; incluye 71 nuevas pruebas de validación, estados y límites del repositorio. Cobertura de 27 módulos: líneas 96,38 %, sentencias 92,07 %, funciones 95,30 %, ramas 82,78 %.

test:db contiene 35 casos PostgreSQL reales (18 anteriores y 17 nuevos), obligatorios en el PostgreSQL 17 temporal del Quality gate. Cubren historial, búsquedas independientes, RLS/FKs, concurrencia y conflictos, rollback, snapshot obligatorio, preferencias append-only, estados, horarios y candidatos eliminados. Los resultados remotos se registran en el PR; no se presentan mocks como prueba de RLS. Las pruebas del migrador descubren todos los archivos y mantienen checksum/CRLF/atomicidad.

La tarea 06 sigue abierta: catálogo/ingesta, matching, CV/evidencia, candidaturas, roles especializados e importación íntegra. Better Auth, Tigris y activación del destino conservan sus propias condiciones de aceptación.

# Base PostgreSQL propia — tareas 06A/06B/06C/06D/06E1

06A, integrada en develop mediante PR #2, implementa profiles y candidate_profiles, con UUID conservados, RLS, permisos mínimos y repositorio transaccional. 06B añade [búsquedas y preferencias](SEARCH_PREFERENCES.md), 06C añade [catálogo e ingesta](CATALOG_INGESTION.md) y 06D prepara [matching](MATCHING.md): 06E1 añade [CV base y evidencia](RESUME_EVIDENCE.md): quince de las 22 tablas inventariadas, siete pendientes. derived_resumes se completa tras borradores en 06F (06E2). No sustituye todavía el backend actual.

La aplicación sigue usando Supabase. Ninguna página, acción ni API llama todavía al repositorio nuevo. No se migran datos reales, se cambia proveedor ni se crea infraestructura de pago. La FK de identidad hacia Better Auth se incorporará en la tarea 07 antes de activar el destino; esta base aislada no constituye autenticación implementada.

## Identidad, transacciones y permisos

`requireActor` recibe un lector de sesión validada en servidor y exige UUID, cuenta habilitada y sesión vigente. Emite un objeto inmutable registrado internamente; una copia o un objeto creado desde un formulario no es un actor válido. La tarea 07 proporcionará el lector Better Auth. Leer y validar la sesión en cada operación privada; no conservar actores en cachés globales ni confiar en metadata del navegador.

`UnitOfWork.withActor` toma un único cliente, abre transacción y configura `app.user_id` mediante `set_config` parametrizado y local a la transacción. Rechaza superusuarios, BYPASSRLS y miembros del rol propietario. Hace commit o rollback antes de liberar el cliente; si rollback falla, descarta la conexión. La operación no recibe el pool ni acceso a release. No retener el cliente ni ejecutar transferencias de red dentro del callback. Un actor caducado antes de commit provoca rollback.

Las consultas de repositorio filtran propietario y las políticas SQL lo exigen incluso cuando una consulta omite ese filtro. Sin contexto no hay filas visibles ni inserciones permitidas. `WITH CHECK` impide reasignar filas a otro propietario. El contexto de aplicación presupone SQL de servidor parametrizado y credenciales DB privadas: no concede seguridad a clientes con SQL arbitrario o acceso directo a la contraseña del runtime.

`bv_owner` es propietario sin login y `bv_app` agrupa los permisos DML sin login. El operador debe crear un login de aplicación con NOSUPERUSER/NOBYPASSRLS, sin DDL ni pertenencia a `bv_owner`, y concederle únicamente `bv_app`. No usar credenciales de migrador en `createDatabasePool`. Las contraseñas del login se aprovisionan fuera de Git; no hay una contraseña productiva predefinida en SQL.

El repositorio permite asegurar idempotentemente el perfil propio, crear/listar/buscar perfiles de candidato y rechazar perfiles de usuario eliminados sin reactivarlos. Las pruebas mantienen la distinción entre archivo aprobado y evidencia confirmada; esta entrega no procesa CV ni cambia matching.

## Migraciones

La nueva cadena `db/migrations/` es independiente del historial Supabase, que se conserva intacto. Solo se aplica explícitamente a una base de destino dedicada mediante credencial de migrador:

```powershell
# Definir DATABASE_MIGRATION_URL mediante el gestor de secretos o entorno local.
npm run db:migrate -- --bootstrap
# En siguientes ejecuciones, sin volver a aprovisionar roles:
npm run db:migrate
```

Node 24 ejecuta el migrador TypeScript desde el script de herramientas. No carga `.env.local` automáticamente ni se ejecuta al arrancar la aplicación. `--bootstrap` modifica roles/permisos de la base seleccionada: usar solo sobre una base de destino dedicada preparada para ello, nunca sobre el legado por conveniencia. El script no elige una base remota ni recibe credenciales por argumentos que deban versionarse.

El migrador serializa con advisory lock, aplica SQL y ledger en una transacción y comprueba SHA-256 del historial. Reejecutar no duplica tablas ni filas; cambios, reordenaciones o desaparición de una migración aplicada fallan. Normaliza CRLF/LF para Windows/Linux. Un fallo revierte también los objetos SQL creados en ese lote. No incorpora rollback destructivo automático.

## Pruebas y alcance de aceptación

```powershell
npm run check
# Requiere PostgreSQL 17 local y una base desechable llamada buscavacante_test:
npm run test:db
```

`TEST_DATABASE_URL` solo admite localhost/127.0.0.1/IPv6 loopback y la base `buscavacante_test`. Si falta o no cumple, el comando falla antes de conectar; no omite silenciosamente las pruebas. El runtime de la prueba usa un login sintético con permisos mínimos, distinto del administrador que aplica migraciones. Se elimina ese login temporal al terminar. No se borran bases ni tablas ajenas para reiniciar las pruebas.

GitHub Actions levanta `postgres:17-alpine`, espera su healthcheck y ejecuta `npm run test:db` dentro de **Quality gate** después del control general. La contraseña visible del servicio es sintética y solo pertenece al contenedor temporal de CI. No hay credenciales productivas. Las 18 pruebas reales cubren:

- UUID e idempotencia del perfil; lectura propia y denegación cruzada sin filtro del repositorio.
- Inserción/reasignación de propietario y modificación/eliminación cruzadas.
- Ausencia de contexto tras commit/rollback, error SQL, alternancia A/B en un pool de una conexión y concurrencia con dos conexiones.
- Restricciones de DDL, TRUNCATE, ledger y SET ROLE; rechazo de una conexión administrativa en el backend.
- Perfil eliminado, contexto malformado, repetición de migraciones, checksum, CRLF y atomicidad ante fallo.

La suite local suma 409 aprobadas y 15 omitidas, incluidas 32 pruebas nuevas de identidad, configuración, transacciones y límites del repositorio. Lint/tipos/build pasan; cobertura de 25 módulos: líneas 96,12 %, sentencias 91,56 %, funciones 95,01 %, ramas 81,48 %. Docker local no respondió; las pruebas reales se verifican en el PR mediante el PostgreSQL temporal de Actions. Sus resultados remotos deben acompañar el PR, sin presentar mocks como prueba de RLS.

## Pendientes de la tarea 06

Trasladar matching, CV/evidencia y candidaturas; conservar FKs compuestas, locks, unicidad y contratos. Añadir funciones/roles específicos según el diseño. Probar importación de UUID/datos y reconciliación completa en una base aislada. No activar TARGET antes de autenticación, almacenamiento y ensayo de migración/corte. El cierre de 06A no marca completada la tarea 06 ni los requisitos de aceptación de producción.

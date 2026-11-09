# Catálogo e ingesta PostgreSQL — tarea 06C

Tercera entrega de tarea 06, desde develop después de PR #3 (172dd94). Prepara companies, job_sources, job_offers, job_offer_sources y company_career_sources: nueve tablas de las 22 inventariadas, 13 pendientes. Supabase sigue siendo el runtime; no se migran datos reales ni se conectan rutas actuales a estos repositorios.

## Roles y límites

bootstrap.sql incorpora bv_ingest y bv_catalog (NOLOGIN, sin DDL/BYPASSRLS), separados de bv_owner, bv_app y entre sí. También aprovisiona pgcrypto en extensions para el hash generado de descripción; no recrea auth ni Storage. Si pgcrypto ya existe en otro esquema, se detiene en lugar de moverlo implícitamente. Para una base destino ya preparada, ejecutar explícitamente db:migrate -- --bootstrap antes de aplicar 0003. No usar el legado como base destino.

El operador crea logins distintos y concede a cada uno únicamente el rol correspondiente; sus credenciales se mantienen fuera de Git. CatalogUnitOfWork comprueba membresía, privilegios y mezcla de roles en cada transacción. La lectura pública es READ ONLY y elimina el contexto de usuario de esa transacción. UnitOfWork privado también rechaza credenciales de catálogo/ingesta. No se usa el propietario ni service_role como runtime.

Las cinco tablas tienen RLS ENABLE/FORCE. bv_ingest puede SELECT/INSERT/UPDATE del catálogo, sin DELETE/TRUNCATE ni acceso a las cuatro tablas privadas existentes. bv_catalog solo tiene columnas permitidas y políticas de lectura: ofertas ACTIVE/no caducadas, proveedores habilitados y boards habilitados. El repositorio oculta ofertas sin una fuente visible. raw_payload y los diagnósticos de salud no están concedidos al lector. No hay vistas que omitan RLS ni funciones SECURITY DEFINER.

## Contratos reutilizados

- PostgresJobOfferRepository mantiene JobOfferRepository y CompanyCareerSourceCheckRecorder: lookup individual/lote, persistencia individual/lote y registro de salud.
- Los payloads, validaciones de respuestas y contadores comunes se extraen a RpcJobOfferRepository, independiente del transporte. La entrada Supabase anterior reexporta la misma implementación para conservar compatibilidad; el cliente PostgreSQL no importa el SDK.
- El transporte SQL solo admite seis funciones conocidas, con consultas constantes y valores parametrizados. Los fallos devuelven códigos sin exponer SQL/payloads. No acepta nombres de función arbitrarios.
- 0003 conserva los algoritmos de identidad/fingerprint del legado y los UUID/campos. Los lotes aíslan fallos por oferta mediante bloques de excepción/subtransacción, devuelven errores contados y conservan las válidas. Admite ofertas neutrales sin board y ofertas de empresas, sin forzar todas a una fuente de empresa.
- PostgresSourceRegistry permite registro explícito y listado de boards/salud. Registra LEVER, ASHBY, GREENHOUSE, SMARTRECRUITERS, JOBGETHER y JOBICY. Un registro repetido no reactiva boards deshabilitados. No añade semillas ni hace peticiones externas implícitas.
- PostgresCatalogReader reutiliza la transformación de salida pública existente, ahora en un módulo puro. Lee por una lista de columnas, filtra estado/caducidad/frescura de 45 días y devuelve como máximo 200 filas por defecto, 1.000 como límite. La integración/paginación completa de búsqueda pública queda pendiente; no presentar esta lectura acotada como catálogo completo.

Las URLs públicas de oferta/origen requieren HTTP(S) en SQL; el registro de boards usa la canonicalización existente. El hash se calcula sobre la descripción almacenada. Las observaciones repetidas mantienen last_seen_at creciente; los cambios de fingerprint distinguen UPDATED y UNCHANGED. Esto no acredita una ingesta externa real ni una nueva calibración de relevancia.

## Limitaciones preservadas y trabajo posterior

La identidad de external_job_id y canonical_source_url sigue a nivel de proveedor, como el modelo legado. No se declara resuelta la tarea 14: una colisión entre boards puede impedir guardar la segunda oferta. El wrapper detecta el board distinto y revierte todo el cambio para no sobrescribir datos; el caso está probado. Antes de activar el destino con múltiples boards, hay que migrar la identidad de fuentes y validar dedupe/atribución en esa tarea.

No hay scheduler, expansión de proveedores, consultas live, cierre de ofertas ausentes ni reintentos automáticos. Se conserva la lógica heredada de salud y combinación de metadatos; la ordenación de observaciones atrasadas y reconciliación corresponden a la tarea 15. Tampoco se activa auto-submit: se conserva auto_apply_enabled=false por defecto únicamente para compatibilidad del esquema.

Las credenciales de ingesta pueden almacenar raw_payload; su minimización y retención deben resolverse antes de producción. El lector público no puede leerlo. Matching y lectura histórica de ofertas privadas se diseñarán con sus permisos específicos en 06D, sin conceder escritura de catálogo a bv_app.

## Validación

Local: npm run check correcto, 495 pruebas aprobadas y 15 omitidas; lint/tipos/build correctos. Cobertura agregada de 33 módulos: líneas 93,65 %, sentencias 90,08 %, funciones 94,17 %, ramas 80,75 %. La incorporación de módulos adicionales cambia el denominador; no se reducen umbrales ni se oculta su cobertura individual.

test:db contiene 51 casos reales PostgreSQL 17 (35 anteriores y 16 de catálogo): reingesta, URL fiable/no fiable, concurrencia, lotes parciales, motor con fixtures sin red, hash, registro/salud, fuentes deshabilitadas, rollback de colisiones, límites de lectura, permisos por columna y denegación de datos privados/membresías mezcladas. Se ejecutan en el servicio temporal de CI y sus resultados se registran en el PR. Las contraseñas son sintéticas y no se necesitan secretos productivos.

La tarea 06 continúa abierta: matching, CV/evidencia, candidaturas, importación e integridad global. Las entregas 06A/06B conservan sus migraciones sin modificar sus checksums.

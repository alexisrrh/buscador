# Contratos e importación sintética — 06G

PR #10 fusionado por el usuario en main (76f6d33). La rama de esta entrega sale de develop y recoge por fast-forward ese merge de promoción después de verificar que ambos árboles de código coinciden; la integración del trabajo sigue siendo un PR hacia develop. No se hace push directo a ninguna rama protegida.

## Qué acredita este laboratorio

[contracts.json](transition/contracts.json) mapea las 22 tablas y las 34 funciones del inventario: 13 funciones portadas como invocadoras en app, 15 sustituidas por repositorios/conversión interna, cinco pendientes y una de reserva de envío deshabilitada. Conserva hashes SHA-256 normalizados LF de las 22 migraciones del legado y las siete del destino. Cambiar SQL, añadir una migración o dejar una tabla/función sin mapear exige revisar el manifiesto; nunca se regenera silenciosamente.

El auditor compara declaraciones de columnas/tipos del legado con la cadena destino y con pg_catalog, exige RLS forzada y comprueba presencia/SECURITY INVOKER de las funciones portadas. Informa columnas añadidas/generadas y discrepancias de migración. Es un lector estático del DDL no entrecomillado usado por este repositorio; no es un parser PostgreSQL general ni una inspección del Supabase vivo. No compara exhaustivamente cada CHECK/FK/política ni acredita equivalencia semántica de ambos runtimes. Los repositorios y restricciones conservan sus pruebas funcionales/adversariales, y la aceptación integral sigue en 06H/26.

compatible=true significa que coincide este contrato acotado; productionReady siempre es false. Las sustituciones de funciones identifican el destino y su alcance, sin afirmar que sus nombres RPC o todos sus efectos sean idénticos. El lector de sesión/identidad queda para 07, los objetos/rechazo de uploads para 08, el contexto público para 18 y la edición visible para 19. No se implementa reserva/envío automático por portar su esquema.

## Uso local y en CI

Usar Node 24 y una base PostgreSQL 17 dedicada buscavacante_test, con bootstrap/migraciones aplicados por el procedimiento de db/README.md. El login del laboratorio necesita SET ROLE hacia bv_ingest y bv_app; no es la credencial de runtime. Las escrituras se realizan bajo esos roles, con RLS activa, nunca como propietario/superusuario, y en una transacción. No se desactivan triggers, FKs, políticas o session_replication_role.

```powershell
# TEST_DATABASE_URL se define fuera de Git. Solo se admite loopback y buscavacante_test.
npm run db:transition -- --audit
npm run db:transition -- --synthetic --seed=transition-06g-v1
```

La primera orden solo lee metadatos dentro de una transacción READ ONLY. La segunda exige auditoría correcta, genera 52 filas sintéticas para las 22 tablas y dos usuarios, importa y repite con la misma semilla, comparando digest y ausencia de inserciones nuevas. No lee archivos JSON arbitrarios, no carga .env.local ni usa DATABASE_URL como fallback. El importador comprueba también host/base del cliente y nombre/versión del servidor; permite el NAT del contenedor de CI sin confundir su IP interna con el endpoint loopback. Los errores del CLI no muestran cadenas de conexión ni contenido privado.

El fixture usa UUID deterministas, created_at histórico, preferencias v1/v2, puntuación/scoring y decisiones, CV aprobado y otro archivado/borrado, extracciones, evidencia heredada UNKNOWN sin confirmed_at, borradores, respuestas, eventos y derivados en los cuatro estados. La candidatura histórica SUBMITTED es solo una fila de fixture: no ejecuta ningún envío. Automatización permanece deshabilitada. Los dominios son example.test y todo el contenido está identificado como sintético.

Las filas se cargan en orden FK; el snapshot vigente de preferencias se satisface antes de commit. Los CV pasan por DRAFT/READY y los derivados por GENERATING/READY/ARCHIVED, manteniendo guards. La candidatura recibe primero su archivo READY y después su estado histórico. Un conflicto aborta todo el lote. La repetición valida los campos explícitos y no sobrescribe ni resucita registros; un tombstone nuevo se informa como drift. El digest incorpora las filas destino completas y la lista de columnas SQL NULL, no solo los conteos: así no confunde NULL SQL con el literal null de JSONB. Los null del fixture representan SQL NULL; una exportación real deberá aportar el mismo metadato lateral. Un cambio en campos no explícitos también cambia ese digest y debe detectarse al compararlo con el informe anterior; no se presenta como reconciliación de un origen real.

El laboratorio devuelve solo conteos, hashes y límites; objectsCopied=0. No se copian archivos, auth.users, contraseñas ni sesiones. El fixture no prueba que sus metadatos de documentos correspondan a objetos existentes, ni que exista consentimiento real o un borrador generado desde un CV de usuario. No utilizar este cargador como importador de producción.

## Discrepancias y reglas antes del ensayo integral

| Discrepancia | Regla/gate |
| --- | --- |
| Identidad y sesiones Supabase | Preservar UUID, enlazar Better Auth y probar recuperación/reset; no trasladar sesiones. 07. |
| Objetos privados | Copiar bytes y cotejar hashes, versión, staging y tombstones con Tigris; metadata no es prueba de copia. 08/06H. |
| updated_at histórico | Los triggers de ciclo usan now(); el fixture omite esos updated_at de origen y compara el digest estable del destino. Todavía no hay ruta auditada que preserve todos los timestamps históricos al importar; resolver antes de 06H. No se afirma fidelidad temporal completa. |
| Evidencia heredada VERIFIED | Preservar snapshots históricos y marcar procedencia/reconfirmación para uso futuro. El fixture importa APPROVED_RESUME como UNKNOWN, nunca como USER_CONFIRMED. La UI/flujo de confirmación corresponde a 10. |
| FK y snapshots reforzados | Rechazar/reconciliar filas cruzadas o inconsistentes; no reasignar propietarios, sobreescribir snapshots ni resucitar borrados. 06H. |
| Derivados con padres ya archivados/borrados | El caso histórico puede incumplir el guard de aprobación; el fixture mantiene el padre aprobado. Definir ruta de importación auditada antes de importar esos casos; no eludir el guard. 06H. |
| Colisión proveedor/board | Resolver identidad antes de activar múltiples boards. 14. |
| Salario SPECIFIED con NULL | Destino exige importe/moneda explícitos; rechazar y revisar, sin inventar cantidades. 06H. |
| Automatización/seguimiento | Conservar valores históricos sin reservar intentos ni enviar formularios; no confundir persistencia con tarea 20 completa. |

## Validación y siguiente entrega

npm run check ejecuta las pruebas del lector estático, manifiesto, semillas, canonicalización y límites del cliente, además de los checks existentes de la app. npm run test:db verifica catálogo real, detección de drift de columnas/RLS, las 22 tablas/52 filas, replay, digest, UUID/versiones/snapshots, tombstones, rollback, dos usuarios, concurrencia y el CLI Node real. El resultado definitivo y la revisión se registran en el PR; PostgreSQL real se verifica en Actions, no se declara probado localmente sin Docker.

06G prepara contratos y un ensayo de dominio sintético. Tras revisar/fusionar puede iniciarse 07 Better Auth, después 08 Tigris. El ensayo 06H deberá cerrar las discrepancias, identidad, archivos y reversión antes de declarar tarea 06 completa o activar TARGET. La aplicación continúa con Supabase y no se modifica ningún proveedor, dato real o ruta productiva.

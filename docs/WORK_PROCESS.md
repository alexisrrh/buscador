# Proceso de trabajo de BuscaVacante

Estado verificado el 9 de noviembre de 2026. La [checklist de 28 tareas](PRIORITY_CHECKLIST.md) conserva el alcance del documento de requisitos. Este archivo organiza las entregas y sus dependencias; no sustituye los requisitos ni marca como terminado lo que solo está diseñado.

## Punto actual

- Tareas 01–05 completadas. Base, diseño de transición, CI y flujo de PR preparados.
- 06A: perfiles, conexión y transacciones, integrada en develop mediante PR #2.
- 06B: búsquedas/preferencias con versiones, integrada mediante PR #3.
- 06C: catálogo/ingesta con roles separados, integrada mediante PR #4, commit de merge a589a0f.
- 06D matching integrada mediante PR #6 (2e401df). Ver [contrato y validación](../db/MATCHING.md).
- 06E1 prepara CV base y evidencia en feat/cv-evidencia-postgresql; revisión e integración en el PR. Ver [alcance y dependencia](../db/RESUME_EVIDENCE.md).
- Quince tablas preparadas de las 22 inventariadas. Este recuento no es un porcentaje de avance del producto.
- Última evidencia integrada (06D): 502 pruebas generales aprobadas, 15 omitidas y 63 pruebas PostgreSQL aprobadas; lint/tipos/build y CI correctos. Las omisiones no acreditan integraciones externas.
- La aplicación sigue usando Supabase. No se ha activado el backend destino ni promovido develop a main.

## Siguiente trabajo y entregas de la tarea 06

| Orden | Entrega | Alcance | Criterio de salida | Estado |
| --- | --- | --- | --- | --- |
| 1 | 06D — Matching | job_matches y repositorio compatible con MatchingRepository; lectura de catálogo y escritura privada separadas. | Dos usuarios aislados; FKs de usuario/candidato/búsqueda/versión; resultados y scoring_version preservados; upsert concurrente sin duplicados y estados guardado/descarte conservados. Mantener engine.ts sin recalibrar puntuaciones. | Integrada (PR #6) |
| 2 | 06E1 — CV base y evidencia | resumes, resume_extractions, professional_evidence_profiles, professional_evidence_items, professional_evidence_urls. | UUID/versiones y metadatos del CV base conservados; propiedad cruzada denegada; snapshots y borrado lógico íntegros; un fallo no sustituye la versión válida anterior. Interfaces de almacenamiento, sin presentar Tigris como implementado. | Implementada; validación y revisión/fusión en el PR |
| 3 | 06F — Candidaturas | application_drafts, applications, application_answers, application_events, application_user_settings, user_application_answers. | Integridad de propietario y referencias; borradores/respuestas/eventos conservados, transacciones y duplicados probados. El traslado no activa envío externo ni declara completado el seguimiento funcional de tarea 20. | Pendiente de 06E1 |
| 3b | 06E2 — CV derivados | derived_resumes y relaciones con borradores/candidaturas. | Conservar FK compuesta y guard de borrador/CV aprobados, snapshots, ciclo de render y propiedad; no crear derivados sin borrador válido. | Requiere borradores de 06F |
| 4 | 06G — Preparación de importación y contratos | Mapeo de las 22 tablas y funciones/dependencias del inventario; herramientas repetibles y fixtures sintéticos. | Contratos legado/destino comparados; restricciones/roles revisados; UUID y versiones preservados en fixtures; informe de discrepancias y reglas de conversión. Ningún dato real exportado por defecto. | Pendiente de 06F y 06E2 |
| 5 | 07 — Better Auth | Identidad, cuenta, recuperación y sesiones; enlace de identidad con profiles. | Alta/login/recuperación/cierre de sesiones probados, cuenta importada sintética conserva UUID y recupera acceso. Los JWT/sesiones del legado no sirven como sesiones destino. | Tras base de dominio y 06G |
| 6 | 08 — Tigris | Objetos privados, staging, validación, finalización, descarga y reconciliación. | Propiedad, tamaño/MIME/firma/hash; repetición de PUT/finalización y fallos DB/objeto probados; copia de archivos sintéticos verificada. | Tras 07; usa contratos de 06E |
| 7 | 06H — Ensayo completo de datos y archivos | Reconciliación integral de identidad, dominio y objetos en entorno aislado. | Conteos, digest de filas, hashes de archivos y FKs coinciden; repetir no duplica ni resucita eliminados; reversión antes/después de escrituras ensayada. Cierra la parte integral de 06, sin cambiar producción. | Requiere 06G, 07 y 08 |

06D añade una tabla (total 10), 06E1 cinco (total 15), 06F seis (total 21) y 06E2 una (total 22). derived_resumes exige application_drafts, por lo que su preparación completa se realiza después de 06F, conservando las restricciones del legado. El inventario es la referencia para comprobar que no falta ninguna. Si una entrega resulta demasiado grande, dividirla en PR más pequeños con su propio resultado verificable, sin crear otro sistema de numeración de requisitos.

La preparación del esquema de 06E no equivale a confirmar datos extraídos: distinguir lo heredado de lo confirmado continúa en la tarea 10. La importación completa de 06H tampoco acredita esa funcionalidad. No usar datos heredados autoaprobados como evidencia nueva sin el tratamiento de procedencia/reconfirmación del diseño.

## Dependencias que evitan bloqueos

La tarea 06 permanece en curso mientras se prepara el ensayo integral, pero no se exige cerrarla para comenzar 07/08. Tras 06G se puede avanzar a autenticación y almacenamiento; 06H vuelve sobre los contratos ya implementados para probar el conjunto. Así no se exige migrar identidad/objetos antes de que existan sus adaptadores.

Después se continúa con 09–10 (perfil e información confirmada), 11–17 (búsqueda y oportunidades), 18–20 (candidaturas), 21–24 (privacidad, roles, avisos y piloto) y 25–28 (aceptación/operación/publicación), según sus dependencias reales. El orden de la checklist no autoriza saltarse una condición de seguridad o integridad.

La identidad proveedor/board de tarea 14 debe resolverse antes de activar el destino con múltiples boards; 06C solo rechaza colisiones sin sobrescribir. La automatización/reconciliación del catálogo corresponde a 15. La activación TARGET requiere además los criterios funcionales, de seguridad, almacenamiento y operación del [plan de transición](architecture/TRANSITION_PLAN.md), no solo disponer de 22 tablas.

## Ciclo de cada entrega

1. Comprobar que el PR anterior está integrado y que el árbol local está limpio. Actualizar develop desde origin y crear una rama de trabajo desde esa base.
2. Escribir alcance, condición de cierre y exclusiones concretas. Reutilizar código válido; separar cambios funcionales de una mera sustitución de infraestructura cuando ayude a revisar.
3. Implementar y validar según el cambio. Para código: npm run check; para persistencia: test:db con PostgreSQL 17 sintético, además de pruebas negativas de propietario/transacción. Un cambio solo documental revisa coherencia, enlaces y diff; el CI remoto mantiene sus controles habituales.
4. Crear commits con tipo en inglés y descripción/cuerpo en español. Subir solo la rama de trabajo y abrir PR hacia develop usando íntegramente la plantilla.
5. Mantener borrador si hay pruebas pendientes o fallidas. Corregir fallos y comprobar el último commit; no usar el resultado verde de un commit anterior como evidencia del nuevo.
6. Completar Self Review y marcar solo verificaciones realmente realizadas. Code Review de otra persona queda sin marcar en el trabajo individual. El autor revisa y decide fusionar cuando CI está aprobado.
7. Verificar la fusión, actualizar checklist/memoria y pasar a la siguiente entrega. Los resultados remotos pueden registrarse en el cuerpo del PR; no hace falta generar un nuevo commit documental solo para repetir el resultado de su propio CI.

Una rama de implementación y un PR activos a la vez, salvo una dependencia explícitamente documentada. Un PR con CI fallido no se integra. No hacer push directo a develop/main ni reescribir migraciones ya aplicadas. Las herramientas de prueba apuntan solo a la base local desechable validada; acceso real e infraestructura se preparan como acciones operativas concretas.

## Promoción y cierre

main sigue siendo la rama estable. La integración en develop no solicita un despliegue ni acredita aceptación del producto. La promoción se hace por PR separado cuando la entrega correspondiente esté validada. main conserva actualmente revisión independiente: antes de promover, disponer de revisor o decidir expresamente cómo adaptar esa regla al trabajo individual. No eludirla con una aprobación ficticia.

Una tarea solo se marca completa cuando cumple sus condiciones de salida y tiene evidencia. Un PR integrado, una tabla creada y una función aceptada son hitos distintos. Incidencias, brechas y decisiones pendientes se conservan en la checklist y memoria; no se ocultan con una casilla de “sin errores conocidos”.

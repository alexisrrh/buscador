# Checklist priorizada de BuscaVacante

Referencia: especificación aportada por el usuario y [contraste de requisitos del 6 de noviembre de 2026](requirements-gap-analysis-2026-11-06.md).

Esta lista organiza el trabajo pendiente. La secuencia de entregas, dependencias y revisión se detalla en [Proceso de trabajo](WORK_PROCESS.md). Una casilla solo se marca cuando se cumplen sus condiciones de cierre y se registra la evidencia. Las funciones existentes se conservan y se adaptan según corresponda.

## Prioridad 1 Base recuperable y arquitectura

- [x] **01. Inventariar y proteger el trabajo local.** Cerrada el 6 de noviembre de 2026: 1.101 archivos clasificados, copia ZIP verificada por SHA-256, bundle validado y ambos stashes preservados. [Inventario, dependencias y propuesta de checkpoints](worktree-inventory-2026-11-06.md).
- [x] **02. Resolver los errores de lint.** Cerrada el 6 de noviembre de 2026: 0 errores y 0 advertencias, sin supresiones ni cambios de reglas; tipos/build correctos y 377 pruebas aprobadas, 15 omitidas. [Cambios y validación](lint-cleanup-2026-11-06.md).
- [x] **03. Consolidar una base reproducible.** Cerrada el 6 de noviembre de 2026 en `chore/checkpoint-base-20261106`: checkpoints locales, reconstrucción desde Git validada y política de assets preservados. `main` y ambos stashes conservados; sin push. [Base y evidencias](checkpoint-baseline-2026-11-06.md).
- [x] **04. Diseñar la transición de Supabase a la arquitectura del PDF.** Cerrada el 6 de noviembre de 2026: backend modular Next.js, PostgreSQL, Better Auth y Tigris; 22 tablas y 34 funciones clasificadas, inventario de 42 módulos, migración, aislamiento y reversión definidos. [Diseño y condiciones de implementación](architecture/TRANSITION_PLAN.md). Sin migración ejecutada ni cambios de producción.
- [x] **05. Establecer controles automáticos de integración.** Cerrada el 6 de noviembre de 2026: CI local y GitHub Actions correctos, cobertura superior al 80 % en cuatro métricas, protecciones verificadas en develop/main; develop adaptada a Self Review individual con PR y CI obligatorios. [Controles y evidencia](ci-quality-gates.md). PR #1 integrado en develop; main sin promoción.

## Prioridad 2 Identidad y datos privados

- [ ] **06. Preparar persistencia y autorización del backend propio.** En curso: 06A–06F integradas (incluida 06E1). 06E2 derivados integrada mediante PR #9: 22 tablas de 22 preparadas. 06G contratos/importación sintética preparada para revisión; después 07 Better Auth, 08 Tigris y 06H ensayo integral, con discrepancias de timestamps/padres históricos todavía abiertas. Completar tablas no equivale a migrar datos ni cierra esta tarea. [Entregas y criterios de cierre](WORK_PROCESS.md). Sin activar el destino.
- [ ] **07. Implementar Better Auth y completar la cuenta.** Registro con email de hasta 254 caracteres y contraseña de 12 a 128; login, recuperación de un uso con máximo de 15 minutos y cierre de sesión actual/todas. Cierre: flujos principales y fallidos probados, sin enumeración pública de cuentas.
- [ ] **08. Implementar almacenamiento privado en Tigris.** Subida, acceso temporal, descarga, versiones y eliminación autorizados desde backend. Validar PDF/DOCX, extensión, MIME, tamaño y pertenencia. Cierre: acceso cruzado denegado y conservación de versión previa ante fallos; acordar MB/MiB del límite.
- [ ] **09. Completar perfil profesional e historial.** Permitir consultar y actualizar datos, gestionar trayectorias y conservar el contexto usado por evaluaciones anteriores. Cierre: nombre entre 2 y 80 caracteres y cambios relevantes trazables sin modificar resultados históricos.
- [ ] **10. Separar extracción de confirmación de datos del CV.** Mostrar información extraída para revisar/corregir y confirmar explícitamente antes de usarla como evidencia. Cierre: ningún dato sin confirmar participa en generación o evaluación; un fallo conserva archivo y datos confirmados anteriores.

## Prioridad 3 Búsqueda y oportunidades fiables

- [ ] **11. Completar búsqueda pública y conversión a personalizada.** Puesto de 2 a 120 caracteres, ubicación de hasta 120 y modalidad válida; conservar intención al registrarse y permitir guardarla. Cierre: recorrido completo probado y varias búsquedas independientes sin mezclar preferencias.
- [ ] **12. Unificar ubicación interpretada y filtrado real.** Usar ciudad/región/país resueltos para la búsqueda y gestionar ambigüedad. Cierre: casos de A Coruña, España, Francia, Europe/EMEA y remoto comprobados; no convertir un país o alcance amplio en coincidencia local injustificada.
- [ ] **13. Completar preferencias, compatibilidad y explicaciones.** Incorporar rango salarial, restricciones obligatorias y tratamiento coherente de UNKNOWN. Cierre: faltantes críticos derivan a revisión cuando corresponda, resultados reproducibles y razones basadas en datos confirmados; sin porcentaje personal en búsqueda pública.
- [ ] **14. Corregir duplicados e identidad de fuentes.** Separar proveedor de board y detectar equivalencias entre portales. Cierre: reingestas idempotentes, IDs de boards sin colisiones y pruebas de vacantes equivalentes/distintas.
- [ ] **15. Automatizar actualización y vigencia del catálogo.** Programar ingestas respetando cada proveedor y reconciliar ofertas retiradas solo tras ejecuciones válidas. Cierre: una fuente caída no cierra ofertas indebidamente ni bloquea otras; reintentos, límites y caducidad verificados.
- [ ] **16. Completar acciones y navegación de oportunidades.** Detalle, guardar/descartar, filtros, ordenación, estados vacíos y errores recuperables; acceso claro a Oportunidades, Candidaturas y Perfil. Cierre: acciones privadas aisladas del registro neutral y recorrido usable en móvil/escritorio.
- [ ] **17. Alinear BV-01 y los estados visuales.** Conectar progreso real o identificar decoración; quitar afirmaciones de análisis de perfil inexistente. Cierre: revisión visual del globo y etiquetas, búsqueda sin bloqueo por coreografía, alternativa sin WebGL y movimiento reducido funcional.

## Prioridad 4 Candidatura completa

- [ ] **18. Conectar oportunidad pública con preparación interna.** Resolver la oferta y el contexto autorizado en servidor, reutilizar CV confirmado y crear/recuperar el borrador correcto. Cierre: desde Preparar mi candidatura se llega a un borrador real, conservando usuario, perfil, búsqueda y oferta.
- [ ] **19. Cerrar generación, edición y aprobación de materiales.** CV adaptado, mensaje/carta editables, validación tras cambios y revisión explícita antes de marcar listo. Cierre: afirmaciones sin respaldo bloqueadas o pendientes de revisión, aprobación invalidada si cambia contenido y descarga privada correcta.
- [ ] **20. Implementar seguimiento de candidaturas.** Preparada, Enviada, Entrevista, Oferta, Rechazada y Cerrada; registro manual de envío, notas y fechas. Cierre: cambios con fecha/estado anterior/nuevo, historial conservado y advertencia de duplicados por usuario y vacante equivalente. Sin envío automático externo.

## Prioridad 5 Privacidad, avisos y operación

- [ ] **21. Completar privacidad y control de datos.** Consentimientos opcionales con fecha, preferencias, exportación y eliminación de datos y documentos según política definida. Cierre: operaciones autenticadas, alcance de retención documentado y eliminación/exportación verificadas sin afectar a otros usuarios.
- [ ] **22. Implementar roles y auditoría.** Administrador y soporte con mínimo privilegio; supervisión de fuentes e incidencias. Cierre: asignaciones/revocaciones y operaciones sensibles auditadas; soporte sin acceso privado innecesario.
- [ ] **23. Implementar notificaciones internas y por email.** Categorías opcionales, preferencias, dedupe, registro de fallos y reintentos. Cierre: un evento no duplica aviso por canal y fallos de entrega no bloquean la operación; recuperación y seguridad independientes de preferencias opcionales.
- [ ] **24. Implementar métricas e instrumentar el piloto.** Embudo real, valoraciones de relevancia, duplicados y línea base de tiempo. Cierre: métricas derivadas de eventos reales y protocolo para medir objetivos del PDF; los objetivos de semanas de uso quedan pendientes hasta disponer de datos.

## Prioridad 6 Aceptación y publicación

- [ ] **25. Validar accesibilidad y compatibilidad.** WCAG 2.2 AA, teclado, lector, foco, contraste, movimiento reducido, 320 a 1920 px y navegadores exigidos. Cierre: evidencias por tarea y defectos bloqueantes corregidos.
- [ ] **26. Validar seguridad y rendimiento.** Autorización adversarial, secretos, dependencias, fallos externos y P95 menor a 3 segundos con carga definida. Cierre: resultados reproducibles y vulnerabilidades altas/críticas mitigadas según especificación.
- [ ] **27. Preparar y probar operación.** Entornos separados, TLS, monitorización, alertas, copias cada 24 h y restauración de datos/documentos. Cierre: restauración probada y procedimientos de despliegue/reversión reproducibles.
- [ ] **28. Ejecutar aceptación integral y preparar publicación.** Recorrer cuenta, búsqueda, CV confirmado, candidatura, seguimiento y privacidad en preproducción equivalente. Cierre: código y documentación sincronizados, excepciones explícitas y evidencia de requisitos aplicables; publicación como acción final separada.

## Registro de avance

| Tarea | Estado | Evidencia de cierre |
| --- | --- | --- |
| 01 | Completada | [Inventario y copia verificada](worktree-inventory-2026-11-06.md). Sin cambios funcionales ni commits. |
| 02 | Completada | [Lint limpio y regresión](lint-cleanup-2026-11-06.md). Sin commits ni push. |
| 03 | Completada | [Checkpoints y reconstrucción](checkpoint-baseline-2026-11-06.md). |
| 04 | Completada | [Diseño de transición](architecture/TRANSITION_PLAN.md) e inventario estático. |
| 05 | Completada | [CI, cobertura y protecciones verificadas](ci-quality-gates.md). PR #1 integrado en develop por el usuario; develop en modo individual. |
| 06 | En curso | PR #9 integrado y PR #10 promovido a main. 06G laboratorio de contratos/importación sintética preparado; evidencia/revisión en el PR. Después 07/08 y 06H. |
| 07 a 28 | Pendiente | Se actualizará al resolver cada tarea. |

Al cerrar una tarea: marcar la casilla, registrar pruebas y checkpoint, actualizar el contraste afectado y seleccionar la siguiente dependencia disponible. Esta checklist no marca como pendiente de reconstrucción aquello que ya existe: cada tarea debe reutilizar su implementación válida y cerrar las brechas identificadas.

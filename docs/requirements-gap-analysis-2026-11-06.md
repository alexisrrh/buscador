# Contraste de requisitos de BuscaVacante

Fecha: 6 de noviembre de 2026. Base local: HEAD `0913134`, con cambios posteriores sin commit.

Referencia: `C:/Users/alexi/Downloads/BuscaVacante_AUDITORIA_FINAL.pdf`, 41 páginas. Se contrastan los 126 identificadores de la sección 4 y los procesos, integraciones y condiciones de entrega de las secciones posteriores. Los títulos de requisitos se abrevian; sus condiciones completas siguen en el PDF.

## Conclusión

El proyecto contiene una base reutilizable de búsqueda, catálogo, adaptadores, evaluación determinista, CV privados y generación de candidaturas. No cumple todavía el alcance completo de la especificación. La arquitectura de autenticación y almacenamiento difiere de la requerida y el recorrido público no desemboca en una preparación y seguimiento completos.

Las brechas principales son Better Auth/backend propio/Tigris; recuperación y gestión de sesiones; revisión explícita de información extraída; gestión de perfiles; seguimiento de candidaturas con los estados acordados; notificaciones; privacidad y roles administrativos. Las fases visuales también requieren ajustes para representar operaciones reales o identificarse claramente como decorativas.

No se asigna un porcentaje global de cumplimiento: mezclar funciones parcialmente implementadas con requisitos de producción no medidos daría una precisión engañosa.

## Alcance de la comprobación

Actualización posterior del 6 de noviembre: la [tarea 02](lint-cleanup-2026-11-06.md) corrigió el lint a 0 errores y 0 advertencias; tipos/build pasan y la suite tiene 377 pruebas aprobadas, 15 omitidas. Los resultados de lint de la lista siguiente son la línea base del contraste, anterior a esa corrección. Las clasificaciones funcionales y de aceptación no cambian por este mantenimiento.

- Inspección del código local, migraciones SQL, pruebas, rutas y documentación. No se consultaron bases de datos remotas ni datos personales.
- Typecheck: correcto. Vitest: 373 pruebas aprobadas, 15 omitidas, 65 archivos aprobados y 11 omitidos. Resultados obtenidos en esta misma sesión, antes de añadir este informe.
- Lint: 25 errores y 28 advertencias. Incluye reglas de hooks y variables sin uso en componentes visuales.
- Compilación de producción ejecutada durante este contraste: correcta con Next.js 16.3.3.
- Sin nueva prueba en navegador, pruebas de carga, auditoría de dependencias ni verificación de servicios en producción. Las pruebas omitidas no acreditan integraciones reales.
- Antes del informe había 61 entradas en `git status --short` y dos stashes. Una entrada puede representar un directorio con varios archivos.
- La memoria declara última verificación el 10 de septiembre y conserva apartados superados por commits posteriores. No se usa como prueba suficiente de cumplimiento actual.
- Este informe no migra infraestructura, modifica lógica funcional ni cambia decisiones antiguas automáticamente.

## Estados

| Estado | Significado |
| --- | --- |
| Implementado | Hay implementación local identificable para el comportamiento revisado. No equivale a aceptación en producción. |
| Parcial | Existe una parte útil, pero falta una condición, integración o recorrido de usuario. |
| Pendiente | No se encontró implementación del comportamiento requerido en los módulos y rutas revisados. |
| Discrepancia | Se identificó un comportamiento que difiere expresamente del PDF. |
| Sin verificar | Requiere medición, configuración operativa o evidencia que no proporciona esta revisión local. |

Resultado de las 126 filas: 18 implementadas en el alcance local revisado, 67 parciales, 10 pendientes, 11 con discrepancias y 20 sin verificar. Son recuentos de requisitos, no una estimación de esfuerzo ni de avance porcentual.

## Evidencias de código

Los códigos E de las matrices remiten a estas rutas. Las pruebas citadas respaldan unidades concretas, no todos los criterios de un requisito.

| Código | Rutas y evidencia |
| --- | --- |
| E01 | [Autenticación](../app/actions/auth.ts), [registro](../app/(auth)/register/page.tsx), [sesión de servidor](../lib/supabase/server.ts), [proxy](../proxy.ts), `tests/auth-continuation.test.ts`, `tests/register-page-context.test.tsx`. |
| E02 | [Validación de intención](../lib/intent-first.ts), [entrada](../components/intent-entry.tsx), [acciones públicas](../app/actions/intent.ts), `tests/intent-first.test.tsx`, `tests/public-intent-action.test.ts`. |
| E03 | [Geocodificación](../app/api/location-geocode/route.ts), [selección geográfica](../lib/geographic-location-selection.ts), [límites](../app/api/location-boundary/route.ts), `tests/geographic-location-selection.test.ts`, `tests/geographic-boundary.test.ts`. |
| E04 | [Ciclo de CV](../app/actions/resumes.ts), [subida](../components/resume-uploader.tsx), [validaciones](../lib/validation.ts), [onboarding de CV](../components/resume-onboarding.tsx), migraciones `phase2_private_resumes`, `phase35_resume_storage_hardening`, `phase12_contextual_cv_onboarding`; `tests/contextual-resume-actions.test.ts`. |
| E05 | [Extracción](../lib/applications/resume-extractor.server.ts), [bootstrap de evidencia](../lib/applications/professional-evidence-bootstrap.server.ts), [preparación](../lib/applications/service.server.ts), `tests/resume-extraction-regression.test.ts`, `tests/professional-evidence-bootstrap.test.ts`. |
| E06 | [Perfiles redirigidos](../app/(private)/profiles/page.tsx), [nuevo perfil redirigido](../app/(private)/profiles/new/page.tsx), [onboarding persistido](../lib/onboarding/persistence.server.ts), `tests/profile-redirects.test.ts`, `tests/onboarding-persistence-server.test.ts`. |
| E07 | [Búsquedas](../app/actions/searches.ts), [formulario](../components/search-form.tsx), [tipos](../lib/types.ts), migraciones `phase1_core_identity_search`, `phase3_minimal_web`, `search_profile_state_transitions`, `onboarding_preference_states`; `tests/search-status-actions.test.tsx`. |
| E08 | [Registro de fuentes](../lib/job-sources/source-registry.server.ts), [ingesta global](../lib/job-sources/global-ingestion.server.ts), [cliente HTTP](../lib/job-sources/public-json-client.ts), adaptadores en `lib/job-sources/`; `tests/global-opportunity-ingestion.test.ts`, `tests/public-ats-adapters.test.ts`. |
| E09 | [Canonicalización](../lib/job-offers/canonicalization.ts), [ingesta](../lib/job-sources/ingestion.ts), [repositorio](../lib/job-sources/supabase-repository.ts), [catálogo](../lib/job-sources/public-catalog.server.ts), `tests/job-offer-canonicalization.test.ts`, `tests/job-ingestion.test.ts`, `tests/public-catalog.test.ts`. |
| E10 | [Motor determinista](../lib/matching/engine.ts), [servicio](../lib/matching/service.ts), [persistencia](../lib/matching/supabase-repository.server.ts), `tests/deterministic-matching.test.ts`. |
| E11 | [Oportunidades públicas](../app/oportunidades/page.tsx), [ranking público](../lib/job-sources/public-opportunities.server.ts), [resultados privados](../app/(private)/jobs/page.tsx), [guardar y descartar](../app/actions/jobs.ts), `tests/jobs-persisted-results.test.ts`, `tests/opportunities-workspace.test.tsx`. |
| E12 | [Acciones de candidatura](../app/actions/applications.ts), [borrador](../app/(private)/applications/drafts/[id]/page.tsx), [generación](../lib/applications/generator.ts), [validación](../lib/applications/validation.ts), [confirmaciones](../app/actions/requirement-confirmations.ts), `tests/application-preparation.test.ts`, `tests/requirement-resolution.test.ts`. |
| E13 | [CV derivado](../lib/derived-resumes/service.server.ts), [renderer](../lib/derived-resumes/renderer.server.ts), [descarga privada](../app/api/derived-resumes/[id]/route.ts), `tests/derived-resumes.test.ts`, `tests/adaptive-resume-layout.test.ts`. |
| E14 | [Motor de candidatura](../lib/application-engine/service.server.ts), [conector manual](../lib/application-engine/connectors.ts), [detalle](../app/(private)/applications/[id]/page.tsx), migración `20260902000200_phase8_application_engine.sql`, `tests/application-engine.test.ts`. |
| E15 | [Navegación privada](../app/(private)/layout.tsx), [landing](../components/public-intent-experience.tsx), [fases visuales](../components/search-visual-pipeline.tsx), [prototipo BV-01](../components/bv-01-animated-prototype.tsx), [renderer](../components/bv-01-renderer.tsx), [globo](../components/bv-01-hologram-globe.tsx), [CSS](../app/globals.css). |
| E16 | [Dependencias](../package.json), [TypeScript](../tsconfig.json), [Vitest](../vitest.config.ts), [entorno Supabase local](../supabase/config.toml), `supabase/tests/`, `tests/server-secret-boundary.test.ts`, [riesgos históricos](project-memory/RISKS.md). No se encontró `.github/` en la raíz revisada. |

## Requisitos funcionales

Fuente: sección 4.1, páginas 8 a 18.

| ID | Requisito | Estado | Evidencia y brecha para aceptación |
| --- | --- | --- | --- |
| RF-01 | Registro | Discrepancia | E01. Servidor acepta contraseña desde 8 caracteres; PDF exige 12 a 128. Email se trunca a 320 frente al máximo 254. Falta validar explícitamente límites y formato acordados. |
| RF-02 | Sesiones y recuperación | Parcial | E01. Login/logout existentes. No se encontró recuperación con enlace de un uso y 15 minutos, ni controles separados para cerrar sesión actual y todas. `signOut()` sin selector explícito no acredita ambas opciones. |
| RF-03 | Perfil profesional e historial | Parcial | E06. Modelo y actualizaciones de onboarding existen; páginas de perfiles redirigen. Falta gestión completa e historial profesional relevante con nombre entre 2 y 80 caracteres. |
| RF-04 | CV privado y versiones | Parcial | E04. PDF/DOCX, límite 10 MiB, propiedad y versiones. Extensión se comprueba en cliente, pero la acción de servidor no aplica esa misma comprobación. Falta validar aceptación completa, fallos y acceso privado en la arquitectura destino. Aclarar MB decimal frente a MiB. |
| RF-05 | Extracción confirmada | Discrepancia | E04/E05. Hay extracción, pero primer CV puede autoaprobarse; bootstrap crea registros `VERIFIED` desde extracción o borrador del CV aprobado. No se acredita revisión explícita de los datos extraídos antes de usarlos. Falta edición manual y recuperación completa ante fallo. |
| RF-06 | Búsqueda temporal y personalizada | Parcial | E02/E06. Búsqueda pública y persistencia de señales existen. Se acepta puesto de un carácter y se truncan excesos; PDF exige entre 2 y 120 tras trim. Falta completar y probar conversión de búsqueda pública a personalizada en la misma sesión. |
| RF-07 | Ubicación coherente | Parcial | E03/E10. Selector geográfico diferencia entidades y evita POI. La resolución se usa para visualización; matching sigue usando texto y heurísticas. Falta usar la entidad resuelta como criterio efectivo y recuperar ambigüedad/fallo visiblemente. |
| RF-08 | Preferencias versionadas | Parcial | E07. Preferencias y versiones existentes; salario mínimo no negativo en SQL. No se encontró salario máximo para comprobar máximo >= mínimo. |
| RF-09 | Activar, pausar y archivar | Implementado | E07/E10. Acciones y RPC de transición; motor comprueba búsqueda activa y conserva versiones. Confirmar ejecución real y conservación histórica tras migración. |
| RF-10 | Fuentes autorizadas aisladas | Parcial | E08. Adaptadores y aislamiento existen. Las condiciones actuales y disponibilidad de cada proveedor requieren revalidación antes de habilitarlos; esta revisión no certifica permisos externos. |
| RF-11 | Normalizar ofertas | Implementado | E08. Modelo compartido, adaptadores y pruebas de normalización; valores desconocidos previstos. |
| RF-12 | Duplicados de oferta | Parcial | E09. IDs y URLs canónicas implementados. Identidad proveedor/board y equivalencias entre fuentes siguen siendo brechas registradas. |
| RF-13 | Vigencia | Parcial | E09. Solo ACTIVE y observadas en 45 días en catálogo público. Falta programación de actualización y reconciliación de ofertas retiradas tras ejecuciones correctas. |
| RF-14 | Compatibilidad reproducible | Parcial | E10/E11. Motor determinista y puntuación/versionado. Falta acreditar perfil confirmado, integrar recorrido personalizado y corregir casos geográficos; oferta pública no muestra porcentaje personal. |
| RF-15 | Descartes y desconocidos | Parcial | E10. PASS/FAIL/UNKNOWN y REVIEW existen. `importantUnknown` no incluye experiencia desconocida; seniority desconocida sin señal explícita tampoco fuerza revisión. Revisar qué condiciones son realmente obligatorias. |
| RF-16 | Explicaciones veraces | Parcial | E10/E11. Razones por rol, ubicación, tecnologías y salario; no hay explicación completa de todos los componentes y faltantes. Falta validar razones con datos confirmados. |
| RF-17 | Listar, filtrar y ordenar | Parcial | E11. Listados y ranking existen. `/oportunidades` no ofrece todo el filtrado/ordenación descrito; preservar aislamiento en flujo personalizado. |
| RF-18 | Detalle y origen | Parcial | E09/E11. Enlaces y datos disponibles; canonicalizador restringe HTTP/HTTPS. Falta acreditar validación uniforme de enlaces antes de renderizado y detalle completo desde resultados públicos. |
| RF-19 | Guardar y descartar | Parcial | E11. Acción privada SAVED/DISMISSED existe. No está integrada en las tarjetas públicas de Oportunidades. |
| RF-20 | Contexto de candidatura | Parcial | E04/E12. Preparación interna desde JobMatch existe. Ruta pública termina tras CV aprobado abriendo la oferta externa; falta puente hacia contexto interno y borrador. |
| RF-21 | CV adaptado veraz | Parcial | E05/E12/E13. Selección por evidencia y renderizado reutilizables. Depende de corregir confirmación de datos RF-05 y completar continuidad pública. |
| RF-22 | Mensaje y carta editables | Parcial | E12. Generación y edición de texto implementadas en borrador privado. Falta acreditar todas las afirmaciones editadas y completar acceso desde Oportunidades. |
| RF-23 | Validar y revisar documentos | Parcial | E12. Validador determinista y aprobación existen. Validación comprueba selección y catálogo de skills; no acredita todas las afirmaciones libres. `saveApplicationText` guarda texto por RPC sin llamar al validador TypeScript. Revisar cambios de texto, invalidación de aprobación y uso de datos confirmados. |
| RF-24 | Estados e historial | Discrepancia | E14. Enum actual PREPARED/READY/SUBMITTING/SUBMITTED/FAILED/BLOCKED/WITHDRAWN. PDF exige Preparada/Enviada/Entrevista/Oferta/Rechazada/Cerrada y fecha, anterior y nuevo por cambio. No hay UI de transición equivalente. |
| RF-25 | Notas e historial privado | Parcial | E14. Eventos de motor y auditoría visibles; no se encontró editor de notas de seguimiento del candidato. |
| RF-26 | Candidaturas duplicadas | Parcial | E14. Unicidad por usuario/oferta/perfil y controles de motor. PDF exige comprobar mismo usuario y vacante equivalente, también entre perfiles/fuentes. Falta flujo de registro manual de envío. |
| RF-27 | Notificaciones internas y email | Pendiente | E07/E16. Umbrales de notificación no constituyen un sistema de avisos. No se encontró módulo activo con categorías, canales, dedupe, entrega y reintentos. |
| RF-28 | Métricas reales | Pendiente | E14/E16. Existen eventos técnicos, pero no panel del embudo con entrevistas/ofertas; depende del seguimiento. |
| RF-29 | Acompañamiento visual | Parcial | E15. BV-01, paneles, globo y texto presentes. Fases se derivan de tiempo de animación o timers, sin eventos de backend; 'Analizando perfil' aparece en búsqueda pública. Deben ser fieles o claramente decorativas. |
| RF-30 | Administración de fuentes | Parcial | E08. Registro y salud persistidos; falta interfaz administrativa con rol y permisos específicos. |
| RF-31 | Auditoría sensible | Parcial | E14/E16. Eventos de candidaturas existentes; falta auditoría transversal de seguridad, administración y permisos. |
| RF-32 | Exportar o eliminar datos | Pendiente | E04/E16. Borrado lógico de CV no satisface exportación/eliminación de datos de cuenta y derivados. |
| RF-33 | Consentimientos | Pendiente | E01/E16. No se encontró gestión persistida de consentimientos opcionales, finalidad y fecha. |
| RF-34 | Roles de administración y soporte | Pendiente | E16. No se encontró gestión de estos roles y asignación/revocación auditada. Roles de PostgreSQL/Supabase no equivalen a esos roles de producto. |

## Requisitos no funcionales

Fuente: sección 4.2, páginas 18 y 19.

| ID | Requisito | Estado | Evidencia y brecha para aceptación |
| --- | --- | --- | --- |
| RNF-01 | P95 de búsqueda menor a 3 s | Sin verificar | E09/E11. Hay tiempos registrados; no hay prueba bajo carga de referencia de producción ni P95 demostrado. Definir tamaño de catálogo, concurrencia y hardware. |
| RNF-02 | Respuesta visual menor a 500 ms | Sin verificar | E02/E15. Estados de espera existentes; falta medición en dispositivos y operaciones representativas. |
| RNF-03 | Disponibilidad 99,5 % | Sin verificar | Requiere monitorización mensual y definición de mantenimientos; el código local no lo demuestra. |
| RNF-04 | HTTPS y TLS | Sin verificar | E08. URLs externas usan HTTPS en integraciones revisadas. Falta comprobar configuración TLS del despliegue y todos los accesos sensibles. |
| RNF-05 | Aislamiento multiusuario | Parcial | E04/E14/E16. RLS/FORCE RLS, claves compuestas y SQL de aislamiento. No se reejecutaron pruebas SQL; futura arquitectura debe preservar controles en backend, DB y archivos. |
| RNF-06 | Secretos protegidos | Parcial | E16. Separación server-only y prueba de límite cliente; no se realizó auditoría de secretos de historial/producción. Riesgos históricos de datos heredados siguen registrados. |
| RNF-07 | Privacidad y minimización | Parcial | E04/E16. CV privado y datos por propietario; faltan exportación, eliminación, consentimientos y política operativa verificable. |
| RNF-08 | WCAG 2.2 AA | Sin verificar | E15. Etiquetas, foco y ARIA parciales no acreditan AA. Falta evaluación automática y manual de tareas, teclado, contraste y lector. |
| RNF-09 | Adaptativo 320 a 1920 px | Sin verificar | E15. CSS responsive existe; falta prueba visual y funcional sistemática en ese rango. |
| RNF-10 | Navegadores requeridos | Sin verificar | No hay matriz ejecutada de las dos últimas versiones de Chrome, Edge, Firefox y Safari. |
| RNF-11 | Movimiento reducido | Parcial | E15. matchMedia, CSS y alternativa estática presentes. Verificar landing, globo, navegación y todas las animaciones con preferencia activa. |
| RNF-12 | Aislamiento de fallos externos | Implementado | E08. Ingesta aísla proveedores y pruebas conservan resultados de la fuente exitosa cuando otra falla. |
| RNF-13 | Timeout y backoff | Parcial | E08/E03. Cliente con timeout y reintentos acotados; espera de Retry-After sin máximo global explícito y política no uniforme entre todas las integraciones. |
| RNF-14 | Backups y restauración | Sin verificar | No se verificó backup cada 24 h ni restauración probada de DB y documentos. |
| RNF-15 | Observabilidad | Parcial | E04/E11. Logs estructurados de algunas operaciones; no hay evidencia completa de monitorización, alertas y redacción uniforme. |
| RNF-16 | Cobertura de negocio 80 % | Implementado | [Tarea 05](ci-quality-gates.md): cuatro umbrales de 80 % y 22 módulos explícitos; líneas 95,93 %, sentencias 91,24 %, funciones 94,82 %, ramas 81,20 % en copia limpia. No equivale a cobertura de toda la aplicación. |
| RNF-17 | Vulnerabilidades mitigadas | Sin verificar | E16. No se ejecutó auditoría actual de dependencias; no inferir ausencia de vulnerabilidades por build correcto. |
| RNF-18 | UTF-8 | Parcial | Código y renderizado permiten español. Falta validar entradas/salidas, almacenamiento, logs y documentos de extremo a extremo. |

## Requisitos de dominio

Fuente: sección 4.3, página 20.

| ID | Requisito | Estado | Evidencia y brecha |
| --- | --- | --- | --- |
| RD-01 | Vacante real identificable | Implementado | E08/E09. Ofertas normalizadas y referencias de origen; no se generan ofertas ficticias cuando no hay resultados. |
| RD-02 | Procedencia | Implementado | E09/E11. Fuente y URL persistidas y mostradas. |
| RD-03 | Datos desconocidos | Parcial | E08/E10/E11. null/UNKNOWN y etiquetas presentes. Revisar interpretación de faltantes y completitud de razones. |
| RD-04 | Vacantes duplicadas | Parcial | E09. Equivalencia entre fuentes y colisiones por board pendientes. |
| RD-05 | Geografía explícita | Parcial | E03/E10. Existen reglas, pero `locationGate` acepta Europe/EMEA cuando hay cualquier país aceptado; una coincidencia de país puede satisfacer una ciudad solicitada. Entidad visual y filtrado no están unificados. |
| RD-06 | Modalidad basada en evidencia | Parcial | E08/E10. UNKNOWN previsto; verificar cada adaptación y deducciones de modalidad frente a fixtures representativos. |
| RD-07 | Seniority desconocida | Parcial | E10. UNKNOWN existe; combinaciones de marcadores y tratamiento de revisión requieren calibración. |
| RD-08 | Ofertas vigentes | Parcial | E09. Ventana de observación aplicada; falta reconciliación activa de retirada/caducidad. |
| RD-09 | Oferta neutral separada de evaluación | Implementado | E09/E10. JobOffer y JobMatch separados con contexto de búsqueda y candidato. |
| RD-10 | Evidencia confirmada | Parcial | E05/E12. Selección restringida a evidencia, pero debe corregirse la promoción a VERIFIED sin confirmación explícita de extracción. |
| RD-11 | IA asistiva | Implementado | E10/E12/E14. Motor de reglas y validación determinista independientes de IA; el conector no envía. Esto no acredita exhaustividad del validador de texto libre. |
| RD-12 | Postulación bajo control del usuario | Implementado | E14. Todos los conectores resuelven al manual y `submit` lanza `REAL_SUBMISSION_NOT_IMPLEMENTED`. Modelos AUTO heredados no prueban envío real activo. |
| RD-13 | Condiciones de fuentes | Sin verificar | E08. Mecanismos documentados en memoria; términos y accesos actuales requieren revisión por proveedor. |
| RD-14 | Protección de datos | Parcial | E04/E16. Controles técnicos parciales; faltan capacidades de privacidad y revisión operativa aplicable. |
| RD-15 | Estados trazables | Discrepancia | E14. Estados del motor no cubren el catálogo de seguimiento del PDF. |

## Requisitos de usuario

Fuente: sección 4.4, página 21. Estas filas remiten a las brechas funcionales correspondientes.

| ID | Necesidad | Estado | Evidencia y brecha |
| --- | --- | --- | --- |
| RU-01 | Búsqueda sencilla del visitante | Parcial | E02/E03/E11; RF-06/RF-07. Validación y resolución efectiva pendientes. |
| RU-02 | Cuenta y recuperación | Parcial | E01; RF-01/RF-02. Recuperación y límites por corregir. |
| RU-03 | CV y perfil | Parcial | E04/E05/E06; falta gestión y confirmación de datos. |
| RU-04 | Varias búsquedas | Parcial | E07. Modelo y rutas admiten búsquedas; onboarding canónico selecciona una. Falta acceso claro y pruebas del recorrido completo. |
| RU-05 | Oportunidades compatibles | Parcial | E10/E11; matching existente, continuidad personalizada y calibración pendientes. |
| RU-06 | Explicar compatibilidad | Parcial | E10/E11; razones existentes, faltantes y trazabilidad confirmada por completar. |
| RU-07 | Guardar y descartar | Parcial | E11; operación interna no integrada en Oportunidades. |
| RU-08 | CV y mensaje veraces | Parcial | E12/E13; generación reutilizable, confirmación y continuidad pendientes. |
| RU-09 | Seguimiento e entrevistas | Discrepancia | E14; RF-24/RF-25. |
| RU-10 | Avisos pertinentes | Pendiente | RF-27. |
| RU-11 | Móvil y escritorio | Sin verificar | E15. Responsive presente; falta aceptación multidispositivo. |
| RU-12 | Privacidad y control de datos | Parcial | E04/E16; RF-32/RF-33 pendientes. |
| RU-13 | Reducir movimiento | Parcial | E15; verificar equivalencia funcional completa. |
| RU-14 | Supervisión de fuentes | Parcial | E08; salud interna disponible, panel/rol pendientes. |
| RU-15 | Soporte con mínimo privilegio | Pendiente | RF-34. |

## Requisitos de negocio

Fuente: sección 4.5, página 22. Los indicadores del piloto requieren datos reales y no se consideran cumplidos por tener funciones relacionadas.

| ID | Resultado | Estado | Evidencia y brecha |
| --- | --- | --- | --- |
| RN-01 | Ahorrar al menos 50 % de tiempo en 8 semanas | Sin verificar | Sin línea base individual y medición de piloto aportadas. |
| RN-02 | Al menos 70 % de valoraciones relevantes | Sin verificar | Falta mecanismo de valoración y medición representativa. |
| RN-03 | Menos de 2 % de duplicados | Sin verificar | Requiere muestra auditada; dedupe parcial no acredita tasa. |
| RN-04 | Aprovechar oportunidades compatibles | Sin verificar | Falta línea base y medición mensual de guardado/preparación. |
| RN-05 | Conversión a entrevista y oferta | Pendiente | Sin seguimiento completo ni indicadores; implementar RF-24/RF-28. |
| RN-06 | Todos los documentos listos validados y revisados | Parcial | E05/E12/E13. Aprobación existente; confirmar datos extraídos y controlar texto editado antes de acreditar el 100 %. |
| RN-07 | Fuentes extensibles | Implementado | E08. Adaptadores y modelo común con pruebas; mantener contratos por cada nueva fuente. |
| RN-08 | Cero accesos cruzados confirmados | Sin verificar | SQL de aislamiento y controles existen; no prueban ausencia de incidentes ni configuración actual de producción. |
| RN-09 | 90 % inicia búsqueda en menos de 2 minutos | Sin verificar | Falta prueba de usabilidad con participantes y resultados. |
| RN-10 | Medir relevancia y entrevistas | Pendiente | Falta panel e instrumentación del embudo; no usar volumen como sustituto. |

## Requisitos de interfaz

Fuente: sección 4.6, páginas 23 y 24.

| ID | Requisito | Estado | Evidencia y brecha |
| --- | --- | --- | --- |
| RI-01 | Oportunidades, Candidaturas y Perfil | Discrepancia | E15. Navegación privada solo ofrece Oportunidades y Salir; faltan Candidaturas, Perfil y cuenta. |
| RI-02 | Inicio con campos y acción | Implementado | E02/E15. Puesto, ubicación, modalidad y acción principal presentes. |
| RI-03 | Entrada de puesto accesible y validada | Parcial | E02. Label, placeholder y required; falta mínimo 2 y rechazo explícito de longitud excesiva en servidor. |
| RI-04 | Interpretación de ubicación | Parcial | E03/E15. Visualización de ubicación; falta resolución/fallo coherente con filtros de búsqueda. |
| RI-05 | Modalidades claras | Implementado | E02. Cualquiera, remoto, híbrido y presencial. |
| RI-06 | Fases reales de búsqueda | Discrepancia | E15. Fases basadas en animación/timers, no en consulta/evaluación reales. Separar decoración de progreso o conectar eventos reales. |
| RI-07 | Recursos visuales complementarios | Parcial | E15. BV-01 visual sin decisión de negocio; textos de fases y alternativas requieren revisión funcional. |
| RI-08 | Geografía legible y sin precisión falsa | Parcial | E03/E15. País/ciudad y contornos reales presentes; queda aceptación visual final y coherencia con búsqueda. |
| RI-09 | Datos de tarjeta | Implementado | E11. Título, empresa, ubicación, modalidad, fecha, fuente y acciones cuando hay datos. |
| RI-10 | Abrir e iniciar candidatura | Parcial | E11/E12. CTA conserva contexto hasta CV, pero no prepara borrador desde oferta pública. |
| RI-11 | Vacíos y errores recuperables | Parcial | E11/E04. Vacío con ajuste de búsqueda y errores de subida. Falta manejo uniforme de fallos del catálogo en ruta pública. |
| RI-12 | Nombres, foco y teclado | Sin verificar | E15. Controles etiquetados; falta auditoría manual/automática de tareas principales. |
| RI-13 | Adaptativo | Sin verificar | E15. CSS disponible; no se ha aceptado todo el rango de pantallas. |
| RI-14 | Movimiento reducido | Parcial | E15. Implementado en componentes; comprobar todas las escenas y controles. |
| RI-15 | Español comprensible | Parcial | E11/E14. Idioma español predominante; permanecen Score, Match, códigos y estados internos en pantallas de candidaturas. |
| RI-16 | Privacidad en administración/soporte | Pendiente | RF-30/RF-34: pantallas y permisos no implementados. |

## Restricciones técnicas

Fuente: sección 4.7, páginas 24 y 25.

| ID | Restricción | Estado | Evidencia y brecha |
| --- | --- | --- | --- |
| RT-01 | Next.js 16 o compatible | Implementado | E16. Next.js 16.3.3. |
| RT-02 | React 19 o compatible | Implementado | E16. React y React DOM 19.2.8. |
| RT-03 | TypeScript estricto y control de tipos | Implementado | E16. strict=true y comando typecheck correcto; obligatoriedad de integración se trata en RT-13. |
| RT-04 | PostgreSQL 16 o posterior | Parcial | E16. Migraciones PostgreSQL y configuración Supabase local. No se verificó versión efectiva ni recursos de la arquitectura destino. |
| RT-05 | Better Auth | Discrepancia | E01/E16. Implementación y dependencias usan Supabase Auth; Better Auth no aparece en package.json. |
| RT-06 | Backend propio como autoridad | Discrepancia | E01/E04/E07. Hay código de servidor, pero negocio/autorización/persistencia dependen de Supabase y RPC. Requiere desacoplar sin perder controles. El PDF no obliga por sí solo a separar físicamente otro servidor de Next.js. |
| RT-07 | Tigris privado | Discrepancia | E04/E13. Archivos se suben y recuperan mediante Supabase Storage; falta adaptador Tigris y autorización de backend. |
| RT-08 | Integraciones desde servidor | Parcial | E03/E08. Fuentes y geografía desde servidor; subida privada directa del navegador a Supabase difiere del control de archivos esperado en destino. Verificar todos los canales sensibles. |
| RT-09 | Adaptadores de fuentes | Implementado | E08. Proveedores desacoplados del modelo común. |
| RT-10 | Secretos de servidor | Parcial | E16. Separación de entorno y server-only; falta verificación integral de historial, logs y despliegue. |
| RT-11 | Vitest antes de integrar | Parcial | [Tarea 05](ci-quality-gates.md): workflow y ejecución local reproducible; falta verificar ejecución remota y checks obligatorios. |
| RT-12 | Git privado y estrategia | Discrepancia | Remoto público verificado el 6 de noviembre; develop creada desde main y flujo PR documentado. Checkpoints consolidados; protección/revisión obligatoria pendientes. Visibilidad sin cambios. |
| RT-13 | CI/CD obligatorio | Parcial | [Tarea 05](ci-quality-gates.md): pipeline con lint, tipos, cobertura, pruebas y build. Falta ejecución remota y bloqueo de merges; sin despliegue automático. |
| RT-14 | WebGL con alternativa | Parcial | E15. Fallback y movimiento reducido presentes; comprobar también fallo de contexto y funcionalidad completa de landing/globo. |
| RT-15 | UTF-8 | Parcial | Igual que RNF-18; verificar fronteras de integración/documentos. |
| RT-16 | Entornos separados | Sin verificar | E16. Configuración local no acredita separación efectiva de desarrollo, pruebas y producción. |
| RT-17 | Orquestador sin autoridad de datos | Parcial | E08/E09. Catálogo en PostgreSQL; falta completar backend destino y programación operativa de ingestas. |
| RT-18 | Sin envío automático inicial | Implementado | E14. Conector manual sin submit real. Modelos AUTO y pantallas heredadas deben alinearse con alcance, sin confundirlos con una capacidad activa. |

## Procesos principales e integraciones

| Área del PDF | Estado | Condición para completar |
| --- | --- | --- |
| 5.1 Búsqueda | Parcial | Búsqueda pública funcional; integrar resolución geográfica efectiva y conversión a personalizada confirmada. |
| 5.2 Cuenta, perfil y CV | Parcial | Recuperación, gestión profesional, extracción revisable y confirmación explícita. |
| 5.3 Ingestión y catálogo | Parcial | Adaptadores y persistencia existentes; scheduler, reconciliación y dedupe entre fuentes. |
| 5.4 Evaluación | Parcial | Reglas y versionado existentes; revisar desconocidos, geografía y datos confirmados. |
| 5.5 Preparación | Parcial | Motor privado útil; completar puente público, confirmación y validación tras edición. |
| 5.6 Seguimiento | Discrepancia | Implementar estados del PDF, registro manual de envío, notas e historial. |
| 5.7 Notificaciones y supervisión | Parcial | Salud interna existente; avisos, canales y supervisión con roles pendientes. |
| 6 Tigris | Pendiente | Adaptador, objetos privados, enlaces temporales autorizados y migración verificable. |
| 6 Fuentes ATS | Parcial | Existentes; revalidar acceso y contratos actuales y controlar lifecycle. |
| 6 Geografía | Parcial | Nominatim y límites existentes; revisar política de uso, atribución, límites globales y autoridad de búsqueda. |
| 6 Correo | Parcial | Confirmación de cuenta delegada al proveedor actual; recuperación y avisos destino pendientes. |
| 6 IA | Parcial | Generación determinista disponible; decidir si se necesita proveedor generativo, minimizar contexto y validar fallos si se habilita. |
| 6 Observabilidad | Parcial | Logs locales no equivalen a servicio con alertas y disponibilidad. |
| 6 Despliegue y DNS/TLS | Sin verificar | Verificar ambiente objetivo, dominios, TLS, secretos y reversión. |
| 7 a 9 Operación, dependencias y riesgos | Parcial | Riesgos en memoria; alinearlos con arquitectura destino, privacidad, costes, recuperación y responsables. |
| 10 Entregables | Parcial | Código y pruebas existentes; faltan módulos, infraestructura destino y documentación sincronizada. |
| 11 Puesta en marcha | Sin verificar | Separación de entornos, copias, restauración, integración, despliegue reproducible y smoke test. |
| 12 Aceptación | Pendiente | Recorridos completos, evidencia de requisitos de producción y cierre de defectos bloqueantes. |
| 13 Gestión de cambios | Parcial | Este contraste registra diferencias; memoria y decisiones antiguas aún no reflejan la especificación adoptada por el usuario. |

## Diferencias que condicionan la implementación

1. **Arquitectura destino.** RT-05/06/07 especifican Better Auth, backend propio y Tigris. Las decisiones ADR-002/003/019/024/028 y el código actual dependen de Supabase. La especificación adoptada debe gobernar la transición, conservando PostgreSQL, controles de propiedad y pruebas.
2. **Confirmación profesional.** RF-05 distingue archivo aceptado de datos extraídos confirmados. Aprobar automáticamente el primer CV y marcar su extracción como VERIFIED no demuestra esa confirmación. Crear estados y revisión antes de evaluación/generación.
3. **Preparación desde Oportunidades.** Tras aprobar CV, `ResumeOnboarding` abre `context.offerUrl`. La preparación interna necesita JobMatch. Resolver identidad de oferta y contexto autorizado en servidor para enlazar ambos recorridos.
4. **Seguimiento real.** RF-24 requiere seis estados de negocio. Los estados técnicos del motor y su historial no equivalen al proceso de entrevistas y resultados.
5. **Geografía.** La entidad obtenida por geocodificación no gobierna el filtro. Ejemplo verificable en código: `locationGate` considera Europe/EMEA válida con cualquier país solicitado. Agregar pruebas de ciudad/región/país, remoto y elegibilidad antes de ampliar fuentes.
6. **Estados visuales.** RI-06 exige fases reales. Sin perfil confirmado no debe afirmarse 'Analizando perfil'; la animación puede acompañar sin presentar su tiempo como ejecución real del backend.
7. **Pruebas y aceptación.** Build correcto no elimina los 25 errores de lint, acredita seguridad ni demuestra objetivos del piloto. Definir comprobaciones exigibles por entrega.

## Orden propuesto de trabajo

| Orden | Entrega | Requisitos principales | Criterio de salida |
| --- | --- | --- | --- |
| 1 | Consolidar base y plan técnico | RT-03/05/06/07/11/12/13 | Inventario de cambios, estado reproducible, incidencias de lint clasificadas y diseño de transición con pruebas de aislamiento y reversión. |
| 2 | Identidad y almacenamiento destino | RF-01/02/04, RT-04 a RT-07 | Registro con límites, recuperación y sesiones verificadas; CV privado autorizado; transición probada sin pérdida de datos. |
| 3 | Perfil y evidencia confirmada | RF-03/05/08, RD-10 | Extraer, revisar, corregir y confirmar datos; preservar archivo e historial; ningún dato sin confirmar llega a generación/evaluación. |
| 4 | Búsqueda y catálogo fiables | RF-06 a RF-19 | Geografía unificada, UNKNOWN correcto, dedupe/lifecycle y acciones personales; fuentes con políticas actuales comprobadas. |
| 5 | Candidatura completa | RF-20 a RF-26, RI-01 | Oportunidad a borrador revisado, descarga y seguimiento con seis estados, notas, historial y dedupe de candidatura. |
| 6 | Avisos, privacidad y administración | RF-27 a RF-34 | Canales y preferencias, métricas reales, exportación/eliminación, consentimientos y roles auditados. |
| 7 | Aceptación y puesta en marcha | RNF, RN, RT-13/16, secciones 11/12 | Carga, accesibilidad, navegadores, seguridad, restauración, entornos y evidencias de piloto según corresponda. |

Las entregas pueden dividirse en cambios pequeños verificables. La consolidación de Git debe preservar los dos stashes y todos los cambios existentes; este análisis no autoriza borrados ni reescritura de historial. La creación de recursos de pago, publicación y migración de producción se concretarán por separado cuando exista un plan verificable.

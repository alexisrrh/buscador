# Corrección de lint de BuscaVacante

Fecha: 6 de noviembre de 2026. Tarea 02 de la [checklist](PRIORITY_CHECKLIST.md).

## Resultado

Se corrigieron los 25 errores y las 28 advertencias de ESLint. La configuración de reglas permanece intacta; no se añadieron supresiones ni se relajaron umbrales.

## Cambios

| Área | Corrección |
| --- | --- |
| Estado del navegador | `lib/browser-signals.ts` usa `useSyncExternalStore` para hidratación, URL y preferencias de movimiento/tamaño. Retira actualizaciones síncronas desde efectos que solo copiaban esos datos. |
| Entrada pública | El cierre fallido de búsqueda limpia las fases desde su callback. Los contornos se asocian al identificador de ubicación para no mostrar un resultado anterior mientras llega el nuevo. |
| Fases de loading | Reinicio condicionado al cambio de activación durante el render del propio hook; conserva timers, tiempos y limpieza al desmontar. |
| Globo | Identificador estable con `useId`; estado visual asociado a ubicación/búsqueda. Texturas de `useLoader` clonadas antes de configurarlas, con limpieza de las copias. |
| BV-01 | Registro de carga trasladado a efecto; geometría de depuración accedida mediante refs de escena. Telemetría actualizada mediante copias antes de publicar, sin mutar registros compartidos de QA. Dependencias de efectos completas y diagnóstico de transformación memoizado para no reiniciar acciones por identidad nueva. |
| Renderizado y poster | Comprobación WebGL programada en frame, fallback inmediato para capacidad conocida y reinicio del renderer cuando cambia forceFallback. Poster con Next Image sin optimización, mismo recurso/versionado y carga eager para conservar geometría y prioridad de carga. |
| Código sin uso | Retirados imports, bindings y helpers internos no referenciados, incluidos cálculos antiguos de raster/alcance. El código previo permanece en la copia de la tarea 01. |

Archivos existentes modificados: ocho componentes (`bv-01-animated-prototype`, `bv-01-hologram-globe`, `bv-01-renderer`, `bv-01-three-stage`, `hero-globe-stage`, `opportunities-search-experience`, `public-intent-experience`, `search-visual-pipeline`). Nuevos: el hook compartido y `tests/browser-signals.test.tsx`, además de documentación.

No se modificaron modelos, texturas fuente, escenas, CSS, lógica de matching, autenticación, almacenamiento ni configuración ESLint. Las huellas de los assets originales se contrastaron con el inventario de la tarea 01. HEAD, índice y ambos stashes se conservan; no se hizo commit ni push.

## Validación

| Comprobación | Resultado |
| --- | --- |
| `npm run lint -- --max-warnings 0` | Correcto: 0 errores y 0 advertencias. |
| `npm run typecheck` | Correcto. |
| Suite completa Vitest | 377 pruebas aprobadas, 15 omitidas; 66 archivos aprobados y 11 omitidos. |
| Pruebas nuevas | Hidratación sin recuperación por error, navegación atrás/adelante, cambio de movimiento reducido y retirada de listener, cancelación/reinicio de fases y limpieza de timers. |
| Regresión final focalizada | 20 pruebas aprobadas en navegador simulado, renderer, workspace y entrada pública tras el último ajuste de carga del poster. |
| `npm run build` | Correcto con Next.js 16.3.3. |
| `git diff --check` | Correcto; Git informa conversión LF/CRLF en archivos preexistentes. |

JSDOM sigue emitiendo avisos por falta de contexto canvas y la dependencia Three.js emite una deprecación CommonJS durante tests. No son advertencias de ESLint y no se ocultaron. No se instalaron paquetes para silenciarlas.

La validación automática no acredita revisión humana de la coreografía, WebGL real en todos los dispositivos ni cumplimiento WCAG. La aceptación visual completa continúa en las tareas 17 y 25; las 15 pruebas omitidas no acreditan integración externa.

## Continuación

Tarea 02 completada. Siguiente: tarea 03, revisar los checkpoints y consolidar una base reproducible, resolviendo el tratamiento de materiales de assets preservados y sin aplicar stashes automáticamente. Usar el [inventario de dependencias](worktree-inventory-2026-11-06.md) como punto de partida y añadir estos cambios a su bloque de runtime/experiencia.

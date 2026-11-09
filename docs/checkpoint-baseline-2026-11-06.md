# Base reproducible de BuscaVacante

Fecha: 6 de noviembre de 2026. Cierre de la tarea 03 de la [checklist](PRIORITY_CHECKLIST.md).

## Resultado

Los cambios locales están consolidados en la rama `chore/checkpoint-base-20261106`. `main` conserva su HEAD original `0913134566e55044b569efa4205dc9e654526228`. No se hizo merge, push ni despliegue.

## Checkpoints locales

| Commit | Contenido |
| --- | --- |
| `10994b3` | Requisitos contrastados, checklist, informes, memoria e instrucciones aportadas por el usuario, incluida la plantilla de PR. |
| `f60feac` | Política de materiales locales en `.gitignore` y variante de `next-env.d.ts` generada por build. |
| `3d0631c` | Diagnóstico del catálogo y prueba correspondiente, conservando el mensaje público controlado. |
| `2c06c3f` | Experiencia pública, búsqueda/cache, geografía, runtime BV-01, dependencias completas, ocho assets públicos y pruebas, con las correcciones de lint de la tarea 02. |

Este informe, el cierre de checklist y la memoria se guardan en un checkpoint documental posterior. Los informes anteriores describen su estado histórico: sus frases sobre ausencia de commits no representan el estado posterior a esta tarea.

El bloque de runtime conserva juntas las dependencias cruzadas entre BV-01, pipeline visual, geografía y experiencia pública. Separarlo artificialmente habría dejado referencias a archivos nuevos sin versionar. No se mezcló ninguna de las versiones de los stashes.

## Reconstrucción comprobada

Se exportó el árbol preparado en Git con `git archive`, se extrajo en una carpeta nueva fuera del repositorio y se comprobó que contenía los ocho assets públicos y ninguna fuente `assets-src/` ni configuración privada `.env.local`. La plantilla versionada `.env.example` sí forma parte del archivo.

La reconstrucción reutilizó los bytes de 29.999 archivos de dependencias ya instaladas mediante enlaces duros, con una estructura de directorios propia. No se ejecutó una instalación nueva desde el registro npm ni se modificó el lockfile para esta validación. Por tanto, se acredita la completitud del código versionado y su ejecución con las dependencias instaladas, no la disponibilidad futura del registro ni una instalación desde cero.

| Comprobación sobre la reconstrucción | Resultado |
| --- | --- |
| ESLint con `--max-warnings 0` | 0 errores y 0 advertencias. |
| TypeScript | Correcto. |
| Vitest completo | 377 aprobadas y 15 omitidas; 66 archivos aprobados y 11 omitidos. |
| Next.js 16.3.3 build con Turbopack | Correcto, sin copiar `.env.local`. |
| Identidad del árbol preparado | `10c4ad84663ca301fb68e3a05cb00d7aef7e3032`, igual al árbol de `2c06c3f`. |
| Rutas y tamaño de assets | Ocho archivos de runtime incluidos, aproximadamente 25,15 MiB. |

La reconstrucción inicial detectó que una prueba de migración dependía de saltos de línea LF. Git genera CRLF en el archivo exportado bajo la configuración Windows actual. Se normalizó CRLF a LF únicamente al leer el SQL en `tests/onboarding-preference-state-migration.test.ts`; no se cambió la migración ni se debilitó la comprobación de su firma. Tras ese ajuste, se repitieron lint, tipos y la suite completa en la reconstrucción. El código de aplicación compilado no cambió con ese ajuste de prueba.

Las 15 pruebas omitidas y la ausencia de credenciales privadas significan que no se acreditan integraciones reales ni producción. La revisión humana de la coreografía y el cumplimiento visual de `DESIGN.md` tampoco se declaran completados por este checkpoint.

## Materiales y stashes conservados

Se aplica la [política de assets](asset-retention-policy.md): `assets-src/` y `assets/captura.png` continúan en disco y están ignorados en Git. Sus 1.033 archivos se compararon por SHA-256 con el manifiesto de la tarea 01, sin diferencias. No se borraron ni movieron escenas, backups ni renders.

Los dos stashes conservan los identificadores originales:

- `50e8ad8ea3ea33a57f2be48c5c189e5e6332cc77`: `abandoned-profile-intelligent-ui-wip`.
- `ddb64525b8909bc1dbab4f117f816dfa11f4e214`: `unexpected-2d-public-relevance-calibration`.

Las copias de recuperación previas continúan en `_local-backups/`, dentro de BUSCADOR y fuera del repositorio. La reconstrucción, manifiesto, archivo del árbol y resultado JSON de pruebas están en `_local-backups/task03-20261106/`. Este material local no se publica como parte del repositorio.

## Uso del checkpoint

La base de aplicación se recupera desde la rama y los commits, con las dependencias del lockfile y la configuración privada necesaria para la operación que se pretenda ejecutar. Las instrucciones actuales de `AGENTS.md` y `DESIGN.md` se mantienen con el contenido aportado. Sus referencias a Tailwind y estructura `src/` no implican que esta tarea haya migrado estilos o rutas.

El árbol queda limpio tras el checkpoint documental de cierre. La siguiente tarea es la 04: diseñar la transición a PostgreSQL, backend propio, Better Auth y Tigris, con integridad, aislamiento y reversión. No se inicia esa migración dentro de este checkpoint.

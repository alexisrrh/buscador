# Inventario del trabajo local de BuscaVacante

Fecha: 6 de noviembre de 2026. Tarea 01 de la [checklist](PRIORITY_CHECKLIST.md).

## Resultado

El trabajo previo está clasificado y protegido mediante una copia local verificada fuera del repositorio. No se modificó código funcional, índice de Git, HEAD ni stashes. Los checkpoints descritos son propuestas para la tarea 03; todavía no se han creado commits.

## Estado de partida

| Elemento | Resultado |
| --- | --- |
| Rama | `main` |
| HEAD | `0913134566e55044b569efa4205dc9e654526228` |
| Archivos versionados modificados | 18 |
| Archivos nuevos sin seguimiento | 1.083 |
| Total de archivos inventariados | 1.101 |
| Archivos preparados en el índice | 0 |
| Tamaño sin comprimir de archivos inventariados | Aproximadamente 1.327 MiB |
| Stashes | 2, conservados con los mismos identificadores |

Los 63 registros iniciales de `git status --short` agrupaban directorios. Por eso no equivalían a 63 archivos. Los recuentos anteriores describen el instante de la copia, antes de añadir este informe y actualizar la memoria.

## Copia de recuperación

Directorio local fuera del repositorio: `C:/Users/alexi/Desktop/PROYECTOS EN VERCEL/BUSCADOR/_local-backups/task01-20261106/`.

| Archivo | Contenido y comprobación |
| --- | --- |
| `working-tree.zip` | Bytes de los 1.101 archivos modificados/nuevos. Cada entrada se reabrió y comparó por SHA-256 con el manifiesto y con el archivo original. Tamaño aproximado: 1.289,4 MiB. |
| `inventory.json` | Ruta, estado, grupo, tamaño y SHA-256 de cada archivo; dependencias de imports locales entre archivos cambiados; rama, HEAD y stashes. Todas las rutas están clasificadas. |
| `working-tree.patch` | Diff binario completo de archivos versionados respecto a HEAD. No sustituye al ZIP para archivos nuevos. |
| `index.patch` | Estado del índice, vacío en este punto. |
| `history.bundle` | Objetos y referencias exportados con `git bundle create --all`; `git bundle verify` terminó correctamente. No se presupone que incluya todo el reflog de stashes antiguos. |
| `stash-0.patch`, `stash-1.patch` | Exportación con binarios y archivos sin seguimiento de ambos stashes. Complementan al bundle; no se aplicaron. |
| `SHA256SUMS.txt` | Huellas de los archivos de recuperación. |
| `snapshot.py` | Procedimiento local usado para crear y verificar la copia; no se ejecuta al iniciar la aplicación. |

La copia no incluye archivos ignorados como `.env.local`, `node_modules` o `.next`, ni es una imagen del ordenador. Está en el mismo disco: protege frente a cambios accidentales en el proyecto, pero no frente a pérdida del disco. No debe subirse a Git ni publicarse; incluye historial y trabajo heredado.

Para recuperar: comprobar huellas, preparar una carpeta nueva, recuperar la base del bundle y restaurar allí los archivos del ZIP según el manifiesto. Revisar los patches de stash por separado. No aplicar restauraciones sobre el árbol actual sin comparar los cambios posteriores. La integridad del ZIP y del bundle está comprobada; no se ejecutó una restauración completa en otra carpeta.

## Clasificación completa

| Grupo | Archivos | MiB aproximados | Tratamiento propuesto |
| --- | ---: | ---: | --- |
| 01 Documentación e instrucciones | 4 | 0,04 | Revisar AGENTS/CLAUDE y guardar especificación contrastada, checklist e inventario. |
| 02 Configuración del runtime | 3 | 0,31 | package.json, lock y configuración de caché; conservar junto a sus dependencias. |
| 03 Assets públicos de runtime | 8 | 25,15 | Seleccionar los realmente referenciados y conservar procedencia; no borrar variantes. |
| 04 Búsqueda pública y catálogo | 6 | 0,02 | Acción de búsqueda, caché corta, salarios y diagnóstico del catálogo con pruebas. |
| 05 Geografía | 7 | 0,02 | APIs, selección, límites y tipos con sus pruebas. |
| 06 Runtime BV-01 | 14 | 0,25 | Renderizado, animación, globo, estado y carga con pruebas. |
| 07 Diagnósticos de desarrollo | 2 | 0,003 | Persistencia/restauración de QA; revisar acoplamiento y condición de desarrollo. |
| 08 Fuentes de assets | 67 | 690,18 | Escenas, GLB, backups y materiales fuente; preservados, diferidos para estrategia de versionado. |
| 09 Pipeline de assets | 41 | 0,24 | Scripts y recursos auxiliares de generación; revisar reproducibilidad y rutas antes de versionar. |
| 10 Revisiones visuales | 925 | 610,49 | Capturas, frames y previews, incluida `assets/captura.png`; preservados y diferidos fuera del runtime. |
| 11 Archivo generado | 1 | 0,0003 | `next-env.d.ts`; cambió de rutas dev a build. Tratar como generado de Next, no como feature. |
| 12 Integración de experiencia | 23 | 0,29 | Landing, CSS, resultados, loading, formulario, paneles, presentación y pruebas. |

El manifiesto es el inventario exhaustivo por archivo. Los grupos 08, 09 y 10 están clasificados y deliberadamente diferidos, sin asumir que deban entrar completos en Git o en producción.

En `assets-src/` hay 26 `.blend`, 19 `.blend1`, 20 `.glb`, 910 `.png`, 10 `.json`, 1 `.zip`, 6 `.html` y 40 `.py`. El archivo individual mayor es un ZIP de origen de unos 82,7 MiB. No se eliminaron backups, escenas ni renders.

## Dependencias que condicionan los checkpoints

- La experiencia pública importa búsqueda, geografía, runtime BV-01 y diagnósticos.
- El runtime BV-01 importa geografía, diagnósticos y `search-visual-pipeline`, que pertenece a la integración de experiencia. Existe acoplamiento en ambos sentidos entre esos grupos.
- `app/layout.tsx` precarga el poster e incluye `DevSearchQaRestore`. Un commit de layout sin sus archivos nuevos dejaría imports incompletos.
- `components/intent-entry.tsx` usa `startPublicSearchIntent`; esta acción depende de la caché del servicio de oportunidades.
- Three.js, React Three Fiber y sus tipos se añadieron a package.json/lock. Deben acompañar al código que los importa.
- Las APIs geográficas y sus helpers no dependen del runtime 3D para su ejecución; pueden revisarse aparte, preservando sus tipos compartidos.

Assets referenciados explícitamente en el código/configuración revisados:

| Asset público | Referencia |
| --- | --- |
| `BV01_clean_blue_visor_base.glb` | `lib/bv01-model-asset.ts`, `next.config.ts` |
| `BV01_runtime_poster_lit.webp` | `lib/bv01-model-asset.ts`, consumido por renderers/layout |
| `BV01_runtime_animated_interact.glb` | `components/bv-01-animated-prototype.tsx` |
| `bv01-earth-landmask.webp`, `bv01-earth-coast.webp` | `components/bv-01-hologram-globe.tsx` |
| `BV01_runtime_poster.webp` | Cabecera de caché en `next.config.ts` |

`BV01_clean_blue_visor_poster.png` y `BV01_runtime_animated.glb` no aparecieron en esa búsqueda de referencias explícitas de aplicación; permanecen protegidos como variantes por revisar. No se consideran eliminables por ese único resultado.

## Stashes protegidos

| Referencia inicial | Identificador | Contenido observado por estadísticas |
| --- | --- | --- |
| `stash@{0}` | `50e8ad8ea3ea33a57f2be48c5c189e5e6332cc77` | `abandoned-profile-intelligent-ui-wip`: perfiles, acciones y CSS; 5 archivos. |
| `stash@{1}` | `ddb64525b8909bc1dbab4f117f816dfa11f4e214` | `unexpected-2d-public-relevance-calibration`: motor de matching, pruebas y memoria; 5 archivos. |

No se aplicaron ni mezclaron con el trabajo actual. El primero corresponde a una experiencia abandonada; el segundo requiere una revisión de calibración aparte. Ninguno se acepta automáticamente como implementación vigente.

## Propuesta de checkpoints

| Orden | Bloque | Contenido | Condición antes de guardarlo |
| --- | --- | --- | --- |
| C01 | Documentación e instrucciones | Matriz, checklist, este inventario, memoria actualizada y revisión de AGENTS/CLAUDE. | Referencias válidas y coherencia con el PDF; sin secretos ni historial privado copiado al informe. |
| C02 | Diagnóstico del catálogo | `lib/job-sources/public-catalog.server.ts` y prueba añadida en `tests/public-catalog.test.ts`. | Revisar redacción de logs; prueba y tipos correctos. Es separable de la nueva escena 3D. |
| C03 | Experiencia pública con dependencias completas | Resto de búsqueda pública, configuración/lock, geografía, runtime, diagnósticos, assets públicos necesarios, integración y pruebas. | Resolver tarea 02; validar tipos/tests/build, imports y experiencia visual. No dividir arbitrariamente BV-01 y pipeline por el acoplamiento identificado. |
| C04 | Materiales de creación de assets | Grupos 08/09/10, actualmente preservados y diferidos. | Decidir qué fuentes/scripts son canónicos, qué requiere LFS/almacenamiento separado y qué previews deben permanecer locales. No añadir masivamente 1,3 GiB con `git add .`. |
| C05 | Archivo generado | `next-env.d.ts`. | Acordar tratamiento con la versión de Next y separar cambios generados de funcionalidad. |

C03 es un bloque de revisión con dependencias completas, no una obligación de crear un commit enorme. Puede subdividirse después de extraer helpers compartidos o seleccionar hunks, siempre validando cada estado intermedio. No se ha realizado ese refactor durante el inventario.

Antes de exigir árbol limpio en la tarea 03, los materiales diferidos necesitarán una política explícita de seguimiento/ignorados y conservación. La copia actual permite decidirla sin perder archivos; este inventario no modifica `.gitignore` ni mueve materiales.

## Verificación y siguiente tarea

- 1.101 archivos clasificados; cero rutas sin grupo.
- ZIP reabierto y todas sus entradas contrastadas por SHA-256.
- Archivos originales sin cambios durante la creación de la copia.
- Bundle validado con Git.
- HEAD, índice y los dos stashes preservados durante la copia.
- Sin reset, restore, clean, stash apply/pop/drop, stage, commit ni push.
- Las únicas modificaciones posteriores de esta tarea son documentación de inventario, checklist y memoria. Se guarda una copia suplementaria de esos documentos junto al respaldo.

La tarea 01 queda cerrada con el inventario y la propuesta de checkpoints. La siguiente es la tarea 02: corregir los errores de lint con regresión de tipos, pruebas y build. La línea base previa sigue siendo 373 pruebas aprobadas, 15 omitidas y build/typecheck correctos; el inventario no volvió a ejecutar esas comprobaciones funcionales.

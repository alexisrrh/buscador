# Conservación y versionado de assets de BuscaVacante

## Assets necesarios para ejecutar la aplicación

Se versionan los ocho archivos existentes en `public/models/bv-01/`, junto con su código consumidor. Mantener las variantes públicas existentes evita descartar recursos sin una revisión específica. Cada uno pesa menos de 10 MiB y el conjunto ronda 25,15 MiB; en este checkpoint no se instala Git LFS ni se cambia la entrega de archivos.

La aplicación debe compilar y ejecutar sus pruebas sin depender de `assets-src/` ni de capturas de revisión. Los recursos públicos y el lockfile forman parte de su base reproducible. El versionado de URLs del runtime sigue en `lib/bv01-model-asset.ts` y el prototipo animado conserva su URL existente.

## Materiales de creación conservados fuera de Git

`assets-src/` contiene escenas, modelos fuente, backups de Blender, scripts, informes y renders de trabajo. Se conserva completo en su ubicación actual y se ignora explícitamente en Git, sin moverlo ni borrarlo. La captura local `assets/captura.png` recibe el mismo tratamiento. No se ignora la carpeta `public/`.

La tarea 01 inventarió 1.032 archivos en `assets-src/` y una captura en `assets/`. Esos 1.033 materiales están incluidos en la copia verificada de `_local-backups/task01-20261106/`, situada en la carpeta contenedora BUSCADOR, fuera del repositorio. El manifiesto guarda rutas, grupos, tamaños y SHA-256. La copia y el historial exportado son privados y no se añaden al repositorio.

Esta política permite reproducir la aplicación desde sus artefactos públicos, pero no pretende reconstruir los modelos 3D desde un clon del repositorio. Para reproducir la autoría se necesita recuperar los materiales preservados. Seleccionar una escena canónica, adaptar rutas de scripts y decidir un almacén externo o LFS se mantiene como trabajo de pipeline independiente. No se declara una fuente canónica ni una licencia nueva sin revisar su procedencia.

Los archivos ignorados continúan siendo trabajo conservado. No usar `git clean -x` ni otros procedimientos que los borren. La copia actual comparte disco con el proyecto; un respaldo externo será una mejora operativa posterior.

## Instrucciones y archivos generados

`AGENTS.md`, `DESIGN.md`, `CLAUDE.md` y `.github/PULL_REQUEST_TEMPLATE.md` se versionan. El contenido suministrado por el usuario se conserva. Sus referencias a Tailwind describen la guía aportada: este checkpoint no instala Tailwind, mueve código a `src/` ni rediseña el CSS existente.

`next-env.d.ts` ya estaba versionado. Se guarda la variante generada por build con `.next/types/`. Next puede regenerarlo al cambiar entre desarrollo y compilación; revisar ese diff como archivo generado, sin confundirlo con una modificación funcional ni eliminarlo del índice durante esta tarea.

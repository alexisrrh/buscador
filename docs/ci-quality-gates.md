# Integración continua y flujo de cambios

Fecha: 6 de noviembre de 2026. Tarea 05.

## Ejecución

Usar Node.js `24.15.0`, definido en `.node-version`, e instalar desde `package-lock.json` con `npm ci`. Ejecutar `npm run check`: lint sin advertencias, generación de tipos de rutas y TypeScript, suite completa con cobertura y compilación de producción, en ese orden. Cada error detiene el proceso y devuelve un código distinto de cero.

`.github/workflows/ci.yml` ejecuta el mismo comando en Ubuntu ante push, Pull Request, merge queue o ejecución manual. El check se llama **Quality gate**. No tiene filtros de rutas, `continue-on-error`, credenciales de producción ni despliegue. Usa permisos de lectura, checkout sin credenciales persistentes, acciones oficiales fijadas por SHA, caché de npm y límite de 20 minutos. Las ejecuciones anteriores de la misma referencia se cancelan al recibir cambios nuevos.

`next typegen` permite comprobar tipos desde un checkout sin `.next`; no es necesario disponer de una compilación local anterior. Fuente: documentación incluida con Next.js y [CLI oficial](https://nextjs.org/docs/app/api-reference/cli/next#next-typegen-options).

## Cobertura de negocio

Vitest y `@vitest/coverage-v8` usan la misma versión exacta `4.1.11`. Los cuatro umbrales globales son del **80 %**: líneas, sentencias, funciones y ramas. No hay actualización automática del umbral ni exclusiones por comentarios añadidas para superarlo.

El alcance explícito de `coverage.include` en `vitest.config.ts` incluye 22 módulos: validación de entradas e identidad, intención pública, límites y selección geográfica, canonicalización de ofertas, acceso a búsquedas, motor/servicio de matching, estado/persistencia de onboarding, análisis y generación de candidatura, prioridad/confirmación de evidencia, validación factual y contenido/maquetación del CV. Incluye archivos sin ejecutar, evitando medir solo los importados por los tests. [Configuración oficial de Vitest](https://vitest.dev/config/coverage).

El porcentaje es agregado dentro de ese alcance; no garantiza un 80 % por archivo. Se ejecutan también las pruebas de adaptadores, componentes y servicios, pero su código de integración, renderizado visual, wrappers de framework, persistencia externa y tipos no forman parte del denominador. Esto no acredita cobertura integral del sistema ni autorización real de la infraestructura futura. Añadir las nuevas reglas de negocio al alcance al implementarlas y revisar que ningún módulo crítico quede fuera.

Los informes locales quedan en `coverage/`: resumen JSON, HTML y LCOV, además de salida de consola. No se versionan. Las pruebas live o que requieren bases/credenciales siguen siendo optativas y sus omisiones se informan; no se presentan como integraciones verificadas.

## Validación local reproducible

Se reconstruyó una copia desde Git con los cambios de CI, fuera del repositorio, sin `.env.local`, assets de autoría ni `node_modules`. `npm ci --no-audit --no-fund` instaló 536 paquetes desde el lockfile; después `CI=true` y `npm run check` finalizaron correctamente:

| Control | Resultado |
| --- | --- |
| Lint | 0 errores y 0 advertencias |
| Tipos | `next typegen` y `tsc --noEmit` correctos |
| Pruebas | 377 aprobadas y 15 omitidas; 66 archivos aprobados, 11 omitidos |
| Líneas | 95,93 % (1.014/1.057) |
| Sentencias | 91,24 % (1.376/1.508) |
| Funciones | 94,82 % (403/425) |
| Ramas | 81,20 % (1.279/1.575) |
| Build | Producción con Turbopack correcto |

Pruebas negativas: un archivo temporal con un error TS2322 hizo fallar `npm run check` antes de pruebas/build; se retiró después. Ejecutar solo el test de identidad con los umbrales normales provocó fallo de las cuatro métricas. Los umbrales no se redujeron. YAML, eventos y comando del workflow también fueron comprobados. Logs privados en `_local-backups/task05-20261106/`, fuera de Git. La copia limpia se verificó en Windows. La ejecución [CI del push en Ubuntu](https://github.com/alexisrrh/buscador/actions/runs/42203043293) también finalizó correctamente con 377 pruebas aprobadas y 15 omitidas.

La instalación informó avisos de dependencias y auditoría; no se aplicó `npm audit fix` ni se modificaron paquetes ajenos a cobertura. La revisión de vulnerabilidades continúa en la tarea 26.

## Ramas y revisión

Por instrucción del usuario, `main` es estable y `develop` integra cambios. Cada trabajo se prepara en una rama propia, se sube y se propone mediante PR hacia `develop`. Una entrega validada pasa de `develop` a `main` por otro PR. No hacer pushes directos a las ramas permanentes. Commits y títulos: tipo Conventional Commits en inglés y descripción en español; ver `AGENTS.md` y [especificación](https://www.conventionalcommits.org/en/v1.0.0/).

Usar íntegramente `.github/PULL_REQUEST_TEMPLATE.md`. Marcar solo pruebas, revisión propia, revisión por otro desarrollador y ausencia de conflictos realmente verificadas. La primera entrega de arranque contiene también los checkpoints locales de las tareas 01–04, previamente ausentes en GitHub; los siguientes cambios deben salir de `develop` actualizado y tener alcance acotado.

## Activación remota y bloqueo de merges

El workflow fallido detiene su job; para impedir merges GitHub debe exigir **Quality gate** en las reglas de `develop` y `main`. La mera existencia del YAML no protege ramas. [Checks obligatorios de GitHub](https://docs.github.com/en/pull-requests/reference/status-checks).

Configurar en ambas ramas: PR obligatorio, al menos una aprobación de otra persona, invalidación de aprobaciones tras cambios nuevos, resolución de conversaciones, check **Quality gate** aprobado y rama actualizada, prohibición de force push/eliminación y aplicación a administradores sin bypass. No sustituir la revisión de otra persona por una aprobación del autor. Si aún no hay revisor, el PR permanece abierto.

`develop` se creó desde el commit remoto de `main` `0913134566e55044b569efa4205dc9e654526228`. La rama `ci/controles-calidad` está publicada y el [PR #1](https://github.com/alexisrrh/buscador/pull/1) apunta a `develop`, usa la plantilla y no tiene conflictos. Su ejecución específica de CI está en curso al registrar esta evidencia. No se ha integrado el PR ni promovido nada a `main`.

La protección requiere acceso administrativo: el conector devolvió 403 y el navegador estaba sin sesión. No se declara activada. La tarea 05 solo se cierra por completo después de una ejecución remota correcta y de verificar que esas reglas impiden integrar con CI fallido. El repositorio remoto figura público; RT-12 exige privado y continúa abierto hasta decidir/aplicar ese cambio de acceso por separado.

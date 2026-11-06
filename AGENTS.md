## Descripción del proyecto

Este proyecto es una aplicación web desarrollada con Next.js, TypeScript y Tailwind CSS.

El objetivo es mantener una aplicación escalable, organizada, segura, accesible y fácil de mantener.

## Tecnologías utilizadas

- Framework: Next.js (App Router)
- Lenguaje: TypeScript
- Interfaz: React
- Estilos: Tailwind CSS
- Gestor de paquetes: npm
- Análisis de código: ESLint

## Estructura del proyecto

text
src/
├── app/
│   ├── layout.tsx
│   ├── page.tsx
│   └── globals.css
├── components/
│   ├── ui/
│   ├── layout/
│   └── sections/
├── hooks/
├── lib/
├── services/
├── types/
└── utils/


Esta estructura es una referencia. Antes de crear carpetas o archivos, revisar la organización existente del proyecto.

## Instrucciones generales

- Analizar el código existente antes de realizar modificaciones.
- Respetar la arquitectura y las convenciones del proyecto.
- No instalar dependencias innecesarias.
- No modificar archivos que no estén relacionados con la solicitud.
- Priorizar soluciones simples, claras y fáciles de mantener.
- Evitar código duplicado.
- Utilizar nombres descriptivos para variables, funciones y componentes.
- No eliminar funcionalidades existentes sin autorización.
- No modificar archivos de configuración sin autorización.
- Responder y explicar los cambios en español.

## Reglas de Next.js

- Utilizar la arquitectura App Router.
- Priorizar Server Components siempre que sea posible.
- Utilizar Client Components únicamente cuando se requiera interactividad.
- Agregar "use client" solamente cuando sea necesario.
- Utilizar next/link para navegación interna.
- Utilizar next/image cuando sea apropiado para optimizar imágenes.
- Utilizar las herramientas de metadata de Next.js para SEO.
- Respetar las convenciones de rutas, layouts y manejo de errores de Next.js.

## Reglas de TypeScript

- Utilizar tipado estricto.
- Evitar el uso de any.
- Definir interfaces y tipos reutilizables cuando sea necesario.
- Aprovechar la inferencia de tipos.
- Validar los datos externos antes de utilizarlos.
- Manejar correctamente valores nulos y opcionales.

## Reglas para componentes

- Crear componentes reutilizables.
- Mantener cada componente enfocado en una responsabilidad.
- Separar la lógica de negocio de la presentación cuando sea conveniente.
- Utilizar nombres descriptivos.
- Utilizar PascalCase para los componentes React.
- Evitar estados innecesarios.
- Priorizar la composición de componentes.

## Reglas de estilos

- Utilizar Tailwind CSS.
- Consultar y respetar las especificaciones de DESIGN.md.
- No introducir colores arbitrarios cuando existan colores definidos.
- Mantener consistencia en espaciados, tipografía y componentes.
- Garantizar diseños responsivos.
- Evitar estilos en línea cuando no sean necesarios.

## Accesibilidad

- Utilizar HTML semántico.
- Agregar etiquetas accesibles a elementos interactivos.
- Garantizar navegación mediante teclado.
- Mantener contraste adecuado entre texto y fondo.
- Agregar textos alternativos a imágenes relevantes.

## Rendimiento

- Evitar JavaScript innecesario del lado del cliente.
- Optimizar imágenes y recursos.
- Evitar renderizados innecesarios.
- Utilizar estrategias eficientes para obtener datos.
- Evitar dependencias pesadas cuando existan alternativas simples.

## Seguridad

- Nunca exponer contraseñas, tokens o claves de API.
- No escribir credenciales directamente en el código.
- Validar las entradas del usuario.
- Manejar errores de manera segura.
- No exponer información sensible del servidor al cliente.

## Flujo de trabajo

### Ramas y Pull Requests

- `main` contiene la versión estable; `develop` es la rama de integración.
- Crear cada cambio en una rama independiente desde `develop`, por ejemplo `feat/perfil-profesional`, `fix/acceso-documentos` o `ci/controles-calidad`.
- Subir la rama a GitHub y abrir un Pull Request hacia `develop`. No trabajar ni hacer push directo a `develop` o `main`.
- Completar todas las secciones de `.github/PULL_REQUEST_TEMPLATE.md`, indicando cambios, pruebas, pendientes y observaciones. No marcar revisiones o validaciones que no hayan ocurrido.
- Integrar en `develop` después de aprobar CI y la revisión correspondiente. Promover `develop` a `main` mediante otro Pull Request cuando el conjunto esté validado.
- Los títulos de los Pull Requests siguen la misma convención de tipos en inglés y descripción en español que los commits.

### Mensajes de commit

- Seguir [Conventional Commits 1.0.0](https://www.conventionalcommits.org/en/v1.0.0/).
- Mantener el tipo en inglés: `feat`, `fix`, `docs`, `ci`, `test`, `refactor`, `perf`, `build`, `chore`, `style` o `revert`.
- Escribir la descripción y el cuerpo en español. Si se usa un alcance, escribirlo en español salvo nombres técnicos del proyecto.
- Formato: `tipo(alcance opcional): descripción en español`. Ejemplos: `feat: permitir guardar una búsqueda`, `fix: corregir el acceso a documentos`, `ci: añadir controles de calidad`.
- Indicar cambios incompatibles con `!` antes de los dos puntos; conservar identificadores de archivos, APIs y otros nombres técnicos cuando corresponda.

### Antes de modificar código

1. Comprender la funcionalidad solicitada.
2. Revisar los archivos relacionados.
3. Identificar patrones y dependencias existentes.
4. Determinar los cambios mínimos necesarios.
5. Consultar DESIGN.md cuando se trabaje con interfaces.

### Durante la implementación

1. Respetar la arquitectura existente.
2. Implementar únicamente lo solicitado.
3. Evitar refactorizaciones no relacionadas.
4. Conservar el comportamiento existente cuando no se soliciten cambios.
5. Reutilizar componentes y funciones disponibles.

### Después de implementar

1. Revisar los archivos modificados.
2. Verificar posibles errores de TypeScript.
3. Ejecutar las validaciones disponibles.
4. Ejecutar las pruebas correspondientes cuando existan.
5. Resumir los cambios realizados.

## Comandos de validación

Utilizar los comandos disponibles en package.json.

Comandos habituales:

bash
npm run lint
npx tsc --noEmit
npm run build


No asumir que existen comandos de pruebas si no están configurados.

## Formato de respuesta

Después de completar una tarea, proporcionar:

1. Resumen de los cambios realizados.
2. Archivos creados o modificados.
3. Validaciones ejecutadas y sus resultados.
4. Problemas pendientes, si existen.

## Restricciones importantes

- No reescribir archivos completos cuando sea suficiente modificar una sección.
- No instalar paquetes sin justificar su necesidad.
- No cambiar la arquitectura sin autorización.
- No introducir estilos que contradigan DESIGN.md.
- No eliminar código funcional sin autorización.
- Solicitar aclaraciones cuando los requisitos sean ambiguos

## Filosofía de diseño

La aplicación debe seguir un sistema de diseño moderno, minimalista, profesional y consistente.

La interfaz debe transmitir:

- Limpieza visual.
- Modernidad.
- Profesionalismo.
- Facilidad de uso.
- Accesibilidad.
- Consistencia.

Priorizar la experiencia del usuario, la jerarquía visual y la simplicidad.

## Paleta de colores

### Colores principales

- Primario: #6366F1
- Primario Hover: #4F46E5
- Primario Claro: #EEF2FF

### Colores neutros

- Fondo principal: #FFFFFF
- Fondo secundario: #F8FAFC
- Bordes: #E2E8F0
- Texto principal: #0F172A
- Texto secundario: #64748B
- Texto tenue: #94A3B8

### Colores de estado

- Éxito: #16A34A
- Advertencia: #F59E0B
- Error: #DC2626
- Información: #0284C7

## Tipografía

Utilizar una fuente moderna sin serifas.

Fuente preferida:

- Inter

### Jerarquía tipográfica

| Elemento | Tamaño | Peso |
|---|---|---|
| H1 | 48px | 700 |
| H2 | 36px | 700 |
| H3 | 24px | 600 |
| H4 | 20px | 600 |
| Texto normal | 16px | 400 |
| Texto pequeño | 14px | 400 |
| Etiquetas | 12px | 400 |

### Reglas

- Mantener consistencia tipográfica.
- Utilizar jerarquías visuales claras.
- Evitar demasiados pesos de fuente.
- Mantener alturas de línea legibles.
- Evitar párrafos excesivamente largos.
- Adaptar los tamaños de títulos a dispositivos móviles.

## Sistema de espaciado

Utilizar una escala consistente.

| Token | Valor |
|---|---|
| xs | 4px |
| sm | 8px |
| md | 16px |
| lg | 24px |
| xl | 32px |
| 2xl | 48px |
| 3xl | 64px |

### Reglas

- Mantener espaciados consistentes.
- Evitar valores arbitrarios.
- Utilizar suficiente espacio en blanco.
- Alinear los elementos mediante una cuadrícula.
- Mantener separación clara entre secciones.

## Bordes redondeados

- Pequeño: 6px
- Mediano: 10px
- Grande: 16px
- Extra grande: 24px
- Circular: 9999px

Utilizar bordes redondeados de forma consistente.

## Sombras

Utilizar sombras suaves y discretas.

Evitar:

- Sombras demasiado intensas.
- Efectos de brillo excesivos.
- Elevaciones exageradas.

Priorizar bordes y espaciados para separar elementos.

## Distribución de contenido

### Contenedor principal

- Ancho máximo: 1280px
- Espaciado horizontal escritorio: 32px
- Espaciado horizontal tableta: 24px
- Espaciado horizontal móvil: 16px

### Sistema de columnas

- Escritorio: 12 columnas.
- Tableta: 8 columnas.
- Móvil: 4 columnas.

### Puntos de adaptación

Seguir los puntos de ruptura de Tailwind CSS.

- Móvil: menos de 640px.
- Tableta: de 640px a 1023px.
- Escritorio: desde 1024px.

## Botones

### Botón principal

- Fondo: Color primario.
- Texto: Blanco.
- Radio de borde: 10px.
- Peso de fuente: 600.
- Altura: 44px.

### Botón secundario

- Fondo: Blanco.
- Borde: 1px sólido con color de borde.
- Texto: Color principal de texto.
- Radio de borde: 10px.

### Reglas

- Mantener alturas consistentes.
- Incluir estados hover.
- Incluir estados deshabilitados.
- Mostrar indicadores de enfoque para navegación con teclado.
- Evitar animaciones innecesarias.

## Tarjetas

Las tarjetas deben utilizar:

- Fondo blanco.
- Bordes sutiles.
- Radio de borde de 16px.
- Espaciado interno de 24px.

### Reglas

- Mantener una estructura visual consistente.
- Evitar sombras excesivas.
- Utilizar jerarquías claras de información.
- Mantener espaciados uniformes.

## Formularios

Los campos deben utilizar:

- Altura: 44px.
- Radio de borde: 10px.
- Color de borde: #E2E8F0.
- Fondo: Blanco.

### Reglas

- Mostrar etiquetas descriptivas.
- Comunicar claramente los errores.
- Utilizar estados de enfoque accesibles.
- Mantener separación uniforme entre campos.
- Mostrar mensajes de validación comprensibles.

## Navegación

La navegación debe ser:

- Simple.
- Consistente.
- Accesible.
- Responsiva.
- Fácil de comprender.

### Reglas

- Mostrar claramente la sección activa.
- Evitar demasiados niveles de navegación.
- Mantener consistencia entre páginas.
- Adaptar la navegación a dispositivos móviles.

## Iconografía

Utilizar una biblioteca de iconos consistente.

Biblioteca preferida:

- Lucide React.

### Reglas

- Mantener grosores de línea uniformes.
- Utilizar tamaños de 20px o 24px.
- Evitar mezclar diferentes estilos de iconos.
- Utilizar iconos para complementar el contenido.
- No reemplazar etiquetas importantes únicamente con iconos.

## Animaciones

Las animaciones deben ser sutiles y funcionales.

Duración recomendada:

- Entre 150ms y 300ms.

Utilizar animaciones para:

- Transiciones hover.
- Menús desplegables.
- Ventanas modales.
- Retroalimentación visual.

Evitar movimientos innecesarios.

Respetar las preferencias de movimiento reducido del usuario.

## Diseño responsivo

Todos los componentes deben funcionar correctamente en:

- Dispositivos móviles.
- Tabletas.
- Computadoras de escritorio.

### Reglas

- Diseñar primero para dispositivos móviles.
- Evitar desbordamientos horizontales.
- Utilizar distribuciones flexibles.
- Mantener áreas táctiles adecuadas.
- Garantizar que los textos sean legibles.

## Modo oscuro

El modo oscuro no es obligatorio.

No implementarlo automáticamente si no se solicita.

## Reglas de consistencia visual

Al crear o modificar componentes:

1. Respetar la paleta de colores.
2. Mantener la jerarquía tipográfica.
3. Utilizar espaciados consistentes.
4. Reutilizar componentes existentes.
5. Garantizar comportamiento responsivo.
6. Mantener la accesibilidad.
7. Evitar patrones visuales innecesarios.

## Restricciones

- No introducir colores nuevos sin autorización.
- No utilizar degradados aleatorios.
- No aplicar sombras excesivas.
- No utilizar bordes redondeados inconsistentes.
- No mezclar bibliotecas de iconos.
- No agregar complejidad visual innecesaria.
- No rediseñar componentes existentes sin autorización.
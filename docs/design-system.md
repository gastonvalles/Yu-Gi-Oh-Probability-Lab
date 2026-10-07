# Sistema de diseño

Una sola forma de hacer cada cosa. Antes de escribir clases sueltas, buscá si ya existe el componente.
Todo vive en `src/components/ui/` y los tokens en `src/index.css`.

## 1. Idea general

- **Oscuro, plano y con aire.** Fondo casi negro con manchas tenues de color, tarjetas apenas más claras, bordes finos. Sin brillos de adorno.
- **Base visual: el diseño de Figma "Task management & to-do list" adaptado al oscuro:** Lexend Deca, violeta `#5F33E1`, chips y botones lavanda, anillos de progreso, tarjetas redondeadas y barra inferior con íconos rellenos/duotono.
- **El color siempre significa algo** (ver tonos). Si no significa nada, va en gris.
- **30/70:** un ícono + un número + un color dicen lo principal; el texto sólo completa.
- **Mismo orden en toda pantalla:** encabezado (`StepHero`) → controles → tarjetas (`Card`) → detalle.

## 2. Tonos (color con significado)

| Tono | Significa | Ejemplos |
|---|---|---|
| `brand` (violeta `#5F33E1`) | lo tuyo: acción principal, selección | botón primario, pestaña activa, chip elegido |
| `success` (verde) | bien / listo | manos limpias, salida, regla cumplida |
| `warning` (naranja `#FF9142`) | ojo / a medio hacer | falta clasificar, "Mejorable" |
| `danger` (rojo) | mal / destructivo | problema, borrar, "Crítico" |
| `info` (azul `#0087FF`) | dato o consejo | avisos, build B, nota "Sólido" |
| `neutral` (gris) | sin énfasis | conteos, etiquetas |

Los roles de las cartas (starter, handtrap…) y los grupos (engine, non-engine…) tienen su paleta propia
(`--role-color`), no usan estos tonos. La literal de cada tono está en `ui/tone.ts`.

## 3. Tokens

- **Fuente:** Lexend Deca (400 · 600 · 700), autoalojada en `src/fonts/` (licencia OFL incluida).
- **Tipografía (6 pasos, los del diseño):** `text-micro` 11 · `body` 14 · `lead` 19 · `title` 24 · `stat` 33 · `display` 44.
  Nada de `text-[…]`. Cifras con `tabular-nums`.
- **Radios:** `rounded-tag` 8 (etiquetas, estados) · `control` 12 (chips, botones chicos, campos) · `card` 16 (tarjetas, botón grande) · `panel` 24 (tarjeta destacada, barra inferior, diálogos) · `rounded-full` (píldoras y puntos).
- **Elevación:** `shadow-card` · `shadow-raised` · `shadow-overlay` · `shadow-focus` (anillo de foco, el mismo en todo) · `shadow-brand` (brillo violeta de la acción principal).
- **Superficies:** `background` < `card-background` < `surface-raised` / `surface-hover`. Bordes: `border-border-subtle`. `lavender` (`bg-lavender`) es el fondo de chips, botones secundarios y barra inferior; `lavender-light` (`#EEE9FF`) el botón sobre una tarjeta violeta.
- **Margen móvil:** `px-gutter` (22 px).
- **Ancho:** `max-w-content` (80rem) centrado en todas las pantallas menos el Builder (usa todo el ancho).
- **Texto:** `text-foreground` → `text-muted` → `text-soft` (de más a menos importante). `*-soft` (p. ej. `text-primary-soft` `#AB94FF`) para texto sobre fondos teñidos.

## 4. Componentes

| Componente | Para qué |
|---|---|
| `Button` | `primary` (violeta con brillo, una por vista) · `secondary` (lavanda) · `tertiary` · `onBrand` (sobre tarjeta violeta); `color="danger"`; `icon` / `iconEnd`; `sm` 36 · `md` 44 · `lg` 50 (en táctil crecen solos). |
| `IconButton` / `CloseButton` | acciones sólo con ícono (siempre con `aria-label`). |
| `Card` | toda tarjeta: `level` card / inset / raised / **hero** (violeta, una por pantalla), `tone` (tarjeta teñida, como las "In Progress" del diseño), `padding`. |
| `ProgressRing` | anillo de progreso con el % al centro (42 px en listas, 76 px en una tarjeta destacada; `tone="onBrand"` sobre violeta; `color` para roles). |
| `Meter` | barras de nivel/progreso (misma altura y degradé). |
| `SectionHeader` | encabezado de tarjeta: ícono + título + descripción + acciones. |
| `StepHero` / `StepPage` | encabezado de cada paso y contenedor (ancho, márgenes y separación). |
| `Badge` | estado, conteo o tipo (`dot`, `icon`, `shape="tag"`); los conteos van en `tone="brand"`. |
| `Callout` / `EmptyState` | avisos y consejos / listas o pantallas vacías. |
| `Segmented` | elegir 1 entre pocas: `track` (pista lavanda), `chips` (pastillas sueltas) o `cards` (tarjetas, como las fechas del diseño: turno del Lab). |
| `LabeledField` | campo en tarjeta con la etiqueta chica arriba y el valor abajo (nombre y formato del deck). |
| `Modal` | todo diálogo (`icon` + `tone` en el encabezado, `footer` para acciones). |
| `Icon` | **único** set de íconos (grilla 24). `variant`: `linear` (por defecto), `bulk` (duotono, pestañas inactivas) y `bold` (relleno, pestaña activa). Nada de SVG suelto. |
| `field`, `choiceChip`, `filterChip`, `listItem` (`surfaces.ts`) | campos de texto, pastillas de selección (lavanda → violeta al elegirla) y filas clickeables. |

## 5. Navegación

- Pestañas con ícono (relleno en la activa, duotono en las demás) + nombre + dato en vivo (p. ej. `40 / 40`) + punto de estado (verde listo, naranja a medio hacer). La activa lleva fondo lavanda.
- **Mismos nombres en desktop y mobile:** Deck · Roles · Lab · Comparar · Exportar (el nombre completo va en el tooltip).
- Mobile: barra inferior lavanda con esquinas superiores de 24 px; la pestaña activa se rellena y se tiñe de violeta claro.

## 6. Reglas para sumar pantallas

1. Armá la pantalla con `StepPage` + `StepHero` + `Card`.
2. Cada bloque nuevo: un ícono de `Icon`, un título (`SectionHeader`) y, si hay un número clave, que sea lo más grande (o un `ProgressRing`).
3. Estados vacíos con `EmptyState`; avisos con `Callout`; errores en `danger`.
4. Tailwind sólo detecta clases literales: no armes clases con `${}`; para variantes usá `variants()` / `cx()`.
5. No mezcles dos utilidades de la misma propiedad en un elemento (p. ej. `rounded-control` y `rounded-none`).
6. Probá a 390 px, 1100 px y 1440 px antes de dar algo por terminado.

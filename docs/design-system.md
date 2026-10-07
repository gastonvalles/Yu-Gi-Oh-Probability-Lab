# Sistema de diseño

Una sola forma de hacer cada cosa. Antes de escribir clases sueltas, buscá si ya existe el componente.
Todo vive en `src/components/ui/` y los tokens en `src/index.css`.

## 1. Idea general

- **Oscuro, plano y con aire.** Fondo casi negro, tarjetas apenas más claras, bordes finos. Sin brillos de adorno.
- **El color siempre significa algo** (ver tonos). Si no significa nada, va en gris.
- **30/70:** un ícono + un número + un color dicen lo principal; el texto sólo completa.
- **Mismo orden en toda pantalla:** encabezado (`StepHero`) → controles → tarjetas (`Card`) → detalle.

## 2. Tonos (color con significado)

| Tono | Significa | Ejemplos |
|---|---|---|
| `brand` (violeta) | lo tuyo: acción principal, selección | botón primario, pestaña activa, chip elegido |
| `success` (verde) | bien / listo | manos limpias, salida, regla cumplida |
| `warning` (ámbar) | ojo / a medio hacer | falta clasificar, "Mejorable" |
| `danger` (rojo) | mal / destructivo | problema, borrar, "Crítico" |
| `info` (celeste) | dato o consejo | avisos, build B, nota "Sólido" |
| `neutral` (gris) | sin énfasis | conteos, etiquetas |

Los roles de las cartas (starter, handtrap…) y los grupos (engine, non-engine…) tienen su paleta propia
(`--role-color`), no usan estos tonos. La literal de cada tono está en `ui/tone.ts`.

## 3. Tokens

- **Tipografía (8 pasos):** `text-micro` 11 · `caption` 12 · `small` 13 · `body` 14 · `lead` 16 · `heading` 18 · `title` 24 · `display` 48.
  Nada de `text-[…]`. Cifras con `tabular-nums`.
- **Radios:** `rounded-tag` 6 (etiquetas) · `control` 12 (botones, campos) · `card` 16 · `panel` 20 (modal, shell) · `rounded-full` (pastillas).
- **Elevación:** `shadow-card` · `shadow-raised` · `shadow-overlay` · `shadow-focus` (anillo de foco, el mismo en todo) · `shadow-brand` (sólo la acción principal).
- **Superficies:** `background` < `card-background` < `surface-raised` / `surface-hover`. Bordes: `border-border-subtle`.
- **Ancho:** `max-w-content` (80rem) centrado en todas las pantallas menos el Builder (usa todo el ancho).
- **Texto:** `text-foreground` → `text-muted` → `text-soft` (de más a menos importante). `*-soft` (p. ej. `text-success-soft`) para texto sobre fondos teñidos.

## 4. Componentes

| Componente | Para qué |
|---|---|
| `Button` | `primary` (una por vista) · `secondary` · `tertiary`; `color="danger"`; `icon` / `iconEnd`; tamaños `sm` `md` `lg` (en táctil crecen solos). |
| `IconButton` / `CloseButton` | acciones sólo con ícono (siempre con `aria-label`). |
| `Card` | toda tarjeta: `level` card / inset / raised, `tone`, `padding`. |
| `SectionHeader` | encabezado de tarjeta: ícono + título + descripción + acciones. |
| `StepHero` | encabezado de cada paso (ícono, título, una línea, ayuda `i`, acciones). |
| `StepPage` | contenedor de un paso: ancho, márgenes y separación. |
| `Badge` | estado, conteo o tipo (`dot`, `icon`, `shape="tag"`). |
| `Meter` | barras de nivel/progreso (misma altura y degradé). |
| `Callout` | avisos y consejos (ícono + título + texto). |
| `EmptyState` | lista o pantalla vacía: qué falta y qué hacer. |
| `Segmented` | elegir 1 entre pocas (turno, filtro, vista). |
| `Modal` | todo diálogo (`icon` + `tone` en el encabezado, `footer` para acciones). |
| `Icon` | **único** set de íconos (grilla 24, trazo 1.75). Nada de SVG suelto. |
| `field`, `choiceChip`, `filterChip`, `listItem` (`surfaces.ts`) | campos de texto, pastillas de selección y filas clickeables. |

## 5. Navegación

- Pestañas con ícono + nombre + dato en vivo (p. ej. `40 / 40`) + punto de estado (verde listo, ámbar a medio hacer).
- **Mismos nombres en desktop y mobile:** Deck · Roles · Lab · Comparar · Exportar (el nombre completo va en el tooltip).
- Mobile: barra inferior; la pestaña activa se tiñe de violeta.

## 6. Reglas para sumar pantallas

1. Armá la pantalla con `StepPage` + `StepHero` + `Card`.
2. Cada bloque nuevo: un ícono de `Icon`, un título (`SectionHeader`) y, si hay un número clave, que sea lo más grande.
3. Estados vacíos con `EmptyState`; avisos con `Callout`; errores en `danger`.
4. Tailwind sólo detecta clases literales: no armes clases con `${}`; para variantes usá `variants()` / `cx()`.
5. No mezcles dos utilidades de la misma propiedad en un elemento (p. ej. `rounded-control` y `rounded-none`).
6. Probá a 390 px, 1100 px y 1440 px antes de dar algo por terminado.

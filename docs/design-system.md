# Sistema de diseño

Una sola forma de hacer cada cosa. Antes de escribir clases sueltas, buscá si ya existe el componente.
Todo vive en `src/components/ui/` y los tokens en `src/index.css`.

## 1. Idea general

- **Oscuro, plano y con aire.** Fondo índigo casi negro con manchas tenues de color, tarjetas apenas más claras, bordes finos. Sin brillos de adorno.
- **Sin grises.** Todas las superficies (fondo, tarjetas, campos, bordes, scrollbar) son de la familia índigo de la lavanda de marca; no hay grises neutros. Los velos translúcidos son violetas (`bg-tint/N`, `border-tint/N`), nunca `bg-white/N` ni `bg-black/N`.
- **Dos niveles de caja, no tres.** Lienzo → tarjeta (`Card`) y nada más adentro: bloques, filas y totales se ordenan con espacio y líneas finas (`border-t border-border-subtle`, `divide-y`). Sólo se marcan al pasar el mouse, tocarlos o elegirlos. Un aviso dentro de una tarjeta (`Callout`) es un fondo teñido sin borde.
- **Cada dato se dice una sola vez.** Un número, un rótulo o una instrucción no se repite en la misma pantalla (ni entre la pestaña, el encabezado y el contenido). Un subtítulo que repite el título, una leyenda fija en la navegación o un resumen que ya está debajo se borran. Los resúmenes de una sección sólo se ven con la sección plegada.
- **Los porcentajes son círculos.** Un valor → `ProgressRing`; un reparto → `SegmentedRing`. No hay barras de progreso. Los anillos se llenan al aparecer (ver "Anillos").
- **Base visual: el diseño de Figma "Task management & to-do list" adaptado al oscuro:** Lexend Deca, violeta `#9B00FF` y verde `#00FFA3` (los de la Práctica), chips y botones lavanda, anillos de progreso, tarjetas redondeadas y barra inferior con íconos rellenos/duotono.
- **El color siempre significa algo** (ver tonos). Si no significa nada, va en gris.
- **30/70:** un ícono + un número + un color dicen lo principal; el texto sólo completa.
- **Mismo orden en toda pantalla:** encabezado (`StepHero`) → controles → tarjetas (`Card`) → detalle.

## 2. Tonos (color con significado)

| Tono | Significa | Ejemplos |
|---|---|---|
| `brand` (violeta `#9B00FF`) | lo tuyo: acción principal, selección | botón primario, pestaña activa, chip elegido |
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
- **Elevación:** `shadow-card` · `shadow-overlay` · `shadow-focus` (anillo de foco, el mismo en todo) · `shadow-brand` (brillo violeta de la acción principal).
- **Superficies (índigo, sin grises):** `background` `#0A0816` < `card-background` `#130F2B` < `surface-raised` / `input` `#1A1440`–`#1B1542` < `surface-hover` `#251D55`. Bordes: `border-border-subtle` (violeta al 13 %). `lavender` (`bg-lavender`) es el fondo de chips, botones secundarios y barra inferior; `lavender-light` (`#EEE9FF`) el botón sobre una tarjeta violeta.
- **Margen móvil:** `px-gutter` (22 px).
- **Ancho:** `max-w-content` (80rem) centrado en todas las pantallas menos el Builder (usa todo el ancho).
- **Texto:** `text-foreground` → `text-muted` → `text-soft` (de más a menos importante). `*-soft` (p. ej. `text-primary-soft` `#CF8DFF`) para texto sobre fondos teñidos.

## 4. Componentes

| Componente | Para qué |
|---|---|
| `Button` | `primary` (violeta con brillo, una por vista) · `secondary` (lavanda) · `tertiary` · `onBrand` (sobre tarjeta violeta); `color="danger"`; `icon` / `iconEnd`; `sm` 36 · `md` 44 · `lg` 50 (en táctil crecen solos). |
| `IconButton` / `CloseButton` | acciones sólo con ícono (siempre con `aria-label`). |
| `Card` | toda tarjeta: `level` card / **hero** (violeta, una por pantalla), `tone` (tarjeta teñida, como las "In Progress" del diseño), `padding`. Adentro no van más cajas. |
| `ProgressRing` | anillo de progreso con el % al centro (44 px en listas, 76 px en una tarjeta destacada, 168 px como protagonista; `tone="onBrand"` sobre violeta; `color` para roles; `ticks` para marcar cortes; `delay` para escalonar varios). |
| `SegmentedRing` | anillo repartido en tramos (limpias / con problema / sin salida; copias robadas 0-1-2-3+). Los tramos se llenan en orden y se resalta uno con `activeKey`. |
| `SectionHeader` | encabezado de tarjeta: ícono suelto + título + descripción + acciones. |
| `StepHero` / `StepPage` | encabezado de cada paso y contenedor (ancho, márgenes y separación). |
| `Badge` | estado, conteo o tipo (`dot`, `icon`, `shape="tag"`); los conteos van en `tone="brand"`. |
| `Callout` / `EmptyState` | avisos y consejos / listas o pantallas vacías. |
| `Segmented` | elegir 1 entre pocas: `track` (pista lavanda), `chips` (pastillas sueltas) o `cards` (tarjetas, como las fechas del diseño: turno del Lab). |
| `LabeledField` | campo en tarjeta con la etiqueta chica arriba y el valor abajo (nombre y formato del deck). |
| `Modal` | todo diálogo (`icon` + `tone` en el encabezado, `footer` para acciones). |
| `CardOverlay` | marco de los modales de carta (detalle y clasificación): la carta arriba (se agranda al tocarla), un panel con su información abajo y una X blanca arriba a la derecha. Si la carta tiene datos, lleva abajo a la derecha la moneda verde de precios (`CardPricesButton`), que abre `CardPricesModal` (precios de TCGplayer por expansión, pedidos recién al tocarla). `CardPanelHeader` / `CardPanelBody` / `CardPanelFooter` arman el panel. |
| `Icon` | **único** set de íconos (grilla 24). `variant`: `linear` (por defecto), `bulk` (duotono, pestañas inactivas) y `bold` (relleno, pestaña activa). Nada de SVG suelto. |
| `field`, `choiceChip`, `filterChip`, `listItem` (`surfaces.ts`) | campos de texto, pastillas de selección (lavanda → violeta al elegirla) y filas clickeables. |
| `Mascot` (Cupsy) | la mascota, abajo a la izquierda. Las pantallas no la manejan: avisan por `app/mascot.ts` (`beginMascotActivity` para cargas y cálculos, `reactMascot` para lo que salió bien o mal) y ella elige la animación. Se puede ocultar y volver a mostrar; con "reducir movimiento" queda quieta. |

### Anillos

- Se llenan solos al montarse: arrancan vacíos y, dos cuadros después, pasan a su valor con una transición de 900 ms (`RING_FILL_MS`). Los cambios de valor posteriores (cambiar de turno, editar el deck) también se animan.
- En un grupo se escalonan con `delay` (≈ 100 ms entre uno y otro). Con "reducir movimiento" aparecen llenos y sin transición.
- El color sigue siendo el del tono (nota del KPI: rojo → ámbar → celeste → verde; rol: su propia paleta; A violeta / B celeste en el comparador).
- Accesibilidad: `ProgressRing` es un `role="meter"` con `aria-valuenow`; `SegmentedRing` un `role="img"` con el reparto escrito en `label`.

## 5. Navegación

- Pestañas con ícono (relleno en la activa, duotono en las demás) + nombre + dato en vivo (p. ej. `40 / 40`) + punto de estado (verde listo, naranja a medio hacer). La activa lleva fondo lavanda.
- **Mismos nombres en desktop y mobile:** Deck · Roles · Lab · Comparar · Exportar · Meta (el nombre completo va en el tooltip).
- Mobile: barra inferior lavanda con esquinas superiores de 24 px; la pestaña activa se rellena y se tiñe de violeta claro.

## 6. Reglas para sumar pantallas

1. Armá la pantalla con `StepPage` + `StepHero` + `Card`.
2. Cada bloque nuevo: un ícono de `Icon`, un título (`SectionHeader`) y, si hay un número clave, que sea lo más grande (o un `ProgressRing`).
3. Estados vacíos con `EmptyState` (sin marco); avisos con `Callout`; errores en `danger`.
   Si dudás entre una caja y una línea fina, usá la línea. Si es un porcentaje, usá un anillo.
4. Tailwind sólo detecta clases literales: no armes clases con `${}`; para variantes usá `variants()` / `cx()`.
5. No mezcles dos utilidades de la misma propiedad en un elemento (p. ej. `rounded-control` y `rounded-none`).
6. Probá a 390 px, 1100 px y 1440 px antes de dar algo por terminado.

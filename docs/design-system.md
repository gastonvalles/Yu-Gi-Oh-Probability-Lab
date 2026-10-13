# Sistema de diseño

Una sola forma de hacer cada cosa. Antes de escribir clases sueltas, buscá si ya existe el componente.
Todo vive en `src/components/ui/` y los tokens en `src/index.css`.
El catálogo vivo de todo esto (botones, navegación, títulos, íconos, assets y tokens) es la página `/playground`: se prueba ahí primero. Ver `docs/playground.md`.

## 1. Idea general

- **Oscuro, plano y con aire.** Fondo índigo casi negro con manchas tenues de color, tarjetas apenas más claras, bordes finos. Sin brillos de adorno.
- **Sin grises.** Todas las superficies (fondo, tarjetas, campos, bordes, scrollbar) son de la familia índigo de la lavanda de marca; no hay grises neutros. Los velos translúcidos son violetas (`bg-tint/N`, `border-tint/N`), nunca `bg-white/N` ni `bg-black/N`.
- **Dos niveles de caja, no tres.** Lienzo → tarjeta (`Card`) y nada más adentro: bloques, filas y totales se ordenan con espacio y líneas finas (`border-t border-border-subtle`, `divide-y`). Sólo se marcan al pasar el mouse, tocarlos o elegirlos. Un aviso dentro de una tarjeta (`Callout`) es un fondo teñido sin borde.
- **Cada dato se dice una sola vez.** Un número, un rótulo o una instrucción no se repite en la misma pantalla (ni entre la pestaña, el encabezado y el contenido). Un subtítulo que repite el título, una leyenda fija en la navegación o un resumen que ya está debajo se borran. Los resúmenes de una sección sólo se ven con la sección plegada.
- **Los porcentajes son círculos.** Un valor → `ProgressRing`; un reparto → `SegmentedRing`. No hay barras de progreso. Los anillos se llenan al aparecer (ver "Anillos").
- **Base visual: el diseño de Figma "Task management & to-do list" adaptado al oscuro:** Lexend Deca, violeta `#9B00FF` y verde `#00FFA3` (los de la Práctica), chips y botones lavanda, anillos de progreso, tarjetas redondeadas y un menú con íconos rellenos/duotono.
- **El color siempre significa algo** (ver tonos). Si no significa nada, va en gris.
- **30/70:** un ícono + un número + un color dicen lo principal; el texto sólo completa.
- **Mismo orden en toda pantalla:** encabezado (`StepHero`) → controles → tarjetas (`Card`) → detalle.

## 2. Tonos (color con significado)

| Tono | Significa | Ejemplos |
|---|---|---|
| `brand` (violeta `#9B00FF`) | lo tuyo: acción principal, selección | botón primario, destino abierto del menú, chip elegido |
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
- **Radios:** `rounded-tag` 8 (etiquetas, estados) · `control` 12 (chips, botones chicos, campos) · `card` 16 (tarjetas, botón grande) · `panel` 24 (tarjeta destacada, diálogos) · `rounded-full` (píldoras y puntos).
- **Elevación:** `shadow-card` · `shadow-overlay` · `shadow-focus` (anillo de foco, el mismo en todo) · `shadow-brand` (brillo violeta de la acción principal).
- **Superficies (índigo, sin grises):** `background` `#0A0816` < `card-background` `#130F2B` < `surface-raised` / `input` `#1A1440`–`#1B1542` < `surface-hover` `#251D55`. Bordes: `border-border-subtle` (violeta al 13 %). `lavender` (`bg-lavender`) es el fondo de chips, botones secundarios y del destino abierto del menú; `lavender-light` (`#EEE9FF`) el botón sobre una tarjeta violeta.
- **Margen móvil:** `px-gutter` (22 px).
- **Ancho:** `max-w-content` (80rem) centrado en todas las pantallas menos el Builder (usa todo el ancho).
- **Texto:** `text-foreground` → `text-muted` → `text-soft` (de más a menos importante). `*-soft` (p. ej. `text-primary-soft` `#CF8DFF`) para texto sobre fondos teñidos.

## 4. Componentes

| Componente | Para qué |
|---|---|
| `Button` | `primary` (violeta con brillo, una por vista) · `secondary` (lavanda) · `tertiary` · `onBrand` (sobre tarjeta violeta); `color="danger"`; `icon` / `iconEnd`; `sm` 36 · `md` 44 · `lg` 50 (en táctil crecen solos). |
| `IconButton` / `CloseButton` | acciones sólo con ícono (siempre con `aria-label`). **Un botón sin texto va sin fondo y siempre blanco**: el aviso de que se toca es un resplandor blanco al pasar el mouse (y menos opacidad al apretar), el foco lleva el aro de siempre y deshabilitado se ve tenue. `tone` sólo cambia tamaño y forma: `raised` (barra de herramientas, por defecto) · `close` · `ghost` · `flat` · `outline` (redondo con borde fino). La excepción es `primary` (redondo violeta, la acción principal de una barra: reproducir) y los botones flotantes. Lo mismo vale para lo que no pasa por `IconButton`: los íconos de las redes del pie, la ⓘ de `InfoTip`, la flecha de contraer el menú. |
| `Card` | toda tarjeta: `level` card / **hero** (violeta, una por pantalla), `tone` (tarjeta teñida, como las "In Progress" del diseño), `padding`. Adentro no van más cajas. |
| `ProgressRing` | anillo de progreso con el % al centro (44 px en listas, 76 px en una tarjeta destacada, 168 px como protagonista; `tone="onBrand"` sobre violeta; `color` para roles; `ticks` para marcar cortes; `delay` para escalonar varios). El entero del centro sale de `formatWholePercent`: 99,5 % se muestra ">99%" y 0,4 % "<1%", nunca un "100%" o "0%" que no lo es (el valor con decimal, `formatShortPercent`, va en el `label` y al lado). |
| `SegmentedRing` | anillo repartido en tramos (limpias / con problema / sin salida; copias robadas 0-1-2-3+). Los tramos se llenan en orden y se resalta uno con `activeKey`. |
| `Heading` | **todos los títulos**: `page` (h1, uno por pantalla) · `section` (h2: tarjeta, diálogo, panel) · `card` (h3: ítem de una tarjeta) · `kicker` (sobretítulo). Los estilos de cada nivel viven en `ui/typography.ts`: no se escriben clases de título a mano. |
| `SectionHeader` | encabezado de tarjeta: ícono suelto + título + descripción + acciones. |
| `StepHero` / `StepPage` | encabezado de cada paso y contenedor (ancho, márgenes y separación). |
| `Badge` | estado, conteo o tipo (`dot`, `icon`, `shape="tag"`); los conteos van en `tone="brand"`. |
| `Callout` / `EmptyState` | avisos y consejos / listas o pantallas vacías. |
| `Segmented` | elegir 1 entre pocas: `track` (pista lavanda), `chips` (pastillas sueltas) o `cards` (tarjetas, como las fechas del diseño: turno del Lab). |
| `FieldBox` | campo en tarjeta de una sola línea, **sin etiqueta**: el valor o el `placeholder` ya dicen qué es (nombre y formato del deck); el control de adentro lleva su `aria-label`. |
| `Modal` | todo diálogo (`icon` + `tone` en el encabezado, `footer` para acciones). |
| `CardOverlay` | marco de los modales de carta (detalle y clasificación): la carta arriba (se agranda al tocarla), un panel con su información abajo y una X blanca arriba a la derecha. **Toda carta grande se inclina en 3D hacia el mouse** (`card-detail/card-tilt.tsx`: el detalle, también agrandado; `CardZoom`, la carta en pantalla completa; y la carta grande del builder de escritorio, con la moneda de precios adentro): perspectiva en el contenedor, `rotate` en la carta y un brillo que sigue al puntero; sólo con mouse y se apaga con movimiento reducido. Si la carta tiene datos, lleva abajo a la derecha la moneda verde de precios (`CardPricesButton`), que abre `CardPricesModal` (precios de TCGplayer por expansión, pedidos recién al tocarla). `CardPanelHeader` / `CardPanelBody` / `CardPanelFooter` arman el panel. |
| `PracticeMat` | la mesa de práctica (modal `board`: angosto en el celular, ancho con panel lateral desde 1101 px; disposición de DuelingBook con `grid-template-areas`). Celdas `aspect-[421/614]` con borde punteado que se enciende al pasar una carta por encima (`data-drop` / `data-over`); las cartas del campo se arrastran con `use-mat-drag` (fantasma en un portal, `z-200`); la mano es `PracticeHand`, un abanico que se reparte desde el mazo, se reordena arrastrando adentro y se arrastra afuera hasta una zona; al tocar una carta se abre `CardMenu`, un menú pegado a la carta (`z-210`, una línea por jugada, como en DuelingBook). Cuando una jugada necesita elegir (Sacrificios, zona), las celdas candidatas se encienden en verde (`data-pick` / `data-chosen`). Debajo de la mano va `PracticeBoard` (veredicto + chips chicos de salidas y problemas). `PileViewer` muestra una pila; `PracticeMatPanel` lista los pasos (la última jugada arriba; el paso actual se mantiene a la vista al reproducir) y los combos (`SavedCombosList`); en escritorio el panel lateral lleva arriba los pasos y combos y abajo, a la altura de la mano, los chips de salidas y problemas (la explicación del chip tocado se abre arriba de los chips y le saca lugar a la lista, no a ningún control). Cargar un combo lo reproduce solo, con los controles de `ReplayBar` (clonados de YGOPocket: volver al principio, anterior, reproducir, siguiente, la línea de tiempo de pasos, la lista de pasos y la velocidad 0,5×–2×; la barra se acomoda según su propio ancho con `@container`) y las cartas vuelan entre zonas con cada jugada (`use-card-flights`: FLIP para las cartas a la vista, fantasma hacia la pila de destino con dorso si llega boca abajo, salto de la pila al recibirla). Soltar una carta de una pila en una zona abre el mismo menú que al tocarla, sólo con las formas de salir a esa zona (`listDropActions`; las preguntas de cómo van siempre después, con `askItem`: Invocación Normal · Colocar · Invocación Especial ▸ en ataque o en defensa), y la carta se queda dibujada en la zona (`PlacedCard` con `pending`) mientras se elige; si se cancela, vuelve a la mano. Sólo espera mientras la mesa sigue como estaba al soltarla: si cambia por debajo (deshacer, un arrastre, un paso del panel) el menú o los Sacrificios en curso se cancelan solos y la carta queda donde corresponde; abrir cualquier menú pausa la reproducción de un combo. Los efectos viven en `MatFx.tsx` (el color de cada uno es `--fx-rgb`, de `FX_RGB`; qué efecto le toca a cada jugada lo decide `matEffects`, puro, en `app/mat-effects.ts`): `FxFrame` (marco con una luz que le da la vuelta, utilidad `fx-frame`), `TargetMark` (la mira de un objetivo: en la mano, en el campo, en el visor de una pila y sobre la casilla del cementerio y del destierro), `LandingBurst` (fogonazo, ondas y chispas de una invocación, que espera a que la carta aterrice), `PhaseBanner` (la banda violeta de la fase, con las seis fases y la actual en verde) y `Spotlight` (las cartas grandes del centro con su nombre y lo que pasó arriba, centradas en la mesa y no en la pantalla: en escritorio, sin el panel lateral; las que salen del deck o del Extra se dan vuelta en 3D desde el dorso). El dorso es `CARD_BACK` (`practice-styles.ts`): la imagen `cards/back.jpg` de YGOPRODeck por el proxy de imágenes. Los giros son rotaciones en 3D con `perspective(700px) rotateY` que pasan de canto a mitad de camino (ahí se cambia la cara) y se suman (`composite: 'add'`) a la transformación que ya tiene la carta; el golpe de una pila al recibir una carta lo da `use-card-flights`. Las cartas y las zonas de la mesa no llevan esquinas redondeadas (tampoco el detalle de una carta, que además se inclina hacia el mouse). |
| `Icon` | **único** set de íconos (grilla 24). `variant`: `linear` (por defecto), `bulk` (duotono, destinos del menú sin abrir) y `bold` (relleno, el destino abierto). Nada de SVG suelto. |
| `field`, `choiceChip`, `filterChip`, `listItem` (`surfaces.ts`) | campos de texto, pastillas de selección (lavanda → violeta al elegirla) y filas clickeables. |
| `Mascot` (Cupsy) | la mascota, abajo a la izquierda (en escritorio, al lado del menú lateral y arriba del pie). Las pantallas no la manejan: avisan por `app/mascot.ts` (`beginMascotActivity` para cargas y cálculos, `reactMascot` para lo que salió bien o mal) y ella elige la animación. Se puede ocultar y volver a mostrar; con "reducir movimiento" queda quieta. |

### Anillos

- Se llenan solos al montarse: arrancan vacíos y, dos cuadros después, pasan a su valor con una transición de 900 ms (`RING_FILL_MS`). Los cambios de valor posteriores (cambiar de turno, editar el deck) también se animan.
- En un grupo se escalonan con `delay` (≈ 100 ms entre uno y otro). Con "reducir movimiento" aparecen llenos y sin transición.
- El color sigue siendo el del tono (nota del KPI: rojo → ámbar → celeste → verde; rol: su propia paleta; A violeta / B celeste en el comparador).
- Accesibilidad: `ProgressRing` es un `role="meter"` con `aria-valuenow`; `SegmentedRing` un `role="img"` con el reparto escrito en `label`.

## 5. Navegación

El armazón vive en `components/shell/` (`AppShell`) y se prueba primero en `/playground` (ver `docs/playground.md`): un solo menú, que se arma una vez y lo ven el menú lateral y el cajón.

- **Escritorio (desde 1101 px): menú lateral** a la izquierda, en grupos: **Tu deck** (Deck · Roles · Lab · Comparar · Exportar), **Herramientas** (Práctica · Calculadora de LP, que abren un panel encima) y **Descubrir** (Tier lists · Decks de torneo · Replays). Cada destino: ícono (relleno en el abierto, duotono en los demás) + nombre; el abierto lleva `aria-current="page"` y fondo lavanda. El nombre completo y cómo viene el paso (listo, en progreso, pendiente) van en el tooltip y en el nombre accesible: **no hay punto de color de estado** (un punto en el borde de un ícono se lee como una notificación).
- Se contrae a una columna de íconos (240 → 76 px) y recuerda la elección (`ygo-lab:sidebar-collapsed`); sin haber elegido, arranca contraído en ventanas de menos de 1400 px, para que las pantallas no queden apretadas. Abajo van el idioma, las mascotas y el botón de contraer.
- **Abrir y contraer no mueve nada** (`shell/rail.ts`): abierto y contraído es la misma pieza con otro ancho. El ícono de cada fila (y la marca, y la flecha de contraer) vive en una columna de 52 px que es lo que queda a la vista contraído, así que está en el mismo lugar en los dos estados; los rótulos tienen ancho fijo, se desvanecen al contraer y el menú los recorta; las filas y los renglones de grupo miden lo mismo (contraído, del nombre del grupo queda sólo la línea). El ancho, los rótulos, la mascota y los botones flotantes usan la misma duración y curva (`--sidebar-duration` 280 ms y `--sidebar-ease`, en `index.css`): al cambiar el ancho, lo flotante acompaña al borde del menú. Las pantallas se vuelven a acomodar en cada cuadro (el contenido se ensancha o se angosta con el menú), así que un layout pesado se prueba abriendo y contrayendo el menú.
- **Celular: barra de arriba** con la hamburguesa y la marca; la hamburguesa abre un **cajón** con el mismo menú (foco atrapado, Escape y el velo lo cierran, el scroll de atrás se traba).
- **Mismos nombres en escritorio y celular:** Deck · Roles · Lab · Comparar · Exportar · Tier lists · Decks de torneo · Replays. Los rótulos del menú reservan el ancho de la negrita, así al abrirse uno ninguno se corre.
- **Pie** (`AppFooter`): autoría, aviso de sitio no oficial, redes y privacidad, en todas las pantallas. En escritorio el builder ocupa todo el alto y el pie queda fijo abajo; en las demás va al final del contenido. En el celular va todo centrado en una columna (las redes, la autoría debajo, con el texto a todo lo ancho, y la privacidad al final) y sin relleno de más: el pie no crece para esquivar lo flotante (la mascota y los botones se pueden arrastrar).
- **Lo flotante deja libre el menú y el pie:** los botones flotantes y la mascota (`use-draggable-position`) nacen, y se pueden llevar, sólo por el espacio que queda libre (`app/shell-layout.ts`: `AppShell` avisa cuánto ocupa el menú con su ancho de ahora y el pie). Una posición guardada que cae encima se corre sola.
- **Títulos:** toda pantalla lleva un `h1` (`StepHero`; el builder de escritorio lo tiene oculto, porque sus zonas son el título), cada tarjeta o sección un `h2` (`SectionHeader`, `Heading level="section"`) y un título chico adentro un `h3`/`h4` (`level="card"`). Los estilos de cada nivel están en `ui/typography.ts`.
- **Idioma:** el selector ES | EN (`LanguageSwitcher`, una pista lavanda como `Segmented`) va abajo del menú lateral, junto a las mascotas, y en el cajón del celular. Todo texto sale de `t()` (ver `docs/i18n.md`): el inglés cambia el largo de los rótulos, así que ningún diseño depende del ancho de un texto.

## 6. Reglas para sumar pantallas

1. Armá la pantalla con `StepPage` + `StepHero` + `Card`.
2. Cada bloque nuevo: un ícono de `Icon`, un título (`SectionHeader`) y, si hay un número clave, que sea lo más grande (o un `ProgressRing`).
3. Estados vacíos con `EmptyState` (sin marco); avisos con `Callout`; errores en `danger`.
   Si dudás entre una caja y una línea fina, usá la línea. Si es un porcentaje, usá un anillo.
4. Tailwind sólo detecta clases literales: no armes clases con `${}`; para variantes usá `variants()` / `cx()`.
5. No mezcles dos utilidades de la misma propiedad en un elemento (p. ej. `rounded-control` y `rounded-none`).
6. Probá a 390 px, 1100 px y 1440 px antes de dar algo por terminado.
7. **Nada se corre de lugar al cambiar de pestaña.** Lo que se ve igual en dos pantallas tiene que quedar en el mismo píxel:
   - El que hace scroll reserva la barra: `scrollbar-gutter: stable` en el contenedor del paso (escritorio, `AppShell`) y en `html` (celular y tablet, `index.css`). Con o sin barra, el contenido y el pie miden lo mismo (el pie va siempre adentro de ese contenedor).
   - `StepHero` tiene el renglón del título de alto fijo (el botón de al lado, que en táctil mide 44 px, sobresale sin agrandarlo) y todo paso lleva subtítulo (sólo se ve en escritorio): el título y el primer bloque quedan en el mismo lugar en todas.
   - Cambiar de pestaña no desliza nada ni anima el scroll: la pantalla nueva aparece con un fundido, ya arriba de todo.
   Para comprobarlo, recorré todas las pestañas y fijate que el ancho del contenido, la posición del título y la de los íconos del menú den lo mismo en cada una.
8. **Las cartas van rectas, también donde las recorta un marco.** Una zona que recorta lo que sobra (`overflow: hidden`, como la del builder, donde las cartas llegan hasta el borde) no lleva esquinas redondeadas: se las daría a las cartas de las puntas. Y toda ficha de carta que es un `<button>` declara `rounded-none` (el reset global le da radio a todo `<button>`, y un `overflow-hidden` recortaría la imagen). Probá mirando las esquinas de los marcos con cartas, no sólo las de las cartas.

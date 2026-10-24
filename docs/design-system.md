# Sistema de diseño

Una sola forma de hacer cada cosa: antes de escribir clases sueltas, buscá si ya existe el componente (`src/components/ui/`) y probalo en el catálogo («El catálogo `/playground`», sección 7). Los tokens, con sus valores y su uso, están en `src/index.css`; acá van las reglas que no se ven en el código.

## 1. Idea general

- **Plano y sin brillos de adorno;** la mesa es la excepción (regla 9).
- **Sin grises:** todas las superficies son de la familia índigo, y los velos de una superficie, violetas (`bg-tint/N`), nunca `bg-white/N` ni `bg-black/N` (sobre una foto sí se admite el negro).
- **Dos niveles de caja, no tres:** lienzo → tarjeta (`Card`) y nada más; adentro se ordena con espacio y líneas finas (`border-t border-border-subtle`). Un aviso dentro de una tarjeta es un fondo teñido sin borde.
- **Cada dato se dice una sola vez,** también entre la pestaña, el encabezado y el contenido: el resumen de una sección sólo se ve con la sección plegada.
- **Los porcentajes son anillos:** un valor → `ProgressRing`, un reparto → `SegmentedRing`; no hay barras de progreso.
- **Cifras con `tabular-nums`.**

## 2. Tonos (color con significado)

| Tono | Significa | Ejemplos |
|---|---|---|
| `brand` | lo tuyo («vos»): los fondos y la acción principal | botón primario, tu vida en el duelo |
| `success` | bien / listo, sólo en estadísticas y estados | manos limpias, regla cumplida |
| `warning` | ojo / a medio hacer | falta clasificar, «Mejorable» |
| `danger` | mal / destructivo | un problema, borrar |
| `info` (ámbar) | lo elegido y el énfasis, la navegación, el rival, la build B y los hipervínculos (`textLink`) | chip elegido, filtro puesto, destino abierto |
| `neutral` | sin énfasis: un número o una etiqueta de adorno | conteos, etiquetas |

**Quién lleva qué color.** El violeta es el primario y el ámbar, el secundario (lo elegido, el hover y el foco de lo que se toca); el verde y el rojo son respuestas y estadísticas (al soltar una carta, la zona válida va en ámbar y la que no, en rojo). **Dentro de un relleno verde o rojo el texto es siempre blanco:** por eso el verde lleno es `success-solid`, y el verde claro queda para texto, anillos y puntos.

**Lo elegido es ámbar:** se rellena de ámbar con el texto oscuro (el blanco sobre el ámbar no se lee). La excepción es «Qué es» de una regla: **Salida va llena de verde y Problema de rojo, con el texto blanco**, igual que su etiqueta (`KindBadge`, `Badge solid`, sólo verde y rojo). Una tarjeta elegida (`Segmented cards` y `lens`) se enmarca en ámbar: el estado de una tarjeta lo dice su borde (regla G.1 de `docs/ux-ui-guidelines.md`). Un aviso o un dato (`Callout`, los pills de «ojo») es un tinte, nunca un relleno.

**El violeta es de lo tuyo, no de todo:** las categorías que se distinguen de un vistazo —roles y grupos (`deck-groups.ts`), las zonas del deck, los tipos de carta y los tiers (`meta-format.ts`)— llevan un color cada una (los roles y los tiers los vigila `color-variety.test.ts`). Antes de pintar algo de violeta, preguntate si no es una categoría que merece su color.

## 3. Tokens

- **Tipografía:** seis pasos (`text-micro` … `text-display`); `text-micro` mide 12 px, no 11 (los números chicos del celular no se leían).
- **Movimiento:** nada va en `linear` (se siente robótico), salvo lo que cuenta tiempo de verdad (el reloj, un anillo que se barre), lo que gira sin fin y el parallax. Tres curvas con nombre, y no hay más: `--ease-out` para lo que entra o se queda (es la de toda transición por defecto), `--ease-in-out` para lo que viaja de un lugar a otro (vuelos, barajado, el ataque) y `--ease-snap` para lo que arranca ya en movimiento (pops, lo que suelta un gesto, estallidos, la moneda, las medallas). Las únicas excepciones son la gravedad de la moneda y el dado (`--ease-gravedad-*`) y los bucles, que usan la palabra `ease-in-out` de CSS. En el JS van `EASE_OUT`, `EASE_IN_OUT` y `EASE_SNAP` de `app/motion.ts` (la Web Animations API no lee `var()`) y en un `@keyframes`, el valor literal: lo vigila `motion-curves.test.ts`. Todo con `motion-reduce`.
  - Lo que entra en tanda va con `stagger`. Un `fixed` adentro de algo que entra así se corre (el `transform` lo vuelve su bloque contenedor): va por portal.
  - **Lo que se cierra también sale** (`app/use-presence.ts`). Trampas: `<Presence>` sola no anima (el hijo llama a `usePresence`, o pasa por `Modal` / `SideDrawer` con `isOpen={!useLeaving()}`, y ata Escape, el scroll y el foco a `!leaving`); una `key` que cambia al cerrar, un `return null` antes del `Modal` o una entrada sin su fotograma en `EXITS` matan la salida (para esconder sin cerrar, `hidden`). Límite conocido: `CardZoom` declara `aria-modal` pero no atrapa el foco, y reabrir un `Modal` en el primer cuadro de su salida parpadea ~40 ms.
  - **Lo que se mueve sin parar va con `transform` o `rotate` en su propio elemento** (lo resuelve el compositor), nunca animando una propiedad registrada (`@property`) o una variable: recalcula estilos y repinta en cada cuadro (la luz que gira de `FxFrame` lo hacía: 301 recálculos y 602 pintados en 5 s).
  - **Sin animar, a propósito:** las cubiertas del duelo, los carteles con temporizador (el turno, la moneda y el dado, los avisos), lo que despliega en el flujo (`InfoTip`, `MultiSelect`, `<details>`) y lo que se cierra navegando.
- **La mesa en 3D es sólo CSS** (`perspective()` + `rotateX()` + `scaleY()` con origen abajo): el arrastre anda porque se resuelve con `elementFromPoint`, que respeta la inclinación.
- **Objetivos táctiles de 44 px** con puntero táctil (`pointer-coarse`), salvo la mesa (las pilas, la mano no jugable y las fases miden por el campo) y los campos dentro de un `FieldBox` (el `label` es toda la tarjeta).

## 4. Componentes

Cada uno se explica en el comentario de su archivo; la tabla dice dónde está y la regla que no se ve ahí.

| Componente | Para qué |
|---|---|
| `Button` · `IconButton` · `CloseButton` | `ui/`. Las reglas de `Button`, en «Botones: jerarquía y texto». Un botón sin texto va sin fondo y blanco, y se enciende en ámbar al apuntarlo o elegirlo (igual las redes del pie, la ⓘ de `InfoTip` y los íconos del menú: `icon-buttons.test.tsx`). |
| `Card` · `Callout` · `EmptyState` · `Skeleton` · `FieldBox` | Las superficies (`ui/`), con sus estilos sueltos en `ui/surfaces.ts`. Ver «Dos niveles de caja». `Skeleton still` queda sin el brillo que corre: va donde hay decenas a la vez (`CardArt`). |
| `Heading` · `SectionHeader` · `StepHero` · `StepPage` | Todo título pasa por `Heading` (`ui/typography.ts`). **Los hipervínculos** usan `textLink`: ámbar y un solo estilo (`link-rules.test.ts`). |
| `ProgressRing` · `SegmentedRing` | Los anillos (`ui/`): ver «Anillos». |
| `Segmented` · `Switch` · `FilterChips` · `MultiSelect` · `Stepper` · `SearchField` · `ScrollRow` · `OverflowMenu` · `Badge` | Los controles (`ui/`); lo elegido, en ámbar. |
| `Modal` | Todo diálogo (`ui/Modal.tsx`); sus tamaños, en la regla 10. Una confirmación es `ConfirmDialog` y su texto sigue la muestra «Confirmación». |
| `SideDrawer` | Panel por la derecha (`ui/SideDrawer.tsx`): dos anchos y nada más, para que dos cajones encimados se cubran justo. |
| `Icon` | El único set (`ui/Icon.tsx`): nada de SVG suelto. El $ de los precios va sin círculo: el del círculo no está en el registro, a propósito. |
| `TiltCard` · `CardArt tilt` | Toda carta que se ve entera, una al lado de otra, se inclina en 3D hacia el mouse (en una grilla, `TiltCard`); sin hovers propios. |
| `CardOverlay` · `CardZoom` · `CardFlip` | El detalle y la carta grande (`card-detail/`). Nada que se toque va adentro del elemento con `TILT_ART`: se inclinaría con la carta. |
| `CardEffectText` · `CardEffectTraits` | Todo texto de efecto de carta va por `CardEffectText`, nunca en un `<p>` suelto. Ver `docs/motor-de-cartas.md`. |
| `RarityFoil` | La excepción a «sin brillos de adorno», porque dice la rareza: sólo en la carta grande. Su trampa (la raíz sin capa propia), en `src/foil.css`. |
| `PracticeMat` | La mesa (`probability/`), también la del duelo: no se mueve mientras se juega (regla 7) y sus cartas y zonas van rectas (regla 8). Ver `docs/duelo.md`. |
| `MatArena` | La arena de la mesa (`probability/MatArena.tsx`): sólo decoración y la excepción del lienzo plano (regla 9). |
| `CardMenu` · `CardSheet` | El menú de una carta (`probability/`; muestra «Menú de una carta»): sus reglas, en «Menús» de `docs/duelo.md`. |
| `PileViewer` | El visor de una pila (`probability/MatDialogs.tsx`): no es un modal, no tapa el campo ni lleva velo. Su lugar y elegir varias, en «El visor de una pila no tapa el campo» y «Elegir varias cartas de una pila» de `docs/duelo.md`. |
| `DuelTable` · `PracticeMatPanel` · `MatSnapshot` · `MaterialStack` · `RivalHandStrip` · `HandtrapPool` · `DuelMedal` | La mesa y el duelo (`probability/`, `duel/`). |
| `TierStrip` · `TierMakerBoard` | Las tier lists (`meta/`). |
| `DeckZoneHeader` · `StepErrorBoundary` · `ResizeHandle` · `Mascot` | `components/DeckZoneHeader.tsx`, `ui/` y `mascot/`. |

### Botones: jerarquía y texto

Una sola principal por grupo, lo demás pesa menos y cada texto dice qué hace. Las reglas 1 a 4 las revisa `src/__tests__/button-rules.test.ts` en el código de los componentes.

1. **Una principal por grupo** (`primary`): dos llenas juntas compiten. Si dos grupos de una vista compiten, uno baja a `secondary`; con opciones de igual valor (Moneda / Dado, Ir primero / Ir segundo) no hay principal.
2. **Lo que descarta o vuelve, al lado de una principal, es `tertiary`** (sin caja): Cancelar, Volver, Cerrar. `secondary` es para una alternativa que de verdad hace algo o para acciones de igual peso. Un disparador que borra va con `color="danger"`; el que lo confirma, `primary` + `danger`.
3. **La principal va al final** del pie de un diálogo, de una barra o de una fila alineada a la derecha («Cancelar · Guardar»).
4. **El texto dice qué hace:** un verbo en infinitivo (en inglés, imperativo), siempre el mismo para la misma acción (Borrar, no Eliminar; Elegir, no Seleccionar). La principal nombra el objeto si la pantalla no lo dice y **nunca es un «Sí», «No», «Aceptar», «OK», «Continuar» o «Confirmar» a secas**: la de una confirmación repite la acción. Sólo los estados se salvan: «Estoy listo», «Listo», «Entendido».
5. **«Salir» es una X** (`CloseButton` con `aria-label` «Salir»), nunca un botón con la palabra. **«Estoy listo» es verde** (`color="success"`). El Side Deck de un Match se llama **Sidedeck** en los dos idiomas.
6. **Un botón apagado que explica** (`disabledFocusable`): se ve apagado pero se enfoca y su clic marca lo que falta («Crear regla» de una regla incompleta). Lo que falta se marca en `danger` **después de ese intento**, nunca al entrar.

### Anillos

El lenguaje de los anillos lo hace cumplir `ring-language.test.tsx`: un anillo dice una sola cosa, el número del centro es lo que dibuja el arco, el arco se lee (3:1 contra la tarjeta, el lienzo y la pista) y la pista es una sola. Los cinco tipos y qué colores no van de arco, en `ui/tone.ts`; el número «de cada 100», en `ui/ring-shared.ts`.

### El Lab

Un veredicto, lo que lo frena y qué cambiar; el detalle, a un toque. «Lo que más te frena» propone el cambio de una sola carta y, si ninguno suma, lo dice en vez de inventar uno. El Lab puede cambiar tu deck («Aplicar al deck», con Deshacer). Las piezas están en `probability/` y sus muestras, en «El Lab» del catálogo.

### Las reglas del Lab

La tarjeta «Reglas del análisis» y su editor (`LabRules`, en `probability/`), con sus muestras en «Reglas del Lab» del catálogo.

### Comparar

- La acción de la tarjeta pesa según el veredicto: principal sólo si B abre mejor, secundaria si no y ninguna si B ya es tu deck.
- Mientras mide, el veredicto y las filas espejo son esqueletos de alto fijo (`aria-busy`); el «—» es para un dato que falta.
- Hasta 1100 px se apila y no pasa de `max-w-2xl`: con A y B muy separados, las filas no se leen.
- Las piezas están en `comparison/` y sus muestras, en «Comparar» del catálogo.

### La mesa: gestos

Mantener apretada una carta del campo cambia su posición sin menú, **sólo en la práctica**: en un duelo, un toque largo sin querer le mandaría una jugada al rival. El resto de los gestos, en `app/use-mat-drag.ts` y `app/practice-mat.ts`.

### La mesa: paneles de los costados con ancho a gusto

Sólo en escritorio: los anchos los manejan `useMatPanels` (`app/mat-panels.ts`, con sus topes y su porqué) y `ResizeHandle`.

## 5. Navegación

El armazón vive en `components/shell/` y cada pieza se explica en su archivo; los grupos del menú los arma `buildAppNavGroups` (`deck-workflow-navigation.ts`).

- **Un solo menú, armado una vez:** lo ven el menú lateral, la barra de abajo y el cajón, así que un destino nuevo se suma en `buildAppNavGroups`.
- **No hay barra de pasos arriba de las pantallas del deck** (a cada paso se llega desde el menú) **ni pie en ninguna pantalla** (lo legal va al final del menú, `SidebarLegal`, y del cajón).
- **El scroll del menú** (`scroll-yt`): `scrollbar-width` y `scrollbar-color` van en `auto`, porque si no Chrome y Safari ignoran el `::-webkit-scrollbar`.
- **Ningún diseño depende del ancho de un texto:** el inglés cambia el largo de los rótulos.

## 6. Reglas para sumar pantallas

1. Armá la pantalla con `StepPage` + `StepHero` + `Card`, en este orden: encabezado → controles → tarjetas → detalle.
2. Cada bloque, con su ícono (`Icon`) y su título (`SectionHeader`); el número clave, lo más grande (o un `ProgressRing`).
3. Vacío con `EmptyState`, avisos con `Callout`, errores en `danger`. Entre una caja y una línea fina, la línea.
4. Tailwind sólo ve clases literales: nada de `${}`; las variantes, con `variants()` / `cx()`.
5. Nunca dos utilidades de la misma propiedad en un elemento (`rounded-control` y `rounded-none`).
6. Probá a 390, 1100 y 1440 px, y a 1101. El complemento de `min-[1101px]` es `max-[1101px]`: en Tailwind v4 `max-[N]` es `width < N`, así que `max-[1100px]` deja un hueco a 1100 px y con zoom. Una pista de grilla `auto` crece con lo más ancho que tenga (un botón que no cabe a 320 px, una etiqueta larga) y se sale: una columna única va con `grid-cols-[minmax(0,1fr)]`.
7. **Nada se corre de lugar al cambiar de pestaña ni al abrir o contraer el menú.** Lo que se ve igual en dos pantallas queda en el mismo píxel: el alto de una pantalla sale del recuadro del armazón (`h-full` y `min-h-0`), nunca de un `100dvh - Xrem` a mano, y cambiar de pestaña no desliza ni anima el scroll. El menú es la misma pieza con otro ancho (`shell/rail.ts`). Lo vigila `layout-stability.test.tsx`: la barra de scroll reservada (`scrollbar-gutter: stable`), los rótulos del menú con el ancho de la negrita y el título de `StepHero` en un renglón fijo con **`subtitle` en todos los pasos** (sólo se ve en escritorio). Se comprueba recorriendo las pestañas con el menú abierto y contraído.
   - **La mesa no se mueve mientras se juega:** elegir, abrir un menú, un aviso o cambiar de fase no desplaza ni redimensiona el campo ni la mano. Lo que se elige se apoya encima de la fila que no se usa (`absolute inset-0`; esa fila, `invisible` e `inert`), sin alturas calculadas por estado.
   - **Áreas táctiles sin agrandar lo que se ve:** `before:-inset-1`; si hay que recortar, el `overflow-hidden` va en un `span` interno, no en el botón (recortaría la extensión).
8. **Las cartas van rectas, también donde las recorta un marco:** una zona con `overflow: hidden` no lleva esquinas redondeadas (se las daría a las cartas de las puntas), y toda ficha de carta que es un `<button>` declara `rounded-none` (el reset global le da radio a todo `<button>`).
9. **Nada que delate un diseño hecho en piloto automático** (la skill local `impeccable`, con `detect src public`, lo busca): sin degradados en fondos, tarjetas ni texto, sin manchas de color de fondo, sin sombras que caen ni brillos bajo los botones, sin vidrio esmerilado (las barras pegadas son opacas), sin franjas de color a un costado, sin el ícono de «chispas» para lo automático, sin zoom al pasar el mouse (el hover cambia color o borde), sin curvas con rebote, sin íconos de otra fuente (el set es `Icon`) y sin guiones largos de adorno. Se queda lo que dice algo: el violeta y el verde de la marca, los emojis de las señales del duelo, los brillos de la mesa (`MatFx`: son la jugada; también `CARD_HOVER`, la carta que sube y crece al apuntarla), el degradado tenue de `Card tone` y de las zonas del deck, el blur de las pastillas sobre arte, el degradado que tapa una foto para que se lea el texto y **la arena de la mesa** (`MatArena`), la única escena: luz, viñeta, una placa con sombra y una sola imagen, el arte de la magia de campo activada, sin tapar lo que se lee.
10. **Contenedores hermanos miden lo mismo.** Lo que va lado a lado empieza y termina en el mismo borde (`items-stretch`, o subgrid si las filas de adentro también tienen que coincidir); `items-start`, sólo con un motivo dicho en un comentario (algo `sticky`, una lista sin tope). Los anchos salen de una escala corta: pantallas `max-w-xl` (una columna), `max-w-5xl` (ancha o con una columna al costado), `max-w-content` (todas, menos el builder, que usa todo el ancho) y `wide` de `StepPage`; cajones `column` y `half`; diálogos `sm`, `md`, `sheet`, `keypad`, `screen` y `full`. Si algo no entra, se acomoda adentro: no se agranda el contenedor. Lo revisa `scripts/barrido-alineacion.js` (se pega en la consola) en cada estado, a 390, 1100 y 1440 px.
11. **Una barra pegada (`sticky`) adentro de un recuadro que se desplaza y tiene relleno propio lleva ese relleno en negativo** (`-top-2` con `py-2`, `-bottom-4` con `pb-4`): el navegador la pega al borde del contenido y no al del relleno, y con `0` queda un hueco por donde se ve pasar lo de atrás. Si el relleno está en una caja de adentro, `0` es lo justo. `sticky-bars.test.tsx` lo vigila sólo en la barra del buscador; en las demás se mide: con el scroll a mitad de recorrido, el borde de la barra contra el del recuadro da 0.

## 7. El catálogo `/playground`

**Todo cambio de diseño se prueba primero en `/playground` y después se lleva a las pantallas:** cada muestra es el componente real, así que lo que se cambia ahí cambia en toda la app. Se entra por `/playground` (en desarrollo, `http://localhost:5173/playground`); no está linkeado, lleva `noindex`, `robots.txt` lo excluye y se baja aparte (`React.lazy` en `App.tsx`).

- **Sumar una muestra:** un `<Specimen title note>` en su sección de `src/components/playground/sections/`, o una sección nueva en `SECTIONS` (`Playground.tsx`). Los íconos, los archivos de `public/` y las variables de `index.css` aparecen solos; las sombras se anotan a mano en `SurfacesSection.tsx` (Tailwind no deja leerlas).
- **Lo vigilan** `playground.test.tsx` (las secciones, el `noindex`, los íconos, los assets y el armazón). `i18n-literals.test.ts`, `button-rules.test.ts` y `link-rules.test.ts` saltan la carpeta: es una herramienta de desarrollo, en español y sin traducir.
- **Si una pantalla no cambia** con el componente, es que lo arma a mano (un `<button>` o un `<h2>` suelto fuera de `ui/`): se migra al componente en vez de tocarla suelta.

# Sistema de diseño

Antes de escribir clases sueltas, buscá el componente en `src/components/ui/` y probalo en el catálogo (sección 7). Los valores de los tokens están en `src/index.css` y cada componente cuenta sus props, variantes y estados en su comentario de cabecera; acá van las reglas que no se ven en el código.

## 1. Idea general

- **Plano y sin brillos de adorno;** las excepciones son la mesa (regla 9) y el foil de rareza (`RarityFoil`, sólo en la carta grande: dice la rareza).
- **Sin grises:** superficies índigo y velos violetas (`bg-tint/N`), nunca `bg-white/N` ni `bg-black/N` (sobre una foto, el negro sí).
- **Dos niveles de caja, no tres:** lienzo → tarjeta (`Card`) y nada más; adentro, espacio y líneas finas (`border-t border-border-subtle`). Un aviso dentro de una tarjeta es un fondo teñido sin borde.
- **Cada dato se dice una sola vez,** también entre pestaña, encabezado y contenido: el resumen de una sección sólo se ve plegada.
- **Los porcentajes son anillos** (`ProgressRing` un valor, `SegmentedRing` un reparto); no hay barras de progreso. Las vidas son el número plano de `LifeScore`; la placa `LifeTile` sólo queda en el catálogo.
- **Cifras con `tabular-nums`.**

## 2. Tonos (color con significado)

| Tono | Significa |
|---|---|
| `brand` | lo tuyo («vos»): los fondos, la acción principal y tu vida en el duelo |
| `success` | bien / listo, sólo en estadísticas y estados |
| `warning` | ojo / a medio hacer («Mejorable») |
| `danger` | mal / destructivo |
| `info` (ámbar) | lo elegido y el énfasis, la navegación, el rival, la build B y los hipervínculos (`textLink`) |
| `neutral` | sin énfasis: un número o una etiqueta de adorno |

**Quién lleva qué color.** El violeta es el primario y el ámbar, el secundario (lo elegido, el hover y el foco de lo que se toca); el verde y el rojo son respuestas y estadísticas (al soltar una carta, la zona válida va en ámbar y la que no, en rojo). En la mesa, lo que podés hacer brilla celeste (`--playable-rgb`) y lo que se activa o resuelve, ámbar (`card-glow.ts`).

**Sobre un relleno de color, el texto es blanco** (`color-variety.test.ts`): por eso el verde lleno es `success-solid` y el verde claro queda para texto, anillos y puntos; lo elegido y lo del rival van en violeta (sobre el ámbar el blanco no se lee). Excepción: «Qué es» de una regla, lleno de verde (Salida) o rojo (Problema), como su `KindBadge`. Una tarjeta elegida (`Segmented cards` y `lens`) se enmarca en ámbar (regla G.1 de `docs/ux-ui-guidelines.md`). Un aviso o un dato (`Callout`, los pills de «ojo») es un tinte, nunca un relleno.

**El violeta es de lo tuyo, no de todo:** roles y grupos (`deck-groups.ts`), zonas del deck, tipos de carta y tiers (`meta-format.ts`) llevan cada uno su color (`color-variety.test.ts` vigila roles y tiers).

## 3. Tokens

- **Texto:** `text-foreground` → `text-muted` → `text-soft` (`*-soft` sobre fondos teñidos), en seis tamaños (`text-micro`, de 12 px, … `text-display`; aparte, `text-score`, el número de la calculadora de vidas) y nunca `text-[…]`.
- **Radios, sombras y espacio:** `rounded-tag/control/card/panel`; `shadow-card/overlay/focus` (el mismo foco en todo); la escala de Tailwind (base 4 px, 16 px entre bloques), `px-gutter` en el celular y `max-w-content`.
- **Movimiento:** las curvas, qué se anima y cómo no trabar la mesa, en `docs/movimiento.md`.
- **Objetivos táctiles de 44 px** con puntero táctil (`pointer-coarse`), salvo la mesa (las pilas, la mano no jugable y las fases miden por el campo) y los campos dentro de un `FieldBox` (el `label` es toda la tarjeta).

## 4. Componentes

Los de `ui/` (los estilos sueltos de las superficies, en `ui/surfaces.ts`; los títulos, en `ui/typography.ts`), el detalle y la carta grande en `card-detail/`, la mesa en `probability/` y «Jugar solo automático» en `auto/`. Lo que no dice su comentario:

- **Todo título pasa por `Heading`; todo hipervínculo, por `textLink`** (ámbar, un solo estilo: `link-rules.test.ts`).
- **Un botón sólo ícono** va sin fondo y se enciende en ámbar (`icon-buttons.test.tsx`). En la mesa, todo lo que se toca es `IconButton tone="tile"` (`TileButton`) y el violeta lleno, sólo el texto. `MatBarActions` es la barra de toda mesa: salir, deshacer y el ⋯ (`MatMoreMenu`; lo prendido, en su interruptor).
- **Todo diálogo es `Modal`** (tamaños, regla 10); una confirmación, `ConfirmDialog`, con el texto como la muestra «Confirmación».
- **`Switch disabled`:** el porqué va en el texto de al lado.
- **`Icon` es el único set:** nada de SVG suelto. El $ de los precios va sin círculo (el del círculo no está en el registro).
- **Las cartas enteras, de a varias, se inclinan** hacia el mouse (`TiltCard`, `CardArt tilt`) y no llevan hovers propios; nada que se toque va adentro del elemento con `TILT_ART` (se inclinaría con la carta).
- **Todo texto de efecto va por `CardEffectText`**, nunca en un `<p>` suelto (`docs/motor-de-cartas.md`).
- **La mesa:** sus reglas, en `docs/duelo.md` y `docs/duelos-automaticos.md`; acá, las reglas 7 a 9.

### Botones: jerarquía y texto

Las reglas 1 a 4 las revisa `button-rules.test.ts` en el código de los componentes.

1. **Una principal por grupo** (`primary`): dos llenas juntas compiten. Si dos grupos de una vista compiten, uno baja a `secondary`; con opciones de igual valor (Moneda / Dado, Ir primero / Ir segundo) no hay principal.
2. **Lo que descarta o vuelve, al lado de una principal, es `tertiary`** (sin caja): Cancelar, Volver, Cerrar. `secondary` es para una alternativa que de verdad hace algo o para acciones de igual peso. Un disparador que borra va con `color="danger"`; el que lo confirma, `primary` + `danger`.
3. **La principal va al final** del pie de un diálogo, de una barra o de una fila alineada a la derecha («Cancelar · Guardar»).
4. **El texto dice qué hace:** un verbo en infinitivo (en inglés, imperativo), siempre el mismo para la misma acción (Borrar, no Eliminar; Elegir, no Seleccionar). La principal nombra el objeto si la pantalla no lo dice y **nunca es un «Sí», «No», «Aceptar», «OK», «Continuar» o «Confirmar» a secas**: la de una confirmación repite la acción. Sólo los estados se salvan: «Estoy listo», «Listo», «Entendido».
5. **«Salir» es una X** (`CloseButton` con `aria-label` «Salir»), nunca un botón con la palabra. **«Estoy listo» es verde** (`color="success"`). El Side Deck de un Match se llama **Sidedeck** en los dos idiomas.
6. **Un botón apagado que explica** (`disabledFocusable`): se ve apagado pero se enfoca y su clic marca lo que falta («Crear regla» de una regla incompleta), recién después de ese intento.

### Anillos

`ring-language.test.tsx` lo hace cumplir: un anillo dice una sola cosa, el número del centro es lo que dibuja el arco, el arco se lee (3:1 contra la tarjeta, el lienzo y la pista) y la pista es una sola. Los cinco tipos y qué colores no van de arco, en `ui/tone.ts`; el número «de cada 100», en `ui/ring-shared.ts`.

### El Lab y Comparar

- **El Lab:** un veredicto, lo que lo frena y qué cambiar; el detalle, a un toque. «Lo que más te frena» propone el cambio de una sola carta y, si ninguno suma, lo dice en vez de inventar uno; «Aplicar al deck» se deshace.
- **Comparar:** la acción de la tarjeta pesa según el veredicto (principal sólo si B abre mejor, secundaria si no, ninguna si B ya es tu deck). Mientras mide, el veredicto y las filas espejo son esqueletos de alto fijo (`aria-busy`); el «—» es sólo para un dato que falta. Hasta 1100 px se apila y no pasa de `max-w-2xl`: con A y B muy separados, las filas no se leen.

### La mesa: gestos y paneles

Mantener apretada una carta del campo cambia su posición sin menú (práctica y «Jugar solo automático», donde se deshace): en un duelo, un toque largo sin querer le mandaría una jugada al rival (`app/use-mat-drag.ts`). Los paneles de los costados, sólo en escritorio: `useMatPanels` (`app/mat-panels.ts`) y `ResizeHandle`.

## 5. Navegación

El armazón vive en `components/shell/`.

- **Un solo menú, armado una vez** (menú lateral, barra de abajo y cajón): un destino nuevo se suma en `buildAppNavGroups` (`deck-mode/deck-workflow-navigation.ts`). La barra de abajo: Tu deck · Descubrir · Jugar (círculo central, `PLAY_GROUP_KEY`) · Cartas · Buscar; lo que asoma lo cuenta `TAB_BAR_PX`.
- **Jugar** es Solo · Online (con relay) · Calculadora · Exportar; en su hoja del celular, Solo y Online van en dos tarjetas (`sheetCards`). En Solo la acción principal va en una barra pegada sobre la de navegación (el patrón de Exportar), con lo elegido a la izquierda.
- **No hay barra de pasos arriba de las pantallas del deck ni pie en ninguna pantalla** (lo legal va al final del menú, `SidebarLegal`, y del cajón).
- **El scroll del menú** (`scroll-yt`): `scrollbar-width` y `scrollbar-color` van en `auto`, porque si no Chrome y Safari ignoran el `::-webkit-scrollbar`.
- **Ningún diseño depende del ancho de un texto** (el inglés cambia el largo de los rótulos).

## 6. Reglas para sumar pantallas

1. Armá la pantalla con `StepPage` + `StepHero` + `Card`, en este orden: encabezado → controles → tarjetas → detalle.
2. Cada bloque, con su ícono (`Icon`) y su título (`SectionHeader`); el número clave, lo más grande (o un `ProgressRing`).
3. Vacío con `EmptyState`, avisos con `Callout`, errores en `danger`. Entre una caja y una línea fina, la línea.
4. Tailwind sólo ve clases literales: nada de `${}`; las variantes, con `variants()` / `cx()`.
5. Nunca dos utilidades de la misma propiedad en un elemento (`rounded-control` y `rounded-none`).
6. Probá a 390, 1100, 1101 y 1440 px, con el menú abierto y contraído. El complemento de `min-[1101px]` es `max-[1101px]`: en Tailwind v4 `max-[N]` es `width < N`, así que `max-[1100px]` deja un hueco a 1100 px y con zoom. Una pista de grilla `auto` crece con lo más ancho que tenga y se sale: una columna única va con `grid-cols-[minmax(0,1fr)]`.
7. **Nada se corre de lugar al cambiar de pestaña ni al abrir o contraer el menú.** El alto de una pantalla sale del recuadro del armazón (`h-full` y `min-h-0`), nunca de un `100dvh - Xrem` a mano, y cambiar de pestaña no desliza ni anima el scroll. El menú es la misma pieza con otro ancho (`shell/rail.ts`). Lo vigila `layout-stability.test.tsx`: la barra de scroll reservada (`scrollbar-gutter: stable`), los rótulos del menú con el ancho de la negrita y el título de `StepHero` en un renglón fijo con **`subtitle` en todos los pasos** (sólo se ve en escritorio). **La mesa tampoco se mueve mientras se juega:** elegir, abrir un menú, un aviso o cambiar de fase no desplaza ni redimensiona el campo ni la mano; lo que se elige se apoya encima de la fila que no se usa (`absolute inset-0`; esa fila, `invisible` e `inert`), sin alturas calculadas por estado.
8. **Las cartas van rectas, también donde las recorta un marco:** una zona con `overflow: hidden` no lleva esquinas redondeadas (se las daría a las cartas de las puntas), y toda ficha de carta que es un `<button>` declara `rounded-none` (el reset global le da radio a todo `<button>`).
9. **Nada que delate un diseño hecho en piloto automático** (lo busca la skill local `impeccable`, con `detect src public`): sin degradados en fondos, tarjetas ni texto, sin manchas de color de fondo, sin sombras que caen ni brillos bajo los botones, sin vidrio esmerilado (las barras pegadas son opacas), sin franjas de color a un costado, sin el ícono de «chispas» para lo automático, sin zoom al pasar el mouse (cambia color o borde), sin curvas con rebote, sin íconos de otra fuente y sin guiones largos de adorno. Se queda lo que dice algo: los emojis de las señales del duelo, los brillos de la mesa (`MatFx`, `CARD_HOVER`: son la jugada), el degradado tenue de `Card tone` y de las zonas del deck, el blur de las pastillas sobre arte, el degradado que tapa una foto para que se lea, las placas de vidas (`life-plate`) y **la arena de la mesa** (`MatArena`), la única escena: luz, viñeta, una placa con sombra, una sola imagen y el arte de la magia de campo activada, sin tapar lo que se lee.
10. **Contenedores hermanos miden lo mismo.** Lo que va lado a lado empieza y termina en el mismo borde (`items-stretch`, o subgrid si las filas de adentro también tienen que coincidir); `items-start`, sólo con un motivo dicho en un comentario (algo `sticky`, una lista sin tope). Los anchos salen de una escala corta: pantallas `max-w-xl` (una columna), `max-w-5xl` (ancha o con una columna al costado), `max-w-content` (todas, menos el builder) y `wide` de `StepPage`; cajones `column` y `half`; diálogos `sm`, `md`, `sheet`, `fit` (cartas), `keypad`, `screen` y `full`. Si algo no entra, se acomoda adentro: no se agranda el contenedor. Lo revisa `scripts/barrido-alineacion.js` (en la consola) en cada estado, a 390, 1100 y 1440 px.
11. **Una barra pegada (`sticky`) adentro de un recuadro que se desplaza y tiene relleno propio lleva ese relleno en negativo** (`-top-2` con `py-2`, `-bottom-4` con `pb-4`): el navegador la pega al borde del contenido, no al del relleno, y con `0` queda un hueco por donde pasa lo de atrás. Si el relleno está en una caja de adentro, `0` es lo justo. `sticky-bars.test.tsx` lo vigila en el buscador; las demás se miden: a mitad de scroll, borde contra borde da 0.
12. **En el celular el título lo lleva la barra** (`StepHero`: `h1` en `sr-only`); los selectores, en una fila de `Segmented` scroll, y nunca dos `Segmented` seguidos sin su nombre (cada ajuste en su fila; sí o no, un `Switch`); las listas, en `ListGroup`, y una larga en bloques con `SectionHeader` y «Ver las N», nunca en una caja con scroll.

## 7. El catálogo `/playground`

**Todo cambio de diseño se prueba primero en `/playground` y después se lleva a las pantallas:** cada muestra es el componente real, así que lo que cambia ahí cambia en toda la app. Se entra por `localhost:5173/playground`; no está linkeado, lleva `noindex`, `robots.txt` lo excluye y se carga aparte (`React.lazy` en `App.tsx`).

- **Sumar una muestra:** un `<Specimen title note>` en su sección de `src/components/playground/sections/`, o una sección nueva en `SECTIONS` (`Playground.tsx`). Los íconos, los archivos de `public/` y las variables de `index.css` aparecen solos; las sombras se anotan a mano en `SurfacesSection.tsx` (Tailwind no deja leerlas).
- **Lo vigila** `playground.test.tsx`. `i18n-literals.test.ts`, `button-rules.test.ts` y `link-rules.test.ts` saltan la carpeta: es una herramienta de desarrollo, en español y sin traducir.
- **Si una pantalla no cambia** con el componente, la arma a mano (un `<button>` o un `<h2>` suelto): se migra al componente.

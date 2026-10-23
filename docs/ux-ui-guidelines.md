# Guía de UX/UI y de pedidos de diseño

Cómo se lee un pedido de diseño y cómo se hace una mejora visual. Las reglas, los tokens, los componentes y el catálogo vivo
(`/playground`) están en `docs/design-system.md`: **si algo de acá lo contradice, gana él.**

## A) Leer un pedido

- Si falta algo importante, se pregunta lo mínimo o se asume y se declara la suposición en una línea.
- Una captura sin texto es una **referencia**, no una especificación: se toma lo que sirve y se adapta a la estética propia
  (violeta, ámbar y verde sobre índigo, Lexend Deca). Nunca un clon de otra app.
- «Esta vista necesita revisión» pide una **crítica completa** (estados, celular, accesibilidad), no un retoque.
- El contexto fijo: duelistas que arman y miden su deck, muchas veces desde el celular (390–440 px) y en un torneo. Tono
  directo, en voseo, sin jerga de marketing.

## B) Reglas visuales

- **Cambio cosmético no es cambio de lógica.** No se toca el estado (RTK, hooks), el flujo de datos, las props públicas de un
  componente ni `src/app/*`; si hace falta, se frena y se avisa antes. Los tests de la pantalla pasan sin tocarlos.
- **Dos niveles de caja:** lienzo → `Card`, nada más adentro. Las superficies son índigo: sin grises neutros, brillos ni
  sombras de adorno.
- **Espaciado:** la escala de Tailwind (base 4 px; 16 px entre bloques), `px-gutter` (22 px) en el celular y `max-w-content`.
- **Mobile-first:** se diseña a 390 px. Un solo corte escritorio/menú lateral, **1101 px** (`min-[1101px]`,
  `DESKTOP_DECK_BUILDER_MEDIA_QUERY`), y su complemento es `max-[1101px]`; los cortes de Tailwind, sólo para lo fino. Se prueba
  a 390, 1100, 1101 y 1440 px con el menú abierto y contraído (regla 6 de «Reglas para sumar pantallas»). En chico se apila,
  sin scroll horizontal; la navegación la arma `AppShell`, nunca una pantalla.
- **Nada se corre de lugar** al cambiar de pestaña ni al abrir o contraer el menú (punto 7 de «Reglas para sumar pantallas»).
- **Tokens, no valores sueltos:** el color por tono (`ui/tone.ts`: siempre significa algo; si no, gris); el texto en
  `text-foreground` → `text-muted` → `text-soft` (`*-soft` sobre fondos teñidos) y en seis tamaños (`text-micro` …
  `text-display`, nunca `text-[…]`); radios `rounded-tag/control/card/panel`; sombras `shadow-card/overlay/focus`.
- **Componentes con variantes:** antes de escribir clases se busca en `src/components/ui/` y en `/playground`; si falta una
  variante, se suma al componente (con su muestra), no se copia el markup. Los botones siguen «Botones: jerarquía y texto» de
  `docs/design-system.md` (lo revisa `button-rules.test.ts`).

## C) Accesibilidad y estados

- Todo se usa con teclado; ARIA donde el HTML no alcanza (`aria-label` en un botón sólo ícono, `aria-pressed` /
  `aria-current`, `role="meter"` en los anillos, `aria-busy` al cargar); contraste WCAG AA (4,5:1 el texto, 3:1 desde 24 px);
  el mismo foco en todo (`shadow-focus`); objetivos táctiles de 44 px.
- **Estados, siempre todos:** default, hover, focus, selected/active, disabled, error (`danger`), vacío (`EmptyState`),
  cargando (`Skeleton`, `aria-busy`) y éxito (toast o `Callout` `success`).

## D) Heurísticas

Hick (una acción principal; lo secundario se pliega o va a un menú), Fitts (44 px; en el celular, la acción principal abajo, al
pulgar), jerarquía (cada dato una sola vez; el número que decide, el más grande o un anillo; hasta tres tamaños de texto por
bloque) y framing («72 de cada 100» antes que «72,3 %»; una diferencia con ▲/▼ y el color que le conviene a quien la lee).
Prueba social, escasez y reciprocidad no aplican: no hay venta.

## E) Plantillas

- **Crítica:** 3 cosas que funcionan · 3 prioridades con la solución (qué componente o token) · accesibilidad · responsive ·
  consistencia con `docs/design-system.md`.
- **Componente:** para qué · props · variantes · estados · accesibilidad · hacer y no hacer · 3 usos reales; va en su
  comentario, en el índice de `docs/design-system.md` y con una muestra (`<Specimen>`) en `/playground`.
- **Microcopy:** 5 opciones en 3 tonos (formal, amigable, urgente), en voseo y en los dos idiomas (`docs/i18n.md`); un botón
  empieza con el verbo y nombra el objeto, nunca «Sí», «No», «OK» ni «Aceptar».
- **Modelo de datos:** no hay base de datos, son formas JSON (`localStorage`, `src/data/*.json`, los mensajes del relay): tipos
  TS exactos, claves estables, versión y migración de lo guardado (como `migrateSavedBuild`), el tamaño y qué lee un worker.

## F) Código

- La lógica va en módulos puros (`src/app/*.ts` o un helper al lado de la pantalla, testeables sin DOM); una pantalla compone
  piezas de `ui/` y no importa de otra pantalla; el estado vive en RTK o en hooks, no en un módulo con estado global.
- **Olores del repo:** clases armadas con `${}` (las variantes van con `variants()` / `cx()`), dos utilidades de la misma
  propiedad en un elemento, `text-[…]`, un SVG suelto en vez de `Icon`, un `<button>` a mano en vez de `Button` /
  `IconButton`, una caja dentro de una tarjeta.

## G) Lenguaje de tarjetas: cuatro movimientos

Para toda tarjeta que resume algo (una build, un deck de torneo, el resultado del Lab, un jugador en la sala). Se aplican de a
uno y en este orden; el ejemplo es la hoja «Lenguaje · tarjetas» del lienzo de prototipos.

1. **Un solo borde.** La tarjeta (`Card`) es el único borde: adentro, ni franja de color a un costado ni caja dentro de la
   caja; se separa con espacio y, a lo sumo, una línea fina (`border-t border-border-subtle`). El estado lo dice un anillo, un
   chip o el borde de *toda* la tarjeta (el ganador de Comparar), nunca un borde extra.
2. **Lo que va junto, se junta.** La distancia dice el parentesco: poco aire dentro de un grupo y más entre grupos (4 · 8 · 16
   · 24): «de cada 100» pegado a su número, el nombre pegado a sus vidas.
3. **Lo legal, a la ficha.** La tarjeta lleva sólo lo que decide: la letra chica (cómo leer los %, los conteos exactos, los
   créditos, las fuentes de precios, «sitio no oficial») va en la ficha o la hoja de detalle, a un toque con ⓘ.
4. **Número + acción.** El dato que decide y la acción que le sigue van en la misma fila, abajo (zona del pulgar): el número a
   la izquierda y el botón a la derecha. Orden de lectura: título y subtítulo, imagen y, abajo, número + acción. Una sola
   acción principal por tarjeta.

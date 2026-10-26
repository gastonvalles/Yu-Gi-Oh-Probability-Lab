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
  el mismo foco en todo (`shadow-focus`) y, con el dedo, nunca a un campo de texto al abrir algo (`opensKeyboard`);
  objetivos táctiles de 44 px.
- **Estados, siempre todos:** default, hover, focus, selected/active, disabled, error (`danger`), vacío (`EmptyState`),
  cargando (`Skeleton`, `aria-busy`) y éxito (toast o `Callout` `success`).
- **Un error se muestra después de un intento, no al entrar:** lo que falta completar en algo recién abierto es una pista
  neutra; pasa a `danger` recién cuando se intentó guardar, y el foco va a lo primero que falta.

## D) Leyes de UX y heurísticas

Siete leyes para decidir y para revisar un diseño: un boceto se mira contra ellas antes del «dale», y cada decisión dice cuál la respalda
y cuál paga. Cada una dice qué exige acá y dónde ya se ve.

- **Fitts** (el tiempo para llegar a un objetivo depende de su tamaño y su distancia): objetivos táctiles de 44 px; en el celular lo que
  más se usa va abajo, al alcance del pulgar derecho, y la acción principal es grande y queda cerca de donde se decide; nada importante
  chico ni pegado al borde. Ya está en: el pie de los diálogos (principal al final), la botonera de la mesa, G.4.
- **Hick** (más opciones y más complejas, más tiempo para decidir): una acción principal por grupo; lo secundario se pliega o va a un
  menú; una sola opción no necesita menú; en el duelo automático sólo se ofrecen las jugadas posibles. Ya está en: el menú de una carta
  en bloques con la principal abajo.
- **Zeigarnik** (lo que queda a medias se recuerda y se quiere cerrar): lo pendiente se ve y se retoma, y lo hecho no se pierde, p. ej.
  «Quedan 2 efectos por preguntar». Ya está en: la práctica que no se pierde al salir de la pantalla, «Seguir en modo manual» con la
  mano y el campo como estaban. Nunca un trabajo a medias que se pierde sin avisar.
- **Jakob** (la gente pasa casi todo el tiempo en otros sitios y espera que éste ande igual): se imita lo conocido de las plataformas de
  las que viene el duelista (Master Duel, DuelingBook, EDOPro) —mismo vocabulario, mismos lugares, mismas jugadas— y se mejora; no se
  reinventa un patrón sin un motivo que se pueda decir. Las referencias se leen como en A.
- **Gradiente de meta** (el esfuerzo crece al acercarse a la meta): lo que tiene un final muestra cuánto falta y el último paso es el
  más fácil y el más claro. Ya está en: el contador al elegir cartas («· 0 de 2»).
- **Von Restorff** (lo distinto es lo que se recuerda): en cada pantalla o grupo, un solo elemento que se distinga (el botón principal,
  la carta que brilla, el eslabón que se resuelve); si todo resalta, nada resalta. El color siempre significa algo (`ui/tone.ts`; en la
  mesa, celeste «podés hacer» y ámbar «se activa»).
- **Miller** (la memoria de trabajo retiene unos 7 ± 2 elementos): agrupar en bloques cortos y no mostrar todo a la vez: los menús en
  bloques (apoyo, envíos, jugadas), hasta 5 o 6 cartas en una fila antes de pasar a la ventana, hasta tres tamaños de texto por bloque.

Además: jerarquía (cada dato una sola vez; el número que decide, el más grande o un anillo) y framing («72 de cada 100» antes que
«72,3 %»; una diferencia con ▲/▼ y el color que le conviene a quien la lee). Prueba social, escasez y reciprocidad no aplican: no hay venta.

## E) Plantillas

- **Crítica:** 3 cosas que funcionan · 3 prioridades con la solución (qué componente o token) · las leyes de D que cumple y las que paga · accesibilidad · responsive ·
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

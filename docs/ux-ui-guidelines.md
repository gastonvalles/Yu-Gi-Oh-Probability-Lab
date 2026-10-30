# Guía de UX/UI y de pedidos de diseño

Cómo se lee un pedido de diseño y cómo se decide una mejora visual. Las reglas, los tokens, los componentes y el catálogo vivo
(`/playground`) están en `docs/design-system.md`: **si algo de acá lo contradice, gana él.**

## A) Leer un pedido

- Si falta algo importante, se pregunta lo mínimo o se asume y se declara la suposición en una línea.
- Una captura sin texto es una **referencia**, no una especificación: se toma lo que sirve y se adapta a la estética propia
  (violeta, ámbar y verde sobre índigo, Lexend Deca). Nunca un clon de otra app.
- «Esta vista necesita revisión» pide una **crítica completa** (estados, celular, accesibilidad), no un retoque.
- El contexto: duelistas que arman y miden su deck, muchas veces desde el celular (390–440 px) y en un torneo. Tono directo,
  en voseo, sin jerga de marketing.

## B) Reglas visuales

- **Cambio cosmético no es cambio de lógica.** No se toca el estado (RTK, hooks), el flujo de datos, las props públicas de un
  componente ni `src/app/*`; si hace falta, se frena y se avisa antes. Los tests de la pantalla pasan sin tocarlos.
- **Dos niveles de caja** (lienzo → `Card`), superficies índigo, **tokens y no valores sueltos** (`docs/design-system.md`, 1 a 3)
  y **componentes con variantes**: antes de escribir clases se busca en `src/components/ui/` y en `/playground`; si falta una
  variante, se suma al componente (con su muestra), no se copia el markup.
- **Mobile-first:** se diseña a 390 px. Un solo corte escritorio/menú lateral, **1101 px** (`min-[1101px]`,
  `DESKTOP_DECK_BUILDER_MEDIA_QUERY`); los cortes de Tailwind, sólo para lo fino. En chico se apila, sin scroll horizontal; la
  navegación la arma `AppShell`, nunca una pantalla. Cómo se prueba y qué no se corre de lugar: reglas 6 y 7 de «Reglas para
  sumar pantallas».

## C) Accesibilidad y estados

- Todo se usa con teclado; ARIA donde el HTML no alcanza (`aria-label` en un botón sólo ícono, `aria-pressed` /
  `aria-current`, `role="meter"` en los anillos, `aria-busy` al cargar); contraste WCAG AA (4,5:1 el texto, 3:1 desde 24 px);
  el mismo foco en todo (`shadow-focus`); con el dedo, abrir algo nunca enfoca un campo de texto (`opensKeyboard`); objetivos
  táctiles de 44 px.
- **Estados, siempre todos:** default, hover, focus, selected/active, disabled, error (`danger`), vacío (`EmptyState`),
  cargando (`Skeleton`, `aria-busy`) y éxito (toast o `Callout` `success`).
- **Un error se muestra después de un intento, no al entrar:** lo que falta en algo recién abierto es una pista neutra; pasa a
  `danger` cuando se intentó guardar, y el foco va a lo primero que falta.

## D) Leyes de UX

Un boceto se mira contra estas siete antes del «dale»; cada decisión dice cuál la respalda y cuál paga.

- **Fitts:** en el celular lo que más se usa va abajo, al alcance del pulgar, y la acción principal es grande y cerca de donde
  se decide; nada importante chico ni pegado al borde (el pie de los diálogos, G.4).
- **Hick:** una acción principal por grupo; lo secundario se pliega o va a un menú; una sola opción no necesita menú; en el duelo
  automático sólo se ofrecen las jugadas posibles.
- **Zeigarnik:** lo pendiente se ve y se retoma, y lo hecho no se pierde (la práctica sigue al volver; «Seguir en modo manual»
  deja la mano y el campo como estaban). Nunca un trabajo a medias que se pierde sin avisar.
- **Jakob:** se imita lo conocido de Master Duel, DuelingBook y EDOPro (vocabulario, lugares, jugadas) y se mejora; no se
  reinventa un patrón sin un motivo que se pueda decir.
- **Gradiente de meta:** lo que tiene un final muestra cuánto falta y el último paso es el más fácil (el contador al elegir
  cartas, «0 de 2»).
- **Von Restorff:** un solo elemento que se distinga por pantalla o grupo; si todo resalta, nada resalta. El color siempre
  significa algo (`ui/tone.ts`).
- **Miller:** bloques cortos y no todo a la vez: menús en bloques, hasta 5 o 6 cartas en una fila antes de pasar a la ventana,
  hasta tres tamaños de texto por bloque.

Además: jerarquía (el número que decide, el más grande o un anillo) y framing («72 de cada 100» antes que «72,3 %»; una
diferencia con ▲/▼ y el color que le conviene a quien la lee). Prueba social, escasez y reciprocidad no aplican: no hay venta.

## E) Plantillas

- **Crítica:** 3 cosas que funcionan · 3 prioridades con la solución (qué componente o token) · las leyes de D que cumple y
  las que paga · accesibilidad · responsive · consistencia con `docs/design-system.md`.
- **Componente:** para qué · props · variantes · estados · accesibilidad · hacer y no hacer · 3 usos reales, en su
  comentario y con su `<Specimen>` en `/playground`.
- **Microcopy:** 5 opciones en 3 tonos (formal, amigable, urgente), en voseo y en los dos idiomas (`docs/i18n.md`); los
  botones, como «Botones: jerarquía y texto».
- **Modelo de datos:** no hay base de datos, son formas JSON (`localStorage`, `src/data/*.json`, los mensajes del relay): tipos
  TS exactos, claves estables, versión y migración de lo guardado (como `migrateSavedBuild`), el tamaño y qué lee un worker.

## F) Código

La lógica va en módulos puros (`src/app/*.ts` o un helper al lado de la pantalla, testeables sin DOM); una pantalla compone
piezas de `ui/` y no importa de otra pantalla; el estado vive en RTK o en hooks, no en un módulo con estado global. Olores:
los de las reglas 3 a 5 de «Reglas para sumar pantallas», `text-[…]`, un SVG suelto en vez de `Icon` y un `<button>` a mano en
vez de `Button` / `IconButton`.

## G) Lenguaje de tarjetas: cuatro movimientos

Para toda tarjeta que resume algo (una build, un deck de torneo, el resultado del Lab, un jugador en la sala). Se aplican de a
uno y en este orden.

1. **Un solo borde.** La tarjeta (`Card`) es el único borde: adentro, ni franja de color a un costado ni caja dentro de la
   caja; a lo sumo, una línea fina. El estado lo dice un anillo, un chip o el borde de *toda* la tarjeta (el ganador de
   Comparar), nunca un borde extra.
2. **Lo que va junto, se junta.** La distancia dice el parentesco: poco aire dentro de un grupo y más entre grupos (4 · 8 · 16
   · 24): «de cada 100» pegado a su número, el nombre pegado a sus vidas.
3. **Lo legal, a la ficha.** La tarjeta lleva sólo lo que decide: la letra chica (cómo leer los %, los conteos exactos, los
   créditos, las fuentes de precios, «sitio no oficial») va en la ficha o la hoja de detalle, a un toque con ⓘ.
4. **Número + acción.** El dato que decide y la acción que le sigue van en la misma fila, abajo (zona del pulgar): el número a
   la izquierda y el botón a la derecha. Orden de lectura: título y subtítulo, imagen y, abajo, número + acción. Una sola
   acción principal por tarjeta.

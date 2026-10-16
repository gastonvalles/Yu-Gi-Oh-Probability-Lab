# Guía de UX/UI y de pedidos de diseño

Cómo se lee un pedido de diseño y cómo se hace una mejora visual en esta app. Es un complemento de
`docs/design-system.md` (los componentes, los tokens y las reglas visuales) y de `docs/playground.md` (el catálogo vivo):
**si algo de acá contradice esos dos, ganan ellos.**

## A) Cómo leer un pedido de diseño

Todo pedido tiene seis partes: **Contexto** (producto, usuario, tono), **Rol** (desde dónde se mira: diseño de interacción,
arquitectura de información, visual), **Tarea concreta**, **Formato de salida**, **Restricciones** y, si hace falta, un **Ejemplo**.
Si falta algo importante, se pregunta lo mínimo o se asume y se declara la suposición en una línea.

Convenciones de este repo al leer un pedido:

- Una captura sin texto es una **referencia**, no una especificación: se toma lo que sirve y se adapta a la estética propia
  (violeta `#9B00FF` y verde `#00FFA3` sobre índigo, Lexend Deca). Nunca un clon de otra app.
- "Esta vista necesita revisión" pide una **revisión crítica completa** (estados, celular, accesibilidad), no un retoque.
- El contexto fijo: duelistas que arman y miden su deck, muchas veces desde el celular (390–440 px) y en un torneo.
  El tono es directo, en voseo, sin jerga de marketing.

## B) Reglas para mejoras visuales

- **Cambio cosmético no es cambio de lógica.** No se toca el estado (RTK, hooks), el flujo de datos, las props públicas de un
  componente ni `src/app/*`. Si para mejorar la vista hace falta cambiar algo de eso, se frena y se avisa antes.
- **Mejoras típicas:** pasar a `Card` (dos niveles de caja: lienzo → tarjeta, nada más adentro), contraste
  (`text-foreground` → `text-muted` → `text-soft`; `*-soft` sobre fondos teñidos), espaciado consistente (la escala de Tailwind,
  base 4 px, 16 px como separación típica entre bloques; `px-gutter` 22 px en el celular; `max-w-content`) y animaciones sutiles
  **con sentido** (los anillos se llenan, las pestañas cambian con un fundido; todo con `motion-reduce`). Sin brillos ni sombras
  de adorno, sin grises neutros: las superficies son de la familia índigo.
- **Responsive mobile-first.** Se diseña a 390 px y se prueba a 390, 1100 y 1440 px, con el menú lateral abierto y contraído.
  Breakpoints: los de Tailwind (`sm`, `md`, `lg`, `xl`) para lo fino y **1101 px** (`min-[1101px]`,
  `DESKTOP_DECK_BUILDER_MEDIA_QUERY`) como el único corte escritorio/menú lateral; no se inventan otros.
- **En pantallas chicas** los elementos se apilan, el texto sigue legible, no hay overflow horizontal y el menú lateral pasa a
  hamburguesa + cajón (lo hace `AppShell`; una pantalla no arma su propia navegación).
- **Accesibilidad:** todo se usa con teclado; ARIA donde el HTML no alcanza (`aria-label` en botones sólo ícono, `aria-pressed` /
  `aria-current`, `role="meter"` en los anillos, `aria-busy` al cargar); contraste WCAG AA (4,5:1 el texto, 3:1 desde 24 px);
  foco visible con el mismo anillo en todo (`shadow-focus`); objetivos táctiles de 44 px.
- **Estados, siempre todos:** default, hover, focus, selected/active, disabled, error (`danger`), vacío (`EmptyState`), cargando
  (`Skeleton`, `aria-busy`) y éxito (toast o `Callout` en `success`).
- **Tokens, no valores sueltos:** colores por tono (`ui/tone.ts`: el color siempre significa algo; si no significa nada, va en
  gris), tipografía de seis pasos (`text-micro` … `text-display`, nunca `text-[…]`), radios `rounded-tag/control/card/panel`,
  sombras `shadow-card/overlay/focus/brand`. Tailwind sólo con clases literales: variantes con `variants()` / `cx()`.
- **Componentes con variantes y props tipadas.** Antes de escribir clases sueltas se busca el componente en
  `src/components/ui/` y en `/playground`; si falta una variante, se agrega al componente (y su muestra al playground), no se
  copia el markup. Los botones siguen `docs/design-system.md` ("Botones: jerarquía y texto", chequeado por
  `src/__tests__/button-rules.test.ts`): una principal por grupo, lo que descarta sin caja, la principal al final, verbo + objeto.
- **Nada se corre de lugar** al cambiar de pestaña ni al abrir o contraer el menú (regla 7 del sistema de diseño).
- Las cartas van rectas (también el marco que las recorta) y con el dorso real; un porcentaje es un anillo, nunca una barra.

## C) Heurísticas UX (para criticar u optimizar)

- **Hick:** menos opciones por pantalla. Una acción principal; lo secundario se pliega, va a un menú o a la pantalla siguiente.
  Lo que no cambia o no importa se atenúa o no se muestra.
- **Fitts:** objetivos de 44 px o más; en el celular la acción principal abajo, al alcance del pulgar (la botonera de la mesa
  está pensada para el pulgar derecho); lo que se usa seguido, cerca de donde se mira.
- **Jerarquía visual:** 30/70 (un ícono, un número y un color dicen lo principal; el texto sólo completa); cada dato se dice una
  sola vez; el número más importante es el más grande (o un `ProgressRing`); como mucho tres tamaños de texto por bloque.
- **Framing:** "72 de cada 100 manos" antes que "72,3 %"; una diferencia se dice con ▲/▼ y con el color que le conviene a
  quien la lee (verde si le va bien, rojo si no), nunca con el signo solo.
- **Prueba social, escasez y reciprocidad** no aplican: no hay conversión ni venta. Si se piden variaciones, se define el
  objetivo (por ejemplo, "entender el resultado en menos de cinco segundos" o "terminar el paso sin volver atrás") y la
  audiencia (quien arma el deck en escritorio, quien mira el Lab desde el celular en un torneo), y cada variación dice qué
  principio aplica y por qué.

## D) Plantillas de salida

- **Crítica de diseño:** 3 cosas que funcionan · 3 prioridades de mejora con la solución concreta (qué componente o token se
  toca) · accesibilidad (WCAG) · responsive (390 / 1100 / 1440) · consistencia con `docs/design-system.md`. Tono constructivo
  y directo.
- **Documentación de componente:** para qué sirve · tabla de props · variantes · estados · accesibilidad (ARIA y teclado) ·
  hacer y no hacer · 3 casos de uso reales de la app. Va en la tabla de componentes de `docs/design-system.md` y con una
  muestra (`<Specimen>`) en `/playground`.
- **Microcopy:** 5 opciones en 3 tonos (formal, amigable, urgente), siempre en voseo y en los dos idiomas (`src/i18n/es` y
  `src/i18n/en`, ver `docs/i18n.md`); un botón empieza con el verbo y nombra el objeto, nunca "Sí", "No", "OK", "Aceptar".
- **Modelo de datos:** acá no hay base de datos: son formas JSON (`localStorage`, `src/data/*.json`, los mensajes del relay).
  Se entregan tipos TS exactos, claves estables, versión y migración de lo guardado (como `migrateSavedBuild`), el tamaño
  (la cuota de `localStorage`) y qué parte lee un worker.

## E) Forma de trabajar

- **Pasos chicos:** un cambio → validar en el navegador (390 / 1100 / 1440, menú abierto y contraído) → refinar. Tandas cortas
  que se puedan mirar enseguida.
- **Un brief como entrada** (las seis partes de A); un ejemplo del resultado esperado reduce la ambigüedad.
- **Primero `/playground`, después las pantallas:** un cambio de componente se ve en toda la app a la vez.
- Si la salida alimenta otro proceso, es JSON estructurado.
- **Cierre de cada tarea:** `npm run typecheck`, `npm run lint`, `npm test`, `npm run build`; chequeo responsive; y confirmar
  que la funcionalidad sigue igual (los tests de la pantalla, el estado y las rutas no cambian).

## F) Código

- **SOLID en componentes:** una responsabilidad por componente (una pantalla es un contenedor que compone piezas de `ui/`);
  presentación separada de lógica (la lógica va en módulos puros de `src/app/*.ts` o en helpers al lado de la pantalla, como
  `comparison-rows.ts`, testeables sin DOM); extensión por variantes y props (`variants()`), no por copia; dependencia de
  abstracciones (`Icon`, `Button`, `Card`, `t()`), no de clases sueltas.
- **Evitar STUPID:** singletons (el estado vive en RTK o en hooks, no en módulos con estado global), acoplamiento fuerte (una
  pantalla no importa de otra pantalla), código no testeable (lógica fuera del JSX), optimización prematura (se mide primero),
  nombres poco claros (en español, como el resto del código; verbos para las acciones) y duplicación (se busca en `ui/` antes
  de escribir).
- **Code smells propios del repo:** clases armadas con `${}`, dos utilidades de la misma propiedad en un elemento, `text-[…]`,
  un SVG suelto en vez de `Icon`, un `<button>` a mano en vez de `Button` / `IconButton`, una caja dentro de una tarjeta.

## G) Lenguaje de tarjetas: cuatro movimientos

Valen para toda tarjeta que resume algo (una build, un deck de torneo, el resultado del Lab, un jugador en la sala). Se aplican
de a uno y en este orden; el ejemplo visual es la hoja "Lenguaje · tarjetas" del lienzo de prototipos.

1. **Un solo borde.** La tarjeta (`Card`) es el único borde. Adentro nada lleva franja de color a un costado ni una caja dentro
   de la caja: se separa con espacio y, a lo sumo, una línea fina (`border-t border-border-subtle`). El estado lo dice un anillo,
   un chip o el borde de *toda* la tarjeta (el ganador de Comparar), nunca un borde extra.
2. **Lo que va junto, se junta.** La distancia dice el parentesco: poco aire dentro de un grupo y más entre grupos (escala
   4 · 8 · 16 · 24). "de cada 100" pegado a su número, "Yendo 1º / 2º" pegado a su anillo, el nombre pegado a sus vidas. Si todas
   las líneas están a la misma distancia, nada se lee como una unidad.
3. **Lo legal, a la ficha.** La tarjeta lleva sólo lo que decide. Condiciones, letra chica y aclaraciones (el aviso de "Cómo
   leer estos %", los conteos exactos de manos, créditos de YGOPRODeck, fuentes de precios, "sitio no oficial") van en la ficha
   o la hoja de detalle, a un toque con ⓘ; no se repiten en cada tarjeta ni se imponen en un modal antes del resultado.
4. **Número + acción.** El dato que decide y la acción que le sigue van en la misma fila, abajo (zona del pulgar): el número a
   la izquierda, el botón a la derecha. Orden de lectura: título y subtítulo, imagen, y abajo número + acción. Una sola acción
   principal por tarjeta (ver "Botones: jerarquía y texto" en `docs/design-system.md`).

Para revisar una tarjeta: contá los bordes (si hay más de uno, sacá uno); tapá los textos y mirá si se distinguen los grupos
sólo por el aire; buscá letra chica y preguntate si decide algo; y verificá que el botón quede pegado al número que lo motiva.

## Adaptaciones al repo

Lo que cambió respecto de la guía original y por qué:

1. **Base de espaciado:** "16 px" pasó a la escala de Tailwind (base 4 px) con `px-gutter` 22 px y `max-w-content`; 16 px queda
   como la separación típica entre bloques. Es lo que ya usan los componentes.
2. **Breakpoints:** a los estándar de Tailwind se suma el corte de **1101 px** del armazón (`min-[1101px]`), que es el único
   personalizado y ya está en toda la app; se prueba a 390 / 1100 / 1440 (regla 6 del sistema de diseño).
3. **"Tarjetas modernas":** el diseño es plano, oscuro, sin grises y con dos niveles de caja; sin brillos ni sombras de adorno;
   cartas rectas; los porcentajes son anillos, no barras.
4. **Estados:** se suma **focus** (el anillo `shadow-focus` es el mismo en todo) y el vacío va con `EmptyState`.
5. **Heurísticas de conversión** (prueba social, escasez, reciprocidad): no aplican a un producto sin venta; quedan Hick, Fitts,
   jerarquía y framing, con ejemplos del producto.
6. **Microcopy:** voseo, dos idiomas por `t()` y las reglas de botones del repo (verbo + objeto, sin "Sí / No / OK").
7. **Modelo de datos:** sin claves foráneas ni índices (no hay base de datos); JSON tipado y migraciones de `localStorage`.
8. **Cierre de tarea:** los comandos del repo y la verificación en el navegador con el menú abierto y contraído; siempre primero
   en `/playground`.
9. **Lectura de pedidos:** se agregaron las dos convenciones del repo (una captura sin texto es referencia; "necesita revisión"
   es una revisión completa) y el contexto fijo del producto.
10. **Lenguaje de tarjetas (G):** salió de una referencia de tarjeta de producto de un comercio (cuatro retoques sobre una misma
    tarjeta). Se tradujo al producto: el "precio" es el número "de cada 100", "lo legal" es el aviso de cómo leer los
    porcentajes y los conteos exactos, y la acción es la del repo (Comparar, Cargar en el builder, Copiar enlace). "Un solo
    borde" refuerza la regla de dos niveles de caja de `docs/design-system.md`.

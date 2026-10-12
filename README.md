# Yu-Gi-Oh! Probability Lab

Deck builder visual + calculadora exacta de probabilidades para Yu-Gi-Oh!.
La idea central es ayudar a entender deck building con un flujo simple: armás el deck, clasificás cada carta por origen y función, definís aperturas/problemas y medís consistencia.

## Qué hace la app

- Builder visual con búsqueda de cartas por YGOPRODeck.
- Drag & drop entre Main, Extra y Side.
- Formatos: Sin límite, TCG, OCG, GOAT, Edison y Genesys (con banlist o puntos).
- Importación de decks desde archivos `.ydk`, `.txt` o `.json`.
- Clasificación por carta en dos ejes independientes:
  - `origin`: `engine`, `non_engine`.
  - `roles`: `starter`, `extender`, `enabler`, `searcher`, `draw`, `payoff`, `recovery`, `handtrap`, `disruption`, `boardbreaker`, `floodgate`, `brick`, `garnet`.
- Aperturas y Problemas para medir consistencia real.
- Probabilidad exacta (enumeración combinatoria), yendo primero, segundo o en promedio.
- Práctica: una mesa para jugar solo (como el Solo Mode de DuelingBook) que abre con la mano ya robada y sus salidas y problemas debajo, con combos que se guardan y se reproducen paso a paso.
- Comparación A vs B contra otra build importada.
- Exportación del deck como imagen, decklist oficial en PDF y `.ydk`, y los tres pasos para llevarlo a Neuron (link YDKE o `.ydk` + extensión "Deck transfer" + base de datos oficial de Konami).
- Cupsy, la mascota: reacciona a lo que pasa (espera mientras carga, calcula con el Lab, revisa en Roles, festeja o se frustra con los avisos y con las manos de la práctica). Se agarra y se lleva a cualquier lado, choca con los botones flotantes y los empuja, y si se la deja apretada cinco segundos pregunta si querés darle un descanso (en escritorio también tiene una X al pasar el mouse). El Kuriboh alado junto a las redes es la caja de las mascotas: al tocarlo se despliegan las que hay, elegir una la saca o la trae de vuelta del descanso, y la que está afuera lleva una X blanca para mandarla a descansar (también en el celular).
- Meta: tier list de hand traps según los Tournament Meta Decks de YGOPRODeck (TCG y OCG por separado, Main y Side), con tendencia a dos semanas, los decks que las juegan y cada deck de torneo completo para verlo o cargarlo en el builder. Qué carta es hand trap se lee de sus reglas (los scripts de EDOPro de Project Ignis: un efecto rápido o disparador activable desde la mano), no de su texto, y sólo entran las que juegan varios decks distintos. Las cartas prohibidas en la banlist de cada región no entran al tier list. Los datos se actualizan solos cada día.
- Precios: en todos los detalles de carta (el detalle, la clasificación, el meta y el panel del builder de escritorio) la carta lleva una moneda verde con el signo de dólar en la esquina inferior derecha; al tocarlo se abre un modal con su precio de mercado de TCGplayer, en dólares, agrupado por expansión (con el sobre de fondo, la imagen de YGOPRODeck) y con edición, rareza y link al producto. Muestra todas las expansiones en las que salió la carta, las más nuevas primero, y un buscador por código o rareza que filtra ahí mismo. Los precios se piden recién al abrir el modal: un solo archivo de unos 4 KB, tenga la carta las reimpresiones que tenga. TCGplayer ya no da keys nuevas para su API, así que los precios salen de TCGCSV, un espejo diario de sus datos: el workflow baja todos los sets de Yu-Gi-Oh!, los cruza con las cartas de YGOPRODeck por código de set y los deja como archivos estáticos en `public/prices/` indexados por carta (un índice con los sets y 256 archivos `cards/<id % 256>.json`), sin servidor propio. Son una referencia, con hasta un día de atraso.

## Flujo recomendado

1. Armá tu deck en el builder.
2. Definí el origen y los roles de cada carta.
3. Definí aperturas y problemas.
4. Leé estadísticas y probá manos.

## Modelo de clasificación

La app separa explícitamente dos dimensiones:

- `origin`: de qué espacio del deck viene la carta.
- `roles`: qué función táctica cumple dentro de la mano, la línea o el plan.

La sugerencia automática lee primero las reglas de la carta (los scripts de EDOPro de Project Ignis, destilados en `src/data/card-rules.json` por el sync diario): qué hace cada efecto, desde dónde se activa y a quién le pega. De ahí salen `handtrap`, `searcher`, `draw`, `extender`, `starter` (saca ventaja del Deck al entrar al campo, o invoca o fusiona al activarse), `recovery` (trae del cementerio o vuelve de ahí), `disruption`, `boardbreaker`, `floodgate`, `payoff` (el Extra entero, y en el Main un nivel alto con interacción propia) y `garnet` o `brick` (no se puede invocar normal y en la mano no hace nada: garnet si otra carta la nombra, brick si no); también si una carta es pieza de un paquete (menciona arquetipos) o se juega en decks de cualquier arquetipo. Las cartas sin script (monstruos normales, cartas muy nuevas) siguen saliendo del texto. Encima de todo eso van tres reglas fijas: una hand trap siempre es también `disruption`; una pieza de engine del Main que no es trampa siempre es también `extender` (continúa la jugada); una hand trap que además frena de forma persistente (Droll, Mulcharmy) es `payoff`. `starter` es con lo que abrís: trae del Deck al entrar o al activarse, o es un cuerpo de engine de nivel bajo con efecto al invocarse que no dependa de tu cementerio; lo que trae del cementerio es sólo `recovery`. La lista de cartas conocidas y tus propias correcciones mandan sobre todo eso.

Eso evita mezclar pertenencia con función. Ejemplo:

- `origin: engine` + `roles: [starter, extender]`
- `origin: non_engine` + `roles: [handtrap, disruption]`
- `origin: engine` + `roles: [brick]`
- `origin: engine` + `roles: [extender, boardbreaker]`

## Conceptos clave

### Apertura
Una mano posible o combinación de cartas que sí querés ver al robar.

Ejemplos:
- `Mínimo 1 Starter`
- `Starter + Extender`
- `Starter + protección`
- `Engine + Interacción`

### Problema
Una situación incómoda que querés evitar.

Ejemplos:
- `Sin starter`
- `2 o más Bricks`
- `3 o más Non-engine`
- `Sin interacción`
- `Extender sin starter`

### Resultado final de la mano

- Jugable sin problemas: cumple apertura y no tiene problemas.
- Jugable con problemas: cumple apertura y tiene problemas.
- Mala: no cumple aperturas y sí tiene problemas.
- Neutra: no cumple aperturas ni problemas.

## Aperturas y problemas: cómo se leen

Una apertura o problema está formado por partes.
Podés decir:
- Se cumple con todo esto (todas las partes).
- Se cumple con cualquiera (al menos una parte).
- Se cumple con al menos N partes.

Cada parte define:
- Qué cartas se buscan.
- Cuántas (copias o nombres distintos).
- Si deben aparecer o no en la mano.

## Defaults automáticos

Cuando terminás el paso 2, la app genera presets base y se pueden editar:

Aperturas:
- `Mínimo 1 Starter`
- `Starter + Extender`
- `Al menos 1 interacción`
- `Starter + protección`
- `Engine + Interacción`

Problemas:
- `Sin starter`
- `2 o más Bricks` (si hay bricks suficientes)
- `3 o más Non-engine` (si hay non-engine suficiente)
- `Sin interacción`
- `Extender sin starter`

Si ya existían reglas con el mismo nombre, no se duplican.

## Cálculo exacto

La probabilidad exacta se calcula enumerando todas las manos iniciales posibles:
5 cartas yendo primero y 6 yendo segundo. Cada regla puede aplicar a un turno o a ambos;
si alguna aplica a un solo turno, la vista "Promedio" pondera los dos casos 50/50.
No es simulación, es cálculo combinatorio real.

## Práctica: la mesa

El botón flotante de la mano abre la mesa: el mazo se baraja y reparte de a una las cinco cartas a la mano en abanico, pegada abajo como en DuelingBook (una más al robar del deck: se va 2º); debajo de la mano, las salidas y problemas de esa mano inicial (chips chicos: tocar uno ilumina las cartas que lo cumplen y explica la regla; se evalúa la mano con la que se abrió, no lo que se va jugando). Al elegir una Invocación, activar o colocar una Mágica, una escala o una ficha, se encienden las zonas libres y se toca una (como el "Choose Zones" de DuelingBook); al activar un efecto o una Mágica, la carta destella. El campo tiene la disposición del lado propio de DuelingBook: a la izquierda la zona de campo y el Extra Deck; en el medio las dos zonas extra de monstruo con las seis fases, cinco zonas de monstruo y cinco de magia y trampa (las puntas, con sus gemas, hacen de péndulo); a la derecha, de arriba abajo, el destierro, el cementerio y el deck. No valida reglas: el que practica manda.

- **Arrastrar** una carta de la mano (o de una pila) a una zona libre: la mesa pregunta cómo sale (Invocación Normal o Especial, en ataque, boca abajo o en defensa; una Mágica, Activar o Colocar) y, si sólo puede salir de una forma, sale así; soltarla sobre un Xyz la adjunta como material; a la mano, cementerio, destierro, Extra o deck la mueve. Arrastrar el deck arrastra su carta tope (a la mano = robar, al cementerio = mill, a una zona = pregunta cómo sale). La ficha se arrastra a una zona de monstruo y pregunta si sale en ataque o en defensa.
- **Tocar** una carta abre, pegado a la carta, el menú con las jugadas del juego (y con lo mismo que hace el arrastre, para teclado): las de DuelingBook: desde la mano, Invocación Normal (pregunta en ataque o boca abajo; Nivel 1-4; de Nivel 5-6 pide 1 Sacrificio y de Nivel 7+ pide 2: "Invocación por Sacrificio", eligiendo los monstruos en el campo), Invocación Especial (pregunta en ataque o en defensa; los Link salen en ataque), y desde el Extra Deck una Fusión, un Sincro, un Xyz o un Link pide tocar en el campo los materiales y confirmar con un botón (los materiales van al cementerio; los de un Xyz quedan debajo), anotado como "Invocación Xyz de X (materiales: A y B)", Activar efecto, Activar como escala, Revelar, Seleccionar (el objetivo de un efecto: una mira sobre la carta, que se va al tocarla de nuevo o al cambiar de lugar), Descartar, Desterrar (boca arriba o boca abajo) y arriba/abajo del Main; en el campo, Activar efecto (también las Mágicas y Trampas boca arriba y los monstruos puestos como Mágica), Invocación por Volteo o voltear boca arriba, cambiar de posición, poner boca abajo, contadores, adjuntar como material Xyz y desacoplar, objetivo, al cementerio; desde el cementerio o el destierro, Invocación Especial, a la zona de Mágicas y Trampas, Activar efecto, a la mano, objetivo, Desterrar y arriba/abajo del Main (o al Extra Deck); desde el Main, a la mano y, si es una Mágica de Campo, Activar. Las cartas colocadas boca abajo (son tuyas) se ven con su imagen atenuada, de costado, a su tamaño y sobresaliendo de la casilla, si son monstruos. Las Magias se activan o se colocan, las Trampas se colocan desde la mano (o activan su efecto, como una hand trap), los Link no van a defensa y las fichas no se colocan boca abajo. Tocar el deck: robar, mandar al cementerio, ver el deck (en su orden real, tope primero, con buscador; al cerrar se baraja, como en la mesa real) o barajar. La ficha se crea desde el botón "+" de la barra: se toca y se elige si sale en ataque o en defensa y después la zona (o se arrastra el botón a una zona libre); se dibuja con la imagen de una ficha de YGOPRODeck (la Sheep Token). Tocar el Extra, el cementerio o el destierro muestra sus cartas.
- Cada jugada queda anotada ("Robás Ash Blossom", "Invocás X en ataque"…): **Deshacer** la borra y la lista de pasos (panel lateral en escritorio, botón en el celular) permite volver a cualquier paso.
- **Guardar combo** guarda con nombre la mano, el orden del deck y las jugadas en este dispositivo. Desde la lista de combos se carga uno y se reproduce solo, jugada por jugada, con las cartas volando de un lugar a otro (botones redondos de pausa / reproducción y de avance rápido, que sólo aparecen viendo un combo guardado, o Anterior / Siguiente a mano; la lista de pasos lleva la última jugada arriba); una jugada nueva a mitad de la reproducción sigue desde ahí (el combo guardado no cambia). Si una carta del combo ya no está en el deck, se baja su imagen para mostrarla igual.
- **Fases:** arriba del campo van DP · SP · M1 · BP · M2 · EP como en DuelingBook; la actual está encendida y, como en el juego, el turno empieza en la Draw Phase (en el turno 1 el que empieza no roba: la mano inicial ya está). Tocar otra fase queda anotado como jugada ("Pasás a la Battle Phase"), se deshace y se reproduce en los combos; de la End Phase a la Draw Phase empieza otro turno y se roba sola la carta del tope ("Turno 2: Draw Phase, robás X"). No se impone qué se puede hacer en cada fase.
- La mesa sigue viva al cerrar el modal: se vuelve a abrir donde estaba. "Nueva mano" baraja y reparte otra.

## Calculadora de LP (celular)

Hay un botón flotante con un corazón (en celular y escritorio; como el de práctica, se arrastra a donde moleste menos, y si los dos chocan se empujan) que abre la calculadora de puntos de vida encima de cualquier pantalla (en escritorio, en un panel del tamaño de un celular): en pleno duelo se cierra para leer una carta y se vuelve con un toque. Tiene la estructura de la de Neuron, pero más rápida: los dos LP lado a lado (se toca uno para elegir a quién va la operación), reiniciar y deshacer en el medio, el display de la operación, tres atajos con los últimos cambios para repetirlos con un toque, y el teclado de Neuron (Borrar, +, −, ÷2, dígitos, 00 y 000) con "=". Con menos de tres dígitos lo tecleado se entiende en centenas ("8" es 800). Las subas se ven en verde y las bajas en rojo. El reloj de la ronda cuenta 50 minutos para atrás, avisa a los 10 y a los 5 minutos, suena y vibra al llegar a cero y lo repite hasta que se reinicia el reloj (los tres avisos se pueden probar desde "Moneda, dado y avisos") y, mientras corre, se ve en el botón flotante desde cualquier pantalla; se reinicia aparte del duelo, porque el match sigue entre juego y juego. Moneda (la King of Games, con sus dos caras) y dado dorado de seis caras animados; las imágenes viven en `public/cosmetics/` para sumar más cosméticos. El duelo se guarda en el dispositivo (sobrevive a cerrar la app) y la pantalla no se apaga mientras la calculadora está abierta.

## Estructura del proyecto

```
src/
  probability.ts             motor exacto (valida y calcula)
  probability-summary.ts     enumeración de manos y métricas
  app/                       lógica sin UI
    store.ts, *-slice.ts     estado global (Redux Toolkit)
    persistence.ts           load/save en localStorage
    deck-builder.ts          reglas del builder
    deck-format.ts           límites por formato
    deck-import.ts           importación .ydk / .txt / .json
    classification-engine.ts sugerencias de origen y roles
    pattern-*.ts, patterns.ts aperturas y problemas
    turn-context.ts          ir primero / segundo / promedio
    build-comparison.ts      comparación A vs B
    practice-mat.ts          la mesa de práctica: estado, jugadas y sus textos (puro)
    saved-combos.ts          combos guardados en localStorage
    use-*.ts                 hooks reutilizables
  components/
    deck-mode/               pantalla principal y navegación por pasos
    DeckZone.tsx             zonas Main / Extra / Side
    SearchPanel.tsx          búsqueda
    DeckRolesPanel.tsx       clasificación por carta
    ProbabilityPanel.tsx     Probability Lab
    probability/             editor de reglas, práctica y mesa (PracticeMat)
    comparison/              pantalla de comparación
    card-detail/             detalle de carta
    ui/                      botones y piezas básicas
  ygoprodeck/                cliente y parser de la API
  __tests__/                 tests (Vitest + fast-check)
```

## Scripts

```
npm install
npm run dev          # servidor de desarrollo
npm run build        # chequeo de tipos + build de producción
npm run preview      # sirve el build
npm test             # tests
npm run typecheck    # tipos de la app y de los tests
npm run lint         # ESLint: reglas de hooks, variables sin uso y lo recomendado de TypeScript
npm run sync:genesys # actualiza los puntos de Genesys
npm run sync:meta    # actualiza los Tournament Meta Decks (el workflow sync-meta-decks lo hace solo cada día)
npm run sync:prices  # baja los precios de TCGplayer a public/prices, indexados por carta (el mismo workflow, también cada día)
```

El CI (`.github/workflows/ci.yml`) corre `typecheck`, `lint`, `test` y `build` en cada PR y push a `main`.

## Requisitos

- Node.js `>=22.12.0` (ver `.nvmrc`) + npm.

## Limitaciones actuales

- No hay importación desde imagen (por decisión de UX).
- El cálculo es exacto solo para la mano inicial (no simula robos posteriores).
- La mesa de práctica es manual (no aplica reglas ni simula al rival); no hay simulación automática de líneas o interrupciones.

## Próximos pasos sugeridos

1. Presets de pruebas contra handtraps comunes.
2. Editor todavía más guiado para aperturas/problemas.
3. Métricas avanzadas de “juega sobre X”.

## Licencia

© 2026 Gastón Valles. Todos los derechos reservados (ver `LICENSE`). Yu-Gi-Oh!, los nombres y las imágenes de las cartas son marcas y obras de Konami; este proyecto no es oficial ni está afiliado. Los datos de cartas provienen de YGOPRODeck.

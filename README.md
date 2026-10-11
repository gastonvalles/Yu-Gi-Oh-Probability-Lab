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
- Práctica de manos para ver ejemplos concretos.
- Comparación A vs B contra otra build importada.
- Exportación del deck como imagen, decklist oficial en PDF y `.ydk`, y los tres pasos para llevarlo a Neuron (link YDKE o `.ydk` + extensión "Deck transfer" + base de datos oficial de Konami).
- Cupsy, la mascota: reacciona a lo que pasa (espera mientras carga, calcula con el Lab, revisa en Roles, festeja o se frustra con los avisos y con las manos de la práctica). Se agarra y se lleva a cualquier lado, choca con los botones flotantes y los empuja, y si se la deja apretada cinco segundos pregunta si querés darle un descanso (en escritorio también tiene una X al pasar el mouse). El Kuriboh alado junto a las redes es la caja de las mascotas: al tocarlo se despliegan las que hay y elegir una la saca o la trae de vuelta del descanso.
- Meta: tier list de hand traps según los Tournament Meta Decks de YGOPRODeck (TCG y OCG por separado, Main y Side), con tendencia a dos semanas, los decks que las juegan y cada deck de torneo completo para verlo o cargarlo en el builder. Qué carta es hand trap se lee de sus reglas (los scripts de EDOPro de Project Ignis: un efecto rápido o disparador activable desde la mano), no de su texto, y sólo entran las que juegan varios decks distintos. Las cartas prohibidas en la banlist de cada región no entran al tier list. Los datos se actualizan solos cada día.
- Precios: en todos los detalles de carta (el detalle, la clasificación, el meta y el panel del builder de escritorio) la carta lleva un botón redondo con el signo de dólar en la esquina inferior derecha; al tocarlo se abre un modal con su precio de mercado de TCGplayer, en dólares, en las tres expansiones más nuevas en las que salió, agrupado por expansión (con el sobre de fondo, la imagen de YGOPRODeck) y con edición, rareza y link al producto. Los precios se piden recién al abrir el modal. TCGplayer ya no da keys nuevas para su API, así que los precios salen de TCGCSV, un espejo diario de sus datos: el workflow baja todos los sets de Yu-Gi-Oh! a archivos estáticos en `public/prices/` (un índice y un archivo por set) y la app los cruza con las impresiones de la carta que da YGOPRODeck, sin servidor propio. Son una referencia, con hasta un día de atraso.

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

## Práctica de manos

Permite robar una mano al azar y ver:
- Qué aperturas cumple.
- Qué problemas aparecen.
- El veredicto final.

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
    use-*.ts                 hooks reutilizables
  components/
    deck-mode/               pantalla principal y navegación por pasos
    DeckZone.tsx             zonas Main / Extra / Side
    SearchPanel.tsx          búsqueda
    DeckRolesPanel.tsx       clasificación por carta
    ProbabilityPanel.tsx     Probability Lab
    probability/             editor de reglas y práctica
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
npm run sync:prices  # baja los precios de TCGplayer a public/prices (el mismo workflow, también cada día)
```

El CI (`.github/workflows/ci.yml`) corre `typecheck`, `lint`, `test` y `build` en cada PR y push a `main`.

## Requisitos

- Node.js `>=22.12.0` (ver `.nvmrc`) + npm.

## Limitaciones actuales

- No hay importación desde imagen (por decisión de UX).
- El cálculo es exacto solo para la mano inicial (no simula robos posteriores).
- No hay simulación de líneas o interrupciones todavía.

## Próximos pasos sugeridos

1. Presets de pruebas contra handtraps comunes.
2. Editor todavía más guiado para aperturas/problemas.
3. Métricas avanzadas de “juega sobre X”.

## Licencia

© 2026 Gastón Valles. Todos los derechos reservados (ver `LICENSE`). Yu-Gi-Oh!, los nombres y las imágenes de las cartas son marcas y obras de Konami; este proyecto no es oficial ni está afiliado. Los datos de cartas provienen de YGOPRODeck.

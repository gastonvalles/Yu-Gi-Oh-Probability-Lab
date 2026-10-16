# YGOUltraLab

Deck builder visual + calculadora exacta de probabilidades para Yu-Gi-Oh!.
La idea central es ayudar a entender deck building con un flujo simple: armás el deck, clasificás cada carta por origen y función, definís aperturas/problemas y medís consistencia.

## Qué hace la app

- Navegación: en escritorio, un menú lateral a la izquierda (se contrae a una columna de íconos y recuerda cómo lo dejaste) con los pasos del deck (Deck · Roles · Lab · Comparar · Exportar), las herramientas que abren un panel encima (Práctica y Calculadora de LP) y la referencia (Tier lists, Decks de torneo, Replays, Expansiones y Banlists); en el celular, una barra de arriba con una hamburguesa que abre un cajón con el mismo menú. Toda pantalla lleva su título (`h1`) y el mismo pie con la autoría, las redes y la privacidad; en escritorio el pie está fijo abajo y lo que scrollea es la pantalla, siempre en un recuadro del mismo alto (en el celular va al final de la página).
- Español e inglés: toda la interfaz está en los dos idiomas. Se elige con el selector **ES | EN** del menú lateral (en el celular, del cajón de la hamburguesa); si nunca se eligió, se usa el idioma del navegador. Cambiar de idioma recarga la página (lo guardado no se pierde). Los nombres y textos de las cartas los da YGOPRODeck en inglés. Cómo agregar o cambiar un texto: `docs/i18n.md`.
- Builder visual con búsqueda de cartas por YGOPRODeck.
- Drag & drop entre Main, Extra y Side.
- Formatos: Sin límite, TCG, OCG, GOAT, Edison y Genesys (con banlist o puntos).
- Importación de decks desde archivos `.ydk`, `.txt` o `.json`.
- Clasificación por carta en dos ejes independientes:
  - `origin`: `engine`, `non_engine`.
  - `roles`: `starter`, `extender`, `enabler`, `searcher`, `draw`, `payoff`, `recovery`, `handtrap`, `disruption`, `boardbreaker`, `floodgate`, `brick`, `garnet`.
- Aperturas y Problemas para medir consistencia real.
- Probabilidad exacta (enumeración combinatoria), yendo primero, segundo o en promedio.
- Calculadora rápida en el Lab, sin armar el deck: con N copias en un deck de M, cuántas manos abren la carta (al menos 1, 2 o 3, yendo 1º o 2º) y cuántas copias hacen falta para llegar a un %.
- Práctica: una mesa para jugar solo (como el Solo Mode de DuelingBook) que abre con la mano ya robada y sus salidas y problemas debajo, con combos que se guardan y se reproducen paso a paso.
- Duelo con un amigo: la misma mesa jugada contra otra persona, cada una en su dispositivo (celular y PC), entrando con un enlace, sin cuentas. Los dos tocan "Estoy listo", definen con moneda, dado o piedra-papel-tijera quién elige ir primero, y juegan con ataque animado, contadores, chat, reloj compartido, rendirse y revancha; se juega con el deck del builder o con uno pegado (`ydke://` o `.ydk`). Hasta dos personas más pueden mirar sin poder tocar nada. Ver "Duelo con un amigo" más abajo y `docs/duelo.md`.
- Comparación A vs B contra otra build importada.
- Exportación del deck como imagen, decklist oficial en PDF, `.ydk`, lista `.txt` (cantidad y nombre por línea) y `.json` (con los roles, para importarlo acá en otro navegador), y los tres pasos para llevarlo a Neuron (link YDKE o `.ydk` + extensión "Deck transfer" + base de datos oficial de Konami).
- Copia de seguridad en Exportar: un archivo con todo lo que la app guarda en el navegador (deck, roles, reglas, builds, combos y calculadora de LP; las cachés no) para llevarlo a otro navegador o recuperarlo después de borrar los datos. Restaurar reemplaza lo que hay y recarga la página.
- Las mascotas, Cupsy y el Kuriboh alado: reaccionan a lo que pasa (esperan mientras carga, calculan con el Lab, revisan en Roles, festejan o se frustran con los avisos y con las manos de la práctica). Se elige cuáles salen desde Mascotas, en el menú (una herramienta más, junto a la práctica y la calculadora de LP): un modal en el medio de la pantalla las muestra con un botón para sacarlas o darles un descanso, y pueden estar hasta tres afuera a la vez. Se agarran y se dejan en cualquier lugar de la pantalla (también sobre el menú y el pie: se quedan donde las soltás), chocan con los botones flotantes y con las otras mascotas y los empujan (a la empujada no le gusta), se saludan cuando se juntan (la que llega saluda y la otra le contesta) y, si se las deja apretadas cinco segundos, preguntan si querés darles un descanso (en escritorio también tienen una X al pasar el mouse).
- Tier lists: dos listas, separadas de los decks de torneo: hand traps y boardbreakers, según los Tournament Meta Decks de YGOPRODeck (TCG y OCG por separado), cada una con tendencia a dos semanas (sube o baja a partir de 5 puntos de cambio) y su detalle. Se cuenta en Main, en Side o en los dos. Qué carta es hand trap o boardbreaker se lee de sus reglas (los scripts de EDOPro de Project Ignis: un efecto rápido o disparador activable desde la mano; destruye, destierra, devuelve o roba cartas del campo del rival, o se invoca en él, como los Kaiju), no de su texto, más unas pocas excepciones a mano (`BOARDBREAKER_OVERRIDES` en `scripts/sync-meta-decks.mjs`: las de siempre, como Dark Hole o Mystical Space Typhoon, que las reglas no leen así), y sólo entran las que juegan varios decks distintos. Las cartas prohibidas en la banlist de cada región no entran. Tocar una carta abre su detalle y desde ahí se pasa a los decks de torneo filtrados. Los datos se actualizan solos cada día; si una corrida trae menos de la mitad de los decks de la anterior, o menos de cinco boardbreakers salen de las reglas, el script falla en lugar de pisar los datos buenos.
- Decks de torneo: los mismos Tournament Meta Decks, cada uno completo para verlo, copiar su link o cargarlo en el builder (`#tournaments?deck=…`; con `?card=…` o `?archetype=…` queda filtrado; el link de antes, `#meta?deck=…`, sigue andando). Si el deck tiene replays, sus videos están ahí mismo, en el encabezado, y se ven encima del deck.
- Expansiones: las expansiones del TCG en inglés, las más nuevas primero y agrupadas por año, con un buscador; al elegir una se ven sus cartas enteras (el sobre de cada expansión, la imagen de YGOPRODeck, sale sólo en la lista, al lado de su nombre; si una no la tiene queda una caja con un ícono), una al lado de la otra en una grilla (no una lista), por código, cada una con **el escaneo de su impresión** (una overframe o de arte extendido se ve como es, con su etiqueta "Extended Art"), su código, su rareza, su edición y su precio de mercado de TCGplayer abajo (con link al producto), y se inclinan en 3D hacia el mouse igual que la carta grande del detalle, con buscador por nombre o código, filtros en una sola fila de chips (un solo "Todas" que los apaga, las rarezas de la más común a la más rara —no por orden alfabético— y, a continuación, los artes distintos: Extended Art, Alternate Art...; cada chip dice cuántas impresiones tiene, una rareza y un arte se combinan y tocar el chip encendido lo apaga) y orden por código o por precio (de a 60, con "Mostrar más": hay expansiones con más de 800 impresiones). La vista usa todo el ancho de la pantalla (hasta 112 rem). Tocar una carta abre su detalle (artes, precios por expansión y texto). En el celular se elige primero de la lista y un botón vuelve a ella; en escritorio se abre sola la más nueva y la lista y las cartas son dos columnas del mismo alto, cada una con su scroll. Salen de los mismos precios que el detalle de cada carta: el sync diario deja además un archivo por expansión, `public/prices/sets/<id>.json`, con una impresión por línea (`[código, rareza, edición, precio, producto, id de la carta, nombre]`), y el índice trae cuántas impresiones tiene cada una y el prefijo de sus códigos ("LOB" de "LOB-EN001"), que es el nombre de la imagen de su sobre.
- Banlists: las listas históricas de prohibidas y limitadas del TCG (desde septiembre de 2011) y del OCG (desde septiembre de 2013), una por una, para navegarlas a gusto. Se elige la región (TCG | OCG, la misma que en los tier lists y los decks de torneo), la lista (con un selector o con las flechas de anterior y siguiente; arranca en la vigente) y qué ver: **Cambios**, lo que se prohibió, limitó, semi-limitó y liberó respecto de la lista anterior, con cómo estaba cada carta antes y en el mismo orden que los anuncios de Konami (para la lista de septiembre de 2026 del TCG da exactamente los anuncios oficiales), o la **Lista completa**. Cada carta se ve con su arte y se puede buscar por nombre; tocarla abre su detalle (arte, texto, precios). Las listas salen de `lflist.conf` de YGOPro (Fluorohydride/ygopro, que sus mantenedores actualizan en cada lista nueva), con los nombres y los códigos de los artes alternativos de YGOPRODeck; el sync diario las deja en `src/data/banlists.json` (unos 190 KB, que sólo baja la vista al abrirla). Cada lista muestra el **día exacto** en que entró en vigencia ("21 de septiembre de 2026"): `lflist.conf` sólo trae el mes, así que el día sale de Yugipedia, de la plantilla `Limitation list` (`start_date` y `medium`) de la página de cada lista ("September 2026 Lists (TCG)"); el sync pide de a 50 páginas, sólo las de las listas que todavía no tienen día (el archivo ya escrito se reusa, así que a diario es un pedido o ninguno) y, si Yugipedia no responde o todavía no tiene la página de una lista nueva, esa queda con el mes ("Octubre de 2026") y se vuelve a probar al día siguiente, sin que falle la bajada.
- Replays: arriba de la lista, **«En vivo ahora»**: las transmisiones que estén al aire en los canales oficiales de YouTube (YCS y demás torneos; hasta que terminan), cada una con su miniatura, cuánta gente la mira y «Mirar en vivo», que la abre en una ventana con el reproductor sin cookies (se carga al tocar «reproducir») y el link a YouTube; se vuelve a mirar cada minuto (`api/live` lee la pestaña de transmisiones de cada canal y el CDN guarda la respuesta 45 segundos; si no se pudo mirar, lo dice y deja los links a los canales). Más abajo, los duelos de torneo de los canales de YouTube Yu-Gi-Oh! TCG Europe y Yu-Gi-Oh! TCG, cruzados con los decks de torneo por torneo y jugador (los canales sólo ponen la inicial del apellido: "Timoti B." es "Timoti Baggio"): cada jugador con deck tiene un botón "Ver deck" que abre su detalle sin salir de los replays (si el video estaba abierto, se corta para que no siga sonando debajo). Por defecto se ven los que tienen al menos un deck de torneo; "Todos" suma el resto (los de Genesys no se cruzan: los decks son de TCG y OCG). Cada replay se ve en la app con el reproductor sin cookies de YouTube, que no se carga hasta tocar Reproducir (hasta entonces sólo se piden las miniaturas), y los videos de un deck de torneo están en su encabezado. El workflow `sync-replays` los baja todos los días leyendo la pestaña Videos de cada canal, sin API key: es el formato interno de YouTube y puede cambiar; si pasa, el workflow se ve rojo y los datos siguen como estaban.
- Artes alternativos: el detalle de una carta muestra, si los tiene, las miniaturas de todos sus artes: los de YGOPRODeck (el original y los alternativos que tenga cargados, que se piden por nombre al abrir porque por id la API devuelve sólo el arte de ese código) y, además, el escaneo de cada impresión que salió, de TCGplayer (`product/<id>_400w.jpg`, un producto por impresión): ahí están las overframe, las de arte extendido ("Extended Art") y las alternativas, que YGOPRODeck no tiene como arte de la carta. Si son más de los que entran (una carta muy reimpresa tiene más de treinta), la tira scrollea: bajo la carta con su barra fina a la vista, de punta a punta, y la rueda del mouse la recorre de costado (en la franja angosta al costado de la carta, la barra va escondida para no tapar las miniaturas y se recorre con el dedo, la rueda o arrastrando con el mouse: el arrastre no elige ni cierra el detalle) (sólo se centra mientras entra entera: centrada a la fuerza, las primeras quedaban cortadas y sin forma de llegar). Si el escaneo de una impresión no existe, se ve la imagen de YGOPRODeck de la carta (en la miniatura y en el arte grande), nunca unas iniciales. Tocar una cambia el arte grande y el nombre de la impresión sale al dejar el mouse encima (al costado de la carta en el detalle, y bajo la imagen en el panel del builder de escritorio). Los precios (un solo archivo de unos 4 KB por carta) se piden al abrir el detalle porque de ahí salen los escaneos.
- Precios: en todos los detalles de carta (el detalle, la clasificación, el meta y el panel del builder de escritorio) la carta lleva al lado (afuera de ella, así no se mueve con la inclinación 3D) un ícono blanco con una moneda y el signo de dólar, que se pone verde al pasar el mouse; al tocarlo se abre un modal con su precio de mercado de TCGplayer, en dólares, agrupado por expansión (con el sobre de fondo, la imagen de YGOPRODeck) y con edición y rareza. **Tocar una impresión lleva a la vista de Expansiones** (`#expansions?set=<expansión>&print=<producto>`: abre esa expansión, deja la carta iluminada con un borde y un brillo verdes y a la vista en el medio de la pantalla; la lista se mueve hasta la expansión y elegir otra la apaga): de ahí se va a su producto en TCGplayer con el link que lleva cada carta junto a su precio. El detalle y los precios se cierran al ir. Muestra todas las expansiones en las que salió la carta, las más nuevas primero, y un buscador por código o rareza que filtra ahí mismo. Cada impresión lleva su escaneo (el de su producto en TCGplayer) y, si es de un arte distinto, una etiqueta ("Extended Art", "Alternate Art", "HERO Art"...) que sale del nombre del producto; el buscador también busca por ese arte. Los precios de la carta (un solo archivo de unos 4 KB, tenga las reimpresiones que tenga) se piden al abrir el detalle. TCGplayer ya no da keys nuevas para su API, así que los precios salen de TCGCSV, un espejo diario de sus datos: el workflow baja todos los sets de Yu-Gi-Oh!, los cruza con las cartas de YGOPRODeck por código de set y los deja como archivos estáticos en `public/prices/` indexados por carta (un índice con los sets y 256 archivos `cards/<id % 256>.json`; una impresión de un arte distinto lleva su nombre al final de la fila), sin servidor propio. Son una referencia, con hasta un día de atraso.

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

Si ya existían reglas con el mismo nombre, no se duplican. Las reglas propias que usan cartas que ya no están en el deck no se evalúan: quedan plegadas en "Reglas sin carta", debajo de "Tus reglas", hasta que les cambiés la carta o las elimines.

## Cálculo exacto

La probabilidad exacta se calcula enumerando todas las manos iniciales posibles:
5 cartas yendo primero y 6 yendo segundo. Cada regla puede aplicar a un turno o a ambos;
si alguna aplica a un solo turno, la vista "Promedio" pondera los dos casos 50/50.
No es simulación, es cálculo combinatorio real.

## Práctica: la mesa

La práctica es una pantalla entera (`#practice`, en las herramientas del menú; sin pie, y en el celular del alto exacto de la ventana, sin scroll de página): el mazo se baraja y reparte de a una las cinco cartas a la mano en abanico, pegada abajo como en DuelingBook (una más al robar del deck: se va 2º); junto a la mano (en el celular, flotando justo arriba de ella, sin ocupar lugar: el campo nunca se mueve), las salidas y problemas de esa mano inicial (chips chicos: tocar uno ilumina las cartas que lo cumplen y explica la regla; se evalúa la mano con la que se abrió, no lo que se va jugando: con la primera jugada los chips desaparecen, y con ellos lo que marcan y el gris de una mano no jugable, y al deshacerla vuelven; la explicación de un chip flota sobre ellos). Al elegir una Invocación, activar o colocar una Mágica, una escala o una ficha, se encienden las zonas libres y se toca una (como el "Choose Zones" de DuelingBook); al activar un efecto o una Mágica, la carta destella y aparece grande en el centro. El campo tiene la disposición del lado propio de DuelingBook: a la izquierda la zona de campo y el Extra Deck; en el medio las dos zonas extra de monstruo con las seis fases, cinco zonas de monstruo y cinco de magia y trampa (las puntas, con sus gemas, hacen de péndulo); a la derecha, de arriba abajo, el destierro, el cementerio y el deck. No valida reglas: el que practica manda (lo único que respeta es que las zonas extra de monstruo son para lo que viene del Extra Deck: a lo demás no se le ofrecen ni se le dejan caer ahí).

- **Arrastrar** una carta de la mano (o de una pila) a una zona libre: la carta se queda en la zona y la mesa pregunta qué hacer con ella, con el mismo menú de tocarla pero sólo con lo que la saca ahí (Invocación Normal, Colocar o Invocación Especial, que pregunta después si va en ataque o en defensa; una Mágica, Activar o Colocar); si sólo puede salir de una forma, sale así, y si se cierra el menú sin elegir, la carta vuelve a la mano; soltarla sobre un Xyz la adjunta como material; a la mano, cementerio, destierro, Extra o deck la mueve. Arrastrar el deck arrastra su carta tope (a la mano = robar, al cementerio = mill, a una zona = pregunta cómo sale). La ficha se arrastra a una zona de monstruo y pregunta si sale en ataque o en defensa.
- **Tocar** una carta abre, pegado a la carta, el menú con las jugadas del juego (y con lo mismo que hace el arrastre, para teclado): las de DuelingBook: desde la mano, Invocación Normal (siempre en ataque) y Colocar (boca abajo), de Nivel 1-4; de Nivel 5-6 piden 1 Sacrificio y de Nivel 7+ piden 2, pero no son otra jugada: la Invocación por Sacrificio es una Invocación Normal, así que el menú ofrece la misma Invocación Normal y Colocar y, al elegirlas, la mesa pide tocar en el campo los monstruos a sacrificar, anotado como "Invocación Normal de X (sacrificás A y B)"), Invocación Especial (pregunta en ataque o en defensa después de elegirla; los Link salen en ataque), y desde el Extra Deck una Fusión, un Sincro, un Xyz o un Link pide tocar en el campo los materiales y confirmar con un botón (los materiales van al cementerio; los de un Xyz quedan debajo), anotado como "Invocación Xyz de X (materiales: A y B)", Activar efecto, Activar como escala, Revelar, Target (el objetivo de un efecto: una mira sobre la carta, que se va al tocarla de nuevo o al cambiar de lugar; en el cementerio y el destierro la mira cae sobre la carta en el visor, que sigue abierto para elegir otra, y sobre la casilla de la pila), Descartar, Desterrar (pregunta si queda boca arriba o boca abajo) y arriba/abajo del Main; en el campo, Activar efecto (también las Mágicas y Trampas boca arriba y los monstruos puestos como Mágica), Invocación por Volteo o voltear boca arriba, cambiar de posición, poner boca abajo, contadores, adjuntar como material Xyz y desacoplar, objetivo, al cementerio; desde el cementerio o el destierro, Invocación Especial, a la zona de Mágicas y Trampas, Activar efecto, a la mano, objetivo, Desterrar y arriba/abajo del Main (o al Extra Deck); desde el Main, a la mano y, si es una Mágica de Campo, Activar. Las cartas colocadas boca abajo (son tuyas) se ven con su imagen atenuada, de costado y a su tamaño, si son monstruos (las zonas del centro son cuadradas y la carta acostada entra justo, sin achicarse ni pisar a la de al lado). Las Magias se activan o se colocan, las Trampas se colocan desde la mano (o activan su efecto, como una hand trap), los Link no van a defensa y las fichas no se colocan boca abajo. Tocar el deck: robar, mandar al cementerio, ver el deck (en su orden real, tope primero, con buscador; sacar una carta de ahí baraja el resto en la misma jugada, "Buscás X del deck a la mano y barajás", y cerrarlo sin sacar nada baraja aparte, como en la mesa real) o barajar. La ficha se crea desde el botón "+" de la barra: se toca y se elige si sale en ataque o en defensa y después la zona (o se arrastra el botón a una zona libre); se dibuja con la imagen de una ficha de YGOPRODeck (la Sheep Token). Tocar el Extra, el cementerio o el destierro muestra sus cartas.
- **Efectos**: además del vuelo de las cartas, lo que pasa se ve. La carta de la que se abre el menú lleva un marco celeste con una luz que le da la vuelta; **Target** le baja una mira roja que se cierra sobre la carta y queda latiendo; activar, mostrar o declarar una carta la pone grande en el centro, con su marco (dorado, celeste o violeta), su nombre y una línea de lo que pasó; una invocación cae con un fogonazo, ondas y chispas en la zona, del color de cómo llega (Normal dorado, Especial celeste, Fusión violeta, Sincronía blanca, Xyz azul, Enlace verde agua); las cartas se dan vuelta en 3D (al repartirse desde el mazo, al pasar boca arriba o boca abajo, al ir al deck o al Extra) y el dorso es el de siempre de Yu-Gi-Oh!, el que YGOPRODeck da por defecto (`cards/back.jpg`, por el mismo proxy que las demás imágenes); las pilas reciben la carta con un marco de su color (cementerio violeta, destierro ámbar, deck y Extra celeste) y los contadores rebotan al cambiar; la mano se enmarca en celeste cuando recibe una carta; cada fase nueva cruza el campo con su banda violeta (con el nombre de la fase y, si empieza otro, el turno; nada más: las seis fases ya están en los botones); las zonas que se ofrecen respiran en verde y la que está bajo una carta arrastrada se enciende en violeta. Al reproducir un combo, cada paso que mueve cartas (robar, buscar, mandar al cementerio, invocar, adjuntar) las muestra además grandes en el centro, de a una o de a varias, con lo que pasó arriba. En el detalle de una carta, la imagen se inclina en 3D hacia el mouse con un brillo que la sigue. Todas las cartas llevan las esquinas rectas, como la carta de verdad. Todo se apaga con "reducir movimiento" del sistema.
- Cada jugada queda anotada ("Robás Ash Blossom", "Invocás X en ataque"…): **Deshacer** la borra y la lista de pasos (panel lateral en escritorio, botón en el celular) permite volver a cualquier paso: cada jugada lleva la miniatura de las cartas que mueve y los cambios de fase hacen de separador. Abajo no se repite nada de eso: sin Anterior / Siguiente, sin contador, sin la frase de la última jugada ni la pista de qué hacer (siguen en el estado, sólo para el lector de pantalla); a la vista sólo queda lo que falta elegir (Sacrificios, materiales).
- **Guardar combo** guarda con nombre la mano, el orden del deck y las jugadas en este dispositivo. Desde la lista de combos se carga uno y se reproduce solo, jugada por jugada, con las cartas volando de un lugar a otro; el lápiz le cambia el nombre (que no puede repetir el de otro combo) y el tacho lo borra. Viendo un combo guardado aparecen los controles del replay, clonados de YGOPocket: volver al principio, anterior, el botón grande de reproducir / pausar (al final, "Ver de nuevo"), siguiente, la **línea de tiempo** (una pastilla por paso: violeta lo ya visto, verde el paso actual, una rayita naranja en los cambios de fase y una línea que separa los turnos; se toca, se arrastra o se maneja con el teclado como un deslizador), el botón de la **lista de pasos** (que se abre aparte, en el mismo panel del celular) y la **velocidad** (0,5× · 1× · 1,5× · 2×); en vivo, Anterior / Siguiente a mano. La lista de pasos lleva la última jugada arriba; una jugada nueva a mitad de la reproducción sigue desde ahí (el combo guardado no cambia). Si una carta del combo ya no está en el deck, se baja su imagen para mostrarla igual.
- **Fases:** en escritorio van entre las zonas del campo DP · SP · M1 · BP · M2 · EP como en DuelingBook, y en el celular abajo, solas y centradas, sin texto al lado (Deshacer está arriba y los pasos en su lista, así que no hay Anterior / Siguiente); la actual está encendida y, como en el juego, el turno empieza en la Draw Phase (en el turno 1 el que empieza no roba: la mano inicial ya está). Tocar otra fase queda anotado como jugada ("Pasás a la Battle Phase"), se deshace y se reproduce en los combos; de la End Phase a la Draw Phase empieza otro turno y se roba sola la carta del tope ("Turno 2: Draw Phase, robás X"). No se impone qué se puede hacer en cada fase. El turno va arriba a la izquierda de la barra y los botones de la mesa (nueva mano, deshacer, guardar, ficha, lista de pasos), a la derecha.
- La partida sigue viva al salir de la pantalla (a la calculadora, al builder): al volver está donde estaba. "Nueva mano" baraja y reparte otra.
- **La mascota del duelo:** en la práctica hay una sola mascota, la primera de las que están afuera, parada en la esquina libre del campo (en el celular, sobre esa esquina); las demás se quedan esperando y al salir del duelo vuelven a flotar donde estaban. Reacciona como siempre (festeja una mano limpia, se frustra con un problema).

## Duelo con un amigo

El paso `#duel` (en las herramientas del menú) junta a dos jugadores, cada uno en su dispositivo, por un **relay** de Cloudflare (`duel-relay/`, ver `docs/duelo-relay.md`): uno crea el duelo, manda el enlace (o el código de 8 letras y números) y el otro lo pega. **Sólo se ofrece donde está la variable `VITE_DUEL_RELAY_URL`** (`wss://…workers.dev`); se lee al compilar, así que cargarla en Vercel exige volver a desplegar.

- **Antes de la mesa:** cada uno ve si el otro ya está listo; con los dos listos definen con una moneda, un dado o piedra-papel-tijera (animados en las dos pantallas) quién elige ir primero o segundo, y cada uno recibe su mano solo. En una revancha elige quien perdió.
- **Mesa:** la de la práctica con el campo del rival espejado arriba, las dos Extra Monster Zone compartidas en el medio y las fases entre las zonas, pensada para el celular y la mano derecha (lo del rival arriba; tus vidas y los botones abajo, al alcance del pulgar). Las fases son una sola para los dos y sólo las toca quien tiene el turno: el turno pasa al tocar la Draw Phase después de la End Phase, que todavía se juega. El reloj de 50 minutos arranca solo y no se reinicia a mano. La mano del rival se ve de dorso; el rival no ve tu mano, tu deck ni lo boca abajo.
- **Jugadas del duelo:** Atacar y Ataque directo en la Battle Phase (la espada y el rayo cruzan el tablero), contadores y fichas desde el botón +, puntos de vida con el teclado de la calculadora, chat con mensajes rápidos, y el panel de juegos (moneda, dado, piedra-papel-tijera y rendirse). Pierde quien se queda sin puntos de vida o se rinde, y el cartel del resultado trae la revancha.
- **Espectadores:** hasta dos personas pueden mirar con un enlace aparte; ven las dos mesas, las vidas, el turno y el chat, y no pueden hacer nada (lo impone el relay).
- **Reconexión:** se reconecta sola (en el celular, al volver a la pantalla); quien recarga la página, o sale del duelo y vuelve a entrar, sigue con su mesa, sus vidas y el reloj (se guardan en el navegador); mientras falta uno de los dos el duelo está en pausa (un cartel tapa la mesa y el reloj se detiene) hasta que vuelve.
- **Es para jugar con amigos**, no contra quien mire el tráfico: no hay cuentas ni reglas automáticas, y el relay no guarda nada.

Cómo está armado, el protocolo, cómo probarlo con tres pestañas y qué se descartó: `docs/duelo.md`.

Seguridad (qué se protege, los controles que hay y lo que sólo puede hacer quien administra las cuentas): `docs/seguridad.md`.

## Calculadora de LP (celular)

La calculadora de puntos de vida se abre desde el menú (herramientas) encima de cualquier pantalla (en escritorio, en un panel del tamaño de un celular). Mientras corre el reloj de la ronda y la calculadora está cerrada, aparece un botón flotante con lo que queda de la ronda (se arrastra a donde moleste menos) que vuelve a ella con un toque: en pleno duelo se cierra para leer una carta o mirar la mesa. Sin el reloj corriendo no hay botón. Tiene la estructura de la de Neuron, pero más rápida: los dos LP lado a lado (se toca uno para elegir a quién va la operación), reiniciar y deshacer en el medio, el display de la operación, tres atajos con los últimos cambios para repetirlos con un toque, y el teclado de Neuron (Borrar, +, −, ÷2, dígitos, 00 y 000) con "=". Con menos de tres dígitos lo tecleado se entiende en centenas ("8" es 800). Las subas se ven en verde y las bajas en rojo. El reloj de la ronda cuenta 50 minutos para atrás, avisa a los 10 y a los 5 minutos, suena y vibra al llegar a cero y lo repite hasta que se reinicia el reloj (los tres avisos se pueden probar desde "Moneda, dado y avisos") y, mientras corre, se ve en el botón flotante cuando la calculadora está cerrada; se reinicia aparte del duelo, porque el match sigue entre juego y juego. Moneda (la King of Games, con sus dos caras) y dado dorado de seis caras animados; las imágenes viven en `public/cosmetics/` para sumar más cosméticos. El duelo se guarda en el dispositivo (sobrevive a cerrar la app) y la pantalla no se apaga mientras la calculadora está abierta.

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
    mat-public.ts, duel-*.ts, use-duel.ts  el duelo con un amigo: la mesa pública (ids opacos), el protocolo, la sesión, el espectador, el transporte, los juegos y el deck pegado; ver docs/duelo.md
    saved-combos.ts          combos guardados en localStorage
    shell-layout.ts          el menú lateral (ancho, contraído o no) y cuánto espacio deja libre a lo flotante
    meta.ts                  los tier lists (hand traps y boardbreakers) y los decks de torneo: informes, tiers, tendencia y links
    replays.ts               replays de torneo (YouTube) y su cruce con los decks de torneo
    live-streams.ts, use-live-streams.ts  las transmisiones en vivo de los canales oficiales: lectura de la página del canal (pura), validación y el hook que las mira cada minuto
    card-prices.ts           precios de TCGplayer por carta y por expansión (los archivos de public/prices)
    banlists.ts              las banlists históricas (TCG y OCG): listas, cambios entre una y la anterior y fechas
    use-*.ts                 hooks reutilizables
  components/
    deck-mode/               pantalla principal: los pasos del deck y los destinos del menú
    DeckZone.tsx             zonas Main / Extra / Side
    SearchPanel.tsx          búsqueda
    DeckRolesPanel.tsx       clasificación por carta
    ProbabilityPanel.tsx     Probability Lab
    probability/             editor de reglas, práctica y mesa (PracticeMat)
    duel/                    el duelo con un amigo: lobby, sala, mesa con el campo del rival, barra, chat, juegos y la pantalla del espectador
    meta/                    tier lists, decks de torneo y sus detalles (carta, deck del tier list, deck completo)
    replays/                 pestaña Replays y su reproductor
    expansions/              la vista de expansiones: lista, cartas con rareza y precio, y su detalle
    banlists/                la vista de banlists históricas: lista a elegir, cambios o lista completa, y el detalle de una carta
    comparison/              pantalla de comparación
    card-detail/             detalle de carta
    ui/                      botones, títulos (`Heading`) y piezas básicas
    shell/                   el armazón de la app: menú lateral, barra y cajón del celular, pie
    playground/              el catálogo vivo `/playground` de todos los componentes y assets; ver docs/playground.md
  ygoprodeck/                cliente y parser de la API
  i18n/                      los textos en español e inglés: `t()`, el idioma y un diccionario por área (`es/`, `en/`); ver docs/i18n.md
  __tests__/                 tests (Vitest + fast-check)
duel-relay/                  el relay del duelo (Worker + Durable Object de Cloudflare): dos jugadores y hasta dos espectadores; ver docs/duelo-relay.md
api/
  live.ts                    función de Vercel: qué transmisiones en vivo hay en los canales oficiales de YouTube (la usa la pestaña Replays; en desarrollo la atiende Vite con el mismo código)
  card-image.ts              función de Vercel: sirve las imágenes de las cartas desde nuestra caché (YGOPRODeck pide no enlazarlas directo); vercel.json le reescribe /api/card-image/<carpeta>/<archivo>.jpg; con `?w=128|320|512` devuelve la miniatura en WebP
public/                      íconos, manifiesto, imagen para compartir, robots.txt, sitemap.xml, 404.html, privacidad.html y privacy.html (estáticos)
```

## Sitio publicado

- **Vista previa al compartir el link** (Discord, WhatsApp, X): las etiquetas Open Graph van en `index.html` y la imagen es `public/og-image.jpg` (1200 × 630). Los bots no ejecutan JS, por eso no pueden salir de la app.
- **Buscadores y navegadores:** `robots.txt`, `sitemap.xml`, `favicon.ico` (16, 32, 48 y 64 px), los íconos de 192 y 512 px y `site.webmanifest` (para agregar la app a la pantalla de inicio).
- **404 y privacidad:** Vercel sirve `404.html` en cualquier ruta que no existe. `privacidad.html` (y `privacy.html`, la misma página en inglés: el ícono "i" junto a las redes abre la del idioma elegido) explica qué se guarda en el navegador y con quién se comunica el sitio, y trae el aviso legal; la 404 está en los dos idiomas. Dice que el sitio no tiene analíticas ni cookies: si se suman, hay que actualizarla.
- **Imágenes de las cartas:** YGOPRODeck pide no enlazar sus imágenes directamente (bloquea la IP del que lo hace). Todas las URLs de `images.ygoprodeck.com` se dibujan por `/api/card-image/<carpeta>/<archivo>.jpg` (`cardImageSrc`): en producción es la función de Vercel `api/card-image.ts` (un `rewrite` de `vercel.json` le manda la ruta en `?path=`; Vercel ya no documenta rutas dinámicas en `api/`), que se la pide a YGOPRODeck una vez y la deja un año en la caché del CDN y del navegador (las miniaturas piden `?w=128`, `320` o `512` y la función las achica a WebP con `sharp`; si no puede, sale la original por cinco minutos de caché); en desarrollo y en `preview`, Vite hace de proxy a la misma ruta. Si la función falla, `CardArt` prueba una vez con la URL original. Como las imágenes son del mismo origen, la imagen del deck en Exportar ya no pasa por images.weserv.nl.
- **Idiomas:** `index.html` queda en español para los buscadores y los links compartidos (con `og:locale:alternate` para el inglés); en el navegador, `syncSiteMeta()` pasa la descripción al idioma elegido. El idioma se guarda en `ygo-lab:locale`; el worker del Lab lo recibe como nombre porque no ve el almacenamiento.
- **La URL pública** (`https://yu-gi-oh-probability-lab.vercel.app`) está escrita en `index.html`, `robots.txt` y `sitemap.xml`. Si cambia el dominio, se cambia en los tres; el test `site-meta` avisa si dejan de coincidir o si falta algún archivo que enlazan.
- **Caché del navegador:** `vercel.json` deja `/assets/*` (todo con hash en el nombre) un año como `immutable`; `/mascot` y `/cosmetics`, un día con `stale-while-revalidate` (se reemplazan en el lugar, por eso nunca `immutable`); el resto (el HTML, `/prices`, el manifiesto) sigue revalidándose. Nunca se pone en `public/assets/` un archivo sin hash. `npm run preview` no aplica esos `Cache-Control` (`readVercelHeaders` de `vite.config.ts` los descarta, si no serviría hasta el index.html como cacheable). `index.html` precarga los tres pesos de Lexend Deca (`<link rel="preload" as="font" crossorigin>` a la ruta de `src/fonts/`, que Vite reescribe al archivo con hash).

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
npm run sync:prices  # baja los precios de TCGplayer a public/prices, indexados por carta y por expansión (el mismo workflow, también cada día)
npm run sync:banlists # baja las banlists históricas del TCG y del OCG a src/data/banlists.json (el mismo workflow, también cada día)
npm run sync:replays # baja los replays de torneo de los canales de YouTube a src/data/replays.json (el workflow sync-replays lo hace solo cada día)
```

El CI (`.github/workflows/ci.yml`) corre `typecheck`, `lint`, `test` y `build` en cada PR y push a `main`.

## Requisitos

- Node.js `>=22.12.0` (ver `.nvmrc`) + npm.

## Limitaciones actuales

- No hay importación desde imagen (por decisión de UX).
- El cálculo es exacto solo para la mano inicial (no simula robos posteriores).
- La mesa de práctica y el duelo con un amigo son manuales (no aplican reglas ni hay un rival automático); no hay simulación automática de líneas o interrupciones.

## Próximos pasos sugeridos

1. Presets de pruebas contra handtraps comunes.
2. Editor todavía más guiado para aperturas/problemas.
3. Métricas avanzadas de “juega sobre X”.

## Licencia

© 2026 Gastón Valles. Todos los derechos reservados (ver `LICENSE`). Yu-Gi-Oh!, los nombres y las imágenes de las cartas son marcas y obras de Konami; este proyecto no es oficial ni está afiliado. Los datos de cartas provienen de YGOPRODeck.

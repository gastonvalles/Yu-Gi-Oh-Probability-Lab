# Motor de cartas: por capas

Los duelos automáticos son un proyecto enorme: por eso van en capas, de a poco y sólo con lo que se sabe que funciona.

**Regla de oro: cada capa sólo afirma lo que se pudo comprobar.** Ante la duda, una capa no dice nada: un texto raro pierde el color, nunca gana uno equivocado. Cada capa trae sus pruebas y se mide contra el catálogo entero antes de pasar a la siguiente.

| Capa | Qué hace | Estado |
| --- | --- | --- |
| 0 · Resaltar | Colorea el texto de la carta: condición, efecto rápido, costo, objetivo y límite. No decide nada del juego. | Hecha |
| 1 · Hechos confirmados | Lo que el script de EDOPro **y** el texto de la carta dicen los dos de sus efectos (de la carta entera). | Hecha |
| 1b · Alinear frase y efecto | Qué frase del texto es qué efecto del script y, de cada efecto, sus hechos y desde dónde se activa. | Hecha |
| 2 · Asistente de la mesa | La mesa avisa, no decide: rasgos, usos, reglas de turno y qué cartas pueden responder. | Hecha en lo que se puede afirmar |
| 3 · Automatización parcial | Un motor propio de efectos simples. | Descartada: cubriría el 8 % de las cartas del meta y ninguna cadena |
| 4 · Núcleo de reglas | `ocgcore` (el motor de EDOPro) en WebAssembly corre los duelos de verdad con los scripts de Project Ignis. | Beta (`?auto=1`): «Jugar solo automático» contra un rival pasivo, con el núcleo en un Worker; faltan cerrar el espejo del rival, deshacer, combos y handtraps, el duelo por enlace y los datos en producción |

## Capa 0 · Resaltar el texto

Vive en `src/app/card-text.ts` (`segmentCardText`, puro; sus garantías están en su comentario y las prueba `card-text.test.ts`) y la pinta `CardEffectText`. El texto nunca cambia: se agregan sólo `<span>` con `data-tone`, así un lector de pantalla lo lee igual y copiar y pegar da el original.

- **Lo que no marca, a propósito:** los efectos continuos sin dos puntos, el costo de un efecto sin `;`, una condición que no abre con las palabras de la plantilla, «Once per turn, you can …» sin dos puntos, los textos de invocación, las reglas de los materiales y todo texto que no esté en inglés. Marcar uno de esos pide una regla con su prueba y volver a medir el catálogo.
- **Para medirla:** bajar `https://db.ygoprodeck.com/api/v7/cardinfo.php` sin parámetros (con `misc=no` da 400) y pasar `segmentCardText` por cada `desc` comprobando las garantías.

## Capa 1 · Hechos confirmados por dos fuentes

El script de EDOPro dice lo que el motor hace de verdad y el texto, lo que la carta imprime. Un hecho que afirma una sola fuente puede ser una forma de escribir distinta (las cartas viejas no llevan «(Quick Effect)») o un detalle interno del motor, así que se publica sólo la intersección (`card-effect-facts.ts`). Un bit apagado no dice nada, y una carta sin script o sin hechos confirmados no está en el JSON.

- **Se genera a mano**, cuando salen cartas, con `npm run sync:effects` (`scripts/build-card-effects.mjs`: baja el texto de YGOPRODeck, actualiza el clon de los scripts y escribe `src/data/card-effects.json` y `card-effect-map.json`). Ningún workflow programado lo corre. La app lo lee con `card-effect-data.ts`.
- **No se confirma** lo que el script pone con una bandera y no con `SetCountLimit` (por ejemplo, «You can only Special Summon "X" once per turn»), ni la velocidad de las cartas viejas sin «(Quick Effect)».
- La activación de una Mágica o una Trampa (`EFFECT_TYPE_ACTIVATE`) no es una frase que se pueda emparejar: queda afuera de la alineación, pero cuenta para los límites compartidos.

## Capa 1b · Alinear cada frase del texto con su efecto del script

`card-effect-map.ts` (con `effectSentences` de `card-text.ts`) empareja las frases que son efectos con los efectos del script que se activan (sus clones, juntos) usando cinco señales: la clase, el costo, el objetivo, el «Once per turn:» de apertura y el lugar desde donde se activa. Todo lo que dice la frase tiene que estar en el efecto, no al revés.

- **Sólo con certeza:** el mismo número de frases que de efectos, una forma de armar los pares sin contradicciones y todas las demás con al menos 2 contradicciones más (`MARGEN`). Una alineación que se sostiene por una sola señal cambiaría si esa señal estuviera mal leída, así que no se publica.
- **Los lugares, con dos fuentes:** la mano y el Cementerio, con el `SetRange` y la frase; el campo y la zona de Mágicas y Trampas, con el `SetRange` y que la frase no nombre otro lugar; la Zona de Péndulo, con el `SetRange` y que la frase esté en la parte «Pendulum Effect». Un «this card» que es el objeto de la acción («with a Level lower than this card from your hand») no es un lugar.
- Entran las cartas de varios efectos y las de uno solo si es rápido. `getCardEffectMap` no dice nada si las frases ya no empiezan donde estaban al generar (el texto cambió y el orden no sería de fiar).

## Capa 2 · Asistente de la mesa

**Avisa, no decide:** nunca frena, deshace ni mueve una jugada; sólo dice algo que es verdad y que quien juega puede haber olvidado. Cuenta sólo lo que se vio hacer en esa pantalla: si se recarga o se deshace, el uso deja de contar, y el aviso se queda corto, nunca de más. El turno es el del duelo entero (`duelTurnNumber`).

- **Sin cartel por activar otra vez una carta:** sin manejo de cadenas, repetir una activación es la forma de preguntarle al rival si quiere responder, y los hechos de la capa 1 son de la carta entera, no de cada efecto. Qué efecto ya se usó lo dice el menú, en voz baja.
- **Contador por efecto** (`mat-assistant.ts`): «Activar efecto» de una carta con varios pregunta cuál, con la frase textual (no se resume: la precisión es de la frase). La lista alineada con el script tiene todos los efectos y no lleva «Otro efecto»; la leída sólo del texto puede no tenerlos y termina con «Otro efecto». El número viaja con la jugada (entero de 0 a 9; un cliente de antes lo ignora) y vale para los dos jugadores porque las dos listas ponen cada efecto en el mismo lugar.
- **Reglas de turno** (`turn-rules.ts`): una segunda Invocación Normal o de Péndulo en el turno avisa y no frena, porque un efecto puede permitirla.
- **Límites compartidos:** se comparten sólo si el script usa el mismo código en los efectos **y** el texto lo dice.
- **Lo que no hace:** no lleva la cadena (qué responde a qué ni cuándo se resuelve), no sabe si se puede cumplir lo que pide una carta (un objetivo, un costo: por eso «podés responder con…» dice «podés», `mat-responders.ts`) y no avisa de fases, daños ni costos, que no se pueden decir sin decidir. Una Mágica o Trampa con varios efectos que no se pudo alinear se cuenta por carta (su activación), no por efecto.

## Capa 4 · El núcleo real de reglas (la capa 3 se descartó)

Un motor propio sólo alcanzaría a los efectos sin elección, objetivo ni costo: el 8 % de las 1.449 cartas que juegan los decks del meta, y ninguna cadena (el 92 % restante elige, apunta o paga). Para automatizar de verdad se corre `ocgcore` con los scripts de Project Ignis (`ocgcore-wasm`, versión exacta en `package.json`). **El campo de la mesa no cambia:** el núcleo manda y la mesa es una proyección de lo que cuenta.

- **Frontera:** la app sólo habla JSON con el anfitrión del núcleo (`src/app/auto/protocol.ts`: sin `bigint`; el mismo esquema da el tipo y valida lo que llega). `core-host.ts` corre igual en un Worker o en un servidor; `referee.ts` filtra por asiento lo que cada jugador puede ver (una regla, `knows`, y una tabla que no compila si falta un mensaje); `policies.ts` trae el rival pasivo y el bot al azar legal.
- **La mesa** (`adapter.ts`): lo que el árbitro deja ver a un asiento se vuelve las `MatAction` de siempre para su mesa (ids reales) y `WireAct` para el espejo del rival (ids opacos y `reveal` sólo de lo que quedó a la vista); lo que `MatState` no tiene (ATK/DEF de ahora, cadena, vidas, turno y fase del núcleo, equipos) va en `overlay`. Después de barajar nadie sabe el orden del deck, ni su dueño: robar dice qué carta salió (`draw` con `ids`). La mesa no puede mostrar un `swap` de casillas ocupadas, un Xyz con materiales mientras sigue en el Extra ni una carta que cambia de código en su lugar; y el espejo del rival no olvida qué carta era una de una pila barajada (`Mirror.known`): se dibuja con `codeOf`. En el fuzz, la mesa propia y el overlay coinciden con el núcleo; el espejo del rival tiene diferencias sin cerrar (`it.fails` en `auto-adapter.slow.test.ts`).
- **Lo que el núcleo no hace** y se resuelve acá: no baraja el deck inicial (lo baraja `deckOrder` con la semilla; la mano fija son las primeras cartas), empieza siempre el jugador 0 (el deck que va primero), `MSG_WIN` no corta el duelo (el fin es el primer `win`) y una carta sin script no da error: `mapDeck` la detecta antes y el modo automático no arranca con ella (ante la duda no se automatiza).
- **El paquete** (0.1.6) necesita dos arreglos (`send`, por `SORT_CARD`; `freeDuel`, por la fuga de `destroyDuel`) y baja el wasm en base64 si no se le pasa `wasmBinary` o `locateFile` (+344 KB, +3,5 s): `createAutoHost` lo exige.
- **Determinismo:** semilla + respuestas = el duelo entero; deshacer re-simula en una instancia nueva (`rewind`). Entre dos instancias el núcleo no ordena igual las pistas seguidas: `canonical` las ordena.
- **A veces tarda:** armar los materiales de una Sincronía llegó a 43 s en un escritorio. El núcleo va en un Worker, con un «pensando…» y un cancelar que termina el Worker y re-simula.
- **Licencia:** la app es AGPL-3.0-or-later, como el núcleo y los scripts (el paquete se declara MIT, pero su `.wasm` lleva el núcleo): el repo es público y la app ofrece el código desde su menú (`NOTICE.md`; `licencia.test.tsx` lo vigila). `cards.cdb` no tiene licencia: no se sube al repo. Hasta que salga la pantalla, nada de producción importa `ocgcore-wasm` ni `src/app/auto/` (`auto-isolation.test.ts`, `NOT_AT_STARTUP`).
- **La pantalla (beta):** «Jugar solo automático» (`?auto=1`, `ygo-lab:auto-flag`) compone la mesa de siempre con la composición del duelo (`DuelMatLink.auto`) y **nunca despacha una jugada**: las cuenta el núcleo (`auto-session.ts`) y la mesa las reproduce de a una (`AutoSoloScreen`); sólo contesta preguntas (`ask-ui.ts`, puro) con los menús, las casillas y el brillo de la mesa o con las piezas de afuera (`AskPrompt`, `AskOptions`, `CardPicker`, `SortSheet`). El rival es pasivo (40 Normales de relleno). Su único `import()` está en `DeckModeScreen.tsx`.
- **Preguntas del núcleo:** una cadena sólo se pregunta si algo responde de verdad (`spe_count ≠ 0`) o es forzada, como EDOPro sin «Always chain»; la forzada se avisa en la línea («Tenés que activar X: tocala»). El fin dice por qué con el código de `MSG_WIN` (1 vidas, 2 sin robar, ≥ 0x10 scripts). El rótulo de un efecto es `str(desc & 15)` de la carta `desc >> 4` (< 10000 es del sistema y no viaja). Lo elegible lo cuenta `ask-ui`, no la hoja.
- **Datos y pruebas:** `auto-data.lock.json` fija el commit de `cards.cdb` (BabelCDB) y el de los scripts (CardScripts). `npm run sync:core` baja esas versiones a carpetas fuera del repo (`-- --update-lock` sube el lock: después se prueba la beta y se commitea). `npm run test:auto` corre el fuzz —dos bots al azar sobre los decks del meta: 0 `RETRY`, 0 mensajes sin manejar, 0 fugas de lo oculto, `rewind` igual— y no entra en `npm test`.
- **Datos en producción:** `api/auto-data.ts` sirve `/auto-data/*` (rewrite en `vercel.json`) con lo que arma `scripts/build-auto-data.mjs` en el build de Vercel (filas, manifiesto y scripts, en `.auto-data/`, ignorada: el `.cdb` no tiene licencia); al jugar no se le pide nada a GitHub. Si el build no puede armarlos, el sitio se despliega igual y la beta dice «no disponible» (503; `AUTO_DATA_STRICT=1` rompe el build). Local: `AUTO_DATA_BUILD=1 node scripts/build-auto-data.mjs` y `VITE_AUTO_DATA_URL=/api/auto-data npm run dev` (en PowerShell: Git Bash reescribe `/api/…`).

Ver también el apéndice (el filtro Efecto del buscador) y `docs/duelo.md` (la mesa).

## Apéndice · Cómo se midió y cómo repetirlo

El filtro **Efecto** del buscador no es una capa: lee el texto en inglés con una expresión por categoría (`src/app/card-effects.ts`; `effectMaskOf` arma la máscara que el índice del catálogo guarda por carta).

**Cómo se mide.** En cada una de las 14 categorías: tres estratos (lo que marca, lo que no marca pero huele a la categoría y el resto), cada uno con una muestra de semilla fija, etiquetada a mano y a ciegas por alguien que no ve el motor ni los estratos; precisión y cobertura se estiman por estratos. Una ronda corrige y otra, con otras cartas, es la reserva: el motor se congela antes de ver sus etiquetas. Las muestras no están en el repo: dependen del catálogo del día.

**El criterio de las etiquetas:** aplica si la carta **hace** eso (efecto, costo o una mitad de Péndulo), no si es condición, disparador, restricción o prohibición. Buscar es del Deck a la mano y «A la mano», devolver; las destrucciones incluyen «destroy 1 card on the field», no la propia; Fichas incluye usarlas; Dañar LP no cuenta la batalla.

**Lo que justifica las decisiones:** en la reserva (20 cartas por categoría, ±10 a 15 puntos) casi todas las categorías marcaron bien 19 o 20 de 20 y cubrieron el 80 % o más; ningún arreglo posterior se volvió a medir con cartas nuevas, así que esos números son una cota optimista. Siguen fallando los contraataques (negar y destruir), las referencias entre oraciones y las Fichas: por eso el filtro avisa que se guía por el texto en inglés y deja al lado la búsqueda en el texto libre. La máscara de todo el catálogo cuesta unos 100 ms, una vez, al armar el índice (`EFFECT_GATE`, con un test que cuida que no cambie resultados).

**Para repetirla:** los estratos van en un archivo que quien etiqueta no lee, y ni las muestras ni los scripts de medición están en el repo: hay que rehacerlos. Cada arreglo tiene su caso en `src/__tests__/card-effects.test.ts`; una categoría nueva pide otra muestra y otro bit de la máscara (`EFFECT_KEYS`: caben 16).

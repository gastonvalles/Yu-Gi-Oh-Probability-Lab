# Duelo con un amigo

Dos personas juegan la mesa de práctica una contra la otra, cada una en su dispositivo, entrando con un enlace: sin cuentas, sin base de datos y sin reglas automáticas. Sólo se ofrece donde la app sabe a qué relay conectarse (`VITE_DUEL_RELAY_URL`; el relay, en `docs/duelo-relay.md`). Hasta dos personas más pueden mirar. Es para jugar con amigos, no contra quien mire el tráfico de red.

## Lobby y salas

- **El deck es siempre el del builder:** todo lo que nombra el mazo en Jugar lleva ahí (`openBuilderFromPlay`; el builder ofrece «Volver a Jugar»), así las cartas se tocan en un solo lugar. El builder importa `ydke://` y `.ydk`, para jugar desde un celular sin deck armado.
- «Jugar ahora» hace lo que dice mientras busca sala (`pickRoom` en `duel-prefs.ts`): no hay esperas de mentira.
- «Estoy listo» revisa el deck con las reglas del builder (`deckFormatIssues`) y pide 40 cartas en el Main: es una revisión de cada lado, no una garantía (el rival nunca ve el deck).
- **«Duelo automático (beta)»** (con deck armado) decide qué mesa abre «Entrenar solo» y el «Jugar solo» de las reglas, y si la sala con un amigo tiene reglas automáticas (privada, un solo duelo, sin reloj ni espectadores: `docs/duelo-automatico-enlace.md`). La hoja de reglas lo repite; «Jugar ahora» es siempre manual. Ya empezado, sólo pasa a manual si lo aceptan los dos.
- Dónde vive: `PlayHome` (Jugar) y `DuelScreen.tsx`.

## La sala

Quien llega por un enlace no pasa por el lobby: escribe su nombre en la sala y elige su deck en el builder, que vuelve a la sala.

## La mesa del duelo

La de la práctica, con el campo del rival espejado arriba y las Extra Monster Zones compartidas en el medio.

- **Cada uno es dueño de lo suyo:** cada jugador mueve sólo sus cartas, sus vidas y su reloj de turnos. Lo que le pasa a una carta del rival lo hace él en su mesa: se le pide con el chat, con Target o con Señalar. Deshacer vuelve la última jugada de la mesa, sea de quien sea: con el rival presente se le pide permiso, y si la jugada es suya la deshace él. Cambiar el control de una carta son dos jugadas, una en cada mesa, que se completan solas (`mat-control.ts`) y no se deshacen: la otra mesa ya las completó. Quien llega a cero en el reloj de turnos se rinde desde su propio dispositivo: un cliente modificado podría no hacerlo y no hay servidor que lo corte.
- **La mesa no valida:** el que juega manda (los materiales son opcionales y la Invocación de Péndulo no mira el rango) y el asistente avisa, no decide (`docs/motor-de-cartas.md`, capa 2).
- **La mesa no se mueve:** nada de lo que aparece (avisos, pregunta de fase, tira del resultado, línea de jugadas) suma alto, y las manos nunca tapan el campo. El alto de las manos sale del presupuesto de la casilla (`classicCell` en `duel-rails.ts`): con poca altura la casilla toca su mínimo y la columna se desplaza.
- **Con laterales (escritorio ancho)** el campo 3D se agranda casi hasta todo el ancho y se mete en los costados: la mesa mide cuánto (`--field-overhang`) y lo que va en un lateral (los avisos debajo de las vidas, lo que falta elegir abajo) se corre de eso, hasta dejarle 11 rem, y va por encima (`z-20`). Su caja no ataja toques (`pointer-events-none *:pointer-events-auto`), sólo sus avisos: aun vacía, tapaba el Extra Deck. Trampa: la mesa con `transform` crea su propio contexto y pinta sobre lo anterior del DOM sin `z-index`.
- **Pasar de fase le pregunta al rival** si va a hacer algo antes. Sin respuesta pasa sola (`PHASE_WAIT_MS`): callar es no tener nada que jugar, y un rival ausente no frena el duelo. Va al medio (`PassPrompt` y la cadena del automático) sin tapar lo que brilla (`promptTop`). Lo que puede responder brilla en celeste (`can`), como en el automático; Deshacer y las demás urgencias van de a una, sobre la línea del registro (`LaneNotice`).
- **Menús:** en escritorio, pegados a lo que se toca (`CardMenu`), en bloques centrados: apoyo (Revelar, Target), envíos (Al deck, A la mano, Al cementerio, Desterrar) y jugadas, con la principal abajo (`mat-menu-order.ts`; el motor no cambia de orden). Una pregunta de «cómo» (posición, boca arriba o abajo, dónde del deck) es una fila con › que abre un submenú al costado; una fila sin › actúa o pregunta ahí mismo. Atacar, elegir un efecto o un material siguen con su segundo paso en el mismo menú. Una sola jugada directa y sin «Ver carta» es una etiqueta (`PlayTag`): otro toque la hace. En el celular, siempre la hoja de abajo (`CardSheet`), con una flecha para volver del segundo paso. Los rótulos son los de `practice.menu.*`, sin renombrar ni traducir distinto.

### El campo en un celular en vertical

- Bajo 640 px hay cinco columnas y las pilas van en una fila aparte, con el Extra y el Deck en los extremos (`DUEL_AREAS_COMPACT`). Las áreas van por variables CSS (`--areas`, `--areas-compact`), porque un estilo en línea no cambia con un medio; el arrastre, los menús y el protocolo no se enteran.
- Sin barra de abajo: hasta 1100 px las vidas van en el marcador de arriba (`LifeScore`, tocables: abren la calculadora), el chat y deshacer en la barra y las reacciones en la hoja del chat; en escritorio, cada vida en su esquina. El botón de fase muestra sólo su sigla.
- La casilla es cuadrada para que una carta en defensa no pise a la vecina, y la limita el alto de la pantalla (`compactDuelFieldStyle` bajo 640 px y `mediumDuelFieldStyle` de 640 a 1100 px, sin fila de abajo: el campo y tu mano entran sin scroll desde unos 700 px de alto): agrandar más las cartas pediría desplazar o acercar el campo.
- En el celular, las salidas y problemas de la mano de apertura son una píldora en la barra de arriba (`RulesPill`) que se abre al tocarla; nunca flotan sobre el campo ni la mano, ni se abren solas. En escritorio van en el panel lateral.

### El visor de una pila no tapa tu mano ni el detalle

Ningún menú de la mesa oscurece el fondo (`veil={false}`). `PileViewer` no es un modal: con él abierto el campo sigue vivo y no se mueve ni cambia de tamaño.

- En escritorio es una ventana (hasta 56 rem, centrada en el campo y fuera de los laterales) apoyada en el borde de abajo de la fila de las Zonas Extra: crece hacia arriba hasta la barra (la pisa si no entran dos renglones) y no llega a tu mano ni a tus zonas; sin el campo del rival, baja sobre tus zonas lo que falte. Tocar o apuntar una carta del visor la muestra en el detalle (una del rival boca abajo, sólo como tal). Tapa el campo del rival y las fases, y se esconde mientras se elige en el campo. Bajo 1101 px es la hoja de abajo (hasta 55 dvh), que se cierra al tocar afuera.
- La caja que lo aloja es `absolute` (la mide `--strip-*`) y no ataja toques, sólo el panel.
- Con el visor abierto lo cierra sólo jugar una carta suya; tocar otra pila cambia lo que muestra (dejar el Main lo baraja una vez; en el automático no baraja ni despacha) y abrir el del rival cierra el tuyo. En el automático, para mirar y elegir lo que pide el núcleo: el Main va por nombre, también en una lista de varios lugares (`listOrder`: su orden en la mesa es inventado, el del núcleo es el real y «tope primero» regalaría las próximas cartas). El foco entra al panel y vuelve a la pila que lo abrió, sin trampa.

### Elegir varias cartas de una pila

El visor de pilas elige varias (`PileViewer` con `many`) y `listBatchActions` (`practice-mat.ts`) ofrece sólo lo que admiten todas.

- Es **una** jugada `batch`, no N sueltas: N despachos en el mismo toque hacen saltar el cursor, pierden efectos y sonido, y serían N pasos, N Deshacer y, en el duelo, N pedidos al rival (el relay deja pasar 30 mensajes por segundo). Nunca dos despachos en el mismo toque.
- Invocar, activar y colocar van de a una: cada una pide zona y posición. Target no se ofrece en el Main ni en el Extra: en el juego no se apunta al deck.
- «Al azar» conserva su nombre (no «Barajar en el deck»), igual en el menú de una carta y en el de varias.
- Se descartaron una casilla por carta (los 44 px no entran en una carta de 66 px) y el toque largo.

## Chat, avisos y señales

- **Señalar no es Target:** Señalar dura un instante y no deja nada (no es una jugada: no entra en Deshacer, no se guarda y no se repone al reconectar). Target sobre lo del rival marca, vence solo y viaja con el conjunto de marcas (`marks`: repetirlo no cambia nada y reconectar lo repone); sobre lo tuyo es una jugada `target` más (entra en Deshacer y en los pasos).
- **Las señales (🤔, 👍) salen una cada 3 s** (`EMOTE_GAP_MS`), con el reloj de quien las manda y sin filtrarse al recibir: un cliente viejo que las mande seguido se ve igual.

## Siding

Usa las zonas y el arrastre del builder, pero es una pantalla propia del duelo (`DuelSiding`), y no tiene salida: termina con «Listo» o cuando se acaba el tiempo (`SIDING_MS`). Recargar vuelve al siding como estaba (`duel-save.ts`).

## Mirar un duelo (espectadores)

Quien mira lleva cada lado como lo lleva el rival (`duel-spectator.ts`): ve lo mismo que vería cada jugador y nada más. No puede mandar nada (lo impone el relay: `docs/duelo-relay.md`) y no muestra lo que sólo comunica (lo que se señala, lo que mira cada uno) ni suena.

## Reconexión y cierre de sala

- Mientras falta uno, el duelo queda en pausa: la mesa se tapa y el reloj de la ronda se detiene, así el tiempo afuera no cuenta.
- **Reconectar** (el ⋯ de la barra y el cartel de pausa; lo tocan los dos) tira la conexión y abre otra: el relay vuelve a decir quién está y destraba una pausa por un aviso que no llegó.
- **Límite:** el relay no reserva el asiento. Otra persona con el enlace puede ocupar el lugar de quien salió; sólo recupera su mesa quien tiene lo guardado en su navegador.
- **La sala muere al terminar el duelo** (uno suelto o un Match ganado): si el rival se va, a los 5 s (`ROOM_CLOSE_S`) la sala se cierra para todos (`duel.endRoom()`; el porqué, en `docs/duelo-relay.md`). Hasta entonces, otra identidad que la del rival que jugó no recibe nada (`stranger`), y quien ocupa su lugar no cuenta como presente hasta saludar (`peerGreeted`): un tercero no reinicia la cuenta. Un Match que sigue no cuenta como terminado. La sala pública del anfitrión no vuelve a la lista de espera (un tercero entraría a la mesa de quien se quedó: `rivalLeft`).

## Cómo está armado

```
src/app/mat-public.ts        ids opacos, qué ve el rival y el espejo
src/app/duel-protocol.ts     los mensajes y su validación
src/app/duel-session.ts      createDuel: las dos mesas, vidas, relojes, chat, deshacer y marcas
src/app/duel-socket.ts       el transporte por WebSocket
src/app/duel-spectator.ts    el duelo visto desde afuera
src/components/duel/         las pantallas (DuelScreen: lobby, sala y mesa)
duel-relay/                  el Worker + Durable Object de Cloudflare
```

La mesa sigue siendo `matReducer`, puro y determinista: **cada lado aplica las jugadas del otro a un espejo de su mesa** con el mismo reductor y las mismas semillas de mezcla (`shuffleWithSeed`: el orden del deck nunca viaja), y los dos quedan iguales. Por eso toda jugada nueva tiene que ser determinista y serializable a JSON: el fuzz de `mat-public.test.ts` pasa cada jugada por JSON y comprueba que el espejo quede igual y que no viaje ningún id real.

El tiempo real vive en Cloudflare porque las funciones de Vercel no mantienen WebSockets; no se usó WebRTC (PeerJS), que necesitaría un TURN para conectar celular↔PC. `createDuel` sólo conoce `DuelTransport` (`duel-session.ts`); los tests usan una sala en memoria (`memory-room.ts`).

La mesa del duelo es `PracticeMat` con la prop `duel` (`DuelMatLink`) y no sabe de red: la fase va por `duel.askPhase` y el resto por `duel.play`. Moneda, dado, Match y relojes: `duel-games.ts`, `duel-turn.ts` y `duel-clock.ts`; siding y formato: `duel-siding.ts` y `duel-format.ts`; el enlace: `duel-link.ts` y `use-duel.ts`.

### Mensajes (`duel-protocol.ts`)

El protocolo está en la versión 1 y **no se sube** para sumar algo, porque cortaría la sala con quien no recargó: un cliente viejo ignora los mensajes que no conoce, descarta la jugada que no reconoce y se repara con el `sync` que pide al notar que le falta una (sin la animación de esa jugada). Por eso una jugada nueva se publica **antes** que la pantalla que la manda.

### Qué ve el rival

Por la red las cartas viajan con ids opacos, y el rival sólo sabe qué carta es una cuando está a la vista o se la muestran (`mat-public.ts`). Robar es secreto; sumar a la mano una carta que no estaba en ella, no. Nada impide abrir las herramientas del navegador y mirar el tráfico.

### Reconexión

Safari en iOS suspende los WebSockets al bloquear la pantalla: el cliente reintenta solo y, al volver, pide un `sync`. Lo propio se guarda en el navegador por sala y rol (`duel-save.ts`): la mesa de arranque y las jugadas, porque el reductor es determinista y de ahí se arma todo; lo del rival lo repite él al volver a saludar. El marcador del Match se recupera del `sync` del rival (uno viejo no pisa a uno nuevo).

## Probarlo

Con tres pestañas (dos jugadores y un espectador):

1. Un relay local (`docs/duelo-relay.md`) o el publicado.
2. La app: `VITE_DUEL_RELAY_URL=ws://127.0.0.1:8788 npm run dev`. El relay publicado sólo acepta los orígenes de `duel-relay/wrangler.jsonc` (sirven `localhost:5173` y `127.0.0.1:5173`), y una sala pública armada contra él aparece en la arena de producción: probá en privada o cerrala.
3. Cada jugador, con un deck en el builder (cada puerto es un origen nuevo y no comparte lo guardado); el espectador entra con el enlace.

Editar un archivo del repo (también un `.md`) recarga las pestañas: el duelo se rearma de lo guardado, sin el registro.

Los tests de la pantalla (`src/__tests__/duel-screen-*.test.tsx`, con el arnés de `src/__tests__/support/`) juegan duelos enteros sobre una sala en memoria. `duel-relay.e2e.test.ts` juega contra un relay de verdad y sólo corre con `DUEL_RELAY_E2E_URL` (no en el CI); su variable propia evita que un `.env.local` con `VITE_DUEL_RELAY_URL` rompa un `npm test` común.

En **Windows**, `wrangler dev` levantado varias veces deja procesos `workerd` colgados y el relay deja de contestar («Conectando…»): apagalos y levantá uno solo, con otra carpeta en `--persist-to`.

## Qué se descartó a propósito

- El registro no es un replay: anota lo que cada uno hizo, con las palabras de un combo.
- No hay guardar el duelo como replay, ofertas de empate, revelar de forma persistente, chat libre de los espectadores, torneos ni cuentas, ni una sala «Solo» a la que se sume alguien: Jugar solo es la práctica, local y sin relay.
- No hay selector de deck ni deck pegado en Jugar, y los puntos de vida no se eligen: siempre 8000.
- No hay ✋ «Esperá»: las señales son 🤔 y 👍.
- Las vidas no llevan un anillo con la inicial: se probó y no va.

## Para no repetir un error

- Los problemas de layout no aparecen en jsdom: hay que medir con `getBoundingClientRect` en un navegador, a tamaño de celular (416 × 734) y de escritorio.
- En el celular, el click que llega después de un toque puede caer en lo que ese toque acaba de abrir: la hoja de la carta no atiende toques sus primeros 350 ms (`GHOST_CLICK_MS`) y, al invocar desde el Extra, ni confirmar los materiales ni ese click eligen la casilla (`pickZone`).
- Lo que se suelta con un toque afuera (el detalle fijo de la izquierda) se mira en la fase de captura: así un menú que frena el evento no lo deja pegado (`use-dock-peek.ts`).

# Duelo con un amigo

Dos personas juegan la mesa de práctica una contra la otra, cada una en su aparato, con un enlace: sin cuentas, sin base de datos y sin reglas automáticas (la sala automática es otra: `docs/duelo-automatico-enlace.md`). Sólo se ofrece con un relay conocido (`VITE_DUEL_RELAY_URL`; el relay, en `docs/duelo-relay.md`). Hasta dos más pueden mirar. Es para jugar con amigos, no contra quien mire la red.

## Lobby y sala

- **El deck es siempre el del builder:** todo lo que nombra el mazo en Jugar lleva ahí (`openBuilderFromPlay`; el builder ofrece «Volver a Jugar»), así las cartas se tocan en un lugar; importa `ydke://` y `.ydk` para jugar desde un celular sin deck armado. Por eso Jugar no tiene selector de deck.
- «Jugar ahora» hace lo que dice (`pickRoom`), sin esperas falsas. «Estoy listo» revisa el deck con las reglas del builder (`deckFormatIssues`, 40 cartas en el Main): es una revisión de cada lado, no una garantía (el rival no ve el deck).
- Quien llega por un enlace no pasa por el lobby: escribe su nombre en la sala y elige su deck en el builder, que vuelve a ella. El enlace no se dibuja (se copia o se comparte; lo vigila `link-rules.test.ts`) y la X pide confirmar.
- Dónde vive: `PlayHome` (Jugar) y `DuelScreen.tsx`.

## La mesa del duelo

La de la práctica (`PracticeMat` con la prop `duel`), con el campo del rival espejado arriba y las Extra Monster Zones compartidas en el medio. Barajar y repartir: `app/shuffle-fx.ts` y `app/deal-flight.ts` (muestra en `/playground`). Robar no baraja tu mano; sumar una carta a la mano del rival sí, para que no se adivine cuál es la nueva (`hiddenHand` de `matEffects`).

- **Cada uno es dueño de lo suyo:** cada jugador mueve sólo sus cartas, sus vidas y su reloj de turnos; lo que le pasa a una carta del rival lo hace él en su mesa, a pedido por el chat, Target o Señalar. Deshacer vuelve la última jugada de la mesa, sea de quien sea: con el rival presente se le pide permiso, y si la jugada es suya la deshace él. Cambiar el control de una carta son dos jugadas, una en cada mesa, que se completan solas (`mat-control.ts`) y no se deshacen; un Xyz pasa con sus materiales si los dos anunciaron `xyz-materials` (si no, van al cementerio de quien da), y una ficha se da si el otro anunció `token-control` (pone una suya; sin lugar, se pierde). Quien llega a cero en el reloj de turnos se rinde desde su propio dispositivo: un cliente modificado podría no hacerlo y no hay servidor que lo corte.
- **ATK/DEF al pie, nunca sobre el arte** (`StatTag`), en cada monstruo boca arriba; el Nivel/Rango/LINK va en la ficha y vuelve al elegir.
- **La mesa no valida:** el que juega manda (los materiales son opcionales) y el asistente avisa, no decide (`docs/motor-de-cartas.md`, capa 2).
- **Péndulo de varias:** elige de la mano y del Extra boca arriba en una hoja (`PendulumPicker`) y emite un `place` por carta (el protocolo no cambia). El rango (`app/pendulum-range.ts`) marca y avisa lo que no entra, no lo frena (un efecto puede cambiarlo); sin dato de escala es «sin rango», nunca un número inventado. Un Péndulo que va al Extra va boca arriba por cualquier ruta (`extraToward`).
- **La mesa no se mueve:** nada de lo que aparece (avisos, fase, resultado) suma alto y las manos no tapan el campo; el alto de las manos sale del presupuesto de la casilla (`classicCell` en `duel-rails.ts`).
- **Con laterales** (escritorio ancho) el campo 3D se mete en los costados (`--field-overhang`) y lo del lateral se corre de eso. Trampa: la caja del lateral, aun vacía, tapaba el Extra Deck: no ataja toques (sólo sus avisos); y la mesa con `transform` crea su contexto y pinta sobre lo anterior sin `z-index`.
- **Escritorio** (automático): dos paneles, el detalle a la izquierda (desde 1440 px) y los pasos o el chat a la derecha, sin pestañas ni línea bajo el campo; la casilla crece con el alto y el 3D se recorta por los bordes (Deck y Extra cortados).
- **Pasar de fase le pregunta al rival** si va a hacer algo antes. Sin respuesta pasa sola (`PHASE_WAIT_MS`): callar es no tener nada que jugar, y un rival ausente no frena el duelo. Va en el lugar de los carteles (`PassPrompt`); lo que puede responder brilla en celeste y las urgencias van de a una sobre la línea del registro.
- **Opciones** (automático): el ⚙ de abajo a la derecha (44 px; con ≡, los pasos) abre una hoja recta: vista 3D, «Menús flotantes» (`app/mat-menus.ts`), lo del duelo y «Rendirse»; flotantes vuelve ventana la pregunta abierta (dedo o mouse; lugar aparte en celular y escritorio). Su ⋯ no lleva la vista 3D; el manual, sin ⚙.
- **Menús:** en escritorio, pegados a lo que se toca (`CardMenu`), en bloques: apoyo (Revelar, Target), envíos (Al deck, A la mano, Al cementerio, Desterrar) y jugadas, con la principal abajo (`mat-menu-order.ts`; el motor no cambia de orden). Una pregunta de «cómo» (posición, boca arriba o abajo, dónde del deck) es una fila con › que abre un submenú; sin ›, actúa ahí mismo. Una sola jugada directa y sin «Ver carta» es una etiqueta (`PlayTag`): otro toque la hace. En el celular, siempre la hoja de abajo (`CardSheet`).

### En un celular

- El campo de siete columnas, con geometría fija bajo 640 px (`phoneDuelLayout`): sale del tamaño de la pantalla y nada lo mueve. Filas con forma de carta (bajan hasta cuadradas si no entra) entre las dos manos, sin línea en el medio (los avisos flotan sobre tu mano); la del rival, tu mano espejada a 0,8. La fase, en `p2` en todos los anchos.
- Hasta 1100 px no hay barra de abajo: las vidas van en el marcador de arriba (`LifeScore`), y las salidas y problemas de la mano de apertura, en una píldora (`RulesPill`) que nunca flota sobre el campo ni se abre sola.

### Visor de pilas

- **No tapa el campo ni el detalle:** ningún menú de la mesa oscurece el fondo y `PileViewer` no es un modal; con él abierto el campo sigue vivo y no se mueve.
- Lo cierra sólo jugar una carta suya; tocar otra pila cambia lo que muestra y cerrar el Main lo baraja una vez.
- **Elegir varias** (`many`, `listBatchActions`): es **una** jugada `batch`, no N sueltas: N despachos en el mismo toque hacen saltar el cursor, pierden efectos y sonido, y serían N Deshacer y N pedidos al rival (el relay corta a las 30 por segundo). Nunca dos despachos por toque. Invocar, activar y colocar van de a una (cada una pide zona y posición); Target no se ofrece en el Main ni en el Extra (en el juego no se apunta al deck); «Al azar» conserva su nombre. Se descartaron una casilla por carta (los 44 px no entran en una carta de 66 px) y el toque largo.

## Chat, señales y espectadores

- **Señalar no es Target:** Señalar dura un instante y no es una jugada: no entra en Deshacer ni se repone al reconectar. Target sobre lo del rival marca, vence solo y viaja con el conjunto de marcas (`marks`: repetirlo no cambia nada y reconectar lo repone); sobre lo tuyo es una jugada `target` más.
- **Las señales (🤔, 👍) salen una cada `EMOTE_GAP_MS`**, con el reloj de quien las manda, sin filtrarse al recibir (un cliente viejo que las mande seguido se ve igual).
- **Quien mira** ve cada lado como lo ve el rival (`duel-spectator.ts`) y nada más: no puede mandar nada (lo impone el relay) y no ve lo que sólo comunica (lo que se señala, lo que mira cada uno) ni suena.

## Siding

Usa las zonas y el arrastre del builder, pero es una pantalla propia (`DuelSiding`) sin salida: termina con «Listo» o cuando se acaba el tiempo (`SIDING_MS`). Recargar vuelve al siding como estaba (`duel-save.ts`), también en una sala automática.

## Pausa, reconexión y cierre

- Mientras falta uno, el duelo queda en pausa: la mesa se tapa y el reloj de la ronda se detiene.
- **Reconectar** (el ⋯ de la barra y el cartel de pausa) tira la conexión y abre otra: el relay vuelve a decir quién está y destraba una pausa por un aviso que no llegó. Safari en iOS suspende los WebSockets al bloquear la pantalla: el cliente reintenta y pide un `sync` al volver.
- Lo propio se guarda por sala y rol (`duel-save.ts`), con el chat, el registro y `order` (Deshacer tras recargar sigue el orden real); lo del rival lo repite él al saludar, y el marcador del Match viene de su `sync` (uno viejo no pisa a uno nuevo). El relay no reserva el asiento: sólo recupera su mesa quien tiene lo guardado (límite aceptado: `docs/seguridad.md`).
- **La sala muere al terminar el duelo** (uno suelto o un Match ganado): si el rival se va, a los `ROOM_CLOSE_S` la sala se cierra para todos (`duel.endRoom()`; el porqué, en `docs/duelo-relay.md`). Hasta entonces otra identidad no recibe nada (`stranger`), y quien ocupa el lugar del rival no cuenta como presente hasta saludar (`peerGreeted`): un tercero no reinicia la cuenta. La sala pública no vuelve a la lista de espera.

## Cómo está armado

```
src/app/mat-public.ts        ids opacos, qué ve el rival y el espejo
src/app/duel-protocol.ts     los mensajes y su validación
src/app/duel-session.ts      createDuel: las dos mesas, vidas, relojes, chat, deshacer y marcas
src/app/duel-socket.ts       el transporte por WebSocket (use-duel.ts, duel-link.ts: el enlace)
src/app/duel-spectator.ts    el duelo visto desde afuera
src/app/duel-*.ts            moneda, dado y Match (games), turnos, reloj, siding, formato, guardado
src/components/duel/         las pantallas (DuelScreen: lobby, sala y mesa)
duel-relay/                  el Worker + Durable Object de Cloudflare
```

- **Cada lado aplica las jugadas del otro a un espejo de su mesa** con `matReducer`, puro y determinista, y las mismas semillas (`shuffleWithSeed`: el orden del deck nunca viaja). Por eso toda jugada nueva es determinista y serializable a JSON (lo comprueba el fuzz de `mat-public.test.ts`).
- **Qué ve el rival:** las cartas viajan con ids opacos y el rival sólo sabe qué carta es cuando está a la vista o se la muestran (`mat-public.ts`). Robar es secreto; sumar a la mano una carta que no estaba, no. Nada impide mirar el tráfico con las herramientas del navegador.
- **El protocolo no sube de versión** (`PROTOCOL_VERSION`) para sumar algo: cortaría la sala con quien no recargó. Un cliente viejo ignora lo que no conoce, descarta la jugada que no reconoce y se repara con el `sync` que pide al notar que le falta una. Por eso una jugada nueva se publica **antes** que la pantalla que la manda. Una conducta nueva que cambia el estado va con una capacidad: cada lado la anuncia en `caps` del `hello` (al recargar, de nuevo), quien empieza la usa sólo si el otro la anunció y la jugada lleva su marca, así el espejo, el espectador y los replays la aplican igual. Límite: el espectador no saluda, y uno de antes la ve distinto hasta su próximo `sync`.
- El tiempo real vive en Cloudflare porque las funciones de Vercel no mantienen WebSockets; no se usó WebRTC (PeerJS), que necesitaría un TURN para conectar celular↔PC. `createDuel` sólo conoce `DuelTransport`; los tests usan una sala en memoria (`__tests__/support/memory-room.ts`).
- **Replay:** lo de un espectador, sin chat (`duel-replay.ts`); del manual, el rival sale de lo que anota `DuelRecord` (`manual-replay.ts`): si se perdió una jugada suya, corta ahí y no dice cómo terminó. Viaja por enlace (sin nombres: se piden por passcode al abrir) o como .mp4 9:16 hecho en el navegador (`components/replays/video/`), con la arena y el arte de la Magia de Campo de fondo, el barajado y el reparto con los planes de la mesa (`video-fx.test.ts` vigila las copias) y una franja que explica la jugada sólo con lo que el dato sabe (`describeStep`; «costo» sólo si `activate.cost` lo dice): las cadenas no se guardan, así que no se explican.

## Probarlo

Con tres pestañas (dos jugadores y un espectador): un relay local o el publicado (`docs/duelo-relay.md`), la app con `VITE_DUEL_RELAY_URL=ws://127.0.0.1:8788 npm run dev`, cada jugador con un deck en el builder (cada puerto es un origen nuevo y no comparte lo guardado) y el espectador con el enlace. Editar un archivo del repo (también un `.md`) recarga las pestañas: el duelo se rearma de lo guardado.

Los tests de la pantalla (`duel-screen-*.test.tsx`, arnés en `support/`) juegan duelos enteros en memoria; el de punta a punta contra el relay, en `docs/duelo-relay.md`.

## Qué se descartó a propósito

- Ofertas de empate, revelar de forma persistente, chat libre de los espectadores, torneos, cuentas y una sala «Solo» a la que se sume alguien: Jugar solo es la práctica, local y sin relay.
- Elegir los puntos de vida (siempre 8000), una señal ✋ «Esperá» (son 🤔 y 👍) y un anillo con la inicial en las vidas (se probó y no va).

## Para no repetir un error

- Los problemas de layout no aparecen en jsdom: hay que medir con `getBoundingClientRect` en un navegador, a tamaño de celular (416 × 734) y de escritorio.
- En el celular, el click que llega tras un toque puede caer en lo que ese toque abrió: la hoja de la carta no atiende sus primeros `GHOST_CLICK_MS`, y al invocar desde el Extra ni confirmar materiales ni ese click eligen la casilla (`pickZone`).
- Lo que se suelta con un toque afuera (el detalle fijo de la izquierda) se mira en la fase de captura, así un menú que frena el evento no lo deja pegado (`use-dock-peek.ts`).

# Duelos automáticos: el núcleo real de reglas

Capa 4 del motor de cartas (`docs/motor-de-cartas.md`). Corre `ocgcore` con los scripts de Project Ignis (`ocgcore-wasm`, versión exacta en `package.json`). **El núcleo manda y la mesa es una proyección de lo que cuenta**; con el modo apagado todo sigue manual. Este doc es el núcleo y «Jugar solo automático»; el duelo con un amigo, `docs/duelo-automatico-enlace.md`.

## El núcleo

- **Dónde vive** (`src/app/auto/`): `protocol.ts` es la frontera JSON (sin `bigint`); `core-host.ts` corre el núcleo en un Worker o un servidor; `referee.ts` filtra por asiento lo que cada uno ve (una tabla que no compila si falta un mensaje); `policies.ts`, el rival y el bot; `auto-session.ts`, la sesión; `adapter.ts`, la mesa.
- **La mesa** (`adapter.ts`): a un asiento le llegan las `MatAction` de siempre y al espejo del rival, ids opacos y sólo lo visto. Lo que `MatState` no tiene (ATK/DEF, cadena, vidas, turno y fase del núcleo, equipos) va en `overlay`. Tras barajar nadie sabe el orden del deck ni su dueño: robar dice qué carta salió, y la pila sigue los lugares del núcleo (la carta que nombra en uno queda ahí). Los materiales que la Invocación Xyz junta antes de preguntar zona y posición van debajo de la carta del Extra (`MatState.held`): sus zonas quedan libres, como en el núcleo, sin ser una jugada (la Invocación Xyz sigue siendo un paso: la pantalla lo suma al final de la cinta). La mesa no muestra el control de un Xyz con materiales ni el de una ficha (el `give` de la manual los rechaza); una carta que cambia de código conserva su id (`codeOf` sigue al núcleo).
- **Lo que el núcleo no hace, y hace la app:** no baraja el deck inicial (`deckOrder` con la semilla), empieza siempre el jugador 0 (ir segundo es ocupar el 1: `seatOf`) y `MSG_WIN` no corta el duelo (el fin es el primer `win`). Una carta sin script juega sin efectos, como en Dueling Nexus, y se avisa; sin fila en las bases, en jugar solo usa la de la app (`rowOfApiCard`). Se cargan también la fila del `alias` y la del nombre que otra carta cambia (`listed_names`).
- **El paquete tiene dos defectos** que arregla `core-host.ts` (`send` y `freeDuel`) y exige `wasmBinary` o `locateFile`: al subir de versión, revisarlos.
- **Determinismo:** semilla + respuestas = el duelo entero; deshacer re-simula en una instancia nueva (`rewind`) y `canonical` ordena las pistas que entre instancias salen en otro orden. Lo que tarda (materiales de Sincronía) corre en el Worker, con «pensando…» y un cancelar que re-simula.
- **Licencia:** AGPL-3.0-or-later, como el núcleo y los scripts (el paquete se declara MIT, pero su `.wasm` lleva el núcleo). `cards.cdb` no tiene licencia: no se sube. Sólo `src/app/auto/` y `components/auto` (import diferido) traen el núcleo (`auto-isolation.test.ts`, `NOTICE.md`).

## «Jugar solo automático» (beta)

- **Entrada:** «Modo del duelo» de las reglas de Jugar, automático de entrada; sin WebAssembly o Worker no se ofrece (`canRunAuto`). `AutoSoloScreen` arma la mesa de siempre y **nunca despacha una jugada**: el núcleo las cuenta y la mesa las reproduce de a una; la pantalla sólo contesta preguntas (`ask-ui.ts`, puro).
- **Rival:** pasivo (40 Normales de relleno) o, con el simulador de handtraps, `handtrapPolicy`: las copias elegidas más relleno, la mano de `dealRival` con la semilla, y una handtrap sólo contra un eslabón tuyo cuando su regla (`AUTO_RULES`) lo pide; sin regla, la tiene y no la usa. Con Gamma o Delta va PSY-Frame Driver, sin el que el núcleo no las ofrece. Maxx "C" y las Mulcharmy, en tu Draw Phase.
- **Su Extra Deck** (`HandtrapConfig.extra`, editable en la hoja; el pasivo lleva `DEFAULT_RIVAL_EXTRA`): nunca lo Invoca, pero hay costos que lo piden (Fydraulis Harmonia revela Sincros). El orden es la preferencia: de lo que pida el núcleo de su Extra, toma primero lo de más arriba. No cambia `dealRival`. Su mano va boca arriba, salvo «A ciegas». En piedra, papel o tijera saca al azar con la semilla.
- **Barra:** «Nueva mano» es otra semilla y «Reiniciar el mismo duelo», la misma. Guardar un combo es una foto (`auto: true`); repasar frena ritmo, paradas y preguntas sin tocar la cinta.
- **Seguir en modo manual** (`manual-handover.ts`): ante un error del núcleo, al final o cuando quieras, la partida sigue en la práctica manual con todo el historial. «Volver atrás» deshace hasta `MANUAL_BACK_MAX` jugadas tuyas y anda con el núcleo caído. Es de esa partida: no cambia el modo.
- **Pasar de manual a automático** (`resume.ts`; en el enlace, con el acuerdo del otro): rearma el núcleo desde las mesas con la biblioteca Lua `Debug`, sólo en un punto limpio (`whyNotResume`). **Límite aceptado:** arranca en el turno 1 y olvida lo hecho en el turno en curso, los equipos y los contadores (el porqué, en el comentario de `resume.ts`). En jugar solo no se guarda.
- **Guardar replay** (`auto-replay.ts`): sin cadena ni ATK/DEF del momento; pasado a manual, lo que sigue no entra.

## La mesa y las preguntas

- **Una carta sin jugadas dice por qué** (`no-plays.ts`): sólo hechos; si no se sabe, «el automático no la ofrece». Aparte y después, las restricciones del núcleo (`overlay.limits`, de los `player_hint` 6 y 7): rigen, pero pueden no ser la causa.
- **La cadena se resuelve de una:** `ChainNotice` cuenta los eslabones de a uno (`chain-feed.ts`). Se mira la cadena, no la jugada `activate`: una Trampa activada desde la mano llega como colocada. Un efecto que queda (Veiler, Called by) niega en su turno, sin «por CLn».
- **Del rival, sólo lo público** (`rivalPeekOf`): boca abajo es dorso aunque el adaptador sepa el código; nunca su Deck, su mano ni su Extra boca abajo.
- **Las vidas esperan al golpe** (`useStrikeHold`, `useRivalStrike`): el núcleo las baja al declarar el ataque y la mesa lo muestra a su ritmo; saltar, repasar o el movimiento reducido no esperan, y el resultado, la sala y la calculadora usan siempre las reales. Las fases del rival van de a una, con su cartel, y tu mesa espera a «Tu turno» (`useAutoAsks`, `rivalPhases`; sólo en Jugar solo).
- **Las fases las cambiás vos:** el núcleo cuenta tu DP, SP y M1 de una tanda, pero la mesa frena en tu DP y tu SP (`phase-stops.ts`) hasta que las dejes. Es sólo de la pantalla (semilla y respuestas no cambian); frena al empezar o reiniciar, no tras deshacer.
- **Sin fila de abajo:** hasta 1100 px las vidas y el turno van en un marcador plano bajo los íconos (`scoreInHeader`); en escritorio, cada vida en su esquina. La fase la dice sólo el botón del campo.
- **Cuándo se pregunta una cadena:** como EDOPro sin «Always chain», sólo si algo responde de verdad (`spe_count ≠ 0`) o es forzada (y se avisa). «Siempre» pregunta igual; tus ventanas de DP, SP y EP con algo para activar se muestran salvo con «Nunca»; el post-robo se pasa solo.
- **Las preguntas** (`ask-ui.ts`, `AskPrompt`):
  - El rótulo de un efecto es el `strN` que nombra su `desc`, nunca un número (el orden de la pregunta no es el del texto). Los carteles no nombran cartas: bastan arte, lugar y CLn.
  - Brilla en celeste lo que se activa o invoca especial y lo que se pide elegir; en ámbar, cada eslabón (`app/card-glow.ts`). Invocar normal, colocar, cambiar de posición o atacar no brillan.
  - Hasta 6 cartas van en banda (`PickBand`); con más, la hoja (`CardPicker`). Una lista de varios lugares se agrupa por lugar y cada carta lleva su chip: dos copias de la mano y del Deck nunca se ven iguales. Declarar una carta ofrece sólo lo que ese asiento conoce (`declarable`).
  - Todo cartel va en un lugar fijo (`matSpot`) y nada se minimiza solo. El título dice para qué por el `HINT_SELECTMSG` previo (`pickTitle`), sólo con los códigos comprobados.
  - Al rival automático rechazado se le repregunta con `randomLegalPolicy`; tres seguidas cortan.

## Datos y pruebas

- **Versiones fijas:** `auto-data.lock.json` fija el commit de los scripts y el de BabelCDB, con las bases que se juntan (`cards.cdb`, `release-*` y `prerelease-*`, sin Rush: las nuevas llegan antes ahí). `npm run sync:core` baja esas versiones fuera del repo (`-- --update-lock` lo sube); `sync-auto-data.yml` lo hace cada lunes y abre la PR.
- **En producción** `api/auto-data.ts` sirve `/auto-data/*` con lo que arma `scripts/build-auto-data.mjs` en el build, no GitHub en vivo. Si no los arma, el sitio se despliega igual y la beta dice «no disponible» (`AUTO_DATA_STRICT=1` rompe el build).
- `npm run test:auto` corre las pruebas lentas (`*.slow.test.ts`, con el núcleo real), fuera de `npm test`; la CI corre sólo un fuzz corto.

# Retomar el trabajo desde otra PC

Para arrancar sin el chat ni la memoria de Claude: qué hay, dónde vive, qué se decidió y qué falta. Es una foto del 2026-10-22;
lo que cambió después está en `git log` y en el cuerpo de cada PR. El diario anterior de este archivo: `git show e4b63f6:docs/retomar.md`.

## 1. Estado actual

Todo está en `main` y publicado en <https://yu-gi-oh-probability-lab.vercel.app>. El detalle visual de cada pantalla está en
`docs/design-system.md`; el del duelo y la mesa, en `docs/duelo.md`.

### Armazón y navegación
- Cuatro grupos en el menú (`buildAppNavGroups` en `components/deck-mode/deck-workflow-navigation.ts`): **Tu deck** (Deck · Roles · Lab · Comparar), **Jugar** (Jugar, la calculadora de LP y Exportar), **Descubrir** (Tier lists, Crear tier list, Decks de torneo, Replays) y **Cartas** (Expansiones, Banlists).
- Escritorio: menú lateral que se contrae (`AppSidebar`; lo legal va al final, en `SidebarLegal`: no hay pie) y la barra de arriba con el buscador de la app (`AppNavbar` + `FeatureSearch`: pantallas, cartas, expansiones, impresiones, decks, jugadores y replays; se abre con `/` o Ctrl/Cmd+K).
- Celular: barra de abajo (`MobileTabBar`), una hoja por grupo (`GroupSheet`) y la hamburguesa (`NavDrawer`) con el menú entero, el idioma, «Tus datos» (la copia de seguridad, `app/backup.ts`) y lo legal.
- El buscador de cartas global (`GlobalCardSearch`) está en todas las pantallas menos el builder de escritorio (trae el suyo), la práctica y un duelo; en el lobby de Jugar, sí.
- Invariante: hay un solo corte celular/escritorio, 1101 px (`min-[1101px]`, y su complemento es `max-[1101px]`: Tailwind v4 compila `max-[N]` como `width < N`). `layout-stability.test.tsx` falla si vuelve un `max-[1100px]`.

### Deck builder, Lab y Comparar
- **Builder:** los límites de copias salen de las banlists del sitio (`getCardCopyLimit` en `app/deck-format.ts` usa `currentStatus` de `app/banlists.ts`: la lista más nueva que ya rige); la próxima sólo avisa (`buildUpcomingLimitNotes`). Los filtros van en un cajón (`SearchFiltersDrawer`, un `MultiSelect` por grupo; la parte pura en `app/card-filters.ts`; los de efecto son heurísticas sobre el texto en inglés, `app/card-effects.ts`).
- **Importar** arranca en «Pegar texto» (también Archivo y Enlace `ydke://`); **Exportar** deja elegir qué bajar (imagen JPG, PDF, YDK, TXT, JSON; `ygo-lab:export-selection`); el precio del deck suma la impresión más barata de TCGplayer de cada carta (`DeckPriceModal`).
- **Roles:** el asistente sugiere y el usuario confirma («Confirmar las N sugerencias», `confirmAllClassifications` en `app/deck-builder.ts`). **El Lab sólo mide lo confirmado.**
- **Lab:** el veredicto es un anillo de reparto «de cada 100» (`LabScoreCard`), lo que más te frena con el cambio de una carta (`LabSuggestion`, `app/lab-suggestion.ts`), las reglas (`LabRules`, `LabRuleList`, `PatternEditorDrawer`, `app/rule-edits.ts`) y **«Probar el cambio»**: un borrador (`useLabDraft`, `ygo-lab:build-draft` en `sessionStorage`) que todo el Lab muestra hasta «Aplicar al deck» (con Deshacer) o descartarlo. Mide en workers, con un caché de 4 lugares (`app/lab-cache-store.ts`).
- **Comparar:** A es tu deck y B llega elegida («Tu deck de antes», `app/deck-before.ts`, o la build guardada más reciente: `app/comparison-selection.ts`); los cambios van de a pares con el efecto de cada uno (hasta 8: `app/change-effects.ts`) y «Cargar B en el builder» tiene Deshacer. Claves: `ygo-lab:deck-before`, `ygo-lab:deck-before-session`, `ygo-lab:comparison-selection` y `ygo-lab:saved-builds`.
- Invariante: entrar o salir del borrador del Lab no corre nada de lugar (la sugerencia queda montada, invisible e `inert`, en la misma celda que la tarjeta del cambio).

### Descubrir
- **Decks de torneo** (`TournamentDecksScreen`; la tarjeta, `MetaDeckTile`, sigue el lenguaje de tarjetas de `docs/ux-ui-guidelines.md`): chips por puesto, «Este mes» y «Con replay», y scroll infinito. Los datos son de YGOPRODeck (`npm run sync:meta` → `src/data/meta-decks.json` y `meta-decklists.json`).
- **Tier lists** del meta (`TierListsScreen`, `TierStrip`) y el **creador** (`#tier-maker`: `TierMakerScreen`, la lógica en `app/tierlist-maker.ts`, una sola lista a la vista guardada en `ygo-lab:tierlists`): las cartas se arrastran como en el builder (`app/use-tier-card-drag.ts`), las filas por su agarre, y la imagen baja como `tier-list.jpg`.
- **Replays**, armados como la home de YouTube (`ReplaysScreen`): arriba lo que está en vivo y las transmisiones que ya terminaron (`api/live.ts`, `app/live-streams.ts`), abajo los replays de los canales oficiales (`npm run sync:replays` → `src/data/replays.json`).
- **Expansiones** (`ExpansionsScreen`) busca expansiones y también cartas, por nombre o por código de impresión (`app/use-card-hits.ts`, `findCardsByCode`). Los **precios** son de TCGplayer, vía TCGCSV (`npm run sync:prices` → `public/prices/`).
- **Banlists** (`BanlistsScreen`; `src/data/banlists.json` sale de `lflist.conf` de YGOPro con `npm run sync:banlists`): Vigente, Próxima y «En partes» (`partial`; lo que la fuente todavía no trae va en `scripts/banlist-supplements.json`).
- Invariante: los datos son archivos estáticos que la app lee sin servidor (lo único en vivo pasa por `api/live.ts`, una función de Vercel). Hoy **no se actualizan solos** (ver la sección 6).

### Jugar y el duelo
- El inicio de Jugar (`PlayHome`): «Jugar ahora», cuatro baldosas (Retar a un amigo · Tengo un código · Entrenar solo · Reglas del duelo) y la arena con las salas públicas y los duelos en vivo (`ArenaPanel`). Se recuerdan en `ygo-lab:duel-prefs` (`app/duel-prefs.ts`) el reloj de la ronda y el de turnos, el formato, Match, siding y el tope de Genesys; no quién puede entrar: «Jugar ahora» es siempre público y «Retar a un amigo», siempre privado.
- La sala (`DuelScreen`, `DuelOpening`, `RoomRules`, `RoomDeck`) entra sin scroll: las reglas y el deck a la izquierda, el escenario en el medio y el chat a la derecha. Al tocar «Estoy listo», cada uno revisa su deck con las reglas del formato (`deckFormatIssues` en `app/duel-format.ts`): el rival no ve el deck.
- En el duelo: reloj de la ronda (50 min o sin tiempo) y reloj de turnos (7 min y +3 por pase; quien llega a cero pierde: `app/duel-clock.ts`), siding en un Match (es el builder, con 3 min: `DuelSiding`), hasta dos espectadores (`SpectatorScreen`, enlace con `&watch=1`) y la pantalla que no se apaga (`app/use-wake-lock.ts`). Con el duelo terminado y el rival afuera, la sala se cierra para todos a los 5 s (`CLOSE_ROOM_OVER`).
- El relay es un Worker de Cloudflare (`duel-relay/`: una sala por código y `RoomIndex` para las públicas) en `wss://ygo-lab-duel-relay.gastonvallesyeou.workers.dev`; el sitio lo encuentra por `VITE_DUEL_RELAY_URL`. Hay que volver a publicarlo cuando cambia `duel-relay/` **o `src/app/duel-relay-rules.ts`** (el Worker lo empaqueta): primero el relay y después el sitio. Cómo se prueba y se publica: `docs/duelo-relay.md`.
- La calculadora de LP es una vista (`#life`, `LifeCalculatorScreen`); adentro del duelo, un modal (`DuelCalculator`).
- Invariante: un cambio de mensajes no rompe a un cliente que no recargó (`PROTOCOL_VERSION` en `app/duel-protocol.ts`; ver `docs/duelo.md`).

### La mesa
- «Jugar solo» (`PracticeMat` + `PracticeSection`) y el duelo usan la misma mesa; las jugadas salen de `app/practice-mat.ts` (`matReducer`, `listCardActions`): es manual, avisa y no decide. Toda jugada entra en Deshacer, en el registro y en los combos guardados (`ygo-lab:practice-combos`), que se reproducen paso a paso con su línea de tiempo (`app/mat-step-info.ts`, `probability/panel-steps.ts`, `MatSnapshot`, las flechas de `app/mat-arrows.ts`).
- Menús: en el celular, la hoja de abajo (`CardSheet`); en escritorio, el menú pegado a la carta (`CardMenu`). «Elegir varias» en el visor de una pila arma una sola jugada `batch`. Desde 1440 px, el detalle fijo a la izquierda (`DuelCardDock`, `use-dock-peek.ts`: el hover lo muestra, un clic lo deja fijo).
- Gestos: mantener apretada una carta del campo (`HOLD_MS`, 450 ms) cambia su posición, **sólo en la práctica** (`holdAction`); un Link entra en ataque sin preguntar y no pasa a defensa; el deck: tocar = buscar, arrastrar = robar, mantener = el menú.
- **Simulador de handtraps** (Jugar → Reglas → Solo, o el botón «Handtraps del rival» de la barra): de 1 a 3 copias por carta y una mano de 1 a 5 (3 por defecto) repartida al azar con semilla (`app/handtraps.ts`, `dealRival`; `ygo-lab:rival-handtraps:v2`). Usar una es la jugada `rivalUse` (entra en Deshacer y en los combos; el relay la rechaza). `RivalHandStrip`: desde 1101 px, una fila de cartas grandes arriba del campo; por debajo, una franja.
- **Paneles con ancho a gusto:** el borde del detalle (desde 1440 px) y el del panel derecho (desde 1101 px) se arrastran (`ResizeHandle`, `app/mat-panels.ts`): de 16 a 36 rem, con la mesa nunca por debajo de 33 rem; doble clic vuelve a los 20 rem; se recuerda en `ygo-lab:mat-panels:v1`.
- Invariantes: la mesa no se mueve al interactuar (ni al abrir un menú ni con una animación) y la mano nunca tapa el campo ni un menú. Por debajo de 640 px el campo va en cinco columnas (`probability/compact-field.ts`).

### Cartas
- El detalle (`CardOverlay` y su familia en `components/card-detail/`) pasa a la carta anterior y a la siguiente de su lista (`app/card-neighbors.ts`), sigue a la impresión elegida (`PrintingInfo`) y se cierra con la X, Escape o tocando afuera de la carta; tocar la carta no lo cierra.
- La carta grande (`CardZoom`): zoom de 100 a 300 % (también Ctrl + rueda y pellizco, `use-pinch-zoom.ts`), «Leer texto de efecto», la lista de impresiones y el giro en 3D (`card-tilt.tsx`; se da vuelta de costado o con la tecla F, `CardFlip`), con el dorso real (`public/card-back.webp`; en la mesa, `card-back-sm.webp`).
- El foil de rareza (`RarityFoil`, `app/card-foil.ts`, `src/foil.css` y las texturas de `public/foil/`, que arma `scripts/foil-textures/index.html`): 18 efectos, uno por familia de rarezas; un arte extendido brilla entero, sin la ventana del arte.
- El motor de cartas va por capas y sólo afirma lo que comprobó (`docs/motor-de-cartas.md`): el texto resaltado (`app/card-text.ts`, `CardEffectText`), los hechos en los que coinciden el script de EDOPro y el texto (`app/card-effect-facts.ts`, `app/card-effect-map.ts`; `npm run sync:effects` escribe `src/data/card-effects.json` y `card-effect-map.json`) y el asistente de la mesa (`app/mat-assistant.ts`, `app/mat-responders.ts`, `app/turn-rules.ts`), que avisa y no frena.
- Las imágenes pasan por el proxy `api/card-image.ts`: YGOPRODeck pide no enlazarlas directo.

### Idiomas y seguridad
- Español e inglés por `t()` (`src/i18n/es` y `src/i18n/en`, un archivo por tema). Sólo se baja el idioma de la página (`loadLocale`: el inglés es otro archivo y lo esperan `main.tsx`, el worker del Lab y `src/i18n/test-setup.ts`); el elegido se guarda en `ygo-lab:locale`. Reglas y tono: `docs/i18n.md`.
- Seguridad: `docs/seguridad.md` (la CSP de `vercel.json`, el proxy de imágenes, `api/live.ts` y los topes y orígenes del relay). Lo de las cuentas (verificación en dos pasos, límites por IP, vistas previas protegidas) sólo lo puede hacer quien las administra.

### Herramientas de trabajo
- `/playground` (`docs/playground.md`): el catálogo vivo; un cambio de diseño se prueba ahí antes de llevarlo a las pantallas.
- graphify: el grafo del código, local y fuera de git (`graphify-out/`); cómo se arma y se consulta, en `CLAUDE.md`.
- Impeccable: una skill local de crítica y pulido de diseño; `PRODUCT.md` es su contexto (usuarios, propósito, tono). Una crítica es una nota: las reglas son `docs/design-system.md` y `docs/ux-ui-guidelines.md`.
- Pruebas que cuidan reglas: `button-rules.test.ts` (botones), `layout-stability.test.tsx` (los cortes), `motion-curves.test.ts` (las curvas de movimiento), `ring-language.test.tsx` (el contraste de los anillos), `sticky-bars.test.tsx` (las barras pegadas) y `vercel-headers.test.ts` (los encabezados y el `ignoreCommand` de `vercel.json`).

## 2. Arrancar

```bash
git pull
npm ci                 # Node 22 (.nvmrc; engines: >=22.12.0)
npm run dev            # http://localhost:5173; Vite también sirve /api/card-image y /api/live
```

Cierre de cada tarea: `npm run typecheck`, `npm run lint`, `npm test` y `npm run build`, más el chequeo responsive de
`docs/ux-ui-guidelines.md`. Los datos se bajan con `npm run sync:meta`, `sync:prices`, `sync:banlists`, `sync:replays`,
`sync:genesys` y `sync:effects` (qué hace cada uno: `README.md`; el de efectos, `docs/motor-de-cartas.md`).

**Un duelo en local** necesita `VITE_DUEL_RELAY_URL` en un `.env.local` (ignorado por git: un worktree nuevo no lo trae, copialo del checkout
principal; sin él, `#duel` dice «El duelo con un amigo todavía no está disponible») y un relay:
- **El publicado** (`wss://ygo-lab-duel-relay.gastonvallesyeou.workers.dev`) acepta `localhost:5173` y `127.0.0.1:5173`: el
  servidor de desarrollo tiene que estar en ese puerto. Una sala pública que armes probando aparece en «Salas abiertas» de
  producción: probá en privada o cerrala.
- **Uno local:** `cd duel-relay && npx wrangler@4 dev --local --port 8788 --persist-to C:/tmp/relay --var "ALLOWED_ORIGINS:http://localhost:5173,http://127.0.0.1:5173"`
  y `VITE_DUEL_RELAY_URL=ws://127.0.0.1:8788`. La prueba de punta a punta contra él:
  `DUEL_RELAY_E2E_URL=ws://127.0.0.1:8788 npm test -- duel-relay.e2e`. Más en `docs/duelo-relay.md`.

**Windows:** corré `npm` desde Windows, no desde WSL (`node_modules` es de Windows y en WSL rolldown no encuentra su binario).
`wrangler dev` levantado varias veces deja procesos `workerd` colgados y el relay deja de contestar (la página queda en
«Conectando…»): matalos y levantá uno solo con otra carpeta en `--persist-to`. Si falla con `SQLITE_CANTOPEN`, es el largo de
la ruta: usá una corta, como `C:/tmp/relay`.

**graphify** (para ubicarse rápido en el código): `uv tool install graphifyy` (con doble «y») y, en la raíz de cada checkout o
worktree, `graphify update .`. Las consultas, los hooks y la ruta completa del comando si una sesión no lo ve: `CLAUDE.md`.

## 3. Qué leer primero

1. `CLAUDE.md`: trae `docs/ux-ui-guidelines.md` (cómo se lee un pedido de diseño y cómo se hace una mejora visual), la
   orquestación con subagentes, las notas del parche y graphify.
2. `docs/design-system.md` (componentes, tokens y reglas) y `docs/playground.md` (`/playground`, el catálogo vivo).
3. `PRODUCT.md`: usuarios, propósito y tono.
4. `README.md`: qué hace la app, la estructura del proyecto y los scripts.
5. `docs/duelo.md` (el duelo por enlace y la mesa) y `docs/duelo-relay.md` (el relay).
6. `docs/motor-de-cartas.md`: las capas del motor de cartas, lo que se midió y lo que no se marca a propósito.
7. `docs/i18n.md` (es/en por `t()`) y `docs/seguridad.md` (qué se protege y lo que sólo hace quien administra las cuentas).

## 4. El lienzo de prototipos

Artifact privado: <https://claude.ai/artifact/EDbqyjWAgvgRctJpastsF7> («Prototipos YGOUltraLab»). Se lee con la misma cuenta de
claude.ai (desde Claude Code: acción `read` del Artifact con esa URL, y `list` con `scope: "files"` para ver las hojas). Hay una
hoja por pantalla o estado (`Mesa`, `MesaPerspectiva`, `Lab`, `Comparar`, `Lobby`, `Hoja*`, `Paleta`, `Logo`…), en celular y en
escritorio. Los fuentes (`*.dc.html`) no están en el repo: vale la copia publicada. No se copia lo roto: la hoja
`LobbyEscritorio` trae HTML roto y Exportar dice PNG (la app exporta JPG). Tampoco se vuelve a poner lo que Gastón pidió
sacar aunque el lienzo lo traiga: la barra de cinco pasos del Deck (`FlowSteps`), la barra de abajo del Deck en el celular
(«Siguiente: Roles» / «Buscar cartas»), el pie de página y el botón ✋ «Esperá». Las maquetas del rediseño del Lab y de
Comparar no están ni ahí ni en el repo: lo decidido quedó en `docs/design-system.md`.

Para medir qué tan fiel es la app al lienzo: revisiones de sólo lectura en paralelo, una por grupo de hojas, que comparan cada
hoja con su pantalla y devuelven las diferencias con su esfuerzo (S/M/L) y si piden lógica nueva; después se juntan en una lista.

## 5. Decisiones que siguen en pie

- **Jugar solo es un modo de sala** (Single · Match · Solo, `RoomMode` en `PlayHome.tsx`): la mesa de práctica, local y sin
  relay; no se recuerda como regla. No existe una sala «Solo» a la que se sume alguien después.
- **Las salas son públicas por defecto** («Retar a un amigo» abre una privada); la lista sale del relay (`RoomIndex`) y el nombre
  del anfitrión se muestra tal cual (si hay abuso, habrá que moderar). El siding, sólo en un Match.
- **Un duelo pide 40 cartas en el Main** para estar listo (`MAIN_MINIMUM`); Jugar solo no.
- **Pasar turno:** en escritorio aparece sólo en la End Phase, debajo del botón de las fases y de un toque; en el celular no hay
  botón: la End Phase pregunta «¿Terminar tu turno?».
- **Mantener apretado para cambiar de posición, sólo en la práctica:** en un duelo, un toque largo sin querer le mandaría una
  jugada al rival.
- **Menús de la mesa:** en el celular, la hoja de abajo (se cierra al tocar afuera); en escritorio, el menú pegado a la carta. Lo
  que se pide para el celular no toca el menú lateral ni las pantallas de escritorio.
- **La mesa del celular no se toca** más allá del campo de cinco columnas (el Extra y el Deck en los extremos, la Zona de campo
  en el medio): ni el avatar, ni el engranaje, ni las pilas apiladas, ni el asa de la mano de la imagen de referencia.
- **Mensajes rápidos del duelo:** 🤔 y 👍, sin texto y al alcance del pulgar (no hay ✋ «Esperá»). No hay cartel por activar otra
  vez una carta: repetir una activación es una forma de preguntarle al rival si responde.
- **Deck en escritorio:** tres columnas (la carta, el deck y el buscador a la derecha).
- **Lab:** el veredicto es un anillo de reparto (verde lo que abre, rojo lo que no) con el entero «de cada 100», sin «%»
  (`formatPer100`), y la nota en rojo, ámbar o verde. El violeta `primary` no se usa como arco: da 2,29:1.
- **El Lab sólo mide lo confirmado;** un resultado provisional con sugerencias sin confirmar queda para más adelante.
- **Colores:** violeta = el fondo, lo tuyo y la acción principal; ámbar = el énfasis, el hover, el foco, lo elegido y, en la
  mesa, lo del rival (`PLAYER_COLOR`); verde y rojo = respuestas y estadísticas, con texto blanco sobre sus rellenos. El detalle,
  en `docs/design-system.md`.
- **Vidas:** en escritorio, un corazón del color de la salud (en el celular, sin corazón). El anillo con la inicial no gustó: no
  volver a ponerlo.
- **La calculadora de LP queda como está** (el teclado recto, Duelista 1 y Duelista 2): el rediseño con tarjetas se descartó.
- **Tier lists en el celular:** Hoy / Proyección a la vista; Main · Side · Ambos y 2 · 4 · 8 semanas, en «Ajustar».
- **Espectadores:** todo lo de quien mira lleva un ojo y los jugadores ven cuántos miran; el protocolo no cambia para que el
  espectador vea ese número.
- **Replays en vivo sin API key:** se lee la pestaña de transmisiones de cada canal; si YouTube cambia el formato, `api/live`
  dice `ok: false` y la app lo avisa con los links a los canales, nunca «no hay nada en vivo».
- **El dado de quién empieza** es un d6 por jugador que se repite si empatan (pasa en 1 de cada 6 salas): no es un fallo; un
  dado más grande lo bajaría, pero cambia la cara del dado.
- **Mascotas:** apagadas la primera vez en el celular (`app/mascot.ts`); no se tocan si no se pide.
- **Marca:** el nombre YGOUltraLab y el logo A (anillo y carta, `AppBrand`).
- **`motion` no está en `main`:** sería una dependencia nueva (para un motor de arrastre y vuelos, empezando en `/playground` con
  un solo gesto) y espera el visto bueno de Gastón (el checkout de su PC la tiene sin commitear); las animaciones 3D de hoy se
  mantienen.
- **Las hojas de salas no se publican al lienzo:** el diseño de las salas vive en el código.

## 6. Pendiente

**Abierto**
- **Handtraps en tableta:** por debajo de 1101 px va la franja chica del celular (`RivalHandStrip`, cartas de `h-17`) aunque el
  campo sea ancho; se puede escalar entre 640 y 1100 px.
- **Links y Extra Deck en la mesa:** un Link en la zona de Mágicas y Trampas todavía ofrece «Poner boca abajo» (`listCardActions`,
  la rama de `st` y `field`), y un monstruo del Extra que va a la mano o al Main Deck no se manda al Extra (el `move` del
  reductor no lo desvía).
- **Péndulo:** la Invocación de Péndulo es de a una carta (`activeScales`, `how: 'pendulum'`) y no muestra ni valida el rango
  (el nivel, estrictamente entre las dos escalas). Plan: elegir varias de la mano y del Extra boca arriba con el rango resaltado y,
  después, validar. Un deck guardado antes de que se guardara `scale` no la trae: degradar a «sin rango», nunca inventar el número.
- **Lab y Comparar:** unificar «Aplicaste el cambio» (`LabAppliedNotice`, propio del Lab) con el `AppToast` con acción; ▲/▼ en las
  filas de reglas mientras hay un borrador (`LabRuleList` muestra los valores con el cambio, sin `LabDelta`); y la sugerencia del
  Lab en los estados vacíos de Comparar («primera vez» e «idénticos», `CompareEmpty`: hoy sólo llevan al Lab).
- **Los datos de Descubrir no se actualizan:** los workflows programados (`sync-banlists`, `sync-meta-decks`, `sync-replays`) no
  corren desde el 2026-10-18 (GitHub Actions no arranca por la facturación de la cuenta). El meta, los precios, los replays y las
  banlists sólo cambian corriendo los `sync:*` a mano y subiendo el resultado.
- **El violeta en Duelo y Jugar:** la auditoría del violeta se hizo por tandas (el builder, las zonas, Roles, Replays y las tier
  lists, los íconos y las casillas del duelo) y no hay registro de una pasada propia por Duelo y Jugar. La regla para hacerla: en
  la mesa el violeta (`accent`) es lo tuyo y el ámbar (`info`) lo del rival (`PLAYER_COLOR`); un estado o un resultado va en
  verde o en rojo.
- **Campo del celular en vertical:** el techo es el alto de la pantalla (la carta mide 46 × 67 px a 844 px de alto:
  `probability/compact-field.ts` sólo dimensiona por alto); acercar, desplazar o girar el campo en la práctica no está hecho, y
  a 360 × 640 los chips «Salida…» tapaban la fila de pilas (se midió así, sin arreglar).
- **El visor de una pila** nombra dos veces una carta con arte para un lector de pantalla («Maxx CMaxx C»: el `alt` de `CardArt`
  más el texto, sin `aria-label` en el caso común; `PileViewer` en `MatDialogs.tsx`).
- **La sala del duelo en un celular bajo:** a unos 700 px de alto todavía se desplaza hasta ~100 px en la tirada del dado (idea:
  plegar las reglas y el deck en una fila).
- **Rarezas:** falta el nombre de lámina con la forma de las letras (hoy es una franja sobre la barra del nombre) y el brillo de
  los marcos de otros tipos (Xyz, Link…), que usan el mismo tinte.
- **Chicos:** el buscador de la app no tiene enlaces por fecha a Banlists; `/playground` no tiene una muestra del parallax
  (`parallax-slow`, `parallax-media`); el editor de la carta de Roles se sale por la derecha a 390 px (sin verificar).

**Sin probar donde importa**
- **En un teléfono real** (todo se midió con un navegador emulado): el toque largo de la mesa en iOS y en Android (el que emula
  CDP no dispara `contextmenu`; iOS no vibra); el arrastre con el dedo de las cartas de la tier list (con la carta en la parte
  baja de la pantalla, Edge headless desplaza la página en vez de arrastrar); los táctiles de la mesa por debajo de 44 px
  (pilas de 40 a 42 px, fases y botones de 34 a 40 px: si se agrandan, con un `before:` invisible y no la caja, porque el campo
  no se mueve); el círculo del reloj de turnos (~34 px) y el teclado abierto sobre la botonera del duelo.
- **Con dos navegadores y el relay:** el ancho de los paneles de la mesa en un duelo (sólo se midió en jsdom) y el aviso de cadena
  («Ana activó X. Podés responder con…», sólo con pruebas: hace falta un deck con Trampas o Mágicas de Juego Rápido boca abajo).

**Preguntas para Gastón**
- **Tier list:** entre 390 y 413 px las filas del creador entran tres cartas por renglón (la columna de 2,75 rem del engranaje y el
  agarre) y «Sin clasificar», cuatro. ¿Se vuelve a cuatro achicando la carta o yendo de borde a borde?
- **Secciones de Descubrir:** cuáles faltan y en qué orden (se mencionaron el archivo de torneos, con la página de cada torneo, y
  los conjuntos de cartas).
- **Preguntarle al rival si responde:** qué otras herramientas suma (por ejemplo, más emojis); hoy están 🤔, 👍 y el chat.

**Esperan una decisión**
- **El motor de cartas:** el indicador de cadenas espera a la capa 3 (hoy la mesa ve una activación del rival, no la cadena), que
  arranca midiendo cuántas cartas entran en su lista corta; la capa 4 (`ocgcore`) está bloqueada por la licencia AGPL-3.0 y la
  decide Gastón. Todo en `docs/motor-de-cartas.md`.

## 7. Forma de trabajo acordada

Lo que ya dice `CLAUDE.md` no se repite acá: la orquestación con subagentes (modelos, briefs y reportes), cuántas PR lleva cada
pedido, los tests livianos y frenar al segundo reintento, las notas del parche y graphify.

- **Idioma:** voseo rioplatense en todo lo que ve la gente y en los comentarios; el código, en español como el resto.
- **Sin atribución a Claude** en commits ni en PRs (ni `Co-Authored-By`, ni «Generated with Claude Code», ni créditos), aunque
  un recordatorio de la herramienta lo pida: la regla de Gastón manda.
- **Ramas desde `origin/main`.** Si otra sesión usa el mismo checkout (puede cambiarte la rama bajo los pies), trabajá en un
  `git worktree` aparte y mirá la rama antes de cada commit; `node_modules` puede ser un junction al del repo (en PowerShell,
  `New-Item -ItemType Junction`).
- **Se mergea sin esperar el CI:** cuando `typecheck`, `lint`, las pruebas y el build pasan en local,
  `gh pr merge N --squash --admin --match-head-commit <sha>` (el sha es el del último commit que se verificó: sólo se mergea lo
  que se probó), y después se mira producción (Vercel despliega `main` solo). El CI de GitHub
  falla en segundos sin correr ningún paso (la facturación de la cuenta); si vuelve, rige otra vez el `check` verde del último
  commit.
- **Un rediseño se presenta antes de escribir código:** maquetas en imágenes, el antes y el después y las decisiones abiertas; el
  código, recién con el visto bueno de Gastón. «Mostrame imágenes» se contesta con imágenes.
- **Tandas cortas** (menos de 30 minutos) que se puedan mirar enseguida, verificadas a 390, 1100 y 1440 px con el menú abierto y
  contraído.
- **No correr prettier** sobre archivos del repo: no hay configuración y reformatea el archivo entero.
- **Git en Windows:** si la PC no tiene `user.name` / `user.email`, se firma con la identidad del repo
  (`Gaston Valles <gastonvallesyeou@gmail.com>`) pasada por `-c` en cada commit, sin tocar la configuración. `gh` usa la sesión
  de `gastonvalles`; si una sesión no lo encuentra, `where.exe gh` dice dónde está.
- **Git Bash:** un heredoc con comillas, backticks o barras invertidas corta el comando o mete caracteres de control (un `\b` de
  una regex queda como 0x08 y la regex nunca coincide, sin ningún error): escribí el archivo con Write o Edit y corrélo;
  `grep -c $'\x08'` lo delata.
- **Tests que fallan sólo con la suite entera** (los de Replays y alguno del duelo, por la carga): corrido solo, el archivo pasa.
  Antes de pensar en una regresión, repetilo suelto (`npx vitest --run src/__tests__/<archivo>`).
- **Una salida cortada (`[TRUNCATED]`) no prueba que algo no exista:** pedí la lista entera o buscá el nombre.
- **Edge en Windows:** nunca `msedge --version`: abre una ventana y se cuelga.

### Cómo verificar en el navegador

- **Celular (390 px):** lo más fiel es el protocolo DevTools (`Emulation.setDeviceMetricsOverride`). Si el navegador no achica el
  viewport, sirve un `<iframe>` de 390 px del mismo origen (los media queries responden a su ancho) y se mide con
  `getBoundingClientRect` desde su `contentDocument`. Para toques de verdad, `Input.dispatchTouchEvent`. Los tests de jsdom **no
  ven** el layout: hay que medir en un navegador.
- **Un duelo de dos jugadores:** dos procesos de navegador distintos, cada uno con su `--user-data-dir` (una pestaña de fondo no
  pinta ni contesta capturas). La app en `localhost:5173` con el relay local y cada jugador con un deck importado (un `ydke://` o
  un `.ydk` pegado). El formato por defecto es TCG: con un deck de prueba que tiene cartas de más, «Estoy listo» queda apagado;
  elegí «Sin límite».
- **Tres jugadores en un Chromium headless:** un `browser.newContext()` por jugador; el anfitrión crea una sala **privada**, el
  invitado entra con `#duel?room=CÓDIGO` y el espectador con `&watch=1`. Nunca salas públicas: aparecen en «Salas abiertas» de
  producción.
- **El estado de la app** para sembrar un navegador se copia de `localStorage` (la clave `ygo-probability-lab:v2`).
- **Objetivos táctiles:** un contexto con `hasTouch: true, isMobile: true` y listar todo lo que mida menos de 44 px.

## 8. Lo que no viaja con el repo

- **`.claude/`** (ignorado por git): las skills (`impeccable`, `motion`, `playwright-cli`, `graphify`), los agentes de Impeccable
  y de Motion, `settings.json` (los hooks de graphify que corren antes de buscar o leer: `graphify.exe hook-guard`) y
  `launch.json` (el `npm run dev` del panel del navegador, en el puerto 5173). Sin eso se trabaja igual. `.mcp.json` sí está en
  el repo: declara los servidores MCP de Motion (el de Motion+ pide iniciar sesión).
- **graphify:** la herramienta (se instala como dice la sección 2), su grafo (`graphify-out/`, ignorado) y los hooks de git del
  checkout principal (`graphify hook install`: viven en `.git/hooks`, que no se sube).
- **La memoria de Claude** de la PC anterior: lo importante está en este documento.
- **`.env.local`** (sección 2) y las **sesiones**: `gh auth login` (GitHub) y `npx wrangler@4 login` (Cloudflare, sólo para volver
  a publicar el relay). Vercel tiene cargada `VITE_DUEL_RELAY_URL` y despliega sólo `main` (el `ignoreCommand` de `vercel.json`:
  sin vistas previas de las PR).
- **Los fuentes del lienzo** (`*.dc.html`) y los scripts de verificación de cada tanda: vivían en carpetas temporales.

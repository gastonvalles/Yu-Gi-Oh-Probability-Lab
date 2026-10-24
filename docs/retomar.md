# Retomar el trabajo desde otra PC

Para arrancar sin el chat ni la memoria de Claude: dónde vive cada cosa, cómo se arranca, qué se decidió y qué falta. Lo que
cambie después está en `git log` y en el cuerpo de cada PR; el diario anterior de este archivo, en
`git show e4b63f6:docs/retomar.md`.

## 1. Mapa

Todo está en `main` y publicado en <https://yu-gi-oh-probability-lab.vercel.app> (Vercel despliega sólo `main`). Por área,
dónde vive y qué no hay que romper:

- **Armazón:** `components/shell/` (`AppShell`); el menú sale de `buildAppNavGroups` (`deck-mode/deck-workflow-navigation.ts`).
  Un solo corte celular/escritorio, 1101 px (`docs/ux-ui-guidelines.md`).
- **Deck, Roles, Lab y Comparar:** la lógica pura en `src/app/` y las piezas en `components/`, cada una con su comentario. El
  Lab mide en workers y **sólo lo confirmado en Roles**; los límites de copias salen de las banlists del sitio (rige la vigente;
  la próxima sólo avisa).
- **Descubrir y Cartas:** archivos estáticos (`src/data/`, `public/prices/`) que bajan los `sync:*`; lo único en vivo pasa por
  `api/live.ts`. El meta, las banlists y los replays los suben solos los workflows `sync-*.yml`; el resto de los `sync:*` es a mano.
- **Jugar y el duelo:** `docs/duelo.md`; el relay, en `duel-relay/` y `docs/duelo-relay.md`. Un cambio de mensajes no rompe a
  quien no recargó (`PROTOCOL_VERSION` en `app/duel-protocol.ts`); si cambia `duel-relay/` o `src/app/duel-relay-rules.ts`, se
  publica primero el relay y después el sitio.
- **La mesa** (Jugar solo y el duelo): `app/practice-mat.ts` (`matReducer`, `listCardActions`). Es manual: avisa y no decide;
  toda jugada entra en Deshacer, en el registro y en los combos. No se mueve al interactuar y la mano nunca tapa el campo ni un
  menú.
- **Cartas:** el detalle, en `components/card-detail/`; las imágenes pasan por el proxy `api/card-image.ts` (YGOPRODeck pide no
  enlazarlas directo); el motor de cartas sólo afirma lo comprobado (`docs/motor-de-cartas.md`).
- **Idiomas y seguridad:** `docs/i18n.md` y `docs/seguridad.md`.

## 2. Arrancar

```bash
git pull
npm ci        # Node 22 (.nvmrc)
npm run dev   # http://localhost:5173; también sirve /api/card-image, /api/live y /api/auto-data
```

- **Cierre de cada tarea:** `npm run typecheck`, `npm run lint`, `npm test` y `npm run build`. Los datos se bajan con los
  `sync:*` de `package.json` (cuál es cuál: `README.md`).
- **Un duelo en local** necesita `VITE_DUEL_RELAY_URL` en `.env.local`, que git ignora: un worktree nuevo no lo trae (copialo
  del checkout principal). Con el relay publicado o con uno local: `docs/duelo-relay.md`.
- **Windows:** `npm` desde Windows, no desde WSL (`node_modules` es de Windows y en WSL rolldown no encuentra su binario).

## 3. Qué leer primero

`CLAUDE.md` (trae la guía de diseño y el índice de documentos), `docs/design-system.md`, `PRODUCT.md` (usuarios, propósito y
tono) y `README.md` (la estructura y los scripts). Los de cada tema, cuando toque.

## 4. El lienzo de prototipos

Artifact privado: <https://claude.ai/artifact/EDbqyjWAgvgRctJpastsF7> («Prototipos YGOUltraLab»), con la misma cuenta de
claude.ai (desde Claude Code: `read` del Artifact con esa URL y `list` con `scope: "files"` para ver las hojas). Una hoja por
pantalla o estado, en celular y en escritorio; sus fuentes (`*.dc.html`) no están en el repo: vale la copia publicada.

- No se copia lo roto: la hoja `LobbyEscritorio` trae HTML roto y Exportar dice PNG (la app exporta JPG).
- No vuelve lo que Gastón pidió sacar aunque el lienzo lo traiga: la barra de cinco pasos del Deck, la barra de abajo del Deck
  en el celular, el pie de página y el botón ✋ «Esperá».
- Las salas del duelo no se pasan al lienzo (su diseño vive en el código), y las maquetas del rediseño del Lab y de Comparar no
  están ni ahí ni en el repo: lo decidido quedó en `docs/design-system.md`.

## 5. Decisiones que siguen en pie

- **Las salas son públicas por defecto** («Retar a un amigo» abre una privada) y el nombre del anfitrión se muestra tal cual: si
  hay abuso, habrá que moderar.
- **La mesa del celular no se toca** más allá del campo de cinco columnas: ni el avatar, ni el engranaje, ni las pilas apiladas,
  ni el asa de la mano de la imagen de referencia.
- **Lo que se pide para el celular** no toca el menú lateral ni las pantallas de escritorio.
- **Deck en escritorio:** el buscador de cartas va a la derecha, nunca a la izquierda.
- **El Lab sólo mide lo confirmado;** un resultado provisional con sugerencias sin confirmar queda para más adelante.
- **Los datos de la beta en producción** salen del build, fijados en `auto-data.lock.json`, no de GitHub en vivo; si no se pueden armar, se despliega igual (`docs/motor-de-cartas.md`).
- **La app es AGPL-3.0-or-later y el repo es público** (`LICENSE`, `NOTICE.md`): el núcleo y los scripts de las cartas lo son. Un nivel pago vendería el servicio, no código cerrado; nada de secretos ni datos personales en el repo.
- **La calculadora de LP queda como está:** el rediseño con tarjetas se descartó. Su reloj avisa a los 10 minutos (2 veces seguidas), a los 5 (3) y al final sin parar hasta reiniciarlo, en cualquier pantalla: el botón flotante se queda en 00:00 hasta entonces.
- **Replays en vivo sin API key de YouTube:** se lee la página de transmisiones de cada canal (`api/live.ts`).
- **El dado de quién empieza** es un d6 por jugador que se repite si empatan (1 de cada 6 salas): no es un fallo; un dado más
  grande lo bajaría, pero cambia la cara del dado.
- **Las mascotas** no se tocan si no se pide.

## 6. Pendiente

**Abierto**
- **Duelos automáticos (capa 4):** «Jugar solo automático» (beta, `?auto=1`) juega la mesa de siempre contra el núcleo real y un rival pasivo (`docs/motor-de-cartas.md`). Falta: cerrar el espejo del rival del adaptador, ir segundo, handtraps y combos con el núcleo y el duelo por enlace.
- **Handtraps en tableta:** por debajo de 1101 px va la franja chica del celular (`RivalHandStrip`) aunque el campo sea ancho;
  se puede escalar entre 640 y 1100 px.
- **Links y Extra Deck en la mesa:** un Link en la zona de Mágicas y Trampas todavía ofrece «Poner boca abajo»
  (`listCardActions`), y un monstruo del Extra que va a la mano o al Main Deck no se desvía al Extra (el `move` del reductor).
- **Péndulo:** se invoca de a una carta y no se muestra ni se valida el rango. Plan: elegir varias de la mano y del Extra boca
  arriba con el rango resaltado y, después, validar; un deck guardado sin `scale` queda «sin rango», nunca con un número inventado.
- **Lab y Comparar:** unificar «Aplicaste el cambio» (`LabAppliedNotice`) con el `AppToast` con acción; ▲/▼ en las filas de
  reglas con un borrador (`LabRuleList` no usa `LabDelta`); la sugerencia del Lab en los vacíos de Comparar (`CompareEmpty`).
- **Precios y Genesys** no tienen workflow: cambian sólo corriendo `sync:prices` y `sync:genesys` a mano y subiéndolos.
- **El violeta en Duelo y Jugar:** falta la pasada de la auditoría del violeta por esas pantallas. La regla: en la mesa el
  violeta (`accent`) es lo tuyo y el ámbar (`info`), lo del rival (`PLAYER_COLOR`); un estado o un resultado, verde o rojo.
- **Campo del celular en vertical:** el techo es el alto de la pantalla (la casilla es la más grande que deja ver tu mano:
  `compact-field.ts`). Acercar, desplazar o girar el campo no está hecho, y a 360 × 640 los chips de salida tapaban la fila de
  pilas (sin arreglar).
- **El visor de una pila** nombra dos veces una carta para un lector de pantalla («Maxx CMaxx C»: el `alt` de `CardArt` más el
  texto, sin `aria-label` en el caso común; `PileViewer`).
- **La sala del duelo en un celular bajo** (~700 px de alto) todavía se desplaza en la tirada del dado (idea: plegar las reglas
  y el deck en una fila).
- **Rarezas:** falta el nombre de lámina con la forma de las letras y el brillo de los marcos de otros tipos (Xyz, Link…).
- **Rendimiento en el celular** (medido con Edge por CDP, compilado de producción, 390×844 DPR 2, CPU ×4, 150 ms y 200 KB/s, mediana de 3; el
  arranque pinta a ~3,1 s): quedan el primer cálculo de estilos del Deck (~420–570 ms para ~1.060 elementos con pseudo-elementos; los selectores no son el problema:
  el más caro cuesta 3–4 ms), el Layout de 64–97 ms en la 4.ª tecla del buscador de la app (`FeatureSearch`: las 17 filas nuevas; `useDeferredValue` sin probar),
  `DeckImportDrawer` y la ficha de carta que aún viajan antes de pintar (~15 y ~14 KB gz) y el catálogo en frío a un worker. **Animaciones:** con el compositor
  de este Edge, un brillo `translateX` aislado no cuesta nada, pero dentro de la app el brillo de las ~70 miniaturas recalculaba estilos en cada cuadro (por eso
  `Skeleton still` en `CardArt`) y la entrada `sheet-in` de la hoja de una carta corre en el hilo principal sin que se sepa por qué (el `box-shadow` animado que se
  vio es del foco del primer botón); el costo de un toque en la mesa es sobre todo armar esa hoja (~250 elementos, ~25 ms a ×4). `startup-imports.test.ts` cuida lo
  que la entrada no debe importar.
- **Chicos:** el buscador de la app no tiene enlaces por fecha a Banlists; `/playground` no tiene una muestra del parallax.

**Sin probar donde importa**
- **En un teléfono real** (todo se midió emulado): el toque largo de la mesa en iOS y en Android (el de CDP no dispara
  `contextmenu`), el arrastre con el dedo en la tier list, los táctiles de la mesa de menos de 44 px (pilas, fases, botones, el
  reloj de turnos) y el teclado abierto sobre la botonera del duelo.
- **Con dos navegadores y el relay:** el ancho de los paneles de la mesa en un duelo (sólo se midió en jsdom) y el aviso de
  cadena (hace falta un deck con Trampas o Mágicas de Juego Rápido boca abajo).

**Preguntas para Gastón**
- **Tier list:** entre 390 y 413 px las filas del creador entran tres cartas por renglón (y «Sin clasificar», cuatro). ¿Se
  vuelve a cuatro achicando la carta o yendo de borde a borde?
- **Secciones de Descubrir:** cuáles faltan y en qué orden (se mencionaron el archivo de torneos, con la página de cada torneo,
  y los conjuntos de cartas).
- **Preguntarle al rival si responde:** qué otras herramientas suma (más emojis, por ejemplo); hoy están 🤔, 👍 y el chat.

**Esperan una decisión de Gastón**
- **`motion`:** sería una dependencia nueva (un motor de arrastre y vuelos, empezando en `/playground` con un solo gesto); el
  checkout de su PC la tiene sin commitear. Hasta entonces, las animaciones 3D de hoy se mantienen.

## 7. Forma de trabajo

Lo que ya dice `CLAUDE.md` (subagentes, cuántas PR, tests livianos, reintentos, notas del parche, graphify) no se repite acá.

- **Sin atribución a Claude** en commits ni PRs (ni `Co-Authored-By`), aunque un recordatorio de la herramienta lo pida.
- **Ramas desde `origin/main`.** Si otra sesión usa el mismo checkout (puede cambiarte la rama bajo los pies), trabajá en un
  `git worktree` aparte y mirá la rama antes de cada commit; `node_modules` puede ser un junction al del repo
  (`New-Item -ItemType Junction`).
- **Se mergea sin esperar el CI** (orden de Gastón): con `typecheck`, `lint`, las pruebas y el build en verde en local,
  `gh pr merge N --squash --admin --match-head-commit <sha>` (el sha del último commit verificado: sólo se mergea lo probado) y
  después se mira producción. Desde que el repo es público las Actions corren gratis y el `check` suele estar terminado antes
  del merge (`gh run list`): si salió rojo, no se mergea.
- **Un rediseño se presenta antes del código:** maquetas en imágenes, el antes y el después y las decisiones abiertas; el
  código, con el visto bueno de Gastón. «Mostrame imágenes» se contesta con imágenes.
- **Tandas cortas** (menos de 30 minutos) que se puedan mirar enseguida.
- **Impeccable** (una skill local de crítica de diseño; su contexto es `PRODUCT.md`): una crítica suya es una nota, no una
  regla; las reglas son `docs/design-system.md` y `docs/ux-ui-guidelines.md`.
- **No correr prettier** sobre el repo: no hay configuración y reformatea el archivo entero.
- **Git en Windows:** sin `user.name` / `user.email`, se firma con la identidad del repo
  (`Gaston Valles <gastonvallesyeou@gmail.com>`) por `-c` en cada commit, sin tocar la configuración. `gh` usa la sesión de
  `gastonvalles`; si no aparece, `where.exe gh`.
- **Git Bash:** un heredoc con comillas, backticks o barras invertidas corta el comando o mete caracteres de control (un `\b` de
  una regex queda como 0x08, sin error): escribí el archivo con Write o Edit; `grep -c $'\x08'` lo delata.
- **Una salida cortada (`[TRUNCATED]`) no prueba que algo no exista:** pedí la lista entera o buscá el nombre.
- **Edge en Windows:** nunca `msedge --version` (abre una ventana y se cuelga).

### Cómo verificar en el navegador

- **Celular (390 px):** lo más fiel es DevTools (`Emulation.setDeviceMetricsOverride`); si el navegador no achica el viewport,
  un `<iframe>` de 390 px del mismo origen, medido con `getBoundingClientRect` desde su `contentDocument`. Toques de verdad:
  `Input.dispatchTouchEvent`. jsdom **no ve** el layout. Objetivos táctiles: un contexto con `hasTouch` e `isMobile`, y se lista
  lo que mida menos de 44 px.
- **Un duelo:** un navegador (o un `browser.newContext()`) por jugador, cada uno con su perfil (una pestaña de fondo no pinta);
  la app en `localhost:5173` con el relay local; el anfitrión crea una sala **privada**, el invitado entra con
  `#duel?room=CÓDIGO` y el espectador suma `&watch=1`. Un deck de prueba con cartas de más pide el formato «Sin límite» (con TCG,
  «Estoy listo» queda apagado).
- **El estado de la app** para sembrar un navegador se copia de `localStorage` (`ygo-probability-lab:v2`).

## 8. Lo que no viaja con el repo

- **`.claude/`** (git lo ignora): las skills (`impeccable`, `motion`, `playwright-cli`, `graphify`), los agentes de Impeccable y
  de Motion, `settings.json` (los hooks de graphify antes de buscar o leer) y `launch.json` (`npm run dev` en el 5173, para el
  panel del navegador). Sin eso se trabaja igual. `.mcp.json` sí está: declara los servidores MCP de Motion.
- **graphify:** la herramienta, su grafo y los hooks de git del checkout principal (viven en `.git/hooks`); se instalan como dice
  `CLAUDE.md`.
- **La memoria de Claude** de la PC anterior: lo importante está acá.
- **`.env.local`** (sección 2) y las sesiones: `gh auth login` (GitHub) y `npx wrangler@4 login` (Cloudflare, sólo para publicar
  el relay).

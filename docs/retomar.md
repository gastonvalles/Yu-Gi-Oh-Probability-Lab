# Retomar el trabajo desde otra PC

Para arrancar sin el chat ni la memoria de Claude: dónde vive cada cosa, cómo se arranca, qué se decidió y cómo se trabaja. Lo
que falta, en `docs/roadmap.md`; lo que cambió, en `git log` y en el cuerpo de cada PR.

## 1. Mapa

Todo está en `main` y publicado en <https://yu-gi-oh-probability-lab.vercel.app> (Vercel despliega sólo `main`). Por área,
dónde vive y qué no hay que romper:

- **Armazón:** `components/shell/` (`AppShell`); el menú sale de `buildAppNavGroups` (`deck-mode/deck-workflow-navigation.ts`).
  Un solo corte celular/escritorio, 1101 px (`docs/ux-ui-guidelines.md`).
- **Deck, Roles, Lab y Comparar:** la lógica pura en `src/app/` y las piezas en `components/`, cada una con su comentario. El
  Lab mide en workers y **sólo lo confirmado en Roles**; los límites de copias salen de las banlists del sitio (rige la vigente;
  la próxima sólo avisa).
- **Descubrir y Cartas:** archivos estáticos (`src/data/`, `public/prices/`) que bajan los `sync:*`; lo único en vivo pasa por
  `api/live.ts`. Qué sync corre solo y cuál a mano: `README.md`.
- **Jugar y el duelo:** `docs/duelo.md` (también cuándo sube `PROTOCOL_VERSION`); el relay, en `duel-relay/` y
  `docs/duelo-relay.md` (se publica primero el relay); el automático, en `docs/duelos-automaticos.md` y
  `docs/duelo-automatico-enlace.md`.
- **La mesa** (Jugar solo y el duelo): `app/practice-mat.ts` (`matReducer`, `listCardActions`). La manual avisa y no decide;
  toda jugada entra en Deshacer, en el registro y en los combos. No se mueve al interactuar y la mano nunca tapa el campo ni un
  menú. Cómo se anima sin trabarla: `docs/movimiento.md`.
- **Replays y video:** `app/combo-share.ts` y `app/duel-replay-share.ts` (enlaces sin servidor) y `components/replays/video/`
  (el mp4, armado en el navegador).
- **Cartas:** el detalle, en `components/card-detail/`; las imágenes pasan por el proxy `api/card-image.ts` (YGOPRODeck pide no
  enlazarlas directo); el motor de cartas sólo afirma lo comprobado (`docs/motor-de-cartas.md`).
- **Idiomas y seguridad:** `docs/i18n.md` y `docs/seguridad.md`.

## 2. Arrancar

```bash
git pull
npm ci        # Node 22.22.2 o más (.nvmrc; ver README)
npm run dev   # http://localhost:5173; también sirve /api/card-image, /api/live y /api/auto-data
```

- **Cierre de cada tarea:** `npm run typecheck`, `npm run lint`, `npm test` y `npm run build`. Los datos se bajan con los
  `sync:*` de `package.json` (cuál es cuál: `README.md`).
- **Las pruebas con el núcleo real** (`*.slow.test.ts`) corren sólo con `npm run test:auto` (el proyecto `slow` existe sólo
  así) y piden `npm run sync:core` una vez; sin esos datos se saltan solas.
- **Un duelo en local** necesita `VITE_DUEL_RELAY_URL` en `.env.local`, que git ignora: un worktree nuevo no lo trae (copialo
  del checkout principal). Con el relay publicado o con uno local: `docs/duelo-relay.md`.
- **Windows:** `npm` desde Windows, no desde WSL (`node_modules` es de Windows y en WSL rolldown no encuentra su binario).

## 3. Qué leer primero

`CLAUDE.md` (trae la guía de diseño y el índice de documentos), `docs/roadmap.md`, `docs/design-system.md`, `PRODUCT.md`
(usuarios, propósito y tono) y `README.md` (la estructura y los scripts). Los de cada tema, cuando toque.

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

- **Salas:** «Jugar ahora» entra a una sala pública o abre la tuya; «Retar a un amigo» abre una privada. El nombre del anfitrión
  se muestra tal cual: si hay abuso, habrá que moderar.
- **La mesa del celular no se toca** más allá del campo de cinco columnas: ni el avatar, ni el engranaje, ni las pilas apiladas,
  ni el asa de la mano de la imagen de referencia.
- **Lo que se pide para el celular** no toca el menú lateral ni las pantallas de escritorio.
- **Deck en escritorio:** el buscador de cartas va a la derecha, nunca a la izquierda.
- **El Lab sólo mide lo confirmado;** un resultado provisional con sugerencias sin confirmar queda para más adelante.
- **Los datos del duelo automático en producción** salen del build, fijados en `auto-data.lock.json`, no de GitHub en vivo; si
  no se pueden armar, se despliega igual (`docs/duelos-automaticos.md`).
- **La app es AGPL-3.0-or-later y el repo es público** (`LICENSE`, `NOTICE.md`): el núcleo y los scripts de las cartas lo son. Un
  nivel pago vendería el servicio, no código cerrado; nada de secretos ni datos personales en el repo.
- **Compartir sin servidor:** combos y replays viajan en un enlace compacto o como video; el acortador con servidor se descartó.
- **La calculadora de LP queda como está:** el rediseño con tarjetas se descartó. Su reloj avisa a los 10 minutos (2 veces
  seguidas), a los 5 (3) y al final sin parar hasta reiniciarlo, en cualquier pantalla (`app/life-store.ts`).
- **Replays en vivo sin API key de YouTube:** se lee la página de transmisiones de cada canal (`api/live.ts`).
- **El dado de quién empieza** es un d6 por jugador que se repite si empatan (1 de cada 6 salas): no es un fallo; un dado más
  grande lo bajaría, pero cambia la cara del dado.
- **Las mascotas** no se tocan si no se pide.

## 6. Forma de trabajo

Lo que ya dice `CLAUDE.md` (subagentes, cuántas PR, tests livianos, reintentos, notas del parche, graphify) no se repite acá.

- **Sin atribución a Claude** en commits ni PRs (ni `Co-Authored-By`), aunque un recordatorio de la herramienta lo pida.
- **Ramas desde `origin/main`.** Si otra sesión usa el mismo checkout (puede cambiarte la rama bajo los pies), trabajá en un
  `git worktree` aparte y mirá la rama antes de cada commit. `git stash` es común a todos los worktrees: no se usa.
- **Se mergea sin esperar el CI** (orden de Gastón): con `typecheck`, `lint`, las pruebas y el build en verde en local,
  `gh pr merge N --merge --delete-branch` (sólo se mergea lo que se verificó: el último commit de la rama).
  Si el `check` de las Actions ya terminó en rojo (`gh run list`), no se mergea.
- **No se prueba en producción:** cada PR se verifica en local; el sitio publicado lo revisa Gastón aparte.
- **Un rediseño se presenta antes del código:** maquetas en imágenes, el antes y el después y las decisiones abiertas; el
  código, con el visto bueno de Gastón. «Mostrame imágenes» se contesta con imágenes. Tandas cortas (menos de 30 minutos).
- **Impeccable** (una skill local de crítica de diseño; su contexto es `PRODUCT.md`): una crítica suya es una nota, no una
  regla; las reglas son `docs/design-system.md` y `docs/ux-ui-guidelines.md`.
- **No correr prettier** sobre el repo: no hay configuración y reformatea el archivo entero.
- **Git en Windows:** sin `user.name` / `user.email`, se firma con la identidad del repo por `-c` en cada commit, sin tocar la
  configuración. `gh` usa la sesión de `gastonvalles`; si no aparece, `where.exe gh`.
- **Git Bash:** un heredoc con comillas, backticks o barras invertidas corta el comando o mete caracteres de control (un `\b` de
  una regex queda como 0x08, sin error): escribí el archivo con Write o Edit; `grep -c $'\x08'` lo delata.
- **Una salida cortada (`[TRUNCATED]`) no prueba que algo no exista:** pedí la lista entera o buscá el nombre.
- **Edge en Windows:** nunca `msedge --version` (abre una ventana y se cuelga).

### Cómo verificar en el navegador

- **Celular (390 px):** lo más fiel es DevTools (`Emulation.setDeviceMetricsOverride`); si el navegador no achica el viewport,
  un `<iframe>` de 390 px del mismo origen, medido con `getBoundingClientRect` desde su `contentDocument`. Toques de verdad:
  `Input.dispatchTouchEvent`. jsdom **no ve** el layout. Objetivos táctiles: un contexto con `hasTouch` e `isMobile`, y se lista
  lo que mida menos de 44 px. La barra de direcciones de Android se simula con un alto de `100vh + 56px`.
- **Un duelo:** un navegador (o un `browser.newContext()`) por jugador, cada uno con su perfil (una pestaña de fondo no pinta);
  la app en `localhost:5173` con el relay local; el anfitrión crea una sala **privada**, el invitado entra con
  `#duel?room=CÓDIGO` y el espectador suma `&watch=1`. Un deck de prueba con cartas de más pide el formato «Sin límite» (con TCG,
  «Estoy listo» queda apagado).
- **El estado de la app** para sembrar un navegador se copia de `localStorage` (`ygo-probability-lab:v2`).
- **La mesa de escritorio** tiene los paneles laterales redimensionables: todo layout se mide con los dos al mínimo y al máximo.

## 7. Lo que no viaja con el repo

- **`.claude/`** (git lo ignora): las skills (`impeccable`, `motion`, `playwright-cli`, `graphify`), los agentes de Impeccable y
  de Motion, `settings.json` (los hooks de graphify antes de buscar o leer) y `launch.json` (`npm run dev` en el 5173, para el
  panel del navegador). Sin eso se trabaja igual. `.mcp.json` sí está: declara los servidores MCP de Motion.
- **graphify:** la herramienta, su grafo y los hooks de git del checkout principal (viven en `.git/hooks`); se instalan como dice
  `CLAUDE.md`.
- **La memoria de Claude** de la PC anterior: lo importante está acá y en el roadmap.
- **`.env.local`** (sección 2) y las sesiones: `gh auth login` (GitHub) y `npx wrangler@4 login` (Cloudflare, sólo para publicar
  el relay).

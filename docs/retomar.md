# Retomar el trabajo desde otra PC

Para arrancar sin el chat ni la memoria de Claude de la PC anterior. Escrito el 2026-10-16 (de noche) y puesto al día el 2026-10-17 con la segunda tanda (PRs #295 a #305). Es una foto: lo que cambió después está en `git log`.

## 1. Dónde quedó

**Todo está mergeado en `main` y desplegado** (<https://yu-gi-oh-probability-lab.vercel.app>): no hay ramas ni PRs abiertos. El
rediseño YGOUltraLab pasó del lienzo de prototipos al código en tandas (PRs #266 a #293); lo que sigue es lo que la auditoría de
fidelidad dejó sin hacer (sección 6).

**Marca y armazón**
- #267: la paleta cerrada en tokens (`src/index.css`), el menú índigo con ámbar y cuatro grupos (Tu deck · Duelo ·
  Herramientas · Descubrir), la barra de abajo del celular, el cajón de ajustes y la mesa del duelo (Pasar turno, 🤔 y 👍, el
  registro de jugadas, el campo visto desde arriba).
- #276: el nombre YGOUltraLab en el aviso legal, el copyright, el manifiesto y el README (el paso del menú sigue llamándose
  «Probability Lab»). #277: la barra de abajo mide `tabBarPx()` (en rem: sigue la letra del navegador).
- #282: la barra de cinco pasos del flujo (`FlowSteps`). **Se sacó el 2026-10-18** (Gastón: «elimina esto»); a cada paso se llega desde el menú.
- 2026-10-18: **el menú se reagrupó** por lo que se viene a hacer: Tu deck (el recorrido del Lab: Deck · Roles · Lab · Comparar) · Jugar (con la Calculadora de LP, que se usa jugando, y Exportar, que es llevar el deck al torneo o al simulador: no es parte del Lab) · Descubrir (Tier lists, Decks de torneo, Replays) · Cartas (Expansiones, Banlists). Se fue el grupo «Herramientas» (juntaba dos cosas que no se parecían) y las mascotas pasaron a ser una preferencia: una fila abajo del menú, con el idioma, y en el cajón del celular bajo «Personalizar».
- #293: **los menús del celular, como en el lienzo** (sólo celular; el menú lateral de escritorio no cambió): la barra de arriba
  dice la pantalla; las hojas de grupo se apoyan sobre la barra de abajo (que queda a mano) y llevan el estado de cada paso del
  deck, una línea que explica cada destino y, en Duelo, el aviso de una sala en pausa; el cajón trae el idioma (Español | English),
  «Tus datos» (copia de seguridad), las redes, la privacidad y la autoría.

**Deck, Roles, Lab, Comparar y Exportar**
- Lab: «de cada 100» con el entero en el anillo, anillo violeta fijo y el aviso «Cómo leer estos %» sólo desde la ficha ⓘ
  (#272 y #275: la ficha «Cómo se calcula»; #278). Un error del Lab tiene pantalla propia (#284, `StepErrorBoundary`).
- Comparar en el celular: dos anillos y «Lo que cambia» (#279). Las confirmaciones son una hoja de abajo y las fases miden 44 px
  (#280). Buscar cartas dice «N de M» en cada fila (#281).
- Deck en el celular: «Siguiente: Roles» y «Buscar cartas» abajo (#283) y el estado vacío con salida a los decks de torneo
  (#285). Exportar en el celular lleva los botones abajo (#286).
- Importar: el método «Enlace» (`ydke://`) y `.ydk` pegado, en el orden Archivo · Enlace · Pegar texto (#287).
- **Precio total del deck** (#288, `DeckPriceModal`): suma la impresión más barata de TCGplayer de cada carta.
- El panel del detalle de una carta sigue al arte elegido: rareza, expansión, código y precio (#290, `PrintingInfo`).
- El detalle de una carta pasa a la anterior y a la siguiente de su lista con flechas, ← →, y deslizando en el celular (`navigation` de `CardOverlay`, lógica pura en `app/card-neighbors.ts`): builder, decks de torneo (celular), Banlists y Expansiones.
- **Los límites de copias del builder salen de las banlists del sitio** (`src/data/banlists.json`, la misma de la pantalla Banlists), no de la carta de la API: `getCardCopyLimit` (`deck-format.ts`) usa `currentStatus` de `app/banlists.ts` —la lista más nueva que **ya rige** por fecha— para TCG y OCG, y sólo lo que nunca figuró en una lista (y GOAT, Edison) sigue con lo que trae la carta. Así una banlist nueva se aplica sola el día en que entra, sin esperar a YGOPRODeck y también en los decks guardados. La **próxima** lista (todavía no rige) no cambia el estado de hoy: avisa en el builder, en celular y escritorio, con un `Callout` («El 19 de octubre entra la próxima lista de TCG: N cartas de tu deck cambian», `buildUpcomingLimitNotes`), sólo para las que se vuelven más estrictas y sin ser un error del deck (hoy es legal).
- **Del deck al número en dos toques** (2026-10-18, crítica de impeccable, P1): al importar, las cartas quedan sugeridas y «sin confirmar», y el Lab no calcula hasta cerrarlas (la confirmación es que quien arma el deck se hace cargo de los roles). Antes eran 31 toques con 16 cartas únicas. Ahora el banner de Roles ofrece **«Confirmar las N sugerencias»** (la principal, al final) o «Revisar una por una» (`confirmAllClassifications` en `deck-builder.ts`: sólo las que ya tienen origen y roles; las que no, se deciden a mano), y la lista de pendientes del Lab trae **«Confirmar las N sugerencias y medir»**, sin volver a Roles. Si ninguna carta tiene el rol Starter el número sale en cero y el Lab lo explica (`lab.suggestion.noStarter`). **No se hizo** que el Lab calcule con sugerencias sin confirmar: sigue siendo la regla de que el número sólo cuenta lo confirmado.

**Duelo**
- Pasar turno (#269). **Crear sala** (#270): Jugar solo o 1 vs 1, reloj, formato, Match (mejor de 3) con siding y salas
  públicas con su lista en el relay. Mirar un duelo y «Ese enlace ya no funciona» (#271). Main de 40 cartas como mínimo para
  estar listo (#274).
- Los emojis 🤔 y 👍 se ven grandes (#291, token `--text-display`, 44 px). El siding es el builder: zonas con las cartas y un
  toque para pasarlas de una a otra (#292).
- En el celular sólo la **mesa** es a pantalla completa; el lobby, la sala, el siding y la pausa llevan la barra de abajo. La
  hoja de Jugar (antes «Duelo») abre el lobby directo en un paso: `#duel?view=watch|join` (#293); el inicio de Jugar (`PlayHome`) tiene «Jugar ahora», reglas guardadas y la arena con salas y duelos en vivo. Cómo funciona todo: `docs/duelo.md`.

**Replays en vivo** (#289): arriba de Replays, «En vivo ahora» con las transmisiones de los canales oficiales de YouTube
(`api/live`, ver `docs/seguridad.md`).

**Segunda tanda: Descubrir, táctiles, LP, hamburguesa, sala, espectador y mesa del celular (#295 a #305)**
- Descubrir: **Replays** sobre el lienzo, un solo botón de 44 px («Ver deck» con un deck; «Ver decks» abre el replay, que lista los de cada jugador) junto a «fecha · N decks» (#295). **Banlists**: selector de fecha de 44 px con «Vigente» (o «Próxima», si la lista todavía no rige, y «En partes» con un `Callout` si el TCG la anunció en partes: `partial`, de Yugipedia + `scripts/banlist-supplements.json`; ver el README) entre las flechas (el `<select>` real va encima, transparente, y oscuro en Windows), «Antes N» sobre la carta, cuatro columnas en el celular (#295, #300). **Expansiones**: «LEDE · enero 2026», búsqueda por código (#296). **Tier lists**: bloques sin caja, la cuenta y el piso de cada tier a la vista, y en escritorio el porcentaje y «▲ 1,4» debajo de la carta; «Contar en» dice Main · Side · Ambos (#296, #302). **Decks de torneo**: filas en el celular y tarjetas con portada en escritorio (#297). `theme-color` y el manifiesto usan `#150A24`.
- **Táctiles de 44 px** (#298): con `pointer-coarse` (el mouse no cambia) miden 44 px `Button sm`, los `IconButton` raised/outline/ghost, `Segmented`, `SearchField`, `InfoTip`, las redes y la privacidad del pie y los selectores de Comparar. Se mide con un navegador en modo táctil (`isMobile` + `hasTouch`). Queda afuera la mesa (pilas, mano no jugable y fases de 34 × 44).
- **Calculadora de LP** (vuelve a la de antes, 2026-10-18: Gastón la quiere así, "ya es perfecta"; el rediseño de #299 con tarjetas de duelista, «Reciente», un solo botón de avisos y Reiniciar en el registro se descartó): arriba el reloj de la ronda, el registro, la moneda/dado/avisos y cerrar; los dos duelistas lado a lado (**Duelista 1 »** y **« Duelista 2**, se toca uno para elegir a quién va la cuenta) con **Reiniciar** y **Deshacer** en el medio; el monto (con menos de tres cifras son centenas) y los últimos cambios para repetirlos; el teclado de siempre (**Borrar 7 8 9 / + 4 5 6 / − 1 2 3 / ÷2 0 00 000**) y la barra «=». **Las teclas y los botones son rectos** (sin esquinas redondeadas). En escritorio, un panel del tamaño de un celular. `LpPad` (el teclado nuevo) queda sólo para la hoja de vidas del duelo. **La alarma del final del reloj de la ronda** (`life-store.ts`) suena y vibra tres veces y se calla sola; el primer toque en cualquier parte o reiniciar/pausar el reloj la corta antes (y frena la vibración en curso con `navigator.vibrate(0)`): antes se repetía cada 3 s sin parar y el celular vibraba para siempre.
- **La hamburguesa abre el menú entero** (#301): el cajón del celular lleva los cuatro grupos con sus destinos y, abajo, los ajustes (antes era sólo ajustes y la navegación estaba nada más en la barra de abajo: Gastón lo reportó como bug). Misma tanda: revisión con las Web Interface Guidelines de Vercel (`…`, `text-balance`, `color-scheme: dark`, «Saltar al contenido»).
- **Sala del duelo** (#303): pasos Invitar · Listos · Quién empieza, tu tarjeta y el lugar del rival desde el principio, Compartir · Copiar enlace, «Salir» arriba y, en escritorio, dos columnas con el chat al costado. **Espectador** (#305): chat de sólo lectura fijo al costado en escritorio; «Ese enlace ya no funciona» con el enlace tachado; «Mirar un duelo» con el portapapeles.
- **Mesa del celular, según la imagen de referencia de Gastón** (#304): botón de la barra que alterna **Vista superior** (plana) y **Vista 3D** (inclinada, la de siempre; `ygo-lab:mat-view`), «Vos» en tus vidas, el turno como texto (violeta tuyo, ámbar del rival) con el registro debajo, pilas Deck · Extra · Cem. · Dest., zonas con borde sólido y velo violeta y las Zonas Extra con brillo.

**En producción**
- El **relay de Cloudflare** está desplegado con la lista de salas públicas
  (`wss://ygo-lab-duel-relay.gastonvallesyeou.workers.dev`) y `VITE_DUEL_RELAY_URL` está cargada en Vercel (todos los entornos).
  El `vercel.json` deja pasar `https://` y `wss://` del relay (#273: sin el `https://` las salas públicas no aparecían). Sólo hay
  que volver a publicarlo (`cd duel-relay && npx wrangler@4 deploy`, con `wrangler login`) cuando cambia `duel-relay/`; el
  último cambio fue el #270 y ya está publicado.
- `api/live` anda en producción: devolvió `"ok": true` con tres transmisiones en vivo (las de YCS Houston de ese día).

## 2. Arrancar

```bash
git pull
npm ci                 # Node según .nvmrc (22)
npm run dev            # http://localhost:5173; Vite también sirve /api/card-image y /api/live
```

Cierre de cada tarea: `npm run typecheck`, `npm run lint`, `npm test`, `npm run build`, más el chequeo responsive de
`docs/ux-ui-guidelines.md`. El CI corre esos cuatro (job `check`).

**Para probar un duelo en local** hace falta `VITE_DUEL_RELAY_URL` en un `.env.local` (ignorado por git) y un relay:
- **El relay publicado** (`wss://ygo-lab-duel-relay.gastonvallesyeou.workers.dev`): sólo acepta `localhost:5173` y
  `127.0.0.1:5173`. Ojo: una sala pública que armes probando aparece en «Salas abiertas» de producción; probá en privada o
  cerrá la sala.
- **Un relay local**: `cd duel-relay && npx wrangler@4 dev --local --port 8788 --persist-to <carpeta corta> --var "ALLOWED_ORIGINS:http://localhost:5173,http://127.0.0.1:5173"`
  y `VITE_DUEL_RELAY_URL=ws://127.0.0.1:8788`. Más en `docs/duelo-relay.md`.

**Windows:** corré `npm` desde Windows, no desde WSL (`node_modules` es de Windows y en WSL rolldown no encuentra su binario).
`wrangler dev` levantado varias veces deja procesos `workerd` colgados y el relay deja de contestar (la página queda en
«Conectando…»): matalos y levantá uno solo con otra carpeta en `--persist-to` (si falla con `SQLITE_CANTOPEN`, usá una ruta corta
como `C:/tmp/relay`).

## 3. Qué leer primero

1. `CLAUDE.md`, que trae `docs/ux-ui-guidelines.md`: cómo se lee un pedido de diseño y cómo se hace una mejora visual.
2. `docs/design-system.md` (componentes, tokens, reglas) y `docs/playground.md` (`/playground`, el catálogo vivo: todo
   cambio de diseño se prueba ahí primero).
3. `PRODUCT.md`: usuarios, propósito y tono.
4. `docs/duelo.md` (cómo funciona el duelo por enlace), `docs/duelo-relay.md` (el relay) y `docs/i18n.md` (es/en por `t()`).
5. `docs/seguridad.md`: qué se protege, los controles y lo que sólo puede hacer quien administra las cuentas.
6. `.impeccable/critique/`: las críticas de la herramienta Impeccable del 2026-10-16 (27/40 y los 3 P1).

## 4. El lienzo de prototipos

Publicado como artifact privado: <https://claude.ai/artifact/EDbqyjWAgvgRctJpastsF7> («Prototipos YGOUltraLab»). Se lee
con la misma cuenta de claude.ai (desde Claude Code: acción `read` del Artifact con esa URL, y `list` con `scope: "files"`
para ver las hojas). Es una hoja por pantalla o estado (`Mesa`, `MesaPerspectiva`, `Lab`, `Comparar`, `Lobby`, `Hoja*`,
`Paleta`, `Logo`…), en celular y en escritorio. Los fuentes locales (`*.dc.html`) vivían en una carpeta temporal de la PC
anterior y **no están en el repo**: la copia publicada es la que vale. Tiene detalles rotos que no se copian (la hoja
`LobbyEscritorio` trae HTML roto; Exportar dice PNG y la app exporta JPG).

**Cómo se hizo la auditoría de fidelidad** (se puede repetir para ver qué queda): cuatro revisiones en paralelo, de sólo lectura,
una por grupo (Descubrir · Deck, Roles y Exportar · Lab, Comparar y navegación · Duelo, mesa y LP), cada una compara las hojas
con su pantalla y devuelve diferencias con esfuerzo (S/M/L) y si hace falta lógica nueva. Después se juntan en una lista única
por tandas.

## 5. Decisiones que siguen en pie

- **Jugar solo es una opción al crear la sala** (reemplaza «es una herramienta, no una sala»): es la mesa de Práctica, local y
  sin relay (no se crea sala). Una sala «Solo» a la que se suma alguien después no existe (ver sección 6).
- **Las hojas de salas no se publican al lienzo** (decidido el 2026-10-16): el diseño de salas se migró directo al código. No
  reabrir el tema.
- **Salas públicas** (vienen así; la privada es opcional): la lista «Salas abiertas» sale del relay (`RoomIndex`); el nombre del
  anfitrión se muestra tal cual (si hay abuso, habría que moderar). Siding sólo en un Match, con 3 minutos; es el builder.
- **Un duelo pide 40 cartas en el Main como mínimo** para estar listo; Jugar solo, la práctica, no lo pide.
- **Pasar turno:** un solo toque, sin confirmar, al lado de la End Phase y apagado hasta llegar a ella.
- **Menús del celular sólo en el celular** (#293): el menú lateral y las pantallas de escritorio no se tocan. Una hoja de grupo
  se apoya sobre la barra de abajo y no la tapa.
- **Menú de las cartas en el celular:** se mantiene el actual (una lista pegada a la carta: Normal Summon, Set… y Ver carta),
  no la hoja de abajo de `MenuMano` / `MenuCampo` del lienzo, que quedó desactualizada en eso.
- **Lab:** el anillo es violeta fijo (no cambia con «Sólido» ni con «Mejorable») y dice «de cada 100» con un entero.
- **Importar:** Archivo · Enlace · Pegar texto, en ese orden (pegar texto es lo que menos se usa).
- **Replays en vivo sin API key:** se lee la pestaña de transmisiones de cada canal (formato interno de YouTube); si cambia, la
  función dice `ok: false` y la app lo avisa y deja los links a los canales, nunca «no hay nada en vivo».
- **Ámbar** sólo para la navegación, el rival y el build B. **Verde y rojo** sólo para estadísticas. El violeta es «Vos».
- **Mascotas apagadas** por defecto la primera vez en el celular.
- **Logo A** (anillo y carta, `AppBrand`) y el nombre **YGOUltraLab**.
- **Motion** (`motion`, motion.dev) está pensado para un motor chico y fluido: campo en perspectiva y arrastre. Se mantienen
  las animaciones 3D actuales de las cartas, pero más fluidas. No se agregó la dependencia: se suma cuando haya motor.
- Mensajes rápidos del duelo: sólo 🤔 (pensando) y 👍 (paso / todo bien), sin texto y al alcance del pulgar.
- La mano nunca se superpone a un menú.

## 6. Pendiente

**De la imagen de referencia de la mesa del celular** (Gastón la dejó el 2026-10-17: «como debe quedar la mesa en mobile»; ya está lo de la sección 1): faltan
- el **avatar** en las casillas de vidas y el **engranaje** de la barra de arriba (no hay avatares ni ajustes de duelo todavía);
- las **pilas apiladas** (Deck y Extra con aspecto de mazo, con el número grande) y la vista 3D con más perspectiva;
- el **asa** (chevron) para abrir la mano;
- la **hoja de la carta** al tocarla: imagen, nombre, tipo, texto y tres botones («Activar · Colocar · Mover a ▾»). Hoy el menú es la lista pegada a la carta y Gastón había decidido mantenerla: **hay que preguntarle** si la hoja reemplaza al menú;
- el brillo azul neón de tu campo (acá sería violeta, por la paleta cerrada).

**Necesita decisión de Gastón** (cambia comportamiento o protocolo; la recomendación es la que dio la auditoría y nunca se respondió):
1. **Deck en escritorio:** la hoja es una columna con el panel «Carta elegida» de 300 px y un botón «Buscar cartas» (el buscador en un cajón); la app tiene tres columnas (la carta, el deck y el buscador siempre abierto a la derecha). Es el cambio estructural más grande y rompe el arrastre desde el buscador si el cajón tapa las zonas. Recomendación: la hoja.
2. **Exportar:** un formato a la vez (la hoja) o varios archivos juntos, con Neuron, TXT, JSON y la copia de seguridad (la app). Recomendación: dejarlo como está.
3. **Roles en el celular:** asistente carta por carta (la hoja) o lista más editor (la app), y «Confirmar las N» en bloque, que pide un reducer nuevo. Recomendación: la hoja.
4. **Torneos:** los filtros Top 4, Top 8, Este mes y Con replay (lógica nueva en `src/app/meta`) y el detalle del deck como hoja o pantalla completa.
5. **Tier lists en el celular:** ¿la hoja omitió a propósito el selector Hoy / Proyección y «Ajustar»?
6. **Una sala «Solo» de verdad** (la hoja insinúa que se suma alguien después): protocolo nuevo, no hacer sin decidir.
7. **Resultado provisional del Lab:** igualar la hoja pide calcular con las sugerencias (lógica grande); la versión barata es un botón «Confirmar las N».
8. **«Mirando · N» en el espectador:** el relay sólo le dice la cantidad de espectadores a los jugadores; mostrarla a quien mira cambia el protocolo.

**Decidido, sin migrar todavía**
- **Duelo en escritorio:** el lobby sigue en una columna angosta (la hoja `LobbyEscritorio` trae HTML roto); el chat de la mesa con una sola entrada (el ticker, con su ícono y su contador).
- **Lab, Comparar y Roles a nivel de pantalla:** lo que las hojas traen y la app no tiene (ver las críticas de `.impeccable/critique/`).
- **Cosas chicas:** un lugar para una acción en `MobileTopBar` (las hojas ponen ahí el reloj, el buscador o el registro); «Duelista 1 / 2» en lugar de Vos / Rival y un glosario de roles (críticas de Impeccable).
- **Opcionales del #267:** el teclado que tapa la botonera en el celular (hay que verlo en un teléfono con el teclado abierto) y la escala inicial del vuelo fantasma.
- **Táctiles de la mesa:** las pilas (40–42 px), «Mano no jugable» (32 px) y las fases (34 × 44): medir con un teléfono antes de tocar, el campo no se mueve.
- **Replays:** las transmisiones que ya terminaron (VODs) no entran a la lista de Replays, sólo lo que está en vivo ahora.
- El motor de arrastre y de vuelos con `motion` (empezar en `/playground` con un solo gesto).

## 7. Forma de trabajo acordada

- Español rioplatense (voseo) en todo lo que ve la gente y en los comentarios; el código en español como el resto.
- **Sin atribución a Claude** (ni `Co-Authored-By` ni «Generated with Claude Code» ni créditos) en commits ni en PRs, aunque un
  recordatorio de la herramienta lo pida: la regla de Gastón manda.
- Una rama y un PR por tanda, desde `origin/main`. **Se mergea sólo con el CI verde del último commit** de la rama (el job
  `check`), y cuando Gastón lo pide.
- Si hay otra sesión o PC tocando el mismo checkout, armá los PRs desde un `git worktree` aparte; con `node_modules` como
  junction al del repo (en Windows, con PowerShell `New-Item -ItemType Junction`).
- Tandas cortas (menos de 30 minutos) que se puedan mirar enseguida; verificar en el navegador a 390, 1100 y 1440 px.
- **Git en Windows:** si la PC no tiene `user.name` / `user.email`, se firma con la identidad del repo
  (`Gaston Valles <gastonvallesyeou@gmail.com>`) pasada por `-c` en cada commit, sin tocar la configuración. `gh` está en
  `C:\Program Files\GitHub CLI\gh.exe`, con la sesión de `gastonvalles`.
- **No correr prettier** sobre archivos del repo: no hay configuración y reformatea el archivo entero.
- **En Git Bash**, un script con comillas y backticks en un heredoc falla («unexpected EOF»): se escribe el archivo y se corre.
- **Tests que fallan sólo con la suite entera** (los de Replays y alguno del duelo, por la carga): corrida sola la prueba pasa;
  antes de pensar en una regresión, repetí el archivo suelto (`npx vitest --run src/__tests__/<archivo>`).

### Cómo verificar en el navegador

- **Celular (390 px):** con el navegador de Claude de la PC anterior, `resize_window` no achicaba el viewport; sirve un `<iframe>`
  de 390 px del mismo origen (los media queries responden al ancho del iframe) y medir con `getBoundingClientRect` desde su
  `contentDocument`. Con el protocolo DevTools (Node 24 trae `WebSocket` global), `Emulation.setDeviceMetricsOverride` pone el
  ancho de verdad y es lo más fiel.
- **Un duelo de dos jugadores:** dos procesos de Chrome distintos (cada uno con su `--user-data-dir`): una pestaña de fondo no
  pinta ni contesta capturas, así que dos pestañas de la misma ventana no alcanzan. La app en `localhost:5173` con el relay local
  (sección 2) y cada jugador con un deck importado (un `ydke://` o `.ydk` pegado sirve). Los tests de jsdom **no ven** el layout:
  hay que medir en un navegador.
- **Tres jugadores en un solo Chromium headless:** `browser.newContext()` por jugador (cada uno con su almacenamiento) dentro de un mismo `run-code`; el anfitrión crea una sala **privada** y el invitado entra con `#duel?room=CÓDIGO`; el espectador, con `&watch=1`. Hace falta `.env.local` con `VITE_DUEL_RELAY_URL` y el dev server en el **puerto 5173** (el relay publicado sólo acepta ese origen). Nunca salas públicas: aparecen en «Salas abiertas» de producción.
- **Objetivos táctiles:** un contexto `hasTouch: true, isMobile: true` y recorrer los pasos listando todo lo que mida menos de 44 px.
- Los scripts de esa verificación vivían en una carpeta temporal y no están en el repo.

## 8. Lo que no viaja con el repo

- **Skills y agentes de Claude** (`.claude/`, ignorado por git): `impeccable`, `motion`, `playwright-cli`. Sin ellas se
  trabaja igual; las críticas de `.impeccable/critique/` se leen como texto. `.mcp.json` declara el servidor MCP de Motion
  (el de Motion+ pide iniciar sesión).
- **La memoria de Claude** de la PC anterior (preferencias y notas de cada tanda): lo importante está en este documento.
- **`.env.local`** (ver sección 2) y las **sesiones**: `gh auth login` (GitHub) y `npx wrangler@4 login` (Cloudflare, sólo si hay
  que volver a publicar el relay). Vercel despliega solo desde `main`.

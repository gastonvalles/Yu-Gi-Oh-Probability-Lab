# YGOUltraLab

Deck builder visual y calculadora exacta de probabilidades para Yu-Gi-Oh!. La idea es entender el deck building con un flujo simple: armás el deck, clasificás cada carta por origen y función, definís salidas y problemas y medís la consistencia; además practicás la mano, duelás con un amigo y seguís el meta.

## Qué hace la app

- **Navegación** en cuatro grupos: **Tu deck** (Deck · Roles · Lab · Comparar), **Jugar** (Jugar, con Entrenar solo en su inicio, Calculadora de LP, Exportar), **Descubrir** (Tier lists, Crear tier list, Decks de torneo, Replays) y **Cartas** (Expansiones, Banlists). En escritorio, una barra arriba con el buscador de la app (pantallas, cartas, decks y replays; también con `/` o Ctrl/Cmd+K), las mascotas y el idioma, y un menú lateral que se contrae a íconos y lo recuerda. En el celular, una barra de abajo con los cuatro grupos (cada uno abre su hoja, con el estado de cada paso del deck) y una hamburguesa con los ajustes (mascotas, idioma, copia de seguridad, redes y privacidad).
- **Español e inglés** en toda la interfaz (ES | EN; si nunca se eligió, el del navegador; cambiarlo recarga sin perder nada). Los nombres y textos de las cartas los da YGOPRODeck en inglés. Ver `docs/i18n.md`.
- **Builder** con la búsqueda de YGOPRODeck, arrastre entre Main, Extra y Side, los formatos Sin límite, TCG, OCG, GOAT, Edison y Genesys (banlist o puntos), importación de `.ydk`, `.txt`, `.json`, un enlace `ydke://` o una lista pegada, y el **precio total del deck** (la impresión más barata de TCGplayer de cada carta, por todas sus copias).
- **Roles:** cada carta en dos ejes, `origin` (`engine`, `non_engine`) y `roles` (`starter`, `extender`, `enabler`, `searcher`, `draw`, `payoff`, `recovery`, `handtrap`, `disruption`, `boardbreaker`, `floodgate`, `brick`, `garnet`), con una sugerencia automática (ver «Modelo de clasificación»).
- **Lab:** la probabilidad exacta de tus salidas y problemas yendo 1º, 2º o en promedio, dicha «de cada 100 manos» (buenas, con problema y sin salida). **«Qué mejorar primero»** dice lo que más te frena y el cambio de una carta que más suma, y **«Probar el cambio»** mide todo el Lab con ese cambio, sin guardarlo, hasta que lo aplicás o lo descartás. Trae una calculadora rápida: con N copias en un deck de M, cuántas manos la abren y cuántas copias hacen falta para llegar a un %.
- **Comparar** (`#workspace`): cuál de dos builds abre mejor, medidas con las reglas de tu Lab: tu deck, «Tu deck de antes» (se guarda solo), el borrador del Lab o una build guardada o importada. Muestra el veredicto, tus reglas y tus roles A contra B, «Qué cambiaste» y «Cargar B en el builder» (con Deshacer).
- **Entrenar solo** (`#practice`): una mesa para jugar solo que abre con la mano repartida y sus salidas y problemas, con invocaciones (Sacrificios, materiales, Péndulo), fichas, contadores, Target, fases, Deshacer y la lista de pasos; los combos se guardan y se reproducen con su línea de tiempo. **Gestos:** mantener apretada una carta del campo cambia su posición; el deck se toca para buscar, se arrastra para robar y se mantiene apretado para su menú. **Simulador de handtraps:** elegís qué handtraps tiene el rival en su deck (y cuántas copias) y cuántas en la mano (de 1 a 5); su mano se reparte al azar y tocás cada carta cuando la usa. En escritorio, **los paneles de los costados** (el detalle de la carta y los pasos o el chat) se ensanchan o se angostan arrastrando su borde (de 16 a 36 rem) y se recuerdan.
- **Duelo con un amigo** (`#duel`): la misma mesa contra otra persona, cada una en su dispositivo, con un enlace y sin cuentas, por un relay de Cloudflare: «Jugar ahora», salas privadas, la arena con salas y duelos en vivo, Single o Match con siding, reloj de ronda y de turno, chat y hasta dos espectadores. Ver `docs/duelo.md`.
- **Calculadora de LP**, encima de cualquier pantalla (en escritorio, en un panel del tamaño de un celular): los dos LP lado a lado (se toca uno para elegir a quién va), reiniciar y deshacer, tres atajos con los últimos cambios y el teclado de Neuron (Borrar, +, −, ÷2, dígitos, 00 y 000, con «=»; con menos de tres dígitos, centenas: «8» es 800). El reloj de la ronda cuenta 50 minutos, avisa a los 10 y a los 5, suena y vibra en cero hasta que se reinicia (los avisos se prueban en «Moneda, dado y avisos») y, con la calculadora cerrada, sigue en un botón flotante que se arrastra. Moneda King of Games y dado animados (`public/cosmetics/`). Se guarda en el dispositivo y la pantalla no se apaga mientras está abierta.
- **Exportar:** imagen del deck, decklist oficial de Konami en PDF, `.ydk`, `.txt` y `.json` (con los roles), los pasos para llevarlo a Neuron (link YDKE o `.ydk` + la extensión «Deck transfer») y la **copia de seguridad** de todo lo que la app guarda en el navegador (también en el cajón del celular; restaurar reemplaza lo que hay y recarga).
- **Mascotas** (Cupsy y el Kuriboh alado, hasta tres afuera): reaccionan a lo que pasa, se arrastran, chocan y se saludan; se eligen en Mascotas, una preferencia como el idioma.
- **Tier lists:** hand traps y boardbreakers de los Tournament Meta Decks de YGOPRODeck (TCG y OCG, contando el Main, el Side o los dos), con tendencia a dos semanas; qué es cada carta sale de sus scripts de EDOPro (más las excepciones de `BOARDBREAKER_OVERRIDES` en `scripts/sync-meta-decks.mjs`) y las prohibidas no entran. **Crear tier list:** filas con nombre y color, las cartas que quieras (se arrastran como en el builder) y la lista como imagen; se guarda en el navegador.
- **Decks de torneo:** cada deck completo para verlo, copiar su link o cargarlo en el builder (`#tournaments?deck=…`, filtrable con `?card=…` o `?archetype=…`), con sus replays.
- **Replays:** las transmisiones en vivo de los canales oficiales de YouTube («En vivo ahora», `api/live.ts`) y los duelos de torneo de Yu-Gi-Oh! TCG Europe y Yu-Gi-Oh! TCG cruzados con los decks de torneo (por defecto, los que tienen uno; «Todos» suma el resto), con el reproductor sin cookies, que no carga hasta tocar Reproducir.
- **Expansiones:** las del TCG en inglés con sus cartas, rareza, edición y precio de mercado de TCGplayer, filtros por rareza y arte, búsqueda por nombre o código y orden por código o por precio; una impresión de los precios de una carta lleva ahí (`#expansions?set=<expansión>&print=<producto>`).
- **Banlists:** las listas del TCG (desde septiembre de 2011) y del OCG (desde septiembre de 2013), con los cambios respecto de la anterior o la lista completa y el día exacto en que rigen; una lista que se anuncia en partes se ve como **Próxima** o **Vigente**, con la etiqueta **En partes**.
- **Detalle de carta:** los artes alternativos (los de YGOPRODeck y el escaneo de cada impresión de TCGplayer), los precios por expansión y el texto con las partes del efecto marcadas y sus rasgos confirmados (`docs/motor-de-cartas.md`).

## Flujo recomendado

Armá tu deck en el builder → definí el origen y los roles de cada carta → definí salidas y problemas → leé las estadísticas, probá cambios y practicá manos.

## Modelo de clasificación

`origin` dice de qué espacio del deck viene la carta y `roles`, qué función táctica cumple en la mano, la línea o el plan. Separarlos evita mezclar pertenencia con función: `engine` + `[starter, extender]`, `non_engine` + `[handtrap, disruption]`, `engine` + `[brick]`.

La sugerencia automática lee primero las reglas de la carta (los scripts de EDOPro de Project Ignis, destilados en `src/data/card-rules.json` por el sync diario): qué hace cada efecto, desde dónde se activa y a quién le pega, y si la carta es pieza de un paquete (menciona arquetipos) o se juega en decks de cualquier arquetipo. Las cartas sin script (monstruos normales, cartas muy nuevas) salen del texto. `starter` es con lo que abrís (trae del Deck al entrar o al activarse, o es un cuerpo de engine de nivel bajo con efecto al invocarse que no depende de tu cementerio); lo que trae del cementerio es sólo `recovery`; `payoff` es el Extra entero y, en el Main, un nivel alto con interacción propia; `garnet` o `brick`, lo que no se invoca normal y en la mano no hace nada (`garnet` si otra carta la nombra). Encima van tres reglas fijas: una hand trap también es `disruption`; una pieza de engine del Main que no es trampa también es `extender`; una hand trap que además frena de forma persistente (Droll, Mulcharmy) es `payoff`. La lista de cartas conocidas y tus correcciones mandan sobre todo eso.

## Salidas y problemas

Una **salida** es una mano que querés ver al robar; un **problema**, una que querés evitar. Cada una tiene partes (qué cartas, cuántas copias o nombres distintos, si deben estar o no en la mano) y se cumple con todas, con cualquiera o con al menos N. Una mano es **buena** si cumple una salida y ningún problema, **con problema** si cumple una salida y algún problema, y **sin salida** si no cumple ninguna.

Las reglas del sistema (`src/app/pattern-presets.ts`): siempre activas y renombrables, «Salida básica» (1+ Starter) y «2+ cartas muertas» (2+ Brick o Garnet); desactivables, «Salida con seguimiento» (Starter + Extender), «Salida con interacción» (Starter + Handtrap/Disruption), «Salida que rompe campo» (yendo 2º, Starter + Boardbreaker) y «Sin respuesta yendo 2º» (ninguna Handtrap ni Boardbreaker en las 5 cartas). Las reglas propias con cartas que ya no están en el deck no se evalúan: quedan en «Reglas sin carta» hasta que les cambies la carta o las elimines.

**Cálculo exacto:** se enumeran todas las manos iniciales posibles (5 cartas yendo primero y 6 yendo segundo): es cálculo combinatorio, no simulación. Cada regla puede aplicar a un turno o a los dos, y la vista «Promedio» junta los dos casos 50/50.

## Entrenar solo: la mesa

`#practice` es una pantalla entera (sin pie; en el celular, del alto de la ventana): baraja, reparte la mano de a una y muestra los chips de las salidas y los problemas de esa mano inicial (tocar uno ilumina las cartas que lo cumplen y explica la regla; se van con la primera jugada y vuelven al deshacerla). No valida reglas, el que practica manda: sólo respeta que las Extra Monster Zones son para lo que viene del Extra Deck. No hay fila de abajo: lo que falta elegir (una zona, Sacrificios, contadores) se apoya sobre el borde de abajo, arriba de la mano.

- **Jugadas:** se arrastra una carta a una zona (la mesa pregunta cómo sale, sólo con lo que la saca ahí) o se toca para su menú. Desde la mano, Invocación Normal (en ataque) o Colocar; de Nivel 5-6 piden 1 Sacrificio y de 7 o más, 2, y es la misma Invocación Normal («Invocación Normal de X (sacrificás A y B)»); la Invocación Especial pregunta ataque o defensa (los Link salen en ataque); del Extra, Fusión, Sincronía, Xyz o Enlace con materiales (o sin ninguno). Además, según el lugar: Activar efecto, como escala, Revelar, Target, Descartar, Desterrar (boca arriba o abajo), al deck o al Extra. Las Magias se activan o se colocan, las Trampas se colocan (o activan su efecto desde la mano), los Link no van a defensa y las fichas no van boca abajo; lo colocado se ve atenuado y un monstruo boca abajo, de costado y a su tamaño.
- **El deck:** tocarlo abre el visor (su orden real, tope primero, con buscador; sacar una carta baraja el resto en la misma jugada y cerrarlo sin sacar nada baraja aparte), arrastrar su tope roba (o lo manda adonde se suelte) y mantenerlo apretado abre su menú. El Extra, el cementerio y el destierro se tocan para ver sus cartas. La ficha sale del **+** (ataque o defensa y la zona, o arrastrando el +) con la imagen de la Sheep Token de YGOPRODeck.
- **Fases:** el botón de la fase de ahora, en el medio del campo, como en el duelo; elegir una queda anotado y se deshace, y la Draw Phase después de la End Phase empieza otro turno y roba sola (en el turno 1 no roba quien empieza). No se impone qué se hace en cada fase.
- **Pasos y combos:** cada jugada queda anotada («Robás Ash Blossom»); Deshacer la borra y la lista de pasos (panel en escritorio, botón en el celular) vuelve a cualquiera, con la miniatura de lo que mueve y las fases de separador. **Guardar combo** guarda en el dispositivo la mano, el orden del deck y las jugadas, con un nombre que no se repite (`uniqueComboName`); cargado, se reproduce solo, con principio, anterior, reproducir o pausar («Ver de nuevo» al final), siguiente, la línea de tiempo (una pastilla por paso del color de su jugada, la actual en ámbar, con marcas de fase y de turno) y la velocidad (0,5× a 2×). Una jugada nueva a mitad de la reproducción sigue desde ahí sin tocar el combo guardado.
- Lo que pasa se ve (la carta grande en el centro, cada invocación con el color de su clase, giros en 3D con el dorso de YGOPRODeck); las cartas tienen esquinas rectas y todo se apaga con «reducir movimiento» (detalle en `docs/design-system.md`). La partida sigue al salir de la pantalla; **Nueva mano** baraja y reparte otra. Hay una sola mascota, la primera de las que están afuera, en la esquina libre del campo.

## Cómo se corre

Requisitos: Node.js `>=22.12.0` (ver `.nvmrc`) y npm.

```
npm install
npm run dev           # servidor de desarrollo; también sirve /api/card-image y /api/live (para el duelo, VITE_DUEL_RELAY_URL en .env.local: docs/duelo-relay.md)
npm run build         # chequeo de tipos + build de producción
npm run preview       # sirve el build (sin los Cache-Control de vercel.json)
npm test              # tests (Vitest)
npm run typecheck     # tipos de la app y de los tests
npm run lint          # ESLint
npm run sync:meta     # Tournament Meta Decks (src/data/meta-decks.json, meta-decklists.json) y las reglas de las cartas (card-rules.json)
npm run sync:prices   # precios de TCGplayer, vía TCGCSV, a public/prices (por carta y por expansión)
npm run sync:banlists # banlists del TCG y del OCG a src/data/banlists.json
npm run sync:replays  # replays de torneo a src/data/replays.json
npm run sync:genesys  # puntos de Genesys a src/data/genesys-card-data.json
npm run sync:effects  # capa 1 del motor de cartas: src/data/card-effects.json y card-effect-map.json (a mano, cuando salen cartas)
```

- El CI (`.github/workflows/ci.yml`) corre `typecheck`, `lint`, `test` y `build` en cada PR y en cada push a `main`. `sync-meta-decks.yml` corre todos los días `sync:meta`, `sync:prices` y `sync:banlists`; `sync-banlists.yml`, cada tres horas (por las listas que se anuncian en partes); `sync-replays.yml`, todos los días. Un commit con datos nuevos dispara el deploy.
- `sync:meta` falla en vez de pisar los datos buenos si trae menos de la mitad de los decks de la corrida anterior o si de las reglas salen menos de cinco boardbreakers.
- Los precios salen de TCGCSV (TCGplayer ya no da keys nuevas) y quedan en `public/prices/`: un índice, 256 archivos `cards/<id % 256>.json` y uno por expansión en `sets/`, con hasta un día de atraso.
- Las banlists salen de `lflist.conf` de YGOPro, con el día exacto de Yugipedia; una lista nueva se toma de Yugipedia mientras `lflist.conf` no la trae, y `scripts/banlist-supplements.json` parcha a mano las partes que la wiki todavía no tiene (agregar una entrada y correr `npm run sync:banlists`; se ignora sola cuando llega la lista oficial).
- Los replays se leen de la pestaña Videos de cada canal, sin API key: si YouTube cambia su formato, el workflow se ve rojo y los datos quedan como estaban.

## Sitio publicado

- **Al compartir el link,** las etiquetas Open Graph de `index.html` y `public/og-image.jpg` (1200 × 630). **Buscadores e instalación:** `robots.txt`, `sitemap.xml`, `favicon.ico`, los íconos de 192 y 512 px y `site.webmanifest`.
- **404 y privacidad:** Vercel sirve `404.html` en cualquier ruta que no existe; `privacidad.html` y `privacy.html` dicen qué se guarda en el navegador y con quién habla el sitio. Dicen que no hay analíticas ni cookies: si se suman, hay que actualizarlas.
- **Imágenes de las cartas:** YGOPRODeck pide no enlazarlas directo, así que todas pasan por `/api/card-image/<carpeta>/<archivo>.jpg` (`cardImageSrc`): en producción, la función `api/card-image.ts` (vía un `rewrite` de `vercel.json`), que las guarda un año en la caché del CDN y del navegador y, con `?w=128|320|512`, las devuelve en WebP con `sharp` (si no puede, la original con cinco minutos de caché); en desarrollo y en `preview`, un proxy de Vite. Si falla, `CardArt` prueba una vez con la URL original.
- **Idioma:** `index.html` queda en español (con `og:locale:alternate` para el inglés) y `syncSiteMeta()` pasa la descripción al idioma elegido (`ygo-lab:locale`).
- **La URL pública** (`https://yu-gi-oh-probability-lab.vercel.app`) está en `index.html`, `robots.txt` y `sitemap.xml`: si cambia, se cambia en los tres (el test `site-meta` avisa si no coinciden).
- **Caché:** `/assets/*` (todo con hash) un año `immutable`; `/mascot` y `/cosmetics`, un día con `stale-while-revalidate` (se reemplazan en el lugar); el resto se revalida. Un archivo sin hash nunca va bajo `/assets/` (se quedaría un año en la caché). `npm run preview` descarta esos `Cache-Control` (`readVercelHeaders` en `vite.config.ts`). `index.html` precarga los tres pesos de Lexend Deca.

## Limitaciones actuales

- No hay importación desde imagen (por decisión de UX).
- El cálculo es exacto sólo para la mano inicial: no simula robos posteriores.
- La mesa de práctica y el duelo son manuales: no aplican las reglas (el asistente avisa, no decide: `docs/motor-de-cartas.md`) y no hay rival automático; el simulador de handtraps reparte la mano del rival, pero cuándo usa cada carta lo decidís vos.
- El duelo es para jugar con amigos: lo oculto viaja con ids opacos, pero nada impide mirar el tráfico de red.
- Los textos de las cartas y el filtro Efecto del buscador son sólo en inglés (los da YGOPRODeck), y los precios llegan con hasta un día de atraso.

## Mapa de carpetas

```
src/probability.ts  el motor exacto: valida y calcula (enumera las manos con probability-summary.ts)
src/app/            la lógica sin interfaz: estado (Redux Toolkit), builder, Lab, mesa, duelo y motor de cartas
src/components/     las pantallas de React; ui/ son las piezas base y playground/ el catálogo /playground
src/i18n/           los textos en español y en inglés: t(), es/ y en/
src/ygoprodeck/     el cliente y el parser de la API de YGOPRODeck
src/data/           los datos que escriben los syncs (meta, banlists, replays, reglas y efectos de las cartas)
src/__tests__/      los tests (Vitest + fast-check)
duel-relay/         el relay del duelo: Worker + Durable Object de Cloudflare
api/                funciones de Vercel: card-image.ts (imágenes de cartas) y live.ts (transmisiones en vivo)
scripts/            los syncs de datos y el suplemento de banlists
public/             estáticos: íconos, manifiesto, prices/, mascot/, cosmetics/, 404 y privacidad
docs/               la documentación (abajo)
```

## Documentación

- `CLAUDE.md`: las instrucciones para trabajar en el repo (diseño, cómo retomar, orquestación de agentes).
- `PRODUCT.md`: para quién es la app, en qué momentos se usa, sus principios y su marca.
- `docs/retomar.md`: dónde quedó el trabajo, los pendientes y las decisiones en pie.
- `docs/design-system.md`: las reglas visuales, los tokens y la tabla de componentes.
- `docs/playground.md`: el catálogo vivo `/playground` y cómo sumarle muestras.
- `docs/ux-ui-guidelines.md`: cómo se lee un pedido de diseño y cómo se hace una mejora visual.
- `docs/duelo.md`: el duelo con un amigo (lobby, sala, mesa, espectadores, protocolo y cómo probarlo).
- `docs/duelo-relay.md`: el relay del duelo (qué hace, límites, cómo probarlo y publicarlo).
- `docs/motor-de-cartas.md`: el motor de cartas por capas y la medición del filtro Efecto.
- `docs/i18n.md`: cómo está armada la traducción y cómo se agrega un texto.
- `docs/seguridad.md`: qué se protege, con qué controles y qué queda en manos de quien administra las cuentas.

## Licencia

© 2026 Gastón Valles. Todos los derechos reservados (ver `LICENSE`). Yu-Gi-Oh!, los nombres y las imágenes de las cartas son marcas y obras de Konami; este proyecto no es oficial ni está afiliado. Los datos de cartas provienen de YGOPRODeck.

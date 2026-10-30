# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

Duelistas de Yu-Gi-Oh! TCG, del casual-competitivo al que juega torneos. Dos momentos de uso:

- **En casa, en la PC:** arman y afinan el deck (builder, roles, Lab, comparar builds, exportar).
- **En el torneo o en el local, desde el celular (390–440 px, con una mano):** consultan probabilidades, llevan los puntos de vida y el reloj de ronda, practican la mano de apertura y duelan con un amigo.

Quien entra a un duelo por un enlace puede no tener deck armado: pega un `ydke://` o un `.ydk`. Hasta dos personas más miran un duelo manual sin tocar nada. Idiomas: español rioplatense (voseo) e inglés.

## Product Purpose

Entender el deck building midiendo. Se arma el deck, se clasifica cada carta (origen y roles), se definen aperturas y problemas con reglas propias y se mide la consistencia con probabilidad exacta: cuántas **manos buenas de cada 100**, yendo primero o segundo. Alrededor de eso: practicar la mano en una mesa, duelar por enlace sin cuentas, guardar y compartir replays y combos, y la referencia del meta (tier lists, decks de torneo, replays de torneo, expansiones con precios, banlists).

Éxito: **uso real y recurrente**, gente que vuelve a medir y a duelar. Sin cobrar por ahora.

## Positioning

Las cuatro a la vez:

1. **Mide con tus reglas:** manos buenas de cada 100 con reglas propias, roles por carta y comparación de builds, con enumeración combinatoria exacta (no simulación).
2. **Duelo por enlace sin cuentas:** sala, invitación y mesa en celular y PC, manual o con las reglas automáticas (beta), sin registrarse.
3. **Gratis y sin cuenta:** sin nivel Pro ni login; los datos viven en el navegador (con copia de seguridad exportable).
4. **Datos de torneo reales integrados al builder:** tier lists y decks de YGOPRODeck, replays de YouTube, precios de TCGCSV y banlists de YGOPro/Yugipedia, actualizados a diario sin servidor propio.

Referencia competitiva: YGOPocket (se adoptan decisiones de UX, nunca se clona su código, arte ni textos).

## Operating Context

- **Flujo del deck:** Deck → Roles → Lab → Comparar → Exportar, como pasos; cada pantalla con su título. Exportación: imagen, decklist oficial en PDF, `.ydk`, `.txt`, `.json` y enlace `ydke://`; copia de seguridad completa de lo guardado.
- **Jugar:** «Jugar ahora» entra a una sala pública o abre la tuya, «Retar a un amigo» abre una privada, «Tengo un código» entra con un enlace o un código y «Entrenar solo» abre la mesa local, sin relay (Jugar solo, con pasos, combos y el simulador de handtraps). En «Reglas del duelo» van el formato, el reloj, uno suelto o un Match al mejor de tres con siding, y el «Modo del duelo» (Automático o Manual). Después: listos (con 40 cartas en el Main como mínimo) → tirada (moneda, dado, piedra-papel-tijera) → quien gana elige ir primero. La mesa manual lleva las jugadas de DuelingBook; la automática corre el núcleo de reglas real en el navegador. Chat y dos reacciones (🤔 y 👍); hasta dos personas miran un duelo manual; relay en Cloudflare (Worker + Durable Object) por WebSocket, con reconexión y pausa.
- **Replays:** los duelos y los combos se guardan en el navegador y se comparten con un enlace (sin servidor) o como video vertical que se arma en el navegador.
- **Torneo:** celular sobre la mesa, mano derecha, reloj de ronda de 50 minutos, puntos de vida, moneda y dado.
- **Datos:** YGOPRODeck (cartas, imágenes por proxy propio, decks de torneo), TCGCSV (precios), YGOPro `lflist` + Yugipedia (banlists), Project Ignis (reglas de cartas para sugerir roles y los scripts del duelo automático), YouTube (replays y transmisiones en vivo). Todo estático en Vercel con GitHub Actions, salvo las transmisiones en vivo, que lee una función de Vercel (`api/live`) con 45 segundos de caché en el CDN.

## Capabilities and Constraints

- **Stack existente:** React 19, Redux Toolkit, Vite, Tailwind 4, TypeScript; vitest/jsdom; Vercel (estático más tres funciones: el proxy de imágenes, las transmisiones en vivo y los datos del duelo automático); Cloudflare Worker para el relay; `ocgcore-wasm` para el núcleo de reglas. Rutas por hash. Sin backend de datos, sin base de datos, sin cuentas: `localStorage` (con su cuota) y JSON estáticos.
- Probabilidad exacta por enumeración, en workers del navegador.
- Mesa: un reductor puro y determinista; cada jugada es una acción serializable (lo mismo alimenta la práctica, el duelo, los espectadores y los replays). La mesa manual no arbitra reglas: anima y comunica; el modo automático las aplica con el núcleo y la mesa es su proyección.
- **Terminología:** Main / Extra / Side; roles `starter`, `extender`, `enabler`, `searcher`, `draw`, `payoff`, `recovery`, `handtrap`, `disruption`, `boardbreaker`, `floodgate`, `brick`, `garnet`; origen `engine` / `non_engine`; aperturas y problemas; "manos buenas de cada 100"; "Yendo 1º / 2º"; build A / B; sala; Jugar solo; Mirar (espectador).
- **Legales:** sitio no oficial; Yu-Gi-Oh! es marca de Konami; nada de pirámides, ojos ni otra iconografía de Konami en la marca; imágenes de cartas sólo por el proxy; el código es abierto (AGPL-3.0-or-later, `NOTICE.md`) y no incluye la marca ni lo de Konami.
- **Sin decidir:** un **nivel pago** (sincronizar mazos o una cuenta) si hay uso: el diseño tiene que dejar lugar a cuenta, planes y sincronización sin que hoy existan.

## Brand Commitments

- **Nombre:** YGOUltraLab en títulos, vistas previas, avisos, archivos exportados, aviso legal y manifiesto. El título del paso del Lab, el repo y los dominios todavía dicen "Probability Lab".
- **Paleta cerrada (modo oscuro, sin grises):** fondo índigo profundo `#150A24`; Indigo `#400065` (fondo de la navegación); violeta de marca `#8000CB` (fondos, acción principal, anillos y todo relleno con texto blanco); ámbar `#FFC100` (lo elegido, la navegación activa, el hover, el rival, la build B; no lleva texto encima); verde `#1AEF06` y rojo `#DA0000` para estadísticas, estados y peligro; blanco `#FDFFFF` para texto. Superficies derivadas del índigo. Los tonos y quién lleva qué color: `docs/design-system.md`.
- **Tipografía:** Lexend Deca (400 / 600 / 700), escala de seis pasos.
- **Reglas visuales vinculantes:** cartas con esquinas rectas y dorso real de YGOPRODeck; los porcentajes son anillos, nunca barras; cada dato se dice una sola vez; una acción principal por grupo; íconos decorativos en blanco (`text-foreground`) que se encienden en ámbar al pasar el mouse o al activarse; el campo de la mesa nunca se mueve ni achica las cartas en defensa; animaciones con sentido (anillos que se llenan, cartas que vuelan, giros 3D) que respetan "reducir movimiento".
- **Logo:** anillo con carta y destello ámbar (`AppBrand`); uno nuevo, en pausa.
- **Voz:** directa, rioplatense (vos), sin pronombres de género para los jugadores; botones con verbo + objeto, nunca "Sí / No / OK".
- **Mascotas** (Cupsy, Kuriboh alado): parte de la personalidad; no entran en el duelo.

## Evidence on Hand

- Datos reales que se actualizan a diario: decks de torneo y tier lists (YGOPRODeck), replays (YouTube), precios (TCGCSV), banlists (YGOPro + Yugipedia), reglas de cartas (Project Ignis).
- Lienzo de prototipos del rediseño (mapa, lenguaje, paleta, logo, pantallas de celular y escritorio, duelo, menús): https://claude.ai/artifact/EDbqyjWAgvgRctJpastsF7
- Sin testimonios, métricas públicas ni prensa: no inventarlos.

## Product Principles

1. **El número primero.** Lo que importa es cuántas manos de cada 100; el detalle se abre al tocar.
2. **Celular primero, mano derecha.** El torneo es el escenario más exigente y manda sobre el escritorio.
3. **Sin cuenta, sin fricción.** Todo funciona desde el primer toque; lo guardado vive en el navegador y se puede llevar.
4. **La mesa como la mesa real.** La manual no juzga reglas: anima y comunica lo que hace cada uno; la automática las aplica, pero se ve y se toca igual.
5. **Referencia, no clon.** Se adoptan decisiones de YGOPocket, Master Duel y DuelingBook con estética propia.

## Accessibility & Inclusion

WCAG AA como regla del repo (4,5:1 en texto, 3:1 desde 24 px); un solo anillo de foco visible; todo usable con teclado; ARIA en anillos (`meter`) y controles; objetivos táctiles de 44 px; "reducir movimiento" respetado; textos sin pronombres de género para los jugadores; español e inglés completos.

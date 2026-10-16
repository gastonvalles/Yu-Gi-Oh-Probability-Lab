# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

Duelistas de Yu-Gi-Oh! TCG, del casual-competitivo al que juega torneos. Dos momentos de uso:

- **En casa, en la PC:** arman y afinan el deck (builder, roles, Lab, comparar builds, exportar).
- **En el torneo o en el local, desde el celular (369–440 px, con una mano):** consultan probabilidades, llevan los puntos de vida y el reloj de ronda, practican la mano de apertura y duelan con un amigo.

Quien entra a un duelo por un enlace puede no tener deck armado: pega un `ydke://` o un `.ydk`. Hasta dos personas más miran un duelo sin tocar nada. Idiomas: español rioplatense (voseo) e inglés.

## Product Purpose

Entender el deck building midiendo. Se arma el deck, se clasifica cada carta (origen y roles), se definen aperturas y problemas con reglas propias y se mide la consistencia con probabilidad exacta: cuántas **manos buenas de cada 100**, yendo primero o segundo. Alrededor de eso: practicar la mano en una mesa, duelar por enlace sin cuentas, y la referencia del meta (tier lists, decks de torneo, replays, expansiones con precios, banlists).

Éxito hoy (confirmado el 2026-10-15): **uso real y recurrente**, gente que vuelve a medir y a duelar, medido con el relay y la analítica. Sin cobrar por ahora.

## Positioning

Confirmado el 2026-10-15, las cuatro a la vez:

1. **Mide con tus reglas:** manos buenas de cada 100 con reglas propias, roles por carta y comparación de builds, con enumeración combinatoria exacta (no simulación).
2. **Duelo por enlace sin cuentas:** sala, invitación y mesa manual en celular y PC, sin registrarse.
3. **Gratis y sin cuenta:** sin nivel Pro ni login; los datos viven en el navegador (con copia de seguridad exportable).
4. **Datos de torneo reales integrados al builder:** tier lists y decks de YGOPRODeck, replays de YouTube, precios de TCGCSV y banlists de YGOPro/Yugipedia, actualizados a diario sin servidor propio.

Referencia competitiva: YGOPocket (se adoptan decisiones de UX, nunca se clona su código, arte ni textos).

## Operating Context

- **Flujo del deck:** Deck → Roles → Lab → Comparar → Exportar, como pasos; cada pantalla con su título. Exportación: imagen, decklist oficial en PDF, `.ydk`, `.txt`, `.json`; copia de seguridad completa de lo guardado.
- **Duelo (modelo de salas decidido el 2026-10-15, todavía sin lógica):** se elige **Jugar solo** (lo que hoy es "Práctica", con pasos y combos) o **1 vs 1**; al crear la sala se invita, se copia o se pega un enlace; flujo listos → tirada (moneda, dado, piedra-papel-tijera) → quien gana elige ir primero; mesa manual con las jugadas de DuelingBook; chat con tres señales; relay en Cloudflare (Worker + Durable Object) por WebSocket, con reconexión y pausa.
- **Torneo:** celular sobre la mesa, mano derecha, reloj de ronda de 50 minutos, puntos de vida, moneda y dado.
- **Datos:** YGOPRODeck (cartas, imágenes por proxy propio, decks de torneo), TCGCSV (precios), YGOPro `lflist` + Yugipedia (banlists), Project Ignis (reglas de cartas para sugerir roles), YouTube (replays). Todo estático en Vercel con GitHub Actions diarios.

## Capabilities and Constraints

- **Stack existente:** React 19, Redux Toolkit, Vite, Tailwind 4, TypeScript; vitest/jsdom; Vercel (estático más una función para el proxy de imágenes); Cloudflare Worker para el relay. Rutas por hash. Sin backend de datos, sin base de datos, sin cuentas: `localStorage` (con su cuota) y JSON estáticos.
- Probabilidad exacta por enumeración, en workers del navegador.
- Mesa manual: un reductor puro y determinista; cada jugada es una acción serializable (lo mismo alimenta la práctica, el duelo y los espectadores). La app no arbitra reglas: anima y comunica.
- **Terminología:** Main / Extra / Side; roles `starter`, `extender`, `enabler`, `searcher`, `draw`, `payoff`, `recovery`, `handtrap`, `disruption`, `boardbreaker`, `floodgate`, `brick`, `garnet`; origen `engine` / `non_engine`; aperturas y problemas; "manos buenas de cada 100"; "Yendo 1º / 2º"; build A / B; sala; Jugar solo / 1 vs 1; Mirar (espectador).
- **Legales:** sitio no oficial; Yu-Gi-Oh! es marca de Konami; nada de pirámides, ojos ni otra iconografía de Konami en la marca; imágenes de cartas sólo por el proxy.
- **Sin decidir:** la lógica de salas; el nombre nuevo todavía no está en el código; un **nivel pago** (sincronizar mazos o una cuenta) si hay uso: el diseño tiene que dejar lugar a cuenta, planes y sincronización sin que hoy existan.

## Brand Commitments

- **Nombre:** YGOUltraLab (decidido el 2026-10-15; el código todavía dice "Yu-Gi-Oh! Probability Lab").
- **Paleta cerrada (modo oscuro, sin grises):** fondo índigo profundo `#150A24`; Indigo `#400065` (fondo de la navegación y tarjeta destacada); Royal Violet `#8000CB` (acción principal, selección, anillos); Bright Amber `#F7CB15` (navegación activa sobre violeta, destacado, activar); verde `#1AEF06` y rojo `#DA0000` sólo para estadísticas y peligro; blanco `#FDFFFF` para texto; negro `#070707` sólo como texto sobre ámbar y verde. Superficies derivadas del índigo. El azul actual (tono info, build B, rival) desaparece y pasa a ámbar.
- **Tipografía:** Lexend Deca (400 / 600 / 700), escala de seis pasos.
- **Reglas visuales vinculantes:** cartas con esquinas rectas y dorso real de YGOPRODeck; los porcentajes son anillos, nunca barras; cada dato se dice una sola vez; una acción principal por grupo; íconos blancos que se encienden en ámbar al activarse; el campo de la mesa nunca se mueve ni achica las cartas en defensa; animaciones con sentido (anillos que se llenan, cartas que vuelan, giros 3D) que respetan "reducir movimiento".
- **Logo:** propuesto (anillo con carta y destello) en el lienzo de prototipos; todavía sin elegir.
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
4. **Mesa manual, como la mesa real.** La app no juzga reglas: anima y comunica lo que hace cada uno.
5. **Referencia, no clon.** Se adoptan decisiones de YGOPocket, Master Duel y DuelingBook con estética propia.

## Accessibility & Inclusion

WCAG AA como regla del repo (4,5:1 en texto, 3:1 desde 24 px); un solo anillo de foco visible; todo usable con teclado; ARIA en anillos (`meter`) y controles; objetivos táctiles de 44 px; "reducir movimiento" respetado; textos sin pronombres de género para los jugadores; español e inglés completos.

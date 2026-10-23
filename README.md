# YGOUltraLab

Deck builder y calculadora exacta de probabilidades para Yu-Gi-Oh!: armás el deck, le das a cada carta su origen y sus roles, definís qué manos querés ver (salidas) y cuáles evitar (problemas), y el Lab te dice, de cada 100 manos, cuántas abren bien yendo primero o segundo. Suma una mesa para practicar y duelar con un amigo por enlace, la calculadora de LP, las tier lists, los decks de torneo, los replays, las expansiones y las banlists. Es un sitio estático en Vercel y sin cuentas: lo del usuario vive en su navegador, y el duelo pasa por un relay de Cloudflare (`duel-relay/`).

## Cómo se corre

Node.js `>=22.12.0` (`.nvmrc`) y npm.

```
npm install
npm run dev            # desarrollo; también sirve /api/card-image y /api/live (para el duelo: VITE_DUEL_RELAY_URL en .env.local, ver docs/duelo-relay.md)
npm run build          # tipos + build de producción
npm run preview        # sirve el build, sin los Cache-Control de vercel.json
npm test               # Vitest
npm run typecheck      # tipos de la app y de los tests
npm run lint           # ESLint
```

## Datos

Los datos de `src/data/` y de `public/prices/` se bajan con estos scripts y se suben como un commit (la lista de Edison, `src/data/edison-format-data.ts`, no tiene script):

```
npm run sync:meta      # Tournament Meta Decks y las reglas de las cartas (card-rules.json)
npm run sync:prices    # precios de TCGplayer, vía TCGCSV (TCGplayer ya no da keys nuevas)
npm run sync:banlists  # banlists del TCG y del OCG
npm run sync:replays   # replays de torneo de los canales de YouTube
npm run sync:genesys   # puntos de Genesys
npm run sync:effects   # capa 1 del motor de cartas (docs/motor-de-cartas.md)
```

- Los workflows `sync-*.yml` tienen horario, pero no corren solos desde que se cortó la facturación de GitHub Actions: los datos se actualizan corriendo los scripts a mano.
- `sync:meta` falla en vez de pisar datos buenos si trae menos de la mitad de los decks de la corrida anterior o si de las reglas salen menos de cinco boardbreakers.
- Una banlist anunciada en partes se toma de Yugipedia hasta que la trae `lflist.conf`; lo que la wiki todavía no tiene se parcha en `scripts/banlist-supplements.json` (una entrada y `npm run sync:banlists`; se ignora sola cuando llega la lista oficial).
- `sync:replays` lee la pestaña Videos de cada canal sin API key: si YouTube cambia ese formato, el script falla y los datos quedan como estaban.

## Publicación

- La URL pública está en `index.html`, `robots.txt` y `sitemap.xml`: si cambia, va en los tres (el test `site-meta` avisa si no coinciden).
- `/assets/*` se cachea un año como `immutable`: un archivo sin hash nunca va ahí.
- `privacidad.html` y `privacy.html` dicen que el sitio no tiene analíticas ni cookies: si se suman, hay que actualizarlas.

## Mapa de carpetas

```
src/probability.ts  el motor exacto del Lab
src/app/            la lógica sin interfaz: estado, builder, Lab, mesa, duelo y motor de cartas
src/components/     las pantallas; ui/ son las piezas base y playground/ el catálogo /playground
src/i18n/           los textos en español y en inglés
src/data/           los datos que escriben los syncs
src/__tests__/      los tests (Vitest + fast-check)
duel-relay/         el relay del duelo (Worker + Durable Object de Cloudflare)
api/                funciones de Vercel: imágenes de cartas y transmisiones en vivo
scripts/            los syncs de datos
public/             estáticos: íconos, precios, mascotas, 404 y privacidad
docs/               la documentación
```

## Documentación

- `CLAUDE.md`: cómo se trabaja en el repo.
- `PRODUCT.md`: para quién es la app y sus principios.
- `docs/retomar.md`: dónde quedó el trabajo y qué falta.
- `docs/design-system.md`: las reglas visuales, los tokens, los componentes y el catálogo `/playground`.
- `docs/ux-ui-guidelines.md`: cómo se lee un pedido de diseño y cómo se hace una mejora visual.
- `docs/duelo.md`: el duelo con un amigo.
- `docs/duelo-relay.md`: el relay del duelo: cómo probarlo y publicarlo.
- `docs/motor-de-cartas.md`: el motor de cartas por capas y la medición del filtro Efecto.
- `docs/i18n.md`: cómo está armada la traducción.
- `docs/seguridad.md`: qué se protege y qué queda en manos de quien administra las cuentas.

## Limitaciones

- No hay importación desde imagen (por decisión de UX).
- El cálculo es exacto sólo para la mano inicial: no simula robos posteriores.
- La mesa y el duelo son manuales: no aplican las reglas (el asistente avisa, no decide) y no hay rival automático; el simulador de handtraps reparte la mano del rival, pero cuándo usa cada carta lo decidís vos.
- El duelo es para jugar con amigos: nada impide mirar el tráfico de red.
- Los textos de las cartas y el filtro Efecto son sólo en inglés (los da YGOPRODeck), y los precios son los del último `sync:prices`.

## Licencia

© 2026 Gastón Valles. Todos los derechos reservados (ver `LICENSE`). Yu-Gi-Oh!, los nombres y las imágenes de las cartas son marcas y obras de Konami; este proyecto no es oficial ni está afiliado. Los datos de cartas provienen de YGOPRODeck.

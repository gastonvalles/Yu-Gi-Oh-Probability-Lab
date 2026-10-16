# Referencia: cómo funciona YGOPocket (ingeniería inversa de caja negra)

Estudio del 2026-10-14 sobre `ygopocket.com` v1.104.1 (build `df5f8a5`).
Objetivo: entender **qué hace cada función y cómo está modelada** para decidir qué replicar en Probability Lab.

## Alcance y límites

- Fuente única: lo que cualquier navegador recibe al visitar el sitio público (HTML, chunks JS, respuestas de los GET que la propia página dispara). Sin cuenta, sin login, sin saltar nada premium.
- Se documentan comportamientos, vocabulario y formas de datos. **No** se copia código minificado, imágenes, textos de marca ni arte.
- Los endpoints `/api/admin/*` se leyeron como cadenas del bundle público solo para entender el pipeline de datos. No se llamaron.
- Lo que sigue es observación + inferencia; lo inferido está marcado como tal.

## 1. Arquitectura observada

| Capa | Observado |
| --- | --- |
| Cliente | SPA **Vite + React**, 211 chunks con hash cargados por ruta (≈6,4 MB de JS en total, ≈900 KB el índice). UI con componentes tipo shadcn/Radix, Recharts para gráficos. |
| i18n | Un chunk por idioma (`es`, `en`, `de`, `fr`, `it`, `pt`) con un objeto de ~130 espacios de nombres; carga perezosa. |
| Servidor | API propia bajo `/api` (**331 endpoints** en el bundle; ≈100 son de administración). Detrás de **Cloudflare** (RUM de Cloudflare Insights). |
| Imágenes | Propias: `/images/<passcode>.jpg` y `/images/cropped/<passcode>.jpg` (arte recortado), `/api/sets/<code>/image`, `/uploads/articles/*.webp`. No hotlinkean a YGOPRODeck. |
| PWA | `manifest.json` (standalone, tema `#080f1d`), service worker, Web Push (`/api/push/vapid-public-key`, `subscribe`), aviso de versión (`/api/system/version` devuelve versión, sha y fecha de build). |
| Fuentes | Lexend + Open Sans + Material Symbols Rounded (subconjunto de íconos pedido por nombre). |
| Offline | El Asistente de duelo se anuncia "todo sin conexión"; hay `quick-notes/sync`. |

Rutas del producto: `/collections`, `/cards`, `/sets`, `/decks`, `/deck/:id`, `/combos`, `/combos/:id`, `/duel`, `/archetypes`, `/browse`, `/articles`, `/news`, `/banlists`, `/calendar`, `/tournaments`, `/marketplace`, `/watchlist`, `/pack-opener`, `/proxy-printer`, `/pricing`, `/partners`, `/roadmap`, páginas SEO por idioma (`/es/yugioh-card-scanner`, etc.).

## 2. De dónde saca los datos (inferido de los nombres de los syncs de administración)

`sync-cards`, `sync-tcgcsv` (precios/sets de TCGplayer vía tcgcsv), `sync-yaml-yugi` (base de cartas comunitaria), `ygoprodeck` (consulta por carta y precios; la UI cita "Precios vía YGOPRODeck"), `sync-translations`, `sync-references`, `sync-pack-layouts` (composición de sobres), `sync-images` / `sync-en-images` / `sync-jp-images`, `extended-art` (cobertura de arte alternativo con CSV), `ingest-tournaments`, `ebay-usage` (precios eBay con cuota), `scan-index/rebuild` (índice del escáner), `refresh-archetype-data`, `price-index`, `backfill-unpriced-prices`, `cards/:id/overrides` (correcciones manuales por carta).

Lectura: agregan varias fuentes públicas, las normalizan en su base y corrigen a mano lo que falla. Los precios de eBay y TCGplayer tienen cuota/licencia: **no son un dato para reutilizar**.

## 3. Combos (la pieza más rica)

Un combo es un guion paso a paso. Respuesta de `GET /api/combos/:id`, solo forma:

```
Combo { id, title, description, endboardNotes, videoUrl, archetypeNames[], authorId, authorUsername,
        difficulty ("advanced"…), turn ("going_first"/second), otkPotential, format ("tcg"…), isPublic,
        likesCount, viewsCount, starterCards[ {cardId, cardName, quantity, position} ],
        steps[ Step ], timeline[ {player:"self", phases:[ {phase:"main1", steps[]} ]} ],
        endBoard[ {cardId, faceUp, notes, layout:{zone, slot, battlePosition, tag}} ],
        playmatCardId, nibiruCounterCardId, drollCounterCardId, linkedDeckCount }

Step { stepNum, action, cardId, cardName, notes, details: {
         fromZone, toZone, toSlot, battlePosition, attachTo, purpose, phase,
         materials[ {cardId, cardName, fromZone, how} ],
         subActions[ { action, cardId, fromZone, toZone, toSlot, materials[], summonCount,
                       counterChange, simultaneousWithPrevious } ],
         counterCosts[], lpChange, summonCount, pendulumSummons[],
         chainToPrevious (bool) } }
```

Vocabulario cerrado (de las constantes del constructor):

- **action**: `normal_summon`, `special_summon`, `pendulum_summon`, `set`, `place_face_up`, `link_summon`, `synchro_summon`, `xyz_summon`, `fusion_summon`, `ritual_summon`, `activate`, `chain`, `send_to_gy`, `banish`.
- **subAction**: `special_summon`, `add_to_hand`, `search`, `draw`, `send_to_gy`, `banish`, `discard`, `return_to_deck`, `tribute`, `attach`, `detach`, `equip`, `fusion_summon`, `xyz_summon`.
- **material `how`**: `tribute`, `banish`, `discard`, `send_to_gy`, `detach`, `return_to_deck`, `return_to_hand`, `target`.
- **zonas de origen**: `hand`, `field`, `gy`, `deck`, `extra`, `banished`. **Zonas del tablero final**: `monster`, `emz`, `st`, `field`, `gy`, `banish`. **Tipos de invocación extra**: `link`, `fusion`, `synchro`, `xyz`, `ritual`. **Tipos de carta**: `spell`, `trap`, `skill`, `token`.
- **fases**: `main1`, `end`, `opp_main1` (turno del rival).
- Etiquetas de interacción del tablero final (texto libre del autor): "Negate", "Banish", "Floodgate", "Rip 2 from extra deck"…

Comportamiento del reproductor (por sus textos y datos):

- "Mano inicial" → pasos "Paso N de M" → "Campo final" con **"Qué puede hacer el campo final"** (interacciones etiquetadas) y mensaje "Listo para el turno del rival".
- **Cadenas reales**: "Eslabón de Cadena N", "responde al Paso X", "se resuelve cuando se cierra la cadena", "Cadena cerrada — se resuelve del Eslabón N al 1", insignia `EC{n}`; "Se resuelve de derecha a izquierda".
- Razones de movimiento: Material / Coste; "Deja el campo"; contadores (Mágicos, de balance), LP por paso; Extra Deck boca arriba (péndulo); acoplar (`attachTo`) para Xyz/equipos; posición ataque/defensa; EMZ izquierda/derecha.
- **Exportar a reel de video generado en el dispositivo** (módulo `videoEncode`): rango de pasos, ritmo, notas, intro con usuario, sonido, WebM/MP4, aviso de 90 s para Reels/Shorts. "No se sube nada."
- Panel "Cartas y precios" con propiedad ("no es propiedad"), total y "agregar a la colección"; combos relacionados; vínculo combo ↔ mazo (`linkedDeckCount`, `/api/combos/:id/decks`); me gusta y comentarios; importación de borradores (`/api/combo-imports/*`).
- `/api/combos/popular-starters` y `/api/combos/by-card/:id` agregan por carta inicial.

## 4. Mazo (herramientas de `DeckView`)

- **Calculadora de consistencia**: tamaño de mazo (1–60), copias, mano, "quiero al menos N" → probabilidad **hipergeométrica en el cliente** (suma con log-factoriales). Modo avanzado: dos grupos A/B (iniciadores y extensores) con condición **Y/O**. Semáforo verde ≥70 %, ámbar ≥40 %, rojo debajo.
- **Etiquetas de rol** por carta: Starter, Extender, Hand Trap, Garnet, Combo Piece, Board Breaker, Engine, Non-Engine. `POST /api/calculator/analyze` recibe `{main_cards, tags}` y la apertura/"brick" se calcula con mano **fija de 5**: `brick = 1 − P(≥1 Starter)`.
- **Mano de prueba**: reparte manos yendo primero/segundo, "¿qué tan jugable es esta mano?" (Mano muerta / Reproducible) con total de sesión.
- **Puentes de Small World**: revelar → desterrar puente (comparte exactamente una estadística) → agregar objetivo.
- **Ayudante de side deck**: elegís arquetipo rival (`/api/sidedeck/suggest`) y sugiere cartas que lo contrarrestan, marcando cuáles tenés.
- **Estadísticas**: tipo, atributo, Extra Deck, curva de nivel/rango.
- **Comparar mazos**: similitud, compartido / solo A / solo B, y qué cambiar para pasar de A a B (`deckDiff`).
- **Historial**: instantáneas con nota, vista previa y restaurar (también automáticas y "pre-restauración").
- **Valor y costo**: precio del mazo, costo de crafteo de Master Duel (30 CP por carta, simplificado), exportar/comprar en TCGplayer, Cardmarket, CoolStuffInc.
- **Colección vs mazo**: "cartas que necesitás", solo faltantes / mazo completo, lista de deseos; **Sugerencias de mazo** (Pro): mazos públicos que podés armar con tu colección y su porcentaje de completitud.
- Import/export: `.ydk` (`ydkParser`/`ydkSerializer`), texto, YGOPRODeck, Neuron; exportar como imagen; QR de compartir.

## 5. Asistente de duelo (`/duel`, sin conexión)

LP con teclado y botón de mitad, cronómetro de partida, dados y moneda, contadores (incl. Mágicos), **deshacer**, registro del duelo, "partidas del encuentro" (G1: ganador / empate), **plan de emparejamiento** (arquetipo rival, plan de side, notas), modo **cara a cara** (panel rival girado) y modo de enfoque, sonidos con silencio. Búsqueda por cámara solo con sesión.

## 6. Resto del producto (visto por rutas y endpoints; sin profundizar)

Colecciones (carpetas, valor y tendencia, completitud de set, auditoría, objetivos, productos sellados, exportar), escáner por cámara y por lote con traspaso móvil↔PC (`scan-handoff`), intercambios y mercado con reputación y disputas, vigilantes de precio con push, listas prohibidas por formato (`/api/banlist/hub/*`), torneos (facetas, jugadores), arquetipos con comunidad, calendario de lanzamientos, abridor de sobres (`pack-pool`), impresora de proxies (PDF en el cliente), artículos con editor y comentarios, noticias, programa de socios creadores, hoja de ruta con votos, perfil público, seguidores y feed.

## 7. Límites Free / Pro (`GET /api/system/plan-limits`)

Precio Pro: **US$3,99/mes o US$34,99/año** (−27 %), pago por PayPal, prueba de 14 días sin tarjeta y cupones. Fuente: `/pricing` y `GET /api/system/plan-limits`.

| | Gratis | Pro |
| --- | --- | --- |
| Base de cartas y búsqueda, constructor de mazos y **todas** sus herramientas, asistente de duelo, constructor de combos y artículos, cartas en 5 idiomas, ver el Trading Hub | sí | sí |
| Entradas de colección | 100 | ilimitadas |
| Escaneos de cámara / por lote | 50 / 10 por mes | ilimitados |
| Vigilantes de precio | 0 | 30 con alertas por correo |
| Participar en el Trading Hub | no | sí (Pro verificado, no de prueba) |
| Privacidad de mazos y colecciones | solo público | público, no listado y privado |
| Auditoría de colección | solo resumen | hallazgos y correcciones en lote |
| Carpetas, historial y archivo de mazos; sugerencias de mazo | no | sí |
| Exportar mazo o combo a video (Reels); insignia Pro | no | sí |
| Marca de agua en proxies | sí ("YGOPocket FREE") | no |

Lectura: lo que da usuarios (calculadoras, combos, constructor) es gratis; cobran por **uso intensivo de servidor** (escaneos, alertas, almacenamiento) y por comodidad (historial, privacidad, video).

## 8. Qué conviene replicar en Probability Lab (recomendación)

Ordenado por valor y encaje con lo que ya tenés:

1. **Esquema de pasos con cadenas** (§3): es el hueco más claro. Tu mesa ya mueve cartas; guardar la práctica como `Step{action, fromZone, toZone, materials, chainToPrevious}` permite reproducirla, exportarla y compartirla. Empezar por el vocabulario de §3, no por la UI.
2. **Comparar mazos** y **historial de versiones** (§4): baratos, sin backend (localStorage + JSON), y complementan tu export `.txt/.json` y la copia de seguridad.
3. **Small World** y **ayudante de side**: el primero es cálculo puro sobre el mazo; el segundo necesita datos de arquetipos (ya los tenés del Meta).
4. **Plan de emparejamiento y partidas del encuentro** en la calculadora de LP: te faltaba el registro de partidas/notas (lo marcaste en B-07).
5. **Reel de video local** (§3): vistoso pero grande; dejarlo para después de tener el guion.

Lo que **no** conviene copiar: su matemática de apertura (mano fija de 5, solo "brick" por Starter) es más pobre que tu Lab, que tiene turno, roles y patrones; "¿qué tan jugable es la mano?" ya lo probaste en la mesa y lo revertiste (#185), ellos lo tienen en una herramienta de mazo aparte, no sobre la mesa; y los precios, escáner e intercambios requieren backend, licencias de datos y moderación que quedan fuera de tu app sin servidor.

## 9. Formas de datos reales capturadas con REA

Capturadas cargando 10 pantallas con `rea capture-browser-scenario` (Edge sin ventana, 775 requests, cuerpos incluidos). Solo claves y tipos.

- **Historial de banlists** (`/api/banlist/hub/index?format=`): 75 listas por formato, cada una con `{id (fecha), date, state: current|…, until, entryCount, changeCount, tightened, loosened, previousId, nextId}`; el bloque `current` trae la vigente de **tcg, ocg, master_duel y genesys** (con id numérico en Genesys). `/api/banlist/hub/list` filtra por `date, view, q, status, grouping` y devuelve `entries[{cardId, konamiId, name, type, value, previousValue}]`, `counts` y `unknownCount`. Es la fecha efectiva y el cambio contra la lista anterior que tu app dejó diferidos (B-09): el modelo es "una lista = una fecha, con enlace a la anterior y a la siguiente".
- **Carta** (`POST /api/cards/resolve`, por lote de ids): `{id, name, type, frameType, desc, atk, def, level, race, attribute, archetypes[], scale, linkVal, linkMarkers[], banTcg, banOcg, banGoat, mdRarity, genesysPoints, tcgDate, ocgDate, formats[]}`. Detalle útil: estado de prohibición **por formato dentro de la carta**, puntos Genesys y rareza de Master Duel.
- **Arquetipos** (`/api/archetype-stats`): nombre en 7 idiomas (`name_i18n`: de, es, fr, it, ja, pt, zh-CN), conteos monstruo/mágica/trampa, raza y atributo principal con su porcentaje, mecánica destacada, `labels`, `is_playable`, primera y última salida, precio mínimo; `lookup?name=` agrega las cartas; `decks?name=` lista mazos con `copies` y umbrales `engine_min` / `core_min`. Todo esto se puede **derivar en el cliente** del campo de arquetipo de cada carta, sin servidor.
- **Torneos** (`/api/tournaments/facets`): filtros por año (19), categoría (5, p. ej. regional), formato (8), país (78), nivel (5), tipo de mazo (335) y rango de jugadores; el resumen trae eventos, jugadores reportados, top results y listas. Es el mismo modelo de tu pestaña Meta, con más facetas.
- **Sets** (`/api/sets`): `{set_name, set_code, region, num_of_cards, total_cards, tcg_date, is_upcoming, set_image, set_type}` con `effective_region` (resuelve la región por usuario).
- Ruidos de arranque en toda pantalla: `exchange-rate`, `system/version`, `announcements/active`, `social-links`.

## 10. Qué aportó REA y qué no (para ser claros con la herramienta)

Corrió REA 6.4.0 por CLI (`npx`, sin `setup`), con Node 22.14 (pide ≥22.19: dio avisos de engine pero no fallos). Se midió:

| Comando | Resultado | Valor para este estudio |
| --- | --- | --- |
| `capture-browser-scenario` | 20 pasos, 71 s, 58 MB de evidencia con red y cuerpos | **Alto**: da las respuestas reales de la API por pantalla, con procedencia. |
| `export-web-scripts` | 457 archivos / 16 MB con manifiesto verificado por digest | Medio: deja el JS en disco para inspección reproducible. |
| `analyze-javascript-application` | 456 archivos, 3,4 M nodos de AST, 0 fallos de parseo; recuperó claves de `localStorage` (tema, menú lateral, consentimiento, auth) | **Bajo** en este caso: está pensado para Electron/Node; los "endpoints" que reporta son parámetros de URL. |
| `analyze-web-bundle` | 9,7 s; confirma **Vite + React** (confianza media), 89 scripts, grafo de chunks | Medio: identifica el stack con evidencia, pero detecta 16 endpoints contra los 331 `/api/...` que sacó la lectura de cadenas del bundle. |

Conclusión: REA es la mejor fuente para **lo que la app realmente pide y recibe**; para el **mapa completo de rutas de API** rindió más buscar cadenas en los módulos. Conviene usar ambos.

## 11. Las piezas que quedaban

### Impresora de proxies (`/proxy-printer`): 100 % en el cliente, replicable

- PDF generado con **pdf-lib** en el navegador. Carta de **59 × 86 mm**, **3 × 3 por hoja** (9), centrada, con **marcas de corte** de 4 mm fuera de cada línea de la cuadrícula.
- Papel A4 (210 × 297) o Carta (612 × 792 pt); lo elige por idioma del navegador (en-US, en-CA, en-MX → Carta).
- Fuentes de cartas: un mazo guardado, un archivo `.ydk` o búsqueda carta por carta, con cantidad y "cambiar ilustración". El side deck va apagado por defecto.
- Baja la imagen "full" de cada carta una sola vez, la incrusta (JPG, con PNG de respaldo) y, si falta, dibuja un recuadro gris "CARD ART UNAVAILABLE" con el id. Barra de progreso por carta.
- Aviso al usuario: imprimir al 100 %, fundas opacas con una carta real detrás, solo para pruebas. Cuenta gratis: marca de agua diagonal.
- Para ti: se puede hacer **sin dependencia** con una hoja `@media print` (`@page` + cuadrícula CSS en mm); pdf-lib solo hace falta si querés descarga directa de archivo.

### Abridor de sobres (`/pack-opener`): simulador con datos de apoyo

`GET /api/sets/:code/pack-pool` devuelve:

```
{ set_code, set_name, region, pack_size, pack_size_known, packs_per_box,
  pools: { "<rareza>": [ {printing_id, card_id, card_name, set_code, set_rarity, art_variant, …} ] },
  slots: [ { count, weights: { "<rareza>": peso } } ],
  chase: [ { rarity, cards, one_in, basis: "estimated"|"measured", measured_on } ],
  art_chase: [ { variant, cards, one_in, basis } ],
  layout_source: "estimated", layout_confidence: "unverified" }
```

Algoritmo (leído del módulo): por cada **slot × cantidad** elige una rareza **ponderada** por `weights`, y de ese pool saca una carta **sin repetir dentro del sobre**, descartando las variantes de arte salvo que el pool no tenga otras. Las rarezas sin tasa oficial se tratan como **cartas chase**: interruptor "activado: pueden salir los grandes premios", con tasa "~1 de cada N sobres" y su base (Konami no publica; recuento de la comunidad o estimado). Extras: tamaño de sobre ajustable, **caja sellada** de N sobres con comparación contra lo esperado y cuántas cartas distintas dio, revelado carta por carta, historial de sesión y "agregar a la colección". Honestidad de datos: marca `layout_confidence: unverified`.

### Escáner (identificar cartas): necesita servidor

El cliente solo **reduce la foto a 2400 px de lado mayor y la recomprime a JPEG 0,9** (si pesa menos). Luego envía `FormData` con `file`, un `crop_hint` opcional de 4 puntos y un `retry_token`; hay `GET /api/cards/scan/status` para las cuotas (individual y por lote) y `POST /api/cards/:id/infer-print` para deducir **qué impresión** exacta es una carta ya conocida. El reconocimiento y el índice (`scan-index/rebuild`) viven en el backend. **Traspaso del teléfono**: sesión en el servidor con **QR de un solo uso que caduca**; el móvil sube fotos con un tope por sesión y el PC las va leyendo (`photos?after=`). No es replicable sin backend; una versión local solo serviría para escanear el código del set impreso en la carta.

### Intercambios y mercado (Trading Hub)

Pestañas Explorar, Buscar cartas, Ofertas, Actividad y Mis solicitudes; colecciones públicas de venta/intercambio filtradas por país, estado y ciudad; **coincidencia de intercambio** entre dos usuarios ("tienen · querés" / "tenés · quieren"); ofertas con mensajes, aceptar/rechazar, disputas y reputación; valoración "declarada por el dueño" cuando no hay precio de mercado. Participar exige Pro verificado. Es un producto social con moderación: **fuera del alcance de una app sin servidor**.

### Auditoría de colección (Pro)

Analiza todas las colecciones juntas contra reglas que elige el usuario: **playset** (umbral, p. ej. 3), lista de prohibidas aplicada (TCG o ninguna), comparar **por carta o por impresión exacta**, y contar copias en "colecciones generales" o "todo lo que poseés" (una carpeta de intercambio guarda excedente a propósito). Detecta sobrantes, dispersión de copias y filas sin impresión asignada, con correcciones en lote. La idea de **playset + identidad carta/impresión** sí es reutilizable si algún día manejás colección.

### Vigilantes de precio, carta y completitud

- Vigilantes: alertas por correo de TCGplayer y Cardmarket, "consultar ahora" con enfriamiento, 30 máximo en Pro. Requieren servidor.
- Carta: `GET /api/cards/:id`, `/prints` (**67 impresiones** de una sola carta con set, rareza, precio, región y variante de arte), `/artworks`, `/trend-prices`, `/market-history` (ventas completadas de eBay) y **`/api/banlist/history?name=` → historial de la carta por formato**.
- Completitud de set: "tenés X de Y · faltan Z" con lista de faltantes por expansión. Calendario de lanzamientos: `GET /api/calendar/sets` → `{events[{setCode, region, title, date, url}], nextAfter}`.
- Estados de condición NM / LP / MP / HP / DMG con ajuste de precio por condición.

### Hoja de ruta pública (`/roadmap`)

Votación de lo que construyen. Hoy hay **un ítem aprobado: "Importar mazo desde imagen"** (el escáner lee las cartas de una foto y arma el mazo), publicado el 30/07/2026. Esquema: `{id, title, description, status, voteCount, votedByMe, createdAt, launchedAt}`.

## 12. Siguientes pasos sugeridos

Todo lo que se podía observar está documentado. Lo que sigue ya no es investigación sino decisión: qué de las secciones 3, 4, 8 y 11 querés implementar y en qué orden. Candidatos baratos, sin servidor: **impresión de proxies con `@media print`**, **comparar mazos**, **historial de versiones**, **banlists con fecha y cambio contra la lista anterior**, **simulador de sobres** (necesita una fuente de rarezas por set) y el **esquema de pasos con cadenas** para la mesa.

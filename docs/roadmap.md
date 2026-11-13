# Roadmap

El único lugar de lo pendiente: qué falta, en qué orden y qué espera una decisión. Lo hecho se borra de acá (queda en `git log`);
lo que se descarta pasa a «En pausa» con su porqué. Tamaño: S (horas), M (un día), L (varios).

## En curso

**Bot para jugar en contra** (L, por etapas). Hecho: la interfaz `Bot` (`app/auto/bot/`) con su vista limitada a su asiento, el
motivo de cada decisión, la hoja «Qué hizo el bot y por qué», la prueba de privacidad con el núcleo real y las reglas de reacción
(Skull Meister, Kuriboh!, Bystial, Shifter, Fleurdelis, Godos, Herald) y un turno propio mínimo (interruptor «El rival juega su
turno»: invoca, barre, ataca seguro, Lava Golem, Sphere Mode, Gallant Bandit, Evenly Matched, Lightning Storm, Book of Moon,
Called by the Grave), tres ejecutores, Sky Striker, Angelechy (puro, en lugar de Despia Branded) y Elfnote (`botDeck`; sus listas en `app/bot-deck-lists.ts`), y la
pantalla Solo para elegirlos (un bot por mazo, con «Ver mazo»; `BOT_DECK_MENU` sale de ese archivo). Sigue: más ejecutores (Ryzeal),
cada uno con su goldfish y su fuzz; el registro del bot dibuja un cuadro vacío en «Terminé el turno» (no nombra carta). Sin regla: Contact «C» (con ella en juego y un mazo de Sincronía el núcleo tarda ~23 s por jugada),
Shiina, Token Collector y Gnomaterial; Sphere Mode no juega con 3 monstruos propios; la hoja no conoce los `alias`.

## Próximo

En orden de valor sobre costo.

1. **Campo del celular en vertical** (L, idea abierta): acercar, desplazar o girar el campo para cartas más grandes; el techo hoy
   es `compact-field.ts` (a 320×568 las pilas miden unos 28 px de ancho y a 360×640, unos 41). Se propone antes de construir.
2. **Detalles de responsive** (S cada uno): miniaturas de artes 36×53 y puntos del carrusel 24×44 (menos de 44 px), asa de las
   hojas de 28 px, chips «Salidas» de 32 px, las barras de arriba y abajo comen
   120 de 360 px con el celular acostado, y `ReplayBar` y las muestras del duelo de `/playground` a 320 px.
3. **Rarezas** (M): el nombre de la lámina con la forma de las letras y el brillo de los marcos de otros tipos (Xyz, Link…).
4. **Video de replays** (S): con 30 cuadros constantes, armar un duelo largo tarda ~3,5 veces más; palanca: 15 cuadros por segundo
   sólo pasados 3 minutos, si en el celular pesa.
5. **Rendimiento en el celular** (L): el primer cálculo de estilos del Deck, el layout del buscador de la app (`FeatureSearch`) y
   la sala por enlace (`AutoDuelScreen`) sin piezas estables. Se mide con el build de producción (`docs/movimiento.md`).
6. **Chicos** (S): el buscador de la app no tiene enlaces por fecha a Banlists;
   en la sala, mientras gira, el dado de un jugador tapa su chip «Listo» (`DieSeat` en `toss-views.tsx`); en un celular bajo,
   antes de estar listo, la sala todavía se desplaza (320×568 sigue con algo de scroll aun ya listo); en Jugar solo, salir de
   la mesa a otro paso y volver con Atrás cambia la mano y la fase (medido con «Inicio» y con «Tier lists»): la práctica no se conserva.
7. **`Field` y más `Tabs`** (M): una fila «rótulo + control» en vez de 6 maneras distintas; `Tabs` en Importar deck y Pasos · Combos.
8. **Arranque de «Inicio»** (M): la visita nueva en `/` baja ~342 KB gz de JS (la app entera). Los textos en español viajan todos
   en el archivo principal (56 KB gz de sus 143): separarlos por área toca `i18n/index.ts`. Además `MainApp` pide reglas de
   cartas y tablas de Edison/Genesys también en `#inicio`: que esperen a que el paso no sea `inicio`.
9. **La sección «Duelo por enlace» de `/playground` tarda ~14 s de layout a 390 px** (sin freno; en escritorio, 1 s): falta hallar la muestra (S).
   **Textos apagados con opacidad** bajo 4,5:1: insignia «Atacar» (4,33), inicial de una carta sin imagen
   (4,24), «Interacción y soporte externo» (3,81) y «Sin objetivo» del catálogo (S). `Segmented` sin flechas (S).

## Espera a Gastón

- **Reportar un problema:** el token de `GITHUB_BUG_TOKEN` vence en la fecha que se eligió al crearlo; renovarlo (token fino nuevo,
  sólo Issues de este repo, y redeploy) antes, o el endpoint contesta 502 y la pantalla avisa que no se pudo enviar.

- **Cuentas:** activar «Allow GitHub Actions to create and approve pull requests» (Settings → Actions → General) para que
  `sync-auto-data.yml` abra su PR semanal; las tareas de `docs/seguridad.md` («Lo que sólo hace quien administra las cuentas»),
  sin confirmar si ya están.
- **En celulares reales (iOS y Android):** el video nuevo, los carteles de fase, el toque largo y el arrastre de la mesa, el
  teclado sobre la botonera, la barra blanca de Android tras reinstalar la PWA y la mascota flotante, que a 390 px tapaba el ⏮
  del reproductor.
- **Con dos navegadores y el relay:** el duelo por enlace automático (pasar de manual a automático y volver, reconexión, revancha)
  y el aviso de cadena del manual.
- **En producción:** que el Strategy Score de Angelechy excluya sus copias (cartas ascendidas del núcleo).
- **Decisiones:** la dependencia `motion` (hoy no está instalada); las filas del creador de tier lists entre 390 y 413 px (tres
  cartas por renglón: ¿achicar la carta o ir de borde a borde?); qué secciones faltan en Descubrir y en qué orden; qué más suma
  «Preguntarle al rival si responde» (hoy 🤔, 👍 y el chat); qué mostraría el botón «Info» y el «+» de la mesa (fichas,
  contadores, moneda, dado); si «Descargar video» de la barra del combo compartido lleva texto en escritorio (hoy es ícono).

## En pausa o descartado

No se vuelve a proponer sin un motivo nuevo.

- **Búsqueda general para el bot:** volver a un estado cuesta ~35 ms más ~0,3 ms por respuesta en escritorio (~12× en el celular) y
  lo oculto no se puede sortear; pide copia de estado, un servidor o un modelo entrenado.

- **Espectadores en salas automáticas:** el relay reenvía todo texto de un jugador a los espectadores, que verían el deck y la
  mano del invitado; abrirlas pide cifrado entre jugadores o un flujo aparte (`docs/duelos-automaticos.md`).
- **Acortador de enlaces con servidor:** se eligió un formato compacto sin servidor.
- **El logo:** en pausa hasta que Gastón lo retome.
- **Ver juntos los disparos con su número de eslabón:** el núcleo no dice cuántos quedan por preguntar.
- **Violeta dudoso en Duelo y Jugar:** la pasada corrigió lo claro (la fase de ahora en ámbar al mirar) y lo demás se deja así: empate
  y «vas segundo» en violeta (`DuelBanner`, `DuelMedal`), victoria del piedra-papel-tijera en lila (`DuelGames`), salas que esperan
  (`ArenaPanel`), aro de la carta arrastrada (`PracticeHand`), tipo de carta (`CardSheet`), cambio de fase de Pasos
  (`PracticeMatPanel`), luz y bisel de la carta grande (`DuelCardDock`), play y «enviar» con relleno (`ReplayBar`, `DuelChat`).
- **Límites aceptados que viven en su doc:** pasar de manual a automático reinicia el turno y pierde equipos y contadores
  (`app/auto/resume.ts`); sin volver atrás tras un error en el enlace automático y el guardado que no cubre un cambio de
  `ocgcore-wasm` (`docs/duelo-automatico-enlace.md`); el reloj de turnos que hace rendirse desde el propio dispositivo
  (`docs/duelo.md`).

## Limpieza de código

Lo que queda después de auditar el repo entero.

- **Sin uso:** ni archivos, ni tests huérfanos, ni dependencias. `scripts/barrido-alineacion.js` es a propósito.
- **`export` de más:** ~250 símbolos que sólo usa su archivo y ~30 funciones que sólo usa su test (costuras y referencias).
- **Sólo en `/playground`** (decide Gastón): el kit `feel-*` de `index.css`.
- **Enlace viejo** (decide Gastón: sacarlo rompe lo ya compartido): la rama `j` sin comprimir del enlace de un combo.
- **Duplicado:** la búsqueda de cartas de escritorio y de celular (`DesktopSearchPanel`, `MobileCardSearch`).
- **Sin auditar a fondo:** `duel-session.ts`, `auto/online.ts`, `practice-mat.ts`, `ask-ui.ts`, `adapter.ts` y el interior
  de `PracticeMat.tsx`.
- **Constantes que se separaron:** `CLASSIC_CHROME_PX` de `app/duel-rails.ts` sigue en 30,45 rem y la mesa usa 30,8 rem.
  `Skeleton` impone `relative`, así que el `absolute inset-0` que le pasan `CardPicker.tsx` y `PileViewer` no rige (en `CardArt`
  se arregló con `absolute!`; el fondo es que `Skeleton` no lo imponga).
- **Datos a mano:** ningún workflow corre `sync:effects` (la capa 1 del motor) ni `sync:genesys`; `sync:effects` baja CardScripts
  de `master` sin fijar el commit (decidir si se fija como en `auto-data.lock.json`). Las muestras y los scripts de medición del
  filtro Efecto no están en el repo (`docs/motor-de-cartas.md`).
- **CSS propio:** `src/foil.css` (28 KB) es la excepción heredada a «Tailwind, nunca CSS puro»; migrarlo a `@utility` y `@theme`.
- **Archivos grandes** (candidatos a partir; los toca casi todo cambio): `PracticeMat.tsx` (~3.500 líneas), `DuelScreen.tsx`
  (~2.000), `duel-session.ts` (~1.800), `auto/online.ts` (~1.600), `use-auto-asks.tsx` (~1.550), `practice-mat.ts` (~1.400).

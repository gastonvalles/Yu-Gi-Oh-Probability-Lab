# Roadmap

El único lugar de lo pendiente: qué falta, en qué orden y qué espera una decisión. Lo hecho se borra de acá (queda en `git log`);
lo que se descarta pasa a «En pausa» con su porqué. Tamaño: S (horas), M (un día), L (varios).

## En curso

**Bot para jugar en contra** (L, por etapas). Hecho: la interfaz `Bot` (`app/auto/bot/`) con su vista limitada a su asiento, el
motivo de cada decisión, la hoja «Qué hizo el bot y por qué», la prueba de privacidad con el núcleo real y las reglas de reacción
(Skull Meister, Multiplying Kuriboh!, Bystial, Dimension Shifter, Fleurdelis, Godos, los Herald). Sigue: un turno propio mínimo
(hoy el bot no juega su Main Phase: Lava Golem, Sphere Mode y Gallant Bandit esperan a eso); después, un ejecutor por mazo (Sky
Striker, Branded, Ryzeal, Elfnote) con su goldfish y su fuzz. Sin regla: Contact «C» (con ella en juego y un mazo de Sincronía el
núcleo tarda ~23 s por jugada) y las que el núcleo ofrece y no están (Shiina, Token Collector, Gnomaterial).

## Próximo

En orden de valor sobre costo.

1. **Links y Extra Deck en la mesa** (S). Un Link en la zona de Mágicas y Trampas ofrece «Poner boca abajo» (`listCardActions`,
   `app/practice-mat.ts`), y un monstruo del Extra que va a la mano o al Main Deck no se desvía al Extra (`move` del reductor).
   Son reglas del juego que la mesa manual ya sabe.
2. **El visor de una pila nombra dos veces cada carta** a un lector de pantalla («Maxx CMaxx C»: el `alt` de `CardArt` más el
   texto, sin `aria-label` en el caso común; `PileViewer` en `MatDialogs.tsx`) (S).
3. **Lab y Comparar** (S cada uno): «Aplicaste el cambio» (`LabAppliedNotice`) pasa al `AppToast`, que ya lleva acción (su
   comentario dice lo contrario); ▲/▼ en las filas de `LabRuleList` con un borrador (`LabDelta`); la sugerencia del Lab en los
   vacíos de Comparar (`CompareEmpty`).
4. **Enlace del replay de un duelo más corto** (M): `duel-replay-share.ts` sigue en el sobre v1; con la forma compacta del combo
   (`combo-share.ts`, v2) bajaría un 30–40 % y entrarían duelos más largos en un enlace.
5. **Péndulo** (M). Hoy se invoca de a una carta y el rango no se muestra ni se valida. Plan: elegir varias de la mano y del Extra
   boca arriba con el rango resaltado y después validar; un deck guardado sin `scale` queda «sin rango», nunca un número inventado.
6. **Control de un Xyz con material y de una ficha** (M): el espejo del rival ya sigue al núcleo (`swap`, cambio de código,
   bolsas y materiales Xyz en `MatState.held`), pero al pasar el control de un Xyz con material `give` manda los materiales al
   cementerio, y `give` y `regain` rechazan fichas (`mat-control.test.ts` lo exige en la mesa manual). Es cambiar la mesa manual y
   su protocolo (`mat-control.ts` completa del otro lado esas jugadas).
7. **Handtraps en tableta** (M): por debajo de 1101 px va la franja chica del celular (`RivalHandStrip`, alto fijo) aunque el
   campo sea ancho; escalarla entre 640 y 1100 px.
8. **Campo del celular en vertical** (S/L): a 360×640 los chips de salida tapaban la fila de pilas (S, sin arreglar). Acercar,
   desplazar o girar el campo para cartas más grandes (L, idea abierta; el techo hoy es `compact-field.ts`).
9. **Sala del duelo en un celular bajo** (~700 px) se desplaza en la tirada del dado (S): plegar las reglas y el deck en una fila.
10. **El violeta en Duelo y Jugar** (M): la pasada de la auditoría del violeta por esas pantallas (regla en `docs/design-system.md`).
11. **Detalles de responsive** (S cada uno): miniaturas de artes 36×53 y puntos del carrusel 24×44 (menos de 44 px), asa de las
    hojas de 28 px, chips «Salidas» de 32 px, «Match · mejor de 3» en tres renglones a 320 px, las barras de arriba y abajo comen
    120 de 360 px con el celular acostado, y `ReplayBar`, `LabChangeCard` y las muestras del duelo de `/playground` a 320 px.
12. **Rarezas** (M): el nombre de la lámina con la forma de las letras y el brillo de los marcos de otros tipos (Xyz, Link…).
13. **Video de replays** (S): con 30 cuadros constantes, armar un duelo largo tarda ~3,5 veces más; palanca: 15 cuadros por segundo
    sólo pasados 3 minutos, si en el celular pesa.
14. **Rendimiento en el celular** (L): el primer cálculo de estilos del Deck, el layout del buscador de la app (`FeatureSearch`) y
    la sala por enlace (`AutoDuelScreen`) sin piezas estables. Se mide con el build de producción (`docs/movimiento.md`).
15. **Chicos** (S): el buscador de la app no tiene enlaces por fecha a Banlists; `/playground` no tiene muestra del parallax.

## Espera a Gastón

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
- **Límites aceptados que viven en su doc:** pasar de manual a automático reinicia el turno y pierde equipos y contadores
  (`app/auto/resume.ts`); sin volver atrás tras un error en el enlace automático y el guardado que no cubre un cambio de
  `ocgcore-wasm` (`docs/duelo-automatico-enlace.md`); el reloj de turnos que hace rendirse desde el propio dispositivo
  (`docs/duelo.md`).

## Limpieza de código

Inventario, sin ejecutar. `npx knip` es la fuente de lo que no se usa.

- **Archivos sin uso:** `src/components/probability/lab-styles.ts` (nadie lo importa). `scripts/barrido-alineacion.js` es a
  propósito: se pega en la consola (`docs/design-system.md`).
- **Exports sin uso fuera de su archivo:** ~40 (p. ej. `getDerivedCardId` en `calculator-state.ts`, `isSessionActive` y
  `recordDeckChange` en `deck-before.ts`, `useMatTableItems` en `MatBarActions.tsx`, `rematchLabel` en `DuelResult.tsx`) y ~25
  tipos: sacarles el `export` o borrarlos si tampoco se usan adentro. Los de `duel-relay/src/index.ts` son la entrada del Worker.
- **Dependencias:** knip no encuentra ninguna sin uso; `motion` no está.
- **Constantes que se separaron:** `CLASSIC_CHROME_PX` de `app/duel-rails.ts` sigue en 30,45 rem y la mesa usa 30,8 rem.
  `Skeleton` impone `relative`, así que el `absolute inset-0` que le pasan `CardPicker.tsx` y `PileViewer` no rige (en `CardArt`
  se arregló con `absolute!`; el fondo es que `Skeleton` no lo imponga).
- **Datos a mano:** ningún workflow corre `sync:effects` (la capa 1 del motor) ni `sync:genesys`; `sync:effects` baja CardScripts
  de `master` sin fijar el commit (decidir si se fija como en `auto-data.lock.json`). Las muestras y los scripts de medición del
  filtro Efecto no están en el repo (`docs/motor-de-cartas.md`).
- **CSS propio:** `src/foil.css` (28 KB) es la excepción heredada a «Tailwind, nunca CSS puro»; migrarlo a `@utility` y `@theme`.
- **Archivos grandes** (candidatos a partir; los toca casi todo cambio): `PracticeMat.tsx` (~3.400 líneas), `DuelScreen.tsx`
  (~2.000), `duel-session.ts` (~1.800), `auto/online.ts` (~1.600), `practice-mat.ts` (~1.400), `use-auto-asks.tsx` (~1.260).

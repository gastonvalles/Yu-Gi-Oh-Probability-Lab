# Elegir varias cartas en las pilas (plan, 2026-10-21)

**Estado:** plan hecho el 2026-10-21; las tres decisiones de la sección 7 se tomaron por defecto y Gastón todavía no las vio (si las cambia, se ajusta). Se construye en cuatro PR, cada una mergeada por separado:
**A** el visor «Elegir varias» (en `/playground`, sin cablear), **C** la jugada `batch` (modelo, espejo, protocolo, efectos, textos), **B** Target a varias del rival y **D** las varias cartas en la mesa (menú del lote). A y C salen primero y en paralelo; D va después de A, C y de los menús de Xyz. Lo que se mergee se anota en `docs/retomar.md`.

Las rutas y las líneas de abajo son de `origin/main` 600c7ff (antes de #485, #486 y de los menús de Xyz): verificalas antes de editar.


Pedido de Gastón (2026-10-21, textual): «el deck, el gy, el extra y el banish deben tener una opcion de targetear varias cartas, tanto para la funcion target como para seleccionarlas para una misma accion como "enviar a" o "barajar" o "acoplar" etc».

Autor del plan: agente Opus `Plan` (sólo lectura), sobre origin/main 600c7ff. Las rutas y líneas de abajo son de ese SHA: verificalas antes de editar (después se mergearon #485 Péndulo desde la mano y #486 Target en pilas; B1 —menús de Xyz— y Xyz C —materiales visibles— están en vuelo).

## 1. Cómo funciona hoy

- **Un solo visor para las cuatro pilas:** `PileViewer` (`src/components/probability/MatDialogs.tsx:202-279`).
  - El tuyo lo monta `PracticeMat.tsx:2151-2168`. Lleva `key={viewer}`: cada pila arranca de cero.
  - El del rival es el mismo visor con `anonymous` (`DuelScreen.tsx:2026-2039`): sólo su GY, su Banish y lo boca arriba de su Extra.
- **Cómo se abre:** Extra, GY y Banish se abren tocando su casilla (`pileCell`, `PracticeMat.tsx:1607-1641`, onClick en `:1630`). El Main se abre desde el menú del deck, con «Ver» (`:1412-1426`).
- **Qué muestra:**
  - `Modal md` de 44 × 40 rem; en el celular ocupa todo el alto (`Modal.tsx:27`). Título «GY · 12» (`MatDialogs.tsx:225`). Buscador sólo si hay más de 8 cartas (`:230`).
  - Grilla de 5 columnas en el celular y de 5,25 rem en escritorio (`:248`). Scrollea dentro del cuerpo (`Modal.tsx:171`).
  - Orden: el Main desde el tope, el Extra con las boca arriba primero, GY y Banish con la más nueva primero (`:222`). Un Main de 60 son 12 filas de 5 a 390 px.
  - El visor no tiene pie: `Modal` trae `footer` (`:175-180`) pero no se usa.
- **El menú, una carta por vez:** tocar una carta llama a `onPick`, que abre `setMenu({kind:'card'})` (`PracticeMat.tsx:2157-2166`) con las jugadas de `listCardActions` (`:1428`). En escritorio es `CardMenu` pegado a la carta (`MatDialogs.tsx:100`); en el celular es `CardSheet` (`CardSheet.tsx:83`; `sheeted` en `:1477`), encima del visor (z-210 sobre z-180).
- **Jugadas por pila** (`practice-mat.ts:1067-1138`, más el «Adjuntar a un Xyz ▸» de B1):
  - Main: A la mano, Activar / Colocar / Especial ▸, Revelar, Al cementerio, Desterrar ▸, Arriba / Abajo del deck.
  - Extra: invocar (con materiales) o Especial. Boca arriba: A la mano, Péndulo, «Dar vuelta boca abajo». Boca abajo: Revelar. Además, Al cementerio y Desterrar ▸.
  - GY: Especial ▸, a zona de M/T, Activar efecto, A la mano, Target, Desterrar ▸, Al Extra, Al deck ▸ (Al azar / Arriba / Abajo).
  - Banish: igual que el GY, pero con Al cementerio y sin Desterrar.
- **Después de jugar:** toda jugada cierra el visor, salvo Target (`PracticeMat.tsx:943-948`, ahora con la regla de #486: marcar lo cierra). Cerrar el Main baraja (`:867-875`). Lo que sale del Main lleva la semilla del barajado en la misma jugada (`searching`, `:877-882`, `:926-927`).
- **Target:**
  - `{type:'target', id}` pone o quita la marca (`practice-mat.ts:470-477`). Se va sola si la carta se mueve (`:251-252`). Se ofrece en GY y Banish (`:1094-1099`), en la mano y en el campo. **No** en Main ni Extra.
  - Cada marca dura 5 s con su propio timer, que despacha la misma jugada (`TARGET_MS` en `PracticeMat.tsx:381`, timers en `:830-865`).
  - Lo que marcás del rival no es una jugada: es `toggleMark` + `MARK_MS` (`duel-session.ts:1490-1520`, `:189`).

## 2. Diseño de interacción

- **Cómo se entra:** con `Elegir varias` (`secondary sm`, ícono `check-circle`) en el **pie del visor**, en la zona del pulgar. El pie sólo aparece con 2 cartas o más y mide lo mismo en los dos modos.
  - Fuera del modo, tocar una carta abre su menú, como hoy.
  - Descartado: una casilla por carta (44 px no entran en cartas de 66 px de ancho) y el toque largo (#218).
- **Cómo se elige:**
  - Tocar una carta la elige o la suelta. La elegida lleva un aro ámbar de 2 px y su número de orden arriba a la derecha (ámbar con texto oscuro): el orden se usa (sección 3).
  - Hover: el mismo aro ámbar, tenue. Foco: `shadow-focus`. La mira del Target y el aro conviven en la misma carta.
  - Cada carta lleva `aria-pressed`. Un `role="status"` anuncia «N elegidas».
- **Elegir todas:** `Elegir todas` (`tertiary`) va a la derecha del buscador, así que sólo existe donde hay buscador (más de 8 cartas). Elige las cartas visibles, con el filtro puesto (por ejemplo «todas las Lunalight»). Si ya están todas elegidas pasa a `Quitar elección`. Con 8 cartas o menos se tocan de a una (así la grilla no se corre al cambiar de modo).
- **Rango en escritorio:** Mayús+clic elige el tramo entre la última tocada y esa, en el orden que se ve. Sin texto en pantalla; se explica en el `title`.
- **Pie en modo varias:** a la izquierda «N elegidas» (con 0 dice «Tocá las cartas que quieras», que es la razón de que la principal esté apagada); a la derecha `Cancelar` (`tertiary`) y `Elegir jugada` (`primary`).
  - `Elegir jugada` abre el menú del lote: la hoja `CardSheet plain` en el celular o `CardMenu` pegado al botón en escritorio. Sobretítulo «GY», título «3 cartas». Cerrar esa hoja sin elegir deja la elección como estaba.
- **Cómo se sale y qué se pierde:**
  - `Cancelar` o Escape salen del modo. El visor tiene su propio `useEscapeKey`, que queda arriba en la pila de capas (`use-overlay.ts:49-72`): el primer Escape sale del modo y el segundo cierra el visor.
  - La X o tocar el fondo cierran el visor y la elección se pierde. Cerrar el Main baraja, como hoy. Otra pila arranca de cero (por el `key`). Jugar cierra el visor.
  - Si la pila cambia por debajo (por ejemplo con Deshacer), la elección se recorta a las cartas que siguen ahí.
  - Al entrar, el foco va a la primera carta; al salir, vuelve a `Elegir varias`.
  - Prop nueva `onPeek(id)`: un toque fija la carta en el detalle de la izquierda también en modo varias.
- **Estados:**
  - Pila vacía o con una sola carta: sin pie.
  - Una opción del lote que no admiten todas las elegidas va apagada y dice por qué: «No va con Ash y Droll» (hasta 3 nombres; desde 4, «No va con N de las elegidas»).
  - A 320 px la palabra «elegidas» queda `sr-only` y se ve sólo el número: «2 · Cancelar · Elegir jugada» entra en 264 px.
- **En las pilas del rival:** el mismo visor, pero la principal hace la acción directo: `Target`, o `Quitar target` si todas ya están marcadas.

A 390 px, eligiendo (aro ámbar con el número de orden; ⊕ = la mira):
```
┌ Mesa ──────────────────────────── ✕ ┐
│ GY · 12                             │
├─────────────────────────────────────┤
│ [Q Buscar carta     ] Elegir todas  │
│ ┏━━┓ ┌──┐ ┏━━┓ ┌──┐ ┌──┐           │
│ ┃ 1┃ │  │ ┃ 2┃ │ ⊕│ │  │           │
│ ┗━━┛ └──┘ ┗━━┛ └──┘ └──┘           │
├─────────────────────────────────────┤
│ 2 elegidas  Cancelar [Elegir jugada]│
└─────────────────────────────────────┘
```
- Fuera del modo, el pie lleva sólo `[◉ Elegir varias]` a la derecha.
- La hoja del lote (GY · 2 cartas): `[A la mano] [Desterrar ▸]`, `[Al deck ▸] [Adjuntar a Zeus]`, `[Target]` y, apagada, `[Al Extra Deck · No va con Ash]`.

A 1440 px (7 cartas por fila; Mayús+clic elige el tramo):
```
┌ Mesa · Main · 34 ───────────────────────────────── ✕ ┐
│ [Q Buscar carta                        ] Elegir todas │
│ ▣1 ▢  ▢  ▣2 ▢  ▢  ▢                                   │
├───────────────────────────────────────────────────────┤
│ 3 elegidas                    Cancelar [Elegir jugada] │
└───────────────────────────────────────────────────────┘
```
El `CardMenu` sale pegado arriba del botón.

## 3. Qué se puede hacer con varias cartas, por pila

**Regla:** se ofrece lo que `listCardActions` da a **todas** las elegidas. Se compara la jugada sin la carta («move→banished·boca abajo», «attach→Zeus»). Lo que tienen sólo algunas va apagado y dice por qué. Entran sólo mover, Target, Adjuntar y Revelar: lo que pide zona o posición no. Como sale del menú de una carta, lo de B1 y lo que venga se hereda solo.

| Jugada | Main | Extra | GY | Banish | Rival |
|---|---|---|---|---|---|
| Target | no (D1) | no (D1) | ✓ | ✓ | ✓ (marcas) |
| A la mano | ✓ (buscar) | sólo boca arriba | ✓ | ✓ | no |
| Al cementerio | ✓ | ✓ | no | ✓ | no |
| Desterrar ▸ boca arriba / boca abajo | ✓ | ✓ | ✓ | no | no |
| Al deck ▸ Al azar / Arriba / Abajo | Arriba / Abajo del deck | Péndulos boca arriba | ✓ | ✓ | no |
| Al Extra (boca abajo; Péndulo boca arriba) | Péndulo boca arriba | de boca arriba a boca abajo | ✓ | ✓ | no |
| Adjuntar a un Xyz ▸ | monstruos | no | monstruos | monstruos | no |
| Revelar | ✓ | boca abajo | no | no | no |
| Invocar / Activar / Colocar | no: de a una (D2) | | | | |

- **Barajar** es «Al deck ▸ Al azar» con varias: las cartas entran al Main y se baraja **todo una vez** (`[move…→deck, shuffle]`). El registro dice «Barajás A, B y C dentro del deck». En el Main no se ofrece: el menú del deck ya tiene «Barajar».
- **Orden:** el de elección. Arriba del deck: la primera elegida queda arriba de todo (las partes van al revés). Abajo del deck: la primera elegida queda más arriba. A la mano y como materiales: en el orden en que se eligieron.
- **Desde el Main:** todo lote que saca cartas del Main baraja el resto **dentro del mismo lote** (`[shuffle, move…]`; así «Arriba del deck» queda arriba). El visor se cierra con `setViewer(null)`, sin el barajado aparte. Lo que es del tope sin mirar sigue en el menú del deck.
- **Target:** marca sólo las que no están marcadas. Si ya lo están todas, ofrece «Quitar target», que las desmarca a todas.

## 4. Modelo de datos y efectos

**Una sola jugada nueva, no N jugadas sueltas.** Si se despachan N jugadas en el mismo toque, React las junta y el cursor salta N de golpe. Con eso: la mesa corta los efectos y no suena nada (sólo corren con el cursor de a uno: `PracticeMat.tsx:603-616`, `use-practice-sounds.ts:26`, `use-duel-sounds.ts:32`); quedarían N pasos, N líneas en el registro y N «Deshacer»; en el duelo, N pedidos al rival (`duel-session.ts:709-720`) y N mensajes contra un relay que acepta 30 por segundo.

```ts
/** Varias cartas en una jugada: partes en orden, de un tipo y destino, con un `shuffle` al principio (salen mirando el Main) o al final (Al azar). */
| { type: 'batch'; actions: MatAction[] }
```

- **Reducer:** `action.actions.reduce(matReducer, state)`, ignorando un lote dentro de otro. Es lo mismo que ya hacen `tribute` y `summon` (`practice-mat.ts:407-421`, `:435-454`). El espejo del rival sale idéntico sin tocarlo, porque `mirrorApply` vuelve a correr el reducer (`mat-public.ts:232`).
- **Lugares a tocar** (los switches exhaustivos los marcan solos):
  - `mapActionIds` (`mat-public.ts:57-100`): renombra las partes.
  - `shownBy` (`:123-127`): las cartas que van a la mano o se revelan se le muestran al rival.
  - `actionChecks` (`duel-protocol.ts:193-215`): de 1 a `MAX_CARDS` partes, sólo `move`, `target`, `attach`, `reveal` y `shuffle`, sin un lote adentro.
  - `sfxOfAction` (`sfx.ts:13`): el sonido de la primera parte, uno solo.
  - `cardsOf` (`mat-steps.ts`): las miniaturas del paso.
  - `describePlay`: una sola línea.
- **Deshacer:** un paso por lote, y en el duelo un solo pedido al rival.
- **Registro:** se reusan las frases de una carta, con `{card}` = la lista armada con `listNames` (`practice-mat.ts:767`): hasta 3 nombres, desde 4 «N cartas». Ejemplos: «Mandás Ash, Maxx C y Droll del deck al cementerio», «Desterrás 10 cartas boca abajo», «Buscás A y B del deck a la mano y barajás». Las frases en tercera persona (`toGy`, `toExtra`, `toExtraFaceUp`, `pileToHand`) pasan a `{ one, other }` para que concuerden. En ES y EN.
- **Replays y combos guardados:** el lote se guarda como una jugada. «Qué se mueve», el tablero chico y las flechas salen de comparar el estado antes y después (`mat-step-info.ts:92-103`, `mat-arrows.ts:42-52`), así que el lote da una sola flecha «Main → GY ×3». El chip y el color salen de `matEffects`.
- **Efectos:** `matEffects` junta los de las partes: `quiet`, `showcase` y `spotlight` suman sus ids, y hay `shuffle` si alguna parte baraja. `spotlight` gana un campo `ids?` (la primera sigue en `id`). Lo leen el centro de la mesa (`PracticeMat.tsx:632-638`) y el rival (`DuelScreen.tsx:1449-1461`).
- **Qué ve el rival:** mientras elegís, lo de hoy («Ana está mirando su Main»): la elección no viaja. Al jugar le llega **un solo** `act`: los vuelos de dorso escalonados y la línea «Ana manda 3 cartas al cementerio», que ya tiene plural (`DuelScreen.tsx:1469`, `:1474`). Lo que va a tu mano se le muestra, y tu Main se baraja a la vista si el lote barajó. Hay que pasar a plural `duel.announce.target` y `duel.announce.reveal`, y pedir el nombre de la carta sólo cuando es una.
- **Vuelos:** lo que sale del mismo lugar ya vuela escalonado, 70 ms hasta la 8.ª (`use-card-flights.ts:333-351`). Pero más de 8 cartas de pila a pila no vuelan (`PILE_FLIGHT_LIMIT`, `:17` y `:192`): un Pot of Desires (10) no volaría. Propuesta: subirlo a 15 con un comentario `ponytail:`. Techo: un salto de hasta 15 pasos en un replay también va a volar.
- **Target de varias:** las marcas de un mismo lote vencen **juntas, en una sola jugada**: un `batch` de `target` que se anota «Sacás el target de A, B y C». Las sueltas siguen cada una con su timer. Hay que agrupar los timers por lote (`PracticeMat.tsx:839-856`). Un lote hecho sólo de `target` tiene que contar como `target` donde hoy se mira el tipo: para no cancelar lo que estás eligiendo (`:776-782`) y para cerrar el visor, como hace «Target en pilas». Con varias marcadas, la casilla muestra la última marcada y la mira, sin contador (la cantidad ya la dice el registro, una vez). Con el rival: un `markMany` que manda un solo `marks` y tiene un solo vencimiento.

## 5. Plan de PR (cada una se mergea sola)

**A. El visor elige varias** (Opus)
- Qué hace: el modo «varias» del visor. No cambia ninguna pantalla todavía: la prop `many?: { label(ids), onPick(ids, rect) }` es opcional y nadie la pasa.
- Archivos: `MatDialogs.tsx` (`PileViewer`); `playground/sections/DialogsSection.tsx` y `duel-sample.ts`: la muestra del visor normal, eligiendo con 2 (una con mira), con 0 elegidas y el menú del lote con una opción apagada, a 390, 320 y 1440 px; i18n ES y EN en un bloque nuevo al final; `docs/design-system.md` y `docs/playground.md`.
- Pruebas (nuevo `pile-viewer.test.tsx`): sin `many` no hay pie; con 1 carta, tampoco; `aria-pressed` alterna y el orden se ve; `Elegir todas` respeta el filtro y pasa a `Quitar elección`; Mayús+clic elige el tramo; Escape actúa en dos tiempos; la principal está apagada con 0; `onPick` recibe las cartas en orden; la elección se recorta cuando cambian los ids.
- **Esto es lo primero que Gastón prueba en `/playground`.**

**B. Target a varias del rival** (Haiku; después de A)
- Archivos: `duel-session.ts` (`markMany`), `DuelScreen.tsx` (su visor con `many`: «Target» / «Quitar target», cierra el visor), `duelo.md`.
- Pruebas: `duel-session.test.ts` (un solo `marks`, tope `MAX_MARKS`, vencen juntas) y `duel-screen.test.tsx`.

**C. La jugada `batch`** (spec de la sección 4; en paralelo con A)
- Archivos: `practice-mat.ts`, `mat-effects.ts`, `mat-public.ts`, `duel-protocol.ts`, `sfx.ts`, `mat-steps.ts`, `use-card-flights.ts`, `DuelScreen.tsx` (plurales), i18n, `support/random-mat.ts` (lotes dentro del fuzz del espejo), `duelo.md`.
- Pruebas: el reducer aplica las partes en orden; frases (hasta 3 nombres y desde 4, barajar, target y quitar target, concordancia); efectos juntados; `mapActionIds` y `shownBy`; el protocolo acepta lo válido y rechaza un lote adentro, `give`, un lote vacío y más de `MAX_CARDS`; una sola flecha ×3; el espejo coincide con la mesa en el fuzz.
- **Se publica antes que D**, para que todo cliente entienda `batch` antes de que alguien lo mande.

**D. Varias cartas en la mesa** (Opus; después de A, C y las tres en vuelo)
- Archivos: `practice-mat.ts`: `listBatchActions` y `MatMenuItem.disabled`. `PracticeMat.tsx`: el menú `{kind:'batch', pile, ids, rect, ask?}` con sus ítems y sus preguntas (también las apagadas); `choose`: Al azar suma el `shuffle` al final; `play`: lo del Main lo suma al principio y cierra con `setViewer(null)`; los timers por lote y la guarda de `lastType`. i18n y docs (`design-system.md`, `retomar.md`).
- Pruebas: `listBatchActions` (la intersección, la comparación, las apagadas con nombres y el orden de Arriba); `practice-mat.test.tsx` (GY ×3 → Desterrar boca abajo: 1 paso que se deshace con 1 Deshacer; Main ×2 → mano: una sola jugada, un barajado y el visor cerrado; GY ×2 → Al azar; Target ×3: vence en un paso y no cierra un menú abierto); `duel-screen.test.tsx`: lo que ve el rival.
- Navegador: 320, 390, 1100 y 1440 px, y un duelo entre dos navegadores (`retomar.md` §7).

## 6. Riesgos

- **Pestañas sin recargar:** un cliente viejo descarta el `batch`, ve que le falta una jugada y pide la mesa entera (`duel-session.ts:943-944`). Se arregla solo, pero sin la animación. Por eso C va antes que D. Tampoco subir `PROTOCOL_VERSION`: cortaría la sala entera.
- **Nunca dos despachos en el mismo toque** (por la regla del cursor de a uno).
- **Bug que ya existe:** «Revelar» desde el visor del Main despacha dos jugadas seguidas, revelar y barajar al cerrar (`PracticeMat.tsx:945-947`, que llama a `:869-870`). El cursor salta 2 y no hay destaque ni sonido. Se arregla metiendo el barajado dentro de la jugada; D lo evita para el lote.
- **Lotes mezclados:** sólo los arma la UI. Si llega uno por la red, el protocolo lo acepta si cada parte es válida, y la frase cae a «Movés …».
- **Lo que se puede pisar con las piezas en vuelo:** «Target en pilas» (ya mergeada como #486) tocó `play()`, `pileCell` y `practice-mat.test.tsx`: D extiende su regla de cerrar el visor a los lotes de `target`. B1 toca `listCardActions` (`attachTo` y `oneOf`, más `MatMenuItem.cardId`), las claves de `CardMenu` y `CardSheet` y `practice.ts`: D lee su «Adjuntar a un Xyz ▸» tal como queda; A toca `PileViewer`, que está en el mismo archivo que la clave de `CardMenu` pero en otra función. La de Péndulo no se cruza (el lote no invoca). Las claves nuevas de i18n van en un bloque propio al final para no chocar.

## 7. Decisiones de Gastón (por defecto, el plan sigue sin esperar la respuesta)

1. **Target en el Main y el Extra propios.** En el juego no se targetea el deck ni el Extra boca abajo, y hoy el menú de una carta no lo ofrece ahí. Por defecto: no. Si se quiere, es una línea en `listCardActions` y el modo varias lo hereda.
2. **Invocar varias a la vez** (Especial, Péndulo). Por defecto: no en esta tanda (cada una pide zona y posición); se sigue invocando de a una.
3. **Renombrar «Al azar» a «Barajar en el deck».** Por defecto: no. Las mismas palabras en el menú de una carta y en el de varias («Al deck ▸ Al azar»); el registro ya dice «Barajás … dentro del deck».

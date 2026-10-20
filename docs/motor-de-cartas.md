# Motor de cartas: por capas

Gastón (2026-10-19), después de mirar cómo Dueling Nexus remarca el texto de las cartas («un motor heurístico; creo que es la clave»): **resaltar el texto**, leer **más de los scripts de EDOPro** y, sobre
los duelos automáticos, «esto es en efecto un proyecto enorme, por lo que vamos a tener que hacerlo en capas, de a poco, con lo que estemos seguros que funciona al 100 %».

**Regla de oro: cada capa sólo afirma lo que se pudo comprobar.** Ante la duda, una capa no dice nada: un texto raro pierde el color, nunca gana uno equivocado. Cada capa trae sus pruebas y se mide contra el
catálogo entero antes de pasar a la siguiente.

| Capa | Qué hace | Estado |
| --- | --- | --- |
| 0 · Resaltar | Colorea el texto de la carta: condición, efecto rápido, costo, objetivo y límite. No decide nada del juego. | **Hecha** |
| 1 · Hechos confirmados | Lo que el script de EDOPro **y** el texto de la carta dicen los dos de sus efectos: rápido, una vez por turno (con o sin nombre), una vez por Duelo, costo y objetivo. | **Hecha** (a nivel de carta) |
| 1b · Alinear frase y efecto | Qué frase del texto es qué efecto del script, y de **cada** efecto: sus hechos y desde dónde se activa (mano, Cementerio). Sólo lo que las señales obligan, con margen. | **Hecha** (1.706 cartas; la lee «podés responder con…») |
| 2 · Asistente de la mesa | La mesa **avisa, no decide**: muestra los rasgos confirmados de la carta donde se decide jugarla, avisa si se activa otra vez una de «una vez por turno» (de la carta o, si tiene varios efectos, de cada uno) y dice qué cartas podés responder. | **Empezada** (rasgos, aviso de uso, contador por efecto y «podés responder con…») |
| 3 · Automatización parcial | Efectos simples, de a una carta, cada una probada contra su script. | Pendiente |
| 4 · Núcleo de reglas | `ocgcore` (el motor de EDOPro) compilado a WebAssembly, detrás de una bandera. | Evaluar (licencia) |

## Capa 0 · Resaltar el texto

**Dónde vive:** `src/app/card-text.ts` (`segmentCardText`, una función pura: texto → pedazos con su tipo, sin DOM ni estado) y `src/components/card-detail/CardEffectText.tsx` (los pinta). Lo usan el detalle de la carta
(`CardDetailOverlay`: celular, búsqueda, expansiones, banlists), la barra de la izquierda del builder (`DeckBuilderClassicPreview`) y el detalle fijo del duelo (`DuelCardDock`). Muestra en `/playground`, sección Datos.

**Cómo se ve** (los cuatro colores de la paleta cerrada y un subrayado; el color significa algo, y cada parte lleva su nombre en `title`, en los dos idiomas: `search.cardText.*`):

| Parte | Qué es | Se ve |
| --- | --- | --- |
| `condition` | Cuándo se activa: lo que va antes de los dos puntos (`If this card is Special Summoned`, `During your Main Phase`) | verde |
| `speed` | `(Quick Effect)`: se puede activar en respuesta | ámbar, en negrita |
| `cost` | Lo que se paga al activar: lo que va antes del `;` y empieza con un verbo de costo (`discard`, `send`, `banish`, `Tribute`, `detach`, `pay`, `remove`, `reveal`, `shuffle`, `return`, `release`) | rojo |
| `target` | A qué carta apunta: `target 1 monster…` antes del `;` | violeta |
| `limit` | `You can only …` (una vez por turno, por nombre…) y `Once per turn` / `Once per Chain` delante de los dos puntos | subrayado punteado, sin color |

Lo demás (`plain`) queda como texto común. El texto no cambia nunca: se agregan sólo `<span>`s con `data-tone`, así que un lector de pantalla lo lee igual y copiar y pegar da el texto original.

**Qué se lee del texto** (la plantilla de los efectos de Yu-Gi-Oh! es rígida): `Condición (Quick Effect): Costo; Efecto.`, y aparte `You can only …`. Se parte por líneas (`\r\n`), por viñetas (`●`) y por oraciones; los `:` y `;`
dentro de comillas (`"Number 39: Utopia"`) o paréntesis no cortan nada, y si las comillas o los paréntesis no cierran no se interpreta la oración. Un `:` sólo abre una condición si lo que va antes empieza con un
abridor de la plantilla (`If`, `When`, `While`, `During`, `At the`, `After`, `Each time`, `Before`, `Once while`, `Whenever`, `Your opponent`, `Neither/Both players`, `FLIP`), así que una lista
(`You can activate 1 of these effects:`) no es una condición. Un `costo con objetivo` se parte en dos (`discard this card, then target 1 monster;` → costo y objetivo, y el `then`, el `and` y el `to` quedan sin color).

**Garantías** (las prueban `src/__tests__/card-text.test.ts`, con textos reales y propiedades sobre texto armado al azar, y `card-effect-text.test.tsx`):
1. Los pedazos, pegados, dan exactamente el texto de entrada.
2. Ningún pedazo está vacío y dos vecinos nunca repiten tipo.
3. Un `cost`, un `target` o una `condition` nunca llevan espacios de borde ni el `;` o el `:` que los cierra.

**Medido contra el catálogo entero** (YGOPRODeck, 14.618 cartas, el 2026-10-19; 0 violaciones de las garantías): 11.289 condiciones, 947 «(Quick Effect)», 4.380 costos, 4.973 objetivos y 8.391 límites. Se revisaron a
mano muestras de cada parte y los 722 monstruos Normales: los que no son Péndulo **no llevan ninguna marca** (el *flavor* va entre dos apóstrofos `''…''` y no se toca) y los 27 Normales Péndulo marcan
sólo su efecto de Péndulo. Esa revisión encontró y corrigió tres cosas: el `Once per turn:` del frente era una condición (es un límite), un `to` colgado en el costo (`banish this card from the GY to target…`) y los espacios
dentro del color. Para repetirla: bajar `https://db.ygoprodeck.com/api/v7/cardinfo.php` (sin parámetros; con `misc=no` da 400) y pasar `segmentCardText` por cada `desc` con las tres garantías.

**Lo que no marca (a propósito):** efectos continuos sin dos puntos (`This card gains 500 ATK…`), el costo de un efecto sin `;`, una condición que no abre con una de las palabras de arriba, `Once per turn, you can …`
sin dos puntos, los textos de invocación (`You can Ritual Summon this card with…`), las reglas de los materiales (`2 Level 4 monsters`) y todo texto que no esté en inglés (el catálogo de YGOPRODeck viene en inglés; ver
`docs/i18n.md`). Si se quiere marcar uno de esos, se agrega una regla con su prueba y se vuelve a medir el catálogo.

**Cómo se parece y se distingue de Dueling Nexus:** allá la condición es verde, «(Quick Effect)» amarillo, el costo rosa y la restricción subrayada; acá lo mismo con la paleta propia (rojo en vez de rosa) y el objetivo
en violeta. No se revisó el código de ellos: es una lectura de lo que se ve.

## Capa 1 · Hechos confirmados por dos fuentes

**Idea:** el script de EDOPro dice lo que el motor del juego hace de verdad y el texto dice lo que la carta imprime; no se conocen entre sí. Un hecho que **las dos fuentes afirman** es cierto; uno que afirma una sola puede ser una forma
de escribir distinta (las cartas viejas no llevan «(Quick Effect)») o un detalle interno del motor (un efecto continuo con límite para no repetirse). La capa 1 se queda sólo con la intersección.

**Dónde vive:** `src/app/card-effect-facts.ts` (puro: `scriptEffectFacts`, `textEffectFacts`, `verifiedEffectFacts`, la máscara `EFFECT_FACT`), el lector de scripts ampliado (`card-script-rules.ts`: `SetCountLimit`, `SetCost`,
`SetCondition`, `SetProperty` y `scope: 'all'`, que también lee los efectos que una carta se da a sí misma fuera de `initial_effect`), el generador `scripts/build-card-effects.mjs` (`npm run sync:effects`: baja el texto de las
cartas de YGOPRODeck, actualiza el clon de los scripts y escribe `src/data/card-effects.json`, agrupado por máscara como `card-rules.json`) y el lector de la app `src/app/card-effect-data.ts` (`loadCardEffects`, `getCardEffectFacts`).
Se corre a mano cuando conviene (salen cartas nuevas): no forma parte del sync diario.

**Los seis hechos** (`EFFECT_FACT`; son de la **carta entera**, no de cada efecto: «tiene al menos un efecto…»):

| Hecho | El script dice | El texto dice |
| --- | --- | --- |
| `quick` | un efecto `EFFECT_TYPE_QUICK_O` o `QUICK_F` | `(Quick Effect)` (la capa 0 lo marca como `speed`) |
| `once` | `SetCountLimit(1, …)` que no es por Duelo, por cadena ni «mientras está boca arriba» | «once per turn» o la forma por nombre de abajo |
| `hardOnce` | lo mismo con el id de la carta como código (`id`, `{id,1}`, `OATH`): por nombre | «You can only use … "Nombre" … once per turn», «You can only use 1 "Nombre" per turn», «You can only activate 1 "Nombre" per turn», «"Nombre" can only be activated once per turn» (se mira con cada nombre reemplazado por `"N"`: llevan puntos y comillas) |
| `perDuel` | `EFFECT_COUNT_CODE_DUEL` | «once per Duel» |
| `cost` | `SetCost(…)` | un costo antes del `;` (capa 0, `cost`) |
| `target` | `EFFECT_FLAG_CARD_TARGET` | `target 1 …` antes del `;` (capa 0, `target`) |

**Qué significa un bit:** encendido = confirmado por las dos fuentes; apagado = **no dice nada** (no que no sea cierto). Una carta sin script (monstruos normales, cartas nuevas) o sin hechos confirmados no está en el JSON.

**Medido contra el catálogo** (YGOPRODeck y los scripts del 2026-10-19: 10.266 cartas con algún hecho en el script; **9.182** llevan al menos uno confirmado). Por hecho, las cartas donde los dos coinciden / sólo lo dice el script / sólo lo dice el texto:

| Hecho | Los dos (confirmado) | Sólo el script | Sólo el texto |
| --- | ---: | ---: | ---: |
| `quick` | 1.029 | 938 | 21 |
| `once` | 7.235 | 399 | 123 |
| `hardOnce` | 5.528 | 25 | 84 |
| `perDuel` | 58 | 3 | 3 |
| `cost` | 3.936 | 877 | 61 |
| `target` | 4.398 | 654 | 64 |

Lo que se descarta tiene causas conocidas, que se fueron corrigiendo al medir: el texto viejo sin «(Quick Effect)» (el script dice rápido: **no se confirma**, por diseño), una etiqueta de velocidad sola sin condición (`(Quick Effect): …`, arreglada
en la capa 0), los nombres con puntos o con comillas anidadas (`"Maxx "C""`, arreglado), los efectos que una carta se da a sí misma en otra función (arreglado con `scope: 'all'`) y los límites que el motor impone sin que el texto los diga (un efecto
continuo con `SetCountLimit(1)` para no dispararse dos veces). Quedan, entre otros, los límites de «You can only Special Summon "X" once per turn» (el script los pone con una bandera, no con `SetCountLimit`), que no se confirman.

**Lo que esta capa NO hace:** no dice **cuál** efecto tiene cada hecho (eso lo hace la capa 1b, abajo: alinear cada frase del texto con cada efecto del script), no sabe cuántos cupos por nombre tiene una carta, ni desde qué zona se activa, ni qué evento lo
dispara; esos datos están en el script (`range`, `code`) pero sin segunda fuente que los confirme todavía. Y **nada de la app lo usa aún**: la capa 2 (el asistente de la mesa) es la que lo va a leer.

## Capa 1b · Alinear cada frase del texto con su efecto del script

**Idea:** la capa 1 dice hechos de la **carta entera**. Para que la mesa sepa «este efecto es rápido, aquel apunta, el otro se usa desde la mano» hace falta saber **qué frase del texto es qué efecto del script** (Gastón: «seguí con la alineación frase↔efecto»). La misma regla de oro: **sólo se alinea lo que las señales obligan**; ante la duda, la carta no se alinea y queda como estaba (hechos de la carta entera).

**Dónde vive:** `src/app/card-effect-map.ts` (puro), `effectSentences` en `src/app/card-text.ts` (las oraciones del texto que son efectos), `origin` en `CardEffect` (`card-script-rules.ts`: un `Clone` comparte el origen de su original), `effectFactsOf` en `card-effect-facts.ts` (los hechos de **un** efecto del script), el mismo generador de la capa 1 (`npm run sync:effects` escribe también `src/data/card-effect-map.json`, 57 KB) y el lector `getCardEffectMap` en `src/app/card-effect-data.ts`.

**Cómo se alinea:**
1. **Las frases** (`effectSentences`): las oraciones que abren con una condición (`If …:`, `When …:`), con `During …:`, con `Once per turn:`, con `(Quick Effect):` o que empiezan con `You can` y llevan un `;`. Las reglas, los límites («You can only use each effect…») y los efectos continuos no cuentan. Cada una sabe cómo abre, dónde empieza en el texto y si lleva velocidad, costo, objetivo o «una vez por turno».
2. **Los efectos** (`logicalEffects`): los efectos del script que se activan (rápidos, de disparo, de ignición), con sus **clones juntos**: `e2=e1:Clone()` que sólo cambia el rango o el evento es el mismo efecto (el texto lo dice una vez: «If this card is Normal or Special Summoned»). Los continuos, las reglas de invocación y las activaciones de Mágicas y Trampas no cuentan.
3. **Cuatro señales** (`mismatches` cuenta cuántas contradice un par frase↔efecto): la **clase** (una frase que dice «(Quick Effect)» es un efecto rápido; un suceso —«is sent to the GY»— es un disparo o un rápido; un estado —«is in your GY», «you control»— es una ignición o un rápido; un «while …» agrega un estado a un suceso y no cuenta), el **costo** (si la frase paga algo antes del `;`, el efecto tiene `SetCost`), el **objetivo** (`target 1 …` ⇒ `EFFECT_FLAG_CARD_TARGET`) y el **«Once per turn:» de apertura** (⇒ `SetCountLimit`). Todo lo que la frase dice tiene que estar en el efecto, no al revés (el texto viejo no lleva «(Quick Effect)»).
4. **La carta se alinea si, y sólo si:** tiene el **mismo número** de frases que de efectos, hay una forma de armar los pares **sin ninguna contradicción** y **todas las demás formas tienen al menos 2 contradicciones más**. Esa última condición (`MARGEN`) es lo que cuida la regla de oro: una alineación que se sostiene por **una sola** señal cambiaría si esa señal estuviera mal leída (las señales de la clase, el costo, el objetivo y el «una vez» se equivocan en 0,4 a 1,4 % de los pares seguros, ver abajo), así que no se publica.

**Qué se guarda de cada efecto** (`verifiedEffects`; `[dónde empieza la frase, hechos, lugares]`): los **hechos** de la capa 1 (`EFFECT_FACT`) pero **por efecto** —lo que declara ese efecto del script **y** dice esa frase— y los **lugares** (`EFFECT_PLACE`: `hand`, `grave`, `field`) desde donde se activa: la mano y el Cementerio con las dos fuentes —el `SetRange` del efecto y la frase que dice «this card is in your hand», «discard this card», «banish this card from your GY»…—; el **campo** con el `SetRange` (`LOCATION_MZONE`) y la **ausencia** de otro lugar en la frase (la segunda fuente es negativa: si la frase nombra la mano o el Cementerio para esta carta, el campo no se confirma). Una frase que habla de «cada efecto» («You can only use each effect of "X" once per turn») le da `once` y `hardOnce` a todas; un límite **compartido** («You can only use 1 of the following effects…») no es el de ningún efecto. Un bit apagado **no dice nada**.

**Qué carta sale:** las de **varios** efectos (1.471) y las de **uno solo si es rápido** (235: para esas los hechos de la carta entera ya son los de su efecto, pero hace falta saber desde dónde se activa), y sólo monstruos con efecto (lo que se midió). El lector (`getCardEffectMap(id, texto)`) vuelve a leer las frases del texto que recibe y **no dice nada si ya no empiezan donde estaban** cuando se generó (el texto cambió): el orden no sería de fiar.

**Medido contra el catálogo** (YGOPRODeck y los scripts del 2026-10-19: 8.559 monstruos con efecto en el script):

| | Cartas |
| --- | ---: |
| Con efectos en el script **y** frases de efecto en el texto | 6.763 |
| …con el mismo número de frases que de efectos | 6.362 |
| …de las cuales con un solo efecto | 3.030 |
| …con **varios** efectos (2 a 5) | 3.332 |
| …**alineadas con certeza**, de varios efectos (en `card-effect-map.json`: 2.967 efectos) | **1.471** |
| …más las de un solo efecto rápido (también en el JSON, 64 KB en total) | 235 |
| Distinto número de frases que de efectos (no se alinea) | 401 |

**Cómo se comprobó que no se equivoca:**
- **Pares seguros** (una frase y un efecto: no hay con qué confundir): se midió con qué frecuencia cada señal es falsa para el par verdadero: la clase de disparo 7 de 1.675 (0,4 %), el costo 14 de 995 (1,4 %), el objetivo 5 de 969 (0,5 %), el «una vez» 3 de 372 (0,8 %), la clase rápida 1 de 234. Son raras pero existen (un costo que el script paga dentro de otra función, un `while` que se lee como estado): de ahí el margen de 2.
- **Un oráculo independiente** que no se usa para alinear: de las frases alineadas que dicen que **esta carta** se activa desde la mano (435) o el Cementerio (255), el script de su efecto declara ese lugar en 682 de 690. Las 8 que no coinciden se revisaron a mano: **ninguna es una mala alineación**, son frases cuyo «this card» es el objeto de una acción y no el lugar de activación («banish this card from your Graveyard» como costo de un disparo, «Special Summon … with a Level lower than this card from your hand»).
- Primera versión (sin margen, sólo «una sola forma posible»): 2.400 cartas con varios efectos; con el margen quedaron 1.471 (se pierden las que sólo se distinguían por una señal) y el oráculo no cambió.

**Lo que esta capa NO hace:** no dice nada de las 401 cartas con distinto número de frases (efectos que el texto dice en una sola frase o que el script parte en dos, como `Kuriboh - Multiply!`), de las 1.861 con varios efectos que no se distinguen con certeza, ni de las cartas nuevas sin script. Lo lee «podés responder con…» (capa 2, abajo) y es la base del contador por efecto.

## Capa 2 · Asistente de la mesa (empezada)

**Regla:** avisa, no decide. Nunca frena una jugada, nunca la deshace, nunca mueve una carta. Sólo dice algo que es verdad y que quien juega puede haber olvidado, con los hechos confirmados de la capa 1 (`card-effect-facts.ts`).

**Lo que hace hoy:**
1. **Rasgos confirmados a primera vista** (`CardEffectTraits`, `app/use-card-effect-facts.ts`): fichitas con los hechos de la capa 1 —**efecto rápido** (ámbar), **1 vez por turno** (o **por nombre**), **1 vez por duelo**, **con costo** (rojo) y **apunta** (violeta), los mismos colores del texto resaltado— donde se decide jugar la carta: la hoja del celular y el menú de escritorio de la mesa (`CardSheet`, `CardMenu`, también con las cartas del rival que ya mostró), el detalle de la carta (`CardDetailOverlay`), el detalle fijo del duelo (`DuelCardDock`), la barra del builder (`DeckBuilderClassicPreview`) y el texto del zoom. Cada una explica qué es en su `title`. Los datos (82 KB) se bajan la primera vez que se piden. Sin nada confirmado, no se muestra nada.
2. **Aviso de uso** (`app/mat-assistant.ts`, en `PracticeMat`): al **activar el efecto** de una carta con un límite de uso confirmado, la mesa se acuerda de la activación y, si ya activaste esa carta en el mismo turno (o en el mismo duelo, si es de una vez por duelo), muestra un aviso **sin frenar nada**: «Ya activaste X este turno y tiene un efecto de «una vez por turno»: fijate que no sea el mismo efecto». Es por nombre si el límite es por nombre (una segunda copia comparte el límite), y por carta si no. El turno es el del duelo entero (`duelTurnNumber`: cuenta los dos jugadores; en la práctica, el de la mesa). **Sólo cuenta lo que se vio hacer acá:** nunca inventa un uso (si se recarga la página o se deshace la jugada, el uso deja de contar, y el aviso se queda corto, no de más).

3. **«Podés responder con…»** (`app/mat-responders.ts`, `useResponders` en `DuelScreen`): cuando el rival pregunta «¿Hacés algo antes?» antes de pasar de fase (`docs/duelo.md`), la pregunta —una tarjeta en el medio de la pantalla, `PassPrompt`— dice «Ana quiere pasar a la Battle Phase. Podés responder con A, B y 3 más.» y esas cartas tuyas **brillan en ámbar** —la mano, el campo y la casilla del Cementerio, sin oscurecer al resto: `GlowKind` `respond`— mientras la pregunta está en pie; sólo lo ve quien recibe la pregunta. Entran: una **Trampa o una Mágica de Juego Rápido boca abajo** (por su tipo; en el turno del rival ya pasó la fase en que se pusieron) y un **monstruo con un efecto rápido confirmado** (`quick`, capa 1b) que se activa desde **donde está** (la mano, el campo boca arriba o el Cementerio: `places`) y **sin condición**: el encabezado del efecto es sólo «(Quick Effect)», «Once per turn (Quick Effect)» o «During your opponent's Main Phase (Quick Effect)» (`effectWindow` en `card-text.ts`: de quién es el turno y en qué fases; la fase en que va el rival tiene que estar dentro). Un efecto rápido que espera un suceso («When a card or effect is activated (Quick Effect)») **no se ofrece**: ahora no hay nada a lo que responder. De los 653 efectos rápidos alineados, 315 tienen un lugar confirmado y no esperan nada (44 desde la mano, 264 desde el campo, 7 desde el Cementerio) y 338 llevan una condición. No sabe si lo que pide cada carta se cumple (un objetivo, cierta cantidad de cartas): por eso dice «podés», no «tenés que».

4. **Contador por efecto** (`countableEffects`, `effectChoices` y `effectKey` en `app/mat-assistant.ts`; la jugada `activate` lleva `effect?: number`): en una carta con **varios efectos alineados con su texto y al menos uno con un límite de uso confirmado** (capa 1b: 946 cartas, 1.915 efectos, 1.600 con límite) «Activar efecto» **pregunta cuál** en un segundo paso del menú, como la posición de una Invocación Especial: un renglón por efecto con **lo que hace, textual**: la frase del efecto sin recortar ni reescribir (Gastón: «debe resumir lo que hace el efecto sin perder precisión»: la precisión es de la frase, así que se parte y no se acorta), con su número y cuándo se activa arriba («Efecto 1 · If this card is in your hand», `effectParts` en `card-text.ts`: lo de antes de los dos puntos tal cual) y, debajo, si ya lo usaste este turno o en este duelo, desde dónde se activa (la mano o el Cementerio, sólo si las dos fuentes lo confirman: `places`) y sus rasgos confirmados (`visibleFactNames`, los mismos que dibuja `CardEffectTraits`; los de la carta entera no se repiten arriba mientras se elige), más «Otro efecto» para lo que no esté en la lista. En escritorio el menú se ensancha (22 rem) para que entren las frases y, **al pasar el mouse por una opción** (o enfocarla con el teclado, no con el foco que se lleva el menú al abrirse), **el detalle de la carta de la izquierda resalta la frase de ese efecto** con un fondo claro que no cambia los colores de lo que tiene adentro (`MatMenuItem.preview` → `onHighlight` → `DuelCardDock highlight` → `CardEffectText highlight`); se apaga al irse, al elegir o al cerrar el menú. En el celular las opciones van de a una por fila, sin ese resaltado (no hay detalle fijo). La jugada queda anotada con su número («Activás el efecto 2 de X») y el aviso de uso cuenta **por efecto** (`effectKey`: la clave del límite del efecto —por nombre o por carta— y su lugar entre los efectos): usar el 1 y después el 2 no avisa; repetir el 1 sí y dice cuál («Ya activaste el efecto 1 de X este turno y es de «una vez por turno» por nombre (otra copia comparte el límite)»). «Otro efecto» activa sin número y cuenta la carta entera, como antes. **Qué no pregunta:** una carta de un solo efecto, o con varios pero ninguno con un límite que contar, o una del rival que controlás, se activa directo (no hay nada que contar por separado). El número viaja con la jugada (el protocolo lo valida: entero de 0 a 9; un cliente de antes lo ignora) y queda en los combos guardados. Lo que se ve («1 · …», «Ya lo usaste este turno») sale de las frases del texto y de las activaciones que **se vieron hacer acá**, igual que el aviso: nunca inventa un uso.

**Por qué el aviso de uso de la carta entera no dice «no podés»:** los hechos de la capa 1 son de la **carta entera**, no de cada efecto. Una carta con dos efectos de una vez por turno puede usar uno y después el otro, y sin saber cuál se activa la mesa no puede distinguirlos. Por eso avisa («fijate que no sea el mismo efecto») y deja decidir; el contador por efecto (arriba, el punto 4) sí los distingue, para las cartas que alcanza.

**Lo que falta** (y qué hace falta para hacerlo con certeza):
- **«Podés responder con…» más fino**: los efectos rápidos con una condición («When a card is activated») no se ofrecen porque ahora no hay a qué responder; ofrecerlos **cuando haya una cadena** (el rival activa una carta) necesita que la mesa sepa de cadenas, que hoy no sabe. Los Monstruos de Péndulo y las Mágicas Continuas con efecto rápido tampoco entran.
- **Contar también las Mágicas y Trampas**: la activación de una Mágica o una Trampa se anota como poner la carta boca arriba (`place` o `position`), no como `activate`, así que el aviso de uso y el contador por efecto no las ven (una segunda «Pot of Desires» no avisa). Hace falta que la mesa sepa cuándo una carta puesta boca arriba es una activación y no sólo un cambio de lugar.
- **Límites compartidos entre efectos** («You can only use 1 of the following effects per turn»): el texto los dice en una frase que no es de ningún efecto, así que el contador por efecto no los cuenta (la carta entera sí, con el aviso de siempre).
- El aviso de **una Invocación de Péndulo por turno** y otras reglas de turno (no son de una carta, son del juego).

## Capas 3 y 4 (ideas, sin diseño todavía)

- **3 · Automatización parcial.** Una carta a la vez, sólo efectos que el script describe sin ambigüedad (robar, buscar, invocar de la mano), cada una con su prueba contra el script y un freno que vuelve a la
  mesa manual ante cualquier cosa que no se entienda.
- **4 · Núcleo de reglas.** `@n1xx1/ocgcore-wasm` (JSR) es el motor de EDOPro compilado a WebAssembly. **Su licencia es AGPL-3.0**: usarlo obliga a publicar el código de lo que lo enlaza, así que antes de tocarlo
  hay que decidir eso (y probarlo detrás de una bandera, sin que sea el camino por defecto).

Ver también `docs/auditoria-motor-efectos.md` (el filtro **Efecto** del buscador, que ya lee el texto con expresiones y está medido a ciegas) y `docs/duelo.md` (la mesa).

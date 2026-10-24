# Motor de cartas: por capas

Los duelos automáticos son un proyecto enorme: por eso van en capas, de a poco y sólo con lo que se sabe que funciona.

**Regla de oro: cada capa sólo afirma lo que se pudo comprobar.** Ante la duda, una capa no dice nada: un texto raro pierde el color, nunca gana uno equivocado. Cada capa trae sus pruebas y se mide contra el catálogo entero antes de pasar a la siguiente.

| Capa | Qué hace | Estado |
| --- | --- | --- |
| 0 · Resaltar | Colorea el texto de la carta: condición, efecto rápido, costo, objetivo y límite. No decide nada del juego. | Hecha |
| 1 · Hechos confirmados | Lo que el script de EDOPro **y** el texto de la carta dicen los dos de sus efectos (de la carta entera). | Hecha |
| 1b · Alinear frase y efecto | Qué frase del texto es qué efecto del script y, de cada efecto, sus hechos y desde dónde se activa. | Hecha |
| 2 · Asistente de la mesa | La mesa avisa, no decide: rasgos, usos, reglas de turno y qué cartas pueden responder. | Hecha en lo que se puede afirmar |
| 3 · Automatización parcial | Un motor propio de efectos simples. | Descartada: cubriría el 8 % de las cartas del meta y ninguna cadena |
| 4 · Núcleo de reglas | `ocgcore` (el motor de EDOPro) en WebAssembly corre los duelos de verdad con los scripts de Project Ignis. | Hecha para «Jugar solo» (beta): ver `docs/duelos-automaticos.md` |

## Capa 0 · Resaltar el texto

Vive en `src/app/card-text.ts` (`segmentCardText`, puro; sus garantías están en su comentario y las prueba `card-text.test.ts`) y la pinta `CardEffectText`. El texto nunca cambia: se agregan sólo `<span>` con `data-tone`, así un lector de pantalla lo lee igual y copiar y pegar da el original.

- **Lo que no marca, a propósito:** los efectos continuos sin dos puntos, el costo de un efecto sin `;`, una condición que no abre con las palabras de la plantilla, «Once per turn, you can …» sin dos puntos, los textos de invocación, las reglas de los materiales y todo texto que no esté en inglés. Marcar uno de esos pide una regla con su prueba y volver a medir el catálogo.
- **Para medirla:** bajar `https://db.ygoprodeck.com/api/v7/cardinfo.php` sin parámetros (con `misc=no` da 400) y pasar `segmentCardText` por cada `desc` comprobando las garantías.

## Capa 1 · Hechos confirmados por dos fuentes

El script de EDOPro dice lo que el motor hace de verdad y el texto, lo que la carta imprime. Un hecho que afirma una sola fuente puede ser una forma de escribir distinta (las cartas viejas no llevan «(Quick Effect)») o un detalle interno del motor, así que se publica sólo la intersección (`card-effect-facts.ts`). Un bit apagado no dice nada, y una carta sin script o sin hechos confirmados no está en el JSON.

- **Se genera a mano**, cuando salen cartas, con `npm run sync:effects` (`scripts/build-card-effects.mjs`: baja el texto de YGOPRODeck, actualiza el clon de los scripts y escribe `src/data/card-effects.json` y `card-effect-map.json`). Ningún workflow programado lo corre. La app lo lee con `card-effect-data.ts`.
- **No se confirma** lo que el script pone con una bandera y no con `SetCountLimit` (por ejemplo, «You can only Special Summon "X" once per turn»), ni la velocidad de las cartas viejas sin «(Quick Effect)».
- La activación de una Mágica o una Trampa (`EFFECT_TYPE_ACTIVATE`) no es una frase que se pueda emparejar: queda afuera de la alineación, pero cuenta para los límites compartidos.

## Capa 1b · Alinear cada frase del texto con su efecto del script

`card-effect-map.ts` (con `effectSentences` de `card-text.ts`) empareja las frases que son efectos con los efectos del script que se activan (sus clones, juntos) usando cinco señales: la clase, el costo, el objetivo, el «Once per turn:» de apertura y el lugar desde donde se activa. Todo lo que dice la frase tiene que estar en el efecto, no al revés.

- **Sólo con certeza:** el mismo número de frases que de efectos, una forma de armar los pares sin contradicciones y todas las demás con al menos 2 contradicciones más (`MARGEN`). Una alineación que se sostiene por una sola señal cambiaría si esa señal estuviera mal leída, así que no se publica.
- **Los lugares, con dos fuentes:** la mano y el Cementerio, con el `SetRange` y la frase; el campo y la zona de Mágicas y Trampas, con el `SetRange` y que la frase no nombre otro lugar; la Zona de Péndulo, con el `SetRange` y que la frase esté en la parte «Pendulum Effect». Un «this card» que es el objeto de la acción («with a Level lower than this card from your hand») no es un lugar.
- Entran las cartas de varios efectos y las de uno solo si es rápido. `getCardEffectMap` no dice nada si las frases ya no empiezan donde estaban al generar (el texto cambió y el orden no sería de fiar).

## Capa 2 · Asistente de la mesa

**Avisa, no decide:** nunca frena, deshace ni mueve una jugada; sólo dice algo que es verdad y que quien juega puede haber olvidado. Cuenta sólo lo que se vio hacer en esa pantalla: si se recarga o se deshace, el uso deja de contar, y el aviso se queda corto, nunca de más. El turno es el del duelo entero (`duelTurnNumber`).

- **Sin cartel por activar otra vez una carta:** sin manejo de cadenas, repetir una activación es la forma de preguntarle al rival si quiere responder, y los hechos de la capa 1 son de la carta entera, no de cada efecto. Qué efecto ya se usó lo dice el menú, en voz baja.
- **Contador por efecto** (`mat-assistant.ts`): «Activar efecto» de una carta con varios pregunta cuál, con la frase textual (no se resume: la precisión es de la frase). La lista alineada con el script tiene todos los efectos y no lleva «Otro efecto»; la leída sólo del texto puede no tenerlos y termina con «Otro efecto». El número viaja con la jugada (entero de 0 a 9; un cliente de antes lo ignora) y vale para los dos jugadores porque las dos listas ponen cada efecto en el mismo lugar.
- **Reglas de turno** (`turn-rules.ts`): una segunda Invocación Normal o de Péndulo en el turno avisa y no frena, porque un efecto puede permitirla.
- **Límites compartidos:** se comparten sólo si el script usa el mismo código en los efectos **y** el texto lo dice.
- **Lo que no hace:** no lleva la cadena (qué responde a qué ni cuándo se resuelve), no sabe si se puede cumplir lo que pide una carta (un objetivo, un costo: por eso «podés responder con…» dice «podés», `mat-responders.ts`) y no avisa de fases, daños ni costos, que no se pueden decir sin decidir. Una Mágica o Trampa con varios efectos que no se pudo alinear se cuenta por carta (su activación), no por efecto.

## Apéndice · Cómo se midió y cómo repetirlo

El filtro **Efecto** del buscador no es una capa: lee el texto en inglés con una expresión por categoría (`src/app/card-effects.ts`; `effectMaskOf` arma la máscara que el índice del catálogo guarda por carta).

**Cómo se mide.** En cada una de las 14 categorías: tres estratos (lo que marca, lo que no marca pero huele a la categoría y el resto), cada uno con una muestra de semilla fija, etiquetada a mano y a ciegas por alguien que no ve el motor ni los estratos; precisión y cobertura se estiman por estratos. Una ronda corrige y otra, con otras cartas, es la reserva: el motor se congela antes de ver sus etiquetas. Las muestras no están en el repo: dependen del catálogo del día.

**El criterio de las etiquetas:** aplica si la carta **hace** eso (efecto, costo o una mitad de Péndulo), no si es condición, disparador, restricción o prohibición. Buscar es del Deck a la mano y «A la mano», devolver; las destrucciones incluyen «destroy 1 card on the field», no la propia; Fichas incluye usarlas; Dañar LP no cuenta la batalla.

**Lo que justifica las decisiones:** en la reserva (20 cartas por categoría, ±10 a 15 puntos) casi todas las categorías marcaron bien 19 o 20 de 20 y cubrieron el 80 % o más; ningún arreglo posterior se volvió a medir con cartas nuevas, así que esos números son una cota optimista. Siguen fallando los contraataques (negar y destruir), las referencias entre oraciones y las Fichas: por eso el filtro avisa que se guía por el texto en inglés y deja al lado la búsqueda en el texto libre. La máscara de todo el catálogo cuesta unos 100 ms, una vez, al armar el índice (`EFFECT_GATE`, con un test que cuida que no cambie resultados).

**Para repetirla:** los estratos van en un archivo que quien etiqueta no lee, y ni las muestras ni los scripts de medición están en el repo: hay que rehacerlos. Cada arreglo tiene su caso en `src/__tests__/card-effects.test.ts`; una categoría nueva pide otra muestra y otro bit de la máscara (`EFFECT_KEYS`: caben 16).

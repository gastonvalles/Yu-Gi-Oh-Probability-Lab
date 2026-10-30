# Motor de cartas: por capas

**Regla de oro: cada capa sólo afirma lo que se pudo comprobar.** Ante la duda no dice nada: un texto raro pierde el color, nunca gana uno equivocado. Cada capa trae sus pruebas y se mide contra el catálogo entero antes de pasar a la siguiente.

| Capa | Qué hace | Estado |
| --- | --- | --- |
| 0 · Resaltar | Colorea el texto de la carta: condición, efecto rápido, costo, objetivo y límite. No decide nada del juego. | Hecha |
| 1 · Hechos confirmados | Lo que el script de EDOPro **y** el texto de la carta dicen los dos de sus efectos (de la carta entera). | Hecha |
| 1b · Alinear frase y efecto | Qué frase del texto es qué efecto del script y, de cada efecto, sus hechos y desde dónde se activa. | Hecha |
| 2 · Asistente de la mesa | La mesa avisa, no decide: rasgos, usos, reglas de turno y qué cartas pueden responder. | Hecha en lo que se puede afirmar |
| 3 · Automatización parcial | Un motor propio de efectos simples. | Descartada: cubriría el 8 % de las cartas del meta y ninguna cadena |
| 4 · Núcleo de reglas | `ocgcore` (el motor de EDOPro) en WebAssembly con los scripts de Project Ignis. | Beta, solo y por enlace: `docs/duelos-automaticos.md` |

## Capa 0 · Resaltar el texto

`segmentCardText` (`src/app/card-text.ts`; sus garantías, en su comentario) y la pinta `CardEffectText`. El texto nunca cambia: sólo se agregan `<span>` con `data-tone`, así un lector de pantalla lo lee igual y copiar da el original.

- **Lo que no marca, a propósito:** los efectos continuos sin dos puntos, el costo sin `;`, una condición que no abre con las palabras de la plantilla, «Once per turn, you can …» sin dos puntos, los textos de invocación, las reglas de los materiales y todo texto que no esté en inglés. Marcar uno pide una regla con su prueba y volver a medir el catálogo.
- **Para medirla:** bajar `https://db.ygoprodeck.com/api/v7/cardinfo.php` sin parámetros (con `misc=no` da 400) y pasar `segmentCardText` por cada `desc`.

## Capa 1 · Hechos confirmados por dos fuentes

El script dice lo que el motor hace y el texto, lo que la carta imprime. Un hecho de una sola fuente puede ser una redacción distinta (las cartas viejas no llevan «(Quick Effect)») o un detalle interno del motor: se publica sólo la intersección (`card-effect-facts.ts`). Un bit apagado no dice nada.

- **Se genera a mano**, cuando salen cartas: `npm run sync:effects` (`scripts/build-card-effects.mjs`) escribe `src/data/card-effects.json` y `card-effect-map.json`. Ningún workflow lo corre.
- **No se confirma** lo que el script pone con una bandera y no con `SetCountLimit` («You can only Special Summon "X" once per turn») ni la velocidad de las cartas viejas.
- La activación de una Mágica o Trampa (`EFFECT_TYPE_ACTIVATE`) no es una frase que se pueda emparejar: queda afuera de la alineación, pero cuenta para los límites compartidos.

## Capa 1b · Alinear cada frase del texto con su efecto del script

`card-effect-map.ts` empareja frases y efectos sólo si la alineación es la única sin contradicciones por un margen (`MARGEN`: una que se sostiene por una sola señal cambiaría con esa señal mal leída).

- **Los lugares, con dos fuentes:** la mano y el Cementerio, con el `SetRange` y la frase; el campo y la zona de Mágicas y Trampas, con el `SetRange` y que la frase no nombre otro lugar; la Zona de Péndulo, con el `SetRange` y la parte «Pendulum Effect». Un «this card» que es el objeto de la acción no es un lugar.
- `getCardEffectMap` no dice nada si las frases ya no empiezan donde estaban al generar (el texto cambió).

## Capa 2 · Asistente de la mesa

**Avisa, no decide:** nunca frena, deshace ni mueve una jugada; sólo dice algo que es verdad y que quien juega puede haber olvidado. Cuenta sólo lo que se vio en esa pantalla: si se recarga o se deshace, el aviso se queda corto, nunca de más.

- **Sin cartel por activar otra vez una carta:** sin manejo de cadenas, repetir una activación es la forma de preguntarle al rival si responde, y los hechos de la capa 1 son de la carta entera.
- **Contador por efecto** (`mat-assistant.ts`): «Activar efecto» de una carta con varios pregunta cuál, con la frase textual. La lista alineada con el script tiene todos; la leída sólo del texto termina con «Otro efecto». El número viaja con la jugada y vale para los dos porque las dos listas ponen cada efecto en el mismo lugar.
- **Reglas de turno** (`turn-rules.ts`): una segunda Invocación Normal o de Péndulo avisa y no frena, porque un efecto puede permitirla. Los límites se comparten sólo si el script usa el mismo código **y** el texto lo dice.
- **Lo que no hace:** no lleva la cadena, no sabe si se puede cumplir lo que pide una carta (por eso «podés responder con…» dice «podés», `mat-responders.ts`) y no avisa de fases, daños ni costos, que no se pueden decir sin decidir.

## Apéndice · Cómo se midió y cómo repetirlo

El filtro **Efecto** del buscador no es una capa: lee el texto en inglés con una expresión por categoría (`src/app/card-effects.ts`; `effectMaskOf` arma la máscara del índice del catálogo).

- **Cómo se mide:** en cada categoría, tres estratos (lo que marca, lo que no marca pero huele a la categoría y el resto), cada uno con una muestra de semilla fija etiquetada a mano y a ciegas por alguien que no ve el motor ni los estratos; precisión y cobertura se estiman por estratos. Una ronda corrige y otra, con otras cartas, es la reserva: el motor se congela antes de ver sus etiquetas.
- **El criterio de las etiquetas:** aplica si la carta **hace** eso (efecto, costo o una mitad de Péndulo), no si es condición, disparador, restricción o prohibición. Buscar es del Deck a la mano y «A la mano», devolver; las destrucciones incluyen «destroy 1 card on the field», no la propia; Fichas incluye usarlas; Dañar LP no cuenta la batalla.
- **Dónde falla:** los contraataques (negar y destruir), las referencias entre oraciones y las Fichas; por eso el filtro avisa que se guía por el texto en inglés y deja al lado la búsqueda libre. Ningún arreglo posterior a la reserva se volvió a medir con cartas nuevas.
- **Para repetirla:** ni las muestras ni los scripts de medición están en el repo (dependen del catálogo del día): hay que rehacerlos, con los estratos en un archivo que quien etiqueta no lee. Cada arreglo tiene su caso en `src/__tests__/card-effects.test.ts`; una categoría nueva pide otra muestra y otro bit (`EFFECT_KEYS`: caben 16).

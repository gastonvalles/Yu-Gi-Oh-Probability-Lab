# Motor de cartas: por capas

Los duelos automáticos son un proyecto enorme: por eso van en capas, de a poco y sólo con lo que se sabe que funciona.

**Regla de oro: cada capa sólo afirma lo que se pudo comprobar.** Ante la duda, una capa no dice nada: un texto raro pierde el color, nunca gana uno equivocado. Cada capa trae sus pruebas y se mide contra el catálogo entero antes de pasar a la siguiente.

| Capa | Qué hace | Estado |
| --- | --- | --- |
| 0 · Resaltar | Colorea el texto de la carta: condición, efecto rápido, costo, objetivo y límite. No decide nada del juego. | Hecha |
| 1 · Hechos confirmados | Lo que el script de EDOPro **y** el texto de la carta dicen los dos de sus efectos (de la carta entera). | Hecha |
| 1b · Alinear frase y efecto | Qué frase del texto es qué efecto del script y, de cada efecto, sus hechos y desde dónde se activa. | Hecha |
| 2 · Asistente de la mesa | La mesa avisa, no decide: rasgos, usos, reglas de turno y qué cartas pueden responder. | Hecha en lo que se puede afirmar |
| 3 · Automatización parcial | Efectos simples, de a una carta, cada una probada contra su script. | Diseñada, sin construir |
| 4 · Núcleo de reglas | `ocgcore` (el motor de EDOPro) compilado a WebAssembly, detrás de una bandera. | Bloqueada por la licencia (AGPL-3.0): decide Gastón |

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

- **Sólo con certeza:** el mismo número de frases que de efectos, una forma de armar los pares sin contradicciones y todas las demás con al menos 2 contradicciones más (`MARGEN`). En los pares seguros, cada una de las cuatro primeras señales falla entre el 0,4 y el 1,4 % de las veces: una alineación que se sostiene por una sola señal cambiaría si esa señal estuviera mal leída, así que no se publica.
- **Los lugares, con dos fuentes:** la mano y el Cementerio, con el `SetRange` y la frase; el campo y la zona de Mágicas y Trampas, con el `SetRange` y que la frase no nombre otro lugar; la Zona de Péndulo, con el `SetRange` y que la frase esté en la parte «Pendulum Effect». Un «this card» que es el objeto de la acción («with a Level lower than this card from your hand») no es un lugar.
- Entran las cartas de varios efectos y las de uno solo si es rápido. `getCardEffectMap` no dice nada si las frases ya no empiezan donde estaban al generar (el texto cambió y el orden no sería de fiar).
- Antes de que el lugar fuera una señal, se comprobó la alineación con él como oráculo (el lugar que declara el script frente al que dice la frase): los desacuerdos eran frases cuyo «this card» es el objeto de la acción, no malas alineaciones.

## Capa 2 · Asistente de la mesa

**Avisa, no decide:** nunca frena, deshace ni mueve una jugada; sólo dice algo que es verdad y que quien juega puede haber olvidado. Cuenta sólo lo que se vio hacer en esa pantalla: si se recarga o se deshace, el uso deja de contar, y el aviso se queda corto, nunca de más. El turno es el del duelo entero (`duelTurnNumber`).

- **Sin cartel por activar otra vez una carta:** sin manejo de cadenas, repetir una activación es la forma de preguntarle al rival si quiere responder, y los hechos de la capa 1 son de la carta entera, no de cada efecto. Qué efecto ya se usó lo dice el menú, en voz baja.
- **Contador por efecto** (`mat-assistant.ts`): «Activar efecto» de una carta con varios pregunta cuál, con la frase textual (no se resume: la precisión es de la frase). La lista alineada con el script tiene todos los efectos y no lleva «Otro efecto»; la leída sólo del texto puede no tenerlos y termina con «Otro efecto». El número viaja con la jugada (entero de 0 a 9; un cliente de antes lo ignora) y vale para los dos jugadores porque las dos listas ponen cada efecto en el mismo lugar.
- **Reglas de turno** (`turn-rules.ts`): una segunda Invocación Normal o de Péndulo en el turno avisa y no frena, porque un efecto puede permitirla.
- **Límites compartidos:** se comparten sólo si el script usa el mismo código en los efectos **y** el texto lo dice.
- **Lo que no hace:** no lleva la cadena (qué responde a qué ni cuándo se resuelve), no sabe si se puede cumplir lo que pide una carta (un objetivo, un costo: por eso «podés responder con…» dice «podés», `mat-responders.ts`) y no avisa de fases, daños ni costos, que no se pueden decir sin decidir. Una Mágica o Trampa con varios efectos que no se pudo alinear se cuenta por carta (su activación), no por efecto.

## Capas 3 y 4 (diseño; sin construir)

Ninguna se empezó. La regla de oro sigue: no se automatiza nada que no se haya comprobado.

### Capa 3 · Automatización parcial (diseño)

1. **Primero, los efectos de una sola acción y sin elección:** robar N, mandar o desterrar la propia carta, invocarla desde la mano o el Cementerio, buscar 1 por nombre, darla vuelta o cambiarla de posición. Falta clasificar el cuerpo de la operación, que `card-script-rules.ts` ya trae.
2. **Un efecto es una función pura** `applyEffect(state, effect, choices) → { state, log }` que devuelve las mismas `MatAction` de siempre: el rival ve lo mismo sin un protocolo nuevo, y deshacer, el registro y los combos siguen sirviendo.
3. **Cada carta, con su prueba:** si la operación del script no es la que implementa `applyEffect`, la carta no entra (`sync:effects` la marcaría `auto` sólo si lo comprueba).
4. **El freno:** ante cualquier elección, objetivo o condición que la mesa no pueda evaluar, el efecto se juega a mano. Nunca a medias.
5. **Cadenas:** una pila de activaciones que se resuelve al revés, recién con más de una carta automatizada; antes hace falta un modelo de velocidad de hechizo y de ventana de respuesta.
6. **Apagada por defecto** y, en el duelo, con el acuerdo de los dos: una mesa no puede cambiar la otra sin que lo sepa.

Antes de empezar se mide cuántas cartas entran a la lista corta, con el método de la capa 1b.

### Capa 4 · Núcleo de reglas (diseño y bloqueo)

`@n1xx1/ocgcore-wasm` (JSR) es `ocgcore`, el motor de EDOPro, en WebAssembly: aplicaría las reglas de verdad a los mismos scripts. **Su licencia es AGPL-3.0:** enlazarlo y servir la app por la web puede obligar (cláusula 13) a ofrecer el código fuente completo de la aplicación. No es consejo legal: hay que confirmarlo antes de escribir una línea, y decide Gastón.

| Opción | Qué implica |
| --- | --- |
| Publicar la app entera bajo AGPL-3.0 | El motor se usa sin más; el código de la app se vuelve libre. |
| El motor en un servicio aparte | La obligación puede seguir para quien lo corre: hay que consultarlo. |
| No usarlo | Queda la capa 3. |

Si se usa: detrás de una bandera, en una pantalla aparte («Duelo automático (beta)»), sin ser el camino por defecto, con carga bajo demanda y sin tocar el relay del duelo manual.

Ver también el apéndice (el filtro Efecto del buscador) y `docs/duelo.md` (la mesa).

## Apéndice · Cómo se midió y cómo repetirlo

El filtro **Efecto** del buscador no es una capa: lee el texto en inglés con una expresión por categoría (`src/app/card-effects.ts`; `effectMaskOf` arma la máscara que el índice del catálogo guarda por carta).

**Cómo se mide.** En cada una de las 14 categorías: tres estratos (lo que marca, lo que no marca pero huele a la categoría y el resto), cada uno con una muestra de semilla fija; las etiqueta a mano, a ciegas, alguien que no ve el motor ni los estratos, y la precisión y la cobertura se estiman por estratos (Wilson y remuestreo). Una ronda sirve para corregir y otra, con otras cartas y otra semilla, es la reserva: el motor se congela antes de ver sus etiquetas. Las muestras y las etiquetas no están en el repositorio: dependen del catálogo del día.

**El criterio de las etiquetas:** aplica si la carta **hace** eso (efecto, costo o una mitad de Péndulo), no si es condición, disparador, restricción o prohibición. Buscar es del Deck a la mano y «A la mano», devolver; las destrucciones incluyen «destroy 1 card on the field», no la propia; Fichas incluye usarlas; Dañar LP no cuenta la batalla.

**Lo que justifica las decisiones:** en la reserva (20 cartas por categoría, un margen de ±10 a 15 puntos), once de las 14 categorías marcaron bien 19 o 20 de 20 (Fichas, 18; Robar, 17) y todas cubrieron el 80 % o más; Tomar el control marcó bien 13 (leía los cambios de posición) y se corrigió con esa muestra. Ningún arreglo posterior a la reserva se volvió a medir con cartas nuevas (no hubo tercera ronda): los números de después de corregir son una cota optimista. Siguen fallando los contraataques («Negate the activation, and if you do, destroy it»: Mágica, Trampa o monstruo según lo activado), las referencias entre oraciones y las Fichas: por eso el filtro avisa que se guía por el texto en inglés y deja al lado la búsqueda en el texto libre. Falsos positivos vistos y sin corregir: «Eradicator Epidemic Virus» marca Robar («all cards they draw until…»), «Izanagi» marca A la mano («effects that return them to the hand») y «Scrounging Goblin» marca Negar («to negate this effect», que decide el rival). La máscara de todo el catálogo cuesta unos 100 ms, una vez, al armar el índice; la abaratan una sola pasada por las comillas y un chequeo de palabra clave antes de cada expresión (`EFFECT_GATE`, con un test que cuida que no cambie resultados).

**Para repetirla:** bajar el catálogo, muestrear por estrato y por categoría con semilla fija, etiquetar a ciegas con el criterio y estimar por estratos. Las rondas fueron de 68 cartas por categoría (la de corrección) y de 75 (la reserva); el texto de cada muestra va mezclado y los estratos, en un archivo que quien etiqueta no lee. Ni las muestras ni los scripts de medición están en el repo: hay que rehacerlos. Cada arreglo tiene su caso en `src/__tests__/card-effects.test.ts`; una categoría nueva pide otra muestra y otro bit de la máscara (`EFFECT_KEYS`: caben 16).

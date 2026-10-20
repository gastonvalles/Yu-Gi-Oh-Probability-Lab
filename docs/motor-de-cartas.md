# Motor de cartas: por capas

Gastón (2026-10-19), después de mirar cómo Dueling Nexus remarca el texto de las cartas («un motor heurístico; creo que es la clave»): **resaltar el texto**, leer **más de los scripts de EDOPro** y, sobre
los duelos automáticos, «esto es en efecto un proyecto enorme, por lo que vamos a tener que hacerlo en capas, de a poco, con lo que estemos seguros que funciona al 100 %».

**Regla de oro: cada capa sólo afirma lo que se pudo comprobar.** Ante la duda, una capa no dice nada: un texto raro pierde el color, nunca gana uno equivocado. Cada capa trae sus pruebas y se mide contra el
catálogo entero antes de pasar a la siguiente.

| Capa | Qué hace | Estado |
| --- | --- | --- |
| 0 · Resaltar | Colorea el texto de la carta: condición, efecto rápido, costo, objetivo y límite. No decide nada del juego. | **Hecha** |
| 1 · Datos de los scripts | Por cada efecto: su límite de uso, su costo, su velocidad y su disparador, leídos del script y cruzados con el texto. | Pendiente |
| 2 · Asistente de reglas | La mesa avisa, no decide: «este efecto es rápido», «ya lo usaste este turno». | Pendiente |
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

## Capa 1 · Datos de los scripts (pendiente, el siguiente paso)

Hoy ya se leen los scripts de EDOPro (`ProjectIgnis/CardScripts`) con `scripts/sync-meta-decks.mjs` y salen **20 bits por carta** (`src/app/card-script-rules.ts`, `src/data/card-rules.json`: «se activa desde la mano»,
«busca», «niega»…). Lo que falta leer **por efecto**: el límite de uso (una vez por turno, una vez por duelo, por nombre de carta), el costo, la velocidad, el evento que lo dispara y desde qué zona se activa.
Cada dato se **cruza con el texto**: si el script y el texto no coinciden, no se muestra (regla de oro). La Capa 0 es el control: lo que el texto dice con la plantilla y el script confirma, queda; el resto, no.

## Capas 2 a 4 (ideas, sin diseño todavía)

- **2 · Asistente.** La mesa avisa y no decide: el efecto rápido de una carta en la mano, el contador de usos por turno de los efectos con límite (los de la Capa 1), el recordatorio de «¿lo activás?».
  Nunca mueve cartas por su cuenta.
- **3 · Automatización parcial.** Una carta a la vez, sólo efectos que el script describe sin ambigüedad (robar, buscar, invocar de la mano), cada una con su prueba contra el script y un freno que vuelve a la
  mesa manual ante cualquier cosa que no se entienda.
- **4 · Núcleo de reglas.** `@n1xx1/ocgcore-wasm` (JSR) es el motor de EDOPro compilado a WebAssembly. **Su licencia es AGPL-3.0**: usarlo obliga a publicar el código de lo que lo enlaza, así que antes de tocarlo
  hay que decidir eso (y probarlo detrás de una bandera, sin que sea el camino por defecto).

Ver también `docs/auditoria-motor-efectos.md` (el filtro **Efecto** del buscador, que ya lee el texto con expresiones y está medido a ciegas) y `docs/duelo.md` (la mesa).

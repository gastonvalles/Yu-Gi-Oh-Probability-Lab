# Auditoría del motor de efectos

El filtro **Efecto** del buscador («Buscar en el Deck», «Robar», «Destruir monstruos»…) no sabe de Yu-Gi-Oh!: lee el texto en inglés de cada carta con una expresión
por categoría. Este documento dice **cuánto acierta**, cómo se midió, qué se corrigió y qué sigue fallando. El motor vive en `src/app/card-effects.ts` (una función
pura del texto, sin imports); `card-filters.ts` lo usa para filtrar y `card-search.ts` guarda su resultado, una máscara de bits por carta, en el índice del catálogo.

## Cómo se midió

El catálogo tiene 14.494 cartas con texto (sin cartas de Habilidad). Para cada una de las 14 categorías:

1. **Tres estratos.** Lo que el motor marca (*marcadas*), lo que no marca pero huele a la categoría (*candidatas*: contiene «destroy», «add … hand», «return»…) y el
   resto (*control*). De cada estrato se sacó una muestra al azar con semilla fija.
2. **Etiquetado a ciegas.** Cada muestra la etiquetó, leyéndola a mano, un agente independiente que no vio el motor, ni cuántas eran de cada estrato, ni los resultados:
   sólo el texto de la carta y el criterio de abajo. El texto de cada muestra va mezclado y los estratos van en un archivo aparte que el etiquetador no lee.
3. **Estimación por estratos.** Precisión y cobertura de todo el catálogo se estiman pesando cada muestra por el tamaño de su estrato (con intervalo de Wilson para la
   precisión y remuestreo para la cobertura).
4. **Dos rondas.** La **ronda 1** (68 cartas por categoría) midió el motor anterior y sirvió para corregir. La **ronda 2** (75 por categoría, otras cartas, otra semilla)
   es una **reserva**: se congeló el motor *antes* de ver sus etiquetas, así que dice cómo acierta con cartas que no se miraron al corregirlo.

**Criterio** (el mismo para las dos rondas): una categoría aplica si el texto dice que la carta **hace** eso —como efecto, como costo o en una de sus mitades de Péndulo—;
si el término sólo aparece como condición, disparador, restricción o prohibición de otras cartas, no. Buscar es agregar una carta **del Deck** a la mano; «A la mano»
es devolver una carta a la mano (no agregarla); Destruir monstruos y Destruir Mágicas/Trampas incluyen «destroy 1 card on the field» (puede ser de cualquier tipo), pero no la
destrucción de la propia carta ni «cannot be destroyed»; Fichas incluye usarlas (como costo u objetivo), no sólo generarlas; Dañar LP no incluye el daño de batalla.

## Resultados

«Marcadas bien» es cuántas de las cartas que el motor marcó estaban bien según las etiquetas; la cobertura es qué parte de las que sí eran logró marcar.

| Categoría | Cartas que marca hoy | Motor anterior (ronda 1) precisión · cobertura | Motor nuevo, **reserva** (ronda 2, antes de corregir) marcadas bien · cobertura | Después de corregir (mismas muestras, ya vistas) marcadas bien · cobertura |
| --- | --- | --- | --- | --- |
| Buscar en el Deck | 12,5 % | 100 % · 91 % | 20/20 · 80 % (58–100) | 22/22 · 100 % |
| Robar | 6,0 % | 90 % · 100 % | 17/20 · 100 % | 17/18 · 100 % |
| Invocación Especial | 40,9 % | 77 % · 100 % | 20/20 · 100 % | 20/20 · 100 % |
| Desterrar | 18,5 % | 90 % · 99 % | 20/20 · 99 % | 21/21 · 100 % |
| Cementerio | 49,8 % | 100 % · 100 % | 20/20 · 100 % | 21/21 · 100 % |
| A la mano | 4,3 % | 100 % · 89 % | 19/20 · 98 % | 21/22 · 100 % |
| Al Deck | 8,2 % | 100 % · 67 % | 20/20 · 92 % (87–98) | 25/25 · 100 % |
| Destruir monstruos | 14,0 % | 97 % · 48 % | 20/20 · 87 % (80–93) | 28/29 · 100 % |
| Destruir Mágicas/Trampas | 8,4 % | 83 % · 34 % | 19/20 · 84 % (70–100) | 19/20 · 84 % |
| Negar | 10,4 % | 77 % · 100 % | 19/20 · 100 % | 19/20 · 100 % |
| Fichas | 2,4 % | 93 % · 100 % | 18/20 · 100 % | 18/20 · 100 % |
| Tomar el control | 1,4 % | 100 % · 70 % | 13/20 · 95 % (83–100) | 14/14 · 100 % |
| Dañar LP | 5,7 % | 80 % · 83 % | 19/20 · 100 % | 19/19 · 100 % |
| Recuperar LP | 1,7 % | 83 % · 68 % | 20/20 · 100 % | 20/20 · 100 % |

Cómo leerla:

- **La columna de la reserva es la honesta.** La última, en cambio, se midió con las mismas cartas con las que se corrigió: es una cota optimista. No se hizo una tercera
  ronda; lo que se corrigió después de la reserva (ver más abajo) tampoco se midió con cartas nuevas.
- **Con 20 cartas por categoría, el margen es de ±10 a 15 puntos.** «20/20» quiere decir «no se encontró un error en 20» (el intervalo de Wilson va de 84 a 100 %), no «cero errores».
- **El motor anterior** (14 expresiones sueltas, sin limpiar el texto) fallaba sobre todo en dos lugares: la cobertura de las destrucciones (48 % y 34 %, y eso es una cota
  alta: la muestra de candidatas sólo incluía textos con «monster» o «Spell/Trap») y la precisión de «Invocación Especial» y «Negar» (77 %), que marcaban
  «cannot Special Summon», «if this card is Special Summoned» o el nombre de una carta con «Negate» adentro.
- **Cuánto discrimina cada una.** «Invocación Especial» (41 %) y «Cementerio» (50 %) están en la mitad del catálogo: sirven para sumar a otro filtro, no para encontrar algo solas.
  Las más selectivas (Tomar el control 1,4 %, Recuperar LP 1,7 %, Fichas 2,4 %) son las que mejor responden a «¿qué carta hace esto?».

## Qué se encontró y se corrigió

- **Los nombres entre comillas confundían.** «D.D. Warrior Lady» trae puntos que cortan la oración, y «Adventurer Token» o «Destruction Cannon» parecían un efecto. Se vacían
  antes de leer (`cleanEffectText`), con tres excepciones: un nombre que termina en «Token» —o una Ficha con sus estadísticas entre paréntesis— sigue diciendo «Token», y una
  frase larga entre comillas («the activated effect becomes "return 1 monster to the hand"») es un efecto y se lee.
- **Prohibir o disparar no es hacer.** «cannot Special Summon», «You can only Special Summon "X" once per turn», «if this card is banished», «when … returns to your hand», «when you
  draw», «when this monster inflicts damage», «if you would take damage», «your opponent cannot negate»: ya no marcan. Antes marcaban todas.
- **«Tomar el control» marcaba cambiar la posición de batalla** de un monstruo «you control» (7 de 20 marcadas estaban mal). Ahora pide «take / gain / switch / give / change control»
  o «control of … is switched / shifted».
- **Destruir leía una sola redacción.** Ahora entiende «destroy it / them / that target» después de elegir el objetivo (`target 1 monster; destroy it`), «destroy 1 other face-up
  card», «Set card», «Special Summon 1 monster. Destroy it during the End Phase» y «negate … and if you do, destroy that targeted card». Una carta genérica
  («destroy 1 card») cuenta para monstruos y para Mágicas/Trampas; las cartas de un arquetipo (`target 3 "Igknight" cards; destroy them`), sólo para monstruos.
- **Al Deck y A la mano** no conocían el «Main Deck», «top or bottom of the Deck», «his/her Deck», «it's owner's hand», ni «Add 2 monsters from your Graveyard to your Deck».
- **Buscar** no leía «adds» (tercera persona), «take 1 monster from your Deck and add it» ni «Add to your hand or Special Summon».
- **Desterrar** no entendía «banished instead» y marcaba «your removed from play monsters» (el texto viejo para «desterradas»).
- **Dañar y Recuperar LP**: no cuentan el daño de batalla, «would inflict», «nor take», «gain 300 ATK» ni «when you gain LP».

Además, escribir las pruebas de regresión (`src/__tests__/card-effects.test.ts`, un caso de cada cosa de arriba) sacó tres más —«cannot negate», «would take damage» y las
cartas de un arquetipo contadas como Mágicas/Trampas—, que se arreglaron sin volver a medir.

## Qué sigue fallando

- **«Negate the activation, and if you do, destroy it»** (los contraataques): destruye una Mágica/Trampa si lo activado lo era y un monstruo si no, y el texto no lo dice. Los
  etiquetas no fueron parejas entre cartas casi iguales (unas sí, otras no). Es la causa de la cobertura de 84 % de Destruir Mágicas/Trampas.
- **Referencias que cruzan oraciones** («Special Summon 1 monster. … Destroy that card…») sólo se entienden en las formas que se vieron. Una redacción nueva puede escaparse.
- **Fichas:** las etiquetas no son parejas para «Metabo Token» (la carta Ficha en sí) ni para «While you control a Token» (una carta que menciona Fichas sin generarlas): algunas se
  etiquetaron como Fichas y otras no. El motor marca todas.
- **Casos sueltos vistos y no corregidos** (uno por categoría, en la muestra): «Eradicator Epidemic Virus» marca Robar por «all cards they draw until…»; «Izanagi» marca A la
  mano por «effects that return them to the hand»; «Scrounging Goblin» marca Negar por «to negate this effect» (lo decide el rival).
- **Sólo inglés.** El texto de la carta que baja de YGOPRODeck está en inglés; el filtro dice «según el texto de la carta (en inglés)».
- **No es comprensión.** Es expresiones sobre el texto: una redacción que no se vio puede fallar. Por eso la pantalla lo avisa y el texto libre («Texto del efecto») queda al lado.

## Costo

Medido con las 14.618 cartas del catálogo, en Chromium (`x4` es la CPU 4 veces más lenta, como un celular de gama baja):

| | Motor anterior | Motor nuevo |
| --- | --- | --- |
| Armar la máscara de las 14 categorías de todo el catálogo (una vez, en el índice, en tandas de 8 ms) | 44 ms (x4: 206 ms) | ~100 ms (x4: ~500 ms) |
| Filtrar por efecto con la máscara ya armada | 0,3 ms | 0,2–0,5 ms |
| Un texto de 2000 caracteres hecho para trabar las expresiones | — | ≤ 2 ms (x4: 5 ms) |

El motor nuevo cuesta más del doble al armar el índice, y eso pasa una sola vez, en el tiempo libre, sin trabar el hilo. Buscar y filtrar no cambia. Lo que lo mantiene
barato: una sola pasada por las comillas, y un chequeo de palabra clave antes de cada expresión (`EFFECT_GATE`: la mayoría de las cartas no dice «destroy» ni «return»);
un test cuida que ese atajo no cambie ningún resultado.

## Para repetirlo

Las muestras, las etiquetas y los scripts de medición no están en el repositorio (son ~2 MB de textos de cartas y dependen del catálogo del día). Para repetir la medición:
bajar el catálogo, sacar una muestra por estrato por categoría con semilla fija, pedir las etiquetas con el criterio de arriba a quien no vea el motor, y estimar por estratos.
Si se toca una expresión, `src/__tests__/card-effects.test.ts` dice si se rompió un arreglo de esta lista; si se agrega una categoría, hace falta una muestra nueva (y un bit más de la
máscara: caben 16, hoy hay 14).

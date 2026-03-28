# Yu-Gi-Oh! Probability Lab

Deck builder visual + calculadora exacta de probabilidades para Yu-Gi-Oh!.
La idea central es ayudar a entender deck building con un flujo simple: armás el deck, clasificás cada carta por origen y función, definís aperturas/problemas y medís consistencia.

## Qué hace la app

- Builder visual con búsqueda de cartas por YGOPRODeck.
- Drag & drop entre Main, Extra y Side.
- Clasificación por carta en dos ejes independientes:
- `origin`: `engine`, `non_engine`, `hybrid`.
- `roles`: `starter`, `extender`, `enabler`, `searcher`, `draw`, `combo_piece`, `payoff`, `recovery`, `handtrap`, `disruption`, `boardbreaker`, `floodgate`, `removal`, `brick`, `garnet`, `tech`.
- Aperturas y Problemas para medir consistencia real.
- Probabilidad exacta (enumeración combinatoria).
- Práctica de manos para ver ejemplos concretos.
- Exportación del deck armado como imagen.
- Snapshots para comparar builds.

## Flujo recomendado

1. Armá tu deck en el builder.
2. Definí el origen y los roles de cada carta.
3. Definí aperturas y problemas.
4. Leé estadísticas y probá manos.

## Modelo de clasificación

La app separa explícitamente dos dimensiones:

- `origin`: de qué espacio del deck viene la carta.
- `roles`: qué función táctica cumple dentro de la mano, la línea o el plan.

Eso evita mezclar pertenencia con función. Ejemplo:

- `origin: engine` + `roles: [starter, extender]`
- `origin: non_engine` + `roles: [handtrap, disruption]`
- `origin: engine` + `roles: [brick]`
- `origin: hybrid` + `roles: [extender, boardbreaker]`

## Conceptos clave

### Apertura
Una mano posible o combinación de cartas que sí querés ver al robar.

Ejemplos:
- `Mínimo 1 Starter`
- `Starter + Extender`
- `Starter + protección`
- `Engine + Interacción`

### Problema
Una situación incómoda que querés evitar.

Ejemplos:
- `Sin starter`
- `2 o más Bricks`
- `3 o más Non-engine`
- `Sin interacción`
- `Extender sin starter`

### Resultado final de la mano

- Jugable sin problemas: cumple apertura y no tiene problemas.
- Jugable con problemas: cumple apertura y tiene problemas.
- Mala: no cumple aperturas y sí tiene problemas.
- Neutra: no cumple aperturas ni problemas.

## Aperturas y problemas: cómo se leen

Una apertura o problema está formado por partes.
Podés decir:
- Se cumple con todo esto (todas las partes).
- Se cumple con cualquiera (al menos una parte).
- Se cumple con al menos N partes.

Cada parte define:
- Qué cartas se buscan.
- Cuántas (copias o nombres distintos).
- Si deben aparecer o no en la mano.

## Defaults automáticos

Cuando terminás el paso 2, la app genera presets base y se pueden editar:

Aperturas:
- `Mínimo 1 Starter`
- `Mano jugable mínima`
- `Starter + Extender`
- `Al menos 1 interacción`
- `Starter + protección`
- `Engine + Interacción`

Problemas:
- `Sin starter`
- `2 o más Bricks` (si hay bricks suficientes)
- `3 o más Non-engine` (si hay non-engine suficiente)
- `Sin interacción`
- `Extender sin starter`

Si ya existían reglas con el mismo nombre, no se duplican.

## Cálculo exacto

La probabilidad exacta se calcula enumerando todas las manos posibles de 5 cartas.
No es simulación, es cálculo combinatorio real.

## Práctica de manos

Permite robar una mano al azar y ver:
- Qué aperturas cumple.
- Qué problemas aparecen.
- El veredicto final.

## Estructura del proyecto

```
src/
  app/
    deck-utils.ts        lógica de decks y presets
    deck-groups.ts       roles y grupos
    patterns.ts          helpers de patrones
    persistence.ts       load/save del estado
  components/
    DeckZone.tsx         builder visual
    SearchPanel.tsx      búsqueda
    DeckRolesPanel.tsx   roles por carta
    probability/
      PatternEditor.tsx  aperturas/problemas
      ResultsSection.tsx probabilidad exacta
      PracticeSection.tsx práctica
  probability.ts         motor exacto
```

## Scripts

```
npm install
npm run dev
npm run build
```

## Requisitos

- Node.js + npm

## Limitaciones actuales

- No hay importación desde imagen/lista (por decisión de UX).
- El cálculo es exacto solo para la mano inicial de 5 cartas.
- No hay simulación de líneas o interrupciones todavía.

## Próximos pasos sugeridos

1. Presets de pruebas contra handtraps comunes.
2. Editor todavía más guiado para aperturas/problemas.
3. Métricas avanzadas de “juega sobre X”.

# Documento de Diseño: Deck Model Transparency

## Resumen

Esta feature agrega indicadores de confianza del modelo y copy contextual que comunican al usuario que los resultados (probabilidades, comparaciones, veredictos) dependen de cómo clasificó sus cartas y qué reglas activó. No modifica la arquitectura existente: solo agrega un helper puro, un componente visual reutilizable y cambios de copy en los paneles existentes.

## Arquitectura

### Componentes nuevos

```
src/app/deck-model-status.ts          ← Helper puro (getDeckModelStatus)
src/components/DeckModelStatusBadge.tsx ← Componente visual reutilizable
```

### Componentes modificados (solo copy/integración)

```
src/components/deck-mode/DeckBuilderStep.tsx   ← Copy de Categorization + Badge compact
src/components/ProbabilityPanel.tsx             ← Copy contextual + Badge full
src/components/comparison/VerdictCard.tsx       ← Prefijo "Según tu modelo"
src/components/comparison/ComparisonView.tsx    ← Badge para Build A/B + warning
src/components/probability/PracticeSection.tsx  ← Nota contextual
```

## Diseño Detallado

### 1. Helper puro: `getDeckModelStatus`

**Archivo:** `src/app/deck-model-status.ts`

```typescript
import type { CardEntry, HandPattern } from '../types'

export type DeckModelStatusValue = 'complete' | 'incomplete'

export interface DeckModelStatus {
  status: DeckModelStatusValue
  totalCards: number
  categorizedCards: number
  missingOriginCount: number
  missingRolesCount: number
  needsReviewCount: number
  activePatternCount: number
  completionPercentage: number
}

export function getDeckModelStatus(
  derivedMainCards: CardEntry[],
  activePatterns: HandPattern[],
): DeckModelStatus {
  const totalCards = derivedMainCards.reduce(
    (sum, card) => sum + card.copies,
    0,
  )

  let categorizedCards = 0
  let missingOriginCount = 0
  let missingRolesCount = 0
  let needsReviewCount = 0

  for (const card of derivedMainCards) {
    const copies = card.copies

    if (card.origin === null) {
      missingOriginCount += copies
    }

    if (card.roles.length === 0) {
      missingRolesCount += copies
    }

    if (card.needsReview) {
      needsReviewCount += copies
    }

    // categorizedCards: origen asignado + al menos un rol + needsReview=false
    if (card.origin !== null && card.roles.length > 0 && !card.needsReview) {
      categorizedCards += copies
    }
  }

  const completionPercentage = totalCards > 0
    ? categorizedCards / totalCards
    : 0

  const status: DeckModelStatusValue =
    completionPercentage === 1
    && missingOriginCount === 0
    && missingRolesCount === 0
    && needsReviewCount === 0
      ? 'complete'
      : 'incomplete'

  return {
    status,
    totalCards,
    categorizedCards,
    missingOriginCount,
    missingRolesCount,
    needsReviewCount,
    activePatternCount: activePatterns.length,
    completionPercentage,
  }
}
```

**Decisiones de diseño:**
- Función pura sin side effects, fácil de testear con property-based testing.
- Recibe `CardEntry[]` (ya derivado) y `HandPattern[]` (patterns activos).
- `categorizedCards` requiere las tres condiciones: origen asignado, al menos un rol, y `needsReview=false`.
- `completionPercentage = categorizedCards / totalCards`.
- Status `"complete"` solo si las cuatro condiciones se cumplen simultáneamente.

### 2. Componente: `DeckModelStatusBadge`

**Archivo:** `src/components/DeckModelStatusBadge.tsx`

```typescript
import type { DeckModelStatus } from '../app/deck-model-status'

interface DeckModelStatusBadgeProps {
  modelStatus: DeckModelStatus
  variant: 'compact' | 'full'
}
```

**Comportamiento:**

| Status | Texto principal | Detalle |
|--------|----------------|---------|
| `complete` | "Modelo completo" | "Toda carta tiene grupo, función y fue revisada." + `{N} reglas activas` |
| `incomplete` | "Modelo incompleto" | Lista de mensajes según métricas pendientes |

**Mensajes de detalle para `incomplete`:**
- Si `missingRolesCount > 0`: "X cartas sin función definida"
- Si `missingOriginCount > 0`: "X cartas sin grupo definido"
- Si `needsReviewCount > 0`: "X cartas pendientes de revisión"
- Siempre: "Revisá antes de confiar en los porcentajes"

**Variantes:**
- `compact`: Una línea con ícono + texto principal. Apto para headers.
- `full`: Bloque expandido con título, detalle y métricas. Apto para paneles.

### 3. Cambios de copy en Categorization

**Archivo:** `src/components/deck-mode/DeckBuilderStep.tsx`

| Elemento | Antes | Después |
|----------|-------|---------|
| Título del paso | (título anterior) | "Definí cómo funciona cada carta en tu deck" |
| Descripción | (descripción anterior) | "Estas decisiones forman tu modelo del deck. Los porcentajes se calculan a partir de esto." |
| Label origen | "¿Qué es?" | "¿Dónde encaja en tu plan?" |
| Label roles | "¿Qué roles cumple?" | "¿Qué función cumple cuando la robás?" |
| Estado sin roles | "Sin rol" | "Todavía sin función definida" |
| Estado sin origen | "Sin origen" | "Sin grupo definido" |

Se agrega `DeckModelStatusBadge` en variante `compact` dentro del header del paso.

### 4. Cambios de copy en Probability Lab

**Archivo:** `src/components/ProbabilityPanel.tsx`

- Agregar texto contextual cerca del header: "Estos resultados se calculan según tus categorías y reglas activas."
- Mientras el modelo esté incompleto, mostrar warning: "Hay cartas sin revisar. Los porcentajes pueden ser incompletos."
- Agregar `DeckModelStatusBadge` en variante `full` dentro del panel principal.
- No se modifican KPIs ni cálculos.

### 5. Cambios de copy en Comparar

**Archivo:** `src/components/comparison/VerdictCard.tsx`

| Veredicto | Antes | Después |
|-----------|-------|---------|
| `a_better` | "Build A es mejor" | "Según tu modelo, Build A es mejor" |
| `b_better` | "Build B es mejor" | "Según tu modelo, Build B es mejor" |
| `equivalent` | "Equivalentes" | "Según tu modelo, equivalentes" |
| `tradeoff` | "Trade-off" | "Según tu modelo, trade-off" |

**Archivo:** `src/components/comparison/ComparisonView.tsx`

- Mostrar `DeckModelStatusBadge` para Build A.
- Cuando Build B está importada, mostrar `DeckModelStatusBadge` para Build B.
- Mientras Build B tenga cartas pendientes de revisión: "La comparación todavía no es confiable: Build B tiene cartas sin revisar."
- Tooltip en KPIs de roles: "Cartas que vos marcaste como [rol]."

### 6. Cambios de copy en Practice

**Archivo:** `src/components/probability/PracticeSection.tsx`

- Agregar nota contextual: "Usá práctica para validar si tus roles y reglas representan cómo jugás realmente el deck."
- No se modifica la lógica de práctica.

## Propiedades de Correctitud

### Propiedad 1: Invariante de completionPercentage

Para cualquier conjunto de `CardEntry[]`, `completionPercentage` siempre está en el rango `[0, 1]`.

```
∀ cards: CardEntry[], patterns: HandPattern[]
  let result = getDeckModelStatus(cards, patterns)
  result.completionPercentage >= 0 && result.completionPercentage <= 1
```

### Propiedad 2: Consistencia entre status y métricas

Si `status === "complete"`, entonces `completionPercentage === 1` Y `missingOriginCount === 0` Y `missingRolesCount === 0` Y `needsReviewCount === 0`.

```
∀ cards: CardEntry[], patterns: HandPattern[]
  let result = getDeckModelStatus(cards, patterns)
  if result.status === 'complete' then
    result.completionPercentage === 1
    && result.missingOriginCount === 0
    && result.missingRolesCount === 0
    && result.needsReviewCount === 0
```

### Propiedad 3: categorizedCards nunca excede totalCards

```
∀ cards: CardEntry[], patterns: HandPattern[]
  let result = getDeckModelStatus(cards, patterns)
  result.categorizedCards <= result.totalCards
```

### Propiedad 4: Suma de métricas parciales

`categorizedCards + (copias con alguna condición faltante)` cubre todo `totalCards`. Específicamente, `categorizedCards <= totalCards` y las métricas individuales (`missingOriginCount`, `missingRolesCount`, `needsReviewCount`) pueden solaparse entre sí pero cada una es `<= totalCards`.

```
∀ cards: CardEntry[], patterns: HandPattern[]
  let result = getDeckModelStatus(cards, patterns)
  result.missingOriginCount <= result.totalCards
  result.missingRolesCount <= result.totalCards
  result.needsReviewCount <= result.totalCards
```

### Propiedad 5: activePatternCount refleja la entrada

```
∀ cards: CardEntry[], patterns: HandPattern[]
  let result = getDeckModelStatus(cards, patterns)
  result.activePatternCount === patterns.length
```

### Propiedad 6: Deck vacío produce status incomplete con todo en 0

```
let result = getDeckModelStatus([], [])
result.status === 'incomplete'
result.totalCards === 0
result.completionPercentage === 0
```

## Restricciones de Implementación

1. No se modifican tipos existentes (`CardEntry`, `HandPattern`, etc.)
2. No se modifica el store de Redux
3. No se modifican `compareBuild`, `interpretComparison`, `calculateProbabilities`
4. No se modifica la lógica de patterns ni de importación
5. Solo se cambia copy visible al usuario; nombres técnicos internos permanecen iguales
6. El helper es una función pura sin dependencias de estado global

## Stack Tecnológico

- **Runtime:** React 19 + TypeScript 5.9
- **State:** Redux Toolkit (no se modifica)
- **Testing:** Vitest + fast-check (property-based) + @testing-library/react
- **Styling:** Tailwind CSS 4 (clases utilitarias existentes)

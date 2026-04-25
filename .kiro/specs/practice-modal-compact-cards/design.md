# Tarjetas Compactas en Modal de Práctica — Diseño del Bugfix

## Overview

Las tarjetas de coincidencia (`PracticeMatchCard`) en el modal de Práctica ocupan demasiado espacio vertical porque muestran nombre, badge, etiqueta de requisito, párrafo de explicación y filas completas de asignación con badges de cartas. El fix consiste en reducirlas al formato mínimo que ya usa el componente `Card` de `DeckQualityHero`: solo nombre + badge de estado, usando la clase CSS `.probability-check-card` con borde lateral coloreado, en un grid de 2 columnas. Todo el detalle permanece en el colapsable `PracticeTechnicalDetails` existente.

## Glosario

- **Bug_Condition (C)**: La condición que dispara el defecto — cuando `PracticeMatchCard` renderiza contenido excesivo (requirementLabel, explicación, filas de asignación) en lugar de solo nombre + badge
- **Property (P)**: El comportamiento deseado — cada tarjeta de coincidencia muestra únicamente nombre y badge de estado, con clase `.probability-check-card` y borde coloreado según tipo (opening/problem), en grid de 2 columnas
- **Preservation**: El comportamiento existente que no debe cambiar — lógica de evaluación de manos, detalle técnico en el colapsable, veredicto, near-misses, y tarjetas de `DeckQualityHero`
- **PracticeMatchCard**: Componente en `PracticeSection.tsx` que renderiza cada coincidencia (salida cumplida o problema detectado) en el modal de Práctica
- **PracticeMatchGroup**: Componente contenedor que agrupa las tarjetas de coincidencia bajo un título ("Salidas cumplidas" / "Problemas detectados")
- **CardSection**: Componente en `DeckQualityHero.tsx` que muestra tarjetas compactas en grid de 2 columnas — el estilo objetivo
- **PracticeTechnicalDetails**: Colapsable `<details>` que ya muestra el detalle carta por carta de cada check cumplido

## Bug Details

### Bug Condition

El defecto se manifiesta cuando el usuario roba una mano en el modal de Práctica y esa mano cumple al menos una salida o detecta al menos un problema. El componente `PracticeMatchCard` renderiza contenido excesivo (requirementLabel, explicación, filas de asignación) que infla el tamaño vertical de cada tarjeta y obliga a scroll extenso.

**Especificación Formal:**
```
FUNCTION isBugCondition(input)
  INPUT: input de tipo { matches: PracticeHandMatch[], component: 'PracticeMatchCard' }
  OUTPUT: boolean

  RETURN input.matches.length > 0
         AND input.component == 'PracticeMatchCard'
         AND cardRendersRequirementLabel(input)
         AND cardRendersExplanationText(input)
         AND cardRendersAssignmentRows(input)
END FUNCTION
```

### Ejemplos

- **Ejemplo 1**: Se roba una mano que cumple 1 salida → `PracticeMatchCard` muestra nombre, badge "Cumplida", `requirementLabel`, párrafo de explicación, y 2 filas de `PracticeAssignmentSummaryRow` con badges de cartas. **Esperado**: solo nombre + badge "Cumplida" con borde accent.
- **Ejemplo 2**: Se roba una mano que detecta 3 problemas → 3 tarjetas grandes en 1 columna, cada una con explicación y asignaciones. **Esperado**: 3 tarjetas compactas en grid de 2 columnas con borde danger.
- **Ejemplo 3**: Se roba una mano mixta (2 salidas + 1 problema) → 3 tarjetas grandes con scroll extenso. **Esperado**: 3 tarjetas compactas, detalle accesible solo en "Ver asignación completa".
- **Caso borde**: Se roba una mano sin coincidencias → no se renderizan tarjetas de match. **Esperado**: sin cambios, el flujo de "sin coincidencias" no se ve afectado.

## Expected Behavior

### Preservation Requirements

**Comportamientos sin cambios:**
- La lógica de `evaluatePracticeHand` debe seguir evaluando salidas, problemas y near-misses exactamente igual
- El colapsable `PracticeTechnicalDetails` ("Ver asignación completa") debe seguir mostrando el detalle carta por carta con el mismo nivel de información
- El bloque de veredicto (jugable/mala/mixta/neutra) con stats, resumen de roles y título/descripción debe permanecer intacto
- Las tarjetas de near-miss (`PracticeNearMissCard`) deben mantener su formato actual
- Las tarjetas compactas de `DeckQualityHero` (fuera del modal) deben seguir renderizando con el mismo estilo `.probability-check-card`

**Alcance:**
Todos los componentes y lógica que NO son `PracticeMatchCard` ni `PracticeMatchGroup` deben quedar completamente inalterados. Esto incluye:
- `PracticeTechnicalDetails` y sus sub-componentes
- `PracticeNearMissCard`
- `PracticeResultStat`
- Toda la lógica en `practice.ts`
- El componente `Card` y `CardSection` de `DeckQualityHero.tsx`

## Hypothesized Root Cause

Basado en el análisis del código, las causas del defecto son:

1. **PracticeMatchCard renderiza demasiado contenido**: El componente muestra `requirementLabel`, `getPracticeMatchExplanation(match)`, y un bloque completo de `PracticeAssignmentSummaryRow` con `PracticeCardBadge`. Todo esto debería estar solo en el colapsable técnico.

2. **No usa la clase CSS `.probability-check-card`**: La tarjeta actual usa clases genéricas (`surface-card-success` / `surface-card-danger`) en vez de `.probability-check-card` con `data-kind` y `data-active`, que ya provee el estilo compacto con borde lateral coloreado.

3. **PracticeMatchGroup usa grid de 1 columna**: El contenedor usa `grid min-w-0 gap-2` (1 columna implícita) en vez de `grid grid-cols-2 gap-3` como hace `CardSection` en `DeckQualityHero`.

4. **Duplicación de información**: La misma información de asignación se muestra tanto en `PracticeMatchCard` como en `PracticeTechnicalDetails`, cuando solo debería estar en el colapsable.

## Correctness Properties

Property 1: Bug Condition - Tarjetas de coincidencia compactas

_For any_ mano robada en el modal de Práctica donde existan coincidencias (salidas cumplidas o problemas detectados), la `PracticeMatchCard` corregida SHALL renderizar únicamente el nombre del patrón y un badge de estado ("Cumplida"/"Detectado"), usando la clase `.probability-check-card` con atributos `data-kind` (opening/problem) y `data-active="true"`, sin etiqueta de requisito, sin párrafo de explicación, y sin filas de asignación.

**Validates: Requirements 2.1, 2.3**

Property 2: Preservation - Lógica de evaluación y detalle técnico intactos

_For any_ mano robada en el modal de Práctica, la lógica de `evaluatePracticeHand` SHALL producir exactamente el mismo resultado que antes del fix, y el colapsable `PracticeTechnicalDetails` SHALL seguir mostrando el detalle carta por carta completo sin modificaciones.

**Validates: Requirements 3.1, 3.2, 3.3, 3.4, 3.5**

## Fix Implementation

### Cambios Requeridos

Asumiendo que el análisis de causa raíz es correcto:

**Archivo**: `src/components/probability/PracticeSection.tsx`

**Componente**: `PracticeMatchCard`

**Cambios Específicos**:
1. **Reemplazar el contenido de PracticeMatchCard**: Eliminar el bloque de `requirementLabel`, el párrafo de `getPracticeMatchExplanation`, y el bloque condicional de `assignments`. Dejar solo nombre + badge de estado.

2. **Usar clase `.probability-check-card`**: Cambiar la clase raíz del `<article>` de `getPracticeMatchCardClass(match.kind)` (que devuelve `surface-card-success`/`surface-card-danger`) a `probability-check-card`, y agregar atributos `data-kind={match.kind}`, `data-active="true"`.

3. **Simplificar el layout interno**: El contenido debe ser un flex row con nombre a la izquierda y badge a la derecha, similar al componente `Card` de `DeckQualityHero`.

**Componente**: `PracticeMatchGroup`

**Cambios Específicos**:
4. **Cambiar grid a 2 columnas**: Reemplazar `grid min-w-0 gap-2` por `grid grid-cols-2 gap-3 max-[640px]:grid-cols-1` en el contenedor de tarjetas, replicando el layout de `CardSection`.

5. **Eliminar código muerto**: Las funciones `getPracticeMatchCardClass`, `getPracticeMatchExplanation`, `getAssignmentStateLabel`, `getVisibleAssignmentCards`, y los componentes `PracticeAssignmentSummaryRow` y `PracticeCardBadge` ya no se usan desde `PracticeMatchCard` (pero `PracticeAssignmentSummaryRow` y `PracticeCardBadge` se siguen usando en `PracticeTechnicalDetails` vía `PracticeAssignmentDetailRow`, así que solo se eliminan las funciones helper que ya no se referencian).

## Testing Strategy

### Validation Approach

La estrategia de testing sigue un enfoque de dos fases: primero, verificar que el defecto existe en el código sin corregir, y luego verificar que el fix produce el resultado correcto y preserva el comportamiento existente.

### Exploratory Bug Condition Checking

**Objetivo**: Demostrar el defecto ANTES de implementar el fix. Confirmar que `PracticeMatchCard` renderiza contenido excesivo.

**Plan de Test**: Inspeccionar el componente `PracticeMatchCard` actual y verificar que renderiza `requirementLabel`, explicación y filas de asignación.

**Casos de Test**:
1. **Tarjeta con salida cumplida**: Verificar que `PracticeMatchCard` renderiza requirementLabel y explicación (fallará en código sin corregir porque los muestra)
2. **Tarjeta con problema detectado**: Verificar que renderiza filas de asignación completas (fallará en código sin corregir)
3. **Múltiples coincidencias**: Verificar que el grid es de 1 columna (fallará en código sin corregir)

**Contraejemplos Esperados**:
- `PracticeMatchCard` renderiza `<small>` con `requirementLabel` y `<p>` con explicación
- El contenedor usa grid de 1 columna implícita

### Fix Checking

**Objetivo**: Verificar que para todas las coincidencias, la tarjeta corregida produce el formato compacto esperado.

**Pseudocódigo:**
```
FOR ALL match WHERE isBugCondition(match) DO
  result := PracticeMatchCard_fixed(match)
  ASSERT result.hasClassName('probability-check-card')
  ASSERT result.hasAttribute('data-kind', match.kind)
  ASSERT result.hasAttribute('data-active', 'true')
  ASSERT result.containsOnly(match.name, statusBadge)
  ASSERT NOT result.contains(requirementLabel)
  ASSERT NOT result.contains(explanationText)
  ASSERT NOT result.contains(assignmentRows)
END FOR
```

### Preservation Checking

**Objetivo**: Verificar que todos los componentes no modificados siguen produciendo el mismo resultado.

**Pseudocódigo:**
```
FOR ALL input WHERE NOT isBugCondition(input) DO
  ASSERT PracticeTechnicalDetails_original(input) = PracticeTechnicalDetails_fixed(input)
  ASSERT PracticeNearMissCard_original(input) = PracticeNearMissCard_fixed(input)
  ASSERT PracticeResultStat_original(input) = PracticeResultStat_fixed(input)
  ASSERT evaluatePracticeHand_original(input) = evaluatePracticeHand_fixed(input)
END FOR
```

**Enfoque de Testing**: Se recomienda property-based testing para la preservación porque:
- Genera muchos casos de test automáticamente sobre el dominio de entrada
- Detecta edge cases que tests manuales podrían omitir
- Provee garantías fuertes de que el comportamiento no cambió para inputs no afectados

**Plan de Test**: Observar el comportamiento del código sin corregir para componentes no modificados, luego escribir tests que capturen ese comportamiento.

**Casos de Test**:
1. **Preservación de PracticeTechnicalDetails**: Verificar que el colapsable sigue mostrando detalle completo después del fix
2. **Preservación de veredicto**: Verificar que stats, roles y título/descripción del veredicto no cambian
3. **Preservación de near-misses**: Verificar que `PracticeNearMissCard` mantiene su formato
4. **Preservación de DeckQualityHero**: Verificar que las tarjetas fuera del modal no se alteran

### Unit Tests

- Verificar que `PracticeMatchCard` solo renderiza nombre y badge de estado
- Verificar que `PracticeMatchCard` usa clase `probability-check-card` con `data-kind` correcto
- Verificar que el grid de `PracticeMatchGroup` usa 2 columnas
- Verificar que `PracticeTechnicalDetails` sigue renderizando detalle completo

### Property-Based Tests

- Generar matches aleatorios y verificar que `PracticeMatchCard` siempre produce output compacto (solo nombre + badge)
- Generar manos aleatorias y verificar que `evaluatePracticeHand` produce resultados idénticos antes y después del fix
- Verificar que para cualquier configuración de matches, el colapsable técnico contiene toda la información de asignación

### Integration Tests

- Test de flujo completo: robar mano → verificar tarjetas compactas → abrir colapsable → verificar detalle completo
- Test de responsive: verificar que el grid colapsa a 1 columna en ≤640px
- Test visual: verificar que el borde lateral coloreado aparece correctamente según tipo (accent para opening, danger para problem)

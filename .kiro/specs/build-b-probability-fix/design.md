# Build B Probability Fix — Diseño del Bugfix

## Overview

Build B (deck importado) en ComparisonScreen no puede calcular probabilidades porque las cartas importadas llegan con `origin: null`, `roles: []` o `needsReview: true`, lo que genera errores bloqueantes en `probability-validation.ts`. No existe interfaz para corregir la clasificación de cartas de Build B.

El fix agrega estado local en `ComparisonScreen` para mantener una copia editable del `DeckBuilderState` de Build B. Al hacer click en una carta de Build B se abre un editor inline de origen/roles. Al guardar, se reconstruye el `PortableConfig` de Build B y se recalculan `compareBuild` e `interpretComparison` vía `useMemo`. No se toca Redux, Build A, `compareBuild`, `interpretComparison` ni `DeckImportDrawer`.

## Glosario

- **Bug_Condition (C)**: Condición que dispara el bug — Build B tiene cartas con `origin === null`, `roles.length === 0` o `needsReview === true`
- **Property (P)**: Comportamiento deseado — el usuario puede editar origen/roles de cartas de Build B y las probabilidades se recalculan correctamente
- **Preservation**: Build A, Redux, `compareBuild`, `interpretComparison` y `DeckImportDrawer` no se modifican
- **ComparisonScreen**: Componente en `src/components/comparison/ComparisonScreen.tsx` que orquesta la comparación de dos builds
- **PortableConfig**: Estructura serializable que representa un deck completo con cartas, patrones y configuración
- **DeckBuilderState**: Estado del deck builder con `main`, `extra`, `side` como arrays de `DeckCardInstance`
- **DeckCardInstance**: Instancia individual de carta con `instanceId`, `name`, `apiCard`, `origin`, `roles`, `needsReview`
- **needsReview**: Flag booleano que indica si la clasificación automática necesita confirmación del usuario

## Bug Details

### Bug Condition

El bug se manifiesta cuando Build B se genera desde un deck importado y alguna carta del Main Deck tiene clasificación incompleta. La función `computeProbabilities` delega a `validateCalculationState`, que produce errores bloqueantes para cartas sin origen, sin roles o con `needsReview: true`. Esto causa `summary: null` y probabilidades en 0%.

**Formal Specification:**
```
FUNCTION isBugCondition(input)
  INPUT: input of type PortableConfig (Build B generado desde import)
  OUTPUT: boolean

  FOR EACH card IN input.deckBuilder.main DO
    IF card.origin = null
       OR card.roles IS EMPTY
       OR card.needsReview = true THEN
      RETURN true
    END IF
  END FOR
  RETURN false
END FUNCTION
```

### Ejemplos

- Carta "Mystic Mine" importada sin clasificación → `origin: null, roles: [], needsReview: true` → validación falla → Openings 0.000%
- Carta "Ash Blossom" importada con clasificación automática → `origin: 'non_engine', roles: ['handtrap'], needsReview: true` → validación falla por `needsReview`
- Carta "Blue-Eyes White Dragon" importada, motor no la reconoce → `origin: null, roles: [], needsReview: true` → sin forma de corregir desde Compare
- Carta "Pot of Prosperity" importada, motor la reconoce y usuario la confirma → `origin: 'non_engine', roles: ['draw'], needsReview: false` → funciona correctamente (no es bug condition)

## Expected Behavior

### Preservation Requirements

**Unchanged Behaviors:**
- Build A (deck actual del workspace) no se modifica en estado, roles, origen ni probabilidades
- Redux y estado global de la aplicación no reciben escrituras desde ComparisonScreen
- `compareBuild()` produce el mismo `ComparisonResult` para los mismos inputs
- `interpretComparison()` produce el mismo `ComparisonInterpretation` para los mismos inputs
- `DeckImportDrawer` mantiene su flujo de importación sin cambios
- Mouse clicks en cartas de Build A siguen abriendo `CardDetailModal` como antes

**Scope:**
Todos los inputs que NO involucren edición de cartas de Build B deben ser completamente inalterados por este fix. Esto incluye:
- Navegación entre pantallas
- Importación de decks (flujo existente)
- Cálculo de probabilidades de Build A
- Interacción con cartas de Build A

## Hypothesized Root Cause

Basado en el análisis del bug, las causas son:

1. **Sin interfaz de edición para Build B**: `ComparisonScreen` solo muestra un `CardDetailModal` al hacer click en cartas, sin opciones de editar origen/roles. No existe un editor de clasificación accesible desde la pantalla Compare.

2. **Validación bloqueante en `probability-validation.ts`**: Las funciones `countCardsMissingOrigin`, `countCardsMissingRoles` y `countCardsPendingReview` generan errores de nivel `error` que causan `summary: null` en `calculateProbabilities`.

3. **`needsReview` no se limpia al importar**: La función `portableConfigFromImport` en `ComparisonScreen` marca `needsReview: true` para cartas sin clasificación completa, pero no hay forma de cambiar ese flag desde la UI.

4. **Estado inmutable sin capa de edición local**: `importedDeckBuilder` se usa directamente para generar `configB` sin una capa intermedia que permita mutaciones locales de clasificación.

## Correctness Properties

Property 1: Bug Condition — Edición de Build B recalcula probabilidades

_For any_ Build B donde la bug condition se cumple (isBugCondition retorna true), después de que el usuario edite origen y roles de todas las cartas sin clasificar, el sistema SHALL recalcular probabilidades correctamente (no 0.000%) y mostrar Verdict/Insights.

**Validates: Requirements 2.1, 2.2, 2.3**

Property 2: Preservation — Build A y funciones core no cambian

_For any_ edición de cartas de Build B, el sistema SHALL mantener Build A sin modificaciones, no escribir en Redux, y `compareBuild`/`interpretComparison` SHALL producir los mismos resultados para los mismos inputs que antes del fix.

**Validates: Requirements 3.1, 3.2, 3.3, 3.4, 3.5, 3.6**

## Fix Implementation

### Cambios Requeridos

Asumiendo que el análisis de causa raíz es correcto:

**Archivo**: `src/components/comparison/ComparisonScreen.tsx`

**Cambios Específicos**:

1. **Estado local editable para Build B**: Agregar un `useState` que mantenga un `Map<number, { origin: CardOrigin | null; roles: CardRole[] }>` con las ediciones del usuario indexadas por `ygoprodeckId`. Cuando el usuario importa un deck nuevo, se resetea este map.

2. **Función `applyEditsToConfig`**: Crear una función pura que tome el `DeckBuilderState` importado + el map de ediciones y produzca un `DeckBuilderState` con las ediciones aplicadas. Para cada carta editada: aplicar `origin` y `roles` del map, marcar `needsReview: false`.

3. **Reconstrucción de `configB` via useMemo**: Modificar el `useMemo` de `configB` para que use `applyEditsToConfig(importedDeckBuilder, editsMap)` en lugar del `importedDeckBuilder` directo. Esto dispara recálculo automático de `compareBuild` e `interpretComparison`.

4. **Editor inline de carta de Build B**: Al hacer click en una carta de Build B, abrir un panel/modal ligero que muestre:
   - Selector de origen (engine / non_engine / hybrid) — reutilizar el patrón visual de `DeckRolesPanel`
   - Toggles de roles agrupados por sección (Plan de Juego, Interacción, Utility)
   - Botón "Listo" que guarda en el map de ediciones

5. **Indicador visual de cartas que necesitan revisión**: En el `DeckGrid` de Build B, agregar un borde o badge visual a las cartas donde `origin === null || roles.length === 0 || needsReview === true` después de aplicar ediciones.

6. **Lógica de "ready" mejorada**: Ajustar la variable `ready` para considerar el estado post-edición. Ocultar Verdict/Insights mientras Build B tenga cartas sin categorizar. Mostrar mensaje "Build B necesita revisión" con conteo de cartas pendientes.

7. **`needsReview = false` al editar**: Cuando el usuario asigna un origen válido y al menos un rol a una carta, marcar `needsReview: false` en el map de ediciones.

**Archivos que NO se tocan**:
- `src/app/build-comparison.ts` — `compareBuild` e `interpretComparison` no cambian
- `src/app/deck-builder-slice.ts` — Redux no se modifica
- `src/components/deck-mode/DeckImportDrawer.tsx` — flujo de importación intacto
- `src/probability-validation.ts` — validación no cambia
- `src/probability-summary.ts` — cálculo no cambia

## Testing Strategy

### Validation Approach

La estrategia de testing sigue dos fases: primero, verificar que el bug se reproduce en el código sin fix, luego verificar que el fix funciona correctamente y preserva el comportamiento existente.

### Exploratory Bug Condition Checking

**Goal**: Demostrar que el bug existe ANTES de implementar el fix. Confirmar que cartas sin clasificar producen `summary: null`.

**Test Plan**: Construir un `PortableConfig` con cartas sin clasificar y verificar que `computeProbabilities` retorna `summary: null`.

**Test Cases**:
1. **Cartas sin origen**: Config con cartas donde `origin: null` → validación produce error bloqueante (fallará en código sin fix)
2. **Cartas sin roles**: Config con cartas donde `roles: []` → validación produce error bloqueante (fallará en código sin fix)
3. **Cartas con needsReview**: Config con cartas donde `needsReview: true` → validación produce error bloqueante (fallará en código sin fix)
4. **Mix de cartas**: Config con algunas cartas clasificadas y otras no → probabilidades en 0% (fallará en código sin fix)

**Expected Counterexamples**:
- `calculateProbabilities` retorna `summary: null` para configs con cartas sin clasificar
- Causa: `validateCalculationState` genera errores de nivel `error` para `origin === null`, `roles.length === 0`, `needsReview === true`

### Fix Checking

**Goal**: Verificar que para todos los inputs donde la bug condition se cumple, después de editar las cartas, las probabilidades se calculan correctamente.

**Pseudocode:**
```
FOR ALL input WHERE isBugCondition(input) DO
  edits ← assignValidClassification(input)
  editedConfig ← applyEditsToConfig(input, edits)
  result ← computeProbabilities(editedConfig)
  ASSERT result.summary ≠ null OR noPatterns(editedConfig)
  ASSERT editedConfig.cards.every(c => c.needsReview = false)
END FOR
```

### Preservation Checking

**Goal**: Verificar que para todos los inputs donde la bug condition NO se cumple, `compareBuild` e `interpretComparison` producen los mismos resultados.

**Pseudocode:**
```
FOR ALL input WHERE NOT isBugCondition(input) DO
  ASSERT compareBuild(configA, input) = compareBuild(configA, input)
  ASSERT interpretComparison(result) = interpretComparison(result)
END FOR
```

**Testing Approach**: Property-based testing es recomendado para preservation checking porque:
- Genera muchos casos de prueba automáticamente
- Detecta edge cases que tests manuales podrían perder
- Provee garantías fuertes de que el comportamiento no cambia para inputs no-buggy

**Test Plan**: Observar comportamiento en código sin fix para configs válidos, luego escribir property-based tests capturando ese comportamiento.

**Test Cases**:
1. **Preservation de Build A**: Verificar que editar Build B no modifica el `PortableConfig` de Build A
2. **Preservation de compareBuild**: Verificar que `compareBuild` produce el mismo resultado para los mismos inputs
3. **Preservation de interpretComparison**: Verificar que `interpretComparison` produce el mismo resultado para el mismo `ComparisonResult`
4. **Preservation de Redux**: Verificar que no se despachan acciones a Redux durante la edición de Build B

### Unit Tests

- Test que `applyEditsToConfig` aplica ediciones correctamente y marca `needsReview: false`
- Test que `applyEditsToConfig` no modifica cartas sin ediciones
- Test que editar origen/roles de una carta con origen válido y al menos un rol marca `needsReview: false`
- Test que cartas sin editar mantienen su estado original
- Test que el map de ediciones se resetea al importar un deck nuevo

### Property-Based Tests

- Generar configs aleatorios con cartas sin clasificar, aplicar ediciones válidas, verificar que `needsReview` se marca `false` y probabilidades se calculan
- Generar configs aleatorios válidos, verificar que `compareBuild` produce resultados idénticos antes y después del fix
- Generar `ComparisonResult` aleatorios, verificar que `interpretComparison` produce resultados idénticos

### Integration Tests

- Test de flujo completo: importar deck → ver cartas sin clasificar resaltadas → editar origen/roles → ver probabilidades actualizadas
- Test que Verdict/Insights se ocultan mientras Build B tiene cartas sin categorizar y aparecen después de categorizar
- Test que importar un deck nuevo resetea las ediciones previas

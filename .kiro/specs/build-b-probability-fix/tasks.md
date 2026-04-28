# Plan de Implementación — Build B Probability Fix

## Fase 1: Función pura y tests unitarios

- [x] 1. Crear `src/app/build-comparison-edits.ts` con `applyEditsToConfig`
  - Input: `DeckBuilderState` (importado) + `Map<number, { origin: CardOrigin; roles: CardRole[] }>` (ediciones por `ygoprodeckId`)
  - Output: nuevo `DeckBuilderState` con ediciones aplicadas
  - Para cada carta en main/extra/side cuyo `ygoprodeckId` esté en el map: aplicar `origin` y `roles` del map, marcar `needsReview: false`
  - Cartas sin ediciones mantienen su estado original
  - NUNCA mutar el `DeckBuilderState` original — retornar copia nueva
  - Exportar también tipo `CardEditMap = Map<number, { origin: CardOrigin; roles: CardRole[] }>`
  - Exportar helper `isBuildBReady(deckBuilder: DeckBuilderState): boolean` que retorna `true` si ninguna carta del main tiene `origin === null`, `roles.length === 0` o `needsReview === true`
  - _Requirements: 2.1, 2.2, 3.1, 3.2_

- [x] 2. Escribir tests unitarios de `applyEditsToConfig`
  - Archivo: `src/__tests__/build-b-probability-fix.test.ts`
  - Test: aplica origin/roles y marca `needsReview: false` para cartas editadas
  - Test: no muta el `DeckBuilderState` original (deep equality check)
  - Test: cartas sin edición mantienen su estado original intacto
  - Test: `isBuildBReady` retorna `false` cuando hay cartas con `origin === null`, `roles: []` o `needsReview: true`
  - Test: `isBuildBReady` retorna `true` cuando todas las cartas tienen origin válido, roles no vacíos y `needsReview: false`
  - Ejecutar tests y verificar que PASAN
  - _Requirements: 2.1, 2.2, 3.1, 3.2_

## Fase 2: Integración en ComparisonScreen

- [x] 3. Integrar `applyEditsToConfig` en ComparisonScreen
  - [x] 3.1 Agregar estado local editable para Build B
    - Archivo: `src/components/comparison/ComparisonScreen.tsx`
    - Agregar `useState<CardEditMap>(new Map())` para mantener ediciones del usuario
    - Resetear el map cuando se importa un deck nuevo
    - Modificar `configB` useMemo para usar `applyEditsToConfig(importedDeckBuilder, editsMap)` antes de generar el `PortableConfig`
    - Esto dispara recálculo automático de `compareBuild` e `interpretComparison` vía useMemo existentes
    - _Requirements: 2.1, 2.2, 2.3, 3.1, 3.2, 3.6_

  - [x] 3.2 Agregar editor inline mínimo de origen/roles para cartas de Build B
    - Crear componente `src/components/comparison/BuildBCardEditor.tsx`
    - Al hacer click en una carta de Build B, abrir un panel/modal ligero con:
      - Selector de origen (engine / non_engine / hybrid)
      - Toggles de roles agrupados por sección (Plan de Juego, Interacción, Utility)
      - Botón "Listo" que guarda en el `editsMap`
    - Diferenciar click en carta de Build A (abre `CardDetailModal` como antes) vs Build B (abre editor)
    - _Requirements: 2.1, 2.4, 3.1_

  - [x] 3.3 Resaltar cartas de Build B que necesitan revisión
    - En el grid de Build B, agregar borde/badge visual a cartas donde `origin === null || roles.length === 0 || needsReview === true` después de aplicar ediciones
    - Mostrar conteo de cartas pendientes y mensaje "Hacé click en una carta para revisar sus categorías"
    - _Requirements: 2.4, 2.5_

  - [x] 3.4 Ocultar Verdict/Insights mientras Build B no esté listo
    - Usar `isBuildBReady` para determinar si Build B está lista
    - Ocultar `VerdictCard` e `InsightList` mientras `isBuildBReady` retorne `false`
    - Mostrar mensaje "Build B necesita revisión" con conteo de cartas pendientes
    - _Requirements: 2.5, 2.3_

## Fase 3: Tests de integración y validación

- [x] 4. Tests de integración
  - Archivo: `src/__tests__/build-b-probability-fix.test.ts`
  - Test: editar Build B no modifica Build A (configA permanece idéntico)
  - Test: Build B con cartas pendientes oculta Verdict/Insights
  - Test: Build B completamente editada permite recalcular probabilidades (no 0.000% si hay patrones válidos)
  - Test: importar un nuevo deck resetea ediciones previas
  - Ejecutar tests y verificar que PASAN
  - _Requirements: 2.3, 2.5, 3.1, 3.3, 3.4, 3.5_

- [x] 5. Checkpoint final — todos los tests y build pasan
  - Ejecutar `npx vitest run` para verificar que todos los tests del proyecto pasan
  - Ejecutar `npx tsc --noEmit` para verificar tipos
  - Verificar que tests existentes de `build-comparison.test.ts` y `build-comparison-ui.test.tsx` siguen pasando
  - Reportar archivos modificados y causa exacta del 0.000%

# Plan de Implementación: Build Comparison

## Resumen

Implementación de la feature Build Comparison siguiendo la arquitectura de tres capas puras definida en el diseño: Comparison_Engine (función pura `compareBuild`), Insight_Interpreter (función pura `interpretComparison`) y Comparison_View (componentes React). Se prioriza la lógica pura primero, luego los componentes de UI, y finalmente la integración con el workspace existente.

## Riesgos y Dependencias

- **Dependencia**: El motor de probabilidad existente (`calculateProbabilities`, `buildCalculatorState`, `deriveMainDeckCardsFromZone`) debe funcionar correctamente con `PortableConfig` reconstruidos desde snapshots.
- **Dependencia**: `toPortableConfig` y `fromPortableConfig` en `src/app/app-state-codec.ts` son necesarios para convertir entre `AppState` y `PortableConfig`.
- **Dependencia**: `getPatternDefinitionKey` en `src/app/patterns.ts` se usa para emparejar patrones entre builds.
- **Riesgo**: Patrones con matchers de tipo `card` o `card_pool` pueden tener IDs distintos entre builds reconstruidas. El emparejamiento por `definitionKey` mitiga esto.
- **Riesgo**: Builds sin clasificar (origin/roles null) producen `summary: null` del motor de probabilidad. Se trata como probabilidad 0.

## Tareas

- [x] 1. Implementar tipos y constantes del Comparison_Engine
  - [x] 1.1 Crear archivo `src/app/build-comparison.ts` con los tipos `DeckSource`, `CardDiff`, `RoleDistribution`, `PatternComparison`, `ComparisonResult` y las constantes `SIGNIFICANCE_THRESHOLD` y `MAX_INSIGHTS`
    - Definir todos los tipos TypeScript del diseño (sección "Modelos de Datos — Tipos del Comparison_Engine")
    - Exportar `SIGNIFICANCE_THRESHOLD = 0.01` y `MAX_INSIGHTS = 3`
    - _Requisitos: 8.1_

- [x] 2. Implementar función pura `compareBuild`
  - [x] 2.1 Implementar `compareBuild(buildA: PortableConfig, buildB: PortableConfig): ComparisonResult` en `src/app/build-comparison.ts`
    - Derivar `CardEntry[]` de cada build usando `deriveMainDeckCardsFromZone` (importar de `src/app/calculator-state.ts`)
    - Reconstruir `DeckCardInstance[]` desde `PortableConfig.deckBuilder.main` asignando `instanceId` temporal con `createId`
    - Calcular `CalculationSummary` para cada build usando `buildCalculatorState` + `calculateProbabilities` (importar de `src/probability.ts`)
    - Computar `CardDiff[]` comparando cartas del Main Deck por nombre (case-insensitive via `normalizeName` de `src/app/utils.ts`)
    - Computar `RoleDistribution` para cada build contando roles de las `CardEntry[]` derivadas (una carta con múltiples roles incrementa cada rol independientemente, multiplicado por copias)
    - Computar `PatternComparison[]` emparejando patrones por `getPatternDefinitionKey` (importar de `src/app/patterns.ts`)
    - Calcular `buildsAreIdentical` verificando que todos los diffs estén vacíos y deltas en cero
    - Manejar builds con Main Deck vacío (retornar resultado con deckSize 0, diffs vacíos, roles en cero)
    - Manejar builds sin patrones (patternComparisons vacío, probabilidades en 0)
    - Manejar `summary: null` del motor de probabilidad como probabilidad 0
    - _Requisitos: 5.1, 5.2, 6.1, 6.4, 7.1, 7.2, 8.1, 8.2, 8.3, 8.4_

  - [x] 2.2 Escribir property test: Propiedad 9 — Correctitud del Card_Diff
    - **Property 9: Correctitud del Card_Diff**
    - Generar pares de `PortableConfig` con `arbitraryPortableConfigPair`
    - Verificar que cada `CardDiff` tiene `changeType` correcto según `copiesA`/`copiesB` y `delta === copiesA - copiesB`
    - Archivo: `src/__tests__/build-comparison.test.ts`
    - **Validates: Requirements 5.1, 5.2**

  - [x] 2.3 Escribir property test: Propiedad 10 — Role_Distribution con soporte multi-rol
    - **Property 10: Role_Distribution con soporte multi-rol**
    - Generar `PortableConfig` con `arbitraryPortableConfig`
    - Verificar que si una carta tiene roles `['starter', 'searcher']` con 3 copias, ambos roles se incrementan en 3
    - Archivo: `src/__tests__/build-comparison.test.ts`
    - **Validates: Requirements 6.1, 6.4**

  - [x] 2.4 Escribir property test: Propiedad 11 — Clasificación de exclusividad de patrones
    - **Property 11: Clasificación de exclusividad de patrones**
    - Generar pares de `PortableConfig` con `arbitraryPortableConfigPair`
    - Verificar que `exclusiveTo` es `'A'`, `'B'` o `null` según presencia del patrón en cada build
    - Archivo: `src/__tests__/build-comparison.test.ts`
    - **Validates: Requirements 7.1, 7.2**

  - [x] 2.5 Escribir property test: Propiedad 12 — Independencia del orden de cartas
    - **Property 12: Independencia del orden de cartas**
    - Generar pares de `PortableConfig` con `arbitraryPortableConfigPair`, permutar cartas del Main Deck
    - Verificar que `CardDiff[]` es idéntico con y sin permutación
    - Archivo: `src/__tests__/build-comparison.test.ts`
    - **Validates: Requirements 8.2**

  - [x] 2.6 Escribir property test: Propiedad 13 — Comparación identidad
    - **Property 13: Comparación identidad**
    - Generar `PortableConfig` con `arbitraryPortableConfig`
    - Verificar que `compareBuild(config, config)` retorna `buildsAreIdentical === true`, `cardDiffs` vacío, deltas de roles en cero, `PatternComparison` con `delta === 0`
    - Archivo: `src/__tests__/build-comparison.test.ts`
    - **Validates: Requirements 8.3**

  - [x] 2.7 Escribir property test: Propiedad 14 — Simetría de la comparación
    - **Property 14: Simetría de la comparación**
    - Generar pares de `PortableConfig` con `arbitraryPortableConfigPair`
    - Verificar que `compareBuild(A, B).cardDiffs[i].delta === -compareBuild(B, A).cardDiffs[i].delta` y que `added` ↔ `removed`
    - Archivo: `src/__tests__/build-comparison.test.ts`
    - **Validates: Requirements 8.4**

  - [x] 2.8 Escribir unit tests de edge cases para `compareBuild`
    - Dos builds vacías → resultado vacío
    - Build con una carta agregada → un `CardDiff` con `changeType === 'added'`
    - Build con carta removida → un `CardDiff` con `changeType === 'removed'`
    - Build con carta modificada (2→3 copias) → `CardDiff` con `changeType === 'modified'` y `delta === 1`
    - Build sin patrones → `patternComparisons` vacío
    - Build con `summary: null` → probabilidades en 0
    - Archivo: `src/__tests__/build-comparison.test.ts`
    - _Requisitos: 5.1, 5.2, 7.1, 8.1, 8.3_

- [x] 3. Checkpoint — Verificar que `compareBuild` pasa todos los tests
  - Ejecutar `npm run test` y asegurar que todos los tests de `build-comparison.test.ts` pasan. Preguntar al usuario si hay dudas.

- [x] 4. Checkpoint manual — Validación de `compareBuild` con datos reales
  - [x] 4.1 Crear script temporal `src/__tests__/compare-build-validation.ts` que importe `compareBuild` y lo ejecute con al menos 2 pares de builds reales del usuario (construidas manualmente como `PortableConfig` fixtures representativos del uso real)
    - Loggear el `ComparisonResult` completo en consola para inspección manual
    - Validar visualmente que `cardDiffs` son correctos: cartas added/removed/modified con deltas coherentes
    - Validar que `RoleDistribution` refleja los roles reales del deck (starters, extenders, bricks, handtraps)
    - Validar que probabilidades de openings y problems son razonables (no NaN, no negativos, entre 0 y 1)
    - Validar que `buildsAreIdentical` retorna `true` cuando se compara una build contra sí misma
    - Validar que `buildsAreIdentical` retorna `false` cuando las builds difieren
  - [x] 4.2 Confirmar con el usuario que los resultados son correctos antes de continuar
    - No avanzar a `interpretComparison` hasta que el usuario confirme que los outputs de `compareBuild` son coherentes con sus expectativas
    - Si hay discrepancias, corregir `compareBuild` y re-ejecutar la validación

- [x] 5. Implementar tipos y función pura `interpretComparison`
  - [x] 5.1 Agregar tipos `InsightPriority`, `Insight`, `VerdictType`, `Verdict`, `ComparisonInterpretation` en `src/app/build-comparison.ts`
    - Definir todos los tipos TypeScript del diseño (sección "Modelos de Datos — Tipos del Insight_Interpreter")
    - _Requisitos: 3.1, 4.1_

  - [x] 5.2 Implementar `interpretComparison(result: ComparisonResult): ComparisonInterpretation` en `src/app/build-comparison.ts`
    - Generar Insights candidatos evaluando deltas de roles (starters, bricks/garnets, extenders, handtraps) y probabilidades (openings, problems) y origin (engine)
    - Filtrar candidatos cuyo delta absoluto sea menor al `SIGNIFICANCE_THRESHOLD`
    - Asignar prioridades: critical (starters, bricks, openings), high (extenders, handtraps, problems), normal (engine)
    - Ordenar por prioridad (critical > high > normal) y seleccionar top 3
    - Aplicar reglas de Verdict en orden: (a) delta de openings, (b) delta de bricks, (c) delta de problems
    - Detectar trade-offs cuando openings mejoran pero bricks aumentan (o viceversa)
    - Generar `recommendation` según tipo de Verdict (ver Copy Guidelines del diseño)
    - Generar `tradeoffDetail` cuando aplique, respondiendo: cuál build conviene, cuál es el costo, cuándo elegirla
    - Formatear `openingDeltaFormatted` como string de porcentaje y `bricksDelta` como entero
    - Usar textos en formato causa → efecto según Copy Guidelines del diseño (lenguaje de jugador, frases cortas)
    - _Requisitos: 2.1, 2.2, 2.3, 2.5, 3.1–3.14, 4.1–4.8_

  - [x] 5.3 Escribir property test: Propiedad 1 — Máximo 3 Insights
    - **Property 1: Máximo 3 Insights**
    - Generar `ComparisonResult` con `arbitraryComparisonResult`
    - Verificar que `interpretComparison(result).insights.length <= 3`
    - Archivo: `src/__tests__/build-comparison.test.ts`
    - **Validates: Requirements 2.3, 3.1, 3.12**

  - [x] 5.4 Escribir property test: Propiedad 2 — Insights ordenados por prioridad
    - **Property 2: Insights ordenados por prioridad**
    - Generar `ComparisonResult` con `arbitraryComparisonResult`
    - Verificar que para todo par consecutivo `(insights[i], insights[i+1])`, la prioridad de `insights[i]` es mayor o igual a la de `insights[i+1]`
    - Archivo: `src/__tests__/build-comparison.test.ts`
    - **Validates: Requirements 3.2**

  - [x] 5.5 Escribir property test: Propiedad 3 — Filtrado por umbral de significancia
    - **Property 3: Filtrado por umbral de significancia**
    - Generar `ComparisonResult` donde todos los deltas < `SIGNIFICANCE_THRESHOLD`
    - Verificar que `interpretComparison(result).insights.length === 0`
    - Archivo: `src/__tests__/build-comparison.test.ts`
    - **Validates: Requirements 3.13**

  - [x] 5.6 Escribir property test: Propiedad 4 — Insights críticos para starters y bricks
    - **Property 4: Insights críticos para cambios de starters y bricks**
    - Generar `ComparisonResult` con delta de starters > threshold o cambio de bricks/garnets
    - Verificar que existe al menos un Insight con prioridad `critical`
    - Archivo: `src/__tests__/build-comparison.test.ts`
    - **Validates: Requirements 3.3, 3.4, 3.5, 3.6**

  - [x] 5.7 Escribir property test: Propiedad 5 — Prioridad correcta según tipo de rol
    - **Property 5: Insights de prioridad correcta según tipo de rol**
    - Generar `ComparisonResult` con delta de extenders/handtraps > threshold
    - Verificar que existe Insight con prioridad `high`; para engine, prioridad `normal`
    - Archivo: `src/__tests__/build-comparison.test.ts`
    - **Validates: Requirements 3.7, 3.8, 3.9**

  - [x] 5.8 Escribir property test: Propiedad 6 — Cadena de prioridad del Verdict
    - **Property 6: Cadena de prioridad del Verdict**
    - Generar `ComparisonResult` con distintas combinaciones de deltas
    - Verificar que el Verdict sigue la cadena: openings > bricks > problems > equivalent
    - Archivo: `src/__tests__/build-comparison.test.ts`
    - **Validates: Requirements 4.1, 4.2, 4.3, 4.4, 4.5, 2.5**

  - [x] 5.9 Escribir property test: Propiedad 7 — Detección de trade-offs
    - **Property 7: Detección de trade-offs en el Verdict**
    - Generar `ComparisonResult` donde openings mejoran pero bricks aumentan
    - Verificar que `verdict.type === 'tradeoff'` y `tradeoffDetail` no es null
    - Archivo: `src/__tests__/build-comparison.test.ts`
    - **Validates: Requirements 4.6**

  - [x] 5.10 Escribir property test: Propiedad 8 — Formato del Verdict
    - **Property 8: Formato del Verdict incluye deltas y recommendation**
    - Generar `ComparisonResult` válido
    - Verificar que `openingDeltaFormatted` es string, `bricksDelta` es entero, `recommendation` no es null
    - Archivo: `src/__tests__/build-comparison.test.ts`
    - **Validates: Requirements 4.7, 4.8**

  - [x] 5.11 Escribir unit tests de edge cases para `interpretComparison`
    - Resultado con +3 starters → insight critical con texto causa → efecto
    - Resultado con -2 handtraps → insight high con texto causa → efecto
    - Resultado con trade-off (mejora openings, más bricks) → verdict tradeoff con `tradeoffDetail` y `recommendation`
    - Resultado con diferencias marginales (< 1pp) → verdict equivalent, sin insights
    - Verdict `a_better` por openings → `recommendation` = `"Recomendado si priorizás consistencia"`
    - Verdict `a_better` por bricks → `recommendation` = `"Recomendado si querés reducir manos muertas"`
    - Textos siguen Copy Guidelines (causa → efecto, frases cortas, lenguaje de jugador)
    - Archivo: `src/__tests__/build-comparison.test.ts`
    - _Requisitos: 3.1–3.14, 4.1–4.8_

- [x] 6. Checkpoint — Verificar que `interpretComparison` pasa todos los tests
  - Ejecutar `npm run test` y asegurar que todos los tests de `build-comparison.test.ts` pasan. Preguntar al usuario si hay dudas.

- [x] 7. Implementar componentes de UI
  - [x] 7.1 Crear componente `VerdictCard` en `src/components/comparison/VerdictCard.tsx`
    - Props: `verdict: Verdict`
    - Fondo con tono contextual (verde = mejora, rojo = empeora, neutro = equivalente)
    - Texto principal: "Build A es mejor" / "Build B es mejor" / "Equivalentes"
    - Subtexto: delta de openings como porcentaje + delta de bricks como cantidad
    - Recomendación: texto contextual debajo del subtexto cuando `recommendation` no es null
    - Trade-off: indicador visual con ambos factores cuando `verdict.type === 'tradeoff'`
    - Seguir patrones de CSS existentes: `surface-card`, `app-muted`, `app-kicker`, clases Tailwind del proyecto
    - _Requisitos: 2.1, 2.2, 4.6, 4.7_

  - [x] 7.2 Crear componente `InsightList` en `src/components/comparison/InsightList.tsx`
    - Props: `insights: Insight[]`
    - Lista de hasta 3 Insights ordenados por prioridad
    - Cada Insight: icono de prioridad (⚠️ critical, 📊 high, ℹ️ normal), texto causa → efecto, badge con delta
    - Seguir patrones de CSS existentes del proyecto
    - _Requisitos: 2.3, 3.1, 3.2_

  - [x] 7.3 Crear componente `ProbabilityComparison` en `src/components/comparison/ProbabilityComparison.tsx`
    - Props: `patterns: PatternComparison[]`, totales de openings/problems para cada build
    - Tabla side-by-side de probabilidades por patrón con delta
    - Resumen de openings y problems totales
    - Patrones exclusivos marcados visualmente
    - _Requisitos: 7.1, 7.2, 7.3, 7.4, 7.5_

  - [x] 7.4 Crear componente `RoleComparison` en `src/components/comparison/RoleComparison.tsx`
    - Props: `rolesA: RoleDistribution`, `rolesB: RoleDistribution`
    - Distribución de roles side-by-side con delta numérico
    - Resaltar deltas distintos de cero
    - _Requisitos: 6.1, 6.2, 6.3_

  - [x] 7.5 Crear componente `CardDiffList` en `src/components/comparison/CardDiffList.tsx`
    - Props: `diffs: CardDiff[]`, `deckSizeA: number`, `deckSizeB: number`
    - Cartas agregadas (verde), removidas (rojo), modificadas (amarillo)
    - Delta de copias para cada carta
    - Conteo total de Main Deck para cada build
    - _Requisitos: 5.1, 5.2, 5.3, 5.4, 5.5_

  - [x] 7.6 Crear componente contenedor `ComparisonView` en `src/components/comparison/ComparisonView.tsx`
    - Props: `snapshots: WorkspaceSnapshot[]`, `currentAppState: AppState`
    - Estado interno: `sourceA: DeckSource`, `sourceB: DeckSource`
    - Selectores de Deck_Source (workspace actual o snapshot)
    - Resolver `PortableConfig` para cada source (workspace actual via `toPortableConfig`, snapshot via `snapshot.config`)
    - Llamar `compareBuild` dentro de `useMemo` con dependencias `[configA, configB]` para evitar recálculos en cada render
    - Llamar `interpretComparison` dentro de un segundo `useMemo` con dependencia `[comparisonResult]`
    - No ejecutar lógica de comparación fuera de `useMemo`; cambios de UI (expandir/colapsar, hover, scroll) no deben disparar recálculos
    - Renderizar `VerdictCard`, `InsightList`, y sección de datos detallados (expandible) con `ProbabilityComparison`, `RoleComparison`, `CardDiffList`
    - Mostrar aviso cuando ambos sources son iguales (builds idénticas)
    - Mostrar mensaje cuando no hay snapshots guardados
    - Jerarquía visual: Verdict → Insights → Datos detallados
    - _Requisitos: 1.1–1.5, 2.1–2.5, 9.1, 9.2, 9.3_

- [x] 8. Checkpoint — Verificar que los componentes compilan sin errores
  - Ejecutar `tsc -p src/tsconfig.json` para verificar que no hay errores de tipos. Preguntar al usuario si hay dudas.

- [x] 9. Integrar acceso desde el panel de workspace
  - [x] 9.1 Agregar botón "Comparar builds" en `src/components/workspace/AdvancedWorkspacePanel.tsx` que abra la `ComparisonView`
    - Agregar estado para controlar visibilidad de la vista de comparación
    - Pasar `snapshots` y `currentAppState` como props a `ComparisonView`
    - Cuando el usuario cierra la vista de comparación, volver al panel de workspace sin modificar el estado
    - _Requisitos: 9.1, 9.3_

  - [x] 9.2 Modificar `src/components/WorkspacePanel.tsx` para pasar `currentAppState` al `AdvancedWorkspacePanel`
    - Obtener `AppState` actual desde Redux usando `selectAppState` (importar de `src/app/store.ts`)
    - Pasar como prop al `AdvancedWorkspacePanel`
    - _Requisitos: 9.1_

- [x] 10. Escribir tests de UI
  - [x] 10.1 Escribir tests de `VerdictCard` con React Testing Library
    - VerdictCard renderiza correctamente para cada tipo de verdict (`a_better`, `b_better`, `equivalent`, `tradeoff`)
    - VerdictCard muestra `recommendation` cuando no es null
    - VerdictCard no muestra sección de recommendation cuando es null
    - VerdictCard muestra `tradeoffDetail` cuando verdict es tradeoff
    - Archivo: `src/__tests__/build-comparison-ui.test.tsx`
    - _Requisitos: 2.1, 2.2, 4.6, 4.7_

  - [x] 10.2 Escribir tests de `InsightList` con React Testing Library
    - InsightList muestra máximo 3 items
    - Cada item muestra texto en formato causa → efecto
    - Iconos de prioridad correctos
    - Archivo: `src/__tests__/build-comparison-ui.test.tsx`
    - _Requisitos: 2.3, 3.1, 3.2_

  - [x] 10.3 Escribir tests de `ComparisonView` con React Testing Library
    - ComparisonView muestra aviso cuando ambos sources son iguales
    - ComparisonView muestra mensaje cuando no hay snapshots
    - ComparisonView renderiza jerarquía Verdict → Insights → Datos
    - Archivo: `src/__tests__/build-comparison-ui.test.tsx`
    - _Requisitos: 1.5, 2.1, 9.2_

- [x] 11. Checkpoint final — Build completo y todos los tests pasan
  - Ejecutar `npm run test` para verificar que todos los tests pasan.
  - Ejecutar `npm run build` para verificar que el build de producción compila sin errores.
  - Preguntar al usuario si hay dudas o ajustes necesarios.

## Notas

- TODOS los tests (property tests, unit tests y tests de UI) son obligatorios. No hay tareas opcionales.
- Cada tarea referencia requisitos específicos para trazabilidad.
- Los checkpoints aseguran validación incremental. El checkpoint manual (Task 4) es crítico: no avanzar a `interpretComparison` sin validar `compareBuild` con datos reales.
- Los property tests validan propiedades universales de correctitud (14 propiedades del diseño).
- Los unit tests validan escenarios específicos y edge cases.
- Los tests de UI validan renderizado correcto de los componentes.
- Toda la lógica de negocio vive en funciones puras en `src/app/build-comparison.ts`. Los componentes React solo renderizan.

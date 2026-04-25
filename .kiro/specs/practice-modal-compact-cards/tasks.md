# Plan de Implementación

- [x] 1. Escribir test exploratorio de bug condition
  - **Property 1: Bug Condition** - PracticeMatchCard renderiza contenido excesivo
  - **IMPORTANTE**: Escribir este test property-based ANTES de implementar el fix
  - **OBJETIVO**: Demostrar que el bug existe — `PracticeMatchCard` renderiza requirementLabel, explicación y filas de asignación cuando solo debería mostrar nombre + badge
  - **Enfoque PBT con alcance concreto**: Generar `PracticeHandMatch` arbitrarios con `fast-check` y verificar que el output del componente actual contiene contenido excesivo
  - Crear archivo `src/__tests__/practice-compact-cards.test.ts`
  - Importar los tipos `PracticeHandMatch` y `PracticeHandRequirementAssignment` de `../components/probability/practice`
  - Generar matches con `fc.record(...)` incluyendo `name`, `kind` (opening/problem), `requirementLabel`, y `assignments` con al menos 1 entrada
  - Verificar que el componente `PracticeMatchCard` actual:
    - Usa clase `surface-card-success` o `surface-card-danger` (NO `.probability-check-card`)
    - Renderiza `requirementLabel` como `<small>` dentro de la tarjeta
    - Renderiza párrafo de explicación (`getPracticeMatchExplanation`)
    - Renderiza filas de `PracticeAssignmentSummaryRow` cuando hay asignaciones
  - Ejecutar test en código SIN corregir — **RESULTADO ESPERADO**: Test FALLA (confirma que el bug existe, las tarjetas muestran contenido excesivo en vez de formato compacto)
  - Documentar contraejemplos encontrados (ej: "PracticeMatchCard con kind='opening' renderiza requirementLabel y explicación además de nombre y badge")
  - Marcar tarea completa cuando el test esté escrito, ejecutado, y el fallo documentado
  - _Requirements: 1.1, 1.2, 1.3_

- [x] 2. Escribir tests de preservación property-based (ANTES de implementar el fix)
  - **Property 2: Preservation** - Lógica de evaluación y componentes no modificados intactos
  - **IMPORTANTE**: Seguir metodología observation-first
  - Observar: `evaluatePracticeHand` produce resultados idénticos para cualquier combinación de mano/patrones en código sin corregir
  - Observar: `PracticeTechnicalDetails` renderiza detalle completo con `requirementLabel`, `PracticeAssignmentDetailRow` y `PracticeCardBadge` en código sin corregir
  - Observar: `PracticeNearMissCard` mantiene su formato con nombre, requirementLabel, badge de missingConditions y notas
  - Observar: Las funciones helper `getPracticeMatchStateLabel` y `getPracticeMatchStateBadgeClass` devuelven los mismos valores para opening/problem
  - Escribir property-based tests en `src/__tests__/practice-compact-cards.test.ts`:
    - **Propiedad de evaluación**: Para toda mano generada con `fast-check`, `evaluatePracticeHand` produce el mismo resultado (la función no se modifica, pero verificar que sigue siendo invocable con la misma firma)
    - **Propiedad de labels**: Para todo `kind` ∈ {opening, problem}, `getPracticeMatchStateLabel` y `getPracticeMatchStateBadgeClass` devuelven valores consistentes
    - **Propiedad de near-miss**: Para todo `PracticeHandNearMiss` generado, el componente `PracticeNearMissCard` renderiza nombre, requirementLabel, badge de missingConditions y notas
  - Ejecutar tests en código SIN corregir — **RESULTADO ESPERADO**: Tests PASAN (confirma el baseline de comportamiento a preservar)
  - Marcar tarea completa cuando los tests estén escritos, ejecutados, y pasando en código sin corregir
  - _Requirements: 3.1, 3.2, 3.3, 3.4, 3.5_

- [x] 3. Fix de tarjetas compactas en modal de Práctica

  - [x] 3.1 Simplificar PracticeMatchCard a formato compacto
    - Reemplazar el contenido del componente `PracticeMatchCard` en `src/components/probability/PracticeSection.tsx`
    - Cambiar la clase raíz del `<article>` de `getPracticeMatchCardClass(match.kind)` a `probability-check-card`
    - Agregar atributos `data-kind={match.kind}` y `data-active="true"` al `<article>`
    - Simplificar el contenido interno a un flex row con nombre (`<strong>`) a la izquierda y badge de estado a la derecha, similar al componente `Card` de `DeckQualityHero`
    - Eliminar el `<small>` con `requirementLabel`
    - Eliminar el `<p>` con `getPracticeMatchExplanation(match)`
    - Eliminar el bloque condicional de `assignments` con `PracticeAssignmentSummaryRow`
    - _Bug_Condition: isBugCondition(input) donde PracticeMatchCard renderiza requirementLabel, explicación y filas de asignación_
    - _Expected_Behavior: PracticeMatchCard renderiza solo nombre + badge con clase .probability-check-card, data-kind y data-active_
    - _Preservation: PracticeTechnicalDetails, PracticeNearMissCard, evaluatePracticeHand, DeckQualityHero Card sin cambios_
    - _Requirements: 2.1, 2.3_

  - [x] 3.2 Cambiar grid de PracticeMatchGroup a 2 columnas
    - En el componente `PracticeMatchGroup`, cambiar la clase del contenedor de tarjetas de `grid min-w-0 gap-2` a `grid grid-cols-2 gap-3 max-[640px]:grid-cols-1`
    - Replicar el layout de `CardSection` en `DeckQualityHero.tsx`
    - _Bug_Condition: PracticeMatchGroup usa grid de 1 columna implícita_
    - _Expected_Behavior: Grid de 2 columnas colapsando a 1 en ≤640px_
    - _Requirements: 2.2_

  - [x] 3.3 Eliminar código muerto
    - Eliminar la función `getPracticeMatchCardClass` (ya no se usa, reemplazada por clase directa `probability-check-card`)
    - Eliminar la función `getPracticeMatchExplanation` (ya no se referencia desde ningún componente)
    - Eliminar la función `getVisibleAssignmentCards` (solo la usaba `PracticeAssignmentSummaryRow`)
    - Eliminar el componente `PracticeAssignmentSummaryRow` (solo lo usaba `PracticeMatchCard`, el detalle técnico usa `PracticeAssignmentDetailRow`)
    - **NO eliminar**: `getAssignmentStateLabel`, `PracticeCardBadge`, `PracticeAssignmentDetailRow` — siguen usándose en `PracticeTechnicalDetails`
    - **NO eliminar**: `getPracticeMatchStateLabel`, `getPracticeMatchStateBadgeClass` — siguen usándose en `PracticeMatchCard` (badge) y `PracticeTechnicalDetails`
    - _Requirements: 2.1, 2.3_

  - [x] 3.4 Verificar que el test exploratorio de bug condition ahora pasa
    - **Property 1: Expected Behavior** - PracticeMatchCard renderiza solo nombre + badge compacto
    - **IMPORTANTE**: Re-ejecutar el MISMO test de la tarea 1 — NO escribir un test nuevo
    - El test de la tarea 1 codifica el comportamiento esperado
    - Cuando este test pasa, confirma que el comportamiento esperado se satisface
    - Ejecutar test exploratorio de bug condition del paso 1
    - **RESULTADO ESPERADO**: Test PASA (confirma que el bug está corregido)
    - _Requirements: 2.1, 2.2, 2.3_

  - [x] 3.5 Verificar que los tests de preservación siguen pasando
    - **Property 2: Preservation** - Lógica de evaluación y componentes no modificados intactos
    - **IMPORTANTE**: Re-ejecutar los MISMOS tests de la tarea 2 — NO escribir tests nuevos
    - Ejecutar tests de preservación property-based del paso 2
    - **RESULTADO ESPERADO**: Tests PASAN (confirma que no hay regresiones)
    - Confirmar que todos los tests siguen pasando después del fix (sin regresiones)

- [x] 4. Checkpoint - Asegurar que todos los tests pasan
  - Ejecutar `npm test` (o `vitest --run`) para verificar que toda la suite pasa
  - Verificar que no hay errores de TypeScript con `tsc`
  - Preguntar al usuario si surgen dudas

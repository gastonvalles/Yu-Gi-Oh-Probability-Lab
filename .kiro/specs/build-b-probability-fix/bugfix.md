# Documento de Requisitos del Bugfix

## Introducción

Build B (deck importado) en la pantalla de Comparación muestra Openings/Problems fijos en 0.000% y no ofrece forma de categorizar/editar roles y origen de las cartas de Build B. El problema raíz es que `probability-validation.ts` genera errores bloqueantes cuando las cartas tienen `needsReview: true`, `origin === null` o `roles.length === 0`. Las cartas importadas que el motor de clasificación automática no puede resolver quedan sin clasificar, lo que produce `summary: null` en el cálculo de probabilidades y, por lo tanto, 0% en todos los KPIs de probabilidad. Además, no existe ninguna interfaz para corregir la clasificación de las cartas de Build B desde la pantalla Compare.

## Bug Analysis

### Current Behavior (Defect)

1.1 WHEN Build B se genera desde un deck importado y alguna carta tiene `origin === null` o `roles.length === 0` THEN el sistema produce errores bloqueantes en la validación del CalculatorState, devuelve `summary: null` y muestra Openings/Problems en 0.000%

1.2 WHEN Build B se genera desde un deck importado y alguna carta tiene `needsReview: true` (clasificación automática sin confirmar) THEN el sistema produce un error bloqueante "Hay cartas con clasificación pendiente de revisión" que impide el cálculo de probabilidades

1.3 WHEN el usuario hace click en una carta de Build B en la pantalla de Comparación THEN el sistema solo muestra un modal de detalle de carta sin opciones de edición de categorías (origen/roles), sin forma de corregir la clasificación

1.4 WHEN Build B tiene cartas sin categorizar y el cálculo falla THEN el sistema no muestra Verdict ni Insights, pero tampoco indica claramente al usuario qué debe hacer para resolver el problema

### Expected Behavior (Correct)

2.1 WHEN Build B se genera desde un deck importado y alguna carta tiene clasificación incompleta THEN el sistema SHALL permitir que el usuario edite origen y roles de las cartas de Build B directamente desde la pantalla de Comparación, usando estado local sin modificar Redux ni Build A

2.2 WHEN el usuario edita el origen o los roles de una carta de Build B THEN el sistema SHALL marcar esa carta como `needsReview: false`, reconstruir el PortableConfig de Build B y recalcular `compareBuild` e `interpretComparison` vía useMemo, actualizando KPIs, Verdict e Insights

2.3 WHEN Build B tiene suficientes cartas categorizadas para que la validación no produzca errores bloqueantes THEN el sistema SHALL mostrar probabilidades de Openings/Problems correctas (no 0.000%) y mostrar Verdict e Insights

2.4 WHEN Build B tiene cartas sin categorizar o con `needsReview: true` THEN el sistema SHALL resaltar visualmente esas cartas y mostrar un mensaje claro como "Hacé click en una carta para revisar sus categorías"

2.5 WHEN Build B no está listo para calcular (demasiadas cartas sin categorizar) THEN el sistema SHALL ocultar Verdict/Insights y mostrar un indicador de que Build B necesita revisión

### Unchanged Behavior (Regression Prevention)

3.1 WHEN el usuario edita categorías de cartas de Build B THEN el sistema SHALL CONTINUE TO mantener Build A (deck actual) sin modificaciones en su estado, roles, origen ni probabilidades

3.2 WHEN el usuario edita categorías de cartas de Build B THEN el sistema SHALL CONTINUE TO no escribir en Redux ni en el estado global de la aplicación

3.3 WHEN se usa la función `compareBuild` con dos PortableConfigs válidos THEN el sistema SHALL CONTINUE TO producir el mismo ComparisonResult que antes del fix (la función `compareBuild` no se modifica)

3.4 WHEN se usa la función `interpretComparison` con un ComparisonResult válido THEN el sistema SHALL CONTINUE TO producir el mismo ComparisonInterpretation que antes del fix (la función `interpretComparison` no se modifica)

3.5 WHEN Build A calcula probabilidades con su propio PortableConfig THEN el sistema SHALL CONTINUE TO mostrar los mismos valores de Openings/Problems que mostraba antes del fix

3.6 WHEN el usuario importa un deck nuevo como Build B THEN el sistema SHALL CONTINUE TO usar el DeckImportDrawer existente sin modificaciones en su flujo de importación

---

### Bug Condition (Pseudocódigo Estructurado)

```pascal
FUNCTION isBugCondition(X)
  INPUT: X of type PortableConfig (Build B generado desde import)
  OUTPUT: boolean

  // Retorna true cuando alguna carta del Main Deck de Build B
  // tiene clasificación incompleta que produce errores bloqueantes
  FOR EACH card IN X.deckBuilder.main DO
    IF card.origin = null OR card.roles IS EMPTY OR card.needsReview = true THEN
      RETURN true
    END IF
  END FOR
  RETURN false
END FUNCTION
```

### Property: Fix Checking

```pascal
// Property: Fix Checking — Build B con cartas sin clasificar permite edición
FOR ALL X WHERE isBugCondition(X) DO
  // El usuario puede editar origen y roles de cartas de Build B
  // Después de editar, needsReview se marca false
  // Se recalculan probabilidades
  editedX ← editCardCategory(X, card, newOrigin, newRoles)
  ASSERT editedX.card.needsReview = false
  ASSERT editedX.card.origin ≠ null
  ASSERT editedX.card.roles IS NOT EMPTY
  // Si todas las cartas están categorizadas, las probabilidades no son 0
  IF allCardsClassified(editedX) THEN
    result ← computeProbabilities(editedX)
    ASSERT result.summary ≠ null OR noPatterns(editedX)
  END IF
END FOR
```

### Property: Preservation Checking

```pascal
// Property: Preservation Checking — Build A y funciones core no cambian
FOR ALL X WHERE NOT isBugCondition(X) DO
  ASSERT compareBuild(configA, X) = compareBuild'(configA, X)
  ASSERT interpretComparison(result) = interpretComparison'(result)
END FOR

// Adicionalmente, para todo X (buggy o no):
FOR ALL X DO
  ASSERT buildA_state_before = buildA_state_after
  ASSERT redux_state_before = redux_state_after
END FOR
```

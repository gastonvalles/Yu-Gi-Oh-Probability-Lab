# Tareas de Implementación: Deck Model Transparency

## Tarea 1: Crear helper puro `getDeckModelStatus`

- [x] 1.1 Crear archivo `src/app/deck-model-status.ts` con la interfaz `DeckModelStatus` y el tipo `DeckModelStatusValue`
- [x] 1.2 Implementar la función `getDeckModelStatus` que recibe `CardEntry[]` y `HandPattern[]` y retorna `DeckModelStatus`
- [x] 1.3 Implementar cálculo de `totalCards` como suma de copias
- [x] 1.4 Implementar cálculo de `categorizedCards` (origen asignado + al menos un rol + needsReview=false)
- [x] 1.5 Implementar cálculo de `missingOriginCount`, `missingRolesCount`, `needsReviewCount`
- [x] 1.6 Implementar cálculo de `completionPercentage` como `categorizedCards / totalCards`
- [x] 1.7 Implementar lógica de status: `"complete"` solo si completionPercentage===1 Y missingOriginCount===0 Y missingRolesCount===0 Y needsReviewCount===0

## Tarea 2: Tests para `getDeckModelStatus`

- [x] 2.1 Crear archivo `src/__tests__/deck-model-status.test.ts`
- [x] 2.2 Test: deck vacío retorna status incomplete con totalCards=0 y completionPercentage=0
- [x] 2.3 Test: deck completamente categorizado (origin + roles + needsReview=false) retorna status complete
- [x] 2.4 Test: deck con cartas sin origen retorna missingOriginCount correcto y status incomplete
- [x] 2.5 Test: deck con cartas sin roles retorna missingRolesCount correcto y status incomplete
- [x] 2.6 Test: deck con cartas needsReview=true retorna needsReviewCount correcto y status incomplete
- [x] 2.7 Test: carta con origen y roles pero needsReview=true NO cuenta como categorizada
- [x] 2.8 Property test: completionPercentage siempre está en [0, 1]
- [x] 2.9 Property test: si status es complete entonces completionPercentage===1 y todas las métricas de faltantes son 0
- [x] 2.10 Property test: categorizedCards nunca excede totalCards
- [x] 2.11 Property test: activePatternCount siempre es igual a patterns.length

## Tarea 3: Crear componente `DeckModelStatusBadge`

- [x] 3.1 Crear archivo `src/components/DeckModelStatusBadge.tsx`
- [x] 3.2 Implementar props: `modelStatus: DeckModelStatus` y `variant: 'compact' | 'full'`
- [x] 3.3 Implementar renderizado para status complete: "Modelo completo" + "Toda carta tiene grupo, función y fue revisada." + reglas activas
- [x] 3.4 Implementar renderizado para status incomplete: "Modelo incompleto" + mensajes de detalle
- [x] 3.5 Implementar mensaje "X cartas sin función definida" cuando missingRolesCount > 0
- [x] 3.6 Implementar mensaje "X cartas sin grupo definido" cuando missingOriginCount > 0
- [x] 3.7 Implementar mensaje "X cartas pendientes de revisión" cuando needsReviewCount > 0
- [x] 3.8 Implementar mensaje fijo "Revisá antes de confiar en los porcentajes" para status incomplete
- [x] 3.9 Implementar variante compact (una línea, apto para headers)
- [x] 3.10 Implementar variante full (bloque expandido, apto para paneles)

## Tarea 4: Tests para `DeckModelStatusBadge`

- [x] 4.1 Crear archivo `src/__tests__/deck-model-status-badge.test.tsx`
- [x] 4.2 Test: variante compact con status complete muestra "Modelo completo"
- [x] 4.3 Test: variante full con status complete muestra "Toda carta tiene grupo, función y fue revisada."
- [x] 4.4 Test: variante full con status incomplete muestra "Modelo incompleto"
- [x] 4.5 Test: muestra "X cartas sin función definida" cuando missingRolesCount > 0
- [x] 4.6 Test: muestra "X cartas sin grupo definido" cuando missingOriginCount > 0
- [x] 4.7 Test: muestra "X cartas pendientes de revisión" cuando needsReviewCount > 0
- [x] 4.8 Test: muestra "Revisá antes de confiar en los porcentajes" cuando status es incomplete

## Tarea 5: Cambio de copy en Categorization

- [x] 5.1 Cambiar título del paso a "Definí cómo funciona cada carta en tu deck"
- [x] 5.2 Cambiar descripción del paso a "Estas decisiones forman tu modelo del deck. Los porcentajes se calculan a partir de esto."
- [x] 5.3 Cambiar label de origen a "¿Dónde encaja en tu plan?"
- [x] 5.4 Cambiar label de roles a "¿Qué función cumple cuando la robás?"
- [x] 5.5 Cambiar estado sin roles a "Todavía sin función definida"
- [x] 5.6 Cambiar estado sin origen a "Sin grupo definido"
- [x] 5.7 Integrar `DeckModelStatusBadge` en variante compact dentro del header del paso

## Tarea 6: Cambio de copy en Probability Lab

- [x] 6.1 Agregar texto contextual "Estos resultados se calculan según tus categorías y reglas activas." cerca del header
- [x] 6.2 Agregar warning condicional "Hay cartas sin revisar. Los porcentajes pueden ser incompletos." cuando el modelo está incompleto
- [x] 6.3 Integrar `DeckModelStatusBadge` en variante full dentro del panel principal
- [x] 6.4 Calcular `getDeckModelStatus` con useMemo y pasarlo al badge

## Tarea 7: Cambio de copy en Comparar

- [x] 7.1 Cambiar texto de veredicto `a_better` a "Según tu modelo, Build A es mejor"
- [x] 7.2 Cambiar texto de veredicto `b_better` a "Según tu modelo, Build B es mejor"
- [x] 7.3 Cambiar texto de veredicto `equivalent` a "Según tu modelo, equivalentes"
- [x] 7.4 Cambiar texto de veredicto `tradeoff` a "Según tu modelo, trade-off"
- [x] 7.5 Integrar `DeckModelStatusBadge` para Build A en ComparisonView
- [x] 7.6 Integrar `DeckModelStatusBadge` para Build B cuando está importada
- [x] 7.7 Agregar warning "La comparación todavía no es confiable: Build B tiene cartas sin revisar." cuando Build B tiene needsReview
- [x] 7.8 Agregar tooltip en KPIs de roles: "Cartas que vos marcaste como [rol]."

## Tarea 8: Cambio de copy en Practice

- [x] 8.1 Agregar nota contextual "Usá práctica para validar si tus roles y reglas representan cómo jugás realmente el deck."

## Tarea 9: Tests de integración de copy

- [x] 9.1 Test: Probability Lab muestra el copy contextual "Estos resultados se calculan según tus categorías y reglas activas."
- [x] 9.2 Test: VerdictCard usa el prefijo "Según tu modelo" en todos los veredictos
- [x] 9.3 Test: verificar que los tests existentes siguen pasando sin regresiones

## Tarea 10: Verificación final

- [x] 10.1 Ejecutar `npm run build` y verificar que no hay errores de TypeScript
- [x] 10.2 Ejecutar `npm run test` y verificar que todos los tests pasan

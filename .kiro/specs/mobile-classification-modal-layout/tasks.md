# Plan de Implementación

- [ ] 1. Escribir test de exploración de la condición del bug
  - **Property 1: Bug Condition** - Imagen sin restricción de altura en móvil
  - **CRITICAL**: Este test DEBE FALLAR en el código sin corregir — la falla confirma que el bug existe
  - **NO intentes arreglar el test ni el código cuando falle**
  - **NOTA**: Este test codifica el comportamiento esperado — validará el fix cuando pase después de la implementación
  - **GOAL**: Demostrar que el bug existe generando contraejemplos
  - **Scoped PBT Approach**: Alcance limitado al caso concreto: viewport < 1101px con modal abierto y carta seleccionada
  - Test que el contenedor de `CardArt` en `renderSelectedCardDetail()` aplica `max-h-[200px]` cuando viewport < 1101px (de la Condición del Bug en el diseño)
  - Test que la imagen tiene `w-auto` en móvil para respetar la restricción de altura
  - Ejecutar test en código SIN CORREGIR
  - **RESULTADO ESPERADO**: Test FALLA (esto es correcto — prueba que el bug existe)
  - Documentar contraejemplos encontrados (e.g., "CardArt tiene `w-full h-auto` sin max-height en móvil")
  - Marcar tarea completa cuando el test esté escrito, ejecutado y la falla documentada
  - _Requirements: 1.1, 1.2, 2.1_

- [ ] 2. Escribir tests de preservación (ANTES de implementar el fix)
  - **Property 2: Preservation** - Layout desktop sin cambios
  - **IMPORTANTE**: Seguir metodología observation-first
  - Observar: en viewport >= 1101px, el contenedor de imagen tiene `w-[18rem]` sin restricción de altura
  - Observar: en viewport >= 1101px, el `CardArt` tiene `h-auto w-full` sin max-height
  - Escribir test: para viewport >= 1101px, verificar que el contenedor mantiene `w-[18rem]` y no aplica `max-h-[200px]` (de Requisitos de Preservación en diseño)
  - Escribir test: verificar que los botones de origen y rol se renderizan correctamente en desktop
  - Verificar que tests PASAN en código SIN CORREGIR
  - **RESULTADO ESPERADO**: Tests PASAN (confirma comportamiento baseline a preservar)
  - Marcar tarea completa cuando tests estén escritos, ejecutados y pasando en código sin corregir
  - _Requirements: 3.1, 3.2, 3.3_

- [-] 3. Fix del layout del modal de clasificación en móvil

  - [x] 3.1 Implementar el fix
    - En `src/components/DeckRolesPanel.tsx`, función `renderSelectedCardDetail()`
    - Modificar el div contenedor de la imagen: agregar `mx-auto max-h-[200px] w-auto max-[1100px]:max-h-[200px] min-[1101px]:mx-0 min-[1101px]:max-h-none min-[1101px]:w-[18rem]`
    - Modificar el className de `CardArt`: cambiar a `block h-full max-h-[200px] w-auto min-[1101px]:h-auto min-[1101px]:max-h-none min-[1101px]:w-full bg-input`
    - _Bug_Condition: isBugCondition(input) where input.viewportWidth < 1101 AND modalIsOpen AND selectedCard != null_
    - _Expected_Behavior: cardImage.computedHeight <= 200px AND controls.isVisibleInViewport = true_
    - _Preservation: Layout desktop (viewport >= 1101px) mantiene dos columnas con imagen a 18rem sin restricción de altura_
    - _Requirements: 2.1, 2.2, 2.3, 3.1, 3.2, 3.3, 3.4_

  - [ ] 3.2 Verificar que el test de exploración ahora pasa
    - **Property 1: Expected Behavior** - Imagen restringida en móvil
    - **IMPORTANTE**: Re-ejecutar el MISMO test del paso 1 — NO escribir un test nuevo
    - El test del paso 1 codifica el comportamiento esperado
    - Cuando este test pasa, confirma que el comportamiento esperado se satisface
    - Ejecutar test de exploración del paso 1
    - **RESULTADO ESPERADO**: Test PASA (confirma que el bug está corregido)
    - _Requirements: 2.1, 2.2, 2.3_

  - [ ] 3.3 Verificar que los tests de preservación siguen pasando
    - **Property 2: Preservation** - Layout desktop sin cambios
    - **IMPORTANTE**: Re-ejecutar los MISMOS tests del paso 2 — NO escribir tests nuevos
    - Ejecutar tests de preservación del paso 2
    - **RESULTADO ESPERADO**: Tests PASAN (confirma que no hay regresiones)
    - Confirmar que todos los tests siguen pasando después del fix (sin regresiones)

- [ ] 4. Checkpoint - Asegurar que todos los tests pasan
  - Ejecutar suite completa de tests
  - Verificar que no hay errores de compilación/lint
  - Preguntar al usuario si surgen dudas

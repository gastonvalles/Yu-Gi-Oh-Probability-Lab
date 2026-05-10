# Bugfix: Layout del Modal de Clasificación en Móvil

## Resumen

El modal de clasificación de cartas en dispositivos móviles (viewport < 1101px) renderiza la imagen de la carta sin restricción de altura, ocupando la mayor parte del viewport visible y empujando los controles de clasificación (origen y rol) debajo del fold. El fix consiste en restringir la altura de la imagen en móvil y reorganizar el layout para que tanto la carta como todos los controles quepan dentro del viewport sin requerir scroll.

## Glosario

- **Bug_Condition (C)**: El viewport es menor a 1101px (layout móvil) y el modal de clasificación está abierto con una carta seleccionada
- **Property (P)**: La imagen de la carta y todos los controles de clasificación deben ser visibles simultáneamente sin scroll
- **Preservation**: El layout de desktop (dos columnas, imagen a 18rem) y la funcionalidad de todos los controles deben permanecer sin cambios
- **ClassificationModal**: Componente en `DeckRolesPanel.tsx` (línea ~513) que renderiza el overlay fijo con el contenido de clasificación
- **renderSelectedCardDetail()**: Función (línea ~800) que genera el grid con la imagen, info de carta, controles de origen/rol y botones de navegación
- **cardArtColumn**: El div contenedor de la imagen que actualmente usa `w-full` sin restricción de altura en móvil
- **editorPanel**: El panel con los botones de origen (3 opciones) y secciones de roles (3 secciones con múltiples roles cada una)
- **DESKTOP_CLASSIFICATION_MEDIA_QUERY**: `(min-width: 1101px)` — breakpoint que separa layout desktop del móvil

## Detalles del Bug

### Condición del Bug

El bug se manifiesta cuando el modal de clasificación se abre en un viewport menor a 1101px. El componente `CardArt` recibe `className="block h-auto w-full bg-input"` sin ninguna restricción de altura máxima. En móvil, el contenedor padre tiene `w-full` lo que hace que la imagen ocupe el 100% del ancho del modal. Dado que las cartas de Yu-Gi-Oh tienen una relación de aspecto de ~1.45:1 (alto:ancho), la imagen resulta muy alta, empujando los controles de clasificación fuera del viewport visible.

**Especificación Formal:**
```
FUNCTION isBugCondition(input)
  INPUT: input of type ModalRenderContext
  OUTPUT: boolean
  
  RETURN input.viewportWidth < 1101
         AND input.modalIsOpen = true
         AND input.selectedCard != null
         AND input.cardImageHeight + input.controlsHeight > input.availableViewportHeight
END FUNCTION
```

### Ejemplos

- **iPhone 14 (390px ancho)**: La imagen se renderiza a ~390px de ancho × ~565px de alto, dejando solo ~200px para controles en un viewport de 844px. Los botones de rol quedan completamente ocultos.
- **iPad Mini portrait (768px ancho)**: La imagen se renderiza a ~768px de ancho × ~1114px de alto, excediendo por sí sola el viewport completo.
- **Android típico (360px ancho)**: La imagen ocupa ~520px de alto en un viewport de 800px, dejando espacio insuficiente para los 3 botones de origen + 3 secciones de roles + botones de navegación.
- **Caso límite — viewport 1100px**: Último viewport afectado antes del breakpoint desktop. La imagen sería extremadamente grande (~1595px de alto).

## Comportamiento Esperado

### Requisitos de Preservación

**Comportamientos Sin Cambios:**
- El layout de desktop (viewport >= 1101px) debe continuar mostrando dos columnas con imagen a 18rem de ancho
- Los clicks en botones de origen deben seguir funcionando exactamente igual
- Los clicks en botones de rol deben seguir funcionando exactamente igual
- Los botones de navegación anterior/siguiente deben seguir actualizando la carta correctamente
- La calidad visual de la imagen debe ser suficiente para identificar la carta

**Alcance:**
Todos los inputs que NO involucren un viewport menor a 1101px deben ser completamente no afectados por este fix. Esto incluye:
- Cualquier interacción en desktop (viewport >= 1101px)
- La funcionalidad de los botones (origen, rol, navegación) en cualquier viewport
- El comportamiento del overlay/backdrop del modal
- La lógica de selección y filtrado de cartas

## Causa Raíz Hipotética

Basado en el análisis del código, la causa raíz es clara:

1. **Sin restricción de altura en la imagen móvil**: El `cardArtColumn` usa `w-full min-[1101px]:w-[18rem]` para el contenedor, y el `CardArt` recibe `className="block h-auto w-full bg-input"`. En desktop, el ancho fijo de 18rem limita naturalmente la altura de la imagen. En móvil, `w-full` permite que la imagen crezca al 100% del ancho del modal sin ningún `max-height`.

2. **Layout vertical sin compresión**: El grid principal usa `min-[1101px]:grid-cols-[18rem_minmax(0,1fr)]` — en desktop son dos columnas, pero en móvil colapsa a una sola columna donde todo se apila verticalmente. La imagen, al no tener restricción, domina el espacio vertical.

3. **Controles de rol voluminosos**: Las 3 secciones de roles (`ROLE_EDITOR_SECTIONS`) con sus múltiples botones cada una ocupan espacio vertical significativo. Combinado con la imagen sin restricción, el contenido total excede fácilmente el viewport.

4. **El `overflow-y-auto` enmascara el problema**: El modal tiene `overflow-y-auto` en su contenedor de contenido, lo que permite scroll en lugar de forzar que el contenido quepa. Esto hace que el bug sea funcional (se puede scrollear) pero la UX es mala.

## Propiedades de Correctitud

Property 1: Bug Condition - Imagen restringida en móvil

_Para cualquier_ viewport menor a 1101px donde el modal de clasificación está abierto con una carta seleccionada, la imagen de la carta DEBERÁ tener una altura máxima restringida (no mayor a ~35% del viewport height o ~200px) de modo que los controles de clasificación sean visibles sin necesidad de scroll.

**Valida: Requisitos 2.1, 2.2, 2.3**

Property 2: Preservation - Layout desktop sin cambios

_Para cualquier_ viewport mayor o igual a 1101px, el modal de clasificación DEBERÁ renderizar exactamente el mismo layout de dos columnas con la imagen a 18rem de ancho, sin aplicar restricciones de altura adicionales, preservando el comportamiento visual existente en desktop.

**Valida: Requisitos 3.1, 3.2, 3.3, 3.4**

## Implementación del Fix

### Cambios Requeridos

Asumiendo que nuestro análisis de causa raíz es correcto:

**Archivo**: `src/components/DeckRolesPanel.tsx`

**Función**: `renderSelectedCardDetail()`

**Cambios Específicos**:

1. **Restringir altura de imagen en móvil**: Agregar una clase de `max-h` responsiva al contenedor de la imagen que solo aplique en viewports < 1101px. Usar `max-h-[35dvh]` o un valor fijo como `max-h-[200px]` con `object-contain` para que la imagen se reduzca proporcionalmente sin distorsión.

2. **Centrar imagen restringida**: Agregar `mx-auto` al contenedor de la imagen en móvil para que la carta reducida quede centrada horizontalmente en lugar de alineada a la izquierda.

3. **Ajustar el contenedor de la imagen**: Modificar el div padre de `CardArt` para incluir restricciones responsivas:
   - Móvil: `max-h-[200px]` con `w-auto` para que el ancho se ajuste a la altura restringida
   - Desktop: mantener `w-[18rem]` sin restricción de altura (comportamiento actual)

4. **Compactar secciones de roles en móvil**: Opcionalmente, reducir el padding y tamaño de fuente de los botones de rol en móvil para ganar espacio vertical adicional.

5. **Asegurar que CardArt respete la restricción**: El className del `CardArt` debe incluir `object-contain` para que la imagen se escale correctamente dentro del contenedor restringido, y `max-h-full` para respetar el `max-h` del padre.

**Implementación concreta del cambio principal:**

```tsx
// Antes (cardArtColumn):
<div className="grid content-start gap-2">
  <div className="w-full min-[1101px]:w-[18rem]">
    <CardArt ... className="block h-auto w-full bg-input" />
  </div>
</div>

// Después (cardArtColumn):
<div className="grid content-start gap-2">
  <div className="mx-auto max-h-[200px] w-auto max-[1100px]:max-h-[200px] min-[1101px]:mx-0 min-[1101px]:max-h-none min-[1101px]:w-[18rem]">
    <CardArt ... className="block h-full max-h-[200px] w-auto min-[1101px]:h-auto min-[1101px]:max-h-none min-[1101px]:w-full bg-input" />
  </div>
</div>
```

## Estrategia de Testing

### Enfoque de Validación

La estrategia de testing sigue un enfoque de dos fases: primero, generar contraejemplos que demuestren el bug en el código sin corregir, luego verificar que el fix funciona correctamente y preserva el comportamiento existente.

### Exploración de la Condición del Bug

**Objetivo**: Generar contraejemplos que demuestren el bug ANTES de implementar el fix. Confirmar o refutar el análisis de causa raíz. Si refutamos, necesitaremos re-hipotetizar.

**Plan de Test**: Renderizar el modal de clasificación en viewports móviles y medir la altura resultante de la imagen vs. el espacio disponible para controles. Ejecutar estos tests en el código SIN CORREGIR para observar las fallas.

**Casos de Test**:
1. **Test viewport 390px (iPhone)**: Renderizar modal y verificar que la imagen excede 50% del viewport height (fallará en código sin corregir — demostrando el bug)
2. **Test viewport 768px (tablet)**: Renderizar modal y verificar que la imagen excede el viewport completo (fallará en código sin corregir)
3. **Test viewport 360px (Android)**: Verificar que los controles de rol no son visibles sin scroll (fallará en código sin corregir)
4. **Test viewport 1100px (límite)**: Último viewport afectado, verificar que la imagen es desproporcionadamente grande (fallará en código sin corregir)

**Contraejemplos Esperados**:
- La imagen de la carta ocupa más del 50% del viewport height disponible en móvil
- Los botones de origen y/o rol no son visibles sin hacer scroll
- Causa confirmada: ausencia de `max-height` en el contenedor de imagen para viewports < 1101px

### Fix Checking

**Objetivo**: Verificar que para todos los inputs donde la condición del bug se cumple, la función corregida produce el comportamiento esperado.

**Pseudocódigo:**
```
FOR ALL input WHERE isBugCondition(input) DO
  result := renderSelectedCardDetail_fixed(input)
  ASSERT result.cardImage.computedHeight <= 200px
  ASSERT result.cardImage.computedHeight <= 0.35 * input.viewportHeight
  ASSERT result.controls.isVisibleInViewport = true
  ASSERT result.totalContentHeight <= input.availableModalHeight
END FOR
```

### Preservation Checking

**Objetivo**: Verificar que para todos los inputs donde la condición del bug NO se cumple, la función corregida produce el mismo resultado que la función original.

**Pseudocódigo:**
```
FOR ALL input WHERE NOT isBugCondition(input) DO
  ASSERT renderSelectedCardDetail(input) = renderSelectedCardDetail_fixed(input)
END FOR
```

**Enfoque de Testing**: Se recomienda property-based testing para preservation checking porque:
- Genera muchos casos de test automáticamente a través del dominio de inputs
- Captura edge cases que tests manuales podrían omitir
- Provee garantías fuertes de que el comportamiento no cambia para todos los inputs no-buggy

**Plan de Test**: Observar el comportamiento en código SIN CORREGIR primero para interacciones en desktop, luego escribir property-based tests capturando ese comportamiento.

**Casos de Test**:
1. **Preservación layout desktop**: Verificar que en viewport >= 1101px el grid sigue siendo de dos columnas con imagen a 18rem de ancho
2. **Preservación funcionalidad de botones**: Verificar que clicks en botones de origen/rol siguen disparando los callbacks correctos
3. **Preservación navegación**: Verificar que anterior/siguiente siguen funcionando correctamente
4. **Preservación calidad de imagen**: Verificar que la imagen en desktop no tiene restricciones de altura adicionales

### Unit Tests

- Test que verifica que el className de CardArt incluye `max-h-[200px]` cuando el viewport es < 1101px
- Test que verifica que el className de CardArt NO incluye restricción de altura cuando viewport >= 1101px
- Test que verifica que el contenedor de imagen tiene `w-auto` en móvil y `w-[18rem]` en desktop
- Test que verifica que todos los botones de origen se renderizan correctamente en ambos viewports
- Test que verifica que todos los botones de rol se renderizan correctamente en ambos viewports

### Property-Based Tests

- Generar viewports aleatorios < 1101px y verificar que la imagen siempre tiene restricción de altura aplicada
- Generar viewports aleatorios >= 1101px y verificar que el layout de dos columnas se mantiene sin restricciones de altura
- Generar combinaciones aleatorias de carta seleccionada + viewport y verificar que los controles siempre se renderizan

### Integration Tests

- Test de flujo completo: abrir modal en móvil, verificar que imagen y controles son visibles, clasificar carta, navegar a siguiente
- Test de resize: abrir modal en desktop, reducir viewport a móvil, verificar que el layout se adapta correctamente
- Test de múltiples cartas: navegar entre cartas en móvil verificando que cada una mantiene el layout correcto

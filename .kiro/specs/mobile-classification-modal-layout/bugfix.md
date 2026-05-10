# Documento de Requisitos del Bugfix

## Introducción

El modal de clasificación de cartas en dispositivos móviles (viewport menor a 1101px) muestra la imagen de la carta demasiado grande, ocupando la mayor parte del viewport. Esto obliga al usuario a hacer scroll para alcanzar los controles de categorización (botones de origen y rol), haciendo que clasificar muchas cartas sea tedioso e ineficiente. El modal debería caber dentro del viewport sin requerir scroll, permitiendo ver simultáneamente la carta y todos los controles de clasificación.

## Análisis del Bug

### Comportamiento Actual (Defecto)

1.1 CUANDO el modal de clasificación se abre en un dispositivo móvil (viewport < 1101px) ENTONCES el sistema renderiza la imagen de la carta a ancho completo sin restricción de altura, ocupando la mayor parte del viewport visible

1.2 CUANDO el modal de clasificación se abre en un dispositivo móvil ENTONCES el sistema apila verticalmente la imagen, la info de la carta, los controles de origen, los controles de rol y los botones de navegación en una sola columna, empujando los controles de clasificación debajo del fold

1.3 CUANDO el usuario quiere clasificar una carta en móvil ENTONCES el sistema requiere que el usuario haga scroll hacia abajo para alcanzar y ver los botones de origen y rol

### Comportamiento Esperado (Correcto)

2.1 CUANDO el modal de clasificación se abre en un dispositivo móvil (viewport < 1101px) ENTONCES el sistema DEBERÁ restringir la altura de la imagen de la carta para que no exceda una proporción razonable del viewport, dejando espacio visible para los controles de clasificación

2.2 CUANDO el modal de clasificación se abre en un dispositivo móvil ENTONCES el sistema DEBERÁ mostrar tanto la imagen de la carta como todos los controles de clasificación (origen y rol) dentro del viewport sin requerir scroll

2.3 CUANDO el usuario quiere clasificar una carta en móvil ENTONCES el sistema DEBERÁ permitir acceso inmediato a los botones de origen y rol sin necesidad de hacer scroll

### Comportamiento Sin Cambios (Prevención de Regresión)

3.1 CUANDO el modal de clasificación se abre en desktop (viewport >= 1101px) ENTONCES el sistema DEBERÁ CONTINUAR mostrando el layout de dos columnas con la imagen a 18rem de ancho al lado de los controles

3.2 CUANDO el modal de clasificación se abre en cualquier dispositivo ENTONCES el sistema DEBERÁ CONTINUAR mostrando la imagen de la carta con calidad suficiente para que el usuario pueda identificar la carta

3.3 CUANDO el modal de clasificación se abre en cualquier dispositivo ENTONCES el sistema DEBERÁ CONTINUAR mostrando todos los controles de clasificación funcionales (botones de origen, botones de rol, botones de navegación anterior/siguiente)

3.4 CUANDO el usuario navega entre cartas con los botones anterior/siguiente ENTONCES el sistema DEBERÁ CONTINUAR actualizando la imagen y los controles correctamente

---

### Derivación de la Condición del Bug

**Función de Condición del Bug** - Identifica inputs que disparan el bug:
```pascal
FUNCTION isBugCondition(X)
  INPUT: X of type ViewportContext
  OUTPUT: boolean
  
  // El bug se manifiesta cuando el viewport es menor a 1101px (layout móvil)
  RETURN X.viewportWidth < 1101
END FUNCTION
```

**Especificación de Propiedad** - Define el comportamiento correcto para inputs con bug:
```pascal
// Propiedad: Fix Checking - Layout móvil sin scroll
FOR ALL X WHERE isBugCondition(X) DO
  modalLayout ← renderClassificationModal'(X)
  ASSERT modalLayout.cardImage.height + modalLayout.controls.height <= X.viewportHeight
  ASSERT modalLayout.controls.isVisibleWithoutScroll = true
END FOR
```

**Objetivo de Preservación** - Expresado en pseudocódigo estructurado:
```pascal
// Propiedad: Preservation Checking - Layout desktop sin cambios
FOR ALL X WHERE NOT isBugCondition(X) DO
  ASSERT renderClassificationModal(X) = renderClassificationModal'(X)
END FOR
```

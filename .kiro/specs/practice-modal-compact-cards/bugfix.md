# Documento de Requisitos del Bugfix

## Introducción

En el modal de Práctica, las tarjetas de "Salidas cumplidas" y "Problemas detectados" (renderizadas por `PracticeMatchCard`) son enormes. Cada tarjeta muestra nombre, badge de estado, etiqueta de requisito, párrafo de explicación, y filas completas de asignación con badges de cartas individuales. Esto genera un scroll excesivo y rompe la lectura rápida que el usuario necesita al evaluar una mano.

La vista que se muestra *antes* de abrir el modal (componente `Card` en `DeckQualityHero.tsx`) usa la clase CSS `.probability-check-card` y muestra solo nombre + badge de estado en un layout de 2 columnas con borde lateral coloreado. Las tarjetas del modal de Práctica deben ser igual de compactas: solo nombre y badge, sin etiqueta de requisito, sin explicación, sin filas de asignación. Todo el detalle ya está disponible en el `<details>` colapsable `PracticeTechnicalDetails`.

## Análisis del Bug

### Comportamiento Actual (Defecto)

1.1 CUANDO se abre el modal de Práctica y se roba una mano que cumple salidas o detecta problemas ENTONCES el sistema muestra cada `PracticeMatchCard` con nombre, badge de estado, etiqueta de requisito (`requirementLabel`), párrafo de explicación (`getPracticeMatchExplanation`) y filas completas de asignación (`PracticeAssignmentSummaryRow` con `PracticeCardBadge`), ocupando un espacio vertical enorme por tarjeta

1.2 CUANDO hay múltiples salidas cumplidas o problemas detectados ENTONCES el sistema las renderiza en una sola columna (`grid min-w-0 gap-2`) con tarjetas grandes, obligando al usuario a hacer scroll extenso para ver todas las coincidencias

1.3 CUANDO una `PracticeMatchCard` tiene varias asignaciones con múltiples cartas ENTONCES el sistema muestra todas las filas de `PracticeAssignmentSummaryRow` con sus `PracticeCardBadge` inline dentro de la tarjeta, inflando aún más su tamaño

### Comportamiento Esperado (Correcto)

2.1 CUANDO se abre el modal de Práctica y se roba una mano que cumple salidas o detecta problemas ENTONCES el sistema SHALL mostrar cada tarjeta de coincidencia en formato mínimo: solo el nombre del patrón y un badge de estado ("Cumplida"/"Detectado"), usando la clase `.probability-check-card` con su borde lateral coloreado según `data-kind` (opening = accent, problem = danger), sin etiqueta de requisito, sin párrafo de explicación, sin filas de asignación

2.2 CUANDO hay múltiples salidas cumplidas o problemas detectados ENTONCES el sistema SHALL renderizar las tarjetas compactas en un grid de 2 columnas (`grid-cols-2`, colapsando a 1 columna en pantallas ≤640px), igual que el `CardSection` de `DeckQualityHero`

2.3 CUANDO una tarjeta de coincidencia tiene asignaciones detalladas ENTONCES el sistema SHALL NO mostrar ninguna fila de asignación resumida dentro de la tarjeta compacta; toda esa información queda exclusivamente en la sección colapsable `PracticeTechnicalDetails` que ya existe

### Comportamiento Sin Cambios (Prevención de Regresión)

3.1 CUANDO se roba una mano en el modal de Práctica ENTONCES el sistema SHALL CONTINUAR evaluando correctamente las salidas, problemas y near-misses con la misma lógica de `evaluatePracticeHand`

3.2 CUANDO se abre la sección colapsable "Ver asignación completa" (`PracticeTechnicalDetails`) ENTONCES el sistema SHALL CONTINUAR mostrando el detalle carta por carta de cada check cumplido con el mismo nivel de información actual

3.3 CUANDO se visualiza el veredicto de la mano (jugable, mala, mixta, neutra) ENTONCES el sistema SHALL CONTINUAR mostrando el bloque de resultado con stats, resumen de roles y título/descripción del veredicto sin cambios

3.4 CUANDO se visualizan las tarjetas de "Lo que le faltó a la mano para abrir" (near-misses) ENTONCES el sistema SHALL CONTINUAR mostrando las `PracticeNearMissCard` con su formato actual sin modificaciones

3.5 CUANDO se visualizan las tarjetas compactas en `DeckQualityHero` (fuera del modal) ENTONCES el sistema SHALL CONTINUAR renderizando con el mismo estilo `.probability-check-card` sin alteraciones

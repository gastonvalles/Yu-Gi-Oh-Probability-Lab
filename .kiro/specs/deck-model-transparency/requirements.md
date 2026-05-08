# Documento de Requerimientos: Deck Model Transparency

## Introducción

Esta feature reposiciona la app como una herramienta que calcula probabilidades y comparaciones según el modelo definido por el jugador — cómo clasificó sus cartas, qué roles asignó y qué reglas/chequeos activó. El cambio es principalmente UX/copy más indicadores de confianza del modelo. No modifica la arquitectura, los tipos de datos, Redux, el motor de probabilidad ni la lógica de reglas.

## Glosario

- **Modelo_del_Deck**: Representación subjetiva del deck construida por el jugador a través de clasificaciones (origen, roles) y reglas activas. No es una verdad universal sino la interpretación del piloto.
- **Sistema_de_Transparencia**: Conjunto de componentes, helpers y copy que comunican al usuario que los resultados dependen de su modelo.
- **DeckModelStatus**: Objeto retornado por la función pura `getDeckModelStatus` que describe el estado de completitud del modelo.
- **Badge_de_Estado**: Componente visual reutilizable (`DeckModelStatusBadge`) que muestra el estado del modelo en variantes compact y full.
- **Categorization**: Paso 2 del workflow donde el usuario asigna origen y roles a cada carta.
- **Probability_Lab**: Paso 3 del workflow donde se calculan probabilidades y se muestran KPIs.
- **Comparar**: Pantalla donde se comparan dos builds del deck.
- **Practice**: Sección de simulación de manos dentro del Probability Lab.
- **CardEntry**: Tipo que representa una carta derivada del Main Deck con sus copias, origen, roles y estado de revisión.
- **HandPattern**: Tipo que representa una regla/chequeo activo en el análisis de probabilidad.

## Requerimientos

### Requerimiento 1: Helper puro para calcular estado del modelo

**User Story:** Como desarrollador, quiero una función pura que calcule el estado del modelo del deck, para que cualquier componente pueda consumir esa información sin duplicar lógica.

#### Criterios de Aceptación

1. THE Sistema_de_Transparencia SHALL exponer una función pura `getDeckModelStatus` que reciba el estado del deck builder y los patterns activos y retorne un objeto DeckModelStatus.
2. WHEN `getDeckModelStatus` es invocada, THE Sistema_de_Transparencia SHALL calcular `totalCards` como la suma de copias reales del Main Deck (no nombres únicos).
3. WHEN `getDeckModelStatus` es invocada, THE Sistema_de_Transparencia SHALL calcular `categorizedCards` como la cantidad de copias que tienen origen asignado, al menos un rol asignado Y `needsReview` es false.
4. WHEN `getDeckModelStatus` es invocada, THE Sistema_de_Transparencia SHALL calcular `missingOriginCount` como la cantidad de copias cuyo origen es null.
5. WHEN `getDeckModelStatus` es invocada, THE Sistema_de_Transparencia SHALL calcular `missingRolesCount` como la cantidad de copias cuyo array de roles está vacío.
6. WHEN `getDeckModelStatus` es invocada, THE Sistema_de_Transparencia SHALL calcular `needsReviewCount` como la cantidad de copias cuyo campo `needsReview` es true.
7. WHEN `getDeckModelStatus` es invocada, THE Sistema_de_Transparencia SHALL calcular `activePatternCount` como la cantidad de patterns activos recibidos.
8. WHEN `getDeckModelStatus` es invocada, THE Sistema_de_Transparencia SHALL calcular `completionPercentage` como `categorizedCards / totalCards` (0 si totalCards es 0).
9. WHEN `completionPercentage` es 1 Y `missingOriginCount` es 0 Y `missingRolesCount` es 0 Y `needsReviewCount` es 0, THE Sistema_de_Transparencia SHALL retornar status `"complete"`.
10. WHEN `completionPercentage` es menor a 1 O `missingOriginCount` es mayor a 0 O `missingRolesCount` es mayor a 0 O `needsReviewCount` es mayor a 0, THE Sistema_de_Transparencia SHALL retornar status `"incomplete"`.

### Requerimiento 2: Componente reutilizable de estado del modelo

**User Story:** Como usuario, quiero ver un indicador visual del estado de mi modelo del deck, para saber si puedo confiar en los porcentajes que muestra la app.

#### Criterios de Aceptación

1. THE Badge_de_Estado SHALL recibir como prop el resultado de `getDeckModelStatus` y renderizar información del estado del modelo.
2. WHEN el status es `"complete"`, THE Badge_de_Estado SHALL mostrar el texto "Modelo completo" con la leyenda "Toda carta tiene grupo, función y fue revisada." junto con la cantidad de reglas activas.
3. WHEN el status es `"incomplete"`, THE Badge_de_Estado SHALL mostrar el texto "Modelo incompleto" junto con un detalle de las cartas pendientes.
4. WHEN el status es `"incomplete"` y hay cartas sin rol, THE Badge_de_Estado SHALL incluir el mensaje "X cartas sin función definida".
5. WHEN el status es `"incomplete"` y hay cartas sin origen, THE Badge_de_Estado SHALL incluir el mensaje "X cartas sin grupo definido".
6. WHEN el status es `"incomplete"` y `needsReviewCount` es mayor a 0, THE Badge_de_Estado SHALL incluir el mensaje "X cartas pendientes de revisión".
7. WHEN el status es `"incomplete"`, THE Badge_de_Estado SHALL mostrar el texto "Revisá antes de confiar en los porcentajes".
8. WHERE la variante es `"compact"`, THE Badge_de_Estado SHALL renderizar en formato reducido apto para headers.
9. WHERE la variante es `"full"`, THE Badge_de_Estado SHALL renderizar en formato expandido apto para paneles principales.

### Requerimiento 3: Cambio de copy en Categorization

**User Story:** Como usuario, quiero que el paso de clasificación comunique que estoy definiendo mi modelo del deck, para entender que las decisiones son mías y no verdades objetivas.

#### Criterios de Aceptación

1. THE Categorization SHALL mostrar como título del paso "Definí cómo funciona cada carta en tu deck" en lugar del título anterior.
2. THE Categorization SHALL mostrar como descripción del paso "Estas decisiones forman tu modelo del deck. Los porcentajes se calculan a partir de esto."
3. WHEN el modal de clasificación muestra la sección de origen, THE Categorization SHALL usar el label "¿Dónde encaja en tu plan?" en lugar de "¿Qué es?".
4. WHEN el modal de clasificación muestra la sección de roles, THE Categorization SHALL usar el label "¿Qué función cumple cuando la robás?" en lugar de "¿Qué roles cumple?".
5. WHEN una carta no tiene roles asignados, THE Categorization SHALL mostrar "Todavía sin función definida" como estado visible en lugar de "Sin rol".
6. WHEN una carta no tiene origen asignado, THE Categorization SHALL mostrar "Sin grupo definido" como estado visible en lugar de "Sin origen".
7. THE Categorization SHALL mostrar el Badge_de_Estado en variante compact dentro del header del paso.

### Requerimiento 4: Cambio de copy en Probability Lab

**User Story:** Como usuario, quiero que el Probability Lab me recuerde que los resultados dependen de mi clasificación y reglas, para no interpretar los números como verdades absolutas.

#### Criterios de Aceptación

1. THE Probability_Lab SHALL mostrar un texto contextual visible cerca del header: "Estos resultados se calculan según tus categorías y reglas activas."
2. WHILE el modelo está incompleto, THE Probability_Lab SHALL mostrar un warning: "Hay cartas sin revisar. Los porcentajes pueden ser incompletos."
3. THE Probability_Lab SHALL mantener los KPIs y cálculos actuales sin modificación.
4. THE Probability_Lab SHALL mostrar el Badge_de_Estado en variante full dentro del panel principal.

### Requerimiento 5: Cambio de copy en Comparar

**User Story:** Como usuario, quiero que la comparación entre builds no suene absoluta, para entender que el veredicto depende de mi modelo.

#### Criterios de Aceptación

1. WHEN el veredicto es `a_better`, THE Comparar SHALL mostrar "Según tu modelo, Build A es mejor" en lugar de "Build A es mejor".
2. WHEN el veredicto es `b_better`, THE Comparar SHALL mostrar "Según tu modelo, Build B es mejor" en lugar de "Build B es mejor".
3. WHEN el veredicto es `equivalent`, THE Comparar SHALL mostrar "Según tu modelo, equivalentes" en lugar de "Equivalentes".
4. WHEN el veredicto es `tradeoff`, THE Comparar SHALL mostrar "Según tu modelo, trade-off" en lugar de "Trade-off".
5. WHILE Build B tiene cartas pendientes de revisión, THE Comparar SHALL mostrar: "La comparación todavía no es confiable: Build B tiene cartas sin revisar."
6. THE Comparar SHALL mostrar en los KPIs de roles un tooltip/helper con el texto "Cartas que vos marcaste como [rol]." donde [rol] es el nombre del rol correspondiente.
7. THE Comparar SHALL mostrar el estado del modelo de Build A.
8. WHEN Build B está importada, THE Comparar SHALL mostrar el estado del modelo de Build B.
9. WHILE Build B está incompleta, THE Comparar SHALL reforzar que la comparación puede no ser confiable.

### Requerimiento 6: Cambio de copy en Practice

**User Story:** Como usuario, quiero que la sección de práctica me recuerde que sirve para validar mi propio modelo, para usarla como herramienta de calibración.

#### Criterios de Aceptación

1. THE Practice SHALL mostrar una nota contextual: "Usá práctica para validar si tus roles y reglas representan cómo jugás realmente el deck."
2. THE Practice SHALL mantener la lógica de práctica actual sin modificación.

### Requerimiento 7: Integraciones del Badge de Estado

**User Story:** Como usuario, quiero ver el estado de mi modelo en los puntos clave de la app, para tener siempre presente la confiabilidad de los datos.

#### Criterios de Aceptación

1. THE Sistema_de_Transparencia SHALL mostrar el Badge_de_Estado en la pantalla de Categorization.
2. THE Sistema_de_Transparencia SHALL mostrar el Badge_de_Estado en el Probability Lab.
3. THE Sistema_de_Transparencia SHALL mostrar el Badge_de_Estado en la pantalla de Comparar para Build A.
4. WHEN Build B está importada, THE Sistema_de_Transparencia SHALL mostrar el Badge_de_Estado en la pantalla de Comparar para Build B.
5. WHILE Build B está incompleta, THE Sistema_de_Transparencia SHALL mostrar un mensaje adicional indicando que la comparación puede no ser confiable.

### Requerimiento 8: Restricciones de implementación

**User Story:** Como desarrollador, quiero que esta feature no modifique la arquitectura existente, para minimizar riesgos de regresión.

#### Criterios de Aceptación

1. THE Sistema_de_Transparencia SHALL preservar los tipos de datos existentes sin modificación.
2. THE Sistema_de_Transparencia SHALL preservar el store de Redux sin modificación estructural.
3. THE Sistema_de_Transparencia SHALL preservar la función `compareBuild` sin modificación.
4. THE Sistema_de_Transparencia SHALL preservar la función `interpretComparison` sin modificación.
5. THE Sistema_de_Transparencia SHALL preservar el motor de probabilidad (`calculateProbabilities`) sin modificación.
6. THE Sistema_de_Transparencia SHALL preservar la lógica de reglas (patterns) sin modificación.
7. THE Sistema_de_Transparencia SHALL preservar la lógica de importación de decks sin modificación.
8. THE Sistema_de_Transparencia SHALL preservar los nombres técnicos internos de roles y orígenes sin modificación (solo cambia copy visible al usuario).

### Requerimiento 9: Tests obligatorios

**User Story:** Como desarrollador, quiero tests que validen el comportamiento del helper y los componentes nuevos, para asegurar que la feature funciona correctamente.

#### Criterios de Aceptación

1. WHEN se ejecutan los tests, THE Sistema_de_Transparencia SHALL verificar que `getDeckModelStatus` calcula correctamente el porcentaje categorizado.
2. WHEN se ejecutan los tests, THE Sistema_de_Transparencia SHALL verificar que `getDeckModelStatus` cuenta correctamente las cartas sin origen.
3. WHEN se ejecutan los tests, THE Sistema_de_Transparencia SHALL verificar que `getDeckModelStatus` cuenta correctamente las cartas sin rol.
4. WHEN se ejecutan los tests, THE Sistema_de_Transparencia SHALL verificar que `getDeckModelStatus` cuenta correctamente las cartas con needsReview.
5. WHEN se ejecutan los tests, THE Sistema_de_Transparencia SHALL verificar que `getDeckModelStatus` cuenta correctamente las reglas activas.
6. WHEN se ejecutan los tests, THE Sistema_de_Transparencia SHALL verificar que el Badge_de_Estado muestra "Modelo completo" cuando el status es complete.
7. WHEN se ejecutan los tests, THE Sistema_de_Transparencia SHALL verificar que el Badge_de_Estado muestra "Modelo incompleto" cuando el status es incomplete.
8. WHEN se ejecutan los tests, THE Sistema_de_Transparencia SHALL verificar que el Probability Lab muestra el copy contextual sobre categorías y reglas.
9. WHEN se ejecutan los tests, THE Sistema_de_Transparencia SHALL verificar que Comparar usa el wording "Según tu modelo" en los veredictos.
10. WHEN se ejecutan los tests, THE Sistema_de_Transparencia SHALL verificar que no se rompen tests existentes.

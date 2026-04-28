# Documento de Requerimientos — Build Comparison

## Introducción

La feature de Build Comparison permite al usuario comparar dos builds y obtener una respuesta inmediata a la pregunta: "¿Este build es mejor que el anterior?" y entender por qué. En lugar de mostrar solo diferencias técnicas, el sistema interpreta los cambios y presenta una conclusión orientada a la decisión del usuario, seguida de una explicación y luego los datos detallados. Actualmente la app soporta snapshots con una comparación básica (delta de probabilidad y cambios en Main Deck). Esta feature extiende esa capacidad con una capa de insights automáticos que traduce los datos en explicaciones accionables.

El MVP se enfoca en tres ejes: probabilidad de patrones, distribución de roles y cambios de cartas. Los patrones avanzados (comparación detallada de condiciones, análisis de orígenes, diff de Extra/Side Deck) quedan diferidos a una fase posterior.

## Glosario

- **Build**: Estado completo de un workspace, incluyendo deck (main, extra, side), patrones de mano y configuración (handSize, deckFormat). Representado internamente como `PortableConfig`.
- **Snapshot**: Copia guardada de una Build en un momento dado, almacenada en localStorage. Representado como `WorkspaceSnapshot`.
- **Zona**: Cada una de las tres secciones del deck: Main Deck, Extra Deck y Side Deck.
- **Comparison_Engine**: Módulo lógico (función pura) que recibe dos Builds y produce un resultado de comparación estructurado con diffs de cartas, probabilidades y distribuciones de roles.
- **Insight_Interpreter**: Capa lógica que recibe el resultado del Comparison_Engine y genera insights textuales orientados a la decisión del usuario. No modifica el Comparison_Engine; opera sobre su salida.
- **Comparison_View**: Componente de UI que presenta el resultado de comparación siguiendo el orden: conclusión, explicación, datos detallados.
- **Card_Diff**: Diferencia calculada entre dos Builds para una carta específica en el Main Deck, expresada como cantidad agregada o removida.
- **Role_Distribution**: Distribución de roles (starter, extender, handtrap, brick, etc.) calculada para una Build.
- **Probability_Delta**: Diferencia numérica entre las probabilidades calculadas de dos Builds.
- **Insight**: Texto interpretativo generado automáticamente que explica el impacto de un cambio en términos comprensibles para el jugador (ej: "+2 starters mejora consistencia", "+3 bricks aumenta manos muertas"). Cada Insight tiene un nivel de prioridad basado en su impacto en la jugabilidad.
- **Verdict**: Conclusión generada por el Insight_Interpreter que indica cuál Build es mejor y por qué. El Verdict se determina mediante reglas de prioridad definidas: consistencia de openings como factor principal, bricks como factor negativo, y un umbral mínimo de diferencia significativa del 1%.
- **Deck_Source**: Origen de un deck para comparación: puede ser el workspace actual o un snapshot guardado.
- **Insight_Priority**: Nivel de importancia de un Insight, determinado por su impacto en la jugabilidad. Los niveles son: critical (afecta consistencia de openings o bricks), high (afecta extensión o interacción defensiva), normal (otros cambios de roles o probabilidades).
- **Significance_Threshold**: Umbral mínimo de diferencia (1 punto porcentual en valor absoluto) por debajo del cual un cambio se considera marginal y no genera Insight ni afecta el Verdict.

## Requerimientos

### Requerimiento 1: Selección de Builds a Comparar

**User Story:** Como jugador, quiero elegir dos builds para comparar, para poder evaluar rápidamente si mis cambios mejoraron el deck.

#### Criterios de Aceptación

1. WHEN el usuario abre la vista de comparación, THE Comparison_View SHALL mostrar dos selectores de Deck_Source, uno para cada lado de la comparación (A y B).
2. THE Comparison_View SHALL permitir seleccionar como Deck_Source el workspace actual o cualquier Snapshot guardado.
3. WHEN el usuario selecciona un Snapshot como Deck_Source, THE Comparison_View SHALL cargar la Build almacenada en ese Snapshot sin modificar el workspace actual.
4. WHEN el usuario selecciona "workspace actual" como Deck_Source, THE Comparison_View SHALL utilizar el estado actual del workspace en tiempo real.
5. IF el usuario selecciona el mismo Deck_Source para ambos lados, THEN THE Comparison_View SHALL mostrar un aviso indicando que ambas builds son idénticas.

### Requerimiento 2: Estructura de UI Orientada a Decisión

**User Story:** Como jugador, quiero que la comparación me muestre primero la conclusión y luego los detalles, para poder decidir en segundos si mi build mejoró.

#### Criterios de Aceptación

1. THE Comparison_View SHALL organizar la información en tres niveles jerárquicos: Verdict (conclusión), Insights (explicación) y datos detallados.
2. THE Comparison_View SHALL mostrar el Verdict como primer elemento visible, indicando cuál Build es mejor y el delta de probabilidad total.
3. WHEN el usuario ve el Verdict, THE Comparison_View SHALL mostrar a continuación la lista de Insights (máximo 3) que explican los factores principales del Verdict.
4. THE Comparison_View SHALL mostrar los datos detallados (Card_Diff, probabilidades por patrón, Role_Distribution) como sección expandible debajo de los Insights.
5. WHEN el Probability_Delta total es cero y la Role_Distribution es idéntica, THE Comparison_View SHALL mostrar un Verdict indicando que ambas Builds son equivalentes en consistencia.

### Requerimiento 3: Insights Automáticos con Interpretación Concreta

**User Story:** Como jugador, quiero que el sistema interprete los cambios y me explique su impacto en lenguaje simple, para no tener que analizar manualmente cada dato.

#### Criterios de Aceptación

1. WHEN el Comparison_Engine produce un resultado, THE Insight_Interpreter SHALL generar una lista de Insights textuales basados en los cambios detectados, limitada a un máximo de 3 Insights principales.
2. THE Insight_Interpreter SHALL ordenar los Insights por Insight_Priority de mayor a menor impacto en la jugabilidad, siguiendo el orden: critical, high, normal.
3. WHEN la cantidad de cartas con rol "starter" aumenta entre Builds y el delta supera el Significance_Threshold, THE Insight_Interpreter SHALL generar un Insight con prioridad critical indicando: "Más starters: mejora la consistencia de apertura".
4. WHEN la cantidad de cartas con rol "starter" disminuye entre Builds y el delta supera el Significance_Threshold, THE Insight_Interpreter SHALL generar un Insight con prioridad critical indicando: "Menos starters: reduce la consistencia de apertura".
5. WHEN la cantidad de cartas con rol "brick" o "garnet" aumenta entre Builds, THE Insight_Interpreter SHALL generar un Insight con prioridad critical indicando: "Más bricks: aumenta el riesgo de manos muertas".
6. WHEN la cantidad de cartas con rol "brick" o "garnet" disminuye entre Builds, THE Insight_Interpreter SHALL generar un Insight con prioridad critical indicando: "Menos bricks: reduce el riesgo de manos muertas".
7. WHEN la cantidad de cartas con rol "extender" cambia entre Builds y el delta supera el Significance_Threshold, THE Insight_Interpreter SHALL generar un Insight con prioridad high indicando el impacto en capacidad de extensión de jugadas (ej: "+2 extenders: más capacidad de seguir combos tras interrupción").
8. WHEN la cantidad de cartas con rol "handtrap" cambia entre Builds y el delta supera el Significance_Threshold, THE Insight_Interpreter SHALL generar un Insight con prioridad high indicando el impacto en interacción defensiva (ej: "-2 handtraps: menos capacidad de interrumpir al oponente going second").
9. WHEN la cantidad de cartas con origin "engine" cambia entre Builds y el delta supera el Significance_Threshold, THE Insight_Interpreter SHALL generar un Insight con prioridad normal indicando el impacto en la densidad del motor del deck (ej: "+3 engine: motor más denso, mayor dependencia del arquetipo").
10. WHEN el Probability_Delta total de patrones tipo "opening" es distinto de cero y supera el Significance_Threshold, THE Insight_Interpreter SHALL generar un Insight con prioridad critical indicando si la consistencia general mejoró o empeoró y en qué porcentaje.
11. WHEN el Probability_Delta total de patrones tipo "problem" es distinto de cero y supera el Significance_Threshold, THE Insight_Interpreter SHALL generar un Insight con prioridad high indicando si la probabilidad de manos problemáticas aumentó o disminuyó.
12. WHEN el número de Insights candidatos excede 3, THE Insight_Interpreter SHALL seleccionar los 3 de mayor Insight_Priority, descartando los de menor impacto.
13. WHEN un cambio de rol o probabilidad tiene un delta menor al Significance_Threshold (1 punto porcentual en valor absoluto), THE Insight_Interpreter SHALL omitir ese cambio de la lista de Insights.
14. THE Insight_Interpreter SHALL ser una función pura que reciba el resultado del Comparison_Engine y retorne una lista ordenada de Insights (máximo 3), sin efectos secundarios.

### Requerimiento 4: Generación de Verdict con Reglas de Decisión

**User Story:** Como jugador, quiero ver una conclusión clara y confiable sobre cuál build es mejor, basada en reglas consistentes que prioricen lo que importa en el juego.

#### Criterios de Aceptación

1. WHEN el Comparison_Engine produce un resultado, THE Insight_Interpreter SHALL generar un Verdict aplicando las reglas de decisión en el siguiente orden de prioridad: (a) consistencia de openings, (b) impacto de bricks, (c) probabilidad total.
2. WHEN Build A tiene mayor probabilidad de patrones tipo "opening" que Build B y el delta supera el Significance_Threshold, THE Insight_Interpreter SHALL generar un Verdict favorable a Build A, indicando la mejora en consistencia como factor principal.
3. WHEN ambas Builds tienen probabilidad de "opening" equivalente (delta menor al Significance_Threshold), THE Insight_Interpreter SHALL evaluar el conteo de cartas con rol "brick" o "garnet": la Build con menos bricks recibe Verdict favorable.
4. WHEN ambas Builds tienen probabilidad de "opening" equivalente y conteo de bricks equivalente, THE Insight_Interpreter SHALL evaluar el Probability_Delta de patrones tipo "problem": la Build con menor probabilidad de "problem" recibe Verdict favorable.
5. WHEN todos los deltas evaluados (openings, bricks, problems) están por debajo del Significance_Threshold, THE Insight_Interpreter SHALL generar un Verdict indicando que las diferencias son marginales y ambas Builds son equivalentes en la práctica.
6. WHEN los factores de decisión son contradictorios (ej: Build A mejora openings pero aumenta bricks), THE Insight_Interpreter SHALL generar un Verdict que indique el trade-off, presentando el factor favorable y el desfavorable, priorizando el factor de mayor nivel en la jerarquía de decisión.
7. THE Insight_Interpreter SHALL incluir en el Verdict el delta de probabilidad de openings formateado como porcentaje y el delta de bricks como cantidad absoluta.
8. WHEN el delta de bricks entre Builds es distinto de cero, THE Insight_Interpreter SHALL reflejar en el Verdict que un aumento de bricks es un factor negativo para la Build que los incrementó.

### Requerimiento 5: Comparación de Composición de Cartas (Main Deck)

**User Story:** Como jugador, quiero ver las diferencias de cartas en el Main Deck entre dos builds, para entender qué cambié.

#### Criterios de Aceptación

1. WHEN dos Builds son seleccionadas, THE Comparison_Engine SHALL calcular Card_Diff para el Main Deck.
2. THE Comparison_Engine SHALL identificar cartas agregadas, removidas y con cantidad modificada en el Main Deck.
3. THE Comparison_View SHALL mostrar las cartas con diferencias, resaltando visualmente las agregadas, removidas y modificadas con colores distintos.
4. THE Comparison_View SHALL mostrar el conteo total de cartas del Main Deck para cada Build.
5. WHEN una carta existe en ambas Builds pero con distinta cantidad, THE Comparison_View SHALL mostrar el delta de copias (ej: "+1", "-2").

### Requerimiento 6: Comparación de Distribución de Roles

**User Story:** Como jugador, quiero ver cómo cambiaron los roles entre dos builds, para evaluar el impacto estructural de mis cambios.

#### Criterios de Aceptación

1. WHEN dos Builds son seleccionadas, THE Comparison_Engine SHALL calcular la Role_Distribution para cada Build basándose en los roles asignados a las cartas del Main Deck.
2. THE Comparison_View SHALL mostrar las distribuciones de roles side-by-side con el delta numérico para cada categoría de rol.
3. WHEN una categoría de rol tiene delta distinto de cero, THE Comparison_View SHALL resaltar visualmente esa categoría.
4. THE Comparison_Engine SHALL considerar que una carta puede tener múltiples roles y contabilizar cada rol de forma independiente.

### Requerimiento 7: Comparación de Probabilidades por Patrón

**User Story:** Como jugador, quiero comparar las probabilidades de mis patrones de mano entre dos builds, para saber si mis cambios mejoraron o empeoraron la consistencia.

#### Criterios de Aceptación

1. WHEN dos Builds son seleccionadas, THE Comparison_Engine SHALL calcular las probabilidades de cada patrón de mano para ambas Builds usando el motor de probabilidad existente.
2. THE Comparison_Engine SHALL identificar patrones presentes en ambas Builds, patrones exclusivos de Build A y patrones exclusivos de Build B.
3. THE Comparison_View SHALL mostrar cada patrón con su probabilidad en ambas Builds y el Probability_Delta correspondiente.
4. WHEN un patrón existe solo en una Build, THE Comparison_View SHALL indicar claramente que es exclusivo de esa Build.
5. THE Comparison_View SHALL mostrar un resumen con la probabilidad total de "openings" y "problems" para cada Build y el delta entre ambas.

### Requerimiento 8: Comparison Engine como Función Pura

**User Story:** Como desarrollador, quiero que el cálculo de diferencias entre builds sea una función pura, para poder testearlo de forma aislada y componer capas de interpretación encima.

#### Criterios de Aceptación

1. THE Comparison_Engine SHALL exponer una función pura que reciba dos Builds (PortableConfig) y retorne un objeto de comparación estructurado que incluya Card_Diff, Role_Distribution y probabilidades por patrón.
2. THE Comparison_Engine SHALL producir Card_Diff idéntico independientemente del orden de las cartas dentro del Main Deck.
3. WHEN ambas Builds son idénticas, THE Comparison_Engine SHALL retornar un resultado sin diferencias para el Main Deck, roles y probabilidades.
4. FOR ALL pares de Builds válidas, comparar Build A contra Build B y luego Build B contra Build A SHALL producir Card_Diffs simétricos (las agregadas de un lado son las removidas del otro y viceversa).
5. THE Insight_Interpreter SHALL ser una función pura separada que reciba la salida del Comparison_Engine y retorne Verdict e Insights, sin modificar ni depender del estado de la aplicación.

### Requerimiento 9: Navegación y Acceso a la Comparación

**User Story:** Como jugador, quiero acceder fácilmente a la comparación desde el panel de workspace, para no tener que buscar la funcionalidad.

#### Criterios de Aceptación

1. THE Comparison_View SHALL ser accesible desde el panel de workspace existente mediante un botón o enlace visible.
2. WHEN el usuario no tiene snapshots guardados, THE Comparison_View SHALL mostrar un mensaje indicando que se necesita al menos un snapshot para comparar contra el workspace actual.
3. WHEN el usuario cierra la vista de comparación, THE Comparison_View SHALL volver al panel de workspace sin modificar el estado del workspace actual.

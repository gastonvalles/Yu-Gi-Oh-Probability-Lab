/** Motor del Lab: avisos de validación, reglas del sistema, frases de las reglas, sugerencias y errores del cálculo. */
export const rules = {
  // Avisos antes de calcular (corren también en el worker: por eso `t()` toma el idioma del worker).
  'rules.validation.deckSizeInvalid': 'El tamaño del deck debe ser un entero positivo.',
  'rules.validation.handSizeInvalid': 'El tamaño de la mano inicial debe ser un entero positivo.',
  'rules.validation.deckTooSmall': 'El Main Deck debe tener al menos 40 cartas para calcular la probabilidad exacta.',
  'rules.validation.deckTooBig': 'En Yu-Gi-Oh! el Main Deck suele estar entre 40 y 60 cartas.',
  'rules.validation.handBiggerThanDeck': 'La mano inicial no puede ser más grande que el deck.',
  'rules.validation.noCards': 'Agregá al menos una carta o grupo de cartas.',
  'rules.validation.missingOrigin': 'Hay cartas sin clasificar (origen). Revisalas en Categorización.',
  'rules.validation.missingRoles': 'Hay cartas sin clasificar (roles). Revisalas en Categorización.',
  'rules.validation.pendingReview': 'Hay cartas con clasificación pendiente de revisión. Revisalas en Categorización.',
  'rules.validation.cardNeedsName': 'Cada carta o grupo debe tener un nombre.',
  'rules.validation.duplicateName': 'El nombre "{name}" está repetido. Usá nombres únicos para evitar ambigüedad.',
  'rules.validation.copiesInvalid': 'La cantidad de "{name}" debe ser un entero mayor o igual a 0.',
  'rules.validation.copiesOverDeck': 'La suma de copias definidas supera el tamaño del deck.',
  // Las dos formas son iguales en español (así sale hoy: "Faltan 1 cartas"); el inglés sí distingue.
  'rules.validation.missingCopies': {
    one: 'Falta {count} carta. Se tratará como "Otras cartas".',
    other: 'Faltan {count} cartas. Se tratarán como "Otras cartas".',
  },
  'rules.validation.noRules': 'Agregá al menos una regla de salida o problema.',
  'rules.validation.unnamedRule': 'sin nombre',
  'rules.validation.ruleNeedsReview': 'El patrón "{name}" viene de una versión anterior y necesita revisión manual antes de calcular.',
  'rules.validation.ruleNoRequirements': 'El patrón "{name}" no tiene requisitos.',
  'rules.validation.ruleTooManyRequired': 'El patrón "{name}" pide más requisitos de los que existen.',
  'rules.validation.conditionNoGroup': 'El patrón "{name}" tiene una condición sin grupo seleccionado.',
  'rules.validation.conditionNoMonsterValue': 'El patrón "{name}" tiene una condición de monstruo sin valor seleccionado.',
  'rules.validation.groupEmpty': 'El patrón "{name}" usa un grupo vacío. Ajustá origen/roles en el deck o elegí otro grupo.',
  'rules.validation.noMonsters': 'El patrón "{name}" no encuentra monstruos {filter} en el Main Deck.',
  'rules.validation.noMonstersFilter': 'con ese filtro',
  'rules.validation.requirementNoCards': 'El patrón "{name}" tiene un requisito sin cartas seleccionadas.',
  'rules.validation.requirementNotInDeck': 'El patrón "{name}" pide cartas que no están en tu deck: no suma ni resta en el cálculo.',
  'rules.validation.quantityInvalid': 'El patrón "{name}" tiene una cantidad inválida en uno de sus requisitos.',
  'rules.validation.cardGone': 'El patrón "{name}" referencia una carta que ya no existe.',
  'rules.validation.poolTooFewNames': {
    one: 'El patrón "{name}" pide {count} nombre distinto en una pool que solo tiene {available}.',
    other: 'El patrón "{name}" pide {count} nombres distintos en una pool que solo tiene {available}.',
  },
  // Igual que arriba: en español sale "copias" aun con una sola.
  'rules.validation.poolTooFewCopies': {
    one: 'El patrón "{name}" pide {count} copia en una pool que solo suma {total}.',
    other: 'El patrón "{name}" pide {count} copias en una pool que solo suma {total}.',
  },
  'rules.validation.quantityOverHand': 'El patrón "{name}" exige más cartas de las que entran en la mano inicial.',

  // Errores del cálculo (se muestran como un aviso del Lab)
  'rules.compute.tooSlow': 'El cálculo tardó demasiado y se canceló. Probá con menos condiciones o un pool de cartas más chico.',
  'rules.compute.failed': 'No pude calcular las probabilidades. Probá de nuevo.',

  // Sugerencias: qué es lo que más frena al deck y qué cambiar
  'rules.suggestion.noOpening': 'Manos sin ninguna salida',
  'rules.suggestion.fillerCard': 'carta de relleno',
  // Los roles faltantes van separados por coma: en español "rol" queda en singular.
  'rules.suggestion.missingRole': {
    one: 'Tu deck no tiene cartas con rol {roles}: sumar alguna es lo que más lo baja.',
    other: 'Tu deck no tiene cartas con rol {roles}: sumar alguna es lo que más lo baja.',
  },
  'rules.suggestion.maxed': 'Las cartas que lo evitan ({names}) ya están al máximo de copias que permite tu formato: para bajarlo, sumá cartas distintas con esos roles.',

  // Nombre que se le pone a una regla propia que se guardó sin nombre
  'rules.curation.unnamedOpening': 'Salida sin nombre',
  'rules.curation.unnamedProblem': 'Problema sin nombre',

  // Reglas del sistema (catálogo): título, qué mide, condición corta y cuánto pasa
  'rules.preset.starterOpening.title': 'Salida básica',
  'rules.preset.starterOpening.description': 'Robar al menos un Starter: la condición mínima para que cualquier deck arranque su jugada.',
  'rules.preset.starterOpening.subtitle': '1+ Starter',
  'rules.preset.starterOpening.probability': 'Abrís al menos un Starter en {percent} de las manos.',
  'rules.preset.deadCards.title': '2+ cartas muertas',
  'rules.preset.deadCards.description': 'Dos o más Bricks o Garnets en mano dejan la jugada sin recursos, en cualquier deck.',
  'rules.preset.deadCards.subtitle': '2+ Brick o Garnet',
  'rules.preset.deadCards.probability': 'Abrís 2 o más cartas muertas en {percent} de las manos.',
  'rules.preset.starterExtender.title': 'Salida con seguimiento',
  'rules.preset.starterExtender.description': 'Starter y Extender en cartas distintas: la mano puede continuar si la interrumpen.',
  'rules.preset.starterExtender.subtitle': 'Starter + Extender',
  'rules.preset.starterExtender.probability': 'Abrís Starter y Extender en {percent} de las manos.',
  'rules.preset.starterInteraction.title': 'Salida con interacción',
  'rules.preset.starterInteraction.description': 'Arrancar y además poder frenar al rival con una Handtrap o Disruption.',
  'rules.preset.starterInteraction.subtitle': 'Starter + Handtrap/Disruption',
  'rules.preset.starterInteraction.probability': 'Abrís Starter con interacción en {percent} de las manos.',
  'rules.preset.starterBoardbreaker.title': 'Salida que rompe campo',
  'rules.preset.starterBoardbreaker.description': 'Yendo segundo: arrancar y tener con qué romper el campo del rival.',
  'rules.preset.starterBoardbreaker.subtitle': 'Starter + Boardbreaker',
  'rules.preset.starterBoardbreaker.probability': 'Yendo segundo, abrís Starter y Boardbreaker en {percent} de las manos.',
  'rules.preset.noAnswerSecond.title': 'Sin respuesta yendo 2º',
  'rules.preset.noAnswerSecond.description': 'Yendo segundo, sin una Handtrap ni un Boardbreaker en las 5 cartas iniciales (no cuenta la que robás) quedás a merced del campo rival.',
  'rules.preset.noAnswerSecond.subtitle': '0 Handtrap o Boardbreaker en las 5 cartas',
  'rules.preset.noAnswerSecond.probability': 'Yendo segundo, no tenés respuesta en {percent} de las manos.',

  // La frase que dice cuándo se cumple una regla. Una frase por mensaje: {conditions} son las condiciones ya armadas
  // y unidas (con "y", "o" o coma según el modo). "Separate" es cuando una misma carta no puede valer para dos condiciones.
  'rules.engine.noRequirements': 'Sin requisitos',
  'rules.engine.unnamedRule': 'Patrón sin nombre',
  'rules.engine.label.all': 'La regla se cumple si {conditions}.',
  'rules.engine.label.allSeparate': 'La regla, sin reutilizar la misma carta entre condiciones, se cumple si {conditions}.',
  'rules.engine.label.any': 'La regla se cumple si pasa cualquiera de estas opciones: {conditions}.',
  'rules.engine.label.anySeparate': 'La regla, sin reutilizar la misma carta entre condiciones, se cumple si pasa cualquiera de estas opciones: {conditions}.',
  'rules.engine.label.atLeast': 'La regla se cumple si pasan al menos {required} de estas opciones: {conditions}.',
  'rules.engine.label.atLeastSeparate': 'La regla, sin reutilizar la misma carta entre condiciones, se cumple si pasan al menos {required} de estas opciones: {conditions}.',
  'rules.engine.joinAnd': 'y',
  'rules.engine.joinOr': 'o',

  // Qué cuenta cada condición (el rótulo que va después de "copia de", "monstruo"…)
  'rules.engine.groupDeleted': 'Grupo eliminado',
  'rules.engine.monsterFilter': 'Filtro de monstruos',
  'rules.engine.archetype': 'Arquetipo: {name}',
  'rules.engine.cardType.monster': 'Tipo: Monstruo',
  'rules.engine.cardType.spell': 'Tipo: Magia',
  'rules.engine.cardType.trap': 'Tipo: Trampa',
  'rules.engine.emptyPool': 'Pool vacía',

  // Una condición: cuántas se piden (`one`: 1; `other`: el resto) y de qué. Copias o nombres distintos; abrir o no abrir.
  // "cards": cartas puntuales, pools, grupos y arquetipos.
  'rules.engine.phrase.cards.includeCopies': { one: 'abrís 1 copia de {label}', other: 'abrís {count} copias de {label}' },
  'rules.engine.phrase.cards.includeNames': { one: 'abrís 1 nombre distinto de {label}', other: 'abrís {count} nombres distintos de {label}' },
  'rules.engine.phrase.cards.excludeCopies': { one: 'no abrís ninguna copia de {label}', other: 'no abrís {count} o más copias de {label}' },
  'rules.engine.phrase.cards.excludeNames': { one: 'no abrís ningún nombre de {label}', other: 'no abrís {count} o más nombres distintos de {label}' },
  // "monster": atributo, nivel, tipo de monstruo, ATK, DEF.
  'rules.engine.phrase.monster.includeCopies': { one: 'abrís 1 monstruo {label}', other: 'abrís {count} monstruos {label}' },
  'rules.engine.phrase.monster.includeNames': { one: 'abrís 1 monstruo {label}', other: 'abrís {count} nombres distintos de monstruos {label}' },
  'rules.engine.phrase.monster.excludeCopies': { one: 'no abrís ningún monstruo {label}', other: 'no abrís {count} o más monstruos {label}' },
  'rules.engine.phrase.monster.excludeNames': { one: 'no abrís ningún monstruo {label}', other: 'no abrís {count} o más nombres distintos de monstruos {label}' },
  // "cardType": Monstruo, Magia o Trampa.
  'rules.engine.phrase.cardType.includeCopies': { one: 'abrís 1 carta {label}', other: 'abrís {count} cartas {label}' },
  'rules.engine.phrase.cardType.includeNames': { one: 'abrís 1 carta {label}', other: 'abrís {count} nombres distintos de cartas {label}' },
  'rules.engine.phrase.cardType.excludeCopies': { one: 'no abrís ninguna carta {label}', other: 'no abrís {count} o más cartas {label}' },
  'rules.engine.phrase.cardType.excludeNames': { one: 'no abrís ninguna carta {label}', other: 'no abrís {count} o más nombres distintos de cartas {label}' },
} as const

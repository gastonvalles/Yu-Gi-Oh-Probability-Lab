/**
 * Armador y editor de reglas del Lab: el panel lateral, sus pasos, las condiciones, el selector de qué contar
 * y las frases que describen una regla (la "lectura" y el resumen que sirve de nombre).
 */
export const builder = {
  // Panel lateral del editor
  'builder.drawer.hint': 'El análisis se actualiza al guardar.',
  'builder.drawer.titleNew': 'Nueva regla',
  'builder.drawer.titleEdit': 'Editar regla',
  'builder.drawer.close': 'Cerrar editor',
  'builder.drawer.preparing': 'Preparando el editor…',
  'builder.drawer.delete': 'Borrar regla',
  'builder.drawer.create': 'Crear regla',
  'builder.drawer.saveChanges': 'Guardar cambios',

  // Cambiar el nombre de una regla del sistema
  'builder.rename.title': 'Nombre de la regla',
  'builder.rename.restore': 'Restaurar',
  'builder.rename.name': 'Nombre',

  // Pasos del editor, de arriba abajo
  'builder.step.name': 'Nombre',
  'builder.step.kind': 'Tipo',
  'builder.step.turn': 'Turno',
  'builder.step.conditions': 'Condiciones',
  'builder.step.settings': 'Ajustes',

  'builder.name.label': 'Nombre',
  'builder.name.placeholder': 'Nombre de la regla (opcional)',
  'builder.name.useSummary': 'Opcional: si no, se usa el resumen',

  'builder.patternKind.label': 'Tipo de regla',
  'builder.patternKind.opening': 'Salida',
  'builder.patternKind.problem': 'Problema',

  'builder.turn.label': 'Contexto de turno',
  'builder.turn.either': 'Siempre',
  'builder.turn.first': 'Solo yendo 1º',
  'builder.turn.second': 'Solo yendo 2º',

  'builder.reviewNotice': 'Esta regla viene de una versión anterior. Revisá estos ajustes antes de confiar en el resultado.',
  'builder.addAnd': 'Y otra condición',
  'builder.addOr': 'O otra condición',
  'builder.add': 'Agregar condición',

  // Cómo se combinan las condiciones
  'builder.logic.label': 'Cómo se combinan las condiciones',
  'builder.logic.and': 'Y',
  'builder.logic.or': 'O',
  'builder.logic.all': 'Y · todas',
  'builder.logic.allNegated': 'Y · ninguna está',
  'builder.logic.any': 'O · una alcanza',
  'builder.logic.anyNegated': 'O · falta alguna',
  'builder.logic.atLeast': 'Al menos {count}',
  'builder.logic.atLeastNegated': 'Faltan al menos {count}',
  'builder.logic.minimum': 'Mínimo de condiciones a cumplir',
  'builder.logic.outOf': 'de {count}',

  // Una condición: [Al menos] [− 2 +] [copias] [de qué cartas]
  'builder.condition.label': 'Condición {index}',
  'builder.condition.quantity': 'Cantidad',
  'builder.condition.pick': 'Elegí qué contar',
  'builder.condition.picked': 'Qué contar: {label}. Cambiar',
  'builder.condition.remove': 'Quitar condición {index}',
  'builder.condition.pickerLabel': 'Qué contar en esta condición',
  'builder.condition.kindChange': '{kind}. Cambiar a {other}',
  'builder.condition.kindTitle': 'Cambiar a "{kind}"',
  'builder.condition.unitNames': 'nombres',
  'builder.condition.unitCopies': 'copias',
  'builder.condition.unitToNames': 'copias. Cambiar a nombres distintos',
  'builder.condition.unitToCopies': 'nombres distintos. Cambiar a copias',
  'builder.condition.unitToNamesTitle': 'Contar nombres distintos en vez de copias',
  'builder.condition.unitToCopiesTitle': 'Contar copias en vez de nombres distintos',

  'builder.requirementKind.include': 'Al menos',
  'builder.requirementKind.exclude': 'Sin',

  'builder.cardType.monster': 'Monstruo',
  'builder.cardType.spell': 'Magia',
  'builder.cardType.trap': 'Trampa',

  // Rótulo de lo que cuenta una condición (el segmento de la derecha)
  'builder.label.undefined': 'Sin definir',
  'builder.label.cardMissing': 'Carta fuera del deck',
  'builder.label.poolEmpty': 'Pool vacío',
  'builder.label.poolMore': '{name} +{count} más',
  'builder.label.attribute': 'Atributo {value}',
  'builder.label.level': 'Nivel {value}',
  'builder.label.archetype': 'Arquetipo {value}',
  'builder.label.atk': '{value} ATK',
  'builder.label.def': '{value} DEF',

  // Selector de qué contar
  'builder.picker.title': '¿Qué querés contar?',
  'builder.picker.placeholder': 'Buscar carta, rol, arquetipo…',
  'builder.picker.search': 'Buscar',
  'builder.picker.multiOn': 'Varias cartas ✓',
  'builder.picker.multiOff': 'Elegir varias cartas',
  'builder.picker.noCards': 'No hay cartas en el deck.',
  'builder.picker.noMatches': 'Nada coincide con la búsqueda.',
  'builder.picker.used': 'Ya usadas en otra condición: {names}.',
  'builder.picker.selected': { one: '{count} carta seleccionada', other: '{count} cartas seleccionadas' },
  'builder.picker.hint': 'Tocá cartas de cualquier grupo para armar el pool',
  'builder.picker.clear': 'Limpiar',
  'builder.picker.confirm': 'Usar selección',
  'builder.picker.group.cards': 'Cartas',
  'builder.picker.group.archetype': 'Arquetipo',
  'builder.picker.group.cardType': 'Tipo de carta',
  'builder.picker.group.role': 'Roles',
  'builder.picker.group.origin': 'Origen',
  'builder.picker.group.attribute': 'Atributo',
  'builder.picker.group.level': 'Nivel',
  'builder.picker.group.monsterType': 'Tipo de monstruo',
  'builder.picker.group.atk': 'ATK',
  'builder.picker.group.def': 'DEF',

  // Ajustes que cambian cómo se evalúa la regla
  'builder.settings.draw.title': 'Contar la carta que robás yendo 2º',
  'builder.settings.draw.handOnly': 'Se mira sólo la mano inicial de 5 (p. ej. interacción para el turno del rival).',
  'builder.settings.draw.withDraw': 'Yendo 2º la regla ve las 6 cartas, la robada incluida.',
  'builder.settings.rescue.title': 'Rescatar las cartas que usa',
  'builder.settings.rescue.on': 'Si la mano cumple esta salida, sus cartas no cuentan como muertas en los problemas.',
  'builder.settings.rescue.off': 'Los problemas cuentan todas las cartas de la mano.',
  'builder.settings.shared.title': 'La misma carta cuenta para más de una condición',
  'builder.settings.shared.on': 'Hay cartas en más de una condición: una sola copia puede cumplir varias a la vez.',
  'builder.settings.shared.off': 'Hay cartas en más de una condición: cada condición necesita cartas distintas.',

  // La regla leída en una frase (debajo de las condiciones)
  'builder.readback.and': 'y',
  'builder.readback.or': 'o',
  'builder.readback.turnFirst': 'Solo yendo 1º.',
  'builder.readback.turnSecond': 'Solo yendo 2º.',

  'builder.preview.headingProblem': 'Este problema ocurre si:',
  'builder.preview.headingOpening': 'Esta salida requiere:',
  'builder.preview.noConditions': 'definir al menos una condición',
  // Empieza con "(": el editor lo usa para saber que a la regla le falta elegir qué contar.
  'builder.preview.chooseCards': '(elegí qué cartas contar)',
  'builder.preview.logicAll': 'Deben cumplirse todas las condiciones.',
  'builder.preview.logicAny': 'Alcanza con que se cumpla una condición.',
  'builder.preview.logicAtLeast': 'Deben cumplirse al menos {count} condiciones.',
  'builder.preview.reuseSingle': 'La política de reutilización no cambia el resultado mientras haya una sola condición positiva.',
  'builder.preview.reuseAllowed': 'Se permite reutilizar la misma carta entre condiciones.',
  'builder.preview.reuseForbidden': 'No se permite reutilizar la misma carta entre condiciones.',
  'builder.preview.cardGone': 'una carta que ya no está en el deck',
  'builder.preview.copiesInclude': { one: 'al menos {count} copia de {card}', other: 'al menos {count} copias de {card}' },
  'builder.preview.copiesExclude': { one: 'no robás ninguna copia de {card}', other: 'no robás {count} o más copias de {card}' },

  // Una condición: cuánto se pide + qué se cuenta ({tail} es el criterio: "con rol Starter", "de Nivel 4"…)
  'builder.preview.include.cards': { one: 'al menos {count} carta {tail}', other: 'al menos {count} cartas {tail}' },
  'builder.preview.include.names': { one: 'al menos {count} nombre distinto {tail}', other: 'al menos {count} nombres distintos {tail}' },
  'builder.preview.include.monsters': { one: 'al menos {count} monstruo {tail}', other: 'al menos {count} monstruos {tail}' },
  'builder.preview.include.monsterNames': { one: 'al menos {count} nombre distinto de monstruo {tail}', other: 'al menos {count} nombres distintos de monstruos {tail}' },
  'builder.preview.exclude.cards': { one: 'no robás ninguna carta {tail}', other: 'no robás {count} o más cartas {tail}' },
  'builder.preview.exclude.names': { one: 'no robás ningún nombre {tail}', other: 'no robás {count} o más nombres distintos {tail}' },
  'builder.preview.exclude.monsters': { one: 'no robás ningún monstruo {tail}', other: 'no robás {count} o más monstruos {tail}' },
  'builder.preview.exclude.monsterNames': { one: 'no robás ningún nombre de monstruo {tail}', other: 'no robás {count} o más nombres distintos de monstruos {tail}' },

  'builder.tail.pool': 'del pool {pool}',
  'builder.tail.poolMissing': 'del pool un pool de cartas',
  'builder.tail.cardType': 'de tipo {type}',
  'builder.tail.archetype': 'del arquetipo {name}',
  'builder.tail.role': 'con rol {role}',
  'builder.tail.origin': 'con origen {origin}',
  'builder.tail.attribute': 'con atributo {attribute}',
  'builder.tail.level': 'de Nivel {level}',
  'builder.tail.monsterType': 'de tipo {type}',
  'builder.tail.atk': 'con {value} ATK',
  'builder.tail.def': 'con {value} DEF',

  // El resumen corto de una regla: sirve de nombre cuando la persona no escribió uno
  'builder.summary.undefinedRule': 'Regla sin definir',
  'builder.summary.anyOf': 'Una de estas: {parts}',
  'builder.summary.atLeastOf': '{count} de estas: {parts}',
  'builder.summary.conditionUndefined': 'sin definir',
  'builder.summary.without': 'sin {label}',
  'builder.summary.withoutMany': 'sin {count}+ {label}',
  'builder.summary.many': '{count}+ {label}',
  'builder.summary.cardMissing': 'carta fuera del deck',
  'builder.summary.pool': 'pool',
  'builder.summary.poolManual': 'pool manual',
  'builder.summary.criterion': 'criterio',
} as const

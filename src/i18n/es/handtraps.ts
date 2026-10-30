/** El simulador de handtraps de «Jugar solo»: la fila del lobby, el botón de la mesa, la hoja de las handtraps del rival y su mano en la mesa. */
export const handtraps = {
  // En las reglas de la sala, con el modo Solo.
  'handtraps.title': 'Handtraps del rival',
  'handtraps.row.summary': { one: '{hand} en mano · de {count} carta', other: '{hand} en mano · de {count} cartas' },
  'handtraps.row.choose': 'Elegir…',
  'handtraps.row.chooseLabel': 'Elegir… las handtraps del rival',

  // En el menú ⋯ de la barra de la mesa: cómo está el simulador.
  'handtraps.mat.on': 'prendidas',
  'handtraps.mat.off': 'apagadas',

  // La hoja: cuántas copias de cada una tiene el rival en su deck y cuántas cartas tiene en la mano (se reparten al azar).
  'handtraps.picker.subtitle': 'Elegí cuántas copias de cada una tiene el rival; su mano se reparte al azar.',
  'handtraps.picker.list': 'Handtraps que puede tener el rival',
  'handtraps.picker.copies': 'Copias de {name} en el deck del rival',
  'handtraps.picker.hand': 'Cartas en la mano del rival',
  'handtraps.picker.pool': { one: 'Se reparte al azar entre {count} carta.', other: 'Se reparte al azar entre {count} cartas.' },
  'handtraps.picker.short': 'Con estas cartas la mano sale con {count}.',
  'handtraps.picker.empty': 'Elegí al menos una carta.',
  'handtraps.picker.use': 'Usar estas handtraps',
  'handtraps.picker.add': 'Agregar otra carta',
  'handtraps.picker.search': 'Buscar otra carta',
  'handtraps.picker.searchPlaceholder': 'Nombre de la carta',
  'handtraps.picker.searching': 'Buscando…',
  'handtraps.picker.noResults': 'No hay cartas con «{query}».',
  'handtraps.picker.addCard': 'Agregar {name} a la lista',
  'handtraps.picker.listed': '{name} ya está en la lista',
  'handtraps.picker.dealsNew': 'Al aplicar, se reparte una mano nueva.',
  // En el duelo automático: aplicar reinicia el duelo y lo que no tiene regla (lo agregado con el buscador) el rival lo tiene pero no lo usa.
  'handtraps.picker.restarts': 'Al aplicar, el duelo empieza de nuevo.',
  'handtraps.picker.notAuto': 'Todavía no la usa solo',
  // «El rival juega su turno (beta)»: Invoca, coloca, activa sus cartas (las de `TURN_RULES`) y ataca.
  'handtraps.picker.ownTurn': 'El rival juega su turno (beta)',
  'handtraps.picker.ownTurnHint': 'Invoca, coloca, activa sus cartas y ataca: tus combos pueden terminar con daño.',
  'handtraps.picker.turnCard': 'La juega en su turno',
  'handtraps.picker.turnOnly': 'La usa sólo si juega su turno',
  'handtraps.picker.filler': 'Sin regla: si es un monstruo, lo Invoca',
  'handtraps.picker.dominus': 'Con {dominus}, el rival ya no podrá usar {cards} después.',
  'handtraps.picker.turnOff': 'Apagar el simulador',

  // En el duelo automático: el Extra Deck del rival, en orden de preferencia para los costos (Fydraulis Harmonia revela Sincros de ahí).
  'handtraps.extra.title': 'Extra Deck del rival',
  'handtraps.extra.count': '{count} de {max}',
  'handtraps.extra.hint': 'El primero que cumpla es el que usa como costo. Nunca los Invoca.',
  'handtraps.extra.empty': 'Sin Extra Deck: el rival juega sin él.',
  'handtraps.extra.needs': '{name} necesita un {kind} en el Extra Deck: sin eso no la usa.',
  'handtraps.extra.list': 'Extra Deck del rival, en orden de preferencia',
  'handtraps.extra.kind.fusion': 'Fusión',
  'handtraps.extra.kind.synchro': 'Sincro',
  'handtraps.extra.kind.xyz': 'Xyz',
  'handtraps.extra.kind.link': 'Enlace',
  'handtraps.extra.up': 'Subir {name}',
  'handtraps.extra.down': 'Bajar {name}',
  'handtraps.extra.remove': 'Sacar {name} del Extra Deck',
  'handtraps.extra.reset': 'Restablecer el Extra Deck',
  'handtraps.extra.search': 'Buscar un monstruo del Extra Deck',
  'handtraps.extra.noResults': 'No hay monstruos del Extra Deck con «{query}».',
  'handtraps.extra.full': 'El Extra Deck está completo ({max}): sacá uno para sumar otro.',
  'handtraps.extra.add': 'Agregar {name} al Extra Deck',
  'handtraps.extra.capped': '{name} ya tiene {max} copias',
  'handtraps.extra.copies': { one: '{count} copia en el Extra', other: '{count} copias en el Extra' },

  // La mesa.
  'handtraps.strip.label': 'Mano del rival',
  'handtraps.strip.used': '{name}, usada en el paso {step}',
  'handtraps.strip.usedMark': 'Usada',
  'handtraps.strip.step': 'Paso {step}',
  'handtraps.menu.use': 'Usar ahora',
  'handtraps.menu.usedAt': 'La usó en el paso {step}',
  'handtraps.step.used': 'El rival usó {card}',
} as const

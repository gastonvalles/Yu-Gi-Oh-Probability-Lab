/** El simulador de handtraps de «Jugar solo»: la fila del lobby, el botón de la mesa, la hoja de las handtraps del rival y su mano en la mesa. */
export const handtraps = {
  // En las reglas de la sala, con el modo Solo.
  'handtraps.title': 'Handtraps del rival',
  'handtraps.row.summary': { one: '{hand} en mano · de {count} carta', other: '{hand} en mano · de {count} cartas' },
  'handtraps.row.choose': 'Elegir…',
  'handtraps.row.chooseLabel': 'Elegir… las handtraps del rival',

  // En la barra de la mesa de «Entrenar solo».
  'handtraps.mat.on': 'Handtraps del rival: encendido',
  'handtraps.mat.off': 'Handtraps del rival: apagado',

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
  'handtraps.picker.turnOff': 'Apagar el simulador',

  // La mesa.
  'handtraps.strip.label': 'Mano del rival',
  'handtraps.strip.used': '{name}, usada en el paso {step}',
  'handtraps.strip.usedMark': 'Usada',
  'handtraps.strip.step': 'Paso {step}',
  'handtraps.menu.use': 'Usar ahora',
  'handtraps.menu.usedAt': 'La usó en el paso {step}',
  'handtraps.step.used': 'El rival usó {card}',
} as const

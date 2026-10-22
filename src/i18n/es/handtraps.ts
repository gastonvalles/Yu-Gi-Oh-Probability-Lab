/** El simulador de handtraps de «Jugar solo»: la fila del lobby, el botón de la mesa, la hoja de la mano del rival y la mano del rival en la mesa. */
export const handtraps = {
  // En las reglas de la sala, con el modo Solo.
  'handtraps.title': 'Handtraps del rival',
  'handtraps.row.summary': '{count} en mano',
  'handtraps.row.empty': 'Ninguna elegida',
  'handtraps.row.choose': 'Elegir…',
  'handtraps.row.chooseLabel': 'Elegir… las handtraps de la mano del rival',

  // En la barra de la mesa de «Entrenar solo».
  'handtraps.mat.on': 'Handtraps del rival: encendido',
  'handtraps.mat.off': 'Handtraps del rival: apagado',

  // La hoja: cuántas copias de cada una tiene el rival en la mano.
  'handtraps.picker.subtitle': 'Elegí cuántas copias de cada una tiene en la mano.',
  'handtraps.picker.list': 'Handtraps para la mano del rival',
  'handtraps.picker.copies': 'Copias de {name} en la mano del rival',
  'handtraps.picker.count': 'En la mano del rival: {count}',
  'handtraps.picker.cap': 'Máximo {max} en la mano.',
  'handtraps.picker.empty': 'Poné al menos una handtrap.',
  'handtraps.picker.use': 'Usar esta mano',
  'handtraps.picker.add': 'Agregar otra carta',
  'handtraps.picker.search': 'Buscar otra carta',
  'handtraps.picker.searchPlaceholder': 'Nombre de la carta',
  'handtraps.picker.searching': 'Buscando…',
  'handtraps.picker.noResults': 'No hay cartas con «{query}».',
  'handtraps.picker.addCard': 'Agregar {name} a la lista',
  'handtraps.picker.listed': '{name} ya está en la lista',
  'handtraps.picker.dealsNew': 'Al aplicar, se reparte una mano nueva.',
  'handtraps.picker.turnOff': 'Apagar el simulador',

  // La mesa.
  'handtraps.strip.label': 'Mano del rival',
  'handtraps.strip.title': 'Rival',
  'handtraps.strip.used': '{name}, usada en el paso {step}',
  'handtraps.menu.use': 'Usar ahora',
  'handtraps.menu.usedAt': 'La usó en el paso {step}',
  'handtraps.step.used': 'El rival usó {card}',
} as const

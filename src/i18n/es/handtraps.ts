/** El simulador de handtraps de «Jugar solo»: la fila del lobby, la hoja del pool y la mano del rival en la mesa. */
export const handtraps = {
  // En las reglas de la sala, con el modo Solo.
  'handtraps.title': 'Handtraps del rival',
  'handtraps.row.summary': '{count} en mano · pool de {pool}',
  'handtraps.row.choose': 'Elegir…',
  'handtraps.row.chooseLabel': 'Elegir… el pool de handtraps del rival',

  // En la barra de la mesa de «Entrenar solo».
  'handtraps.mat.on': 'Handtraps del rival: encendido',
  'handtraps.mat.off': 'Handtraps del rival: apagado',

  // La hoja del pool.
  'handtraps.picker.subtitle': 'Marcá las que puede robar y tocá el tipo para cambiarlo.',
  'handtraps.picker.list': 'Pool de handtraps',
  'handtraps.kind.repeatable': 'Repetible · 3 copias',
  'handtraps.kind.single': 'Una sola',
  'handtraps.kind.charmy': 'Charmy · máx. 2 juntas',
  'handtraps.kind.change': 'Tipo de {name}: {kind}',
  'handtraps.picker.count': 'En la mano del rival',
  'handtraps.picker.max': 'Con este pool el rival puede tener como mucho {max}.',
  'handtraps.picker.empty': 'Elegí al menos una handtrap.',
  'handtraps.picker.use': 'Usar este pool',
  'handtraps.picker.add': 'Agregar otra carta',
  'handtraps.picker.search': 'Buscar una carta para el pool',
  'handtraps.picker.searchPlaceholder': 'Nombre de la carta',
  'handtraps.picker.searching': 'Buscando…',
  'handtraps.picker.noResults': 'No hay cartas con «{query}».',
  'handtraps.picker.addCard': 'Agregar {name} al pool',
  'handtraps.picker.inPool': '{name} ya está en el pool',
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

/** El duelo automático (beta): las preguntas del núcleo de reglas, la barra, la línea del registro, la carga, los errores, el fin y la entrada. */
export const auto = {
  // La entrada: el interruptor del lobby de Jugar, debajo de las baldosas.
  'auto.entry.switch': 'Duelo automático (beta)',
  // Vale con el simulador de handtraps encendido o apagado.
  'auto.entry.hint': 'El núcleo aplica las reglas, solo o con un amigo (en sala privada). Solo, el rival no juega su turno: sólo usa las handtraps que le des.',
  // El rival pasivo, dicho en la portada de carga y en «Más opciones».
  'auto.rival.passive': 'El rival no juega: sólo recibe. Sirve para probar tus jugadas con las reglas de verdad.',
  // El rival con las handtraps del simulador, en la portada de carga.
  'auto.rival.handtraps': 'El rival no juega su turno: usa sus handtraps solo, contra lo que hacés, cuando las reglas lo dejan.',
  // El cartel de la carta que el rival activa en respuesta (su nombre ya va debajo de la carta).
  'auto.rival.responds': '{name} responde a {to}',

  // La pregunta de sí o no del núcleo, en el medio de la mesa. Activar un efecto dice «Activar efecto» (`practice.menu.activateEffect`): el texto ya nombra la carta.
  'auto.ask.effect': '¿Activás el efecto de {card}?',
  'auto.ask.fallback': '¿Lo hacés?',
  'auto.ask.skipEffect': 'No activar',
  'auto.ask.yes': 'Hacerlo',
  'auto.ask.no': 'No hacerlo',

  // Las opciones del núcleo (una hoja): una opción, la posición, un número, Tipos o Atributos. «Declarar» es la palabra de las cartas.
  'auto.options.option': 'Elegí una opción',
  'auto.options.position': 'Elegí la posición',
  'auto.options.number': 'Declará un número',
  'auto.options.race': { one: 'Declará {count} Tipo', other: 'Declará {count} Tipos' },
  'auto.options.attribute': { one: 'Declará {count} Atributo', other: 'Declará {count} Atributos' },
  'auto.options.declare': 'Declarar',
  // Las demás posiciones ya existen (`practice.menu.attack`, `defense`, `turnFaceDown`).
  'auto.position.faceDownAttack': 'Boca abajo en ataque',

  // Elegir cartas de una lista que no está en el campo (de varios lugares, o por código).
  'auto.picker.title': 'Elegí cartas',
  'auto.picker.cards': 'Cartas para elegir',
  'auto.picker.choose': { one: 'Elegir {count} carta', other: 'Elegir {count} cartas' },
  'auto.picker.status': '{chosen} de {max}',

  // Ordenar cartas (el tope del deck).
  'auto.sort.title': 'Ordená las cartas',
  'auto.sort.hint': 'Tocalas en el orden en que van: la primera queda arriba.',
  'auto.sort.done': 'Ordenar así',
  'auto.sort.asIs': 'Dejar como está',

  // Lo que se elige en la mesa (la línea de estado de abajo): casillas y cartas.
  'auto.pick.zone': { one: 'Elegí {count} casilla', other: 'Elegí {count} casillas' },
  'auto.pick.cards': { one: 'Elegí {count} carta', other: 'Elegí {count} cartas' },
  'auto.pick.range': 'Elegí de {min} a {max} cartas',
  'auto.pick.tribute': 'Sacrificios: {chosen} de {total}',
  'auto.pick.sum': 'Niveles: {chosen} de {total}',
  'auto.pick.counter': 'Contadores: {chosen} de {total}',
  'auto.pick.attackTarget': 'Elegí a qué monstruo atacar',
  'auto.pick.done': 'Listo',
  'auto.pick.chosen': 'Elegida',
  'auto.phase.notYet': 'Todavía no',

  // La barra de arriba y «Más opciones».
  'auto.bar.soundsHint': 'Las jugadas y las vidas.',
  'auto.bar.chain': 'Respuestas',
  'auto.bar.chainHint': 'Si te pregunta cuando podés responder a una cadena.',
  'auto.bar.place': 'Casilla',
  'auto.bar.placeHint': 'Dónde va cada carta: la elegís vos o va a la primera libre.',
  'auto.bar.ask': 'Preguntar',
  'auto.bar.never': 'Nunca',
  'auto.bar.auto': 'Automática',
  'auto.bar.restart': 'Reiniciar el duelo',
  'auto.bar.restartHint': 'El mismo duelo desde el principio: las mismas cartas, en el mismo orden.',
  // Las handtraps del rival (el simulador de «Jugar solo») y la mano del rival de dorso.
  'auto.bar.handtrapsOn': '{cards} · {hand} en la mano',
  'auto.bar.handtrapsOff': 'Apagadas: el rival no usa nada.',
  'auto.bar.handtrapsChange': 'Cambiar handtraps',
  'auto.bar.blind': 'A ciegas',
  'auto.bar.blindHint': 'La mano del rival se ve de dorso: cada carta se ve cuando la usa.',
  // El ATK y la DEF de ahora en el detalle de la carta, cuando difieren de los impresos.
  'auto.dock.now': 'ahora {value}',

  // La línea del registro: lo que hace el núcleo, la cadena y los avisos que no frenan el duelo.
  'auto.lane.thinking': 'El núcleo está resolviendo…',
  'auto.lane.rivalChoosing': 'El rival está eligiendo',
  'auto.lane.chainLink': 'Cadena {link}: {card}',
  'auto.lane.chain': 'Cadena {link}: {card} responde a {to}',
  'auto.lane.resolve': 'Se resuelve {card}',
  'auto.lane.negated': 'Negada: {card}',
  'auto.lane.respondTo': 'Podés responder a {card} con {cards}',
  'auto.lane.respondNow': 'Podés activar {cards} ahora',
  'auto.lane.pass': 'No responder',
  'auto.lane.mustActivate': 'Tenés que activar {cards}: tocala',
  'auto.lane.autoZone': 'La casilla se eligió sola',
  'auto.lane.unmapped': 'La mesa no puede mostrar: {what}',
  'auto.lane.script': 'Falló el script de {card}: el duelo sigue.',
  'auto.lane.error': 'Algo falló: {message}',

  // La portada de carga.
  'auto.loading.start': 'Preparando el duelo…',
  'auto.loading.rules': 'Cargando las reglas de tus cartas… {done} de {total}',

  // Los errores que no dejan jugar.
  'auto.fault.rules': { one: 'A {count} carta le faltan sus reglas', other: 'A {count} cartas les faltan sus reglas' },
  'auto.fault.rulesText': 'El núcleo no tiene sus datos o su script: con ellas el duelo automático no arranca.',
  'auto.fault.manual': 'Jugar en modo manual',
  'auto.fault.back': 'Volver al lobby',
  'auto.fault.setup': 'No se pudo crear el duelo',
  'auto.fault.crash': 'El núcleo se cayó',
  'auto.fault.retry': 'Reintentar',

  // El fin (el título y las vidas, con los de `duel.result.*`).
  'auto.end.again': 'Jugar otra vez',
  'auto.end.deckOutWin': 'El rival no pudo robar.',
  'auto.end.deckOutLose': 'No pudiste robar: te quedaste sin deck.',
  'auto.end.effectWin': 'Ganaste por el efecto de una carta.',
  'auto.end.effectLose': 'Perdiste por el efecto de una carta.',

  // El interruptor del lobby en un navegador que no puede correr el núcleo, y volver a la mesa manual desde «Más opciones».
  'auto.entry.unsupported': 'Tu navegador no puede correr el motor de reglas.',
  'auto.bar.manual': 'Jugar en modo manual',
  'auto.bar.manualHint': 'Apaga las reglas automáticas y abre la mesa manual con tu mismo deck.',

  // El duelo automático por enlace: lo que la sala le dice a quien espera (debajo del deck), la línea mientras elige el otro y lo que corta el duelo.
  'auto.online.waitingDeck': 'Esperando el deck de {name}…',
  'auto.online.checking': 'Revisando que las cartas de los dos tengan reglas…',
  'auto.online.blockedMine': { one: 'A {count} carta tuya le faltan sus reglas: cambiala en el builder.', other: 'A {count} cartas tuyas les faltan sus reglas: cambialas en el builder.' },
  'auto.online.blockedTheirs': { one: 'A {count} carta de {name} le faltan sus reglas.', other: 'A {count} cartas de {name} les faltan sus reglas.' },
  'auto.online.outdated': '{name} tiene que actualizar la app para jugar con reglas automáticas.',
  'auto.online.version': 'Tu app y la de {name} no son la misma versión: recarguen la página para jugar con reglas automáticas.',
  'auto.online.off': 'El duelo automático por enlace está apagado por ahora.',
  'auto.online.data': 'No se pudieron bajar las reglas del duelo: probá de nuevo en un rato.',
  'auto.online.rivalChoosing': '{name} está eligiendo…',
  'auto.online.lost': 'El duelo se perdió: el anfitrión recargó la página.',
  'auto.online.cut': 'El duelo se cortó: {name} mandó jugadas inválidas.',
  'auto.online.broken': 'El duelo se cortó y no se puede seguir.',
  'auto.online.deckOutWin': '{name} no pudo robar.',

  // Seguir el duelo por enlace en modo manual (desde «Más opciones»): la fila, el pedido al otro, la espera y cómo terminó.
  'auto.online.manualTitle': 'Modo manual',
  'auto.online.manualHint': 'Le preguntás a {name}: si acepta, siguen a mano los dos, con la mesa como está. El automático vuelve en la revancha.',
  'auto.online.manualControlHint': 'Ahora no se puede: hay una carta bajo el control del otro jugador.',
  'auto.online.manualAsk': 'Pasar a manual',
  'auto.online.manualCancel': 'Cancelar pedido',
  'auto.online.manualAsking': 'Esperando a que {name} acepte seguir en modo manual…',
  'auto.online.manualAsked': '{name} quiere seguir el duelo en modo manual: cada uno mueve sus cartas a mano, con la mesa como está.',
  'auto.online.manualKeep': 'Seguir en automático',
  'auto.online.manualSwitching': 'Pasando a modo manual…',
  'auto.online.manualDeclined': '{name} prefirió seguir en automático.',
  'auto.online.manualExpired': '{name} no contestó: el duelo sigue en automático.',
  'auto.online.manualControl': 'No se pudo pasar a manual: hay una carta bajo el control del otro jugador.',
  'auto.online.manualDone': 'Siguen en modo manual: cada uno mueve sus cartas.',
  'auto.online.manualDoneDropped': 'Siguen en modo manual. Lo que estaba a medio jugar se descartó: la mesa quedó como estaba.',
} as const

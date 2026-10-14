/** Duelo por enlace: el menú, la sala, la mesa con los dos campos, la barra de puntos de vida y la conexión. */
export const duel = {
  'duel.nav.title': 'Duelo con un amigo',
  'duel.unavailable': 'El duelo con un amigo todavía no está disponible en esta versión de la app.',

  // La mesa con los dos campos.
  'duel.table.label': 'Mesa del duelo',
  'duel.table.theirs': 'Campo del rival',
  'duel.table.mine': 'Tu campo',
  'duel.zone.theirs': 'Rival, {zone}',
  'duel.zone.conflict': '{zone}: la ocupan los dos',
  'duel.hand.theirs': 'Mano del rival: {count}',
  'duel.phase.current': 'Fase actual: {phase}',
  // El aviso cuando el rival ataca.
  'duel.announce.attack': '{name} ataca a {target}',
  'duel.announce.attackDirect': '{name} te ataca directo',
  'duel.announce.yourCard': 'una de tus cartas',

  // Antes de entrar a una sala.
  'duel.lobby.title': 'Duelo con un amigo',
  'duel.lobby.intro': 'Jugá la mesa de práctica contra otra persona, cada una en su dispositivo. No hacen falta cuentas: se entra con un enlace.',
  'duel.lobby.name': 'Tu nombre',
  'duel.lobby.namePlaceholder': 'Cómo te ve tu rival',
  'duel.lobby.defaultName': 'Duelista',
  'duel.lobby.create': 'Crear un duelo',
  'duel.lobby.createHint': 'Te damos un enlace para mandarle a tu rival.',
  'duel.lobby.join': 'Unirme a un duelo',
  'duel.lobby.joinHint': 'Pegá el enlace que te mandaron, o sólo el código.',
  'duel.lobby.joinPlaceholder': 'Enlace o código',
  'duel.lobby.joinAction': 'Unirme',
  'duel.lobby.joinInvalid': 'Ese no parece un código de duelo: son 8 letras y números.',
  'duel.lobby.needDeck': 'Armá primero tu deck en el builder: el duelo se juega con el que tengas armado ({count} cartas en el Main, hacen falta {min} para repartir la mano).',

  // La sala, hasta que los dos tienen su mano.
  'duel.room.title': 'Tu duelo',
  'duel.room.link': 'Enlace para tu rival',
  'duel.room.code': 'Código: {code}',
  'duel.room.copy': 'Copiar enlace',
  'duel.room.copied': 'Enlace copiado',
  'duel.room.share': 'Compartir',
  'duel.room.shareText': 'Te invito a un duelo en Probability Lab',
  'duel.room.waitingPeer': 'Esperando a tu rival…',
  'duel.room.peerHere': '{name} está en la sala.',
  'duel.room.peerHereNoName': 'Tu rival está en la sala.',
  'duel.room.guestWaits': 'Esperando los ajustes del anfitrión…',
  'duel.room.settings': 'Cada uno empieza con {lp} LP y una mano de {hand} cartas.',
  'duel.room.start': 'Repartir mi mano',
  'duel.room.waitingTable': 'Esperando que tu rival reparta su mano…',
  'duel.room.leave': 'Salir',
  'duel.room.incompatible': 'Tu rival usa otra versión del duelo, o los dos crearon la sala: pedile que abra tu enlace.',

  // La conexión.
  'duel.status.connecting': 'Conectando…',
  'duel.status.open': 'Conectado',
  'duel.status.reconnecting': 'Reconectando…',
  'duel.status.full': 'Esa sala ya tiene dos jugadores.',
  'duel.status.closed': 'Sin conexión',
  'duel.peer.absent': 'Tu rival se desconectó. Cuando vuelva, la mesa se repone sola.',

  // La barra de arriba de la mesa.
  'duel.bar.you': 'Vos',
  'duel.bar.rival': 'Rival',
  'duel.bar.yourTurn': 'Tu turno',
  'duel.bar.theirTurn': 'Turno de {name}',
  'duel.bar.lifeOf': 'Puntos de vida de {name}',
  'duel.bar.changeLife': 'Cambiar mis puntos de vida',
  'duel.bar.clock': 'Reloj de la ronda: {time}',
  'duel.bar.clockStart': 'Iniciar el reloj',
  'duel.bar.clockPause': 'Pausar el reloj',
  'duel.bar.clockReset': 'Reiniciar el reloj',
  'duel.bar.leave': 'Salir del duelo',
  'duel.bar.leaveTitle': '¿Salir del duelo?',
  'duel.bar.leaveText': 'Tu rival se queda en la sala. Si volvés con el mismo enlace, repartís una mano nueva.',

  // Cambiar los puntos de vida.
  'duel.life.title': 'Mis puntos de vida',
  'duel.life.amount': 'Monto',
  'duel.life.apply': 'Aplicar',
  'duel.life.halve': 'Mitad',
} as const

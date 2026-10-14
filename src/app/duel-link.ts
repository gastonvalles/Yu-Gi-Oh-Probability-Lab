import { ROOM_CODE_PATTERN } from './duel-relay-rules'

/**
 * El enlace de un duelo: la app abierta en el paso del duelo, con el código de la sala (`#duel?room=K7QF2M9X`).
 * Lo que se pega en "Unirme" puede ser el enlace entero o sólo el código, en mayúsculas o no.
 */

export const DUEL_STEP = 'duel'

export const buildDuelLink = (origin: string, pathname: string, room: string) => `${origin}${pathname}#${DUEL_STEP}?room=${room}`

/** El código de sala de un texto pegado (un enlace o el código solo), o null si no hay uno válido. */
export function extractRoomCode(text: string): string | null {
  const fromLink = /[?&]room=([A-Za-z0-9]+)/.exec(text)?.[1]
  const candidate = (fromLink ?? text).replace(/[\s-]/g, '').toUpperCase()

  return ROOM_CODE_PATTERN.test(candidate) ? candidate : null
}

/** La sala que pide el hash de la página (`#duel?room=CODE`), o null. */
export function parseDuelHash(hash: string): string | null {
  const [step = '', query = ''] = hash.replace(/^#/, '').split('?')
  const room = new URLSearchParams(query).get('room')

  return step === DUEL_STEP && room !== null ? extractRoomCode(room) : null
}

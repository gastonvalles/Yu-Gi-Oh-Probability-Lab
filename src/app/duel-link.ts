import { ROOM_CODE_PATTERN } from './duel-relay-rules'

/**
 * El enlace de un duelo: la app abierta en el paso del duelo, con el código de la sala (`#duel?room=K7QF2M9X`).
 * Lo que se pega en "Unirme" puede ser el enlace entero o sólo el código, en mayúsculas o no.
 */

export const DUEL_STEP = 'duel'

/** El enlace de un duelo; con `watch`, el de espectador (`&watch=1`): entra a mirar, no a jugar. */
export const buildDuelLink = (origin: string, pathname: string, room: string, watch = false) => `${origin}${pathname}#${DUEL_STEP}?room=${room}${watch ? '&watch=1' : ''}`

/** ¿Es un enlace para mirar? (Lo que se pega en "Unirme" puede ser uno.) */
export const isWatchLink = (text: string) => /[?&]watch=1(?![0-9A-Za-z])/.test(text)

/** El código de sala de un texto pegado (un enlace o el código solo), o null si no hay uno válido. */
export function extractRoomCode(text: string): string | null {
  const fromLink = /[?&]room=([A-Za-z0-9]+)/.exec(text)?.[1]
  const candidate = (fromLink ?? text).replace(/[\s-]/g, '').toUpperCase()

  return ROOM_CODE_PATTERN.test(candidate) ? candidate : null
}

/** La sala que pide el hash de la página (`#duel?room=CODE`), y si es para mirar (`&watch=1`), o null. */
export function parseDuelTarget(hash: string): { room: string; watch: boolean } | null {
  const [step = '', query = ''] = hash.replace(/^#/, '').split('?')
  const params = new URLSearchParams(query)
  const room = params.get('room')
  const code = step === DUEL_STEP && room !== null ? extractRoomCode(room) : null

  return code ? { room: code, watch: params.get('watch') === '1' } : null
}

/** La sala que pide el hash de la página (`#duel?room=CODE`), o null. */
export function parseDuelHash(hash: string): string | null {
  return parseDuelTarget(hash)?.room ?? null
}

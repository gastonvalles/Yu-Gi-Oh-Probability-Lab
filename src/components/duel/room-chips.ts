import { getDeckFormatLabel } from '../../app/deck-format'
import type { PublicRoomInfo } from '../../app/duel-relay-rules'
import { t } from '../../i18n'
import { GENESYS_POINT_CAP } from '../../app/genesys-format'
import type { DeckFormat } from '../../types'

/** Cada cuánto se vuelve a pedir la lista de la arena mientras se mira. */
export const REFRESH_MS = 15_000

/** El formato como se dice de una sala: su nombre y, en Genesys, el tope de puntos (el oficial si la sala no lo manda). */
export const formatName = (format: DeckFormat, genesysCap?: number): string => (format === 'genesys' ? t('duel.play.genesysLine', { points: genesysCap ?? GENESYS_POINT_CAP }) : getDeckFormatLabel(format))

/** Lo que dice una sala antes de entrar, en chips: Single o Match, el formato, el reloj y, si hay, el siding. */
export function roomChips(room: Omit<PublicRoomInfo, 'host'>): string[] {
  return [
    room.match ? t('duel.rooms.match') : t('duel.rooms.single'),
    getDeckFormatLabel(room.format as DeckFormat),
    room.limitMin > 0 ? t('duel.rooms.limit', { min: room.limitMin }) : t('duel.rooms.noLimit'),
    ...(room.format === 'genesys' ? [t('duel.rooms.genesysCap', { points: room.genesysCap ?? GENESYS_POINT_CAP })] : []),
    ...(room.siding ? [t('duel.rooms.siding')] : []),
  ]
}

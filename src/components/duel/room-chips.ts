import { getDeckFormatLabel } from '../../app/deck-format'
import type { PublicRoomInfo } from '../../app/duel-relay-rules'
import { t } from '../../i18n'
import type { DeckFormat } from '../../types'

/** Cada cuánto se vuelve a pedir la lista de la arena mientras se mira. */
export const REFRESH_MS = 15_000

/** Lo que dice una sala antes de entrar, en chips: Single o Match, el formato, el reloj y, si hay, el siding. */
export function roomChips(room: Omit<PublicRoomInfo, 'host'>): string[] {
  return [
    room.match ? t('duel.rooms.match') : t('duel.rooms.single'),
    getDeckFormatLabel(room.format as DeckFormat),
    room.limitMin > 0 ? t('duel.rooms.limit', { min: room.limitMin }) : t('duel.rooms.noLimit'),
    ...(room.siding ? [t('duel.rooms.siding')] : []),
  ]
}

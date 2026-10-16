import { useCallback, useEffect, useState } from 'react'

import { getDeckFormatLabel } from '../../app/deck-format'
import type { PublicRoom, PublicRoomInfo } from '../../app/duel-relay-rules'
import type { RoomsApi } from '../../app/duel-rooms'
import { t } from '../../i18n'
import type { DeckFormat } from '../../types'
import { Badge } from '../ui/Badge'
import { Button } from '../ui/Button'
import { Heading } from '../ui/Heading'

/** Cada cuánto se vuelve a pedir la lista mientras se mira. */
const REFRESH_MS = 15_000

interface DuelOpenRoomsProps {
  rooms: RoomsApi
  /** Hay deck para repartir la mano: sin eso no se puede entrar a jugar. */
  canJoin: boolean
  onJoin: (code: string) => void
}

/** Lo que dice una sala antes de entrar, en chips: Single o Match, el formato, el reloj y, si hay, el siding. */
export function roomChips(room: Omit<PublicRoomInfo, 'host'>): string[] {
  return [
    room.match ? t('duel.rooms.match') : t('duel.rooms.single'),
    getDeckFormatLabel(room.format as DeckFormat),
    room.limitMin > 0 ? t('duel.rooms.limit', { min: room.limitMin }) : t('duel.rooms.noLimit'),
    ...(room.siding ? [t('duel.rooms.siding')] : []),
  ]
}

/**
 * Las salas abiertas, a un toque: quien las anotó espera un rival y cualquiera que entre al lobby las ve, sin que nadie le pase un enlace.
 * Se actualiza sola cada 15 segundos y a mano; si el relay no contesta, la lista queda vacía (es un extra: el lobby sigue funcionando con el código).
 */
export function DuelOpenRooms({ rooms, canJoin, onJoin }: DuelOpenRoomsProps) {
  const [list, setList] = useState<PublicRoom[] | null>(null)

  const refresh = useCallback(() => {
    void rooms.list().then(setList)
  }, [rooms])

  useEffect(() => {
    refresh()

    const id = window.setInterval(refresh, REFRESH_MS)

    return () => window.clearInterval(id)
  }, [refresh])

  return (
    <section aria-label={t('duel.rooms.title')} className="grid gap-2">
      <div className="flex items-center justify-between gap-2">
        <Heading level="card">{t('duel.rooms.title')}</Heading>
        <Button variant="tertiary" size="sm" icon="refresh" onClick={refresh}>
          {t('duel.rooms.refresh')}
        </Button>
      </div>

      {list === null ? (
        <p className="m-0 text-micro text-soft" aria-busy="true">
          {t('duel.rooms.loading')}
        </p>
      ) : list.length === 0 ? (
        <p className="m-0 text-micro text-soft">{t('duel.rooms.empty')}</p>
      ) : (
        <ul className="m-0 grid list-none gap-2 p-0">
          {list.map((room) => (
            <li key={room.code} className="flex flex-wrap items-center gap-x-3 gap-y-2 rounded-card border border-border-subtle bg-card-background px-3 py-2.5">
              <span className="grid min-w-0 flex-1 gap-1">
                <span className="truncate text-body font-semibold text-foreground">{room.host}</span>
                <span className="flex flex-wrap gap-1">
                  {roomChips(room).map((chip) => (
                    <Badge key={chip} size="sm">
                      {chip}
                    </Badge>
                  ))}
                </span>
              </span>
              <Button variant="secondary" size="sm" disabled={!canJoin} aria-label={t('duel.rooms.joinLabel', { name: room.host })} onClick={() => onJoin(room.code)}>
                {t('duel.rooms.join')}
              </Button>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}

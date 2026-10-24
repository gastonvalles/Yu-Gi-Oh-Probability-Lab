import type { ReactNode } from 'react'

import type { OnlineLink, OnlineTransport, RoomAutoState } from '../../app/auto/online'
import type { Duel, DuelRole, DuelSnapshot } from '../../app/duel-session'
import type { SocketStatus } from '../../app/duel-socket'
import type { MatCard } from '../probability/PracticeMat'

/**
 * Lo que `DuelScreen` le pasa a la mesa del duelo automático por enlace (diseño: `docs/duelos-automaticos.md`, «Duelo online»): la sala de siempre (`duel`, `snapshot`, `status`), el
 * transporte del relay para el enlace del núcleo y el deck de esta persona. La sala (listos, tirada) la dibuja `DuelRoom` mientras no hay sesión: llega como `room`.
 */
export interface AutoDuelScreenProps {
  duel: Duel
  snapshot: DuelSnapshot
  status: SocketStatus
  transport: OnlineTransport
  myName: string
  deck: { name: string; mainIds: readonly string[]; extraIds: readonly string[]; cardsById: ReadonlyMap<string, MatCard> }
  handSize: number
  /** La sala de siempre (DuelRoom) mientras no empieza: la dibuja la pantalla con lo que el enlace sabe. */
  room: (auto: RoomAutoState) => ReactNode
  onLeave: () => void
  onAbandon: () => void
  onRematch: () => void
  /** Pruebas: el enlace de mentira. */
  connect?: (transport: OnlineTransport, role: DuelRole) => OnlineLink
}

/** ESQUELETO: la mesa del duelo automático por enlace la implementa el paquete de la pantalla. */
export function AutoDuelScreen(_props: AutoDuelScreenProps) {
  return null
}

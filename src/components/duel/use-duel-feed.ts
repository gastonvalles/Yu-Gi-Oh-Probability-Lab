import { useEffect, useRef, useState } from 'react'

import type { ChatLine } from '../../app/duel-games'
import type { DuelSnapshot } from '../../app/duel-session'
import { describeMatAction, replayMat } from '../../app/practice-mat'
import { t } from '../../i18n'
import type { MatCard } from '../probability/PracticeMat'
import type { PlayerSide } from './player-color'

/**
 * Una línea del registro del duelo: lo que hizo cada jugador (tus jugadas con tus palabras; las del rival, el cartel que se le muestra a quien mira), el comienzo de cada
 * turno y lo escrito en el chat, todo en el orden en que pasó.
 */
export type FeedEntry =
  | { id: string; kind: 'event'; side: PlayerSide; text: string }
  | { id: string; kind: 'turn'; text: string }
  | { id: string; kind: 'chat'; line: ChatLine }

/** Una línea todavía sin su número. */
type NewEntry = FeedEntry extends infer Entry ? (Entry extends unknown ? Omit<Entry, 'id'> : never) : never

/** Cuántas líneas se guardan (el registro de un duelo largo no crece sin límite). */
const MAX_ENTRIES = 200

/** Jugadas que no se anotan: robar y cambiar de fase pasan muy seguido y el cambio de turno ya tiene su línea. */
const SILENT_ACTIONS = new Set(['draw', 'phase'])

interface FeedSources {
  snapshot: DuelSnapshot
  cardsById: ReadonlyMap<string, MatCard>
  /** El cartel de lo que el rival acaba de hacer y se anima (activar, mostrar, invocar…) o de su ataque: cambiar `key` anota una línea. */
  rivalCaptions: ReadonlyArray<{ key: number; caption: string } | undefined>
  /** De quién es el turno y cuál es: cada cambio anota el comienzo de un turno. */
  turn: 'mine' | 'theirs'
  turnNumber: number
  rivalName: string
  myName: string
}

/**
 * El registro del duelo en orden: tus jugadas, lo que anuncia el rival, los turnos y el chat. Lo que ya estaba jugado al abrir la pantalla (un duelo que se retoma)
 * no se anota, salvo el chat; deshacer tampoco reescribe el registro.
 */
export function useDuelFeed({ snapshot, cardsById, rivalCaptions, turn, turnNumber, rivalName, myName }: FeedSources): readonly FeedEntry[] {
  const { chat, actions, initial } = snapshot
  const [entries, setEntries] = useState<readonly FeedEntry[]>(() => chat.map((line) => ({ id: `c${line.id}`, kind: 'chat', line })))
  const next = useRef(0)
  const seenChat = useRef(chat.at(-1)?.id ?? 0)
  const seenActions = useRef(actions.length)
  // El turno más alto que ya se anotó: deshacer lo baja y volver a pasar lo sube, pero no se anota dos veces el mismo comienzo.
  const seenTurn = useRef(turnNumber)
  const seenCaptions = useRef(rivalCaptions.map((caption) => caption?.key ?? 0))
  // Qué línea del registro es la de cada cartel y qué decía: si el cartel gana el nombre de la carta (llega después), la línea se corrige en vez de repetirse.
  const captionLines = useRef<Array<{ id: string; text: string } | undefined>>([])

  const push = (...added: NewEntry[]) => {
    const stamped = added.map((entry) => ({ ...entry, id: `e${next.current++}` }) as FeedEntry)

    setEntries((current) => [...current, ...stamped].slice(-MAX_ENTRIES))

    return stamped
  }

  // Lo escrito: cada línea nueva del chat.
  useEffect(() => {
    const fresh = chat.filter((line) => line.id > seenChat.current)

    if (fresh.length === 0) return

    seenChat.current = fresh[fresh.length - 1]!.id
    setEntries((current) => [...current, ...fresh.map((line) => ({ id: `c${line.id}`, kind: 'chat', line }) as FeedEntry)].slice(-MAX_ENTRIES))
  }, [chat])

  // Tus jugadas, con las palabras de los pasos de un combo ("Activás X", "Invocación Normal de X").
  useEffect(() => {
    const before = seenActions.current

    seenActions.current = actions.length

    if (!initial || actions.length <= before) return

    const nameOf = (id: string) => cardsById.get(id)?.name ?? t('duel.announce.yourCard')
    const lines: NewEntry[] = []

    for (let index = before; index < actions.length; index += 1) {
      const action = actions[index]!

      if (SILENT_ACTIONS.has(action.type)) continue

      lines.push({ kind: 'event', side: 'mine', text: describeMatAction(replayMat(initial, actions, index), action, nameOf) })
    }

    if (lines.length > 0) push(...lines)
  }, [actions, initial, cardsById])

  // Lo que el rival hace y se avisa (con su nombre ya dentro del texto). Si el mismo cartel gana después el nombre de la carta (se busca por su número), la línea se corrige.
  useEffect(() => {
    rivalCaptions.forEach((entry, index) => {
      if (!entry) return

      if (entry.key !== seenCaptions.current[index]) {
        seenCaptions.current[index] = entry.key

        const [line] = push({ kind: 'event', side: 'theirs', text: entry.caption })

        captionLines.current[index] = line ? { id: line.id, text: entry.caption } : undefined
        return
      }

      const known = captionLines.current[index]

      if (known && known.text !== entry.caption) {
        known.text = entry.caption
        setEntries((current) => current.map((row) => (row.id === known.id && row.kind === 'event' ? { ...row, text: entry.caption } : row)))
      }
    })
  }, [rivalCaptions])

  // El comienzo de cada turno.
  useEffect(() => {
    if (turnNumber <= seenTurn.current) return

    seenTurn.current = turnNumber
    push({ kind: 'turn', text: t('duel.log.turn', { turn: turnNumber, name: turn === 'mine' ? myName : rivalName }) })
  }, [turnNumber, turn, myName, rivalName])

  return entries
}

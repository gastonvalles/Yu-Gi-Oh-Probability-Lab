import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'

import type { ChatLine } from '../../app/duel-games'
import { FRAME_FILL, frameKindOf, type FrameKind } from '../../app/card-frame'
import { isChatLine, readDuelLog, writeDuelLog } from '../../app/duel-save'
import type { DuelRole, DuelSnapshot } from '../../app/duel-session'
import { opaqueOfForeign } from '../../app/mat-control'
import { describeMatAction, isForeignId, replayMat } from '../../app/practice-mat'
import { t } from '../../i18n'
import { cardIdOfDrawId } from '../probability/practice'
import type { MatCard } from '../probability/PracticeMat'
import type { PlayerSide } from './player-color'

/**
 * Una línea del registro del duelo: lo que hizo cada jugador (tus jugadas con tus palabras; las del rival, el cartel que se le muestra a quien mira), el comienzo de cada
 * turno y lo escrito en el chat, todo en el orden en que pasó. Lo que hace falta para sacarla si se deshace va en la línea (así sobrevive a recargar): `act`, el lugar de
 * mi jugada; `peer`, cuántas jugadas llevaba el rival al anotarla; `turn`, el número del turno.
 */
export type FeedEntry =
  | { id: string; kind: 'event'; side: PlayerSide; text: string; act?: number; peer?: number; /** El tipo de la carta de la jugada (su color de marco: `TypeMark`), si se sabe. */ frame?: FrameKind }
  | { id: string; kind: 'turn'; text: string; turn?: number }
  | { id: string; kind: 'chat'; line: ChatLine }

/** Una línea todavía sin su número. */
type NewEntry = FeedEntry extends infer Entry ? (Entry extends unknown ? Omit<Entry, 'id'> : never) : never

/** Cuántas líneas se guardan (el registro de un duelo largo no crece sin límite). */
const MAX_ENTRIES = 200

/** Jugadas que no se anotan: robar y cambiar de fase pasan muy seguido y el cambio de turno ya tiene su línea. */
const SILENT_ACTIONS = new Set(['draw', 'phase'])

const MAX_TEXT = 500
const isCount = (value: unknown) => value === undefined || (Number.isInteger(value) && (value as number) >= 0)

/** El registro guardado (`readDuelLog`), sólo con las líneas que tienen la forma de una; null si no hay uno. */
export function parseFeed(raw: unknown): FeedEntry[] | null {
  if (!Array.isArray(raw)) return null

  return raw.slice(-MAX_ENTRIES).filter((value): value is FeedEntry => {
    const row = value as Partial<Record<string, unknown>> | null

    if (typeof row !== 'object' || row === null || typeof row.id !== 'string' || row.id.length > 20) return false
    if (row.kind === 'chat') return isChatLine(row.line)

    const text = typeof row.text === 'string' && row.text.length <= MAX_TEXT

    return row.kind === 'turn' ? text && isCount(row.turn) : row.kind === 'event' && text && (row.side === 'mine' || row.side === 'theirs') && isCount(row.act) && isCount(row.peer) && (row.frame === undefined || (typeof row.frame === 'string' && Object.hasOwn(FRAME_FILL, row.frame)))
  })
}

/** El nombre de una carta del rival (su id real, el que él mostró) si es de las de mi deck (por su número); si no, no se sabe acá. */
export const rivalCardName = (cardsById: ReadonlyMap<string, MatCard>, real: string | undefined): string | undefined =>
  real === undefined ? undefined : [...cardsById].find(([drawId]) => cardIdOfDrawId(drawId) === cardIdOfDrawId(real))?.[1].name

interface FeedSources {
  snapshot: DuelSnapshot
  cardsById: ReadonlyMap<string, MatCard>
  /** El cartel de lo que el rival acaba de hacer (activar, mostrar, invocar, colocar…) o de su ataque: cambiar `key` anota una línea, y cambiar sólo el texto la corrige. */
  rivalCaptions: ReadonlyArray<{ key: number; caption: string } | undefined>
  /** De quién es el turno y cuál es: cada cambio anota el comienzo de un turno. */
  turn: 'mine' | 'theirs'
  turnNumber: number
  rivalName: string
  myName: string
  /** La sala y el rol: con ellos el registro se guarda y, al recargar, sigue como estaba. */
  save?: { room: string; role: DuelRole }
}

/**
 * El registro del duelo en orden: tus jugadas, lo que anuncia el rival, los cambios de vidas, los turnos y el chat. Lo que ya estaba jugado al abrir la pantalla (un duelo
 * que se retoma) no se anota de nuevo: con `save`, el registro guardado vuelve tal cual; sin él, sólo el chat. **Una jugada deshecha desaparece del registro** (Gastón,
 * 2026-10-19: «si le pido a mi oponente volver una jugada y acepta, debe desaparecer del timeline»): la tuya cuando el rival permite volver atrás (o sin rival, al
 * deshacer), la del rival cuando él deshace (`peerUndos`; que recargue no es deshacer), y con ella el comienzo de turno que había causado. Lo escrito en el chat se queda.
 */
export function useDuelFeed({ snapshot, cardsById, rivalCaptions, turn, turnNumber, rivalName, myName, save }: FeedSources): readonly FeedEntry[] {
  const { chat, actions, initial, me, peerUndos } = snapshot
  const lifeLog = snapshot.life.log
  const [entries, setEntries] = useState<readonly FeedEntry[]>(() => (save ? parseFeed(readDuelLog(save.room, save.role)) : null) ?? chat.map((line) => ({ id: `c${line.id}`, kind: 'chat', line })))
  // Los números de las líneas siguen después de las que volvieron de lo guardado.
  const next = useRef(Math.max(0, ...entries.map((entry) => (entry.id.startsWith('e') ? Number(entry.id.slice(1)) + 1 || 0 : 0))))
  const seenChat = useRef(chat.at(-1)?.id ?? 0)
  const seenActions = useRef(actions.length)
  const seenLife = useRef(lifeLog.length)
  // Cuántas jugadas lleva el rival (las que hizo desde que empezó, no las del espejo: ése se rearma de cero cuando él recarga).
  const peerMoves = useMemo(() => snapshot.order.filter((who) => who === 'peer').length, [snapshot.order])
  const seenUndos = useRef(peerUndos)
  // En esta pasada se deshizo una jugada (mía o del rival): sólo entonces un turno que baja de número es un turno deshecho y no un tropiezo de la sincronización.
  const undone = useRef(false)

  useLayoutEffect(() => {
    undone.current = false
  })
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
  const drop = (gone: (row: FeedEntry) => boolean) => setEntries((current) => (current.some(gone) ? current.filter((row) => !gone(row)) : current))

  // Lo que se ve se guarda con cada cambio: recargar no lo borra.
  const room = save?.room
  const role = save?.role

  useEffect(() => {
    if (room !== undefined && role !== undefined) writeDuelLog(room, role, entries)
  }, [entries, room, role])

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

    // Se deshizo: las jugadas que ya no están se van del registro con sus líneas.
    if (actions.length < before) {
      undone.current = true
      drop((row) => row.kind === 'event' && row.act !== undefined && row.act >= actions.length)
      return
    }

    if (!initial || actions.length <= before) return

    // Una carta del rival (su id opaco, como el objetivo de mi ataque: `c51`; o `f.c12`, una que controlo) se llama por la que él mostró, si es de las de mi deck (por su número); si no, no se sabe el nombre acá.
    const rivalCard = (opaque: string) => rivalCardName(cardsById, snapshot.theirs?.known[opaque]) ?? t('duel.announce.rivalCard')
    // Lo que no es una de mis cartas es del rival.
    const nameOf = (id: string) => (isForeignId(id) ? rivalCard(opaqueOfForeign(id)) : (cardsById.get(id)?.name ?? rivalCard(id)))
    const lines: NewEntry[] = []

    for (let index = before; index < actions.length; index += 1) {
      const action = actions[index]!

      if (SILENT_ACTIONS.has(action.type)) continue

      const card = 'id' in action ? cardsById.get(action.id) : undefined
      const kind = card?.apiCard ? frameKindOf(card.apiCard.frameType, card.apiCard.cardType).kind : 'neutral'
      const frame = kind === 'neutral' ? null : kind

      lines.push({ kind: 'event', side: 'mine', text: describeMatAction(replayMat(initial, actions, index), action, nameOf), act: index, ...(frame ? { frame } : {}) })
    }

    if (lines.length > 0) push(...lines)
  }, [actions, initial, cardsById, snapshot.theirs?.known])

  // Los cambios de vidas de los dos («Ana pierde 100 LP (7900)»): son públicos y no se deshacen con una jugada. Una revancha las vuelve a empezar sin anotar nada.
  useEffect(() => {
    const before = seenLife.current

    seenLife.current = lifeLog.length

    if (lifeLog.length <= before) return

    push(
      ...lifeLog.slice(before).map((change): NewEntry => {
        const mine = change.player === me
        const params = { name: rivalName, amount: Math.abs(change.delta), lp: change.to }

        return { kind: 'event', side: mine ? 'mine' : 'theirs', text: t(`duel.log.${mine ? 'mine' : 'rival'}${change.delta < 0 ? 'Lost' : 'Gained'}`, params) }
      }),
    )
  }, [lifeLog, me, rivalName])

  // Lo que el rival hace y se avisa (con su nombre ya dentro del texto). Si el mismo cartel gana después el nombre de la carta (se busca por su número), la línea se corrige.
  useEffect(() => {
    rivalCaptions.forEach((entry, index) => {
      if (!entry) return

      if (entry.key !== seenCaptions.current[index]) {
        seenCaptions.current[index] = entry.key

        const [line] = push({ kind: 'event', side: 'theirs', text: entry.caption, peer: peerMoves })

        captionLines.current[index] = line ? { id: line.id, text: entry.caption } : undefined
        return
      }

      const known = captionLines.current[index]

      if (known && known.text !== entry.caption) {
        known.text = entry.caption
        setEntries((current) => current.map((row) => (row.id === known.id && row.kind === 'event' ? { ...row, text: entry.caption } : row)))
      }
    })
  }, [rivalCaptions, peerMoves])

  // Si el rival deshace una jugada, las líneas de lo que él anunció después de la última que le queda se van.
  useEffect(() => {
    if (peerUndos === seenUndos.current) return

    seenUndos.current = peerUndos
    undone.current = true
    drop((row) => row.kind === 'event' && row.peer !== undefined && row.peer > peerMoves)
  }, [peerUndos, peerMoves])

  // El comienzo de cada turno; si un turno se deshace (volver atrás desde su comienzo), su línea se va y, al volver a pasar, se anota de nuevo.
  useEffect(() => {
    if (turnNumber < seenTurn.current) {
      if (!undone.current) return

      seenTurn.current = turnNumber
      drop((row) => row.kind === 'turn' && row.turn !== undefined && row.turn > turnNumber)
      return
    }

    if (turnNumber === seenTurn.current) return

    seenTurn.current = turnNumber
    push({ kind: 'turn', text: t('duel.log.turn', { turn: turnNumber, name: turn === 'mine' ? myName : rivalName }), turn: turnNumber })
  }, [turnNumber, turn, myName, rivalName])

  return entries
}

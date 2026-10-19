import { useEffect, useLayoutEffect, useRef, useState } from 'react'

import type { ChatLine } from '../../app/duel-games'
import type { DuelSnapshot } from '../../app/duel-session'
import { opaqueOfForeign } from '../../app/mat-control'
import { describeMatAction, isForeignId, replayMat } from '../../app/practice-mat'
import { t } from '../../i18n'
import { cardIdOfDrawId } from '../probability/practice'
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
 * no se anota, salvo el chat. **Una jugada deshecha desaparece del registro** (Gastón, 2026-10-19: «si le pido a mi oponente volver una jugada y acepta, debe desaparecer del timeline»):
 * la tuya cuando el rival permite volver atrás (o sin rival, al deshacer), la del rival cuando él deshace, y con ella el comienzo de turno que había causado. Lo escrito en el chat se queda.
 */
export function useDuelFeed({ snapshot, cardsById, rivalCaptions, turn, turnNumber, rivalName, myName }: FeedSources): readonly FeedEntry[] {
  const { chat, actions, initial } = snapshot
  const [entries, setEntries] = useState<readonly FeedEntry[]>(() => chat.map((line) => ({ id: `c${line.id}`, kind: 'chat', line })))
  const next = useRef(0)
  const seenChat = useRef(chat.at(-1)?.id ?? 0)
  const seenActions = useRef(actions.length)
  // Qué línea del registro es la de cada una de mis jugadas (por su lugar en mi lista: las silenciosas no tienen), para sacarla si se deshace.
  const actionLines = useRef<Array<string | undefined>>([])
  // Lo mismo con el rival: la línea de cada cartel suyo y con cuántas jugadas suyas había cuando se anotó; si él deshace, las que ya no existen se van.
  const peerActs = snapshot.theirs?.acts.length ?? 0
  const captionActs = useRef<Map<string, number>>(new Map())
  // El comienzo de cada turno que se anotó, por número de turno.
  const turnLines = useRef<Map<number, string>>(new Map())
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
      const gone = new Set(actionLines.current.slice(actions.length).filter((id): id is string => id !== undefined))

      actionLines.current = actionLines.current.slice(0, actions.length)

      if (gone.size > 0) setEntries((current) => current.filter((row) => !gone.has(row.id)))

      return
    }

    if (!initial || actions.length <= before) return

    // Una carta del rival que controlo (`f.c12`) se llama por la que él mostró, si es de las de mi deck (por su número); si no, no se sabe el nombre acá.
    const foreignName = (id: string) => {
      const real = snapshot.theirs?.known[opaqueOfForeign(id)]
      const same = real === undefined ? undefined : [...cardsById].find(([drawId]) => cardIdOfDrawId(drawId) === cardIdOfDrawId(real))

      return same?.[1].name ?? t('duel.mark.rivalCard')
    }
    const nameOf = (id: string) => (isForeignId(id) ? foreignName(id) : (cardsById.get(id)?.name ?? t('duel.announce.yourCard')))
    const lines: Array<{ index: number; entry: NewEntry }> = []

    for (let index = before; index < actions.length; index += 1) {
      const action = actions[index]!

      if (SILENT_ACTIONS.has(action.type)) continue

      lines.push({ index, entry: { kind: 'event', side: 'mine', text: describeMatAction(replayMat(initial, actions, index), action, nameOf) } })
    }

    if (lines.length > 0) {
      const stamped = push(...lines.map(({ entry }) => entry))

      // Lo que ya estaba jugado antes de empezar a mirar no tiene línea (queda sin anotar): el arreglo se rellena hasta el lugar de cada jugada nueva.
      lines.forEach(({ index }, at) => {
        while (actionLines.current.length < index) actionLines.current.push(undefined)

        actionLines.current[index] = stamped[at]?.id
      })
    }
  }, [actions, initial, cardsById, snapshot.theirs?.known])

  // Lo que el rival hace y se avisa (con su nombre ya dentro del texto). Si el mismo cartel gana después el nombre de la carta (se busca por su número), la línea se corrige.
  useEffect(() => {
    rivalCaptions.forEach((entry, index) => {
      if (!entry) return

      if (entry.key !== seenCaptions.current[index]) {
        seenCaptions.current[index] = entry.key

        const [line] = push({ kind: 'event', side: 'theirs', text: entry.caption })

        captionLines.current[index] = line ? { id: line.id, text: entry.caption } : undefined
        if (line) captionActs.current.set(line.id, peerActs)
        return
      }

      const known = captionLines.current[index]

      if (known && known.text !== entry.caption) {
        known.text = entry.caption
        setEntries((current) => current.map((row) => (row.id === known.id && row.kind === 'event' ? { ...row, text: entry.caption } : row)))
      }
    })
  }, [rivalCaptions, peerActs])

  // Si el rival deshace una jugada, las líneas de lo que él anunció después de la última que le queda se van.
  useEffect(() => {
    const gone = new Set([...captionActs.current].filter(([, acts]) => acts > peerActs).map(([id]) => id))

    if (gone.size === 0) return

    undone.current = true
    gone.forEach((id) => captionActs.current.delete(id))
    setEntries((current) => current.filter((row) => !gone.has(row.id)))
  }, [peerActs])

  // El comienzo de cada turno; si un turno se deshace (volver atrás desde su comienzo), su línea se va y, al volver a pasar, se anota de nuevo.
  useEffect(() => {
    if (turnNumber < seenTurn.current) {
      if (!undone.current) return

      const gone = new Set([...turnLines.current].filter(([number]) => number > turnNumber).map(([, id]) => id))

      ;[...turnLines.current.keys()].filter((number) => number > turnNumber).forEach((number) => turnLines.current.delete(number))
      seenTurn.current = turnNumber

      if (gone.size > 0) setEntries((current) => current.filter((row) => !gone.has(row.id)))

      return
    }

    if (turnNumber === seenTurn.current) return

    seenTurn.current = turnNumber

    const [line] = push({ kind: 'turn', text: t('duel.log.turn', { turn: turnNumber, name: turn === 'mine' ? myName : rivalName }) })

    if (line) turnLines.current.set(turnNumber, line.id)
  }, [turnNumber, turn, myName, rivalName])

  return entries
}

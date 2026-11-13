import { useEffect, useMemo, useState } from 'react'
import { actingOf, linksOf, medalsOf } from '../../app/card-glow'
import { createMatState, isToken } from '../../app/practice-mat'
import { comboChainSteps, comboTheirReal, comboTheirsAt, type SavedCombo } from '../../app/saved-combos'
import { ChainStage, chainDwell, chainFeed, outcomeLabel, stepsUpTo } from '../auto/ChainNotice'
import { artOfDrawId } from '../duel/duel-art'
import { DUEL_AREAS, SideCells, sharedZoneCard, TheirHand, type DuelSideView } from '../duel/DuelTable'
import type { DuelMatLink } from './PracticeMat'

/** Lo que la mesa manual dibuja de un combo grabado en «Jugar solo automático»: las mismas piezas que el repaso del automático le pasa a la mesa (`reviewRival` y la cadena de `use-auto-asks`). */
export type ComboScene = Pick<DuelMatLink, 'areas' | 'opponent' | 'sharedZone' | 'rivalHand' | 'act' | 'links' | 'medals' | 'chain'>

const NO_RIVAL = createMatState([], [], 0)

/**
 * El campo del rival y la cadena de un combo que los trae (`theirs`, `chain`), en el paso `cursor`, para la mesa manual (el enlace compartido, Replays, «Tus combos»): como en el repaso del
 * automático, un paso adelante cuenta la cadena de ese paso con su ritmo (`chainDwell`) y saltar a otro la corta. Lo del rival es lo que vio quien lo grabó (su mano y su deck, de dorso).
 * Sin `theirs` ni `chain`, null: la mesa queda como siempre.
 */
export function useComboScene(combo: Pick<SavedCombo, 'theirs' | 'chain'> | null, cursor: number, nameOf: (id: string) => string, artOf: (id: string) => string | null): ComboScene | null {
  const chain = combo?.chain
  const steps = useMemo(() => (chain ? comboChainSteps({ chain }) : null), [chain])
  const [paced, setPaced] = useState<{ steps: typeof steps; at: number; seen: number; cut: boolean; gone: number } | null>(null)

  if (steps === null ? paced !== null : paced?.steps !== steps || paced.at !== cursor) {
    if (steps === null) setPaced(null)
    else {
      const due = stepsUpTo(steps, cursor)
      const stepped = paced !== null && paced.steps === steps && cursor === paced.at + 1
      let seen = stepped ? stepsUpTo(steps, paced.at) : due

      if (seen < due) seen += 1
      while (seen < due && chainDwell(steps, seen - 1) === 0) seen += 1
      const whole = chainFeed(steps, due)

      setPaced({ steps, at: cursor, seen, cut: !stepped, gone: stepped ? paced.gone : whole?.done ? whole.key : -1 })
    }
  }
  useEffect(() => {
    if (!paced || paced.cut || !paced.steps) return
    const { steps: list } = paced
    const due = stepsUpTo(list, paced.at)

    if (paced.seen >= due) return
    const timer = window.setTimeout(() => {
      let next = paced.seen + 1

      while (next < due && chainDwell(list, next - 1) === 0) next += 1
      setPaced((current) => (current === paced ? { ...current, seen: next } : current))
    }, chainDwell(list, paced.seen - 1))

    return () => window.clearTimeout(timer)
  }, [paced])

  const feed = useMemo(() => (paced?.steps && !paced.cut ? chainFeed(paced.steps, paced.seen) : null), [paced])
  const live = feed && !(feed.done && paced?.gone === feed.key) ? feed : null
  const acting = useMemo(() => actingOf(live), [live])
  const links = useMemo(() => linksOf(live), [live])
  const medals = useMemo(() => medalsOf(live), [live])
  const theirs = combo?.theirs

  return useMemo(() => {
    if (!theirs && !steps) return null
    const at = comboTheirsAt(theirs, cursor)
    const state = at?.state ?? NO_RIVAL
    // Las cartas del rival que se vieron (y las tuyas que le diste), con su arte; lo demás, de dorso.
    const artOfRival = (id: string) => {
      const real = isToken(id) ? id : at ? comboTheirReal(id, at.known) : null
      return real ? (artOf(real) ?? artOfDrawId(real)) : null
    }
    const side: DuelSideView = { state, artOf: artOfRival, handCount: state.hand.length, act: acting.theirs, links: links.theirs, medals: medals.theirs }
    const rows = (live?.rows ?? []).map((row) => ({
      number: row.number,
      mine: row.mine,
      name: nameOf(`card-${row.code}-1`),
      art: row.code ? (artOf(`card-${row.code}-1`) ?? artOfDrawId(`card-${row.code}-1`)) : null,
      state: row.state,
      ...(row.by ? { by: row.by } : {}),
      ...(row.outcome ? { outcome: outcomeLabel(row.outcome) } : {}),
    }))

    return {
      areas: DUEL_AREAS,
      opponent: <SideCells side={side} owner="theirs" />,
      sharedZone: (index: number) => sharedZoneCard(side, index),
      rivalHand: <TheirHand count={state.hand.length} medals={medals.theirs.get('hand') ?? null} />,
      act: acting.mine,
      links: links.mine,
      medals: medals.mine,
      chain: live ? <ChainStage key={live.key} rows={rows} current={live.current} done={live.done} /> : null,
    }
  }, [theirs, steps, cursor, live, acting, links, medals, nameOf, artOf])
}

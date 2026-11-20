import { useMemo } from 'react'
import type { ChainStep } from '../../app/auto/chain-feed'
import { actingOf, linksOf, medalsOf } from '../../app/card-glow'
import { createMatState, isToken } from '../../app/practice-mat'
import { comboChainSteps, comboTheirReal, comboTheirsAt, type SavedCombo } from '../../app/saved-combos'
import { ChainStage, chainFeed, outcomeLabel, usePacedChain } from '../auto/ChainNotice'
import { artOfDrawId } from '../duel/duel-art'
import { DUEL_AREAS, SideCells, sharedZoneCard, TheirHand, type DuelSideView } from '../duel/DuelTable'
import type { DuelMatLink } from './PracticeMat'

/** Lo que la mesa manual dibuja de un combo grabado en «Jugar solo automático»: las mismas piezas que el repaso del automático le pasa a la mesa (`reviewRival` y la cadena de `use-auto-asks`). */
export type ComboScene = Pick<DuelMatLink, 'areas' | 'opponent' | 'sharedZone' | 'rivalHand' | 'act' | 'links' | 'medals' | 'chain' | 'rivalFlights'>

const NO_RIVAL = createMatState([], [], 0)
const NO_STEPS: ChainStep[] = []

/**
 * El campo del rival y la cadena de un combo que los trae (`theirs`, `chain`), en el paso `cursor`, para la mesa manual (el enlace compartido, Replays, «Tus combos»): como en el repaso del
 * automático, un paso adelante cuenta la cadena de ese paso con su ritmo (`chainDwell`) y saltar a otro la corta. Lo del rival es lo que vio quien lo grabó (su mano y su deck, de dorso).
 * Sin `theirs` ni `chain`, null: la mesa queda como siempre.
 */
export function useComboScene(combo: Pick<SavedCombo, 'theirs' | 'chain'> | null, cursor: number, nameOf: (id: string) => string, artOf: (id: string) => string | null): ComboScene | null {
  const chain = combo?.chain
  const steps = useMemo(() => (chain ? comboChainSteps({ chain }) : null), [chain])
  // Un combo con otra cadena la corta (`key`).
  const [paced] = usePacedChain(steps ?? NO_STEPS, steps ? cursor : null, steps)

  const feed = useMemo(() => (steps && paced && !paced.cut ? chainFeed(steps, paced.seen) : null), [steps, paced])
  const live = feed && !(feed.done && paced?.gone === feed.key) ? feed : null
  const acting = useMemo(() => actingOf(live), [live])
  const links = useMemo(() => linksOf(live), [live])
  const medals = useMemo(() => medalsOf(live), [live])
  const theirs = combo?.theirs
  // Por paso, no por dibujo: la mesa del rival cambia sólo con el paso (la cadena que avanza no la vuelve a medir).
  const at = useMemo(() => comboTheirsAt(theirs, cursor), [theirs, cursor])

  return useMemo(() => {
    if (!theirs && !steps) return null
    const state = at?.state ?? NO_RIVAL
    // Las cartas del rival que se vieron (y las tuyas que le diste), con su arte; lo demás, de dorso.
    const artOfRival = (id: string) => {
      const real = isToken(id) ? id : at ? comboTheirReal(id, at.known) : null
      return real ? (artOf(real) ?? artOfDrawId(real)) : null
    }
    const side: DuelSideView = { state, artOf: artOfRival, handCount: state.hand.length, act: acting.theirs, links: links.theirs, medals: medals.theirs }
    // Sus vuelos y sus escenas, como en el duelo: la jugada que hizo en este paso, si fue una sola (con sus marcas: el Péndulo, el Sacrificio, la destruida).
    const played = theirs?.steps.filter(([when]) => when === cursor) ?? []
    const action = played.length === 1 ? played[0]![1] : undefined
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
      ...(at ? { rivalFlights: { state, artOf: artOfRival, ...(action ? { action } : {}) } } : {}),
    }
  }, [theirs, steps, cursor, at, live, acting, links, medals, nameOf, artOf])
}

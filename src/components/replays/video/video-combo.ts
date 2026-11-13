import type { SharedCombo } from '../../../app/combo-share'
import { isRivalId, rivalCardOf } from '../../../app/handtraps'
import { matEffects } from '../../../app/mat-effects'
import { describeMatAction, isForeignId, isToken, matReducer, type MatState } from '../../../app/practice-mat'
import { comboCardIds, comboTheirReal, comboTheirsAt, type SavedCombo } from '../../../app/saved-combos'
import { t } from '../../../i18n'
import { passcodeOfDrawId } from '../../duel/duel-art'
import { artOfId, cellsOf, duelRows, explainOf, fieldArtUrl, focusOf, halfOf, handSlots, sideSlots, VIDEO_FOOTER, VIDEO_HEIGHT_OF, videoLayout, type Look, type Scene, type SceneSide, type VideoLayout } from './video-scene'

/**
 * El video de un combo de la práctica: la mesa del video de un duelo (`videoLayout`, todo el lienzo: sin aire abajo), con tu campo abajo y tu mano boca arriba (el combo es tuyo
 * y la mesa te la muestra). Arriba, el nombre del combo y el del deck en vez de vidas y turno (un combo no los tiene). El lado del rival: si se grabó en «Jugar solo automático» y
 * su campo tuvo algo (`theirs`: una carta que le diste), su campo y su mano de dorso; si se grabó con el simulador de handtraps, su «Mano del rival» boca arriba como en la mesa
 * (las que ya usó, atenuadas); si no, sus casillas vacías. Lo demás (las transiciones, el aro ámbar, la jugada en texto, la marca) es lo del video del duelo. Puro.
 */

type Combo = SavedCombo | SharedCombo

/** El lienzo del combo: el del duelo; con la «Mano del rival» del simulador, su franja más baja y más chica, para que su rótulo entre debajo del título. */
export function comboLayout(width: number, rival: boolean): VideoLayout {
  const layout = videoLayout(width)
  const s = layout.scale
  return rival ? { ...layout, theirHand: { x: 64 * s, y: 130 * s, w: 592 * s, h: 62 * s } } : layout
}

/**
 * Cómo se ve cada carta del combo: su arte y su nombre (los de `names`; una handtrap del rival, la carta de su id; una del rival que controlás, la que se vio de ella en `known`
 * o, sin saber cuál, «Carta»).
 */
export function comboLook(names: Readonly<Record<string, string>>, known: Readonly<Record<string, string>> = {}): Look {
  const unknown = t('practice.card.unknown')
  return (id) => {
    const real = isForeignId(id) ? known[id.slice(2)] : isRivalId(id) ? rivalCardOf(id) : id
    if (!real) return { art: null, name: unknown }
    return { art: artOfId(real), name: names[id] ?? names[real] ?? (isToken(id) ? t('practice.token.the') : unknown) }
  }
}

/** Cómo se ve una carta del lado del rival (`theirs` del combo): una tuya que controla, la tuya; una suya, la que se vio (`known`); si no se sabe, de dorso. */
export function comboTheirLook(names: Readonly<Record<string, string>>, known: Readonly<Record<string, string>>): Look {
  return (id) => {
    const real = isToken(id) ? id : comboTheirReal(id, known)
    return real ? { art: artOfId(real), name: names[real] ?? (isToken(id) ? t('practice.token.the') : t('practice.card.unknown')) } : null
  }
}

/** Los nombres que faltan (un combo abierto por enlace no los trae: el enlace corto los saca), pedidos por passcode como hace la mesa. Sin red, quedan los que había. */
export async function resolveComboNames(combo: Combo, fetchNames: (codes: number[]) => Promise<Map<number, string>>): Promise<Record<string, string>> {
  const missing = comboCardIds(combo.initial, combo).filter((id) => !isToken(id) && !combo.names[id])
  const codes = [...new Set(missing.flatMap((id) => passcodeOfDrawId(rivalCardOf(id)) ?? []))]
  if (codes.length === 0) return combo.names
  try {
    const found = await fetchNames(codes)
    const filled = Object.fromEntries(missing.flatMap((id) => {
      const name = found.get(passcodeOfDrawId(rivalCardOf(id)) ?? -1)
      return name ? [[id, name] as const] : []
    }))
    return { ...filled, ...combo.names }
  } catch {
    return combo.names
  }
}

const emptySide = (hand: SceneSide['hand'] = []): SceneSide => ({ name: '', lp: 0, slots: [], hand })

/** La escena del combo después de `cursor` jugadas; `before` es la mesa de antes de esa jugada (para el texto y lo que se resalta). */
export function comboSceneAt(combo: Combo, state: MatState, cursor: number, before: MatState | null, names: Readonly<Record<string, string>>, width: number): Scene {
  const rival = state.rival
  const layout = comboLayout(width, (combo.initial.rival?.hand.length ?? 0) > 0)
  const opponent = comboTheirsAt(combo.theirs, cursor)
  const look = comboLook(names, opponent?.known)
  const action = cursor > 0 ? combo.actions[cursor - 1] : undefined
  const shown = action?.type === 'reveal' ? action.id : null
  const rows = duelRows(0)
  const mine: SceneSide = {
    ...emptySide(handSlots(state.hand, layout.myHand, look, () => true)),
    slots: sideSlots(state, layout, rows, false, look, shown),
    fieldArt: state.field && !isForeignId(state.field.id) ? fieldArtUrl(state.field, isRivalId(state.field.id) ? rivalCardOf(state.field.id) : state.field.id) : null,
    half: halfOf(layout, rows),
  }
  const simulated = rival ? handSlots(rival.hand, layout.theirHand, look, () => true).map((slot) => ({ ...slot, card: { ...slot.card!, dim: rival.used.includes(slot.ids[0]!) } })) : []
  const theirs: SceneSide = opponent
    ? (() => {
        const theirLook = comboTheirLook(names, opponent.known)
        const field = opponent.state.field
        return {
          ...emptySide(handSlots(opponent.state.hand, layout.theirHand, theirLook, () => false, true)),
          slots: sideSlots(opponent.state, layout, duelRows(1), true, theirLook, null),
          fieldArt: field ? fieldArtUrl(field, isToken(field.id) ? null : comboTheirReal(field.id, opponent.known)) : null,
          half: halfOf(layout, duelRows(1)),
        }
      })()
    : emptySide(simulated)
  const nameOf = (id: string) => look(id)?.name ?? t('practice.card.unknown')
  // Lo que tocó la jugada, en tu campo, tu mano o la mano del rival del simulador (una handtrap que usó).
  const focus = action && before && action.type !== 'phase' ? focusOf(action, before, state, { ...mine, hand: [...mine.hand, ...simulated] }, theirs) : []
  const effects = action && before ? matEffects(before, action) : null

  return {
    width,
    height: VIDEO_HEIGHT_OF(width),
    sides: [mine, theirs],
    turn: 0,
    turnText: '',
    phase: state.phase,
    actor: action ? 0 : null,
    action: action ?? null,
    effects,
    stepLabel: cursor === 0 ? t('meta.duels.start') : t('meta.duels.step', { n: cursor, total: combo.actions.length }),
    stepText: action && before ? describeMatAction(before, action, nameOf) : '',
    explain: action && before && effects ? explainOf(before, action, effects, nameOf) : null,
    focus,
    footer: VIDEO_FOOTER(),
    cells: cellsOf(layout, 5),
    heading: { title: combo.name, subtitle: combo.deckName },
    ...(rival && rival.hand.length > 0 ? { caption: { text: t('handtraps.strip.label'), rect: { x: layout.theirHand.x, y: layout.theirHand.y - 22 * layout.scale, w: layout.theirHand.w, h: 18 * layout.scale } } } : {}),
    layout,
  }
}

/** La escena de cada cursor, en orden (0 = la mesa inicial del combo): las jugadas se aplican una por una con `matReducer`, como al reproducirlo en la mesa. */
export function* comboScenes(combo: Combo, names: Readonly<Record<string, string>>, width: number): Generator<Scene> {
  let state = combo.initial
  yield comboSceneAt(combo, state, 0, null, names, width)
  for (let cursor = 1; cursor <= combo.actions.length; cursor += 1) {
    const before = state
    state = matReducer(state, combo.actions[cursor - 1]!)
    yield comboSceneAt(combo, state, cursor, before, names, width)
  }
}

/** Las imágenes del combo: las de sus cartas (las del rival del simulador, por la carta de su id; las del rival del automático que se vieron) y la de la ficha. */
export const comboArtUrls = (combo: Combo) => [...new Set([...comboCardIds(combo.initial, combo).map((id) => artOfId(rivalCardOf(id))), artOfId('token-0')].flatMap((url) => url ?? []))]

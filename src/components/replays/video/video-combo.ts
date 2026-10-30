import type { SharedCombo } from '../../../app/combo-share'
import { isRivalId, rivalCardOf } from '../../../app/handtraps'
import { matEffects } from '../../../app/mat-effects'
import { describeMatAction, isForeignId, isToken, matReducer, type MatState } from '../../../app/practice-mat'
import { comboCardIds, type SavedCombo } from '../../../app/saved-combos'
import { t } from '../../../i18n'
import { passcodeOfDrawId } from '../../duel/duel-art'
import { artOfId, cellsOf, focusOf, handSlots, sideSlots, VIDEO_FOOTER, VIDEO_HEIGHT_OF, type Look, type Rect, type Scene, type SceneSide, type VideoLayout } from './video-scene'

/**
 * El video de un combo de la práctica: es de un solo jugador, así que va **tu campo grande** (las Zonas Extra arriba, tus monstruos, tus Mágicas y Trampas y tus
 * pilas, como la mitad de abajo de la mesa del celular) y tu mano abajo, boca arriba (el combo es tuyo y la mesa te la muestra). Arriba, el nombre del combo y el del deck en
 * vez de vidas y turno (un combo no los tiene). Si se grabó con el simulador de handtraps, su «Mano del rival» va arriba del campo, boca arriba como en la mesa, y las que ya usó,
 * atenuadas. Lo demás (las transiciones, el aro ámbar, la jugada en texto, la marca) es lo del video del duelo. Puro.
 */

const BASE_W = 720
type Combo = SavedCombo | SharedCombo

/** El lienzo del combo: con la mano del rival del simulador, el campo baja para dejarle su franja. */
export function comboLayout(width: number, rival: boolean): VideoLayout {
  const s = width / BASE_W
  const cell = 124 * s
  const gap = 10 * s
  const x0 = (width - (5 * cell + 4 * gap)) / 2
  const y0 = (rival ? 290 : 200) * s
  const box = (x: number, y: number, w: number, h: number): Rect => ({ x: x * s, y: y * s, w: w * s, h: h * s })
  // La fila 0 es la del medio de la mesa (las Zonas Extra); después, tus monstruos, tus Mágicas y Trampas y tus pilas.
  const handTop = y0 / s + 4 * 124 + 3 * 10 + 26
  return {
    scale: s,
    score: box(24, 24, 672, 84),
    theirHand: box(64, 150, 592, 110),
    myHand: box(40, handTop, 640, 180),
    text: box(24, 1156, 672, 84),
    footer: box(24, 1244, 672, 28),
    cell,
    cellAt: (row, col) => ({ x: x0 + col * (cell + gap), y: y0 + row * (cell + gap), w: cell, h: cell }),
    middle: 0,
  }
}

/** Cómo se ve cada carta del combo: su arte y su nombre (los de \`names\`; una handtrap del rival, la carta de su id; una del rival que controlás, sin saber cuál: «Carta»). */
export function comboLook(names: Readonly<Record<string, string>>): Look {
  const unknown = t('practice.card.unknown')
  return (id) => {
    if (isForeignId(id)) return { art: null, name: unknown }
    const real = isRivalId(id) ? rivalCardOf(id) : id
    return { art: artOfId(real), name: names[id] ?? names[real] ?? (isToken(id) ? t('practice.token.the') : unknown) }
  }
}

/** Los nombres que faltan (un combo abierto por enlace no los trae: el enlace corto los saca), pedidos por passcode como hace la mesa. Sin red, quedan los que había. */
export async function resolveComboNames(combo: Combo, fetchNames: (codes: number[]) => Promise<Map<number, string>>): Promise<Record<string, string>> {
  const missing = comboCardIds(combo.initial).filter((id) => !isToken(id) && !combo.names[id])
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

/** La escena del combo después de \`cursor\` jugadas; \`before\` es la mesa de antes de esa jugada (para el texto y lo que se resalta). */
export function comboSceneAt(combo: Combo, state: MatState, cursor: number, before: MatState | null, look: Look, width: number): Scene {
  const rival = state.rival
  const layout = comboLayout(width, (combo.initial.rival?.hand.length ?? 0) > 0)
  const action = cursor > 0 ? combo.actions[cursor - 1] : undefined
  const shown = action?.type === 'reveal' ? action.id : null
  const mine: SceneSide = {
    ...emptySide(handSlots(state.hand, layout.myHand, look, () => true)),
    slots: sideSlots(state, layout, { piles: 3, st: 2, mz: 1 }, false, look, shown),
  }
  const theirs = emptySide(
    rival
      ? handSlots(rival.hand, layout.theirHand, look, () => true).map((slot) => ({ ...slot, card: { ...slot.card!, dim: rival.used.includes(slot.ids[0]!) } }))
      : [],
  )
  const nameOf = (id: string) => look(id)?.name ?? t('practice.card.unknown')
  // Lo que tocó la jugada, en tu campo, tu mano o la mano del rival del simulador (una handtrap que usó).
  const focus = action && before && action.type !== 'phase' ? focusOf(action, before, state, { ...mine, hand: [...mine.hand, ...theirs.hand] }, theirs) : []

  return {
    width,
    height: VIDEO_HEIGHT_OF(width),
    sides: [mine, theirs],
    turn: 0,
    turnText: '',
    phase: state.phase,
    actor: action ? 0 : null,
    action: action ?? null,
    effects: action && before ? matEffects(before, action) : null,
    stepLabel: cursor === 0 ? t('meta.duels.start') : t('meta.duels.step', { n: cursor, total: combo.actions.length }),
    stepText: action && before ? describeMatAction(before, action, nameOf) : '',
    focus,
    footer: VIDEO_FOOTER(),
    cells: cellsOf(layout, 4),
    heading: { title: combo.name, subtitle: combo.deckName },
    ...(rival && rival.hand.length > 0 ? { caption: { text: t('handtraps.strip.label'), rect: { x: layout.theirHand.x, y: layout.theirHand.y - 26 * layout.scale, w: layout.theirHand.w, h: 20 * layout.scale } } } : {}),
    layout,
  }
}

/** La escena de cada cursor, en orden (0 = la mesa inicial del combo): las jugadas se aplican una por una con \`matReducer\`, como al reproducirlo en la mesa. */
export function* comboScenes(combo: Combo, names: Readonly<Record<string, string>>, width: number): Generator<Scene> {
  const look = comboLook(names)
  let state = combo.initial
  yield comboSceneAt(combo, state, 0, null, look, width)
  for (let cursor = 1; cursor <= combo.actions.length; cursor += 1) {
    const before = state
    state = matReducer(state, combo.actions[cursor - 1]!)
    yield comboSceneAt(combo, state, cursor, before, look, width)
  }
}

/** Las imágenes del combo: las de sus cartas (las del rival del simulador, por la carta de su id) y la de la ficha. */
export const comboArtUrls = (combo: Combo) => [...new Set([...comboCardIds(combo.initial).map((id) => artOfId(rivalCardOf(id))), artOfId('token-0')].flatMap((url) => url ?? []))]

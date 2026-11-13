import type { SharedCombo } from '../../../app/combo-share'
import { isRivalId, rivalCardOf } from '../../../app/handtraps'
import { matEffects } from '../../../app/mat-effects'
import { describeMatAction, isForeignId, isToken, matReducer, type MatState } from '../../../app/practice-mat'
import { comboCardIds, comboTheirReal, comboTheirsAt, type SavedCombo } from '../../../app/saved-combos'
import { t } from '../../../i18n'
import { passcodeOfDrawId } from '../../duel/duel-art'
import { artOfId, cellsOf, duelRows, explainOf, fieldArtUrl, fieldGrid, focusOf, halfOf, handSlots, sideSlots, VIDEO_FOOTER, VIDEO_HEIGHT_OF, videoLayout, type Look, type Rect, type Scene, type SceneSide, type VideoLayout } from './video-scene'

/**
 * El video de un combo de la práctica: va **tu campo** (las Zonas Extra arriba, tus monstruos y tus Mágicas y Trampas, con las pilas a los costados: la mitad de abajo de la mesa
 * del celular) y tu mano abajo, boca arriba (el combo es tuyo y la mesa te la muestra). Arriba, el nombre del combo y el del deck en vez de vidas y turno (un combo no los tiene).
 * Si se grabó con el simulador de handtraps, su «Mano del rival» va arriba del campo, boca arriba como en la mesa, y las que ya usó, atenuadas. Si se grabó en «Jugar solo
 * automático» y el rival tuvo algo en su campo (`theirs`: una carta que le diste), va la mesa entera como en el video de un duelo, con su campo arriba. Lo demás (las transiciones,
 * el aro ámbar, la jugada en texto, la marca) es lo del video del duelo. Puro.
 */

const BASE_W = 720
type Combo = SavedCombo | SharedCombo

/** El lienzo del combo: con la mano del rival del simulador, el campo baja para dejarle su franja. */
export function comboLayout(width: number, rival: boolean): VideoLayout {
  const s = width / BASE_W
  // El campo sube hasta abajo del título (o de la mano del rival): lo que queda abajo de tu mano es la franja que explica la jugada.
  const top = rival ? 266 : 150
  const box = (x: number, y: number, w: number, h: number): Rect => ({ x: x * s, y: y * s, w: w * s, h: h * s })
  // La fila 0 es la del medio de la mesa (las Zonas Extra y tu Banish); después, tus monstruos y tus Mágicas y Trampas, con las pilas a los costados.
  const grid = fieldGrid(width, top * s)
  const last = grid.cellAt(2, 1)
  const handTop = (last.y + last.h) / s + 34
  const textTop = handTop + 180 + 34
  return {
    scale: s,
    score: box(24, 24, 672, 84),
    theirHand: box(64, 142, 592, 100),
    myHand: box(40, handTop, 640, 180),
    text: box(24, textTop, 672, 1236 - textTop),
    footer: box(24, 1244, 672, 28),
    ...grid,
    middle: 0,
  }
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

/** Con la mesa entera (el campo del rival arriba, como el video de un duelo) o sólo tu mitad. */
const fullTable = (combo: Combo) => combo.theirs !== undefined

/** La escena del combo después de `cursor` jugadas; `before` es la mesa de antes de esa jugada (para el texto y lo que se resalta). */
export function comboSceneAt(combo: Combo, state: MatState, cursor: number, before: MatState | null, names: Readonly<Record<string, string>>, width: number): Scene {
  const rival = state.rival
  const full = fullTable(combo)
  const layout = full ? videoLayout(width) : comboLayout(width, (combo.initial.rival?.hand.length ?? 0) > 0)
  const opponent = comboTheirsAt(combo.theirs, cursor)
  const look = comboLook(names, opponent?.known)
  const action = cursor > 0 ? combo.actions[cursor - 1] : undefined
  const shown = action?.type === 'reveal' ? action.id : null
  const rows = full ? duelRows(0) : { mz: 1, st: 2 }
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
    cells: full ? cellsOf(layout, 5) : cellsOf(layout, 3, false),
    heading: { title: combo.name, subtitle: combo.deckName },
    ...(rival && rival.hand.length > 0 ? { caption: { text: t('handtraps.strip.label'), rect: { x: layout.theirHand.x, y: layout.theirHand.y - 26 * layout.scale, w: layout.theirHand.w, h: 20 * layout.scale } } } : {}),
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

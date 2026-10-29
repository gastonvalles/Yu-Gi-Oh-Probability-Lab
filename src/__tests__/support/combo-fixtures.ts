import metaDecklists from '../../data/meta-decklists.json'
import { createMatState, matReducer, type MatAction, type MatState } from '../../app/practice-mat'
import { createSavedCombo, type SavedCombo } from '../../app/saved-combos'
import { random, randomAction } from './random-mat'

/** El combo de referencia de `combo-share.test.ts`: 40 cartas de passcodes de 8 cifras, 15 en el Extra, la mano de 5, el rival simulado y 45 jugadas. */
export function referenceCombo(): SavedCombo {
  const passcodes = Array.from({ length: 14 }, (_, i) => 14558127 + i * 7_919_311)
  const deck = Array.from({ length: 40 }, (_, i) => `card-${passcodes[i % 14]}-${Math.floor(i / 14) + 1}`)
  const extra = Array.from({ length: 15 }, (_, i) => `card-${90_000_000 + i * 12_347}-1`)
  const initial = { ...createMatState(deck, extra, 5), rival: { hand: ['rival.card-14558127-1', 'rival.card-59438930-1'], used: [] } }
  const hand = initial.hand
  const actions: MatAction[] = []
  for (let i = 0; actions.length < 45; i++) {
    const turn: MatAction[] = [
      { type: 'phase', phase: 'main1' },
      { type: 'place', id: hand[i % 5]!, zone: 'mz', index: i % 5, pos: 'atk', how: 'normal' },
      { type: 'activate', id: hand[i % 5]!, effect: 1 },
      { type: 'move', id: deck[10 + i]!, to: 'hand' },
      { type: 'summon', id: extra[i % 15]!, how: 'link', materials: [hand[i % 5]!], zone: 'emz', index: 0, pos: 'atk' },
      { type: 'batch', actions: [{ type: 'move', id: deck[20 + i]!, to: 'gy' }, { type: 'move', id: deck[25 + i]!, to: 'gy' }] },
      { type: 'rivalUse', id: 'rival.card-14558127-1' },
      { type: 'draw', count: 1 },
      { type: 'shuffle', seed: 123456789 + i },
    ]
    actions.push(...turn.slice(0, 45 - actions.length))
  }
  return createSavedCombo({ name: 'Línea: «Snake-Eye» / 1 corte', deckName: 'Snake-Eye Fire King', initial, actions, nameOf: (id) => `Carta de nombre largo ${id.slice(5, 9)}` }, [], new Date('2026-10-29T12:00:00Z'))
}

type DeckList = { main: Array<[number, number]>; extra: Array<[number, number]> }
const lists = metaDecklists as unknown as Record<string, DeckList>
const copies = (list: Array<[number, number]>) => list.flatMap(([code, count]) => Array.from({ length: count }, (_, n) => `card-${code}-${n + 1}`))

/**
 * Un combo de un deck real del Meta (passcodes de verdad, el deck mezclado con semilla), con `count` jugadas al azar pero válidas para la mesa (`random-mat.ts`: fichas,
 * materiales Xyz, lotes, barajados) y, si se pide, el rival simulado. Los nombres son inventados, del largo de los de verdad (no se suben los de Konami).
 */
export function deckCombo(seed: number, count: number, { rival = false, auto = false } = {}): SavedCombo {
  const keys = Object.keys(lists)
  const list = lists[keys[seed % keys.length]!]!
  const next = random(seed)
  const main = copies(list.main).map((id) => [next(), id] as const).sort((a, b) => a[0] - b[0]).map(([, id]) => id)
  const table = createMatState(main, copies(list.extra ?? []), 5)
  const initial: MatState = rival ? { ...table, rival: { hand: [`rival.card-14558127-1`, `rival.card-97268402-1`, `rival.card-73642296-1`], used: [] } } : table
  const actions: MatAction[] = []
  let state = initial
  while (actions.length < count) {
    const action = randomAction(state, next)
    // Lo que la mesa no guarda tal cual (un campo `undefined`) se saca: el combo es el que se guardaría.
    const clean = JSON.parse(JSON.stringify(action)) as MatAction
    actions.push(clean)
    state = matReducer(state, clean)
  }
  const nameOf = (id: string) => `Carta ${id.replace(/\D+/g, ' ').trim().split(' ')[0]} de nombre del largo usual`.slice(0, 18 + (Number(id.replace(/\D/g, '').slice(-2)) % 20))
  return createSavedCombo({ name: `Combo ${seed}`, deckName: keys[seed % keys.length]!, initial, actions, nameOf, auto }, [], new Date('2026-10-29T12:34:56.789Z'))
}

export const withoutId = ({ id: _id, ...rest }: SavedCombo) => rest

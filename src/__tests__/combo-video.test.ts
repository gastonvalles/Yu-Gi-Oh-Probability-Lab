import { describe, expect, it, vi } from 'vitest'

import { createMatState, matReducer, type MatAction, type MatState } from '../app/practice-mat'
import { createSavedCombo } from '../app/saved-combos'
import { comboLook, comboScenes, resolveComboNames } from '../components/replays/video/video-combo'
import { transitionOf } from '../components/replays/video/video-motion'
import type { Scene, SceneCard } from '../components/replays/video/video-scene'
import { bitrateFor } from '../components/replays/video/video-support'
import { frameDurations, INTRO_MS, OUTRO_MS, videoFileName } from '../components/replays/video/video-timeline'

// Un combo chico con el simulador de handtraps: paso a la Main, invoco h0, coloco h1, el rival usa su Ash, mando h0 al cementerio y saco una ficha.
const deck = Array.from({ length: 12 }, (_, i) => `card-${10000000 + i}-1`)
const table = createMatState(deck, ['card-90000000-1'], 5)
const initial: MatState = { ...table, rival: { hand: ['rival.card-14558127-1', 'rival.card-97268402-1'], used: [] } }
const [h0, h1] = initial.hand as [string, string]
const actions: MatAction[] = [
  { type: 'phase', phase: 'main1' },
  { type: 'place', id: h0, zone: 'mz', index: 0, pos: 'atk', how: 'normal' },
  { type: 'place', id: h1, zone: 'st', index: 1, pos: 'set' },
  { type: 'rivalUse', id: 'rival.card-14558127-1' },
  { type: 'move', id: h0, to: 'gy' },
  { type: 'token', zone: 'mz', index: 2, pos: 'def' },
]
const nameOf = (id: string) => (id.startsWith('rival.') ? 'Ash Blossom' : `Carta ${id.slice(5, 13)}`)
const combo = createSavedCombo({ name: 'Línea básica', deckName: 'Snake-Eye', initial, actions, nameOf }, [], new Date('2026-10-29T12:00:00Z'))
const scenes = [...comboScenes(combo, combo.names, 720)]
const last = scenes.at(-1)!
const states = actions.reduce<MatState[]>((all, action) => [...all, matReducer(all.at(-1)!, action)], [combo.initial])
const at = (scene: Scene, row: number, col: number) => {
  const rect = scene.layout.cellAt(row, col)
  return scene.sides[0].slots.find((slot) => slot.card && slot.rect.x === rect.x && slot.rect.y === rect.y)
}
const faceUp = (scene: Scene) => scene.sides.flatMap((side) => [...side.slots, ...side.hand]).flatMap((slot) => (slot.card && !slot.card.faceDown ? [slot.card] : []))

describe('la escena de un combo', () => {
  it('una por jugada y la mesa inicial; arriba el nombre del combo y el deck, sin vidas ni turno; sólo tu campo (4 filas)', () => {
    expect(scenes).toHaveLength(actions.length + 1)
    expect(last.heading).toEqual({ title: 'Línea básica', subtitle: 'Snake-Eye' })
    expect(last.turnText).toBe('')
    // 4 filas de 5, menos las tres casillas de las fases.
    expect(last.cells).toHaveLength(17)
    expect(last.stepLabel).toBe('Jugada 6 de 6')
    expect(scenes[2]!.stepText).toBe('Invocación Normal de Carta 10000000')
  })

  it('cada carta en su casilla: la invocada boca arriba con su nombre y su arte, la colocada de dorso, el deck de dorso con su cuenta, la mano boca arriba', () => {
    const summoned = at(scenes[2]!, 1, 0)?.card
    expect(summoned).toMatchObject({ id: h0, faceDown: false, name: 'Carta 10000000', upsideDown: false })
    expect(summoned?.art).toBe('/api/card-image/cards_small/10000000.jpg?w=128')
    expect(at(scenes[3]!, 2, 1)?.card).toMatchObject({ id: h1, faceDown: true, name: '', art: null })
    const deckSlot = at(last, 3, 4)!
    expect(deckSlot.count).toBe(states.at(-1)!.deck.length)
    expect(deckSlot.card?.faceDown).toBe(true)
    expect(last.sides[0].hand.every((slot) => !slot.card?.faceDown)).toBe(true)
    // La ficha, en defensa (acostada).
    expect(at(last, 1, 2)?.card).toMatchObject({ sideways: true, faceDown: false })
  })

  it('la mano del rival del simulador va arriba, boca arriba; la que usó queda atenuada y se resalta', () => {
    expect(scenes[0]!.caption?.text).toBe('Mano del rival')
    expect(scenes[3]!.sides[1].hand.map((slot) => slot.card?.dim)).toEqual([false, false])
    const used = scenes[4]!.sides[1].hand[0]!
    expect(used.card).toMatchObject({ faceDown: false, dim: true, name: 'Ash Blossom' })
    expect(used.card?.art).toBe('/api/card-image/cards_small/14558127.jpg?w=128')
    expect(scenes[4]!.focus).toEqual([used.rect])
    expect(scenes[4]!.stepText).toContain('Ash Blossom')
  })

  it('sin la mano del rival no hay rótulo, y el campo sube', () => {
    const plain = createSavedCombo({ name: 'Sin rival', deckName: '', initial: table, actions: actions.slice(0, 2), nameOf }, [])
    const [first] = comboScenes(plain, plain.names, 720)
    expect(first!.caption).toBeUndefined()
    expect(first!.layout.cellAt(0, 0).y).toBeLessThan(scenes[0]!.layout.cellAt(0, 0).y)
  })

  it('no muestra nada que la mesa tape: lo del deck y lo colocado, de dorso en todos los cuadros y en las transiciones', () => {
    scenes.forEach((scene, index) => {
      const state = states[index]!
      const set = [...state.mz, ...state.st, state.field].flatMap((placed) => (placed?.pos === 'set' ? [placed.id] : []))
      expect(faceUp(scene).filter((card) => state.deck.includes(card.id) || set.includes(card.id))).toEqual([])
    })
    // Una carta en vuelo sólo con la cara que muestra alguna de sus dos escenas.
    scenes.slice(1).forEach((scene, index) => {
      const shown = new Set([...faceUp(scenes[index]!), ...faceUp(scene)].map((card: SceneCard) => card.id))
      for (const motion of transitionOf(scenes[index]!, scene)) if (!motion.card.faceDown) expect(shown.has(motion.card.id)).toBe(true)
    })
  })
})

describe('los nombres que faltan (un combo de un enlace no los trae)', () => {
  it('sin nombre, «Carta»; se piden por passcode una sola vez, y sin red quedan los que había', async () => {
    expect(comboLook({})(h0)).toEqual({ art: '/api/card-image/cards_small/10000000.jpg?w=128', name: 'Carta' })
    const fetchNames = vi.fn(async (codes: number[]) => new Map(codes.map((code) => [code, `Nombre ${code}`])))
    const names = await resolveComboNames({ ...combo, names: {} }, fetchNames)
    expect(fetchNames).toHaveBeenCalledTimes(1)
    expect(names[h0]).toBe('Nombre 10000000')
    expect(names['rival.card-14558127-1']).toBe('Nombre 14558127')
    expect(await resolveComboNames({ ...combo, names: { [h0]: 'X' } }, async () => Promise.reject(new Error('sin red')))).toEqual({ [h0]: 'X' })
    expect(await resolveComboNames(combo, fetchNames)).toBe(combo.names)
  })
})

describe('el archivo y los tiempos', () => {
  it('se llama como el combo, con la fecha; dura lo de sus jugadas más el título y el cierre', () => {
    expect(videoFileName({ kind: 'combo', combo })).toBe('Linea-basica-2026-10-29.mp4')
    expect(videoFileName({ kind: 'combo', combo: { ...combo, name: '../../ «»' } })).toBe('2026-10-29.mp4')
    const durations = frameDurations({ kind: 'combo', combo })
    expect(durations).toHaveLength(actions.length + 1)
    expect(durations[0]).toBe(INTRO_MS)
    expect(durations.at(-1)).toBe(OUTRO_MS)
  })
})

describe('la calidad según el largo', () => {
  it('un video corto (un combo) va a 1 Mbit/s; uno largo, a 400 kbit/s (10 minutos, menos de 10 MB)', () => {
    expect(bitrateFor(25_000)).toBe(1_000_000)
    expect(bitrateFor(3 * 60_000)).toBe(1_000_000)
    expect(bitrateFor(10 * 60_000)).toBe(400_000)
  })
})

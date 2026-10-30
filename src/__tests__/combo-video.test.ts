import { describe, expect, it, vi } from 'vitest'

import { createMatState, matReducer, type MatAction, type MatState } from '../app/practice-mat'
import { createSavedCombo } from '../app/saved-combos'
import { comboLook, comboScenes, resolveComboNames } from '../components/replays/video/video-combo'
import { flightsOf, MESA, overlaysOf, replaceOverlays, type Overlay } from '../components/replays/video/video-fx'
import { transitionOf, type Motion } from '../components/replays/video/video-motion'
import type { Scene, SceneCard } from '../components/replays/video/video-scene'
import { bitrateFor } from '../components/replays/video/video-support'
import { COMBO_STEP_MS, frameDurations, INTRO_MS, OUTRO_MS, videoFileName } from '../components/replays/video/video-timeline'
import { fakeAssets, fakeCtx } from './support/video-fakes'

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
    // 4 filas de 5, menos las tres del medio que no son Zonas Extra.
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
    // El título, cada jugada (la de un combo, lo que espera la mesa al reproducirlo; un cambio de fase, menos) y el cierre.
    const durations = frameDurations({ kind: 'combo', combo })
    expect(durations).toHaveLength(actions.length + 2)
    expect(durations[0]).toBe(INTRO_MS)
    expect(durations.slice(1, -1)).toEqual(actions.map((action) => (action.type === 'phase' ? 400 : COMBO_STEP_MS)))
    expect(durations.at(-1)).toBe(OUTRO_MS)
  })
})

describe('la calidad según el largo', () => {
  it('un combo va a 600 kbit/s; hasta unos 4 minutos, ~4,5 MB como mucho; más largo, 150 kbit/s', () => {
    expect(bitrateFor(25_000)).toBe(600_000)
    expect(bitrateFor(60_000)).toBe(600_000)
    expect(bitrateFor(2 * 60_000)).toBe(300_000)
    expect((bitrateFor(4 * 60_000) * 240) / 8 / 1e6).toBeLessThanOrEqual(4.5)
    expect(bitrateFor(10 * 60_000)).toBe(150_000)
  })
})

describe('lo que anima la mesa, en el video', () => {
  const stepFx = (index: number, start = 2000) => {
    const flights = flightsOf(transitionOf(scenes[index - 1]!, scenes[index]!), 1, 1, COMBO_STEP_MS)
    return { flights, overlays: overlaysOf(scenes[index - 1]!, scenes[index]!, flights, fakeAssets, 1, start, 'combo') }
  }
  const kinds = (overlays: readonly Overlay[]) => overlays.map((overlay) => overlay.kind).sort()

  it('cada carta vuela lo que vuela en la mesa según lo lejos; las que salen del mismo lugar, de a una; todo entra en la jugada', () => {
    const { flights } = stepFx(2)
    const summoned = flights.find((flight) => flight.motion.key === `0:${h0}`)!
    expect(summoned.delay).toBe(0)
    expect(summoned.duration).toBeGreaterThan(240)
    expect(summoned.duration).toBeLessThanOrEqual(MESA.flight)
    const pose = { x: 0, y: 0, w: 59, h: 86, angle: 0 }
    const three: Motion[] = [1, 2, 3].map((n) => ({ key: `0:c${n}`, card: scenes[0]!.sides[0].hand[0]!.card!, from: pose, to: { ...pose, x: 300 * n } }))
    expect(flightsOf(three, 1, 1, 2000).map((flight) => flight.delay)).toEqual([0, MESA.stagger, 2 * MESA.stagger])
    // A 2×, todo a la mitad; y si no entra en la jugada, se aprieta.
    expect(flightsOf(three, 1, 2, 2000)[2]).toMatchObject({ delay: MESA.stagger })
    const tight = flightsOf(three, 1, 1, 300)
    expect(Math.max(...tight.map((flight) => flight.delay + flight.duration))).toBeCloseTo(300)
  })

  it('el cartel de la fase, la carta grande de lo que mueve cada paso (como al reproducir el combo), el destello cuando la carta toca la zona; al cementerio, sin carta grande', () => {
    expect(kinds(stepFx(1).overlays)).toEqual(['banner'])
    const summon = stepFx(2)
    expect(kinds(summon.overlays)).toEqual(['landing', 'stage'])
    const flight = summon.flights.find((each) => each.motion.key === `0:${h0}`)!
    expect(summon.overlays.find((overlay) => overlay.kind === 'landing')!.start).toBeCloseTo(2000 + flight.delay + flight.duration * MESA.landingAt)
    // Colocar boca abajo no hace ruido; la handtrap del rival se muestra grande; ir al cementerio, no; la ficha aparece con su destello, sin vuelo que esperar.
    expect(kinds(stepFx(3).overlays)).toEqual([])
    expect(kinds(stepFx(4).overlays)).toEqual(['stage'])
    expect(kinds(stepFx(5).overlays)).toEqual([])
    expect(stepFx(6, 500).overlays.find((overlay) => overlay.kind === 'landing')?.start).toBe(500)
    // Todo se pinta de punta a punta sin romperse.
    const ctx = fakeCtx()
    for (const index of [1, 2, 4, 6]) for (const overlay of stepFx(index).overlays) for (const p of [0, 0.2, 0.5, 0.8, 0.99]) overlay.draw(ctx, p)
    expect(ctx.calls).toBeGreaterThan(50)
  })

  it('un cartel de fase que sigue abierto cambia de texto sin volver a abrirse; otra carta grande saca a la anterior', () => {
    const banner = (start: number): Overlay => ({ kind: 'banner', start, duration: MESA.banner, draw: () => {} })
    const stage = (start: number): Overlay => ({ kind: 'stage', start, duration: 1000, draw: () => {} })
    const open = replaceOverlays([banner(0), stage(0)], [banner(400)], 400)
    expect(open.map((overlay) => overlay.kind)).toEqual(['stage', 'banner'])
    expect(open[1]!.start).toBeCloseTo(400 - MESA.banner * 0.26)
    // Ya cerrándose, el nuevo entra de cero; y lo que terminó, se va.
    expect(replaceOverlays([banner(0)], [banner(1000)], 1000)[0]!.start).toBe(1000)
    expect(replaceOverlays([stage(0)], [stage(500)], 500)).toHaveLength(1)
    expect(replaceOverlays([stage(0)], [], 1200)).toEqual([])
  })
})

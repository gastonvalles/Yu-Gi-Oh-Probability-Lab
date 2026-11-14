import { OcgDuelMode, type OcgCardData } from 'ocgcore-wasm'
import { describe, expect, it } from 'vitest'
import { createAutoHost } from '../app/auto/core-host'
import { passivePolicy } from '../app/auto/policies'
import { LOCATION as L, parseAutoEvent, type AutoEvent, type CoreAnswer, type CoreAsk, type EventOf, type PlacedCard, type WireEvent } from '../app/auto/protocol'
import { hasCoreData, loadCards, scriptStore, wasmBinary } from './support/core-data'

/**
 * Las marcas del anfitrión (`core-host.ts`), con el núcleo y los scripts de verdad: el núcleo no dice cómo se invocó una carta ni por qué se movió, y el anfitrión lo sabe por la respuesta
 * (la Invocación Especial de una carta de la Zona de Péndulo) y por el motivo que guarda la carta (`REASON_RELEASE`). Lo que no es Péndulo ni Sacrificio no lleva marca.
 */

const DRAGONPULSE = 15146890 // Normal de Péndulo, escala 1
const DRAGONPIT = 51531505 // Normal de Péndulo, escala 8
const ARC = 14105623 // Normal de Péndulo, Nivel 7
const GOLDRIVER = 33256280 // Normal de Péndulo, Nivel 4 (boca arriba en el Extra)
const SMILE = 35259350 // Smile Universe: Invoca de modo Especial los de Péndulo boca arriba del Extra
const SKULL = 70781052 // Nivel 6: un Sacrificio
const CELTIC = 91152256
const VORTEX = 69162969 // Lightning Vortex: descartar 1 (costo); destruye los boca arriba del rival
const ENEMY = 98045062 // Enemy Controller: Sacrificar 1 monstruo (costo)
const BEWD = 89631139
const ATTACK_FIRST_TURN = 2n

type Ask = Extract<AutoEvent, { t: 'ask' }>

describe.skipIf(!hasCoreData)('las marcas del anfitrión: Péndulo y Sacrificio', () => {
  const { cards } = hasCoreData ? loadCards() : { cards: new Map<number, OcgCardData>() }
  const store = scriptStore()
  const at = (code: number, controller: 0 | 1, location: number, sequence = 0, position = 10): PlacedCard => ({ code, controller, location, sequence, position })
  const deck = (main: number[]) => ({ main, extra: [], hand: [] })

  /** Un duelo desde una mesa armada, con `choose` contestando por el asiento 0 (sin respuesta, la pasiva) hasta que devuelve `stop`; el asiento 1 contesta como el pasivo. */
  async function play(placed: PlacedCard[], choose: (ask: CoreAsk, seen: WireEvent[]) => CoreAnswer | 'stop' | undefined) {
    const events: AutoEvent[] = []
    const auto = createAutoHost({ core: { wasmBinary: wasmBinary() }, cardReader: (code) => cards.get(code) ?? null, scriptReader: store.read, emit: (event) => events.push(event) })
    const codes = placed.map((card) => card.code)
    const setup = { lp: [8000, 8000], cards: [...Array.from({ length: 8 }, () => at(BEWD, 0, L.DECK)), ...Array.from({ length: 8 }, () => at(BEWD, 1, L.DECK)), ...placed] }

    await auto.handle({ t: 'create', seed: 7, flags: String(OcgDuelMode.MODE_MR5 | ATTACK_FIRST_TURN), players: [0, 1].map(() => ({ lp: 8000, hand: 0, draw: 1 })), decks: [deck([...Array(8).fill(BEWD), ...codes]), deck([...Array(8).fill(BEWD), ...codes])], setup })
    const seen = (seat: 0 | 1) => events.flatMap((event) => (event.t === 'events' && event.seat === seat ? event.events : []))

    for (let i = 0; i < 60; i += 1) {
      const asked = events.findLast((event): event is Ask => event.t === 'ask')!
      const answer = asked.seat === 0 ? choose(asked.ask, seen(0)) : undefined

      if (answer === 'stop') break
      await auto.handle({ t: 'answer', askId: asked.askId, answer: answer ?? passivePolicy()(asked.ask) })
    }
    expect(events.filter((event) => event.t === 'fault')).toEqual([])
    // Lo marcado viaja: el otro lado (el duelo en línea) lo lee igual.
    for (const event of events) expect(parseAutoEvent(JSON.stringify(event))).toEqual(event)

    return { mine: seen(0), theirs: seen(1) }
  }

  const of = <K extends WireEvent['type']>(events: WireEvent[], type: K) => events.filter((event): event is EventOf<K> => event.type === type)
  const idle = (ask: CoreAsk) => (ask.type === 'select_idlecmd' ? ask : null)
  /** Elige todas las que ofrece (de a una, como la hoja de elegir cartas). */
  const pickAll = (ask: CoreAsk): CoreAnswer | undefined => (ask.type === 'select_unselect_card' ? { type: ask.type, index: ask.select_cards.length > 0 ? 0 : null } : undefined)
  const scales = [at(DRAGONPULSE, 0, L.SZONE, 0, 1), at(DRAGONPIT, 0, L.SZONE, 4, 1)]

  it('la Invocación por Péndulo, desde la mano y desde el Extra Deck boca arriba: cada una con `pendulum`, y todas menos la última con `more`; los dos asientos lo ven', { timeout: 120_000 }, async () => {
    const { mine, theirs } = await play([...scales, at(ARC, 0, L.HAND), at(GOLDRIVER, 0, L.EXTRA, 0, 5)], (ask, seen) => {
      const options = idle(ask)

      if (options) return of(seen, 'spsummoned').length > 0 ? 'stop' : { type: 'select_idlecmd', action: 1, index: options.special_summons.findIndex((card) => card.location === L.SZONE) }
      return pickAll(ask)
    })

    for (const events of [mine, theirs]) {
      const summoned = of(events, 'spsummoning')

      expect(summoned.map((event) => [event.code, event.pendulum, event.more])).toEqual([
        [ARC, true, true],
        [GOLDRIVER, true, undefined],
      ])
    }
    // Venían de la mano y del Extra Deck boca arriba.
    expect(of(mine, 'move').filter((event) => event.to.location === L.MZONE).map((event) => event.from.location)).toEqual([L.HAND, L.EXTRA])
  })

  it('un monstruo de Péndulo boca arriba del Extra Deck que sale por un efecto (Smile Universe) no es Péndulo', { timeout: 120_000 }, async () => {
    const { mine } = await play([...scales, at(SMILE, 0, L.HAND), at(GOLDRIVER, 0, L.EXTRA, 0, 5)], (ask, seen) => {
      const options = idle(ask)

      if (options) return of(seen, 'spsummoning').length > 0 ? 'stop' : { type: 'select_idlecmd', action: 5, index: options.activates.findIndex((card) => card.code === SMILE) }
      return undefined
    })
    const summoned = of(mine, 'spsummoning')

    expect(summoned.map((event) => event.code)).toEqual([GOLDRIVER])
    expect(summoned[0]).not.toHaveProperty('pendulum')
    expect(of(mine, 'move').find((event) => event.card === GOLDRIVER)?.from).toMatchObject({ location: L.EXTRA, position: 5 })
  })

  it('la Invocación por Sacrificio: el que se va lleva `tribute` y la Invocación también', { timeout: 120_000 }, async () => {
    const { mine, theirs } = await play([at(CELTIC, 0, L.MZONE, 2, 1), at(SKULL, 0, L.HAND)], (ask, seen) => {
      const options = idle(ask)

      if (options) return of(seen, 'summoning').length > 0 ? 'stop' : { type: 'select_idlecmd', action: 0, index: options.summons.findIndex((card) => card.code === SKULL) }
      return ask.type === 'select_tribute' ? { type: ask.type, indices: [0] } : undefined
    })

    for (const events of [mine, theirs]) {
      expect(of(events, 'move').filter((event) => event.tribute).map((event) => [event.card, event.from.location, event.to.location])).toEqual([[CELTIC, L.MZONE, L.GRAVE]])
      expect(of(events, 'summoning').map((event) => [event.code, event.tribute])).toEqual([[SKULL, true]])
    }
  })

  it('al Cementerio por costo (descartar), por efecto (destruir) y por batalla no es Sacrificio; Sacrificar como costo (Enemy Controller) sí, sin Invocación', { timeout: 120_000 }, async () => {
    const { mine } = await play([at(SKULL, 0, L.MZONE, 2, 1), at(CELTIC, 0, L.MZONE, 1, 1), at(VORTEX, 0, L.HAND), at(BEWD, 0, L.HAND), at(ENEMY, 0, L.HAND), at(CELTIC, 1, L.MZONE, 2, 1), at(CELTIC, 1, L.MZONE, 3, 8), at(BEWD, 1, L.MZONE, 1, 1)], (ask, seen) => {
      const moves = of(seen, 'move')
      const options = idle(ask)

      if (options) {
        const vortex = options.activates.findIndex((card) => card.code === VORTEX)
        const enemy = options.activates.findIndex((card) => card.code === ENEMY)

        if (enemy >= 0) return { type: 'select_idlecmd', action: 5, index: enemy }
        if (vortex >= 0) return { type: 'select_idlecmd', action: 5, index: vortex }
        return options.to_bp && !of(seen, 'battle').length ? { type: 'select_idlecmd', action: 6, index: null } : 'stop'
      }
      if (ask.type === 'select_option') return { type: ask.type, index: ask.options.length - 1 }
      if (ask.type === 'select_card') return { type: ask.type, indices: [ask.selects.findIndex((card) => card.code === BEWD) >= 0 ? ask.selects.findIndex((card) => card.code === BEWD) : 0] }
      if (ask.type === 'select_tribute') return { type: ask.type, indices: [ask.selects.findIndex((card) => card.code === CELTIC)] }
      if (ask.type === 'select_battlecmd') {
        const skull = ask.attacks.findIndex((card) => card.code === SKULL)

        return skull >= 0 && !of(seen, 'battle').length ? { type: ask.type, action: 1, index: skull } : moves.length > 0 ? 'stop' : undefined
      }
      return undefined
    })
    const toGrave = of(mine, 'move').filter((event) => event.to.location === L.GRAVE)

    // El descarte del costo (Blue-Eyes, de la mano) y lo destruido por Lightning Vortex (los del rival boca arriba) y por batalla: sin marca.
    expect(toGrave.filter((event) => event.card === BEWD && event.from.location === L.HAND && event.from.controller === 0)).toHaveLength(1)
    expect(toGrave.filter((event) => event.from.controller === 1).length).toBeGreaterThanOrEqual(2)
    expect(of(mine, 'battle')).toHaveLength(1)
    // Sólo el Sacrificio de Enemy Controller lleva la marca; no hubo Invocación que la lleve.
    expect(toGrave.filter((event) => event.tribute).map((event) => [event.card, event.from.controller, event.from.location])).toEqual([[CELTIC, 0, L.MZONE]])
    expect(of(mine, 'summoning').some((event) => event.tribute)).toBe(false)
  })
})

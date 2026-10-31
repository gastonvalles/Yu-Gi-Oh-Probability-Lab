import { OcgDuelMode, OcgLocation as L } from 'ocgcore-wasm'
import { describe, expect, it } from 'vitest'
import { createAdapter, type Adapter } from '../app/auto/adapter'
import { createAutoHost } from '../app/auto/core-host'
import { teamOrder } from '../app/auto/deck-map'
import { freePlaces, passivePolicy } from '../app/auto/policies'
import type { AutoCommand, AutoEvent, CoreAnswer, CoreAsk } from '../app/auto/protocol'
import { codeOfId, compare, readMat, readReal } from './support/core-compare'
import { hasCoreData, loadCards, scriptStore, wasmBinary } from './support/core-data'

/**
 * Dar el control de un monstruo del Extra Deck que está en la Zona de Monstruo Extra (lento, núcleo real): Flame Swordsman (Fusión con Polymerization) y después
 * Shien's Spy o Creature Swap. El núcleo lo pasa a una zona de monstruo PRINCIPAL del rival (nunca a la Extra) y las mesas de los dos asientos lo siguen sin notas
 * ni diferencias. Un usuario creyó que no se podía: la pantalla pedía «Elegí 1 casilla» y las casillas encendidas estaban del lado del rival.
 */
const POLY = 24094653
const FLAME_SWORDSMAN = 45231177
const MANIPULATOR = 34460851
const MASAKI = 44287299
const SPY = 7672244
const SWAP = 31036355
const ELF = 15025844

type Place = ReturnType<typeof freePlaces>[number]
const main = (player: 0 | 1) => (place: Place) => place.player === player && place.location === L.MZONE && place.sequence < 5

describe.skipIf(!hasCoreData)('dar el control de un monstruo de la Zona de Monstruo Extra (núcleo real)', () => {
  const { cards } = hasCoreData ? loadCards() : { cards: new Map() }
  const store = scriptStore()
  const typeOf = (code: number) => cards.get(code)?.type ?? 0

  /** Fusión a la Zona Extra en el turno 1; con `spy`, Shien's Spy ahí mismo; con `swap`, el rival invoca Mystical Elf y en el turno 3 va Creature Swap. */
  async function play(card: 'spy' | 'swap') {
    const events: AutoEvent[] = []
    const host = createAutoHost({ core: { wasmBinary: wasmBinary() }, cardReader: (code) => cards.get(code) ?? null, scriptReader: store.read, emit: (event) => events.push(event) })
    const hand = [POLY, MANIPULATOR, MASAKI, SPY, SWAP]
    const create: Extract<AutoCommand, { t: 'create' }> = {
      t: 'create',
      seed: 7,
      flags: String(OcgDuelMode.MODE_MR5),
      players: [{ lp: 8000, hand: 5, draw: 1 }, { lp: 8000, hand: 5, draw: 1 }],
      decks: [{ main: [...hand, ...Array<number>(35).fill(ELF)], extra: [FLAME_SWORDSMAN], hand }, { main: Array<number>(40).fill(ELF), extra: [], hand: [] }],
    }
    const adapters: Adapter[] = ([0, 1] as const).map((seat) =>
      createAdapter({ seat, mine: { deck: teamOrder(create, seat), extra: create.decks[seat]!.extra }, theirs: { deck: create.decks[1 - seat]!.main.length, extra: create.decks[1 - seat]!.extra.length }, lp: [8000, 8000], typeOf }),
    )
    const problems: string[] = []
    const places: { seat: number; free: Place[] }[] = []
    const passive = passivePolicy()
    const done = new Set<string>()
    let mark = 0

    const realMonsters = () => {
      const { lib, handle } = host.live!
      return ([0, 1] as const).map((controller) => lib.duelQueryLocation(handle, { flags: 1 as never, controller, location: L.MZONE as never }).map((found) => found?.code ?? null))
    }
    // Lo nuevo del anfitrión a las dos mesas: ninguna nota del adaptador, ningún fallo y las dos iguales al núcleo.
    const feed = () => {
      for (const event of events.slice(mark)) {
        if (event.t === 'fault') problems.push(`fault ${JSON.stringify(event)}`)
        for (const seat of [0, 1] as const) problems.push(...adapters[seat]!.apply(event).unmapped.map((text) => `seat${seat}: ${text}`))
      }
      mark = events.length
      const { lib, handle } = host.live!
      for (const seat of [0, 1] as const) {
        const a = adapters[seat]!
        const mine = compare(readReal(lib, handle, seat), readMat(a.mine, (id) => (/^card-/.test(id) ? codeOfId(id, {}) : a.codeOf({ side: 'mine', id }))), true)
        const theirs = compare(readReal(lib, handle, (1 - seat) as 0 | 1), readMat(a.theirs.state, (id) => a.codeOf({ side: 'theirs', id })), false)
        problems.push(...[...mine, ...theirs].map((diff) => `seat${seat}: ${diff}`))
      }
    }
    const idle = (ask: Extract<CoreAsk, { type: 'select_idlecmd' }>): CoreAnswer => {
      const activate = (code: number) => ask.activates.findIndex((option) => option.code === code && option.location === L.HAND)
      const once = (step: string, code: number, after: string) => !done.has(step) && done.has(after) && activate(code) >= 0 && (done.add(step), true)
      if (ask.player === 0) {
        if (once('poly', POLY, 'start')) return { type: ask.type, action: 5, index: activate(POLY) }
        if (card === 'spy' && once('spy', SPY, 'poly')) return { type: ask.type, action: 5, index: activate(SPY) }
        if (card === 'swap' && once('swap', SWAP, 'elf')) return { type: ask.type, action: 5, index: activate(SWAP) }
      } else if (ask.summons.length && !done.has('elf')) return done.add('elf'), { type: ask.type, action: 0, index: 0 }
      return { type: ask.type, action: ask.to_ep ? 7 : 6, index: null }
    }

    done.add('start')
    await host.handle(create)
    feed()
    for (let n = 0; n < 300; n += 1) {
      const ask = events.findLast((event) => event.t === 'ask')
      if (!ask || ask.t !== 'ask' || events.some((event) => event.t === 'end')) break
      const q = ask.ask
      // Fin: con Spy, cuando el rival empieza su turno (el control ya volvió en la End Phase); con Swap, cuando vuelve a preguntar después del cambio.
      if (q.type === 'select_idlecmd' && (card === 'spy' ? q.player === 1 : done.has('swap'))) break
      let answer: CoreAnswer = q.type === 'select_idlecmd' ? idle(q) : passive(q)
      if (q.type === 'select_place') {
        const free = freePlaces(q)
        const emz = !done.has('fused') ? free.find((place) => place.player === 0 && place.location === L.MZONE && place.sequence === 5) : undefined
        if (emz) done.add('fused')
        else places.push({ seat: ask.seat, free })
        answer = { type: q.type, places: [emz ?? free[0]!] }
      }
      await host.handle({ t: 'answer', askId: ask.askId, answer })
      feed()
    }
    const monsters = realMonsters()
    host.handle({ t: 'destroy' })
    return { done, problems, places, monsters }
  }

  it("Shien's Spy: se ofrecen sólo las cinco zonas principales del rival, el monstruo pasa ahí y en la End Phase vuelve a una principal propia; las mesas, iguales al núcleo", async () => {
    const { done, problems, places } = await play('spy')

    expect(done.has('spy')).toBe(true)
    expect(problems).toEqual([])
    // La pregunta de dar el control (a quien activa Spy): las 5 principales del rival, ninguna propia ni de la Zona Extra.
    const give = places.find(({ seat, free }) => seat === 0 && free.some(main(1)))!
    expect(give.free).toEqual([0, 1, 2, 3, 4].map((sequence) => ({ player: 1, location: L.MZONE, sequence })))
    // Al volver en la End Phase: una principal propia.
    expect(places.at(-1)!.free.every(main(0))).toBe(true)
  }, 120_000)

  it('Creature Swap: cada uno recibe el monstruo del otro en una zona principal; la Zona Extra queda vacía y las mesas, iguales al núcleo', async () => {
    const { done, problems, places, monsters } = await play('swap')

    expect(done.has('swap')).toBe(true)
    expect(problems).toEqual([])
    // A quien recibe Flame Swordsman (el rival) se le ofrecen sólo zonas principales suyas.
    const receive = places.filter(({ seat }) => seat === 1).at(-1)!
    expect(receive.free.length).toBeGreaterThan(0)
    expect(receive.free.every(main(1))).toBe(true)
    expect(monsters[1]!.slice(0, 5)).toContain(FLAME_SWORDSMAN)
    expect(monsters[0]!.slice(0, 5)).toContain(ELF)
    expect([...monsters[0]!.slice(5), ...monsters[1]!.slice(5)].every((code) => code === null)).toBe(true)
  }, 120_000)
})

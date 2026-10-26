import { OcgDuelMode } from 'ocgcore-wasm'
import { createAutoHost } from '../app/auto/core-host'
import { passivePolicy } from '../app/auto/policies'
import type { AutoCommand, AutoEvent, CoreAnswer, CoreAsk } from '../app/auto/protocol'
import { hasCoreData, loadCards, scriptStore, wasmBinary } from './support/core-data'

/**
 * Qué ordena `sort_chain` en este núcleo (lento: `npm run test:auto`). No son disparos: varios efectos tuyos que se disparan a la vez se piden **de a uno** con `select_chain`
 * (`forced` los obligatorios) y el que elegís primero es CL1. `sort_chain` llega al declarar un ataque con dos costos o más (Dark Elf paga 1000 y Toll 500): `order[i]` es
 * el puesto de la carta `i` y se paga primero el del puesto más bajo; `null`, en el orden en que vienen. Sin eslabones: la hoja no rotula «CLn».
 */
const DARK_ELF = 21417692
const TOLL = 82003859
const BEWD = 89631139
const DESTRUCTION = 72892473
const BEIIGE = 33731070
const BROWW = 79126789
const GOLDD = 78004197

const at = (list: readonly { code: number; location: number }[], code: number, location?: number) => list.findIndex((card) => card.code === code && (location === undefined || card.location === location))

/** Un duelo con tu mano fija contra 40 Blue-Eyes que no se pueden Invocar (el rival no hace nada): `mine` contesta lo tuyo hasta que devuelve `stop`. Lo que te pasa, en orden. */
async function play(hand: number[], mine: (ask: CoreAsk, turn: number) => CoreAnswer | 'stop') {
  const { cards } = loadCards()
  const store = scriptStore()
  const events: AutoEvent[] = []
  const host = createAutoHost({ core: { wasmBinary: wasmBinary() }, cardReader: (code) => cards.get(code) ?? null, scriptReader: store.read, emit: (event) => events.push(event) })
  const create: Extract<AutoCommand, { t: 'create' }> = {
    t: 'create',
    seed: 7,
    flags: String(OcgDuelMode.MODE_MR5),
    players: [{ lp: 8000, hand: 5, draw: 1 }, { lp: 8000, hand: 5, draw: 1 }],
    decks: [{ main: [...hand, ...Array(40 - hand.length).fill(BEWD)], extra: [], hand }, { main: Array(40).fill(BEWD), extra: [], hand: [] }],
  }
  const passive = passivePolicy()
  const log: string[] = []
  let turn = 0
  let from = 0

  await host.handle(create)
  for (let q = 0; q < 300; q += 1) {
    const fresh = events.slice(from)

    from = events.length
    for (const event of fresh) {
      if (event.t !== 'events' || event.seat !== 0) continue
      for (const item of event.events) {
        if (item.type === 'new_turn') turn += 1
        if (item.type === 'pay_lpcost') log.push(`pay:${item.amount}`)
        if (item.type === 'chaining') log.push(`CL${item.chain_size}:${item.code}`)
        if (item.type === 'attack') log.push('attack')
      }
    }
    const asked = fresh.findLast((event) => event.t === 'ask')

    if (!asked) break
    if (asked.seat === 0 && (asked.ask.type === 'sort_chain' || (asked.ask.type === 'select_chain' && asked.ask.forced))) log.push(asked.ask.type)
    const answer = asked.seat === 0 ? mine(asked.ask, turn) : passive(asked.ask)

    if (answer === 'stop') break
    await host.handle({ t: 'answer', askId: asked.askId, answer })
  }
  return log
}

/** Turno 1: Dark Elf y Toll boca abajo; turno 3: Toll y el ataque de Dark Elf (dos costos a la vez). */
async function attackWithTwoCosts(order: number[] | null) {
  let sorted: number[] = []
  let attacked = false
  const log = await play([DARK_ELF, TOLL, BEWD, BEWD, BEWD], (ask, turn) => {
    const passive = passivePolicy()

    switch (ask.type) {
      case 'select_idlecmd':
        if (attacked) return 'stop'
        if (at(ask.summons, DARK_ELF) >= 0) return { type: ask.type, action: 0, index: at(ask.summons, DARK_ELF) }
        if (at(ask.spell_sets, TOLL) >= 0) return { type: ask.type, action: 4, index: at(ask.spell_sets, TOLL) }
        if (at(ask.activates, TOLL, 0x8) >= 0) return { type: ask.type, action: 5, index: at(ask.activates, TOLL, 0x8) }
        return { type: ask.type, action: ask.to_bp && turn >= 3 ? 6 : 7, index: null }
      case 'select_battlecmd':
        if (attacked || ask.attacks.length === 0) return { type: ask.type, action: 3, index: null }
        attacked = true
        return { type: ask.type, action: 1, index: at(ask.attacks, DARK_ELF) }
      case 'sort_chain':
        sorted = ask.cards.map((card) => card.code)
        return { type: ask.type, order }
      default:
        return passive(ask)
    }
  })

  return { sorted, log: log.filter((entry) => !entry.startsWith('CL')) }
}

describe.skipIf(!hasCoreData)('qué ordena sort_chain (npm run test:auto)', () => {
  it('dos costos de ataque: se paga primero el del puesto más bajo de la respuesta; sin respuesta, en el orden en que vienen', async () => {
    expect(await attackWithTwoCosts(null)).toEqual({ sorted: [DARK_ELF, TOLL], log: ['sort_chain', 'pay:1000', 'pay:500', 'attack'] })
    expect((await attackWithTwoCosts([0, 1])).log).toEqual(['sort_chain', 'pay:1000', 'pay:500', 'attack'])
    expect((await attackWithTwoCosts([1, 0])).log).toEqual(['sort_chain', 'pay:500', 'pay:1000', 'attack'])
  }, 60_000)

  it('tres disparos obligatorios a la vez (Card Destruction descarta tres Dark World): ningún sort_chain, se eligen de a uno con select_chain y el primero elegido es CL1', async () => {
    let activated = false
    const picked: number[] = []
    const log = await play([DESTRUCTION, BEIIGE, BROWW, GOLDD, BEWD], (ask) => {
      if (ask.type === 'select_idlecmd') {
        if (activated) return 'stop'
        activated = true
        return { type: ask.type, action: 5, index: at(ask.activates, DESTRUCTION) }
      }
      // El último de la lista cada vez, para que el orden elegido no sea el de la lista.
      if (ask.type === 'select_chain' && ask.forced) {
        picked.push(ask.selects.at(-1)!.code)
        return { type: ask.type, index: ask.selects.length - 1 }
      }
      return passivePolicy()(ask)
    })
    const links = log.filter((entry) => entry.startsWith('CL') && !entry.endsWith(`:${DESTRUCTION}`))

    expect(log).not.toContain('sort_chain')
    // Dos preguntas: la tercera, con uno solo, la contesta el núcleo. Cada elegido toma el eslabón siguiente.
    expect(picked).toEqual([BEIIGE, BROWW])
    expect(links).toEqual([`CL1:${BEIIGE}`, `CL2:${BROWW}`, `CL3:${GOLDD}`])
  }, 60_000)
})

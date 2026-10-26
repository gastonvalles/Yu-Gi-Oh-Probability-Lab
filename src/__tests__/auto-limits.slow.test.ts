import { OcgDuelMode } from 'ocgcore-wasm'
import { createAdapter } from '../app/auto/adapter'
import { createAutoHost } from '../app/auto/core-host'
import { teamOrder } from '../app/auto/deck-map'
import { passivePolicy, randomLegalPolicy } from '../app/auto/policies'
import { splitDesc, type AutoCommand, type AutoEvent, type CoreAnswer, type CoreAsk } from '../app/auto/protocol'
import { hasCoreData, loadCards, scriptStore, wasmBinary } from './support/core-data'

/**
 * Las restricciones del turno y la Invocación Normal, contra el núcleo real (lento: `npm run test:auto`). Radiant Typhoon Meghala se Invoca sola, se Invoca
 * Ash Blossom de Modo Normal y, al activar «Mystical Space Typhoon», Meghala trae otra Radiant Typhoon y deja «no podés Invocar de Modo Especial salvo VIENTO»:
 * el núcleo la agrega (`player_hint` 6) y S:P Little Knight deja de ofrecerse; en la End Phase la quita (7). El turno siguiente arranca sin Invocación Normal.
 */
const SPL = 29301450
const MEGHALA = 27755794
const SWEN = 80538047
const ASH = 14558127
const MST = 5318639
const BEWD = 89631139

describe.skipIf(!hasCoreData)('restricciones del núcleo e Invocación Normal (npm run test:auto)', () => {
  it('la restricción de Meghala entra al resolverse y sale en la End Phase; la Invocación Normal se cuenta por turno', { timeout: 300_000 }, async () => {
    const { cards } = loadCards()
    const store = scriptStore()
    const events: AutoEvent[] = []
    const host = createAutoHost({ core: { wasmBinary: wasmBinary() }, cardReader: (code) => cards.get(code) ?? null, scriptReader: store.read, emit: (event) => events.push(event) })
    const hand = [MEGHALA, ASH, MST, MST, BEWD]
    const create: Extract<AutoCommand, { t: 'create' }> = {
      t: 'create',
      seed: 7,
      flags: String(OcgDuelMode.MODE_MR5),
      players: [{ lp: 8000, hand: 5, draw: 1 }, { lp: 8000, hand: 5, draw: 1 }],
      decks: [{ main: [...hand, SWEN, ...Array(34).fill(BEWD)], extra: [SPL], hand }, { main: Array(40).fill(BEWD), extra: [], hand: [] }],
    }
    const adapter = createAdapter({ seat: 0, mine: { deck: teamOrder(create, 0), extra: create.decks[0]!.extra }, theirs: { deck: 40, extra: 0 }, typeOf: (code) => cards.get(code)?.type ?? 0 })
    const fallback = randomLegalPolicy(3)
    const passive = passivePolicy()
    const seen: { limits: number; normal: string | null; spl: boolean; turn: number }[] = []
    let set = false
    let fired = false
    let ended = false
    const at = (list: readonly { code: number; location: number }[], code: number, location?: number) => list.findIndex((card) => card.code === code && (location === undefined || card.location === location))
    const mine = (ask: CoreAsk): CoreAnswer | 'stop' => {
      if (ask.type === 'select_idlecmd') {
        seen.push({ limits: adapter.overlay.limits[0].length, normal: adapter.overlay.normal[0], spl: at(ask.special_summons, SPL) >= 0, turn: adapter.overlay.turn })
        if (ended) return 'stop'
        if (at(ask.special_summons, MEGHALA, 0x2) >= 0) return { type: 'select_idlecmd', action: 1, index: at(ask.special_summons, MEGHALA, 0x2) }
        if (at(ask.summons, ASH) >= 0) return { type: 'select_idlecmd', action: 0, index: at(ask.summons, ASH) }
        if (!set && at(ask.spell_sets, MST) >= 0) {
          set = true
          return { type: 'select_idlecmd', action: 4, index: at(ask.spell_sets, MST) }
        }
        if (!fired && at(ask.activates, MST, 0x2) >= 0) return { type: 'select_idlecmd', action: 5, index: at(ask.activates, MST, 0x2) }
        ended = true
        return { type: 'select_idlecmd', action: 7, index: null }
      }
      if (ask.type === 'select_chain') {
        const index = ask.selects.findIndex((card) => card.code === MEGHALA)

        if (index >= 0 && !fired) {
          fired = true
          return { type: 'select_chain', index }
        }
        return { type: 'select_chain', index: null }
      }
      return fallback(ask)
    }

    await host.handle(create)
    let from = 0
    const removedAt: number[] = []

    for (let q = 0; q < 300; q += 1) {
      const fresh = events.slice(from)

      from = events.length
      for (const event of fresh) {
        adapter.apply(event)
        if (event.t !== 'events' || event.seat !== 0) continue
        // El turno en que se quita: el de antes de su `new_turn`, si el mismo lote ya trae el siguiente.
        const gone = event.events.findIndex((item) => item.type === 'player_hint' && item.player_hint === 7)

        if (gone >= 0) removedAt.push(adapter.overlay.turn - event.events.slice(gone).filter((item) => item.type === 'new_turn').length)
      }
      const asked = fresh.findLast((event) => event.t === 'ask')

      if (!asked) break
      // Un turno del rival entero y, de vuelta en el mío, se corta.
      if (asked.seat === 0 && asked.ask.type === 'select_idlecmd' && ended && adapter.overlay.turn >= 3) {
        mine(asked.ask)
        break
      }
      const answer = asked.seat === 0 ? mine(asked.ask) : passive(asked.ask)

      if (answer === 'stop') break
      await host.handle({ t: 'answer', askId: asked.askId, answer })
    }

    // Después de Invocar a Ash, el turno tiene su Invocación Normal; con Meghala resuelta, una restricción con su texto (el 3.º, `str3`) y S:P Little Knight ya no se ofrece.
    const locked = seen.find((entry) => entry.limits > 0)

    expect(seen.some((entry) => entry.turn === 1 && entry.normal === 'summon')).toBe(true)
    expect(locked).toMatchObject({ turn: 1, normal: 'summon', spl: false })
    expect(seen.some((entry) => entry.turn === 1 && entry.limits === 0 && entry.spl)).toBe(true)
    // La quita el núcleo en la End Phase de ese turno; el turno 3 (el mío otra vez) arranca limpio.
    expect(removedAt).toEqual([1])
    expect(seen.at(-1)).toMatchObject({ turn: 3, limits: 0, normal: null })
    const hint = events.flatMap((event) => (event.t === 'events' && event.seat === 0 ? event.events : [])).find((item) => item.type === 'player_hint' && item.player_hint === 6)

    expect(hint && hint.type === 'player_hint' ? splitDesc(hint.description) : null).toEqual({ code: MEGHALA, n: 2 })
  })
})

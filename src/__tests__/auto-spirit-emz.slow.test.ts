import { OcgDuelMode, OcgLocation as L } from 'ocgcore-wasm'
import { createAdapter, type Adapter } from '../app/auto/adapter'
import { openAsk } from '../app/auto/ask-ui'
import { createAutoHost } from '../app/auto/core-host'
import { teamOrder } from '../app/auto/deck-map'
import { turnReasons } from '../app/auto/no-plays'
import { freePlaces, passivePolicy } from '../app/auto/policies'
import { splitDesc, type AutoCommand, type AutoEvent, type CoreAnswer, type CoreAsk } from '../app/auto/protocol'
import { hasCoreData, loadCards, scriptStore, wasmBinary } from './support/core-data'

/**
 * El efecto de Spirit with Eyes of Blue desde la Zona de Monstruo Extra (lento, núcleo real). Un usuario, segundo jugador, no lo vio en el menú con «Dominus Purge»
 * (activada desde la mano en el turno del rival) y «Roar of the Blue-Eyed Dragons» (este turno) rigiendo, después de deshacer una jugada. Acá: el rival activa Pot
 * of Greed y el de Blue-Eyes responde con Dominus Purge; en su turno Invoca a Maiden with Eyes of Blue, la usa para Spirit (a la Zona Extra `emz`), activa Roar
 * (un Blue-Eyes White Dragon del Deck a una zona principal) y, con otro en la mano o en el Cementerio (Foolish Burial), el núcleo ofrece el efecto de Spirit y la
 * mesa lo pone en la carta: desde los dos asientos, en las dos Zonas Extra, con un arte alternativo (en el `.cdb` algunos no tienen el arquetipo: el núcleo lo
 * toma del original) y después de activarlo y deshacerlo (`rewind`). Sin ningún Blue-Eyes en la mano ni en el Cementerio (sólo en el Deck), no lo ofrece, como dice su
 * script, y la mesa no tiene una razón comprobada que dar (`turnReasons` vacío): el cartel dice «El automático no ofrece jugadas…» y las restricciones aparte.
 */
const SPIRIT = 42097666
const MAIDEN = 88241506
const BEWD = 89631139
/** Un arte alternativo de Blue-Eyes White Dragon con `setcode` 0 en el `.cdb` (`alias` 89631139). */
const BEWD_ALT = 89631140
const ROAR = 17725109
const DOMINUS = 97045737
const POT = 55144522
const FOOLISH = 81439173
const ELF = 15025844

interface Case {
  blue: 0 | 1
  emz: 5 | 6
  bewd?: number
  /** El Blue-Eyes que Spirit Invoca, en el Cementerio (Foolish Burial) en vez de la mano. */
  grave?: boolean
  /** Ningún Blue-Eyes en la mano ni en el Cementerio (sólo en el Deck): Spirit mira la mano y el Cementerio, así que no tiene a quién Invocar. */
  deckOnly?: boolean
}

describe.skipIf(!hasCoreData)('Spirit with Eyes of Blue en la Zona Extra (núcleo real)', () => {
  const { cards } = hasCoreData ? loadCards() : { cards: new Map() }
  const store = scriptStore()
  const typeOf = (code: number) => cards.get(code)?.type ?? 0

  async function play({ blue, emz, bewd = BEWD, grave = false, deckOnly = false }: Case) {
    const rival = (1 - blue) as 0 | 1
    const events: AutoEvent[] = []
    const host = createAutoHost({ core: { wasmBinary: wasmBinary() }, cardReader: (code) => cards.get(code) ?? null, scriptReader: store.read, emit: (event) => events.push(event) })
    const blueHand = [MAIDEN, ROAR, grave ? FOOLISH : deckOnly ? ELF : bewd, DOMINUS, ELF]
    const rivalHand = [POT, ELF, ELF, ELF, ELF]
    const decks: { main: number[]; extra: number[]; hand: number[] }[] = []

    decks[blue] = { main: [...blueHand, bewd, bewd, ...Array<number>(33).fill(ELF)], extra: [SPIRIT], hand: blueHand }
    decks[rival] = { main: [...rivalHand, ...Array<number>(35).fill(ELF)], extra: [], hand: rivalHand }
    const create: Extract<AutoCommand, { t: 'create' }> = { t: 'create', seed: 7, flags: String(OcgDuelMode.MODE_MR5), players: [{ lp: 8000, hand: 5, draw: 1 }, { lp: 8000, hand: 5, draw: 1 }], decks }
    const adapter = (seat: 0 | 1) =>
      createAdapter({ seat, mine: { deck: teamOrder(create, seat), extra: create.decks[seat]!.extra }, theirs: { deck: create.decks[1 - seat]!.main.length, extra: create.decks[1 - seat]!.extra.length }, lp: [8000, 8000], typeOf })
    const adapters: Adapter[] = [adapter(0), adapter(1)]
    const passive = passivePolicy()
    const done = new Set<string>()
    const unmapped: string[] = []
    let mark = 0
    const feed = () => {
      for (const event of events.slice(mark)) for (const seat of [0, 1] as const) unmapped.push(...adapters[seat]!.apply(event).unmapped)
      mark = events.length
    }
    const at = (list: readonly { code: number; location: number }[], code: number, location: number) => list.findIndex((card) => card.code === code && card.location === location)
    // Lo que el núcleo ofrece de Spirit, lo que la mesa del asiento de Blue-Eyes pone en su carta y dónde están sus Blue-Eyes.
    const look = (askId: number, ask: Extract<CoreAsk, { type: 'select_idlecmd' }>) => {
      const a = adapters[blue]!
      const id = a.mine.emz[emz - 5]?.id ?? null
      const items = openAsk({ askId, ask }, { queries: a, prefs: { chainMode: 'ask', placeMode: 'ask' }, typeOf }).base.items
      const count = (ids: readonly string[]) => ids.filter((other) => a.codeOf({ side: 'mine', id: other }) === bewd).length

      return {
        core: ask.activates.filter((card) => card.code === SPIRIT).map((card) => ({ controller: card.controller, location: card.location, sequence: card.sequence })),
        id,
        items: id ? (items.get(id) ?? []).map((item) => item.label) : [],
        limits: a.overlay.limits[blue].map((description) => splitDesc(description).code).sort(),
        bewd: { hand: count(a.mine.hand), grave: count(a.mine.gy) },
        // Lo que la mesa sabe con certeza de por qué una carta no tiene jugadas (`turnReasons`): de una del campo, nada; el cartel dice entonces «El automático no ofrece jugadas…».
        why: id ? turnReasons({ state: a.mine, id, kind: { monster: true, fieldSpell: false }, turnMine: true, ask: ask.type, normal: a.overlay.normal[blue] }) : null,
      }
    }
    const looks: ReturnType<typeof look>[] = []

    await host.handle(create)
    feed()
    for (let n = 0; n < 400; n += 1) {
      const asked = events.findLast((event) => event.t === 'ask')
      if (!asked || asked.t !== 'ask' || events.some((event) => event.t === 'end')) break
      const q = asked.ask
      let answer: CoreAnswer = passive(q)

      if (q.type === 'select_idlecmd' && q.player === rival && !done.has('pot') && at(q.activates, POT, L.HAND) >= 0) {
        done.add('pot')
        answer = { type: q.type, action: 5, index: at(q.activates, POT, L.HAND) }
      } else if (q.type === 'select_chain' && q.player === blue && done.has('pot') && !done.has('dominus') && at(q.selects, DOMINUS, L.HAND) >= 0) {
        done.add('dominus')
        answer = { type: q.type, index: at(q.selects, DOMINUS, L.HAND) }
      } else if (q.type === 'select_idlecmd' && q.player === blue && done.has('dominus')) {
        if (grave && !done.has('foolish') && at(q.activates, FOOLISH, L.HAND) >= 0) {
          done.add('foolish')
          answer = { type: q.type, action: 5, index: at(q.activates, FOOLISH, L.HAND) }
        } else if (!done.has('maiden') && at(q.summons, MAIDEN, L.HAND) >= 0) {
          done.add('maiden')
          answer = { type: q.type, action: 0, index: at(q.summons, MAIDEN, L.HAND) }
        } else if (!done.has('spirit') && at(q.special_summons, SPIRIT, L.EXTRA) >= 0) {
          done.add('spirit')
          answer = { type: q.type, action: 1, index: at(q.special_summons, SPIRIT, L.EXTRA) }
        } else if (done.has('spirit') && !done.has('roar') && at(q.activates, ROAR, L.HAND) >= 0) {
          done.add('roar')
          answer = { type: q.type, action: 5, index: at(q.activates, ROAR, L.HAND) }
        } else if (done.has('roar')) {
          looks.push(look(asked.askId, q))
          if (done.has('undone') || deckOnly) break
          // Una vez: se activa y se deshace (`rewind` a antes de esa respuesta, como `session.undo`), y se vuelve a mirar con mesas rearmadas desde cero.
          done.add('undone')
          const before = host.answers.length

          await host.handle({ t: 'answer', askId: asked.askId, answer: { type: q.type, action: 5, index: at(q.activates, SPIRIT, L.MZONE) } })
          expect(host.answers.length).toBe(before + 1)
          await host.handle({ t: 'rewind', to: before })
          adapters.splice(0, 2, adapter(0), adapter(1))
          events.splice(0, events.findIndex((event, i) => i >= mark && event.t === 'loading'))
          mark = 0
          feed()
          continue
        }
      } else if (q.type === 'select_card' && q.player === blue && done.has('foolish') && !done.has('buried')) {
        done.add('buried')
        answer = { type: q.type, indices: [q.selects.findIndex((card) => card.code === bewd)] }
      } else if (q.type === 'select_place' && q.player === blue && done.has('spirit') && !done.has('placed')) {
        const place = freePlaces(q).find((free) => free.player === blue && free.location === L.MZONE && free.sequence === emz)

        if (place) {
          done.add('placed')
          answer = { type: q.type, places: [place] }
        }
      }
      await host.handle({ t: 'answer', askId: asked.askId, answer })
      feed()
    }
    host.handle({ t: 'destroy' })
    return { done, looks, unmapped }
  }

  it.each<Case>([
    { blue: 1, emz: 5 },
    { blue: 1, emz: 6 },
    { blue: 0, emz: 5 },
    { blue: 0, emz: 6 },
    { blue: 1, emz: 6, grave: true },
    { blue: 1, emz: 6, bewd: BEWD_ALT },
  ])('Blue-Eyes en el asiento $blue, Spirit en la zona $emz (Cementerio: $grave, código $bewd): el núcleo ofrece su efecto y la mesa lo pone en la carta, también al deshacer', async (input) => {
    expect([SPIRIT, MAIDEN, BEWD, BEWD_ALT, ROAR, DOMINUS, POT, FOOLISH].filter((code) => !cards.has(code))).toEqual([])
    const { done, looks, unmapped } = await play(input)

    expect([...done]).toEqual([...['pot', 'dominus'], ...(input.grave ? ['foolish', 'buried'] : []), ...['maiden', 'spirit', 'placed', 'roar', 'undone']])
    expect(unmapped).toEqual([])
    expect(looks).toHaveLength(2)
    for (const seen of looks) {
      expect(seen.core).toEqual([{ controller: input.blue, location: L.MZONE, sequence: input.emz }])
      expect(seen.id).not.toBeNull()
      expect(seen.items).toEqual(['Activar efecto'])
      expect(seen.limits).toEqual([ROAR, DOMINUS].sort())
      expect(seen.bewd).toEqual(input.grave ? { hand: 0, grave: 1 } : { hand: 1, grave: 0 })
    }
  }, 120_000)

  it('sin ningún Blue-Eyes en la mano ni en el Cementerio (el que quedaba en el Deck lo trajo Roar): el núcleo no ofrece el efecto y la mesa no sabe decir por qué', async () => {
    const { done, looks, unmapped } = await play({ blue: 1, emz: 6, deckOnly: true })

    expect([...done]).toEqual(['pot', 'dominus', 'maiden', 'spirit', 'placed', 'roar'])
    expect(unmapped).toEqual([])
    expect(looks).toEqual([{ core: [], id: expect.any(String), items: [], limits: [ROAR, DOMINUS].sort(), bewd: { hand: 0, grave: 0 }, why: [] }])
  }, 120_000)
})

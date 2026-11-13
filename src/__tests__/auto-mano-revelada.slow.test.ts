import { createDataLoader } from '../app/auto/auto-data'
import { createAutoSession, type AutoSession, type AutoSnapshot, type TransportFactory } from '../app/auto/auto-session'
import { localTransport } from '../app/auto/core-host'
import type { DeckList } from '../app/auto/deck-map'
import { passivePolicy } from '../app/auto/policies'
import { LOCATION as L, type AutoEvent, type CoreAsk, type EventOf, type WireEvent } from '../app/auto/protocol'
import { cardRows, hasCoreData, nodeSource, scriptStore, wasmBinary } from './support/core-data'

/**
 * Los efectos que te muestran la mano del rival, con el núcleo real (lento: `npm run test:auto`; se salta sin datos). Las tres formas de la familia, con cartas de verdad y sus
 * scripts: mirarla una vez y barajar (Mind Haxorz: `ConfirmCards` y `ShuffleHand` en la misma tanda), mirarla y elegir (Confiscation: `ConfirmCards` y `Select` sobre su mano) y
 * dejarla a la vista (Ceremonial Bell: `EFFECT_PUBLIC`, sin mensaje: el anfitrión consulta la mano); y el otro sentido (Dragged Down into the Grave: los dos ven la mano del otro).
 */

const CONFISCATION = 17375316
const HAXORZ = 75392615
const BELL = 20228463
const DRAGGED = 16435215
const BEWD = 89631139

const settled = (session: AutoSession) =>
  new Promise<AutoSnapshot>((resolve) => {
    const check = () => {
      const snapshot = session.getSnapshot()

      if ((snapshot.status === 'ready' && snapshot.ask && !snapshot.replaying) || snapshot.status === 'ended' || snapshot.status === 'error') {
        off()
        resolve(snapshot)
      }
    }
    const off = session.subscribe(check)

    check()
  })

/** Tu duelo contra el rival pasivo, con la mano fija: jugás `card` (activarla, Invocarla o Colocarla) y lo demás, lo primero, hasta que `until` diga basta. `raw`: lo que le llega a cada asiento. */
async function play(card: number, until: (snapshot: AutoSnapshot) => boolean) {
  const raw: AutoEvent[][] = [[], []]
  const base = localTransport({ wasmBinary: wasmBinary() })
  const transport: TransportFactory = (data) => {
    const inner = base(data)

    return { ...inner, onEvent: (next) => inner.onEvent((event) => ('seat' in event && raw[event.seat]!.push(event), next(event))) }
  }
  const deck: DeckList = { main: [[card, 3], [BEWD, 37]], extra: [] }
  const session = createAutoSession({ loader: createDataLoader(nodeSource(cardRows(), scriptStore()), null), deck, hand: [card, BEWD, BEWD, BEWD, BEWD], handSize: 5, seed: 1, transport })
  const passive = passivePolicy()
  let snapshot = await settled(session)

  for (let n = 0; n < 80 && snapshot.status === 'ready' && !until(snapshot); n += 1) {
    const ask = snapshot.ask!.ask as CoreAsk
    let answer = passive(ask)

    if (ask.type === 'select_idlecmd') {
      const lists = [ask.summons, ask.special_summons, ask.pos_changes, ask.monster_sets, ask.spell_sets, ask.activates] as const
      const own = [5, 0, 4].map((action) => [action, lists[action]!.findIndex((item) => item.code === card)] as const).find(([, index]) => index >= 0)

      answer = own ? { type: 'select_idlecmd', action: own[0], index: own[1] } : ask.to_ep ? { type: 'select_idlecmd', action: 7, index: null } : answer
    }
    session.answer(answer)
    snapshot = await settled(session)
  }

  const events = (seat: 0 | 1) => raw[seat].flatMap((event): WireEvent[] => (event.t === 'events' ? event.events : []))
  const confirms = (seat: 0 | 1) => events(seat).filter((event): event is EventOf<'confirm_cards'> => event.type === 'confirm_cards')

  return { session, snapshot, raw, events, confirms }
}

const publicHand = (session: AutoSession, snapshot: AutoSnapshot) => snapshot.theirs.hand.map((id) => session.adapter!.publicInHand({ side: 'theirs', id }))

describe.skipIf(!hasCoreData)('la mano del rival que un efecto te muestra, con el núcleo real (npm run test:auto)', () => {
  it('Mind Haxorz (mirar y barajar en la misma tanda): la mesa recibe lo que se vio (`seen`), con la carta del efecto; su abanico lo pierde al barajar', async () => {
    const { session, snapshot, events, confirms } = await play(HAXORZ, (now) => now.theirsActs.some((wire) => wire.seen))
    const [shown] = confirms(0)
    const seen = snapshot.theirsActs.find((wire) => wire.seen)!.seen!

    session.destroy()
    expect(shown!.cards.every((card) => card.controller === 1 && card.location === L.HAND && card.code !== 0)).toBe(true)
    expect(events(0).slice(events(0).indexOf(shown!)).some((event) => event.type === 'shuffle_hand' && event.player === 1)).toBe(true)
    expect(seen.codes).toEqual(shown!.cards.map((card) => card.code))
    expect(seen.ids).toHaveLength(shown!.cards.length)
    expect(seen.by).toBe(HAXORZ)
    // Barajada su mano, nadie sabe cuál es cuál: de dorso otra vez.
    expect(publicHand(session, snapshot)).toEqual(snapshot.theirs.hand.map(() => 0))
  }, 60_000)

  it('Confiscation (mirar y elegir): la pregunta llega con sus cartas en 0, pero el adaptador las recuerda y su abanico queda cara arriba hasta que se baraje', async () => {
    const { session, snapshot, confirms } = await play(CONFISCATION, (now) => now.ask?.ask.type === 'select_card')
    const [shown] = confirms(0)
    const ask = snapshot.ask!.ask as Extract<CoreAsk, { type: 'select_card' }>
    const known = ask.selects.map((card) => session.adapter!.codeOf({ side: 'theirs', id: session.adapter!.idAt(card)! }))

    expect(ask.selects.every((card) => card.code === 0 && card.controller === 1 && card.location === L.HAND)).toBe(true)
    expect(known.toSorted()).toEqual(shown!.cards.map((card) => card.code).toSorted())
    expect(publicHand(session, snapshot).toSorted()).toEqual(known.toSorted())
    session.answer({ type: 'select_card', indices: [0] })
    const after = await settled(session)

    session.destroy()
    expect(publicHand(session, after)).toEqual(after.theirs.hand.map(() => 0))
  }, 60_000)

  it('Ceremonial Bell (la mano a la vista): la ven los dos asientos mientras rige; antes, ninguno', async () => {
    const { session, snapshot, raw } = await play(BELL, (now) => now.mine.mz.some(Boolean) && now.overlay.turn > 1)
    const handStats = (seat: 0 | 1) => raw[seat].flatMap((event) => (event.t === 'stats' ? event.cards.filter((card) => card.location === L.HAND) : []))
    const firstPublic = raw[0].findIndex((event) => event.t === 'stats' && event.cards.some((card) => card.location === L.HAND))

    session.destroy()
    expect(firstPublic).toBeGreaterThan(0)
    // Antes de la campana, ni la tuya ni la del rival viajan.
    expect(raw[0].slice(0, firstPublic).some((event) => event.t === 'stats' && event.cards.some((card) => card.location === L.HAND))).toBe(false)
    expect(publicHand(session, snapshot).every((code) => code !== 0)).toBe(true)
    expect(handStats(1).some((card) => card.controller === 0 && card.code === BEWD)).toBe(true)
  }, 60_000)

  it('Dragged Down into the Grave (los dos sentidos): vos ves la del rival (`seen`) y él la tuya (con sus códigos); a vos no te llega `seen` de lo tuyo', async () => {
    const { session, snapshot, confirms } = await play(DRAGGED, (now) => now.ask?.ask.type === 'select_card')
    const rivalSaw = confirms(1).find((event) => event.player === 1)!

    session.destroy()
    expect(rivalSaw.cards.every((card) => card.controller === 0 && card.code === BEWD)).toBe(true)
    expect(snapshot.theirsActs.filter((wire) => wire.seen).flatMap((wire) => wire.seen!.ids).every((id) => snapshot.theirs.hand.includes(id))).toBe(true)
    expect(snapshot.theirsActs.some((wire) => wire.seen?.by === DRAGGED)).toBe(true)
    // Tu mano mostrada es «Mostrás» en tu mesa.
    expect(snapshot.mineActions.at(-1)).toMatchObject({ type: 'batch', actions: Array(4).fill(expect.objectContaining({ type: 'reveal' })) })
  }, 60_000)
})

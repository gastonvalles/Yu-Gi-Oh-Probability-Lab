import { createDataLoader } from '../app/auto/auto-data'
import { createAutoSession, type AutoSession, type AutoSnapshot } from '../app/auto/auto-session'
import type { Bot } from '../app/auto/bot/bot'
import { BOT_DECKS } from '../app/auto/bot/decks'
import { localTransport } from '../app/auto/core-host'
import { passivePolicy } from '../app/auto/policies'
import { autoRival } from '../app/handtraps'
import { cardRows, hasCoreData, loadCards, nodeSource, scriptStore, wasmBinary } from './support/core-data'

/**
 * La regla general del Extra Deck con el núcleo real (lento: `npm run test:auto -- src/__tests__/auto-bot-extra.slow.test.ts`). Sky Striker contra el pasivo, hasta su turno 5:
 * donde antes terminaba el turno con un Enlace 1 del Extra ofrecido y sin usar (la vara, «sin usar»), ahora pasa el Enlace de su Zona Extra a ese (`executor.extra`), lo dice, el
 * ATK de lo suyo boca arriba no baja con esa Invocación y el núcleo no le rechaza nada. Elfnote y Angelechy no la usan con la vara de hoy: lo que les queda son piezas de su línea.
 */

const SEEDS = [7, 13, 29, 30]

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

describe.skipIf(!hasCoreData)('el bot usa el Extra Deck que le ofrecen (núcleo real)', () => {
  const source = nodeSource(hasCoreData ? cardRows() : [], hasCoreData ? scriptStore() : { read: () => null, has: () => false })
  const loader = createDataLoader(source, null)
  const wasm = hasCoreData ? wasmBinary() : new ArrayBuffer(0)
  const { cards } = hasCoreData ? loadCards() : { cards: new Map() }
  const deck = BOT_DECKS.find((item) => item.id === 'sky-striker')!

  it('Sky Striker: pasa el Enlace de su Zona Extra a otro que llega haciendo algo, sin bajar su ATK', { timeout: 10 * 60 * 1000 }, async () => {
    const { filler } = await source.manifest()
    const summons: { seed: number; atkBefore: number; atkAfter: number | null }[] = []
    const faults: string[] = []

    for (const seed of SEEDS) {
      const inner = deck.bot((code) => cards.get(code), (code) => cards.get(code)?.alias ?? 0, (code) => cards.get(code)?.attribute ?? 0)
      const atk = (view: Parameters<Bot>[1]) => view.me.monsters.reduce((sum, card) => sum + (card && card.pos !== 'set' ? Math.max(0, card.stats?.attack ?? 0) : 0), 0)
      let open: (typeof summons)[number] | null = null
      const bot: Bot = (ask, view, context) => {
        const decision = inner(ask, view, context)

        // Lo de su campo en la pregunta siguiente a la Invocación (su Main Phase de nuevo) contra lo de antes.
        if (open && ask.type === 'select_idlecmd') {
          open.atkAfter = atk(view)
          open = null
        }
        if (decision.rule === 'executor.extra') {
          expect(decision.reason?.key).toMatch(/^auto\.bot\.reason\.play\.fromExtra/)
          open = { seed, atkBefore: atk(view), atkAfter: null }
          summons.push(open)
        }
        return decision
      }
      const session = createAutoSession({
        loader,
        deck: { main: filler.map((code) => [code, 1] as const), extra: [] },
        seed,
        botSeed: seed,
        seat: 1,
        transport: localTransport({ wasmBinary: wasm }),
        rival: autoRival({ enabled: false, picks: [], hand: 3, botDeck: 'sky-striker' }),
        bot,
        onEvent: (event) => {
          if (event.t === 'fault' && !event.kind.startsWith('script')) faults.push(`${seed} ${event.kind}: ${event.message.slice(0, 120)}`)
        },
      })
      const passive = passivePolicy()
      let snapshot = await settled(session)

      for (let n = 0; n < 3000 && snapshot.status === 'ready' && snapshot.overlay.turn <= 5; n += 1) {
        session.answer(passive(snapshot.ask!.ask))
        snapshot = await settled(session)
      }
      session.destroy()
    }

    expect(faults).toEqual([])
    expect(summons.length).toBeGreaterThan(0)
    for (const item of summons.filter((summon) => summon.atkAfter !== null)) expect(item.atkAfter!).toBeGreaterThanOrEqual(item.atkBefore)
  })
})

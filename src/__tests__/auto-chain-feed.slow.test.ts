import { createDataLoader } from '../app/auto/auto-data'
import { createAutoSession, type AutoSession, type AutoSnapshot } from '../app/auto/auto-session'
import { chainFeed } from '../app/auto/chain-feed'
import { localTransport } from '../app/auto/core-host'
import type { DeckList } from '../app/auto/deck-map'
import { passivePolicy } from '../app/auto/policies'
import { LOCATION } from '../app/auto/protocol'
import { linksOf, pileLinksOf } from '../app/card-glow'
import { autoRival, type HandtrapConfig } from '../app/handtraps'
import { panelChainsOf } from '../components/auto/step-chains'
import { cardRows, hasCoreData, nodeSource, scriptStore, wasmBinary } from './support/core-data'

/**
 * El aviso de la cadena contra el núcleo real (lento: `npm run test:auto`; se salta sin datos): activás Terraforming, el rival responde con Ash Blossom y la cadena de dos
 * eslabones llega de una. Los pasos que anota el adaptador (`chainSteps`) la cuentan en orden: CL1 tuyo, CL2 suyo, se resuelve primero CL2 y después CL1 (sin efecto), y fin.
 * Y el costo, para la lista de pasos: el núcleo lo paga después de anotar el eslabón.
 */

const ASH = 14558127
const TERRAFORMING = 73628505
const SOGEN = 86318356
const POT = 55144522
const DESIRES = 35261759
const THUNDER_DRAGON = 31786629
const CALLED_BY = 24224830
const GAMMA = 38814750
const DRIVER = 49036338

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

/**
 * Activa `card` (la primera de la mano) en tu primera Main Phase y contesta lo demás como el rival pasivo, hasta que vuelven tus jugadas del turno. Con `respond` (la segunda de la
 * mano), la encadenás en cuanto el núcleo te la ofrece.
 */
async function activateFromHand(card: number, deck: DeckList, rival?: HandtrapConfig, respond?: number): Promise<AutoSnapshot> {
  const session = createAutoSession({
    loader: createDataLoader(nodeSource(cardRows(), scriptStore()), null),
    deck,
    hand: respond ? [card, respond] : [card],
    handSize: respond ? 2 : 1,
    seed: 1,
    transport: localTransport({ wasmBinary: wasmBinary() }),
    ...(rival ? { rival: autoRival(rival) } : {}),
  })
  const passive = passivePolicy()
  let snapshot = await settled(session)
  let activated = false

  for (let n = 0; n < 40 && snapshot.status === 'ready' && !(activated && snapshot.ask?.ask.type === 'select_idlecmd'); n += 1) {
    const ask = snapshot.ask!.ask

    if (ask.type === 'select_idlecmd' && !activated) {
      activated = true
      session.answer({ type: ask.type, action: 5, index: ask.activates.findIndex((active) => active.code === card) })
    } else if (ask.type === 'select_chain' && respond && ask.selects.some((active) => active.code === respond)) session.answer({ type: ask.type, index: ask.selects.findIndex((active) => active.code === respond) })
    else session.answer(passive(ask))
    snapshot = await settled(session)
  }
  session.destroy()
  return snapshot
}

describe.skipIf(!hasCoreData)('el aviso de la cadena contra el núcleo real (npm run test:auto)', () => {
  it('Terraforming respondida por Ash: se arma CL1 → CL2 y se resuelve CL2 → CL1, con lo negado en su eslabón (el núcleo lo niega mientras se resuelve Ash)', async () => {
    const snapshot = await activateFromHand(TERRAFORMING, { main: [[TERRAFORMING, 1], [SOGEN, 1], [POT, 1]], extra: [] }, { enabled: true, picks: [{ id: ASH, name: 'Ash Blossom & Joyous Spring', copies: 1 }], hand: 1 })
    const steps = snapshot.chainSteps
    const start = steps.findIndex((step) => step.kind === 'chain' && step.link?.code === TERRAFORMING)
    const chain = steps.slice(start, steps.findIndex((step, i) => i > start && step.kind === 'end') + 1)

    expect(start).toBeGreaterThanOrEqual(0)
    expect(chain.map((step) => `${step.kind}:${step.index}`)).toEqual(['chain:0', 'chain:1', 'solving:1', 'disabled:0', 'solved:1', 'solving:0', 'solved:0', 'end:-1'])
    // Quién la negó (`by`, deducido: el eslabón que se resolvía cuando llegó la negación): CL2, Ash.
    expect(chain.find((step) => step.kind === 'disabled')?.by).toBe(2)
    expect(chain.filter((step) => step.kind === 'chain').map((step) => [step.link?.code, step.link?.mine])).toEqual([[TERRAFORMING, true], [ASH, false]])
    // Cada paso, cuando la mesa contó hasta ahí (Terraforming boca arriba en su casilla, antes que su eslabón) y nunca después de lo que hay.
    expect(chain.every((step, i) => step.at <= snapshot.mineActions.length && (i === 0 || step.at >= chain[i - 1]!.at))).toBe(true)
    expect(['place', 'activate']).toContain(snapshot.mineActions[chain[0]!.at - 1]?.type)
    expect(chainFeed(steps, start + chain.length)).toMatchObject({ done: true, rows: [{ number: 1, code: TERRAFORMING, state: 'disabled' }, { number: 2, code: ASH, state: 'solved' }] })
    // Desde dónde se activó cada una (`triggering_location`): Terraforming ya en su casilla de Mágicas y Trampas; Ash, desde la mano del rival (el rótulo «desde la mano» de su insignia).
    expect(chain.flatMap((step) => (step.link ? [step.link.from] : []))).toEqual([LOCATION.SZONE, LOCATION.HAND])
    // La insignia se busca por id en la mesa de ahora: terminada la cadena, las dos cartas están en su Cementerio y sus insignias con ellas.
    const links = linksOf(chainFeed(steps, start + chain.length))
    const terraforming = chain[0]!.link!.card!
    const ash = chain[1]!.link!.card!

    expect([terraforming.side, ash.side]).toEqual(['mine', 'theirs'])
    expect(snapshot.mine.gy).toContain(terraforming.id)
    expect(snapshot.theirs.gy).toContain(ash.id)
    expect(pileLinksOf(snapshot.mine.gy, links.mine)).toEqual({ numbers: [1], mine: true, fromHand: false, voided: { state: 'disabled', by: 2 } })
    expect(pileLinksOf(snapshot.theirs.gy, links.theirs)).toEqual({ numbers: [2], mine: false, fromHand: true })
    // La lista de pasos (`panelChainsOf`, sin plegar nada): «sin efecto» en la jugada de Terraforming (la que la abrió) y el cierre con los dos eslabones después del último paso de la cadena.
    const panel = panelChainsOf(steps, steps.length, snapshot.mineActions, 0, (link) => String(link.code))
    const [markAt] = [...panel.marks].find(([, mark]) => mark.result?.negated) ?? []

    expect(snapshot.mineActions[markAt! - 1]).toMatchObject({ id: chain[0]!.link!.card!.id })
    expect(panel.marks.get(markAt!)?.result).toEqual({ negated: true, by: 2 })
    expect(panel.ends.get(chain.at(-1)!.at)?.[0]?.links).toEqual([{ number: 1, name: String(TERRAFORMING), state: 'disabled', by: 2 }, { number: 2, name: String(ASH), state: 'solved' }])
  }, 60_000)

  // Tres eslabones: Terraforming, Ash y tu respuesta a Ash. Cada caso, como lo cuenta el adaptador: los eslabones, las negaciones ([CLn, by]) y el estado final de cada fila.
  const threeLinks = async (respond: number, extra: [number, number][] = []) => {
    const snapshot = await activateFromHand(TERRAFORMING, { main: [[TERRAFORMING, 1], [respond, 1], ...extra, [SOGEN, 1], [POT, 1]], extra: [] }, { enabled: true, picks: [{ id: ASH, name: 'Ash Blossom & Joyous Spring', copies: 1 }], hand: 1 }, respond)
    const steps = snapshot.chainSteps
    const start = steps.findIndex((step) => step.kind === 'chain' && step.link?.code === TERRAFORMING)
    const chain = steps.slice(start, steps.findIndex((step, i) => i > start && step.kind === 'end') + 1)

    return {
      links: chain.filter((step) => step.kind === 'chain').map((step) => step.link?.code),
      negations: chain.filter((step) => step.kind === 'negated' || step.kind === 'disabled').map((step) => [step.kind, step.index + 1, step.by]),
      rows: chainFeed(steps, start + chain.length)?.rows.map((row) => [row.number, row.state, row.by]),
    }
  }

  it('tres eslabones: PSY-Framegear Gamma niega la activación de Ash mientras se resuelve: «Negada · por CL3», y Terraforming se resuelve', async () => {
    expect(await threeLinks(GAMMA, [[DRIVER, 1]])).toEqual({
      links: [TERRAFORMING, ASH, GAMMA],
      negations: [['negated', 2, 3]],
      rows: [[1, 'solved', undefined], [2, 'negated', 3], [3, 'solved', undefined]],
    })
  }, 60_000)

  it('tres eslabones: Called by the Grave le quita el efecto a Ash, pero el núcleo lo dice al llegarle el turno a Ash (no mientras se resuelve Called by): sin «por CLn»', async () => {
    expect(await threeLinks(CALLED_BY)).toEqual({
      links: [TERRAFORMING, ASH, CALLED_BY],
      negations: [['disabled', 2, undefined]],
      rows: [[1, 'solved', undefined], [2, 'disabled', undefined], [3, 'solved', undefined]],
    })
  }, 60_000)

  it.each([
    ['Pot of Desires destierra 10 del deck boca abajo', DESIRES, 10, 'place'],
    ['Thunder Dragon se descarta a sí mismo', THUNDER_DRAGON, 1, 'activate'],
  ])('el costo llega después del eslabón y antes de resolverse: %s', async (_, card, cost, opened) => {
    const filler = [SOGEN, POT, TERRAFORMING, ASH, 83764718, 5318639, 44095762, 53129443, 10045474].map((code): [number, number] => [code, 3])
    const snapshot = await activateFromHand(card, { main: [[card, 3], ...filler], extra: [] })
    const panel = panelChainsOf(snapshot.chainSteps, snapshot.chainSteps.length, snapshot.mineActions, 0, String)
    const marks = [...panel.marks].map(([at, mark]) => [snapshot.mineActions[at - 1]!.type, mark.cost ?? false] as const)

    expect(marks).toEqual([[opened, false], ...Array.from({ length: cost }, () => ['move', true] as const)])
  }, 60_000)
})

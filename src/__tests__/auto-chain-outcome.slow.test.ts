import { chainFeed } from '../app/auto/chain-feed'
import { hasCoreData } from './support/core-data'
import { handtrapDuels, type DuelScenario } from './support/handtrap-duel'

/**
 * Qué hizo cada eslabón (`ChainStep.outcome`, `chainOutcome`) contra el núcleo real (lento: `npm run test:auto`; se salta sin datos). Lo que el núcleo cuenta entre `chain_solving`
 * y `chain_solved`: buscar, robar, revivir, mandar al Cementerio; y lo que hace dos cosas a la vez (Graceful Charity) se calla. La Mágica que se resolvió se va al Cementerio
 * después de `chain_solved`: no cuenta.
 */

const TERRAFORMING = 73628505
const SOGEN = 86318356
const POT = 55144522
const FOOLISH = 81439173
const REBORN = 83764718
const DARK_HOLE = 53129443
const CHARITY = 79571449
const BLUE_EYES = 89631139
const ALEXANDRITE = 43096270

const off = { enabled: false, picks: [], hand: 0 }
const deck: [number, number][] = [[BLUE_EYES, 3], [ALEXANDRITE, 3], [SOGEN, 3]]

describe.skipIf(!hasCoreData)('lo que hizo cada eslabón, contra el núcleo real (npm run test:auto)', () => {
  const { duel } = handtrapDuels()
  /** Cada eslabón resuelto de tus cadenas, en orden: la carta y su `outcome` (sin él, null). */
  const outcomes = async (scenario: DuelScenario) => {
    const { snapshot } = await duel(scenario, off)
    const steps = snapshot.chainSteps

    return steps.flatMap((step, i) => {
      if (step.kind !== 'solved') return []
      const row = chainFeed(steps, i + 1)!.rows[step.index]!

      return [[row.code, row.outcome ?? null]]
    })
  }

  it('Terraforming añade 1 carta (Deck → mano, no es un robo) y Pot of Greed roba 2', async () => {
    expect(await outcomes({ deck, hand: [TERRAFORMING], steps: [{ do: 'activate', code: TERRAFORMING }] })).toEqual([[TERRAFORMING, { kind: 'add', count: 1 }]])
    expect(await outcomes({ deck, hand: [POT], steps: [{ do: 'activate', code: POT }] })).toEqual([[POT, { kind: 'draw', count: 2 }]])
  }, 120_000)

  it('Foolish Burial manda 1 al Cementerio y Monster Reborn invoca 1 monstruo', async () => {
    expect(await outcomes({ deck, hand: [FOOLISH, REBORN], steps: [{ do: 'activate', code: FOOLISH }, { do: 'activate', code: REBORN }], wants: [BLUE_EYES] })).toEqual([
      [FOOLISH, { kind: 'grave', count: 1 }],
      [REBORN, { kind: 'summon', count: 1 }],
    ])
  }, 120_000)

  it('Dark Hole: «Manda 1 al Cementerio», nunca «Destruye» (el núcleo no dice por qué se movió); Graceful Charity roba y descarta: se calla', async () => {
    expect(await outcomes({ deck, hand: [ALEXANDRITE, DARK_HOLE], steps: [{ do: 'summon', code: ALEXANDRITE }, { do: 'activate', code: DARK_HOLE }] })).toEqual([[DARK_HOLE, { kind: 'grave', count: 1 }]])
    expect(await outcomes({ deck, hand: [CHARITY], steps: [{ do: 'activate', code: CHARITY }] })).toEqual([[CHARITY, null]])
  }, 120_000)
})

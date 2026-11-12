// @vitest-environment jsdom
import { act, screen, within } from '@testing-library/react'
import '@testing-library/jest-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { CHAIN_LINK_MS, type ChainStep } from '../app/auto/chain-feed'
import { AutoSoloScreen } from '../components/auto/AutoSoloScreen'
import type { MatCard } from '../components/probability/PracticeMat'
import { CARDS, fakeSession } from './support/auto-session-fake'
import { core } from './support/auto-screen-harness'
import { card, render } from './support/practice-mat-harness'

// La cadena en grande en escritorio con el detalle fijo: cada carta con el número del color de su dueño y, en el detalle, la del eslabón con la frase de su efecto resaltada.

const { fetchCardsByIds } = vi.hoisted(() => ({ fetchCardsByIds: vi.fn() }))

vi.mock('../ygoprodeck', async (importOriginal) => ({ ...(await importOriginal<typeof import('../ygoprodeck')>()), fetchCardsByIds }))

const ASH_EFFECT = 'When a card or effect is activated that includes any of these effects (Quick Effect): You can discard this card; negate that effect.'
const ASH_TEXT = `${ASH_EFFECT}\r\n● Add a card from the Deck to the hand.\r\nYou can only use this effect of "Ash Blossom & Joyous Spring" once per turn.`
const BLUE_EYES_EFFECT = 'During either player\'s turn (Quick Effect): You can banish this card from your GY; draw 1 card.'
const stringId = (code: number, n: number) => String((BigInt(code) << 20n) | BigInt(n))
/** Tu Ash (en la mano, código 100) con su texto; el resto, las de siempre. */
const WITH_TEXT: ReadonlyMap<string, MatCard> = new Map([...CARDS].map(([id, entry]): [string, MatCard] => [id, id === 'card-100-1' ? { ...entry, apiCard: { ...card(100, 'effect'), description: ASH_TEXT } } : entry]))
const link = (index: number, mine: boolean): ChainStep => ({ kind: 'chain', at: 0, index, link: mine ? { card: { side: 'mine', id: 'card-100-1' }, code: 100, mine, description: stringId(100, 0) } : { card: { side: 'theirs', id: 'c1' }, code: 700, mine, description: stringId(700, 0) } })

beforeEach(() => {
  const media = window.matchMedia

  window.matchMedia = ((query: string) => ({ ...media(query), matches: query.includes('reduce') || query === '(min-width: 1101px)' || query === '(min-width: 1440px)' })) as typeof window.matchMedia
  fetchCardsByIds.mockReset()
  fetchCardsByIds.mockResolvedValue([{ ...card(700, 'effect'), name: 'Blue-Eyes White Dragon', description: BLUE_EYES_EFFECT }])
})

function mountChain() {
  const fake = fakeSession()

  render(<AutoSoloScreen mainIds={[...WITH_TEXT.keys()].filter((id) => id !== 'card-500-1')} extraIds={['card-500-1']} cardsById={WITH_TEXT} deckName="Test" onExit={() => {}} connect={() => fake} />)
  core(() => fake.set({ chainSteps: [link(0, true), link(1, false)] }))
  act(() => vi.advanceTimersByTime(0))
  // En escritorio va en su capa, sobre la columna del medio (sin el detalle ni los pasos) y sin atajar toques: no hay línea bajo el campo.
  const layer = screen.getByTestId('duel-chain-layer')

  expect(layer).toContainElement(screen.getByTestId('chain-notice'))
  expect(layer).toHaveClass('pointer-events-none', 'min-[1101px]:right-[var(--mat-right,20rem)]', 'min-[1440px]:left-[var(--mat-left,20rem)]')

  return fake
}

// Con o sin pestañas (la columna de escritorio lo esconde detrás de «Carta»), el detalle es el mismo.
const dock = () => screen.getByRole('region', { name: 'Detalle de la carta', hidden: true })
/** Lo resaltado en el detalle (la frase puede venir partida: la condición, la velocidad y el costo llevan su marca). */
const marked = () => [...dock().querySelectorAll('[data-highlight]')].map((mark) => mark.textContent).join('')
const number = (name: string) => screen.getByRole('img', { name }).querySelector('[data-chain-number]')

describe('auto-screen · la cadena en grande, en escritorio', () => {
  it('cada carta lleva su número (blanco y celeste para los dos, como en Master Duel), un nombre que dice de quién es y, sin imagen, el color de su tipo (la del rival, por YGOPRODeck)', async () => {
    mountChain()
    act(() => vi.advanceTimersByTime(CHAIN_LINK_MS))
    await act(async () => {})

    expect(number('Eslabón 1: Ash Blossom, tuyo. En espera')).toHaveAttribute('data-chain-number', '1')
    expect(number('Eslabón 2: Blue-Eyes White Dragon, del rival. En espera')).toHaveAttribute('data-chain-number', '2')
    const tone = (name: string) => [...new Set([...number(name)!.querySelectorAll('svg:not([data-chain-flash]) path')].map((path) => path.getAttribute('class')))].join()
    expect(tone('Eslabón 1: Ash Blossom, tuyo. En espera')).toBe(tone('Eslabón 2: Blue-Eyes White Dragon, del rival. En espera'))
    for (const card of screen.getAllByRole('img', { name: /^Eslabón \d:/ })) expect(card).toHaveClass(card.querySelector('img') ? 'bg-input' : 'bg-frame-effect')
  })

  it('el detalle de la izquierda muestra el eslabón del que habla la escena, con la frase de su efecto resaltada: el tuyo y el del rival, por su número', async () => {
    mountChain()
    expect(within(dock()).getByRole('heading', { name: 'Ash Blossom', hidden: true })).toBeInTheDocument()
    expect(marked()).toBe(ASH_EFFECT)

    act(() => vi.advanceTimersByTime(CHAIN_LINK_MS))
    await act(async () => {})
    expect(within(dock()).getByRole('heading', { name: 'Blue-Eyes White Dragon', hidden: true })).toBeInTheDocument()
    expect(marked()).toBe(BLUE_EYES_EFFECT)
  })
})
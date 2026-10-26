// @vitest-environment jsdom
import { act, fireEvent, screen, within } from '@testing-library/react'
import '@testing-library/jest-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { CHAIN_LINK_MS, type ChainStep } from '../app/auto/chain-feed'
import { AutoSoloScreen } from '../components/auto/AutoSoloScreen'
import type { MatCard } from '../components/probability/PracticeMat'
import { CARDS, fakeSession } from './support/auto-session-fake'
import { core } from './support/auto-screen-harness'
import { card, render } from './support/practice-mat-harness'

// La pila de la cadena en escritorio con el detalle fijo: cada eslabón con el color de su dueño y, al tocarlo, su carta en el detalle con la frase de su efecto resaltada.

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
  // Los eslabones se muestran de a uno, con su ritmo.
  act(() => vi.advanceTimersByTime(0))
  act(() => vi.advanceTimersByTime(CHAIN_LINK_MS))
  fireEvent.click(within(screen.getByTestId('chain-notice')).getByRole('button', { name: 'Ver la cadena' }))

  return fake
}

const dock = () => screen.getByRole('region', { name: 'Detalle de la carta' })
/** Lo resaltado en el detalle (la frase puede venir partida: la condición, la velocidad y el costo llevan su marca). */
const marked = () => [...dock().querySelectorAll('[data-highlight]')].map((mark) => mark.textContent).join('')

describe('auto-screen · la pila de la cadena', () => {
  it('cada eslabón lleva el color de su dueño (el de las vidas) en su número y un nombre que dice de quién es', () => {
    mountChain()
    const mine = screen.getByRole('button', { name: 'Eslabón 1: Ash Blossom, tuyo. En espera' })
    const theirs = screen.getByRole('button', { name: 'Eslabón 2: Blue-Eyes White Dragon, del rival. En espera' })

    expect(within(mine).getByText('CL1')).toHaveClass('bg-accent/20')
    expect(within(theirs).getByText('CL2')).toHaveClass('bg-info/20')
    // La pila va del último al primero: el de arriba se resuelve primero.
    expect(within(screen.getByRole('list', { name: /^Eslabones de la cadena/ })).getAllByRole('button').map((row) => row.getAttribute('aria-label'))).toEqual([theirs.getAttribute('aria-label'), mine.getAttribute('aria-label')])
  })

  it('tocar tu eslabón lo fija en el detalle con la frase de su efecto resaltada; el del rival, por su número, también', async () => {
    mountChain()
    fireEvent.click(screen.getByRole('button', { name: /^Eslabón 1:/ }))
    expect(within(dock()).getByRole('heading', { name: 'Ash Blossom' })).toBeInTheDocument()
    expect(marked()).toBe(ASH_EFFECT)

    fireEvent.click(screen.getByRole('button', { name: /^Eslabón 2:/ }))
    await act(async () => {})
    expect(within(dock()).getByRole('heading', { name: 'Blue-Eyes White Dragon' })).toBeInTheDocument()
    expect(marked()).toBe(BLUE_EYES_EFFECT)
  })
})

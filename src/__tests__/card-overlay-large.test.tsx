// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import '@testing-library/jest-dom'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { CardOverlay } from '../components/card-detail/CardOverlay'
import type { ApiCardSearchResult } from '../ygoprodeck'

// La imagen que pide cada `CardArt` queda a la vista, para comparar cuál es.
vi.mock('../components/CardArt', () => ({
  CardArt: ({ name, remoteUrl }: { name: string; remoteUrl: string | null }) => <img alt={name} data-url={remoteUrl ?? ''} />,
}))

// Los artes de la carta (llegan de la red en la app): una impresión con su imagen grande y uno de YGOPRODeck sin ella.
vi.mock('../app/use-card-art-options', () => ({
  useCardArtOptions: () => [
    { id: 'print-1', imageUrl: 'https://tcg/print-1-200.jpg', imageUrlLarge: 'https://tcg/print-1-1000.jpg', printing: { rarity: 'Ultra Rare', code: 'X-001' } },
    { id: 'art-1', imageUrl: 'https://ygo/art-1.jpg' },
  ],
}))

afterEach(cleanup)

const card = {
  name: 'Maxx "C"',
  ygoprodeckId: 23434538,
  cardType: 'Effect Monster',
  frameType: 'effect',
  description: null,
  race: null,
  attribute: null,
  level: 2,
  linkValue: null,
  atk: '500',
  def: '200',
  archetype: null,
  ygoprodeckUrl: null,
  imageUrl: 'https://ygo/card.jpg',
  imageUrlSmall: null,
  banlist: { tcg: null, ocg: null, goat: null },
  genesys: { points: null },
} as ApiCardSearchResult

const open = (artId: string) =>
  render(
    <CardOverlay ariaLabel="Detalle" panelLabel="Panel" name="Maxx" card={card} initialArt={{ id: artId, imageUrl: 'https://tcg/ignored.jpg' }} onClose={vi.fn()}>
      <p>panel</p>
    </CardOverlay>,
  )
const shown = () => screen.getByRole('img', { name: 'Maxx' }).getAttribute('data-url')

describe('la carta del detalle del celular, agrandada', () => {
  it('la impresión elegida se agranda con su imagen grande (~1000 px), y vuelve a la de siempre al achicarla', () => {
    open('print-1')

    expect(shown()).toBe('https://tcg/print-1-200.jpg')
    fireEvent.click(screen.getByRole('button', { name: 'Ver la carta en grande' }))
    expect(shown()).toBe('https://tcg/print-1-1000.jpg')
    fireEvent.click(screen.getByRole('button', { name: 'Volver al detalle' }))
    expect(shown()).toBe('https://tcg/print-1-200.jpg')
  })

  it('un arte de YGOPRODeck (sin imagen grande) se agranda con la suya, sin cambiar', () => {
    open('art-1')

    fireEvent.click(screen.getByRole('button', { name: 'Ver la carta en grande' }))
    expect(shown()).toBe('https://ygo/art-1.jpg')
  })
})

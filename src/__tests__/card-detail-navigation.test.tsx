// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import '@testing-library/jest-dom'
import { useState } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { buildCardNavigation, neighborsAt } from '../app/card-neighbors'
import { CardDetailModal } from '../components/card-detail/CardDetailModal'
import { DeckBuilderClassicPreview } from '../components/deck-mode/DeckBuilderClassicPreview'
import type { ApiCardSearchResult } from '../ygoprodeck'

vi.mock('../components/CardArt', () => ({
  CardArt: ({ name }: { name: string }) => <img alt={name} />,
}))

afterEach(cleanup)

function cardOf(ygoprodeckId: number, name: string): ApiCardSearchResult {
  return {
    name,
    ygoprodeckId,
    cardType: 'Effect Monster',
    frameType: 'effect',
    description: `Texto de ${name}.`,
    race: 'Aqua',
    attribute: 'WATER',
    level: 4,
    linkValue: null,
    atk: '100',
    def: '600',
    archetype: null,
    ygoprodeckUrl: null,
    imageUrl: null,
    imageUrlSmall: null,
    banlist: { tcg: null, ocg: null, goat: null },
    genesys: { points: null },
  }
}

const CARDS = [cardOf(1, 'Alfa'), cardOf(2, 'Beta'), cardOf(3, 'Gamma')]

/** Lo que hace el dueño de la lista: sabe cuál está abierta, y cambia la carta (y las flechas) al pedirlo. */
function Harness({ onClose = vi.fn(), start = 0 }: { onClose?: () => void; start?: number }) {
  const [index, setIndex] = useState(start)
  const navigation = buildCardNavigation(neighborsAt(CARDS, index), (card) => setIndex(CARDS.indexOf(card)))

  return <CardDetailModal card={CARDS[index]!} deckFormat="unlimited" isOpen navigation={navigation} onAddToZone={() => false} onClose={onClose} />
}

const previous = () => screen.getByRole('button', { name: 'Carta anterior' })
const next = () => screen.getByRole('button', { name: 'Carta siguiente' })
const art = () => screen.getByRole('button', { name: /Ver la carta en grande|Volver al detalle/ })
const opened = (name: string) => expect(screen.getByRole('dialog', { name: `Detalle de ${name}` })).toBeInTheDocument()

function swipe(from: [number, number], to: [number, number], pointerType = 'touch') {
  fireEvent.pointerDown(art(), { pointerType, clientX: from[0], clientY: from[1] })
  fireEvent.pointerUp(art(), { pointerType, clientX: to[0], clientY: to[1] })
}

describe('el detalle pasa a la carta anterior y a la siguiente', () => {
  it('con las flechas: cambia la carta y el panel sin cerrar, y no las muestra hacia el lado donde no hay carta (la primera y la última)', () => {
    const onClose = vi.fn()
    render(<Harness onClose={onClose} />)

    opened('Alfa')
    expect(screen.queryByRole('button', { name: 'Carta anterior' })).not.toBeInTheDocument()
    expect(next()).toBeInTheDocument()

    fireEvent.click(next())
    opened('Beta')
    expect(screen.getByRole('heading', { name: 'Beta' })).toBeInTheDocument()
    expect(screen.getByText('Texto de Beta.')).toBeInTheDocument()
    expect(previous()).toBeInTheDocument()
    expect(next()).toBeInTheDocument()

    fireEvent.click(next())
    opened('Gamma')
    expect(screen.queryByRole('button', { name: 'Carta siguiente' })).not.toBeInTheDocument()

    fireEvent.click(previous())
    opened('Beta')
    expect(onClose).not.toHaveBeenCalled()
  })

  it('tocar una flecha (o el lugar que la rodea) no deja pasar el toque al fondo: no cierra el detalle', () => {
    const onClose = vi.fn()
    render(<Harness onClose={onClose} />)

    fireEvent.click(next().parentElement!)
    fireEvent.click(next())
    expect(onClose).not.toHaveBeenCalled()
  })

  it('con ← y → del teclado, sin pisar las teclas con modificadores ni los campos de texto', () => {
    render(<Harness />)
    const body = screen.getByRole('region', { name: 'Efecto' })

    fireEvent.keyDown(body, { key: 'ArrowRight' })
    opened('Beta')
    fireEvent.keyDown(body, { key: 'ArrowLeft' })
    opened('Alfa')

    fireEvent.keyDown(body, { key: 'ArrowRight', ctrlKey: true })
    fireEvent.keyDown(body, { key: 'ArrowRight', shiftKey: true })
    opened('Alfa')

    const field = document.createElement('input')
    screen.getByRole('dialog').append(field)
    fireEvent.keyDown(field, { key: 'ArrowRight' })
    opened('Alfa')

    // En la primera, ← no hace nada ni da la vuelta.
    fireEvent.keyDown(body, { key: 'ArrowLeft' })
    opened('Alfa')
  })

  it('el panel vuelve arriba y el foco no se pierde: se queda en la flecha o, si ésta se apaga, pasa al texto', () => {
    render(<Harness start={1} />)
    const body = screen.getByRole('region', { name: 'Efecto' })

    body.scrollTop = 120
    next().focus()
    fireEvent.click(next())

    opened('Gamma')
    expect(screen.getByRole('region', { name: 'Efecto' }).scrollTop).toBe(0)
    // Gamma es la última: la flecha en la que estaba el foco quedó apagada, y el foco va al texto.
    expect(screen.getByRole('region', { name: 'Efecto' })).toHaveFocus()

    previous().focus()
    fireEvent.click(previous())
    opened('Beta')
    expect(previous()).toHaveFocus()
  })

  it('con el dedo, deslizar la carta de costado pasa a la siguiente o a la anterior, sin agrandarla', () => {
    render(<Harness start={1} />)

    swipe([220, 100], [120, 106])
    opened('Gamma')
    // El clic que deja el deslizamiento no es un toque: no agranda la carta.
    fireEvent.click(art())
    expect(art()).toHaveAttribute('aria-label', 'Ver la carta en grande')

    swipe([120, 100], [220, 94])
    opened('Beta')
  })

  it('no confunde un toque, un gesto corto, uno vertical ni el mouse con deslizar', () => {
    render(<Harness start={1} />)

    swipe([200, 100], [200, 100])
    swipe([200, 100], [180, 100])
    swipe([200, 100], [100, 260])
    swipe([200, 100], [100, 100], 'mouse')
    opened('Beta')

    // Un toque común agranda la carta, como siempre.
    fireEvent.click(art())
    expect(art()).toHaveAttribute('aria-label', 'Volver al detalle')
  })

  it('con la carta agrandada, deslizar sigue pasando de carta (y las flechas se esconden con el panel)', () => {
    render(<Harness start={1} />)

    fireEvent.click(art())
    swipe([220, 100], [100, 100])
    opened('Gamma')
    expect(art()).toHaveAttribute('aria-label', 'Volver al detalle')
  })

  it('sin lista o sin vecinos, no hay flechas ni teclas', () => {
    const modal = (navigation?: { onPrevious: null; onNext: null } | null) => (
      <CardDetailModal card={CARDS[0]!} deckFormat="unlimited" isOpen navigation={navigation} onAddToZone={() => false} onClose={vi.fn()} />
    )
    const { rerender } = render(modal())

    expect(screen.queryByRole('button', { name: 'Carta anterior' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Carta siguiente' })).not.toBeInTheDocument()

    rerender(modal({ onPrevious: null, onNext: null }))
    expect(screen.queryByRole('button', { name: 'Carta siguiente' })).not.toBeInTheDocument()
    fireEvent.keyDown(screen.getByRole('region', { name: 'Efecto' }), { key: 'ArrowRight' })
    opened('Alfa')
  })

  it('cambiar la carta del detalle no vuelve a armar el marco', () => {
    function Swap() {
      const [card, setCard] = useState(CARDS[0]!)
      return (
        <>
          <button type="button" onClick={() => setCard(CARDS[1]!)}>
            Cambiar
          </button>
          <CardDetailModal card={card} deckFormat="unlimited" isOpen onAddToZone={() => false} onClose={vi.fn()} />
        </>
      )
    }
    render(<Swap />)
    fireEvent.click(screen.getByRole('button', { name: 'Cambiar' }))

    // El marco sigue (no se vuelve a armar) y muestra la carta nueva.
    expect(screen.getAllByRole('dialog')).toHaveLength(1)
    opened('Beta')
  })
})

describe('las flechas del panel de la carta del builder de escritorio', () => {
  const panel = (navigation?: { onPrevious: (() => void) | null; onNext: (() => void) | null } | null) => (
    <DeckBuilderClassicPreview card={CARDS[1]!} source="search" deckCopy={null} navigation={navigation} onAddToZone={() => {}} />
  )

  it('pasan a la anterior y a la siguiente, y no se muestran donde no hay', () => {
    const onNext = vi.fn()
    render(panel({ onPrevious: null, onNext }))

    expect(screen.queryByRole('button', { name: 'Carta anterior' })).not.toBeInTheDocument()
    fireEvent.click(next())
    expect(onNext).toHaveBeenCalledOnce()
  })

  it('con la lista sin la carta abierta (la búsqueda cambió) no hay flechas, pero el lugar de los costados queda para que la carta no cambie de tamaño', () => {
    render(panel(null))

    expect(screen.queryByRole('button', { name: 'Carta anterior' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Carta siguiente' })).not.toBeInTheDocument()
  })

  it('quien no tiene lista (los decks de torneo) no lleva la fila', () => {
    render(panel())

    expect(screen.queryByRole('button', { name: 'Carta anterior' })).not.toBeInTheDocument()
  })
})

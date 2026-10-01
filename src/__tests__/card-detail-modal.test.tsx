// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import '@testing-library/jest-dom'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { useBodyScrollLock, useEscapeKey } from '../app/use-overlay'
import { CardDetailModal } from '../components/card-detail/CardDetailModal'
import { PracticeCardFocus } from '../components/probability/PracticeCardFocus'
import type { ApiCardSearchResult } from '../ygoprodeck'

vi.mock('../components/CardArt', () => ({
  CardArt: ({ name }: { name: string }) => <img alt={name} />,
}))

afterEach(cleanup)

const card: ApiCardSearchResult = {
  name: 'Mulcharmy Purulia',
  ygoprodeckId: 84192580,
  cardType: 'Effect Monster',
  frameType: 'effect',
  description: 'If you control no cards (Quick Effect): You can discard this card.',
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

function modal(onClose = vi.fn(), onAddToZone = vi.fn(() => false)) {
  return <CardDetailModal card={card} deckFormat="unlimited" isOpen onAddToZone={onAddToZone} onClose={onClose} />
}

describe('detalle compartido de cartas', () => {
  it('mantiene abierto el detalle al tocar la carta, el texto o su contenedor', () => {
    const onClose = vi.fn()
    render(modal(onClose))
    fireEvent.click(screen.getByRole('img', { name: card.name }))
    fireEvent.click(screen.getByRole('region', { name: 'Efecto' }))
    fireEvent.click(screen.getByRole('region', { name: 'Texto de la carta' }))
    expect(onClose).not.toHaveBeenCalled()
  })

  it.each(['fondo', 'espacio entre carta y texto'])('cierra al tocar el %s', (area) => {
    const onClose = vi.fn()
    render(modal(onClose))
    const dialog = screen.getByRole('dialog', { name: `Detalle de ${card.name}` })
    fireEvent.click(area === 'fondo' ? dialog : dialog.firstElementChild!)
    expect(onClose).toHaveBeenCalledOnce()
  })

  it('cierra sólo el detalle con Escape y conserva el bloqueo del modal padre', () => {
    const onParentClose = vi.fn()
    const onClose = vi.fn()
    function Parent({ detail }: { detail: boolean }) {
      useEscapeKey(onParentClose)
      useBodyScrollLock(true)
      return detail ? modal(onClose) : null
    }
    const { rerender, unmount } = render(<Parent detail={false} />)
    rerender(<Parent detail />)
    fireEvent.keyDown(window, { key: 'Escape' })
    expect(onClose).toHaveBeenCalledOnce()
    expect(onParentClose).not.toHaveBeenCalled()
    rerender(<Parent detail={false} />)
    expect(document.body.style.overflow).toBe('hidden')
    fireEvent.keyDown(window, { key: 'Escape' })
    expect(onParentClose).toHaveBeenCalledOnce()
    unmount()
    expect(document.body.style.overflow).toBe('')
  })

  it.each([true, false])('respeta el resultado %s de agregar una carta', (accepted) => {
    const onClose = vi.fn()
    const onAdd = vi.fn(() => accepted)
    render(modal(onClose, onAdd))
    fireEvent.click(screen.getByRole('button', { name: 'Agregar al Main Deck' }))
    expect(onAdd).toHaveBeenCalledWith('main')
    expect(onClose).toHaveBeenCalledTimes(accepted ? 1 : 0)
  })

  it('permite modificar copias sin cerrar y mantiene deshabilitada la suma cuando corresponde', () => {
    const onClose = vi.fn()
    const onRemove = vi.fn()
    render(<CardDetailModal card={card} deckFormat="unlimited" isOpen showActions={false}
      deckCopy={{ zoneLabel: 'Main Deck', copies: 3, canAddCopy: false, onRemoveCopy: onRemove, onAddCopy: vi.fn() }}
      onAddToZone={() => false} onClose={onClose} />)
    fireEvent.click(screen.getByRole('button', { name: '− Quitar una' }))
    expect(onRemove).toHaveBeenCalledOnce()
    expect(screen.getByRole('button', { name: '+ Sumar una' })).toBeDisabled()
    expect(onClose).not.toHaveBeenCalled()
  })

  it('contiene el foco dentro del detalle y lo devuelve al botón que lo abrió', () => {
    const opener = document.createElement('button')
    document.body.append(opener)
    opener.focus()
    const { unmount } = render(modal())
    const text = screen.getByRole('region', { name: 'Efecto' })
    const lastButton = screen.getByRole('button', { name: 'Agregar al Side Deck' })
    expect(text).toHaveFocus()
    fireEvent.keyDown(text, { key: 'Tab', shiftKey: true })
    expect(lastButton).toHaveFocus()
    fireEvent.keyDown(lastButton, { key: 'Tab' })
    expect(text).toHaveFocus()
    unmount()
    expect(opener).toHaveFocus()
    opener.remove()
  })

  it('usa el mismo detalle en práctica incluso sin datos de la carta', () => {
    const onClose = vi.fn()
    render(<PracticeCardFocus card={{ drawId: 'draw-1', cardId: 'card-1', name: 'Carta manual', apiCard: null }} origin={null} onClose={onClose} />)
    expect(screen.getByRole('dialog', { name: 'Detalle de Carta manual' })).toBeInTheDocument()
    expect(screen.getByText('Sin texto disponible.')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('dialog'))
    expect(onClose).toHaveBeenCalledOnce()
  })

  it('no muestra ni bloquea el scroll cuando el detalle está cerrado', () => {
    render(<CardDetailModal card={card} deckFormat="unlimited" isOpen={false} onAddToZone={() => false} onClose={vi.fn()} />)
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(document.body.style.overflow).toBe('')
  })
})

// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import '@testing-library/jest-dom'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { ClassificationEditor } from '../components/classification/ClassificationEditor'
import type { CardEntry } from '../types'

vi.mock('../components/CardArt', () => ({
  CardArt: ({ name }: { name: string }) => <img alt={name} />,
}))

afterEach(cleanup)

function entry(overrides: Partial<CardEntry> = {}): CardEntry {
  return {
    id: 'card-1',
    name: 'Starter Uno',
    copies: 3,
    source: 'ygoprodeck',
    origin: null,
    roles: [],
    needsReview: false,
    apiCard: {
      ygoprodeckId: 101,
      cardType: 'Effect Monster',
      frameType: 'effect',
      description: 'Texto de la carta.',
      race: 'Spellcaster',
      attribute: 'DARK',
      level: 4,
      linkValue: null,
      atk: '1800',
      def: '1000',
      archetype: null,
      ygoprodeckUrl: null,
      imageUrl: null,
      imageUrlSmall: null,
      banlist: { tcg: null, ocg: null, goat: null },
      genesys: { points: null },
    },
    ...overrides,
  }
}

function editor(props: Partial<React.ComponentProps<typeof ClassificationEditor>> = {}) {
  return (
    <ClassificationEditor
      card={entry()}
      position={3}
      total={31}
      onSetOrigin={vi.fn()}
      onToggleRole={vi.fn()}
      onConfirm={vi.fn()}
      onClose={vi.fn()}
      {...props}
    />
  )
}

describe('modal de clasificación (mismo marco que el detalle)', () => {
  it('muestra el nombre, el tipo y las copias una sola vez, y el lugar en la lista sólo en el pie', () => {
    render(editor())

    expect(screen.getByRole('dialog', { name: 'Clasificar Starter Uno' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Starter Uno' })).toBeInTheDocument()
    expect(screen.getByText('[Effect Monster] Spellcaster/DARK · [★4] / 1800/1000 · ×3 en el Main')).toBeInTheDocument()
    expect(screen.getAllByText(/3 \/ 31/)).toHaveLength(1)
    expect(screen.queryByText(/Carta 3 de 31/)).not.toBeInTheDocument()
    expect(screen.queryByText(/cartas clasificadas/)).not.toBeInTheDocument()
  })

  it('aplica el origen y los roles tocados', () => {
    const onSetOrigin = vi.fn()
    const onToggleRole = vi.fn()
    render(editor({ onSetOrigin, onToggleRole }))

    fireEvent.click(screen.getByRole('button', { name: /Engine/ }))
    expect(onSetOrigin).toHaveBeenCalledWith(101, 'engine')
    fireEvent.click(screen.getByRole('button', { name: 'Starter' }))
    expect(onToggleRole).toHaveBeenCalledWith(101, 'starter')
  })

  it('marca los roles elegidos y no repite un contador por grupo', () => {
    render(editor({ card: entry({ origin: 'engine', roles: ['starter', 'disruption'] }) }))

    expect(screen.getByRole('button', { name: 'Starter' })).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByRole('button', { name: 'Disruption' })).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByRole('button', { name: 'Extender' })).toHaveAttribute('aria-pressed', 'false')
    expect(screen.queryByText('2 / 8')).not.toBeInTheDocument()
  })

  it('navega con Anterior y Siguiente, y los deshabilita sin destino', () => {
    const onPrevious = vi.fn()
    const onNext = vi.fn()
    const { rerender } = render(editor({ onPrevious, onNext }))

    fireEvent.click(screen.getByRole('button', { name: 'Anterior' }))
    fireEvent.click(screen.getByRole('button', { name: 'Siguiente' }))
    expect(onPrevious).toHaveBeenCalledOnce()
    expect(onNext).toHaveBeenCalledOnce()

    rerender(editor({ onPrevious: undefined, onNext: undefined }))
    expect(screen.getByRole('button', { name: 'Anterior' })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Siguiente' })).toBeDisabled()
  })

  it('no se cierra al tocar el panel', () => {
    const onClose = vi.fn()
    render(editor({ onClose }))

    fireEvent.click(screen.getByRole('region', { name: 'Clasificación de la carta' }))
    expect(onClose).not.toHaveBeenCalled()
  })

  it.each([
    ['la X blanca', () => fireEvent.click(screen.getByRole('button', { name: 'Cerrar' }))],
    ['Escape', () => fireEvent.keyDown(window, { key: 'Escape' })],
    ['el fondo', () => fireEvent.click(screen.getByRole('dialog'))],
  ])('se cierra con %s', (_, close) => {
    const onClose = vi.fn()
    render(editor({ onClose }))

    close()
    expect(onClose).toHaveBeenCalledOnce()
  })

  it('pide confirmar una clasificación sugerida', () => {
    const onConfirm = vi.fn()
    render(editor({ card: entry({ origin: 'engine', roles: ['starter'], needsReview: true }), onConfirm }))

    fireEvent.click(screen.getByRole('button', { name: 'Confirmar' }))
    expect(onConfirm).toHaveBeenCalledWith(101)
  })

  it('ofrece la guía de roles sólo si hay con qué abrirla', () => {
    const onOpenHelp = vi.fn()
    const { rerender } = render(editor())
    expect(screen.queryByRole('button', { name: /Qué significa cada rol/ })).not.toBeInTheDocument()

    rerender(editor({ onOpenHelp }))
    fireEvent.click(screen.getByRole('button', { name: /Qué significa cada rol/ }))
    expect(onOpenHelp).toHaveBeenCalledOnce()
  })
})

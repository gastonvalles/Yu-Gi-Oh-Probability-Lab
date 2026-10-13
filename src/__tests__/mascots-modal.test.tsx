// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import '@testing-library/jest-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { activeMascotIds, resetMascotChoiceForTests, resetMascotForTests, setMaxActiveMascotsForTests } from '../app/mascot'
import { MascotsModal } from '../components/mascot/MascotsModal'
import { applyLocale } from '../i18n'

beforeEach(() => {
  localStorage.clear()
  resetMascotChoiceForTests()
  resetMascotForTests()
  window.matchMedia = ((query: string) => ({ matches: false, media: query, addEventListener: () => {}, removeEventListener: () => {}, addListener: () => {}, removeListener: () => {}, onchange: null, dispatchEvent: () => false })) as typeof window.matchMedia
})

afterEach(() => {
  cleanup()
  applyLocale('es')
})

const card = (name: string) => within(screen.getByRole('list', { name: 'Mascotas disponibles' })).getByText(name).closest('li') as HTMLElement

describe('el modal de mascotas', () => {
  it('cerrado no existe; abierto lista las mascotas con cómo está cada una, y cuántas hay afuera', () => {
    const { rerender } = render(<MascotsModal isOpen={false} onClose={() => {}} />)
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()

    rerender(<MascotsModal isOpen onClose={() => {}} />)

    expect(screen.getByRole('dialog')).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Mascotas' })).toBeInTheDocument()
    expect(screen.getByText('1 de 3 afuera')).toBeInTheDocument()
    expect(screen.getByText(/Hasta 3 afuera a la vez/)).toBeInTheDocument()

    expect(within(card('Cupsy')).getByText('Afuera')).toBeInTheDocument()
    expect(card('Cupsy')).toHaveAttribute('data-out', 'true')
    expect(within(card('Winged Kuriboh')).getByText('Descansando')).toBeInTheDocument()
    expect(card('Winged Kuriboh')).toHaveAttribute('data-out', 'false')
  })

  it('sacar una mascota la suma a las de afuera, y darle un descanso la saca; cada una con su botón', () => {
    render(<MascotsModal isOpen onClose={() => {}} />)

    fireEvent.click(screen.getByRole('button', { name: 'Sacar a Winged Kuriboh' }))

    expect(activeMascotIds()).toEqual(['cupsy', 'winged-kuriboh'])
    expect(screen.getByText('2 de 3 afuera')).toBeInTheDocument()
    expect(card('Winged Kuriboh')).toHaveAttribute('data-out', 'true')
    expect(screen.queryByRole('button', { name: 'Sacar a Winged Kuriboh' })).not.toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Darle un descanso a Cupsy' }))

    expect(activeMascotIds()).toEqual(['winged-kuriboh'])
    expect(screen.getByText('1 de 3 afuera')).toBeInTheDocument()
    expect(card('Cupsy')).toHaveAttribute('data-out', 'false')
    expect(screen.getByRole('button', { name: 'Sacar a Cupsy' })).toBeEnabled()
  })

  it('con el máximo afuera, las que descansan no se pueden sacar y el modal explica por qué', () => {
    setMaxActiveMascotsForTests(1)
    render(<MascotsModal isOpen onClose={() => {}} />)

    expect(screen.getByRole('button', { name: 'Sacar a Winged Kuriboh' })).toBeDisabled()
    expect(screen.getByText('Ya hay 1 afuera: dale un descanso a una para sacar otra.')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Darle un descanso a Cupsy' }))

    expect(screen.getByRole('button', { name: 'Sacar a Winged Kuriboh' })).toBeEnabled()
    expect(screen.queryByText(/Ya hay 1 afuera/)).not.toBeInTheDocument()
  })

  it('"Listo" y la X lo cierran', () => {
    const onClose = vi.fn()
    render(<MascotsModal isOpen onClose={onClose} />)

    fireEvent.click(screen.getByRole('button', { name: 'Listo' }))
    expect(onClose).toHaveBeenCalledTimes(1)

    fireEvent.click(screen.getByRole('button', { name: 'Cerrar' }))
    expect(onClose).toHaveBeenCalledTimes(2)
  })

  it('en inglés', () => {
    applyLocale('en')
    render(<MascotsModal isOpen onClose={() => {}} />)

    expect(screen.getByRole('heading', { name: 'Mascots' })).toBeInTheDocument()
    expect(screen.getByText('1 of 3 out')).toBeInTheDocument()
    expect(screen.getByText(/Up to 3 out at once/)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Bring out Winged Kuriboh' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Let Cupsy rest' })).toBeInTheDocument()

    act(() => setMaxActiveMascotsForTests(1))
    cleanup()
    render(<MascotsModal isOpen onClose={() => {}} />)
    expect(screen.getByText('There are already 1 out: let one rest to bring out another.')).toBeInTheDocument()
  })
})

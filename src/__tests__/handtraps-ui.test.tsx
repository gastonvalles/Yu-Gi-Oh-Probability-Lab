// @vitest-environment jsdom
import { act, fireEvent, screen, within } from '@testing-library/react'
import '@testing-library/jest-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { HANDTRAP_CATALOG, HANDTRAP_CONFIG_KEY, readHandtrapConfig, type HandtrapConfig } from '../app/handtraps'
import type { MatState } from '../app/practice-mat'
import { HandtrapPicker, HandtrapsMatButton, HandtrapsRow } from '../components/duel/HandtrapPool'
import { RivalHandStrip } from '../components/probability/RivalHandStrip'
import { Harness, INITIAL, render, status } from './support/practice-mat-harness'

const { searchCards } = vi.hoisted(() => ({ searchCards: vi.fn(async () => ({ results: [], hasMore: false })) }))

vi.mock('../ygoprodeck', () => ({ fetchCardsByIds: vi.fn(async () => []), searchCards }))

beforeEach(() => {
  localStorage.clear()
  searchCards.mockClear()
  HTMLElement.prototype.setPointerCapture = () => {}
  window.matchMedia = ((query: string) => ({ matches: query.includes('reduce'), media: query, addEventListener: () => {}, removeEventListener: () => {}, addListener: () => {}, removeListener: () => {}, onchange: null, dispatchEvent: () => false })) as typeof window.matchMedia
  window.requestAnimationFrame = (callback) => {
    callback(0)
    return 1
  }
  window.cancelAnimationFrame = () => {}
})

const strip = () => screen.getByRole('region', { name: 'Mano del rival' })

describe('la franja de la mano del rival', () => {
  it('cada carta se nombra; la usada dice en qué paso y lleva su marca, y tocar una avisa cuál', () => {
    const onOpen = vi.fn()

    render(
      <RivalHandStrip
        cards={[
          { id: 'rival.card-1-1', name: 'Ash Blossom', art: null, usedAt: null },
          { id: 'rival.card-2-1', name: 'Effect Veiler', art: null, usedAt: 3 },
        ]}
        onOpen={onOpen}
      />,
    )

    expect(within(strip()).getAllByRole('button').map((button) => button.getAttribute('aria-label'))).toEqual(['Ash Blossom', 'Effect Veiler, usada en el paso 3'])
    expect(within(strip()).getByRole('button', { name: 'Effect Veiler, usada en el paso 3' })).toHaveTextContent('3')

    fireEvent.click(within(strip()).getByRole('button', { name: 'Ash Blossom' }))
    expect(onOpen).toHaveBeenCalledWith('rival.card-1-1', expect.anything())
  })
})

describe('el simulador en la mesa de práctica', () => {
  const RIVAL: MatState = { ...INITIAL, rival: { hand: ['rival.card-1-1', 'rival.card-6-1'], used: [] } }

  it('sin el simulador la mesa no tiene franja', () => {
    render(<Harness />)

    expect(screen.queryByRole('region', { name: 'Mano del rival' })).toBeNull()
    expect(document.querySelector('[data-rival-strip]')).toBeNull()
  })

  it('tocar una handtrap abre el menú de la mesa con «Usar ahora»; usarla la deja usada en su lugar, queda en el registro y Deshacer la devuelve', () => {
    render(<Harness initial={RIVAL} />)

    // Las cartas del rival son las de su id: «rival.card-1-1» es la Ash Blossom del deck de prueba.
    const before = within(strip()).getAllByRole('button').map((button) => button.getAttribute('aria-label'))
    expect(before).toEqual(['Ash Blossom', 'Imperm'])

    fireEvent.click(within(strip()).getByRole('button', { name: 'Ash Blossom' }))
    expect(screen.getByText('Mano del rival', { selector: 'p' })).toBeInTheDocument()
    fireEvent.click(screen.getByRole('menuitem', { name: 'Usar ahora' }))

    expect(within(strip()).getAllByRole('button').map((button) => button.getAttribute('aria-label'))).toEqual(['Ash Blossom, usada en el paso 1', 'Imperm'])
    expect(status()).toHaveTextContent('El rival usó Ash Blossom')

    // Ya usada: su menú no la deja usar otra vez y dice cuándo se usó.
    fireEvent.click(within(strip()).getByRole('button', { name: 'Ash Blossom, usada en el paso 1' }))
    expect(screen.getByRole('menuitem', { name: /Usar ahora/ })).toHaveAttribute('aria-disabled', 'true')
    expect(screen.getByRole('menuitem', { name: /Usar ahora/ })).toHaveTextContent('La usó en el paso 1')

    act(() => {
      fireEvent.keyDown(window, { key: 'Escape' })
    })
    fireEvent.click(screen.getByRole('button', { name: 'Deshacer' }))
    expect(within(strip()).getAllByRole('button').map((button) => button.getAttribute('aria-label'))).toEqual(before)
  })
})

describe('la hoja del pool', () => {
  const POOL: HandtrapConfig = { enabled: false, count: 3, picks: HANDTRAP_CATALOG.slice(0, 3).map((card) => ({ ...card })) }
  const card = (name: string) => screen.getByRole('button', { name })

  it('marca y desmarca, cambia el tipo con un toque, avisa hasta cuántas puede tener y guarda lo elegido', () => {
    const onSave = vi.fn()

    render(<HandtrapPicker isOpen config={POOL} onClose={() => {}} onSave={onSave} />)

    // Ash, Maxx "C" y Veiler elegidas; el resto del catálogo, no.
    expect(screen.getAllByRole('button', { pressed: true })).toHaveLength(3)
    expect(card('Ghost Ogre & Snow Rabbit')).toHaveAttribute('aria-pressed', 'false')

    // Ash: Una sola → Charmy.
    fireEvent.click(screen.getByRole('button', { name: 'Tipo de Ash Blossom & Joyous Spring: Una sola' }))
    expect(screen.getByRole('button', { name: 'Tipo de Ash Blossom & Joyous Spring: Charmy · máx. 2 juntas' })).toBeInTheDocument()

    // Sin Veiler (la repetible) quedan dos de una copia: con 3 en la mano, como mucho 2.
    fireEvent.click(card('Effect Veiler'))
    expect(screen.getByRole('status')).toHaveTextContent('Con este pool el rival puede tener como mucho 2.')

    // Una más (Ghost Ogre, una sola): ya alcanza.
    fireEvent.click(card('Ghost Ogre & Snow Rabbit'))
    expect(screen.getByRole('status')).toHaveTextContent('')

    fireEvent.click(screen.getByRole('button', { name: 'Usar este pool' }))
    expect(onSave).toHaveBeenCalledWith(
      [
        { id: 14558127, name: 'Ash Blossom & Joyous Spring', kind: 'charmy' },
        { id: 23434538, name: 'Maxx "C"', kind: 'single' },
        { id: 59438930, name: 'Ghost Ogre & Snow Rabbit', kind: 'single' },
      ],
      3,
    )
  })

  it('sin ninguna elegida lo dice y no deja usar el pool', () => {
    render(<HandtrapPicker isOpen config={POOL} onClose={() => {}} onSave={() => {}} />)

    for (const pressed of screen.getAllByRole('button', { pressed: true })) fireEvent.click(pressed)

    expect(screen.getByRole('status')).toHaveTextContent('Elegí al menos una handtrap.')
    expect(screen.getByRole('button', { name: 'Usar este pool' })).toBeDisabled()
  })

  it('«Agregar otra carta» busca por nombre y suma la carta al pool, elegida', async () => {
    vi.useFakeTimers()
    searchCards.mockResolvedValueOnce({ results: [{ ygoprodeckId: 91800273, name: 'Dimension Shifter' }], hasMore: false } as never)

    try {
      render(<HandtrapPicker isOpen config={POOL} onClose={() => {}} onSave={() => {}} />)
      fireEvent.change(screen.getByRole('searchbox', { name: 'Buscar una carta para el pool' }), { target: { value: 'Dimension' } })
      await act(async () => {
        await vi.advanceTimersByTimeAsync(400)
      })

      fireEvent.click(screen.getByRole('button', { name: 'Agregar Dimension Shifter al pool' }))
      expect(card('Dimension Shifter')).toHaveAttribute('aria-pressed', 'true')
      expect(screen.getByRole('button', { name: 'Dimension Shifter ya está en el pool' })).toBeDisabled()
    } finally {
      vi.useRealTimers()
    }
  })
})

describe('la fila de las reglas de Solo', () => {
  it('dice lo que tiene el rival y el interruptor se recuerda', () => {
    render(<HandtrapsRow />)

    expect(screen.getByText('3 en mano · pool de 15')).toBeInTheDocument()

    const toggle = screen.getByRole('switch', { name: 'Handtraps del rival' })

    expect(toggle).toHaveAttribute('aria-checked', 'false')
    fireEvent.click(toggle)
    expect(toggle).toHaveAttribute('aria-checked', 'true')
    expect(readHandtrapConfig().enabled).toBe(true)
    expect(JSON.parse(localStorage.getItem(HANDTRAP_CONFIG_KEY) ?? '{}')).toMatchObject({ enabled: true, count: 3 })
  })

  it('elegir un pool lo guarda y enciende el simulador', () => {
    render(<HandtrapsRow />)

    fireEvent.click(screen.getByRole('button', { name: 'Elegir… el pool de handtraps del rival' }))
    fireEvent.click(screen.getByRole('button', { name: 'Ash Blossom & Joyous Spring', pressed: true }))
    fireEvent.click(screen.getByRole('button', { name: 'Usar este pool' }))

    expect(readHandtrapConfig()).toMatchObject({ enabled: true, count: 3 })
    expect(readHandtrapConfig().picks).toHaveLength(14)
    expect(screen.getByText('3 en mano · pool de 14')).toBeInTheDocument()
  })
})

describe('el botón de la barra de la mesa (Entrenar solo)', () => {
  const open = () => fireEvent.click(screen.getByRole('button', { name: 'Handtraps del rival' }))

  it('abre la hoja del pool; usar el pool lo guarda, enciende el simulador y reparte una mano nueva', () => {
    const onApply = vi.fn()

    render(<HandtrapsMatButton onApply={onApply} />)

    expect(screen.getByRole('button', { name: 'Handtraps del rival' })).toHaveAttribute('aria-pressed', 'false')
    open()
    expect(screen.getByText('Al aplicar, se reparte una mano nueva.')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Apagar el simulador' })).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Usar este pool' }))

    expect(readHandtrapConfig()).toMatchObject({ enabled: true, count: 3 })
    expect(onApply).toHaveBeenCalledTimes(1)
    expect(screen.getByRole('button', { name: 'Handtraps del rival' })).toHaveAttribute('aria-pressed', 'true')
  })

  it('con el simulador encendido ofrece apagarlo: se guarda apagado y se reparte una mano nueva', () => {
    localStorage.setItem(HANDTRAP_CONFIG_KEY, JSON.stringify({ enabled: true, picks: HANDTRAP_CATALOG, count: 3 }))
    const onApply = vi.fn()

    render(<HandtrapsMatButton onApply={onApply} />)
    expect(screen.getByRole('button', { name: 'Handtraps del rival' })).toHaveAttribute('aria-pressed', 'true')
    open()
    fireEvent.click(screen.getByRole('button', { name: 'Apagar el simulador' }))

    expect(readHandtrapConfig().enabled).toBe(false)
    // Se conserva el pool que había.
    expect(readHandtrapConfig().picks).toHaveLength(HANDTRAP_CATALOG.length)
    expect(onApply).toHaveBeenCalledTimes(1)
  })

  it('cancelar no cambia nada ni reparte', () => {
    const onApply = vi.fn()

    render(<HandtrapsMatButton onApply={onApply} />)
    open()
    fireEvent.click(screen.getByRole('button', { name: 'Cancelar' }))

    expect(localStorage.getItem(HANDTRAP_CONFIG_KEY)).toBeNull()
    expect(onApply).not.toHaveBeenCalled()
  })
})

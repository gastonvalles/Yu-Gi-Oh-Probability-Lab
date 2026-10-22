// @vitest-environment jsdom
import { act, fireEvent, screen, within } from '@testing-library/react'
import '@testing-library/jest-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { HANDTRAP_CONFIG_KEY, readHandtrapConfig, type HandtrapConfig } from '../app/handtraps'
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

const ASH = { id: 14558127, name: 'Ash Blossom & Joyous Spring' }
const VEILER = { id: 97268402, name: 'Effect Veiler' }
const IMPERM = { id: 10045474, name: 'Infinite Impermanence' }
const MAXX = { id: 23434538, name: 'Maxx "C"' }

/** El contador de una carta de la hoja (un `Stepper`): su número, y sus «−» y «+». */
const counter = (name: string) => screen.getByRole('group', { name: `Copias de ${name} en la mano del rival` })
const copiesOf = (name: string) => within(counter(name)).getByRole('textbox')
const more = (name: string) => within(counter(name)).getByRole('button', { name: 'Uno más' })
const less = (name: string) => within(counter(name)).getByRole('button', { name: 'Uno menos' })
const rowOf = (name: string) => counter(name).closest('li')!
const total = () => screen.getByRole('status')

describe('la hoja de la mano del rival', () => {
  const HAND: HandtrapConfig = { enabled: false, picks: [{ ...ASH, copies: 1 }, { ...VEILER, copies: 2 }] }

  it('cada carta tiene su contador de copias: arranca de lo guardado, sube y baja, y abajo dice cuántas tiene en total', () => {
    const onSave = vi.fn()

    render(<HandtrapPicker isOpen config={HAND} onClose={() => {}} onSave={onSave} />)

    expect(copiesOf(ASH.name)).toHaveValue('1')
    expect(copiesOf(VEILER.name)).toHaveValue('2')
    expect(copiesOf(MAXX.name)).toHaveValue('0')
    expect(total()).toHaveTextContent('En la mano del rival: 3')
    // La carta se elige subiendo su contador (la fila no es un botón que se marca): con copias lleva el aro de lo elegido; con 0, no.
    expect(screen.queryByRole('button', { pressed: true })).toBeNull()
    expect(rowOf(VEILER.name)).toHaveClass('inset-ring')
    expect(rowOf(MAXX.name)).not.toHaveClass('inset-ring')

    fireEvent.click(more(MAXX.name))
    fireEvent.click(less(VEILER.name))
    fireEvent.click(less(ASH.name))

    expect(copiesOf(MAXX.name)).toHaveValue('1')
    expect(rowOf(MAXX.name)).toHaveClass('inset-ring')
    expect(rowOf(ASH.name)).not.toHaveClass('inset-ring')
    expect(total()).toHaveTextContent('En la mano del rival: 2')

    // En el orden del catálogo: Maxx "C" antes que Effect Veiler.
    fireEvent.click(screen.getByRole('button', { name: 'Usar esta mano' }))
    expect(onSave).toHaveBeenCalledWith([
      { ...MAXX, copies: 1 },
      { ...VEILER, copies: 1 },
    ])
  })

  it('una carta llega a 3 copias como mucho y la mano a 6: el «+» se apaga en cada tope y abajo lo dice', () => {
    render(<HandtrapPicker isOpen config={HAND} onClose={() => {}} onSave={() => {}} />)

    fireEvent.click(more(VEILER.name))
    expect(copiesOf(VEILER.name)).toHaveValue('3')
    expect(more(VEILER.name)).toBeDisabled()
    expect(more(MAXX.name)).toBeEnabled()

    fireEvent.click(more(IMPERM.name))
    fireEvent.click(more(IMPERM.name))
    expect(total()).toHaveTextContent('En la mano del rival: 6')
    expect(total()).toHaveTextContent('Máximo 6 en la mano.')
    expect(more(IMPERM.name)).toBeDisabled()
    expect(more(MAXX.name)).toBeDisabled()
    expect(more(ASH.name)).toBeDisabled()

    // Con un lugar libre, se puede volver a subir otra.
    fireEvent.click(less(IMPERM.name))
    expect(total()).not.toHaveTextContent('Máximo')
    expect(more(MAXX.name)).toBeEnabled()
  })

  it('sin ninguna, lo dice y no deja usar la mano', () => {
    render(<HandtrapPicker isOpen config={HAND} onClose={() => {}} onSave={() => {}} />)

    fireEvent.click(less(ASH.name))
    fireEvent.click(less(VEILER.name))
    fireEvent.click(less(VEILER.name))

    expect(total()).toHaveTextContent('En la mano del rival: 0')
    expect(total()).toHaveTextContent('Poné al menos una handtrap.')
    expect(screen.getByRole('button', { name: 'Usar esta mano' })).toBeDisabled()
  })

  it('«Agregar otra carta» busca por nombre y suma la carta a la lista con una copia; con la mano llena, en 0', async () => {
    vi.useFakeTimers()
    const search = async (name: string, ygoprodeckId: number) => {
      searchCards.mockResolvedValueOnce({ results: [{ ygoprodeckId, name }], hasMore: false } as never)
      fireEvent.change(screen.getByRole('searchbox', { name: 'Buscar otra carta' }), { target: { value: name } })
      await act(async () => {
        await vi.advanceTimersByTimeAsync(400)
      })
      fireEvent.click(screen.getByRole('button', { name: `Agregar ${name} a la lista` }))
    }

    try {
      render(<HandtrapPicker isOpen config={HAND} onClose={() => {}} onSave={() => {}} />)

      await search('Dimension Shifter', 91800273)
      expect(copiesOf('Dimension Shifter')).toHaveValue('1')
      expect(total()).toHaveTextContent('En la mano del rival: 4')
      expect(screen.getByRole('button', { name: 'Dimension Shifter ya está en la lista' })).toBeDisabled()

      fireEvent.click(more(VEILER.name))
      fireEvent.click(more('Dimension Shifter'))
      await search('Skull Meister', 67750322)
      expect(copiesOf('Skull Meister')).toHaveValue('0')
      expect(total()).toHaveTextContent('En la mano del rival: 6')
    } finally {
      vi.useRealTimers()
    }
  })
})

describe('la fila de las reglas de Solo', () => {
  it('dice cuántas tiene el rival en la mano y el interruptor se recuerda', () => {
    render(<HandtrapsRow />)

    expect(screen.getByText('3 en mano')).toBeInTheDocument()

    const toggle = screen.getByRole('switch', { name: 'Handtraps del rival' })

    expect(toggle).toHaveAttribute('aria-checked', 'false')
    fireEvent.click(toggle)
    expect(toggle).toHaveAttribute('aria-checked', 'true')
    expect(readHandtrapConfig()).toEqual({ enabled: true, picks: [{ ...ASH, copies: 1 }, { ...VEILER, copies: 1 }, { ...IMPERM, copies: 1 }] })
    expect(JSON.parse(localStorage.getItem(HANDTRAP_CONFIG_KEY) ?? '{}')).toMatchObject({ enabled: true })
  })

  it('sin ninguna elegida lo dice', () => {
    localStorage.setItem(HANDTRAP_CONFIG_KEY, JSON.stringify({ enabled: true, picks: [] }))
    render(<HandtrapsRow />)

    expect(screen.getByText('Ninguna elegida')).toBeInTheDocument()
  })

  it('elegir la mano la guarda y enciende el simulador', () => {
    render(<HandtrapsRow />)

    fireEvent.click(screen.getByRole('button', { name: 'Elegir… las handtraps de la mano del rival' }))
    fireEvent.click(more(VEILER.name))
    fireEvent.click(screen.getByRole('button', { name: 'Usar esta mano' }))

    expect(readHandtrapConfig()).toEqual({ enabled: true, picks: [{ ...ASH, copies: 1 }, { ...VEILER, copies: 2 }, { ...IMPERM, copies: 1 }] })
    expect(screen.getByText('4 en mano')).toBeInTheDocument()
  })
})

describe('el botón de la barra de la mesa (Entrenar solo)', () => {
  const open = () => fireEvent.click(screen.getByRole('button', { name: 'Handtraps del rival' }))

  it('abre la hoja; usar la mano la guarda, enciende el simulador y reparte una mano nueva', () => {
    const onApply = vi.fn()

    render(<HandtrapsMatButton onApply={onApply} />)

    expect(screen.getByRole('button', { name: 'Handtraps del rival' })).toHaveAttribute('aria-pressed', 'false')
    open()
    expect(screen.getByText('Al aplicar, se reparte una mano nueva.')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Apagar el simulador' })).not.toBeInTheDocument()
    fireEvent.click(more(VEILER.name))
    fireEvent.click(screen.getByRole('button', { name: 'Usar esta mano' }))

    expect(readHandtrapConfig()).toEqual({ enabled: true, picks: [{ ...ASH, copies: 1 }, { ...VEILER, copies: 2 }, { ...IMPERM, copies: 1 }] })
    expect(onApply).toHaveBeenCalledTimes(1)
    expect(screen.getByRole('button', { name: 'Handtraps del rival' })).toHaveAttribute('aria-pressed', 'true')
  })

  it('con el simulador encendido ofrece apagarlo: se guarda apagado (con la misma mano) y se reparte una mano nueva', () => {
    const hand = [{ ...VEILER, copies: 2 }, { ...ASH, copies: 1 }]

    localStorage.setItem(HANDTRAP_CONFIG_KEY, JSON.stringify({ enabled: true, picks: hand }))
    const onApply = vi.fn()

    render(<HandtrapsMatButton onApply={onApply} />)
    expect(screen.getByRole('button', { name: 'Handtraps del rival' })).toHaveAttribute('aria-pressed', 'true')
    open()
    fireEvent.click(screen.getByRole('button', { name: 'Apagar el simulador' }))

    expect(readHandtrapConfig()).toEqual({ enabled: false, picks: hand })
    expect(onApply).toHaveBeenCalledTimes(1)
  })

  it('cancelar no cambia nada ni reparte', () => {
    const onApply = vi.fn()

    render(<HandtrapsMatButton onApply={onApply} />)
    open()
    fireEvent.click(more(VEILER.name))
    fireEvent.click(screen.getByRole('button', { name: 'Cancelar' }))

    expect(localStorage.getItem(HANDTRAP_CONFIG_KEY)).toBeNull()
    expect(onApply).not.toHaveBeenCalled()
  })
})

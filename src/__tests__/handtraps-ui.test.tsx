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

/** Un contador de la hoja (un `Stepper`): el de las copias de una carta o el de las cartas en la mano; su número, y sus «−» y «+». */
const group = (name: string) => screen.getByRole('group', { name })
const copies = (name: string) => group(`Copias de ${name} en el deck del rival`)
const valueOf = (stepper: HTMLElement) => within(stepper).getByRole('textbox')
const more = (stepper: HTMLElement) => within(stepper).getByRole('button', { name: 'Uno más' })
const less = (stepper: HTMLElement) => within(stepper).getByRole('button', { name: 'Uno menos' })
const handCounter = () => group('Cartas en la mano del rival')
const rowOf = (name: string) => copies(name).closest('li')!
const summary = () => screen.getByRole('status')

describe('la franja sin rótulo', () => {
  it('la mano del rival no lleva la palabra «Rival»: sólo sus cartas (la región se llama «Mano del rival» para el lector de pantalla)', () => {
    // Con su imagen (sin ella, la carta muestra sus iniciales).
    render(<RivalHandStrip cards={[{ id: 'rival.card-14558127-1', name: 'Ash Blossom', art: 'https://images.ygoprodeck.com/images/cards_small/14558127.jpg', usedAt: null }]} onOpen={() => {}} />)

    expect(strip().textContent?.trim()).toBe('')
    expect(within(strip()).queryByText(/rival/i)).toBeNull()
    expect(within(strip()).getAllByRole('button')).toHaveLength(1)
  })
})

describe('la hoja de las handtraps del rival', () => {
  const SAVED: HandtrapConfig = { enabled: false, picks: [{ ...ASH, copies: 1 }, { ...VEILER, copies: 2 }], hand: 3 }

  it('cada carta tiene su contador de copias en el deck del rival: arranca de lo guardado, sube y baja, y la elegida lleva el aro', () => {
    const onSave = vi.fn()

    render(<HandtrapPicker isOpen config={SAVED} onClose={() => {}} onSave={onSave} />)

    expect(valueOf(copies(ASH.name))).toHaveValue('1')
    expect(valueOf(copies(VEILER.name))).toHaveValue('2')
    expect(valueOf(copies(MAXX.name))).toHaveValue('0')
    // La carta se elige subiendo su contador (la fila no es un botón que se marca): con copias lleva el aro de lo elegido; con 0, no.
    expect(screen.queryByRole('button', { pressed: true })).toBeNull()
    expect(rowOf(VEILER.name)).toHaveClass('inset-ring')
    expect(rowOf(MAXX.name)).not.toHaveClass('inset-ring')

    fireEvent.click(more(copies(MAXX.name)))
    fireEvent.click(less(copies(VEILER.name)))
    fireEvent.click(less(copies(ASH.name)))

    expect(valueOf(copies(MAXX.name))).toHaveValue('1')
    expect(rowOf(MAXX.name)).toHaveClass('inset-ring')
    expect(rowOf(ASH.name)).not.toHaveClass('inset-ring')

    // En el orden del catálogo: Maxx "C" antes que Effect Veiler; la mano, la guardada.
    fireEvent.click(screen.getByRole('button', { name: 'Usar estas handtraps' }))
    expect(onSave).toHaveBeenCalledWith([{ ...MAXX, copies: 1 }, { ...VEILER, copies: 1 }], 3)
  })

  it('cada carta va hasta 3 copias y el deck del rival no tiene tope: el «+» sólo se apaga en 3', () => {
    render(<HandtrapPicker isOpen config={SAVED} onClose={() => {}} onSave={() => {}} />)

    for (const card of [ASH, VEILER, IMPERM, MAXX]) {
      while (!more(copies(card.name)).hasAttribute('disabled')) fireEvent.click(more(copies(card.name)))
      expect(valueOf(copies(card.name))).toHaveValue('3')
    }

    // Doce cartas en el deck del rival, y las demás todavía se pueden sumar.
    expect(summary()).toHaveTextContent('Se reparte al azar entre 12 cartas.')
    expect(more(copies('Ghost Ogre & Snow Rabbit'))).toBeEnabled()
  })

  it('el contador general dice cuántas cartas tiene el rival en la mano, de 1 a 5, y abajo se lee entre cuántas se reparten', () => {
    const onSave = vi.fn()

    render(<HandtrapPicker isOpen config={{ ...SAVED, picks: [{ ...ASH, copies: 3 }, { ...VEILER, copies: 3 }, { ...IMPERM, copies: 3 }] }} onClose={() => {}} onSave={onSave} />)

    expect(valueOf(handCounter())).toHaveValue('3')
    expect(summary()).toHaveTextContent('Se reparte al azar entre 9 cartas.')

    fireEvent.click(more(handCounter()))
    fireEvent.click(more(handCounter()))
    expect(valueOf(handCounter())).toHaveValue('5')
    expect(more(handCounter())).toBeDisabled()

    for (let step = 0; step < 4; step += 1) fireEvent.click(less(handCounter()))
    expect(valueOf(handCounter())).toHaveValue('1')
    expect(less(handCounter())).toBeDisabled()

    fireEvent.click(more(handCounter()))
    fireEvent.click(screen.getByRole('button', { name: 'Usar estas handtraps' }))
    expect(onSave).toHaveBeenCalledWith([{ ...ASH, copies: 3 }, { ...VEILER, copies: 3 }, { ...IMPERM, copies: 3 }], 2)
  })

  it('con menos cartas que la mano lo avisa (la mano sale más corta); sin ninguna, no deja usarlas', () => {
    render(<HandtrapPicker isOpen config={{ ...SAVED, hand: 5 }} onClose={() => {}} onSave={() => {}} />)

    expect(summary()).toHaveTextContent('Con estas cartas la mano sale con 3.')
    expect(screen.getByRole('button', { name: 'Usar estas handtraps' })).toBeEnabled()

    fireEvent.click(less(copies(ASH.name)))
    fireEvent.click(less(copies(VEILER.name)))
    fireEvent.click(less(copies(VEILER.name)))

    expect(summary()).toHaveTextContent('Elegí al menos una carta.')
    expect(screen.getByRole('button', { name: 'Usar estas handtraps' })).toBeDisabled()
  })

  it('«Agregar otra carta» busca por nombre y suma la carta a la lista con una copia', async () => {
    vi.useFakeTimers()

    try {
      render(<HandtrapPicker isOpen config={SAVED} onClose={() => {}} onSave={() => {}} />)
      searchCards.mockResolvedValueOnce({ results: [{ ygoprodeckId: 91800273, name: 'Dimension Shifter' }], hasMore: false } as never)
      fireEvent.change(screen.getByRole('searchbox', { name: 'Buscar otra carta' }), { target: { value: 'Dimension' } })
      await act(async () => {
        await vi.advanceTimersByTimeAsync(400)
      })
      fireEvent.click(screen.getByRole('button', { name: 'Agregar Dimension Shifter a la lista' }))

      expect(valueOf(copies('Dimension Shifter'))).toHaveValue('1')
      expect(summary()).toHaveTextContent('Se reparte al azar entre 4 cartas.')
      expect(screen.getByRole('button', { name: 'Dimension Shifter ya está en la lista' })).toBeDisabled()
    } finally {
      vi.useRealTimers()
    }
  })
})

describe('la fila de las reglas de Solo', () => {
  it('dice cuántas tiene el rival en la mano y entre cuántas cartas, y el interruptor se recuerda', () => {
    render(<HandtrapsRow />)

    expect(screen.getByText('3 en mano · de 3 cartas')).toBeInTheDocument()

    const toggle = screen.getByRole('switch', { name: 'Handtraps del rival' })

    expect(toggle).toHaveAttribute('aria-checked', 'false')
    fireEvent.click(toggle)
    expect(toggle).toHaveAttribute('aria-checked', 'true')
    expect(readHandtrapConfig()).toEqual({ enabled: true, picks: [{ ...ASH, copies: 1 }, { ...VEILER, copies: 1 }, { ...IMPERM, copies: 1 }], hand: 3 })
    expect(JSON.parse(localStorage.getItem(HANDTRAP_CONFIG_KEY) ?? '{}')).toMatchObject({ enabled: true, hand: 3 })
  })

  it('con menos cartas que la mano, dice la mano que sale', () => {
    localStorage.setItem(HANDTRAP_CONFIG_KEY, JSON.stringify({ enabled: true, picks: [{ ...ASH, copies: 1 }, { ...VEILER, copies: 1 }], hand: 5 }))
    render(<HandtrapsRow />)

    expect(screen.getByText('2 en mano · de 2 cartas')).toBeInTheDocument()
  })

  it('elegir las handtraps las guarda con la mano y enciende el simulador', () => {
    render(<HandtrapsRow />)

    fireEvent.click(screen.getByRole('button', { name: 'Elegir… las handtraps del rival' }))
    fireEvent.click(more(copies(VEILER.name)))
    fireEvent.click(more(copies(VEILER.name)))
    fireEvent.click(more(handCounter()))
    fireEvent.click(screen.getByRole('button', { name: 'Usar estas handtraps' }))

    expect(readHandtrapConfig()).toEqual({ enabled: true, picks: [{ ...ASH, copies: 1 }, { ...VEILER, copies: 3 }, { ...IMPERM, copies: 1 }], hand: 4 })
    expect(screen.getByText('4 en mano · de 5 cartas')).toBeInTheDocument()
  })
})

describe('el botón de la barra de la mesa (Entrenar solo)', () => {
  const open = () => fireEvent.click(screen.getByRole('button', { name: 'Handtraps del rival' }))

  it('abre la hoja; usar las handtraps las guarda, enciende el simulador y reparte una mano nueva', () => {
    const onApply = vi.fn()

    render(<HandtrapsMatButton onApply={onApply} />)

    expect(screen.getByRole('button', { name: 'Handtraps del rival' })).toHaveAttribute('aria-pressed', 'false')
    open()
    expect(screen.getByText('Al aplicar, se reparte una mano nueva.')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Apagar el simulador' })).not.toBeInTheDocument()
    fireEvent.click(more(copies(VEILER.name)))
    fireEvent.click(more(handCounter()))
    fireEvent.click(screen.getByRole('button', { name: 'Usar estas handtraps' }))

    expect(readHandtrapConfig()).toEqual({ enabled: true, picks: [{ ...ASH, copies: 1 }, { ...VEILER, copies: 2 }, { ...IMPERM, copies: 1 }], hand: 4 })
    expect(onApply).toHaveBeenCalledTimes(1)
    expect(screen.getByRole('button', { name: 'Handtraps del rival' })).toHaveAttribute('aria-pressed', 'true')
  })

  it('con el simulador encendido ofrece apagarlo: se guarda apagado (con las mismas handtraps y la misma mano) y se reparte una mano nueva', () => {
    const saved = { enabled: true, picks: [{ ...VEILER, copies: 2 }, { ...ASH, copies: 1 }], hand: 2 }

    localStorage.setItem(HANDTRAP_CONFIG_KEY, JSON.stringify(saved))
    const onApply = vi.fn()

    render(<HandtrapsMatButton onApply={onApply} />)
    expect(screen.getByRole('button', { name: 'Handtraps del rival' })).toHaveAttribute('aria-pressed', 'true')
    open()
    fireEvent.click(screen.getByRole('button', { name: 'Apagar el simulador' }))

    expect(readHandtrapConfig()).toEqual({ ...saved, enabled: false })
    expect(onApply).toHaveBeenCalledTimes(1)
  })

  it('cancelar no cambia nada ni reparte', () => {
    const onApply = vi.fn()

    render(<HandtrapsMatButton onApply={onApply} />)
    open()
    fireEvent.click(more(copies(VEILER.name)))
    fireEvent.click(screen.getByRole('button', { name: 'Cancelar' }))

    expect(localStorage.getItem(HANDTRAP_CONFIG_KEY)).toBeNull()
    expect(onApply).not.toHaveBeenCalled()
  })
})

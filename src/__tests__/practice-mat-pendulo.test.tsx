// @vitest-environment jsdom
import { fireEvent, screen, within } from '@testing-library/react'
import '@testing-library/jest-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createMatState, replayMat } from '../app/practice-mat'
import type { MatCard } from '../components/probability/PracticeMat'
import { Harness, card, hand, render, status, tap, zone } from './support/practice-mat-harness'

vi.mock('../ygoprodeck', () => ({ fetchCardsByIds: vi.fn(async () => []) }))

const { showToastMessage } = vi.hoisted(() => ({ showToastMessage: vi.fn() }))

vi.mock('../app/use-toast-message', async () => ({ ...(await vi.importActual<typeof import('../app/use-toast-message')>('../app/use-toast-message')), showToastMessage }))

beforeEach(() => {
  localStorage.clear()
  showToastMessage.mockClear()
  HTMLElement.prototype.setPointerCapture = () => {}
  window.matchMedia = ((query: string) => ({ matches: query.includes('reduce'), media: query, addEventListener: () => {}, removeEventListener: () => {}, addListener: () => {}, removeListener: () => {}, onchange: null, dispatchEvent: () => false })) as typeof window.matchMedia
  window.requestAnimationFrame = (callback) => {
    callback(0)
    return 1
  }
  window.cancelAnimationFrame = () => {}
})

const monster = (id: number, frameType: string, level: number, scale?: number | null): MatCard['apiCard'] => ({ ...card(id, frameType), level, ...(scale === undefined ? {} : { scale }) })

/** Dos escalas (1 y 8: rango del 2 al 7), en la mano un Nivel 5 y un Nivel 8 (fuera de rango) y un Péndulo boca arriba en el Extra. `lowScale`: la escala de la carta de la zona 0 (`null`: la carta no la trae). */
function table(lowScale: number | null = 1) {
  const cards = new Map<string, MatCard>([
    ['card-1-1', { name: 'Escala Baja', apiCard: monster(1, 'effect_pendulum', 4, lowScale ?? undefined) }],
    ['card-2-1', { name: 'Escala Alta', apiCard: monster(2, 'effect_pendulum', 4, 8) }],
    ['card-3-1', { name: 'Dino', apiCard: monster(3, 'effect', 5) }],
    ['card-4-1', { name: 'Gigante', apiCard: monster(4, 'effect', 8) }],
    ['card-5-1', { name: 'Péndulo', apiCard: monster(5, 'effect_pendulum', 6, 3) }],
    ['card-6-1', { name: 'Magia', apiCard: { ...card(6, 'spell') } }],
  ])
  const initial = replayMat(createMatState(['card-1-1', 'card-2-1', 'card-3-1', 'card-4-1', 'card-5-1', 'card-6-1'], [], 6), [
    { type: 'place', id: 'card-1-1', zone: 'st', index: 0, pos: 'atk', how: 'scale' },
    { type: 'place', id: 'card-2-1', zone: 'st', index: 4, pos: 'atk', how: 'scale' },
    { type: 'move', id: 'card-5-1', to: 'extra', faceUp: true },
  ])

  return { cards, initial }
}

const openPicker = (name: string) => {
  tap(within(hand()).getByRole('listitem', { name }))
  fireEvent.click(screen.getByRole('menuitem', { name: /^Invocar varias por Péndulo/ }))

  return screen.getByRole('dialog', { name: 'Invocación de Péndulo' })
}

/** La posición de la de adelante y, después, la zona. */
const place = (position: 'En ataque' | 'En defensa', zoneName: string) => {
  fireEvent.click(screen.getByRole('menuitem', { name: new RegExp(`^${position}`) }))
  fireEvent.click(screen.getByRole('button', { name: `${zoneName}: elegir` }))
}

describe('la Invocación de Péndulo de varias cartas, en la mesa manual', () => {
  it('las escalas activas muestran su número y el menú dice el rango; se eligen de la mano y del Extra boca arriba, avisa la que no entra y coloca cada una, en orden', () => {
    const { cards, initial } = table()

    render(<Harness initial={initial} cards={cards} />)

    expect([...document.querySelectorAll('[data-scale]')].map((pill) => pill.getAttribute('data-scale'))).toEqual(['1', '8'])

    tap(within(hand()).getByRole('listitem', { name: 'Dino' }))
    expect(screen.getByRole('menuitem', { name: /^Invocación de Péndulo/ })).toHaveTextContent('Niveles 2 a 7')
    fireEvent.click(screen.getByRole('menuitem', { name: /^Invocar varias por Péndulo/ }))

    const sheet = screen.getByRole('dialog', { name: 'Invocación de Péndulo' })

    expect(within(sheet).getByText('Niveles 2 a 7')).toBeInTheDocument()
    // La carta desde la que se abrió ya va elegida; la Mágica no se ofrece.
    expect(within(sheet).getAllByRole('button', { pressed: true }).map((button) => button.getAttribute('aria-label'))).toEqual(['Dino, Mano, Nivel 5'])
    expect(within(sheet).queryByRole('button', { name: /^Magia/ })).not.toBeInTheDocument()
    // La que no entra va marcada, pero se puede elegir.
    const giant = within(sheet).getByRole('button', { name: 'Gigante, Mano, Nivel 8, fuera de rango' })

    expect(giant).toHaveAttribute('data-fit', 'out')
    fireEvent.click(giant)
    fireEvent.click(within(sheet).getByRole('button', { name: 'Péndulo, Extra, Nivel 6' }))
    expect(within(sheet).getByText('3 de 3')).toBeInTheDocument()
    fireEvent.click(within(sheet).getByRole('button', { name: 'Invocar 3 cartas' }))

    expect(showToastMessage).toHaveBeenCalledWith('Fuera de rango (Niveles 2 a 7): Gigante. La invocación sigue: un efecto puede permitirla.', 'warning')

    // Una por una, con el flujo de siempre: la posición y la zona, con el «1 de 3».
    expect(screen.getByRole('menu', { name: 'Dino' })).toBeInTheDocument()
    fireEvent.click(screen.getByRole('menuitem', { name: /^En ataque/ }))
    expect(within(status()).getByText('Tocá la zona para Invocación de Péndulo · 1 de 3: en ataque')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Zona de monstruo 1: elegir' }))
    place('En defensa', 'Zona de monstruo 2')
    place('En ataque', 'Zona de monstruo 3')

    expect(within(zone('Zona de monstruo 1')).getByRole('button', { name: 'Dino' })).toBeInTheDocument()
    expect(within(zone('Zona de monstruo 3')).getByRole('button', { name: 'Péndulo' })).toBeInTheDocument()
    expect(zone('Zona de monstruo 2').querySelector('[data-card-id="card-4-1"]')).not.toBeNull()
    // Tres jugadas `place` sueltas (se deshacen de a una) y el turno las cuenta como una sola Invocación de Péndulo: no avisa «Ya hiciste una».
    expect(within(status()).getByText('3/3')).toBeInTheDocument()
    expect(within(status()).getByText('Invocación de Péndulo de Péndulo en ataque')).toBeInTheDocument()
    expect(showToastMessage).toHaveBeenCalledTimes(1)
  })

  it('con una escala sin dato (un deck guardado sin `scale`) es «sin rango»: no se marca ninguna y no avisa', () => {
    const { cards, initial } = table(null)

    render(<Harness initial={initial} cards={cards} />)

    expect([...document.querySelectorAll('[data-scale]')].map((pill) => pill.getAttribute('data-scale'))).toEqual(['', '8'])

    const sheet = openPicker('Gigante')

    expect(within(sheet).getByText('Sin rango (una escala sin dato)')).toBeInTheDocument()
    expect(sheet.querySelector('[data-fit="out"]')).toBeNull()
    fireEvent.click(within(sheet).getByRole('button', { name: 'Invocar 1 carta' }))
    expect(showToastMessage).not.toHaveBeenCalled()
    place('En ataque', 'Zona de monstruo 1')
    expect(zone('Zona de monstruo 1').querySelector('[data-card-id="card-4-1"]')).not.toBeNull()
  })

  it('cancelar la hoja no juega nada; cerrar la posición de una deja las anteriores y cancela el resto', () => {
    const { cards, initial } = table()

    render(<Harness initial={initial} cards={cards} />)

    fireEvent.click(within(openPicker('Dino')).getByRole('button', { name: 'Cancelar' }))
    expect(screen.queryByRole('menu')).not.toBeInTheDocument()

    const sheet = openPicker('Dino')

    fireEvent.click(within(sheet).getByRole('button', { name: /^Gigante/ }))
    fireEvent.click(within(sheet).getByRole('button', { name: 'Invocar 2 cartas' }))
    place('En ataque', 'Zona de monstruo 1')
    expect(screen.getByRole('menu', { name: 'Gigante' })).toBeInTheDocument()
    fireEvent.keyDown(document, { key: 'Escape' })
    expect(screen.queryByRole('menu')).not.toBeInTheDocument()
    expect(within(status()).getByText('1/1')).toBeInTheDocument()
    expect(within(hand()).getByRole('listitem', { name: 'Gigante' })).toBeInTheDocument()
  })

  it('la de una sola carta sigue igual; sin otra para elegir, no se ofrece «varias»', () => {
    const { cards, initial } = table()
    const alone = replayMat(initial, [
      { type: 'move', id: 'card-4-1', to: 'gy' },
      { type: 'move', id: 'card-5-1', to: 'gy' },
    ])

    render(<Harness initial={alone} cards={cards} />)

    tap(within(hand()).getByRole('listitem', { name: 'Dino' }))
    expect(screen.queryByRole('menuitem', { name: /^Invocar varias por Péndulo/ })).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('menuitem', { name: /^Invocación de Péndulo/ }))
    place('En ataque', 'Zona de monstruo 1')
    expect(within(status()).getByText('Invocación de Péndulo de Dino en ataque')).toBeInTheDocument()
  })
})

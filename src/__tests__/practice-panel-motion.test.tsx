// @vitest-environment jsdom
import { act, fireEvent, screen } from '@testing-library/react'
import '@testing-library/jest-dom'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import type { MatAction } from '../app/practice-mat'
import { Harness, render } from './support/practice-mat-harness'

vi.mock('../ygoprodeck', () => ({ fetchCardsByIds: vi.fn(async () => []) }))

const { playSfx } = vi.hoisted(() => ({ playSfx: vi.fn() }))

vi.mock('../app/sfx', async () => ({ ...(await vi.importActual<typeof import('../app/sfx')>('../app/sfx')), playSfx }))

// Un combo corto: robar, y dos fases (cada paso sigue siendo una jugada en la lista).
const ACTIONS: MatAction[] = [
  { type: 'draw', count: 1 },
  { type: 'phase', phase: 'battle' },
  { type: 'phase', phase: 'end' },
]

/** Lo que pide la persona: el mock de `matchMedia` sólo responde a la consulta de movimiento reducido. */
let reduced = false
let scrollIntoView = vi.fn()
let originalScrollIntoView: unknown

beforeEach(() => {
  localStorage.clear()
  reduced = false
  window.matchMedia = ((query: string) => ({ matches: reduced && query.includes('reduce'), media: query, addEventListener: () => {}, removeEventListener: () => {}, addListener: () => {}, removeListener: () => {}, onchange: null, dispatchEvent: () => false })) as typeof window.matchMedia
  // jsdom no implementa `scrollIntoView`: se espía para ver con qué opciones y en qué elemento se llama.
  scrollIntoView = vi.fn()
  originalScrollIntoView = Element.prototype.scrollIntoView
  Element.prototype.scrollIntoView = scrollIntoView
})

afterEach(() => {
  ;(Element.prototype as { scrollIntoView?: unknown }).scrollIntoView = originalScrollIntoView
})

/** El desplazamiento va en el cuadro siguiente (en el efecto forzaba el layout de toda la página): se espera ese cuadro. */
const nextFrame = () => act(() => new Promise<void>((resolve) => requestAnimationFrame(() => resolve())))

/** La última llamada: las opciones con las que se desplazó y el elemento que se desplazó (la fila del paso actual). */
const lastScroll = () => {
  const [options] = scrollIntoView.mock.calls.at(-1) ?? []

  return { options, element: scrollIntoView.mock.contexts.at(-1) as HTMLElement }
}

it('al abrirse la lista va de un salto al paso actual; al avanzar a otro paso, se desplaza suave hasta su fila', async () => {
  render(<Harness actions={ACTIONS} />)
  expect(scrollIntoView).not.toHaveBeenCalled()
  await nextFrame()

  // Al montarse, el paso actual (la mano inicial) ya está activo: no se barre la lista entera.
  expect(lastScroll().options).toEqual({ block: 'nearest', behavior: 'auto' })

  fireEvent.click(screen.getByRole('button', { name: 'Siguiente' }))
  await nextFrame()

  const { options, element } = lastScroll()
  expect(options).toEqual({ block: 'nearest', behavior: 'smooth' })
  expect(element.querySelector('[aria-current="step"]')).not.toBeNull()
})

it('con movimiento reducido, la lista salta de una vez (behavior auto)', async () => {
  reduced = true
  render(<Harness actions={ACTIONS} />)

  fireEvent.click(screen.getByRole('button', { name: 'Siguiente' }))
  await nextFrame()

  expect(lastScroll().options).toEqual({ block: 'nearest', behavior: 'auto' })
})

it('el contexto del paso actual (el turno y la fase) entra con un fundido corto, que el movimiento reducido apaga', () => {
  render(<Harness actions={ACTIONS} />)

  fireEvent.click(screen.getByRole('button', { name: 'Siguiente' }))

  const current = document.querySelector('[aria-current="step"]')?.closest('li')
  expect(current?.querySelector('p.text-info-soft')).toHaveClass('animate-step-in', 'motion-reduce:animate-none')
})

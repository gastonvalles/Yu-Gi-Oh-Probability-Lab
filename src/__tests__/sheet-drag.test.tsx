// @vitest-environment jsdom
import { configureStore } from '@reduxjs/toolkit'
import { cleanup, fireEvent, render as renderBare, screen, within } from '@testing-library/react'
import '@testing-library/jest-dom'
import type { ReactElement } from 'react'
import { Provider } from 'react-redux'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import type { MatPile } from '../app/practice-mat'
import { settleLowered } from '../app/use-sheet-drag'
import { CardPicker, type PickCard } from '../components/auto/CardPicker'
import { SortSheet } from '../components/auto/SortSheet'
import { PileViewer } from '../components/probability/MatDialogs'

// Las hojas de abajo del celular se bajan con su asa sin cerrarse (para ver la mano) y se suben igual. Sin `matchMedia` (jsdom) el visor de una pila es la hoja del celular;
// las hojas del duelo automático (`Modal lowerable`) llevan el asa sólo donde salen de abajo (`width < 40rem`), así que esas pruebas lo simulan.
const store = configureStore({ reducer: { settings: (state = { handSize: 5, deckFormat: 'unlimited' as const }) => state } })
const render = (ui: ReactElement) => renderBare(ui, { wrapper: ({ children }) => <Provider store={store}>{children}</Provider> })

const NAMES: Record<string, string> = { a: 'Ash Blossom', b: 'Maxx C', c: 'Droll', d: 'Lunalight Black Sheep', e: 'Lunalight Tiger', f: 'Effect Veiler', g: 'Lunalight Wolf', h: 'Called by the Grave', i: 'Lunalight Kaleido Chick' }
const ALL = Object.keys(NAMES)
const CARDS: PickCard[] = [
  { key: 'a', name: 'Fallen of Albaz', art: null, place: 'Mano' },
  { key: 'b', name: 'Aluber the Jester of Despia', art: null, place: 'Cementerio' },
  { key: 'c', name: 'Branded Fusion', art: null },
]

const escape = () => fireEvent.keyDown(window, { key: 'Escape' })

/** Arrastra en vertical con el dedo (`dy` px, positivo hacia abajo) y suelta a los `elapsed` ms: lento, decide la posición. */
function drag(element: Element, dy: number, elapsed = 400) {
  const base = { pointerId: 5, pointerType: 'touch', isPrimary: true }

  fireEvent.pointerDown(element, { ...base, button: 0, buttons: 1, clientX: 120, clientY: 100 })
  fireEvent.pointerMove(element, { ...base, buttons: 1, clientX: 120, clientY: 100 + dy / 2 })
  fireEvent.pointerMove(element, { ...base, buttons: 1, clientX: 120, clientY: 100 + dy })
  const up = new Event('pointerup', { bubbles: true, cancelable: true })

  Object.assign(up, { ...base, button: 0, buttons: 0, clientX: 120, clientY: 100 + dy })
  Object.defineProperty(up, 'timeStamp', { value: performance.now() + elapsed })
  fireEvent(element, up)
}

/** Donde las hojas `sheet` y `keypad` salen de abajo (`max-sm`). */
function narrow() {
  window.matchMedia = ((query: string) => ({ matches: query === '(width < 40rem)', media: query, addEventListener: () => {}, removeEventListener: () => {}, addListener: () => {}, removeListener: () => {}, onchange: null, dispatchEvent: () => false })) as typeof window.matchMedia
}

beforeEach(() => {
  window.scrollTo = () => {}
})

afterEach(() => {
  cleanup()
  // @ts-expect-error: jsdom no lo trae; cada prueba lo pone si lo necesita.
  delete window.matchMedia
})

describe('al soltarla, la hoja decide por el tirón o por la posición', () => {
  it('lento: 64 px (o la mitad de un recorrido corto) desde donde estaba; un tirón, hacia donde fue', () => {
    expect(settleLowered(false, 64, 0.1, 400)).toBe(true)
    expect(settleLowered(false, 63, 0.1, 400)).toBe(false)
    expect(settleLowered(true, -64, -0.1, 400)).toBe(false)
    expect(settleLowered(true, -40, -0.1, 400)).toBe(true)
    // Para arriba estando arriba (o para abajo estando bajada) no cambia nada.
    expect(settleLowered(false, -200, -0.1, 400)).toBe(false)
    expect(settleLowered(true, 30, 0.1, 400)).toBe(true)
    // Un tirón corto basta; y uno que vuelve gana a la distancia.
    expect(settleLowered(false, 20, 0.8, 400)).toBe(true)
    expect(settleLowered(true, -20, -0.8, 400)).toBe(false)
    expect(settleLowered(false, 120, -0.6, 400)).toBe(false)
    // Una hoja chica (80 px de recorrido): la mitad alcanza. Sin medida, los 64 px.
    expect(settleLowered(false, 40, 0, 80)).toBe(true)
    expect(settleLowered(false, 50, 0, 0)).toBe(false)
  })
})

describe('el visor de una pila en el celular se baja con su asa, sin cerrarse', () => {
  const viewer = (pile: MatPile | null, onClose = () => {}) => (
    <PileViewer pile={pile} ids={pile ? ALL : []} info={(id) => ({ name: NAMES[id] ?? id, art: null })} targeted={new Set()} onPick={() => {}} onClose={onClose} many={{ label: () => 'Elegir jugada', onPick: () => {} }} />
  )

  it('arrastrar el encabezado la baja: el fondo deja de atajar y de cerrar, lo de adentro queda inerte y el foco pasa al asa; tocar la tira la sube con todo como estaba', () => {
    const onClose = vi.fn()

    render(viewer('deck', onClose))
    const dialog = within(screen.getByRole('dialog', { name: 'Main · 9' }))
    const grip = dialog.getByRole('button', { name: 'Bajar la hoja' })
    const search = dialog.getByRole('searchbox', { name: 'Buscar carta' })
    const backdrop = document.querySelector<HTMLElement>('.fixed.inset-0')!

    expect(grip).toHaveAttribute('aria-expanded', 'true')
    fireEvent.change(search, { target: { value: 'lunalight' } })
    fireEvent.click(dialog.getByRole('button', { name: 'Elegir varias' }))
    fireEvent.click(dialog.getByRole('button', { name: 'Lunalight Wolf' }))
    search.focus()

    drag(screen.getByRole('heading', { name: 'Main · 9' }), 120)
    expect(grip).toHaveAttribute('aria-expanded', 'false')
    expect(grip).toHaveAccessibleName('Subir la hoja: Main · 9')
    expect(grip).toHaveFocus()
    expect(search.closest('[inert]')).not.toBeNull()
    expect(dialog.getByRole('button', { name: 'Cerrar' }).closest('[inert]')).not.toBeNull()
    expect(grip.closest('[inert]')).toBeNull()
    // Los toques pasan a la mesa (y un toque afuera ya no la cierra).
    expect(backdrop).toHaveClass('pointer-events-none')

    // El clic que sigue al arrastre no cuenta; un toque en la tira, sí.
    fireEvent.click(grip)
    expect(grip).toHaveAttribute('aria-expanded', 'false')
    fireEvent.click(grip)
    expect(grip).toHaveAttribute('aria-expanded', 'true')
    expect(search).toHaveValue('lunalight')
    expect(search.closest('[inert]')).toBeNull()
    expect(backdrop).not.toHaveClass('pointer-events-none')
    expect(dialog.getAllByRole('button', { pressed: true }).map((card) => card.getAttribute('aria-label'))).toEqual(['Lunalight Wolf (1.ª elegida)'])
    expect(onClose).not.toHaveBeenCalled()
  })

  it('mientras se arrastra sigue al dedo una vez por cuadro (lo escribe en la hoja, sin redibujar el diálogo) y al soltarla vuelve a mandar React', () => {
    const frames = new Map<number, FrameRequestCallback>()
    let next = 1

    vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => {
      frames.set(next, callback)
      next += 1
      return next - 1
    })
    vi.stubGlobal('cancelAnimationFrame', (id: number) => frames.delete(id))
    render(viewer('gy'))
    const grip = within(screen.getByRole('dialog')).getByRole('button', { name: 'Bajar la hoja' })
    const base = { pointerId: 5, pointerType: 'touch', isPrimary: true, buttons: 1, clientX: 120 }
    const moved = () => document.querySelector<HTMLElement>('[style*="translate"]')?.style.translate ?? ''

    fireEvent.pointerDown(grip, { ...base, button: 0, clientY: 100 })
    fireEvent.pointerMove(grip, { ...base, clientY: 120 })
    expect(moved()).toContain('+ 20px')
    fireEvent.pointerMove(grip, { ...base, clientY: 150 })
    const waiting = frames.size

    fireEvent.pointerMove(grip, { ...base, clientY: 170 })
    // Dos movimientos en el mismo cuadro: un solo cuadro pedido, el del último.
    expect(frames.size).toBe(waiting)
    expect(moved()).toContain('+ 20px')
    frames.forEach((callback) => callback(0))
    expect(moved()).toContain('+ 70px')
    fireEvent.pointerUp(grip, { ...base, buttons: 0, clientY: 170 })
    expect(grip).toHaveAttribute('aria-expanded', 'false')
    expect(moved()).not.toContain('clamp(')
    vi.unstubAllGlobals()
  })

  it('un arrastre corto no la baja ni la sube, el de la grilla (que scrollea) no la mueve, y bajada la sube arrastrarla para arriba', () => {
    render(viewer('gy'))
    const dialog = within(screen.getByRole('dialog'))
    const grip = dialog.getByRole('button', { name: 'Bajar la hoja' })

    drag(grip, 30)
    expect(grip).toHaveAttribute('aria-expanded', 'true')
    drag(dialog.getByRole('button', { name: 'Droll' }), 200)
    expect(grip).toHaveAttribute('aria-expanded', 'true')

    drag(grip, 90)
    expect(grip).toHaveAttribute('aria-expanded', 'false')
    drag(grip, -40)
    expect(grip).toHaveAttribute('aria-expanded', 'false')
    drag(grip, -90)
    expect(grip).toHaveAttribute('aria-expanded', 'true')
  })

  it('toda la franja de arriba es el asa (tocar el título la baja) menos la X, que cierra; Escape cierra aunque esté bajada', () => {
    const onClose = vi.fn()

    render(viewer('gy', onClose))
    const dialog = within(screen.getByRole('dialog'))
    const grip = dialog.getByRole('button', { name: 'Bajar la hoja' })

    fireEvent.click(dialog.getByRole('button', { name: 'Cerrar' }))
    expect(onClose).toHaveBeenCalledTimes(1)
    expect(grip).toHaveAttribute('aria-expanded', 'true')

    fireEvent.click(dialog.getByRole('heading'))
    expect(grip).toHaveAttribute('aria-expanded', 'false')
    escape()
    expect(onClose).toHaveBeenCalledTimes(2)
  })

  it('abrir otra pila (o volver a abrirlo) arranca arriba', () => {
    const view = render(viewer('gy'))
    const grip = () => screen.getByRole('button', { name: /la hoja/ })

    fireEvent.click(grip())
    expect(grip()).toHaveAttribute('aria-expanded', 'false')
    view.rerender(viewer('banished'))
    expect(grip()).toHaveAttribute('aria-expanded', 'true')
  })
})

describe('las hojas del duelo automático se minimizan sin contestar la pregunta', () => {
  it('elegir cartas: «Minimizar» la deja en el asa de la mesa (los toques pasan a la mesa, que nunca tuvo velo), nada se contesta ni se cancela, Tab se queda en el asa y al reabrirla sigue lo elegido', () => {
    const onPick = vi.fn()
    const onCancel = vi.fn()

    render(<CardPicker title="Elegí qué agregar a tu mano" kicker="Branded Fusion" cards={CARDS} min={1} max={2} onPick={onPick} onCancel={onCancel} />)
    const dialog = screen.getByRole('dialog', { name: 'Elegí qué agregar a tu mano' })
    const albaz = () => within(dialog).getByRole('option', { name: /Albaz/ })
    const root = dialog.parentElement!

    // Desde la mesa: al centro de la fila Extra (lo escribe la mesa) en todos los anchos, ya no desde abajo.
    expect(root).toHaveAttribute('data-anchor', 'mat')
    expect(dialog).toHaveClass('top-[var(--mat-y,50%)]', 'left-[var(--mat-x,50%)]')
    expect(dialog).not.toHaveClass('max-sm:animate-sheet-up')
    fireEvent.click(albaz())
    albaz().focus()
    fireEvent.click(within(dialog).getByRole('button', { name: 'Minimizar' }))
    const show = within(dialog).getByRole('button', { name: 'Mostrar la pregunta' })

    expect(dialog).toHaveAttribute('data-minimized')
    expect(dialog).toHaveClass('top-[var(--mat-extra,calc(100%-1rem))]', '-translate-y-full')
    expect(show.parentElement).toHaveTextContent(/^Elegí qué agregar a tu mano$/)
    expect(show).toHaveFocus()
    expect(root).toHaveClass('pointer-events-none')
    expect(root.querySelector('.animate-nav-scrim')).toBeNull()
    expect(within(dialog).queryByRole('listbox')).toBeNull()
    expect(dialog.querySelector('[role="listbox"]')!.closest('[inert]')).not.toBeNull()
    fireEvent.keyDown(document, { key: 'Tab' })
    expect(show).toHaveFocus()
    expect(onPick).not.toHaveBeenCalled()
    expect(onCancel).not.toHaveBeenCalled()

    fireEvent.click(show)
    expect(dialog).not.toHaveAttribute('data-minimized')
    expect(within(dialog).getByRole('button', { name: 'Minimizar' })).toHaveFocus()
    expect(root).not.toHaveClass('pointer-events-none')
    expect(albaz()).toHaveAttribute('aria-selected', 'true')
    escape()
    expect(onCancel).toHaveBeenCalledTimes(1)
  })

  it('ordenar: se minimiza igual en el escritorio y Escape sigue sin cerrarla', () => {
    const onSort = vi.fn()

    render(<SortSheet cards={CARDS} onSort={onSort} />)
    fireEvent.click(screen.getByRole('button', { name: 'Minimizar' }))
    expect(screen.getByRole('dialog')).toHaveAttribute('data-minimized')
    escape()
    expect(screen.getByRole('dialog')).toBeInTheDocument()
    expect(onSort).not.toHaveBeenCalled()
  })

  it('ya no llevan el asa de bajar (ni en el celular)', () => {
    narrow()
    render(<CardPicker title="Elegí" cards={CARDS} min={1} max={2} onPick={() => {}} />)

    expect(screen.queryByRole('button', { name: 'Bajar la hoja' })).not.toBeInTheDocument()
  })
})

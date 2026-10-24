// @vitest-environment jsdom
// El visor de una pila, guardar o renombrar un combo y la calculadora rápida salen al cerrarse (`usePresence`, en `Modal`): sus padres ya no les cambian la `key` al cerrarlos
// (eso los volvía a montar cerrados y la salida no llegaba a verse). Lo que la `key` reiniciaba ahora se reinicia al abrir.
import { act, fireEvent, render as renderBare, screen, within } from '@testing-library/react'
import '@testing-library/jest-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { replayMat, type MatAction } from '../app/practice-mat'
import { EXIT_MS } from '../app/use-presence'
import { SaveComboDialog } from '../components/probability/MatDialogs'
import { QuickCalculator } from '../components/probability/QuickCalculator'
import { Harness, INITIAL, render } from './support/practice-mat-harness'

vi.mock('../ygoprodeck', () => ({ fetchCardsByIds: vi.fn(async () => []) }))

vi.mock('../app/sfx', async () => ({ ...(await vi.importActual<typeof import('../app/sfx')>('../app/sfx')), playSfx: vi.fn() }))

const original = { animate: Element.prototype.animate, matchMedia: window.matchMedia }
const media = (reduce: boolean) =>
  ((query: string) => ({ matches: reduce && query.includes('reduce'), media: query, addEventListener: () => {}, removeEventListener: () => {}, addListener: () => {}, removeListener: () => {}, onchange: null, dispatchEvent: () => false })) as typeof window.matchMedia

beforeEach(() => {
  localStorage.clear()
  HTMLElement.prototype.setPointerCapture = () => {}
  // La mesa se monta quieta (sin el reparto animado); la salida se prende recién antes de cerrar (`fakeExit`).
  window.matchMedia = media(true)
  let frameTime = 0
  // Cada cuadro llega enseguida y un segundo después del anterior: lo que cuenta cuadro a cuadro (el número de un anillo, ya sin el movimiento reducido) termina en vez de girar en el lugar.
  window.requestAnimationFrame = (callback) => {
    frameTime += 1000
    callback(frameTime)
    return 1
  }
  window.cancelAnimationFrame = () => {}
  // jsdom no carga index.css: las dos entradas del `Modal` y la del visor de una pila (`sheet-in`), como en la app.
  const style = Object.assign(document.createElement('style'), { textContent: '.animate-nav-scrim { animation-name: nav-scrim } .animate-dialog-enter { animation-name: dialog-enter } .animate-sheet-in { animation-name: sheet-in }' })
  style.dataset.test = ''
  document.head.append(style)
})

afterEach(() => {
  vi.useRealTimers()
  Element.prototype.animate = original.animate
  window.matchMedia = original.matchMedia
  document.head.querySelectorAll('style[data-test]').forEach((style) => style.remove())
})

/** La Web Animations API de mentira, con su `finished` (como en `use-presence.test.tsx`), y sin el movimiento reducido: la salida termina a mano con `finish()`. */
function fakeExit() {
  const calls: { element: Element; keyframes: Keyframe[]; animation: Animation }[] = []
  let finish = () => {}
  const finished = new Promise<void>((resolve) => {
    finish = resolve
  })

  Element.prototype.animate = function (this: Element, keyframes) {
    const animation = { finished, reverse: vi.fn(), cancel: vi.fn() } as unknown as Animation

    calls.push({ element: this, keyframes: keyframes as Keyframe[], animation })
    return animation
  }
  window.matchMedia = media(false)

  return { calls, finish: async () => act(async () => finish()) }
}

const toGy = (ids: string[]) => replayMat(INITIAL, ids.map((id): MatAction => ({ type: 'move', id, to: 'gy' })))

describe('el visor de una pila sale al cerrarse: la mesa ya no le cambia la `key`', () => {
  it('cerrado sigue siendo el mismo diálogo mientras hace la inversa de su entrada (inerte, sin atajar toques, con lo último que mostró) y el foco ya volvió a la pila; vuelto a abrir mientras sale, es el mismo visor', async () => {
    render(<Harness initial={toGy(['card-1-1', 'card-2-1'])} />)
    const gy = screen.getByRole('button', { name: 'GY: 2' })

    gy.focus()
    fireEvent.click(gy)
    const dialog = screen.getByRole('dialog', { name: 'GY · 2' })
    const { calls, finish } = fakeExit()

    fireEvent.click(within(dialog).getByRole('button', { name: 'Cerrar' }))
    expect(dialog).toBeInTheDocument()
    expect(dialog).toHaveTextContent('Maxx C')
    expect(dialog.inert).toBe(true)
    expect(dialog).toHaveAttribute('data-leaving')
    expect(dialog.style.pointerEvents).toBe('none')
    // Sin velo que fundir (no tapa el campo): la hoja hace su entrada, `sheet-in`, al revés.
    const exits = calls.filter(({ element }) => dialog.contains(element))
    expect(exits.map(({ keyframes }) => keyframes)).toEqual([[{ opacity: 0, transform: 'translateY(10px)' }]])
    expect(document.activeElement).toBe(gy)

    fireEvent.click(gy)
    expect(screen.getByRole('dialog', { name: 'GY · 2' })).toBe(dialog)
    expect(dialog.inert).toBe(false)
    expect(dialog).not.toHaveAttribute('data-leaving')
    expect(exits.map(({ animation }) => vi.mocked(animation.reverse).mock.calls.length)).toEqual([1])

    fireEvent.click(within(dialog).getByRole('button', { name: 'Cerrar' }))
    await finish()
    expect(dialog).not.toBeInTheDocument()
  })
})

describe('guardar o renombrar un combo: el campo arranca con el nombre al abrirse, no al cerrarse', () => {
  const save = (isOpen: boolean, defaultName: string) => <SaveComboDialog isOpen={isOpen} defaultName={defaultName} onSave={() => {}} onClose={() => {}} />

  it('cerrado sale con lo que tenía escrito; vuelto a abrir (también mientras sale) es el mismo diálogo y arranca con el nombre de ahora', async () => {
    const view = renderBare(save(false, 'Combo 1'))

    view.rerender(save(true, 'Combo 1'))
    const dialog = screen.getByRole('dialog', { name: 'Guardar combo' })
    const field = () => dialog.querySelector('input')!
    expect(field()).toHaveValue('Combo 1')
    fireEvent.change(field(), { target: { value: 'Mi línea' } })

    const { finish } = fakeExit()
    view.rerender(save(false, 'Combo 2'))
    expect(dialog.parentElement).toHaveAttribute('data-leaving')
    expect(field()).toHaveValue('Mi línea')

    view.rerender(save(true, 'Combo 2'))
    expect(screen.getByRole('dialog', { name: 'Guardar combo' })).toBe(dialog)
    expect(field()).toHaveValue('Combo 2')

    view.rerender(save(false, 'Combo 2'))
    await finish()
    expect(dialog).not.toBeInTheDocument()
  })

  it('vuelto a abrir justo cuando la salida terminó, antes de que React lo desmonte, vuelve abierto: ni inerte ni en su último cuadro (lo encontró la medición del visor en el celular)', () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] })
    const view = renderBare(save(true, 'Combo 1'))
    const dialog = screen.getByRole('dialog', { name: 'Guardar combo' })
    const root = dialog.parentElement!
    const { calls } = fakeExit()

    view.rerender(save(false, 'Combo 1'))
    expect(root).toHaveAttribute('data-leaving')

    // La red de la salida (su duración más el margen) la da por terminada y, en el mismo tramo, antes de que React la desmonte, se vuelve a abrir.
    act(() => {
      vi.advanceTimersByTime(EXIT_MS + 100)
      view.rerender(save(true, 'Combo 1'))
    })
    expect(screen.getByRole('dialog', { name: 'Guardar combo' })).toBe(dialog)
    expect(root.inert).toBe(false)
    expect(root).not.toHaveAttribute('data-leaving')
    expect(root.style.pointerEvents).toBe('')
    // La salida había quedado quieta en su último cuadro (transparente): vuelve al revés.
    expect(calls.filter(({ element }) => root.contains(element)).map(({ animation }) => vi.mocked(animation.reverse).mock.calls.length)).toEqual([1, 1])
  })

  it('sin la Web Animations API se desmonta enseguida, y al abrirse otra vez arranca con el nombre de ahora', () => {
    const view = renderBare(save(true, 'Combo 1'))

    fireEvent.change(screen.getByRole('textbox', { name: 'Nombre' }), { target: { value: 'Mi línea' } })
    view.rerender(save(false, 'Combo 1'))
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()

    view.rerender(save(true, 'Combo 2'))
    expect(screen.getByRole('textbox', { name: 'Nombre' })).toHaveValue('Combo 2')
  })
})

describe('la calculadora rápida arranca de cero al abrirse, no al cerrarse', () => {
  const calculator = (isOpen: boolean, deckSize: number) => <QuickCalculator isOpen={isOpen} onClose={() => {}} deckSize={deckSize} handSize={5} />
  const value = (dialog: HTMLElement, name: string) => within(dialog).getByRole('spinbutton', { name })

  it('cerrada sale con lo que tenía; vuelta a abrir (también mientras sale) es el mismo diálogo, con el deck de ahora y 3 copias', async () => {
    const view = renderBare(calculator(false, 42))

    view.rerender(calculator(true, 42))
    const dialog = screen.getByRole('dialog', { name: 'Calculadora rápida' })
    expect(value(dialog, 'Cartas en el deck')).toHaveValue(42)
    fireEvent.change(value(dialog, 'Copias'), { target: { value: '7' } })

    const { finish } = fakeExit()
    view.rerender(calculator(false, 40))
    expect(dialog.parentElement).toHaveAttribute('data-leaving')
    expect(dialog.querySelectorAll('input')[1]).toHaveValue(7)

    view.rerender(calculator(true, 40))
    expect(screen.getByRole('dialog', { name: 'Calculadora rápida' })).toBe(dialog)
    expect(value(dialog, 'Cartas en el deck')).toHaveValue(40)
    expect(value(dialog, 'Copias')).toHaveValue(3)

    view.rerender(calculator(false, 40))
    await finish()
    expect(dialog).not.toBeInTheDocument()
  })
})

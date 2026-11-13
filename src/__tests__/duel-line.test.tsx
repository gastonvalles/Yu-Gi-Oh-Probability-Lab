// @vitest-environment jsdom
import { act, cleanup, fireEvent, render as renderBare, screen, within } from '@testing-library/react'
import '@testing-library/jest-dom'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it, onTestFinished, vi } from 'vitest'

import type { DuelConnect } from '../app/use-duel'
import { DuelLine, type LaneNotice } from '../components/duel/DuelBar'
import { LifeBadge } from '../components/duel/LifeScore'
import { COMPACT_FIELD_MEDIA_QUERY, phoneDuelLayout } from '../components/probability/compact-field'
import { createMemoryRoom, type MemoryRoom } from './support/memory-room'
import { t } from '../i18n'
import { asSocket, createDuelHarness, phaseChip } from './support/duel-screen-harness'

/**
 * La mesa del duelo en el celular (Gastón, 2026-11-12: «evitar espacio vacío entre campo y mano»): las vidas en chapas (la del rival en la barra) y, entre el campo y tu mano, nada: la línea es una
 * marca de 0 px y lo que dice (un aviso) va arriba, debajo de la barra, sólo mientras está («deberían aparecer arriba»); uno sin botones se saca deslizándolo. Nada de lo que aparece mueve el campo.
 */
vi.setConfig({ testTimeout: 20_000 })

vi.mock('../ygoprodeck', () => ({ fetchCardsByIds: vi.fn(async () => []), fetchCardArts: vi.fn(async () => []) }))
// La calculadora de vidas se carga a pedido (`lazy`): en las pruebas llega al instante.
vi.mock('../components/deck-mode/lazy-steps', async (importOriginal) => ({ ...(await importOriginal<typeof import('../components/deck-mode/lazy-steps')>()), LazyLifeCalculatorScreen: (await import('../components/life/LifeCalculatorScreen')).LifeCalculatorScreen }))

let memory: MemoryRoom
let connect: DuelConnect

const { changeLife, flush, openTable, startDuel } = createDuelHarness(() => ({ memory, connect }))
const phone = (query: string) => ({ matches: query === COMPACT_FIELD_MEDIA_QUERY || query.includes('reduce'), media: query, addEventListener: () => {}, removeEventListener: () => {}, addListener: () => {}, removeListener: () => {}, onchange: null, dispatchEvent: () => false })

beforeEach(() => {
  memory = createMemoryRoom()
  connect = () => asSocket(memory.join())
  localStorage.clear()
  sessionStorage.clear()
  window.history.replaceState(null, '', '#duel')
  HTMLElement.prototype.setPointerCapture = () => {}
  HTMLElement.prototype.scrollIntoView = () => {}
  window.matchMedia = phone as unknown as typeof window.matchMedia
  const size = { width: window.innerWidth, height: window.innerHeight }
  Object.assign(window, { innerWidth: 390, innerHeight: 844 })
  onTestFinished(() => {
    Object.assign(window, { innerWidth: size.width, innerHeight: size.height })
  })
})

afterEach(() => {
  vi.useRealTimers()
  cleanup()
})

describe('la línea del celular', () => {
  it('no ocupa lugar: entre el campo y tu mano queda una marca de 0 px; la última jugada no sale en la mesa y un aviso va arriba, debajo de la barra (sobre la mano del rival), sólo mientras está, sin mover el campo', () => {
    const { host, guest } = startDuel()
    openTable(host, guest)
    const layout = phoneDuelLayout(390, 844, { tilted: true, bar: 58, bottom: 68 })
    // Quien tiene el turno pasa de fase y le pregunta al otro: su línea dice que espera.
    const [mover, other] = phaseChip(host).hasAttribute('disabled') ? [guest, host] : [host, guest]
    const line = () => mover.container.querySelector<HTMLElement>('[data-duel-line]')!
    const field = () => within(mover.container).getByLabelText('Campo')
    const geometry = () => ({ line: [line().className, line().style.marginBottom], field: [field().style.width, field().style.height, field().style.marginTop, field().style.gridTemplateRows] })
    const before = geometry()

    expect(line()).toHaveClass('h-0')
    expect(line().style.marginBottom).toBe(`${layout.gap}px`)
    expect(field().style.height).toBe(`${layout.fieldHeight}px`)
    expect(line().childElementCount).toBe(0)

    // La última jugada (las vidas que cambia el rival con su calculadora) queda en el chat: la mesa no la muestra.
    changeLife(other, ['1', '0', '0', '0'])
    expect(within(line()).queryByRole('button')).toBeNull()
    expect(geometry()).toEqual(before)

    // Un aviso va arriba: debajo de la barra (absoluto, `top-full`), no en la marca de entre el campo y tu mano; no ocupa lugar ni corre el campo.
    fireEvent.click(phaseChip(mover))
    fireEvent.click(screen.getByRole('menuitem', { name: /Battle Phase/ }))
    flush()
    const top = mover.container.querySelector<HTMLElement>('[data-mat-line]')!

    expect(top.querySelector('[data-lane="passAsking"]')).not.toBeNull()
    expect(top).toHaveClass('absolute', 'top-full', 'h-11', 'pointer-events-none', 'z-20')
    // Hermano de la barra (en su caja `relative`), y antes del campo en el orden de la página.
    expect(top.parentElement).toContainElement(within(mover.container).getByRole('button', { name: /^Salir del duelo/ }))
    expect(top.compareDocumentPosition(field()) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    expect(line().childElementCount).toBe(0)
    expect(geometry()).toEqual(before)
  })
})

describe('sacar un aviso deslizándolo', () => {
  // Gastón, 2026-11-12: «no se pueden eliminar deslizandolos a la izquierda o derecha como antes».
  const moment: LaneNotice = { kind: 'ask', text: 'Invocación Normal de Gene-Warped Warwolf', actions: [] }
  const swipeable = () => screen.queryByTitle(t('duel.log.dismiss'))
  const drag = (element: HTMLElement, dx: number) => {
    fireEvent.pointerDown(element, { button: 0, pointerId: 1, clientX: 100, clientY: 10 })
    fireEvent.pointerMove(element, { button: 0, pointerId: 1, clientX: 100 + dx, clientY: 12 })
    fireEvent.pointerUp(element, { button: 0, pointerId: 1, clientX: 100 + dx, clientY: 12 })
  }

  it('uno sin botones se saca de costado (a izquierda o derecha, o con Supr) y no vuelve hasta que la línea diga otra cosa; poco arrastre lo deja', () => {
    const view = renderBare(<DuelLine lane={moment} rivalName="Ana" />)

    expect(swipeable()).toHaveClass('touch-pan-y', 'pointer-events-auto', 'motion-reduce:transition-none')
    expect(swipeable()).toHaveAttribute('aria-keyshortcuts', 'Delete')
    drag(swipeable()!, 20)
    expect(document.querySelector('[data-lane="ask"]')).not.toBeNull()
    drag(swipeable()!, 120)
    expect(document.querySelector('[data-lane]')).toBeNull()
    // Lo mismo otra vez (otro objeto, el mismo texto): no vuelve.
    view.rerender(<DuelLine lane={{ ...moment }} rivalName="Ana" />)
    expect(document.querySelector('[data-lane]')).toBeNull()
    // Otro aviso sí sale; para la izquierda también se va, y con Supr.
    view.rerender(<DuelLine lane={{ kind: 'looking', what: 'deck' }} rivalName="Ana" />)
    expect(document.querySelector('[data-lane="looking"]')).not.toBeNull()
    drag(swipeable()!, -120)
    expect(document.querySelector('[data-lane]')).toBeNull()
    view.rerender(<DuelLine lane={{ kind: 'undoResult', result: 'denied' }} rivalName="Ana" />)
    fireEvent.keyDown(swipeable()!, { key: 'Delete' })
    expect(document.querySelector('[data-lane]')).toBeNull()
    // Sin aviso y con el mismo de vuelta, es uno nuevo: sale.
    view.rerender(<DuelLine lane={null} rivalName="Ana" />)
    view.rerender(<DuelLine lane={moment} rivalName="Ana" />)
    expect(document.querySelector('[data-lane="ask"]')).not.toBeNull()
  })

  it('uno con botones no se desliza: se contesta', () => {
    renderBare(<DuelLine lane={{ kind: 'undoAsked', onAllow: () => {}, onDeny: () => {} }} rivalName="Ana" />)

    expect(swipeable()).toBeNull()
    expect(document.querySelector('[data-lane="undoAsked"]')).not.toBeNull()
    expect(screen.getAllByRole('button')).toHaveLength(2)
  })
})

describe('las chapas de vidas', () => {
  it('al cambiar, el número late (sin volver a montarse) y el «−N» chico queda adentro de la chapa (sin número afuera; sólo `transform`/`opacity`, quieto con movimiento reducido), rojo si es tu daño y menta si es el del rival, y se anuncia', () => {
    const view = renderBare(
      <>
        <LifeBadge name="Vos" label="Vos" life={8000} mine />
        <LifeBadge name="Rival" label="Rival" life={8000} />
      </>,
    )

    act(() => {
      view.rerender(
        <>
          <LifeBadge name="Vos" label="Vos" life={6900} mine />
          <LifeBadge name="Rival" label="Rival" life={7000} />
        </>,
      )
    })
    const mine = screen.getByRole('group', { name: /^Puntos de vida de Vos/ })
    const rival = screen.getByRole('group', { name: /^Puntos de vida de Rival/ })
    const delta = (badge: HTMLElement) => badge.querySelector<HTMLElement>('[data-life-delta]')!

    expect(delta(mine)).toHaveTextContent(/^−1100$/)
    expect(delta(mine)).toHaveClass('animate-linger', 'motion-reduce:animate-none', 'text-danger-soft', 'font-extrabold')
    expect(delta(mine).className).not.toMatch(/text-hit|text-stat/)
    expect(delta(rival)).toHaveTextContent(/^−1000$/)
    expect(delta(rival)).toHaveClass('text-success')
    // Ningún número de daño fuera de una chapa.
    expect(document.querySelectorAll('[data-life-delta]')).toHaveLength(2)
    for (const number of document.querySelectorAll('[data-life-delta]')) expect(number.closest('[data-life-badge]')).not.toBeNull()
    expect(mine.querySelector('[aria-live="polite"]')).toHaveTextContent('Vos −1100')
    expect(mine).toHaveClass('bg-background/82')
    expect(mine.className).not.toMatch(/backdrop-blur|rounded/)

    // El «−N» sólo toca `transform` y `opacity` (lo registra `index.css`); el golpe del número es `scale` por Web Animations (`BUMP_FRAMES`).
    const css = readFileSync(path.resolve(__dirname, '..', 'index.css'), 'utf8')
    for (const name of ['linger']) {
      const body = new RegExp(`@keyframes ${name} \\{([\\s\\S]*?)\\n  \\}`).exec(css)![1]!
      const props = [...body.matchAll(/([a-z-]+):/g)].map(([, prop]) => prop).filter((prop) => prop !== 'animation-timing-function')

      expect(props.every((prop) => prop === 'transform' || prop === 'opacity')).toBe(true)
    }
    // El «−N» grande de afuera ya no existe.
    expect(css).not.toMatch(/life-delta/)
  })

  it('el turno lo dice el borde (3 px en la de quien juega, tenue y de 1 px en la otra) y la chapa no dice «turno» ni cambia de medida', () => {
    renderBare(
      <>
        <LifeBadge name="Vos" label="Vos" life={8000} mine active />
        <LifeBadge name="Rival" label="Rival" life={8000} active={false} compact />
      </>,
    )
    const mine = screen.getByRole('group', { name: /^Puntos de vida de Vos/ })
    const rival = screen.getByRole('group', { name: /^Puntos de vida de Rival/ })

    expect(mine).toHaveClass('border-[3px]', 'border-primary', 'px-1.5', 'py-0.5')
    expect(rival).toHaveClass('border', 'border-border-subtle', 'px-2', 'py-0.5')
    expect(rival).not.toHaveClass('border-[3px]')
    for (const badge of [mine, rival]) expect(badge.textContent).not.toMatch(/turno/i)
    // Con la medida de siempre: 3 px de borde + 6 de relleno = 1 px + 8 (y 3 + 2 = 1 + 4 de alto).
    expect(rival).toHaveTextContent('Rival8000')
    expect(rival.querySelector('.text-lead')).not.toBeNull()
  })

  it('muestra un solo número durante y después del cambio (el número que late y el «−N» no comparten clave: «75007500»)', () => {
    vi.useFakeTimers()
    const view = renderBare(<LifeBadge name="Rival" label="Rival" life={8000} />)
    const number = () => screen.getByRole('group', { name: /^Puntos de vida de Rival/ }).querySelector('.text-stat')!.parentElement!

    for (const life of [7500, 7000, 5500]) {
      act(() => view.rerender(<LifeBadge name="Rival" label="Rival" life={life} />))
      expect(number()).toHaveTextContent(new RegExp(`^${life}$`))
      act(() => vi.advanceTimersByTime(2000))
      expect(number().textContent).toBe(String(life))
    }
  })

  it('con `onClick` (el duelo manual) es un botón de 44 px que abre la calculadora', () => {
    const open = vi.fn()

    renderBare(<LifeBadge name="Ana" label="Vos" life={8000} mine active onClick={open} />)
    const button = screen.getByRole('button', { name: 'Puntos de vida de Ana: 8000. Abrir la calculadora de vidas' })

    expect(button).toHaveClass('min-h-11', 'min-w-11', 'focus-visible:shadow-focus')
    expect(button).toHaveTextContent('Vos8000')
    fireEvent.click(button)
    expect(open).toHaveBeenCalledTimes(1)
  })
})

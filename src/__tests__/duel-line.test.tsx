// @vitest-environment jsdom
import { act, cleanup, fireEvent, render as renderBare, screen, within } from '@testing-library/react'
import '@testing-library/jest-dom'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it, onTestFinished, vi } from 'vitest'

import type { DuelConnect } from '../app/use-duel'
import { ChainNotice } from '../components/auto/ChainNotice'
import { LifeBadge } from '../components/duel/LifeScore'
import { THEIR_HAND } from '../components/duel/their-hand'
import { COMPACT_FIELD_MEDIA_QUERY, phoneDuelLayout } from '../components/probability/compact-field'
import { createMemoryRoom, type MemoryRoom } from './support/memory-room'
import { t } from '../i18n'
import { asSocket, createDuelHarness, phaseChip, render } from './support/duel-screen-harness'

/**
 * La mesa del duelo en el celular (Gastón, 2026-11-10: «el cartel con la info de la carta empujaría el campo y no debería»): las vidas en chapas junto a cada lado y, entre el campo y tu mano, la
 * línea de alto fijo con una sola cosa por vez (la cadena, un aviso o la última jugada). Nada de lo que aparece cambia su alto ni mueve el campo.
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
  it('mide siempre lo mismo y el campo no se mueve: sin nada, con la última jugada y con un aviso encima', () => {
    const { host, guest } = startDuel()
    openTable(host, guest)
    const layout = phoneDuelLayout(390, 844, { tilted: true, bar: 58, rival: THEIR_HAND.mobile.room + 14, bottom: 68 })
    // Quien tiene el turno pasa de fase y le pregunta al otro: su línea dice que espera.
    const [mover, other] = phaseChip(host).hasAttribute('disabled') ? [guest, host] : [host, guest]
    const line = () => mover.container.querySelector<HTMLElement>('[data-duel-line]')!
    const field = () => within(mover.container).getByLabelText('Campo')
    const geometry = () => ({ line: line().style.height, air: line().style.marginBottom, field: [field().style.width, field().style.height, field().style.marginTop] })
    const before = geometry()

    expect(line().style.height).toBe(`${layout.lineHeight}px`)
    expect(line().querySelector('[data-lane]')).toBeNull()

    // La última jugada: el registro, en la línea (las vidas que cambia el rival con su calculadora).
    changeLife(other, ['1', '0', '0', '0'])
    expect(within(line()).getByRole('button', { name: new RegExp(`^${t('duel.log.open')}`) })).toBeInTheDocument()
    expect(geometry()).toEqual(before)

    // Un aviso se apoya encima de la última jugada, en el mismo lugar y del mismo alto.
    fireEvent.click(phaseChip(mover))
    fireEvent.click(screen.getByRole('menuitem', { name: /Battle Phase/ }))
    flush()
    expect(line().querySelector('[data-lane="passAsking"]')).not.toBeNull()
    expect(geometry()).toEqual(before)
  })

  it('la cadena va adentro de la línea (sus filas, no una hoja aparte) y llena su alto', () => {
    const rows = [
      { number: 1, who: 'Vos', mine: true, name: 'Engage', art: null, state: 'chained' as const },
      { number: 2, who: 'Rival', mine: false, name: 'Ash Blossom', art: null, state: 'chained' as const },
    ]
    const { container } = render(
      <div data-duel-line="" style={{ height: 96 }}>
        <ChainNotice rows={rows} focus={1} resolving={false} open compact onOpenChange={() => {}} onPick={() => {}} />
      </div>,
    )
    const chain = screen.getByTestId('chain-notice')

    expect(container.querySelector('[data-duel-line]')).toContainElement(chain)
    expect(chain).toHaveClass('h-full', 'bg-card-background/88')
    expect(within(chain).getAllByRole('listitem')).toHaveLength(2)
    expect(document.querySelector('[data-lowered]')).toBeNull()
  })
})

describe('las chapas de vidas', () => {
  it('al cambiar, el número late y el «−N ▼» sube y se funde (sólo `transform`/`opacity`, quieto con movimiento reducido), rojo si es tu daño y menta si es el del rival, y se anuncia', () => {
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

    expect(delta(mine)).toHaveTextContent('−1100 ▼')
    expect(delta(mine)).toHaveClass('animate-life-delta', 'motion-reduce:animate-none', 'text-danger-soft')
    expect(delta(rival)).toHaveTextContent('−1000 ▼')
    expect(delta(rival)).toHaveClass('text-success')
    expect(mine.querySelector('.animate-life-bump')).toHaveClass('motion-reduce:animate-none')
    expect(mine.querySelector('[aria-live="polite"]')).toHaveTextContent('Vos −1100')
    expect(mine).toHaveClass('bg-background/82')
    expect(mine.className).not.toMatch(/backdrop-blur|rounded/)

    // Los dos movimientos sólo tocan `transform` y `opacity` (los registra `index.css`).
    const css = readFileSync(path.resolve(__dirname, '..', 'index.css'), 'utf8')
    for (const name of ['life-bump', 'life-delta']) {
      const body = new RegExp(`@keyframes ${name} \\{([\\s\\S]*?)\\n  \\}`).exec(css)![1]!
      const props = [...body.matchAll(/([a-z-]+):/g)].map(([, prop]) => prop)

      expect(props.every((prop) => prop === 'transform' || prop === 'opacity')).toBe(true)
    }
  })

  it('muestra un solo número durante y después del cambio (el número que late y el «−N» no comparten clave: «75007500»)', () => {
    vi.useFakeTimers()
    const view = renderBare(<LifeBadge name="Rival" label="Rival" life={8000} />)
    const number = () => screen.getByRole('group', { name: /^Puntos de vida de Rival/ }).querySelector('.text-stat')!.parentElement!.parentElement!

    for (const life of [7500, 7000, 5500]) {
      act(() => view.rerender(<LifeBadge name="Rival" label="Rival" life={life} />))
      expect(number().firstElementChild).toHaveTextContent(new RegExp(`^${life}$`))
      act(() => vi.advanceTimersByTime(2000))
      expect(number().textContent).toBe(String(life))
    }
  })

  it('con `onClick` (el duelo manual) es un botón de 44 px que abre la calculadora', () => {
    const open = vi.fn()

    renderBare(<LifeBadge name="Ana" label="Vos" life={8000} mine turn="Tu turno · 2" onClick={open} />)
    const button = screen.getByRole('button', { name: 'Puntos de vida de Ana: 8000. Abrir la calculadora de vidas' })

    expect(button).toHaveClass('min-h-11', 'min-w-11', 'focus-visible:shadow-focus')
    expect(button).toHaveTextContent('VosTu turno · 2')
    fireEvent.click(button)
    expect(open).toHaveBeenCalledTimes(1)
  })
})

// @vitest-environment jsdom
import { act, cleanup, fireEvent, render as renderBare, screen, within } from '@testing-library/react'
import '@testing-library/jest-dom'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it, onTestFinished, vi } from 'vitest'

import type { DuelConnect } from '../app/use-duel'
import { ChainNotice } from '../components/auto/ChainNotice'
import { LifeBadge } from '../components/duel/LifeScore'
import { COMPACT_FIELD_MEDIA_QUERY, phoneDuelLayout } from '../components/probability/compact-field'
import { createMemoryRoom, type MemoryRoom } from './support/memory-room'
import { t } from '../i18n'
import { asSocket, createDuelHarness, phaseChip, render } from './support/duel-screen-harness'

/**
 * La mesa del duelo en el celular (Gastón, 2026-11-12: «evitar espacio vacío entre campo y mano»): las vidas en chapas (la del rival en la barra) y, entre el campo y tu mano, nada: la línea es una
 * marca de 0 px y lo que dice (un aviso) flota sobre tu mano sólo mientras está. Nada de lo que aparece mueve el campo.
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
  it('no ocupa lugar: es una marca de 0 px en el borde de abajo del campo; la última jugada no sale en la mesa y un aviso flota sobre tu mano sólo mientras está, sin mover el campo', () => {
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
    expect(within(line()).queryByRole('button', { name: new RegExp(`^${t('duel.log.open')}`) })).toBeNull()
    expect(geometry()).toEqual(before)

    // Un aviso flota sobre el borde de arriba de tu mano (no ocupa lugar ni corre el campo).
    fireEvent.click(phaseChip(mover))
    fireEvent.click(screen.getByRole('menuitem', { name: /Battle Phase/ }))
    flush()
    expect(line().querySelector('[data-lane="passAsking"]')).not.toBeNull()
    expect(line().firstElementChild).toHaveClass('absolute', 'top-0', 'h-11', 'pointer-events-none')
    expect(geometry()).toEqual(before)
  })

  it('la cadena va en su capa, sobre el campo: sus filas en una franja, no una hoja aparte', () => {
    const rows = [
      { number: 1, who: 'Vos', mine: true, name: 'Engage', art: null, state: 'chained' as const },
      { number: 2, who: 'Rival', mine: false, name: 'Ash Blossom', art: null, state: 'chained' as const },
    ]
    // La franja de la capa (`PracticeMat`, 96 px), como la arma la mesa.
    render(
      <div data-testid="duel-chain-layer">
        <div className="h-24">
          <ChainNotice rows={rows} focus={1} resolving={false} open compact onOpenChange={() => {}} onPick={() => {}} />
        </div>
      </div>,
    )
    const chain = screen.getByTestId('chain-notice')

    expect(screen.getByTestId('duel-chain-layer')).toContainElement(chain)
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

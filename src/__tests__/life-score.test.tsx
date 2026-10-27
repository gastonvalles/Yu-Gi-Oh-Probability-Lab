// @vitest-environment jsdom
import { act, cleanup, render, screen, within } from '@testing-library/react'
import '@testing-library/jest-dom'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { LifeHold } from '../app/life-effects'
import { LifeScore } from '../components/duel/LifeScore'

// Las vidas del marcador de «Jugar solo automático» en el celular (Gastón, 2026-10-27, opción A): planas, sin caja, chapa, barra ni cartas de la mano; el nombre chico en el color del dueño y el número grande.
describe('las vidas del marcador', () => {
  afterEach(() => {
    cleanup()
    vi.useRealTimers()
  })

  it('esperan al golpe como la placa: mientras `LifeHold` retiene muestran las de antes y en cuanto se suelta, las de verdad', () => {
    const view = render(<LifeHold value={false}><LifeScore name="Rival" label="Rival" life={8000} /></LifeHold>)

    view.rerender(<LifeHold value><LifeScore name="Rival" label="Rival" life={7000} /></LifeHold>)
    expect(screen.getByRole('group', { name: 'Puntos de vida de Rival: 8000' })).toBeInTheDocument()
    view.rerender(<LifeHold value={false}><LifeScore name="Rival" label="Rival" life={7000} /></LifeHold>)
    expect(screen.getByRole('group', { name: 'Puntos de vida de Rival: 7000' })).toBeInTheDocument()
  })

  it('dicen de quién son y cuántas vidas tiene, y el lector de pantalla oye lo mismo en una frase', () => {
    render(<LifeScore name="Rival" label="Rival" life={8000} />)
    const score = screen.getByRole('group', { name: 'Puntos de vida de Rival: 8000' })

    expect(score).toHaveTextContent('Rival8000')
    expect(score).toHaveAttribute('data-lp', 'theirs')
    expect(within(score).queryByRole('meter')).toBeNull()
  })

  it('son planas: el nombre en el color del dueño (lavanda la tuya, ámbar la del rival) y el número blanco y grande, sin caja ni chapa', () => {
    render(
      <>
        <LifeScore name="Vos" label="Vos" life={6000} mine />
        <LifeScore name="Rival" label="Rival" life={8000} />
      </>,
    )
    const mine = screen.getByRole('group', { name: /^Puntos de vida de Vos/ })
    const rival = screen.getByRole('group', { name: /^Puntos de vida de Rival/ })

    expect(within(mine).getByText('Vos')).toHaveClass('text-micro', 'font-bold', 'uppercase', 'text-accent')
    expect(within(rival).getByText('Rival')).toHaveClass('text-info-soft')
    expect(within(mine).getByText('6000')).toHaveClass('text-title', 'font-bold', 'tabular-nums', 'text-foreground')
    expect(mine).not.toHaveClass('life-plate')
    expect(mine.className).not.toMatch(/border|bg-/)
    // La tuya a la izquierda del marcador, la del rival a la derecha.
    expect(mine).toHaveClass('justify-items-start')
    expect(rival).toHaveClass('justify-items-end')
  })

  it('al bajar cuenta hasta el valor nuevo, se tiñe de rojo y muestra la diferencia debajo; en 0, el número queda rojo', () => {
    vi.useFakeTimers()
    const { rerender } = render(<LifeScore name="Rival" label="Rival" life={8000} />)

    rerender(<LifeScore name="Rival" label="Rival" life={7000} />)
    const score = screen.getByRole('group')

    expect(score).toHaveTextContent('−1000')
    expect(score.querySelector('.text-title')).toHaveClass('text-danger')
    rerender(<LifeScore name="Rival" label="Rival" life={0} />)
    act(() => {
      vi.advanceTimersByTime(5000)
    })
    expect(score.querySelector('.text-title')).toHaveTextContent('0')
    expect(score.querySelector('.text-title')).toHaveClass('text-danger-soft')
  })

  // El duelo por enlace manual: las vidas del marcador (y de las esquinas) siguen abriendo la calculadora (Gastón, 2026-10-27).
  it('con `onClick` es un botón de 44 × 44 como mínimo, con el aro de foco de siempre, que dice qué abre', () => {
    const open = vi.fn()

    render(<LifeScore name="Ana" life={8000} onClick={open} />)
    const button = screen.getByRole('button', { name: 'Puntos de vida de Ana: 8000. Abrir la calculadora de vidas' })

    expect(button).toHaveClass('min-h-11', 'min-w-11', 'focus-visible:shadow-focus')
    expect(button).toHaveAttribute('data-lp', 'theirs')
    button.click()
    expect(open).toHaveBeenCalledTimes(1)
    expect(screen.queryByRole('group')).toBeNull()
  })

  it('la señal de su dueño sale como un globo de su color: debajo del número; tus vidas grandes (abajo de la pantalla), arriba', () => {
    const view = render(<LifeScore name="Ana" life={8000} bubble="🤔" bubbleKey={1} />)

    expect(screen.getByRole('status')).toHaveTextContent('🤔')
    expect(screen.getByRole('status')).toHaveClass('top-full', 'right-0', 'border-info/55', 'text-display')
    view.rerender(<LifeScore name="Vos" life={8000} mine size="lg" bubble="Pensando…" bubbleKey={2} />)
    expect(screen.getByRole('status')).toHaveClass('bottom-full', 'left-0', 'border-accent/60', 'text-body')
  })
})

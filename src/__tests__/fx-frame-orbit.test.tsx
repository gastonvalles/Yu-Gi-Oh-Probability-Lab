// @vitest-environment jsdom
import { render } from '@testing-library/react'
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

import { FxFrame } from '../components/probability/MatFx'

const css = readFileSync('src/index.css', 'utf8')

describe('la luz que gira en el marco de una carta (FxFrame)', () => {
  it('va en su propio elemento adentro del marco, y sólo cuando se pide', () => {
    const { container, rerender } = render(<FxFrame tone="cyan" />)

    expect(container.querySelector('[data-fx="frame"] > [data-fx="orbit"]')).not.toBeNull()

    rerender(<FxFrame tone="cyan" orbit={false} />)

    expect(container.querySelector('[data-fx="orbit"]')).toBeNull()
  })

  it('gira con `rotate` (la anima el compositor): animar el ángulo del degradé recalculaba estilos y repintaba la mesa en cada cuadro', () => {
    const keyframes = css.match(/@keyframes fx-orbit \{[^}]*\}/)?.[0] ?? ''

    expect(keyframes).toContain('rotate: 360deg')
    expect(css).not.toContain('--fx-angle')
  })
})

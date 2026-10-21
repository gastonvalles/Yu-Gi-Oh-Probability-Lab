// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react'
import '@testing-library/jest-dom'
import { readFileSync } from 'node:fs'
import { afterEach, describe, expect, it } from 'vitest'

import { StepHero } from '../components/StepHero'

afterEach(cleanup)

describe('los globos de ayuda no quedan debajo del bloque que sigue', () => {
  it('el escalonado de las entradas no deja una animación con relleno al final: una animación que sigue aplicada deja a cada bloque como una capa propia y tapa los globos del anterior', () => {
    const css = readFileSync('src/index.css', 'utf8')
    const rule = css.match(/@utility stagger \{[\s\S]*?\n\}/)?.[0] ?? ''

    expect(rule).toContain('animation: stagger-in 380ms var(--ease-out) backwards;')
    expect(rule).not.toMatch(/animation: stagger-in[^;]*\b(both|forwards)\b/)
  })

  it('el encabezado de cada vista (donde vive el globo de la ayuda) va por encima de los bloques que le siguen', () => {
    render(<StepHero title="Banlists" icon="tag" subtitle="Las listas" help="Qué es esto" />)

    expect(screen.getByRole('banner')).toHaveClass('relative', 'z-20')
  })
})

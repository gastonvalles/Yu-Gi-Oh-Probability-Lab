// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import '@testing-library/jest-dom'
import { afterEach, describe, expect, it } from 'vitest'

import { RulesPill, rulesPillText, type RulesSummary } from '../components/probability/RulesPill'
import { applyLocale, loadLocale } from '../i18n'

const summary = (patch: Partial<RulesSummary>): RulesSummary => ({ openings: 0, problems: 0, unplayable: false, blocked: false, ...patch })
const label = (patch: Partial<RulesSummary>) => rulesPillText(summary(patch))?.label

afterEach(() => {
  cleanup()
  applyLocale('es')
})

describe('RulesPill: la píldora de las salidas en la barra del celular', () => {
  it('dice el resumen en singular o plural, y el corto es el número; sin nada que decir, nada', () => {
    expect(label({ openings: 1 })).toBe('1 salida')
    expect(label({ openings: 3 })).toBe('3 salidas')
    expect(rulesPillText(summary({ openings: 2, problems: 1 }))).toMatchObject({ label: '2 salidas · 1 problema', short: '2 · 1', tone: 'opening', fit: 'long' })
    expect(rulesPillText(summary({ problems: 2 }))).toMatchObject({ label: '2 problemas', tone: 'problem' })
    expect(rulesPillText(summary({ unplayable: true }))).toMatchObject({ label: 'Mano no jugable', short: '', tone: 'problem' })
    expect(rulesPillText(summary({ blocked: true }))).toMatchObject({ label: 'Salidas', tone: 'warning' })
    expect(rulesPillText(summary({}))).toBeNull()
  })

  it('en inglés', async () => {
    await loadLocale('en')
    applyLocale('en')
    expect(label({ openings: 1 })).toBe('1 opening')
    expect(label({ openings: 3, problems: 2 })).toBe('3 openings · 2 problems')
    expect(label({ unplayable: true })).toBe('Unplayable hand')
  })

  it('no se abre sola; al tocarla abre el panel con lo de adentro y se cierra tocando afuera', () => {
    render(
      <>
        <RulesPill summary={summary({ openings: 3 })}>
          <button type="button">Salida básica</button>
        </RulesPill>
        <p>Afuera</p>
      </>,
    )

    const pill = screen.getByRole('button', { name: 'Salidas y problemas de tu mano: 3 salidas' })
    expect(pill).toHaveAttribute('aria-expanded', 'false')
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()

    fireEvent.click(pill)
    expect(pill).toHaveAttribute('aria-expanded', 'true')
    expect(screen.getByRole('dialog', { name: 'Salidas y problemas de tu mano' })).toContainElement(screen.getByRole('button', { name: 'Salida básica' }))

    // Tocar adentro no la cierra; afuera, sí.
    fireEvent.pointerDown(screen.getByRole('button', { name: 'Salida básica' }))
    expect(screen.getByRole('dialog')).toBeInTheDocument()
    fireEvent.pointerDown(screen.getByText('Afuera'))
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('el texto completo y el corto se turnan según el lugar libre de la barra (container query), con el objetivo táctil de 44 px', () => {
    render(
      <RulesPill summary={summary({ openings: 2, problems: 1 })}>
        <span />
      </RulesPill>,
    )

    const pill = screen.getByRole('button', { name: /2 salidas · 1 problema/ })
    expect(pill.parentElement).toHaveClass('@container', 'flex-1', 'min-w-0')
    expect(pill).toHaveClass('min-h-11', 'min-w-11')
    expect(screen.getByText('2 salidas · 1 problema')).toHaveClass('hidden', '@min-[13rem]:inline')
    expect(screen.getByText('2 · 1')).toHaveClass('@min-[13rem]:hidden')
  })
})

import { readFileSync } from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

import { CARD_ROLE_DEFINITIONS, createOriginGroupKey, getDeckGroupTheme } from '../app/deck-groups'
import { TIER_ORDER, tierColor } from '../components/meta/meta-format'

// El violeta es de lo tuyo; las categorías que se distinguen de un vistazo llevan un color cada una (docs/design-system.md, «El violeta es de lo tuyo, no de todo»).
describe('los colores no se pierden en el violeta', () => {
  it('cada rol de carta tiene un color distinto', () => {
    const colors = CARD_ROLE_DEFINITIONS.map((definition) => getDeckGroupTheme(definition.key).color)

    expect(new Set(colors).size).toBe(colors.length)
  })

  it('Engine y Non-Engine no comparten color', () => {
    expect(getDeckGroupTheme(createOriginGroupKey('engine')).color).not.toBe(getDeckGroupTheme(createOriginGroupKey('non_engine')).color)
  })

  it('cada tier tiene su color', () => {
    const colors = TIER_ORDER.map((tier) => tierColor(tier))

    expect(new Set(colors).size).toBe(colors.length)
  })

  it('«ojo» (warning) es ámbar, no violeta: el violeta es de lo tuyo', () => {
    const css = readFileSync(path.join(process.cwd(), 'src', 'index.css'), 'utf8')

    expect(css).toMatch(/--warning: #f7cb15;/)
    expect(css).toMatch(/--warning-soft: #ffd84d;/)
  })
})

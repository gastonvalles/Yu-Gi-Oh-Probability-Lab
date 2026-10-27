import { readdirSync, readFileSync } from 'node:fs'
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

  // Gastón (2026-10-26): «siempre debe ser blanco». Violeta (`primary`), verde (`success-solid`) y rojo (`danger`), con el texto blanco; el ámbar y la
  // lavanda claros no llevan texto (ni oscuro ni blanco: el blanco no se lee). Se revisa cada cadena de clases de la mesa, el duelo, los controles de `ui/`, Replays, Comparar, la búsqueda y la cola de clasificación.
  it('sobre un relleno de color, el texto es blanco (la mesa, el duelo, los controles, Replays, Comparar y la búsqueda)', () => {
    const walk = (dir: string): string[] => readdirSync(dir, { withFileTypes: true }).flatMap((entry) => (entry.isDirectory() ? walk(path.join(dir, entry.name)) : [path.join(dir, entry.name)]))
    const components = path.join(process.cwd(), 'src', 'components')
    const files = [...['auto', 'comparison', 'duel', 'probability', 'replays', 'search', 'ui'].flatMap((dir) => walk(path.join(components, dir))), path.join(components, 'classification-styles.ts')].filter((file) => /\.tsx?$/.test(file) && !file.includes('PracticeMatPanel'))
    const fill = /\bbg-(accent|info|warning|success|danger|primary)(-solid|-soft)?(?![\w/-])/
    const brightFill = /\bbg-(accent|info|warning|success)(?![\w/-])/
    const darkText = /\btext-(accent-foreground|info-foreground|background|black)\b|\btext-\[#/
    const bad = files.flatMap((file) =>
      [...readFileSync(file, 'utf8').matchAll(/'[^'\n]*'|"[^"\n]*"|`[^`\n]*`/g)]
        .map((match) => match[0])
        .filter((classes) => (fill.test(classes) && darkText.test(classes)) || (brightFill.test(classes) && /\btext-white\b/.test(classes)))
        .map((classes) => `${path.basename(file)}: ${classes}`),
    )

    expect(bad).toEqual([])
  })

  it('«ojo» (warning) es ámbar, no violeta: el violeta es de lo tuyo', () => {
    const css = readFileSync(path.join(process.cwd(), 'src', 'index.css'), 'utf8')

    expect(css).toMatch(/--warning: #ffc100;/)
    expect(css).toMatch(/--warning-soft: #ffd84d;/)
  })
})

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

  // Paleta carbón/violeta/lima: un relleno oscuro (violeta `primary`, verde `success-solid`, rojo `danger`) lleva texto blanco; uno claro (la lima `info`, el aviso, el éxito claro, la lavanda clara)
  // lleva texto carbón, nunca blanco (el blanco sobre la lima da 1,3:1). Se revisa cada cadena de clases de la mesa, el duelo, los controles de `ui/`, Replays, Comparar, la búsqueda y la cola de clasificación.
  it('sobre un relleno claro (lima, lavanda) el texto es carbón, no blanco; sobre uno oscuro (violeta, verde, rojo) es blanco', () => {
    const walk = (dir: string): string[] => readdirSync(dir, { withFileTypes: true }).flatMap((entry) => (entry.isDirectory() ? walk(path.join(dir, entry.name)) : [path.join(dir, entry.name)]))
    const components = path.join(process.cwd(), 'src', 'components')
    const files = [...['auto', 'comparison', 'duel', 'probability', 'replays', 'search', 'ui'].flatMap((dir) => walk(path.join(components, dir))), path.join(components, 'classification-styles.ts')].filter((file) => /\.tsx?$/.test(file) && !file.includes('PracticeMatPanel'))
    const deepFill = /\bbg-(primary|danger|success-solid)(?![\w/-])/
    const brightFill = /\bbg-(accent|info|warning|success|lavender-light)(?![\w/-])/
    const darkText = /\btext-(accent-foreground|info-foreground|background|black)\b|\btext-\[#/
    const bad = files.flatMap((file) =>
      [...readFileSync(file, 'utf8').matchAll(/'[^'\n]*'|"[^"\n]*"|`[^`\n]*`/g)]
        .map((match) => match[0])
        .filter((classes) => (deepFill.test(classes) && darkText.test(classes)) || (brightFill.test(classes) && /\btext-white\b/.test(classes)))
        .map((classes) => `${path.basename(file)}: ${classes}`),
    )

    expect(bad).toEqual([])
  })

  it('«ojo» (warning) es naranja, ni violeta ni lima: el violeta es de lo tuyo y la lima es el acento', () => {
    const css = readFileSync(path.join(process.cwd(), 'src', 'index.css'), 'utf8')

    expect(css).toMatch(/--warning: #ff9f1c;/)
    expect(css).toMatch(/--warning-soft: #ffbe66;/)
  })
})

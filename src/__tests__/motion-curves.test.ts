import { readdirSync, readFileSync, statSync } from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

import { EASE_IN_OUT, EASE_OUT, EASE_OUT_SOFT } from '../app/motion'

// Las curvas del JS (la Web Animations API) son las de los tokens de index.css, y ningún movimiento de la interfaz usa la palabra `ease-out` de esa API
// (es otra curva). Esta regla mira el código, como `link-rules.test.ts`.
const SRC = path.join(process.cwd(), 'src')

const token = (name: string) => readFileSync(path.join(SRC, 'index.css'), 'utf8').match(new RegExp(`--${name}:\\s*([^;]+);`))?.[1]?.trim()

function sourcesIn(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const file = path.join(dir, name)

    if (statSync(file).isDirectory()) {
      return name === '__tests__' ? [] : sourcesIn(file)
    }

    return /\.tsx?$/.test(file) ? [file] : []
  })
}

describe('las curvas de movimiento', () => {
  it('son las de los tokens de index.css', () => {
    expect(EASE_OUT).toBe(token('ease-out'))
    expect(EASE_OUT_SOFT).toBe(token('ease-out-soft'))
    expect(EASE_IN_OUT).toBe(token('ease-in-out'))
  })

  it('el barajado del mazo (CSS) va con la misma curva que el de la mano (JS)', () => {
    const css = readFileSync(path.join(SRC, 'index.css'), 'utf8')

    expect(css.match(/--animate-riffle-[a-z]+:[^;]+;/g)?.every((rule) => rule.includes('var(--ease-in-out)'))).toBe(true)
    expect(readFileSync(path.join(SRC, 'app', 'shuffle-fx.ts'), 'utf8')).toContain('easing: EASE_IN_OUT')
  })

  it('dar vuelta una carta en la mesa va con una sola curva de punta a punta: no se frena de canto', () => {
    const mat = readFileSync(path.join(SRC, 'components', 'probability', 'PracticeMat.tsx'), 'utf8')

    expect(mat).toContain("cardRef.current?.animate(FLIP_FRAMES, { duration: FLIP_MS, easing: EASE_IN_OUT, composite: 'add' })")
    expect(mat.match(/const FLIP_FRAMES = \[[\s\S]*?\n\]/)?.[0]).not.toContain('easing')
  })

  it('ningún movimiento usa la palabra ease-out de la Web Animations API', () => {
    const offenders = sourcesIn(SRC).filter((file) => /easing\s*:\s*['"`](ease|ease-in|ease-out|ease-in-out)['"`]/.test(readFileSync(file, 'utf8')))

    expect(offenders.map((file) => path.relative(SRC, file)), 'Usá EASE_OUT o EASE_OUT_SOFT de app/motion.ts: la palabra ease-out de la Web Animations API es otra curva').toEqual([])
  })
})

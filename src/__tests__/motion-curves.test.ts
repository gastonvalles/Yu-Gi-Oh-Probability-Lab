import { readdirSync, readFileSync, statSync } from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

import { EASE_OUT, EASE_OUT_SOFT } from '../app/motion'

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
  })

  it('ningún movimiento usa la palabra ease-out de la Web Animations API', () => {
    const offenders = sourcesIn(SRC).filter((file) => /easing\s*:\s*['"`](ease|ease-in|ease-out|ease-in-out)['"`]/.test(readFileSync(file, 'utf8')))

    expect(offenders.map((file) => path.relative(SRC, file)), 'Usá EASE_OUT o EASE_OUT_SOFT de app/motion.ts: la palabra ease-out de la Web Animations API es otra curva').toEqual([])
  })
})

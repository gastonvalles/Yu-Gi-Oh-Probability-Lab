// @vitest-environment jsdom
import { render } from '@testing-library/react'
import '@testing-library/jest-dom'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

import { Coin, Die } from '../components/life/Toss'

// La moneda y el dado de Master Duel sin alargar (TI-325): el dado bota cuatro veces cada vez más bajo, el resultado se marca al quedar quieto y todo
// termina cuando aparece el resultado, a los 1,4 s como antes.
const CSS = readFileSync(path.join(process.cwd(), 'src', 'index.css'), 'utf8')

/** Duración y demora (ms) de un `--animate-…`: el primer tiempo es la duración y el segundo, si está, la demora. */
function timing(name: string) {
  const value = CSS.match(new RegExp(`--animate-${name}:\\s*([^;]+);`))?.[1] ?? ''
  const [duration = NaN, delay = 0] = [...value.matchAll(/(\d*\.?\d+)(ms|s)\b/g)].map(([, n, unit]) => Number(n) * (unit === 's' ? 1000 : 1))

  return { duration, delay, end: duration + delay }
}

/** Los `animate-…` de un árbol renderizado, sin variantes (lo que corre con «Efectos completos» y sin movimiento reducido). */
const animations = (root: Element) => [...root.querySelectorAll('[class*="animate-"]')].flatMap((node) => [...node.classList].filter((name) => name.startsWith('animate-') && name !== 'animate-none').map((name) => name.slice('animate-'.length)))

describe('la moneda y el dado', () => {
  it('el resultado sale cuando antes (1,4 s) y nada de la tirada dura más', () => {
    // El resultado (`animate-reveal`, la calculadora) espera 1,4 s: lo que duraban el salto y el giro.
    const reveal = 1400

    expect(CSS).toMatch(/--animate-reveal: pop [^;]* 1\.4s both;/)
    expect(timing('toss-hop').end).toBe(reveal)
    for (const piece of [<Coin key="c" face={1} />, <Die key="d" value={6} />]) {
      const names = animations(render(piece).container)

      expect(names.length).toBeGreaterThan(0)
      for (const name of names) expect(timing(name).end, name).toBeLessThanOrEqual(reveal)
    }
    // La marca ocupa justo el final: de cuando queda quieto a cuando aparece el resultado.
    expect(timing('toss-mark').end).toBe(reveal)
    expect(timing('toss-mark').delay).toBe(timing('coin-spin-mark').end)
    expect(timing('toss-mark').delay).toBe(timing('toss-bounce').end)
  })

  it('el dado bota cuatro veces, cada bote más bajo que el anterior', () => {
    const start = CSS.indexOf('@keyframes toss-bounce {')
    const body = CSS.slice(start, CSS.indexOf('@keyframes', start + 1))
    const peaks = [...body.matchAll(/translateY\(-(\d*\.?\d+)rem\)/g)].map(([, rem]) => Number(rem))

    expect(peaks).toHaveLength(4)
    expect([...peaks].sort((a, b) => b - a)).toEqual(peaks)
    expect(new Set(peaks).size).toBe(4)

    const die = render(<Die value={3} />).container
    expect(die.querySelector('.animate-toss-bounce')).not.toBeNull()
    // Con «Livianos», el salto de antes.
    expect(die.querySelector('.animate-toss-bounce')).toHaveClass('fx-lite:motion-safe:animate-toss-hop', 'motion-reduce:animate-none')
  })

  it('el resultado queda marcado al final (aro y destello, una vez), y no con «Livianos», con movimiento reducido ni quieto', () => {
    for (const piece of [<Coin key="c" face={0} />, <Die key="d" value={1} />]) {
      const mark = render(piece).container.querySelector('[data-toss-mark]')

      expect(mark).toHaveClass('animate-toss-mark', 'opacity-0', 'fx-lite:hidden', 'motion-reduce:hidden', 'border-fx-destello')
    }
    // Una sola vez y sin quedarse: sin `infinite` y sin relleno hacia atrás (antes de su demora no se ve).
    expect(CSS).toMatch(/--animate-toss-mark: [^;]* forwards;/)
    expect(CSS).toMatch(/--animate-toss-flash: [^;]* forwards;/)
    expect(render(<Coin face={0} still />).container.querySelector('[data-toss-mark]')).toBeNull()
  })
})

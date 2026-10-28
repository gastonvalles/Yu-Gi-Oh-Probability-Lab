import { readFileSync } from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

import { CARD_TRANSITION, FX_CARD } from '../components/probability/MatFx'

// Los aros de la mesa van en capas (criterio de movimiento: en la mesa sólo se anima `transform` y `opacity`): la sombra queda fija en un pseudoelemento y se anima
// su opacidad o su escala, que lo mueve el compositor. Animar o transicionar `box-shadow` corría en el hilo principal y repintaba el campo en cada cuadro.
const SRC = path.join(process.cwd(), 'src')
const CSS = readFileSync(path.join(SRC, 'index.css'), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '')
const MAT_FX = readFileSync(path.join(SRC, 'components/probability/MatFx.tsx'), 'utf8')

/** El cuerpo de un `@keyframes` (hasta su llave de cierre). */
function keyframes(name: string) {
  const start = CSS.indexOf(`@keyframes ${name} {`)

  if (start < 0) return null
  let depth = 0
  for (let index = CSS.indexOf('{', start); index < CSS.length; index += 1) {
    if (CSS[index] === '{') depth += 1
    if (CSS[index] === '}' && --depth === 0) return CSS.slice(start, index + 1)
  }
  return null
}

/** Las propiedades que anima un `@keyframes`. */
const animated = (body: string) => new Set([...body.matchAll(/([a-z-]+)\s*:/g)].map((match) => match[1]))

describe('los aros de la mesa, en capas', () => {
  it('los latidos y destellos animan sólo opacidad y escala', () => {
    for (const name of ['fx-ring-breathe', 'fx-halo-glow', 'fx-halo-wave', 'fx-point-pulse']) {
      const body = keyframes(name)

      expect(body, name).not.toBeNull()
      expect([...animated(body!)].filter((property) => !['opacity', 'scale'].includes(property)), name).toEqual([])
    }
  })

  it('ya no hay aros que animen box-shadow', () => {
    for (const name of ['fx-halo', 'fx-target-glow', 'fx-pick', 'point-pulse']) expect(keyframes(name), name).toBeNull()
    expect(CSS).not.toMatch(/@keyframes[^{]*\{(?:[^{}]*\{[^{}]*\})*[^{}]*box-shadow/)
  })

  it('cada aro tiene su capa: la sombra fija en el pseudoelemento y la animación ahí', () => {
    const rule = (selector: RegExp) => CSS.match(selector)?.[0] ?? ''

    expect(rule(/\.fx-ring\[data-targeted='true'\] \{[\s\S]*?&::after \{[^}]*\}/)).toMatch(/box-shadow[\s\S]*animation: fx-ring-breathe/)
    expect(rule(/&::after \{[^}]*fx-halo-glow[^}]*\}/)).toMatch(/box-shadow/)
    expect(rule(/&::before \{[^}]*fx-halo-wave[^}]*\}/)).toMatch(/z-index: -1/)
    expect(CSS).toMatch(/:is\(\.fx-ring, \*\)\[data-pointed='true'\]::after \{[^}]*box-shadow[^}]*animation: fx-point-pulse/)
    expect(CSS).toMatch(/:is\(\.fx-ring, \*\)\[data-attack-target='true'\]::after \{[^}]*box-shadow[^}]*animation: fx-ring-breathe/)
    expect(FX_CARD.split(' ')).toContain('fx-ring')
  })

  it('las cartas no transicionan la sombra y la mira se recorta sola', () => {
    expect(CARD_TRANSITION).not.toMatch(/box-shadow/)
    expect(FX_CARD).not.toMatch(/animate-fx-(halo|target-glow)/)
    expect(MAT_FX).toMatch(/data-fx="target" className="pointer-events-none absolute inset-0 z-3 overflow-hidden"/)
  })
})

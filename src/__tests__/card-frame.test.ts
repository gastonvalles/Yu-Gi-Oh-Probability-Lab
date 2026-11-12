import { readFileSync } from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

import { contrastRatio, FRAME_HEX, FRAME_OUTLINE, frameClass, frameKindOf, type FrameKind } from '../app/card-frame'
import { TYPE_SWATCH } from '../app/deck-image-export-render'
import { ZONE_TYPE_SWATCH } from '../components/deck-zone-styles'

const css = readFileSync(path.resolve(__dirname, '../index.css'), 'utf8')
const CARBON = '#18181c'
const WHITE = '#fdffff'

// docs/design-system.md, «El violeta es de lo tuyo, no de todo»: cada tipo de carta con el color de su marco oficial, en una sola tabla.
describe('colores por tipo de carta', () => {
  it.each([
    ['effect', 'effect', false],
    ['normal', 'normal', false],
    ['ritual', 'ritual', false],
    ['fusion', 'fusion', false],
    ['synchro', 'synchro', false],
    ['xyz', 'xyz', false],
    ['link', 'link', false],
    ['token', 'token', false],
    ['spell', 'spell', false],
    ['trap', 'trap', false],
    ['skill', 'neutral', false],
    ['effect_pendulum', 'effect', true],
    ['normal_pendulum', 'normal', true],
    ['xyz_pendulum', 'xyz', true],
    ['synchro_pendulum', 'synchro', true],
    ['', 'neutral', false],
  ] as const)('frameType %s da %s (Péndulo: %s)', (frameType, kind, pendulum) => {
    expect(frameKindOf(frameType)).toMatchObject({ kind, pendulum })
  })

  it('sin frameType lee el cardType; la Magia de Ritual es una Mágica', () => {
    expect(frameKindOf('', 'XYZ Pendulum Effect Monster')).toMatchObject({ kind: 'xyz', pendulum: true })
    expect(frameKindOf(null, 'Normal Tuner Monster').kind).toBe('normal')
    expect(frameKindOf(null, 'Spell Card').kind).toBe('spell')
    expect(frameKindOf('spell', 'Spell Card').kind).toBe('spell')
  })

  it('el texto encima llega a 4,5:1 y el color, a 3:1 contra el carbón o lleva aro', () => {
    for (const [kind, hex] of Object.entries(FRAME_HEX)) {
      const frame = frameKindOf(kind)

      expect(frame.kind).toBe(kind as FrameKind)
      expect(contrastRatio(hex, frame.text === 'light' ? WHITE : CARBON), kind).toBeGreaterThanOrEqual(4.5)
      expect(contrastRatio(hex, CARBON) >= 3 || frameClass(frame).includes(FRAME_OUTLINE), kind).toBe(true)
    }
    expect(['xyz', 'link', 'dark-synchro'].every((kind) => frameKindOf(kind).outlined)).toBe(true)
  })

  it('el Péndulo va partido con corte duro: mitad de abajo verde, sin degradado', () => {
    const split = frameClass(frameKindOf('effect_pendulum'))

    expect(split).toContain('after:h-1/2')
    expect(split).toContain('after:bg-frame-spell')
    expect(split).not.toMatch(/gradient/)
  })

  it('una sola tabla: los tokens, los puntos del armador y la imagen exportada usan los mismos hex', () => {
    for (const [kind, hex] of Object.entries(FRAME_HEX)) {
      expect(css, kind).toContain(`--color-frame-${kind}: ${hex};`)
    }

    for (const [type, classes] of Object.entries(ZONE_TYPE_SWATCH)) {
      const kind = classes.match(/\bbg-frame-([a-z-]+)/)?.[1] as Exclude<FrameKind, 'neutral'> | undefined

      expect(kind, type).toBeDefined()
      expect(TYPE_SWATCH[type], type).toBe(FRAME_HEX[kind!])
    }
    expect(Object.values(ZONE_TYPE_SWATCH).join(' ')).not.toMatch(/bg-\[/)
  })
})

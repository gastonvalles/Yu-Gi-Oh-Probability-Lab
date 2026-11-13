import { existsSync, readFileSync, statSync } from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

/** El fondo del duelo (`mat-scene`): el remolino de `scripts/remolino/`, con el carbón de respaldo, el de escritorio desde 1101 px y quieto. */
const SRC = path.resolve(__dirname, '..')
const css = readFileSync(path.join(SRC, 'index.css'), 'utf8')
const scene = css.slice(css.indexOf('@utility mat-scene {'), css.indexOf('}', css.indexOf('@utility mat-scene {')) + 1)

describe('el remolino de fondo del duelo', () => {
  it('mat-scene pone el remolino sobre el carbón, y el de escritorio sólo desde 1101 px', () => {
    expect(scene).toContain('background-color: var(--background);')
    expect(scene).toMatch(/@apply [^;]*\bbg-\(image:--image-remolino-movil\)/)
    expect(scene).toMatch(/@apply [^;]*\bmin-\[1101px\]:bg-\(image:--image-remolino-escritorio\)/)
    expect(scene).toContain('bg-cover')
    expect(scene).toContain('bg-center')
    expect(scene).not.toMatch(/bg-fixed|animate|filter|blur/)
  })

  it('los dos tokens apuntan a los AVIF de src/assets (con hash y en el precaché), de ~60 KB cada uno', () => {
    for (const size of ['movil', 'escritorio']) {
      const url = css.match(new RegExp(`--image-remolino-${size}: url\\('\\./(assets/duelo/remolino-medio-${size}\\.avif)'\\);`))?.[1]

      expect(url).toBeDefined()
      expect(existsSync(path.join(SRC, url!))).toBe(true)
      expect(statSync(path.join(SRC, url!)).size).toBeLessThanOrEqual(64 * 1024)
    }
  })

  it('con data-palette="indigo" los dos tokens apuntan al remolino de Índigo (violeta y ámbar sobre el índigo), también de ~60 KB', () => {
    const block = css.slice(css.indexOf("  :root[data-palette='indigo'] {"))

    for (const size of ['movil', 'escritorio']) {
      const url = block.match(new RegExp(`--image-remolino-${size}: url\\('\\./(assets/duelo/remolino-medio-${size}-indigo\\.avif)'\\);`))?.[1]

      expect(url).toBeDefined()
      expect(statSync(path.join(SRC, url!)).size).toBeLessThanOrEqual(64 * 1024)
    }
  })
})

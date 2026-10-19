import { readdirSync, readFileSync, statSync } from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

import { textLink } from '../components/ui/typography'

// Los hipervínculos son ámbar (docs/design-system.md): un solo estilo, `textLink`. Esta regla mira el código, como `button-rules.test.ts`.
const ROOT = path.join(process.cwd(), 'src', 'components')

function sourcesIn(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const file = path.join(dir, name)

    if (statSync(file).isDirectory()) {
      return name === 'playground' ? [] : sourcesIn(file)
    }

    return file.endsWith('.tsx') ? [file] : []
  })
}

// Los íconos de las redes son íconos blancos que se ponen verdes, no un enlace de texto; el botón a YouTube es un botón (`YOUTUBE_LINK_BUTTON`).
const EXEMPT = ['SocialLinks.tsx']

describe('los hipervínculos', () => {
  it('son ámbar, con subrayado al pasar el mouse o enfocarlos', () => {
    expect(textLink).toContain('text-info-soft')
    expect(textLink).toContain('hover:underline')
    expect(textLink).toContain('focus-visible:underline')
  })

  it('todo enlace de texto de la app usa el mismo estilo', () => {
    const offenders: string[] = []

    for (const file of sourcesIn(ROOT)) {
      if (EXEMPT.some((name) => file.endsWith(name))) continue

      const source = readFileSync(file, 'utf8')

      for (const match of source.matchAll(/<a[\s\n]/g)) {
        const tag = source.slice(match.index, match.index + 500).split('>')[0] ?? ''

        // `LINK` es el estilo local de Exportar (que se arma con `textLink`); `YOUTUBE_LINK_BUTTON`, el botón a YouTube.
        if (!/textLink|className=\{LINK\}|YOUTUBE_LINK_BUTTON/.test(tag)) {
          offenders.push(`${path.relative(ROOT, file)}: ${tag.replace(/\s+/g, ' ').slice(0, 90)}`)
        }
      }
    }

    expect(offenders).toEqual([])
  })

  it('el enlace local de Exportar se arma con el estilo de los hipervínculos', () => {
    expect(readFileSync(path.join(ROOT, 'ExportDeckPanel.tsx'), 'utf8')).toMatch(/const LINK = cx\([^)]*textLink\)/)
  })

  it('ya no queda el violeta suelto de los enlaces de antes', () => {
    const old = sourcesIn(ROOT).filter((file) => readFileSync(file, 'utf8').includes('text-primary-soft underline-offset-2'))

    expect(old.map((file) => path.relative(ROOT, file))).toEqual([])
  })

  it('un enlace seleccionado también es ámbar: el texto seleccionado (::selection) es ámbar, no verde', () => {
    const css = readFileSync(path.join(process.cwd(), 'src', 'index.css'), 'utf8')

    expect(css).toMatch(/::selection\s*\{\s*background: var\(--info\);/)
  })

  it('el enlace de la sala del duelo (el que se copia para invitar) también es ámbar', () => {
    const source = readFileSync(path.join(ROOT, 'duel', 'DuelScreen.tsx'), 'utf8')

    expect(source).toMatch(/text-info-soft[^>]*data-testid="duel-link"/)
  })
})

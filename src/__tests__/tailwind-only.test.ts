import { readdirSync, readFileSync, statSync } from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

/**
 * Los estilos son de Tailwind (utilidades en el TSX; los tokens, las utilidades propias y las animaciones registradas en `@theme` de `src/index.css`): no se suma CSS propio.
 * La excepción heredada es `src/foil.css` (los efectos de rareza). Un `@keyframes` que Tailwind no trae va dentro de `@theme` (`--animate-*`), no en un selector ni en un archivo nuevo.
 */
const SRC = path.resolve(__dirname, '..')

const cssFiles = (dir: string): string[] =>
  readdirSync(dir).flatMap((name) => {
    const file = path.join(dir, name)

    return statSync(file).isDirectory() ? cssFiles(file) : name.endsWith('.css') ? [path.relative(SRC, file).split(path.sep).join('/')] : []
  })

/** Las cabeceras de los bloques de primer nivel de una hoja (sin comentarios ni llaves de adentro). */
function topLevelHeads(css: string): string[] {
  const heads: string[] = []
  let depth = 0
  let start = 0

  for (let i = 0; i < css.length; i += 1) {
    if (css.startsWith('/*', i)) {
      i = css.indexOf('*/', i) + 1
      continue
    }
    const char = css[i]

    if (char === '{') {
      if (depth === 0) heads.push(css.slice(start, i).replace(/\/\*[\s\S]*?\*\//g, '').trim())
      depth += 1
    } else if (char === '}') {
      depth -= 1
      if (depth === 0) start = i + 1
    } else if (char === ';' && depth === 0) start = i + 1
  }

  return heads
}

describe('estilos: Tailwind, no CSS puro', () => {
  it('no hay más hojas de estilo que la de Tailwind y la de los efectos de rareza', () => {
    expect(cssFiles(SRC).sort()).toEqual(['foil.css', 'index.css'])
  })

  it('en `index.css` no se suman selectores propios: sólo @theme, @utility, @layer, @font-face, @media y @keyframes (los dos que hay son de la base)', () => {
    const plain = topLevelHeads(readFileSync(path.join(SRC, 'index.css'), 'utf8')).filter((head) => !head.startsWith('@'))

    expect(plain.length).toBeLessThanOrEqual(2)
  })
})

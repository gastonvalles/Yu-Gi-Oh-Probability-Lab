import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs'
import { join, relative, sep } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

/**
 * La documentación se mantiene corta y sin huérfanos (Gastón, 2026-10-22: «hay demasiados archivos innecesarios»). Tres chequeos: un tope de tamaño por documento (un doc que lo pasa se volvió
 * un diario: se adelgaza, no se sube el tope), que todo documento de `docs/` esté nombrado en el README o en `CLAUDE.md`, y que toda ruta de un documento que aparece en el repo exista (borrar o renombrar
 * un doc no deja citas muertas en el código ni en los otros docs).
 */
const ROOT = fileURLToPath(new URL('../../', import.meta.url))
const KB = 1024
const DEFAULT_BUDGET_KB = 20
/** El tope de cada documento, en KB; los que no figuran, 20. */
const BUDGET_KB: Record<string, number> = {
  'docs/retomar.md': 40,
  'docs/design-system.md': 70,
  'docs/duelo.md': 50,
  'docs/motor-de-cartas.md': 55,
}
/** Carpetas que no se miran: dependencias, salidas y datos. Las que empiezan con punto tampoco (configuración local de otras herramientas), salvo `.github`. */
const SKIPPED = new Set(['node_modules', 'dist', 'coverage', 'public', 'graphify-out'])
const SCANNED = /\.(md|ts|tsx|css|mjs|cjs|js|jsonc|yml|html)$/

function walk(dir: string, found: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const path = join(dir, name)

    if (statSync(path).isDirectory()) {
      if (!SKIPPED.has(name) && (!name.startsWith('.') || name === '.github')) walk(path, found)
    } else if (SCANNED.test(name)) {
      found.push(path)
    }
  }

  return found
}

const docs = readdirSync(join(ROOT, 'docs'))
  .filter((name) => name.endsWith('.md'))
  .sort()

describe('la documentación', () => {
  it.each(docs)('docs/%s no pasa su tope de tamaño', (name) => {
    const budget = (BUDGET_KB[`docs/${name}`] ?? DEFAULT_BUDGET_KB) * KB
    const size = statSync(join(ROOT, 'docs', name)).size

    expect(size, `docs/${name} pesa ${(size / KB).toFixed(1)} KB y el tope es ${budget / KB} KB: adelgazalo (el historial es git log y el cuerpo de la PR); no subas el tope`).toBeLessThanOrEqual(budget)
  })

  it('todo documento de docs/ está nombrado en el README o en CLAUDE.md', () => {
    const index = readFileSync(join(ROOT, 'README.md'), 'utf8') + readFileSync(join(ROOT, 'CLAUDE.md'), 'utf8')
    const orphans = docs.filter((name) => !index.includes(`docs/${name}`))

    expect(orphans, 'Estos documentos no los nombra ni el README ni CLAUDE.md: sumalos al índice o borralos.').toEqual([])
  })

  it('cada ruta de un documento que aparece en el repo existe', () => {
    const missing: string[] = []

    for (const file of walk(ROOT)) {
      const text = readFileSync(file, 'utf8')

      for (const [path] of text.matchAll(/docs\/[A-Za-z0-9_.-]+\.md/g)) {
        if (!existsSync(join(ROOT, path))) missing.push(`${relative(ROOT, file).split(sep).join('/')} → ${path}`)
      }
    }

    expect(missing, 'Estas rutas apuntan a un documento que no existe: corregí la cita o borrala.').toEqual([])
  })
})

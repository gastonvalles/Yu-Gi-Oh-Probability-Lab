import { readdirSync, readFileSync } from 'node:fs'
import { join, posix } from 'node:path'

// El núcleo de reglas (`ocgcore-wasm`) lleva adentro un binario AGPL-3.0 y la decisión de licencia está abierta: hasta que se tome, nada
// del arranque de la app lo importa. Sólo los módulos de `src/app/auto/`, las pruebas y los scripts; de producción, sólo las piezas del modo
// automático (`src/components/auto/`) importan `src/app/auto/`, y a ésas las trae un único `lazy(() => import(` (`DeckModeScreen.tsx`): el
// wasm viaja en su propio chunk y sólo bajo demanda (`src/app/auto/` además figura en NOT_AT_STARTUP de startup-imports.test.ts).
const ROOT = join(__dirname, '..', '..')
const files = (dir: string): string[] =>
  readdirSync(join(ROOT, dir), { withFileTypes: true }).flatMap((entry) => (entry.isDirectory() ? files(join(dir, entry.name)) : /\.(tsx?|mjs|js)$/.test(entry.name) ? [join(dir, entry.name).split('\\').join('/')] : []))
const source = [...files('src'), ...files('api'), ...files('duel-relay/src')]

describe('el núcleo de reglas queda aislado', () => {
  it('sólo src/app/auto, las pruebas y los scripts importan ocgcore-wasm', () => {
    const importers = source.filter((file) => /from\s+['"]ocgcore-wasm|import\(\s*['"]ocgcore-wasm/.test(readFileSync(join(ROOT, file), 'utf8')))

    expect(importers.filter((file) => !file.startsWith('src/app/auto/') && !file.startsWith('src/__tests__/'))).toEqual([])
    expect(importers).toContain('src/app/auto/core-host.ts')
  })

  it('sólo src/components/auto importa src/app/auto con valores; de afuera, sólo tipos', () => {
    const production = source.filter((file) => !file.startsWith('src/app/auto/') && !file.startsWith('src/__tests__/') && !file.startsWith('src/components/auto/'))
    // Cada importación relativa se resuelve desde su archivo: `../../auto/…` desde el catálogo es `src/components/auto/` (las piezas de pantalla, sin el núcleo), no `src/app/auto/`.
    // Un `import type` se borra al compilar: la mesa (`PracticeMat.tsx`) sólo toma el tipo de `duel.auto` de `ask-ui.ts`.
    const reachesCore = (file: string) =>
      [...readFileSync(join(ROOT, file), 'utf8').matchAll(/(?:import\s+(?!type\s)[^'"]*?from\s+|import\(\s*)['"](\.{1,2}\/[^'"]*)['"]/g)].some((match) => {
        const target = posix.join(posix.dirname(file), match[1]!)

        return target === 'src/app/auto' || target.startsWith('src/app/auto/')
      })

    expect(production.filter(reachesCore)).toEqual([])
  })

  it('el modo automático entra por un único lazy(() => import( en DeckModeScreen.tsx', () => {
    const production = source.filter((file) => !file.startsWith('src/__tests__/') && !file.startsWith('src/components/auto/'))
    const names = production.filter((file) => /components\/auto\//.test(readFileSync(join(ROOT, file), 'utf8')) || /(?:from\s+|import\(\s*)['"]\.{1,2}\/auto\//.test(readFileSync(join(ROOT, file), 'utf8')))

    expect(names).toEqual(['src/components/deck-mode/DeckModeScreen.tsx'])
    const lines = readFileSync(join(ROOT, 'src/components/deck-mode/DeckModeScreen.tsx'), 'utf8').split('\n').filter((line) => /['"]\.{1,2}\/auto\//.test(line))

    expect(lines).toHaveLength(1)
    expect(lines[0]).toMatch(/lazy\(\(\) => import\(['"]\.\.\/auto\/AutoSoloScreen['"]\)/)
  })
})

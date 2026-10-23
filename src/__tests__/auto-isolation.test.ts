import { readdirSync, readFileSync } from 'node:fs'
import { join, relative } from 'node:path'

// El núcleo de reglas (`ocgcore-wasm`) lleva adentro un binario AGPL-3.0 y la decisión de licencia está abierta: hasta que se tome, nada
// que el navegador de la app pueda cargar lo importa. Sólo los módulos de `src/app/auto/`, las pruebas y los scripts; y ningún archivo de
// producción importa todavía `src/app/auto/` (que además figura en NOT_AT_STARTUP de startup-imports.test.ts).
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

  it('ningún archivo de producción importa src/app/auto todavía', () => {
    const production = source.filter((file) => !file.startsWith('src/app/auto/') && !file.startsWith('src/__tests__/'))
    const importers = production.filter((file) => /from\s+['"][./]*(?:app\/)?auto\/|import\(\s*['"][./]*(?:app\/)?auto\//.test(readFileSync(join(ROOT, file), 'utf8')))

    expect(importers.map((file) => relative(ROOT, join(ROOT, file)).split('\\').join('/'))).toEqual([])
  })
})

import { readdirSync, readFileSync } from 'node:fs'
import { join, posix } from 'node:path'

// El núcleo de reglas (`ocgcore-wasm`, AGPL-3.0 como la app: `NOTICE.md`) es un wasm que pesa: nada del arranque de la app lo importa.
// Sólo los módulos de `src/app/auto/`, las pruebas y los scripts; de producción, sólo las piezas del modo automático (`src/components/auto/`) importan `src/app/auto/`, y a ésas las traen dos `lazy(() => import(` (`DeckModeScreen.tsx`: jugar solo y
// la mesa de una sala con reglas automáticas): el wasm viaja en su propio chunk y sólo bajo demanda (`src/app/auto/` además figura en
// NOT_AT_STARTUP de startup-imports.test.ts). La única excepción es un `import(` del manifiesto de los datos (`auto-data.ts`, que no trae el
// núcleo): el interruptor del despliegue que mira la hoja de las reglas del duelo.
const ROOT = join(__dirname, '..', '..')
const files = (dir: string): string[] =>
  readdirSync(join(ROOT, dir), { withFileTypes: true }).flatMap((entry) => (entry.isDirectory() ? files(join(dir, entry.name)) : /\.(tsx?|mjs|js)$/.test(entry.name) ? [join(dir, entry.name).split('\\').join('/')] : []))
const source = [...files('src'), ...files('api'), ...files('duel-relay/src')]
/** Una importación relativa con valores: `import … from`, `export … from` (lo reexportado también viaja) o `import(`. Un `import type` o `export type` se borra al compilar. */
// Las dos piezas puras del pedido de «pasar a automático» (qué hace falta y el enlace de la sala a mano: sin núcleo ni wasm) que la mesa manual sí importa; el último test mira que sigan sin llegar al núcleo.
const PURE_RESUME = ['src/app/auto/resume', 'src/app/auto/online-resume']
const VALUE_IMPORT = /(?:(?:import|export)\s+(?!type\s)[^'"]*?from\s+|import\(\s*)['"](\.{1,2}\/[^'"]*)['"]/g

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
    // El manifiesto de los datos sí, con un `import(` (nunca estático): `auto-data.ts` no trae el núcleo.
    const reachesCore = (file: string) =>
      [...readFileSync(join(ROOT, file), 'utf8').matchAll(VALUE_IMPORT)].some((match) => {
        const target = posix.join(posix.dirname(file), match[1]!)

        return (target === 'src/app/auto' || target.startsWith('src/app/auto/')) && !(match[0].startsWith('import(') && target === 'src/app/auto/auto-data') && !PURE_RESUME.includes(target)
      })

    expect(production.filter(reachesCore)).toEqual([])
    expect(readFileSync(join(ROOT, 'src/app/auto/auto-data.ts'), 'utf8')).not.toMatch(/(?:import|export)\s+(?!type\s)[^'"]*?from\s+['"](?:ocgcore-wasm|\.\/core-host)/)
  })

  it('las piezas puras de pasar a automático nunca llegan al núcleo: sólo toman valores de protocol, online-protocol, resume o de fuera de src/app/auto', () => {
    for (const pure of PURE_RESUME) {
      const file = `${pure}.ts`
      const targets = [...readFileSync(join(ROOT, file), 'utf8').matchAll(VALUE_IMPORT)].map((match) => posix.join(posix.dirname(file), match[1]!))

      expect(targets.filter((target) => target.startsWith('src/app/auto/') && !['src/app/auto/protocol', 'src/app/auto/online-protocol', 'src/app/auto/resume'].includes(target))).toEqual([])
      expect(readFileSync(join(ROOT, file), 'utf8')).not.toMatch(/(?:from\s+|import\(\s*)['"][^'"]*(?:ocgcore-wasm|core-host)/)
    }
  })

  it('ve las importaciones con valores, también las reexportaciones, y deja pasar los tipos', () => {
    const targets = (text: string) => [...text.matchAll(VALUE_IMPORT)].map((match) => match[1])

    expect(targets("import { a } from '../a'\nexport { b } from '../b'\nexport * from './c'\nconst d = import('./d')")).toEqual(['../a', '../b', './c', './d'])
    expect(targets("import type { A } from '../a'\nexport type { B } from '../b'")).toEqual([])
  })

  it('el modo automático entra por dos lazy(() => import( en DeckModeScreen.tsx (jugar solo y la sala con reglas automáticas)', () => {
    const production = source.filter((file) => !file.startsWith('src/__tests__/') && !file.startsWith('src/components/auto/'))
    // Un `import type` (las props de la mesa automática que pide la pantalla del duelo) se borra al compilar.
    const values = (file: string) => readFileSync(join(ROOT, file), 'utf8').replace(/^\s*import\s+type\s[^\n]*\n/gm, '')
    const names = production.filter((file) => /components\/auto\//.test(values(file)) || /(?:from\s+|import\(\s*)['"]\.{1,2}\/auto\//.test(values(file)))

    expect(names).toEqual(['src/components/deck-mode/DeckModeScreen.tsx'])
    const lines = readFileSync(join(ROOT, 'src/components/deck-mode/DeckModeScreen.tsx'), 'utf8').split('\n').filter((line) => /['"]\.{1,2}\/auto\//.test(line))

    expect(lines).toHaveLength(2)
    expect(lines[0]).toMatch(/lazy\(\(\) => import\(['"]\.\.\/auto\/AutoSoloScreen['"]\)/)
    expect(lines[1]).toMatch(/lazy\(\(\) => import\(['"]\.\.\/auto\/AutoDuelScreen['"]\)/)
  })
})

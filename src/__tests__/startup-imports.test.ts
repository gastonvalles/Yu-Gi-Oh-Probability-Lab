import { existsSync, readFileSync } from 'node:fs'
import { dirname, join, relative } from 'node:path'
import { fileURLToPath } from 'node:url'

// Lo que el arranque no lleva: los datos pesados se piden con `import()` cuando se usan (o se precargan en un momento ocioso, de a uno: `lazy-steps.ts`).
// Si algo del grafo estático de `main.tsx` empieza a importar uno de estos, vuelve a viajar antes del primer pintado (en un celular con red lenta se nota).
const NOT_AT_STARTUP = [
  'src/app/meta.ts', // los decks de torneo (~280 KB): Tier lists, Decks de torneo y el buscador de la app
  'src/app/replays.ts',
  'src/components/shell/finder-decks.ts',
  'src/data/genesys-card-data.json', // las tablas de formatos: sólo `format-tables.ts`
  'src/data/edison-format-data.ts',
  // Los duelos automáticos: el núcleo en wasm va bajo demanda, detrás del único `lazy(() => import(` de la pantalla (auto-isolation.test.ts); `IMPORT` no ve los `import()`, así que el `lazy` pasa.
  'src/components/auto/AutoSoloScreen.tsx',
  'src/components/auto/AutoCovers.tsx',
  'src/app/auto/adapter.ts',
  'src/app/auto/ask-ui.ts',
  'src/app/auto/auto-data.ts',
  'src/app/auto/auto-session.ts',
  'src/app/auto/core-host.ts',
  'src/app/auto/core-host.worker.ts',
  'src/app/auto/online.ts',
  'src/app/auto/online-protocol.ts',
  'src/components/auto/AutoDuelScreen.tsx',
  'src/components/auto/use-auto-asks.tsx',
  'src/components/auto/deck-list.ts',
  'src/app/auto/auto-save.ts',
  'src/app/auto/deck-map.ts',
  'src/app/auto/end-reasons.ts',
  'src/app/auto/dev-console.ts',
  'src/app/auto/policies.ts',
  'src/app/auto/protocol.ts',
  'src/app/auto/referee.ts',
]

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..')
const IMPORT = /(?:^|\n)\s*(?:import|export)\s+([^'"]*?)\s*from\s*'(\.[^']+)'|(?:^|\n)\s*import\s+'(\.[^']+)'/g

function resolve(from: string, spec: string): string | null {
  const base = join(dirname(from), spec)

  for (const candidate of [base, `${base}.ts`, `${base}.tsx`, join(base, 'index.ts'), join(base, 'index.tsx')]) {
    if (existsSync(candidate) && !candidate.endsWith('/') && /\.(tsx?|json)$/.test(candidate)) return candidate
  }

  return null
}

/** Sólo cuenta lo que llega al build: `import type` y los `import { type A }` sin valores se borran al compilar. */
function isTypeOnly(clause: string): boolean {
  if (/^type\s/.test(clause)) return true
  const named = clause.match(/^\{([^}]*)\}$/)

  return named !== null && named[1].split(',').every((part) => part.trim() === '' || part.trim().startsWith('type '))
}

function staticGraph(entry: string): Set<string> {
  const seen = new Set<string>()
  const queue = [entry]

  while (queue.length > 0) {
    const file = queue.pop()!

    if (seen.has(file)) continue
    seen.add(file)
    if (file.endsWith('.json')) continue

    for (const match of readFileSync(file, 'utf8').matchAll(IMPORT)) {
      const [, clause = '', spec, bare] = match

      if (spec && isTypeOnly(clause.trim())) continue
      const target = resolve(file, (spec ?? bare)!)

      if (target) queue.push(target)
    }
  }

  return seen
}

describe('el arranque (lo que importa estático src/main.tsx)', () => {
  const graph = [...staticGraph(join(ROOT, 'src/main.tsx'))].map((file) => relative(ROOT, file).split('\\').join('/'))

  it('lleva la app, no los datos que se cargan cuando se usan', () => {
    expect(graph).toContain('src/components/shell/FeatureSearch.tsx')
    expect(graph.filter((file) => NOT_AT_STARTUP.includes(file))).toEqual([])
  })
})

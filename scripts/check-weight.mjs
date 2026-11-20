// Presupuesto de peso: lee `dist/` (después de `npm run build`), suma el JS comprimido con gzip de dos conjuntos y sale con 1 si alguno pasa su tope.
//   inicio: lo que baja una visita nueva a `/` antes de tocar nada: el módulo de entrada de `dist/index.html`, sus `modulepreload` y lo que pide al montar (`MainApp`, `InicioScreen`).
//   duelo:  inicio + lo necesario para jugar un duelo automático: el cierre de importaciones estáticas de `AutoSoloScreen` (el trozo perezoso de «Jugar solo»),
//           el worker del núcleo (`core-host.worker`) con el cierre del `ocgcore.*` que baja (el de JSPI o el sync, el que más pese).
// El grafo se lee del propio código del build (los `import ... from "./x.js"` estáticos y los `import("./x.js")` del worker): sin `build.manifest`, que publicaría un archivo más.
// ponytail: regex sobre JS minificado; si el formato de salida de Vite cambia y no encuentra un trozo, falla fuerte (no pasa en silencio).
import { readdirSync, readFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { gzipSync } from 'node:zlib'

// Topes en KB (1 KB = 1024 bytes): lo medido el 2026-11-20 (inicio 349,0; duelo 1158,3) más un 2 %, redondeado al KB.
// El número sólo baja (la Fase 4 lo recorta); subirlo es una decisión que se le cuenta a Gastón, no un ajuste para que pase el CI.
const BUDGET_KB = { inicio: 356, duelo: 1182 }

const DIST = resolve(dirname(fileURLToPath(import.meta.url)), '..', 'dist')
const ASSETS = join(DIST, 'assets')
const KB = 1024

const read = (name) => readFileSync(join(ASSETS, name), 'utf8')
const files = readdirSync(ASSETS)
const find = (pattern) => {
  const found = files.filter((name) => pattern.test(name))
  if (found.length !== 1) throw new Error(`check-weight: se esperaba un solo archivo ${pattern} en dist/assets y hay ${found.length}`)
  return found[0]
}

const gz = new Map()
const gzSize = (name) => gz.get(name) ?? gz.set(name, gzipSync(readFileSync(join(ASSETS, name))).length).get(name)

const matches = (regex, code) => [...code.matchAll(regex)].map((match) => match[1])
// `import"./a.js"`, `import{a as b}from"./a.js"`, `export*from"./a.js"`; el `import(` dinámico no entra.
const staticImports = (name) => matches(/(?:^|[;}\s])(?:import|export)\s*(?:[\w$*{}\s,]+?\s*from\s*)?["'`]\.\/([^"'`]+\.js)["'`]/g, read(name))
const dynamicImports = (name) => matches(/import\(\s*["'`]\.\/([^"'`]+\.js)["'`]\s*\)/g, read(name))

/** El cierre de importaciones estáticas de uno o más trozos (ellos incluidos). */
function closure(roots, into = new Set()) {
  for (const name of roots) {
    if (into.has(name)) continue
    into.add(name)
    closure(staticImports(name), into)
  }
  return into
}

const html = readFileSync(join(DIST, 'index.html'), 'utf8')
const asset = (href) => href.replace(/^\/assets\//, '')
const entry = asset(/<script[^>]*type="module"[^>]*src="([^"]+)"/.exec(html)?.[1] ?? '')
if (!entry) throw new Error('check-weight: dist/index.html no tiene un script de módulo')
// Al montar, `App` pide `MainApp` (perezoso) y éste la pantalla de inicio: no están en el html, pero toda visita nueva a `/` los baja.
const inicio = closure([entry, ...matches(/<link[^>]*rel="modulepreload"[^>]*href="([^"]+)"/g, html).map(asset), find(/^MainApp-.*\.js$/), find(/^InicioScreen-.*\.js$/)])

const weight = (set) => [...set].reduce((sum, name) => sum + gzSize(name), 0)
const worker = find(/^core-host\.worker-.*\.js$/)
// Del `ocgcore.*` el worker baja uno (JSPI si el navegador lo tiene, si no sync), cada uno con su archivo de datos: se cuenta el que más pese.
const cores = Object.values(Object.groupBy(dynamicImports(worker).filter((name) => name.startsWith('ocgcore.')), (name) => name.split('-')[0]))
  .map((group) => closure(group))
  .sort((a, b) => weight(b) - weight(a))
if (!cores.length) throw new Error(`check-weight: ${worker} no importa ningún ocgcore.*`)
const duelo = new Set([...inicio, ...closure([find(/^AutoSoloScreen-.*\.js$/), worker]), ...cores[0]])

let failed = false
for (const [label, set] of [['inicio', inicio], ['duelo', duelo]]) {
  const kb = weight(set) / KB
  const budget = BUDGET_KB[label]
  if (kb <= budget) {
    console.log(`${label} ${Math.round(kb)} KB de ${budget}`)
    continue
  }
  failed = true
  console.error(`check-weight: ${label} pesa ${kb.toFixed(1)} KB (JS con gzip) y el tope es ${budget} KB. Los 5 archivos más pesados del conjunto:`)
  for (const name of [...set].sort((a, b) => gzSize(b) - gzSize(a)).slice(0, 5)) console.error(`  ${(gzSize(name) / KB).toFixed(1)} KB  ${name}`)
}
process.exit(failed ? 1 : 0)

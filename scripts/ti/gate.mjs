// npm run gate: la capa única de pruebas antes de mergear. Corre una vez, con cola (uno a la vez en toda la PC) y corta en el primer rojo.
// Pasos: typecheck, eslint (sólo lo cambiado), vitest (lo relacionado + guardas baratas) y build. `--dry` imprime el plan sin correr ni encolar.
// Eventos `gate` en `<principal>/.claude/ti/events.jsonl` (contrato: `.claude/ti/contrato-eventos.md`); `TI_DIR` mueve esa carpeta (pruebas).
import { spawnSync, execFileSync } from 'node:child_process'
import { appendFileSync, existsSync, mkdirSync, readFileSync, unlinkSync, writeFileSync } from 'node:fs'
import { delimiter, dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..')
const DRY = process.argv.includes('--dry')
const WAIT_MS = 15 * 60_000
const POLL_MS = 2_000

const git = (...args) => execFileSync('git', args, { cwd: ROOT, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 }).trim()
const lines = (text) => text.split(/\r?\n/).filter(Boolean)

/** La rama cambió contra `origin/main`, más lo que falta commitear (modificado, en el índice o sin seguir). Los borrados no cuentan: no hay qué probar. */
function changedFiles() {
  const all = new Set([
    ...lines(git('diff', '--name-only', '--diff-filter=d', `${process.env.GATE_BASE ?? 'origin/main'}...HEAD`)),
    ...lines(git('diff', '--name-only', '--diff-filter=d', 'HEAD')),
    ...lines(git('ls-files', '--others', '--exclude-standard')),
  ])

  return [...all].filter((file) => existsSync(join(ROOT, file))).sort()
}

/** Las guardas baratas (corren siempre) y las que sólo corren si cambió su zona. */
const ALWAYS = ['docs.test.ts', 'tailwind-only.test.ts', 'licencia.test.tsx', 'site-meta.test.ts', 'vercel-headers.test.ts', 'i18n.test.tsx', 'i18n-catalog.test.tsx', 'i18n-literals.test.ts']
const byZone = [
  { when: (file) => file.startsWith('src/components/playground/'), tests: ['playground.test.tsx'] },
  { when: (file) => file === 'src/index.css', tests: ['color-variety.test.ts', 'ring-language.test.tsx'] },
  // Las pruebas del relay viven en `src/__tests__/duel-relay*` (incluida la de punta a punta, que levanta el worker).
  { when: (file) => file.startsWith('duel-relay/'), tests: ['duel-relay-index.test.ts', 'duel-relay-rules.test.ts', 'duel-relay.e2e.test.ts'] },
]

function plan(files) {
  const tests = ALWAYS.concat(byZone.filter((zone) => files.some(zone.when)).flatMap((zone) => zone.tests)).map((name) => `src/__tests__/${name}`)
  const missing = tests.filter((test) => !existsSync(join(ROOT, test)))
  if (missing.length) throw new Error(`Faltan pruebas de la lista del gate (se renombraron?): ${missing.join(', ')}`)
  // ESLint ignora scripts/ y dist/ (eslint.config.mjs): se las saltea acá para no arrancarlo por nada.
  const lintable = files.filter((file) => /\.(?:[cm]?[jt]s|tsx|jsx)$/.test(file) && !/^(?:scripts|dist)\//.test(file))
  // Si cambió la configuración de ESLint, cambia lo que lee cada archivo: se mira todo.
  const lintArgs = files.includes('eslint.config.mjs') ? ['.'] : lintable
  const related = files.filter((file) => file.startsWith('src/'))

  return { tests, lintArgs, related }
}

// --- carpeta del tablero y eventos -------------------------------------------------------------
function tiDir() {
  if (process.env.TI_DIR) return resolve(process.env.TI_DIR)
  // El checkout principal es la carpeta padre de `.git` común a todos los worktrees.
  return join(dirname(resolve(ROOT, git('rev-parse', '--git-common-dir'))), '.claude', 'ti')
}

const branch = () => git('rev-parse', '--abbrev-ref', 'HEAD')
let dir = ''
const emit = (fields) => appendFileSync(join(dir, 'events.jsonl'), `${JSON.stringify({ t: new Date().toISOString(), ev: 'gate', branch: BRANCH, ...fields })}\n`)

// --- candado: un gate a la vez en toda la máquina -----------------------------------------------
const alive = (pid) => {
  try {
    process.kill(pid, 0)
    return true
  } catch (error) {
    return error.code === 'EPERM' // existe pero es de otro usuario
  }
}
const readLock = (file) => {
  try {
    return JSON.parse(readFileSync(file, 'utf8'))
  } catch {
    return null
  }
}
const sleep = (ms) => Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms)

function acquire(file) {
  const started = Date.now()
  let announced = false

  for (;;) {
    try {
      writeFileSync(file, JSON.stringify({ pid: process.pid, branch: BRANCH, t: new Date().toISOString() }), { flag: 'wx' })
      return
    } catch (error) {
      if (error.code !== 'EEXIST') throw error
    }
    const owner = readLock(file)
    // ponytail: un candado ilegible o de un pid muerto se pisa; si dos esperan a la vez, `wx` deja pasar a uno solo. Si el pid se reusa, el candado viejo parece vivo (sale por el tope de 15 min).
    if (!owner || !alive(owner.pid)) {
      try {
        unlinkSync(file)
      } catch {
        /* otro lo pisó antes */
      }
      continue
    }
    if (!announced) {
      console.log(`en cola detrás de ${owner.branch} (pid ${owner.pid})`)
      announced = true
    }
    if (Date.now() - started > WAIT_MS) {
      console.error(`gate: pasaron 15 minutos en cola detrás de ${owner.branch}; se abandona`)
      process.exit(1)
    }
    sleep(POLL_MS)
  }
}

function release(file) {
  if (readLock(file)?.pid === process.pid) {
    try {
      unlinkSync(file)
    } catch {
      /* ya no estaba */
    }
  }
}

// --- Node -------------------------------------------------------------------------------------
// Vitest pide Node >= 22.22 (undici). Si el de la PC es más viejo se usa el de `<tablero>/config.json` ({"node": "<ruta a node>"}), que es local y no se sube.
const [major, minor] = process.versions.node.split('.').map(Number)
const OLD_NODE = major < 22 || (major === 22 && minor < 22)
function nodeBin() {
  if (!OLD_NODE) return process.execPath
  try {
    const { node } = JSON.parse(readFileSync(join(tiDir(), 'config.json'), 'utf8'))
    if (node && existsSync(node)) return node
  } catch {
    /* sin config */
  }
  console.error(`gate: vitest pide Node >= 22.22 y este es ${process.version}. Poné la ruta de uno nuevo en ${join(tiDir(), 'config.json')} como {"node": "..."}.`)
  process.exit(1)
}
const NODE = DRY ? process.execPath : nodeBin()

// --- pasos -------------------------------------------------------------------------------------
const node = (script, args) => ({ cmd: NODE, args: [join(ROOT, 'node_modules', script), ...args], shell: false })
const npm = (script) => ({ cmd: `npm run ${script}`, args: [], shell: true })
// `typecheck` ya compila lo mismo que `tsc -p src/tsconfig.json` (el de pruebas lo extiende y no excluye nada): el build se corre sin ese tsc.
const BUILD = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8')).scripts.build.replace(/tsc -p src\/tsconfig\.json\s*&&\s*/, '')

function steps({ tests, lintArgs, related }) {
  return [
    { name: 'typecheck', run: npm('typecheck') },
    lintArgs.length ? { name: 'eslint', run: node('eslint/bin/eslint.js', ['--no-warn-ignored', ...lintArgs]), detail: `${lintArgs.length === 1 && lintArgs[0] === '.' ? 'todo' : `${lintArgs.length} archivos`}` } : { name: 'eslint', skip: 'ningún archivo que ESLint lea' },
    { name: 'vitest', run: node('vitest/vitest.mjs', ['related', ...related, ...tests, '--run', '--passWithNoTests']), detail: `${new Set([...related, ...tests]).size} archivos de entrada, ${tests.length} guardas` },
    { name: 'build', run: { cmd: BUILD, args: [], shell: true }, detail: 'sin el tsc que typecheck ya cubre' },
  ]
}

const fmt = (ms) => `${(ms / 1000).toFixed(1)} s`

// --- main --------------------------------------------------------------------------------------
const BRANCH = branch()
const files = changedFiles()
const p = plan(files)
const list = steps(p)

if (DRY) {
  console.log(`gate --dry · rama ${BRANCH} · ${files.length} archivos cambiados contra ${process.env.GATE_BASE ?? 'origin/main'}`)
  for (const file of files) console.log(`  ${file}`)
  for (const step of list) console.log(`${step.name}: ${step.skip ? `se salta (${step.skip})` : step.detail ?? ''}`)
  console.log(`vitest guardas: ${p.tests.map((test) => test.replace('src/__tests__/', '')).join(', ')}`)
  console.log(`vitest related: ${p.related.length ? p.related.join(', ') : '(nada de src/)'}`)
  console.log(`VITEST_MAX_WORKERS=${process.env.VITEST_MAX_WORKERS ?? '4 (por defecto)'}`)
  process.exit(0)
}

dir = tiDir()
mkdirSync(dir, { recursive: true })
const lock = join(dir, 'gate.lock')
const t0 = Date.now()

emit({ status: 'queued' })
acquire(lock)
const quit = (code) => {
  release(lock)
  process.exit(code)
}
process.on('SIGINT', () => quit(130))
process.on('SIGTERM', () => quit(143))
process.on('exit', () => release(lock))

emit({ status: 'start', ms: Date.now() - t0 })
console.log(`gate · ${BRANCH} · ${files.length} archivos cambiados`)
// El `.bin` del proyecto va primero en el PATH (el build llama a `vite` suelto) y, si hizo falta otro Node, el suyo antes que todo.
const pathKey = Object.keys(process.env).find((key) => key.toLowerCase() === 'path') ?? 'PATH'
const env = {
  ...process.env,
  [pathKey]: [...(OLD_NODE ? [dirname(NODE)] : []), join(ROOT, 'node_modules', '.bin'), process.env[pathKey]].join(delimiter),
  VITEST_MAX_WORKERS: process.env.VITEST_MAX_WORKERS ?? '4',
  VITE_CONFIG_NATIVE_IGNORE_WARNING: 'true',
}
const runStart = Date.now()

for (const step of list) {
  if (step.skip) {
    console.log(`- ${step.name.padEnd(9)} se salta (${step.skip})`)
    continue
  }
  const s = Date.now()
  const result = spawnSync(step.run.cmd, step.run.args, { cwd: ROOT, env, shell: step.run.shell, encoding: 'utf8', maxBuffer: 256 * 1024 * 1024 })
  const ms = Date.now() - s
  const ok = result.status === 0
  emit({ status: 'step', step: step.name, ms, ok })
  console.log(`${ok ? '✓' : '✗'} ${step.name.padEnd(9)} ${fmt(ms)}${step.detail ? `  (${step.detail})` : ''}`)
  if (!ok) {
    const out = `${result.stdout ?? ''}${result.stderr ?? ''}${result.error ? `\n${result.error.message}` : ''}`
    console.log(lines(out).slice(-40).join('\n'))
    emit({ status: 'fail', step: step.name, ms: Date.now() - runStart })
    console.log(`gate ROJO en ${step.name} · ${fmt(Date.now() - runStart)}`)
    quit(1)
  }
}

emit({ status: 'pass', ms: Date.now() - runStart })
console.log(`gate VERDE · ${fmt(Date.now() - runStart)}`)
quit(0)

// El estado del departamento de TI que lee el dashboard `/ti` (sólo en desarrollo: lo sirve `/api/ti/state` de `vite.config.ts`).
// Lee la carpeta del tablero (`.claude/ti/` del checkout principal, `TI_DIR` la reemplaza) y reduce la cola de `events.jsonl`
// (el contrato está en `.claude/ti/contrato-eventos.md`) a una foto: agentes, gate, último QA, cards y sprint.
import { closeSync, existsSync, fstatSync, openSync, readdirSync, readFileSync, readSync, statSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { Buffer } from 'node:buffer'
import process from 'node:process'
import { fileURLToPath, URL } from 'node:url'

/** Cuántas líneas de `events.jsonl` se miran: lo de antes ya no dice qué está pasando. */
const TAIL_LINES = 300
/** Un agente sin eventos en este rato y sin una herramienta en vuelo pasa a «inactivo». */
const ACTIVE_MS = 60_000

/** La carpeta del tablero: `TI_DIR` o `<checkout principal>/.claude/ti`, también desde un worktree (sin lanzar `git`, que tarda). */
export function tiDir() {
  if (process.env.TI_DIR) return process.env.TI_DIR
  const root = fileURLToPath(new URL('../../', import.meta.url))
  const git = join(root, '.git')
  // En un worktree `.git` es un archivo «gitdir: <principal>/.git/worktrees/<nombre>».
  const main = existsSync(git) && statSync(git).isFile() ? resolve(readFileSync(git, 'utf8').replace(/^gitdir:\s*/, '').trim(), '../../..') : root

  return join(main, '.claude', 'ti')
}

/** El frontmatter `clave: valor` de una card o del sprint; las listas van entre corchetes y un `  # comentario` se descarta. */
export function parseFrontmatter(text) {
  const block = /^---\r?\n([\s\S]*?)\r?\n---/.exec(text)
  if (!block) return {}

  return Object.fromEntries(
    block[1]
      .split(/\r?\n/)
      .map((line) => /^([\w-]+):\s*(.*)$/.exec(line))
      .filter(Boolean)
      .map(([, key, raw]) => {
        const value = raw.replace(/\s{2,}#.*$/, '').trim()

        return [key, value.startsWith('[') ? value.slice(1, -1).split(',').map((item) => item.trim()).filter(Boolean) : value]
      }),
  )
}

/** Las últimas `n` líneas de un archivo que sólo crece, sin leerlo entero. */
function tailLines(file, n) {
  let fd
  try {
    fd = openSync(file, 'r')
  } catch {
    return []
  }
  try {
    const size = fstatSync(fd).size
    const length = Math.min(size, 512 * 1024)
    const buffer = Buffer.alloc(length)
    readSync(fd, buffer, 0, length, size - length)
    const lines = buffer.toString('utf8').split('\n')
    if (length < size) lines.shift()

    return lines.filter((line) => line.trim()).slice(-n)
  } finally {
    closeSync(fd)
  }
}

/** Reduce los eventos a la foto que pinta el dashboard. Pura: `now` en milisegundos. */
export function reduceEvents(events, cards, now) {
  const agents = new Map()
  let jefe = null
  const gates = new Map()
  let lastGate = null
  let qa = null
  const agent = (id) => {
    if (!agents.has(id)) agents.set(id, { id, type: null, card: null, description: null, stopped: false, tool: null, target: null, phase: null, t: null })
    return agents.get(id)
  }

  for (const event of events) {
    if (event.ev === 'agent_start' || event.ev === 'agent_stop') {
      if (!event.agent_id) continue
      const a = agent(event.agent_id)
      a.type = event.agent_type ?? a.type
      a.stopped = event.ev === 'agent_stop'
      a.t = event.t
    } else if (event.ev === 'dispatch') {
      if (!event.agent_id) continue
      const a = agent(event.agent_id)
      a.card = event.card ?? a.card
      a.description = event.description ?? a.description
      a.t ??= event.t
    } else if (event.ev === 'tool') {
      const who = event.agent_id ? agent(event.agent_id) : (jefe ??= { id: 'jefe', type: 'jefe', card: null, description: null, stopped: false })
      who.type = event.agent_type ?? who.type
      who.stopped = false
      who.tool = event.tool
      who.target = event.target
      who.phase = event.phase
      who.t = event.t
    } else if (event.ev === 'gate') {
      gates.set(event.branch, event)
      if (event.status === 'pass' || event.status === 'fail') lastGate = event
    } else if (event.ev === 'qa') {
      qa = event
    }
  }

  const roleOf = (id) => cards.find((card) => card.id === id)?.rol ?? null
  const view = (a) => {
    const age = a.t ? now - Date.parse(a.t) : Infinity
    const status = a.stopped ? 'done' : a.phase === 'pre' || age < ACTIVE_MS ? 'working' : 'idle'

    return {
      id: a.id,
      type: a.type,
      role: a.id === 'jefe' ? 'jefe' : (roleOf(a.card) ?? a.type),
      card: a.card,
      description: a.description,
      status,
      tool: a.tool ?? null,
      target: a.target ?? null,
      seconds: Number.isFinite(age) ? Math.max(0, Math.round(age / 1000)) : null,
    }
  }
  const order = { working: 0, idle: 1, done: 2 }
  const gateList = [...gates.values()]

  return {
    agents: [...agents.values()].map(view).sort((a, b) => order[a.status] - order[b.status] || (a.seconds ?? Infinity) - (b.seconds ?? Infinity)),
    jefe: jefe ? view(jefe) : null,
    gate: {
      queue: gateList.filter((g) => g.status === 'queued').map((g) => g.branch),
      running: gateList.filter((g) => g.status === 'start' || g.status === 'step').map((g) => ({ branch: g.branch, step: g.step ?? null })),
      last: lastGate,
    },
    qa,
  }
}

/** La foto completa que devuelve `/api/ti/state`. */
export function readTiState(dir = tiDir(), now = Date.now()) {
  const cardsDir = join(dir, 'cards')
  const read = (file) => (existsSync(file) ? readFileSync(file, 'utf8') : '')
  const cards = existsSync(cardsDir)
    ? readdirSync(cardsDir)
        .filter((name) => name.endsWith('.md'))
        .sort()
        .map((name) => parseFrontmatter(read(join(cardsDir, name))))
        .filter((card) => card.id)
    : []
  const events = tailLines(join(dir, 'events.jsonl'), TAIL_LINES).flatMap((line) => {
    try {
      return [JSON.parse(line)]
    } catch {
      return []
    }
  })

  return { now: new Date(now).toISOString(), sprint: parseFrontmatter(read(join(dir, 'sprint.md'))), cards, ...reduceEvents(events, cards, now) }
}

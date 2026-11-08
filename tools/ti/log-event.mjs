// Hook de Claude Code del departamento de TI (`SubagentStart`, `SubagentStop`, `PreToolUse`, `PostToolUse`): lee el payload por
// stdin y agrega una línea a `events.jsonl` según `.claude/ti/contrato-eventos.md`. Nunca guarda contenido, salidas ni prompts, y
// tapa lo que parezca un secreto. Sale siempre con 0 y sin escribir nada: un hook que falla no puede frenar a un agente.
import { appendFileSync, mkdirSync } from 'node:fs'
import { join } from 'node:path'
import { Buffer } from 'node:buffer'
import process from 'node:process'

import { tiDir } from './state.mjs'

const MAX = 120

/** Tapa `token=…`, `--password …`, `Authorization: Bearer …` y parecidos. */
function redact(text) {
  return text
    .replace(/\bbearer\s+\S+/gi, 'Bearer ***')
    .replace(/((?:token|key|secret|password|passwd|authorization)[\w-]*)(\s*[:=]\s*|\s+)("[^"]*"|'[^']*'|\S+)/gi, '$1$2***')
}

/** Lo que dice qué hizo la herramienta, sin contenido: la ruta, el patrón, el comienzo del comando o la descripción. */
function targetOf(input = {}) {
  const path = input.file_path ?? input.notebook_path
  if (typeof path === 'string') return path.length > MAX ? `…${path.slice(-(MAX - 1))}` : path
  const value = input.command ?? input.pattern ?? input.description ?? input.url ?? input.query ?? input.skill ?? input.path ?? ''

  return typeof value === 'string' ? redact(value.replace(/\s+/g, ' ').trim().slice(0, 400)).slice(0, MAX) : ''
}

/** Las líneas de `events.jsonl` que corresponden a un payload (ninguna si el evento no es de los cuatro). */
function eventsFor(payload, t = new Date().toISOString()) {
  const agent_id = payload.agent_id ?? null
  const agent_type = payload.agent_type ?? null

  switch (payload.hook_event_name) {
    case 'SubagentStart':
      return [{ t, ev: 'agent_start', agent_id, agent_type }]
    case 'SubagentStop':
      return [{ t, ev: 'agent_stop', agent_id, agent_type }]
    case 'PreToolUse':
    case 'PostToolUse': {
      const post = payload.hook_event_name === 'PostToolUse'
      const tool = { t, ev: 'tool', phase: post ? 'post' : 'pre', tool: payload.tool_name ?? null, target: targetOf(payload.tool_input), agent_id, agent_type }
      if (post) tool.ms = payload.duration_ms ?? null
      const launched = post && payload.tool_name === 'Agent' ? payload.tool_response?.agentId : null
      if (!launched) return [tool]
      const description = String(payload.tool_input?.description ?? '').slice(0, MAX)

      return [tool, { t, ev: 'dispatch', agent_id: launched, card: /^TI-\d+/.exec(description)?.[0] ?? null, description }]
    }
    default:
      return []
  }
}

async function main() {
  const chunks = []
  for await (const chunk of process.stdin) chunks.push(chunk)
  const lines = eventsFor(JSON.parse(Buffer.concat(chunks).toString('utf8')))
  if (!lines.length) return
  const dir = tiDir()
  mkdirSync(dir, { recursive: true })
  appendFileSync(join(dir, 'events.jsonl'), lines.map((line) => JSON.stringify(line) + '\n').join(''))
}

main()
  .catch(() => {})
  .finally(() => process.exit(0))

import { execFileSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { readTiState } from '../../tools/ti/state.mjs'

/**
 * El hook del departamento de TI (`tools/ti/log-event.mjs`) y la foto que arma `/api/ti/state` (`tools/ti/state.mjs`).
 * Los payloads son los que Claude Code mandó de verdad (`.claude/ti/spike.jsonl`), recortados y con las rutas cambiadas.
 */
const HOOK = fileURLToPath(new URL('../../tools/ti/log-event.mjs', import.meta.url))
const SESSION = { session_id: 's', prompt_id: 'p', permission_mode: 'auto' }
const SUB = { ...SESSION, agent_id: 'af8e55e9e739773f9', agent_type: 'Explore' }

let dir = ''
const run = (payload: unknown) => execFileSync(process.execPath, [HOOK], { input: typeof payload === 'string' ? payload : JSON.stringify(payload), env: { ...process.env, TI_DIR: dir } })
const events = () =>
  readFileSync(join(dir, 'events.jsonl'), 'utf8')
    .trim()
    .split('\n')
    .map((line) => JSON.parse(line) as Record<string, unknown>)

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'ti-'))
})
afterEach(() => rmSync(dir, { recursive: true, force: true }))

describe('tools/ti/log-event.mjs', () => {
  it('escribe una línea por evento del contrato, sin contenido ni salidas', () => {
    run({ ...SESSION, hook_event_name: 'PreToolUse', tool_name: 'Agent', tool_input: { description: 'TI-005 Dashboard', prompt: 'PROMPT SECRETO', subagent_type: 'Explore' }, tool_use_id: 't1' })
    run({ ...SUB, hook_event_name: 'SubagentStart' })
    run({
      ...SESSION,
      hook_event_name: 'PostToolUse',
      tool_name: 'Agent',
      tool_input: { description: 'TI-005 Dashboard', prompt: 'PROMPT SECRETO' },
      tool_response: { isAsync: true, status: 'async_launched', agentId: 'af8e55e9e739773f9', description: 'TI-005 Dashboard', prompt: 'PROMPT SECRETO' },
      duration_ms: 16,
    })
    run({ ...SUB, effort: { level: 'high' }, hook_event_name: 'PostToolUse', tool_name: 'Read', tool_input: { file_path: 'C:\\repo\\docs\\roadmap.md', offset: 0, limit: 3 }, tool_response: { type: 'text', file: { content: 'CONTENIDO' } }, duration_ms: 4 })
    run({ ...SUB, hook_event_name: 'SubagentStop', stop_hook_active: false, agent_transcript_path: 'C:\\x.jsonl' })

    const lines = events()
    expect(lines.map((line) => [line.ev, line.phase ?? null])).toEqual([
      ['tool', 'pre'],
      ['agent_start', null],
      ['tool', 'post'],
      ['dispatch', null],
      ['tool', 'post'],
      ['agent_stop', null],
    ])
    expect(lines[0]).toMatchObject({ tool: 'Agent', target: 'TI-005 Dashboard', agent_id: null, agent_type: null })
    expect(lines[3]).toMatchObject({ agent_id: 'af8e55e9e739773f9', card: 'TI-005', description: 'TI-005 Dashboard' })
    expect(lines[4]).toMatchObject({ tool: 'Read', target: 'C:\\repo\\docs\\roadmap.md', agent_id: 'af8e55e9e739773f9', agent_type: 'Explore', ms: 4 })
    expect(lines.every((line) => typeof line.t === 'string')).toBe(true)
    expect(readFileSync(join(dir, 'events.jsonl'), 'utf8')).not.toMatch(/SECRETO|CONTENIDO/)
  })

  it('tapa los secretos del comando y corta el target a 120 caracteres', () => {
    run({ ...SESSION, hook_event_name: 'PreToolUse', tool_name: 'Bash', tool_input: { command: `GITHUB_TOKEN=ghp_abc123 curl -H "Authorization: Bearer xyz789" --password hunter2 ${'x'.repeat(300)}` } })
    const [line] = events()

    expect(line!.target).not.toMatch(/ghp_abc123|xyz789|hunter2/)
    expect(String(line!.target).length).toBeLessThanOrEqual(120)
  })

  it('con un payload roto o un evento ajeno sale con 0 y no escribe', () => {
    expect(() => run('no es json')).not.toThrow()
    expect(() => run({ ...SESSION, hook_event_name: 'Stop' })).not.toThrow()
    expect(() => readFileSync(join(dir, 'events.jsonl'))).toThrow()
  })
})

describe('tools/ti/state.mjs', () => {
  it('reduce cards, sprint y eventos a la foto del dashboard', () => {
    mkdirSync(join(dir, 'cards'))
    writeFileSync(join(dir, 'sprint.md'), '---\nsprint: 0\nmeta: Una card recorre el circuito\nwip-en-curso: 6\n---\n')
    writeFileSync(join(dir, 'cards', 'TI-005.md'), '---\nid: TI-005\ntitulo: Dashboard\nrol: ti-frontend\nestado: en-curso   # comentario\ntoca: [a, b]\nespera: gaston\n---\nCuerpo')
    const now = Date.parse('2026-11-08T12:00:00Z')
    const at = (seconds: number) => new Date(now - seconds * 1000).toISOString()
    const lines = [
      { t: at(300), ev: 'agent_start', agent_id: 'a1', agent_type: 'general-purpose' },
      { t: at(300), ev: 'dispatch', agent_id: 'a1', card: 'TI-005', description: 'TI-005 Dashboard' },
      { t: at(5), ev: 'tool', phase: 'post', tool: 'Edit', target: 'src/App.tsx', agent_id: 'a1', agent_type: 'general-purpose', ms: 3 },
      { t: at(200), ev: 'agent_start', agent_id: 'a2', agent_type: 'Explore' },
      { t: at(100), ev: 'agent_stop', agent_id: 'a2', agent_type: 'Explore' },
      { t: at(120), ev: 'tool', phase: 'post', tool: 'Bash', target: 'git status', agent_id: null, agent_type: null, ms: 9 },
      { t: at(50), ev: 'gate', status: 'queued', branch: 'ti-006-gate' },
      { t: at(40), ev: 'gate', status: 'start', branch: 'ti-007-prod' },
      { t: at(30), ev: 'gate', status: 'pass', branch: 'ti-009', ms: 1000 },
      { t: at(20), ev: 'qa', status: 'fail', sha: 'abc1234', failed: ['home'] },
    ]
    writeFileSync(join(dir, 'events.jsonl'), 'roto\n' + lines.map((line) => JSON.stringify(line)).join('\n') + '\n')

    const state = readTiState(dir, now)

    expect(state.sprint).toMatchObject({ sprint: '0', 'wip-en-curso': '6' })
    expect(state.cards).toEqual([expect.objectContaining({ id: 'TI-005', estado: 'en-curso', toca: ['a', 'b'], espera: 'gaston' })])
    expect(state.agents.map((agent) => [agent.id, agent.status, agent.role, agent.card])).toEqual([
      ['a1', 'working', 'ti-frontend', 'TI-005'],
      ['a2', 'done', 'Explore', null],
    ])
    expect(state.agents[0]).toMatchObject({ tool: 'Edit', target: 'src/App.tsx', seconds: 5 })
    expect(state.jefe).toMatchObject({ role: 'jefe', status: 'idle', tool: 'Bash' })
    expect(state.gate).toMatchObject({ queue: ['ti-006-gate'], running: [{ branch: 'ti-007-prod' }], last: { status: 'pass', branch: 'ti-009' } })
    expect(state.qa).toMatchObject({ status: 'fail', failed: ['home'] })
  })
})

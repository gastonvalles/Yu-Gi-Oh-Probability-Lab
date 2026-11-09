// Al terminar anota la línea `qa` del contrato (`.claude/ti/contrato-eventos.md`) en `events.jsonl` del tablero. Sólo agrega al final.
// Carpeta: `TI_DIR` o, si no, `<checkout principal>/.claude/ti` (se resuelve con `git rev-parse --git-common-dir` desde cualquier worktree).
import { execFileSync } from 'node:child_process'
import { appendFileSync, mkdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import type { FullConfig, FullResult, Reporter, Suite, TestCase } from '@playwright/test/reporter'
import { buildSha } from './esperar-build'

function tiDir(): string {
  if (process.env.TI_DIR) return process.env.TI_DIR
  const common = execFileSync('git', ['rev-parse', '--path-format=absolute', '--git-common-dir'], { encoding: 'utf8' }).trim()
  return join(dirname(common), '.claude', 'ti')
}

export default class QaReporter implements Reporter {
  private started = Date.now()
  private base = ''
  private failed: string[] = []

  onBegin(config: FullConfig, _suite: Suite): void {
    this.started = Date.now()
    this.base = config.projects[0]?.use.baseURL ?? ''
  }

  onTestEnd(test: TestCase): void {
    // `unexpected` = falló y ya no le quedan repeticiones (una que pasó en la repetición es `flaky`, no cuenta).
    if (test.outcome() === 'unexpected') this.failed.push(test.titlePath().filter(Boolean).join(' › '))
  }

  async onEnd(result: FullResult): Promise<void> {
    const line = { t: new Date().toISOString(), ev: 'qa', status: result.status === 'passed' ? 'pass' : 'fail', sha: await buildSha(), base: this.base, ms: Date.now() - this.started, failed: [...new Set(this.failed)] }
    try {
      const dir = tiDir()
      mkdirSync(dir, { recursive: true })
      appendFileSync(join(dir, 'events.jsonl'), `${JSON.stringify(line)}\n`)
    } catch (error) {
      console.log(`[qa] No pude anotar el evento: ${error instanceof Error ? error.message : String(error)}`)
    }
  }
}

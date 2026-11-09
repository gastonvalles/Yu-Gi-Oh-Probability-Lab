import { useEffect, useState } from 'react'

import { Badge } from '../ui/Badge'
import { Callout } from '../ui/Callout'
import { Card } from '../ui/Card'
import { cx } from '../ui/cx'
import { EmptyState } from '../ui/EmptyState'
import { Heading } from '../ui/Heading'
import { Icon } from '../ui/Icon'
import { SectionHeader } from '../ui/SectionHeader'
import { Skeleton } from '../ui/Skeleton'
import { TONE, type Tone } from '../ui/tone'
import { supportText } from '../ui/typography'

/**
 * `/ti`: el tablero del departamento de TI en tiempo real (sólo en `npm run dev`, `App.tsx`). Sólo lectura: pide `/api/ti/state` cada
 * segundo (`tools/ti/state.mjs` reduce las cards, el sprint y `events.jsonl`). Herramienta interna, en español y sin traducir.
 */

type CardFm = Record<string, string | string[] | undefined> & { id: string }
type Status = 'working' | 'idle' | 'done'
interface Agent {
  id: string
  type: string | null
  role: string | null
  card: string | null
  description: string | null
  status: Status
  tool: string | null
  target: string | null
  seconds: number | null
}
interface Run {
  t?: string
  status: string
  branch?: string
  sha?: string
  ms?: number
  failed?: string[]
}
interface TiState {
  sprint: Record<string, string | undefined>
  cards: CardFm[]
  agents: Agent[]
  jefe: Agent | null
  gate: { queue: string[]; running: { branch: string; step: string | null }[]; last: Run | null }
  qa: Run | null
}

const COLUMNS = ['entrada', 'refinada', 'lista', 'en-curso', 'revision', 'gate', 'mergeada', 'qa-prod', 'hecha'] as const

// i18n-ignore: herramienta interna, sólo en desarrollo (todo el bloque de textos)
const COPY = {
  title: 'Departamento de TI', devTool: 'herramienta de desarrollo', sprint: 'Sprint', noGoal: 'Sin meta de sprint', // i18n-ignore: herramienta interna, sólo en desarrollo
  cards: 'Cards', inProgress: 'En curso', done: 'Hechas', working: 'Trabajando', pending: 'Pendiente de Gastón', // i18n-ignore: herramienta interna, sólo en desarrollo
  nothingPending: 'Nada espera tu decisión.', gate: 'Cola del gate', gateEmpty: 'La cola está vacía.', queued: 'En cola', running: 'Corriendo', // i18n-ignore: herramienta interna, sólo en desarrollo
  lastGate: 'Último gate', qa: 'Último QA en producción', qaEmpty: 'Todavía no corrió.', failedTests: 'Fallaron', // i18n-ignore: herramienta interna, sólo en desarrollo
  team: 'Equipo', teamEmpty: 'Ningún agente mandó eventos todavía.', board: 'Tablero', jefe: 'Jefe', noTool: 'Sin herramientas todavía', // i18n-ignore: herramienta interna, sólo en desarrollo
  expedite: 'Expedite', blocked: 'Bloqueada', waitsGaston: 'espera a Gastón', // i18n-ignore: herramienta interna, sólo en desarrollo
  emptyTitle: 'Todavía no hay nada en el tablero', // i18n-ignore: herramienta interna, sólo en desarrollo
  emptyBody: 'Las cards van en .claude/ti/cards y los eventos llegan por los hooks (docs/departamento-ti.md).', // i18n-ignore: herramienta interna, sólo en desarrollo
  offline: 'No se pudo leer /api/ti/state', offlineBody: 'Fijate que npm run dev siga corriendo; se reintenta solo cada segundo.', // i18n-ignore: herramienta interna, sólo en desarrollo
  status: { working: 'trabajando', idle: 'inactivo', done: 'terminó' } satisfies Record<Status, string>, // i18n-ignore: herramienta interna, sólo en desarrollo
  pass: 'pasó', fail: 'falló', // i18n-ignore: herramienta interna, sólo en desarrollo
  ago: (s: number | null) => (s === null ? '' : s < 60 ? `hace ${s} s` : s < 3600 ? `hace ${Math.floor(s / 60)} min` : `hace ${Math.floor(s / 3600)} h`), // i18n-ignore: herramienta interna, sólo en desarrollo
  column: {
    entrada: 'Entrada', refinada: 'Refinada', lista: 'Lista', 'en-curso': 'En curso', revision: 'Revisión', // i18n-ignore: herramienta interna, sólo en desarrollo
    gate: 'Gate', mergeada: 'Mergeada', 'qa-prod': 'QA producción', hecha: 'Hecha', // i18n-ignore: herramienta interna, sólo en desarrollo
  } satisfies Record<(typeof COLUMNS)[number], string>,
}

const STATUS_TONE: Record<Status, Tone> = { working: 'success', idle: 'warning', done: 'neutral' }

/** Pide la foto cada segundo, sin pedidos encimados. `failed` queda prendido hasta que una vuelta salga bien. */
function useTiState() {
  const [state, setState] = useState<TiState | null>(null)
  const [failed, setFailed] = useState(false)

  useEffect(() => {
    let alive = true
    let timer = 0
    const tick = async () => {
      try {
        const response = await fetch('/api/ti/state', { cache: 'no-store' })
        if (!response.ok) throw new Error(String(response.status))
        const next = (await response.json()) as TiState
        if (alive) {
          setState(next)
          setFailed(false)
        }
      } catch {
        if (alive) setFailed(true)
      }
      if (alive) timer = window.setTimeout(tick, 1000)
    }

    void tick()
    return () => {
      alive = false
      window.clearTimeout(timer)
    }
  }, [])

  return { state, failed }
}

export default function TiDashboard() {
  const { state, failed } = useTiState()

  useEffect(() => {
    const previous = document.title
    document.title = `TI · YGOUltraLab`
    return () => {
      document.title = previous
    }
  }, [])

  const empty = state && !state.cards.length && !state.agents.length && !state.jefe

  return (
    <div className="min-h-dvh w-full min-w-0 bg-transparent text-foreground">
      <header className="sticky top-0 z-40 border-b border-border-subtle bg-background">
        <div className="mx-auto flex max-w-content flex-wrap items-center gap-x-4 gap-y-2 px-gutter py-3 min-[1101px]:px-6">
          <Icon name="columns" size={22} className="text-primary-soft" />
          <Heading level="page" as="h1">
            {COPY.title}
          </Heading>
          <Badge tone="warning" shape="tag">
            {COPY.devTool}
          </Badge>
        </div>
      </header>

      <main aria-busy={!state && !failed} className="mx-auto grid w-full min-w-0 max-w-content gap-8 px-gutter pb-16 pt-6 min-[1101px]:px-6">
        {failed ? (
          <Callout tone="danger" title={COPY.offline}>
            {COPY.offlineBody}
          </Callout>
        ) : null}
        {!state ? (
          failed ? null : (
            <div className="grid gap-4">
              <Skeleton radius="panel" className="h-32" />
              <Skeleton radius="panel" className="h-48" />
            </div>
          )
        ) : empty ? (
          <EmptyState icon="columns" title={COPY.emptyTitle}>
            {COPY.emptyBody}
          </EmptyState>
        ) : (
          <Board state={state} />
        )}
      </main>
    </div>
  )
}

function Board({ state }: { state: TiState }) {
  const wip = Number(state.sprint['wip-en-curso']) || 6
  const byEstado = (estado: string) => state.cards.filter((card) => card.estado === estado)
  const pending = state.cards.filter((card) => card.espera === 'gaston')
  const team = [...(state.jefe ? [state.jefe] : []), ...state.agents]
  const inProgress = byEstado('en-curso').length

  return (
    <>
      <Card as="section" aria-label={COPY.sprint} className="grid gap-4">
        <div className="grid gap-1">
          <Heading level="kicker">
            {COPY.sprint} {state.sprint.sprint ?? '—'} · {state.sprint.inicio ?? '?'} → {state.sprint.fin ?? '?'}
          </Heading>
          <p className="m-0 text-lead font-semibold text-foreground">{state.sprint.meta || COPY.noGoal}</p>
        </div>
        <dl className="m-0 grid grid-cols-2 gap-x-4 gap-y-3 border-t border-border-subtle pt-4 sm:grid-cols-5">
          <Stat label={COPY.cards} value={state.cards.length} />
          <Stat label={COPY.inProgress} value={`${inProgress}/${wip}`} tone={inProgress > wip ? 'danger' : undefined} />
          <Stat label={COPY.done} value={byEstado('hecha').length} />
          <Stat label={COPY.working} value={team.filter((agent) => agent.status === 'working').length} />
          <Stat label={COPY.pending} value={pending.length} tone={pending.length ? 'warning' : undefined} />
        </dl>
      </Card>

      <div className="grid grid-cols-[minmax(0,1fr)] gap-4 min-[1101px]:grid-cols-3">
        <Card as="section" className="grid content-start gap-3">
          <SectionHeader as="h2" icon="flag" title={COPY.pending} />
          {pending.length ? (
            <ul className="m-0 grid list-none gap-2 p-0">
              {pending.map((card) => (
                <li key={card.id} className="text-body">
                  <span className="font-semibold tabular-nums text-info-soft">{card.id}</span> {String(card.titulo ?? '')}
                </li>
              ))}
            </ul>
          ) : (
            <p className={supportText}>{COPY.nothingPending}</p>
          )}
        </Card>
        <GatePanel gate={state.gate} />
        <Card as="section" className="grid content-start gap-3">
          <SectionHeader as="h2" icon="compass" title={COPY.qa} />
          {state.qa ? <RunLine run={state.qa} label={state.qa.sha?.slice(0, 7) ?? ''} /> : <p className={supportText}>{COPY.qaEmpty}</p>}
          {state.qa?.failed?.length ? (
            <p className="m-0 text-micro text-danger-soft [overflow-wrap:anywhere]">
              {COPY.failedTests}: {state.qa.failed.join(', ')}
            </p>
          ) : null}
        </Card>
      </div>

      <section className="grid gap-4" aria-labelledby="ti-team">
        <SectionHeader as="h2" icon="user" title={<span id="ti-team">{COPY.team}</span>} />
        {team.length ? (
          <div className="grid grid-cols-[minmax(0,1fr)] gap-3 min-[1101px]:grid-cols-4">
            {team.map((agent) => (
              <AgentCard key={agent.id} agent={agent} />
            ))}
          </div>
        ) : (
          <p className={supportText}>{COPY.teamEmpty}</p>
        )}
      </section>

      <section className="grid gap-4" aria-labelledby="ti-board">
        <SectionHeader as="h2" icon="columns" title={<span id="ti-board">{COPY.board}</span>} />
        <Lane title={COPY.expedite} tone="danger" cards={byEstado('expedite')} />
        <div className="grid grid-cols-[minmax(0,1fr)] gap-5 min-[1101px]:grid-cols-9 min-[1101px]:gap-3">
          {COLUMNS.map((column) => {
            const cards = byEstado(column)
            const isWip = column === 'en-curso'

            return (
              <section key={column} aria-label={COPY.column[column]} className="grid min-w-0 content-start gap-2">
                <div className="flex items-center justify-between gap-2 border-b border-border-subtle pb-1">
                  <Heading level="kicker" as="h3" className="[overflow-wrap:anywhere]">
                    {COPY.column[column]}
                  </Heading>
                  <Badge size="sm" tone={isWip && cards.length > wip ? 'danger' : isWip && cards.length === wip ? 'warning' : 'neutral'} className="tabular-nums">
                    {isWip ? `${cards.length}/${wip}` : cards.length}
                  </Badge>
                </div>
                {cards.map((card) => (
                  <BoardCard key={card.id} card={card} />
                ))}
              </section>
            )
          })}
        </div>
        <Lane title={COPY.blocked} tone="warning" cards={byEstado('bloqueada')} />
      </section>
    </>
  )
}

function Stat({ label, value, tone }: { label: string; value: number | string; tone?: Tone }) {
  return (
    <div className="grid gap-0.5">
      <dt className="text-micro text-muted">{label}</dt>
      <dd className={cx('m-0 text-title font-semibold tabular-nums', tone ? TONE[tone].text : 'text-foreground')}>{value}</dd>
    </div>
  )
}

function RunLine({ run, label }: { run: Run; label: string }) {
  const ok = run.status === 'pass'

  return (
    <div className="flex flex-wrap items-center gap-2 text-body">
      <Badge tone={ok ? 'success' : 'danger'} dot>
        {ok ? COPY.pass : COPY.fail}
      </Badge>
      <span className="min-w-0 font-mono text-micro text-muted [overflow-wrap:anywhere]">{label}</span>
      {run.ms ? <span className="text-micro tabular-nums text-muted">{Math.round(run.ms / 1000)} s</span> : null}
    </div>
  )
}

function GatePanel({ gate }: { gate: TiState['gate'] }) {
  const idle = !gate.running.length && !gate.queue.length

  return (
    <Card as="section" className="grid content-start gap-3">
      <SectionHeader as="h2" icon="lock" title={COPY.gate} />
      {idle ? <p className={supportText}>{COPY.gateEmpty}</p> : null}
      {gate.running.map((run) => (
        <div key={run.branch} className="flex flex-wrap items-center gap-2">
          <Badge tone="info" dot>
            {COPY.running}
          </Badge>
          <span className="font-mono text-micro text-foreground [overflow-wrap:anywhere]">{run.branch}</span>
          {run.step ? <span className="text-micro text-muted">{run.step}</span> : null}
        </div>
      ))}
      {gate.queue.length ? (
        <div className="grid gap-1">
          <Heading level="kicker">{COPY.queued}</Heading>
          <ol className="m-0 grid list-inside list-decimal gap-1 p-0 font-mono text-micro text-muted">
            {gate.queue.map((branch) => (
              <li key={branch} className="[overflow-wrap:anywhere]">
                {branch}
              </li>
            ))}
          </ol>
        </div>
      ) : null}
      {gate.last ? (
        <div className="grid gap-1 border-t border-border-subtle pt-3">
          <Heading level="kicker">{COPY.lastGate}</Heading>
          <RunLine run={gate.last} label={gate.last.branch ?? ''} />
        </div>
      ) : null}
    </Card>
  )
}

function AgentCard({ agent }: { agent: Agent }) {
  const isJefe = agent.id === 'jefe'

  return (
    <Card as="article" padding="sm" className={cx('grid content-start gap-2', agent.status === 'done' && 'opacity-70')}>
      <div className="flex items-start justify-between gap-2">
        <Heading level="card" className="[overflow-wrap:anywhere]">
          {isJefe ? COPY.jefe : (agent.role ?? agent.type ?? agent.id)}
        </Heading>
        <Badge tone={STATUS_TONE[agent.status]} dot={agent.status === 'working'} className="shrink-0">
          {COPY.status[agent.status]}
        </Badge>
      </div>
      {agent.card || agent.description ? (
        <p className="m-0 text-micro text-muted [overflow-wrap:anywhere]">
          {agent.card ? <span className="font-semibold text-info-soft">{agent.card}</span> : null} {agent.description?.replace(/^TI-\d+\s*[:·-]?\s*/, '')}
        </p>
      ) : null}
      <p className="m-0 font-mono text-micro text-soft [overflow-wrap:anywhere]">{agent.tool ? `${agent.tool} · ${agent.target ?? ''}` : COPY.noTool}</p>
      <p className="m-0 text-micro tabular-nums text-muted">{COPY.ago(agent.seconds)}</p>
    </Card>
  )
}

function BoardCard({ card }: { card: CardFm }) {
  return (
    <Card as="article" padding="sm" className="grid gap-1">
      <div className="flex items-center justify-between gap-1">
        <span className="text-micro font-semibold tabular-nums text-info-soft">{card.id}</span>
        {card.tamano ? (
          <Badge size="sm" shape="tag">
            {String(card.tamano)}
          </Badge>
        ) : null}
      </div>
      <p className="m-0 text-micro font-semibold text-foreground">{String(card.titulo ?? '')}</p>
      <p className="m-0 text-micro text-muted">{String(card.rol ?? '')}</p>
      {card.espera === 'gaston' ? (
        <Badge size="sm" tone="warning" className="justify-self-start">
          {COPY.waitsGaston}
        </Badge>
      ) : null}
    </Card>
  )
}

function Lane({ title, tone, cards }: { title: string; tone: Tone; cards: CardFm[] }) {
  return (
    <section aria-label={title} className="grid gap-2">
      <div className="flex items-center gap-2">
        <Heading level="kicker" as="h3">
          {title}
        </Heading>
        <Badge size="sm" tone={cards.length ? tone : 'neutral'} className="tabular-nums">
          {cards.length}
        </Badge>
      </div>
      {cards.length ? (
        <div className="grid grid-cols-[minmax(0,1fr)] gap-3 min-[1101px]:grid-cols-4">
          {cards.map((card) => (
            <BoardCard key={card.id} card={card} />
          ))}
        </div>
      ) : null}
    </section>
  )
}

import type {
  BuildComparison,
  BuildMetrics,
  CardDiff,
  CleanComparison,
  ComparisonVerdict,
  RuleComparisonRow,
} from '../../app/build-comparison'
import type { RoleDistribution } from '../../app/role-distribution'
import { formatInteger, formatShortPercent } from '../../app/utils'
import { KindBadge } from '../probability/KindBadge'
import { Badge } from '../ui/Badge'
import { Callout } from '../ui/Callout'
import { Card } from '../ui/Card'
import { cx } from '../ui/cx'
import { Icon, type IconName } from '../ui/Icon'
import { Meter } from '../ui/Meter'
import { TONE, type Tone } from '../ui/tone'
import { sectionTitle } from '../ui/typography'
import { SideBadge } from './SideBadge'

const DELTA_COLOR = {
  better: 'text-success-soft',
  worse: 'text-danger-soft',
  neutral: 'text-soft',
} as const

const DELTA_BADGE_TONE: Record<keyof typeof DELTA_COLOR, Tone> = {
  better: 'success',
  worse: 'danger',
  neutral: 'neutral',
}

const CELL = 'whitespace-nowrap border-t border-border-subtle px-1.5 py-2'

/** Celda de encabezado de columna. */
const TH_HEAD = 'whitespace-nowrap px-1.5 py-2 text-right text-micro font-semibold uppercase tracking-[0.06em] text-soft'

/** Encabezado de fila (nombre del renglón). */
const thRow = (emphasis = false) =>
  cx(CELL, 'text-left text-foreground', emphasis ? 'font-bold' : 'font-semibold')

/** Celda de dato; con `tone` es una diferencia (B vs A) coloreada. */
const td = (emphasis = false, tone?: keyof typeof DELTA_COLOR) =>
  cx(
    CELL,
    'text-right',
    tone ? ['font-bold', DELTA_COLOR[tone]] : emphasis ? 'font-bold text-foreground' : 'text-muted',
  )

const TABLE = 'w-full border-collapse text-body tabular-nums'

/** Nombre con el que el comparador muestra tu deck actual. */
export const CURRENT_DECK_NAME = 'Deck actual'

/** Diferencias menores a esto se muestran como neutras (0.1 pp). */
const VISIBLE_DELTA = 0.001

type DeltaTone = 'better' | 'worse' | 'neutral'

/** Tono de B frente a A: para salidas y manos limpias subir es mejor; para problemas, bajar. */
function toneFor(delta: number | null, higherIsBetter = true): DeltaTone {
  if (delta === null || Math.abs(delta) < VISIBLE_DELTA) {
    return 'neutral'
  }
  return delta > 0 === higherIsBetter ? 'better' : 'worse'
}

function formatDelta(delta: number | null): string {
  if (delta === null) {
    return '—'
  }
  if (Math.abs(delta) < VISIBLE_DELTA) {
    return '='
  }
  return `${delta > 0 ? '+' : '−'}${(Math.abs(delta) * 100).toFixed(1)} pp`
}

function formatValue(value: number | null): string {
  return value === null ? '—' : formatShortPercent(value)
}

export function ComparisonReport({
  comparison,
  isCurrentDeck,
}: {
  comparison: BuildComparison
  /** Qué lado es tu deck actual (se clasifica en Categorización, no acá). */
  isCurrentDeck: { A: boolean; B: boolean }
}) {
  const { a, b } = comparison

  return (
    <div className="grid min-w-0 gap-4">
      <VerdictBanner verdict={comparison.verdict} />
      {[a, b].map((build, index) => (
        <BuildNotes key={index} side={index === 0 ? 'A' : 'B'} build={build} isCurrentDeck={index === 0 ? isCurrentDeck.A : isCurrentDeck.B} />
      ))}
      {comparison.clean ? <CleanTable clean={comparison.clean} nameA={a.name} nameB={b.name} /> : null}
      <CardDiffList diffs={comparison.cardDiffs} deckSizeA={a.deckSize} deckSizeB={b.deckSize} />
      <RoleTable rolesA={a.roles} rolesB={b.roles} />
      <RuleTable rows={comparison.rules} />
    </div>
  )
}

/** Un aviso por build: primero lo que falta clasificar (con qué hacer), después otros bloqueos. */
function BuildNotes({ side, build, isCurrentDeck }: { side: 'A' | 'B'; build: BuildMetrics; isCurrentDeck: boolean }) {
  const pending = build.pendingCards.length
  const otherReasons = pending > 0 ? build.blockedReasons.filter((reason) => !/clasific|revisi/i.test(reason)) : build.blockedReasons

  return (
    <>
      {pending > 0 ? (
        <Callout tone="warning" title={`Build ${side}: ${formatInteger(pending)} carta${pending === 1 ? '' : 's'} sin clasificar`}>
          {isCurrentDeck
            ? 'Clasificalas en Categorización para poder comparar.'
            : 'Están marcadas con “?” en la grilla: tocalas para clasificarlas.'}
        </Callout>
      ) : null}
      {otherReasons.map((reason) => (
        <Callout key={reason} tone="warning" title={`Build ${side}`}>
          {reason}
        </Callout>
      ))}
    </>
  )
}

const VERDICT_LOOK: Record<ComparisonVerdict['kind'], { tone: Tone; icon: IconName }> = {
  a: { tone: 'success', icon: 'check-circle' },
  b: { tone: 'success', icon: 'check-circle' },
  split: { tone: 'warning', icon: 'swap' },
  incomplete: { tone: 'danger', icon: 'alert' },
  identical: { tone: 'neutral', icon: 'columns' },
  equivalent: { tone: 'info', icon: 'columns' },
}

function VerdictBanner({ verdict }: { verdict: ComparisonVerdict }) {
  const look = VERDICT_LOOK[verdict.kind]

  return (
    <Card tone={look.tone} padding="md" className="flex items-start gap-3" aria-live="polite">
      {verdict.kind === 'a' || verdict.kind === 'b' ? (
        <SideBadge side={verdict.kind === 'a' ? 'A' : 'B'} size="lg" />
      ) : (
        <span className={cx('grid size-10 shrink-0 place-items-center rounded-control border', TONE[look.tone].tint, TONE[look.tone].text)}>
          <Icon name={look.icon} size={20} />
        </span>
      )}
      <div className="grid min-w-0 gap-0.5">
        <strong className="text-lead font-semibold text-foreground">{verdict.title}</strong>
        <span className="text-body text-muted">{verdict.detail}</span>
      </div>
    </Card>
  )
}

function ReportSection({ title, hint, children }: { title: string; hint?: string; children: React.ReactNode }) {
  return (
    <Card padding="sm" className="grid min-w-0 gap-3">
      <header className="grid gap-0.5">
        <h3 className={cx(sectionTitle, 'text-body')}>{title}</h3>
        {hint ? <p className="m-0 text-micro text-soft">{hint}</p> : null}
      </header>
      {children}
    </Card>
  )
}

function CleanTable({ clean, nameA, nameB }: { clean: CleanComparison; nameA: string; nameB: string }) {
  const rows = [
    { key: 'first', label: 'Yendo 1º', data: clean.first },
    { key: 'second', label: 'Yendo 2º', data: clean.second },
    { key: 'average', label: 'Promedio', data: clean.average },
  ] as const

  return (
    <ReportSection title="Manos limpias" hint="Mismo cálculo y mismas reglas que el Probability Lab.">
      <ul className="m-0 grid list-none gap-4 p-0 tabular-nums">
        {rows.map((row) => {
          const tone = toneFor(row.data.delta)

          return (
            <li key={row.key} className="grid gap-2">
              <div className="flex items-center justify-between gap-2">
                <strong className={cx('text-body text-foreground', row.key === 'average' ? 'font-bold' : 'font-semibold')}>{row.label}</strong>
                <Badge tone={DELTA_BADGE_TONE[tone]} size="sm" title="B vs A">
                  B vs A {formatDelta(row.data.delta)}
                </Badge>
              </div>
              <CleanBar side="A" name={nameA} value={row.data.a} />
              <CleanBar side="B" name={nameB} value={row.data.b} />
            </li>
          )
        })}
      </ul>
    </ReportSection>
  )
}

function CleanBar({ side, name, value }: { side: 'A' | 'B'; name: string; value: number | null }) {
  return (
    <div className="grid grid-cols-[1.25rem_minmax(0,1fr)_3.5rem] items-center gap-2" title={name}>
      <span className={cx('text-micro font-bold', side === 'A' ? 'text-primary-soft' : 'text-info-soft')}>{side}</span>
      <Meter value={value ?? 0} tone={side === 'A' ? 'brand' : 'info'} size="md" label={`Manos limpias de la build ${side}`} />
      <span className="text-right text-body font-semibold text-foreground">{formatValue(value)}</span>
    </div>
  )
}

function CardDiffList({ diffs, deckSizeA, deckSizeB }: { diffs: CardDiff[]; deckSizeA: number; deckSizeB: number }) {
  const sizeDelta = deckSizeB - deckSizeA

  return (
    <ReportSection
      title="Qué cambia en el Main Deck"
      hint={`A tiene ${formatInteger(deckSizeA)} cartas y B ${formatInteger(deckSizeB)}${sizeDelta === 0 ? '' : ` (${sizeDelta > 0 ? '+' : '−'}${formatInteger(Math.abs(sizeDelta))})`}.`}
    >
      {diffs.length === 0 ? (
        <p className="m-0 text-body text-soft">Las dos builds tienen las mismas cartas.</p>
      ) : (
        <ul className="m-0 grid list-none gap-1.5 p-0">
          {diffs.map((diff) => (
            <li key={diff.cardId} className="grid grid-cols-[2.75rem_minmax(0,1fr)_auto] items-center gap-2 text-body">
              <Badge tone={diff.delta > 0 ? 'success' : 'danger'} size="sm" className="justify-center tabular-nums">
                {diff.delta > 0 ? '+' : '−'}
                {formatInteger(Math.abs(diff.delta))}
              </Badge>
              <span className="truncate text-foreground">{diff.name}</span>
              <span className="text-micro tabular-nums text-soft">
                {formatInteger(diff.copiesA)} → {formatInteger(diff.copiesB)}
              </span>
            </li>
          ))}
        </ul>
      )}
    </ReportSection>
  )
}

function RoleTable({
  rolesA,
  rolesB,
}: {
  rolesA: { first: RoleDistribution[]; second: RoleDistribution[] }
  rolesB: { first: RoleDistribution[]; second: RoleDistribution[] }
}) {
  return (
    <ReportSection title="Roles" hint="Copias en el deck y probabilidad de robar al menos una.">
      <div className="-mx-1 overflow-x-auto px-1">
      <table className={TABLE}>
        <thead>
          <tr>
            <th scope="col" className={TH_HEAD} />
            <th scope="col" className={TH_HEAD}>Copias</th>
            <th scope="col" className={TH_HEAD}>1+ yendo 1º</th>
            <th scope="col" className={TH_HEAD}>1+ yendo 2º</th>
          </tr>
        </thead>
        <tbody>
          {rolesA.first.map((roleA, index) => {
            const roleB = rolesB.first[index]!
            const secondA = rolesA.second[index]!
            const secondB = rolesB.second[index]!
            // Para bricks, robar menos es mejor.
            const higherIsBetter = roleA.key !== 'brick'

            return (
              <tr key={roleA.key}>
                <th scope="row" className={thRow()}>{roleA.label}</th>
                <td className={td()}>
                  {formatInteger(roleA.copies)} → {formatInteger(roleB.copies)}
                </td>
                <RoleCell a={roleA.atLeastOne} b={roleB.atLeastOne} higherIsBetter={higherIsBetter} />
                <RoleCell a={secondA.atLeastOne} b={secondB.atLeastOne} higherIsBetter={higherIsBetter} />
              </tr>
            )
          })}
        </tbody>
      </table>
      </div>
    </ReportSection>
  )
}

function RoleCell({ a, b, higherIsBetter }: { a: number; b: number; higherIsBetter: boolean }) {
  return (
    <td className={td()}>
      {formatShortPercent(a)} →{' '}
      <span className={cx('font-bold', DELTA_COLOR[toneFor(b - a, higherIsBetter)])}>{formatShortPercent(b)}</span>
    </td>
  )
}

function RuleTable({ rows }: { rows: RuleComparisonRow[] }) {
  if (rows.length === 0) {
    return null
  }

  return (
    <ReportSection title="Reglas" hint="Cuánto se cumple cada regla en promedio (las de un solo turno, en su turno).">
      <ul className="m-0 grid list-none gap-2 p-0">
        {rows.map((row) => (
          <li key={row.id} className="grid gap-1 border-t border-border-subtle pt-2 first:border-t-0 first:pt-0">
            <div className="flex min-w-0 flex-wrap items-center gap-1.5 text-body text-foreground">
              <KindBadge kind={row.kind} />
              <strong className="font-semibold">{row.name}</strong>
              {row.turnContext !== 'either' ? (
                <Badge tone="warning" size="sm" shape="tag">
                  {row.turnContext === 'first' ? 'Solo 1º' : 'Solo 2º'}
                </Badge>
              ) : null}
            </div>
            <div className="flex items-baseline gap-2 text-body tabular-nums text-muted">
              <span>{formatValue(row.a)}</span>
              <span aria-hidden="true">→</span>
              <span>{formatValue(row.b)}</span>
              <span className={cx('ml-auto font-bold', DELTA_COLOR[toneFor(row.delta, row.kind === 'opening')])}>
                {formatDelta(row.delta)}
              </span>
            </div>
            {row.missingCardsIn.length > 0 ? (
              <p className="m-0 text-micro text-warning-soft">
                {row.missingCardsIn.length === 2 ? 'Ninguna build' : `La build ${row.missingCardsIn[0]}`} no tiene alguna carta
                que pide esta regla: ahí no puede cumplirse.
              </p>
            ) : null}
          </li>
        ))}
      </ul>
    </ReportSection>
  )
}

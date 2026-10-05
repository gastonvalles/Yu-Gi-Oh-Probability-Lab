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
import { cx } from '../ui/cx'

const DELTA_COLOR = {
  better: 'text-accent',
  worse: 'text-destructive',
  neutral: 'text-soft',
} as const

const CELL = 'whitespace-nowrap border-t border-border px-[0.3rem] py-[0.4rem]'

/** Celda de encabezado de columna. */
const TH_HEAD = 'whitespace-nowrap px-[0.3rem] py-[0.4rem] text-right text-[0.68rem] font-bold text-soft'

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

const TABLE = 'w-full border-collapse text-[0.8rem] tabular-nums'
const NOTE = 'm-0 rounded-control border border-warning/45 bg-warning/8 px-[0.7rem] py-2 text-[0.78rem] text-warning'

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
    <div className="grid min-w-0 gap-[0.8rem]">
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
        <p className={NOTE}>
          <strong>Build {side}:</strong> {formatInteger(pending)} carta{pending === 1 ? '' : 's'} sin clasificar.{' '}
          {isCurrentDeck
            ? 'Clasificalas en Categorización para poder comparar.'
            : 'Están marcadas con “?” en la grilla: tocalas para clasificarlas.'}
        </p>
      ) : null}
      {otherReasons.map((reason) => (
        <p key={reason} className={NOTE}>
          <strong>Build {side}:</strong> {reason}
        </p>
      ))}
    </>
  )
}

function VerdictBanner({ verdict }: { verdict: ComparisonVerdict }) {
  return (
    <section
      className={cx(
        'grid gap-1 rounded-control border border-l-4 px-[0.9rem] py-[0.7rem] text-[0.82rem] text-muted',
        verdict.kind === 'a' || verdict.kind === 'b'
          ? 'border-success/55 bg-success/7'
          : verdict.kind === 'split'
            ? 'border-warning/60 bg-warning/7'
            : verdict.kind === 'incomplete'
              ? 'border-danger/55'
              : 'border-border',
      )}
      aria-live="polite"
    >
      <strong className="text-[1rem] text-foreground">{verdict.title}</strong>
      <span>{verdict.detail}</span>
    </section>
  )
}

function ReportSection({ title, hint, children }: { title: string; hint?: string; children: React.ReactNode }) {
  return (
    <section className="grid min-w-0 gap-2 rounded-panel border border-border bg-card-background/60 px-[0.85rem] py-3">
      <header>
        <h3 className="m-0 text-[0.9rem] text-foreground">{title}</h3>
        {hint ? <p className="m-0 mt-[0.15rem] text-[0.72rem] text-soft">{hint}</p> : null}
      </header>
      {children}
    </section>
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
      <table className={TABLE}>
        <thead>
          <tr>
            <th scope="col" className={TH_HEAD} />
            <th scope="col" title={nameA} className={TH_HEAD}>A</th>
            <th scope="col" title={nameB} className={TH_HEAD}>B</th>
            <th scope="col" className={TH_HEAD}>B vs A</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.key}>
              <th scope="row" className={thRow(row.key === 'average')}>{row.label}</th>
              <td className={td(row.key === 'average')}>{formatShortPercent(row.data.a)}</td>
              <td className={td(row.key === 'average')}>{formatShortPercent(row.data.b)}</td>
              <td className={td(false, toneFor(row.data.delta))}>
                {formatDelta(row.data.delta)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </ReportSection>
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
        <p className="m-0 text-[0.8rem] text-soft">Las dos builds tienen las mismas cartas.</p>
      ) : (
        <ul className="m-0 grid list-none gap-[0.3rem] p-0">
          {diffs.map((diff) => (
            <li key={diff.cardId} className="grid grid-cols-[2.4rem_minmax(0,1fr)_auto] items-center gap-2 text-[0.82rem]">
              <span
                className={cx(
                  'rounded-full py-[0.05rem] text-center font-extrabold tabular-nums',
                  diff.delta > 0 ? 'bg-success/16 text-accent' : 'bg-danger/16 text-destructive',
                )}
              >
                {diff.delta > 0 ? '+' : '−'}
                {formatInteger(Math.abs(diff.delta))}
              </span>
              <span className="truncate text-foreground">{diff.name}</span>
              <span className="text-[0.74rem] tabular-nums text-soft">
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
      <ul className="m-0 grid list-none gap-[0.3rem] p-0">
        {rows.map((row) => (
          <li key={row.id} className="grid gap-1 border-t border-border pt-[0.4rem] first:border-t-0 first:pt-0">
            <div className="flex min-w-0 flex-wrap items-center gap-[0.35rem] text-[0.82rem] text-foreground">
              <KindBadge kind={row.kind} />
              <strong>{row.name}</strong>
              {row.turnContext !== 'either' ? (
                <span className="rounded-[0.3rem] bg-warning/14 px-[0.3rem] py-[0.05rem] text-[0.64rem] font-semibold text-warning">{row.turnContext === 'first' ? 'Solo 1º' : 'Solo 2º'}</span>
              ) : null}
            </div>
            <div className="flex items-baseline gap-[0.4rem] text-[0.8rem] tabular-nums text-muted">
              <span>{formatValue(row.a)}</span>
              <span aria-hidden="true">→</span>
              <span>{formatValue(row.b)}</span>
              <span className={cx('ml-auto font-bold', DELTA_COLOR[toneFor(row.delta, row.kind === 'opening')])}>
                {formatDelta(row.delta)}
              </span>
            </div>
            {row.missingCardsIn.length > 0 ? (
              <p className="m-0 text-[0.72rem] text-warning">
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

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
import type { PatternKind } from '../../types'

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
    <div className="comparison-report">
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
        <p className="comparison-note" data-tone="warning">
          <strong>Build {side}:</strong> {formatInteger(pending)} carta{pending === 1 ? '' : 's'} sin clasificar.{' '}
          {isCurrentDeck
            ? 'Clasificalas en Categorización para poder comparar.'
            : 'Están marcadas con “?” en la grilla: tocalas para clasificarlas.'}
        </p>
      ) : null}
      {otherReasons.map((reason) => (
        <p key={reason} className="comparison-note" data-tone="warning">
          <strong>Build {side}:</strong> {reason}
        </p>
      ))}
    </>
  )
}

function VerdictBanner({ verdict }: { verdict: ComparisonVerdict }) {
  return (
    <section className="comparison-verdict" data-kind={verdict.kind} aria-live="polite">
      <strong>{verdict.title}</strong>
      <span>{verdict.detail}</span>
    </section>
  )
}

function ReportSection({ title, hint, children }: { title: string; hint?: string; children: React.ReactNode }) {
  return (
    <section className="comparison-section">
      <header>
        <h3>{title}</h3>
        {hint ? <p>{hint}</p> : null}
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
      <table className="comparison-table">
        <thead>
          <tr>
            <th scope="col" />
            <th scope="col" title={nameA}>A</th>
            <th scope="col" title={nameB}>B</th>
            <th scope="col">B vs A</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.key} data-emphasis={row.key === 'average' ? 'true' : 'false'}>
              <th scope="row">{row.label}</th>
              <td>{formatShortPercent(row.data.a)}</td>
              <td>{formatShortPercent(row.data.b)}</td>
              <td className="comparison-delta" data-tone={toneFor(row.data.delta)}>
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
        <p className="comparison-empty">Las dos builds tienen las mismas cartas.</p>
      ) : (
        <ul className="comparison-diffs">
          {diffs.map((diff) => (
            <li key={diff.cardId} data-direction={diff.delta > 0 ? 'added' : 'removed'}>
              <span className="comparison-diff-delta">
                {diff.delta > 0 ? '+' : '−'}
                {formatInteger(Math.abs(diff.delta))}
              </span>
              <span className="comparison-diff-name">{diff.name}</span>
              <span className="comparison-diff-copies">
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
      <table className="comparison-table">
        <thead>
          <tr>
            <th scope="col" />
            <th scope="col">Copias</th>
            <th scope="col">1+ yendo 1º</th>
            <th scope="col">1+ yendo 2º</th>
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
                <th scope="row">{roleA.label}</th>
                <td>
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
    <td>
      {formatShortPercent(a)} → <span className="comparison-delta" data-tone={toneFor(b - a, higherIsBetter)}>{formatShortPercent(b)}</span>
    </td>
  )
}

function RuleTable({ rows }: { rows: RuleComparisonRow[] }) {
  if (rows.length === 0) {
    return null
  }

  return (
    <ReportSection title="Reglas" hint="Cuánto se cumple cada regla en promedio (las de un solo turno, en su turno).">
      <ul className="comparison-rules">
        {rows.map((row) => (
          <li key={row.id}>
            <div className="comparison-rule-name">
              <KindBadge kind={row.kind} />
              <strong>{row.name}</strong>
              {row.turnContext !== 'either' ? (
                <span className="comparison-rule-turn">{row.turnContext === 'first' ? 'Solo 1º' : 'Solo 2º'}</span>
              ) : null}
            </div>
            <div className="comparison-rule-values">
              <span>{formatValue(row.a)}</span>
              <span aria-hidden="true">→</span>
              <span>{formatValue(row.b)}</span>
              <span className="comparison-delta" data-tone={toneFor(row.delta, row.kind === 'opening')}>
                {formatDelta(row.delta)}
              </span>
            </div>
            {row.missingCardsIn.length > 0 ? (
              <p className="comparison-rule-note">
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

function KindBadge({ kind }: { kind: PatternKind }) {
  return (
    <span className="lab-kind-badge" data-kind={kind}>
      {kind === 'opening' ? 'Salida' : 'Problema'}
    </span>
  )
}

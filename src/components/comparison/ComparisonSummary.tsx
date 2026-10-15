import type { BuildComparison, BuildMetrics, ComparisonVerdict } from '../../app/build-comparison'
import { t } from '../../i18n'
import { Callout } from '../ui/Callout'
import { Card } from '../ui/Card'
import { cx } from '../ui/cx'
import { Icon, type IconName } from '../ui/Icon'
import { TONE, type Tone } from '../ui/tone'
import type { Side } from './comparison-rows'
import { SideBadge } from './SideBadge'

/** Nombre con el que el comparador muestra tu deck actual (si no le pusiste uno). */
export const currentDeckName = () => t('meta.compare.currentDeck')

/** Los motivos de bloqueo del Lab que hablan de clasificar o revisar cartas, en español o en inglés: ya los cubre el aviso de cartas sin clasificar. */
const CLASSIFICATION_REASON = /clasific|revisi|classif|review/i

/** Un aviso por build: primero lo que falta clasificar (las cartas con "?" están en la lista de abajo), después otros bloqueos. */
export function BuildNotes({ side, build, canClassifyHere }: { side: Side; build: BuildMetrics; canClassifyHere: boolean }) {
  const pending = build.pendingCards.length
  const otherReasons = pending > 0 ? build.blockedReasons.filter((reason) => !CLASSIFICATION_REASON.test(reason)) : build.blockedReasons

  return (
    <>
      {pending > 0 ? (
        <Callout tone="warning" title={t('meta.compare.pending', { side, count: pending })}>
          {t(canClassifyHere ? 'meta.compare.classifyHere' : 'meta.compare.classifyElsewhere')}
        </Callout>
      ) : null}
      {otherReasons.map((reason) => (
        <Callout key={reason} tone="warning" title={t('meta.compare.build', { side })}>
          {reason}
        </Callout>
      ))}
    </>
  )
}

const VERDICT_LOOK: Record<ComparisonVerdict['kind'], { tone: Tone; icon: IconName }> = {
  computing: { tone: 'info', icon: 'flask' },
  a: { tone: 'success', icon: 'check-circle' },
  b: { tone: 'success', icon: 'check-circle' },
  split: { tone: 'warning', icon: 'swap' },
  incomplete: { tone: 'danger', icon: 'alert' },
  identical: { tone: 'neutral', icon: 'columns' },
  equivalent: { tone: 'info', icon: 'columns' },
}

/** La respuesta en una línea: cuál conviene, dicho en "de cada 100 manos". El detalle de cada mazo está detrás del VS. */
export function VerdictLine({ comparison }: { comparison: BuildComparison }) {
  const { verdict, clean } = comparison
  const look = VERDICT_LOOK[verdict.kind]
  const best = verdict.kind === 'a' ? 'A' : verdict.kind === 'b' ? 'B' : null
  const average = clean?.average
  const detail =
    average && best
      ? t('meta.compare.verdict.per100', {
          best,
          bestValue: Math.round((best === 'A' ? average.a : average.b) * 100),
          other: best === 'A' ? 'B' : 'A',
          otherValue: Math.round((best === 'A' ? average.b : average.a) * 100),
        })
      : verdict.detail

  return (
    <Card padding="sm" className="flex min-w-0 items-center gap-3" aria-live="polite">
      {best ? <SideBadge side={best} size="lg" /> : <Icon name={look.icon} size={28} className={cx('shrink-0', TONE[look.tone].text)} />}
      <div className="grid min-w-0 gap-0.5">
        <strong className="text-lead font-semibold text-foreground">{verdict.title}</strong>
        <span className="text-body text-muted">{detail}</span>
      </div>
    </Card>
  )
}

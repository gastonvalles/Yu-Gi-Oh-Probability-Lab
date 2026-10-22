import { formatShortPercent } from '../../app/utils'
import { t } from '../../i18n'
import { tRich } from '../../i18n/rich'
import type { PatternKind } from '../../types'
import { cx } from '../ui/cx'
import { ProgressRing } from '../ui/ProgressRing'
import { formatPer100 } from '../ui/ring-shared'
import { judgeTone } from '../ui/tone'
import type { DraftImpact } from './use-draft-impact'

// La frase cambia con el tipo de regla y con el turno al que vale: una clave por combinación (el orden de las palabras lo decide el idioma).
const SHARE_KEY = {
  opening: { either: 'builder.impact.opening.either', first: 'builder.impact.opening.first', second: 'builder.impact.opening.second' },
  problem: { either: 'builder.impact.problem.either', first: 'builder.impact.problem.first', second: 'builder.impact.problem.second' },
} as const

const CLEAN_KEY = { either: 'builder.impact.clean.either', first: 'builder.impact.clean.first', second: 'builder.impact.clean.second' } as const

const BLOCK = 'grid grid-cols-[auto_minmax(0,1fr)] items-center gap-3 rounded-card bg-tint/7 p-3 text-body'

interface DraftImpactSummaryProps {
  kind: PatternKind
  /** La regla tiene todas sus condiciones con qué cuentan: si no, no hay número (nunca un 0 falso). */
  complete: boolean
  impact: DraftImpact | null
  /** Se está calculando la regla como está ahora (`impact` es el último que hubo, o null). */
  pending: boolean
}

/**
 * El número en vivo, arriba y fijo: un anillo de 56 px (verde si es salida, rojo claro si es problema), cuántas de cada 100 manos la cumplen y, debajo, cómo cambian
 * tus manos buenas (antes → después, con ▲/▼ del color que le conviene a quien lee). A medias: el anillo sin medir y qué falta. Calculando: `aria-busy`.
 */
export function DraftImpactSummary({ kind, complete, impact, pending }: DraftImpactSummaryProps) {
  const main = complete ? (impact?.rule.main ?? null) : null

  if (!complete || main === null || !impact) {
    const calculating = complete && pending

    return (
      <div className={BLOCK} aria-live="polite" aria-busy={calculating}>
        <ProgressRing unmeasured value={0} size={56} label={t(calculating ? 'builder.impact.calculating' : 'builder.impact.unmeasured')}>
          <span className={cx('text-lead font-bold text-soft', calculating && 'motion-safe:animate-pulse')}>{calculating ? '…' : '—'}</span>
        </ProgressRing>
        <span className="grid min-w-0 gap-0.5">
          <strong className="font-semibold text-foreground">
            {t(calculating ? 'builder.impact.calculating' : kind === 'opening' ? 'builder.impact.incomplete.opening' : 'builder.impact.incomplete.problem')}
          </strong>
          {calculating ? null : <span className="text-muted">{t('builder.impact.incompleteHint')}</span>}
        </span>
      </div>
    )
  }

  const scope = impact.rule.scope
  const share = t(SHARE_KEY[kind][scope], { n: formatPer100(main) })

  return (
    <div className={BLOCK} aria-live="polite" aria-busy={pending}>
      <span className={cx('transition-opacity duration-150', pending && 'opacity-60')}>
        <ProgressRing value={main} tone={judgeTone(kind === 'opening')} size={56} label={`${share} (${formatShortPercent(main)})`} />
      </span>
      <span className="grid min-w-0 gap-0.5">
        <strong className={cx('font-semibold text-foreground transition-opacity duration-150', pending && 'opacity-60')}>{share}</strong>
        {pending ? (
          <span className="text-muted">{t('builder.impact.calculating')}</span>
        ) : kind === 'opening' && main === 0 ? (
          <span className="font-semibold text-warning-soft">{t('builder.impact.never')}</span>
        ) : impact.clean ? (
          <CleanChange scope={scope} before={impact.clean.before} after={impact.clean.after} />
        ) : null}
      </span>
    </div>
  )
}

/** «Tus manos buenas yendo 2º: 84 → 96 ▲ 12»: la diferencia se cuenta con los números que se ven (redondeados), así suma. */
function CleanChange({ scope, before, after }: { scope: keyof typeof CLEAN_KEY; before: number; after: number }) {
  const shownBefore = formatPer100(before)
  const shownAfter = formatPer100(after)
  const delta = Math.round(after * 100) - Math.round(before * 100)

  return (
    <span className="text-muted">
      {tRich(CLEAN_KEY[scope], { b: (text) => <b className="font-semibold text-foreground tabular-nums">{text}</b> }, { before: shownBefore, after: shownAfter })}{' '}
      {delta === 0 || shownBefore === shownAfter ? (
        <span>{t('builder.impact.same')}</span>
      ) : (
        <span className={cx('whitespace-nowrap font-bold tabular-nums', delta > 0 ? 'text-success-soft' : 'text-danger-soft')}>
          <span aria-hidden="true">{t(delta > 0 ? 'builder.impact.up' : 'builder.impact.down', { n: Math.abs(delta) })}</span>
          <span className="sr-only">{t(delta > 0 ? 'builder.impact.betterLabel' : 'builder.impact.worseLabel', { n: Math.abs(delta) })}</span>
        </span>
      )}
    </span>
  )
}

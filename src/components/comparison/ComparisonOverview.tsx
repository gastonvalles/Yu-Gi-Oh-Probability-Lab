import type { BuildComparison } from '../../app/build-comparison'
import { t } from '../../i18n'
import { Card } from '../ui/Card'
import { cx } from '../ui/cx'
import { ProgressRing } from '../ui/ProgressRing'
import { TONE } from '../ui/tone'
import { diffRows, gapOf, MIN_GAP, shown, type DiffRowData, type Side } from './comparison-rows'
import { SideBadge } from './SideBadge'

/** Los puntos de diferencia, enteros (menos de uno se dice uno): la hoja los muestra así, «▲ 4». */
const wholePoints = (diff: number) => Math.max(1, Math.round(Math.abs(diff) / 10))
const per100 = (value: number) => String(Math.round(value * 100))

/**
 * El resumen del comparador para el celular (el escritorio tiene los cajones del VS): los dos mazos con su anillo de «de cada 100» (el mejor lleva el borde verde),
 * y debajo sólo lo que cambia entre ellos, con el valor de A atenuado, el de B y un chip ▲/▼ de B contra A (verde si a B le conviene, rojo si no).
 */
export function ComparisonOverview({ comparison }: { comparison: BuildComparison }) {
  const { clean, verdict } = comparison

  if (!clean || verdict.kind === 'computing') {
    return null
  }

  const groups = diffRows(comparison)
  const rows = [...groups.start, ...groups.stuck].filter((row) => gapOf(row) >= MIN_GAP).slice(0, 6)
  const winner: Side | null = verdict.kind === 'a' ? 'A' : verdict.kind === 'b' ? 'B' : null

  return (
    <section className="grid min-w-0 gap-4 min-[1101px]:hidden" aria-label={t('meta.compare.overview.title')}>
      <div className="grid grid-cols-2 gap-2">
        {(['A', 'B'] as const).map((side) => {
          const key = side === 'A' ? 'a' : 'b'

          return (
            <Card key={side} padding="sm" tone={winner === side ? 'success' : 'neutral'} className="grid justify-items-center gap-2">
              <SideBadge side={side} />
              <ProgressRing value={clean.average[key]} tone={winner === side ? 'success' : 'brand'} size={88} strokeWidth={9} format={per100} label={t('meta.compare.overview.ring', { side, value: per100(clean.average[key]) })} />
              <span className="text-center text-micro text-muted">{t('meta.compare.overview.turns', { first: per100(clean.first[key]), second: per100(clean.second[key]) })}</span>
            </Card>
          )
        })}
      </div>

      {rows.length > 0 ? (
        <div className="grid gap-1.5">
          <p className="m-0 text-micro font-semibold uppercase tracking-[0.04em] text-soft">{t('meta.compare.overview.changes')}</p>
          <ul className="m-0 grid list-none gap-1.5 p-0">
            {rows.map((row) => (
              <ChangeRow key={row.key} row={row} />
            ))}
          </ul>
          <p className="m-0 text-micro text-soft">{t('meta.compare.overview.note')}</p>
        </div>
      ) : null}
    </section>
  )
}

function ChangeRow({ row }: { row: DiffRowData }) {
  const diff = shown(row.b ?? 0) - shown(row.a ?? 0)
  const good = diff > 0 === row.higherIsBetter
  const tone = TONE[good ? 'success' : 'danger']
  const points = wholePoints(diff)

  return (
    <li className="flex min-h-13 min-w-0 items-center gap-2.5 rounded-card border border-border-subtle bg-card-background px-3">
      <span className="min-w-0 flex-1 text-body font-semibold text-foreground">
        {row.label}
        {row.tag ? <span className="ml-1.5 whitespace-nowrap text-micro font-normal text-soft">{row.tag}</span> : null}
      </span>
      <span className="text-body tabular-nums text-muted">{per100(row.a ?? 0)}</span>
      <strong className="text-body tabular-nums text-foreground">{per100(row.b ?? 0)}</strong>
      <span className={cx('inline-flex items-center gap-1 rounded-full border px-2 text-micro font-semibold tabular-nums', tone.tint, tone.text)}>
        <span aria-hidden="true">
          {diff > 0 ? '▲' : '▼'} {points}
        </span>
        <span className="sr-only">{t(diff > 0 ? 'meta.compare.deltaMore' : 'meta.compare.deltaLess', { points, side: 'A' })}</span>
      </span>
    </li>
  )
}

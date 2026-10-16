import type { BuildComparison } from '../../app/build-comparison'
import { t } from '../../i18n'
import { cx } from '../ui/cx'
import { Icon } from '../ui/Icon'
import { ProgressRing } from '../ui/ProgressRing'
import { Skeleton } from '../ui/Skeleton'
import { TONE } from '../ui/tone'
import { diffRows, gapOf, handsText, MIN_GAP, per100, rowWinner, shown, TURN_LABEL, TURNS, type DiffRowData, type Side } from './comparison-rows'

interface DeckResultsProps {
  side: Side
  comparison: BuildComparison
}

const RIVAL = { A: 'B', B: 'A' } as const

/**
 * Los resultados de un mazo como un tablero: el anillo grande con cuántas manos buenas da "de cada 100" (y cuánto más o menos que el otro mazo),
 * un anillo por turno y, abajo, una tarjeta por cosa que cambia, con las cantidades exactas. Lo que no cambia no se muestra (se están comparando).
 * Las tarjetas van en el mismo orden en los dos mazos para leerlas de lado a lado.
 */
export function DeckResults({ side, comparison }: DeckResultsProps) {
  const { clean, verdict } = comparison

  if (verdict.kind === 'computing') {
    return (
      <div className="grid gap-3" aria-busy="true">
        <p className="m-0 text-body text-muted">{verdict.detail}</p>
        {[0, 1, 2, 3].map((row) => (
          <Skeleton key={row} className="h-16" />
        ))}
      </div>
    )
  }

  if (!clean) {
    return <p className="m-0 text-body text-muted">{verdict.detail}</p>
  }

  const mine = side === 'A' ? 'a' : 'b'
  const rival = RIVAL[side]
  const rivalKey = mine === 'a' ? 'b' : 'a'
  const wins = verdict.kind === mine
  const groups = diffRows(comparison)
  const differing = (rows: DiffRowData[]) => rows.filter((row) => gapOf(row) >= MIN_GAP)
  const sections = ([['start', 'meta.compare.groupStart'], ['stuck', 'meta.compare.groupStuck']] as const)
    .map(([group, title]) => ({ group, title, rows: differing(groups[group]) }))
    .filter((section) => section.rows.length > 0)

  return (
    <div className="grid min-w-0 gap-5">
      <div className={cx('flex items-center gap-4 rounded-card border p-4', wins ? TONE.success.wash : TONE.neutral.wash)}>
        <ProgressRing value={clean.average[mine]} tone={wins ? 'success' : 'brand'} size={120} strokeWidth={12} label={t('meta.compare.goodOutOf100')} />
        <div className="grid min-w-0 justify-items-start gap-2">
          <span className="text-body font-semibold text-foreground">{t('meta.compare.goodOutOf100')}</span>
          <span className="flex flex-wrap items-center gap-2">
            {wins ? <BetterBadge /> : null}
            <DeltaChip mine={clean.average[mine]} other={clean.average[rivalKey]} rival={rival} />
          </span>
          <p className="m-0 text-micro text-soft">{t('meta.compare.cleanHint')}</p>
        </div>
      </div>

      <ul className="m-0 grid list-none grid-cols-2 gap-2 p-0">
        {TURNS.map((turn) => {
          const counts = clean[turn][side === 'A' ? 'countsA' : 'countsB']

          return (
            <li key={turn} className="flex min-w-0 items-center gap-3 rounded-card border border-border-subtle bg-card-background p-3">
              <ProgressRing value={clean[turn][mine]} tone={wins ? 'success' : 'brand'} size={56} label={`${t(TURN_LABEL[turn])}: ${t('meta.compare.goodOutOf100')}`} />
              <div className="grid min-w-0 justify-items-start gap-1">
                <span className="text-body font-semibold text-foreground">{t(TURN_LABEL[turn])}</span>
                {counts ? <span className="text-micro tabular-nums text-muted">{handsText(counts)}</span> : null}
                <DeltaChip mine={clean[turn][mine]} other={clean[turn][rivalKey]} rival={rival} />
              </div>
            </li>
          )
        })}
      </ul>

      {sections.length > 0 ? (
        <div className="grid gap-4">
          <span className="text-micro text-soft">{t('meta.compare.perHundred')}</span>
          {sections.map((section) => (
            <section key={section.group} className="grid gap-2" aria-label={t(section.title)}>
              <h4 className="m-0 text-micro font-semibold uppercase tracking-wider text-soft">{t(section.title)}</h4>
              <ul className="m-0 grid list-none gap-2 p-0">
                {section.rows.map((row) => (
                  <ResultCard key={row.key} row={row} side={side} />
                ))}
              </ul>
            </section>
          ))}
        </div>
      ) : (
        <div className="grid justify-items-center gap-1 py-6 text-center">
          <strong className="text-body font-semibold text-foreground">{t('meta.compare.noDiffsTitle')}</strong>
          <p className="m-0 text-body text-muted">{t('meta.compare.noDiffsBody')}</p>
        </div>
      )}
    </div>
  )
}

function BetterBadge() {
  return (
    <span className={cx('inline-flex items-center gap-1 rounded-full border px-2 text-micro font-semibold', TONE.success.tint, TONE.success.text)}>
      <Icon name="check" size={12} />
      {t('meta.compare.better')}
    </span>
  )
}

/** ▲/▼ con los puntos de diferencia contra el otro mazo; el color dice si es bueno (verde) o malo (rojo) para éste. Menos de medio punto es "igual". */
function DeltaChip({ mine, other, higherIsBetter = true, rival }: { mine: number | null; other: number | null; higherIsBetter?: boolean; rival: Side }) {
  if (mine === null || other === null) {
    return null
  }

  const diff = shown(mine) - shown(other)
  const chip = 'inline-flex items-center gap-1 rounded-full border px-2 text-micro font-semibold tabular-nums'

  if (Math.abs(diff) < MIN_GAP) {
    return (
      <span className={cx(chip, TONE.neutral.tint, TONE.neutral.text)}>
        <span aria-hidden="true">=</span>
        <span className="sr-only">{t('meta.compare.same', { side: rival })}</span>
      </span>
    )
  }

  const tone = TONE[diff > 0 === higherIsBetter ? 'success' : 'danger']
  const points = (Math.abs(diff) / 10).toFixed(1)

  return (
    <span className={cx(chip, tone.tint, tone.text)}>
      <span aria-hidden="true">
        {diff > 0 ? '▲' : '▼'} {points}
      </span>
      <span className="sr-only">{t(diff > 0 ? 'meta.compare.deltaMore' : 'meta.compare.deltaLess', { points, side: rival })}</span>
    </span>
  )
}

function ResultCard({ row, side }: { row: DiffRowData; side: Side }) {
  const mine = side === 'A' ? 'a' : 'b'
  const rivalKey = mine === 'a' ? 'b' : 'a'
  const wins = rowWinner(row) === side
  const lines = TURNS.flatMap((turn) => {
    const counts = row.counts[turn]?.[mine]

    return counts ? [{ turn, counts }] : []
  })
  const value = row[mine]

  return (
    <li className={cx('flex min-w-0 items-center gap-3 rounded-card border p-3', wins ? TONE.success.tint : 'border-border-subtle bg-card-background')}>
      {value === null ? null : <ProgressRing value={value} tone={wins ? 'success' : row.higherIsBetter ? 'brand' : 'warning'} size={64} label={row.label}>{per100(value)}</ProgressRing>}
      <div className="grid min-w-0 flex-1 gap-1">
        <span className="min-w-0">
          <span className="text-body font-semibold text-foreground">{row.label}</span>
          {row.tag ? <span className="ml-1.5 whitespace-nowrap text-micro text-soft">{row.tag}</span> : null}
        </span>
        {lines.map(({ turn, counts }) => (
          <span key={turn} className="text-micro tabular-nums text-soft">
            {t(TURN_LABEL[turn])}: <span className="text-foreground">{handsText(counts)}</span>
          </span>
        ))}
        {row.missingIn.includes(side) ? <span className="text-micro text-warning-soft">{t('meta.compare.missingHere')}</span> : null}
      </div>
      <div className="flex shrink-0 flex-wrap items-center justify-end gap-1.5">
        {wins ? <BetterBadge /> : null}
        <DeltaChip mine={row[mine]} other={row[rivalKey]} higherIsBetter={row.higherIsBetter} rival={RIVAL[side]} />
      </div>
    </li>
  )
}

import type { BuildComparison } from '../../app/build-comparison'
import { t } from '../../i18n'
import { cx } from '../ui/cx'
import { Icon } from '../ui/Icon'
import { Skeleton } from '../ui/Skeleton'
import { diffRows, gapOf, handsText, MIN_GAP, per100, rowWinner, TURN_LABEL, TURNS, type DiffRowData, type Side } from './comparison-rows'
import { SideBadge } from './SideBadge'

interface DeckResultsProps {
  side: Side
  comparison: BuildComparison
}

/**
 * Los resultados de un mazo, solos: cuántas manos buenas da "de cada 100" y, fila por fila, cuántas cumplen cada cosa, con las cantidades exactas
 * a la vista. Sólo van las filas donde los dos mazos difieren (lo que no cambia no se muestra: se están comparando); el ✓ marca dónde le gana al otro.
 * Las filas van en el mismo orden en los dos mazos para leerlas de lado a lado.
 */
export function DeckResults({ side, comparison }: DeckResultsProps) {
  const { clean, verdict } = comparison

  if (verdict.kind === 'computing') {
    return (
      <div className="grid gap-3" aria-busy="true">
        <p className="m-0 text-body text-muted">{verdict.detail}</p>
        {[0, 1, 2, 3].map((row) => (
          <Skeleton key={row} className="h-9" />
        ))}
      </div>
    )
  }

  if (!clean) {
    return <p className="m-0 text-body text-muted">{verdict.detail}</p>
  }

  const mine = side === 'A' ? 'a' : 'b'
  const wins = verdict.kind === mine
  const groups = diffRows(comparison)
  const differing = (rows: DiffRowData[]) => rows.filter((row) => gapOf(row) >= MIN_GAP)
  const sections = ([['start', 'meta.compare.groupStart'], ['stuck', 'meta.compare.groupStuck']] as const)
    .map(([group, title]) => ({ group, title, rows: differing(groups[group]) }))
    .filter((section) => section.rows.length > 0)

  return (
    <div className="grid min-w-0 gap-5">
      <div className="grid gap-2">
        <span className="flex items-baseline gap-2 tabular-nums">
          {wins ? (
            <>
              <Icon name="check" size={22} className="self-center text-success-soft" />
              <span className="sr-only">{t('meta.compare.better')}</span>
            </>
          ) : null}
          <strong className={cx('text-title font-bold', wins ? 'text-success-soft' : 'text-foreground')}>{Math.round(clean.average[mine] * 100)}</strong>
          <span className="text-body text-muted">{t('meta.compare.goodOutOf100')}</span>
        </span>
        <p className="m-0 text-micro text-soft">{t('meta.compare.cleanHint')}</p>
        <ul className="m-0 grid list-none gap-0.5 p-0 text-micro tabular-nums">
          {TURNS.map((turn) => {
            const counts = clean[turn][side === 'A' ? 'countsA' : 'countsB']

            return counts ? (
              <li key={turn} className="flex flex-wrap items-center gap-x-2">
                <span className="text-soft">{t(TURN_LABEL[turn])}:</span>
                <span className="text-foreground">{handsText(counts)}</span>
              </li>
            ) : null
          })}
        </ul>
      </div>

      {sections.length > 0 ? (
        <table className="w-full table-fixed border-collapse text-body tabular-nums">
          <caption className="sr-only">{t('meta.compare.tableCaption', { side })}</caption>
          <thead>
            <tr>
              <th scope="col" className="py-1.5 text-left text-micro font-normal text-soft">
                {t('meta.compare.perHundred')}
              </th>
              <th scope="col" className="w-[4.5rem] py-1.5 text-right font-normal">
                <SideBadge side={side} size="sm" />
              </th>
            </tr>
          </thead>
          {sections.map((section) => (
            <tbody key={section.group}>
              <tr>
                <th scope="rowgroup" colSpan={2} className="pb-1 pt-4 text-left text-micro font-normal text-soft">
                  {t(section.title)}
                </th>
              </tr>
              {section.rows.map((row) => (
                <ResultRow key={row.key} row={row} side={side} />
              ))}
            </tbody>
          ))}
        </table>
      ) : (
        <div className="grid justify-items-center gap-1 py-6 text-center">
          <strong className="text-body font-semibold text-foreground">{t('meta.compare.noDiffsTitle')}</strong>
          <p className="m-0 text-body text-muted">{t('meta.compare.noDiffsBody')}</p>
        </div>
      )}
    </div>
  )
}

function ResultRow({ row, side }: { row: DiffRowData; side: Side }) {
  const mine = side === 'A' ? 'a' : 'b'
  const wins = rowWinner(row) === side
  const lines = TURNS.flatMap((turn) => {
    const counts = row.counts[turn]?.[mine]

    return counts ? [{ turn, counts }] : []
  })

  return (
    <tr className="border-t border-border-subtle">
      <th scope="row" className="py-2.5 pr-3 text-left font-normal">
        <span className="block min-w-0">
          <span className="text-foreground">{row.label}</span>
          {row.tag ? <span className="ml-1.5 whitespace-nowrap text-micro text-soft">{row.tag}</span> : null}
        </span>
        {lines.length > 0 ? (
          <span className="mt-0.5 flex flex-wrap gap-x-4 gap-y-0.5 text-micro text-soft">
            {lines.map(({ turn, counts }) => (
              <span key={turn}>
                {t(TURN_LABEL[turn])}: <span className="text-foreground">{handsText(counts)}</span>
              </span>
            ))}
          </span>
        ) : null}
        {row.missingIn.includes(side) ? <span className="mt-0.5 block text-micro text-warning-soft">{t('meta.compare.missingHere')}</span> : null}
      </th>
      <td className={cx('py-2.5 text-right align-top', wins ? 'font-bold text-success-soft' : 'text-muted')}>
        {wins ? <Icon name="check" size={14} className="mr-1 inline-block align-[-2px]" /> : null}
        {per100(row[mine])}
        {wins ? <span className="sr-only"> {t('meta.compare.better')}</span> : null}
      </td>
    </tr>
  )
}

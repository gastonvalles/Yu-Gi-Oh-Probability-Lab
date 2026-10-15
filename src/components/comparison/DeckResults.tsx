import { useId, useState } from 'react'

import type { BuildComparison } from '../../app/build-comparison'
import { t } from '../../i18n'
import { Button } from '../ui/Button'
import { cx } from '../ui/cx'
import { Icon } from '../ui/Icon'
import { Skeleton } from '../ui/Skeleton'
import { Switch } from '../ui/Switch'
import { diffRows, gapOf, handsText, MIN_GAP, per100, rowWinner, TURN_LABEL, TURNS, type DiffRowData, type Side } from './comparison-rows'
import { SideBadge } from './SideBadge'

interface DeckResultsProps {
  side: Side
  comparison: BuildComparison
  /** El filtro es de los dos mazos: al moverlo en uno se mueve en el otro, y las filas quedan alineadas lado a lado. */
  onlyDiffs: boolean
  onOnlyDiffsChange: (value: boolean) => void
}

/**
 * Los resultados de un mazo, solos: cuántas manos buenas da "de cada 100" y, fila por fila, cuántas cumplen cada cosa.
 * El ✓ marca dónde le gana al otro mazo; las filas van en el mismo orden en los dos para leerlas de lado a lado.
 */
export function DeckResults({ side, comparison, onlyDiffs, onOnlyDiffsChange }: DeckResultsProps) {
  const [open, setOpen] = useState<ReadonlySet<string>>(new Set())
  const baseId = useId()
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
  const total = groups.start.length + groups.stuck.length
  const differing = [...groups.start, ...groups.stuck].filter((row) => gapOf(row) >= MIN_GAP).length
  const visible = (rows: DiffRowData[]) => (onlyDiffs ? rows.filter((row) => gapOf(row) >= MIN_GAP) : rows)
  const sections = ([['start', 'meta.compare.groupStart'], ['stuck', 'meta.compare.groupStuck']] as const)
    .map(([group, title]) => ({ group, title, rows: visible(groups[group]) }))
    .filter((section) => section.rows.length > 0)
  const toggle = (key: string) =>
    setOpen((current) => {
      const next = new Set(current)

      if (!next.delete(key)) {
        next.add(key)
      }

      return next
    })

  return (
    <div className="grid min-w-0 gap-4">
      <div className="grid gap-1">
        <span className="flex items-baseline gap-2 tabular-nums">
          {wins ? (
            <>
              <Icon name="check" size={20} className="self-center text-success-soft" />
              <span className="sr-only">{t('meta.compare.better')}</span>
            </>
          ) : null}
          <strong className={cx('text-title font-bold', wins ? 'text-success-soft' : 'text-foreground')}>{Math.round(clean.average[mine] * 100)}</strong>
          <span className="text-body text-muted">{t('meta.compare.goodOutOf100')}</span>
        </span>
        <p className="m-0 text-micro text-soft">{t('meta.compare.cleanHint')}</p>
      </div>

      <details className="group">
        <summary className="flex cursor-pointer list-none items-center gap-1.5 rounded-control text-micro font-semibold text-muted focus-visible:outline-none focus-visible:shadow-focus [&::-webkit-details-marker]:hidden">
          {t('meta.compare.seeHands')}
          <Icon name="chevron-down" size={14} className="text-soft transition-transform duration-200 group-open:rotate-180" />
        </summary>
        <ul className="m-0 mt-2 grid list-none gap-1 p-0 text-micro tabular-nums">
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
      </details>

      {total > 0 ? (
        <label className="flex items-center justify-between gap-3 border-t border-border-subtle pt-3 text-body text-muted">
          <span className="tabular-nums">{t('meta.compare.onlyDiffs', { shown: differing, total })}</span>
          <Switch checked={onlyDiffs} onChange={onOnlyDiffsChange} label={t('meta.compare.onlyDiffsLabel')} />
        </label>
      ) : null}

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
                <ResultRow key={row.key} row={row} side={side} open={open.has(row.key)} onToggle={() => toggle(row.key)} detailId={`${baseId}-${row.key}`} />
              ))}
            </tbody>
          ))}
        </table>
      ) : total > 0 ? (
        <div className="grid justify-items-center gap-2 py-4 text-center">
          <strong className="text-body font-semibold text-foreground">{t('meta.compare.noDiffsTitle')}</strong>
          <p className="m-0 text-body text-muted">{t('meta.compare.noDiffsBody')}</p>
          <Button variant="secondary" size="sm" onClick={() => onOnlyDiffsChange(false)}>
            {t('meta.compare.showAllRows')}
          </Button>
        </div>
      ) : null}
    </div>
  )
}

function ResultRow({ row, side, open, onToggle, detailId }: { row: DiffRowData; side: Side; open: boolean; onToggle: () => void; detailId: string }) {
  const mine = side === 'A' ? 'a' : 'b'
  const wins = rowWinner(row) === side
  const lines = TURNS.flatMap((turn) => {
    const counts = row.counts[turn]?.[mine]

    return counts ? [{ turn, counts }] : []
  })
  const label = (
    <>
      <span className="min-w-0 text-foreground">{row.label}</span>
      {row.tag ? <span className="ml-1.5 whitespace-nowrap text-micro text-soft">{row.tag}</span> : null}
    </>
  )

  return (
    <>
      <tr className="border-t border-border-subtle transition-colors hover:bg-tint/5">
        <th scope="row" className="py-2.5 pr-2 text-left font-normal">
          {lines.length > 0 ? (
            <button
              type="button"
              aria-expanded={open}
              aria-controls={detailId}
              onClick={onToggle}
              className="flex w-full items-start gap-1.5 rounded-control text-left focus-visible:outline-none focus-visible:shadow-focus"
            >
              <span className="min-w-0 flex-1">{label}</span>
              <Icon name="chevron-down" size={14} className={cx('mt-1 shrink-0 text-soft transition-transform duration-200', open && 'rotate-180')} />
            </button>
          ) : (
            <span>{label}</span>
          )}
          {row.missingIn.includes(side) ? <span className="mt-0.5 block text-micro text-warning-soft">{t('meta.compare.missingHere')}</span> : null}
        </th>
        <td className={cx('py-2.5 text-right align-top', wins ? 'font-bold text-success-soft' : 'text-muted')}>
          {wins ? <Icon name="check" size={14} className="mr-1 inline-block align-[-2px]" /> : null}
          {per100(row[mine])}
          {wins ? <span className="sr-only"> {t('meta.compare.better')}</span> : null}
        </td>
      </tr>
      {open ? (
        <tr id={detailId}>
          <td colSpan={2} className="pb-3">
            <ul className="m-0 grid list-none gap-1 p-0 text-micro text-soft">
              {lines.map(({ turn, counts }) => (
                <li key={turn} className="flex flex-wrap items-center gap-x-2">
                  <span>{t(TURN_LABEL[turn])}:</span>
                  <span className="text-foreground">{handsText(counts)}</span>
                </li>
              ))}
            </ul>
          </td>
        </tr>
      ) : null}
    </>
  )
}

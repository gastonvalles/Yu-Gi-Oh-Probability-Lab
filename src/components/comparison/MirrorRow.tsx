import { useId, useState } from 'react'

import type { MeasureKey, Mover } from '../../app/change-effects'
import { formatInteger } from '../../app/utils'
import { t } from '../../i18n'
import type { TurnView } from '../../types'
import { Badge } from '../ui/Badge'
import { Card } from '../ui/Card'
import { cx } from '../ui/cx'
import { Icon } from '../ui/Icon'
import { Skeleton } from '../ui/Skeleton'
import { overline } from '../ui/typography'
import { joinList } from './build-sources'
import { ChangeLine } from './ChangeList'
import { deltaPoints, per100, per100Exact, TURN_LABEL, TURNS, winnerOf, type MirrorGroups, type MirrorRowData, type Side } from './comparison-rows'
import { SideBadge } from './SideBadge'

/** Lo que mueve una medida: los cambios ya medidos, del que más al que menos. `loading` mientras falta medir alguno; `pending` si hay cambios sin clasificar. */
export interface MoversInfo {
  status: 'loading' | 'ready' | 'pending'
  movers: Mover[]
}

export type MoversOf = (measure: MeasureKey) => MoversInfo

/** El ▲/▼ en palabras, para el lector de pantalla: «7 menos con B», «igual en las dos». */
export function deltaWords(points: number | null): string {
  if (points === null) return t('meta.compare.chip.na')
  if (points === 0) return t('meta.compare.chip.same')

  return t(points > 0 ? 'meta.compare.chip.more' : 'meta.compare.chip.less', { points: Math.abs(points) })
}

/** El ▲/▼ de B contra A, en puntos «de cada 100»: verde si a B le conviene, rojo si no (en lo que traba, menos es mejor); «=» si no es una diferencia. */
function DeltaBadge({ points, higherIsBetter }: { points: number | null; higherIsBetter: boolean }) {
  const tone = !points ? 'neutral' : points > 0 === higherIsBetter ? 'success' : 'danger'

  return (
    <Badge tone={tone} size="sm" className="tabular-nums">
      <span aria-hidden="true">{points === null ? '—' : points === 0 ? '=' : `${points > 0 ? '▲' : '▼'} ${Math.abs(points)}`}</span>
      <span className="sr-only">{deltaWords(points)}</span>
    </Badge>
  )
}

/** Lo que una medida le suma o le resta a B con un cambio solo: entero, y «<1» si no llega a uno (lo que no la mueve ni eso ya no está en la lista). */
function MoverDelta({ delta, higherIsBetter }: { delta: number; higherIsBetter: boolean }) {
  const whole = Math.round(Math.abs(delta) * 100)
  const good = delta > 0 === higherIsBetter

  return (
    <Badge tone={good ? 'success' : 'danger'} size="sm" className="tabular-nums">
      <span aria-hidden="true">
        {delta > 0 ? '▲' : '▼'} {whole === 0 ? '<1' : whole}
      </span>
      <span className="sr-only">{t(delta > 0 ? 'meta.compare.chip.moverMore' : 'meta.compare.chip.moverLess', { points: whole === 0 ? '<1' : String(whole) })}</span>
    </Badge>
  )
}

const valueStyle = (side: Side, winner: Side | null) =>
  cx('text-lead tabular-nums', side === 'A' ? 'text-left' : 'text-right', winner === null ? 'font-semibold text-foreground' : winner === side ? 'font-bold text-foreground' : 'font-medium text-muted')

const DOT = { danger: 'bg-danger-soft', warning: 'bg-warning' } as const

interface MirrorRowProps {
  row: MirrorRowData
  view: TurnView
  moversOf: MoversOf
  /** El punto de color de la fila (sin salida rojo, con problema ámbar: los colores de su tramo en el anillo). */
  dot?: keyof typeof DOT
  /** Arranca abierta (la muestra de `/playground`). */
  defaultOpen?: boolean
}

/**
 * Una fila espejo: `A | medida ▲/▼ | B`, el mejor en blanco y el otro atenuado. Se toca y se abre: «Qué lo mueve» (los cambios que la mueven, con lo que
 * mueve cada uno solo) y las cuentas exactas de manos de cada turno. Abrir una fila no cuesta otro cálculo (todo sale de las mismas medidas).
 */
export function MirrorRow({ row, view, moversOf, dot, defaultOpen = false }: MirrorRowProps) {
  const [open, setOpen] = useState(defaultOpen)
  const panelId = useId()
  const pair = row.values[view]
  const points = deltaPoints(pair)
  const winner = winnerOf(pair, row.higherIsBetter)
  const label = row.tag ? `${row.label} (${row.tag})` : row.label

  return (
    <div className="border-t border-border-subtle first:border-t-0">
      <button
        type="button"
        aria-expanded={open}
        aria-controls={panelId}
        aria-label={t('meta.compare.row.aria', { label, a: per100Exact(pair.a), b: per100Exact(pair.b), delta: deltaWords(points) })}
        className="grid min-h-14 w-full cursor-pointer grid-cols-[3rem_minmax(0,1fr)_3rem] items-center gap-2 rounded-control border-0 bg-transparent px-1 py-2 text-left transition-colors duration-150 hover:bg-tint/7 focus-visible:outline-none focus-visible:shadow-focus motion-reduce:transition-none"
        onClick={() => setOpen(!open)}
      >
        <span className={valueStyle('A', winner)}>{per100(pair.a)}</span>
        <span className="grid justify-items-center gap-1 text-center">
          {/* El punto, el nombre y la etiqueta van en el mismo renglón de texto: si el nombre es largo, la etiqueta lo sigue y no se va a un costado. */}
          <span className="min-w-0 text-body font-semibold text-foreground [overflow-wrap:anywhere]">
            {dot ? <span aria-hidden="true" className={cx('mr-1.5 inline-block size-2 rounded-full align-middle', DOT[dot])} /> : null}
            {row.label}
            {row.tag ? <span className="ml-1.5 whitespace-nowrap text-micro font-normal text-soft">{row.tag}</span> : null}
          </span>
          <span className="flex items-center gap-1">
            <DeltaBadge points={points} higherIsBetter={row.higherIsBetter} />
            <Icon name="chevron-down" size={14} className={cx('text-soft transition-transform duration-200 motion-reduce:transition-none', open && 'rotate-180')} />
          </span>
        </span>
        <span className={valueStyle('B', winner)}>{per100(pair.b)}</span>
      </button>

      {open ? <RowDetail id={panelId} row={row} view={view} moversOf={moversOf} /> : null}
    </div>
  )
}

/** Lo que se ve con la fila abierta: qué la mueve y, en espejo, cuántas manos de cuántas en cada turno. */
function RowDetail({ id, row, view, moversOf }: { id: string; row: MirrorRowData; view: TurnView; moversOf: MoversOf }) {
  const { status, movers } = moversOf(row.measure)
  const counts = TURNS.flatMap((turn) => {
    const { a, b } = row.counts[turn]

    return a || b ? [{ turn, a, b }] : []
  })

  return (
    <div id={id} className="grid gap-3 px-1 pb-3 motion-safe:animate-step-in">
      <div className="grid gap-1" aria-busy={status === 'loading'}>
        <p className={cx(overline, 'm-0 text-center')}>{t('meta.compare.row.movers')}</p>
        {movers.length > 0 ? (
          <ul className="m-0 grid list-none p-0">
            {movers.map((mover) => (
              <li key={mover.change.key}>
                <ChangeLine change={mover.change}>
                  <MoverDelta delta={mover.delta} higherIsBetter={row.higherIsBetter} />
                </ChangeLine>
              </li>
            ))}
          </ul>
        ) : null}
        {status === 'loading' ? <Skeleton className="h-14 w-full" /> : null}
        {status !== 'loading' && movers.length === 0 ? (
          <p className="m-0 text-center text-micro text-muted">{t(status === 'pending' ? 'meta.compare.row.moversPending' : view === 'average' ? 'meta.compare.row.noMovers' : 'meta.compare.row.noMoversTurn')}</p>
        ) : null}
      </div>

      {row.missingIn.map((side) => (
        <p key={side} className="m-0 text-center text-micro text-warning-soft">
          {t('meta.compare.row.missingIn', { side })}
        </p>
      ))}

      {counts.length > 0 ? (
        <div className="grid gap-1 border-t border-border-subtle pt-2 text-micro tabular-nums">
          {counts.map(({ turn, a, b }) => {
            const sameTotal = a !== null && b !== null && a.total === b.total

            return (
              <p key={turn} className="m-0 grid grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-baseline gap-2">
                <span className="text-left font-semibold text-foreground">
                  {a ? formatInteger(a.hands) : '—'}
                  {a && !sameTotal ? <span className="block font-normal text-soft">{t('meta.compare.row.ofTotal', { total: formatInteger(a.total) })}</span> : null}
                </span>
                <span className="text-center text-muted">
                  {sameTotal ? t('meta.compare.row.turnOf', { turn: t(TURN_LABEL[turn]), total: formatInteger(a.total) }) : t(TURN_LABEL[turn])}
                </span>
                <span className="text-right font-semibold text-foreground">
                  {b ? formatInteger(b.hands) : '—'}
                  {b && !sameTotal ? <span className="block font-normal text-soft">{t('meta.compare.row.ofTotal', { total: formatInteger(b.total) })}</span> : null}
                </span>
              </p>
            )
          })}
        </div>
      ) : null}
    </div>
  )
}

const GROUPS = [
  { key: 'problems', title: 'meta.compare.group.problems' },
  { key: 'rules', title: 'meta.compare.group.rules' },
  { key: 'roles', title: 'meta.compare.group.roles' },
] as const satisfies ReadonlyArray<{ key: Exclude<keyof MirrorGroups, 'same'>; title: string }>

/** Lo que da igual en las dos, en una sola fila plegada («Igual en las dos: …»); se abre y muestra esas filas. */
function SameRows({ rows, view, moversOf }: { rows: MirrorRowData[]; view: TurnView; moversOf: MoversOf }) {
  const [open, setOpen] = useState(false)
  const panelId = useId()

  return (
    <div className="border-t border-border-subtle">
      <button
        type="button"
        aria-expanded={open}
        aria-controls={panelId}
        className="flex min-h-11 w-full cursor-pointer items-center justify-center gap-2 rounded-control border-0 bg-transparent px-1 py-2 text-center text-micro text-muted transition-colors duration-150 hover:bg-tint/7 focus-visible:outline-none focus-visible:shadow-focus motion-reduce:transition-none"
        onClick={() => setOpen(!open)}
      >
        <span aria-hidden="true" className="grid size-5 shrink-0 place-items-center rounded-full bg-tint/10 font-bold text-foreground">
          =
        </span>
        <span>{t('meta.compare.sameRows', { names: joinList(rows.map((row) => row.label)) })}</span>
        <Icon name="chevron-down" size={14} className={cx('shrink-0 text-soft transition-transform duration-200 motion-reduce:transition-none', open && 'rotate-180')} />
      </button>
      {open ? (
        <div id={panelId} className="motion-safe:animate-step-in">
          {rows.map((row) => (
            <MirrorRow key={row.key} row={row} view={view} moversOf={moversOf} />
          ))}
        </div>
      ) : null}
    </div>
  )
}

interface MirrorRowsCardProps {
  groups: MirrorGroups | null
  view: TurnView
  moversOf: MoversOf
}

/** Las filas espejo de las reglas y los roles, en grupos con un rótulo chico; lo que no cambia, plegado al final. Sin resultados todavía, su esqueleto. */
export function MirrorRowsCard({ groups, view, moversOf }: MirrorRowsCardProps) {
  const busy = groups === null

  if (groups && GROUPS.every(({ key }) => groups[key].length === 0) && groups.same.length === 0) {
    return null
  }

  return (
    <Card className="grid content-start gap-2" aria-label={t('meta.compare.groups.label')} aria-busy={busy}>
      <div className="grid grid-cols-[3rem_minmax(0,1fr)_3rem] items-center gap-2 px-1" aria-hidden="true">
        <SideBadge side="A" size="sm" />
        <span className="text-center text-micro text-soft">{t('meta.compare.perHundredHeader')}</span>
        <span className="justify-self-end">
          <SideBadge side="B" size="sm" />
        </span>
      </div>

      {busy
        ? [0, 1, 2].map((index) => <Skeleton key={index} className="h-14 w-full" />)
        : GROUPS.map(({ key, title }) =>
            groups[key].length > 0 ? (
              <section key={key} className="grid" aria-label={t(title)}>
                <p aria-hidden="true" className={cx(overline, 'm-0 border-t border-border-subtle pb-1 pt-3 text-center')}>
                  {t(title)}
                </p>
                {groups[key].map((row) => (
                  <MirrorRow key={row.key} row={row} view={view} moversOf={moversOf} />
                ))}
              </section>
            ) : null,
          )}

      {groups && groups.same.length > 0 ? <SameRows rows={groups.same} view={view} moversOf={moversOf} /> : null}
    </Card>
  )
}

import { useId, useState, type ReactNode } from 'react'

import { MAX_MEASURED_CHANGES, type ChangeEffectResult } from '../../app/change-effects'
import type { DeckChanges, MainChange, MainChangeSide } from '../../app/change-pairs'
import { formatInteger } from '../../app/utils'
import { t } from '../../i18n'
import type { TurnView } from '../../types'
import { CardArt } from '../CardArt'
import { Button } from '../ui/Button'
import { Card } from '../ui/Card'
import { CopiesBadge } from '../ui/CopiesBadge'
import { cx } from '../ui/cx'
import { Icon } from '../ui/Icon'
import { SectionHeader } from '../ui/SectionHeader'
import { Skeleton } from '../ui/Skeleton'
import { describeChange, describeZones } from './build-sources'
import { deltaPoints, type Side } from './comparison-rows'

/** Hasta acá se ven los cambios de una; los demás, a un toque (comparar con un deck muy distinto daría una lista de 40). */
const SHOWN_CHANGES = MAX_MEASURED_CHANGES

/** La carta de un lado del cambio, recta y con el marco de su build (A lila, B ámbar); sin carta, el lugar vacío. */
function ChangeThumb({ side, copies, build }: { side: MainChangeSide | null; copies: number; build: Side }) {
  if (!side) {
    return <span aria-hidden="true" className="block aspect-[421/614] w-9 shrink-0 border border-dashed border-border" />
  }

  return (
    <span aria-hidden="true" className={cx('relative block aspect-[421/614] w-9 shrink-0 border-2', build === 'A' ? 'border-primary-soft' : 'border-info')}>
      <CardArt tilt remoteUrl={side.card.apiCard.imageUrlSmall ?? side.card.apiCard.imageUrl} name={side.card.name} className="block h-full w-full object-cover" />
      {copies > 1 ? <CopiesBadge copies={copies} placement="overlay" /> : null}
    </span>
  )
}

/** Una línea de cambio: la que sale (A) → la que entra (B), qué es y, al final, lo que se le pase (su efecto en «Qué cambiaste», lo que mueve en una fila). */
export function ChangeLine({ change, children }: { change: MainChange; children?: ReactNode }) {
  const { title, facts } = describeChange(change)

  return (
    <div className="grid min-h-14 grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-3 py-2">
      <span className="flex items-center gap-1">
        <ChangeThumb side={change.out} copies={change.copies} build="A" />
        <Icon name="arrow-right" size={12} className="shrink-0 text-soft" />
        <ChangeThumb side={change.in} copies={change.copies} build="B" />
      </span>
      <span className="grid min-w-0 gap-0.5">
        <strong className="text-body font-semibold text-foreground [overflow-wrap:anywhere]">
          {title}
          {/* La cantidad se ve en las cartas (×2); para el lector de pantalla va acá. */}
          {change.copies > 1 ? <span className="sr-only"> ({t('meta.compare.change.copies', { count: change.copies, n: formatInteger(change.copies) })})</span> : null}
        </strong>
        <span className="text-micro text-muted">{facts.join(' · ')}</span>
      </span>
      {children}
    </div>
  )
}

/** El efecto de un cambio solo en las manos buenas: ▲3 / ▼2 / «=», «?» si falta clasificar, «—» si no se midió y un esqueleto mientras se mide. */
function ChangeEffect({ result, view }: { result: ChangeEffectResult | undefined; view: TurnView }) {
  const box = 'grid min-w-10 justify-items-end text-lead font-bold tabular-nums'

  if (!result || result.status === 'loading') {
    return (
      <span className={box} aria-busy="true">
        <Skeleton className="h-6 w-9" />
        <span className="sr-only">{t('meta.compare.effect.loading')}</span>
      </span>
    )
  }

  if (result.status !== 'done') {
    const pending = result.status === 'pending'
    const label =
      result.status === 'skipped' ? t('meta.compare.effect.skipped', { max: MAX_MEASURED_CHANGES }) : t(pending ? 'meta.compare.effect.pending' : 'meta.compare.effect.blocked')

    return (
      <span className={cx(box, pending ? 'text-warning-soft' : 'text-soft')} title={label}>
        <span aria-hidden="true">{pending ? '?' : '—'}</span>
        <span className="sr-only">{label}</span>
      </span>
    )
  }

  const points = deltaPoints({ a: 0, b: result.effect.delta.clean?.[view] ?? null })

  if (!points) {
    return (
      <span className={cx(box, 'text-muted')}>
        <span aria-hidden="true">=</span>
        <span className="sr-only">{t('meta.compare.effect.same')}</span>
      </span>
    )
  }

  return (
    <span className={cx(box, points > 0 ? 'text-success-soft' : 'text-danger-soft')}>
      <span aria-hidden="true">
        {points > 0 ? '▲' : '▼'}
        {Math.abs(points)}
      </span>
      <span className="sr-only">{t(points > 0 ? 'meta.compare.effect.more' : 'meta.compare.effect.less', { points: Math.abs(points) })}</span>
    </span>
  )
}

interface ChangeListProps {
  changes: DeckChanges
  results: Readonly<Record<string, ChangeEffectResult>>
  view: TurnView
  onOpenLists: () => void
  className?: string
}

/** «Qué cambiaste»: los cambios del Main de a pares (sale → entra), cada uno con lo que mueve solo; el Extra y el Side en una línea; y las dos listas a un toque. */
export function ChangeList({ changes, results, view, onOpenLists, className }: ChangeListProps) {
  const [showAll, setShowAll] = useState(false)
  const titleId = useId()
  const shown = showAll ? changes.main : changes.main.slice(0, SHOWN_CHANGES)
  const hidden = changes.main.length - SHOWN_CHANGES
  const anyPending = changes.main.some((change) => change.pending)

  return (
    <Card className={cx('grid content-start gap-3', className)} aria-labelledby={titleId}>
      <SectionHeader
        icon="swap"
        title={<span id={titleId}>{t('meta.compare.changes.title')}</span>}
        description={t(anyPending ? 'meta.compare.changes.subtitlePending' : 'meta.compare.changes.subtitle')}
      />

      {changes.main.length > 0 ? (
        <ul className="m-0 grid list-none divide-y divide-border-subtle p-0">
          {shown.map((change) => (
            <li key={change.key}>
              <ChangeLine change={change}>
                <ChangeEffect result={results[change.key]} view={view} />
              </ChangeLine>
            </li>
          ))}
        </ul>
      ) : (
        <p className="m-0 text-body text-muted">{t('meta.compare.changes.sameMain')}</p>
      )}

      {hidden > 0 ? (
        <Button variant="tertiary" size="sm" className="justify-self-start" iconEnd={showAll ? 'chevron-up' : 'chevron-down'} aria-expanded={showAll} onClick={() => setShowAll(!showAll)}>
          {showAll ? t('meta.compare.changes.fewer') : t('meta.compare.changes.more', { count: hidden, n: formatInteger(hidden) })}
        </Button>
      ) : null}

      <div className="grid gap-3 border-t border-border-subtle pt-3">
        <p className="m-0 text-micro text-muted">{describeZones(changes)}</p>
        <Button variant="outline" size="md" icon="columns" className="justify-self-start" onClick={onOpenLists}>
          {t('meta.compare.lists.open')}
        </Button>
      </div>
    </Card>
  )
}

import { useId, type ReactNode } from 'react'

import type { BuildComparison, BuildMetrics } from '../../app/build-comparison'
import { formatInteger } from '../../app/utils'
import { t } from '../../i18n'
import type { TurnView } from '../../types'
import { Button } from '../ui/Button'
import { Callout } from '../ui/Callout'
import { Card } from '../ui/Card'
import { cx } from '../ui/cx'
import { Heading } from '../ui/Heading'
import { Icon } from '../ui/Icon'
import { IconButton } from '../ui/IconButton'
import { InfoTip } from '../ui/InfoTip'
import { ProgressRing } from '../ui/ProgressRing'
import { formatPer100 } from '../ui/ring-shared'
import { SegmentedRing } from '../ui/SegmentedRing'
import { Segmented, type SegmentedOption } from '../ui/Segmented'
import { Skeleton } from '../ui/Skeleton'
import { RING_ARC } from '../ui/tone'
import { deltaPoints, handsText, per100Exact, TURN_LABEL, TURNS, VIEWS, verdictRows, type Pair, type Side } from './comparison-rows'
import { deltaWords, MirrorRow, type MoversOf } from './MirrorRow'
import { SideBadge } from './SideBadge'

/** Las cartas que falta clasificar de una build (sin eso no se sabe si arrancan o traban). */
export interface PendingInfo {
  side: Side
  count: number
  /** Las primeras, por su nombre («Bystial Druiswurm y Called by the Grave», «…, y 4 más»). */
  names: string
}

const LENS_LABEL = { average: 'meta.compare.lens.average', first: 'meta.compare.rowFirst', second: 'meta.compare.rowSecond' } as const

/** Las manos buenas de las dos builds en una vista (lo que dibujan los anillos y dice el número de la acción). */
export const cleanPair = (comparison: BuildComparison, view: TurnView): Pair =>
  comparison.clean ? { a: comparison.clean[view].a, b: comparison.clean[view].b } : { a: null, b: null }

const deltaText = (points: number | null) => (points === null ? '—' : points === 0 ? '=' : `${points > 0 ? '▲' : '▼'}${Math.abs(points)}`)

/**
 * El anillo de reparto de una build (buenas / con problema / sin salida; el centro es el tramo bueno) con su insignia A o B. Mientras se mide, su esqueleto;
 * si no se puede medir (falta clasificar), «sin medir». Crece con la tarjeta (`@container`): 104 px en una columna angosta, 160 desde 30 rem.
 */
function BuildRing({ side, build, view, computing }: { side: Side; build: BuildMetrics; view: TurnView; computing: boolean }) {
  const results = build.results?.[view]

  return (
    <div className="relative size-26 justify-self-center @min-[30rem]:size-40">
      {computing ? (
        <Skeleton radius="chip" className="size-full" />
      ) : results ? (
        <SegmentedRing
          fluid
          size={160}
          strokeWidth={14}
          format={formatPer100}
          label={t('meta.compare.ring', {
            side,
            clean: per100Exact(results.cleanProbability),
            problem: per100Exact(results.withProblemProbability),
            none: per100Exact(results.noOpeningProbability),
          })}
          segments={[
            { key: 'clean', value: results.cleanProbability, color: RING_ARC.success },
            { key: 'withProblem', value: results.withProblemProbability, color: RING_ARC.warning },
            { key: 'noOpening', value: results.noOpeningProbability, color: RING_ARC.danger },
          ]}
        />
      ) : (
        // ponytail: `ProgressRing` no tiene `fluid`; se dibuja a 160 y se estira a su caja con `!` (le gana al tamaño en línea). Cuando lo tenga, sacar esto.
        <div className="size-full [&>div]:size-full! [&_svg]:size-full">
          <ProgressRing value={0} unmeasured size={160} strokeWidth={14} label={t('meta.compare.ringUnmeasured', { side })} />
        </div>
      )}
      <span className="absolute -left-1 -top-1">
        <SideBadge side={side} />
      </span>
    </div>
  )
}

/** La ficha ⓘ: cómo leer los números y, con su decimal, las manos buenas exactas de cada build en cada turno (la letra chica no va en la tarjeta). */
function VerdictInfo({ comparison }: { comparison: BuildComparison }) {
  const { clean } = comparison

  return (
    <InfoTip label={t('meta.compare.info')}>
      <span>{t('meta.compare.cleanHint')}</span>
      {clean
        ? (['A', 'B'] as const).map((side) => {
            const key = side === 'A' ? 'a' : 'b'

            return (
              <span key={side} className="grid">
                <strong>{t('meta.compare.build', { side })}</strong>
                {TURNS.map((turn) => {
                  const counts = clean[turn][side === 'A' ? 'countsA' : 'countsB']

                  return (
                    <span key={turn} className="tabular-nums">
                      {t('meta.compare.infoTurn', { turn: t(TURN_LABEL[turn]), value: per100Exact(clean[turn][key]), hands: counts ? handsText(counts) : '—' })}
                    </span>
                  )
                })}
              </span>
            )
          })
        : null}
    </InfoTip>
  )
}

interface VerdictCardProps {
  comparison: BuildComparison
  view: TurnView
  onViewChange: (view: TurnView) => void
  handSize: number
  moversOf: MoversOf
  pending: PendingInfo | null
  /** El botón «Clasificar N cartas» dentro del aviso (en escritorio; en el celular va en la barra de abajo). */
  classifyButton?: ReactNode
  /** Lo que cierra la tarjeta: en escritorio, el número con la acción; en el celular, «Guardar B» si B es el borrador. */
  footer?: ReactNode
}

/**
 * La respuesta: quién abre mejor, los dos anillos de reparto, sin salida y con problema en filas espejo, y la lente (Promedio / Yendo 1º / Yendo 2º) que
 * cambia todos los números sin mover nada. Usa el veredicto de `compareBuilds` (sus umbrales), no uno propio.
 */
export function VerdictCard({ comparison, view, onViewChange, handSize, moversOf, pending, classifyButton, footer }: VerdictCardProps) {
  const titleId = useId()
  const { verdict } = comparison
  const computing = verdict.kind === 'computing'
  const blocked = verdict.kind === 'incomplete' && !pending
  const reasons = (['A', 'B'] as const).flatMap((side) => (side === 'A' ? comparison.a : comparison.b).blockedReasons.map((reason) => ({ side, reason })))
  const lens: SegmentedOption<TurnView>[] = VIEWS.map((option) => {
    const active = option === view
    const points = deltaPoints(cleanPair(comparison, option))
    const hands =
      option === 'average'
        ? t('meta.compare.lens.averageHands', { first: formatInteger(handSize), second: formatInteger(handSize + 1) })
        : t('meta.compare.lens.hands', { n: formatInteger(option === 'first' ? handSize : handSize + 1) })

    return {
      value: option,
      label: t(LENS_LABEL[option]),
      // La elegida no repite su número (lo dice la acción, abajo): dice qué mano mira.
      detail: active ? hands : deltaText(points),
      ...(active ? {} : { detailTone: points ? (points > 0 ? ('success' as const) : ('danger' as const)) : undefined, detailLabel: deltaWords(points) }),
    }
  })

  return (
    <Card level="hero" className="@container grid content-start gap-4" aria-labelledby={titleId} aria-busy={computing}>
      <header className="flex items-start justify-between gap-3">
        <span className="flex min-w-0 items-center gap-2.5">
          {pending ? (
            <Icon name="alert" size={24} className="shrink-0 text-warning-soft" />
          ) : verdict.kind === 'a' || verdict.kind === 'b' ? (
            <SideBadge side={verdict.kind === 'a' ? 'A' : 'B'} />
          ) : (
            <Icon name={verdict.kind === 'split' ? 'swap' : 'columns'} size={24} className="shrink-0 text-foreground" />
          )}
          <Heading level="section" id={titleId}>
            {pending
              ? t('meta.compare.verdict.pending', { count: pending.count, n: formatInteger(pending.count), side: pending.side })
              : computing
                ? t('meta.compare.verdict.measuring')
                : verdict.kind === 'a' || verdict.kind === 'b'
                  ? t('meta.compare.verdict.wins', { side: verdict.kind === 'a' ? 'A' : 'B' })
                  : verdict.kind === 'split'
                    ? t('meta.compare.verdict.split.title')
                    : blocked
                      ? t('meta.compare.verdict.incomplete.title')
                      : t('meta.compare.verdict.even')}
          </Heading>
        </span>
        <VerdictInfo comparison={comparison} />
      </header>

      {verdict.kind === 'split' && comparison.clean ? (
        <p className="-mt-2 text-body text-muted">
          {t('meta.compare.verdict.splitDetail', { first: comparison.clean.first.delta > 0 ? 'B' : 'A', second: comparison.clean.second.delta > 0 ? 'B' : 'A' })}
        </p>
      ) : null}

      {/* En una tarjeta angosta (320–360 px) los dos anillos no dejan lugar a «manos buenas de cada 100» en el medio: la unidad baja abajo de los dos. */}
      <div className="grid grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center gap-2 @max-[18rem]:grid-cols-2">
        <BuildRing side="A" build={comparison.a} view={view} computing={computing} />
        <p className="m-0 max-w-28 text-center text-body text-muted @max-[18rem]:col-span-2 @max-[18rem]:row-start-2 @max-[18rem]:max-w-none">{t('meta.compare.ringsUnit')}</p>
        <BuildRing side="B" build={comparison.b} view={view} computing={computing} />
      </div>

      {pending ? (
        <Callout tone="warning" action={classifyButton}>
          {t('meta.compare.verdict.pendingBody', { count: pending.count, names: pending.names })}
        </Callout>
      ) : blocked ? (
        // El título ya lo dice la tarjeta: el aviso dice sólo por qué.
        <Callout tone="danger">
          {reasons.map(({ side, reason }) => (
            <span key={`${side}-${reason}`} className="block">
              {t('meta.compare.blockedSide', { side, reason })}
            </span>
          ))}
        </Callout>
      ) : (
        <>
          <div>
            {verdictRows(comparison).map((row) => (
              <MirrorRow key={row.key} row={row} view={view} moversOf={moversOf} dot={row.key === 'noOpening' ? 'danger' : 'warning'} />
            ))}
          </div>
          {/* En la tarjeta angosta (320–360 px) «Promedio» no entra en un tercio con el relleno de siempre: menos relleno y la letra chica. */}
          <Segmented
            label={t('meta.compare.lens')}
            variant="cards"
            fullWidth
            className="@max-[18rem]:[&>button]:px-1.5 @max-[18rem]:[&>button]:text-micro"
            value={view}
            onChange={onViewChange}
            options={lens}
          />
        </>
      )}

      {footer}
    </Card>
  )
}

interface VerdictActionProps {
  /** Manos buenas de B contra A en la vista elegida, en puntos (`null`: no hay número, p. ej. una build no se pudo medir). */
  points: number | null
  /** Todavía se están midiendo las builds: el número es un esqueleto. */
  loading?: boolean
  /** `card`: dentro de la tarjeta (escritorio) y en «Las dos listas» · `bar`: la barra pegada abajo del celular, más compacta. */
  layout: 'card' | 'bar'
  /** «Cargar B en el builder»; `emphasis` = B abre mejor (si no, pesa menos). `null`: B ya es tu deck. */
  adopt: { onClick: () => void; emphasis: boolean } | null
  /** «Guardar B» (sólo si B es el borrador del Lab). */
  onSaveDraft?: () => void
  className?: string
}

/** El número que decide y la acción que le sigue, en la misma fila (lenguaje de tarjetas, movimiento 4): «▲6 manos buenas más de cada 100 con B · Cargar B en el builder». */
export function VerdictAction({ points, loading = false, layout, adopt, onSaveDraft, className }: VerdictActionProps) {
  const bar = layout === 'bar'
  const winner = points ? (points > 0 ? 'B' : 'A') : null
  const number = loading ? (
    <Skeleton className={bar ? 'h-9 w-16' : 'h-12 w-40'} />
  ) : points === null ? null : (
    // En la barra, el número arriba y lo que dice debajo: así le queda el ancho a la acción.
    <span className={cx('min-w-0', bar ? 'grid shrink-0 leading-tight' : 'flex items-center gap-3')}>
      <span className={cx('shrink-0 font-bold tabular-nums', bar ? 'text-lead' : 'text-stat', winner ? 'text-success-soft' : 'text-foreground')}>
        <span aria-hidden="true">{winner ? '▲' : '='}</span>
        {winner ? Math.abs(points) : null}
      </span>
      <span className={cx('min-w-0 text-muted', bar ? 'whitespace-nowrap text-micro' : 'max-w-52 text-body')}>
        {winner
          ? t(bar ? 'meta.compare.number.moreShort' : 'meta.compare.number.more', { side: winner })
          : t(bar ? 'meta.compare.number.sameShort' : 'meta.compare.number.same')}
      </span>
    </span>
  )

  return (
    <div className={cx('flex min-w-0 items-center', bar ? 'flex-1 gap-2' : 'flex-wrap justify-between gap-3', className)}>
      {number}
      {adopt || onSaveDraft ? (
        <span className={cx('flex min-w-0 items-center gap-2', bar && 'flex-1 justify-end')}>
          {onSaveDraft ? (
            <Button variant="secondary" icon="save" onClick={onSaveDraft}>
              {t('meta.compare.saveDraft')}
            </Button>
          ) : null}
          {adopt ? (
            <Button variant={adopt.emphasis ? 'primary' : 'secondary'} icon="cards" className={cx(bar && 'min-w-0 flex-1 sm:flex-none')} onClick={adopt.onClick}>
              {t('meta.compare.adopt')}
            </Button>
          ) : null}
        </span>
      ) : null}
    </div>
  )
}

/**
 * La barra pegada abajo del celular, al alcance del pulgar y por encima de la barra de navegación: el intercambio ⇅ a la izquierda y, a la derecha, lo que
 * sigue (el número con «Cargar B en el builder», o «Clasificar N cartas»). Va al final de la pantalla con el relleno de `StepPage` en negativo (`-mb-6`, regla 11).
 */
export function CompareActionBar({ onSwap, children }: { onSwap: () => void; children: ReactNode }) {
  return (
    <div className="sticky bottom-[calc(4rem+env(safe-area-inset-bottom,0px))] z-30 -mx-gutter -mb-6 flex items-center gap-2 border-t border-border-subtle bg-background px-gutter pb-5 pt-3">
      <IconButton tone="outline" aria-label={t('meta.compare.swap')} onClick={onSwap}>
        <Icon name="swap" />
      </IconButton>
      {children}
    </div>
  )
}

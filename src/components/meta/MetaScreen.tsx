import { useMemo, useState } from 'react'

import { createRoleGroupKey, getDeckGroupTheme } from '../../app/deck-groups'
import {
  META_DECKS,
  MIN_WEEK_DECKS,
  PROJECTION_WEEKS,
  TIER_FLOORS,
  TREND_THRESHOLD,
  buildMetaReport,
  filterMetaDecks,
  type HandtrapStat,
  type MetaDeck,
  type MetaDeckFilter,
  type MetaTier,
  type MetaTrend,
  type MetaZone,
} from '../../app/meta-handtraps'
import { formatInteger } from '../../app/utils'
import { CardArt } from '../CardArt'
import { StepHero } from '../StepHero'
import { Badge } from '../ui/Badge'
import { Button } from '../ui/Button'
import { Card } from '../ui/Card'
import { cx } from '../ui/cx'
import { EmptyState } from '../ui/EmptyState'
import { Icon } from '../ui/Icon'
import { ProgressRing } from '../ui/ProgressRing'
import { SectionHeader } from '../ui/SectionHeader'
import { Segmented } from '../ui/Segmented'
import { StepPage } from '../ui/StepPage'
import { choiceChip, filterChip, listItem } from '../ui/surfaces'
import { overline } from '../ui/typography'

type WindowWeeks = '2' | '4' | '8'

const DECKS_PER_PAGE = 25
const MAX_ARCHETYPE_CHIPS = 12
const HANDTRAP_RGB = getDeckGroupTheme(createRoleGroupKey('handtrap')).rgb
const ZONE_OPTIONS = [
  { value: 'both', label: 'Main + Side' },
  { value: 'main', label: 'Main' },
  { value: 'side', label: 'Side' },
] as const satisfies ReadonlyArray<{ value: MetaZone; label: string }>
const WINDOW_OPTIONS = [
  { value: '2', label: '2 sem.' },
  { value: '4', label: '4 sem.' },
  { value: '8', label: '8 sem.' },
] as const satisfies ReadonlyArray<{ value: WindowWeeks; label: string }>
const TREND_LOOK: Record<MetaTrend, { tone: 'success' | 'danger' | 'neutral'; label: string }> = {
  up: { tone: 'success', label: 'Sube' },
  down: { tone: 'danger', label: 'Baja' },
  flat: { tone: 'neutral', label: 'Estable' },
}
const DATE_FORMAT = new Intl.DateTimeFormat('es-ES', { day: 'numeric', month: 'short', timeZone: 'UTC' })
const AVERAGE_FORMAT = new Intl.NumberFormat('es-ES', { minimumFractionDigits: 1, maximumFractionDigits: 1 })
const LINK_CHIP = cx(filterChip, 'h-8 gap-1')

export function MetaScreen() {
  const [zone, setZone] = useState<MetaZone>('both')
  const [weeks, setWeeks] = useState<WindowWeeks>('4')
  const [filter, setFilter] = useState<MetaDeckFilter | null>(null)
  const [deckLimit, setDeckLimit] = useState(DECKS_PER_PAGE)
  const report = useMemo(() => buildMetaReport(META_DECKS, zone, Number(weeks)), [zone, weeks])
  const decks = useMemo(() => filterMetaDecks(META_DECKS.decks, filter ?? {}), [filter])
  const filterLabel = filter?.archetype ?? (filter?.cardId !== undefined ? `Con ${META_DECKS.cards[String(filter.cardId)]?.name ?? 'esa carta'}` : null)

  const applyFilter = (next: MetaDeckFilter) => {
    setFilter(next)
    setDeckLimit(DECKS_PER_PAGE)
    document.getElementById('meta-decks')?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }

  const rows = report.handtraps.flatMap((stat, index, all) => {
    const items = []

    if (index === 0 || all[index - 1]?.tier !== stat.tier) {
      items.push(<TierHeading key={`tier-${stat.tier}`} tier={stat.tier} />)
    }

    items.push(
      <HandtrapRow
        key={stat.id}
        stat={stat}
        rank={index + 1}
        delay={Math.min(index, 12) * 60}
        onShowDecks={() => applyFilter({ cardId: stat.id })}
        onPickArchetype={(name) => applyFilter({ archetype: name })}
      />,
    )

    return items
  })

  return (
    <StepPage as="article">
      <StepHero
        title="Hand traps del meta"
        icon="chart"
        subtitle="Qué se juega en los Tournament Meta Decks de YGOPRODeck y hacia dónde va."
        help={
          <>
            YGOPRODeck carga a mano las listas de torneo (tops de YCS, regionales y similares) como Tournament Meta Decks. Esta app las baja una vez por
            día y cuenta en cuántos Main y Side aparece cada hand trap. La tendencia ajusta una recta a la serie semanal de las últimas{' '}
            {formatInteger(Math.ceil(META_DECKS.windowDays / 7))} semanas (cada semana pesa por su cantidad de decks) y la prolonga{' '}
            {formatInteger(PROJECTION_WEEKS)} semanas: dice “Sube” o “Baja” cuando eso mueve la cifra más de {formatInteger(Math.round(TREND_THRESHOLD * 100))} puntos.
          </>
        }
        side={
          <a className={LINK_CHIP} href={META_DECKS.source} target="_blank" rel="noreferrer">
            Ver en YGOPRODeck
            <Icon name="arrow-right" size={14} />
          </a>
        }
      />

      <Card>
        <SectionHeader
          icon="hand"
          title="Tier list"
          description={`${formatInteger(report.deckCount)} decks de las últimas ${weeks} semanas, al ${formatMetaDate(META_DECKS.fetchedAt)}.`}
          actions={
            <>
              <Segmented value={zone} onChange={setZone} options={ZONE_OPTIONS} label="Dónde contar la hand trap" size="sm" />
              <Segmented value={weeks} onChange={setWeeks} options={WINDOW_OPTIONS} label="Ventana de decks" size="sm" />
            </>
          }
        />
        {rows.length > 0 ? (
          <ol className="mt-3 grid gap-0.5">{rows}</ol>
        ) : (
          <EmptyState icon="hand" title="Sin hand traps en esta ventana">
            Probá con más semanas o con otra zona.
          </EmptyState>
        )}
      </Card>

      <Card id="meta-decks">
        <SectionHeader
          icon="layers"
          title="Tournament Meta Decks"
          description={
            filterLabel
              ? `${formatInteger(decks.length)} decks, del más reciente al más viejo.`
              : `Los ${formatInteger(decks.length)} decks de las últimas ${formatInteger(Math.ceil(META_DECKS.windowDays / 7))} semanas, del más reciente al más viejo.`
          }
          actions={
            filterLabel ? (
              <button type="button" className={filterChip} onClick={() => setFilter(null)} aria-label={`Quitar el filtro ${filterLabel}`}>
                {filterLabel}
                <Icon name="x" size={12} strokeWidth={2.2} />
              </button>
            ) : null
          }
        />
        {decks.length > 0 ? (
          <ul className="mt-2 divide-y divide-border-subtle">
            {decks.slice(0, deckLimit).map((deck) => (
              <MetaDeckRow key={deck.id} deck={deck} onPickArchetype={(name) => applyFilter({ archetype: name })} />
            ))}
          </ul>
        ) : (
          <EmptyState icon="layers" title="Ningún deck con ese filtro" />
        )}
        {decks.length > deckLimit ? (
          <Button variant="secondary" size="sm" className="mt-3" onClick={() => setDeckLimit((limit) => limit + DECKS_PER_PAGE)}>
            Ver {formatInteger(Math.min(DECKS_PER_PAGE, decks.length - deckLimit))} más
          </Button>
        ) : null}
      </Card>
    </StepPage>
  )
}

function TierHeading({ tier }: { tier: MetaTier }) {
  const floor = TIER_FLOORS.find(([key]) => key === tier)?.[1]

  return (
    <li className={cx(overline, 'px-2 pb-1 pt-4 first:pt-0')} title={floor === undefined ? 'Menos del 5% de los decks' : `Al menos el ${percent(floor)} de los decks`}>
      Tier {tier}
    </li>
  )
}

interface HandtrapRowProps {
  stat: HandtrapStat
  rank: number
  delay: number
  onShowDecks: () => void
  onPickArchetype: (name: string) => void
}

function HandtrapRow({ stat, rank, delay, onShowDecks, onPickArchetype }: HandtrapRowProps) {
  const trend = TREND_LOOK[stat.trend]
  const trendLabel =
    stat.trend === 'flat'
      ? 'Estable'
      : `${trend.label} a ${percent(stat.projectedShare)}${stat.projectedTier === stat.tier ? '' : ` · Tier ${stat.projectedTier}`}`
  const trendBadge = (
    <Badge tone={trend.tone} title={`Proyección a ${formatInteger(PROJECTION_WEEKS)} semanas`}>
      {trendLabel}
    </Badge>
  )
  const usage = `Main ${usageText(stat.main.decks, stat.main.copies, stat.decks)} · Side ${usageText(stat.side.decks, stat.side.copies, stat.decks)}`

  return (
    <li className="min-w-0">
      <details className={cx('group', listItem)}>
        <summary className="flex cursor-pointer list-none items-center gap-3 rounded-card px-2 py-2 focus-visible:outline-none focus-visible:shadow-focus [&::-webkit-details-marker]:hidden">
          <span className="w-5 shrink-0 text-center text-micro font-semibold text-soft tabular-nums">{rank}</span>
          <ProgressRing value={stat.share} color={HANDTRAP_RGB} size={42} label={`${stat.name}: ${percent(stat.share)} de los decks`} delay={delay} />
          <span className="relative hidden aspect-[421/614] w-9 shrink-0 overflow-hidden rounded-tag bg-input min-[480px]:block">
            <CardArt remoteUrl={stat.image} name={stat.name} className="h-full w-full object-cover" />
          </span>
          <span className="grid min-w-0 flex-1 gap-1">
            <span className="truncate text-body font-semibold text-foreground">{stat.name}</span>
            <span className="text-micro text-muted tabular-nums">{usage}</span>
            <span className="min-[700px]:hidden">{trendBadge}</span>
          </span>
          <span className="hidden min-[700px]:block">{trendBadge}</span>
          <Icon name="chevron-down" size={18} className="shrink-0 text-soft transition-transform duration-200 group-open:rotate-180" />
        </summary>
        <div className="grid gap-3 px-2 pb-3 pt-1 pl-[5.4rem] min-[480px]:pl-[8.4rem]">
          {/* Una semana con pocos decks se muestra vacía: tampoco pesa en la tendencia. */}
          <p className="m-0 text-micro text-muted tabular-nums" title="De la semana más vieja a la más nueva">
            Semana a semana: {stat.weekly.map((week) => (week.decks >= MIN_WEEK_DECKS ? percent(week.share) : '—')).join(' · ')}
          </p>
          <div className="grid gap-1.5">
            <span className={overline}>Decks que la juegan</span>
            <div className="flex flex-wrap items-center gap-1.5">
              {stat.archetypes.slice(0, MAX_ARCHETYPE_CHIPS).map((archetype) => (
                <button
                  key={archetype.name}
                  type="button"
                  className={cx(choiceChip, 'h-8 gap-1.5 px-3 text-micro')}
                  onClick={() => onPickArchetype(archetype.name)}
                >
                  {archetype.name}
                  <span className="font-medium text-soft tabular-nums">
                    {formatInteger(archetype.decks)}/{formatInteger(archetype.total)}
                  </span>
                </button>
              ))}
              {stat.archetypes.length > MAX_ARCHETYPE_CHIPS ? (
                <span className="text-micro text-soft">+{formatInteger(stat.archetypes.length - MAX_ARCHETYPE_CHIPS)} más</span>
              ) : null}
            </div>
          </div>
          <Button variant="tertiary" size="sm" icon="layers" className="justify-self-start" onClick={onShowDecks}>
            Ver los decks que la juegan
          </Button>
        </div>
      </details>
    </li>
  )
}

function MetaDeckRow({ deck, onPickArchetype }: { deck: MetaDeck; onPickArchetype: (name: string) => void }) {
  const details = [deck.tournament, deck.placement, deck.players === null ? null : `${formatInteger(deck.players)} jugadores`, formatMetaDate(deck.date)]
    .filter(Boolean)
    .join(' · ')

  return (
    <li className="grid gap-1.5 py-3 min-[1101px]:grid-cols-[minmax(0,1fr)_auto] min-[1101px]:items-start min-[1101px]:gap-x-4">
      <div className="grid min-w-0 gap-0.5">
        <button
          type="button"
          className="justify-self-start truncate text-left text-body font-semibold text-foreground transition-colors hover:text-primary-soft focus-visible:outline-none focus-visible:shadow-focus"
          title={`Ver sólo los decks ${deck.name}`}
          onClick={() => onPickArchetype(deck.name)}
        >
          {deck.name}
        </button>
        <span className="text-micro text-muted">{details}</span>
        <span className="text-micro text-soft tabular-nums">
          {zoneText('Main', deck.main)} · {zoneText('Side', deck.side)}
        </span>
      </div>
      {deck.url ? (
        <a className={cx(LINK_CHIP, 'justify-self-start')} href={`https://ygoprodeck.com/deck/${deck.url}`} target="_blank" rel="noreferrer">
          Ver en YGOPRODeck
          <Icon name="arrow-right" size={12} />
        </a>
      ) : null}
    </li>
  )
}

function zoneText(label: string, entries: ReadonlyArray<[number, number]>): string {
  if (entries.length === 0) {
    return `${label}: sin hand traps`
  }

  const named = entries
    .map(([id, copies]) => ({ name: META_DECKS.cards[String(id)]?.name ?? `Carta ${id}`, copies }))
    .sort((left, right) => right.copies - left.copies || left.name.localeCompare(right.name, 'es'))

  return `${label}: ${named.map((entry) => `${entry.name} ×${formatInteger(entry.copies)}`).join(', ')}`
}

/** "72% ×2,8": en qué parte de los decks que la juegan va en esa zona, y con cuántas copias. */
function usageText(decks: number, copies: number, total: number): string {
  return decks === 0 ? '0%' : `${percent(decks / total)} ×${AVERAGE_FORMAT.format(copies / decks)}`
}

function percent(value: number): string {
  return `${formatInteger(Math.round(value * 100))}%`
}

function formatMetaDate(date: string): string {
  return DATE_FORMAT.format(new Date(date)).replace('.', '')
}

import { useMemo, useState } from 'react'

import {
  META_DECKS,
  PROJECTION_WEEKS,
  TREND_THRESHOLD,
  buildMetaReport,
  countCopies,
  coverArtUrl,
  filterMetaDecks,
  type HandtrapStat,
  type MetaDeck,
  type MetaDeckFilter,
  type MetaTier,
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
import { SectionHeader } from '../ui/SectionHeader'
import { Segmented } from '../ui/Segmented'
import { StepPage } from '../ui/StepPage'
import { field, filterChip } from '../ui/surfaces'
import { HandtrapModal } from './HandtrapModal'
import { MetaDeckModal } from './MetaDeckModal'
import { TrendArrow } from './TrendArrow'
import { TIER_ORDER, formatMetaDate, percent, tierColor, tierHint, tierLabel } from './meta-format'

type WindowWeeks = '2' | '4' | '8'
type BoardView = 'now' | 'projected'

const DECKS_PER_PAGE = 24
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
const VIEW_OPTIONS = [
  { value: 'now', label: 'Hoy' },
  { value: 'projected', label: `En ${formatInteger(PROJECTION_WEEKS)} sem.` },
] as const satisfies ReadonlyArray<{ value: BoardView; label: string }>

export function MetaScreen() {
  const [zone, setZone] = useState<MetaZone>('both')
  const [weeks, setWeeks] = useState<WindowWeeks>('4')
  const [view, setView] = useState<BoardView>('now')
  const [filter, setFilter] = useState<MetaDeckFilter | null>(null)
  const [query, setQuery] = useState('')
  const [deckLimit, setDeckLimit] = useState(DECKS_PER_PAGE)
  const [selectedStat, setSelectedStat] = useState<HandtrapStat | null>(null)
  const [selectedDeck, setSelectedDeck] = useState<MetaDeck | null>(null)
  const report = useMemo(() => buildMetaReport(META_DECKS, zone, Number(weeks)), [zone, weeks])
  const decks = useMemo(() => filterMetaDecks(META_DECKS.decks, { ...filter, text: query }), [filter, query])
  const board = useMemo(() => {
    const key = view === 'projected' ? 'projectedTier' : 'tier'
    const shareOf = (stat: HandtrapStat) => (view === 'projected' ? stat.projectedShare : stat.share)

    return TIER_ORDER.map((tier) => ({
      tier,
      cards: report.handtraps.filter((stat) => stat[key] === tier).sort((left, right) => shareOf(right) - shareOf(left)),
    }))
  }, [report, view])
  const filterLabel = filter?.archetype ?? (filter?.cardId !== undefined ? `Con ${META_DECKS.cards[String(filter.cardId)]?.name ?? 'esa carta'}` : null)
  const totalWeeks = Math.ceil(META_DECKS.windowDays / 7)

  const applyFilter = (next: MetaDeckFilter) => {
    setSelectedStat(null)
    setFilter(next)
    setDeckLimit(DECKS_PER_PAGE)
    // Después de que el modal suelte el scroll de la página.
    window.setTimeout(() => document.getElementById('meta-decks')?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 60)
  }

  return (
    <StepPage as="article">
      <StepHero
        title="Hand traps del meta"
        icon="chart"
        subtitle="Qué se juega en los decks de torneo y hacia dónde va."
        help={
          <>
            Las listas de torneo (tops de YCS, regionales y similares) se actualizan una vez por día y se cuenta en cuántos Main y Side aparece cada hand
            trap. La tendencia ajusta una recta a la serie semanal de las últimas {formatInteger(totalWeeks)} semanas (cada semana pesa por su cantidad de
            decks) y la prolonga {formatInteger(PROJECTION_WEEKS)} semanas: dice “Sube” o “Baja” cuando eso mueve la cifra más de{' '}
            {formatInteger(Math.round(TREND_THRESHOLD * 100))} puntos. Con “En {formatInteger(PROJECTION_WEEKS)} semanas” cada carta se ubica en el tier al
            que va.
          </>
        }
      />

      <Card>
        <SectionHeader
          icon="hand"
          title="Tier list"
          description={`${formatInteger(report.deckCount)} decks de las últimas ${weeks} semanas, al ${formatMetaDate(META_DECKS.fetchedAt)}. Tocá una carta para ver el detalle.`}
          actions={
            // En mobile cada control ocupa una fila a todo el ancho; en pantallas grandes van en línea.
            <div className="grid w-full gap-2 min-[1101px]:flex min-[1101px]:w-auto min-[1101px]:flex-wrap min-[1101px]:items-center">
              <Segmented value={zone} onChange={setZone} options={ZONE_OPTIONS} label="Dónde contar la hand trap" size="sm" className="max-[1100px]:w-full" />
              <Segmented value={weeks} onChange={setWeeks} options={WINDOW_OPTIONS} label="Ventana de decks" size="sm" className="max-[1100px]:w-full" />
              <Segmented value={view} onChange={setView} options={VIEW_OPTIONS} label="Tier list de hoy o proyectada" size="sm" className="max-[1100px]:w-full" />
            </div>
          }
        />
        {report.handtraps.length > 0 ? (
          <div className="mt-3 overflow-hidden rounded-card border border-border-subtle">
            {board.map(({ tier, cards }) => (
              <TierRow key={tier} tier={tier} cards={cards} view={view} onOpen={setSelectedStat} />
            ))}
          </div>
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
              ? `${formatInteger(decks.length)} decks, del más reciente al más viejo. Tocá uno para verlo entero.`
              : `Los ${formatInteger(decks.length)} decks de las últimas ${formatInteger(totalWeeks)} semanas, del más reciente al más viejo. Tocá uno para verlo entero.`
          }
          actions={
            <>
              {filterLabel ? (
                <button type="button" className={filterChip} onClick={() => setFilter(null)} aria-label={`Quitar el filtro ${filterLabel}`}>
                  {filterLabel}
                  <Icon name="x" size={12} strokeWidth={2.2} />
                </button>
              ) : null}
              <label className="relative block min-w-[14rem] flex-1 max-[1100px]:w-full">
                <span className="sr-only">Buscar decks</span>
                <Icon name="search" size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-soft" />
                <input
                  type="search"
                  value={query}
                  placeholder="Deck, torneo o jugador"
                  autoComplete="off"
                  className={cx(field, 'h-9 w-full pl-9 pr-3 text-body')}
                  onChange={(event) => {
                    setQuery(event.target.value)
                    setDeckLimit(DECKS_PER_PAGE)
                  }}
                />
              </label>
            </>
          }
        />
        {decks.length > 0 ? (
          <div className="mt-3 grid gap-3 sm:grid-cols-2 min-[1101px]:grid-cols-3">
            {decks.slice(0, deckLimit).map((deck) => (
              <MetaDeckTile key={deck.id} deck={deck} onOpen={() => setSelectedDeck(deck)} />
            ))}
          </div>
        ) : (
          <EmptyState icon="search" title="Ningún deck con esa búsqueda">
            Probá con otro nombre de deck, torneo o jugador.
          </EmptyState>
        )}
        {decks.length > deckLimit ? (
          <Button variant="secondary" size="sm" className="mt-3" onClick={() => setDeckLimit((limit) => limit + DECKS_PER_PAGE)}>
            Ver {formatInteger(Math.min(DECKS_PER_PAGE, decks.length - deckLimit))} más
          </Button>
        ) : null}
      </Card>

      <HandtrapModal
        stat={selectedStat}
        onClose={() => setSelectedStat(null)}
        onPickArchetype={(name) => applyFilter({ archetype: name })}
        onShowDecks={(cardId) => applyFilter({ cardId })}
      />
      <MetaDeckModal deck={selectedDeck} onClose={() => setSelectedDeck(null)} />
    </StepPage>
  )
}

interface TierRowProps {
  tier: MetaTier
  cards: HandtrapStat[]
  view: BoardView
  onOpen: (stat: HandtrapStat) => void
}

/** Una fila de la tier list clásica: la etiqueta de color a la izquierda y las cartas en fila. */
function TierRow({ tier, cards, view, onOpen }: TierRowProps) {
  return (
    // En mobile la etiqueta es angosta y las cartas van de a cuatro por fila, a todo el ancho; en pantallas grandes, en fila con ancho fijo.
    <div className="grid min-h-[5.75rem] grid-cols-[3.5rem_minmax(0,1fr)] border-b border-border-subtle last:border-b-0 sm:grid-cols-[5.5rem_minmax(0,1fr)]">
      <div
        className="grid place-items-center px-1 text-center text-micro font-bold text-[#1a1204] sm:text-body sm:font-semibold"
        style={{ backgroundColor: tierColor(tier) }}
        title={tierHint(tier)}
      >
        {tierLabel(tier)}
      </div>
      <ul
        className="m-0 grid list-none grid-cols-4 content-start gap-1 bg-background p-1 sm:flex sm:flex-wrap"
        aria-label={`${tierLabel(tier)}: ${tierHint(tier)}`}
      >
        {cards.map((stat) => {
          const share = view === 'projected' ? stat.projectedShare : stat.share

          return (
            <li key={stat.id} className="min-w-0">
              <button
                type="button"
                className="relative block aspect-[421/614] w-full overflow-hidden rounded-tag bg-input transition-transform duration-150 hover:scale-[1.04] focus-visible:outline-none focus-visible:shadow-focus sm:w-[4.5rem]"
                title={`${stat.name}: ${percent(share)} de los decks`}
                onClick={() => onOpen(stat)}
              >
                <CardArt remoteUrl={stat.image} name={stat.name} className="h-full w-full object-cover" />
                <span className="absolute inset-x-0 bottom-0 bg-black/70 py-0.5 text-center text-micro font-bold text-white tabular-nums">
                  {percent(share)}
                </span>
                <TrendArrow trend={stat.trend} size={32} className="absolute right-0 top-0" />
              </button>
            </li>
          )
        })}
      </ul>
    </div>
  )
}

/** La tarjeta de la categoría de YGOPRODeck: portada de fondo, torneo arriba, nombre y puesto abajo. */
function MetaDeckTile({ deck, onOpen }: { deck: MetaDeck; onOpen: () => void }) {
  return (
    <button
      type="button"
      className="group relative grid min-h-[10rem] content-end gap-1 overflow-hidden rounded-card border border-border-subtle bg-card-background p-3 text-left transition-colors duration-150 hover:border-primary/60 focus-visible:outline-none focus-visible:shadow-focus"
      onClick={onOpen}
    >
      {deck.cover ? (
        <img
          src={coverArtUrl(deck.cover)}
          alt=""
          aria-hidden="true"
          loading="lazy"
          decoding="async"
          className="absolute inset-0 h-full w-full object-cover opacity-50 transition-opacity duration-150 group-hover:opacity-70"
        />
      ) : null}
      <span className="absolute inset-0 bg-linear-to-t from-background via-background/85 to-background/25" aria-hidden="true" />
      {deck.tournament ? (
        <span className="absolute left-3 top-3">
          <Badge tone="info">{deck.tournament}</Badge>
        </span>
      ) : null}
      <strong className="relative truncate text-lead font-semibold text-foreground">{deck.name}</strong>
      <span className="relative flex flex-wrap items-center gap-x-3 gap-y-0.5 text-micro text-muted">
        {deck.placement ? (
          <span className="inline-flex items-center gap-1">
            <Icon name="trophy" size={13} />
            {deck.placement}
            {deck.players === null ? '' : ` (${formatInteger(deck.players)} jugadores)`}
          </span>
        ) : null}
        <span className="inline-flex items-center gap-1">
          <Icon name="calendar" size={13} />
          {formatMetaDate(deck.date)}
        </span>
        {deck.player ? (
          <span className="inline-flex min-w-0 items-center gap-1">
            <Icon name="user" size={13} className="shrink-0" />
            <span className="truncate">{deck.player}</span>
          </span>
        ) : null}
      </span>
      <span className="relative text-micro text-soft tabular-nums">
        Hand traps: {formatInteger(countCopies(deck.main))} en Main · {formatInteger(countCopies(deck.side))} en Side
      </span>
    </button>
  )
}

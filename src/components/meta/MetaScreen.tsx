import { useEffect, useMemo, useState, type ReactNode } from 'react'

import { cardImageSrc } from '../../app/card-image-source'
import {
  META_DECKS,
  PROJECTION_WEEKS,
  TIER_FLOORS,
  TREND_THRESHOLD,
  buildMetaDeckHash,
  buildMetaReport,
  countCopies,
  coverArtUrl,
  filterMetaDecks,
  readMetaDeckIdFromHash,
  type HandtrapStat,
  type MetaDeck,
  type MetaDeckFilter,
  type MetaRegion,
  type MetaTier,
  type MetaZone,
} from '../../app/meta-handtraps'
import { useAppSelector } from '../../app/store-hooks'
import { DESKTOP_DECK_BUILDER_MEDIA_QUERY, useMediaQuery } from '../../app/use-media-query'
import { useToastMessage } from '../../app/use-toast-message'
import { formatInteger } from '../../app/utils'
import { t } from '../../i18n'
import { tRich } from '../../i18n/rich'
import { CardArt } from '../CardArt'
import { StepHero } from '../StepHero'
import { Badge } from '../ui/Badge'
import { Button } from '../ui/Button'
import { Card } from '../ui/Card'
import { cx } from '../ui/cx'
import { EmptyState } from '../ui/EmptyState'
import { Icon } from '../ui/Icon'
import { IconButton } from '../ui/IconButton'
import { Modal } from '../ui/Modal'
import { SectionHeader } from '../ui/SectionHeader'
import { Segmented } from '../ui/Segmented'
import { StepPage } from '../ui/StepPage'
import { field, filterChip } from '../ui/surfaces'
import { overline } from '../ui/typography'
import { HandtrapModal } from './HandtrapModal'
import { MetaDeckModal } from './MetaDeckModal'
import { TrendArrow } from './TrendArrow'
import { TIER_ORDER, formatMetaDate, formatMetaDateFull, percent, tierColor, tierHint, tierLabel } from './meta-format'

type WindowWeeks = '2' | '4' | '8'
type BoardView = 'now' | 'projected'

const DECKS_PER_PAGE = 24
const REGION_OPTIONS = [
  { value: 'tcg', label: 'TCG' },
  { value: 'ocg', label: 'OCG' },
] as const satisfies ReadonlyArray<{ value: MetaRegion; label: string }>
const ZONE_LABEL_KEY = { both: 'meta.screen.zoneBoth', main: 'meta.screen.zoneMain', side: 'meta.screen.zoneSide' } as const satisfies Record<MetaZone, string>
const WINDOW_WEEKS: readonly WindowWeeks[] = ['2', '4', '8']

/** El deck que pide el link (`#meta?deck=123`), si está entre los de la ventana. */
function readLinkedDeck(): MetaDeck | null {
  const id = typeof window === 'undefined' ? null : readMetaDeckIdFromHash(window.location.hash)
  return id === null ? null : (META_DECKS.decks.find((deck) => deck.id === id) ?? null)
}

export function MetaScreen() {
  const deckFormat = useAppSelector((state) => state.settings.deckFormat)
  const { showToast } = useToastMessage()
  const isDesktop = useMediaQuery(DESKTOP_DECK_BUILDER_MEDIA_QUERY)
  const [adjustOpen, setAdjustOpen] = useState(false)
  // Arranca en la región del deck que pide el link o, si no, en la del formato del builder; después se cambia desde el encabezado.
  const [region, setRegion] = useState<MetaRegion>(() => readLinkedDeck()?.region ?? (deckFormat === 'ocg' ? 'ocg' : 'tcg'))
  const [zone, setZone] = useState<MetaZone>('both')
  const [weeks, setWeeks] = useState<WindowWeeks>('4')
  const [view, setView] = useState<BoardView>('now')
  const [filter, setFilter] = useState<MetaDeckFilter | null>(null)
  const [query, setQuery] = useState('')
  const [deckLimit, setDeckLimit] = useState(DECKS_PER_PAGE)
  const [selectedStat, setSelectedStat] = useState<HandtrapStat | null>(null)
  const [selectedDeck, setSelectedDeck] = useState<MetaDeck | null>(readLinkedDeck)

  // El deck abierto vive en el hash: así el link se puede copiar y pegar, y si cambia el hash se abre el que pide.
  useEffect(() => {
    if (readMetaDeckIdFromHash(window.location.hash) !== null && !readLinkedDeck()) {
      showToast(t('meta.screen.deckGone'), 'warning')
    }

    const handleHashChange = () => {
      const linked = readLinkedDeck()
      setSelectedDeck(linked)

      if (linked) {
        setRegion(linked.region)
      }
    }

    window.addEventListener('hashchange', handleHashChange)

    return () => {
      window.removeEventListener('hashchange', handleHashChange)
    }
  }, [showToast])

  const openDeck = (deck: MetaDeck | null) => {
    setSelectedDeck(deck)
    window.history.replaceState(null, '', buildMetaDeckHash(deck?.id ?? null))
  }
  const report = useMemo(() => buildMetaReport(META_DECKS, region, zone, Number(weeks)), [region, zone, weeks])
  const decks = useMemo(() => filterMetaDecks(META_DECKS.decks, { ...filter, region, text: query }), [filter, region, query])
  const regionLabel = region.toUpperCase()
  const board = useMemo(() => {
    const key = view === 'projected' ? 'projectedTier' : 'tier'
    const shareOf = (stat: HandtrapStat) => (view === 'projected' ? stat.projectedShare : stat.share)

    return TIER_ORDER.map((tier) => ({
      tier,
      cards: report.handtraps.filter((stat) => stat[key] === tier).sort((left, right) => shareOf(right) - shareOf(left)),
    }))
  }, [report, view])
  const filteredCardName = filter?.cardId === undefined ? undefined : META_DECKS.cards[String(filter.cardId)]?.name
  const filterLabel =
    filter?.archetype ??
    (filter?.cardId === undefined ? null : filteredCardName === undefined ? t('meta.screen.filterThatCard') : t('meta.screen.filterCard', { name: filteredCardName }))
  const totalWeeks = Math.ceil(META_DECKS.windowDays / 7)
  const ahead = formatInteger(PROJECTION_WEEKS)
  const zoneOptions = (Object.keys(ZONE_LABEL_KEY) as MetaZone[]).map((value) => ({ value, label: t(ZONE_LABEL_KEY[value]) }))
  const windowOptions = WINDOW_WEEKS.map((value) => ({ value, label: t('meta.screen.weeksOption', { count: value }) }))
  const viewOptions: ReadonlyArray<{ value: BoardView; label: string }> = [
    { value: 'now', label: t('meta.screen.viewNow') },
    { value: 'projected', label: t('meta.screen.viewProjected') },
  ]

  const applyFilter = (next: MetaDeckFilter) => {
    setSelectedStat(null)
    setFilter(next)
    setDeckLimit(DECKS_PER_PAGE)
    // Después de que el modal suelte el scroll de la página.
    window.setTimeout(() => document.getElementById('meta-decks')?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 60)
  }

  const zoneControl = () => (
    <Segmented value={zone} onChange={setZone} options={zoneOptions} label={t('meta.screen.zoneLabel')} size="sm" fullWidth={!isDesktop} />
  )
  const weeksControl = () => (
    <Segmented value={weeks} onChange={setWeeks} options={windowOptions} label={t('meta.screen.weeksLabel')} size="sm" fullWidth={!isDesktop} />
  )
  const viewControl = () => (
    <Segmented
      value={view}
      onChange={setView}
      options={viewOptions}
      label={t('meta.screen.viewLabel', { ahead })}
      size="sm"
      fullWidth={!isDesktop}
    />
  )

  return (
    <StepPage as="article">
      <StepHero
        title={t('meta.screen.title')}
        icon="chart"
        subtitle={t('meta.screen.subtitle')}
        help={
          <div className="grid gap-3">
            <div className="grid gap-1">
              <strong className="text-foreground">{t('meta.help.buildTitle')}</strong>
              <ul className="m-0 grid list-disc gap-1 pl-4">
                <li>{t('meta.help.build1')}</li>
                <li>{t('meta.help.build2')}</li>
                <li>{t('meta.help.build3')}</li>
                <li>
                  {[
                    ...TIER_FLOORS.map(([tier, floor]) => t('meta.help.tierAtLeast', { tier: tierLabel(tier), percent: percent(floor) })),
                    t('meta.help.tierBelow', { tier: tierLabel('D'), percent: percent(TIER_FLOORS.at(-1)?.[1] ?? 0) }),
                  ].join(' · ')}
                </li>
              </ul>
            </div>
            <div className="grid gap-1">
              <strong className="text-foreground">{t('meta.help.predictTitle')}</strong>
              <ul className="m-0 grid list-disc gap-1 pl-4">
                <li>{t('meta.help.predict1', { weeks: formatInteger(totalWeeks), ahead })}</li>
                <li>{t('meta.help.predict2', { points: formatInteger(Math.round(TREND_THRESHOLD * 100)) })}</li>
                <li>{t('meta.help.predict3', { ahead })}</li>
              </ul>
            </div>
          </div>
        }
        side={
          // En celular, un solo renglón: la región ocupa lo que sobra y la fecha va compacta al lado.
          <div className="flex w-full items-center gap-2 min-[1101px]:w-auto">
            <Badge icon="refresh" title={t('meta.screen.updatedTitle')} className="min-[1101px]:order-first">
              {tRich(
                'meta.updated',
                { lead: (text) => <span className="sr-only min-[1101px]:not-sr-only">{text} </span> },
                { date: formatMetaDateFull(META_DECKS.fetchedAt) },
              )}
            </Badge>
            <Segmented
              value={region}
              onChange={(next) => {
                setRegion(next)
                setDeckLimit(DECKS_PER_PAGE)
              }}
              options={REGION_OPTIONS}
              label={t('meta.screen.regionLabel')}
              size="sm"
              className="min-w-0 max-[1100px]:order-first max-[1100px]:flex-1"
            />
          </div>
        }
      />

      <Card>
        <SectionHeader
          icon="hand"
          title={t('meta.screen.tierTitle')}
          description={t(view === 'projected' ? 'meta.screen.tierProjected' : 'meta.screen.tierNow', {
            count: report.deckCount,
            n: formatInteger(report.deckCount),
            region: regionLabel,
            weeks,
            ahead,
          })}
          actions={
            isDesktop ? (
              // Cada control lleva su rótulo: "2 sem." (cuántos decks se cuentan) y la proyección no se confunden.
              <div className="flex flex-wrap items-end gap-2">
                <ControlField label={t('meta.screen.fieldCount')}>{zoneControl()}</ControlField>
                <ControlField label={t('meta.screen.fieldWeeks')}>{weeksControl()}</ControlField>
                <ControlField label={t('meta.screen.fieldView')}>{viewControl()}</ControlField>
              </div>
            ) : (
              // En celular se ve lo que más se usa (hoy o proyección) y el resto, que casi no se toca, va en un modal.
              <div className="flex w-full items-center gap-2">
                <div className="min-w-0 flex-1">{viewControl()}</div>
                <IconButton tone="raised" size="md" aria-label={t('meta.screen.adjust')} title={t('meta.screen.adjust')} onClick={() => setAdjustOpen(true)}>
                  <Icon name="sliders" size={20} />
                </IconButton>
              </div>
            )
          }
        />
        {report.handtraps.length > 0 ? (
          <div className="mt-3 overflow-hidden rounded-card border border-border-subtle">
            {board.map(({ tier, cards }) => (
              <TierRow key={tier} tier={tier} cards={cards} view={view} onOpen={setSelectedStat} />
            ))}
          </div>
        ) : (
          <EmptyState icon="hand" title={t('meta.screen.emptyTitle')}>
            {t('meta.screen.emptyHint')}
          </EmptyState>
        )}
      </Card>

      <Card id="meta-decks">
        <SectionHeader
          icon="layers"
          title={t('meta.screen.decksTitle')}
          description={t(filterLabel ? 'meta.screen.decksFiltered' : 'meta.screen.decksAll', {
            count: decks.length,
            n: formatInteger(decks.length),
            region: regionLabel,
            weeks: formatInteger(totalWeeks),
          })}
          actions={
            <>
              {filterLabel ? (
                <button type="button" className={filterChip} onClick={() => setFilter(null)} aria-label={t('meta.filter.clear', { name: filterLabel })}>
                  {filterLabel}
                  <Icon name="x" size={12} strokeWidth={2.2} />
                </button>
              ) : null}
              <label className="relative block min-w-[14rem] flex-1 max-[1100px]:w-full">
                <span className="sr-only">{t('meta.screen.searchLabel')}</span>
                <Icon name="search" size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-soft" />
                <input
                  type="search"
                  value={query}
                  placeholder={t('meta.screen.searchPlaceholder')}
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
              <MetaDeckTile key={deck.id} deck={deck} onOpen={() => openDeck(deck)} />
            ))}
          </div>
        ) : (
          <EmptyState icon="search" title={t('meta.screen.noDecksTitle')}>
            {t('meta.screen.noDecksHint')}
          </EmptyState>
        )}
        {decks.length > deckLimit ? (
          <div className="mt-4 flex justify-center">
            <Button variant="secondary" size="sm" onClick={() => setDeckLimit((limit) => limit + DECKS_PER_PAGE)}>
              {t('meta.showMore', { count: formatInteger(Math.min(DECKS_PER_PAGE, decks.length - deckLimit)) })}
            </Button>
          </div>
        ) : null}
      </Card>

      <Modal
        isOpen={adjustOpen && !isDesktop}
        onClose={() => setAdjustOpen(false)}
        size="sm"
        icon="sliders"
        title={t('meta.screen.adjust')}
        footer={
          <Button variant="primary" size="sm" onClick={() => setAdjustOpen(false)}>
            {t('meta.screen.adjustDone')}
          </Button>
        }
      >
        <div className="grid gap-4">
          <ControlField label={t('meta.screen.fieldCount')}>{zoneControl()}</ControlField>
          <ControlField label={t('meta.screen.fieldWeeks')}>{weeksControl()}</ControlField>
        </div>
      </Modal>

      <HandtrapModal
        stat={selectedStat}
        onClose={() => setSelectedStat(null)}
        onPickArchetype={(name) => applyFilter({ archetype: name })}
        onShowDecks={(cardId) => applyFilter({ cardId })}
      />
      <MetaDeckModal deck={selectedDeck} onClose={() => openDeck(null)} />
    </StepPage>
  )
}

/** Un control con su rótulo chico arriba: dice qué elige cada selector sin que haya que adivinarlo. */
function ControlField({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="grid gap-1">
      <span className={cx(overline, 'px-0.5')}>{label}</span>
      {children}
    </div>
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
                title={t('meta.tier.cardTitle', { name: stat.name, percent: percent(share) })}
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
          src={cardImageSrc(coverArtUrl(deck.cover))}
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
            {deck.players === null ? '' : ` ${t('meta.deck.players', { players: formatInteger(deck.players) })}`}
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
        {t('meta.deck.handtraps', { main: formatInteger(countCopies(deck.main)), side: formatInteger(countCopies(deck.side)) })}
      </span>
    </button>
  )
}

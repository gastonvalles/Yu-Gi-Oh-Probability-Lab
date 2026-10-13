import { useEffect, useMemo, useState } from 'react'

import { cardImageSrc } from '../../app/card-image-source'
import { META_DECKS, buildTournamentsHash, coverArtUrl, filterMetaDecks, readTournamentsHash, type MetaDeck, type MetaDeckFilter } from '../../app/meta'
import { countReplaysOfDeck } from '../../app/replays'
import { useAppSelector } from '../../app/store-hooks'
import { setMetaRegion, useMetaRegion } from '../../app/use-meta-region'
import { useToastMessage } from '../../app/use-toast-message'
import { formatInteger } from '../../app/utils'
import { t } from '../../i18n'
import { StepHero } from '../StepHero'
import { Badge } from '../ui/Badge'
import { Button } from '../ui/Button'
import { Card } from '../ui/Card'
import { EmptyState } from '../ui/EmptyState'
import { Icon } from '../ui/Icon'
import { SearchField } from '../ui/SearchField'
import { SectionHeader } from '../ui/SectionHeader'
import { StepPage } from '../ui/StepPage'
import { filterChip } from '../ui/surfaces'
import { MetaDeckModal } from './MetaDeckModal'
import { MetaHeroSide } from './MetaHeroSide'
import { deckCardCounts, formatMetaDate } from './meta-format'

const DECKS_PER_PAGE = 24

/** Lo que pide el link: el deck abierto (`#tournaments?deck=123`, si está entre los de la ventana) y el filtro por una carta o un nombre de deck. */
function readLink(): { requestedDeck: number | null; deck: MetaDeck | null; filter: MetaDeckFilter | null } {
  const link = readTournamentsHash(window.location.hash)

  return {
    requestedDeck: link.deck,
    deck: link.deck === null ? null : (META_DECKS.decks.find((deck) => deck.id === link.deck) ?? null),
    filter: link.archetype ? { archetype: link.archetype } : link.card ? { cardId: link.card } : null,
  }
}

export function TournamentDecksScreen() {
  const deckFormat = useAppSelector((state) => state.settings.deckFormat)
  const { showToast } = useToastMessage()
  const [link] = useState(readLink)
  // Arranca en la región del deck que pide el link o, si no, en la del formato del builder; después se cambia desde el encabezado.
  const region = useMetaRegion(link.deck?.region ?? (deckFormat === 'ocg' ? 'ocg' : 'tcg'))
  const [filter, setFilter] = useState<MetaDeckFilter | null>(link.filter)
  const [query, setQuery] = useState('')
  const [deckLimit, setDeckLimit] = useState(DECKS_PER_PAGE)
  const [selectedDeck, setSelectedDeck] = useState<MetaDeck | null>(link.deck)

  // El deck abierto y el filtro viven en el hash: así el link se puede copiar y pegar, y si cambia el hash se abre lo que pide.
  useEffect(() => {
    if (link.requestedDeck !== null && !link.deck) {
      showToast(t('meta.tournaments.deckGone'), 'warning')
    }

    if (link.deck) {
      setMetaRegion(link.deck.region)
    }

    const handleHashChange = () => {
      const next = readLink()

      setSelectedDeck(next.deck)

      if (next.deck) {
        setMetaRegion(next.deck.region)
      }

      if (next.filter) {
        setFilter(next.filter)
        setDeckLimit(DECKS_PER_PAGE)
      }
    }

    window.addEventListener('hashchange', handleHashChange)

    return () => {
      window.removeEventListener('hashchange', handleHashChange)
    }
  }, [link, showToast])

  const syncHash = (deck: MetaDeck | null, nextFilter: MetaDeckFilter | null) => {
    window.history.replaceState(null, '', buildTournamentsHash({ deck: deck?.id, card: nextFilter?.cardId, archetype: nextFilter?.archetype }))
  }
  const openDeck = (deck: MetaDeck | null) => {
    setSelectedDeck(deck)
    syncHash(deck, filter)
  }
  const clearFilter = () => {
    setFilter(null)
    syncHash(selectedDeck, null)
  }

  const decks = useMemo(() => filterMetaDecks(META_DECKS.decks, { ...filter, region, text: query }), [filter, region, query])
  const filteredCardName = filter?.cardId === undefined ? undefined : META_DECKS.cards[String(filter.cardId)]?.name
  const filterLabel =
    filter?.archetype ??
    (filter?.cardId === undefined ? null : filteredCardName === undefined ? t('meta.tournaments.filterThatCard') : t('meta.tournaments.filterCard', { name: filteredCardName }))

  return (
    <StepPage as="article">
      <StepHero
        title={t('meta.tournaments.title')}
        icon="trophy"
        subtitle={t('meta.tournaments.subtitle')}
        help={
          <div className="grid gap-1">
            <strong className="text-foreground">{t('meta.tournaments.helpTitle')}</strong>
            <ul className="m-0 grid list-disc gap-1 pl-4">
              <li>{t('meta.tournaments.help1')}</li>
              <li>{t('meta.tournaments.help2')}</li>
            </ul>
          </div>
        }
        side={
          <MetaHeroSide
            region={region}
            onRegionChange={(next) => {
              setMetaRegion(next)
              setDeckLimit(DECKS_PER_PAGE)
            }}
          />
        }
      />

      <Card>
        <SectionHeader
          icon="layers"
          title={t('meta.tournaments.listTitle')}
          description={t(filterLabel ? 'meta.tournaments.decksFiltered' : 'meta.tournaments.decksAll', {
            count: decks.length,
            n: formatInteger(decks.length),
            region: region.toUpperCase(),
            weeks: formatInteger(Math.ceil(META_DECKS.windowDays / 7)),
          })}
          actions={
            <>
              {filterLabel ? (
                <button type="button" className={filterChip} onClick={clearFilter} aria-label={t('meta.filter.clear', { name: filterLabel })}>
                  {filterLabel}
                  <Icon name="x" size={12} strokeWidth={2.2} />
                </button>
              ) : null}
              <SearchField
                label={t('meta.tournaments.searchLabel')}
                value={query}
                placeholder={t('meta.tournaments.searchPlaceholder')}
                className="min-w-[14rem] flex-1 max-[1100px]:w-full"
                onChange={(next) => {
                  setQuery(next)
                  setDeckLimit(DECKS_PER_PAGE)
                }}
              />
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
          <EmptyState icon="search" title={t('meta.tournaments.noDecksTitle')}>
            {t('meta.tournaments.noDecksHint')}
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

      <MetaDeckModal deck={selectedDeck} onClose={() => openDeck(null)} onOpenDeck={openDeck} />
    </StepPage>
  )
}

/** La tarjeta de la categoría de YGOPRODeck: portada de fondo, torneo arriba, nombre y puesto abajo. */
function MetaDeckTile({ deck, onOpen }: { deck: MetaDeck; onOpen: () => void }) {
  const replays = countReplaysOfDeck(deck.id)
  const replaysLabel = t('meta.tournaments.hasReplays', { count: replays })

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
      {replays > 0 ? (
        // Tiene replays: se ven al abrir el deck.
        <span className="absolute right-3 top-3">
          <Badge tone="brand" icon="play" title={replaysLabel}>
            <span aria-hidden="true">{replays}</span>
            <span className="sr-only">{replaysLabel}</span>
          </Badge>
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
      {deckCardCounts(deck).map(({ kind, text }) => (
        <span key={kind} className="relative text-micro text-soft tabular-nums">
          {text}
        </span>
      ))}
    </button>
  )
}

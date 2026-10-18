import { useEffect, useMemo, useState } from 'react'

import { META_DECKS, buildTournamentsHash, countPlacements, filterMetaDecks, metaPlacements, readTournamentsHash, type MetaDeck, type MetaDeckFilter } from '../../app/meta'
import { DESKTOP_DECK_BUILDER_MEDIA_QUERY, useMediaQuery } from '../../app/use-media-query'
import { useAppSelector } from '../../app/store-hooks'
import { setMetaRegion, useMetaRegion } from '../../app/use-meta-region'
import { useToastMessage } from '../../app/use-toast-message'
import { formatInteger } from '../../app/utils'
import { t } from '../../i18n'
import { StepHero } from '../StepHero'
import { Button } from '../ui/Button'
import { EmptyState } from '../ui/EmptyState'
import { FilterChips } from '../ui/FilterChips'
import { Heading } from '../ui/Heading'
import { Icon } from '../ui/Icon'
import { SearchField } from '../ui/SearchField'
import { StepPage } from '../ui/StepPage'
import { filterChip } from '../ui/surfaces'
import { MetaDeckModal } from './MetaDeckModal'
import { MetaDeckTile } from './MetaDeckTile'
import { MetaHeroSide } from './MetaHeroSide'

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
  const isDesktop = useMediaQuery(DESKTOP_DECK_BUILDER_MEDIA_QUERY)
  const [link] = useState(readLink)
  // Arranca en la región del deck que pide el link o, si no, en la del formato del builder; después se cambia desde el encabezado.
  const region = useMetaRegion(link.deck?.region ?? (deckFormat === 'ocg' ? 'ocg' : 'tcg'))
  const [filter, setFilter] = useState<MetaDeckFilter | null>(link.filter)
  const [query, setQuery] = useState('')
  const [placements, setPlacements] = useState<string[]>([])
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

  // Los chips de puesto son siempre los mismos (los de todos los decks): la fila no cambia de forma al buscar. Cada uno cuenta lo que daría con lo demás que está filtrado.
  const allPlacements = useMemo(() => metaPlacements(META_DECKS.decks), [])
  const matching = useMemo(() => filterMetaDecks(META_DECKS.decks, { ...filter, region, text: query }), [filter, region, query])
  const placementCounts = useMemo(() => countPlacements(matching), [matching])
  const decks = useMemo(() => filterMetaDecks(matching, { placements }), [matching, placements])
  const togglePlacement = (placement: string) => {
    setPlacements((current) => (current.includes(placement) ? current.filter((item) => item !== placement) : [...current, placement]))
    setDeckLimit(DECKS_PER_PAGE)
  }
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

      <section aria-labelledby="tournaments-list-title" className="grid gap-4">
        <Heading level="section" id="tournaments-list-title" className="sr-only">
          {t('meta.tournaments.listTitle')}
        </Heading>
        <div className="flex flex-wrap items-center gap-2">
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
        </div>
        {allPlacements.length > 0 ? (
          <FilterChips
            label={t('meta.tournaments.placementLabel')}
            all={t('meta.tournaments.placementAll')}
            allActive={placements.length === 0}
            onAll={() => {
              setPlacements([])
              setDeckLimit(DECKS_PER_PAGE)
            }}
            chips={allPlacements.map((placement) => ({
              key: placement,
              name: placement,
              count: placementCounts.get(placement) ?? 0,
              active: placements.includes(placement),
              onToggle: () => togglePlacement(placement),
              disabled: !placements.includes(placement) && !placementCounts.has(placement),
            }))}
          />
        ) : null}
        <p className="m-0 text-body text-muted">
          {t(filterLabel || placements.length > 0 ? 'meta.tournaments.decksFiltered' : 'meta.tournaments.decksAll', {
            count: decks.length,
            n: formatInteger(decks.length),
            region: region.toUpperCase(),
            weeks: formatInteger(Math.ceil(META_DECKS.windowDays / 7)),
          })}
        </p>
        {decks.length > 0 ? (
          <div className="grid gap-2 min-[560px]:grid-cols-2 min-[1101px]:grid-cols-3 min-[1101px]:gap-3 min-[1300px]:grid-cols-4">
            {decks.slice(0, deckLimit).map((deck) => (
              <MetaDeckTile key={deck.id} deck={deck} layout={isDesktop ? 'card' : 'row'} onOpen={() => openDeck(deck)} />
            ))}
          </div>
        ) : (
          <EmptyState icon="search" title={t('meta.tournaments.noDecksTitle')}>
            {t('meta.tournaments.noDecksHint')}
          </EmptyState>
        )}
        {decks.length > deckLimit ? (
          <div className="flex justify-center">
            <Button variant="secondary" size="sm" onClick={() => setDeckLimit((limit) => limit + DECKS_PER_PAGE)}>
              {t('meta.showMore', { count: formatInteger(Math.min(DECKS_PER_PAGE, decks.length - deckLimit)) })}
            </Button>
          </div>
        ) : null}
      </section>

      <MetaDeckModal deck={selectedDeck} onClose={() => openDeck(null)} onOpenDeck={openDeck} />
    </StepPage>
  )
}

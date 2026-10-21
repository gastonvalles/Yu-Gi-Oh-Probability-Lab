import { useEffect, useMemo, useState } from 'react'

import { META_DECKS, buildTournamentsHash, countPlacements, filterMetaDecks, metaMonth, metaPlacements, readTournamentsHash, type MetaDeck, type MetaDeckFilter } from '../../app/meta'
import { deckIdsWithReplay } from '../../app/replays'
import { useBriefLoading } from '../../app/use-brief-loading'
import { useInfiniteList } from '../../app/use-infinite-list'
import { useMediaQuery } from '../../app/use-media-query'
import { useAppSelector } from '../../app/store-hooks'
import { setMetaRegion, useMetaRegion } from '../../app/use-meta-region'
import { useToastMessage } from '../../app/use-toast-message'
import { formatInteger } from '../../app/utils'
import { t } from '../../i18n'
import { StepHero } from '../StepHero'
import { Button } from '../ui/Button'
import { cx } from '../ui/cx'
import { EmptyState } from '../ui/EmptyState'
import { FilterChips } from '../ui/FilterChips'
import { Heading } from '../ui/Heading'
import { Icon } from '../ui/Icon'
import { ScrollRow } from '../ui/ScrollRow'
import { SearchField } from '../ui/SearchField'
import { StepPage } from '../ui/StepPage'
import { filterChip } from '../ui/surfaces'
import { MetaDeckModal } from './MetaDeckModal'
import { MetaDeckSkeleton, MetaDeckTile } from './MetaDeckTile'
import { MetaHeroSide } from './MetaHeroSide'

/** Cuántos decks se suman cada vez que el final se acerca a la pantalla (cuatro filas de las seis columnas más anchas). */
const DECKS_PER_PAGE = 24
/** Desde acá (la mitad de una pantalla de escritorio) el deck es una tarjeta; más angosto, una fila: como en los replays, la grilla se llena a lo ancho sin dejar costados vacíos. */
const CARD_LAYOUT_QUERY = '(min-width: 560px)'
/** La grilla de tarjetas (y la de lugares vacíos de abajo): tantas columnas de 16,5 rem como entren, todas del mismo ancho; en el celular, filas de a una.
    Las tarjetas comparten filas (`grid-rows-subgrid`), así el nombre de dos líneas de una no corre la portada de las demás. */
const GRID = 'stagger m-0 grid list-none gap-2 p-0 min-[560px]:grid-cols-[repeat(auto-fill,minmax(16.5rem,1fr))] min-[560px]:gap-3'

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
  const layout = useMediaQuery(CARD_LAYOUT_QUERY) ? 'card' : 'row'
  const [link] = useState(readLink)
  // Arranca en la región del deck que pide el link o, si no, en la del formato del builder; después se cambia desde el encabezado.
  const region = useMetaRegion(link.deck?.region ?? (deckFormat === 'ocg' ? 'ocg' : 'tcg'))
  const [filter, setFilter] = useState<MetaDeckFilter | null>(link.filter)
  const [query, setQuery] = useState('')
  const [placements, setPlacements] = useState<string[]>([])
  // «Este mes» y «Con replay»: se pueden encender los dos y se suman a lo demás.
  const [thisMonth, setThisMonth] = useState(false)
  const [withReplay, setWithReplay] = useState(false)
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
  const month = useMemo(() => metaMonth(), [])
  const replayIds = useMemo(() => deckIdsWithReplay(), [])
  // Cada chip cuenta lo que daría con lo demás que está encendido (menos él mismo): «Este mes» con replay, y al revés.
  const monthOnly = useMemo(() => (thisMonth ? filterMetaDecks(matching, { month }) : matching), [matching, thisMonth, month])
  const flagged = useMemo(() => (withReplay ? filterMetaDecks(monthOnly, { ids: replayIds }) : monthOnly), [monthOnly, withReplay, replayIds])
  const placementCounts = useMemo(() => countPlacements(flagged), [flagged])
  const decks = useMemo(() => filterMetaDecks(flagged, { placements }), [flagged, placements])
  const monthCount = useMemo(
    () => filterMetaDecks(withReplay ? filterMetaDecks(matching, { ids: replayIds }) : matching, { placements, month }).length,
    [matching, placements, month, withReplay, replayIds],
  )
  const replayCount = useMemo(
    () => filterMetaDecks(thisMonth ? filterMetaDecks(matching, { month }) : matching, { placements, ids: replayIds }).length,
    [matching, placements, month, thisMonth, replayIds],
  )
  const toggleExtra = (set: (update: (current: boolean) => boolean) => void) => set((current) => !current)
  const togglePlacement = (placement: string) => setPlacements((current) => (current.includes(placement) ? current.filter((item) => item !== placement) : [...current, placement]))
  // Scroll infinito: de a una página y, al acercarse al final, la que sigue; otro filtro o búsqueda vuelve a la primera.
  const resetKey = `${region}|${query}|${placements.join(',')}|${thisMonth}|${withReplay}|${filter?.cardId ?? ''}|${filter?.archetype ?? ''}`
  const { limit, hasMore, loadMore, sentinel } = useInfiniteList(decks.length, DECKS_PER_PAGE, resetKey)
  // Al cambiar de filtro (no al escribir: cada letra no es un cambio de lista) se ven los lugares vacíos un segundo, como en los replays.
  const refreshing = useBriefLoading(`${region}|${placements.join(',')}|${thisMonth}|${withReplay}|${filter?.cardId ?? ''}|${filter?.archetype ?? ''}`)
  const filteredCardName = filter?.cardId === undefined ? undefined : META_DECKS.cards[String(filter.cardId)]?.name
  const filterLabel =
    filter?.archetype ??
    (filter?.cardId === undefined ? null : filteredCardName === undefined ? t('meta.tournaments.filterThatCard') : t('meta.tournaments.filterCard', { name: filteredCardName }))

  return (
    <StepPage as="article" wide>
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
          <MetaHeroSide region={region} onRegionChange={setMetaRegion} />
        }
      />

      <section aria-labelledby="tournaments-list-title" className="grid gap-4">
        <Heading level="section" id="tournaments-list-title" className="sr-only">
          {t('meta.tournaments.listTitle')}
        </Heading>
        {/* Arriba, como en los replays: una sola fila de chips que se desliza (los puestos, «Este mes» y «Con replay») y el buscador a la derecha; en el celular, el buscador primero. */}
        <div className="grid gap-3 min-[1101px]:grid-cols-[minmax(0,1fr)_auto] min-[1101px]:items-center min-[1101px]:gap-4">
          <ScrollRow>
            {filterLabel ? (
              <button type="button" className={cx(filterChip, 'shrink-0')} onClick={clearFilter} aria-label={t('meta.filter.clear', { name: filterLabel })}>
                <span className="truncate">{filterLabel}</span>
                <Icon name="x" size={12} strokeWidth={2.2} />
              </button>
            ) : null}
            {allPlacements.length > 0 ? (
              <FilterChips
                variant="scroll"
                label={t('meta.tournaments.placementLabel')}
                all={t('meta.tournaments.placementAll')}
                allActive={placements.length === 0}
                onAll={() => setPlacements([])}
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
            <FilterChips
              variant="scroll"
              label={t('meta.tournaments.extrasLabel')}
              chips={[
                { key: 'month', name: t('meta.tournaments.thisMonth'), count: monthCount, active: thisMonth, onToggle: () => toggleExtra(setThisMonth), disabled: !thisMonth && monthCount === 0 },
                { key: 'replay', name: t('meta.tournaments.withReplay'), count: replayCount, active: withReplay, onToggle: () => toggleExtra(setWithReplay), disabled: !withReplay && replayCount === 0 },
              ]}
            />
          </ScrollRow>
          <SearchField
            label={t('meta.tournaments.searchLabel')}
            value={query}
            placeholder={t('meta.tournaments.searchPlaceholder')}
            className="min-w-[14rem] max-[1101px]:order-first min-[1101px]:w-72"
            onChange={setQuery}
          />
        </div>
        <p className="m-0 text-body text-muted">
          {t(filterLabel || placements.length > 0 || thisMonth || withReplay ? 'meta.tournaments.decksFiltered' : 'meta.tournaments.decksAll', {
            count: decks.length,
            n: formatInteger(decks.length),
            region: region.toUpperCase(),
            weeks: formatInteger(Math.ceil(META_DECKS.windowDays / 7)),
          })}
        </p>
        {refreshing ? (
          <div role="status" aria-label={t('meta.tournaments.loading')} aria-busy="true" className={GRID}>
            {Array.from({ length: Math.min(DECKS_PER_PAGE, Math.max(decks.length, 3), 12) }, (_, slot) => (
              <MetaDeckSkeleton key={slot} layout={layout} />
            ))}
          </div>
        ) : decks.length > 0 ? (
          <div className={GRID}>
            {decks.slice(0, limit).map((deck) => (
              <MetaDeckTile key={deck.id} deck={deck} layout={layout} onOpen={() => openDeck(deck)} />
            ))}
          </div>
        ) : (
          <EmptyState icon="search" title={t('meta.tournaments.noDecksTitle')}>
            {t('meta.tournaments.noDecksHint')}
          </EmptyState>
        )}
        {/* El final de lo mostrado: cuando se acerca a la pantalla se cargan más (mientras tanto, una fila de lugares vacíos). Sin scrollear (lector de pantalla, teclado) está el botón. */}
        {hasMore && !refreshing ? (
          <>
            <div ref={sentinel} aria-hidden="true" className={GRID}>
              {[0, 1, 2].map((slot) => (
                <MetaDeckSkeleton key={slot} layout={layout} className={cx(slot === 1 && 'max-[560px]:hidden', slot === 2 && 'max-[560px]:hidden')} />
              ))}
            </div>
            <Button variant="secondary" size="sm" className="sr-only focus-visible:not-sr-only focus-visible:justify-self-center" onClick={loadMore}>
              {t('meta.showMore', { count: formatInteger(Math.min(DECKS_PER_PAGE, decks.length - limit)) })}
            </Button>
          </>
        ) : null}
      </section>

      <MetaDeckModal deck={selectedDeck} onClose={() => openDeck(null)} onOpenDeck={openDeck} />
    </StepPage>
  )
}

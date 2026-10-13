import { useEffect, useState } from 'react'

import { cardImageSrc } from '../../app/card-image-source'
import { replaceDeckBuilder } from '../../app/deck-builder-slice'
import { buildDeckImportPreviewFromYdk } from '../../app/deck-import'
import {
  META_DECKS,
  buildMetaDeckHash,
  countCopies,
  coverArtUrl,
  loadMetaDecklist,
  toYdkText,
  type MetaDeck,
  type MetaDecklist,
} from '../../app/meta-handtraps'
import { beginMascotActivity } from '../../app/mascot'
import type { DeckCardInstance, DeckZone as DeckZoneKey } from '../../app/model'
import { buildReplaysHash, countReplaysOfDeck } from '../../app/replays'
import { useAppDispatch, useAppSelector } from '../../app/store-hooks'
import { DESKTOP_DECK_BUILDER_MEDIA_QUERY, useMediaQuery } from '../../app/use-media-query'
import { useToastMessage } from '../../app/use-toast-message'
import { formatInteger } from '../../app/utils'
import { t } from '../../i18n'
import { fetchCardsByIds, type ApiCardSearchResult } from '../../ygoprodeck'
import { CardDetailModal } from '../card-detail/CardDetailModal'
import { DeckBuilderClassicPreview } from '../deck-mode/DeckBuilderClassicPreview'
import { DeckZone } from '../DeckZone'
import { ConfirmDialog } from '../probability/ConfirmDialog'
import { Heading } from '../ui/Heading'
import { Badge } from '../ui/Badge'
import { Button } from '../ui/Button'
import { Callout } from '../ui/Callout'
import { Icon } from '../ui/Icon'
import { Modal } from '../ui/Modal'
import { Skeleton } from '../ui/Skeleton'
import { formatMetaDate } from './meta-format'

/** Las cartas de un deck de torneo no cambian: un día en el dispositivo evita volver a pedirlas. */
const DECK_CARDS_PERSIST_MS = 24 * 60 * 60 * 1000
// Los mismos títulos que el builder: la vista clásica muestra "Main [41]".
const ZONE_ITEMS = [
  { zone: 'main', titleKey: 'meta.deckModal.zoneMain' },
  { zone: 'extra', titleKey: 'meta.deckModal.zoneExtra' },
  { zone: 'side', titleKey: 'meta.deckModal.zoneSide' },
] as const satisfies ReadonlyArray<{ zone: DeckZoneKey; titleKey: string }>
const HANDTRAP_IDS: ReadonlySet<number> = new Set(Object.keys(META_DECKS.cards).map(Number))
const noop = () => {}

interface LoadedDeck {
  decklist: MetaDecklist
  cards: ApiCardSearchResult[]
  zones: Record<DeckZoneKey, DeckCardInstance[]>
  /** La carta que se muestra en el panel de la izquierda hasta que se toca otra: la portada, o la primera del Main. */
  defaultCard: ApiCardSearchResult | null
}

type LoadState = { status: 'loading' } | { status: 'error'; message: string } | { status: 'ready'; deck: LoadedDeck }

interface MetaDeckModalProps {
  deck: MetaDeck | null
  onClose: () => void
}

/**
 * Un Tournament Meta Deck completo sin salir de la app, con la estructura del builder: la carta elegida a la
 * izquierda y las zonas a la derecha (en mobile, el detalle se abre al tocar). Se puede cargar en el builder.
 */
export function MetaDeckModal({ deck, onClose }: MetaDeckModalProps) {
  const dispatch = useAppDispatch()
  const deckFormat = useAppSelector((state) => state.settings.deckFormat)
  const builderHasCards = useAppSelector(
    (state) => state.deckBuilder.main.length + state.deckBuilder.extra.length + state.deckBuilder.side.length > 0,
  )
  const isDesktop = useMediaQuery(DESKTOP_DECK_BUILDER_MEDIA_QUERY)
  const { showToast } = useToastMessage()
  const [load, setLoad] = useState<LoadState>({ status: 'loading' })
  const [attempt, setAttempt] = useState(0)
  const [selectedCard, setSelectedCard] = useState<ApiCardSearchResult | null>(null)
  const [confirmReplace, setConfirmReplace] = useState(false)
  const deckId = deck?.id ?? null
  const cover = deck?.cover ?? null

  useEffect(() => {
    if (deckId === null) {
      return
    }

    let cancelled = false
    setLoad({ status: 'loading' })
    setSelectedCard(null)
    const endMascotActivity = beginMascotActivity('loading')

    void (async () => {
      try {
        const decklist = await loadMetaDecklist(deckId)

        if (!decklist) {
          throw new Error(t('meta.deckModal.noDecklist'))
        }

        const ids = [...new Set([...decklist.main, ...decklist.extra, ...decklist.side].map(([id]) => id))]
        const cards = await fetchCardsByIds(ids, { persistForMs: DECK_CARDS_PERSIST_MS })

        if (!cancelled) {
          setLoad({ status: 'ready', deck: buildLoadedDeck(decklist, cards, cover) })
        }
      } catch (error) {
        if (!cancelled) {
          setLoad({ status: 'error', message: error instanceof Error ? error.message : t('meta.deckModal.loadFailed') })
        }
      } finally {
        endMascotActivity()
      }
    })()

    return () => {
      cancelled = true
    }
  }, [deckId, cover, attempt])

  if (!deck) {
    return null
  }

  const loadIntoBuilder = () => {
    if (load.status !== 'ready') {
      return
    }

    const preview = buildDeckImportPreviewFromYdk({
      cards: load.deck.cards,
      deckFormat,
      deckName: deck.name,
      text: toYdkText(load.deck.decklist),
      source: { label: t('meta.deckModal.importSource') },
    })
    const missing = preview.requestedCardCount - preview.importedCardCount

    dispatch(replaceDeckBuilder(preview.importedDeck))
    showToast(
      missing > 0 ? t('meta.deckModal.loadedMissing', { name: deck.name, count: missing }) : t('meta.deckModal.loaded', { name: deck.name }),
      missing > 0 ? 'warning' : 'success',
    )
    setConfirmReplace(false)
    onClose()
    window.location.hash = '#deck-builder'
  }

  /** El link directo a este deck (la pestaña Meta con el id), para mandarlo por chat. */
  const copyLink = async () => {
    const url = `${window.location.origin}${window.location.pathname}${buildMetaDeckHash(deck.id)}`

    try {
      await navigator.clipboard.writeText(url)
      showToast(t('meta.deckModal.linkCopied'), 'success')
    } catch {
      showToast(t('meta.deckModal.copyFailed', { url }), 'error')
    }
  }

  const handleCardClick = (instanceId: string) => {
    if (load.status !== 'ready') {
      return
    }

    const [zone] = instanceId.split(':') as [DeckZoneKey]
    const card = load.deck.zones[zone]?.find((instance) => instance.instanceId === instanceId)?.apiCard as ApiCardSearchResult | undefined

    if (card) {
      setSelectedCard(card)
    }
  }

  const replayCount = countReplaysOfDeck(deck.id)
  // Cada pedazo es una frase suelta y van en el mismo orden en los dos idiomas: "Llegó a Top 8 en YCS Paris (500 jugadores)".
  const summary = [
    deck.placement ? t('meta.deckModal.reached', { placement: deck.placement }) : null,
    deck.tournament ? t('meta.deckModal.at', { tournament: deck.tournament }) : null,
    deck.players === null ? null : t('meta.deck.players', { players: formatInteger(deck.players) }),
  ]
    .filter(Boolean)
    .join(' ')

  return (
    <>
      <Modal
        isOpen
        onClose={onClose}
        size="full"
        bare
        flush
        ariaLabel={deck.name}
        footer={
          // En mobile los dos botones van en la misma fila: copiar a la izquierda, cargar a la derecha.
          <div className="flex w-full items-center justify-between gap-2 min-[1101px]:w-auto min-[1101px]:justify-end">
            <Button variant="secondary" size="sm" icon="link" onClick={() => void copyLink()}>
              {t('meta.deckModal.copyLink')}
            </Button>
            <Button
              variant="primary"
              size="sm"
              icon="upload"
              disabled={load.status !== 'ready'}
              onClick={() => (builderHasCards ? setConfirmReplace(true) : loadIntoBuilder())}
            >
              {t('meta.deckModal.loadInBuilder')}
            </Button>
          </div>
        }
      >
        <div className="grid h-full min-h-0 grid-rows-[auto_minmax(0,1fr)]">
          {/* El encabezado de YGOPRODeck: la portada de fondo y los datos del torneo encima. */}
          <header
            className="grid gap-1 border-b border-border-subtle bg-card-background px-4 py-3 pr-14 min-[1101px]:px-5"
            style={
              cover === null
                ? undefined
                : {
                    backgroundImage: `linear-gradient(90deg, rgb(19 15 43 / 0.97) 40%, rgb(19 15 43 / 0.6)), url(${cardImageSrc(coverArtUrl(cover))})`,
                    backgroundSize: 'cover',
                    backgroundPosition: 'right center',
                  }
            }
          >
            <div className="flex flex-wrap items-baseline gap-x-3 gap-y-0.5">
              <Heading level="section" as="h3">
                {deck.name}
              </Heading>
              {summary ? <span className="text-body text-muted">{summary}</span> : null}
            </div>
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-micro text-muted">
              {deck.player ? (
                <span className="inline-flex items-center gap-1">
                  <Icon name="user" size={13} />
                  {deck.player}
                </span>
              ) : null}
              <span className="inline-flex items-center gap-1">
                <Icon name="calendar" size={13} />
                {formatMetaDate(deck.date)}
              </span>
              <Badge tone="success" size="sm" dot>
                {t('meta.deck.handtraps', { main: formatInteger(countCopies(deck.main)), side: formatInteger(countCopies(deck.side)) })}
              </Badge>
              {replayCount > 0 ? (
                // Los replays de los duelos de este deck, en la pestaña Replays (el click cierra el modal y el link cambia de pestaña).
                <a
                  href={buildReplaysHash({ deck: deck.id })}
                  className="inline-flex items-center gap-1 font-semibold text-primary-soft underline-offset-2 hover:underline focus-visible:outline-none focus-visible:shadow-focus"
                  onClick={onClose}
                >
                  <Icon name="play" size={13} variant="bold" />
                  {t('meta.deckModal.watchReplays', { count: replayCount })}
                </a>
              ) : null}
            </div>
          </header>

          {load.status === 'loading' ? (
            <div className="grid content-start gap-3 p-4" aria-busy="true" aria-label={t('meta.deckModal.loading')}>
              <Skeleton radius="panel" className="h-64" />
              <Skeleton radius="panel" className="h-20" />
              <Skeleton radius="panel" className="h-20" />
            </div>
          ) : null}

          {load.status === 'error' ? (
            <div className="p-4">
              <Callout
                tone="danger"
                title={t('meta.deckModal.errorTitle')}
                action={
                  <Button variant="secondary" size="sm" icon="refresh" onClick={() => setAttempt((count) => count + 1)}>
                    {t('meta.deckModal.retry')}
                  </Button>
                }
              >
                {load.message}
              </Callout>
            </div>
          ) : null}

          {load.status === 'ready' ? (
            // Las mismas dos primeras columnas del builder clásico: la carta elegida y las zonas.
            <div className="grid h-full min-h-0 min-[1101px]:grid-cols-[minmax(260px,24%)_minmax(0,1fr)]">
              {isDesktop ? (
                <DeckBuilderClassicPreview card={selectedCard ?? load.deck.defaultCard} source={null} deckCopy={null} onAddToZone={noop} />
              ) : null}
              <div className="grid h-full min-h-0 content-start gap-4 overflow-y-auto overflow-x-hidden px-4 pb-6 pt-4 [scrollbar-gutter:stable] [scrollbar-width:thin] min-[1101px]:px-8 min-[1101px]:max-[1500px]:px-5">
                {ZONE_ITEMS.map(({ zone, titleKey }) =>
                  load.deck.zones[zone].length === 0 ? null : (
                    <DeckZone
                      key={zone}
                      zone={zone}
                      title={t(titleKey)}
                      cards={load.deck.zones[zone]}
                      activeDragInstanceId={null}
                      desktopCompact={isDesktop}
                      variant={isDesktop ? 'classic-builder' : 'default'}
                      selectedCardId={(selectedCard ?? load.deck.defaultCard)?.ygoprodeckId ?? null}
                      highlightedCardIds={HANDTRAP_IDS}
                      readOnly
                      onClearZone={noop}
                      onSortZone={noop}
                      onDeckCardPointerDown={noop}
                      onDeckCardClick={handleCardClick}
                      onRemoveCard={noop}
                    />
                  ),
                )}
              </div>
            </div>
          ) : null}
        </div>
      </Modal>

      {/* En mobile no hay panel lateral: la carta tocada se abre en su detalle, como en el builder. */}
      <CardDetailModal
        card={selectedCard}
        deckFormat={deckFormat}
        isOpen={!isDesktop && selectedCard !== null}
        showActions={false}
        onAddToZone={() => false}
        onClose={() => setSelectedCard(null)}
      />

      <ConfirmDialog
        isOpen={confirmReplace}
        title={t('meta.deckModal.replaceTitle')}
        description={t('meta.deckModal.replaceBody', { name: deck.name })}
        confirmLabel={t('meta.deckModal.replaceConfirm')}
        onCancel={() => setConfirmReplace(false)}
        onConfirm={loadIntoBuilder}
      />
    </>
  )
}

function buildLoadedDeck(decklist: MetaDecklist, cards: ApiCardSearchResult[], cover: number | null): LoadedDeck {
  const cardsById = new Map(cards.map((card) => [card.ygoprodeckId, card]))
  const build = (zone: DeckZoneKey): DeckCardInstance[] =>
    decklist[zone].flatMap(([id, copies]) => {
      const card = cardsById.get(id)

      if (!card) {
        return []
      }

      return Array.from({ length: copies }, (_, copy) => ({
        instanceId: `${zone}:${id}:${copy}`,
        name: card.name,
        origin: null,
        roles: [],
        needsReview: false,
        apiCard: card,
      }))
    })
  const zones = { main: build('main'), extra: build('extra'), side: build('side') }

  return {
    decklist,
    cards,
    zones,
    defaultCard: (cover === null ? null : cardsById.get(cover)) ?? (zones.main[0]?.apiCard as ApiCardSearchResult | undefined) ?? null,
  }
}

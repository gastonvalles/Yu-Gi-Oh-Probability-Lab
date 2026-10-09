import { useEffect, useState } from 'react'

import { replaceDeckBuilder } from '../../app/deck-builder-slice'
import { buildDeckImportPreviewFromYdk } from '../../app/deck-import'
import {
  countCopies,
  coverArtUrl,
  isMetaHandtrap,
  loadMetaDecklist,
  toYdkText,
  type MetaDeck,
  type MetaDecklist,
} from '../../app/meta-handtraps'
import { useAppDispatch, useAppSelector } from '../../app/store-hooks'
import { useToastMessage } from '../../app/use-toast-message'
import { formatInteger } from '../../app/utils'
import { fetchCardsByIds, type ApiCardSearchResult } from '../../ygoprodeck'
import { CardArt } from '../CardArt'
import { CardDetailModal } from '../card-detail/CardDetailModal'
import { ConfirmDialog } from '../probability/ConfirmDialog'
import { Badge } from '../ui/Badge'
import { Button } from '../ui/Button'
import { Callout } from '../ui/Callout'
import { cx } from '../ui/cx'
import { Icon } from '../ui/Icon'
import { Modal } from '../ui/Modal'
import { Skeleton } from '../ui/Skeleton'
import { overline } from '../ui/typography'
import { LINK_CHIP, formatMetaDate } from './meta-format'

/** Las cartas de un deck de torneo no cambian: un día en el dispositivo evita volver a pedirlas. */
const DECK_CARDS_PERSIST_MS = 24 * 60 * 60 * 1000
const ZONES = [
  { key: 'main', label: 'Main' },
  { key: 'extra', label: 'Extra' },
  { key: 'side', label: 'Side' },
] as const
const ZONE_STYLE = {
  main: 'bg-(--zone-main-background)',
  extra: 'bg-(--zone-extra-background)',
  side: 'bg-(--zone-side-background)',
} as const

type LoadState =
  | { status: 'loading' }
  | { status: 'error'; message: string }
  | { status: 'ready'; decklist: MetaDecklist; cards: Map<number, ApiCardSearchResult> }

interface MetaDeckModalProps {
  deck: MetaDeck | null
  onClose: () => void
}

/** Un Tournament Meta Deck completo, como en YGOPRODeck pero sin salir de la app; se puede cargar en el builder. */
export function MetaDeckModal({ deck, onClose }: MetaDeckModalProps) {
  const dispatch = useAppDispatch()
  const deckFormat = useAppSelector((state) => state.settings.deckFormat)
  const builderHasCards = useAppSelector(
    (state) => state.deckBuilder.main.length + state.deckBuilder.extra.length + state.deckBuilder.side.length > 0,
  )
  const { showToast } = useToastMessage()
  const [load, setLoad] = useState<LoadState>({ status: 'loading' })
  const [attempt, setAttempt] = useState(0)
  const [detailCard, setDetailCard] = useState<ApiCardSearchResult | null>(null)
  const [confirmReplace, setConfirmReplace] = useState(false)
  const deckId = deck?.id ?? null

  useEffect(() => {
    if (deckId === null) {
      return
    }

    let cancelled = false
    setLoad({ status: 'loading' })

    void (async () => {
      try {
        const decklist = await loadMetaDecklist(deckId)

        if (!decklist) {
          throw new Error('No tengo la lista completa de este deck.')
        }

        const ids = [...new Set([...decklist.main, ...decklist.extra, ...decklist.side].map(([id]) => id))]
        const cards = await fetchCardsByIds(ids, { persistForMs: DECK_CARDS_PERSIST_MS })

        if (!cancelled) {
          setLoad({ status: 'ready', decklist, cards: new Map(cards.map((card) => [card.ygoprodeckId, card])) })
        }
      } catch (error) {
        if (!cancelled) {
          setLoad({ status: 'error', message: error instanceof Error ? error.message : 'No se pudo cargar el deck.' })
        }
      }
    })()

    return () => {
      cancelled = true
    }
  }, [deckId, attempt])

  if (!deck) {
    return null
  }

  const loadIntoBuilder = () => {
    if (load.status !== 'ready') {
      return
    }

    const preview = buildDeckImportPreviewFromYdk({
      cards: [...load.cards.values()],
      deckFormat,
      deckName: deck.name,
      text: toYdkText(load.decklist),
      source: { label: 'YGOPRODeck' },
    })
    const missing = preview.requestedCardCount - preview.importedCardCount

    dispatch(replaceDeckBuilder(preview.importedDeck))
    showToast(
      missing > 0
        ? `${deck.name} cargado en el builder con ${formatInteger(missing)} cartas menos (fuera del formato o desconocidas).`
        : `${deck.name} cargado en el builder.`,
      missing > 0 ? 'warning' : 'success',
    )
    setConfirmReplace(false)
    onClose()
    window.location.hash = '#deck-builder'
  }

  const summary = [
    deck.placement ? `Llegó a ${deck.placement}` : null,
    deck.tournament ? `en ${deck.tournament}` : null,
    deck.players === null ? null : `(${formatInteger(deck.players)} jugadores)`,
  ]
    .filter(Boolean)
    .join(' ')

  return (
    <>
      <Modal
        isOpen
        onClose={onClose}
        size="xl"
        bare
        ariaLabel={deck.name}
        footer={
          <>
            {deck.url ? (
              <a className={LINK_CHIP} href={`https://ygoprodeck.com/deck/${deck.url}`} target="_blank" rel="noreferrer">
                Ver en YGOPRODeck
                <Icon name="arrow-right" size={12} />
              </a>
            ) : null}
            <Button
              variant="primary"
              size="sm"
              icon="upload"
              disabled={load.status !== 'ready'}
              onClick={() => (builderHasCards ? setConfirmReplace(true) : loadIntoBuilder())}
            >
              Cargar en el builder
            </Button>
          </>
        }
      >
        <div className="grid gap-4">
          {/* El encabezado de YGOPRODeck: la portada de fondo y los datos del torneo encima. */}
          <header
            className="relative grid gap-1 overflow-hidden rounded-card border border-border-subtle bg-card-background p-4 pr-12 min-[700px]:p-5 min-[700px]:pr-14"
            style={
              deck.cover
                ? {
                    backgroundImage: `linear-gradient(90deg, rgb(19 15 43 / 0.97) 30%, rgb(19 15 43 / 0.55)), url(${coverArtUrl(deck.cover)})`,
                    backgroundSize: 'cover',
                    backgroundPosition: 'right center',
                  }
                : undefined
            }
          >
            <h3 className="m-0 text-title font-semibold tracking-[-0.01em] text-foreground">{deck.name}</h3>
            {summary ? <p className="m-0 text-body text-muted">{summary}</p> : null}
            <p className="m-0 flex flex-wrap items-center gap-x-3 gap-y-1 text-body text-muted">
              {deck.player ? (
                <span className="inline-flex items-center gap-1.5">
                  <Icon name="user" size={15} />
                  {deck.player}
                </span>
              ) : null}
              <span className="inline-flex items-center gap-1.5">
                <Icon name="calendar" size={15} />
                {formatMetaDate(deck.date)}
              </span>
            </p>
            <div className="mt-2 flex flex-wrap gap-1.5">
              {load.status === 'ready'
                ? ZONES.map(({ key, label }) => (
                    <Badge key={key} tone="brand">
                      {label} {formatInteger(countCopies(load.decklist[key]))}
                    </Badge>
                  ))
                : null}
              <Badge tone="success" dot>
                Hand traps: {formatInteger(countCopies(deck.main))} en Main · {formatInteger(countCopies(deck.side))} en Side
              </Badge>
            </div>
          </header>

          {load.status === 'loading' ? (
            <div className="grid gap-3" aria-busy="true" aria-label="Cargando el deck">
              <Skeleton radius="panel" className="h-44" />
              <Skeleton radius="panel" className="h-16" />
              <Skeleton radius="panel" className="h-16" />
            </div>
          ) : null}

          {load.status === 'error' ? (
            <Callout
              tone="danger"
              title="No se pudo cargar el deck"
              action={
                <Button variant="secondary" size="sm" icon="refresh" onClick={() => setAttempt((count) => count + 1)}>
                  Reintentar
                </Button>
              }
            >
              {load.message}
            </Callout>
          ) : null}

          {load.status === 'ready'
            ? ZONES.map(({ key, label }) =>
                load.decklist[key].length === 0 ? null : (
                  <section key={key} className="grid gap-1.5" aria-label={label}>
                    <span className={overline}>
                      {label} <span className="tabular-nums">[{formatInteger(countCopies(load.decklist[key]))}]</span>
                    </span>
                    <div className={cx('grid grid-cols-5 gap-1 rounded-card p-1.5 sm:grid-cols-8 min-[1101px]:grid-cols-10', ZONE_STYLE[key])}>
                      {load.decklist[key].flatMap(([id, copies]) =>
                        Array.from({ length: copies }, (_, copy) => {
                          const card = load.cards.get(id) ?? null
                          const name = card?.name ?? `Carta ${formatInteger(id)}`
                          const handtrap = isMetaHandtrap(id)

                          return (
                            <button
                              key={`${id}-${copy}`}
                              type="button"
                              className={cx(
                                'relative min-w-0 cursor-pointer border-0 bg-transparent p-0 focus-visible:outline-none focus-visible:shadow-focus disabled:cursor-default',
                                // Las hand traps se marcan: es lo que el tier list está contando.
                                handtrap && '-outline-offset-2 outline-2 outline-success/90',
                              )}
                              title={handtrap ? `${name} (hand trap)` : name}
                              disabled={!card}
                              onClick={() => setDetailCard(card)}
                            >
                              <CardArt
                                remoteUrl={card?.imageUrlSmall ?? card?.imageUrl ?? null}
                                name={name}
                                className="block aspect-[0.72] w-full bg-input object-cover"
                                limitCard={card}
                                limitBadgeSize="sm"
                              />
                            </button>
                          )
                        }),
                      )}
                    </div>
                  </section>
                ),
              )
            : null}
        </div>
      </Modal>

      <CardDetailModal
        card={detailCard}
        deckFormat={deckFormat}
        isOpen={detailCard !== null}
        showActions={false}
        onAddToZone={() => false}
        onClose={() => setDetailCard(null)}
      />

      <ConfirmDialog
        isOpen={confirmReplace}
        title="¿Reemplazar tu deck?"
        description={`El builder ya tiene cartas. Se reemplazan por ${deck.name}; lo que tenías no se guarda.`}
        confirmLabel="Reemplazar"
        onCancel={() => setConfirmReplace(false)}
        onConfirm={loadIntoBuilder}
      />
    </>
  )
}

import { useEffect, useEffectEvent, useRef, useState, type ReactNode } from 'react'

import type { BotDeckList } from '../../app/bot-deck-lists'
import { cardSmallImageUrl } from '../../app/card-prices'
import { Presence } from '../../app/use-presence'
import { t } from '../../i18n'
import { fetchCardsByIds, type ApiCardSearchResult } from '../../ygoprodeck'
import { CardArt } from '../CardArt'
import { CardZoom } from '../card-detail/CardZoom'
import { Button } from '../ui/Button'
import { Callout } from '../ui/Callout'
import { CopiesBadge } from '../ui/CopiesBadge'
import { cx } from '../ui/cx'
import { EmptyState } from '../ui/EmptyState'
import { Modal } from '../ui/Modal'
import { Segmented } from '../ui/Segmented'
import { Skeleton } from '../ui/Skeleton'

type Zone = 'main' | 'extra'
type Pairs = BotDeckList['main']
type Load = { status: 'loading' } | { status: 'error'; message: string } | { status: 'ready'; cards: ReadonlyMap<number, ApiCardSearchResult> }

const ZONES: readonly Zone[] = ['main', 'extra']
/** Las listas de los bots son fijas: un día en el dispositivo (Cache API, como los decks de torneo) evita volver a pedirlas. */
const DECK_CARDS_PERSIST_MS = 24 * 60 * 60 * 1000
const fetchDeckCards = (ids: number[]) => fetchCardsByIds(ids, { persistForMs: DECK_CARDS_PERSIST_MS })
const total = (pairs: Pairs) => pairs.reduce((sum, [, copies]) => sum + copies, 0)

interface BotDeckSheetProps {
  isOpen: boolean
  /** La lista fija del bot (`bot-deck-lists.ts`); sin lista no se abre. */
  deck: BotDeckList | null
  onClose: () => void
  /** La acción principal, abajo («Jugar contra X»). */
  footer?: ReactNode
  /** De dónde salen los nombres y las imágenes: YGOPRODeck por id, en un solo pedido; el `/playground` y las pruebas pasan uno sin red. */
  loadCards?: (ids: number[]) => Promise<ApiCardSearchResult[]>
}

/**
 * «Ver mazo» de un bot: su lista fija, de sólo lectura. Un solo selector «Main · 42 | Extra · 15» y la grilla de cartas de 5 por fila, con «×N» si lleva más de una copia; tocar una
 * carta la abre en grande (`CardZoom`, con ← → por la misma parte del mazo) y al cerrarla se vuelve a la hoja. Las cartas se piden juntas la primera vez que se abre la de ese bot
 * (un pedido, sin el catálogo entero) y quedan mientras la pantalla siga abierta. Las dos grillas ocupan la misma celda: la hoja no cambia de alto al pasar de Main a Extra.
 */
export function BotDeckSheet({ isOpen, deck, onClose, footer, loadCards = fetchDeckCards }: BotDeckSheetProps) {
  const [zone, setZone] = useState<Zone>('main')
  const [announce, setAnnounce] = useState('')
  const [zoomed, setZoomed] = useState<number | null>(null)
  const [state, setState] = useState<{ id: string; load: Load } | null>(null)
  const [attempt, setAttempt] = useState(0)
  const [wasOpen, setWasOpen] = useState(isOpen)
  // El mazo cuyas cartas ya llegaron: volver a abrirlo no pide nada.
  const readyId = useRef<string | null>(null)
  const fetchCards = useEffectEvent((ids: number[]) => loadCards(ids))

  // Cada vez que se abre, en el Main y sin carta en grande.
  if (wasOpen !== isOpen) {
    setWasOpen(isOpen)
    setZone('main')
    setAnnounce('')
    setZoomed(null)
  }

  useEffect(() => {
    if (!isOpen || !deck || readyId.current === deck.id) return
    let alive = true
    const ids = [...new Set([...deck.main, ...deck.extra].map(([id]) => id))]

    setState({ id: deck.id, load: { status: 'loading' } })
    fetchCards(ids).then(
      (cards) => {
        if (!alive) return
        // Sin ninguna carta (lo vacío) se vuelve a pedir: reintentar o reabrir.
        if (cards.length > 0) readyId.current = deck.id
        setState({ id: deck.id, load: { status: 'ready', cards: new Map(cards.map((card) => [card.ygoprodeckId, card])) } })
      },
      (error: unknown) => {
        if (alive) setState({ id: deck.id, load: { status: 'error', message: error instanceof Error && error.message ? error.message : t('solo.deck.errorBody') } })
      },
    )

    return () => {
      alive = false
    }
  }, [isOpen, deck, attempt])

  if (!deck) return null

  const load: Load = state?.id === deck.id ? state.load : { status: 'loading' }
  const resolved = (pairs: Pairs) => (load.status === 'ready' ? pairs.flatMap(([id, copies]) => (load.cards.has(id) ? [{ card: load.cards.get(id)!, copies }] : [])) : [])
  const shown = resolved(deck[zone])
  const zoomCard = zoomed === null ? null : (shown[zoomed]?.card ?? null)
  const retry = (
    <Button variant="secondary" size="sm" icon="refresh" onClick={() => setAttempt((count) => count + 1)}>
      {t('solo.deck.retry')}
    </Button>
  )
  const tab = (key: Zone) => t(key === 'main' ? 'solo.deck.main' : 'solo.deck.extra', { count: total(deck[key]) })

  // Una grilla por parte del mazo, las dos en la misma celda: la que no se ve guarda el alto (la más larga manda) y no se lee ni se toca.
  const grid = (key: Zone) => {
    const off = key !== zone
    const tiles = 'm-0 grid list-none grid-cols-5 gap-1.5 p-0'

    return (
      <div key={key} aria-hidden={off || undefined} inert={off} className={cx('col-start-1 row-start-1 min-w-0', off && 'invisible')}>
        {load.status === 'loading' ? (
          <div aria-busy="true" aria-label={t('solo.deck.loading')} className={tiles}>
            {deck[key].map(([id], index) => (
              <Skeleton key={`${id}-${index}`} radius="none" className="aspect-[421/614]" />
            ))}
          </div>
        ) : load.status === 'ready' ? (
          <ul aria-label={tab(key)} className={tiles}>
            {resolved(deck[key]).map(({ card, copies }, index) => (
              <li key={`${card.ygoprodeckId}-${index}`} className="min-w-0">
                <button
                  type="button"
                  aria-haspopup="dialog"
                  aria-label={copies > 1 ? t('solo.deck.cardCopies', { name: card.name, count: copies }) : card.name}
                  className="relative block w-full rounded-none bg-transparent p-0 focus-visible:outline-none focus-visible:shadow-focus"
                  onClick={() => setZoomed(index)}
                >
                  <span className="block aspect-[421/614] overflow-hidden bg-input shadow-[0_4px_10px_rgba(0,0,0,0.4)]">
                    <CardArt tilt remoteUrl={card.imageUrlSmall ?? cardSmallImageUrl(card.ygoprodeckId)} name={card.name} className="block h-full w-full object-cover" />
                  </span>
                  {copies > 1 ? <CopiesBadge copies={copies} placement="overlay" /> : null}
                </button>
              </li>
            ))}
          </ul>
        ) : null}
      </div>
    )
  }

  return (
    <>
      <Modal isOpen={isOpen} onClose={onClose} size="keypad" title={t('solo.deck.title', { name: deck.name })} footer={footer}>
        <div className="grid min-w-0 gap-4">
          <Segmented<Zone>
            label={t('solo.deck.zones')}
            fullWidth
            value={zone}
            onChange={(next) => {
              setZone(next)
              setAnnounce(t(next === 'main' ? 'solo.deck.liveMain' : 'solo.deck.liveExtra', { count: total(deck[next]) }))
            }}
            options={ZONES.map((key) => ({ value: key, label: tab(key) }))}
          />
          <p aria-live="polite" className="sr-only">
            {announce}
          </p>
          {load.status === 'error' ? (
            <Callout tone="danger" title={t('solo.deck.error')} action={retry}>
              {load.message}
            </Callout>
          ) : load.status === 'ready' && load.cards.size === 0 ? (
            <EmptyState icon="cards" title={t('solo.deck.empty')} actions={retry} />
          ) : (
            <div className="grid min-w-0">{ZONES.map(grid)}</div>
          )}
        </div>
      </Modal>
      <Presence>
        {isOpen && zoomCard ? (
          <CardZoom
            card={zoomCard}
            name={zoomCard.name}
            fallbackUrl={cardSmallImageUrl(zoomCard.ygoprodeckId)}
            navigation={{ onPrevious: zoomed! > 0 ? () => setZoomed(zoomed! - 1) : null, onNext: zoomed! < shown.length - 1 ? () => setZoomed(zoomed! + 1) : null }}
            onClose={() => setZoomed(null)}
          />
        ) : null}
      </Presence>
    </>
  )
}

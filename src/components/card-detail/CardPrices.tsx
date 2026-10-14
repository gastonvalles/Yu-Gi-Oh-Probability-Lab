import { useState } from 'react'

import { cardImageSrc } from '../../app/card-image-source'
import { buildExpansionsHash, filterPrintings, setImageUrl, type PrintingPrice } from '../../app/card-prices'
import { useCardPrices } from '../../app/use-card-prices'
import { formatUsd } from '../../app/utils'
import { formatDay as formatDate, t } from '../../i18n'
import { Badge } from '../ui/Badge'
import { Heading } from '../ui/Heading'
import { cx } from '../ui/cx'
import { Icon } from '../ui/Icon'
import { IconButton } from '../ui/IconButton'
import { Modal } from '../ui/Modal'
import { Skeleton } from '../ui/Skeleton'
import { PrintingArt } from './PrintingArt'
import { field } from '../ui/surfaces'

/** "2026-10-11" → "11/10/2026" (en inglés, "Oct 11, 2026"). Un día con otra forma se muestra tal cual. */
function formatDay(day: string): string {
  const date = new Date(`${day}T00:00:00Z`)

  return Number.isNaN(date.getTime()) ? day : formatDate(date, 'UTC')
}

/** El encabezado del Meta: la imagen a la derecha y un degradado oscuro que la deja leer el texto de la izquierda. Acá, el sobre de la expansión. */
const packBackground = (code: string) => ({
  backgroundImage: `linear-gradient(90deg, rgb(var(--card-background-rgb) / 0.97) 40%, rgb(var(--card-background-rgb) / 0.6)), url(${cardImageSrc(setImageUrl(code))})`,
  // Un poco más grande que la franja para que no asomen los bordes blancos del sobre, y centrado en la ilustración.
  backgroundSize: '115% auto',
  backgroundPosition: '50% 35%',
})

/**
 * El botón de precios: un ícono blanco con una moneda que se pone verde al pasar el mouse, como los demás de la app. Va siempre afuera de la carta
 * (que se inclina en 3D hacia el mouse), así que no se mueve con ella; el que lo usa le da la posición y qué hacer al tocarlo.
 */
export function CardPricesButton({ onClick, className }: { onClick: () => void; className?: string }) {
  return (
    <IconButton
      tone="raised"
      size="lg"
      aria-label={t('search.prices.button')}
      title={t('search.prices.button')}
      className={className}
      onClick={(event) => {
        // Está sobre un fondo que se cierra al tocarlo (y al lado de una carta que se agranda): acá sólo se abren los precios.
        event.stopPropagation()
        onClick()
      }}
    >
      <Icon name="dollar" />
    </IconButton>
  )
}

/**
 * Una expansión: su encabezado con el sobre de fondo y, debajo, el precio de mercado de cada impresión de la carta. Tocar una impresión lleva a la vista
 * de Expansiones, con esa carta iluminada (ahí está el link a su producto en TCGplayer).
 */
function ExpansionPrices({ set, prices, cardId, onOpenPrint }: { set: string; prices: PrintingPrice[]; cardId: number; onOpenPrint: (price: PrintingPrice) => void }) {
  return (
    <section className="overflow-hidden rounded-card border border-border-subtle bg-card-background">
      <header className="grid gap-0.5 px-3 py-2.5" style={packBackground(prices[0]!.code)}>
        <Heading level="card" as="h4" className="truncate">
          {set}
        </Heading>
        <p className="m-0 text-micro text-muted">{t('search.prices.printings', { count: prices.length })}</p>
      </header>
      <ul className="m-0 grid list-none p-0">
        {prices.map((price) => (
          <li key={`${price.code}-${price.rarity}-${price.edition}-${price.productId}`} className="border-t border-border-subtle">
            <button
              type="button"
              title={t('search.prices.openInExpansions')}
              className="grid w-full grid-cols-[2.25rem_minmax(0,1fr)_auto] items-center gap-3 rounded-none px-3 py-2 text-left text-foreground transition-colors hover:bg-tint/8 focus-visible:outline-none focus-visible:shadow-focus"
              onClick={() => onOpenPrint(price)}
            >
              {/* La carta tal cual salió en esa impresión: ahí se ve si es overframe, de arte extendido o alternativa. */}
              <PrintingArt productId={price.productId} cardId={cardId} className="aspect-[421/614] w-9 rounded-tag object-cover" />
              <span className="grid min-w-0 gap-0.5">
                <span className="flex flex-wrap items-center gap-x-2 gap-y-1 text-body font-semibold">
                  <span>
                    {price.rarity} · {price.edition}
                  </span>
                  {price.variant ? (
                    <Badge size="sm" tone="info" shape="tag" wrap>
                      {price.variant}
                    </Badge>
                  ) : null}
                </span>
                <span className="text-micro text-muted">{price.code}</span>
              </span>
              <span className="inline-flex items-center gap-1.5 text-body font-semibold tabular-nums">
                {price.market === null ? t('search.prices.noPrice') : formatUsd(price.market)}
                <Icon name="chevron-right" size={14} className="text-soft" />
              </span>
            </button>
          </li>
        ))}
      </ul>
    </section>
  )
}

/**
 * Todas las impresiones de la carta por expansión (las más nuevas primero), con un buscador por código o rareza que
 * filtra acá mismo. Salen de los archivos del sync diario: un solo pedido de pocos KB, tenga la carta las reimpresiones que tenga.
 */
function PriceList({ cardId, onOpenPrint }: { cardId: number; onOpenPrint: (price: PrintingPrice) => void }) {
  const state = useCardPrices(cardId)
  const [query, setQuery] = useState('')
  const searching = query.trim() !== ''

  if (state.status === 'loading') {
    return (
      <div className="grid gap-2" aria-busy="true">
        <Skeleton className="h-24 w-full" />
        <Skeleton className="h-24 w-full" />
      </div>
    )
  }

  if (state.status === 'error') {
    return <p className="m-0 text-body text-muted">{t('search.prices.loadError')}</p>
  }

  if (state.status !== 'ready') {
    return null
  }

  const { prices } = state

  if (prices.length === 0) {
    return <p className="m-0 text-body text-muted">{t('search.prices.empty')}</p>
  }

  const visible = filterPrintings(prices, query)
  const bySet = new Map<string, PrintingPrice[]>()

  for (const price of visible) {
    bySet.set(price.set, [...(bySet.get(price.set) ?? []), price])
  }

  return (
    <div className="grid gap-3">
      {new Set(prices.map((price) => price.set)).size > 1 || prices.length > 3 ? (
        <label className="relative block">
          <span className="sr-only">{t('search.prices.searchLabel')}</span>
          <Icon name="search" size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-soft" />
          <input
            type="search"
            value={query}
            placeholder={t('search.prices.searchLabel')}
            autoComplete="off"
            className={cx(field, 'h-10 w-full pl-9 pr-3 text-body')}
            onChange={(event) => setQuery(event.target.value)}
          />
        </label>
      ) : null}
      {[...bySet].map(([set, setPrices]) => (
        <ExpansionPrices key={set} set={set} prices={setPrices} cardId={cardId} onOpenPrint={onOpenPrint} />
      ))}
      {searching && visible.length === 0 ? <p className="m-0 text-body text-muted">{t('search.prices.noMatch', { query: query.trim() })}</p> : null}
      <p className="m-0 text-micro text-soft">{t('search.prices.footnote', { date: formatDay(state.updated) })}</p>
    </div>
  )
}

/**
 * Precios de TCGplayer de la carta, en un modal que se abre con `CardPricesButton`: todas las expansiones en las que
 * salió y un buscador por código o rareza. Se monta al lado del detalle (no adentro) para que tocarlo no cierre la
 * carta, y va por encima de ella. Los precios se piden recién al abrirlo. Tocar una impresión lleva a la vista de Expansiones (cambia el hash) y avisa con
 * `onGoToPrint` para que el que lo abrió se cierre y no quede un detalle abierto encima de la otra pantalla.
 */
export function CardPricesModal({ cardId, name, isOpen, onClose, onGoToPrint }: { cardId: number; name: string; isOpen: boolean; onClose: () => void; onGoToPrint: () => void }) {
  return (
    <Modal isOpen={isOpen} onClose={onClose} size="sm" above kicker={t('search.prices.kicker')} title={name}>
      <PriceList
        cardId={cardId}
        onOpenPrint={(price) => {
          window.location.hash = buildExpansionsHash({ expansion: price.expansionId, print: price.productId })
          onGoToPrint()
        }}
      />
    </Modal>
  )
}

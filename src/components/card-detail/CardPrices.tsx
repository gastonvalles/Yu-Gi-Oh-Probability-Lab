import { useState } from 'react'

import { cardImageSrc } from '../../app/card-image-source'
import { filterPrintings, setImageUrl, type PrintingPrice } from '../../app/card-prices'
import { useCardPrices } from '../../app/use-card-prices'
import { currencyLocale, formatDay as formatDate, t } from '../../i18n'
import { Heading } from '../ui/Heading'
import { cx } from '../ui/cx'
import { Icon } from '../ui/Icon'
import { Modal } from '../ui/Modal'
import { Skeleton } from '../ui/Skeleton'
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
 * El botón de precios sobre la esquina de la carta: la moneda verde con el signo de dólar (public/price-coin.svg, la
 * imagen de referencia vectorizada), sin caja alrededor. El que lo usa le da la posición (esquina inferior derecha de la
 * imagen) y qué hacer al tocarlo. El área táctil es más grande que la moneda.
 */
export function CardPricesButton({ onClick }: { onClick: () => void }) {
  return (
    <button
      type="button"
      aria-label={t('search.prices.button')}
      title={t('search.prices.button')}
      className="relative block size-7 rounded-full bg-transparent p-0 shadow-[0_1px_6px_rgb(0_0_0/0.5)] transition-transform duration-150 before:absolute before:-inset-2 before:content-[''] hover:scale-110 focus-visible:outline-none focus-visible:shadow-focus"
      onClick={(event) => {
        // Está encima de una imagen que se agranda al tocarla: acá sólo se abren los precios.
        event.stopPropagation()
        onClick()
      }}
    >
      <img src="/price-coin.svg" alt="" draggable={false} className="block size-full select-none" />
    </button>
  )
}

/** Una expansión: su encabezado con el sobre de fondo y, debajo, el precio de mercado de cada impresión de la carta con un link al producto. */
function ExpansionPrices({ set, prices }: { set: string; prices: PrintingPrice[] }) {
  const usd = new Intl.NumberFormat(currencyLocale(), { style: 'currency', currency: 'USD' })

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
          <li key={`${price.code}-${price.rarity}-${price.edition}`} className="border-t border-border-subtle">
            <a
              href={price.url}
              target="_blank"
              rel="noreferrer"
              className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3 px-3 py-2 text-foreground no-underline transition-colors hover:bg-tint/8 focus-visible:outline-none focus-visible:shadow-focus"
            >
              <span className="grid min-w-0 gap-0.5">
                <span className="text-body font-semibold">
                  {price.rarity} · {price.edition}
                </span>
                <span className="text-micro text-muted">{price.code}</span>
              </span>
              <span className="inline-flex items-center gap-1.5 text-body font-semibold tabular-nums">
                {price.market === null ? t('search.prices.noPrice') : usd.format(price.market)}
                <Icon name="link" size={13} className="text-soft" />
              </span>
            </a>
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
function PriceList({ cardId }: { cardId: number }) {
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
        <ExpansionPrices key={set} set={set} prices={setPrices} />
      ))}
      {searching && visible.length === 0 ? <p className="m-0 text-body text-muted">{t('search.prices.noMatch', { query: query.trim() })}</p> : null}
      <p className="m-0 text-micro text-soft">{t('search.prices.footnote', { date: formatDay(state.updated) })}</p>
    </div>
  )
}

/**
 * Precios de TCGplayer de la carta, en un modal que se abre con `CardPricesButton`: todas las expansiones en las que
 * salió y un buscador por código o rareza. Se monta al lado del detalle (no adentro) para que tocarlo no cierre la
 * carta, y va por encima de ella. Los precios se piden recién al abrirlo.
 */
export function CardPricesModal({ cardId, name, isOpen, onClose }: { cardId: number; name: string; isOpen: boolean; onClose: () => void }) {
  return (
    <Modal isOpen={isOpen} onClose={onClose} size="sm" above kicker={t('search.prices.kicker')} title={name}>
      <PriceList cardId={cardId} />
    </Modal>
  )
}

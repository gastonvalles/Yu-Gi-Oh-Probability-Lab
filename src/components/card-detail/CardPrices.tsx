import { useEffect, useState } from 'react'

import { PAGE_SIZE, filterPrintings, setImageUrl, type PrintingPrice } from '../../app/card-prices'
import { useCardPrices } from '../../app/use-card-prices'
import { Button } from '../ui/Button'
import { cx } from '../ui/cx'
import { Icon } from '../ui/Icon'
import { Modal } from '../ui/Modal'
import { Skeleton } from '../ui/Skeleton'
import { field } from '../ui/surfaces'

const USD = new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'USD' })

/** "2026-10-11" → "11/10/2026". */
const formatDay = (day: string) => day.split('-').reverse().join('/')

/** El encabezado del Meta: la imagen a la derecha y un degradado oscuro que la deja leer el texto de la izquierda. Acá, el sobre de la expansión. */
const packBackground = (code: string) => ({
  backgroundImage: `linear-gradient(90deg, rgb(var(--card-background-rgb) / 0.97) 40%, rgb(var(--card-background-rgb) / 0.6)), url(${setImageUrl(code)})`,
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
      aria-label="Ver precios en TCGplayer"
      title="Ver precios en TCGplayer"
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
  return (
    <section className="overflow-hidden rounded-card border border-border-subtle bg-card-background">
      <header className="grid gap-0.5 px-3 py-2.5" style={packBackground(prices[0]!.code)}>
        <h4 className="m-0 truncate text-body font-semibold text-foreground">{set}</h4>
        <p className="m-0 text-micro text-muted">{prices.length === 1 ? '1 impresión' : `${prices.length} impresiones`}</p>
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
                {price.market === null ? 'Sin precio' : USD.format(price.market)}
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
 * Los precios de la carta por expansión (las más nuevas primero), con un buscador por código o rareza. Salen de los
 * archivos del sync diario. Buscar es pedir ver todas las impresiones: al escribir se traen las expansiones que faltan.
 */
function PriceList({ cardId }: { cardId: number }) {
  const state = useCardPrices(cardId)
  const [query, setQuery] = useState('')
  const searching = query.trim() !== ''

  useEffect(() => {
    if (searching && state.status === 'ready' && state.remaining > 0 && !state.loadingMore && !state.moreFailed) {
      state.loadAll()
    }
  }, [searching, state])

  if (state.status === 'loading') {
    return (
      <div className="grid gap-2" aria-busy="true">
        <Skeleton className="h-24 w-full" />
        <Skeleton className="h-24 w-full" />
      </div>
    )
  }

  if (state.status === 'error') {
    return <p className="m-0 text-body text-muted">No pude traer los precios ahora. Probá de nuevo más tarde.</p>
  }

  if (state.status !== 'ready') {
    return null
  }

  const { prices, total, remaining, loadingMore, moreFailed, loadMore, loadAll } = state

  if (prices.length === 0 && remaining === 0) {
    return <p className="m-0 text-body text-muted">No hay precios de TCGplayer para esta carta.</p>
  }

  const visible = filterPrintings(prices, query)
  const bySet = new Map<string, PrintingPrice[]>()

  for (const price of visible) {
    bySet.set(price.set, [...(bySet.get(price.set) ?? []), price])
  }

  const next = Math.min(PAGE_SIZE, remaining)

  return (
    <div className="grid gap-3">
      {total > 1 || prices.length > PAGE_SIZE ? (
        <label className="relative block">
          <span className="sr-only">Buscar por código o rareza</span>
          <Icon name="search" size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-soft" />
          <input
            type="search"
            value={query}
            placeholder="Buscar por código o rareza"
            autoComplete="off"
            className={cx(field, 'h-10 w-full pl-9 pr-3 text-body')}
            onChange={(event) => setQuery(event.target.value)}
          />
        </label>
      ) : null}
      {[...bySet].map(([set, setPrices]) => (
        <ExpansionPrices key={set} set={set} prices={setPrices} />
      ))}
      {searching && visible.length === 0 && remaining === 0 ? (
        <p className="m-0 text-body text-muted">Ninguna impresión coincide con “{query.trim()}”.</p>
      ) : null}
      {searching && remaining > 0 ? (
        // Buscar mira todas las expansiones: mientras llegan las que faltan, se avisa; si falla, se puede reintentar.
        <div className="grid justify-items-center gap-1.5" aria-live="polite">
          {moreFailed ? (
            <>
              <p className="m-0 text-micro text-soft">No pude traer el resto de las expansiones.</p>
              <Button variant="secondary" size="sm" onClick={loadAll}>
                Reintentar
              </Button>
            </>
          ) : (
            <p className="m-0 text-micro text-soft">Buscando también en las {remaining} expansiones restantes…</p>
          )}
        </div>
      ) : null}
      {!searching && remaining > 0 ? (
        // De a PAGE_SIZE expansiones: las cartas con muchas reimpresiones no cargan todo de una.
        <div className="grid justify-items-center gap-1.5">
          <Button variant="secondary" size="sm" icon="chevron-down" fullWidth disabled={loadingMore} aria-busy={loadingMore} onClick={loadMore}>
            {loadingMore ? 'Cargando…' : moreFailed ? 'Reintentar' : `Ver ${next} ${next === 1 ? 'expansión más' : 'expansiones más'}`}
          </Button>
          <p className="m-0 text-micro text-soft">{moreFailed ? 'No pude traer más expansiones.' : `Mostrando ${total - remaining} de ${total} expansiones`}</p>
        </div>
      ) : null}
      <p className="m-0 text-micro text-soft">Precio de mercado de TCGplayer, en dólares, al {formatDay(state.updated)}.</p>
    </div>
  )
}

/**
 * Precios de TCGplayer de la carta, en un modal que se abre con `CardPricesButton`: las 3 expansiones más nuevas, un
 * botón para ver de a 3 más y un buscador por código o rareza. Se monta al lado del detalle (no adentro) para que tocarlo no cierre la carta, y va por
 * encima de ella. Los precios se piden recién al abrirlo y cada tanda, recién al pedirla.
 */
export function CardPricesModal({ cardId, name, isOpen, onClose }: { cardId: number; name: string; isOpen: boolean; onClose: () => void }) {
  return (
    <Modal isOpen={isOpen} onClose={onClose} size="sm" above kicker="Precios en TCGplayer" title={name}>
      <PriceList cardId={cardId} />
    </Modal>
  )
}

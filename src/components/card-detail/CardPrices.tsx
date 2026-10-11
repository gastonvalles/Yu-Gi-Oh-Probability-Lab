import { useCardPrices } from '../../app/use-card-prices'
import { Icon } from '../ui/Icon'
import { Modal } from '../ui/Modal'
import { Skeleton } from '../ui/Skeleton'

const USD = new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'USD' })

/** "2026-10-11" → "11/10/2026". */
const formatDay = (day: string) => day.split('-').reverse().join('/')

/**
 * El signo de dólar sobre la esquina de la carta: una moneda verde sin caja alrededor. El que la usa le da la posición
 * (esquina inferior derecha de la imagen) y qué hacer al tocarla.
 */
export function CardPricesButton({ onClick }: { onClick: () => void }) {
  return (
    <button
      type="button"
      aria-label="Ver precios en TCGplayer"
      title="Ver precios en TCGplayer"
      className="block size-9 rounded-full bg-transparent p-0 shadow-[0_2px_8px_rgb(0_0_0/0.5)] transition-transform duration-150 hover:scale-110 focus-visible:outline-none focus-visible:shadow-focus pointer-coarse:size-10"
      onClick={(event) => {
        // Está encima de una imagen que se agranda al tocarla: acá sólo se abren los precios.
        event.stopPropagation()
        onClick()
      }}
    >
      <svg viewBox="0 0 24 24" aria-hidden="true" className="block size-full">
        <circle cx="12" cy="12" r="12" fill="#4caf50" />
        <g fill="none" stroke="#fff" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M12 4.8v14.4" />
          <path d="M15.3 9.2c-.3-1.3-1.6-2.1-3.3-2.1-1.9 0-3.2.9-3.2 2.3 0 1.5 1.3 2 3.2 2.5 1.9.5 3.2 1 3.2 2.6 0 1.4-1.3 2.4-3.3 2.4-1.8 0-3.1-.9-3.4-2.2" />
        </g>
      </svg>
    </button>
  )
}

/** Precio de mercado de cada impresión (expansión, código, rareza y edición) con un link al producto. Sale de los archivos del sync diario. */
function PriceList({ cardId }: { cardId: number }) {
  const state = useCardPrices(cardId)

  if (state.status === 'loading') {
    return (
      <div className="grid gap-1.5" aria-busy="true">
        <Skeleton className="h-11 w-full" />
        <Skeleton className="h-11 w-full" />
      </div>
    )
  }

  if (state.status === 'error') {
    return <p className="m-0 text-body text-muted">No pude traer los precios ahora. Probá de nuevo más tarde.</p>
  }

  if (state.status !== 'ready') {
    return null
  }

  if (state.prices.length === 0) {
    return <p className="m-0 text-body text-muted">No hay precios de TCGplayer para esta carta.</p>
  }

  return (
    <div className="grid gap-3">
      <ul className="m-0 grid list-none gap-1.5 p-0">
        {state.prices.map((price) => (
          <li key={`${price.code}-${price.rarity}-${price.edition}`}>
            <a
              href={price.url}
              target="_blank"
              rel="noreferrer"
              className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3 rounded-control bg-tint/5 px-3 py-2 text-foreground no-underline transition-colors hover:bg-tint/10 focus-visible:outline-none focus-visible:shadow-focus"
            >
              <span className="grid min-w-0 gap-0.5">
                <strong className="truncate text-body font-semibold">{price.set}</strong>
                <span className="text-micro text-muted">
                  {price.code} · {price.rarity} · {price.edition}
                </span>
              </span>
              <span className="inline-flex items-center gap-1.5 text-body font-semibold tabular-nums">
                {price.market === null ? 'Sin precio' : USD.format(price.market)}
                <Icon name="link" size={13} className="text-soft" />
              </span>
            </a>
          </li>
        ))}
      </ul>
      <p className="m-0 text-micro text-soft">Precio de mercado de TCGplayer, en dólares, al {formatDay(state.updated)}.</p>
    </div>
  )
}

/**
 * Precios de TCGplayer de las impresiones más nuevas de la carta, en un modal que se abre con `CardPricesButton`. Se
 * monta al lado del detalle (no adentro) para que tocarlo no cierre la carta, y va por encima de ella. Los precios se
 * piden recién al abrirlo.
 */
export function CardPricesModal({ cardId, name, isOpen, onClose }: { cardId: number; name: string; isOpen: boolean; onClose: () => void }) {
  return (
    <Modal isOpen={isOpen} onClose={onClose} size="sm" above kicker="Precios en TCGplayer" title={name}>
      <PriceList cardId={cardId} />
    </Modal>
  )
}

import { setImageUrl, type PrintingPrice } from '../../app/card-prices'
import { useCardPrices } from '../../app/use-card-prices'
import { Icon } from '../ui/Icon'
import { Modal } from '../ui/Modal'
import { Skeleton } from '../ui/Skeleton'

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
 * El botón de precios sobre la esquina de la carta: un círculo de vidrio chico con el signo de dólar. El que lo usa le da
 * la posición (esquina inferior derecha de la imagen) y qué hacer al tocarlo. El área táctil es más grande que el círculo.
 */
export function CardPricesButton({ onClick }: { onClick: () => void }) {
  return (
    <button
      type="button"
      aria-label="Ver precios en TCGplayer"
      title="Ver precios en TCGplayer"
      className="relative grid size-7 place-items-center rounded-full border border-white/25 bg-background/55 p-0 text-success shadow-[0_1px_6px_rgb(0_0_0/0.45)] backdrop-blur-[3px] transition-[transform,background-color] duration-150 before:absolute before:-inset-2 before:content-[''] hover:scale-110 hover:bg-background/75 focus-visible:outline-none focus-visible:shadow-focus"
      onClick={(event) => {
        // Está encima de una imagen que se agranda al tocarla: acá sólo se abren los precios.
        event.stopPropagation()
        onClick()
      }}
    >
      <Icon name="dollar" size={14} strokeWidth={2.2} />
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

/** Los precios de la carta por expansión (las más nuevas primero). Salen de los archivos del sync diario. */
function PriceList({ cardId }: { cardId: number }) {
  const state = useCardPrices(cardId)

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

  if (state.prices.length === 0) {
    return <p className="m-0 text-body text-muted">No hay precios de TCGplayer para esta carta.</p>
  }

  const bySet = new Map<string, PrintingPrice[]>()

  for (const price of state.prices) {
    bySet.set(price.set, [...(bySet.get(price.set) ?? []), price])
  }

  return (
    <div className="grid gap-3">
      {[...bySet].map(([set, prices]) => (
        <ExpansionPrices key={set} set={set} prices={prices} />
      ))}
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

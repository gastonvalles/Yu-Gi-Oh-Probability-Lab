import { useCardPrices } from '../../app/use-card-prices'
import { Icon } from '../ui/Icon'
import { Skeleton } from '../ui/Skeleton'
import { overline } from '../ui/typography'

const USD = new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'USD' })

/** "2026-10-11" → "11/10/2026". */
const formatDay = (day: string) => day.split('-').reverse().join('/')

/**
 * Precios de TCGplayer de las impresiones más nuevas de la carta: expansión, código, rareza y edición, con el precio de
 * mercado en dólares y un link al producto. Salen de los archivos que baja el sync diario.
 */
export function CardPrices({ cardId }: { cardId: number }) {
  const state = useCardPrices(cardId)

  return (
    <section className="mt-4 grid gap-2 border-t border-tint/10 pt-3" aria-label="Precios en TCGplayer">
      <h3 className={`m-0 ${overline}`}>Precios en TCGplayer</h3>

      {state.status === 'loading' ? (
        <div className="grid gap-1.5" aria-busy="true">
          <Skeleton className="h-11 w-full" />
          <Skeleton className="h-11 w-full" />
        </div>
      ) : null}

      {state.status === 'error' ? <p className="m-0 text-body text-white/66">No pude traer los precios ahora. Probá de nuevo más tarde.</p> : null}

      {state.status === 'ready' && state.prices.length === 0 ? <p className="m-0 text-body text-white/66">No hay precios de TCGplayer para esta carta.</p> : null}

      {state.status === 'ready' && state.prices.length > 0 ? (
        <>
          <ul className="m-0 grid list-none gap-1.5 p-0">
            {state.prices.map((price) => (
              <li key={`${price.code}-${price.rarity}-${price.edition}`}>
                <a
                  href={price.url}
                  target="_blank"
                  rel="noreferrer"
                  className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3 rounded-control bg-tint/5 px-3 py-2 text-white no-underline transition-colors hover:bg-tint/10 focus-visible:outline-none focus-visible:shadow-focus"
                >
                  <span className="grid min-w-0 gap-0.5">
                    <strong className="truncate text-body font-semibold">{price.set}</strong>
                    <span className="text-micro text-white/66">
                      {price.code} · {price.rarity} · {price.edition}
                    </span>
                  </span>
                  <span className="inline-flex items-center gap-1.5 text-body font-semibold tabular-nums">
                    {price.market === null ? 'Sin precio' : USD.format(price.market)}
                    <Icon name="link" size={13} className="text-white/55" />
                  </span>
                </a>
              </li>
            ))}
          </ul>
          <p className="m-0 text-micro text-white/55">Precio de mercado de TCGplayer, en dólares, al {formatDay(state.updated)}.</p>
        </>
      ) : null}
    </section>
  )
}

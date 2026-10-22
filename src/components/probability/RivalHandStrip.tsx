import { t } from '../../i18n'
import { CardArt } from '../CardArt'
import { cx } from '../ui/cx'
import { Icon } from '../ui/Icon'
import { overline } from '../ui/typography'
import { FxFrame } from './MatFx'

export interface RivalHandCard {
  id: string
  name: string
  art: string | null
  /** El paso en que el rival la usó (desde 1); `null` si todavía la tiene. */
  usedAt: number | null
}

interface RivalHandStripProps {
  cards: readonly RivalHandCard[]
  /** La carta de la que se está viendo el menú: lleva el marco celeste, como las de la mesa. */
  selectedId?: string | null
  onOpen: (id: string, rect: DOMRect) => void
  className?: string
}

/**
 * La mano del rival en el simulador de handtraps de «Jugar solo»: una franja fija arriba de la mesa con sus cartas chicas boca arriba. Tocar una abre el mismo menú que
 * cualquier carta de la mesa («Usar ahora», «Ver carta»). Una usada se queda en su lugar (la mesa no se mueve), apagada y con el paso en que se usó.
 * Cada carta lleva `data-card-id`: así el detalle fijo de la izquierda la muestra al pasar el mouse y la carta grande del centro sale de ella.
 */
export function RivalHandStrip({ cards, selectedId = null, onOpen, className }: RivalHandStripProps) {
  return (
    <section aria-label={t('handtraps.strip.label')} data-rival-strip="" className={cx('flex h-14 shrink-0 items-center justify-center gap-2', className)}>
      <span aria-hidden="true" className={overline}>
        {t('handtraps.strip.title')}
      </span>
      <ul className="m-0 flex list-none items-center gap-1.5 p-0">
        {cards.map((card) => {
          const used = card.usedAt !== null
          const label = used ? t('handtraps.strip.used', { name: card.name, step: card.usedAt ?? 0 }) : card.name

          return (
            <li key={card.id} className="shrink-0">
              {/* `rounded-none`: el reset global le da radio a todo <button>, y las cartas van rectas. El área que se toca crece 4 px a cada lado sin agrandar la carta. */}
              <button
                type="button"
                data-card-id={card.id}
                aria-label={label}
                aria-haspopup="menu"
                title={label}
                className="relative block aspect-[421/614] h-12 cursor-pointer rounded-none bg-input p-0 shadow-card before:absolute before:-inset-1 focus-visible:outline-none focus-visible:shadow-focus"
                onClick={(event) => onOpen(card.id, event.currentTarget.getBoundingClientRect())}
              >
                <span className={cx('block h-full w-full overflow-hidden transition-[filter] duration-150 motion-reduce:transition-none', used && 'brightness-[0.42] saturate-[0.6]')}>
                  <CardArt remoteUrl={card.art} name={card.name} className="block h-full w-full object-cover" />
                </span>
                {used ? (
                  <span aria-hidden="true" className="absolute inset-x-0 bottom-0 flex items-center justify-center gap-0.5 bg-background/85 text-micro font-bold leading-tight tabular-nums text-foreground">
                    <Icon name="check" size={11} strokeWidth={3} />
                    {card.usedAt}
                  </span>
                ) : null}
                {selectedId === card.id ? <FxFrame tone="cyan" /> : null}
              </button>
            </li>
          )
        })}
      </ul>
    </section>
  )
}

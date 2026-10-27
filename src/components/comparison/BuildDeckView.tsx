import { isCardPendingClassification } from '../../app/build-comparison'
import type { DeckCardInstance, DeckZone } from '../../app/model'
import { formatInteger } from '../../app/utils'
import { t } from '../../i18n'
import { CardArt } from '../CardArt'
import { cx } from '../ui/cx'
import type { Side } from './comparison-rows'

const ZONE_STYLE = {
  main: 'bg-(--zone-main-background)',
  extra: 'bg-(--zone-extra-background)',
  side: 'bg-(--zone-side-background)',
} as const

interface BuildDeckViewProps {
  side: Side
  zone: DeckZone
  cards: readonly DeckCardInstance[]
  /** Cuántas copias de cada carta (id de YGOPRODeck) se marcan: en A las que salen de la zona, en B las que entran. */
  marks: ReadonlyMap<number, number>
  onCardClick: (card: DeckCardInstance) => void
}

/**
 * Una zona de una build en «Las dos listas»: las copias que cambian llevan el aro y la cantidad en el color de su build (A lila, B ámbar: −2 en A, +1 en B, en la
 * primera de ellas) y las demás se atenúan. Las cartas van rectas (también el botón: el reset global le da radio a todo `<button>`). La grilla crece con su
 * columna (`@container`): 4 cartas por fila en el celular, hasta 8 en escritorio.
 */
export function BuildDeckView({ side, zone, cards, marks, onCardClick }: BuildDeckViewProps) {
  const dim = marks.size > 0
  const left = new Map(marks)

  return (
    <div className={cx('grid grid-cols-4 content-start gap-1 rounded-card p-1.5 @min-[20rem]:grid-cols-6 @min-[28rem]:grid-cols-8', ZONE_STYLE[zone])}>
      {cards.map((card, index) => {
        const id = card.apiCard.ygoprodeckId
        const remaining = left.get(id) ?? 0
        const marked = remaining > 0
        const total = marks.get(id) ?? 0
        const pending = zone === 'main' && isCardPendingClassification(card)

        if (marked) {
          left.set(id, remaining - 1)
        }

        return (
          <button
            key={`${card.instanceId}-${index}`}
            type="button"
            className={cx(
              'relative min-w-0 cursor-pointer rounded-none border-0 bg-transparent p-0 transition-opacity duration-200 focus-visible:outline-none focus-visible:shadow-focus motion-reduce:transition-none',
              marked && 'z-10 outline-2 -outline-offset-2',
              marked && (side === 'A' ? 'outline-primary-soft' : 'outline-info'),
              dim && !marked && 'opacity-40 hover:opacity-100 focus-visible:opacity-100',
            )}
            title={pending ? t('meta.compare.unclassifiedCard', { name: card.name }) : card.name}
            onClick={() => onCardClick(card)}
          >
            <CardArt
              tilt
              remoteUrl={card.apiCard.imageUrlSmall ?? card.apiCard.imageUrl}
              name={card.name}
              className="block aspect-[0.72] w-full bg-input object-cover"
              limitCard={card.apiCard}
              limitBadgeSize="sm"
            />
            {marked && remaining === total ? (
              <span
                aria-hidden="true"
                className={cx(
                  'pointer-events-none absolute left-0.5 top-0.5 z-20 rounded-full px-1.5 text-micro font-bold leading-4 tabular-nums',
                  side === 'A' ? 'bg-primary text-white' : 'bg-magenta text-white',
                )}
              >
                {side === 'A' ? '−' : '+'}
                {formatInteger(total)}
              </span>
            ) : null}
            {pending ? (
              <span aria-hidden="true" className="pointer-events-none absolute right-0.5 top-0.5 z-20 grid size-4 place-items-center rounded-full bg-magenta text-micro font-bold text-white">
                ?
              </span>
            ) : null}
          </button>
        )
      })}
    </div>
  )
}

import type { CSSProperties, PointerEvent as ReactPointerEvent } from 'react'

import { buildDeckZoneBreakdown } from '../app/deck-utils'
import type { DeckCardInstance, DeckZone as DeckZoneType } from '../app/model'
import { formatInteger } from '../app/utils'
import { CardArt } from './CardArt'

interface DeckZoneProps {
  zone: DeckZoneType
  title: string
  cards: DeckCardInstance[]
  activeDragInstanceId: string | null
  onDeckCardPointerDown: (event: ReactPointerEvent<HTMLElement>, instanceId: string) => void
  onRemoveCard: (instanceId: string) => void
  onHoverStart: (name: string, card: DeckCardInstance['apiCard'], anchor: HTMLElement) => void
  onHoverEnd: () => void
}

const ZONE_COLORS: Record<DeckZoneType, string> = {
  main: '#a86f41',
  extra: '#7c70b2',
  side: '#6f8f49',
}

export function DeckZone({
  zone,
  title,
  cards,
  activeDragInstanceId,
  onDeckCardPointerDown,
  onRemoveCard,
  onHoverStart,
  onHoverEnd,
}: DeckZoneProps) {
  const zoneBreakdown = buildDeckZoneBreakdown(zone, cards)
  const zoneGridStyle = {
    background: ZONE_COLORS[zone],
    minHeight: 'clamp(140px, 18vw, 220px)',
  } as CSSProperties

  return (
    <section className="w-full bg-transparent p-0">
      <div className="mb-1.5">
        <div>
          <h3 className="m-0 text-[1.05rem] leading-none">{title}</h3>
          <p className="m-0 mt-[0.08rem] text-[0.82rem] leading-[1.12] text-[#b5b5b5]">
            {formatInteger(cards.length)} cartas
            {zoneBreakdown ? ` (${zoneBreakdown})` : ''}
          </p>
        </div>
      </div>

      <div
        className="grid w-full content-start gap-[0.32rem] p-[0.35rem] grid-cols-6 min-[520px]:grid-cols-8 min-[980px]:grid-cols-10"
        data-deck-zone={zone}
        data-deck-count={cards.length}
        style={zoneGridStyle}
      >
        {cards.map((card, index) => (
            <article
              key={card.instanceId}
              data-deck-zone={zone}
              data-deck-card-index={index}
              className={[
                'relative min-w-0 cursor-grab select-none bg-transparent p-0 touch-none',
                activeDragInstanceId === card.instanceId
                  ? 'opacity-35'
                  : '',
              ].join(' ')}
              onPointerDown={(event) => onDeckCardPointerDown(event, card.instanceId)}
              onContextMenu={(event) => {
                event.preventDefault()
                onRemoveCard(card.instanceId)
              }}
              onMouseEnter={(event) => onHoverStart(card.name, card.apiCard, event.currentTarget)}
              onMouseLeave={onHoverEnd}
            >
              <CardArt
                remoteUrl={card.apiCard.imageUrlSmall}
                name={card.name}
                className="block aspect-[0.72] w-full min-w-0 bg-[#1a1a1a] object-cover"
              />
            </article>
        ))}
      </div>
    </section>
  )
}

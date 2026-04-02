import type { CSSProperties, PointerEvent as ReactPointerEvent } from 'react'

import {
  buildDeckZoneVisualLayout,
  getDesktopCompactDeckColumnCount,
} from '../app/deck-zone-layout'
import { buildDeckZoneBreakdown } from '../app/deck-presentation'
import type { DeckCardInstance, DeckZone as DeckZoneType } from '../app/model'
import { formatInteger } from '../app/utils'
import { CardArt } from './CardArt'
import { Button } from './ui/Button'

interface DeckZoneProps {
  zone: DeckZoneType
  title: string
  cards: DeckCardInstance[]
  activeDragInstanceId: string | null
  isDropTargetActive?: boolean
  desktopCompact?: boolean
  desktopCompactColumnCount?: number
  onClearZone: (zone: DeckZoneType) => void
  onDeckCardPointerDown: (event: ReactPointerEvent<HTMLElement>, instanceId: string) => void
  onRemoveCard: (instanceId: string) => void
  onHoverStart: (name: string, card: DeckCardInstance['apiCard'], anchor: HTMLElement) => void
  onHoverEnd: () => void
}

const ZONE_STYLES: Record<DeckZoneType, { background: string; border: string }> = {
  main: {
    background: 'var(--zone-main-background)',
    border: 'var(--zone-main-border)',
  },
  extra: {
    background: 'var(--zone-extra-background)',
    border: 'var(--zone-extra-border)',
  },
  side: {
    background: 'var(--zone-side-background)',
    border: 'var(--zone-side-border)',
  },
}

export function DeckZone({
  zone,
  title,
  cards,
  activeDragInstanceId,
  isDropTargetActive = false,
  desktopCompact = false,
  desktopCompactColumnCount,
  onClearZone,
  onDeckCardPointerDown,
  onRemoveCard,
  onHoverStart,
  onHoverEnd,
}: DeckZoneProps) {
  const zoneBreakdown = buildDeckZoneBreakdown(zone, cards)
  const visualLayout = buildDeckZoneVisualLayout(
    zone,
    cards,
    desktopCompact ? 'desktop-compact' : 'default',
    desktopCompactColumnCount,
  )
  const isMainDeckGrid = visualLayout !== null
  const resolvedDesktopCompactColumnCount =
    desktopCompactColumnCount ?? getDesktopCompactDeckColumnCount(cards.length)
  const zoneStyle = ZONE_STYLES[zone]
  const zoneGridStyle = {
    '--zone-background': zoneStyle.background,
    '--zone-border': zoneStyle.border,
    '--deck-zone-card-gap': '0.32rem',
    '--deck-zone-desktop-columns': String(resolvedDesktopCompactColumnCount),
    minHeight: 'clamp(50px, 8vw, 90px)',
  } as CSSProperties
  const zoneGridClassName = isMainDeckGrid
    ? 'deck-zone-surface flex w-full flex-col gap-[0.32rem] overflow-x-hidden p-[0.35rem] min-[980px]:overflow-x-auto'
    : 'deck-zone-surface grid w-full content-start gap-[0.32rem] p-[0.35rem] grid-cols-5 min-[520px]:grid-cols-8 min-[980px]:grid-cols-10'

  const renderDeckCard = (card: DeckCardInstance, index: number) => (
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
        className="block aspect-[0.72] w-full min-w-0 bg-[var(--input)] object-cover"
        limitCard={card.apiCard}
      />
    </article>
  )

  return (
    <section
      className="deck-zone-shell w-full bg-transparent p-0"
      data-deck-zone-drop-target={zone}
      data-deck-zone-count={cards.length}
      data-deck-zone-layout={desktopCompact ? 'desktop-compact' : 'default'}
      data-deck-zone-drop-active={isDropTargetActive ? 'true' : 'false'}
    >
      <div className="deck-zone-header mb-1.5 flex items-start justify-between gap-3 min-[1101px]:mb-1">
        <div className="min-w-0">
          <h3 className="m-0 text-[1.05rem] leading-none min-[1101px]:text-[1rem]">{title}</h3>
          <p className="m-0 mt-[0.08rem] text-[0.82rem] leading-[1.12] text-[var(--text-muted)]">
            {formatInteger(cards.length)} cartas
            {zoneBreakdown ? ` (${zoneBreakdown})` : ''}
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          {isDropTargetActive ? (
            <span className="hidden min-[1101px]:inline-flex app-chip-accent px-2 py-1 text-[0.66rem] whitespace-nowrap">
              Soltá acá
            </span>
          ) : null}
          <Button
            variant="tertiary"
            size="sm"
            disabled={cards.length === 0}
            onClick={() => onClearZone(zone)}
          >
            Vaciar
          </Button>
        </div>
      </div>

      <div
        className={zoneGridClassName}
        data-deck-zone={zone}
        data-deck-count={cards.length}
        data-deck-zone-layout={desktopCompact ? 'desktop-compact' : 'default'}
        style={zoneGridStyle}
      >
        {visualLayout
          ? visualLayout.rows.map((row) => (
              <div
                key={`${zone}-row-${row.rowIndex}`}
                className="main-deck-grid-row"
                style={{
                  '--main-deck-columns': String(visualLayout.columns),
                } as CSSProperties}
              >
                {row.cards.map(({ card, index }) => renderDeckCard(card, index))}
              </div>
            ))
          : cards.map((card, index) => renderDeckCard(card, index))}
      </div>
    </section>
  )
}

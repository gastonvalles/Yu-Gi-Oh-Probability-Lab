import { memo, useRef, type CSSProperties, type MouseEvent as ReactMouseEvent, type PointerEvent as ReactPointerEvent, type SVGProps } from 'react'

import {
  buildDeckZoneVisualLayout,
  DESKTOP_COMPACT_MAIN_EXPAND_THRESHOLD,
} from '../app/deck-zone-layout'
import { buildDeckZoneBreakdown, buildDeckZoneTypeCounts } from '../app/deck-presentation'
import type { DeckCardInstance, DeckZone as DeckZoneType } from '../app/model'
import type { DeckDropIndicatorState } from '../app/use-deck-pointer-drag'
import { formatInteger } from '../app/utils'
import { CardArt } from './CardArt'
import { Button } from './ui/Button'
import { IconButton } from './ui/IconButton'
import {
  DECK_CARD_CLASSIC,
  MAIN_ROW_GRID,
  MAIN_ROW_OVERLAP,
  RAIL_ROW,
  RAIL_ROW_OVERLAP,
  ZONE_SURFACE_MOBILE,
  ZONE_TYPE_SWATCH,
  deckCardMobile,
} from './deck-zone-styles'
import { cx } from './ui/cx'

interface DeckZoneProps {
  zone: DeckZoneType
  title: string
  cards: DeckCardInstance[]
  activeDragInstanceId: string | null
  dropState?: DeckDropIndicatorState
  desktopCompact?: boolean
  desktopCompactColumnCount?: number
  variant?: 'default' | 'classic-builder'
  selectedCardId?: number | null
  onClearZone: (zone: DeckZoneType) => void
  onDeckCardPointerDown: (event: ReactPointerEvent<HTMLElement>, instanceId: string) => void
  onDeckCardClick: (instanceId: string) => void
  onRemoveCard: (instanceId: string) => void
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

/** Memoizada: durante un arrastre sólo se re-renderiza la zona cuyo estado cambia. */
export const DeckZone = memo(function DeckZone({
  zone,
  title,
  cards,
  activeDragInstanceId,
  dropState = 'idle',
  desktopCompact = false,
  desktopCompactColumnCount,
  variant = 'default',
  selectedCardId = null,
  onClearZone,
  onDeckCardPointerDown,
  onDeckCardClick,
  onRemoveCard,
}: DeckZoneProps) {
  const lastPointerTypeRef = useRef<string>('mouse')
  const zoneBreakdown = buildDeckZoneBreakdown(zone, cards)
  const zoneTypeCounts = buildDeckZoneTypeCounts(zone, cards)
  const visualLayout = desktopCompact
    ? buildDeckZoneVisualLayout(
        zone,
        cards,
        'desktop-compact',
        desktopCompactColumnCount,
      )
    : null
  const zoneStyle = ZONE_STYLES[zone]
  const classicRowGap = '0px'
  const isClassicBuilder = variant === 'classic-builder'
  const isClassicRailZone = isClassicBuilder && zone !== 'main'
  const isClassicMainOverlapZone =
    isClassicBuilder && zone === 'main' && cards.length > DESKTOP_COMPACT_MAIN_EXPAND_THRESHOLD
  // 4 rows tall at the real card_small aspect ratio (268x391), plus the 2px surface border and a small safety margin.
  const classicZoneMaxHeight = zone === 'main' ? '29rem' : 'none'
  const classicBorderColor =
    dropState === 'valid'
      ? 'rgb(var(--accent-rgb) / 0.82)'
      : dropState === 'invalid'
        ? 'rgb(var(--destructive-rgb) / 0.82)'
        : 'var(--classic-zone-accent)'
  const classicZoneStyle = isClassicBuilder
    ? ({
        '--classic-zone-tint': zoneStyle.background,
        '--classic-zone-accent': zoneStyle.border,
      }) as CSSProperties
    : undefined
  const classicSurfaceStyle = isClassicBuilder
    ? ({
        gap: classicRowGap,
        minHeight: cards.length === 0 ? '3.5rem' : 0,
        maxHeight: classicZoneMaxHeight,
        padding: '0',
        border: `1px solid ${classicBorderColor}`,
        borderRadius: '0',
        background:
          'linear-gradient(180deg, var(--classic-zone-tint), rgb(var(--background-rgb) / 0.98)), linear-gradient(180deg, rgb(var(--secondary-rgb) / 0.94), rgb(var(--background-rgb) / 0.98))',
        boxShadow:
          dropState === 'valid'
            ? '0 0 0 1px rgb(var(--accent-rgb) / 0.14)'
            : dropState === 'invalid'
              ? '0 0 0 1px rgb(var(--destructive-rgb) / 0.16)'
              : 'none',
        overflowX: 'hidden',
        overflowY: zone === 'main' ? 'hidden' : 'visible',
      }) as CSSProperties
    : null
  const cardCountLabel = formatInteger(cards.length)
  const headerSummary = `${cardCountLabel} cartas${zoneBreakdown ? ` (${zoneBreakdown})` : ''}`
  const classicRailRowStyle = isClassicRailZone
    ? ({
        '--classic-rail-card-count': String(Math.max(cards.length, 1)),
      } as CSSProperties)
    : undefined
  const renderedVisualRows = visualLayout?.rows.filter((row) => row.cards.length > 0) ?? []

  const handleCardPointerDown = (event: ReactPointerEvent<HTMLElement>, instanceId: string) => {
    lastPointerTypeRef.current = event.pointerType
    onDeckCardPointerDown(event, instanceId)
  }

  // Clic derecho quita la carta. Con el dedo, el long-press dispara el mismo
  // evento en Android: ahí sólo se bloquea el menú (quitar se hace desde el detalle).
  const handleCardContextMenu = (event: ReactMouseEvent<HTMLElement>, instanceId: string) => {
    event.preventDefault()

    if (lastPointerTypeRef.current === 'mouse') {
      onRemoveCard(instanceId)
    }
  }

  const renderDeckCard = (card: DeckCardInstance, index: number) => (
    <article
      key={card.instanceId}
      data-deck-zone={zone}
      data-deck-card-index={index}
      data-selected={selectedCardId !== null && card.apiCard.ygoprodeckId === selectedCardId ? 'true' : 'false'}
      data-dragging={activeDragInstanceId === card.instanceId ? 'true' : 'false'}
      className={DECK_CARD_CLASSIC}
      onPointerDown={(event) => handleCardPointerDown(event, card.instanceId)}
      onClick={() => onDeckCardClick(card.instanceId)}
      onContextMenu={(event) => handleCardContextMenu(event, card.instanceId)}
    >
      <CardArt
        remoteUrl={card.apiCard.imageUrlSmall ?? card.apiCard.imageUrl}
        name={card.name}
        className="block h-auto w-full min-w-0 bg-input"
        limitCard={card.apiCard}
      />
    </article>
  )

  if (isClassicBuilder) {
    return (
      <section
        className="grid w-full gap-[0.46rem] bg-transparent p-0"
        data-deck-zone-drop-target={zone}
        data-deck-zone-count={cards.length}
        data-deck-zone-layout={desktopCompact ? 'desktop-compact' : 'default'}
        data-deck-zone-drop-active={dropState === 'valid' ? 'true' : 'false'}
        data-deck-zone-drop-state={dropState}
        data-classic-zone={zone}
        style={classicZoneStyle}
      >
        <div>
          <div className="grid w-[calc(100%-0.04rem)] max-w-[calc(100%-0.04rem)] min-w-0 grid-cols-[minmax(0,1fr)_auto] items-center gap-[0.8rem] rounded-[0.84rem] border border-(--classic-zone-accent) bg-linear-to-b from-(--classic-zone-tint) to-card-background/98 px-[0.95rem] py-[0.28rem] text-[0.98rem] font-bold leading-none text-foreground shadow-[inset_0_1px_0_rgba(255,255,255,0.04)]">
            <span className="min-w-0 whitespace-nowrap">
              {title.replace(' Deck', '')} [{cardCountLabel}]
            </span>
            <div className="flex min-w-0 items-center gap-[0.55rem]">
              {zoneTypeCounts.length > 0 ? (
                <div className="flex flex-none items-center gap-2">
                  {zoneTypeCounts.map((entry) => (
                    <span
                      key={entry.kind}
                      className="inline-flex items-center gap-[0.28rem] text-[0.82rem] font-bold text-foreground"
                      title={`${formatInteger(entry.count)} ${entry.label}`}
                    >
                      <span className={cx('size-[0.62rem] rounded-[0.15rem]', ZONE_TYPE_SWATCH[entry.kind])} aria-hidden="true" />
                      {formatInteger(entry.count)}
                    </span>
                  ))}
                </div>
              ) : null}
              {cards.length > 0 ? (
                <IconButton
                  tone="ghost"
                  size={isClassicBuilder ? 'sm' : 'md'}
                  aria-label={`Vaciar ${title}`}
                  title={`Vaciar ${title}`}
                  onClick={() => onClearZone(zone)}
                >
                  <TrashIcon />
                </IconButton>
              ) : null}
            </div>
          </div>
        </div>

        <div
          className="relative flex w-full flex-col overflow-hidden rounded-none transition-[border-color,background,box-shadow] duration-150"
          data-deck-zone={zone}
          data-deck-count={cards.length}
          data-deck-zone-layout="desktop-compact"
          style={classicSurfaceStyle ?? undefined}
        >
          {isClassicRailZone ? (
            <div
              className={cx(RAIL_ROW, cards.length > 10 && RAIL_ROW_OVERLAP)}
              style={classicRailRowStyle}
            >
              {cards.map((card, index) => renderDeckCard(card, index))}
            </div>
          ) : visualLayout
            ? renderedVisualRows.map((row) => (
                <div
                  key={`${zone}-row-${row.rowIndex}`}
                  className={isClassicMainOverlapZone ? MAIN_ROW_OVERLAP : MAIN_ROW_GRID}
                  style={
                    isClassicMainOverlapZone
                      ? ({
                          '--classic-main-row-slot-count': String(Math.max(visualLayout.columns, 1)),
                        } as CSSProperties)
                      : ({
                          '--main-deck-columns': String(visualLayout.columns),
                        } as CSSProperties)
                  }
                >
                  {row.cards.map(({ card, index }) => renderDeckCard(card, index))}
                </div>
              ))
            : cards.map((card, index) => renderDeckCard(card, index))}
          {cards.length === 0 ? (
            <p className="pointer-events-none m-0 col-span-full grid min-h-14 w-full place-items-center p-2 text-[0.78rem] text-soft">
              Arrastrá cartas acá
            </p>
          ) : null}
        </div>
      </section>
    )
  }

  return (
    <section className="w-full bg-transparent p-0">
      <div className="mb-1.5 flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <h3 className="m-0 wrap-anywhere text-[1.05rem] leading-none">{title}</h3>
          <p className="m-0 mt-[0.08rem] wrap-anywhere text-[0.82rem] leading-[1.12] text-(--text-muted)">
            {headerSummary}
          </p>
        </div>
        <Button
          variant="tertiary"
          size="sm"
          className="shrink-0"
          disabled={cards.length === 0}
          onClick={() => onClearZone(zone)}
        >
          Vaciar
        </Button>
      </div>

      <div
        className={ZONE_SURFACE_MOBILE}
        data-deck-zone={zone}
        data-deck-count={cards.length}
        style={{
          '--zone-background': zoneStyle.background,
          '--zone-border': zoneStyle.border,
          minHeight: 'clamp(50px, 8vw, 90px)',
        } as CSSProperties}
      >
        {cards.map((card, index) => (
          <article
            key={card.instanceId}
            data-deck-zone={zone}
            data-deck-card-index={index}
            className={deckCardMobile(activeDragInstanceId === card.instanceId)}
            onPointerDown={(event) => handleCardPointerDown(event, card.instanceId)}
            onClick={() => onDeckCardClick(card.instanceId)}
            onContextMenu={(event) => handleCardContextMenu(event, card.instanceId)}
          >
            <CardArt
              remoteUrl={card.apiCard.imageUrlSmall ?? card.apiCard.imageUrl}
              name={card.name}
              className="block aspect-[0.72] w-full min-w-0 bg-input object-cover"
              limitCard={card.apiCard}
            />
          </article>
        ))}
      </div>
    </section>
  )
})

function TrashIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" {...props}>
      <path d="M3.5 4.5h9" />
      <path d="M6 2.75h4" />
      <path d="m5 4.5.55 7.1a1 1 0 0 0 1 .9h2.9a1 1 0 0 0 1-.9L11 4.5" />
      <path d="M6.75 6.5v4" />
      <path d="M9.25 6.5v4" />
    </svg>
  )
}

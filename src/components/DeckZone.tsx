import { memo, useRef, type CSSProperties, type MouseEvent as ReactMouseEvent, type PointerEvent as ReactPointerEvent } from 'react'

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
import { Icon } from './ui/Icon'
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
  onSortZone: (zone: DeckZoneType) => void
  onDeckCardPointerDown: (event: ReactPointerEvent<HTMLElement>, instanceId: string) => void
  onDeckCardClick: (instanceId: string) => void
  onRemoveCard: (instanceId: string) => void
}

const ZONE_STYLES: Record<DeckZoneType, { background: string; border: string; dot: string }> = {
  main: {
    background: 'var(--zone-main-background)',
    border: 'var(--zone-main-border)',
    dot: 'rgb(var(--primary-rgb))',
  },
  extra: {
    background: 'var(--zone-extra-background)',
    border: 'var(--zone-extra-border)',
    dot: 'rgb(var(--handtrap-rgb))',
  },
  side: {
    background: 'var(--zone-side-background)',
    border: 'var(--zone-side-border)',
    dot: 'rgb(var(--accent-rgb))',
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
  onSortZone,
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
      ? 'rgb(var(--primary-rgb) / 0.85)'
      : dropState === 'invalid'
        ? 'rgb(var(--destructive-rgb) / 0.85)'
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
        borderRadius: 'var(--radius-card)',
        background: 'linear-gradient(180deg, var(--classic-zone-tint), transparent), rgb(var(--card-background-rgb) / 0.6)',
        boxShadow:
          dropState === 'valid'
            ? '0 0 0 3px rgb(var(--primary-rgb) / 0.2)'
            : dropState === 'invalid'
              ? '0 0 0 3px rgb(var(--destructive-rgb) / 0.2)'
              : 'none',
        overflow: 'hidden',
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
        <div className="flex min-w-0 items-center justify-between gap-3 px-0.5">
          <div className="flex min-w-0 items-center gap-2.5">
            <span className="size-2.5 shrink-0 rounded-full" style={{ background: zoneStyle.dot }} aria-hidden="true" />
            <h3 className="m-0 whitespace-nowrap text-lead font-semibold text-foreground">
              {title.replace(' Deck', '')} <span className="font-medium text-muted tabular-nums">[{cardCountLabel}]</span>
            </h3>
          </div>
          <div className="flex min-w-0 items-center gap-2">
            {zoneTypeCounts.length > 0 ? (
              <div className="flex flex-none items-center gap-3">
                {zoneTypeCounts.map((entry) => (
                  <span
                    key={entry.kind}
                    className="inline-flex items-center gap-1.5 text-body font-semibold text-muted tabular-nums"
                    title={`${formatInteger(entry.count)} ${entry.label}`}
                  >
                    <span className={cx('size-2.5 rounded-tag', ZONE_TYPE_SWATCH[entry.kind])} aria-hidden="true" />
                    {formatInteger(entry.count)}
                  </span>
                ))}
              </div>
            ) : null}
            {cards.length > 1 ? (
              <IconButton tone="ghost" size="sm" aria-label={`Ordenar ${title}`} title={`Ordenar ${title}`} onClick={() => onSortZone(zone)}>
                <Icon name="sort" />
              </IconButton>
            ) : null}
            {cards.length > 0 ? (
              <IconButton tone="ghost" size="sm" aria-label={`Vaciar ${title}`} title={`Vaciar ${title}`} onClick={() => onClearZone(zone)}>
                <Icon name="trash" />
              </IconButton>
            ) : null}
          </div>
        </div>

        <div
          className="relative flex w-full flex-col overflow-hidden transition-[border-color,box-shadow] duration-150"
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
            <p className="pointer-events-none m-0 col-span-full grid min-h-14 w-full place-items-center p-2 text-body text-soft">
              Arrastrá cartas acá
            </p>
          ) : null}
        </div>
      </section>
    )
  }

  return (
    <section className="w-full bg-transparent p-0">
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
        <div className="flex min-w-0 flex-1 items-center gap-2.5">
          <span className="size-2.5 shrink-0 rounded-full" style={{ background: zoneStyle.dot }} aria-hidden="true" />
          <div className="min-w-0">
            <h3 className="m-0 wrap-anywhere text-lead font-semibold leading-tight text-foreground">{title}</h3>
            <p className="m-0 wrap-anywhere text-body text-muted">{headerSummary}</p>
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-1">
          <Button variant="tertiary" size="sm" icon="sort" disabled={cards.length < 2} onClick={() => onSortZone(zone)}>
            Ordenar
          </Button>
          <Button variant="tertiary" size="sm" disabled={cards.length === 0} onClick={() => onClearZone(zone)}>
            Vaciar
          </Button>
        </div>
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

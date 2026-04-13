import type { CSSProperties, PointerEvent as ReactPointerEvent, SVGProps } from 'react'

import {
  buildDeckZoneVisualLayout,
  DESKTOP_COMPACT_MAIN_EXPAND_THRESHOLD,
  getDesktopCompactDeckColumnCount,
} from '../app/deck-zone-layout'
import { buildDeckZoneBreakdown } from '../app/deck-presentation'
import type { DeckCardInstance, DeckZone as DeckZoneType } from '../app/model'
import type { DeckDropIndicatorState } from '../app/use-deck-pointer-drag'
import { formatInteger } from '../app/utils'
import { CardArt } from './CardArt'
import { IconButton } from './ui/IconButton'

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
  dropState = 'idle',
  desktopCompact = false,
  desktopCompactColumnCount,
  variant = 'default',
  selectedCardId = null,
  onClearZone,
  onDeckCardPointerDown,
  onDeckCardClick,
  onRemoveCard,
  onHoverStart,
  onHoverEnd,
}: DeckZoneProps) {
  const zoneBreakdown = buildDeckZoneBreakdown(zone, cards)
  const visualLayout = desktopCompact
    ? buildDeckZoneVisualLayout(
        zone,
        cards,
        'desktop-compact',
        desktopCompactColumnCount,
      )
    : null
  const isMainDeckGrid = visualLayout !== null
  const resolvedDesktopCompactColumnCount =
    zone === 'main'
      ? (desktopCompactColumnCount ?? getDesktopCompactDeckColumnCount(zone, cards.length))
      : getDesktopCompactDeckColumnCount(zone, cards.length)
  const normalizedZoneBreakdown = zoneBreakdown.replaceAll('Â·', '·')
  const zoneStyle = ZONE_STYLES[zone]
  const classicRowGap = '0px'
  const zoneSurfaceStyle = {
    '--zone-background': zoneStyle.background,
    '--zone-border': zoneStyle.border,
    '--deck-zone-card-gap': desktopCompact ? '0.2rem' : '0.32rem',
    '--deck-zone-desktop-columns': String(resolvedDesktopCompactColumnCount),
  } as CSSProperties
  const zoneGridStyle = {
    gap: 'var(--deck-zone-card-gap)',
    minHeight: 'clamp(50px, 8vw, 90px)',
  } as CSSProperties
  const isClassicBuilder = variant === 'classic-builder'
  const isClassicRailZone = isClassicBuilder && zone !== 'main'
  const isClassicMainOverlapZone =
    isClassicBuilder && zone === 'main' && cards.length > DESKTOP_COMPACT_MAIN_EXPAND_THRESHOLD
  const classicZoneHeight = zone === 'main' ? '27.4rem' : '7rem'
  const classicBorderColor =
    dropState === 'valid'
      ? 'rgb(255 255 255 / 0.82)'
      : dropState === 'invalid'
        ? 'rgb(var(--destructive-rgb) / 0.82)'
        : 'rgb(255 255 255 / 0.62)'
  const classicSurfaceStyle = isClassicBuilder
    ? ({
        '--zone-background': 'rgb(15 20 29 / 0.96)',
        '--zone-border': classicBorderColor,
        '--deck-zone-card-gap': '0px',
        '--deck-zone-desktop-columns': String(resolvedDesktopCompactColumnCount),
        gap: classicRowGap,
        minHeight: classicZoneHeight,
        height: classicZoneHeight,
        padding: '0',
        border: `1px solid ${classicBorderColor}`,
        borderRadius: '0',
        background: 'rgb(15 20 29 / 0.96)',
        boxShadow:
          dropState === 'valid'
            ? '0 0 0 1px rgb(255 255 255 / 0.1)'
            : dropState === 'invalid'
              ? '0 0 0 1px rgb(var(--destructive-rgb) / 0.16)'
              : 'none',
        overflowX: 'hidden',
        overflowY: 'hidden',
      }) as CSSProperties
    : null
  const zoneGridClassName = isMainDeckGrid
    ? 'deck-zone-grid flex w-full flex-col overflow-hidden'
    : 'deck-zone-grid grid w-full content-start grid-cols-5 min-[520px]:grid-cols-8 min-[980px]:grid-cols-10'
  const cardCountLabel = formatInteger(cards.length)
  const headerSummary = `${cardCountLabel} cartas${zoneBreakdown ? ` (${zoneBreakdown})` : ''}`
  const classicRailRowStyle = isClassicRailZone
    ? ({
        '--classic-rail-card-count': String(Math.max(cards.length, 1)),
      } as CSSProperties)
    : undefined
  const renderedVisualRows = visualLayout?.rows.filter((row) => row.cards.length > 0) ?? []

  const renderDeckCard = (card: DeckCardInstance, index: number) => (
    <article
      key={card.instanceId}
      data-deck-zone={zone}
      data-deck-card-index={index}
      data-selected={selectedCardId !== null && card.apiCard.ygoprodeckId === selectedCardId ? 'true' : 'false'}
      className={[
        'deck-zone-card relative min-w-0 cursor-grab touch-none select-none bg-transparent p-0',
        activeDragInstanceId === card.instanceId
          ? 'opacity-35'
          : '',
      ].join(' ')}
      onPointerDown={(event) => onDeckCardPointerDown(event, card.instanceId)}
      onClick={() => onDeckCardClick(card.instanceId)}
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
        className="block h-auto w-full min-w-0 bg-[var(--input)]"
        limitCard={isClassicBuilder ? null : card.apiCard}
      />
    </article>
  )

  if (isClassicBuilder) {
    return (
      <section
        className="deck-zone-shell classic-builder-zone-shell w-full bg-transparent p-0"
        data-deck-zone-drop-target={zone}
        data-deck-zone-count={cards.length}
        data-deck-zone-layout={desktopCompact ? 'desktop-compact' : 'default'}
        data-deck-zone-drop-active={dropState === 'valid' ? 'true' : 'false'}
        data-deck-zone-drop-state={dropState}
        data-classic-zone={zone}
      >
        <div className="classic-builder-zone-label-row">
          <div className="classic-builder-zone-label">
            <span className="classic-builder-zone-label-title">
              {title.replace(' Deck', '')} [{cardCountLabel}]
            </span>
            <div className="classic-builder-zone-label-actions">
              {normalizedZoneBreakdown ? (
                <span className="classic-builder-zone-label-breakdown">{normalizedZoneBreakdown}</span>
              ) : null}
              {cards.length > 0 ? (
                <IconButton
                  size="sm"
                  className="deck-zone-trash-button classic-builder-zone-trash-button"
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
          className={['deck-zone-surface deck-zone-compact-grid classic-builder-zone-surface', zoneGridClassName].join(' ')}
          data-deck-zone={zone}
          data-deck-count={cards.length}
          data-deck-zone-layout="desktop-compact"
          style={classicSurfaceStyle ?? undefined}
        >
          {isClassicRailZone ? (
            <div
              className="classic-builder-rail-row"
              data-overlap={cards.length > 10 ? 'true' : 'false'}
              style={classicRailRowStyle}
            >
              {cards.map((card, index) => renderDeckCard(card, index))}
            </div>
          ) : visualLayout
            ? renderedVisualRows.map((row) => (
                <div
                  key={`${zone}-row-${row.rowIndex}`}
                  className={isClassicMainOverlapZone ? 'classic-builder-main-overlap-row' : 'main-deck-grid-row'}
                  data-overlap={isClassicMainOverlapZone ? 'true' : 'false'}
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
        </div>
      </section>
    )
  }

  return (
    <section
      className="deck-zone-shell w-full bg-transparent p-0"
      data-deck-zone-drop-target={zone}
      data-deck-zone-count={cards.length}
      data-deck-zone-layout={desktopCompact ? 'desktop-compact' : 'default'}
      data-deck-zone-drop-active={dropState === 'valid' ? 'true' : 'false'}
      data-deck-zone-drop-state={dropState}
    >
      {desktopCompact ? (
        <div
          className="deck-zone-surface deck-zone-compact-frame"
          data-deck-zone={zone}
          data-deck-zone-layout="desktop-compact"
          style={zoneSurfaceStyle}
        >
          <div className="deck-zone-header flex items-center justify-between gap-3">
            <div className="min-w-0 pl-1.5">
              <h3 className="m-0 text-[1rem] leading-none">{title}</h3>
              <p className="deck-zone-header-breakdown m-0 mt-[0.12rem] truncate">
                {headerSummary}
              </p>
            </div>
            <div className="flex shrink-0 items-center gap-2">
              {dropState === 'valid' ? (
                <span className="hidden min-[1101px]:inline-flex app-chip-accent px-2 py-1 text-[0.66rem] whitespace-nowrap">
                  Soltá acá
                </span>
              ) : null}
              <IconButton
                size="sm"
                className="deck-zone-trash-button"
                aria-label={`Vaciar ${title}`}
                title={`Vaciar ${title}`}
                disabled={cards.length === 0}
                onClick={() => onClearZone(zone)}
              >
                <TrashIcon />
              </IconButton>
            </div>
          </div>

          <div
            className={['deck-zone-compact-grid', zoneGridClassName].join(' ')}
            data-deck-zone={zone}
            data-deck-count={cards.length}
            data-deck-zone-layout="desktop-compact"
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
        </div>
      ) : (
        <>
          <div className="deck-zone-header mb-1.5 flex items-start justify-between gap-3 min-[1101px]:mb-1">
            <div className="min-w-0 pl-1.5">
              <h3 className="m-0 text-[1.05rem] leading-none min-[1101px]:text-[1rem]">{title}</h3>
              <p className="m-0 mt-[0.08rem] text-[0.82rem] leading-[1.12] text-[var(--text-muted)]">
                {headerSummary}
              </p>
            </div>
            <div className="flex shrink-0 items-center gap-2">
              {dropState === 'valid' ? (
                <span className="hidden min-[1101px]:inline-flex app-chip-accent px-2 py-1 text-[0.66rem] whitespace-nowrap">
                  Soltá acá
                </span>
              ) : null}
              <IconButton
                size="sm"
                className="deck-zone-trash-button"
                aria-label={`Vaciar ${title}`}
                title={`Vaciar ${title}`}
                disabled={cards.length === 0}
                onClick={() => onClearZone(zone)}
              >
                <TrashIcon />
              </IconButton>
            </div>
          </div>

          <div
            className={['deck-zone-surface', zoneGridClassName, 'p-[0.35rem]'].join(' ')}
            data-deck-zone={zone}
            data-deck-count={cards.length}
            data-deck-zone-layout="default"
            style={{
              ...zoneSurfaceStyle,
              ...zoneGridStyle,
            }}
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
        </>
      )}
    </section>
  )
}

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

import { memo, useRef, type CSSProperties, type KeyboardEvent as ReactKeyboardEvent, type MouseEvent as ReactMouseEvent, type PointerEvent as ReactPointerEvent } from 'react'

import {
  buildDeckZoneVisualLayout,
  DESKTOP_COMPACT_MAIN_EXPAND_THRESHOLD,
} from '../app/deck-zone-layout'
import type { DeckCardInstance, DeckZone as DeckZoneType } from '../app/model'
import type { DeckDropIndicatorState } from '../app/use-deck-pointer-drag'
import { t } from '../i18n'
import { CardArt } from './CardArt'
import { DeckZoneHeader } from './DeckZoneHeader'
import {
  DECK_CARD_CLASSIC,
  MAIN_ROW_GRID,
  MAIN_ROW_OVERLAP,
  RAIL_ROW,
  RAIL_ROW_OVERLAP,
  ZONE_STYLES,
  ZONE_SURFACE_MOBILE,
  deckCardMobile,
} from './deck-zone-styles'
import { cx } from './ui/cx'

/** Al quitar una carta con el teclado, el foco pasa a la que ocupa su lugar (o a la última de la zona): si no, se pierde en el `<body>` y el siguiente Tab arranca desde arriba de la página. */
function keepFocusAfterRemoving(card: HTMLElement) {
  const zone = card.closest('section')
  const cardsOf = () => (zone ? [...zone.querySelectorAll<HTMLElement>('[role="button"][data-deck-card-index]')] : [])
  const position = cardsOf().indexOf(card)

  // Las demás cartas siguen siendo las mismas (cada una con su `key`): se las vuelve a leer cuando ya se quitó la carta.
  requestAnimationFrame(() => {
    const rest = cardsOf()

    rest[Math.min(Math.max(position, 0), rest.length - 1)]?.focus()
  })
}

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
  /** Sólo para mirar (p. ej. un deck del meta): sin tope de alto y sin el aviso de zona vacía. */
  readOnly?: boolean
  /** Cartas con marco verde (por id de YGOPRODeck). */
  highlightedCardIds?: ReadonlySet<number>
  /** Qué hace tocar una carta (p. ej. «Mover X al Side Deck»): con esto las cartas son botones que se usan con el teclado (Enter o espacio). */
  cardAction?: (card: DeckCardInstance) => string
  /** Con teclado, Supr o Retroceso sobre una carta enfocada la quita del deck (lo mismo que el clic derecho). Sólo el builder: en otras pantallas `onRemoveCard` no es quitar. */
  keyboardRemove?: boolean
  onDeckCardPointerDown: (event: ReactPointerEvent<HTMLElement>, instanceId: string) => void
  onDeckCardClick: (instanceId: string) => void
  onRemoveCard: (instanceId: string) => void
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
  readOnly = false,
  highlightedCardIds,
  cardAction,
  keyboardRemove = false,
  onDeckCardPointerDown,
  onDeckCardClick,
  onRemoveCard,
}: DeckZoneProps) {
  const lastPointerTypeRef = useRef<string>('mouse')
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
  // Sólo para mirar no hay tope: la zona puede ser más ancha que en el builder (p. ej. un deck del meta a pantalla completa).
  const classicZoneMaxHeight = zone === 'main' && !readOnly ? '29rem' : 'none'
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
        // Las cartas llegan hasta el borde de la zona y la zona las recorta: con esquinas redondeadas se las redondearía a las de las puntas (las cartas van rectas).
        borderRadius: 0,
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

  // Con `cardAction`, la carta es un botón: se enfoca y se acciona con Enter o espacio, como con un toque.
  const cardButton = (card: DeckCardInstance) =>
    cardAction
      ? {
          role: 'button' as const,
          tabIndex: 0,
          'aria-label': cardAction(card),
          onKeyDown: (event: ReactKeyboardEvent<HTMLElement>) => {
            if (event.key === 'Enter' || event.key === ' ') {
              event.preventDefault()
              onDeckCardClick(card.instanceId)
            } else if (keyboardRemove && !readOnly && (event.key === 'Delete' || event.key === 'Backspace')) {
              event.preventDefault()
              keepFocusAfterRemoving(event.currentTarget)
              onRemoveCard(card.instanceId)
            }
          },
        }
      : {}

  const renderDeckCard = (card: DeckCardInstance, index: number) => (
    <div
      key={card.instanceId}
      {...cardButton(card)}
      data-deck-zone={zone}
      data-deck-card-index={index}
      data-selected={selectedCardId !== null && card.apiCard.ygoprodeckId === selectedCardId ? 'true' : 'false'}
      data-highlighted={highlightedCardIds?.has(card.apiCard.ygoprodeckId) ? 'true' : 'false'}
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
    </div>
  )

  const zoneHeader = (className: string) => <DeckZoneHeader zone={zone} title={title} cards={cards} className={className} />

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
        {zoneHeader('')}

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
          {cards.length === 0 && !readOnly ? (
            <p className="pointer-events-none m-0 col-span-full grid min-h-14 w-full place-items-center p-2 text-body text-soft">
              {t('deck.zone.dropHint')}
            </p>
          ) : null}
        </div>
      </section>
    )
  }

  return (
    <section className="w-full bg-transparent p-0">
      {zoneHeader('mb-2 flex-wrap gap-y-1')}

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
          <div
            key={card.instanceId}
            {...cardButton(card)}
            data-deck-zone={zone}
            data-deck-card-index={index}
            data-highlighted={highlightedCardIds?.has(card.apiCard.ygoprodeckId) ? 'true' : 'false'}
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
          </div>
        ))}
      </div>
    </section>
  )
})

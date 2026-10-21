import { useRef, useState, type DragEvent, type ReactNode } from 'react'

import { placeOf, type MakerCard, type MakerList, type Place } from '../../app/tierlist-maker'
import { useTierFlights } from '../../app/use-tier-flights'
import { t } from '../../i18n'
import { CardArt } from '../CardArt'
import { cx } from '../ui/cx'
import { Icon } from '../ui/Icon'
import { CloseButton, IconButton } from '../ui/IconButton'
import { TILE_WIDTH, TierStrip } from './TierStrip'

interface TierMakerBoardProps {
  list: MakerList
  /** La carta elegida con un toque (se mueve con la barra de abajo o tocando una fila). */
  selectedId: number | null
  onSelect: (id: number | null) => void
  /** Mueve una carta a una fila o a la bandeja, antes de otra carta si se la nombra. */
  onMove: (cardId: number, to: Place, before?: number) => void
  onRemoveCard: (cardId: number) => void
  onEditTier: (tierId: string) => void
  /** Lo que va entre la última fila y «Sin clasificar»: los botones para agregar y quitar filas. */
  children?: ReactNode
}

const POOL_KEY = 'pool'

/**
 * Al sacar una carta con el teclado, el foco pasa a la que queda en su lugar en esa fila (o a la última) y, si la fila quedó vacía, a lo último que se puede tocar antes de ella (la letra de la fila o, antes
 * de «Sin clasificar», «Quitar fila»): si no, se pierde en el `<body>` y el siguiente Tab arranca desde arriba de la página. Como en el builder (`DeckZone`).
 */
function keepFocus(tile: HTMLElement) {
  const strip = tile.closest('ul')

  if (!strip) return

  const tilesOf = () => [...strip.querySelectorAll<HTMLElement>('[role="button"]')]
  const position = tilesOf().indexOf(tile)

  // Las demás cartas siguen siendo las mismas (cada una con su `key`): se las vuelve a leer cuando ya se sacó la carta.
  requestAnimationFrame(() => {
    const rest = tilesOf()
    const before = [...document.querySelectorAll<HTMLElement>('button:not(:disabled), [role="button"]')].filter((element) => element.compareDocumentPosition(strip) & Node.DOCUMENT_POSITION_FOLLOWING)

    ;(rest[Math.min(position, rest.length - 1)] ?? before.at(-1))?.focus()
  })
}

/**
 * El tablero del creador: las filas de la tier list (con el recuadro de color a la izquierda, que abre el editor de la fila) y, abajo, la bandeja de las cartas sin clasificar, todo con el mismo aspecto que
 * las tier lists del meta. Las cartas se **arrastran** (a una fila o entre las de una fila, para ordenarlas) o se **tocan** para elegirlas: con una elegida aparece una barra con un botón por fila, y tocar una
 * fila vacía también la manda ahí. Así se arma igual con el mouse, con el dedo y con el teclado (Tab, Enter y los botones de la barra). **El clic derecho (o Supr) saca de a un paso:** de una fila, la carta
 * vuelve a «Sin clasificar»; de «Sin clasificar», sale de la lista (Gastón, 2026-10-21). Lo que cambia de lugar vuela hasta su lugar nuevo (`app/use-tier-flights.ts`).
 */
export function TierMakerBoard({ list, selectedId, onSelect, onMove, onRemoveCard, onEditTier, children }: TierMakerBoardProps) {
  const [dragId, setDragId] = useState<number | null>(null)
  const [over, setOver] = useState<string | null>(null)
  // Con qué se tocó la última carta: el toque largo de Android también dispara el clic derecho (`contextmenu`), y ahí no tiene que sacar nada.
  const lastPointer = useRef('mouse')
  // Cada cambio de lugar se mide: lo que cambia de fila vuela hasta su lugar nuevo (`app/use-tier-flights.ts`).
  const boardRef = useRef<HTMLDivElement>(null)

  useTierFlights(boardRef, list)
  const selected = selectedId === null ? undefined : list.cards[selectedId]
  const selectedPlace = selected ? placeOf(list, selected.id) : null
  const currentTierId = selectedPlace?.kind === 'tier' ? selectedPlace.id : null

  const idFrom = (event: DragEvent): number | null => {
    const raw = dragId ?? Number(event.dataTransfer.getData('text/plain'))

    return Number.isInteger(raw) && raw > 0 ? raw : null
  }
  const dragOver = (key: string) => (event: DragEvent) => {
    if (dragId === null) return

    event.preventDefault()
    event.dataTransfer.dropEffect = 'move'
    setOver(key)
  }
  const drop = (to: Place, before?: number) => (event: DragEvent) => {
    event.preventDefault()
    event.stopPropagation()

    const id = idFrom(event)

    if (id !== null) onMove(id, to, before)

    setDragId(null)
    setOver(null)
  }
  const dropProps = (key: string, to: Place) => ({
    onDragOver: dragOver(key),
    onDragLeave: () => setOver((current) => (current === key ? null : current)),
    onDrop: drop(to),
    // Con una carta elegida, tocar un hueco de la fila la manda ahí (tocar una carta no cuenta: eso la elige).
    onClick: (event: { target: unknown; currentTarget: unknown }) => {
      if (selectedId !== null && event.target === event.currentTarget) onMove(selectedId, to)
    },
  })

  const tile = (card: MakerCard, to: Place) => {
    const isSelected = card.id === selectedId
    // Un paso por vez: de una fila vuelve a «Sin clasificar» (al final) y, desde ahí, sale de la lista.
    const takeOut = () => (to.kind === 'pool' ? onRemoveCard(card.id) : onMove(card.id, { kind: 'pool' }))

    return (
      <li key={card.id} data-tier-card-id={card.id} className={cx('min-w-0', TILE_WIDTH)} onDragOver={dragOver(placeKey(to))} onDrop={drop(to, card.id)}>
        {/* Un div con rol de botón y no un <button>: Firefox no deja arrastrar un botón (ni lo que tiene adentro). Enter y Espacio lo eligen, como a un botón; Supr y Retroceso lo sacan, como el clic derecho. */}
        <div
          role="button"
          tabIndex={0}
          draggable
          aria-pressed={isSelected}
          aria-label={t('meta.maker.card', { name: card.name })}
          title={card.name}
          className={cx(
            // Sin el menú del toque largo (guardar imagen…) ni la selección de texto.
            'relative block aspect-[421/614] w-full cursor-grab select-none overflow-hidden rounded-none bg-input [-webkit-touch-callout:none] focus-visible:outline-none focus-visible:shadow-focus active:cursor-grabbing',
            isSelected && 'shadow-focus',
            dragId === card.id && 'opacity-40',
          )}
          onClick={() => onSelect(isSelected ? null : card.id)}
          onPointerDown={(event) => {
            lastPointer.current = event.pointerType
          }}
          // El clic derecho saca la carta (el menú del navegador no sale). Con el dedo sólo se bloquea el menú: el camino táctil es la barra de abajo.
          onContextMenu={(event) => {
            event.preventDefault()

            if (lastPointer.current === 'mouse' || lastPointer.current === 'pen') takeOut()
          }}
          onKeyDown={(event) => {
            if (event.key === 'Enter' || event.key === ' ') {
              event.preventDefault()
              onSelect(isSelected ? null : card.id)
            } else if (event.key === 'Delete' || event.key === 'Backspace') {
              event.preventDefault()
              keepFocus(event.currentTarget)
              takeOut()
            }
          }}
          onDragStart={(event) => {
            event.dataTransfer.setData('text/plain', String(card.id))
            event.dataTransfer.effectAllowed = 'move'
            setDragId(card.id)
          }}
          onDragEnd={() => {
            setDragId(null)
            setOver(null)
          }}
        >
          <CardArt tilt remoteUrl={card.image} name={card.name} className="pointer-events-none h-full w-full object-cover" />
        </div>
      </li>
    )
  }

  return (
    <div ref={boardRef} className="stagger relative grid gap-0.5 [--stagger-step:60ms]">
      {list.tiers.map((tier) => {
        const to: Place = { kind: 'tier', id: tier.id }

        return (
          <TierStrip
            key={tier.id}
            label={tier.label}
            color={tier.color}
            ariaLabel={tier.label}
            title={t('meta.maker.editTier', { label: tier.label })}
            labelAriaLabel={t('meta.maker.editTier', { label: tier.label })}
            onLabel={() => onEditTier(tier.id)}
            highlighted={over === tier.id}
            dropProps={dropProps(tier.id, to)}
          >
            {tier.cards.map((id) => list.cards[id]).filter((card): card is MakerCard => Boolean(card)).map((card) => tile(card, to))}
          </TierStrip>
        )
      })}

      {children}

      <div className="mt-3 grid gap-0.5">
        <TierStrip neutral label={t('meta.maker.pool')} ariaLabel={t('meta.maker.pool')} highlighted={over === POOL_KEY} dropProps={dropProps(POOL_KEY, { kind: 'pool' })}>
          {list.pool.map((id) => list.cards[id]).filter((card): card is MakerCard => Boolean(card)).map((card) => tile(card, { kind: 'pool' }))}
        </TierStrip>
      </div>

      {selected ? (
        <div
          role="group"
          aria-label={t('meta.maker.selected', { name: selected.name })}
          className="sticky bottom-[calc(4rem+env(safe-area-inset-bottom,0px))] z-30 mt-3 flex flex-wrap items-center gap-2 border-t border-border-subtle bg-background py-3 min-[1101px]:bottom-0"
        >
          <span className="flex min-w-0 max-w-full items-center gap-2 pr-1">
            <span className="block aspect-[421/614] h-12 shrink-0 overflow-hidden bg-input">
              <CardArt tilt remoteUrl={selected.image} name={selected.name} className="h-full w-full object-cover" />
            </span>
            <span className="min-w-0 truncate text-body font-semibold text-foreground">{t('meta.maker.selected', { name: selected.name })}</span>
          </span>
          <span className="flex flex-wrap items-center gap-1">
            {list.tiers.map((tier) => (
              <button
                key={tier.id}
                type="button"
                aria-label={t('meta.maker.moveTo', { name: selected.name, tier: tier.label })}
                aria-current={currentTierId === tier.id ? 'true' : undefined}
                className="h-10 min-w-10 max-w-24 cursor-pointer truncate rounded-control border-0 px-2 text-body font-bold text-accent-foreground focus-visible:outline-none focus-visible:shadow-focus aria-[current=true]:shadow-focus"
                style={{ backgroundColor: tier.color }}
                onClick={() => onMove(selected.id, { kind: 'tier', id: tier.id })}
              >
                {tier.label}
              </button>
            ))}
            <button
              type="button"
              aria-label={t('meta.maker.moveTo', { name: selected.name, tier: t('meta.maker.pool') })}
              className="h-10 cursor-pointer rounded-control border-0 bg-surface-raised px-3 text-micro font-bold uppercase tracking-[0.08em] text-foreground focus-visible:outline-none focus-visible:shadow-focus"
              onClick={() => onMove(selected.id, { kind: 'pool' })}
            >
              {t('meta.maker.poolShort')}
            </button>
          </span>
          <span className="ml-auto flex items-center gap-1">
            <IconButton tone="ghost" aria-label={t('meta.maker.removeCard')} title={t('meta.maker.removeCard')} onClick={() => onRemoveCard(selected.id)}>
              <Icon name="trash" />
            </IconButton>
            <CloseButton size="md" aria-label={t('meta.maker.deselect')} onClick={() => onSelect(null)} />
          </span>
        </div>
      ) : null}
    </div>
  )
}

const placeKey = (place: Place): string => (place.kind === 'pool' ? POOL_KEY : place.id)

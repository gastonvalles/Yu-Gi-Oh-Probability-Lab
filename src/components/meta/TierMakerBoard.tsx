import { useId, useRef, useState, type MouseEvent, type ReactNode } from 'react'
import { createPortal } from 'react-dom'

import { placeOf, type MakerCard, type MakerList, type Place } from '../../app/tierlist-maker'
import { POOL_KEY, useTierCardDrag } from '../../app/use-tier-card-drag'
import { useTierFlights, type Point } from '../../app/use-tier-flights'
import { useTierRowDrag } from '../../app/use-tier-row-drag'
import { t } from '../../i18n'
import { CardArt } from '../CardArt'
import { DragGhost } from '../deck-mode/DeckModeDragOverlay'
import { cx } from '../ui/cx'
import { Icon } from '../ui/Icon'
import { CloseButton, IconButton } from '../ui/IconButton'
import { TILE_WIDTH, TierStrip, labelInk } from './TierStrip'

interface TierMakerBoardProps {
  list: MakerList
  /** La carta elegida con un toque (se mueve con la barra de abajo o tocando una fila). */
  selectedId: number | null
  onSelect: (id: number | null) => void
  /** Mueve una carta a una fila o a la bandeja, antes de otra carta si se la nombra. */
  onMove: (cardId: number, to: Place, before?: number) => void
  onRemoveCard: (cardId: number) => void
  /** Abre el menú de la fila (el engranaje del final y el recuadro de color de la izquierda). */
  onEditTier: (tierId: string) => void
  /** Lleva una fila al lugar `index` (arrastrándola por su agarre, o con ↑ y ↓). */
  onMoveTier: (tierId: string, index: number) => void
  /** Lo que va entre la última fila y «Sin clasificar»: los botones para agregar y quitar filas. */
  children?: ReactNode
}

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
 * El tablero del creador: las filas de la tier list (con el recuadro de color a la izquierda y, al final, el engranaje y el agarre de la fila) y, abajo, la bandeja de las cartas sin clasificar, todo con el
 * mismo aspecto que las tier lists del meta. Las cartas se **arrastran y se sueltan como en el builder** (Gastón, 2026-10-22: «que sea un drag and pull como el builder»; `app/use-tier-card-drag.ts`): a una
 * fila, entre las de una fila para ordenarlas o de vuelta a la bandeja, con el mouse o manteniéndolas apretadas con el dedo, y cambian de lugar de una, sin vuelo. También se **tocan** para elegirlas: con
 * una elegida aparece una barra con un botón por fila, y tocar el fondo de una fila también la manda ahí. Así se arma igual con el mouse, con el dedo y con el teclado (Tab, Enter y los botones de la barra).
 * **El clic derecho (o Supr) saca de a un paso:** de una fila, la carta vuelve a «Sin clasificar»; de «Sin clasificar», sale de la lista (Gastón, 2026-10-21). **Las filas** (Gastón, 2026-10-21: «en las
 * tierlists nos faltan esas opciones al final») se editan con el engranaje (o con su recuadro de color) y se **arrastran enteras** por su agarre, con el mouse, con el dedo o con ↑ y ↓
 * (`app/use-tier-row-drag.ts`); al reordenarlas, cada fila vuela a su lugar nuevo (`app/use-tier-flights.ts`). Es lo único que vuela.
 */
export function TierMakerBoard({ list, selectedId, onSelect, onMove, onRemoveCard, onEditTier, onMoveTier, children }: TierMakerBoardProps) {
  // Con qué se tocó la última carta: el toque largo de Android también dispara el clic derecho (`contextmenu`), y ahí no tiene que sacar nada.
  const lastPointer = useRef('mouse')
  // Al reordenar las filas, cada una vuela a su lugar nuevo (`app/use-tier-flights.ts`). `lift` es dónde quedó la fila que se soltó, para que vuele desde ahí.
  const boardRef = useRef<HTMLDivElement>(null)
  const lift = useRef<Map<string, Point> | null>(null)
  // La entrada escalonada (`stagger`) se repite en la fila que React vuelve a insertar al reordenar (medido: quedaba transparente y volvía a entrar). Desde la primera fila movida, no hay entrada.
  const [reordered, setReordered] = useState(false)
  const [announcement, setAnnouncement] = useState('')
  const hintId = useId()

  useTierFlights(boardRef, list, lift)

  const moveTier = (tierId: string, index: number) => {
    const tier = list.tiers.find((candidate) => candidate.id === tierId)

    if (!tier) return

    setReordered(true)
    onMoveTier(tierId, index)
    // Para el lector de pantalla: dónde quedó (el foco se queda en el agarre de la fila movida).
    setAnnouncement(t('meta.maker.tierMoved', { label: tier.label, position: index + 1, total: list.tiers.length }))
  }
  const rowDrag = useTierRowDrag(boardRef, { ids: list.tiers.map((tier) => tier.id), onMove: moveTier, lift })
  const cardDrag = useTierCardDrag(boardRef, onMove)
  const selected = selectedId === null ? undefined : list.cards[selectedId]
  const selectedPlace = selected ? placeOf(list, selected.id) : null
  const currentTierId = selectedPlace?.kind === 'tier' ? selectedPlace.id : null

  // Con una carta elegida, tocar el fondo de una fila la manda ahí (tocar una carta no cuenta: eso la elige).
  const sendSelectedTo = (to: Place) => (event: MouseEvent<HTMLUListElement>) => {
    if (selectedId !== null && event.target === event.currentTarget) onMove(selectedId, to)
  }

  const tile = (card: MakerCard, to: Place) => {
    const isSelected = card.id === selectedId
    // Un paso por vez: de una fila vuelve a «Sin clasificar» (al final) y, desde ahí, sale de la lista.
    const takeOut = () => (to.kind === 'pool' ? onRemoveCard(card.id) : onMove(card.id, { kind: 'pool' }))

    return (
      <li key={card.id} data-tier-card-id={card.id} className={cx('min-w-0', TILE_WIDTH)}>
        {/* Con rol de botón: Enter y Espacio lo eligen, como a un botón; Supr y Retroceso lo sacan, como el clic derecho. Se arrastra desde acá (`useTierCardDrag`). */}
        <div
          role="button"
          tabIndex={0}
          aria-pressed={isSelected}
          aria-label={t('meta.maker.card', { name: card.name })}
          title={card.name}
          className={cx(
            // Sin el menú del toque largo (guardar imagen…) ni la selección de texto. Con el dedo, al quedar levantada late una vez, como en el builder (con movimiento reducido, no).
            'relative block aspect-[421/614] w-full cursor-grab select-none overflow-hidden rounded-none bg-input [-webkit-touch-callout:none] focus-visible:outline-none focus-visible:shadow-focus active:cursor-grabbing motion-safe:data-[drag-armed=true]:animate-card-armed',
            isSelected && 'shadow-focus',
            // La que se arrastra queda atenuada en su lugar (el fantasma va con el puntero).
            cardDrag.ghost?.card.id === card.id && 'opacity-40',
          )}
          // El clic que deja un arrastre no la elige.
          onClick={() => {
            if (!cardDrag.consumeClick()) onSelect(isSelected ? null : card.id)
          }}
          onPointerDown={(event) => {
            lastPointer.current = event.pointerType
            cardDrag.start(event, card)
          }}
          // El clic derecho saca la carta (el menú del navegador no sale). Con el dedo sólo se bloquea el menú: ahí el toque largo es para arrastrarla.
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
        >
          {/* `instant`: la carta soltada en otra fila se monta de nuevo ahí, y aparece de una (sin el esqueleto ni el fundido de cuando carga). */}
          <CardArt tilt instant remoteUrl={card.image} name={card.name} className="pointer-events-none h-full w-full object-cover" />
        </div>
      </li>
    )
  }

  return (
    // Cada fila va en su caja (`data-tier-row`): es lo que se levanta al arrastrarla y lo que vuela a su lugar al reordenarlas; los botones de abajo y la bandeja también. Donde se puede soltar una carta
    // (`data-tier-drop`) es la caja entera de cada fila y la de la bandeja, con el recuadro de color y la columna del final.
    <div ref={boardRef} className={cx('relative grid gap-0.5', !reordered && 'stagger [--stagger-step:60ms]', (rowDrag.draggingId || cardDrag.ghost) && 'select-none')}>
      {list.tiers.map((tier, index) => {
        const to: Place = { kind: 'tier', id: tier.id }

        return (
          // La fila que se arrastra va por encima de las demás (con el fondo de la página, para que no se vea lo de abajo por la columna del agarre) y con el aro ámbar de toda la fila.
          <div key={tier.id} data-tier-row={tier.id} data-tier-drop={tier.id} className={cx(rowDrag.draggingId === tier.id && 'relative z-10 bg-background shadow-focus')}>
            <TierStrip
              label={tier.label}
              color={tier.color}
              ariaLabel={tier.label}
              title={t('meta.maker.editTier', { label: tier.label })}
              labelAriaLabel={t('meta.maker.editTier', { label: tier.label })}
              onLabel={() => onEditTier(tier.id)}
              highlighted={cardDrag.over === tier.id}
              onListClick={sendSelectedTo(to)}
              trailing={
                <>
                  <IconButton tone="ghost" aria-label={t('meta.maker.tierSettings', { label: tier.label })} title={t('meta.maker.tierSettings', { label: tier.label })} className="focus-visible:text-info" onClick={() => onEditTier(tier.id)}>
                    <Icon name="gear" />
                  </IconButton>
                  {/* `touch-none` sólo en el agarre: sobre el resto de la fila el dedo sigue desplazando la página. */}
                  <IconButton
                    tone="ghost"
                    aria-label={t('meta.maker.tierMove', { label: tier.label })}
                    aria-describedby={hintId}
                    title={t('meta.maker.tierMoveHint')}
                    // Mientras se arrastra queda ámbar (`data-active`), como un ícono elegido.
                    data-active={rowDrag.draggingId === tier.id ? 'true' : undefined}
                    className={cx('touch-none focus-visible:text-info', rowDrag.draggingId === tier.id ? 'cursor-grabbing' : 'cursor-grab')}
                    {...rowDrag.gripProps(tier.id, index)}
                  >
                    <Icon name="chevrons-up-down" />
                  </IconButton>
                </>
              }
            >
              {tier.cards.map((id) => list.cards[id]).filter((card): card is MakerCard => Boolean(card)).map((card) => tile(card, to))}
            </TierStrip>
          </div>
        )
      })}

      <div data-tier-row="actions">{children}</div>

      <div data-tier-row={POOL_KEY} data-tier-drop={POOL_KEY} className="mt-3 grid gap-0.5">
        <TierStrip neutral label={t('meta.maker.pool')} ariaLabel={t('meta.maker.pool')} highlighted={cardDrag.over === POOL_KEY} onListClick={sendSelectedTo({ kind: 'pool' })}>
          {list.pool.map((id) => list.cards[id]).filter((card): card is MakerCard => Boolean(card)).map((card) => tile(card, { kind: 'pool' }))}
        </TierStrip>
      </div>

      {/* El fantasma y la línea donde entra la carta van sueltos en la página (`fixed`): adentro del tablero heredarían su entrada escalonada (`stagger`). Encima del fantasma, la línea, que es lo que decide. */}
      {cardDrag.ghost
        ? createPortal(
            <>
              <DragGhost ghostRef={cardDrag.ghostRef} width={cardDrag.ghost.width} height={cardDrag.ghost.height} image={cardDrag.ghost.card.image} name={cardDrag.ghost.card.name} />
              <div ref={cardDrag.lineRef} hidden aria-hidden="true" className="pointer-events-none fixed left-0 top-0 z-[120] w-0.75 -translate-x-1/2 bg-info" />
            </>,
            document.body,
          )
        : null}

      <p id={hintId} className="sr-only">
        {t('meta.maker.tierMoveHint')}
      </p>
      <p className="sr-only" aria-live="polite">
        {announcement}
      </p>

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
                className={cx('h-10 min-w-10 max-w-24 cursor-pointer truncate rounded-control border-0 px-2 text-body font-bold focus-visible:outline-none focus-visible:shadow-focus aria-[current=true]:shadow-focus', labelInk(tier.color))}
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

import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties, type KeyboardEvent as ReactKeyboardEvent, type ReactNode } from 'react'
import { createPortal } from 'react-dom'

import { parseDerivedCardId } from '../../app/calculator-state'
import {
  allMatIds,
  cardKindOf,
  describeMatSteps,
  firstFree,
  isToken,
  listCardActions,
  locateCard,
  placedAt,
  randomSeed,
  TOKEN_KIND,
  type MatAction,
  type MatPile,
  type MatSpot,
  type MatState,
  type Placed,
} from '../../app/practice-mat'
import { createSavedCombo, readSavedCombos, writeSavedCombos, type SavedCombo } from '../../app/saved-combos'
import { showToastMessage } from '../../app/use-toast-message'
import { useMatDrag, type MatDragSource, type MatDropTarget } from '../../app/use-mat-drag'
import type { MatSession } from '../../app/use-mat-session'
import type { ApiCardReference, PatternKind } from '../../types'
import { fetchCardsByIds } from '../../ygoprodeck'
import { CardArt } from '../CardArt'
import { CardDetailOverlay } from '../card-detail/CardDetailOverlay'
import { buildCardSummary } from '../card-detail/card-summary'
import { Button } from '../ui/Button'
import { cx } from '../ui/cx'
import { Icon } from '../ui/Icon'
import { IconButton } from '../ui/IconButton'
import { Modal } from '../ui/Modal'
import { overline } from '../ui/typography'
import { CardBack, CardMenu, PILE_TITLES, PileViewer, SaveComboDialog, type MenuItem } from './MatDialogs'
import { cardIdOfDrawId } from './practice'
import { PracticeMatPanel } from './PracticeMatPanel'
import { CARD_BACK, PRACTICE_PALETTE } from './practice-styles'

export interface MatCard {
  name: string
  apiCard: ApiCardReference | null
}

interface PracticeMatProps {
  session: MatSession
  state: MatState
  /** Las cartas del deck actual por id de copia ("card-123-2"). */
  cardsById: ReadonlyMap<string, MatCard>
  deckName: string
  onDispatch: (action: MatAction) => void
  onUndo: () => void
  onSeek: (step: number) => void
  onLoadCombo: (combo: SavedCombo) => void
  onNewHand: () => void
  /** Debajo de la mano: el veredicto y las salidas/problemas de la mano inicial. */
  footer?: ReactNode
  /** Cartas (por id) que brillan: las que cumplen la salida o el problema tocado. */
  highlighted?: ReadonlySet<string>
  highlightKind?: PatternKind | null
  /** Mano sin salida: las cartas de la mano se ven grises. */
  muted?: boolean
}

/** Fuentes de arrastre que no son cartas: el tope del deck y la ficha. */
const DECK_TOP = 'deck-top'
const NEW_TOKEN = 'new-token'

const TOKEN_CARD: MatCard = { name: 'Ficha', apiCard: null }
const UNKNOWN_CARD: MatCard = { name: 'Carta', apiCard: null }
const EMPTY_IDS: ReadonlySet<string> = new Set()

/** Celda del campo o de una pila: borde punteado, se enciende cuando hay una carta encima. */
const CELL =
  'relative aspect-[421/614] min-w-0 rounded-tag border border-dashed border-tint/20 transition-colors duration-150 data-[over=true]:border-primary data-[over=true]:bg-primary/15'

/**
 * Carta en la mesa: arrastrable, sin menú de imagen ni selección (así el dedo no corta el arrastre).
 * El brillo (salida verde / problema rojo), la atenuación y el gris llegan por data-attributes.
 */
const MAT_CARD = [
  'relative block aspect-[421/614] w-full cursor-grab touch-none select-none overflow-hidden rounded-tag bg-input outline-none',
  '[-webkit-touch-callout:none] [-webkit-user-select:none] [&>*]:pointer-events-none [&_img]:[-webkit-user-drag:none]',
  'shadow-[0_6px_14px_rgba(0,0,0,0.45),0_0_0_1px_rgb(var(--foreground-rgb)/0.1)]',
  '[transition:filter_var(--motion-duration)_ease,box-shadow_var(--motion-duration)_ease]',
  'focus-visible:shadow-[0_6px_14px_rgba(0,0,0,0.45),0_0_0_2px_rgb(var(--primary-hover-rgb))]',
  'data-[dragging=true]:pointer-events-none data-[dragging=true]:opacity-30',
  'data-[muted=true]:grayscale data-[muted=true]:brightness-70',
  'data-[dim=true]:brightness-[0.42] data-[dim=true]:saturate-[0.6]',
  'data-[glow=true]:animate-card-glow data-[glow=true]:[--glow-rgb:var(--accent-rgb)] data-[glow-kind=problem]:[--glow-rgb:var(--danger-rgb)]',
  'data-[glow=true]:shadow-[0_6px_14px_rgba(0,0,0,0.45),0_0_0_2px_rgb(var(--glow-rgb)),0_0_22px_rgb(var(--glow-rgb)/0.6)]',
  'motion-reduce:animate-none motion-reduce:transition-none',
].join(' ')

const ZONE_LABELS: Record<MatSpot, string> = { mz: 'Zona de monstruo', emz: 'Zona extra de monstruo', st: 'Zona de magia y trampa', field: 'Zona de campo' }

/** Las zonas de péndulo (las puntas de la fila de magias y trampas) llevan la gema azul y la roja, como en la mesa real. */
const PENDULUM_GEM: Record<number, string> = {
  0: 'bg-[#4aa8ff]/55 shadow-[0_0_10px_#4aa8ff80]',
  4: 'bg-[#ff4d6d]/55 shadow-[0_0_10px_#ff4d6d80]',
}

const artOf = (card: MatCard) => card.apiCard?.imageUrlSmall ?? card.apiCard?.imageUrl ?? null

export function PracticeMat({
  session,
  state,
  cardsById,
  deckName,
  onDispatch,
  onUndo,
  onSeek,
  onLoadCombo,
  onNewHand,
  footer,
  highlighted = EMPTY_IDS,
  highlightKind = null,
  muted = false,
}: PracticeMatProps) {
  // Las cartas de un combo guardado pueden no estar más en el deck: se buscan por carta (otra copia) o se bajan.
  const byCardId = useMemo(() => {
    const map = new Map<string, MatCard>()
    for (const [drawId, card] of cardsById) {
      map.set(cardIdOfDrawId(drawId), card)
    }
    return map
  }, [cardsById])
  const [fetched, setFetched] = useState<ReadonlyMap<number, MatCard>>(new Map())
  const requestedRef = useRef(new Set<number>())

  const cardOf = useCallback(
    (id: string): MatCard => {
      if (isToken(id)) return TOKEN_CARD

      const known = cardsById.get(id) ?? byCardId.get(cardIdOfDrawId(id))
      if (known) return known

      const ygoId = parseDerivedCardId(cardIdOfDrawId(id))
      const remote = ygoId === null ? undefined : fetched.get(ygoId)
      return remote ?? { name: session.names[id] ?? UNKNOWN_CARD.name, apiCard: null }
    },
    [cardsById, byCardId, fetched, session.names],
  )

  useEffect(() => {
    const missing = [...new Set(allMatIds(state).map(cardIdOfDrawId))]
      .filter((cardId) => !byCardId.has(cardId))
      .map(parseDerivedCardId)
      .filter((ygoId): ygoId is number => ygoId !== null && !fetched.has(ygoId) && !requestedRef.current.has(ygoId))

    if (missing.length === 0) return

    missing.forEach((ygoId) => requestedRef.current.add(ygoId))
    void fetchCardsByIds(missing)
      .then((cards) => setFetched((current) => new Map([...current, ...cards.map((card) => [card.ygoprodeckId, { name: card.name, apiCard: card }] as const)])))
      .catch(() => {})
  }, [state, byCardId, fetched])

  const nameOf = useCallback((id: string) => cardOf(id).name, [cardOf])
  const kindOf = useCallback((id: string) => (isToken(id) ? TOKEN_KIND : cardKindOf(cardOf(id).apiCard)), [cardOf])
  const steps = useMemo(() => describeMatSteps(session.initial, session.actions, nameOf), [session.initial, session.actions, nameOf])
  const live = session.cursor === session.actions.length

  const [menu, setMenu] = useState<{ kind: 'card'; id: string; rect: DOMRect } | { kind: 'deck'; rect: DOMRect } | null>(null)
  const [viewer, setViewer] = useState<MatPile | null>(null)
  const [inspected, setInspected] = useState<{ id: string; rect: DOMRect } | null>(null)
  const [preview, setPreview] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [panelOpen, setPanelOpen] = useState(false)
  const [combos, setCombos] = useState<SavedCombo[]>(() => readSavedCombos())

  const closeViewer = useCallback(() => {
    // Después de mirar el deck se baraja, como en la mesa real (y la jugada queda anotada).
    if (viewer === 'deck') {
      onDispatch({ type: 'shuffle', seed: randomSeed() })
    }

    setViewer(null)
  }, [viewer, onDispatch])

  const play = useCallback(
    (action: MatAction) => {
      onDispatch(action)
      setMenu(null)

      if (viewer) {
        closeViewer()
      }
    },
    [onDispatch, viewer, closeViewer],
  )

  const handleDrop = useCallback(
    (source: MatDragSource, target: MatDropTarget) => {
      if (source.id === NEW_TOKEN) {
        if (target.kind === 'spot' && target.spot !== 'st' && target.spot !== 'field' && !placedAt(state, target.spot, target.index)) {
          onDispatch({ type: 'token', zone: target.spot, index: target.index })
        }
        return
      }

      if (source.id === DECK_TOP) {
        const top = state.deck[0]
        if (!top) return
        if (target.kind === 'pile') {
          if (target.pile === 'hand') onDispatch({ type: 'draw', count: 1 })
          else if (target.pile === 'gy') onDispatch({ type: 'mill', count: 1 })
          else if (target.pile === 'banished') onDispatch({ type: 'move', id: top, to: 'banished' })
        } else if (!placedAt(state, target.spot, target.index)) {
          onDispatch({ type: 'place', id: top, zone: target.spot, index: target.index, pos: 'atk' })
        }
        return
      }

      const where = locateCard(state, source.id)
      if (!where) return

      if (target.kind === 'pile') {
        if (where.kind === 'pile' && where.pile === target.pile) return
        onDispatch({ type: 'move', id: source.id, to: target.pile })
        return
      }

      const occupant = placedAt(state, target.spot, target.index)

      if (occupant) {
        if (occupant.id !== source.id && kindOf(occupant.id).xyz && kindOf(source.id).monster) {
          onDispatch({ type: 'attach', id: source.id, to: occupant.id })
        }
        return
      }

      const pos = where.kind === 'spot' ? where.placed.pos : 'atk'
      onDispatch({ type: 'place', id: source.id, zone: target.spot, index: target.index, pos })
    },
    [state, onDispatch, kindOf],
  )

  const handleTap = useCallback(
    (source: MatDragSource, rect: DOMRect) => {
      if (source.id === NEW_TOKEN) {
        const index = firstFree(state, 'mz')
        if (index !== null) onDispatch({ type: 'token', zone: 'mz', index })
        return
      }

      if (source.id === DECK_TOP) {
        setMenu({ kind: 'deck', rect })
        return
      }

      setPreview(source.id)
      setMenu({ kind: 'card', id: source.id, rect })
    },
    [state, onDispatch],
  )

  const { drag, over, bind, setGhostElement } = useMatDrag({ onDrop: handleDrop, onTap: handleTap })

  const menuItems: MenuItem[] = useMemo(() => {
    if (!menu) return []

    if (menu.kind === 'deck') {
      const items: MenuItem[] = [
        { label: 'Robar', onSelect: () => play({ type: 'draw', count: 1 }) },
        { label: 'Mandar al cementerio', onSelect: () => play({ type: 'mill', count: 1 }) },
        { label: 'Ver el deck', onSelect: () => { setMenu(null); setViewer('deck') } },
        { label: 'Barajar', onSelect: () => play({ type: 'shuffle', seed: randomSeed() }) },
      ]
      return state.deck.length === 0 ? items.slice(2, 3) : items
    }

    return listCardActions(state, menu.id, kindOf, nameOf).map((item) => ({ label: item.label, onSelect: () => play(item.action) }))
  }, [menu, state, kindOf, nameOf, play])

  const menuCard = menu?.kind === 'card' ? cardOf(menu.id) : null
  const menuWhere = menu?.kind === 'card' ? locateCard(state, menu.id) : null
  const menuKicker = menuWhere ? (menuWhere.kind === 'pile' ? PILE_TITLES[menuWhere.pile] : menuWhere.kind === 'spot' ? ZONE_LABELS[menuWhere.spot] : `Material de ${nameOf(menuWhere.of)}`) : 'Deck'

  const saveCombo = (name: string) => {
    const combo = createSavedCombo({ name, deckName, initial: session.initial, actions: session.actions.slice(0, session.cursor), nameOf }, combos)
    const next = [...combos, combo]
    writeSavedCombos(next)
    setCombos(next)
    setSaving(false)
    showToastMessage(`Combo “${combo.name}” guardado.`, 'success')
  }

  const deleteCombo = (combo: SavedCombo) => {
    const next = combos.filter((entry) => entry.id !== combo.id)
    writeSavedCombos(next)
    setCombos(next)
    showToastMessage(`Borraste “${combo.name}”.`, 'warning')
  }

  const panel = (
    <PracticeMatPanel
      steps={steps}
      cursor={session.cursor}
      onSeek={(step) => { onSeek(step); setPanelOpen(false) }}
      combos={combos}
      deckName={deckName}
      onLoad={(combo) => { onLoadCombo(combo); setPanelOpen(false) }}
      onDelete={deleteCombo}
      className="min-h-0 flex-1"
    />
  )

  const cardProps = (id: string) => ({
    card: cardOf(id),
    dragging: drag?.source.id === id,
    glow: highlighted.has(id),
    glowKind: highlightKind,
    dim: highlighted.size > 0 && !highlighted.has(id),
    bind,
    onOpen: (rect: DOMRect) => {
      setPreview(id)
      setMenu({ kind: 'card', id, rect })
    },
    onHover: () => setPreview(id),
  })

  const cell = (spot: MatSpot, index: number, area: string) => {
    const placed = placedAt(state, spot, index)
    const drop = spot === 'field' ? 'field' : `${spot}:${index}`
    const label = spot === 'field' ? ZONE_LABELS.field : `${ZONE_LABELS[spot]} ${index + 1}`
    const gem = spot === 'st' ? PENDULUM_GEM[index] : undefined

    return (
      <div key={drop} role="group" aria-label={label} data-drop={drop} data-over={over === drop ? 'true' : 'false'} className={CELL} style={{ gridArea: area }}>
        {gem && !placed ? <span aria-hidden="true" className={cx('absolute left-1/2 top-1/2 size-3.5 -translate-x-1/2 -translate-y-1/2 rotate-45 rounded-[3px]', gem)} /> : null}
        {placed ? <PlacedCard placed={placed} {...cardProps(placed.id)} /> : null}
      </div>
    )
  }

  const topOf = (pile: MatPile) => state[pile][state[pile].length - 1] ?? null
  const pileCell = (pile: 'extra' | 'gy' | 'banished', area: string) => {
    const top = pile === 'extra' ? null : topOf(pile)
    const count = state[pile].length

    return (
      <button
        key={pile}
        type="button"
        aria-label={`${PILE_TITLES[pile]}: ${count}`}
        title={PILE_TITLES[pile]}
        data-drop={pile}
        data-over={over === pile ? 'true' : 'false'}
        className={cx(CELL, 'cursor-pointer overflow-hidden bg-transparent p-0 text-left focus-visible:outline-none focus-visible:shadow-focus')}
        style={{ gridArea: area }}
        onClick={() => setViewer(pile)}
      >
        {pile === 'extra' && count > 0 ? <span className={CARD_BACK} /> : null}
        {top ? <CardArt remoteUrl={artOf(cardOf(top))} name={cardOf(top).name} className="block h-full w-full object-cover" /> : null}
        <PileBadge label={PILE_TITLES[pile]} count={count} />
      </button>
    )
  }

  const previewCard = preview ? cardOf(preview) : null

  return (
    <section
      aria-label="Mesa de práctica"
      className={cx(
        // `select-none`: un arrastre que arranca entre dos cartas no debe pintar texto seleccionado por toda la mesa.
        'grid h-full min-h-0 select-none grid-rows-[auto_minmax(0,1fr)] [background:radial-gradient(120%_60%_at_50%_0%,rgb(var(--primary-rgb)/0.16),transparent_70%),rgb(var(--background-rgb))] min-[1101px]:grid-cols-[minmax(0,1fr)_20rem]',
        PRACTICE_PALETTE,
      )}
    >
      {/* Barra: nueva mano, deshacer, guardar y (en el celu) el panel. Deja lugar a la X del modal. */}
      <div className="col-start-1 row-start-1 flex items-center gap-1 px-2 pr-14 pt-2 min-[1101px]:px-4 min-[1101px]:pt-3" role="toolbar" aria-label="Mesa">
        <IconButton tone="flat" size="sm" aria-label="Nueva mano" title="Nueva mano" onClick={onNewHand}>
          <Icon name="refresh" />
        </IconButton>
        <IconButton tone="flat" size="sm" aria-label="Deshacer" title="Deshacer" disabled={session.cursor === 0} className="disabled:opacity-35" onClick={onUndo}>
          <Icon name="undo" />
        </IconButton>
        <IconButton tone="flat" size="sm" aria-label="Guardar combo" title="Guardar combo" disabled={session.cursor === 0} className="disabled:opacity-35" onClick={() => setSaving(true)}>
          <Icon name="save" />
        </IconButton>
        <IconButton tone="flat" size="sm" aria-label="Pasos y combos" title="Pasos y combos" className="min-[1101px]:hidden" onClick={() => setPanelOpen(true)}>
          <Icon name="list" />
        </IconButton>
      </div>

      <div className="col-start-1 row-start-2 flex min-h-0 flex-col gap-2 overflow-y-auto overflow-x-hidden px-2 pb-[calc(0.5rem+env(safe-area-inset-bottom,0px))] min-[1101px]:px-4 min-[1101px]:pb-4">
        {/* El campo, con la disposición de DuelingBook: campo arriba a la izquierda, destierro arriba a la derecha, cementerio y deck a la derecha, Extra abajo a la izquierda. */}
        <div
          className="grid grid-cols-5 gap-1.5 [grid-template-areas:'fld_emz1_._emz2_.'_'m1_m2_m3_m4_m5'_'s1_s2_s3_s4_s5'_'extra_gy_ban_tok_deck'] min-[1101px]:justify-center min-[1101px]:gap-2 min-[1101px]:grid-cols-[repeat(7,minmax(0,6.25rem))] min-[1101px]:[grid-template-areas:'fld_._emz1_._emz2_._ban'_'tok_m1_m2_m3_m4_m5_gy'_'extra_s1_s2_s3_s4_s5_deck']"
          aria-label="Campo"
        >
          {cell('field', 0, 'fld')}
          {cell('emz', 0, 'emz1')}
          {cell('emz', 1, 'emz2')}
          {state.mz.map((_, index) => cell('mz', index, `m${index + 1}`))}
          {state.st.map((_, index) => cell('st', index, `s${index + 1}`))}

          {/* Deck: se arrastra su tope (robar, mandar al cementerio, sacar al campo) o se toca para el menú. */}
          <div
            role="button"
            tabIndex={0}
            aria-label={`Deck: ${state.deck.length}`}
            title="Deck"
            data-drop="deck"
            data-over={over === 'deck' ? 'true' : 'false'}
            className={cx(CELL, state.deck.length > 0 && 'cursor-grab touch-none select-none [-webkit-touch-callout:none]', 'focus-visible:outline-none focus-visible:shadow-focus')}
            style={{ gridArea: 'deck' }}
            {...bind({ id: DECK_TOP, name: 'Deck', art: null, back: true })}
            onKeyDown={(event) => activate(event, () => setMenu({ kind: 'deck', rect: event.currentTarget.getBoundingClientRect() }))}
            onContextMenu={(event) => event.preventDefault()}
          >
            {state.deck.length > 0 ? (
              <>
                <span className={cx(CARD_BACK, '[transform:translate(-3px,3px)]')} />
                <span className={cx(CARD_BACK, '[transform:translate(-1.5px,1.5px)]')} />
                <span className={CARD_BACK} />
              </>
            ) : null}
            <PileBadge label="Deck" count={state.deck.length} />
          </div>
          {pileCell('extra', 'extra')}
          {pileCell('gy', 'gy')}
          {pileCell('banished', 'ban')}

          {/* Ficha: se arrastra a una zona de monstruo o se toca para ponerla en la primera libre. */}
          <div
            role="button"
            tabIndex={0}
            aria-label="Ficha"
            title="Ficha"
            className={cx(CELL, 'grid cursor-grab touch-none select-none place-items-center text-micro font-semibold text-muted [-webkit-touch-callout:none] focus-visible:outline-none focus-visible:shadow-focus')}
            style={{ gridArea: 'tok' }}
            {...bind({ id: NEW_TOKEN, name: 'Ficha', art: null })}
            onKeyDown={(event) => activate(event, () => handleTap({ id: NEW_TOKEN, name: 'Ficha', art: null }, event.currentTarget.getBoundingClientRect()))}
            onContextMenu={(event) => event.preventDefault()}
          >
            <span className="grid justify-items-center gap-0.5">
              <Icon name="plus" size={16} />
              Ficha
            </span>
          </div>
        </div>

        {/* La mano: las cartas se achican para entrar todas sin solaparse. */}
        <div
          role="list"
          aria-label="Mano"
          data-drop="hand"
          data-over={over === 'hand' ? 'true' : 'false'}
          className="flex min-h-[5.5rem] items-end justify-center gap-1 rounded-card px-1 py-1 transition-colors duration-150 data-[over=true]:bg-primary/15 min-[1101px]:min-h-[8rem]"
        >
          {state.hand.map((id) => (
            <HandCard key={id} id={id} count={state.hand.length} muted={muted} {...cardProps(id)} />
          ))}
          {state.hand.length === 0 ? <span className="self-center text-micro text-soft">Sin cartas en la mano</span> : null}
        </div>

        {footer ? <div className="px-1">{footer}</div> : null}

        {/* Pasos: en vivo muestra la última jugada; con jugadas, se recorre con Anterior / Siguiente. */}
        <div className="flex min-h-9 flex-wrap items-center gap-x-2 gap-y-1 px-1 text-micro text-muted" role="status" aria-label="Paso actual">
          {session.actions.length > 0 ? (
            <>
              <Button variant="tertiary" size="sm" className="min-h-8 px-2" disabled={session.cursor === 0} onClick={() => onSeek(session.cursor - 1)}>
                Anterior
              </Button>
              <span className="font-semibold tabular-nums text-foreground">
                {session.cursor}/{session.actions.length}
              </span>
              <Button variant="tertiary" size="sm" className="min-h-8 px-2" disabled={live} onClick={() => onSeek(session.cursor + 1)}>
                Siguiente
              </Button>
            </>
          ) : null}
          <span className="min-w-0 flex-1 truncate">{session.cursor === 0 ? (session.actions.length > 0 ? 'Mano inicial' : 'Arrastrá una carta a una zona o tocala para ver qué podés hacer.') : steps[session.cursor - 1]}</span>
        </div>
      </div>

      {/* Panel lateral (escritorio): la carta que se está mirando arriba, los pasos y los combos abajo. */}
      <aside className="hidden min-h-0 border-l border-border-subtle px-3 py-3 pr-14 min-[1101px]:col-start-2 min-[1101px]:row-span-2 min-[1101px]:row-start-1 min-[1101px]:flex min-[1101px]:flex-col min-[1101px]:gap-3" aria-label="Pasos y combos">
        <CardPreview card={previewCard} />
        {panel}
      </aside>

      <Modal isOpen={panelOpen} onClose={() => setPanelOpen(false)} size="md" kicker="Mesa" title="Pasos y combos">
        {panel}
      </Modal>

      <CardMenu
        anchor={menu?.rect ?? null}
        kicker={menuKicker}
        title={menuCard?.name ?? 'Deck'}
        items={menuItems}
        onInspect={menu?.kind === 'card' && !isToken(menu.id) ? () => { setInspected({ id: menu.id, rect: menu.rect }); setMenu(null) } : undefined}
        onClose={() => setMenu(null)}
      />

      <PileViewer pile={viewer} ids={viewer ? state[viewer] : []} info={(id) => ({ name: cardOf(id).name, art: artOf(cardOf(id)) })} onPick={(id, rect) => { setPreview(id); setMenu({ kind: 'card', id, rect }) }} onClose={closeViewer} />

      <SaveComboDialog key={String(saving)} isOpen={saving} defaultName={`Combo ${combos.length + 1}`} onSave={saveCombo} onClose={() => setSaving(false)} />

      {inspected ? <CardDetailOverlay key={inspected.id} name={cardOf(inspected.id).name} card={cardOf(inspected.id).apiCard} origin={inspected.rect} onClose={() => setInspected(null)} /> : null}

      {drag
        ? createPortal(
            <div ref={setGhostElement} className="pointer-events-none fixed left-0 top-0 z-200 opacity-90 will-change-transform" style={{ width: drag.width, height: drag.height }} aria-hidden="true">
              {drag.source.back ? (
                <CardBack className="h-full" />
              ) : drag.source.id === NEW_TOKEN ? (
                <span className="grid h-full w-full place-items-center rounded-tag border border-primary bg-card-background text-micro font-semibold text-foreground">Ficha</span>
              ) : (
                <CardArt remoteUrl={drag.source.art} name={drag.source.name} className="block h-full w-full rounded-tag object-cover shadow-[0_18px_32px_rgba(0,0,0,0.55)]" />
              )}
            </div>,
            document.body,
          )
        : null}
    </section>
  )
}

function activate(event: ReactKeyboardEvent<HTMLElement>, run: () => void) {
  if (event.key === 'Enter' || event.key === ' ') {
    event.preventDefault()
    run()
  }
}

function PileBadge({ label, count }: { label: string; count: number }) {
  return (
    <span className="pointer-events-none absolute inset-x-0 bottom-0 z-2 grid justify-items-center rounded-b-tag bg-background/75 px-0.5 py-0.5 text-center leading-none">
      <span className="max-w-full truncate text-[0.5rem] font-semibold uppercase tracking-[0.02em] text-soft min-[1101px]:text-[0.6rem] min-[1101px]:tracking-[0.06em]">{label}</span>
      <span className="text-micro font-extrabold tabular-nums text-foreground">{count}</span>
    </span>
  )
}

/** La carta que se está mirando (al pasar el mouse o tocarla), como el panel de la izquierda de DuelingBook. */
function CardPreview({ card }: { card: MatCard | null }) {
  const summary = card?.apiCard ? buildCardSummary(card.apiCard) : null

  return (
    <div className="grid flex-none grid-cols-[5.5rem_minmax(0,1fr)] gap-3" aria-label="Carta" aria-live="polite">
      <span className="relative block aspect-[421/614] w-full overflow-hidden rounded-tag bg-input shadow-[0_6px_14px_rgba(0,0,0,0.45)]">
        {card ? <CardArt remoteUrl={artOf(card)} name={card.name} className="block h-full w-full object-cover" /> : null}
      </span>
      <div className="grid min-w-0 content-start gap-1">
        {card ? (
          <>
            <strong className="text-body font-semibold leading-tight text-foreground [overflow-wrap:anywhere]">{card.name}</strong>
            {summary ? (
              <span className="text-micro text-muted">
                {summary.typeLine}
                {summary.statLine ? ` · ${summary.statLine}` : ''}
              </span>
            ) : null}
            <p className="m-0 max-h-[7.5rem] overflow-y-auto whitespace-pre-wrap text-micro leading-snug text-foreground/85 [overflow-wrap:anywhere]">{card.apiCard?.description?.trim() || 'Sin texto disponible.'}</p>
          </>
        ) : (
          <span className={cx('self-center', overline)}>Pasá por una carta para leerla</span>
        )}
      </div>
    </div>
  )
}

interface CardProps {
  card: MatCard
  dragging: boolean
  glow: boolean
  glowKind: PatternKind | null
  dim: boolean
  bind: ReturnType<typeof useMatDrag>['bind']
  onOpen: (rect: DOMRect) => void
  onHover: () => void
}

/** Carta en una zona del campo: boca abajo muestra el dorso, en defensa se acuesta; contadores y materiales como etiquetas. */
function PlacedCard({ placed, card, dragging, glow, glowKind, dim, bind, onOpen, onHover }: CardProps & { placed: Placed }) {
  const label = `${card.name}${placed.pos === 'set' ? ', boca abajo' : placed.pos === 'def' ? ', en defensa' : ''}`

  return (
    <div
      role="button"
      tabIndex={0}
      aria-label={label}
      title={label}
      className={cx(MAT_CARD, 'absolute inset-0 h-full')}
      data-dragging={dragging ? 'true' : 'false'}
      data-glow={glow ? 'true' : 'false'}
      data-glow-kind={glow ? (glowKind ?? 'opening') : undefined}
      data-dim={dim ? 'true' : 'false'}
      {...bind({ id: placed.id, name: card.name, art: artOf(card) })}
      onPointerEnter={onHover}
      onKeyDown={(event) => activate(event, () => onOpen(event.currentTarget.getBoundingClientRect()))}
      onContextMenu={(event) => event.preventDefault()}
    >
      {placed.pos === 'set' ? (
        <span className={CARD_BACK} />
      ) : (
        <span className={cx('block h-full w-full transition-transform duration-150', placed.pos === 'def' && 'rotate-90 scale-[0.68]')}>
          <CardArt remoteUrl={artOf(card)} name={card.name} className="block h-full w-full object-cover" />
        </span>
      )}
      {placed.counters > 0 ? <span className="absolute left-0.5 top-0.5 z-2 rounded-full bg-warning px-1.5 py-px text-[0.6rem] font-extrabold leading-tight text-[#1a1204]">{placed.counters}</span> : null}
      {placed.materials.length > 0 ? <span className="absolute bottom-0.5 right-0.5 z-2 rounded-full bg-primary px-1.5 py-px text-[0.6rem] font-extrabold leading-tight text-primary-foreground">+{placed.materials.length}</span> : null}
    </div>
  )
}

function HandCard({ id, card, count, muted, dragging, glow, glowKind, dim, bind, onOpen, onHover }: CardProps & { id: string; count: number; muted: boolean }) {
  const style: CSSProperties = { width: `min(var(--hand-card), calc((100% - ${(count - 1) * 4}px) / ${count}))` }

  return (
    <div
      role="listitem"
      tabIndex={0}
      aria-label={card.name}
      title={card.name}
      className={cx(MAT_CARD, 'shrink-0 animate-pop [--hand-card:4rem] min-[1101px]:[--hand-card:6rem]')}
      style={style}
      data-dragging={dragging ? 'true' : 'false'}
      data-glow={glow ? 'true' : 'false'}
      data-glow-kind={glow ? (glowKind ?? 'opening') : undefined}
      data-dim={dim ? 'true' : 'false'}
      data-muted={muted ? 'true' : 'false'}
      {...bind({ id, name: card.name, art: artOf(card) })}
      onPointerEnter={onHover}
      onKeyDown={(event) => activate(event, () => onOpen(event.currentTarget.getBoundingClientRect()))}
      onContextMenu={(event) => event.preventDefault()}
    >
      <CardArt remoteUrl={artOf(card)} name={card.name} className="block h-full w-full object-cover" limitCard={card.apiCard} limitBadgeSize="sm" />
    </div>
  )
}

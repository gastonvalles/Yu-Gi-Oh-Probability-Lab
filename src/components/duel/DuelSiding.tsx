import { useEffect, useMemo, useRef, useState } from 'react'

import { getDesktopCompactDeckColumnCount } from '../../app/deck-zone-layout'
import { canGoTo, deckOrder, parseSideInstance, renumberDeck, SIDE_ZONES, sideInstanceId, sidingProblems, sortedZone, tapTarget, type SideCard, type SideDeck, type SideZone, type SidingProblem } from '../../app/duel-siding'
import { formatClock } from '../../app/life-calculator'
import type { DeckCardInstance } from '../../app/model'
import { showToastMessage } from '../../app/use-toast-message'
import type { SidingDraft } from '../../app/duel-save'
import { useDeckPointerDrag } from '../../app/use-deck-pointer-drag'
import { DESKTOP_DECK_BUILDER_MEDIA_QUERY, useMediaQuery } from '../../app/use-media-query'
import { t } from '../../i18n'
import type { DeckFormat } from '../../types'
import { DeckZone } from '../DeckZone'
import { DeckModeDragOverlay } from '../deck-mode/DeckModeDragOverlay'
import { Button } from '../ui/Button'
import { Callout } from '../ui/Callout'
import { cx } from '../ui/cx'
import { Heading } from '../ui/Heading'

/** Cuánto tiempo hay para hacer siding: pasado el tiempo, el duelo sigue con el deck como esté (o con el de antes, si no cumple). */
export const SIDING_MS = 3 * 60 * 1000

interface DuelSidingProps {
  /** El deck con que se jugó el duelo que terminó: de acá se parte. */
  deck: SideDeck
  cardsById: ReadonlyMap<string, SideCard>
  format: DeckFormat
  /** El tope de puntos de la sala si es Genesys. */
  genesysCap?: number
  rival: string
  /** Ya toqué «Listo»: se espera al rival y no se cambia más. */
  locked: boolean
  rivalReady: boolean
  /** Lo que había armado antes de recargar la página (si se puede usar: las mismas cartas que el deck de partida) y cuándo se acaba el tiempo. */
  saved?: SidingDraft | null
  /** Avisa cada cambio, para guardarlo: recargar vuelve a esta pantalla con las cartas como estaban. */
  onProgress?: (draft: SidingDraft) => void
  /** El deck con los cambios, con ids de copia nuevos, y los datos de sus cartas. */
  onReady: (deck: SideDeck, cardsById: Map<string, SideCard>) => void
}

const ZONE_NAME: Record<SideZone, () => string> = {
  main: () => t('duel.siding.zone.main'),
  extra: () => t('duel.siding.zone.extra'),
  side: () => t('duel.siding.zone.side'),
}

function problemText(problem: SidingProblem): string {
  switch (problem.kind) {
    case 'main-small':
      return t('duel.siding.problem.mainSmall', { count: problem.count, min: problem.min })
    case 'main-big':
      return t('duel.siding.problem.mainBig', { count: problem.count, max: problem.max })
    case 'extra-big':
      return t('duel.siding.problem.extraBig', { count: problem.count, max: problem.max })
    case 'side-big':
      return t('duel.siding.problem.sideBig', { count: problem.count, max: problem.max })
    case 'format':
      return problem.text
  }
}

/** Las dos listas tienen las mismas copias (en cualquier zona): lo guardado sólo sirve si es del mismo deck de partida. */
function sameCards(a: SideDeck, b: SideDeck): boolean {
  const all = (deck: SideDeck) => [...deck.main, ...deck.extra, ...deck.side].sort().join('|')

  return all(a) === all(b)
}

/**
 * Las copias de una zona como cartas del builder. Cada una se distingue por su lugar en la zona (`sideInstanceId`); las que no tienen los datos de su carta no se pueden
 * mostrar (ni se sabe de qué tipo son): quedan en el conteo del deck pero no en la grilla.
 */
function zoneCards(zone: SideZone, ids: readonly string[], cardsById: ReadonlyMap<string, SideCard>): DeckCardInstance[] {
  return ids.flatMap((id, index) => {
    const card = cardsById.get(id)

    return card?.apiCard ? [{ instanceId: sideInstanceId(zone, index), name: card.name, apiCard: card.apiCard, origin: null, roles: [], needsReview: false }] : []
  })
}

/**
 * El siding de un Match: tu Main, tu Extra y tu Side como en el builder (las mismas zonas, las mismas cartas y el mismo arrastre). Una carta se arrastra a otra zona o se toca
 * para pasarla: del Main y del Extra al Side, y del Side a donde le toca. El rival no ve nada. Con el deck bien, «Listo» lo deja guardado; cuando los dos están listos empieza
 * el siguiente duelo con los cambios. No hay otra salida que «Listo» (o que se acabe el tiempo).
 */
export function DuelSiding({ deck, cardsById, format, genesysCap, rival, locked, rivalReady, saved, onProgress, onReady }: DuelSidingProps) {
  // Las copias de una carta quedan juntas en su zona (en el orden del deck de partida), también después de pasar de una zona a otra.
  const order = useMemo(() => deckOrder(deck), [deck])
  const [lists, setLists] = useState<SideDeck>(() => (console.log('INIT', Boolean(saved), saved?.lists.main.length, saved?.lists.side.length), saved && sameCards(saved.lists, deck) ? saved.lists : { main: sortedZone(deck.main, order), extra: sortedZone(deck.extra, order), side: sortedZone(deck.side, order) }))
  const problems = useMemo(() => sidingProblems(lists, { main: deck.main.length }, cardsById, format, genesysCap), [lists, deck.main.length, cardsById, format, genesysCap])
  const [deadline] = useState(() => (saved && sameCards(saved.lists, deck) ? saved.deadline : Date.now() + SIDING_MS))
  const [left, setLeft] = useState(() => Math.max(0, Math.min(SIDING_MS, deadline - Date.now())))
  const done = useRef(false)
  const desktop = useMediaQuery(DESKTOP_DECK_BUILDER_MEDIA_QUERY)
  // Lo que se confirma si se acaba el tiempo: los cambios, si el deck cumple; si no, el deck con que se jugó.
  const onTime = useRef<SideDeck>(deck)

  useEffect(() => {
    onTime.current = problems.length === 0 ? lists : deck
  }, [problems, lists, deck])

  // El aviso va por una ref: cambia en cada render del dueño y no tiene por qué volver a guardar.
  const progress = useRef(onProgress)

  progress.current = onProgress

  useEffect(() => {
    progress.current?.({ lists, deadline })
  }, [lists, deadline])

  useEffect(() => {
    if (locked) {
      return
    }

    const id = window.setInterval(() => {
      const remaining = Math.max(0, deadline - Date.now())

      setLeft(remaining)

      if (remaining === 0 && !done.current) {
        done.current = true
        window.clearInterval(id)

        const fresh = renumberDeck(onTime.current, cardsById)

        onReady(fresh.deck, fresh.cardsById)
      }
    }, 500)

    return () => window.clearInterval(id)
  }, [locked, deadline, cardsById, onReady])

  /** La copia que está en ese lugar, con su carta (undefined si ya no está: el deck cambió). */
  const copyAt = (instanceId: string) => {
    const place = parseSideInstance(instanceId)
    const id = place ? lists[place.zone][place.index] : undefined

    return place && id !== undefined ? { ...place, id, card: cardsById.get(id) } : null
  }

  /** Pasa la copia `index` de `from` a `to` (las copias de una carta quedan juntas en su zona). */
  const move = (from: SideZone, index: number, to: SideZone) => {
    setLists((current) => {
      const picked = current[from][index]

      return picked === undefined || from === to ? current : { ...current, [from]: current[from].filter((_, position) => position !== index), [to]: sortedZone([...current[to], picked], order) }
    })
  }

  const { activeDragInstanceId, activeDropZone, invalidDropZone, consumeSuppressedPointerClick, dragOverlay, dragOverlayRef, startPointerDrag } = useDeckPointerDrag({
    // Arrastrar acepta cualquier zona que la carta admita (un monstruo del Extra Deck no va al Main ni al revés); los topes los dice el aviso de arriba, como al tocar.
    canDrop: (payload, zone) => {
      const copy = payload.type === 'deck-card' ? copyAt(payload.instanceId) : null

      return copy !== null && (copy.zone === zone || canGoTo(copy.card, zone))
    },
    onDrop: ({ payload, zone }) => {
      const copy = payload.type === 'deck-card' ? copyAt(payload.instanceId) : null

      if (copy) {
        move(copy.zone, copy.index, zone)
      }
    },
    resolveSearchDrop: () => null,
  })

  const startDrag = (event: Parameters<typeof startPointerDrag>[0], instanceId: string) => {
    const card = locked ? undefined : copyAt(instanceId)?.card

    if (card?.apiCard) {
      startPointerDrag(event, { type: 'deck-card', instanceId }, card.name, card.apiCard)
    }
  }

  /** Un toque (o Enter) pasa la carta a la zona que le toca y avisa adónde fue (la otra zona puede estar fuera de la pantalla). */
  const tap = (instanceId: string) => {
    const copy = copyAt(instanceId)

    if (locked || !copy || consumeSuppressedPointerClick()) {
      return
    }

    const to = tapTarget(copy.card, copy.zone)

    move(copy.zone, copy.index, to)
    showToastMessage(t('duel.siding.moved', { name: copy.card?.name ?? copy.id, zone: ZONE_NAME[to]() }), 'info')
  }

  const cardAction = (card: DeckCardInstance) => {
    const copy = copyAt(card.instanceId)

    return t('duel.siding.moveLabel', { name: card.name, zone: ZONE_NAME[tapTarget(copy?.card, copy?.zone ?? 'main')]() })
  }

  return (
    <>
      <div className="grid gap-1">
        <Heading level="section">{t('duel.siding.title')}</Heading>
        <p className="m-0 text-body text-muted">{t('duel.siding.intro')}</p>
      </div>

      {problems.length > 0 ? (
        <Callout tone="warning" icon="alert">
          <span className="grid gap-1">
            {problems.map((problem) => (
              <span key={problemText(problem)}>{problemText(problem)}</span>
            ))}
          </span>
        </Callout>
      ) : null}

      {/* Las tres zonas del builder, con su mismo arrastre; ya listo, se ven pero no se tocan. */}
      <div className={cx('grid gap-4', locked && 'pointer-events-none opacity-60')} data-testid="siding-zones">
        {SIDE_ZONES.map((zone) => (
          <DeckZone
            key={zone}
            zone={zone}
            title={ZONE_NAME[zone]()}
            cards={zoneCards(zone, lists[zone], cardsById)}
            activeDragInstanceId={activeDragInstanceId?.startsWith(`${zone}:`) ? activeDragInstanceId : null}
            dropState={activeDropZone === zone ? 'valid' : invalidDropZone === zone ? 'invalid' : 'idle'}
            desktopCompact={desktop}
            desktopCompactColumnCount={getDesktopCompactDeckColumnCount(zone, lists[zone].length)}
            variant={desktop ? 'classic-builder' : 'default'}
            cardAction={cardAction}
            onDeckCardPointerDown={startDrag}
            onDeckCardClick={tap}
            onRemoveCard={tap}
          />
        ))}
      </div>

      <DeckModeDragOverlay overlay={dragOverlay} overlayRef={dragOverlayRef} />

      {/* Abajo, al alcance del pulgar, y fijo (el deck puede ser largo): lo que falta a la izquierda y «Listo», la acción, a la derecha. */}
      <div className="sticky bottom-0 z-10 -mx-4 -mb-6 flex items-center justify-between gap-3 border-t border-border-subtle bg-background/90 px-4 py-3 backdrop-blur max-[1100px]:bottom-[calc(4rem+env(safe-area-inset-bottom,0px))]">
        <div className="grid min-w-0 gap-0.5">
          {locked ? (
            <p className="m-0 text-body text-muted" role="status">
              {t('duel.siding.waiting', { name: rival })}
            </p>
          ) : (
            <>
              <p className={left < 30_000 ? 'm-0 text-body font-semibold tabular-nums text-danger-soft' : 'm-0 text-body font-semibold tabular-nums text-foreground'} data-testid="siding-clock">
                {t('duel.siding.time', { time: formatClock(left) })}
              </p>
              {rivalReady ? (
                <p className="m-0 text-micro text-soft" role="status">
                  {t('duel.siding.rivalReady', { name: rival })}
                </p>
              ) : null}
            </>
          )}
        </div>
        <Button
          variant="primary"
          color="confirm"
          icon="check"
          className="shrink-0"
          disabled={locked || problems.length > 0}
          onClick={() => {
            done.current = true

            const fresh = renumberDeck(lists, cardsById)

            onReady(fresh.deck, fresh.cardsById)
          }}
        >
          {t('duel.siding.ready')}
        </Button>
      </div>
    </>
  )
}

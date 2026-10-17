import { useEffect, useId, useMemo, useRef, useState, type CSSProperties } from 'react'

import { deckOrder, renumberDeck, SIDE_ZONES, sidingProblems, sortedZone, tapTarget, type SideCard, type SideDeck, type SideZone, type SidingProblem } from '../../app/duel-siding'
import { formatClock } from '../../app/life-calculator'
import type { DeckCardInstance } from '../../app/model'
import { showToastMessage } from '../../app/use-toast-message'
import { t } from '../../i18n'
import type { DeckFormat } from '../../types'
import { CardArt } from '../CardArt'
import { DeckZoneHeader } from '../DeckZoneHeader'
import { ZONE_STYLES, ZONE_SURFACE_MOBILE } from '../deck-zone-styles'
import { Button } from '../ui/Button'
import { prefersReducedMotion } from '../../app/motion'
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

/** Las copias con los datos de su carta (las que no los tienen no se pueden contar por tipo: quedan en el conteo total y se ven con sus iniciales). */
function knownCards(ids: readonly string[], cardsById: ReadonlyMap<string, SideCard>): DeckCardInstance[] {
  return ids.flatMap((id, index) => {
    const card = cardsById.get(id)

    return card?.apiCard ? [{ instanceId: `${id}#${index}`, name: card.name, apiCard: card.apiCard, origin: null, roles: [], needsReview: false }] : []
  })
}

/**
 * El siding de un Match: tu Main, tu Extra y tu Side como en el builder (las cartas con su arte, en la grilla de cada zona) y un toque en una carta la pasa de zona:
 * del Main y del Extra al Side, y del Side a donde le toca. El rival no ve nada. Con el deck bien, «Listo» lo deja guardado; cuando los dos están listos empieza
 * el siguiente duelo con los cambios.
 */
export function DuelSiding({ deck, cardsById, format, genesysCap, rival, locked, rivalReady, onReady }: DuelSidingProps) {
  // Las copias de una carta quedan juntas en su zona (en el orden del deck de partida), también después de pasar de una zona a otra.
  const order = useMemo(() => deckOrder(deck), [deck])
  const [lists, setLists] = useState<SideDeck>(() => ({ main: sortedZone(deck.main, order), extra: sortedZone(deck.extra, order), side: sortedZone(deck.side, order) }))
  const problems = useMemo(() => sidingProblems(lists, { main: deck.main.length }, cardsById, format, genesysCap), [lists, deck.main.length, cardsById, format, genesysCap])
  const [deadline] = useState(() => Date.now() + SIDING_MS)
  const [left, setLeft] = useState(SIDING_MS)
  const done = useRef(false)
  const base = useId()
  const zoneId = (zone: SideZone) => `${base}-${zone}`
  // Lo que se confirma si se acaba el tiempo: los cambios, si el deck cumple; si no, el deck con que se jugó.
  const onTime = useRef<SideDeck>(deck)

  useEffect(() => {
    onTime.current = problems.length === 0 ? lists : deck
  }, [problems, lists, deck])

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

  /** Pasa la copia `index` de `from` a la zona que le toca y avisa adónde fue (la otra zona puede estar fuera de la pantalla). */
  const tap = (from: SideZone, index: number) => {
    const id = lists[from][index]

    if (id === undefined) {
      return
    }

    const card = cardsById.get(id)
    const to = tapTarget(card, from)

    setLists((current) => {
      const picked = current[from][index]

      return picked === undefined ? current : { ...current, [from]: current[from].filter((_, position) => position !== index), [to]: sortedZone([...current[to], picked], order) }
    })
    showToastMessage(t('duel.siding.moved', { name: card?.name ?? id, zone: ZONE_NAME[to]() }), 'info')
  }

  return (
    <>
      <div className="grid gap-1">
        <Heading level="section">{t('duel.siding.title')}</Heading>
        <p className="m-0 text-body text-muted">{t('duel.siding.intro')}</p>
      </div>

      {/* Arriba y fijo: ir a cada zona (el Side puede quedar bien abajo). */}
      <nav aria-label={t('duel.siding.jump')} className="sticky top-0 z-10 -mx-4 grid grid-cols-3 gap-1.5 border-b border-border-subtle bg-background/90 px-4 py-2 backdrop-blur max-[1100px]:top-14">
        {SIDE_ZONES.map((zone) => (
          <Button
            key={zone}
            variant="secondary"
            size="sm"
            onClick={() => document.getElementById(zoneId(zone))?.scrollIntoView({ behavior: prefersReducedMotion() ? 'auto' : 'smooth', block: 'start' })}
          >
            {`${ZONE_NAME[zone]().replace(' Deck', '')} ${lists[zone].length}`}
          </Button>
        ))}
      </nav>

      {problems.length > 0 ? (
        <Callout tone="warning" icon="alert">
          <span className="grid gap-1">
            {problems.map((problem) => (
              <span key={problemText(problem)}>{problemText(problem)}</span>
            ))}
          </span>
        </Callout>
      ) : null}

      {SIDE_ZONES.map((zone) => (
        <SidingZone key={zone} id={zoneId(zone)} zone={zone} ids={lists[zone]} cardsById={cardsById} locked={locked} onTap={tap} />
      ))}

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

interface SidingZoneProps {
  id: string
  zone: SideZone
  ids: readonly string[]
  cardsById: ReadonlyMap<string, SideCard>
  locked: boolean
  onTap: (zone: SideZone, index: number) => void
}

/** Una zona del deck: su encabezado (con el conteo por tipo) y sus cartas en la grilla del builder, cada una un botón que la pasa de zona. */
function SidingZone({ id: sectionId, zone, ids, cardsById, locked, onTap }: SidingZoneProps) {
  const style = ZONE_STYLES[zone]

  return (
    <section id={sectionId} aria-label={ZONE_NAME[zone]()} className="grid w-full scroll-mt-28 gap-2">
      <DeckZoneHeader zone={zone} title={ZONE_NAME[zone]()} cards={knownCards(ids, cardsById)} count={ids.length} />

      <div
        className={ZONE_SURFACE_MOBILE}
        style={{ '--zone-background': style.background, '--zone-border': style.border, minHeight: '4.5rem' } as CSSProperties}
      >
        {ids.map((id, index) => {
          const card = cardsById.get(id)
          const name = card?.name ?? id
          const to = tapTarget(card, zone)

          return (
            <button
              // Dos copias de una misma carta pueden compartir id (el Main y el Side numeran por separado): la posición las distingue.
              key={`${id}#${index}`}
              type="button"
              disabled={locked}
              title={name}
              aria-label={t('duel.siding.moveLabel', { name, zone: ZONE_NAME[to]() })}
              className={cx(
                'relative block min-w-0 cursor-pointer touch-manipulation select-none bg-transparent p-0 transition-transform duration-100 [-webkit-tap-highlight-color:transparent]',
                'focus-visible:z-1 focus-visible:outline-none focus-visible:shadow-focus enabled:active:scale-95 disabled:cursor-default disabled:opacity-60',
                '[&_img]:pointer-events-none [&_img]:select-none',
              )}
              onClick={() => onTap(zone, index)}
            >
              <CardArt remoteUrl={card?.apiCard?.imageUrlSmall ?? card?.apiCard?.imageUrl ?? null} name={name} className="block aspect-[0.72] w-full min-w-0 bg-input object-cover" limitCard={card?.apiCard ?? null} />
              <span className="sr-only">{name}</span>
            </button>
          )
        })}
        {ids.length === 0 ? <p className="col-span-full m-0 grid min-h-12 place-items-center text-body text-soft">{t('duel.siding.empty')}</p> : null}
      </div>
    </section>
  )
}

import { useEffect, useRef, useState } from 'react'

import { FIRST_DEAL_MS, NEXT_DEAL_MS } from '../../../app/deal-flight'
import { shuffleDeck, shuffleHand } from '../../../app/shuffle-fx'
import type { ApiCardReference } from '../../../types'
import { PileStack } from '../../probability/PileStack'
import { PracticeHand, type HandCardData } from '../../probability/PracticeHand'
import { CARD_BACK, DECK_LAYERS } from '../../probability/practice-styles'
import { Button } from '../../ui/Button'
import { cx } from '../../ui/cx'
import { Specimen, Tag } from '../Specimen'

/** Cartas de muestra (el arte, como en las otras muestras, del CDN de YGOPRODeck): distintas, así se ve que la mano se junta y se vuelve a abrir. */
const ARTS = [14558127, 57554544, 84013237, 23434538, 97268402, 10045474, 24224830, 73642296]
const NO_TARGETS: ReadonlySet<string> = new Set()
const apiCard = (id: number): ApiCardReference => ({
  ygoprodeckId: id,
  cardType: 'Effect Monster',
  frameType: 'effect',
  description: null,
  race: null,
  attribute: null,
  level: null,
  linkValue: null,
  atk: null,
  def: null,
  archetype: null,
  ygoprodeckUrl: null,
  imageUrl: `https://images.ygoprodeck.com/images/cards/${id}.jpg`,
  imageUrlSmall: `https://images.ygoprodeck.com/images/cards_small/${id}.jpg`,
  banlist: { tcg: null, ocg: null, goat: null },
  genesys: { points: null },
})

/**
 * Barajar el mazo, barajar la mano y repartir, con las piezas de la mesa (`shuffleDeck`, `shuffleHand` y el vuelo de `PracticeHand`) y sus mismos tiempos: «Robar 1» hace lo que la
 * mesa al sumar una carta a la mano (el mazo y la mano se barajan; la mano, cuando la carta aterriza).
 */
export function ShuffleSamples() {
  const deckRef = useRef<HTMLDivElement | null>(null)
  const handRef = useRef<HTMLDivElement | null>(null)
  const serial = useRef(5)
  const timers = useRef<number[]>([])
  const [cards, setCards] = useState<HandCardData[]>(() => Array.from({ length: 5 }, (_, index) => sample(index)))
  const [drawn, setDrawn] = useState(0)
  const layers = () => deckRef.current?.querySelectorAll('[data-layer]') ?? []
  const hand = () => handRef.current?.querySelectorAll('[role="listitem"]') ?? []
  const next = () => sample(serial.current++)

  // Como la mesa: la mano se baraja después del dibujo en que entró la carta (y espera a que aterrice).
  useEffect(() => {
    if (drawn > 0) shuffleHand(handRef.current?.querySelectorAll('[role="listitem"]') ?? [])
  }, [drawn])
  useEffect(() => () => timers.current.forEach((timer) => window.clearTimeout(timer)), [])

  const deal = () => {
    timers.current.forEach((timer) => window.clearTimeout(timer))
    setCards([])
    shuffleDeck(layers())
    timers.current = Array.from({ length: 5 }, (_, index) => window.setTimeout(() => {
          const card = next()

          setCards((current) => [...current, card])
        }, FIRST_DEAL_MS + index * NEXT_DEAL_MS))
  }
  const draw = () => {
    const card = next()

    setCards((current) => [...current, card].slice(-8))
    shuffleDeck(layers())
    setDrawn((count) => count + 1)
  }

  return (
    <Specimen
      title="Barajado y reparto"
      layout="column"
      className="col-span-full"
      note={
        <>
          El mazo se parte en dos paquetes que caen al centro intercalándose y se golpea contra la mesa; la mano se junta en una pila, hace el mismo riffle y se abre salteada a sus lugares (el orden no cambia); al repartir, cada carta sale del mazo por una curva baja, se da vuelta en el camino y las demás le hacen lugar. Con «Reducir movimiento», nada se anima. Archivos: <Tag>app/shuffle-fx.ts</Tag> <Tag>app/deal-flight.ts</Tag> <Tag>probability/PracticeHand.tsx</Tag>
        </>
      }
    >
      <div className="flex flex-wrap items-center gap-2">
        <Button size="sm" variant="secondary" onClick={() => shuffleDeck(layers())}>
          Barajar mazo
        </Button>
        <Button size="sm" variant="secondary" onClick={() => shuffleHand(hand())}>
          Barajar mano
        </Button>
        <Button size="sm" variant="secondary" onClick={deal}>
          Repartir 5
        </Button>
        <Button size="sm" variant="secondary" onClick={draw}>
          Robar 1
        </Button>
      </div>
      <div className="grid gap-6 py-4">
        {/* El mazo, como en la mesa: el canto (`PileStack`), las capas que se barajan y la de arriba. */}
        <div ref={deckRef} data-sample-deck className="relative mx-auto aspect-[421/614] w-16">
          <PileStack count={40} />
          {DECK_LAYERS.map((layer, index) => (
            <span key={index} data-layer className={cx(CARD_BACK, layer)} />
          ))}
          <span data-layer className={CARD_BACK} />
        </div>
        <div ref={handRef}>
          <PracticeHand
            cards={cards}
            sizeSlots={5}
            maxCardWidth={96}
            fanDegrees={2.2}
            glowOf={() => null}
            dimUnlit={false}
            muted={false}
            flash={null}
            targeted={NO_TARGETS}
            selectedId={null}
            getDeckRect={() => deckRef.current?.getBoundingClientRect() ?? null}
            getField={() => null}
            onReorder={(ids) => setCards((current) => ids.map((id) => current.find((card) => card.id === id)!))}
            onTap={() => undefined}
            onDragOver={() => undefined}
            onDrop={() => undefined}
          />
        </div>
      </div>
    </Specimen>
  )
}

function sample(index: number): HandCardData {
  const id = ARTS[index % ARTS.length]!

  return { id: `muestra-${index}`, name: `Carta ${index + 1}`, apiCard: apiCard(id) }
}

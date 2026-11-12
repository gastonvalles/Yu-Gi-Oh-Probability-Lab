import { useEffect, useRef, useState } from 'react'

import { createMatState, matReducer, type MatState } from '../../../app/practice-mat'
import { useCardFlights } from '../../../app/use-card-flights'
import { CardArt } from '../../CardArt'
import { LandingBurst } from '../../probability/MatFx'
import { CELL_MONSTER } from '../../probability/PracticeMat'
import { Button } from '../../ui/Button'
import { cx } from '../../ui/cx'
import { Specimen, Tag } from '../Specimen'

/** Las cartas de la muestra (el arte, como en las otras muestras, del CDN de YGOPRODeck): la del medio es la que vuela. */
const ARTS: Record<string, string> = {
  m1: 'https://images.ygoprodeck.com/images/cards_small/57554544.jpg',
  m2: 'https://images.ygoprodeck.com/images/cards_small/14558127.jpg',
  m3: 'https://images.ygoprodeck.com/images/cards_small/23434538.jpg',
}
const FLYER = 'm2'
const artOf = (id: string) => ARTS[id] ?? null
/** Lo que espera cada jugada para que se vea entera la anterior (el vuelo, el golpe y un respiro). */
const STEP_MS = 900

/**
 * El vuelo de una carta entre zonas con el hook real de la mesa (`useCardFlights`) sobre una mesa mínima (la mano, una zona de monstruo y el cementerio, con las marcas de la mesa):
 * «Repetir» invoca la carta del medio, la manda al cementerio y la devuelve a la mano, una jugada tras otra. Cada una es la jugada de una sola carta a la vista que cruza la mesa: vuela en
 * 3D (`card-lift.ts`).
 */
export function FlightSample() {
  const ref = useRef<HTMLDivElement | null>(null)
  const timers = useRef<number[]>([])
  const [state, setState] = useState<MatState>(() => createMatState(Object.keys(ARTS), [], 3))

  useCardFlights(ref, state, artOf, 'muestra')
  useEffect(() => () => timers.current.forEach((timer) => window.clearTimeout(timer)), [])

  const repeat = () => {
    timers.current.forEach((timer) => window.clearTimeout(timer))
    setState((current) => matReducer(current, { type: 'place', id: FLYER, zone: 'mz', index: 0, pos: 'atk', how: 'normal' }))
    timers.current = [
      window.setTimeout(() => setState((current) => matReducer(current, { type: 'move', id: FLYER, to: 'gy' })), STEP_MS),
      window.setTimeout(() => setState((current) => matReducer(current, { type: 'move', id: FLYER, to: 'hand' })), 2 * STEP_MS),
    ]
  }
  const placed = state.mz[0]
  const top = state.gy.at(-1)

  return (
    <Specimen
      title="Vuelo de una carta entre zonas"
      layout="column"
      className="col-span-full"
      note={
        <>
          La jugada de una sola carta a la vista que cruza la mesa: se levanta, se inclina, la cruza un brillo, la sigue su sombra y cae con un golpe (se aplasta y levanta polvo) en el mismo momento que siempre (el destello de la invocación la espera y la casilla marca el golpe con un aro lima que se abre). Un salto a la casilla de al lado, un lote o una carta boca abajo vuelan derechos, como antes. Con «Reducir movimiento», la carta aparece con un fundido corto. Archivos: <Tag>app/use-card-flights.ts</Tag> <Tag>app/card-lift.ts</Tag>
        </>
      }
    >
      <Button size="sm" variant="secondary" icon="refresh" className="justify-self-start" onClick={repeat}>
        Repetir
      </Button>
      <div ref={ref} data-flight-sample className="flex min-w-0 items-end justify-between gap-4 py-4">
        <div data-drop="hand" className="flex min-h-20 gap-2">
          {state.hand.map((id) => (
            <div key={id} data-card-id={id} className="relative aspect-[421/614] w-14 overflow-hidden bg-input">
              <CardArt remoteUrl={artOf(id)} name={id} className="block h-full w-full object-cover" />
            </div>
          ))}
        </div>
        <div data-drop="mz:0" className={cx(CELL_MONSTER, 'w-24 self-start')}>
          {placed ? (
            <>
              <div data-card-id={placed.id} className="absolute inset-x-0 top-0 mx-auto aspect-[421/614] h-full overflow-hidden bg-input">
                <CardArt remoteUrl={artOf(placed.id)} name={placed.id} className="block h-full w-full object-cover" />
              </div>
              <LandingBurst key={placed.id} tone="normal" flies />
            </>
          ) : null}
        </div>
        <div data-drop="gy" className="relative aspect-[421/614] w-14 overflow-hidden border border-dashed border-border-subtle">
          {top ? <CardArt remoteUrl={artOf(top)} name={top} className="absolute inset-0 block h-full w-full object-cover" /> : null}
        </div>
      </div>
    </Specimen>
  )
}

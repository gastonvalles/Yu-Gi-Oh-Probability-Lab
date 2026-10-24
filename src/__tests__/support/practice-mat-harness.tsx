// Lo que comparten las pruebas de la mesa de práctica (repartidas en dos archivos): las cartas de prueba, el Harness que monta la mesa y los helpers de la mesa.
import { configureStore } from '@reduxjs/toolkit'
import { fireEvent, render as renderBare, screen, within, type RenderResult } from '@testing-library/react'
import { Profiler, useEffect, type ComponentProps, type ReactElement } from 'react'
import { Provider } from 'react-redux'
import { createMatState, type MatAction, type MatState } from '../../app/practice-mat'
import { useMatSession } from '../../app/use-mat-session'
import { PracticeMat, type MatCard } from '../../components/probability/PracticeMat'
import type { ApiCardReference } from '../../types'

export const card = (ygoprodeckId: number, frameType: string): ApiCardReference =>
  ({ ygoprodeckId, frameType, race: null, cardType: 'x', description: null, attribute: null, level: null, linkValue: null, atk: null, def: null, archetype: null, ygoprodeckUrl: null, imageUrl: null, imageUrlSmall: null }) as unknown as ApiCardReference

export const CARDS: ReadonlyMap<string, MatCard> = new Map([
  ['card-1-1', { name: 'Ash Blossom', apiCard: card(1, 'effect') }],
  ['card-2-1', { name: 'Maxx C', apiCard: card(2, 'effect') }],
  ['card-3-1', { name: 'Called by the Grave', apiCard: card(3, 'spell') }],
  ['card-4-1', { name: 'Nibiru', apiCard: card(4, 'effect') }],
  ['card-5-1', { name: 'Droll', apiCard: card(5, 'effect') }],
  ['card-6-1', { name: 'Imperm', apiCard: card(6, 'trap') }],
  ['card-7-1', { name: 'Zeus', apiCard: card(7, 'xyz') }],
])

// Las mismas cartas con arte: la casilla y el visor muestran su imagen (el nombre de la carta es su texto alternativo), así se ve cuál es la que se ve.
export const WITH_ART: ReadonlyMap<string, MatCard> = new Map([...CARDS].map(([id, entry]): [string, MatCard] => [id, { ...entry, art: `https://images.ygoprodeck.com/images/cards_small/${id.replace(/\D/g, '')}.jpg` }]))

export const INITIAL = createMatState(['card-1-1', 'card-2-1', 'card-3-1', 'card-4-1', 'card-5-1', 'card-6-1'], ['card-7-1'], 5)

const NO_ACTIONS: MatAction[] = []

const NO_NAMES: Record<string, string> = {}

/** Cuántas veces se dibujó la mesa (un commit de React): para ver que un arrastre no la vuelve a dibujar. */
export let commits = 0

const countCommit = () => {
  commits += 1
}

/** `dock`: el detalle fijo de la izquierda (lo que en la app pasa la práctica desde 1440 px) y quién se entera de lo que se toca o se apunta. */
type DockProps = Pick<ComponentProps<typeof PracticeMat>, 'detail' | 'onPeek' | 'onHover'>

export function Harness({ initial = INITIAL, actions = NO_ACTIONS, cards = CARDS, dock }: { initial?: MatState; actions?: MatAction[]; cards?: ReadonlyMap<string, MatCard>; dock?: DockProps }) {
  const mat = useMatSession()
  const { start } = mat

  useEffect(() => {
    start(initial, actions, NO_NAMES)
  }, [start, initial, actions])

  if (!mat.session || !mat.state) {
    return null
  }

  return (
    <Profiler id="mat" onRender={countCommit}>
      <PracticeMat
        session={mat.session}
        state={mat.state}
        cardsById={cards}
        deckName="Test"
        onDispatch={mat.dispatch}
        onUndo={mat.undo}
        onSeek={mat.seek}
        onLoadCombo={(combo) => start(combo.initial, combo.actions, combo.names)}
        onNewHand={() => start(INITIAL)}
        {...dock}
      />
    </Profiler>
  )
}

// La etiqueta de límite de las cartas lee el formato del store.
const store = configureStore({ reducer: { settings: (state = { handSize: 5, deckFormat: 'unlimited' as const }) => state } })

export const render = (ui: ReactElement): RenderResult => renderBare(<Provider store={store}>{ui}</Provider>)

export const pointer = { button: 0, pointerId: 1 }

export const tap = (element: HTMLElement) => {
  fireEvent.pointerDown(element, { ...pointer, clientX: 10, clientY: 10 })
  fireEvent.pointerUp(element, { ...pointer, clientX: 10, clientY: 10 })
}

export const hand = () => screen.getByRole('list', { name: 'Mano' })

export const zone = (name: string) => screen.getByRole('group', { name })

export const status = () => screen.getByRole('status', { name: 'Paso actual' })

/** La fase de ahora: un solo botón en el medio del campo (el mismo que en un duelo); al tocarlo muestra las seis y elegir una pasa a ella. */
export const phaseButton = () => screen.getByRole('button', { name: /^Fases:/ })

export const goToPhase = (name: string) => {
  fireEvent.click(phaseButton())
  fireEvent.click(screen.getByRole('menuitem', { name }))
}

/** Pasar el turno, como se pueda: en el celular la End Phase pregunta si se termina; en escritorio aparece «Pasar turno» pegado al botón. */
export const endTurn = () => {
  goToPhase('End Phase')
  const ask = screen.queryByRole('alertdialog', { name: '¿Terminar tu turno?' })

  if (ask) fireEvent.click(within(ask).getByRole('button', { name: 'Terminar turno' }))
  else fireEvent.click(screen.getByRole('button', { name: 'Pasar turno' }))
}

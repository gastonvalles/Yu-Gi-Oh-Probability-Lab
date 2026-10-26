// @vitest-environment jsdom
import { configureStore } from '@reduxjs/toolkit'
import { act, cleanup, fireEvent, render as renderBare, screen, within } from '@testing-library/react'
import '@testing-library/jest-dom'
import type { ReactElement } from 'react'
import { Provider } from 'react-redux'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { DuelRailsContext } from '../app/duel-rails'
import { AskOptions } from '../components/auto/AskOptions'
import { AskPrompt } from '../components/auto/AskPrompt'
import { AutoBar } from '../components/auto/AutoBar'
import { CardPicker, type PickCard } from '../components/auto/CardPicker'
import { SortSheet } from '../components/auto/SortSheet'
import { THINKING_CANCEL_MS, type LaneNotice } from '../components/duel/DuelBar'

// Las piezas del duelo automático (fuera del campo): cada una con sus estados, su teclado y sus topes. Son presentacionales: lo que contestan sale por props.
// El arte de las cartas lee el formato del store (el límite de copias).
const store = configureStore({ reducer: { settings: (state = { handSize: 5, deckFormat: 'unlimited' as const }) => state } })
const render = (ui: ReactElement) => renderBare(ui, { wrapper: ({ children }) => <Provider store={store}>{children}</Provider> })

beforeEach(() => {
  window.scrollTo = () => {}
})

afterEach(() => {
  cleanup()
  vi.useRealTimers()
})

const escape = () => fireEvent.keyDown(window, { key: 'Escape' })
const names = (elements: HTMLElement[]) => elements.map((element) => element.getAttribute('aria-label') ?? element.textContent)

const CARDS: PickCard[] = [
  { key: 'a', name: 'Fallen of Albaz', art: null, place: 'Mano' },
  { key: 'b', name: 'Aluber the Jester of Despia', place: 'Cementerio' },
  { key: 'c', name: 'Branded Fusion', art: null },
  { key: 'd', name: 'Effect Veiler', art: null },
]

describe('AskPrompt', () => {
  it('pregunta con la carta, lleva el foco a la principal (al final) y no se cierra con Escape', () => {
    const yes = vi.fn()
    const no = vi.fn()
    const { container } = render(<AskPrompt text="¿Activás el efecto de Ash Blossom?" card={{ name: 'Ash Blossom', art: null }} yes={{ label: 'Activar efecto', onSelect: yes }} no={{ label: 'No activar', onSelect: no }} />)
    const prompt = screen.getByRole('status')
    const buttons = within(prompt).getAllByRole('button')

    expect(prompt).toHaveTextContent('¿Activás el efecto de Ash Blossom?')
    expect(container.querySelector('[data-card-art]')).not.toBeNull()
    expect(names(buttons)).toEqual(['No activar', 'Activar efecto'])
    expect(buttons[1]).toHaveFocus()

    escape()
    expect(yes).not.toHaveBeenCalled()
    expect(no).not.toHaveBeenCalled()

    fireEvent.click(buttons[1]!)
    expect(yes).toHaveBeenCalledTimes(1)
  })

  it('sin carta, sólo el texto', () => {
    const { container } = render(<AskPrompt text="¿Pagás 1000 LP?" yes={{ label: 'Pagar 1000 LP', onSelect: () => {} }} no={{ label: 'No hacerlo', onSelect: () => {} }} />)

    expect(container.querySelector('[data-card-art]')).toBeNull()
    expect(screen.getByRole('button', { name: 'Pagar 1000 LP' })).toHaveFocus()
  })

  it('con contexto: qué es arriba, la pestaña del lugar, la frase del efecto (lo que hace, resaltado), más ancha y «Seguir en modo manual» primero, lejos de la principal', () => {
    const manual = vi.fn()
    render(
      <AskPrompt
        kicker="Efecto que se dispara"
        text="Tras la Invocación Normal de Ponix (en la Zona de Monstruos): ¿activás su efecto?"
        card={{ name: 'Ponix', art: null }}
        place="Campo"
        effect={{ when: 'If this card is Normal or Special Summoned', what: 'You can add 1 "Fire King" Spell/Trap from your Deck to your hand.' }}
        manual={{ label: 'Seguir en modo manual', onSelect: manual }}
        yes={{ label: 'Activar efecto', onSelect: () => {} }}
        no={{ label: 'No activar', onSelect: () => {} }}
      />,
    )
    const prompt = screen.getByRole('status')
    const buttons = within(prompt).getAllByRole('button')

    expect(prompt).toHaveAttribute('data-prompt-row')
    expect(prompt).toHaveTextContent('Efecto que se dispara')
    expect(prompt).toHaveTextContent('Campo')
    expect(prompt).toHaveTextContent('Qué hace “If this card is Normal or Special Summoned: You can add 1 "Fire King" Spell/Trap from your Deck to your hand.”')
    expect(within(prompt).getByText(/^You can add 1/)).toHaveClass('font-semibold')
    expect(names(buttons)).toEqual(['Seguir en modo manual', 'No activar', 'Activar efecto'])
    expect(buttons[2]).toHaveFocus()
    fireEvent.click(buttons[0]!)
    expect(manual).toHaveBeenCalledTimes(1)
  })
})

describe('AskOptions', () => {
  const POSITIONS = [
    { id: 'atk', label: 'En ataque' },
    { id: 'def', label: 'En defensa' },
    { id: 'set', label: 'Poner boca abajo', disabled: true },
  ]

  it('una opción: los botones de la hoja de una carta, un toque contesta y la apagada no; sin cancelar no hay X y Escape no la cierra', () => {
    const onPick = vi.fn()
    render(<AskOptions title="Elegí la posición" kicker="Fallen of Albaz" options={POSITIONS} mode="one" onPick={onPick} />)
    const dialog = screen.getByRole('dialog', { name: 'Elegí la posición' })
    // Sin velo: la mesa de atrás se sigue viendo.
    expect(dialog.parentElement!.querySelector('.animate-nav-scrim')).toBeNull()
    const items = within(dialog).getAllByRole('menuitem')

    expect(names(items)).toEqual(['En ataque', 'En defensa', 'Poner boca abajo'])
    expect(items[2]).toHaveAttribute('aria-disabled', 'true')
    expect(within(dialog).queryByRole('button', { name: 'Cerrar' })).toBeNull()

    escape()
    fireEvent.click(items[2]!)
    expect(screen.getByRole('dialog')).toBeInTheDocument()
    expect(onPick).not.toHaveBeenCalled()

    fireEvent.click(items[1]!)
    expect(onPick).toHaveBeenCalledWith(['def'])
  })

  it('cancelable: la X y Escape la cancelan', () => {
    const onCancel = vi.fn()
    render(<AskOptions title="Elegí una opción" options={POSITIONS} mode="one" onPick={() => {}} onCancel={onCancel} />)

    escape()
    fireEvent.click(screen.getByRole('button', { name: 'Cerrar' }))
    expect(onCancel).toHaveBeenCalledTimes(2)
  })

  it('varios Tipos: pastillas con aria-pressed; al llegar al tope las demás se apagan y «Declarar» contesta en orden', () => {
    const onPick = vi.fn()
    render(<AskOptions title="Declará 2 Tipos" options={['Aqua', 'Beast', 'Dragon', 'Zombie'].map((name) => ({ id: name, label: name }))} mode={{ count: 2 }} onPick={onPick} />)
    const group = screen.getByRole('group', { name: 'Declará 2 Tipos' })
    const chip = (name: string) => within(group).getByRole('button', { name })
    const declare = screen.getByRole('button', { name: 'Declarar' })

    expect(declare).toBeDisabled()
    fireEvent.click(chip('Aqua'))
    fireEvent.click(chip('Beast'))
    expect(chip('Aqua')).toHaveAttribute('aria-pressed', 'true')
    expect(chip('Dragon')).toBeDisabled()
    expect(screen.getByRole('status')).toHaveTextContent('2 de 2')

    fireEvent.click(chip('Aqua'))
    expect(chip('Dragon')).toBeEnabled()
    fireEvent.click(chip('Zombie'))
    fireEvent.click(declare)
    expect(onPick).toHaveBeenCalledWith(['Beast', 'Zombie'])
  })

  it('con count 1, tocar otra cambia la elegida', () => {
    render(<AskOptions title="Declará 1 Atributo" options={['DARK', 'LIGHT'].map((name) => ({ id: name, label: name }))} mode={{ count: 1 }} onPick={() => {}} />)

    fireEvent.click(screen.getByRole('button', { name: 'DARK' }))
    fireEvent.click(screen.getByRole('button', { name: 'LIGHT' }))
    expect(screen.getByRole('button', { name: 'DARK' })).toHaveAttribute('aria-pressed', 'false')
    expect(screen.getByRole('button', { name: 'LIGHT' })).toHaveAttribute('aria-pressed', 'true')
  })
})

describe('CardPicker', () => {
  it('de 1 a 2: aro y número de orden, nunca más de dos, el pie dice cuántas y la principal se enciende con el mínimo', () => {
    const onPick = vi.fn()
    const onCancel = vi.fn()
    render(<CardPicker title="Elegí qué agregar a tu mano" cards={CARDS} min={1} max={2} onPick={onPick} onCancel={onCancel} />)
    const list = screen.getByRole('listbox', { name: 'Cartas para elegir' })
    const option = (name: RegExp) => within(list).getByRole('option', { name })

    expect(list).toHaveAttribute('aria-multiselectable', 'true')
    expect(screen.getByRole('button', { name: 'Listo' })).toBeDisabled()
    // La que todavía no tiene arte, un esqueleto (sin imagen ni iniciales).
    expect(option(/Aluber/).querySelector('[data-card-art]')).toBeNull()

    fireEvent.click(option(/Albaz/))
    expect(option(/Albaz/)).toHaveAttribute('aria-selected', 'true')
    expect(option(/Albaz/)).toHaveAccessibleName('Fallen of Albaz (1.ª elegida), Mano')
    expect(screen.getByRole('status')).toHaveTextContent('1 de 2')

    fireEvent.click(option(/Aluber/))
    fireEvent.click(option(/Branded/))
    expect(option(/Branded/)).toHaveAttribute('aria-selected', 'false')

    fireEvent.click(screen.getByRole('button', { name: 'Elegir 2 cartas' }))
    expect(onPick).toHaveBeenCalledWith(['a', 'b'])

    fireEvent.click(screen.getByRole('button', { name: 'Cancelar' }))
    escape()
    expect(onCancel).toHaveBeenCalledTimes(2)
  })

  it('Mayús+clic elige el tramo desde la última, hasta el tope', () => {
    render(<CardPicker title="Elegí" cards={CARDS} min={1} max={3} onPick={() => {}} />)
    const options = screen.getAllByRole('option')

    fireEvent.click(options[0]!)
    fireEvent.click(options[3]!, { shiftKey: true })
    expect(options.map((option) => option.getAttribute('aria-selected'))).toEqual(['true', 'true', 'true', 'false'])
  })

  it('el teclado: un solo lugar de tabulación, las flechas, Inicio y Fin lo mueven y Espacio elige', () => {
    render(<CardPicker title="Elegí" cards={CARDS} min={1} max={2} onPick={() => {}} />)
    const list = screen.getByRole('listbox')
    const options = screen.getAllByRole('option')

    expect(options.map((option) => option.tabIndex)).toEqual([0, -1, -1, -1])
    // Al abrirse, el foco del diálogo va a las cartas, no a la X.
    expect(options[0]).toHaveAttribute('data-initial-focus')
    fireEvent.keyDown(list, { key: 'ArrowRight' })
    expect(options[1]).toHaveFocus()
    fireEvent.keyDown(list, { key: 'End' })
    expect(options[3]).toHaveFocus()
    expect(options[3]!.tabIndex).toBe(0)
    fireEvent.keyDown(list, { key: ' ' })
    expect(options[3]).toHaveAttribute('aria-selected', 'true')
  })

  it('con max 1 el primer toque contesta, sin pie; sin cancelar, Escape no la cierra', () => {
    const onPick = vi.fn()
    render(<CardPicker title="Elegí" cards={CARDS} min={1} max={1} onPick={onPick} />)

    expect(screen.getByRole('listbox')).not.toHaveAttribute('aria-multiselectable')
    expect(screen.queryByRole('button')).toBeNull()
    escape()
    expect(screen.getByRole('dialog')).toBeInTheDocument()

    fireEvent.click(screen.getAllByRole('option')[2]!)
    expect(onPick).toHaveBeenCalledWith(['c'])
  })
})

describe('SortSheet', () => {
  it('numera en el orden en que se tocan, soltar una corre las de después, «Ordenar así» con todas; «Dejar como está» devuelve null', () => {
    const onSort = vi.fn()
    render(<SortSheet cards={CARDS.slice(0, 3)} onSort={onSort} />)
    const done = screen.getByRole('button', { name: 'Ordenar así' })
    const option = (name: RegExp) => screen.getByRole('option', { name })

    expect(screen.getByRole('dialog', { name: 'Ordená las cartas' })).toBeInTheDocument()
    fireEvent.click(option(/Branded/))
    fireEvent.click(option(/Albaz/))
    expect(option(/Albaz/)).toHaveAccessibleName('Fallen of Albaz (2.ª elegida), Mano')
    fireEvent.click(option(/Branded/))
    expect(option(/Albaz/)).toHaveAccessibleName('Fallen of Albaz (1.ª elegida), Mano')
    expect(done).toBeDisabled()

    fireEvent.click(option(/Aluber/))
    fireEvent.click(option(/Branded/))
    expect(screen.getByRole('status')).toHaveTextContent('3 de 3')
    fireEvent.click(done)
    expect(onSort).toHaveBeenLastCalledWith(['a', 'b', 'c'])

    escape()
    expect(screen.getByRole('dialog')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Dejar como está' }))
    expect(onSort).toHaveBeenLastCalledWith(null)
  })
})

describe('AutoBar', () => {
  const props = {
    rivalName: 'Rival',
    life: { mine: 8000, theirs: 7000 },
    turn: 3,
    myTurn: true,
    phase: 'main1' as const,
    chain: 'ask' as const,
    place: 'ask' as const,
    onExit: () => {},
    onUndo: () => {},
    canUndo: false,
    onNewHand: () => {},
    onHandtraps: () => {},
    onChain: () => {},
    onPlace: () => {},
    handtraps: { on: false, summary: 'Apagadas: el rival no usa nada.', onChange: () => {} },
    blind: false,
    onBlind: () => {},
  }
  /** Escritorio (desde 1101 px): sin esto, jsdom es un celular. */
  const desktop = () => {
    window.matchMedia = ((query: string) => ({ matches: query === '(min-width: 1101px)', media: query, addEventListener: () => {}, removeEventListener: () => {}, addListener: () => {}, removeListener: () => {}, onchange: null, dispatchEvent: () => false })) as typeof window.matchMedia
  }
  const matchMedia = window.matchMedia

  afterEach(() => {
    window.matchMedia = matchMedia
  })

  it('arriba, la fila de la práctica: la flecha de «Volver a Jugar» y sus íconos en el mismo orden (deshacer apagado sin nada que deshacer) y, al final, el engranaje; debajo, el turno con la fase', () => {
    const onExit = vi.fn()
    const onUndo = vi.fn()
    const onNewHand = vi.fn()
    const { rerender } = render(<AutoBar {...props} onExit={onExit} onUndo={onUndo} onNewHand={onNewHand} />)
    const toolbar = screen.getByRole('toolbar', { name: 'Mesa' })

    expect(names(within(toolbar).getAllByRole('button'))).toEqual(['Volver a Jugar', 'Cambiar a la vista superior', 'Sonidos', 'Handtraps del rival', 'Nueva mano', 'Deshacer', 'Más opciones del duelo'])
    expect(screen.getByText('Turno 3')).toBeInTheDocument()
    expect(screen.getByText('Tu turno')).toBeInTheDocument()
    expect(screen.getByTestId('auto-phase')).toHaveTextContent('Main Phase 1')
    expect(within(toolbar).getByRole('button', { name: 'Deshacer' })).toBeDisabled()

    fireEvent.click(within(toolbar).getByRole('button', { name: 'Volver a Jugar' }))
    fireEvent.click(within(toolbar).getByRole('button', { name: 'Nueva mano' }))
    rerender(<AutoBar {...props} onExit={onExit} onUndo={onUndo} onNewHand={onNewHand} canUndo />)
    fireEvent.click(within(toolbar).getByRole('button', { name: 'Deshacer' }))
    expect([onExit, onNewHand, onUndo].map((spy) => spy.mock.calls.length)).toEqual([1, 1, 1])
    // Salir es volver, como en la práctica: ya no hay X.
    expect(screen.queryByRole('button', { name: 'Salir del duelo' })).toBeNull()
  })

  it('las vidas de los dos: en escritorio, en la barra (con la ventana grande entre los íconos); en el celular no van arriba (van abajo, con `AutoLives` en la botonera de la mesa)', () => {
    const { unmount } = render(<AutoBar {...props} />)

    expect(screen.queryByRole('group', { name: /^Puntos de vida/ })).toBeNull()
    unmount()

    desktop()
    render(<AutoBar {...props} />)
    expect(screen.getByRole('group', { name: 'Puntos de vida de Rival: 7000' })).toBeInTheDocument()
    expect(screen.getByRole('group', { name: 'Puntos de vida de Vos: 8000' })).toBeInTheDocument()
    expect(names(within(screen.getByRole('toolbar', { name: 'Mesa' })).getAllByRole('button'))).toEqual(['Cambiar a la vista superior', 'Sonidos', 'Ventana grande', 'Handtraps del rival', 'Nueva mano', 'Deshacer', 'Más opciones del duelo'])
    expect(screen.getByRole('button', { name: 'Volver a Jugar' })).toBeInTheDocument()
  })

  it('«Más opciones»: las respuestas y la casilla entran y salen por props, y dice que el rival no juega; los sonidos no van acá (son el ícono de la barra, como en la práctica)', () => {
    const onChain = vi.fn()
    const onPlace = vi.fn()
    render(<AutoBar {...props} onChain={onChain} onPlace={onPlace} />)

    fireEvent.click(screen.getByRole('button', { name: 'Más opciones del duelo' }))
    const dialog = screen.getByRole('dialog', { name: 'Más opciones del duelo' })

    expect(within(dialog).queryByRole('switch', { name: 'Sonidos del duelo' })).toBeNull()
    fireEvent.click(within(within(dialog).getByRole('radiogroup', { name: 'Respuestas' })).getByRole('radio', { name: 'Nunca' }))
    fireEvent.click(within(within(dialog).getByRole('radiogroup', { name: 'Casilla' })).getByRole('radio', { name: 'Automática' }))
    expect(onChain).toHaveBeenCalledWith('never')
    expect(onPlace).toHaveBeenCalledWith('auto')
    expect(dialog).toHaveTextContent('El rival no juega: sólo recibe.')
    // Sin handtraps: «Apagadas» y sin «A ciegas».
    expect(dialog).toHaveTextContent('Handtraps del rivalApagadas: el rival no usa nada.')
    expect(within(dialog).queryByRole('switch', { name: 'A ciegas' })).toBeNull()
  })

  it('«Más opciones» con handtraps: lo que tiene, «Cambiar handtraps» (cierra y abre la hoja) y «A ciegas»; ya no dice que el rival no juega', () => {
    const onChange = vi.fn()
    const onBlind = vi.fn()
    render(<AutoBar {...props} handtraps={{ on: true, summary: 'Ash Blossom & Joyous Spring, Effect Veiler · 2 en la mano', onChange }} onBlind={onBlind} />)

    fireEvent.click(screen.getByRole('button', { name: 'Más opciones del duelo' }))
    const dialog = screen.getByRole('dialog', { name: 'Más opciones del duelo' })

    expect(dialog).toHaveTextContent('Ash Blossom & Joyous Spring, Effect Veiler · 2 en la mano')
    expect(dialog).not.toHaveTextContent('El rival no juega')
    fireEvent.click(within(dialog).getByRole('switch', { name: 'A ciegas' }))
    expect(onBlind).toHaveBeenCalledWith(true)
    fireEvent.click(within(dialog).getByRole('button', { name: 'Cambiar handtraps' }))
    expect(onChange).toHaveBeenCalledTimes(1)
    expect(screen.queryByRole('dialog', { name: 'Más opciones del duelo' })).toBeNull()
  })

  it('la línea: «resolviendo» con «Cancelar» recién a los 1,5 s; la cadena con «No responder», enmarcada; sin botones, sólo informa', () => {
    vi.useFakeTimers()
    const onCancel = vi.fn()
    const onPass = vi.fn()
    const { container, rerender } = render(<AutoBar {...props} lane={{ kind: 'thinking', onCancel }} />)
    const lane = () => container.querySelector<HTMLElement>('[data-lane]')!

    expect(lane()).toHaveTextContent('El núcleo está resolviendo…')
    expect(within(lane()).queryByRole('button')).toBeNull()
    act(() => {
      vi.advanceTimersByTime(THINKING_CANCEL_MS)
    })
    fireEvent.click(within(lane()).getByRole('button', { name: 'Cancelar' }))
    expect(onCancel).toHaveBeenCalledTimes(1)

    const chain: LaneNotice = { kind: 'ask', text: 'Cadena 2: Ash Blossom responde a Branded Fusion', actions: [{ label: 'No responder', onSelect: onPass }] }
    rerender(<AutoBar {...props} lane={chain} />)
    expect(lane()).toHaveClass('border-info')
    fireEvent.click(within(lane()).getByRole('button', { name: 'No responder' }))
    expect(onPass).toHaveBeenCalledTimes(1)

    rerender(<AutoBar {...props} lane={{ kind: 'ask', text: 'Se resuelve Branded Fusion', actions: [] }} />)
    expect(lane()).toHaveClass('border-border-subtle')
  })

  it('con laterales, el aviso va en el lateral (ocupa su alto, no flota sobre una fila) y la caja del lateral no ataja toques', () => {
    const { container } = render(
      <DuelRailsContext.Provider value>
        <AutoBar {...props} lane={{ kind: 'thinking' }} />
      </DuelRailsContext.Provider>,
    )
    const lane = container.querySelector('[data-lane="thinking"]')

    expect(lane).not.toHaveClass('absolute')
    // La caja ocupa todo el lateral, encima del campo agrandado: sin esto tapaba el Extra Deck, el Field y el Banish del rival, aun vacía. Sólo lo que lleva adentro recibe toques.
    expect(lane?.parentElement).toHaveClass('pointer-events-none', '*:pointer-events-auto')
    expect(screen.getByTestId('auto-phase')).toHaveTextContent('Main Phase 1')
  })

  it('con laterales, el texto del aviso ocupa su renglón y el botón va debajo, a la derecha, y se puede tocar', () => {
    const onUndo = vi.fn()
    // El CSS que genera Tailwind para esas dos clases (jsdom no carga el de la app): qué `pointer-events` le toca a cada uno.
    const css = Object.assign(document.createElement('style'), { textContent: '.pointer-events-none { pointer-events: none } :is(.\\*\\:pointer-events-auto > *) { pointer-events: auto }' })

    document.head.append(css)
    const { container } = render(
      <DuelRailsContext.Provider value>
        <AutoBar {...props} lane={{ kind: 'ask', text: 'Podés responder a Radiant Typhoon Ascendance con Radiant Typhoon Manifestation', actions: [{ label: 'Deshacer', onSelect: onUndo, primary: true }] }} />
      </DuelRailsContext.Provider>,
    )
    const lane = container.querySelector<HTMLElement>('[data-lane="ask"]')!
    const undo = within(lane).getByRole('button', { name: 'Deshacer' })

    // El texto se parte donde haga falta (sin el tope de dos renglones de la fila del celular) y el botón no le saca ancho: va en su renglón.
    expect(within(lane).getByText(/^Podés responder/)).toHaveClass('[overflow-wrap:anywhere]')
    expect(within(lane).getByText(/^Podés responder/)).not.toHaveClass('line-clamp-2')
    expect(undo.parentElement).toHaveClass('basis-full', 'justify-end')
    // La caja deja pasar los toques al campo y el botón los recibe (jsdom hereda `pointer-events`: sin `*:pointer-events-auto`, el botón quedaría en `none`).
    expect(getComputedStyle(lane.parentElement!).pointerEvents).toBe('none')
    expect(getComputedStyle(undo).pointerEvents).toBe('auto')
    fireEvent.click(undo)
    expect(onUndo).toHaveBeenCalledTimes(1)
    css.remove()
  })
})

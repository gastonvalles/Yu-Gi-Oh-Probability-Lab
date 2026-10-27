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
import { CardPicker, PickBand, pickPlace, type PickCard } from '../components/auto/CardPicker'
import { RespondBand } from '../components/auto/RespondBand'
import { SortSheet } from '../components/auto/SortSheet'
import { THINKING_CANCEL_MS, type LaneNotice } from '../components/duel/DuelBar'
import { applyLocale } from '../i18n'
import { menuRow, tapMenu } from './support/mat-menu'

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
  it('pregunta con el arte de la carta (su nombre, sólo en el nombre accesible), lleva el foco a la principal (al final); Escape no contesta: la minimiza', () => {
    const yes = vi.fn()
    const no = vi.fn()
    const { container } = render(<AskPrompt text="¿Activás el efecto?" card={{ name: 'Ash Blossom', art: null }} yes={{ label: 'Activar efecto', onSelect: yes }} no={{ label: 'No activar', onSelect: no }} />)
    const prompt = screen.getByRole('status')
    const buttons = within(prompt).getAllByRole('button')

    expect(prompt).toHaveTextContent('¿Activás el efecto?')
    expect(container.querySelector('[data-card-art]')).not.toBeNull()
    expect(names(buttons)).toEqual(['Minimizar', 'No activar', 'Activar efecto'])
    expect(buttons[2]).toHaveFocus()

    escape()
    expect(yes).not.toHaveBeenCalled()
    expect(no).not.toHaveBeenCalled()
    expect(screen.getByRole('status')).toHaveAttribute('data-minimized')

    fireEvent.click(screen.getByRole('button', { name: 'Mostrar la pregunta' }))
    expect(screen.getByRole('button', { name: 'Activar efecto' })).toHaveFocus()
    fireEvent.click(screen.getByRole('button', { name: 'Activar efecto' }))
    expect(yes).toHaveBeenCalledTimes(1)
  })

  it('sin carta, sólo el texto', () => {
    const { container } = render(<AskPrompt text="¿Pagás 1000 LP?" yes={{ label: 'Pagar 1000 LP', onSelect: () => {} }} no={{ label: 'No hacerlo', onSelect: () => {} }} />)

    expect(container.querySelector('[data-card-art]')).toBeNull()
    expect(screen.getByRole('button', { name: 'Pagar 1000 LP' })).toHaveFocus()
  })

  it('con contexto: qué pasó arriba y la pestaña del lugar, sin el nombre ni lo que hace; con «Seguir en modo manual», más ancha y ese primero, lejos de la principal', () => {
    const manual = vi.fn()
    render(
      <AskPrompt
        kicker="Tras la Invocación Normal"
        text="¿Activás el efecto?"
        card={{ name: 'Legendary Fire King Ponix', art: null }}
        place="Campo"
        manual={{ label: 'Seguir en modo manual', onSelect: manual }}
        yes={{ label: 'Activar efecto', onSelect: () => {} }}
        no={{ label: 'No activar', onSelect: () => {} }}
      />,
    )
    const prompt = screen.getByRole('status')
    const buttons = within(prompt).getAllByRole('button')

    expect(prompt).toHaveAttribute('data-prompt-row')
    expect(within(prompt).getByText('Campo')).toHaveClass('rounded-tag')
    expect(within(prompt).getByText('Tras la Invocación Normal')).toHaveClass('text-micro')
    expect(within(prompt).getByText('¿Activás el efecto?')).toHaveClass('font-semibold')
    expect(prompt).not.toHaveTextContent(/Ponix|Qué hace/)
    expect(names(buttons)).toEqual(['Minimizar', 'Seguir en modo manual', 'No activar', 'Activar efecto'])
    expect(buttons[3]).toHaveFocus()
    fireEvent.click(buttons[1]!)
    expect(manual).toHaveBeenCalledTimes(1)
  })
})

describe('MatPrompt: minimizar un cartel de la mesa', () => {
  const ask = (key: number) => <AskPrompt key={key} text="¿Activás el efecto?" yes={{ label: 'Activar efecto', onSelect: () => {} }} no={{ label: 'No activar', onSelect: () => {} }} />

  it('la flecha lo reduce a un asa de una línea con la pregunta (el foco va a su flecha) y la del asa lo reabre; minimizado es de esa pregunta: una nueva abre sola', () => {
    const { rerender } = renderBare(<Provider store={store}>{ask(1)}</Provider>)

    fireEvent.click(screen.getByRole('button', { name: 'Minimizar' }))
    const handle = screen.getByRole('status', { name: '¿Activás el efecto?' })

    expect(handle).toHaveAttribute('data-minimized')
    expect(handle).toHaveTextContent(/^¿Activás el efecto\?$/)
    expect(within(handle).getAllByRole('button')).toHaveLength(1)
    expect(screen.getByRole('button', { name: 'Mostrar la pregunta' })).toHaveFocus()

    rerender(<Provider store={store}>{ask(2)}</Provider>)
    expect(screen.getByRole('status')).not.toHaveAttribute('data-minimized')
    expect(screen.getByRole('button', { name: 'Activar efecto' })).toHaveFocus()
  })

  it('abre siempre entero y nunca se minimiza solo: con la misma `key` (la misma decisión) se actualiza en el lugar, minimizado si lo estaba', () => {
    const { rerender } = render(ask(1))
    const open = screen.getByRole('status')

    expect(open).not.toHaveAttribute('data-minimized')
    rerender(ask(1))
    expect(screen.getByRole('status')).toBe(open)
    fireEvent.click(screen.getByRole('button', { name: 'Minimizar' }))
    rerender(ask(1))
    expect(screen.getByRole('status')).toHaveAttribute('data-minimized')
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

describe('PickBand', () => {
  const band = (props: Partial<Parameters<typeof PickBand>[0]> = {}) =>
    render(<PickBand title="Elegí 2 cartas para desterrar · 0/2" place="Cementerio · 3" cards={CARDS.slice(0, 3)} chosen={[]} eligible={new Set(['a', 'b', 'c'])} multi done={false} onToggle={() => {}} onPick={() => {}} {...props} />)

  it('una fila con su pestaña y su título (el nombre del grupo); el foco va a la primera carta; «Cancelar» sin caja y la principal al final, apagada hasta completar', () => {
    const onCancel = vi.fn()
    band({ onCancel })
    const group = screen.getByRole('group', { name: 'Elegí 2 cartas para desterrar · 0/2' })

    expect(group).toHaveAttribute('data-prompt-row')
    expect(group).toHaveTextContent('Cementerio · 3')
    // Con pocas, 4 columnas (no quedan enormes); hasta 6, una por carta: siempre una fila.
    expect(within(group).getByRole('listbox')).toHaveClass('grid-cols-4')
    expect(document.activeElement).toBe(within(group).getAllByRole('option')[0])
    expect(names(within(group).getAllByRole('button'))).toEqual(['Minimizar', 'Cancelar', 'Listo'])
    expect(within(group).getByRole('button', { name: 'Listo' })).toBeDisabled()
    // Con «Cancelar», Escape es de la mesa (cancela): la banda no se minimiza.
    escape()
    expect(group).toBeInTheDocument()
    fireEvent.click(within(group).getByRole('button', { name: 'Cancelar' }))
    expect(onCancel).toHaveBeenCalledTimes(1)
  })

  it('las elegidas, con su estado, el marco que gira y su número (blanco); completa, la principal dice cuántas y contesta; con una sola y sin cancelar, sin pie', () => {
    const onPick = vi.fn()
    const onToggle = vi.fn()
    band({ chosen: ['b', 'a'], done: true, onPick, onToggle })
    const second = screen.getByRole('option', { name: /Fallen of Albaz/ })

    expect(screen.getByRole('option', { name: /Aluber/ })).toHaveAttribute('aria-selected', 'true')
    expect(second.querySelector('[data-fx="frame"]')).not.toBeNull()
    expect(within(second).getByText('2')).toHaveClass('text-white')
    fireEvent.click(screen.getByRole('option', { name: /Branded/ }))
    expect(onToggle).toHaveBeenCalledWith('c', false)
    fireEvent.click(screen.getByRole('button', { name: 'Elegir 2 cartas' }))
    expect(onPick).toHaveBeenCalledTimes(1)
    cleanup()

    band({ multi: false, title: 'Elegí 1 carta' })
    expect(names(screen.queryAllByRole('button'))).toEqual(['Minimizar'])
    // Sin «Cancelar», Escape la minimiza.
    escape()
    expect(screen.getByRole('group', { name: 'Elegí 1 carta' })).toHaveAttribute('data-minimized')
  })
})

describe('RespondBand', () => {
  const respond = (props: Partial<Parameters<typeof RespondBand>[0]> = {}) =>
    render(
      <RespondBand
        title="Responder a la cadena"
        link={3}
        cards={CARDS.slice(0, 2)}
        chosen={null}
        onToggle={() => {}}
        onChain={() => {}}
        onPass={() => {}}
        {...props}
      />,
    )

  it('qué se decide (a qué eslabón lo dice la pila de la cadena: ni su número ni su carta), las candidatas con la pestaña de su lugar, «No responder» sin caja y la principal al final, apagada sin elegida', () => {
    const onPass = vi.fn()
    respond({ onPass })
    const group = screen.getByRole('group', { name: 'Responder a la cadena' })

    expect(group).toHaveAttribute('data-prompt-row')
    expect(group).not.toHaveTextContent(/Ash Blossom|Tu respuesta|CL2|Rival/)
    expect(group.querySelector('img')).toBeNull()
    expect(within(group).getByRole('option', { name: 'Fallen of Albaz, Mano' }).querySelectorAll('.text-soft')).toHaveLength(0)
    expect(within(within(group).getByRole('option', { name: 'Fallen of Albaz, Mano' })).getByText('Mano').parentElement).toHaveClass('rounded-tag', 'whitespace-nowrap')
    expect(document.activeElement).toBe(within(group).getAllByRole('option')[0])
    expect(names(within(group).getAllByRole('button'))).toEqual(['Minimizar', 'No responder', 'Encadenar como CL3'])
    expect(within(group).getByRole('button', { name: 'Encadenar como CL3' })).toBeDisabled()
    // Sin `mode`, sin el selector.
    expect(within(group).queryByRole('radiogroup')).toBeNull()
    // Escape es «No responder» (lo da la mesa): la banda no se minimiza.
    escape()
    expect(group).not.toHaveAttribute('data-minimized')
    fireEvent.click(within(group).getByRole('button', { name: 'No responder' }))
    expect(onPass).toHaveBeenCalledTimes(1)
  })

  it('la elegida, con el marco celeste que gira (el de la mano, sin tilde); la principal contesta; el modo, sólo en escritorio', () => {
    const onChain = vi.fn()
    const onMode = vi.fn()
    respond({ chosen: 'b', onChain, mode: { value: 'ask', onChange: onMode } })
    const group = screen.getByRole('group', { name: 'Responder a la cadena' })
    const chosen = within(group).getByRole('option', { name: 'Aluber the Jester of Despia, Cementerio' })

    expect(chosen).toHaveAttribute('aria-selected', 'true')
    expect(chosen.querySelector('[data-fx="frame"] [data-fx="orbit"]')).not.toBeNull()
    expect(chosen.querySelector('[data-fx="frame"]')).toHaveStyle({ '--fx-rgb': '56 189 248' })
    expect(chosen.querySelector('svg, .outline-info, .outline-2')).toBeNull()
    expect(within(group).getByRole('option', { name: 'Fallen of Albaz, Mano' }).querySelector('[data-fx]')).toBeNull()
    fireEvent.click(within(group).getByRole('button', { name: 'Encadenar como CL3' }))
    expect(onChain).toHaveBeenCalledTimes(1)
    const modes = within(group).getByRole('radiogroup', { name: 'Preguntarme' })

    // En el celular (< 1101 px) se esconde: queda en «Más opciones».
    expect(modes.parentElement).toHaveClass('max-[1101px]:hidden')
    // El título, solo en su fila y sin partirse a mitad de palabra («Respond / er»); el modo, debajo, en el mismo bloque (no le aprieta la columna).
    const title = within(group).getByText('Responder a la cadena')
    expect(title).not.toHaveClass('[overflow-wrap:anywhere]')
    expect(title.parentElement).toBe(modes.parentElement?.parentElement)
    expect(within(modes).getByRole('radio', { name: 'Cuando importa' })).toHaveAttribute('aria-checked', 'true')
    fireEvent.click(within(modes).getByRole('radio', { name: 'Siempre' }))
    expect(onMode).toHaveBeenCalledWith('always')
    cleanup()

    // Sin cadena todavía, tu respuesta la abre.
    respond({ link: 1, title: '¿Activás algo ahora?', chosen: 'a' })
    expect(screen.getByRole('button', { name: 'Activar como CL1' })).toBeEnabled()
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

  it('de varios lugares: un grupo por lugar con su encabezado (la mano primero, después en el orden que llegan), un chip por carta y el lugar en el nombre accesible; también en inglés', () => {
    const onPick = vi.fn()
    const cards: PickCard[] = [
      { key: 'kirin', name: 'Kirin', art: null, ...pickPlace('deck', false) },
      { key: 'ponix-deck', name: 'Ponix', art: null, ...pickPlace('deck', false) },
      { key: 'veiler', name: 'Effect Veiler', art: null, ...pickPlace('hand', true) },
      { key: 'ponix-hand', name: 'Ponix', art: null, ...pickPlace('hand', false) },
    ]
    render(<CardPicker title="Elegí 1 carta para destruir" cards={cards} min={1} max={1} onPick={onPick} />)
    const groups = within(screen.getByRole('listbox', { name: 'Cartas para elegir' })).getAllByRole('group')

    expect(groups.map((group) => group.getAttribute('aria-labelledby') && document.getElementById(group.getAttribute('aria-labelledby')!)!.textContent)).toEqual(['Tu mano · 1', 'Tu Deck · 2', 'La mano del rival · 1'])
    expect(names(screen.getAllByRole('option'))).toEqual(['Ponix, en tu mano', 'Kirin, en tu Deck', 'Ponix, en tu Deck', 'Effect Veiler, en la mano del rival'])
    // El encabezado queda arriba scrolleando la hoja.
    expect(document.getElementById(groups[0]!.getAttribute('aria-labelledby')!)).toHaveClass('sticky', '-top-5')
    // Las dos Ponix nunca se ven iguales: la de la mano, el chip violeta lleno; la del Deck, el neutro.
    const chip = (name: string) => screen.getByRole('option', { name }).querySelector('[data-pick-place]')!
    expect(chip('Ponix, en tu mano')).toHaveTextContent('Mano')
    expect(chip('Ponix, en tu mano')).toHaveClass('bg-primary', 'text-white')
    expect(chip('Ponix, en tu Deck')).toHaveTextContent('Deck')
    expect(chip('Ponix, en tu Deck')).not.toHaveClass('bg-primary')
    expect(chip('Effect Veiler, en la mano del rival')).toHaveTextContent('Mano rival')
    // El teclado recorre lo que se ve (la mano primero) y la respuesta es la carta, no su lugar en la lista.
    fireEvent.keyDown(screen.getAllByRole('option')[0]!, { key: 'ArrowRight' })
    fireEvent.keyDown(screen.getAllByRole('option')[1]!, { key: 'Enter' })
    expect(onPick).toHaveBeenCalledWith(['kirin'])

    cleanup()
    applyLocale('en')
    try {
      render(<CardPicker title="Choose" cards={cards.map((card) => ({ ...card, ...pickPlace(card.from!, card.theirs ?? false) }))} min={1} max={1} onPick={() => {}} />)
      expect(names(screen.getAllByRole('option'))).toEqual(['Ponix, in your hand', 'Kirin, in your Deck', 'Ponix, in your Deck', "Effect Veiler, in the opponent's hand"])
      expect(screen.getByText("The opponent's hand · 1")).toBeInTheDocument()
      expect(screen.getByRole('option', { name: "Effect Veiler, in the opponent's hand" })).toHaveTextContent('Opp. Hand')
    } finally {
      applyLocale('es')
    }
  })

  it('todas del mismo lugar, sin encabezados: el chip en cada una', () => {
    render(<CardPicker title="Elegí" cards={[{ key: 'a', name: 'Kirin', art: null, ...pickPlace('gy', false) }, { key: 'b', name: 'Ponix', art: null, ...pickPlace('gy', false) }]} min={1} max={1} onPick={() => {}} />)

    expect(screen.queryAllByRole('group')).toHaveLength(0)
    expect(names(screen.getAllByRole('option'))).toEqual(['Kirin, en tu Cementerio', 'Ponix, en tu Cementerio'])
    expect(screen.getAllByRole('option').map((option) => option.querySelector('[data-pick-place]')?.textContent)).toEqual(['Cem.', 'Cem.'])
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

  it('arriba, la fila de la práctica: la flecha de «Volver a Jugar», deshacer (apagado sin nada que deshacer) y el ⋯, que lleva al final «Opciones del duelo»; debajo (de 640 a 1100 px también), el marcador plano', () => {
    const onExit = vi.fn()
    const onUndo = vi.fn()
    const onNewHand = vi.fn()
    const { rerender } = render(<AutoBar {...props} onExit={onExit} onUndo={onUndo} onNewHand={onNewHand} />)
    const toolbar = screen.getByRole('toolbar', { name: 'Mesa' })

    expect(names(within(toolbar).getAllByRole('button'))).toEqual(['Volver a Jugar', 'Deshacer', 'Más opciones'])
    // Sin el chip «Turno 3» ni la píldora de la fase: el turno una vez, entre las dos vidas (jsdom no es un celular: es el ancho de una tablet).
    expect(screen.getByTestId('auto-score')).toHaveTextContent('Vos8000Tu turno · 3Rival7000')
    expect(screen.queryByText('Turno 3')).toBeNull()
    expect(within(toolbar).getByRole('button', { name: 'Deshacer' })).toBeDisabled()
    expect(menuRow('Opciones del duelo')).toBeInTheDocument()

    fireEvent.click(within(toolbar).getByRole('button', { name: 'Volver a Jugar' }))
    tapMenu('Nueva mano')
    rerender(<AutoBar {...props} onExit={onExit} onUndo={onUndo} onNewHand={onNewHand} canUndo />)
    fireEvent.click(within(toolbar).getByRole('button', { name: 'Deshacer' }))
    expect([onExit, onNewHand, onUndo].map((spy) => spy.mock.calls.length)).toEqual([1, 1, 1])
    // Salir es volver, como en la práctica: ya no hay X.
    expect(screen.queryByRole('button', { name: 'Salir del duelo' })).toBeNull()
  })

  it('en el celular en vertical, debajo de los íconos va el marcador plano: tus vidas, el turno una sola vez y las del rival; la fase no va en la barra (la dice el botón del campo)', () => {
    window.matchMedia = ((query: string) => ({ matches: query === '(max-width: 639.98px)', media: query, addEventListener: () => {}, removeEventListener: () => {}, addListener: () => {}, removeListener: () => {}, onchange: null, dispatchEvent: () => false })) as typeof window.matchMedia
    const { rerender } = render(<AutoBar {...props} />)
    const score = screen.getByTestId('auto-score')

    expect(score).toHaveTextContent('Vos8000Tu turno · 3Rival7000')
    expect(within(score).getByRole('group', { name: 'Puntos de vida de Vos: 8000' })).toBeInTheDocument()
    expect(within(score).getByRole('group', { name: 'Puntos de vida de Rival: 7000' })).toBeInTheDocument()
    expect(screen.getByTestId('auto-turn')).toHaveClass('text-accent')
    expect(screen.queryByTestId('auto-phase')).toBeNull()
    expect(screen.queryByText('Turno 3')).toBeNull()
    rerender(<AutoBar {...props} myTurn={false} turn={4} />)
    expect(screen.getByTestId('auto-turn')).toHaveTextContent('Turno del rival · 4')
    expect(screen.getByTestId('auto-turn')).toHaveClass('text-info-soft')
  })

  it('en escritorio sin laterales las vidas no van en la barra (van planas en las esquinas del campo: las pone la pantalla) y el turno va una vez debajo de los íconos, sin chip ni fase; con la botonera (`dock`), el engranaje sale de la barra sólo en escritorio', () => {
    const { unmount } = render(<AutoBar {...props} dock />)

    expect(screen.getAllByRole('group', { name: /^Puntos de vida/ })).toHaveLength(2)
    expect(menuRow('Opciones del duelo')).toBeInTheDocument()
    unmount()

    desktop()
    const { rerender } = render(<AutoBar {...props} />)

    expect(screen.queryByRole('group', { name: /^Puntos de vida/ })).toBeNull()
    expect(screen.getByTestId('auto-turn')).toHaveTextContent(/^Tu turno · 3$/)
    expect(screen.queryByTestId('auto-phase')).toBeNull()
    expect(screen.queryByText('Turno 3')).toBeNull()
    expect(names(within(screen.getByRole('toolbar', { name: 'Mesa' })).getAllByRole('button'))).toEqual(['Deshacer', 'Más opciones'])
    expect(screen.getByRole('button', { name: 'Volver a Jugar' })).toBeInTheDocument()
    expect(menuRow('Opciones del duelo')).toBeInTheDocument()
    rerender(<AutoBar {...props} dock />)
    expect(() => menuRow('Opciones del duelo')).toThrow()
  })

  it('con laterales, las vidas van planas y grandes cada una de su lado del lateral izquierdo: el rival arriba (junto a la flecha) y vos abajo; sin placa ni cartas en la mano', () => {
    desktop()
    const { container } = render(
      <DuelRailsContext.Provider value>
        <AutoBar {...props} />
      </DuelRailsContext.Provider>,
    )
    const rival = screen.getByRole('group', { name: 'Puntos de vida de Rival: 7000' })

    expect(rival.parentElement).toHaveClass('col-start-1', 'row-start-1')
    expect(screen.getByRole('group', { name: 'Puntos de vida de Vos: 8000' }).parentElement).toHaveClass('col-start-1', 'row-start-3')
    expect(rival.lastElementChild).toHaveClass('text-stat')
    expect(container.querySelector('.life-plate, [role="meter"]')).toBeNull()
  })

  it('«Opciones del duelo»: las respuestas y la casilla entran y salen por props, y dice que el rival no juega; los sonidos no van acá (son de «La mesa», en el ⋯, como en la práctica)', () => {
    const onChain = vi.fn()
    const onPlace = vi.fn()
    render(<AutoBar {...props} onChain={onChain} onPlace={onPlace} />)

    tapMenu('Opciones del duelo')
    const dialog = screen.getByRole('dialog', { name: 'Más opciones del duelo' })

    expect(within(dialog).queryByRole('switch')).toBeNull()
    // Tres modos, y la línea chica dice qué hace el elegido.
    expect(within(within(dialog).getByRole('radiogroup', { name: 'Respuestas' })).getAllByRole('radio').map((radio) => radio.getAttribute('aria-label'))).toEqual(['Siempre', 'Cuando importa', 'Nunca'])
    expect(dialog).toHaveTextContent('Te pregunta sólo si algo tuyo responde de verdad a este momento.')
    fireEvent.click(within(within(dialog).getByRole('radiogroup', { name: 'Respuestas' })).getByRole('radio', { name: 'Siempre' }))
    expect(onChain).toHaveBeenCalledWith('always')
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

    tapMenu('Opciones del duelo')
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
    // El turno, una vez, debajo de los íconos; la fase no (la dice el botón del campo).
    expect(screen.getByTestId('auto-turn')).toHaveTextContent(/^Tu turno · 3$/)
    expect(screen.queryByTestId('auto-phase')).toBeNull()
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

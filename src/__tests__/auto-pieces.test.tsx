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
import { AutoBar, AutoDock } from '../components/auto/AutoBar'
import { AutoCardSheet } from '../components/auto/AutoPanel'
import { CardPicker, PickBand, pickPlace, type PickCard } from '../components/auto/CardPicker'
import { RespondBand } from '../components/auto/RespondBand'
import { SortSheet } from '../components/auto/SortSheet'
import { THINKING_CANCEL_MS, type LaneNotice } from '../components/duel/DuelBar'
import { PassPrompt } from '../components/duel/PassPrompt'
import { applyLocale } from '../i18n'
import { MatUndoContext } from '../components/probability/MatBarActions'
import { openOptions } from './support/mat-menu'

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
/** Desde 1101 px las preguntas de la mesa son un cartel (`MatPrompt`); sin esto, jsdom es un celular y son la hoja de abajo. */
const onDesktop = () => {
  const original = window.matchMedia

  beforeEach(() => {
    window.matchMedia = ((query: string) => ({ matches: query === '(min-width: 1101px)', media: query, addEventListener: () => {}, removeEventListener: () => {}, addListener: () => {}, removeListener: () => {}, onchange: null, dispatchEvent: () => false })) as typeof window.matchMedia
  })
  afterEach(() => {
    window.matchMedia = original
  })
}
const names = (elements: HTMLElement[]) => elements.map((element) => element.getAttribute('aria-label') ?? element.textContent)

const CARDS: PickCard[] = [
  { key: 'a', name: 'Fallen of Albaz', art: null, place: 'Mano' },
  { key: 'b', name: 'Aluber the Jester of Despia', place: 'Cementerio' },
  { key: 'c', name: 'Branded Fusion', art: null },
  { key: 'd', name: 'Effect Veiler', art: null },
]

describe('AskPrompt', () => {
  onDesktop()

  it('pregunta con el arte de la carta (su nombre, sólo en el nombre accesible), lleva el foco a la principal (al final); Escape no contesta: la minimiza', () => {
    const yes = vi.fn()
    const no = vi.fn()
    const { container } = render(<AskPrompt text="¿Activás el efecto?" card={{ name: 'Ash Blossom', art: null }} yes={{ label: 'Activar efecto', onSelect: yes }} no={{ label: 'No activar', onSelect: no }} />)
    const prompt = screen.getByRole('dialog', { name: '¿Activás el efecto?' })
    const buttons = within(prompt).getAllByRole('button')

    expect(prompt).toHaveTextContent('¿Activás el efecto?')
    expect(container.ownerDocument.querySelector('[data-card-art]')).not.toBeNull()
    // La ventana no lleva flecha de bajar (M-08): Escape la minimiza y su barra, un botón de 44 px (con el mouse).
    expect(names(buttons)).toEqual(['Minimizar', 'No activar', 'Activar efecto'])
    expect(buttons[0]).toHaveClass('size-11')
    expect(buttons[2]).toHaveFocus()

    escape()
    expect(yes).not.toHaveBeenCalled()
    expect(no).not.toHaveBeenCalled()
    expect(screen.getByRole('dialog')).toHaveAttribute('data-minimized')

    fireEvent.click(screen.getByRole('button', { name: 'Mostrar la pregunta' }))
    expect(screen.getByRole('button', { name: 'Activar efecto' })).toHaveFocus()
    fireEvent.click(screen.getByRole('button', { name: 'Activar efecto' }))
    expect(yes).toHaveBeenCalledTimes(1)
  })

  it('sin carta, sólo el texto', () => {
    render(<AskPrompt text="¿Pagás 1000 LP?" yes={{ label: 'Pagar 1000 LP', onSelect: () => {} }} no={{ label: 'No hacerlo', onSelect: () => {} }} />)

    expect(document.querySelector('[data-card-art]')).toBeNull()
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
    const prompt = screen.getByRole('dialog')
    const buttons = within(prompt).getAllByRole('button')

    expect(within(prompt).getByText('Campo')).toHaveClass('rounded-tag')
    expect(within(prompt).getByText('Tras la Invocación Normal')).toHaveClass('text-micro')
    // La pregunta, un paso más chica de la escala (`text-body`).
    expect(within(prompt).getByText('¿Activás el efecto?')).toHaveClass('font-semibold', 'text-body')
    expect(prompt).not.toHaveTextContent(/Ponix|Qué hace/)
    expect(names(buttons)).toEqual(['Minimizar', 'Seguir en modo manual', 'No activar', 'Activar efecto'])
    expect(buttons[3]).toHaveFocus()
    // Los tres en una sola fila y en un renglón, siempre: el pie no se parte; la principal al final (a la derecha) y rellena, lo que descarta sin caja.
    const footer = buttons[1]!.parentElement!
    expect(footer).toHaveClass('flex', '*:whitespace-nowrap')
    expect(footer).not.toHaveClass('flex-wrap')
    expect(buttons[1]!.parentElement).toBe(footer)
    expect(buttons[2]!.parentElement).toBe(footer)
    expect(buttons[3]!.parentElement).toBe(footer)
    expect(buttons[3]).toHaveClass('bg-primary', 'min-h-11')
    expect(buttons[1]).toHaveClass('bg-transparent', 'min-h-11')
    fireEvent.click(buttons[1]!)
    expect(manual).toHaveBeenCalledTimes(1)
  })
})

describe('AutoPanel: minimizar un cartel del automático', () => {
  const ask = (key: number) => <AskPrompt key={key} text="¿Activás el efecto?" yes={{ label: 'Activar efecto', onSelect: () => {} }} no={{ label: 'No activar', onSelect: () => {} }} />

  onDesktop()

  it('Escape lo reduce a una tira con la pregunta y sus botones (el foco va a la pregunta, que lo sube) y tocarla lo reabre; minimizado es de esa pregunta: una nueva abre sola', () => {
    const { rerender } = renderBare(<Provider store={store}>{ask(1)}</Provider>)

    escape()
    const strip = screen.getByRole('dialog', { name: '¿Activás el efecto?' })

    expect(strip).toHaveAttribute('data-minimized')
    expect(names(within(strip).getAllByRole('button'))).toEqual(['Mostrar la pregunta', 'No activar', 'Activar efecto'])
    expect(screen.getByRole('button', { name: 'Mostrar la pregunta' })).toHaveFocus()

    rerender(<Provider store={store}>{ask(2)}</Provider>)
    expect(screen.getByRole('dialog')).not.toHaveAttribute('data-minimized')
    expect(screen.getByRole('button', { name: 'Activar efecto' })).toHaveFocus()
  })

  it('abre siempre entero y nunca se minimiza solo: con la misma `key` (la misma decisión) se actualiza en el lugar, minimizado si lo estaba', () => {
    const { rerender } = render(ask(1))
    const open = screen.getByRole('dialog')

    expect(open).not.toHaveAttribute('data-minimized')
    rerender(ask(1))
    expect(screen.getByRole('dialog')).toBe(open)
    escape()
    rerender(ask(1))
    expect(screen.getByRole('dialog')).toHaveAttribute('data-minimized')
  })
})

describe('AutoPanel en el celular: apoyado abajo, sobre la mano, con techo en la línea', () => {
  it('«¿Activás el efecto?» va de borde a borde abajo: la pregunta y, debajo, los botones; el foco va a la principal; Escape lo minimiza sin contestar y queda la tira con la pregunta y los botones', () => {
    const yes = vi.fn()
    const no = vi.fn()
    render(<AskPrompt kicker="Tras la Invocación Especial" place="Campo" text="¿Activás el efecto?" card={{ name: 'Angelechy Castellan', art: null }} yes={{ label: 'Activar efecto', onSelect: yes }} no={{ label: 'No activar', onSelect: no }} />)
    const sheet = screen.getByRole('dialog')

    expect(sheet).toHaveAttribute('data-prompt', 'ask')
    expect(sheet).toHaveClass('fixed', 'inset-x-0', 'bottom-0', 'mat-square', 'bg-card-background', 'max-h-[calc(100dvh-var(--panel-ceiling,50dvh))]')
    expect(sheet.className).not.toMatch(/backdrop-blur|min-h-\[|(^| )h-\d/)
    expect(names(within(sheet).getAllByRole('button'))).toEqual(['Minimizar', 'No activar', 'Activar efecto'])
    expect(screen.getByRole('button', { name: 'Activar efecto' })).toHaveFocus()

    escape()
    expect(yes).not.toHaveBeenCalled()
    expect(no).not.toHaveBeenCalled()
    const strip = screen.getByRole('dialog')

    expect(strip).toHaveAttribute('data-minimized')
    expect(strip).not.toHaveTextContent('Tras la Invocación Especial')
    fireEvent.click(within(strip).getByRole('button', { name: 'Activar efecto' }))
    expect(yes).toHaveBeenCalledTimes(1)
    fireEvent.click(screen.getByRole('button', { name: 'Mostrar la pregunta' }))
    expect(screen.getByRole('dialog')).toHaveTextContent('Tras la Invocación Especial')
  })

  it('el techo es el borde de abajo de la línea (`data-duel-line`): el cartel nunca tapa el campo ni la cadena', () => {
    const line = document.createElement('div')

    line.setAttribute('data-duel-line', '')
    line.getBoundingClientRect = () => ({ bottom: 512 }) as DOMRect
    document.body.append(line)
    try {
      render(<AskPrompt text="¿Activás el efecto?" yes={{ label: 'Activar efecto', onSelect: () => {} }} no={{ label: 'No activar', onSelect: () => {} }} />)
      expect(screen.getByRole('dialog').style.getPropertyValue('--panel-ceiling')).toBe('512px')
    } finally {
      line.remove()
    }
  })

  it('una banda de cartas también: las cartas y, debajo, «Cancelar» y la principal; con «Cancelar», Escape es de la mesa (no la minimiza)', () => {
    const onCancel = vi.fn()
    render(<PickBand title="Elegí 2 cartas para desterrar · 1 de 2" cards={CARDS.slice(0, 3)} chosen={[]} eligible={new Set(['a', 'b', 'c'])} multi done={false} onToggle={() => {}} onPick={() => {}} onCancel={onCancel} />)
    const group = screen.getByRole('group', { name: 'Elegí 2 cartas para desterrar · 1 de 2' })

    expect(group).toHaveClass('fixed', 'bottom-0')
    expect(names(within(group).getAllByRole('button'))).toEqual(['Minimizar', 'Cancelar', 'Listo'])
    expect(within(group).getByRole('listbox').compareDocumentPosition(within(group).getByRole('button', { name: 'Cancelar' })) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    escape()
    expect(group).not.toHaveAttribute('data-minimized')
  })
})

describe('Sin fase ni turno en los carteles (cada dato, una vez)', () => {
  const respond = <RespondBand title="¿Activás algo ahora?" link={1} cards={CARDS.slice(0, 2)} chosen={null} onToggle={() => {}} onChain={() => {}} onPass={() => {}} />
  const turnLine = () => document.querySelector('[data-prompt-turn]')

  describe('en escritorio', () => {
    onDesktop()

    it('la ventana no dice la fase ni el turno: ni en la barra ni arriba de la pregunta; tampoco la pregunta del rival de pasar de fase', () => {
      render(respond)
      expect(turnLine()).toBeNull()
      expect(screen.getByRole('group')).not.toHaveTextContent(/Draw Phase|Turno/)
      cleanup()

      render(<PassPrompt name="Ana" phase="battle" endsTurn={false} responders={[]} onAllow={() => {}} onDeny={() => {}} />)
      expect(screen.getByRole('status')).toHaveTextContent('Ana quiere pasar a la Battle Phase')
      expect(turnLine()).toBeNull()
      expect(screen.queryByRole('button', { name: 'Minimizar' })).toBeNull()
    })

    it('lo único que se desplaza es la bandeja: los botones quedan siempre a la vista, fuera de ella (apaisada: la bandeja a la izquierda)', () => {
      render(respond)
      const body = document.querySelector('[data-panel-body]')!

      expect(body).toHaveClass('overflow-auto')
      expect(body).not.toContainElement(screen.getByRole('button', { name: 'Pasar' }))
      expect(body.compareDocumentPosition(screen.getByRole('button', { name: 'Pasar' })) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    })
  })

  it('en el celular tampoco: ni la línea de la fase ni la flecha de bajar (se baja del asa)', () => {
    render(<AskPrompt text="¿Activás el efecto?" yes={{ label: 'Activar efecto', onSelect: () => {} }} no={{ label: 'No activar', onSelect: () => {} }} />)

    expect(turnLine()).toBeNull()
    expect(document.querySelector('[data-panel-fold]')).toBeNull()
    expect(screen.getByRole('button', { name: 'Minimizar' })).toHaveAttribute('data-panel-grip')
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

  it('cancelable: «Cancelar» (sin caja) y Escape la cancelan', () => {
    const onCancel = vi.fn()
    render(<AskOptions title="Elegí una opción" options={POSITIONS} mode="one" onPick={() => {}} onCancel={onCancel} />)

    escape()
    fireEvent.click(screen.getByRole('button', { name: 'Cancelar' }))
    expect(onCancel).toHaveBeenCalledTimes(2)
  })

  it('el contador va sólo con un total mayor que 1: nunca «0 de 1» ni «1/1»', () => {
    render(<AskOptions title="Declará 1 Atributo" options={['DARK', 'LIGHT'].map((name) => ({ id: name, label: name }))} mode={{ count: 1 }} onPick={() => {}} />)

    fireEvent.click(screen.getByRole('button', { name: 'DARK' }))
    expect(screen.queryByRole('status')).toBeNull()
    expect(screen.getByRole('dialog')).not.toHaveTextContent(/\d+ de 1|\d\/1/)
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
  onDesktop()
  const band = (props: Partial<Parameters<typeof PickBand>[0]> = {}) =>
    render(<PickBand title="Elegí 2 cartas para desterrar · 0/2" place="Cementerio · 3" cards={CARDS.slice(0, 3)} chosen={[]} eligible={new Set(['a', 'b', 'c'])} multi done={false} onToggle={() => {}} onPick={() => {}} {...props} />)

  it('una fila con su pestaña y su título (el nombre del grupo); el foco va a la primera carta; «Cancelar» sin caja y la principal al final, apagada hasta completar', () => {
    const onCancel = vi.fn()
    band({ onCancel })
    const group = screen.getByRole('group', { name: 'Elegí 2 cartas para desterrar · 0/2' })

    // En escritorio, la ventana (TI-145).
    expect(group).toHaveAttribute('data-auto-panel', 'floating')
    expect(group).toHaveTextContent('Cementerio · 3')
    // La bandeja: una sola fila de cartas de 1/6 del ancho (con pocas no se agrandan); con más de seis, se desliza.
    expect(within(group).getByRole('listbox')).toHaveClass('grid-flow-col', 'auto-cols-[calc((100%-2.5rem)/6)]', 'overflow-x-auto')
    expect(document.activeElement).toBe(within(group).getAllByRole('option')[0])
    expect(names(within(group).getAllByRole('button'))).toEqual(['Minimizar', 'Cancelar', 'Listo'])
    expect(within(group).getByRole('button', { name: 'Listo' })).toBeDisabled()
    // Con «Cancelar», Escape es de la mesa (cancela): la banda no se minimiza.
    escape()
    expect(group).toBeInTheDocument()
    fireEvent.click(within(group).getByRole('button', { name: 'Cancelar' }))
    expect(onCancel).toHaveBeenCalledTimes(1)
  })

  it('por qué se pregunta (`AskWhy`): arriba del título, con el eslabón, y el grupo lo dice entero; sin dato, no va', () => {
    band({ why: { text: 'Costo de Ash Blossom & Joyous Spring', name: 'Ash Blossom & Joyous Spring', art: null, link: 2, mine: false } })
    const group = screen.getByRole('group', { name: 'Elegí 2 cartas para desterrar · 0/2 CL2 Costo de Ash Blossom & Joyous Spring' })

    expect(group.querySelector('[data-ask-why]')).toHaveTextContent('CL2 Costo de Ash Blossom & Joyous Spring')
    cleanup()
    band()
    expect(document.querySelector('[data-ask-why]')).toBeNull()
  })

  it('las elegidas, con su estado, el aro lima y su número (blanco); completa, la principal dice cuántas y contesta; con una sola y sin cancelar, sin pie', () => {
    const onPick = vi.fn()
    const onToggle = vi.fn()
    band({ chosen: ['b', 'a'], done: true, onPick, onToggle })
    const second = screen.getByRole('option', { name: /Fallen of Albaz/ })

    expect(screen.getByRole('option', { name: /Aluber/ })).toHaveAttribute('aria-selected', 'true')
    expect(second.querySelector('[data-pick-chosen]')).toHaveClass('outline-info')
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
  onDesktop()
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

  it('qué se decide (a qué eslabón lo dice la pila de la cadena: ni su número ni su carta), las candidatas con la pestaña de su lugar, «Pasar» sin caja y «Activar» al final, apagada sin elegida', () => {
    const onPass = vi.fn()
    respond({ onPass })
    const group = screen.getByRole('group', { name: 'Responder a la cadena' })

    expect(group).toHaveAttribute('data-auto-panel', 'floating')
    expect(group).not.toHaveTextContent(/Ash Blossom|Tu respuesta|CL2|Rival/)
    expect(group.querySelector('img')).toBeNull()
    expect(within(group).getByRole('option', { name: 'Fallen of Albaz, Mano' }).querySelectorAll('.text-soft')).toHaveLength(0)
    expect(within(within(group).getByRole('option', { name: 'Fallen of Albaz, Mano' })).getByText('Mano').parentElement).toHaveClass('rounded-tag', 'whitespace-nowrap')
    expect(document.activeElement).toBe(within(group).getAllByRole('option')[0])
    // Las acciones, debajo de las candidatas (también en el celular): primero se ve qué se encadena.
    expect(names(within(group).getAllByRole('button'))).toEqual(['Minimizar', 'Pasar', 'Activar'])
    expect(within(group).getByRole('listbox').compareDocumentPosition(within(group).getByRole('button', { name: 'Pasar' })) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    expect(within(group).getByRole('button', { name: 'Activar' })).toBeDisabled()
    // El modo de respuesta («Preguntarme: Siempre · Nunca») no se repite en el cartel: vive en Opciones.
    expect(within(group).queryByRole('radiogroup')).toBeNull()
    expect(group).not.toHaveTextContent('Preguntarme')
    // Escape es «Pasar» (lo da la mesa): la banda no se minimiza.
    escape()
    expect(group).not.toHaveAttribute('data-minimized')
    fireEvent.click(within(group).getByRole('button', { name: 'Pasar' }))
    expect(onPass).toHaveBeenCalledTimes(1)
  })

  it('la elegida, con el aro y la tilde lima; la principal contesta', () => {
    const onChain = vi.fn()
    respond({ chosen: 'b', onChain })
    const group = screen.getByRole('group', { name: 'Responder a la cadena' })
    const chosen = within(group).getByRole('option', { name: 'Aluber the Jester of Despia, Cementerio' })

    expect(chosen).toHaveAttribute('aria-selected', 'true')
    expect(chosen.querySelector('[data-pick-chosen]')).toHaveClass('outline-info')
    expect(chosen.querySelector('.bg-info svg')).not.toBeNull()
    expect(within(group).getByRole('option', { name: 'Fallen of Albaz, Mano' }).querySelector('[data-pick-chosen]')).toBeNull()
    fireEvent.click(within(group).getByRole('button', { name: 'Activar' }))
    expect(onChain).toHaveBeenCalledTimes(1)

    // El título sin partirse a mitad de palabra («Respond / er»). «Minimizar» va en la barra.
    const title = within(group).getByText('Responder a la cadena')
    expect(title).not.toHaveClass('[overflow-wrap:anywhere]')
    expect(within(group).getByRole('button', { name: 'Minimizar' })).toHaveAttribute('data-window-minimize')
    // Texto, bandeja y botones, en ese orden en el código (en la ventana, la bandeja se dibuja a la izquierda); las cartas, de 4,5 rem en la ventana.
    const listbox = within(group).getByRole('listbox')
    expect(listbox).toHaveClass('grid-flow-col', 'justify-center-safe', 'group-data-[auto-panel=floating]/panel:auto-cols-[4.5rem]')
    expect(title.compareDocumentPosition(listbox) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    expect(listbox.compareDocumentPosition(within(group).getByRole('button', { name: 'Pasar' })) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    // El nombre, en un renglón (entero al pasar el mouse): cada píxel de alto es de la carta.
    const name = within(group).getByRole('option', { name: 'Aluber the Jester of Despia, Cementerio' }).querySelector('[data-pick-name]')!
    expect(name).toHaveAttribute('title', 'Aluber the Jester of Despia')
    expect(name.firstElementChild).not.toHaveClass('min-[1101px]:line-clamp-2')
    cleanup()

    // Sin cadena todavía, tu respuesta la abre.
    respond({ link: 1, title: '¿Activás algo ahora?', chosen: 'a' })
    expect(screen.getByRole('button', { name: 'Activar' })).toBeEnabled()
  })
})

describe('AutoPanel en escritorio: el mismo cartel, en una ventana', () => {
  onDesktop()

  it('entre grupos, 8 px (la escala de la guía: 4 · 8 · 16 · 24); la ventana sale centrada en la columna de la mesa, apaisada de 30 rem y apoyada abajo, con la bandeja a la izquierda del texto (M-08)', () => {
    render(<RespondBand title="Responder a la cadena" link={2} cards={CARDS.slice(0, 2)} chosen={null} onToggle={() => {}} onChain={() => {}} onPass={() => {}} />)
    const group = screen.getByRole('group', { name: 'Responder a la cadena' })

    expect(group).toHaveClass('fixed', 'bottom-0', 'left-[var(--mat-x,50%)]', 'w-[min(30rem,var(--mat-w,100vw))]')
    expect(group.querySelector('[data-panel-body]')!.parentElement).toHaveClass('gap-y-2', 'grid-cols-[auto_minmax(0,1fr)]')
    expect(group.querySelector('[data-panel-body]')).toHaveClass('col-start-1')
    // Los botones a su ancho y a la derecha (B-04).
    expect(screen.getByRole('button', { name: 'Activar' }).parentElement).toHaveClass('group-data-[auto-panel=floating]/panel:justify-end')
    expect(group.querySelector('.gap-3')).toBeNull()
  })
})

describe('RespondBand en el celular', () => {
  it('sin el modo (vive en Opciones), la pregunta a la vista, las cartas en la bandeja y las acciones debajo', () => {
    render(<RespondBand title="Responder a la cadena" link={2} cards={CARDS.slice(0, 2)} chosen={null} onToggle={() => {}} onChain={() => {}} onPass={() => {}} />)
    const group = screen.getByRole('group', { name: 'Responder a la cadena' })
    const listbox = within(group).getByRole('listbox')

    expect(within(group).queryByRole('radiogroup')).toBeNull()
    expect(within(group).getByText('Responder a la cadena')).not.toHaveClass('sr-only')
    expect(listbox).toHaveClass('grid-flow-col')
    expect(listbox.compareDocumentPosition(within(group).getByRole('button', { name: 'Pasar' })) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
  })
})

describe('CardPicker', () => {
  it('de 1 a 2: aro y número de orden, nunca más de dos, el pie dice cuántas y la principal se enciende con el mínimo', () => {
    const onPick = vi.fn()
    const onCancel = vi.fn()
    render(<CardPicker title="Elegí qué agregar a tu mano" cards={CARDS} min={1} max={2} onPick={onPick} onCancel={onCancel} />)
    const list = screen.getByRole('listbox', { name: 'Cartas para elegir' })
    const option = (name: RegExp) => within(list).getByRole('option', { name })

    // La bandeja en una fila que se desliza; el nombre, en un renglón (entero al pasar el mouse).
    expect(list).toHaveClass('grid-flow-col', 'overflow-x-auto')
    expect(within(list).getAllByRole('option')[0]!.querySelector('[data-pick-name]')).toHaveAttribute('title', 'Fallen of Albaz')

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

  it('de varios lugares: por lugar (la mano primero, después en el orden que llegan), un chip por carta y el lugar en el nombre accesible; también en inglés', () => {
    const onPick = vi.fn()
    const cards: PickCard[] = [
      { key: 'kirin', name: 'Kirin', art: null, ...pickPlace('deck', false) },
      { key: 'ponix-deck', name: 'Ponix', art: null, ...pickPlace('deck', false) },
      { key: 'veiler', name: 'Effect Veiler', art: null, ...pickPlace('hand', true) },
      { key: 'ponix-hand', name: 'Ponix', art: null, ...pickPlace('hand', false) },
    ]
    render(<CardPicker title="Elegí 1 carta para destruir" cards={cards} min={1} max={1} onPick={onPick} />)

    expect(names(screen.getAllByRole('option'))).toEqual(['Ponix, en tu mano', 'Kirin, en tu Deck', 'Ponix, en tu Deck', 'Effect Veiler, en la mano del rival'])
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
    // Sin pie: el único botón es el de minimizar la hoja.
    expect(screen.getAllByRole('button').map((button) => button.getAttribute('aria-label'))).toEqual(['Minimizar'])
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
    onChain: () => {},
    onPlace: () => {},
    rival: { kind: 'passive' as const, summary: 'Pasivo', onChange: () => {} },
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

  it('arriba, sin ⋯ (Gastón, 2026-11-12: «compite con el de configuración»; todo va en el ⚙ de abajo): hasta 1100 px sólo la flecha de «Volver a Jugar» (Deshacer va en la botonera); debajo (de 640 a 1100 px), el marcador plano', () => {
    const onExit = vi.fn()
    render(<AutoBar {...props} onExit={onExit} />)
    const toolbar = screen.getByRole('toolbar', { name: 'Mesa' })

    expect(names(within(toolbar).getAllByRole('button'))).toEqual(['Volver a Jugar'])
    expect(screen.queryByRole('button', { name: 'Más opciones' })).toBeNull()
    // Sin el chip «Turno 3» ni la píldora de la fase: el turno una vez, entre las dos vidas (jsdom no es un celular: es el ancho de una tablet).
    expect(screen.getByTestId('auto-score')).toHaveTextContent('Vos8000Tu turno · 3Rival7000')
    expect(screen.queryByText('Turno 3')).toBeNull()

    fireEvent.click(within(toolbar).getByRole('button', { name: 'Volver a Jugar' }))
    expect(onExit).toHaveBeenCalledTimes(1)
    // Salir es volver, como en la práctica: ya no hay X.
    expect(screen.queryByRole('button', { name: 'Salir del duelo' })).toBeNull()
  })

  it('en el celular, repasando, «Volver al duelo» va en la barra en el lugar de la chapa del rival (secundario: no compite con el ⏯ de abajo)', () => {
    window.matchMedia = ((query: string) => ({ matches: query === '(max-width: 639.98px)', media: query, addEventListener: () => {}, removeEventListener: () => {}, addListener: () => {}, removeListener: () => {}, onchange: null, dispatchEvent: () => false })) as typeof window.matchMedia
    const back = vi.fn()
    const { rerender } = render(<AutoBar {...props} seat={<span data-testid="seat" />} />)

    expect(within(screen.getByRole('toolbar', { name: 'Mesa' })).getByTestId('seat')).toBeInTheDocument()
    rerender(<AutoBar {...props} seat={<span data-testid="seat" />} back={back} />)
    expect(screen.queryByTestId('seat')).toBeNull()
    const button = within(screen.getByRole('toolbar', { name: 'Mesa' })).getByRole('button', { name: 'Volver al duelo' })

    expect(button).toHaveClass('bg-lavender')
    fireEvent.click(button)
    expect(back).toHaveBeenCalledTimes(1)
  })

  it('en el celular en vertical la barra es sólo la fila de los íconos: las vidas van en las chapas y el aviso en la línea (los pone la pantalla)', () => {
    window.matchMedia = ((query: string) => ({ matches: query === '(max-width: 639.98px)', media: query, addEventListener: () => {}, removeEventListener: () => {}, addListener: () => {}, removeListener: () => {}, onchange: null, dispatchEvent: () => false })) as typeof window.matchMedia
    render(<AutoBar {...props} lane={{ kind: 'thinking' }} />)

    expect(screen.queryByTestId('auto-score')).toBeNull()
    expect(screen.queryByRole('group', { name: /^Puntos de vida/ })).toBeNull()
    expect(document.querySelector('[data-lane]')).toBeNull()
    expect(screen.getByRole('toolbar', { name: 'Mesa' })).toBeInTheDocument()
  })

  it('de 640 a 1100 px, debajo de los íconos va el marcador plano: tus vidas, el turno una sola vez y las del rival; la fase no va en la barra (la dice el botón del campo)', () => {
    const { rerender } = render(<AutoBar {...props} />)
    const score = screen.getByTestId('auto-score')

    expect(score).toHaveTextContent('Vos8000Tu turno · 3Rival7000')
    expect(within(score).getByRole('group', { name: 'Puntos de vida de Vos: 8000' })).toBeInTheDocument()
    expect(within(score).getByRole('group', { name: 'Puntos de vida de Rival: 7000' })).toBeInTheDocument()
    expect(screen.getByTestId('auto-turn')).toHaveClass('text-accent')
    expect(screen.queryByTestId('auto-phase')).toBeNull()
    expect(screen.queryByText('Turno 3')).toBeNull()
    rerender(<AutoBar {...props} myTurn={false} turn={4} />)
    expect(screen.getByTestId('auto-turn')).toHaveTextContent('Turno de Rival · 4')
    expect(screen.getByTestId('auto-turn')).toHaveClass('text-info-soft')
  })

  it('en escritorio sin laterales las vidas no van en la barra (van planas en las esquinas del campo: las pone la pantalla) y no hay renglón del turno (lo dice la chapa de quien juega), ni chip ni fase; a la derecha, sólo Deshacer (lo pone la mesa), sin ⋯', () => {
    const { unmount } = render(<AutoBar {...props} />)

    expect(screen.getAllByRole('group', { name: /^Puntos de vida/ })).toHaveLength(2)
    unmount()

    desktop()
    render(
      <MatUndoContext value={<button type="button" aria-label="Deshacer" />}>
        <AutoBar {...props} />
      </MatUndoContext>,
    )

    expect(screen.queryByRole('group', { name: /^Puntos de vida/ })).toBeNull()
    expect(screen.queryByTestId('auto-turn')).toBeNull()
    expect(screen.queryByTestId('auto-phase')).toBeNull()
    expect(screen.queryByText('Turno 3')).toBeNull()
    expect(names(within(screen.getByRole('toolbar', { name: 'Mesa' })).getAllByRole('button'))).toEqual(['Deshacer'])
    expect(screen.getByRole('button', { name: 'Volver a Jugar' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Más opciones' })).toBeNull()
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
    expect(rival.querySelector('.text-stat')).toHaveTextContent('7000')
    expect(container.querySelector('.life-plate, [role="meter"]')).toBeNull()
  })

  it('Opciones (el ⚙, el único menú): «La mesa» arriba (la vista 3D, los sonidos, los colores y los menús flotantes) y «El duelo» debajo: las respuestas y la casilla entran y salen por props, y no dice que el rival no juega', () => {
    const onChain = vi.fn()
    const onPlace = vi.fn()
    render(<AutoDock {...props} onChain={onChain} onPlace={onPlace} />)

    const dialog = openOptions()

    // Dos grupos con su rótulo; en «La mesa», los interruptores (sin la ventana grande fuera de escritorio) y los colores; sin «A ciegas» con el pasivo.
    expect(within(dialog).getByRole('group', { name: 'La mesa' })).toContainElement(within(dialog).getByRole('group', { name: 'Colores' }))
    expect(within(dialog).getByRole('group', { name: 'El duelo' })).toContainElement(within(dialog).getByRole('radiogroup', { name: 'Respuestas' }))
    expect(within(dialog).getAllByRole('switch').map((item) => item.getAttribute('aria-label'))).toEqual(['Vista 3D', 'Sonidos', 'Menús flotantes'])
    fireEvent.click(within(within(dialog).getByRole('group', { name: 'Colores' })).getByRole('button', { name: 'Índigo' }))
    expect(document.documentElement.dataset.palette).toBe('indigo')
    fireEvent.click(within(within(dialog).getByRole('group', { name: 'Colores' })).getByRole('button', { name: 'Carbón' }))
    // Dos modos, y la línea chica dice qué hace el elegido.
    expect(within(within(dialog).getByRole('radiogroup', { name: 'Respuestas' })).getAllByRole('radio').map((radio) => radio.getAttribute('aria-label'))).toEqual(['Siempre', 'Nunca'])
    // Cada ajuste, en su fila de 44 px y con el control a la derecha; lo que hace el elegido va en el `title` de la fila, no en un párrafo debajo.
    expect(within(dialog).getByRole('radiogroup', { name: 'Respuestas' }).parentElement).toHaveAttribute('title', 'Te pregunta cada vez que tenés un efecto rápido o uno con su condición cumplida.')
    expect(within(dialog).getByRole('radiogroup', { name: 'Respuestas' }).parentElement).toHaveClass('flex', 'min-h-11', 'items-center', 'justify-between')
    fireEvent.click(within(within(dialog).getByRole('radiogroup', { name: 'Respuestas' })).getByRole('radio', { name: 'Nunca' }))
    fireEvent.click(within(within(dialog).getByRole('radiogroup', { name: 'Casilla' })).getByRole('radio', { name: 'Automática' }))
    expect(onChain).toHaveBeenCalledWith('never')
    expect(onPlace).toHaveBeenCalledWith('auto')
    expect(dialog).not.toHaveTextContent('El rival no juega')
    // El pasivo: «Cambiar rival · Pasivo» (sin el párrafo de que no juega) y sin «A ciegas».
    expect(dialog).toHaveTextContent('Cambiar rivalPasivo')
    expect(within(dialog).queryByRole('switch', { name: 'A ciegas' })).toBeNull()
  })

  it('«Más opciones» con handtraps: lo que tiene, «Cambiar rival» (cierra y abre la hoja) y «A ciegas»; ya no dice que el rival no juega', () => {
    const onChange = vi.fn()
    const onBlind = vi.fn()
    render(<AutoDock {...props} rival={{ kind: 'handtraps', summary: 'Ash Blossom & Joyous Spring, Effect Veiler · 2 en la mano', onChange }} onBlind={onBlind} />)

    const dialog = openOptions()

    expect(dialog).toHaveTextContent('Ash Blossom & Joyous Spring, Effect Veiler · 2 en la mano')
    expect(dialog).not.toHaveTextContent('El rival no juega')
    fireEvent.click(within(dialog).getByRole('switch', { name: 'A ciegas' }))
    expect(onBlind).toHaveBeenCalledWith(true)
    fireEvent.click(within(dialog).getByRole('button', { name: 'Cambiar rival' }))
    expect(onChange).toHaveBeenCalledTimes(1)
    expect(screen.queryByRole('dialog', { name: 'Opciones' })).toBeNull()
  })

  it('Opciones con el bot: «Bot · su mazo» y «Mostrar la mano del bot» (lo contrario de la mano de dorso), en vez de «A ciegas»', () => {
    const onBlind = vi.fn()
    const bot = { kind: 'bot' as const, summary: 'Bot · Sky Striker', onChange: () => {} }

    render(<AutoDock {...props} rival={bot} blind onBlind={onBlind} />)

    const dialog = openOptions()

    expect(dialog).toHaveTextContent('Cambiar rivalBot · Sky Striker')
    expect(within(dialog).queryByRole('switch', { name: 'A ciegas' })).toBeNull()
    const show = within(dialog).getByRole('switch', { name: 'Mostrar la mano del bot' })

    expect(show).toHaveAttribute('aria-checked', 'false')
    fireEvent.click(show)
    expect(onBlind).toHaveBeenCalledWith(false)
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

    const chain: LaneNotice = { kind: 'ask', text: 'Cadena 2: Ash Blossom responde a Branded Fusion', actions: [{ label: 'Pasar', onSelect: onPass }] }
    rerender(<AutoBar {...props} lane={chain} />)
    expect(lane()).toHaveClass('border-info')
    fireEvent.click(within(lane()).getByRole('button', { name: 'Pasar' }))
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
    // Ni el turno (la chapa de quien juega) ni la fase (el botón del campo) van en la barra.
    expect(screen.queryByTestId('auto-turn')).toBeNull()
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

describe('la carta del menú se toca (sin «Ver carta» visible)', () => {
  const plays = [{ label: 'Colocar', onSelect: () => {} }, { label: 'Invocación Normal', onSelect: () => {} }]

  it('ficha: la miniatura es un botón «Ver carta» de 44 px que llama a onInspect; no queda ningún botón con ese texto, y las jugadas son la fila de abajo', () => {
    const onInspect = vi.fn()
    render(<AutoCardSheet name="Ash Blossom" art={null} items={plays} onInspect={onInspect} onClose={() => {}} />)
    const sheet = screen.getByRole('region', { name: 'Ash Blossom' })
    const thumb = within(sheet).getByRole('button', { name: 'Ver carta' })

    expect(thumb).toHaveTextContent('')
    expect(thumb.parentElement).toHaveClass('w-full', 'aspect-[421/614]')
    fireEvent.click(thumb)
    expect(onInspect).toHaveBeenCalledTimes(1)
    expect(within(sheet).queryByText('Ver carta')).toBeNull()
    const menu = within(sheet).getByRole('menu')

    expect(menu.parentElement!.lastElementChild).toBe(menu)
    expect(sheet.querySelector('[data-panel-body]')).toBeNull()
  })

  it('Sincronía lleva el aro claro en el chip (para no confundirse con la Ficha), como Xyz y Enlace; la Ficha no', () => {
    const chip = (frameType: string, cardType: string) => {
      const view = render(<AutoCardSheet name="X" art={null} apiCard={{ ygoprodeckId: 1, frameType, cardType, race: 'Dragon', attribute: 'DARK', level: 4, atk: '1000', def: '1000', description: null } as never} items={plays} onClose={() => {}} />)
      const found = view.container.ownerDocument.querySelector('[data-type-chip]')!.className

      view.unmount()
      return found
    }

    for (const [frameType, cardType] of [['synchro', 'Synchro Monster'], ['xyz', 'XYZ Monster'], ['link', 'Link Monster'], ['dark_synchro', 'Synchro Monster']]) expect(chip(frameType, cardType), frameType).toContain('inset-ring-1')
    expect(chip('token', 'Token')).not.toContain('inset-ring-1')
  })

  it('ficha sin onInspect (con el panel de detalle a la vista): la miniatura no es un botón', () => {
    render(<AutoCardSheet name="Ash Blossom" art={null} items={plays} onClose={() => {}} />)
    expect(screen.queryByRole('button', { name: 'Ver carta' })).toBeNull()
  })

  it('pregunta: la carta que muestra se toca si llega onInspect', () => {
    const onInspect = vi.fn()
    render(<AskPrompt text="¿Activás el efecto?" card={{ name: 'Ash Blossom', art: null }} onInspect={onInspect} yes={{ label: 'Activar efecto', onSelect: () => {} }} no={{ label: 'No activar', onSelect: () => {} }} />)
    fireEvent.click(screen.getByRole('button', { name: 'Ver carta' }))
    expect(onInspect).toHaveBeenCalledTimes(1)
  })
})

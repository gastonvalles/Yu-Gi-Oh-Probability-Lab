// @vitest-environment jsdom
import { configureStore } from '@reduxjs/toolkit'
import { act, fireEvent, render, screen, within } from '@testing-library/react'
import '@testing-library/jest-dom'
import { Provider } from 'react-redux'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import type { PickCard } from '../components/auto/CardPicker'
import { ChainNotice, type ChainNoticeRow } from '../components/auto/ChainNotice'
import type { ChainRespond } from '../components/auto/ChainSheet'
import { PLAYER_COLOR } from '../components/duel/player-color'

// La cadena: en el celular, una cinta con un chip por eslabón (sin nombres de cartas: el nombre va en su nombre accesible); desde 1101 px, la pila (la píldora es su título). Cada dato, una vez.

const PONIX: ChainNoticeRow = { number: 1, who: 'Vos', mine: true, name: 'Ponix', art: null, state: 'chained' }
const ASH: ChainNoticeRow = { number: 2, who: 'Rival', mine: false, name: 'Ash Blossom', art: null, state: 'chained' }
// El arte de la pila lee el formato del store.
const store = configureStore({ reducer: { settings: (state = { handSize: 5, deckFormat: 'unlimited' as const }) => state } })
const pill = (rows: ChainNoticeRow[], props: { focus?: number; resolving?: boolean; compact?: boolean; open?: boolean; onPick?: (index: number) => void; respond?: ChainRespond } = {}) => {
  const ui = (next: ChainNoticeRow[], respond = props.respond) => (
    <Provider store={store}>
      <ChainNotice rows={next} focus={props.focus ?? next.length - 1} resolving={props.resolving ?? false} open={props.open ?? false} compact={props.compact ?? true} onOpenChange={() => {}} onPick={(index) => props.onPick?.(index)} respond={respond} />
    </Provider>
  )
  const view = render(ui(rows))

  return { status: screen.getByRole('status'), rerender: (next: ChainNoticeRow[], respond?: ChainRespond) => view.rerender(ui(next, respond ?? props.respond)) }
}

/** Arrastra en vertical con el dedo (`dy` px, positivo hacia abajo) y suelta a los `elapsed` ms: lento, decide la distancia; después llega el clic, como en el navegador. */
function drag(element: Element, dy: number, elapsed = 400) {
  const base = { pointerId: 5, pointerType: 'touch', isPrimary: true }

  fireEvent.pointerDown(element, { ...base, button: 0, buttons: 1, clientX: 120, clientY: 500 })
  fireEvent.pointerMove(element, { ...base, buttons: 1, clientX: 120, clientY: 500 + dy / 2 })
  fireEvent.pointerMove(element, { ...base, buttons: 1, clientX: 120, clientY: 500 + dy })
  const up = new Event('pointerup', { bubbles: true, cancelable: true })

  Object.assign(up, { ...base, button: 0, buttons: 0, clientX: 120, clientY: 500 + dy })
  Object.defineProperty(up, 'timeStamp', { value: performance.now() + elapsed })
  fireEvent(element, up)
  fireEvent.click(element)
}

beforeEach(() => {
  vi.useFakeTimers()
  vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => {
    callback(0)
    return 1
  })
  vi.stubGlobal('cancelAnimationFrame', () => {})
})

afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllGlobals()
})

describe('ChainNotice en el celular: la hoja de la cadena', () => {
  const strip = () => screen.getByRole('list', { name: 'Eslabones de la cadena, del primero al último' })
  const grip = () => screen.getByRole('button', { name: /la hoja/ })

  it('bajada, un chip por eslabón y del primero al último, sin el nombre a la vista: número en el color de su dueño y el aro del que se resuelve', () => {
    pill([{ ...PONIX, state: 'solved' }, { ...ASH, state: 'solving' }, { ...PONIX, number: 3 }], { focus: 1, resolving: true })
    const chips = within(strip()).getAllByRole('listitem')

    expect(grip()).toHaveAttribute('aria-expanded', 'false')
    expect(chips).toHaveLength(3)
    expect(chips.map((chip) => within(chip).getByText(/^CL[0-9]$/).textContent)).toEqual(['CL1', 'CL2', 'CL3'])
    expect(within(chips[1]!).getByText('CL2')).toHaveClass(PLAYER_COLOR.theirs.bubble, PLAYER_COLOR.theirs.border)
    expect(within(chips[0]!).getByText('CL1')).toHaveClass(PLAYER_COLOR.mine.bubble)
    expect(chips[1]).toHaveAttribute('aria-current', 'step')
    expect(chips[0]).not.toHaveAttribute('aria-current')
    expect(within(chips[1]!).getByRole('button')).toHaveClass('inset-ring-info/70')
    // El nombre y el estado, sólo para el lector de pantalla; cada chip mide 44 px.
    expect(within(chips[1]!).getByRole('button')).toHaveAccessibleName('Eslabón 2: Ash Blossom, del rival. Resolviendo')
    expect(within(chips[0]!).getByRole('button')).toHaveClass('h-11')
    expect(within(strip()).queryByText('Ash Blossom')).toBeNull()
  })

  it('el resuelto lleva un tilde; el negado o sin efecto, una cruz con el eslabón que lo negó (si se sabe)', () => {
    pill([{ ...PONIX, state: 'solved' }, { ...ASH, state: 'negated', by: 3 }, { ...PONIX, number: 3, state: 'disabled' }], { focus: 0, resolving: true })
    const [done, negated, disabled] = within(strip()).getAllByRole('button')

    expect(done!.querySelector('svg')).not.toBeNull()
    expect(negated).toHaveTextContent(/^CL2.*CL3$/)
    expect(negated).toHaveAccessibleName('Eslabón 2: Ash Blossom, del rival. Negada · por CL3')
    expect(disabled).toHaveTextContent(/^CL3/)
    expect(disabled!.querySelector('svg')).not.toBeNull()
  })

  it('tocar un chip lo muestra (su lugar en la cadena)', () => {
    const picked: number[] = []

    pill([PONIX, ASH], { onPick: (index) => picked.push(index) })
    fireEvent.click(within(strip()).getByRole('button', { name: /^Eslabón 1:/ }))
    fireEvent.click(within(strip()).getByRole('button', { name: /^Eslabón 2:/ }))
    expect(picked).toEqual([0, 1])
  })

  it('un eslabón que se suma entra y dice «Nuevo» un momento; al resolverse ya no', () => {
    const { rerender } = pill([PONIX])

    expect(screen.getByText('Nuevo')).toBeInTheDocument()
    act(() => void vi.advanceTimersByTime(1600))
    expect(screen.queryByText('Nuevo')).toBeNull()
    // Otro eslabón: el nuevo es el último, y se va solo.
    rerender([PONIX, ASH])
    expect(within(within(strip()).getByRole('button', { name: /^Eslabón 2:/ })).getByText('Nuevo')).toBeInTheDocument()
    expect(within(within(strip()).getByRole('button', { name: /^Eslabón 1:/ })).queryByText('Nuevo')).toBeNull()
    expect(within(strip()).getByRole('button', { name: /^Eslabón 2:/ }).closest('li')).toHaveClass('motion-safe:animate-chain-link-in')
    act(() => void vi.advanceTimersByTime(1600))
    expect(screen.queryByText('Nuevo')).toBeNull()
  })

  it('el texto de siempre va para el lector de pantalla: «Cadena · N · Resuelve CLn» y qué pasa', () => {
    expect(pill([{ ...PONIX, state: 'disabled', by: 2 }, { ...ASH, state: 'solving' }, { ...PONIX, number: 3 }], { focus: 0, resolving: true }).status).toHaveTextContent(/^Cadena · 3 · Resuelve CL2Sin efecto · por CL2$/)
  })

  it('mientras se arma: el último y de quién, y su estado; la cuenta no se repite (es el número del último)', () => {
    expect(pill([PONIX]).status).toHaveTextContent(/^Cadena · CL1 · VosEn espera$/)
  })

  it('se arrastra: bajada deja la cinta a la vista (y la pila inerte); subida muestra la pila entera, en el orden en que se resuelve, y esconde los chips', () => {
    pill([PONIX, { ...ASH, state: 'solving' }], { resolving: true })
    const panel = screen.getByTestId('chain-notice')
    const body = () => screen.getByRole('list', { name: 'Eslabones de la cadena, en el orden en que se resuelven' })

    // Bajada: sólo asoma la cinta (el asa de 24 y los chips de 56) y lo de adentro no se toca.
    expect(panel.style.translate).toContain('calc(100% - 80px')
    expect(body().closest('[inert]')).not.toBeNull()
    expect(screen.getByRole('status')).toHaveClass('sr-only')

    // Un arrastre corto no la sube; uno largo, sí (sigue al dedo y al soltar queda subida).
    drag(grip(), -30)
    expect(grip()).toHaveAttribute('aria-expanded', 'false')
    drag(grip(), -120)
    expect(grip()).toHaveAttribute('aria-expanded', 'true')
    expect(panel.style.translate).toBe('')
    expect(body().closest('[inert]')).toBeNull()
    expect(within(body()).getAllByRole('listitem').map((item) => within(item).getByRole('button').getAttribute('aria-label'))).toEqual(['Eslabón 2: Ash Blossom, del rival. Resolviendo', 'Eslabón 1: Ponix, tuyo. En espera'])
    expect(screen.getByRole('list', { name: 'Eslabones de la cadena, del primero al último', hidden: true }).closest('[hidden]')).not.toBeNull()
    expect(screen.getByText('Cadena · 2')).toBeInTheDocument()

    // Tocar su asa la baja.
    fireEvent.click(grip())
    expect(grip()).toHaveAttribute('aria-expanded', 'false')
  })

  it('subida, tocar un eslabón de la pila lo muestra', () => {
    const picked: number[] = []

    pill([PONIX, ASH], { onPick: (index) => picked.push(index) })
    drag(grip(), -120)
    fireEvent.click(within(screen.getByRole('list', { name: 'Eslabones de la cadena, en el orden en que se resuelven' })).getByRole('button', { name: /^Eslabón 1:/ }))
    expect(picked).toEqual([0])
  })

  it('cada eslabón se dice una sola vez: bajada, la cinta (la pila, inerte y transparente); subida, la pila sin la cinta y sin «Vos» / «Rival» escrito (el color lo dice; el nombre accesible, entero)', () => {
    pill([PONIX, { ...ASH, state: 'solving' }, { ...PONIX, number: 3, name: 'Nibiru' }], { focus: 1, resolving: true })
    // Subida, la cinta queda `hidden` (fuera del árbol accesible): se la busca igual para ver que no se cuenta.
    const chips = () => screen.getByRole('list', { name: 'Eslabones de la cadena, del primero al último', hidden: true })
    const body = () => screen.getByRole('list', { name: 'Eslabones de la cadena, en el orden en que se resuelven' })
    const shown = (number: number) => [chips(), body()].filter((list) => !list.closest('[hidden], [inert], .opacity-0')).flatMap((list) => within(list).queryAllByText(`CL${number}`))

    expect(body().closest('[inert]')).toHaveClass('opacity-0')
    expect([1, 2, 3].map((number) => shown(number).length)).toEqual([1, 1, 1])
    fireEvent.click(grip())
    expect(chips().closest('[hidden]')).not.toBeNull()
    expect(body().parentElement).not.toHaveClass('opacity-0')
    expect([1, 2, 3].map((number) => shown(number).length)).toEqual([1, 1, 1])
    expect(within(body()).getAllByText('Nibiru')).toHaveLength(1)
    expect(within(body()).queryByText('Rival')).toBeNull()
    expect(within(body()).queryByText('Vos')).toBeNull()
    expect(within(body()).getByRole('button', { name: 'Eslabón 2: Ash Blossom, del rival. Resolviendo' })).toBeInTheDocument()
  })

  describe('responder o pasar desde la hoja', () => {
    const card = (key: string, name: string): PickCard => ({ key, name, art: null })
    const respond = (over: Partial<ChainRespond> = {}): ChainRespond => ({ key: 1, link: 2, cards: [card('mine:a', 'Called by the Grave')], chosen: 'mine:a', onToggle: () => {}, onChain: () => {}, onPass: () => {}, ...over })

    // Qué se encadena se ve siempre: las candidatas van en la parte que queda a la vista bajada (no inerte), antes que las acciones.
    const options = () => screen.getByRole('listbox', { name: 'Podés responder con' })
    const before = (first: Element, second: Element) => Boolean(first.compareDocumentPosition(second) & Node.DOCUMENT_POSITION_FOLLOWING)

    it('con una sola carta, bajada muestra la cinta, la candidata ya elegida y, debajo, «No responder» y la principal (asa 24 + cinta 56 + candidatas 124 + acciones 56)', () => {
      const calls: string[] = []

      pill([PONIX], { respond: respond({ onChain: () => calls.push('chain'), onPass: () => calls.push('pass') }) })
      expect(grip()).toHaveAttribute('aria-expanded', 'false')
      expect(screen.getByTestId('chain-notice').style.translate).toContain('calc(100% - 260px')
      const option = within(options()).getByRole('option', { name: 'Called by the Grave' })

      expect(option).toHaveAttribute('aria-selected', 'true')
      expect(options().closest('[inert], [hidden]')).toBeNull()
      expect(before(strip(), options())).toBe(true)
      expect(before(options(), screen.getByRole('button', { name: 'No responder' }))).toBe(true)
      expect(before(screen.getByRole('button', { name: 'No responder' }), screen.getByRole('button', { name: 'Encadenar como CL2' }))).toBe(true)
      fireEvent.click(screen.getByRole('button', { name: 'Encadenar como CL2' }))
      fireEvent.click(screen.getByRole('button', { name: 'No responder' }))
      expect(calls).toEqual(['chain', 'pass'])
    })

    it('con varias, todas a la vista y la hoja bajada (no se sube sola); la principal, apagada hasta elegir una; tocar una la elige sin mover la hoja', () => {
      const toggled: string[] = []
      const cards = [card('mine:a', 'Called by the Grave'), card('mine:b', 'Nibiru'), card('mine:c', 'Ash Blossom')]
      const view = pill([PONIX], { respond: respond({ cards, chosen: null, onToggle: (key) => toggled.push(key) }) })

      expect(grip()).toHaveAttribute('aria-expanded', 'false')
      expect(within(options()).getAllByRole('option').map((option) => option.getAttribute('aria-label'))).toEqual(['Called by the Grave', 'Nibiru', 'Ash Blossom'])
      expect(within(options()).getAllByRole('option').every((option) => option.getAttribute('aria-selected') === 'false')).toBe(true)
      expect(screen.getByRole('button', { name: 'Encadenar como CL2' })).toBeDisabled()
      fireEvent.click(within(options()).getByRole('option', { name: 'Nibiru' }))
      expect(toggled).toEqual(['mine:b'])
      expect(grip()).toHaveAttribute('aria-expanded', 'false')
      view.rerender([PONIX], respond({ cards, chosen: 'mine:b', onToggle: (key) => toggled.push(key) }))
      expect(within(options()).getByRole('option', { name: 'Nibiru' })).toHaveAttribute('aria-selected', 'true')
      expect(screen.getByRole('button', { name: 'Encadenar como CL2' })).toBeEnabled()
      // Subida, las mismas candidatas y las acciones debajo (y la pila entera, más abajo).
      fireEvent.click(grip())
      expect(grip()).toHaveAttribute('aria-expanded', 'true')
      expect(before(options(), screen.getByRole('button', { name: 'Encadenar como CL2' }))).toBe(true)
    })
  })
})

describe('ChainNotice desplegada en escritorio (como abre cada cadena)', () => {
  it('la píldora es el título de la pila («Cadena · 2»): el eslabón, su dueño y su estado van sólo en su fila (el resumen, para el lector de pantalla)', () => {
    const { status } = pill([PONIX, ASH], { open: true, compact: false })

    expect(status.firstElementChild).toHaveTextContent(/^Cadena · 2$/)
    for (const line of [...status.children].slice(1)) expect(line).toHaveClass('sr-only')
    // Sin lugar para la lista con una pregunta abierta (`data-squeezed` en la capa), se ve el resumen y no la lista.
    for (const line of [...status.children].slice(1)) expect(line).toHaveClass('group-data-squeezed/chain:not-sr-only')
    expect(status.firstElementChild).toHaveClass('group-data-squeezed/chain:hidden')
    expect(screen.getByRole('list', { name: /Eslabones de la cadena/ })).toHaveAttribute('data-chain-list')
    expect(screen.getByRole('list', { name: /Eslabones de la cadena/ })).toHaveClass('group-data-squeezed/chain:hidden')
    expect(screen.getAllByRole('listitem')).toHaveLength(2)
    expect(screen.getByRole('button', { name: 'Ocultar la cadena' })).toHaveAttribute('aria-expanded', 'true')
  })

  it('un solo cartel: el título y la pila van en la misma tarjeta (un borde, una sombra), separados por una línea fina', () => {
    const { status } = pill([PONIX, ASH], { open: true, compact: false })
    const list = screen.getByRole('list', { name: /Eslabones de la cadena/ })
    const boxes = [...screen.getByTestId('chain-notice').querySelectorAll('[class*="shadow-overlay"]')]

    expect(boxes).toHaveLength(1)
    expect(boxes[0]).toHaveClass('border', 'rounded-card')
    expect(boxes[0]).toContainElement(status)
    expect(boxes[0]).toContainElement(list)
    expect(list).toHaveClass('border-t')
    expect(list).not.toHaveClass('border')
  })

  it('plegada: el eslabón y de quién arriba; debajo, su estado con quién lo negó, sin el nombre; la cuenta, porque no es ese número', () => {
    expect(pill([{ ...PONIX, state: 'disabled', by: 2 }, { ...ASH, state: 'solving' }], { focus: 0, resolving: true, compact: false }).status).toHaveTextContent(/^Cadena · 2 · CL1 · VosSin efecto · por CL2$/)
    expect(screen.getByRole('button', { name: 'Ver la cadena' })).toHaveAttribute('aria-expanded', 'false')
  })
})

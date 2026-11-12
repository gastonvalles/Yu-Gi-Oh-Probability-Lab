// @vitest-environment jsdom
import { configureStore } from '@reduxjs/toolkit'
import { act, fireEvent, render, screen, within } from '@testing-library/react'
import '@testing-library/jest-dom'
import type { ReactNode } from 'react'
import { Provider } from 'react-redux'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { AskPrompt } from '../components/auto/AskPrompt'
import type { PickCard } from '../components/auto/CardPicker'
import { ChainLine, ChainNotice, type ChainNoticeRow } from '../components/auto/ChainNotice'
import { RespondBand } from '../components/auto/RespondBand'
import { PLAYER_COLOR } from '../components/duel/player-color'
import { SheetHost, type SheetYield } from '../components/ui/BottomSheet'

// La cadena: en el celular, la hoja de abajo estándar (subida, la pila; bajada, una cinta con un chip por eslabón, sin nombres de cartas: el nombre va en su nombre accesible), con las preguntas de la
// mesa en su pie; desde 1101 px, la pila (la píldora es su título). Cada dato, una vez.

const PONIX: ChainNoticeRow = { number: 1, who: 'Vos', mine: true, name: 'Ponix', art: null, state: 'chained' }
const ASH: ChainNoticeRow = { number: 2, who: 'Rival', mine: false, name: 'Ash Blossom', art: null, state: 'chained' }
// El arte de la pila lee el formato del store.
const store = configureStore({ reducer: { settings: (state = { handSize: 5, deckFormat: 'unlimited' as const }) => state } })
const pill = (rows: ChainNoticeRow[], props: { focus?: number; resolving?: boolean; compact?: boolean; open?: boolean; onPick?: (index: number) => void } = {}) => {
  const ui = (next: ChainNoticeRow[]) => (
    <Provider store={store}>
      <ChainNotice rows={next} focus={props.focus ?? next.length - 1} resolving={props.resolving ?? false} open={props.open ?? false} compact={props.compact ?? true} onOpenChange={() => {}} onPick={(index) => props.onPick?.(index)} />
    </Provider>
  )
  const view = render(ui(rows))

  return { status: screen.getByRole('status'), rerender: (next: ChainNoticeRow[]) => view.rerender(ui(next)) }
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
  const body = () => screen.getByRole('list', { name: 'Eslabones de la cadena, en el orden en que se resuelven' })
  const grip = () => screen.getByRole('button', { name: /la hoja/ })
  const panel = () => grip().closest<HTMLElement>('[style]')!
  /** Baja la hoja con un toque en su asa (abre subida). */
  const lower = () => {
    fireEvent.click(grip())
    expect(grip()).toHaveAttribute('aria-expanded', 'false')
  }

  it('bajada, un chip por eslabón y del primero al último, sin el nombre a la vista: número en el color de su dueño y el aro del que se resuelve', () => {
    pill([{ ...PONIX, state: 'solved' }, { ...ASH, state: 'solving' }, { ...PONIX, number: 3 }], { focus: 1, resolving: true })
    lower()
    const chips = within(strip()).getAllByRole('listitem')

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
    lower()
    const [done, negated, disabled] = within(strip()).getAllByRole('button')

    expect(done!.querySelector('svg')).not.toBeNull()
    expect(negated).toHaveTextContent(/^CL2.*CL3$/)
    expect(negated).toHaveAccessibleName('Eslabón 2: Ash Blossom, del rival. Negada · por CL3')
    expect(disabled).toHaveTextContent(/^CL3/)
    expect(disabled!.querySelector('svg')).not.toBeNull()
  })

  it('cada estado lleva su ícono y su color en la cinta (el color nunca va solo): en espera, resolviendo, resuelta, negada y sin efecto', () => {
    const only = (number: number, state: ChainNoticeRow['state']): ChainNoticeRow => ({ ...PONIX, number, state })

    pill([only(1, 'chained'), only(2, 'solving'), only(3, 'solved'), only(4, 'negated'), only(5, 'disabled')], { focus: 0, resolving: true })
    lower()
    const icons = within(strip())
      .getAllByRole('button')
      .map((chip) => chip.querySelector('svg')!)

    expect(icons).toHaveLength(5)
    expect(icons.map((icon) => icon.parentElement!.className.match(/text-(?:muted|info-soft|success-soft|danger-soft|warning-soft)/)?.[0])).toEqual(['text-muted', 'text-info-soft', 'text-success-soft', 'text-danger-soft', 'text-warning-soft'])
    expect(new Set(icons.map((icon) => icon.innerHTML)).size).toBe(5)
    icons.forEach((icon) => expect(icon.parentElement).toHaveAttribute('aria-hidden', 'true'))
  })

  it('tocar un chip lo muestra (su lugar en la cadena)', () => {
    const picked: number[] = []

    pill([PONIX, ASH], { onPick: (index) => picked.push(index) })
    lower()
    fireEvent.click(within(strip()).getByRole('button', { name: /^Eslabón 1:/ }))
    fireEvent.click(within(strip()).getByRole('button', { name: /^Eslabón 2:/ }))
    expect(picked).toEqual([0, 1])
  })

  it('un eslabón que se suma entra y dice «Nuevo» un momento; al resolverse ya no', () => {
    const { rerender } = pill([PONIX])

    lower()
    expect(screen.getByText('Nuevo')).toBeInTheDocument()
    act(() => void vi.advanceTimersByTime(1600))
    expect(screen.queryByText('Nuevo')).toBeNull()
    // Otro eslabón (la vuelve a subir): el nuevo es el último, y se va solo.
    rerender([PONIX, ASH])
    lower()
    expect(within(within(strip()).getByRole('button', { name: /^Eslabón 2:/ })).getByText('Nuevo')).toBeInTheDocument()
    expect(within(within(strip()).getByRole('button', { name: /^Eslabón 1:/ })).queryByText('Nuevo')).toBeNull()
    expect(within(strip()).getByRole('button', { name: /^Eslabón 2:/ }).closest('li')).toHaveClass('motion-safe:animate-chain-link-in')
    act(() => void vi.advanceTimersByTime(1600))
    expect(screen.queryByText('Nuevo')).toBeNull()
  })

  it('el texto de siempre va para el lector de pantalla, subida o bajada: «Cadena · N · Resuelve CLn» y qué pasa', () => {
    expect(pill([{ ...PONIX, state: 'disabled', by: 2 }, { ...ASH, state: 'solving' }, { ...PONIX, number: 3 }], { focus: 0, resolving: true }).status).toHaveTextContent(/^Cadena · 3 · Resuelve CL2Sin efecto · por CL2$/)
    lower()
    expect(screen.getByRole('status')).toHaveTextContent(/^Cadena · 3 · Resuelve CL2Sin efecto · por CL2$/)
  })

  it('mientras se arma: el último y de quién, y su estado; la cuenta no se repite (es el número del último)', () => {
    expect(pill([PONIX]).status).toHaveTextContent(/^Cadena · CL1 · VosEn espera$/)
  })

  it('cada eslabón que se suma la abre entera (maximizada), aunque la hayas bajado; al resolverse no se sube sola', () => {
    const { rerender } = pill([PONIX])

    expect(grip()).toHaveAttribute('aria-expanded', 'true')
    expect(within(body()).getAllByRole('listitem')).toHaveLength(1)
    lower()
    rerender([PONIX, ASH])
    expect(grip()).toHaveAttribute('aria-expanded', 'true')
    expect(within(body()).getAllByRole('listitem')).toHaveLength(2)
    lower()
    rerender([PONIX, { ...ASH, state: 'solving' }])
    expect(grip()).toHaveAttribute('aria-expanded', 'false')
  })

  it('se arrastra: subida, la pila entera en el orden en que se resuelve; bajada deja la cinta (asa 28 + cinta 56) y la pila inerte', () => {
    pill([PONIX, { ...ASH, state: 'solving' }], { resolving: true })

    expect(panel().style.translate).toBe('')
    expect(body().closest('[inert]')).toBeNull()
    expect(within(body()).getAllByRole('listitem').map((item) => within(item).getByRole('button').getAttribute('aria-label'))).toEqual(['Eslabón 2: Ash Blossom, del rival. Resolviendo', 'Eslabón 1: Ponix, tuyo. En espera'])
    expect(screen.queryByRole('list', { name: 'Eslabones de la cadena, del primero al último' })).toBeNull()
    expect(screen.getByText('Cadena · 2')).toBeInTheDocument()

    // Un arrastre corto no la baja; uno largo, sí (sigue al dedo y al soltar queda bajada).
    drag(grip(), 30)
    expect(grip()).toHaveAttribute('aria-expanded', 'true')
    drag(grip(), 120)
    expect(grip()).toHaveAttribute('aria-expanded', 'false')
    expect(panel().style.translate).toBe('0 calc(100% - 84px)')
    expect(body().closest('[inert]')).not.toBeNull()
    expect(strip()).toBeInTheDocument()

    // Arrastrarla para arriba la sube.
    drag(grip(), -120)
    expect(grip()).toHaveAttribute('aria-expanded', 'true')
  })

  it('subida, tocar un eslabón de la pila lo muestra', () => {
    const picked: number[] = []

    pill([PONIX, ASH], { onPick: (index) => picked.push(index) })
    fireEvent.click(within(body()).getByRole('button', { name: /^Eslabón 1:/ }))
    expect(picked).toEqual([0])
  })

  it('cada eslabón se dice una sola vez: subida, la pila sin la cinta y sin «Vos» / «Rival» escrito; bajada, la cinta (la pila, inerte y transparente)', () => {
    pill([PONIX, { ...ASH, state: 'solving' }, { ...PONIX, number: 3, name: 'Nibiru' }], { focus: 1, resolving: true })
    const chips = () => screen.queryByRole('list', { name: 'Eslabones de la cadena, del primero al último' })
    const shown = (number: number) => [chips(), body()].filter((list): list is HTMLElement => list !== null && !list.closest('[hidden], [inert], .opacity-0')).flatMap((list) => within(list).queryAllByText(`CL${number}`))

    expect(chips()).toBeNull()
    expect([1, 2, 3].map((number) => shown(number).length)).toEqual([1, 1, 1])
    expect(within(body()).getAllByText('Nibiru')).toHaveLength(1)
    expect(within(body()).queryByText('Rival')).toBeNull()
    expect(within(body()).queryByText('Vos')).toBeNull()
    expect(within(body()).getByRole('button', { name: 'Eslabón 2: Ash Blossom, del rival. Resolviendo' })).toBeInTheDocument()
    lower()
    expect(body().closest('[inert]')).toHaveClass('opacity-0')
    expect([1, 2, 3].map((number) => shown(number).length)).toEqual([1, 1, 1])
  })

  describe('una sola hoja: la mesa (`SheetHost`)', () => {
    const card = (key: string, name: string): PickCard => ({ key, name, art: null })
    const before = (first: Element, second: Element) => Boolean(first.compareDocumentPosition(second) & Node.DOCUMENT_POSITION_FOLLOWING)
    const mat = (rows: ChainNoticeRow[], prompt: ReactNode, yieldTo: SheetYield = null) => (
      <Provider store={store}>
        <SheetHost yieldTo={yieldTo}>
          {rows.length > 0 ? <ChainNotice rows={rows} focus={rows.length - 1} resolving={false} open={false} compact onOpenChange={() => {}} onPick={() => {}} /> : null}
          {prompt}
        </SheetHost>
      </Provider>
    )
    const respond = (calls: string[] = []) => <RespondBand title="Responder a la cadena" link={2} cards={[card('mine:a', 'Called by the Grave'), card('mine:b', 'Nibiru')]} chosen="mine:a" onToggle={() => {}} onChain={() => calls.push('chain')} onPass={() => calls.push('pass')} />

    it('responder va en el pie de la hoja de la cadena: debajo de la pila, a la vista en las dos alturas, con «Pasar» y «Activar» debajo de las candidatas; una sola asa', () => {
      const calls: string[] = []

      render(mat([PONIX], respond(calls)))
      const sheet = screen.getByTestId('chain-notice')
      const options = screen.getByRole('listbox', { name: 'Podés responder con' })

      expect(screen.getAllByRole('button', { name: /la hoja/ })).toHaveLength(1)
      expect(sheet).toContainElement(options)
      expect(before(body(), options)).toBe(true)
      expect(before(options, screen.getByRole('button', { name: 'Pasar' }))).toBe(true)
      expect(before(screen.getByRole('button', { name: 'Pasar' }), screen.getByRole('button', { name: 'Activar' }))).toBe(true)
      lower()
      expect(options.closest('[inert], [hidden]')).toBeNull()
      fireEvent.click(screen.getByRole('button', { name: 'Activar' }))
      fireEvent.click(screen.getByRole('button', { name: 'Pasar' }))
      expect(calls).toEqual(['chain', 'pass'])
    })

    it('«¿Activás el efecto?» también: en el pie de la cadena; sin cadena, es su propio cartel abajo (no en el medio)', () => {
      const ask = <AskPrompt text="¿Activás el efecto?" card={{ name: 'Ponix', art: null }} yes={{ label: 'Activar efecto', onSelect: () => {} }} no={{ label: 'No activar', onSelect: () => {} }} />
      const view = render(mat([PONIX], ask))

      expect(screen.getByTestId('chain-notice')).toContainElement(screen.getByRole('button', { name: 'Activar efecto' }))
      expect(screen.getAllByRole('button', { name: /la hoja/ })).toHaveLength(1)
      view.rerender(mat([], ask))
      const sheet = document.querySelector<HTMLElement>('[data-prompt="ask"]')!

      expect(sheet).toHaveClass('fixed', 'bottom-0', 'inset-x-0')
      expect(sheet).toContainElement(screen.getByRole('button', { name: 'Activar efecto' }))
      // Minimizado (el cartel del automático, `AutoPanel`): la tira con la pregunta y los botones, a la vista.
      fireEvent.click(within(sheet).getByRole('button', { name: 'Minimizar' }))
      const strip = document.querySelector<HTMLElement>('[data-prompt="ask"]')!

      expect(strip).toHaveAttribute('data-minimized')
      expect(strip).toHaveAccessibleName('¿Activás el efecto?')
      expect(within(strip).getByRole('button', { name: 'Activar efecto' }).closest('[inert], [hidden]')).toBeNull()
    })

    it('mientras se elige en la mesa o la mano (un costo), subida o bajada se reduce a su asa sobre la línea de estado y sin pie; al terminar, vuelve como estaba', () => {
      const view = render(mat([PONIX], null))
      const sheet = screen.getByTestId('chain-notice')

      expect(grip()).toHaveAttribute('aria-expanded', 'true')
      view.rerender(mat([PONIX], null, 'grip'))
      expect(grip()).toHaveAttribute('aria-expanded', 'false')
      expect(grip()).toHaveClass('h-11')
      expect(panel().style.translate).toBe('0 calc(100% - 44px)')
      expect(sheet).toHaveClass('-translate-y-[calc(3.25rem+env(safe-area-inset-bottom,0px))]')
      expect(sheet.lastElementChild).toHaveAttribute('hidden')
      // Un toque en el asa la muestra igual.
      fireEvent.click(grip())
      expect(grip()).toHaveAttribute('aria-expanded', 'true')
      view.rerender(mat([PONIX], null, null))
      expect(grip()).toHaveAttribute('aria-expanded', 'true')
      expect(sheet).not.toHaveClass('-translate-y-[calc(3.25rem+env(safe-area-inset-bottom,0px))]')
      // Con el visor de una pila (otra hoja), se esconde.
      view.rerender(mat([PONIX], null, 'hide'))
      expect(sheet).toHaveAttribute('hidden')
    })
  })
})

describe('lo que hizo un eslabón resuelto (`outcome`): un solo chip, en lugar de «Resuelta»', () => {
  const added: ChainNoticeRow = { ...PONIX, state: 'solved', outcome: { label: 'Añade 1 carta', tone: 'success' } }

  it('en la pila del celular y en su nombre accesible, entero; la cinta sigue con el ícono del estado; sin `outcome`, «Resuelta»', () => {
    pill([added, { ...ASH, state: 'solved' }], { focus: 0, resolving: true })
    const row = within(screen.getByRole('list', { name: 'Eslabones de la cadena, en el orden en que se resuelven' })).getByRole('button', { name: /^Eslabón 1:/ })

    expect(row).toHaveAccessibleName('Eslabón 1: Ponix, tuyo. Añade 1 carta')
    expect(within(row).getByText('Añade 1 carta')).toHaveAttribute('data-part', 'chip')
    expect(within(row).queryByText('Resuelta')).toBeNull()
    expect(screen.getByRole('button', { name: 'Eslabón 2: Ash Blossom, del rival. Resuelta' })).toBeInTheDocument()
    expect(screen.getByRole('status')).toHaveTextContent(/Añade 1 carta$/)
    fireEvent.click(screen.getByRole('button', { name: /la hoja/ }))
    const [first, second] = within(screen.getByRole('list', { name: 'Eslabones de la cadena, del primero al último' })).getAllByRole('button')

    expect(first).toHaveAccessibleName('Eslabón 1: Ponix, tuyo. Añade 1 carta')
    expect(first).not.toHaveTextContent('Añade')
    expect(first!.querySelector('svg')!.innerHTML).toBe(second!.querySelector('svg')!.innerHTML)
  })

  it('en escritorio: el eslabón y el resumen de la píldora lo dicen (con movimiento reducido el eslabón resuelto se queda a la vista)', () => {
    vi.stubGlobal('matchMedia', (query: string) => ({ matches: query.includes('reduce'), media: query, addEventListener: () => {}, removeEventListener: () => {} }))
    const { status, rerender } = pill([added], { open: true, compact: false })

    expect(screen.getByRole('button', { name: 'Eslabón 1: Ponix, tuyo. Añade 1 carta' })).toHaveTextContent(/Añade 1 carta$/)
    expect(status).toHaveTextContent(/Añade 1 carta$/)
    rerender([{ ...PONIX, state: 'solved' }])
    expect(screen.getByRole('button', { name: 'Eslabón 1: Ponix, tuyo. Resuelta' })).toHaveTextContent(/Resuelta$/)
  })
})

describe('ChainNotice desde 1101 px', () => {
  it('va en la línea de abajo del campo, como en el celular (no flota ni se pliega): la cuenta, el eslabón del que habla y su estado, y los eslabones', () => {
    const { status } = pill([{ ...PONIX, state: 'disabled', by: 2 }, { ...ASH, state: 'solving' }], { focus: 0, resolving: true, open: true, compact: false })
    const line = screen.getByTestId('chain-notice')
    const list = screen.getByRole('list', { name: /Eslabones de la cadena/ })

    expect(line).toHaveAttribute('data-chain-line')
    expect(status).toHaveTextContent(/^Cadena · 2CL1 · Sin efecto por Ash Blossom$/)
    expect(line).toContainElement(within(list).getByRole('button', { name: /^Eslabón 2: Ash Blossom/ }))
    expect(screen.queryByRole('button', { name: /^(Ocultar|Ver) la cadena$/ })).toBeNull()
  })
})

describe('la línea del celular (`ChainLine`)', () => {
  it('lo negado o sin efecto se lee con el nombre de la carta que lo hizo (TI-172): «Negada por Ash Blossom»; sin saber quién, sólo el estado', () => {
    const line = (rows: ChainNoticeRow[], focus: number) =>
      render(
        <Provider store={store}>
          <ChainLine rows={rows} focus={focus} still onPick={() => {}} />
        </Provider>,
      )

    line([{ ...PONIX, state: 'negated', by: 2 }, { ...ASH, state: 'solving' }], 0)
    expect(screen.getByRole('status')).toHaveTextContent(/^Cadena · 2CL1 · Negada por Ash Blossom$/)
    // El eslabón, angosto, sigue diciendo «por CL2».
    expect(screen.getByRole('button', { name: 'Eslabón 1: Ponix, tuyo. Negada · por CL2' })).toBeInTheDocument()
    line([{ ...PONIX, state: 'disabled' }, { ...ASH, state: 'solving' }], 0)
    expect(screen.getAllByRole('status')[1]).toHaveTextContent(/^Cadena · 2CL1 · Sin efecto$/)
  })
})

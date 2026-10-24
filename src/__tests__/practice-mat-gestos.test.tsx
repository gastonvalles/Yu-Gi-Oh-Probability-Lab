// @vitest-environment jsdom
import { act, fireEvent, render as renderBare, screen, within } from '@testing-library/react'
import '@testing-library/jest-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createMatState, replayMat, type MatAction, type MatState } from '../app/practice-mat'
import { HOLD_MS, useMatDrag, type MatDragSource } from '../app/use-mat-drag'
import type { MatCard } from '../components/probability/PracticeMat'
import { CARDS, Harness, card, hand, pointer, render, status, tap, zone } from './support/practice-mat-harness'

// Los gestos de la mesa: mantener apretada una carta del campo (cambia de posición, sólo en la práctica) y el deck (tocar = buscar, arrastrar = robar, mantener = el menú).

vi.mock('../ygoprodeck', () => ({ fetchCardsByIds: vi.fn(async () => []) }))

beforeEach(() => {
  localStorage.clear()
  HTMLElement.prototype.setPointerCapture = () => {}
  // Con el movimiento reducido la mano se reparte de una (sin esperar a los temporizadores, que acá son de mentira).
  window.matchMedia = ((query: string) => ({ matches: query.includes('reduce'), media: query, addEventListener: () => {}, removeEventListener: () => {}, addListener: () => {}, removeListener: () => {}, onchange: null, dispatchEvent: () => false })) as typeof window.matchMedia
  window.requestAnimationFrame = (callback) => {
    callback(0)
    return 1
  }
  window.cancelAnimationFrame = () => {}
  document.elementFromPoint = () => null
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] })
})

afterEach(() => {
  vi.useRealTimers()
})

const wait = (ms: number) =>
  act(() => {
    vi.advanceTimersByTime(ms)
  })

/** Apretar, esperar y soltar sin moverse: lo que dura la retención (o lo que se pida). */
const hold = (element: HTMLElement, ms = HOLD_MS) => {
  fireEvent.pointerDown(element, { ...pointer, clientX: 10, clientY: 10 })
  wait(ms)
  fireEvent.pointerUp(element, { ...pointer, clientX: 10, clientY: 10 })
}

/** Arrastrar y soltar sobre `target` (lo que devuelve `elementFromPoint`; null = fuera de toda zona). */
const drag = (element: HTMLElement, target: Element | null) => {
  document.elementFromPoint = () => target
  fireEvent.pointerDown(element, { ...pointer, clientX: 10, clientY: 10 })
  fireEvent.pointerMove(element, { ...pointer, clientX: 40, clientY: 60 })
  fireEvent.pointerMove(element, { ...pointer, clientX: 80, clientY: 120 })
  fireEvent.pointerUp(element, { ...pointer, clientX: 80, clientY: 120 })
}

describe('mantener apretado (useMatDrag)', () => {
  const SOURCE: MatDragSource = { id: 'a', name: 'A', art: null, hold: true }

  type Hold = (source: MatDragSource, rect: DOMRect) => boolean

  function Probe({ source = SOURCE, onTap, onHold, onDrop }: { source?: MatDragSource; onTap: () => void; onHold?: Hold; onDrop: (source: MatDragSource, target: unknown) => void }) {
    const { bind } = useMatDrag({ onDrop, onTap, onHold })

    return <div data-testid="probe" {...bind(source)} />
  }

  const setup = (onHold: Hold = () => true, source?: MatDragSource) => {
    const handlers = { onTap: vi.fn(), onHold: vi.fn(onHold), onDrop: vi.fn() }

    renderBare(<Probe source={source} {...handlers} />)
    return { ...handlers, probe: screen.getByTestId('probe') }
  }

  it('a los 450 ms sin moverse dispara la retención, una vez, con la fuente; soltar después ya no es un toque', () => {
    const { probe, onHold, onTap } = setup()

    fireEvent.pointerDown(probe, { ...pointer, clientX: 10, clientY: 10 })
    // Mientras se espera, el indicio (por el DOM, sin dibujar nada de nuevo).
    expect(probe).toHaveAttribute('data-holding', 'true')
    wait(HOLD_MS - 1)
    expect(onHold).not.toHaveBeenCalled()
    wait(1)
    expect(onHold).toHaveBeenCalledTimes(1)
    expect(onHold.mock.calls[0]![0]).toBe(SOURCE)
    expect(probe).not.toHaveAttribute('data-holding')

    // Lo que llega del puntero hasta soltarlo ya no es de nadie: ni arrastre ni toque.
    fireEvent.pointerMove(probe, { ...pointer, clientX: 60, clientY: 90 })
    fireEvent.pointerUp(probe, { ...pointer, clientX: 60, clientY: 90 })
    wait(1000)
    expect(onTap).not.toHaveBeenCalled()
    expect(onHold).toHaveBeenCalledTimes(1)
    expect(HOLD_MS).toBe(450)
  })

  it('soltar antes es un toque como siempre, y la retención ya no llega; el click que el celular manda después de levantar el dedo se corta', () => {
    const { probe, onHold, onTap } = setup()

    fireEvent.pointerDown(probe, { ...pointer, clientX: 10, clientY: 10 })
    wait(300)
    fireEvent.pointerUp(probe, { ...pointer, clientX: 10, clientY: 10 })
    expect(onTap).toHaveBeenCalledTimes(1)
    expect(probe).not.toHaveAttribute('data-holding')
    wait(1000)
    expect(onHold).not.toHaveBeenCalled()
    // `touchend` prevenido: el navegador no manda el click (caería en lo que se acaba de abrir debajo del dedo, como una carta del visor del deck).
    expect(fireEvent.touchEnd(probe)).toBe(false)
  })

  it('moverse más que el umbral del arrastre la cancela: es un arrastre, que se suelta donde caiga', () => {
    const { probe, onHold, onTap, onDrop } = setup()

    fireEvent.pointerDown(probe, { ...pointer, clientX: 10, clientY: 10 })
    // Dentro de la tolerancia (5 px) sigue esperando.
    fireEvent.pointerMove(probe, { ...pointer, clientX: 13, clientY: 14 })
    expect(probe).toHaveAttribute('data-holding', 'true')
    fireEvent.pointerMove(probe, { ...pointer, clientX: 40, clientY: 60 })
    expect(probe).not.toHaveAttribute('data-holding')
    wait(1000)
    expect(onHold).not.toHaveBeenCalled()

    fireEvent.pointerUp(probe, { ...pointer, clientX: 40, clientY: 60 })
    expect(onTap).not.toHaveBeenCalled()
    // Fuera de toda zona: se suelta igual, en ningún lado (null).
    expect(onDrop).toHaveBeenCalledWith(SOURCE, null)
  })

  it('sin nada que hacer (la retención devuelve false) la pulsación sigue: soltar es un toque', () => {
    const { probe, onHold, onTap } = setup(() => false)

    hold(probe, 800)
    expect(onHold).toHaveBeenCalledTimes(1)
    expect(onTap).toHaveBeenCalledTimes(1)
  })

  it('una fuente sin `hold` no espera nada ni lleva el indicio; si el navegador corta la pulsación, no hay ni retención ni toque', () => {
    const plain = setup(() => true, { id: 'b', name: 'B', art: null })

    fireEvent.pointerDown(plain.probe, { ...pointer, clientX: 10, clientY: 10 })
    expect(plain.probe).not.toHaveAttribute('data-holding')
    wait(1000)
    fireEvent.pointerUp(plain.probe, { ...pointer, clientX: 10, clientY: 10 })
    expect(plain.onHold).not.toHaveBeenCalled()
    expect(plain.onTap).toHaveBeenCalledTimes(1)
  })

  it('cortada por el navegador (pointercancel), ni retención ni toque; un arrastre cortado no se suelta en ningún lado', () => {
    const { probe, onHold, onTap, onDrop } = setup()

    fireEvent.pointerDown(probe, { ...pointer, clientX: 10, clientY: 10 })
    fireEvent.pointerCancel(probe, { ...pointer, clientX: 10, clientY: 10 })
    expect(probe).not.toHaveAttribute('data-holding')
    wait(1000)
    expect(onHold).not.toHaveBeenCalled()
    expect(onTap).not.toHaveBeenCalled()

    fireEvent.pointerDown(probe, { ...pointer, clientX: 10, clientY: 10 })
    fireEvent.pointerMove(probe, { ...pointer, clientX: 40, clientY: 60 })
    fireEvent.pointerCancel(probe, { ...pointer, clientX: 40, clientY: 60 })
    expect(onDrop).not.toHaveBeenCalled()
  })
})

const LINK: MatCard = { name: 'Apollousa', apiCard: card(8, 'link') }
const WITH_LINK = new Map<string, MatCard>([...CARDS, ['card-8-1', LINK]])
/** Ash (efecto) en la zona 1, Called by the Grave (Mágica) en la zona de Mágicas y Trampas 2 y un Link en la Zona Extra 1. */
const board = (pos: 'atk' | 'def' | 'set' = 'atk', extra: MatAction[] = []): MatState =>
  replayMat(createMatState(['card-1-1', 'card-2-1', 'card-3-1', 'card-4-1', 'card-5-1', 'card-6-1'], ['card-7-1', 'card-8-1'], 5), [
    { type: 'place', id: 'card-1-1', zone: 'mz', index: 0, pos },
    { type: 'place', id: 'card-3-1', zone: 'st', index: 1, pos: 'atk' },
    { type: 'place', id: 'card-8-1', zone: 'emz', index: 0, pos: 'atk' },
    ...extra,
  ])

describe('mantener apretado un monstruo del campo, en la práctica', () => {
  const ash = (name = 'Ash Blossom') => within(zone('Zona de monstruo 1')).getByRole('button', { name })

  it('lo pasa a defensa y otra vez a ataque sin abrir el menú; cada vez es una jugada (al registro, y se deshace)', () => {
    render(<Harness initial={board()} cards={WITH_LINK} />)

    hold(ash())
    expect(ash('Ash Blossom, en defensa')).toBeInTheDocument()
    expect(screen.queryByRole('menu')).not.toBeInTheDocument()
    expect(within(status()).getByText('Ash Blossom pasa a defensa')).toBeInTheDocument()
    expect(within(status()).getByText('1/1')).toBeInTheDocument()

    hold(ash('Ash Blossom, en defensa'))
    expect(ash()).toBeInTheDocument()
    expect(screen.queryByRole('menu')).not.toBeInTheDocument()
    expect(within(status()).getByText('Ash Blossom pasa a ataque')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Deshacer' }))
    expect(ash('Ash Blossom, en defensa')).toBeInTheDocument()
  })

  it('boca abajo, la primera opción de su menú: la Invocación por Volteo', () => {
    render(<Harness initial={board('set')} cards={WITH_LINK} />)

    hold(ash('Ash Blossom, boca abajo'))
    expect(ash()).toBeInTheDocument()
    expect(within(status()).getByText('Invocación por Volteo de Ash Blossom')).toBeInTheDocument()
  })

  it('mientras se espera, la carta lleva el indicio; un toque corto abre el menú como siempre', () => {
    render(<Harness initial={board()} cards={WITH_LINK} />)

    fireEvent.pointerDown(ash(), { ...pointer, clientX: 10, clientY: 10 })
    expect(ash()).toHaveAttribute('data-holding', 'true')
    wait(150)
    fireEvent.pointerUp(ash(), { ...pointer, clientX: 10, clientY: 10 })
    expect(ash()).not.toHaveAttribute('data-holding')
    expect(screen.getByRole('menu', { name: 'Ash Blossom' })).toBeInTheDocument()
    expect(within(status()).queryByText('1/1')).not.toBeInTheDocument()
  })

  it('un Link y una Mágica no tienen nada que hacer al mantenerlos: no llevan el indicio y al soltarlos se abre su menú (el del Link, sin defensa)', () => {
    render(<Harness initial={board()} cards={WITH_LINK} />)

    const link = within(zone('Zona extra de monstruo 1')).getByRole('button', { name: 'Apollousa' })
    fireEvent.pointerDown(link, { ...pointer, clientX: 10, clientY: 10 })
    expect(link).not.toHaveAttribute('data-holding')
    wait(HOLD_MS * 2)
    fireEvent.pointerUp(link, { ...pointer, clientX: 10, clientY: 10 })
    expect(link).toHaveAccessibleName('Apollousa')
    const menu = screen.getByRole('menu', { name: 'Apollousa' })
    expect(within(menu).queryByRole('menuitem', { name: 'Pasar a defensa' })).not.toBeInTheDocument()
    expect(within(menu).queryByRole('menuitem', { name: 'Poner boca abajo' })).not.toBeInTheDocument()
    fireEvent.keyDown(document, { key: 'Escape' })

    hold(within(zone('Zona de magia y trampa 2')).getByRole('button', { name: 'Called by the Grave' }), HOLD_MS * 2)
    expect(screen.getByRole('menu', { name: 'Called by the Grave' })).toBeInTheDocument()
    expect(within(status()).queryByText('1/1')).not.toBeInTheDocument()
  })

  it('eligiendo Sacrificios, mantenerlo es tocarlo: lo elige y no cambia de posición', () => {
    const big: MatCard = { name: 'Monstruo grande', apiCard: { ...card(9, 'effect'), level: 5 } }
    const initial = replayMat(createMatState(['card-9-1', 'card-1-1', 'card-2-1', 'card-3-1', 'card-4-1', 'card-5-1'], ['card-7-1'], 5), [{ type: 'place', id: 'card-1-1', zone: 'mz', index: 0, pos: 'atk' }])
    render(<Harness initial={initial} cards={new Map([...CARDS, ['card-9-1', big]])} />)

    tap(within(hand()).getByRole('listitem', { name: 'Monstruo grande' }))
    fireEvent.click(screen.getByRole('menuitem', { name: 'Invocación Normal' }))
    expect(within(status()).getByText('Tocá el monstruo para sacrificar (0/1)')).toBeInTheDocument()

    fireEvent.pointerDown(ash(), { ...pointer, clientX: 10, clientY: 10 })
    expect(ash()).not.toHaveAttribute('data-holding')
    wait(HOLD_MS * 2)
    fireEvent.pointerUp(ash(), { ...pointer, clientX: 10, clientY: 10 })
    expect(within(status()).getByText('Tocá la zona para Invocación Normal')).toBeInTheDocument()
    // Elegido como Sacrificio (su zona, que se libera, ya se puede elegir) y en ataque, como estaba.
    expect(screen.getByRole('button', { name: 'Ash Blossom (Sacrificio)' })).toBeInTheDocument()
    expect(within(status()).queryByText(/pasa a defensa/)).not.toBeInTheDocument()
  })

  it('arrastrarlo a otra zona no dispara la retención: se mueve como está', () => {
    render(<Harness initial={board()} cards={WITH_LINK} />)

    const target = zone('Zona de monstruo 3')
    drag(ash(), target)
    wait(HOLD_MS * 2)
    expect(within(target).getByRole('button', { name: 'Ash Blossom' })).toBeInTheDocument()
    expect(within(status()).getByText('Movés Ash Blossom de zona')).toBeInTheDocument()
  })
})

describe('el deck: tocar es buscar, arrastrar es robar y mantenerlo apretado abre el menú', () => {
  // Dos en la mano y cuatro en el deck (Nibiru arriba).
  const FOUR = createMatState(['card-1-1', 'card-2-1', 'card-4-1', 'card-5-1', 'card-6-1', 'card-3-1'], ['card-7-1'], 2)
  const deck = () => screen.getByRole('button', { name: /^Main: \d+$/ })

  it('tocarlo abre el visor del deck, directo; dice en su título qué hace cada gesto', () => {
    render(<Harness initial={FOUR} />)

    expect(deck()).toHaveAttribute('title', 'Main Deck · Tocá: buscar · Arrastrá: robar · Mantené: opciones')
    tap(deck())
    expect(screen.getByRole('dialog', { name: 'Main · 4' })).toBeInTheDocument()
    expect(screen.queryByRole('menu')).not.toBeInTheDocument()
  })

  it('con el visor abierto el campo sigue vivo: jugar una carta de la mano no lo cierra ni baraja (una sola jugada); pasar a otra pila cambia lo que muestra y baraja el deck una vez', () => {
    render(<Harness initial={FOUR} />)

    tap(deck())
    expect(screen.getByRole('dialog', { name: 'Main · 4' })).toBeInTheDocument()
    tap(within(hand()).getByRole('listitem', { name: 'Ash Blossom' }))
    fireEvent.click(screen.getByRole('menuitem', { name: 'Descartar' }))
    expect(screen.getByRole('dialog', { name: 'Main · 4' })).toBeInTheDocument()
    expect(within(status()).getByText('1/1')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'GY: 1' }))
    expect(screen.queryByRole('dialog', { name: 'Main · 4' })).not.toBeInTheDocument()
    expect(screen.getByRole('dialog', { name: 'GY · 1' })).toBeInTheDocument()
    expect(within(status()).getByText('2/2')).toBeInTheDocument()
  })

  it('vacío, el visor igual se abre (como las otras pilas) y cerrarlo no anota un barajado', () => {
    render(<Harness initial={createMatState(['card-1-1', 'card-2-1'], [], 2)} />)

    tap(screen.getByRole('button', { name: 'Main: 0' }))
    const viewer = screen.getByRole('dialog', { name: 'Main · 0' })
    expect(within(viewer).getByText('No hay cartas acá.')).toBeInTheDocument()
    fireEvent.click(within(viewer).getByRole('button', { name: 'Cerrar' }))
    expect(within(status()).queryByText('1/1')).not.toBeInTheDocument()
  })

  it('mantenerlo apretado abre el menú de opciones (no el visor), que soltar no cierra; con el teclado también se abre', () => {
    render(<Harness initial={FOUR} />)

    fireEvent.pointerDown(deck(), { ...pointer, clientX: 10, clientY: 10 })
    expect(deck()).toHaveAttribute('data-holding', 'true')
    wait(HOLD_MS)
    expect(screen.getAllByRole('menuitem').map((item) => item.textContent)).toEqual(['Robar', 'Revelar el tope', 'Mandar al cementerio', 'Desterrar el tope', 'Ver el deck', 'Barajar'])
    fireEvent.pointerUp(deck(), { ...pointer, clientX: 10, clientY: 10 })
    expect(screen.getByRole('menuitem', { name: 'Robar' })).toBeInTheDocument()
    expect(screen.queryByRole('dialog', { name: 'Main · 4' })).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('menuitem', { name: 'Robar' }))
    expect(within(status()).getByText('Robás Nibiru')).toBeInTheDocument()

    fireEvent.keyDown(deck(), { key: 'Enter' })
    expect(screen.getByRole('menuitem', { name: 'Barajar' })).toBeInTheDocument()
  })

  it('arrastrar el tope y soltarlo fuera de toda zona, o en la mano, roba; en el cementerio y el destierro hace lo de siempre, en otra pila o en el deck mismo nada, y en una zona libre pregunta cómo sale', () => {
    render(<Harness initial={FOUR} />)

    drag(deck(), null)
    expect(within(status()).getByText('Robás Nibiru')).toBeInTheDocument()
    expect(within(hand()).getByRole('listitem', { name: 'Nibiru' })).toBeInTheDocument()

    drag(deck(), document.querySelector('[data-drop="hand"]'))
    expect(within(status()).getByText('Robás Droll')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Main: 2' })).toBeInTheDocument()

    drag(deck(), screen.getByRole('button', { name: 'GY: 0' }))
    expect(within(status()).getByText('Mandás Imperm del deck al cementerio')).toBeInTheDocument()

    // En el Extra o soltado otra vez sobre el deck (arrepentido) no pasa nada.
    drag(deck(), screen.getByRole('button', { name: 'Extra: 1' }))
    drag(deck(), deck())
    expect(within(status()).getByText('3/3')).toBeInTheDocument()

    drag(deck(), screen.getByRole('button', { name: 'Banish: 0' }))
    expect(within(status()).getByText('Desterrás Called by the Grave')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Main: 0' })).toBeInTheDocument()
  })

  it('arrastrado a una zona libre, el tope queda ahí y pregunta cómo sale (lo de siempre); ni el arrastre ni soltarlo abren el menú del deck', () => {
    render(<Harness initial={FOUR} />)

    const mz2 = zone('Zona de monstruo 2')
    drag(deck(), mz2)
    wait(HOLD_MS * 2)
    expect(mz2.querySelector('[data-pending="true"]')).toHaveAttribute('data-card-id', 'card-4-1')
    expect(within(screen.getByRole('menu', { name: 'Nibiru' })).getByRole('menuitem', { name: 'Invocación Especial' })).toBeInTheDocument()
    expect(screen.queryByRole('menuitem', { name: 'Robar' })).not.toBeInTheDocument()
  })
})

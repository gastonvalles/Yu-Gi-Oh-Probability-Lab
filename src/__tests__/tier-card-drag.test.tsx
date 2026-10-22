// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import '@testing-library/jest-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { addCards, moveCard, newList, type MakerCard, type MakerList } from '../app/tierlist-maker'
import { MOUSE_DRAG_THRESHOLD_PX, TOUCH_DRAG_DELAY_MS, TOUCH_SCROLL_SLOP_PX } from '../app/use-deck-pointer-drag'
import { cardDropAt, type DropZone } from '../app/use-tier-card-drag'
import { TierMakerBoard } from '../components/meta/TierMakerBoard'
import { dragGhost, insertionLine, mockTierLayout, mouseDrag } from './support/tier-board-layout'

// El arte real pide la imagen a la red: acá sólo importa dónde cae cada carta.
vi.mock('../components/CardArt', () => ({ CardArt: () => <img alt="" /> }))

const at = (left: number, top: number) => ({ left, top, right: left + 90, bottom: top + 90 })
/** Una fila con seis cartas en dos renglones (cuatro y dos, desde x = 100) y, abajo, la bandeja vacía. */
const zones: DropZone[] = [
  { key: 'a', box: { left: 0, top: 0, right: 1000, bottom: 200 }, cards: [1, 2, 3, 4, 5, 6].map((id, index) => ({ id, box: at(100 + (index % 4) * 100, Math.floor(index / 4) * 100) })) },
  { key: 'pool', box: { left: 0, top: 200, right: 1000, bottom: 300 }, cards: [] },
]

describe('dónde cae una carta soltada (cardDropAt)', () => {
  it('fuera de todas las filas, en ninguna', () => {
    expect(cardDropAt(zones, 500, -1)).toBeNull()
    expect(cardDropAt(zones, 1001, 50)).toBeNull()
    expect(cardDropAt(zones, 500, 301)).toBeNull()
  })

  it('en una fila vacía va al principio, sin línea (lo dice el aro de la fila)', () => {
    expect(cardDropAt(zones, 500, 250)).toEqual({ key: 'pool', index: 0, line: null })
  })

  it('sobre la mitad izquierda de una carta va antes de ella y sobre la derecha, después; la línea va en el medio del hueco, o pegada a la primera carta', () => {
    expect(cardDropAt(zones, 120, 50)).toEqual({ key: 'a', index: 0, line: { x: 100, top: 0, height: 90 } })
    expect(cardDropAt(zones, 170, 50)).toEqual({ key: 'a', index: 1, line: { x: 195, top: 0, height: 90 } })
    expect(cardDropAt(zones, 310, 50)).toEqual({ key: 'a', index: 2, line: { x: 295, top: 0, height: 90 } })
  })

  it('a la derecha de la última carta de un renglón va después de ella (la línea, pegada a su borde): en el último renglón, al final de la fila', () => {
    expect(cardDropAt(zones, 800, 50)).toEqual({ key: 'a', index: 4, line: { x: 490, top: 0, height: 90 } })
    expect(cardDropAt(zones, 800, 150)).toEqual({ key: 'a', index: 6, line: { x: 290, top: 100, height: 90 } })
  })

  it('entiende los renglones: en el segundo, el lugar sale de sus cartas y no de las de arriba; sobre el recuadro de color, al principio del renglón', () => {
    expect(cardDropAt(zones, 120, 150)).toEqual({ key: 'a', index: 4, line: { x: 100, top: 100, height: 90 } })
    expect(cardDropAt(zones, 240, 150)).toEqual({ key: 'a', index: 5, line: { x: 195, top: 100, height: 90 } })
    expect(cardDropAt(zones, 20, 150)).toEqual({ key: 'a', index: 4, line: { x: 100, top: 100, height: 90 } })
  })

  it('en el aire entre dos renglones cuenta el de arriba, y los bordes de la fila son de la fila', () => {
    expect(cardDropAt(zones, 120, 95)?.index).toBe(0)
    expect(cardDropAt(zones, 0, 0)).toMatchObject({ key: 'a', index: 0 })
    expect(cardDropAt(zones, 1000, 200)).toMatchObject({ key: 'a', index: 6 })
  })
})

const card = (id: number): MakerCard => ({ id, name: `C${id}`, image: null })

/** S con 1, 2 y 3 (un renglón), A a F vacías y en «Sin clasificar» 4 a 9 (dos renglones). Con el layout de prueba: S de 0 a 100, A de 100 a 200… y la bandeja de 700 a 900. */
function sample(): MakerList {
  const list = addCards(newList('Prueba', 'prueba'), [1, 2, 3, 4, 5, 6, 7, 8, 9].map(card))

  return [1, 2, 3].reduce((current, id) => moveCard(current, id, { kind: 'tier', id: list.tiers[0]?.id ?? '' }), list)
}

function setup() {
  const list = sample()
  const onMove = vi.fn()
  const onSelect = vi.fn()

  render(<TierMakerBoard list={list} selectedId={null} onSelect={onSelect} onMove={onMove} onRemoveCard={vi.fn()} onEditTier={vi.fn()} onMoveTier={vi.fn()} />)

  return { onMove, onSelect, S: { kind: 'tier', id: list.tiers[0]?.id }, A: { kind: 'tier', id: list.tiers[1]?.id } }
}

const tile = (id: number) => screen.getByRole('button', { name: `Carta C${id}` })
const cardsOf = (name: string) => screen.getByRole('region', { name }).querySelector('ul') as HTMLElement
const down = (element: HTMLElement, x: number, y: number, pointerType = 'mouse', pointerId = 1) => fireEvent.pointerDown(element, { pointerId, pointerType, button: 0, buttons: 1, clientX: x, clientY: y })
const move = (element: HTMLElement, x: number, y: number, pointerType = 'mouse', pointerId = 1) => fireEvent.pointerMove(element, { pointerId, pointerType, buttons: 1, clientX: x, clientY: y })
const up = (element: HTMLElement, x: number, y: number, pointerType = 'mouse', pointerId = 1) => fireEvent.pointerUp(element, { pointerId, pointerType, button: 0, clientX: x, clientY: y })

let frames: FrameRequestCallback[] = []
let layout: ReturnType<typeof mockTierLayout>

/** Corre un cuadro (`requestAnimationFrame`): es cuando el fantasma, la línea y el aro siguen al puntero. */
const nextFrame = () =>
  act(() => {
    const due = frames

    frames = []
    due.forEach((run) => run(performance.now()))
  })

beforeEach(() => {
  frames = []
  vi.stubGlobal('requestAnimationFrame', (run: FrameRequestCallback) => frames.push(run))
  vi.stubGlobal('cancelAnimationFrame', () => {})
  layout = mockTierLayout()
})

afterEach(() => {
  cleanup()
  layout.restore()
  vi.unstubAllGlobals()
  vi.useRealTimers()
})

describe('arrastrar una carta del creador con el mouse, como en el builder', () => {
  it(`recién al moverla ${MOUSE_DRAG_THRESHOLD_PX} px se levanta: el fantasma, del tamaño de la carta y agarrado desde donde se la tocó, sigue al puntero, y ella queda atenuada en su lugar`, () => {
    setup()

    const source = tile(4)

    // La 4 está en (100, 700): se la agarra a 20 px de su esquina.
    down(source, 120, 720)
    move(source, 120 + MOUSE_DRAG_THRESHOLD_PX - 1, 720)
    expect(dragGhost()).toBeNull()

    move(source, 120 + MOUSE_DRAG_THRESHOLD_PX, 720)

    const ghost = dragGhost()

    expect(ghost).toHaveAttribute('aria-hidden', 'true')
    expect(ghost).toHaveClass('pointer-events-none', 'fixed', 'opacity-70')
    expect(ghost).toHaveStyle({ width: '90px', height: '90px' })
    expect(ghost?.style.transform).toBe(`translate3d(${100 + MOUSE_DRAG_THRESHOLD_PX}px, 700px, 0)`)
    expect(source).toHaveClass('opacity-40')

    move(source, 300, 50)
    nextFrame()
    expect(ghost?.style.transform).toBe('translate3d(280px, 30px, 0)')
  })

  it('con el lápiz también: se levanta al moverlo, sin esperar', () => {
    setup()
    down(tile(4), 145, 745, 'pen')
    move(tile(4), 145, 745 + MOUSE_DRAG_THRESHOLD_PX, 'pen')
    expect(dragGhost()).not.toBeNull()
  })

  it('la fila de abajo lleva el aro ámbar y una línea ámbar marca el hueco donde entra; en una fila vacía, sólo el aro; en su propio lugar, el aro sin línea; fuera del tablero, nada', () => {
    setup()

    const source = tile(4)

    down(source, 145, 745)
    // Sobre S, entre la 1 y la 2.
    move(source, 205, 50)
    nextFrame()
    expect(cardsOf('S')).toHaveClass('shadow-focus')
    expect(cardsOf('Sin clasificar')).not.toHaveClass('shadow-focus')
    expect(insertionLine()?.hidden).toBe(false)
    expect(insertionLine()).toHaveClass('bg-info')
    expect(insertionLine()?.style.transform).toBe('translate3d(195px, 0px, 0)')
    expect(insertionLine()?.style.height).toBe('90px')

    // A, vacía.
    move(source, 500, 150)
    nextFrame()
    expect(cardsOf('A')).toHaveClass('shadow-focus')
    expect(cardsOf('S')).not.toHaveClass('shadow-focus')
    expect(insertionLine()?.hidden).toBe(true)

    // Sobre ella misma, en la bandeja.
    move(source, 140, 745)
    nextFrame()
    expect(cardsOf('Sin clasificar')).toHaveClass('shadow-focus')
    expect(insertionLine()?.hidden).toBe(true)

    // A la derecha del tablero.
    move(source, 1200, 150)
    nextFrame()
    expect(document.querySelector('ul.shadow-focus')).toBeNull()
    expect(insertionLine()?.hidden).toBe(true)
  })

  it('al soltarla, la lleva a esa fila antes de la carta de ese lugar (al final si no hay ninguna), a una fila vacía, a la bandeja o a otro lugar de su fila', () => {
    const { onMove, S, A } = setup()

    mouseDrag(tile(4), { x: 205, y: 50 })
    expect(onMove).toHaveBeenLastCalledWith(4, S, 2)

    mouseDrag(tile(5), { x: 120, y: 50 })
    expect(onMove).toHaveBeenLastCalledWith(5, S, 1)

    mouseDrag(tile(6), { x: 800, y: 50 })
    expect(onMove).toHaveBeenLastCalledWith(6, S, undefined)

    mouseDrag(tile(7), { x: 500, y: 150 })
    expect(onMove).toHaveBeenLastCalledWith(7, A, undefined)

    // De S a la bandeja, a la derecha de su último renglón: al final.
    mouseDrag(tile(1), { x: 500, y: 850 })
    expect(onMove).toHaveBeenLastCalledWith(1, { kind: 'pool' }, undefined)

    // Dentro de S: la 3 antes de la 1.
    mouseDrag(tile(3), { x: 120, y: 50 })
    expect(onMove).toHaveBeenLastCalledWith(3, S, 1)
    expect(onMove).toHaveBeenCalledTimes(6)
    expect(dragGhost()).toBeNull()
    expect(document.querySelector('ul.shadow-focus')).toBeNull()
  })

  it('soltarla en su propio lugar (sobre ella o en el hueco de al lado) o fuera del tablero no la mueve, y el botón derecho no la arrastra', () => {
    const { onMove } = setup()

    // La 2 está en (200, 0): su centro, en x = 245.
    mouseDrag(tile(2), { x: 240, y: 60 })
    mouseDrag(tile(2), { x: 260, y: 60 })
    mouseDrag(tile(2), { x: 1200, y: 60 })

    fireEvent.pointerDown(tile(2), { pointerId: 9, pointerType: 'mouse', button: 2, clientX: 245, clientY: 45 })
    move(tile(2), 500, 150, 'mouse', 9)
    expect(dragGhost()).toBeNull()
    up(tile(2), 500, 150, 'mouse', 9)

    expect(onMove).not.toHaveBeenCalled()
  })

  it('Escape la deja donde estaba: se van el fantasma, el aro y la línea; soltarla después no la mueve y el clic no la elige', () => {
    const { onMove, onSelect } = setup()

    const source = tile(4)

    down(source, 145, 745)
    move(source, 205, 50)
    nextFrame()
    expect(dragGhost()).not.toBeNull()

    fireEvent.keyDown(window, { key: 'Escape' })
    expect(dragGhost()).toBeNull()
    expect(insertionLine()).toBeNull()
    expect(document.querySelector('ul.shadow-focus')).toBeNull()
    expect(source).not.toHaveClass('opacity-40')

    move(source, 500, 150)
    expect(dragGhost()).toBeNull()
    up(source, 500, 150)
    fireEvent.click(source)

    expect(onMove).not.toHaveBeenCalled()
    expect(onSelect).not.toHaveBeenCalled()
  })

  it('un toque sin moverla (o moviéndola menos que el umbral) la elige; el clic que deja un arrastre no; el siguiente toque sí', () => {
    const { onSelect } = setup()

    const source = tile(4)

    down(source, 145, 745)
    move(source, 148, 747)
    up(source, 148, 747)
    fireEvent.click(source)
    expect(onSelect).toHaveBeenLastCalledWith(4)

    onSelect.mockClear()
    mouseDrag(source, { x: 500, y: 150 })
    expect(onSelect).not.toHaveBeenCalled()

    fireEvent.click(source)
    expect(onSelect).toHaveBeenLastCalledWith(4)
  })

  it('cerca del borde de abajo (contando la barra del celular) o del de arriba, la página se desplaza sola en cada cuadro', () => {
    setup()

    const source = tile(4)

    down(source, 145, 745)
    move(source, 500, 400)
    nextFrame()
    expect(layout.scrolls).toEqual([])

    // A 78 px del borde de abajo de la ventana: fuera de la franja de 72 px, pero adentro si se cuenta la barra de abajo del celular.
    move(source, 500, window.innerHeight - 78)
    nextFrame()
    nextFrame()
    expect(layout.scrolls).toHaveLength(2)
    expect(layout.scrolls.every(([x, y]) => x === 0 && y > 0)).toBe(true)

    move(source, 500, 10)
    nextFrame()
    expect(layout.scrolls.at(-1)?.[1]).toBeLessThan(0)
  })
})

describe('arrastrar una carta del creador con el dedo, como en el builder', () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] })
  })

  it(`no se levanta antes de ${TOUCH_DRAG_DELAY_MS} ms (aunque el dedo tiemble un poco) y la página se puede desplazar; mantenida ese tiempo, se levanta, la página deja de desplazarse y se la suelta en otra fila`, () => {
    const { onMove, onSelect, A } = setup()

    const source = tile(4)

    down(source, 145, 745, 'touch', 2)
    move(source, 148, 748, 'touch', 2)
    // `fireEvent` devuelve `false` si el evento se canceló: antes de levantarla, el desplazamiento de la página no se toca.
    expect(fireEvent.touchMove(source)).toBe(true)

    act(() => {
      vi.advanceTimersByTime(TOUCH_DRAG_DELAY_MS - 1)
    })
    expect(dragGhost()).toBeNull()

    act(() => {
      vi.advanceTimersByTime(1)
    })
    expect(dragGhost()).not.toBeNull()
    // Late una vez, como en el builder.
    expect(source).toHaveAttribute('data-drag-armed', 'true')
    expect(fireEvent.touchMove(source)).toBe(false)

    move(source, 500, 150, 'touch', 2)
    up(source, 500, 150, 'touch', 2)

    expect(onMove).toHaveBeenLastCalledWith(4, A, undefined)
    expect(dragGhost()).toBeNull()
    expect(source).not.toHaveAttribute('data-drag-armed')
    expect(onSelect).not.toHaveBeenCalled()
  })

  it(`si el dedo se desliza más de ${TOUCH_SCROLL_SLOP_PX} px antes de tiempo es un desplazamiento: no se levanta, ni después`, () => {
    const { onMove } = setup()

    const source = tile(4)

    down(source, 145, 745, 'touch', 3)
    move(source, 145, 745 - TOUCH_SCROLL_SLOP_PX - 1, 'touch', 3)
    act(() => {
      vi.advanceTimersByTime(TOUCH_DRAG_DELAY_MS * 2)
    })
    expect(dragGhost()).toBeNull()
    expect(fireEvent.touchMove(source)).toBe(true)

    move(source, 500, 150, 'touch', 3)
    up(source, 500, 150, 'touch', 3)
    expect(onMove).not.toHaveBeenCalled()
  })

  it('mantenerla apretada sin moverla y soltarla no la cambia de lugar; soltarla fuera del tablero, tampoco', () => {
    const { onMove } = setup()

    const source = tile(4)

    down(source, 145, 745, 'touch', 4)
    act(() => {
      vi.advanceTimersByTime(TOUCH_DRAG_DELAY_MS)
    })
    up(source, 145, 745, 'touch', 4)

    down(source, 145, 745, 'touch', 5)
    act(() => {
      vi.advanceTimersByTime(TOUCH_DRAG_DELAY_MS)
    })
    move(source, 1200, 150, 'touch', 5)
    up(source, 1200, 150, 'touch', 5)

    expect(onMove).not.toHaveBeenCalled()
  })
})

// @vitest-environment jsdom
import { act, cleanup, fireEvent, renderHook } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'

import type { CardPeek } from '../components/duel/DuelCardDock'
import { useDockPeek } from '../components/duel/use-dock-peek'
import type { ApiCardReference } from '../types'

afterEach(() => {
  cleanup()
  document.body.innerHTML = ''
})

const card = (ygoprodeckId: number) => ({ ygoprodeckId }) as ApiCardReference
const peekOf = (ygoprodeckId: number, name = `Carta ${ygoprodeckId}`): CardPeek => ({ name, card: card(ygoprodeckId) })
const nameOf = (peek: CardPeek | null) => (peek && 'name' in peek ? peek.name : null)

describe('el detalle fijo: la carta del mouse, y la del click mientras no se haga click afuera', () => {
  it('sin nada fijo muestra la última carta a la que se le pasó el mouse, también si se lo saca', () => {
    const { result } = renderHook(() => useDockPeek())

    expect(result.current.shown).toBeNull()

    act(() => result.current.hover(peekOf(1)))
    expect(nameOf(result.current.shown)).toBe('Carta 1')

    act(() => result.current.hover(peekOf(2)))
    expect(nameOf(result.current.shown)).toBe('Carta 2')
    expect(result.current.locked).toBe(false)
  })

  it('un click la fija: pasar el mouse por otras no la cambia; se ve la fija hasta soltarla', () => {
    const { result } = renderHook(() => useDockPeek())

    act(() => result.current.hover(peekOf(1)))
    act(() => result.current.lock(peekOf(1)))
    expect(result.current.locked).toBe(true)

    act(() => result.current.hover(peekOf(2)))
    act(() => result.current.hover(peekOf(3)))
    expect(nameOf(result.current.shown)).toBe('Carta 1')
  })

  it('un click afuera (que no sea una carta ni el panel) la suelta y vuelve la última a la que se le pasó el mouse', () => {
    const outside = document.body.appendChild(document.createElement('div'))
    const { result } = renderHook(() => useDockPeek())

    act(() => result.current.lock(peekOf(1)))
    act(() => result.current.hover(peekOf(2)))
    expect(nameOf(result.current.shown)).toBe('Carta 1')

    fireEvent.pointerDown(outside)
    expect(result.current.locked).toBe(false)
    expect(nameOf(result.current.shown)).toBe('Carta 2')
  })

  it('tocar el panel (para leer o desplazar el texto) o una carta propia o del rival no la suelta por sí solo', () => {
    const dock = document.body.appendChild(document.createElement('section'))
    const inDock = dock.appendChild(document.createElement('p'))
    const own = document.body.appendChild(document.createElement('div'))
    const rival = document.body.appendChild(document.createElement('div'))

    dock.setAttribute('data-card-dock', '')
    own.setAttribute('data-card-id', 'card-1-1')
    rival.setAttribute('data-rival-card-id', 'c9')

    const { result } = renderHook(() => useDockPeek())

    act(() => result.current.lock(peekOf(1)))

    fireEvent.pointerDown(inDock)
    fireEvent.pointerDown(own)
    fireEvent.pointerDown(rival)
    expect(result.current.locked).toBe(true)
    expect(nameOf(result.current.shown)).toBe('Carta 1')
  })

  it('tocar la carta en grande que se abre desde el detalle (está afuera del panel, en el cuerpo de la página) no la suelta', () => {
    const zoom = document.body.appendChild(document.createElement('div'))
    const inZoom = zoom.appendChild(document.createElement('img'))

    zoom.setAttribute('data-card-zoom', '')

    const { result } = renderHook(() => useDockPeek())

    act(() => result.current.lock(peekOf(1)))
    fireEvent.pointerDown(inZoom)
    fireEvent.pointerDown(zoom)
    expect(result.current.locked).toBe(true)
    expect(nameOf(result.current.shown)).toBe('Carta 1')
  })

  it('apretar el borde de un panel para cambiarle el ancho (`ResizeHandle`) no la suelta', () => {
    const edge = document.body.appendChild(document.createElement('div'))

    edge.setAttribute('data-panel-resizer', '')

    const { result } = renderHook(() => useDockPeek())

    act(() => result.current.lock(peekOf(1)))
    fireEvent.pointerDown(edge)
    expect(result.current.locked).toBe(true)
    expect(nameOf(result.current.shown)).toBe('Carta 1')
  })

  it('un click en otra carta la fija a ésa; y la del rival (por su id real, o boca abajo) funciona igual', () => {
    const { result } = renderHook(() => useDockPeek())

    act(() => result.current.lock(peekOf(1)))
    act(() => result.current.lock(peekOf(2)))
    expect(nameOf(result.current.shown)).toBe('Carta 2')

    act(() => result.current.lock({ drawId: 'card-77-1' }))
    expect(result.current.shown).toEqual({ drawId: 'card-77-1' })
    act(() => result.current.hover({ faceDown: true }))
    expect(result.current.shown).toEqual({ drawId: 'card-77-1' })

    act(() => result.current.lock({ faceDown: true }))
    expect(result.current.shown).toEqual({ faceDown: true })
  })

  it('pasar el mouse otra vez por la misma carta no vuelve a dibujar el detalle (devuelve lo mismo)', () => {
    const { result } = renderHook(() => useDockPeek())

    act(() => result.current.hover(peekOf(1)))

    const first = result.current.shown

    act(() => result.current.hover(peekOf(1)))
    expect(result.current.shown).toBe(first)

    act(() => result.current.hover({ faceDown: true }))
    const back = result.current.shown

    act(() => result.current.hover({ faceDown: true }))
    expect(result.current.shown).toBe(back)
  })

  it('el oyente de afuera sólo existe mientras hay una carta fija', () => {
    const outside = document.body.appendChild(document.createElement('div'))
    const { result } = renderHook(() => useDockPeek())

    // Sin carta fija un click afuera no cambia nada (ni tiene qué soltar).
    act(() => result.current.hover(peekOf(1)))
    fireEvent.pointerDown(outside)
    expect(nameOf(result.current.shown)).toBe('Carta 1')
    expect(result.current.locked).toBe(false)
  })
})

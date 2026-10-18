import { describe, expect, it, vi } from 'vitest'

import { buildCardNavigation, buildZoneNavigation, neighborsAt } from '../app/card-neighbors'
import type { DeckCardInstance } from '../app/model'

describe('vecinos de una carta en su lista', () => {
  it('da la anterior y la siguiente, sin dar la vuelta en las puntas', () => {
    const ids = [10, 20, 30]

    expect(neighborsAt(ids, 0)).toEqual({ previous: null, next: 20 })
    expect(neighborsAt(ids, 1)).toEqual({ previous: 10, next: 30 })
    expect(neighborsAt(ids, 2)).toEqual({ previous: 20, next: null })
  })

  it('una lista de una sola carta, vacía o con un lugar que no existe no tiene vecinos', () => {
    expect(neighborsAt([7], 0)).toEqual({ previous: null, next: null })
    expect(neighborsAt([], 0)).toEqual({ previous: null, next: null })
    expect(neighborsAt([1, 2], -1)).toEqual({ previous: null, next: null })
    expect(neighborsAt([1, 2], 2)).toEqual({ previous: null, next: null })
  })

  it('salta lo que es lo mismo que la carta de ahora: tres copias son una sola parada', () => {
    const zone = [
      { id: 1, copy: 1 },
      { id: 1, copy: 2 },
      { id: 2, copy: 1 },
      { id: 3, copy: 1 },
      { id: 3, copy: 2 },
    ]
    const sameCard = (a: { id: number }, b: { id: number }) => a.id === b.id

    expect(neighborsAt(zone, 1, sameCard)).toEqual({ previous: null, next: zone[2] })
    expect(neighborsAt(zone, 2, sameCard)).toEqual({ previous: zone[1], next: zone[3] })
    expect(neighborsAt(zone, 4, sameCard)).toEqual({ previous: zone[2], next: null })
  })

  it('arma la navegación del detalle: una flecha apagada donde no hay vecino', () => {
    const onOpen = vi.fn()
    const first = buildCardNavigation(neighborsAt([1, 2, 3], 0), onOpen)

    expect(first.onPrevious).toBeNull()
    first.onNext?.()
    expect(onOpen).toHaveBeenCalledWith(2)

    const last = buildCardNavigation(neighborsAt([1, 2, 3], 2), onOpen)

    expect(last.onNext).toBeNull()
    last.onPrevious?.()
    expect(onOpen).toHaveBeenLastCalledWith(2)
  })

  it('en la última de una lista con más por cargar, «siguiente» pide más en vez de apagarse', () => {
    const loadMore = vi.fn()
    const onOpen = vi.fn()
    const last = buildCardNavigation(neighborsAt([1, 2], 1), onOpen, loadMore)

    last.onNext?.()
    expect(loadMore).toHaveBeenCalledOnce()
    expect(onOpen).not.toHaveBeenCalled()

    // Si hay una siguiente ya cargada, va a ella y no pide nada.
    buildCardNavigation(neighborsAt([1, 2], 0), onOpen, loadMore).onNext?.()
    expect(onOpen).toHaveBeenCalledWith(2)
    expect(loadMore).toHaveBeenCalledOnce()
  })

  it('la navegación de una zona del deck salta las copias de la carta abierta y no sale de la zona', () => {
    const copy = (instanceId: string, ygoprodeckId: number) => ({ instanceId, apiCard: { ygoprodeckId } }) as DeckCardInstance
    const zone = [copy('a1', 1), copy('a2', 1), copy('b1', 2), copy('c1', 3)]
    const opened: string[] = []
    const onOpen = (card: DeckCardInstance) => opened.push(card.instanceId)

    const fromSecondA = buildZoneNavigation(zone, 'a2', onOpen)

    expect(fromSecondA.onPrevious).toBeNull()
    fromSecondA.onNext?.()
    expect(opened).toEqual(['b1'])

    const fromB = buildZoneNavigation(zone, 'b1', onOpen)

    fromB.onPrevious?.()
    fromB.onNext?.()
    expect(opened).toEqual(['b1', 'a2', 'c1'])
    expect(buildZoneNavigation(zone, 'c1', onOpen).onNext).toBeNull()
    // Una copia que ya no está en la zona (la quitaron): sin vecinos.
    expect(buildZoneNavigation(zone, 'z9', onOpen)).toEqual({ onPrevious: null, onNext: null })
  })
})

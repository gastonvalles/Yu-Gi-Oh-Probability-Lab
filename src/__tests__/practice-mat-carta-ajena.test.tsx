// @vitest-environment jsdom
import { act, within } from '@testing-library/react'
import '@testing-library/jest-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { createMatState } from '../app/practice-mat'
import { Harness, hand, render } from './support/practice-mat-harness'

// Una carta que no es de tu deck (la que el rival te da, como Angelechy Seneschal) no está en `cardsById`: la mesa la pide entera a YGOPRODeck, y ese pedido puede fallar (la conexión, una
// extensión que bloquea la API). Con el pedido caído la carta tiene que verse igual, con su imagen salida del número que lleva el id, y el pedido se repite en vez de rendirse.

const { fetchCardsByIds } = vi.hoisted(() => ({ fetchCardsByIds: vi.fn() }))

vi.mock('../ygoprodeck', async (importOriginal) => ({ ...(await importOriginal<typeof import('../ygoprodeck')>()), fetchCardsByIds }))

const SENESCHAL = 'card-86673403-1'
/** La mano de cinco con la carta ajena primera; el resto, las de siempre. */
const INITIAL = createMatState([SENESCHAL, 'card-1-1', 'card-2-1', 'card-3-1', 'card-4-1', 'card-5-1'], [], 5)

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] })
  fetchCardsByIds.mockReset()
})

afterEach(() => {
  vi.useRealTimers()
})

const flush = () => act(async () => {})

describe('mesa de práctica · una carta que no es de tu deck', () => {
  it('con el pedido de la carta caído, igual se ve su imagen (por el proxy) y no sus iniciales', async () => {
    fetchCardsByIds.mockRejectedValue(new Error('sin conexión'))
    render(<Harness initial={INITIAL} />)
    await flush()
    // Se reparte la mano (un rato de animación) sin llegar todavía al reintento.
    await act(async () => {
      vi.advanceTimersByTime(3900)
    })

    // Las demás cartas de la mano no llevan arte en el harness: la única imagen es la de la ajena.
    expect(within(hand()).getByRole('img')).toHaveAttribute('src', '/api/card-image/cards_small/86673403.jpg')
  })

  it('si el pedido falla lo repite un rato después y, cuando llega, la carta toma su nombre', async () => {
    fetchCardsByIds.mockRejectedValueOnce(new Error('sin conexión')).mockResolvedValue([{ ygoprodeckId: 86673403, name: 'Angelechy Seneschal', frameType: 'synchro', imageUrlSmall: 'https://images.ygoprodeck.com/images/cards_small/86673403.jpg' }])
    render(<Harness initial={INITIAL} />)
    await flush()

    expect(fetchCardsByIds).toHaveBeenCalledTimes(1)
    expect(within(hand()).queryByRole('img', { name: 'Angelechy Seneschal' })).toBeNull()

    await act(async () => {
      vi.advanceTimersByTime(4000)
    })
    await flush()

    expect(fetchCardsByIds).toHaveBeenCalledTimes(2)
    expect(within(hand()).getByRole('img', { name: 'Angelechy Seneschal' })).toHaveAttribute('src', '/api/card-image/cards_small/86673403.jpg')
  })

  it('no insiste para siempre: tras tres pedidos caídos se rinde', async () => {
    fetchCardsByIds.mockRejectedValue(new Error('sin conexión'))
    render(<Harness initial={INITIAL} />)
    await flush()

    for (let i = 0; i < 5; i += 1) {
      await act(async () => {
        vi.advanceTimersByTime(4000)
      })
      await flush()
    }

    expect(fetchCardsByIds).toHaveBeenCalledTimes(3)
  })
})

// @vitest-environment jsdom
import { act, cleanup, renderHook } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'

import type { DuelSnapshot } from '../app/duel-session'
import { createMatState, type MatAction } from '../app/practice-mat'
import { useDuelFeed } from '../components/duel/use-duel-feed'
import type { MatCard } from '../components/probability/PracticeMat'

afterEach(cleanup)

const deck = Array.from({ length: 12 }, (_, index) => `card-${index + 1}-0`)
const initial = createMatState(deck, [], 5)
const [first, second] = initial.hand as [string, string]
const cardsById = new Map<string, MatCard>(deck.map((id, index) => [id, { name: `Carta ${index + 1}`, apiCard: null } as unknown as MatCard]))
const play = (id: string, type: 'activate' | 'reveal' = 'activate'): MatAction => ({ type, id }) as MatAction

interface Props {
  actions: MatAction[]
  chat?: Array<{ id: number; from: 0 | 1; text: string }>
  turnNumber?: number
  peerActs?: number
  captions?: Array<{ key: number; caption: string } | undefined>
  /** Lo que el rival mostró de sus cartas: su id opaco (`c51`) → el id real de la carta. */
  known?: Record<string, string>
}

const render = (initialProps: Props) =>
  renderHook(
    ({ actions, chat = [], turnNumber = 1, peerActs = 0, captions = [], known = {} }: Props) =>
      useDuelFeed({
        snapshot: { chat, actions, initial, theirs: { acts: Array.from({ length: peerActs }), known } } as unknown as DuelSnapshot,
        cardsById,
        rivalCaptions: captions,
        turn: 'mine',
        turnNumber,
        rivalName: 'Beto',
        myName: 'Ana',
      }),
    { initialProps },
  )

const texts = (entries: ReturnType<typeof useDuelFeed>) => entries.map((entry) => (entry.kind === 'chat' ? `chat: ${entry.line.text}` : entry.text))

describe('el registro del duelo cuando se deshace una jugada', () => {
  it('tu jugada deshecha (el rival permitió volver atrás) desaparece del registro, y la anterior se queda', () => {
    const view = render({ actions: [] })

    view.rerender({ actions: [play(first)] })
    view.rerender({ actions: [play(first), play(second, 'reveal')] })
    expect(view.result.current).toHaveLength(2)

    const kept = texts(view.result.current)[0]

    view.rerender({ actions: [play(first)] })
    expect(texts(view.result.current)).toEqual([kept])

    view.rerender({ actions: [] })
    expect(view.result.current).toHaveLength(0)
  })

  it('volver a jugar después de deshacer anota la jugada nueva, sin dejar la vieja', () => {
    const view = render({ actions: [] })

    view.rerender({ actions: [play(first)] })
    view.rerender({ actions: [] })
    view.rerender({ actions: [play(second, 'reveal')] })

    expect(view.result.current).toHaveLength(1)
    expect(texts(view.result.current)[0]).toContain('Carta')
  })

  it('lo escrito en el chat no se borra al deshacer', () => {
    const view = render({ actions: [], chat: [{ id: 1, from: 1, text: 'hola' }] })

    view.rerender({ actions: [play(first)], chat: [{ id: 1, from: 1, text: 'hola' }] })
    view.rerender({ actions: [], chat: [{ id: 1, from: 1, text: 'hola' }] })

    expect(texts(view.result.current)).toEqual(['chat: hola'])
  })

  it('el comienzo de un turno causado por la jugada deshecha también se va, y al volver a pasar se anota una sola vez', () => {
    const view = render({ actions: [play(first)], turnNumber: 1 })

    view.rerender({ actions: [play(first), play(second, 'reveal')], turnNumber: 2 })
    expect(view.result.current.filter((entry) => entry.kind === 'turn')).toHaveLength(1)

    view.rerender({ actions: [play(first)], turnNumber: 1 })
    expect(view.result.current.filter((entry) => entry.kind === 'turn')).toHaveLength(0)

    view.rerender({ actions: [play(first), play(second, 'reveal')], turnNumber: 2 })
    expect(view.result.current.filter((entry) => entry.kind === 'turn')).toHaveLength(1)
  })

  it('un tropiezo de la sincronización (el turno baja sin que nadie deshaga) no borra el comienzo de turno ni lo repite', () => {
    const view = render({ actions: [play(first)], turnNumber: 1 })

    view.rerender({ actions: [play(first)], turnNumber: 2 })
    view.rerender({ actions: [play(first)], turnNumber: 1 })
    view.rerender({ actions: [play(first)], turnNumber: 2 })

    expect(view.result.current.filter((entry) => entry.kind === 'turn')).toHaveLength(1)
  })

  it('lo que anunció el rival se va cuando él deshace esa jugada', () => {
    const view = render({ actions: [], peerActs: 1, captions: [{ key: 1, caption: 'Beto activa Carta 3' }] })

    // El cartel llega con su jugada ya contada: se anota.
    view.rerender({ actions: [], peerActs: 2, captions: [{ key: 2, caption: 'Beto activa Carta 4' }] })
    expect(texts(view.result.current)).toEqual(['Beto activa Carta 4'])

    // Él deshace la jugada: la línea se va.
    view.rerender({ actions: [], peerActs: 1, captions: [{ key: 2, caption: 'Beto activa Carta 4' }] })
    expect(view.result.current).toHaveLength(0)
  })

  it('deshacer con el registro vacío o una jugada silenciosa (robar) no rompe nada', () => {
    const view = render({ actions: [{ type: 'draw', count: 1 } as MatAction] })

    view.rerender({ actions: [] })
    act(() => undefined)
    expect(view.result.current).toHaveLength(0)
  })
})

describe('el registro del ataque cuando el objetivo es una carta del rival', () => {
  // El objetivo llega con el id opaco con que el rival llama a su carta (`c51`); lo que él mostró de ella está en `known`.
  const attack = (target?: string): MatAction => ({ type: 'attack', id: first, ...(target === undefined ? {} : { target }) }) as MatAction

  it('nombra la carta del rival cuando él la mostró y es de las de tu deck (por su número)', () => {
    const view = render({ actions: [] })

    view.rerender({ actions: [attack('c51')], known: { c51: 'card-3-0' } })

    expect(texts(view.result.current)).toEqual(['Atacás a Carta 3 con Carta 1'])
  })

  it('dice «una carta del rival» si no se sabe cuál es (boca abajo, no la mostró)', () => {
    const view = render({ actions: [] })

    view.rerender({ actions: [attack('c52')], known: {} })

    expect(texts(view.result.current)).toEqual(['Atacás a una carta del rival con Carta 1'])
  })

  it('dice «una carta del rival» si la mostró pero no es de tu deck: su nombre no se conoce acá', () => {
    const view = render({ actions: [] })

    view.rerender({ actions: [attack('c53')], known: { c53: 'card-99-0' } })

    expect(texts(view.result.current)).toEqual(['Atacás a una carta del rival con Carta 1'])
  })

  it('una carta del rival que controlás (f.) sigue nombrándose por la que él mostró', () => {
    const view = render({ actions: [] })

    view.rerender({ actions: [{ type: 'attack', id: 'f.c12' } as MatAction], known: { c12: 'card-4-0' } })

    expect(texts(view.result.current)).toEqual(['Atacás directo con Carta 4'])
  })

  it('tu propia carta como objetivo sigue diciendo su nombre', () => {
    const view = render({ actions: [] })

    view.rerender({ actions: [attack('card-2-0')] })

    expect(texts(view.result.current)).toEqual(['Atacás a Carta 2 con Carta 1'])
  })
})

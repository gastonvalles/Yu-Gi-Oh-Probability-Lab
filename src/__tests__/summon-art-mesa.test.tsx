// @vitest-environment jsdom
import { act, cleanup } from '@testing-library/react'
import { useEffect } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { cardImageSrc } from '../app/card-image-source'
import type { MatAction, MatState } from '../app/practice-mat'
import { SUMMON_ART_MS, burstReplaces, setSummonArt, summonArtFits } from '../app/summon-art'
import { useMatSession } from '../app/use-mat-session'
import { PracticeMat } from '../components/probability/PracticeMat'
import { INITIAL, WITH_ART, render } from './support/practice-mat-harness'

vi.mock('../ygoprodeck', () => ({ fetchCardsByIds: vi.fn(async () => []) }))

/**
 * La beta «Imagen de la carta al invocar» en la mesa (`app/summon-art.ts`): apagada no suma ni un nodo; prendida, la primera Invocación Normal de una carta irrumpe y la segunda no; lo que sale
 * del Extra Deck con su entrada larga, nunca.
 */
let dispatch: (action: MatAction) => void = () => {}
let field: MatState['mz'] = []

function Mesa() {
  const mat = useMatSession()
  const { start } = mat

  useEffect(() => {
    dispatch = mat.dispatch
    field = mat.state?.mz ?? []
  })
  useEffect(() => {
    start(INITIAL, [], {})
  }, [start])
  if (!mat.session || !mat.state) return null
  return <PracticeMat session={mat.session} state={mat.state} cardsById={WITH_ART} deckName="Test" onDispatch={mat.dispatch} onUndo={mat.undo} onSeek={mat.seek} onLoadCombo={() => {}} onNewHand={() => {}} />
}

/** jsdom no anima: una animación de mentira que nunca termina sola. */
function stubAnimate() {
  Element.prototype.animate = function () {
    return { addEventListener: () => {}, removeEventListener: () => {}, cancel: () => {}, finish: () => {}, commitStyles: () => {}, finished: new Promise(() => {}), playState: 'running', effect: null } as unknown as Animation
  }
  Element.prototype.getAnimations = () => []
}

const bursts = () => document.querySelectorAll('[data-fx="summon-art"]')
// Cada jugada a su hora (la mesa marca los efectos con `Date.now()`) y su efecto ya ido.
const play = (action: MatAction) => {
  act(() => vi.advanceTimersByTime(2000))
  act(() => dispatch(action))
}
const normal = (id: string, index: number): MatAction => ({ type: 'place', id, zone: 'mz', index, pos: 'atk', how: 'normal' })

beforeEach(() => {
  vi.useFakeTimers()
  localStorage.clear()
  stubAnimate()
  HTMLElement.prototype.setPointerCapture = () => {}
  window.matchMedia = ((query: string) => ({ matches: false, media: query, addEventListener: () => {}, removeEventListener: () => {}, addListener: () => {}, removeListener: () => {}, onchange: null, dispatchEvent: () => false })) as typeof window.matchMedia
})

afterEach(() => {
  cleanup()
  document.body.innerHTML = ''
  setSummonArt(false)
  delete (Element.prototype as Partial<Element>).animate
  delete (Element.prototype as Partial<Element>).getAnimations
  vi.useRealTimers()
})

describe('la irrupción al invocar (beta) en la mesa', () => {
  it('apagada (de fábrica) no cambia nada: ni un nodo de más', () => {
    render(<Mesa />)
    play(normal('card-1-1', 0))
    const off = document.body.querySelectorAll('*').length

    expect(bursts()).toHaveLength(0)
    cleanup()
    document.body.innerHTML = ''

    // La misma jugada con la beta prendida suma sólo la franja (y sus capas), que es la única diferencia.
    setSummonArt(true)
    render(<Mesa />)
    play(normal('card-1-1', 0))
    const burst = bursts()[0]!

    expect(bursts()).toHaveLength(1)
    expect(document.body.querySelectorAll('*').length - off).toBe(burst.querySelectorAll('*').length + 1)
  })

  it('prendida: la primera vez que la carta se invoca irrumpe con su imagen y la segunda no; no ataja toques', () => {
    setSummonArt(true)
    render(<Mesa />)
    play(normal('card-1-1', 0))

    expect(bursts()).toHaveLength(1)
    expect(bursts()[0]).toHaveProperty('className', expect.stringContaining('pointer-events-none'))
    // La misma dirección que la casilla (por el proxy): nada que bajar de nuevo.
    expect(bursts()[0]!.querySelector('img')!.getAttribute('src')).toBe(cardImageSrc(WITH_ART.get('card-1-1')!.art!))

    // Vuelve a la mano y se invoca de nuevo: la llegada de siempre, sin irrupción.
    document.querySelectorAll('[data-fx="summon-art"]').forEach((element) => element.remove())
    play({ type: 'move', id: 'card-1-1', to: 'hand' })
    play(normal('card-1-1', 1))
    expect(field[1]?.id).toBe('card-1-1')
    expect(bursts()).toHaveLength(0)
    // Otra carta, la suya.
    play({ type: 'place', id: 'card-2-1', zone: 'mz', index: 2, pos: 'atk', how: 'special' })
    expect(bursts()).toHaveLength(1)
    // Colocar no la lleva.
    play({ type: 'place', id: 'card-4-1', zone: 'mz', index: 3, pos: 'set' })
    expect(field[3]?.id).toBe('card-4-1')
    expect(bursts()).toHaveLength(1)
  })

  it('lo del Extra Deck con su entrada larga (y el Péndulo y el Ritual) no la lleva; con «Livianos», nada', () => {
    setSummonArt(true)
    render(<Mesa />)
    play({ type: 'summon', id: 'card-7-1', how: 'xyz', materials: [], zone: 'emz', index: 0, pos: 'atk' })

    expect(document.querySelector('[data-fx="entrance"]')).not.toBeNull()
    expect(bursts()).toHaveLength(0)
    expect(['special', 'tribute', 'pendulum', 'ritual', 'fusion', 'synchro', 'xyz', 'link'].filter((tone) => summonArtFits(tone as 'special'))).toEqual(['special', 'tribute'])

    document.documentElement.setAttribute('data-effects', 'lite')
    play(normal('card-1-1', 0))
    expect(bursts()).toHaveLength(0)
    document.documentElement.removeAttribute('data-effects')
  })

  it('dura menos de un segundo y reemplaza la carta grande del duelo por enlace sólo si es la misma y de ese momento', () => {
    expect(SUMMON_ART_MS).toBeLessThan(1000)
    const effect = { kind: 'normal', key: 10_000, cards: [{ id: 'f.c3' }] }

    expect(burstReplaces(effect, { id: 'f.c3', at: 9_990 })).toBe(true)
    expect(burstReplaces(effect, null)).toBe(false)
    expect(burstReplaces(effect, { id: 'f.c4', at: 9_990 })).toBe(false)
    expect(burstReplaces(effect, { id: 'f.c3', at: 5_000 })).toBe(false)
    expect(burstReplaces({ ...effect, kind: 'activate' }, { id: 'f.c3', at: 9_990 })).toBe(false)
  })
})

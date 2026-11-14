// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest'

import { SHUFFLE_ID, shuffleHand } from '../app/shuffle-fx'

// Gastón: «a veces la animacion de barajado mueve toda la mano de forma rara». Pasaba cuando la mano cambiaba en pleno barajado (robar o buscar otra carta, jugar una, la pantalla que
// cambia): el barajado llevaba en sus cuadros el lugar viejo de cada carta, terminaba ahí y la mano entera saltaba de golpe a su lugar nuevo (medido a 369×800: hasta 49 px en un cuadro).

const original = { animate: Element.prototype.animate, getAnimations: Element.prototype.getAnimations }

afterEach(() => {
  Object.assign(Element.prototype, original)
  document.body.innerHTML = ''
})

/** Una Web Animation de mentira que corre: guarda sus cuadros (y los que se le cambien) y si se cortó. */
function fakeAnimations() {
  const made: Array<{ card: Element; frames: Keyframe[]; cancelled: boolean }> = []

  Element.prototype.animate = function (this: Element, frames: Keyframe[] | PropertyIndexedKeyframes | null, options?: number | KeyframeAnimationOptions) {
    const entry = { card: this, frames: frames as Keyframe[], cancelled: false }
    const animation = {
      id: typeof options === 'object' ? options.id : '',
      get playState() { return entry.cancelled ? 'idle' : 'running' },
      effect: { getKeyframes: () => entry.frames, setKeyframes: (next: Keyframe[]) => void (entry.frames = next) },
      addEventListener() {},
      cancel: () => void (entry.cancelled = true),
    }

    made.push(entry)
    return animation as unknown as Animation
  }
  Element.prototype.getAnimations = function (this: Element) {
    return made.filter((entry) => entry.card === this && !entry.cancelled).map((entry) => ({ id: SHUFFLE_ID, playState: 'running', effect: { getKeyframes: () => entry.frames } }) as unknown as Animation)
  }

  return made
}

function hand(transforms: string[]) {
  return transforms.map((transform) => {
    const card = document.createElement('div')

    card.style.transform = transform
    document.body.append(card)
    return card
  })
}

const settle = () => new Promise((resolve) => setTimeout(resolve, 0))

describe('el barajado de la mano cuando la mano cambia a mitad', () => {
  it('cada carta termina en su lugar nuevo (0 px de diferencia), con el mismo barajado', async () => {
    const made = fakeAnimations()
    const cards = hand(['translate3d(0px, 30px, 0px) rotate(-4deg)', 'translate3d(60px, 28px, 0px) rotate(0deg)', 'translate3d(120px, 30px, 0px) rotate(4deg)'])

    shuffleHand(cards)
    expect(made).toHaveLength(3)

    // Entra una carta: React corre las tres a su lugar nuevo (más juntas) mientras se barajan.
    const next = ['translate3d(0px, 31px, 0px) rotate(-5deg)', 'translate3d(45px, 29px, 0px) rotate(-2deg)', 'translate3d(90px, 29px, 0px) rotate(2deg)']
    cards.forEach((card, index) => (card.style.transform = next[index]!))
    await settle()

    expect(made).toHaveLength(3)
    made.forEach(({ frames, cancelled }, index) => {
      expect(cancelled).toBe(false)
      // El último cuadro es su lugar nuevo, sin corrimiento: al terminar no salta.
      const now = cards[index]!.style.transform

      expect(now).not.toBe('')
      expect(frames.at(-1)!.transform).toBe(`translate(0px, 0px) ${now} rotate(0deg)`)
      expect(frames.every((frame) => String(frame.transform).includes(now))).toBe(true)
    })
  })

  it('un segundo barajado mientras corre el primero no lo vuelve a empezar', () => {
    const made = fakeAnimations()
    const cards = hand(['translate3d(0px, 30px, 0px)', 'translate3d(60px, 30px, 0px)'])

    shuffleHand(cards)
    shuffleHand(cards)

    expect(made).toHaveLength(2)
    expect(made.every((entry) => !entry.cancelled)).toBe(true)
  })

  it('la carta que toma el dedo deja de barajarse, y la que ya se arrastra no se baraja', async () => {
    const made = fakeAnimations()
    const cards = hand(['translate3d(0px, 30px, 0px)', 'translate3d(60px, 30px, 0px)'])

    shuffleHand(cards)
    cards[1]!.dataset.state = 'dragging'
    await settle()
    expect(made.map((entry) => entry.cancelled)).toEqual([false, true])

    const fresh = fakeAnimations()
    const again = hand(['translate3d(0px, 30px, 0px)', 'translate3d(60px, 30px, 0px)'])
    again[0]!.dataset.state = 'dragging'
    shuffleHand(again)
    expect(fresh.map((entry) => entry.card)).toEqual([again[1]])
  })
})

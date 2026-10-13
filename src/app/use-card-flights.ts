import { useCallback, useLayoutEffect, useRef, type RefObject } from 'react'

import { CARD_BACK, FX_RGB } from '../components/probability/practice-styles'
import { UI_ANIMATION_MS, supportsAdditiveAnimation } from './motion'
import { locateCard, type MatState } from './practice-mat'

/** Cuánto dura el vuelo de una carta entre dos lugares de la mesa. */
export const FLIGHT_MS = UI_ANIMATION_MS * 2
const EASING = 'cubic-bezier(0.22, 0.9, 0.3, 1)'
/** Marca de los vuelos: una jugada que llega con un vuelo a medias lo corta antes de medir, así la carta se mide quieta. */
const FLIGHT_ID = 'mat-flight'

interface Snapshot {
  rect: DOMRect
  /** Tamaño de layout (sin transformaciones): el fantasma se dibuja con este, aunque la carta estuviera girada o en pleno vuelo al medirse. */
  width: number
  height: number
  art: string | null
}

function prefersReducedMotion(): boolean {
  return typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches === true
}

/** Dónde se dibuja la carta cuando no es una carta suelta (`data-card-id`): la pila donde está o el Xyz que la tiene de material. */
function homeOf(root: HTMLElement, state: MatState, id: string): HTMLElement | null {
  const where = locateCard(state, id)

  if (where?.kind === 'pile') return root.querySelector<HTMLElement>(`[data-drop="${where.pile}"]`)
  if (where?.kind === 'material') return root.querySelector<HTMLElement>(`[data-card-id="${where.of}"]`)

  return null
}

/** Boca abajo a donde va: al deck, al Extra, desterrada boca abajo o como material. */
function hiddenAt(state: MatState, id: string): boolean {
  const where = locateCard(state, id)

  if (where?.kind === 'material') return true
  return where?.kind === 'pile' && (where.pile === 'deck' || where.pile === 'extra' || (where.pile === 'banished' && state.facedown.includes(id)))
}

const centerX = (rect: DOMRect) => rect.left + rect.width / 2
const centerY = (rect: DOMRect) => rect.top + rect.height / 2
const near = (a: DOMRect, b: DOMRect) => Math.abs(a.left - b.left) < 1 && Math.abs(a.top - b.top) < 1 && Math.abs(a.width - b.width) < 1

/** FLIP: transformación que lleva el elemento desde donde estaba (`from`) hasta donde está (`to`); el tamaño se compara por el lado largo (las cartas de costado) y se acota por si la medición agarró una animación a medias. */
function offset(from: DOMRect, to: DOMRect): string {
  const scale = Math.min(3, Math.max(0.3, Math.max(from.width, from.height) / Math.max(1, to.width, to.height)))

  return `translate(${centerX(from) - centerX(to)}px, ${centerY(from) - centerY(to)}px) scale(${scale})`
}

/** La pila (o el Xyz) que recibe una carta se infla un instante cuando aterriza. */
function bump(element: HTMLElement) {
  element.animate([{ transform: 'scale(1)' }, { transform: 'scale(1.08)', offset: 0.45 }, { transform: 'scale(1)' }], { duration: 260, delay: FLIGHT_MS - 120, easing: 'ease-out' })
}

/** El color con que cada lugar recibe una carta: el cementerio, violeta; el destierro, ámbar; el deck y el Extra, celeste; debajo de un Xyz, azul. */
function impactRgb(state: MatState, id: string): string {
  const where = locateCard(state, id)

  if (where?.kind === 'material') return FX_RGB.indigo
  if (where?.kind === 'pile' && where.pile === 'gy') return FX_RGB.violet
  if (where?.kind === 'pile' && where.pile === 'banished') return FX_RGB.amber

  return FX_RGB.cyan
}

/** Al aterrizar, el lugar da el golpe: un marco de su color que se enciende y se expande al apagarse, y un destello (pasa junto con `bump`, que lo infla). */
function impact(element: HTMLElement, rgb: string) {
  element.animate(
    [
      { boxShadow: `0 0 0 2px rgb(${rgb} / 1), 0 0 18px 3px rgb(${rgb} / 0.9)`, filter: 'brightness(1.9)' },
      { boxShadow: `0 0 0 2px rgb(${rgb} / 1), 0 0 22px 6px rgb(${rgb} / 0.7)`, filter: 'brightness(1.25)', offset: 0.4 },
      { boxShadow: `0 0 0 16px rgb(${rgb} / 0), 0 0 34px 10px rgb(${rgb} / 0)`, filter: 'brightness(1)' },
    ],
    { duration: 700, delay: FLIGHT_MS - 100, easing: 'ease-out' },
  )
}

/**
 * Las cartas vuelan de un lugar a otro cuando cambia el estado de la mesa (jugadas, deshacer, reproducir un
 * combo): cada carta a la vista (`data-card-id`) se anima desde donde estaba (FLIP) o desde la pila de la que
 * salió; una que se va a una pila (o abajo de un Xyz) viaja hasta ahí como un fantasma, se da vuelta si llega
 * boca abajo, y la pila la recibe con un salto. La mano reparte (desde el mazo) y reacomoda sus propias cartas.
 * `layoutKey` cambia cuando las cartas se mueven sin jugada (reparto, reordenar la mano): se vuelve a medir.
 */
export function useCardFlights(containerRef: RefObject<HTMLElement | null>, state: MatState, artOf: (id: string) => string | null, layoutKey: string): { dealsFromDeck: (id: string) => boolean } {
  const previousRef = useRef<{ state: MatState; cards: Map<string, Snapshot> } | null>(null)

  useLayoutEffect(() => {
    const root = containerRef.current

    if (!root || typeof root.animate !== 'function') return

    const current = new Map<string, { element: HTMLElement; rect: DOMRect }>()

    for (const element of root.querySelectorAll<HTMLElement>('[data-card-id]')) {
      const id = element.dataset.cardId

      for (const animation of element.getAnimations()) if (animation.id === FLIGHT_ID) animation.cancel()
      if (id) current.set(id, { element, rect: element.getBoundingClientRect() })
    }

    const previous = previousRef.current
    previousRef.current = { state, cards: new Map([...current].map(([id, { element, rect }]) => [id, { rect, width: element.offsetWidth, height: element.offsetHeight, art: artOf(id) }])) }

    if (!previous || previous.state === state || prefersReducedMotion()) return

    for (const [id, { element, rect }] of current) {
      if (state.hand.includes(id) && (previous.state.hand.includes(id) || previous.state.deck.includes(id))) continue

      const before = previous.cards.get(id)?.rect ?? homeOf(root, previous.state, id)?.getBoundingClientRect()

      if (!before || near(before, rect)) continue

      // Una carta que cambió de posición gira con su transición: un vuelo encima la dejaría como estaba hasta terminar y después la daría vuelta de golpe.
      if (typeof CSSTransition === 'function' && element.getAnimations().some((animation) => animation instanceof CSSTransition && animation.transitionProperty === 'transform')) continue

      // El vuelo va por delante de la transformación propia de la carta (el abanico de la mano, una carta de costado).
      const base = getComputedStyle(element).transform
      const own = base === 'none' ? '' : ` ${base}`

      element.animate([{ transform: `${offset(before, rect)}${own}` }, { transform: base }], { id: FLIGHT_ID, duration: FLIGHT_MS, easing: EASING })
    }

    for (const [id, snapshot] of previous.cards) {
      if (current.has(id)) continue

      const home = homeOf(root, state, id)
      const to = home?.getBoundingClientRect() ?? null
      // Sale centrado donde estaba la carta, con su tamaño de layout (no el del rect, que puede ser el de una carta girada o en vuelo).
      const { width, height } = snapshot
      const left = centerX(snapshot.rect) - width / 2
      const top = centerY(snapshot.rect) - height / 2
      const ghost = document.createElement('div')
      ghost.className = 'pointer-events-none fixed left-0 top-0 z-200 overflow-hidden bg-input shadow-[0_12px_28px_rgba(0,0,0,0.5)]'
      ghost.style.width = `${width}px`
      ghost.style.height = `${height}px`
      ghost.style.transform = `translate(${left}px, ${top}px)`

      if (snapshot.art) {
        const image = document.createElement('img')
        image.src = snapshot.art
        image.alt = ''
        image.className = 'block h-full w-full object-cover'
        ghost.append(image)
      }

      const faceDown = hiddenAt(state, id)

      if (faceDown) {
        // Llega boca abajo: a mitad de camino queda de canto y ahí se cambia la cara por el dorso.
        const back = document.createElement('span')
        back.className = CARD_BACK
        ghost.append(back)
        back.animate([{ opacity: 0 }, { opacity: 0, offset: 0.5 }, { opacity: 1, offset: 0.5 }, { opacity: 1 }], { duration: FLIGHT_MS, fill: 'forwards' })
      }

      document.body.append(ghost)
      const landing = to
        ? `translate(${to.left + (to.width - width) / 2}px, ${to.top + (to.height - height) / 2}px) scale(${to.width / Math.max(1, width)})`
        : `translate(${left}px, ${top}px) scale(0.6)`
      const flight = ghost.animate([{ transform: ghost.style.transform, opacity: 1 }, { transform: landing, opacity: to ? 0.75 : 0 }], { duration: FLIGHT_MS, easing: EASING, fill: 'forwards' })
      flight.onfinish = () => ghost.remove()
      flight.oncancel = () => ghost.remove()

      // El giro en 3D se suma al vuelo (va después en la pila de animaciones, con `composite: 'add'`): de canto a mitad de camino y abierto del otro lado.
      if (faceDown && supportsAdditiveAnimation()) {
        ghost.animate(
          [
            { transform: 'perspective(700px) rotateY(0deg)', easing: 'ease-in' },
            { transform: 'perspective(700px) rotateY(90deg)', offset: 0.5 },
            { transform: 'perspective(700px) rotateY(-90deg)', offset: 0.5, easing: 'ease-out' },
            { transform: 'perspective(700px) rotateY(0deg)' },
          ],
          { duration: FLIGHT_MS, composite: 'add', fill: 'forwards' },
        )
      }

      if (home) {
        bump(home)
        impact(home, impactRgb(state, id))
      }
    }
    // Se mide con cada jugada y cada vez que la mano se reacomoda; `artOf` sólo pinta el fantasma.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state, layoutKey])

  // Una carta que aparece en la mano se reparte desde el mazo salvo que venga de otro lado a la vista (eso lo anima el vuelo).
  const dealsFromDeck = useCallback((id: string) => {
    const previous = previousRef.current

    return !previous || (!previous.cards.has(id) && (previous.state.hand.includes(id) || previous.state.deck.includes(id)))
  }, [])

  return { dealsFromDeck }
}

import type { PointerEvent as ReactPointerEvent } from 'react'

import { prefersReducedMotion } from '../../app/motion'

/** Cuánto se inclina la carta (en grados, en el borde) hacia donde está el puntero. */
const TILT_DEGREES = 12

/** La perspectiva de la inclinación (px): la misma en el detalle, en las grillas y en el celular. */
const PERSPECTIVE_PX = 900

/**
 * Lo que necesita una carta grande para inclinarse en 3D hacia el mouse, como una carta de verdad que se apoya con el dedo (y un brillo que
 * sigue al puntero): la perspectiva en el contenedor, `TILT_ART` en el elemento que se inclina, `tiltHandlers` en sus eventos y `CardGlare`
 * adentro. Lo usan el detalle de una carta (`CardOverlay`) y la carta grande del builder (`DeckBuilderClassicPreview`). Las cartas de una grilla o de una
 * lista no arman nada de esto: `CardArt` con `tilt` ya lo trae (`tiltInPlaceHandlers`).
 */
export const TILT_PERSPECTIVE = '[perspective:900px]'

/** El elemento que se inclina (va por `rotate`, aparte de `transform`, que usa el vuelo al abrir y cerrar el detalle) y marca a su brillo. */
export const TILT_ART = 'group/art transition-[rotate] duration-(--motion-duration) ease-[cubic-bezier(0.2,0.9,0.25,1)]'

/** Lo mismo para una carta con su propio contenedor: se inclina por `transform` (con su perspectiva adentro), así no necesita nada afuera. */
export const TILT_IN_PLACE = 'group/art transition-[transform] duration-(--motion-duration) ease-[cubic-bezier(0.2,0.9,0.25,1)]'

type Apply = (art: HTMLElement, axisX: number, axisY: number, degrees: number) => void

/** Dónde está el puntero respecto del centro de la carta (−1 a 1 en cada eje) y cuánto se aleja: 0 en el centro, 1 en el borde. */
function pointerOffset(art: HTMLElement, event: ReactPointerEvent<HTMLElement>) {
  const rect = art.getBoundingClientRect()
  const x = ((event.clientX - rect.left) / Math.max(1, rect.width) - 0.5) * 2
  const y = ((event.clientY - rect.top) / Math.max(1, rect.height) - 0.5) * 2

  return { x, y, strength: Math.min(1, Math.hypot(x, y)) }
}

/** Inclina la carta hacia el puntero. Sin tocar el estado de React: cada movimiento sólo escribe estilos. */
function tiltTowards(art: HTMLElement, event: ReactPointerEvent<HTMLElement>, apply: Apply) {
  const { x, y, strength } = pointerOffset(art, event)

  // Se hunde del lado del puntero: el eje es perpendicular a su desplazamiento desde el centro.
  apply(art, -y, x, strength < 0.01 ? 0 : strength * TILT_DEGREES)
  art.style.setProperty('--glare-x', `${(x + 1) * 50}%`)
  art.style.setProperty('--glare-y', `${(y + 1) * 50}%`)
  // La luz del foil de rareza (`RarityFoil`): dónde está el puntero y qué tan lejos del centro.
  art.style.setProperty('--foil-px', `${(x + 1) * 50}%`)
  art.style.setProperty('--foil-py', `${(y + 1) * 50}%`)
  art.style.setProperty('--foil-d', String(strength))
  art.dataset.tilting = 'true'
}

const applyRotate: Apply = (art, axisX, axisY, degrees) => {
  art.style.rotate = degrees === 0 ? 'none' : `${axisX} ${axisY} 0 ${degrees}deg`
}

const applyTransform: Apply = (art, axisX, axisY, degrees) => {
  art.style.transform = degrees === 0 ? '' : `perspective(${PERSPECTIVE_PX}px) rotate3d(${axisX}, ${axisY}, 0, ${degrees}deg)`
}

/** Un medio giro (180°) deja la carta como estaba: de −90° a 90° es cuánto está inclinada respecto de plana (de frente o de dorso). */
const halfTurn = (degrees: number) => ((((degrees + 90) % 180) + 180) % 180) - 90

/** Con cuántos grados de inclinación la luz del foil llega al borde de la carta. */
const FOIL_EDGE_DEGREES = 70

/**
 * Mientras se gira la carta con el gesto (`useCardFlip`), la luz del foil sigue su **orientación**, como el brillo de una carta de verdad al darla vuelta: va hacia el lado que se hunde y, casi de canto, está en el borde
 * (antes se soltaba y el foil volvía a moverse solo mientras se giraba). Se escribe en el elemento que gira: el frente, que lleva el foil, lo hereda. `foilReleased` lo suelta al terminar.
 */
export function foilFollowsTurn(element: HTMLElement, xDegrees: number, yDegrees: number) {
  const x = Math.max(-1, Math.min(1, halfTurn(yDegrees) / FOIL_EDGE_DEGREES))
  const y = Math.max(-1, Math.min(1, -halfTurn(xDegrees) / FOIL_EDGE_DEGREES))

  element.style.setProperty('--foil-px', `${(x + 1) * 50}%`)
  element.style.setProperty('--foil-py', `${(y + 1) * 50}%`)
  element.style.setProperty('--foil-d', String(Math.min(1, Math.hypot(x, y))))
}

/** El foil vuelve a moverse solo (termina el giro). */
export function foilReleased(element: HTMLElement) {
  element.style.removeProperty('--foil-px')
  element.style.removeProperty('--foil-py')
  element.style.removeProperty('--foil-d')
}

/** Vuelve la carta a su lugar (al irse el puntero o al soltarla). */
export function levelOut(art: HTMLElement) {
  art.style.rotate = ''
  art.style.transform = ''
  // El foil vuelve a moverse solo.
  art.style.removeProperty('--foil-px')
  art.style.removeProperty('--foil-py')
  art.style.removeProperty('--foil-d')
  art.dataset.tilting = 'false'
}

/**
 * Los eventos del elemento que se inclina. Con el mouse sigue al puntero mientras pasa por encima; con el dedo (o el lápiz) la carta se hunde del lado
 * que se toca y sigue al dedo mientras no empiece a desplazarse la pantalla (entonces el navegador cancela el toque y la carta vuelve sola). Se suelta donde
 * se suelte el dedo, también si otra cosa (arrastrar la carta al deck) se queda con el puntero. Se apaga con movimiento reducido.
 */
function handlersFor(apply: Apply) {
  return {
    onPointerDown: (event: ReactPointerEvent<HTMLElement>) => {
      if (event.pointerType !== 'touch' && event.pointerType !== 'pen') return
      if (prefersReducedMotion()) return

      const art = event.currentTarget
      const release = () => {
        levelOut(art)
        window.removeEventListener('pointerup', release)
        window.removeEventListener('pointercancel', release)
      }

      tiltTowards(art, event, apply)
      window.addEventListener('pointerup', release)
      window.addEventListener('pointercancel', release)
    },
    onPointerMove: (event: ReactPointerEvent<HTMLElement>) => {
      if (prefersReducedMotion()) return
      // El mouse inclina al pasar por encima; el dedo, sólo mientras toca.
      if (event.pointerType !== 'mouse' && event.buttons === 0) return

      tiltTowards(event.currentTarget, event, apply)
    },
    onPointerLeave: (event: ReactPointerEvent<HTMLElement>) => {
      // Un dedo que se sale de la carta sigue tocando: la suelta `pointerup`.
      if (event.pointerType !== 'touch' && event.pointerType !== 'pen') levelOut(event.currentTarget)
    },
  }
}

/** Para la carta grande (el detalle, el zoom, el builder): se inclina por `rotate`, con la perspectiva en el contenedor (`TILT_PERSPECTIVE`). */
export const tiltHandlers = handlersFor(applyRotate)

/** Para una carta suelta de una grilla o de una lista (`CardArt` con `tilt`): se inclina por `transform`, con su propia perspectiva. */
export const tiltInPlaceHandlers = handlersFor(applyTransform)

/** El brillo que sigue al puntero mientras la carta se inclina (va adentro del elemento con `TILT_ART`). */
export function CardGlare() {
  return (
    <span
      aria-hidden="true"
      className="pointer-events-none absolute inset-0 opacity-0 transition-opacity duration-(--motion-duration) [background:radial-gradient(circle_at_var(--glare-x,50%)_var(--glare-y,50%),rgb(255_255_255/0.34),transparent_58%)] mix-blend-overlay group-data-[tilting=true]/art:opacity-100 motion-reduce:hidden"
    />
  )
}

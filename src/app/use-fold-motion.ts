import { useLayoutEffect, useRef, type RefObject } from 'react'

import { EASE_SNAP, cancelWhenDone, prefersReducedMotion } from './motion'

/**
 * Minimizar sin saltos (los carteles y las hojas del duelo que se pliegan a una tira: `AutoPanel` y `Modal lowerable`). Soltada sin plegar, la hoja vuelve a su lugar deslizándose desde donde
 * la dejó el dedo (`settle`); al plegar, baja hasta la tira y **recién al llegar** cambia de estado (`fold`); al abrir, sube desde donde estaba la tira (`raise`). Al cambiar de estado, lo nuevo
 * arranca donde quedó lo viejo y se acomoda: si la tira quedó unos px corrida, se desliza; con `fade` (la tira del `Modal` es un asa chica, no la hoja) lo que se va se funde y lo que llega aparece.
 * Sólo `transform` y `opacity`, con la Web Animations API (React no se redibuja por esto). Sin ella (jsdom) o con movimiento reducido, cambia enseguida, como antes.
 */

/** Lo que tarda en plegarse, volver o abrirse: lo que suelta un gesto (`use-sheet-drag`). */
export const FOLD_MS = 200

const canAnimate = (panel: HTMLElement | null): panel is HTMLElement => panel !== null && typeof panel.animate === 'function' && !prefersReducedMotion()

/** `ref`: la hoja (el mismo elemento abierta y plegada, o el que la reemplaza); `folded`, si está plegada. */
export function useFoldMotion(ref: RefObject<HTMLElement | null>, folded: boolean, fade = false) {
  const running = useRef<Animation | null>(null)
  const folding = useRef(false)
  // Dónde quedó lo que se va (su borde de arriba en la pantalla) y con qué opacidad: de ahí arranca lo que llega.
  const handoff = useRef<{ top: number; opacity: number } | null>(null)
  const shown = useRef(folded)

  const play = (panel: HTMLElement, frames: Keyframe[], fill?: FillMode) => {
    running.current?.cancel()
    running.current = panel.animate(frames, { duration: FOLD_MS, easing: EASE_SNAP, ...(fill ? { fill } : {}) })
    return running.current
  }

  useLayoutEffect(() => {
    if (shown.current === folded) return
    shown.current = folded
    folding.current = false
    const panel = ref.current
    const from = handoff.current

    handoff.current = null
    // La plegada se quedó en su último cuadro hasta que llegara la tira: ya está, se suelta.
    running.current?.cancel()
    running.current = null
    if (!from || !canAnimate(panel)) return
    const shift = Math.round(from.top - panel.getBoundingClientRect().top)

    if (shift === 0 && from.opacity === 1) return
    cancelWhenDone(play(panel, [{ transform: `translateY(${shift}px)`, opacity: from.opacity }, { transform: 'translateY(0px)', opacity: 1 }]))
  }, [folded, ref])

  return {
    /** Soltada a `dy` px de su lugar sin plegarse: vuelve deslizándose (quien la corrió ya borró su corrimiento). */
    settle(dy: number) {
      const panel = ref.current

      if (dy !== 0 && !folding.current && canAnimate(panel)) cancelWhenDone(play(panel, [{ transform: `translateY(${dy}px)` }, { transform: 'translateY(0px)' }]))
    },
    /** Baja hasta la tira (`reach`: cuántos px, medido con la hoja quieta en su lugar) desde `from` (donde la dejó el dedo) y al llegar, `done` (que la pliega). */
    fold(done: () => void, reach: (panel: HTMLElement) => number, from = 0) {
      const panel = ref.current

      if (folding.current) return
      if (!canAnimate(panel)) return done()
      folding.current = true
      // Lo que corría (la vuelta de un arrastre que en realidad pliega) se suelta antes de medir.
      running.current?.cancel()
      const to = Math.max(from, reach(panel))
      const animation = play(panel, [{ transform: `translateY(${from}px)`, opacity: 1 }, { transform: `translateY(${to}px)`, opacity: fade ? 0 : 1 }], 'forwards')

      animation.finished.then(() => {
        if (running.current !== animation) return
        handoff.current = { top: panel.getBoundingClientRect().top, opacity: fade ? 0 : 1 }
        done()
      }, () => {
        folding.current = false
      })
    },
    /** Se abre: lo que llega sube desde donde está la tira. */
    raise(done: () => void) {
      const panel = ref.current

      if (canAnimate(panel)) handoff.current = { top: panel.getBoundingClientRect().top, opacity: fade ? 0 : 1 }
      done()
    },
  }
}

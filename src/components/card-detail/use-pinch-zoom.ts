import { useEffect, type RefObject } from 'react'

/** Cuánto hay que girar la rueda (en píxeles de `deltaY`) para pasar al paso de zoom de al lado. */
const WHEEL_STEP = 40
/** Cuánto hay que abrir o cerrar los dedos (en proporción de la distancia entre ellos) para pasar al paso de al lado. */
const PINCH_RATIO = 1.25
/** Si la rueda se detiene, lo que llevaba sumado se descarta (cada gesto empieza de cero). */
const WHEEL_IDLE_MS = 200

const distance = (touches: TouchList) => Math.hypot(touches[0]!.clientX - touches[1]!.clientX, touches[0]!.clientY - touches[1]!.clientY)

/**
 * Cambiar el zoom de la carta en grande sin botones: con **Ctrl + la rueda** (que es también el pellizco del trackpad) y pellizcando con **dos dedos** en una pantalla táctil, un paso por vez
 * (`onStep(1)` acerca, `onStep(-1)` aleja). La rueda sola no hace nada acá: desplaza la carta cuando es más grande que la pantalla. `onPinchStart` avisa cuando toca el segundo dedo: el gesto de giro que
 * ya había empezado el primero se tiene que cancelar.
 */
export function usePinchZoom(ref: RefObject<HTMLElement | null>, onStep: (by: 1 | -1) => void, onPinchStart?: () => void) {
  useEffect(() => {
    const element = ref.current

    if (!element) return

    let wheel = 0
    let wheelTimer: number | undefined
    let pinch: number | null = null

    const onWheel = (event: WheelEvent) => {
      if (!event.ctrlKey && !event.metaKey) return

      // Con Ctrl + rueda el navegador acerca toda la página: acá cambia el zoom de la carta.
      event.preventDefault()
      wheel += event.deltaY
      window.clearTimeout(wheelTimer)
      wheelTimer = window.setTimeout(() => {
        wheel = 0
      }, WHEEL_IDLE_MS)

      if (Math.abs(wheel) >= WHEEL_STEP) {
        onStep(wheel < 0 ? 1 : -1)
        wheel = 0
      }
    }

    const onTouchStart = (event: TouchEvent) => {
      if (event.touches.length !== 2) return

      pinch = distance(event.touches)
      onPinchStart?.()
    }

    const onTouchMove = (event: TouchEvent) => {
      if (event.touches.length !== 2 || pinch === null) return

      event.preventDefault()

      const now = distance(event.touches)

      if (now / pinch >= PINCH_RATIO) {
        onStep(1)
        pinch = now
      } else if (pinch / now >= PINCH_RATIO) {
        onStep(-1)
        pinch = now
      }
    }

    const onTouchEnd = (event: TouchEvent) => {
      if (event.touches.length < 2) pinch = null
    }

    element.addEventListener('wheel', onWheel, { passive: false })
    element.addEventListener('touchstart', onTouchStart, { passive: true })
    element.addEventListener('touchmove', onTouchMove, { passive: false })
    element.addEventListener('touchend', onTouchEnd)
    element.addEventListener('touchcancel', onTouchEnd)

    return () => {
      window.clearTimeout(wheelTimer)
      element.removeEventListener('wheel', onWheel)
      element.removeEventListener('touchstart', onTouchStart)
      element.removeEventListener('touchmove', onTouchMove)
      element.removeEventListener('touchend', onTouchEnd)
      element.removeEventListener('touchcancel', onTouchEnd)
    }
  }, [ref, onStep, onPinchStart])
}

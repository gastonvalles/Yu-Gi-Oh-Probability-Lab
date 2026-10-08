import { useEffect, useRef, useState, type RefObject } from 'react'

import { prefersReducedMotion } from '../../app/motion'

/** Lo que tarda un anillo en llenarse (la transición CSS usa el mismo valor). */
export const RING_FILL_MS = 900

const listeners = new WeakMap<Element, (visible: boolean) => void>()
let observer: IntersectionObserver | null = null

/** Un solo observador para todos los anillos: avisa si cada uno está a la vista (sin forzar layout). */
function observeVisibility(element: Element, onChange: (visible: boolean) => void): () => void {
  if (!observer && typeof IntersectionObserver !== 'undefined') {
    observer = new IntersectionObserver((entries) => {
      for (const entry of entries) {
        listeners.get(entry.target)?.(entry.isIntersecting)
      }
    })
  }

  const active = observer

  if (!active) {
    return () => {}
  }

  listeners.set(element, onChange)
  active.observe(element)

  return () => {
    listeners.delete(element)
    active.unobserve(element)
  }
}

/**
 * Anima el llenado de un anillo: arranca vacío y, un par de cuadros después, pasa a su valor (la
 * transición CSS hace el recorrido). `delay` escalona varios anillos; con "reducir movimiento"
 * aparecen llenos de entrada. Los anillos que nacen fuera de pantalla (o en un panel oculto) también
 * aparecen llenos y sin transición: nadie los ve llenarse y en el celular cada transición simultánea
 * cuesta un recálculo de estilos y un repintado por cuadro.
 */
export function useRingReveal<T extends HTMLElement>(
  delay = 0,
): { ref: RefObject<T | null>; revealed: boolean; settled: boolean; delayMs: number; instant: boolean } {
  const ref = useRef<T>(null)
  const visibleRef = useRef<boolean | null>(null)
  const [revealed, setRevealed] = useState(prefersReducedMotion)
  const [firstFillDone, setFirstFillDone] = useState(prefersReducedMotion)
  const [instant, setInstant] = useState(false)

  useEffect(() => {
    const element = ref.current

    return element ? observeVisibility(element, (visible) => (visibleRef.current = visible)) : undefined
  }, [])

  useEffect(() => {
    if (revealed) {
      return
    }

    let second = 0
    // Dos cuadros: el primero pinta el anillo vacío (y el observador informa si se ve); si no, el navegador ve sólo el valor final y no anima.
    const first = requestAnimationFrame(() => {
      second = requestAnimationFrame(() => {
        if (visibleRef.current === false) {
          setInstant(true)
          setFirstFillDone(true)
        }

        setRevealed(true)
      })
    })

    return () => {
      cancelAnimationFrame(first)
      cancelAnimationFrame(second)
    }
  }, [revealed])

  useEffect(() => {
    if (!instant) {
      return
    }

    // Una vez pintado lleno, las transiciones vuelven (para los cambios de valor).
    const frame = requestAnimationFrame(() => setInstant(false))

    return () => cancelAnimationFrame(frame)
  }, [instant])

  useEffect(() => {
    if (!revealed || firstFillDone) {
      return
    }

    const timer = window.setTimeout(() => setFirstFillDone(true), delay + RING_FILL_MS + 60)

    return () => window.clearTimeout(timer)
  }, [revealed, firstFillDone, delay])

  // La espera escalonada sólo vale para el primer llenado: los cambios posteriores de valor son inmediatos.
  return { ref, revealed, settled: firstFillDone, delayMs: firstFillDone ? 0 : delay, instant }
}

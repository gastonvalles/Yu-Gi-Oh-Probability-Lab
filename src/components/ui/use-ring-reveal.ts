import { useEffect, useState } from 'react'

import { prefersReducedMotion } from '../../app/motion'

/** Lo que tarda un anillo en llenarse (la transición CSS usa el mismo valor). */
export const RING_FILL_MS = 900

/**
 * Anima el llenado de un anillo: arranca vacío y, un par de cuadros después, pasa a su valor (la
 * transición CSS hace el recorrido). `delay` escalona varios anillos; con "reducir movimiento"
 * aparecen llenos de entrada.
 */
export function useRingReveal(delay = 0): { revealed: boolean; settled: boolean; delayMs: number } {
  const [revealed, setRevealed] = useState(prefersReducedMotion)
  const [firstFillDone, setFirstFillDone] = useState(prefersReducedMotion)

  useEffect(() => {
    if (revealed) {
      return
    }

    let second = 0
    // Dos cuadros: el primero pinta el anillo vacío; si no, el navegador ve sólo el valor final y no anima.
    const first = requestAnimationFrame(() => {
      second = requestAnimationFrame(() => setRevealed(true))
    })

    return () => {
      cancelAnimationFrame(first)
      cancelAnimationFrame(second)
    }
  }, [revealed])

  useEffect(() => {
    if (!revealed || firstFillDone) {
      return
    }

    const timer = window.setTimeout(() => setFirstFillDone(true), delay + RING_FILL_MS + 60)

    return () => window.clearTimeout(timer)
  }, [revealed, firstFillDone, delay])

  // La espera escalonada sólo vale para el primer llenado: los cambios posteriores de valor son inmediatos.
  return { revealed, settled: firstFillDone, delayMs: firstFillDone ? 0 : delay }
}

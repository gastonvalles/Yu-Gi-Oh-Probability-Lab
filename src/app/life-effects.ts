import { useEffect, useRef, useState } from 'react'

import { prefersReducedMotion } from './motion'

/** El número de LP se mueve hasta el valor nuevo en vez de saltar (salvo con movimiento reducido). */
export function useAnimatedNumber(target: number): number {
  const [shown, setShown] = useState(target)
  const shownRef = useRef(target)

  useEffect(() => {
    const from = shownRef.current

    if (from === target || prefersReducedMotion()) {
      shownRef.current = target
      setShown(target)
      return
    }

    const start = performance.now()
    const duration = 320
    let frame = 0
    const step = (time: number) => {
      const progress = Math.min(1, (time - start) / duration)
      const eased = 1 - (1 - progress) ** 3
      const value = Math.round(from + (target - from) * eased)

      shownRef.current = value
      setShown(value)

      if (progress < 1) {
        frame = requestAnimationFrame(step)
      }
    }

    frame = requestAnimationFrame(step)

    return () => cancelAnimationFrame(frame)
  }, [target])

  return shown
}

/** Al cambiar, el LP se pinta un momento de verde (subió) o rojo (bajó). */
export function useLpFlash(lp: number): 'up' | 'down' | null {
  const [flash, setFlash] = useState<'up' | 'down' | null>(null)
  const previous = useRef(lp)

  useEffect(() => {
    if (previous.current === lp) {
      return
    }

    setFlash(lp > previous.current ? 'up' : 'down')
    previous.current = lp
    const id = window.setTimeout(() => setFlash(null), 900)

    return () => window.clearTimeout(id)
  }, [lp])

  return flash
}

/** Cuánto se queda a la vista lo que cambió (el «−1000» junto a las vidas). */
const DELTA_MS = 1600

/**
 * Lo último que cambió de unas vidas (`delta`, negativo si bajó) durante un momento, y una clave que cambia con cada cambio (para que la animación vuelva a correr). Lo que ya estaba al abrir no cuenta.
 * Si las vidas estaban en cero (el duelo terminó) y vuelven a empezar (la revancha), no es un cambio que mostrar.
 */
export function useLpDelta(lp: number): { delta: number; key: number } | null {
  const [shown, setShown] = useState<{ delta: number; key: number } | null>(null)
  const previous = useRef(lp)
  const count = useRef(0)

  useEffect(() => {
    const before = previous.current

    previous.current = lp

    if (before === lp || before <= 0) {
      return
    }

    count.current += 1
    setShown({ delta: lp - before, key: count.current })
    const id = window.setTimeout(() => setShown(null), DELTA_MS)

    return () => window.clearTimeout(id)
  }, [lp])

  return shown
}

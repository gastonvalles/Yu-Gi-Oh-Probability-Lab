import { createContext, useEffect, useLayoutEffect, useRef, useState } from 'react'

import { STARTING_LP } from './life-calculator'
import { prefersReducedMotion } from './motion'

interface AnimatedNumberOptions {
  /** Cuánto dura el recorrido (ms). Por defecto, 320: el de las vidas. */
  ms?: number
  /** Cuánto espera antes de arrancar (ms), para escalonar varios números. */
  delay?: number
  /** De 0 a 1 el tiempo recorrido, de 0 a 1 el camino hecho. Por defecto, la que frena. */
  ease?: (progress: number) => number
  /** Redondea a entero (las vidas). Sin esto el valor pasa por los decimales (el porcentaje de un anillo) y llega exacto al final. */
  round?: boolean
}

const easeOutCubic = (progress: number) => 1 - (1 - progress) ** 3

/** El número de LP se mueve hasta el valor nuevo en vez de saltar (salvo con movimiento reducido). */
export function useAnimatedNumber(target: number, { ms = 320, delay = 0, ease = easeOutCubic, round = true }: AnimatedNumberOptions = {}): number {
  const [shown, setShown] = useState(target)
  const shownRef = useRef(target)

  // Layout, no passive: el primer cuadro se pide en el mismo commit que el cambio, así el número arranca en el mismo cuadro que la transición del arco.
  useLayoutEffect(() => {
    const from = shownRef.current

    if (from === target || ms <= 0 || prefersReducedMotion()) {
      shownRef.current = target
      setShown(target)
      return
    }

    // El recorrido arranca en el primer cuadro (el reloj de rAF, el mismo que el de la transición del arco), no en el efecto.
    let start: number | undefined
    let frame = 0
    const step = (time: number) => {
      if (start === undefined) {
        start = time + delay
      }

      const progress = Math.min(1, Math.max(0, (time - start) / ms))
      const next = progress >= 1 ? target : from + (target - from) * ease(progress)
      const value = round ? Math.round(next) : next

      shownRef.current = value
      setShown(value)

      if (progress < 1) {
        frame = requestAnimationFrame(step)
      }
    }

    frame = requestAnimationFrame(step)

    return () => cancelAnimationFrame(frame)
  }, [target, ms, delay, ease, round])

  return shown
}

/**
 * Mientras vale true, las vidas que se ven (`LifeTile`: el número, el destello, el «−1000» y la sacudida) se quedan como estaban: en el duelo automático esperan al golpe de tu
 * ataque (`use-auto-asks`), que la mesa muestra a su ritmo después de que el núcleo ya bajó las vidas. Sin quien lo diga, false: cambian ya. El resultado usa siempre las de verdad.
 */
export const LifeHold = createContext(false)

/** Lo que se ve de `value`: el último que se vio mientras `held`, y el de ahora en cuanto se suelta (nunca se queda uno viejo sin `held`). */
export function useHeldValue<T>(value: T, held: boolean): T {
  const [kept, setKept] = useState(value)

  if (!held && !Object.is(kept, value)) setKept(value)

  return held ? kept : value
}

/** Lo que cuenta el número de unas vidas que no cambió: el mínimo; y el de un cambio de la vida entera (`STARTING_LP`), el máximo. */
const LIFE_COUNT_MIN_MS = 320
const LIFE_COUNT_MAX_MS = 900

/**
 * Cuánto cuenta un número de vidas que cambió `delta` (con cualquier signo): 320 ms por un cambio chico, 610 por uno de 4000 y 900 desde la vida entera (8000) para arriba.
 * Lineal entre los dos: no es una curva, es el tiempo que pide el cambio.
 */
export function lifeCountMs(delta: number): number {
  return Math.round(LIFE_COUNT_MIN_MS + (LIFE_COUNT_MAX_MS - LIFE_COUNT_MIN_MS) * Math.min(1, Math.abs(delta) / STARTING_LP))
}

/**
 * El número de unas vidas que cuenta hasta el valor nuevo, con la duración de su cambio (`lifeCountMs`). La duración se fija en el render que cambia el valor
 * (con `useState`, al cambiar el objetivo): un re-render a mitad del conteo no la vuelve a calcular ni reinicia el conteo.
 */
export function useLifeNumber(target: number): number {
  const [count, setCount] = useState(() => ({ target, ms: LIFE_COUNT_MIN_MS }))
  let current = count

  if (count.target !== target) {
    current = { target, ms: lifeCountMs(target - count.target) }
    setCount(current)
  }

  return useAnimatedNumber(target, { ms: current.ms })
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

/** Cuánto se queda a la vista lo que cambió (el «−1000» junto a las vidas): la barra lo usa para que el fundido termine cuando el aviso se quita. */
export const DELTA_MS = 1600

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

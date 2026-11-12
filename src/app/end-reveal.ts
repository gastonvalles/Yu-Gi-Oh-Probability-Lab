import { useEffect, useRef, useState } from 'react'

import { lifeCountMs } from './life-effects'
import { prefersReducedMotion } from './motion'

/** Lo que se deja ver el 0 de la chapa antes del resultado (Gastón, 2026-11-12: «que no se vea hasta que la vida del oponente llegue a 0»). */
const END_PAUSE_MS = 500
/** El golpe letal en cámara lenta (`LethalBlow`; sus animaciones en index.css duran lo mismo): mientras tanto las vidas que se ven esperan. */
export const LETHAL_MS = 1500

/** Cuánto espera el resultado desde que unas vidas bajaron de `from` a 0: el golpe letal, lo que cuenta el número hasta 0 (con movimiento reducido, nada de eso) y la pausa. */
export function endWaitMs(from: number, reduced: boolean): number {
  return (reduced ? 0 : LETHAL_MS + lifeCountMs(from)) + END_PAUSE_MS
}

/** El golpe que dejó a alguien en 0: cuánto le sacó y a quién (el índice de `lp`). `key` cambia con cada golpe. */
export interface LethalHit {
  key: number
  damage: number
  side: number
  reduced: boolean
}

interface EndReveal {
  /** El resultado ya se puede mostrar. */
  shown: boolean
  /** El golpe letal, hasta que sale el resultado. */
  lethal: LethalHit | null
  /** Las vidas que se ven esperan (`LifeHold`) mientras dura el golpe en cámara lenta: la chapa baja recién después. */
  holding: boolean
}

/**
 * El final por vidas en orden: el golpe letal en cámara lenta (`LETHAL_MS`), la chapa que cuenta hasta 0, una pausa y el resultado. `lp`: las vidas que la mesa ya mostró;
 * `ended`: terminó y la mesa mostró todo lo de antes (la cadena, el golpe). Un final sin vidas (rendirse, sin cartas, un efecto) sale ya.
 */
export function useEndReveal(ended: boolean, lp: readonly number[]): EndReveal {
  const [shown, setShown] = useState(false)
  const [lethal, setLethal] = useState<LethalHit | null>(null)
  const [holding, setHolding] = useState(false)
  const [last, setLast] = useState(lp)
  // Cuándo se vio caer a 0 y cuánto espera el resultado desde ahí.
  const fall = useRef({ at: 0, ms: 0 })
  const key = lp.join()

  // En el render (no en un efecto): la chapa tiene que esperar en el mismo dibujo en que las vidas llegan a 0, si no ya empezó a contar.
  if (key !== last.join()) {
    setLast(lp)
    const side = lp.findIndex((points, at) => points <= 0 && (last[at] ?? 0) > 0)

    if (lp.every((points) => points > 0)) {
      // Las vidas vuelven (otro duelo): no queda golpe.
      setLethal(null)
      setHolding(false)
    } else if (side >= 0) {
      const reduced = prefersReducedMotion()

      setLethal((hit) => ({ key: (hit?.key ?? 0) + 1, damage: Math.max(...lp.map((points, at) => (points <= 0 ? (last[at] ?? 0) : 0))), side, reduced }))
      setHolding(!reduced)
    }
  }

  // Desde el golpe: cuánto falta para el resultado y cuándo se suelta la chapa.
  useEffect(() => {
    if (!lethal) return
    fall.current = { at: Date.now(), ms: endWaitMs(lethal.damage, lethal.reduced) }
    if (lethal.reduced) return
    const timer = window.setTimeout(() => setHolding(false), LETHAL_MS)

    return () => window.clearTimeout(timer)
  }, [lethal])

  useEffect(() => {
    if (!ended) {
      setShown(false)
      return
    }
    const wait = lp.some((points) => points <= 0) ? fall.current.at + fall.current.ms - Date.now() : 0

    if (wait <= 0) {
      setShown(true)
      return
    }
    const timer = window.setTimeout(() => setShown(true), wait)

    return () => window.clearTimeout(timer)
    // eslint-disable-next-line react-hooks/exhaustive-deps -- por contenido (`key`)
  }, [ended, key])

  const done = ended && shown

  return { shown: done, lethal: done ? null : lethal, holding: holding && !done }
}

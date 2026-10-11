import { useCallback, useEffect, useRef } from 'react'

/**
 * Mantener apretado: `start` arranca la cuenta y, si pasan `ms` sin que se llame a `stop`, dispara
 * `onHold` una sola vez. `stop` (soltar, arrastrar, salir) la cancela.
 */
export function useHold(onHold: () => void, ms: number): { start: () => void; stop: () => void } {
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const latest = useRef(onHold)

  useEffect(() => {
    latest.current = onHold
  }, [onHold])

  const stop = useCallback(() => {
    if (timer.current !== null) {
      clearTimeout(timer.current)
      timer.current = null
    }
  }, [])

  const start = useCallback(() => {
    stop()
    timer.current = setTimeout(() => {
      timer.current = null
      latest.current()
    }, ms)
  }, [ms, stop])

  // Si el componente se va con la cuenta en marcha, no dispara nada.
  useEffect(() => stop, [stop])

  return { start, stop }
}

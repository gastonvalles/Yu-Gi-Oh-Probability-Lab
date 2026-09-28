import { useEffect, useEffectEvent } from 'react'

let activeScrollLocks = 0
let overflowBeforeLock = ''

/**
 * Bloquea el scroll del body mientras `active` sea true.
 * Lleva la cuenta de los bloqueos activos para que dos overlays abiertos a la
 * vez no se pisen: el overflow original se restaura cuando cierra el último.
 */
export function useBodyScrollLock(active: boolean): void {
  useEffect(() => {
    if (!active) {
      return
    }

    if (activeScrollLocks === 0) {
      overflowBeforeLock = document.body.style.overflow
      document.body.style.overflow = 'hidden'
    }

    activeScrollLocks += 1

    return () => {
      activeScrollLocks -= 1

      if (activeScrollLocks === 0) {
        document.body.style.overflow = overflowBeforeLock
      }
    }
  }, [active])
}

/** Ejecuta `onEscape` al presionar Escape mientras `active` sea true. */
export function useEscapeKey(onEscape: () => void, active = true): void {
  const handleEscape = useEffectEvent(onEscape)

  useEffect(() => {
    if (!active) {
      return
    }

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        handleEscape()
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [active])
}

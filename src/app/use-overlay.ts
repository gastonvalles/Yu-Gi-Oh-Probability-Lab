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

// Pila de overlays abiertos (modales y paneles): Escape cierra sólo el de arriba.
const openOverlays: symbol[] = []

/** Ejecuta `onEscape` al presionar Escape si este overlay es el último abierto. */
export function useEscapeKey(onEscape: () => void, active = true): void {
  const handleEscape = useEffectEvent(onEscape)

  useEffect(() => {
    if (!active) {
      return
    }

    const overlayId = Symbol('overlay')
    openOverlays.push(overlayId)

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && openOverlays[openOverlays.length - 1] === overlayId) {
        handleEscape()
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => {
      window.removeEventListener('keydown', handleKeyDown)
      openOverlays.splice(openOverlays.indexOf(overlayId), 1)
    }
  }, [active])
}

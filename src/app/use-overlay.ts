import { useEffect, useEffectEvent } from 'react'

let activeScrollLocks = 0
let savedScrollY = 0
let savedBodyStyle = { overflow: '', position: '', top: '', width: '' }

/**
 * Bloquea el scroll de la página mientras `active` sea true.
 * `overflow: hidden` solo no alcanza en iOS/Safari: se fija el body en su lugar (position fixed)
 * y se restaura la posición al cerrar. Lleva la cuenta de los bloqueos activos para que dos
 * overlays abiertos a la vez no se pisen: se restaura cuando cierra el último.
 */
export function useBodyScrollLock(active: boolean): void {
  useEffect(() => {
    if (!active) {
      return
    }

    const { body, documentElement } = document

    if (activeScrollLocks === 0) {
      savedScrollY = window.scrollY
      savedBodyStyle = { overflow: body.style.overflow, position: body.style.position, top: body.style.top, width: body.style.width }
      documentElement.style.overflow = 'hidden'
      body.style.overflow = 'hidden'
      body.style.position = 'fixed'
      body.style.top = `-${savedScrollY}px`
      body.style.width = '100%'
    }

    activeScrollLocks += 1

    return () => {
      activeScrollLocks -= 1

      if (activeScrollLocks === 0) {
        documentElement.style.overflow = ''
        Object.assign(body.style, savedBodyStyle)
        window.scrollTo(0, savedScrollY)
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

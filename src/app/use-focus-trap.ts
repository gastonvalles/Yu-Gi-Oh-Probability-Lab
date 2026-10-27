import { useEffect, type RefObject } from 'react'

const FOCUSABLE =
  'a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]):not([type="hidden"]), select:not([disabled]), [tabindex]:not([tabindex="-1"])'

// Pila de trampas activas: con un diálogo sobre un panel, sólo la de arriba mueve el foco.
const activeTraps: symbol[] = []

const TYPING = 'input:not([type="checkbox"], [type="radio"], [type="range"], [type="button"], [type="submit"], [type="reset"], [type="color"], [type="file"]), textarea, [contenteditable]:not([contenteditable="false"])'

/**
 * Enfocarlo al abrir algo abriría el teclado del celular sin que nadie lo pidiera: un campo de texto con puntero táctil. Se escribe al tocarlo; sólo una superficie que existe
 * para escribir (el buscador de la app) lo marca `data-initial-focus="type"`. Con mouse, el buscador de un visor sigue recibiendo el foco al abrirse.
 */
export const opensKeyboard = (element: Element) =>
  element.matches(TYPING) && element.getAttribute('data-initial-focus') !== 'type' && typeof window.matchMedia === 'function' && window.matchMedia('(pointer: coarse)').matches

/**
 * Comportamiento de foco de un diálogo modal: al abrir mueve el foco adentro (a `[data-initial-focus]`,
 * si no al primer control, si no al panel; nunca a lo que abriría el teclado: `opensKeyboard`), Tab/Shift+Tab giran dentro del panel y al cerrar el foco
 * vuelve a donde estaba. El panel debería tener `tabIndex={-1}` para poder recibir foco si está vacío.
 */
export function useFocusTrap(ref: RefObject<HTMLElement | null>, active = true): void {
  useEffect(() => {
    const panel = ref.current

    if (!active || !panel) {
      return
    }

    const trapId = Symbol('focus-trap')
    activeTraps.push(trapId)
    const previousFocus = document.activeElement

    const frame = requestAnimationFrame(() => {
      const target = [...panel.querySelectorAll<HTMLElement>('[data-initial-focus]'), ...panel.querySelectorAll<HTMLElement>(FOCUSABLE)].find((element) => !opensKeyboard(element)) ?? panel
      target.focus({ preventScroll: true })
    })

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Tab' || activeTraps[activeTraps.length - 1] !== trapId) {
        return
      }

      // Lo inerte no cuenta (una hoja bajada deja a la vista sólo su asa): si no, Tab saldría del panel.
      const focusable = Array.from(panel.querySelectorAll<HTMLElement>(FOCUSABLE)).filter((element) => !element.closest('[inert]'))

      if (focusable.length === 0) {
        event.preventDefault()
        return
      }

      const first = focusable[0]
      const last = focusable[focusable.length - 1]
      const current = document.activeElement
      const outside = !panel.contains(current)

      if (event.shiftKey && (current === first || outside)) {
        event.preventDefault()
        last.focus()
      } else if (!event.shiftKey && (current === last || outside)) {
        event.preventDefault()
        first.focus()
      }
    }

    document.addEventListener('keydown', handleKeyDown)

    return () => {
      cancelAnimationFrame(frame)
      document.removeEventListener('keydown', handleKeyDown)
      activeTraps.splice(activeTraps.indexOf(trapId), 1)

      if (previousFocus instanceof HTMLElement && previousFocus.isConnected) {
        previousFocus.focus({ preventScroll: true })
      }
    }
  }, [ref, active])
}

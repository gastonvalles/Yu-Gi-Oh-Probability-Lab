import { useEffect, useRef, useState } from 'react'

/** Cuánto se ven los lugares vacíos al cambiar de pestaña: lo justo para que se note que la lista se actualizó. */
export const BRIEF_LOADING_MS = 1000

/**
 * Verdadero durante un momento después de que `key` cambia (otra pestaña, otro filtro): la lista muestra lugares vacíos (`Skeleton`) en vez de saltar de golpe al contenido nuevo, así quien mira
 * entiende que se actualizó. No cuenta la primera vez que se dibuja la pantalla.
 */
export function useBriefLoading(key: string, ms = BRIEF_LOADING_MS): boolean {
  const [loading, setLoading] = useState(false)
  const previous = useRef(key)

  useEffect(() => {
    if (previous.current === key) {
      return
    }

    previous.current = key

    setLoading(true)
    const id = window.setTimeout(() => setLoading(false), ms)

    return () => window.clearTimeout(id)
  }, [key, ms])

  return loading
}

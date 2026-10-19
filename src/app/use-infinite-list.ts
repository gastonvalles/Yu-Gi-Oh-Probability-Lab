import { useCallback, useEffect, useRef, useState } from 'react'

/**
 * Scroll infinito de una lista que ya está en memoria: muestra `pageSize` y, cuando el final (el `sentinel`, un elemento que se pone justo abajo de lo mostrado) se acerca a la pantalla
 * (a `ahead` px de verse), suma otra página; si con eso todavía no se llena la pantalla, sigue. Cambiar `resetKey` (otro filtro, otra búsqueda) vuelve a la primera página.
 * Sin `IntersectionObserver` (o con un lector de pantalla, que no scrollea) queda `loadMore` para pedir más a mano.
 */
export function useInfiniteList(total: number, pageSize: number, resetKey: string, ahead = 600) {
  const [limit, setLimit] = useState(pageSize)
  const sentinel = useRef<HTMLDivElement | null>(null)
  const hasMore = limit < total

  useEffect(() => {
    setLimit(pageSize)
  }, [resetKey, pageSize])

  const loadMore = useCallback(() => setLimit((current) => Math.min(Math.max(total, pageSize), current + pageSize)), [total, pageSize])

  useEffect(() => {
    const node = sentinel.current

    if (!node || !hasMore || typeof IntersectionObserver === 'undefined') {
      return
    }

    // Se mira otra vez cada vez que crece la lista: si el final sigue cerca de la pantalla, el observador avisa de nuevo y se carga la página que sigue.
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) loadMore()
      },
      { rootMargin: `0px 0px ${ahead}px 0px` },
    )

    observer.observe(node)

    return () => observer.disconnect()
  }, [hasMore, limit, loadMore, ahead])

  return { limit, hasMore, loadMore, sentinel }
}

import { useEffect, type RefObject } from 'react'

const LOAD_MORE_THRESHOLD_PX = 180
const UNDERFILLED_MARGIN_PX = 48

interface InfiniteScrollOptions {
  containerRef: RefObject<HTMLElement | null>
  /** true cuando hay más páginas y no se está cargando ninguna. */
  canLoadMore: boolean
  onLoadMore: () => void
  /** Cambia cuando cambia lo que se muestra (cantidad de items, filtros abiertos...). */
  layoutKey: unknown
}

/**
 * Pide la siguiente página al acercarse al final del contenedor, y también
 * cuando el contenido no alcanza para scrollear (o no hay nada visible porque
 * un filtro local ocultó todo lo cargado).
 */
export function useInfiniteScroll({ containerRef, canLoadMore, onLoadMore, layoutKey }: InfiniteScrollOptions): void {
  useEffect(() => {
    const container = containerRef.current

    if (!container || !canLoadMore) {
      return
    }

    const handleScroll = () => {
      const distanceToBottom = container.scrollHeight - container.scrollTop - container.clientHeight

      if (distanceToBottom <= LOAD_MORE_THRESHOLD_PX) {
        onLoadMore()
      }
    }

    container.addEventListener('scroll', handleScroll, { passive: true })
    return () => container.removeEventListener('scroll', handleScroll)
  }, [canLoadMore, containerRef, layoutKey, onLoadMore])

  useEffect(() => {
    if (!canLoadMore) {
      return
    }

    const container = containerRef.current

    if (!container || container.scrollHeight <= container.clientHeight + UNDERFILLED_MARGIN_PX) {
      onLoadMore()
    }
  }, [canLoadMore, containerRef, layoutKey, onLoadMore])
}

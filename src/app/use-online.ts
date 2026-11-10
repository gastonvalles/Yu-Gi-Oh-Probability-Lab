import { useSyncExternalStore } from 'react'

/**
 * Si hay red según el navegador: sólo un `false` explícito es «sin conexión» (sin `navigator`, como en las pruebas de un módulo, se supone que sí).
 * `navigator.onLine` a veces miente («lie-fi»: conectado a una red que no lleva a ningún lado): alcanza para el aviso y para no ofrecer lo que seguro
 * falla; cada pedido sigue manejando su propio error.
 */
export function isOnline(nav: { onLine?: boolean } | undefined): boolean {
  return nav?.onLine !== false
}

function subscribe(onChange: () => void): () => void {
  window.addEventListener('online', onChange)
  window.addEventListener('offline', onChange)

  return () => {
    window.removeEventListener('online', onChange)
    window.removeEventListener('offline', onChange)
  }
}

/** Si hay red, y se actualiza con los eventos `online` y `offline` de la ventana. */
export function useOnline(): boolean {
  return useSyncExternalStore(subscribe, () => isOnline(typeof navigator === 'undefined' ? undefined : navigator), () => true)
}

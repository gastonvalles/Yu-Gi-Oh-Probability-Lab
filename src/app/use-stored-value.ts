import { useEffect, useState } from 'react'

/**
 * Un valor guardado en el navegador, al día: se lee al montar y se vuelve a leer cuando esta pestaña avisa que cambió (`event`, en `window`)
 * o cuando otra pestaña cambia esa clave de `localStorage` (`key`). El estado vive en el hook: no hay copia global en memoria.
 */
export function useStoredValue<T>(read: () => T, event: string, key?: string): T {
  const [value, setValue] = useState(read)

  useEffect(() => {
    const refresh = () => setValue(read())
    // `key` null: otra pestaña borró todo el almacenamiento.
    const onStorage = (storageEvent: StorageEvent) => {
      if (key !== undefined && (storageEvent.key === key || storageEvent.key === null)) {
        refresh()
      }
    }

    window.addEventListener(event, refresh)
    window.addEventListener('storage', onStorage)

    return () => {
      window.removeEventListener(event, refresh)
      window.removeEventListener('storage', onStorage)
    }
  }, [event, key, read])

  return value
}

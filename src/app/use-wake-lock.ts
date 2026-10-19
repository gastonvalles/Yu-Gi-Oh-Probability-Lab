import { useEffect } from 'react'

/**
 * Mantiene la pantalla encendida mientras `active`: en un duelo (la sala, la mesa, mirando) o en la práctica el celular no se apaga aunque nadie lo toque durante un rato,
 * porque se piensa y se espera al rival sin tocar la pantalla. Usa la API de «bloqueo de pantalla» del navegador; donde no existe, o no la concede (ahorro de batería),
 * no pasa nada: la pantalla se apaga como siempre. El navegador suelta el bloqueo solo cuando la pestaña se oculta: al volver se pide de nuevo.
 */
export function useWakeLock(active: boolean): void {
  useEffect(() => {
    if (!active || typeof navigator === 'undefined' || !navigator.wakeLock) {
      return
    }

    let sentinel: WakeLockSentinel | null = null
    let cancelled = false

    const acquire = async () => {
      try {
        const lock = await navigator.wakeLock.request('screen')

        if (cancelled) {
          void lock.release().catch(() => undefined)
        } else {
          sentinel = lock
        }
      } catch {
        // Sin permiso o con el ahorro de batería: se sigue sin bloqueo.
      }
    }

    const reacquire = () => {
      if (document.visibilityState === 'visible' && (sentinel === null || sentinel.released)) {
        void acquire()
      }
    }

    void acquire()
    document.addEventListener('visibilitychange', reacquire)

    return () => {
      cancelled = true
      document.removeEventListener('visibilitychange', reacquire)
      void sentinel?.release().catch(() => undefined)
      sentinel = null
    }
  }, [active])
}

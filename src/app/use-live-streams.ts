import { useEffect, useState } from 'react'

import { fetchLiveStreams, type LiveStreams } from './live-streams'

export type LiveState = { status: 'loading' } | ({ status: 'ready' } & LiveStreams)

/** Cada cuánto se vuelve a mirar qué hay al aire (el CDN guarda la respuesta unos segundos: pedir más seguido no gasta más a YouTube). */
const POLL_MS = 60_000

/**
 * Qué transmisiones en vivo hay ahora: se mira al abrir, cada minuto mientras la pestaña se ve y al volver a ella. Si una vuelta falla se conserva lo último que se supo
 * (con `ok: false`, para avisar sólo si no había nada que mostrar).
 */
export function useLiveStreams(load: () => Promise<LiveStreams> = fetchLiveStreams): LiveState {
  const [state, setState] = useState<LiveState>({ status: 'loading' })

  useEffect(() => {
    let cancelled = false

    const check = () => {
      void load().then(
        (result) => {
          if (!cancelled) setState({ status: 'ready', ...result })
        },
        () => {
          if (!cancelled) setState((current) => (current.status === 'ready' ? { ...current, ok: false } : { status: 'ready', ok: false, checkedAt: '', streams: [] }))
        },
      )
    }
    const checkIfVisible = () => {
      if (document.visibilityState === 'visible') check()
    }

    check()
    const timer = window.setInterval(checkIfVisible, POLL_MS)

    document.addEventListener('visibilitychange', checkIfVisible)

    return () => {
      cancelled = true
      window.clearInterval(timer)
      document.removeEventListener('visibilitychange', checkIfVisible)
    }
  }, [load])

  return state
}

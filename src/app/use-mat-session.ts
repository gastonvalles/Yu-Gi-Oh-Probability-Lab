import { useCallback, useMemo, useState } from 'react'

import { replayMat, type MatAction, type MatState } from './practice-mat'

/**
 * Una partida en la mesa: la mesa inicial y las jugadas. `cursor` dice hasta qué jugada se ve:
 * igual a la cantidad de jugadas es "en vivo"; menos, se está reproduciendo un combo.
 */
export interface MatSession {
  initial: MatState
  actions: MatAction[]
  cursor: number
  /** Nombres de las cartas de un combo cargado (por si alguna ya no está en el deck). */
  names: Record<string, string>
  /** Se está viendo un combo guardado (la mesa arrancó con jugadas): sólo entonces se muestran los controles de replay. */
  replay: boolean
}

const clamp = (value: number, max: number) => Math.min(Math.max(0, Math.trunc(value)), max)

export function useMatSession() {
  const [session, setSession] = useState<MatSession | null>(null)
  const state = useMemo(() => (session ? replayMat(session.initial, session.actions, session.cursor) : null), [session])

  /** Nueva mesa; con jugadas (un combo cargado) arranca en el paso 0 para reproducirlo. `live`: sigue en vivo después de la última (la partida que viene del automático). */
  const start = useCallback((initial: MatState, actions: MatAction[] = [], names: Record<string, string> = {}, live = false) => {
    setSession({ initial, actions, cursor: live ? actions.length : 0, names, replay: !live && actions.length > 0 })
  }, [])

  /** Una jugada nueva: lo que seguía en una reproducción se descarta (el combo guardado no cambia). */
  const dispatch = useCallback((action: MatAction) => {
    setSession((current) => current && { ...current, actions: [...current.actions.slice(0, current.cursor), action], cursor: current.cursor + 1 })
  }, [])

  const seek = useCallback((step: number) => {
    setSession((current) => current && { ...current, cursor: clamp(step, current.actions.length) })
  }, [])

  /** En vivo borra la última jugada; reproduciendo, vuelve un paso. */
  const undo = useCallback(() => {
    setSession((current) => {
      if (!current || current.cursor === 0) {
        return current
      }

      const live = current.cursor === current.actions.length
      return { ...current, actions: live ? current.actions.slice(0, -1) : current.actions, cursor: current.cursor - 1 }
    })
  }, [])

  const clear = useCallback(() => setSession(null), [])

  return { session, state, start, dispatch, seek, undo, clear }
}

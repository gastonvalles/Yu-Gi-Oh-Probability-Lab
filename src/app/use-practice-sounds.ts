import { useEffect, useRef } from 'react'

import { unlockAudio } from './audio'
import { playSfx, sfxOfAction } from './sfx'
import type { MatSession } from './use-mat-session'

/**
 * Los sonidos de «Jugar solo» y de los combos guardados: cada jugada suena como en un duelo (`sfxOfAction`), también al reproducir un combo paso a paso; deshacer o volver un paso suena
 * el deshacer. Un salto (otro paso de la línea de tiempo, una mano nueva, otro combo) no suena. Con `null` (no hay mesa, o es un duelo, que suena con `useDuelSounds`) tampoco. Con los
 * sonidos apagados en `sound-prefs` no suena nada, y el primer toque o tecla desbloquea el audio.
 */
export function usePracticeSounds(session: Pick<MatSession, 'initial' | 'actions' | 'cursor'> | null): void {
  const seen = useRef<{ initial: MatSession['initial']; cursor: number } | null>(null)
  const active = session !== null

  useEffect(() => {
    const before = seen.current

    seen.current = session && { initial: session.initial, cursor: session.cursor }

    // Lo que ya estaba al abrir la mesa, o una mesa distinta (mano nueva, otro combo), no es una jugada.
    if (!session || !before || before.initial !== session.initial) {
      return
    }

    if (session.cursor === before.cursor + 1) {
      const sfx = sfxOfAction(session.actions[session.cursor - 1]!)

      if (sfx) {
        playSfx(sfx)
      }
    } else if (session.cursor === before.cursor - 1) {
      playSfx('undo')
    }
  }, [session])

  useEffect(() => {
    if (!active) {
      return
    }

    // Se desbloquea ya (el toque que abrió la mesa vale) para que el reparto de la mano suene, y de nuevo con el primer toque o tecla (iOS lo exige).
    unlockAudio()
    window.addEventListener('pointerdown', unlockAudio)
    window.addEventListener('keydown', unlockAudio)

    return () => {
      window.removeEventListener('pointerdown', unlockAudio)
      window.removeEventListener('keydown', unlockAudio)
    }
  }, [active])
}

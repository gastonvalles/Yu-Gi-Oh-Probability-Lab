import { useEffect } from 'react'

import { unlockAudio } from './audio'

/**
 * Mientras `active`, el primer toque o tecla desbloquea el audio (iOS lo exige). Con `now`, también se desbloquea al activarse
 * (el toque que abrió la mesa vale), para que lo primero que suena —el reparto de la mano— ya se escuche.
 */
export function useUnlockAudio(active: boolean, now = false): void {
  useEffect(() => {
    if (!active) {
      return
    }

    if (now) {
      unlockAudio()
    }

    window.addEventListener('pointerdown', unlockAudio)
    window.addEventListener('keydown', unlockAudio)

    return () => {
      window.removeEventListener('pointerdown', unlockAudio)
      window.removeEventListener('keydown', unlockAudio)
    }
  }, [active, now])
}

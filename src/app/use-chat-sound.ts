import { useEffect, useRef } from 'react'

import { unlockAudio } from './audio'
import { playChatSound } from './chat-sound'
import type { ChatLine } from './duel-games'

/**
 * Un sonido sutil por cada mensaje nuevo del chat, tuyo o del rival (también las reacciones): distinto para cada uno. Lo que ya estaba escrito al abrir la pantalla no suena.
 * Sin `chat` (no hay sala, o se mira como espectador) no suena nada. El primer toque o tecla de la página desbloquea el audio (iOS lo exige).
 */
export function useChatSound(chat: readonly ChatLine[] | undefined, me: ChatLine['from'] | undefined): void {
  const active = chat !== undefined
  const last = chat?.at(-1)?.id ?? 0
  const seen = useRef(last)

  useEffect(() => {
    if (!chat) {
      return
    }

    for (const line of chat) {
      if (line.id > seen.current) {
        playChatSound(line.from === me ? 'mine' : 'theirs')
      }
    }

    seen.current = Math.max(seen.current, last)
  }, [chat, last, me])

  useEffect(() => {
    if (!active) {
      return
    }

    window.addEventListener('pointerdown', unlockAudio)
    window.addEventListener('keydown', unlockAudio)

    return () => {
      window.removeEventListener('pointerdown', unlockAudio)
      window.removeEventListener('keydown', unlockAudio)
    }
  }, [active])
}

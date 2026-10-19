import { useEffect, useRef } from 'react'

import { unlockAudio } from './audio'
import { duelResult } from './duel-games'
import type { DuelSnapshot } from './duel-session'
import { playSfx, sfxOfAction } from './sfx'
import type { MatAction } from './practice-mat'

/**
 * Lo último que se vio de algo, para sonar sólo lo que cambia después: `undefined` hasta la primera vez que hay algo que mirar (lo que ya estaba al abrir la pantalla o al reconectar
 * no suena) y otra vez `undefined` si deja de haberlo.
 */
function useChange<T>(value: T | undefined, onChange: (before: T, now: T) => void) {
  const seen = useRef<T | undefined>(undefined)

  useEffect(() => {
    const before = seen.current

    seen.current = value

    if (before !== undefined && value !== undefined) {
      onChange(before, value)
    }
  })
}

/** Suena la última jugada cuando la lista creció de a una; si se achicó (deshacer) suena el deshacer, y un salto (la mesa repuesta al reconectar) no suena. */
function useActionSound(actions: readonly MatAction[] | undefined) {
  useChange(actions?.length, (before, count) => {
    if (count < before) {
      playSfx('undo')
    } else if (count === before + 1) {
      const sfx = sfxOfAction(actions![count - 1]!)

      if (sfx) {
        playSfx(sfx)
      }
    }
  })
}

/**
 * Los sonidos del duelo: cada jugada de la mesa (tuya y del rival), deshacer, los puntos de vida que suben o bajan, la moneda y el dado, y cómo termina el duelo. Lo que ya había
 * pasado al abrir la pantalla (o al reconectar) no suena. Apagados en `sound-prefs` no suena nada. Con `null` (no hay mesa) tampoco, y el primer toque o tecla desbloquea el audio.
 */
export function useDuelSounds(snapshot: DuelSnapshot | null): void {
  const active = snapshot !== null
  const me = snapshot?.me
  const lp = snapshot?.life.lp
  const lastGame = snapshot ? (snapshot.games.at(-1)?.id ?? 0) : undefined
  const result = snapshot ? duelResult(snapshot.life.lp, snapshot.conceded) : null
  const resultKey = snapshot ? (result === null ? 'none' : result.kind === 'draw' ? 'draw' : `loss${result.loser}`) : undefined

  useActionSound(snapshot?.actions)
  useActionSound(snapshot?.theirs?.acts)

  // Los puntos de vida de cada uno: bajan (golpe grave) o suben (campanita). Con el duelo terminado no suena (la revancha los vuelve a 8000).
  useChange(lp && ([...lp] as const), (before, now) => {
    if (before.some((points) => points <= 0)) {
      return
    }

    if (now.some((points, side) => points < before[side]!)) {
      playSfx('lpDown')
    } else if (now.some((points, side) => points > before[side]!)) {
      playSfx('lpUp')
    }
  })

  // La moneda y el dado (los míos y los del rival).
  useChange(lastGame, (before, now) => {
    if (now > before && snapshot!.games.some((entry) => entry.id > before && (entry.game.kind === 'coin' || entry.game.kind === 'die'))) {
      playSfx('dice')
    }
  })

  // Cómo terminó el duelo: la victoria o la derrota (un empate suena como el cambio de turno).
  useChange(resultKey, (before, now) => {
    if (now === before || now === 'none' || me === undefined) {
      return
    }

    playSfx(now === 'draw' ? 'turn' : now === `loss${me}` ? 'lose' : 'win')
  })

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

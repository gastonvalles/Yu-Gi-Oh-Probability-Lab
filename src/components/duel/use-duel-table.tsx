import { useCallback, useEffect, useMemo, useRef, useState } from 'react'

import { rpsOutcome } from '../../app/duel-games'
import type { Duel, DuelSnapshot } from '../../app/duel-session'
import { isEmojiSignal, isSignal } from '../../app/duel-signals'
import { showToastMessage } from '../../app/use-toast-message'
import { t } from '../../i18n'
import { SIGNAL_MS } from './DuelBar'
import { gameText, outcomeText, rpsName } from './game-text'

/**
 * El duelo en pausa detiene el reloj de la ronda: lo para quien se queda y lo retoma cuando vuelve el que faltaba. Sólo retoma si lo había parado él (un reloj que
 * ya estaba pausado a mano sigue así).
 */
export function useClockPause(duel: Duel, snapshot: DuelSnapshot, paused: boolean) {
  const stopped = useRef(false)
  const running = snapshot.life.timer.running

  useEffect(() => {
    if (paused && running) {
      stopped.current = true
      duel.toggleClock()
    } else if (!paused && stopped.current) {
      stopped.current = false

      if (!running) {
        duel.toggleClock()
      }
    }
  }, [duel, paused, running])
}

/**
 * El reloj de la ronda arranca solo cuando los dos tienen su mano (lo pone en marcha el anfitrión y el invitado lo recibe): nadie tiene que acordarse de
 * apretar play. Sólo si el reloj está en cero y parado; si alguien ya lo pausó o lo reinició a mano, no se toca.
 */
export function useAutoStartClock(duel: Duel, snapshot: DuelSnapshot) {
  const checked = useRef(false)
  const { role, life } = snapshot

  useEffect(() => {
    if (checked.current) {
      return
    }

    checked.current = true

    if (role === 'host' && !life.timer.running && life.timer.elapsedMs === 0) {
      duel.toggleClock()
    }
  }, [duel, role, life.timer.running, life.timer.elapsedMs])
}

/**
 * Avisos de lo que hace el rival fuera de las cartas (moneda, dado, su elección en piedra-papel-tijera, quién empieza, una señal) y de cómo salió la ronda,
 * para verlos aunque el panel de juegos esté cerrado. Lo que ya estaba en el registro al abrir la pantalla no se avisa.
 */
export function useGameToasts(snapshot: DuelSnapshot, myName: string) {
  const { games, rps, peerName, me } = snapshot
  const seen = useRef(games.at(-1)?.id ?? 0)
  const rival = peerName ?? t('duel.bar.rival')

  useEffect(() => {
    const nameOf = (player: 0 | 1) => (player === me ? myName : rival)

    for (const entry of games) {
      if (entry.id > seen.current && entry.from !== me) {
        showToastMessage(gameText(entry, nameOf), 'info')
      }
    }

    seen.current = Math.max(seen.current, games.at(-1)?.id ?? 0)
  }, [games, me, myName, rival])

  const outcome = rpsOutcome(rps.mine, rps.theirs)

  useEffect(() => {
    if (outcome && rps.mine && rps.theirs) {
      showToastMessage(t('duel.games.log.rpsResult', { mine: rpsName(rps.mine), theirs: rpsName(rps.theirs), outcome: outcomeText(outcome) }), outcome === 'win' ? 'success' : 'info')
    }
  }, [outcome, rps.mine, rps.theirs])
}

/** Lo último que tocó el rival (cualquier emoji de señal): en escritorio se muestra grande en el medio de la pantalla un momento (o hasta que se lo toca). */
const BURST_MS = 2200

export function useSignals(snapshot: DuelSnapshot): { mine: string | null; theirs: string | null; mineKey: number; theirsKey: number; burst: { emoji: string; key: number } | null; dismissBurst: () => void } {
  const { chat, me } = snapshot
  const last = chat.at(-1)?.id ?? 0
  const seen = useRef(last)
  const [shown, setShown] = useState<{ mine: string | null; theirs: string | null; mineKey: number; theirsKey: number }>({ mine: null, theirs: null, mineKey: 0, theirsKey: 0 })
  const [burst, setBurst] = useState<{ emoji: string; key: number } | null>(null)

  useEffect(() => {
    const fresh = chat.filter((line) => line.id > seen.current && isSignal(line.text))
    const rivalEmoji = chat.filter((line) => line.id > seen.current && line.from !== me && isEmojiSignal(line.text)).at(-1)

    seen.current = Math.max(seen.current, last)

    if (rivalEmoji) {
      setBurst({ emoji: rivalEmoji.text, key: rivalEmoji.id })
    }

    if (fresh.length > 0) {
      const line = fresh[fresh.length - 1]!

      // Cada señal lleva el número de su línea: el globo de ese lado vuelve a entrar aunque diga lo mismo que el anterior (cae dentro de su fundido).
      setShown((current) => (line.from === me ? { ...current, mine: line.text, mineKey: line.id } : { ...current, theirs: line.text, theirsKey: line.id }))
    }
  }, [chat, last, me])

  useEffect(() => {
    if (shown.mine === null && shown.theirs === null) return

    const id = setTimeout(() => setShown((current) => ({ ...current, mine: null, theirs: null })), SIGNAL_MS)
    return () => clearTimeout(id)
  }, [shown])

  useEffect(() => {
    if (burst === null) return

    const id = setTimeout(() => setBurst(null), BURST_MS)
    return () => clearTimeout(id)
  }, [burst])

  const dismissBurst = useCallback(() => setBurst(null), [])

  return useMemo(() => ({ ...shown, burst, dismissBurst }), [shown, burst, dismissBurst])
}

/**
 * El emoji que toca el rival, grande y en el medio de la pantalla, sólo en escritorio (en el celular sale como un mensaje más, en la línea del registro). Se va solo, o al tocarlo:
 * el resto de la pantalla no recibe toques de menos, sólo el emoji.
 */
export function RivalEmoji({ burst, name, onDismiss }: { burst: { emoji: string; key: number } | null; name: string; onDismiss: () => void }) {
  if (burst === null) return null

  return (
    <div key={burst.key} data-testid="rival-emoji" aria-live="polite" className="pointer-events-none fixed inset-0 z-60 grid place-items-center">
      <button type="button" aria-label={t('duel.emoji.close', { name, emoji: burst.emoji })} className="pointer-events-auto grid cursor-pointer justify-items-center gap-1 rounded-card animate-linger focus-visible:outline-none focus-visible:shadow-focus motion-reduce:animate-none" style={{ animationDuration: `${BURST_MS}ms` }} onClick={onDismiss}>
        <span aria-hidden="true" style={{ fontSize: 'clamp(7rem, 38vw, 12rem)' }} className="leading-none drop-shadow-[0_8px_24px_rgba(0,0,0,0.55)]">
          {burst.emoji}
        </span>
        <span className="rounded-full bg-card-background/90 px-3 py-1 text-body font-semibold text-foreground">{name}</span>
      </button>
    </div>
  )
}
